import json
import openai
from openai import OpenAI
from models.summary import StructuredOutput

# Module-level singleton - one client for the lifetime of the process.
# TO DO: when testing, pass a mock client in tests via generate_summary(..., client=mock).
_client = OpenAI()

# Deriving the JSON schema directly from the Pydantic model so the prompt and the parser are guaranteed to describe the same structure
_SCHEMA = json.dumps(StructuredOutput.model_json_schema(), indent=2)

# System instructions that define the summary style and required output sections.
SYSTEM_PROMPT = f"""
You are a clinical documentation assistant.

Your response MUST be a single JSON object that strictly conforms to the following JSON schema. 
Do not include any text, explanation, markdown, or code fences before or after the JSON object. 
The JSON object is your entire response.

Schema:
{_SCHEMA}

Content rules:
- doctor_summary: concise clinical summary for the doctor's records.
- next_steps_for_doctor: concrete action items for the doctor.
- patient_email_draft.subject: a clear, specific email subject line.
- patient_email_draft.body: written in plain, empathetic language a
  non-medical reader can understand. No jargon.
- safety_flags.has_flags: true if any flags apply, otherwise false.
- safety_flags.flags: empty array if has_flags is false.
- Flag unclear_language if the notes contain ambiguous clinical terms.
- Flag missing_follow_up if follow-up seems necessary but is not mentioned.
- Flag risky_interpretation if the summary infers beyond what the notes state.
"""


def generate_summary(
    patient_name: str,
    date_of_visit: str,
    notes: str,
    client: OpenAI = None,  # innjectable for testing
) -> StructuredOutput:
    client = OpenAI()  # Creates an OpenAI client for the LLM request

    # Builds the user prompt from the consultation context.
    user_prompt = f"""Patient Name: {patient_name}
Date of Visit: {date_of_visit}
Notes:
{notes}"""

    try:
        # Calls the model and ask it to parse the response directly into the Pydantic schema
        response = client.beta.chat.completions.parse(
            model="gpt-5-nano",
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt},
            ],
            response_format=StructuredOutput,  # Pydantic model passed directly
        )
    except openai.LengthFinishReasonError:
        raise ValueError(
            "Summary generation failed: response was cut off before the schema was complete. Try shortening the consultation notes."
        )
    except openai.ContentFilterFinishReasonError:
        raise ValueError(
            "Summary generation failed: the content was flagged by the model's safety filter. Please review the consultation notes."
        )
    # Returns the parsed structured summary
    return response.choices[0].message.parsed

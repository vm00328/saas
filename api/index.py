from fastapi import FastAPI  # type: ignore
from fastapi.responses import StreamingResponse  # type: ignore
from openai import OpenAI  # type: ignore

app = FastAPI()


@app.get("/api")
def idea():
    client = OpenAI()
    prompt = [
        {
            "role": "user",
            "content": "Come up with a new business idea acting as a second source of income - ideally one that does not require a lot of upfront investment. Your response shall be formatted with headings, sub-headings and bullet points",
        }
    ]
    stream = client.chat.completions.create(
        model="gpt-5-nano", messages=prompt, stream=True
    )

    def event_stream():
        for chunk in stream:
            text = chunk.choices[0].delta.content
            if text:
                lines = text.split("\n")
                for line in lines:
                    yield f"data: {line}\n"
                yield "\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")

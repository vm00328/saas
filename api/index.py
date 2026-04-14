from fastapi import FastAPI  # type: ignore
from fastapi.responses import PlainTextResponse  # type: ignore
from openai import OpenAI  # type: ignore

app = FastAPI()


@app.get("/api", response_class=PlainTextResponse)
def idea():
    client = OpenAI()
    prompt = [
        {
            "role": "user",
            "content": "Come up with a new business idea acting as a second source of income - ideally one that does not require a lot of upfront investment.",
        }
    ]
    response = client.chat.completions.create(model="gpt-5-nano", messages=prompt)
    return response.choices[0].message.content

import os
from fastapi import FastAPI, Depends
from fastapi.responses import StreamingResponse
from fastapi_clerk_auth import (
    ClerkConfig,
    ClerkHTTPBearer,
    HTTPAuthorizationCredentials,
)
from openai import OpenAI

app = FastAPI()

clerk_config = ClerkConfig(jwks_url=os.getenv("CLERK_JWKS_URL"))
clerk_guard = ClerkHTTPBearer(clerk_config)


@app.get("/api")
def idea(
    creds: HTTPAuthorizationCredentials = Depends(clerk_guard),
):  # Protecting the endpoint with Clerk authentication
    user_id = creds.decoded[
        "sub"
    ]  # User ID from JWT for potential future functionality
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

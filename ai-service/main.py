"""Healthcare Portal AI Service — FastAPI application."""

import os
import hmac
from typing import Optional

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, HTTPException, status
from pydantic import BaseModel

from assistant import assist_appointment
from summarizer import summarize_document

load_dotenv()

app = FastAPI(
    title="Healthcare Portal AI Service",
    description="AI layer for document summarization and appointment assistance",
    version="1.0.0",
)

class SummarizeRequest(BaseModel):
    text: str
    file_name: Optional[str] = None


class AssistRequest(BaseModel):
    query: str
    doctors: Optional[list] = None


async def authenticate_service(x_ai_service_token: str = Header(default="")):
    expected_token = os.getenv("AI_SERVICE_TOKEN", "")
    if not expected_token:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI service authentication is not configured",
        )
    if not hmac.compare_digest(x_ai_service_token, expected_token):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Service authentication required",
        )


@app.get("/health")
async def health():
    return {"status": "ok", "service": "healthcare-ai-service"}


@app.post("/summarize", dependencies=[Depends(authenticate_service)])
async def summarize(req: SummarizeRequest):
    """Summarize a medical document into plain-language key info."""
    result = await summarize_document(req.text, req.file_name)
    return result


@app.post("/assist", dependencies=[Depends(authenticate_service)])
async def assist(req: AssistRequest):
    """AI appointment assistant — natural language doctor discovery."""
    result = await assist_appointment(req.query, req.doctors)
    return result


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)

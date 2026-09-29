"""Healthcare Portal AI Service — FastAPI application."""

import base64
import binascii
import os
import hmac
from typing import Literal, Optional

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, HTTPException, status
from pydantic import BaseModel, Field, model_validator
from starlette.concurrency import run_in_threadpool

from assistant import assist_appointment
from summarizer import extract_document_text, summarize_document

load_dotenv()

app = FastAPI(
    title="Healthcare Portal AI Service",
    description="AI layer for document summarization and appointment assistance",
    version="1.0.0",
)

class SummarizeRequest(BaseModel):
    text: Optional[str] = Field(default=None, max_length=20000)
    file_type: Optional[Literal["application/pdf", "image/jpeg", "image/png"]] = None
    content_base64: Optional[str] = Field(default=None, max_length=14 * 1024 * 1024)

    @model_validator(mode="after")
    def validate_input(self):
        if self.content_base64 is not None:
            if self.file_type is None or self.text is not None:
                raise ValueError("Provide one supported document payload")
        elif not isinstance(self.text, str) or not self.text.strip():
            raise ValueError("Document text is required")
        return self


class SummaryResponse(BaseModel):
    documentType: str = Field(min_length=1, max_length=200)
    keyInfo: list[str] = Field(max_length=10)
    abnormalValues: list[str] = Field(max_length=10)
    followUp: str = Field(max_length=2000)
    disclaimer: str = Field(min_length=1, max_length=1000)


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


@app.post(
    "/summarize",
    dependencies=[Depends(authenticate_service)],
    response_model=SummaryResponse,
)
async def summarize(req: SummarizeRequest):
    """Summarize a medical document into plain-language key info."""
    text = req.text
    if req.content_base64 is not None:
        try:
            content = base64.b64decode(req.content_base64, validate=True)
        except (binascii.Error, ValueError):
            raise HTTPException(status_code=422, detail="Invalid document payload")
        if not content or len(content) > 10 * 1024 * 1024:
            raise HTTPException(status_code=422, detail="Invalid document payload")
        try:
            text = await run_in_threadpool(
                extract_document_text, content, req.file_type
            )
        except Exception:
            raise HTTPException(status_code=422, detail="Document is unreadable")

    result = await summarize_document(text)
    try:
        return SummaryResponse.model_validate(result)
    except Exception:
        raise HTTPException(status_code=502, detail="Summary generation failed")


@app.post("/assist", dependencies=[Depends(authenticate_service)])
async def assist(req: AssistRequest):
    """AI appointment assistant — natural language doctor discovery."""
    result = await assist_appointment(req.query, req.doctors)
    return result


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)

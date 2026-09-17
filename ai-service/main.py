"""Healthcare Portal AI Service — FastAPI application."""

import os
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from assistant import assist_appointment
from summarizer import summarize_document

load_dotenv()

app = FastAPI(
    title="Healthcare Portal AI Service",
    description="AI layer for document summarization and appointment assistance",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class SummarizeRequest(BaseModel):
    text: str
    file_name: Optional[str] = None


class AssistRequest(BaseModel):
    query: str
    doctors: Optional[list] = None


@app.get("/health")
async def health():
    return {"status": "ok", "service": "healthcare-ai-service"}


@app.post("/summarize")
async def summarize(req: SummarizeRequest):
    """Summarize a medical document into plain-language key info."""
    result = await summarize_document(req.text, req.file_name)
    return result


@app.post("/assist")
async def assist(req: AssistRequest):
    """AI appointment assistant — natural language doctor discovery."""
    result = await assist_appointment(req.query, req.doctors)
    return result


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)

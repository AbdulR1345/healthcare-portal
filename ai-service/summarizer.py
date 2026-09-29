"""Medical document summarization module."""

import os
import re
import io
from typing import Optional

DISCLAIMER = (
    "For informational purposes only. This AI summary is not a substitute "
    "for professional medical advice, diagnosis, or treatment."
)

MAX_EXTRACTED_TEXT = 20000


def extract_document_text(content: bytes, file_type: str) -> str:
    """Extract bounded text from supported private document bytes."""
    if file_type == "application/pdf":
        from pypdf import PdfReader

        if not content.startswith(b"%PDF-"):
            raise ValueError("Invalid PDF signature")
        reader = PdfReader(io.BytesIO(content), strict=True)
        if len(reader.pages) > 100:
            raise ValueError("PDF page limit exceeded")
        extracted = "\n".join(
            (page.extract_text() or "") for page in reader.pages
        )[:MAX_EXTRACTED_TEXT]
    elif file_type in ("image/jpeg", "image/png"):
        from PIL import Image
        import pytesseract

        image = Image.open(io.BytesIO(content))
        expected_format = "JPEG" if file_type == "image/jpeg" else "PNG"
        if image.format != expected_format:
            raise ValueError("Image format mismatch")
        if image.width * image.height > 25000000:
            raise ValueError("Image pixel limit exceeded")
        extracted = pytesseract.image_to_string(image)[:MAX_EXTRACTED_TEXT]
    else:
        raise ValueError("Unsupported document type")

    if not extracted.strip():
        raise ValueError("No readable text found")
    return extracted


def extract_key_patterns(text: str) -> dict:
    """Rule-based extraction when LLM is unavailable."""
    text_lower = text.lower()

    doc_type = "Medical Report"
    if "blood" in text_lower or "cbc" in text_lower or "hemoglobin" in text_lower:
        doc_type = "Blood Test Report"
    elif "x-ray" in text_lower or "radiograph" in text_lower:
        doc_type = "Radiology Report"
    elif "prescription" in text_lower or "medication" in text_lower:
        doc_type = "Prescription"
    elif "mri" in text_lower or "ct scan" in text_lower:
        doc_type = "Imaging Report"

    key_info = []
    if len(text.strip()) > 10:
        sentences = re.split(r'[.!?\n]+', text.strip())
        key_info = [s.strip() for s in sentences if len(s.strip()) > 15][:5]
    if not key_info:
        key_info = ["Document received and processed", "Review with your healthcare provider"]

    abnormal = []
    abnormal_patterns = [
        (r"high\s+\w+", "Elevated value detected"),
        (r"low\s+\w+", "Below normal range detected"),
        (r"abnormal", "Abnormal finding noted"),
        (r"critical", "Critical value flagged"),
    ]
    for pattern, label in abnormal_patterns:
        if re.search(pattern, text_lower):
            abnormal.append(label)

    follow_up = "Schedule a follow-up with your doctor to discuss these results."
    if not abnormal:
        follow_up = "No immediate concerns detected. Confirm with your healthcare provider."

    return {
        "documentType": doc_type,
        "keyInfo": key_info,
        "abnormalValues": abnormal,
        "followUp": follow_up,
        "disclaimer": DISCLAIMER,
    }


async def summarize_document(text: str, file_name: Optional[str] = None) -> dict:
    """
    Summarize medical document text.
    Uses LLM API when configured, falls back to rule-based extraction.
    """
    api_key = os.getenv("OPENAI_API_KEY")

    if api_key:
        try:
            return await _llm_summarize(text, file_name, api_key)
        except Exception:
            pass

    combined = f"{file_name or 'Document'}: {text}"
    return extract_key_patterns(combined)


async def _llm_summarize(text: str, file_name: Optional[str], api_key: str) -> dict:
    import httpx

    model = os.getenv("LLM_MODEL", "gpt-4o-mini")
    prompt = f"""Analyze this medical document and return a JSON summary.

Document: {file_name or 'Unknown'}
Content: {text[:4000]}

Return JSON with keys:
- documentType: type of medical document
- keyInfo: array of key findings in plain language
- abnormalValues: array of any abnormal or concerning values
- followUp: recommended follow-up actions

Keep language simple for patients. Do not diagnose."""

    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.post(
            "https://api.openai.com/v1/chat/completions",
            headers={"Authorization": f"Bearer {api_key}"},
            json={
                "model": model,
                "messages": [
                    {"role": "system", "content": "You are a medical document assistant. Summarize clearly for patients."},
                    {"role": "user", "content": prompt},
                ],
                "response_format": {"type": "json_object"},
            },
        )
        response.raise_for_status()
        import json
        content = response.json()["choices"][0]["message"]["content"]
        result = json.loads(content)
        result["disclaimer"] = DISCLAIMER
        return result

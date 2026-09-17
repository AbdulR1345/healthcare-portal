"""AI appointment assistant module."""

import os
from typing import Optional

DISCLAIMER = (
    "This assistant helps you find appointments. It does not provide medical advice."
)


async def assist_appointment(
    query: str,
    doctors: Optional[list] = None,
) -> dict:
    """
    Help patients discover doctors and appointment slots via natural language.
    Example: "Cardiologists available this Saturday"
    """
    api_key = os.getenv("OPENAI_API_KEY")
    doctors = doctors or []

    if api_key and doctors:
        try:
            return await _llm_assist(query, doctors, api_key)
        except Exception:
            pass

    return _rule_based_assist(query, doctors)


def _rule_based_assist(query: str, doctors: list) -> dict:
    query_lower = query.lower()
    suggestions = []

    for doc in doctors:
        score = 0
        spec = (doc.get("specialization") or "").lower()
        location = (doc.get("location") or "").lower()
        name = (doc.get("full_name") or doc.get("name") or "").lower()

        if any(word in spec for word in query_lower.split()):
            score += 2
        if any(word in query_lower for word in spec.split()):
            score += 2
        if any(word in location for word in query_lower.split()):
            score += 1
        if any(word in name for word in query_lower.split()):
            score += 1

        specialty_keywords = {
            "cardio": "Cardiology",
            "heart": "Cardiology",
            "skin": "Dermatology",
            "derma": "Dermatology",
            "bone": "Orthopedics",
            "child": "Pediatrics",
            "eye": "Ophthalmology",
        }
        for keyword, specialty in specialty_keywords.items():
            if keyword in query_lower and keyword in spec:
                score += 3

        if score > 0:
            suggestions.append({**doc, "matchScore": score})

    suggestions.sort(key=lambda x: x.get("matchScore", 0), reverse=True)

    response_text = "Here are doctors matching your query:"
    if not suggestions:
        response_text = "I couldn't find an exact match. Try searching by specialization or location."
        suggestions = doctors[:5]

    return {
        "query": query,
        "response": response_text,
        "suggestions": suggestions[:5],
        "disclaimer": DISCLAIMER,
    }


async def _llm_assist(query: str, doctors: list, api_key: str) -> dict:
    import httpx
    import json

    model = os.getenv("LLM_MODEL", "gpt-4o-mini")
    doctors_summary = json.dumps(doctors[:20], default=str)

    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.post(
            "https://api.openai.com/v1/chat/completions",
            headers={"Authorization": f"Bearer {api_key}"},
            json={
                "model": model,
                "messages": [
                    {
                        "role": "system",
                        "content": "You help patients find doctors. Return JSON with 'response' (friendly text) and 'doctorIds' (array of matching doctor IDs).",
                    },
                    {
                        "role": "user",
                        "content": f"Query: {query}\nAvailable doctors: {doctors_summary}",
                    },
                ],
                "response_format": {"type": "json_object"},
            },
        )
        response.raise_for_status()
        content = json.loads(response.json()["choices"][0]["message"]["content"])

        doctor_ids = set(content.get("doctorIds", []))
        matched = [d for d in doctors if d.get("id") in doctor_ids] or doctors[:5]

        return {
            "query": query,
            "response": content.get("response", "Here are some suggestions:"),
            "suggestions": matched,
            "disclaimer": DISCLAIMER,
        }

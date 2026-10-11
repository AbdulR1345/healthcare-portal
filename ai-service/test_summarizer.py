import os
import unittest
from unittest.mock import patch

import httpx

from summarizer import DISCLAIMER, _llm_summarize, extract_key_patterns


class SummarizerTests(unittest.IsolatedAsyncioTestCase):
    def test_rule_based_summary_does_not_infer_no_concerns(self):
        result = extract_key_patterns("A routine report with values documented.")

        self.assertEqual(result["abnormalValues"], [])
        self.assertNotIn("no immediate concerns", result["followUp"].lower())
        self.assertIn("healthcare provider", result["followUp"].lower())

    async def test_llm_request_uses_configured_bearer_token(self):
        requests = []

        def respond(request):
            requests.append(request)
            return httpx.Response(
                200,
                json={
                    "choices": [
                        {
                            "message": {
                                "content": (
                                    '{"documentType":"Report","keyInfo":[]'
                                    ',"abnormalValues":[],"followUp":"Review with a clinician."}'
                                )
                            }
                        }
                    ]
                },
            )

        real_async_client = httpx.AsyncClient
        with patch(
            "httpx.AsyncClient",
            side_effect=lambda **kwargs: real_async_client(
                transport=httpx.MockTransport(respond), **kwargs
            ),
        ), patch.dict(os.environ, {"OPENAI_API_KEY": "unit-test-api-key"}):
            result = await _llm_summarize("Test document text", None, "unit-test-api-key")

        self.assertEqual(len(requests), 1)
        self.assertEqual(
            requests[0].headers["Authorization"], "Bearer unit-test-api-key"
        )
        self.assertEqual(result["disclaimer"], DISCLAIMER)


if __name__ == "__main__":
    unittest.main()

import os
import unittest
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

import main


class ServiceAuthenticationTests(unittest.TestCase):
    def setUp(self):
        self.previous_token = os.environ.get("AI_SERVICE_TOKEN")
        os.environ["AI_SERVICE_TOKEN"] = "unit-test-only-service-token"
        self.client = TestClient(main.app)

    def tearDown(self):
        if self.previous_token is None:
            os.environ.pop("AI_SERVICE_TOKEN", None)
        else:
            os.environ["AI_SERVICE_TOKEN"] = self.previous_token

    def test_summarize_rejects_missing_service_token(self):
        response = self.client.post("/summarize", json={"text": "fixture"})
        self.assertEqual(response.status_code, 401)

    def test_assist_rejects_missing_service_token(self):
        response = self.client.post("/assist", json={"query": "fixture"})
        self.assertEqual(response.status_code, 401)

    def test_summarize_accepts_valid_internal_service_token(self):
        with patch.object(
            main,
            "summarize_document",
            new=AsyncMock(return_value={"documentType": "Test report"}),
        ):
            response = self.client.post(
                "/summarize",
                headers={"X-AI-Service-Token": os.environ["AI_SERVICE_TOKEN"]},
                json={"text": "fixture"},
            )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["documentType"], "Test report")

    def test_unconfigured_service_token_fails_closed(self):
        os.environ.pop("AI_SERVICE_TOKEN", None)
        response = self.client.post(
            "/assist",
            headers={"X-AI-Service-Token": "unit-test-only-service-token"},
            json={"query": "fixture"},
        )
        self.assertEqual(response.status_code, 503)

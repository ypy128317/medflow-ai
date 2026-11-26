from __future__ import annotations

import httpx

from app.services.llm import QwenService


def test_qwen_openai_compatible_payload(monkeypatch):
    captured = {}

    class FakeResponse:
        status_code = 200
        text = ""

        @staticmethod
        def json():
            return {"model": "qwen-plus", "choices": [{"message": {"content": "审批摘要"}}],
                    "usage": {"total_tokens": 42}}

    def fake_post(self, url, headers, json):
        captured.update({"url": url, "headers": headers, "json": json})
        return FakeResponse()

    monkeypatch.setattr(httpx.Client, "post", fake_post)
    service = QwenService()
    service.api_key = "test-key"
    service.base_url = "https://dashscope.aliyuncs.com/compatible-mode/v1"
    service.model = "qwen-plus"
    result = service.complete("system", "user")
    assert result["ok"] is True
    assert result["text"] == "审批摘要"
    assert captured["url"].endswith("/chat/completions")
    assert captured["headers"]["Authorization"] == "Bearer test-key"
    assert captured["json"]["model"] == "qwen-plus"
    assert captured["json"]["messages"][0]["role"] == "system"


def test_qwen_missing_key_falls_back_without_network(monkeypatch):
    called = {"value": False}

    def fake_post(*args, **kwargs):
        called["value"] = True

    monkeypatch.setattr(httpx.Client, "post", fake_post)
    service = QwenService()
    service.api_key = ""
    result = service.complete("system", "user")
    assert result["ok"] is False
    assert "DASHSCOPE_API_KEY" in result["error"]
    assert called["value"] is False

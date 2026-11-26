"""Optional Qwen integration (DashScope OpenAI-compatible API).

Qwen is used for language organization only. All numbers and decisions come
from deterministic services; if the key is missing or the call fails, callers
fall back to a rule-based summary instead of failing the business operation.
"""
from __future__ import annotations

import json
from typing import Any

import httpx

from ..config import DASHSCOPE_API_KEY, QWEN_BASE_URL, QWEN_MODEL, QWEN_TIMEOUT


class QwenService:
    def __init__(self) -> None:
        self.api_key = DASHSCOPE_API_KEY
        self.base_url = QWEN_BASE_URL
        self.model = QWEN_MODEL
        self.timeout = QWEN_TIMEOUT

    @property
    def configured(self) -> bool:
        return bool(self.api_key)

    def status(self) -> dict[str, Any]:
        return {
            "provider": "qwen",
            "configured": self.configured,
            "model": self.model,
            "base_url": self.base_url,
            "mode": "language_organization_only",
        }

    def complete(self, system: str, user: str, max_tokens: int = 500) -> dict[str, Any]:
        if not self.configured:
            return {"ok": False, "text": "", "error": "未配置 DASHSCOPE_API_KEY", "model": self.model}
        payload = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "temperature": 0.2,
            "max_tokens": max_tokens,
        }
        try:
            with httpx.Client(timeout=self.timeout) as client:
                response = client.post(
                    f"{self.base_url}/chat/completions",
                    headers={"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"},
                    json=payload,
                )
            if response.status_code >= 400:
                return {"ok": False, "text": "", "model": self.model,
                        "error": f"Qwen HTTP {response.status_code}: {response.text[:300]}"}
            data = response.json()
            text = (data.get("choices") or [{}])[0].get("message", {}).get("content", "").strip()
            if not text:
                return {"ok": False, "text": "", "model": self.model, "error": "Qwen 返回空文本"}
            return {"ok": True, "text": text, "model": data.get("model", self.model),
                    "usage": data.get("usage", {})}
        except Exception as exc:
            return {"ok": False, "text": "", "model": self.model, "error": f"Qwen 调用失败：{exc}"}

    def chat_with_tools(self, messages: list[dict], tools: list[dict],
                        max_tokens: int = 900) -> dict[str, Any]:
        """OpenAI-compatible tool calling. Returns the raw assistant message."""
        if not self.configured:
            return {"ok": False, "error": "未配置 DASHSCOPE_API_KEY", "model": self.model}
        payload = {
            "model": self.model,
            "messages": messages,
            "tools": tools,
            "tool_choice": "auto",
            "temperature": 0.2,
            "max_tokens": max_tokens,
        }
        try:
            with httpx.Client(timeout=self.timeout) as client:
                response = client.post(
                    f"{self.base_url}/chat/completions",
                    headers={"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"},
                    json=payload,
                )
            if response.status_code >= 400:
                return {"ok": False, "error": f"Qwen HTTP {response.status_code}: {response.text[:300]}",
                        "model": self.model}
            data = response.json()
            choice = (data.get("choices") or [{}])[0]
            return {"ok": True, "message": choice.get("message", {}),
                    "finish_reason": choice.get("finish_reason"),
                    "model": data.get("model", self.model), "usage": data.get("usage", {})}
        except Exception as exc:
            return {"ok": False, "error": f"Qwen 调用失败：{exc}", "model": self.model}

    def summarize_plan(self, plan: dict[str, Any]) -> dict[str, Any]:
        system = (
            "你是三甲医院运营调度助手。只根据给定事实生成 2-3 句中文摘要。"
            "禁止编造数字、患者、床位或制度；不要改变临床优先级；不要声称已执行。"
            "如果方案尚未审批，明确说明等待人工审批。"
        )
        facts = {
            "plan_id": plan.get("id"),
            "kind": plan.get("kind"),
            "scope": plan.get("scope"),
            "status": plan.get("status"),
            "summary": plan.get("summary"),
            "matched": [
                {"patient": m.get("patient_name"), "bed": m.get("bed_code"), "type": m.get("bed_type")}
                for m in (plan.get("matched") or [])[:8]
            ],
            "unmatched": [
                {"patient": u.get("patient_name"), "reason": u.get("reason")}
                for u in (plan.get("unmatched") or [])[:5]
            ],
            "changes": (plan.get("changes") or [])[:5],
            "validation": plan.get("validation", {}).get("valid"),
        }
        user = "请把以下方案事实压缩成给运营主管看的摘要，保留关键数字：\n" + json.dumps(facts, ensure_ascii=False)
        return self.complete(system, user, max_tokens=260)

    def triage_note(self, symptoms: str, departments: list[str], urgency: str) -> dict[str, Any]:
        """Explain a deterministic triage decision without diagnosing."""
        if not self.configured:
            return {"ok": False, "text": "", "error": "未配置 DASHSCOPE_API_KEY", "model": self.model}
        system = (
            "你是医院就医分诊助手。你只能解释就医科室和就医紧迫度，不能做疾病诊断，"
            "不能输出疾病名称、概率、用药、处方或检查建议。"
            "如果患者有急症风险，只提示立即前往急诊或拨打120。"
            "用一句简洁中文回答，不要使用‘可能’‘疑似’‘诊断为’‘患有’等措辞。"
        )
        user = (
            f"症状：{symptoms}\n推荐科室：{'、'.join(departments)}\n"
            f"紧迫度：{urgency}\n请只解释为什么建议去这些科室，并提醒这不是诊断。"
        )
        result = self.complete(system, user, max_tokens=180)
        forbidden = ["可能", "疑似", "诊断为", "患有", "建议服用", "用药", "处方"]
        if result.get("ok") and any(word in result["text"] for word in forbidden):
            return {"ok": False, "text": "", "model": self.model,
                    "error": "Qwen 输出包含诊断性措辞，已回退规则文案"}
        return result

    def summarize_report(self, report: dict[str, Any]) -> dict[str, Any]:
        system = (
            "你是医院运营分析助手。只根据给定报告事实写一段 120 字以内的中文管理摘要。"
            "不得编造数字，不得给出诊断或治疗建议，不得把模拟数据说成真实医院数据。"
        )
        facts = {
            "range": report.get("range"),
            "metrics": report.get("metrics"),
            "sections": report.get("sections"),
            "data_source": report.get("data_source"),
        }
        user = "请基于以下事实写管理摘要：\n" + json.dumps(facts, ensure_ascii=False)
        return self.complete(system, user, max_tokens=240)


qwen = QwenService()

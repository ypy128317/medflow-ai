from __future__ import annotations

import mcp_server as mcp


def test_mcp_tools_use_the_same_domain_data(client):
    snapshot = mcp.bed_read_snapshot("全院")
    assert snapshot["kpis"]["total_beds"] == 96
    assert mcp.exam_find_conflicts("2026-11-06")
    assert mcp.kb_search("床位 单人间 审批")
    workload = mcp.staff_workload("ortho")
    assert workload and workload[0]["weekly_hours"] > 0
    kpi = mcp.ops_kpi_snapshot()
    assert kpi["kpis"]["free"] == 11

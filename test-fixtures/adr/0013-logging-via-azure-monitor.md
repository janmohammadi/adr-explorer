---
title: "Logging via Azure Monitor and Log Analytics"
status: accepted
date: 2025-03-10
deciders: ["Anna Kovač"]
supersedes: [ADR-0012]
amends: []
relates-to:
  - id: ADR-0008
    reason: "Log Analytics workspace and diagnostic settings are provisioned by the CI/CD Bicep modules"
tags: ["logging", "azure-monitor", "observability", "azure", "backend"]
review-by: 2026-03-10
confidence: high
---

# Logging via Azure Monitor and Log Analytics

## Context

After the Azure-first platform decision, running a Jaeger + Prometheus + Loki stack (ADR-0012) duplicated capabilities already native to Azure Monitor. Workload identity and diagnostic settings made ingestion effectively free of secret management.

## Decision

- Replace the OpenTelemetry Collector → Jaeger/Prometheus/Loki pipeline with Azure Monitor: traces and logs into Log Analytics; metrics into Azure Monitor Metrics.
- Keep OpenTelemetry SDK instrumentation — only the export target changes.
- Use Application Insights auto-instrumentation for .NET and Python apps where available.

## Consequences

- One observability bill line instead of three self-hosted stacks.
- Cross-service correlation via `operation_Id` works natively with App Insights SDKs.
- Kusto (KQL) learning curve for the team; dashboards from the Jaeger/Loki era must be rebuilt.
- Review is overdue — revisit once AI Foundry tracing ([ADR-0010](0010-draft-what-if.md)) ships, as it may absorb the LLM span subset.

---
title: "LLM span enrichment via Azure AI Foundry tracing"
status: proposed
date: 2026-04-05
deciders: ["Anna Kovač", "Tom Müller"]
supersedes: []
amends: [ADR-0013]
relates-to:
  - id: ADR-0010
    reason: "AI Foundry tracing SDK is introduced by the Langfuse replacement ADR"
tags: ["logging", "ai-foundry", "llm", "tracing", "backend"]
confidence: medium
---

# LLM Span Enrichment via Azure AI Foundry Tracing

## Context

[ADR-0013](0013-logging-via-azure-monitor.md) sends all traces to Log Analytics via OpenTelemetry, but LLM-specific span attributes (prompt tokens, tool calls, eval scores) are not first-class in Application Insights. AI Foundry's tracing SDK produces richer LLM spans and is introduced by the Langfuse replacement ([ADR-0010](0010-draft-what-if.md)).

## Decision

- Keep ADR-0013's general-purpose Log Analytics pipeline for non-LLM spans.
- Enrich LLM spans through AI Foundry's SDK and dual-export: to Log Analytics (for correlation) and to AI Foundry's own trace store (for evaluation dashboards).
- Treat AI Foundry spans as the source of truth for LLM-related telemetry.

## Consequences

- Requires sampling rules tuned per exporter to avoid double billing.
- Engineering teams must know which span attributes live where.
- Status remains proposed pending a spike on span loss between the two exporters.

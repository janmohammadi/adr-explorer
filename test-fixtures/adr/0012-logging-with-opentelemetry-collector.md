---
title: "Unified observability via OpenTelemetry Collector"
status: superseded
date: 2024-02-08
deciders: ["Anna Kovač"]
supersedes: [ADR-0011]
amends: []
relates-to: []
tags: ["logging", "opentelemetry", "observability", "tracing", "backend"]
confidence: medium
---

# Unified Observability via OpenTelemetry Collector

## Context

Serilog + Seq (ADR-0011) did not cover distributed tracing and required per-service sink configuration. OpenTelemetry had reached GA for traces and metrics, with logs stabilising, making a single SDK across all languages attractive.

## Decision

- Instrument all services with the OpenTelemetry SDK (traces + metrics + logs).
- Run an OpenTelemetccccry Collector sidecar per AKS node pool; export to a central Collector gateway.
- Route traces to Jaeger, metrics to Prometheus, logs to Loki.
- Retire Seq over a 30-day overlap window.

## Consequences

- One instrumentation surface across .NET, Python, and TypeScript services.
- Collector gateway becomes a critical dependency — must be HA.
- Loki queries for high-cardinality fields are slow compared to Seq; developers need training.
- Superseded by [ADR-0013](0013-logging-via-azure-monitor.md) after the Azure-first strategy was adopted.

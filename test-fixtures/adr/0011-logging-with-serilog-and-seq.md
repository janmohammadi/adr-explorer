---
title: "Logging with Serilog and self-hosted Seq"
status: deprecated
date: 2023-06-15
deciders: ["Anna Kovač"]
supersedes: []
amends: []
relates-to: []
tags: ["logging", "serilog", "observability", "backend"]
confidence: medium
---

# Logging with Serilog and Self-Hosted Seq

## Context

Early-stage project needed structured logging across the .NET backend with a searchable UI. Serilog was the de-facto choice for .NET at the time, and self-hosting Seq on a small VM gave us a familiar Kibana-style UI for free.

## Decision

- Use Serilog sinks across all backend services.
- Deploy Seq on a single VM (no HA), backed by a local disk for event storage.
- Retain 14 days of logs.

## Consequences

- Low infrastructure cost in year one.
- Single-VM Seq becomes a bottleneck as log volume grows past ~50k events/minute.
- Not integrated with distributed tracing — correlation across services is manual.
- Superseded by [ADR-0012](0012-logging-with-opentelemetry-collector.md) once OpenTelemetry reached GA maturity.

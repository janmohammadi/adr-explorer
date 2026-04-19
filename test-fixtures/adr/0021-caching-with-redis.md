---
title: "Caching with Azure Cache for Redis"
status: accepted
date: 2024-03-30
deciders: ["Anna Kovač"]
supersedes: []
amends: []
relates-to: []
tags: ["caching", "redis", "performance", "backend"]
---

# Caching with Azure Cache for Redis

## Context

Read-heavy reference data (tenant configuration, prompt templates, feature flags) was being re-read from Postgres on every request, adding measurable latency to the critical LLM path.

## Decision

- Provision a single Azure Cache for Redis instance (Standard C1) shared across backend services.
- TTL-based invalidation only — no change-data-capture for now.
- Namespace keys by service prefix to avoid accidental collisions.

## Consequences

- Single-region dependency — multi-region rollout (if/when) must revisit.
- No review cadence set; this ADR has not been revisited since acceptance over a year ago.
- The "single shared instance" assumption is starting to strain as new services arrive; worth a review.

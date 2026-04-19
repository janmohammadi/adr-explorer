---
title: "Rate limiting at the API gateway"
status: accepted
date: 2025-07-08
deciders: ["Anna Kovač", "Marc Dubois"]
supersedes: []
amends: []
relates-to:
  - id: ADR-0009
    reason: "Front Door is the outer layer; rate limiting is performed at APIM behind it"
tags: ["rate-limiting", "api-gateway", "apim", "backend", "security"]
review-by: 2026-10-15
confidence: high
---

# Rate Limiting at the API Gateway

## Context

Abuse patterns from a handful of tenants drove uneven latency for everyone. LLM calls amplify the blast radius — a single bad actor can saturate GPU quota and cost.

## Decision

- Terminate rate limiting at Azure API Management (APIM), behind Front Door.
- Per-tenant policies keyed on the JWT `tid` claim: 60 req/min base, with per-product overrides for enterprise plans.
- Separate limit for LLM-heavy endpoints (5 req/min per user) regardless of tenant tier.

## Consequences

- Noisy-neighbour impact bounded and measurable.
- Requires a policy rollout runbook — changes are applied via APIM bicep, not the main CI/CD path.
- Review aligned with annual tenant tier renegotiation cycle.

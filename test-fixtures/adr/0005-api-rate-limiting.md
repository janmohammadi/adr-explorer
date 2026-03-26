---
title: "Implement API rate limiting"
status: accepted
date: 2024-02-15
deciders: ["Charlie", "Eve"]
supersedes: []
amends: []
relates-to: [ADR-0004]
tags: ["api", "security", "infrastructure"]
---

# Implement API rate limiting

## Context

With the move to JWT-based auth (ADR-0004) and public API access, we need to protect our services from abuse. Without rate limiting, a single client could overwhelm our API. We already have Redis in our stack (ADR-0003), which can serve as a rate-limit counter store.

## Decision

We will implement token-bucket rate limiting using Redis as the backing store. Limits will be:
- **Authenticated users**: 1000 requests/minute
- **API keys (partners)**: 5000 requests/minute
- **Unauthenticated**: 60 requests/minute

Rate limit headers (`X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`) will be included in every response.

## Consequences

- Good: Protects backend services from traffic spikes and abuse
- Good: Reuses existing Redis infrastructure
- Good: Standard rate-limit headers enable client-side backoff
- Bad: Adds ~2ms latency per request for Redis counter check
- Bad: Distributed rate limiting across multiple instances requires careful Redis key design

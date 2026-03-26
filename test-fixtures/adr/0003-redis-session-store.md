---
title: "Migrate session storage to Redis"
status: superseded
date: 2023-09-10
deciders: ["Bob", "Charlie", "Diana"]
supersedes: [ADR-0002]
amends: []
relates-to: []
tags: ["database", "auth", "infrastructure", "performance"]
---

# Migrate session storage to Redis

## Context

After three months in production, the PostgreSQL session store (ADR-0002) is causing problems. Session reads add ~15ms latency to every authenticated request, and the cleanup cron job occasionally locks the sessions table, causing request spikes. We are also preparing to scale to multiple server instances.

## Decision

We will migrate session storage from PostgreSQL to Redis. This amends our original session-based auth approach (ADR-0001) by decoupling session storage from the primary database.

## Consequences

- Good: Sub-millisecond session lookups
- Good: Built-in TTL handles session expiry automatically
- Good: Enables horizontal scaling with shared session store
- Good: Eliminates DB lock contention from cleanup jobs
- Bad: Introduces Redis as a new infrastructure dependency
- Bad: Sessions are lost if Redis restarts without persistence
- Bad: Requires configuring Redis persistence (RDB/AOF) for durability

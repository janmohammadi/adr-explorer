---
title: "Use PostgreSQL for session storage"
status: superseded
date: 2023-06-15
deciders: ["Bob", "Charlie"]
supersedes: []
amends: []
relates-to: [ADR-0001]
tags: ["database", "auth", "infrastructure"]
---

# Use PostgreSQL for session storage

## Context

Following our decision to use session-based auth (ADR-0001), we need to decide where to store session data. Our application already uses PostgreSQL as the primary data store.

## Decision

We will store session data in a dedicated `sessions` table in PostgreSQL, using the `connect-pg-simple` middleware.

## Consequences

- Good: No additional infrastructure needed — reuses existing PostgreSQL
- Good: Sessions survive server restarts
- Good: Easy to query and audit sessions
- Bad: Adds load to the primary database
- Bad: Higher latency compared to in-memory stores like Redis
- Bad: Session cleanup requires periodic garbage collection queries

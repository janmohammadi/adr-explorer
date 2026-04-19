---
title: "PostgreSQL as the primary OLTP store"
status: accepted
date: 2023-11-22
deciders: ["Anna Kovač"]
supersedes: []
amends: []
relates-to: []
tags: ["database", "postgres", "backend", "data"]
---

# PostgreSQL as the Primary OLTP Store

## Context

Initial platform needed a transactional store. The team had strong Postgres experience and existing scripts for schema migration, backups, and PITR.

## Decision

- Use Azure Database for PostgreSQL Flexible Server as the primary OLTP store.
- Standardise on `pgcrypto`, `uuid-ossp`, and `citext` across services.
- Apply schema migrations through a shared `liquibase` pipeline.

## Consequences

- Familiar operational model; low onboarding friction.
- Flexible Server maintenance windows must be coordinated with release trains.
- No automatic review cadence was set on this ADR — it has run without revisit for over two years.

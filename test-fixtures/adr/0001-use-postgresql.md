---
title: "Use PostgreSQL for primary data store"
status: superseded
date: 2024-01-15
deciders: ["Alice", "Bob"]
supersedes: []
amends: []
relates-to: []
tags: ["database", "infrastructure"]
---

# Use PostgreSQL for primary data store

## Context

We need a reliable relational database for our application's primary data storage. The team has experience with both MySQL and PostgreSQL. We need strong support for JSON operations, full-text search, and complex queries.

## Decision

We will use PostgreSQL as our primary data store.

## Consequences

- Good: Strong community support and extensive documentation
- Good: Excellent JSON/JSONB support for semi-structured data
- Good: Advanced indexing capabilities (GIN, GiST)
- Bad: Slightly higher memory footprint compared to MySQL
- Bad: Requires more operational expertise for tuning

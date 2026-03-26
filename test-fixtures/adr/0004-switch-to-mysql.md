---
title: "Switch to MySQL for cost optimization"
status: accepted
date: 2024-06-01
deciders: ["Alice", "Bob", "Frank"]
supersedes: [ADR-0001]
amends: []
relates-to: []
tags: ["database", "infrastructure", "cost"]
---

# Switch to MySQL for cost optimization

## Context

After 6 months of running PostgreSQL in production, we found that our cloud provider offers significantly better pricing for managed MySQL instances. Our workload does not heavily use PostgreSQL-specific features like JSONB or advanced indexing. The cost difference is approximately 40% per month.

## Decision

We will migrate from PostgreSQL to MySQL 8.0, superseding ADR-0001.

## Consequences

- Good: 40% reduction in database hosting costs
- Good: Simpler operational model with managed MySQL
- Good: MySQL 8.0 covers our query complexity needs
- Bad: Migration effort estimated at 2-3 sprints
- Bad: Loss of PostgreSQL-specific features (can revisit if needed)

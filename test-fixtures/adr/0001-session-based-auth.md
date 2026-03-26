---
title: "Use session-based authentication"
status: superseded
date: 2023-06-01
deciders: ["Alice", "Bob"]
supersedes: []
amends: []
relates-to: []
tags: ["auth", "security", "backend"]
---

# Use session-based authentication

## Context

We are building a new web application and need to decide on an authentication strategy. The team is most familiar with traditional server-side sessions stored in a database. Our initial deployment is a single-server monolith.

## Decision

We will use server-side sessions with session IDs stored in HTTP-only cookies. Session data will be stored in PostgreSQL.

## Consequences

- Good: Simple to implement and well-understood by the team
- Good: Session revocation is straightforward (delete from DB)
- Good: HTTP-only cookies provide XSS protection
- Bad: Sessions are server-stateful, making horizontal scaling harder
- Bad: Requires sticky sessions or shared session store for multi-server setups
- Bad: Not suitable for mobile clients or third-party integrations

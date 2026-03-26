---
title: "Introduce GraphQL gateway for frontend"
status: proposed
date: 2024-07-15
deciders: ["Charlie", "Diana", "Eve"]
supersedes: []
amends: [ADR-0002]
relates-to: [ADR-0003]
tags: ["api", "frontend", "graphql"]
---

# Introduce GraphQL gateway for frontend

## Context

As our REST API grows (see ADR-0003 for versioning strategy), the frontend team is experiencing over-fetching and under-fetching problems. Multiple REST calls are needed to render single pages. A GraphQL gateway would let the frontend request exactly the data it needs. This amends our React architecture (ADR-0002) by adding a GraphQL client layer.

## Decision

We propose introducing a GraphQL gateway (Apollo Server) that sits in front of our REST APIs, providing a unified query interface for the React frontend.

## Consequences

- Good: Frontend gets exactly the data it needs in one request
- Good: Reduces number of API calls per page
- Good: Strong typing with GraphQL schema
- Bad: Additional infrastructure component to maintain
- Bad: Team needs to learn GraphQL
- Bad: Adds complexity to the API layer

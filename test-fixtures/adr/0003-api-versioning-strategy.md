---
title: "URL-based API versioning strategy"
status: accepted
date: 2024-03-10
deciders: ["Alice", "Eve"]
supersedes: []
amends: []
relates-to: [ADR-0002]
tags: ["api", "backend"]
---

# URL-based API versioning strategy

## Context

As our API grows, we need a clear versioning strategy to allow breaking changes without disrupting existing clients. The frontend framework choice (ADR-0002) influences how we structure our API contracts.

## Decision

We will use URL-based versioning (e.g., `/api/v1/`, `/api/v2/`) for our REST APIs.

## Consequences

- Good: Simple and explicit version identification
- Good: Easy to route traffic and deprecate old versions
- Good: Frontend can target specific API versions
- Bad: Can lead to code duplication across versions
- Bad: Harder to maintain than header-based versioning at scale

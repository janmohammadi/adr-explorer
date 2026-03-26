---
title: "Deprecate Redis session store"
status: accepted
date: 2024-10-01
deciders: ["Bob", "Charlie"]
supersedes: [ADR-0003]
amends: []
relates-to: []
tags: ["infrastructure", "auth", "cleanup"]
---

# Deprecate Redis session store

## Context

With the migration to OAuth 2.0 (ADR-0007), server-side sessions are no longer used for authentication. Redis (originally introduced in ADR-0003) is still used for:
- Rate limiting (ADR-0005) — **keeping**
- Token revocation bloom filter (ADR-0008) — **keeping**
- Legacy session storage — **no longer needed**

The session-related Redis keys, configuration, and cleanup jobs are now dead code.

## Decision

We will formally deprecate and remove the session storage functionality from Redis. This supersedes ADR-0003. Redis itself remains in the stack for rate limiting and token revocation.

### Cleanup tasks:
1. Remove `connect-redis` session middleware
2. Drop session-related Redis keys (`sess:*`)
3. Remove session TTL configuration
4. Update monitoring dashboards to remove session metrics

## Consequences

- Good: Eliminates dead code and configuration
- Good: Simplifies Redis usage patterns (only rate limiting + revocation)
- Good: Reduces Redis memory usage by ~40%
- Bad: Any legacy clients still using session cookies will need to re-authenticate

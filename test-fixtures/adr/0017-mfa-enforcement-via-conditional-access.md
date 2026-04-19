---
title: "MFA enforcement via EntraID Conditional Access"
status: accepted
date: 2024-09-03
deciders: ["Marc Dubois"]
supersedes: []
amends: []
relates-to:
  - id: ADR-0007
    reason: "Conditional Access policies attach to the application registrations introduced by the auth ADR"
tags: ["security", "msal", "mfa", "entraid", "compliance"]
review-by: 2025-09-03
confidence: high
---

# MFA Enforcement via EntraID Conditional Access

## Context

Compliance auditors flagged that MFA enforcement was handled at the application code level, which leaves the door open to bypass via non-interactive flows.

## Decision

- Move MFA enforcement into EntraID Conditional Access policies.
- Require compliant device for all administrative scopes.
- Exempt service principals with workload identity from MFA (they use certificate-based auth).

## Consequences

- Centralises enforcement and audit evidence.
- Review is more than six months overdue — Conditional Access policy language has evolved and our rules should be re-validated against the latest controls.
- Sole decider — bus factor of 1 on security decisions is a known concern.

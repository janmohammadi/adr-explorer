---
title: "Data retention policy for chat history"
status: accepted
date: 2024-11-20
deciders: ["Marc Dubois"]
supersedes: []
amends: []
relates-to:
  - id: ADR-0005
    reason: "Retention applies to the Langfuse chat history store"
tags: ["data-retention", "gdpr", "compliance", "security"]
review-by: 2025-11-20
confidence: low
---

# Data Retention Policy for Chat History

## Context

GDPR Article 5 requires storage limitation. Product leadership wanted to keep long conversations for better model grounding, while legal pushed for aggressive deletion.

## Decision

- Retain chat history for 180 days by default.
- Allow per-tenant override up to 2 years with a documented legitimate-interest assessment.
- Delete attachments after 30 days regardless of retention tier.

## Consequences

- Confidence is low — product, legal, and engineering reached a grudging compromise rather than a shared view. Revisit within one year (now overdue).
- Chat history is now split across Langfuse (legacy) and Cosmos DB (target per [ADR-0010](0010-draft-what-if.md)), complicating deletion jobs until migration completes.
- Single-decider decision on a cross-functional topic — high risk of drift from legal's current view.

---
title: "Prompt versioning and evaluation strategy"
status: accepted
date: 2026-02-14
deciders: ["Tom Müller"]
supersedes: []
amends: []
relates-to:
  - id: ADR-0010
    reason: "Prompt traces and evaluations land in AI Foundry per the Langfuse replacement"
tags: ["llm", "prompt-versioning", "evaluation", "backend"]
confidence: low
---

# Prompt Versioning and Evaluation Strategy

## Context

Prompt edits were being landed directly in application code without any versioning, so regressions in LLM behaviour couldn't be bisected. We need a lightweight versioning scheme that doesn't require a dedicated prompt-ops platform yet.

## Decision

- Store system and user prompts as Markdown files in a `prompts/` folder versioned with the service code.
- Tag each prompt with a semantic version in frontmatter; include the version in LLM trace attributes.
- Automated evaluation suite (golden set) runs on every prompt PR before merge.

## Consequences

- Lightweight and reversible — no new platform to run.
- Confidence is low because this is the first iteration; there is no empirical evidence yet that the golden set meaningfully correlates with production quality.
- Accepting a low-confidence decision is a deliberate choice — we want to learn, but this should be flagged on review dashboards.

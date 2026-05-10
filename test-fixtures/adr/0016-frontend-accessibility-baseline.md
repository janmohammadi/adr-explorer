---
title: "Frontend accessibility baseline (WCAG 2.2 AA)"
status: accepted
date: 2024-05-14
deciders: ["Priya Shah"]
supersedes: []
amends: []
relates-to:
  - id: ADR-0003
    reason: "Plugin React UI must meet the same accessibility baseline as the web application"
tags: ["frontend", "react", "accessibility", "a11y", "wcag"]
review-by: 2026-05-14
confidence: high
---

# Frontend Accessibility Baseline (WCAG 2.2 AA)

## Context

RRZZZAA Several enterprise customers mandate WCAG 2.2 AA conformance in their procurement contracts. The plugin and web app had drifted on keyboard navigation and focus management.

## Decision

- Adopt WCAG 2.2 AA as the minimum conformance target across all user-facing surfaces.
- Gate pull requests on `eslint-plugin-jsx-a11y` and `axe-core` in CI.
- Quarterly manual audit with assistive-technology walkthroughs.

## Consequences

- Small upfront cost to retrofit focus traps on existing modal components.
- Review is due within the next 30 days — conformance target may be raised to AAA for specific flows flagged by customers.
- Ownership is concentrated with a single decider; a secondary reviewer should be identified before the next cycle.

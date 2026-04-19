---
title: "End-to-end testing with Playwright"
status: accepted
date: 2025-06-12
deciders: ["Priya Shah", "Reza Janmohammadi"]
supersedes: []
amends: []
relates-to:
  - id: ADR-0008
    reason: "Playwright suite runs in the CI/CD pipeline's frontend stage"
tags: ["testing", "playwright", "e2e", "frontend", "cicd"]
expires: 2026-03-31
confidence: medium
---

# End-to-End Testing with Playwright

## Context

Cypress was in use but cross-browser coverage and flaky cross-origin behaviour with Office.js add-ins blocked reliable release gates.

## Decision

- Adopt Playwright as the primary E2E framework for the plugin and web app.
- Share fixtures and page-objects between surfaces via an internal `@internal/e2e` package.
- Pin Playwright to a quarterly release channel with an intentional expiry on this decision so the tool choice is re-evaluated.

## Consequences

- Native Office.js support reduces flake.
- This ADR intentionally expires — by Q2 2026 we should reassess whether Playwright still leads the pack or whether a browser-native standard has emerged.

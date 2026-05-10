---
title: "Adopt React for the UI"
status: accepted
date: 2025-09-05
deciders: ["Alex", "Jordan"]
amends: [0006]
tags: ["ui"]
confidence: high
---

# Adopt React for the UI

## Context

Interactive features (live filtering, the meal-planner draft from ADR-0008, ratings widget) made hand-written HTML unwieldy.

## Decision

Use React with Vite. Keep the page count small; start with one component per route.

## Consequences

- Component reuse instead of copy-paste.
- Adds a build step and a JS bundle — acceptable trade-off.
- This amends ADR-0006 rather than replacing the design philosophy: still server-rendered shells where possible.

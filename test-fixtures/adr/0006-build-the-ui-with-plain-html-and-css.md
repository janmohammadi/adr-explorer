---
title: "Build the UI with plain HTML and CSS"
status: deprecated
date: 2025-02-01
deciders: ["Alex"]
tags: ["ui"]
confidence: medium
---

# Build the UI with Plain HTML and CSS

## Context

For the first version we wanted the smallest possible toolchain — no build step, no framework.

## Decision

Serve hand-written HTML pages with a single `styles.css`. JavaScript only where strictly needed.

## Consequences

- Trivially deployable; very fast page loads.
- Reusing components (recipe card, rating widget) means copy-paste.
- This approach was outgrown once interactivity increased — see ADR-0007.

---
title: "Store recipes in a single JSON file"
status: superseded
date: 2025-03-02
deciders: ["Alex"]
supersedes: [0001]
tags: ["storage"]
confidence: medium
---

# Store Recipes in a Single JSON File

## Context

Markdown-per-recipe (ADR-0001) made bulk operations awkward — e.g. listing all vegan recipes meant reading every file.

## Decision

Consolidate all recipes into one `recipes.json` array so the app can load them in one read.

## Consequences

- Faster startup, easier filtering in memory.
- Merge conflicts become painful as the team grows.
- This was later replaced by a real database — see ADR-0003.

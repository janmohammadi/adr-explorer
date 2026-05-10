---
title: "Allow text comments on recipes"
status: accepted
date: 2025-07-12
deciders: ["Jordan", "Sam"]
relates-to:
  - id: 0004
    reason: "Comments complement star ratings with qualitative feedback."
tags: ["social"]
confidence: medium
---

# Allow Text Comments on Recipes

## Context

Star ratings (ADR-0004) tell us *how much* people liked a recipe but not *why*.

## Decision

Allow free-text comments up to 500 characters per recipe, with basic profanity filtering.

## Consequences

- Richer feedback for recipe authors.
- Adds a moderation surface — start with report-and-review, not pre-moderation.
- Comments stored alongside ratings; both shown on the recipe page.

---
title: "Use 1–5 star ratings for recipes"
status: accepted
date: 2025-07-10
deciders: ["Jordan"]
relates-to:
  - id: 0005
    reason: "Ratings and comments together form the social feedback loop."
tags: ["social"]
confidence: high
---

# Use 1–5 Star Ratings for Recipes

## Context

Users want a quick way to signal which recipes are worth trying.

## Decision

Add a 1–5 star rating per user, per recipe. Display the average on the recipe card.

## Consequences

- Simple, familiar UX.
- Susceptible to small-sample skew — show count alongside the average.
- Pairs with text comments (ADR-0005) for richer feedback.

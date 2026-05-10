---
title: "Add a weekly meal-planner view"
status: proposed
date: 2026-04-22
deciders: ["Jordan"]
relates-to:
  - id: 0007
    reason: "The planner is a new view inside the React shell."
  - id: 0003
    reason: "Plan persistence reuses the SQLite schema."
tags: ["ui"]
confidence: low
---

# Add a Weekly Meal-Planner View

## Context

Several users have asked for a way to assign recipes to days of the week and print a shopping list.

## Decision (proposed)

Add a `/plan` page showing a 7-day grid. Drag recipes onto days; derive an aggregated ingredient list.

## Open Questions

- Per-user persistence or shareable per-household plan?
- Print layout vs. export to PDF?
- Does this belong inside the React shell from ADR-0007 or as a separate mini-app?

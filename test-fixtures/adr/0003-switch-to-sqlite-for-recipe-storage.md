---
title: "Switch to SQLite for recipe storage"
status: accepted
date: 2025-06-20
deciders: ["Alex", "Jordan", "Sam"]
supersedes: [0002]
tags: ["storage"]
confidence: high
---

# Switch to SQLite for Recipe Storage

## Context

The single JSON file (ADR-0002) caused frequent merge conflicts and slow saves once we had ~500 recipes.

## Decision

Use SQLite as a local, file-based database. One table for recipes, one for tags.

## Consequences

- Real queries, no more in-memory filtering.
- Schema migrations now needed.
- Still a single file on disk — easy backup, no server to run.

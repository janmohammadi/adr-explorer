---
title: "Store recipes as Markdown files"
status: superseded
date: 2025-01-15
deciders: ["Alex", "Jordan"]
tags: ["storage"]
confidence: high
---

# Store Recipes as Markdown Files

## Context

We need a simple way to write and version recipes without standing up a database on day one.

## Decision

Each recipe lives in its own `.md` file under `recipes/`, with frontmatter for title, servings, and tags.

## Consequences

- Plain-text friendly, easy to diff in Git.
- No query layer yet — search is filename + grep.
- Migration to a database later is straightforward (one file = one row).

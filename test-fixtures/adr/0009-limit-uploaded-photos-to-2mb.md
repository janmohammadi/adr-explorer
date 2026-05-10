---
title: "Limit uploaded recipe photos to 2 MB"
status: accepted
date: 2025-10-01
deciders: ["Sam"]
relates-to:
  - id: 0010
    reason: "Size cap and CDN trial together govern the recipe-image pipeline."
tags: ["media"]
review-by: 2026-06-01
confidence: medium
---

# Limit Uploaded Recipe Photos to 2 MB

## Context

Some users were uploading 10+ MB photos straight from their phones, ballooning storage costs and slowing page loads.

## Decision

Reject uploads larger than 2 MB. Show a friendly message suggesting the user resize first.

## Consequences

- Predictable storage and bandwidth.
- A few power users will be inconvenienced — revisit once we have client-side compression.
- Marked for review in mid-2026 to see whether automatic resizing has changed the picture.

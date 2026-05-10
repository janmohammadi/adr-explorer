---
title: "Trial a third-party image CDN"
status: accepted
date: 2025-10-15
deciders: ["Sam"]
tags: ["media"]
expires: 2026-04-01
confidence: low
---

# Trial a Third-Party Image CDN

## Context

Recipe photos load slowly for users outside our home region. A CDN trial is the fastest way to test whether the cost is justified.

## Decision

Enroll in a 6-month free trial with one provider; route recipe images through their delivery URLs.

## Consequences

- Faster image loads for international users.
- Vendor lock-in is mild — URLs can be rewritten on rollback.
- Trial expires April 2026 — must re-decide before then, otherwise costs kick in.

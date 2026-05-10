---
title: "Send email notifications via SMTP"
status: accepted
date: 2025-04-18
deciders: ["Alex"]
relates-to:
  - id: 0005
    reason: "New comments are the main trigger for outbound email."
tags: ["notifications"]
review-by: 2025-11-01
confidence: medium
---

# Send Email Notifications via SMTP

## Context

When someone comments on a recipe, the author should be notified. Email is the lowest-friction channel.

## Decision

Send transactional emails directly via SMTP using a small office mailbox.

## Consequences

- No third-party dependency, no extra bill.
- Deliverability is the team's problem now — bounces and spam scoring need monitoring.
- Marked for review after 6 months to compare against a hosted service.

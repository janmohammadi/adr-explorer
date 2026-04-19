---
title: "Migrate search to Azure AI Search"
status: accepted
date: 2026-01-08
deciders: ["Tom Müller", "Anna Kovač"]
supersedes: [ADR-0023]
amends: []
relates-to:
  - id: ADR-0010
    reason: "AI Search vector index is consumed by the AI Foundry retrieval pipeline"
tags: ["search", "azure-ai-search", "rag", "backend"]
review-by: 2027-01-08
confidence: high
---

# Migrate Search to Azure AI Search

## Context

Azure rebranded Cognitive Search as Azure AI Search and added native integrated vectorization, chunking skillsets, and better pricing tiers for vector workloads. Staying on the previous SKU meant paying for external embedding pipelines we no longer needed.

## Decision

- Migrate indexes to Azure AI Search, enabling integrated vectorization.
- Replace the custom Function App chunker with the built-in text-split skillset.
- Keep hybrid + semantic ranker configuration; only the embedding and chunking steps change.

## Consequences

- Lower end-to-end ingestion latency; fewer moving parts.
- Integrated vectorization is billed per 1K tokens — cost model needs monitoring.
- Supersedes [ADR-0023](0023-search-with-azure-cognitive-search.md).

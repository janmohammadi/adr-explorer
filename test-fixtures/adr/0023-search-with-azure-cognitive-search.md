---
title: "Document search with Azure Cognitive Search"
status: superseded
date: 2025-10-22
deciders: ["Tom Müller"]
supersedes: []
amends: []
relates-to: []
tags: ["search", "azure-cognitive-search", "rag", "backend"]
confidence: medium
---

# Document Search with Azure Cognitive Search

## Context

RAG retrieval over customer documents needed a managed search service with hybrid (BM25 + vector) capabilities. Azure Cognitive Search was the obvious choice given the existing Azure footprint.

## Decision

- Provision Azure Cognitive Search (Standard S1) with hybrid indexing enabled.
- Ingest documents via a Function App triggered by Blob uploads.
- Use semantic ranker for the top-50 reranking step.

## Consequences

- Worked well for initial scale.
- Superseded by [ADR-0024](0024-search-migration-to-azure-ai-search.md) after Microsoft rebranded and consolidated capabilities under Azure AI Search with additional vector controls.

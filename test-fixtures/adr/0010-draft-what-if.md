---
title: "Azure AI Foundry and Cosmos DB to replace Langfuse"
status: proposed
date: 2026-03-28
deciders: ["Reza Janmohammadi"]
supersedes: ["ADR-0005"]
amends: ["ADR-0008"]
relates-to: ["ADR-0007", "ADR-0009"]
tags: ["observability", "tracing", "cosmosdb", "azure-ai-foundry", "cost", "backend"]
review-by: 2026-09-24
confidence: medium
---

# Azure AI Foundry and Cosmos DB to Replace Langfuse

## Context

Self-hosted Langfuse on AKS (pods + PostgreSQL) incurs unjustifiable compute and storage costs for our usage volume. We only need LLM tracing and evaluation — chat history persistence and user feedback collection don't require a dedicated LLM observability platform. Azure AI Foundry provides native tracing with OpenTelemetry-based instrumentation and built-in evaluation pipelines, while Cosmos DB serverless offers a near-zero-idle-cost store for chat history and feedback.

## Decision

We replace Langfuse entirely in a single cutover:

- **LLM tracing and evaluation:** Azure AI Foundry SDK, instrumenting our RAG pipeline (retrieval → context assembly → GPT-4o call) with nested spans and token/cost tracking.
- **Chat history persistence:** Cosmos DB serverless, partitioned by `userId` with `conversationId` as sort key.
- **User feedback:** Simple REST endpoint (`POST /feedback`) storing scores and comments in the same Cosmos DB instance, linked to AI Foundry trace IDs.
- **Decommission:** Remove Langfuse containers, PostgreSQL StatefulSet, and associated PVCs from AKS manifests and the Azure DevOps pipeline.

Both AI Foundry and Cosmos DB authenticate via EntraID managed identities on the AKS workload identity, eliminating Langfuse's separate API key management.

## Consequences

- **Cost reduction:** Langfuse pods, PostgreSQL persistent volumes, and associated CPU/memory freed from AKS node pools. Cosmos DB serverless scales to zero; AI Foundry tracing costs are usage-based.
- **CI/CD changes (amends ADR-0008):** Pipeline must remove Langfuse deployment steps, add Cosmos DB Bicep module provisioning, and configure AI Foundry connection strings via workload identity.
- **Auth simplification (relates-to ADR-0007):** Single EntraID identity model for all backend services — no more parallel API key management for Langfuse.
- **Migration prerequisite:** Export Langfuse PostgreSQL data before teardown for potential FMA/DORA audit coverage of historical LLM interactions.
- **New dependency:** Azure AI Foundry tracing SDK is younger than Langfuse — RAG pipeline instrumentation granularity must be validated in a spike before full migration begins.
- **Sequenced rollout:** Cosmos DB and feedback API must be deployed and validated before Langfuse teardown; this is not a single atomic deployment.

## Alternatives Considered

**Azure AI Foundry tracing only, keep Langfuse for chat history temporarily.** Lower risk — validates AI Foundry before burning bridges. Rejected because it doesn't achieve the cost savings goal and creates an indefinite parallel-running state that historically never gets cleaned up.

**Azure AI Foundry tracing + Azure Table Storage for chat history.** Lowest effort and cost. Rejected because Table Storage's poor secondary indexing and 1MB entity limits would likely force a re-migration to Cosmos DB, paying the migration cost twice.
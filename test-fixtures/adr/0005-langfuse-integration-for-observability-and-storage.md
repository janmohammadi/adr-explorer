---
title: "Langfuse integration for observability and storage"
status: accepted
date: 2025-01-14
deciders: ["Reza Janmohammadi"]
supersedes: []
amends: []
relates-to: []
tags: ["observability", "langfuse", "storage", "backend"]
---

# Langfuse Integration for Observability and Storage

## 1. Introduction

This document describes the decision to adopt Langfuse as the centralized observability and storage platform for the BankDirekt AI Assistant. Langfuse will replace Azure Blob Storage for chat history persistence and provide comprehensive LLM interaction logging, tracing, and user feedback collection. This decision consolidates multiple fragmented data storage and monitoring systems into a single, purpose-built platform for AI observability.

## 2. Current Challenges

* **Fragmented Storage:** Chat histories stored in Azure Blob Storage, logs in Azure Table Storage, creating multiple data silos without unified querying
* **Limited LLM Observability:** No structured tracing of OpenAI API calls, token usage, latency, or prompt/response pairs
* **Missing Feedback Loop:** No systematic way to capture user feedback on AI-generated email suggestions and correlate it with specific LLM interactions
* **Debugging Complexity:** When AI responses are incorrect, difficult to trace back through RAG pipeline (retrieval → context → prompt → response) without specialized tooling
* **Cost Monitoring Gaps:** No granular visibility into per-user, per-conversation, or per-feature token consumption and costs
* **Compliance Challenges:** Difficult to audit AI interactions for regulatory requirements without specialized LLM logging infrastructure

## 3. Proposed Solution

Adopt Langfuse (https://langfuse.com) as the unified platform for:

1. **LLM Interaction Logging:** Trace all Azure OpenAI API calls with prompts, completions, token counts, latency, and model parameters
2. **Chat History Storage:** Replace Azure Blob Storage with Langfuse's native session/trace storage for conversation persistence
3. **User Feedback Collection:** Capture user ratings, corrections, and qualitative feedback on AI-generated email suggestions
4. **RAG Pipeline Observability:** End-to-end tracing from user query → Azure Search retrieval → context assembly → GPT-4o response

### Key Advantages

* **Purpose-Built for LLM Applications:**
    * Native support for prompt/completion pairs, token tracking, and cost monitoring
    * Automatic correlation between user feedback and specific LLM generations
    * Built-in versioning and A/B testing for prompt engineering
* **Unified Data Model:**
    * Single platform for chat history, logs, traces, and feedback eliminates data silos
    * Enables cross-cutting analytics (e.g., "which topics generate most negative feedback?")
    * Reduces storage costs by consolidating Azure Blob + Table Storage → Langfuse
* **Developer Experience:**
    * Python SDK integrates seamlessly with LangChain (already used in web app)
    * Rich web UI for debugging AI interactions without custom dashboards
    * Real-time monitoring of production LLM behavior
* **Compliance and Auditing:**
    * Immutable audit trail of all AI interactions
    * User feedback linked to specific generations for accountability
    * Export capabilities for regulatory reporting

### Technical Implementation

Integration via LangChain callback handler with standard trace hierarchy (sessions, traces, spans) and environment-based configuration.

### Open Questions

* **User Identification in Feedback:** What email address should be associated with user feedback when collected through the Outlook plugin? Options:
    * Current user's email from EntraID token
    * Email being drafted (recipient)
    * Both (sender + recipient context)
    * Decision pending stakeholder input

## 4. Potential Risks and Mitigation

* **Vendor Lock-In:** Langfuse-specific APIs may create migration challenges
    * **Mitigation:** Langfuse is open-source (can self-host if needed); abstracts LLM logging via standard interfaces; export APIs available for data portability
* **Cost Uncertainty:** Usage-based pricing may exceed current Blob Storage costs
    * **Mitigation:** Langfuse offers generous free tier; calculate projected costs based on current chat volume; set up billing alerts; can self-host if cloud costs exceed budget
* **Migration Data Loss:** Risk of losing chat history during Blob Storage → Langfuse transition
    * **Mitigation:** Implement dual-write period (write to both systems for 2 weeks); verify data integrity before cutover; maintain Blob Storage backups for 90 days post-migration
* **Performance Impact:** Additional network calls to Langfuse API may increase latency
    * **Mitigation:** Langfuse SDK uses async operations; batch trace submissions; monitor P95 latency pre/post integration; implement circuit breaker if Langfuse unavailable
* **Privacy Concerns:** Sending chat data to external SaaS platform
    * **Mitigation:** Use self-hosted Langfuse instance if required by compliance; configure data retention policies; ensure GDPR-compliant data processing agreements
* **API Rate Limits:** High-traffic periods may exceed Langfuse quotas
    * **Mitigation:** Implement local buffering with retry logic; upgrade to appropriate pricing tier; monitor usage dashboards

## 5. Conclusion

Adopting Langfuse as the centralized observability and storage platform represents a significant upgrade from the current fragmented approach using Azure Blob and Table Storage. By consolidating chat history, LLM interaction logs, and user feedback into a purpose-built platform, we gain unified analytics, improved debugging capabilities, and better cost visibility. The migration from Blob Storage to Langfuse simplifies the architecture while providing superior developer experience and compliance capabilities. This decision positions the BankDirekt AI Assistant for future enhancements like prompt versioning, A/B testing, and automated quality monitoring.

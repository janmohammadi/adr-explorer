---
title: "Migrate from web application to Outlook plugin clients"
status: accepted
date: 2025-09-29
deciders: ["Reza Janmohammadi"]
supersedes: []
amends: []
relates-to: []
tags: ["outlook", "plugin", "architecture", "frontend"]
---

# Migrate from Web Application to Outlook Plugin Clients

## 1. Introduction

Replace the existing FastAPI web application interface with native Outlook plugin clients.

**Note:** The implementation approach described in this ADR has evolved since its original acceptance. Please refer to these subsequent ADRs for current implementation details:
* **[ADR-0006](0006-unified-officejs-plugin-architecture.md)** - Unified Office.js plugin architecture (supersedes the dual VSTO + Office.js approach originally proposed)
* **[ADR-0005](0005-langfuse-integration-for-observability-and-storage.md)** - Langfuse integration for observability and storage (backend changes)
* **[ADR-0007](0007-entraid-authentication-and-authorization.md)** - EntraID authentication and authorization (concrete OAuth2/JWT implementation)

## 2. Current Challenges

* **Context Switching:** Users must leave their primary work environment (Outlook) to access the web chatbot, disrupting workflow and reducing adoption.
* **Authentication Friction:** Separate web application requires additional login steps, creating user resistance.
* **Limited Integration:** Web interface cannot access email context, attachments, or calendar data that could enhance AI responses.
* **Adoption Barriers:** Bank employees prefer tools that integrate seamlessly into existing workflows rather than standalone applications.
* **Discoverability:** Separate web application is less discoverable than an integrated plugin within the daily-used email client.

## 3. Proposed Solution

Develop native Outlook plugins to replace the web application, providing two implementations to cover the entire user base:

> **Update (January 2025):** The dual-plugin approach described below was later superseded by a unified Office.js implementation supporting all Outlook platforms. See [ADR-0006](0006-unified-officejs-plugin-architecture.md) for the final architecture. This section is retained for historical context.

* **Legacy Outlook Plugin:** For Outlook 2016/2019/2021 desktop clients using .NET Framework VSTO (Visual Studio Tools for Office)
* **Modern Outlook Plugin:** For Outlook on the Web, new Outlook desktop, and mobile clients using Office.js Add-in platform

### Key Advantages

* **Seamless Workflow Integration:**
    * Users access AI assistant directly within their email client
    * Reduces context switching and improves productivity
    * Sidebar/task pane integration keeps chatbot available while reading emails
* **Enhanced User Experience:**
    * Native look and feel consistent with Outlook UI
    * Access to email context (current message, sender, subject) for more relevant responses
    * Potential for proactive suggestions based on email content
* **Improved Adoption:**
    * Lower barrier to entry - no separate application to launch
    * Leverage existing corporate Outlook deployment infrastructure
    * Single sign-on through corporate credentials
* **Future-Proof Architecture:**
    * Aligns with Microsoft's Office add-in strategy
    * Positions for future Office 365 integrations (Teams, SharePoint)

## 4. Potential Risks and Mitigation

* **Deployment Complexity:** Enterprise Outlook plugin deployment varies across organizations
    * **Mitigation:** Support both centralized and manual deployment options
* **Version Fragmentation:** Supporting two separate plugin technologies increases maintenance burden
    * **Mitigation:** Share common backend API; use similar UI patterns; allocate dedicated resources for each platform
* **Legacy Outlook End-of-Life:** Microsoft may deprecate legacy Outlook, making VSTO investment short-lived
    * **Mitigation:** Monitor Microsoft's roadmap; design architecture to allow phased migration; prioritize Office.js development
* **Testing Overhead:** Must test across multiple Outlook versions and platforms
    * **Mitigation:** Establish automated testing pipeline; prioritize most common client versions; use virtual machines for legacy testing
* **User Resistance:** Some users may prefer web interface
    * **Mitigation:** Maintain web app for 3-month transition period; provide training materials; gather user feedback early
* **Corporate Firewall/Proxy Issues:** Plugins may face network restrictions
    * **Mitigation:** Work with IT to whitelist necessary Azure endpoints; provide troubleshooting documentation
* **Authentication Complexity:** SSO integration varies by organization
    * **Mitigation:** Support multiple auth methods (OAuth2, SAML, JWT); provide fallback to username/password

## 5. Conclusion

Migrating from a standalone web application to native Outlook plugins is a strategic decision that significantly improves usability, adoption, and integration within the BankDirekt organization. While the dual-plugin approach (VSTO + Office.js) introduces technical complexity, it ensures comprehensive coverage of the entire user base and positions the system for long-term success. The existing Azure backend remains largely unchanged, preserving the investment in the RAG pipeline and AI infrastructure. 

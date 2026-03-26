---
title: "Modern Outlook plugin using Office.js"
status: superseded
date: 2025-09-29
deciders: ["Reza Janmohammadi"]
supersedes: []
amends: []
relates-to: []
tags: ["outlook", "plugin", "officejs", "react", "frontend"]
---

# Modern Outlook Plugin Implementation using Office-js

**Superseded by [ADR-0006](0006-unified-officejs-plugin-architecture.md)**

**Note:** This ADR is retained for historical reference only. Do not reference for new development.

## 1. Introduction

**Note:** This ADR is **superseded by ADR-0006 (Unified Office.js Plugin Architecture)**. See ADR-0006 for current architecture. This document is retained for historical reference only.

---

This document details the technical implementation approach for the modern Outlook plugin targeting Outlook on the Web, new Outlook for Windows, Outlook for Mac, and Outlook mobile apps. The plugin will be built using the Office Add-ins platform (Office.js), providing a web-based task pane that embeds the BankDirekt AI Assistant chatbot interface across all modern Outlook clients.

**History:** Initially, there was uncertainty about Office.js support for legacy Outlook desktop versions (2016/2019/2021), which led to the creation of a parallel VSTO approach (ADR-0002). However, Microsoft extended Office.js to legacy Outlook clients, eliminating the need for separate implementations. ADR-0006 consolidates both modern and legacy approaches into a single unified Office.js architecture that works across all Outlook platforms.

## 2. Current Challenges

* **Cross-Platform Support:** Users access Outlook through multiple platforms (web browser, Mac, mobile) which legacy VSTO add-ins cannot support.
* **Cloud-First Strategy:** BankDirekt is migrating to Microsoft 365, requiring add-ins compatible with cloud-based Outlook services.
* **Modern Outlook Adoption:** New Outlook for Windows (replacing classic desktop client) only supports Office.js add-ins.
* **Mobile Workforce:** Increasing number of employees working remotely need access on mobile devices.
* **Update Distribution:** Traditional MSI installers don't work for web and mobile platforms.

## 3. Proposed Solution

Develop an Office.js-based Outlook add-in using modern web technologies with the following technical architecture:

### Technology Stack

* **Office.js 1.13+:** Microsoft's JavaScript API for Office add-ins
* **TypeScript 5.x:** Type-safe JavaScript for maintainable codebase
* **React 18.x:** Component-based UI framework
* **Fluent UI React (v9):** Microsoft's official design system matching Office UI
* **Webpack 5:** Module bundler for production optimization
* **Office Add-in Manifest:** XML manifest (schema 1.12+) defining add-in capabilities


## 4. Potential Risks and Mitigation

* **Cross-Platform Testing Complexity:** Must test on 6+ different Outlook clients
    * **Mitigation:** Prioritize most common platforms (Outlook Web, new Windows); use Office Add-in testing tools; establish test device lab
* **Manifest Approval Process:** AppSource submission can take 2-4 weeks
    * **Mitigation:** Start submission early; use organizational deployment initially; thorough validation before submission
* **Office.js API Limitations:** Some Outlook features not available in Office.js
    * **Mitigation:** Design within API constraints; document limitations; consider hybrid approach with context menu instead of inline features
* **Authentication Complexity:** MSAL.js authentication in iframe can be challenging
    * **Mitigation:** Use redirect flow instead of popup; implement token refresh; provide clear error messages for auth failures

## 5. Conclusion

Building the modern Outlook plugin using Office.js and React provides a future-proof, cross-platform solution that works seamlessly across Outlook on the Web, new Outlook desktop, Mac, and mobile clients. The web-based technology stack aligns with Microsoft's strategic direction for Office extensibility and enables rapid iteration and deployment through standard web development practices. Using Fluent UI React ensures visual consistency with the Office ecosystem, while TypeScript provides type safety and maintainability. This implementation positions BankDirekt AI Assistant for long-term success as Microsoft continues to invest in the Office Add-ins platform.

## Technical Specifications

* **Office.js Version:** 1.13+ (supports Outlook 2019+ and Office 365)
* **Node.js Version:** 18.x LTS or higher
* **TypeScript Version:** 5.x
* **React Version:** 18.x
* **Manifest Schema:** VersionOverridesV1_1 (schema 1.12)
* **Supported Outlook Clients:**
  * Outlook on the Web (modern)
  * New Outlook for Windows (desktop)
  * Outlook for Mac (version 16.35+)
  * Outlook mobile (iOS 14+, Android 8+)
* **Browser Requirements:** Modern evergreen browsers (Chrome, Edge, Safari, Firefox)
* **Hosting:** Azure Web App Service (B1 Basic or higher) - containerized hosting with NGINX
* **Authentication:** EntraID with MSAL.js 2.x for group-based access control

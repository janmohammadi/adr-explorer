---
title: "Legacy Outlook plugin using .NET Framework VSTO"
status: superseded
date: 2025-09-29
deciders: ["Reza Janmohammadi"]
supersedes: []
amends: []
relates-to: []
tags: ["outlook", "plugin", "vsto", "dotnet", "legacy"]
---

# Legacy Outlook Plugin Implementation using DotNET Framework VSTO

**Superseded by [ADR-0006](0006-unified-officejs-plugin-architecture.md) on 2025-01-14**

**Reason for Supersession:** Microsoft has extended Office.js support to legacy Outlook desktop versions (2016/2019/2021), eliminating the need for a separate VSTO implementation. The unified Office.js approach in ADR-0006 now covers all Outlook platforms with a single codebase.

**Note:** This ADR is retained for historical reference only. Do not reference for new development.

## 1. Introduction

This document details the technical implementation approach for the legacy Outlook plugin targeting Outlook 2016, 2019, and 2021 desktop clients on Windows. The plugin will be built using Visual Studio Tools for Office (VSTO) with .NET Framework 4.8, providing a custom task pane that embeds the BankDirekt AI Assistant chatbot interface within the Outlook desktop application.

## 2. Current Challenges

> **To Be Clarified:** Legacy Enterprise Environments: Many BankDirekt workstations run Outlook 2016/2019 on Windows 10, which do not support modern Office.js add-ins effectively.
* **Corporate IT Constraints:** Some departments have delayed migration to Microsoft 365 and new Outlook, requiring continued support for legacy desktop clients.
* **Feature Parity Requirements:** Users on legacy Outlook must receive the same AI assistant capabilities as modern Outlook users.
* **Performance Expectations:** Desktop users expect responsive, native-feeling applications rather than web-based interfaces.

## 3. Proposed Solution

Develop a VSTO-based Outlook add-in using .NET Framework 4.8 with the following technical architecture:

### Technology Stack

* **.NET Framework 4.8:** Last stable version with full VSTO support and Windows 10/11 compatibility
* **VSTO 2017/2019:** Visual Studio Tools for Office for Outlook integration
* **WPF (Windows Presentation Foundation):** Modern UI framework for custom task pane


### UI/UX Design

* **Theme:** Light/dark mode matching Outlook theme
* **Chat Bubbles:** Distinct styling for user messages vs AI responses
* **Markdown Rendering:** Convert markdown responses to rich text display
* **Source Links:** Clickable links to referenced documents

### Deployment Packaging

* **MSI Installer:** Using WiX Toolset 3.x
* **Prerequisites Checker:** Validate .NET Framework 4.8 installation
* **Registry Keys:** HKEY_CURRENT_USER or HKEY_LOCAL_MACHINE depending on deployment scope
* **Digital Signature:** Code sign with BankDirekt certificate
* **Automatic Updates:** ClickOnce deployment or custom update mechanism

## 4. Potential Risks and Mitigation

* **VSTO Obsolescence:** Microsoft is phasing out VSTO in favor of Office.js
    * **Mitigation:** Position as temporary solution for legacy users; plan 3-5 year lifecycle; encourage migration to modern Outlook
* **Deployment Complexity:** MSI deployment requires admin rights and Group Policy configuration
    * **Mitigation:** Provide detailed IT administrator guide; offer remote installation support; consider per-user ClickOnce alternative (see ADR-0004)
* **.NET Framework Version Conflicts:** Workstations may have older .NET versions
    * **Mitigation:** MSI includes .NET 4.8 installer; validate prerequisites before installation
* **Outlook Version Fragmentation:** Different Outlook versions may have API differences
    * **Mitigation:** Target common denominator (Outlook 2016 API); test on all supported versions; document known limitations
* **Corporate Security Policies:** Some organizations block all add-ins
    * **Mitigation:** Work with security team early; provide security documentation; consider add-in signing and trust policies
* **Performance Issues:** WPF task pane may be slow on older hardware
    * **Mitigation:** Optimize UI rendering; implement virtualization for long chat histories; provide performance tuning options
* **Update Mechanism:** MSI updates require re-installation
    * **Mitigation:** Implement version check on startup; notify users of updates; consider silent update via Group Policy

## 5. Conclusion

Building the legacy Outlook plugin using VSTO and .NET Framework 4.8 provides a robust solution for enterprise users still on Outlook 2016/2019/2021 desktop clients. While VSTO is a mature but deprecated technology, it remains the only viable option for deep Outlook integration on these legacy platforms. The WPF-based UI ensures a modern, responsive user experience, and the MSI deployment approach aligns with traditional enterprise software distribution practices. This implementation provides feature parity with the modern Office.js plugin while respecting the constraints of legacy corporate IT environments.

## Technical Specifications

* **Target Framework:** .NET Framework 4.8
* **Minimum Outlook Version:** Outlook 2016 (16.0)
* **Supported Windows Versions:** Windows 10 (1809+), Windows 11
* **Development IDE:** Visual Studio 2022
* **Installer Technology:** WiX Toolset 3.14+
* **UI Framework:** WPF with .NET Framework 4.8

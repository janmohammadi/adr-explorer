---
title: "Outlook plugin deployment and distribution strategy"
status: accepted
date: 2025-09-29
deciders: ["Reza Janmohammadi", "Anna Kovač"]
supersedes: []
amends: [ADR-0006]
relates-to: []
tags: ["deployment", "outlook", "plugin", "infrastructure"]
review-by: 2026-09-29
confidence: high
---

# Outlook Plugin Deployment and Distribution Strategy

## 1. Introduction

This ADR defines deployment options for the Office.js Outlook plugin, requiring collaboration with BankDirekt's IT department to select the appropriate method.

**Update (2025-01-14):** Following ADR-0006, the dual-plugin approach (VSTO + Office.js) has been abandoned in favor of a unified Office.js implementation that supports all Outlook platforms. This simplifies deployment to a single mechanism instead of managing two separate deployment processes.

**Update (2025-01-22):** Deployment method has been **finalized with customer IT department: AppSource Marketplace selected** (Option B). While Option A (Microsoft 365 Admin Center Centralized Deployment) was recommended as the better long-term solution, the customer IT administrator chose AppSource for broader visibility and self-service user installation capabilities. This decision includes a documented trade-off: AppSource requires Microsoft approval for each manifest change, resulting in slower deployment cycles (2-4 days per update) compared to centralized deployment (immediate updates).

**Update (2026-01-28):** Upon direct consultation with the customer IT department, the deployment method has been **corrected to Microsoft 365 Admin Center Centralized Deployment (Option A)**, as originally recommended. The previous update (2025-01-22) incorrectly documented AppSource Marketplace (Option B) as the selected method. Option A was always the architecturally preferred choice for an internal banking tool (see Decision Matrix, Section 5), and the customer has confirmed they use centralized deployment through their Microsoft 365 Admin Center. This eliminates the AppSource approval cycle risk and aligns deployment with standard enterprise internal tool distribution practices.

## 2. Current Challenges

* **Unknown Corporate IT Infrastructure:** Deployment capabilities (Intune, AppSource access, centralized deployment) are unclear
* **Security and Compliance:** Add-in deployment must comply with corporate security policies and approval processes
* **Rollback Capability:** Need mechanism to quickly disable/remove add-ins if issues arise
* **Version Management:** Strategy for updates, versioning, and backward compatibility unclear
* **Pilot Testing:** No established process for testing with limited user group before org-wide rollout
* **AKS Container Hosting:** Plugin SPA containerized and accessible from all Outlook clients via AKS ingress (see ADR-0006)

## 3. Proposed Solution

Define multiple deployment options for the Office.js plugin, with final selection pending IT department consultation:

### Office.js Plugin - Deployment Options

#### Option A: Microsoft 365 Admin Center Centralized Deployment (RECOMMENDED)
* **Description:** IT administrators deploy add-in through Microsoft 365 Admin Center, making it available to all users automatically
* **Pros:**
  * No user action required
  * Centrally managed and controlled
  * Automatic updates possible by updating manifest URL
  * Works across all Office.js-supported platforms (including Outlook 2016/2019/2021)
  * Granular user group targeting
  * Can deploy to specific departments or test groups first
* **Cons:**
  * Requires Microsoft 365 organization (not standalone Outlook)
  * IT admin involvement needed
  * Deployment may take 12-24 hours to propagate
* **Prerequisites:**
  * Microsoft 365 Business/Enterprise subscription
  * Global Administrator or Exchange Administrator permissions
  * Add-in manifest hosted on publicly accessible HTTPS URL
  * AKS cluster hosting the React SPA container (NGINX + static build) (see ADR-0006, ADR-0008)

#### Option B: AppSource Public Marketplace
* **Description:** Publish add-in to Microsoft AppSource for users to install themselves
* **Pros:**
  * Users can self-install without admin rights
  * Microsoft handles hosting and distribution
  * Automatic updates through AppSource
  * Increased visibility and discoverability
* **Cons:**
  * Microsoft review/approval process (2-4 weeks)
  * Subject to AppSource policies and guidelines
  * Less control over distribution
  * May not meet corporate security requirements for internal tools
  * Public visibility (may not be desirable for internal bank tool)
* **Prerequisites:**
  * Microsoft Partner Network membership
  * Passing AppSource validation
  * Compliance with Microsoft add-in policies
* **Recommendation:** **NOT RECOMMENDED** for internal bank tool due to public exposure

#### Option C: SharePoint App Catalog (Internal Distribution)
* **Description:** Upload add-in to organization's SharePoint App Catalog for internal distribution
* **Pros:**
  * Internal control without public AppSource exposure
  * Users can install from corporate catalog
  * Suitable for internal-only tools
  * Maintains privacy for bank-specific functionality
* **Cons:**
  * Requires SharePoint Online organization
  * Users must manually discover and install
  * More complex setup than centralized deployment
  * Less automatic than Option A
* **Prerequisites:**
  * SharePoint Online with App Catalog configured
  * Permissions to manage App Catalog



## 4. Potential Risks and Mitigation

* **IT Department Delays:** Infrastructure assessment and approval may take longer than expected
    * **Mitigation:** Engage IT stakeholders early; provide clear documentation; offer to assist with deployment setup
* **Deployment Method Restrictions:** Preferred deployment method may not be available
    * **Mitigation:** Prepare multiple deployment options; be flexible; prioritize user coverage over perfect solution
* **Security Policy Blockers:** Add-ins may be blocked by corporate security policies
    * **Mitigation:** Work with security team to whitelist add-ins and Azure endpoints; provide security documentation; conduct security audit of backend APIs and SPA

* **AKS Cluster Availability:** Plugin unavailable if cluster or pods fail
    * **Mitigation:** AKS auto-healing for pod failures; horizontal pod autoscaling (HPA) for high load; Azure Monitor alerts for cluster health; multi-replica deployments for plugin UI and backend API; document incident response procedures
* **Container Update Failures:** Rolling updates may cause brief downtime
    * **Mitigation:** Kubernetes rolling updates with readiness/liveness probes; blue-green deployment strategy for production; test update process during pilot in dev/staging namespaces; ability to quickly rollback to previous container image tag via kubectl
* **ACR Availability:** Registry failures prevent deployments
    * **Mitigation:** ACR geo-replication for high availability (if needed); Azure Monitor alerts for ACR health; maintain emergency backup of critical container images
* **Rollback Difficulties:** Reverting to previous container version requires pipeline redeployment
    * **Mitigation:** Establish emergency rollback procedures via Azure DevOps pipeline; maintain last 10 container image versions in ACR; implement feature flags in SPA code; thorough testing in dev/staging namespaces before production
* **Cross-Platform Compatibility Issues:** Plugin may behave differently across Outlook platforms
    * **Mitigation:** Comprehensive testing matrix during pilot (see Phase 5); Office.js polyfills for browser differences; graceful degradation for unsupported features

## 5. Decision Matrix

The following matrix will guide final deployment method selection:

| Criteria                        | Recommended Option                       |
| ------------------------------- | ---------------------------------------- |
| **Microsoft 365 Available**     | Option A (Centralized Deployment)        |
| **Microsoft 365 NOT Available** | Option C (SharePoint App Catalog)        |
| **Fast Rollout Required**       | Option A (Centralized Deployment)        |
| **Maximum Control Required**    | Option A (Centralized Deployment)        |
| **Internal Tool (Not Public)**  | Option A or C (NOT Option B - AppSource) |
| **Development/Testing Only**    | Option D (Manual Sideloading)            |

## 6. Conclusion



**Simplified by ADR-0006:** The unified Office.js approach eliminates the complexity of managing dual deployment mechanisms (VSTO + Office.js), reducing deployment effort by ~50% and simplifying support.

The most likely outcome for a modern enterprise organization is:
* **Recommended:** Microsoft 365 Admin Center Centralized Deployment (Option A)

However, this assumption must be validated through the assessment process.

## Technical Specifications

* **Deployment Target:** Single unified Office.js add-in (supports all Outlook platforms)

* **Manifest Distribution:** Microsoft 365 Admin Center Centralized Deployment (corrected 2026-01-28; see Update note in Section 1)
* **Supported Outlook Clients:**
  * Outlook 2016/2019/2021 for Windows (desktop)
  * New Outlook for Windows (desktop)
  * Outlook on the Web
  * Outlook for Mac (version 16.35+)
  * Outlook mobile (iOS 14+, Android 8+)
* **Authentication:** EntraID with group-based access control
* **Infrastructure as Code:** Bicep for AKS, ACR, VNet, Azure OpenAI, Azure AI Search
* **CI/CD:** Azure DevOps with Docker image build, Trivy security scanning, and kubectl deployment

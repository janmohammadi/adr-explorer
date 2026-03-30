---
title: "Unified Office.js plugin architecture"
status: accepted
date: 2025-01-14
deciders: ["Reza Janmohammadi"]
supersedes: [ADR-0002, ADR-0003]
amends: [ADR-0001]
relates-to:
  - id: ADR-0007
    reason: "Plugin SPA uses MSAL.js for EntraID auth; auth architecture must align with plugin hosting model"
tags: ["outlook", "plugin", "officejs", "architecture", "aks"]
---

# Unified Office-js Plugin Architecture

## 1. Introduction



### Historical Context: Why ADR-0003 Was Superseded

Microsoft extended Office.js support to legacy Outlook desktop versions, eliminating the need for separate VSTO and Office.js implementations.

## 2. Current Challenges

* **Dual Maintenance Burden:** Maintaining two separate codebases (VSTO .NET + Office.js TypeScript) doubles development, testing, and support costs
* **Feature Parity Complexity:** Ensuring identical functionality across VSTO and Office.js implementations requires duplicate effort
* **Deployment Fragmentation:** Different deployment mechanisms (MSI installers for VSTO vs. manifest for Office.js) complicate rollout and updates
* **VSTO Obsolescence:** Microsoft has deprecated VSTO in favor of Office.js, making long-term VSTO investment risky
* **Testing Overhead:** Testing matrix includes 2 plugin types × 5+ Outlook versions × 3 operating systems

**Breaking Discovery:**

Microsoft has quietly expanded Office.js support to **Outlook 2016/2019/2021 desktop clients** through cumulative updates, making the VSTO approach unnecessary. Office.js add-ins now work on:
* Outlook on the Web (always supported)
* New Outlook for Windows (always supported)
* Outlook for Mac (always supported)
* **Outlook 2016/2019/2021 for Windows** (newly supported via Windows Update)
* Outlook mobile (iOS/Android)

## 3. Proposed Solution

Develop a **single unified Office.js plugin** that works across all Outlook clients (classic desktop, modern desktop, web, Mac, mobile):

### Architecture: Iframe-Embedded React SPA (Containerized on AKS)

* **Plugin Container:** Office.js task pane (standardized across all Outlook versions)
* **UI Delivery:** `<iframe>` element loading React SPA from AKS-hosted NGINX container
* **Why iframe approach:**
    * **Isolation:** SPA runs in separate context from Office.js host, preventing API conflicts
    * **Flexibility:** Can use any modern web framework without Office.js limitations
    * **Independent Updates:** Update SPA container without republishing plugin manifest
    * **Kubernetes Scalability:** Horizontal pod autoscaling for high demand
    * **Security:** Content Security Policy enforced at iframe boundary

### Technology Stack

* **Frontend (Plugin UI):**
    * React 18.x with TypeScript 5.x
    * Fluent UI React v9 (Microsoft design system)
    * MSAL.js 2.x for EntraID authentication
    * Vite for build tooling (faster than Webpack)
    * **Container:** NGINX 1.25-alpine serving static build (~100MB)
* **Backend (API):**
    * FastAPI with Gunicorn
    * **Container:** Python 3.11-slim (~400MB)
    * **Hosting:** AKS cluster with Traefik ingress controller
* **Function App (Indexer):**
    * Azure Functions runtime for daily content indexing
    * **Container:** Azure Functions Python 4 image (~500MB)
    * **Deployment:** Kubernetes CronJob (weekdays 07:00 UTC)
* **Plugin Wrapper:**
    * Office.js manifest (XML schema 1.12+)
    * Minimal Office.js code to load iframe and handle context passing
* **Container Registry:**
    * Azure Container Registry (ACR) for all application images
    * Images: plugin-ui, web-app, function-app

### Hosting Architecture



### Key Advantages

* **Single Codebase:** One React SPA for all platforms reduces maintenance by 50%+
* **Unified Deployment:** Single Office.js manifest deployed via Microsoft 365 Admin Center centralized deployment
* **Simplified Testing:** Test matrix reduced from 10+ configurations to 5 Outlook versions
* **Future-Proof:** Aligned with Microsoft's strategic direction for Office extensibility
* **Faster Updates:** Update SPA container without redeploying plugin manifest
* **Cost Reduction:** Single AKS cluster for all components; unified CI/CD pipeline
* **Operational Consistency:** All backend services in same Kubernetes cluster

### Hosting: Azure Kubernetes Service (AKS)

* **Cluster:** Private AKS cluster with Azure CNI Overlay networking
* **Network Plugin:** Azure CNI with Overlay mode
* **Network Policy:** Calico for pod-to-pod traffic control
* **Ingress Controller:** Traefik with Let's Encrypt certificates
* **Container Registry:** Azure Container Registry (ACR) for image storage
* **Deployment:** Azure DevOps CI/CD pipeline with automated container builds and Kubernetes deployments
* **Edge Security:** Azure Front Door Premium with WAF for edge protection and DDoS mitigation
* **Scaling:** Horizontal Pod Autoscaler (HPA) for automatic scaling based on CPU/memory
* **Observability:** Self-hosted Langfuse stack with PostgreSQL, ClickHouse, Redis, MinIO

**Why AKS instead of Azure Web App Service:**
* **Unified Infrastructure:** All components (plugin UI, backend API, function app, Langfuse) in single AKS cluster
* **Cost Efficiency:** Single AKS cluster more economical than multiple App Service instances
* **Flexibility:** Kubernetes provides fine-grained control over resource allocation, scaling, and networking
* **Self-Hosted Langfuse:** Langfuse observability stack (PostgreSQL, ClickHouse, Redis) runs in AKS alongside application
* **CI/CD Simplicity:** Single deployment pipeline for all containerized components (see ADR-0008)
* **Networking:** Internal AKS service-to-service communication without public endpoint exposure
* **Scalability:** Kubernetes-native scaling with HPA provides better control than App Service auto-scaling

**Why AKS instead of Static Web Apps / Blob Storage:**
* Static Web Apps have iframe restrictions in some Outlook clients
* AKS provides full control over HTTP headers (CORS, CSP, X-Frame-Options) via NGINX configuration
* Kubernetes supports both static content (plugin UI) and dynamic APIs (backend) in unified infrastructure
* Better integration with EntraID authentication via AKS-managed identities

## 4. Potential Risks and Mitigation

* **Office.js Support on Legacy Outlook Unverified:** Risk that Office.js compatibility with Outlook 2016/2019/2021 is incomplete or buggy
    * **Mitigation:** Phase 1 proof of concept specifically validates this; if issues found, can fall back to VSTO for subset of users; monitor Microsoft support forums and roadmap
* **Iframe Performance:** Loading SPA in iframe may increase latency vs. native Office.js UI
    * **Mitigation:** Optimize bundle size (code splitting, tree shaking); NGINX caching for static assets; implement loading skeleton; measure P95 load time < 2 seconds; use multi-replica deployments for high availability
* **Cross-Origin Restrictions:** Some organizations block iframes from external domains
    * **Mitigation:** Document required firewall rules for IT admins; provide troubleshooting guide; configure NGINX headers for proper CORS/CSP; Azure Front Door for edge security (see ADR-0009)
* **Office.js API Limitations:** Office.js may have less functionality than VSTO for deep Outlook integration
    * **Mitigation:** Design within API constraints; document known limitations; prioritize most-used features (chat, insert reply); avoid features requiring COM interop
* **AKS Cluster Costs:** AKS cluster more expensive than single App Service
    * **Mitigation:** Right-size node VM (Standard_E2ads_v6 for dev, scale up for production); use single node pool initially; monitor cost dashboards; reserved instances for 30% discount; AKS free control plane
* **Container Orchestration Complexity:** Kubernetes adds operational overhead vs. App Service PaaS
    * **Mitigation:** Use Azure DevOps CI/CD for automated deployments (see ADR-0008); Azure Monitor for cluster observability; document operational runbooks; AKS auto-upgrade for node images
* **Propagation Delay:** Microsoft 365 Admin Center updates take 12-24 hours to propagate to all users
    * **Mitigation:** Schedule manifest updates during low-usage windows; communicate update timelines to stakeholders in advance; container updates (UI/backend) are independent of manifest propagation and take effect immediately; maintain rollback capability via previous container image tags

## 5. Conclusion

Abandoning the VSTO approach in favor of a unified Office.js plugin architecture dramatically simplifies the BankDirekt AI Assistant implementation while providing comprehensive coverage across all Outlook platforms. The discovery that Office.js now supports legacy Outlook desktop versions eliminates the primary justification for maintaining a separate .NET VSTO codebase. By delivering the UI as an iframe-embedded React SPA containerized on AKS with unified backend infrastructure, we gain the flexibility of modern web development while maintaining Office.js compatibility and achieving unified operations. This decision reduces maintenance burden by 50%+, accelerates development timelines, improves cost efficiency through infrastructure consolidation, and positions the plugin for long-term success aligned with Microsoft's Office extensibility strategy.

## Technical Specifications

### Plugin and Frontend
* **Office.js Version:** 1.13+ (supports Outlook 2016+ and Office 365)
* **Node.js Version:** 20.x LTS (build environment)
* **TypeScript Version:** 5.x
* **React Version:** 18.x
* **Manifest Schema:** VersionOverridesV1_1 (schema 1.12)
* **Supported Outlook Clients:**
  * Outlook 2016/2019/2021 for Windows (desktop)
  * New Outlook for Windows (desktop)
  * Outlook on the Web
  * Outlook for Mac (version 16.35+)
  * Outlook mobile (iOS 14+, Android 8+)
* **Browser Requirements:** Modern evergreen browsers (Chrome 90+, Edge 90+, Safari 14+, Firefox 88+)

### Backend Infrastructure
* **Container Orchestration:** Azure Kubernetes Service (AKS)
  * **Kubernetes Version:** 1.28+ (auto-upgraded by AKS)
  * **Network Plugin:** Azure CNI with Overlay mode
  * **Network Policy:** Calico
  * **Ingress Controller:** Traefik with Let's Encrypt certificates
* **Node Pool:**
  * **VM Size:** Standard_E2ads_v6 (2 vCPUs, 16 GiB RAM)
  * **Node Count:** 1 (dev), 3+ (production with auto-scaling)
  * **OS Disk:** 110 GB Ephemeral (high performance)
* **Container Registry:** Azure Container Registry (ACR)
  * **SKU:** Basic (dev), Standard (production for geo-replication)
  * **Images:** plugin-ui, web-app, function-app
* **Container Images:**
  * **Plugin UI:** node:18-alpine (build) + nginx:1.25-alpine (runtime) - ~100MB
  * **Backend API:** python:3.11-slim + FastAPI + Gunicorn - ~400MB
  * **Function App:** mcr.microsoft.com/azure-functions/python:4-python3.11 - ~500MB
* **Authentication:** EntraID with MSAL.js 2.x for group-based access control
* **Observability:** Self-hosted Langfuse stack in AKS for LLM logging and feedback collection
* **CI/CD:** Azure DevOps with Docker, Trivy security scanning, and kubectl deployment
* **Infrastructure as Code:** Bicep for AKS, ACR, VNet, Azure OpenAI, Azure AI Search

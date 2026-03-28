---
title: "CI/CD pipeline and containerization strategy"
status: accepted
date: 2025-01-17
deciders: ["Development Team"]
supersedes: []
amends: []
relates-to:
  - id: ADR-0009
    reason: "Pipeline deploys Front Door WAF rules and Private Link config alongside AKS resources"
tags: ["cicd", "devops", "containers", "security", "infrastructure"]
---

# CI/CD Pipeline and Containerization Strategy

## 1. Introduction

This document describes the Continuous Integration and Continuous Deployment (CI/CD) pipeline architecture for the BankDirekt AI Assistant system. The solution implements a fully automated deployment pipeline using Azure DevOps, Azure Container Registry (ACR), and Azure Kubernetes Service (AKS), with integrated security scanning to ensure code quality and vulnerability management throughout the software delivery lifecycle.

## 2. Current Challenges

* **Manual Deployment Process:** Applications are manually deployed to Azure, leading to inconsistency and human error
* **No Security Scanning:** Container images and code are not scanned for vulnerabilities before deployment
* **Environment Inconsistency:** Development, staging, and production environments may differ due to manual configuration
* **No Rollback Strategy:** Failed deployments require manual intervention and time-consuming recovery
* **Limited Observability:** Deployment success/failure metrics are not tracked systematically
* **Container Image Management:** No centralized registry for versioning and storing Docker images
* **Code Quality Gaps:** No automated static analysis or code quality checks before merge

## 3. Proposed Solution

Implement a comprehensive CI/CD pipeline using Azure DevOps with the following components:

### Containerization Strategy

All three application components will be containerized:
* **Backend API** (FastAPI web application) - Deployed to AKS
* **Function App** (Daily content indexer) - Deployed to AKS as CronJob
* **Plugin UI** (React SPA) - Deployed to AKS with NGINX reverse proxy

### Azure DevOps Pipeline Architecture

#### Build Pipeline (Continuous Integration)

**Trigger:** Git push to any branch
**Agent:** Azure DevOps hosted Ubuntu agent

**Stages:**
1. **Source Checkout**
   - Clone repository from Azure DevOps Git
   - Checkout specific branch/tag

2. **Code Quality Analysis (SonarQube)**
   - Static Application Security Testing (SAST)
   - Code smell detection
   - Technical debt measurement
   - Test coverage analysis
   - Quality gate enforcement (>80% coverage, zero critical bugs)

3. **Build Docker Images**
   - Build separate images for Backend API, Function App, Plugin UI
   - Tag with build number and git commit SHA
   - Multi-stage Dockerfile for optimized image size

4. **Container Security Scanning (Trivy)**
   - Scan Docker images for CVEs (Common Vulnerabilities and Exposures)
   - Scan both OS packages and application dependencies
   - Enforce severity threshold (fail on HIGH or CRITICAL)
   - Generate SARIF report for Azure DevOps integration

5. **Push to ACR**
   - Push images to Azure Container Registry (only if quality gates pass)
   - Tag with version number and 'latest' tag
   - Retain last 10 versions for rollback capability

#### Release Pipeline (Continuous Deployment)

**Trigger:** Successful build on master branch OR manual approval
**Agent:** Azure DevOps hosted Ubuntu agent with kubectl

**Stages:**
1. **Development Environment**
   - Deploy to dev namespace in AKS
   - Automatic deployment (no approval required)
   - Use 'latest' tag from ACR

2. **Staging Environment**
   - Deploy to staging namespace in AKS
   - Automatic deployment after dev success
   - Use version-tagged image from ACR
   - Run smoke tests to validate deployment

3. **Production Environment**
   - Deploy to production namespace in AKS
   - **Manual approval required** from product owner
   - Use version-tagged image from ACR
   - Blue-green deployment strategy for zero-downtime updates
   - Automated health checks post-deployment
   - Automatic rollback on failure

### Azure Container Registry (ACR)

**Purpose:** Centralized, private Docker image repository

**Configuration:**
* **SKU:** Standard (supports webhooks and geo-replication)
* **Geo-replication:** Single region (West Europe) initially
* **Image retention policy:** Keep last 10 versions of each image
* **Security:** Private endpoint, RBAC-based access control, vulnerability scanning enabled

**Image Naming Convention:**
```
<acr-name>.azurecr.io/<component>:<version>
Example: rlboai.azurecr.io/backend-api:1.2.3
         rlboai.azurecr.io/backend-api:build-456
         rlboai.azurecr.io/function-app:latest
```

### Security Scanning Tools

#### Trivy (Container Vulnerability Scanning)

**Purpose:** Identify vulnerabilities in container images before deployment

**Configuration:**
* **Scan targets:** OS packages, Python dependencies, npm packages
* **Severity levels:** LOW, MEDIUM, HIGH, CRITICAL
* **Fail threshold:** Fail build on HIGH or CRITICAL vulnerabilities
* **Report format:** SARIF (integrated with Azure DevOps Security tab)
* **Database updates:** Daily CVE database refresh

**Example Trivy Command:**
```bash
trivy image --severity HIGH,CRITICAL --exit-code 1 \
  --format sarif --output trivy-results.sarif \
  rlboai.azurecr.io/backend-api:build-456
```

#### SonarQube (Code Quality & SAST)

**Purpose:** Static code analysis, security vulnerability detection, code quality metrics

**Configuration:**
* **Hosted:** SonarCloud (cloud-hosted) or self-hosted SonarQube server
* **Languages:** Python, JavaScript/TypeScript
* **Quality Gates:**
  - Code coverage > 80%
  - Zero critical bugs
  - Zero critical security vulnerabilities
  - Technical debt ratio < 5%
* **Integration:** Azure DevOps build pipeline extension
* **Report:** Quality gate status displayed in Azure DevOps pull request

**Quality Gate Enforcement:**
- Pull requests cannot merge unless SonarQube quality gate passes
- Build pipeline fails if quality gate fails on master branch

### Deployment Flow Architecture

```
Developer Commits Code
  ↓
Azure DevOps Git Repository
  ↓
Build Pipeline Trigger
  ↓
[1] Code Quality Analysis (SonarQube)
  ├── Pass → Continue
  └── Fail → Stop (notify developer)
  ↓
[2] Build Docker Images (Backend API, Function App, Plugin UI)
  ↓
[3] Container Security Scan (Trivy)
  ├── No HIGH/CRITICAL → Continue
  └── Vulnerabilities Found → Stop (notify security team)
  ↓
[4] Push to Azure Container Registry
  ↓
Release Pipeline Trigger
  ↓
[5] Deploy to Dev Environment (AKS dev namespace)
  ↓
[6] Deploy to Staging (AKS staging namespace)
  ├── Run smoke tests
  └── Pass → Continue
  ↓
[7] Manual Approval Gate (Product Owner)
  ↓
[8] Deploy to Production (AKS production namespace)
  ├── Blue-green deployment
  ├── Health check validation
  └── Success → Mark build as production-ready
```

## 4. Potential Risks and Mitigation

* **Pipeline Complexity:** Multi-stage pipeline may be difficult to debug
    * **Mitigation:** Extensive logging at each stage; pipeline visualization in Azure DevOps; separate pipeline stages for easier isolation
* **Security Scan False Positives:** Trivy may flag vulnerabilities with no fix available
    * **Mitigation:** Trivy ignore file (.trivyignore) for documented exceptions; weekly review of ignored vulnerabilities; prioritize patching
* **Build Time Increase:** Security scans add 3-5 minutes to build time
    * **Mitigation:** Run scans in parallel where possible; cache SonarQube and Trivy databases; optimize Docker layer caching
* **ACR Capacity Limits:** Image storage may grow beyond quota
    * **Mitigation:** Retention policy to delete old images; image compression; monitor ACR storage metrics
* **AKS Deployment Failures:** Kubernetes deployment may fail due to resource constraints
    * **Mitigation:** Pre-deployment validation; resource quota monitoring; automated rollback on failure; canary deployment for production
* **Secret Management:** API keys and credentials needed in pipeline
    * **Mitigation:** Azure Key Vault integration; Azure DevOps secure variables; never commit secrets to Git; rotate secrets quarterly

## 5. Conclusion

Implementing a comprehensive CI/CD pipeline with integrated security scanning transforms the BankDirekt AI Assistant from a manually deployed prototype into a production-ready system with enterprise-grade DevSecOps practices. Azure DevOps provides native integration with Azure services (ACR, AKS, Key Vault), reducing operational complexity. Trivy and SonarQube ensure that security vulnerabilities and code quality issues are caught early in the development lifecycle, preventing production incidents. The multi-environment deployment strategy (dev/staging/prod) with manual approval gates provides confidence in release quality while maintaining deployment velocity.

## Technical Specifications

### Build Pipeline
* **Platform:** Azure DevOps (YAML-based)
* **Build Agent:** Microsoft-hosted Ubuntu 22.04
* **Docker Engine:** Docker 24.x
* **Build Time:** ~8-12 minutes (including security scans)

### Security Scanning
* **Trivy Version:** Latest stable (v0.48+)
* **SonarQube:** SonarCloud or SonarQube Community Edition 10.x
* **Scan Frequency:** Every build + daily scheduled scans of ACR images
* **Vulnerability Database:** NVD (National Vulnerability Database), updated daily

### Azure Container Registry
* **SKU:** Standard
* **Region:** West Europe
* **Authentication:** Service Principal (Azure DevOps) + RBAC
* **Retention:** 10 versions per image
* **Vulnerability Scanning:** Enabled (Microsoft Defender for Containers)

### Release Pipeline
* **Platform:** Azure DevOps Release Pipelines or YAML multi-stage
* **Deployment Strategy:** Blue-green for production, rolling for dev/staging
* **Approval Gates:** Manual approval required for production
* **Rollback Time:** < 5 minutes (automated rollback on health check failure)

### Container Images
* **Base Images:**
  - Backend API: `python:3.11-slim`
  - Function App: `mcr.microsoft.com/azure-functions/python:4-python3.11`
  - Plugin UI: `node:18-alpine` (build) + `nginx:1.25-alpine` (runtime)
* **Image Size Targets:**
  - Backend API: < 400MB
  - Function App: < 500MB
  - Plugin UI: < 100MB (NGINX + static files)

### Kubernetes Deployment
* **Tool:** Helm 3.x
* **Namespace Strategy:** dev, staging, production (separate namespaces)
* **Resource Limits:** CPU 500m-2000m, Memory 512Mi-4Gi (per component)
* **Health Checks:** HTTP liveness and readiness probes
* **Autoscaling:** Horizontal Pod Autoscaler (HPA) for production

### Environment Variables (Required)
* **Azure DevOps:**
  - `ACR_SERVICE_CONNECTION` - ACR authentication
  - `AKS_SERVICE_CONNECTION` - AKS cluster access
  - `SONAR_TOKEN` - SonarQube authentication
* **Container Runtime:**
  - All existing `.env` variables (see CLAUDE.md) injected as Kubernetes secrets

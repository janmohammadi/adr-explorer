---
title: "Azure Front Door for edge security"
status: accepted
date: 2025-12-10
deciders: ["Marc Dubois", "Anna Kovač"]
supersedes: []
amends: []
relates-to:
  - id: ADR-0008
    reason: "Front Door deployment is managed by the CI/CD pipeline, not standalone Bicep"
tags: ["security", "infrastructure", "azure", "compliance"]
review-by: 2026-12-10
confidence: high
---

# Azure Front Door for Edge Security

## 1. Introduction

This document describes the decision to implement Azure Front Door Premium as the edge security layer for the BankDirekt AI Assistant. Azure Front Door provides Web Application Firewall (WAF) protection, DDoS mitigation, and centralized SSL/TLS management required to meet Austrian FMA and EU DORA banking compliance regulations.

The solution integrates with the existing AKS-hosted backend via Private Link, ensuring the cluster remains fully private with no public endpoint exposure.

**Update (2025-01-22):** Azure Front Door Premium has been **fully deployed in production** as the edge security layer via the Azure DevOps pipeline ([azure-pipeline-prod.yml:313-496](../../deploy/azure-pipeline-prod.yml#L313-L496)). WAF policies are active, Private Link connectivity to AKS is operational, and all traffic flows through the Front Door with full OWASP 3.2 protection and DDoS mitigation enabled.

**Infrastructure Note:** Front Door deployment is in the CI/CD pipeline script, not in `deploy/main.bicep`. This provides flexibility for environment-specific configurations but reduces infrastructure-as-code coverage. Future work: Consider migrating to separate Bicep module for better IaC management.

## 2. Current Challenges

* **No Edge Security Layer:** AKS cluster is directly exposed to the internet without WAF protection
* **Decentralized SSL Management:** SSL certificates managed per-service, increasing operational overhead and risk of expiration
* **No Centralized WAF:** No protection against OWASP Top 10 attacks (SQL injection, XSS, etc.) at the edge
* **Compliance Gap:** Banking regulators (Austrian FMA, EU DORA) expect defense-in-depth architecture with edge security
* **DDoS Vulnerability:** No dedicated DDoS protection beyond basic Azure infrastructure
* **Public AKS Endpoint:** Current architecture exposes AKS publicly, which conflicts with security requirements

## 3. Proposed Solution

Implement Azure Front Door Premium as the single edge security gateway:

### Azure Front Door Premium

* **WAF Protection:** OWASP 3.2 managed ruleset with custom banking-specific rules
* **SSL Termination:** Centralized certificate management with auto-renewal (Azure-managed or BYOC)
* **DDoS Protection:** Standard tier protection included with Front Door
* **Load Balancing:** Built-in Layer 7 load balancing with health probes
* **Private Link:** Secure backend connectivity to private AKS cluster

### Traffic Flow

```
Internet (Outlook Plugin)
    |
    v HTTPS (public)
+---------------------------+
| Azure Front Door Premium  |
| - WAF inspection          |
| - SSL termination         |
| - DDoS protection         |
| - Load balancing          |
+---------------------------+
    |
    v Private Link (no public exposure)
+---------------------------+
| AKS Cluster (Private)     |
| - Plugin UI Pod           |
| - Backend API Pod         |
+---------------------------+
```

### Why Premium Tier (Not Standard)

| Feature              | Standard              | Premium                   |
| -------------------- | --------------------- | ------------------------- |
| WAF                  | Basic rules only      | Full OWASP + custom rules |
| Private Link         | Not supported         | Supported                 |
| Backend Connectivity | Public endpoints only | Private endpoints         |
| Bot Protection       | Not included          | Included                  |

**Premium is required because:**
* AKS cluster must remain fully private (no public IP) per security requirements
* Standard tier only supports public backend endpoints
* Private Link is essential for secure backend connectivity

### Why No Separate Load Balancer

* Front Door Premium includes built-in Layer 7 load balancing with health probes
* Private Link connects directly to AKS ingress controller
* AKS internal networking handles pod-level distribution
* Adding a separate Azure Load Balancer would add unnecessary complexity and cost

## 4. Potential Risks and Mitigation

* **Cost Increase (~€330/month for Front Door Premium)**
    * **Mitigation:** Cost is justified by banking compliance requirements; document cost-benefit analysis for stakeholders

* **Latency from WAF Inspection (~5-10ms additional latency)**
    * **Mitigation:** Acceptable trade-off for security; Front Door's global PoP network minimizes impact; monitor P95 latency

* **False Positives from WAF Rules**
    * **Mitigation:** Start with WAF in Detection mode during initial rollout; tune rules based on logs before switching to Prevention mode

* **Configuration Complexity**
    * **Mitigation:** Use Infrastructure as Code (Bicep/Terraform) for reproducible deployments; document all configurations

* **Private Link Setup Complexity**
    * **Mitigation:** Follow Azure documentation; test in non-production environment first; ensure AKS ingress is properly configured

## 5. Conclusion

Azure Front Door Premium provides the required edge security layer for the BankDirekt AI Assistant, satisfying Austrian FMA and EU DORA banking compliance requirements. The solution delivers:

* **Defense-in-depth architecture** with WAF, DDoS protection, and SSL termination at the edge
* **Zero public exposure** of AKS cluster through Private Link connectivity
* **Centralized SSL management** reducing operational overhead
* **Built-in load balancing** eliminating the need for a separate Azure Load Balancer

The Premium tier is required (not optional) because the security requirement for a fully private AKS cluster can only be met with Private Link support, which is exclusive to the Premium tier.

## Technical Specifications

* **Service:** Azure Front Door Premium
* **Deployment:** Azure DevOps pipeline via Azure CLI (see [azure-pipeline-prod.yml:313-496](../../deploy/azure-pipeline-prod.yml#L313-L496))
* **Region:** Global (with origin in West Europe)
* **WAF Policy:** OWASP 3.2 Default Rule Set (Microsoft_DefaultRuleSet 2.1) + Bot Manager RuleSet 1.0 + custom banking rules
* **SSL:** Azure-managed certificates (or BYOC)
* **Backend Connectivity:** Private Link to AKS Traefik ingress service (LoadBalancer with Private Link Service annotation)
* **AKS Integration:**
  * Private Link Service exposes AKS ingress controller
  * Front Door origin points to Private Link Service FQDN
  * No public IP exposure for AKS ingress
* **Routing Rules:**
  * `/plugin` → Plugin UI Pod (via Traefik)
  * `/api` → Backend API Pod (via Traefik)
  * `/langfuse` → Langfuse Web Pod (via Traefik)
* **Health Probes:** HTTP GET to `/` (100-second intervals), requires 3/4 successful samples
* **Endpoints:** Dual-endpoint architecture (afdep-prod-01, afdep-prod-02) for high availability
* **Estimated Cost:** ~€330/month (Front Door Premium base + WAF rules + data transfer)
* **Infrastructure as Code:** Not yet included in `deploy/main.bicep` - deployed via pipeline instead

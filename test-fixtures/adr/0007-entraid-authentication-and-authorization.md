---
title: "EntraID authentication and authorization"
status: accepted
date: 2025-01-14
deciders: ["Reza Janmohammadi"]
supersedes: []
amends: []
relates-to:
  - id: ADR-0006
    reason: "EntraID tokens are validated by the FastAPI backend hosted on the unified AKS architecture"
tags: ["auth", "security", "entraid", "backend"]
---

# EntraID Authentication and Authorization

## 1. Introduction

This document describes the authentication and authorization architecture for the BankDirekt AI Assistant Outlook plugin using Microsoft EntraID (Azure Active Directory). The solution leverages Single Page Application (SPA) authentication with the Microsoft Graph API to validate user identity and enforce group-based access control. This approach replaces the previously proposed OAuth2/JWT authentication with a concrete implementation that integrates seamlessly with the organization's existing Microsoft 365 infrastructure.

**Update (2025-01-22):** EntraID authentication has been **fully implemented in production**:
- **Outlook Plugin (SPA):** MSAL.js 2.x integration complete—users authenticate via EntraID and receive access tokens with `groups` claim
- **Backend (FastAPI):** Token validation implemented on all API endpoints (`/ai_reply`, `/feedback`, `/feedback_reasons`)
  - Token signature verified using EntraID JWKS public keys (24-hour cache)
  - `Plugin_Users` group membership enforced at the application boundary
  - Returns `401 Unauthorized` for invalid tokens, `403 Forbidden` for valid tokens without group membership
- **Migration Note:** The legacy `/bdchat`, `/save_chat`, `/get_chats`, `/delete_chat` endpoints have been retired as part of the simplified API surface (see CLAUDE.md security updates)

## 2. Current Challenges

* **No Actual Authentication:** The web application has cosmetic login/registration but no enforcement on `/bdchat` and other endpoints (see CLAUDE.md security warnings)
* **Password Management Burden:** Storing bcrypt-hashed passwords in Azure Table Storage creates security risks and maintenance overhead
* **Separate Login Flow:** Users must create separate credentials instead of using existing Microsoft 365 corporate accounts
* **Access Control Gaps:** No granular control over which employees can use the AI assistant
* **Audit Trail Deficiency:** Difficult to correlate AI usage with specific corporate identities for compliance
* **Token Validation Complexity:** Building custom JWT validation and refresh logic is error-prone

## 3. Proposed Solution

Implement EntraID (Azure AD) authentication using the following architecture:

### Single Page Application (SPA) Authentication

* **Authentication Method:** MSAL.js 2.x library in React SPA
* **Token Type:** Short-lived access tokens (60-90 minute expiration)
* **Token Acquisition:** Interactive login flow via EntraID consent prompt
* **Refresh Mechanism:** MSAL.js automatic silent token refresh using hidden iframe
* **Storage:** Tokens stored in browser session storage (cleared on tab close)

### Microsoft Graph API Permissions

**Delegated Permissions Required:**
* **`User.Read`** - Retrieve signed-in user's profile (name, email, department)
* **`Mail.Read`** - Access email content for context-aware AI responses

**Admin Consent:** Required (granted once by Global Administrator for entire tenant)

### Group-Based Access Control

* **Azure AD Security Group:** `Plugin_Users` (created by customer IT admin)
* **Membership Management:** IT admins add/remove users from group in Azure AD
* **Authorization Logic:**
    1. User authenticates and receives access token
    2. Token includes `groups` claim with all group object IDs
    3. Backend validates token signature using EntraID public keys
    4. Backend checks if `Plugin_Users` group ID is present in token claims
    5. Access granted only if user is member of authorized group

### Backend Token Validation

* **Library:** `PyJWT` + `python-jose` for JWT validation
* **Validation Steps:**
    1. Verify token signature using EntraID public keys (fetched from `https://login.microsoftonline.com/{tenant_id}/discovery/v2.0/keys`)
    2. Validate issuer (`iss` claim matches `https://login.microsoftonline.com/{tenant_id}/v2.0`)
    3. Validate audience (`aud` claim matches Application Client ID)
    4. Check expiration (`exp` claim not in past)
    5. Extract `groups` claim and verify `Plugin_Users` group object ID present
* **Caching:** Public keys cached for 24 hours to reduce latency
* **Error Handling:** Return `401 Unauthorized` for invalid tokens, `403 Forbidden` for valid tokens without group membership

### Architecture Flow

```
User (Microsoft 365 account)
  ↓
Opens Outlook Plugin
  ↓
SPA loads → MSAL.js initiates auth
  ↓
EntraID login page (if not already signed in)
  ↓
User consents to Mail.Read + User.Read permissions
  ↓
EntraID issues access token (with groups claim)
  ↓
SPA stores token in session storage
  ↓
API request: POST /ai_reply
  ├── Header: Authorization: Bearer <access_token>
  ↓
Backend FastAPI
  ├── Extract token from header
  ├── Validate signature with EntraID public keys
  ├── Check expiration, issuer, audience
  ├── Extract groups claim
  ├── Verify Plugin_Users group ID present
  ↓
If valid → Process request → Return AI response
If invalid → 401 Unauthorized
If valid but no group → 403 Forbidden
```

### Key Advantages

* **Zero Password Management:** Leverages existing Microsoft 365 credentials, no password storage required
* **Seamless User Experience:** Users already signed into Outlook automatically authenticated (SSO)
* **Centralized Access Control:** IT admins manage access via familiar Azure AD groups
* * **Compliance-Ready:** Full audit trail via EntraID sign-in logs (who accessed, when, from where)
* **Enterprise-Grade Security:** Token-based authentication with automatic expiration and refresh
* **Fine-Grained Permissions:** Can add additional groups for different access levels (e.g., `Plugin_Admins`)

## 4. Potential Risks and Mitigation

* **Customer IT Admin Dependency:** Setup requires Global Administrator access
    * **Mitigation:** Provide detailed step-by-step guide with screenshots; offer remote support during setup; validate all steps in test tenant first
* **Token Validation Performance:** Fetching EntraID public keys adds latency
    * **Mitigation:** Cache public keys for 24 hours; use async requests; pre-fetch keys on startup; monitor P95 latency < 100ms
* **Group Membership Delays:** Changes to `Plugin_Users` group may take up to 24 hours to reflect in tokens
    * **Mitigation:** Document expected delay; advise users to sign out and sign back in to force token refresh; consider implementing manual sync endpoint
* **Revoked Token Handling:** User removed from group but token still valid until expiration
    * **Mitigation:** Tokens expire after 60-90 minutes; for immediate revocation, implement token blocklist in Redis; monitor audit logs
* **MSAL.js Browser Compatibility:** Some legacy browsers don't support MSAL.js
    * **Mitigation:** Require modern browsers (documented in ADR-0006); graceful error message for unsupported browsers; fallback to basic auth if critical
* **Consent Prompt Confusion:** Users may be alarmed by Mail.Read permission request
    * **Mitigation:** Provide clear explanation in UI ("We only read emails you explicitly select for AI assistance"); admin consent removes individual prompts

## 5. Conclusion

Adopting EntraID authentication with group-based access control transforms the BankDirekt AI Assistant from an unsecured prototype into an enterprise-ready application. By leveraging Microsoft 365 infrastructure, we eliminate password management complexity, provide seamless single sign-on, and enable centralized access control through familiar IT admin workflows. The group-based authorization model offers flexibility for future enhancements (e.g., different permission tiers) while maintaining security and compliance standards. This implementation replaces the previously mentioned "OAuth2/JWT authentication" with a concrete, Microsoft-native solution that integrates naturally with the Outlook plugin architecture.

## Technical Specifications

* **Authentication Library:** MSAL.js 2.x (`@azure/msal-browser`)
* **Backend Validation:** PyJWT 2.x + python-jose[cryptography]
* **Token Type:** JWT (JSON Web Token) issued by EntraID
* **Token Lifetime:** 60-90 minutes (configurable by customer tenant)
* **Permissions:** `Mail.Read`, `User.Read` (delegated, admin-consented)
* **Authorization:** Group-based via `groups` claim in access token
* **Public Key Cache:** 24 hours (refreshed from EntraID JWKS endpoint)
* **Security:** HTTPS-only, token stored in browser session storage (not localStorage)
* **Compliance:** EntraID sign-in logs provide full audit trail

# Business Authorization V9 — Enterprise Identity & Trust Platform
# نموذج الصلاحيات — الإصدار التاسع — منصة الهوية والثقة المؤسسية

> **Status:** Architecture Documentation Only — Non‑Binding, Non‑Runtime
> **Scope:** Identity, Authentication, Federation, Credential & Trust Management
> **Non‑Scope:** Authorization Decisions (owned exclusively by V3–V8)
> **Backward Compatibility:** 100% with V3, V3.1, V4, V5, V6, V7, V8
> **Runtime Impact:** None. Zero source code, schema, RLS, SECURITY DEFINER,
> Edge Function, API, migration, test, generated type, or Supabase configuration
> changes are introduced by this document.

---

## Preface — تمهيد

Business Authorization V3 through V8 defined the **Authorization Platform** of
Practice Pulse Plus / ZMedico: permissions, bundles, roles, contexts,
relationships, policy engine, governance, distributed decision points, caching,
observability, and the enterprise authorization maturity model.

**V9 does not extend Authorization.** V9 defines the **Enterprise Identity &
Trust Platform (EITP)** — the upstream system that produces the *trusted
principal* that Authorization consumes. The two platforms are conceptually
distinct, independently versioned, and connected only through **stable
conceptual interfaces** (the *Trusted Principal Contract*, the *Trust
Assertion Contract*, and the *Session Assurance Contract*).

> **Boundary Statement (نص الحدود):**
> Identity (V9) **MUST NOT** make authorization decisions.
> Authorization (V3–V8) **MUST NOT** issue credentials or perform
> authentication. Any concept that appears to overlap is a **contract
> boundary**, not a duplication.

باللغة العربية: تُعرِّف الإصدار التاسع منصة الهوية والثقة المؤسسية، وهي
المسؤولة عن إصدار الهويات، والمصادقة، والاتحاد الفدرالي، وإدارة بيانات الاعتماد
وحدها. أما قرارات الصلاحيات فتبقى حصراً ضمن الإصدارات V3–V8.

---

## Table of Contents — جدول المحتويات

1. Identity Platform Overview — نظرة عامة على منصة الهوية
2. Identity Architecture — معمارية الهوية
3. Identity Lifecycle — دورة حياة الهوية
4. User Identity Model — نموذج هوية المستخدم
5. Machine Identity Model — نموذج هوية الآلة
6. Service Accounts — حسابات الخدمة
7. Identity Registry — سجل الهويات
8. Authentication Architecture — معمارية المصادقة
9. Multi-Factor Authentication Framework — إطار المصادقة متعددة العوامل
10. Passwordless Authentication — المصادقة بلا كلمة مرور
11. FIDO2 & WebAuthn — فايدو٢ وويب‑أوثن
12. OAuth2 Architecture — معمارية OAuth2
13. OpenID Connect — الاتصال المفتوح للهوية
14. SAML Federation — الاتحاد الفدرالي SAML
15. SCIM Provisioning — التزويد عبر SCIM
16. Session Management — إدارة الجلسات
17. JWT & Token Architecture — معمارية الرموز
18. Token Lifecycle — دورة حياة الرمز
19. Device Trust — ثقة الجهاز
20. Conditional Access — الوصول المشروط
21. Adaptive Authentication — المصادقة التكيفية
22. Identity Risk Engine — محرك مخاطر الهوية
23. Privileged Identity Management (PIM) — إدارة الهويات المميزة
24. Just-In-Time Privileges — الامتيازات الفورية
25. Cross-Tenant Trust — الثقة عبر المستأجرين
26. Secrets & Key Management — إدارة الأسرار والمفاتيح
27. Identity Observability — رصد الهوية
28. Identity Governance — حوكمة الهوية
29. Enterprise Identity Principles — مبادئ الهوية المؤسسية
30. Change Report — تقرير التغيير

---

## Conventions — الاصطلاحات

This document uses RFC 2119 / RFC 8174 keywords: **MUST**, **MUST NOT**,
**SHALL**, **SHOULD**, **SHOULD NOT**, **MAY**. Every chapter follows the
identical template used by V8:

- **Purpose** — الغرض
- **Architecture** — المعمارية (ASCII diagrams)
- **Rules** — القواعد
- **Examples** — أمثلة
- **Future Implementation Notes** — ملاحظات التنفيذ المستقبلي
- **Backward Compatibility Notes** — ملاحظات التوافق الرجعي
- **Security Notes** — ملاحظات الأمان
- **Performance Notes** — ملاحظات الأداء
- **Governance Notes** — ملاحظات الحوكمة

All identity objects are **versioned** (`v` field). All lifecycle transitions
are **immutable** once emitted (append‑only). All actions are **auditable**
through the Identity Audit Ledger defined in Chapter 27.

---

## Chapter 1 — Identity Platform Overview / نظرة عامة على منصة الهوية

### 1.1 Purpose

The Enterprise Identity & Trust Platform (EITP) is the authoritative source of
**principals** (human, machine, service, agent) and the **trust assertions**
attached to each principal at any moment in time. Its sole responsibility is
to answer three questions:

1. *Who is this principal?* — identification.
2. *Are they who they claim to be?* — authentication.
3. *How much do we trust them right now?* — assurance & context.

The answers are packaged into a **Trusted Principal Envelope (TPE)** which the
Authorization Platform (V3–V8) consumes to make decisions. EITP itself
**MUST NOT** evaluate permissions, bundles, roles, ReBAC edges, or policies.

### 1.2 Architecture

```
                +----------------------------------------------------+
                |              Enterprise Identity Platform (V9)     |
                |----------------------------------------------------|
                |  Identity Registry | AuthN Engine | Federation Hub |
                |  Credential Vault  | Risk Engine  | Session Store  |
                |  Device Trust      | PIM/JIT      | Governance     |
                +--------------------------+-------------------------+
                                           |
                          Trusted Principal Envelope (TPE)
                                           |
                                           v
                +----------------------------------------------------+
                |         Authorization Platform (V3–V8)             |
                |  Permissions | Bundles | Roles | Context | Policy  |
                |  ReBAC | PDP Cluster | Governance | Observability  |
                +----------------------------------------------------+
```

### 1.3 Rules

- The EITP **MUST** be the single source of truth for principal existence.
- The EITP **MUST NOT** persist or evaluate authorization decisions.
- Every TPE **MUST** carry an assurance level, an issue time, and an expiry.
- Every principal **MUST** have a stable identifier (`iid`) never reused.
- The Authorization Platform **MUST** treat TPEs as opaque, signed inputs.

### 1.4 Examples

```
TPE (conceptual):
  iid:          "usr_01HZK...G7"
  type:         "human"
  assurance:    "AAL2"
  federation:   "internal"
  session:      "sess_01HZK...QX"
  device_trust: "managed"
  risk_score:   12
  issued_at:    2026-07-13T09:12:07Z
  expires_at:   2026-07-13T09:27:07Z
  signature:    <detached JWS>
```

### 1.5 Future Implementation Notes

Future implementers **SHOULD** design the TPE as a compact JWS/CWT structure.
Actual data plane binding is out of scope for V9 and **MUST** proceed via the
V6 governance workflow.

### 1.6 Backward Compatibility Notes

V9 introduces no new required fields to any V3–V8 contract. Where legacy
authorization code inspects `auth.uid()`, that behavior remains unchanged.
TPE‑aware consumption is additive and opt‑in.

### 1.7 Security Notes

Trust assertions **MUST** be integrity‑protected. Confidentiality of the TPE
**SHOULD** rely on transport encryption; sensitive claims **MUST** be
minimized.

### 1.8 Performance Notes

TPE minting **SHOULD** be sub‑10 ms P95. Verification **SHOULD** be sub‑1 ms
P95 on the consumer side using cached JWKS.

### 1.9 Governance Notes

Any change to the TPE schema **MUST** proceed through the V6 Governance
Workflow with a two‑version deprecation window.

---

## Chapter 2 — Identity Architecture / معمارية الهوية

### 2.1 Purpose

Define the internal planes of the EITP and how they map to the V8 platform
planes without duplicating them.

### 2.2 Architecture

```
  +------------------------------------------------------------+
  |                     Identity Platform (V9)                 |
  +------------------------------------------------------------+
  | Data Plane   : Identity Registry, Credential Vault,        |
  |                Session Store, Device Registry              |
  | Control Plane: AuthN Engine, Federation Hub, Risk Engine   |
  | Governance   : Identity Governance, PIM, JIT Approvals     |
  | Observability: Identity Audit Ledger, Metrics, Traces      |
  | Developer    : Identity SDK Contracts, Simulation, Debug   |
  +------------------------------------------------------------+
                     |         (TPE, Trust Assertions)
                     v
  +------------------------------------------------------------+
  |                Authorization Platform (V3–V8)              |
  +------------------------------------------------------------+
```

### 2.3 Rules

- Each plane **MUST** be independently deployable in the future.
- Cross‑plane calls **MUST** use versioned interfaces.
- No plane **MAY** cache another plane's private state.

### 2.4 Examples

Cross‑plane call (conceptual):
`AuthN Engine → Risk Engine → Session Store → TPE Mint → Authorization Platform`.

### 2.5 Future Implementation Notes

Implementers **SHOULD** treat each plane as an isolated service boundary.
Splitting is not required for V9 compliance.

### 2.6 Backward Compatibility Notes

The current single‑process Supabase Auth deployment **SHALL** be considered a
valid degenerate topology of this architecture.

### 2.7 Security Notes

Private plane state (e.g., password hashes, WebAuthn public keys) **MUST**
never leave the Credential Vault plane.

### 2.8 Performance Notes

Cross‑plane latency budgets **SHOULD** be documented per interface.

### 2.9 Governance Notes

Any new plane requires an ADR under V6.

---

## Chapter 3 — Identity Lifecycle / دورة حياة الهوية

### 3.1 Purpose

Define the immutable lifecycle states of a principal.

### 3.2 Architecture

```
  [PROVISIONED] -> [ACTIVATED] -> [ACTIVE] -> [SUSPENDED] -> [DEPROVISIONED] -> [ARCHIVED]
         \                            |                              ^
          \-> [PENDING_VERIFICATION] -+                              |
                                       \--------> [LOCKED] ----------/
```

### 3.3 Rules

- State transitions **MUST** be append‑only.
- `iid` **MUST NOT** be reused after `ARCHIVED`.
- `SUSPENDED` principals **MUST** produce no valid TPE.
- `DEPROVISIONED` **MUST** revoke all credentials.

### 3.4 Examples

```
event: identity.state.changed
iid:   usr_01HZK...G7
from:  ACTIVE
to:    SUSPENDED
reason: manager.request
actor:  usr_admin_...
ts:     2026-07-13T09:15:00Z
```

### 3.5 Future Implementation Notes

A state machine engine **MAY** be introduced later; current Supabase Auth
users_map to `ACTIVE`.

### 3.6 Backward Compatibility Notes

Existing users are considered `ACTIVE` by default upon future adoption.

### 3.7 Security Notes

`LOCKED` **MUST** be triggered on defined risk thresholds; unlock **MUST**
require step‑up.

### 3.8 Performance Notes

State transitions **SHOULD** publish within 500 ms to the audit ledger.

### 3.9 Governance Notes

New states require V6 governance approval.

---

## Chapter 4 — User Identity Model / نموذج هوية المستخدم

### 4.1 Purpose
Model the human principal.

### 4.2 Architecture

```
  UserIdentity(v=1)
   ├── iid           (stable, never reused)
   ├── display_name  (mutable)
   ├── emails[]      (each: value, verified, primary)
   ├── phones[]      (each: value, verified, primary)
   ├── locales[]     (ordered)
   ├── tenants[]     (tenant memberships, opaque to AuthN)
   ├── credentials[] (references to Credential Vault)
   ├── mfa_methods[] (WebAuthn, TOTP, Push)
   ├── state         (see Chapter 3)
   └── metadata      (namespaced, non‑authoritative)
```

### 4.3 Rules
- Emails **MUST** be case‑insensitive on lookup, preserved on display.
- A user **MUST** have exactly one `primary` email at any moment.
- Tenant membership **MUST NOT** imply any role or permission.

### 4.4 Examples
```
iid: usr_01HZK
display_name: "Dr. Bilal Aamer"
emails: [{value:"bilal@example.com", verified:true, primary:true}]
mfa_methods: ["webauthn:passkey", "totp"]
state: ACTIVE
```

### 4.5 Future Implementation Notes
Model **MAY** be persisted in a normalized schema; not required by V9.

### 4.6 Backward Compatibility Notes
Maps cleanly onto existing `auth.users`.

### 4.7 Security Notes
Email/phone changes **MUST** re‑verify.

### 4.8 Performance Notes
Lookup by email **SHOULD** be O(1) via unique index.

### 4.9 Governance Notes
PII fields **MUST** be classified per Compliance Pack.

---

## Chapter 5 — Machine Identity Model / نموذج هوية الآلة

### 5.1 Purpose
Model non‑human callers (workloads, jobs, agents).

### 5.2 Architecture
```
  MachineIdentity(v=1)
   ├── iid
   ├── name
   ├── owner_iid       (accountable human)
   ├── workload_class  (job, agent, worker, batch)
   ├── credentials[]   (client_secret, mTLS cert, key‑pair)
   ├── attestations[]  (SPIFFE/SPIRE style, optional)
   ├── state
   └── expiry
```

### 5.3 Rules
- Every machine identity **MUST** have an accountable human owner.
- Machine identities **MUST** expire; renewal **MUST** be explicit.

### 5.4 Examples
```
iid: svc_01HZK
name: "invoice-pdf-worker"
owner_iid: usr_01HZK...G7
workload_class: worker
expiry: 2026-10-01T00:00:00Z
```

### 5.5 Future Implementation Notes
SPIFFE IDs **MAY** be adopted.

### 5.6 Backward Compatibility Notes
Existing service_role usage remains valid; future migration is optional.

### 5.7 Security Notes
Long‑lived machine secrets **SHOULD** be avoided; short‑lived tokens preferred.

### 5.8 Performance Notes
Machine AuthN **SHOULD** be sub‑5 ms.

### 5.9 Governance Notes
Machine identity creation **MUST** be reviewed quarterly.

---

## Chapter 6 — Service Accounts / حسابات الخدمة

### 6.1 Purpose
Formalize service accounts as a *specialization* of machine identity that
represents an application, not a workload instance.

### 6.2 Architecture
```
  ServiceAccount(v=1) : MachineIdentity
   ├── app_id
   ├── scopes[]        (OAuth2 scopes, see Ch.12)
   └── delegation[]    (allowed on‑behalf‑of chains)
```

### 6.3 Rules
- A service account **MUST NOT** hold direct authorization grants.
- Authorization for service accounts **MUST** be resolved by the Authorization
  Platform based on the TPE only.

### 6.4 Examples
`sa_reporting`, `sa_reminders_sender`.

### 6.5 Future Implementation Notes
Optional mapping to a `service_accounts` table in a future migration.

### 6.6 Backward Compatibility Notes
Additive.

### 6.7 Security Notes
Scopes **MUST** be least‑privilege.

### 6.8 Performance Notes
Scope evaluation **SHOULD** be cached with TPE.

### 6.9 Governance Notes
Service account creation requires named business owner.

---

## Chapter 7 — Identity Registry / سجل الهويات

### 7.1 Purpose
Authoritative directory of all principals.

### 7.2 Architecture
```
  +------------------- Identity Registry ---------------------+
  |  Principals: users, machines, service accounts, agents    |
  |  Indices:    by iid, by email, by tenant, by federation   |
  |  Streams:    identity.created, identity.updated, ...      |
  +-----------------------------------------------------------+
```

### 7.3 Rules
- Reads **MUST** be eventually consistent across regions.
- Writes **MUST** be authoritative (single writer per iid).
- Deletions **MUST** be soft (state=ARCHIVED).

### 7.4 Examples
`registry.lookup(email)`, `registry.list(tenant)`.

### 7.5 Future Implementation Notes
Could be backed by Supabase Auth extended with a `identities_view`.

### 7.6 Backward Compatibility Notes
Compatible with existing `auth.users`.

### 7.7 Security Notes
Public enumeration **MUST NOT** be possible.

### 7.8 Performance Notes
Lookups **SHOULD** be < 10 ms P95.

### 7.9 Governance Notes
Registry schema versioned via V6.

---

## Chapter 8 — Authentication Architecture / معمارية المصادقة

### 8.1 Purpose
Describe how AuthN happens without duplicating AuthZ.

### 8.2 Architecture
```
  Client --> AuthN Endpoint --> Method Router
                                  |
          +-----------+-----------+-----------+---------------+
          |           |           |           |               |
       Password    WebAuthn     OIDC       SAML            Device
          \           |           |           |               /
           +---------> Risk Engine <---------+---------------+
                              |
                          Session Mint
                              |
                              v
                          TPE Issued
```

### 8.3 Rules
- AuthN **MUST NOT** grant permissions.
- Every successful AuthN **MUST** yield exactly one session.
- Method choice **MUST** be policy‑driven (Ch. 20 / 21).

### 8.4 Examples
`login(email, password) → risk_eval → mfa_challenge → session → TPE`.

### 8.5 Future Implementation Notes
Method Router is a conceptual dispatcher; today it is a single function.

### 8.6 Backward Compatibility Notes
Supabase email/password flow maps to the Password branch.

### 8.7 Security Notes
Failure counters **MUST** be per‑principal and per‑IP.

### 8.8 Performance Notes
P95 AuthN **SHOULD** be ≤ 300 ms excluding user think time.

### 8.9 Governance Notes
Method deprecation goes through V6.

---

## Chapter 9 — Multi-Factor Authentication Framework / إطار MFA

### 9.1 Purpose
Standardize factor categories and combinations.

### 9.2 Architecture
```
  Factors:
   ├── Knowledge  (password, PIN)
   ├── Possession (TOTP, push, WebAuthn device, smartcard)
   ├── Inherence  (biometric, unlocked by device)
   └── Context    (device trust, geo, network) — assurance only
```

### 9.3 Rules
- AAL1 = 1 factor; AAL2 = 2 categories; AAL3 = phishing‑resistant possession.
- Context factors **MUST NOT** count as an independent factor.

### 9.4 Examples
Password + Passkey = AAL3.

### 9.5 Future Implementation Notes
A factor registry **MAY** be built as a config table.

### 9.6 Backward Compatibility Notes
Existing password login = AAL1; unchanged until policy demands step‑up.

### 9.7 Security Notes
SMS OTP **SHOULD NOT** be used for AAL2 in high‑risk paths.

### 9.8 Performance Notes
Factor evaluation **SHOULD** parallelize where independent.

### 9.9 Governance Notes
Factor policy owned by Security Committee.

---

## Chapter 10 — Passwordless Authentication / المصادقة بلا كلمة مرور

### 10.1 Purpose
Support magic link, email OTP, passkeys as first‑class methods.

### 10.2 Architecture
```
  User -> request(email) -> AuthN Engine -> Channel(email/push)
                                     -> Challenge stored
  User -> submit(challenge) -> verify -> session -> TPE
```

### 10.3 Rules
- Challenges **MUST** be single‑use and short‑lived (≤ 10 minutes).
- Rate limits **MUST** be enforced per identity and per IP.

### 10.4 Examples
Magic link, WebAuthn passkey, device‑bound push approval.

### 10.5 Future Implementation Notes
Existing Supabase magic link **MAY** be reused.

### 10.6 Backward Compatibility Notes
Additive.

### 10.7 Security Notes
Passkeys **SHOULD** be preferred over email OTP.

### 10.8 Performance Notes
Challenge validation **SHOULD** be O(1).

### 10.9 Governance Notes
Method availability per tenant is a governed policy.

---

## Chapter 11 — FIDO2 & WebAuthn / فايدو٢ وويب‑أوثن

### 11.1 Purpose
Adopt phishing‑resistant credentials as the strategic factor.

### 11.2 Architecture
```
  Browser (Authenticator) <---CTAP2/USB/BLE/Internal--- Platform
       |                                                   |
       +----------- WebAuthn API (navigator.credentials) --+
                                     |
                              Relying Party (V9)
                                     |
                             Credential Vault stores
                               (credentialId, publicKey, signCount, aaguid)
```

### 11.3 Rules
- Public keys only **MUST** be stored — never private keys.
- `signCount` regressions **MUST** trigger review.
- Attestation **MAY** be required for privileged roles.

### 11.4 Examples
Passkeys stored in iCloud Keychain, Google Password Manager, YubiKey 5.

### 11.5 Future Implementation Notes
Relying Party ID **MUST** be pinned to the primary domain.

### 11.6 Backward Compatibility Notes
Optional; coexists with password.

### 11.7 Security Notes
Attestation validation **SHOULD** use FIDO metadata service.

### 11.8 Performance Notes
Verify < 5 ms; ceremony bound by user interaction.

### 11.9 Governance Notes
Enrollment policy governed centrally.

---

## Chapter 12 — OAuth2 Architecture / معمارية OAuth2

### 12.1 Purpose
Standardize delegated authorization for API access.

### 12.2 Architecture
```
  Client -> Authorization Endpoint -> Consent -> Code
  Client -> Token Endpoint(code)   -> Access + Refresh
  Client -> Resource Server(AT)    -> Resource
```

### 12.3 Rules
- Authorization Code with PKCE **MUST** be used for all public clients.
- Implicit flow **MUST NOT** be used.
- Client credentials **MAY** be used for machine identities only.

### 12.4 Examples
Third‑party integrations, mobile app, external partner apps.

### 12.5 Future Implementation Notes
Supabase acts as the current AS conceptually; extension optional.

### 12.6 Backward Compatibility Notes
Current in‑browser session flow is unaffected.

### 12.7 Security Notes
Refresh tokens **MUST** rotate on use.

### 12.8 Performance Notes
Token endpoint **SHOULD** be < 50 ms P95.

### 12.9 Governance Notes
Client registration through V6.

---

## Chapter 13 — OpenID Connect / OIDC

### 13.1 Purpose
Identity layer on top of OAuth2, producing the `id_token`.

### 13.2 Architecture
```
  OIDC Provider (V9) -> id_token(JWT)
                        claims: sub, iss, aud, iat, exp, acr, amr, nonce
  Relying Party validates -> local session -> TPE upgrade
```

### 13.3 Rules
- `sub` **MUST** equal the principal `iid`.
- `acr`/`amr` **MUST** reflect the actual factors used.
- Nonce **MUST** be validated to prevent replay.

### 13.4 Examples
Login with Google → OIDC → TPE issued.

### 13.5 Future Implementation Notes
Discovery document (`/.well-known/openid-configuration`) **SHOULD** be exposed.

### 13.6 Backward Compatibility Notes
Optional; existing sessions unaffected.

### 13.7 Security Notes
`aud` mismatch **MUST** reject.

### 13.8 Performance Notes
JWKS **SHOULD** be cached with TTL ≥ 15 min.

### 13.9 Governance Notes
Claim schema versioned.

---

## Chapter 14 — SAML Federation / اتحاد SAML

### 14.1 Purpose
Enterprise SSO for tenants using SAML 2.0 IdPs.

### 14.2 Architecture
```
  Employee -> SP (V9) -> AuthnRequest -> IdP (Entra/Okta/etc.)
                                     <- SAMLResponse (signed)
  SP validates -> principal lookup or JIT provision -> session -> TPE
```

### 14.3 Rules
- SAMLResponse signature **MUST** be validated.
- Assertions **MUST** be time‑bounded and audience‑restricted.
- Domain‑based tenant routing **MUST** be deterministic.

### 14.4 Examples
`@hospital.example` domain federates to `Entra`.

### 14.5 Future Implementation Notes
Existing `supabase--configure_saml_sso` tool conceptually aligns here.

### 14.6 Backward Compatibility Notes
Non‑federated tenants continue unchanged.

### 14.7 Security Notes
XML Signature Wrapping attacks **MUST** be mitigated.

### 14.8 Performance Notes
SAML assertion validation **SHOULD** be < 30 ms.

### 14.9 Governance Notes
IdP metadata rotation policy required.

---

## Chapter 15 — SCIM Provisioning / التزويد عبر SCIM

### 15.1 Purpose
Automate lifecycle sync from external IdP to Identity Registry.

### 15.2 Architecture
```
  External IdP --SCIM 2.0 REST--> V9 SCIM Endpoint
                                     |
                        Identity Registry <-> Governance
```

### 15.3 Rules
- Create/Update/Deactivate **MUST** be idempotent by `externalId`.
- SCIM **MUST NOT** grant authorization; roles come from V3–V8 flows.

### 15.4 Examples
Okta lifecycle assigns app → creates user in V9 → JIT into `staff` role via V6.

### 15.5 Future Implementation Notes
Optional endpoint; not required for V9 documentation.

### 15.6 Backward Compatibility Notes
Existing manual invite flow untouched.

### 15.7 Security Notes
SCIM tokens **MUST** be scoped to `provisioning:*`.

### 15.8 Performance Notes
Bulk operations **SHOULD** be batched.

### 15.9 Governance Notes
Deprovisioning SLA ≤ 24 h.

---

## Chapter 16 — Session Management / إدارة الجلسات

### 16.1 Purpose
Model sessions as first‑class, revocable objects.

### 16.2 Architecture
```
  Session(v=1)
   ├── sid
   ├── iid                (principal)
   ├── issued_at, expires_at
   ├── idle_timeout
   ├── device_id
   ├── amr, acr
   ├── risk_at_issue
   └── state (ACTIVE|REVOKED|EXPIRED)
```

### 16.3 Rules
- Sessions **MUST** be revocable within 60 s enterprise‑wide.
- Concurrent session policy **MAY** be tenant‑configurable.

### 16.4 Examples
Admin revokes all sessions for a user upon role change.

### 16.5 Future Implementation Notes
Session store **SHOULD** be optimized for revocation lookups.

### 16.6 Backward Compatibility Notes
Supabase sessions map to `Session`.

### 16.7 Security Notes
Idle timeouts **MUST** apply to privileged sessions.

### 16.8 Performance Notes
Session read **SHOULD** be < 2 ms.

### 16.9 Governance Notes
Timeout defaults per Compliance Pack.

---

## Chapter 17 — JWT & Token Architecture / معمارية الرموز

### 17.1 Purpose
Standardize token shapes issued by V9.

### 17.2 Architecture
```
  Tokens:
   ├── id_token       (OIDC, identity assertions)
   ├── access_token   (OAuth2 API access, scopes)
   ├── refresh_token  (long‑lived, rotated)
   ├── tpe_token      (Trusted Principal Envelope, internal)
   └── decision_token (owned by V8, out of V9 scope)
```

### 17.3 Rules
- Tokens **MUST** be signed (JWS) or MAC‑protected (JWE with AEAD).
- Algorithms **MUST** be from an approved allow‑list (e.g., EdDSA, ES256).

### 17.4 Examples
`id_token` audience = client_id; `access_token` audience = resource server.

### 17.5 Future Implementation Notes
Key IDs (`kid`) **MUST** be present on all tokens.

### 17.6 Backward Compatibility Notes
Existing Supabase JWTs remain valid.

### 17.7 Security Notes
`alg=none` **MUST NOT** be accepted.

### 17.8 Performance Notes
Verification via cached JWKS **SHOULD** be < 1 ms.

### 17.9 Governance Notes
Algorithm allow‑list reviewed annually.

---

## Chapter 18 — Token Lifecycle / دورة حياة الرمز

### 18.1 Purpose
Define token issuance, renewal, rotation, revocation.

### 18.2 Architecture
```
  ISSUE -> USE -> RENEW (rotate refresh) -> REVOKE / EXPIRE
                        \-> REPLAY DETECTED -> REVOKE ALL
```

### 18.3 Rules
- Refresh tokens **MUST** rotate on every use.
- Replay of a used refresh token **MUST** revoke the entire session family.

### 18.4 Examples
Family‑based refresh rotation.

### 18.5 Future Implementation Notes
Family IDs **SHOULD** be embedded in refresh tokens.

### 18.6 Backward Compatibility Notes
Additive; current Supabase behavior remains valid.

### 18.7 Security Notes
Revocation lists **SHOULD** be short‑lived; prefer short expiry over CRL.

### 18.8 Performance Notes
Renewal **SHOULD** be < 30 ms.

### 18.9 Governance Notes
Token TTL defaults governed centrally.

---

## Chapter 19 — Device Trust / ثقة الجهاز

### 19.1 Purpose
Establish device as a first‑class trust anchor.

### 19.2 Architecture
```
  Device(v=1)
   ├── device_id (opaque, per‑install)
   ├── platform  (ios/android/mac/win/linux)
   ├── posture   (managed/unmanaged/jailbroken)
   ├── binding   (attestation, hardware‑backed key)
   └── last_seen
```

### 19.3 Rules
- Device identifiers **MUST NOT** be reused across principals.
- Posture **MAY** influence assurance but **MUST NOT** be a factor by itself.

### 19.4 Examples
Managed laptop → higher trust; jailbroken phone → restricted.

### 19.5 Future Implementation Notes
Optional integration with MDM signals.

### 19.6 Backward Compatibility Notes
Additive.

### 19.7 Security Notes
Device binding **SHOULD** use platform TEE where available.

### 19.8 Performance Notes
Posture check **SHOULD** be cached per session.

### 19.9 Governance Notes
Posture rules governed per tenant.

---

## Chapter 20 — Conditional Access / الوصول المشروط

### 20.1 Purpose
Gate authentication (not authorization) with condition sets.

### 20.2 Architecture
```
  Signals -> Condition Engine -> Decision(allow|step_up|block)
  Signals: user, group, device, network, geo, risk, time
```

### 20.3 Rules
- Conditional Access **MUST NOT** grant permissions.
- Decisions **MUST** be logged with full signal snapshot.

### 20.4 Examples
Block sign‑in from anonymizer networks; require MFA off corporate network.

### 20.5 Future Implementation Notes
Rule DSL **SHOULD** be declarative and versioned.

### 20.6 Backward Compatibility Notes
Additive; default policy = allow.

### 20.7 Security Notes
Rules **MUST** fail closed on evaluator error for high‑privilege roles.

### 20.8 Performance Notes
Evaluation **SHOULD** be < 10 ms.

### 20.9 Governance Notes
Policies owned by Security Committee.

---

## Chapter 21 — Adaptive Authentication / المصادقة التكيفية

### 21.1 Purpose
Dynamically choose factor combination based on risk.

### 21.2 Architecture
```
  Risk Score (Ch.22) --> Ladder:
     0–19   : password
     20–49  : password + TOTP
     50–79  : passkey required
     80–100 : deny + manual review
```

### 21.3 Rules
- Ladder mapping **MUST** be tenant‑overridable within governance bounds.

### 21.4 Examples
New country + new device → escalate to passkey.

### 21.5 Future Implementation Notes
Reuse V7 risk conceptual model.

### 21.6 Backward Compatibility Notes
Default ladder = current behavior.

### 21.7 Security Notes
Ladder **MUST** be documented per tenant.

### 21.8 Performance Notes
Ladder lookup **SHOULD** be O(1).

### 21.9 Governance Notes
Changes go through V6.

---

## Chapter 22 — Identity Risk Engine / محرك مخاطر الهوية

### 22.1 Purpose
Score identity events and sessions.

### 22.2 Architecture
```
  Signals -> Feature Extraction -> Model(s) -> Score(0–100)
          -> Reasons[] -> Consumers(AuthN, PIM, Session)
```

### 22.3 Rules
- Scores **MUST** be explainable (reasons list).
- Models **MUST** be versioned and evaluated offline before rollout.

### 22.4 Examples
Impossible travel, credential stuffing pattern, leaked password (HIBP).

### 22.5 Future Implementation Notes
Start rule‑based; ML optional later.

### 22.6 Backward Compatibility Notes
Additive; no default enforcement.

### 22.7 Security Notes
Model inputs **MUST NOT** include raw PII in ML pipelines.

### 22.8 Performance Notes
Scoring **SHOULD** be < 20 ms P95.

### 22.9 Governance Notes
Model changes reviewed by Security + Data governance.

---

## Chapter 23 — Privileged Identity Management (PIM) / إدارة الهويات المميزة

### 23.1 Purpose
Special controls for principals that can affect other identities.

### 23.2 Architecture
```
  Standing Privilege(discouraged) vs Eligible Privilege(preferred)
  Eligible -> Activation Request -> Approval -> Time‑Bound Session
```

### 23.3 Rules
- Admin bundles **SHOULD** be eligible, not standing.
- Activation **MUST** be time‑bounded and logged.

### 23.4 Examples
`admin` eligibility 4 h maximum, requires MFA at activation.

### 23.5 Future Implementation Notes
Activation events flow into V8 governance ledger.

### 23.6 Backward Compatibility Notes
Current standing admin role remains valid until migrated.

### 23.7 Security Notes
Break‑glass accounts covered here reuse V8 semantics.

### 23.8 Performance Notes
Activation **SHOULD** be sub‑second post‑approval.

### 23.9 Governance Notes
Quarterly PIM access review required.

---

## Chapter 24 — Just-In-Time Privileges / الامتيازات الفورية

### 24.1 Purpose
Elevate a principal transiently within an existing session.

### 24.2 Architecture
```
  Session(sid) -> JIT Request -> Step‑Up AuthN -> JIT Grant(ttl)
  JIT Grant     -> reflected as TPE claim -> consumed by V8 policy
```

### 24.3 Rules
- JIT grants **MUST NOT** persist beyond TTL.
- Every JIT activation **MUST** be recorded with justification.

### 24.4 Examples
Accountant requests JIT export of 90‑day invoice report.

### 24.5 Future Implementation Notes
Aligns with V7 JIT concept.

### 24.6 Backward Compatibility Notes
Additive.

### 24.7 Security Notes
JIT **MUST** require re‑authentication for AAL2+ scopes.

### 24.8 Performance Notes
Activation **SHOULD** be < 500 ms after user interaction.

### 24.9 Governance Notes
Reasons taxonomy governed.

---

## Chapter 25 — Cross-Tenant Trust / الثقة عبر المستأجرين

### 25.1 Purpose
Model federation between distinct tenants (e.g., partner hospitals).

### 25.2 Architecture
```
  Tenant A --Trust Assertion--> Tenant B
     |                              |
   IdP A                       V9 Federation Hub
                                    |
                              Guest Principal (v=1)
```

### 25.3 Rules
- Guest principals **MUST** be flagged and scoped.
- Trust relationships **MUST** be revocable within 60 s.

### 25.4 Examples
Referring physician from partner clinic granted read‑only guest access.

### 25.5 Future Implementation Notes
Optional; not required by current deployment.

### 25.6 Backward Compatibility Notes
Additive.

### 25.7 Security Notes
Guest data access governed by V8 policy, not V9.

### 25.8 Performance Notes
Trust lookup **SHOULD** be O(1) per tenant pair.

### 25.9 Governance Notes
Trust agreements require legal review.

---

## Chapter 26 — Secrets & Key Management / إدارة الأسرار والمفاتيح

### 26.1 Purpose
Manage cryptographic material used by the Identity Platform.

### 26.2 Architecture
```
  Key Types:
   ├── Signing keys (JWS)
   ├── Encryption keys (JWE)
   ├── Session keys
   └── Federation keys (SAML/OIDC)

  Lifecycle: create -> active -> rotating -> retired -> destroyed
```

### 26.3 Rules
- Private keys **MUST NOT** leave the Credential Vault plane.
- Rotation **MUST** be at least every 90 days for signing keys.

### 26.4 Examples
Dual‑key rollover with overlap window.

### 26.5 Future Implementation Notes
HSM/KMS integration optional.

### 26.6 Backward Compatibility Notes
Additive.

### 26.7 Security Notes
Compromise procedure **MUST** be documented.

### 26.8 Performance Notes
Signing **SHOULD** be < 2 ms per token.

### 26.9 Governance Notes
Key ceremonies logged.

---

## Chapter 27 — Identity Observability / رصد الهوية

### 27.1 Purpose
Provide full auditability for identity actions.

### 27.2 Architecture
```
  Identity Audit Ledger (append‑only)
   ├── AuthN attempts
   ├── AuthN successes / failures
   ├── MFA challenges
   ├── Lifecycle transitions
   ├── PIM activations
   ├── JIT grants
   └── Key rotations
  Metrics: latency, success rate, MFA coverage, risk distribution
  Traces:  OpenTelemetry spans across AuthN pipeline
```

### 27.3 Rules
- Ledger entries **MUST** be immutable and tamper‑evident.
- PII in logs **MUST** be minimized and classified.

### 27.4 Examples
SIEM ingestion via OTLP.

### 27.5 Future Implementation Notes
Ledger **MAY** be backed by an append‑only table with hash‑chain.

### 27.6 Backward Compatibility Notes
Additive; existing Supabase audit remains valid.

### 27.7 Security Notes
Ledger **MUST** be independently backed up.

### 27.8 Performance Notes
Write latency ≤ 50 ms P95.

### 27.9 Governance Notes
Retention per Compliance Pack (HIPAA ≥ 6 years).

---

## Chapter 28 — Identity Governance / حوكمة الهوية

### 28.1 Purpose
Human oversight over the identity estate.

### 28.2 Architecture
```
  Access Reviews  ── quarterly ── Owners
  Recertification ── PIM, guests, service accounts
  Segregation of Duties ── conflicting bundles flagged
  Emergency Access ── break‑glass with mandatory review
```

### 28.3 Rules
- Reviews **MUST** produce evidence artifacts.
- Unreviewed high‑privilege identities **SHOULD** be downgraded automatically.

### 28.4 Examples
Quarterly review of `admin` eligibility set.

### 28.5 Future Implementation Notes
Reuse V6 governance workflow engine conceptually.

### 28.6 Backward Compatibility Notes
Additive.

### 28.7 Security Notes
SoD conflicts **MUST** block activation.

### 28.8 Performance Notes
Review dashboards **SHOULD** load < 2 s.

### 28.9 Governance Notes
Owned by Security & Compliance Committee.

---

## Chapter 29 — Enterprise Identity Principles / مبادئ الهوية المؤسسية

### 29.1 Purpose
State the invariant principles governing all V9 evolution.

### 29.2 Architecture
```
  P1  Identity ≠ Authorization
  P2  Every principal has a stable, non‑reusable identifier
  P3  Every authentication yields a Trusted Principal Envelope
  P4  Least assurance necessary, escalated by risk
  P5  Phishing‑resistant credentials preferred
  P6  Explicit lifecycle, immutable transitions
  P7  Federation over duplication
  P8  Governed elevation, never standing privilege by default
  P9  Observability is non‑optional
  P10 Backward compatibility is a hard constraint
```

### 29.3 Rules
- Any proposed V9 change **MUST** be tested against P1–P10.

### 29.4 Examples
A proposal to embed roles in `id_token` **MUST** be rejected under P1.

### 29.5 Future Implementation Notes
Principles referenced by V6 ADR templates.

### 29.6 Backward Compatibility Notes
Principles are additive; they do not invalidate prior versions.

### 29.7 Security Notes
Violations **MUST** be treated as security incidents.

### 29.8 Performance Notes
N/A.

### 29.9 Governance Notes
Principles amended only by unanimous committee decision.

---

## Trust Boundary Diagrams / مخططات حدود الثقة

```
  +-------------------+       Trusted Principal Envelope       +--------------------+
  |   Identity (V9)   | --------------------------------------> | Authorization (V8) |
  +-------------------+                                         +--------------------+
          ^                                                             |
          |                Revocation / State Change Events             |
          +-------------------------------------------------------------+
```

Trust boundaries are enforced by:
- Signed envelopes (integrity)
- Short TTL (freshness)
- Revocation events (liveness)
- Independent audit ledgers (accountability)

---

## Federation Diagram / مخطط الاتحاد الفدرالي

```
  User @ hospital.example
        |
        v
   Corporate IdP (Entra/Okta)
        |  SAML / OIDC
        v
   V9 Federation Hub  --> Identity Registry (JIT provision)
        |
        v
     Session + TPE
        |
        v
   Authorization Platform (V8)
```

---

## Token Lifecycle Diagram / مخطط دورة حياة الرمز

```
  [Issued] -> [Active] -> [Renewed(rotate)] -> [Active'] ... -> [Expired]
                    \                                            /
                     -> [Revoked] <-------------------------------
                     -> [Replayed] -> [Family Revoked]
```

---

## Identity Governance Workflow / سير عمل الحوكمة

```
  Proposal -> ADR (V6 template) -> Security Review -> Compliance Review
           -> Approval -> Staged Rollout -> Post‑Impl Review -> Ledger Entry
```

---

## Compatibility Matrix / مصفوفة التوافق

| Concept                       | V3 | V3.1 | V4 | V5 | V6 | V7 | V8 | V9 |
|-------------------------------|----|------|----|----|----|----|----|----|
| Permissions & Bundles         | ✔  | ✔    | ✔  | ✔  | ✔  | ✔  | ✔  | —  |
| Role Assignments              | ✔  | ✔    | ✔  | ✔  | ✔  | ✔  | ✔  | —  |
| Context / ReBAC               |    |      |    |    |    | ✔  | ✔  | —  |
| Policy Engine                 |    |      |    |    |    | ✔  | ✔  | —  |
| Governance Workflow           |    |      |    |    | ✔  | ✔  | ✔  | ✔* |
| Distributed PDP / Cache       |    |      |    |    |    |    | ✔  | —  |
| Identity Registry             |    |      |    |    |    |    |    | ✔  |
| Federation (SAML/OIDC/SCIM)   |    |      |    |    |    |    |    | ✔  |
| Passkeys / WebAuthn           |    |      |    |    |    |    |    | ✔  |
| PIM / JIT (identity side)     |    |      |    |    |    |    |    | ✔  |
| Device Trust / Conditional AC |    |      |    |    |    |    |    | ✔  |

`*` V9 reuses V6 governance conceptually; it does not modify it.

---

## Version Matrix / مصفوفة الإصدارات

| Version | Layer                            | Runtime Change |
|---------|----------------------------------|----------------|
| V3      | Baseline Authorization           | Yes (historic) |
| V3.1    | Review                           | No             |
| V4      | Enterprise Concepts              | No             |
| V5      | Implementation Architecture      | No             |
| V6      | Execution Governance             | No             |
| V7      | Policy, Context, Relationships   | No             |
| V8      | Distributed / Enterprise Platform| No             |
| V9      | Identity & Trust Platform        | **No**         |

---

## Roadmap / خارطة الطريق

Phase 1 — **Foundations (docs)**: this V9 document.
Phase 2 — **TPE Contract Ratification** via V6.
Phase 3 — **Passkeys pilot** for admin bundle.
Phase 4 — **Conditional Access** rules (tenant scoped).
Phase 5 — **PIM & JIT** identity‑side controls.
Phase 6 — **Federation Hub** (SAML/OIDC) tenants.
Phase 7 — **SCIM Provisioning** connectors.
Phase 8 — **Risk Engine** rules → optional ML.
Phase 9 — **Cross‑tenant trust** for partner networks.
Phase 10 — **Full Identity Governance** dashboards.

Each phase requires a V6 ADR and staged rollout.

---

## Implementation Phases / مراحل التنفيذ

All phases are **future** and **out of scope** for V9. No commit in this
repository as part of V9 introduces runtime behavior.

---

## Rollback Philosophy / فلسفة التراجع

Because V9 is documentation only, rollback consists of deleting this file.
No schema, code, or configuration reverts are required. Future
implementations built on V9 concepts **MUST** define their own rollback
plans, per V6.

---

## Future Risks / المخاطر المستقبلية

- **R1** Scope creep of V9 into V8 authorization decisions.
- **R2** Federation misconfiguration exposing wrong tenant.
- **R3** Passkey enrollment friction reducing MFA coverage.
- **R4** Risk engine false positives locking legitimate users.
- **R5** Cross‑tenant guest identity being over‑trusted.
- **R6** Key management drift between environments.
- **R7** SCIM deprovisioning delays leaving orphan sessions.
- **R8** Session revocation lag beyond 60 s SLO.
- **R9** Overlap with V7 risk model unless boundaries respected.
- **R10** Audit ledger tampering if not independently stored.

Each risk **SHALL** have a mitigation ADR before its related phase ships.

---

## Change Report / تقرير التغيير

### Files Created
- `docs/auth/BUSINESS_AUTHORIZATION_V9_ENTERPRISE_IDENTITY_AND_TRUST_PLATFORM.md`

### Files Modified
- None.

### Files Deleted
- None.

### Files Untouched
- All source code under `src/**`
- All Edge Functions under `supabase/functions/**`
- All migrations under `supabase/migrations/**` (if any)
- All generated types (`src/integrations/supabase/types.ts`)
- All existing authorization documents (V3, V3.1, V4, V5, V6, V7, V8)
- All Supabase configuration (`supabase/config.toml`, `.env`)
- All tests
- All RLS policies
- All SECURITY DEFINER functions
- All APIs, routes, hooks, components, services

### Runtime Impact
- **None.** Zero behavior changes.

### Compliance Confirmation
- **No** source code changes.
- **No** SQL / schema / migration changes.
- **No** Supabase configuration changes.
- **No** RLS policy changes.
- **No** Edge Function changes.
- **No** API / route / hook / component / service changes.
- **No** generated type changes.
- **No** test changes.
- **No** modifications to prior authorization documents.
- Documentation only.

---

## Final Confirmation / التأكيد النهائي

**Business Authorization V9 — Enterprise Identity & Trust Platform** is
documentation only. It defines the Identity boundary that stands *above* and
*alongside* the Authorization Platform (V3–V8) without modifying it.

> **V9 introduces zero runtime behavior changes and is purely an
> architectural documentation layer that extends V3–V8 while remaining
> fully backward compatible.**

*End of Document — نهاية الوثيقة*
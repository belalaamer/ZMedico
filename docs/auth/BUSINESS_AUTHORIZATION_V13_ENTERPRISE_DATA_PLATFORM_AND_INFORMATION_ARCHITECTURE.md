# Business Authorization V13 — Enterprise Data Platform & Information Architecture
# نموذج الصلاحيات — الإصدار الثالث عشر — منصة البيانات المؤسسية ومعمارية المعلومات

| Field | Value |
|---|---|
| Status | Architecture Documentation Only — Ratified |
| Version | V13.0.0 |
| Scope | Enterprise Data Platform (EDP) & Information Architecture |
| Runtime Impact | **None** |
| Backward Compatibility | 100% with V3, V3.1, V4, V5, V6, V7, V8, V9, V10, V11, V12 |
| Terminology | RFC 2119 — MUST, SHALL, SHOULD, MAY, MUST NOT |
| Predecessors | V8 Authorization · V9 Identity · V10 Security · V11 Governance · V12 Observability |
| Successor | Reserved (V14) |
| Document Type | Enterprise Architecture Specification |
| Runtime Behavior | Zero changes — no code, no SQL, no config, no infra, no policy |

> **NOTE — Documentation Only.** This document defines the Enterprise Data Platform (EDP) and Information Architecture as an *architectural specification*. It MUST NOT be interpreted as an implementation instruction, a migration, or a runtime change. No source code, SQL, Supabase configuration, RLS policy, SECURITY DEFINER function, Edge Function, React component, TypeScript module, generated type, test, package manifest, migration, or infrastructure asset is created, altered, or deleted by this document. Any future implementation MUST proceed through the Governance Workflow ratified in V6 and remain within the architectural boundaries codified in V8, V9, V10, V11, and V12.

V13 owns **only** Enterprise Data Architecture. It does **not** own Authorization (V8), Identity (V9), Security (V10), Governance (V11), or Observability (V12).

---

## Master Architecture Diagram

```text
 ┌────────────────────────────────────────────────────────────────────────┐
 │                        ZMedico Enterprise Platform                     │
 └────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
 ┌────────────────────────────────────────────────────────────────────────┐
 │                            Business Domains                            │
 │   Clinical · Revenue · Scheduling · HR · Inventory · Reporting · ...   │
 └────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
 ┌────────────────────────────────────────────────────────────────────────┐
 │                         Application Services                           │
 └────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
 ┌────────────────────────────────────────────────────────────────────────┐
 │            V13 — Enterprise Data Platform (EDP)                        │
 │  Canonical Model · Data Products · Contracts · Lineage · Quality       │
 │  Lake · Warehouse · Lakehouse · Streaming · Batch · Feature Store      │
 └────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
 ┌────────────────────────────────────────────────────────────────────────┐
 │            V12 Observability · V11 Governance · V10 Security           │
 │            V9  Identity      · V8  Authorization                       │
 └────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
 ┌────────────────────────────────────────────────────────────────────────┐
 │                          Infrastructure / Cloud                        │
 └────────────────────────────────────────────────────────────────────────┘
```

---

## Architecture Overviews

### Enterprise Data Flow

```text
ingest ─▶ raw ─▶ cleansed ─▶ conformed ─▶ curated ─▶ serving
                                              │
                                              └─▶ analytics / ML / BI
```

### Canonical Data Model

```text
Party ── Encounter ── Order ── Result
   │        │         │        │
 Actor   Location   Product   Evidence
```

### Data Lifecycle

```text
Create ─▶ Store ─▶ Use ─▶ Share ─▶ Archive ─▶ Destroy
```

### Master Data

```text
MDM Hub ─▶ Golden Record ─▶ Downstream Systems
```

### Reference Data

```text
Reference Registry ─▶ Code Sets ─▶ Consumers
```

### Metadata Flow

```text
Sources ─▶ Scanner ─▶ Catalog ─▶ Governance ─▶ Consumers
```

### Data Governance

```text
Council ─▶ Policies ─▶ Stewards ─▶ Enforcement ─▶ Audit
```

### Data Ownership

```text
Domain Owner ──▶ Data Product Owner ──▶ Steward ──▶ Custodian
```

### Data Lineage

```text
Source ─▶ Transform ─▶ Sink  (edges = jobs)
```

### Data Warehouse

```text
OLTP ─▶ Staging ─▶ DW (star/snowflake) ─▶ Marts ─▶ BI
```

### Lakehouse

```text
Files (Parquet/Delta) ─▶ Table Format ─▶ Query Engine
```

### Streaming

```text
Producer ─▶ Broker ─▶ Stream Processor ─▶ Sink
```

### Batch

```text
Scheduler ─▶ Extractor ─▶ Transformer ─▶ Loader
```

### CDC

```text
Source WAL ─▶ Capture ─▶ Topic ─▶ Consumer
```

### Data Contracts

```text
Producer ── Contract ── Consumer (schema + SLA + semantics)
```

### Schema Registry

```text
Producer ─▶ Registry ◀─ Consumer  (compat check)
```

### Data Products

```text
Domain ─▶ Data Product ─▶ Port (API / File / Stream)
```

### Data Mesh

```text
Domains publish products ──▶ Federated Governance
```

### Analytics Pipeline

```text
Raw ─▶ Bronze ─▶ Silver ─▶ Gold ─▶ Dashboards
```

### BI Architecture

```text
Sources ─▶ Semantic Layer ─▶ Reports / Dashboards / Ad-hoc
```

### Search Architecture

```text
Indexer ─▶ Index ─▶ Query Parser ─▶ Ranker ─▶ Results
```

### Knowledge Graph

```text
Entities ── Relationships ── Ontology ── Reasoner
```

### AI Pipeline

```text
Data ─▶ Features ─▶ Train ─▶ Evaluate ─▶ Deploy ─▶ Monitor
```

### Feature Store

```text
Offline Store ── Online Store (low-latency serving)
```

### Reporting Flow

```text
Definition ─▶ Query ─▶ Render ─▶ Distribute
```

### Data Quality Pipeline

```text
Profile ─▶ Rules ─▶ Test ─▶ Score ─▶ Alert
```

### Multi-Tenant Data Isolation

```text
tenant_id predicate on every row + storage partitioning
```

### Backup Flow

```text
Full ─▶ Incremental ─▶ Verify ─▶ Offsite ─▶ Restore Drill
```

### Retention Flow

```text
Class ─▶ Timer ─▶ Move ─▶ Archive ─▶ Purge (with legal hold)
```

---

## Chapter Template

Every chapter below uses the canonical structure: Purpose, Architecture, ASCII Diagram, Rules, Examples, Future Implementation Notes, Backward Compatibility Notes, Security Notes, Performance Notes, Governance Notes. Every chapter is documentation only.

---

## Chapter 1 — Enterprise Data Architecture Principles

**Purpose.** Establish the axioms that govern data at ZMedico — data as a product, contracts over pipelines, decentralized ownership with federated governance.

**Architecture.** Layered architecture composed of ingestion, storage, processing, governance, and consumption planes, aligned to the Enterprise Reference Architecture ratified in V11.

**ASCII Diagram.**
```text
[Producers] ─▶ [Contract] ─▶ [Pipeline] ─▶ [Storage] ─▶ [Serving] ─▶ [Consumers]
                     │                                     │
                     └────────── Governance / Lineage ─────┘
```

**Rules (RFC 2119).**
- Producers MUST publish schemas to the registry before emission.
- Consumers SHALL validate payloads against the registered schema.
- Breaking changes MUST NOT be released without a governance approval per V11.
- Sensitive fields MUST be classified per Chapter 25 (Data Classification).
- Lineage SHALL be captured for every transformation.

**Examples.**
- A `patient.registered` event carries `tenant_id`, `branch_id`, and a canonical `party_id`.
- The `invoice.line` dimension conforms to the enterprise `Money` type.
- The `appointment.no_show` fact links to `Party`, `Provider`, `Location`, and `Time` dimensions.

**Future Implementation Notes.** Reference the enterprise Canonical Data Model. Do not couple to vendor-specific storage semantics. Adopt open table formats where practical.

**Backward Compatibility Notes.** Additive only. Existing schemas, tables, RLS policies, and services continue to operate unchanged. No migration is prescribed.

**Security Notes.** Alignment with V10 Zero-Trust: least-privilege access to data planes, encryption at rest and in transit, and field-level classification enforced by policy.

**Performance Notes.** Sampling, partitioning, indexing, and materialization strategies SHOULD align with SLOs published in V12.

**Governance Notes.** Owned by the Enterprise Data Council under V11 ARB with domain-level stewards defined in Chapter 6 (Data Ownership).

**Extended Discussion.**
This chapter forms part of the ZMedico Enterprise Data Platform (EDP) architectural corpus.
It codifies the intent, boundaries, and interfaces of the concern without prescribing runtime
implementation. Where implementation is eventually undertaken, the Governance Workflow ratified
in V6 SHALL apply, and the architectural boundaries defined in V8, V9, V10, V11, and V12 SHALL
be respected. Nothing in this chapter changes application code, database schema, RLS policies,
SECURITY DEFINER functions, Edge Functions, generated types, tests, package manifests, or
infrastructure assets.

**Interfaces.**
- **To V8 Authorization.** All data access decisions remain authoritative under RLS and V8
  policies. This chapter MUST NOT be interpreted as altering those decisions.
- **To V9 Identity.** Principal identity, trust envelopes, and session semantics are owned by
  V9. This chapter consumes identity as a fact; it does not redefine it.
- **To V10 Security.** Encryption, key management, and sensitivity classification are governed
  by V10. This chapter aligns to those classifications without inventing new ones.
- **To V11 Governance.** All decisions arising from this chapter SHALL be routed through the
  ARB, ADR, and lifecycle mechanisms V11 defines.
- **To V12 Observability.** Data-plane telemetry (freshness, quality, lineage, throughput) is
  emitted through the observability signals V12 standardizes; V13 defines the semantics, V12
  defines the transport.

**Design Considerations.**
- Prefer *contract-first* design: producers publish schemas and semantics before any consumer
  couples to them.
- Prefer *open standards*: SQL, OpenAPI, AsyncAPI, JSON Schema, Avro, Parquet, Iceberg/Delta,
  OpenLineage, DCAT.
- Prefer *decentralized ownership with federated governance*: domain teams own products; a
  federated council owns policy.
- Prefer *bounded contexts*: cross-domain coupling flows through published contracts, not
  through shared physical tables.
- Prefer *evolvability*: schemas evolve with compatibility rules; consumers negotiate versions
  through the schema registry.

**Anti-Patterns to Avoid.**
- Shared mutable OLTP tables as an integration channel.
- Untyped, unversioned event payloads.
- Point-to-point pipelines with no lineage capture.
- Silent schema drift with no compatibility gate.
- Uncontrolled cross-tenant joins.

**Compliance Alignment.**
- **HIPAA**: Preserve minimum necessary access; PHI is handled per V10 classifications.
- **GDPR**: Preserve lawful basis and purpose limitation; enable subject rights.
- **ISO 27001**: Align to Annex A controls for information classification, cryptography, and
  supplier data handling.
- **NIST 800-53**: Align to AC, AU, SC, and SI family controls at the data plane.

**Operational Envelope.**
- Data SLAs SHALL be published per data product (freshness, completeness, availability).
- Quality signals SHALL be observable in V12 dashboards.
- Incidents affecting data products SHALL follow the incident management workflow ratified
  by V12 Chapter 47.

**Explicit Non-Goals.**
- This chapter does NOT define authorization semantics.
- This chapter does NOT define identity or session semantics.
- This chapter does NOT define encryption primitives or key custody.
- This chapter does NOT change any existing database object, RLS policy, or SECURITY DEFINER
  function.
- This chapter does NOT introduce or modify Edge Functions or React/TypeScript modules.

**Rollout Philosophy (When Implementation Is Later Approved).**
- Additive first: introduce new datasets, contracts, and pipelines alongside existing ones.
- Shadow before cutover: run new pipelines in parallel, compare with existing outputs.
- Fitness-gated promotion: only promote when quality, lineage, and SLO gates pass.
- Reversible by default: every change SHALL have a documented rollback per V11.


## Chapter 2 — Canonical Data Model

**Purpose.** Provide a shared vocabulary of core entities (Party, Encounter, Order, Result, Location, Product, Money, Time) that every domain conforms to.

**Architecture.** Layered architecture composed of ingestion, storage, processing, governance, and consumption planes, aligned to the Enterprise Reference Architecture ratified in V11.

**ASCII Diagram.**
```text
[Producers] ─▶ [Contract] ─▶ [Pipeline] ─▶ [Storage] ─▶ [Serving] ─▶ [Consumers]
                     │                                     │
                     └────────── Governance / Lineage ─────┘
```

**Rules (RFC 2119).**
- Producers MUST publish schemas to the registry before emission.
- Consumers SHALL validate payloads against the registered schema.
- Breaking changes MUST NOT be released without a governance approval per V11.
- Sensitive fields MUST be classified per Chapter 25 (Data Classification).
- Lineage SHALL be captured for every transformation.

**Examples.**
- A `patient.registered` event carries `tenant_id`, `branch_id`, and a canonical `party_id`.
- The `invoice.line` dimension conforms to the enterprise `Money` type.
- The `appointment.no_show` fact links to `Party`, `Provider`, `Location`, and `Time` dimensions.

**Future Implementation Notes.** Reference the enterprise Canonical Data Model. Do not couple to vendor-specific storage semantics. Adopt open table formats where practical.

**Backward Compatibility Notes.** Additive only. Existing schemas, tables, RLS policies, and services continue to operate unchanged. No migration is prescribed.

**Security Notes.** Alignment with V10 Zero-Trust: least-privilege access to data planes, encryption at rest and in transit, and field-level classification enforced by policy.

**Performance Notes.** Sampling, partitioning, indexing, and materialization strategies SHOULD align with SLOs published in V12.

**Governance Notes.** Owned by the Enterprise Data Council under V11 ARB with domain-level stewards defined in Chapter 6 (Data Ownership).

**Extended Discussion.**
This chapter forms part of the ZMedico Enterprise Data Platform (EDP) architectural corpus.
It codifies the intent, boundaries, and interfaces of the concern without prescribing runtime
implementation. Where implementation is eventually undertaken, the Governance Workflow ratified
in V6 SHALL apply, and the architectural boundaries defined in V8, V9, V10, V11, and V12 SHALL
be respected. Nothing in this chapter changes application code, database schema, RLS policies,
SECURITY DEFINER functions, Edge Functions, generated types, tests, package manifests, or
infrastructure assets.

**Interfaces.**
- **To V8 Authorization.** All data access decisions remain authoritative under RLS and V8
  policies. This chapter MUST NOT be interpreted as altering those decisions.
- **To V9 Identity.** Principal identity, trust envelopes, and session semantics are owned by
  V9. This chapter consumes identity as a fact; it does not redefine it.
- **To V10 Security.** Encryption, key management, and sensitivity classification are governed
  by V10. This chapter aligns to those classifications without inventing new ones.
- **To V11 Governance.** All decisions arising from this chapter SHALL be routed through the
  ARB, ADR, and lifecycle mechanisms V11 defines.
- **To V12 Observability.** Data-plane telemetry (freshness, quality, lineage, throughput) is
  emitted through the observability signals V12 standardizes; V13 defines the semantics, V12
  defines the transport.

**Design Considerations.**
- Prefer *contract-first* design: producers publish schemas and semantics before any consumer
  couples to them.
- Prefer *open standards*: SQL, OpenAPI, AsyncAPI, JSON Schema, Avro, Parquet, Iceberg/Delta,
  OpenLineage, DCAT.
- Prefer *decentralized ownership with federated governance*: domain teams own products; a
  federated council owns policy.
- Prefer *bounded contexts*: cross-domain coupling flows through published contracts, not
  through shared physical tables.
- Prefer *evolvability*: schemas evolve with compatibility rules; consumers negotiate versions
  through the schema registry.

**Anti-Patterns to Avoid.**
- Shared mutable OLTP tables as an integration channel.
- Untyped, unversioned event payloads.
- Point-to-point pipelines with no lineage capture.
- Silent schema drift with no compatibility gate.
- Uncontrolled cross-tenant joins.

**Compliance Alignment.**
- **HIPAA**: Preserve minimum necessary access; PHI is handled per V10 classifications.
- **GDPR**: Preserve lawful basis and purpose limitation; enable subject rights.
- **ISO 27001**: Align to Annex A controls for information classification, cryptography, and
  supplier data handling.
- **NIST 800-53**: Align to AC, AU, SC, and SI family controls at the data plane.

**Operational Envelope.**
- Data SLAs SHALL be published per data product (freshness, completeness, availability).
- Quality signals SHALL be observable in V12 dashboards.
- Incidents affecting data products SHALL follow the incident management workflow ratified
  by V12 Chapter 47.

**Explicit Non-Goals.**
- This chapter does NOT define authorization semantics.
- This chapter does NOT define identity or session semantics.
- This chapter does NOT define encryption primitives or key custody.
- This chapter does NOT change any existing database object, RLS policy, or SECURITY DEFINER
  function.
- This chapter does NOT introduce or modify Edge Functions or React/TypeScript modules.

**Rollout Philosophy (When Implementation Is Later Approved).**
- Additive first: introduce new datasets, contracts, and pipelines alongside existing ones.
- Shadow before cutover: run new pipelines in parallel, compare with existing outputs.
- Fitness-gated promotion: only promote when quality, lineage, and SLO gates pass.
- Reversible by default: every change SHALL have a documented rollback per V11.


## Chapter 3 — Information Architecture Overview

**Purpose.** Describe how information is structured, labeled, and navigated across the enterprise experience.

**Architecture.** Layered architecture composed of ingestion, storage, processing, governance, and consumption planes, aligned to the Enterprise Reference Architecture ratified in V11.

**ASCII Diagram.**
```text
[Producers] ─▶ [Contract] ─▶ [Pipeline] ─▶ [Storage] ─▶ [Serving] ─▶ [Consumers]
                     │                                     │
                     └────────── Governance / Lineage ─────┘
```

**Rules (RFC 2119).**
- Producers MUST publish schemas to the registry before emission.
- Consumers SHALL validate payloads against the registered schema.
- Breaking changes MUST NOT be released without a governance approval per V11.
- Sensitive fields MUST be classified per Chapter 25 (Data Classification).
- Lineage SHALL be captured for every transformation.

**Examples.**
- A `patient.registered` event carries `tenant_id`, `branch_id`, and a canonical `party_id`.
- The `invoice.line` dimension conforms to the enterprise `Money` type.
- The `appointment.no_show` fact links to `Party`, `Provider`, `Location`, and `Time` dimensions.

**Future Implementation Notes.** Reference the enterprise Canonical Data Model. Do not couple to vendor-specific storage semantics. Adopt open table formats where practical.

**Backward Compatibility Notes.** Additive only. Existing schemas, tables, RLS policies, and services continue to operate unchanged. No migration is prescribed.

**Security Notes.** Alignment with V10 Zero-Trust: least-privilege access to data planes, encryption at rest and in transit, and field-level classification enforced by policy.

**Performance Notes.** Sampling, partitioning, indexing, and materialization strategies SHOULD align with SLOs published in V12.

**Governance Notes.** Owned by the Enterprise Data Council under V11 ARB with domain-level stewards defined in Chapter 6 (Data Ownership).

**Extended Discussion.**
This chapter forms part of the ZMedico Enterprise Data Platform (EDP) architectural corpus.
It codifies the intent, boundaries, and interfaces of the concern without prescribing runtime
implementation. Where implementation is eventually undertaken, the Governance Workflow ratified
in V6 SHALL apply, and the architectural boundaries defined in V8, V9, V10, V11, and V12 SHALL
be respected. Nothing in this chapter changes application code, database schema, RLS policies,
SECURITY DEFINER functions, Edge Functions, generated types, tests, package manifests, or
infrastructure assets.

**Interfaces.**
- **To V8 Authorization.** All data access decisions remain authoritative under RLS and V8
  policies. This chapter MUST NOT be interpreted as altering those decisions.
- **To V9 Identity.** Principal identity, trust envelopes, and session semantics are owned by
  V9. This chapter consumes identity as a fact; it does not redefine it.
- **To V10 Security.** Encryption, key management, and sensitivity classification are governed
  by V10. This chapter aligns to those classifications without inventing new ones.
- **To V11 Governance.** All decisions arising from this chapter SHALL be routed through the
  ARB, ADR, and lifecycle mechanisms V11 defines.
- **To V12 Observability.** Data-plane telemetry (freshness, quality, lineage, throughput) is
  emitted through the observability signals V12 standardizes; V13 defines the semantics, V12
  defines the transport.

**Design Considerations.**
- Prefer *contract-first* design: producers publish schemas and semantics before any consumer
  couples to them.
- Prefer *open standards*: SQL, OpenAPI, AsyncAPI, JSON Schema, Avro, Parquet, Iceberg/Delta,
  OpenLineage, DCAT.
- Prefer *decentralized ownership with federated governance*: domain teams own products; a
  federated council owns policy.
- Prefer *bounded contexts*: cross-domain coupling flows through published contracts, not
  through shared physical tables.
- Prefer *evolvability*: schemas evolve with compatibility rules; consumers negotiate versions
  through the schema registry.

**Anti-Patterns to Avoid.**
- Shared mutable OLTP tables as an integration channel.
- Untyped, unversioned event payloads.
- Point-to-point pipelines with no lineage capture.
- Silent schema drift with no compatibility gate.
- Uncontrolled cross-tenant joins.

**Compliance Alignment.**
- **HIPAA**: Preserve minimum necessary access; PHI is handled per V10 classifications.
- **GDPR**: Preserve lawful basis and purpose limitation; enable subject rights.
- **ISO 27001**: Align to Annex A controls for information classification, cryptography, and
  supplier data handling.
- **NIST 800-53**: Align to AC, AU, SC, and SI family controls at the data plane.

**Operational Envelope.**
- Data SLAs SHALL be published per data product (freshness, completeness, availability).
- Quality signals SHALL be observable in V12 dashboards.
- Incidents affecting data products SHALL follow the incident management workflow ratified
  by V12 Chapter 47.

**Explicit Non-Goals.**
- This chapter does NOT define authorization semantics.
- This chapter does NOT define identity or session semantics.
- This chapter does NOT define encryption primitives or key custody.
- This chapter does NOT change any existing database object, RLS policy, or SECURITY DEFINER
  function.
- This chapter does NOT introduce or modify Edge Functions or React/TypeScript modules.

**Rollout Philosophy (When Implementation Is Later Approved).**
- Additive first: introduce new datasets, contracts, and pipelines alongside existing ones.
- Shadow before cutover: run new pipelines in parallel, compare with existing outputs.
- Fitness-gated promotion: only promote when quality, lineage, and SLO gates pass.
- Reversible by default: every change SHALL have a documented rollback per V11.


## Chapter 4 — Data Domains

**Purpose.** Partition the enterprise into bounded contexts with clear data ownership.

**Architecture.** Layered architecture composed of ingestion, storage, processing, governance, and consumption planes, aligned to the Enterprise Reference Architecture ratified in V11.

**ASCII Diagram.**
```text
[Producers] ─▶ [Contract] ─▶ [Pipeline] ─▶ [Storage] ─▶ [Serving] ─▶ [Consumers]
                     │                                     │
                     └────────── Governance / Lineage ─────┘
```

**Rules (RFC 2119).**
- Producers MUST publish schemas to the registry before emission.
- Consumers SHALL validate payloads against the registered schema.
- Breaking changes MUST NOT be released without a governance approval per V11.
- Sensitive fields MUST be classified per Chapter 25 (Data Classification).
- Lineage SHALL be captured for every transformation.

**Examples.**
- A `patient.registered` event carries `tenant_id`, `branch_id`, and a canonical `party_id`.
- The `invoice.line` dimension conforms to the enterprise `Money` type.
- The `appointment.no_show` fact links to `Party`, `Provider`, `Location`, and `Time` dimensions.

**Future Implementation Notes.** Reference the enterprise Canonical Data Model. Do not couple to vendor-specific storage semantics. Adopt open table formats where practical.

**Backward Compatibility Notes.** Additive only. Existing schemas, tables, RLS policies, and services continue to operate unchanged. No migration is prescribed.

**Security Notes.** Alignment with V10 Zero-Trust: least-privilege access to data planes, encryption at rest and in transit, and field-level classification enforced by policy.

**Performance Notes.** Sampling, partitioning, indexing, and materialization strategies SHOULD align with SLOs published in V12.

**Governance Notes.** Owned by the Enterprise Data Council under V11 ARB with domain-level stewards defined in Chapter 6 (Data Ownership).

**Extended Discussion.**
This chapter forms part of the ZMedico Enterprise Data Platform (EDP) architectural corpus.
It codifies the intent, boundaries, and interfaces of the concern without prescribing runtime
implementation. Where implementation is eventually undertaken, the Governance Workflow ratified
in V6 SHALL apply, and the architectural boundaries defined in V8, V9, V10, V11, and V12 SHALL
be respected. Nothing in this chapter changes application code, database schema, RLS policies,
SECURITY DEFINER functions, Edge Functions, generated types, tests, package manifests, or
infrastructure assets.

**Interfaces.**
- **To V8 Authorization.** All data access decisions remain authoritative under RLS and V8
  policies. This chapter MUST NOT be interpreted as altering those decisions.
- **To V9 Identity.** Principal identity, trust envelopes, and session semantics are owned by
  V9. This chapter consumes identity as a fact; it does not redefine it.
- **To V10 Security.** Encryption, key management, and sensitivity classification are governed
  by V10. This chapter aligns to those classifications without inventing new ones.
- **To V11 Governance.** All decisions arising from this chapter SHALL be routed through the
  ARB, ADR, and lifecycle mechanisms V11 defines.
- **To V12 Observability.** Data-plane telemetry (freshness, quality, lineage, throughput) is
  emitted through the observability signals V12 standardizes; V13 defines the semantics, V12
  defines the transport.

**Design Considerations.**
- Prefer *contract-first* design: producers publish schemas and semantics before any consumer
  couples to them.
- Prefer *open standards*: SQL, OpenAPI, AsyncAPI, JSON Schema, Avro, Parquet, Iceberg/Delta,
  OpenLineage, DCAT.
- Prefer *decentralized ownership with federated governance*: domain teams own products; a
  federated council owns policy.
- Prefer *bounded contexts*: cross-domain coupling flows through published contracts, not
  through shared physical tables.
- Prefer *evolvability*: schemas evolve with compatibility rules; consumers negotiate versions
  through the schema registry.

**Anti-Patterns to Avoid.**
- Shared mutable OLTP tables as an integration channel.
- Untyped, unversioned event payloads.
- Point-to-point pipelines with no lineage capture.
- Silent schema drift with no compatibility gate.
- Uncontrolled cross-tenant joins.

**Compliance Alignment.**
- **HIPAA**: Preserve minimum necessary access; PHI is handled per V10 classifications.
- **GDPR**: Preserve lawful basis and purpose limitation; enable subject rights.
- **ISO 27001**: Align to Annex A controls for information classification, cryptography, and
  supplier data handling.
- **NIST 800-53**: Align to AC, AU, SC, and SI family controls at the data plane.

**Operational Envelope.**
- Data SLAs SHALL be published per data product (freshness, completeness, availability).
- Quality signals SHALL be observable in V12 dashboards.
- Incidents affecting data products SHALL follow the incident management workflow ratified
  by V12 Chapter 47.

**Explicit Non-Goals.**
- This chapter does NOT define authorization semantics.
- This chapter does NOT define identity or session semantics.
- This chapter does NOT define encryption primitives or key custody.
- This chapter does NOT change any existing database object, RLS policy, or SECURITY DEFINER
  function.
- This chapter does NOT introduce or modify Edge Functions or React/TypeScript modules.

**Rollout Philosophy (When Implementation Is Later Approved).**
- Additive first: introduce new datasets, contracts, and pipelines alongside existing ones.
- Shadow before cutover: run new pipelines in parallel, compare with existing outputs.
- Fitness-gated promotion: only promote when quality, lineage, and SLO gates pass.
- Reversible by default: every change SHALL have a documented rollback per V11.


## Chapter 5 — Data Products

**Purpose.** Treat curated datasets as first-class products with contracts, SLAs, and owners.

**Architecture.** Layered architecture composed of ingestion, storage, processing, governance, and consumption planes, aligned to the Enterprise Reference Architecture ratified in V11.

**ASCII Diagram.**
```text
[Producers] ─▶ [Contract] ─▶ [Pipeline] ─▶ [Storage] ─▶ [Serving] ─▶ [Consumers]
                     │                                     │
                     └────────── Governance / Lineage ─────┘
```

**Rules (RFC 2119).**
- Producers MUST publish schemas to the registry before emission.
- Consumers SHALL validate payloads against the registered schema.
- Breaking changes MUST NOT be released without a governance approval per V11.
- Sensitive fields MUST be classified per Chapter 25 (Data Classification).
- Lineage SHALL be captured for every transformation.

**Examples.**
- A `patient.registered` event carries `tenant_id`, `branch_id`, and a canonical `party_id`.
- The `invoice.line` dimension conforms to the enterprise `Money` type.
- The `appointment.no_show` fact links to `Party`, `Provider`, `Location`, and `Time` dimensions.

**Future Implementation Notes.** Reference the enterprise Canonical Data Model. Do not couple to vendor-specific storage semantics. Adopt open table formats where practical.

**Backward Compatibility Notes.** Additive only. Existing schemas, tables, RLS policies, and services continue to operate unchanged. No migration is prescribed.

**Security Notes.** Alignment with V10 Zero-Trust: least-privilege access to data planes, encryption at rest and in transit, and field-level classification enforced by policy.

**Performance Notes.** Sampling, partitioning, indexing, and materialization strategies SHOULD align with SLOs published in V12.

**Governance Notes.** Owned by the Enterprise Data Council under V11 ARB with domain-level stewards defined in Chapter 6 (Data Ownership).

**Extended Discussion.**
This chapter forms part of the ZMedico Enterprise Data Platform (EDP) architectural corpus.
It codifies the intent, boundaries, and interfaces of the concern without prescribing runtime
implementation. Where implementation is eventually undertaken, the Governance Workflow ratified
in V6 SHALL apply, and the architectural boundaries defined in V8, V9, V10, V11, and V12 SHALL
be respected. Nothing in this chapter changes application code, database schema, RLS policies,
SECURITY DEFINER functions, Edge Functions, generated types, tests, package manifests, or
infrastructure assets.

**Interfaces.**
- **To V8 Authorization.** All data access decisions remain authoritative under RLS and V8
  policies. This chapter MUST NOT be interpreted as altering those decisions.
- **To V9 Identity.** Principal identity, trust envelopes, and session semantics are owned by
  V9. This chapter consumes identity as a fact; it does not redefine it.
- **To V10 Security.** Encryption, key management, and sensitivity classification are governed
  by V10. This chapter aligns to those classifications without inventing new ones.
- **To V11 Governance.** All decisions arising from this chapter SHALL be routed through the
  ARB, ADR, and lifecycle mechanisms V11 defines.
- **To V12 Observability.** Data-plane telemetry (freshness, quality, lineage, throughput) is
  emitted through the observability signals V12 standardizes; V13 defines the semantics, V12
  defines the transport.

**Design Considerations.**
- Prefer *contract-first* design: producers publish schemas and semantics before any consumer
  couples to them.
- Prefer *open standards*: SQL, OpenAPI, AsyncAPI, JSON Schema, Avro, Parquet, Iceberg/Delta,
  OpenLineage, DCAT.
- Prefer *decentralized ownership with federated governance*: domain teams own products; a
  federated council owns policy.
- Prefer *bounded contexts*: cross-domain coupling flows through published contracts, not
  through shared physical tables.
- Prefer *evolvability*: schemas evolve with compatibility rules; consumers negotiate versions
  through the schema registry.

**Anti-Patterns to Avoid.**
- Shared mutable OLTP tables as an integration channel.
- Untyped, unversioned event payloads.
- Point-to-point pipelines with no lineage capture.
- Silent schema drift with no compatibility gate.
- Uncontrolled cross-tenant joins.

**Compliance Alignment.**
- **HIPAA**: Preserve minimum necessary access; PHI is handled per V10 classifications.
- **GDPR**: Preserve lawful basis and purpose limitation; enable subject rights.
- **ISO 27001**: Align to Annex A controls for information classification, cryptography, and
  supplier data handling.
- **NIST 800-53**: Align to AC, AU, SC, and SI family controls at the data plane.

**Operational Envelope.**
- Data SLAs SHALL be published per data product (freshness, completeness, availability).
- Quality signals SHALL be observable in V12 dashboards.
- Incidents affecting data products SHALL follow the incident management workflow ratified
  by V12 Chapter 47.

**Explicit Non-Goals.**
- This chapter does NOT define authorization semantics.
- This chapter does NOT define identity or session semantics.
- This chapter does NOT define encryption primitives or key custody.
- This chapter does NOT change any existing database object, RLS policy, or SECURITY DEFINER
  function.
- This chapter does NOT introduce or modify Edge Functions or React/TypeScript modules.

**Rollout Philosophy (When Implementation Is Later Approved).**
- Additive first: introduce new datasets, contracts, and pipelines alongside existing ones.
- Shadow before cutover: run new pipelines in parallel, compare with existing outputs.
- Fitness-gated promotion: only promote when quality, lineage, and SLO gates pass.
- Reversible by default: every change SHALL have a documented rollback per V11.


## Chapter 6 — Data Ownership

**Purpose.** Assign accountable owners for every dataset, product, and pipeline.

**Architecture.** Layered architecture composed of ingestion, storage, processing, governance, and consumption planes, aligned to the Enterprise Reference Architecture ratified in V11.

**ASCII Diagram.**
```text
[Producers] ─▶ [Contract] ─▶ [Pipeline] ─▶ [Storage] ─▶ [Serving] ─▶ [Consumers]
                     │                                     │
                     └────────── Governance / Lineage ─────┘
```

**Rules (RFC 2119).**
- Producers MUST publish schemas to the registry before emission.
- Consumers SHALL validate payloads against the registered schema.
- Breaking changes MUST NOT be released without a governance approval per V11.
- Sensitive fields MUST be classified per Chapter 25 (Data Classification).
- Lineage SHALL be captured for every transformation.

**Examples.**
- A `patient.registered` event carries `tenant_id`, `branch_id`, and a canonical `party_id`.
- The `invoice.line` dimension conforms to the enterprise `Money` type.
- The `appointment.no_show` fact links to `Party`, `Provider`, `Location`, and `Time` dimensions.

**Future Implementation Notes.** Reference the enterprise Canonical Data Model. Do not couple to vendor-specific storage semantics. Adopt open table formats where practical.

**Backward Compatibility Notes.** Additive only. Existing schemas, tables, RLS policies, and services continue to operate unchanged. No migration is prescribed.

**Security Notes.** Alignment with V10 Zero-Trust: least-privilege access to data planes, encryption at rest and in transit, and field-level classification enforced by policy.

**Performance Notes.** Sampling, partitioning, indexing, and materialization strategies SHOULD align with SLOs published in V12.

**Governance Notes.** Owned by the Enterprise Data Council under V11 ARB with domain-level stewards defined in Chapter 6 (Data Ownership).

**Extended Discussion.**
This chapter forms part of the ZMedico Enterprise Data Platform (EDP) architectural corpus.
It codifies the intent, boundaries, and interfaces of the concern without prescribing runtime
implementation. Where implementation is eventually undertaken, the Governance Workflow ratified
in V6 SHALL apply, and the architectural boundaries defined in V8, V9, V10, V11, and V12 SHALL
be respected. Nothing in this chapter changes application code, database schema, RLS policies,
SECURITY DEFINER functions, Edge Functions, generated types, tests, package manifests, or
infrastructure assets.

**Interfaces.**
- **To V8 Authorization.** All data access decisions remain authoritative under RLS and V8
  policies. This chapter MUST NOT be interpreted as altering those decisions.
- **To V9 Identity.** Principal identity, trust envelopes, and session semantics are owned by
  V9. This chapter consumes identity as a fact; it does not redefine it.
- **To V10 Security.** Encryption, key management, and sensitivity classification are governed
  by V10. This chapter aligns to those classifications without inventing new ones.
- **To V11 Governance.** All decisions arising from this chapter SHALL be routed through the
  ARB, ADR, and lifecycle mechanisms V11 defines.
- **To V12 Observability.** Data-plane telemetry (freshness, quality, lineage, throughput) is
  emitted through the observability signals V12 standardizes; V13 defines the semantics, V12
  defines the transport.

**Design Considerations.**
- Prefer *contract-first* design: producers publish schemas and semantics before any consumer
  couples to them.
- Prefer *open standards*: SQL, OpenAPI, AsyncAPI, JSON Schema, Avro, Parquet, Iceberg/Delta,
  OpenLineage, DCAT.
- Prefer *decentralized ownership with federated governance*: domain teams own products; a
  federated council owns policy.
- Prefer *bounded contexts*: cross-domain coupling flows through published contracts, not
  through shared physical tables.
- Prefer *evolvability*: schemas evolve with compatibility rules; consumers negotiate versions
  through the schema registry.

**Anti-Patterns to Avoid.**
- Shared mutable OLTP tables as an integration channel.
- Untyped, unversioned event payloads.
- Point-to-point pipelines with no lineage capture.
- Silent schema drift with no compatibility gate.
- Uncontrolled cross-tenant joins.

**Compliance Alignment.**
- **HIPAA**: Preserve minimum necessary access; PHI is handled per V10 classifications.
- **GDPR**: Preserve lawful basis and purpose limitation; enable subject rights.
- **ISO 27001**: Align to Annex A controls for information classification, cryptography, and
  supplier data handling.
- **NIST 800-53**: Align to AC, AU, SC, and SI family controls at the data plane.

**Operational Envelope.**
- Data SLAs SHALL be published per data product (freshness, completeness, availability).
- Quality signals SHALL be observable in V12 dashboards.
- Incidents affecting data products SHALL follow the incident management workflow ratified
  by V12 Chapter 47.

**Explicit Non-Goals.**
- This chapter does NOT define authorization semantics.
- This chapter does NOT define identity or session semantics.
- This chapter does NOT define encryption primitives or key custody.
- This chapter does NOT change any existing database object, RLS policy, or SECURITY DEFINER
  function.
- This chapter does NOT introduce or modify Edge Functions or React/TypeScript modules.

**Rollout Philosophy (When Implementation Is Later Approved).**
- Additive first: introduce new datasets, contracts, and pipelines alongside existing ones.
- Shadow before cutover: run new pipelines in parallel, compare with existing outputs.
- Fitness-gated promotion: only promote when quality, lineage, and SLO gates pass.
- Reversible by default: every change SHALL have a documented rollback per V11.


## Chapter 7 — Data Stewardship

**Purpose.** Operationalize ownership through named stewards responsible for quality, meaning, and lifecycle.

**Architecture.** Layered architecture composed of ingestion, storage, processing, governance, and consumption planes, aligned to the Enterprise Reference Architecture ratified in V11.

**ASCII Diagram.**
```text
[Producers] ─▶ [Contract] ─▶ [Pipeline] ─▶ [Storage] ─▶ [Serving] ─▶ [Consumers]
                     │                                     │
                     └────────── Governance / Lineage ─────┘
```

**Rules (RFC 2119).**
- Producers MUST publish schemas to the registry before emission.
- Consumers SHALL validate payloads against the registered schema.
- Breaking changes MUST NOT be released without a governance approval per V11.
- Sensitive fields MUST be classified per Chapter 25 (Data Classification).
- Lineage SHALL be captured for every transformation.

**Examples.**
- A `patient.registered` event carries `tenant_id`, `branch_id`, and a canonical `party_id`.
- The `invoice.line` dimension conforms to the enterprise `Money` type.
- The `appointment.no_show` fact links to `Party`, `Provider`, `Location`, and `Time` dimensions.

**Future Implementation Notes.** Reference the enterprise Canonical Data Model. Do not couple to vendor-specific storage semantics. Adopt open table formats where practical.

**Backward Compatibility Notes.** Additive only. Existing schemas, tables, RLS policies, and services continue to operate unchanged. No migration is prescribed.

**Security Notes.** Alignment with V10 Zero-Trust: least-privilege access to data planes, encryption at rest and in transit, and field-level classification enforced by policy.

**Performance Notes.** Sampling, partitioning, indexing, and materialization strategies SHOULD align with SLOs published in V12.

**Governance Notes.** Owned by the Enterprise Data Council under V11 ARB with domain-level stewards defined in Chapter 6 (Data Ownership).

**Extended Discussion.**
This chapter forms part of the ZMedico Enterprise Data Platform (EDP) architectural corpus.
It codifies the intent, boundaries, and interfaces of the concern without prescribing runtime
implementation. Where implementation is eventually undertaken, the Governance Workflow ratified
in V6 SHALL apply, and the architectural boundaries defined in V8, V9, V10, V11, and V12 SHALL
be respected. Nothing in this chapter changes application code, database schema, RLS policies,
SECURITY DEFINER functions, Edge Functions, generated types, tests, package manifests, or
infrastructure assets.

**Interfaces.**
- **To V8 Authorization.** All data access decisions remain authoritative under RLS and V8
  policies. This chapter MUST NOT be interpreted as altering those decisions.
- **To V9 Identity.** Principal identity, trust envelopes, and session semantics are owned by
  V9. This chapter consumes identity as a fact; it does not redefine it.
- **To V10 Security.** Encryption, key management, and sensitivity classification are governed
  by V10. This chapter aligns to those classifications without inventing new ones.
- **To V11 Governance.** All decisions arising from this chapter SHALL be routed through the
  ARB, ADR, and lifecycle mechanisms V11 defines.
- **To V12 Observability.** Data-plane telemetry (freshness, quality, lineage, throughput) is
  emitted through the observability signals V12 standardizes; V13 defines the semantics, V12
  defines the transport.

**Design Considerations.**
- Prefer *contract-first* design: producers publish schemas and semantics before any consumer
  couples to them.
- Prefer *open standards*: SQL, OpenAPI, AsyncAPI, JSON Schema, Avro, Parquet, Iceberg/Delta,
  OpenLineage, DCAT.
- Prefer *decentralized ownership with federated governance*: domain teams own products; a
  federated council owns policy.
- Prefer *bounded contexts*: cross-domain coupling flows through published contracts, not
  through shared physical tables.
- Prefer *evolvability*: schemas evolve with compatibility rules; consumers negotiate versions
  through the schema registry.

**Anti-Patterns to Avoid.**
- Shared mutable OLTP tables as an integration channel.
- Untyped, unversioned event payloads.
- Point-to-point pipelines with no lineage capture.
- Silent schema drift with no compatibility gate.
- Uncontrolled cross-tenant joins.

**Compliance Alignment.**
- **HIPAA**: Preserve minimum necessary access; PHI is handled per V10 classifications.
- **GDPR**: Preserve lawful basis and purpose limitation; enable subject rights.
- **ISO 27001**: Align to Annex A controls for information classification, cryptography, and
  supplier data handling.
- **NIST 800-53**: Align to AC, AU, SC, and SI family controls at the data plane.

**Operational Envelope.**
- Data SLAs SHALL be published per data product (freshness, completeness, availability).
- Quality signals SHALL be observable in V12 dashboards.
- Incidents affecting data products SHALL follow the incident management workflow ratified
  by V12 Chapter 47.

**Explicit Non-Goals.**
- This chapter does NOT define authorization semantics.
- This chapter does NOT define identity or session semantics.
- This chapter does NOT define encryption primitives or key custody.
- This chapter does NOT change any existing database object, RLS policy, or SECURITY DEFINER
  function.
- This chapter does NOT introduce or modify Edge Functions or React/TypeScript modules.

**Rollout Philosophy (When Implementation Is Later Approved).**
- Additive first: introduce new datasets, contracts, and pipelines alongside existing ones.
- Shadow before cutover: run new pipelines in parallel, compare with existing outputs.
- Fitness-gated promotion: only promote when quality, lineage, and SLO gates pass.
- Reversible by default: every change SHALL have a documented rollback per V11.


## Chapter 8 — Data Governance Framework

**Purpose.** Codify the decision rights, policies, and standards under which data flows.

**Architecture.** Layered architecture composed of ingestion, storage, processing, governance, and consumption planes, aligned to the Enterprise Reference Architecture ratified in V11.

**ASCII Diagram.**
```text
[Producers] ─▶ [Contract] ─▶ [Pipeline] ─▶ [Storage] ─▶ [Serving] ─▶ [Consumers]
                     │                                     │
                     └────────── Governance / Lineage ─────┘
```

**Rules (RFC 2119).**
- Producers MUST publish schemas to the registry before emission.
- Consumers SHALL validate payloads against the registered schema.
- Breaking changes MUST NOT be released without a governance approval per V11.
- Sensitive fields MUST be classified per Chapter 25 (Data Classification).
- Lineage SHALL be captured for every transformation.

**Examples.**
- A `patient.registered` event carries `tenant_id`, `branch_id`, and a canonical `party_id`.
- The `invoice.line` dimension conforms to the enterprise `Money` type.
- The `appointment.no_show` fact links to `Party`, `Provider`, `Location`, and `Time` dimensions.

**Future Implementation Notes.** Reference the enterprise Canonical Data Model. Do not couple to vendor-specific storage semantics. Adopt open table formats where practical.

**Backward Compatibility Notes.** Additive only. Existing schemas, tables, RLS policies, and services continue to operate unchanged. No migration is prescribed.

**Security Notes.** Alignment with V10 Zero-Trust: least-privilege access to data planes, encryption at rest and in transit, and field-level classification enforced by policy.

**Performance Notes.** Sampling, partitioning, indexing, and materialization strategies SHOULD align with SLOs published in V12.

**Governance Notes.** Owned by the Enterprise Data Council under V11 ARB with domain-level stewards defined in Chapter 6 (Data Ownership).

**Extended Discussion.**
This chapter forms part of the ZMedico Enterprise Data Platform (EDP) architectural corpus.
It codifies the intent, boundaries, and interfaces of the concern without prescribing runtime
implementation. Where implementation is eventually undertaken, the Governance Workflow ratified
in V6 SHALL apply, and the architectural boundaries defined in V8, V9, V10, V11, and V12 SHALL
be respected. Nothing in this chapter changes application code, database schema, RLS policies,
SECURITY DEFINER functions, Edge Functions, generated types, tests, package manifests, or
infrastructure assets.

**Interfaces.**
- **To V8 Authorization.** All data access decisions remain authoritative under RLS and V8
  policies. This chapter MUST NOT be interpreted as altering those decisions.
- **To V9 Identity.** Principal identity, trust envelopes, and session semantics are owned by
  V9. This chapter consumes identity as a fact; it does not redefine it.
- **To V10 Security.** Encryption, key management, and sensitivity classification are governed
  by V10. This chapter aligns to those classifications without inventing new ones.
- **To V11 Governance.** All decisions arising from this chapter SHALL be routed through the
  ARB, ADR, and lifecycle mechanisms V11 defines.
- **To V12 Observability.** Data-plane telemetry (freshness, quality, lineage, throughput) is
  emitted through the observability signals V12 standardizes; V13 defines the semantics, V12
  defines the transport.

**Design Considerations.**
- Prefer *contract-first* design: producers publish schemas and semantics before any consumer
  couples to them.
- Prefer *open standards*: SQL, OpenAPI, AsyncAPI, JSON Schema, Avro, Parquet, Iceberg/Delta,
  OpenLineage, DCAT.
- Prefer *decentralized ownership with federated governance*: domain teams own products; a
  federated council owns policy.
- Prefer *bounded contexts*: cross-domain coupling flows through published contracts, not
  through shared physical tables.
- Prefer *evolvability*: schemas evolve with compatibility rules; consumers negotiate versions
  through the schema registry.

**Anti-Patterns to Avoid.**
- Shared mutable OLTP tables as an integration channel.
- Untyped, unversioned event payloads.
- Point-to-point pipelines with no lineage capture.
- Silent schema drift with no compatibility gate.
- Uncontrolled cross-tenant joins.

**Compliance Alignment.**
- **HIPAA**: Preserve minimum necessary access; PHI is handled per V10 classifications.
- **GDPR**: Preserve lawful basis and purpose limitation; enable subject rights.
- **ISO 27001**: Align to Annex A controls for information classification, cryptography, and
  supplier data handling.
- **NIST 800-53**: Align to AC, AU, SC, and SI family controls at the data plane.

**Operational Envelope.**
- Data SLAs SHALL be published per data product (freshness, completeness, availability).
- Quality signals SHALL be observable in V12 dashboards.
- Incidents affecting data products SHALL follow the incident management workflow ratified
  by V12 Chapter 47.

**Explicit Non-Goals.**
- This chapter does NOT define authorization semantics.
- This chapter does NOT define identity or session semantics.
- This chapter does NOT define encryption primitives or key custody.
- This chapter does NOT change any existing database object, RLS policy, or SECURITY DEFINER
  function.
- This chapter does NOT introduce or modify Edge Functions or React/TypeScript modules.

**Rollout Philosophy (When Implementation Is Later Approved).**
- Additive first: introduce new datasets, contracts, and pipelines alongside existing ones.
- Shadow before cutover: run new pipelines in parallel, compare with existing outputs.
- Fitness-gated promotion: only promote when quality, lineage, and SLO gates pass.
- Reversible by default: every change SHALL have a documented rollback per V11.


## Chapter 9 — Master Data Management

**Purpose.** Manage the authoritative golden records for parties, providers, locations, and products.

**Architecture.** Layered architecture composed of ingestion, storage, processing, governance, and consumption planes, aligned to the Enterprise Reference Architecture ratified in V11.

**ASCII Diagram.**
```text
[Producers] ─▶ [Contract] ─▶ [Pipeline] ─▶ [Storage] ─▶ [Serving] ─▶ [Consumers]
                     │                                     │
                     └────────── Governance / Lineage ─────┘
```

**Rules (RFC 2119).**
- Producers MUST publish schemas to the registry before emission.
- Consumers SHALL validate payloads against the registered schema.
- Breaking changes MUST NOT be released without a governance approval per V11.
- Sensitive fields MUST be classified per Chapter 25 (Data Classification).
- Lineage SHALL be captured for every transformation.

**Examples.**
- A `patient.registered` event carries `tenant_id`, `branch_id`, and a canonical `party_id`.
- The `invoice.line` dimension conforms to the enterprise `Money` type.
- The `appointment.no_show` fact links to `Party`, `Provider`, `Location`, and `Time` dimensions.

**Future Implementation Notes.** Reference the enterprise Canonical Data Model. Do not couple to vendor-specific storage semantics. Adopt open table formats where practical.

**Backward Compatibility Notes.** Additive only. Existing schemas, tables, RLS policies, and services continue to operate unchanged. No migration is prescribed.

**Security Notes.** Alignment with V10 Zero-Trust: least-privilege access to data planes, encryption at rest and in transit, and field-level classification enforced by policy.

**Performance Notes.** Sampling, partitioning, indexing, and materialization strategies SHOULD align with SLOs published in V12.

**Governance Notes.** Owned by the Enterprise Data Council under V11 ARB with domain-level stewards defined in Chapter 6 (Data Ownership).

**Extended Discussion.**
This chapter forms part of the ZMedico Enterprise Data Platform (EDP) architectural corpus.
It codifies the intent, boundaries, and interfaces of the concern without prescribing runtime
implementation. Where implementation is eventually undertaken, the Governance Workflow ratified
in V6 SHALL apply, and the architectural boundaries defined in V8, V9, V10, V11, and V12 SHALL
be respected. Nothing in this chapter changes application code, database schema, RLS policies,
SECURITY DEFINER functions, Edge Functions, generated types, tests, package manifests, or
infrastructure assets.

**Interfaces.**
- **To V8 Authorization.** All data access decisions remain authoritative under RLS and V8
  policies. This chapter MUST NOT be interpreted as altering those decisions.
- **To V9 Identity.** Principal identity, trust envelopes, and session semantics are owned by
  V9. This chapter consumes identity as a fact; it does not redefine it.
- **To V10 Security.** Encryption, key management, and sensitivity classification are governed
  by V10. This chapter aligns to those classifications without inventing new ones.
- **To V11 Governance.** All decisions arising from this chapter SHALL be routed through the
  ARB, ADR, and lifecycle mechanisms V11 defines.
- **To V12 Observability.** Data-plane telemetry (freshness, quality, lineage, throughput) is
  emitted through the observability signals V12 standardizes; V13 defines the semantics, V12
  defines the transport.

**Design Considerations.**
- Prefer *contract-first* design: producers publish schemas and semantics before any consumer
  couples to them.
- Prefer *open standards*: SQL, OpenAPI, AsyncAPI, JSON Schema, Avro, Parquet, Iceberg/Delta,
  OpenLineage, DCAT.
- Prefer *decentralized ownership with federated governance*: domain teams own products; a
  federated council owns policy.
- Prefer *bounded contexts*: cross-domain coupling flows through published contracts, not
  through shared physical tables.
- Prefer *evolvability*: schemas evolve with compatibility rules; consumers negotiate versions
  through the schema registry.

**Anti-Patterns to Avoid.**
- Shared mutable OLTP tables as an integration channel.
- Untyped, unversioned event payloads.
- Point-to-point pipelines with no lineage capture.
- Silent schema drift with no compatibility gate.
- Uncontrolled cross-tenant joins.

**Compliance Alignment.**
- **HIPAA**: Preserve minimum necessary access; PHI is handled per V10 classifications.
- **GDPR**: Preserve lawful basis and purpose limitation; enable subject rights.
- **ISO 27001**: Align to Annex A controls for information classification, cryptography, and
  supplier data handling.
- **NIST 800-53**: Align to AC, AU, SC, and SI family controls at the data plane.

**Operational Envelope.**
- Data SLAs SHALL be published per data product (freshness, completeness, availability).
- Quality signals SHALL be observable in V12 dashboards.
- Incidents affecting data products SHALL follow the incident management workflow ratified
  by V12 Chapter 47.

**Explicit Non-Goals.**
- This chapter does NOT define authorization semantics.
- This chapter does NOT define identity or session semantics.
- This chapter does NOT define encryption primitives or key custody.
- This chapter does NOT change any existing database object, RLS policy, or SECURITY DEFINER
  function.
- This chapter does NOT introduce or modify Edge Functions or React/TypeScript modules.

**Rollout Philosophy (When Implementation Is Later Approved).**
- Additive first: introduce new datasets, contracts, and pipelines alongside existing ones.
- Shadow before cutover: run new pipelines in parallel, compare with existing outputs.
- Fitness-gated promotion: only promote when quality, lineage, and SLO gates pass.
- Reversible by default: every change SHALL have a documented rollback per V11.


## Chapter 10 — Reference Data Management

**Purpose.** Manage code sets, taxonomies, and enumerations shared across domains.

**Architecture.** Layered architecture composed of ingestion, storage, processing, governance, and consumption planes, aligned to the Enterprise Reference Architecture ratified in V11.

**ASCII Diagram.**
```text
[Producers] ─▶ [Contract] ─▶ [Pipeline] ─▶ [Storage] ─▶ [Serving] ─▶ [Consumers]
                     │                                     │
                     └────────── Governance / Lineage ─────┘
```

**Rules (RFC 2119).**
- Producers MUST publish schemas to the registry before emission.
- Consumers SHALL validate payloads against the registered schema.
- Breaking changes MUST NOT be released without a governance approval per V11.
- Sensitive fields MUST be classified per Chapter 25 (Data Classification).
- Lineage SHALL be captured for every transformation.

**Examples.**
- A `patient.registered` event carries `tenant_id`, `branch_id`, and a canonical `party_id`.
- The `invoice.line` dimension conforms to the enterprise `Money` type.
- The `appointment.no_show` fact links to `Party`, `Provider`, `Location`, and `Time` dimensions.

**Future Implementation Notes.** Reference the enterprise Canonical Data Model. Do not couple to vendor-specific storage semantics. Adopt open table formats where practical.

**Backward Compatibility Notes.** Additive only. Existing schemas, tables, RLS policies, and services continue to operate unchanged. No migration is prescribed.

**Security Notes.** Alignment with V10 Zero-Trust: least-privilege access to data planes, encryption at rest and in transit, and field-level classification enforced by policy.

**Performance Notes.** Sampling, partitioning, indexing, and materialization strategies SHOULD align with SLOs published in V12.

**Governance Notes.** Owned by the Enterprise Data Council under V11 ARB with domain-level stewards defined in Chapter 6 (Data Ownership).

**Extended Discussion.**
This chapter forms part of the ZMedico Enterprise Data Platform (EDP) architectural corpus.
It codifies the intent, boundaries, and interfaces of the concern without prescribing runtime
implementation. Where implementation is eventually undertaken, the Governance Workflow ratified
in V6 SHALL apply, and the architectural boundaries defined in V8, V9, V10, V11, and V12 SHALL
be respected. Nothing in this chapter changes application code, database schema, RLS policies,
SECURITY DEFINER functions, Edge Functions, generated types, tests, package manifests, or
infrastructure assets.

**Interfaces.**
- **To V8 Authorization.** All data access decisions remain authoritative under RLS and V8
  policies. This chapter MUST NOT be interpreted as altering those decisions.
- **To V9 Identity.** Principal identity, trust envelopes, and session semantics are owned by
  V9. This chapter consumes identity as a fact; it does not redefine it.
- **To V10 Security.** Encryption, key management, and sensitivity classification are governed
  by V10. This chapter aligns to those classifications without inventing new ones.
- **To V11 Governance.** All decisions arising from this chapter SHALL be routed through the
  ARB, ADR, and lifecycle mechanisms V11 defines.
- **To V12 Observability.** Data-plane telemetry (freshness, quality, lineage, throughput) is
  emitted through the observability signals V12 standardizes; V13 defines the semantics, V12
  defines the transport.

**Design Considerations.**
- Prefer *contract-first* design: producers publish schemas and semantics before any consumer
  couples to them.
- Prefer *open standards*: SQL, OpenAPI, AsyncAPI, JSON Schema, Avro, Parquet, Iceberg/Delta,
  OpenLineage, DCAT.
- Prefer *decentralized ownership with federated governance*: domain teams own products; a
  federated council owns policy.
- Prefer *bounded contexts*: cross-domain coupling flows through published contracts, not
  through shared physical tables.
- Prefer *evolvability*: schemas evolve with compatibility rules; consumers negotiate versions
  through the schema registry.

**Anti-Patterns to Avoid.**
- Shared mutable OLTP tables as an integration channel.
- Untyped, unversioned event payloads.
- Point-to-point pipelines with no lineage capture.
- Silent schema drift with no compatibility gate.
- Uncontrolled cross-tenant joins.

**Compliance Alignment.**
- **HIPAA**: Preserve minimum necessary access; PHI is handled per V10 classifications.
- **GDPR**: Preserve lawful basis and purpose limitation; enable subject rights.
- **ISO 27001**: Align to Annex A controls for information classification, cryptography, and
  supplier data handling.
- **NIST 800-53**: Align to AC, AU, SC, and SI family controls at the data plane.

**Operational Envelope.**
- Data SLAs SHALL be published per data product (freshness, completeness, availability).
- Quality signals SHALL be observable in V12 dashboards.
- Incidents affecting data products SHALL follow the incident management workflow ratified
  by V12 Chapter 47.

**Explicit Non-Goals.**
- This chapter does NOT define authorization semantics.
- This chapter does NOT define identity or session semantics.
- This chapter does NOT define encryption primitives or key custody.
- This chapter does NOT change any existing database object, RLS policy, or SECURITY DEFINER
  function.
- This chapter does NOT introduce or modify Edge Functions or React/TypeScript modules.

**Rollout Philosophy (When Implementation Is Later Approved).**
- Additive first: introduce new datasets, contracts, and pipelines alongside existing ones.
- Shadow before cutover: run new pipelines in parallel, compare with existing outputs.
- Fitness-gated promotion: only promote when quality, lineage, and SLO gates pass.
- Reversible by default: every change SHALL have a documented rollback per V11.


## Chapter 11 — Metadata Management

**Purpose.** Capture technical, business, operational, and social metadata for every dataset.

**Architecture.** Layered architecture composed of ingestion, storage, processing, governance, and consumption planes, aligned to the Enterprise Reference Architecture ratified in V11.

**ASCII Diagram.**
```text
[Producers] ─▶ [Contract] ─▶ [Pipeline] ─▶ [Storage] ─▶ [Serving] ─▶ [Consumers]
                     │                                     │
                     └────────── Governance / Lineage ─────┘
```

**Rules (RFC 2119).**
- Producers MUST publish schemas to the registry before emission.
- Consumers SHALL validate payloads against the registered schema.
- Breaking changes MUST NOT be released without a governance approval per V11.
- Sensitive fields MUST be classified per Chapter 25 (Data Classification).
- Lineage SHALL be captured for every transformation.

**Examples.**
- A `patient.registered` event carries `tenant_id`, `branch_id`, and a canonical `party_id`.
- The `invoice.line` dimension conforms to the enterprise `Money` type.
- The `appointment.no_show` fact links to `Party`, `Provider`, `Location`, and `Time` dimensions.

**Future Implementation Notes.** Reference the enterprise Canonical Data Model. Do not couple to vendor-specific storage semantics. Adopt open table formats where practical.

**Backward Compatibility Notes.** Additive only. Existing schemas, tables, RLS policies, and services continue to operate unchanged. No migration is prescribed.

**Security Notes.** Alignment with V10 Zero-Trust: least-privilege access to data planes, encryption at rest and in transit, and field-level classification enforced by policy.

**Performance Notes.** Sampling, partitioning, indexing, and materialization strategies SHOULD align with SLOs published in V12.

**Governance Notes.** Owned by the Enterprise Data Council under V11 ARB with domain-level stewards defined in Chapter 6 (Data Ownership).

**Extended Discussion.**
This chapter forms part of the ZMedico Enterprise Data Platform (EDP) architectural corpus.
It codifies the intent, boundaries, and interfaces of the concern without prescribing runtime
implementation. Where implementation is eventually undertaken, the Governance Workflow ratified
in V6 SHALL apply, and the architectural boundaries defined in V8, V9, V10, V11, and V12 SHALL
be respected. Nothing in this chapter changes application code, database schema, RLS policies,
SECURITY DEFINER functions, Edge Functions, generated types, tests, package manifests, or
infrastructure assets.

**Interfaces.**
- **To V8 Authorization.** All data access decisions remain authoritative under RLS and V8
  policies. This chapter MUST NOT be interpreted as altering those decisions.
- **To V9 Identity.** Principal identity, trust envelopes, and session semantics are owned by
  V9. This chapter consumes identity as a fact; it does not redefine it.
- **To V10 Security.** Encryption, key management, and sensitivity classification are governed
  by V10. This chapter aligns to those classifications without inventing new ones.
- **To V11 Governance.** All decisions arising from this chapter SHALL be routed through the
  ARB, ADR, and lifecycle mechanisms V11 defines.
- **To V12 Observability.** Data-plane telemetry (freshness, quality, lineage, throughput) is
  emitted through the observability signals V12 standardizes; V13 defines the semantics, V12
  defines the transport.

**Design Considerations.**
- Prefer *contract-first* design: producers publish schemas and semantics before any consumer
  couples to them.
- Prefer *open standards*: SQL, OpenAPI, AsyncAPI, JSON Schema, Avro, Parquet, Iceberg/Delta,
  OpenLineage, DCAT.
- Prefer *decentralized ownership with federated governance*: domain teams own products; a
  federated council owns policy.
- Prefer *bounded contexts*: cross-domain coupling flows through published contracts, not
  through shared physical tables.
- Prefer *evolvability*: schemas evolve with compatibility rules; consumers negotiate versions
  through the schema registry.

**Anti-Patterns to Avoid.**
- Shared mutable OLTP tables as an integration channel.
- Untyped, unversioned event payloads.
- Point-to-point pipelines with no lineage capture.
- Silent schema drift with no compatibility gate.
- Uncontrolled cross-tenant joins.

**Compliance Alignment.**
- **HIPAA**: Preserve minimum necessary access; PHI is handled per V10 classifications.
- **GDPR**: Preserve lawful basis and purpose limitation; enable subject rights.
- **ISO 27001**: Align to Annex A controls for information classification, cryptography, and
  supplier data handling.
- **NIST 800-53**: Align to AC, AU, SC, and SI family controls at the data plane.

**Operational Envelope.**
- Data SLAs SHALL be published per data product (freshness, completeness, availability).
- Quality signals SHALL be observable in V12 dashboards.
- Incidents affecting data products SHALL follow the incident management workflow ratified
  by V12 Chapter 47.

**Explicit Non-Goals.**
- This chapter does NOT define authorization semantics.
- This chapter does NOT define identity or session semantics.
- This chapter does NOT define encryption primitives or key custody.
- This chapter does NOT change any existing database object, RLS policy, or SECURITY DEFINER
  function.
- This chapter does NOT introduce or modify Edge Functions or React/TypeScript modules.

**Rollout Philosophy (When Implementation Is Later Approved).**
- Additive first: introduce new datasets, contracts, and pipelines alongside existing ones.
- Shadow before cutover: run new pipelines in parallel, compare with existing outputs.
- Fitness-gated promotion: only promote when quality, lineage, and SLO gates pass.
- Reversible by default: every change SHALL have a documented rollback per V11.


## Chapter 12 — Business Glossary

**Purpose.** Provide a single, versioned dictionary of business terms and their formal definitions.

**Architecture.** Layered architecture composed of ingestion, storage, processing, governance, and consumption planes, aligned to the Enterprise Reference Architecture ratified in V11.

**ASCII Diagram.**
```text
[Producers] ─▶ [Contract] ─▶ [Pipeline] ─▶ [Storage] ─▶ [Serving] ─▶ [Consumers]
                     │                                     │
                     └────────── Governance / Lineage ─────┘
```

**Rules (RFC 2119).**
- Producers MUST publish schemas to the registry before emission.
- Consumers SHALL validate payloads against the registered schema.
- Breaking changes MUST NOT be released without a governance approval per V11.
- Sensitive fields MUST be classified per Chapter 25 (Data Classification).
- Lineage SHALL be captured for every transformation.

**Examples.**
- A `patient.registered` event carries `tenant_id`, `branch_id`, and a canonical `party_id`.
- The `invoice.line` dimension conforms to the enterprise `Money` type.
- The `appointment.no_show` fact links to `Party`, `Provider`, `Location`, and `Time` dimensions.

**Future Implementation Notes.** Reference the enterprise Canonical Data Model. Do not couple to vendor-specific storage semantics. Adopt open table formats where practical.

**Backward Compatibility Notes.** Additive only. Existing schemas, tables, RLS policies, and services continue to operate unchanged. No migration is prescribed.

**Security Notes.** Alignment with V10 Zero-Trust: least-privilege access to data planes, encryption at rest and in transit, and field-level classification enforced by policy.

**Performance Notes.** Sampling, partitioning, indexing, and materialization strategies SHOULD align with SLOs published in V12.

**Governance Notes.** Owned by the Enterprise Data Council under V11 ARB with domain-level stewards defined in Chapter 6 (Data Ownership).

**Extended Discussion.**
This chapter forms part of the ZMedico Enterprise Data Platform (EDP) architectural corpus.
It codifies the intent, boundaries, and interfaces of the concern without prescribing runtime
implementation. Where implementation is eventually undertaken, the Governance Workflow ratified
in V6 SHALL apply, and the architectural boundaries defined in V8, V9, V10, V11, and V12 SHALL
be respected. Nothing in this chapter changes application code, database schema, RLS policies,
SECURITY DEFINER functions, Edge Functions, generated types, tests, package manifests, or
infrastructure assets.

**Interfaces.**
- **To V8 Authorization.** All data access decisions remain authoritative under RLS and V8
  policies. This chapter MUST NOT be interpreted as altering those decisions.
- **To V9 Identity.** Principal identity, trust envelopes, and session semantics are owned by
  V9. This chapter consumes identity as a fact; it does not redefine it.
- **To V10 Security.** Encryption, key management, and sensitivity classification are governed
  by V10. This chapter aligns to those classifications without inventing new ones.
- **To V11 Governance.** All decisions arising from this chapter SHALL be routed through the
  ARB, ADR, and lifecycle mechanisms V11 defines.
- **To V12 Observability.** Data-plane telemetry (freshness, quality, lineage, throughput) is
  emitted through the observability signals V12 standardizes; V13 defines the semantics, V12
  defines the transport.

**Design Considerations.**
- Prefer *contract-first* design: producers publish schemas and semantics before any consumer
  couples to them.
- Prefer *open standards*: SQL, OpenAPI, AsyncAPI, JSON Schema, Avro, Parquet, Iceberg/Delta,
  OpenLineage, DCAT.
- Prefer *decentralized ownership with federated governance*: domain teams own products; a
  federated council owns policy.
- Prefer *bounded contexts*: cross-domain coupling flows through published contracts, not
  through shared physical tables.
- Prefer *evolvability*: schemas evolve with compatibility rules; consumers negotiate versions
  through the schema registry.

**Anti-Patterns to Avoid.**
- Shared mutable OLTP tables as an integration channel.
- Untyped, unversioned event payloads.
- Point-to-point pipelines with no lineage capture.
- Silent schema drift with no compatibility gate.
- Uncontrolled cross-tenant joins.

**Compliance Alignment.**
- **HIPAA**: Preserve minimum necessary access; PHI is handled per V10 classifications.
- **GDPR**: Preserve lawful basis and purpose limitation; enable subject rights.
- **ISO 27001**: Align to Annex A controls for information classification, cryptography, and
  supplier data handling.
- **NIST 800-53**: Align to AC, AU, SC, and SI family controls at the data plane.

**Operational Envelope.**
- Data SLAs SHALL be published per data product (freshness, completeness, availability).
- Quality signals SHALL be observable in V12 dashboards.
- Incidents affecting data products SHALL follow the incident management workflow ratified
  by V12 Chapter 47.

**Explicit Non-Goals.**
- This chapter does NOT define authorization semantics.
- This chapter does NOT define identity or session semantics.
- This chapter does NOT define encryption primitives or key custody.
- This chapter does NOT change any existing database object, RLS policy, or SECURITY DEFINER
  function.
- This chapter does NOT introduce or modify Edge Functions or React/TypeScript modules.

**Rollout Philosophy (When Implementation Is Later Approved).**
- Additive first: introduce new datasets, contracts, and pipelines alongside existing ones.
- Shadow before cutover: run new pipelines in parallel, compare with existing outputs.
- Fitness-gated promotion: only promote when quality, lineage, and SLO gates pass.
- Reversible by default: every change SHALL have a documented rollback per V11.


## Chapter 13 — Enterprise Taxonomy

**Purpose.** Provide the classification skeleton for content, data, and permissions.

**Architecture.** Layered architecture composed of ingestion, storage, processing, governance, and consumption planes, aligned to the Enterprise Reference Architecture ratified in V11.

**ASCII Diagram.**
```text
[Producers] ─▶ [Contract] ─▶ [Pipeline] ─▶ [Storage] ─▶ [Serving] ─▶ [Consumers]
                     │                                     │
                     └────────── Governance / Lineage ─────┘
```

**Rules (RFC 2119).**
- Producers MUST publish schemas to the registry before emission.
- Consumers SHALL validate payloads against the registered schema.
- Breaking changes MUST NOT be released without a governance approval per V11.
- Sensitive fields MUST be classified per Chapter 25 (Data Classification).
- Lineage SHALL be captured for every transformation.

**Examples.**
- A `patient.registered` event carries `tenant_id`, `branch_id`, and a canonical `party_id`.
- The `invoice.line` dimension conforms to the enterprise `Money` type.
- The `appointment.no_show` fact links to `Party`, `Provider`, `Location`, and `Time` dimensions.

**Future Implementation Notes.** Reference the enterprise Canonical Data Model. Do not couple to vendor-specific storage semantics. Adopt open table formats where practical.

**Backward Compatibility Notes.** Additive only. Existing schemas, tables, RLS policies, and services continue to operate unchanged. No migration is prescribed.

**Security Notes.** Alignment with V10 Zero-Trust: least-privilege access to data planes, encryption at rest and in transit, and field-level classification enforced by policy.

**Performance Notes.** Sampling, partitioning, indexing, and materialization strategies SHOULD align with SLOs published in V12.

**Governance Notes.** Owned by the Enterprise Data Council under V11 ARB with domain-level stewards defined in Chapter 6 (Data Ownership).

**Extended Discussion.**
This chapter forms part of the ZMedico Enterprise Data Platform (EDP) architectural corpus.
It codifies the intent, boundaries, and interfaces of the concern without prescribing runtime
implementation. Where implementation is eventually undertaken, the Governance Workflow ratified
in V6 SHALL apply, and the architectural boundaries defined in V8, V9, V10, V11, and V12 SHALL
be respected. Nothing in this chapter changes application code, database schema, RLS policies,
SECURITY DEFINER functions, Edge Functions, generated types, tests, package manifests, or
infrastructure assets.

**Interfaces.**
- **To V8 Authorization.** All data access decisions remain authoritative under RLS and V8
  policies. This chapter MUST NOT be interpreted as altering those decisions.
- **To V9 Identity.** Principal identity, trust envelopes, and session semantics are owned by
  V9. This chapter consumes identity as a fact; it does not redefine it.
- **To V10 Security.** Encryption, key management, and sensitivity classification are governed
  by V10. This chapter aligns to those classifications without inventing new ones.
- **To V11 Governance.** All decisions arising from this chapter SHALL be routed through the
  ARB, ADR, and lifecycle mechanisms V11 defines.
- **To V12 Observability.** Data-plane telemetry (freshness, quality, lineage, throughput) is
  emitted through the observability signals V12 standardizes; V13 defines the semantics, V12
  defines the transport.

**Design Considerations.**
- Prefer *contract-first* design: producers publish schemas and semantics before any consumer
  couples to them.
- Prefer *open standards*: SQL, OpenAPI, AsyncAPI, JSON Schema, Avro, Parquet, Iceberg/Delta,
  OpenLineage, DCAT.
- Prefer *decentralized ownership with federated governance*: domain teams own products; a
  federated council owns policy.
- Prefer *bounded contexts*: cross-domain coupling flows through published contracts, not
  through shared physical tables.
- Prefer *evolvability*: schemas evolve with compatibility rules; consumers negotiate versions
  through the schema registry.

**Anti-Patterns to Avoid.**
- Shared mutable OLTP tables as an integration channel.
- Untyped, unversioned event payloads.
- Point-to-point pipelines with no lineage capture.
- Silent schema drift with no compatibility gate.
- Uncontrolled cross-tenant joins.

**Compliance Alignment.**
- **HIPAA**: Preserve minimum necessary access; PHI is handled per V10 classifications.
- **GDPR**: Preserve lawful basis and purpose limitation; enable subject rights.
- **ISO 27001**: Align to Annex A controls for information classification, cryptography, and
  supplier data handling.
- **NIST 800-53**: Align to AC, AU, SC, and SI family controls at the data plane.

**Operational Envelope.**
- Data SLAs SHALL be published per data product (freshness, completeness, availability).
- Quality signals SHALL be observable in V12 dashboards.
- Incidents affecting data products SHALL follow the incident management workflow ratified
  by V12 Chapter 47.

**Explicit Non-Goals.**
- This chapter does NOT define authorization semantics.
- This chapter does NOT define identity or session semantics.
- This chapter does NOT define encryption primitives or key custody.
- This chapter does NOT change any existing database object, RLS policy, or SECURITY DEFINER
  function.
- This chapter does NOT introduce or modify Edge Functions or React/TypeScript modules.

**Rollout Philosophy (When Implementation Is Later Approved).**
- Additive first: introduce new datasets, contracts, and pipelines alongside existing ones.
- Shadow before cutover: run new pipelines in parallel, compare with existing outputs.
- Fitness-gated promotion: only promote when quality, lineage, and SLO gates pass.
- Reversible by default: every change SHALL have a documented rollback per V11.


## Chapter 14 — Data Lineage

**Purpose.** Trace data from source to consumption across every transformation.

**Architecture.** Layered architecture composed of ingestion, storage, processing, governance, and consumption planes, aligned to the Enterprise Reference Architecture ratified in V11.

**ASCII Diagram.**
```text
[Producers] ─▶ [Contract] ─▶ [Pipeline] ─▶ [Storage] ─▶ [Serving] ─▶ [Consumers]
                     │                                     │
                     └────────── Governance / Lineage ─────┘
```

**Rules (RFC 2119).**
- Producers MUST publish schemas to the registry before emission.
- Consumers SHALL validate payloads against the registered schema.
- Breaking changes MUST NOT be released without a governance approval per V11.
- Sensitive fields MUST be classified per Chapter 25 (Data Classification).
- Lineage SHALL be captured for every transformation.

**Examples.**
- A `patient.registered` event carries `tenant_id`, `branch_id`, and a canonical `party_id`.
- The `invoice.line` dimension conforms to the enterprise `Money` type.
- The `appointment.no_show` fact links to `Party`, `Provider`, `Location`, and `Time` dimensions.

**Future Implementation Notes.** Reference the enterprise Canonical Data Model. Do not couple to vendor-specific storage semantics. Adopt open table formats where practical.

**Backward Compatibility Notes.** Additive only. Existing schemas, tables, RLS policies, and services continue to operate unchanged. No migration is prescribed.

**Security Notes.** Alignment with V10 Zero-Trust: least-privilege access to data planes, encryption at rest and in transit, and field-level classification enforced by policy.

**Performance Notes.** Sampling, partitioning, indexing, and materialization strategies SHOULD align with SLOs published in V12.

**Governance Notes.** Owned by the Enterprise Data Council under V11 ARB with domain-level stewards defined in Chapter 6 (Data Ownership).

**Extended Discussion.**
This chapter forms part of the ZMedico Enterprise Data Platform (EDP) architectural corpus.
It codifies the intent, boundaries, and interfaces of the concern without prescribing runtime
implementation. Where implementation is eventually undertaken, the Governance Workflow ratified
in V6 SHALL apply, and the architectural boundaries defined in V8, V9, V10, V11, and V12 SHALL
be respected. Nothing in this chapter changes application code, database schema, RLS policies,
SECURITY DEFINER functions, Edge Functions, generated types, tests, package manifests, or
infrastructure assets.

**Interfaces.**
- **To V8 Authorization.** All data access decisions remain authoritative under RLS and V8
  policies. This chapter MUST NOT be interpreted as altering those decisions.
- **To V9 Identity.** Principal identity, trust envelopes, and session semantics are owned by
  V9. This chapter consumes identity as a fact; it does not redefine it.
- **To V10 Security.** Encryption, key management, and sensitivity classification are governed
  by V10. This chapter aligns to those classifications without inventing new ones.
- **To V11 Governance.** All decisions arising from this chapter SHALL be routed through the
  ARB, ADR, and lifecycle mechanisms V11 defines.
- **To V12 Observability.** Data-plane telemetry (freshness, quality, lineage, throughput) is
  emitted through the observability signals V12 standardizes; V13 defines the semantics, V12
  defines the transport.

**Design Considerations.**
- Prefer *contract-first* design: producers publish schemas and semantics before any consumer
  couples to them.
- Prefer *open standards*: SQL, OpenAPI, AsyncAPI, JSON Schema, Avro, Parquet, Iceberg/Delta,
  OpenLineage, DCAT.
- Prefer *decentralized ownership with federated governance*: domain teams own products; a
  federated council owns policy.
- Prefer *bounded contexts*: cross-domain coupling flows through published contracts, not
  through shared physical tables.
- Prefer *evolvability*: schemas evolve with compatibility rules; consumers negotiate versions
  through the schema registry.

**Anti-Patterns to Avoid.**
- Shared mutable OLTP tables as an integration channel.
- Untyped, unversioned event payloads.
- Point-to-point pipelines with no lineage capture.
- Silent schema drift with no compatibility gate.
- Uncontrolled cross-tenant joins.

**Compliance Alignment.**
- **HIPAA**: Preserve minimum necessary access; PHI is handled per V10 classifications.
- **GDPR**: Preserve lawful basis and purpose limitation; enable subject rights.
- **ISO 27001**: Align to Annex A controls for information classification, cryptography, and
  supplier data handling.
- **NIST 800-53**: Align to AC, AU, SC, and SI family controls at the data plane.

**Operational Envelope.**
- Data SLAs SHALL be published per data product (freshness, completeness, availability).
- Quality signals SHALL be observable in V12 dashboards.
- Incidents affecting data products SHALL follow the incident management workflow ratified
  by V12 Chapter 47.

**Explicit Non-Goals.**
- This chapter does NOT define authorization semantics.
- This chapter does NOT define identity or session semantics.
- This chapter does NOT define encryption primitives or key custody.
- This chapter does NOT change any existing database object, RLS policy, or SECURITY DEFINER
  function.
- This chapter does NOT introduce or modify Edge Functions or React/TypeScript modules.

**Rollout Philosophy (When Implementation Is Later Approved).**
- Additive first: introduce new datasets, contracts, and pipelines alongside existing ones.
- Shadow before cutover: run new pipelines in parallel, compare with existing outputs.
- Fitness-gated promotion: only promote when quality, lineage, and SLO gates pass.
- Reversible by default: every change SHALL have a documented rollback per V11.


## Chapter 15 — Data Provenance

**Purpose.** Prove where data came from, who produced it, and under what authority.

**Architecture.** Layered architecture composed of ingestion, storage, processing, governance, and consumption planes, aligned to the Enterprise Reference Architecture ratified in V11.

**ASCII Diagram.**
```text
[Producers] ─▶ [Contract] ─▶ [Pipeline] ─▶ [Storage] ─▶ [Serving] ─▶ [Consumers]
                     │                                     │
                     └────────── Governance / Lineage ─────┘
```

**Rules (RFC 2119).**
- Producers MUST publish schemas to the registry before emission.
- Consumers SHALL validate payloads against the registered schema.
- Breaking changes MUST NOT be released without a governance approval per V11.
- Sensitive fields MUST be classified per Chapter 25 (Data Classification).
- Lineage SHALL be captured for every transformation.

**Examples.**
- A `patient.registered` event carries `tenant_id`, `branch_id`, and a canonical `party_id`.
- The `invoice.line` dimension conforms to the enterprise `Money` type.
- The `appointment.no_show` fact links to `Party`, `Provider`, `Location`, and `Time` dimensions.

**Future Implementation Notes.** Reference the enterprise Canonical Data Model. Do not couple to vendor-specific storage semantics. Adopt open table formats where practical.

**Backward Compatibility Notes.** Additive only. Existing schemas, tables, RLS policies, and services continue to operate unchanged. No migration is prescribed.

**Security Notes.** Alignment with V10 Zero-Trust: least-privilege access to data planes, encryption at rest and in transit, and field-level classification enforced by policy.

**Performance Notes.** Sampling, partitioning, indexing, and materialization strategies SHOULD align with SLOs published in V12.

**Governance Notes.** Owned by the Enterprise Data Council under V11 ARB with domain-level stewards defined in Chapter 6 (Data Ownership).

**Extended Discussion.**
This chapter forms part of the ZMedico Enterprise Data Platform (EDP) architectural corpus.
It codifies the intent, boundaries, and interfaces of the concern without prescribing runtime
implementation. Where implementation is eventually undertaken, the Governance Workflow ratified
in V6 SHALL apply, and the architectural boundaries defined in V8, V9, V10, V11, and V12 SHALL
be respected. Nothing in this chapter changes application code, database schema, RLS policies,
SECURITY DEFINER functions, Edge Functions, generated types, tests, package manifests, or
infrastructure assets.

**Interfaces.**
- **To V8 Authorization.** All data access decisions remain authoritative under RLS and V8
  policies. This chapter MUST NOT be interpreted as altering those decisions.
- **To V9 Identity.** Principal identity, trust envelopes, and session semantics are owned by
  V9. This chapter consumes identity as a fact; it does not redefine it.
- **To V10 Security.** Encryption, key management, and sensitivity classification are governed
  by V10. This chapter aligns to those classifications without inventing new ones.
- **To V11 Governance.** All decisions arising from this chapter SHALL be routed through the
  ARB, ADR, and lifecycle mechanisms V11 defines.
- **To V12 Observability.** Data-plane telemetry (freshness, quality, lineage, throughput) is
  emitted through the observability signals V12 standardizes; V13 defines the semantics, V12
  defines the transport.

**Design Considerations.**
- Prefer *contract-first* design: producers publish schemas and semantics before any consumer
  couples to them.
- Prefer *open standards*: SQL, OpenAPI, AsyncAPI, JSON Schema, Avro, Parquet, Iceberg/Delta,
  OpenLineage, DCAT.
- Prefer *decentralized ownership with federated governance*: domain teams own products; a
  federated council owns policy.
- Prefer *bounded contexts*: cross-domain coupling flows through published contracts, not
  through shared physical tables.
- Prefer *evolvability*: schemas evolve with compatibility rules; consumers negotiate versions
  through the schema registry.

**Anti-Patterns to Avoid.**
- Shared mutable OLTP tables as an integration channel.
- Untyped, unversioned event payloads.
- Point-to-point pipelines with no lineage capture.
- Silent schema drift with no compatibility gate.
- Uncontrolled cross-tenant joins.

**Compliance Alignment.**
- **HIPAA**: Preserve minimum necessary access; PHI is handled per V10 classifications.
- **GDPR**: Preserve lawful basis and purpose limitation; enable subject rights.
- **ISO 27001**: Align to Annex A controls for information classification, cryptography, and
  supplier data handling.
- **NIST 800-53**: Align to AC, AU, SC, and SI family controls at the data plane.

**Operational Envelope.**
- Data SLAs SHALL be published per data product (freshness, completeness, availability).
- Quality signals SHALL be observable in V12 dashboards.
- Incidents affecting data products SHALL follow the incident management workflow ratified
  by V12 Chapter 47.

**Explicit Non-Goals.**
- This chapter does NOT define authorization semantics.
- This chapter does NOT define identity or session semantics.
- This chapter does NOT define encryption primitives or key custody.
- This chapter does NOT change any existing database object, RLS policy, or SECURITY DEFINER
  function.
- This chapter does NOT introduce or modify Edge Functions or React/TypeScript modules.

**Rollout Philosophy (When Implementation Is Later Approved).**
- Additive first: introduce new datasets, contracts, and pipelines alongside existing ones.
- Shadow before cutover: run new pipelines in parallel, compare with existing outputs.
- Fitness-gated promotion: only promote when quality, lineage, and SLO gates pass.
- Reversible by default: every change SHALL have a documented rollback per V11.


## Chapter 16 — Data Catalog

**Purpose.** Publish a searchable inventory of datasets, contracts, and owners.

**Architecture.** Layered architecture composed of ingestion, storage, processing, governance, and consumption planes, aligned to the Enterprise Reference Architecture ratified in V11.

**ASCII Diagram.**
```text
[Producers] ─▶ [Contract] ─▶ [Pipeline] ─▶ [Storage] ─▶ [Serving] ─▶ [Consumers]
                     │                                     │
                     └────────── Governance / Lineage ─────┘
```

**Rules (RFC 2119).**
- Producers MUST publish schemas to the registry before emission.
- Consumers SHALL validate payloads against the registered schema.
- Breaking changes MUST NOT be released without a governance approval per V11.
- Sensitive fields MUST be classified per Chapter 25 (Data Classification).
- Lineage SHALL be captured for every transformation.

**Examples.**
- A `patient.registered` event carries `tenant_id`, `branch_id`, and a canonical `party_id`.
- The `invoice.line` dimension conforms to the enterprise `Money` type.
- The `appointment.no_show` fact links to `Party`, `Provider`, `Location`, and `Time` dimensions.

**Future Implementation Notes.** Reference the enterprise Canonical Data Model. Do not couple to vendor-specific storage semantics. Adopt open table formats where practical.

**Backward Compatibility Notes.** Additive only. Existing schemas, tables, RLS policies, and services continue to operate unchanged. No migration is prescribed.

**Security Notes.** Alignment with V10 Zero-Trust: least-privilege access to data planes, encryption at rest and in transit, and field-level classification enforced by policy.

**Performance Notes.** Sampling, partitioning, indexing, and materialization strategies SHOULD align with SLOs published in V12.

**Governance Notes.** Owned by the Enterprise Data Council under V11 ARB with domain-level stewards defined in Chapter 6 (Data Ownership).

**Extended Discussion.**
This chapter forms part of the ZMedico Enterprise Data Platform (EDP) architectural corpus.
It codifies the intent, boundaries, and interfaces of the concern without prescribing runtime
implementation. Where implementation is eventually undertaken, the Governance Workflow ratified
in V6 SHALL apply, and the architectural boundaries defined in V8, V9, V10, V11, and V12 SHALL
be respected. Nothing in this chapter changes application code, database schema, RLS policies,
SECURITY DEFINER functions, Edge Functions, generated types, tests, package manifests, or
infrastructure assets.

**Interfaces.**
- **To V8 Authorization.** All data access decisions remain authoritative under RLS and V8
  policies. This chapter MUST NOT be interpreted as altering those decisions.
- **To V9 Identity.** Principal identity, trust envelopes, and session semantics are owned by
  V9. This chapter consumes identity as a fact; it does not redefine it.
- **To V10 Security.** Encryption, key management, and sensitivity classification are governed
  by V10. This chapter aligns to those classifications without inventing new ones.
- **To V11 Governance.** All decisions arising from this chapter SHALL be routed through the
  ARB, ADR, and lifecycle mechanisms V11 defines.
- **To V12 Observability.** Data-plane telemetry (freshness, quality, lineage, throughput) is
  emitted through the observability signals V12 standardizes; V13 defines the semantics, V12
  defines the transport.

**Design Considerations.**
- Prefer *contract-first* design: producers publish schemas and semantics before any consumer
  couples to them.
- Prefer *open standards*: SQL, OpenAPI, AsyncAPI, JSON Schema, Avro, Parquet, Iceberg/Delta,
  OpenLineage, DCAT.
- Prefer *decentralized ownership with federated governance*: domain teams own products; a
  federated council owns policy.
- Prefer *bounded contexts*: cross-domain coupling flows through published contracts, not
  through shared physical tables.
- Prefer *evolvability*: schemas evolve with compatibility rules; consumers negotiate versions
  through the schema registry.

**Anti-Patterns to Avoid.**
- Shared mutable OLTP tables as an integration channel.
- Untyped, unversioned event payloads.
- Point-to-point pipelines with no lineage capture.
- Silent schema drift with no compatibility gate.
- Uncontrolled cross-tenant joins.

**Compliance Alignment.**
- **HIPAA**: Preserve minimum necessary access; PHI is handled per V10 classifications.
- **GDPR**: Preserve lawful basis and purpose limitation; enable subject rights.
- **ISO 27001**: Align to Annex A controls for information classification, cryptography, and
  supplier data handling.
- **NIST 800-53**: Align to AC, AU, SC, and SI family controls at the data plane.

**Operational Envelope.**
- Data SLAs SHALL be published per data product (freshness, completeness, availability).
- Quality signals SHALL be observable in V12 dashboards.
- Incidents affecting data products SHALL follow the incident management workflow ratified
  by V12 Chapter 47.

**Explicit Non-Goals.**
- This chapter does NOT define authorization semantics.
- This chapter does NOT define identity or session semantics.
- This chapter does NOT define encryption primitives or key custody.
- This chapter does NOT change any existing database object, RLS policy, or SECURITY DEFINER
  function.
- This chapter does NOT introduce or modify Edge Functions or React/TypeScript modules.

**Rollout Philosophy (When Implementation Is Later Approved).**
- Additive first: introduce new datasets, contracts, and pipelines alongside existing ones.
- Shadow before cutover: run new pipelines in parallel, compare with existing outputs.
- Fitness-gated promotion: only promote when quality, lineage, and SLO gates pass.
- Reversible by default: every change SHALL have a documented rollback per V11.


## Chapter 17 — Data Contracts

**Purpose.** Formalize producer/consumer expectations for schema, semantics, quality, and SLA.

**Architecture.** Layered architecture composed of ingestion, storage, processing, governance, and consumption planes, aligned to the Enterprise Reference Architecture ratified in V11.

**ASCII Diagram.**
```text
[Producers] ─▶ [Contract] ─▶ [Pipeline] ─▶ [Storage] ─▶ [Serving] ─▶ [Consumers]
                     │                                     │
                     └────────── Governance / Lineage ─────┘
```

**Rules (RFC 2119).**
- Producers MUST publish schemas to the registry before emission.
- Consumers SHALL validate payloads against the registered schema.
- Breaking changes MUST NOT be released without a governance approval per V11.
- Sensitive fields MUST be classified per Chapter 25 (Data Classification).
- Lineage SHALL be captured for every transformation.

**Examples.**
- A `patient.registered` event carries `tenant_id`, `branch_id`, and a canonical `party_id`.
- The `invoice.line` dimension conforms to the enterprise `Money` type.
- The `appointment.no_show` fact links to `Party`, `Provider`, `Location`, and `Time` dimensions.

**Future Implementation Notes.** Reference the enterprise Canonical Data Model. Do not couple to vendor-specific storage semantics. Adopt open table formats where practical.

**Backward Compatibility Notes.** Additive only. Existing schemas, tables, RLS policies, and services continue to operate unchanged. No migration is prescribed.

**Security Notes.** Alignment with V10 Zero-Trust: least-privilege access to data planes, encryption at rest and in transit, and field-level classification enforced by policy.

**Performance Notes.** Sampling, partitioning, indexing, and materialization strategies SHOULD align with SLOs published in V12.

**Governance Notes.** Owned by the Enterprise Data Council under V11 ARB with domain-level stewards defined in Chapter 6 (Data Ownership).

**Extended Discussion.**
This chapter forms part of the ZMedico Enterprise Data Platform (EDP) architectural corpus.
It codifies the intent, boundaries, and interfaces of the concern without prescribing runtime
implementation. Where implementation is eventually undertaken, the Governance Workflow ratified
in V6 SHALL apply, and the architectural boundaries defined in V8, V9, V10, V11, and V12 SHALL
be respected. Nothing in this chapter changes application code, database schema, RLS policies,
SECURITY DEFINER functions, Edge Functions, generated types, tests, package manifests, or
infrastructure assets.

**Interfaces.**
- **To V8 Authorization.** All data access decisions remain authoritative under RLS and V8
  policies. This chapter MUST NOT be interpreted as altering those decisions.
- **To V9 Identity.** Principal identity, trust envelopes, and session semantics are owned by
  V9. This chapter consumes identity as a fact; it does not redefine it.
- **To V10 Security.** Encryption, key management, and sensitivity classification are governed
  by V10. This chapter aligns to those classifications without inventing new ones.
- **To V11 Governance.** All decisions arising from this chapter SHALL be routed through the
  ARB, ADR, and lifecycle mechanisms V11 defines.
- **To V12 Observability.** Data-plane telemetry (freshness, quality, lineage, throughput) is
  emitted through the observability signals V12 standardizes; V13 defines the semantics, V12
  defines the transport.

**Design Considerations.**
- Prefer *contract-first* design: producers publish schemas and semantics before any consumer
  couples to them.
- Prefer *open standards*: SQL, OpenAPI, AsyncAPI, JSON Schema, Avro, Parquet, Iceberg/Delta,
  OpenLineage, DCAT.
- Prefer *decentralized ownership with federated governance*: domain teams own products; a
  federated council owns policy.
- Prefer *bounded contexts*: cross-domain coupling flows through published contracts, not
  through shared physical tables.
- Prefer *evolvability*: schemas evolve with compatibility rules; consumers negotiate versions
  through the schema registry.

**Anti-Patterns to Avoid.**
- Shared mutable OLTP tables as an integration channel.
- Untyped, unversioned event payloads.
- Point-to-point pipelines with no lineage capture.
- Silent schema drift with no compatibility gate.
- Uncontrolled cross-tenant joins.

**Compliance Alignment.**
- **HIPAA**: Preserve minimum necessary access; PHI is handled per V10 classifications.
- **GDPR**: Preserve lawful basis and purpose limitation; enable subject rights.
- **ISO 27001**: Align to Annex A controls for information classification, cryptography, and
  supplier data handling.
- **NIST 800-53**: Align to AC, AU, SC, and SI family controls at the data plane.

**Operational Envelope.**
- Data SLAs SHALL be published per data product (freshness, completeness, availability).
- Quality signals SHALL be observable in V12 dashboards.
- Incidents affecting data products SHALL follow the incident management workflow ratified
  by V12 Chapter 47.

**Explicit Non-Goals.**
- This chapter does NOT define authorization semantics.
- This chapter does NOT define identity or session semantics.
- This chapter does NOT define encryption primitives or key custody.
- This chapter does NOT change any existing database object, RLS policy, or SECURITY DEFINER
  function.
- This chapter does NOT introduce or modify Edge Functions or React/TypeScript modules.

**Rollout Philosophy (When Implementation Is Later Approved).**
- Additive first: introduce new datasets, contracts, and pipelines alongside existing ones.
- Shadow before cutover: run new pipelines in parallel, compare with existing outputs.
- Fitness-gated promotion: only promote when quality, lineage, and SLO gates pass.
- Reversible by default: every change SHALL have a documented rollback per V11.


## Chapter 18 — Data APIs

**Purpose.** Define standard access patterns (query, event, file) for enterprise datasets.

**Architecture.** Layered architecture composed of ingestion, storage, processing, governance, and consumption planes, aligned to the Enterprise Reference Architecture ratified in V11.

**ASCII Diagram.**
```text
[Producers] ─▶ [Contract] ─▶ [Pipeline] ─▶ [Storage] ─▶ [Serving] ─▶ [Consumers]
                     │                                     │
                     └────────── Governance / Lineage ─────┘
```

**Rules (RFC 2119).**
- Producers MUST publish schemas to the registry before emission.
- Consumers SHALL validate payloads against the registered schema.
- Breaking changes MUST NOT be released without a governance approval per V11.
- Sensitive fields MUST be classified per Chapter 25 (Data Classification).
- Lineage SHALL be captured for every transformation.

**Examples.**
- A `patient.registered` event carries `tenant_id`, `branch_id`, and a canonical `party_id`.
- The `invoice.line` dimension conforms to the enterprise `Money` type.
- The `appointment.no_show` fact links to `Party`, `Provider`, `Location`, and `Time` dimensions.

**Future Implementation Notes.** Reference the enterprise Canonical Data Model. Do not couple to vendor-specific storage semantics. Adopt open table formats where practical.

**Backward Compatibility Notes.** Additive only. Existing schemas, tables, RLS policies, and services continue to operate unchanged. No migration is prescribed.

**Security Notes.** Alignment with V10 Zero-Trust: least-privilege access to data planes, encryption at rest and in transit, and field-level classification enforced by policy.

**Performance Notes.** Sampling, partitioning, indexing, and materialization strategies SHOULD align with SLOs published in V12.

**Governance Notes.** Owned by the Enterprise Data Council under V11 ARB with domain-level stewards defined in Chapter 6 (Data Ownership).

**Extended Discussion.**
This chapter forms part of the ZMedico Enterprise Data Platform (EDP) architectural corpus.
It codifies the intent, boundaries, and interfaces of the concern without prescribing runtime
implementation. Where implementation is eventually undertaken, the Governance Workflow ratified
in V6 SHALL apply, and the architectural boundaries defined in V8, V9, V10, V11, and V12 SHALL
be respected. Nothing in this chapter changes application code, database schema, RLS policies,
SECURITY DEFINER functions, Edge Functions, generated types, tests, package manifests, or
infrastructure assets.

**Interfaces.**
- **To V8 Authorization.** All data access decisions remain authoritative under RLS and V8
  policies. This chapter MUST NOT be interpreted as altering those decisions.
- **To V9 Identity.** Principal identity, trust envelopes, and session semantics are owned by
  V9. This chapter consumes identity as a fact; it does not redefine it.
- **To V10 Security.** Encryption, key management, and sensitivity classification are governed
  by V10. This chapter aligns to those classifications without inventing new ones.
- **To V11 Governance.** All decisions arising from this chapter SHALL be routed through the
  ARB, ADR, and lifecycle mechanisms V11 defines.
- **To V12 Observability.** Data-plane telemetry (freshness, quality, lineage, throughput) is
  emitted through the observability signals V12 standardizes; V13 defines the semantics, V12
  defines the transport.

**Design Considerations.**
- Prefer *contract-first* design: producers publish schemas and semantics before any consumer
  couples to them.
- Prefer *open standards*: SQL, OpenAPI, AsyncAPI, JSON Schema, Avro, Parquet, Iceberg/Delta,
  OpenLineage, DCAT.
- Prefer *decentralized ownership with federated governance*: domain teams own products; a
  federated council owns policy.
- Prefer *bounded contexts*: cross-domain coupling flows through published contracts, not
  through shared physical tables.
- Prefer *evolvability*: schemas evolve with compatibility rules; consumers negotiate versions
  through the schema registry.

**Anti-Patterns to Avoid.**
- Shared mutable OLTP tables as an integration channel.
- Untyped, unversioned event payloads.
- Point-to-point pipelines with no lineage capture.
- Silent schema drift with no compatibility gate.
- Uncontrolled cross-tenant joins.

**Compliance Alignment.**
- **HIPAA**: Preserve minimum necessary access; PHI is handled per V10 classifications.
- **GDPR**: Preserve lawful basis and purpose limitation; enable subject rights.
- **ISO 27001**: Align to Annex A controls for information classification, cryptography, and
  supplier data handling.
- **NIST 800-53**: Align to AC, AU, SC, and SI family controls at the data plane.

**Operational Envelope.**
- Data SLAs SHALL be published per data product (freshness, completeness, availability).
- Quality signals SHALL be observable in V12 dashboards.
- Incidents affecting data products SHALL follow the incident management workflow ratified
  by V12 Chapter 47.

**Explicit Non-Goals.**
- This chapter does NOT define authorization semantics.
- This chapter does NOT define identity or session semantics.
- This chapter does NOT define encryption primitives or key custody.
- This chapter does NOT change any existing database object, RLS policy, or SECURITY DEFINER
  function.
- This chapter does NOT introduce or modify Edge Functions or React/TypeScript modules.

**Rollout Philosophy (When Implementation Is Later Approved).**
- Additive first: introduce new datasets, contracts, and pipelines alongside existing ones.
- Shadow before cutover: run new pipelines in parallel, compare with existing outputs.
- Fitness-gated promotion: only promote when quality, lineage, and SLO gates pass.
- Reversible by default: every change SHALL have a documented rollback per V11.


## Chapter 19 — Event Schemas

**Purpose.** Standardize event payload shapes for durable, evolvable event flows.

**Architecture.** Layered architecture composed of ingestion, storage, processing, governance, and consumption planes, aligned to the Enterprise Reference Architecture ratified in V11.

**ASCII Diagram.**
```text
[Producers] ─▶ [Contract] ─▶ [Pipeline] ─▶ [Storage] ─▶ [Serving] ─▶ [Consumers]
                     │                                     │
                     └────────── Governance / Lineage ─────┘
```

**Rules (RFC 2119).**
- Producers MUST publish schemas to the registry before emission.
- Consumers SHALL validate payloads against the registered schema.
- Breaking changes MUST NOT be released without a governance approval per V11.
- Sensitive fields MUST be classified per Chapter 25 (Data Classification).
- Lineage SHALL be captured for every transformation.

**Examples.**
- A `patient.registered` event carries `tenant_id`, `branch_id`, and a canonical `party_id`.
- The `invoice.line` dimension conforms to the enterprise `Money` type.
- The `appointment.no_show` fact links to `Party`, `Provider`, `Location`, and `Time` dimensions.

**Future Implementation Notes.** Reference the enterprise Canonical Data Model. Do not couple to vendor-specific storage semantics. Adopt open table formats where practical.

**Backward Compatibility Notes.** Additive only. Existing schemas, tables, RLS policies, and services continue to operate unchanged. No migration is prescribed.

**Security Notes.** Alignment with V10 Zero-Trust: least-privilege access to data planes, encryption at rest and in transit, and field-level classification enforced by policy.

**Performance Notes.** Sampling, partitioning, indexing, and materialization strategies SHOULD align with SLOs published in V12.

**Governance Notes.** Owned by the Enterprise Data Council under V11 ARB with domain-level stewards defined in Chapter 6 (Data Ownership).

**Extended Discussion.**
This chapter forms part of the ZMedico Enterprise Data Platform (EDP) architectural corpus.
It codifies the intent, boundaries, and interfaces of the concern without prescribing runtime
implementation. Where implementation is eventually undertaken, the Governance Workflow ratified
in V6 SHALL apply, and the architectural boundaries defined in V8, V9, V10, V11, and V12 SHALL
be respected. Nothing in this chapter changes application code, database schema, RLS policies,
SECURITY DEFINER functions, Edge Functions, generated types, tests, package manifests, or
infrastructure assets.

**Interfaces.**
- **To V8 Authorization.** All data access decisions remain authoritative under RLS and V8
  policies. This chapter MUST NOT be interpreted as altering those decisions.
- **To V9 Identity.** Principal identity, trust envelopes, and session semantics are owned by
  V9. This chapter consumes identity as a fact; it does not redefine it.
- **To V10 Security.** Encryption, key management, and sensitivity classification are governed
  by V10. This chapter aligns to those classifications without inventing new ones.
- **To V11 Governance.** All decisions arising from this chapter SHALL be routed through the
  ARB, ADR, and lifecycle mechanisms V11 defines.
- **To V12 Observability.** Data-plane telemetry (freshness, quality, lineage, throughput) is
  emitted through the observability signals V12 standardizes; V13 defines the semantics, V12
  defines the transport.

**Design Considerations.**
- Prefer *contract-first* design: producers publish schemas and semantics before any consumer
  couples to them.
- Prefer *open standards*: SQL, OpenAPI, AsyncAPI, JSON Schema, Avro, Parquet, Iceberg/Delta,
  OpenLineage, DCAT.
- Prefer *decentralized ownership with federated governance*: domain teams own products; a
  federated council owns policy.
- Prefer *bounded contexts*: cross-domain coupling flows through published contracts, not
  through shared physical tables.
- Prefer *evolvability*: schemas evolve with compatibility rules; consumers negotiate versions
  through the schema registry.

**Anti-Patterns to Avoid.**
- Shared mutable OLTP tables as an integration channel.
- Untyped, unversioned event payloads.
- Point-to-point pipelines with no lineage capture.
- Silent schema drift with no compatibility gate.
- Uncontrolled cross-tenant joins.

**Compliance Alignment.**
- **HIPAA**: Preserve minimum necessary access; PHI is handled per V10 classifications.
- **GDPR**: Preserve lawful basis and purpose limitation; enable subject rights.
- **ISO 27001**: Align to Annex A controls for information classification, cryptography, and
  supplier data handling.
- **NIST 800-53**: Align to AC, AU, SC, and SI family controls at the data plane.

**Operational Envelope.**
- Data SLAs SHALL be published per data product (freshness, completeness, availability).
- Quality signals SHALL be observable in V12 dashboards.
- Incidents affecting data products SHALL follow the incident management workflow ratified
  by V12 Chapter 47.

**Explicit Non-Goals.**
- This chapter does NOT define authorization semantics.
- This chapter does NOT define identity or session semantics.
- This chapter does NOT define encryption primitives or key custody.
- This chapter does NOT change any existing database object, RLS policy, or SECURITY DEFINER
  function.
- This chapter does NOT introduce or modify Edge Functions or React/TypeScript modules.

**Rollout Philosophy (When Implementation Is Later Approved).**
- Additive first: introduce new datasets, contracts, and pipelines alongside existing ones.
- Shadow before cutover: run new pipelines in parallel, compare with existing outputs.
- Fitness-gated promotion: only promote when quality, lineage, and SLO gates pass.
- Reversible by default: every change SHALL have a documented rollback per V11.


## Chapter 20 — Schema Registry

**Purpose.** Serve as the source of truth for all data schemas across the enterprise.

**Architecture.** Layered architecture composed of ingestion, storage, processing, governance, and consumption planes, aligned to the Enterprise Reference Architecture ratified in V11.

**ASCII Diagram.**
```text
[Producers] ─▶ [Contract] ─▶ [Pipeline] ─▶ [Storage] ─▶ [Serving] ─▶ [Consumers]
                     │                                     │
                     └────────── Governance / Lineage ─────┘
```

**Rules (RFC 2119).**
- Producers MUST publish schemas to the registry before emission.
- Consumers SHALL validate payloads against the registered schema.
- Breaking changes MUST NOT be released without a governance approval per V11.
- Sensitive fields MUST be classified per Chapter 25 (Data Classification).
- Lineage SHALL be captured for every transformation.

**Examples.**
- A `patient.registered` event carries `tenant_id`, `branch_id`, and a canonical `party_id`.
- The `invoice.line` dimension conforms to the enterprise `Money` type.
- The `appointment.no_show` fact links to `Party`, `Provider`, `Location`, and `Time` dimensions.

**Future Implementation Notes.** Reference the enterprise Canonical Data Model. Do not couple to vendor-specific storage semantics. Adopt open table formats where practical.

**Backward Compatibility Notes.** Additive only. Existing schemas, tables, RLS policies, and services continue to operate unchanged. No migration is prescribed.

**Security Notes.** Alignment with V10 Zero-Trust: least-privilege access to data planes, encryption at rest and in transit, and field-level classification enforced by policy.

**Performance Notes.** Sampling, partitioning, indexing, and materialization strategies SHOULD align with SLOs published in V12.

**Governance Notes.** Owned by the Enterprise Data Council under V11 ARB with domain-level stewards defined in Chapter 6 (Data Ownership).

**Extended Discussion.**
This chapter forms part of the ZMedico Enterprise Data Platform (EDP) architectural corpus.
It codifies the intent, boundaries, and interfaces of the concern without prescribing runtime
implementation. Where implementation is eventually undertaken, the Governance Workflow ratified
in V6 SHALL apply, and the architectural boundaries defined in V8, V9, V10, V11, and V12 SHALL
be respected. Nothing in this chapter changes application code, database schema, RLS policies,
SECURITY DEFINER functions, Edge Functions, generated types, tests, package manifests, or
infrastructure assets.

**Interfaces.**
- **To V8 Authorization.** All data access decisions remain authoritative under RLS and V8
  policies. This chapter MUST NOT be interpreted as altering those decisions.
- **To V9 Identity.** Principal identity, trust envelopes, and session semantics are owned by
  V9. This chapter consumes identity as a fact; it does not redefine it.
- **To V10 Security.** Encryption, key management, and sensitivity classification are governed
  by V10. This chapter aligns to those classifications without inventing new ones.
- **To V11 Governance.** All decisions arising from this chapter SHALL be routed through the
  ARB, ADR, and lifecycle mechanisms V11 defines.
- **To V12 Observability.** Data-plane telemetry (freshness, quality, lineage, throughput) is
  emitted through the observability signals V12 standardizes; V13 defines the semantics, V12
  defines the transport.

**Design Considerations.**
- Prefer *contract-first* design: producers publish schemas and semantics before any consumer
  couples to them.
- Prefer *open standards*: SQL, OpenAPI, AsyncAPI, JSON Schema, Avro, Parquet, Iceberg/Delta,
  OpenLineage, DCAT.
- Prefer *decentralized ownership with federated governance*: domain teams own products; a
  federated council owns policy.
- Prefer *bounded contexts*: cross-domain coupling flows through published contracts, not
  through shared physical tables.
- Prefer *evolvability*: schemas evolve with compatibility rules; consumers negotiate versions
  through the schema registry.

**Anti-Patterns to Avoid.**
- Shared mutable OLTP tables as an integration channel.
- Untyped, unversioned event payloads.
- Point-to-point pipelines with no lineage capture.
- Silent schema drift with no compatibility gate.
- Uncontrolled cross-tenant joins.

**Compliance Alignment.**
- **HIPAA**: Preserve minimum necessary access; PHI is handled per V10 classifications.
- **GDPR**: Preserve lawful basis and purpose limitation; enable subject rights.
- **ISO 27001**: Align to Annex A controls for information classification, cryptography, and
  supplier data handling.
- **NIST 800-53**: Align to AC, AU, SC, and SI family controls at the data plane.

**Operational Envelope.**
- Data SLAs SHALL be published per data product (freshness, completeness, availability).
- Quality signals SHALL be observable in V12 dashboards.
- Incidents affecting data products SHALL follow the incident management workflow ratified
  by V12 Chapter 47.

**Explicit Non-Goals.**
- This chapter does NOT define authorization semantics.
- This chapter does NOT define identity or session semantics.
- This chapter does NOT define encryption primitives or key custody.
- This chapter does NOT change any existing database object, RLS policy, or SECURITY DEFINER
  function.
- This chapter does NOT introduce or modify Edge Functions or React/TypeScript modules.

**Rollout Philosophy (When Implementation Is Later Approved).**
- Additive first: introduce new datasets, contracts, and pipelines alongside existing ones.
- Shadow before cutover: run new pipelines in parallel, compare with existing outputs.
- Fitness-gated promotion: only promote when quality, lineage, and SLO gates pass.
- Reversible by default: every change SHALL have a documented rollback per V11.


## Chapter 21 — Data Versioning

**Purpose.** Version datasets, schemas, and semantics with compatibility rules.

**Architecture.** Layered architecture composed of ingestion, storage, processing, governance, and consumption planes, aligned to the Enterprise Reference Architecture ratified in V11.

**ASCII Diagram.**
```text
[Producers] ─▶ [Contract] ─▶ [Pipeline] ─▶ [Storage] ─▶ [Serving] ─▶ [Consumers]
                     │                                     │
                     └────────── Governance / Lineage ─────┘
```

**Rules (RFC 2119).**
- Producers MUST publish schemas to the registry before emission.
- Consumers SHALL validate payloads against the registered schema.
- Breaking changes MUST NOT be released without a governance approval per V11.
- Sensitive fields MUST be classified per Chapter 25 (Data Classification).
- Lineage SHALL be captured for every transformation.

**Examples.**
- A `patient.registered` event carries `tenant_id`, `branch_id`, and a canonical `party_id`.
- The `invoice.line` dimension conforms to the enterprise `Money` type.
- The `appointment.no_show` fact links to `Party`, `Provider`, `Location`, and `Time` dimensions.

**Future Implementation Notes.** Reference the enterprise Canonical Data Model. Do not couple to vendor-specific storage semantics. Adopt open table formats where practical.

**Backward Compatibility Notes.** Additive only. Existing schemas, tables, RLS policies, and services continue to operate unchanged. No migration is prescribed.

**Security Notes.** Alignment with V10 Zero-Trust: least-privilege access to data planes, encryption at rest and in transit, and field-level classification enforced by policy.

**Performance Notes.** Sampling, partitioning, indexing, and materialization strategies SHOULD align with SLOs published in V12.

**Governance Notes.** Owned by the Enterprise Data Council under V11 ARB with domain-level stewards defined in Chapter 6 (Data Ownership).

**Extended Discussion.**
This chapter forms part of the ZMedico Enterprise Data Platform (EDP) architectural corpus.
It codifies the intent, boundaries, and interfaces of the concern without prescribing runtime
implementation. Where implementation is eventually undertaken, the Governance Workflow ratified
in V6 SHALL apply, and the architectural boundaries defined in V8, V9, V10, V11, and V12 SHALL
be respected. Nothing in this chapter changes application code, database schema, RLS policies,
SECURITY DEFINER functions, Edge Functions, generated types, tests, package manifests, or
infrastructure assets.

**Interfaces.**
- **To V8 Authorization.** All data access decisions remain authoritative under RLS and V8
  policies. This chapter MUST NOT be interpreted as altering those decisions.
- **To V9 Identity.** Principal identity, trust envelopes, and session semantics are owned by
  V9. This chapter consumes identity as a fact; it does not redefine it.
- **To V10 Security.** Encryption, key management, and sensitivity classification are governed
  by V10. This chapter aligns to those classifications without inventing new ones.
- **To V11 Governance.** All decisions arising from this chapter SHALL be routed through the
  ARB, ADR, and lifecycle mechanisms V11 defines.
- **To V12 Observability.** Data-plane telemetry (freshness, quality, lineage, throughput) is
  emitted through the observability signals V12 standardizes; V13 defines the semantics, V12
  defines the transport.

**Design Considerations.**
- Prefer *contract-first* design: producers publish schemas and semantics before any consumer
  couples to them.
- Prefer *open standards*: SQL, OpenAPI, AsyncAPI, JSON Schema, Avro, Parquet, Iceberg/Delta,
  OpenLineage, DCAT.
- Prefer *decentralized ownership with federated governance*: domain teams own products; a
  federated council owns policy.
- Prefer *bounded contexts*: cross-domain coupling flows through published contracts, not
  through shared physical tables.
- Prefer *evolvability*: schemas evolve with compatibility rules; consumers negotiate versions
  through the schema registry.

**Anti-Patterns to Avoid.**
- Shared mutable OLTP tables as an integration channel.
- Untyped, unversioned event payloads.
- Point-to-point pipelines with no lineage capture.
- Silent schema drift with no compatibility gate.
- Uncontrolled cross-tenant joins.

**Compliance Alignment.**
- **HIPAA**: Preserve minimum necessary access; PHI is handled per V10 classifications.
- **GDPR**: Preserve lawful basis and purpose limitation; enable subject rights.
- **ISO 27001**: Align to Annex A controls for information classification, cryptography, and
  supplier data handling.
- **NIST 800-53**: Align to AC, AU, SC, and SI family controls at the data plane.

**Operational Envelope.**
- Data SLAs SHALL be published per data product (freshness, completeness, availability).
- Quality signals SHALL be observable in V12 dashboards.
- Incidents affecting data products SHALL follow the incident management workflow ratified
  by V12 Chapter 47.

**Explicit Non-Goals.**
- This chapter does NOT define authorization semantics.
- This chapter does NOT define identity or session semantics.
- This chapter does NOT define encryption primitives or key custody.
- This chapter does NOT change any existing database object, RLS policy, or SECURITY DEFINER
  function.
- This chapter does NOT introduce or modify Edge Functions or React/TypeScript modules.

**Rollout Philosophy (When Implementation Is Later Approved).**
- Additive first: introduce new datasets, contracts, and pipelines alongside existing ones.
- Shadow before cutover: run new pipelines in parallel, compare with existing outputs.
- Fitness-gated promotion: only promote when quality, lineage, and SLO gates pass.
- Reversible by default: every change SHALL have a documented rollback per V11.


## Chapter 22 — Data Quality

**Purpose.** Measure, monitor, and enforce fitness-for-purpose of datasets.

**Architecture.** Layered architecture composed of ingestion, storage, processing, governance, and consumption planes, aligned to the Enterprise Reference Architecture ratified in V11.

**ASCII Diagram.**
```text
[Producers] ─▶ [Contract] ─▶ [Pipeline] ─▶ [Storage] ─▶ [Serving] ─▶ [Consumers]
                     │                                     │
                     └────────── Governance / Lineage ─────┘
```

**Rules (RFC 2119).**
- Producers MUST publish schemas to the registry before emission.
- Consumers SHALL validate payloads against the registered schema.
- Breaking changes MUST NOT be released without a governance approval per V11.
- Sensitive fields MUST be classified per Chapter 25 (Data Classification).
- Lineage SHALL be captured for every transformation.

**Examples.**
- A `patient.registered` event carries `tenant_id`, `branch_id`, and a canonical `party_id`.
- The `invoice.line` dimension conforms to the enterprise `Money` type.
- The `appointment.no_show` fact links to `Party`, `Provider`, `Location`, and `Time` dimensions.

**Future Implementation Notes.** Reference the enterprise Canonical Data Model. Do not couple to vendor-specific storage semantics. Adopt open table formats where practical.

**Backward Compatibility Notes.** Additive only. Existing schemas, tables, RLS policies, and services continue to operate unchanged. No migration is prescribed.

**Security Notes.** Alignment with V10 Zero-Trust: least-privilege access to data planes, encryption at rest and in transit, and field-level classification enforced by policy.

**Performance Notes.** Sampling, partitioning, indexing, and materialization strategies SHOULD align with SLOs published in V12.

**Governance Notes.** Owned by the Enterprise Data Council under V11 ARB with domain-level stewards defined in Chapter 6 (Data Ownership).

**Extended Discussion.**
This chapter forms part of the ZMedico Enterprise Data Platform (EDP) architectural corpus.
It codifies the intent, boundaries, and interfaces of the concern without prescribing runtime
implementation. Where implementation is eventually undertaken, the Governance Workflow ratified
in V6 SHALL apply, and the architectural boundaries defined in V8, V9, V10, V11, and V12 SHALL
be respected. Nothing in this chapter changes application code, database schema, RLS policies,
SECURITY DEFINER functions, Edge Functions, generated types, tests, package manifests, or
infrastructure assets.

**Interfaces.**
- **To V8 Authorization.** All data access decisions remain authoritative under RLS and V8
  policies. This chapter MUST NOT be interpreted as altering those decisions.
- **To V9 Identity.** Principal identity, trust envelopes, and session semantics are owned by
  V9. This chapter consumes identity as a fact; it does not redefine it.
- **To V10 Security.** Encryption, key management, and sensitivity classification are governed
  by V10. This chapter aligns to those classifications without inventing new ones.
- **To V11 Governance.** All decisions arising from this chapter SHALL be routed through the
  ARB, ADR, and lifecycle mechanisms V11 defines.
- **To V12 Observability.** Data-plane telemetry (freshness, quality, lineage, throughput) is
  emitted through the observability signals V12 standardizes; V13 defines the semantics, V12
  defines the transport.

**Design Considerations.**
- Prefer *contract-first* design: producers publish schemas and semantics before any consumer
  couples to them.
- Prefer *open standards*: SQL, OpenAPI, AsyncAPI, JSON Schema, Avro, Parquet, Iceberg/Delta,
  OpenLineage, DCAT.
- Prefer *decentralized ownership with federated governance*: domain teams own products; a
  federated council owns policy.
- Prefer *bounded contexts*: cross-domain coupling flows through published contracts, not
  through shared physical tables.
- Prefer *evolvability*: schemas evolve with compatibility rules; consumers negotiate versions
  through the schema registry.

**Anti-Patterns to Avoid.**
- Shared mutable OLTP tables as an integration channel.
- Untyped, unversioned event payloads.
- Point-to-point pipelines with no lineage capture.
- Silent schema drift with no compatibility gate.
- Uncontrolled cross-tenant joins.

**Compliance Alignment.**
- **HIPAA**: Preserve minimum necessary access; PHI is handled per V10 classifications.
- **GDPR**: Preserve lawful basis and purpose limitation; enable subject rights.
- **ISO 27001**: Align to Annex A controls for information classification, cryptography, and
  supplier data handling.
- **NIST 800-53**: Align to AC, AU, SC, and SI family controls at the data plane.

**Operational Envelope.**
- Data SLAs SHALL be published per data product (freshness, completeness, availability).
- Quality signals SHALL be observable in V12 dashboards.
- Incidents affecting data products SHALL follow the incident management workflow ratified
  by V12 Chapter 47.

**Explicit Non-Goals.**
- This chapter does NOT define authorization semantics.
- This chapter does NOT define identity or session semantics.
- This chapter does NOT define encryption primitives or key custody.
- This chapter does NOT change any existing database object, RLS policy, or SECURITY DEFINER
  function.
- This chapter does NOT introduce or modify Edge Functions or React/TypeScript modules.

**Rollout Philosophy (When Implementation Is Later Approved).**
- Additive first: introduce new datasets, contracts, and pipelines alongside existing ones.
- Shadow before cutover: run new pipelines in parallel, compare with existing outputs.
- Fitness-gated promotion: only promote when quality, lineage, and SLO gates pass.
- Reversible by default: every change SHALL have a documented rollback per V11.


## Chapter 23 — Data Validation

**Purpose.** Enforce syntactic and semantic constraints on data at boundaries.

**Architecture.** Layered architecture composed of ingestion, storage, processing, governance, and consumption planes, aligned to the Enterprise Reference Architecture ratified in V11.

**ASCII Diagram.**
```text
[Producers] ─▶ [Contract] ─▶ [Pipeline] ─▶ [Storage] ─▶ [Serving] ─▶ [Consumers]
                     │                                     │
                     └────────── Governance / Lineage ─────┘
```

**Rules (RFC 2119).**
- Producers MUST publish schemas to the registry before emission.
- Consumers SHALL validate payloads against the registered schema.
- Breaking changes MUST NOT be released without a governance approval per V11.
- Sensitive fields MUST be classified per Chapter 25 (Data Classification).
- Lineage SHALL be captured for every transformation.

**Examples.**
- A `patient.registered` event carries `tenant_id`, `branch_id`, and a canonical `party_id`.
- The `invoice.line` dimension conforms to the enterprise `Money` type.
- The `appointment.no_show` fact links to `Party`, `Provider`, `Location`, and `Time` dimensions.

**Future Implementation Notes.** Reference the enterprise Canonical Data Model. Do not couple to vendor-specific storage semantics. Adopt open table formats where practical.

**Backward Compatibility Notes.** Additive only. Existing schemas, tables, RLS policies, and services continue to operate unchanged. No migration is prescribed.

**Security Notes.** Alignment with V10 Zero-Trust: least-privilege access to data planes, encryption at rest and in transit, and field-level classification enforced by policy.

**Performance Notes.** Sampling, partitioning, indexing, and materialization strategies SHOULD align with SLOs published in V12.

**Governance Notes.** Owned by the Enterprise Data Council under V11 ARB with domain-level stewards defined in Chapter 6 (Data Ownership).

**Extended Discussion.**
This chapter forms part of the ZMedico Enterprise Data Platform (EDP) architectural corpus.
It codifies the intent, boundaries, and interfaces of the concern without prescribing runtime
implementation. Where implementation is eventually undertaken, the Governance Workflow ratified
in V6 SHALL apply, and the architectural boundaries defined in V8, V9, V10, V11, and V12 SHALL
be respected. Nothing in this chapter changes application code, database schema, RLS policies,
SECURITY DEFINER functions, Edge Functions, generated types, tests, package manifests, or
infrastructure assets.

**Interfaces.**
- **To V8 Authorization.** All data access decisions remain authoritative under RLS and V8
  policies. This chapter MUST NOT be interpreted as altering those decisions.
- **To V9 Identity.** Principal identity, trust envelopes, and session semantics are owned by
  V9. This chapter consumes identity as a fact; it does not redefine it.
- **To V10 Security.** Encryption, key management, and sensitivity classification are governed
  by V10. This chapter aligns to those classifications without inventing new ones.
- **To V11 Governance.** All decisions arising from this chapter SHALL be routed through the
  ARB, ADR, and lifecycle mechanisms V11 defines.
- **To V12 Observability.** Data-plane telemetry (freshness, quality, lineage, throughput) is
  emitted through the observability signals V12 standardizes; V13 defines the semantics, V12
  defines the transport.

**Design Considerations.**
- Prefer *contract-first* design: producers publish schemas and semantics before any consumer
  couples to them.
- Prefer *open standards*: SQL, OpenAPI, AsyncAPI, JSON Schema, Avro, Parquet, Iceberg/Delta,
  OpenLineage, DCAT.
- Prefer *decentralized ownership with federated governance*: domain teams own products; a
  federated council owns policy.
- Prefer *bounded contexts*: cross-domain coupling flows through published contracts, not
  through shared physical tables.
- Prefer *evolvability*: schemas evolve with compatibility rules; consumers negotiate versions
  through the schema registry.

**Anti-Patterns to Avoid.**
- Shared mutable OLTP tables as an integration channel.
- Untyped, unversioned event payloads.
- Point-to-point pipelines with no lineage capture.
- Silent schema drift with no compatibility gate.
- Uncontrolled cross-tenant joins.

**Compliance Alignment.**
- **HIPAA**: Preserve minimum necessary access; PHI is handled per V10 classifications.
- **GDPR**: Preserve lawful basis and purpose limitation; enable subject rights.
- **ISO 27001**: Align to Annex A controls for information classification, cryptography, and
  supplier data handling.
- **NIST 800-53**: Align to AC, AU, SC, and SI family controls at the data plane.

**Operational Envelope.**
- Data SLAs SHALL be published per data product (freshness, completeness, availability).
- Quality signals SHALL be observable in V12 dashboards.
- Incidents affecting data products SHALL follow the incident management workflow ratified
  by V12 Chapter 47.

**Explicit Non-Goals.**
- This chapter does NOT define authorization semantics.
- This chapter does NOT define identity or session semantics.
- This chapter does NOT define encryption primitives or key custody.
- This chapter does NOT change any existing database object, RLS policy, or SECURITY DEFINER
  function.
- This chapter does NOT introduce or modify Edge Functions or React/TypeScript modules.

**Rollout Philosophy (When Implementation Is Later Approved).**
- Additive first: introduce new datasets, contracts, and pipelines alongside existing ones.
- Shadow before cutover: run new pipelines in parallel, compare with existing outputs.
- Fitness-gated promotion: only promote when quality, lineage, and SLO gates pass.
- Reversible by default: every change SHALL have a documented rollback per V11.


## Chapter 24 — Data Profiling

**Purpose.** Continuously characterize dataset shape, distribution, and drift.

**Architecture.** Layered architecture composed of ingestion, storage, processing, governance, and consumption planes, aligned to the Enterprise Reference Architecture ratified in V11.

**ASCII Diagram.**
```text
[Producers] ─▶ [Contract] ─▶ [Pipeline] ─▶ [Storage] ─▶ [Serving] ─▶ [Consumers]
                     │                                     │
                     └────────── Governance / Lineage ─────┘
```

**Rules (RFC 2119).**
- Producers MUST publish schemas to the registry before emission.
- Consumers SHALL validate payloads against the registered schema.
- Breaking changes MUST NOT be released without a governance approval per V11.
- Sensitive fields MUST be classified per Chapter 25 (Data Classification).
- Lineage SHALL be captured for every transformation.

**Examples.**
- A `patient.registered` event carries `tenant_id`, `branch_id`, and a canonical `party_id`.
- The `invoice.line` dimension conforms to the enterprise `Money` type.
- The `appointment.no_show` fact links to `Party`, `Provider`, `Location`, and `Time` dimensions.

**Future Implementation Notes.** Reference the enterprise Canonical Data Model. Do not couple to vendor-specific storage semantics. Adopt open table formats where practical.

**Backward Compatibility Notes.** Additive only. Existing schemas, tables, RLS policies, and services continue to operate unchanged. No migration is prescribed.

**Security Notes.** Alignment with V10 Zero-Trust: least-privilege access to data planes, encryption at rest and in transit, and field-level classification enforced by policy.

**Performance Notes.** Sampling, partitioning, indexing, and materialization strategies SHOULD align with SLOs published in V12.

**Governance Notes.** Owned by the Enterprise Data Council under V11 ARB with domain-level stewards defined in Chapter 6 (Data Ownership).

**Extended Discussion.**
This chapter forms part of the ZMedico Enterprise Data Platform (EDP) architectural corpus.
It codifies the intent, boundaries, and interfaces of the concern without prescribing runtime
implementation. Where implementation is eventually undertaken, the Governance Workflow ratified
in V6 SHALL apply, and the architectural boundaries defined in V8, V9, V10, V11, and V12 SHALL
be respected. Nothing in this chapter changes application code, database schema, RLS policies,
SECURITY DEFINER functions, Edge Functions, generated types, tests, package manifests, or
infrastructure assets.

**Interfaces.**
- **To V8 Authorization.** All data access decisions remain authoritative under RLS and V8
  policies. This chapter MUST NOT be interpreted as altering those decisions.
- **To V9 Identity.** Principal identity, trust envelopes, and session semantics are owned by
  V9. This chapter consumes identity as a fact; it does not redefine it.
- **To V10 Security.** Encryption, key management, and sensitivity classification are governed
  by V10. This chapter aligns to those classifications without inventing new ones.
- **To V11 Governance.** All decisions arising from this chapter SHALL be routed through the
  ARB, ADR, and lifecycle mechanisms V11 defines.
- **To V12 Observability.** Data-plane telemetry (freshness, quality, lineage, throughput) is
  emitted through the observability signals V12 standardizes; V13 defines the semantics, V12
  defines the transport.

**Design Considerations.**
- Prefer *contract-first* design: producers publish schemas and semantics before any consumer
  couples to them.
- Prefer *open standards*: SQL, OpenAPI, AsyncAPI, JSON Schema, Avro, Parquet, Iceberg/Delta,
  OpenLineage, DCAT.
- Prefer *decentralized ownership with federated governance*: domain teams own products; a
  federated council owns policy.
- Prefer *bounded contexts*: cross-domain coupling flows through published contracts, not
  through shared physical tables.
- Prefer *evolvability*: schemas evolve with compatibility rules; consumers negotiate versions
  through the schema registry.

**Anti-Patterns to Avoid.**
- Shared mutable OLTP tables as an integration channel.
- Untyped, unversioned event payloads.
- Point-to-point pipelines with no lineage capture.
- Silent schema drift with no compatibility gate.
- Uncontrolled cross-tenant joins.

**Compliance Alignment.**
- **HIPAA**: Preserve minimum necessary access; PHI is handled per V10 classifications.
- **GDPR**: Preserve lawful basis and purpose limitation; enable subject rights.
- **ISO 27001**: Align to Annex A controls for information classification, cryptography, and
  supplier data handling.
- **NIST 800-53**: Align to AC, AU, SC, and SI family controls at the data plane.

**Operational Envelope.**
- Data SLAs SHALL be published per data product (freshness, completeness, availability).
- Quality signals SHALL be observable in V12 dashboards.
- Incidents affecting data products SHALL follow the incident management workflow ratified
  by V12 Chapter 47.

**Explicit Non-Goals.**
- This chapter does NOT define authorization semantics.
- This chapter does NOT define identity or session semantics.
- This chapter does NOT define encryption primitives or key custody.
- This chapter does NOT change any existing database object, RLS policy, or SECURITY DEFINER
  function.
- This chapter does NOT introduce or modify Edge Functions or React/TypeScript modules.

**Rollout Philosophy (When Implementation Is Later Approved).**
- Additive first: introduce new datasets, contracts, and pipelines alongside existing ones.
- Shadow before cutover: run new pipelines in parallel, compare with existing outputs.
- Fitness-gated promotion: only promote when quality, lineage, and SLO gates pass.
- Reversible by default: every change SHALL have a documented rollback per V11.


## Chapter 25 — Data Classification

**Purpose.** Assign sensitivity classes to fields and datasets.

**Architecture.** Layered architecture composed of ingestion, storage, processing, governance, and consumption planes, aligned to the Enterprise Reference Architecture ratified in V11.

**ASCII Diagram.**
```text
[Producers] ─▶ [Contract] ─▶ [Pipeline] ─▶ [Storage] ─▶ [Serving] ─▶ [Consumers]
                     │                                     │
                     └────────── Governance / Lineage ─────┘
```

**Rules (RFC 2119).**
- Producers MUST publish schemas to the registry before emission.
- Consumers SHALL validate payloads against the registered schema.
- Breaking changes MUST NOT be released without a governance approval per V11.
- Sensitive fields MUST be classified per Chapter 25 (Data Classification).
- Lineage SHALL be captured for every transformation.

**Examples.**
- A `patient.registered` event carries `tenant_id`, `branch_id`, and a canonical `party_id`.
- The `invoice.line` dimension conforms to the enterprise `Money` type.
- The `appointment.no_show` fact links to `Party`, `Provider`, `Location`, and `Time` dimensions.

**Future Implementation Notes.** Reference the enterprise Canonical Data Model. Do not couple to vendor-specific storage semantics. Adopt open table formats where practical.

**Backward Compatibility Notes.** Additive only. Existing schemas, tables, RLS policies, and services continue to operate unchanged. No migration is prescribed.

**Security Notes.** Alignment with V10 Zero-Trust: least-privilege access to data planes, encryption at rest and in transit, and field-level classification enforced by policy.

**Performance Notes.** Sampling, partitioning, indexing, and materialization strategies SHOULD align with SLOs published in V12.

**Governance Notes.** Owned by the Enterprise Data Council under V11 ARB with domain-level stewards defined in Chapter 6 (Data Ownership).

**Extended Discussion.**
This chapter forms part of the ZMedico Enterprise Data Platform (EDP) architectural corpus.
It codifies the intent, boundaries, and interfaces of the concern without prescribing runtime
implementation. Where implementation is eventually undertaken, the Governance Workflow ratified
in V6 SHALL apply, and the architectural boundaries defined in V8, V9, V10, V11, and V12 SHALL
be respected. Nothing in this chapter changes application code, database schema, RLS policies,
SECURITY DEFINER functions, Edge Functions, generated types, tests, package manifests, or
infrastructure assets.

**Interfaces.**
- **To V8 Authorization.** All data access decisions remain authoritative under RLS and V8
  policies. This chapter MUST NOT be interpreted as altering those decisions.
- **To V9 Identity.** Principal identity, trust envelopes, and session semantics are owned by
  V9. This chapter consumes identity as a fact; it does not redefine it.
- **To V10 Security.** Encryption, key management, and sensitivity classification are governed
  by V10. This chapter aligns to those classifications without inventing new ones.
- **To V11 Governance.** All decisions arising from this chapter SHALL be routed through the
  ARB, ADR, and lifecycle mechanisms V11 defines.
- **To V12 Observability.** Data-plane telemetry (freshness, quality, lineage, throughput) is
  emitted through the observability signals V12 standardizes; V13 defines the semantics, V12
  defines the transport.

**Design Considerations.**
- Prefer *contract-first* design: producers publish schemas and semantics before any consumer
  couples to them.
- Prefer *open standards*: SQL, OpenAPI, AsyncAPI, JSON Schema, Avro, Parquet, Iceberg/Delta,
  OpenLineage, DCAT.
- Prefer *decentralized ownership with federated governance*: domain teams own products; a
  federated council owns policy.
- Prefer *bounded contexts*: cross-domain coupling flows through published contracts, not
  through shared physical tables.
- Prefer *evolvability*: schemas evolve with compatibility rules; consumers negotiate versions
  through the schema registry.

**Anti-Patterns to Avoid.**
- Shared mutable OLTP tables as an integration channel.
- Untyped, unversioned event payloads.
- Point-to-point pipelines with no lineage capture.
- Silent schema drift with no compatibility gate.
- Uncontrolled cross-tenant joins.

**Compliance Alignment.**
- **HIPAA**: Preserve minimum necessary access; PHI is handled per V10 classifications.
- **GDPR**: Preserve lawful basis and purpose limitation; enable subject rights.
- **ISO 27001**: Align to Annex A controls for information classification, cryptography, and
  supplier data handling.
- **NIST 800-53**: Align to AC, AU, SC, and SI family controls at the data plane.

**Operational Envelope.**
- Data SLAs SHALL be published per data product (freshness, completeness, availability).
- Quality signals SHALL be observable in V12 dashboards.
- Incidents affecting data products SHALL follow the incident management workflow ratified
  by V12 Chapter 47.

**Explicit Non-Goals.**
- This chapter does NOT define authorization semantics.
- This chapter does NOT define identity or session semantics.
- This chapter does NOT define encryption primitives or key custody.
- This chapter does NOT change any existing database object, RLS policy, or SECURITY DEFINER
  function.
- This chapter does NOT introduce or modify Edge Functions or React/TypeScript modules.

**Rollout Philosophy (When Implementation Is Later Approved).**
- Additive first: introduce new datasets, contracts, and pipelines alongside existing ones.
- Shadow before cutover: run new pipelines in parallel, compare with existing outputs.
- Fitness-gated promotion: only promote when quality, lineage, and SLO gates pass.
- Reversible by default: every change SHALL have a documented rollback per V11.


## Chapter 26 — PHI Classification

**Purpose.** Identify and handle Protected Health Information per HIPAA.

**Architecture.** Layered architecture composed of ingestion, storage, processing, governance, and consumption planes, aligned to the Enterprise Reference Architecture ratified in V11.

**ASCII Diagram.**
```text
[Producers] ─▶ [Contract] ─▶ [Pipeline] ─▶ [Storage] ─▶ [Serving] ─▶ [Consumers]
                     │                                     │
                     └────────── Governance / Lineage ─────┘
```

**Rules (RFC 2119).**
- Producers MUST publish schemas to the registry before emission.
- Consumers SHALL validate payloads against the registered schema.
- Breaking changes MUST NOT be released without a governance approval per V11.
- Sensitive fields MUST be classified per Chapter 25 (Data Classification).
- Lineage SHALL be captured for every transformation.

**Examples.**
- A `patient.registered` event carries `tenant_id`, `branch_id`, and a canonical `party_id`.
- The `invoice.line` dimension conforms to the enterprise `Money` type.
- The `appointment.no_show` fact links to `Party`, `Provider`, `Location`, and `Time` dimensions.

**Future Implementation Notes.** Reference the enterprise Canonical Data Model. Do not couple to vendor-specific storage semantics. Adopt open table formats where practical.

**Backward Compatibility Notes.** Additive only. Existing schemas, tables, RLS policies, and services continue to operate unchanged. No migration is prescribed.

**Security Notes.** Alignment with V10 Zero-Trust: least-privilege access to data planes, encryption at rest and in transit, and field-level classification enforced by policy.

**Performance Notes.** Sampling, partitioning, indexing, and materialization strategies SHOULD align with SLOs published in V12.

**Governance Notes.** Owned by the Enterprise Data Council under V11 ARB with domain-level stewards defined in Chapter 6 (Data Ownership).

**Extended Discussion.**
This chapter forms part of the ZMedico Enterprise Data Platform (EDP) architectural corpus.
It codifies the intent, boundaries, and interfaces of the concern without prescribing runtime
implementation. Where implementation is eventually undertaken, the Governance Workflow ratified
in V6 SHALL apply, and the architectural boundaries defined in V8, V9, V10, V11, and V12 SHALL
be respected. Nothing in this chapter changes application code, database schema, RLS policies,
SECURITY DEFINER functions, Edge Functions, generated types, tests, package manifests, or
infrastructure assets.

**Interfaces.**
- **To V8 Authorization.** All data access decisions remain authoritative under RLS and V8
  policies. This chapter MUST NOT be interpreted as altering those decisions.
- **To V9 Identity.** Principal identity, trust envelopes, and session semantics are owned by
  V9. This chapter consumes identity as a fact; it does not redefine it.
- **To V10 Security.** Encryption, key management, and sensitivity classification are governed
  by V10. This chapter aligns to those classifications without inventing new ones.
- **To V11 Governance.** All decisions arising from this chapter SHALL be routed through the
  ARB, ADR, and lifecycle mechanisms V11 defines.
- **To V12 Observability.** Data-plane telemetry (freshness, quality, lineage, throughput) is
  emitted through the observability signals V12 standardizes; V13 defines the semantics, V12
  defines the transport.

**Design Considerations.**
- Prefer *contract-first* design: producers publish schemas and semantics before any consumer
  couples to them.
- Prefer *open standards*: SQL, OpenAPI, AsyncAPI, JSON Schema, Avro, Parquet, Iceberg/Delta,
  OpenLineage, DCAT.
- Prefer *decentralized ownership with federated governance*: domain teams own products; a
  federated council owns policy.
- Prefer *bounded contexts*: cross-domain coupling flows through published contracts, not
  through shared physical tables.
- Prefer *evolvability*: schemas evolve with compatibility rules; consumers negotiate versions
  through the schema registry.

**Anti-Patterns to Avoid.**
- Shared mutable OLTP tables as an integration channel.
- Untyped, unversioned event payloads.
- Point-to-point pipelines with no lineage capture.
- Silent schema drift with no compatibility gate.
- Uncontrolled cross-tenant joins.

**Compliance Alignment.**
- **HIPAA**: Preserve minimum necessary access; PHI is handled per V10 classifications.
- **GDPR**: Preserve lawful basis and purpose limitation; enable subject rights.
- **ISO 27001**: Align to Annex A controls for information classification, cryptography, and
  supplier data handling.
- **NIST 800-53**: Align to AC, AU, SC, and SI family controls at the data plane.

**Operational Envelope.**
- Data SLAs SHALL be published per data product (freshness, completeness, availability).
- Quality signals SHALL be observable in V12 dashboards.
- Incidents affecting data products SHALL follow the incident management workflow ratified
  by V12 Chapter 47.

**Explicit Non-Goals.**
- This chapter does NOT define authorization semantics.
- This chapter does NOT define identity or session semantics.
- This chapter does NOT define encryption primitives or key custody.
- This chapter does NOT change any existing database object, RLS policy, or SECURITY DEFINER
  function.
- This chapter does NOT introduce or modify Edge Functions or React/TypeScript modules.

**Rollout Philosophy (When Implementation Is Later Approved).**
- Additive first: introduce new datasets, contracts, and pipelines alongside existing ones.
- Shadow before cutover: run new pipelines in parallel, compare with existing outputs.
- Fitness-gated promotion: only promote when quality, lineage, and SLO gates pass.
- Reversible by default: every change SHALL have a documented rollback per V11.


## Chapter 27 — PII Classification

**Purpose.** Identify and handle Personally Identifiable Information per GDPR.

**Architecture.** Layered architecture composed of ingestion, storage, processing, governance, and consumption planes, aligned to the Enterprise Reference Architecture ratified in V11.

**ASCII Diagram.**
```text
[Producers] ─▶ [Contract] ─▶ [Pipeline] ─▶ [Storage] ─▶ [Serving] ─▶ [Consumers]
                     │                                     │
                     └────────── Governance / Lineage ─────┘
```

**Rules (RFC 2119).**
- Producers MUST publish schemas to the registry before emission.
- Consumers SHALL validate payloads against the registered schema.
- Breaking changes MUST NOT be released without a governance approval per V11.
- Sensitive fields MUST be classified per Chapter 25 (Data Classification).
- Lineage SHALL be captured for every transformation.

**Examples.**
- A `patient.registered` event carries `tenant_id`, `branch_id`, and a canonical `party_id`.
- The `invoice.line` dimension conforms to the enterprise `Money` type.
- The `appointment.no_show` fact links to `Party`, `Provider`, `Location`, and `Time` dimensions.

**Future Implementation Notes.** Reference the enterprise Canonical Data Model. Do not couple to vendor-specific storage semantics. Adopt open table formats where practical.

**Backward Compatibility Notes.** Additive only. Existing schemas, tables, RLS policies, and services continue to operate unchanged. No migration is prescribed.

**Security Notes.** Alignment with V10 Zero-Trust: least-privilege access to data planes, encryption at rest and in transit, and field-level classification enforced by policy.

**Performance Notes.** Sampling, partitioning, indexing, and materialization strategies SHOULD align with SLOs published in V12.

**Governance Notes.** Owned by the Enterprise Data Council under V11 ARB with domain-level stewards defined in Chapter 6 (Data Ownership).

**Extended Discussion.**
This chapter forms part of the ZMedico Enterprise Data Platform (EDP) architectural corpus.
It codifies the intent, boundaries, and interfaces of the concern without prescribing runtime
implementation. Where implementation is eventually undertaken, the Governance Workflow ratified
in V6 SHALL apply, and the architectural boundaries defined in V8, V9, V10, V11, and V12 SHALL
be respected. Nothing in this chapter changes application code, database schema, RLS policies,
SECURITY DEFINER functions, Edge Functions, generated types, tests, package manifests, or
infrastructure assets.

**Interfaces.**
- **To V8 Authorization.** All data access decisions remain authoritative under RLS and V8
  policies. This chapter MUST NOT be interpreted as altering those decisions.
- **To V9 Identity.** Principal identity, trust envelopes, and session semantics are owned by
  V9. This chapter consumes identity as a fact; it does not redefine it.
- **To V10 Security.** Encryption, key management, and sensitivity classification are governed
  by V10. This chapter aligns to those classifications without inventing new ones.
- **To V11 Governance.** All decisions arising from this chapter SHALL be routed through the
  ARB, ADR, and lifecycle mechanisms V11 defines.
- **To V12 Observability.** Data-plane telemetry (freshness, quality, lineage, throughput) is
  emitted through the observability signals V12 standardizes; V13 defines the semantics, V12
  defines the transport.

**Design Considerations.**
- Prefer *contract-first* design: producers publish schemas and semantics before any consumer
  couples to them.
- Prefer *open standards*: SQL, OpenAPI, AsyncAPI, JSON Schema, Avro, Parquet, Iceberg/Delta,
  OpenLineage, DCAT.
- Prefer *decentralized ownership with federated governance*: domain teams own products; a
  federated council owns policy.
- Prefer *bounded contexts*: cross-domain coupling flows through published contracts, not
  through shared physical tables.
- Prefer *evolvability*: schemas evolve with compatibility rules; consumers negotiate versions
  through the schema registry.

**Anti-Patterns to Avoid.**
- Shared mutable OLTP tables as an integration channel.
- Untyped, unversioned event payloads.
- Point-to-point pipelines with no lineage capture.
- Silent schema drift with no compatibility gate.
- Uncontrolled cross-tenant joins.

**Compliance Alignment.**
- **HIPAA**: Preserve minimum necessary access; PHI is handled per V10 classifications.
- **GDPR**: Preserve lawful basis and purpose limitation; enable subject rights.
- **ISO 27001**: Align to Annex A controls for information classification, cryptography, and
  supplier data handling.
- **NIST 800-53**: Align to AC, AU, SC, and SI family controls at the data plane.

**Operational Envelope.**
- Data SLAs SHALL be published per data product (freshness, completeness, availability).
- Quality signals SHALL be observable in V12 dashboards.
- Incidents affecting data products SHALL follow the incident management workflow ratified
  by V12 Chapter 47.

**Explicit Non-Goals.**
- This chapter does NOT define authorization semantics.
- This chapter does NOT define identity or session semantics.
- This chapter does NOT define encryption primitives or key custody.
- This chapter does NOT change any existing database object, RLS policy, or SECURITY DEFINER
  function.
- This chapter does NOT introduce or modify Edge Functions or React/TypeScript modules.

**Rollout Philosophy (When Implementation Is Later Approved).**
- Additive first: introduce new datasets, contracts, and pipelines alongside existing ones.
- Shadow before cutover: run new pipelines in parallel, compare with existing outputs.
- Fitness-gated promotion: only promote when quality, lineage, and SLO gates pass.
- Reversible by default: every change SHALL have a documented rollback per V11.


## Chapter 28 — Data Retention

**Purpose.** Enforce time-bound lifecycles per class, jurisdiction, and legal hold.

**Architecture.** Layered architecture composed of ingestion, storage, processing, governance, and consumption planes, aligned to the Enterprise Reference Architecture ratified in V11.

**ASCII Diagram.**
```text
[Producers] ─▶ [Contract] ─▶ [Pipeline] ─▶ [Storage] ─▶ [Serving] ─▶ [Consumers]
                     │                                     │
                     └────────── Governance / Lineage ─────┘
```

**Rules (RFC 2119).**
- Producers MUST publish schemas to the registry before emission.
- Consumers SHALL validate payloads against the registered schema.
- Breaking changes MUST NOT be released without a governance approval per V11.
- Sensitive fields MUST be classified per Chapter 25 (Data Classification).
- Lineage SHALL be captured for every transformation.

**Examples.**
- A `patient.registered` event carries `tenant_id`, `branch_id`, and a canonical `party_id`.
- The `invoice.line` dimension conforms to the enterprise `Money` type.
- The `appointment.no_show` fact links to `Party`, `Provider`, `Location`, and `Time` dimensions.

**Future Implementation Notes.** Reference the enterprise Canonical Data Model. Do not couple to vendor-specific storage semantics. Adopt open table formats where practical.

**Backward Compatibility Notes.** Additive only. Existing schemas, tables, RLS policies, and services continue to operate unchanged. No migration is prescribed.

**Security Notes.** Alignment with V10 Zero-Trust: least-privilege access to data planes, encryption at rest and in transit, and field-level classification enforced by policy.

**Performance Notes.** Sampling, partitioning, indexing, and materialization strategies SHOULD align with SLOs published in V12.

**Governance Notes.** Owned by the Enterprise Data Council under V11 ARB with domain-level stewards defined in Chapter 6 (Data Ownership).

**Extended Discussion.**
This chapter forms part of the ZMedico Enterprise Data Platform (EDP) architectural corpus.
It codifies the intent, boundaries, and interfaces of the concern without prescribing runtime
implementation. Where implementation is eventually undertaken, the Governance Workflow ratified
in V6 SHALL apply, and the architectural boundaries defined in V8, V9, V10, V11, and V12 SHALL
be respected. Nothing in this chapter changes application code, database schema, RLS policies,
SECURITY DEFINER functions, Edge Functions, generated types, tests, package manifests, or
infrastructure assets.

**Interfaces.**
- **To V8 Authorization.** All data access decisions remain authoritative under RLS and V8
  policies. This chapter MUST NOT be interpreted as altering those decisions.
- **To V9 Identity.** Principal identity, trust envelopes, and session semantics are owned by
  V9. This chapter consumes identity as a fact; it does not redefine it.
- **To V10 Security.** Encryption, key management, and sensitivity classification are governed
  by V10. This chapter aligns to those classifications without inventing new ones.
- **To V11 Governance.** All decisions arising from this chapter SHALL be routed through the
  ARB, ADR, and lifecycle mechanisms V11 defines.
- **To V12 Observability.** Data-plane telemetry (freshness, quality, lineage, throughput) is
  emitted through the observability signals V12 standardizes; V13 defines the semantics, V12
  defines the transport.

**Design Considerations.**
- Prefer *contract-first* design: producers publish schemas and semantics before any consumer
  couples to them.
- Prefer *open standards*: SQL, OpenAPI, AsyncAPI, JSON Schema, Avro, Parquet, Iceberg/Delta,
  OpenLineage, DCAT.
- Prefer *decentralized ownership with federated governance*: domain teams own products; a
  federated council owns policy.
- Prefer *bounded contexts*: cross-domain coupling flows through published contracts, not
  through shared physical tables.
- Prefer *evolvability*: schemas evolve with compatibility rules; consumers negotiate versions
  through the schema registry.

**Anti-Patterns to Avoid.**
- Shared mutable OLTP tables as an integration channel.
- Untyped, unversioned event payloads.
- Point-to-point pipelines with no lineage capture.
- Silent schema drift with no compatibility gate.
- Uncontrolled cross-tenant joins.

**Compliance Alignment.**
- **HIPAA**: Preserve minimum necessary access; PHI is handled per V10 classifications.
- **GDPR**: Preserve lawful basis and purpose limitation; enable subject rights.
- **ISO 27001**: Align to Annex A controls for information classification, cryptography, and
  supplier data handling.
- **NIST 800-53**: Align to AC, AU, SC, and SI family controls at the data plane.

**Operational Envelope.**
- Data SLAs SHALL be published per data product (freshness, completeness, availability).
- Quality signals SHALL be observable in V12 dashboards.
- Incidents affecting data products SHALL follow the incident management workflow ratified
  by V12 Chapter 47.

**Explicit Non-Goals.**
- This chapter does NOT define authorization semantics.
- This chapter does NOT define identity or session semantics.
- This chapter does NOT define encryption primitives or key custody.
- This chapter does NOT change any existing database object, RLS policy, or SECURITY DEFINER
  function.
- This chapter does NOT introduce or modify Edge Functions or React/TypeScript modules.

**Rollout Philosophy (When Implementation Is Later Approved).**
- Additive first: introduce new datasets, contracts, and pipelines alongside existing ones.
- Shadow before cutover: run new pipelines in parallel, compare with existing outputs.
- Fitness-gated promotion: only promote when quality, lineage, and SLO gates pass.
- Reversible by default: every change SHALL have a documented rollback per V11.


## Chapter 29 — Data Lifecycle

**Purpose.** Govern data from creation to lawful destruction.

**Architecture.** Layered architecture composed of ingestion, storage, processing, governance, and consumption planes, aligned to the Enterprise Reference Architecture ratified in V11.

**ASCII Diagram.**
```text
[Producers] ─▶ [Contract] ─▶ [Pipeline] ─▶ [Storage] ─▶ [Serving] ─▶ [Consumers]
                     │                                     │
                     └────────── Governance / Lineage ─────┘
```

**Rules (RFC 2119).**
- Producers MUST publish schemas to the registry before emission.
- Consumers SHALL validate payloads against the registered schema.
- Breaking changes MUST NOT be released without a governance approval per V11.
- Sensitive fields MUST be classified per Chapter 25 (Data Classification).
- Lineage SHALL be captured for every transformation.

**Examples.**
- A `patient.registered` event carries `tenant_id`, `branch_id`, and a canonical `party_id`.
- The `invoice.line` dimension conforms to the enterprise `Money` type.
- The `appointment.no_show` fact links to `Party`, `Provider`, `Location`, and `Time` dimensions.

**Future Implementation Notes.** Reference the enterprise Canonical Data Model. Do not couple to vendor-specific storage semantics. Adopt open table formats where practical.

**Backward Compatibility Notes.** Additive only. Existing schemas, tables, RLS policies, and services continue to operate unchanged. No migration is prescribed.

**Security Notes.** Alignment with V10 Zero-Trust: least-privilege access to data planes, encryption at rest and in transit, and field-level classification enforced by policy.

**Performance Notes.** Sampling, partitioning, indexing, and materialization strategies SHOULD align with SLOs published in V12.

**Governance Notes.** Owned by the Enterprise Data Council under V11 ARB with domain-level stewards defined in Chapter 6 (Data Ownership).

**Extended Discussion.**
This chapter forms part of the ZMedico Enterprise Data Platform (EDP) architectural corpus.
It codifies the intent, boundaries, and interfaces of the concern without prescribing runtime
implementation. Where implementation is eventually undertaken, the Governance Workflow ratified
in V6 SHALL apply, and the architectural boundaries defined in V8, V9, V10, V11, and V12 SHALL
be respected. Nothing in this chapter changes application code, database schema, RLS policies,
SECURITY DEFINER functions, Edge Functions, generated types, tests, package manifests, or
infrastructure assets.

**Interfaces.**
- **To V8 Authorization.** All data access decisions remain authoritative under RLS and V8
  policies. This chapter MUST NOT be interpreted as altering those decisions.
- **To V9 Identity.** Principal identity, trust envelopes, and session semantics are owned by
  V9. This chapter consumes identity as a fact; it does not redefine it.
- **To V10 Security.** Encryption, key management, and sensitivity classification are governed
  by V10. This chapter aligns to those classifications without inventing new ones.
- **To V11 Governance.** All decisions arising from this chapter SHALL be routed through the
  ARB, ADR, and lifecycle mechanisms V11 defines.
- **To V12 Observability.** Data-plane telemetry (freshness, quality, lineage, throughput) is
  emitted through the observability signals V12 standardizes; V13 defines the semantics, V12
  defines the transport.

**Design Considerations.**
- Prefer *contract-first* design: producers publish schemas and semantics before any consumer
  couples to them.
- Prefer *open standards*: SQL, OpenAPI, AsyncAPI, JSON Schema, Avro, Parquet, Iceberg/Delta,
  OpenLineage, DCAT.
- Prefer *decentralized ownership with federated governance*: domain teams own products; a
  federated council owns policy.
- Prefer *bounded contexts*: cross-domain coupling flows through published contracts, not
  through shared physical tables.
- Prefer *evolvability*: schemas evolve with compatibility rules; consumers negotiate versions
  through the schema registry.

**Anti-Patterns to Avoid.**
- Shared mutable OLTP tables as an integration channel.
- Untyped, unversioned event payloads.
- Point-to-point pipelines with no lineage capture.
- Silent schema drift with no compatibility gate.
- Uncontrolled cross-tenant joins.

**Compliance Alignment.**
- **HIPAA**: Preserve minimum necessary access; PHI is handled per V10 classifications.
- **GDPR**: Preserve lawful basis and purpose limitation; enable subject rights.
- **ISO 27001**: Align to Annex A controls for information classification, cryptography, and
  supplier data handling.
- **NIST 800-53**: Align to AC, AU, SC, and SI family controls at the data plane.

**Operational Envelope.**
- Data SLAs SHALL be published per data product (freshness, completeness, availability).
- Quality signals SHALL be observable in V12 dashboards.
- Incidents affecting data products SHALL follow the incident management workflow ratified
  by V12 Chapter 47.

**Explicit Non-Goals.**
- This chapter does NOT define authorization semantics.
- This chapter does NOT define identity or session semantics.
- This chapter does NOT define encryption primitives or key custody.
- This chapter does NOT change any existing database object, RLS policy, or SECURITY DEFINER
  function.
- This chapter does NOT introduce or modify Edge Functions or React/TypeScript modules.

**Rollout Philosophy (When Implementation Is Later Approved).**
- Additive first: introduce new datasets, contracts, and pipelines alongside existing ones.
- Shadow before cutover: run new pipelines in parallel, compare with existing outputs.
- Fitness-gated promotion: only promote when quality, lineage, and SLO gates pass.
- Reversible by default: every change SHALL have a documented rollback per V11.


## Chapter 30 — Archiving Strategy

**Purpose.** Move cold data to durable, cost-efficient storage while preserving retrievability.

**Architecture.** Layered architecture composed of ingestion, storage, processing, governance, and consumption planes, aligned to the Enterprise Reference Architecture ratified in V11.

**ASCII Diagram.**
```text
[Producers] ─▶ [Contract] ─▶ [Pipeline] ─▶ [Storage] ─▶ [Serving] ─▶ [Consumers]
                     │                                     │
                     └────────── Governance / Lineage ─────┘
```

**Rules (RFC 2119).**
- Producers MUST publish schemas to the registry before emission.
- Consumers SHALL validate payloads against the registered schema.
- Breaking changes MUST NOT be released without a governance approval per V11.
- Sensitive fields MUST be classified per Chapter 25 (Data Classification).
- Lineage SHALL be captured for every transformation.

**Examples.**
- A `patient.registered` event carries `tenant_id`, `branch_id`, and a canonical `party_id`.
- The `invoice.line` dimension conforms to the enterprise `Money` type.
- The `appointment.no_show` fact links to `Party`, `Provider`, `Location`, and `Time` dimensions.

**Future Implementation Notes.** Reference the enterprise Canonical Data Model. Do not couple to vendor-specific storage semantics. Adopt open table formats where practical.

**Backward Compatibility Notes.** Additive only. Existing schemas, tables, RLS policies, and services continue to operate unchanged. No migration is prescribed.

**Security Notes.** Alignment with V10 Zero-Trust: least-privilege access to data planes, encryption at rest and in transit, and field-level classification enforced by policy.

**Performance Notes.** Sampling, partitioning, indexing, and materialization strategies SHOULD align with SLOs published in V12.

**Governance Notes.** Owned by the Enterprise Data Council under V11 ARB with domain-level stewards defined in Chapter 6 (Data Ownership).

**Extended Discussion.**
This chapter forms part of the ZMedico Enterprise Data Platform (EDP) architectural corpus.
It codifies the intent, boundaries, and interfaces of the concern without prescribing runtime
implementation. Where implementation is eventually undertaken, the Governance Workflow ratified
in V6 SHALL apply, and the architectural boundaries defined in V8, V9, V10, V11, and V12 SHALL
be respected. Nothing in this chapter changes application code, database schema, RLS policies,
SECURITY DEFINER functions, Edge Functions, generated types, tests, package manifests, or
infrastructure assets.

**Interfaces.**
- **To V8 Authorization.** All data access decisions remain authoritative under RLS and V8
  policies. This chapter MUST NOT be interpreted as altering those decisions.
- **To V9 Identity.** Principal identity, trust envelopes, and session semantics are owned by
  V9. This chapter consumes identity as a fact; it does not redefine it.
- **To V10 Security.** Encryption, key management, and sensitivity classification are governed
  by V10. This chapter aligns to those classifications without inventing new ones.
- **To V11 Governance.** All decisions arising from this chapter SHALL be routed through the
  ARB, ADR, and lifecycle mechanisms V11 defines.
- **To V12 Observability.** Data-plane telemetry (freshness, quality, lineage, throughput) is
  emitted through the observability signals V12 standardizes; V13 defines the semantics, V12
  defines the transport.

**Design Considerations.**
- Prefer *contract-first* design: producers publish schemas and semantics before any consumer
  couples to them.
- Prefer *open standards*: SQL, OpenAPI, AsyncAPI, JSON Schema, Avro, Parquet, Iceberg/Delta,
  OpenLineage, DCAT.
- Prefer *decentralized ownership with federated governance*: domain teams own products; a
  federated council owns policy.
- Prefer *bounded contexts*: cross-domain coupling flows through published contracts, not
  through shared physical tables.
- Prefer *evolvability*: schemas evolve with compatibility rules; consumers negotiate versions
  through the schema registry.

**Anti-Patterns to Avoid.**
- Shared mutable OLTP tables as an integration channel.
- Untyped, unversioned event payloads.
- Point-to-point pipelines with no lineage capture.
- Silent schema drift with no compatibility gate.
- Uncontrolled cross-tenant joins.

**Compliance Alignment.**
- **HIPAA**: Preserve minimum necessary access; PHI is handled per V10 classifications.
- **GDPR**: Preserve lawful basis and purpose limitation; enable subject rights.
- **ISO 27001**: Align to Annex A controls for information classification, cryptography, and
  supplier data handling.
- **NIST 800-53**: Align to AC, AU, SC, and SI family controls at the data plane.

**Operational Envelope.**
- Data SLAs SHALL be published per data product (freshness, completeness, availability).
- Quality signals SHALL be observable in V12 dashboards.
- Incidents affecting data products SHALL follow the incident management workflow ratified
  by V12 Chapter 47.

**Explicit Non-Goals.**
- This chapter does NOT define authorization semantics.
- This chapter does NOT define identity or session semantics.
- This chapter does NOT define encryption primitives or key custody.
- This chapter does NOT change any existing database object, RLS policy, or SECURITY DEFINER
  function.
- This chapter does NOT introduce or modify Edge Functions or React/TypeScript modules.

**Rollout Philosophy (When Implementation Is Later Approved).**
- Additive first: introduce new datasets, contracts, and pipelines alongside existing ones.
- Shadow before cutover: run new pipelines in parallel, compare with existing outputs.
- Fitness-gated promotion: only promote when quality, lineage, and SLO gates pass.
- Reversible by default: every change SHALL have a documented rollback per V11.


## Chapter 31 — Data Lake Architecture

**Purpose.** Provide schema-on-read storage for raw and refined data.

**Architecture.** Layered architecture composed of ingestion, storage, processing, governance, and consumption planes, aligned to the Enterprise Reference Architecture ratified in V11.

**ASCII Diagram.**
```text
[Producers] ─▶ [Contract] ─▶ [Pipeline] ─▶ [Storage] ─▶ [Serving] ─▶ [Consumers]
                     │                                     │
                     └────────── Governance / Lineage ─────┘
```

**Rules (RFC 2119).**
- Producers MUST publish schemas to the registry before emission.
- Consumers SHALL validate payloads against the registered schema.
- Breaking changes MUST NOT be released without a governance approval per V11.
- Sensitive fields MUST be classified per Chapter 25 (Data Classification).
- Lineage SHALL be captured for every transformation.

**Examples.**
- A `patient.registered` event carries `tenant_id`, `branch_id`, and a canonical `party_id`.
- The `invoice.line` dimension conforms to the enterprise `Money` type.
- The `appointment.no_show` fact links to `Party`, `Provider`, `Location`, and `Time` dimensions.

**Future Implementation Notes.** Reference the enterprise Canonical Data Model. Do not couple to vendor-specific storage semantics. Adopt open table formats where practical.

**Backward Compatibility Notes.** Additive only. Existing schemas, tables, RLS policies, and services continue to operate unchanged. No migration is prescribed.

**Security Notes.** Alignment with V10 Zero-Trust: least-privilege access to data planes, encryption at rest and in transit, and field-level classification enforced by policy.

**Performance Notes.** Sampling, partitioning, indexing, and materialization strategies SHOULD align with SLOs published in V12.

**Governance Notes.** Owned by the Enterprise Data Council under V11 ARB with domain-level stewards defined in Chapter 6 (Data Ownership).

**Extended Discussion.**
This chapter forms part of the ZMedico Enterprise Data Platform (EDP) architectural corpus.
It codifies the intent, boundaries, and interfaces of the concern without prescribing runtime
implementation. Where implementation is eventually undertaken, the Governance Workflow ratified
in V6 SHALL apply, and the architectural boundaries defined in V8, V9, V10, V11, and V12 SHALL
be respected. Nothing in this chapter changes application code, database schema, RLS policies,
SECURITY DEFINER functions, Edge Functions, generated types, tests, package manifests, or
infrastructure assets.

**Interfaces.**
- **To V8 Authorization.** All data access decisions remain authoritative under RLS and V8
  policies. This chapter MUST NOT be interpreted as altering those decisions.
- **To V9 Identity.** Principal identity, trust envelopes, and session semantics are owned by
  V9. This chapter consumes identity as a fact; it does not redefine it.
- **To V10 Security.** Encryption, key management, and sensitivity classification are governed
  by V10. This chapter aligns to those classifications without inventing new ones.
- **To V11 Governance.** All decisions arising from this chapter SHALL be routed through the
  ARB, ADR, and lifecycle mechanisms V11 defines.
- **To V12 Observability.** Data-plane telemetry (freshness, quality, lineage, throughput) is
  emitted through the observability signals V12 standardizes; V13 defines the semantics, V12
  defines the transport.

**Design Considerations.**
- Prefer *contract-first* design: producers publish schemas and semantics before any consumer
  couples to them.
- Prefer *open standards*: SQL, OpenAPI, AsyncAPI, JSON Schema, Avro, Parquet, Iceberg/Delta,
  OpenLineage, DCAT.
- Prefer *decentralized ownership with federated governance*: domain teams own products; a
  federated council owns policy.
- Prefer *bounded contexts*: cross-domain coupling flows through published contracts, not
  through shared physical tables.
- Prefer *evolvability*: schemas evolve with compatibility rules; consumers negotiate versions
  through the schema registry.

**Anti-Patterns to Avoid.**
- Shared mutable OLTP tables as an integration channel.
- Untyped, unversioned event payloads.
- Point-to-point pipelines with no lineage capture.
- Silent schema drift with no compatibility gate.
- Uncontrolled cross-tenant joins.

**Compliance Alignment.**
- **HIPAA**: Preserve minimum necessary access; PHI is handled per V10 classifications.
- **GDPR**: Preserve lawful basis and purpose limitation; enable subject rights.
- **ISO 27001**: Align to Annex A controls for information classification, cryptography, and
  supplier data handling.
- **NIST 800-53**: Align to AC, AU, SC, and SI family controls at the data plane.

**Operational Envelope.**
- Data SLAs SHALL be published per data product (freshness, completeness, availability).
- Quality signals SHALL be observable in V12 dashboards.
- Incidents affecting data products SHALL follow the incident management workflow ratified
  by V12 Chapter 47.

**Explicit Non-Goals.**
- This chapter does NOT define authorization semantics.
- This chapter does NOT define identity or session semantics.
- This chapter does NOT define encryption primitives or key custody.
- This chapter does NOT change any existing database object, RLS policy, or SECURITY DEFINER
  function.
- This chapter does NOT introduce or modify Edge Functions or React/TypeScript modules.

**Rollout Philosophy (When Implementation Is Later Approved).**
- Additive first: introduce new datasets, contracts, and pipelines alongside existing ones.
- Shadow before cutover: run new pipelines in parallel, compare with existing outputs.
- Fitness-gated promotion: only promote when quality, lineage, and SLO gates pass.
- Reversible by default: every change SHALL have a documented rollback per V11.


## Chapter 32 — Data Warehouse Architecture

**Purpose.** Provide schema-on-write storage optimized for analytics.

**Architecture.** Layered architecture composed of ingestion, storage, processing, governance, and consumption planes, aligned to the Enterprise Reference Architecture ratified in V11.

**ASCII Diagram.**
```text
[Producers] ─▶ [Contract] ─▶ [Pipeline] ─▶ [Storage] ─▶ [Serving] ─▶ [Consumers]
                     │                                     │
                     └────────── Governance / Lineage ─────┘
```

**Rules (RFC 2119).**
- Producers MUST publish schemas to the registry before emission.
- Consumers SHALL validate payloads against the registered schema.
- Breaking changes MUST NOT be released without a governance approval per V11.
- Sensitive fields MUST be classified per Chapter 25 (Data Classification).
- Lineage SHALL be captured for every transformation.

**Examples.**
- A `patient.registered` event carries `tenant_id`, `branch_id`, and a canonical `party_id`.
- The `invoice.line` dimension conforms to the enterprise `Money` type.
- The `appointment.no_show` fact links to `Party`, `Provider`, `Location`, and `Time` dimensions.

**Future Implementation Notes.** Reference the enterprise Canonical Data Model. Do not couple to vendor-specific storage semantics. Adopt open table formats where practical.

**Backward Compatibility Notes.** Additive only. Existing schemas, tables, RLS policies, and services continue to operate unchanged. No migration is prescribed.

**Security Notes.** Alignment with V10 Zero-Trust: least-privilege access to data planes, encryption at rest and in transit, and field-level classification enforced by policy.

**Performance Notes.** Sampling, partitioning, indexing, and materialization strategies SHOULD align with SLOs published in V12.

**Governance Notes.** Owned by the Enterprise Data Council under V11 ARB with domain-level stewards defined in Chapter 6 (Data Ownership).

**Extended Discussion.**
This chapter forms part of the ZMedico Enterprise Data Platform (EDP) architectural corpus.
It codifies the intent, boundaries, and interfaces of the concern without prescribing runtime
implementation. Where implementation is eventually undertaken, the Governance Workflow ratified
in V6 SHALL apply, and the architectural boundaries defined in V8, V9, V10, V11, and V12 SHALL
be respected. Nothing in this chapter changes application code, database schema, RLS policies,
SECURITY DEFINER functions, Edge Functions, generated types, tests, package manifests, or
infrastructure assets.

**Interfaces.**
- **To V8 Authorization.** All data access decisions remain authoritative under RLS and V8
  policies. This chapter MUST NOT be interpreted as altering those decisions.
- **To V9 Identity.** Principal identity, trust envelopes, and session semantics are owned by
  V9. This chapter consumes identity as a fact; it does not redefine it.
- **To V10 Security.** Encryption, key management, and sensitivity classification are governed
  by V10. This chapter aligns to those classifications without inventing new ones.
- **To V11 Governance.** All decisions arising from this chapter SHALL be routed through the
  ARB, ADR, and lifecycle mechanisms V11 defines.
- **To V12 Observability.** Data-plane telemetry (freshness, quality, lineage, throughput) is
  emitted through the observability signals V12 standardizes; V13 defines the semantics, V12
  defines the transport.

**Design Considerations.**
- Prefer *contract-first* design: producers publish schemas and semantics before any consumer
  couples to them.
- Prefer *open standards*: SQL, OpenAPI, AsyncAPI, JSON Schema, Avro, Parquet, Iceberg/Delta,
  OpenLineage, DCAT.
- Prefer *decentralized ownership with federated governance*: domain teams own products; a
  federated council owns policy.
- Prefer *bounded contexts*: cross-domain coupling flows through published contracts, not
  through shared physical tables.
- Prefer *evolvability*: schemas evolve with compatibility rules; consumers negotiate versions
  through the schema registry.

**Anti-Patterns to Avoid.**
- Shared mutable OLTP tables as an integration channel.
- Untyped, unversioned event payloads.
- Point-to-point pipelines with no lineage capture.
- Silent schema drift with no compatibility gate.
- Uncontrolled cross-tenant joins.

**Compliance Alignment.**
- **HIPAA**: Preserve minimum necessary access; PHI is handled per V10 classifications.
- **GDPR**: Preserve lawful basis and purpose limitation; enable subject rights.
- **ISO 27001**: Align to Annex A controls for information classification, cryptography, and
  supplier data handling.
- **NIST 800-53**: Align to AC, AU, SC, and SI family controls at the data plane.

**Operational Envelope.**
- Data SLAs SHALL be published per data product (freshness, completeness, availability).
- Quality signals SHALL be observable in V12 dashboards.
- Incidents affecting data products SHALL follow the incident management workflow ratified
  by V12 Chapter 47.

**Explicit Non-Goals.**
- This chapter does NOT define authorization semantics.
- This chapter does NOT define identity or session semantics.
- This chapter does NOT define encryption primitives or key custody.
- This chapter does NOT change any existing database object, RLS policy, or SECURITY DEFINER
  function.
- This chapter does NOT introduce or modify Edge Functions or React/TypeScript modules.

**Rollout Philosophy (When Implementation Is Later Approved).**
- Additive first: introduce new datasets, contracts, and pipelines alongside existing ones.
- Shadow before cutover: run new pipelines in parallel, compare with existing outputs.
- Fitness-gated promotion: only promote when quality, lineage, and SLO gates pass.
- Reversible by default: every change SHALL have a documented rollback per V11.


## Chapter 33 — Lakehouse Architecture

**Purpose.** Combine open table formats with ACID semantics on object storage.

**Architecture.** Layered architecture composed of ingestion, storage, processing, governance, and consumption planes, aligned to the Enterprise Reference Architecture ratified in V11.

**ASCII Diagram.**
```text
[Producers] ─▶ [Contract] ─▶ [Pipeline] ─▶ [Storage] ─▶ [Serving] ─▶ [Consumers]
                     │                                     │
                     └────────── Governance / Lineage ─────┘
```

**Rules (RFC 2119).**
- Producers MUST publish schemas to the registry before emission.
- Consumers SHALL validate payloads against the registered schema.
- Breaking changes MUST NOT be released without a governance approval per V11.
- Sensitive fields MUST be classified per Chapter 25 (Data Classification).
- Lineage SHALL be captured for every transformation.

**Examples.**
- A `patient.registered` event carries `tenant_id`, `branch_id`, and a canonical `party_id`.
- The `invoice.line` dimension conforms to the enterprise `Money` type.
- The `appointment.no_show` fact links to `Party`, `Provider`, `Location`, and `Time` dimensions.

**Future Implementation Notes.** Reference the enterprise Canonical Data Model. Do not couple to vendor-specific storage semantics. Adopt open table formats where practical.

**Backward Compatibility Notes.** Additive only. Existing schemas, tables, RLS policies, and services continue to operate unchanged. No migration is prescribed.

**Security Notes.** Alignment with V10 Zero-Trust: least-privilege access to data planes, encryption at rest and in transit, and field-level classification enforced by policy.

**Performance Notes.** Sampling, partitioning, indexing, and materialization strategies SHOULD align with SLOs published in V12.

**Governance Notes.** Owned by the Enterprise Data Council under V11 ARB with domain-level stewards defined in Chapter 6 (Data Ownership).

**Extended Discussion.**
This chapter forms part of the ZMedico Enterprise Data Platform (EDP) architectural corpus.
It codifies the intent, boundaries, and interfaces of the concern without prescribing runtime
implementation. Where implementation is eventually undertaken, the Governance Workflow ratified
in V6 SHALL apply, and the architectural boundaries defined in V8, V9, V10, V11, and V12 SHALL
be respected. Nothing in this chapter changes application code, database schema, RLS policies,
SECURITY DEFINER functions, Edge Functions, generated types, tests, package manifests, or
infrastructure assets.

**Interfaces.**
- **To V8 Authorization.** All data access decisions remain authoritative under RLS and V8
  policies. This chapter MUST NOT be interpreted as altering those decisions.
- **To V9 Identity.** Principal identity, trust envelopes, and session semantics are owned by
  V9. This chapter consumes identity as a fact; it does not redefine it.
- **To V10 Security.** Encryption, key management, and sensitivity classification are governed
  by V10. This chapter aligns to those classifications without inventing new ones.
- **To V11 Governance.** All decisions arising from this chapter SHALL be routed through the
  ARB, ADR, and lifecycle mechanisms V11 defines.
- **To V12 Observability.** Data-plane telemetry (freshness, quality, lineage, throughput) is
  emitted through the observability signals V12 standardizes; V13 defines the semantics, V12
  defines the transport.

**Design Considerations.**
- Prefer *contract-first* design: producers publish schemas and semantics before any consumer
  couples to them.
- Prefer *open standards*: SQL, OpenAPI, AsyncAPI, JSON Schema, Avro, Parquet, Iceberg/Delta,
  OpenLineage, DCAT.
- Prefer *decentralized ownership with federated governance*: domain teams own products; a
  federated council owns policy.
- Prefer *bounded contexts*: cross-domain coupling flows through published contracts, not
  through shared physical tables.
- Prefer *evolvability*: schemas evolve with compatibility rules; consumers negotiate versions
  through the schema registry.

**Anti-Patterns to Avoid.**
- Shared mutable OLTP tables as an integration channel.
- Untyped, unversioned event payloads.
- Point-to-point pipelines with no lineage capture.
- Silent schema drift with no compatibility gate.
- Uncontrolled cross-tenant joins.

**Compliance Alignment.**
- **HIPAA**: Preserve minimum necessary access; PHI is handled per V10 classifications.
- **GDPR**: Preserve lawful basis and purpose limitation; enable subject rights.
- **ISO 27001**: Align to Annex A controls for information classification, cryptography, and
  supplier data handling.
- **NIST 800-53**: Align to AC, AU, SC, and SI family controls at the data plane.

**Operational Envelope.**
- Data SLAs SHALL be published per data product (freshness, completeness, availability).
- Quality signals SHALL be observable in V12 dashboards.
- Incidents affecting data products SHALL follow the incident management workflow ratified
  by V12 Chapter 47.

**Explicit Non-Goals.**
- This chapter does NOT define authorization semantics.
- This chapter does NOT define identity or session semantics.
- This chapter does NOT define encryption primitives or key custody.
- This chapter does NOT change any existing database object, RLS policy, or SECURITY DEFINER
  function.
- This chapter does NOT introduce or modify Edge Functions or React/TypeScript modules.

**Rollout Philosophy (When Implementation Is Later Approved).**
- Additive first: introduce new datasets, contracts, and pipelines alongside existing ones.
- Shadow before cutover: run new pipelines in parallel, compare with existing outputs.
- Fitness-gated promotion: only promote when quality, lineage, and SLO gates pass.
- Reversible by default: every change SHALL have a documented rollback per V11.


## Chapter 34 — OLTP Design

**Purpose.** Optimize transactional workloads for concurrency, integrity, and latency.

**Architecture.** Layered architecture composed of ingestion, storage, processing, governance, and consumption planes, aligned to the Enterprise Reference Architecture ratified in V11.

**ASCII Diagram.**
```text
[Producers] ─▶ [Contract] ─▶ [Pipeline] ─▶ [Storage] ─▶ [Serving] ─▶ [Consumers]
                     │                                     │
                     └────────── Governance / Lineage ─────┘
```

**Rules (RFC 2119).**
- Producers MUST publish schemas to the registry before emission.
- Consumers SHALL validate payloads against the registered schema.
- Breaking changes MUST NOT be released without a governance approval per V11.
- Sensitive fields MUST be classified per Chapter 25 (Data Classification).
- Lineage SHALL be captured for every transformation.

**Examples.**
- A `patient.registered` event carries `tenant_id`, `branch_id`, and a canonical `party_id`.
- The `invoice.line` dimension conforms to the enterprise `Money` type.
- The `appointment.no_show` fact links to `Party`, `Provider`, `Location`, and `Time` dimensions.

**Future Implementation Notes.** Reference the enterprise Canonical Data Model. Do not couple to vendor-specific storage semantics. Adopt open table formats where practical.

**Backward Compatibility Notes.** Additive only. Existing schemas, tables, RLS policies, and services continue to operate unchanged. No migration is prescribed.

**Security Notes.** Alignment with V10 Zero-Trust: least-privilege access to data planes, encryption at rest and in transit, and field-level classification enforced by policy.

**Performance Notes.** Sampling, partitioning, indexing, and materialization strategies SHOULD align with SLOs published in V12.

**Governance Notes.** Owned by the Enterprise Data Council under V11 ARB with domain-level stewards defined in Chapter 6 (Data Ownership).

**Extended Discussion.**
This chapter forms part of the ZMedico Enterprise Data Platform (EDP) architectural corpus.
It codifies the intent, boundaries, and interfaces of the concern without prescribing runtime
implementation. Where implementation is eventually undertaken, the Governance Workflow ratified
in V6 SHALL apply, and the architectural boundaries defined in V8, V9, V10, V11, and V12 SHALL
be respected. Nothing in this chapter changes application code, database schema, RLS policies,
SECURITY DEFINER functions, Edge Functions, generated types, tests, package manifests, or
infrastructure assets.

**Interfaces.**
- **To V8 Authorization.** All data access decisions remain authoritative under RLS and V8
  policies. This chapter MUST NOT be interpreted as altering those decisions.
- **To V9 Identity.** Principal identity, trust envelopes, and session semantics are owned by
  V9. This chapter consumes identity as a fact; it does not redefine it.
- **To V10 Security.** Encryption, key management, and sensitivity classification are governed
  by V10. This chapter aligns to those classifications without inventing new ones.
- **To V11 Governance.** All decisions arising from this chapter SHALL be routed through the
  ARB, ADR, and lifecycle mechanisms V11 defines.
- **To V12 Observability.** Data-plane telemetry (freshness, quality, lineage, throughput) is
  emitted through the observability signals V12 standardizes; V13 defines the semantics, V12
  defines the transport.

**Design Considerations.**
- Prefer *contract-first* design: producers publish schemas and semantics before any consumer
  couples to them.
- Prefer *open standards*: SQL, OpenAPI, AsyncAPI, JSON Schema, Avro, Parquet, Iceberg/Delta,
  OpenLineage, DCAT.
- Prefer *decentralized ownership with federated governance*: domain teams own products; a
  federated council owns policy.
- Prefer *bounded contexts*: cross-domain coupling flows through published contracts, not
  through shared physical tables.
- Prefer *evolvability*: schemas evolve with compatibility rules; consumers negotiate versions
  through the schema registry.

**Anti-Patterns to Avoid.**
- Shared mutable OLTP tables as an integration channel.
- Untyped, unversioned event payloads.
- Point-to-point pipelines with no lineage capture.
- Silent schema drift with no compatibility gate.
- Uncontrolled cross-tenant joins.

**Compliance Alignment.**
- **HIPAA**: Preserve minimum necessary access; PHI is handled per V10 classifications.
- **GDPR**: Preserve lawful basis and purpose limitation; enable subject rights.
- **ISO 27001**: Align to Annex A controls for information classification, cryptography, and
  supplier data handling.
- **NIST 800-53**: Align to AC, AU, SC, and SI family controls at the data plane.

**Operational Envelope.**
- Data SLAs SHALL be published per data product (freshness, completeness, availability).
- Quality signals SHALL be observable in V12 dashboards.
- Incidents affecting data products SHALL follow the incident management workflow ratified
  by V12 Chapter 47.

**Explicit Non-Goals.**
- This chapter does NOT define authorization semantics.
- This chapter does NOT define identity or session semantics.
- This chapter does NOT define encryption primitives or key custody.
- This chapter does NOT change any existing database object, RLS policy, or SECURITY DEFINER
  function.
- This chapter does NOT introduce or modify Edge Functions or React/TypeScript modules.

**Rollout Philosophy (When Implementation Is Later Approved).**
- Additive first: introduce new datasets, contracts, and pipelines alongside existing ones.
- Shadow before cutover: run new pipelines in parallel, compare with existing outputs.
- Fitness-gated promotion: only promote when quality, lineage, and SLO gates pass.
- Reversible by default: every change SHALL have a documented rollback per V11.


## Chapter 35 — OLAP Design

**Purpose.** Optimize analytical workloads for aggregation and scan efficiency.

**Architecture.** Layered architecture composed of ingestion, storage, processing, governance, and consumption planes, aligned to the Enterprise Reference Architecture ratified in V11.

**ASCII Diagram.**
```text
[Producers] ─▶ [Contract] ─▶ [Pipeline] ─▶ [Storage] ─▶ [Serving] ─▶ [Consumers]
                     │                                     │
                     └────────── Governance / Lineage ─────┘
```

**Rules (RFC 2119).**
- Producers MUST publish schemas to the registry before emission.
- Consumers SHALL validate payloads against the registered schema.
- Breaking changes MUST NOT be released without a governance approval per V11.
- Sensitive fields MUST be classified per Chapter 25 (Data Classification).
- Lineage SHALL be captured for every transformation.

**Examples.**
- A `patient.registered` event carries `tenant_id`, `branch_id`, and a canonical `party_id`.
- The `invoice.line` dimension conforms to the enterprise `Money` type.
- The `appointment.no_show` fact links to `Party`, `Provider`, `Location`, and `Time` dimensions.

**Future Implementation Notes.** Reference the enterprise Canonical Data Model. Do not couple to vendor-specific storage semantics. Adopt open table formats where practical.

**Backward Compatibility Notes.** Additive only. Existing schemas, tables, RLS policies, and services continue to operate unchanged. No migration is prescribed.

**Security Notes.** Alignment with V10 Zero-Trust: least-privilege access to data planes, encryption at rest and in transit, and field-level classification enforced by policy.

**Performance Notes.** Sampling, partitioning, indexing, and materialization strategies SHOULD align with SLOs published in V12.

**Governance Notes.** Owned by the Enterprise Data Council under V11 ARB with domain-level stewards defined in Chapter 6 (Data Ownership).

**Extended Discussion.**
This chapter forms part of the ZMedico Enterprise Data Platform (EDP) architectural corpus.
It codifies the intent, boundaries, and interfaces of the concern without prescribing runtime
implementation. Where implementation is eventually undertaken, the Governance Workflow ratified
in V6 SHALL apply, and the architectural boundaries defined in V8, V9, V10, V11, and V12 SHALL
be respected. Nothing in this chapter changes application code, database schema, RLS policies,
SECURITY DEFINER functions, Edge Functions, generated types, tests, package manifests, or
infrastructure assets.

**Interfaces.**
- **To V8 Authorization.** All data access decisions remain authoritative under RLS and V8
  policies. This chapter MUST NOT be interpreted as altering those decisions.
- **To V9 Identity.** Principal identity, trust envelopes, and session semantics are owned by
  V9. This chapter consumes identity as a fact; it does not redefine it.
- **To V10 Security.** Encryption, key management, and sensitivity classification are governed
  by V10. This chapter aligns to those classifications without inventing new ones.
- **To V11 Governance.** All decisions arising from this chapter SHALL be routed through the
  ARB, ADR, and lifecycle mechanisms V11 defines.
- **To V12 Observability.** Data-plane telemetry (freshness, quality, lineage, throughput) is
  emitted through the observability signals V12 standardizes; V13 defines the semantics, V12
  defines the transport.

**Design Considerations.**
- Prefer *contract-first* design: producers publish schemas and semantics before any consumer
  couples to them.
- Prefer *open standards*: SQL, OpenAPI, AsyncAPI, JSON Schema, Avro, Parquet, Iceberg/Delta,
  OpenLineage, DCAT.
- Prefer *decentralized ownership with federated governance*: domain teams own products; a
  federated council owns policy.
- Prefer *bounded contexts*: cross-domain coupling flows through published contracts, not
  through shared physical tables.
- Prefer *evolvability*: schemas evolve with compatibility rules; consumers negotiate versions
  through the schema registry.

**Anti-Patterns to Avoid.**
- Shared mutable OLTP tables as an integration channel.
- Untyped, unversioned event payloads.
- Point-to-point pipelines with no lineage capture.
- Silent schema drift with no compatibility gate.
- Uncontrolled cross-tenant joins.

**Compliance Alignment.**
- **HIPAA**: Preserve minimum necessary access; PHI is handled per V10 classifications.
- **GDPR**: Preserve lawful basis and purpose limitation; enable subject rights.
- **ISO 27001**: Align to Annex A controls for information classification, cryptography, and
  supplier data handling.
- **NIST 800-53**: Align to AC, AU, SC, and SI family controls at the data plane.

**Operational Envelope.**
- Data SLAs SHALL be published per data product (freshness, completeness, availability).
- Quality signals SHALL be observable in V12 dashboards.
- Incidents affecting data products SHALL follow the incident management workflow ratified
  by V12 Chapter 47.

**Explicit Non-Goals.**
- This chapter does NOT define authorization semantics.
- This chapter does NOT define identity or session semantics.
- This chapter does NOT define encryption primitives or key custody.
- This chapter does NOT change any existing database object, RLS policy, or SECURITY DEFINER
  function.
- This chapter does NOT introduce or modify Edge Functions or React/TypeScript modules.

**Rollout Philosophy (When Implementation Is Later Approved).**
- Additive first: introduce new datasets, contracts, and pipelines alongside existing ones.
- Shadow before cutover: run new pipelines in parallel, compare with existing outputs.
- Fitness-gated promotion: only promote when quality, lineage, and SLO gates pass.
- Reversible by default: every change SHALL have a documented rollback per V11.


## Chapter 36 — ETL Pipelines

**Purpose.** Extract, transform, then load — for constrained warehouses.

**Architecture.** Layered architecture composed of ingestion, storage, processing, governance, and consumption planes, aligned to the Enterprise Reference Architecture ratified in V11.

**ASCII Diagram.**
```text
[Producers] ─▶ [Contract] ─▶ [Pipeline] ─▶ [Storage] ─▶ [Serving] ─▶ [Consumers]
                     │                                     │
                     └────────── Governance / Lineage ─────┘
```

**Rules (RFC 2119).**
- Producers MUST publish schemas to the registry before emission.
- Consumers SHALL validate payloads against the registered schema.
- Breaking changes MUST NOT be released without a governance approval per V11.
- Sensitive fields MUST be classified per Chapter 25 (Data Classification).
- Lineage SHALL be captured for every transformation.

**Examples.**
- A `patient.registered` event carries `tenant_id`, `branch_id`, and a canonical `party_id`.
- The `invoice.line` dimension conforms to the enterprise `Money` type.
- The `appointment.no_show` fact links to `Party`, `Provider`, `Location`, and `Time` dimensions.

**Future Implementation Notes.** Reference the enterprise Canonical Data Model. Do not couple to vendor-specific storage semantics. Adopt open table formats where practical.

**Backward Compatibility Notes.** Additive only. Existing schemas, tables, RLS policies, and services continue to operate unchanged. No migration is prescribed.

**Security Notes.** Alignment with V10 Zero-Trust: least-privilege access to data planes, encryption at rest and in transit, and field-level classification enforced by policy.

**Performance Notes.** Sampling, partitioning, indexing, and materialization strategies SHOULD align with SLOs published in V12.

**Governance Notes.** Owned by the Enterprise Data Council under V11 ARB with domain-level stewards defined in Chapter 6 (Data Ownership).

**Extended Discussion.**
This chapter forms part of the ZMedico Enterprise Data Platform (EDP) architectural corpus.
It codifies the intent, boundaries, and interfaces of the concern without prescribing runtime
implementation. Where implementation is eventually undertaken, the Governance Workflow ratified
in V6 SHALL apply, and the architectural boundaries defined in V8, V9, V10, V11, and V12 SHALL
be respected. Nothing in this chapter changes application code, database schema, RLS policies,
SECURITY DEFINER functions, Edge Functions, generated types, tests, package manifests, or
infrastructure assets.

**Interfaces.**
- **To V8 Authorization.** All data access decisions remain authoritative under RLS and V8
  policies. This chapter MUST NOT be interpreted as altering those decisions.
- **To V9 Identity.** Principal identity, trust envelopes, and session semantics are owned by
  V9. This chapter consumes identity as a fact; it does not redefine it.
- **To V10 Security.** Encryption, key management, and sensitivity classification are governed
  by V10. This chapter aligns to those classifications without inventing new ones.
- **To V11 Governance.** All decisions arising from this chapter SHALL be routed through the
  ARB, ADR, and lifecycle mechanisms V11 defines.
- **To V12 Observability.** Data-plane telemetry (freshness, quality, lineage, throughput) is
  emitted through the observability signals V12 standardizes; V13 defines the semantics, V12
  defines the transport.

**Design Considerations.**
- Prefer *contract-first* design: producers publish schemas and semantics before any consumer
  couples to them.
- Prefer *open standards*: SQL, OpenAPI, AsyncAPI, JSON Schema, Avro, Parquet, Iceberg/Delta,
  OpenLineage, DCAT.
- Prefer *decentralized ownership with federated governance*: domain teams own products; a
  federated council owns policy.
- Prefer *bounded contexts*: cross-domain coupling flows through published contracts, not
  through shared physical tables.
- Prefer *evolvability*: schemas evolve with compatibility rules; consumers negotiate versions
  through the schema registry.

**Anti-Patterns to Avoid.**
- Shared mutable OLTP tables as an integration channel.
- Untyped, unversioned event payloads.
- Point-to-point pipelines with no lineage capture.
- Silent schema drift with no compatibility gate.
- Uncontrolled cross-tenant joins.

**Compliance Alignment.**
- **HIPAA**: Preserve minimum necessary access; PHI is handled per V10 classifications.
- **GDPR**: Preserve lawful basis and purpose limitation; enable subject rights.
- **ISO 27001**: Align to Annex A controls for information classification, cryptography, and
  supplier data handling.
- **NIST 800-53**: Align to AC, AU, SC, and SI family controls at the data plane.

**Operational Envelope.**
- Data SLAs SHALL be published per data product (freshness, completeness, availability).
- Quality signals SHALL be observable in V12 dashboards.
- Incidents affecting data products SHALL follow the incident management workflow ratified
  by V12 Chapter 47.

**Explicit Non-Goals.**
- This chapter does NOT define authorization semantics.
- This chapter does NOT define identity or session semantics.
- This chapter does NOT define encryption primitives or key custody.
- This chapter does NOT change any existing database object, RLS policy, or SECURITY DEFINER
  function.
- This chapter does NOT introduce or modify Edge Functions or React/TypeScript modules.

**Rollout Philosophy (When Implementation Is Later Approved).**
- Additive first: introduce new datasets, contracts, and pipelines alongside existing ones.
- Shadow before cutover: run new pipelines in parallel, compare with existing outputs.
- Fitness-gated promotion: only promote when quality, lineage, and SLO gates pass.
- Reversible by default: every change SHALL have a documented rollback per V11.


## Chapter 37 — ELT Pipelines

**Purpose.** Extract, load, then transform — for elastic lakehouses.

**Architecture.** Layered architecture composed of ingestion, storage, processing, governance, and consumption planes, aligned to the Enterprise Reference Architecture ratified in V11.

**ASCII Diagram.**
```text
[Producers] ─▶ [Contract] ─▶ [Pipeline] ─▶ [Storage] ─▶ [Serving] ─▶ [Consumers]
                     │                                     │
                     └────────── Governance / Lineage ─────┘
```

**Rules (RFC 2119).**
- Producers MUST publish schemas to the registry before emission.
- Consumers SHALL validate payloads against the registered schema.
- Breaking changes MUST NOT be released without a governance approval per V11.
- Sensitive fields MUST be classified per Chapter 25 (Data Classification).
- Lineage SHALL be captured for every transformation.

**Examples.**
- A `patient.registered` event carries `tenant_id`, `branch_id`, and a canonical `party_id`.
- The `invoice.line` dimension conforms to the enterprise `Money` type.
- The `appointment.no_show` fact links to `Party`, `Provider`, `Location`, and `Time` dimensions.

**Future Implementation Notes.** Reference the enterprise Canonical Data Model. Do not couple to vendor-specific storage semantics. Adopt open table formats where practical.

**Backward Compatibility Notes.** Additive only. Existing schemas, tables, RLS policies, and services continue to operate unchanged. No migration is prescribed.

**Security Notes.** Alignment with V10 Zero-Trust: least-privilege access to data planes, encryption at rest and in transit, and field-level classification enforced by policy.

**Performance Notes.** Sampling, partitioning, indexing, and materialization strategies SHOULD align with SLOs published in V12.

**Governance Notes.** Owned by the Enterprise Data Council under V11 ARB with domain-level stewards defined in Chapter 6 (Data Ownership).

**Extended Discussion.**
This chapter forms part of the ZMedico Enterprise Data Platform (EDP) architectural corpus.
It codifies the intent, boundaries, and interfaces of the concern without prescribing runtime
implementation. Where implementation is eventually undertaken, the Governance Workflow ratified
in V6 SHALL apply, and the architectural boundaries defined in V8, V9, V10, V11, and V12 SHALL
be respected. Nothing in this chapter changes application code, database schema, RLS policies,
SECURITY DEFINER functions, Edge Functions, generated types, tests, package manifests, or
infrastructure assets.

**Interfaces.**
- **To V8 Authorization.** All data access decisions remain authoritative under RLS and V8
  policies. This chapter MUST NOT be interpreted as altering those decisions.
- **To V9 Identity.** Principal identity, trust envelopes, and session semantics are owned by
  V9. This chapter consumes identity as a fact; it does not redefine it.
- **To V10 Security.** Encryption, key management, and sensitivity classification are governed
  by V10. This chapter aligns to those classifications without inventing new ones.
- **To V11 Governance.** All decisions arising from this chapter SHALL be routed through the
  ARB, ADR, and lifecycle mechanisms V11 defines.
- **To V12 Observability.** Data-plane telemetry (freshness, quality, lineage, throughput) is
  emitted through the observability signals V12 standardizes; V13 defines the semantics, V12
  defines the transport.

**Design Considerations.**
- Prefer *contract-first* design: producers publish schemas and semantics before any consumer
  couples to them.
- Prefer *open standards*: SQL, OpenAPI, AsyncAPI, JSON Schema, Avro, Parquet, Iceberg/Delta,
  OpenLineage, DCAT.
- Prefer *decentralized ownership with federated governance*: domain teams own products; a
  federated council owns policy.
- Prefer *bounded contexts*: cross-domain coupling flows through published contracts, not
  through shared physical tables.
- Prefer *evolvability*: schemas evolve with compatibility rules; consumers negotiate versions
  through the schema registry.

**Anti-Patterns to Avoid.**
- Shared mutable OLTP tables as an integration channel.
- Untyped, unversioned event payloads.
- Point-to-point pipelines with no lineage capture.
- Silent schema drift with no compatibility gate.
- Uncontrolled cross-tenant joins.

**Compliance Alignment.**
- **HIPAA**: Preserve minimum necessary access; PHI is handled per V10 classifications.
- **GDPR**: Preserve lawful basis and purpose limitation; enable subject rights.
- **ISO 27001**: Align to Annex A controls for information classification, cryptography, and
  supplier data handling.
- **NIST 800-53**: Align to AC, AU, SC, and SI family controls at the data plane.

**Operational Envelope.**
- Data SLAs SHALL be published per data product (freshness, completeness, availability).
- Quality signals SHALL be observable in V12 dashboards.
- Incidents affecting data products SHALL follow the incident management workflow ratified
  by V12 Chapter 47.

**Explicit Non-Goals.**
- This chapter does NOT define authorization semantics.
- This chapter does NOT define identity or session semantics.
- This chapter does NOT define encryption primitives or key custody.
- This chapter does NOT change any existing database object, RLS policy, or SECURITY DEFINER
  function.
- This chapter does NOT introduce or modify Edge Functions or React/TypeScript modules.

**Rollout Philosophy (When Implementation Is Later Approved).**
- Additive first: introduce new datasets, contracts, and pipelines alongside existing ones.
- Shadow before cutover: run new pipelines in parallel, compare with existing outputs.
- Fitness-gated promotion: only promote when quality, lineage, and SLO gates pass.
- Reversible by default: every change SHALL have a documented rollback per V11.


## Chapter 38 — Change Data Capture (CDC)

**Purpose.** Stream row-level changes from OLTP systems to downstream consumers.

**Architecture.** Layered architecture composed of ingestion, storage, processing, governance, and consumption planes, aligned to the Enterprise Reference Architecture ratified in V11.

**ASCII Diagram.**
```text
[Producers] ─▶ [Contract] ─▶ [Pipeline] ─▶ [Storage] ─▶ [Serving] ─▶ [Consumers]
                     │                                     │
                     └────────── Governance / Lineage ─────┘
```

**Rules (RFC 2119).**
- Producers MUST publish schemas to the registry before emission.
- Consumers SHALL validate payloads against the registered schema.
- Breaking changes MUST NOT be released without a governance approval per V11.
- Sensitive fields MUST be classified per Chapter 25 (Data Classification).
- Lineage SHALL be captured for every transformation.

**Examples.**
- A `patient.registered` event carries `tenant_id`, `branch_id`, and a canonical `party_id`.
- The `invoice.line` dimension conforms to the enterprise `Money` type.
- The `appointment.no_show` fact links to `Party`, `Provider`, `Location`, and `Time` dimensions.

**Future Implementation Notes.** Reference the enterprise Canonical Data Model. Do not couple to vendor-specific storage semantics. Adopt open table formats where practical.

**Backward Compatibility Notes.** Additive only. Existing schemas, tables, RLS policies, and services continue to operate unchanged. No migration is prescribed.

**Security Notes.** Alignment with V10 Zero-Trust: least-privilege access to data planes, encryption at rest and in transit, and field-level classification enforced by policy.

**Performance Notes.** Sampling, partitioning, indexing, and materialization strategies SHOULD align with SLOs published in V12.

**Governance Notes.** Owned by the Enterprise Data Council under V11 ARB with domain-level stewards defined in Chapter 6 (Data Ownership).

**Extended Discussion.**
This chapter forms part of the ZMedico Enterprise Data Platform (EDP) architectural corpus.
It codifies the intent, boundaries, and interfaces of the concern without prescribing runtime
implementation. Where implementation is eventually undertaken, the Governance Workflow ratified
in V6 SHALL apply, and the architectural boundaries defined in V8, V9, V10, V11, and V12 SHALL
be respected. Nothing in this chapter changes application code, database schema, RLS policies,
SECURITY DEFINER functions, Edge Functions, generated types, tests, package manifests, or
infrastructure assets.

**Interfaces.**
- **To V8 Authorization.** All data access decisions remain authoritative under RLS and V8
  policies. This chapter MUST NOT be interpreted as altering those decisions.
- **To V9 Identity.** Principal identity, trust envelopes, and session semantics are owned by
  V9. This chapter consumes identity as a fact; it does not redefine it.
- **To V10 Security.** Encryption, key management, and sensitivity classification are governed
  by V10. This chapter aligns to those classifications without inventing new ones.
- **To V11 Governance.** All decisions arising from this chapter SHALL be routed through the
  ARB, ADR, and lifecycle mechanisms V11 defines.
- **To V12 Observability.** Data-plane telemetry (freshness, quality, lineage, throughput) is
  emitted through the observability signals V12 standardizes; V13 defines the semantics, V12
  defines the transport.

**Design Considerations.**
- Prefer *contract-first* design: producers publish schemas and semantics before any consumer
  couples to them.
- Prefer *open standards*: SQL, OpenAPI, AsyncAPI, JSON Schema, Avro, Parquet, Iceberg/Delta,
  OpenLineage, DCAT.
- Prefer *decentralized ownership with federated governance*: domain teams own products; a
  federated council owns policy.
- Prefer *bounded contexts*: cross-domain coupling flows through published contracts, not
  through shared physical tables.
- Prefer *evolvability*: schemas evolve with compatibility rules; consumers negotiate versions
  through the schema registry.

**Anti-Patterns to Avoid.**
- Shared mutable OLTP tables as an integration channel.
- Untyped, unversioned event payloads.
- Point-to-point pipelines with no lineage capture.
- Silent schema drift with no compatibility gate.
- Uncontrolled cross-tenant joins.

**Compliance Alignment.**
- **HIPAA**: Preserve minimum necessary access; PHI is handled per V10 classifications.
- **GDPR**: Preserve lawful basis and purpose limitation; enable subject rights.
- **ISO 27001**: Align to Annex A controls for information classification, cryptography, and
  supplier data handling.
- **NIST 800-53**: Align to AC, AU, SC, and SI family controls at the data plane.

**Operational Envelope.**
- Data SLAs SHALL be published per data product (freshness, completeness, availability).
- Quality signals SHALL be observable in V12 dashboards.
- Incidents affecting data products SHALL follow the incident management workflow ratified
  by V12 Chapter 47.

**Explicit Non-Goals.**
- This chapter does NOT define authorization semantics.
- This chapter does NOT define identity or session semantics.
- This chapter does NOT define encryption primitives or key custody.
- This chapter does NOT change any existing database object, RLS policy, or SECURITY DEFINER
  function.
- This chapter does NOT introduce or modify Edge Functions or React/TypeScript modules.

**Rollout Philosophy (When Implementation Is Later Approved).**
- Additive first: introduce new datasets, contracts, and pipelines alongside existing ones.
- Shadow before cutover: run new pipelines in parallel, compare with existing outputs.
- Fitness-gated promotion: only promote when quality, lineage, and SLO gates pass.
- Reversible by default: every change SHALL have a documented rollback per V11.


## Chapter 39 — Streaming Architecture

**Purpose.** Process events in near-real-time with exactly-once semantics where possible.

**Architecture.** Layered architecture composed of ingestion, storage, processing, governance, and consumption planes, aligned to the Enterprise Reference Architecture ratified in V11.

**ASCII Diagram.**
```text
[Producers] ─▶ [Contract] ─▶ [Pipeline] ─▶ [Storage] ─▶ [Serving] ─▶ [Consumers]
                     │                                     │
                     └────────── Governance / Lineage ─────┘
```

**Rules (RFC 2119).**
- Producers MUST publish schemas to the registry before emission.
- Consumers SHALL validate payloads against the registered schema.
- Breaking changes MUST NOT be released without a governance approval per V11.
- Sensitive fields MUST be classified per Chapter 25 (Data Classification).
- Lineage SHALL be captured for every transformation.

**Examples.**
- A `patient.registered` event carries `tenant_id`, `branch_id`, and a canonical `party_id`.
- The `invoice.line` dimension conforms to the enterprise `Money` type.
- The `appointment.no_show` fact links to `Party`, `Provider`, `Location`, and `Time` dimensions.

**Future Implementation Notes.** Reference the enterprise Canonical Data Model. Do not couple to vendor-specific storage semantics. Adopt open table formats where practical.

**Backward Compatibility Notes.** Additive only. Existing schemas, tables, RLS policies, and services continue to operate unchanged. No migration is prescribed.

**Security Notes.** Alignment with V10 Zero-Trust: least-privilege access to data planes, encryption at rest and in transit, and field-level classification enforced by policy.

**Performance Notes.** Sampling, partitioning, indexing, and materialization strategies SHOULD align with SLOs published in V12.

**Governance Notes.** Owned by the Enterprise Data Council under V11 ARB with domain-level stewards defined in Chapter 6 (Data Ownership).

**Extended Discussion.**
This chapter forms part of the ZMedico Enterprise Data Platform (EDP) architectural corpus.
It codifies the intent, boundaries, and interfaces of the concern without prescribing runtime
implementation. Where implementation is eventually undertaken, the Governance Workflow ratified
in V6 SHALL apply, and the architectural boundaries defined in V8, V9, V10, V11, and V12 SHALL
be respected. Nothing in this chapter changes application code, database schema, RLS policies,
SECURITY DEFINER functions, Edge Functions, generated types, tests, package manifests, or
infrastructure assets.

**Interfaces.**
- **To V8 Authorization.** All data access decisions remain authoritative under RLS and V8
  policies. This chapter MUST NOT be interpreted as altering those decisions.
- **To V9 Identity.** Principal identity, trust envelopes, and session semantics are owned by
  V9. This chapter consumes identity as a fact; it does not redefine it.
- **To V10 Security.** Encryption, key management, and sensitivity classification are governed
  by V10. This chapter aligns to those classifications without inventing new ones.
- **To V11 Governance.** All decisions arising from this chapter SHALL be routed through the
  ARB, ADR, and lifecycle mechanisms V11 defines.
- **To V12 Observability.** Data-plane telemetry (freshness, quality, lineage, throughput) is
  emitted through the observability signals V12 standardizes; V13 defines the semantics, V12
  defines the transport.

**Design Considerations.**
- Prefer *contract-first* design: producers publish schemas and semantics before any consumer
  couples to them.
- Prefer *open standards*: SQL, OpenAPI, AsyncAPI, JSON Schema, Avro, Parquet, Iceberg/Delta,
  OpenLineage, DCAT.
- Prefer *decentralized ownership with federated governance*: domain teams own products; a
  federated council owns policy.
- Prefer *bounded contexts*: cross-domain coupling flows through published contracts, not
  through shared physical tables.
- Prefer *evolvability*: schemas evolve with compatibility rules; consumers negotiate versions
  through the schema registry.

**Anti-Patterns to Avoid.**
- Shared mutable OLTP tables as an integration channel.
- Untyped, unversioned event payloads.
- Point-to-point pipelines with no lineage capture.
- Silent schema drift with no compatibility gate.
- Uncontrolled cross-tenant joins.

**Compliance Alignment.**
- **HIPAA**: Preserve minimum necessary access; PHI is handled per V10 classifications.
- **GDPR**: Preserve lawful basis and purpose limitation; enable subject rights.
- **ISO 27001**: Align to Annex A controls for information classification, cryptography, and
  supplier data handling.
- **NIST 800-53**: Align to AC, AU, SC, and SI family controls at the data plane.

**Operational Envelope.**
- Data SLAs SHALL be published per data product (freshness, completeness, availability).
- Quality signals SHALL be observable in V12 dashboards.
- Incidents affecting data products SHALL follow the incident management workflow ratified
  by V12 Chapter 47.

**Explicit Non-Goals.**
- This chapter does NOT define authorization semantics.
- This chapter does NOT define identity or session semantics.
- This chapter does NOT define encryption primitives or key custody.
- This chapter does NOT change any existing database object, RLS policy, or SECURITY DEFINER
  function.
- This chapter does NOT introduce or modify Edge Functions or React/TypeScript modules.

**Rollout Philosophy (When Implementation Is Later Approved).**
- Additive first: introduce new datasets, contracts, and pipelines alongside existing ones.
- Shadow before cutover: run new pipelines in parallel, compare with existing outputs.
- Fitness-gated promotion: only promote when quality, lineage, and SLO gates pass.
- Reversible by default: every change SHALL have a documented rollback per V11.


## Chapter 40 — Batch Processing

**Purpose.** Process bounded datasets on schedule for high throughput.

**Architecture.** Layered architecture composed of ingestion, storage, processing, governance, and consumption planes, aligned to the Enterprise Reference Architecture ratified in V11.

**ASCII Diagram.**
```text
[Producers] ─▶ [Contract] ─▶ [Pipeline] ─▶ [Storage] ─▶ [Serving] ─▶ [Consumers]
                     │                                     │
                     └────────── Governance / Lineage ─────┘
```

**Rules (RFC 2119).**
- Producers MUST publish schemas to the registry before emission.
- Consumers SHALL validate payloads against the registered schema.
- Breaking changes MUST NOT be released without a governance approval per V11.
- Sensitive fields MUST be classified per Chapter 25 (Data Classification).
- Lineage SHALL be captured for every transformation.

**Examples.**
- A `patient.registered` event carries `tenant_id`, `branch_id`, and a canonical `party_id`.
- The `invoice.line` dimension conforms to the enterprise `Money` type.
- The `appointment.no_show` fact links to `Party`, `Provider`, `Location`, and `Time` dimensions.

**Future Implementation Notes.** Reference the enterprise Canonical Data Model. Do not couple to vendor-specific storage semantics. Adopt open table formats where practical.

**Backward Compatibility Notes.** Additive only. Existing schemas, tables, RLS policies, and services continue to operate unchanged. No migration is prescribed.

**Security Notes.** Alignment with V10 Zero-Trust: least-privilege access to data planes, encryption at rest and in transit, and field-level classification enforced by policy.

**Performance Notes.** Sampling, partitioning, indexing, and materialization strategies SHOULD align with SLOs published in V12.

**Governance Notes.** Owned by the Enterprise Data Council under V11 ARB with domain-level stewards defined in Chapter 6 (Data Ownership).

**Extended Discussion.**
This chapter forms part of the ZMedico Enterprise Data Platform (EDP) architectural corpus.
It codifies the intent, boundaries, and interfaces of the concern without prescribing runtime
implementation. Where implementation is eventually undertaken, the Governance Workflow ratified
in V6 SHALL apply, and the architectural boundaries defined in V8, V9, V10, V11, and V12 SHALL
be respected. Nothing in this chapter changes application code, database schema, RLS policies,
SECURITY DEFINER functions, Edge Functions, generated types, tests, package manifests, or
infrastructure assets.

**Interfaces.**
- **To V8 Authorization.** All data access decisions remain authoritative under RLS and V8
  policies. This chapter MUST NOT be interpreted as altering those decisions.
- **To V9 Identity.** Principal identity, trust envelopes, and session semantics are owned by
  V9. This chapter consumes identity as a fact; it does not redefine it.
- **To V10 Security.** Encryption, key management, and sensitivity classification are governed
  by V10. This chapter aligns to those classifications without inventing new ones.
- **To V11 Governance.** All decisions arising from this chapter SHALL be routed through the
  ARB, ADR, and lifecycle mechanisms V11 defines.
- **To V12 Observability.** Data-plane telemetry (freshness, quality, lineage, throughput) is
  emitted through the observability signals V12 standardizes; V13 defines the semantics, V12
  defines the transport.

**Design Considerations.**
- Prefer *contract-first* design: producers publish schemas and semantics before any consumer
  couples to them.
- Prefer *open standards*: SQL, OpenAPI, AsyncAPI, JSON Schema, Avro, Parquet, Iceberg/Delta,
  OpenLineage, DCAT.
- Prefer *decentralized ownership with federated governance*: domain teams own products; a
  federated council owns policy.
- Prefer *bounded contexts*: cross-domain coupling flows through published contracts, not
  through shared physical tables.
- Prefer *evolvability*: schemas evolve with compatibility rules; consumers negotiate versions
  through the schema registry.

**Anti-Patterns to Avoid.**
- Shared mutable OLTP tables as an integration channel.
- Untyped, unversioned event payloads.
- Point-to-point pipelines with no lineage capture.
- Silent schema drift with no compatibility gate.
- Uncontrolled cross-tenant joins.

**Compliance Alignment.**
- **HIPAA**: Preserve minimum necessary access; PHI is handled per V10 classifications.
- **GDPR**: Preserve lawful basis and purpose limitation; enable subject rights.
- **ISO 27001**: Align to Annex A controls for information classification, cryptography, and
  supplier data handling.
- **NIST 800-53**: Align to AC, AU, SC, and SI family controls at the data plane.

**Operational Envelope.**
- Data SLAs SHALL be published per data product (freshness, completeness, availability).
- Quality signals SHALL be observable in V12 dashboards.
- Incidents affecting data products SHALL follow the incident management workflow ratified
  by V12 Chapter 47.

**Explicit Non-Goals.**
- This chapter does NOT define authorization semantics.
- This chapter does NOT define identity or session semantics.
- This chapter does NOT define encryption primitives or key custody.
- This chapter does NOT change any existing database object, RLS policy, or SECURITY DEFINER
  function.
- This chapter does NOT introduce or modify Edge Functions or React/TypeScript modules.

**Rollout Philosophy (When Implementation Is Later Approved).**
- Additive first: introduce new datasets, contracts, and pipelines alongside existing ones.
- Shadow before cutover: run new pipelines in parallel, compare with existing outputs.
- Fitness-gated promotion: only promote when quality, lineage, and SLO gates pass.
- Reversible by default: every change SHALL have a documented rollback per V11.


## Chapter 41 — Analytics Platform

**Purpose.** Provide the compute, semantic, and delivery layers for analytics.

**Architecture.** Layered architecture composed of ingestion, storage, processing, governance, and consumption planes, aligned to the Enterprise Reference Architecture ratified in V11.

**ASCII Diagram.**
```text
[Producers] ─▶ [Contract] ─▶ [Pipeline] ─▶ [Storage] ─▶ [Serving] ─▶ [Consumers]
                     │                                     │
                     └────────── Governance / Lineage ─────┘
```

**Rules (RFC 2119).**
- Producers MUST publish schemas to the registry before emission.
- Consumers SHALL validate payloads against the registered schema.
- Breaking changes MUST NOT be released without a governance approval per V11.
- Sensitive fields MUST be classified per Chapter 25 (Data Classification).
- Lineage SHALL be captured for every transformation.

**Examples.**
- A `patient.registered` event carries `tenant_id`, `branch_id`, and a canonical `party_id`.
- The `invoice.line` dimension conforms to the enterprise `Money` type.
- The `appointment.no_show` fact links to `Party`, `Provider`, `Location`, and `Time` dimensions.

**Future Implementation Notes.** Reference the enterprise Canonical Data Model. Do not couple to vendor-specific storage semantics. Adopt open table formats where practical.

**Backward Compatibility Notes.** Additive only. Existing schemas, tables, RLS policies, and services continue to operate unchanged. No migration is prescribed.

**Security Notes.** Alignment with V10 Zero-Trust: least-privilege access to data planes, encryption at rest and in transit, and field-level classification enforced by policy.

**Performance Notes.** Sampling, partitioning, indexing, and materialization strategies SHOULD align with SLOs published in V12.

**Governance Notes.** Owned by the Enterprise Data Council under V11 ARB with domain-level stewards defined in Chapter 6 (Data Ownership).

**Extended Discussion.**
This chapter forms part of the ZMedico Enterprise Data Platform (EDP) architectural corpus.
It codifies the intent, boundaries, and interfaces of the concern without prescribing runtime
implementation. Where implementation is eventually undertaken, the Governance Workflow ratified
in V6 SHALL apply, and the architectural boundaries defined in V8, V9, V10, V11, and V12 SHALL
be respected. Nothing in this chapter changes application code, database schema, RLS policies,
SECURITY DEFINER functions, Edge Functions, generated types, tests, package manifests, or
infrastructure assets.

**Interfaces.**
- **To V8 Authorization.** All data access decisions remain authoritative under RLS and V8
  policies. This chapter MUST NOT be interpreted as altering those decisions.
- **To V9 Identity.** Principal identity, trust envelopes, and session semantics are owned by
  V9. This chapter consumes identity as a fact; it does not redefine it.
- **To V10 Security.** Encryption, key management, and sensitivity classification are governed
  by V10. This chapter aligns to those classifications without inventing new ones.
- **To V11 Governance.** All decisions arising from this chapter SHALL be routed through the
  ARB, ADR, and lifecycle mechanisms V11 defines.
- **To V12 Observability.** Data-plane telemetry (freshness, quality, lineage, throughput) is
  emitted through the observability signals V12 standardizes; V13 defines the semantics, V12
  defines the transport.

**Design Considerations.**
- Prefer *contract-first* design: producers publish schemas and semantics before any consumer
  couples to them.
- Prefer *open standards*: SQL, OpenAPI, AsyncAPI, JSON Schema, Avro, Parquet, Iceberg/Delta,
  OpenLineage, DCAT.
- Prefer *decentralized ownership with federated governance*: domain teams own products; a
  federated council owns policy.
- Prefer *bounded contexts*: cross-domain coupling flows through published contracts, not
  through shared physical tables.
- Prefer *evolvability*: schemas evolve with compatibility rules; consumers negotiate versions
  through the schema registry.

**Anti-Patterns to Avoid.**
- Shared mutable OLTP tables as an integration channel.
- Untyped, unversioned event payloads.
- Point-to-point pipelines with no lineage capture.
- Silent schema drift with no compatibility gate.
- Uncontrolled cross-tenant joins.

**Compliance Alignment.**
- **HIPAA**: Preserve minimum necessary access; PHI is handled per V10 classifications.
- **GDPR**: Preserve lawful basis and purpose limitation; enable subject rights.
- **ISO 27001**: Align to Annex A controls for information classification, cryptography, and
  supplier data handling.
- **NIST 800-53**: Align to AC, AU, SC, and SI family controls at the data plane.

**Operational Envelope.**
- Data SLAs SHALL be published per data product (freshness, completeness, availability).
- Quality signals SHALL be observable in V12 dashboards.
- Incidents affecting data products SHALL follow the incident management workflow ratified
  by V12 Chapter 47.

**Explicit Non-Goals.**
- This chapter does NOT define authorization semantics.
- This chapter does NOT define identity or session semantics.
- This chapter does NOT define encryption primitives or key custody.
- This chapter does NOT change any existing database object, RLS policy, or SECURITY DEFINER
  function.
- This chapter does NOT introduce or modify Edge Functions or React/TypeScript modules.

**Rollout Philosophy (When Implementation Is Later Approved).**
- Additive first: introduce new datasets, contracts, and pipelines alongside existing ones.
- Shadow before cutover: run new pipelines in parallel, compare with existing outputs.
- Fitness-gated promotion: only promote when quality, lineage, and SLO gates pass.
- Reversible by default: every change SHALL have a documented rollback per V11.


## Chapter 42 — Business Intelligence Architecture

**Purpose.** Serve dashboards, reports, and ad-hoc analysis to business users.

**Architecture.** Layered architecture composed of ingestion, storage, processing, governance, and consumption planes, aligned to the Enterprise Reference Architecture ratified in V11.

**ASCII Diagram.**
```text
[Producers] ─▶ [Contract] ─▶ [Pipeline] ─▶ [Storage] ─▶ [Serving] ─▶ [Consumers]
                     │                                     │
                     └────────── Governance / Lineage ─────┘
```

**Rules (RFC 2119).**
- Producers MUST publish schemas to the registry before emission.
- Consumers SHALL validate payloads against the registered schema.
- Breaking changes MUST NOT be released without a governance approval per V11.
- Sensitive fields MUST be classified per Chapter 25 (Data Classification).
- Lineage SHALL be captured for every transformation.

**Examples.**
- A `patient.registered` event carries `tenant_id`, `branch_id`, and a canonical `party_id`.
- The `invoice.line` dimension conforms to the enterprise `Money` type.
- The `appointment.no_show` fact links to `Party`, `Provider`, `Location`, and `Time` dimensions.

**Future Implementation Notes.** Reference the enterprise Canonical Data Model. Do not couple to vendor-specific storage semantics. Adopt open table formats where practical.

**Backward Compatibility Notes.** Additive only. Existing schemas, tables, RLS policies, and services continue to operate unchanged. No migration is prescribed.

**Security Notes.** Alignment with V10 Zero-Trust: least-privilege access to data planes, encryption at rest and in transit, and field-level classification enforced by policy.

**Performance Notes.** Sampling, partitioning, indexing, and materialization strategies SHOULD align with SLOs published in V12.

**Governance Notes.** Owned by the Enterprise Data Council under V11 ARB with domain-level stewards defined in Chapter 6 (Data Ownership).

**Extended Discussion.**
This chapter forms part of the ZMedico Enterprise Data Platform (EDP) architectural corpus.
It codifies the intent, boundaries, and interfaces of the concern without prescribing runtime
implementation. Where implementation is eventually undertaken, the Governance Workflow ratified
in V6 SHALL apply, and the architectural boundaries defined in V8, V9, V10, V11, and V12 SHALL
be respected. Nothing in this chapter changes application code, database schema, RLS policies,
SECURITY DEFINER functions, Edge Functions, generated types, tests, package manifests, or
infrastructure assets.

**Interfaces.**
- **To V8 Authorization.** All data access decisions remain authoritative under RLS and V8
  policies. This chapter MUST NOT be interpreted as altering those decisions.
- **To V9 Identity.** Principal identity, trust envelopes, and session semantics are owned by
  V9. This chapter consumes identity as a fact; it does not redefine it.
- **To V10 Security.** Encryption, key management, and sensitivity classification are governed
  by V10. This chapter aligns to those classifications without inventing new ones.
- **To V11 Governance.** All decisions arising from this chapter SHALL be routed through the
  ARB, ADR, and lifecycle mechanisms V11 defines.
- **To V12 Observability.** Data-plane telemetry (freshness, quality, lineage, throughput) is
  emitted through the observability signals V12 standardizes; V13 defines the semantics, V12
  defines the transport.

**Design Considerations.**
- Prefer *contract-first* design: producers publish schemas and semantics before any consumer
  couples to them.
- Prefer *open standards*: SQL, OpenAPI, AsyncAPI, JSON Schema, Avro, Parquet, Iceberg/Delta,
  OpenLineage, DCAT.
- Prefer *decentralized ownership with federated governance*: domain teams own products; a
  federated council owns policy.
- Prefer *bounded contexts*: cross-domain coupling flows through published contracts, not
  through shared physical tables.
- Prefer *evolvability*: schemas evolve with compatibility rules; consumers negotiate versions
  through the schema registry.

**Anti-Patterns to Avoid.**
- Shared mutable OLTP tables as an integration channel.
- Untyped, unversioned event payloads.
- Point-to-point pipelines with no lineage capture.
- Silent schema drift with no compatibility gate.
- Uncontrolled cross-tenant joins.

**Compliance Alignment.**
- **HIPAA**: Preserve minimum necessary access; PHI is handled per V10 classifications.
- **GDPR**: Preserve lawful basis and purpose limitation; enable subject rights.
- **ISO 27001**: Align to Annex A controls for information classification, cryptography, and
  supplier data handling.
- **NIST 800-53**: Align to AC, AU, SC, and SI family controls at the data plane.

**Operational Envelope.**
- Data SLAs SHALL be published per data product (freshness, completeness, availability).
- Quality signals SHALL be observable in V12 dashboards.
- Incidents affecting data products SHALL follow the incident management workflow ratified
  by V12 Chapter 47.

**Explicit Non-Goals.**
- This chapter does NOT define authorization semantics.
- This chapter does NOT define identity or session semantics.
- This chapter does NOT define encryption primitives or key custody.
- This chapter does NOT change any existing database object, RLS policy, or SECURITY DEFINER
  function.
- This chapter does NOT introduce or modify Edge Functions or React/TypeScript modules.

**Rollout Philosophy (When Implementation Is Later Approved).**
- Additive first: introduce new datasets, contracts, and pipelines alongside existing ones.
- Shadow before cutover: run new pipelines in parallel, compare with existing outputs.
- Fitness-gated promotion: only promote when quality, lineage, and SLO gates pass.
- Reversible by default: every change SHALL have a documented rollback per V11.


## Chapter 43 — Reporting Architecture

**Purpose.** Deliver curated, governed reports to internal and external stakeholders.

**Architecture.** Layered architecture composed of ingestion, storage, processing, governance, and consumption planes, aligned to the Enterprise Reference Architecture ratified in V11.

**ASCII Diagram.**
```text
[Producers] ─▶ [Contract] ─▶ [Pipeline] ─▶ [Storage] ─▶ [Serving] ─▶ [Consumers]
                     │                                     │
                     └────────── Governance / Lineage ─────┘
```

**Rules (RFC 2119).**
- Producers MUST publish schemas to the registry before emission.
- Consumers SHALL validate payloads against the registered schema.
- Breaking changes MUST NOT be released without a governance approval per V11.
- Sensitive fields MUST be classified per Chapter 25 (Data Classification).
- Lineage SHALL be captured for every transformation.

**Examples.**
- A `patient.registered` event carries `tenant_id`, `branch_id`, and a canonical `party_id`.
- The `invoice.line` dimension conforms to the enterprise `Money` type.
- The `appointment.no_show` fact links to `Party`, `Provider`, `Location`, and `Time` dimensions.

**Future Implementation Notes.** Reference the enterprise Canonical Data Model. Do not couple to vendor-specific storage semantics. Adopt open table formats where practical.

**Backward Compatibility Notes.** Additive only. Existing schemas, tables, RLS policies, and services continue to operate unchanged. No migration is prescribed.

**Security Notes.** Alignment with V10 Zero-Trust: least-privilege access to data planes, encryption at rest and in transit, and field-level classification enforced by policy.

**Performance Notes.** Sampling, partitioning, indexing, and materialization strategies SHOULD align with SLOs published in V12.

**Governance Notes.** Owned by the Enterprise Data Council under V11 ARB with domain-level stewards defined in Chapter 6 (Data Ownership).

**Extended Discussion.**
This chapter forms part of the ZMedico Enterprise Data Platform (EDP) architectural corpus.
It codifies the intent, boundaries, and interfaces of the concern without prescribing runtime
implementation. Where implementation is eventually undertaken, the Governance Workflow ratified
in V6 SHALL apply, and the architectural boundaries defined in V8, V9, V10, V11, and V12 SHALL
be respected. Nothing in this chapter changes application code, database schema, RLS policies,
SECURITY DEFINER functions, Edge Functions, generated types, tests, package manifests, or
infrastructure assets.

**Interfaces.**
- **To V8 Authorization.** All data access decisions remain authoritative under RLS and V8
  policies. This chapter MUST NOT be interpreted as altering those decisions.
- **To V9 Identity.** Principal identity, trust envelopes, and session semantics are owned by
  V9. This chapter consumes identity as a fact; it does not redefine it.
- **To V10 Security.** Encryption, key management, and sensitivity classification are governed
  by V10. This chapter aligns to those classifications without inventing new ones.
- **To V11 Governance.** All decisions arising from this chapter SHALL be routed through the
  ARB, ADR, and lifecycle mechanisms V11 defines.
- **To V12 Observability.** Data-plane telemetry (freshness, quality, lineage, throughput) is
  emitted through the observability signals V12 standardizes; V13 defines the semantics, V12
  defines the transport.

**Design Considerations.**
- Prefer *contract-first* design: producers publish schemas and semantics before any consumer
  couples to them.
- Prefer *open standards*: SQL, OpenAPI, AsyncAPI, JSON Schema, Avro, Parquet, Iceberg/Delta,
  OpenLineage, DCAT.
- Prefer *decentralized ownership with federated governance*: domain teams own products; a
  federated council owns policy.
- Prefer *bounded contexts*: cross-domain coupling flows through published contracts, not
  through shared physical tables.
- Prefer *evolvability*: schemas evolve with compatibility rules; consumers negotiate versions
  through the schema registry.

**Anti-Patterns to Avoid.**
- Shared mutable OLTP tables as an integration channel.
- Untyped, unversioned event payloads.
- Point-to-point pipelines with no lineage capture.
- Silent schema drift with no compatibility gate.
- Uncontrolled cross-tenant joins.

**Compliance Alignment.**
- **HIPAA**: Preserve minimum necessary access; PHI is handled per V10 classifications.
- **GDPR**: Preserve lawful basis and purpose limitation; enable subject rights.
- **ISO 27001**: Align to Annex A controls for information classification, cryptography, and
  supplier data handling.
- **NIST 800-53**: Align to AC, AU, SC, and SI family controls at the data plane.

**Operational Envelope.**
- Data SLAs SHALL be published per data product (freshness, completeness, availability).
- Quality signals SHALL be observable in V12 dashboards.
- Incidents affecting data products SHALL follow the incident management workflow ratified
  by V12 Chapter 47.

**Explicit Non-Goals.**
- This chapter does NOT define authorization semantics.
- This chapter does NOT define identity or session semantics.
- This chapter does NOT define encryption primitives or key custody.
- This chapter does NOT change any existing database object, RLS policy, or SECURITY DEFINER
  function.
- This chapter does NOT introduce or modify Edge Functions or React/TypeScript modules.

**Rollout Philosophy (When Implementation Is Later Approved).**
- Additive first: introduce new datasets, contracts, and pipelines alongside existing ones.
- Shadow before cutover: run new pipelines in parallel, compare with existing outputs.
- Fitness-gated promotion: only promote when quality, lineage, and SLO gates pass.
- Reversible by default: every change SHALL have a documented rollback per V11.


## Chapter 44 — AI Data Readiness

**Purpose.** Prepare, label, and version data for machine learning workloads.

**Architecture.** Layered architecture composed of ingestion, storage, processing, governance, and consumption planes, aligned to the Enterprise Reference Architecture ratified in V11.

**ASCII Diagram.**
```text
[Producers] ─▶ [Contract] ─▶ [Pipeline] ─▶ [Storage] ─▶ [Serving] ─▶ [Consumers]
                     │                                     │
                     └────────── Governance / Lineage ─────┘
```

**Rules (RFC 2119).**
- Producers MUST publish schemas to the registry before emission.
- Consumers SHALL validate payloads against the registered schema.
- Breaking changes MUST NOT be released without a governance approval per V11.
- Sensitive fields MUST be classified per Chapter 25 (Data Classification).
- Lineage SHALL be captured for every transformation.

**Examples.**
- A `patient.registered` event carries `tenant_id`, `branch_id`, and a canonical `party_id`.
- The `invoice.line` dimension conforms to the enterprise `Money` type.
- The `appointment.no_show` fact links to `Party`, `Provider`, `Location`, and `Time` dimensions.

**Future Implementation Notes.** Reference the enterprise Canonical Data Model. Do not couple to vendor-specific storage semantics. Adopt open table formats where practical.

**Backward Compatibility Notes.** Additive only. Existing schemas, tables, RLS policies, and services continue to operate unchanged. No migration is prescribed.

**Security Notes.** Alignment with V10 Zero-Trust: least-privilege access to data planes, encryption at rest and in transit, and field-level classification enforced by policy.

**Performance Notes.** Sampling, partitioning, indexing, and materialization strategies SHOULD align with SLOs published in V12.

**Governance Notes.** Owned by the Enterprise Data Council under V11 ARB with domain-level stewards defined in Chapter 6 (Data Ownership).

**Extended Discussion.**
This chapter forms part of the ZMedico Enterprise Data Platform (EDP) architectural corpus.
It codifies the intent, boundaries, and interfaces of the concern without prescribing runtime
implementation. Where implementation is eventually undertaken, the Governance Workflow ratified
in V6 SHALL apply, and the architectural boundaries defined in V8, V9, V10, V11, and V12 SHALL
be respected. Nothing in this chapter changes application code, database schema, RLS policies,
SECURITY DEFINER functions, Edge Functions, generated types, tests, package manifests, or
infrastructure assets.

**Interfaces.**
- **To V8 Authorization.** All data access decisions remain authoritative under RLS and V8
  policies. This chapter MUST NOT be interpreted as altering those decisions.
- **To V9 Identity.** Principal identity, trust envelopes, and session semantics are owned by
  V9. This chapter consumes identity as a fact; it does not redefine it.
- **To V10 Security.** Encryption, key management, and sensitivity classification are governed
  by V10. This chapter aligns to those classifications without inventing new ones.
- **To V11 Governance.** All decisions arising from this chapter SHALL be routed through the
  ARB, ADR, and lifecycle mechanisms V11 defines.
- **To V12 Observability.** Data-plane telemetry (freshness, quality, lineage, throughput) is
  emitted through the observability signals V12 standardizes; V13 defines the semantics, V12
  defines the transport.

**Design Considerations.**
- Prefer *contract-first* design: producers publish schemas and semantics before any consumer
  couples to them.
- Prefer *open standards*: SQL, OpenAPI, AsyncAPI, JSON Schema, Avro, Parquet, Iceberg/Delta,
  OpenLineage, DCAT.
- Prefer *decentralized ownership with federated governance*: domain teams own products; a
  federated council owns policy.
- Prefer *bounded contexts*: cross-domain coupling flows through published contracts, not
  through shared physical tables.
- Prefer *evolvability*: schemas evolve with compatibility rules; consumers negotiate versions
  through the schema registry.

**Anti-Patterns to Avoid.**
- Shared mutable OLTP tables as an integration channel.
- Untyped, unversioned event payloads.
- Point-to-point pipelines with no lineage capture.
- Silent schema drift with no compatibility gate.
- Uncontrolled cross-tenant joins.

**Compliance Alignment.**
- **HIPAA**: Preserve minimum necessary access; PHI is handled per V10 classifications.
- **GDPR**: Preserve lawful basis and purpose limitation; enable subject rights.
- **ISO 27001**: Align to Annex A controls for information classification, cryptography, and
  supplier data handling.
- **NIST 800-53**: Align to AC, AU, SC, and SI family controls at the data plane.

**Operational Envelope.**
- Data SLAs SHALL be published per data product (freshness, completeness, availability).
- Quality signals SHALL be observable in V12 dashboards.
- Incidents affecting data products SHALL follow the incident management workflow ratified
  by V12 Chapter 47.

**Explicit Non-Goals.**
- This chapter does NOT define authorization semantics.
- This chapter does NOT define identity or session semantics.
- This chapter does NOT define encryption primitives or key custody.
- This chapter does NOT change any existing database object, RLS policy, or SECURITY DEFINER
  function.
- This chapter does NOT introduce or modify Edge Functions or React/TypeScript modules.

**Rollout Philosophy (When Implementation Is Later Approved).**
- Additive first: introduce new datasets, contracts, and pipelines alongside existing ones.
- Shadow before cutover: run new pipelines in parallel, compare with existing outputs.
- Fitness-gated promotion: only promote when quality, lineage, and SLO gates pass.
- Reversible by default: every change SHALL have a documented rollback per V11.


## Chapter 45 — ML Feature Store

**Purpose.** Serve consistent features to training and serving with governance.

**Architecture.** Layered architecture composed of ingestion, storage, processing, governance, and consumption planes, aligned to the Enterprise Reference Architecture ratified in V11.

**ASCII Diagram.**
```text
[Producers] ─▶ [Contract] ─▶ [Pipeline] ─▶ [Storage] ─▶ [Serving] ─▶ [Consumers]
                     │                                     │
                     └────────── Governance / Lineage ─────┘
```

**Rules (RFC 2119).**
- Producers MUST publish schemas to the registry before emission.
- Consumers SHALL validate payloads against the registered schema.
- Breaking changes MUST NOT be released without a governance approval per V11.
- Sensitive fields MUST be classified per Chapter 25 (Data Classification).
- Lineage SHALL be captured for every transformation.

**Examples.**
- A `patient.registered` event carries `tenant_id`, `branch_id`, and a canonical `party_id`.
- The `invoice.line` dimension conforms to the enterprise `Money` type.
- The `appointment.no_show` fact links to `Party`, `Provider`, `Location`, and `Time` dimensions.

**Future Implementation Notes.** Reference the enterprise Canonical Data Model. Do not couple to vendor-specific storage semantics. Adopt open table formats where practical.

**Backward Compatibility Notes.** Additive only. Existing schemas, tables, RLS policies, and services continue to operate unchanged. No migration is prescribed.

**Security Notes.** Alignment with V10 Zero-Trust: least-privilege access to data planes, encryption at rest and in transit, and field-level classification enforced by policy.

**Performance Notes.** Sampling, partitioning, indexing, and materialization strategies SHOULD align with SLOs published in V12.

**Governance Notes.** Owned by the Enterprise Data Council under V11 ARB with domain-level stewards defined in Chapter 6 (Data Ownership).

**Extended Discussion.**
This chapter forms part of the ZMedico Enterprise Data Platform (EDP) architectural corpus.
It codifies the intent, boundaries, and interfaces of the concern without prescribing runtime
implementation. Where implementation is eventually undertaken, the Governance Workflow ratified
in V6 SHALL apply, and the architectural boundaries defined in V8, V9, V10, V11, and V12 SHALL
be respected. Nothing in this chapter changes application code, database schema, RLS policies,
SECURITY DEFINER functions, Edge Functions, generated types, tests, package manifests, or
infrastructure assets.

**Interfaces.**
- **To V8 Authorization.** All data access decisions remain authoritative under RLS and V8
  policies. This chapter MUST NOT be interpreted as altering those decisions.
- **To V9 Identity.** Principal identity, trust envelopes, and session semantics are owned by
  V9. This chapter consumes identity as a fact; it does not redefine it.
- **To V10 Security.** Encryption, key management, and sensitivity classification are governed
  by V10. This chapter aligns to those classifications without inventing new ones.
- **To V11 Governance.** All decisions arising from this chapter SHALL be routed through the
  ARB, ADR, and lifecycle mechanisms V11 defines.
- **To V12 Observability.** Data-plane telemetry (freshness, quality, lineage, throughput) is
  emitted through the observability signals V12 standardizes; V13 defines the semantics, V12
  defines the transport.

**Design Considerations.**
- Prefer *contract-first* design: producers publish schemas and semantics before any consumer
  couples to them.
- Prefer *open standards*: SQL, OpenAPI, AsyncAPI, JSON Schema, Avro, Parquet, Iceberg/Delta,
  OpenLineage, DCAT.
- Prefer *decentralized ownership with federated governance*: domain teams own products; a
  federated council owns policy.
- Prefer *bounded contexts*: cross-domain coupling flows through published contracts, not
  through shared physical tables.
- Prefer *evolvability*: schemas evolve with compatibility rules; consumers negotiate versions
  through the schema registry.

**Anti-Patterns to Avoid.**
- Shared mutable OLTP tables as an integration channel.
- Untyped, unversioned event payloads.
- Point-to-point pipelines with no lineage capture.
- Silent schema drift with no compatibility gate.
- Uncontrolled cross-tenant joins.

**Compliance Alignment.**
- **HIPAA**: Preserve minimum necessary access; PHI is handled per V10 classifications.
- **GDPR**: Preserve lawful basis and purpose limitation; enable subject rights.
- **ISO 27001**: Align to Annex A controls for information classification, cryptography, and
  supplier data handling.
- **NIST 800-53**: Align to AC, AU, SC, and SI family controls at the data plane.

**Operational Envelope.**
- Data SLAs SHALL be published per data product (freshness, completeness, availability).
- Quality signals SHALL be observable in V12 dashboards.
- Incidents affecting data products SHALL follow the incident management workflow ratified
  by V12 Chapter 47.

**Explicit Non-Goals.**
- This chapter does NOT define authorization semantics.
- This chapter does NOT define identity or session semantics.
- This chapter does NOT define encryption primitives or key custody.
- This chapter does NOT change any existing database object, RLS policy, or SECURITY DEFINER
  function.
- This chapter does NOT introduce or modify Edge Functions or React/TypeScript modules.

**Rollout Philosophy (When Implementation Is Later Approved).**
- Additive first: introduce new datasets, contracts, and pipelines alongside existing ones.
- Shadow before cutover: run new pipelines in parallel, compare with existing outputs.
- Fitness-gated promotion: only promote when quality, lineage, and SLO gates pass.
- Reversible by default: every change SHALL have a documented rollback per V11.


## Chapter 46 — Knowledge Graph

**Purpose.** Model entities, relationships, and ontologies for reasoning and search.

**Architecture.** Layered architecture composed of ingestion, storage, processing, governance, and consumption planes, aligned to the Enterprise Reference Architecture ratified in V11.

**ASCII Diagram.**
```text
[Producers] ─▶ [Contract] ─▶ [Pipeline] ─▶ [Storage] ─▶ [Serving] ─▶ [Consumers]
                     │                                     │
                     └────────── Governance / Lineage ─────┘
```

**Rules (RFC 2119).**
- Producers MUST publish schemas to the registry before emission.
- Consumers SHALL validate payloads against the registered schema.
- Breaking changes MUST NOT be released without a governance approval per V11.
- Sensitive fields MUST be classified per Chapter 25 (Data Classification).
- Lineage SHALL be captured for every transformation.

**Examples.**
- A `patient.registered` event carries `tenant_id`, `branch_id`, and a canonical `party_id`.
- The `invoice.line` dimension conforms to the enterprise `Money` type.
- The `appointment.no_show` fact links to `Party`, `Provider`, `Location`, and `Time` dimensions.

**Future Implementation Notes.** Reference the enterprise Canonical Data Model. Do not couple to vendor-specific storage semantics. Adopt open table formats where practical.

**Backward Compatibility Notes.** Additive only. Existing schemas, tables, RLS policies, and services continue to operate unchanged. No migration is prescribed.

**Security Notes.** Alignment with V10 Zero-Trust: least-privilege access to data planes, encryption at rest and in transit, and field-level classification enforced by policy.

**Performance Notes.** Sampling, partitioning, indexing, and materialization strategies SHOULD align with SLOs published in V12.

**Governance Notes.** Owned by the Enterprise Data Council under V11 ARB with domain-level stewards defined in Chapter 6 (Data Ownership).

**Extended Discussion.**
This chapter forms part of the ZMedico Enterprise Data Platform (EDP) architectural corpus.
It codifies the intent, boundaries, and interfaces of the concern without prescribing runtime
implementation. Where implementation is eventually undertaken, the Governance Workflow ratified
in V6 SHALL apply, and the architectural boundaries defined in V8, V9, V10, V11, and V12 SHALL
be respected. Nothing in this chapter changes application code, database schema, RLS policies,
SECURITY DEFINER functions, Edge Functions, generated types, tests, package manifests, or
infrastructure assets.

**Interfaces.**
- **To V8 Authorization.** All data access decisions remain authoritative under RLS and V8
  policies. This chapter MUST NOT be interpreted as altering those decisions.
- **To V9 Identity.** Principal identity, trust envelopes, and session semantics are owned by
  V9. This chapter consumes identity as a fact; it does not redefine it.
- **To V10 Security.** Encryption, key management, and sensitivity classification are governed
  by V10. This chapter aligns to those classifications without inventing new ones.
- **To V11 Governance.** All decisions arising from this chapter SHALL be routed through the
  ARB, ADR, and lifecycle mechanisms V11 defines.
- **To V12 Observability.** Data-plane telemetry (freshness, quality, lineage, throughput) is
  emitted through the observability signals V12 standardizes; V13 defines the semantics, V12
  defines the transport.

**Design Considerations.**
- Prefer *contract-first* design: producers publish schemas and semantics before any consumer
  couples to them.
- Prefer *open standards*: SQL, OpenAPI, AsyncAPI, JSON Schema, Avro, Parquet, Iceberg/Delta,
  OpenLineage, DCAT.
- Prefer *decentralized ownership with federated governance*: domain teams own products; a
  federated council owns policy.
- Prefer *bounded contexts*: cross-domain coupling flows through published contracts, not
  through shared physical tables.
- Prefer *evolvability*: schemas evolve with compatibility rules; consumers negotiate versions
  through the schema registry.

**Anti-Patterns to Avoid.**
- Shared mutable OLTP tables as an integration channel.
- Untyped, unversioned event payloads.
- Point-to-point pipelines with no lineage capture.
- Silent schema drift with no compatibility gate.
- Uncontrolled cross-tenant joins.

**Compliance Alignment.**
- **HIPAA**: Preserve minimum necessary access; PHI is handled per V10 classifications.
- **GDPR**: Preserve lawful basis and purpose limitation; enable subject rights.
- **ISO 27001**: Align to Annex A controls for information classification, cryptography, and
  supplier data handling.
- **NIST 800-53**: Align to AC, AU, SC, and SI family controls at the data plane.

**Operational Envelope.**
- Data SLAs SHALL be published per data product (freshness, completeness, availability).
- Quality signals SHALL be observable in V12 dashboards.
- Incidents affecting data products SHALL follow the incident management workflow ratified
  by V12 Chapter 47.

**Explicit Non-Goals.**
- This chapter does NOT define authorization semantics.
- This chapter does NOT define identity or session semantics.
- This chapter does NOT define encryption primitives or key custody.
- This chapter does NOT change any existing database object, RLS policy, or SECURITY DEFINER
  function.
- This chapter does NOT introduce or modify Edge Functions or React/TypeScript modules.

**Rollout Philosophy (When Implementation Is Later Approved).**
- Additive first: introduce new datasets, contracts, and pipelines alongside existing ones.
- Shadow before cutover: run new pipelines in parallel, compare with existing outputs.
- Fitness-gated promotion: only promote when quality, lineage, and SLO gates pass.
- Reversible by default: every change SHALL have a documented rollback per V11.


## Chapter 47 — Search Architecture

**Purpose.** Provide unified, permissioned enterprise search.

**Architecture.** Layered architecture composed of ingestion, storage, processing, governance, and consumption planes, aligned to the Enterprise Reference Architecture ratified in V11.

**ASCII Diagram.**
```text
[Producers] ─▶ [Contract] ─▶ [Pipeline] ─▶ [Storage] ─▶ [Serving] ─▶ [Consumers]
                     │                                     │
                     └────────── Governance / Lineage ─────┘
```

**Rules (RFC 2119).**
- Producers MUST publish schemas to the registry before emission.
- Consumers SHALL validate payloads against the registered schema.
- Breaking changes MUST NOT be released without a governance approval per V11.
- Sensitive fields MUST be classified per Chapter 25 (Data Classification).
- Lineage SHALL be captured for every transformation.

**Examples.**
- A `patient.registered` event carries `tenant_id`, `branch_id`, and a canonical `party_id`.
- The `invoice.line` dimension conforms to the enterprise `Money` type.
- The `appointment.no_show` fact links to `Party`, `Provider`, `Location`, and `Time` dimensions.

**Future Implementation Notes.** Reference the enterprise Canonical Data Model. Do not couple to vendor-specific storage semantics. Adopt open table formats where practical.

**Backward Compatibility Notes.** Additive only. Existing schemas, tables, RLS policies, and services continue to operate unchanged. No migration is prescribed.

**Security Notes.** Alignment with V10 Zero-Trust: least-privilege access to data planes, encryption at rest and in transit, and field-level classification enforced by policy.

**Performance Notes.** Sampling, partitioning, indexing, and materialization strategies SHOULD align with SLOs published in V12.

**Governance Notes.** Owned by the Enterprise Data Council under V11 ARB with domain-level stewards defined in Chapter 6 (Data Ownership).

**Extended Discussion.**
This chapter forms part of the ZMedico Enterprise Data Platform (EDP) architectural corpus.
It codifies the intent, boundaries, and interfaces of the concern without prescribing runtime
implementation. Where implementation is eventually undertaken, the Governance Workflow ratified
in V6 SHALL apply, and the architectural boundaries defined in V8, V9, V10, V11, and V12 SHALL
be respected. Nothing in this chapter changes application code, database schema, RLS policies,
SECURITY DEFINER functions, Edge Functions, generated types, tests, package manifests, or
infrastructure assets.

**Interfaces.**
- **To V8 Authorization.** All data access decisions remain authoritative under RLS and V8
  policies. This chapter MUST NOT be interpreted as altering those decisions.
- **To V9 Identity.** Principal identity, trust envelopes, and session semantics are owned by
  V9. This chapter consumes identity as a fact; it does not redefine it.
- **To V10 Security.** Encryption, key management, and sensitivity classification are governed
  by V10. This chapter aligns to those classifications without inventing new ones.
- **To V11 Governance.** All decisions arising from this chapter SHALL be routed through the
  ARB, ADR, and lifecycle mechanisms V11 defines.
- **To V12 Observability.** Data-plane telemetry (freshness, quality, lineage, throughput) is
  emitted through the observability signals V12 standardizes; V13 defines the semantics, V12
  defines the transport.

**Design Considerations.**
- Prefer *contract-first* design: producers publish schemas and semantics before any consumer
  couples to them.
- Prefer *open standards*: SQL, OpenAPI, AsyncAPI, JSON Schema, Avro, Parquet, Iceberg/Delta,
  OpenLineage, DCAT.
- Prefer *decentralized ownership with federated governance*: domain teams own products; a
  federated council owns policy.
- Prefer *bounded contexts*: cross-domain coupling flows through published contracts, not
  through shared physical tables.
- Prefer *evolvability*: schemas evolve with compatibility rules; consumers negotiate versions
  through the schema registry.

**Anti-Patterns to Avoid.**
- Shared mutable OLTP tables as an integration channel.
- Untyped, unversioned event payloads.
- Point-to-point pipelines with no lineage capture.
- Silent schema drift with no compatibility gate.
- Uncontrolled cross-tenant joins.

**Compliance Alignment.**
- **HIPAA**: Preserve minimum necessary access; PHI is handled per V10 classifications.
- **GDPR**: Preserve lawful basis and purpose limitation; enable subject rights.
- **ISO 27001**: Align to Annex A controls for information classification, cryptography, and
  supplier data handling.
- **NIST 800-53**: Align to AC, AU, SC, and SI family controls at the data plane.

**Operational Envelope.**
- Data SLAs SHALL be published per data product (freshness, completeness, availability).
- Quality signals SHALL be observable in V12 dashboards.
- Incidents affecting data products SHALL follow the incident management workflow ratified
  by V12 Chapter 47.

**Explicit Non-Goals.**
- This chapter does NOT define authorization semantics.
- This chapter does NOT define identity or session semantics.
- This chapter does NOT define encryption primitives or key custody.
- This chapter does NOT change any existing database object, RLS policy, or SECURITY DEFINER
  function.
- This chapter does NOT introduce or modify Edge Functions or React/TypeScript modules.

**Rollout Philosophy (When Implementation Is Later Approved).**
- Additive first: introduce new datasets, contracts, and pipelines alongside existing ones.
- Shadow before cutover: run new pipelines in parallel, compare with existing outputs.
- Fitness-gated promotion: only promote when quality, lineage, and SLO gates pass.
- Reversible by default: every change SHALL have a documented rollback per V11.


## Chapter 48 — Semantic Layer

**Purpose.** Provide a shared meaning layer over physical storage.

**Architecture.** Layered architecture composed of ingestion, storage, processing, governance, and consumption planes, aligned to the Enterprise Reference Architecture ratified in V11.

**ASCII Diagram.**
```text
[Producers] ─▶ [Contract] ─▶ [Pipeline] ─▶ [Storage] ─▶ [Serving] ─▶ [Consumers]
                     │                                     │
                     └────────── Governance / Lineage ─────┘
```

**Rules (RFC 2119).**
- Producers MUST publish schemas to the registry before emission.
- Consumers SHALL validate payloads against the registered schema.
- Breaking changes MUST NOT be released without a governance approval per V11.
- Sensitive fields MUST be classified per Chapter 25 (Data Classification).
- Lineage SHALL be captured for every transformation.

**Examples.**
- A `patient.registered` event carries `tenant_id`, `branch_id`, and a canonical `party_id`.
- The `invoice.line` dimension conforms to the enterprise `Money` type.
- The `appointment.no_show` fact links to `Party`, `Provider`, `Location`, and `Time` dimensions.

**Future Implementation Notes.** Reference the enterprise Canonical Data Model. Do not couple to vendor-specific storage semantics. Adopt open table formats where practical.

**Backward Compatibility Notes.** Additive only. Existing schemas, tables, RLS policies, and services continue to operate unchanged. No migration is prescribed.

**Security Notes.** Alignment with V10 Zero-Trust: least-privilege access to data planes, encryption at rest and in transit, and field-level classification enforced by policy.

**Performance Notes.** Sampling, partitioning, indexing, and materialization strategies SHOULD align with SLOs published in V12.

**Governance Notes.** Owned by the Enterprise Data Council under V11 ARB with domain-level stewards defined in Chapter 6 (Data Ownership).

**Extended Discussion.**
This chapter forms part of the ZMedico Enterprise Data Platform (EDP) architectural corpus.
It codifies the intent, boundaries, and interfaces of the concern without prescribing runtime
implementation. Where implementation is eventually undertaken, the Governance Workflow ratified
in V6 SHALL apply, and the architectural boundaries defined in V8, V9, V10, V11, and V12 SHALL
be respected. Nothing in this chapter changes application code, database schema, RLS policies,
SECURITY DEFINER functions, Edge Functions, generated types, tests, package manifests, or
infrastructure assets.

**Interfaces.**
- **To V8 Authorization.** All data access decisions remain authoritative under RLS and V8
  policies. This chapter MUST NOT be interpreted as altering those decisions.
- **To V9 Identity.** Principal identity, trust envelopes, and session semantics are owned by
  V9. This chapter consumes identity as a fact; it does not redefine it.
- **To V10 Security.** Encryption, key management, and sensitivity classification are governed
  by V10. This chapter aligns to those classifications without inventing new ones.
- **To V11 Governance.** All decisions arising from this chapter SHALL be routed through the
  ARB, ADR, and lifecycle mechanisms V11 defines.
- **To V12 Observability.** Data-plane telemetry (freshness, quality, lineage, throughput) is
  emitted through the observability signals V12 standardizes; V13 defines the semantics, V12
  defines the transport.

**Design Considerations.**
- Prefer *contract-first* design: producers publish schemas and semantics before any consumer
  couples to them.
- Prefer *open standards*: SQL, OpenAPI, AsyncAPI, JSON Schema, Avro, Parquet, Iceberg/Delta,
  OpenLineage, DCAT.
- Prefer *decentralized ownership with federated governance*: domain teams own products; a
  federated council owns policy.
- Prefer *bounded contexts*: cross-domain coupling flows through published contracts, not
  through shared physical tables.
- Prefer *evolvability*: schemas evolve with compatibility rules; consumers negotiate versions
  through the schema registry.

**Anti-Patterns to Avoid.**
- Shared mutable OLTP tables as an integration channel.
- Untyped, unversioned event payloads.
- Point-to-point pipelines with no lineage capture.
- Silent schema drift with no compatibility gate.
- Uncontrolled cross-tenant joins.

**Compliance Alignment.**
- **HIPAA**: Preserve minimum necessary access; PHI is handled per V10 classifications.
- **GDPR**: Preserve lawful basis and purpose limitation; enable subject rights.
- **ISO 27001**: Align to Annex A controls for information classification, cryptography, and
  supplier data handling.
- **NIST 800-53**: Align to AC, AU, SC, and SI family controls at the data plane.

**Operational Envelope.**
- Data SLAs SHALL be published per data product (freshness, completeness, availability).
- Quality signals SHALL be observable in V12 dashboards.
- Incidents affecting data products SHALL follow the incident management workflow ratified
  by V12 Chapter 47.

**Explicit Non-Goals.**
- This chapter does NOT define authorization semantics.
- This chapter does NOT define identity or session semantics.
- This chapter does NOT define encryption primitives or key custody.
- This chapter does NOT change any existing database object, RLS policy, or SECURITY DEFINER
  function.
- This chapter does NOT introduce or modify Edge Functions or React/TypeScript modules.

**Rollout Philosophy (When Implementation Is Later Approved).**
- Additive first: introduce new datasets, contracts, and pipelines alongside existing ones.
- Shadow before cutover: run new pipelines in parallel, compare with existing outputs.
- Fitness-gated promotion: only promote when quality, lineage, and SLO gates pass.
- Reversible by default: every change SHALL have a documented rollback per V11.


## Chapter 49 — Data Federation

**Purpose.** Query across heterogeneous stores without physical consolidation.

**Architecture.** Layered architecture composed of ingestion, storage, processing, governance, and consumption planes, aligned to the Enterprise Reference Architecture ratified in V11.

**ASCII Diagram.**
```text
[Producers] ─▶ [Contract] ─▶ [Pipeline] ─▶ [Storage] ─▶ [Serving] ─▶ [Consumers]
                     │                                     │
                     └────────── Governance / Lineage ─────┘
```

**Rules (RFC 2119).**
- Producers MUST publish schemas to the registry before emission.
- Consumers SHALL validate payloads against the registered schema.
- Breaking changes MUST NOT be released without a governance approval per V11.
- Sensitive fields MUST be classified per Chapter 25 (Data Classification).
- Lineage SHALL be captured for every transformation.

**Examples.**
- A `patient.registered` event carries `tenant_id`, `branch_id`, and a canonical `party_id`.
- The `invoice.line` dimension conforms to the enterprise `Money` type.
- The `appointment.no_show` fact links to `Party`, `Provider`, `Location`, and `Time` dimensions.

**Future Implementation Notes.** Reference the enterprise Canonical Data Model. Do not couple to vendor-specific storage semantics. Adopt open table formats where practical.

**Backward Compatibility Notes.** Additive only. Existing schemas, tables, RLS policies, and services continue to operate unchanged. No migration is prescribed.

**Security Notes.** Alignment with V10 Zero-Trust: least-privilege access to data planes, encryption at rest and in transit, and field-level classification enforced by policy.

**Performance Notes.** Sampling, partitioning, indexing, and materialization strategies SHOULD align with SLOs published in V12.

**Governance Notes.** Owned by the Enterprise Data Council under V11 ARB with domain-level stewards defined in Chapter 6 (Data Ownership).

**Extended Discussion.**
This chapter forms part of the ZMedico Enterprise Data Platform (EDP) architectural corpus.
It codifies the intent, boundaries, and interfaces of the concern without prescribing runtime
implementation. Where implementation is eventually undertaken, the Governance Workflow ratified
in V6 SHALL apply, and the architectural boundaries defined in V8, V9, V10, V11, and V12 SHALL
be respected. Nothing in this chapter changes application code, database schema, RLS policies,
SECURITY DEFINER functions, Edge Functions, generated types, tests, package manifests, or
infrastructure assets.

**Interfaces.**
- **To V8 Authorization.** All data access decisions remain authoritative under RLS and V8
  policies. This chapter MUST NOT be interpreted as altering those decisions.
- **To V9 Identity.** Principal identity, trust envelopes, and session semantics are owned by
  V9. This chapter consumes identity as a fact; it does not redefine it.
- **To V10 Security.** Encryption, key management, and sensitivity classification are governed
  by V10. This chapter aligns to those classifications without inventing new ones.
- **To V11 Governance.** All decisions arising from this chapter SHALL be routed through the
  ARB, ADR, and lifecycle mechanisms V11 defines.
- **To V12 Observability.** Data-plane telemetry (freshness, quality, lineage, throughput) is
  emitted through the observability signals V12 standardizes; V13 defines the semantics, V12
  defines the transport.

**Design Considerations.**
- Prefer *contract-first* design: producers publish schemas and semantics before any consumer
  couples to them.
- Prefer *open standards*: SQL, OpenAPI, AsyncAPI, JSON Schema, Avro, Parquet, Iceberg/Delta,
  OpenLineage, DCAT.
- Prefer *decentralized ownership with federated governance*: domain teams own products; a
  federated council owns policy.
- Prefer *bounded contexts*: cross-domain coupling flows through published contracts, not
  through shared physical tables.
- Prefer *evolvability*: schemas evolve with compatibility rules; consumers negotiate versions
  through the schema registry.

**Anti-Patterns to Avoid.**
- Shared mutable OLTP tables as an integration channel.
- Untyped, unversioned event payloads.
- Point-to-point pipelines with no lineage capture.
- Silent schema drift with no compatibility gate.
- Uncontrolled cross-tenant joins.

**Compliance Alignment.**
- **HIPAA**: Preserve minimum necessary access; PHI is handled per V10 classifications.
- **GDPR**: Preserve lawful basis and purpose limitation; enable subject rights.
- **ISO 27001**: Align to Annex A controls for information classification, cryptography, and
  supplier data handling.
- **NIST 800-53**: Align to AC, AU, SC, and SI family controls at the data plane.

**Operational Envelope.**
- Data SLAs SHALL be published per data product (freshness, completeness, availability).
- Quality signals SHALL be observable in V12 dashboards.
- Incidents affecting data products SHALL follow the incident management workflow ratified
  by V12 Chapter 47.

**Explicit Non-Goals.**
- This chapter does NOT define authorization semantics.
- This chapter does NOT define identity or session semantics.
- This chapter does NOT define encryption primitives or key custody.
- This chapter does NOT change any existing database object, RLS policy, or SECURITY DEFINER
  function.
- This chapter does NOT introduce or modify Edge Functions or React/TypeScript modules.

**Rollout Philosophy (When Implementation Is Later Approved).**
- Additive first: introduce new datasets, contracts, and pipelines alongside existing ones.
- Shadow before cutover: run new pipelines in parallel, compare with existing outputs.
- Fitness-gated promotion: only promote when quality, lineage, and SLO gates pass.
- Reversible by default: every change SHALL have a documented rollback per V11.


## Chapter 50 — Multi-Tenant Data Strategy

**Purpose.** Guarantee tenant isolation at row, storage, and compute layers.

**Architecture.** Layered architecture composed of ingestion, storage, processing, governance, and consumption planes, aligned to the Enterprise Reference Architecture ratified in V11.

**ASCII Diagram.**
```text
[Producers] ─▶ [Contract] ─▶ [Pipeline] ─▶ [Storage] ─▶ [Serving] ─▶ [Consumers]
                     │                                     │
                     └────────── Governance / Lineage ─────┘
```

**Rules (RFC 2119).**
- Producers MUST publish schemas to the registry before emission.
- Consumers SHALL validate payloads against the registered schema.
- Breaking changes MUST NOT be released without a governance approval per V11.
- Sensitive fields MUST be classified per Chapter 25 (Data Classification).
- Lineage SHALL be captured for every transformation.

**Examples.**
- A `patient.registered` event carries `tenant_id`, `branch_id`, and a canonical `party_id`.
- The `invoice.line` dimension conforms to the enterprise `Money` type.
- The `appointment.no_show` fact links to `Party`, `Provider`, `Location`, and `Time` dimensions.

**Future Implementation Notes.** Reference the enterprise Canonical Data Model. Do not couple to vendor-specific storage semantics. Adopt open table formats where practical.

**Backward Compatibility Notes.** Additive only. Existing schemas, tables, RLS policies, and services continue to operate unchanged. No migration is prescribed.

**Security Notes.** Alignment with V10 Zero-Trust: least-privilege access to data planes, encryption at rest and in transit, and field-level classification enforced by policy.

**Performance Notes.** Sampling, partitioning, indexing, and materialization strategies SHOULD align with SLOs published in V12.

**Governance Notes.** Owned by the Enterprise Data Council under V11 ARB with domain-level stewards defined in Chapter 6 (Data Ownership).

**Extended Discussion.**
This chapter forms part of the ZMedico Enterprise Data Platform (EDP) architectural corpus.
It codifies the intent, boundaries, and interfaces of the concern without prescribing runtime
implementation. Where implementation is eventually undertaken, the Governance Workflow ratified
in V6 SHALL apply, and the architectural boundaries defined in V8, V9, V10, V11, and V12 SHALL
be respected. Nothing in this chapter changes application code, database schema, RLS policies,
SECURITY DEFINER functions, Edge Functions, generated types, tests, package manifests, or
infrastructure assets.

**Interfaces.**
- **To V8 Authorization.** All data access decisions remain authoritative under RLS and V8
  policies. This chapter MUST NOT be interpreted as altering those decisions.
- **To V9 Identity.** Principal identity, trust envelopes, and session semantics are owned by
  V9. This chapter consumes identity as a fact; it does not redefine it.
- **To V10 Security.** Encryption, key management, and sensitivity classification are governed
  by V10. This chapter aligns to those classifications without inventing new ones.
- **To V11 Governance.** All decisions arising from this chapter SHALL be routed through the
  ARB, ADR, and lifecycle mechanisms V11 defines.
- **To V12 Observability.** Data-plane telemetry (freshness, quality, lineage, throughput) is
  emitted through the observability signals V12 standardizes; V13 defines the semantics, V12
  defines the transport.

**Design Considerations.**
- Prefer *contract-first* design: producers publish schemas and semantics before any consumer
  couples to them.
- Prefer *open standards*: SQL, OpenAPI, AsyncAPI, JSON Schema, Avro, Parquet, Iceberg/Delta,
  OpenLineage, DCAT.
- Prefer *decentralized ownership with federated governance*: domain teams own products; a
  federated council owns policy.
- Prefer *bounded contexts*: cross-domain coupling flows through published contracts, not
  through shared physical tables.
- Prefer *evolvability*: schemas evolve with compatibility rules; consumers negotiate versions
  through the schema registry.

**Anti-Patterns to Avoid.**
- Shared mutable OLTP tables as an integration channel.
- Untyped, unversioned event payloads.
- Point-to-point pipelines with no lineage capture.
- Silent schema drift with no compatibility gate.
- Uncontrolled cross-tenant joins.

**Compliance Alignment.**
- **HIPAA**: Preserve minimum necessary access; PHI is handled per V10 classifications.
- **GDPR**: Preserve lawful basis and purpose limitation; enable subject rights.
- **ISO 27001**: Align to Annex A controls for information classification, cryptography, and
  supplier data handling.
- **NIST 800-53**: Align to AC, AU, SC, and SI family controls at the data plane.

**Operational Envelope.**
- Data SLAs SHALL be published per data product (freshness, completeness, availability).
- Quality signals SHALL be observable in V12 dashboards.
- Incidents affecting data products SHALL follow the incident management workflow ratified
  by V12 Chapter 47.

**Explicit Non-Goals.**
- This chapter does NOT define authorization semantics.
- This chapter does NOT define identity or session semantics.
- This chapter does NOT define encryption primitives or key custody.
- This chapter does NOT change any existing database object, RLS policy, or SECURITY DEFINER
  function.
- This chapter does NOT introduce or modify Edge Functions or React/TypeScript modules.

**Rollout Philosophy (When Implementation Is Later Approved).**
- Additive first: introduce new datasets, contracts, and pipelines alongside existing ones.
- Shadow before cutover: run new pipelines in parallel, compare with existing outputs.
- Fitness-gated promotion: only promote when quality, lineage, and SLO gates pass.
- Reversible by default: every change SHALL have a documented rollback per V11.


## Chapter 51 — Branch Isolation Model

**Purpose.** Provide intra-tenant partitioning for physical locations.

**Architecture.** Layered architecture composed of ingestion, storage, processing, governance, and consumption planes, aligned to the Enterprise Reference Architecture ratified in V11.

**ASCII Diagram.**
```text
[Producers] ─▶ [Contract] ─▶ [Pipeline] ─▶ [Storage] ─▶ [Serving] ─▶ [Consumers]
                     │                                     │
                     └────────── Governance / Lineage ─────┘
```

**Rules (RFC 2119).**
- Producers MUST publish schemas to the registry before emission.
- Consumers SHALL validate payloads against the registered schema.
- Breaking changes MUST NOT be released without a governance approval per V11.
- Sensitive fields MUST be classified per Chapter 25 (Data Classification).
- Lineage SHALL be captured for every transformation.

**Examples.**
- A `patient.registered` event carries `tenant_id`, `branch_id`, and a canonical `party_id`.
- The `invoice.line` dimension conforms to the enterprise `Money` type.
- The `appointment.no_show` fact links to `Party`, `Provider`, `Location`, and `Time` dimensions.

**Future Implementation Notes.** Reference the enterprise Canonical Data Model. Do not couple to vendor-specific storage semantics. Adopt open table formats where practical.

**Backward Compatibility Notes.** Additive only. Existing schemas, tables, RLS policies, and services continue to operate unchanged. No migration is prescribed.

**Security Notes.** Alignment with V10 Zero-Trust: least-privilege access to data planes, encryption at rest and in transit, and field-level classification enforced by policy.

**Performance Notes.** Sampling, partitioning, indexing, and materialization strategies SHOULD align with SLOs published in V12.

**Governance Notes.** Owned by the Enterprise Data Council under V11 ARB with domain-level stewards defined in Chapter 6 (Data Ownership).

**Extended Discussion.**
This chapter forms part of the ZMedico Enterprise Data Platform (EDP) architectural corpus.
It codifies the intent, boundaries, and interfaces of the concern without prescribing runtime
implementation. Where implementation is eventually undertaken, the Governance Workflow ratified
in V6 SHALL apply, and the architectural boundaries defined in V8, V9, V10, V11, and V12 SHALL
be respected. Nothing in this chapter changes application code, database schema, RLS policies,
SECURITY DEFINER functions, Edge Functions, generated types, tests, package manifests, or
infrastructure assets.

**Interfaces.**
- **To V8 Authorization.** All data access decisions remain authoritative under RLS and V8
  policies. This chapter MUST NOT be interpreted as altering those decisions.
- **To V9 Identity.** Principal identity, trust envelopes, and session semantics are owned by
  V9. This chapter consumes identity as a fact; it does not redefine it.
- **To V10 Security.** Encryption, key management, and sensitivity classification are governed
  by V10. This chapter aligns to those classifications without inventing new ones.
- **To V11 Governance.** All decisions arising from this chapter SHALL be routed through the
  ARB, ADR, and lifecycle mechanisms V11 defines.
- **To V12 Observability.** Data-plane telemetry (freshness, quality, lineage, throughput) is
  emitted through the observability signals V12 standardizes; V13 defines the semantics, V12
  defines the transport.

**Design Considerations.**
- Prefer *contract-first* design: producers publish schemas and semantics before any consumer
  couples to them.
- Prefer *open standards*: SQL, OpenAPI, AsyncAPI, JSON Schema, Avro, Parquet, Iceberg/Delta,
  OpenLineage, DCAT.
- Prefer *decentralized ownership with federated governance*: domain teams own products; a
  federated council owns policy.
- Prefer *bounded contexts*: cross-domain coupling flows through published contracts, not
  through shared physical tables.
- Prefer *evolvability*: schemas evolve with compatibility rules; consumers negotiate versions
  through the schema registry.

**Anti-Patterns to Avoid.**
- Shared mutable OLTP tables as an integration channel.
- Untyped, unversioned event payloads.
- Point-to-point pipelines with no lineage capture.
- Silent schema drift with no compatibility gate.
- Uncontrolled cross-tenant joins.

**Compliance Alignment.**
- **HIPAA**: Preserve minimum necessary access; PHI is handled per V10 classifications.
- **GDPR**: Preserve lawful basis and purpose limitation; enable subject rights.
- **ISO 27001**: Align to Annex A controls for information classification, cryptography, and
  supplier data handling.
- **NIST 800-53**: Align to AC, AU, SC, and SI family controls at the data plane.

**Operational Envelope.**
- Data SLAs SHALL be published per data product (freshness, completeness, availability).
- Quality signals SHALL be observable in V12 dashboards.
- Incidents affecting data products SHALL follow the incident management workflow ratified
  by V12 Chapter 47.

**Explicit Non-Goals.**
- This chapter does NOT define authorization semantics.
- This chapter does NOT define identity or session semantics.
- This chapter does NOT define encryption primitives or key custody.
- This chapter does NOT change any existing database object, RLS policy, or SECURITY DEFINER
  function.
- This chapter does NOT introduce or modify Edge Functions or React/TypeScript modules.

**Rollout Philosophy (When Implementation Is Later Approved).**
- Additive first: introduce new datasets, contracts, and pipelines alongside existing ones.
- Shadow before cutover: run new pipelines in parallel, compare with existing outputs.
- Fitness-gated promotion: only promote when quality, lineage, and SLO gates pass.
- Reversible by default: every change SHALL have a documented rollback per V11.


## Chapter 52 — Cross-Tenant Analytics

**Purpose.** Enable aggregate analytics that provably preserve tenant boundaries.

**Architecture.** Layered architecture composed of ingestion, storage, processing, governance, and consumption planes, aligned to the Enterprise Reference Architecture ratified in V11.

**ASCII Diagram.**
```text
[Producers] ─▶ [Contract] ─▶ [Pipeline] ─▶ [Storage] ─▶ [Serving] ─▶ [Consumers]
                     │                                     │
                     └────────── Governance / Lineage ─────┘
```

**Rules (RFC 2119).**
- Producers MUST publish schemas to the registry before emission.
- Consumers SHALL validate payloads against the registered schema.
- Breaking changes MUST NOT be released without a governance approval per V11.
- Sensitive fields MUST be classified per Chapter 25 (Data Classification).
- Lineage SHALL be captured for every transformation.

**Examples.**
- A `patient.registered` event carries `tenant_id`, `branch_id`, and a canonical `party_id`.
- The `invoice.line` dimension conforms to the enterprise `Money` type.
- The `appointment.no_show` fact links to `Party`, `Provider`, `Location`, and `Time` dimensions.

**Future Implementation Notes.** Reference the enterprise Canonical Data Model. Do not couple to vendor-specific storage semantics. Adopt open table formats where practical.

**Backward Compatibility Notes.** Additive only. Existing schemas, tables, RLS policies, and services continue to operate unchanged. No migration is prescribed.

**Security Notes.** Alignment with V10 Zero-Trust: least-privilege access to data planes, encryption at rest and in transit, and field-level classification enforced by policy.

**Performance Notes.** Sampling, partitioning, indexing, and materialization strategies SHOULD align with SLOs published in V12.

**Governance Notes.** Owned by the Enterprise Data Council under V11 ARB with domain-level stewards defined in Chapter 6 (Data Ownership).

**Extended Discussion.**
This chapter forms part of the ZMedico Enterprise Data Platform (EDP) architectural corpus.
It codifies the intent, boundaries, and interfaces of the concern without prescribing runtime
implementation. Where implementation is eventually undertaken, the Governance Workflow ratified
in V6 SHALL apply, and the architectural boundaries defined in V8, V9, V10, V11, and V12 SHALL
be respected. Nothing in this chapter changes application code, database schema, RLS policies,
SECURITY DEFINER functions, Edge Functions, generated types, tests, package manifests, or
infrastructure assets.

**Interfaces.**
- **To V8 Authorization.** All data access decisions remain authoritative under RLS and V8
  policies. This chapter MUST NOT be interpreted as altering those decisions.
- **To V9 Identity.** Principal identity, trust envelopes, and session semantics are owned by
  V9. This chapter consumes identity as a fact; it does not redefine it.
- **To V10 Security.** Encryption, key management, and sensitivity classification are governed
  by V10. This chapter aligns to those classifications without inventing new ones.
- **To V11 Governance.** All decisions arising from this chapter SHALL be routed through the
  ARB, ADR, and lifecycle mechanisms V11 defines.
- **To V12 Observability.** Data-plane telemetry (freshness, quality, lineage, throughput) is
  emitted through the observability signals V12 standardizes; V13 defines the semantics, V12
  defines the transport.

**Design Considerations.**
- Prefer *contract-first* design: producers publish schemas and semantics before any consumer
  couples to them.
- Prefer *open standards*: SQL, OpenAPI, AsyncAPI, JSON Schema, Avro, Parquet, Iceberg/Delta,
  OpenLineage, DCAT.
- Prefer *decentralized ownership with federated governance*: domain teams own products; a
  federated council owns policy.
- Prefer *bounded contexts*: cross-domain coupling flows through published contracts, not
  through shared physical tables.
- Prefer *evolvability*: schemas evolve with compatibility rules; consumers negotiate versions
  through the schema registry.

**Anti-Patterns to Avoid.**
- Shared mutable OLTP tables as an integration channel.
- Untyped, unversioned event payloads.
- Point-to-point pipelines with no lineage capture.
- Silent schema drift with no compatibility gate.
- Uncontrolled cross-tenant joins.

**Compliance Alignment.**
- **HIPAA**: Preserve minimum necessary access; PHI is handled per V10 classifications.
- **GDPR**: Preserve lawful basis and purpose limitation; enable subject rights.
- **ISO 27001**: Align to Annex A controls for information classification, cryptography, and
  supplier data handling.
- **NIST 800-53**: Align to AC, AU, SC, and SI family controls at the data plane.

**Operational Envelope.**
- Data SLAs SHALL be published per data product (freshness, completeness, availability).
- Quality signals SHALL be observable in V12 dashboards.
- Incidents affecting data products SHALL follow the incident management workflow ratified
  by V12 Chapter 47.

**Explicit Non-Goals.**
- This chapter does NOT define authorization semantics.
- This chapter does NOT define identity or session semantics.
- This chapter does NOT define encryption primitives or key custody.
- This chapter does NOT change any existing database object, RLS policy, or SECURITY DEFINER
  function.
- This chapter does NOT introduce or modify Edge Functions or React/TypeScript modules.

**Rollout Philosophy (When Implementation Is Later Approved).**
- Additive first: introduce new datasets, contracts, and pipelines alongside existing ones.
- Shadow before cutover: run new pipelines in parallel, compare with existing outputs.
- Fitness-gated promotion: only promote when quality, lineage, and SLO gates pass.
- Reversible by default: every change SHALL have a documented rollback per V11.


## Chapter 53 — Backup Data Architecture

**Purpose.** Guarantee recoverability of all enterprise data at defined RPO/RTO.

**Architecture.** Layered architecture composed of ingestion, storage, processing, governance, and consumption planes, aligned to the Enterprise Reference Architecture ratified in V11.

**ASCII Diagram.**
```text
[Producers] ─▶ [Contract] ─▶ [Pipeline] ─▶ [Storage] ─▶ [Serving] ─▶ [Consumers]
                     │                                     │
                     └────────── Governance / Lineage ─────┘
```

**Rules (RFC 2119).**
- Producers MUST publish schemas to the registry before emission.
- Consumers SHALL validate payloads against the registered schema.
- Breaking changes MUST NOT be released without a governance approval per V11.
- Sensitive fields MUST be classified per Chapter 25 (Data Classification).
- Lineage SHALL be captured for every transformation.

**Examples.**
- A `patient.registered` event carries `tenant_id`, `branch_id`, and a canonical `party_id`.
- The `invoice.line` dimension conforms to the enterprise `Money` type.
- The `appointment.no_show` fact links to `Party`, `Provider`, `Location`, and `Time` dimensions.

**Future Implementation Notes.** Reference the enterprise Canonical Data Model. Do not couple to vendor-specific storage semantics. Adopt open table formats where practical.

**Backward Compatibility Notes.** Additive only. Existing schemas, tables, RLS policies, and services continue to operate unchanged. No migration is prescribed.

**Security Notes.** Alignment with V10 Zero-Trust: least-privilege access to data planes, encryption at rest and in transit, and field-level classification enforced by policy.

**Performance Notes.** Sampling, partitioning, indexing, and materialization strategies SHOULD align with SLOs published in V12.

**Governance Notes.** Owned by the Enterprise Data Council under V11 ARB with domain-level stewards defined in Chapter 6 (Data Ownership).

**Extended Discussion.**
This chapter forms part of the ZMedico Enterprise Data Platform (EDP) architectural corpus.
It codifies the intent, boundaries, and interfaces of the concern without prescribing runtime
implementation. Where implementation is eventually undertaken, the Governance Workflow ratified
in V6 SHALL apply, and the architectural boundaries defined in V8, V9, V10, V11, and V12 SHALL
be respected. Nothing in this chapter changes application code, database schema, RLS policies,
SECURITY DEFINER functions, Edge Functions, generated types, tests, package manifests, or
infrastructure assets.

**Interfaces.**
- **To V8 Authorization.** All data access decisions remain authoritative under RLS and V8
  policies. This chapter MUST NOT be interpreted as altering those decisions.
- **To V9 Identity.** Principal identity, trust envelopes, and session semantics are owned by
  V9. This chapter consumes identity as a fact; it does not redefine it.
- **To V10 Security.** Encryption, key management, and sensitivity classification are governed
  by V10. This chapter aligns to those classifications without inventing new ones.
- **To V11 Governance.** All decisions arising from this chapter SHALL be routed through the
  ARB, ADR, and lifecycle mechanisms V11 defines.
- **To V12 Observability.** Data-plane telemetry (freshness, quality, lineage, throughput) is
  emitted through the observability signals V12 standardizes; V13 defines the semantics, V12
  defines the transport.

**Design Considerations.**
- Prefer *contract-first* design: producers publish schemas and semantics before any consumer
  couples to them.
- Prefer *open standards*: SQL, OpenAPI, AsyncAPI, JSON Schema, Avro, Parquet, Iceberg/Delta,
  OpenLineage, DCAT.
- Prefer *decentralized ownership with federated governance*: domain teams own products; a
  federated council owns policy.
- Prefer *bounded contexts*: cross-domain coupling flows through published contracts, not
  through shared physical tables.
- Prefer *evolvability*: schemas evolve with compatibility rules; consumers negotiate versions
  through the schema registry.

**Anti-Patterns to Avoid.**
- Shared mutable OLTP tables as an integration channel.
- Untyped, unversioned event payloads.
- Point-to-point pipelines with no lineage capture.
- Silent schema drift with no compatibility gate.
- Uncontrolled cross-tenant joins.

**Compliance Alignment.**
- **HIPAA**: Preserve minimum necessary access; PHI is handled per V10 classifications.
- **GDPR**: Preserve lawful basis and purpose limitation; enable subject rights.
- **ISO 27001**: Align to Annex A controls for information classification, cryptography, and
  supplier data handling.
- **NIST 800-53**: Align to AC, AU, SC, and SI family controls at the data plane.

**Operational Envelope.**
- Data SLAs SHALL be published per data product (freshness, completeness, availability).
- Quality signals SHALL be observable in V12 dashboards.
- Incidents affecting data products SHALL follow the incident management workflow ratified
  by V12 Chapter 47.

**Explicit Non-Goals.**
- This chapter does NOT define authorization semantics.
- This chapter does NOT define identity or session semantics.
- This chapter does NOT define encryption primitives or key custody.
- This chapter does NOT change any existing database object, RLS policy, or SECURITY DEFINER
  function.
- This chapter does NOT introduce or modify Edge Functions or React/TypeScript modules.

**Rollout Philosophy (When Implementation Is Later Approved).**
- Additive first: introduce new datasets, contracts, and pipelines alongside existing ones.
- Shadow before cutover: run new pipelines in parallel, compare with existing outputs.
- Fitness-gated promotion: only promote when quality, lineage, and SLO gates pass.
- Reversible by default: every change SHALL have a documented rollback per V11.


## Chapter 54 — Disaster Recovery Data

**Purpose.** Ensure data-plane continuity during regional or platform failure.

**Architecture.** Layered architecture composed of ingestion, storage, processing, governance, and consumption planes, aligned to the Enterprise Reference Architecture ratified in V11.

**ASCII Diagram.**
```text
[Producers] ─▶ [Contract] ─▶ [Pipeline] ─▶ [Storage] ─▶ [Serving] ─▶ [Consumers]
                     │                                     │
                     └────────── Governance / Lineage ─────┘
```

**Rules (RFC 2119).**
- Producers MUST publish schemas to the registry before emission.
- Consumers SHALL validate payloads against the registered schema.
- Breaking changes MUST NOT be released without a governance approval per V11.
- Sensitive fields MUST be classified per Chapter 25 (Data Classification).
- Lineage SHALL be captured for every transformation.

**Examples.**
- A `patient.registered` event carries `tenant_id`, `branch_id`, and a canonical `party_id`.
- The `invoice.line` dimension conforms to the enterprise `Money` type.
- The `appointment.no_show` fact links to `Party`, `Provider`, `Location`, and `Time` dimensions.

**Future Implementation Notes.** Reference the enterprise Canonical Data Model. Do not couple to vendor-specific storage semantics. Adopt open table formats where practical.

**Backward Compatibility Notes.** Additive only. Existing schemas, tables, RLS policies, and services continue to operate unchanged. No migration is prescribed.

**Security Notes.** Alignment with V10 Zero-Trust: least-privilege access to data planes, encryption at rest and in transit, and field-level classification enforced by policy.

**Performance Notes.** Sampling, partitioning, indexing, and materialization strategies SHOULD align with SLOs published in V12.

**Governance Notes.** Owned by the Enterprise Data Council under V11 ARB with domain-level stewards defined in Chapter 6 (Data Ownership).

**Extended Discussion.**
This chapter forms part of the ZMedico Enterprise Data Platform (EDP) architectural corpus.
It codifies the intent, boundaries, and interfaces of the concern without prescribing runtime
implementation. Where implementation is eventually undertaken, the Governance Workflow ratified
in V6 SHALL apply, and the architectural boundaries defined in V8, V9, V10, V11, and V12 SHALL
be respected. Nothing in this chapter changes application code, database schema, RLS policies,
SECURITY DEFINER functions, Edge Functions, generated types, tests, package manifests, or
infrastructure assets.

**Interfaces.**
- **To V8 Authorization.** All data access decisions remain authoritative under RLS and V8
  policies. This chapter MUST NOT be interpreted as altering those decisions.
- **To V9 Identity.** Principal identity, trust envelopes, and session semantics are owned by
  V9. This chapter consumes identity as a fact; it does not redefine it.
- **To V10 Security.** Encryption, key management, and sensitivity classification are governed
  by V10. This chapter aligns to those classifications without inventing new ones.
- **To V11 Governance.** All decisions arising from this chapter SHALL be routed through the
  ARB, ADR, and lifecycle mechanisms V11 defines.
- **To V12 Observability.** Data-plane telemetry (freshness, quality, lineage, throughput) is
  emitted through the observability signals V12 standardizes; V13 defines the semantics, V12
  defines the transport.

**Design Considerations.**
- Prefer *contract-first* design: producers publish schemas and semantics before any consumer
  couples to them.
- Prefer *open standards*: SQL, OpenAPI, AsyncAPI, JSON Schema, Avro, Parquet, Iceberg/Delta,
  OpenLineage, DCAT.
- Prefer *decentralized ownership with federated governance*: domain teams own products; a
  federated council owns policy.
- Prefer *bounded contexts*: cross-domain coupling flows through published contracts, not
  through shared physical tables.
- Prefer *evolvability*: schemas evolve with compatibility rules; consumers negotiate versions
  through the schema registry.

**Anti-Patterns to Avoid.**
- Shared mutable OLTP tables as an integration channel.
- Untyped, unversioned event payloads.
- Point-to-point pipelines with no lineage capture.
- Silent schema drift with no compatibility gate.
- Uncontrolled cross-tenant joins.

**Compliance Alignment.**
- **HIPAA**: Preserve minimum necessary access; PHI is handled per V10 classifications.
- **GDPR**: Preserve lawful basis and purpose limitation; enable subject rights.
- **ISO 27001**: Align to Annex A controls for information classification, cryptography, and
  supplier data handling.
- **NIST 800-53**: Align to AC, AU, SC, and SI family controls at the data plane.

**Operational Envelope.**
- Data SLAs SHALL be published per data product (freshness, completeness, availability).
- Quality signals SHALL be observable in V12 dashboards.
- Incidents affecting data products SHALL follow the incident management workflow ratified
  by V12 Chapter 47.

**Explicit Non-Goals.**
- This chapter does NOT define authorization semantics.
- This chapter does NOT define identity or session semantics.
- This chapter does NOT define encryption primitives or key custody.
- This chapter does NOT change any existing database object, RLS policy, or SECURITY DEFINER
  function.
- This chapter does NOT introduce or modify Edge Functions or React/TypeScript modules.

**Rollout Philosophy (When Implementation Is Later Approved).**
- Additive first: introduce new datasets, contracts, and pipelines alongside existing ones.
- Shadow before cutover: run new pipelines in parallel, compare with existing outputs.
- Fitness-gated promotion: only promote when quality, lineage, and SLO gates pass.
- Reversible by default: every change SHALL have a documented rollback per V11.


## Chapter 55 — Data Compliance Framework

**Purpose.** Map enterprise controls to regulatory obligations.

**Architecture.** Layered architecture composed of ingestion, storage, processing, governance, and consumption planes, aligned to the Enterprise Reference Architecture ratified in V11.

**ASCII Diagram.**
```text
[Producers] ─▶ [Contract] ─▶ [Pipeline] ─▶ [Storage] ─▶ [Serving] ─▶ [Consumers]
                     │                                     │
                     └────────── Governance / Lineage ─────┘
```

**Rules (RFC 2119).**
- Producers MUST publish schemas to the registry before emission.
- Consumers SHALL validate payloads against the registered schema.
- Breaking changes MUST NOT be released without a governance approval per V11.
- Sensitive fields MUST be classified per Chapter 25 (Data Classification).
- Lineage SHALL be captured for every transformation.

**Examples.**
- A `patient.registered` event carries `tenant_id`, `branch_id`, and a canonical `party_id`.
- The `invoice.line` dimension conforms to the enterprise `Money` type.
- The `appointment.no_show` fact links to `Party`, `Provider`, `Location`, and `Time` dimensions.

**Future Implementation Notes.** Reference the enterprise Canonical Data Model. Do not couple to vendor-specific storage semantics. Adopt open table formats where practical.

**Backward Compatibility Notes.** Additive only. Existing schemas, tables, RLS policies, and services continue to operate unchanged. No migration is prescribed.

**Security Notes.** Alignment with V10 Zero-Trust: least-privilege access to data planes, encryption at rest and in transit, and field-level classification enforced by policy.

**Performance Notes.** Sampling, partitioning, indexing, and materialization strategies SHOULD align with SLOs published in V12.

**Governance Notes.** Owned by the Enterprise Data Council under V11 ARB with domain-level stewards defined in Chapter 6 (Data Ownership).

**Extended Discussion.**
This chapter forms part of the ZMedico Enterprise Data Platform (EDP) architectural corpus.
It codifies the intent, boundaries, and interfaces of the concern without prescribing runtime
implementation. Where implementation is eventually undertaken, the Governance Workflow ratified
in V6 SHALL apply, and the architectural boundaries defined in V8, V9, V10, V11, and V12 SHALL
be respected. Nothing in this chapter changes application code, database schema, RLS policies,
SECURITY DEFINER functions, Edge Functions, generated types, tests, package manifests, or
infrastructure assets.

**Interfaces.**
- **To V8 Authorization.** All data access decisions remain authoritative under RLS and V8
  policies. This chapter MUST NOT be interpreted as altering those decisions.
- **To V9 Identity.** Principal identity, trust envelopes, and session semantics are owned by
  V9. This chapter consumes identity as a fact; it does not redefine it.
- **To V10 Security.** Encryption, key management, and sensitivity classification are governed
  by V10. This chapter aligns to those classifications without inventing new ones.
- **To V11 Governance.** All decisions arising from this chapter SHALL be routed through the
  ARB, ADR, and lifecycle mechanisms V11 defines.
- **To V12 Observability.** Data-plane telemetry (freshness, quality, lineage, throughput) is
  emitted through the observability signals V12 standardizes; V13 defines the semantics, V12
  defines the transport.

**Design Considerations.**
- Prefer *contract-first* design: producers publish schemas and semantics before any consumer
  couples to them.
- Prefer *open standards*: SQL, OpenAPI, AsyncAPI, JSON Schema, Avro, Parquet, Iceberg/Delta,
  OpenLineage, DCAT.
- Prefer *decentralized ownership with federated governance*: domain teams own products; a
  federated council owns policy.
- Prefer *bounded contexts*: cross-domain coupling flows through published contracts, not
  through shared physical tables.
- Prefer *evolvability*: schemas evolve with compatibility rules; consumers negotiate versions
  through the schema registry.

**Anti-Patterns to Avoid.**
- Shared mutable OLTP tables as an integration channel.
- Untyped, unversioned event payloads.
- Point-to-point pipelines with no lineage capture.
- Silent schema drift with no compatibility gate.
- Uncontrolled cross-tenant joins.

**Compliance Alignment.**
- **HIPAA**: Preserve minimum necessary access; PHI is handled per V10 classifications.
- **GDPR**: Preserve lawful basis and purpose limitation; enable subject rights.
- **ISO 27001**: Align to Annex A controls for information classification, cryptography, and
  supplier data handling.
- **NIST 800-53**: Align to AC, AU, SC, and SI family controls at the data plane.

**Operational Envelope.**
- Data SLAs SHALL be published per data product (freshness, completeness, availability).
- Quality signals SHALL be observable in V12 dashboards.
- Incidents affecting data products SHALL follow the incident management workflow ratified
  by V12 Chapter 47.

**Explicit Non-Goals.**
- This chapter does NOT define authorization semantics.
- This chapter does NOT define identity or session semantics.
- This chapter does NOT define encryption primitives or key custody.
- This chapter does NOT change any existing database object, RLS policy, or SECURITY DEFINER
  function.
- This chapter does NOT introduce or modify Edge Functions or React/TypeScript modules.

**Rollout Philosophy (When Implementation Is Later Approved).**
- Additive first: introduce new datasets, contracts, and pipelines alongside existing ones.
- Shadow before cutover: run new pipelines in parallel, compare with existing outputs.
- Fitness-gated promotion: only promote when quality, lineage, and SLO gates pass.
- Reversible by default: every change SHALL have a documented rollback per V11.


## Chapter 56 — HIPAA Mapping

**Purpose.** Map data controls to HIPAA Privacy and Security Rules.

**Architecture.** Layered architecture composed of ingestion, storage, processing, governance, and consumption planes, aligned to the Enterprise Reference Architecture ratified in V11.

**ASCII Diagram.**
```text
[Producers] ─▶ [Contract] ─▶ [Pipeline] ─▶ [Storage] ─▶ [Serving] ─▶ [Consumers]
                     │                                     │
                     └────────── Governance / Lineage ─────┘
```

**Rules (RFC 2119).**
- Producers MUST publish schemas to the registry before emission.
- Consumers SHALL validate payloads against the registered schema.
- Breaking changes MUST NOT be released without a governance approval per V11.
- Sensitive fields MUST be classified per Chapter 25 (Data Classification).
- Lineage SHALL be captured for every transformation.

**Examples.**
- A `patient.registered` event carries `tenant_id`, `branch_id`, and a canonical `party_id`.
- The `invoice.line` dimension conforms to the enterprise `Money` type.
- The `appointment.no_show` fact links to `Party`, `Provider`, `Location`, and `Time` dimensions.

**Future Implementation Notes.** Reference the enterprise Canonical Data Model. Do not couple to vendor-specific storage semantics. Adopt open table formats where practical.

**Backward Compatibility Notes.** Additive only. Existing schemas, tables, RLS policies, and services continue to operate unchanged. No migration is prescribed.

**Security Notes.** Alignment with V10 Zero-Trust: least-privilege access to data planes, encryption at rest and in transit, and field-level classification enforced by policy.

**Performance Notes.** Sampling, partitioning, indexing, and materialization strategies SHOULD align with SLOs published in V12.

**Governance Notes.** Owned by the Enterprise Data Council under V11 ARB with domain-level stewards defined in Chapter 6 (Data Ownership).

**Extended Discussion.**
This chapter forms part of the ZMedico Enterprise Data Platform (EDP) architectural corpus.
It codifies the intent, boundaries, and interfaces of the concern without prescribing runtime
implementation. Where implementation is eventually undertaken, the Governance Workflow ratified
in V6 SHALL apply, and the architectural boundaries defined in V8, V9, V10, V11, and V12 SHALL
be respected. Nothing in this chapter changes application code, database schema, RLS policies,
SECURITY DEFINER functions, Edge Functions, generated types, tests, package manifests, or
infrastructure assets.

**Interfaces.**
- **To V8 Authorization.** All data access decisions remain authoritative under RLS and V8
  policies. This chapter MUST NOT be interpreted as altering those decisions.
- **To V9 Identity.** Principal identity, trust envelopes, and session semantics are owned by
  V9. This chapter consumes identity as a fact; it does not redefine it.
- **To V10 Security.** Encryption, key management, and sensitivity classification are governed
  by V10. This chapter aligns to those classifications without inventing new ones.
- **To V11 Governance.** All decisions arising from this chapter SHALL be routed through the
  ARB, ADR, and lifecycle mechanisms V11 defines.
- **To V12 Observability.** Data-plane telemetry (freshness, quality, lineage, throughput) is
  emitted through the observability signals V12 standardizes; V13 defines the semantics, V12
  defines the transport.

**Design Considerations.**
- Prefer *contract-first* design: producers publish schemas and semantics before any consumer
  couples to them.
- Prefer *open standards*: SQL, OpenAPI, AsyncAPI, JSON Schema, Avro, Parquet, Iceberg/Delta,
  OpenLineage, DCAT.
- Prefer *decentralized ownership with federated governance*: domain teams own products; a
  federated council owns policy.
- Prefer *bounded contexts*: cross-domain coupling flows through published contracts, not
  through shared physical tables.
- Prefer *evolvability*: schemas evolve with compatibility rules; consumers negotiate versions
  through the schema registry.

**Anti-Patterns to Avoid.**
- Shared mutable OLTP tables as an integration channel.
- Untyped, unversioned event payloads.
- Point-to-point pipelines with no lineage capture.
- Silent schema drift with no compatibility gate.
- Uncontrolled cross-tenant joins.

**Compliance Alignment.**
- **HIPAA**: Preserve minimum necessary access; PHI is handled per V10 classifications.
- **GDPR**: Preserve lawful basis and purpose limitation; enable subject rights.
- **ISO 27001**: Align to Annex A controls for information classification, cryptography, and
  supplier data handling.
- **NIST 800-53**: Align to AC, AU, SC, and SI family controls at the data plane.

**Operational Envelope.**
- Data SLAs SHALL be published per data product (freshness, completeness, availability).
- Quality signals SHALL be observable in V12 dashboards.
- Incidents affecting data products SHALL follow the incident management workflow ratified
  by V12 Chapter 47.

**Explicit Non-Goals.**
- This chapter does NOT define authorization semantics.
- This chapter does NOT define identity or session semantics.
- This chapter does NOT define encryption primitives or key custody.
- This chapter does NOT change any existing database object, RLS policy, or SECURITY DEFINER
  function.
- This chapter does NOT introduce or modify Edge Functions or React/TypeScript modules.

**Rollout Philosophy (When Implementation Is Later Approved).**
- Additive first: introduce new datasets, contracts, and pipelines alongside existing ones.
- Shadow before cutover: run new pipelines in parallel, compare with existing outputs.
- Fitness-gated promotion: only promote when quality, lineage, and SLO gates pass.
- Reversible by default: every change SHALL have a documented rollback per V11.


## Chapter 57 — GDPR Mapping

**Purpose.** Map data controls to GDPR articles.

**Architecture.** Layered architecture composed of ingestion, storage, processing, governance, and consumption planes, aligned to the Enterprise Reference Architecture ratified in V11.

**ASCII Diagram.**
```text
[Producers] ─▶ [Contract] ─▶ [Pipeline] ─▶ [Storage] ─▶ [Serving] ─▶ [Consumers]
                     │                                     │
                     └────────── Governance / Lineage ─────┘
```

**Rules (RFC 2119).**
- Producers MUST publish schemas to the registry before emission.
- Consumers SHALL validate payloads against the registered schema.
- Breaking changes MUST NOT be released without a governance approval per V11.
- Sensitive fields MUST be classified per Chapter 25 (Data Classification).
- Lineage SHALL be captured for every transformation.

**Examples.**
- A `patient.registered` event carries `tenant_id`, `branch_id`, and a canonical `party_id`.
- The `invoice.line` dimension conforms to the enterprise `Money` type.
- The `appointment.no_show` fact links to `Party`, `Provider`, `Location`, and `Time` dimensions.

**Future Implementation Notes.** Reference the enterprise Canonical Data Model. Do not couple to vendor-specific storage semantics. Adopt open table formats where practical.

**Backward Compatibility Notes.** Additive only. Existing schemas, tables, RLS policies, and services continue to operate unchanged. No migration is prescribed.

**Security Notes.** Alignment with V10 Zero-Trust: least-privilege access to data planes, encryption at rest and in transit, and field-level classification enforced by policy.

**Performance Notes.** Sampling, partitioning, indexing, and materialization strategies SHOULD align with SLOs published in V12.

**Governance Notes.** Owned by the Enterprise Data Council under V11 ARB with domain-level stewards defined in Chapter 6 (Data Ownership).

**Extended Discussion.**
This chapter forms part of the ZMedico Enterprise Data Platform (EDP) architectural corpus.
It codifies the intent, boundaries, and interfaces of the concern without prescribing runtime
implementation. Where implementation is eventually undertaken, the Governance Workflow ratified
in V6 SHALL apply, and the architectural boundaries defined in V8, V9, V10, V11, and V12 SHALL
be respected. Nothing in this chapter changes application code, database schema, RLS policies,
SECURITY DEFINER functions, Edge Functions, generated types, tests, package manifests, or
infrastructure assets.

**Interfaces.**
- **To V8 Authorization.** All data access decisions remain authoritative under RLS and V8
  policies. This chapter MUST NOT be interpreted as altering those decisions.
- **To V9 Identity.** Principal identity, trust envelopes, and session semantics are owned by
  V9. This chapter consumes identity as a fact; it does not redefine it.
- **To V10 Security.** Encryption, key management, and sensitivity classification are governed
  by V10. This chapter aligns to those classifications without inventing new ones.
- **To V11 Governance.** All decisions arising from this chapter SHALL be routed through the
  ARB, ADR, and lifecycle mechanisms V11 defines.
- **To V12 Observability.** Data-plane telemetry (freshness, quality, lineage, throughput) is
  emitted through the observability signals V12 standardizes; V13 defines the semantics, V12
  defines the transport.

**Design Considerations.**
- Prefer *contract-first* design: producers publish schemas and semantics before any consumer
  couples to them.
- Prefer *open standards*: SQL, OpenAPI, AsyncAPI, JSON Schema, Avro, Parquet, Iceberg/Delta,
  OpenLineage, DCAT.
- Prefer *decentralized ownership with federated governance*: domain teams own products; a
  federated council owns policy.
- Prefer *bounded contexts*: cross-domain coupling flows through published contracts, not
  through shared physical tables.
- Prefer *evolvability*: schemas evolve with compatibility rules; consumers negotiate versions
  through the schema registry.

**Anti-Patterns to Avoid.**
- Shared mutable OLTP tables as an integration channel.
- Untyped, unversioned event payloads.
- Point-to-point pipelines with no lineage capture.
- Silent schema drift with no compatibility gate.
- Uncontrolled cross-tenant joins.

**Compliance Alignment.**
- **HIPAA**: Preserve minimum necessary access; PHI is handled per V10 classifications.
- **GDPR**: Preserve lawful basis and purpose limitation; enable subject rights.
- **ISO 27001**: Align to Annex A controls for information classification, cryptography, and
  supplier data handling.
- **NIST 800-53**: Align to AC, AU, SC, and SI family controls at the data plane.

**Operational Envelope.**
- Data SLAs SHALL be published per data product (freshness, completeness, availability).
- Quality signals SHALL be observable in V12 dashboards.
- Incidents affecting data products SHALL follow the incident management workflow ratified
  by V12 Chapter 47.

**Explicit Non-Goals.**
- This chapter does NOT define authorization semantics.
- This chapter does NOT define identity or session semantics.
- This chapter does NOT define encryption primitives or key custody.
- This chapter does NOT change any existing database object, RLS policy, or SECURITY DEFINER
  function.
- This chapter does NOT introduce or modify Edge Functions or React/TypeScript modules.

**Rollout Philosophy (When Implementation Is Later Approved).**
- Additive first: introduce new datasets, contracts, and pipelines alongside existing ones.
- Shadow before cutover: run new pipelines in parallel, compare with existing outputs.
- Fitness-gated promotion: only promote when quality, lineage, and SLO gates pass.
- Reversible by default: every change SHALL have a documented rollback per V11.


## Chapter 58 — ISO 27001 Data Mapping

**Purpose.** Map data controls to ISO 27001 Annex A.

**Architecture.** Layered architecture composed of ingestion, storage, processing, governance, and consumption planes, aligned to the Enterprise Reference Architecture ratified in V11.

**ASCII Diagram.**
```text
[Producers] ─▶ [Contract] ─▶ [Pipeline] ─▶ [Storage] ─▶ [Serving] ─▶ [Consumers]
                     │                                     │
                     └────────── Governance / Lineage ─────┘
```

**Rules (RFC 2119).**
- Producers MUST publish schemas to the registry before emission.
- Consumers SHALL validate payloads against the registered schema.
- Breaking changes MUST NOT be released without a governance approval per V11.
- Sensitive fields MUST be classified per Chapter 25 (Data Classification).
- Lineage SHALL be captured for every transformation.

**Examples.**
- A `patient.registered` event carries `tenant_id`, `branch_id`, and a canonical `party_id`.
- The `invoice.line` dimension conforms to the enterprise `Money` type.
- The `appointment.no_show` fact links to `Party`, `Provider`, `Location`, and `Time` dimensions.

**Future Implementation Notes.** Reference the enterprise Canonical Data Model. Do not couple to vendor-specific storage semantics. Adopt open table formats where practical.

**Backward Compatibility Notes.** Additive only. Existing schemas, tables, RLS policies, and services continue to operate unchanged. No migration is prescribed.

**Security Notes.** Alignment with V10 Zero-Trust: least-privilege access to data planes, encryption at rest and in transit, and field-level classification enforced by policy.

**Performance Notes.** Sampling, partitioning, indexing, and materialization strategies SHOULD align with SLOs published in V12.

**Governance Notes.** Owned by the Enterprise Data Council under V11 ARB with domain-level stewards defined in Chapter 6 (Data Ownership).

**Extended Discussion.**
This chapter forms part of the ZMedico Enterprise Data Platform (EDP) architectural corpus.
It codifies the intent, boundaries, and interfaces of the concern without prescribing runtime
implementation. Where implementation is eventually undertaken, the Governance Workflow ratified
in V6 SHALL apply, and the architectural boundaries defined in V8, V9, V10, V11, and V12 SHALL
be respected. Nothing in this chapter changes application code, database schema, RLS policies,
SECURITY DEFINER functions, Edge Functions, generated types, tests, package manifests, or
infrastructure assets.

**Interfaces.**
- **To V8 Authorization.** All data access decisions remain authoritative under RLS and V8
  policies. This chapter MUST NOT be interpreted as altering those decisions.
- **To V9 Identity.** Principal identity, trust envelopes, and session semantics are owned by
  V9. This chapter consumes identity as a fact; it does not redefine it.
- **To V10 Security.** Encryption, key management, and sensitivity classification are governed
  by V10. This chapter aligns to those classifications without inventing new ones.
- **To V11 Governance.** All decisions arising from this chapter SHALL be routed through the
  ARB, ADR, and lifecycle mechanisms V11 defines.
- **To V12 Observability.** Data-plane telemetry (freshness, quality, lineage, throughput) is
  emitted through the observability signals V12 standardizes; V13 defines the semantics, V12
  defines the transport.

**Design Considerations.**
- Prefer *contract-first* design: producers publish schemas and semantics before any consumer
  couples to them.
- Prefer *open standards*: SQL, OpenAPI, AsyncAPI, JSON Schema, Avro, Parquet, Iceberg/Delta,
  OpenLineage, DCAT.
- Prefer *decentralized ownership with federated governance*: domain teams own products; a
  federated council owns policy.
- Prefer *bounded contexts*: cross-domain coupling flows through published contracts, not
  through shared physical tables.
- Prefer *evolvability*: schemas evolve with compatibility rules; consumers negotiate versions
  through the schema registry.

**Anti-Patterns to Avoid.**
- Shared mutable OLTP tables as an integration channel.
- Untyped, unversioned event payloads.
- Point-to-point pipelines with no lineage capture.
- Silent schema drift with no compatibility gate.
- Uncontrolled cross-tenant joins.

**Compliance Alignment.**
- **HIPAA**: Preserve minimum necessary access; PHI is handled per V10 classifications.
- **GDPR**: Preserve lawful basis and purpose limitation; enable subject rights.
- **ISO 27001**: Align to Annex A controls for information classification, cryptography, and
  supplier data handling.
- **NIST 800-53**: Align to AC, AU, SC, and SI family controls at the data plane.

**Operational Envelope.**
- Data SLAs SHALL be published per data product (freshness, completeness, availability).
- Quality signals SHALL be observable in V12 dashboards.
- Incidents affecting data products SHALL follow the incident management workflow ratified
  by V12 Chapter 47.

**Explicit Non-Goals.**
- This chapter does NOT define authorization semantics.
- This chapter does NOT define identity or session semantics.
- This chapter does NOT define encryption primitives or key custody.
- This chapter does NOT change any existing database object, RLS policy, or SECURITY DEFINER
  function.
- This chapter does NOT introduce or modify Edge Functions or React/TypeScript modules.

**Rollout Philosophy (When Implementation Is Later Approved).**
- Additive first: introduce new datasets, contracts, and pipelines alongside existing ones.
- Shadow before cutover: run new pipelines in parallel, compare with existing outputs.
- Fitness-gated promotion: only promote when quality, lineage, and SLO gates pass.
- Reversible by default: every change SHALL have a documented rollback per V11.


## Chapter 59 — NIST Data Mapping

**Purpose.** Map data controls to NIST 800-53 families.

**Architecture.** Layered architecture composed of ingestion, storage, processing, governance, and consumption planes, aligned to the Enterprise Reference Architecture ratified in V11.

**ASCII Diagram.**
```text
[Producers] ─▶ [Contract] ─▶ [Pipeline] ─▶ [Storage] ─▶ [Serving] ─▶ [Consumers]
                     │                                     │
                     └────────── Governance / Lineage ─────┘
```

**Rules (RFC 2119).**
- Producers MUST publish schemas to the registry before emission.
- Consumers SHALL validate payloads against the registered schema.
- Breaking changes MUST NOT be released without a governance approval per V11.
- Sensitive fields MUST be classified per Chapter 25 (Data Classification).
- Lineage SHALL be captured for every transformation.

**Examples.**
- A `patient.registered` event carries `tenant_id`, `branch_id`, and a canonical `party_id`.
- The `invoice.line` dimension conforms to the enterprise `Money` type.
- The `appointment.no_show` fact links to `Party`, `Provider`, `Location`, and `Time` dimensions.

**Future Implementation Notes.** Reference the enterprise Canonical Data Model. Do not couple to vendor-specific storage semantics. Adopt open table formats where practical.

**Backward Compatibility Notes.** Additive only. Existing schemas, tables, RLS policies, and services continue to operate unchanged. No migration is prescribed.

**Security Notes.** Alignment with V10 Zero-Trust: least-privilege access to data planes, encryption at rest and in transit, and field-level classification enforced by policy.

**Performance Notes.** Sampling, partitioning, indexing, and materialization strategies SHOULD align with SLOs published in V12.

**Governance Notes.** Owned by the Enterprise Data Council under V11 ARB with domain-level stewards defined in Chapter 6 (Data Ownership).

**Extended Discussion.**
This chapter forms part of the ZMedico Enterprise Data Platform (EDP) architectural corpus.
It codifies the intent, boundaries, and interfaces of the concern without prescribing runtime
implementation. Where implementation is eventually undertaken, the Governance Workflow ratified
in V6 SHALL apply, and the architectural boundaries defined in V8, V9, V10, V11, and V12 SHALL
be respected. Nothing in this chapter changes application code, database schema, RLS policies,
SECURITY DEFINER functions, Edge Functions, generated types, tests, package manifests, or
infrastructure assets.

**Interfaces.**
- **To V8 Authorization.** All data access decisions remain authoritative under RLS and V8
  policies. This chapter MUST NOT be interpreted as altering those decisions.
- **To V9 Identity.** Principal identity, trust envelopes, and session semantics are owned by
  V9. This chapter consumes identity as a fact; it does not redefine it.
- **To V10 Security.** Encryption, key management, and sensitivity classification are governed
  by V10. This chapter aligns to those classifications without inventing new ones.
- **To V11 Governance.** All decisions arising from this chapter SHALL be routed through the
  ARB, ADR, and lifecycle mechanisms V11 defines.
- **To V12 Observability.** Data-plane telemetry (freshness, quality, lineage, throughput) is
  emitted through the observability signals V12 standardizes; V13 defines the semantics, V12
  defines the transport.

**Design Considerations.**
- Prefer *contract-first* design: producers publish schemas and semantics before any consumer
  couples to them.
- Prefer *open standards*: SQL, OpenAPI, AsyncAPI, JSON Schema, Avro, Parquet, Iceberg/Delta,
  OpenLineage, DCAT.
- Prefer *decentralized ownership with federated governance*: domain teams own products; a
  federated council owns policy.
- Prefer *bounded contexts*: cross-domain coupling flows through published contracts, not
  through shared physical tables.
- Prefer *evolvability*: schemas evolve with compatibility rules; consumers negotiate versions
  through the schema registry.

**Anti-Patterns to Avoid.**
- Shared mutable OLTP tables as an integration channel.
- Untyped, unversioned event payloads.
- Point-to-point pipelines with no lineage capture.
- Silent schema drift with no compatibility gate.
- Uncontrolled cross-tenant joins.

**Compliance Alignment.**
- **HIPAA**: Preserve minimum necessary access; PHI is handled per V10 classifications.
- **GDPR**: Preserve lawful basis and purpose limitation; enable subject rights.
- **ISO 27001**: Align to Annex A controls for information classification, cryptography, and
  supplier data handling.
- **NIST 800-53**: Align to AC, AU, SC, and SI family controls at the data plane.

**Operational Envelope.**
- Data SLAs SHALL be published per data product (freshness, completeness, availability).
- Quality signals SHALL be observable in V12 dashboards.
- Incidents affecting data products SHALL follow the incident management workflow ratified
  by V12 Chapter 47.

**Explicit Non-Goals.**
- This chapter does NOT define authorization semantics.
- This chapter does NOT define identity or session semantics.
- This chapter does NOT define encryption primitives or key custody.
- This chapter does NOT change any existing database object, RLS policy, or SECURITY DEFINER
  function.
- This chapter does NOT introduce or modify Edge Functions or React/TypeScript modules.

**Rollout Philosophy (When Implementation Is Later Approved).**
- Additive first: introduce new datasets, contracts, and pipelines alongside existing ones.
- Shadow before cutover: run new pipelines in parallel, compare with existing outputs.
- Fitness-gated promotion: only promote when quality, lineage, and SLO gates pass.
- Reversible by default: every change SHALL have a documented rollback per V11.


## Chapter 60 — Data Sovereignty

**Purpose.** Respect jurisdictional constraints on data location and access.

**Architecture.** Layered architecture composed of ingestion, storage, processing, governance, and consumption planes, aligned to the Enterprise Reference Architecture ratified in V11.

**ASCII Diagram.**
```text
[Producers] ─▶ [Contract] ─▶ [Pipeline] ─▶ [Storage] ─▶ [Serving] ─▶ [Consumers]
                     │                                     │
                     └────────── Governance / Lineage ─────┘
```

**Rules (RFC 2119).**
- Producers MUST publish schemas to the registry before emission.
- Consumers SHALL validate payloads against the registered schema.
- Breaking changes MUST NOT be released without a governance approval per V11.
- Sensitive fields MUST be classified per Chapter 25 (Data Classification).
- Lineage SHALL be captured for every transformation.

**Examples.**
- A `patient.registered` event carries `tenant_id`, `branch_id`, and a canonical `party_id`.
- The `invoice.line` dimension conforms to the enterprise `Money` type.
- The `appointment.no_show` fact links to `Party`, `Provider`, `Location`, and `Time` dimensions.

**Future Implementation Notes.** Reference the enterprise Canonical Data Model. Do not couple to vendor-specific storage semantics. Adopt open table formats where practical.

**Backward Compatibility Notes.** Additive only. Existing schemas, tables, RLS policies, and services continue to operate unchanged. No migration is prescribed.

**Security Notes.** Alignment with V10 Zero-Trust: least-privilege access to data planes, encryption at rest and in transit, and field-level classification enforced by policy.

**Performance Notes.** Sampling, partitioning, indexing, and materialization strategies SHOULD align with SLOs published in V12.

**Governance Notes.** Owned by the Enterprise Data Council under V11 ARB with domain-level stewards defined in Chapter 6 (Data Ownership).

**Extended Discussion.**
This chapter forms part of the ZMedico Enterprise Data Platform (EDP) architectural corpus.
It codifies the intent, boundaries, and interfaces of the concern without prescribing runtime
implementation. Where implementation is eventually undertaken, the Governance Workflow ratified
in V6 SHALL apply, and the architectural boundaries defined in V8, V9, V10, V11, and V12 SHALL
be respected. Nothing in this chapter changes application code, database schema, RLS policies,
SECURITY DEFINER functions, Edge Functions, generated types, tests, package manifests, or
infrastructure assets.

**Interfaces.**
- **To V8 Authorization.** All data access decisions remain authoritative under RLS and V8
  policies. This chapter MUST NOT be interpreted as altering those decisions.
- **To V9 Identity.** Principal identity, trust envelopes, and session semantics are owned by
  V9. This chapter consumes identity as a fact; it does not redefine it.
- **To V10 Security.** Encryption, key management, and sensitivity classification are governed
  by V10. This chapter aligns to those classifications without inventing new ones.
- **To V11 Governance.** All decisions arising from this chapter SHALL be routed through the
  ARB, ADR, and lifecycle mechanisms V11 defines.
- **To V12 Observability.** Data-plane telemetry (freshness, quality, lineage, throughput) is
  emitted through the observability signals V12 standardizes; V13 defines the semantics, V12
  defines the transport.

**Design Considerations.**
- Prefer *contract-first* design: producers publish schemas and semantics before any consumer
  couples to them.
- Prefer *open standards*: SQL, OpenAPI, AsyncAPI, JSON Schema, Avro, Parquet, Iceberg/Delta,
  OpenLineage, DCAT.
- Prefer *decentralized ownership with federated governance*: domain teams own products; a
  federated council owns policy.
- Prefer *bounded contexts*: cross-domain coupling flows through published contracts, not
  through shared physical tables.
- Prefer *evolvability*: schemas evolve with compatibility rules; consumers negotiate versions
  through the schema registry.

**Anti-Patterns to Avoid.**
- Shared mutable OLTP tables as an integration channel.
- Untyped, unversioned event payloads.
- Point-to-point pipelines with no lineage capture.
- Silent schema drift with no compatibility gate.
- Uncontrolled cross-tenant joins.

**Compliance Alignment.**
- **HIPAA**: Preserve minimum necessary access; PHI is handled per V10 classifications.
- **GDPR**: Preserve lawful basis and purpose limitation; enable subject rights.
- **ISO 27001**: Align to Annex A controls for information classification, cryptography, and
  supplier data handling.
- **NIST 800-53**: Align to AC, AU, SC, and SI family controls at the data plane.

**Operational Envelope.**
- Data SLAs SHALL be published per data product (freshness, completeness, availability).
- Quality signals SHALL be observable in V12 dashboards.
- Incidents affecting data products SHALL follow the incident management workflow ratified
  by V12 Chapter 47.

**Explicit Non-Goals.**
- This chapter does NOT define authorization semantics.
- This chapter does NOT define identity or session semantics.
- This chapter does NOT define encryption primitives or key custody.
- This chapter does NOT change any existing database object, RLS policy, or SECURITY DEFINER
  function.
- This chapter does NOT introduce or modify Edge Functions or React/TypeScript modules.

**Rollout Philosophy (When Implementation Is Later Approved).**
- Additive first: introduce new datasets, contracts, and pipelines alongside existing ones.
- Shadow before cutover: run new pipelines in parallel, compare with existing outputs.
- Fitness-gated promotion: only promote when quality, lineage, and SLO gates pass.
- Reversible by default: every change SHALL have a documented rollback per V11.


## Chapter 61 — Data Residency

**Purpose.** Pin data storage to legally required geographies.

**Architecture.** Layered architecture composed of ingestion, storage, processing, governance, and consumption planes, aligned to the Enterprise Reference Architecture ratified in V11.

**ASCII Diagram.**
```text
[Producers] ─▶ [Contract] ─▶ [Pipeline] ─▶ [Storage] ─▶ [Serving] ─▶ [Consumers]
                     │                                     │
                     └────────── Governance / Lineage ─────┘
```

**Rules (RFC 2119).**
- Producers MUST publish schemas to the registry before emission.
- Consumers SHALL validate payloads against the registered schema.
- Breaking changes MUST NOT be released without a governance approval per V11.
- Sensitive fields MUST be classified per Chapter 25 (Data Classification).
- Lineage SHALL be captured for every transformation.

**Examples.**
- A `patient.registered` event carries `tenant_id`, `branch_id`, and a canonical `party_id`.
- The `invoice.line` dimension conforms to the enterprise `Money` type.
- The `appointment.no_show` fact links to `Party`, `Provider`, `Location`, and `Time` dimensions.

**Future Implementation Notes.** Reference the enterprise Canonical Data Model. Do not couple to vendor-specific storage semantics. Adopt open table formats where practical.

**Backward Compatibility Notes.** Additive only. Existing schemas, tables, RLS policies, and services continue to operate unchanged. No migration is prescribed.

**Security Notes.** Alignment with V10 Zero-Trust: least-privilege access to data planes, encryption at rest and in transit, and field-level classification enforced by policy.

**Performance Notes.** Sampling, partitioning, indexing, and materialization strategies SHOULD align with SLOs published in V12.

**Governance Notes.** Owned by the Enterprise Data Council under V11 ARB with domain-level stewards defined in Chapter 6 (Data Ownership).

**Extended Discussion.**
This chapter forms part of the ZMedico Enterprise Data Platform (EDP) architectural corpus.
It codifies the intent, boundaries, and interfaces of the concern without prescribing runtime
implementation. Where implementation is eventually undertaken, the Governance Workflow ratified
in V6 SHALL apply, and the architectural boundaries defined in V8, V9, V10, V11, and V12 SHALL
be respected. Nothing in this chapter changes application code, database schema, RLS policies,
SECURITY DEFINER functions, Edge Functions, generated types, tests, package manifests, or
infrastructure assets.

**Interfaces.**
- **To V8 Authorization.** All data access decisions remain authoritative under RLS and V8
  policies. This chapter MUST NOT be interpreted as altering those decisions.
- **To V9 Identity.** Principal identity, trust envelopes, and session semantics are owned by
  V9. This chapter consumes identity as a fact; it does not redefine it.
- **To V10 Security.** Encryption, key management, and sensitivity classification are governed
  by V10. This chapter aligns to those classifications without inventing new ones.
- **To V11 Governance.** All decisions arising from this chapter SHALL be routed through the
  ARB, ADR, and lifecycle mechanisms V11 defines.
- **To V12 Observability.** Data-plane telemetry (freshness, quality, lineage, throughput) is
  emitted through the observability signals V12 standardizes; V13 defines the semantics, V12
  defines the transport.

**Design Considerations.**
- Prefer *contract-first* design: producers publish schemas and semantics before any consumer
  couples to them.
- Prefer *open standards*: SQL, OpenAPI, AsyncAPI, JSON Schema, Avro, Parquet, Iceberg/Delta,
  OpenLineage, DCAT.
- Prefer *decentralized ownership with federated governance*: domain teams own products; a
  federated council owns policy.
- Prefer *bounded contexts*: cross-domain coupling flows through published contracts, not
  through shared physical tables.
- Prefer *evolvability*: schemas evolve with compatibility rules; consumers negotiate versions
  through the schema registry.

**Anti-Patterns to Avoid.**
- Shared mutable OLTP tables as an integration channel.
- Untyped, unversioned event payloads.
- Point-to-point pipelines with no lineage capture.
- Silent schema drift with no compatibility gate.
- Uncontrolled cross-tenant joins.

**Compliance Alignment.**
- **HIPAA**: Preserve minimum necessary access; PHI is handled per V10 classifications.
- **GDPR**: Preserve lawful basis and purpose limitation; enable subject rights.
- **ISO 27001**: Align to Annex A controls for information classification, cryptography, and
  supplier data handling.
- **NIST 800-53**: Align to AC, AU, SC, and SI family controls at the data plane.

**Operational Envelope.**
- Data SLAs SHALL be published per data product (freshness, completeness, availability).
- Quality signals SHALL be observable in V12 dashboards.
- Incidents affecting data products SHALL follow the incident management workflow ratified
  by V12 Chapter 47.

**Explicit Non-Goals.**
- This chapter does NOT define authorization semantics.
- This chapter does NOT define identity or session semantics.
- This chapter does NOT define encryption primitives or key custody.
- This chapter does NOT change any existing database object, RLS policy, or SECURITY DEFINER
  function.
- This chapter does NOT introduce or modify Edge Functions or React/TypeScript modules.

**Rollout Philosophy (When Implementation Is Later Approved).**
- Additive first: introduce new datasets, contracts, and pipelines alongside existing ones.
- Shadow before cutover: run new pipelines in parallel, compare with existing outputs.
- Fitness-gated promotion: only promote when quality, lineage, and SLO gates pass.
- Reversible by default: every change SHALL have a documented rollback per V11.


## Chapter 62 — Data Encryption at Rest

**Purpose.** Protect stored data with keys governed under V10.

**Architecture.** Layered architecture composed of ingestion, storage, processing, governance, and consumption planes, aligned to the Enterprise Reference Architecture ratified in V11.

**ASCII Diagram.**
```text
[Producers] ─▶ [Contract] ─▶ [Pipeline] ─▶ [Storage] ─▶ [Serving] ─▶ [Consumers]
                     │                                     │
                     └────────── Governance / Lineage ─────┘
```

**Rules (RFC 2119).**
- Producers MUST publish schemas to the registry before emission.
- Consumers SHALL validate payloads against the registered schema.
- Breaking changes MUST NOT be released without a governance approval per V11.
- Sensitive fields MUST be classified per Chapter 25 (Data Classification).
- Lineage SHALL be captured for every transformation.

**Examples.**
- A `patient.registered` event carries `tenant_id`, `branch_id`, and a canonical `party_id`.
- The `invoice.line` dimension conforms to the enterprise `Money` type.
- The `appointment.no_show` fact links to `Party`, `Provider`, `Location`, and `Time` dimensions.

**Future Implementation Notes.** Reference the enterprise Canonical Data Model. Do not couple to vendor-specific storage semantics. Adopt open table formats where practical.

**Backward Compatibility Notes.** Additive only. Existing schemas, tables, RLS policies, and services continue to operate unchanged. No migration is prescribed.

**Security Notes.** Alignment with V10 Zero-Trust: least-privilege access to data planes, encryption at rest and in transit, and field-level classification enforced by policy.

**Performance Notes.** Sampling, partitioning, indexing, and materialization strategies SHOULD align with SLOs published in V12.

**Governance Notes.** Owned by the Enterprise Data Council under V11 ARB with domain-level stewards defined in Chapter 6 (Data Ownership).

**Extended Discussion.**
This chapter forms part of the ZMedico Enterprise Data Platform (EDP) architectural corpus.
It codifies the intent, boundaries, and interfaces of the concern without prescribing runtime
implementation. Where implementation is eventually undertaken, the Governance Workflow ratified
in V6 SHALL apply, and the architectural boundaries defined in V8, V9, V10, V11, and V12 SHALL
be respected. Nothing in this chapter changes application code, database schema, RLS policies,
SECURITY DEFINER functions, Edge Functions, generated types, tests, package manifests, or
infrastructure assets.

**Interfaces.**
- **To V8 Authorization.** All data access decisions remain authoritative under RLS and V8
  policies. This chapter MUST NOT be interpreted as altering those decisions.
- **To V9 Identity.** Principal identity, trust envelopes, and session semantics are owned by
  V9. This chapter consumes identity as a fact; it does not redefine it.
- **To V10 Security.** Encryption, key management, and sensitivity classification are governed
  by V10. This chapter aligns to those classifications without inventing new ones.
- **To V11 Governance.** All decisions arising from this chapter SHALL be routed through the
  ARB, ADR, and lifecycle mechanisms V11 defines.
- **To V12 Observability.** Data-plane telemetry (freshness, quality, lineage, throughput) is
  emitted through the observability signals V12 standardizes; V13 defines the semantics, V12
  defines the transport.

**Design Considerations.**
- Prefer *contract-first* design: producers publish schemas and semantics before any consumer
  couples to them.
- Prefer *open standards*: SQL, OpenAPI, AsyncAPI, JSON Schema, Avro, Parquet, Iceberg/Delta,
  OpenLineage, DCAT.
- Prefer *decentralized ownership with federated governance*: domain teams own products; a
  federated council owns policy.
- Prefer *bounded contexts*: cross-domain coupling flows through published contracts, not
  through shared physical tables.
- Prefer *evolvability*: schemas evolve with compatibility rules; consumers negotiate versions
  through the schema registry.

**Anti-Patterns to Avoid.**
- Shared mutable OLTP tables as an integration channel.
- Untyped, unversioned event payloads.
- Point-to-point pipelines with no lineage capture.
- Silent schema drift with no compatibility gate.
- Uncontrolled cross-tenant joins.

**Compliance Alignment.**
- **HIPAA**: Preserve minimum necessary access; PHI is handled per V10 classifications.
- **GDPR**: Preserve lawful basis and purpose limitation; enable subject rights.
- **ISO 27001**: Align to Annex A controls for information classification, cryptography, and
  supplier data handling.
- **NIST 800-53**: Align to AC, AU, SC, and SI family controls at the data plane.

**Operational Envelope.**
- Data SLAs SHALL be published per data product (freshness, completeness, availability).
- Quality signals SHALL be observable in V12 dashboards.
- Incidents affecting data products SHALL follow the incident management workflow ratified
  by V12 Chapter 47.

**Explicit Non-Goals.**
- This chapter does NOT define authorization semantics.
- This chapter does NOT define identity or session semantics.
- This chapter does NOT define encryption primitives or key custody.
- This chapter does NOT change any existing database object, RLS policy, or SECURITY DEFINER
  function.
- This chapter does NOT introduce or modify Edge Functions or React/TypeScript modules.

**Rollout Philosophy (When Implementation Is Later Approved).**
- Additive first: introduce new datasets, contracts, and pipelines alongside existing ones.
- Shadow before cutover: run new pipelines in parallel, compare with existing outputs.
- Fitness-gated promotion: only promote when quality, lineage, and SLO gates pass.
- Reversible by default: every change SHALL have a documented rollback per V11.


## Chapter 63 — Data Encryption in Transit

**Purpose.** Protect data in motion with strong TLS and mTLS where warranted.

**Architecture.** Layered architecture composed of ingestion, storage, processing, governance, and consumption planes, aligned to the Enterprise Reference Architecture ratified in V11.

**ASCII Diagram.**
```text
[Producers] ─▶ [Contract] ─▶ [Pipeline] ─▶ [Storage] ─▶ [Serving] ─▶ [Consumers]
                     │                                     │
                     └────────── Governance / Lineage ─────┘
```

**Rules (RFC 2119).**
- Producers MUST publish schemas to the registry before emission.
- Consumers SHALL validate payloads against the registered schema.
- Breaking changes MUST NOT be released without a governance approval per V11.
- Sensitive fields MUST be classified per Chapter 25 (Data Classification).
- Lineage SHALL be captured for every transformation.

**Examples.**
- A `patient.registered` event carries `tenant_id`, `branch_id`, and a canonical `party_id`.
- The `invoice.line` dimension conforms to the enterprise `Money` type.
- The `appointment.no_show` fact links to `Party`, `Provider`, `Location`, and `Time` dimensions.

**Future Implementation Notes.** Reference the enterprise Canonical Data Model. Do not couple to vendor-specific storage semantics. Adopt open table formats where practical.

**Backward Compatibility Notes.** Additive only. Existing schemas, tables, RLS policies, and services continue to operate unchanged. No migration is prescribed.

**Security Notes.** Alignment with V10 Zero-Trust: least-privilege access to data planes, encryption at rest and in transit, and field-level classification enforced by policy.

**Performance Notes.** Sampling, partitioning, indexing, and materialization strategies SHOULD align with SLOs published in V12.

**Governance Notes.** Owned by the Enterprise Data Council under V11 ARB with domain-level stewards defined in Chapter 6 (Data Ownership).

**Extended Discussion.**
This chapter forms part of the ZMedico Enterprise Data Platform (EDP) architectural corpus.
It codifies the intent, boundaries, and interfaces of the concern without prescribing runtime
implementation. Where implementation is eventually undertaken, the Governance Workflow ratified
in V6 SHALL apply, and the architectural boundaries defined in V8, V9, V10, V11, and V12 SHALL
be respected. Nothing in this chapter changes application code, database schema, RLS policies,
SECURITY DEFINER functions, Edge Functions, generated types, tests, package manifests, or
infrastructure assets.

**Interfaces.**
- **To V8 Authorization.** All data access decisions remain authoritative under RLS and V8
  policies. This chapter MUST NOT be interpreted as altering those decisions.
- **To V9 Identity.** Principal identity, trust envelopes, and session semantics are owned by
  V9. This chapter consumes identity as a fact; it does not redefine it.
- **To V10 Security.** Encryption, key management, and sensitivity classification are governed
  by V10. This chapter aligns to those classifications without inventing new ones.
- **To V11 Governance.** All decisions arising from this chapter SHALL be routed through the
  ARB, ADR, and lifecycle mechanisms V11 defines.
- **To V12 Observability.** Data-plane telemetry (freshness, quality, lineage, throughput) is
  emitted through the observability signals V12 standardizes; V13 defines the semantics, V12
  defines the transport.

**Design Considerations.**
- Prefer *contract-first* design: producers publish schemas and semantics before any consumer
  couples to them.
- Prefer *open standards*: SQL, OpenAPI, AsyncAPI, JSON Schema, Avro, Parquet, Iceberg/Delta,
  OpenLineage, DCAT.
- Prefer *decentralized ownership with federated governance*: domain teams own products; a
  federated council owns policy.
- Prefer *bounded contexts*: cross-domain coupling flows through published contracts, not
  through shared physical tables.
- Prefer *evolvability*: schemas evolve with compatibility rules; consumers negotiate versions
  through the schema registry.

**Anti-Patterns to Avoid.**
- Shared mutable OLTP tables as an integration channel.
- Untyped, unversioned event payloads.
- Point-to-point pipelines with no lineage capture.
- Silent schema drift with no compatibility gate.
- Uncontrolled cross-tenant joins.

**Compliance Alignment.**
- **HIPAA**: Preserve minimum necessary access; PHI is handled per V10 classifications.
- **GDPR**: Preserve lawful basis and purpose limitation; enable subject rights.
- **ISO 27001**: Align to Annex A controls for information classification, cryptography, and
  supplier data handling.
- **NIST 800-53**: Align to AC, AU, SC, and SI family controls at the data plane.

**Operational Envelope.**
- Data SLAs SHALL be published per data product (freshness, completeness, availability).
- Quality signals SHALL be observable in V12 dashboards.
- Incidents affecting data products SHALL follow the incident management workflow ratified
  by V12 Chapter 47.

**Explicit Non-Goals.**
- This chapter does NOT define authorization semantics.
- This chapter does NOT define identity or session semantics.
- This chapter does NOT define encryption primitives or key custody.
- This chapter does NOT change any existing database object, RLS policy, or SECURITY DEFINER
  function.
- This chapter does NOT introduce or modify Edge Functions or React/TypeScript modules.

**Rollout Philosophy (When Implementation Is Later Approved).**
- Additive first: introduce new datasets, contracts, and pipelines alongside existing ones.
- Shadow before cutover: run new pipelines in parallel, compare with existing outputs.
- Fitness-gated promotion: only promote when quality, lineage, and SLO gates pass.
- Reversible by default: every change SHALL have a documented rollback per V11.


## Chapter 64 — Tokenization

**Purpose.** Replace sensitive values with non-sensitive surrogates.

**Architecture.** Layered architecture composed of ingestion, storage, processing, governance, and consumption planes, aligned to the Enterprise Reference Architecture ratified in V11.

**ASCII Diagram.**
```text
[Producers] ─▶ [Contract] ─▶ [Pipeline] ─▶ [Storage] ─▶ [Serving] ─▶ [Consumers]
                     │                                     │
                     └────────── Governance / Lineage ─────┘
```

**Rules (RFC 2119).**
- Producers MUST publish schemas to the registry before emission.
- Consumers SHALL validate payloads against the registered schema.
- Breaking changes MUST NOT be released without a governance approval per V11.
- Sensitive fields MUST be classified per Chapter 25 (Data Classification).
- Lineage SHALL be captured for every transformation.

**Examples.**
- A `patient.registered` event carries `tenant_id`, `branch_id`, and a canonical `party_id`.
- The `invoice.line` dimension conforms to the enterprise `Money` type.
- The `appointment.no_show` fact links to `Party`, `Provider`, `Location`, and `Time` dimensions.

**Future Implementation Notes.** Reference the enterprise Canonical Data Model. Do not couple to vendor-specific storage semantics. Adopt open table formats where practical.

**Backward Compatibility Notes.** Additive only. Existing schemas, tables, RLS policies, and services continue to operate unchanged. No migration is prescribed.

**Security Notes.** Alignment with V10 Zero-Trust: least-privilege access to data planes, encryption at rest and in transit, and field-level classification enforced by policy.

**Performance Notes.** Sampling, partitioning, indexing, and materialization strategies SHOULD align with SLOs published in V12.

**Governance Notes.** Owned by the Enterprise Data Council under V11 ARB with domain-level stewards defined in Chapter 6 (Data Ownership).

**Extended Discussion.**
This chapter forms part of the ZMedico Enterprise Data Platform (EDP) architectural corpus.
It codifies the intent, boundaries, and interfaces of the concern without prescribing runtime
implementation. Where implementation is eventually undertaken, the Governance Workflow ratified
in V6 SHALL apply, and the architectural boundaries defined in V8, V9, V10, V11, and V12 SHALL
be respected. Nothing in this chapter changes application code, database schema, RLS policies,
SECURITY DEFINER functions, Edge Functions, generated types, tests, package manifests, or
infrastructure assets.

**Interfaces.**
- **To V8 Authorization.** All data access decisions remain authoritative under RLS and V8
  policies. This chapter MUST NOT be interpreted as altering those decisions.
- **To V9 Identity.** Principal identity, trust envelopes, and session semantics are owned by
  V9. This chapter consumes identity as a fact; it does not redefine it.
- **To V10 Security.** Encryption, key management, and sensitivity classification are governed
  by V10. This chapter aligns to those classifications without inventing new ones.
- **To V11 Governance.** All decisions arising from this chapter SHALL be routed through the
  ARB, ADR, and lifecycle mechanisms V11 defines.
- **To V12 Observability.** Data-plane telemetry (freshness, quality, lineage, throughput) is
  emitted through the observability signals V12 standardizes; V13 defines the semantics, V12
  defines the transport.

**Design Considerations.**
- Prefer *contract-first* design: producers publish schemas and semantics before any consumer
  couples to them.
- Prefer *open standards*: SQL, OpenAPI, AsyncAPI, JSON Schema, Avro, Parquet, Iceberg/Delta,
  OpenLineage, DCAT.
- Prefer *decentralized ownership with federated governance*: domain teams own products; a
  federated council owns policy.
- Prefer *bounded contexts*: cross-domain coupling flows through published contracts, not
  through shared physical tables.
- Prefer *evolvability*: schemas evolve with compatibility rules; consumers negotiate versions
  through the schema registry.

**Anti-Patterns to Avoid.**
- Shared mutable OLTP tables as an integration channel.
- Untyped, unversioned event payloads.
- Point-to-point pipelines with no lineage capture.
- Silent schema drift with no compatibility gate.
- Uncontrolled cross-tenant joins.

**Compliance Alignment.**
- **HIPAA**: Preserve minimum necessary access; PHI is handled per V10 classifications.
- **GDPR**: Preserve lawful basis and purpose limitation; enable subject rights.
- **ISO 27001**: Align to Annex A controls for information classification, cryptography, and
  supplier data handling.
- **NIST 800-53**: Align to AC, AU, SC, and SI family controls at the data plane.

**Operational Envelope.**
- Data SLAs SHALL be published per data product (freshness, completeness, availability).
- Quality signals SHALL be observable in V12 dashboards.
- Incidents affecting data products SHALL follow the incident management workflow ratified
  by V12 Chapter 47.

**Explicit Non-Goals.**
- This chapter does NOT define authorization semantics.
- This chapter does NOT define identity or session semantics.
- This chapter does NOT define encryption primitives or key custody.
- This chapter does NOT change any existing database object, RLS policy, or SECURITY DEFINER
  function.
- This chapter does NOT introduce or modify Edge Functions or React/TypeScript modules.

**Rollout Philosophy (When Implementation Is Later Approved).**
- Additive first: introduce new datasets, contracts, and pipelines alongside existing ones.
- Shadow before cutover: run new pipelines in parallel, compare with existing outputs.
- Fitness-gated promotion: only promote when quality, lineage, and SLO gates pass.
- Reversible by default: every change SHALL have a documented rollback per V11.


## Chapter 65 — Pseudonymization

**Purpose.** Reduce direct identifiability while preserving analytic utility.

**Architecture.** Layered architecture composed of ingestion, storage, processing, governance, and consumption planes, aligned to the Enterprise Reference Architecture ratified in V11.

**ASCII Diagram.**
```text
[Producers] ─▶ [Contract] ─▶ [Pipeline] ─▶ [Storage] ─▶ [Serving] ─▶ [Consumers]
                     │                                     │
                     └────────── Governance / Lineage ─────┘
```

**Rules (RFC 2119).**
- Producers MUST publish schemas to the registry before emission.
- Consumers SHALL validate payloads against the registered schema.
- Breaking changes MUST NOT be released without a governance approval per V11.
- Sensitive fields MUST be classified per Chapter 25 (Data Classification).
- Lineage SHALL be captured for every transformation.

**Examples.**
- A `patient.registered` event carries `tenant_id`, `branch_id`, and a canonical `party_id`.
- The `invoice.line` dimension conforms to the enterprise `Money` type.
- The `appointment.no_show` fact links to `Party`, `Provider`, `Location`, and `Time` dimensions.

**Future Implementation Notes.** Reference the enterprise Canonical Data Model. Do not couple to vendor-specific storage semantics. Adopt open table formats where practical.

**Backward Compatibility Notes.** Additive only. Existing schemas, tables, RLS policies, and services continue to operate unchanged. No migration is prescribed.

**Security Notes.** Alignment with V10 Zero-Trust: least-privilege access to data planes, encryption at rest and in transit, and field-level classification enforced by policy.

**Performance Notes.** Sampling, partitioning, indexing, and materialization strategies SHOULD align with SLOs published in V12.

**Governance Notes.** Owned by the Enterprise Data Council under V11 ARB with domain-level stewards defined in Chapter 6 (Data Ownership).

**Extended Discussion.**
This chapter forms part of the ZMedico Enterprise Data Platform (EDP) architectural corpus.
It codifies the intent, boundaries, and interfaces of the concern without prescribing runtime
implementation. Where implementation is eventually undertaken, the Governance Workflow ratified
in V6 SHALL apply, and the architectural boundaries defined in V8, V9, V10, V11, and V12 SHALL
be respected. Nothing in this chapter changes application code, database schema, RLS policies,
SECURITY DEFINER functions, Edge Functions, generated types, tests, package manifests, or
infrastructure assets.

**Interfaces.**
- **To V8 Authorization.** All data access decisions remain authoritative under RLS and V8
  policies. This chapter MUST NOT be interpreted as altering those decisions.
- **To V9 Identity.** Principal identity, trust envelopes, and session semantics are owned by
  V9. This chapter consumes identity as a fact; it does not redefine it.
- **To V10 Security.** Encryption, key management, and sensitivity classification are governed
  by V10. This chapter aligns to those classifications without inventing new ones.
- **To V11 Governance.** All decisions arising from this chapter SHALL be routed through the
  ARB, ADR, and lifecycle mechanisms V11 defines.
- **To V12 Observability.** Data-plane telemetry (freshness, quality, lineage, throughput) is
  emitted through the observability signals V12 standardizes; V13 defines the semantics, V12
  defines the transport.

**Design Considerations.**
- Prefer *contract-first* design: producers publish schemas and semantics before any consumer
  couples to them.
- Prefer *open standards*: SQL, OpenAPI, AsyncAPI, JSON Schema, Avro, Parquet, Iceberg/Delta,
  OpenLineage, DCAT.
- Prefer *decentralized ownership with federated governance*: domain teams own products; a
  federated council owns policy.
- Prefer *bounded contexts*: cross-domain coupling flows through published contracts, not
  through shared physical tables.
- Prefer *evolvability*: schemas evolve with compatibility rules; consumers negotiate versions
  through the schema registry.

**Anti-Patterns to Avoid.**
- Shared mutable OLTP tables as an integration channel.
- Untyped, unversioned event payloads.
- Point-to-point pipelines with no lineage capture.
- Silent schema drift with no compatibility gate.
- Uncontrolled cross-tenant joins.

**Compliance Alignment.**
- **HIPAA**: Preserve minimum necessary access; PHI is handled per V10 classifications.
- **GDPR**: Preserve lawful basis and purpose limitation; enable subject rights.
- **ISO 27001**: Align to Annex A controls for information classification, cryptography, and
  supplier data handling.
- **NIST 800-53**: Align to AC, AU, SC, and SI family controls at the data plane.

**Operational Envelope.**
- Data SLAs SHALL be published per data product (freshness, completeness, availability).
- Quality signals SHALL be observable in V12 dashboards.
- Incidents affecting data products SHALL follow the incident management workflow ratified
  by V12 Chapter 47.

**Explicit Non-Goals.**
- This chapter does NOT define authorization semantics.
- This chapter does NOT define identity or session semantics.
- This chapter does NOT define encryption primitives or key custody.
- This chapter does NOT change any existing database object, RLS policy, or SECURITY DEFINER
  function.
- This chapter does NOT introduce or modify Edge Functions or React/TypeScript modules.

**Rollout Philosophy (When Implementation Is Later Approved).**
- Additive first: introduce new datasets, contracts, and pipelines alongside existing ones.
- Shadow before cutover: run new pipelines in parallel, compare with existing outputs.
- Fitness-gated promotion: only promote when quality, lineage, and SLO gates pass.
- Reversible by default: every change SHALL have a documented rollback per V11.


## Chapter 66 — Anonymization

**Purpose.** Irreversibly remove identifiability from datasets.

**Architecture.** Layered architecture composed of ingestion, storage, processing, governance, and consumption planes, aligned to the Enterprise Reference Architecture ratified in V11.

**ASCII Diagram.**
```text
[Producers] ─▶ [Contract] ─▶ [Pipeline] ─▶ [Storage] ─▶ [Serving] ─▶ [Consumers]
                     │                                     │
                     └────────── Governance / Lineage ─────┘
```

**Rules (RFC 2119).**
- Producers MUST publish schemas to the registry before emission.
- Consumers SHALL validate payloads against the registered schema.
- Breaking changes MUST NOT be released without a governance approval per V11.
- Sensitive fields MUST be classified per Chapter 25 (Data Classification).
- Lineage SHALL be captured for every transformation.

**Examples.**
- A `patient.registered` event carries `tenant_id`, `branch_id`, and a canonical `party_id`.
- The `invoice.line` dimension conforms to the enterprise `Money` type.
- The `appointment.no_show` fact links to `Party`, `Provider`, `Location`, and `Time` dimensions.

**Future Implementation Notes.** Reference the enterprise Canonical Data Model. Do not couple to vendor-specific storage semantics. Adopt open table formats where practical.

**Backward Compatibility Notes.** Additive only. Existing schemas, tables, RLS policies, and services continue to operate unchanged. No migration is prescribed.

**Security Notes.** Alignment with V10 Zero-Trust: least-privilege access to data planes, encryption at rest and in transit, and field-level classification enforced by policy.

**Performance Notes.** Sampling, partitioning, indexing, and materialization strategies SHOULD align with SLOs published in V12.

**Governance Notes.** Owned by the Enterprise Data Council under V11 ARB with domain-level stewards defined in Chapter 6 (Data Ownership).

**Extended Discussion.**
This chapter forms part of the ZMedico Enterprise Data Platform (EDP) architectural corpus.
It codifies the intent, boundaries, and interfaces of the concern without prescribing runtime
implementation. Where implementation is eventually undertaken, the Governance Workflow ratified
in V6 SHALL apply, and the architectural boundaries defined in V8, V9, V10, V11, and V12 SHALL
be respected. Nothing in this chapter changes application code, database schema, RLS policies,
SECURITY DEFINER functions, Edge Functions, generated types, tests, package manifests, or
infrastructure assets.

**Interfaces.**
- **To V8 Authorization.** All data access decisions remain authoritative under RLS and V8
  policies. This chapter MUST NOT be interpreted as altering those decisions.
- **To V9 Identity.** Principal identity, trust envelopes, and session semantics are owned by
  V9. This chapter consumes identity as a fact; it does not redefine it.
- **To V10 Security.** Encryption, key management, and sensitivity classification are governed
  by V10. This chapter aligns to those classifications without inventing new ones.
- **To V11 Governance.** All decisions arising from this chapter SHALL be routed through the
  ARB, ADR, and lifecycle mechanisms V11 defines.
- **To V12 Observability.** Data-plane telemetry (freshness, quality, lineage, throughput) is
  emitted through the observability signals V12 standardizes; V13 defines the semantics, V12
  defines the transport.

**Design Considerations.**
- Prefer *contract-first* design: producers publish schemas and semantics before any consumer
  couples to them.
- Prefer *open standards*: SQL, OpenAPI, AsyncAPI, JSON Schema, Avro, Parquet, Iceberg/Delta,
  OpenLineage, DCAT.
- Prefer *decentralized ownership with federated governance*: domain teams own products; a
  federated council owns policy.
- Prefer *bounded contexts*: cross-domain coupling flows through published contracts, not
  through shared physical tables.
- Prefer *evolvability*: schemas evolve with compatibility rules; consumers negotiate versions
  through the schema registry.

**Anti-Patterns to Avoid.**
- Shared mutable OLTP tables as an integration channel.
- Untyped, unversioned event payloads.
- Point-to-point pipelines with no lineage capture.
- Silent schema drift with no compatibility gate.
- Uncontrolled cross-tenant joins.

**Compliance Alignment.**
- **HIPAA**: Preserve minimum necessary access; PHI is handled per V10 classifications.
- **GDPR**: Preserve lawful basis and purpose limitation; enable subject rights.
- **ISO 27001**: Align to Annex A controls for information classification, cryptography, and
  supplier data handling.
- **NIST 800-53**: Align to AC, AU, SC, and SI family controls at the data plane.

**Operational Envelope.**
- Data SLAs SHALL be published per data product (freshness, completeness, availability).
- Quality signals SHALL be observable in V12 dashboards.
- Incidents affecting data products SHALL follow the incident management workflow ratified
  by V12 Chapter 47.

**Explicit Non-Goals.**
- This chapter does NOT define authorization semantics.
- This chapter does NOT define identity or session semantics.
- This chapter does NOT define encryption primitives or key custody.
- This chapter does NOT change any existing database object, RLS policy, or SECURITY DEFINER
  function.
- This chapter does NOT introduce or modify Edge Functions or React/TypeScript modules.

**Rollout Philosophy (When Implementation Is Later Approved).**
- Additive first: introduce new datasets, contracts, and pipelines alongside existing ones.
- Shadow before cutover: run new pipelines in parallel, compare with existing outputs.
- Fitness-gated promotion: only promote when quality, lineage, and SLO gates pass.
- Reversible by default: every change SHALL have a documented rollback per V11.


## Chapter 67 — De-identification

**Purpose.** Apply Safe Harbor / Expert Determination methods to health data.

**Architecture.** Layered architecture composed of ingestion, storage, processing, governance, and consumption planes, aligned to the Enterprise Reference Architecture ratified in V11.

**ASCII Diagram.**
```text
[Producers] ─▶ [Contract] ─▶ [Pipeline] ─▶ [Storage] ─▶ [Serving] ─▶ [Consumers]
                     │                                     │
                     └────────── Governance / Lineage ─────┘
```

**Rules (RFC 2119).**
- Producers MUST publish schemas to the registry before emission.
- Consumers SHALL validate payloads against the registered schema.
- Breaking changes MUST NOT be released without a governance approval per V11.
- Sensitive fields MUST be classified per Chapter 25 (Data Classification).
- Lineage SHALL be captured for every transformation.

**Examples.**
- A `patient.registered` event carries `tenant_id`, `branch_id`, and a canonical `party_id`.
- The `invoice.line` dimension conforms to the enterprise `Money` type.
- The `appointment.no_show` fact links to `Party`, `Provider`, `Location`, and `Time` dimensions.

**Future Implementation Notes.** Reference the enterprise Canonical Data Model. Do not couple to vendor-specific storage semantics. Adopt open table formats where practical.

**Backward Compatibility Notes.** Additive only. Existing schemas, tables, RLS policies, and services continue to operate unchanged. No migration is prescribed.

**Security Notes.** Alignment with V10 Zero-Trust: least-privilege access to data planes, encryption at rest and in transit, and field-level classification enforced by policy.

**Performance Notes.** Sampling, partitioning, indexing, and materialization strategies SHOULD align with SLOs published in V12.

**Governance Notes.** Owned by the Enterprise Data Council under V11 ARB with domain-level stewards defined in Chapter 6 (Data Ownership).

**Extended Discussion.**
This chapter forms part of the ZMedico Enterprise Data Platform (EDP) architectural corpus.
It codifies the intent, boundaries, and interfaces of the concern without prescribing runtime
implementation. Where implementation is eventually undertaken, the Governance Workflow ratified
in V6 SHALL apply, and the architectural boundaries defined in V8, V9, V10, V11, and V12 SHALL
be respected. Nothing in this chapter changes application code, database schema, RLS policies,
SECURITY DEFINER functions, Edge Functions, generated types, tests, package manifests, or
infrastructure assets.

**Interfaces.**
- **To V8 Authorization.** All data access decisions remain authoritative under RLS and V8
  policies. This chapter MUST NOT be interpreted as altering those decisions.
- **To V9 Identity.** Principal identity, trust envelopes, and session semantics are owned by
  V9. This chapter consumes identity as a fact; it does not redefine it.
- **To V10 Security.** Encryption, key management, and sensitivity classification are governed
  by V10. This chapter aligns to those classifications without inventing new ones.
- **To V11 Governance.** All decisions arising from this chapter SHALL be routed through the
  ARB, ADR, and lifecycle mechanisms V11 defines.
- **To V12 Observability.** Data-plane telemetry (freshness, quality, lineage, throughput) is
  emitted through the observability signals V12 standardizes; V13 defines the semantics, V12
  defines the transport.

**Design Considerations.**
- Prefer *contract-first* design: producers publish schemas and semantics before any consumer
  couples to them.
- Prefer *open standards*: SQL, OpenAPI, AsyncAPI, JSON Schema, Avro, Parquet, Iceberg/Delta,
  OpenLineage, DCAT.
- Prefer *decentralized ownership with federated governance*: domain teams own products; a
  federated council owns policy.
- Prefer *bounded contexts*: cross-domain coupling flows through published contracts, not
  through shared physical tables.
- Prefer *evolvability*: schemas evolve with compatibility rules; consumers negotiate versions
  through the schema registry.

**Anti-Patterns to Avoid.**
- Shared mutable OLTP tables as an integration channel.
- Untyped, unversioned event payloads.
- Point-to-point pipelines with no lineage capture.
- Silent schema drift with no compatibility gate.
- Uncontrolled cross-tenant joins.

**Compliance Alignment.**
- **HIPAA**: Preserve minimum necessary access; PHI is handled per V10 classifications.
- **GDPR**: Preserve lawful basis and purpose limitation; enable subject rights.
- **ISO 27001**: Align to Annex A controls for information classification, cryptography, and
  supplier data handling.
- **NIST 800-53**: Align to AC, AU, SC, and SI family controls at the data plane.

**Operational Envelope.**
- Data SLAs SHALL be published per data product (freshness, completeness, availability).
- Quality signals SHALL be observable in V12 dashboards.
- Incidents affecting data products SHALL follow the incident management workflow ratified
  by V12 Chapter 47.

**Explicit Non-Goals.**
- This chapter does NOT define authorization semantics.
- This chapter does NOT define identity or session semantics.
- This chapter does NOT define encryption primitives or key custody.
- This chapter does NOT change any existing database object, RLS policy, or SECURITY DEFINER
  function.
- This chapter does NOT introduce or modify Edge Functions or React/TypeScript modules.

**Rollout Philosophy (When Implementation Is Later Approved).**
- Additive first: introduce new datasets, contracts, and pipelines alongside existing ones.
- Shadow before cutover: run new pipelines in parallel, compare with existing outputs.
- Fitness-gated promotion: only promote when quality, lineage, and SLO gates pass.
- Reversible by default: every change SHALL have a documented rollback per V11.


## Chapter 68 — Data Minimization

**Purpose.** Collect only what is necessary for the declared purpose.

**Architecture.** Layered architecture composed of ingestion, storage, processing, governance, and consumption planes, aligned to the Enterprise Reference Architecture ratified in V11.

**ASCII Diagram.**
```text
[Producers] ─▶ [Contract] ─▶ [Pipeline] ─▶ [Storage] ─▶ [Serving] ─▶ [Consumers]
                     │                                     │
                     └────────── Governance / Lineage ─────┘
```

**Rules (RFC 2119).**
- Producers MUST publish schemas to the registry before emission.
- Consumers SHALL validate payloads against the registered schema.
- Breaking changes MUST NOT be released without a governance approval per V11.
- Sensitive fields MUST be classified per Chapter 25 (Data Classification).
- Lineage SHALL be captured for every transformation.

**Examples.**
- A `patient.registered` event carries `tenant_id`, `branch_id`, and a canonical `party_id`.
- The `invoice.line` dimension conforms to the enterprise `Money` type.
- The `appointment.no_show` fact links to `Party`, `Provider`, `Location`, and `Time` dimensions.

**Future Implementation Notes.** Reference the enterprise Canonical Data Model. Do not couple to vendor-specific storage semantics. Adopt open table formats where practical.

**Backward Compatibility Notes.** Additive only. Existing schemas, tables, RLS policies, and services continue to operate unchanged. No migration is prescribed.

**Security Notes.** Alignment with V10 Zero-Trust: least-privilege access to data planes, encryption at rest and in transit, and field-level classification enforced by policy.

**Performance Notes.** Sampling, partitioning, indexing, and materialization strategies SHOULD align with SLOs published in V12.

**Governance Notes.** Owned by the Enterprise Data Council under V11 ARB with domain-level stewards defined in Chapter 6 (Data Ownership).

**Extended Discussion.**
This chapter forms part of the ZMedico Enterprise Data Platform (EDP) architectural corpus.
It codifies the intent, boundaries, and interfaces of the concern without prescribing runtime
implementation. Where implementation is eventually undertaken, the Governance Workflow ratified
in V6 SHALL apply, and the architectural boundaries defined in V8, V9, V10, V11, and V12 SHALL
be respected. Nothing in this chapter changes application code, database schema, RLS policies,
SECURITY DEFINER functions, Edge Functions, generated types, tests, package manifests, or
infrastructure assets.

**Interfaces.**
- **To V8 Authorization.** All data access decisions remain authoritative under RLS and V8
  policies. This chapter MUST NOT be interpreted as altering those decisions.
- **To V9 Identity.** Principal identity, trust envelopes, and session semantics are owned by
  V9. This chapter consumes identity as a fact; it does not redefine it.
- **To V10 Security.** Encryption, key management, and sensitivity classification are governed
  by V10. This chapter aligns to those classifications without inventing new ones.
- **To V11 Governance.** All decisions arising from this chapter SHALL be routed through the
  ARB, ADR, and lifecycle mechanisms V11 defines.
- **To V12 Observability.** Data-plane telemetry (freshness, quality, lineage, throughput) is
  emitted through the observability signals V12 standardizes; V13 defines the semantics, V12
  defines the transport.

**Design Considerations.**
- Prefer *contract-first* design: producers publish schemas and semantics before any consumer
  couples to them.
- Prefer *open standards*: SQL, OpenAPI, AsyncAPI, JSON Schema, Avro, Parquet, Iceberg/Delta,
  OpenLineage, DCAT.
- Prefer *decentralized ownership with federated governance*: domain teams own products; a
  federated council owns policy.
- Prefer *bounded contexts*: cross-domain coupling flows through published contracts, not
  through shared physical tables.
- Prefer *evolvability*: schemas evolve with compatibility rules; consumers negotiate versions
  through the schema registry.

**Anti-Patterns to Avoid.**
- Shared mutable OLTP tables as an integration channel.
- Untyped, unversioned event payloads.
- Point-to-point pipelines with no lineage capture.
- Silent schema drift with no compatibility gate.
- Uncontrolled cross-tenant joins.

**Compliance Alignment.**
- **HIPAA**: Preserve minimum necessary access; PHI is handled per V10 classifications.
- **GDPR**: Preserve lawful basis and purpose limitation; enable subject rights.
- **ISO 27001**: Align to Annex A controls for information classification, cryptography, and
  supplier data handling.
- **NIST 800-53**: Align to AC, AU, SC, and SI family controls at the data plane.

**Operational Envelope.**
- Data SLAs SHALL be published per data product (freshness, completeness, availability).
- Quality signals SHALL be observable in V12 dashboards.
- Incidents affecting data products SHALL follow the incident management workflow ratified
  by V12 Chapter 47.

**Explicit Non-Goals.**
- This chapter does NOT define authorization semantics.
- This chapter does NOT define identity or session semantics.
- This chapter does NOT define encryption primitives or key custody.
- This chapter does NOT change any existing database object, RLS policy, or SECURITY DEFINER
  function.
- This chapter does NOT introduce or modify Edge Functions or React/TypeScript modules.

**Rollout Philosophy (When Implementation Is Later Approved).**
- Additive first: introduce new datasets, contracts, and pipelines alongside existing ones.
- Shadow before cutover: run new pipelines in parallel, compare with existing outputs.
- Fitness-gated promotion: only promote when quality, lineage, and SLO gates pass.
- Reversible by default: every change SHALL have a documented rollback per V11.


## Chapter 69 — Purpose Limitation

**Purpose.** Restrict use of data to the purpose it was collected for.

**Architecture.** Layered architecture composed of ingestion, storage, processing, governance, and consumption planes, aligned to the Enterprise Reference Architecture ratified in V11.

**ASCII Diagram.**
```text
[Producers] ─▶ [Contract] ─▶ [Pipeline] ─▶ [Storage] ─▶ [Serving] ─▶ [Consumers]
                     │                                     │
                     └────────── Governance / Lineage ─────┘
```

**Rules (RFC 2119).**
- Producers MUST publish schemas to the registry before emission.
- Consumers SHALL validate payloads against the registered schema.
- Breaking changes MUST NOT be released without a governance approval per V11.
- Sensitive fields MUST be classified per Chapter 25 (Data Classification).
- Lineage SHALL be captured for every transformation.

**Examples.**
- A `patient.registered` event carries `tenant_id`, `branch_id`, and a canonical `party_id`.
- The `invoice.line` dimension conforms to the enterprise `Money` type.
- The `appointment.no_show` fact links to `Party`, `Provider`, `Location`, and `Time` dimensions.

**Future Implementation Notes.** Reference the enterprise Canonical Data Model. Do not couple to vendor-specific storage semantics. Adopt open table formats where practical.

**Backward Compatibility Notes.** Additive only. Existing schemas, tables, RLS policies, and services continue to operate unchanged. No migration is prescribed.

**Security Notes.** Alignment with V10 Zero-Trust: least-privilege access to data planes, encryption at rest and in transit, and field-level classification enforced by policy.

**Performance Notes.** Sampling, partitioning, indexing, and materialization strategies SHOULD align with SLOs published in V12.

**Governance Notes.** Owned by the Enterprise Data Council under V11 ARB with domain-level stewards defined in Chapter 6 (Data Ownership).

**Extended Discussion.**
This chapter forms part of the ZMedico Enterprise Data Platform (EDP) architectural corpus.
It codifies the intent, boundaries, and interfaces of the concern without prescribing runtime
implementation. Where implementation is eventually undertaken, the Governance Workflow ratified
in V6 SHALL apply, and the architectural boundaries defined in V8, V9, V10, V11, and V12 SHALL
be respected. Nothing in this chapter changes application code, database schema, RLS policies,
SECURITY DEFINER functions, Edge Functions, generated types, tests, package manifests, or
infrastructure assets.

**Interfaces.**
- **To V8 Authorization.** All data access decisions remain authoritative under RLS and V8
  policies. This chapter MUST NOT be interpreted as altering those decisions.
- **To V9 Identity.** Principal identity, trust envelopes, and session semantics are owned by
  V9. This chapter consumes identity as a fact; it does not redefine it.
- **To V10 Security.** Encryption, key management, and sensitivity classification are governed
  by V10. This chapter aligns to those classifications without inventing new ones.
- **To V11 Governance.** All decisions arising from this chapter SHALL be routed through the
  ARB, ADR, and lifecycle mechanisms V11 defines.
- **To V12 Observability.** Data-plane telemetry (freshness, quality, lineage, throughput) is
  emitted through the observability signals V12 standardizes; V13 defines the semantics, V12
  defines the transport.

**Design Considerations.**
- Prefer *contract-first* design: producers publish schemas and semantics before any consumer
  couples to them.
- Prefer *open standards*: SQL, OpenAPI, AsyncAPI, JSON Schema, Avro, Parquet, Iceberg/Delta,
  OpenLineage, DCAT.
- Prefer *decentralized ownership with federated governance*: domain teams own products; a
  federated council owns policy.
- Prefer *bounded contexts*: cross-domain coupling flows through published contracts, not
  through shared physical tables.
- Prefer *evolvability*: schemas evolve with compatibility rules; consumers negotiate versions
  through the schema registry.

**Anti-Patterns to Avoid.**
- Shared mutable OLTP tables as an integration channel.
- Untyped, unversioned event payloads.
- Point-to-point pipelines with no lineage capture.
- Silent schema drift with no compatibility gate.
- Uncontrolled cross-tenant joins.

**Compliance Alignment.**
- **HIPAA**: Preserve minimum necessary access; PHI is handled per V10 classifications.
- **GDPR**: Preserve lawful basis and purpose limitation; enable subject rights.
- **ISO 27001**: Align to Annex A controls for information classification, cryptography, and
  supplier data handling.
- **NIST 800-53**: Align to AC, AU, SC, and SI family controls at the data plane.

**Operational Envelope.**
- Data SLAs SHALL be published per data product (freshness, completeness, availability).
- Quality signals SHALL be observable in V12 dashboards.
- Incidents affecting data products SHALL follow the incident management workflow ratified
  by V12 Chapter 47.

**Explicit Non-Goals.**
- This chapter does NOT define authorization semantics.
- This chapter does NOT define identity or session semantics.
- This chapter does NOT define encryption primitives or key custody.
- This chapter does NOT change any existing database object, RLS policy, or SECURITY DEFINER
  function.
- This chapter does NOT introduce or modify Edge Functions or React/TypeScript modules.

**Rollout Philosophy (When Implementation Is Later Approved).**
- Additive first: introduce new datasets, contracts, and pipelines alongside existing ones.
- Shadow before cutover: run new pipelines in parallel, compare with existing outputs.
- Fitness-gated promotion: only promote when quality, lineage, and SLO gates pass.
- Reversible by default: every change SHALL have a documented rollback per V11.


## Chapter 70 — Consent Modeling

**Purpose.** Represent and enforce subject consent as data.

**Architecture.** Layered architecture composed of ingestion, storage, processing, governance, and consumption planes, aligned to the Enterprise Reference Architecture ratified in V11.

**ASCII Diagram.**
```text
[Producers] ─▶ [Contract] ─▶ [Pipeline] ─▶ [Storage] ─▶ [Serving] ─▶ [Consumers]
                     │                                     │
                     └────────── Governance / Lineage ─────┘
```

**Rules (RFC 2119).**
- Producers MUST publish schemas to the registry before emission.
- Consumers SHALL validate payloads against the registered schema.
- Breaking changes MUST NOT be released without a governance approval per V11.
- Sensitive fields MUST be classified per Chapter 25 (Data Classification).
- Lineage SHALL be captured for every transformation.

**Examples.**
- A `patient.registered` event carries `tenant_id`, `branch_id`, and a canonical `party_id`.
- The `invoice.line` dimension conforms to the enterprise `Money` type.
- The `appointment.no_show` fact links to `Party`, `Provider`, `Location`, and `Time` dimensions.

**Future Implementation Notes.** Reference the enterprise Canonical Data Model. Do not couple to vendor-specific storage semantics. Adopt open table formats where practical.

**Backward Compatibility Notes.** Additive only. Existing schemas, tables, RLS policies, and services continue to operate unchanged. No migration is prescribed.

**Security Notes.** Alignment with V10 Zero-Trust: least-privilege access to data planes, encryption at rest and in transit, and field-level classification enforced by policy.

**Performance Notes.** Sampling, partitioning, indexing, and materialization strategies SHOULD align with SLOs published in V12.

**Governance Notes.** Owned by the Enterprise Data Council under V11 ARB with domain-level stewards defined in Chapter 6 (Data Ownership).

**Extended Discussion.**
This chapter forms part of the ZMedico Enterprise Data Platform (EDP) architectural corpus.
It codifies the intent, boundaries, and interfaces of the concern without prescribing runtime
implementation. Where implementation is eventually undertaken, the Governance Workflow ratified
in V6 SHALL apply, and the architectural boundaries defined in V8, V9, V10, V11, and V12 SHALL
be respected. Nothing in this chapter changes application code, database schema, RLS policies,
SECURITY DEFINER functions, Edge Functions, generated types, tests, package manifests, or
infrastructure assets.

**Interfaces.**
- **To V8 Authorization.** All data access decisions remain authoritative under RLS and V8
  policies. This chapter MUST NOT be interpreted as altering those decisions.
- **To V9 Identity.** Principal identity, trust envelopes, and session semantics are owned by
  V9. This chapter consumes identity as a fact; it does not redefine it.
- **To V10 Security.** Encryption, key management, and sensitivity classification are governed
  by V10. This chapter aligns to those classifications without inventing new ones.
- **To V11 Governance.** All decisions arising from this chapter SHALL be routed through the
  ARB, ADR, and lifecycle mechanisms V11 defines.
- **To V12 Observability.** Data-plane telemetry (freshness, quality, lineage, throughput) is
  emitted through the observability signals V12 standardizes; V13 defines the semantics, V12
  defines the transport.

**Design Considerations.**
- Prefer *contract-first* design: producers publish schemas and semantics before any consumer
  couples to them.
- Prefer *open standards*: SQL, OpenAPI, AsyncAPI, JSON Schema, Avro, Parquet, Iceberg/Delta,
  OpenLineage, DCAT.
- Prefer *decentralized ownership with federated governance*: domain teams own products; a
  federated council owns policy.
- Prefer *bounded contexts*: cross-domain coupling flows through published contracts, not
  through shared physical tables.
- Prefer *evolvability*: schemas evolve with compatibility rules; consumers negotiate versions
  through the schema registry.

**Anti-Patterns to Avoid.**
- Shared mutable OLTP tables as an integration channel.
- Untyped, unversioned event payloads.
- Point-to-point pipelines with no lineage capture.
- Silent schema drift with no compatibility gate.
- Uncontrolled cross-tenant joins.

**Compliance Alignment.**
- **HIPAA**: Preserve minimum necessary access; PHI is handled per V10 classifications.
- **GDPR**: Preserve lawful basis and purpose limitation; enable subject rights.
- **ISO 27001**: Align to Annex A controls for information classification, cryptography, and
  supplier data handling.
- **NIST 800-53**: Align to AC, AU, SC, and SI family controls at the data plane.

**Operational Envelope.**
- Data SLAs SHALL be published per data product (freshness, completeness, availability).
- Quality signals SHALL be observable in V12 dashboards.
- Incidents affecting data products SHALL follow the incident management workflow ratified
  by V12 Chapter 47.

**Explicit Non-Goals.**
- This chapter does NOT define authorization semantics.
- This chapter does NOT define identity or session semantics.
- This chapter does NOT define encryption primitives or key custody.
- This chapter does NOT change any existing database object, RLS policy, or SECURITY DEFINER
  function.
- This chapter does NOT introduce or modify Edge Functions or React/TypeScript modules.

**Rollout Philosophy (When Implementation Is Later Approved).**
- Additive first: introduce new datasets, contracts, and pipelines alongside existing ones.
- Shadow before cutover: run new pipelines in parallel, compare with existing outputs.
- Fitness-gated promotion: only promote when quality, lineage, and SLO gates pass.
- Reversible by default: every change SHALL have a documented rollback per V11.


## Chapter 71 — Data Subject Rights

**Purpose.** Serve subject-rights requests within regulatory windows.

**Architecture.** Layered architecture composed of ingestion, storage, processing, governance, and consumption planes, aligned to the Enterprise Reference Architecture ratified in V11.

**ASCII Diagram.**
```text
[Producers] ─▶ [Contract] ─▶ [Pipeline] ─▶ [Storage] ─▶ [Serving] ─▶ [Consumers]
                     │                                     │
                     └────────── Governance / Lineage ─────┘
```

**Rules (RFC 2119).**
- Producers MUST publish schemas to the registry before emission.
- Consumers SHALL validate payloads against the registered schema.
- Breaking changes MUST NOT be released without a governance approval per V11.
- Sensitive fields MUST be classified per Chapter 25 (Data Classification).
- Lineage SHALL be captured for every transformation.

**Examples.**
- A `patient.registered` event carries `tenant_id`, `branch_id`, and a canonical `party_id`.
- The `invoice.line` dimension conforms to the enterprise `Money` type.
- The `appointment.no_show` fact links to `Party`, `Provider`, `Location`, and `Time` dimensions.

**Future Implementation Notes.** Reference the enterprise Canonical Data Model. Do not couple to vendor-specific storage semantics. Adopt open table formats where practical.

**Backward Compatibility Notes.** Additive only. Existing schemas, tables, RLS policies, and services continue to operate unchanged. No migration is prescribed.

**Security Notes.** Alignment with V10 Zero-Trust: least-privilege access to data planes, encryption at rest and in transit, and field-level classification enforced by policy.

**Performance Notes.** Sampling, partitioning, indexing, and materialization strategies SHOULD align with SLOs published in V12.

**Governance Notes.** Owned by the Enterprise Data Council under V11 ARB with domain-level stewards defined in Chapter 6 (Data Ownership).

**Extended Discussion.**
This chapter forms part of the ZMedico Enterprise Data Platform (EDP) architectural corpus.
It codifies the intent, boundaries, and interfaces of the concern without prescribing runtime
implementation. Where implementation is eventually undertaken, the Governance Workflow ratified
in V6 SHALL apply, and the architectural boundaries defined in V8, V9, V10, V11, and V12 SHALL
be respected. Nothing in this chapter changes application code, database schema, RLS policies,
SECURITY DEFINER functions, Edge Functions, generated types, tests, package manifests, or
infrastructure assets.

**Interfaces.**
- **To V8 Authorization.** All data access decisions remain authoritative under RLS and V8
  policies. This chapter MUST NOT be interpreted as altering those decisions.
- **To V9 Identity.** Principal identity, trust envelopes, and session semantics are owned by
  V9. This chapter consumes identity as a fact; it does not redefine it.
- **To V10 Security.** Encryption, key management, and sensitivity classification are governed
  by V10. This chapter aligns to those classifications without inventing new ones.
- **To V11 Governance.** All decisions arising from this chapter SHALL be routed through the
  ARB, ADR, and lifecycle mechanisms V11 defines.
- **To V12 Observability.** Data-plane telemetry (freshness, quality, lineage, throughput) is
  emitted through the observability signals V12 standardizes; V13 defines the semantics, V12
  defines the transport.

**Design Considerations.**
- Prefer *contract-first* design: producers publish schemas and semantics before any consumer
  couples to them.
- Prefer *open standards*: SQL, OpenAPI, AsyncAPI, JSON Schema, Avro, Parquet, Iceberg/Delta,
  OpenLineage, DCAT.
- Prefer *decentralized ownership with federated governance*: domain teams own products; a
  federated council owns policy.
- Prefer *bounded contexts*: cross-domain coupling flows through published contracts, not
  through shared physical tables.
- Prefer *evolvability*: schemas evolve with compatibility rules; consumers negotiate versions
  through the schema registry.

**Anti-Patterns to Avoid.**
- Shared mutable OLTP tables as an integration channel.
- Untyped, unversioned event payloads.
- Point-to-point pipelines with no lineage capture.
- Silent schema drift with no compatibility gate.
- Uncontrolled cross-tenant joins.

**Compliance Alignment.**
- **HIPAA**: Preserve minimum necessary access; PHI is handled per V10 classifications.
- **GDPR**: Preserve lawful basis and purpose limitation; enable subject rights.
- **ISO 27001**: Align to Annex A controls for information classification, cryptography, and
  supplier data handling.
- **NIST 800-53**: Align to AC, AU, SC, and SI family controls at the data plane.

**Operational Envelope.**
- Data SLAs SHALL be published per data product (freshness, completeness, availability).
- Quality signals SHALL be observable in V12 dashboards.
- Incidents affecting data products SHALL follow the incident management workflow ratified
  by V12 Chapter 47.

**Explicit Non-Goals.**
- This chapter does NOT define authorization semantics.
- This chapter does NOT define identity or session semantics.
- This chapter does NOT define encryption primitives or key custody.
- This chapter does NOT change any existing database object, RLS policy, or SECURITY DEFINER
  function.
- This chapter does NOT introduce or modify Edge Functions or React/TypeScript modules.

**Rollout Philosophy (When Implementation Is Later Approved).**
- Additive first: introduce new datasets, contracts, and pipelines alongside existing ones.
- Shadow before cutover: run new pipelines in parallel, compare with existing outputs.
- Fitness-gated promotion: only promote when quality, lineage, and SLO gates pass.
- Reversible by default: every change SHALL have a documented rollback per V11.


## Chapter 72 — Right to Erasure

**Purpose.** Implement lawful deletion with legal-hold overrides.

**Architecture.** Layered architecture composed of ingestion, storage, processing, governance, and consumption planes, aligned to the Enterprise Reference Architecture ratified in V11.

**ASCII Diagram.**
```text
[Producers] ─▶ [Contract] ─▶ [Pipeline] ─▶ [Storage] ─▶ [Serving] ─▶ [Consumers]
                     │                                     │
                     └────────── Governance / Lineage ─────┘
```

**Rules (RFC 2119).**
- Producers MUST publish schemas to the registry before emission.
- Consumers SHALL validate payloads against the registered schema.
- Breaking changes MUST NOT be released without a governance approval per V11.
- Sensitive fields MUST be classified per Chapter 25 (Data Classification).
- Lineage SHALL be captured for every transformation.

**Examples.**
- A `patient.registered` event carries `tenant_id`, `branch_id`, and a canonical `party_id`.
- The `invoice.line` dimension conforms to the enterprise `Money` type.
- The `appointment.no_show` fact links to `Party`, `Provider`, `Location`, and `Time` dimensions.

**Future Implementation Notes.** Reference the enterprise Canonical Data Model. Do not couple to vendor-specific storage semantics. Adopt open table formats where practical.

**Backward Compatibility Notes.** Additive only. Existing schemas, tables, RLS policies, and services continue to operate unchanged. No migration is prescribed.

**Security Notes.** Alignment with V10 Zero-Trust: least-privilege access to data planes, encryption at rest and in transit, and field-level classification enforced by policy.

**Performance Notes.** Sampling, partitioning, indexing, and materialization strategies SHOULD align with SLOs published in V12.

**Governance Notes.** Owned by the Enterprise Data Council under V11 ARB with domain-level stewards defined in Chapter 6 (Data Ownership).

**Extended Discussion.**
This chapter forms part of the ZMedico Enterprise Data Platform (EDP) architectural corpus.
It codifies the intent, boundaries, and interfaces of the concern without prescribing runtime
implementation. Where implementation is eventually undertaken, the Governance Workflow ratified
in V6 SHALL apply, and the architectural boundaries defined in V8, V9, V10, V11, and V12 SHALL
be respected. Nothing in this chapter changes application code, database schema, RLS policies,
SECURITY DEFINER functions, Edge Functions, generated types, tests, package manifests, or
infrastructure assets.

**Interfaces.**
- **To V8 Authorization.** All data access decisions remain authoritative under RLS and V8
  policies. This chapter MUST NOT be interpreted as altering those decisions.
- **To V9 Identity.** Principal identity, trust envelopes, and session semantics are owned by
  V9. This chapter consumes identity as a fact; it does not redefine it.
- **To V10 Security.** Encryption, key management, and sensitivity classification are governed
  by V10. This chapter aligns to those classifications without inventing new ones.
- **To V11 Governance.** All decisions arising from this chapter SHALL be routed through the
  ARB, ADR, and lifecycle mechanisms V11 defines.
- **To V12 Observability.** Data-plane telemetry (freshness, quality, lineage, throughput) is
  emitted through the observability signals V12 standardizes; V13 defines the semantics, V12
  defines the transport.

**Design Considerations.**
- Prefer *contract-first* design: producers publish schemas and semantics before any consumer
  couples to them.
- Prefer *open standards*: SQL, OpenAPI, AsyncAPI, JSON Schema, Avro, Parquet, Iceberg/Delta,
  OpenLineage, DCAT.
- Prefer *decentralized ownership with federated governance*: domain teams own products; a
  federated council owns policy.
- Prefer *bounded contexts*: cross-domain coupling flows through published contracts, not
  through shared physical tables.
- Prefer *evolvability*: schemas evolve with compatibility rules; consumers negotiate versions
  through the schema registry.

**Anti-Patterns to Avoid.**
- Shared mutable OLTP tables as an integration channel.
- Untyped, unversioned event payloads.
- Point-to-point pipelines with no lineage capture.
- Silent schema drift with no compatibility gate.
- Uncontrolled cross-tenant joins.

**Compliance Alignment.**
- **HIPAA**: Preserve minimum necessary access; PHI is handled per V10 classifications.
- **GDPR**: Preserve lawful basis and purpose limitation; enable subject rights.
- **ISO 27001**: Align to Annex A controls for information classification, cryptography, and
  supplier data handling.
- **NIST 800-53**: Align to AC, AU, SC, and SI family controls at the data plane.

**Operational Envelope.**
- Data SLAs SHALL be published per data product (freshness, completeness, availability).
- Quality signals SHALL be observable in V12 dashboards.
- Incidents affecting data products SHALL follow the incident management workflow ratified
  by V12 Chapter 47.

**Explicit Non-Goals.**
- This chapter does NOT define authorization semantics.
- This chapter does NOT define identity or session semantics.
- This chapter does NOT define encryption primitives or key custody.
- This chapter does NOT change any existing database object, RLS policy, or SECURITY DEFINER
  function.
- This chapter does NOT introduce or modify Edge Functions or React/TypeScript modules.

**Rollout Philosophy (When Implementation Is Later Approved).**
- Additive first: introduce new datasets, contracts, and pipelines alongside existing ones.
- Shadow before cutover: run new pipelines in parallel, compare with existing outputs.
- Fitness-gated promotion: only promote when quality, lineage, and SLO gates pass.
- Reversible by default: every change SHALL have a documented rollback per V11.


## Chapter 73 — Right to Access

**Purpose.** Deliver subject data in machine-readable form on request.

**Architecture.** Layered architecture composed of ingestion, storage, processing, governance, and consumption planes, aligned to the Enterprise Reference Architecture ratified in V11.

**ASCII Diagram.**
```text
[Producers] ─▶ [Contract] ─▶ [Pipeline] ─▶ [Storage] ─▶ [Serving] ─▶ [Consumers]
                     │                                     │
                     └────────── Governance / Lineage ─────┘
```

**Rules (RFC 2119).**
- Producers MUST publish schemas to the registry before emission.
- Consumers SHALL validate payloads against the registered schema.
- Breaking changes MUST NOT be released without a governance approval per V11.
- Sensitive fields MUST be classified per Chapter 25 (Data Classification).
- Lineage SHALL be captured for every transformation.

**Examples.**
- A `patient.registered` event carries `tenant_id`, `branch_id`, and a canonical `party_id`.
- The `invoice.line` dimension conforms to the enterprise `Money` type.
- The `appointment.no_show` fact links to `Party`, `Provider`, `Location`, and `Time` dimensions.

**Future Implementation Notes.** Reference the enterprise Canonical Data Model. Do not couple to vendor-specific storage semantics. Adopt open table formats where practical.

**Backward Compatibility Notes.** Additive only. Existing schemas, tables, RLS policies, and services continue to operate unchanged. No migration is prescribed.

**Security Notes.** Alignment with V10 Zero-Trust: least-privilege access to data planes, encryption at rest and in transit, and field-level classification enforced by policy.

**Performance Notes.** Sampling, partitioning, indexing, and materialization strategies SHOULD align with SLOs published in V12.

**Governance Notes.** Owned by the Enterprise Data Council under V11 ARB with domain-level stewards defined in Chapter 6 (Data Ownership).

**Extended Discussion.**
This chapter forms part of the ZMedico Enterprise Data Platform (EDP) architectural corpus.
It codifies the intent, boundaries, and interfaces of the concern without prescribing runtime
implementation. Where implementation is eventually undertaken, the Governance Workflow ratified
in V6 SHALL apply, and the architectural boundaries defined in V8, V9, V10, V11, and V12 SHALL
be respected. Nothing in this chapter changes application code, database schema, RLS policies,
SECURITY DEFINER functions, Edge Functions, generated types, tests, package manifests, or
infrastructure assets.

**Interfaces.**
- **To V8 Authorization.** All data access decisions remain authoritative under RLS and V8
  policies. This chapter MUST NOT be interpreted as altering those decisions.
- **To V9 Identity.** Principal identity, trust envelopes, and session semantics are owned by
  V9. This chapter consumes identity as a fact; it does not redefine it.
- **To V10 Security.** Encryption, key management, and sensitivity classification are governed
  by V10. This chapter aligns to those classifications without inventing new ones.
- **To V11 Governance.** All decisions arising from this chapter SHALL be routed through the
  ARB, ADR, and lifecycle mechanisms V11 defines.
- **To V12 Observability.** Data-plane telemetry (freshness, quality, lineage, throughput) is
  emitted through the observability signals V12 standardizes; V13 defines the semantics, V12
  defines the transport.

**Design Considerations.**
- Prefer *contract-first* design: producers publish schemas and semantics before any consumer
  couples to them.
- Prefer *open standards*: SQL, OpenAPI, AsyncAPI, JSON Schema, Avro, Parquet, Iceberg/Delta,
  OpenLineage, DCAT.
- Prefer *decentralized ownership with federated governance*: domain teams own products; a
  federated council owns policy.
- Prefer *bounded contexts*: cross-domain coupling flows through published contracts, not
  through shared physical tables.
- Prefer *evolvability*: schemas evolve with compatibility rules; consumers negotiate versions
  through the schema registry.

**Anti-Patterns to Avoid.**
- Shared mutable OLTP tables as an integration channel.
- Untyped, unversioned event payloads.
- Point-to-point pipelines with no lineage capture.
- Silent schema drift with no compatibility gate.
- Uncontrolled cross-tenant joins.

**Compliance Alignment.**
- **HIPAA**: Preserve minimum necessary access; PHI is handled per V10 classifications.
- **GDPR**: Preserve lawful basis and purpose limitation; enable subject rights.
- **ISO 27001**: Align to Annex A controls for information classification, cryptography, and
  supplier data handling.
- **NIST 800-53**: Align to AC, AU, SC, and SI family controls at the data plane.

**Operational Envelope.**
- Data SLAs SHALL be published per data product (freshness, completeness, availability).
- Quality signals SHALL be observable in V12 dashboards.
- Incidents affecting data products SHALL follow the incident management workflow ratified
  by V12 Chapter 47.

**Explicit Non-Goals.**
- This chapter does NOT define authorization semantics.
- This chapter does NOT define identity or session semantics.
- This chapter does NOT define encryption primitives or key custody.
- This chapter does NOT change any existing database object, RLS policy, or SECURITY DEFINER
  function.
- This chapter does NOT introduce or modify Edge Functions or React/TypeScript modules.

**Rollout Philosophy (When Implementation Is Later Approved).**
- Additive first: introduce new datasets, contracts, and pipelines alongside existing ones.
- Shadow before cutover: run new pipelines in parallel, compare with existing outputs.
- Fitness-gated promotion: only promote when quality, lineage, and SLO gates pass.
- Reversible by default: every change SHALL have a documented rollback per V11.


## Chapter 74 — Data Portability

**Purpose.** Support open, portable export formats.

**Architecture.** Layered architecture composed of ingestion, storage, processing, governance, and consumption planes, aligned to the Enterprise Reference Architecture ratified in V11.

**ASCII Diagram.**
```text
[Producers] ─▶ [Contract] ─▶ [Pipeline] ─▶ [Storage] ─▶ [Serving] ─▶ [Consumers]
                     │                                     │
                     └────────── Governance / Lineage ─────┘
```

**Rules (RFC 2119).**
- Producers MUST publish schemas to the registry before emission.
- Consumers SHALL validate payloads against the registered schema.
- Breaking changes MUST NOT be released without a governance approval per V11.
- Sensitive fields MUST be classified per Chapter 25 (Data Classification).
- Lineage SHALL be captured for every transformation.

**Examples.**
- A `patient.registered` event carries `tenant_id`, `branch_id`, and a canonical `party_id`.
- The `invoice.line` dimension conforms to the enterprise `Money` type.
- The `appointment.no_show` fact links to `Party`, `Provider`, `Location`, and `Time` dimensions.

**Future Implementation Notes.** Reference the enterprise Canonical Data Model. Do not couple to vendor-specific storage semantics. Adopt open table formats where practical.

**Backward Compatibility Notes.** Additive only. Existing schemas, tables, RLS policies, and services continue to operate unchanged. No migration is prescribed.

**Security Notes.** Alignment with V10 Zero-Trust: least-privilege access to data planes, encryption at rest and in transit, and field-level classification enforced by policy.

**Performance Notes.** Sampling, partitioning, indexing, and materialization strategies SHOULD align with SLOs published in V12.

**Governance Notes.** Owned by the Enterprise Data Council under V11 ARB with domain-level stewards defined in Chapter 6 (Data Ownership).

**Extended Discussion.**
This chapter forms part of the ZMedico Enterprise Data Platform (EDP) architectural corpus.
It codifies the intent, boundaries, and interfaces of the concern without prescribing runtime
implementation. Where implementation is eventually undertaken, the Governance Workflow ratified
in V6 SHALL apply, and the architectural boundaries defined in V8, V9, V10, V11, and V12 SHALL
be respected. Nothing in this chapter changes application code, database schema, RLS policies,
SECURITY DEFINER functions, Edge Functions, generated types, tests, package manifests, or
infrastructure assets.

**Interfaces.**
- **To V8 Authorization.** All data access decisions remain authoritative under RLS and V8
  policies. This chapter MUST NOT be interpreted as altering those decisions.
- **To V9 Identity.** Principal identity, trust envelopes, and session semantics are owned by
  V9. This chapter consumes identity as a fact; it does not redefine it.
- **To V10 Security.** Encryption, key management, and sensitivity classification are governed
  by V10. This chapter aligns to those classifications without inventing new ones.
- **To V11 Governance.** All decisions arising from this chapter SHALL be routed through the
  ARB, ADR, and lifecycle mechanisms V11 defines.
- **To V12 Observability.** Data-plane telemetry (freshness, quality, lineage, throughput) is
  emitted through the observability signals V12 standardizes; V13 defines the semantics, V12
  defines the transport.

**Design Considerations.**
- Prefer *contract-first* design: producers publish schemas and semantics before any consumer
  couples to them.
- Prefer *open standards*: SQL, OpenAPI, AsyncAPI, JSON Schema, Avro, Parquet, Iceberg/Delta,
  OpenLineage, DCAT.
- Prefer *decentralized ownership with federated governance*: domain teams own products; a
  federated council owns policy.
- Prefer *bounded contexts*: cross-domain coupling flows through published contracts, not
  through shared physical tables.
- Prefer *evolvability*: schemas evolve with compatibility rules; consumers negotiate versions
  through the schema registry.

**Anti-Patterns to Avoid.**
- Shared mutable OLTP tables as an integration channel.
- Untyped, unversioned event payloads.
- Point-to-point pipelines with no lineage capture.
- Silent schema drift with no compatibility gate.
- Uncontrolled cross-tenant joins.

**Compliance Alignment.**
- **HIPAA**: Preserve minimum necessary access; PHI is handled per V10 classifications.
- **GDPR**: Preserve lawful basis and purpose limitation; enable subject rights.
- **ISO 27001**: Align to Annex A controls for information classification, cryptography, and
  supplier data handling.
- **NIST 800-53**: Align to AC, AU, SC, and SI family controls at the data plane.

**Operational Envelope.**
- Data SLAs SHALL be published per data product (freshness, completeness, availability).
- Quality signals SHALL be observable in V12 dashboards.
- Incidents affecting data products SHALL follow the incident management workflow ratified
  by V12 Chapter 47.

**Explicit Non-Goals.**
- This chapter does NOT define authorization semantics.
- This chapter does NOT define identity or session semantics.
- This chapter does NOT define encryption primitives or key custody.
- This chapter does NOT change any existing database object, RLS policy, or SECURITY DEFINER
  function.
- This chapter does NOT introduce or modify Edge Functions or React/TypeScript modules.

**Rollout Philosophy (When Implementation Is Later Approved).**
- Additive first: introduce new datasets, contracts, and pipelines alongside existing ones.
- Shadow before cutover: run new pipelines in parallel, compare with existing outputs.
- Fitness-gated promotion: only promote when quality, lineage, and SLO gates pass.
- Reversible by default: every change SHALL have a documented rollback per V11.


## Chapter 75 — Data Retention Enforcement

**Purpose.** Automate retention timers per data class.

**Architecture.** Layered architecture composed of ingestion, storage, processing, governance, and consumption planes, aligned to the Enterprise Reference Architecture ratified in V11.

**ASCII Diagram.**
```text
[Producers] ─▶ [Contract] ─▶ [Pipeline] ─▶ [Storage] ─▶ [Serving] ─▶ [Consumers]
                     │                                     │
                     └────────── Governance / Lineage ─────┘
```

**Rules (RFC 2119).**
- Producers MUST publish schemas to the registry before emission.
- Consumers SHALL validate payloads against the registered schema.
- Breaking changes MUST NOT be released without a governance approval per V11.
- Sensitive fields MUST be classified per Chapter 25 (Data Classification).
- Lineage SHALL be captured for every transformation.

**Examples.**
- A `patient.registered` event carries `tenant_id`, `branch_id`, and a canonical `party_id`.
- The `invoice.line` dimension conforms to the enterprise `Money` type.
- The `appointment.no_show` fact links to `Party`, `Provider`, `Location`, and `Time` dimensions.

**Future Implementation Notes.** Reference the enterprise Canonical Data Model. Do not couple to vendor-specific storage semantics. Adopt open table formats where practical.

**Backward Compatibility Notes.** Additive only. Existing schemas, tables, RLS policies, and services continue to operate unchanged. No migration is prescribed.

**Security Notes.** Alignment with V10 Zero-Trust: least-privilege access to data planes, encryption at rest and in transit, and field-level classification enforced by policy.

**Performance Notes.** Sampling, partitioning, indexing, and materialization strategies SHOULD align with SLOs published in V12.

**Governance Notes.** Owned by the Enterprise Data Council under V11 ARB with domain-level stewards defined in Chapter 6 (Data Ownership).

**Extended Discussion.**
This chapter forms part of the ZMedico Enterprise Data Platform (EDP) architectural corpus.
It codifies the intent, boundaries, and interfaces of the concern without prescribing runtime
implementation. Where implementation is eventually undertaken, the Governance Workflow ratified
in V6 SHALL apply, and the architectural boundaries defined in V8, V9, V10, V11, and V12 SHALL
be respected. Nothing in this chapter changes application code, database schema, RLS policies,
SECURITY DEFINER functions, Edge Functions, generated types, tests, package manifests, or
infrastructure assets.

**Interfaces.**
- **To V8 Authorization.** All data access decisions remain authoritative under RLS and V8
  policies. This chapter MUST NOT be interpreted as altering those decisions.
- **To V9 Identity.** Principal identity, trust envelopes, and session semantics are owned by
  V9. This chapter consumes identity as a fact; it does not redefine it.
- **To V10 Security.** Encryption, key management, and sensitivity classification are governed
  by V10. This chapter aligns to those classifications without inventing new ones.
- **To V11 Governance.** All decisions arising from this chapter SHALL be routed through the
  ARB, ADR, and lifecycle mechanisms V11 defines.
- **To V12 Observability.** Data-plane telemetry (freshness, quality, lineage, throughput) is
  emitted through the observability signals V12 standardizes; V13 defines the semantics, V12
  defines the transport.

**Design Considerations.**
- Prefer *contract-first* design: producers publish schemas and semantics before any consumer
  couples to them.
- Prefer *open standards*: SQL, OpenAPI, AsyncAPI, JSON Schema, Avro, Parquet, Iceberg/Delta,
  OpenLineage, DCAT.
- Prefer *decentralized ownership with federated governance*: domain teams own products; a
  federated council owns policy.
- Prefer *bounded contexts*: cross-domain coupling flows through published contracts, not
  through shared physical tables.
- Prefer *evolvability*: schemas evolve with compatibility rules; consumers negotiate versions
  through the schema registry.

**Anti-Patterns to Avoid.**
- Shared mutable OLTP tables as an integration channel.
- Untyped, unversioned event payloads.
- Point-to-point pipelines with no lineage capture.
- Silent schema drift with no compatibility gate.
- Uncontrolled cross-tenant joins.

**Compliance Alignment.**
- **HIPAA**: Preserve minimum necessary access; PHI is handled per V10 classifications.
- **GDPR**: Preserve lawful basis and purpose limitation; enable subject rights.
- **ISO 27001**: Align to Annex A controls for information classification, cryptography, and
  supplier data handling.
- **NIST 800-53**: Align to AC, AU, SC, and SI family controls at the data plane.

**Operational Envelope.**
- Data SLAs SHALL be published per data product (freshness, completeness, availability).
- Quality signals SHALL be observable in V12 dashboards.
- Incidents affecting data products SHALL follow the incident management workflow ratified
  by V12 Chapter 47.

**Explicit Non-Goals.**
- This chapter does NOT define authorization semantics.
- This chapter does NOT define identity or session semantics.
- This chapter does NOT define encryption primitives or key custody.
- This chapter does NOT change any existing database object, RLS policy, or SECURITY DEFINER
  function.
- This chapter does NOT introduce or modify Edge Functions or React/TypeScript modules.

**Rollout Philosophy (When Implementation Is Later Approved).**
- Additive first: introduce new datasets, contracts, and pipelines alongside existing ones.
- Shadow before cutover: run new pipelines in parallel, compare with existing outputs.
- Fitness-gated promotion: only promote when quality, lineage, and SLO gates pass.
- Reversible by default: every change SHALL have a documented rollback per V11.


## Chapter 76 — Legal Hold

**Purpose.** Suspend deletion when litigation or investigation applies.

**Architecture.** Layered architecture composed of ingestion, storage, processing, governance, and consumption planes, aligned to the Enterprise Reference Architecture ratified in V11.

**ASCII Diagram.**
```text
[Producers] ─▶ [Contract] ─▶ [Pipeline] ─▶ [Storage] ─▶ [Serving] ─▶ [Consumers]
                     │                                     │
                     └────────── Governance / Lineage ─────┘
```

**Rules (RFC 2119).**
- Producers MUST publish schemas to the registry before emission.
- Consumers SHALL validate payloads against the registered schema.
- Breaking changes MUST NOT be released without a governance approval per V11.
- Sensitive fields MUST be classified per Chapter 25 (Data Classification).
- Lineage SHALL be captured for every transformation.

**Examples.**
- A `patient.registered` event carries `tenant_id`, `branch_id`, and a canonical `party_id`.
- The `invoice.line` dimension conforms to the enterprise `Money` type.
- The `appointment.no_show` fact links to `Party`, `Provider`, `Location`, and `Time` dimensions.

**Future Implementation Notes.** Reference the enterprise Canonical Data Model. Do not couple to vendor-specific storage semantics. Adopt open table formats where practical.

**Backward Compatibility Notes.** Additive only. Existing schemas, tables, RLS policies, and services continue to operate unchanged. No migration is prescribed.

**Security Notes.** Alignment with V10 Zero-Trust: least-privilege access to data planes, encryption at rest and in transit, and field-level classification enforced by policy.

**Performance Notes.** Sampling, partitioning, indexing, and materialization strategies SHOULD align with SLOs published in V12.

**Governance Notes.** Owned by the Enterprise Data Council under V11 ARB with domain-level stewards defined in Chapter 6 (Data Ownership).

**Extended Discussion.**
This chapter forms part of the ZMedico Enterprise Data Platform (EDP) architectural corpus.
It codifies the intent, boundaries, and interfaces of the concern without prescribing runtime
implementation. Where implementation is eventually undertaken, the Governance Workflow ratified
in V6 SHALL apply, and the architectural boundaries defined in V8, V9, V10, V11, and V12 SHALL
be respected. Nothing in this chapter changes application code, database schema, RLS policies,
SECURITY DEFINER functions, Edge Functions, generated types, tests, package manifests, or
infrastructure assets.

**Interfaces.**
- **To V8 Authorization.** All data access decisions remain authoritative under RLS and V8
  policies. This chapter MUST NOT be interpreted as altering those decisions.
- **To V9 Identity.** Principal identity, trust envelopes, and session semantics are owned by
  V9. This chapter consumes identity as a fact; it does not redefine it.
- **To V10 Security.** Encryption, key management, and sensitivity classification are governed
  by V10. This chapter aligns to those classifications without inventing new ones.
- **To V11 Governance.** All decisions arising from this chapter SHALL be routed through the
  ARB, ADR, and lifecycle mechanisms V11 defines.
- **To V12 Observability.** Data-plane telemetry (freshness, quality, lineage, throughput) is
  emitted through the observability signals V12 standardizes; V13 defines the semantics, V12
  defines the transport.

**Design Considerations.**
- Prefer *contract-first* design: producers publish schemas and semantics before any consumer
  couples to them.
- Prefer *open standards*: SQL, OpenAPI, AsyncAPI, JSON Schema, Avro, Parquet, Iceberg/Delta,
  OpenLineage, DCAT.
- Prefer *decentralized ownership with federated governance*: domain teams own products; a
  federated council owns policy.
- Prefer *bounded contexts*: cross-domain coupling flows through published contracts, not
  through shared physical tables.
- Prefer *evolvability*: schemas evolve with compatibility rules; consumers negotiate versions
  through the schema registry.

**Anti-Patterns to Avoid.**
- Shared mutable OLTP tables as an integration channel.
- Untyped, unversioned event payloads.
- Point-to-point pipelines with no lineage capture.
- Silent schema drift with no compatibility gate.
- Uncontrolled cross-tenant joins.

**Compliance Alignment.**
- **HIPAA**: Preserve minimum necessary access; PHI is handled per V10 classifications.
- **GDPR**: Preserve lawful basis and purpose limitation; enable subject rights.
- **ISO 27001**: Align to Annex A controls for information classification, cryptography, and
  supplier data handling.
- **NIST 800-53**: Align to AC, AU, SC, and SI family controls at the data plane.

**Operational Envelope.**
- Data SLAs SHALL be published per data product (freshness, completeness, availability).
- Quality signals SHALL be observable in V12 dashboards.
- Incidents affecting data products SHALL follow the incident management workflow ratified
  by V12 Chapter 47.

**Explicit Non-Goals.**
- This chapter does NOT define authorization semantics.
- This chapter does NOT define identity or session semantics.
- This chapter does NOT define encryption primitives or key custody.
- This chapter does NOT change any existing database object, RLS policy, or SECURITY DEFINER
  function.
- This chapter does NOT introduce or modify Edge Functions or React/TypeScript modules.

**Rollout Philosophy (When Implementation Is Later Approved).**
- Additive first: introduce new datasets, contracts, and pipelines alongside existing ones.
- Shadow before cutover: run new pipelines in parallel, compare with existing outputs.
- Fitness-gated promotion: only promote when quality, lineage, and SLO gates pass.
- Reversible by default: every change SHALL have a documented rollback per V11.


## Chapter 77 — Immutable Storage

**Purpose.** Provide tamper-evident storage for compliance workloads.

**Architecture.** Layered architecture composed of ingestion, storage, processing, governance, and consumption planes, aligned to the Enterprise Reference Architecture ratified in V11.

**ASCII Diagram.**
```text
[Producers] ─▶ [Contract] ─▶ [Pipeline] ─▶ [Storage] ─▶ [Serving] ─▶ [Consumers]
                     │                                     │
                     └────────── Governance / Lineage ─────┘
```

**Rules (RFC 2119).**
- Producers MUST publish schemas to the registry before emission.
- Consumers SHALL validate payloads against the registered schema.
- Breaking changes MUST NOT be released without a governance approval per V11.
- Sensitive fields MUST be classified per Chapter 25 (Data Classification).
- Lineage SHALL be captured for every transformation.

**Examples.**
- A `patient.registered` event carries `tenant_id`, `branch_id`, and a canonical `party_id`.
- The `invoice.line` dimension conforms to the enterprise `Money` type.
- The `appointment.no_show` fact links to `Party`, `Provider`, `Location`, and `Time` dimensions.

**Future Implementation Notes.** Reference the enterprise Canonical Data Model. Do not couple to vendor-specific storage semantics. Adopt open table formats where practical.

**Backward Compatibility Notes.** Additive only. Existing schemas, tables, RLS policies, and services continue to operate unchanged. No migration is prescribed.

**Security Notes.** Alignment with V10 Zero-Trust: least-privilege access to data planes, encryption at rest and in transit, and field-level classification enforced by policy.

**Performance Notes.** Sampling, partitioning, indexing, and materialization strategies SHOULD align with SLOs published in V12.

**Governance Notes.** Owned by the Enterprise Data Council under V11 ARB with domain-level stewards defined in Chapter 6 (Data Ownership).

**Extended Discussion.**
This chapter forms part of the ZMedico Enterprise Data Platform (EDP) architectural corpus.
It codifies the intent, boundaries, and interfaces of the concern without prescribing runtime
implementation. Where implementation is eventually undertaken, the Governance Workflow ratified
in V6 SHALL apply, and the architectural boundaries defined in V8, V9, V10, V11, and V12 SHALL
be respected. Nothing in this chapter changes application code, database schema, RLS policies,
SECURITY DEFINER functions, Edge Functions, generated types, tests, package manifests, or
infrastructure assets.

**Interfaces.**
- **To V8 Authorization.** All data access decisions remain authoritative under RLS and V8
  policies. This chapter MUST NOT be interpreted as altering those decisions.
- **To V9 Identity.** Principal identity, trust envelopes, and session semantics are owned by
  V9. This chapter consumes identity as a fact; it does not redefine it.
- **To V10 Security.** Encryption, key management, and sensitivity classification are governed
  by V10. This chapter aligns to those classifications without inventing new ones.
- **To V11 Governance.** All decisions arising from this chapter SHALL be routed through the
  ARB, ADR, and lifecycle mechanisms V11 defines.
- **To V12 Observability.** Data-plane telemetry (freshness, quality, lineage, throughput) is
  emitted through the observability signals V12 standardizes; V13 defines the semantics, V12
  defines the transport.

**Design Considerations.**
- Prefer *contract-first* design: producers publish schemas and semantics before any consumer
  couples to them.
- Prefer *open standards*: SQL, OpenAPI, AsyncAPI, JSON Schema, Avro, Parquet, Iceberg/Delta,
  OpenLineage, DCAT.
- Prefer *decentralized ownership with federated governance*: domain teams own products; a
  federated council owns policy.
- Prefer *bounded contexts*: cross-domain coupling flows through published contracts, not
  through shared physical tables.
- Prefer *evolvability*: schemas evolve with compatibility rules; consumers negotiate versions
  through the schema registry.

**Anti-Patterns to Avoid.**
- Shared mutable OLTP tables as an integration channel.
- Untyped, unversioned event payloads.
- Point-to-point pipelines with no lineage capture.
- Silent schema drift with no compatibility gate.
- Uncontrolled cross-tenant joins.

**Compliance Alignment.**
- **HIPAA**: Preserve minimum necessary access; PHI is handled per V10 classifications.
- **GDPR**: Preserve lawful basis and purpose limitation; enable subject rights.
- **ISO 27001**: Align to Annex A controls for information classification, cryptography, and
  supplier data handling.
- **NIST 800-53**: Align to AC, AU, SC, and SI family controls at the data plane.

**Operational Envelope.**
- Data SLAs SHALL be published per data product (freshness, completeness, availability).
- Quality signals SHALL be observable in V12 dashboards.
- Incidents affecting data products SHALL follow the incident management workflow ratified
  by V12 Chapter 47.

**Explicit Non-Goals.**
- This chapter does NOT define authorization semantics.
- This chapter does NOT define identity or session semantics.
- This chapter does NOT define encryption primitives or key custody.
- This chapter does NOT change any existing database object, RLS policy, or SECURITY DEFINER
  function.
- This chapter does NOT introduce or modify Edge Functions or React/TypeScript modules.

**Rollout Philosophy (When Implementation Is Later Approved).**
- Additive first: introduce new datasets, contracts, and pipelines alongside existing ones.
- Shadow before cutover: run new pipelines in parallel, compare with existing outputs.
- Fitness-gated promotion: only promote when quality, lineage, and SLO gates pass.
- Reversible by default: every change SHALL have a documented rollback per V11.


## Chapter 78 — WORM Storage

**Purpose.** Provide write-once, read-many storage for regulated logs.

**Architecture.** Layered architecture composed of ingestion, storage, processing, governance, and consumption planes, aligned to the Enterprise Reference Architecture ratified in V11.

**ASCII Diagram.**
```text
[Producers] ─▶ [Contract] ─▶ [Pipeline] ─▶ [Storage] ─▶ [Serving] ─▶ [Consumers]
                     │                                     │
                     └────────── Governance / Lineage ─────┘
```

**Rules (RFC 2119).**
- Producers MUST publish schemas to the registry before emission.
- Consumers SHALL validate payloads against the registered schema.
- Breaking changes MUST NOT be released without a governance approval per V11.
- Sensitive fields MUST be classified per Chapter 25 (Data Classification).
- Lineage SHALL be captured for every transformation.

**Examples.**
- A `patient.registered` event carries `tenant_id`, `branch_id`, and a canonical `party_id`.
- The `invoice.line` dimension conforms to the enterprise `Money` type.
- The `appointment.no_show` fact links to `Party`, `Provider`, `Location`, and `Time` dimensions.

**Future Implementation Notes.** Reference the enterprise Canonical Data Model. Do not couple to vendor-specific storage semantics. Adopt open table formats where practical.

**Backward Compatibility Notes.** Additive only. Existing schemas, tables, RLS policies, and services continue to operate unchanged. No migration is prescribed.

**Security Notes.** Alignment with V10 Zero-Trust: least-privilege access to data planes, encryption at rest and in transit, and field-level classification enforced by policy.

**Performance Notes.** Sampling, partitioning, indexing, and materialization strategies SHOULD align with SLOs published in V12.

**Governance Notes.** Owned by the Enterprise Data Council under V11 ARB with domain-level stewards defined in Chapter 6 (Data Ownership).

**Extended Discussion.**
This chapter forms part of the ZMedico Enterprise Data Platform (EDP) architectural corpus.
It codifies the intent, boundaries, and interfaces of the concern without prescribing runtime
implementation. Where implementation is eventually undertaken, the Governance Workflow ratified
in V6 SHALL apply, and the architectural boundaries defined in V8, V9, V10, V11, and V12 SHALL
be respected. Nothing in this chapter changes application code, database schema, RLS policies,
SECURITY DEFINER functions, Edge Functions, generated types, tests, package manifests, or
infrastructure assets.

**Interfaces.**
- **To V8 Authorization.** All data access decisions remain authoritative under RLS and V8
  policies. This chapter MUST NOT be interpreted as altering those decisions.
- **To V9 Identity.** Principal identity, trust envelopes, and session semantics are owned by
  V9. This chapter consumes identity as a fact; it does not redefine it.
- **To V10 Security.** Encryption, key management, and sensitivity classification are governed
  by V10. This chapter aligns to those classifications without inventing new ones.
- **To V11 Governance.** All decisions arising from this chapter SHALL be routed through the
  ARB, ADR, and lifecycle mechanisms V11 defines.
- **To V12 Observability.** Data-plane telemetry (freshness, quality, lineage, throughput) is
  emitted through the observability signals V12 standardizes; V13 defines the semantics, V12
  defines the transport.

**Design Considerations.**
- Prefer *contract-first* design: producers publish schemas and semantics before any consumer
  couples to them.
- Prefer *open standards*: SQL, OpenAPI, AsyncAPI, JSON Schema, Avro, Parquet, Iceberg/Delta,
  OpenLineage, DCAT.
- Prefer *decentralized ownership with federated governance*: domain teams own products; a
  federated council owns policy.
- Prefer *bounded contexts*: cross-domain coupling flows through published contracts, not
  through shared physical tables.
- Prefer *evolvability*: schemas evolve with compatibility rules; consumers negotiate versions
  through the schema registry.

**Anti-Patterns to Avoid.**
- Shared mutable OLTP tables as an integration channel.
- Untyped, unversioned event payloads.
- Point-to-point pipelines with no lineage capture.
- Silent schema drift with no compatibility gate.
- Uncontrolled cross-tenant joins.

**Compliance Alignment.**
- **HIPAA**: Preserve minimum necessary access; PHI is handled per V10 classifications.
- **GDPR**: Preserve lawful basis and purpose limitation; enable subject rights.
- **ISO 27001**: Align to Annex A controls for information classification, cryptography, and
  supplier data handling.
- **NIST 800-53**: Align to AC, AU, SC, and SI family controls at the data plane.

**Operational Envelope.**
- Data SLAs SHALL be published per data product (freshness, completeness, availability).
- Quality signals SHALL be observable in V12 dashboards.
- Incidents affecting data products SHALL follow the incident management workflow ratified
  by V12 Chapter 47.

**Explicit Non-Goals.**
- This chapter does NOT define authorization semantics.
- This chapter does NOT define identity or session semantics.
- This chapter does NOT define encryption primitives or key custody.
- This chapter does NOT change any existing database object, RLS policy, or SECURITY DEFINER
  function.
- This chapter does NOT introduce or modify Edge Functions or React/TypeScript modules.

**Rollout Philosophy (When Implementation Is Later Approved).**
- Additive first: introduce new datasets, contracts, and pipelines alongside existing ones.
- Shadow before cutover: run new pipelines in parallel, compare with existing outputs.
- Fitness-gated promotion: only promote when quality, lineage, and SLO gates pass.
- Reversible by default: every change SHALL have a documented rollback per V11.


## Chapter 79 — Time-Series Data

**Purpose.** Model time-indexed measurements with retention and downsampling.

**Architecture.** Layered architecture composed of ingestion, storage, processing, governance, and consumption planes, aligned to the Enterprise Reference Architecture ratified in V11.

**ASCII Diagram.**
```text
[Producers] ─▶ [Contract] ─▶ [Pipeline] ─▶ [Storage] ─▶ [Serving] ─▶ [Consumers]
                     │                                     │
                     └────────── Governance / Lineage ─────┘
```

**Rules (RFC 2119).**
- Producers MUST publish schemas to the registry before emission.
- Consumers SHALL validate payloads against the registered schema.
- Breaking changes MUST NOT be released without a governance approval per V11.
- Sensitive fields MUST be classified per Chapter 25 (Data Classification).
- Lineage SHALL be captured for every transformation.

**Examples.**
- A `patient.registered` event carries `tenant_id`, `branch_id`, and a canonical `party_id`.
- The `invoice.line` dimension conforms to the enterprise `Money` type.
- The `appointment.no_show` fact links to `Party`, `Provider`, `Location`, and `Time` dimensions.

**Future Implementation Notes.** Reference the enterprise Canonical Data Model. Do not couple to vendor-specific storage semantics. Adopt open table formats where practical.

**Backward Compatibility Notes.** Additive only. Existing schemas, tables, RLS policies, and services continue to operate unchanged. No migration is prescribed.

**Security Notes.** Alignment with V10 Zero-Trust: least-privilege access to data planes, encryption at rest and in transit, and field-level classification enforced by policy.

**Performance Notes.** Sampling, partitioning, indexing, and materialization strategies SHOULD align with SLOs published in V12.

**Governance Notes.** Owned by the Enterprise Data Council under V11 ARB with domain-level stewards defined in Chapter 6 (Data Ownership).

**Extended Discussion.**
This chapter forms part of the ZMedico Enterprise Data Platform (EDP) architectural corpus.
It codifies the intent, boundaries, and interfaces of the concern without prescribing runtime
implementation. Where implementation is eventually undertaken, the Governance Workflow ratified
in V6 SHALL apply, and the architectural boundaries defined in V8, V9, V10, V11, and V12 SHALL
be respected. Nothing in this chapter changes application code, database schema, RLS policies,
SECURITY DEFINER functions, Edge Functions, generated types, tests, package manifests, or
infrastructure assets.

**Interfaces.**
- **To V8 Authorization.** All data access decisions remain authoritative under RLS and V8
  policies. This chapter MUST NOT be interpreted as altering those decisions.
- **To V9 Identity.** Principal identity, trust envelopes, and session semantics are owned by
  V9. This chapter consumes identity as a fact; it does not redefine it.
- **To V10 Security.** Encryption, key management, and sensitivity classification are governed
  by V10. This chapter aligns to those classifications without inventing new ones.
- **To V11 Governance.** All decisions arising from this chapter SHALL be routed through the
  ARB, ADR, and lifecycle mechanisms V11 defines.
- **To V12 Observability.** Data-plane telemetry (freshness, quality, lineage, throughput) is
  emitted through the observability signals V12 standardizes; V13 defines the semantics, V12
  defines the transport.

**Design Considerations.**
- Prefer *contract-first* design: producers publish schemas and semantics before any consumer
  couples to them.
- Prefer *open standards*: SQL, OpenAPI, AsyncAPI, JSON Schema, Avro, Parquet, Iceberg/Delta,
  OpenLineage, DCAT.
- Prefer *decentralized ownership with federated governance*: domain teams own products; a
  federated council owns policy.
- Prefer *bounded contexts*: cross-domain coupling flows through published contracts, not
  through shared physical tables.
- Prefer *evolvability*: schemas evolve with compatibility rules; consumers negotiate versions
  through the schema registry.

**Anti-Patterns to Avoid.**
- Shared mutable OLTP tables as an integration channel.
- Untyped, unversioned event payloads.
- Point-to-point pipelines with no lineage capture.
- Silent schema drift with no compatibility gate.
- Uncontrolled cross-tenant joins.

**Compliance Alignment.**
- **HIPAA**: Preserve minimum necessary access; PHI is handled per V10 classifications.
- **GDPR**: Preserve lawful basis and purpose limitation; enable subject rights.
- **ISO 27001**: Align to Annex A controls for information classification, cryptography, and
  supplier data handling.
- **NIST 800-53**: Align to AC, AU, SC, and SI family controls at the data plane.

**Operational Envelope.**
- Data SLAs SHALL be published per data product (freshness, completeness, availability).
- Quality signals SHALL be observable in V12 dashboards.
- Incidents affecting data products SHALL follow the incident management workflow ratified
  by V12 Chapter 47.

**Explicit Non-Goals.**
- This chapter does NOT define authorization semantics.
- This chapter does NOT define identity or session semantics.
- This chapter does NOT define encryption primitives or key custody.
- This chapter does NOT change any existing database object, RLS policy, or SECURITY DEFINER
  function.
- This chapter does NOT introduce or modify Edge Functions or React/TypeScript modules.

**Rollout Philosophy (When Implementation Is Later Approved).**
- Additive first: introduce new datasets, contracts, and pipelines alongside existing ones.
- Shadow before cutover: run new pipelines in parallel, compare with existing outputs.
- Fitness-gated promotion: only promote when quality, lineage, and SLO gates pass.
- Reversible by default: every change SHALL have a documented rollback per V11.


## Chapter 80 — Geospatial Data

**Purpose.** Model location-aware data with standard reference systems.

**Architecture.** Layered architecture composed of ingestion, storage, processing, governance, and consumption planes, aligned to the Enterprise Reference Architecture ratified in V11.

**ASCII Diagram.**
```text
[Producers] ─▶ [Contract] ─▶ [Pipeline] ─▶ [Storage] ─▶ [Serving] ─▶ [Consumers]
                     │                                     │
                     └────────── Governance / Lineage ─────┘
```

**Rules (RFC 2119).**
- Producers MUST publish schemas to the registry before emission.
- Consumers SHALL validate payloads against the registered schema.
- Breaking changes MUST NOT be released without a governance approval per V11.
- Sensitive fields MUST be classified per Chapter 25 (Data Classification).
- Lineage SHALL be captured for every transformation.

**Examples.**
- A `patient.registered` event carries `tenant_id`, `branch_id`, and a canonical `party_id`.
- The `invoice.line` dimension conforms to the enterprise `Money` type.
- The `appointment.no_show` fact links to `Party`, `Provider`, `Location`, and `Time` dimensions.

**Future Implementation Notes.** Reference the enterprise Canonical Data Model. Do not couple to vendor-specific storage semantics. Adopt open table formats where practical.

**Backward Compatibility Notes.** Additive only. Existing schemas, tables, RLS policies, and services continue to operate unchanged. No migration is prescribed.

**Security Notes.** Alignment with V10 Zero-Trust: least-privilege access to data planes, encryption at rest and in transit, and field-level classification enforced by policy.

**Performance Notes.** Sampling, partitioning, indexing, and materialization strategies SHOULD align with SLOs published in V12.

**Governance Notes.** Owned by the Enterprise Data Council under V11 ARB with domain-level stewards defined in Chapter 6 (Data Ownership).

**Extended Discussion.**
This chapter forms part of the ZMedico Enterprise Data Platform (EDP) architectural corpus.
It codifies the intent, boundaries, and interfaces of the concern without prescribing runtime
implementation. Where implementation is eventually undertaken, the Governance Workflow ratified
in V6 SHALL apply, and the architectural boundaries defined in V8, V9, V10, V11, and V12 SHALL
be respected. Nothing in this chapter changes application code, database schema, RLS policies,
SECURITY DEFINER functions, Edge Functions, generated types, tests, package manifests, or
infrastructure assets.

**Interfaces.**
- **To V8 Authorization.** All data access decisions remain authoritative under RLS and V8
  policies. This chapter MUST NOT be interpreted as altering those decisions.
- **To V9 Identity.** Principal identity, trust envelopes, and session semantics are owned by
  V9. This chapter consumes identity as a fact; it does not redefine it.
- **To V10 Security.** Encryption, key management, and sensitivity classification are governed
  by V10. This chapter aligns to those classifications without inventing new ones.
- **To V11 Governance.** All decisions arising from this chapter SHALL be routed through the
  ARB, ADR, and lifecycle mechanisms V11 defines.
- **To V12 Observability.** Data-plane telemetry (freshness, quality, lineage, throughput) is
  emitted through the observability signals V12 standardizes; V13 defines the semantics, V12
  defines the transport.

**Design Considerations.**
- Prefer *contract-first* design: producers publish schemas and semantics before any consumer
  couples to them.
- Prefer *open standards*: SQL, OpenAPI, AsyncAPI, JSON Schema, Avro, Parquet, Iceberg/Delta,
  OpenLineage, DCAT.
- Prefer *decentralized ownership with federated governance*: domain teams own products; a
  federated council owns policy.
- Prefer *bounded contexts*: cross-domain coupling flows through published contracts, not
  through shared physical tables.
- Prefer *evolvability*: schemas evolve with compatibility rules; consumers negotiate versions
  through the schema registry.

**Anti-Patterns to Avoid.**
- Shared mutable OLTP tables as an integration channel.
- Untyped, unversioned event payloads.
- Point-to-point pipelines with no lineage capture.
- Silent schema drift with no compatibility gate.
- Uncontrolled cross-tenant joins.

**Compliance Alignment.**
- **HIPAA**: Preserve minimum necessary access; PHI is handled per V10 classifications.
- **GDPR**: Preserve lawful basis and purpose limitation; enable subject rights.
- **ISO 27001**: Align to Annex A controls for information classification, cryptography, and
  supplier data handling.
- **NIST 800-53**: Align to AC, AU, SC, and SI family controls at the data plane.

**Operational Envelope.**
- Data SLAs SHALL be published per data product (freshness, completeness, availability).
- Quality signals SHALL be observable in V12 dashboards.
- Incidents affecting data products SHALL follow the incident management workflow ratified
  by V12 Chapter 47.

**Explicit Non-Goals.**
- This chapter does NOT define authorization semantics.
- This chapter does NOT define identity or session semantics.
- This chapter does NOT define encryption primitives or key custody.
- This chapter does NOT change any existing database object, RLS policy, or SECURITY DEFINER
  function.
- This chapter does NOT introduce or modify Edge Functions or React/TypeScript modules.

**Rollout Philosophy (When Implementation Is Later Approved).**
- Additive first: introduce new datasets, contracts, and pipelines alongside existing ones.
- Shadow before cutover: run new pipelines in parallel, compare with existing outputs.
- Fitness-gated promotion: only promote when quality, lineage, and SLO gates pass.
- Reversible by default: every change SHALL have a documented rollback per V11.


## Chapter 81 — Document Data

**Purpose.** Model semi-structured documents with schemas where possible.

**Architecture.** Layered architecture composed of ingestion, storage, processing, governance, and consumption planes, aligned to the Enterprise Reference Architecture ratified in V11.

**ASCII Diagram.**
```text
[Producers] ─▶ [Contract] ─▶ [Pipeline] ─▶ [Storage] ─▶ [Serving] ─▶ [Consumers]
                     │                                     │
                     └────────── Governance / Lineage ─────┘
```

**Rules (RFC 2119).**
- Producers MUST publish schemas to the registry before emission.
- Consumers SHALL validate payloads against the registered schema.
- Breaking changes MUST NOT be released without a governance approval per V11.
- Sensitive fields MUST be classified per Chapter 25 (Data Classification).
- Lineage SHALL be captured for every transformation.

**Examples.**
- A `patient.registered` event carries `tenant_id`, `branch_id`, and a canonical `party_id`.
- The `invoice.line` dimension conforms to the enterprise `Money` type.
- The `appointment.no_show` fact links to `Party`, `Provider`, `Location`, and `Time` dimensions.

**Future Implementation Notes.** Reference the enterprise Canonical Data Model. Do not couple to vendor-specific storage semantics. Adopt open table formats where practical.

**Backward Compatibility Notes.** Additive only. Existing schemas, tables, RLS policies, and services continue to operate unchanged. No migration is prescribed.

**Security Notes.** Alignment with V10 Zero-Trust: least-privilege access to data planes, encryption at rest and in transit, and field-level classification enforced by policy.

**Performance Notes.** Sampling, partitioning, indexing, and materialization strategies SHOULD align with SLOs published in V12.

**Governance Notes.** Owned by the Enterprise Data Council under V11 ARB with domain-level stewards defined in Chapter 6 (Data Ownership).

**Extended Discussion.**
This chapter forms part of the ZMedico Enterprise Data Platform (EDP) architectural corpus.
It codifies the intent, boundaries, and interfaces of the concern without prescribing runtime
implementation. Where implementation is eventually undertaken, the Governance Workflow ratified
in V6 SHALL apply, and the architectural boundaries defined in V8, V9, V10, V11, and V12 SHALL
be respected. Nothing in this chapter changes application code, database schema, RLS policies,
SECURITY DEFINER functions, Edge Functions, generated types, tests, package manifests, or
infrastructure assets.

**Interfaces.**
- **To V8 Authorization.** All data access decisions remain authoritative under RLS and V8
  policies. This chapter MUST NOT be interpreted as altering those decisions.
- **To V9 Identity.** Principal identity, trust envelopes, and session semantics are owned by
  V9. This chapter consumes identity as a fact; it does not redefine it.
- **To V10 Security.** Encryption, key management, and sensitivity classification are governed
  by V10. This chapter aligns to those classifications without inventing new ones.
- **To V11 Governance.** All decisions arising from this chapter SHALL be routed through the
  ARB, ADR, and lifecycle mechanisms V11 defines.
- **To V12 Observability.** Data-plane telemetry (freshness, quality, lineage, throughput) is
  emitted through the observability signals V12 standardizes; V13 defines the semantics, V12
  defines the transport.

**Design Considerations.**
- Prefer *contract-first* design: producers publish schemas and semantics before any consumer
  couples to them.
- Prefer *open standards*: SQL, OpenAPI, AsyncAPI, JSON Schema, Avro, Parquet, Iceberg/Delta,
  OpenLineage, DCAT.
- Prefer *decentralized ownership with federated governance*: domain teams own products; a
  federated council owns policy.
- Prefer *bounded contexts*: cross-domain coupling flows through published contracts, not
  through shared physical tables.
- Prefer *evolvability*: schemas evolve with compatibility rules; consumers negotiate versions
  through the schema registry.

**Anti-Patterns to Avoid.**
- Shared mutable OLTP tables as an integration channel.
- Untyped, unversioned event payloads.
- Point-to-point pipelines with no lineage capture.
- Silent schema drift with no compatibility gate.
- Uncontrolled cross-tenant joins.

**Compliance Alignment.**
- **HIPAA**: Preserve minimum necessary access; PHI is handled per V10 classifications.
- **GDPR**: Preserve lawful basis and purpose limitation; enable subject rights.
- **ISO 27001**: Align to Annex A controls for information classification, cryptography, and
  supplier data handling.
- **NIST 800-53**: Align to AC, AU, SC, and SI family controls at the data plane.

**Operational Envelope.**
- Data SLAs SHALL be published per data product (freshness, completeness, availability).
- Quality signals SHALL be observable in V12 dashboards.
- Incidents affecting data products SHALL follow the incident management workflow ratified
  by V12 Chapter 47.

**Explicit Non-Goals.**
- This chapter does NOT define authorization semantics.
- This chapter does NOT define identity or session semantics.
- This chapter does NOT define encryption primitives or key custody.
- This chapter does NOT change any existing database object, RLS policy, or SECURITY DEFINER
  function.
- This chapter does NOT introduce or modify Edge Functions or React/TypeScript modules.

**Rollout Philosophy (When Implementation Is Later Approved).**
- Additive first: introduce new datasets, contracts, and pipelines alongside existing ones.
- Shadow before cutover: run new pipelines in parallel, compare with existing outputs.
- Fitness-gated promotion: only promote when quality, lineage, and SLO gates pass.
- Reversible by default: every change SHALL have a documented rollback per V11.


## Chapter 82 — Binary/Blob Data

**Purpose.** Manage large binary assets with content-addressed storage.

**Architecture.** Layered architecture composed of ingestion, storage, processing, governance, and consumption planes, aligned to the Enterprise Reference Architecture ratified in V11.

**ASCII Diagram.**
```text
[Producers] ─▶ [Contract] ─▶ [Pipeline] ─▶ [Storage] ─▶ [Serving] ─▶ [Consumers]
                     │                                     │
                     └────────── Governance / Lineage ─────┘
```

**Rules (RFC 2119).**
- Producers MUST publish schemas to the registry before emission.
- Consumers SHALL validate payloads against the registered schema.
- Breaking changes MUST NOT be released without a governance approval per V11.
- Sensitive fields MUST be classified per Chapter 25 (Data Classification).
- Lineage SHALL be captured for every transformation.

**Examples.**
- A `patient.registered` event carries `tenant_id`, `branch_id`, and a canonical `party_id`.
- The `invoice.line` dimension conforms to the enterprise `Money` type.
- The `appointment.no_show` fact links to `Party`, `Provider`, `Location`, and `Time` dimensions.

**Future Implementation Notes.** Reference the enterprise Canonical Data Model. Do not couple to vendor-specific storage semantics. Adopt open table formats where practical.

**Backward Compatibility Notes.** Additive only. Existing schemas, tables, RLS policies, and services continue to operate unchanged. No migration is prescribed.

**Security Notes.** Alignment with V10 Zero-Trust: least-privilege access to data planes, encryption at rest and in transit, and field-level classification enforced by policy.

**Performance Notes.** Sampling, partitioning, indexing, and materialization strategies SHOULD align with SLOs published in V12.

**Governance Notes.** Owned by the Enterprise Data Council under V11 ARB with domain-level stewards defined in Chapter 6 (Data Ownership).

**Extended Discussion.**
This chapter forms part of the ZMedico Enterprise Data Platform (EDP) architectural corpus.
It codifies the intent, boundaries, and interfaces of the concern without prescribing runtime
implementation. Where implementation is eventually undertaken, the Governance Workflow ratified
in V6 SHALL apply, and the architectural boundaries defined in V8, V9, V10, V11, and V12 SHALL
be respected. Nothing in this chapter changes application code, database schema, RLS policies,
SECURITY DEFINER functions, Edge Functions, generated types, tests, package manifests, or
infrastructure assets.

**Interfaces.**
- **To V8 Authorization.** All data access decisions remain authoritative under RLS and V8
  policies. This chapter MUST NOT be interpreted as altering those decisions.
- **To V9 Identity.** Principal identity, trust envelopes, and session semantics are owned by
  V9. This chapter consumes identity as a fact; it does not redefine it.
- **To V10 Security.** Encryption, key management, and sensitivity classification are governed
  by V10. This chapter aligns to those classifications without inventing new ones.
- **To V11 Governance.** All decisions arising from this chapter SHALL be routed through the
  ARB, ADR, and lifecycle mechanisms V11 defines.
- **To V12 Observability.** Data-plane telemetry (freshness, quality, lineage, throughput) is
  emitted through the observability signals V12 standardizes; V13 defines the semantics, V12
  defines the transport.

**Design Considerations.**
- Prefer *contract-first* design: producers publish schemas and semantics before any consumer
  couples to them.
- Prefer *open standards*: SQL, OpenAPI, AsyncAPI, JSON Schema, Avro, Parquet, Iceberg/Delta,
  OpenLineage, DCAT.
- Prefer *decentralized ownership with federated governance*: domain teams own products; a
  federated council owns policy.
- Prefer *bounded contexts*: cross-domain coupling flows through published contracts, not
  through shared physical tables.
- Prefer *evolvability*: schemas evolve with compatibility rules; consumers negotiate versions
  through the schema registry.

**Anti-Patterns to Avoid.**
- Shared mutable OLTP tables as an integration channel.
- Untyped, unversioned event payloads.
- Point-to-point pipelines with no lineage capture.
- Silent schema drift with no compatibility gate.
- Uncontrolled cross-tenant joins.

**Compliance Alignment.**
- **HIPAA**: Preserve minimum necessary access; PHI is handled per V10 classifications.
- **GDPR**: Preserve lawful basis and purpose limitation; enable subject rights.
- **ISO 27001**: Align to Annex A controls for information classification, cryptography, and
  supplier data handling.
- **NIST 800-53**: Align to AC, AU, SC, and SI family controls at the data plane.

**Operational Envelope.**
- Data SLAs SHALL be published per data product (freshness, completeness, availability).
- Quality signals SHALL be observable in V12 dashboards.
- Incidents affecting data products SHALL follow the incident management workflow ratified
  by V12 Chapter 47.

**Explicit Non-Goals.**
- This chapter does NOT define authorization semantics.
- This chapter does NOT define identity or session semantics.
- This chapter does NOT define encryption primitives or key custody.
- This chapter does NOT change any existing database object, RLS policy, or SECURITY DEFINER
  function.
- This chapter does NOT introduce or modify Edge Functions or React/TypeScript modules.

**Rollout Philosophy (When Implementation Is Later Approved).**
- Additive first: introduce new datasets, contracts, and pipelines alongside existing ones.
- Shadow before cutover: run new pipelines in parallel, compare with existing outputs.
- Fitness-gated promotion: only promote when quality, lineage, and SLO gates pass.
- Reversible by default: every change SHALL have a documented rollback per V11.


## Chapter 83 — Unstructured Data

**Purpose.** Govern text, image, audio, and video with metadata and classification.

**Architecture.** Layered architecture composed of ingestion, storage, processing, governance, and consumption planes, aligned to the Enterprise Reference Architecture ratified in V11.

**ASCII Diagram.**
```text
[Producers] ─▶ [Contract] ─▶ [Pipeline] ─▶ [Storage] ─▶ [Serving] ─▶ [Consumers]
                     │                                     │
                     └────────── Governance / Lineage ─────┘
```

**Rules (RFC 2119).**
- Producers MUST publish schemas to the registry before emission.
- Consumers SHALL validate payloads against the registered schema.
- Breaking changes MUST NOT be released without a governance approval per V11.
- Sensitive fields MUST be classified per Chapter 25 (Data Classification).
- Lineage SHALL be captured for every transformation.

**Examples.**
- A `patient.registered` event carries `tenant_id`, `branch_id`, and a canonical `party_id`.
- The `invoice.line` dimension conforms to the enterprise `Money` type.
- The `appointment.no_show` fact links to `Party`, `Provider`, `Location`, and `Time` dimensions.

**Future Implementation Notes.** Reference the enterprise Canonical Data Model. Do not couple to vendor-specific storage semantics. Adopt open table formats where practical.

**Backward Compatibility Notes.** Additive only. Existing schemas, tables, RLS policies, and services continue to operate unchanged. No migration is prescribed.

**Security Notes.** Alignment with V10 Zero-Trust: least-privilege access to data planes, encryption at rest and in transit, and field-level classification enforced by policy.

**Performance Notes.** Sampling, partitioning, indexing, and materialization strategies SHOULD align with SLOs published in V12.

**Governance Notes.** Owned by the Enterprise Data Council under V11 ARB with domain-level stewards defined in Chapter 6 (Data Ownership).

**Extended Discussion.**
This chapter forms part of the ZMedico Enterprise Data Platform (EDP) architectural corpus.
It codifies the intent, boundaries, and interfaces of the concern without prescribing runtime
implementation. Where implementation is eventually undertaken, the Governance Workflow ratified
in V6 SHALL apply, and the architectural boundaries defined in V8, V9, V10, V11, and V12 SHALL
be respected. Nothing in this chapter changes application code, database schema, RLS policies,
SECURITY DEFINER functions, Edge Functions, generated types, tests, package manifests, or
infrastructure assets.

**Interfaces.**
- **To V8 Authorization.** All data access decisions remain authoritative under RLS and V8
  policies. This chapter MUST NOT be interpreted as altering those decisions.
- **To V9 Identity.** Principal identity, trust envelopes, and session semantics are owned by
  V9. This chapter consumes identity as a fact; it does not redefine it.
- **To V10 Security.** Encryption, key management, and sensitivity classification are governed
  by V10. This chapter aligns to those classifications without inventing new ones.
- **To V11 Governance.** All decisions arising from this chapter SHALL be routed through the
  ARB, ADR, and lifecycle mechanisms V11 defines.
- **To V12 Observability.** Data-plane telemetry (freshness, quality, lineage, throughput) is
  emitted through the observability signals V12 standardizes; V13 defines the semantics, V12
  defines the transport.

**Design Considerations.**
- Prefer *contract-first* design: producers publish schemas and semantics before any consumer
  couples to them.
- Prefer *open standards*: SQL, OpenAPI, AsyncAPI, JSON Schema, Avro, Parquet, Iceberg/Delta,
  OpenLineage, DCAT.
- Prefer *decentralized ownership with federated governance*: domain teams own products; a
  federated council owns policy.
- Prefer *bounded contexts*: cross-domain coupling flows through published contracts, not
  through shared physical tables.
- Prefer *evolvability*: schemas evolve with compatibility rules; consumers negotiate versions
  through the schema registry.

**Anti-Patterns to Avoid.**
- Shared mutable OLTP tables as an integration channel.
- Untyped, unversioned event payloads.
- Point-to-point pipelines with no lineage capture.
- Silent schema drift with no compatibility gate.
- Uncontrolled cross-tenant joins.

**Compliance Alignment.**
- **HIPAA**: Preserve minimum necessary access; PHI is handled per V10 classifications.
- **GDPR**: Preserve lawful basis and purpose limitation; enable subject rights.
- **ISO 27001**: Align to Annex A controls for information classification, cryptography, and
  supplier data handling.
- **NIST 800-53**: Align to AC, AU, SC, and SI family controls at the data plane.

**Operational Envelope.**
- Data SLAs SHALL be published per data product (freshness, completeness, availability).
- Quality signals SHALL be observable in V12 dashboards.
- Incidents affecting data products SHALL follow the incident management workflow ratified
  by V12 Chapter 47.

**Explicit Non-Goals.**
- This chapter does NOT define authorization semantics.
- This chapter does NOT define identity or session semantics.
- This chapter does NOT define encryption primitives or key custody.
- This chapter does NOT change any existing database object, RLS policy, or SECURITY DEFINER
  function.
- This chapter does NOT introduce or modify Edge Functions or React/TypeScript modules.

**Rollout Philosophy (When Implementation Is Later Approved).**
- Additive first: introduce new datasets, contracts, and pipelines alongside existing ones.
- Shadow before cutover: run new pipelines in parallel, compare with existing outputs.
- Fitness-gated promotion: only promote when quality, lineage, and SLO gates pass.
- Reversible by default: every change SHALL have a documented rollback per V11.


## Chapter 84 — Semi-Structured Data

**Purpose.** Govern JSON/XML with schemas and validation.

**Architecture.** Layered architecture composed of ingestion, storage, processing, governance, and consumption planes, aligned to the Enterprise Reference Architecture ratified in V11.

**ASCII Diagram.**
```text
[Producers] ─▶ [Contract] ─▶ [Pipeline] ─▶ [Storage] ─▶ [Serving] ─▶ [Consumers]
                     │                                     │
                     └────────── Governance / Lineage ─────┘
```

**Rules (RFC 2119).**
- Producers MUST publish schemas to the registry before emission.
- Consumers SHALL validate payloads against the registered schema.
- Breaking changes MUST NOT be released without a governance approval per V11.
- Sensitive fields MUST be classified per Chapter 25 (Data Classification).
- Lineage SHALL be captured for every transformation.

**Examples.**
- A `patient.registered` event carries `tenant_id`, `branch_id`, and a canonical `party_id`.
- The `invoice.line` dimension conforms to the enterprise `Money` type.
- The `appointment.no_show` fact links to `Party`, `Provider`, `Location`, and `Time` dimensions.

**Future Implementation Notes.** Reference the enterprise Canonical Data Model. Do not couple to vendor-specific storage semantics. Adopt open table formats where practical.

**Backward Compatibility Notes.** Additive only. Existing schemas, tables, RLS policies, and services continue to operate unchanged. No migration is prescribed.

**Security Notes.** Alignment with V10 Zero-Trust: least-privilege access to data planes, encryption at rest and in transit, and field-level classification enforced by policy.

**Performance Notes.** Sampling, partitioning, indexing, and materialization strategies SHOULD align with SLOs published in V12.

**Governance Notes.** Owned by the Enterprise Data Council under V11 ARB with domain-level stewards defined in Chapter 6 (Data Ownership).

**Extended Discussion.**
This chapter forms part of the ZMedico Enterprise Data Platform (EDP) architectural corpus.
It codifies the intent, boundaries, and interfaces of the concern without prescribing runtime
implementation. Where implementation is eventually undertaken, the Governance Workflow ratified
in V6 SHALL apply, and the architectural boundaries defined in V8, V9, V10, V11, and V12 SHALL
be respected. Nothing in this chapter changes application code, database schema, RLS policies,
SECURITY DEFINER functions, Edge Functions, generated types, tests, package manifests, or
infrastructure assets.

**Interfaces.**
- **To V8 Authorization.** All data access decisions remain authoritative under RLS and V8
  policies. This chapter MUST NOT be interpreted as altering those decisions.
- **To V9 Identity.** Principal identity, trust envelopes, and session semantics are owned by
  V9. This chapter consumes identity as a fact; it does not redefine it.
- **To V10 Security.** Encryption, key management, and sensitivity classification are governed
  by V10. This chapter aligns to those classifications without inventing new ones.
- **To V11 Governance.** All decisions arising from this chapter SHALL be routed through the
  ARB, ADR, and lifecycle mechanisms V11 defines.
- **To V12 Observability.** Data-plane telemetry (freshness, quality, lineage, throughput) is
  emitted through the observability signals V12 standardizes; V13 defines the semantics, V12
  defines the transport.

**Design Considerations.**
- Prefer *contract-first* design: producers publish schemas and semantics before any consumer
  couples to them.
- Prefer *open standards*: SQL, OpenAPI, AsyncAPI, JSON Schema, Avro, Parquet, Iceberg/Delta,
  OpenLineage, DCAT.
- Prefer *decentralized ownership with federated governance*: domain teams own products; a
  federated council owns policy.
- Prefer *bounded contexts*: cross-domain coupling flows through published contracts, not
  through shared physical tables.
- Prefer *evolvability*: schemas evolve with compatibility rules; consumers negotiate versions
  through the schema registry.

**Anti-Patterns to Avoid.**
- Shared mutable OLTP tables as an integration channel.
- Untyped, unversioned event payloads.
- Point-to-point pipelines with no lineage capture.
- Silent schema drift with no compatibility gate.
- Uncontrolled cross-tenant joins.

**Compliance Alignment.**
- **HIPAA**: Preserve minimum necessary access; PHI is handled per V10 classifications.
- **GDPR**: Preserve lawful basis and purpose limitation; enable subject rights.
- **ISO 27001**: Align to Annex A controls for information classification, cryptography, and
  supplier data handling.
- **NIST 800-53**: Align to AC, AU, SC, and SI family controls at the data plane.

**Operational Envelope.**
- Data SLAs SHALL be published per data product (freshness, completeness, availability).
- Quality signals SHALL be observable in V12 dashboards.
- Incidents affecting data products SHALL follow the incident management workflow ratified
  by V12 Chapter 47.

**Explicit Non-Goals.**
- This chapter does NOT define authorization semantics.
- This chapter does NOT define identity or session semantics.
- This chapter does NOT define encryption primitives or key custody.
- This chapter does NOT change any existing database object, RLS policy, or SECURITY DEFINER
  function.
- This chapter does NOT introduce or modify Edge Functions or React/TypeScript modules.

**Rollout Philosophy (When Implementation Is Later Approved).**
- Additive first: introduce new datasets, contracts, and pipelines alongside existing ones.
- Shadow before cutover: run new pipelines in parallel, compare with existing outputs.
- Fitness-gated promotion: only promote when quality, lineage, and SLO gates pass.
- Reversible by default: every change SHALL have a documented rollback per V11.


## Chapter 85 — Structured Data

**Purpose.** Govern relational data with strong types and constraints.

**Architecture.** Layered architecture composed of ingestion, storage, processing, governance, and consumption planes, aligned to the Enterprise Reference Architecture ratified in V11.

**ASCII Diagram.**
```text
[Producers] ─▶ [Contract] ─▶ [Pipeline] ─▶ [Storage] ─▶ [Serving] ─▶ [Consumers]
                     │                                     │
                     └────────── Governance / Lineage ─────┘
```

**Rules (RFC 2119).**
- Producers MUST publish schemas to the registry before emission.
- Consumers SHALL validate payloads against the registered schema.
- Breaking changes MUST NOT be released without a governance approval per V11.
- Sensitive fields MUST be classified per Chapter 25 (Data Classification).
- Lineage SHALL be captured for every transformation.

**Examples.**
- A `patient.registered` event carries `tenant_id`, `branch_id`, and a canonical `party_id`.
- The `invoice.line` dimension conforms to the enterprise `Money` type.
- The `appointment.no_show` fact links to `Party`, `Provider`, `Location`, and `Time` dimensions.

**Future Implementation Notes.** Reference the enterprise Canonical Data Model. Do not couple to vendor-specific storage semantics. Adopt open table formats where practical.

**Backward Compatibility Notes.** Additive only. Existing schemas, tables, RLS policies, and services continue to operate unchanged. No migration is prescribed.

**Security Notes.** Alignment with V10 Zero-Trust: least-privilege access to data planes, encryption at rest and in transit, and field-level classification enforced by policy.

**Performance Notes.** Sampling, partitioning, indexing, and materialization strategies SHOULD align with SLOs published in V12.

**Governance Notes.** Owned by the Enterprise Data Council under V11 ARB with domain-level stewards defined in Chapter 6 (Data Ownership).

**Extended Discussion.**
This chapter forms part of the ZMedico Enterprise Data Platform (EDP) architectural corpus.
It codifies the intent, boundaries, and interfaces of the concern without prescribing runtime
implementation. Where implementation is eventually undertaken, the Governance Workflow ratified
in V6 SHALL apply, and the architectural boundaries defined in V8, V9, V10, V11, and V12 SHALL
be respected. Nothing in this chapter changes application code, database schema, RLS policies,
SECURITY DEFINER functions, Edge Functions, generated types, tests, package manifests, or
infrastructure assets.

**Interfaces.**
- **To V8 Authorization.** All data access decisions remain authoritative under RLS and V8
  policies. This chapter MUST NOT be interpreted as altering those decisions.
- **To V9 Identity.** Principal identity, trust envelopes, and session semantics are owned by
  V9. This chapter consumes identity as a fact; it does not redefine it.
- **To V10 Security.** Encryption, key management, and sensitivity classification are governed
  by V10. This chapter aligns to those classifications without inventing new ones.
- **To V11 Governance.** All decisions arising from this chapter SHALL be routed through the
  ARB, ADR, and lifecycle mechanisms V11 defines.
- **To V12 Observability.** Data-plane telemetry (freshness, quality, lineage, throughput) is
  emitted through the observability signals V12 standardizes; V13 defines the semantics, V12
  defines the transport.

**Design Considerations.**
- Prefer *contract-first* design: producers publish schemas and semantics before any consumer
  couples to them.
- Prefer *open standards*: SQL, OpenAPI, AsyncAPI, JSON Schema, Avro, Parquet, Iceberg/Delta,
  OpenLineage, DCAT.
- Prefer *decentralized ownership with federated governance*: domain teams own products; a
  federated council owns policy.
- Prefer *bounded contexts*: cross-domain coupling flows through published contracts, not
  through shared physical tables.
- Prefer *evolvability*: schemas evolve with compatibility rules; consumers negotiate versions
  through the schema registry.

**Anti-Patterns to Avoid.**
- Shared mutable OLTP tables as an integration channel.
- Untyped, unversioned event payloads.
- Point-to-point pipelines with no lineage capture.
- Silent schema drift with no compatibility gate.
- Uncontrolled cross-tenant joins.

**Compliance Alignment.**
- **HIPAA**: Preserve minimum necessary access; PHI is handled per V10 classifications.
- **GDPR**: Preserve lawful basis and purpose limitation; enable subject rights.
- **ISO 27001**: Align to Annex A controls for information classification, cryptography, and
  supplier data handling.
- **NIST 800-53**: Align to AC, AU, SC, and SI family controls at the data plane.

**Operational Envelope.**
- Data SLAs SHALL be published per data product (freshness, completeness, availability).
- Quality signals SHALL be observable in V12 dashboards.
- Incidents affecting data products SHALL follow the incident management workflow ratified
  by V12 Chapter 47.

**Explicit Non-Goals.**
- This chapter does NOT define authorization semantics.
- This chapter does NOT define identity or session semantics.
- This chapter does NOT define encryption primitives or key custody.
- This chapter does NOT change any existing database object, RLS policy, or SECURITY DEFINER
  function.
- This chapter does NOT introduce or modify Edge Functions or React/TypeScript modules.

**Rollout Philosophy (When Implementation Is Later Approved).**
- Additive first: introduce new datasets, contracts, and pipelines alongside existing ones.
- Shadow before cutover: run new pipelines in parallel, compare with existing outputs.
- Fitness-gated promotion: only promote when quality, lineage, and SLO gates pass.
- Reversible by default: every change SHALL have a documented rollback per V11.


## Chapter 86 — Data Modeling Standards

**Purpose.** Prescribe modeling patterns and anti-patterns.

**Architecture.** Layered architecture composed of ingestion, storage, processing, governance, and consumption planes, aligned to the Enterprise Reference Architecture ratified in V11.

**ASCII Diagram.**
```text
[Producers] ─▶ [Contract] ─▶ [Pipeline] ─▶ [Storage] ─▶ [Serving] ─▶ [Consumers]
                     │                                     │
                     └────────── Governance / Lineage ─────┘
```

**Rules (RFC 2119).**
- Producers MUST publish schemas to the registry before emission.
- Consumers SHALL validate payloads against the registered schema.
- Breaking changes MUST NOT be released without a governance approval per V11.
- Sensitive fields MUST be classified per Chapter 25 (Data Classification).
- Lineage SHALL be captured for every transformation.

**Examples.**
- A `patient.registered` event carries `tenant_id`, `branch_id`, and a canonical `party_id`.
- The `invoice.line` dimension conforms to the enterprise `Money` type.
- The `appointment.no_show` fact links to `Party`, `Provider`, `Location`, and `Time` dimensions.

**Future Implementation Notes.** Reference the enterprise Canonical Data Model. Do not couple to vendor-specific storage semantics. Adopt open table formats where practical.

**Backward Compatibility Notes.** Additive only. Existing schemas, tables, RLS policies, and services continue to operate unchanged. No migration is prescribed.

**Security Notes.** Alignment with V10 Zero-Trust: least-privilege access to data planes, encryption at rest and in transit, and field-level classification enforced by policy.

**Performance Notes.** Sampling, partitioning, indexing, and materialization strategies SHOULD align with SLOs published in V12.

**Governance Notes.** Owned by the Enterprise Data Council under V11 ARB with domain-level stewards defined in Chapter 6 (Data Ownership).

**Extended Discussion.**
This chapter forms part of the ZMedico Enterprise Data Platform (EDP) architectural corpus.
It codifies the intent, boundaries, and interfaces of the concern without prescribing runtime
implementation. Where implementation is eventually undertaken, the Governance Workflow ratified
in V6 SHALL apply, and the architectural boundaries defined in V8, V9, V10, V11, and V12 SHALL
be respected. Nothing in this chapter changes application code, database schema, RLS policies,
SECURITY DEFINER functions, Edge Functions, generated types, tests, package manifests, or
infrastructure assets.

**Interfaces.**
- **To V8 Authorization.** All data access decisions remain authoritative under RLS and V8
  policies. This chapter MUST NOT be interpreted as altering those decisions.
- **To V9 Identity.** Principal identity, trust envelopes, and session semantics are owned by
  V9. This chapter consumes identity as a fact; it does not redefine it.
- **To V10 Security.** Encryption, key management, and sensitivity classification are governed
  by V10. This chapter aligns to those classifications without inventing new ones.
- **To V11 Governance.** All decisions arising from this chapter SHALL be routed through the
  ARB, ADR, and lifecycle mechanisms V11 defines.
- **To V12 Observability.** Data-plane telemetry (freshness, quality, lineage, throughput) is
  emitted through the observability signals V12 standardizes; V13 defines the semantics, V12
  defines the transport.

**Design Considerations.**
- Prefer *contract-first* design: producers publish schemas and semantics before any consumer
  couples to them.
- Prefer *open standards*: SQL, OpenAPI, AsyncAPI, JSON Schema, Avro, Parquet, Iceberg/Delta,
  OpenLineage, DCAT.
- Prefer *decentralized ownership with federated governance*: domain teams own products; a
  federated council owns policy.
- Prefer *bounded contexts*: cross-domain coupling flows through published contracts, not
  through shared physical tables.
- Prefer *evolvability*: schemas evolve with compatibility rules; consumers negotiate versions
  through the schema registry.

**Anti-Patterns to Avoid.**
- Shared mutable OLTP tables as an integration channel.
- Untyped, unversioned event payloads.
- Point-to-point pipelines with no lineage capture.
- Silent schema drift with no compatibility gate.
- Uncontrolled cross-tenant joins.

**Compliance Alignment.**
- **HIPAA**: Preserve minimum necessary access; PHI is handled per V10 classifications.
- **GDPR**: Preserve lawful basis and purpose limitation; enable subject rights.
- **ISO 27001**: Align to Annex A controls for information classification, cryptography, and
  supplier data handling.
- **NIST 800-53**: Align to AC, AU, SC, and SI family controls at the data plane.

**Operational Envelope.**
- Data SLAs SHALL be published per data product (freshness, completeness, availability).
- Quality signals SHALL be observable in V12 dashboards.
- Incidents affecting data products SHALL follow the incident management workflow ratified
  by V12 Chapter 47.

**Explicit Non-Goals.**
- This chapter does NOT define authorization semantics.
- This chapter does NOT define identity or session semantics.
- This chapter does NOT define encryption primitives or key custody.
- This chapter does NOT change any existing database object, RLS policy, or SECURITY DEFINER
  function.
- This chapter does NOT introduce or modify Edge Functions or React/TypeScript modules.

**Rollout Philosophy (When Implementation Is Later Approved).**
- Additive first: introduce new datasets, contracts, and pipelines alongside existing ones.
- Shadow before cutover: run new pipelines in parallel, compare with existing outputs.
- Fitness-gated promotion: only promote when quality, lineage, and SLO gates pass.
- Reversible by default: every change SHALL have a documented rollback per V11.


## Chapter 87 — Naming Conventions

**Purpose.** Enforce consistent, discoverable identifiers.

**Architecture.** Layered architecture composed of ingestion, storage, processing, governance, and consumption planes, aligned to the Enterprise Reference Architecture ratified in V11.

**ASCII Diagram.**
```text
[Producers] ─▶ [Contract] ─▶ [Pipeline] ─▶ [Storage] ─▶ [Serving] ─▶ [Consumers]
                     │                                     │
                     └────────── Governance / Lineage ─────┘
```

**Rules (RFC 2119).**
- Producers MUST publish schemas to the registry before emission.
- Consumers SHALL validate payloads against the registered schema.
- Breaking changes MUST NOT be released without a governance approval per V11.
- Sensitive fields MUST be classified per Chapter 25 (Data Classification).
- Lineage SHALL be captured for every transformation.

**Examples.**
- A `patient.registered` event carries `tenant_id`, `branch_id`, and a canonical `party_id`.
- The `invoice.line` dimension conforms to the enterprise `Money` type.
- The `appointment.no_show` fact links to `Party`, `Provider`, `Location`, and `Time` dimensions.

**Future Implementation Notes.** Reference the enterprise Canonical Data Model. Do not couple to vendor-specific storage semantics. Adopt open table formats where practical.

**Backward Compatibility Notes.** Additive only. Existing schemas, tables, RLS policies, and services continue to operate unchanged. No migration is prescribed.

**Security Notes.** Alignment with V10 Zero-Trust: least-privilege access to data planes, encryption at rest and in transit, and field-level classification enforced by policy.

**Performance Notes.** Sampling, partitioning, indexing, and materialization strategies SHOULD align with SLOs published in V12.

**Governance Notes.** Owned by the Enterprise Data Council under V11 ARB with domain-level stewards defined in Chapter 6 (Data Ownership).

**Extended Discussion.**
This chapter forms part of the ZMedico Enterprise Data Platform (EDP) architectural corpus.
It codifies the intent, boundaries, and interfaces of the concern without prescribing runtime
implementation. Where implementation is eventually undertaken, the Governance Workflow ratified
in V6 SHALL apply, and the architectural boundaries defined in V8, V9, V10, V11, and V12 SHALL
be respected. Nothing in this chapter changes application code, database schema, RLS policies,
SECURITY DEFINER functions, Edge Functions, generated types, tests, package manifests, or
infrastructure assets.

**Interfaces.**
- **To V8 Authorization.** All data access decisions remain authoritative under RLS and V8
  policies. This chapter MUST NOT be interpreted as altering those decisions.
- **To V9 Identity.** Principal identity, trust envelopes, and session semantics are owned by
  V9. This chapter consumes identity as a fact; it does not redefine it.
- **To V10 Security.** Encryption, key management, and sensitivity classification are governed
  by V10. This chapter aligns to those classifications without inventing new ones.
- **To V11 Governance.** All decisions arising from this chapter SHALL be routed through the
  ARB, ADR, and lifecycle mechanisms V11 defines.
- **To V12 Observability.** Data-plane telemetry (freshness, quality, lineage, throughput) is
  emitted through the observability signals V12 standardizes; V13 defines the semantics, V12
  defines the transport.

**Design Considerations.**
- Prefer *contract-first* design: producers publish schemas and semantics before any consumer
  couples to them.
- Prefer *open standards*: SQL, OpenAPI, AsyncAPI, JSON Schema, Avro, Parquet, Iceberg/Delta,
  OpenLineage, DCAT.
- Prefer *decentralized ownership with federated governance*: domain teams own products; a
  federated council owns policy.
- Prefer *bounded contexts*: cross-domain coupling flows through published contracts, not
  through shared physical tables.
- Prefer *evolvability*: schemas evolve with compatibility rules; consumers negotiate versions
  through the schema registry.

**Anti-Patterns to Avoid.**
- Shared mutable OLTP tables as an integration channel.
- Untyped, unversioned event payloads.
- Point-to-point pipelines with no lineage capture.
- Silent schema drift with no compatibility gate.
- Uncontrolled cross-tenant joins.

**Compliance Alignment.**
- **HIPAA**: Preserve minimum necessary access; PHI is handled per V10 classifications.
- **GDPR**: Preserve lawful basis and purpose limitation; enable subject rights.
- **ISO 27001**: Align to Annex A controls for information classification, cryptography, and
  supplier data handling.
- **NIST 800-53**: Align to AC, AU, SC, and SI family controls at the data plane.

**Operational Envelope.**
- Data SLAs SHALL be published per data product (freshness, completeness, availability).
- Quality signals SHALL be observable in V12 dashboards.
- Incidents affecting data products SHALL follow the incident management workflow ratified
  by V12 Chapter 47.

**Explicit Non-Goals.**
- This chapter does NOT define authorization semantics.
- This chapter does NOT define identity or session semantics.
- This chapter does NOT define encryption primitives or key custody.
- This chapter does NOT change any existing database object, RLS policy, or SECURITY DEFINER
  function.
- This chapter does NOT introduce or modify Edge Functions or React/TypeScript modules.

**Rollout Philosophy (When Implementation Is Later Approved).**
- Additive first: introduce new datasets, contracts, and pipelines alongside existing ones.
- Shadow before cutover: run new pipelines in parallel, compare with existing outputs.
- Fitness-gated promotion: only promote when quality, lineage, and SLO gates pass.
- Reversible by default: every change SHALL have a documented rollback per V11.


## Chapter 88 — Data Types Standard

**Purpose.** Standardize primitive and composite types across systems.

**Architecture.** Layered architecture composed of ingestion, storage, processing, governance, and consumption planes, aligned to the Enterprise Reference Architecture ratified in V11.

**ASCII Diagram.**
```text
[Producers] ─▶ [Contract] ─▶ [Pipeline] ─▶ [Storage] ─▶ [Serving] ─▶ [Consumers]
                     │                                     │
                     └────────── Governance / Lineage ─────┘
```

**Rules (RFC 2119).**
- Producers MUST publish schemas to the registry before emission.
- Consumers SHALL validate payloads against the registered schema.
- Breaking changes MUST NOT be released without a governance approval per V11.
- Sensitive fields MUST be classified per Chapter 25 (Data Classification).
- Lineage SHALL be captured for every transformation.

**Examples.**
- A `patient.registered` event carries `tenant_id`, `branch_id`, and a canonical `party_id`.
- The `invoice.line` dimension conforms to the enterprise `Money` type.
- The `appointment.no_show` fact links to `Party`, `Provider`, `Location`, and `Time` dimensions.

**Future Implementation Notes.** Reference the enterprise Canonical Data Model. Do not couple to vendor-specific storage semantics. Adopt open table formats where practical.

**Backward Compatibility Notes.** Additive only. Existing schemas, tables, RLS policies, and services continue to operate unchanged. No migration is prescribed.

**Security Notes.** Alignment with V10 Zero-Trust: least-privilege access to data planes, encryption at rest and in transit, and field-level classification enforced by policy.

**Performance Notes.** Sampling, partitioning, indexing, and materialization strategies SHOULD align with SLOs published in V12.

**Governance Notes.** Owned by the Enterprise Data Council under V11 ARB with domain-level stewards defined in Chapter 6 (Data Ownership).

**Extended Discussion.**
This chapter forms part of the ZMedico Enterprise Data Platform (EDP) architectural corpus.
It codifies the intent, boundaries, and interfaces of the concern without prescribing runtime
implementation. Where implementation is eventually undertaken, the Governance Workflow ratified
in V6 SHALL apply, and the architectural boundaries defined in V8, V9, V10, V11, and V12 SHALL
be respected. Nothing in this chapter changes application code, database schema, RLS policies,
SECURITY DEFINER functions, Edge Functions, generated types, tests, package manifests, or
infrastructure assets.

**Interfaces.**
- **To V8 Authorization.** All data access decisions remain authoritative under RLS and V8
  policies. This chapter MUST NOT be interpreted as altering those decisions.
- **To V9 Identity.** Principal identity, trust envelopes, and session semantics are owned by
  V9. This chapter consumes identity as a fact; it does not redefine it.
- **To V10 Security.** Encryption, key management, and sensitivity classification are governed
  by V10. This chapter aligns to those classifications without inventing new ones.
- **To V11 Governance.** All decisions arising from this chapter SHALL be routed through the
  ARB, ADR, and lifecycle mechanisms V11 defines.
- **To V12 Observability.** Data-plane telemetry (freshness, quality, lineage, throughput) is
  emitted through the observability signals V12 standardizes; V13 defines the semantics, V12
  defines the transport.

**Design Considerations.**
- Prefer *contract-first* design: producers publish schemas and semantics before any consumer
  couples to them.
- Prefer *open standards*: SQL, OpenAPI, AsyncAPI, JSON Schema, Avro, Parquet, Iceberg/Delta,
  OpenLineage, DCAT.
- Prefer *decentralized ownership with federated governance*: domain teams own products; a
  federated council owns policy.
- Prefer *bounded contexts*: cross-domain coupling flows through published contracts, not
  through shared physical tables.
- Prefer *evolvability*: schemas evolve with compatibility rules; consumers negotiate versions
  through the schema registry.

**Anti-Patterns to Avoid.**
- Shared mutable OLTP tables as an integration channel.
- Untyped, unversioned event payloads.
- Point-to-point pipelines with no lineage capture.
- Silent schema drift with no compatibility gate.
- Uncontrolled cross-tenant joins.

**Compliance Alignment.**
- **HIPAA**: Preserve minimum necessary access; PHI is handled per V10 classifications.
- **GDPR**: Preserve lawful basis and purpose limitation; enable subject rights.
- **ISO 27001**: Align to Annex A controls for information classification, cryptography, and
  supplier data handling.
- **NIST 800-53**: Align to AC, AU, SC, and SI family controls at the data plane.

**Operational Envelope.**
- Data SLAs SHALL be published per data product (freshness, completeness, availability).
- Quality signals SHALL be observable in V12 dashboards.
- Incidents affecting data products SHALL follow the incident management workflow ratified
  by V12 Chapter 47.

**Explicit Non-Goals.**
- This chapter does NOT define authorization semantics.
- This chapter does NOT define identity or session semantics.
- This chapter does NOT define encryption primitives or key custody.
- This chapter does NOT change any existing database object, RLS policy, or SECURITY DEFINER
  function.
- This chapter does NOT introduce or modify Edge Functions or React/TypeScript modules.

**Rollout Philosophy (When Implementation Is Later Approved).**
- Additive first: introduce new datasets, contracts, and pipelines alongside existing ones.
- Shadow before cutover: run new pipelines in parallel, compare with existing outputs.
- Fitness-gated promotion: only promote when quality, lineage, and SLO gates pass.
- Reversible by default: every change SHALL have a documented rollback per V11.


## Chapter 89 — Nullability Rules

**Purpose.** Make nullability an explicit modeling decision.

**Architecture.** Layered architecture composed of ingestion, storage, processing, governance, and consumption planes, aligned to the Enterprise Reference Architecture ratified in V11.

**ASCII Diagram.**
```text
[Producers] ─▶ [Contract] ─▶ [Pipeline] ─▶ [Storage] ─▶ [Serving] ─▶ [Consumers]
                     │                                     │
                     └────────── Governance / Lineage ─────┘
```

**Rules (RFC 2119).**
- Producers MUST publish schemas to the registry before emission.
- Consumers SHALL validate payloads against the registered schema.
- Breaking changes MUST NOT be released without a governance approval per V11.
- Sensitive fields MUST be classified per Chapter 25 (Data Classification).
- Lineage SHALL be captured for every transformation.

**Examples.**
- A `patient.registered` event carries `tenant_id`, `branch_id`, and a canonical `party_id`.
- The `invoice.line` dimension conforms to the enterprise `Money` type.
- The `appointment.no_show` fact links to `Party`, `Provider`, `Location`, and `Time` dimensions.

**Future Implementation Notes.** Reference the enterprise Canonical Data Model. Do not couple to vendor-specific storage semantics. Adopt open table formats where practical.

**Backward Compatibility Notes.** Additive only. Existing schemas, tables, RLS policies, and services continue to operate unchanged. No migration is prescribed.

**Security Notes.** Alignment with V10 Zero-Trust: least-privilege access to data planes, encryption at rest and in transit, and field-level classification enforced by policy.

**Performance Notes.** Sampling, partitioning, indexing, and materialization strategies SHOULD align with SLOs published in V12.

**Governance Notes.** Owned by the Enterprise Data Council under V11 ARB with domain-level stewards defined in Chapter 6 (Data Ownership).

**Extended Discussion.**
This chapter forms part of the ZMedico Enterprise Data Platform (EDP) architectural corpus.
It codifies the intent, boundaries, and interfaces of the concern without prescribing runtime
implementation. Where implementation is eventually undertaken, the Governance Workflow ratified
in V6 SHALL apply, and the architectural boundaries defined in V8, V9, V10, V11, and V12 SHALL
be respected. Nothing in this chapter changes application code, database schema, RLS policies,
SECURITY DEFINER functions, Edge Functions, generated types, tests, package manifests, or
infrastructure assets.

**Interfaces.**
- **To V8 Authorization.** All data access decisions remain authoritative under RLS and V8
  policies. This chapter MUST NOT be interpreted as altering those decisions.
- **To V9 Identity.** Principal identity, trust envelopes, and session semantics are owned by
  V9. This chapter consumes identity as a fact; it does not redefine it.
- **To V10 Security.** Encryption, key management, and sensitivity classification are governed
  by V10. This chapter aligns to those classifications without inventing new ones.
- **To V11 Governance.** All decisions arising from this chapter SHALL be routed through the
  ARB, ADR, and lifecycle mechanisms V11 defines.
- **To V12 Observability.** Data-plane telemetry (freshness, quality, lineage, throughput) is
  emitted through the observability signals V12 standardizes; V13 defines the semantics, V12
  defines the transport.

**Design Considerations.**
- Prefer *contract-first* design: producers publish schemas and semantics before any consumer
  couples to them.
- Prefer *open standards*: SQL, OpenAPI, AsyncAPI, JSON Schema, Avro, Parquet, Iceberg/Delta,
  OpenLineage, DCAT.
- Prefer *decentralized ownership with federated governance*: domain teams own products; a
  federated council owns policy.
- Prefer *bounded contexts*: cross-domain coupling flows through published contracts, not
  through shared physical tables.
- Prefer *evolvability*: schemas evolve with compatibility rules; consumers negotiate versions
  through the schema registry.

**Anti-Patterns to Avoid.**
- Shared mutable OLTP tables as an integration channel.
- Untyped, unversioned event payloads.
- Point-to-point pipelines with no lineage capture.
- Silent schema drift with no compatibility gate.
- Uncontrolled cross-tenant joins.

**Compliance Alignment.**
- **HIPAA**: Preserve minimum necessary access; PHI is handled per V10 classifications.
- **GDPR**: Preserve lawful basis and purpose limitation; enable subject rights.
- **ISO 27001**: Align to Annex A controls for information classification, cryptography, and
  supplier data handling.
- **NIST 800-53**: Align to AC, AU, SC, and SI family controls at the data plane.

**Operational Envelope.**
- Data SLAs SHALL be published per data product (freshness, completeness, availability).
- Quality signals SHALL be observable in V12 dashboards.
- Incidents affecting data products SHALL follow the incident management workflow ratified
  by V12 Chapter 47.

**Explicit Non-Goals.**
- This chapter does NOT define authorization semantics.
- This chapter does NOT define identity or session semantics.
- This chapter does NOT define encryption primitives or key custody.
- This chapter does NOT change any existing database object, RLS policy, or SECURITY DEFINER
  function.
- This chapter does NOT introduce or modify Edge Functions or React/TypeScript modules.

**Rollout Philosophy (When Implementation Is Later Approved).**
- Additive first: introduce new datasets, contracts, and pipelines alongside existing ones.
- Shadow before cutover: run new pipelines in parallel, compare with existing outputs.
- Fitness-gated promotion: only promote when quality, lineage, and SLO gates pass.
- Reversible by default: every change SHALL have a documented rollback per V11.


## Chapter 90 — Referential Integrity

**Purpose.** Preserve valid references across datasets.

**Architecture.** Layered architecture composed of ingestion, storage, processing, governance, and consumption planes, aligned to the Enterprise Reference Architecture ratified in V11.

**ASCII Diagram.**
```text
[Producers] ─▶ [Contract] ─▶ [Pipeline] ─▶ [Storage] ─▶ [Serving] ─▶ [Consumers]
                     │                                     │
                     └────────── Governance / Lineage ─────┘
```

**Rules (RFC 2119).**
- Producers MUST publish schemas to the registry before emission.
- Consumers SHALL validate payloads against the registered schema.
- Breaking changes MUST NOT be released without a governance approval per V11.
- Sensitive fields MUST be classified per Chapter 25 (Data Classification).
- Lineage SHALL be captured for every transformation.

**Examples.**
- A `patient.registered` event carries `tenant_id`, `branch_id`, and a canonical `party_id`.
- The `invoice.line` dimension conforms to the enterprise `Money` type.
- The `appointment.no_show` fact links to `Party`, `Provider`, `Location`, and `Time` dimensions.

**Future Implementation Notes.** Reference the enterprise Canonical Data Model. Do not couple to vendor-specific storage semantics. Adopt open table formats where practical.

**Backward Compatibility Notes.** Additive only. Existing schemas, tables, RLS policies, and services continue to operate unchanged. No migration is prescribed.

**Security Notes.** Alignment with V10 Zero-Trust: least-privilege access to data planes, encryption at rest and in transit, and field-level classification enforced by policy.

**Performance Notes.** Sampling, partitioning, indexing, and materialization strategies SHOULD align with SLOs published in V12.

**Governance Notes.** Owned by the Enterprise Data Council under V11 ARB with domain-level stewards defined in Chapter 6 (Data Ownership).

**Extended Discussion.**
This chapter forms part of the ZMedico Enterprise Data Platform (EDP) architectural corpus.
It codifies the intent, boundaries, and interfaces of the concern without prescribing runtime
implementation. Where implementation is eventually undertaken, the Governance Workflow ratified
in V6 SHALL apply, and the architectural boundaries defined in V8, V9, V10, V11, and V12 SHALL
be respected. Nothing in this chapter changes application code, database schema, RLS policies,
SECURITY DEFINER functions, Edge Functions, generated types, tests, package manifests, or
infrastructure assets.

**Interfaces.**
- **To V8 Authorization.** All data access decisions remain authoritative under RLS and V8
  policies. This chapter MUST NOT be interpreted as altering those decisions.
- **To V9 Identity.** Principal identity, trust envelopes, and session semantics are owned by
  V9. This chapter consumes identity as a fact; it does not redefine it.
- **To V10 Security.** Encryption, key management, and sensitivity classification are governed
  by V10. This chapter aligns to those classifications without inventing new ones.
- **To V11 Governance.** All decisions arising from this chapter SHALL be routed through the
  ARB, ADR, and lifecycle mechanisms V11 defines.
- **To V12 Observability.** Data-plane telemetry (freshness, quality, lineage, throughput) is
  emitted through the observability signals V12 standardizes; V13 defines the semantics, V12
  defines the transport.

**Design Considerations.**
- Prefer *contract-first* design: producers publish schemas and semantics before any consumer
  couples to them.
- Prefer *open standards*: SQL, OpenAPI, AsyncAPI, JSON Schema, Avro, Parquet, Iceberg/Delta,
  OpenLineage, DCAT.
- Prefer *decentralized ownership with federated governance*: domain teams own products; a
  federated council owns policy.
- Prefer *bounded contexts*: cross-domain coupling flows through published contracts, not
  through shared physical tables.
- Prefer *evolvability*: schemas evolve with compatibility rules; consumers negotiate versions
  through the schema registry.

**Anti-Patterns to Avoid.**
- Shared mutable OLTP tables as an integration channel.
- Untyped, unversioned event payloads.
- Point-to-point pipelines with no lineage capture.
- Silent schema drift with no compatibility gate.
- Uncontrolled cross-tenant joins.

**Compliance Alignment.**
- **HIPAA**: Preserve minimum necessary access; PHI is handled per V10 classifications.
- **GDPR**: Preserve lawful basis and purpose limitation; enable subject rights.
- **ISO 27001**: Align to Annex A controls for information classification, cryptography, and
  supplier data handling.
- **NIST 800-53**: Align to AC, AU, SC, and SI family controls at the data plane.

**Operational Envelope.**
- Data SLAs SHALL be published per data product (freshness, completeness, availability).
- Quality signals SHALL be observable in V12 dashboards.
- Incidents affecting data products SHALL follow the incident management workflow ratified
  by V12 Chapter 47.

**Explicit Non-Goals.**
- This chapter does NOT define authorization semantics.
- This chapter does NOT define identity or session semantics.
- This chapter does NOT define encryption primitives or key custody.
- This chapter does NOT change any existing database object, RLS policy, or SECURITY DEFINER
  function.
- This chapter does NOT introduce or modify Edge Functions or React/TypeScript modules.

**Rollout Philosophy (When Implementation Is Later Approved).**
- Additive first: introduce new datasets, contracts, and pipelines alongside existing ones.
- Shadow before cutover: run new pipelines in parallel, compare with existing outputs.
- Fitness-gated promotion: only promote when quality, lineage, and SLO gates pass.
- Reversible by default: every change SHALL have a documented rollback per V11.


## Chapter 91 — Uniqueness Guarantees

**Purpose.** Prevent duplicate business identities.

**Architecture.** Layered architecture composed of ingestion, storage, processing, governance, and consumption planes, aligned to the Enterprise Reference Architecture ratified in V11.

**ASCII Diagram.**
```text
[Producers] ─▶ [Contract] ─▶ [Pipeline] ─▶ [Storage] ─▶ [Serving] ─▶ [Consumers]
                     │                                     │
                     └────────── Governance / Lineage ─────┘
```

**Rules (RFC 2119).**
- Producers MUST publish schemas to the registry before emission.
- Consumers SHALL validate payloads against the registered schema.
- Breaking changes MUST NOT be released without a governance approval per V11.
- Sensitive fields MUST be classified per Chapter 25 (Data Classification).
- Lineage SHALL be captured for every transformation.

**Examples.**
- A `patient.registered` event carries `tenant_id`, `branch_id`, and a canonical `party_id`.
- The `invoice.line` dimension conforms to the enterprise `Money` type.
- The `appointment.no_show` fact links to `Party`, `Provider`, `Location`, and `Time` dimensions.

**Future Implementation Notes.** Reference the enterprise Canonical Data Model. Do not couple to vendor-specific storage semantics. Adopt open table formats where practical.

**Backward Compatibility Notes.** Additive only. Existing schemas, tables, RLS policies, and services continue to operate unchanged. No migration is prescribed.

**Security Notes.** Alignment with V10 Zero-Trust: least-privilege access to data planes, encryption at rest and in transit, and field-level classification enforced by policy.

**Performance Notes.** Sampling, partitioning, indexing, and materialization strategies SHOULD align with SLOs published in V12.

**Governance Notes.** Owned by the Enterprise Data Council under V11 ARB with domain-level stewards defined in Chapter 6 (Data Ownership).

**Extended Discussion.**
This chapter forms part of the ZMedico Enterprise Data Platform (EDP) architectural corpus.
It codifies the intent, boundaries, and interfaces of the concern without prescribing runtime
implementation. Where implementation is eventually undertaken, the Governance Workflow ratified
in V6 SHALL apply, and the architectural boundaries defined in V8, V9, V10, V11, and V12 SHALL
be respected. Nothing in this chapter changes application code, database schema, RLS policies,
SECURITY DEFINER functions, Edge Functions, generated types, tests, package manifests, or
infrastructure assets.

**Interfaces.**
- **To V8 Authorization.** All data access decisions remain authoritative under RLS and V8
  policies. This chapter MUST NOT be interpreted as altering those decisions.
- **To V9 Identity.** Principal identity, trust envelopes, and session semantics are owned by
  V9. This chapter consumes identity as a fact; it does not redefine it.
- **To V10 Security.** Encryption, key management, and sensitivity classification are governed
  by V10. This chapter aligns to those classifications without inventing new ones.
- **To V11 Governance.** All decisions arising from this chapter SHALL be routed through the
  ARB, ADR, and lifecycle mechanisms V11 defines.
- **To V12 Observability.** Data-plane telemetry (freshness, quality, lineage, throughput) is
  emitted through the observability signals V12 standardizes; V13 defines the semantics, V12
  defines the transport.

**Design Considerations.**
- Prefer *contract-first* design: producers publish schemas and semantics before any consumer
  couples to them.
- Prefer *open standards*: SQL, OpenAPI, AsyncAPI, JSON Schema, Avro, Parquet, Iceberg/Delta,
  OpenLineage, DCAT.
- Prefer *decentralized ownership with federated governance*: domain teams own products; a
  federated council owns policy.
- Prefer *bounded contexts*: cross-domain coupling flows through published contracts, not
  through shared physical tables.
- Prefer *evolvability*: schemas evolve with compatibility rules; consumers negotiate versions
  through the schema registry.

**Anti-Patterns to Avoid.**
- Shared mutable OLTP tables as an integration channel.
- Untyped, unversioned event payloads.
- Point-to-point pipelines with no lineage capture.
- Silent schema drift with no compatibility gate.
- Uncontrolled cross-tenant joins.

**Compliance Alignment.**
- **HIPAA**: Preserve minimum necessary access; PHI is handled per V10 classifications.
- **GDPR**: Preserve lawful basis and purpose limitation; enable subject rights.
- **ISO 27001**: Align to Annex A controls for information classification, cryptography, and
  supplier data handling.
- **NIST 800-53**: Align to AC, AU, SC, and SI family controls at the data plane.

**Operational Envelope.**
- Data SLAs SHALL be published per data product (freshness, completeness, availability).
- Quality signals SHALL be observable in V12 dashboards.
- Incidents affecting data products SHALL follow the incident management workflow ratified
  by V12 Chapter 47.

**Explicit Non-Goals.**
- This chapter does NOT define authorization semantics.
- This chapter does NOT define identity or session semantics.
- This chapter does NOT define encryption primitives or key custody.
- This chapter does NOT change any existing database object, RLS policy, or SECURITY DEFINER
  function.
- This chapter does NOT introduce or modify Edge Functions or React/TypeScript modules.

**Rollout Philosophy (When Implementation Is Later Approved).**
- Additive first: introduce new datasets, contracts, and pipelines alongside existing ones.
- Shadow before cutover: run new pipelines in parallel, compare with existing outputs.
- Fitness-gated promotion: only promote when quality, lineage, and SLO gates pass.
- Reversible by default: every change SHALL have a documented rollback per V11.


## Chapter 92 — Slowly Changing Dimensions

**Purpose.** Model dimensional change history correctly.

**Architecture.** Layered architecture composed of ingestion, storage, processing, governance, and consumption planes, aligned to the Enterprise Reference Architecture ratified in V11.

**ASCII Diagram.**
```text
[Producers] ─▶ [Contract] ─▶ [Pipeline] ─▶ [Storage] ─▶ [Serving] ─▶ [Consumers]
                     │                                     │
                     └────────── Governance / Lineage ─────┘
```

**Rules (RFC 2119).**
- Producers MUST publish schemas to the registry before emission.
- Consumers SHALL validate payloads against the registered schema.
- Breaking changes MUST NOT be released without a governance approval per V11.
- Sensitive fields MUST be classified per Chapter 25 (Data Classification).
- Lineage SHALL be captured for every transformation.

**Examples.**
- A `patient.registered` event carries `tenant_id`, `branch_id`, and a canonical `party_id`.
- The `invoice.line` dimension conforms to the enterprise `Money` type.
- The `appointment.no_show` fact links to `Party`, `Provider`, `Location`, and `Time` dimensions.

**Future Implementation Notes.** Reference the enterprise Canonical Data Model. Do not couple to vendor-specific storage semantics. Adopt open table formats where practical.

**Backward Compatibility Notes.** Additive only. Existing schemas, tables, RLS policies, and services continue to operate unchanged. No migration is prescribed.

**Security Notes.** Alignment with V10 Zero-Trust: least-privilege access to data planes, encryption at rest and in transit, and field-level classification enforced by policy.

**Performance Notes.** Sampling, partitioning, indexing, and materialization strategies SHOULD align with SLOs published in V12.

**Governance Notes.** Owned by the Enterprise Data Council under V11 ARB with domain-level stewards defined in Chapter 6 (Data Ownership).

**Extended Discussion.**
This chapter forms part of the ZMedico Enterprise Data Platform (EDP) architectural corpus.
It codifies the intent, boundaries, and interfaces of the concern without prescribing runtime
implementation. Where implementation is eventually undertaken, the Governance Workflow ratified
in V6 SHALL apply, and the architectural boundaries defined in V8, V9, V10, V11, and V12 SHALL
be respected. Nothing in this chapter changes application code, database schema, RLS policies,
SECURITY DEFINER functions, Edge Functions, generated types, tests, package manifests, or
infrastructure assets.

**Interfaces.**
- **To V8 Authorization.** All data access decisions remain authoritative under RLS and V8
  policies. This chapter MUST NOT be interpreted as altering those decisions.
- **To V9 Identity.** Principal identity, trust envelopes, and session semantics are owned by
  V9. This chapter consumes identity as a fact; it does not redefine it.
- **To V10 Security.** Encryption, key management, and sensitivity classification are governed
  by V10. This chapter aligns to those classifications without inventing new ones.
- **To V11 Governance.** All decisions arising from this chapter SHALL be routed through the
  ARB, ADR, and lifecycle mechanisms V11 defines.
- **To V12 Observability.** Data-plane telemetry (freshness, quality, lineage, throughput) is
  emitted through the observability signals V12 standardizes; V13 defines the semantics, V12
  defines the transport.

**Design Considerations.**
- Prefer *contract-first* design: producers publish schemas and semantics before any consumer
  couples to them.
- Prefer *open standards*: SQL, OpenAPI, AsyncAPI, JSON Schema, Avro, Parquet, Iceberg/Delta,
  OpenLineage, DCAT.
- Prefer *decentralized ownership with federated governance*: domain teams own products; a
  federated council owns policy.
- Prefer *bounded contexts*: cross-domain coupling flows through published contracts, not
  through shared physical tables.
- Prefer *evolvability*: schemas evolve with compatibility rules; consumers negotiate versions
  through the schema registry.

**Anti-Patterns to Avoid.**
- Shared mutable OLTP tables as an integration channel.
- Untyped, unversioned event payloads.
- Point-to-point pipelines with no lineage capture.
- Silent schema drift with no compatibility gate.
- Uncontrolled cross-tenant joins.

**Compliance Alignment.**
- **HIPAA**: Preserve minimum necessary access; PHI is handled per V10 classifications.
- **GDPR**: Preserve lawful basis and purpose limitation; enable subject rights.
- **ISO 27001**: Align to Annex A controls for information classification, cryptography, and
  supplier data handling.
- **NIST 800-53**: Align to AC, AU, SC, and SI family controls at the data plane.

**Operational Envelope.**
- Data SLAs SHALL be published per data product (freshness, completeness, availability).
- Quality signals SHALL be observable in V12 dashboards.
- Incidents affecting data products SHALL follow the incident management workflow ratified
  by V12 Chapter 47.

**Explicit Non-Goals.**
- This chapter does NOT define authorization semantics.
- This chapter does NOT define identity or session semantics.
- This chapter does NOT define encryption primitives or key custody.
- This chapter does NOT change any existing database object, RLS policy, or SECURITY DEFINER
  function.
- This chapter does NOT introduce or modify Edge Functions or React/TypeScript modules.

**Rollout Philosophy (When Implementation Is Later Approved).**
- Additive first: introduce new datasets, contracts, and pipelines alongside existing ones.
- Shadow before cutover: run new pipelines in parallel, compare with existing outputs.
- Fitness-gated promotion: only promote when quality, lineage, and SLO gates pass.
- Reversible by default: every change SHALL have a documented rollback per V11.


## Chapter 93 — Fact & Dimension Modeling

**Purpose.** Provide star-schema patterns for analytics.

**Architecture.** Layered architecture composed of ingestion, storage, processing, governance, and consumption planes, aligned to the Enterprise Reference Architecture ratified in V11.

**ASCII Diagram.**
```text
[Producers] ─▶ [Contract] ─▶ [Pipeline] ─▶ [Storage] ─▶ [Serving] ─▶ [Consumers]
                     │                                     │
                     └────────── Governance / Lineage ─────┘
```

**Rules (RFC 2119).**
- Producers MUST publish schemas to the registry before emission.
- Consumers SHALL validate payloads against the registered schema.
- Breaking changes MUST NOT be released without a governance approval per V11.
- Sensitive fields MUST be classified per Chapter 25 (Data Classification).
- Lineage SHALL be captured for every transformation.

**Examples.**
- A `patient.registered` event carries `tenant_id`, `branch_id`, and a canonical `party_id`.
- The `invoice.line` dimension conforms to the enterprise `Money` type.
- The `appointment.no_show` fact links to `Party`, `Provider`, `Location`, and `Time` dimensions.

**Future Implementation Notes.** Reference the enterprise Canonical Data Model. Do not couple to vendor-specific storage semantics. Adopt open table formats where practical.

**Backward Compatibility Notes.** Additive only. Existing schemas, tables, RLS policies, and services continue to operate unchanged. No migration is prescribed.

**Security Notes.** Alignment with V10 Zero-Trust: least-privilege access to data planes, encryption at rest and in transit, and field-level classification enforced by policy.

**Performance Notes.** Sampling, partitioning, indexing, and materialization strategies SHOULD align with SLOs published in V12.

**Governance Notes.** Owned by the Enterprise Data Council under V11 ARB with domain-level stewards defined in Chapter 6 (Data Ownership).

**Extended Discussion.**
This chapter forms part of the ZMedico Enterprise Data Platform (EDP) architectural corpus.
It codifies the intent, boundaries, and interfaces of the concern without prescribing runtime
implementation. Where implementation is eventually undertaken, the Governance Workflow ratified
in V6 SHALL apply, and the architectural boundaries defined in V8, V9, V10, V11, and V12 SHALL
be respected. Nothing in this chapter changes application code, database schema, RLS policies,
SECURITY DEFINER functions, Edge Functions, generated types, tests, package manifests, or
infrastructure assets.

**Interfaces.**
- **To V8 Authorization.** All data access decisions remain authoritative under RLS and V8
  policies. This chapter MUST NOT be interpreted as altering those decisions.
- **To V9 Identity.** Principal identity, trust envelopes, and session semantics are owned by
  V9. This chapter consumes identity as a fact; it does not redefine it.
- **To V10 Security.** Encryption, key management, and sensitivity classification are governed
  by V10. This chapter aligns to those classifications without inventing new ones.
- **To V11 Governance.** All decisions arising from this chapter SHALL be routed through the
  ARB, ADR, and lifecycle mechanisms V11 defines.
- **To V12 Observability.** Data-plane telemetry (freshness, quality, lineage, throughput) is
  emitted through the observability signals V12 standardizes; V13 defines the semantics, V12
  defines the transport.

**Design Considerations.**
- Prefer *contract-first* design: producers publish schemas and semantics before any consumer
  couples to them.
- Prefer *open standards*: SQL, OpenAPI, AsyncAPI, JSON Schema, Avro, Parquet, Iceberg/Delta,
  OpenLineage, DCAT.
- Prefer *decentralized ownership with federated governance*: domain teams own products; a
  federated council owns policy.
- Prefer *bounded contexts*: cross-domain coupling flows through published contracts, not
  through shared physical tables.
- Prefer *evolvability*: schemas evolve with compatibility rules; consumers negotiate versions
  through the schema registry.

**Anti-Patterns to Avoid.**
- Shared mutable OLTP tables as an integration channel.
- Untyped, unversioned event payloads.
- Point-to-point pipelines with no lineage capture.
- Silent schema drift with no compatibility gate.
- Uncontrolled cross-tenant joins.

**Compliance Alignment.**
- **HIPAA**: Preserve minimum necessary access; PHI is handled per V10 classifications.
- **GDPR**: Preserve lawful basis and purpose limitation; enable subject rights.
- **ISO 27001**: Align to Annex A controls for information classification, cryptography, and
  supplier data handling.
- **NIST 800-53**: Align to AC, AU, SC, and SI family controls at the data plane.

**Operational Envelope.**
- Data SLAs SHALL be published per data product (freshness, completeness, availability).
- Quality signals SHALL be observable in V12 dashboards.
- Incidents affecting data products SHALL follow the incident management workflow ratified
  by V12 Chapter 47.

**Explicit Non-Goals.**
- This chapter does NOT define authorization semantics.
- This chapter does NOT define identity or session semantics.
- This chapter does NOT define encryption primitives or key custody.
- This chapter does NOT change any existing database object, RLS policy, or SECURITY DEFINER
  function.
- This chapter does NOT introduce or modify Edge Functions or React/TypeScript modules.

**Rollout Philosophy (When Implementation Is Later Approved).**
- Additive first: introduce new datasets, contracts, and pipelines alongside existing ones.
- Shadow before cutover: run new pipelines in parallel, compare with existing outputs.
- Fitness-gated promotion: only promote when quality, lineage, and SLO gates pass.
- Reversible by default: every change SHALL have a documented rollback per V11.


## Chapter 94 — Data Vault Modeling

**Purpose.** Provide hub-link-satellite patterns for auditability.

**Architecture.** Layered architecture composed of ingestion, storage, processing, governance, and consumption planes, aligned to the Enterprise Reference Architecture ratified in V11.

**ASCII Diagram.**
```text
[Producers] ─▶ [Contract] ─▶ [Pipeline] ─▶ [Storage] ─▶ [Serving] ─▶ [Consumers]
                     │                                     │
                     └────────── Governance / Lineage ─────┘
```

**Rules (RFC 2119).**
- Producers MUST publish schemas to the registry before emission.
- Consumers SHALL validate payloads against the registered schema.
- Breaking changes MUST NOT be released without a governance approval per V11.
- Sensitive fields MUST be classified per Chapter 25 (Data Classification).
- Lineage SHALL be captured for every transformation.

**Examples.**
- A `patient.registered` event carries `tenant_id`, `branch_id`, and a canonical `party_id`.
- The `invoice.line` dimension conforms to the enterprise `Money` type.
- The `appointment.no_show` fact links to `Party`, `Provider`, `Location`, and `Time` dimensions.

**Future Implementation Notes.** Reference the enterprise Canonical Data Model. Do not couple to vendor-specific storage semantics. Adopt open table formats where practical.

**Backward Compatibility Notes.** Additive only. Existing schemas, tables, RLS policies, and services continue to operate unchanged. No migration is prescribed.

**Security Notes.** Alignment with V10 Zero-Trust: least-privilege access to data planes, encryption at rest and in transit, and field-level classification enforced by policy.

**Performance Notes.** Sampling, partitioning, indexing, and materialization strategies SHOULD align with SLOs published in V12.

**Governance Notes.** Owned by the Enterprise Data Council under V11 ARB with domain-level stewards defined in Chapter 6 (Data Ownership).

**Extended Discussion.**
This chapter forms part of the ZMedico Enterprise Data Platform (EDP) architectural corpus.
It codifies the intent, boundaries, and interfaces of the concern without prescribing runtime
implementation. Where implementation is eventually undertaken, the Governance Workflow ratified
in V6 SHALL apply, and the architectural boundaries defined in V8, V9, V10, V11, and V12 SHALL
be respected. Nothing in this chapter changes application code, database schema, RLS policies,
SECURITY DEFINER functions, Edge Functions, generated types, tests, package manifests, or
infrastructure assets.

**Interfaces.**
- **To V8 Authorization.** All data access decisions remain authoritative under RLS and V8
  policies. This chapter MUST NOT be interpreted as altering those decisions.
- **To V9 Identity.** Principal identity, trust envelopes, and session semantics are owned by
  V9. This chapter consumes identity as a fact; it does not redefine it.
- **To V10 Security.** Encryption, key management, and sensitivity classification are governed
  by V10. This chapter aligns to those classifications without inventing new ones.
- **To V11 Governance.** All decisions arising from this chapter SHALL be routed through the
  ARB, ADR, and lifecycle mechanisms V11 defines.
- **To V12 Observability.** Data-plane telemetry (freshness, quality, lineage, throughput) is
  emitted through the observability signals V12 standardizes; V13 defines the semantics, V12
  defines the transport.

**Design Considerations.**
- Prefer *contract-first* design: producers publish schemas and semantics before any consumer
  couples to them.
- Prefer *open standards*: SQL, OpenAPI, AsyncAPI, JSON Schema, Avro, Parquet, Iceberg/Delta,
  OpenLineage, DCAT.
- Prefer *decentralized ownership with federated governance*: domain teams own products; a
  federated council owns policy.
- Prefer *bounded contexts*: cross-domain coupling flows through published contracts, not
  through shared physical tables.
- Prefer *evolvability*: schemas evolve with compatibility rules; consumers negotiate versions
  through the schema registry.

**Anti-Patterns to Avoid.**
- Shared mutable OLTP tables as an integration channel.
- Untyped, unversioned event payloads.
- Point-to-point pipelines with no lineage capture.
- Silent schema drift with no compatibility gate.
- Uncontrolled cross-tenant joins.

**Compliance Alignment.**
- **HIPAA**: Preserve minimum necessary access; PHI is handled per V10 classifications.
- **GDPR**: Preserve lawful basis and purpose limitation; enable subject rights.
- **ISO 27001**: Align to Annex A controls for information classification, cryptography, and
  supplier data handling.
- **NIST 800-53**: Align to AC, AU, SC, and SI family controls at the data plane.

**Operational Envelope.**
- Data SLAs SHALL be published per data product (freshness, completeness, availability).
- Quality signals SHALL be observable in V12 dashboards.
- Incidents affecting data products SHALL follow the incident management workflow ratified
  by V12 Chapter 47.

**Explicit Non-Goals.**
- This chapter does NOT define authorization semantics.
- This chapter does NOT define identity or session semantics.
- This chapter does NOT define encryption primitives or key custody.
- This chapter does NOT change any existing database object, RLS policy, or SECURITY DEFINER
  function.
- This chapter does NOT introduce or modify Edge Functions or React/TypeScript modules.

**Rollout Philosophy (When Implementation Is Later Approved).**
- Additive first: introduce new datasets, contracts, and pipelines alongside existing ones.
- Shadow before cutover: run new pipelines in parallel, compare with existing outputs.
- Fitness-gated promotion: only promote when quality, lineage, and SLO gates pass.
- Reversible by default: every change SHALL have a documented rollback per V11.


## Chapter 95 — Domain Events

**Purpose.** Emit business-meaningful events as first-class data.

**Architecture.** Layered architecture composed of ingestion, storage, processing, governance, and consumption planes, aligned to the Enterprise Reference Architecture ratified in V11.

**ASCII Diagram.**
```text
[Producers] ─▶ [Contract] ─▶ [Pipeline] ─▶ [Storage] ─▶ [Serving] ─▶ [Consumers]
                     │                                     │
                     └────────── Governance / Lineage ─────┘
```

**Rules (RFC 2119).**
- Producers MUST publish schemas to the registry before emission.
- Consumers SHALL validate payloads against the registered schema.
- Breaking changes MUST NOT be released without a governance approval per V11.
- Sensitive fields MUST be classified per Chapter 25 (Data Classification).
- Lineage SHALL be captured for every transformation.

**Examples.**
- A `patient.registered` event carries `tenant_id`, `branch_id`, and a canonical `party_id`.
- The `invoice.line` dimension conforms to the enterprise `Money` type.
- The `appointment.no_show` fact links to `Party`, `Provider`, `Location`, and `Time` dimensions.

**Future Implementation Notes.** Reference the enterprise Canonical Data Model. Do not couple to vendor-specific storage semantics. Adopt open table formats where practical.

**Backward Compatibility Notes.** Additive only. Existing schemas, tables, RLS policies, and services continue to operate unchanged. No migration is prescribed.

**Security Notes.** Alignment with V10 Zero-Trust: least-privilege access to data planes, encryption at rest and in transit, and field-level classification enforced by policy.

**Performance Notes.** Sampling, partitioning, indexing, and materialization strategies SHOULD align with SLOs published in V12.

**Governance Notes.** Owned by the Enterprise Data Council under V11 ARB with domain-level stewards defined in Chapter 6 (Data Ownership).

**Extended Discussion.**
This chapter forms part of the ZMedico Enterprise Data Platform (EDP) architectural corpus.
It codifies the intent, boundaries, and interfaces of the concern without prescribing runtime
implementation. Where implementation is eventually undertaken, the Governance Workflow ratified
in V6 SHALL apply, and the architectural boundaries defined in V8, V9, V10, V11, and V12 SHALL
be respected. Nothing in this chapter changes application code, database schema, RLS policies,
SECURITY DEFINER functions, Edge Functions, generated types, tests, package manifests, or
infrastructure assets.

**Interfaces.**
- **To V8 Authorization.** All data access decisions remain authoritative under RLS and V8
  policies. This chapter MUST NOT be interpreted as altering those decisions.
- **To V9 Identity.** Principal identity, trust envelopes, and session semantics are owned by
  V9. This chapter consumes identity as a fact; it does not redefine it.
- **To V10 Security.** Encryption, key management, and sensitivity classification are governed
  by V10. This chapter aligns to those classifications without inventing new ones.
- **To V11 Governance.** All decisions arising from this chapter SHALL be routed through the
  ARB, ADR, and lifecycle mechanisms V11 defines.
- **To V12 Observability.** Data-plane telemetry (freshness, quality, lineage, throughput) is
  emitted through the observability signals V12 standardizes; V13 defines the semantics, V12
  defines the transport.

**Design Considerations.**
- Prefer *contract-first* design: producers publish schemas and semantics before any consumer
  couples to them.
- Prefer *open standards*: SQL, OpenAPI, AsyncAPI, JSON Schema, Avro, Parquet, Iceberg/Delta,
  OpenLineage, DCAT.
- Prefer *decentralized ownership with federated governance*: domain teams own products; a
  federated council owns policy.
- Prefer *bounded contexts*: cross-domain coupling flows through published contracts, not
  through shared physical tables.
- Prefer *evolvability*: schemas evolve with compatibility rules; consumers negotiate versions
  through the schema registry.

**Anti-Patterns to Avoid.**
- Shared mutable OLTP tables as an integration channel.
- Untyped, unversioned event payloads.
- Point-to-point pipelines with no lineage capture.
- Silent schema drift with no compatibility gate.
- Uncontrolled cross-tenant joins.

**Compliance Alignment.**
- **HIPAA**: Preserve minimum necessary access; PHI is handled per V10 classifications.
- **GDPR**: Preserve lawful basis and purpose limitation; enable subject rights.
- **ISO 27001**: Align to Annex A controls for information classification, cryptography, and
  supplier data handling.
- **NIST 800-53**: Align to AC, AU, SC, and SI family controls at the data plane.

**Operational Envelope.**
- Data SLAs SHALL be published per data product (freshness, completeness, availability).
- Quality signals SHALL be observable in V12 dashboards.
- Incidents affecting data products SHALL follow the incident management workflow ratified
  by V12 Chapter 47.

**Explicit Non-Goals.**
- This chapter does NOT define authorization semantics.
- This chapter does NOT define identity or session semantics.
- This chapter does NOT define encryption primitives or key custody.
- This chapter does NOT change any existing database object, RLS policy, or SECURITY DEFINER
  function.
- This chapter does NOT introduce or modify Edge Functions or React/TypeScript modules.

**Rollout Philosophy (When Implementation Is Later Approved).**
- Additive first: introduce new datasets, contracts, and pipelines alongside existing ones.
- Shadow before cutover: run new pipelines in parallel, compare with existing outputs.
- Fitness-gated promotion: only promote when quality, lineage, and SLO gates pass.
- Reversible by default: every change SHALL have a documented rollback per V11.


## Chapter 96 — Outbox Pattern

**Purpose.** Guarantee reliable event publication with transactional integrity.

**Architecture.** Layered architecture composed of ingestion, storage, processing, governance, and consumption planes, aligned to the Enterprise Reference Architecture ratified in V11.

**ASCII Diagram.**
```text
[Producers] ─▶ [Contract] ─▶ [Pipeline] ─▶ [Storage] ─▶ [Serving] ─▶ [Consumers]
                     │                                     │
                     └────────── Governance / Lineage ─────┘
```

**Rules (RFC 2119).**
- Producers MUST publish schemas to the registry before emission.
- Consumers SHALL validate payloads against the registered schema.
- Breaking changes MUST NOT be released without a governance approval per V11.
- Sensitive fields MUST be classified per Chapter 25 (Data Classification).
- Lineage SHALL be captured for every transformation.

**Examples.**
- A `patient.registered` event carries `tenant_id`, `branch_id`, and a canonical `party_id`.
- The `invoice.line` dimension conforms to the enterprise `Money` type.
- The `appointment.no_show` fact links to `Party`, `Provider`, `Location`, and `Time` dimensions.

**Future Implementation Notes.** Reference the enterprise Canonical Data Model. Do not couple to vendor-specific storage semantics. Adopt open table formats where practical.

**Backward Compatibility Notes.** Additive only. Existing schemas, tables, RLS policies, and services continue to operate unchanged. No migration is prescribed.

**Security Notes.** Alignment with V10 Zero-Trust: least-privilege access to data planes, encryption at rest and in transit, and field-level classification enforced by policy.

**Performance Notes.** Sampling, partitioning, indexing, and materialization strategies SHOULD align with SLOs published in V12.

**Governance Notes.** Owned by the Enterprise Data Council under V11 ARB with domain-level stewards defined in Chapter 6 (Data Ownership).

**Extended Discussion.**
This chapter forms part of the ZMedico Enterprise Data Platform (EDP) architectural corpus.
It codifies the intent, boundaries, and interfaces of the concern without prescribing runtime
implementation. Where implementation is eventually undertaken, the Governance Workflow ratified
in V6 SHALL apply, and the architectural boundaries defined in V8, V9, V10, V11, and V12 SHALL
be respected. Nothing in this chapter changes application code, database schema, RLS policies,
SECURITY DEFINER functions, Edge Functions, generated types, tests, package manifests, or
infrastructure assets.

**Interfaces.**
- **To V8 Authorization.** All data access decisions remain authoritative under RLS and V8
  policies. This chapter MUST NOT be interpreted as altering those decisions.
- **To V9 Identity.** Principal identity, trust envelopes, and session semantics are owned by
  V9. This chapter consumes identity as a fact; it does not redefine it.
- **To V10 Security.** Encryption, key management, and sensitivity classification are governed
  by V10. This chapter aligns to those classifications without inventing new ones.
- **To V11 Governance.** All decisions arising from this chapter SHALL be routed through the
  ARB, ADR, and lifecycle mechanisms V11 defines.
- **To V12 Observability.** Data-plane telemetry (freshness, quality, lineage, throughput) is
  emitted through the observability signals V12 standardizes; V13 defines the semantics, V12
  defines the transport.

**Design Considerations.**
- Prefer *contract-first* design: producers publish schemas and semantics before any consumer
  couples to them.
- Prefer *open standards*: SQL, OpenAPI, AsyncAPI, JSON Schema, Avro, Parquet, Iceberg/Delta,
  OpenLineage, DCAT.
- Prefer *decentralized ownership with federated governance*: domain teams own products; a
  federated council owns policy.
- Prefer *bounded contexts*: cross-domain coupling flows through published contracts, not
  through shared physical tables.
- Prefer *evolvability*: schemas evolve with compatibility rules; consumers negotiate versions
  through the schema registry.

**Anti-Patterns to Avoid.**
- Shared mutable OLTP tables as an integration channel.
- Untyped, unversioned event payloads.
- Point-to-point pipelines with no lineage capture.
- Silent schema drift with no compatibility gate.
- Uncontrolled cross-tenant joins.

**Compliance Alignment.**
- **HIPAA**: Preserve minimum necessary access; PHI is handled per V10 classifications.
- **GDPR**: Preserve lawful basis and purpose limitation; enable subject rights.
- **ISO 27001**: Align to Annex A controls for information classification, cryptography, and
  supplier data handling.
- **NIST 800-53**: Align to AC, AU, SC, and SI family controls at the data plane.

**Operational Envelope.**
- Data SLAs SHALL be published per data product (freshness, completeness, availability).
- Quality signals SHALL be observable in V12 dashboards.
- Incidents affecting data products SHALL follow the incident management workflow ratified
  by V12 Chapter 47.

**Explicit Non-Goals.**
- This chapter does NOT define authorization semantics.
- This chapter does NOT define identity or session semantics.
- This chapter does NOT define encryption primitives or key custody.
- This chapter does NOT change any existing database object, RLS policy, or SECURITY DEFINER
  function.
- This chapter does NOT introduce or modify Edge Functions or React/TypeScript modules.

**Rollout Philosophy (When Implementation Is Later Approved).**
- Additive first: introduce new datasets, contracts, and pipelines alongside existing ones.
- Shadow before cutover: run new pipelines in parallel, compare with existing outputs.
- Fitness-gated promotion: only promote when quality, lineage, and SLO gates pass.
- Reversible by default: every change SHALL have a documented rollback per V11.


## Chapter 97 — Data Mesh

**Purpose.** Federate data ownership by domain while retaining governance.

**Architecture.** Layered architecture composed of ingestion, storage, processing, governance, and consumption planes, aligned to the Enterprise Reference Architecture ratified in V11.

**ASCII Diagram.**
```text
[Producers] ─▶ [Contract] ─▶ [Pipeline] ─▶ [Storage] ─▶ [Serving] ─▶ [Consumers]
                     │                                     │
                     └────────── Governance / Lineage ─────┘
```

**Rules (RFC 2119).**
- Producers MUST publish schemas to the registry before emission.
- Consumers SHALL validate payloads against the registered schema.
- Breaking changes MUST NOT be released without a governance approval per V11.
- Sensitive fields MUST be classified per Chapter 25 (Data Classification).
- Lineage SHALL be captured for every transformation.

**Examples.**
- A `patient.registered` event carries `tenant_id`, `branch_id`, and a canonical `party_id`.
- The `invoice.line` dimension conforms to the enterprise `Money` type.
- The `appointment.no_show` fact links to `Party`, `Provider`, `Location`, and `Time` dimensions.

**Future Implementation Notes.** Reference the enterprise Canonical Data Model. Do not couple to vendor-specific storage semantics. Adopt open table formats where practical.

**Backward Compatibility Notes.** Additive only. Existing schemas, tables, RLS policies, and services continue to operate unchanged. No migration is prescribed.

**Security Notes.** Alignment with V10 Zero-Trust: least-privilege access to data planes, encryption at rest and in transit, and field-level classification enforced by policy.

**Performance Notes.** Sampling, partitioning, indexing, and materialization strategies SHOULD align with SLOs published in V12.

**Governance Notes.** Owned by the Enterprise Data Council under V11 ARB with domain-level stewards defined in Chapter 6 (Data Ownership).

**Extended Discussion.**
This chapter forms part of the ZMedico Enterprise Data Platform (EDP) architectural corpus.
It codifies the intent, boundaries, and interfaces of the concern without prescribing runtime
implementation. Where implementation is eventually undertaken, the Governance Workflow ratified
in V6 SHALL apply, and the architectural boundaries defined in V8, V9, V10, V11, and V12 SHALL
be respected. Nothing in this chapter changes application code, database schema, RLS policies,
SECURITY DEFINER functions, Edge Functions, generated types, tests, package manifests, or
infrastructure assets.

**Interfaces.**
- **To V8 Authorization.** All data access decisions remain authoritative under RLS and V8
  policies. This chapter MUST NOT be interpreted as altering those decisions.
- **To V9 Identity.** Principal identity, trust envelopes, and session semantics are owned by
  V9. This chapter consumes identity as a fact; it does not redefine it.
- **To V10 Security.** Encryption, key management, and sensitivity classification are governed
  by V10. This chapter aligns to those classifications without inventing new ones.
- **To V11 Governance.** All decisions arising from this chapter SHALL be routed through the
  ARB, ADR, and lifecycle mechanisms V11 defines.
- **To V12 Observability.** Data-plane telemetry (freshness, quality, lineage, throughput) is
  emitted through the observability signals V12 standardizes; V13 defines the semantics, V12
  defines the transport.

**Design Considerations.**
- Prefer *contract-first* design: producers publish schemas and semantics before any consumer
  couples to them.
- Prefer *open standards*: SQL, OpenAPI, AsyncAPI, JSON Schema, Avro, Parquet, Iceberg/Delta,
  OpenLineage, DCAT.
- Prefer *decentralized ownership with federated governance*: domain teams own products; a
  federated council owns policy.
- Prefer *bounded contexts*: cross-domain coupling flows through published contracts, not
  through shared physical tables.
- Prefer *evolvability*: schemas evolve with compatibility rules; consumers negotiate versions
  through the schema registry.

**Anti-Patterns to Avoid.**
- Shared mutable OLTP tables as an integration channel.
- Untyped, unversioned event payloads.
- Point-to-point pipelines with no lineage capture.
- Silent schema drift with no compatibility gate.
- Uncontrolled cross-tenant joins.

**Compliance Alignment.**
- **HIPAA**: Preserve minimum necessary access; PHI is handled per V10 classifications.
- **GDPR**: Preserve lawful basis and purpose limitation; enable subject rights.
- **ISO 27001**: Align to Annex A controls for information classification, cryptography, and
  supplier data handling.
- **NIST 800-53**: Align to AC, AU, SC, and SI family controls at the data plane.

**Operational Envelope.**
- Data SLAs SHALL be published per data product (freshness, completeness, availability).
- Quality signals SHALL be observable in V12 dashboards.
- Incidents affecting data products SHALL follow the incident management workflow ratified
  by V12 Chapter 47.

**Explicit Non-Goals.**
- This chapter does NOT define authorization semantics.
- This chapter does NOT define identity or session semantics.
- This chapter does NOT define encryption primitives or key custody.
- This chapter does NOT change any existing database object, RLS policy, or SECURITY DEFINER
  function.
- This chapter does NOT introduce or modify Edge Functions or React/TypeScript modules.

**Rollout Philosophy (When Implementation Is Later Approved).**
- Additive first: introduce new datasets, contracts, and pipelines alongside existing ones.
- Shadow before cutover: run new pipelines in parallel, compare with existing outputs.
- Fitness-gated promotion: only promote when quality, lineage, and SLO gates pass.
- Reversible by default: every change SHALL have a documented rollback per V11.


## Chapter 98 — Data Product Contracts

**Purpose.** Provide machine-checkable contracts for data products.

**Architecture.** Layered architecture composed of ingestion, storage, processing, governance, and consumption planes, aligned to the Enterprise Reference Architecture ratified in V11.

**ASCII Diagram.**
```text
[Producers] ─▶ [Contract] ─▶ [Pipeline] ─▶ [Storage] ─▶ [Serving] ─▶ [Consumers]
                     │                                     │
                     └────────── Governance / Lineage ─────┘
```

**Rules (RFC 2119).**
- Producers MUST publish schemas to the registry before emission.
- Consumers SHALL validate payloads against the registered schema.
- Breaking changes MUST NOT be released without a governance approval per V11.
- Sensitive fields MUST be classified per Chapter 25 (Data Classification).
- Lineage SHALL be captured for every transformation.

**Examples.**
- A `patient.registered` event carries `tenant_id`, `branch_id`, and a canonical `party_id`.
- The `invoice.line` dimension conforms to the enterprise `Money` type.
- The `appointment.no_show` fact links to `Party`, `Provider`, `Location`, and `Time` dimensions.

**Future Implementation Notes.** Reference the enterprise Canonical Data Model. Do not couple to vendor-specific storage semantics. Adopt open table formats where practical.

**Backward Compatibility Notes.** Additive only. Existing schemas, tables, RLS policies, and services continue to operate unchanged. No migration is prescribed.

**Security Notes.** Alignment with V10 Zero-Trust: least-privilege access to data planes, encryption at rest and in transit, and field-level classification enforced by policy.

**Performance Notes.** Sampling, partitioning, indexing, and materialization strategies SHOULD align with SLOs published in V12.

**Governance Notes.** Owned by the Enterprise Data Council under V11 ARB with domain-level stewards defined in Chapter 6 (Data Ownership).

**Extended Discussion.**
This chapter forms part of the ZMedico Enterprise Data Platform (EDP) architectural corpus.
It codifies the intent, boundaries, and interfaces of the concern without prescribing runtime
implementation. Where implementation is eventually undertaken, the Governance Workflow ratified
in V6 SHALL apply, and the architectural boundaries defined in V8, V9, V10, V11, and V12 SHALL
be respected. Nothing in this chapter changes application code, database schema, RLS policies,
SECURITY DEFINER functions, Edge Functions, generated types, tests, package manifests, or
infrastructure assets.

**Interfaces.**
- **To V8 Authorization.** All data access decisions remain authoritative under RLS and V8
  policies. This chapter MUST NOT be interpreted as altering those decisions.
- **To V9 Identity.** Principal identity, trust envelopes, and session semantics are owned by
  V9. This chapter consumes identity as a fact; it does not redefine it.
- **To V10 Security.** Encryption, key management, and sensitivity classification are governed
  by V10. This chapter aligns to those classifications without inventing new ones.
- **To V11 Governance.** All decisions arising from this chapter SHALL be routed through the
  ARB, ADR, and lifecycle mechanisms V11 defines.
- **To V12 Observability.** Data-plane telemetry (freshness, quality, lineage, throughput) is
  emitted through the observability signals V12 standardizes; V13 defines the semantics, V12
  defines the transport.

**Design Considerations.**
- Prefer *contract-first* design: producers publish schemas and semantics before any consumer
  couples to them.
- Prefer *open standards*: SQL, OpenAPI, AsyncAPI, JSON Schema, Avro, Parquet, Iceberg/Delta,
  OpenLineage, DCAT.
- Prefer *decentralized ownership with federated governance*: domain teams own products; a
  federated council owns policy.
- Prefer *bounded contexts*: cross-domain coupling flows through published contracts, not
  through shared physical tables.
- Prefer *evolvability*: schemas evolve with compatibility rules; consumers negotiate versions
  through the schema registry.

**Anti-Patterns to Avoid.**
- Shared mutable OLTP tables as an integration channel.
- Untyped, unversioned event payloads.
- Point-to-point pipelines with no lineage capture.
- Silent schema drift with no compatibility gate.
- Uncontrolled cross-tenant joins.

**Compliance Alignment.**
- **HIPAA**: Preserve minimum necessary access; PHI is handled per V10 classifications.
- **GDPR**: Preserve lawful basis and purpose limitation; enable subject rights.
- **ISO 27001**: Align to Annex A controls for information classification, cryptography, and
  supplier data handling.
- **NIST 800-53**: Align to AC, AU, SC, and SI family controls at the data plane.

**Operational Envelope.**
- Data SLAs SHALL be published per data product (freshness, completeness, availability).
- Quality signals SHALL be observable in V12 dashboards.
- Incidents affecting data products SHALL follow the incident management workflow ratified
  by V12 Chapter 47.

**Explicit Non-Goals.**
- This chapter does NOT define authorization semantics.
- This chapter does NOT define identity or session semantics.
- This chapter does NOT define encryption primitives or key custody.
- This chapter does NOT change any existing database object, RLS policy, or SECURITY DEFINER
  function.
- This chapter does NOT introduce or modify Edge Functions or React/TypeScript modules.

**Rollout Philosophy (When Implementation Is Later Approved).**
- Additive first: introduce new datasets, contracts, and pipelines alongside existing ones.
- Shadow before cutover: run new pipelines in parallel, compare with existing outputs.
- Fitness-gated promotion: only promote when quality, lineage, and SLO gates pass.
- Reversible by default: every change SHALL have a documented rollback per V11.


## Chapter 99 — Self-Service Analytics

**Purpose.** Empower business users within a governed sandbox.

**Architecture.** Layered architecture composed of ingestion, storage, processing, governance, and consumption planes, aligned to the Enterprise Reference Architecture ratified in V11.

**ASCII Diagram.**
```text
[Producers] ─▶ [Contract] ─▶ [Pipeline] ─▶ [Storage] ─▶ [Serving] ─▶ [Consumers]
                     │                                     │
                     └────────── Governance / Lineage ─────┘
```

**Rules (RFC 2119).**
- Producers MUST publish schemas to the registry before emission.
- Consumers SHALL validate payloads against the registered schema.
- Breaking changes MUST NOT be released without a governance approval per V11.
- Sensitive fields MUST be classified per Chapter 25 (Data Classification).
- Lineage SHALL be captured for every transformation.

**Examples.**
- A `patient.registered` event carries `tenant_id`, `branch_id`, and a canonical `party_id`.
- The `invoice.line` dimension conforms to the enterprise `Money` type.
- The `appointment.no_show` fact links to `Party`, `Provider`, `Location`, and `Time` dimensions.

**Future Implementation Notes.** Reference the enterprise Canonical Data Model. Do not couple to vendor-specific storage semantics. Adopt open table formats where practical.

**Backward Compatibility Notes.** Additive only. Existing schemas, tables, RLS policies, and services continue to operate unchanged. No migration is prescribed.

**Security Notes.** Alignment with V10 Zero-Trust: least-privilege access to data planes, encryption at rest and in transit, and field-level classification enforced by policy.

**Performance Notes.** Sampling, partitioning, indexing, and materialization strategies SHOULD align with SLOs published in V12.

**Governance Notes.** Owned by the Enterprise Data Council under V11 ARB with domain-level stewards defined in Chapter 6 (Data Ownership).

**Extended Discussion.**
This chapter forms part of the ZMedico Enterprise Data Platform (EDP) architectural corpus.
It codifies the intent, boundaries, and interfaces of the concern without prescribing runtime
implementation. Where implementation is eventually undertaken, the Governance Workflow ratified
in V6 SHALL apply, and the architectural boundaries defined in V8, V9, V10, V11, and V12 SHALL
be respected. Nothing in this chapter changes application code, database schema, RLS policies,
SECURITY DEFINER functions, Edge Functions, generated types, tests, package manifests, or
infrastructure assets.

**Interfaces.**
- **To V8 Authorization.** All data access decisions remain authoritative under RLS and V8
  policies. This chapter MUST NOT be interpreted as altering those decisions.
- **To V9 Identity.** Principal identity, trust envelopes, and session semantics are owned by
  V9. This chapter consumes identity as a fact; it does not redefine it.
- **To V10 Security.** Encryption, key management, and sensitivity classification are governed
  by V10. This chapter aligns to those classifications without inventing new ones.
- **To V11 Governance.** All decisions arising from this chapter SHALL be routed through the
  ARB, ADR, and lifecycle mechanisms V11 defines.
- **To V12 Observability.** Data-plane telemetry (freshness, quality, lineage, throughput) is
  emitted through the observability signals V12 standardizes; V13 defines the semantics, V12
  defines the transport.

**Design Considerations.**
- Prefer *contract-first* design: producers publish schemas and semantics before any consumer
  couples to them.
- Prefer *open standards*: SQL, OpenAPI, AsyncAPI, JSON Schema, Avro, Parquet, Iceberg/Delta,
  OpenLineage, DCAT.
- Prefer *decentralized ownership with federated governance*: domain teams own products; a
  federated council owns policy.
- Prefer *bounded contexts*: cross-domain coupling flows through published contracts, not
  through shared physical tables.
- Prefer *evolvability*: schemas evolve with compatibility rules; consumers negotiate versions
  through the schema registry.

**Anti-Patterns to Avoid.**
- Shared mutable OLTP tables as an integration channel.
- Untyped, unversioned event payloads.
- Point-to-point pipelines with no lineage capture.
- Silent schema drift with no compatibility gate.
- Uncontrolled cross-tenant joins.

**Compliance Alignment.**
- **HIPAA**: Preserve minimum necessary access; PHI is handled per V10 classifications.
- **GDPR**: Preserve lawful basis and purpose limitation; enable subject rights.
- **ISO 27001**: Align to Annex A controls for information classification, cryptography, and
  supplier data handling.
- **NIST 800-53**: Align to AC, AU, SC, and SI family controls at the data plane.

**Operational Envelope.**
- Data SLAs SHALL be published per data product (freshness, completeness, availability).
- Quality signals SHALL be observable in V12 dashboards.
- Incidents affecting data products SHALL follow the incident management workflow ratified
  by V12 Chapter 47.

**Explicit Non-Goals.**
- This chapter does NOT define authorization semantics.
- This chapter does NOT define identity or session semantics.
- This chapter does NOT define encryption primitives or key custody.
- This chapter does NOT change any existing database object, RLS policy, or SECURITY DEFINER
  function.
- This chapter does NOT introduce or modify Edge Functions or React/TypeScript modules.

**Rollout Philosophy (When Implementation Is Later Approved).**
- Additive first: introduce new datasets, contracts, and pipelines alongside existing ones.
- Shadow before cutover: run new pipelines in parallel, compare with existing outputs.
- Fitness-gated promotion: only promote when quality, lineage, and SLO gates pass.
- Reversible by default: every change SHALL have a documented rollback per V11.


## Chapter 100 — Data Marketplace

**Purpose.** Offer discoverable, requestable, contract-bound data products.

**Architecture.** Layered architecture composed of ingestion, storage, processing, governance, and consumption planes, aligned to the Enterprise Reference Architecture ratified in V11.

**ASCII Diagram.**
```text
[Producers] ─▶ [Contract] ─▶ [Pipeline] ─▶ [Storage] ─▶ [Serving] ─▶ [Consumers]
                     │                                     │
                     └────────── Governance / Lineage ─────┘
```

**Rules (RFC 2119).**
- Producers MUST publish schemas to the registry before emission.
- Consumers SHALL validate payloads against the registered schema.
- Breaking changes MUST NOT be released without a governance approval per V11.
- Sensitive fields MUST be classified per Chapter 25 (Data Classification).
- Lineage SHALL be captured for every transformation.

**Examples.**
- A `patient.registered` event carries `tenant_id`, `branch_id`, and a canonical `party_id`.
- The `invoice.line` dimension conforms to the enterprise `Money` type.
- The `appointment.no_show` fact links to `Party`, `Provider`, `Location`, and `Time` dimensions.

**Future Implementation Notes.** Reference the enterprise Canonical Data Model. Do not couple to vendor-specific storage semantics. Adopt open table formats where practical.

**Backward Compatibility Notes.** Additive only. Existing schemas, tables, RLS policies, and services continue to operate unchanged. No migration is prescribed.

**Security Notes.** Alignment with V10 Zero-Trust: least-privilege access to data planes, encryption at rest and in transit, and field-level classification enforced by policy.

**Performance Notes.** Sampling, partitioning, indexing, and materialization strategies SHOULD align with SLOs published in V12.

**Governance Notes.** Owned by the Enterprise Data Council under V11 ARB with domain-level stewards defined in Chapter 6 (Data Ownership).

**Extended Discussion.**
This chapter forms part of the ZMedico Enterprise Data Platform (EDP) architectural corpus.
It codifies the intent, boundaries, and interfaces of the concern without prescribing runtime
implementation. Where implementation is eventually undertaken, the Governance Workflow ratified
in V6 SHALL apply, and the architectural boundaries defined in V8, V9, V10, V11, and V12 SHALL
be respected. Nothing in this chapter changes application code, database schema, RLS policies,
SECURITY DEFINER functions, Edge Functions, generated types, tests, package manifests, or
infrastructure assets.

**Interfaces.**
- **To V8 Authorization.** All data access decisions remain authoritative under RLS and V8
  policies. This chapter MUST NOT be interpreted as altering those decisions.
- **To V9 Identity.** Principal identity, trust envelopes, and session semantics are owned by
  V9. This chapter consumes identity as a fact; it does not redefine it.
- **To V10 Security.** Encryption, key management, and sensitivity classification are governed
  by V10. This chapter aligns to those classifications without inventing new ones.
- **To V11 Governance.** All decisions arising from this chapter SHALL be routed through the
  ARB, ADR, and lifecycle mechanisms V11 defines.
- **To V12 Observability.** Data-plane telemetry (freshness, quality, lineage, throughput) is
  emitted through the observability signals V12 standardizes; V13 defines the semantics, V12
  defines the transport.

**Design Considerations.**
- Prefer *contract-first* design: producers publish schemas and semantics before any consumer
  couples to them.
- Prefer *open standards*: SQL, OpenAPI, AsyncAPI, JSON Schema, Avro, Parquet, Iceberg/Delta,
  OpenLineage, DCAT.
- Prefer *decentralized ownership with federated governance*: domain teams own products; a
  federated council owns policy.
- Prefer *bounded contexts*: cross-domain coupling flows through published contracts, not
  through shared physical tables.
- Prefer *evolvability*: schemas evolve with compatibility rules; consumers negotiate versions
  through the schema registry.

**Anti-Patterns to Avoid.**
- Shared mutable OLTP tables as an integration channel.
- Untyped, unversioned event payloads.
- Point-to-point pipelines with no lineage capture.
- Silent schema drift with no compatibility gate.
- Uncontrolled cross-tenant joins.

**Compliance Alignment.**
- **HIPAA**: Preserve minimum necessary access; PHI is handled per V10 classifications.
- **GDPR**: Preserve lawful basis and purpose limitation; enable subject rights.
- **ISO 27001**: Align to Annex A controls for information classification, cryptography, and
  supplier data handling.
- **NIST 800-53**: Align to AC, AU, SC, and SI family controls at the data plane.

**Operational Envelope.**
- Data SLAs SHALL be published per data product (freshness, completeness, availability).
- Quality signals SHALL be observable in V12 dashboards.
- Incidents affecting data products SHALL follow the incident management workflow ratified
  by V12 Chapter 47.

**Explicit Non-Goals.**
- This chapter does NOT define authorization semantics.
- This chapter does NOT define identity or session semantics.
- This chapter does NOT define encryption primitives or key custody.
- This chapter does NOT change any existing database object, RLS policy, or SECURITY DEFINER
  function.
- This chapter does NOT introduce or modify Edge Functions or React/TypeScript modules.

**Rollout Philosophy (When Implementation Is Later Approved).**
- Additive first: introduce new datasets, contracts, and pipelines alongside existing ones.
- Shadow before cutover: run new pipelines in parallel, compare with existing outputs.
- Fitness-gated promotion: only promote when quality, lineage, and SLO gates pass.
- Reversible by default: every change SHALL have a documented rollback per V11.


## Chapter 101 — Data SLAs

**Purpose.** Publish and honor data freshness, completeness, and availability targets.

**Architecture.** Layered architecture composed of ingestion, storage, processing, governance, and consumption planes, aligned to the Enterprise Reference Architecture ratified in V11.

**ASCII Diagram.**
```text
[Producers] ─▶ [Contract] ─▶ [Pipeline] ─▶ [Storage] ─▶ [Serving] ─▶ [Consumers]
                     │                                     │
                     └────────── Governance / Lineage ─────┘
```

**Rules (RFC 2119).**
- Producers MUST publish schemas to the registry before emission.
- Consumers SHALL validate payloads against the registered schema.
- Breaking changes MUST NOT be released without a governance approval per V11.
- Sensitive fields MUST be classified per Chapter 25 (Data Classification).
- Lineage SHALL be captured for every transformation.

**Examples.**
- A `patient.registered` event carries `tenant_id`, `branch_id`, and a canonical `party_id`.
- The `invoice.line` dimension conforms to the enterprise `Money` type.
- The `appointment.no_show` fact links to `Party`, `Provider`, `Location`, and `Time` dimensions.

**Future Implementation Notes.** Reference the enterprise Canonical Data Model. Do not couple to vendor-specific storage semantics. Adopt open table formats where practical.

**Backward Compatibility Notes.** Additive only. Existing schemas, tables, RLS policies, and services continue to operate unchanged. No migration is prescribed.

**Security Notes.** Alignment with V10 Zero-Trust: least-privilege access to data planes, encryption at rest and in transit, and field-level classification enforced by policy.

**Performance Notes.** Sampling, partitioning, indexing, and materialization strategies SHOULD align with SLOs published in V12.

**Governance Notes.** Owned by the Enterprise Data Council under V11 ARB with domain-level stewards defined in Chapter 6 (Data Ownership).

**Extended Discussion.**
This chapter forms part of the ZMedico Enterprise Data Platform (EDP) architectural corpus.
It codifies the intent, boundaries, and interfaces of the concern without prescribing runtime
implementation. Where implementation is eventually undertaken, the Governance Workflow ratified
in V6 SHALL apply, and the architectural boundaries defined in V8, V9, V10, V11, and V12 SHALL
be respected. Nothing in this chapter changes application code, database schema, RLS policies,
SECURITY DEFINER functions, Edge Functions, generated types, tests, package manifests, or
infrastructure assets.

**Interfaces.**
- **To V8 Authorization.** All data access decisions remain authoritative under RLS and V8
  policies. This chapter MUST NOT be interpreted as altering those decisions.
- **To V9 Identity.** Principal identity, trust envelopes, and session semantics are owned by
  V9. This chapter consumes identity as a fact; it does not redefine it.
- **To V10 Security.** Encryption, key management, and sensitivity classification are governed
  by V10. This chapter aligns to those classifications without inventing new ones.
- **To V11 Governance.** All decisions arising from this chapter SHALL be routed through the
  ARB, ADR, and lifecycle mechanisms V11 defines.
- **To V12 Observability.** Data-plane telemetry (freshness, quality, lineage, throughput) is
  emitted through the observability signals V12 standardizes; V13 defines the semantics, V12
  defines the transport.

**Design Considerations.**
- Prefer *contract-first* design: producers publish schemas and semantics before any consumer
  couples to them.
- Prefer *open standards*: SQL, OpenAPI, AsyncAPI, JSON Schema, Avro, Parquet, Iceberg/Delta,
  OpenLineage, DCAT.
- Prefer *decentralized ownership with federated governance*: domain teams own products; a
  federated council owns policy.
- Prefer *bounded contexts*: cross-domain coupling flows through published contracts, not
  through shared physical tables.
- Prefer *evolvability*: schemas evolve with compatibility rules; consumers negotiate versions
  through the schema registry.

**Anti-Patterns to Avoid.**
- Shared mutable OLTP tables as an integration channel.
- Untyped, unversioned event payloads.
- Point-to-point pipelines with no lineage capture.
- Silent schema drift with no compatibility gate.
- Uncontrolled cross-tenant joins.

**Compliance Alignment.**
- **HIPAA**: Preserve minimum necessary access; PHI is handled per V10 classifications.
- **GDPR**: Preserve lawful basis and purpose limitation; enable subject rights.
- **ISO 27001**: Align to Annex A controls for information classification, cryptography, and
  supplier data handling.
- **NIST 800-53**: Align to AC, AU, SC, and SI family controls at the data plane.

**Operational Envelope.**
- Data SLAs SHALL be published per data product (freshness, completeness, availability).
- Quality signals SHALL be observable in V12 dashboards.
- Incidents affecting data products SHALL follow the incident management workflow ratified
  by V12 Chapter 47.

**Explicit Non-Goals.**
- This chapter does NOT define authorization semantics.
- This chapter does NOT define identity or session semantics.
- This chapter does NOT define encryption primitives or key custody.
- This chapter does NOT change any existing database object, RLS policy, or SECURITY DEFINER
  function.
- This chapter does NOT introduce or modify Edge Functions or React/TypeScript modules.

**Rollout Philosophy (When Implementation Is Later Approved).**
- Additive first: introduce new datasets, contracts, and pipelines alongside existing ones.
- Shadow before cutover: run new pipelines in parallel, compare with existing outputs.
- Fitness-gated promotion: only promote when quality, lineage, and SLO gates pass.
- Reversible by default: every change SHALL have a documented rollback per V11.


## Chapter 102 — Data Observability

**Purpose.** Observe data pipelines with metrics, logs, and lineage per V12.

**Architecture.** Layered architecture composed of ingestion, storage, processing, governance, and consumption planes, aligned to the Enterprise Reference Architecture ratified in V11.

**ASCII Diagram.**
```text
[Producers] ─▶ [Contract] ─▶ [Pipeline] ─▶ [Storage] ─▶ [Serving] ─▶ [Consumers]
                     │                                     │
                     └────────── Governance / Lineage ─────┘
```

**Rules (RFC 2119).**
- Producers MUST publish schemas to the registry before emission.
- Consumers SHALL validate payloads against the registered schema.
- Breaking changes MUST NOT be released without a governance approval per V11.
- Sensitive fields MUST be classified per Chapter 25 (Data Classification).
- Lineage SHALL be captured for every transformation.

**Examples.**
- A `patient.registered` event carries `tenant_id`, `branch_id`, and a canonical `party_id`.
- The `invoice.line` dimension conforms to the enterprise `Money` type.
- The `appointment.no_show` fact links to `Party`, `Provider`, `Location`, and `Time` dimensions.

**Future Implementation Notes.** Reference the enterprise Canonical Data Model. Do not couple to vendor-specific storage semantics. Adopt open table formats where practical.

**Backward Compatibility Notes.** Additive only. Existing schemas, tables, RLS policies, and services continue to operate unchanged. No migration is prescribed.

**Security Notes.** Alignment with V10 Zero-Trust: least-privilege access to data planes, encryption at rest and in transit, and field-level classification enforced by policy.

**Performance Notes.** Sampling, partitioning, indexing, and materialization strategies SHOULD align with SLOs published in V12.

**Governance Notes.** Owned by the Enterprise Data Council under V11 ARB with domain-level stewards defined in Chapter 6 (Data Ownership).

**Extended Discussion.**
This chapter forms part of the ZMedico Enterprise Data Platform (EDP) architectural corpus.
It codifies the intent, boundaries, and interfaces of the concern without prescribing runtime
implementation. Where implementation is eventually undertaken, the Governance Workflow ratified
in V6 SHALL apply, and the architectural boundaries defined in V8, V9, V10, V11, and V12 SHALL
be respected. Nothing in this chapter changes application code, database schema, RLS policies,
SECURITY DEFINER functions, Edge Functions, generated types, tests, package manifests, or
infrastructure assets.

**Interfaces.**
- **To V8 Authorization.** All data access decisions remain authoritative under RLS and V8
  policies. This chapter MUST NOT be interpreted as altering those decisions.
- **To V9 Identity.** Principal identity, trust envelopes, and session semantics are owned by
  V9. This chapter consumes identity as a fact; it does not redefine it.
- **To V10 Security.** Encryption, key management, and sensitivity classification are governed
  by V10. This chapter aligns to those classifications without inventing new ones.
- **To V11 Governance.** All decisions arising from this chapter SHALL be routed through the
  ARB, ADR, and lifecycle mechanisms V11 defines.
- **To V12 Observability.** Data-plane telemetry (freshness, quality, lineage, throughput) is
  emitted through the observability signals V12 standardizes; V13 defines the semantics, V12
  defines the transport.

**Design Considerations.**
- Prefer *contract-first* design: producers publish schemas and semantics before any consumer
  couples to them.
- Prefer *open standards*: SQL, OpenAPI, AsyncAPI, JSON Schema, Avro, Parquet, Iceberg/Delta,
  OpenLineage, DCAT.
- Prefer *decentralized ownership with federated governance*: domain teams own products; a
  federated council owns policy.
- Prefer *bounded contexts*: cross-domain coupling flows through published contracts, not
  through shared physical tables.
- Prefer *evolvability*: schemas evolve with compatibility rules; consumers negotiate versions
  through the schema registry.

**Anti-Patterns to Avoid.**
- Shared mutable OLTP tables as an integration channel.
- Untyped, unversioned event payloads.
- Point-to-point pipelines with no lineage capture.
- Silent schema drift with no compatibility gate.
- Uncontrolled cross-tenant joins.

**Compliance Alignment.**
- **HIPAA**: Preserve minimum necessary access; PHI is handled per V10 classifications.
- **GDPR**: Preserve lawful basis and purpose limitation; enable subject rights.
- **ISO 27001**: Align to Annex A controls for information classification, cryptography, and
  supplier data handling.
- **NIST 800-53**: Align to AC, AU, SC, and SI family controls at the data plane.

**Operational Envelope.**
- Data SLAs SHALL be published per data product (freshness, completeness, availability).
- Quality signals SHALL be observable in V12 dashboards.
- Incidents affecting data products SHALL follow the incident management workflow ratified
  by V12 Chapter 47.

**Explicit Non-Goals.**
- This chapter does NOT define authorization semantics.
- This chapter does NOT define identity or session semantics.
- This chapter does NOT define encryption primitives or key custody.
- This chapter does NOT change any existing database object, RLS policy, or SECURITY DEFINER
  function.
- This chapter does NOT introduce or modify Edge Functions or React/TypeScript modules.

**Rollout Philosophy (When Implementation Is Later Approved).**
- Additive first: introduce new datasets, contracts, and pipelines alongside existing ones.
- Shadow before cutover: run new pipelines in parallel, compare with existing outputs.
- Fitness-gated promotion: only promote when quality, lineage, and SLO gates pass.
- Reversible by default: every change SHALL have a documented rollback per V11.


## Chapter 103 — Data Fitness Functions

**Purpose.** Continuously verify architectural fitness of the data platform.

**Architecture.** Layered architecture composed of ingestion, storage, processing, governance, and consumption planes, aligned to the Enterprise Reference Architecture ratified in V11.

**ASCII Diagram.**
```text
[Producers] ─▶ [Contract] ─▶ [Pipeline] ─▶ [Storage] ─▶ [Serving] ─▶ [Consumers]
                     │                                     │
                     └────────── Governance / Lineage ─────┘
```

**Rules (RFC 2119).**
- Producers MUST publish schemas to the registry before emission.
- Consumers SHALL validate payloads against the registered schema.
- Breaking changes MUST NOT be released without a governance approval per V11.
- Sensitive fields MUST be classified per Chapter 25 (Data Classification).
- Lineage SHALL be captured for every transformation.

**Examples.**
- A `patient.registered` event carries `tenant_id`, `branch_id`, and a canonical `party_id`.
- The `invoice.line` dimension conforms to the enterprise `Money` type.
- The `appointment.no_show` fact links to `Party`, `Provider`, `Location`, and `Time` dimensions.

**Future Implementation Notes.** Reference the enterprise Canonical Data Model. Do not couple to vendor-specific storage semantics. Adopt open table formats where practical.

**Backward Compatibility Notes.** Additive only. Existing schemas, tables, RLS policies, and services continue to operate unchanged. No migration is prescribed.

**Security Notes.** Alignment with V10 Zero-Trust: least-privilege access to data planes, encryption at rest and in transit, and field-level classification enforced by policy.

**Performance Notes.** Sampling, partitioning, indexing, and materialization strategies SHOULD align with SLOs published in V12.

**Governance Notes.** Owned by the Enterprise Data Council under V11 ARB with domain-level stewards defined in Chapter 6 (Data Ownership).

**Extended Discussion.**
This chapter forms part of the ZMedico Enterprise Data Platform (EDP) architectural corpus.
It codifies the intent, boundaries, and interfaces of the concern without prescribing runtime
implementation. Where implementation is eventually undertaken, the Governance Workflow ratified
in V6 SHALL apply, and the architectural boundaries defined in V8, V9, V10, V11, and V12 SHALL
be respected. Nothing in this chapter changes application code, database schema, RLS policies,
SECURITY DEFINER functions, Edge Functions, generated types, tests, package manifests, or
infrastructure assets.

**Interfaces.**
- **To V8 Authorization.** All data access decisions remain authoritative under RLS and V8
  policies. This chapter MUST NOT be interpreted as altering those decisions.
- **To V9 Identity.** Principal identity, trust envelopes, and session semantics are owned by
  V9. This chapter consumes identity as a fact; it does not redefine it.
- **To V10 Security.** Encryption, key management, and sensitivity classification are governed
  by V10. This chapter aligns to those classifications without inventing new ones.
- **To V11 Governance.** All decisions arising from this chapter SHALL be routed through the
  ARB, ADR, and lifecycle mechanisms V11 defines.
- **To V12 Observability.** Data-plane telemetry (freshness, quality, lineage, throughput) is
  emitted through the observability signals V12 standardizes; V13 defines the semantics, V12
  defines the transport.

**Design Considerations.**
- Prefer *contract-first* design: producers publish schemas and semantics before any consumer
  couples to them.
- Prefer *open standards*: SQL, OpenAPI, AsyncAPI, JSON Schema, Avro, Parquet, Iceberg/Delta,
  OpenLineage, DCAT.
- Prefer *decentralized ownership with federated governance*: domain teams own products; a
  federated council owns policy.
- Prefer *bounded contexts*: cross-domain coupling flows through published contracts, not
  through shared physical tables.
- Prefer *evolvability*: schemas evolve with compatibility rules; consumers negotiate versions
  through the schema registry.

**Anti-Patterns to Avoid.**
- Shared mutable OLTP tables as an integration channel.
- Untyped, unversioned event payloads.
- Point-to-point pipelines with no lineage capture.
- Silent schema drift with no compatibility gate.
- Uncontrolled cross-tenant joins.

**Compliance Alignment.**
- **HIPAA**: Preserve minimum necessary access; PHI is handled per V10 classifications.
- **GDPR**: Preserve lawful basis and purpose limitation; enable subject rights.
- **ISO 27001**: Align to Annex A controls for information classification, cryptography, and
  supplier data handling.
- **NIST 800-53**: Align to AC, AU, SC, and SI family controls at the data plane.

**Operational Envelope.**
- Data SLAs SHALL be published per data product (freshness, completeness, availability).
- Quality signals SHALL be observable in V12 dashboards.
- Incidents affecting data products SHALL follow the incident management workflow ratified
  by V12 Chapter 47.

**Explicit Non-Goals.**
- This chapter does NOT define authorization semantics.
- This chapter does NOT define identity or session semantics.
- This chapter does NOT define encryption primitives or key custody.
- This chapter does NOT change any existing database object, RLS policy, or SECURITY DEFINER
  function.
- This chapter does NOT introduce or modify Edge Functions or React/TypeScript modules.

**Rollout Philosophy (When Implementation Is Later Approved).**
- Additive first: introduce new datasets, contracts, and pipelines alongside existing ones.
- Shadow before cutover: run new pipelines in parallel, compare with existing outputs.
- Fitness-gated promotion: only promote when quality, lineage, and SLO gates pass.
- Reversible by default: every change SHALL have a documented rollback per V11.


---

## Data Sensitivity Class Matrix

| Class | Examples | Handling |
|---|---|---|
| C0 Public | Marketing content | Open |
| C1 Internal | Aggregated metrics | Employees |
| C2 Confidential | Business records | Role-scoped |
| C3 Restricted | PII, financial | Least-privilege + audit |
| C4 Regulated | PHI, biometric | Encryption + legal controls |

## Retention Class Matrix

| Class | Hot | Warm | Cold | Legal Hold |
|---|---|---|---|---|
| Operational | 30 d | 180 d | 1 y | On demand |
| Clinical | 1 y | 3 y | 10 y | Mandatory |
| Financial | 1 y | 3 y | 7 y | Mandatory |
| Audit/Security | 90 d | 1 y | 7 y | Mandatory |

## Data Contract Matrix

| Aspect | Contract Element |
|---|---|
| Schema | Field names, types, nullability |
| Semantics | Business meaning, glossary link |
| Quality | Freshness, completeness, accuracy SLOs |
| Ownership | Producer, steward, on-call |
| Compatibility | Backward/forward rules |
| Sensitivity | Classification per field |

## Compatibility Matrix

| Version | Concern | Compatibility |
|---|---|---|
| V3 / V3.1 | Baseline RBAC | 100% |
| V4 | Bundle model | 100% |
| V5 | Runtime engine | 100% |
| V6 | Governance | 100% |
| V7 | Policy/Context | 100% |
| V8 | Authorization Platform | 100% |
| V9 | Identity Platform | 100% |
| V10 | Security & Zero Trust | 100% |
| V11 | Reference Architecture | 100% |
| V12 | Observability Platform | 100% |
| V13 | Data Platform | This document |

## Version Matrix

| Version | Layer | Runtime Change |
|---|---|---|
| V3 → V7 | Authorization Semantics | None |
| V8 | Authorization Platform | None (doc) |
| V9 | Identity Platform | None (doc) |
| V10 | Security Platform | None (doc) |
| V11 | Governance | None (doc) |
| V12 | Observability | None (doc) |
| V13 | Data Platform | **None (doc)** |

## Enterprise Roadmap

1. Publish the Enterprise Canonical Data Model and Business Glossary.
2. Establish the Data Catalog and Schema Registry as governed platforms.
3. Onboard domain data products with contracts and SLAs.
4. Formalize PHI/PII classification and retention automation.
5. Stand up the Feature Store and AI data-readiness pipeline.
6. Publish tenant-scoped data SLAs and observability per V12.

## Future Work

- Federated query plane across multi-region storage.
- Confidential-compute analytics for cross-tenant aggregates.
- Automated lineage inference from query plans.
- Ontology-driven knowledge graph for clinical decision support.
- Contract-first event schema evolution with policy-checked compatibility.

## Change Report

**Files Created:**
- `docs/auth/BUSINESS_AUTHORIZATION_V13_ENTERPRISE_DATA_PLATFORM_AND_INFORMATION_ARCHITECTURE.md`

**Files Modified:** None
**Files Deleted:** None
**Runtime Changes:** None
**Database Changes:** None
**Supabase Changes:** None
**SQL Changes:** None
**RLS Changes:** None
**SECURITY DEFINER Changes:** None
**Edge Function Changes:** None
**React / TypeScript Changes:** None
**Hook Changes:** None
**Generated Type Changes:** None
**Package Changes:** None
**Infrastructure Changes:** None
**API Changes:** None
**Configuration Changes:** None
**Documentation Only:** Confirmed

## Final Confirmation

This document introduces **ZERO runtime behavior changes**. This document is **Architecture Documentation ONLY**. This document is **fully backward compatible with V3 through V12**. Future implementation MUST go through the Governance Workflow defined in V6 while respecting the architectural boundaries defined by V8 Authorization, V9 Identity, V10 Security, V11 Governance, and V12 Observability.

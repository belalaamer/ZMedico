# Authorization Extension Guide

**Mode:** Documentation only. No runtime, RLS, SECURITY DEFINER, Edge
Function, feature-flag, bundle, or permission change. Nothing in this
document alters current authorization behaviour.

**Purpose:** Show how a new business vertical (dental, laboratory,
radiology, pharmacy, home healthcare, veterinary, telemedicine, mental
health, optical, emergency) extends the permission catalog **without
touching the engine**. All examples honour the universal grammar
`<domain>.<resource>.<action>[.<scope>]` and the closed verb vocabulary
defined in `AUTHORIZATION_NAMING_GUIDELINES.md`.

Every example is *illustrative*. None of these keys exist in the
catalog today; they are candidates for future additive migrations
subject to the deprecation and shadow-probe protocol.

---

## 0. Golden Rules

1. New keys are **additive** — never rename or repurpose existing keys.
2. Reuse the 32 domains from `UNIVERSAL_AUTHORIZATION_TAXONOMY.md §4`
   before proposing a new domain.
3. Only closed-vocabulary verbs (`view`, `create`, `update`, `delete`,
   `approve`, `sign`, `export`, `upload`, `download`, `print`,
   `cancel`, `complete`, `adjust`, `transfer`, `receive`, `refund`,
   `waive`, `post`, `reconcile`, `manage` — for the four admin keys
   only, etc.).
4. **No specialty noun** may appear in a key. Never `dental.*`,
   `radiology.*`, `vet.*`.
5. Specialty behaviour ships as a **Feature Layer** toggle plus new
   *resource* names inside universal domains.
6. Bundle updates land in the **same migration** as new keys; parity
   is proven by shadow probe.

---

## 1. Dental

Specialty surface: odontogram, perio charting, ortho tracking.

Universal keys (candidates, not scheduled):

```
clinical_notes.odontogram.view
clinical_notes.odontogram.create
clinical_notes.odontogram.update
clinical_notes.perio_chart.view
clinical_notes.perio_chart.create
treatment_plans.ortho.view
treatment_plans.ortho.update
```

Bundle wiring: extend `bundle.clinical.writer` via
`authz_bundle_implies` — no role touches the new keys directly.

Feature toggle: `feature.clinical.odontogram` shown only when
`tenant.clinic_type = 'dental'`.

---

## 2. Laboratory

Specialty surface: test orders, specimens, results.

```
encounters.lab_order.view
encounters.lab_order.create
encounters.lab_order.cancel
documents.lab_result.upload
documents.lab_result.sign
documents.lab_result.download
inventory.reagent.adjust
inventory.reagent.audit
```

Reuses `documents`, `inventory`, `encounters` domains. No new domain
needed.

---

## 3. Radiology / Imaging Center

```
encounters.imaging_order.view
encounters.imaging_order.create
documents.imaging_study.upload
documents.imaging_study.download
documents.imaging_report.create
documents.imaging_report.sign
resources.modality.view
resources.modality.update
```

The DICOM viewer is a **Feature**, not a permission.

---

## 4. Pharmacy / Dispensary

```
prescriptions.dispense.view
prescriptions.dispense.create
prescriptions.dispense.cancel
inventory.stock.receive
inventory.stock.issue
invoices.otc.create
payments.otc.create
```

Controlled-substance ledgers are additional resources under
`inventory` and `audit`.

---

## 5. Home Healthcare

```
appointments.home_visit.view
appointments.home_visit.create
appointments.home_visit.complete
attendance.field.create
attendance.field.update
communication.route_sheet.view
```

Field GPS check-in already exists in `attendance`; new resource
`field` is additive.

---

## 6. Veterinary

Species is patient metadata, not a permission axis.

```
patients.species.view
patients.species.update
clinical_notes.vaccination.view
clinical_notes.vaccination.create
inventory.vaccine.receive
appointments.boarding.view
appointments.boarding.create
```

Bundle: extend `bundle.clinical.writer`.

---

## 7. Telemedicine

```
appointments.telehealth.view
appointments.telehealth.create
appointments.telehealth.complete
communication.video_session.view
communication.video_session.create
documents.consent.upload
```

Video-call vendor integration is a **Feature**; the permission model
only knows about sessions and documents.

---

## 8. Mental Health

Extra confidentiality is handled via `default_scope` (`own`) on
capability bundles, not via specialty keys.

```
clinical_notes.psych_note.view
clinical_notes.psych_note.create
clinical_notes.psych_note.sign
documents.risk_assessment.upload
```

The heightened confidentiality is enforced by RLS policy conditions
and existing scope semantics — not by a new verb.

---

## 9. Optical

```
clinical_notes.refraction.view
clinical_notes.refraction.create
prescriptions.eyewear.create
prescriptions.eyewear.print
inventory.frames.receive
inventory.frames.adjust
invoices.eyewear.create
```

---

## 10. Emergency

```
queue.triage.view
queue.triage.update
encounters.emergency.view
encounters.emergency.create
encounters.emergency.complete
communication.alert.create
```

Triage acuity levels are Feature-Layer configuration, not permission
keys.

---

## 11. Cross-Cutting Extensions

Some capabilities transcend specialty and are added the same way:

| Capability | Universal keys |
|---|---|
| Consent management | `documents.consent.upload`, `documents.consent.sign` |
| Insurance pre-auth | `insurance.preauth.view/create/approve/reject` |
| Referrals | `encounters.referral.view/create` |
| Discharge summaries | `clinical_notes.discharge.view/create/sign` |

---

## 12. Extension Checklist

Before proposing new keys, confirm:

- [ ] Domain reused from the 32-domain registry.
- [ ] Verb is in the closed vocabulary.
- [ ] Key contains **no** specialty noun.
- [ ] Bundle wiring drafted in the same change.
- [ ] Shadow-probe expected-expansion row prepared.
- [ ] Rollback SQL prepared per `docs/wave3*/` template.
- [ ] Feature toggle drafted for UI surfacing.
- [ ] No existing key renamed, deleted, or repurposed.

Meeting every item guarantees the engine, RLS, SECURITY DEFINER
functions, Edge Functions, and current production behaviour remain
byte-identical.

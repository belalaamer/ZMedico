# 28 — Plugin Guide (Design Sketch)

Source: `docs/product/PLUGIN_ARCHITECTURE.md`. Not implemented yet — this is a Possible Future Direction preserved here so plugin authors know the intended contract.

## Envisioned plugin surface
- **Manifest** — declares name, permissions requested, UI extension points, DB migrations, edge functions.
- **UI extension points** — sidebar nav slots, dashboard widgets, patient-profile tabs, invoice actions.
- **Permission additions** — must go through governance; plugin permissions live in namespaced group (e.g. `plugin_dental.*`).
- **Isolation** — plugins never bypass RLS or the AuthorizationService.

## Guardrails
- No plugin can override core bundles.
- No plugin can add SECURITY DEFINER without owner approval.
- All plugin migrations follow the standard `GRANT` + `RLS` + policy pattern.

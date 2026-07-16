# AI System Context — Knowledge Base

Authoritative documentation suite designed so that any engineer or AI model
(Claude, GPT, Gemini, Cursor, Copilot, etc.) can reason about this codebase
with the depth of someone who has worked on it for months.

## When to read what

| File | Use when you need to… |
|---|---|
| `00_EXECUTIVE_OVERVIEW.md` | Get the 60-second picture of the whole platform. |
| `01_PRODUCT_OVERVIEW.md` | Understand what the product is and who uses it. |
| `02_BUSINESS_MODEL.md` | Understand monetization, tenants, pricing. |
| `03_PRODUCT_VISION.md` | Understand where the product is going. |
| `04_DOMAIN_MODEL.md` | Understand DDD bounded contexts and aggregates. |
| `05_SYSTEM_ARCHITECTURE.md` | Understand end-to-end architecture. |
| `06_DATABASE_ARCHITECTURE.md` | Understand data-plane design. |
| `07_AUTHORIZATION_ARCHITECTURE.md` | Understand permissions/bundles/RLS. |
| `08_FRONTEND_ARCHITECTURE.md` | Understand React app structure. |
| `09_BACKEND_ARCHITECTURE.md` | Understand Supabase + Edge Functions. |
| `10_MODULE_GUIDE.md` | Learn each functional module. |
| `11_COMPONENT_CATALOG.md` | Find a shared UI component. |
| `12_HOOK_CATALOG.md` | Find a React hook. |
| `13_EDGE_FUNCTION_CATALOG.md` | Find a Deno edge function. |
| `14_DATABASE_CATALOG.md` | Look up a table. |
| `15_ENTITY_CATALOG.md` | Look up a domain entity/aggregate. |
| `16_DATA_FLOW.md` | Trace how data moves. |
| `17_EVENT_FLOW.md` | Trace event-like signals. |
| `18_EVENT_CATALOG.md` | Look up a named event or trigger. |
| `19_WORKFLOW_GUIDE.md` | Follow a business workflow end-to-end. |
| `20_BUSINESS_RULES.md` | Look up invariants and rules. |
| `21_SECURITY_MODEL.md` | Understand threat model / defenses. |
| `22_PERMISSION_REFERENCE.md` | Look up a permission key. |
| `23_UI_UX_GUIDE.md` | Understand UX patterns. |
| `24_DESIGN_SYSTEM.md` | Use design tokens correctly. |
| `25_TECH_STACK.md` | Know versions and libraries. |
| `26_CONFIGURATION_GUIDE.md` | Configure env / feature flags. |
| `27_DEPENDENCY_GRAPH.md` | See module interdependencies. |
| `28_PLUGIN_GUIDE.md` | Add a future plugin. |
| `29_MARKETPLACE_GUIDE.md` | Understand marketplace direction. |
| `30_REPORTING_GUIDE.md` | Build/extend reports. |
| `31_AI_CONTEXT.md` | Prime any AI with project rules. |
| `32_AI_SYSTEM_PROMPT.md` | Paste as a system prompt. |

## Rules for this suite
- Documentation only. Never changes runtime.
- Facts are drawn from the repository; inferences are marked **Assumption** or **Possible Future Direction**.
- The canonical authorization runtime, permission catalog, bundles, RLS, SECURITY DEFINER functions, and Edge Functions described here MUST NOT be modified as a side effect of reading this documentation.

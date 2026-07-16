# 25 — Tech Stack

| Layer | Choice |
|---|---|
| Language | TypeScript 5 |
| Framework | React 18 |
| Bundler | Vite 5 |
| Styling | Tailwind CSS v3 + shadcn/ui + Radix |
| Routing | React Router 6 |
| State/data | TanStack Query |
| Forms | react-hook-form + zod (**Assumption**) |
| Testing | Vitest (unit), Playwright (e2e/shadow) |
| Backend | Supabase (Postgres 15, Auth, Storage, Edge Functions) |
| Edge runtime | Deno |
| Observability | Sentry |
| CI | GitHub Actions (CodeQL, shadow-qa) |
| Package manager | bun (preferred) / npm |
| AI (optional) | Lovable AI Gateway |

## Do-not-touch
- `src/integrations/supabase/client.ts`
- `src/integrations/supabase/types.ts`
- `.env` Supabase vars
- `supabase/config.toml`

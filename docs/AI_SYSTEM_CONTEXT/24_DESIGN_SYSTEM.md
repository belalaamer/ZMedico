# 24 — Design System

## Tokens
Defined in `src/index.css` as HSL CSS variables (light + dark). Tailwind consumes via `tailwind.config.ts`.

**Do not**:
- Use raw color utilities (`text-white`, `bg-black`, `bg-[#…]`) in components.
- Hardcode gradient or shadow values in JSX.

**Do**:
- Use semantic classes (`bg-background`, `text-foreground`, `border-border`, `text-muted-foreground`, `bg-primary`, `text-primary-foreground`, etc.).
- Extend via shadcn variants when a new pattern is needed.

## Typography
- Body/heading fonts declared in `index.css` / `tailwind.config.ts`.
- Avoid Inter/Poppins as defaults unless explicitly chosen.

## Components
- Primitives: `src/components/ui/` (shadcn).
- Composed: `src/components/` (project-specific).
- Icons: `lucide-react`.

## Dark mode
Handled via CSS variables; components must remain legible in both themes.

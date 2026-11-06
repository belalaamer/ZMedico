import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
          glow: "hsl(var(--primary-glow))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
        },
        info: {
          DEFAULT: "hsl(var(--info))",
          foreground: "hsl(var(--info-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
        // Clinical Ink. The platform surfaces consume these; the legacy palette above stays
        // until the site-wide phases retire it. See .qoder/skills/zmedico-design-tokens.
        z: {
          canvas: "hsl(var(--z-surface-canvas))",
          raised: "hsl(var(--z-surface-raised))",
          sunk: "hsl(var(--z-surface-sunk))",
          inverse: "hsl(var(--z-surface-inverse))",
          ink: {
            900: "hsl(var(--z-ink-900))",
            700: "hsl(var(--z-ink-700))",
            500: "hsl(var(--z-ink-500))",
            400: "hsl(var(--z-ink-400))",
          },
          line: {
            hairline: "hsl(var(--z-line-hairline))",
            edge: "hsl(var(--z-line-edge))",
            strong: "hsl(var(--z-line-strong))",
          },
          brand: {
            900: "hsl(var(--z-brand-900))",
            700: "hsl(var(--z-brand-700))",
            500: "hsl(var(--z-brand-500))",
            100: "hsl(var(--z-brand-100))",
            "050": "hsl(var(--z-brand-050))",
          },
          positive: {
            DEFAULT: "hsl(var(--z-positive))",
            ink: "hsl(var(--z-positive-ink))",
            fill: "hsl(var(--z-positive-fill))",
            stroke: "hsl(var(--z-positive-stroke))",
          },
          caution: {
            DEFAULT: "hsl(var(--z-caution))",
            ink: "hsl(var(--z-caution-ink))",
            fill: "hsl(var(--z-caution-fill))",
            stroke: "hsl(var(--z-caution-stroke))",
          },
          critical: {
            DEFAULT: "hsl(var(--z-critical))",
            ink: "hsl(var(--z-critical-ink))",
            fill: "hsl(var(--z-critical-fill))",
            stroke: "hsl(var(--z-critical-stroke))",
          },
          neutral: {
            DEFAULT: "hsl(var(--z-neutral))",
            ink: "hsl(var(--z-neutral-ink))",
            fill: "hsl(var(--z-neutral-fill))",
            stroke: "hsl(var(--z-neutral-stroke))",
          },
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        z1: "var(--z-radius-1)",
        z2: "var(--z-radius-2)",
        z3: "var(--z-radius-3)",
      },
      spacing: {
        z1: "var(--z-space-1)",
        z2: "var(--z-space-2)",
        z3: "var(--z-space-3)",
        z4: "var(--z-space-4)",
        z5: "var(--z-space-5)",
        z6: "var(--z-space-6)",
        z7: "var(--z-space-7)",
        z8: "var(--z-space-8)",
        z9: "var(--z-space-9)",
        z12: "var(--z-space-12)",
        z16: "var(--z-space-16)",
      },
      fontSize: {
        "z-display": ["var(--z-text-display)", { lineHeight: "var(--z-leading-display)" }],
        "z-title": ["var(--z-text-title)", { lineHeight: "var(--z-leading-title)" }],
        "z-subtitle": ["var(--z-text-subtitle)", { lineHeight: "var(--z-leading-subtitle)" }],
        "z-body": ["var(--z-text-body)", { lineHeight: "var(--z-leading-body)" }],
        "z-small": ["var(--z-text-small)", { lineHeight: "var(--z-leading-small)" }],
        "z-label": ["var(--z-text-label)", { lineHeight: "var(--z-leading-label)" }],
        "z-micro": ["var(--z-text-micro)", { lineHeight: "var(--z-leading-micro)" }],
        // Arabic sets one step larger below 17px and looser above it: Plex Arabic's
        // ascenders collide at Latin leading. Pair every role with `rtl:text-z-*-ar`.
        "z-display-ar": ["var(--z-text-display)", { lineHeight: "var(--z-leading-display-ar)" }],
        "z-title-ar": ["var(--z-text-title)", { lineHeight: "var(--z-leading-title-ar)" }],
        "z-subtitle-ar": ["var(--z-text-subtitle-ar)", { lineHeight: "var(--z-leading-subtitle-ar)" }],
        "z-body-ar": ["var(--z-text-body-ar)", { lineHeight: "var(--z-leading-body-ar)" }],
        "z-small-ar": ["var(--z-text-small-ar)", { lineHeight: "var(--z-leading-small-ar)" }],
        "z-label-ar": ["var(--z-text-label-ar)", { lineHeight: "var(--z-leading-label-ar)" }],
        "z-micro-ar": ["var(--z-text-micro-ar)", { lineHeight: "var(--z-leading-micro-ar)" }],
      },
      boxShadow: {
        z1: "var(--z-shadow-1)",
        z2: "var(--z-shadow-2)",
      },
      transitionDuration: {
        zquick: "var(--z-duration-quick)",
        zbase: "var(--z-duration-base)",
        zslow: "var(--z-duration-slow)",
      },
      transitionTimingFunction: {
        "z-out": "var(--z-ease-out)",
        "z-in": "var(--z-ease-in)",
      },
      keyframes: {
        "accordion-down": {
          from: {
            height: "0",
          },
          to: {
            height: "var(--radix-accordion-content-height)",
          },
        },
        "accordion-up": {
          from: {
            height: "var(--radix-accordion-content-height)",
          },
          to: {
            height: "0",
          },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;

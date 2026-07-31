---
name: Horizon
colors:
  bg: '#14120F'
  surface: '#1D1A16'
  surface-raised: '#2A251F'
  border: 'rgba(42, 37, 31, 0.85)'
  text-primary: '#F5F1EA'
  text-secondary: '#9C948A'
  accent: '#FF7A45'
  accent-soft: '#FF9A6C'
  accent-muted: 'rgba(255, 122, 69, 0.15)'
  error: '#ffb4ab'
typography:
  display:
    fontFamily: Hanken Grotesk
    fontSize: 32px
    fontWeight: '700'
    lineHeight: '1.2'
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Hanken Grotesk
    fontSize: 24px
    fontWeight: '700'
    lineHeight: '1.3'
  body-md:
    fontFamily: Hanken Grotesk
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.5'
  label-sm:
    fontFamily: Hanken Grotesk
    fontSize: 12px
    fontWeight: '500'
    lineHeight: '1.2'
rounded:
  control: 8px
  card: 12px
  pill: 999px
spacing:
  unit: 8px
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  container-max: 1200px
  margin-mobile: 16px
  margin-tablet: 24px
  margin-desktop: 48px
---

# Horizon

Canonical design system for the Sunsethue Helper frontend. Full token reference: [`docs/design/horizon.md`](design/horizon.md).

## Brand & style

Flat, minimal, single-accent dark UI. Warm charcoal surfaces with coral accent (`#FF7A45`) for active states, primary actions, focus, and quality meters. No glassmorphism, neon glows, or multi-color quality pills.

## Colors

Page `--bg` `#14120F`, cards `--surface` `#1D1A16`, raised controls `--surface-raised` `#2A251F`, hairline `--border`, text `--text-primary` / `--text-secondary`, accent `#FF7A45` with soft badge tint `#FF9A6C` on ~15% accent fill.

## Typography

**Hanken Grotesk** only (400 / 500 / 700). Tabular figures for numeric metadata. Existing type scale sizes retained; monospace labels removed.

## Layout & spacing

8pt grid (4–32px). Card padding 16px. Margins 16 / 24 / 48 across mobile / tablet / desktop. Max content width 1200px.

## Elevation & shape

Separation via flat surfaces and 0.5–1px borders — no backdrop blur or gradient fills. Radius: 12px cards, 8px controls, pill only for quality badges and location chips.

## Navigation

Forecast · Locations · Activity in tab bars; Settings via header gear. Locations form is a slide-over drawer. Activity merges run logs and delivery history behind a Runs / Deliveries filter.

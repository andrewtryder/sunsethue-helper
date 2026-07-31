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

Flat, minimal, single-accent dark theme for Sunsethue Helper. Replaces Twilight Glass and Obsidian Flux.

## Brand & style

Atmospheric and precise without glassmorphism. Surfaces are flat warm neutrals; a single coral accent (`#FF7A45`) marks active navigation, primary actions, focus rings, and quality meters.

## Colors

| Token | Value | Usage |
|-------|-------|--------|
| `--bg` | `#14120F` | Page background |
| `--surface` | `#1D1A16` | Cards, drawers, modals |
| `--surface-raised` | `#2A251F` | Inputs, chips, meter tracks, hover |
| `--border` | `#2A251F` at low opacity | Hairline separation |
| `--text-primary` | `#F5F1EA` | Headings and body |
| `--text-secondary` | `#9C948A` | Labels, metadata, inactive nav |
| `--accent` | `#FF7A45` | Primary CTA, active nav, meter fill, focus |
| `--accent-soft` | `#FF9A6C` | Quality badge text |
| `--accent-muted` | accent @ ~15% | Quality badge background |

Quality tiers share one visual treatment (accent badge + meter). No per-tier gradient pills.

## Typography

Single family: **Hanken Grotesk** at weights 400 / 500 / 700. Numbers use `font-variant-numeric: tabular-nums`. No monospace labels.

## Shape & elevation

- Cards: 12px radius, flat `--surface`, 1px `--border`
- Inputs / buttons: 8px radius
- Pills (`999px`): quality badge and location chips only
- No backdrop blur, drop-shadow glows, or gradient fills

## Spacing

8pt grid: 4 / 8 / 16 / 24 / 32. Card padding 16px. Page margins 16 (mobile) / 24 (tablet) / 48 (desktop).

## Components

### Buttons

- **Primary:** solid `--accent` fill, dark text
- **Secondary:** transparent with `--border` outline

### Quality indicator

Number + horizontal meter (accent fill on `--surface-raised` track) plus a small text badge using the single accent treatment.

### Navigation

Three destinations (Forecast, Locations, Activity) in desktop tabs and bottom nav. Settings opens from a gear in the top bar only. Active state is accent-colored icon/label — no glass or gradient pill behind the tab.

### Activity

Segmented Runs / Deliveries filter over one shared list component.

### Locations drawer

Add/edit form is a slide-over; the list is full width when the drawer is closed.

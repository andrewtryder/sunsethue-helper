---
name: Twilight Glass
colors:
  surface: '#120f2c'
  surface-dim: '#120f2c'
  surface-bright: '#383654'
  surface-container-lowest: '#0d0a27'
  surface-container-low: '#1b1835'
  surface-container: '#1f1c39'
  surface-container-high: '#292644'
  surface-container-highest: '#343150'
  on-surface: '#e4dfff'
  on-surface-variant: '#dec0b9'
  inverse-surface: '#e4dfff'
  inverse-on-surface: '#302d4b'
  outline: '#a68b84'
  outline-variant: '#57423d'
  surface-tint: '#ffb4a3'
  primary: '#ffb4a3'
  on-primary: '#621000'
  primary-container: '#ff7e5f'
  on-primary-container: '#721702'
  inverse-primary: '#a53b22'
  secondary: '#ffb780'
  on-secondary: '#4e2600'
  secondary-container: '#6f3c0d'
  on-secondary-container: '#f1a971'
  tertiary: '#c7bfff'
  on-tertiary: '#29009f'
  tertiary-container: '#a297ff'
  on-tertiary-container: '#3317a9'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#ffdad2'
  primary-fixed-dim: '#ffb4a3'
  on-primary-fixed: '#3d0700'
  on-primary-fixed-variant: '#84240d'
  secondary-fixed: '#ffdcc4'
  secondary-fixed-dim: '#ffb780'
  on-secondary-fixed: '#2f1400'
  on-secondary-fixed-variant: '#6c3a0a'
  tertiary-fixed: '#e4dfff'
  tertiary-fixed-dim: '#c7bfff'
  on-tertiary-fixed: '#170065'
  on-tertiary-fixed-variant: '#412bb6'
  background: '#120f2c'
  on-background: '#e4dfff'
  surface-variant: '#343150'
typography:
  display-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 48px
    fontWeight: '700'
    lineHeight: '1.1'
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 32px
    fontWeight: '700'
    lineHeight: '1.2'
  headline-lg-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 24px
    fontWeight: '700'
    lineHeight: '1.2'
  headline-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 20px
    fontWeight: '600'
    lineHeight: '1.4'
  body-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 18px
    fontWeight: '400'
    lineHeight: '1.6'
  body-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.6'
  label-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 14px
    fontWeight: '600'
    lineHeight: '1.2'
    letterSpacing: 0.05em
  label-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 12px
    fontWeight: '500'
    lineHeight: '1.2'
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  unit: 4px
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  gutter: 20px
  margin-mobile: 16px
  margin-desktop: 48px
---

## Brand & Style

The brand personality is atmospheric, precise, and premium. It targets photographers, commuters, and outdoor enthusiasts who seek beauty in daily transitions. The UI evokes a sense of "the golden hour" by contrasting a deep, nocturnal foundation with vibrant, luminous accents.

The design style is **Glassmorphism mixed with Modern Dark**. It utilizes frosted translucent layers to create a sense of depth and physical space, mimicking the diffusion of light through the atmosphere. High-contrast typography ensures legibility against complex backgrounds, while vibrant gradients serve as functional indicators of light quality.

## Colors

The palette is rooted in the "Blue Hour" and "Golden Hour." 

- **Primary & Secondary:** Warmer tones ranging from deep coral to soft amber, used primarily for action states and sunrise indicators.
- **Tertiary:** A deep electric violet used for "Blue Hour" forecasting and subtle UI glows.
- **Base:** The background is a sophisticated deep navy-to-purple gradient, providing a high-contrast canvas for the luminous elements.
- **Functional Gradients:** Quality indicators use specific ramps:
    - *Fair/Good:* Orange to Amber.
    - *Great/Spectacular:* Hot Pink to Deep Red.

## Typography

The system uses **Plus Jakarta Sans** for its modern, friendly, yet highly legible geometric proportions. 

- **Hierarchy:** Display and Headline sizes use heavy weights (700) with tight letter spacing to command attention.
- **Clarity:** Body text remains at a 400 weight with generous line heights to maintain readability against dark, glassmorphic backgrounds.
- **Context:** Labels and metadata use uppercase styling and wider tracking to differentiate from narrative body text.

## Layout & Spacing

The design system utilizes a **fluid grid** model with a 12-column structure for desktop and a single-column layout for mobile.

- **Rhythm:** An 8px soft-grid scale governs all padding and margins to ensure visual harmony.
- **Safe Areas:** Cards and containers use a standard 24px internal padding (`lg`) to allow the glassmorphic background blurs to feel spacious and premium.
- **Breakpoints:**
    - Mobile: < 600px (16px margins).
    - Tablet: 600px - 1024px (24px margins).
    - Desktop: > 1024px (Fixed max-width container of 1200px, centered).

## Elevation & Depth

Depth is established through **Backdrop Blurs** and **Ambient Glows** rather than traditional shadows.

1.  **Surface Base:** The main background gradient.
2.  **Surface Glass:** A `5%` white fill with a `20px` backdrop blur. This layer is used for secondary containers.
3.  **Surface Elevated:** A `10%` white fill with a `40px` backdrop blur and a thin `1px` translucent border (`rgba(255,255,255,0.1)`) on the top and left edges to simulate light hitting a glass edge.
4.  **Accent Glows:** Elements of high importance (like a "Main Forecast" button) use an outer glow (`drop-shadow`) that inherits the color of the element's gradient, creating a neon-like radiance.

## Shapes

The shape language is consistently **Rounded**. 

- **Cards & Containers:** Use `1rem` (16px) for standard cards and `1.5rem` (24px) for major dashboard sections.
- **Interactive Elements:** Buttons and Input fields use `0.5rem` (8px) for a modern, tactile feel.
- **Pills:** Indicators for "Quality" or "Status" use a fully rounded (pill) shape to distinguish them from structural UI components.

## Components

### Buttons
- **Primary:** Full `accent_gradient` fill, white text, bold weight. Includes a subtle orange outer glow.
- **Secondary:** Ghost style with a `1px` white translucent border and blurred background.

### Cards
- Standard containers use the `Surface Elevated` style. They must always feature the `1px` top/left highlight to maintain the "glass" illusion.

### Chips / Quality Badges
- These use the vibrant quality gradients (`quality_great_gradient`). They are compact, pill-shaped, and feature white text for maximum pop.

### Forecast Lists
- List items are separated by subtle `1px` lines (`rgba(255,255,255,0.05)`).
- Time and Quality metrics are right-aligned for quick scanning.

### Input Fields
- Dark, inset backgrounds with a `1px` border that transitions to the `primary_color` on focus.

### Navigation Tabs
- The active tab uses a "Glass-Inset" look with a subtle gradient fill, while inactive tabs remain purely translucent.
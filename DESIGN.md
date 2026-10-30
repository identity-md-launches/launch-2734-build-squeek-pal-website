# Squeek Pal design

## Overview

The site introduces a small browser companion and lets people try it before downloading. It keeps the existing warm cream/brown palette, original canvas pixel hamster, system typography and quiet document layout. The large pal is the visual focus; the download and demo actions precede the supporting explanation. The demo uses the same widget, popup and game code as the extension.

Canonical sources are `site/src/style.css`, `site/src/main.ts`, `site/src/strings.ts`, and `shared/{ui,panel,widget,art,card}.ts`. The landing hero is a page composition, not a template for the install guide or demo.

## Colors

The site tokens map to the light `--sp-*` tokens in `shared/ui.ts`. Reuse semantic tokens rather than approximating these values.

| Role | Site token | Light value |
| --- | --- | --- |
| Page | `--bg` | `#fffaf2` |
| Tonal surface | `--surface` | `#f6ecdc` |
| Primary text | `--fg` | `#2b1d14` |
| Secondary text | `--muted` | `#6b5544` |
| Divider/border | `--line` | `#e3d3bb` |
| Primary action | `--accent` | `#a8481a` |
| Primary action text | `--accent-fg` | `#ffffff` |
| Keyboard focus | `--focus` | `#1d70b8` |
| Good/running | shared `--sp-good` | `#2f7d4f` |
| Warning/festival | shared `--sp-warn` | `#9a5b00` |

Primary hover uses `#8f3c14`. Sample posts intentionally use X-like white, `#0f1419` text, `#536471` metadata/actions and `#eff3f4` dividers. Colored circles identify fictional sample authors; they do not convey game status.

The website stays light. The extension follows X using `data-theme` and shared tokens, with OS dark as a fallback. The dim palette is `#1e2a36` background, `#273544` surface, `#f2ece4` text, `#b9c2cc` muted, `#3a4a5b` divider. Dark uses `#111111`, `#1c1c1c`, `#f2ece4`, `#b3aca4`, `#333333` respectively. Both use accent `#f0a35c`, accent text `#1a1209`, good `#7fd6a2`, warning `#f5c76b` and focus `#8ec5ff`.

The design probe measured rendered landing-page text against its resolved solid backgrounds and passed the 4.5:1 text / 3:1 large-text thresholds. This does not establish every dark/dim or focus-state pair; see `artifacts/validation.md` for coverage limits.

## Typography

No font files or external font service. `--font` is system-ui, -apple-system, Segoe UI, Roboto, Noto Sans, Helvetica Neue, Arial, Liberation Sans, sans-serif. Code/save codes use ui-monospace, SF Mono, Menlo, Consolas, monospace. Requested weights are 400, 600 and 700, supplied by the local system fonts.

| Token | Value | Use |
| --- | --- | --- |
| `--t-xs` | 12px | Live numbers' labels, sample action row |
| `--t-sm` | 14px | Nav, supporting copy, post metadata, footer |
| `--t-md` | 16px | Body and feature headings |
| `--t-lg` | 18px | Lead copy and demo column headings |
| `--t-xl` | 28px | Section/demo headings |
| `--t-2xl` | `clamp(34px, 5vw, 48px)` | Landing headline |

Body line-height is 1.55; hero heading 1.05, section headings 1.15. Hero tracking is −0.03em, section/demo headings −0.02em; body tracking is natural. Headings balance, short prose uses pretty wrapping. Lead, subcopy and rules have 36em, 40em and 46em measure limits. Code is 0.95em of its surrounding text. Dynamic values use tabular numbers.

The compact shared panel uses 12/14/18px and the widget 12/14/16px. The 1200×630 card is canvas artwork with its own pixel-scale typography. Its complete name and stage/XP/Seeds line fit a 600px text area by adjusting the canvas font; text is never truncated. These canvas sizes are not page type tokens.

## Layout

`wrap` centers content at at most 1120px with `--gutter: clamp(16px, 4vw, 32px)`. Local groups use 4/8/12/16px gaps; separate groups use 24/32px. Standard sections use 56px block padding. The hero uses 16px top and 48px bottom on phones, then 48px top/72px bottom and a 48px gap on desktop.

- Header: brand at the start, navigation/language at the end, minimum 60px height. At ≤24rem, navigation padding drops to 6px and the inter-group gap to 4px; this rule follows the base rule so Vietnamese fits at 320px.
- Hero: one column below 52rem; at ≥52rem, columns are 1.1fr/0.9fr. Canvas is at most 224px on phones, 280px on desktop, with `image-rendering: pixelated`.
- Features: auto-fit columns with a minimum of `min(100%, 18rem)` and 24px gaps. The post illustration reuses actual sample post markup, includes one action-row chest and an 84×78px pal at its bottom-right. The golden chest appears with the cosmetics/quests feature. The pet-card feature spans the grid, at most 600px wide.
- Demo: heading block uses 16px padding above and below. The explanation about local demo saves sits below the reset action. Below 56rem the timeline precedes the toolbar; at ≥56rem a flexible timeline sits beside a 360px toolbar. The scroll region is `min(70vh, 640px)` high. At 390×844 the default pal's bottom is about 820px, visible without page scrolling.
- Install: auto-fit columns with a minimum of `min(100%, 22rem)`. Instruction lists wrap and use native ordered markers.
- Action rows, popup tabs and footer links wrap. Popup tabs have no hidden horizontal strip. Shared widget position is clamped on state changes, viewport resize and container resize. Its panel chooses above/below placement and horizontal offset within the containing frame or viewport; long panels scroll internally.

Observed in Chromium at 320, 390 and 1440 CSS pixels, in EN and VI, with no document-level horizontal overflow on the three routes. These widths are reflow checks, not physical-device or native zoom tests.

## Elevation & Depth

Site content uses tonal bands and whitespace, without decorative card shadows. The demo frame and toolbar use a 1px outline for structure. The card preview uses a black 10% 1px inset outline.

Only the floating shared widget uses elevation: light shadow `0 1px 2px rgb(43 29 20 / 0.12), 0 6px 20px rgb(43 29 20 / 0.16)`; dim/dark versions use black alpha shadows. The widget's page z-index is 2147483000, contained-demo z-index 5. Shadow DOM isolates its CSS from X; the demo toolbar also uses a shadow root.

## Shapes

Site buttons use `--radius: 12px`; navigation and small fields use 8px, the toolbar/panel 16px, stage/timeline 20px. Round avatars identify sample authors; the minimized widget is a 24px circle. Overflow clipping belongs to the timeline/rounded preview frame, not text containers. Pixel artwork uses hard edges and integer sprite scales.

## Components

| Component/source | Use and behavior |
| --- | --- |
| Site `.btn`, `.primary`, `.actions` | Native links/buttons, minimum 48px height; primary download is filled, secondary actions outlined; wrapping actions with 12px gaps. Hover backgrounds are pointer-gated; press scale 0.96 over 150ms. |
| Site header and hash routes, `site/src/main.ts` | Logo goes home; Demo/Install mark the current page. Skip focuses `main` without changing the hash. Section anchors stay on the current route. Language changes rerender translated page copy. |
| `animatedPal` and `shared/art.ts` | Original canvas art; hero uses a live pose getter: ACTIVE/online runs, IDLE naps, unknown sits. Reduced motion freezes animation but still redraws a changed live pose. |
| `liveStrip`, `shared/ui.ts` | Shared live headline, speed/distance/block and festival/earnings states. Unknown is a dash; errors explicitly say the wheel cannot be reached. Meaning is expressed in words as well as color. |
| `mountWidget`, `shared/widget.ts` | Pal, care panel, toast, minimized bubble and per-page hiding. Enter/click opens; Escape closes and restores pal focus. Drag, saved position and panel bounds share the same frame geometry. |
| `mountPanel`, `shared/panel.ts` | Pet/shop/wardrobe/quests/settings tabs, roving tab focus with Left/Right arrows. `initialTab` and `onTabChange` preserve the demo's selected tab during translation. Delegated controls are constrained to this panel, excluding the extension body's initial-tab marker. |
| `drawCard` / `downloadCard`, `shared/card.ts` | Local 1200×630 PNG with name, stage, XP, Seeds, cosmetics and stats. No network call. Name and amounts fit fully; canvas tagline follows EN/VI. |
| EN/VI string tables | Site text in `site/src/strings.ts`, game UI in `shared/i18n.ts`; sample post prose intentionally remains fictional English text marked `lang="en"`, while its action labels follow the selected language. |

## Do's and Don'ts

- Start additional site content inside `.wrap` and reuse the existing spacing and six named type tokens. Use the compact demo arrangement only for the playable surface.
- Reuse shared canvas art, `liveStrip`, `mountWidget` and `mountPanel`; keep game changes in the shared reducer/rules.
- Keep one clear filled action per local task, meaningful native controls and the existing 2px focus indicator. Let translated tabs and labels wrap.
- Keep loading, unavailable, idle and running distinct. Never draw a running hero to imply a live reading when its strip is idle or unknown.
- Validate imported save data before use and escape dynamic HTML values. A checksum is not a trust boundary.
- Preserve relative assets/hash routing, local fonts/art, the no-wallet/no-tracker behavior and the existing palette. A new route should reuse the route renderer, translated strings, header/footer and focus behavior, then be checked at all three supported widths.

Design review used the pinned Better Interface guide, adapted from Jakub Krehel's Better Interface (MIT), and its documentation method from Paul Bakaus's Impeccable (Apache-2.0). These are guidance sources, not added runtime dependencies. Review evidence and unperformed checks are recorded separately in `artifacts/validation.md`.

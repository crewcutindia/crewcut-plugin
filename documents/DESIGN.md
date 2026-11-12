# CrewCut NLE Plugin — Design System & Panel UI Specification

**Date:** 2026-11-11  
**Status:** Context Locked (Pre-Code)  
**North Star:** *"The Measured Edit Shelf"* (aligned with `Crewcut/DESIGN.md`, `Crewcut-docs/DESIGN.md`, and `crewcut-legal/DESIGN.md`)

---

## 1. Visual Philosophy & Cross-Site Consistency

Across the CrewCut ecosystem:
- **App (`Crewcut`), Docs (`Crewcut-docs`), and Legal (`crewcut-legal`)** share a strict **monochrome graphite dark mode** where video thumbnails and footage carry the only color.
- **Marketing (`crewcut-landing`)** intentionally introduces `#00E5CC` teal and `Instrument Serif` for hero storytelling, and **Admin (`crewcut-admin`)** uses `#b18cf8` purple glassmorphism for internal operations.
- **The NLE Plugin (`Crewcut-plugin`)** is a daily editor workspace inside Adobe Premiere Pro and After Effects. Per user decision, it follows **the strict Measured Edit Shelf grayscale palette** so it feels like a calm, native extension of CrewCut and never competes with color-grading scopes or timeline footage.

### Non-Negotiable Visual Rules
1. **Grayscale-only chrome**: Controls, borders, active tabs, focus rings, progress bars, and buttons remain neutral grayscale.
2. **Preserve logo integrity**: Render `crewcut-logo.png` cleanly in grayscale (`grayscale brightness-150`, matching `Crewcut/src/components/layout/Navbar.tsx` and `Sidebar.tsx`).
3. **Preserve footage color**: Video thumbnails and status previews inside footage keep source colors.
4. **No decorative slop**: No neon glows, gradient text, glassmorphic purple cards, or marketing hero copy inside the panel.

---

## 2. Color Tokens (Exact Parity with `Crewcut/DESIGN.md` & `src/index.css`)

| Token | Hex | Usage in CEP Panel |
|---|---|---|
| `--canvas` | `#111113` | Panel background, recessed inputs, scroll container base |
| `--surface` | `#1B1B1E` | Cards, video items, comment cards, auth container |
| `--surface-raised` | `#222225` | Hover surfaces, active card emphasis, sticky headers |
| `--surface-control` | `#252528` | Secondary buttons, selects, dropdown triggers |
| `--surface-sidebar` | `#171719` | Scrollbar track, recessed sub-bars, footer strip |
| `--text-primary` | `#F4F4F5` | Headings, active labels, video titles, primary action fill |
| `--text-secondary` | `#A1A1AA` | Supporting copy, comment body, metadata labels |
| `--text-muted` | `#909096` | Low-emphasis labels, timestamps-ago, helper text (contrast-safe) |
| `--border` | `#27272A` | Primary card borders, section hairlines |
| `--divider` | `#343438` | Control borders, subtle dividers, scrollbar thumb |
| `--focus` | `#C7C7CC` | `2px solid` keyboard focus ring (`outline-offset: 2px`) |
| `--action` | `#F4F4F5` | Primary CTA background (`Render & Upload`, `Link Account`, `Sync Markers`) |
| `--action-hover` | `#DEDEE2` | Primary CTA hover fill |
| `--action-text` | `#111113` | Text on primary filled buttons |

### Semantic Status Badges (Subtle, Non-Intrusive — Matching `AccountView.tsx` & `Sidebar.tsx`)
Communicate state with **text + icon first**, supported by subtle desaturated badges when critical:
- **Ready / Active / Synced**: Neutral bone/zinc badge (`#252528` fill, `#F4F4F5` text) or restrained emerald tint (`rgba(16,185,129,0.12)` / `#34d399` text) matching `AccountView.tsx`.
- **Storage Warning (`>= 75%`)**: Amber progress fill / border hint (`#fbbf24` text) + explicit remaining storage text.
- **Storage Critical (`>= 90%`) / Upload Error**: Rose alert border & text (`#fb7185` / `rose-400`) + actionable error message.

---

## 3. Typography & Numeric Discipline

Matching `Crewcut/tailwind.config.js` and `src/index.css`:
- **UI Sans**: `Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`
  - **Panel Header / View Title**: `14px–16px`, `font-weight: 600`, `letter-spacing: -0.02em`, `#F4F4F5`
  - **Section Heading**: `12px–13px`, `font-weight: 600`, `#F4F4F5`
  - **Body / Comment Text**: `12px–13px`, `font-weight: 400`, `line-height: 1.5`, `#F4F4F5` / `#A1A1AA`
  - **Micro Label / Badge**: `11px`, `font-weight: 500`, `line-height: 1.4`
- **Monospace (`tabular-nums`)**: `'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`
  - `font-variant-numeric: tabular-nums; font-feature-settings: 'tnum' 1;`
  - **Use strictly for**: Timecodes (`01:24`, `00:12.50`), file sizes (`142.4 MB`), upload speeds (`8.2 MB/s`), storage meter (`18.4 / 75 GB`), percentages (`64%`), and masked API key prefixes (`cc_live_a1b2c3d...`).

---

## 4. Spacing, Radii & Component Specs (Tuned for Narrow CEP Panels)

Adobe CEP panels are typically docked in sidebars **`280px–400px` wide**. Web-scale `44px` tall controls everywhere feel bloated inside a vertical edit dock; tighten heights slightly while preserving comfortable click targets and clear `4px` base spacing:

- **Spacing Base**: `4px` (`4px`, `8px`, `12px`, `16px`, `24px`). Panel outer padding: `12px` at `<340px` width, `16px` at `>=340px`.
- **Radii**:
  - Cards / Containers: `10px–12px` (`#1B1B1E`, `1px solid #27272A`)
  - Inputs / Selects / Dropzone: `8px` (`#111113` fill, `1px solid #343438`)
  - Primary / Secondary Buttons: `6px–8px`, height `34px–38px` (`min-height: 34px`)
  - Status Pills / Timecode Badges: `4px–6px`
- **Scrollbars**: `6px` wide, `#171719` track, `#343438` thumb (`#52525a` hover) — identical to `Crewcut/src/index.css`.
- **Accessibility & Motion**:
  - `:focus-visible` `2px solid #C7C7CC`, `outline-offset: 2px`
  - Respect `@media (prefers-reduced-motion: reduce)`

---

## 5. Panel Information Architecture (3 Primary States + 2 Tabs)

### State 1: Unlinked / Onboarding View
- Centered compact card (`#1B1B1E`, `1px solid #27272A`) inside `#111113` canvas.
- Grayscale CrewCut logo + `"CrewCut"` wordmark + host badge (`Premiere Pro` or `After Effects`).
- Plain-language 2-step cue: Generate key in `Account Settings > Adobe NLE Plugin` -> paste `cc_live_...` below.
- Monospace password/text input + **Link Account** (`#F4F4F5` fill, `#111113` text).
- Inline error banner on `401`, or upgrade CTA card on `403 nlePluginRestricted`.

### State 2: Plan-Restricted View (`Free` / `Starter` Key)
- Header still shows connected email + `Unlink`.
- Calm monochrome lock card: `"Adobe NLE Plugin requires Plus or Studio"` with concise bullet summary (75 GB / 150 GB, direct render & upload, timeline marker sync) and **View Plus & Studio Plans** button opening `{appOrigin}/billing/pricing`.

### State 3: Linked Main Workspace
- **Top Bar (Compact `44px`)**:
  - Left: CrewCut grayscale logo + host context pill (`PPRO` / `AEFT`).
  - Right: Storage compact readout (`18.4 / 75 GB`), Refresh button, Account menu / Unlink.
- **Segmented 2-Tab Switcher**:
  1. **Upload** (`Export & Share`)
  2. **Feedback** (`Comments & Markers`)
- **Tab 1 — Upload**:
  - **Source Switch**: `Active Sequence / Comp` (auto-detected name + duration + optional `In/Out` or `Work Area` checkbox) vs `Local Video File` (compact dropzone / Browse).
  - **Title Input** + **Folder Select** (`Root Library` or fetched folders).
  - **Primary CTA**: `Render & Upload` (or `Upload File`), pre-checked against remaining quota.
  - **Progress State**: Stage indicator (`1. Rendering H.264...` -> `2. Uploading 64% · 12.4 MB/s`) with Pause / Resume / Cancel controls.
  - **Result Card**: Auto-generated `reviewUrl` with 1-click **Copy Link** (`Copied!`) + **Open Review** + **Jump to Feedback**.
- **Tab 2 — Feedback**:
  - **Cut Selector**: Dropdown/list of `recentVideos` showing status badge (`Ready`, `Processing`), duration, and comment count, plus Refresh button.
  - **Action Bar**: Primary **Sync Markers to Timeline/Comp** button + count badge (`12 notes`).
  - **Comment List**: Chronological cards (`#1B1B1E`, `#27272A` border). Each card shows clickable **tabular-mono timecode pill** (`00:42` — clicking seeks Premiere/AE CTI immediately), author name, `Reply` badge if `isReply`, comment text, and subtle synced-marker indicator once synced.

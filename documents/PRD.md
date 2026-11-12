# CrewCut NLE Plugin — Product Requirements Document (PRD)

**Date:** 2026-11-11  
**Status:** Context Locked (Pre-Code)  
**Target Hosts:** Adobe Premiere Pro & Adobe After Effects (CEP Extension: `Window > Extensions > CrewCut`)  
**Parent App:** CrewCut (`https://beta.crewcut.in` -> future `https://app.crewcut.in`)

---

## 1. Product Purpose

Give video editors and motion designers working inside Adobe Premiere Pro and After Effects a **Core Roundtrip** bridge to CrewCut without leaving their NLE: render or pick a cut, upload directly to their CrewCut library, copy a client review link, inspect timestamped feedback in-panel, jump the timeline/composition playhead to any comment, and inject feedback directly onto the timeline as native markers.

---

## 2. Target Users & Plan Gating

### 2.1 Audience
- Commercial video editors, agency editors, and motion designers in India using Premiere Pro (`PPRO`) and After Effects (`AEFT`) to deliver cuts for client review.
- Consistent with `Crewcut` PRD v3: **one account type** (no team roles, seats, or client accounts).

### 2.2 Plan Access Gate (Verified in `Crewcut` Migration `20261111000000` & `src/lib/plans.ts`)
Access to API key generation (`public.api_keys`) and the `nle-plugin` / `upload-sign` API-key endpoints is gated to **Plus** and **Studio**:

| Plan | Monthly (INR) | Yearly (INR) | Active Cloud Storage | Silent Delivery Cap (Backend Only) | Max Playback | NLE Plugin Access |
|---|---:|---:|---:|---:|---|---|
| **Free** | ₹0 | ₹0 | 5 GB | 10 GB | 1080p Full HD | Blocked (`403`) |
| **Starter** | ₹199 | ₹1,999 | 25 GB | 50 GB | 1080p Full HD | Blocked (`403`) |
| **Plus** | ₹499 | ₹4,999 | 75 GB | 150 GB | 2K / 4K | **Included** |
| **Studio** | ₹999 | ₹9,999 | 150 GB | 300 GB | 4K Ultra HD | **Included** |

- **Never display** the silent delivery cap (`10 / 50 / 150 / 300 GB`), Bunny Stream internals, or TUS jargon inside the plugin UI.
- If a linked user downgrades to Free or Starter (HTTP `403`, `nlePluginRestricted: true`), the plugin displays a clear monochrome lock card explaining Plus/Studio requirement with an external link to `/billing/pricing`.

---

## 3. Core User Flows (v1 Scope)

### Flow A: Account Linking (API Key Auth)
1. Editor opens `/account` -> **Adobe NLE Plugin & API Keys** -> clicks **Generate Key** (creates a `cc_live_...` secret key once; stored SHA-256 hashed in `public.api_keys`).
2. Inside Premiere Pro or After Effects, editor opens `Window > Extensions > CrewCut`.
3. Editor pastes their `cc_live_...` key and clicks **Link Account**.
4. Plugin calls `nle-plugin` (`action: "get-context"`), stores the key securely on the local machine, and displays:
   - Account email, active plan badge (`Plus` / `Studio`), and storage bar (`used / total`).
   - Available single-level folders and recent cuts.
5. Editor can **Unlink / Switch Key** anytime from the panel header/settings.

### Flow B: One-Click Render & Upload (Plus Local File Fallback)
1. **Source Selection**:
   - **Active Sequence / Composition (Default)**: Shows active Premiere Pro sequence name & duration (with optional `In/Out` or `Work Area` range toggle) or active After Effects composition name & duration.
   - **Existing Local File (Fallback)**: Drag-and-drop or file picker for `.mp4`, `.mov`, `.mkv`, `.webm` already rendered on disk.
2. **Upload Metadata**:
   - Video title (defaults to sequence/comp name or filename without extension).
   - Destination folder dropdown (`All Videos (Root)` or any existing single-level folder from `get-context`).
   - Pre-flight quota check against remaining account storage before rendering/uploading.
3. **Render & Resumable TUS Upload**:
   - Clicking **Render & Upload** renders an H.264 `.mp4` (via Adobe Media Encoder / AE Render Queue) to a managed temporary path, shows render progress, then immediately streams 5 MB TUS chunks directly to Bunny Stream (`https://video.bunnycdn.com/tusupload`) using signed headers from `upload-sign`.
   - Supports Pause, Resume, and Cancel during upload. Cleans up temporary rendered files after upload succeeds or is canceled.
4. **Instant Review Link**:
   - `upload-sign` pre-creates a 9-character review link (`reviewToken` / `reviewUrl`).
   - On upload completion, plugin surfaces the review URL with **Copy Link** (and optional auto-copy preference) plus **Open in Browser** (`{appOrigin}/review/{token}`).
   - On TUS completion, plugin calls `nle-plugin` (`action: "mark-uploaded"`) to transition status immediately from `uploading` -> `processing`, and Bunny webhook (`bunny-webhook`) transitions `processing` -> `ready`.

### Flow C: In-Panel Comment Browser & Playhead Jump
1. Editor picks a cut from their recent cuts list (or pastes/opens a linked cut for the current sequence/comp).
2. Plugin calls `nle-plugin` (`action: "get-comments"` / `"sync-markers"`) with `videoId` or `reviewToken`.
3. Panel lists comments sorted chronologically by `timecodeSeconds`, displaying author, tabular-mono timecode (`MM:SS` or `HH:MM:SS`), message body, and subtle `Reply` indentation (`isReply: true`).
4. Clicking any comment timestamp immediately seeks the Premiere Pro sequence CTI or After Effects active composition CTI (`comp.time`) to `timecodeSeconds`.

### Flow D: One-Click Timeline / Composition Marker Sync
1. Editor clicks **Sync Markers to Timeline** (Premiere Pro) or **Sync Markers to Comp** (After Effects).
2. Plugin injects comments at each `timecodeSeconds` onto the active sequence (PPRO) or active composition (AEFT) with:
   - **Name / Author**: `{author}` (or `CrewCut · {author}`)
   - **Comment body**: Feedback text + embedded deterministic CrewCut marker key (`[cc:{commentId}]` or marker payload) so re-syncing skips already-imported comments and never creates duplicate markers.
3. Panel displays a concise sync summary (e.g., `Added 6 markers (2 already synced)`).

---

## 4. Explicit Scope Lock (Out of Scope for v1)

Per `Crewcut` PRD v3 + Ponytail discipline, the following are **excluded from v1** (do not scaffold or implement):
- **In-panel comment replying or comment deletion** (editor replies/deletes on the web app; `comment-reply` only accepts Supabase user JWT today).
- **Creating, renaming, or deleting folders inside the plugin** (managed on the web library; `nle-plugin` is read-only for folders).
- **UXP dual-runtime build** (CEP covers both Premiere Pro and After Effects in one codebase).
- **Frame-drawing / canvas annotations**, **video version stacks**, **nested folders**, **team seats / roles**, **reviewer downloads**, **Rush transcoding controls** (`rush_minutes = 0` for all tiers at launch).
- **Custom built-in FFmpeg/transcoder binaries** (use Adobe Media Encoder / After Effects native H.264 render).

---

## 5. Error & Edge States

| Condition | Expected Panel Behavior |
|---|---|
| Invalid or revoked `cc_live_...` key (`401`) | Inline error below key input; allow re-entry without losing local state. |
| Free / Starter account key (`403 nlePluginRestricted`) | Show monochrome upgrade notice naming Plus / Studio plans + link to `/billing/pricing`. |
| Storage quota exceeded (`403 quotaExceeded` or pre-flight fail) | Block upload before transfer, show used vs quota and link to `/billing/addon` or `/billing/pricing`. |
| No open project / no active sequence or comp | Disable "Render & Upload" / "Sync Markers" with plain guidance; keep "Upload Local File" and comment browsing usable. |
| Network drop mid-upload | Pause/retry automatically via `tus-js-client` exponential backoff; preserve manual Retry/Cancel. |
| Video still `uploading` / `processing` | Show status pill (`Processing`) in recent cuts; allow copying review link while Bunny encodes. |

---

## 6. Launch Criteria

- Installs cleanly via signed ZXP / CEP extension folder and appears under `Window > Extensions > CrewCut` in both **Adobe Premiere Pro** and **Adobe After Effects**.
- API key linking (`cc_live_...`) enforces Plus/Studio access and survives panel close/reopen.
- One-click sequence render (PPRO) and comp render (AEFT) produce H.264 `.mp4`, upload resumably via TUS, clean up temp renders, and yield a working review URL.
- Local `.mp4` / `.mov` upload fallback works when no render is needed.
- Clicking a comment seeks the active Premiere sequence or AE composition playhead accurately (accounting for sequence start offset / frame rate).
- Clicking **Sync Markers** creates timeline/comp markers cleanly and is **idempotent** across repeated clicks.
- UI strictly obeys `documents/DESIGN.md` grayscale tokens at narrow dockable widths (`280px–420px`) with zero horizontal overflow.

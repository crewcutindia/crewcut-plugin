# CrewCut NLE Plugin — Brain (Decisions, Skills & Build Plan)

**Last Updated:** 2026-11-11  
**Current Phase:** Milestones 1–4 Complete — Ready for Live Testing in Premiere Pro & After Effects  
**Engineering Philosophy:** Ponytail (simplest working path, native platform APIs first, zero speculative abstractions) + Impeccable (Measured Edit Shelf grayscale craft)

---

## 1. Locked Decisions Ledger

| Date | Area | Decision | Rationale |
|---|---|---|---|
| 2026-11-11 | **Runtime** | Adobe **CEP (HTML5/JS + Node.js + ExtendScript `.jsx`)** targeting both **Premiere Pro (`PPRO`)** and **After Effects (`AEFT`)**. | One shared UI + Node TUS uploader covers both hosts; matches `CreateApiKeyModal.tsx` (`Window > Extensions > CrewCut`) and `nle-plugin` ExtendScript comments; AE lacks full UXP parity for render/marker automation. |
| 2026-11-11 | **v1 Scope** | **Core Roundtrip**: API key link (`cc_live_...`), 1-click render (H.264) + local file upload fallback, auto-copy review link, comment list + playhead (CTI) jump, and idempotent timeline/comp marker sync. | Delivers the complete editor feedback loop immediately using existing `nle-plugin` and `upload-sign` endpoints without blocking on backend changes for replies/folders. |
| 2026-11-11 | **Export Path** | **Adobe Media Encoder / AE Render Queue** H.264 `.mp4` render to temp path + local file drop/browse fallback. | Uses Adobe's native encoders instead of bundling heavy FFmpeg binaries; temp file is deleted cleanly after TUS upload. |
| 2026-11-11 | **Visual Design** | Strict **Measured Edit Shelf** grayscale (`#111113` canvas, `#1B1B1E` surface, `#F4F4F5` bone CTA, `Inter` + `JetBrains Mono`). | Matches `Crewcut/DESIGN.md`, `Crewcut-docs`, and `crewcut-legal`, and avoids visual noise against video/color scopes inside Premiere & AE. |
| 2026-11-11 | **Backend Boundary** | `Crewcut` (`C:\Users\jigne\Projects\Crewcut\supabase\functions`) owns API endpoints; `Crewcut-plugin` owns the CEP client only. | Avoids duplicating Supabase auth/Bunny keys or maintaining two backends. Pre-coding backend discrepancies are logged in `TRD.md` §4. |

---

## 2. Ponytail Simplification & Deferral Ledger

| Deliberate Simplification (`ponytail:` ceiling) | Skipped Complexity | Exact Trigger to Add Later |
|---|---|---|
| Single CEP runtime for PPRO + AEFT | Dual CEP + UXP Premiere build pipeline | When Adobe deprecates CEP in Premiere Pro without backwards compatibility and AE UXP reaches full render/marker parity. |
| Read-only folders & read-only comment browsing inside panel | In-panel folder creation, comment replies, comment resolve/delete | When editors repeatedly request replying from inside Premiere/AE and `comment-reply` / `nle-plugin` support `x-crewcut-api-key`. |
| Local `config.json` in OS CEP `USER_DATA` for `cc_live_` key | Native OS keychain C++/N-API addon | If enterprise/shared multi-user workstation security requires OS credential vault isolation. |
| Deduplicate synced markers via `[cc:<id>]` tag in marker comments | External SQLite/JSON local sync state DB per project | If two-way marker editing (renaming/deleting markers in NLE syncing back to web) is ever added. |
| Vanilla/minimal web panel stack (evaluate lightweight React/Vite vs zero-build ES modules at Milestone 1) | Heavy component libraries, animation frameworks, client routers | Only if panel UI grows beyond 2 tabs and simple component state becomes hard to maintain. |

---

## 3. Skills & Tooling Inventory

### 3.1 Already Installed Globally (`C:\Users\jigne\.gemini\config\skills\`)
- **UI & Design**: `impeccable`, `frontend-design`, `baseline-ui`, `make-interfaces-feel-better`, `fixing-accessibility`, `transitions-dev`, `modern-web-guidance`
- **Backend & Schema**: `supabase`, `supabase-postgres-best-practices`
- **React / Code / Docs**: `vercel-react-best-practices`, `doc-coauthoring`, `anti-slop`

### 3.2 `skills.sh` Lookup Results (via `/find-skills` on 2026-11-11)
- Highest-install Adobe/NLE skills found:
  - `sfkislev/flue@Premiere` & `sfkislev/flue@Adobe` (`1.9K` installs each)
  - `hetpatel-11/adobe_premiere_pro_mcp@premiere-pro-mcp` (`991` installs)
  - `reelary/skills@nle-export` (`953` installs)
  - `aedev-tools/adobe-agent-skills@after-effects` (`706` installs)
- CEP/UXP-plugin-specific skills (`kevinkiklee/adobe-plugin-skills@adobe-plugin-development` at `33` installs, `jdorfman/agent-skills@premiere-uxp-plugin` at `7`, `ki2pixel/after-effects-scripts-plugins-bundle@after-effects-cep-panel` at `2`) are below the 1K-install threshold; treat with caution if inspected later.

---

## 4. Phased Build Roadmap

- **Milestone 0 — Context & Docs *(Done)***:
  - Created `documents/{PRD,TRD,DESIGN,ECOSYSTEM_CONTEXT,BRAIN}.md`.
- **Pre-Flight — Live Backend & Local Host Audit *(Done; 1 manual Bunny check left)***:
  - Live Supabase `sobbjbnalljbqifzcqcf`: `nle-plugin` v5 (with `mark-uploaded`) and `upload-sign` v20 deployed & smoke-tested on binary GiB (`1024^3`).
  - Pending manual check: confirm Bunny Stream dashboard `WebhookUrl` on libraries `799214` & `799215` points to `bunny-webhook` (plus delete the synthetic smoke-test user `50133f10-b1bd-4d64-b90b-2ae11b516581` in Supabase SQL Editor).
  - Local Windows check: `Node v24.18.1` / `npm 12.0.2` present; `HKCU:\Software\Adobe\CSXS.12` present; Premiere Pro & After Effects not yet installed on this machine.
- **Milestone 1 — CEP Shell & Auth *(Done; ready for Milestone 2)***:
  - Built `CSXS/manifest.xml` (`PPRO` + `AEFT`, `CSXS 11.0`, `--enable-nodejs`), `.debug`, `scripts/install-dev.ps1`, ES3 ExtendScript host probe (`host/{common,ppro,aeft,index}.jsx`), zero-build `file://`-safe panel UI (`client/{index.html,styles.css,app.js}` + `client/lib/{format,api,cepBridge}.js`), `cc_live_...` key linking, Plus/Studio gate view, GiB storage meter, and recent cuts link copy/open.
  - Verified with `npm test` (`4 passed, 0 failed`) and `impeccable detect`.
- **Milestone 2 — Export & Resumable TUS Upload *(Done)***:
  - Implemented `ppro.jsx` sequence info + AME H.264 `.epr` discovery & export polling, and `aeft.jsx` comp info + AE Render Queue H.264 `.mp4` (with ProRes/Lossless fallback) export while preserving pre-existing RQ items.
  - Implemented Node.js `fs.createReadStream` + `tus-js-client` 5 MB chunked uploader (`client/lib/uploader.js`) via `upload-sign`, calling `mark-uploaded` on finish, Pause/Resume/Cancel, temp file cleanup, and review-link copy/open/feedback card.
- **Milestone 3 — Feedback Browser, Playhead Jump & Marker Sync *(Done)***:
  - Implemented cut selector, chronological comment list (`author` + `text` + `isReply`), click-to-seek CTI (`setPlayerPosition` / `comp.time`), and idempotent `[cc:<id>]` marker injection in both Premiere Pro and After Effects.
- **Milestone 4 — Packaging, Install & Verification *(Done)***:
  - Updated `scripts/install-dev.ps1` (`node_modules` + `package.json` support in `-Copy` mode), added `scripts/package-zxp.ps1` (clean staging bundle + optional `ZXPSignCmd` signing), and expanded Node `vm` + uploader unit tests.

# CrewCut NLE Plugin — Technical Requirements Document (TRD)

**Date:** 2026-11-11  
**Status:** Context Locked (Pre-Code)  
**Runtime:** Adobe CEP (Common Extensibility Platform) — HTML5/Chromium + Node.js + ExtendScript (`.jsx`)  
**Host Targets:** Adobe Premiere Pro (`PPRO`) & Adobe After Effects (`AEFT`)

---

## 1. System Architecture Overview

```mermaid
flowchart LR
    subgraph Host ["Adobe Host App (Premiere Pro / After Effects)"]
        JSX["ExtendScript Host (ppro.jsx / aeft.jsx)"]
        AME["AME / AE Render Queue (H.264 MP4)"]
    end

    subgraph CEP ["CrewCut CEP Extension (Window > Extensions > CrewCut)"]
        UI["Panel Web UI (HTML/CSS/JS)"]
        Node["CEP Node.js Bridge (fs, os, tus-js-client)"]
        CSI["CSInterface.js"]
    end

    subgraph Backend ["CrewCut Backend (C:\\Users\\jigne\\Projects\\Crewcut)"]
        FnNLE["Supabase Edge: /functions/v1/nle-plugin"]
        FnSign["Supabase Edge: /functions/v1/upload-sign"]
        FnHook["Supabase Edge: /functions/v1/bunny-webhook"]
    end

    subgraph Bunny ["Bunny Stream"]
        TUS["https://video.bunnycdn.com/tusupload"]
    end

    UI <--> CSI <--> JSX
    JSX -->|Queue H.264 Render| AME
    AME -->|Temp .mp4| Node
    UI <--> Node
    UI -->|x-crewcut-api-key| FnNLE
    Node -->|x-crewcut-api-key| FnSign
    Node -->|5 MB Chunks (Node ReadStream)| TUS
    TUS -->|Status 7 / 3 / 4| FnHook
```

### Why CEP (Single Shared Codebase)
1. `Crewcut`'s `CreateApiKeyModal.tsx` already instructs editors: `Window > Extensions > CrewCut`.
2. `Crewcut`'s `nle-plugin/index.ts` already formats comments for `"ExtendScript marker injection"`.
3. After Effects does not yet offer UXP parity with Premiere Pro for third-party render-queue and comp-marker workflows, whereas **CEP runs in both Premiere Pro and After Effects** with one UI and Node.js file I/O (streaming multi-GB `.mp4` files from disk without browser `<input type="file">` prompts).

---

## 2. CEP Manifest & Host Configuration

`CSXS/manifest.xml` targets:
- **Host List**:
  - `PPRO` (Premiere Pro)
  - `AEFT` (After Effects)
  -*(Minimum tested CSXS/host versions to be pinned in Milestone 1 based on target Creative Cloud floor, e.g. CSXS 11/12 covering CC 2022–2026+).*
- **CEF CommandLine Parameters**:
  - `--enable-nodejs` (required for `fs`, `path`, `os`, and Node `tus-js-client` file streaming)
  - `--mixed-context` (or clean Node bridge isolation — verify context mode carefully in Milestone 1 so `window.cep` / `require` and browser globals don't collide).
- **Menu Path**: `Window > Extensions > CrewCut`
- **Panel Geometry**: Dockable panel, designed primarily for narrow vertical docks (`min-width: 260px`, default `340px`, `min-height: 420px`).

---

## 3. Verified Backend API Contract (`Crewcut` Supabase Edge Functions)

**Base URL (Current Production Project):** `https://sobbjbnalljbqifzcqcf.supabase.co/functions/v1`  
**Web App Origin:** Currently `https://beta.crewcut.in`; transitioning to `https://app.crewcut.in`. The plugin **must** store base URLs as configurable settings and always prefer `reviewUrl` returned by the backend rather than constructing review URLs from a hardcoded domain.

### 3.1 Authentication Header
Every request uses the user's `cc_live_<48-hex>` key generated in `/account`:
- Preferred header: `x-crewcut-api-key: cc_live_...`
- Also accepted by `nle-plugin` and `upload-sign`: `Authorization: Bearer cc_live_...`
- CORS headers allowed on both functions include `authorization, x-client-info, apikey, content-type, x-crewcut-api-key`.
- Plan enforcement: `plus` and `studio` only; `free` and `starter` receive HTTP `403`:
  ```json
  {
    "error": "The Adobe Premiere Pro & After Effects NLE plugin requires a Plus or Studio plan.",
    "nlePluginRestricted": true,
    "planId": "free"
  }
  ```

### 3.2 `POST /functions/v1/nle-plugin`

#### Action 1: `get-context` (or `auth-check`)
Request:
```json
{ "action": "get-context" }
```
Response (`200`):
```json
{
  "success": true,
  "user": {
    "id": "uuid",
    "email": "editor@example.com",
    "name": "editor",
    "plan": "plus",
    "storageUsedBytes": 123456789,
    "storageLimitBytes": 80530636800
  },
  "folders": [
    { "id": "uuid", "name": "Client Cuts", "created_at": "iso8601" }
  ],
  "recentVideos": [
    {
      "id": "uuid",
      "title": "Brand Film v2",
      "duration_s": 94,
      "size_bytes": 52428800,
      "status": "ready",
      "created_at": "iso8601",
      "folder_id": "uuid-or-null",
      "reviewToken": "AbCdEf123",
      "reviewUrl": "https://beta.crewcut.in/review/AbCdEf123"
    }
  ]
}
```
*(Returns up to 20 most recent owner videos ordered by `created_at DESC`.)*

#### Action 2: `get-or-create-review-link`
Request:
```json
{ "action": "get-or-create-review-link", "videoId": "uuid" }
```
Response (`200`):
```json
{
  "success": true,
  "reviewToken": "AbCdEf123",
  "reviewUrl": "https://beta.crewcut.in/review/AbCdEf123"
}
```

#### Action 3: `mark-uploaded` (Transition NLE upload after TUS finishes)
Request:
```json
{ "action": "mark-uploaded", "videoId": "uuid", "sizeBytes": 104857600 }
```
Response (`200`):
```json
{
  "success": true,
  "video": {
    "id": "uuid",
    "status": "processing",
    "size_bytes": 104857600
  }
}
```
*(Idempotent if `bunny-webhook` already transitioned status to `processing`, `ready`, or `failed`; returns `400` if `videoId` missing, `404` if not found/owned.)*

#### Action 4: `get-comments` (or `sync-markers`)
Request (`videoId` or `reviewToken` required):
```json
{ "action": "get-comments", "videoId": "uuid" }
```
Response (`200`):
```json
{
  "success": true,
  "video": {
    "id": "uuid",
    "title": "Brand Film v2",
    "durationSeconds": 94
  },
  "comments": [
    {
      "id": "uuid",
      "author": "Client Name",
      "timecodeSeconds": 14.5,
      "text": "Tighten this cut by 8 frames",
      "createdAt": "iso8601",
      "isReply": false
    }
  ],
  "totalComments": 1
}
```

### 3.3 `POST /functions/v1/upload-sign`
Request:
```json
{
  "title": "Brand Film v3",
  "sizeBytes": 104857600,
  "folderId": "uuid-or-null",
  "isPremium": false,
  "estimatedDurationSeconds": 94
}
```
Response (`200`):
```json
{
  "videoId": "uuid",
  "providerVideoId": "bunny-guid",
  "uploadUrl": "https://video.bunnycdn.com/tusupload",
  "tusEndpoint": "https://video.bunnycdn.com/tusupload",
  "reviewToken": "XyZ987654",
  "reviewUrl": "https://beta.crewcut.in/review/XyZ987654",
  "encodingTier": "standard",
  "fallbackNotice": null,
  "authHeaders": {
    "LibraryId": "799214",
    "VideoId": "bunny-guid",
    "AuthorizationSignature": "sha256-hex",
    "AuthorizationExpire": "1762870000"
  },
  "expiresAt": "iso8601"
}
```
*(Tier libraries verified in `Crewcut/supabase/functions/_shared/bunny.ts`: `free: 799212`, `starter: 799213`, `plus: 799214`, `studio: 799215`. Errors: `400` missing title or invalid `sizeBytes`, `401` invalid/revoked key, `403 nlePluginRestricted` with `planId`, `403 quotaExceeded` with `currentStorageGb` / `maxStorageGb` in GiB, `404` invalid/unowned `folderId`.)*

### 3.4 Direct Bunny TUS Upload
- Endpoint: `https://video.bunnycdn.com/tusupload`
- Chunk size: `5 * 1024 * 1024` (5 MB), retry delays `[0, 1000, 3000, 5000, 10000, 20000]`.
- Headers: `authHeaders` from `upload-sign` (`LibraryId`, `VideoId`, `AuthorizationSignature`, `AuthorizationExpire`).
- Metadata: `{ filename, filetype }`.
- After TUS `onSuccess`, call `POST /functions/v1/nle-plugin` `{ action: "mark-uploaded", videoId, sizeBytes }` so status moves immediately from `'uploading'` to `'processing'` without needing a Supabase user JWT.
- Note for Node.js: Pass `fs.createReadStream(filePath)` + explicit `uploadSize: fs.statSync(filePath).size` to `tus-js-client` so multi-GB files stream with low memory overhead.

---

## 4. Backend Pre-Flight Status (Updated 2026-11-11)

Resolved & live smoke-tested on Supabase `sobbjbnalljbqifzcqcf` (`nle-plugin` v5 & `upload-sign` v20):

1. **Non-Existent DB Columns & Fail-Closed Error Handling — RESOLVED**:
   - `nle-plugin` v5 and `upload-sign` v20 now select only existing columns (`videos.size_bytes`, `folders(id, name, created_at)`), replaced the broken `api_keys -> profiles` embed with an explicit `profiles` lookup, and fail closed with HTTP `500` on DB errors.
2. **Quota Units — RESOLVED**:
   - Both `nle-plugin` v5 and `upload-sign` v20 standardize on binary GiB (`BYTES_PER_GB = 1024 * 1024 * 1024`). `Plus` (`75` GiB) = `80,530,636,800` bytes across pre-flight and upload signing.
3. **Upload Completion Status Without User JWT — RESOLVED**:
   - `nle-plugin` v5 adds `action: "mark-uploaded"` (`'uploading'` -> `'processing'`, idempotent against `bunny-webhook`).
   - **Remaining manual check**: Confirm in the Bunny Stream dashboard that libraries `799214` (Plus) and `799215` (Studio) both have `WebhookUrl` set to `https://sobbjbnalljbqifzcqcf.supabase.co/functions/v1/bunny-webhook` so `'processing'` transitions to `'ready'`.
4. **Origin Cutover (`beta.crewcut.in` -> `app.crewcut.in`)**:
   - Both functions strip trailing slashes on `APP_ORIGIN` (currently defaulting to `https://beta.crewcut.in`). Keep the plugin's web/API base URL configurable and prefer backend-returned `reviewUrl`.
5. **`get-context` Video Limit**:
   - `nle-plugin` `get-context` returns up to 20 `recentVideos` with no search/pagination parameter (sufficient for v1; track if editors ask for deeper history).

---

## 5. Host ExtendScript Specifications (`PPRO` & `AEFT`)

### 5.1 Host Bridge Pattern (Ponytail Rule)
Keep ExtendScript ES3-compliant (no `let`/`const`, no arrow functions, no native `JSON` guaranteed across older hosts—bundle `json2` or safe serializer, wrap every entrypoint in `try { ... } catch (e) { return JSON.stringify({ ok: false, error: ... }); }`).
Separate host logic cleanly:
- `jsx/ppro.jsx` — Premiere Pro API only
- `jsx/aeft.jsx` — After Effects API only
- `jsx/common.jsx` — Shared JSON serialization / timecode / error helpers

### 5.2 Premiere Pro (`PPRO`) Operations
- **Inspect Context**: Active sequence (`app.project.activeSequence`), name, duration in seconds, `zeroPoint` / start time offset, In/Out points (`getInPoint()`, `getOutPoint()`).
- **Render Active Sequence**:
  - Use bundled `.epr` H.264 preset (1080p web review preset shipped inside extension resources, or host default H.264 preset discovery).
  - Queue via `app.encoder.encodeSequence(seq, outputPath, presetPath, workAreaType, removeOnCompletion)` and `app.encoder.startBatch()`.
  - Listen for AME completion via `app.encoder` events / ExtendScript callbacks (`onEncoderJobComplete`, `onEncoderJobError`) + file stability fallback check before triggering TUS upload.
- **Seek Playhead (CTI)**:
  - Convert `timecodeSeconds` relative to `seq.zeroPoint` (accounting for non-zero sequence start timecode!) and call `seq.setPlayerPosition(ticksString)`. *(Note: Premiere uses `254016000000` ticks per second).*
- **Marker Sync & Deduplication**:
  - Iterate `seq.markers` (`getFirstMarker()`, `getNextMarker()`). Extract existing `[cc:<commentId>]` tags from `marker.comments` into a lookup map so re-syncing **skips** comments already present.
  - Create missing markers via `seq.markers.createMarker(seconds)` (handling `zeroPoint` offset if needed — verify against `seq.markers` time base in Milestone 3!), setting `marker.name = comment.author` and `marker.comments = comment.text + "\n[cc:" + comment.id + "]"`.

### 5.3 After Effects (`AEFT`) Operations
- **Inspect Context**: `app.project.activeItem` (`instanceof CompItem`), name, `duration`, `workAreaStart`, `workAreaDuration`, `frameRate`.
- **Render Active Composition**:
  - Add active comp to `app.project.renderQueue.items.add(comp)`.
  - Configure Render Settings (Full/Work Area) and Output Module:
    - Prefer AE's native H.264 MP4 output template (available in AE 23.0+) when present; fallback to `app.project.renderQueue.queueInAME(true)` or QuickTime output when H.264 template is absent (verify exact template availability per AE version in Milestone 2!).
  - Monitor render completion (`rqItem.status === RQItemStatus.DONE`), remove temp Render Queue item if desired or leave clean, then TUS upload temp file and unlink temp file afterward.
- **Seek Playhead (CTI)**:
  - Set `comp.time = clamp(timecodeSeconds, 0, comp.duration)` (optionally opening comp viewer with `comp.openInViewer()`).
- **Marker Sync & Deduplication**:
  - Access composition markers (`comp.markerProperty`, available since AE CC 2017+) — fallback check for older AE if ever needed, though CC 2022+ supports `comp.markerProperty` natively!
  - Scan keys `1..markerProp.numKeys` for `[cc:<commentId>]` in `markerValue.comment` to avoid duplicates.
  - Add missing markers via `var mv = new MarkerValue(comment.text + "\n[cc:" + comment.id + "]"); mv.chapter = comment.author; markerProp.setValueAtTime(timecodeSeconds, mv);` (verify `MarkerValue` fields like `comment`, `label`, `chapter` cleanly in Milestone 3).

---

## 6. Local Security, Storage & Packaging

- **API Key Storage**: Never store `cc_live_...` inside project files or ExtendScript prefs. Persist in CEP panel's OS user data directory (`csInterface.getSystemPath(SystemPath.USER_DATA)/CrewCut/config.json`) with owner-only file permissions where applicable, or OS keychain if warranted later (`ponytail:` start with user-data JSON, upgrade to OS credential store if multi-user shared workstation threat requires it).
- **Networking**: HTTPS only (`https://sobbjbnalljbqifzcqcf.supabase.co` and `https://video.bunnycdn.com/tusupload`). Never embed Supabase `SERVICE_ROLE_KEY` or Bunny API keys in the plugin.
- **Development vs Distribution**:
  - Dev: Symlink/copy extension folder to Adobe CEP extensions directory and enable `PlayerDebugMode = 1` in `CSXS.11` / `CSXS.12` registry/plist.
  - Distribution: Package & sign with Adobe `ZXPSignCmd` into `.zxp` (and/or native installer for non-technical editors).

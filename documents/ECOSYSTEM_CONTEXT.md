# CrewCut Multi-Repo Ecosystem Context

**Date:** 2026-11-11  
**Purpose:** Single factual map of all 5 sibling CrewCut repositories so agents and developers working in `Crewcut-plugin` never guess URLs, backend behavior, pricing, or design rules.

---

## 1. Repository Inventory

| Repo | Path | Role & Domain | Stack | Design Direction |
|---|---|---|---|---|
| **Main Web App** | `C:\Users\jigne\Projects\Crewcut` | Core creator library, TUS uploads, review links, billing, API keys (`beta.crewcut.in` -> future `app.crewcut.in`) | React 18, Vite 6, Tailwind, shadcn/ui, Supabase (Auth/DB/Edge), Bunny Stream, Razorpay, Resend, PostHog | **Measured Edit Shelf** monochrome grayscale (`#111113` canvas, `#1B1B1E` surface, `#F4F4F5` actions, `Inter` + `JetBrains Mono`) |
| **Landing Page** | `C:\Users\jigne\Projects\crewcut-landing` | Closed-beta waitlist & marketing (`crewcut.in`) | Next.js, Tailwind, local fonts (`Inter`, `JetBrains Mono`, `Instrument Serif`), Brevo waitlist | Editorial hero (`#0b0910` / `#080B14`) with `#00E5CC` teal playhead/marker accents & `Instrument Serif` display |
| **User Docs** | `C:\Users\jigne\Projects\Crewcut-docs` | Public knowledge base (`docs.crewcut.in`) | Astro + Starlight + Pagefind search, Vercel | Monochrome dark (`#09090b` canvas, `#121215` surface, `#27272a` borders, `#ffffff` accent, `Inter` + `JetBrains Mono`) |
| **Admin Console** | `C:\Users\jigne\Projects\crewcut-admin` | Internal founder/ops console (users, quota overrides, coupons, Bunny sync) | React, Vite, Tailwind, Supabase | **Operate Glassmorphic** (`#0d0e12` canvas, `#15171e` glass cards, `#b18cf8` neon-purple accents) |
| **Legal Site** | `C:\Users\jigne\Projects\crewcut-legal` | Terms, Privacy, DPA, Beta Terms, Refunds, Contact (`legal.crewcut.in` / support `support@legal.crewcut.in`) | Static HTML, CSS, JS | Mirrors Main App **Measured Edit Shelf** (`#111113`, `#1B1B1E`, `#F4F4F5`, `Inter`) |

---

## 2. Shared Infrastructure (`Crewcut` Backend)

- **Supabase Project**: `mumbai-1` (`ap-south-1`), URL `https://sobbjbnalljbqifzcqcf.supabase.co`.
- **Auth & API Keys**:
  - Web users authenticate via Google OAuth or Email Magic Link (Supabase Auth).
  - NLE Plugin authenticates via user-generated `cc_live_...` keys stored as SHA-256 hashes in `public.api_keys` (RLS allows `INSERT` only for `plus` and `studio` profiles).
- **Bunny Stream Multi-Tier Video Libraries** (`Crewcut/supabase/functions/_shared/bunny.ts`):
  - `free`: Library `799212` (`ccpzfree1.crewcut.in`)
  - `starter`: Library `799213` (`ccpzstarter1.crewcut.in`)
  - `plus`: Library `799214` (`ccpzplus1.crewcut.in`)
  - `studio`: Library `799215` (`ccpzstudio1.crewcut.in`)
  - Standard encoding is used across all tiers (`rush_minutes = 0` at launch).
  - Bunny webhook endpoint: `https://sobbjbnalljbqifzcqcf.supabase.co/functions/v1/bunny-webhook`.
- **Payments & Accounting**: Razorpay INR checkout (with 2.36% gateway fee computed in `src/lib/plans.ts`), GST currently exempt/disabled under ₹20L threshold (`gstEnabled: false` in invoice config), sequential `CC/{FY}/{SEQ}` PDF invoices stored in private `invoices` bucket.
- **Transactional Email**: Resend (`notifications@notifications.crewcut.in`, `feedback@...`, `uploads@...`).
- **Bot Defense & Analytics**: Cloudflare Turnstile + honeypot on public review commenting; PostHog proxied via `/ingest`.

---

## 3. Existing NLE Hooks in `Crewcut`

The main app already includes initial NLE plugin support across:
1. [`supabase/migrations/20261104193000_api_keys_and_plugin_auth.sql`](file:///C:/Users/jigne/Projects/Crewcut/supabase/migrations/20261104193000_api_keys_and_plugin_auth.sql) — `public.api_keys` table and RLS.
2. [`supabase/migrations/20261111000000_redesigned_pricing_quotas_and_nle_gating.sql`](file:///C:/Users/jigne/Projects/Crewcut/supabase/migrations/20261111000000_redesigned_pricing_quotas_and_nle_gating.sql) — Updated plan quotas (5 / 25 / 75 / 150 GB) + Plus/Studio gating on `api_keys` INSERT.
3. [`supabase/functions/nle-plugin/index.ts`](file:///C:/Users/jigne/Projects/Crewcut/supabase/functions/nle-plugin/index.ts) — `get-context`, `get-or-create-review-link`, `get-comments` / `sync-markers`.
4. [`supabase/functions/upload-sign/index.ts`](file:///C:/Users/jigne/Projects/Crewcut/supabase/functions/upload-sign/index.ts) — Accepts `x-crewcut-api-key` / `Bearer cc_live_...`, enforces Plus/Studio gate & owner quota, creates Bunny video + `videos` row + pre-created 9-char `review_links` token.
5. [`src/lib/api/apiKeys.ts`](file:///C:/Users/jigne/Projects/Crewcut/src/lib/api/apiKeys.ts), [`src/components/account/CreateApiKeyModal.tsx`](file:///C:/Users/jigne/Projects/Crewcut/src/components/account/CreateApiKeyModal.tsx), [`src/components/account/AccountView.tsx`](file:///C:/Users/jigne/Projects/Crewcut/src/components/account/AccountView.tsx), [`src/lib/plans.ts`](file:///C:/Users/jigne/Projects/Crewcut/src/lib/plans.ts), [`src/components/pricing/PricingView.tsx`](file:///C:/Users/jigne/Projects/Crewcut/src/components/pricing/PricingView.tsx), [`src/components/billing/BillingView.tsx`](file:///C:/Users/jigne/Projects/Crewcut/src/components/billing/BillingView.tsx), [`src/components/pricing/UpgradeModal.tsx`](file:///C:/Users/jigne/Projects/Crewcut/src/components/pricing/UpgradeModal.tsx).

---

## 4. Known Cross-Repo Drift (Do Not Copy Stale Values)

1. **Storage Quotas & Pricing Copy**:
   - **Authoritative current code**: `Crewcut/supabase/migrations/20261111000000_redesigned_pricing_quotas_and_nle_gating.sql` and `Crewcut/src/lib/plans.ts` -> **Free 5 GB (10 GB delivery), Starter 25 GB (50 GB), Plus 75 GB (150 GB), Studio 150 GB (300 GB)**, with yearly plans (`₹1,999`, `₹4,999`, `₹9,999`).
   - **Stale docs** in `Crewcut/docs/PRD.md`, `Crewcut/docs/Brain.md`, `Crewcut-docs`, and `crewcut-admin/docs/PRD.md` still quote the earlier `2 / 10 / 30 / 60 GB` numbers. Always follow `plans.ts` & migration `20261111000000`.
2. **Domain Migration (`beta.crewcut.in` -> `app.crewcut.in`)**:
   - `Crewcut` Edge Functions currently default `APP_ORIGIN` to `https://beta.crewcut.in`, whereas `Crewcut-docs` already refers to `app.crewcut.in`. Keep plugin URLs configurable and honor `reviewUrl` returned from the API.
3. **Closed-Beta Copy in `crewcut-legal` vs Public App**:
   - `crewcut-legal` and `crewcut-landing` describe closed-beta waitlist/15 GB complimentary beta rules; the plugin itself should only reflect live authenticated account quota returned by `nle-plugin`.
4. **Docs Update Opportunity Later**:
   - Once the plugin ships, `Crewcut-docs` (`docs.crewcut.in`) will need a dedicated **Adobe Premiere Pro & After Effects Plugin** guide (installation, API key linking, export presets, marker sync). Not needed before plugin code exists.

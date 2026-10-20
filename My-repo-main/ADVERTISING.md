# Advertising configuration

## Initial setup

Apply [`migrations/001_advertising.sql`](./migrations/001_advertising.sql), then [`migrations/002_advertising_banner_400x60.sql`](./migrations/002_advertising_banner_400x60.sql), then [`migrations/003_advertising_schema_repair.sql`](./migrations/003_advertising_schema_repair.sql), to the Supabase project used by the deployed server. Migration 003 is a forward-only, transactional repair: it checks for a likely pre-existing ad table under another name and aborts for manual review rather than creating a duplicate; it verifies the expected columns and types; creates any missing canonical schema; inserts missing units; and updates only catalog labels/dimensions on existing units. It does not replace or clear draft/published code, enable units, or auto-publish. It also refreshes the PostgREST schema cache after the relations are in place.

The `PGRST205` response observed for `public.ad_unit_configurations` confirms that PostgREST cannot resolve that relation in its exposed schema. It does not by itself prove whether the physical table is absent, in another schema, or simply missing from a stale schema cache. The matching project's REST endpoint also returned PGRST205 for the published view; no direct SQL connection or Supabase management token is available here to inspect the physical catalog or apply a remote migration. To resolve it, open the Supabase SQL Editor for the project whose URL matches the server's Supabase URL, review and run the complete `migrations/003_advertising_schema_repair.sql` file. If the migration aborts because it finds another table, do not bypass the guard; inspect that table's schema and data before deciding on an explicit migration. The SQL includes `NOTIFY pgrst, 'reload schema'`; allow a short delay for the REST API to refresh, then retry `GET /api/admin/ads`. Do not claim the live database is repaired until this query succeeds.

The Express server must have `SUPABASE_SERVICE_ROLE_KEY` configured. This secret is used only on the server; it must never be added to frontend configuration. It is required both for admin draft/publish operations and for `GET /api/ads`: the published view applies the row-level security policy of `public.ad_unit_configurations`, and the anon role has no policy on that table, so an anon-key query returns zero rows even when published units exist. The server reads the published-only view with the service-role client (which is never sent to the browser), so drafts and admin-only columns still never leave the server. If the migration or service-role key is unavailable, admin requests fail with an explicit error and public pages continue without ads.

The application source is in the repository's `My-repo-main` subdirectory. Deploy the Express app from that directory using `npm start` (or its Dockerfile). The admin ad endpoints require the existing administrator session and service-role credentials configured only on the server.

## Placement coverage and formats

Only administrators authenticated through the existing admin session can read or change drafts. Public ads are returned from the published-only view. Keep provider credentials and private API keys out of ad snippets; published snippets are public and run with the site's trust.

`public/app-ui.js` loads `public/ad-runtime.js` on every visitor-facing page; admin screens are excluded. The runtime detects the page layout (home, tools landing, individual tools, courses, developer page) and falls back to a generic layout for auth, student, practical-class, submission, 404 and any future page. Every placement looks up its unit id in the single published response, so a shared unit is defined once in the Admin Portal and automatically appears in all of its placements.

All catalog units are supported:

- **Banners (300x250, 728x90, 320x50, 468x60, 400x60, 160x300, 160x600)** and **Native Banner** render in a separate sandboxed `iframe` at their existing dimensions, so per-unit provider globals such as `atOptions` cannot collide. The frame uses `allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox`; `allow-same-origin` is required by the provider loaders and means published creative code is trusted like the Social Bar script. The same unit can be placed multiple times without duplicating stored code.
- **Pop Under** opens the saved code in a popup window on the first eligible button click of each page. If the browser blocks the popup, the same code is shown in a closable in-page ad overlay. The trigger listener never prevents default, so forms, downloads, navigation and tool actions keep working. Navigation, theme, sidebar, tab, modal-close and menu buttons are excluded.
- **Social Bar** is injected once per page into a dedicated container.
- **Smart Link** is rendered as a labelled sponsored link. When a Smart Link URL is present and no Pop Under code is configured, the click popup uses that URL.

Draft code reaches visitors only after **Save & Publish**. Publishing also enables the unit so it appears on its configured placements; use **Enable this ad unit** to pause or resume a published unit without changing its code. Changes are visible on the next page load; `GET /api/ads` and the runtime both disable caching. Each iframe renders once, and the runtime and Social Bar are guarded against duplicate initialization.

Published code is not validated against a specific provider because none was supplied. Test each provider's approved snippet, domains, behavior, and mobile layout before enabling it for visitors.

# Important Videos

The connected Supabase project currently returns `PGRST205` for `public.important_videos`; the table is not available in the PostgREST schema cache. Apply `migrations/004_important_videos.sql` to the same project used by this app:

1. Open the Supabase Dashboard for project reference `gsgzgxigsrueejwpxtmq` (the project configured by the server probe).
2. Go to **SQL Editor → New query**.
3. Paste the complete contents of `migrations/004_important_videos.sql` and run it.
4. Confirm the query succeeds, then reload `/important-videos` and `/admin/important-videos`. The migration sends `NOTIFY pgrst, 'reload schema'`; if the API still returns `PGRST205`, wait briefly and reload the schema cache from the Supabase API settings, then retry.

This repository migration does not alter the connected database until run. It creates the feature table and indexes, enables RLS, explicitly grants `public` schema usage, allows anonymous/authenticated reads only for published records with media, restricts direct authenticated writes to profiles whose `public.users.role` is `admin`, grants the server-only service role access for the session-protected Express APIs, and inserts one idempotent, unpublished Muse AI draft. Rerunning it does not overwrite the seeded record after an administrator edits it.

The read-only PostgREST probe to project `gsgzgxigsrueejwpxtmq` returned `PGRST205` for both anon and service-role clients, including a metadata-only select. This confirms the API currently cannot resolve the table, but PostgREST alone cannot distinguish a table that was never created from one that exists but is missing from the API schema cache/exposed schema. Before or after applying the migration, this SQL Editor query checks the actual catalog and effective grants:

```sql
select
  to_regclass('public.important_videos') as table_relation,
  has_schema_privilege('anon', 'public', 'USAGE') as anon_schema_usage,
  has_schema_privilege('authenticated', 'public', 'USAGE') as authenticated_schema_usage,
  has_table_privilege('anon', 'public.important_videos', 'SELECT') as anon_select,
  has_table_privilege('authenticated', 'public.important_videos', 'SELECT') as authenticated_select,
  has_table_privilege('service_role', 'public.important_videos', 'SELECT') as service_role_select;
```

If `table_relation` is null, run the full migration above in this project. If it names `important_videos` but the REST API still responds with `PGRST205`, confirm `public` is enabled under Supabase **Project Settings → API → Exposed schemas**, then run `notify pgrst, 'reload schema';` in SQL Editor and retry. Do not create a second table or change the application to another table name.

The Express server uses the existing Supabase service-role client for database access and the existing Cloudinary configuration for media. Keep `SUPABASE_SERVICE_ROLE_KEY` and the Cloudinary credentials configured only on the server. Thumbnails accept JPEG, PNG, or WebP up to 8 MB; videos accept MP4 up to 200 MB.

Cloudinary reads `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET` from this project's `.env` file. The loader resolves that file relative to the application, so starting the server from another working directory does not change which credentials are used. The installed Cloudinary SDK reports `upload_large` results through its callback; the video upload waits for that confirmed response before storing the returned secure URL and public ID.

The configured Cloudinary credentials were verified with an authenticated ping and a temporary generated thumbnail upload; its URL returned HTTP 200 and the diagnostic asset was deleted. No representative MP4 fixture or user-selected video file was available for a live video upload test.

Administrators manage records at `/admin/important-videos`. Public visitors can browse published records at `/important-videos` and watch one at `/important-videos/:slug`. Drafts are not returned by the public API. Publishing requires a title, a stored thumbnail, and a stored video.

The public Watch Video link uses the shared ad-runtime click handler through `data-ad-popup="on"` and navigates the current tab to the selected video. Advertising remains governed by the existing published Pop Under or Smart Link settings.

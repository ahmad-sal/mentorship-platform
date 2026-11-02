# Important Updates

The Important Updates feature uses the existing `public.important_videos` Supabase table and Cloudinary account. Existing video records and their URLs remain supported.

## Database setup

Review and apply these migrations manually, in order, in the SQL editor for the Supabase project configured for this application:

1. `migrations/004_important_videos.sql` if the original Important Videos table has not been created.
2. `migrations/005_important_updates_files.sql` to add file update support.
3. `migrations/006_important_updates_storage_provider.sql` to add the file storage-provider identifier.

The additive 005 migration adds `content_type` with a `video` default, backfills old rows to `video`, adds file metadata columns, and adjusts the published-record RLS policy. The additive 006 migration adds `file_storage_provider` and changes anon/authenticated access to column-level SELECT grants so private object paths and provider metadata are not directly selectable; existing rows are not rewritten, and a null provider continues to mean a legacy Cloudinary file. Neither migration drops tables, renames existing columns, or deletes records. These migrations are not applied by the application. Apply them manually in the Supabase SQL Editor, in order, and refresh the PostgREST schema cache if the API reports missing columns.

## Routes and behavior

- Admin: `/admin/important-updates` (`/admin/important-videos` remains a compatibility alias).
- Student listing: `/important-updates` (`/important-videos` remains an alias).
- Existing video detail links: `/important-videos/:slug`.
- Published videos require a thumbnail and video. Published file updates require a file; thumbnails are optional.
- Draft updates remain private. All admin create, edit, publish, and delete operations use the existing session-protected APIs.

## Storage and validation

Video uploads and thumbnails remain on Cloudinary. Only Important Updates document/file uploads use the private Supabase Storage bucket `important-updates-files`; existing Cloudinary file updates are not moved and continue to be served through their legacy URLs. Accepted formats remain PDF, DOC/DOCX, PPT/PPTX, XLS/XLSX, ZIP, TXT, JPEG, PNG, and WebP. The server enforces the 50 MiB per-file limit and validates the filename, extension, MIME type, stored size/type, and file signature. The original document bytes are uploaded without conversion or compression. Large files use resumable TUS uploads with 6 MiB transfer chunks and visible progress.

### Supabase Storage setup

The `important-updates-files` bucket has been created for this project and verified as private, with a 52,428,800-byte per-object limit and the allowed MIME types listed below. To reproduce or repair this setup manually, open **Storage → New bucket** in the Supabase Dashboard, set the name to `important-updates-files`, leave **Public bucket** disabled, set the maximum file size to **50 MiB** (52,428,800 bytes), and set allowed MIME types to: `application/pdf`, `application/msword`, `application/vnd.ms-word`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`, `application/vnd.ms-powerpoint`, `application/mspowerpoint`, `application/vnd.openxmlformats-officedocument.presentationml.presentation`, `application/vnd.ms-excel`, `application/msexcel`, `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`, `application/zip`, `application/x-zip-compressed`, `text/plain`, `image/jpeg`, `image/png`, and `image/webp`.

In **Project Settings → Storage**, set the project-wide file-size maximum to at least **50 MiB**. The project cap was reported as 50 MiB. Check **Organization → Usage → Storage Size** and the project's plan quota before uploading. The usage page supplied for this project reports **0 GB in use**; it does not show the total quota, so confirm the plan has at least 64 MiB of remaining capacity for the four requested PDFs.

Apply migrations 004, 005, and 006 manually as described above. Deploy/restart the application only after completing the migration setup.

The server creates a short-lived, object-specific signed upload token only after the existing admin session and same-origin checks pass. The browser uses that token for TUS and never receives the service-role key. After upload, the server checks the private object's stored size, MIME type, and signature before saving the database row. Open and Download requests are served by authenticated server-side access to a short-lived signed URL; only published records are available to students. Supabase object paths are not returned in student or admin listing responses. Replaced/deleted objects are removed only after the corresponding database update/delete succeeds and a reference check confirms the object is no longer used.

Only Open File and Download opt into the existing centralized popup-ad click behavior. Video watch actions do not.

The Storage usage value is usage, not the plan's total quota. A zero usage report does not verify the plan's maximum capacity. Four temporary, structurally valid PDFs of 10, 11, 13, and 30 MiB have been uploaded through the signed TUS flow; each stored size, `application/pdf` type, PDF signature, and signed ranged read was verified, and all test objects were removed. This validates Storage transfer and quota for those individual sizes, not record creation or publication. After manually applying the migrations, verify the admin save/list, student published list, Open File, Download, and unpublished/unauthorized behavior with the actual admin account.

Keep Supabase service-role and Cloudinary credentials in server-side environment configuration only. No migration is applied automatically by the application.

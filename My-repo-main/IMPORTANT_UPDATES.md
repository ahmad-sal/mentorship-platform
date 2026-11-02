# Important Updates

The Important Updates feature uses the existing `public.important_videos` Supabase table and Cloudinary account. Existing video records and their URLs remain supported.

## Database setup

Review and apply these migrations manually, in order, in the SQL editor for the Supabase project configured for this application:

1. `migrations/004_important_videos.sql` if the original Important Videos table has not been created.
2. `migrations/005_important_updates_files.sql` to add file update support.

The additive 005 migration adds `content_type` with a `video` default, backfills old rows to `video`, adds file metadata columns, and adjusts the published-record RLS policy. It does not drop tables, rename existing columns, or delete existing data. The migration requests a PostgREST schema reload; if the API reports a missing-column/table error afterwards, refresh the Supabase schema cache. Do not retry file management until the migration is applied.

## Routes and behavior

- Admin: `/admin/important-updates` (`/admin/important-videos` remains a compatibility alias).
- Student listing: `/important-updates` (`/important-videos` remains an alias).
- Existing video detail links: `/important-videos/:slug`.
- Published videos require a thumbnail and video. Published file updates require a file; thumbnails are optional.
- Draft updates remain private. All admin create, edit, publish, and delete operations use the existing session-protected APIs.

## Storage and validation

Videos continue to use Cloudinary's video resource. Thumbnails continue to use Cloudinary image storage. File updates use Cloudinary raw storage and are limited to 50 MB. Accepted formats are PDF, DOC/DOCX, PPT/PPTX, XLS/XLSX, ZIP, TXT, JPEG, PNG, and WebP. The server validates both MIME type and extension, checks file signatures (and decodes image uploads), sanitizes the retained original filename, and gives each stored asset a unique ID.

The download endpoint streams the published file from the configured Cloudinary raw URL and sends a safe `Content-Disposition` filename without buffering the full file in the application. Open File links retain the Cloudinary file URL. Only Open File and Download opt into the existing centralized popup-ad click behavior; video watch actions do not.

Keep Supabase service-role and Cloudinary credentials in server-side environment configuration only. No migration is applied automatically by the application.

begin;

alter table public.important_videos
  add column if not exists file_storage_provider text;

revoke select on public.important_videos from anon, authenticated;
grant select (
  id,
  title,
  slug,
  description,
  details,
  category,
  thumbnail_url,
  thumbnail_public_id,
  video_url,
  video_public_id,
  status,
  display_order,
  created_by,
  updated_by,
  created_at,
  updated_at,
  published_at,
  content_type,
  file_url,
  original_filename,
  file_mime_type,
  file_size,
  file_uploaded_at
) on public.important_videos to anon, authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'important_videos_file_storage_provider_check'
      and conrelid = 'public.important_videos'::regclass
  ) then
    alter table public.important_videos
      add constraint important_videos_file_storage_provider_check
      check (
        file_storage_provider is null
        or file_storage_provider in ('cloudinary', 'supabase')
      );
  end if;
end
$$;

notify pgrst, 'reload schema';

commit;

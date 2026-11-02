begin;

alter table public.important_videos
  add column if not exists content_type text default 'video',
  add column if not exists file_url text,
  add column if not exists file_public_id text,
  add column if not exists original_filename text,
  add column if not exists file_mime_type text,
  add column if not exists file_size bigint,
  add column if not exists file_uploaded_at timestamptz;

update public.important_videos
set content_type = 'video'
where content_type is null;

alter table public.important_videos
  alter column content_type set default 'video',
  alter column content_type set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'important_videos_content_type_check'
      and conrelid = 'public.important_videos'::regclass
  ) then
    alter table public.important_videos
      add constraint important_videos_content_type_check
      check (content_type in ('video', 'file'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'important_videos_file_pair_check'
      and conrelid = 'public.important_videos'::regclass
  ) then
    alter table public.important_videos
      add constraint important_videos_file_pair_check
      check (
        (file_url is null and file_public_id is null)
        or (file_url is not null and file_public_id is not null)
      );
  end if;
end
$$;

create index if not exists important_videos_type_order_idx
  on public.important_videos (content_type, status, display_order, published_at desc);

drop policy if exists important_videos_public_read on public.important_videos;
create policy important_videos_public_read
  on public.important_videos
  for select
  to anon, authenticated
  using (
    status = 'published'
    and (
      (
        content_type = 'video'
        and thumbnail_url is not null
        and video_url is not null
      )
      or (
        content_type = 'file'
        and file_url is not null
        and original_filename is not null
      )
    )
  );

notify pgrst, 'reload schema';

commit;

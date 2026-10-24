begin;

create table if not exists public.important_videos (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text not null unique,
  description text not null default '',
  details text not null default '',
  category text,
  thumbnail_url text,
  thumbnail_public_id text,
  video_url text,
  video_public_id text,
  status text not null default 'draft' check (status in ('draft', 'published')),
  display_order integer not null default 0 check (display_order >= 0),
  created_by text,
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  constraint important_videos_thumbnail_pair check (
    (thumbnail_url is null and thumbnail_public_id is null)
    or (thumbnail_url is not null and thumbnail_public_id is not null)
  ),
  constraint important_videos_video_pair check (
    (video_url is null and video_public_id is null)
    or (video_url is not null and video_public_id is not null)
  )
);

create index if not exists important_videos_public_order_idx
  on public.important_videos (status, display_order, published_at desc);

alter table public.important_videos enable row level security;
grant usage on schema public to anon, authenticated, service_role;
revoke all on public.important_videos from public, anon, authenticated;
grant select on public.important_videos to anon, authenticated;
grant insert, update, delete on public.important_videos to authenticated;
grant all on public.important_videos to service_role;

create or replace function public.is_important_video_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.users as user_profile
    where user_profile.id = (select auth.uid())
      and user_profile.role = 'admin'
  );
$$;

revoke all on function public.is_important_video_admin() from public, anon;
grant execute on function public.is_important_video_admin() to authenticated;

drop policy if exists important_videos_public_read on public.important_videos;
create policy important_videos_public_read
  on public.important_videos
  for select
  to anon, authenticated
  using (
    status = 'published'
    and thumbnail_url is not null
    and video_url is not null
  );

drop policy if exists important_videos_admin_manage on public.important_videos;
create policy important_videos_admin_manage
  on public.important_videos
  for all
  to authenticated
  using (public.is_important_video_admin())
  with check (public.is_important_video_admin());

insert into public.important_videos (
  id,
  title,
  slug,
  description,
  details,
  status,
  display_order
)
values (
  '00000000-0000-4000-8000-000000000001',
  'Muse AI — Complete Setup Guide and One-Million-Token Context Window',
  'muse-ai-complete-setup-guide',
  '',
  '',
  'draft',
  0
)
on conflict (id) do nothing;

notify pgrst, 'reload schema';

commit;

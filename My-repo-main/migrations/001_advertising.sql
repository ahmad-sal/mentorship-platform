create table if not exists public.ad_unit_configurations (
  unit_id text primary key,
  display_name text not null,
  dimensions text not null,
  enabled boolean not null default false,
  draft_code text,
  published_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  updated_by text
);

insert into public.ad_unit_configurations (unit_id, display_name, dimensions)
values
  ('pop-under', 'Pop Under', 'Site-wide'),
  ('smart-link', 'Smart Link', 'Provider-defined'),
  ('social-bar', 'Social Bar', 'Provider-defined'),
  ('native-banner', 'Native Banner', 'Provider-defined'),
  ('banner-300x250', 'Banner 300 × 250', '300 × 250'),
  ('banner-728x90', 'Banner 728 × 90', '728 × 90'),
  ('banner-320x50', 'Banner 320 × 50', '320 × 50'),
  ('banner-468x60', 'Banner 468 × 60', '468 × 60'),
  ('banner-400x60', 'Banner 400 × 60', '400 × 60'),
  ('banner-160x300', 'Banner 160 × 300', '160 × 300'),
  ('banner-160x600', 'Banner 160 × 600', '160 × 600')
on conflict (unit_id) do nothing;

alter table public.ad_unit_configurations enable row level security;
revoke all on public.ad_unit_configurations from anon, authenticated;
grant all on public.ad_unit_configurations to service_role;

create or replace view public.published_ad_units as
select unit_id, display_name, dimensions, published_code, published_at
from public.ad_unit_configurations
where enabled = true and published_code is not null and length(published_code) > 0;

revoke all on public.published_ad_units from public;
grant select on public.published_ad_units to anon, authenticated;

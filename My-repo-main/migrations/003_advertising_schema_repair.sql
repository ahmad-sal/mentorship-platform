-- Repair/complete the central ad table without deleting or replacing saved code.
-- Apply after 001_advertising.sql and 002_advertising_banner_400x60.sql.

begin;

do $$
declare
  alternate_relation text;
begin
  select format('%I.%I', table_schema, table_name)
    into alternate_relation
    from information_schema.columns
   where table_schema not in ('pg_catalog', 'information_schema')
   group by table_schema, table_name
  having bool_or(column_name = 'unit_id')
     and bool_or(column_name = 'draft_code')
     and bool_or(column_name = 'published_code')
     and not (table_schema = 'public' and table_name = 'ad_unit_configurations')
   limit 1;

  if found then
    raise exception
      'Advertising-shaped relation % already exists. Inspect and migrate it explicitly; this repair will not create a duplicate.',
      alternate_relation;
  end if;

  if to_regclass('public.ad_unit_configurations') is not null
     and (select relkind from pg_class where oid = to_regclass('public.ad_unit_configurations')) not in ('r', 'p') then
    raise exception
      'public.ad_unit_configurations exists but is not a table. Inspect it before applying the advertising schema repair.';
  end if;
end
$$;

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

do $$
begin
  if not exists (
    select 1
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'ad_unit_configurations'
       and column_name = 'unit_id'
  ) then
    raise exception
      'public.ad_unit_configurations exists without unit_id. No columns or data were changed; inspect and migrate the existing table explicitly.';
  end if;
end
$$;

alter table public.ad_unit_configurations
  add column if not exists display_name text,
  add column if not exists dimensions text,
  add column if not exists enabled boolean not null default false,
  add column if not exists draft_code text,
  add column if not exists published_code text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists published_at timestamptz,
  add column if not exists updated_by text;

do $$
declare
  has_unit_id_unique_constraint boolean;
  column_check record;
  actual_type text;
begin
  for column_check in
    select * from (values
      ('unit_id', 'text'),
      ('display_name', 'text'),
      ('dimensions', 'text'),
      ('enabled', 'boolean'),
      ('draft_code', 'text'),
      ('published_code', 'text'),
      ('created_at', 'timestamp with time zone'),
      ('updated_at', 'timestamp with time zone'),
      ('published_at', 'timestamp with time zone'),
      ('updated_by', 'text')
    ) as expected(column_name, data_type)
  loop
    select data_type
      into actual_type
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'ad_unit_configurations'
       and column_name = column_check.column_name;

    if actual_type is distinct from column_check.data_type then
      raise exception
        'public.ad_unit_configurations.% has incompatible type %. Expected %. No type conversion was attempted.',
        column_check.column_name,
        coalesce(actual_type, 'missing'),
        column_check.data_type;
    end if;
  end loop;

  if exists (select 1 from public.ad_unit_configurations where unit_id is null) then
    raise exception
      'public.ad_unit_configurations contains rows without unit_id. Existing data was preserved; resolve those rows before applying this migration.';
  end if;

  update public.ad_unit_configurations
     set display_name = coalesce(display_name, unit_id),
         dimensions = coalesce(dimensions, 'Provider-defined'),
         enabled = coalesce(enabled, false),
         created_at = coalesce(created_at, now()),
         updated_at = coalesce(updated_at, now());

  alter table public.ad_unit_configurations
    alter column display_name set not null,
    alter column dimensions set not null,
    alter column enabled set default false,
    alter column enabled set not null,
    alter column created_at set default now(),
    alter column created_at set not null,
    alter column updated_at set default now(),
    alter column updated_at set not null;

  select exists (
    select 1
      from pg_constraint constraint_row
      join pg_attribute attribute_row
        on attribute_row.attrelid = constraint_row.conrelid
       and attribute_row.attnum = constraint_row.conkey[1]
     where constraint_row.conrelid = 'public.ad_unit_configurations'::regclass
       and constraint_row.contype in ('p', 'u')
       and cardinality(constraint_row.conkey) = 1
       and attribute_row.attname = 'unit_id'
  ) into has_unit_id_unique_constraint;

  if not has_unit_id_unique_constraint then
    alter table public.ad_unit_configurations
      add constraint ad_unit_configurations_unit_id_key unique (unit_id);
  end if;

  alter table public.ad_unit_configurations alter column unit_id set not null;
end
$$;

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
on conflict (unit_id) do update
set display_name = excluded.display_name,
    dimensions = excluded.dimensions;

alter table public.ad_unit_configurations enable row level security;
revoke all on public.ad_unit_configurations from public, anon, authenticated;
grant all on public.ad_unit_configurations to service_role;

create or replace view public.published_ad_units as
select unit_id, display_name, dimensions, published_code, published_at
from public.ad_unit_configurations
where enabled = true and published_code is not null and length(published_code) > 0;

revoke all on public.published_ad_units from public;
grant select on public.published_ad_units to anon, authenticated;

notify pgrst, 'reload schema';

commit;

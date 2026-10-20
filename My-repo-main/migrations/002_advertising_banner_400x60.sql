insert into public.ad_unit_configurations (unit_id, display_name, dimensions)
values ('banner-400x60', 'Banner 400 × 60', '400 × 60')
on conflict (unit_id) do update
set display_name = excluded.display_name,
    dimensions = excluded.dimensions;

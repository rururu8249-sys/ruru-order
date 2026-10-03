-- The repick trigger can only see edits made after it was installed.
-- Reopen rows that were already picked and then physically changed beforehand.
with physical_edits as (
  select
    o.id,
    h.entry,
    case
      when h.entry->>'changed_at' ~ '^\d{4}-\d{2}-\d{2}T' then (h.entry->>'changed_at')::timestamptz
      else null
    end as changed_at
  from public.orders o
  cross join lateral jsonb_array_elements(coalesce(o.item_change_history, '[]'::jsonb)) as h(entry)
  where o.picked_at is not null
    and o.repick_required_at is null
    and coalesce((h.entry->>'product_changed')::boolean, false)
),
first_missed_edit as (
  select distinct on (e.id)
    e.id,
    e.entry,
    e.changed_at
  from physical_edits e
  join public.orders o on o.id = e.id
  where e.changed_at is not null
    and e.changed_at > o.picked_at
  order by e.id, e.changed_at asc
)
update public.orders o
set
  repick_required_at = e.changed_at,
  repick_before = e.entry->'before',
  repick_resolved_at = null,
  picked_at = null
from first_missed_edit e
where o.id = e.id;

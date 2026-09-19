-- Retire the viewer role. Postgres can't remove a value from an enum, so
-- 'viewer' stays in the type but nothing grants it access and the app never
-- assigns it. Anyone who had it becomes an editor with their own binder.

update public.profiles set role = 'editor' where role = 'viewer';

create or replace function public.can_view() returns boolean
language sql stable as $$
  select public.my_role() in ('editor', 'admin')
$$;

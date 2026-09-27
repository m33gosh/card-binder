-- A second kind of collection: squishes (Squishmallows, NeeDoh, any brand). Each person's
-- profile says which collection their home screen opens on. Squishes use the
-- same private-per-owner rules and the same photo bucket as cards.

alter table public.profiles
  add column if not exists collection text not null default 'cards';  -- cards | squishes

create table if not exists public.squishes (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null references public.profiles (id) on delete cascade,
  name           text not null,           -- "Cam"
  brand          text,                    -- "Squishmallows", "NeeDoh", …
  character      text,                    -- "cat"
  squad          text,                    -- "Fantasy Squad"
  size_inches    numeric(5, 1),
  color          text,
  acquired_from  text,                    -- store or person
  acquired_on    date,
  price_paid     numeric(10, 2),
  value          numeric(10, 2),          -- "worth about", entered by hand
  condition      text not null default 'like_new',
  favorite       boolean not null default false,
  wishlist       boolean not null default false,
  notes          text,
  image_path     text,                    -- own photo in the card-images bucket
  image_url      text,                    -- picture from the wiki or a store page
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists squishes_owner_idx on public.squishes (owner_id);

create trigger squishes_touch before update on public.squishes
  for each row execute procedure public.touch_updated_at();

alter table public.squishes enable row level security;

create policy "squishes: own read" on public.squishes
  for select to authenticated
  using (public.can_view() and owner_id = auth.uid());

create policy "squishes: own insert" on public.squishes
  for insert to authenticated
  with check (public.can_edit() and owner_id = auth.uid());

create policy "squishes: own update" on public.squishes
  for update to authenticated
  using (public.can_edit() and owner_id = auth.uid())
  with check (public.can_edit() and owner_id = auth.uid());

create policy "squishes: own delete" on public.squishes
  for delete to authenticated
  using (public.can_edit() and owner_id = auth.uid());

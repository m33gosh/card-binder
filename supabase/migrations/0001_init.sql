-- Card Binder schema. Run this in the Supabase SQL editor (or `supabase db push`).
--
-- Roles (RBAC):
--   pending  new Google sign-ins land here and can see nothing until approved
--   viewer   can browse the collection
--   editor   can add, edit and delete the cards they added
--   admin    everything, plus managing who has which role
-- The first account to sign in becomes admin automatically.

create type public.app_role as enum ('pending', 'viewer', 'editor', 'admin');

create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  email        text,
  display_name text,
  avatar_url   text,
  role         public.app_role not null default 'pending',
  created_at   timestamptz not null default now()
);

create table public.cards (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid not null references public.profiles (id) on delete cascade,
  name             text not null,
  set_name         text,
  set_id           text,
  card_number      text,
  rarity           text,
  api_card_id      text,           -- pokemontcg.io id, e.g. "sv3pt5-199"
  api_image_url    text,           -- official artwork, used when we have a match
  image_path       text,           -- our photo in the card-images bucket
  variant          text not null default 'normal',   -- normal | holofoil | reverseHolofoil | ...
  condition        text not null default 'near_mint',
  quantity         integer not null default 1 check (quantity > 0),
  market_price     numeric(10, 2),
  price_currency   text default 'USD',
  price_source     text,
  price_updated_at timestamptz,
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index cards_owner_idx on public.cards (owner_id);
create index cards_api_card_idx on public.cards (api_card_id);

create table public.price_history (
  id          bigint generated always as identity primary key,
  card_id     uuid not null references public.cards (id) on delete cascade,
  price       numeric(10, 2) not null,
  currency    text not null default 'USD',
  source      text not null,
  recorded_at timestamptz not null default now()
);
create index price_history_card_idx on public.price_history (card_id, recorded_at desc);

-- keep updated_at fresh
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;
create trigger cards_touch before update on public.cards
  for each row execute procedure public.touch_updated_at();

-- create a profile for every new auth user; first one in is admin
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, display_name, avatar_url, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data ->> 'avatar_url',
    case when exists (select 1 from public.profiles) then 'pending'::public.app_role else 'admin'::public.app_role end
  );
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- role of the calling user; security definer so it can read profiles without
-- tripping the profiles RLS policy recursively
create or replace function public.my_role() returns public.app_role
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.can_edit() returns boolean
language sql stable as $$
  select public.my_role() in ('editor', 'admin')
$$;

create or replace function public.can_view() returns boolean
language sql stable as $$
  select public.my_role() in ('viewer', 'editor', 'admin')
$$;

-- ---------------------------------------------------------------- RLS
alter table public.profiles      enable row level security;
alter table public.cards         enable row level security;
alter table public.price_history enable row level security;

-- profiles: everyone can read their own row (to learn they're pending);
-- approved members can see the family list; only admins change roles.
create policy "profiles: read own or approved" on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.can_view());

create policy "profiles: admin updates" on public.profiles
  for update to authenticated
  using (public.my_role() = 'admin')
  with check (public.my_role() = 'admin');

-- cards
create policy "cards: approved members read" on public.cards
  for select to authenticated
  using (public.can_view());

create policy "cards: editors insert own" on public.cards
  for insert to authenticated
  with check (public.can_edit() and owner_id = auth.uid());

create policy "cards: owner or admin update" on public.cards
  for update to authenticated
  using (public.my_role() = 'admin' or (public.can_edit() and owner_id = auth.uid()))
  with check (public.my_role() = 'admin' or (public.can_edit() and owner_id = auth.uid()));

create policy "cards: owner or admin delete" on public.cards
  for delete to authenticated
  using (public.my_role() = 'admin' or (public.can_edit() and owner_id = auth.uid()));

-- price history follows the card
create policy "price_history: approved members read" on public.price_history
  for select to authenticated
  using (public.can_view());

create policy "price_history: editors insert" on public.price_history
  for insert to authenticated
  with check (
    exists (
      select 1 from public.cards c
      where c.id = card_id
        and (public.my_role() = 'admin' or (public.can_edit() and c.owner_id = auth.uid()))
    )
  );

-- ---------------------------------------------------------------- storage
-- Private bucket; the app reads photos through short-lived signed URLs.
-- Files live at <owner uuid>/<card uuid>.jpg
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('card-images', 'card-images', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "card-images: approved members read" on storage.objects
  for select to authenticated
  using (bucket_id = 'card-images' and public.can_view());

create policy "card-images: editors upload to own folder" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'card-images'
    and public.can_edit()
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "card-images: owner or admin update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'card-images'
    and (public.my_role() = 'admin' or (public.can_edit() and (storage.foldername(name))[1] = auth.uid()::text))
  );

create policy "card-images: owner or admin delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'card-images'
    and (public.my_role() = 'admin' or (public.can_edit() and (storage.foldername(name))[1] = auth.uid()::text))
  );

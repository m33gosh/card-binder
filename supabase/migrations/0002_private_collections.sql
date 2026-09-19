-- Each person has their own binder. Nobody sees, edits or deletes anyone
-- else's cards or photos, admins included. Admins still manage who has
-- which role. Run this in the SQL editor (or `supabase db push`).

-- cards --------------------------------------------------------------
drop policy if exists "cards: approved members read" on public.cards;
drop policy if exists "cards: editors insert own" on public.cards;
drop policy if exists "cards: owner or admin update" on public.cards;
drop policy if exists "cards: owner or admin delete" on public.cards;

create policy "cards: own read" on public.cards
  for select to authenticated
  using (public.can_view() and owner_id = auth.uid());

create policy "cards: own insert" on public.cards
  for insert to authenticated
  with check (public.can_edit() and owner_id = auth.uid());

create policy "cards: own update" on public.cards
  for update to authenticated
  using (public.can_edit() and owner_id = auth.uid())
  with check (public.can_edit() and owner_id = auth.uid());

create policy "cards: own delete" on public.cards
  for delete to authenticated
  using (public.can_edit() and owner_id = auth.uid());

-- price history follows the card --------------------------------------
drop policy if exists "price_history: approved members read" on public.price_history;
drop policy if exists "price_history: editors insert" on public.price_history;

create policy "price_history: own read" on public.price_history
  for select to authenticated
  using (exists (select 1 from public.cards c where c.id = card_id and c.owner_id = auth.uid()));

create policy "price_history: own insert" on public.price_history
  for insert to authenticated
  with check (public.can_edit() and exists (select 1 from public.cards c where c.id = card_id and c.owner_id = auth.uid()));

-- photos: each person's folder is theirs alone ---------------------------
drop policy if exists "card-images: approved members read" on storage.objects;
drop policy if exists "card-images: editors upload to own folder" on storage.objects;
drop policy if exists "card-images: owner or admin update" on storage.objects;
drop policy if exists "card-images: owner or admin delete" on storage.objects;

create policy "card-images: own read" on storage.objects
  for select to authenticated
  using (bucket_id = 'card-images' and public.can_view() and (storage.foldername(name))[1] = auth.uid()::text);

create policy "card-images: own insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'card-images' and public.can_edit() and (storage.foldername(name))[1] = auth.uid()::text);

create policy "card-images: own update" on storage.objects
  for update to authenticated
  using (bucket_id = 'card-images' and public.can_edit() and (storage.foldername(name))[1] = auth.uid()::text);

create policy "card-images: own delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'card-images' and public.can_edit() and (storage.foldername(name))[1] = auth.uid()::text);

-- Only admins can see the list of people (names and emails). Everyone else
-- can read just their own profile, which the app needs to know their role.

drop policy if exists "profiles: read own or approved" on public.profiles;

create policy "profiles: own or admin read" on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.my_role() = 'admin');

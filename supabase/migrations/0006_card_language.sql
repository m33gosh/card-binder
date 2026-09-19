-- Which language a card is printed in. Japanese cards live in a separate
-- catalog with their own sets and numbering, so the app needs to know.
alter table public.cards
  add column if not exists language text not null default 'en';

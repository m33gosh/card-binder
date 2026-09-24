-- A second name for a card: the English name of a Japanese card, so it can be
-- found by typing either. Empty for English cards.
alter table public.cards
  add column if not exists name_alt text;

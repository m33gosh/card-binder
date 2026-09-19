-- Card stats from the catalog, for sorting: Pokémon type(s), HP, and the
-- combined damage of its attacks. Filled in when a card is matched and
-- refreshed with prices. Trainers and energies leave them empty.

alter table public.cards
  add column if not exists supertype    text,      -- Pokémon | Trainer | Energy
  add column if not exists types        text[],    -- e.g. {Fire} or {Grass,Psychic}
  add column if not exists hp           integer,
  add column if not exists attack_power integer;   -- sum of the printed attack damage

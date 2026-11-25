alter table public.pairing_watches add column if not exists player_ids text[], add column if not exists multi_state jsonb not null default '{}'::jsonb;

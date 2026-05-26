-- Suparkompisen — Supabase schema.
-- Paste into Supabase SQL editor and run. Safe to re-run.
--
-- Identity model: a single global WSK group, no auth. Each device
-- gets a UUID stored locally (device_id). The participants.name is
-- the public PK; duplicate names are rejected by the unique
-- constraint and surfaced in the claim modal.

create extension if not exists "pgcrypto";

-- ── Participants ────────────────────────────────────────────────
create table if not exists public.participants (
  name           text primary key,
  device_id      text not null,
  avatar_url     text,
  joined_at      timestamptz default now(),
  last_seen_at   timestamptz default now()
);

-- ── BAC curves (one row per participant, updated as they drink) ──
create table if not exists public.bac_curves (
  participant_name        text primary key
                          references public.participants(name)
                          on delete cascade,
  curve                   jsonb not null,           -- [{t: ms, bac: %}, …]
  current_bac             numeric not null,         -- % units
  first_sober_drink_at    timestamptz,
  sharing_on              boolean not null default true,
  updated_at              timestamptz default now()
);
create index if not exists bac_curves_updated_at_idx
  on public.bac_curves (updated_at desc);

-- ── Drinks (feed events) ────────────────────────────────────────
create table if not exists public.drinks (
  id               uuid primary key default gen_random_uuid(),
  participant_name text not null
                   references public.participants(name)
                   on delete cascade,
  occurred_at      timestamptz not null,
  label            text,
  photo_url        text,
  volume_ml        numeric,
  abv              numeric,
  created_at       timestamptz default now()
);
-- Idempotent column adds for tables that pre-existed this revision.
alter table public.drinks add column if not exists volume_ml numeric;
alter table public.drinks add column if not exists abv       numeric;
create index if not exists drinks_participant_idx
  on public.drinks (participant_name, occurred_at desc);

-- ── Reactions on drinks (emoji + text) ─────────────────────────
create table if not exists public.reactions (
  id          uuid primary key default gen_random_uuid(),
  drink_id    uuid not null references public.drinks(id) on delete cascade,
  author_name text not null references public.participants(name) on delete cascade,
  kind        text not null check (kind in ('emoji', 'text')),
  content     text not null,
  created_at  timestamptz default now()
);
create index if not exists reactions_drink_idx
  on public.reactions (drink_id, created_at);

-- ── Row-level security: open access (no auth, single global group) ──
alter table public.participants enable row level security;
alter table public.bac_curves   enable row level security;
alter table public.drinks       enable row level security;
alter table public.reactions    enable row level security;

drop policy if exists "anon all" on public.participants;
create policy "anon all" on public.participants for all using (true) with check (true);

drop policy if exists "anon all" on public.bac_curves;
create policy "anon all" on public.bac_curves for all using (true) with check (true);

drop policy if exists "anon all" on public.drinks;
create policy "anon all" on public.drinks for all using (true) with check (true);

drop policy if exists "anon all" on public.reactions;
create policy "anon all" on public.reactions for all using (true) with check (true);

-- ── Realtime: enable change feed on relevant tables ─────────────
-- In the Supabase dashboard: Database → Replication → enable for
-- participants, bac_curves, drinks, reactions.

-- ── Storage: create a public bucket for drink photos ────────────
-- In the Supabase dashboard: Storage → New bucket → name "photos",
-- public read enabled.

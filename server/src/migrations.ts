// Postgres schema (Neon/Supabase free tier OK, or Render Postgres).
// Applied in order by db.migrate(); records in schema_migrations.
export const MIGRATION_001 = `
create table if not exists schema_migrations (
  version text primary key,
  applied_at timestamptz not null default now()
);

create table if not exists players (
  id uuid primary key,
  name text not null,
  tag text not null default '',
  token_version int not null default 0,
  recovery_hash text,
  rating int not null default 1000,
  games int not null default 0,
  wins int not null default 0,
  losses int not null default 0,
  last_rename timestamptz,
  flags int not null default 0,
  created_at timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  unique (name, tag)
);
create index if not exists players_rating_idx on players (rating desc);
create index if not exists players_name_idx on players (name);

create table if not exists matches (
  id uuid primary key,
  p1 uuid not null references players (id),
  p2 uuid not null references players (id),
  winner uuid null references players (id),
  p1_rating_before int not null,
  p2_rating_before int not null,
  p1_delta int not null,
  p2_delta int not null,
  towers_p1 int not null default 0,
  towers_p2 int not null default 0,
  duration_s int not null default 0,
  ended_reason text not null default 'chief',
  created_at timestamptz not null default now()
);
create index if not exists matches_p1_idx on matches (p1);
create index if not exists matches_p2_idx on matches (p2);

create table if not exists rating_history (
  player_id uuid not null references players (id),
  match_id uuid not null references matches (id),
  rating_after int not null,
  created_at timestamptz not null default now(),
  primary key (player_id, match_id)
);
create index if not exists rating_history_player_idx on rating_history (player_id);
`;

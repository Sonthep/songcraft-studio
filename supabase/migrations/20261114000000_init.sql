-- SongCraft Studio — initial schema for optional cloud sync (Supabase / PostgreSQL).
--
-- The app currently runs local-first (IndexedDB). This schema mirrors the
-- client data model (src/lib/project/schema.ts) so a Supabase-backed
-- ProjectRepository can be added without changing the UI. Every table is
-- protected by Row Level Security: users can only reach rows of projects they own.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------- profiles
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) <= 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- projects
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  client_id text,                                   -- id used by the local app (prj_…)
  title text not null check (char_length(title) between 1 and 160),
  genre text not null default '' check (char_length(genre) <= 80),
  mood text not null default '' check (char_length(mood) <= 120),
  language text not null default 'th' check (language in ('th', 'isan', 'en', 'mixed')),
  bpm numeric(6, 2) not null default 80 check (bpm between 30 and 300),
  key_pc smallint not null default 9 check (key_pc between 0 and 11),
  scale text not null default 'minor'
    check (scale in ('major', 'minor', 'harmonicMinor', 'dorian', 'mixolydian', 'pentatonicMajor', 'pentatonicMinor')),
  ts_numerator smallint not null default 4 check (ts_numerator between 1 and 16),
  ts_denominator smallint not null default 4 check (ts_denominator in (2, 4, 8, 16)),
  vocal_low smallint not null default 55 check (vocal_low between 0 and 127),
  vocal_high smallint not null default 74 check (vocal_high between 0 and 127),
  flow jsonb not null default '[]'::jsonb,          -- rap flow placements per section
  suno jsonb,                                       -- Suno prompt draft
  notes_text text not null default '' check (char_length(notes_text) <= 20000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, client_id)
);
create index projects_owner_updated_idx on public.projects (owner_id, updated_at desc);
create index projects_owner_genre_idx on public.projects (owner_id, genre);

-- ----------------------------------------------------------- song_sections
create table public.song_sections (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  position integer not null,
  section_type text not null
    check (section_type in ('intro', 'verse', 'preChorus', 'chorus', 'hook', 'bridge', 'rapVerse', 'outro')),
  label text not null default '' check (char_length(label) <= 80),
  -- [{ id, text, syllableOverride }] — lines are edited together with their section.
  lines jsonb not null default '[]'::jsonb,
  unique (project_id, position) deferrable initially deferred
);
create index song_sections_project_idx on public.song_sections (project_id, position);

-- --------------------------------------------------------- lyrics_versions
create table public.lyrics_versions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  name text not null check (char_length(name) <= 120),
  sections jsonb not null,
  created_at timestamptz not null default now()
);
create index lyrics_versions_project_idx on public.lyrics_versions (project_id, created_at desc);

-- --------------------------------------------------------- melody_versions
create table public.melody_versions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  name text not null check (char_length(name) <= 120),
  source text not null check (source in ('manual', 'rule-based', 'ai-guided', 'hum', 'import', 'flow')),
  is_current boolean not null default false,        -- the working melody shown in the Piano Roll
  created_at timestamptz not null default now()
);
create index melody_versions_project_idx on public.melody_versions (project_id, created_at desc);
create unique index melody_versions_one_current_idx on public.melody_versions (project_id) where is_current;

-- --------------------------------------------------------------- midi_notes
create table public.midi_notes (
  id uuid primary key default gen_random_uuid(),
  melody_version_id uuid not null references public.melody_versions (id) on delete cascade,
  pitch smallint not null check (pitch between 0 and 127),
  start_tick integer not null check (start_tick >= 0),          -- PPQ = 480
  duration_ticks integer not null check (duration_ticks >= 1),
  velocity smallint not null check (velocity between 1 and 127),
  syllable_id text check (char_length(syllable_id) <= 140)      -- `${lineId}#${index}`
);
create index midi_notes_version_start_idx on public.midi_notes (melody_version_id, start_tick);

-- ------------------------------------------------------ chord_progressions
create table public.chord_progressions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  root_pc smallint not null check (root_pc between 0 and 11),
  quality text not null check (char_length(quality) <= 12),
  bass_pc smallint check (bass_pc between 0 and 11),
  start_tick integer not null check (start_tick >= 0),
  duration_ticks integer not null check (duration_ticks >= 1),
  inversion smallint not null default 0 check (inversion between 0 and 4),
  octave smallint not null default 3 check (octave between 1 and 7),
  spread boolean not null default false
);
create index chord_progressions_project_idx on public.chord_progressions (project_id, start_tick);

-- ------------------------------------------------------------ audio_assets
create table public.audio_assets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  kind text not null check (kind in ('take', 'reference', 'hum', 'render')),
  name text not null check (char_length(name) <= 200),
  mime_type text not null check (char_length(mime_type) <= 100),
  duration_sec real not null default 0 check (duration_sec >= 0),
  size_bytes bigint not null check (size_bytes between 0 and 52428800),  -- 50 MB limit
  storage_path text not null,                       -- '<owner_id>/<project_id>/<asset_id>'
  offset_sec real not null default 0,
  notes text not null default '' check (char_length(notes) <= 1000),
  created_at timestamptz not null default now()
);
create index audio_assets_project_idx on public.audio_assets (project_id, created_at desc);

-- --------------------------------------------------------- recording_takes
create table public.recording_takes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  audio_asset_id uuid not null references public.audio_assets (id) on delete cascade,
  take_number integer not null check (take_number >= 1),
  start_tick integer not null default 0,
  rating smallint check (rating between 1 and 5),
  created_at timestamptz not null default now(),
  unique (project_id, take_number)
);
create index recording_takes_project_idx on public.recording_takes (project_id);

-- ----------------------------------------------------------- ai_generations
create table public.ai_generations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  task text not null check (char_length(task) <= 40),        -- lyrics:hooks, coach:rapFlow, melody-plan …
  mode text check (mode in ('conservative', 'creative', 'experimental')),
  provider text not null check (char_length(provider) <= 60),
  model text not null check (char_length(model) <= 80),
  request jsonb not null,
  response jsonb not null,
  status jsonb not null default '{}'::jsonb,                 -- per-suggestion open/applied/dismissed
  created_at timestamptz not null default now()
);
create index ai_generations_owner_idx on public.ai_generations (owner_id, created_at desc);
create index ai_generations_project_idx on public.ai_generations (project_id, created_at desc);

-- ------------------------------------------------------------ user_settings
create table public.user_settings (
  owner_id uuid primary key references auth.users (id) on delete cascade,
  settings jsonb not null default '{}'::jsonb,
  custom_rhymes jsonb not null default '[]'::jsonb,          -- custom rhyme dictionary entries
  updated_at timestamptz not null default now()
);

-- ------------------------------------------------------------ updated_at
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();
create trigger projects_touch before update on public.projects for each row execute function public.touch_updated_at();
create trigger user_settings_touch before update on public.user_settings for each row execute function public.touch_updated_at();

-- -------------------------------------------------- row level security
alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.song_sections enable row level security;
alter table public.lyrics_versions enable row level security;
alter table public.melody_versions enable row level security;
alter table public.midi_notes enable row level security;
alter table public.chord_progressions enable row level security;
alter table public.audio_assets enable row level security;
alter table public.recording_takes enable row level security;
alter table public.ai_generations enable row level security;
alter table public.user_settings enable row level security;

-- Ownership helper; security definer so policies on child tables stay simple.
create or replace function public.owns_project(p_project uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.projects where id = p_project and owner_id = auth.uid());
$$;

create policy "own profile" on public.profiles
  for all using (id = auth.uid()) with check (id = auth.uid());

create policy "own projects" on public.projects
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy "sections of own projects" on public.song_sections
  for all using (public.owns_project(project_id)) with check (public.owns_project(project_id));
create policy "lyrics versions of own projects" on public.lyrics_versions
  for all using (public.owns_project(project_id)) with check (public.owns_project(project_id));
create policy "melody versions of own projects" on public.melody_versions
  for all using (public.owns_project(project_id)) with check (public.owns_project(project_id));
create policy "chords of own projects" on public.chord_progressions
  for all using (public.owns_project(project_id)) with check (public.owns_project(project_id));
create policy "audio of own projects" on public.audio_assets
  for all using (public.owns_project(project_id)) with check (public.owns_project(project_id));
create policy "takes of own projects" on public.recording_takes
  for all using (public.owns_project(project_id)) with check (public.owns_project(project_id));

create policy "notes of own melody versions" on public.midi_notes
  for all using (
    exists (select 1 from public.melody_versions mv where mv.id = melody_version_id and public.owns_project(mv.project_id))
  ) with check (
    exists (select 1 from public.melody_versions mv where mv.id = melody_version_id and public.owns_project(mv.project_id))
  );

create policy "own ai generations" on public.ai_generations
  for all using (owner_id = auth.uid())
  with check (owner_id = auth.uid() and (project_id is null or public.owns_project(project_id)));

create policy "own settings" on public.user_settings
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- Create a profile row for new users.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- -------------------------------------------------------------- storage
-- Private bucket for recordings / references; objects live under '<user id>/…'.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('audio', 'audio', false, 52428800,
        array['audio/wav', 'audio/x-wav', 'audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/ogg', 'audio/webm', 'audio/flac', 'video/webm'])
on conflict (id) do nothing;

create policy "read own audio" on storage.objects for select
  using (bucket_id = 'audio' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "upload own audio" on storage.objects for insert
  with check (bucket_id = 'audio' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "update own audio" on storage.objects for update
  using (bucket_id = 'audio' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "delete own audio" on storage.objects for delete
  using (bucket_id = 'audio' and (storage.foldername(name))[1] = auth.uid()::text);

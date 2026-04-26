-- Enum for roles
create type public.app_role as enum ('admin', 'user');

-- Profiles
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

create policy "Users can view own profile" on public.profiles for select to authenticated using (auth.uid() = id);
create policy "Users can update own profile" on public.profiles for update to authenticated using (auth.uid() = id);
create policy "Users can insert own profile" on public.profiles for insert to authenticated with check (auth.uid() = id);

-- User roles
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create policy "Users can view own roles" on public.user_roles for select to authenticated using (auth.uid() = user_id);

-- Sites
create table public.sites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  lat double precision not null,
  lon double precision not null,
  construction_type text not null,
  baseline_score double precision,
  impact_score double precision,
  delta double precision,
  rationale text,
  created_at timestamptz not null default now()
);
alter table public.sites enable row level security;

create policy "Users view own sites" on public.sites for select to authenticated using (auth.uid() = user_id);
create policy "Users insert own sites" on public.sites for insert to authenticated with check (auth.uid() = user_id);
create policy "Users update own sites" on public.sites for update to authenticated using (auth.uid() = user_id);
create policy "Users delete own sites" on public.sites for delete to authenticated using (auth.uid() = user_id);

create index sites_user_idx on public.sites(user_id, created_at desc);

-- Chat threads
create table public.chat_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  site_id uuid references public.sites(id) on delete set null,
  bird_species text not null default 'Cactus Wren',
  created_at timestamptz not null default now()
);
alter table public.chat_threads enable row level security;

create policy "Users view own threads" on public.chat_threads for select to authenticated using (auth.uid() = user_id);
create policy "Users insert own threads" on public.chat_threads for insert to authenticated with check (auth.uid() = user_id);
create policy "Users update own threads" on public.chat_threads for update to authenticated using (auth.uid() = user_id);
create policy "Users delete own threads" on public.chat_threads for delete to authenticated using (auth.uid() = user_id);

-- Chat messages
create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.chat_threads(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user','assistant','system')),
  content text not null,
  created_at timestamptz not null default now()
);
alter table public.chat_messages enable row level security;

create policy "Users view own messages" on public.chat_messages for select to authenticated using (auth.uid() = user_id);
create policy "Users insert own messages" on public.chat_messages for insert to authenticated with check (auth.uid() = user_id);
create policy "Users delete own messages" on public.chat_messages for delete to authenticated using (auth.uid() = user_id);

create index chat_messages_thread_idx on public.chat_messages(thread_id, created_at);

-- eBird cache (shared read, backend write only via service role)
create table public.ebird_cache (
  cell_key text primary key,
  lat double precision not null,
  lon double precision not null,
  species_count integer not null default 0,
  observation_count integer not null default 0,
  top_species jsonb not null default '[]'::jsonb,
  fetched_at timestamptz not null default now()
);
alter table public.ebird_cache enable row level security;

create policy "Authenticated read cache" on public.ebird_cache for select to authenticated using (true);

-- Trigger: auto profile + role on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)));
  insert into public.user_roles (user_id, role) values (new.id, 'user');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Updated_at trigger for profiles
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();
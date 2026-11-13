-- Run ONCE in Supabase -> SQL Editor if you already ran supabase.sql earlier. Adds what the messenger-style room needs.
alter table usl_messages add column if not exists reply jsonb;
alter table usl_messages add column if not exists reactions jsonb not null default '{}'::jsonb;
alter table usl_messages add column if not exists edited_at bigint not null default 0;
alter table usl_messages add column if not exists media_kind text;
alter table usl_messages add column if not exists wave jsonb;
create table if not exists usl_presence (user_id text primary key, cls text not null, name text not null, role text not null default 'student', seen_at bigint not null default 0, read_at bigint not null default 0, typing_until bigint not null default 0);
create index if not exists usl_presence_cls on usl_presence (cls);
alter table usl_presence enable row level security;
drop policy if exists "open_all" on usl_presence;
create policy "open_all" on usl_presence for all to anon using (true) with check (true);

-- live class calls (one per class + subject)
create table if not exists usl_calls (room text primary key, cls text not null, subject_id text not null, subject_name text not null, host_id text not null, host_name text not null, title text not null default '', video boolean not null default false, started_at bigint not null default 0, beat_at bigint not null default 0, count int not null default 1);
create index if not exists usl_calls_cls on usl_calls (cls);
alter table usl_calls enable row level security;
drop policy if exists "open_all" on usl_calls;
create policy "open_all" on usl_calls for all to anon using (true) with check (true);

-- THE APP DATABASE (accounts, subscriptions, content). Only the server (service key) can use it: RLS on, no policy.
create table if not exists usl_state (id text primary key, version bigint not null default 1, data jsonb not null);
alter table usl_state enable row level security;

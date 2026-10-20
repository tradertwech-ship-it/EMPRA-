-- Run once in Supabase -> SQL Editor. Creates the shared tables for class chat, voice notes and call signalling.
create table if not exists usl_messages (
  id text primary key, cls text not null, user_id text not null, name text not null, role text not null default 'student',
  text text not null default '', media_id text, dur int, mime text, audio text, at bigint not null,
  deleted boolean not null default false, reports jsonb not null default '[]'::jsonb);
create index if not exists usl_messages_cls_at on usl_messages (cls, at desc);
create table if not exists usl_mutes (user_id text primary key, until bigint not null);
create table if not exists usl_signals (id bigserial primary key, room text not null, from_id text not null, to_id text, payload jsonb not null, at bigint not null);
create index if not exists usl_signals_room on usl_signals (room, id);
alter table usl_messages enable row level security; alter table usl_mutes enable row level security; alter table usl_signals enable row level security;
-- PROTOTYPE POLICIES: anyone holding the public key can read and write. Fine for a trial; tighten before real students (see README).
do $$ declare t text; begin foreach t in array array['usl_messages','usl_mutes','usl_signals'] loop
  execute format('drop policy if exists "open_all" on %I', t);
  execute format('create policy "open_all" on %I for all to anon using (true) with check (true)', t); end loop; end $$;

-- ===== messenger-style room additions (safe to re-run) =====
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

-- THE APP DATABASE (accounts, subscriptions, content). Only the server (service key) can read or write it.
-- RLS is on and there is deliberately NO policy, so browsers using the public key are refused.
create table if not exists usl_state (id text primary key, version bigint not null default 1, data jsonb not null);
alter table usl_state enable row level security;

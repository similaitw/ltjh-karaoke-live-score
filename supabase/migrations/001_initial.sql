-- Run once in a fresh Supabase project. The browser may read only the public
-- competition snapshot; writes and token lookup go through the Next.js server.
create table public.competitions (
  id text primary key,
  title text not null,
  revision integer not null default 0 check (revision >= 0),
  state jsonb not null,
  updated_at timestamptz not null default now()
);
create table public.contestants (
  competition_id text references public.competitions on delete cascade,
  id text not null, name text not null, song text not null, class_name text not null,
  primary key (competition_id, id)
);
create table public.judges (
  competition_id text references public.competitions on delete cascade,
  id text not null, name text not null,
  primary key (competition_id, id)
);
create table public.judge_tokens (
  token_hash text primary key check (length(token_hash) = 64),
  competition_id text not null,
  judge_id text not null,
  expires_at timestamptz not null,
  revoked boolean not null default false,
  foreign key (competition_id, judge_id) references public.judges on delete cascade
);
create table public.judge_scores (
  competition_id text not null,
  judge_id text not null, contestant_id text not null,
  value numeric not null check (value between 0 and 100),
  primary key (competition_id, judge_id, contestant_id),
  foreign key (competition_id, judge_id) references public.judges,
  foreign key (competition_id, contestant_id) references public.contestants
);
create table public.audience_rounds (
  competition_id text not null,
  id text not null, contestant_id text not null,
  status text not null check (status in ('open', 'locked')),
  primary key (competition_id, id),
  unique (competition_id, contestant_id),
  foreign key (competition_id, contestant_id) references public.contestants
);
create unique index one_open_round on public.audience_rounds (competition_id) where status = 'open';
create table public.audience_votes (
  competition_id text not null, round_id text not null,
  marker_id integer not null check (marker_id between 0 and 19),
  answer text not null check (answer in ('A', 'B', 'C', 'D')),
  primary key (competition_id, round_id, marker_id),
  foreign key (competition_id, round_id) references public.audience_rounds on delete cascade
);
create table public.settings (
  competition_id text primary key references public.competitions on delete cascade,
  judge_weight integer not null check (judge_weight between 0 and 100),
  active_contestant_id text not null,
  published boolean not null default false
);
create table public.events (
  id bigint generated always as identity primary key,
  competition_id text not null references public.competitions on delete cascade,
  revision integer not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  unique (competition_id, revision)
);

alter table public.competitions enable row level security;
alter table public.contestants enable row level security;
alter table public.judges enable row level security;
alter table public.judge_tokens enable row level security;
alter table public.judge_scores enable row level security;
alter table public.audience_rounds enable row level security;
alter table public.audience_votes enable row level security;
alter table public.settings enable row level security;
alter table public.events enable row level security;
create policy "Public scoreboard snapshot" on public.competitions for select to anon, authenticated using (true);
revoke all on public.competitions, public.contestants, public.judges, public.judge_tokens,
  public.judge_scores, public.audience_rounds, public.audience_votes, public.settings, public.events from anon, authenticated;
grant select on public.competitions to anon, authenticated;
grant all on public.competitions, public.contestants, public.judges, public.judge_tokens,
  public.judge_scores, public.audience_rounds, public.audience_votes, public.settings, public.events to service_role;
grant usage, select on sequence public.events_id_seq to service_role;

-- Optimistic concurrency: one transaction updates the public snapshot, relational
-- projections and audit event. A stale revision returns false with no writes.
create function public.save_competition(p_id text, p_revision integer, p_state jsonb, p_event jsonb)
returns boolean language plpgsql security invoker set search_path = public as $$
declare item jsonb; r jsonb; v record;
begin
  if p_state->>'id' <> p_id or (p_state->>'revision')::integer <> p_revision + 1 then
    raise exception 'Invalid snapshot revision';
  end if;
  update public.competitions set state = p_state, revision = p_revision + 1,
    title = p_state->>'title', updated_at = now()
    where id = p_id and revision = p_revision;
  if not found then return false; end if;

  for item in select * from jsonb_array_elements(p_state->'contestants') loop
    insert into public.contestants values (p_id, item->>'id', item->>'name', item->>'song', item->>'className')
      on conflict (competition_id, id) do update set name = excluded.name, song = excluded.song, class_name = excluded.class_name;
  end loop;
  for item in select * from jsonb_array_elements(p_state->'judges') loop
    insert into public.judges values (p_id, item->>'id', item->>'name')
      on conflict (competition_id, id) do update set name = excluded.name;
  end loop;
  for item in select * from jsonb_array_elements(p_state->'scores') loop
    insert into public.judge_scores values (p_id, item->>'judgeId', item->>'contestantId', (item->>'value')::numeric)
      on conflict (competition_id, judge_id, contestant_id) do update set value = excluded.value;
  end loop;
  for r in select * from jsonb_array_elements(p_state->'rounds') loop
    insert into public.audience_rounds values (p_id, r->>'id', r->>'contestantId', r->>'status')
      on conflict (competition_id, id) do update set status = excluded.status;
    for v in select * from jsonb_each_text(r->'votes') loop
      insert into public.audience_votes values (p_id, r->>'id', v.key::integer, v.value)
        on conflict (competition_id, round_id, marker_id) do update set answer = excluded.answer;
    end loop;
  end loop;
  insert into public.settings values (p_id, (p_state->>'judgeWeight')::integer, p_state->>'activeContestantId', (p_state->>'published')::boolean)
    on conflict (competition_id) do update set judge_weight = excluded.judge_weight,
      active_contestant_id = excluded.active_contestant_id, published = excluded.published;
  insert into public.events(competition_id, revision, payload) values (p_id, p_revision + 1, p_event);
  return true;
end;
$$;
revoke all on function public.save_competition(text, integer, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.save_competition(text, integer, jsonb, jsonb) to service_role;
alter publication supabase_realtime add table public.competitions;

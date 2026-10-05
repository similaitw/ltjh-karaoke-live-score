-- M1.1 additive upgrade. Apply after 001, before seed on fresh installations.
-- Refuse to silently recalculate a published M1 competition during upgrade.
begin;
do $$ begin
  if exists (select 1 from public.competitions where (state->>'published')::boolean and not state ? 'audiencePoints') then
    raise exception 'Unpublish the legacy competition explicitly before applying M1.1';
  end if;
end $$;

create table public.admin_sessions (
  token_hash text primary key check (length(token_hash) = 64),
  credential_version text not null,
  expires_at timestamptz not null
);
alter table public.admin_sessions enable row level security;
revoke all on public.admin_sessions from public, anon, authenticated;
grant select, insert, delete on public.admin_sessions to service_role;

alter table public.judge_scores add column rubric jsonb;
alter table public.judge_scores add column total numeric generated always as (value) stored;
alter table public.judge_scores add constraint rubric_limits check (
  rubric is null or (
    jsonb_typeof(rubric) = 'object' and
    rubric ?& array['pitch','rhythm','technique','expression','stage'] and
    rubric - array['pitch','rhythm','technique','expression','stage'] = '{}'::jsonb and
    jsonb_typeof(rubric->'pitch') = 'number' and (rubric->>'pitch')::numeric between 0 and 25 and
    jsonb_typeof(rubric->'rhythm') = 'number' and (rubric->>'rhythm')::numeric between 0 and 20 and
    jsonb_typeof(rubric->'technique') = 'number' and (rubric->>'technique')::numeric between 0 and 20 and
    jsonb_typeof(rubric->'expression') = 'number' and (rubric->>'expression')::numeric between 0 and 20 and
    jsonb_typeof(rubric->'stage') = 'number' and (rubric->>'stage')::numeric between 0 and 15 and
    abs(value - ((rubric->>'pitch')::numeric + (rubric->>'rhythm')::numeric +
      (rubric->>'technique')::numeric + (rubric->>'expression')::numeric + (rubric->>'stage')::numeric)) < 0.00000001
  )
);
alter table public.audience_votes drop constraint audience_votes_marker_id_check;
alter table public.audience_votes add check (marker_id between 0 and 39);
alter table public.settings add column audience_points jsonb not null default '{"A":100,"B":85,"C":70,"D":55}';
alter table public.settings add column started boolean not null default false;
alter table public.settings add column weights_locked boolean not null default false;

-- Preserve legacy totals; absent rubric remains null and requires judge resubmission.
update public.competitions set state = state || jsonb_build_object(
  'audiencePoints', '{"A":100,"B":85,"C":70,"D":55}'::jsonb,
  'started', jsonb_array_length(state->'scores') > 0 or jsonb_array_length(state->'rounds') > 0,
  'weightsLocked', jsonb_array_length(state->'scores') > 0 or jsonb_array_length(state->'rounds') > 0,
  'retiredRoundIds', '[]'::jsonb, 'events', '[]'::jsonb,
  'scores', coalesce((select jsonb_agg((s - 'value') || jsonb_build_object('total', s->'value', 'rubric', null))
    from jsonb_array_elements(state->'scores') s), '[]'::jsonb)
) where not state ? 'audiencePoints';
update public.settings s set audience_points = c.state->'audiencePoints',
  started = (c.state->>'started')::boolean, weights_locked = (c.state->>'weightsLocked')::boolean
  from public.competitions c where s.competition_id = c.id;
create or replace function public.save_competition(p_id text, p_revision integer, p_state jsonb, p_event jsonb)
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
  delete from public.judge_scores where competition_id = p_id;
  for item in select * from jsonb_array_elements(p_state->'scores') loop
    insert into public.judge_scores (competition_id, judge_id, contestant_id, value, rubric) values (p_id, item->>'judgeId', item->>'contestantId', (item->>'total')::numeric, nullif(item->'rubric', 'null'::jsonb))
      on conflict (competition_id, judge_id, contestant_id) do update set value = excluded.value, rubric = excluded.rubric;
  end loop;
  -- Rebuild the small projections atomically; cascading deletes remove retired round votes.
  delete from public.audience_rounds where competition_id = p_id;
  for r in select * from jsonb_array_elements(p_state->'rounds') loop
    insert into public.audience_rounds values (p_id, r->>'id', r->>'contestantId', r->>'status')
      on conflict (competition_id, id) do update set status = excluded.status;
    for v in select * from jsonb_each_text(r->'votes') loop
      insert into public.audience_votes values (p_id, r->>'id', v.key::integer, v.value)
        on conflict (competition_id, round_id, marker_id) do update set answer = excluded.answer;
    end loop;
  end loop;
  insert into public.settings values (p_id, (p_state->>'judgeWeight')::integer, p_state->>'activeContestantId', (p_state->>'published')::boolean, p_state->'audiencePoints', (p_state->>'started')::boolean, (p_state->>'weightsLocked')::boolean)
    on conflict (competition_id) do update set judge_weight = excluded.judge_weight,
      active_contestant_id = excluded.active_contestant_id, published = excluded.published, audience_points = excluded.audience_points, started = excluded.started, weights_locked = excluded.weights_locked;
  insert into public.events(competition_id, revision, payload) values (p_id, p_revision + 1, p_event);
  return true;
end;
$$;
revoke all on function public.save_competition(text, integer, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.save_competition(text, integer, jsonb, jsonb) to service_role;

commit;

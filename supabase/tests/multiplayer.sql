-- Run against an isolated test project or a transaction that is rolled back.
begin;
do $$
declare
  room jsonb; host jsonb; state jsonb; room_code text; tv_token text; host_token text;
  traitor1 public.game_players; traitor2 public.game_players; faithful1 public.game_players; faithful2 public.game_players;
begin
  room := public.game_create();
  room_code := room->>'code';
  tv_token := room->>'token';
  host := public.game_join(room_code, 'host');
  host_token := host->>'token';
  perform public.game_join(room_code, 'player', 'Alice');
  perform public.game_join(room_code, 'player', 'Bob');
  perform public.game_join(room_code, 'player', 'Charlie');
  perform public.game_join(room_code, 'player', 'Dana');
  if public.game_join(room_code, 'player', '  alice  ')->>'name' <> 'Alice' then raise exception 'Name recovery failed'; end if;
  perform public.game_command(room_code, host_token, 'assign', '2');
  state := public.game_state(room_code, 'host', null, host_token);
  if state::text like '%traitor%' and state->'players' @> '[{"role":"traitor"}]'::jsonb then raise exception 'Host can see roles'; end if;
  select * into traitor1 from public.game_players where room_id = (select id from public.game_rooms where game_rooms.code = room_code) and role = 'traitor' order by name limit 1;
  select * into traitor2 from public.game_players where room_id = traitor1.room_id and role = 'traitor' and id <> traitor1.id limit 1;
  select * into faithful1 from public.game_players where room_id = traitor1.room_id and role = 'faithful' order by name limit 1;
  select * into faithful2 from public.game_players where room_id = traitor1.room_id and role = 'faithful' and id <> faithful1.id limit 1;
  state := public.game_state(room_code, 'player', traitor1.name);
  if state->'self'->>'role' <> 'traitor' or jsonb_array_length(state->'fellowTraitors') <> 1 then raise exception 'Player role state failed'; end if;
  perform public.game_command(room_code, tv_token, 'night');
  perform public.game_vote(room_code, traitor1.name, faithful1.id);
  begin
    perform public.game_vote(room_code, traitor1.name, faithful2.id);
    raise exception 'Duplicate vote was accepted';
  exception when others then
    if sqlerrm <> 'Your choice is already locked' then raise; end if;
  end;
  perform public.game_vote(room_code, traitor2.name, faithful2.id);
  state := public.game_state(room_code, 'host', null, host_token);
  if state->>'phase' <> 'night_tie' or jsonb_array_length(state->'ties') <> 2 then raise exception 'Tie resolution failed'; end if;
  perform public.game_command(room_code, host_token, 'resolve_tie', faithful1.id::text);
  state := public.game_state(room_code, 'player', faithful1.name);
  if state->'self'->>'status' <> 'killed' then raise exception 'Victim state failed'; end if;
  perform public.game_command(room_code, host_token, 'vote');
  perform public.game_vote(room_code, traitor1.name, traitor2.id);
  perform public.game_vote(room_code, traitor2.name, traitor1.id);
  perform public.game_vote(room_code, faithful2.name, traitor1.id);
  state := public.game_state(room_code, 'host', null, host_token);
  if state->>'phase' <> 'vote_result' or (state->'results'->0->>'votes')::integer <> 2 then raise exception 'Round table votes failed'; end if;
end $$;
rollback;

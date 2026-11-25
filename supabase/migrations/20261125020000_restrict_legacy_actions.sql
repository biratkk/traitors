-- The guided flow owns all host actions and ballots. Keep old RPCs private so
-- clients cannot bypass the phase and consensus rules.
revoke execute on function public.game_command(text,text,text,text) from anon, authenticated;
revoke execute on function public.game_vote(text,text,uuid) from anon, authenticated;

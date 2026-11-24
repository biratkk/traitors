create function public.game_close(code_input text, token_input text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from public.game_rooms where code = upper(trim(code_input)) and tv_token::text = token_input;
  if not found then raise exception 'TV session not recognized'; end if;
end $$;
revoke all on function public.game_close(text,text) from public;
grant execute on function public.game_close(text,text) to anon, authenticated;

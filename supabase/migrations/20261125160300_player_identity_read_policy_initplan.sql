-- Same authorization rule, evaluate once per statement rather than once per player.
alter policy "authorized user can read player identities" on public.player_identities
 using ((select private.can_view_player_identities()));

-- Fix: when voting uses UPSERT, the row can be updated (vote flips from +1 to -1).
-- The recompute trigger must also run on UPDATE, not only INSERT/DELETE.

drop trigger if exists song_execution_tip_votes_after_update_trg on public.song_execution_tip_votes;
create trigger song_execution_tip_votes_after_update_trg
after update on public.song_execution_tip_votes
for each row execute function public.song_execution_tip_votes_after_change();

-- Optional guardrails (safe if table is empty or already compliant).
alter table public.song_execution_tip_requests
  drop constraint if exists song_execution_tip_requests_text_len_chk;

alter table public.song_execution_tip_requests
  add constraint song_execution_tip_requests_text_len_chk check (char_length(text) <= 400);


-- Server login roles inherit this role. It has no table access or swipe permission.
begin;
create role spotme_chat_api nologin;
grant usage on schema spotme_private to spotme_chat_api;

-- These functions already check both member states and the pair's current state.
-- They retain their empty search paths and their existing restricted grants.
alter function spotme_private.close_pair(uuid, uuid, boolean) security definer;
alter function spotme_private.send_message(uuid, uuid, uuid, text) security definer;
alter function spotme_private.read_messages(uuid, uuid, bigint, integer) security definer;

grant execute on function spotme_private.close_pair(uuid, uuid, boolean),
    spotme_private.send_message(uuid, uuid, uuid, text),
    spotme_private.read_messages(uuid, uuid, bigint, integer) to spotme_chat_api;

create function spotme_private.list_matches(p_actor uuid, p_after uuid, p_limit integer)
returns table (peer_id uuid, display_name text, matched_at timestamptz)
language sql stable security definer set search_path = '' as $$
    select peer.user_id, peer.display_name, pair.matched_at
    from spotme_private.profiles actor
    join spotme_private.member_pairs pair on actor.user_id in (pair.member_low, pair.member_high)
    join spotme_private.profiles peer on peer.user_id = case
        when pair.member_low = p_actor then pair.member_high else pair.member_low end
    where actor.user_id = p_actor
      and pair.matched_at is not null and pair.closed_at is null
      and actor.status in ('active', 'paused') and peer.status in ('active', 'paused')
      and greatest(actor.date_of_birth, peer.date_of_birth)
          <= (timezone('America/Toronto', now())::date - interval '18 years')::date
      and (p_after is null or peer.user_id > p_after)
    order by peer.user_id
    limit greatest(1, least(coalesce(p_limit, 30), 50));
$$;
revoke execute on function spotme_private.list_matches(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function spotme_private.list_matches(uuid, uuid, integer) to spotme_chat_api;

commit;

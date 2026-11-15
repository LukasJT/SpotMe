-- Operations for an authenticated server. The server derives p_actor from a verified
-- session and enforces discovery eligibility and rate limits before recording a swipe.
begin;

create table spotme_private.member_pairs (
    member_low uuid not null references spotme_private.profiles (user_id) on delete cascade,
    member_high uuid not null references spotme_private.profiles (user_id) on delete cascade,
    low_decision text check (low_decision in ('like', 'pass')),
    high_decision text check (high_decision in ('like', 'pass')),
    matched_at timestamptz,
    closed_at timestamptz,
    primary key (member_low, member_high),
    check (member_low < member_high),
    check (matched_at is null or (low_decision is not distinct from 'like' and high_decision is not distinct from 'like'))
);
create index member_pairs_high on spotme_private.member_pairs (member_high, member_low);

create table spotme_private.messages (
    id bigint generated always as identity primary key,
    member_low uuid not null,
    member_high uuid not null,
    sender_id uuid not null,
    client_message_id uuid not null,
    body text not null check (char_length(btrim(body)) between 1 and 2000),
    created_at timestamptz not null default clock_timestamp(),
    foreign key (member_low, member_high) references spotme_private.member_pairs on delete cascade,
    check (sender_id in (member_low, member_high)),
    unique (member_low, member_high, sender_id, client_message_id)
);
create index messages_by_pair_cursor on spotme_private.messages (member_low, member_high, id);

alter table spotme_private.member_pairs enable row level security;
alter table spotme_private.messages enable row level security;
revoke all on spotme_private.member_pairs, spotme_private.messages from public, anon, authenticated;
revoke all on sequence spotme_private.messages_id_seq from public, anon, authenticated;
grant select, insert, update, delete on spotme_private.member_pairs, spotme_private.messages to service_role;
grant usage, select on sequence spotme_private.messages_id_seq to service_role;

-- Match-related writes lock profile status in ID order, then serialize on the canonical
-- pair row. Suspension and deletion must update the profile row in their transaction.
create function spotme_private.lock_pair_members(p_actor uuid, p_other uuid, p_mode text)
returns void language plpgsql security invoker set search_path = '' as $$
declare
    member spotme_private.profiles%rowtype;
    member_count integer := 0;
    today date := timezone('America/Toronto', now())::date;
begin
    if p_actor is null or p_other is null or p_actor = p_other then
        raise exception using errcode = '22023', message = 'Invalid member pair';
    end if;
    for member in
        select p.* from spotme_private.profiles p
        where p.user_id in (p_actor, p_other) order by p.user_id for share
    loop
        member_count := member_count + 1;
        if p_mode = 'block' and member.user_id = p_other then
            continue;
        end if;
        if member.date_of_birth > (today - interval '18 years')::date
            or member.status not in ('active', 'paused')
            or (p_mode = 'swipe' and member.status <> 'active') then
            raise exception using errcode = '42501', message = 'Member pair unavailable';
        end if;
    end loop;
    if member_count <> 2 then
        raise exception using errcode = '42501', message = 'Member pair unavailable';
    end if;
end;
$$;

create function spotme_private.record_swipe(p_actor uuid, p_other uuid, p_decision text)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare
    lo uuid := least(p_actor, p_other);
    hi uuid := greatest(p_actor, p_other);
    pair spotme_private.member_pairs%rowtype;
begin
    if p_decision is null or p_decision not in ('like', 'pass') then
        raise exception using errcode = '22023', message = 'Invalid decision';
    end if;
    perform spotme_private.lock_pair_members(p_actor, p_other, 'swipe');
    insert into spotme_private.member_pairs (member_low, member_high) values (lo, hi) on conflict do nothing;
    select * into strict pair from spotme_private.member_pairs
        where member_low = lo and member_high = hi for update;
    if pair.closed_at is not null then
        raise exception using errcode = '42501', message = 'Member pair unavailable';
    end if;
    if p_actor = lo then
        pair.low_decision := coalesce(pair.low_decision, p_decision);
    else
        pair.high_decision := coalesce(pair.high_decision, p_decision);
    end if;
    if pair.low_decision = 'like' and pair.high_decision = 'like' and pair.matched_at is null then
        pair.matched_at := clock_timestamp();
    end if;
    update spotme_private.member_pairs set low_decision = pair.low_decision,
        high_decision = pair.high_decision, matched_at = pair.matched_at
        where member_low = lo and member_high = hi;
    return pair.matched_at is not null;
end;
$$;

create function spotme_private.close_pair(p_actor uuid, p_other uuid, p_block boolean)
returns void language plpgsql security invoker set search_path = '' as $$
declare
    lo uuid := least(p_actor, p_other);
    hi uuid := greatest(p_actor, p_other);
begin
    if p_block is null then
        raise exception using errcode = '22023', message = 'Invalid closure type';
    end if;
    perform spotme_private.lock_pair_members(p_actor, p_other, case when p_block then 'block' else 'chat' end);
    if p_block then
        insert into spotme_private.member_pairs (member_low, member_high, closed_at)
        values (lo, hi, clock_timestamp())
        on conflict (member_low, member_high) do update
        set closed_at = coalesce(spotme_private.member_pairs.closed_at, excluded.closed_at);
    else
        update spotme_private.member_pairs set closed_at = coalesce(closed_at, clock_timestamp())
        where member_low = lo and member_high = hi and matched_at is not null;
        if not found then
            raise exception using errcode = '42501', message = 'Conversation unavailable';
        end if;
    end if;
end;
$$;

create function spotme_private.send_message(p_actor uuid, p_other uuid, p_request uuid, p_body text)
returns bigint language plpgsql security invoker set search_path = '' as $$
declare
    lo uuid := least(p_actor, p_other);
    hi uuid := greatest(p_actor, p_other);
    sent spotme_private.messages%rowtype;
    clean_body text := regexp_replace(p_body, '^[[:space:]]+|[[:space:]]+$', '', 'g');
begin
    if p_request is null or clean_body is null or char_length(clean_body) not between 1 and 2000 then
        raise exception using errcode = '22023', message = 'Invalid message';
    end if;
    perform spotme_private.lock_pair_members(p_actor, p_other, 'chat');
    perform 1 from spotme_private.member_pairs where member_low = lo and member_high = hi
        and matched_at is not null and closed_at is null for update;
    if not found then
        raise exception using errcode = '42501', message = 'Conversation unavailable';
    end if;
    select * into sent from spotme_private.messages where member_low = lo and member_high = hi
        and sender_id = p_actor and client_message_id = p_request;
    if found then
        if sent.body is distinct from clean_body then
            raise exception using errcode = '22023', message = 'Message retry does not match the original';
        end if;
    else
        insert into spotme_private.messages (member_low, member_high, sender_id, client_message_id, body)
        values (lo, hi, p_actor, p_request, clean_body) returning * into sent;
    end if;
    return sent.id;
end;
$$;

create function spotme_private.read_messages(p_actor uuid, p_other uuid, p_after bigint default 0, p_limit integer default 30)
returns table (id bigint, sender_id uuid, body text, created_at timestamptz)
language plpgsql security invoker set search_path = '' as $$
declare
    lo uuid := least(p_actor, p_other);
    hi uuid := greatest(p_actor, p_other);
begin
    perform spotme_private.lock_pair_members(p_actor, p_other, 'chat');
    perform 1 from spotme_private.member_pairs p where p.member_low = lo and p.member_high = hi
        and p.matched_at is not null and p.closed_at is null for share;
    if not found then
        raise exception using errcode = '42501', message = 'Conversation unavailable';
    end if;
    return query select m.id, m.sender_id, m.body, m.created_at from spotme_private.messages m
        where m.member_low = lo and m.member_high = hi and m.id > greatest(coalesce(p_after, 0), 0)
        order by m.id limit greatest(1, least(coalesce(p_limit, 30), 50));
end;
$$;

revoke execute on function spotme_private.lock_pair_members(uuid, uuid, text),
    spotme_private.record_swipe(uuid, uuid, text), spotme_private.close_pair(uuid, uuid, boolean),
    spotme_private.send_message(uuid, uuid, uuid, text), spotme_private.read_messages(uuid, uuid, bigint, integer)
    from public, anon, authenticated;
grant execute on function spotme_private.lock_pair_members(uuid, uuid, text),
    spotme_private.record_swipe(uuid, uuid, text), spotme_private.close_pair(uuid, uuid, boolean),
    spotme_private.send_message(uuid, uuid, uuid, text), spotme_private.read_messages(uuid, uuid, bigint, integer)
    to service_role;

commit;

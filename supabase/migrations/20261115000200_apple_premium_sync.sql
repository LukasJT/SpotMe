begin;

create role spotme_apple_billing nologin;
grant usage on schema spotme_private to spotme_apple_billing;

create table spotme_private.apple_subscriptions (
    environment text not null check (environment in ('Sandbox','Production')),
    original_transaction_id text not null check (original_transaction_id ~ '^[0-9]{1,32}$'),
    user_id uuid not null references auth.users(id) on delete cascade,
    product_id text not null check (product_id in (
        'com.spotmedating.ios.premium.weekly', 'com.spotmedating.ios.premium.monthly'
    )),
    active_until timestamptz,
    sync_ticket bigint not null check (sync_ticket > 0),
    primary key (environment,original_transaction_id)
);
create index apple_subscriptions_by_user on spotme_private.apple_subscriptions(user_id,active_until);
alter table spotme_private.apple_subscriptions enable row level security;
revoke all on spotme_private.apple_subscriptions from public,anon,authenticated,spotme_chat_api,spotme_apple_billing;
create sequence spotme_private.apple_sync_ticket as bigint;

create function spotme_private.next_apple_sync_ticket()
returns bigint language sql volatile security definer set search_path = '' as $$
    select nextval('spotme_private.apple_sync_ticket'::regclass)
$$;

create function spotme_private.apple_subscription_owner(p_environment text,p_original text)
returns uuid language sql stable security definer set search_path = '' as $$
    select user_id from spotme_private.apple_subscriptions
    where environment=p_environment and original_transaction_id=p_original
$$;

create function spotme_private.record_apple_subscription(
    p_environment text,p_original text,p_actor uuid,p_product text,
    p_active_until timestamptz,p_ticket bigint
) returns void language plpgsql security definer set search_path = '' as $$
begin
    insert into spotme_private.apple_subscriptions as existing
        (environment,original_transaction_id,user_id,product_id,active_until,sync_ticket)
    values (p_environment,p_original,p_actor,p_product,p_active_until,p_ticket)
    on conflict (environment,original_transaction_id) do update set
        product_id=excluded.product_id,active_until=excluded.active_until,sync_ticket=excluded.sync_ticket
    where existing.user_id=excluded.user_id and existing.sync_ticket<excluded.sync_ticket;

    if not exists (select 1 from spotme_private.apple_subscriptions
        where environment=p_environment and original_transaction_id=p_original and user_id=p_actor) then
        raise exception using errcode='42501',message='Subscription belongs to a different account';
    end if;
end;
$$;

create function spotme_private.has_premium(p_actor uuid, p_environment text)
returns boolean language sql stable security definer set search_path = '' as $$
    select exists (
        select 1 from spotme_private.premium_entitlements
        where user_id=p_actor and revoked_at is null and valid_until>now()
    ) or exists (
        select 1 from spotme_private.apple_subscriptions
        where user_id=p_actor and environment=p_environment and active_until>now()
    )
$$;

-- The API controls the environment, never the member request.
create function spotme_private.gym_search_cards_for_environment(
    p_actor uuid, p_gym uuid, p_minimum_age integer, p_maximum_age integer,
    p_after uuid, p_environment text
)
returns setof jsonb language plpgsql stable security definer set search_path = '' as $$
begin
    if not spotme_private.has_premium(p_actor,p_environment) then
        raise exception using errcode='P4030', message='Premium subscription required';
    end if;
    if p_gym is null or p_minimum_age is null or p_maximum_age is null
        or p_minimum_age<18 or p_maximum_age>99 or p_minimum_age>p_maximum_age then
        raise exception using errcode='22023', message='Invalid gym search filters';
    end if;
    return query
        select jsonb_build_object('id', b.user_id, 'name', b.display_name, 'city', c.name,
            'age', extract(year from age(timezone('America/Toronto',now())::date,b.date_of_birth)),
            'bio', b.bio, 'intent', b.relationship_intent, 'split', b.workout_split,
            'frequency', b.workout_frequency,
            'days', case when b.training_days_audience='discovery'
                then to_jsonb(b.training_days) else '[]'::jsonb end)
        from spotme_private.profile_gyms link
        join spotme_private.gyms g on g.id=link.gym_id and g.listing_status='approved'
        join spotme_private.profiles b on b.user_id=link.user_id
        join spotme_private.cities c on c.id=b.city_id
        join spotme_private.profiles a on a.user_id=p_actor
        left join spotme_private.member_pairs pair
            on pair.member_low=least(a.user_id,b.user_id) and pair.member_high=greatest(a.user_id,b.user_id)
        where link.gym_id=p_gym and link.audience='discovery' and b.gym_search_opt_in
            and spotme_private.discovery_compatible(a,b)
            and extract(year from age(timezone('America/Toronto',now())::date,b.date_of_birth))
                between p_minimum_age and p_maximum_age
            and pair.closed_at is null and pair.matched_at is null
            and (case when a.user_id=pair.member_low then pair.low_decision else pair.high_decision end) is null
            and (p_after is null or b.user_id>p_after)
        order by b.user_id limit 20;
end;
$$;

create or replace function spotme_private.gym_search_cards(
    p_actor uuid, p_gym uuid, p_minimum_age integer, p_maximum_age integer, p_after uuid
)
returns setof jsonb language sql stable security definer set search_path = '' as $$
    select * from spotme_private.gym_search_cards_for_environment(
        p_actor,p_gym,p_minimum_age,p_maximum_age,p_after,'Production'
    )
$$;

revoke execute on function spotme_private.next_apple_sync_ticket(),
    spotme_private.apple_subscription_owner(text,text),
    spotme_private.record_apple_subscription(text,text,uuid,text,timestamptz,bigint),
    spotme_private.has_premium(uuid,text),
    spotme_private.gym_search_cards_for_environment(uuid,uuid,integer,integer,uuid,text)
    from public,anon,authenticated,spotme_chat_api;
grant execute on function spotme_private.next_apple_sync_ticket(),
    spotme_private.apple_subscription_owner(text,text),
    spotme_private.record_apple_subscription(text,text,uuid,text,timestamptz,bigint) to spotme_apple_billing;
grant execute on function spotme_private.has_premium(uuid,text),
    spotme_private.gym_search_cards_for_environment(uuid,uuid,integer,integer,uuid,text) to spotme_chat_api;

commit;

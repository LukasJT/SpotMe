begin;

alter table spotme_private.profiles
    add column gym_search_opt_in boolean not null default false;

-- A trusted billing process owns these grants. The member API cannot insert,
-- extend, or revoke them. Keep Apple transaction verification outside SQL.
create table spotme_private.premium_entitlements (
    user_id uuid primary key references spotme_private.profiles(user_id) on delete cascade,
    valid_until timestamptz not null,
    revoked_at timestamptz
);
alter table spotme_private.premium_entitlements enable row level security;
revoke all on spotme_private.premium_entitlements from public, anon, authenticated, spotme_chat_api;

create function spotme_private.gym_search_visibility(p_actor uuid)
returns boolean language sql stable security definer set search_path = '' as $$
    select gym_search_opt_in from spotme_private.profiles
    where user_id=p_actor and status in ('onboarding','active','paused');
$$;

create function spotme_private.set_gym_search_visibility(p_actor uuid, p_visible boolean)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
    if p_visible is null then
        raise exception using errcode='22023', message='Visibility is required';
    end if;
    update spotme_private.profiles set gym_search_opt_in=p_visible
        where user_id=p_actor and status in ('onboarding','active','paused');
    if not found then
        raise exception using errcode='42501', message='Profile unavailable';
    end if;
    return p_visible;
end;
$$;

create function spotme_private.gym_search_cards(
    p_actor uuid, p_gym uuid, p_minimum_age integer, p_maximum_age integer, p_after uuid
)
returns setof jsonb language plpgsql stable security definer set search_path = '' as $$
begin
    if not exists (
        select 1 from spotme_private.premium_entitlements e
        where e.user_id=p_actor and e.revoked_at is null and e.valid_until>now()
    ) then
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

revoke execute on function spotme_private.gym_search_visibility(uuid),spotme_private.set_gym_search_visibility(uuid,boolean),
    spotme_private.gym_search_cards(uuid,uuid,integer,integer,uuid) from public,anon,authenticated;
grant execute on function spotme_private.gym_search_visibility(uuid),spotme_private.set_gym_search_visibility(uuid,boolean),
    spotme_private.gym_search_cards(uuid,uuid,integer,integer,uuid) to spotme_chat_api;

commit;

begin;

alter table spotme_private.profiles
    add column gender text check (gender in ('woman','man','nonbinary','another_identity')),
    add column seeking text[] not null default '{}' check (
        cardinality(seeking) <= 4 and array_position(seeking,null) is null and
        seeking <@ array['woman','man','nonbinary','another_identity']),
    add column minimum_age smallint not null default 18 check (minimum_age between 18 and 99),
    add column maximum_age smallint not null default 99 check (maximum_age between minimum_age and 99),
    add column discovery_approved_at timestamptz;
create index profiles_discovery_city on spotme_private.profiles (city_id,user_id)
    where status = 'active' and discovery_approved_at is not null;

create function spotme_private.read_profile(p_actor uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
    select jsonb_build_object('name',p.display_name,'date_of_birth',p.date_of_birth,'city_id',p.city_id::text,
        'bio',p.bio,'intent',p.relationship_intent,'split',p.workout_split,'days',p.training_days,
        'days_audience',p.training_days_audience,'gender',p.gender,'seeking',p.seeking,
        'minimum_age',p.minimum_age,'maximum_age',p.maximum_age,'status',p.status,
        'gyms',coalesce((select jsonb_agg(jsonb_build_object('id',g.id,'name',g.display_name,'audience',link.audience) order by g.display_name,g.id)
            from spotme_private.profile_gyms link join spotme_private.gyms g on g.id=link.gym_id
            where link.user_id=p.user_id and g.listing_status='approved'),'[]'::jsonb))
    from spotme_private.profiles p where p.user_id=p_actor;
$$;

create function spotme_private.save_profile(p_actor uuid, p_data jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    existing spotme_private.profiles%rowtype;
    selected record;
    birth date := (p_data->>'date_of_birth')::date;
    gym_count integer;
begin
    if p_actor is null or birth is null or birth > (timezone('America/Toronto',now())::date - interval '18 years')::date then
        raise exception using errcode='22023',message='Adult date of birth required';
    end if;
    if (p_data->>'name') is null or (p_data->>'city_id') is null or (p_data->>'gender') is null
       or jsonb_array_length(p_data->'seeking') < 1 or p_data->'seeking' is null then
        raise exception using errcode='22023',message='Incomplete profile';
    end if;
    insert into spotme_private.profiles(user_id,date_of_birth,display_name)
        values(p_actor,birth,p_data->>'name') on conflict do nothing;
    select * into strict existing from spotme_private.profiles where user_id=p_actor for update;
    if existing.status in ('suspended','deletion_pending') then
        raise exception using errcode='42501',message='Profile unavailable';
    end if;
    if birth <> existing.date_of_birth then
        raise exception using errcode='22023',message='Date of birth changes require support';
    end if;
    gym_count := jsonb_array_length(p_data->'gyms');
    if gym_count is null or gym_count > 10 then
        raise exception using errcode='22023',message='Invalid gym selections';
    end if;
    -- Recheck approval and hold listings stable until the membership update commits.
    perform g.id from spotme_private.gyms g where g.listing_status='approved' and g.id in (
        select (item->>'id')::uuid from jsonb_array_elements(p_data->'gyms') item
    ) order by g.id for share;
    get diagnostics gym_count = row_count;
    if gym_count <> jsonb_array_length(p_data->'gyms') then
        raise exception using errcode='22023',message='Invalid or duplicate gym selection';
    end if;
    update spotme_private.profiles set display_name=p_data->>'name',city_id=(p_data->>'city_id')::bigint,
        bio=coalesce(p_data->>'bio',''), relationship_intent=coalesce(p_data->>'intent',''),
        workout_split=coalesce(p_data->>'split',''), gender=p_data->>'gender',
        seeking=array(select jsonb_array_elements_text(p_data->'seeking')),
        minimum_age=(p_data->>'minimum_age')::smallint,maximum_age=(p_data->>'maximum_age')::smallint,
        training_days=array(select distinct value::smallint from jsonb_array_elements_text(p_data->'days') order by 1),
        workout_frequency=(select count(distinct value) from jsonb_array_elements_text(p_data->'days')),
        training_days_audience=(p_data->>'days_audience')::spotme_private.audience,
        status=case when existing.status='onboarding' or existing.discovery_approved_at is null then existing.status
            when coalesce((p_data->>'paused')::boolean,false) then 'paused'::spotme_private.profile_status
            else 'active'::spotme_private.profile_status end
        where user_id=p_actor;
    delete from spotme_private.profile_gyms where user_id=p_actor;
    for selected in select value from jsonb_array_elements(p_data->'gyms') loop
        insert into spotme_private.profile_gyms(user_id,gym_id,audience)
            values(p_actor,(selected.value->>'id')::uuid,coalesce(selected.value->>'audience','private')::spotme_private.audience);
    end loop;
    return spotme_private.read_profile(p_actor);
end;
$$;

create function spotme_private.directory_cities()
returns table (id text,name text,province text) language sql stable security definer set search_path = '' as $$
    select c.id::text,c.name,c.province from spotme_private.cities c order by c.province,c.name,c.id limit 200;
$$;

create function spotme_private.directory_gyms(p_city bigint,p_search text,p_after uuid)
returns table (id uuid,name text,street_address text) language sql stable security definer set search_path = '' as $$
    select g.id,g.display_name,g.street_address from spotme_private.gyms g
    where g.city_id=p_city and g.listing_status='approved' and (p_after is null or g.id>p_after)
        and strpos(lower(g.display_name),lower(coalesce(p_search,'')))>0
    order by g.id limit 30;
$$;

create function spotme_private.suggest_gym(p_actor uuid,p_city bigint,p_name text,p_address text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare suggestion_id uuid;
begin
    perform 1 from spotme_private.profiles p where p.user_id=p_actor and p.status in ('onboarding','active','paused')
        and p.date_of_birth <= (timezone('America/Toronto',now())::date - interval '18 years')::date for update;
    if not found then raise exception using errcode='42501',message='Profile unavailable'; end if;
    select s.id into suggestion_id from spotme_private.gym_suggestions s where s.submitter_id=p_actor
        and s.city_id=p_city and lower(s.proposed_name)=lower(btrim(p_name))
        and lower(s.proposed_address)=lower(btrim(p_address)) and s.review_status='pending' limit 1;
    if found then return suggestion_id; end if;
    if (select count(*) from spotme_private.gym_suggestions s where s.submitter_id=p_actor
        and s.created_at>=now()-interval '1 day')>=5 then
        raise exception using errcode='P0001',message='Daily suggestion limit reached';
    end if;
    insert into spotme_private.gym_suggestions(submitter_id,city_id,proposed_name,proposed_address)
        values(p_actor,p_city,btrim(p_name),btrim(p_address)) returning id into suggestion_id;
    return suggestion_id;
end;
$$;

-- Matching requires reciprocal preferences and staff approval for both profiles.
-- The beta pool is the member's municipality. No gym or weekday data affects eligibility.
create function spotme_private.discovery_compatible(a spotme_private.profiles,b spotme_private.profiles)
returns boolean language sql stable set search_path = '' as $$
    select coalesce(a.user_id<>b.user_id and a.status='active' and b.status='active'
        and a.discovery_approved_at is not null and b.discovery_approved_at is not null
        and a.city_id=b.city_id and a.gender=any(b.seeking) and b.gender=any(a.seeking)
        and extract(year from age(timezone('America/Toronto',now())::date,a.date_of_birth)) between b.minimum_age and b.maximum_age
        and extract(year from age(timezone('America/Toronto',now())::date,b.date_of_birth)) between a.minimum_age and a.maximum_age,false);
$$;

create function spotme_private.discovery_cards(p_actor uuid,p_after uuid)
returns setof jsonb language sql stable security definer set search_path = '' as $$
    select jsonb_build_object('id',b.user_id,'name',b.display_name,'city',c.name,'bio',b.bio,
        'age',extract(year from age(timezone('America/Toronto',now())::date,b.date_of_birth)),
        'intent',b.relationship_intent,'split',b.workout_split,'frequency',b.workout_frequency,
        'days',case when b.training_days_audience='discovery' then to_jsonb(b.training_days) else '[]'::jsonb end,
        'gyms',coalesce((select jsonb_agg(g.display_name order by g.display_name,g.id)
            from spotme_private.profile_gyms link join spotme_private.gyms g on g.id=link.gym_id
            where link.user_id=b.user_id and link.audience='discovery' and g.listing_status='approved'),'[]'::jsonb))
    from spotme_private.profiles a join spotme_private.profiles b on b.city_id=a.city_id
    join spotme_private.cities c on c.id=b.city_id
    left join spotme_private.member_pairs pair on pair.member_low=least(a.user_id,b.user_id) and pair.member_high=greatest(a.user_id,b.user_id)
    where a.user_id=p_actor and spotme_private.discovery_compatible(a,b)
        and pair.closed_at is null and pair.matched_at is null
        and (case when a.user_id=pair.member_low then pair.low_decision else pair.high_decision end) is null
        and (p_after is null or b.user_id>p_after)
    order by b.user_id limit 20;
$$;

create function spotme_private.discovery_swipe(p_actor uuid,p_peer uuid,p_decision text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
    actor spotme_private.profiles%rowtype;
    peer spotme_private.profiles%rowtype;
    recent_count integer;
begin
    perform pg_advisory_xact_lock(hashtextextended('spotme-discovery:' || p_actor::text,0));
    perform spotme_private.lock_pair_members(p_actor,p_peer,'swipe');
    select * into actor from spotme_private.profiles where user_id=p_actor;
    select * into peer from spotme_private.profiles where user_id=p_peer;
    if not spotme_private.discovery_compatible(actor,peer) then
        raise exception using errcode='42501',message='Member pair unavailable';
    end if;
    if exists(select 1 from spotme_private.discovery_decisions d where d.actor_id=p_actor and d.peer_id=p_peer) then
        return spotme_private.record_swipe(p_actor,p_peer,p_decision);
    end if;
    select count(*) into recent_count from spotme_private.discovery_decisions d
        where d.actor_id=p_actor and d.created_at>=now()-interval '1 hour';
    if recent_count>=100 then raise exception using errcode='P0001',message='Swipe limit reached'; end if;
    insert into spotme_private.discovery_decisions(actor_id,peer_id) values(p_actor,p_peer);
    return spotme_private.record_swipe(p_actor,p_peer,p_decision);
end;
$$;

create table spotme_private.discovery_decisions (
    actor_id uuid not null references spotme_private.profiles(user_id) on delete cascade,
    peer_id uuid not null references spotme_private.profiles(user_id) on delete cascade,
    created_at timestamptz not null default now(), primary key (actor_id,peer_id)
);
create index discovery_decisions_rate on spotme_private.discovery_decisions(actor_id,created_at);
alter table spotme_private.discovery_decisions enable row level security;
revoke all on spotme_private.discovery_decisions from public,anon,authenticated,spotme_chat_api;

revoke execute on function spotme_private.read_profile(uuid),spotme_private.save_profile(uuid,jsonb),
    spotme_private.directory_cities(),spotme_private.directory_gyms(bigint,text,uuid),
    spotme_private.suggest_gym(uuid,bigint,text,text),spotme_private.discovery_cards(uuid,uuid),
    spotme_private.discovery_swipe(uuid,uuid,text),spotme_private.discovery_compatible(spotme_private.profiles,spotme_private.profiles)
    from public,anon,authenticated;
grant execute on function spotme_private.read_profile(uuid),spotme_private.save_profile(uuid,jsonb),
    spotme_private.directory_cities(),spotme_private.directory_gyms(bigint,text,uuid),
    spotme_private.suggest_gym(uuid,bigint,text,text),spotme_private.discovery_cards(uuid,uuid),
    spotme_private.discovery_swipe(uuid,uuid,text) to spotme_chat_api;

commit;

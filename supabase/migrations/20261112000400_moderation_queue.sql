begin;

create table spotme_private.member_reports (
    id uuid primary key default gen_random_uuid(),
    reporter_id uuid not null references spotme_private.profiles(user_id) on delete cascade,
    subject_id uuid not null references spotme_private.profiles(user_id) on delete cascade,
    client_report_id uuid not null,
    reason text not null check(reason in ('harassment','impersonation','underage','spam','other')),
    details text not null default '' check(char_length(details)<=500),
    created_at timestamptz not null default now(),
    reviewed_at timestamptz,
    check(reporter_id<>subject_id),
    unique(reporter_id,client_report_id)
);
create index member_reports_queue on spotme_private.member_reports(created_at,id) where reviewed_at is null;
create index member_reports_rate on spotme_private.member_reports(reporter_id,created_at);
alter table spotme_private.member_reports enable row level security;
revoke all on spotme_private.member_reports from public,anon,authenticated,spotme_chat_api;
grant select,insert,update,delete on spotme_private.member_reports to service_role;

create function spotme_private.submit_report(p_actor uuid,p_peer uuid,p_request uuid,p_reason text,p_details text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
    prior spotme_private.member_reports%rowtype;
    result uuid;
begin
    if p_actor is null or p_peer is null or p_actor=p_peer or p_request is null then
        raise exception using errcode='22023',message='Invalid report';
    end if;
    perform pg_advisory_xact_lock(hashtextextended('spotme-report:'||p_actor::text,0));
    perform 1 from spotme_private.profiles p where p.user_id=p_actor
        and p.status in ('active','paused') and p.date_of_birth <= (timezone('America/Toronto',now())::date - interval '18 years')::date for share;
    if not found then raise exception using errcode='42501',message='Report unavailable'; end if;
    select * into prior from spotme_private.member_reports r where r.reporter_id=p_actor and r.client_report_id=p_request;
    if found then
        if (prior.subject_id,prior.reason,prior.details) is distinct from (p_peer,p_reason,p_details) then
            raise exception using errcode='22023',message='Report retry does not match';
        end if;
        return prior.id;
    end if;
    if not exists(select 1 from spotme_private.member_pairs pair
        where pair.member_low=least(p_actor,p_peer) and pair.member_high=greatest(p_actor,p_peer)
          and (pair.matched_at is not null or (case when p_actor=pair.member_low then pair.low_decision else pair.high_decision end) is not null))
       and not exists(select 1 from spotme_private.profiles a join spotme_private.profiles b on b.user_id=p_peer
          where a.user_id=p_actor and spotme_private.discovery_compatible(a,b)
          and not exists(select 1 from spotme_private.member_pairs pair where pair.member_low=least(p_actor,p_peer)
              and pair.member_high=greatest(p_actor,p_peer) and pair.closed_at is not null)) then
        raise exception using errcode='42501',message='Report unavailable';
    end if;
    if (select count(*) from spotme_private.member_reports r where r.reporter_id=p_actor
        and r.created_at>=now()-interval '1 day')>=10 then
        raise exception using errcode='P0001',message='Daily report limit reached';
    end if;
    insert into spotme_private.member_reports(reporter_id,subject_id,client_report_id,reason,details)
        values(p_actor,p_peer,p_request,p_reason,p_details) returning id into result;
    return result;
end;
$$;
revoke execute on function spotme_private.submit_report(uuid,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function spotme_private.submit_report(uuid,uuid,uuid,text,text) to spotme_chat_api;

-- Approval attaches a suggestion to an already approved listing. Staff validate and
-- create or merge the canonical listing separately, with provenance, before linking.
create function spotme_private.resolve_gym_suggestion(p_id uuid,p_gym uuid)
returns boolean language plpgsql security invoker set search_path = '' as $$
begin
    if p_gym is not null then
        perform 1 from spotme_private.gyms g join spotme_private.gym_suggestions s on s.city_id=g.city_id
            where s.id=p_id and g.id=p_gym and g.listing_status='approved' for share of g;
        if not found then raise exception using errcode='22023',message='Approved listing in the same city required'; end if;
    end if;
    update spotme_private.gym_suggestions set resolved_gym_id=p_gym,
        review_status=case when p_gym is null then 'rejected'::spotme_private.review_status else 'approved'::spotme_private.review_status end
        where id=p_id and review_status='pending';
    return found;
end;
$$;
revoke execute on function spotme_private.resolve_gym_suggestion(uuid,uuid) from public,anon,authenticated,spotme_chat_api;
grant execute on function spotme_private.resolve_gym_suggestion(uuid,uuid) to service_role;

commit;

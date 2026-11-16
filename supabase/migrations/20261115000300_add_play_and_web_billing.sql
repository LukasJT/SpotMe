begin;

create role spotme_external_billing nologin;
grant usage on schema spotme_private to spotme_external_billing;
grant execute on function spotme_private.next_apple_sync_ticket() to spotme_external_billing;

create table spotme_private.external_subscriptions (
    provider text not null check (provider in ('stripe','play')),
    environment text not null check (environment in ('Production','Sandbox')),
    external_id text not null check (length(external_id) between 1 and 128),
    user_id uuid not null references auth.users(id) on delete cascade,
    active_until timestamptz,
    replaced boolean not null default false,
    sync_ticket bigint not null check (sync_ticket > 0),
    primary key (provider,environment,external_id)
);
create index external_subscriptions_by_user on spotme_private.external_subscriptions(user_id,environment,active_until);
alter table spotme_private.external_subscriptions enable row level security;
revoke all on spotme_private.external_subscriptions from public,anon,authenticated,spotme_chat_api,spotme_external_billing;

create table spotme_private.stripe_customers (
    user_id uuid not null references auth.users(id) on delete cascade,
    environment text not null check (environment in ('Production','Sandbox')),
    customer_id text not null check (customer_id ~ '^cus_[a-zA-Z0-9]+$'),
    primary key (environment,user_id),
    unique (environment,customer_id)
);
alter table spotme_private.stripe_customers enable row level security;
revoke all on spotme_private.stripe_customers from public,anon,authenticated,spotme_chat_api,spotme_external_billing;

create function spotme_private.lock_stripe_checkout(p_environment text,p_actor uuid)
returns void language sql security definer set search_path = '' as $$
    select pg_advisory_xact_lock(hashtextextended('spotme-stripe:'||p_environment||':'||p_actor::text,0))
$$;

create function spotme_private.stripe_customer(p_environment text,p_actor uuid)
returns text language sql stable security definer set search_path = '' as $$
    select customer_id from spotme_private.stripe_customers where environment=p_environment and user_id=p_actor
$$;

create function spotme_private.stripe_customer_owner(p_environment text,p_customer text)
returns uuid language sql stable security definer set search_path = '' as $$
    select user_id from spotme_private.stripe_customers where environment=p_environment and customer_id=p_customer
$$;

create function spotme_private.save_stripe_customer(p_environment text,p_actor uuid,p_customer text)
returns text language sql security definer set search_path = '' as $$
    insert into spotme_private.stripe_customers (environment,user_id,customer_id) values (p_environment,p_actor,p_customer)
    on conflict (environment,user_id) do update set customer_id=spotme_private.stripe_customers.customer_id
    returning customer_id
$$;

create function spotme_private.external_subscription_owner(p_provider text,p_environment text,p_external text)
returns uuid language sql stable security definer set search_path = '' as $$
    select user_id from spotme_private.external_subscriptions
    where provider=p_provider and environment=p_environment and external_id=p_external
$$;

create function spotme_private.record_external_subscription(
    p_provider text,p_environment text,p_external text,p_actor uuid,
    p_active_until timestamptz,p_ticket bigint,p_replaced text
) returns void language plpgsql security definer set search_path = '' as $$
begin
    insert into spotme_private.external_subscriptions as existing
        (provider,environment,external_id,user_id,active_until,sync_ticket)
    values (p_provider,p_environment,p_external,p_actor,p_active_until,p_ticket)
    on conflict (provider,environment,external_id) do update set
        active_until=case when existing.replaced then null else excluded.active_until end,sync_ticket=excluded.sync_ticket
    where existing.user_id=excluded.user_id and existing.sync_ticket<excluded.sync_ticket;

    if not exists (select 1 from spotme_private.external_subscriptions
        where provider=p_provider and environment=p_environment and external_id=p_external and user_id=p_actor) then
        raise exception using errcode='42501',message='Subscription belongs to a different account';
    end if;

    if p_provider='play' and p_replaced<>p_external and p_active_until>now() then
        insert into spotme_private.external_subscriptions as predecessor
            (provider,environment,external_id,user_id,active_until,sync_ticket,replaced)
        values (p_provider,p_environment,p_replaced,p_actor,null,p_ticket,true)
        on conflict (provider,environment,external_id) do update set
            active_until=null,replaced=true,sync_ticket=greatest(predecessor.sync_ticket,excluded.sync_ticket)
        where predecessor.user_id=excluded.user_id;
    end if;
end;
$$;

create or replace function spotme_private.has_premium(p_actor uuid, p_environment text)
returns boolean language sql stable security definer set search_path = '' as $$
    select exists (
        select 1 from spotme_private.premium_entitlements
        where user_id=p_actor and revoked_at is null and valid_until>now()
    ) or exists (
        select 1 from spotme_private.apple_subscriptions
        where user_id=p_actor and environment=p_environment and active_until>now()
    ) or exists (
        select 1 from spotme_private.external_subscriptions
        where user_id=p_actor and environment=p_environment and active_until>now()
    )
$$;

revoke execute on function spotme_private.lock_stripe_checkout(text,uuid),
    spotme_private.stripe_customer(text,uuid),spotme_private.stripe_customer_owner(text,text),
    spotme_private.save_stripe_customer(text,uuid,text),
    spotme_private.external_subscription_owner(text,text,text),
    spotme_private.record_external_subscription(text,text,text,uuid,timestamptz,bigint,text)
    from public,anon,authenticated,spotme_chat_api;
grant execute on function spotme_private.lock_stripe_checkout(text,uuid),
    spotme_private.stripe_customer(text,uuid),spotme_private.stripe_customer_owner(text,text),
    spotme_private.save_stripe_customer(text,uuid,text),
    spotme_private.external_subscription_owner(text,text,text),
    spotme_private.record_external_subscription(text,text,text,uuid,timestamptz,bigint,text),
    spotme_private.has_premium(uuid,text) to spotme_external_billing;

commit;

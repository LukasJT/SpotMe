-- Foundation for server-side profile and directory operations.
-- Deliberately outside the public Data API schema. No client access is granted.
begin;

create schema spotme_private;
revoke all on schema spotme_private from public, anon, authenticated;
grant usage on schema spotme_private to service_role;

create type spotme_private.profile_status as enum ('onboarding', 'active', 'paused', 'suspended', 'deletion_pending');
create type spotme_private.audience as enum ('private', 'matches', 'discovery');
create type spotme_private.review_status as enum ('pending', 'approved', 'rejected');

create table spotme_private.cities (
    id bigint generated always as identity primary key,
    province text not null check (province ~ '^[A-Z]{2}$'),
    municipality_code text not null check (btrim(municipality_code) <> ''),
    name text not null check (btrim(name) <> ''),
    unique (province, municipality_code)
);

create table spotme_private.profiles (
    user_id uuid primary key references auth.users (id) on delete cascade,
    date_of_birth date not null,
    display_name text not null check (char_length(btrim(display_name)) between 2 and 40),
    city_id bigint references spotme_private.cities (id),
    bio text not null default '' check (char_length(bio) <= 500),
    relationship_intent text not null default '' check (char_length(relationship_intent) <= 80),
    workout_split text not null default '' check (char_length(workout_split) <= 80),
    workout_frequency smallint check (workout_frequency between 0 and 7),
    training_days smallint[] not null default '{}' check (
        cardinality(training_days) <= 7 and array_position(training_days, null) is null
        and training_days <@ array[1,2,3,4,5,6,7]::smallint[]
    ),
    training_days_audience spotme_private.audience not null default 'private',
    status spotme_private.profile_status not null default 'onboarding',
    created_at timestamptz not null default now(),
    check (status <> 'active' or city_id is not null)
);

create table spotme_private.gyms (
    id uuid primary key default gen_random_uuid(),
    city_id bigint not null references spotme_private.cities (id),
    display_name text not null check (char_length(btrim(display_name)) between 1 and 160),
    street_address text not null check (char_length(btrim(street_address)) between 1 and 240),
    listing_status spotme_private.review_status not null default 'pending',
    created_at timestamptz not null default now()
);
create index gyms_approved_by_city on spotme_private.gyms (city_id, display_name, id) where listing_status = 'approved';

create table spotme_private.gym_sources (
    provider text not null check (btrim(provider) <> ''),
    provider_record_id text not null check (btrim(provider_record_id) <> ''),
    gym_id uuid not null references spotme_private.gyms (id),
    licence_reference text not null check (btrim(licence_reference) <> ''),
    source_url text,
    observed_at timestamptz not null,
    primary key (provider, provider_record_id)
);
create index gym_sources_by_gym on spotme_private.gym_sources (gym_id);

create table spotme_private.profile_gyms (
    user_id uuid not null references spotme_private.profiles (user_id) on delete cascade,
    gym_id uuid not null references spotme_private.gyms (id),
    audience spotme_private.audience not null default 'private',
    primary key (user_id, gym_id)
);
create index profile_gyms_by_gym on spotme_private.profile_gyms (gym_id);

create table spotme_private.gym_suggestions (
    id uuid primary key default gen_random_uuid(),
    submitter_id uuid not null references spotme_private.profiles (user_id) on delete cascade,
    city_id bigint not null references spotme_private.cities (id),
    proposed_name text not null check (char_length(btrim(proposed_name)) between 1 and 160),
    proposed_address text not null check (char_length(btrim(proposed_address)) between 1 and 240),
    review_status spotme_private.review_status not null default 'pending',
    resolved_gym_id uuid references spotme_private.gyms (id),
    created_at timestamptz not null default now(),
    check ((review_status = 'approved') = (resolved_gym_id is not null))
);
create index gym_suggestions_by_submitter on spotme_private.gym_suggestions (submitter_id, created_at desc);
create index gym_suggestions_review_queue on spotme_private.gym_suggestions (created_at, id) where review_status = 'pending';

alter table spotme_private.cities enable row level security;
alter table spotme_private.profiles enable row level security;
alter table spotme_private.gyms enable row level security;
alter table spotme_private.gym_sources enable row level security;
alter table spotme_private.profile_gyms enable row level security;
alter table spotme_private.gym_suggestions enable row level security;

revoke all on all tables in schema spotme_private from public, anon, authenticated;
revoke all on all sequences in schema spotme_private from public, anon, authenticated;
grant select, insert, update, delete on all tables in schema spotme_private to service_role;
grant usage, select on all sequences in schema spotme_private to service_role;

commit;

-- Run with psql against an isolated development database after applying migrations.
-- Requires two verified, disposable Supabase Auth account UUIDs.
-- No passwords or Auth records are created by this fixture.
\set ON_ERROR_STOP on
begin;
select set_config('spotme.fixture_alex', :'alex_id', true),
       set_config('spotme.fixture_maya', :'maya_id', true);

do $$
declare
    alex uuid := current_setting('spotme.fixture_alex')::uuid;
    maya uuid := current_setting('spotme.fixture_maya')::uuid;
    city bigint;
    gym uuid;
begin
    if alex = maya or (select count(*) from auth.users where id in (alex,maya) and email_confirmed_at is not null) <> 2 then
        raise exception 'Provide two distinct, confirmed test account IDs';
    end if;
    if exists(select 1 from spotme_private.profiles where user_id in (alex,maya)) then
        raise exception 'Test profiles already exist. Use fresh disposable accounts.';
    end if;
    insert into spotme_private.cities (province,municipality_code,name)
        values ('ON','spotme-fixture','Kitchener (sample)') returning id into city;
    insert into spotme_private.gyms (city_id,display_name,street_address,listing_status)
        values (city,'SpotMe Sample Training Club','Fictional address','approved') returning id into gym;
    insert into spotme_private.profiles (user_id,date_of_birth,display_name,city_id,bio,workout_split,
        workout_frequency,training_days,training_days_audience,status,gender,seeking,discovery_approved_at)
        values (alex,'1994-02-01','Alex',city,'Coffee after the gym?','Upper / lower',3,'{1,3,5}','discovery','active','man','{woman}',now()),
               (maya,'1995-04-01','Maya',city,'Always up for a long walk after training.','Full body',2,'{2,6}','private','active','woman','{man}',now());
    insert into spotme_private.profile_gyms (user_id,gym_id,audience)
        values (alex,gym,'discovery'),(maya,gym,'private');
end;
$$;
commit;

create table if not exists public.workspace_records (
  user_id uuid not null references auth.users (id) on delete cascade,
  record_type text not null check (record_type in (
    'event',
    'customer',
    'registration',
    'campaign',
    'activity',
    'settings',
    'workspace_meta',
    'chat_message'
  )),
  record_key text not null,
  data jsonb not null check (jsonb_typeof(data) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, record_type, record_key)
);

alter table public.workspace_records enable row level security;

drop policy if exists "Users can read their workspace records" on public.workspace_records;
create policy "Users can read their workspace records"
  on public.workspace_records for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert their workspace records" on public.workspace_records;
create policy "Users can insert their workspace records"
  on public.workspace_records for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their workspace records" on public.workspace_records;
create policy "Users can update their workspace records"
  on public.workspace_records for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their workspace records" on public.workspace_records;
create policy "Users can delete their workspace records"
  on public.workspace_records for delete to authenticated
  using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.workspace_records to authenticated;

create or replace function public.sync_workspace_records(operations jsonb)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  operation jsonb;
  current_user_id uuid := auth.uid();
  action text;
  target_type text;
  target_key text;
begin
  if current_user_id is null then
    raise exception 'You must be signed in to change workspace data.';
  end if;

  if jsonb_typeof(operations) <> 'array' then
    raise exception 'Workspace changes must be sent as an array.';
  end if;

  for operation in select value from jsonb_array_elements(operations)
  loop
    action := operation ->> 'operation';
    target_type := operation ->> 'record_type';
    target_key := operation ->> 'record_key';

    if action = 'delete' then
      delete from public.workspace_records
      where user_id = current_user_id
        and record_type = target_type
        and record_key = target_key;
    elsif action = 'upsert' then
      insert into public.workspace_records (user_id, record_type, record_key, data, updated_at)
      values (
        current_user_id,
        target_type,
        target_key,
        operation -> 'data',
        now()
      )
      on conflict (user_id, record_type, record_key)
      do update set data = excluded.data, updated_at = now()
      where workspace_records.user_id = current_user_id;
    else
      raise exception 'Unsupported workspace operation: %', action;
    end if;
  end loop;
end;
$$;

revoke all on function public.sync_workspace_records(jsonb) from public;
grant execute on function public.sync_workspace_records(jsonb) to authenticated;

create unique index if not exists workspace_records_published_event_slug
  on public.workspace_records (lower(data #>> '{page,slug}'))
  where record_type = 'event'
    and data #>> '{page,published}' = 'true'
    and coalesce(data #>> '{page,slug}', '') <> '';

create unique index if not exists workspace_records_customer_email
  on public.workspace_records (user_id, lower(data ->> 'email'))
  where record_type = 'customer'
    and coalesce(data ->> 'email', '') <> '';

create or replace function public.get_public_event_by_slug(slug_input text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  event_data jsonb;
  event_owner_id uuid;
  registration_count integer;
begin
  if slug_input is null or length(slug_input) > 100 then
    return null;
  end if;

  select records.data, records.user_id into event_data, event_owner_id
  from public.workspace_records as records
  where records.record_type = 'event'
    and records.data #>> '{page,published}' = 'true'
    and lower(records.data #>> '{page,slug}') = lower(trim(slug_input))
  limit 1;

  if event_data is null then
    return null;
  end if;

  select count(*)::integer into registration_count
  from public.workspace_records as registrations
  where registrations.record_type = 'registration'
    and registrations.user_id = event_owner_id
    and registrations.data ->> 'eventId' = event_data ->> 'id';

  return jsonb_build_object(
    'title', event_data ->> 'title',
    'date', event_data ->> 'date',
    'time', event_data ->> 'time',
    'description', event_data ->> 'description',
    'capacity', (event_data ->> 'capacity')::integer,
    'page', jsonb_build_object(
      'headline', event_data #>> '{page,headline}',
      'subheading', event_data #>> '{page,subheading}',
      'cta', event_data #>> '{page,cta}',
      'slug', event_data #>> '{page,slug}',
      'published', true
    ),
    'registered', registration_count,
    'seatsRemaining', greatest((event_data ->> 'capacity')::integer - registration_count, 0)
  );
end;
$$;

create or replace function public.register_public_event_attendee(
  slug_input text,
  name_input text,
  email_input text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  event_row public.workspace_records%rowtype;
  event_data jsonb;
  customer_data jsonb;
  customer_key text;
  customer_id text;
  registration_count integer;
  normalized_name text := trim(coalesce(name_input, ''));
  normalized_email text := lower(trim(coalesce(email_input, '')));
  new_registration_id text := 'registration-' || gen_random_uuid()::text;
  activity_id text := 'activity-' || gen_random_uuid()::text;
begin
  if slug_input is null or length(slug_input) > 100
    or length(normalized_name) < 1 or length(normalized_name) > 120
    or length(normalized_email) > 254
    or normalized_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]{2,}$' then
    raise exception using errcode = '22023', message = 'Enter a valid name and email address.';
  end if;

  select records.* into event_row
  from public.workspace_records as records
  where records.record_type = 'event'
    and records.data #>> '{page,published}' = 'true'
    and lower(records.data #>> '{page,slug}') = lower(trim(slug_input))
  limit 1
  for update;

  if event_row.user_id is null then
    raise exception using errcode = 'P0001', message = 'This event page is unavailable.';
  end if;
  event_data := event_row.data;

  if (event_data ->> 'date')::date < current_date then
    raise exception using errcode = 'P0001', message = 'Registration is closed because this event has already taken place.';
  end if;

  select count(*)::integer into registration_count
  from public.workspace_records as registrations
  where registrations.user_id = event_row.user_id
    and registrations.record_type = 'registration'
    and registrations.data ->> 'eventId' = event_data ->> 'id';
  if registration_count >= (event_data ->> 'capacity')::integer then
    raise exception using errcode = 'P0001', message = 'This event is full.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(event_row.user_id::text || normalized_email, 0));

  select customers.record_key, customers.data
  into customer_key, customer_data
  from public.workspace_records as customers
  where customers.user_id = event_row.user_id
    and customers.record_type = 'customer'
    and lower(customers.data ->> 'email') = normalized_email
  limit 1;

  if customer_data is null then
    customer_id := 'customer-' || gen_random_uuid()::text;
    customer_data := jsonb_build_object(
      'id', customer_id,
      'name', normalized_name,
      'email', normalized_email,
      'status', 'Lead',
      'source', 'Event registration',
      'isDemo', false
    );
    insert into public.workspace_records (user_id, record_type, record_key, data)
    values (event_row.user_id, 'customer', customer_id, customer_data);
  else
    customer_id := customer_data ->> 'id';
    if customer_data ->> 'isDemo' = 'true' then
      customer_data := customer_data || jsonb_build_object('isDemo', false);
      update public.workspace_records
      set data = customer_data, updated_at = now()
      where user_id = event_row.user_id
        and record_type = 'customer'
        and record_key = customer_key;
    end if;
  end if;

  if exists (
    select 1
    from public.workspace_records as registrations
    where registrations.user_id = event_row.user_id
      and registrations.record_type = 'registration'
      and registrations.data ->> 'eventId' = event_data ->> 'id'
      and registrations.data ->> 'customerId' = customer_id
  ) then
    raise exception using errcode = 'P0001', message = 'This email address is already registered for the event.';
  end if;

  insert into public.workspace_records (user_id, record_type, record_key, data)
  values (
    event_row.user_id,
    'registration',
    new_registration_id,
    jsonb_build_object(
      'id', new_registration_id,
      'customerId', customer_id,
      'eventId', event_data ->> 'id',
      'createdAt', (extract(epoch from clock_timestamp()) * 1000)::bigint,
      'isDemo', false
    )
  );

  insert into public.workspace_records (user_id, record_type, record_key, data)
  values (
    event_row.user_id,
    'activity',
    activity_id,
    jsonb_build_object(
      'id', activity_id,
      'type', 'Registration',
      'message', normalized_name || ' registered for ' || (event_data ->> 'title'),
      'status', 'Success',
      'createdAt', (extract(epoch from clock_timestamp()) * 1000)::bigint
    )
  );

  return jsonb_build_object(
    'registered', registration_count + 1,
    'seatsRemaining', greatest((event_data ->> 'capacity')::integer - registration_count - 1, 0)
  );
end;
$$;

revoke all on function public.get_public_event_by_slug(text) from public, anon, authenticated;
revoke all on function public.register_public_event_attendee(text, text, text) from public, anon, authenticated;
grant execute on function public.get_public_event_by_slug(text) to anon, authenticated;
grant execute on function public.register_public_event_attendee(text, text, text) to anon, authenticated;

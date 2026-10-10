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

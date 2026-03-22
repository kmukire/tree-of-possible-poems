create extension if not exists pgcrypto;

create table if not exists public.poems (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  first_line text not null,
  lines jsonb not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists poems_set_updated_at on public.poems;

create trigger poems_set_updated_at
before update on public.poems
for each row
execute function public.set_updated_at();

alter table public.poems enable row level security;

create policy "Users can read their own poems"
on public.poems
for select
to authenticated
using (auth.uid() = user_id);

create policy "Users can insert their own poems"
on public.poems
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Users can update their own poems"
on public.poems
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can delete their own poems"
on public.poems
for delete
to authenticated
using (auth.uid() = user_id);

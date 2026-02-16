create table gmail_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null unique,
  google_refresh_token text not null,
  google_email text,
  created_at timestamptz default now()
);
alter table gmail_connections enable row level security;
create policy "Users manage own gmail connection"
  on gmail_connections for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

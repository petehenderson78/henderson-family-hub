create table plaid_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  access_token text not null,
  item_id text not null unique,
  institution_name text,
  created_at timestamptz default now()
);
alter table plaid_items enable row level security;
create policy "Users manage own plaid items"
  on plaid_items for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

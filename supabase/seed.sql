-- Seed script to create family member accounts via Supabase Auth.
-- Run this against your Supabase project using the SQL Editor or supabase CLI.
-- NOTE: Replace passwords with secure values before running in production.

-- Create family member accounts
-- Supabase stores auth users in auth.users; we use the built-in function.
-- These must be run via the Supabase Dashboard SQL Editor (as superuser)
-- or via `supabase db reset` which runs migrations + seed.

SELECT supabase_auth.create_user(
  '{"email": "peter@henderson.family", "password": "changeme123!", "email_confirm": true}'
);

SELECT supabase_auth.create_user(
  '{"email": "nicole@henderson.family", "password": "changeme123!", "email_confirm": true}'
);

SELECT supabase_auth.create_user(
  '{"email": "cole@henderson.family", "password": "changeme123!", "email_confirm": true}'
);

SELECT supabase_auth.create_user(
  '{"email": "lily@henderson.family", "password": "changeme123!", "email_confirm": true}'
);

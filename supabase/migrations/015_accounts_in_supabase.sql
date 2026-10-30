-- Accounts are created, changed, deactivated and deleted in the Supabase dashboard only.
-- The app no longer has a way to change roles: users can edit their own profile text and colour, nothing else.

drop function if exists public.set_user_role(uuid, text);

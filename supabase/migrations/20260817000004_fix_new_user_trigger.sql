-- The handle_new_user() function existed but was never wired to a trigger on
-- auth.users, so no signup (email/password or Google OAuth) ever got a
-- profiles/user_roles row created. This is why onboarding appeared broken:
-- AuthContext's fetchProfile() always returned null for brand-new users.

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

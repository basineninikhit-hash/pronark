-- Hosted Supabase installs pgcrypto in extensions, while the existing
-- SECURITY DEFINER invitation functions used a public-only search path.
alter function public.issue_invitation() set search_path = public, extensions;
alter function public.redeem_invitation(text) set search_path = public, extensions;

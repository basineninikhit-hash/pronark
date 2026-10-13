-- A general category target is a floor, not an additional amount on top of wishlist items.
alter table public.categories add column general_target_cents integer not null default 0 check (general_target_cents >= 0);

create function public.save_category_target(p_category uuid, p_cents integer, p_expected_revision integer)
returns void language plpgsql security definer set search_path=public as $$
declare old public.categories%rowtype; updated public.categories%rowtype;
begin
 select * into old from public.categories where id=p_category for update;
 if old.id is null or old.owner_id<>auth.uid() then raise exception 'Category is read-only'; end if;
 if old.revision<>p_expected_revision then raise exception 'Category changed; refresh and try again'; end if;
 if p_cents is null or p_cents<0 or p_cents>100000000 then raise exception 'Invalid target'; end if;
 update public.categories set general_target_cents=p_cents,revision=revision+1 where id=p_category returning * into updated;
 perform app.audit_change(auth.uid(),'categories',p_category::text,to_jsonb(old),to_jsonb(updated));
end $$;

create function public.save_profile_name(p_name text, p_expected_revision integer)
returns void language plpgsql security definer set search_path=public as $$
declare old public.profiles%rowtype; updated public.profiles%rowtype;
begin
 select * into old from public.profiles where user_id=auth.uid() for update;
 if old.user_id is null or old.revision<>p_expected_revision then raise exception 'Profile changed; refresh and try again'; end if;
 if p_name is null or length(trim(p_name)) not between 1 and 100 then raise exception 'Enter a name up to 100 characters'; end if;
 update public.profiles set display_name=trim(p_name),revision=revision+1 where user_id=auth.uid() returning * into updated;
 perform app.audit_change(auth.uid(),'profiles',auth.uid()::text,to_jsonb(old),to_jsonb(updated));
end $$;

revoke execute on function public.save_category_target(uuid,integer,integer),public.save_profile_name(text,integer) from public,anon;
grant execute on function public.save_category_target(uuid,integer,integer),public.save_profile_name(text,integer) to authenticated;

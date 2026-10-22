-- Custom wish categories: people can add their own (up to 30), each with a picture icon. The
-- seven starter categories stay. A new category goes to the end of the user's order.

alter table public.categories drop constraint if exists categories_category_key_check;
alter table public.categories add constraint categories_category_key_check check(length(trim(category_key)) between 1 and 40 and category_key=trim(category_key));
alter table public.categories add column icon text check(icon is null or icon ~ '^[a-z][a-z-]{0,29}$');

create function public.create_wish_category(p_name text,p_icon text default null) returns uuid language plpgsql security definer set search_path=public as $$
declare v_name text:=trim(coalesce(p_name,''));v_id uuid;v_next integer;
begin
 if auth.uid() is null then raise exception 'Sign in required'; end if;
 if length(v_name) not between 1 and 40 then raise exception 'Give your category a name (up to 40 characters)'; end if;
 if p_icon is not null and p_icon !~ '^[a-z][a-z-]{0,29}$' then raise exception 'Choose an icon from the list'; end if;
 perform 1 from public.profiles where user_id=auth.uid() for update;
 if exists(select 1 from public.categories where owner_id=auth.uid() and lower(category_key)=lower(v_name)) then raise exception 'You already have a category with that name'; end if;
 if (select count(*) from public.categories where owner_id=auth.uid())>=30 then raise exception 'You can have up to 30 categories'; end if;
 -- Give the starter categories a fixed place first, so the new one lands at the end.
 update public.categories set priority_order=coalesce(array_position(array['Clothes','Tech','Jewelry','Home items','Experiences','Travel','Other'],category_key),8),revision=revision+1
  where owner_id=auth.uid() and priority_order is null;
 select coalesce(max(priority_order),0)+1 into v_next from public.categories where owner_id=auth.uid();
 insert into public.categories(owner_id,category_key,priority_order,icon) values(auth.uid(),v_name,v_next,p_icon) returning id into v_id;
 perform app.audit_change(auth.uid(),'categories',v_id::text,null,(select to_jsonb(c) from public.categories c where c.id=v_id));
 return v_id;
end $$;

revoke execute on function public.create_wish_category(text,text) from public,anon;
grant execute on function public.create_wish_category(text,text) to authenticated;

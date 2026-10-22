-- Wishlist: unassigning returns a category's dollars to Available (it never spends money or
-- changes the wallet balance), and wishlist items can carry a picture icon.

alter table public.allocation_events drop constraint if exists allocation_events_reason_check;
alter table public.allocation_events add constraint allocation_events_reason_check check(reason in ('fund','move','purchase','purchase_reversal','unassign'));

alter table public.wishlist_items add column icon text check(icon is null or icon ~ '^[a-z][a-z-]{0,29}$');

-- Unassign up to what the category holds. Dollars already set aside for specific items come
-- back last, newest item first, so item progress never exceeds the category's assigned total.
create function public.unassign_category(p_category uuid,p_cents integer) returns void language plpgsql security definer set search_path=public as $$
declare v_owner uuid;v_total integer;v_items integer;v_need integer;r record;v_take integer;v_old public.item_allocations%rowtype;v_new public.item_allocations%rowtype;v_event uuid;
begin
 if auth.uid() is null or p_cents is null or p_cents<=0 then raise exception 'Amount must be positive'; end if;
 perform 1 from public.profiles where user_id=auth.uid() for update;
 select owner_id into v_owner from public.categories where id=p_category for update;
 perform app.assert_owner(v_owner);
 select coalesce(sum(cents),0) into v_total from public.allocation_events where category_id=p_category;
 if p_cents>v_total then raise exception 'That is more than this category has assigned'; end if;
 select coalesce(sum(ia.cents),0) into v_items from public.item_allocations ia join public.wishlist_items w on w.id=ia.item_id where w.category_id=p_category and w.status='active';
 v_need:=p_cents-greatest(0,v_total-v_items);
 for r in select ia.item_id,ia.cents from public.item_allocations ia join public.wishlist_items w on w.id=ia.item_id
   where w.category_id=p_category and w.status='active' and ia.cents>0 order by w.created_at desc,w.id loop
  exit when v_need<=0;
  v_take:=least(v_need,r.cents);
  select * into v_old from public.item_allocations where item_id=r.item_id for update;
  update public.item_allocations set cents=cents-v_take,revision=revision+1 where item_id=r.item_id returning * into v_new;
  perform app.audit_change(v_owner,'item_allocations',r.item_id::text,to_jsonb(v_old),to_jsonb(v_new));
  v_need:=v_need-v_take;
 end loop;
 v_event:=gen_random_uuid();
 insert into public.allocation_events(id,owner_id,category_id,cents,reason) values(v_event,v_owner,p_category,-p_cents,'unassign');
 perform app.audit_change(v_owner,'allocation_events',v_event::text,null,jsonb_build_object('id',v_event,'category_id',p_category,'cents',-p_cents,'reason','unassign','revision',1));
end $$;

-- The picture shown for an item (a name from the app's icon set, or null for the category's).
create function public.set_wishlist_item_icon(p_item uuid,p_icon text) returns void language plpgsql security definer set search_path=public as $$
declare v_old public.wishlist_items%rowtype;v_new public.wishlist_items%rowtype;
begin
 select * into v_old from public.wishlist_items where id=p_item for update;
 if v_old.id is null or v_old.owner_id is distinct from auth.uid() then raise exception 'Item not found'; end if;
 if p_icon is not null and p_icon !~ '^[a-z][a-z-]{0,29}$' then raise exception 'Choose an icon from the list'; end if;
 update public.wishlist_items set icon=p_icon,revision=revision+1 where id=p_item returning * into v_new;
 perform app.audit_change(auth.uid(),'wishlist_items',p_item::text,to_jsonb(v_old),to_jsonb(v_new));
end $$;

revoke execute on function public.unassign_category(uuid,integer),public.set_wishlist_item_icon(uuid,text) from public,anon;
grant execute on function public.unassign_category(uuid,integer),public.set_wishlist_item_icon(uuid,text) to authenticated;

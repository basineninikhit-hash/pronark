-- Rewards: item assignments are a subset of category assignments, never extra wallet money.
comment on column public.categories.general_target_cents is 'Add this amount to the estimated cost of active wishlist items for the displayed category target.';
create table public.item_allocations (
 item_id uuid primary key references public.wishlist_items(id),
 owner_id uuid not null references public.profiles(user_id),
 cents integer not null default 0 check (cents >= 0),
 revision integer not null default 1
);
create table public.purchase_allocation_effects (
 purchase_id uuid primary key references public.purchases(id),
 owner_id uuid not null references public.profiles(user_id),
 item_id uuid not null references public.wishlist_items(id),
 category_id uuid not null references public.categories(id),
 item_before_cents integer not null check (item_before_cents >= 0),
 category_budget_cents integer not null check (category_budget_cents >= 0),
 category_spent_cents integer not null check (category_spent_cents >= 0),
 revision integer not null default 1
);
-- Earlier linked purchases had category-only assignments. Preserve their reversal path.
insert into public.purchase_allocation_effects(purchase_id,owner_id,item_id,category_id,item_before_cents,category_budget_cents,category_spent_cents)
select p.id,p.owner_id,w.id,w.category_id,0,
       greatest(0,-coalesce(sum(a.cents) filter (where a.reason='purchase'),0)),
       greatest(0,-coalesce(sum(a.cents) filter (where a.reason='purchase'),0))
from public.purchases p join public.wishlist_items w on w.id=p.linked_wishlist_id
left join public.allocation_events a on a.purchase_id=p.id
where p.deleted_at is null group by p.id,p.owner_id,w.id,w.category_id;
insert into public.audit_events(actor_id,owner_id,entity,entity_id,before_value,after_value)
select e.owner_id,e.owner_id,'purchase_allocation_effects',e.purchase_id::text,null,to_jsonb(e)
from public.purchase_allocation_effects e;
insert into public.sheet_jobs(entity,record_id,revision)
select 'purchase_allocation_effects',e.purchase_id::text,e.revision from public.purchase_allocation_effects e
on conflict do nothing;
alter table public.item_allocations enable row level security;
alter table public.purchase_allocation_effects enable row level security;
create policy read_item_allocations on public.item_allocations for select to authenticated using (app.same_group(auth.uid(),owner_id));
create policy read_purchase_allocation_effects on public.purchase_allocation_effects for select to authenticated using (app.same_group(auth.uid(),owner_id));
revoke all on public.item_allocations,public.purchase_allocation_effects from anon,authenticated;
grant select on public.item_allocations,public.purchase_allocation_effects to authenticated;

create function public.assign_item(p_item uuid,p_cents integer,p_source text default 'wallet')
returns void language plpgsql security definer set search_path=public as $$
declare item public.wishlist_items%rowtype; old public.item_allocations%rowtype; updated public.item_allocations%rowtype; category_total integer; item_total integer; event_id uuid;
begin
 if auth.uid() is null or p_cents is null or p_cents<=0 or p_source not in ('wallet','category') then raise exception 'Invalid item assignment'; end if;
 perform 1 from public.profiles where user_id=auth.uid() for update;
 select * into item from public.wishlist_items where id=p_item for update;
 if item.id is null or item.owner_id<>auth.uid() or item.status<>'active' then raise exception 'Item is unavailable'; end if;
 select coalesce(sum(cents),0) into category_total from public.allocation_events where category_id=item.category_id;
 select coalesce(sum(ia.cents),0) into item_total from public.item_allocations ia join public.wishlist_items w on w.id=ia.item_id where w.category_id=item.category_id and w.status='active';
 if p_source='wallet' then
   if app.wallet_cents(auth.uid())-app.allocated_cents(auth.uid())<p_cents then raise exception 'Not enough unassigned wallet balance'; end if;
   event_id:=gen_random_uuid();
   insert into public.allocation_events(id,owner_id,category_id,cents,reason) values(event_id,auth.uid(),item.category_id,p_cents,'fund');
   perform app.audit_change(auth.uid(),'allocation_events',event_id::text,null,jsonb_build_object('id',event_id,'category_id',item.category_id,'cents',p_cents,'reason','fund','revision',1));
 elsif category_total-item_total<p_cents then raise exception 'Not enough unassigned category savings'; end if;
 select * into old from public.item_allocations where item_id=p_item for update;
 insert into public.item_allocations(item_id,owner_id,cents) values(p_item,auth.uid(),p_cents)
 on conflict(item_id) do update set cents=public.item_allocations.cents+excluded.cents,revision=public.item_allocations.revision+1
 returning * into updated;
 perform app.audit_change(auth.uid(),'item_allocations',p_item::text,case when old.item_id is null then null else to_jsonb(old) end,to_jsonb(updated));
end $$;

create function public.release_item_savings(p_item uuid,p_cents integer)
returns void language plpgsql security definer set search_path=public as $$
declare item public.wishlist_items%rowtype; old public.item_allocations%rowtype; updated public.item_allocations%rowtype;
begin
 if auth.uid() is null or p_cents is null or p_cents<=0 then raise exception 'Invalid amount'; end if;
 perform 1 from public.profiles where user_id=auth.uid() for update;
 select * into item from public.wishlist_items where id=p_item for update;
 if item.id is null or item.owner_id<>auth.uid() or item.status<>'active' then raise exception 'Item is unavailable'; end if;
 select * into old from public.item_allocations where item_id=p_item for update;
 if old.item_id is null or old.cents<p_cents then raise exception 'Not enough item savings'; end if;
 update public.item_allocations set cents=cents-p_cents,revision=revision+1 where item_id=p_item returning * into updated;
 perform app.audit_change(auth.uid(),'item_allocations',p_item::text,to_jsonb(old),to_jsonb(updated));
end $$;

create or replace function public.fund_category(p_category uuid,p_cents integer,p_move_from uuid default null)
returns void language plpgsql security definer set search_path=public as $$
declare owner uuid; move uuid:=gen_random_uuid(); source_total integer; source_items integer; event_id uuid;
begin
 if auth.uid() is null or p_cents is null or p_cents<=0 then raise exception 'Amount must be positive'; end if;
 perform 1 from public.profiles where user_id=auth.uid() for update;
 select owner_id into owner from public.categories where id=p_category for update;
 perform app.assert_owner(owner);
 if p_move_from is null then
   if app.wallet_cents(owner)-app.allocated_cents(owner)<p_cents then raise exception 'Not enough unassigned balance'; end if;
 else
   if p_move_from=p_category then raise exception 'Choose a different category'; end if;
   perform app.assert_owner((select owner_id from public.categories where id=p_move_from));
   select coalesce(sum(cents),0) into source_total from public.allocation_events where category_id=p_move_from;
   select coalesce(sum(ia.cents),0) into source_items from public.item_allocations ia join public.wishlist_items w on w.id=ia.item_id where w.category_id=p_move_from and w.status='active';
   if source_total-source_items<p_cents then raise exception 'Not enough movable category savings'; end if;
   event_id:=gen_random_uuid();
   insert into public.allocation_events(id,owner_id,category_id,cents,reason,move_id) values(event_id,owner,p_move_from,-p_cents,'move',move);
   perform app.audit_change(owner,'allocation_events',event_id::text,null,jsonb_build_object('id',event_id,'category_id',p_move_from,'cents',-p_cents,'reason','move','revision',1));
 end if;
 event_id:=gen_random_uuid();
 insert into public.allocation_events(id,owner_id,category_id,cents,reason,move_id) values(event_id,owner,p_category,p_cents,case when p_move_from is null then 'fund' else 'move' end,move);
 perform app.audit_change(owner,'allocation_events',event_id::text,null,jsonb_build_object('id',event_id,'category_id',p_category,'cents',p_cents,'revision',1));
end $$;

-- Keep a funded item in its original category until savings are released or it is bought.
create function app.keep_funded_item_category() returns trigger language plpgsql set search_path=public as $$
begin
 if new.category_id<>old.category_id and coalesce((select cents from public.item_allocations where item_id=old.id),0)>0 then
   raise exception 'Release item savings before moving categories';
 end if;
 return new;
end $$;
create trigger keep_funded_item_category before update of category_id on public.wishlist_items for each row execute function app.keep_funded_item_category();

-- Replaced by the historical wallet reconciliation in the next migration.
create function app.reconcile_wallet_change(p_owner uuid,p_from date)
returns void language plpgsql security definer set search_path=public as $$
begin
 if p_owner<>auth.uid() then raise exception 'Read-only'; end if;
 perform public.reconcile_month(p_owner);
end $$;

create or replace function public.save_purchase(p_id uuid,p_title text,p_amount_cents integer,p_date date,p_note text default '',p_wishlist uuid default null,p_expected_revision integer default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare old public.purchases%rowtype; row public.purchases%rowtype; item public.wishlist_items%rowtype; effect public.purchase_allocation_effects%rowtype; item_before integer:=0; category_total integer:=0; other_items integer:=0; budget integer:=0; spent integer:=0; delta integer:=0; event_id uuid;
begin
 if auth.uid() is null or p_id is null or p_title is null or length(trim(p_title)) not between 1 and 200 or p_amount_cents is null or p_amount_cents<=0 or p_date is null or p_date>app.local_day() or p_note is null or length(p_note)>10000 then raise exception 'Invalid purchase'; end if;
 perform 1 from public.profiles where user_id=auth.uid() for update;
 select * into old from public.purchases where id=p_id for update;
 if old.id is not null and (old.owner_id<>auth.uid() or old.deleted_at is not null or old.revision<>p_expected_revision or old.linked_wishlist_id is distinct from p_wishlist) then raise exception 'Purchase changed or read-only'; end if;
 if p_wishlist is not null then
   select * into item from public.wishlist_items where id=p_wishlist for update;
   if item.id is null or item.owner_id<>auth.uid() or (old.id is null and item.status<>'active') or (old.id is not null and item.linked_purchase_id<>p_id) then raise exception 'Wishlist item is unavailable'; end if;
   if old.id is null then
     select coalesce(cents,0) into item_before from public.item_allocations where item_id=p_wishlist for update;
     item_before:=coalesce(item_before,0);
     if item_before<p_amount_cents and app.wallet_cents(auth.uid())>=p_amount_cents then
       raise exception 'Assign the full purchase amount to this item before buying. An early purchase is only recorded when it would make the in-app wallet negative.';
     end if;
   end if;
 end if;
 if old.id is null then
   insert into public.purchases(id,owner_id,title,amount_cents,purchase_date,note,linked_wishlist_id) values(p_id,auth.uid(),trim(p_title),p_amount_cents,p_date,p_note,p_wishlist) returning * into row;
 else
   update public.purchases set title=trim(p_title),amount_cents=p_amount_cents,purchase_date=p_date,note=p_note,revision=revision+1 where id=p_id returning * into row;
 end if;
 if p_wishlist is not null and old.id is null then
   select coalesce(cents,0) into item_before from public.item_allocations where item_id=p_wishlist for update;
   item_before:=coalesce(item_before,0);
   select coalesce(sum(cents),0) into category_total from public.allocation_events where category_id=item.category_id;
   select coalesce(sum(ia.cents),0) into other_items from public.item_allocations ia join public.wishlist_items w on w.id=ia.item_id where w.category_id=item.category_id and w.status='active' and w.id<>p_wishlist;
   budget:=greatest(0,category_total-other_items);
   spent:=least(p_amount_cents,budget);
   if item_before>0 then
     update public.item_allocations set cents=0,revision=revision+1 where item_id=p_wishlist;
     perform app.audit_change(auth.uid(),'item_allocations',p_wishlist::text,null,(select to_jsonb(x) from public.item_allocations x where item_id=p_wishlist));
   end if;
   update public.wishlist_items set status='purchased',linked_purchase_id=p_id,revision=revision+1 where id=p_wishlist;
   perform app.audit_change(auth.uid(),'wishlist_items',p_wishlist::text,to_jsonb(item),(select to_jsonb(x) from public.wishlist_items x where id=p_wishlist));
   insert into public.purchase_allocation_effects(purchase_id,owner_id,item_id,category_id,item_before_cents,category_budget_cents,category_spent_cents) values(p_id,auth.uid(),p_wishlist,item.category_id,item_before,budget,spent);
   perform app.audit_change(auth.uid(),'purchase_allocation_effects',p_id::text,null,(select to_jsonb(x) from public.purchase_allocation_effects x where purchase_id=p_id));
   if spent>0 then
     event_id:=gen_random_uuid();
     insert into public.allocation_events(id,owner_id,category_id,cents,reason,purchase_id) values(event_id,auth.uid(),item.category_id,-spent,'purchase',p_id);
     perform app.audit_change(auth.uid(),'allocation_events',event_id::text,null,jsonb_build_object('id',event_id,'category_id',item.category_id,'cents',-spent,'reason','purchase','revision',1));
   end if;
 elsif p_wishlist is not null and old.id is not null then
   select * into effect from public.purchase_allocation_effects where purchase_id=p_id for update;
   if effect.purchase_id is null then raise exception 'Purchase allocation history is missing'; end if;
   spent:=least(p_amount_cents,effect.category_budget_cents);
   delta:=spent-effect.category_spent_cents;
   if delta<>0 then
     event_id:=gen_random_uuid();
     insert into public.allocation_events(id,owner_id,category_id,cents,reason,purchase_id) values(event_id,auth.uid(),effect.category_id,-delta,'purchase',p_id);
     perform app.audit_change(auth.uid(),'allocation_events',event_id::text,null,jsonb_build_object('id',event_id,'category_id',effect.category_id,'cents',-delta,'reason','purchase','revision',1));
   end if;
   update public.purchase_allocation_effects set category_spent_cents=spent,revision=revision+1 where purchase_id=p_id;
   perform app.audit_change(auth.uid(),'purchase_allocation_effects',p_id::text,to_jsonb(effect),(select to_jsonb(x) from public.purchase_allocation_effects x where purchase_id=p_id));
 end if;
 perform app.audit_change(auth.uid(),'purchases',p_id::text,case when old.id is null then null else to_jsonb(old) end,to_jsonb(row));
 perform app.reconcile_wallet_change(auth.uid(),least(p_date,coalesce(old.purchase_date,p_date)));
 return p_id;
end $$;

create or replace function public.delete_purchase(p_id uuid,p_expected_revision integer)
returns void language plpgsql security definer set search_path=public as $$
declare old public.purchases%rowtype; item public.wishlist_items%rowtype; effect public.purchase_allocation_effects%rowtype; event_id uuid;
begin
 perform 1 from public.profiles where user_id=auth.uid() for update;
 select * into old from public.purchases where id=p_id for update;
 if old.id is null or old.owner_id<>auth.uid() or old.deleted_at is not null or old.revision<>p_expected_revision then raise exception 'Purchase changed or read-only'; end if;
 update public.purchases set deleted_at=now(),revision=revision+1 where id=p_id;
 if old.linked_wishlist_id is not null then
   select * into item from public.wishlist_items where id=old.linked_wishlist_id for update;
   select * into effect from public.purchase_allocation_effects where purchase_id=p_id for update;
   if effect.purchase_id is null then raise exception 'Purchase allocation history is missing'; end if;
   update public.wishlist_items set status='active',linked_purchase_id=null,revision=revision+1 where id=item.id;
   perform app.audit_change(auth.uid(),'wishlist_items',item.id::text,to_jsonb(item),(select to_jsonb(x) from public.wishlist_items x where id=item.id));
   if effect.item_before_cents>0 then
     update public.item_allocations set cents=cents+effect.item_before_cents,revision=revision+1 where item_id=item.id;
     perform app.audit_change(auth.uid(),'item_allocations',item.id::text,null,(select to_jsonb(x) from public.item_allocations x where item_id=item.id));
   end if;
   if effect.category_spent_cents>0 then
     event_id:=gen_random_uuid();
     insert into public.allocation_events(id,owner_id,category_id,cents,reason,purchase_id) values(event_id,auth.uid(),effect.category_id,effect.category_spent_cents,'purchase_reversal',p_id);
     perform app.audit_change(auth.uid(),'allocation_events',event_id::text,null,jsonb_build_object('id',event_id,'category_id',effect.category_id,'cents',effect.category_spent_cents,'reason','purchase_reversal','revision',1));
   end if;
 end if;
 perform app.audit_change(auth.uid(),'purchases',p_id::text,to_jsonb(old),(select to_jsonb(x) from public.purchases x where id=p_id));
 perform app.reconcile_wallet_change(auth.uid(),old.purchase_date);
end $$;

revoke execute on function public.assign_item(uuid,integer,text),public.release_item_savings(uuid,integer) from public,anon;
grant execute on function public.assign_item(uuid,integer,text),public.release_item_savings(uuid,integer) to authenticated;

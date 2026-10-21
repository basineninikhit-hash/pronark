-- "Delete my data and start over": wipes everything the signed-in member owns and
-- returns them to guided setup, while keeping their Google sign-in.
--
-- * The profile row stays (sign-in and the audit history reference it) but is blanked
--   and marked not set up, so the app reopens guided setup.
-- * The member leaves every group. A group they own passes to the member who joined
--   earliest; a group with nobody else in it is deleted.
-- * Google Sheets rows are never erased. The audit trail is kept and one
--   "account_reset" entry is queued so the mirror appends a row marking the reset.
create or replace function public.start_over(p_confirm text)
returns void language plpgsql security definer set search_path=public as $$
declare
  v_user uuid := auth.uid();
  v_group record;
  v_heir uuid;
  v_reset_id text;
begin
  if v_user is null then raise exception 'Sign in first'; end if;
  if p_confirm is distinct from 'DELETE' then raise exception 'Type DELETE to confirm starting over'; end if;
  perform 1 from profiles where user_id = v_user for update;

  -- Groups: hand off or remove the ones this member owns, then leave all of them.
  for v_group in select g.id from groups g join memberships m on m.group_id = g.id and m.user_id = v_user where g.owner_id = v_user loop
    select user_id into v_heir from memberships where group_id = v_group.id and user_id <> v_user order by joined_at, user_id limit 1;
    if v_heir is not null then
      update groups set owner_id = v_heir, revision = revision + 1 where id = v_group.id;
      update garden_plants set creator_id = v_heir where group_id = v_group.id and creator_id = v_user;
    else
      delete from invitations where group_id = v_group.id;
      delete from memberships where group_id = v_group.id;
      delete from groups where id = v_group.id; -- garden, sharing and opt-ins cascade
    end if;
  end loop;
  -- Plants this member started in groups owned by someone else stay with that group's owner.
  update garden_plants p set creator_id = g.owner_id from groups g where p.group_id = g.id and p.creator_id = v_user;
  delete from garden_visual_events where user_id = v_user;
  delete from garden_participants where user_id = v_user;
  delete from garden_cheers where from_user = v_user or to_user = v_user;
  delete from group_versus_optins where user_id = v_user;
  delete from invitations where created_by = v_user;
  delete from memberships where user_id = v_user; -- group_sharing and activity shares cascade

  -- Notifications, reports and reminders.
  delete from custom_reminder_jobs where owner_id = v_user;
  delete from reminder_rules where owner_id = v_user;
  delete from reminder_preferences where owner_id = v_user;
  delete from notification_jobs where owner_id = v_user;
  delete from notification_updates where owner_id = v_user;
  delete from notification_preferences where owner_id = v_user;
  delete from push_subscriptions where owner_id = v_user;
  delete from report_delivery_jobs where owner_id = v_user;
  delete from weekly_reports where owner_id = v_user;
  delete from report_preferences where owner_id = v_user;

  -- Private measurements and activity numbers.
  delete from private_metric_logs where owner_id = v_user;
  delete from private_metric_audit where owner_id = v_user;
  delete from private_metrics where owner_id = v_user;
  delete from activity_kpi_logs where owner_id = v_user;
  delete from activity_kpis where owner_id = v_user;

  -- Rewards: purchases and wishlist items point at each other, so unlink them first.
  delete from purchase_allocation_effects where owner_id = v_user;
  delete from allocation_events where owner_id = v_user;
  delete from item_allocations where owner_id = v_user;
  update wishlist_items set linked_purchase_id = null where owner_id = v_user and linked_purchase_id is not null;
  update purchases set linked_wishlist_id = null where owner_id = v_user and linked_wishlist_id is not null;
  delete from purchases where owner_id = v_user;
  delete from category_target_increments where owner_id = v_user;
  delete from category_target_plans where owner_id = v_user;
  delete from wishlist_items where owner_id = v_user;
  delete from categories where owner_id = v_user;
  delete from earnings where owner_id = v_user;

  -- Checklist and history.
  delete from completions where owner_id = v_user;
  delete from task_periods where owner_id = v_user;
  delete from checklist_presentation where owner_id = v_user;
  delete from task_month_settings where task_id in (select id from tasks where owner_id = v_user);
  delete from task_schedule_versions where task_id in (select id from tasks where owner_id = v_user);
  delete from tasks where owner_id = v_user;
  delete from template_versions where template_id in (select id from routine_templates where owner_id = v_user);
  delete from routine_templates where owner_id = v_user;

  -- Setup and preferences, then send the member back to guided setup.
  delete from onboarding_progress where owner_id = v_user;
  delete from experience_preferences where owner_id = v_user;
  update profiles set display_name = '', setup_completed_at = null, step_goal = null, water_quantity = null, water_unit = null, revision = revision + 1
    where user_id = v_user;

  -- Leave a marker in the audit trail; the Sheets mirror appends it as a new row.
  v_reset_id := v_user::text || ':' || to_char(clock_timestamp() at time zone 'UTC', 'YYYYMMDD"T"HH24MISS.US');
  perform app.audit_change(v_user, 'account_reset', v_reset_id, null, jsonb_build_object(
    'revision', 1, 'reset_at', clock_timestamp(),
    'note', 'Member deleted their Pronark data and started over. Earlier rows for this member are history and no longer in the app.'));
end $$;

revoke execute on function public.start_over(text) from public, anon;
grant execute on function public.start_over(text) to authenticated;

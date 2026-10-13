-- PostgreSQL grants EXECUTE on new functions to PUBLIC unless it is revoked.
-- Keep browser-facing RPCs available only to authenticated callers.
revoke execute on function public.create_group(), public.issue_invitation(),
  public.redeem_invitation(text),
  public.save_task(uuid,text,text,integer,integer[],integer),
  public.save_completion(uuid,date,boolean,integer),
  public.finish_setup(text,integer,numeric,text,jsonb),
  public.rebuild_task_month(uuid,date), public.reconcile_month(uuid),
  public.archive_task(uuid,integer),
  public.create_task(uuid,text,text,integer,integer[]),
  public.save_month_goals(integer,numeric,text) from public, anon;

grant execute on function public.create_group(), public.issue_invitation(),
  public.redeem_invitation(text),
  public.save_task(uuid,text,text,integer,integer[],integer),
  public.save_completion(uuid,date,boolean,integer),
  public.finish_setup(text,integer,numeric,text,jsonb),
  public.rebuild_task_month(uuid,date), public.reconcile_month(uuid),
  public.archive_task(uuid,integer),
  public.create_task(uuid,text,text,integer,integer[]),
  public.save_month_goals(integer,numeric,text) to authenticated;


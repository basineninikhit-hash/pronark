const fmt=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
const checked=async query=>{const {data,error}=await query;if(error)throw error;return data};
export function customWindow(now=new Date()){const p=Object.fromEntries(fmt.formatToParts(now).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));return {date:`${p.year}-${p.month}-${p.day}`,time:`${p.hour}:${p.minute}`}}
export function inQuietHours(time,start,end){const t=time.slice(0,5),s=start.slice(0,5),e=end.slice(0,5);return s===e?false:s<e?t>=s&&t<e:t>=s||t<e}
export function ruleIsDue({rule,task,settings,completion,date}){if(!rule.enabled)return false;if(!rule.task_id)return true;if(!task||date<task.start_date||(task.archive_date&&date>=task.archive_date))return false;const month=date.slice(0,7)+'-01';const setting=settings.filter(s=>s.task_id===task.id&&s.month<=month).sort((a,b)=>b.month.localeCompare(a.month))[0];if(!setting)return false;const day=new Date(`${date}T12:00:00Z`).getUTCDay()||7;return setting.weekdays.includes(day)&&!completion?.completed}
export async function runCustomReminders({db,send,now=new Date()}){
 const {date,time}=customWindow(now);const lower=`${time.slice(0,3)}${String(Math.floor(Number(time.slice(3))/15)*15).padStart(2,'0')}`;
 if(time!==lower)return {windowOpen:false,queued:0,sent:0,skipped:0,failed:0};
 const rules=await checked(db.from('reminder_rules').select('*').eq('enabled',true).eq('local_time',`${time}:00`));
 let queued=0,sent=0,skipped=0,failed=0;
 for(const rule of rules??[]){
  const owner=rule.owner_id;
  try{
   const [pref,pushPref,subs]=await Promise.all([
    checked(db.from('reminder_preferences').select('*').eq('owner_id',owner).single()),
    checked(db.from('notification_preferences').select('enabled').eq('owner_id',owner).maybeSingle()),
    checked(db.from('push_subscriptions').select('id,endpoint,keys_json').eq('owner_id',owner).eq('active',true)),
   ]);
   if(pref.mode!=='custom'||!pushPref?.enabled||!subs?.length||inQuietHours(time,pref.quiet_start,pref.quiet_end)){skipped++;continue}
   const sentToday=await checked(db.from('custom_reminder_jobs').select('id').eq('owner_id',owner).eq('local_date',date).eq('state','sent'));
   if(sentToday.length>=pref.max_per_day){skipped++;continue}
   const task=rule.task_id?await checked(db.from('tasks').select('id,start_date,archive_date').eq('id',rule.task_id).maybeSingle()):null;
   const settings=task?await checked(db.from('task_month_settings').select('task_id,month,weekdays').eq('task_id',task.id).lte('month',date.slice(0,7)+'-01')):[];
   const completion=task?await checked(db.from('completions').select('completed').eq('task_id',task.id).eq('local_date',date).maybeSingle()):null;
   if(!ruleIsDue({rule,task,settings,completion,date})){skipped++;continue}
   const created=await checked(db.from('custom_reminder_jobs').upsert({owner_id:owner,rule_id:rule.id,local_date:date},{onConflict:'owner_id,rule_id,local_date',ignoreDuplicates:true}).select('*').maybeSingle());
   const job=created??await checked(db.from('custom_reminder_jobs').select('*').eq('owner_id',owner).eq('rule_id',rule.id).eq('local_date',date).single());
   if(job.state==='sent'||job.state==='skipped'||job.attempts>=5||(job.state==='leased'&&job.lease_until>now.toISOString())){skipped++;continue}
   const lease=await checked(db.from('custom_reminder_jobs').update({state:'leased',attempts:job.attempts+1,lease_until:new Date(now.getTime()+120000).toISOString()}).eq('id',job.id).eq('state',job.state).eq('attempts',job.attempts).select('*').maybeSingle());
   if(!lease){skipped++;continue}queued++;
   try{
    const [freshPref,freshRule,freshPush]=await Promise.all([
     checked(db.from('reminder_preferences').select('mode,quiet_start,quiet_end,max_per_day').eq('owner_id',owner).single()),
     checked(db.from('reminder_rules').select('enabled,task_id').eq('id',rule.id).single()),
     checked(db.from('notification_preferences').select('enabled').eq('owner_id',owner).maybeSingle()),
    ]);
    const freshCompletion=task?await checked(db.from('completions').select('completed').eq('task_id',task.id).eq('local_date',date).maybeSingle()):null;
    const finalCount=await checked(db.from('custom_reminder_jobs').select('id').eq('owner_id',owner).eq('local_date',date).eq('state','sent'));
    if(freshPref.mode!=='custom'||!freshPush?.enabled||!freshRule.enabled||inQuietHours(time,freshPref.quiet_start,freshPref.quiet_end)||finalCount.length>=freshPref.max_per_day||!ruleIsDue({rule:freshRule,task,settings,completion:freshCompletion,date})){
     await checked(db.from('custom_reminder_jobs').update({state:'skipped',lease_until:null}).eq('id',lease.id));skipped++;continue;
    }
    const content={title:'Your Pronark reminder',body:task?'A scheduled activity is ready when you are.':'A gentle check-in with your goals.',url:task?`/?view=Home&activity=${task.id}`:'/?view=Home',tag:`pronark-custom-${rule.id}-${date}`};
    let delivered=0;for(const sub of subs){try{await send({endpoint:sub.endpoint,keys:sub.keys_json},content);delivered++}catch(error){if([404,410].includes(error?.statusCode))await checked(db.from('push_subscriptions').update({active:false}).eq('id',sub.id));else throw error}}
    if(!delivered)throw new Error('No active device accepted the reminder');
    await checked(db.from('custom_reminder_jobs').update({state:'sent',sent_at:now.toISOString(),lease_until:null,last_error:null}).eq('id',lease.id));sent++;
   }catch(error){await checked(db.from('custom_reminder_jobs').update({state:'failed',lease_until:null,last_error:String(error).slice(0,500)}).eq('id',lease.id));failed++}
  }catch{failed++}
 }
 return {windowOpen:true,queued,sent,skipped,failed};
}

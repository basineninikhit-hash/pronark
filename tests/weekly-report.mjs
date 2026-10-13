import assert from 'node:assert/strict';
import { renderWeeklyReport, sendWeeklySandboxReport } from '../supabase/functions/hnf-worker/weekly-report.mjs';
import { dueWeek, makeSnapshot, runWeeklyReports } from '../supabase/functions/hnf-worker/weekly-automation.mjs';

const snapshot = { weekStart: '2026-09-14', weekEnd: '2026-09-20', completed: 0, scheduled: 0, baseCents: 0, bonusCents: 0, habits: [] };
assert.match(renderWeeklyReport(snapshot), /No scheduled activities/);
assert.match(renderWeeklyReport({ ...snapshot, completed: 2, scheduled: 3, baseCents: 200, bonusCents: 40, habits: [{ title: '<Gym>', completed: 2, scheduled: 3 }] }), /&lt;Gym&gt;/);
let sends = 0;
const id = await sendWeeklySandboxReport({ apiKey: 'test-key', to: 'basineni.nikhit@gmail.com', snapshot, fetcher: async (_url, options) => { sends++; assert.equal(JSON.parse(options.body).from, 'onboarding@resend.dev'); return { ok: true, json: async () => ({ id: 'test-id' }) }; } });
assert.equal(id, 'test-id');
assert.equal(sends, 1);
await assert.rejects(sendWeeklySandboxReport({ apiKey: 'test-key', to: 'someone@example.com', snapshot, fetcher: () => { sends++; } }), /verified test recipient/);
assert.equal(sends, 1);
assert.deepEqual(dueWeek(new Date('2026-09-21T10:05:00Z')), { weekStart: '2026-09-14', weekEnd: '2026-09-20' });
assert.deepEqual(dueWeek(new Date('2026-09-21T11:05:00Z')), { weekStart: '2026-09-14', weekEnd: '2026-09-20' });
assert.deepEqual(dueWeek(new Date('2026-09-22T09:05:00Z')), { weekStart: '2026-09-14', weekEnd: '2026-09-20' });
assert.deepEqual(dueWeek(new Date('2026-03-09T10:05:00Z')), { weekStart: '2026-03-02', weekEnd: '2026-03-08' });
assert.equal(dueWeek(new Date('2026-03-09T09:05:00Z')), null);
assert.deepEqual(makeSnapshot({weekStart:'2026-09-14',weekEnd:'2026-09-20'},[
  {task_id:'a',title:'Gym',due:true,completed:true},
  {task_id:'a',title:'Gym',due:false,completed:false},
  {task_id:'a',title:'Gym',due:true,completed:false},
], [{kind:'base',cents:200,active:true},{kind:'bonus14',cents:40,active:true},{kind:'base',cents:100,active:false}]),
{weekStart:'2026-09-14',weekEnd:'2026-09-20',habits:[{title:'Gym',scheduled:2,completed:1}],scheduled:2,completed:1,baseCents:200,bonusCents:40});
assert.deepEqual(await runWeeklyReports({db:null,now:new Date('2026-09-21T09:00:00Z')}), {eligible:false,queued:0,sent:0});
let report, job, delivered = 0;
const fakeDb = {
  from(table) {
    let action = 'select', payload, single = false;
    const query = {
      select() { action = 'select'; return this; }, eq() { return this; }, gte() { return this; }, lte() { return this; },
      maybeSingle() { single = true; return this; }, single() { single = true; return this; },
      upsert(value) { action = 'upsert'; payload = value; return this; },
      update(value) { action = 'update'; payload = value; return this; },
      then(resolve, reject) {
        let data;
        if (action === 'upsert') {
          if (table === 'weekly_reports') report ??= {id:'report-1',snapshot:payload.snapshot,status:'generated'};
          if (table === 'report_delivery_jobs') job ??= {id:'job-1',state:'pending',recipient_email:payload.recipient_email,attempts:0};
          data = null;
        } else if (action === 'update') {
          Object.assign(table === 'weekly_reports' ? report : job, payload);
          data = null;
        } else if (table === 'report_preferences') data = single ? {enabled:true,verification_state:'verified',verified_email:'basineni.nikhit@gmail.com'} : [{owner_id:'owner-1',verified_email:'basineni.nikhit@gmail.com'}];
        else if (table === 'weekly_reports') data = report ?? null;
        else if (table === 'report_delivery_jobs') data = job ?? null;
        else if (table === 'weekly_insight_rows') data = [{task_id:'gym',title:'Gym',due:true,completed:true}];
        else if (table === 'earnings') data = [{kind:'base',cents:200,active:true}];
        Promise.resolve({data,error:null}).then(resolve,reject);
      },
    };
    return query;
  },
  async rpc() { if (job.state !== 'pending') return {data:null,error:null}; job.state='leased'; job.attempts++; return {data:{...job},error:null}; },
};
const monday = new Date('2026-09-21T10:05:00Z');
const deliver = async args => { delivered++; assert.equal(args.idempotencyKey,'hnf-weekly/job-1'); return 'provider-1'; };
assert.deepEqual(await runWeeklyReports({db:fakeDb,now:monday,apiKey:'test-key',send:deliver}), {eligible:true,queued:1,sent:1});
assert.equal(report.status,'sent');
assert.equal(job.provider_id,'provider-1');
assert.deepEqual(await runWeeklyReports({db:fakeDb,now:monday,apiKey:'test-key',send:deliver}), {eligible:true,queued:1,sent:0});
assert.equal(delivered,1);
await sendWeeklySandboxReport({apiKey:'test-key',to:'basineni.nikhit@gmail.com',snapshot,idempotencyKey:'hnf-weekly/test',fetcher:async(_url,options)=>{
  assert.equal(options.headers['Idempotency-Key'],'hnf-weekly/test');
  return {ok:true,json:async()=>({id:'test-id'})};
}});
console.log('PASS weekly report rendering and sandbox delivery guard');

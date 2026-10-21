// Jobs remain inactive until their individual ENABLE_* flags are set.
// The worker never reads secrets from the browser or mirrors push keys to Sheets.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SANDBOX_FROM, SANDBOX_RECIPIENT } from './email.mjs';
import { runWeeklyReports } from './weekly-automation.mjs';
import { runSheetMirror } from './sheet-mirror.mjs';
import { runPushNotifications } from './push-automation.mjs';
import { runCustomReminders } from './custom-reminders.mjs';
import { runRoutineReminders } from './routine-reminders.mjs';

const required = ['SUPABASE_URL','HNF_WORKER_TOKEN'];
Deno.serve(async request => {
  if (request.method !== 'POST') return new Response('Method not allowed',{status:405});
  const missing=required.filter(k=>!Deno.env.get(k));
  if(missing.length)return Response.json({ok:false,error:`Missing worker secrets: ${missing.join(', ')}`},{status:503});
  if (request.headers.get('X-HNF-Worker-Token') !== Deno.env.get('HNF_WORKER_TOKEN')) return new Response('Unauthorized',{status:401});
  // Hosted Supabase projects can expose the modern named server keys instead
  // of the legacy service-role variable. Never use a publishable key here.
  const namedKeys = Deno.env.get('SUPABASE_SECRET_KEYS');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? (namedKeys ? JSON.parse(namedKeys).default : undefined);
  if (!serviceKey) return Response.json({ok:false,error:'Missing server-side Supabase secret key'},{status:503});
  const db=createClient(Deno.env.get('SUPABASE_URL')!,serviceKey);
  if (new URL(request.url).searchParams.get('job') === 'goal-targets') {
    if (Deno.env.get('ENABLE_GOAL_TARGET_GROWTH') !== '1') return Response.json({ok:true,targetGrowthEnabled:false});
    const {data,error}=await db.rpc('apply_category_target_plans');
    if (error) return Response.json({ok:false,error:error.message},{status:500});
    return Response.json({ok:true,applied:data});
  }
  if (new URL(request.url).searchParams.get('job') === 'push-test') {
    if (Deno.env.get('ENABLE_PUSH_TEST') !== '1') return Response.json({ok:true,testEnabled:false});
    const publicKey=Deno.env.get('VAPID_PUBLIC_KEY'),privateKey=Deno.env.get('VAPID_PRIVATE_KEY'),subject=Deno.env.get('VAPID_SUBJECT');
    if (!publicKey||!privateKey||!subject) return Response.json({ok:false,error:'Missing VAPID configuration'},{status:503});
    const {data:subscriptions,error}=await db.from('push_subscriptions').select('endpoint,keys_json').eq('active',true).limit(2);
    if (error) return Response.json({ok:false,error:error.message},{status:500});
    if (subscriptions?.length!==1) return Response.json({ok:false,error:'Test requires exactly one active subscription'},{status:409});
    try {
      const webpush=(await import('npm:web-push@3.6.7')).default;
      await webpush.sendNotification({endpoint:subscriptions[0].endpoint,keys:subscriptions[0].keys_json},JSON.stringify({title:'HNF test notification',body:'Your iPhone push test reached the notification service.',url:'/',tag:'hnf-one-time-test'}),{vapidDetails:{subject,publicKey,privateKey},TTL:300});
      return Response.json({ok:true,acceptedByPushService:true});
    } catch (error) { return Response.json({ok:false,error:String(error)},{status:500}); }
  }
  if (new URL(request.url).searchParams.get('job') === 'push') {
    if (Deno.env.get('ENABLE_PUSH_DELIVERY') !== '1') return Response.json({ok:true,pushEnabled:false});
    const publicKey=Deno.env.get('VAPID_PUBLIC_KEY'),privateKey=Deno.env.get('VAPID_PRIVATE_KEY'),subject=Deno.env.get('VAPID_SUBJECT');
    if (!publicKey||!privateKey||!subject) return Response.json({ok:false,error:'Missing VAPID configuration'},{status:503});
    try {
      const webpush=(await import('npm:web-push@3.6.7')).default;
      const send=(subscription:unknown,content:unknown)=>webpush.sendNotification(subscription,JSON.stringify(content),{vapidDetails:{subject,publicKey,privateKey},TTL:3600});
      return Response.json({ok:true,...await runPushNotifications({db,send})});
    } catch (error) { return Response.json({ok:false,error:String(error)},{status:500}); }
  }
  if (new URL(request.url).searchParams.get('job') === 'custom-reminders') {
    if (Deno.env.get('ENABLE_CUSTOM_REMINDERS') !== '1') return Response.json({ok:true,customRemindersEnabled:false});
    const publicKey=Deno.env.get('VAPID_PUBLIC_KEY'),privateKey=Deno.env.get('VAPID_PRIVATE_KEY'),subject=Deno.env.get('VAPID_SUBJECT');
    if (!publicKey||!privateKey||!subject) return Response.json({ok:false,error:'Missing VAPID configuration'},{status:503});
    try {
      const webpush=(await import('npm:web-push@3.6.7')).default;
      const send=(subscription:unknown,content:unknown)=>webpush.sendNotification(subscription,JSON.stringify(content),{vapidDetails:{subject,publicKey,privateKey},TTL:900});
      return Response.json({ok:true,...await runCustomReminders({db,send})});
    } catch (error) { return Response.json({ok:false,error:String(error)},{status:500}); }
  }
  if (new URL(request.url).searchParams.get('job') === 'routine-reminders') {
    if (Deno.env.get('ENABLE_ROUTINE_REMINDERS') !== '1') return Response.json({ok:true,routineRemindersEnabled:false});
    const publicKey=Deno.env.get('VAPID_PUBLIC_KEY'),privateKey=Deno.env.get('VAPID_PRIVATE_KEY'),subject=Deno.env.get('VAPID_SUBJECT');
    if (!publicKey||!privateKey||!subject) return Response.json({ok:false,error:'Missing VAPID configuration'},{status:503});
    try {
      const webpush=(await import('npm:web-push@3.6.7')).default;
      const send=(subscription:unknown,content:unknown)=>webpush.sendNotification(subscription,JSON.stringify(content),{vapidDetails:{subject,publicKey,privateKey},TTL:900});
      return Response.json({ok:true,...await runRoutineReminders({db,send})});
    } catch (error) { return Response.json({ok:false,error:String(error)},{status:500}); }
  }
  if (new URL(request.url).searchParams.get('job') === 'sheets') {
    if (Deno.env.get('ENABLE_SHEET_MIRROR') !== '1') return Response.json({ok:true,mirrorEnabled:false});
    try {
      return Response.json({ok:true,...await runSheetMirror({db,service:JSON.parse(Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON') ?? ''),sheetId:Deno.env.get('GOOGLE_SHEET_ID') ?? '',limit:Number(Deno.env.get('HNF_SHEET_MIRROR_LIMIT') ?? 25)})});
    } catch (error) {
      return Response.json({ok:false,error:String(error)},{status:500});
    }
  }
  if (new URL(request.url).searchParams.get('job') === 'weekly') {
    if (Deno.env.get('ENABLE_REPORT_DELIVERY') !== '1') return Response.json({ok:true,deliveryEnabled:false});
    try {
      return Response.json({ok:true,...await runWeeklyReports({db,apiKey:Deno.env.get('RESEND_API_KEY')})});
    } catch (error) {
      return Response.json({ok:false,error:String(error)},{status:500});
    }
  }
  // Status-only endpoint; scheduled jobs use the explicit job routes above.
  const {data:jobs,error}=await db.from('sheet_jobs').select('*').in('state',['pending','error']).lte('next_attempt_at',new Date().toISOString()).limit(50);
  if(error)return Response.json({ok:false,error:error.message},{status:500});
  return Response.json({ok:true,leased:0,pending:jobs?.length??0,configured:{sheets:!!Deno.env.get('GOOGLE_SHEET_ID'),resend:!!Deno.env.get('RESEND_API_KEY'),vapid:!!Deno.env.get('VAPID_PRIVATE_KEY')},emailSandbox:{from:SANDBOX_FROM,recipient:SANDBOX_RECIPIENT}});
});

import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { CalendarCheck, Check, ChevronLeft, ChevronRight, Circle, Download, Flame, Lightbulb, Sparkles, Star, Target, TrendingUp, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Segmented } from '@/components/segmented';
import { EmptyState, SectionHeading, StatTile } from '@/components/pronark';
import { CompanionCharacter, type CharacterStyle } from '@/components/companion-character';
import { getMonthSummary } from '@/lib/month-summary';
import { prefersReducedMotion, project, rubberband, useSpring, VelocityTracker } from '@/lib/motion';

type Task = {id:string;owner_id:string;title:string;start_date:string;archive_date:string|null};
type Setting = {task_id:string;month:string;weekdays:number[]};
type Completion = {task_id:string;local_date:string;completed:boolean};
type Earning = {earned_date:string;cents:number;active:boolean};
type Kpi = {task_id:string;owner_id:string;target:number;unit:string};
type KpiLog = {task_id:string;owner_id:string;local_date:string;value:number};
type Props = {owner:string;today:string;tasks:Task[];settings:Setting[];completions:Completion[];earnings:Earning[];kpis:Kpi[];kpiLogs:KpiLog[];onOpenRecap:()=>void};
type Period = 'week'|'month'|'90 days';
const iso=(date:Date)=>date.toISOString().slice(0,10);
const dateOf=(day:string)=>new Date(day+'T12:00:00Z');
const addDays=(day:string,n:number)=>{const d=dateOf(day);d.setUTCDate(d.getUTCDate()+n);return iso(d)};
const monthOf=(day:string)=>day.slice(0,7)+'-01';
const weekday=(day:string)=>(dateOf(day).getUTCDay()+6)%7+1;
const formatDay=(day:string)=>new Intl.DateTimeFormat('en-US',{weekday:'short',month:'short',day:'numeric',timeZone:'UTC'}).format(dateOf(day));
const formatMonth=(day:string)=>new Intl.DateTimeFormat('en-US',{month:'long',year:'numeric',timeZone:'UTC'}).format(dateOf(day));
const money=(value:number)=>'$'+(value/100).toFixed(2);
const daysBetween=(from:string,to:string)=>{const days:string[]=[];for(let d=from;d<=to;d=addDays(d,1))days.push(d);return days};
const settingFor=(settings:Setting[],taskId:string,day:string)=>settings.filter(s=>s.task_id===taskId&&s.month<=monthOf(day)).sort((a,b)=>b.month.localeCompare(a.month))[0];
const due=(task:Task,settings:Setting[],day:string)=>{const s=settingFor(settings,task.id,day);return !!s&&day>=task.start_date&&(!task.archive_date||day<task.archive_date)&&s.weekdays.includes(weekday(day))};


function saveCsv(filename:string,rows:string[][]){const csv=rows.map(row=>row.map(cell=>'"'+(/^[=+\-@\t\r]/.test(cell)?"'":'')+cell.replaceAll('"','""')+'"').join(',')).join('\r\n');const link=document.createElement('a');link.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));link.download=filename;link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000)}

export { getMonthSummary };

export function InsightsDashboard({owner,today,tasks,settings,completions,earnings,kpis,kpiLogs,onOpenRecap}:Props){
 const [period,setPeriod]=useState<Period>('month'),[activity,setActivity]=useState('all'),[cursor,setCursor]=useState(monthOf(today)),[selectedDay,setSelectedDay]=useState(today),[selectedKpi,setSelectedKpi]=useState(''),[weekdayFilter,setWeekdayFilter]=useState('all'),[checkFilter,setCheckFilter]=useState('all'),[targetFilter,setTargetFilter]=useState('all');
 const mine=useMemo(()=>tasks.filter(t=>t.owner_id===owner),[tasks,owner]);
 const activeKpis=kpis.filter(k=>k.owner_id===owner&&mine.some(t=>t.id===k.task_id));
 const kpi=activeKpis.find(k=>k.task_id===selectedKpi)??activeKpis[0];
 const range=useMemo(()=>{if(period==='week'){const start=addDays(today,1-weekday(today));return {start,end:addDays(start,6)}}if(period==='90 days')return {start:addDays(today,-89),end:today};const end=iso(new Date(Date.UTC(Number(cursor.slice(0,4)),Number(cursor.slice(5,7)),0,12)));return {start:cursor,end}},[period,today,cursor]);
 const dates=useMemo(()=>daysBetween(range.start,range.end).filter(d=>d<=today),[range.start,range.end,today]);
 const filtered=activity==='all'?mine:mine.filter(t=>t.id===activity);
 const records=dates.flatMap(day=>filtered.filter(t=>due(t,settings,day)).map(task=>({day,task,completed:completions.some(c=>c.task_id===task.id&&c.local_date===day&&c.completed)})));
 const completed=records.filter(r=>r.completed).length,consistency=records.length?Math.round(completed/records.length*100):0;
 const longestStreak=filtered.reduce((best,task)=>{let run=0,peak=0;for(const row of records.filter(r=>r.task.id===task.id)){run=row.completed?run+1:0;peak=Math.max(peak,run)}return Math.max(best,peak)},0);
 const selectedRecords=records.filter(r=>r.day===selectedDay);
 const earned=earnings.filter(e=>e.active&&e.earned_date>=range.start&&e.earned_date<=range.end).reduce((sum,e)=>sum+e.cents,0);
 const byDay=dates.map(day=>({day,rows:records.filter(r=>r.day===day)}));
 const weekdays=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
 const weekdayNames=['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
 const challenge=filtered.flatMap(task=>weekdayNames.map((name,i)=>{const rows=records.filter(r=>r.task.id===task.id&&weekday(r.day)===i+1);return {task,name,total:rows.length,done:rows.filter(r=>r.completed).length}})).filter(x=>x.total>=2&&x.done<x.total).sort((a,b)=>a.done/a.total-b.done/b.total||b.total-a.total)[0];
 const best=mine.map(task=>{const rows=records.filter(r=>r.task.id===task.id);return {task,total:rows.length,done:rows.filter(r=>r.completed).length}}).filter(x=>x.total>=2).sort((a,b)=>b.done/b.total-a.done/a.total)[0];
 const kpiDays=kpi?dates.filter(day=>due(mine.find(t=>t.id===kpi.task_id)!,settings,day)).map(day=>({day,log:kpiLogs.find(l=>l.task_id===kpi.task_id&&l.local_date===day),completed:completions.some(c=>c.task_id===kpi.task_id&&c.local_date===day&&c.completed)})).filter(row=>(weekdayFilter==='all'||String(weekday(row.day))===weekdayFilter)&&(checkFilter==='all'||String(row.completed)===checkFilter)&&(targetFilter==='all'||(row.log&&String(row.log.value>=kpi.target)===targetFilter))):[];
 const measured=kpiDays.filter(x=>x.log),hit=measured.filter(x=>x.log!.value>=kpi!.target).length;
 const shiftMonth=(n:number)=>{const d=dateOf(cursor);d.setUTCMonth(d.getUTCMonth()+n);const next=monthOf(iso(d));if(next<=monthOf(today)){setCursor(next);setSelectedDay(next)}};
 const exportData=()=>{const rows=[['date','activity','scheduled','completed','kpi_value','kpi_target','kpi_unit'],...records.map(r=>{const goal=activeKpis.find(k=>k.task_id===r.task.id),log=kpiLogs.find(l=>l.task_id===r.task.id&&l.local_date===r.day);return [r.day,r.task.title,'yes',r.completed?'yes':'no',log?String(log.value):'',goal?String(goal.target):'',goal?.unit??'']})];saveCsv('pronark-insights-'+range.start+'-'+range.end+'.csv',rows)};
 const dayState=(day:string)=>{const rows=byDay.find(x=>x.day===day)?.rows??[],done=rows.filter(x=>x.completed).length;return {rows,done,state:day>today?'future':!rows.length?'rest':done===rows.length?'complete':done===0?'missed':'mixed'} as const};
 const heat:Record<string,string>={complete:'bg-primary text-primary-foreground',mixed:'bg-primary/35 text-foreground',missed:'bg-destructive/15 text-destructive',rest:'bg-muted text-muted-foreground',future:'bg-transparent text-muted-foreground/50 ring-1 ring-inset ring-foreground/5'};
 const selectedDone=selectedRecords.filter(x=>x.completed);
 return <div className="flex flex-col gap-5">
  <div className="flex flex-wrap items-end justify-between gap-3">
   <div><div className="text-eyebrow text-muted-foreground">Your routines</div><h2 className="text-title mt-1">Your consistency</h2><p className="mt-1 text-sm text-muted-foreground">See the days you showed up, the routines that stuck, and patterns worth noticing.</p></div>
   <div className="flex w-full flex-wrap gap-2 sm:w-auto">
    <Segmented label="Time range" value={period} onChange={p=>{setPeriod(p);setSelectedDay(p==='month'?cursor:today)}} options={(['week','month','90 days'] as Period[]).map(p=>({value:p,label:p==='90 days'?'90 days':p[0].toUpperCase()+p.slice(1)}))}/>
    <NativeSelect className="w-full sm:w-48" aria-label="Filter by activity" value={activity} onChange={e=>setActivity(e.target.value)}><NativeSelectOption value="all">All activities</NativeSelectOption>{mine.map(t=><NativeSelectOption key={t.id} value={t.id}>{t.title}</NativeSelectOption>)}</NativeSelect>
   </div>
  </div>
  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
   <StatTile icon={<Target className="size-3.5" aria-hidden="true"/>} label="Consistency" value={records.length?consistency+'%':'—'} hint={`${completed} of ${records.length} scheduled routines`}/>
   <StatTile icon={<CalendarCheck className="size-3.5" aria-hidden="true"/>} label="Completed" value={`${completed} of ${records.length}`} hint="Rest days aren't counted"/>
   <StatTile icon={<Flame className="size-3.5" aria-hidden="true"/>} label="Longest streak" value={`${longestStreak} day${longestStreak===1?'':'s'}`} hint={`${money(earned)} earned this period`}/>
  </div>
  <Card><CardContent className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
   <div className="flex flex-col gap-3">
    <div className="flex flex-wrap items-center justify-between gap-2"><SectionHeading title="Activity overview" description="Completed, missed and rest days across your routines."/>{period==='month'&&<div className="flex items-center gap-1"><Button variant="ghost" size="icon-sm" onClick={()=>shiftMonth(-1)} aria-label="Previous month"><ChevronLeft/></Button><strong className="tabular min-w-32 text-center text-sm">{formatMonth(cursor)}</strong><Button variant="ghost" size="icon-sm" onClick={()=>shiftMonth(1)} disabled={cursor>=monthOf(today)} aria-label="Next month"><ChevronRight/></Button></div>}</div>
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">{([['complete','Completed'],['missed','Missed'],['rest','Rest day'],['mixed','Partly complete']] as const).map(([k,l])=><span key={k} className="inline-flex items-center gap-1.5"><i className={'size-2.5 rounded-sm '+heat[k].split(' ')[0]}/>{l}</span>)}</div>
    <div className="grid grid-cols-7 gap-1">{weekdays.map(d=><b key={d} className="pb-1 text-center text-[0.6875rem] font-medium text-muted-foreground">{d}</b>)}{Array.from({length:weekday(range.start)-1},(_,i)=><span key={'pad'+i}/>)}{daysBetween(range.start,range.end).map(day=>{const {rows,done,state}=dayState(day);return <button key={day} type="button" disabled={day>today} onClick={()=>setSelectedDay(day)} aria-label={formatDay(day)+': '+done+' of '+rows.length+' completed'} aria-pressed={selectedDay===day} className={'flex aspect-square flex-col items-center justify-center rounded-md sm:aspect-[1.6] text-[0.6875rem] transition-[scale,box-shadow] duration-100 active:scale-95 disabled:cursor-default '+heat[state]+(selectedDay===day?' ring-2 ring-foreground ring-offset-1 ring-offset-background':'')}><span className="tabular font-medium">{Number(day.slice(-2))}</span>{rows.length>0&&<small className="tabular hidden opacity-80 sm:block">{done}/{rows.length}</small>}</button>})}</div>
   </div>
   <aside className="flex flex-col gap-3 rounded-xl bg-muted/50 p-4">
    <div className="flex items-start justify-between gap-2"><div><div className="text-eyebrow text-muted-foreground">Selected day</div><h3 className="text-headline mt-1">{formatDay(selectedDay)}</h3><p className="text-xs text-muted-foreground">{selectedDone.length} of {selectedRecords.length} routines completed</p></div><strong className="tabular text-2xl font-semibold">{selectedRecords.length?Math.round(selectedDone.length/selectedRecords.length*100)+'%':'—'}</strong></div>
    {selectedRecords.length?<><h4 className="text-eyebrow text-muted-foreground">Completed</h4>{selectedDone.map(x=><div key={x.task.id} className="flex items-center gap-2 text-sm"><Check className="size-4 text-primary" aria-hidden="true"/>{x.task.title}</div>)}{!selectedDone.length&&<p className="text-xs text-muted-foreground">No checkoffs recorded.</p>}<h4 className="text-eyebrow text-muted-foreground">Not completed</h4>{selectedRecords.filter(x=>!x.completed).map(x=><div key={x.task.id} className="flex items-center gap-2 text-sm text-muted-foreground"><Circle className="size-3.5" aria-hidden="true"/>{x.task.title}</div>)}{selectedRecords.every(x=>x.completed)&&<p className="text-xs text-muted-foreground">All scheduled routines complete!</p>}</>:<p className="text-sm text-muted-foreground">No activities scheduled. Rest is part of the plan.</p>}
   </aside>
  </CardContent></Card>
  <div className="grid gap-5 lg:grid-cols-2">
   <Card><CardContent className="flex flex-col gap-3">
    <SectionHeading title="Patterns worth noticing" description="Useful observations, always grounded in your data." action={<Lightbulb className="size-4 text-warning" aria-hidden="true"/>}/>
    <div className="rounded-xl bg-warning/10 p-3.5 ring-1 ring-warning/25">{challenge?<><strong className="text-sm font-semibold">{challenge.task.title} has been harder to fit in on {challenge.name}s</strong><p className="mt-1 text-sm text-muted-foreground">You completed {challenge.done} of {challenge.total} scheduled checkoffs for this activity on {challenge.name}s in this view. A small adjustment might make it easier.</p></>:<><strong className="text-sm font-semibold">Keep showing up in your own way</strong><p className="mt-1 text-sm text-muted-foreground">We'll point out patterns once there are enough scheduled days to compare.</p></>}</div>
    {best&&<p className="inline-flex items-center gap-2 text-sm"><Star className="size-4 fill-warning text-warning" aria-hidden="true"/>{best.task.title} is a bright spot: {best.done} of {best.total} scheduled checkoffs.</p>}
   </CardContent></Card>
   <Card><CardContent className="flex flex-col gap-3">
    <SectionHeading title="Activity trends" description="Track your numbers against your goals." action={<TrendingUp className="size-4 text-primary" aria-hidden="true"/>}/>
    {kpi?<>
     <div className="grid grid-cols-2 gap-2">
      <NativeSelect aria-label="KPI activity" value={kpi.task_id} onChange={e=>setSelectedKpi(e.target.value)}>{activeKpis.map(x=><NativeSelectOption key={x.task_id} value={x.task_id}>{mine.find(t=>t.id===x.task_id)?.title}</NativeSelectOption>)}</NativeSelect>
      <NativeSelect aria-label="Weekday" value={weekdayFilter} onChange={e=>setWeekdayFilter(e.target.value)}><NativeSelectOption value="all">Any day</NativeSelectOption>{weekdays.map((d,i)=><NativeSelectOption key={d} value={i+1}>{d}</NativeSelectOption>)}</NativeSelect>
      <NativeSelect aria-label="Checkoff status" value={checkFilter} onChange={e=>setCheckFilter(e.target.value)}><NativeSelectOption value="all">Any checkoff</NativeSelectOption><NativeSelectOption value="true">Completed</NativeSelectOption><NativeSelectOption value="false">Not completed</NativeSelectOption></NativeSelect>
      <NativeSelect aria-label="KPI target status" value={targetFilter} onChange={e=>setTargetFilter(e.target.value)}><NativeSelectOption value="all">Any target result</NativeSelectOption><NativeSelectOption value="true">Target met</NativeSelectOption><NativeSelectOption value="false">Below target</NativeSelectOption></NativeSelect>
     </div>
     <div className="grid grid-cols-3 gap-2 text-center text-xs text-muted-foreground"><span className="rounded-lg bg-muted/50 py-2"><b className="tabular block text-base text-foreground">{measured.length}</b>logged days</span><span className="rounded-lg bg-muted/50 py-2"><b className="tabular block text-base text-foreground">{measured.length?Math.round(measured.reduce((n,x)=>n+x.log!.value,0)/measured.length*100)/100:'—'}</b>avg {kpi.unit}</span><span className="rounded-lg bg-muted/50 py-2"><b className="tabular block text-base text-foreground">{measured.length?Math.round(hit/measured.length*100)+'%':'—'}</b>target hit</span></div>
     <div className="relative flex h-40 items-end gap-1 overflow-x-auto border-b pb-5" role="img" aria-label={'Daily '+kpi.unit+' logged against target '+kpi.target}>
      <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 border-t border-dashed border-muted-foreground/50" style={{bottom:'calc((100% - 1.25rem) * 0.8 + 1.25rem)'}}/>
      {kpiDays.length?kpiDays.map(x=><div key={x.day} className="relative flex h-full min-w-4 flex-1 flex-col items-center justify-end" title={formatDay(x.day)+': '+(x.log?x.log.value+' '+kpi.unit:'No data')}><i className={'w-full max-w-5 rounded-t-sm transition-[height] duration-500 ease-out '+(x.log&&x.log.value>=kpi.target?'bg-primary':'bg-primary/35')} style={{height:x.log?Math.min(100,x.log.value/kpi.target*80)+'%':'0%'}}/><small className="tabular absolute -bottom-5 text-[0.625rem] text-muted-foreground">{Number(x.day.slice(-2))}</small></div>):<p className="self-center text-sm text-muted-foreground">No scheduled days match these filters.</p>}
     </div>
     <p className="text-xs text-muted-foreground">Dashed line: {kpi.target} {kpi.unit} target. Missing logs are not counted as zero.</p>
    </>:<EmptyState>Add a measurable goal to an activity to see its trends here.</EmptyState>}
   </CardContent></Card>
  </div>
  <div className="flex flex-wrap gap-2"><Button size="lg" onClick={onOpenRecap}><Sparkles data-icon="inline-start"/>View monthly recap</Button><Button size="lg" variant="outline" onClick={exportData}><Download data-icon="inline-start"/>Download detailed CSV</Button></div>
 </div>
}

export function MonthlyRecap({owner,name,month,today,tasks,settings,completions,kpis,kpiLogs,character,onClose}:{owner:string;name:string;month:string;today:string;tasks:Task[];settings:Setting[];completions:Completion[];kpis:Kpi[];kpiLogs:KpiLog[];character:CharacterStyle;onClose:()=>void}){
 const [slide,setSlide]=useState(0);
 const summary=getMonthSummary(owner,month,today,tasks,settings,completions);
 const title=formatMonth(month);
 const goalLogs=kpiLogs.filter(l=>l.owner_id===owner&&l.local_date.startsWith(month.slice(0,7)));
 const hits=goalLogs.filter(l=>{const k=kpis.find(x=>x.task_id===l.task_id);return !!k&&l.value>=k.target}).length;
 const slides=[{eyebrow:'Your month in moments',title:'You kept showing up',metric:summary.scheduled?summary.percent+'%':'—',label:'consistency',body:summary.scheduled?`You completed ${summary.completed} of ${summary.scheduled} scheduled routines.`:'No scheduled routines this month yet.'},{eyebrow:'Your daily wins',title:'Small steps added up',metric:String(summary.completed),label:'checkoffs',body:'Each one represents a choice you made for yourself.'},{eyebrow:'Your measurable progress',title:'You tracked what matters',metric:String(goalLogs.length),label:'KPI logs',body:goalLogs.length?`${hits} reached their target. Every logged number helps you see your progress.`:'Set an activity KPI to see your numbers here next month.'}];
 const first=name.split(' ')[0];
 // Slides track the finger 1:1, rubber-band at the ends, and a flick's projected
 // momentum picks the next slide; the spring then continues at the finger's velocity.
 const trackRef=useRef<HTMLDivElement>(null),widthRef=useRef(1),drag=useRef<{id:number;x:number;from:number}|null>(null),tracker=useRef(new VelocityTracker());
 const offset=useSpring(0,v=>{if(trackRef.current)trackRef.current.style.translate=`${v.toFixed(2)}px 0`},{precision:0.5});
 const goTo=(i:number,velocity=0)=>{const next=Math.max(0,Math.min(slides.length-1,i));setSlide(next);const target=-next*widthRef.current;prefersReducedMotion()?offset.set(target):offset.to(target,{velocity,damping:Math.abs(velocity)>300?0.8:1,response:0.35})};
 const viewport=useRef<HTMLDivElement>(null),slideRef=useRef(slide);slideRef.current=slide;
 useLayoutEffect(()=>{const node=viewport.current;if(!node)return;const observer=new ResizeObserver(()=>{widthRef.current=node.offsetWidth;offset.set(-slideRef.current*widthRef.current)});observer.observe(node);return()=>observer.disconnect()},[offset]);
 return <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-0 backdrop-blur-sm sm:p-6" role="dialog" aria-modal="true" aria-label={'Your '+title+' recap'} onKeyDown={e=>{if(e.key==='Escape')onClose();if(e.key==='ArrowRight')goTo(slide+1);if(e.key==='ArrowLeft')goTo(slide-1)}}>
  <div className="relative flex h-full w-full flex-col overflow-hidden bg-gradient-to-b from-primary/25 via-background to-background pt-[env(safe-area-inset-top)] sm:h-auto sm:max-h-[90dvh] sm:max-w-md sm:rounded-3xl sm:shadow-2xl sm:ring-1 sm:ring-foreground/10">
   <div className="flex items-center justify-between px-5 pt-4"><span className="text-eyebrow text-muted-foreground">{title}</span><Button variant="ghost" size="icon" className="rounded-full" onClick={onClose} aria-label="Close recap" autoFocus><X/></Button></div>
   <div ref={viewport} className="flex-1 touch-pan-y overflow-hidden select-none"
    onPointerDown={e=>{offset.stop();drag.current={id:e.pointerId,x:e.clientX,from:offset.value};tracker.current.reset();tracker.current.push(e.clientX);e.currentTarget.setPointerCapture(e.pointerId)}}
    onPointerMove={e=>{const d=drag.current;if(!d||d.id!==e.pointerId)return;const min=-(slides.length-1)*widthRef.current;let x=d.from+e.clientX-d.x;if(x>0)x=rubberband(x,widthRef.current);else if(x<min)x=min+rubberband(x-min,widthRef.current);offset.set(x);tracker.current.push(e.clientX)}}
    onPointerUp={e=>{const d=drag.current;if(!d||d.id!==e.pointerId)return;drag.current=null;const v=tracker.current.velocity();goTo(Math.round(-(offset.value+project(v))/widthRef.current),v)}}
    onPointerCancel={()=>{drag.current=null;goTo(slide)}}>
    <div ref={trackRef} className="flex h-full">{slides.map((s,i)=><section key={i} aria-hidden={i!==slide} className="flex w-full shrink-0 flex-col items-center gap-3 px-6 pt-2 pb-4 text-center">
     <div className="text-eyebrow text-primary">{s.eyebrow}</div>
     <h2 className="text-title">{i===0?'Your month in moments':s.title}</h2>
     <CompanionCharacter style={character} interactive listen={false} entrance={i===0?'hello':i===slides.length-1?'celebrate':undefined} className="my-2 h-36 w-32" label="Your smiling Pronark companion"/>
     <strong className="tabular text-6xl font-semibold tracking-tight">{s.metric}</strong>
     <h3 className="text-headline -mt-1 text-muted-foreground">{s.label}</h3>
     <p className="max-w-xs text-sm">{s.body}</p>
     <p className="max-w-xs text-sm text-muted-foreground">{summary.completed>0?`Progress looks good on you, ${first}! Keep going.`:`A new month brings new chances to begin, ${first}.`}</p>
    </section>)}</div>
   </div>
   <div className="flex flex-col gap-2 px-5 pt-2 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
    <div className="flex justify-center gap-1.5" aria-label="Recap slides">{slides.map((_,i)=><button key={i} type="button" aria-label={'Go to slide '+(i+1)} aria-current={slide===i?'step':undefined} onClick={()=>goTo(i)} className={'h-2 rounded-full transition-[width,background-color] duration-300 '+(slide===i?'w-6 bg-primary':'w-2 bg-muted-foreground/30')}/>)}</div>
    <Button size="lg" onClick={()=>slide<slides.length-1?goTo(slide+1):onClose()}>{slide<slides.length-1?'Next highlight':'Explore my insights'}<ChevronRight data-icon="inline-end"/></Button>
    <Button variant="ghost" onClick={onClose}>Later</Button>
   </div>
  </div>
 </div>
}

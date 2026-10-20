// Monthly consistency summary, shared by the recap prompt (App) and the Insights dashboard.
type Task = {id:string;owner_id:string;title:string;start_date:string;archive_date:string|null};
type Setting = {task_id:string;month:string;weekdays:number[]};
type Completion = {task_id:string;local_date:string;completed:boolean};
const iso=(date:Date)=>date.toISOString().slice(0,10);
const dateOf=(day:string)=>new Date(day+'T12:00:00Z');
const addDays=(day:string,n:number)=>{const d=dateOf(day);d.setUTCDate(d.getUTCDate()+n);return iso(d)};
const monthOf=(day:string)=>day.slice(0,7)+'-01';
const weekday=(day:string)=>(dateOf(day).getUTCDay()+6)%7+1;
const daysBetween=(from:string,to:string)=>{const days:string[]=[];for(let d=from;d<=to;d=addDays(d,1))days.push(d);return days};
const settingFor=(settings:Setting[],taskId:string,day:string)=>settings.filter(s=>s.task_id===taskId&&s.month<=monthOf(day)).sort((a,b)=>b.month.localeCompare(a.month))[0];
const due=(task:Task,settings:Setting[],day:string)=>{const s=settingFor(settings,task.id,day);return !!s&&day>=task.start_date&&(!task.archive_date||day<task.archive_date)&&s.weekdays.includes(weekday(day))};

export function getMonthSummary(owner:string,month:string,today:string,tasks:Task[],settings:Setting[],completions:Completion[]){
 const end=iso(new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7)),0,12)));
 const through=end<today?end:today;
 const dates=through>=month?daysBetween(month,through):[];
 const mine=tasks.filter(t=>t.owner_id===owner);
 const scheduled=dates.flatMap(day=>mine.filter(t=>due(t,settings,day)).map(t=>({task:t,day})));
 const complete=scheduled.filter(x=>completions.some(c=>c.task_id===x.task.id&&c.local_date===x.day&&c.completed));
 return {scheduled:scheduled.length,completed:complete.length,percent:scheduled.length?Math.round(complete.length/scheduled.length*100):0,days:dates.length};
}

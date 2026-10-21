import { useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpRight, Check, Circle, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AnimatedNumber, ErrorText, Meter, Logo } from '@/components/pronark';

const sources = {
 spending: 'https://institute.bankofamerica.com/economic-insights/generational-spending-update.html',
 wellness: 'https://www.mckinsey.com/industries/consumer-packaged-goods/our-insights/future-of-wellness-trends',
 learning: 'https://www.deloitte.com/us/en/insights/topics/talent/2025-gen-z-millennial-survey.html',
};
const demoTasks = [{title:'Move your body',detail:'A little stronger, every day',value:2,icon:'↗'}, {title:'Make a nourishing lunch',detail:'Fuel for everything you want to do',value:1,icon:'◒'}, {title:'Read for 20 minutes',detail:'Make room for something new',value:1,icon:'▤'}];

export function WelcomePage({onSignIn,error,signedIn=false}:{onSignIn:()=>void;error:string;signedIn?:boolean}) {
 const [checked,setChecked] = useState<number[]>([0]);
 const total = demoTasks.reduce((sum,t,i)=>sum+(checked.includes(i)?t.value:0),0);
 const em='not-italic text-primary';
 const kicker='text-eyebrow text-primary';
 return <div id="top" className="min-h-dvh bg-background">
  <a href="#welcome-main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:ring-2 focus:ring-ring">Skip to content</a>
  <header className="glass sticky top-0 z-40 pt-[env(safe-area-inset-top)] shadow-[0_1px_0_var(--border)]">
   <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 md:px-8">
    <a href="#top" aria-label="Pronark home"><Logo variant="mark" className="h-10"/></a>
    <nav aria-label="Welcome navigation" className="hidden gap-5 text-sm text-muted-foreground sm:flex"><a className="hover:text-foreground" href="#how-it-works">How it works</a><a className="hover:text-foreground" href="#why-pronark">Why Pronark</a></nav>
    <Button className="ml-auto" onClick={onSignIn}>{signedIn?'Open app':'Sign in'}<ArrowUpRight data-icon="inline-end"/></Button>
   </div>
  </header>
  <main id="welcome-main">
   <section aria-labelledby="welcome-title" className="mx-auto grid max-w-6xl items-center gap-10 px-4 pt-10 pb-16 md:grid-cols-[1.1fr_1fr] md:px-8 md:pt-16">
    <div className="flex flex-col gap-5">
     <p className={kicker}>Small habits. Big possibilities.</p>
     <h1 id="welcome-title" className="text-[clamp(2.5rem,7vw,4.5rem)] leading-[1.02] font-semibold tracking-[-0.035em]">Your goals.<br/>Your wishlist.<br/><em className={em}>On the same team.</em></h1>
     <p className="max-w-xl text-lg text-muted-foreground">There’s a lot you want to do. And a little you want to buy. What if showing up for yourself helped you work toward both?</p>
     <p className="max-w-xl text-muted-foreground">Meet Pronark. Turn your daily routines into progress you can see—and rewards you look forward to.</p>
     <div className="flex flex-wrap items-center gap-3"><Button size="lg" className="h-11 px-5 text-sm" onClick={onSignIn}>Start your next chapter<ArrowUpRight data-icon="inline-end"/></Button><Button size="lg" className="h-11 px-5 text-sm" variant="ghost" nativeButton={false} render={<a href="#how-it-works"/>}>Try a little win<ArrowDown data-icon="inline-end"/></Button></div>
     <p className="text-xs text-muted-foreground">Your habits. Your money. Your reward rules.</p>
     {error&&<ErrorText>{error}</ErrorText>}
    </div>
    <div role="img" aria-label="Illustration of daily habits connecting to a weekend getaway savings goal. Example progress: 72 of 120 dollars." className="relative">
     <div className="absolute -inset-6 -z-10 rounded-[3rem] bg-gradient-to-br from-primary/20 via-warning/10 to-transparent blur-2xl"/>
     <div className="flex items-center gap-3 rounded-2xl bg-card p-3.5 shadow-lg ring-1 ring-foreground/10 md:-ml-8 md:w-72"><span className="grid size-9 place-items-center rounded-lg bg-primary text-primary-foreground"><Check className="size-4" strokeWidth={3}/></span><div className="flex-1 text-sm"><strong className="block font-semibold">Showed up for myself</strong><small className="text-xs text-muted-foreground">Gym session complete</small></div><b className="tabular text-primary">+$2</b></div>
     <div className="mt-4 overflow-hidden rounded-3xl bg-card shadow-xl ring-1 ring-foreground/10">
      <div className="relative h-40 bg-gradient-to-b from-sky-300/60 via-amber-200/60 to-primary/40 dark:from-sky-900/60 dark:via-amber-900/40 dark:to-primary/40"><div className="absolute top-6 right-10 size-14 rounded-full bg-amber-300/90 shadow-[0_0_40px_10px] shadow-amber-300/50"/><div className="absolute inset-x-0 bottom-0 h-16 rounded-t-[50%] bg-primary/50"/><div className="absolute -right-10 bottom-0 h-20 w-2/3 rounded-t-[50%] bg-primary/70"/><span className="text-eyebrow absolute bottom-3 left-4 text-primary-foreground">Something to look forward to</span></div>
      <div className="flex flex-col gap-2 p-5"><small className="text-eyebrow text-muted-foreground">My next experience</small><h2 className="text-title">A weekend away</h2><div className="flex items-baseline justify-between"><strong className="tabular text-2xl font-semibold">$72 <span className="text-base font-normal text-muted-foreground">/ $120</span></strong><span className="tabular text-sm font-medium text-primary">60%</span></div><Meter value={60} className="h-2"/><p className="text-xs text-muted-foreground">Built one small win at a time.</p></div>
     </div>
     <p className="mt-3 text-center text-xs text-muted-foreground">A glimpse of what you could build · example data</p>
    </div>
   </section>
   <div aria-label="Move, nourish, learn, repeat, reward" className="overflow-hidden border-y bg-primary py-3 text-primary-foreground"><div className="text-eyebrow mx-auto flex max-w-6xl flex-wrap justify-center gap-x-6 gap-y-1 px-4">{['Move your body','Feed your curiosity','Make time for you','Enjoy your progress'].map((x,i)=><span key={x} className="inline-flex items-center gap-6">{i>0&&<Sparkles className="size-3" aria-hidden="true"/>}{x}</span>)}</div></div>
   <section id="why-pronark" className="mx-auto grid max-w-6xl gap-8 px-4 py-16 md:grid-cols-2 md:px-8 md:py-24">
    <div><p className={kicker}>The everyday tension</p><h2 className="mt-3 text-[clamp(2rem,4.5vw,3rem)] leading-[1.05] font-semibold tracking-[-0.03em]">A full wishlist.<br/>An even fuller <em className={em}>list of goals.</em></h2></div>
    <div className="flex flex-col gap-4 text-muted-foreground md:pt-8"><p>Get stronger. Learn something new. Take care of yourself. Save for that trip. Life in your twenties, thirties, and beyond can feel like a hundred open tabs.</p><p>Enjoying nice things and building a life you feel good about can go together. Pronark connects the routines that matter to you with a spending reward you choose.</p></div>
   </section>
   <section aria-label="Research on younger adults" className="mx-auto grid max-w-6xl gap-3 px-4 md:grid-cols-3 md:px-8">
    {([['The spending side','On the rise','Gen Z and millennials’ spending growth outpaced older generations in February 2026 in Bank of America’s card data.',sources.spending,'Bank of America Institute · 2026'],['The wellness side','Nearly 30%','of US Gen Z and millennials surveyed said they prioritized wellness much more than a year earlier.',sources.wellness,'McKinsey · 2025 survey'],['The ambition side','70%','of Gen Z respondents develop career skills at least weekly. There’s real drive behind the desire to grow.',sources.learning,'Deloitte · 2025 global survey']] as const).map(([label,stat,body,href,source])=><article key={label} className="flex flex-col gap-2 rounded-2xl bg-card p-5 ring-1 ring-foreground/10"><span className="text-eyebrow text-muted-foreground">{label}</span><strong className="text-3xl font-semibold tracking-tight">{stat}</strong><p className="text-sm text-muted-foreground">{body}</p><a href={href} target="_blank" rel="noreferrer" className="mt-auto inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">{source}<ArrowUpRight className="size-3" aria-hidden="true"/></a></article>)}
   </section>
   <p className="mx-auto max-w-6xl px-4 pt-3 text-xs text-muted-foreground md:px-8">Different studies, different populations—not a claim about everyone. These findings inform the idea behind Pronark; they do not measure its effectiveness.</p>
   <section id="how-it-works" className="mt-16 bg-muted/40 py-16 md:mt-24 md:py-24">
    <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 md:grid-cols-2 md:px-8">
     <div className="flex flex-col gap-4"><p className={kicker}>A small shift</p><h2 className="text-[clamp(2rem,4.5vw,3rem)] leading-[1.05] font-semibold tracking-[-0.03em]">Turn “I want to”<br/>into <em className={em}>“I did.”</em></h2><p className="text-muted-foreground">Feeling stronger or mastering a skill takes time. A checked box and a small reward make today’s effort visible while you work toward the bigger change.</p><p className="text-muted-foreground">Give each routine a reward. Complete it. Watch your progress add up toward something you love.</p><p className="text-xs text-muted-foreground">Interactive example only. Nothing here changes your account.</p></div>
     <div id="demo-checklist" className="flex flex-col gap-4 rounded-3xl bg-card p-5 shadow-xl ring-1 ring-foreground/10 md:p-6">
      <div className="flex items-start justify-between gap-3"><div><small className="text-eyebrow text-muted-foreground">Your daily wins</small><h3 className="text-title">A little better today.</h3></div><span className="text-eyebrow rounded-full bg-warning/15 px-2.5 py-1 text-warning-foreground">Try it out</span></div>
      <div role="status" aria-live="polite" aria-atomic="true" className="flex items-center justify-between rounded-2xl bg-primary/8 p-4 ring-1 ring-primary/15"><div><span className="text-xs text-muted-foreground">Today’s reward</span><AnimatedNumber value={total*100} format={n=>'$'+(n/100).toFixed(2)} className="block text-3xl font-semibold tracking-tight"/></div><small className="text-xs text-muted-foreground">{checked.length} of 3 little wins complete</small></div>
      <div className="flex flex-col gap-2">{demoTasks.map((task,i)=>{const on=checked.includes(i);return <label key={task.title} className={'flex cursor-pointer items-center gap-3 rounded-xl p-3 ring-1 transition-[background-color,scale] duration-150 active:scale-[0.98] '+(on?'bg-primary/5 ring-primary/30':'ring-foreground/10 hover:bg-muted/40')}><input type="checkbox" className="sr-only" checked={on} onChange={()=>setChecked(old=>old.includes(i)?old.filter(x=>x!==i):[...old,i])}/><span aria-hidden="true" className={'grid size-7 shrink-0 place-items-center rounded-lg border-2 transition-colors duration-150 '+(on?'border-primary bg-primary text-primary-foreground':'border-muted-foreground/40')}>{on&&<Check className="size-4" strokeWidth={3}/>}</span><span className="min-w-0 flex-1"><strong className={'block text-sm font-medium '+(on?'text-muted-foreground line-through':'')}>{task.title}</strong><small className="text-xs text-muted-foreground">{task.detail}</small></span><b className="tabular text-sm text-primary">+${task.value}</b></label>})}</div>
      <p className="text-sm text-muted-foreground">{checked.length===3?'Three little wins. That’s a day worth celebrating.':'Small actions. A reward you can see.'}</p>
     </div>
    </div>
   </section>
   <section className="mx-auto max-w-6xl px-4 py-16 md:px-8 md:py-24">
    <p className={kicker}>Your own everyday system</p><h2 className="mt-3 text-[clamp(2rem,4.5vw,3rem)] leading-[1.05] font-semibold tracking-[-0.03em]">Make showing up <em className={em}>feel good.</em></h2>
    <div className="mt-10 grid gap-4 md:grid-cols-3">
     <article className="flex flex-col gap-3 rounded-2xl bg-card p-5 ring-1 ring-foreground/10"><div aria-hidden="true" className="flex flex-col gap-1.5 rounded-xl bg-muted/50 p-3 text-sm">{[['Morning walk',true],['Read a chapter',true],['Wind down',false]].map(([l,d])=><span key={String(l)} className="flex items-center gap-2">{d?<Check className="size-4 text-primary"/>:<Circle className="size-4 text-muted-foreground"/>}{l}</span>)}</div><h3 className="text-headline">Build a routine that fits.</h3><p className="text-sm text-muted-foreground">Choose your habits, schedule your days, and save the little details that make your routine yours.</p></article>
     <article className="flex flex-col gap-3 rounded-2xl bg-card p-5 ring-1 ring-foreground/10"><div aria-hidden="true" className="flex flex-col gap-2 rounded-xl bg-muted/50 p-3"><div className="flex gap-1">{[1,2,3,4,5,6,7].map(n=><i key={n} className="grid size-7 place-items-center rounded-md bg-primary text-primary-foreground"><Check className="size-3.5" strokeWidth={3}/></i>)}</div><strong className="text-sm">Keep your promise to you.</strong></div><h3 className="text-headline">Give consistency a reward.</h3><p className="text-sm text-muted-foreground">Set dollar values within your budget. Check off your tasks and see your earnings, streaks, and weekly progress.</p></article>
     <article className="flex flex-col gap-3 rounded-2xl bg-card p-5 ring-1 ring-foreground/10"><div aria-hidden="true" className="flex flex-wrap gap-1.5 rounded-xl bg-muted/50 p-3 text-sm">{['Travel','Style','Experiences'].map(x=><span key={x} className="rounded-full bg-background px-2.5 py-1 ring-1 ring-foreground/10">{x}</span>)}</div><h3 className="text-headline">Look forward to something.</h3><p className="text-sm text-muted-foreground">Organize your wishlist, put rewards toward your savings goals, and record purchases when you choose to spend.</p></article>
    </div>
   </section>
   <section className="mx-auto flex max-w-3xl flex-col items-center gap-4 px-4 py-12 text-center">
    <Sparkles className="size-6 text-warning" aria-hidden="true"/>
    <p className="text-lg text-muted-foreground">The healthier you. The curious you.<br/>The you who loves a little treat.</p>
    <h2 className="text-[clamp(2rem,4.5vw,3rem)] leading-[1.05] font-semibold tracking-[-0.03em]">There’s room for <em className={em}>all of you.</em></h2>
    <p className="text-sm text-muted-foreground">The long-term benefits are still the point.<br/>A little joy along the way can be part of the plan.</p>
   </section>
   <section className="px-4 pb-16 md:px-8"><div className="mx-auto flex max-w-6xl flex-col items-center gap-5 rounded-3xl bg-primary px-6 py-14 text-center text-primary-foreground">
    <p className="text-eyebrow text-primary-foreground/80">Your next chapter starts small</p>
    <h2 className="text-[clamp(2rem,4.5vw,3rem)] leading-[1.05] font-semibold tracking-[-0.03em]">One habit today.<br/>More to look forward to.</h2>
    <Button size="lg" className="h-11 px-5 text-sm" variant="secondary" onClick={onSignIn}>{signedIn?'Go to your daily wins':'Continue with Google'}<ArrowUpRight data-icon="inline-end"/></Button>
    <p className="text-sm text-primary-foreground/80">Pronark tracks rewards from money you set aside.<br/>It doesn’t pay cash or move money for you.</p>
   </div></section>
  </main>
  <footer className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 border-t px-4 py-8 pb-[max(2rem,env(safe-area-inset-bottom))] text-sm text-muted-foreground md:px-8"><a href="#top" aria-label="Pronark home"><Logo className="h-16"/></a><p>Small habits. A life that feels like you.</p><a href="#top" className="inline-flex items-center gap-1 hover:text-foreground">Back to top<ArrowUp className="size-3.5" aria-hidden="true"/></a></footer>
 </div>;
}

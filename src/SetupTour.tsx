import { useState } from 'react';
import { ArrowLeft, ArrowRight, GripVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SetupActions, SetupCard, SetupShell } from '@/components/setup-shell';
import { Disclosure, FieldRow, FormField } from '@/components/pronark';
import { MoneyExample } from '@/GuidedSetup';
import { CompanionCharacter, type CharacterStyle } from '@/components/companion-character';

const sampleLooks: CharacterStyle[] = [{ color: 'mint', hat: 'cap', outfit: 'hoodie' }, { color: 'lavender', hat: 'crown', outfit: 'cape' }, { color: 'peach', hat: 'beanie', outfit: 'overalls' }];

const screens=[
 {tag:'WELCOME',title:'Let’s make Pronark yours.',body:'A new member starts here, then sets up one part at a time.',faq:['Will this change my account?','No. This tour is a preview and never saves anything.']},
 {tag:'PROFILE',title:'First, a little about you.',body:'Enter a name and choose monthly step and water goals.',faq:['Can I edit these later?','Yes. Your profile and monthly goal controls remain in the app.']},
 {tag:'COMPANION',title:'Choose someone to cheer you on.',body:'Pick a color, hat and outfit for your companion; choose message frequency and reduced motion.',faq:['Will choosing here change my companion?','No. This preview does not save preferences.']},
 {tag:'YOUR CHECKLIST',title:'Build one activity at a time.',body:'Choose a suggestion or make your own. Each activity gets its own screen for days, notes, reward, optional KPI, and time of day.',faq:['Can I add activities later?','Yes. Setup only creates your starting checklist.']},
 {tag:'CHECKLIST REVIEW',title:'Put your plan in your order.',body:'Drag activity cards or use Move up/down controls, then confirm the checklist.',faq:['Does order change rewards?','No. Order affects display, not earnings.']},
 {tag:'SAVINGS GOALS',title:'Set goals that fit your priorities.',body:'Choose your own targets or use an optional budget illustration. Rank categories, then set one target at a time.',faq:['Can a target exceed my wallet?','Yes. A target is an aspiration, not money already earned.']},
 {tag:'READY',title:'Understand the three numbers.',body:'Goal target, wallet balance, and assigned progress have different jobs. Then you enter Home and start tracking.',faq:['Does this tour move money?','No. It does not earn, assign, spend, or move money.']},
];

export function SetupTour({onClose}:{onClose:()=>void}){
 const [index,setIndex]=useState(0);
 const current=screens[index];
 const tile='rounded-xl bg-muted/50 px-3.5 py-3 text-sm ring-1 ring-foreground/5';
 return <SetupShell label="Setup preview · no changes saved" step={index+1} total={screens.length} stepKey={index} actions={<Button variant="outline" size="sm" onClick={onClose}>Close preview</Button>}>
  <SetupCard eyebrow={current.tag} title={current.title}>
   <p className="text-muted-foreground" aria-live="polite">{current.body}</p>
   {index===1&&<div className="flex flex-col gap-3"><FormField label="Display name"><Input readOnly value="Your name"/></FormField><FieldRow><FormField label="Step goal"><Input readOnly value="10,000 steps"/></FormField><FormField label="Water goal"><Input readOnly value="2 liters"/></FormField></FieldRow></div>}
   {index===2&&<div className="grid grid-cols-3 gap-2" aria-label="Companion examples">{sampleLooks.map((look,i)=><CompanionCharacter key={i} style={look} interactive listen={false} className="mx-auto h-36 w-28"/>)}</div>}
   {index===3&&<div className={tile}><strong className="font-medium">🏃 Morning run</strong><small className="block text-xs text-muted-foreground">Mon · Wed · Fri · 2 miles · $2.00 reward</small></div>}
   {index===4&&<div className="flex flex-col gap-2">{['☀️ Morning routine','🏃 Morning run','💧 Water goal'].map((x,i)=><div key={x} className={tile+' flex items-center gap-2'}><GripVertical className="size-4 text-muted-foreground" aria-hidden="true"/><strong className="font-medium">{i+1}. {x}</strong></div>)}</div>}
   {index===5&&<div className="grid gap-2 sm:grid-cols-2"><div className={tile}><strong className="font-medium">Choose my own goals</strong><small className="block text-xs text-muted-foreground">Set any target amount</small></div><div className={tile}><strong className="font-medium">Guide me from a budget</strong><small className="block text-xs text-muted-foreground">Optional, private illustration</small></div></div>}
   {index===6&&<MoneyExample/>}
   <SetupActions><Button size="lg" variant="outline" disabled={index===0} onClick={()=>setIndex(index-1)}><ArrowLeft data-icon="inline-start"/>Back</Button>{index<screens.length-1?<Button size="lg" onClick={()=>setIndex(index+1)}>Next<ArrowRight data-icon="inline-end"/></Button>:<Button size="lg" onClick={onClose}>Return to my account</Button>}</SetupActions>
   <Disclosure summary="Frequently asked questions"><strong className="text-foreground">{current.faq[0]}</strong><p>{current.faq[1]}</p></Disclosure>
  </SetupCard>
 </SetupShell>;
}

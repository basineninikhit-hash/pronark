import { useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { reactionCategories, type ReactionCategory } from './companion-reactions';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { FormField, SectionHeading } from '@/components/pronark';

type Activity={id:string;title:string;revision:number;reaction_category?:ReactionCategory};
type Preference={revision:number;companion:'robot'|'dog'|'cat'|'muse'|'care';chatter:'full'|'quiet'|'off';reduced_motion:boolean};
export function ReactionSettings({client,tasks,preference,onRefresh}:{client:SupabaseClient;tasks:Activity[];preference:Preference|null;onRefresh:()=>Promise<void>}){
 const [busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const [chatter,setChatter]=useState<Preference['chatter']>(preference?.chatter??'full');
 const [reduced,setReduced]=useState(preference?.reduced_motion??false);
 async function savePrefs(){setBusy(true);setMessage('');const {error}=await client.rpc('save_experience_preferences',{p_companion:preference?.companion??'robot',p_chatter:chatter,p_reduced_motion:reduced,p_expected_revision:preference?.revision??0});if(error)setMessage(error.message);else{await onRefresh();setMessage('Companion preferences saved.')}setBusy(false)}
 async function saveCategory(t:Activity,category:ReactionCategory){setBusy(true);setMessage('');const {error}=await client.rpc('save_task_reaction_category',{p_task:t.id,p_category:category,p_expected_revision:t.revision});if(error)setMessage(error.message);else{await onRefresh();setMessage('Activity reaction saved.')}setBusy(false)}
 return <Card><CardContent className="flex flex-col gap-4">
  <SectionHeading title="Companion encouragement" description="Choose when your companion speaks and which gentle reaction fits each activity. Nothing here changes your rewards."/>
  <FormField label="Messages"><NativeSelect value={chatter} onChange={e=>setChatter(e.target.value as Preference['chatter'])}><NativeSelectOption value="full">After each completed activity and milestones</NativeSelectOption><NativeSelectOption value="quiet">Milestones only</NativeSelectOption><NativeSelectOption value="off">Off</NativeSelectOption></NativeSelect></FormField>
  <label className="flex items-center justify-between gap-3 rounded-xl bg-muted/50 px-3.5 py-3 text-sm"><span className="flex flex-col"><span className="font-medium">Reduce animations</span><span className="text-xs text-muted-foreground">Sheets fade instead of sliding, and nothing bounces.</span></span><Switch checked={reduced} onCheckedChange={v=>setReduced(v)}/></label>
  <Button className="self-start" disabled={busy||chatter===(preference?.chatter??'full')&&reduced===(preference?.reduced_motion??false)} onClick={savePrefs}>Save companion preferences</Button>
  <SectionHeading className="mt-2" title="Activity reactions" description="New or custom activities use a general message until you choose a category."/>
  <div className="flex flex-col divide-y">{tasks.map(t=><label key={t.id} className="flex items-center justify-between gap-3 py-2 text-sm"><span className="min-w-0 truncate">{t.title}</span><NativeSelect size="sm" className="w-44 shrink-0" aria-label={'Reaction for '+t.title} value={t.reaction_category??'other'} disabled={busy} onChange={e=>saveCategory(t,e.target.value as ReactionCategory)}>{reactionCategories.map(c=><NativeSelectOption key={c.id} value={c.id}>{c.cue} {c.label}</NativeSelectOption>)}</NativeSelect></label>)}</div>
  {message&&<p role="status" className="text-xs text-muted-foreground">{message}</p>}
 </CardContent></Card>;
}

import { useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { reactionCategories, type ReactionCategory } from './companion-reactions';

type Activity={id:string;title:string;revision:number;reaction_category?:ReactionCategory};
type Preference={revision:number;companion:'robot'|'dog'|'cat'|'muse'|'care';chatter:'full'|'quiet'|'off';reduced_motion:boolean};
export function ReactionSettings({client,tasks,preference,onRefresh}:{client:SupabaseClient;tasks:Activity[];preference:Preference|null;onRefresh:()=>Promise<void>}){
 const [busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const [chatter,setChatter]=useState<Preference['chatter']>(preference?.chatter??'full');
 const [reduced,setReduced]=useState(preference?.reduced_motion??false);
 async function savePrefs(){setBusy(true);setMessage('');const {error}=await client.rpc('save_experience_preferences',{p_companion:preference?.companion??'robot',p_chatter:chatter,p_reduced_motion:reduced,p_expected_revision:preference?.revision??0});if(error)setMessage(error.message);else{await onRefresh();setMessage('Companion preferences saved.')}setBusy(false)}
 async function saveCategory(t:Activity,category:ReactionCategory){setBusy(true);setMessage('');const {error}=await client.rpc('save_task_reaction_category',{p_task:t.id,p_category:category,p_expected_revision:t.revision});if(error)setMessage(error.message);else{await onRefresh();setMessage('Activity reaction saved.')}setBusy(false)}
 return <section className="card reaction-settings"><h2>Companion encouragement</h2><p>Choose when your companion speaks and which gentle reaction fits each activity. Nothing here changes your rewards.</p><label>Messages<select value={chatter} onChange={e=>setChatter(e.target.value as Preference['chatter'])}><option value="full">After each completed activity and milestones</option><option value="quiet">Milestones only</option><option value="off">Off</option></select></label><label><input type="checkbox" checked={reduced} onChange={e=>setReduced(e.target.checked)}/> Reduce animations</label><button disabled={busy||chatter===(preference?.chatter??'full')&&reduced===(preference?.reduced_motion??false)} onClick={savePrefs}>Save companion preferences</button><h3>Activity reactions</h3><p>New or custom activities use a general message until you choose a category.</p>{tasks.map(t=><label key={t.id}>{t.title}<select value={t.reaction_category??'other'} disabled={busy} onChange={e=>saveCategory(t,e.target.value as ReactionCategory)}>{reactionCategories.map(c=><option key={c.id} value={c.id}>{c.cue} {c.label}</option>)}</select></label>)}{message&&<p role="status">{message}</p>}</section>;
}

import { useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Sheet, SheetFooter } from '@/components/sheet';
import { ErrorText, FieldRow, Form, FormField } from '@/components/pronark';
type Purchase={title:string;amount_cents:number;purchase_date:string;deleted_at:string|null};
/** "Record from photo": pick a receipt photo, then review and save. Opened from Rewards → Record purchase. */
export function ReceiptCapture({client,today,purchases,onSaved,open,onClose}:{client:SupabaseClient;today:string;purchases:Purchase[];onSaved:()=>Promise<void>;open:boolean;onClose:()=>void}){
 const [file,setFile]=useState<File|null>(null),[url,setUrl]=useState('');
 const [title,setTitle]=useState(''),[amount,setAmount]=useState(''),[date,setDate]=useState(today),[note,setNote]=useState('');
 const [requestId,setRequestId]=useState(()=>crypto.randomUUID()),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{if(!file){setUrl('');return}const objectUrl=URL.createObjectURL(file);setUrl(objectUrl);return()=>URL.revokeObjectURL(objectUrl)},[file]);
 const cents=Math.round(Number(amount)*100),valid=!!file&&title.trim().length>0&&/^\d+(\.\d{1,2})?$/.test(amount)&&cents>0&&date<=today;
 const duplicate=purchases.some(p=>!p.deleted_at&&p.purchase_date===date&&p.amount_cents===cents&&p.title.trim().toLowerCase()===title.trim().toLowerCase());
 function choose(f:File|undefined){setError('');if(!f)return;if(!['image/jpeg','image/png','image/webp'].includes(f.type)||f.size>8_000_000){setError('Choose a JPEG, PNG, or WebP photo under 8 MB.');return}setFile(f)}
 async function save(){if(!valid||busy)return;setBusy(true);setError('');try{if(duplicate&&!confirm('A similar purchase is already recorded. Save another one?'))return;const {error:failure}=await client.rpc('save_purchase',{p_id:requestId,p_title:title.trim(),p_amount_cents:cents,p_date:date,p_note:note,p_wishlist:null,p_expected_revision:null});if(failure){setError(failure.message);return}await onSaved();toast.success('Purchase saved.');onClose();setFile(null);setTitle('');setAmount('');setNote('');setRequestId(crypto.randomUUID())}catch(e){setError(e instanceof Error?e.message:String(e))}finally{setBusy(false)}}
 const close=()=>{onClose();setFile(null)};
 return <>
  <Sheet open={open} onClose={close} title="Record from photo" description="Choose a receipt photo, then check the details. Nothing is recorded until you press Save purchase, and the photo is never uploaded or saved." label="Record a purchase from a receipt photo">
   <Form>
    <FormField label="Receipt photo"><Input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={e=>choose(e.target.files?.[0])}/></FormField>
    {url&&<img src={url} alt="Your selected receipt preview" className="max-h-72 w-full rounded-xl object-contain ring-1 ring-foreground/10"/>}
    <FormField label="Purchase name"><Input value={title} maxLength={200} onChange={e=>setTitle(e.target.value)}/></FormField>
    <FieldRow><FormField label="Total amount ($)"><Input inputMode="decimal" value={amount} onChange={e=>setAmount(e.target.value)}/></FormField><FormField label="Date"><Input type="date" max={today} value={date} onChange={e=>setDate(e.target.value)}/></FormField></FieldRow>
    <FormField label="Note (optional)"><Textarea value={note} maxLength={10000} onChange={e=>setNote(e.target.value)}/></FormField>
    {duplicate&&<Alert variant="warning"><AlertDescription>A similar purchase is already recorded. Check before saving another.</AlertDescription></Alert>}
    <ErrorText>{error}</ErrorText>
    <SheetFooter><Button variant="outline" onClick={close}>Cancel</Button><Button disabled={busy||!valid} onClick={save}>Save purchase</Button></SheetFooter>
   </Form>
  </Sheet>
 </>;
}

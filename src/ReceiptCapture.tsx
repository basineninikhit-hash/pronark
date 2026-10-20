import { useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { toast } from 'sonner';
import { Camera } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Sheet, SheetFooter } from '@/components/sheet';
import { ErrorText, FieldRow, Form, FormField, SectionHeading } from '@/components/pronark';
type Purchase={title:string;amount_cents:number;purchase_date:string;deleted_at:string|null};
export function ReceiptCapture({client,today,purchases,onSaved}:{client:SupabaseClient;today:string;purchases:Purchase[];onSaved:()=>Promise<void>}){
 const [open,setOpen]=useState(false),[file,setFile]=useState<File|null>(null),[url,setUrl]=useState('');
 const [title,setTitle]=useState(''),[amount,setAmount]=useState(''),[date,setDate]=useState(today),[note,setNote]=useState('');
 const [requestId,setRequestId]=useState(()=>crypto.randomUUID()),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{if(!file){setUrl('');return}const objectUrl=URL.createObjectURL(file);setUrl(objectUrl);return()=>URL.revokeObjectURL(objectUrl)},[file]);
 const cents=Math.round(Number(amount)*100),valid=!!file&&title.trim().length>0&&/^\d+(\.\d{1,2})?$/.test(amount)&&cents>0&&date<=today;
 const duplicate=purchases.some(p=>!p.deleted_at&&p.purchase_date===date&&p.amount_cents===cents&&p.title.trim().toLowerCase()===title.trim().toLowerCase());
 function choose(f:File|undefined){setError('');if(!f)return;if(!['image/jpeg','image/png','image/webp'].includes(f.type)||f.size>8_000_000){setError('Choose a JPEG, PNG, or WebP photo under 8 MB.');return}setFile(f)}
 async function save(){if(!valid||busy)return;setBusy(true);setError('');try{if(duplicate&&!confirm('A similar purchase is already recorded. Save another one?'))return;const {error:failure}=await client.rpc('save_purchase',{p_id:requestId,p_title:title.trim(),p_amount_cents:cents,p_date:date,p_note:note,p_wishlist:null,p_expected_revision:null});if(failure){setError(failure.message);return}await onSaved();toast.success('Purchase saved.');setOpen(false);setFile(null);setTitle('');setAmount('');setNote('');setRequestId(crypto.randomUUID())}catch(e){setError(e instanceof Error?e.message:String(e))}finally{setBusy(false)}}
 const close=()=>{setOpen(false);setFile(null)};
 return <Card><CardContent className="flex flex-col gap-3">
  <SectionHeading title={<span className="inline-flex items-center gap-2"><Camera className="size-4" aria-hidden="true"/>Photo-assisted purchase</span>} description="Choose a receipt photo, then enter and review its details. Automatic text reading is off; your photo stays on this device and is discarded when you close this screen."/>
  <Button variant="outline" className="self-start" onClick={()=>setOpen(true)}><Camera data-icon="inline-start"/>Use a receipt photo</Button>
  <Sheet open={open} onClose={close} title="Review a receipt" description="Nothing is recorded until you press Save purchase. No image is uploaded or saved." label="Review receipt purchase">
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
 </CardContent></Card>;
}

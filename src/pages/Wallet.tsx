import { useState } from 'react';
import { ChevronRight, Coins, Plus, Receipt, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Sheet, SheetFooter } from '@/components/sheet';
import { TimedUndoButton } from '@/components/timed-undo-button';
import { AnimatedNumber, EmptyState, ErrorText, FieldRow, Form, FormField, SectionHeading } from '@/components/pronark';
import { cn } from '@/lib/utils';
import { cents, formatDate, moneyPattern, type Earning, type Purchase, type RunAction } from '@/lib/domain';
import { rpc } from '@/lib/supabase';

export function WalletPage({ readOnly, today, earned, spent, balance, earnings, purchases, busy, error, onRun }: {
  readOnly: boolean; today: string; earned: number; spent: number; balance: number; earnings: Earning[]; purchases: Purchase[]; busy: boolean; error: string; onRun: RunAction;
}) {
  const [open, setOpen] = useState(false), [edit, setEdit] = useState<Purchase | null>(null), [showAll, setShowAll] = useState(false);
  const entries = [
    ...earnings.map((x) => ({ key: 'e' + x.id, date: x.earned_date, label: x.kind === 'base' ? 'Activity reward' : x.kind === 'bonus14' ? '14-day bonus' : '28-day bonus', amount: x.cents, purchase: null as Purchase | null })),
    ...purchases.map((x) => ({ key: 'p' + x.id, date: x.purchase_date, label: x.title, amount: -x.amount_cents, purchase: x })),
  ].sort((a, b) => b.date.localeCompare(a.date));
  const close = () => setOpen(false);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      <p className="text-sm text-muted-foreground">Small steps. A healthier, happier you.</p>
      <section className="overflow-hidden rounded-2xl bg-primary p-5 text-primary-foreground md:p-6">
        <p className="text-sm text-primary-foreground/80">Available balance</p>
        <AnimatedNumber value={balance} format={cents} className="text-display mt-1 block" />
        <div className="mt-5 grid grid-cols-2 gap-3 border-t border-primary-foreground/15 pt-4">
          <div><p className="text-xs text-primary-foreground/75">Total earned</p><p className="tabular text-lg font-semibold">{cents(earned)}</p></div>
          <div><p className="text-xs text-primary-foreground/75">Total spent</p><p className="tabular text-lg font-semibold">{cents(spent)}</p></div>
        </div>
      </section>
      {balance < 0 && (
        <Alert variant="warning"><AlertDescription>Your in-app wallet is {cents(-balance)} below zero. Pronark is meant to reward waiting and saving—not buying ahead. Normal activity rewards first repay the shortfall, while streak bonuses pause until your balance is positive. This is not real debt.</AlertDescription></Alert>
      )}
      {!readOnly && <Button size="lg" className="self-start" onClick={() => { setEdit(null); setOpen(true); }}><Plus data-icon="inline-start" />Record purchase</Button>}
      <Card>
        <CardContent className="flex flex-col gap-2">
          <SectionHeading title="Recent activity" action={entries.length > 3 && <Button variant="ghost" size="sm" onClick={() => setShowAll(!showAll)}>{showAll ? 'Show less' : 'See all'}</Button>} />
          {entries.length ? (
            <ul className="-mx-1 flex flex-col">
              {(showAll ? entries : entries.slice(0, 3)).map((x) => {
                const row = (
                  <>
                    <span className={cn('grid size-9 shrink-0 place-items-center rounded-full', x.amount < 0 ? 'bg-muted text-muted-foreground' : 'bg-primary/12 text-primary')}>
                      {x.amount < 0 ? <Receipt className="size-4" aria-hidden="true" /> : <Coins className="size-4" aria-hidden="true" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <strong className="block truncate text-sm font-medium">{x.label}</strong>
                      <small className="text-xs text-muted-foreground">{formatDate(x.date, { month: 'long', day: 'numeric' })}</small>
                    </span>
                    <b className={cn('tabular text-sm font-semibold', x.amount >= 0 ? 'text-primary' : 'text-foreground')}>{x.amount >= 0 ? '+' : '−'}{cents(Math.abs(x.amount))}</b>
                  </>
                );
                return (
                  <li key={x.key}>
                    {x.purchase && !readOnly ? (
                      <button type="button" aria-label={'Edit ' + x.label} onClick={() => { setEdit(x.purchase); setOpen(true); }}
                        className="flex w-full items-center gap-3 rounded-lg px-1 py-2 text-left transition-[background-color,scale] duration-100 hover:bg-muted/60 active:scale-[0.99]">
                        {row}<ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />
                      </button>
                    ) : <div className="flex items-center gap-3 px-1 py-2">{row}</div>}
                  </li>
                );
              })}
            </ul>
          ) : <EmptyState>No earnings or purchases yet.</EmptyState>}
        </CardContent>
      </Card>
      {!readOnly && <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"><Sparkles className="size-3.5" aria-hidden="true" />Build habits. Enjoy your rewards.</p>}

      <Sheet open={open} onClose={close} title={edit ? 'Edit purchase' : 'Record purchase'}>
        <PurchaseForm key={edit?.id ?? 'new'} purchase={edit} error={error} today={today} balance={balance} busy={busy} onClose={close}
          onSave={(id, title, amount, date, note) => onRun(() => rpc('save_purchase', { p_id: edit?.id ?? id, p_title: title, p_amount_cents: amount, p_date: date, p_note: note, p_wishlist: edit?.linked_wishlist_id ?? null, p_expected_revision: edit?.revision ?? null }), edit ? 'Purchase updated.' : 'Purchase saved.').then((ok) => { if (ok) close(); return ok; })}
          onDelete={edit ? () => onRun(() => rpc('delete_purchase', { p_id: edit.id, p_expected_revision: edit.revision }), 'Purchase deleted.').then((ok) => { if (ok) close(); return ok; }) : undefined} />
      </Sheet>
    </div>
  );
}

function PurchaseForm({ purchase, today, balance, busy, error, onClose, onSave, onDelete }: {
  purchase: Purchase | null; today: string; balance: number; busy: boolean; error: string; onClose: () => void;
  onSave: (id: string, title: string, amount: number, date: string, note: string) => Promise<boolean>; onDelete?: () => Promise<boolean>;
}) {
  const [requestId] = useState(() => crypto.randomUUID()), [title, setTitle] = useState(purchase?.title ?? ''), [amount, setAmount] = useState(purchase ? (purchase.amount_cents / 100).toFixed(2) : ''), [date, setDate] = useState(purchase?.purchase_date ?? today), [note, setNote] = useState(purchase?.note ?? '');
  const projected = balance + (purchase?.amount_cents ?? 0) - Math.round(Number(amount) * 100);
  const valid = title.trim() && moneyPattern.test(amount) && Number(amount) > 0 && date <= today;
  return (
    <Form>
      <FormField label="Name"><Input value={title} onChange={(e) => setTitle(e.target.value)} /></FormField>
      <FieldRow>
        <FormField label="Amount ($)"><Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" /></FormField>
        <FormField label="Date"><Input type="date" max={today} value={date} onChange={(e) => setDate(e.target.value)} /></FormField>
      </FieldRow>
      <FormField label="Note (optional)"><Textarea value={note} onChange={(e) => setNote(e.target.value)} /></FormField>
      {projected < 0 && <Alert variant="warning"><AlertDescription>This would put your in-app wallet {cents(-projected)} below zero. Pronark is designed for delayed gratification: the immediate win is seeing savings grow. Normal activity rewards repay a deficit; streak bonuses pause until your balance is positive.</AlertDescription></Alert>}
      <ErrorText>{error}</ErrorText>
      {onDelete && <div className="flex flex-col items-start gap-1.5"><TimedUndoButton disabled={busy} label="Delete purchase" undoLabel="Keep purchase" runningLabel="Deleting…" onConfirm={onDelete} /><p className="text-xs text-muted-foreground">It’s removed from your spending, and the amount returns to your balance.</p></div>}
      <SheetFooter>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button disabled={busy || !valid} onClick={() => { if (projected < 0 && !confirm('Record this purchase despite the negative wallet warning?')) return; onSave(requestId, title, Math.round(Number(amount) * 100), date, note); }}>Save purchase</Button>
      </SheetFooter>
    </Form>
  );
}

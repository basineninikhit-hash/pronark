import { useState, type ReactNode } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Camera, ChevronDown, ChevronRight, Coins, Info, PencilLine, Plus, Receipt, Star, Wallet as WalletIcon } from 'lucide-react';
import { CoinsDoodle } from '@/components/doodles';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Sheet, SheetFooter } from '@/components/sheet';
import { TimedUndoButton } from '@/components/timed-undo-button';
import { AnimatedNumber, EmptyState, ErrorText, FieldRow, Form, FormField, SectionHeading } from '@/components/pronark';
import { ReceiptCapture } from '@/ReceiptCapture';
import { cn } from '@/lib/utils';
import { cents, formatDate, moneyPattern, type Earning, type Purchase, type RunAction } from '@/lib/domain';
import { rpc } from '@/lib/supabase';

type Entry = { key: string; date: string; label: string; detail: string; amount: number; purchase: Purchase | null };

export function WalletPage({ client, readOnly, today, earned, spent, balance, earnings, purchases, busy, error, onRun, onReceiptSaved }: {
  client: SupabaseClient; readOnly: boolean; today: string; earned: number; spent: number; balance: number; earnings: Earning[]; purchases: Purchase[];
  busy: boolean; error: string; onRun: RunAction; onReceiptSaved: () => Promise<void>;
}) {
  // Which surface is open: the "how do you want to record it?" chooser, the photo flow, or the purchase form.
  const [sheet, setSheet] = useState<'choose' | 'photo' | 'form' | null>(null);
  const [edit, setEdit] = useState<Purchase | null>(null), [showAll, setShowAll] = useState(false);
  const entries: Entry[] = [
    ...earnings.map((x) => ({ key: 'e' + x.id, date: x.earned_date, label: x.kind === 'base' ? 'Activity reward' : x.kind === 'bonus14' ? '14-day streak bonus' : '28-day streak bonus', detail: 'Earned from your habits', amount: x.cents, purchase: null })),
    ...purchases.map((x) => ({ key: 'p' + x.id, date: x.purchase_date, label: x.title, detail: 'Self-reported purchase', amount: -x.amount_cents, purchase: x })),
  ].sort((a, b) => b.date.localeCompare(a.date));
  const shown = showAll ? entries : entries.slice(0, 4);
  const close = () => setSheet(null);
  const pick = (next: 'photo' | 'form') => { setEdit(null); setSheet(next); };

  return (
    <div className="flex w-full max-w-5xl flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <MoneyCard tone="mint" icon={<CoinsDoodle />} label="Available in wallet" value={balance} hint="Ready to use for your rewards." />
        <MoneyCard tone="lavender" icon={<Star className="size-9" strokeWidth={1.75} />} label="Total earned" value={earned} hint="From your habit progress." />
        <MoneyCard tone="peach" icon={<WalletIcon className="size-9" strokeWidth={1.75} />} label="Recorded spending" value={spent} hint="On rewards you chose." />
      </div>
      <p className="flex items-center gap-3 rounded-2xl bg-lavender px-4 py-3 text-sm text-lavender-ink">
        <Info className="size-5 shrink-0" aria-hidden="true" />Pronark tracks rewards you set aside; it does not move money.
      </p>
      {balance < 0 && (
        <Alert variant="warning"><AlertDescription>Your in-app wallet is {cents(-balance)} below zero. Pronark is meant to reward waiting and saving—not buying ahead. Normal activity rewards first repay the shortfall, while streak bonuses pause until your balance is positive. This is not real debt.</AlertDescription></Alert>
      )}

      <Card>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-title font-bold">Recent activity</h2>
              <p className="mt-0.5 text-sm text-muted-foreground">Your reward-related activity, newest first.</p>
            </div>
            {!readOnly && <Button size="lg" className="h-11 px-5 text-sm" onClick={() => setSheet('choose')}><Plus data-icon="inline-start" />Record purchase</Button>}
          </div>
          {entries.length ? (
            <ul className="flex flex-col gap-2">
              {shown.map((x) => {
                const row = (
                  <>
                    <span className={cn('grid size-12 shrink-0 place-items-center rounded-full ring-1 ring-foreground/8', x.amount < 0 ? 'bg-card text-ink' : 'bg-mint text-mint-ink')}>
                      {x.amount < 0 ? <Receipt className="size-5" strokeWidth={1.75} aria-hidden="true" /> : <Coins className="size-5" strokeWidth={1.75} aria-hidden="true" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <strong className="block truncate text-base font-semibold">{x.label}</strong>
                      <small className="text-sm text-muted-foreground">{x.detail}</small>
                    </span>
                    <span className="shrink-0 text-right">
                      <b className={cn('tabular block text-base font-bold', x.amount >= 0 ? 'text-primary' : 'text-foreground')}>{x.amount >= 0 ? '+' : '-'}{cents(Math.abs(x.amount))}</b>
                      <small className="text-sm text-muted-foreground">{formatDate(x.date, { month: 'short', day: 'numeric', year: 'numeric' })}</small>
                    </span>
                  </>
                );
                return (
                  <li key={x.key}>
                    {x.purchase && !readOnly ? (
                      <button type="button" aria-label={'Edit ' + x.label} onClick={() => { setEdit(x.purchase); setSheet('form'); }}
                        className="flex w-full items-center gap-4 rounded-2xl bg-muted/50 p-3.5 text-left transition-[background-color,scale] duration-100 hover:bg-muted active:scale-[0.99]">
                        {row}
                      </button>
                    ) : <div className="flex items-center gap-4 rounded-2xl bg-muted/50 p-3.5">{row}</div>}
                  </li>
                );
              })}
            </ul>
          ) : <EmptyState>No earnings or purchases yet. Check off a habit to earn your first reward.</EmptyState>}
          {entries.length > 4 && (
            <Button variant="outline" size="lg" className="h-11 w-full text-sm" onClick={() => setShowAll(!showAll)} aria-expanded={showAll}>
              {showAll ? 'Show less' : 'View all activity'}{showAll ? <ChevronDown data-icon="inline-end" className="rotate-180" /> : <ChevronRight data-icon="inline-end" />}
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Record purchase → choose how. */}
      <Sheet open={sheet === 'choose'} onClose={close} title="Record a purchase" description="How would you like to add it?">
        <div className="grid gap-3 sm:grid-cols-2">
          <ChoiceCard icon={<Camera className="size-6" strokeWidth={1.75} />} title="Record from photo" onClick={() => pick('photo')}>Use a receipt photo to help you fill in the details. The photo stays on your device.</ChoiceCard>
          <ChoiceCard icon={<PencilLine className="size-6" strokeWidth={1.75} />} title="New purchase" onClick={() => pick('form')}>Type in what you got, how much it cost and when.</ChoiceCard>
        </div>
      </Sheet>
      {!readOnly && <ReceiptCapture client={client} today={today} purchases={purchases} onSaved={onReceiptSaved} open={sheet === 'photo'} onClose={close} />}
      <Sheet open={sheet === 'form'} onClose={close} title={edit ? 'Edit purchase' : 'New purchase'}>
        <PurchaseForm key={edit?.id ?? 'new'} purchase={edit} error={error} today={today} balance={balance} busy={busy} onClose={close}
          onSave={(id, title, amount, date, note) => onRun(() => rpc('save_purchase', { p_id: edit?.id ?? id, p_title: title, p_amount_cents: amount, p_date: date, p_note: note, p_wishlist: edit?.linked_wishlist_id ?? null, p_expected_revision: edit?.revision ?? null }), edit ? 'Purchase updated.' : 'Purchase saved. Enjoy it!').then((ok) => { if (ok) close(); return ok; })}
          onDelete={edit ? () => onRun(() => rpc('delete_purchase', { p_id: edit.id, p_expected_revision: edit.revision }), 'Purchase deleted.').then((ok) => { if (ok) close(); return ok; }) : undefined} />
      </Sheet>
    </div>
  );
}

function ChoiceCard({ icon, title, children, onClick }: { icon: ReactNode; title: string; children: ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className="flex flex-col items-start gap-3 rounded-2xl bg-card p-4 text-left ring-1 ring-foreground/10 transition-[background-color,box-shadow,scale] duration-100 hover:bg-mint/40 hover:ring-primary/40 active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-ring/50 outline-none">
      <span className="grid size-12 place-items-center rounded-full bg-mint text-mint-ink">{icon}</span>
      <span>
        <strong className="flex items-center gap-1 text-base font-semibold">{title}<ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" /></strong>
        <span className="mt-0.5 block text-sm text-muted-foreground">{children}</span>
      </span>
    </button>
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

function MoneyCard({ tone, icon, label, value, hint }: { tone: 'mint' | 'lavender' | 'peach'; icon: ReactNode; label: string; value: number; hint: string }) {
  return (
    <div className={cn('relative flex flex-col items-center gap-1 overflow-hidden rounded-2xl px-4 pt-4 pb-5 text-center ring-1 ring-inset',
      tone === 'mint' ? 'bg-mint text-mint-ink ring-primary/15' : tone === 'lavender' ? 'bg-lavender text-lavender-ink ring-lavender-ink/10' : 'bg-peach text-peach-ink ring-peach-ink/10')}>
      <span className="grid size-14 place-items-center rounded-full bg-card/70 text-ink shadow-sm" aria-hidden="true">{icon}</span>
      <p className="mt-1 text-sm font-semibold text-foreground">{label}</p>
      <AnimatedNumber value={value} format={cents} className="text-[2rem] leading-tight font-bold tracking-tight text-foreground" />
      <p className="text-xs opacity-85">{hint}</p>
    </div>
  );
}

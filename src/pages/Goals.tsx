import { useLayoutEffect, useRef, useState, type ComponentType } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ChevronLeft, ChevronRight, Ellipsis, Gem, Info, Laptop, Pencil, Plane, Plus, Shirt, Sofa, Sparkles, Ticket, Wallet as WalletIcon, type LucideProps } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Sheet, SheetFooter } from '@/components/sheet';
import { EmptyState, FieldRow, Form, FormField, Meter, NotePanel, SectionHeading } from '@/components/pronark';
import { SignpostDoodle } from '@/components/doodles';
import { GoalTargetPlan } from '@/GoalTargetPlan';
import { cn } from '@/lib/utils';
import { cents, moneyPattern, type Allocation, type Category, type ItemAllocation, type RunAction, type Wish } from '@/lib/domain';
import { rpc } from '@/lib/supabase';
import { prefersReducedMotion, useSpring } from '@/lib/motion';

const goalOrder = ['Clothes', 'Tech', 'Jewelry', 'Home items', 'Experiences', 'Travel', 'Other'];
const goalIcons: Record<string, ComponentType<LucideProps>> = { Clothes: Shirt, Tech: Laptop, Jewelry: Gem, 'Home items': Sofa, Experiences: Ticket, Travel: Plane, Other: Ellipsis };
function GoalIcon({ category, className }: { category: string; className?: string }) {
  const Icon = goalIcons[category] ?? Sparkles;
  return <span className={cn('grid size-10 shrink-0 place-items-center rounded-xl bg-lavender text-lavender-ink', className)}><Icon className="size-5" strokeWidth={1.75} aria-hidden="true" /></span>;
}
function rewardNotice(before: number, after: number, target: number, name: string) {
  if (target <= 0) return 'Savings assigned.';
  const reached = [25, 50, 100].filter((m) => before * 100 < target * m && after * 100 >= target * m).at(-1);
  return reached ? `${name} reached ${reached}% funded! Keep enjoying the progress toward your reward.` : 'Savings assigned. Your progress is growing.';
}
const percent = (n: number, d: number) => (d > 0 ? Math.min(100, Math.max(0, Math.round((n / d) * 100))) : 0);
const milestoneLabel = (p: number) => (p >= 100 ? 'Funded' : p >= 50 ? 'Halfway' : p >= 25 ? '25% milestone' : 'Getting started');

export function GoalsPage({ client, owner, readOnly, balance, categories, wishes, allocations, itemAllocations, itemAllocationReady, busy, today, onRun }: {
  client: SupabaseClient; owner: string; readOnly: boolean; balance: number; categories: Category[]; wishes: Wish[]; allocations: Allocation[];
  itemAllocations: ItemAllocation[]; itemAllocationReady: boolean; busy: boolean; today: string; onRun: RunAction;
}) {
  const [selectedId, setSelectedId] = useState(''), [editing, setEditing] = useState<Wish | null | undefined>(undefined), [buying, setBuying] = useState<Wish | null>(null);
  const [funding, setFunding] = useState(false), [targetOpen, setTargetOpen] = useState(false), [itemFund, setItemFund] = useState<Wish | null>(null);
  const mine = categories.filter((x) => x.owner_id === owner).sort((a, b) => (a.priority_order ?? 1000) - (b.priority_order ?? 1000) || goalOrder.indexOf(a.category_key) - goalOrder.indexOf(b.category_key));
  const selected = mine.find((x) => x.id === selectedId);
  const allocated = allocations.filter((x) => x.owner_id === owner).reduce((n, x) => n + x.cents, 0), unallocated = balance - allocated;
  const active = (id: string) => wishes.filter((w) => w.category_id === id && w.status === 'active');
  const saved = (id: string) => allocations.filter((a) => a.category_id === id).reduce((n, a) => n + a.cents, 0);
  const itemSaved = (id: string) => itemAllocations.find((a) => a.item_id === id)?.cents ?? 0;
  const freeInCategory = (id: string) => saved(id) - active(id).reduce((n, w) => n + itemSaved(w.id), 0);
  const items = selected ? active(selected.id) : [], itemTotal = items.reduce((n, w) => n + w.estimated_cents, 0);
  const target = (selected?.general_target_cents ?? 0) + itemTotal, funded = selected ? saved(selected.id) : 0;
  const nextUp = mine.map((c) => ({ category: c, target: (c.general_target_cents ?? 0) + active(c.id).reduce((n, w) => n + w.estimated_cents, 0), amount: saved(c.id) }))
    .filter((x) => x.target > 0 && x.amount < x.target).sort((a, b) => (a.target - a.amount) - (b.target - b.amount))[0];

  // Push/pop: detail enters from the right and leaves the way it came.
  const viewRef = useRef<HTMLDivElement>(null), direction = useRef(0);
  const push = useSpring(0, (v) => { if (viewRef.current) { viewRef.current.style.translate = `${(v * 40).toFixed(2)}px 0`; viewRef.current.style.opacity = String(1 - Math.min(1, Math.abs(v)) * 0.8); } }, { precision: 0.002 });
  const open = (id: string) => { direction.current = id ? 1 : -1; setSelectedId(id); window.scrollTo({ top: 0 }); };
  useLayoutEffect(() => { if (direction.current && !prefersReducedMotion()) { push.set(direction.current); push.to(0, { damping: 1, response: 0.4 }); } direction.current = 0; }, [selectedId, push]);

  return (
    <div className="w-full max-w-5xl">
      <div ref={viewRef} className="flex flex-col gap-5">
        {!selected ? (
          <>
            <Card>
              <CardContent className="flex flex-wrap items-center gap-4">
                <span className="grid size-11 place-items-center rounded-full bg-mint text-mint-ink"><WalletIcon className="size-5" aria-hidden="true" /></span>
                <div className="flex-1"><p className="text-xs text-muted-foreground">Wallet balance</p><p className="tabular text-2xl font-semibold tracking-tight">{cents(balance)}</p></div>
                <div className="grid grid-cols-2 gap-x-6 gap-y-0.5 text-xs">
                  <span className="text-muted-foreground">Assigned</span><span className="text-muted-foreground">Available</span>
                  <strong className="tabular text-sm">{cents(allocated)}</strong><strong className="tabular text-sm">{cents(Math.max(0, unallocated))}</strong>
                </div>
              </CardContent>
            </Card>
            {balance < 0 && <Alert variant="warning"><AlertDescription>Your in-app wallet is {cents(-balance)} below zero. Pronark is designed to make saving toward rewards satisfying, not to encourage buying ahead. Activity rewards repay this shortfall; streak bonuses pause until your balance is positive.</AlertDescription></Alert>}
            {allocated > Math.max(0, balance) && <Alert variant="warning"><AlertDescription>Assignments exceed the current wallet by {cents(allocated - Math.max(0, balance))}. New assignments are paused until the balance catches up.</AlertDescription></Alert>}
            {!itemAllocationReady && <Alert variant="info"><AlertDescription>Item assignments need the new Rewards database migration. Category savings still display.</AlertDescription></Alert>}
            {nextUp && (
              <button type="button" onClick={() => open(nextUp.category.id)} className="flex items-center gap-4 rounded-2xl bg-gradient-to-br from-warning/15 to-transparent p-4 text-left ring-1 ring-warning/30 transition-[scale] duration-100 active:scale-[0.99]">
                <GoalIcon category={nextUp.category.category_key} className="bg-warning/20 text-warning-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="text-eyebrow text-warning-foreground">Next reward in reach</div>
                  <strong className="text-headline">{nextUp.category.category_key}</strong>
                  <p className="text-xs text-muted-foreground">{cents(nextUp.target - nextUp.amount)} to fully fund · {percent(nextUp.amount, nextUp.target)}% there</p>
                </div>
                <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />
              </button>
            )}
            <div className="grid gap-2.5 sm:grid-cols-2">
              {mine.map((c) => {
                const total = (c.general_target_cents ?? 0) + active(c.id).reduce((n, w) => n + w.estimated_cents, 0), amount = saved(c.id), p = percent(amount, total);
                return (
                  <button type="button" key={c.id} onClick={() => open(c.id)}
                    className="flex items-center gap-3 rounded-xl bg-card p-3.5 text-left ring-1 ring-foreground/10 transition-[background-color,scale] duration-100 hover:bg-muted/40 active:scale-[0.98]">
                    <GoalIcon category={c.category_key} />
                    <span className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="flex items-center justify-between gap-2">
                        <strong className="truncate text-sm font-semibold">{c.category_key}</strong>
                        {total > 0 && <Badge variant={p >= 100 ? 'default' : 'secondary'}>{p}% · {milestoneLabel(p)}</Badge>}
                      </span>
                      {total > 0 ? (
                        <>
                          <small className="tabular text-xs text-muted-foreground">{cents(amount)} saved of {cents(total)}</small>
                          <Meter value={amount} max={total} />
                        </>
                      ) : <small className="text-xs text-muted-foreground">No target yet · set a savings goal of any amount</small>}
                    </span>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  </button>
                );
              })}
            </div>
            {!mine.length && <EmptyState>Categories are loading. If they stay empty, refresh the page.</EmptyState>}
            <ControlNote />
          </>
        ) : (
          <>
            <Button variant="ghost" className="-ml-2 self-start" onClick={() => open('')} aria-label="Back to goals"><ChevronLeft data-icon="inline-start" />Goals</Button>
            <Card>
              <CardContent className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-3">
                    <GoalIcon category={selected.category_key} className="size-12" />
                    <h2 className="text-title min-w-0 flex-1 truncate">{selected.category_key}</h2>
                    {!readOnly && <Button variant="outline" size="sm" className="shrink-0" onClick={() => setTargetOpen(true)}><Pencil data-icon="inline-start" />{selected.general_target_cents ? 'Edit goal' : 'Set goal'}</Button>}
                  </div>
                  <p className="text-sm text-muted-foreground"><strong className="tabular text-foreground">{cents(funded)}</strong> earned dollars assigned toward a {cents(target)} goal</p>
                </div>
                <div className="flex flex-col gap-2">
                  <Meter value={funded} max={target} className="h-2.5" label={`${percent(funded, target)}% funded`} />
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">{target > 0 ? (percent(funded, target) >= 100 ? 'Goal funded' : percent(funded, target) >= 50 ? 'Next milestone: 100%' : percent(funded, target) >= 25 ? 'Next milestone: 50%' : 'Next milestone: 25%') : 'Set a target to begin'}</span>
                    <strong className="tabular">{target > 0 ? percent(funded, target) + '%' : '—'}</strong>
                  </div>
                </div>
                {target > 0 && (
                  <div className="flex gap-1.5" aria-label="Savings milestones">
                    {[25, 50, 100].map((m) => <Badge key={m} variant={funded * 100 >= target * m ? 'default' : 'outline'}>{funded * 100 >= target * m && <Sparkles aria-hidden="true" />}{m}%</Badge>)}
                  </div>
                )}
                <dl className="grid grid-cols-2 gap-3 rounded-xl bg-muted/50 p-3 text-xs sm:grid-cols-3">
                  <div><dt className="text-muted-foreground">Category goal</dt><dd className="tabular text-sm font-medium">{cents(selected.general_target_cents ?? 0)}</dd></div>
                  <div><dt className="text-muted-foreground">Active items</dt><dd className="tabular text-sm font-medium">{cents(itemTotal)}</dd></div>
                  <div><dt className="text-muted-foreground">{funded > target ? 'Surplus' : 'Remaining'}</dt><dd className="tabular text-sm font-medium">{funded > target ? cents(funded - target) : cents(Math.max(0, target - funded))}</dd></div>
                  <div className="col-span-2 sm:col-span-3"><dt className="text-muted-foreground">Free in {selected.category_key}</dt><dd className="tabular text-sm font-medium">{cents(Math.max(0, freeInCategory(selected.id)))}</dd></div>
                </dl>
                {!readOnly && (
                  <div className="flex flex-col gap-2">
                    <p className="text-xs text-muted-foreground">Your goal amount is independent of your wallet. Assign the dollars you earn when you are ready; {cents(Math.max(0, unallocated))} is available now.</p>
                    <Button size="lg" className="self-start" disabled={busy || unallocated <= 0} onClick={() => setFunding(true)}>Assign earned dollars</Button>
                  </div>
                )}
              </CardContent>
            </Card>

            <section className="flex flex-col gap-3">
              <SectionHeading title={`Wishlist (${items.length})`} description="Items you’re saving for" action={!readOnly && <Button variant="secondary" onClick={() => setEditing(null)}><Plus data-icon="inline-start" />Add item</Button>} />
              {items.map((w) => (
                <div key={w.id} className="flex flex-col gap-4 rounded-2xl bg-card p-4 ring-1 ring-foreground/8 sm:flex-row sm:items-center">
                  <span className="grid h-28 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-lavender to-peach text-ink sm:w-36"><GoalIcon category={selected.category_key} className="size-14 bg-card/70 [&_svg]:size-7" /></span>
                  <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <strong className="truncate text-lg font-semibold">{w.title}</strong>
                      {!readOnly && <Button variant="ghost" size="icon-sm" aria-label={'Edit ' + w.title} onClick={() => setEditing(w)}><Pencil /></Button>}
                    </div>
                    <div className="flex items-center gap-3">
                      <Meter value={itemSaved(w.id)} max={w.estimated_cents} className="h-2.5 flex-1" label={`${percent(itemSaved(w.id), w.estimated_cents)}% assigned`} />
                      <span className="tabular shrink-0 text-sm text-muted-foreground">{cents(itemSaved(w.id))} / {cents(w.estimated_cents)}</span>
                    </div>
                    {!readOnly && (
                      <div className="flex flex-wrap gap-2">
                        <Button variant="outline" className="flex-1" disabled={busy || !itemAllocationReady} onClick={() => setItemFund(w)}>Assign from wallet</Button>
                        <Button variant="ghost" disabled={busy} onClick={() => setBuying(w)}>Record purchase</Button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {!items.length && <EmptyState>No items yet. {!readOnly && 'Add an item to save toward a specific reward.'}</EmptyState>}
              {wishes.some((w) => w.category_id === selected.id && w.status === 'purchased') && (
                <div className="flex flex-col gap-1.5">
                  <h3 className="text-eyebrow text-muted-foreground">Enjoyed rewards</h3>
                  {wishes.filter((w) => w.category_id === selected.id && w.status === 'purchased').map((w) => <p key={w.id} className="inline-flex items-center gap-1.5 text-sm"><Sparkles className="size-3.5 text-warning" aria-hidden="true" />{w.title} · Purchased</p>)}
                </div>
              )}
              <ControlNote />
            </section>
            <GoalTargetPlan key={selected.id} client={client} categoryId={selected.id} today={today} readOnly={readOnly} />
          </>
        )}
      </div>

      <Sheet open={!!selected && editing !== undefined} onClose={() => setEditing(undefined)} title={editing ? 'Edit item' : 'Add to ' + (selected?.category_key ?? '')}>
        {selected && editing !== undefined && <WishForm key={editing?.id ?? 'new'} item={editing} busy={busy} onClose={() => setEditing(undefined)}
          onSave={(title, estimate, url, note) => onRun(() => rpc('save_wishlist_item', { p_id: editing?.id ?? crypto.randomUUID(), p_category: selected.id, p_title: title, p_estimated: estimate, p_url: url || null, p_note: note, p_expected_revision: editing?.revision ?? null }), 'Goal item saved.').then((ok) => { if (ok) setEditing(undefined); return ok; })} />}
      </Sheet>

      <Sheet open={!!buying} onClose={() => setBuying(null)} title="Record purchase" description={buying ? `Assigned to this item: ${cents(itemSaved(buying.id))}. Buying spends from your wallet; any item savings left over stay in the category.` : undefined}>
        {buying && <GoalPurchaseForm key={buying.id} item={buying} today={today} balance={balance} assigned={itemSaved(buying.id)} busy={busy} onClose={() => setBuying(null)}
          onSave={(id, title, amount, date, note) => onRun(() => rpc('save_purchase', { p_id: id, p_title: title, p_amount_cents: amount, p_date: date, p_note: note, p_wishlist: buying.id, p_expected_revision: null }), 'Purchase recorded.').then((ok) => { if (ok) setBuying(null); return ok; })} />}
      </Sheet>

      <Sheet open={targetOpen && !!selected} onClose={() => setTargetOpen(false)} title={(selected?.category_key ?? '') + ' savings goal'}
        description={`Set the amount you want to save, even if your wallet has less right now. This goal does not assign or spend earned dollars. Active item goals add ${cents(itemTotal)} to this category; purchased items leave that total.`}>
        {selected && <AmountForm key={selected.id} label="Amount you want to save ($)" placeholder="500.00" initial={((selected.general_target_cents ?? 0) / 100).toFixed(2)} max={1000000} busy={busy} submit="Save savings goal" onClose={() => setTargetOpen(false)}
          onSave={(amount) => onRun(() => rpc('save_category_target', { p_category: selected.id, p_cents: amount, p_expected_revision: selected.revision }), 'General target saved.').then((ok) => { if (ok) setTargetOpen(false); return ok; })} />}
      </Sheet>

      <Sheet open={funding && !!selected} onClose={() => setFunding(false)} title={'Assign earned dollars to ' + (selected?.category_key ?? '')}
        description={`Your savings goal can be any amount. You have earned ${cents(Math.max(0, unallocated))} that is not yet assigned. Assigning it shows progress without changing your wallet balance.`}>
        {selected && <AmountForm label="Amount ($)" placeholder="0.00" initial="" maxCents={unallocated} busy={busy} submit="Assign earned dollars" onClose={() => setFunding(false)}
          onSave={(amount) => onRun(() => rpc('fund_category', { p_category: selected.id, p_cents: amount, p_move_from: null }), rewardNotice(funded, funded + amount, target, selected.category_key)).then((ok) => { if (ok) setFunding(false); return ok; })} />}
      </Sheet>

      <Sheet open={!!itemFund && !!selected} onClose={() => setItemFund(null)} title={'Assign to ' + (itemFund?.title ?? '')}
        description={itemFund ? `Item progress: ${cents(itemSaved(itemFund.id))} of ${cents(itemFund.estimated_cents)}. Savings stay in your wallet until a purchase is recorded.` : undefined}>
        {itemFund && selected && <ItemFundForm key={itemFund.id} category={selected.category_key} available={unallocated} categoryFree={freeInCategory(selected.id)} saved={itemSaved(itemFund.id)} busy={busy} onClose={() => setItemFund(null)}
          onAssign={(amount, source) => onRun(() => rpc('assign_item', { p_item: itemFund.id, p_cents: amount, p_source: source }), rewardNotice(itemSaved(itemFund.id), itemSaved(itemFund.id) + amount, itemFund.estimated_cents, itemFund.title)).then((ok) => { if (ok) setItemFund(null); })}
          onRelease={(amount) => onRun(() => rpc('release_item_savings', { p_item: itemFund.id, p_cents: amount }), 'Savings returned to this category.').then((ok) => { if (ok) setItemFund(null); })} />}
      </Sheet>
    </div>
  );
}

function AmountForm({ label, placeholder, initial, max, maxCents, busy, submit, onClose, onSave }: { label: string; placeholder: string; initial: string; max?: number; maxCents?: number; busy: boolean; submit: string; onClose: () => void; onSave: (cents: number) => Promise<boolean> }) {
  const [amount, setAmount] = useState(initial);
  const value = Math.round(Number(amount) * 100);
  const valid = moneyPattern.test(amount) && (max === undefined || Number(amount) <= max) && (maxCents === undefined || (Number(amount) > 0 && value <= maxCents));
  return (
    <Form>
      <FormField label={label}><Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={placeholder} autoComplete="off" /></FormField>
      <SheetFooter>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button disabled={busy || !valid} onClick={() => onSave(value)}>{submit}</Button>
      </SheetFooter>
    </Form>
  );
}

function ItemFundForm({ category, available, categoryFree, saved, busy, onClose, onAssign, onRelease }: { category: string; available: number; categoryFree: number; saved: number; busy: boolean; onClose: () => void; onAssign: (cents: number, source: 'wallet' | 'category') => void; onRelease: (cents: number) => void }) {
  const [amount, setAmount] = useState(''), [source, setSource] = useState<'wallet' | 'category'>(available > 0 ? 'wallet' : 'category');
  const value = Math.round(Number(amount) * 100), valid = /^[0-9]+([.][0-9]{1,2})?$/.test(amount) && Number(amount) > 0;
  return (
    <Form>
      <FormField label="Source">
        <NativeSelect value={source} onChange={(e) => setSource(e.target.value as 'wallet' | 'category')}>
          <NativeSelectOption value="wallet">Earned dollars available · {cents(Math.max(0, available))}</NativeSelectOption>
          <NativeSelectOption value="category">{category} savings · {cents(Math.max(0, categoryFree))}</NativeSelectOption>
        </NativeSelect>
      </FormField>
      <FormField label="Amount ($)"><Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" /></FormField>
      {saved > 0 && <Button variant="ghost" className="self-start" disabled={busy || !valid || value > saved} onClick={() => onRelease(value)}>Return this amount to {category}</Button>}
      <SheetFooter>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button disabled={busy || !valid || value > (source === 'wallet' ? available : categoryFree)} onClick={() => onAssign(value, source)}>Assign</Button>
      </SheetFooter>
    </Form>
  );
}

function WishForm({ item, busy, onClose, onSave }: { item: Wish | null; busy: boolean; onClose: () => void; onSave: (title: string, estimate: number, url: string, note: string) => Promise<boolean> }) {
  const [title, setTitle] = useState(item?.title ?? ''), [estimate, setEstimate] = useState(item ? (item.estimated_cents / 100).toFixed(2) : ''), [url, setUrl] = useState(item?.external_url ?? ''), [note, setNote] = useState(item?.note ?? '');
  return (
    <Form>
      <FormField label="Name"><Input value={title} onChange={(e) => setTitle(e.target.value)} /></FormField>
      <FieldRow>
        <FormField label="Estimated cost ($)"><Input inputMode="decimal" value={estimate} onChange={(e) => setEstimate(e.target.value)} placeholder="0.00" /></FormField>
        <FormField label="Link (optional)"><Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" inputMode="url" /></FormField>
      </FieldRow>
      <FormField label="Notes (optional)"><Textarea value={note} onChange={(e) => setNote(e.target.value)} /></FormField>
      <SheetFooter>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button disabled={busy || !title.trim() || !moneyPattern.test(estimate) || Number(estimate) <= 0 || (url !== '' && !/^https?:\/\//.test(url))} onClick={() => onSave(title, Math.round(Number(estimate) * 100), url, note)}>Save item</Button>
      </SheetFooter>
    </Form>
  );
}

function GoalPurchaseForm({ item, today, balance, assigned, busy, onClose, onSave }: { item: Wish; today: string; balance: number; assigned: number; busy: boolean; onClose: () => void; onSave: (id: string, title: string, amount: number, date: string, note: string) => Promise<boolean> }) {
  const [id] = useState(() => crypto.randomUUID()), [title, setTitle] = useState(item.title), [amount, setAmount] = useState((item.estimated_cents / 100).toFixed(2)), [date, setDate] = useState(today), [note, setNote] = useState('');
  const amountCents = Math.round(Number(amount) * 100), early = amountCents > assigned, negative = amountCents > balance;
  return (
    <Form>
      <FormField label="Name"><Input value={title} onChange={(e) => setTitle(e.target.value)} /></FormField>
      <FieldRow>
        <FormField label="Actual cost ($)"><Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></FormField>
        <FormField label="Date"><Input type="date" max={today} value={date} onChange={(e) => setDate(e.target.value)} /></FormField>
      </FieldRow>
      <FormField label="Note (optional)"><Textarea value={note} onChange={(e) => setNote(e.target.value)} /></FormField>
      {early && <Alert variant="warning"><AlertDescription>This costs {cents(Math.max(0, amountCents - assigned))} more than you assigned to the item. Assign the full amount to this item first. Pronark is designed around the satisfaction of saving toward a goal, not buying ahead.</AlertDescription></Alert>}
      {negative && <Alert variant="warning"><AlertDescription>This would put your in-app wallet {cents(amountCents - balance)} below zero. Normal activity rewards would repay it; streak-bonus progress and payouts pause until the balance is positive. This is not real debt or a money transfer.</AlertDescription></Alert>}
      <SheetFooter>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button disabled={busy || (early && !negative) || !title.trim() || !moneyPattern.test(amount) || Number(amount) <= 0 || date > today}
          onClick={() => { if ((early || negative) && !confirm('Record this early purchase despite the savings warning?')) return; onSave(id, title, amountCents, date, note); }}>Save purchase</Button>
      </SheetFooter>
    </Form>
  );
}

/** "You're in control." note from the goals mockup. */
function ControlNote() {
  return (
    <NotePanel icon={<SignpostDoodle />} title="You’re in control.">
      Checking off habits adds to your wallet. You choose when and how much to assign to each goal. Assigning tracks progress; it doesn’t spend anything, and nothing is assigned automatically.
    </NotePanel>
  );
}


import { useEffect, useLayoutEffect, useRef, useState, type ComponentType, type ReactNode, type RefObject } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Bike, BookOpen, Camera, Car, Coffee, Dumbbell, Ellipsis, Eye, Gamepad2, Gem, Gift, GripVertical, Headphones, House,
  Info, Laptop, Minus, Music, Palette, Pencil, Plane, Plus, Shirt, ShoppingBag, Smartphone, Sofa, Sparkles, Ticket, Wallet as WalletIcon, Watch, type LucideProps,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Sheet, SheetFooter } from '@/components/sheet';
import { Disclosure, EmptyState, FieldRow, Form, FormField, Meter } from '@/components/pronark';
import { Pop, toneSurface, type Tone } from '@/components/playful';
import { useReorder } from '@/components/reorder';
import { GoalTargetPlan } from '@/GoalTargetPlan';
import { cn } from '@/lib/utils';
import { cents, moneyPattern, type Allocation, type Category, type ItemAllocation, type RunAction, type Wish } from '@/lib/domain';
import { rpc } from '@/lib/supabase';
import { prefersReducedMotion, useSpring } from '@/lib/motion';
import { categorySummary, checkAmount, moveCategory, orderedCategories, walletBreakdown, type CategorySummary } from '@/lib/wishlist';

type WishItem = Wish & { icon?: string | null };
type Screen = { name: 'overview' } | { name: 'all' } | { name: 'category'; id: string };
type Bubble = { categoryId: string; mode: 'assign' | 'unassign'; where: 'card' | 'hero' };

const categoryLook: Record<string, { icon: ComponentType<LucideProps>; tone: Tone; tagline: string }> = {
  Clothes: { icon: Shirt, tone: 'lavender', tagline: 'Make room for the pieces you love.' },
  Tech: { icon: Laptop, tone: 'mint', tagline: 'Gadgets worth the wait.' },
  Jewelry: { icon: Gem, tone: 'rose', tagline: 'Something sparkly, earned.' },
  'Home items': { icon: Sofa, tone: 'butter', tagline: 'Make your space feel like you.' },
  Experiences: { icon: Ticket, tone: 'peach', tagline: 'Memories you’ll keep talking about.' },
  Travel: { icon: Plane, tone: 'sky', tagline: 'Somewhere new is calling.' },
  Other: { icon: Sparkles, tone: 'lavender', tagline: 'Anything else you’re dreaming of.' },
};
const lookFor = (key: string) => categoryLook[key] ?? categoryLook.Other;

/** Pictures an item can wear. Stored by name on the item. */
const itemIcons: [string, ComponentType<LucideProps>, string][] = [
  ['gift', Gift, 'Gift'], ['shirt', Shirt, 'Clothes'], ['bag', ShoppingBag, 'Bag'], ['watch', Watch, 'Watch'], ['gem', Gem, 'Jewelry'], ['laptop', Laptop, 'Laptop'],
  ['phone', Smartphone, 'Phone'], ['headphones', Headphones, 'Headphones'], ['camera', Camera, 'Camera'], ['gamepad', Gamepad2, 'Games'], ['home', House, 'Home'], ['sofa', Sofa, 'Furniture'],
  ['plane', Plane, 'Trip'], ['ticket', Ticket, 'Tickets'], ['music', Music, 'Music'], ['book', BookOpen, 'Books'], ['bike', Bike, 'Bike'], ['car', Car, 'Car'],
  ['dumbbell', Dumbbell, 'Fitness'], ['coffee', Coffee, 'Treat'], ['palette', Palette, 'Art'], ['sparkles', Sparkles, 'Something special'],
];
const iconByName = Object.fromEntries(itemIcons.map(([name, Icon]) => [name, Icon])) as Record<string, ComponentType<LucideProps>>;

function CategoryIcon({ category, size = 'md' }: { category: string; size?: 'md' | 'lg' }) {
  const { icon: Icon, tone } = lookFor(category);
  return <span className={cn('grid shrink-0 place-items-center rounded-2xl ring-1 ring-inset', toneSurface[tone], size === 'lg' ? 'size-16 [&_svg]:size-8' : 'size-12 [&_svg]:size-6')} aria-hidden="true"><Icon className="text-ink" strokeWidth={1.75} /></span>;
}

function rewardNotice(before: number, after: number, target: number, name: string) {
  if (target <= 0) return `Assigned to ${name}.`;
  const reached = [25, 50, 100].filter((m) => before * 100 < target * m && after * 100 >= target * m).at(-1);
  return reached ? `${name} reached ${reached}% funded! Keep going.` : `Assigned to ${name}. Your progress is growing.`;
}

export function GoalsPage({ client, owner, readOnly, balance, categories, wishes, allocations, itemAllocations, itemAllocationReady, busy, today, onRun }: {
  client: SupabaseClient; owner: string; readOnly: boolean; balance: number; categories: Category[]; wishes: Wish[]; allocations: Allocation[];
  itemAllocations: ItemAllocation[]; itemAllocationReady: boolean; busy: boolean; today: string; onRun: RunAction;
}) {
  const [screen, setScreen] = useState<Screen>({ name: 'overview' });
  const [bubble, setBubble] = useState<Bubble | null>(null);
  const [goalFor, setGoalFor] = useState<Category | null>(null);
  const [editing, setEditing] = useState<{ item: WishItem | null; categoryId: string } | null>(null);
  const [buying, setBuying] = useState<Wish | null>(null), [itemFund, setItemFund] = useState<Wish | null>(null);
  const mine = orderedCategories(categories, owner);
  const wallet = walletBreakdown(balance, allocations, owner);
  const summary = (c: Category) => categorySummary(c, wishes, allocations, itemAllocations);
  const itemSaved = (id: string) => itemAllocations.find((a) => a.item_id === id)?.cents ?? 0;
  const selected = screen.name === 'category' ? mine.find((c) => c.id === screen.id) : undefined;

  // Push/pop between screens: deeper screens enter from the right.
  const viewRef = useRef<HTMLDivElement>(null), direction = useRef(0);
  const push = useSpring(0, (v) => { if (viewRef.current) { viewRef.current.style.translate = `${(v * 40).toFixed(2)}px 0`; viewRef.current.style.opacity = String(1 - Math.min(1, Math.abs(v)) * 0.8); } }, { precision: 0.002 });
  const go = (next: Screen) => { direction.current = next.name === 'overview' ? -1 : 1; setBubble(null); setScreen(next); window.scrollTo({ top: 0 }); };
  useLayoutEffect(() => { if (direction.current && !prefersReducedMotion()) { push.set(direction.current); push.to(0, { damping: 1, response: 0.4 }); } direction.current = 0; }, [screen, push]);

  const assign = (c: Category, amount: number) => { const s = summary(c); return onRun(() => rpc('fund_category', { p_category: c.id, p_cents: amount, p_move_from: null }), rewardNotice(s.assigned, s.assigned + amount, s.target, c.category_key)); };
  const unassign = (c: Category, amount: number) => onRun(() => rpc('unassign_category', { p_category: c.id, p_cents: amount }), `${cents(amount)} is available to assign again.`);
  const cardProps = (c: Category, where: Bubble['where']) => ({
    category: c, summary: summary(c), wallet, readOnly, busy, bubble: bubble?.categoryId === c.id && bubble.where === where ? bubble.mode : null,
    onBubble: (mode: Bubble['mode'] | null) => setBubble(mode ? { categoryId: c.id, mode, where } : null),
    onAssign: (amount: number) => assign(c, amount), onUnassign: (amount: number) => unassign(c, amount),
    onView: () => go({ name: 'category', id: c.id }), onEditGoal: () => setGoalFor(c),
  });

  const warnings = <>
    {balance < 0 && <Alert variant="warning"><AlertDescription>Your in-app wallet is {cents(-balance)} below zero. Activity rewards repay this; streak bonuses pause until your balance is positive.</AlertDescription></Alert>}
    {wallet.assigned > Math.max(0, balance) && <Alert variant="warning"><AlertDescription>Assigned dollars are {cents(wallet.assigned - Math.max(0, balance))} more than your wallet right now. New assignments pause until your balance catches up, or unassign some money.</AlertDescription></Alert>}
    {!itemAllocationReady && <Alert variant="info"><AlertDescription>Item savings need the Rewards database update. Category savings still show.</AlertDescription></Alert>}
  </>;

  return (
    <div className="w-full max-w-4xl">
      <div ref={viewRef} className="flex flex-col gap-5">
        {screen.name === 'overview' && <>
          <WalletCard wallet={wallet} />
          {warnings}
          <section aria-labelledby="top-categories" className="flex flex-col gap-3">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <h2 id="top-categories" className="text-title">Your top 3 wish categories</h2>
              <Button variant="ghost" className="-mr-2" onClick={() => go({ name: 'all' })}>View all categories<ArrowRight data-icon="inline-end" /></Button>
            </div>
            {mine.slice(0, 3).map((c) => <CategoryCard key={c.id} {...cardProps(c, 'card')} />)}
            {!mine.length && <EmptyState>Your categories are loading. If they stay empty, refresh the page.</EmptyState>}
            {!readOnly && mine.length > 0 && <DreamButton onClick={() => setEditing({ item: null, categoryId: mine[0].id })}>Add a wish</DreamButton>}
          </section>
        </>}

        {screen.name === 'all' && <AllCategories mine={mine} cardProps={(c) => cardProps(c, 'card')} readOnly={readOnly} busy={busy} onBack={() => go({ name: 'overview' })}
          onAdd={() => mine[0] && setEditing({ item: null, categoryId: mine[0].id })}
          onSaveOrder={(ids) => onRun(() => rpc('save_goal_priority_order', { p_categories: ids }), '')} />}

        {screen.name === 'category' && selected && <>
          <Button variant="ghost" className="-ml-2 self-start" onClick={() => go({ name: 'overview' })}><ArrowLeft data-icon="inline-start" />Your Wishlist</Button>
          <CategoryHero {...cardProps(selected, 'hero')} />
          {warnings}
          <section aria-labelledby="shelf" className="flex flex-col gap-3">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div><h2 id="shelf" className="text-title">Things on this shelf</h2><p className="text-sm text-muted-foreground">Make the goal feel real with specific wishes.</p></div>
              {!readOnly && <Button size="lg" onClick={() => setEditing({ item: null, categoryId: selected.id })}><Plus data-icon="inline-start" />Add item</Button>}
            </div>
            {summary(selected).items.map((w) => (
              <ItemCard key={w.id} item={w as WishItem} category={selected.category_key} saved={itemSaved(w.id)} readOnly={readOnly} busy={busy} itemAllocationReady={itemAllocationReady}
                onEdit={() => setEditing({ item: w as WishItem, categoryId: selected.id })} onFund={() => setItemFund(w)} onBuy={() => setBuying(w)} />
            ))}
            {!readOnly && <DreamButton onClick={() => setEditing({ item: null, categoryId: selected.id })}>Add something you’re dreaming of</DreamButton>}
            {wishes.some((w) => w.category_id === selected.id && w.status === 'purchased') && (
              <div className="flex flex-col gap-1.5 pt-1">
                <h3 className="text-eyebrow text-muted-foreground">Enjoyed rewards</h3>
                {wishes.filter((w) => w.category_id === selected.id && w.status === 'purchased').map((w) => <p key={w.id} className="inline-flex items-center gap-1.5 text-sm"><Sparkles className="size-3.5 text-butter-pop" aria-hidden="true" />{w.title} · Purchased</p>)}
              </div>
            )}
          </section>
          <GoalTargetPlan key={selected.id} client={client} categoryId={selected.id} today={today} readOnly={readOnly} />
        </>}
      </div>

      <Sheet open={!!goalFor} onClose={() => setGoalFor(null)} title={`How much do you want to save for ${goalFor?.category_key ?? ''}?`}
        description="Pick any amount, even more than you have now. Changing a goal never assigns or spends wallet dollars.">
        {goalFor && <GoalForm key={goalFor.id} category={goalFor} itemTotal={summary(goalFor).itemTotal} busy={busy} onClose={() => setGoalFor(null)}
          onSave={(amount) => onRun(() => rpc('save_category_target', { p_category: goalFor.id, p_cents: amount, p_expected_revision: goalFor.revision }), `${goalFor.category_key} goal saved.`).then((ok) => { if (ok) setGoalFor(null); return ok; })} />}
      </Sheet>

      <Sheet open={!!editing} onClose={() => setEditing(null)} title={editing?.item ? `Edit ${editing.item.title}` : 'Add a wish'}
        description={editing?.item ? 'Changing the price updates the target. Money you’ve set aside stays put.' : 'Adding a wish raises that category’s target. It doesn’t assign or spend any money.'}>
        {editing && <WishForm key={editing.item?.id ?? 'new'} item={editing.item} categories={mine} categoryId={editing.categoryId} busy={busy} onClose={() => setEditing(null)}
          onSave={(fields) => onRun(async () => {
            const id = editing.item?.id ?? crypto.randomUUID();
            await rpc('save_wishlist_item', { p_id: id, p_category: fields.categoryId, p_title: fields.title, p_estimated: fields.estimate, p_url: fields.url || null, p_note: fields.note, p_expected_revision: editing.item?.revision ?? null });
            if ((fields.icon ?? null) !== (editing.item?.icon ?? null)) {
              try { await rpc('set_wishlist_item_icon', { p_item: id, p_icon: fields.icon }); }
              catch (e) { if (/set_wishlist_item_icon|schema cache/i.test(String((e as { message?: string })?.message ?? e))) throw new Error('Your wish was saved. Pictures need the latest database update (202610230027_wishlist.sql).'); throw e; }
            }
          }, editing.item ? 'Wish updated.' : `${fields.title} added to your wishlist!`).then((ok) => { if (ok) setEditing(null); return ok; })} />}
      </Sheet>

      <Sheet open={!!buying} onClose={() => setBuying(null)} title="Record purchase" description={buying ? `Set aside for this item: ${cents(itemSaved(buying.id))}. Buying spends from your wallet; leftover item savings stay in the category.` : undefined}>
        {buying && <GoalPurchaseForm key={buying.id} item={buying} today={today} balance={balance} assigned={itemSaved(buying.id)} busy={busy} onClose={() => setBuying(null)}
          onSave={(id, title, amount, date, note) => onRun(() => rpc('save_purchase', { p_id: id, p_title: title, p_amount_cents: amount, p_date: date, p_note: note, p_wishlist: buying.id, p_expected_revision: null }), 'Purchase recorded. Enjoy it!').then((ok) => { if (ok) setBuying(null); return ok; })} />}
      </Sheet>

      <Sheet open={!!itemFund && !!selected} onClose={() => setItemFund(null)} title={'Set aside for ' + (itemFund?.title ?? '')}
        description={itemFund ? `Item progress: ${cents(itemSaved(itemFund.id))} of ${cents(itemFund.estimated_cents)}. It stays in your wallet until you record a purchase.` : undefined}>
        {itemFund && selected && <ItemFundForm key={itemFund.id} category={selected.category_key} available={wallet.available} categoryFree={summary(selected).free} saved={itemSaved(itemFund.id)} busy={busy} onClose={() => setItemFund(null)}
          onAssign={(amount, source) => onRun(() => rpc('assign_item', { p_item: itemFund.id, p_cents: amount, p_source: source }), rewardNotice(itemSaved(itemFund.id), itemSaved(itemFund.id) + amount, itemFund.estimated_cents, itemFund.title)).then((ok) => { if (ok) setItemFund(null); })}
          onRelease={(amount) => onRun(() => rpc('release_item_savings', { p_item: itemFund.id, p_cents: amount }), `Returned to ${selected.category_key}.`).then((ok) => { if (ok) setItemFund(null); })} />}
      </Sheet>
    </div>
  );
}

function WalletCard({ wallet }: { wallet: ReturnType<typeof walletBreakdown> }) {
  const shown = Math.max(wallet.total, wallet.assigned, 1);
  const assignedPct = Math.min(100, (Math.max(0, wallet.assigned) / shown) * 100);
  return (
    <section aria-label="Wallet" className="relative flex flex-col gap-4 overflow-hidden rounded-3xl bg-card p-4 ring-1 ring-foreground/8 md:p-5">
      <Pop tone="mint" className="absolute top-3 right-3 size-9" />
      <div className="flex items-center gap-3 pr-10">
        <span className="grid size-12 shrink-0 place-items-center rounded-full bg-mint text-ink shadow-sm"><WalletIcon className="size-6" strokeWidth={1.75} aria-hidden="true" /></span>
        <div><p className="text-sm font-medium text-muted-foreground">Total wallet balance</p><p className="tabular text-3xl font-bold tracking-tight">{cents(wallet.total)}</p></div>
      </div>
      <div className="flex h-3 overflow-hidden rounded-full bg-mint" role="img" aria-label={`${cents(wallet.assigned)} assigned to wishes, ${cents(wallet.available)} available to assign`}>
        <div className="h-full rounded-full bg-lavender-pop transition-[width] duration-500" style={{ width: `${assignedPct}%` }} />
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        <div className="rounded-2xl bg-lavender p-3.5 text-lavender-ink"><p className="flex items-center gap-1.5 text-sm"><span className="size-2.5 rounded-full bg-lavender-pop" aria-hidden="true" />Assigned to wishes</p><p className="tabular mt-0.5 text-2xl font-bold text-foreground">{cents(wallet.assigned)}</p></div>
        <div className="rounded-2xl bg-mint p-3.5 text-mint-ink"><p className="flex items-center gap-1.5 text-sm"><span className="size-2.5 rounded-full bg-mint-pop" aria-hidden="true" />Available to assign</p><p className="tabular mt-0.5 text-2xl font-bold text-foreground">{cents(wallet.available)}</p></div>
      </div>
      <p className="flex items-start gap-2 text-sm text-muted-foreground"><Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <span>All of it stays in your wallet. Assigning picks a wish for some of those dollars, and unassigning makes them available again. Neither one spends money or changes your total.</span></p>
    </section>
  );
}

type CardProps = {
  category: Category; summary: CategorySummary; wallet: ReturnType<typeof walletBreakdown>; readOnly: boolean; busy: boolean; bubble: Bubble['mode'] | null;
  onBubble: (mode: Bubble['mode'] | null) => void; onAssign: (amount: number) => Promise<boolean>; onUnassign: (amount: number) => Promise<boolean>; onView: () => void; onEditGoal: () => void;
};

function amountLine(s: CategorySummary) {
  return <>{cents(s.assigned)} assigned{s.target > 0 ? <> · {cents(s.target)} target</> : ' · no target yet'}</>;
}

function MoreMenu({ s, readOnly, onBubble, onView, onEditGoal, label, showView = true }: { s: CategorySummary; readOnly: boolean; onBubble: CardProps['onBubble']; onView: () => void; onEditGoal: () => void; label: string; showView?: boolean }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" size="icon-lg" className="rounded-full bg-card" aria-label={`More for ${label}`} />}><Ellipsis /></DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-52">
        {showView && <DropdownMenuItem onClick={onView}><Eye />View category wishlist</DropdownMenuItem>}
        {!readOnly && <DropdownMenuItem onClick={onEditGoal}><Pencil />Edit goal</DropdownMenuItem>}
        {!readOnly && <DropdownMenuItem disabled={s.assigned <= 0} onClick={() => onBubble('unassign')}><Minus />Unassign money</DropdownMenuItem>}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function CategoryCard({ category: c, summary: s, wallet, readOnly, busy, bubble, onBubble, onAssign, onUnassign, onView, onEditGoal, children }: CardProps & { children?: ReactNode }) {
  const assignRef = useRef<HTMLButtonElement>(null);
  return (
    <article className="relative rounded-3xl bg-card p-4 ring-1 ring-foreground/8">
      <div className="flex flex-wrap items-center gap-3.5">
        {children}
        <CategoryIcon category={c.category_key} />
        <div className="flex min-w-0 flex-1 basis-40 flex-col gap-1.5">
          <h3 className="truncate text-[1.0625rem] font-semibold">{c.category_key}</h3>
          <p className="tabular text-sm text-muted-foreground">{amountLine(s)}</p>
          {s.target > 0 && <Meter value={s.assigned} max={s.target} className="h-2" label={`${s.percent}% of the ${c.category_key} target assigned`} />}
        </div>
        <div className="flex w-full items-center gap-1.5 sm:w-auto sm:shrink-0">
          {!readOnly && <Button ref={assignRef} size="lg" className="flex-1 sm:flex-none" disabled={busy} onClick={() => onBubble(bubble === 'assign' ? null : 'assign')} aria-expanded={bubble === 'assign'}><Plus data-icon="inline-start" />Assign</Button>}
          <MoreMenu s={s} readOnly={readOnly} onBubble={onBubble} onView={onView} onEditGoal={onEditGoal} label={c.category_key} />
        </div>
      </div>
      {bubble && <AmountBubble mode={bubble} category={c.category_key} max={bubble === 'assign' ? wallet.available : s.assigned} heldByItems={s.heldByItems} free={s.free} busy={busy} returnFocus={assignRef}
        onClose={() => onBubble(null)} onConfirm={(amount) => (bubble === 'assign' ? onAssign(amount) : onUnassign(amount)).then((ok) => { if (ok) onBubble(null); })} />}
    </article>
  );
}

function CategoryHero({ category: c, summary: s, wallet, readOnly, busy, bubble, onBubble, onAssign, onUnassign, onView, onEditGoal }: CardProps) {
  const { tone, tagline } = lookFor(c.category_key);
  const assignRef = useRef<HTMLButtonElement>(null);
  const over = s.assigned > s.target && s.target > 0;
  return (
    <section aria-label={c.category_key} className={cn('relative flex flex-col gap-4 rounded-3xl p-4 ring-1 ring-inset md:p-5', toneSurface[tone])}>
      <Pop tone={tone} className="absolute top-3 right-3 size-9" />
      <div className="flex items-center gap-4 pr-10">
        <CategoryIcon category={c.category_key} size="lg" />
        <div className="min-w-0"><h2 className="text-title text-3xl font-bold text-foreground md:text-4xl">{c.category_key}</h2><p className="mt-0.5 text-sm">{tagline}</p></div>
      </div>
      <div className="flex flex-col gap-2 rounded-2xl bg-card/80 p-3.5 text-foreground">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-sm"><strong className="tabular text-lg font-bold">{cents(s.assigned)}</strong> assigned{s.target > 0 && <> toward <strong className="tabular font-semibold">{cents(s.target)}</strong></>}</p>
          {s.target > 0 && <strong className="tabular text-sm">{s.percent}%</strong>}
        </div>
        <Meter value={s.assigned} max={Math.max(1, s.target)} className="h-2.5" label={`${s.percent}% assigned`} />
        <dl className="mt-1 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Category goal" value={cents(s.goal)} />
          <Stat label="Items on this shelf" value={cents(s.itemTotal)} />
          <Stat label={over ? 'Extra saved' : 'Still to go'} value={cents(over ? s.assigned - s.target : Math.max(0, s.target - s.assigned))} />
          <Stat label="Not set aside for items" value={cents(s.free)} />
        </dl>
      </div>
      {!readOnly && <div className="relative flex flex-wrap items-center gap-2">
        <Button ref={assignRef} size="lg" disabled={busy} onClick={() => onBubble(bubble === 'assign' ? null : 'assign')} aria-expanded={bubble === 'assign'}><Plus data-icon="inline-start" />Assign</Button>
        <Button size="lg" variant="outline" className="bg-card" onClick={onEditGoal}><Pencil data-icon="inline-start" />{s.goal ? 'Edit goal' : 'Set a goal'}</Button>
        <MoreMenu s={s} readOnly={readOnly} onBubble={onBubble} onView={onView} onEditGoal={onEditGoal} label={c.category_key} showView={false} />
        {bubble && <AmountBubble mode={bubble} align="start" category={c.category_key} max={bubble === 'assign' ? wallet.available : s.assigned} heldByItems={s.heldByItems} free={s.free} busy={busy} returnFocus={assignRef}
          onClose={() => onBubble(null)} onConfirm={(amount) => (bubble === 'assign' ? onAssign(amount) : onUnassign(amount)).then((ok) => { if (ok) onBubble(null); })} />}
      </div>}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-xs text-muted-foreground">{label}</dt><dd className="tabular text-base font-semibold">{value}</dd></div>;
}

/** The little bubble for Assign / Unassign: one amount, Yes or No. Nothing happens on No. */
function AmountBubble({ mode, category, max, heldByItems, free, busy, align = 'end', returnFocus, onClose, onConfirm }: {
  mode: Bubble['mode']; category: string; max: number; heldByItems: number; free: number; busy: boolean; align?: 'start' | 'end';
  returnFocus: RefObject<HTMLButtonElement | null>; onClose: () => void; onConfirm: (amount: number) => void;
}) {
  const [text, setText] = useState(''), [touched, setTouched] = useState(false);
  const ref = useRef<HTMLDivElement>(null), inputRef = useRef<HTMLInputElement>(null);
  const assign = mode === 'assign';
  const result = checkAmount(text, max, assign ? `You have ${cents(max)} available, so that’s the most you can assign.` : `${category} has ${cents(max)} assigned, so that’s the most you can unassign.`);
  const nothing = max <= 0;
  const close = () => { onClose(); returnFocus.current?.focus(); };
  useEffect(() => { inputRef.current?.focus({ preventScroll: true }); ref.current?.scrollIntoView({ block: 'nearest', behavior: prefersReducedMotion() ? 'auto' : 'smooth' }); }, []);
  useEffect(() => {
    const away = (e: PointerEvent) => { if (ref.current && !ref.current.contains(e.target as Node) && !(e.target as HTMLElement).closest('[aria-expanded="true"]')) onClose(); };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [onClose]);
  const fromItems = !assign && result.cents !== null && result.cents > free ? result.cents - free : 0;
  const chips = assign ? [500, 1000, 2500].filter((n) => n < max) : [];
  return (
    <div ref={ref} role="dialog" aria-label={assign ? `Assign money to ${category}` : `Unassign money from ${category}`}
      onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } }}
      className={cn('absolute top-full z-30 mt-2.5 w-[min(21rem,calc(100vw-2.5rem))] scroll-mb-28 rounded-3xl bg-card p-4 shadow-[0_18px_40px_-16px_rgb(30_27_43/0.45)] ring-1 ring-foreground/10 motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95', align === 'end' ? 'right-0 origin-top-right' : 'left-0 origin-top-left')}>
      <span aria-hidden="true" className={cn('absolute -top-1.5 size-3 rotate-45 bg-card ring-1 ring-foreground/10 [clip-path:polygon(0_0,100%_0,0_100%)]', align === 'end' ? 'right-10' : 'left-10')} />
      <div className="flex items-start gap-3">
        <span className={cn('grid size-10 shrink-0 place-items-center rounded-full', assign ? 'bg-butter text-butter-ink' : 'bg-lavender text-lavender-ink')} aria-hidden="true">{assign ? <Sparkles className="size-5" /> : <Minus className="size-5" />}</span>
        <div className="min-w-0">
          <p className="font-hand text-xl leading-tight text-foreground">{assign ? `How much for ${category}?` : `Unassign from ${category}?`}</p>
          <p className="text-sm text-muted-foreground">{assign ? <>You have <strong className="tabular text-foreground">{cents(max)}</strong> available to assign.</> : <><strong className="tabular text-foreground">{cents(max)}</strong> is assigned here. It goes back to Available.</>}</p>
        </div>
      </div>
      {nothing ? (
        <p className="mt-3 rounded-2xl bg-muted/70 p-3 text-sm">{assign ? 'Nothing is available to assign yet. Check off habits to add to your wallet, or unassign from another category.' : 'Nothing is assigned here yet.'}</p>
      ) : (
        <form className="mt-3 flex flex-col gap-2" onSubmit={(e) => { e.preventDefault(); setTouched(true); if (result.cents !== null) onConfirm(result.cents); }}>
          <label className="sr-only" htmlFor={`amount-${mode}-${category}`}>Amount in dollars</label>
          <div className="relative">
            <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground" aria-hidden="true">$</span>
            <Input ref={inputRef} id={`amount-${mode}-${category}`} inputMode="decimal" autoComplete="off" placeholder="0.00" value={text} className="pl-6 text-base"
              aria-invalid={touched && !!result.error} aria-describedby={`amount-help-${mode}-${category}`} onChange={(e) => { setText(e.target.value); setTouched(true); }} />
          </div>
          {chips.length > 0 || assign ? <div className="flex flex-wrap gap-1.5">
            {chips.map((n) => <button key={n} type="button" onClick={() => { setText((n / 100).toFixed(2)); setTouched(true); }} className="rounded-full bg-muted px-3 py-1.5 text-sm font-medium hover:bg-muted/70">{cents(n)}</button>)}
            <button type="button" onClick={() => { setText((max / 100).toFixed(2)); setTouched(true); }} className="rounded-full bg-muted px-3 py-1.5 text-sm font-medium hover:bg-muted/70">All {cents(max)}</button>
          </div> : null}
          {!assign && <div className="flex flex-wrap gap-1.5"><button type="button" onClick={() => { setText((max / 100).toFixed(2)); setTouched(true); }} className="rounded-full bg-muted px-3 py-1.5 text-sm font-medium hover:bg-muted/70">All {cents(max)}</button></div>}
          <p id={`amount-help-${mode}-${category}`} aria-live="polite" className={cn('min-h-5 text-sm', touched && result.error ? 'text-destructive' : 'text-muted-foreground')}>
            {touched && result.error ? result.error : fromItems ? `${cents(fromItems)} of this was set aside for items, so their progress goes down too.` : !assign && heldByItems > 0 ? `${cents(heldByItems)} is set aside for items; it comes back last.` : ' '}
          </p>
          <div className="flex gap-2">
            <Button type="button" variant="outline" className="flex-1" onClick={close}>No</Button>
            <Button type="submit" className="flex-1" disabled={busy || result.cents === null}>Yes, {assign ? 'assign' : 'unassign'}{result.cents !== null ? ` ${cents(result.cents)}` : ''}</Button>
          </div>
        </form>
      )}
      {nothing && <Button variant="outline" className="mt-3 w-full" onClick={close}>OK</Button>}
    </div>
  );
}

function AllCategories({ mine, cardProps, readOnly, busy, onBack, onAdd, onSaveOrder }: {
  mine: Category[]; cardProps: (c: Category) => CardProps; readOnly: boolean; busy: boolean; onBack: () => void; onAdd: () => void; onSaveOrder: (ids: string[]) => Promise<boolean>;
}) {
  const [order, setOrder] = useState(() => mine.map((c) => c.id));
  const timer = useRef(0);
  useEffect(() => { setOrder((o) => (o.length === mine.length && mine.every((c) => o.includes(c.id)) ? o : mine.map((c) => c.id))); }, [mine.map((c) => c.id).join()]);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const move = (from: number, to: number) => {
    const next = moveCategory(order, from, to);
    if (next === order) return;
    setOrder(next);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => onSaveOrder(next), 700);
  };
  const { container, dragging, handleProps } = useReorder(move);
  const byId = Object.fromEntries(mine.map((c) => [c.id, c]));
  return (
    <>
      <Button variant="ghost" className="-ml-2 self-start" onClick={onBack}><ArrowLeft data-icon="inline-start" />Your Wishlist</Button>
      <div className="-mt-2 flex flex-wrap items-end justify-between gap-3">
        <div><h2 className="text-title text-3xl font-bold md:text-4xl">All wish categories</h2><p className="mt-1 text-muted-foreground">Put your most important categories first.</p></div>
        {!readOnly && <Button size="lg" onClick={onAdd}><Plus data-icon="inline-start" />Add a wish</Button>}
      </div>
      {!readOnly && <p className="flex items-center gap-2 rounded-2xl bg-lavender px-4 py-3 text-sm text-lavender-ink"><GripVertical className="size-4 shrink-0" aria-hidden="true" />Drag a category or use the arrows to reorder. Your first three show on your Wishlist.</p>}
      <ol ref={container as RefObject<HTMLOListElement | null>} className="flex flex-col gap-2.5" aria-label="Wish categories in order">
        {order.map((id, i) => byId[id] && (
          <li key={id} data-reorder-id={id} className={cn('rounded-3xl transition-shadow', dragging === id && 'shadow-lg ring-2 ring-primary/50')}>
            <CategoryCard {...cardProps(byId[id])}>
              {!readOnly && <div className="flex shrink-0 flex-col items-center gap-0.5">
                <span {...handleProps(id)} className="grid size-8 cursor-grab place-items-center rounded-lg text-muted-foreground hover:bg-muted" aria-hidden="true"><GripVertical className="size-4" /></span>
                <span className={cn('grid size-6 place-items-center rounded-full text-xs font-bold', i < 3 ? 'bg-mint text-mint-ink' : 'bg-muted text-muted-foreground')} aria-label={`Number ${i + 1}`}>{i + 1}</span>
              </div>}
            </CategoryCard>
            {!readOnly && <div className="-mt-1 flex justify-end gap-1 px-4 pb-1">
              <Button variant="ghost" size="sm" disabled={busy || i === 0} onClick={() => move(i, i - 1)} aria-label={`Move ${byId[id].category_key} up`}><ArrowUp data-icon="inline-start" />Up</Button>
              <Button variant="ghost" size="sm" disabled={busy || i === order.length - 1} onClick={() => move(i, i + 1)} aria-label={`Move ${byId[id].category_key} down`}><ArrowDown data-icon="inline-start" />Down</Button>
            </div>}
          </li>
        ))}
      </ol>
    </>
  );
}

function ItemCard({ item, category, saved, readOnly, busy, itemAllocationReady, onEdit, onFund, onBuy }: {
  item: WishItem; category: string; saved: number; readOnly: boolean; busy: boolean; itemAllocationReady: boolean; onEdit: () => void; onFund: () => void; onBuy: () => void;
}) {
  const { tone, icon: Fallback } = lookFor(category);
  const Icon = (item.icon && iconByName[item.icon]) || Fallback;
  const pct = item.estimated_cents > 0 ? Math.min(100, Math.round((saved / item.estimated_cents) * 100)) : 0;
  return (
    <article className="flex items-center gap-4 rounded-3xl bg-card p-3.5 ring-1 ring-foreground/8">
      <span className={cn('grid size-20 shrink-0 place-items-center rounded-2xl ring-1 ring-inset', toneSurface[tone])} aria-hidden="true"><Icon className="size-9 text-ink" strokeWidth={1.6} /></span>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex items-start gap-2">
          <h3 className="min-w-0 flex-1 truncate text-[1.0625rem] font-semibold">{item.title}</h3>
          {pct >= 100 && <span className="rounded-full bg-mint px-2 py-0.5 text-xs font-semibold text-mint-ink">Ready!</span>}
        </div>
        <p className="tabular text-sm text-muted-foreground">Estimated {cents(item.estimated_cents)} · {cents(saved)} set aside</p>
        <Meter value={saved} max={item.estimated_cents} className="h-2" label={`${pct}% set aside for ${item.title}`} />
        {!readOnly && <div className="mt-1 flex gap-1.5">
          <Button variant="outline" onClick={onEdit}><Pencil data-icon="inline-start" />Edit item</Button>
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="rounded-full" aria-label={`More for ${item.title}`} />}><Ellipsis /></DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-52">
              <DropdownMenuItem disabled={busy || !itemAllocationReady} onClick={onFund}><Plus />Set money aside for it</DropdownMenuItem>
              <DropdownMenuItem disabled={busy} onClick={onBuy}><ShoppingBag />Record purchase</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>}
      </div>
    </article>
  );
}

function DreamButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="group flex min-h-16 items-center justify-center gap-2 rounded-3xl border-2 border-dashed border-lavender-pop/50 bg-lavender/50 px-4 font-semibold text-lavender-ink transition-[background-color,scale] duration-100 hover:bg-lavender active:scale-[0.99]">
      <Sparkles className="size-5 text-butter-pop transition-transform group-hover:rotate-12" aria-hidden="true" />{children}
    </button>
  );
}

function GoalForm({ category, itemTotal, busy, onClose, onSave }: { category: Category; itemTotal: number; busy: boolean; onClose: () => void; onSave: (cents: number) => Promise<boolean> }) {
  const [amount, setAmount] = useState(((category.general_target_cents ?? 0) / 100).toFixed(2));
  const value = Math.round(Number(amount) * 100), valid = moneyPattern.test(amount) && Number(amount) <= 1000000;
  const bump = (n: number) => setAmount(((Math.max(0, valid ? value : 0) + n) / 100).toFixed(2));
  return (
    <Form>
      <FormField label="Your goal" hint={itemTotal > 0 ? `Your items add ${cents(itemTotal)}, so the total target will be ${valid ? cents(value + itemTotal) : '…'}.` : 'You can add specific items later; they add to this.'}>
        <div className="relative"><span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground" aria-hidden="true">$</span>
          <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="500.00" autoComplete="off" className="pl-6 text-base" aria-invalid={!valid} /></div>
      </FormField>
      <div className="flex flex-wrap gap-1.5" aria-label="Quick add">
        {[2500, 5000, 10000].map((n) => <button key={n} type="button" onClick={() => bump(n)} className="rounded-full bg-lavender px-3.5 py-1.5 text-sm font-semibold text-lavender-ink hover:bg-lavender/70">+{cents(n).replace('.00', '')}</button>)}
      </div>
      {!valid && <p className="text-sm text-destructive">Use dollars and cents, like 250.00, up to $1,000,000.</p>}
      <SheetFooter>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button disabled={busy || !valid} onClick={() => onSave(value)}>Save goal</Button>
      </SheetFooter>
    </Form>
  );
}

function WishForm({ item, categories, categoryId, busy, onClose, onSave }: {
  item: WishItem | null; categories: Category[]; categoryId: string; busy: boolean; onClose: () => void;
  onSave: (fields: { categoryId: string; title: string; estimate: number; url: string; note: string; icon: string | null }) => Promise<boolean>;
}) {
  const [category, setCategory] = useState(item?.category_id ?? categoryId);
  const [title, setTitle] = useState(item?.title ?? ''), [estimate, setEstimate] = useState(item ? (item.estimated_cents / 100).toFixed(2) : '');
  const [url, setUrl] = useState(item?.external_url ?? ''), [note, setNote] = useState(item?.note ?? ''), [icon, setIcon] = useState<string | null>(item?.icon ?? null);
  const priceOk = moneyPattern.test(estimate) && Number(estimate) > 0, urlOk = url === '' || /^https?:\/\//.test(url);
  const categoryName = categories.find((c) => c.id === category)?.category_key ?? 'Other';
  const Fallback = lookFor(categoryName).icon;
  return (
    <Form>
      <FormField label="What are you wishing for?"><Input value={title} maxLength={200} autoFocus onChange={(e) => setTitle(e.target.value)} placeholder="New running shoes, a weekend trip…" /></FormField>
      <FieldRow>
        <FormField label="Estimated price">
          <div className="relative"><span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground" aria-hidden="true">$</span>
            <Input inputMode="decimal" value={estimate} onChange={(e) => setEstimate(e.target.value)} placeholder="0.00" className="pl-6" aria-invalid={estimate !== '' && !priceOk} /></div>
        </FormField>
        {!item && <FormField label="Category"><NativeSelect value={category} onChange={(e) => setCategory(e.target.value)}>{categories.map((c) => <NativeSelectOption key={c.id} value={c.id}>{c.category_key}</NativeSelectOption>)}</NativeSelect></FormField>}
      </FieldRow>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">Pick a picture</legend>
        <div role="radiogroup" aria-label="Item picture" className="grid grid-cols-6 gap-1.5 sm:grid-cols-8">
          <IconChoice selected={icon === null} label={`${categoryName} picture`} onSelect={() => setIcon(null)}><Fallback /></IconChoice>
          {itemIcons.map(([name, Icon, label]) => <IconChoice key={name} selected={icon === name} label={label} onSelect={() => setIcon(name)}><Icon /></IconChoice>)}
        </div>
      </fieldset>
      <Disclosure summary="Add a link or note (optional)">
        <div className="flex flex-col gap-3 pt-2">
          <FormField label="Link"><Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" inputMode="url" aria-invalid={!urlOk} /></FormField>
          <FormField label="Note"><Textarea value={note} onChange={(e) => setNote(e.target.value)} /></FormField>
        </div>
      </Disclosure>
      {estimate !== '' && !priceOk && <p className="text-sm text-destructive">Enter a price more than $0, like 49.99.</p>}
      {!urlOk && <p className="text-sm text-destructive">Links start with https://</p>}
      <SheetFooter>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button disabled={busy || !title.trim() || !priceOk || !urlOk} onClick={() => onSave({ categoryId: category, title: title.trim(), estimate: Math.round(Number(estimate) * 100), url, note, icon })}>{item ? 'Save changes' : 'Add to my wishlist'}</Button>
      </SheetFooter>
    </Form>
  );
}

function IconChoice({ selected, label, onSelect, children }: { selected: boolean; label: string; onSelect: () => void; children: ReactNode }) {
  return (
    <button type="button" role="radio" aria-checked={selected} aria-label={label} title={label} onClick={onSelect}
      className={cn('grid aspect-square place-items-center rounded-xl transition-[background-color,box-shadow,scale] duration-100 active:scale-90 [&_svg]:size-5', selected ? 'bg-mint text-mint-ink ring-2 ring-primary' : 'bg-muted/60 text-foreground hover:bg-muted')}>{children}</button>
  );
}

function ItemFundForm({ category, available, categoryFree, saved, busy, onClose, onAssign, onRelease }: { category: string; available: number; categoryFree: number; saved: number; busy: boolean; onClose: () => void; onAssign: (cents: number, source: 'wallet' | 'category') => void; onRelease: (cents: number) => void }) {
  const [amount, setAmount] = useState(''), [source, setSource] = useState<'wallet' | 'category'>(available > 0 ? 'wallet' : 'category');
  const value = Math.round(Number(amount) * 100), valid = moneyPattern.test(amount) && Number(amount) > 0;
  const limit = source === 'wallet' ? available : categoryFree;
  return (
    <Form>
      <FormField label="Take it from">
        <NativeSelect value={source} onChange={(e) => setSource(e.target.value as 'wallet' | 'category')}>
          <NativeSelectOption value="wallet">Available to assign · {cents(Math.max(0, available))}</NativeSelectOption>
          <NativeSelectOption value="category">Already in {category} · {cents(Math.max(0, categoryFree))}</NativeSelectOption>
        </NativeSelect>
      </FormField>
      <FormField label="Amount ($)"><Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" /></FormField>
      {valid && value > limit && <p className="text-sm text-destructive">That’s more than the {cents(Math.max(0, limit))} you can use from there.</p>}
      {saved > 0 && <Button variant="ghost" className="self-start" disabled={busy || !valid || value > saved} onClick={() => onRelease(value)}>Return this amount to {category}</Button>}
      <SheetFooter>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button disabled={busy || !valid || value > limit} onClick={() => onAssign(value, source)}>Set aside</Button>
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
      {early && <Alert variant="warning"><AlertDescription>This costs {cents(Math.max(0, amountCents - assigned))} more than you set aside for it. Set aside the full amount first. Pronark is about the satisfaction of saving toward a goal, not buying ahead.</AlertDescription></Alert>}
      {negative && <Alert variant="warning"><AlertDescription>This would put your in-app wallet {cents(amountCents - balance)} below zero. Activity rewards would repay it; streak bonuses pause until the balance is positive. This is not real debt or a money transfer.</AlertDescription></Alert>}
      <SheetFooter>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button disabled={busy || (early && !negative) || !title.trim() || !moneyPattern.test(amount) || Number(amount) <= 0 || date > today}
          onClick={() => { if ((early || negative) && !confirm('Record this early purchase despite the savings warning?')) return; onSave(id, title, amountCents, date, note); }}>Save purchase</Button>
      </SheetFooter>
    </Form>
  );
}

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { ErrorText, FieldRow, FormField, WeekdayPicker, Logo } from '@/components/pronark';
import { initialActivities } from '@/lib/domain';

type Item = { title: string; description: string; reward_cents: number; weekdays: number[] };

/** Original one-page setup, used only when the guided-onboarding tables are unavailable. */
export function LegacySetup({ busy, error, invite, onInviteChange, onJoin, submit }: {
  busy: boolean; error: string; invite?: string; onInviteChange: (value: string) => void; onJoin?: () => void;
  submit: (name: string, goal: number, water: number, unit: string, items: unknown[]) => void;
}) {
  const [name, setName] = useState(''), [goal, setGoal] = useState(10000), [water, setWater] = useState(''), [unit, setUnit] = useState('');
  const [items, setItems] = useState<Item[]>(initialActivities.map(([title, reward_cents]) => ({ title, description: '', reward_cents, weekdays: [1, 2, 3, 4, 5, 6, 7] })));
  const patch = (i: number, value: Partial<Item>) => setItems(items.map((x, n) => (n === i ? { ...x, ...value } : x)));
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-5 px-4 py-8">
      <div className="self-start"><Logo className="h-24" /></div>
      <div>
        <h1 className="text-display">Make your routine yours</h1>
        <p className="mt-2 text-sm text-muted-foreground">Choose your monthly goals and the days each activity is scheduled. Notes can be added later.</p>
      </div>
      {onJoin && (
        <Card><CardContent className="flex flex-col gap-3">
          <p className="text-sm">Joining your partner? Enter the invitation code they shared with you before saving your routine.</p>
          <div className="flex gap-2">
            <Input aria-label="Invitation code" value={invite ?? ''} onChange={(e) => onInviteChange(e.target.value.trim())} placeholder="Invitation code" />
            <Button variant="outline" disabled={busy || !invite} onClick={onJoin}>Join partner</Button>
          </div>
        </CardContent></Card>
      )}
      <Card><CardContent className="flex flex-col gap-4">
        <FormField label="Your name"><Input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} /></FormField>
        <FormField label="Monthly step goal">
          <NativeSelect value={goal} onChange={(e) => setGoal(Number(e.target.value))}>
            <NativeSelectOption value={10000}>10,000 steps</NativeSelectOption>
            <NativeSelectOption value={15000}>15,000 steps</NativeSelectOption>
          </NativeSelect>
        </FormField>
        <FieldRow>
          <FormField label="Water amount"><Input type="number" min="0.01" step="any" value={water} onChange={(e) => setWater(e.target.value)} /></FormField>
          <FormField label="Water unit"><Input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="cups, liters…" /></FormField>
        </FieldRow>
      </CardContent></Card>
      <h2 className="text-title">Activities</h2>
      {items.map((it, i) => (
        <Card key={i}><CardContent className="flex flex-col gap-4">
          <FieldRow>
            <FormField label="Title"><Input value={it.title} onChange={(e) => patch(i, { title: e.target.value })} /></FormField>
            <FormField label="Reward ($)"><Input type="number" min="0" step="0.01" value={(it.reward_cents / 100).toFixed(2)} onChange={(e) => patch(i, { reward_cents: Math.round(Number(e.target.value) * 100) })} /></FormField>
          </FieldRow>
          <WeekdayPicker value={it.weekdays} onChange={(weekdays) => patch(i, { weekdays })} />
        </CardContent></Card>
      ))}
      <Button size="lg" disabled={busy || !!(onJoin && invite) || !name.trim() || !(Number(water) > 0) || !unit.trim() || items.some((x) => !x.title.trim() || !x.weekdays.length)}
        onClick={() => submit(name, goal, Number(water), unit, items)}>Save setup</Button>
      <ErrorText>{error}</ErrorText>
    </main>
  );
}

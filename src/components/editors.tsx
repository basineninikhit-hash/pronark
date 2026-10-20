import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { SheetFooter } from '@/components/sheet';
import { ErrorText, FieldRow, Form, FormField, WeekdayPicker } from '@/components/pronark';
import { isFirstOfMonth, moneyPattern, type ActivityKpi, type ActivityKpiLog, type Profile, type Setting, type Task } from '@/lib/domain';

export function TaskForm({ task, setting, kpi, kpiReady, today, busy, error, onClose, onArchive, onSave }: {
  task: Task | null; setting: Setting | undefined; kpi?: ActivityKpi; kpiReady: boolean; today: string; busy: boolean; error: string; onClose: () => void; onArchive?: () => void;
  onSave: (title: string, desc: string, reward: number, days: number[], requestId: string, kpiTarget: number | null, kpiUnit: string) => void;
}) {
  const [title, setTitle] = useState(task?.title ?? ''), [desc, setDesc] = useState(task?.description ?? ''), [reward, setReward] = useState(((setting?.reward_cents ?? 0) / 100).toFixed(2));
  const [days, setDays] = useState(setting?.weekdays ?? [1, 2, 3, 4, 5, 6, 7]), [requestId] = useState(() => crypto.randomUUID());
  const [track, setTrack] = useState(!!kpi), [kpiTarget, setKpiTarget] = useState(kpi ? String(kpi.target) : ''), [kpiUnit, setKpiUnit] = useState(kpi?.unit ?? '');
  const locked = !!task && !isFirstOfMonth(today);
  const valid = moneyPattern.test(reward) && title.trim().length > 0 && desc.length <= 10000 && days.length > 0
    && (!track || (kpiReady && Number(kpiTarget) > 0 && Number(kpiTarget) <= 100000000 && kpiUnit.trim().length > 0 && kpiUnit.trim().length <= 30));
  return (
    <Form>
      <FormField label="Title"><Input value={title} onChange={(e) => setTitle(e.target.value)} /></FormField>
      <FormField label="Routine notes" hint={desc.length > 10000 ? <span className="text-destructive">Maximum 10,000 characters.</span> : undefined}>
        <Textarea rows={5} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Steps, products, and notes" />
      </FormField>
      <FormField label="Reward ($)" hint={locked ? 'Reward and schedule changes reopen on the first calendar day next month.' : undefined}>
        <Input value={reward} onChange={(e) => setReward(e.target.value)} disabled={locked} inputMode="decimal" />
      </FormField>
      <WeekdayPicker value={days} onChange={setDays} disabled={locked} />
      <div className="flex flex-col gap-3 rounded-xl bg-muted/50 p-3.5">
        <label className="flex items-center justify-between gap-3 text-sm font-medium">
          Track a measurable goal
          <Switch checked={track} disabled={!kpiReady} onCheckedChange={(v) => setTrack(v)} />
        </label>
        {track && (
          <FieldRow>
            <FormField label="Daily target"><Input type="number" min="0.001" step="any" value={kpiTarget} onChange={(e) => setKpiTarget(e.target.value)} placeholder="e.g. 2" /></FormField>
            <FormField label="Unit"><Input value={kpiUnit} maxLength={30} onChange={(e) => setKpiUnit(e.target.value)} placeholder="liters, miles, steps" /></FormField>
          </FieldRow>
        )}
        {!kpiReady && <p className="text-xs text-muted-foreground">Measurable goals need the activity KPI database update.</p>}
        {track && <p className="text-xs text-muted-foreground">Log your daily number on the checklist. Checkoff and rewards remain separate, so you decide when the activity is complete.</p>}
      </div>
      {error && <ErrorText>Could not save. Your draft is safe. {error}</ErrorText>}
      {onArchive && <Button variant="destructive" className="self-start" disabled={busy} onClick={onArchive}>Archive activity after today</Button>}
      <SheetFooter>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button disabled={busy || !valid} onClick={() => onSave(title, desc, Math.round(Number(reward) * 100), days, requestId, track ? Number(kpiTarget) : null, kpiUnit.trim())}>Save activity</Button>
      </SheetFooter>
    </Form>
  );
}

export function KpiLogForm({ kpi, log, busy, error, onClose, onSave }: { kpi: ActivityKpi; log?: ActivityKpiLog; busy: boolean; error: string; onClose: () => void; onSave: (value: number) => Promise<boolean> }) {
  const [value, setValue] = useState(log ? String(log.value) : '');
  const amount = Number(value), valid = value.trim() !== '' && Number.isFinite(amount) && amount >= 0 && amount <= 100000000;
  return (
    <Form>
      <FormField label={`Today’s ${kpi.unit}`}>
        <Input type="number" min="0" step="any" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} className="tabular h-12 text-2xl font-semibold md:text-xl" />
      </FormField>
      {valid && (amount >= kpi.target
        ? <Alert variant="success"><AlertDescription>Goal reached!</AlertDescription></Alert>
        : <p className="text-sm text-muted-foreground">Keep going — {Math.round((kpi.target - amount) * 1000) / 1000} {kpi.unit} to go.</p>)}
      <ErrorText>{error}</ErrorText>
      <SheetFooter>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button disabled={busy || !valid} onClick={() => onSave(amount)}>Save number</Button>
      </SheetFooter>
    </Form>
  );
}

export function GoalsForm({ profile, busy, error, onClose, onSave }: { profile: Profile; busy: boolean; error: string; onClose: () => void; onSave: (step: number, water: number, unit: string) => void }) {
  const [step, setStep] = useState(profile.step_goal ?? 10000), [water, setWater] = useState(String(profile.water_quantity ?? '')), [unit, setUnit] = useState(profile.water_unit ?? '');
  return (
    <Form>
      <FormField label="Step goal">
        <NativeSelect value={step} onChange={(e) => setStep(Number(e.target.value))}>
          <NativeSelectOption value={10000}>10,000</NativeSelectOption>
          <NativeSelectOption value={15000}>15,000</NativeSelectOption>
        </NativeSelect>
      </FormField>
      <FieldRow>
        <FormField label="Water amount"><Input type="number" min="0.01" step="any" value={water} onChange={(e) => setWater(e.target.value)} /></FormField>
        <FormField label="Water unit"><Input value={unit} onChange={(e) => setUnit(e.target.value)} /></FormField>
      </FieldRow>
      {error && <ErrorText>Could not save. Your draft is safe. {error}</ErrorText>}
      <SheetFooter>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button disabled={busy || !(Number(water) > 0) || !unit.trim()} onClick={() => onSave(step, Number(water), unit)}>Save goals</Button>
      </SheetFooter>
    </Form>
  );
}

export function TemplateForm({ task, busy, onClose, onSave }: { task: Task; busy: boolean; onClose: () => void; onSave: (name: string) => void }) {
  const [name, setName] = useState(task.title);
  return (
    <Form>
      <FormField label="Template name"><Input value={name} onChange={(e) => setName(e.target.value)} /></FormField>
      <p className="whitespace-pre-wrap rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">{task.description || 'No description yet.'}</p>
      <SheetFooter>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button disabled={busy || !name.trim()} onClick={() => onSave(name)}>Save template</Button>
      </SheetFooter>
    </Form>
  );
}

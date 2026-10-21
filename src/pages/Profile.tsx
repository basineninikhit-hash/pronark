import { useEffect, useState, type ReactNode } from 'react';
import { ChevronRight, Compass, Settings as SettingsIcon, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { FormField, SectionHeading } from '@/components/pronark';
import { cn } from '@/lib/utils';
import { isFirstOfMonth, type Profile } from '@/lib/domain';
import { CharacterCustomizer } from '@/components/character-customizer';
import { CompanionCharacter, type CharacterStyle } from '@/components/companion-character';

export function ProfilePage({ profile, readOnly, busy, today, character, onSaveCharacter, onSettings, onEditGoals, onSaveName, onTour, onGroups, children }: {
  profile: Profile; readOnly: boolean; busy: boolean; today: string; character: CharacterStyle; onSaveCharacter: (style: CharacterStyle) => Promise<boolean>;
  onSettings: () => void; onEditGoals: () => void; onSaveName: (name: string) => Promise<boolean>; onTour: () => void; onGroups: () => void; children?: ReactNode;
}) {
  const [name, setName] = useState(profile.display_name), [look, setLook] = useState(character);
  useEffect(() => { setLook(character); }, [character.color, character.hat, character.outfit]);
  const lookChanged = look.color !== character.color || look.hat !== character.hat || look.outfit !== character.outfit;
  const initials = profile.display_name.trim().split(/\s+/).slice(0, 2).map((s) => s[0]?.toUpperCase() ?? '').join('') || 'P';
  return (
    <div className="flex w-full max-w-3xl flex-col gap-5">
      <section className="flex items-center gap-4 rounded-2xl bg-gradient-to-br from-primary/12 to-transparent p-5 ring-1 ring-primary/15">
        <span className="grid size-16 shrink-0 place-items-center rounded-full bg-primary text-xl font-semibold text-primary-foreground" aria-label="Profile initials">{initials}</span>
        <div className="min-w-0">
          <h2 className="text-title truncate">{profile.display_name}</h2>
          <p className="text-sm text-muted-foreground">Your name appears in your Home greeting and partner view.</p>
        </div>
      </section>

      <Card>
        <CardContent className="flex flex-col gap-3">
          <SectionHeading title="Personal information" />
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <FormField label="Display name" className="flex-1"><Input value={name} maxLength={100} disabled={readOnly} onChange={(e) => setName(e.target.value)} /></FormField>
            {!readOnly && <Button disabled={busy || !name.trim() || name.trim() === profile.display_name} onClick={() => onSaveName(name)}>Save name</Button>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-3">
          <SectionHeading title="Monthly goals" action={!readOnly && isFirstOfMonth(today) && <Button variant="outline" size="sm" onClick={onEditGoals}>Edit</Button>} />
          <dl className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-muted/50 p-3"><dt className="text-xs text-muted-foreground">Step goal</dt><dd className="tabular text-lg font-semibold">{profile.step_goal?.toLocaleString() ?? 'Not set'}</dd></div>
            <div className="rounded-xl bg-muted/50 p-3"><dt className="text-xs text-muted-foreground">Water goal</dt><dd className="tabular text-lg font-semibold">{profile.water_quantity ?? 'Not set'} <span className="text-sm font-normal text-muted-foreground">{profile.water_unit ?? ''}</span></dd></div>
          </dl>
          {!readOnly && !isFirstOfMonth(today) && <p className="text-xs text-muted-foreground">Changes reopen on the first calendar day of next month.</p>}
        </CardContent>
      </Card>

      <Card id="companion-picker">
        <CardContent className="flex flex-col gap-3">
          <SectionHeading title="Your companion" description="Dress up the friend who cheers you on at Home and in celebrations. Your look is saved to your account." />
          {readOnly ? <CompanionCharacter style={character} interactive className="mx-auto h-56 w-48" /> : (
            <>
              <CharacterCustomizer value={look} onChange={setLook} disabled={busy} />
              <div className="flex flex-wrap justify-end gap-2">
                {lookChanged && <Button variant="ghost" onClick={() => setLook(character)}>Reset</Button>}
                <Button disabled={busy || !lookChanged} onClick={() => onSaveCharacter(look)}>Save look</Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {!readOnly && (
        <Card className="py-1">
          <ul className="flex flex-col divide-y">
            <LinkRow icon={<Compass />} title="Explore Pronark setup" description="Preview the new-member walkthrough. Nothing is reset or saved." onClick={onTour} />
            <LinkRow icon={<Users />} title="Your groups" description="Choose what each private group can see from you." onClick={onGroups} />
            <LinkRow icon={<SettingsIcon />} title="Group and settings" description="Notifications, invitations and weekly email." onClick={onSettings} />
          </ul>
        </Card>
      )}
      {children}
    </div>
  );
}

function LinkRow({ icon, title, description, onClick }: { icon: ReactNode; title: string; description: string; onClick: () => void }) {
  return (
    <li>
      <button type="button" onClick={onClick} className="flex w-full items-center gap-3 px-4 py-3 text-left transition-[background-color] duration-100 hover:bg-muted/50 active:bg-muted [&_svg]:size-4">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">{icon}</span>
        <span className="min-w-0 flex-1"><strong className="block text-sm font-medium">{title}</strong><span className="text-xs text-muted-foreground">{description}</span></span>
        <ChevronRight className="text-muted-foreground" aria-hidden="true" />
      </button>
    </li>
  );
}

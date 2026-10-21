import { useRef } from 'react';
import { cn } from '@/lib/utils';
import { CompanionCharacter, characterChoices, characterColors, type CharacterHandle, type CharacterStyle } from '@/components/companion-character';

/** Live preview plus color, hat and outfit choices. The preview reacts to each change. */
export function CharacterCustomizer({ value, onChange, disabled }: { value: CharacterStyle; onChange: (style: CharacterStyle) => void; disabled?: boolean }) {
  const preview = useRef<CharacterHandle>(null);
  const set = <K extends keyof CharacterStyle>(key: K, next: CharacterStyle[K]) => {
    if (next === value[key]) return;
    onChange({ ...value, [key]: next });
    preview.current?.react(key === 'color' ? 'giggle' : 'hello');
  };
  const chip = (selected: boolean) => cn(
    'h-8 rounded-full px-3 text-xs font-medium ring-1 transition-[background-color,color,scale] duration-100 active:scale-95 disabled:opacity-60 pointer-coarse:h-10 pointer-coarse:px-4',
    selected ? 'bg-primary text-primary-foreground ring-primary' : 'bg-card text-foreground ring-foreground/15 hover:bg-muted/60',
  );
  return (
    <div className="grid items-center gap-5 rounded-2xl bg-primary/5 p-4 ring-1 ring-primary/10 sm:grid-cols-[minmax(10rem,13rem)_1fr]">
      <CompanionCharacter ref={preview} style={value} interactive listen={false} className="mx-auto h-56 w-48 sm:h-60 sm:w-full" />
      <div className="flex flex-col gap-4">
        <fieldset disabled={disabled} className="flex flex-col gap-2">
          <legend className="mb-2 text-xs font-medium">Color</legend>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Color">
            {characterChoices.color.map(([id, name]) => (
              <button key={id} type="button" role="radio" aria-checked={value.color === id} aria-label={name} title={name} onClick={() => set('color', id)}
                className={cn('grid size-9 place-items-center rounded-full ring-1 ring-foreground/15 transition-[box-shadow,scale] duration-100 active:scale-90 pointer-coarse:size-11',
                  value.color === id && 'ring-2 ring-primary ring-offset-2 ring-offset-background')}>
                <span className="size-6 rounded-full border border-black/10" style={{ background: characterColors[id] }} />
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset disabled={disabled} className="flex flex-col gap-2">
          <legend className="mb-2 text-xs font-medium">Hat</legend>
          <div className="flex flex-wrap gap-1.5">
            {characterChoices.hat.map(([id, name]) => <button key={id} type="button" aria-pressed={value.hat === id} onClick={() => set('hat', id)} className={chip(value.hat === id)}>{name}</button>)}
          </div>
        </fieldset>
        <fieldset disabled={disabled} className="flex flex-col gap-2">
          <legend className="mb-2 text-xs font-medium">Outfit</legend>
          <div className="flex flex-wrap gap-1.5">
            {characterChoices.outfit.map(([id, name]) => <button key={id} type="button" aria-pressed={value.outfit === id} onClick={() => set('outfit', id)} className={chip(value.outfit === id)}>{name}</button>)}
          </div>
        </fieldset>
        <p className="text-xs text-muted-foreground">Tip: tap your companion to say hi.</p>
      </div>
    </div>
  );
}

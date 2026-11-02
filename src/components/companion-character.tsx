import { useEffect, useId, useImperativeHandle, useRef, useState, type Ref } from 'react';
import { prefersReducedMotion, useReducedMotion, useSpring } from '@/lib/motion';
import { cn } from '@/lib/utils';
import './companion-character.css';

export type CharacterStyle = { color: 'cream' | 'mint' | 'lavender' | 'peach' | 'sky'; hat: 'none' | 'cap' | 'beanie' | 'crown'; outfit: 'none' | 'hoodie' | 'overalls' | 'cape' };
export const defaultCharacterStyle: CharacterStyle = { color: 'cream', hat: 'none', outfit: 'none' };
export const characterColors: Record<CharacterStyle['color'], string> = { cream: '#f8f6ee', mint: '#bce7d1', lavender: '#d9cdf5', peach: '#f8d6bc', sky: '#bcddec' };
export const characterChoices = {
  color: [['cream', 'Cream'], ['mint', 'Mint'], ['lavender', 'Lavender'], ['peach', 'Peach'], ['sky', 'Sky']],
  hat: [['none', 'None'], ['cap', 'Cap'], ['beanie', 'Beanie'], ['crown', 'Crown']],
  outfit: [['none', 'None'], ['hoodie', 'Hoodie'], ['overalls', 'Overalls'], ['cape', 'Cape']],
} as const;

/** Something the companion holds up, matching the screen (a timer on Routines, a coin in Wallet…). */
export type CompanionProp = 'checklist' | 'timer' | 'calendar' | 'chart' | 'gift' | 'coin' | 'heart';
const propNames: Record<CompanionProp, string> = { checklist: 'a checklist', timer: 'a timer', calendar: 'a calendar', chart: 'a chart', gift: 'a gift', coin: 'a coin', heart: 'a heart' };

/** The props, drawn in a 56×56 box. */
function PropArt({ prop }: { prop: CompanionProp }) {
  const card = { fill: '#fff', stroke: '#c9ccc2', strokeWidth: 2 };
  switch (prop) {
    case 'calendar': return <>
      <rect x="2" y="6" width="52" height="48" rx="7" {...card} />
      <path d="M2 13a7 7 0 0 1 7-7h38a7 7 0 0 1 7 7v7H2z" fill="#e8806f" />
      <rect x="14" y="1" width="5" height="10" rx="2.5" fill="#5b6b61" /><rect x="37" y="1" width="5" height="10" rx="2.5" fill="#5b6b61" />
      {[10, 23, 36].flatMap((x) => [26, 39].map((y) => <rect key={`${x}-${y}`} x={x} y={y} width="10" height="9" rx="2" fill={x === 36 && y === 39 ? '#6fbf8e' : '#e4e7df'} />))}
      <path d="M38.5 43.5l2.5 2.5 4-4.5" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </>;
    case 'timer': return <>
      <rect x="23" y="1" width="10" height="7" rx="2" fill="#357a5c" /><rect x="26.5" y="7" width="3" height="4" fill="#357a5c" />
      <circle cx="28" cy="33" r="21" fill="#fff" stroke="#357a5c" strokeWidth="4" />
      <path d="M28 33V16a17 17 0 0 1 16 22z" fill="#bce7d1" />
      <path d="M28 33V18" stroke="#202622" strokeWidth="3" strokeLinecap="round" /><circle cx="28" cy="33" r="3" fill="#202622" />
    </>;
    case 'chart': return <>
      <rect x="2" y="4" width="52" height="48" rx="8" {...card} />
      <rect x="11" y="30" width="8" height="14" rx="2" fill="#bce7d1" /><rect x="24" y="22" width="8" height="22" rx="2" fill="#78c39b" /><rect x="37" y="13" width="8" height="31" rx="2" fill="#357a5c" />
      <path d="M8 45h40" stroke="#c9ccc2" strokeWidth="2" strokeLinecap="round" />
    </>;
    case 'gift': return <>
      <rect x="4" y="22" width="48" height="32" rx="5" fill="#d9cdf5" stroke="#a891d9" strokeWidth="2" />
      <rect x="1" y="14" width="54" height="11" rx="4" fill="#c3b0ee" stroke="#a891d9" strokeWidth="2" />
      <rect x="24" y="14" width="8" height="40" fill="#e8806f" />
      <path d="M28 14C18 2 8 8 18 14zM28 14C38 2 48 8 38 14z" fill="#e8806f" stroke="#c9604f" strokeWidth="1.5" />
    </>;
    case 'coin': return <>
      <circle cx="28" cy="30" r="24" fill="#f4c65d" stroke="#c89631" strokeWidth="3" />
      <circle cx="28" cy="30" r="17" fill="none" stroke="#e0ac3f" strokeWidth="2" />
      <text x="28" y="39" textAnchor="middle" fontSize="24" fontWeight="800" fill="#9a6b17" fontFamily="inherit">$</text>
    </>;
    case 'checklist': return <>
      <rect x="6" y="4" width="44" height="52" rx="6" {...card} />
      <rect x="18" y="0" width="20" height="9" rx="3" fill="#78a894" />
      {[18, 30, 42].map((y, i) => <g key={y}>
        <circle cx="16" cy={y} r="4.5" fill={i < 2 ? '#6fbf8e' : '#fff'} stroke={i < 2 ? '#6fbf8e' : '#c9ccc2'} strokeWidth="1.5" />
        <path d={`M24 ${y}h18`} stroke="#dcded5" strokeWidth="3" strokeLinecap="round" />
      </g>)}
    </>;
    case 'heart': return <path d="M28 50C6 36 2 22 10 13c7-7 15-4 18 3 3-7 11-10 18-3 8 9 4 23-18 37z" fill="#f29fae" stroke="#d9788b" strokeWidth="2" />;
  }
}

/** One-shot animations the character can play. */
export type CharacterReaction = 'cheer' | 'shrug' | 'hello' | 'giggle' | 'celebrate' | 'stretch';
const durations: Record<CharacterReaction, number> = { cheer: 1100, shrug: 950, hello: 1300, giggle: 800, celebrate: 2000, stretch: 1800 };
export type CharacterHandle = { react: (reaction: CharacterReaction) => void };

/** Make every listening character on screen react (e.g. after a checkoff is saved). */
export function companionReact(reaction: CharacterReaction) {
  window.dispatchEvent(new CustomEvent<CharacterReaction>('pronark-companion', { detail: reaction }));
}

/** Accepts whatever the database returns and falls back to the default look for anything unknown. */
export function toCharacterStyle(value: unknown): CharacterStyle {
  const v = (value ?? {}) as Partial<CharacterStyle>;
  const pick = <K extends keyof CharacterStyle>(key: K) => (characterChoices[key] as readonly (readonly [string, string])[]).some(([id]) => id === v[key]) ? v[key] as CharacterStyle[K] : defaultCharacterStyle[key];
  return { color: pick('color'), hat: pick('hat'), outfit: pick('outfit') };
}

const timeOfDay = () => { const h = new Date().getHours(); return h >= 22 || h < 5 ? 'night' : h < 10 ? 'morning' : 'day'; };

/**
 * Pronark's companion. Idle: floats, blinks, sways. Reacts to app events (`listen`), to taps
 * (`interactive`: squishes 1:1 like a soft toy on press, springs back, then waves or giggles),
 * and to the time of day (sleepy at night, a stretch on the first morning visit).
 */
export function CompanionCharacter({ style, className, interactive = false, listen = true, entrance, ref, label, holding }: {
  style: CharacterStyle;
  /** Hold up a prop in the right paw, like a timer on the Routines screen. */
  holding?: CompanionProp | null;
  className?: string;
  interactive?: boolean;
  listen?: boolean;
  entrance?: CharacterReaction;
  ref?: Ref<CharacterHandle>;
  label?: string;
}) {
  const id = useId().replace(/:/g, '');
  const base = characterColors[style.color];
  const reduced = useReducedMotion();
  const [reaction, setReaction] = useState<CharacterReaction | null>(null);
  const [period] = useState(timeOfDay);
  const timer = useRef(0), squishRef = useRef<HTMLDivElement>(null), taps = useRef(0);

  const play = (next: CharacterReaction) => {
    if (prefersReducedMotion()) return;
    window.clearTimeout(timer.current);
    setReaction(null);
    // Restart on the next frame so the same reaction can play twice in a row.
    requestAnimationFrame(() => {
      setReaction(next);
      timer.current = window.setTimeout(() => setReaction(null), durations[next]);
    });
  };
  useImperativeHandle(ref, () => ({ react: play }), []);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  useEffect(() => {
    if (!listen) return;
    const onReact = (e: Event) => play((e as CustomEvent<CharacterReaction>).detail);
    window.addEventListener('pronark-companion', onReact);
    return () => window.removeEventListener('pronark-companion', onReact);
  }, [listen]);

  useEffect(() => {
    if (entrance) { play(entrance); return; }
    if (period !== 'morning' || !interactive) return;
    const key = 'pronark-morning-stretch:' + new Date().toDateString();
    try { if (sessionStorage.getItem(key)) return; sessionStorage.setItem(key, '1'); } catch { /* storage blocked */ }
    const t = window.setTimeout(() => play('stretch'), 600);
    return () => window.clearTimeout(t);
  }, []);

  // Squash & stretch that tracks the press, then springs back with a little jelly overshoot.
  const squish = useSpring(0, (v) => { if (squishRef.current) squishRef.current.style.scale = `${(1 + 0.07 * v).toFixed(4)} ${(1 - 0.11 * v).toFixed(4)}`; }, { damping: 1, response: 0.18, precision: 0.002 });
  const press = interactive && !reduced ? {
    onPointerDown: () => squish.to(1, { damping: 1, response: 0.16 }),
    onPointerUp: () => { squish.to(0, { damping: 0.4, response: 0.45 }); const order: CharacterReaction[] = ['hello', 'giggle', 'cheer']; play(order[taps.current++ % order.length]); },
    onPointerLeave: () => squish.to(0, { damping: 0.6, response: 0.35 }),
    onPointerCancel: () => squish.to(0, { damping: 0.6, response: 0.35 }),
  } : {};

  const description = label ? (holding ? `${label} It’s holding ${propNames[holding]}.` : label) : `${holding ? `Holding ${propNames[holding]}. ` : ''}${style.color} companion with ${style.hat === 'none' ? 'no hat' : `a ${style.hat}`} and ${style.outfit === 'none' ? 'no outfit' : `a ${style.outfit}`}`;
  const svg = (
    <svg className={cn('pronark-character', period === 'night' && 'is-sleepy', reaction && `react-${reaction}`)} viewBox="0 0 280 330" role="img" aria-label={description}>
      <defs>
        <radialGradient id={`${id}-body`} cx="36%" cy="20%" r="78%"><stop stopColor="#fff" stopOpacity=".86" /><stop offset=".45" stopColor={base} /><stop offset="1" stopColor={base} /></radialGradient>
      </defs>
      <ellipse className="character-shadow" cx="142" cy="312" rx="87" ry="10" fill="#244c36" opacity=".12" />
      <g className="character-bob">
        {style.outfit === 'cape' && <path d="M84 128 Q41 148 47 260 Q91 293 139 272 Q190 293 235 259 Q239 152 194 128Z" fill="#d49362" stroke="#ab6e47" strokeWidth="3" />}
        <g className="character-leg character-leg-left"><rect x="94" y="251" width="43" height="55" rx="20" fill={`url(#${id}-body)`} stroke="#d5d6ce" /><ellipse cx="112" cy="299" rx="27" ry="12" fill={base} stroke="#d5d6ce" /></g>
        <g className="character-leg character-leg-right"><rect x="146" y="251" width="43" height="55" rx="20" fill={`url(#${id}-body)`} stroke="#d5d6ce" /><ellipse cx="169" cy="299" rx="27" ry="12" fill={base} stroke="#d5d6ce" /></g>
        <g className="character-arm character-arm-left"><ellipse cx="63" cy="192" rx="25" ry="69" transform="rotate(22 63 192)" fill={`url(#${id}-body)`} stroke="#d5d6ce" /><circle cx="66" cy="240" r="11" fill={base} stroke="#d5d6ce" /><circle cx="46" cy="257" r="26" fill={base} stroke="#d5d6ce" /></g>
        <g className="character-arm character-arm-right"><ellipse cx="220" cy="192" rx="25" ry="69" transform="rotate(-22 220 192)" fill={`url(#${id}-body)`} stroke="#d5d6ce" /><circle cx="217" cy="240" r="11" fill={base} stroke="#d5d6ce" /><circle cx="237" cy="257" r="26" fill={base} stroke="#d5d6ce" />
          {/* The prop sits in the paw, with a thumb over its corner so it looks held. */}
          {holding && <g transform="translate(206 196) rotate(-8 28 28)"><g key={holding} className="character-prop"><PropArt prop={holding} /></g></g>}
          {holding && <ellipse cx="220" cy="250" rx="11" ry="9" fill={base} stroke="#d5d6ce" />}
        </g>
        <path d="M106 117 Q141 102 175 117 Q207 138 215 230 Q212 273 184 279 Q141 290 99 279 Q69 269 67 230 Q72 139 106 117Z" fill={`url(#${id}-body)`} stroke="#d5d6ce" strokeWidth="1.5" />
        {style.outfit === 'hoodie' && <><path d="M95 125 Q142 150 188 125 Q213 161 212 232 Q207 262 184 275 Q143 285 99 275 Q73 259 70 231 Q74 160 95 125Z" fill="#78a894" /><path d="M111 126 Q141 151 172 126" fill="none" stroke="#4c806c" strokeWidth="6" /><path d="M113 222 Q142 234 174 222 L168 258 Q142 272 118 258Z" fill="#649782" /><path d="M136 154v28m11-28v28" stroke="#f8f5e9" strokeWidth="3" strokeLinecap="round" /></>}
        {style.outfit === 'overalls' && <><path d="M89 196 Q141 209 194 196 L193 262 Q172 285 141 282 Q107 283 88 261Z" fill="#789bc5" /><path d="M96 135 L121 136 L119 217 L98 218ZM163 136 L184 135 L186 218 L164 217Z" fill="#789bc5" /><path d="M120 220 Q141 231 163 220" fill="none" stroke="#5878a1" strokeWidth="3" /><circle cx="109" cy="209" r="4" fill="#f6cf77" /><circle cx="175" cy="209" r="4" fill="#f6cf77" /></>}
        {style.outfit === 'cape' && <path d="M101 130 Q140 150 181 130" fill="none" stroke="#b97950" strokeWidth="8" strokeLinecap="round" />}
        {style.outfit === 'none' && <><path d="M78 212 Q141 225 204 212" fill="none" stroke="#dcded5" strokeWidth="2" /><circle cx="188" cy="155" r="9" fill="none" stroke="#d8dad2" strokeWidth="2" /></>}
        <g className="character-head">
          <path d="M65 60 Q74 22 134 20 Q205 17 220 70 Q232 117 193 128 Q150 141 96 127 Q45 117 65 60Z" fill={`url(#${id}-body)`} stroke="#d5d6ce" strokeWidth="1.5" />
          <circle className="character-eye" cx="109" cy="82" r="10" fill="#202622" /><circle className="character-eye" cx="181" cy="88" r="10" fill="#202622" />
          <path className="character-mouth" d="M135 106 Q146 113 157 106" fill="none" stroke="#303b34" strokeWidth="2.5" strokeLinecap="round" />
          <path className="character-smile" d="M131 103 Q146 122 161 103" fill="none" stroke="#303b34" strokeWidth="3" strokeLinecap="round" />
          <ellipse className="character-cheek" cx="81" cy="105" rx="11" ry="5" fill="#e9a8a5" opacity=".35" /><ellipse className="character-cheek" cx="204" cy="107" rx="11" ry="5" fill="#e9a8a5" opacity=".35" />
          {style.hat === 'cap' && <><path d="M65 54 Q80 3 140 3 Q200 3 215 52 Q143 34 65 54Z" fill="#357a5c" stroke="#246249" strokeWidth="2" /><path d="M141 47 Q207 39 236 55 Q221 68 175 61Z" fill="#246249" /></>}
          {style.hat === 'beanie' && <><path d="M65 58 Q75 8 137 6 Q203 6 216 59Z" fill="#b36e89" /><path d="M65 54 Q140 36 216 54 L214 69 Q139 51 65 69Z" fill="#965573" /><circle cx="139" cy="5" r="12" fill="#c689a1" /></>}
          {style.hat === 'crown' && <path d="M80 51 L77 10 L108 29 L141 3 L170 29 L205 10 L201 52 Q140 39 80 51Z" fill="#f4c65d" stroke="#c89631" strokeWidth="3" />}
        </g>
      </g>
      {/* Sleepy z's (night only) and celebration sparkles (shown by their reaction classes). */}
      <g className="character-zs" fill="#7a8f82" fontWeight="700" fontFamily="inherit"><text x="214" y="40" fontSize="22">z</text><text x="232" y="18" fontSize="16">z</text></g>
      <g className="character-sparkles" fill="#f4c65d">
        <path className="sparkle sparkle-1" d="M38 70 l5 12 12 5 -12 5 -5 12 -5 -12 -12 -5 12 -5z" />
        <path className="sparkle sparkle-2" d="M240 110 l4 9 9 4 -9 4 -4 9 -4 -9 -9 -4 9 -4z" />
        <path className="sparkle sparkle-3" d="M140 -6 l4 10 10 4 -10 4 -4 10 -4 -10 -10 -4 10 -4z" />
        <path className="sparkle sparkle-4" d="M24 200 l3 7 7 3 -7 3 -3 7 -3 -7 -7 -3 7 -3z" />
      </g>
    </svg>
  );

  return (
    <div ref={squishRef} className={cn('character-frame', interactive && !reduced && 'cursor-pointer touch-manipulation', className)} {...press}
      role={interactive ? 'button' : undefined} tabIndex={interactive ? 0 : undefined} aria-label={interactive ? `Say hi to your companion` : undefined}
      onKeyDown={interactive ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); play('hello'); } } : undefined}>
      {svg}
    </div>
  );
}

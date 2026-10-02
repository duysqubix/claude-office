// Thought bubbles (issue #36): now and then someone thinks out loud. Sessions' thoughts come
// from the server (one short line about their real work, written by Haiku); regulars daydream
// from the little pool below, which never leaves this page. Help → "Thought bubbles" turns it
// all off, and the office then stops asking for thoughts at all (presence `thoughts: false`).
import type { RosterStore } from '../net';
import { bus } from './bus';

/** The bits of the Backend thoughts use (net.ts; the demo office has the same shape). */
export interface ThoughtsBackend {
  readonly demo: boolean;
  /** A session thought something (the server's ThoughtMessage). */
  onThought?: ((sessionId: string, text: string, at: number) => void) | null;
  /** On/off goes out with presence, so the server only thinks while someone wants it. */
  setThoughts?(on: boolean): void;
}

const KEY = 'claude-office:thoughts';

export function thoughtsOn(): boolean {
  try {
    return localStorage.getItem(KEY) !== '0';
  } catch {
    return true;
  }
}

export function setThoughtsOn(on: boolean): void {
  try {
    localStorage.setItem(KEY, on ? '1' : '0');
  } catch {
    // storage unavailable: this visit only
  }
  bus.emit('thoughts', { on });
}

// Dev builds with ?debug=1: checks can make someone think (window.officeThink(sessionId, text)).
if (import.meta.env.DEV && typeof location !== 'undefined' && new URLSearchParams(location.search).has('debug')) {
  Object.assign(window, { officeThink: (id: string, text: string) => bus.emit('thought', { id, text }) });
}

/** Demo office: pretend sessions think, about every 15 s, so screenshots have some. */
const DEMO = [
  'Come on tests, be green. Just this once.',
  'If this regex works first try, I am buying everyone donuts.',
  'Who wrote this? Oh. Me, an hour ago.',
  'One more console.log and I will understand everything.',
  "The bug is not in my code. It's in my heart.",
  'Refactoring is just tidying with extra steps.',
  'I should really read the error message this time.',
  'Almost there. I say that a lot.',
];

/**
 * Wire thoughts to the backend: the saved setting goes out with presence (before start), the
 * server's thoughts become `thought` events, and the demo office makes some up.
 */
export function wireThoughts(backend: ThoughtsBackend, store: RosterStore): void {
  backend.setThoughts?.(thoughtsOn());
  bus.on('thoughts', ({ on }) => backend.setThoughts?.(on));
  // Switched in another window of the office: this one follows (and tells the server).
  window.addEventListener('storage', (ev) => {
    if (ev.key === KEY) bus.emit('thoughts', { on: thoughtsOn() });
  });
  backend.onThought = (id, text) => {
    if (thoughtsOn()) bus.emit('thought', { id, text });
  };
  if (!backend.demo) return;
  let n = 0;
  const tick = () => {
    window.setTimeout(tick, 12_000 + Math.random() * 6000);
    if (!thoughtsOn() || document.hidden) return;
    const busy = store.employees.filter((e) => e.state === 'working' || e.state === 'idle');
    const who = busy[Math.floor(Math.random() * busy.length)];
    if (who) bus.emit('thought', { id: who.sessionId, text: DEMO[n++ % DEMO.length] });
  };
  window.setTimeout(tick, 4000);
}

// ------------------------------------------------------------------ regulars' daydreams

type Mood = 'typing' | 'reading' | 'phone' | 'coffee' | 'idle' | 'night' | 'monday' | 'friday';

const DAYDREAMS: Record<Mood, readonly string[]> = {
  typing: [
    'If I type faster, does it count as cardio?',
    'Just one more line. Then coffee.',
    "Who named this variable 'temp2'? Oh. Me.",
    'Save. Save. Save. Just in case.',
    'This email could have been a sticky note.',
    "I'll write the docs later. Definitely.",
    'Typing loudly so it looks like progress.',
    'Autocorrect thinks it knows me. It does not.',
    'Fingers warmed up. Brain still loading.',
  ],
  reading: [
    'Wait, who wrote this? Past me was wild.',
    'Reading the manual. Voluntarily. Growth.',
    'This chart goes up. Up is good. I think.',
    'If I squint, the spreadsheet looks like art.',
    'Hmm. Hmmmm. Yes. No. Hmm.',
    'Page three of the policy and still no snacks.',
    'I understood every word, just not together.',
    'Bookmarked for later. Later never comes.',
  ],
  phone: [
    "Smile and nod. They can't see me nod.",
    'Please hold. Story of my life.',
    "If I say 'circle back', I win the meeting.",
    'The mute button is my best friend.',
    'Hold music is kind of a bop, honestly.',
    'Yes, I can hear you. Can you hear my sigh?',
  ],
  coffee: [
    'Coffee number three. Or four. Who counts?',
    'This mug is my emotional support object.',
    'Bold of me to think this was decaf.',
    'Hot. Hot. Still hot. Perfect.',
    'The coffee machine and I have an understanding.',
    'Refill or regret? Refill.',
  ],
  idle: [
    'Do the plants get weekends?',
    'I wonder what the office cat does all day.',
    "Lunch is 47 minutes away. Not that I'm counting.",
    'If I sit very still, maybe the bug fixes itself.',
    'Note to self: water the desk plant.',
    'I should stretch. I will not stretch.',
    'That chair looks comfier than mine.',
    'Somebody is microwaving fish again.',
    'What if the stapler has feelings?',
    'Ten tabs open. Eleven. Twelve.',
  ],
  night: [
    'Why am I still here? Oh right, the bug.',
    'So quiet I can hear the plants grow.',
    'Night shift: me and the hum of the fridge.',
    'One more hour. I said that an hour ago.',
    'Midnight snack o’clock.',
    'If the lights go off, I live here now.',
    'The moon is out. So is my patience.',
  ],
  monday: [
    'Monday. We meet again.',
    "Pretending it's still Sunday in my head.",
    'Five more days. I can do this. Probably.',
    'Monday coffee hits different.',
  ],
  friday: [
    'Friday. My brain has already left.',
    'Weekend plans: absolutely nothing. Glorious.',
    'Friday deploys? Not on my watch.',
    'Two more hours of looking busy.',
  ],
};

/** What a regular is up to, as far as daydreaming goes (RegularChar's public bits). */
export interface Daydreamer {
  task: string;
  night: boolean;
  mugInHand: boolean;
  onBreak: boolean;
}

const pick = <T>(list: readonly T[], rand: () => number) => list[Math.floor(rand() * list.length) % list.length];

/** A daydream for this regular right now: what they're doing, the hour, the day of the week. */
export function daydream(r: Daydreamer, now = new Date(), rand: () => number = Math.random): string {
  const hour = now.getHours();
  const day = now.getDay();
  const moods: Mood[] = [];
  if (r.night || hour >= 21 || hour < 5) moods.push('night', 'night');
  if (day === 1) moods.push('monday');
  if (day === 5) moods.push('friday');
  if (r.mugInHand || r.onBreak || r.task === 'sip') moods.push('coffee', 'coffee');
  else if (r.task === 'phone') moods.push('phone', 'phone');
  else if (r.task === 'read' || r.task === 'think') moods.push('reading', 'reading');
  else if (r.task === 'type' || r.task === 'mouse' || r.task === 'notes') moods.push('typing', 'typing');
  moods.push('idle');
  return pick(DAYDREAMS[pick(moods, rand)], rand);
}

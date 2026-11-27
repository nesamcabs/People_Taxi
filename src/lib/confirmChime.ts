// The small "booking confirmed" sound: one soft bell "ding", made in the browser with Web Audio, so there is no
// sound file to download. Browsers only allow sound after a tap, and iPhones only when the audio is started inside that tap,
// so `primeChime()` is called from the "Confirm booking" tap and `playSuccessChime()` later reuses the same, unlocked audio.
// Any failure is silent: the confirmation never depends on sound.

type Ctx = AudioContext;
let shared: Ctx | null = null;

function context(): Ctx | null {
  if (shared) return shared;
  const AC: typeof AudioContext | undefined =
    typeof window === 'undefined' ? undefined : window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  try {
    shared = new AC();
  } catch {
    shared = null;
  }
  return shared;
}

/** Call inside a tap (the "Confirm booking" button): unlocks audio for the chime that follows. */
export function primeChime(): void {
  const ctx = context();
  if (!ctx) return;
  try {
    void ctx.resume();
    // A silent, one-sample sound started inside the tap is what unlocks audio on iOS.
    const buffer = ctx.createBuffer(1, 1, 22050);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(ctx.destination);
    src.start(0);
  } catch {
    /* no sound, nothing else changes */
  }
}

/** When the chime last played: it never plays twice within 1.5 s, whatever calls it. */
let lastPlayed = 0;

/**
 * The booking-confirmed sound: one soft bell strike (E6), a single clear "ding" with a gentle fade of about a second.
 * A pure tone carries it, with two faint higher partials for the bell colour; nothing repeats.
 */
export function playSuccessChime(): void {
  const now = Date.now();
  if (now - lastPlayed < 1500) return;
  lastPlayed = now;
  const ctx = context();
  if (!ctx) return;
  try {
    void ctx.resume();
    const out = ctx.createGain();
    out.gain.value = 0.9;
    out.connect(ctx.destination);
    const at = ctx.currentTime + 0.02;
    const freq = 1318.51;
    for (const [mult, level, length] of [[1, 0.16, 1.15], [2.01, 0.035, 0.7], [3.0, 0.012, 0.4]] as const) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq * mult, at);
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(level, at + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
      osc.connect(gain).connect(out);
      osc.start(at);
      osc.stop(at + length + 0.05);
    }
  } catch {
    /* no sound, nothing else changes */
  }
}

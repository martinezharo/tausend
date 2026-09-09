/**
 * Answer feedback tones.
 *
 * Two short synthesised chords, generated on the fly rather than shipped as
 * files: they cost nothing to ship. The visible correct/incorrect panel remains
 * authoritative — this is a confirmation for someone drilling with their eyes
 * half on the keyboard, not the only channel carrying the result. Anyone who
 * finds it patronising can turn it off in settings, and it stays off.
 */

const KEY = 'tausend:sound';

let context: AudioContext | undefined;

export function soundEnabled(): boolean {
  try {
    return localStorage.getItem(KEY) !== 'off';
  } catch {
    return true;
  }
}

export function setSoundEnabled(on: boolean): void {
  try {
    localStorage.setItem(KEY, on ? 'on' : 'off');
  } catch {
    /* Private mode: the preference simply does not persist. */
  }
}

export function feedbackSound(correct: boolean): void {
  if (!soundEnabled()) return;
  try {
    context ??= new AudioContext();
    void context.resume();
    const start = context.currentTime;
    // Rising major triad for a hit, falling fifth for a miss.
    const notes = correct ? [523, 659, 784] : [220, 165];
    for (const [i, frequency] of notes.entries()) {
      const at = start + i * 0.075;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(0.07, at + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, at + 0.18);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(at);
      oscillator.stop(at + 0.2);
    }
  } catch {
    /* Audio feedback is optional; the visible result is authoritative. */
  }
}

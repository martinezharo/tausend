let context: AudioContext | undefined;
export function feedbackSound(correct: boolean) {
  try {
    if (localStorage.getItem("tausend:sound") === "off") return;
    context ??= new AudioContext();
    void context.resume();
    const start = context.currentTime;
    for (const [i, frequency] of (correct
      ? [523, 659, 784]
      : [220, 165]
    ).entries()) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0, start + i * 0.075);
      gain.gain.linearRampToValueAtTime(0.07, start + i * 0.075 + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, start + i * 0.075 + 0.18);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(start + i * 0.075);
      oscillator.stop(start + i * 0.075 + 0.2);
    }
  } catch {
    /* Audio feedback is optional; the visible result is authoritative. */
  }
}

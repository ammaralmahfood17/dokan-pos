import { useCallback, useRef } from "react";

/**
 * KDS sound alerts. Plays the bundled two-tone chime when a new order
 * arrives; falls back to a WebAudio beep when the asset is unavailable.
 * Respects `prefers-reduced-motion` (the doc's accessibility rule).
 */
export function useKDSSound() {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const playNewOrder = useCallback(() => {
    // Respect user preference (A11y rule 7) — no sound for reduced motion.
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion) return;

    try {
      if (!audioRef.current) audioRef.current = new Audio("/sounds/new-order.mp3");
      const audio = audioRef.current;
      audio.volume = 0.7;
      audio.currentTime = 0;
      void audio.play().catch(() => beep());
    } catch {
      beep();
    }
  }, []);

  return { playNewOrder };
}

/** WebAudio fallback — a short 880 Hz tick that needs no asset. */
function beep() {
  try {
    const AudioCtx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const audioCtx = new AudioCtx();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.3);
  } catch {
    // audio not supported
  }
}
/**
 * Human-like timing utilities — ported from competitor-dashboard timing.ts + base.ts
 * Provides jittered delays that mimic real human interaction patterns.
 */

/** Random delay between min and max ms */
export function randomRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

/** Base delay with ±jitter% variation */
export function jitteredDelay(baseMs: number, jitterPercent = 0.3): number {
  const jitter = baseMs * jitterPercent;
  return baseMs + (Math.random() * 2 - 1) * jitter;
}

/** Sleep for a random duration */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** Per-character typing delay (40-60 WPM feel) */
export function getTypingDelay(): number {
  return randomRange(50, 200);
}

/** Thinking pause before major actions */
export function getThinkingDelay(): number {
  const base = randomRange(1500, 4000);
  // 15% chance of longer "distraction" pause
  if (Math.random() < 0.15) return base + randomRange(3000, 6000);
  return base;
}

/** Delay between scrolls (simulating reading) */
export function getScrollReadDelay(): number {
  return randomRange(1500, 3500);
}

/** Scroll amount with ±30% jitter */
export function getScrollAmount(base = 600): number {
  return Math.round(base * (0.7 + Math.random() * 0.6));
}

/** Delay between visiting different pages/items */
export function getNavigationDelay(): number {
  const base = randomRange(2000, 5000);
  // 20% chance of longer pause
  if (Math.random() < 0.2) return base + randomRange(3000, 8000);
  return base;
}

/** Short pause before clicking (human reaction time) */
export function getPreClickDelay(): number {
  return randomRange(200, 800);
}

/** Number of micro-steps for mouse movement (curve feel) */
export function getMouseSteps(): number {
  return Math.floor(randomRange(15, 40));
}

/** Whether to do an overshoot correction (20% chance) */
export function shouldOvershoot(): boolean {
  return Math.random() < 0.2;
}

/** Overshoot offset in pixels */
export function getOvershootOffset(): { x: number; y: number } {
  return {
    x: Math.random() * 20 - 10,
    y: Math.random() * 15 - 7,
  };
}

/** Whether to do a small back-scroll (8% chance) */
export function shouldBackScroll(): boolean {
  return Math.random() < 0.08;
}

/** Small back-scroll amount */
export function getBackScrollAmount(): number {
  return randomRange(100, 250);
}

/** Whether to move mouse before scrolling (60% chance) */
export function shouldPreScrollMouseMove(): boolean {
  return Math.random() < 0.6;
}

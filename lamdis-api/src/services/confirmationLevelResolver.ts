/**
 * Confirmation Level Resolver
 *
 * Determines the evidence strength of an event based on:
 * 1. Explicit level from SDK (customer knows best)
 * 2. Auto-classification from event type patterns
 *
 * Levels:
 *   A — Observed intent (system decided to act)
 *   B — Attempted action (outbound call made)
 *   C — Acknowledged action (got 2xx response)
 *   D — Confirmed system state (source-of-truth readback)
 *   E — End-to-end completed outcome
 */

// ---------------------------------------------------------------------------
// Pattern-based auto-classification
// ---------------------------------------------------------------------------

const LEVEL_PATTERNS: Array<{ level: string; patterns: RegExp[] }> = [
  {
    level: 'E',
    patterns: [
      /\.completed$/,
      /\.outcome\.confirmed$/,
      /\.end_to_end$/,
      /interaction\.completed$/,
      /workflow\.completed$/,
      /process\.completed$/,
    ],
  },
  {
    level: 'D',
    patterns: [
      /\.state\.verified$/,
      /\.readback$/,
      /\.status\.confirmed$/,
      /\.state\.confirmed$/,
      /\.verified$/,
      /\.state\.read$/,
    ],
  },
  {
    level: 'C',
    patterns: [
      /\.acknowledged$/,
      /\.response\.received$/,
      /\.response\.success$/,
      /\.accepted$/,
      /\.confirmed$/,
      /\.created$/,  // downstream created something
    ],
  },
  {
    level: 'B',
    patterns: [
      /\.invoked$/,
      /\.called$/,
      /\.sent$/,
      /\.requested$/,
      /\.triggered$/,
      /\.initiated$/,
      /tool\.invoked$/,
      /notification\.sent$/,
      /escalation\.triggered$/,
    ],
  },
  {
    level: 'A',
    patterns: [
      /\.decided$/,
      /\.intent$/,
      /\.planned$/,
      /\.selected$/,
      /\.detected$/,
      /\.received$/,
      /message\.received$/,
      /decision\.made$/,
      /interaction\.started$/,
    ],
  },
];

/**
 * Resolve the confirmation level for an event.
 *
 * Priority:
 * 1. Explicit level from SDK (if provided and valid)
 * 2. Auto-classification from event type
 * 3. Default to 'A'
 */
export function resolveConfirmationLevel(
  eventType: string,
  explicitLevel?: string | null,
  payload?: Record<string, unknown>,
): string {
  // 1. Trust explicit level from SDK
  if (explicitLevel && ['A', 'B', 'C', 'D', 'E'].includes(explicitLevel)) {
    return explicitLevel;
  }

  // 2. Auto-classify from event type patterns
  for (const { level, patterns } of LEVEL_PATTERNS) {
    for (const pattern of patterns) {
      if (pattern.test(eventType)) {
        return level;
      }
    }
  }

  // 3. Check payload for response status codes (heuristic for C-level)
  if (payload) {
    const status = payload.statusCode || payload.status || payload.httpStatus;
    if (typeof status === 'number' && status >= 200 && status < 300) {
      return 'C';
    }
  }

  // 4. Default to A (weakest evidence)
  return 'A';
}

/**
 * Compare two confirmation levels.
 * Returns positive if a > b, negative if a < b, 0 if equal.
 */
export function compareConfirmationLevels(a: string, b: string): number {
  const order = ['A', 'B', 'C', 'D', 'E'];
  return order.indexOf(a) - order.indexOf(b);
}

/**
 * Get the higher of two confirmation levels.
 */
export function maxConfirmationLevel(a: string | null | undefined, b: string | null | undefined): string {
  if (!a) return b || 'A';
  if (!b) return a;
  return compareConfirmationLevels(a, b) >= 0 ? a : b;
}

import { randomUUID } from 'crypto';

type GeneratorFn = (args: string[]) => string;

const generators: Record<string, GeneratorFn> = {
  uuid: () => randomUUID(),

  randInt: (args) => {
    if (args.length === 1) {
      // ${randInt(5)} => random integer with exactly 5 digits
      const digits = Math.max(1, parseInt(args[0], 10) || 1);
      const min = Math.pow(10, digits - 1);
      const max = Math.pow(10, digits) - 1;
      return String(Math.floor(Math.random() * (max - min + 1)) + min);
    }
    if (args.length >= 2) {
      // ${randInt(5,9)} => random integer between 5 and 9 digit length
      const minDigits = Math.max(1, parseInt(args[0], 10) || 1);
      const maxDigits = Math.max(minDigits, parseInt(args[1], 10) || minDigits);
      const digits = Math.floor(Math.random() * (maxDigits - minDigits + 1)) + minDigits;
      const min = Math.pow(10, digits - 1);
      const max = Math.pow(10, digits) - 1;
      return String(Math.floor(Math.random() * (max - min + 1)) + min);
    }
    return String(Math.floor(Math.random() * 1000));
  },

  randDec: (args) => {
    // ${randDec(3,4)} => 3 integer digits, 4 decimal digits, e.g. 123.9483
    const intDigits = Math.max(1, parseInt(args[0], 10) || 1);
    const decDigits = Math.max(1, parseInt(args[1], 10) || 2);
    const intMin = Math.pow(10, intDigits - 1);
    const intMax = Math.pow(10, intDigits) - 1;
    const intPart = Math.floor(Math.random() * (intMax - intMin + 1)) + intMin;
    const decMax = Math.pow(10, decDigits) - 1;
    const decPart = Math.floor(Math.random() * (decMax + 1));
    return `${intPart}.${String(decPart).padStart(decDigits, '0')}`;
  },

  randStr: (args) => {
    const len = Math.max(1, parseInt(args[0], 10) || 8);
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    return Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  },

  timestamp: () => String(Math.floor(Date.now() / 1000)),
  timestampMs: () => String(Date.now()),
  isoDate: () => new Date().toISOString(),

  today: () => new Date().toISOString().slice(0, 10),
  tomorrow: () => {
    const d = new Date(); d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  },
  yesterday: () => {
    const d = new Date(); d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  },
  daysFromNow: (args) => {
    const n = parseInt(args[0], 10) || 0;
    const d = new Date(); d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
  },
  now: () => new Date().toISOString(),

  email: () => `test_${randomUUID().slice(0, 8)}@test.lamdis.io`,

  randFrom: (args) => {
    if (!args.length) return '';
    return args[Math.floor(Math.random() * args.length)].trim();
  },
};

/**
 * Resolve generator expressions in a single value string.
 * Replaces ${generatorName(args)} patterns with generated values.
 * Non-generator expressions (like ${var.foo}) are left untouched.
 */
export function resolveGeneratorValue(value: string): string {
  return value.replace(/\$\{([^}]+)\}/g, (match, expr) => {
    const trimmed = String(expr).trim();
    const funcMatch = trimmed.match(/^([a-zA-Z_]\w*)\s*(?:\(([^)]*)\))?$/);
    if (!funcMatch) return match;

    const fnName = funcMatch[1];
    const argsStr = funcMatch[2] || '';
    const args = argsStr ? argsStr.split(',').map(a => a.trim()) : [];

    const gen = generators[fnName];
    if (!gen) return match; // Not a known generator — leave for interpolation
    return gen(args);
  });
}

/**
 * Resolve an array of test variable definitions into a key-value map.
 * Generator expressions are evaluated once; hardcoded values pass through.
 */
export function resolveTestVariables(
  varDefs: Array<{ key: string; value: string }>
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const def of varDefs) {
    if (!def.key) continue;
    result[def.key] = resolveGeneratorValue(def.value);
  }
  return result;
}

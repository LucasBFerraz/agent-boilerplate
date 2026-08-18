/**
 * Output formatting.
 *
 * Two output modes:
 *   - "kv"     : key=value lines, used by get-card and move so the
 *                composite actions can parse them into $GITHUB_OUTPUT.
 *   - "json"   : single JSON document on stdout.
 *   - "table"  : human-readable rows.
 */
import type { ParsedArgs } from './cli.js';

export type OutputFormat = 'kv' | 'json' | 'table';

export function pickFormat(flags: ParsedArgs['flags'], defaultFormat: OutputFormat = 'kv'): OutputFormat {
  const f = flags['format'];
  if (f === 'json' || f === 'kv' || f === 'table') return f;
  if (f === undefined || f === true) return defaultFormat;
  throw new Error(`Unknown --format value: ${String(f)}`);
}

export function emitKV(records: Record<string, string | number | boolean | undefined>): void {
  for (const [k, v] of Object.entries(records)) {
    if (v === undefined) continue;
    // Use base64 for safe transport of multiline values? The composite
    // action handles single-line values fine; multiline is rare in our
    // outputs. Keep it readable here.
    const s = String(v);
    process.stdout.write(`${k}=${s}\n`);
  }
}

export function emitJSON(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

export function emitTable(headers: string[], rows: string[][]): void {
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => (r[i] ?? '').length))
  );
  const fmt = (cells: string[]) =>
    cells.map((c, i) => c.padEnd(widths[i] ?? 0)).join('  ');
  process.stdout.write(`${fmt(headers)}\n`);
  process.stdout.write(`${widths.map((w) => '-'.repeat(w)).join('  ')}\n`);
  for (const r of rows) {
    process.stdout.write(`${fmt(r)}\n`);
  }
}

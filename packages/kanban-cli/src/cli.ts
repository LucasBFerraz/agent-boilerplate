/**
 * Tiny zero-dependency arg parser.
 *
 * Supports:
 *   --flag value
 *   --flag=value
 *   --bool-flag              (sets flag to "true")
 *   -x value
 *   positional args
 *   -- (rest as positional)
 */
export interface ParsedArgs {
  positionals: string[];
  flags: Record<string, string | boolean>;
}

export function parseArgs(argv: string[]): ParsedArgs {
  const positionals: string[] = [];
  const flags: Record<string, string | boolean> = {};
  let i = 0;
  let stopFlags = false;

  while (i < argv.length) {
    const arg = argv[i]!;

    if (stopFlags) {
      positionals.push(arg);
      i += 1;
      continue;
    }

    if (arg === '--') {
      stopFlags = true;
      i += 1;
      continue;
    }

    if (arg.startsWith('--')) {
      const eq = arg.indexOf('=');
      if (eq !== -1) {
        const key = arg.slice(2, eq);
        const value = arg.slice(eq + 1);
        flags[key] = value;
        i += 1;
        continue;
      }
      const key = arg.slice(2);
      const next = argv[i + 1];
      // If next token exists and doesn't look like a flag, treat as value.
      if (next !== undefined && !next.startsWith('-')) {
        flags[key] = next;
        i += 2;
        continue;
      }
      flags[key] = 'true';
      i += 1;
      continue;
    }

    if (arg.startsWith('-') && arg.length > 1) {
      const key = arg.slice(1);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('-')) {
        flags[key] = next;
        i += 2;
        continue;
      }
      flags[key] = 'true';
      i += 1;
      continue;
    }

    positionals.push(arg);
    i += 1;
  }

  return { positionals, flags };
}

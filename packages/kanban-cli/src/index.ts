#!/usr/bin/env node
/**
 * @boilerplate/kanban-cli
 *
 * Entry point. Routes subcommands to their handlers.
 *
 * Subcommands:
 *   get-card  — Resolve a Project v2 card for an issue and emit key=value lines.
 *   move      — Move a card to a target Status. Optionally post a comment.
 *   comment   — Post a comment on an issue (REST, no Projects needed).
 *   ready     — List issues in a target Status.
 *   whoami    — Print the authenticated login (sanity check).
 */
import { parseArgs } from './cli.js';
import { handleGetCard } from './commands/get-card.js';
import { handleMove } from './commands/move.js';
import { handleComment } from './commands/comment.js';
import { handleReady } from './commands/ready.js';
import { handleWhoami } from './commands/whoami.js';

const USAGE = `kanban — GitHub Projects v2 CLI

Usage:
  kanban <command> [options]

Commands:
  get-card    Resolve a card for an issue.
  move        Move a card to a target status.
  comment     Post a comment on an issue.
  ready       List issues in a target status.
  whoami      Print the authenticated login.

Environment:
  GH_TOKEN         GitHub token. MUST have Projects v2 access (PAT or App).
                   GITHUB_TOKEN alone does NOT work for Projects v2.
  GITHUB_API_URL   Optional. Override the API endpoint.

Run 'kanban <command> --help' for command-specific options.
`;

async function main(): Promise<void> {
  process.stderr.write(`[DEBUG] main: argv=${JSON.stringify(process.argv.slice(2))}\n`);
  const args = parseArgs(process.argv.slice(2));

  if (args.flags.help || args.positionals.length === 0) {
    process.stdout.write(USAGE);
    return;
  }

  const [command, ...rest] = args.positionals;
  process.stderr.write(`[DEBUG] dispatching command: ${command}\n`);

  switch (command) {
    case 'get-card':
      await handleGetCard(rest, args.flags);
      break;
    case 'move':
      await handleMove(rest, args.flags);
      break;
    case 'comment':
      await handleComment(rest, args.flags);
      break;
    case 'ready':
      await handleReady(rest, args.flags);
      break;
    case 'whoami':
      await handleWhoami(rest, args.flags);
      break;
    default:
      process.stderr.write(`Unknown command: ${command}\n\n${USAGE}`);
      process.exit(2);
  }
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`kanban: ${message}\n`);
  if (process.env['KANBAN_DEBUG'] === '1' && err instanceof Error && err.stack) {
    process.stderr.write(`${err.stack}\n`);
  }
  process.exit(1);
});

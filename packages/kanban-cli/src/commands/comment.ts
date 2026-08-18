import { GitHubClient, requireToken } from '../graphql/client.js';
import { emitJSON, emitKV, pickFormat } from '../output.js';
import type { ParsedArgs } from '../cli.js';

/**
 * Post a comment on an issue. Uses the REST API — this command does not
 * touch Projects, so a `GITHUB_TOKEN` with `issues: write` is sufficient.
 */
export async function handleComment(rest: string[], flags: ParsedArgs['flags']): Promise<void> {
  const issue = requireString(flags, 'issue', rest);
  const body = requireString(flags, 'body', rest);
  const repo = process.env['GITHUB_REPOSITORY'];
  if (!repo) {
    throw new Error('comment: GITHUB_REPOSITORY must be set (owner/repo)');
  }
  const [owner, name] = repo.split('/');

  const client = new GitHubClient({ token: requireToken() });
  const result = await client.rest<{ id: number; html_url: string }>(
    'POST',
    `/repos/${owner}/${name}/issues/${issue}/comments`,
    { body }
  );

  const out = { comment_id: String(result.id), comment_url: result.html_url };
  const format = pickFormat(flags, 'kv');
  if (format === 'json') {
    emitJSON(out);
  } else {
    emitKV(out);
  }
}

function requireString(flags: ParsedArgs['flags'], key: string, positionals: string[]): string {
  const v = optionalString(flags, key, positionals);
  if (v) return v;
  if (key === 'issue' && positionals[0] && !positionals[0].startsWith('-')) {
    return positionals[0];
  }
  throw new Error(`Missing required --${key}`);
}

function optionalString(flags: ParsedArgs['flags'], key: string, _positionals: string[]): string | undefined {
  const v = flags[key];
  if (typeof v === 'string' && v.length > 0) return v;
  if (v === true) return '';
  return undefined;
}

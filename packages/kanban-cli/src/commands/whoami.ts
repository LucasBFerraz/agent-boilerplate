import { GitHubClient, requireToken } from '../graphql/client.js';
import { VIEWER_LOGIN } from '../graphql/queries.js';
import { emitJSON, emitKV, pickFormat } from '../output.js';
import type { ParsedArgs } from '../cli.js';

interface ViewerLoginData {
  viewer: { login: string };
}

export async function handleWhoami(_rest: string[], flags: ParsedArgs['flags']): Promise<void> {
  const client = new GitHubClient({ token: requireToken() });
  const data = await client.graphql<ViewerLoginData>(VIEWER_LOGIN);
  const format = pickFormat(flags, 'kv');
  if (format === 'json') {
    emitJSON({ login: data.viewer.login });
  } else {
    emitKV({ login: data.viewer.login });
  }
}

/**
 * Thin GraphQL client for the GitHub v4 API.
 *
 * No external deps — uses Node 20's built-in fetch.
 *
 * The token passed in MUST have Projects v2 access. `GITHUB_TOKEN` does
 * not. The CLI does not enforce this; it surfaces server errors as-is
 * (with a hint) so the caller can diagnose.
 */

export interface GraphQLError {
  message: string;
  type?: string;
  path?: (string | number)[];
}

export class GitHubGraphQLError extends Error {
  readonly errors: GraphQLError[];
  constructor(message: string, errors: GraphQLError[]) {
    super(message);
    this.name = 'GitHubGraphQLError';
    this.errors = errors;
  }
}

export interface GraphQLResponse<T> {
  data?: T;
  errors?: GraphQLError[];
}

export interface ClientOptions {
  token: string;
  apiUrl?: string;
  fetchImpl?: typeof fetch;
}

export class GitHubClient {
  private readonly token: string;
  private readonly apiUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: ClientOptions) {
    if (!opts.token) {
      throw new Error('GitHubClient: token is required (GH_TOKEN)');
    }
    this.token = opts.token;
    this.apiUrl = opts.apiUrl ?? process.env['GITHUB_API_URL'] ?? 'https://api.github.com';
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  async graphql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
    const response = await this.fetchImpl(`${this.apiUrl}/graphql`, {
      method: 'POST',
      headers: {
        'Authorization': `bearer ${this.token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'kanban-cli',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify({ query, variables }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `GraphQL HTTP ${response.status} ${response.statusText}: ${text.slice(0, 500)}`
      );
    }

    const body = (await response.json()) as GraphQLResponse<T>;
    if (body.errors && body.errors.length > 0) {
      const first = body.errors[0]!;
      const hint = this.hintFor(first);
      throw new GitHubGraphQLError(
        `GraphQL error: ${first.message}${hint ? ` (${hint})` : ''}`,
        body.errors
      );
    }
    if (body.data === undefined) {
      throw new Error('GraphQL response had no data and no errors');
    }
    return body.data;
  }

  async rest<T>(method: string, path: string, body?: unknown): Promise<T> {
    const response = await this.fetchImpl(`${this.apiUrl}${path}`, {
      method,
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'kanban-cli',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`REST ${method} ${path} → ${response.status}: ${text.slice(0, 500)}`);
    }
    return (await response.json()) as T;
  }

  private hintFor(err: GraphQLError): string | undefined {
    const m = err.message.toLowerCase();
    if (m.includes('resource not accessible by integration')) {
      return 'token likely lacks Projects v2 access — use a PAT or GitHub App with Projects: Read/Write';
    }
    if (m.includes('could not resolve to a node')) {
      return 'check that the project / issue / login exists and the token can see it';
    }
    if (m.includes('rate limit')) {
      return 'GitHub API rate limit hit; wait or use a different token';
    }
    return undefined;
  }
}

export function requireToken(): string {
  const t = process.env['GH_TOKEN'] ?? process.env['GITHUB_TOKEN'];
  if (!t) {
    process.stderr.write(
      'kanban: GH_TOKEN (or GITHUB_TOKEN) is required. Note: GITHUB_TOKEN does not have Projects v2 access — use a PAT.\n'
    );
    process.exit(2);
  }
  return t;
}

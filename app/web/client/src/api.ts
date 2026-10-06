interface RequestOptions {
  method?: 'POST' | 'PUT' | 'PATCH';
  body?: unknown;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

function errorDetail(payload: unknown): string | undefined {
  if (!isRecord(payload)) return undefined;
  const { detail } = payload;
  if (typeof detail === 'string') return detail;
  if (isRecord(detail) && typeof detail.message === 'string') return detail.message;
  return undefined;
}

async function request(path: string, { method, body }: RequestOptions): Promise<Response> {
  const response = await fetch(path, {
    method: method ?? 'GET',
    headers: { 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.ok) {
    const payload: unknown = await response.json().catch(() => ({}));
    throw new Error(errorDetail(payload) || 'Не удалось выполнить запрос');
  }
  return response;
}

/** Sends a request and returns its JSON body, typed by the caller after the FastAPI handler it calls. */
export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const response = await request(path, options);
  return (await response.json()) as T;
}

/** Sends a request whose response has no body (204). */
export async function send(path: string, options: RequestOptions = {}): Promise<void> {
  await request(path, options);
}

export const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

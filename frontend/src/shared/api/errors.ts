import type { components } from './generated/schema';

export type ApiProblem = components['schemas']['Error'];

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId: string | null;
  readonly details: ApiProblem['details'];

  constructor(status: number, problem?: ApiProblem) {
    super(problem?.message ?? `Запрос завершился с кодом ${status}`);
    this.name = 'ApiError';
    this.status = status;
    this.code = problem?.code ?? 'unknown_error';
    this.requestId = problem?.requestId ?? null;
    this.details = problem?.details ?? [];
  }
}

type ApiResult<T> = { data?: T; error?: unknown; response: Response };

function toProblem(error: unknown): ApiProblem | undefined {
  if (error && typeof error === 'object' && 'code' in error && 'message' in error) return error as ApiProblem;
  return undefined;
}

export function requireData<T>(result: ApiResult<T>): T {
  if (!result.response.ok) throw new ApiError(result.response.status, toProblem(result.error));
  if (result.data === undefined) throw new ApiError(result.response.status, undefined);
  return result.data;
}

export function requireOk(result: ApiResult<unknown>): void {
  if (!result.response.ok) throw new ApiError(result.response.status, toProblem(result.error));
}

export function isApiError(error: unknown, status?: number): error is ApiError {
  return error instanceof ApiError && (status === undefined || error.status === status);
}

export type ErrorDescription = { title: string; message: string; requestId: string | null };

export function describeError(error: unknown): ErrorDescription {
  if (!(error instanceof ApiError)) {
    return {
      title: 'Нет связи с сервером',
      message: 'Проверьте подключение к сети и повторите попытку.',
      requestId: null,
    };
  }
  const requestId = error.requestId;
  if (error.status === 401)
    return { title: 'Сессия завершена', message: 'Войдите снова, чтобы продолжить.', requestId };
  if (error.status === 403) return { title: 'Действие недоступно', message: error.message, requestId };
  if (error.status === 404) {
    return { title: 'Не найдено', message: 'Запись недоступна вашему аккаунту или была удалена.', requestId };
  }
  if (error.status >= 500) {
    return {
      title: 'Сервис временно недоступен',
      message: error.status === 503 ? error.message : 'Сервер не смог выполнить запрос. Повторите попытку позже.',
      requestId,
    };
  }
  return { title: 'Не удалось выполнить действие', message: error.message, requestId };
}

/** Maps contract validation details (`/field/path`) to the first message per top-level field. */
export function fieldErrors(error: unknown): Record<string, string> {
  if (!(error instanceof ApiError)) return {};
  const result: Record<string, string> = {};
  for (const detail of error.details) {
    const field = detail.path.split('/').filter(Boolean)[0];
    if (field && !result[field]) result[field] = detail.message;
  }
  return result;
}

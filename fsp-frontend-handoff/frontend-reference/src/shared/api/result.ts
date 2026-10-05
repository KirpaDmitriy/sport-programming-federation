import type { components } from './generated/schema';

type ApiProblem = components['schemas']['Error'];

export class ApiResponseError extends Error {
  readonly status: number;
  readonly problem: ApiProblem | undefined;

  constructor(status: number, problem?: ApiProblem) {
    super(problem?.message ?? `API request failed with status ${status}.`);
    this.name = 'ApiResponseError';
    this.status = status;
    this.problem = problem;
  }
}

export function requireData<T>(result: {
  data?: T;
  error?: ApiProblem;
  response: Response;
}): T {
  if (!result.response.ok) {
    throw new ApiResponseError(result.response.status, result.error);
  }
  if (result.data === undefined) {
    throw new Error('The API returned no data for a required response.');
  }
  return result.data;
}

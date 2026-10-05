import { describe, expect, it } from 'vitest';
import { ApiError, describeError, fieldErrors, requireData, requireOk } from './errors';

const response = (status: number) => new Response(null, { status });

describe('API error normalization', () => {
  it('keeps the contract error envelope on failure', () => {
    const problem = {
      code: 'salary_range_invalid',
      message: 'Минимум больше максимума',
      requestId: 'req-1',
      details: [],
    };
    expect(() => requireData({ error: problem, response: response(422) })).toThrow(ApiError);
    try {
      requireData({ error: problem, response: response(422) });
    } catch (error) {
      expect(error).toMatchObject({ status: 422, code: 'salary_range_invalid', requestId: 'req-1' });
    }
  });

  it('treats a non-JSON error body as an unknown API error instead of success', () => {
    expect(() => requireOk({ error: '<html>Bad gateway</html>', response: response(502) })).toThrow(ApiError);
  });

  it('rejects a successful status without the required body', () => {
    expect(() => requireData({ response: response(200) })).toThrow(ApiError);
  });

  it('describes transport, authorization and service failures for people', () => {
    expect(describeError(new TypeError('fetch failed')).title).toBe('Нет связи с сервером');
    expect(describeError(new ApiError(401)).title).toBe('Сессия завершена');
    expect(describeError(new ApiError(404)).title).toBe('Не найдено');
    const unavailable = describeError(
      new ApiError(503, {
        code: 'fixture_search_unavailable',
        message: 'Повторите запрос',
        requestId: 'r',
        details: [],
      }),
    );
    expect(unavailable).toMatchObject({
      title: 'Сервис временно недоступен',
      message: 'Повторите запрос',
      requestId: 'r',
    });
  });

  it('maps validation details to top-level form fields', () => {
    const error = new ApiError(400, {
      code: 'validation_error',
      message: 'Запрос не соответствует контракту',
      requestId: 'r',
      details: [
        { path: '/salary/from', message: 'must be >= 1' },
        { path: '/name', message: 'must NOT have fewer than 1 characters' },
      ],
    });
    expect(fieldErrors(error)).toEqual({ salary: 'must be >= 1', name: 'must NOT have fewer than 1 characters' });
    expect(fieldErrors(new Error('x'))).toEqual({});
  });
});

import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { ApiError, MockDomain, handledOperations } from './domain.mjs';
import { routes } from './contract.mjs';
import { parameterValidators, validationDetails, validators } from './validation.mjs';
import { profilePdf } from './pdf.mjs';

const COOKIE = 'fsp_mock_session';
const MAX_PDF = 2 * 1024 * 1024;
const MAX_JSON = 512 * 1024;
const isLoopback = (address) => address === '127.0.0.1' || address === '::1' || address?.startsWith('::ffff:127.');
const stableJson = (value) => JSON.stringify(value, (_, item) => item && !Array.isArray(item) && typeof item === 'object' ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);
const matchers = routes.map((route) => ({ route, keys: [...route.path.matchAll(/\{([^}]+)\}/g)].map((match) => match[1]), regex: new RegExp(`^${route.path.replace(/\{[^}]+\}/g, '([^/]+)')}/?$`) }));
for (const route of routes) if (!handledOperations.includes(route.operationId)) throw new Error(`No handler for ${route.operationId}`);

async function readBody(request, limit) {
  const chunks = []; let length = 0;
  for await (const chunk of request) {
    length += chunk.length;
    if (length > limit) throw new ApiError(413, 'body_too_large', 'Файл или запрос превышает допустимый размер');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
function parseCookie(header) {
  return (header ?? '').split(';').map((part) => part.trim().split('=')).find(([key]) => key === COOKIE)?.[1];
}
function ensure(validator, value) {
  if (!validator(value)) throw new ApiError(400, 'validation_error', 'Запрос не соответствует контракту', validationDetails(validator));
}
async function parseMultipart(request) {
  const raw = await readBody(request, MAX_PDF + 16384);
  let form;
  try { form = await new Request('http://localhost/import', { method: 'POST', headers: { 'content-type': request.headers['content-type'] }, body: raw }).formData(); }
  catch { throw new ApiError(400, 'invalid_multipart', 'Не удалось прочитать форму загрузки'); }
  const entries = [...form.entries()];
  if (entries.length !== 1 || entries[0][0] !== 'file' || typeof entries[0][1] === 'string') throw new ApiError(400, 'file_required', 'Передайте один PDF в поле file');
  const file = entries[0][1];
  if (file.type !== 'application/pdf') throw new ApiError(415, 'pdf_required', 'Поддерживаются только PDF');
  if (!file.size || file.size > MAX_PDF) throw new ApiError(413, 'file_too_large', 'Размер PDF должен быть от 1 байта до 2 МиБ');
  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.subarray(0, 5).toString('ascii') !== '%PDF-' || !bytes.subarray(-2048).includes(Buffer.from('%%EOF'))) throw new ApiError(422, 'invalid_pdf', 'Файл не содержит ожидаемую сигнатуру PDF');
  return { file: { size: file.size } };
}

export function createMockServer({ port = 4010, host = '127.0.0.1', scenario = 'baseline', gradeChangeCooldownDays = 90, allowedOrigins = ['http://localhost:5173', 'http://127.0.0.1:5173'] } = {}) {
  if (!['127.0.0.1', '::1', 'localhost'].includes(host)) throw new Error('The mock server may bind only to loopback');
  const domain = new MockDomain({ scenario, gradeChangeCooldownDays });
  const server = createServer(async (request, response) => {
    const requestId = randomUUID();
    response.setHeader('X-Request-Id', requestId);
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    const sendJson = (status, data) => { response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); response.end(JSON.stringify(data)); };
    try {
      let url;
      try { url = new URL(request.url, 'http://localhost'); } catch { throw new ApiError(400, 'invalid_url', 'Некорректный URL'); }
      const found = matchers.find(({ route, regex }) => route.method === request.method.toLowerCase() && regex.test(url.pathname));
      if (!found) throw new ApiError(404, 'not_found', 'Маршрут не найден');
      const { route, regex, keys } = found;
      if (route.dev && !isLoopback(request.socket.remoteAddress)) throw new ApiError(403, 'development_only', 'Маршрут доступен только локально');
      const hostHeader = request.headers.host ?? '';
      if (!/^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(hostHeader)) throw new ApiError(403, 'host_not_allowed', 'Мок-сервер принимает только локальные запросы');
      const origin = request.headers.origin;
      if (origin && ![...allowedOrigins, `http://${hostHeader}`].includes(origin)) throw new ApiError(403, 'origin_not_allowed', 'Этот источник запроса не разрешён');
      const token = parseCookie(request.headers.cookie);
      const actorId = token ? domain.state.sessions.get(token) : null;
      const actor = actorId ? domain.state.actors.get(actorId) : null;
      if (route.auth !== 'none' && !actor) throw new ApiError(401, 'unauthenticated', 'Войдите в аккаунт');
      if (!['none', 'any'].includes(route.auth) && actor.role !== route.auth) throw new ApiError(403, 'role_forbidden', 'Действие недоступно для этой роли');
      let params;
      try { const parts = regex.exec(url.pathname).slice(1); params = Object.fromEntries(keys.map((key, index) => [key, decodeURIComponent(parts[index])])); }
      catch { throw new ApiError(400, 'invalid_path', 'Некорректный путь'); }
      const query = {};
      for (const [key, value] of url.searchParams) {
        if (Object.hasOwn(query, key)) throw new ApiError(400, 'duplicate_query_parameter', 'Параметр запроса нельзя повторять');
        query[key] = ['page', 'pageSize'].includes(key) && /^\d+$/.test(value) ? Number(value) : value;
      }
      const headerInput = route.idempotent ? { ...(request.headers['idempotency-key'] ? { 'Idempotency-Key': request.headers['idempotency-key'] } : {}) } : {};
      ensure(parameterValidators.get(`${route.operationId}:path`), params);
      ensure(parameterValidators.get(`${route.operationId}:query`), query);
      ensure(parameterValidators.get(`${route.operationId}:header`), headerInput);
      let body;
      if (route.multipart) {
        if (!request.headers['content-type']?.startsWith('multipart/form-data;')) throw new ApiError(415, 'multipart_required', 'Ожидается multipart/form-data');
        body = await parseMultipart(request);
      } else if (route.body) {
        if (request.headers['content-type']?.split(';')[0] !== 'application/json') throw new ApiError(415, 'json_required', 'Ожидается application/json');
        const raw = await readBody(request, MAX_JSON);
        try { body = JSON.parse(raw.toString('utf8')); } catch { throw new ApiError(400, 'invalid_json', 'Некорректный JSON'); }
        ensure(validators[route.body], body);
      } else {
        const raw = await readBody(request, MAX_JSON);
        if (raw.length) throw new ApiError(400, 'body_not_allowed', 'Этот маршрут не принимает тело запроса');
      }
      const idempotencyKey = route.idempotent ? `${actor.id}:${route.operationId}:${url.pathname}:${request.headers['idempotency-key']}` : null;
      const fingerprint = stableJson(body ?? null);
      if (idempotencyKey && domain.state.idempotency.has(idempotencyKey)) {
        const stored = domain.state.idempotency.get(idempotencyKey);
        if (stored.fingerprint !== fingerprint) throw new ApiError(409, 'idempotency_conflict', 'Ключ уже использован с другим запросом');
        response.setHeader('X-Idempotent-Replay', 'true'); sendJson(stored.status, stored.body); return;
      }
      const data = domain.handle(route.operationId, { actor, body, params, query });
      if (['verifyEmail', 'mockSelectSession'].includes(route.operationId)) {
        const sessionToken = randomUUID(); domain.state.sessions.set(sessionToken, data.actorId);
        response.setHeader('Set-Cookie', `${COOKIE}=${sessionToken}; HttpOnly; SameSite=Lax; Path=/`);
      }
      if (route.operationId === 'logout') {
        if (token) domain.state.sessions.delete(token);
        response.setHeader('Set-Cookie', `${COOKIE}=; Max-Age=0; HttpOnly; SameSite=Lax; Path=/`);
      }
      if (route.pdf) {
        const bytes = await profilePdf(data.pdfProfile);
        response.writeHead(200, { 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="fsp-profile.pdf"', 'Content-Length': bytes.length }); response.end(bytes); return;
      }
      const status = route.status ?? 200;
      if (status === 204) { response.writeHead(status); response.end(); return; }
      if (!validators[route.response](data)) throw new ApiError(500, 'response_contract_error', 'Ответ сервера не соответствует контракту', validationDetails(validators[route.response]));
      const snapshot = structuredClone(data);
      if (idempotencyKey) domain.state.idempotency.set(idempotencyKey, { fingerprint, status, body: snapshot });
      sendJson(status, snapshot);
    } catch (error) {
      const known = error instanceof ApiError;
      const payload = { code: known ? error.code : 'internal_error', message: known ? error.message : 'Ошибка мок-сервера', requestId, details: known ? error.details : [] };
      if (!known) console.error(error);
      if (!response.headersSent) sendJson(known ? error.status : 500, payload);
      else response.end();
    }
  });
  return {
    server, domain,
    async listen() { await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, host, resolve); }); return `http://${host === '::1' ? '[::1]' : host}:${server.address().port}`; },
    async close() { domain.close(); server.closeIdleConnections(); await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); },
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const app = createMockServer({ port: Number(process.env.PORT ?? 4010), host: process.env.HOST ?? '127.0.0.1', scenario: process.env.FSP_MOCK_SCENARIO ?? 'baseline', gradeChangeCooldownDays: Number(process.env.FSP_GRADE_CHANGE_COOLDOWN_DAYS ?? 90) });
  const url = await app.listen();
  console.log(`FSP mock API 0.1.0: ${url} (synthetic data only)`);
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => app.close().then(() => process.exit(0)));
}

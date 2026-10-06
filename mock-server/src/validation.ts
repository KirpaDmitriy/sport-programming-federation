import Ajv2020, { type ValidateFunction } from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { buildOpenApi, routeTable, type SchemaName, schemas } from './contract.ts';

const ajv = new Ajv2020({ strict: true, allErrors: true, validateFormats: true });
addFormats(ajv);
const schemaId = 'https://fsp.example/contracts/0.1.0';
const definitions = JSON.parse(JSON.stringify(schemas).replaceAll('#/components/schemas/', '#/$defs/'));
ajv.addSchema({ $id: schemaId, $schema: 'https://json-schema.org/draft/2020-12/schema', $defs: definitions });

function schemaValidator(name: string): ValidateFunction {
  const validator = ajv.getSchema(`${schemaId}#/$defs/${name}`);
  if (!validator) throw new Error(`Missing schema ${name}`);
  return validator;
}

export const validators = Object.fromEntries(
  Object.keys(schemas).map((name) => [name, schemaValidator(name)]),
) as Record<SchemaName, ValidateFunction>;

export const parameterValidators = new Map<string, ValidateFunction>();
const spec = buildOpenApi();
for (const route of routeTable) {
  const operation = spec.paths[route.path]?.[route.method];
  for (const location of ['query', 'path', 'header'] as const) {
    const parameters = (operation?.parameters ?? []).filter((parameter) => parameter.in === location);
    parameterValidators.set(
      `${route.operationId}:${location}`,
      ajv.compile({
        type: 'object',
        additionalProperties: false,
        properties: Object.fromEntries(parameters.map((parameter) => [parameter.name, parameter.schema])),
        required: parameters.filter((parameter) => parameter.required).map((parameter) => parameter.name),
      }),
    );
  }
}

export const validationDetails = (validator: ValidateFunction) =>
  (validator.errors ?? []).map((error) => ({
    path: error.instancePath || '/',
    message: error.message ?? 'Invalid value',
  }));

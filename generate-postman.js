#!/usr/bin/env node
/**
 * 從 openapi.json 產生 Postman Collection v2.1
 * 用法：npm run postman（會先跑 openapi 產生器）
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname);
const openapiPath = path.join(root, 'openapi.json');
const outPath = path.join(root, 'postman', 'collection.json');

if (!fs.existsSync(openapiPath)) {
  console.error('找不到 openapi.json，請先執行 npm run openapi');
  process.exit(1);
}

const openapi = JSON.parse(fs.readFileSync(openapiPath, 'utf8'));

const collection = {
  info: {
    name: openapi.info?.title || 'E-Commerce Demo API',
    description: openapi.info?.description || '',
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
    _postman_id: 'flower-shop-api-collection',
  },
  variable: [
    { key: 'baseUrl', value: 'http://localhost:3001', type: 'string' },
    { key: 'token', value: '', type: 'string' },
    { key: 'sessionId', value: '', type: 'string' },
  ],
  auth: {
    type: 'bearer',
    bearer: [{ key: 'token', value: '{{token}}', type: 'string' }],
  },
  item: [],
};

const folders = new Map();

function ensureFolder(name) {
  if (!folders.has(name)) {
    const folder = { name, item: [] };
    folders.set(name, folder);
    collection.item.push(folder);
  }
  return folders.get(name);
}

function pathToPostman(openapiPath) {
  return openapiPath.replace(/\{([^}]+)\}/g, ':$1');
}

function buildUrl(openapiPath, parameters = []) {
  const rawPath = pathToPostman(openapiPath);
  const pathSegments = rawPath.replace(/^\//, '').split('/').filter(Boolean);
  const query = (parameters || [])
    .filter((p) => p.in === 'query')
    .map((p) => ({
      key: p.name,
      value: p.schema?.default != null ? String(p.schema.default) : '',
      description: p.description || p.schema?.description || '',
      disabled: !p.required,
    }));

  return {
    raw: `{{baseUrl}}${rawPath}${query.length ? '?' + query.map((q) => `${q.key}=${q.value}`).join('&') : ''}`,
    host: ['{{baseUrl}}'],
    path: pathSegments,
    variable: (parameters || [])
      .filter((p) => p.in === 'path')
      .map((p) => ({ key: p.name, value: '' })),
    query,
  };
}

function buildBody(requestBody) {
  if (!requestBody?.content?.['application/json']) return undefined;
  const schema = requestBody.content['application/json'].schema || {};
  const example = {};
  const props = schema.properties || {};
  for (const [key, prop] of Object.entries(props)) {
    if (prop.example !== undefined) {
      example[key] = prop.example;
    } else if (prop.enum) {
      example[key] = prop.enum[0];
    } else if (prop.type === 'boolean') {
      example[key] = false;
    } else if (prop.type === 'integer' || prop.type === 'number') {
      example[key] = 0;
    } else if (prop.type === 'array') {
      example[key] = [];
    } else {
      example[key] = '';
    }
  }
  return {
    mode: 'raw',
    raw: JSON.stringify(example, null, 2),
    options: { raw: { language: 'json' } },
  };
}

function needsAuth(operation) {
  if (operation.security === undefined) {
    return Boolean(openapi.security?.length);
  }
  if (Array.isArray(operation.security) && operation.security.length === 0) {
    return false;
  }
  return operation.security.some((s) => s.bearerAuth !== undefined);
}

function loginTestScript() {
  return {
    listen: 'test',
    script: {
      type: 'text/javascript',
      exec: [
        'if (pm.response.code === 200 || pm.response.code === 201) {',
        '  try {',
        '    const json = pm.response.json();',
        '    if (json && json.data && json.data.token) {',
        '      pm.collectionVariables.set("token", json.data.token);',
        '    }',
        '  } catch (e) {}',
        '}',
      ],
    },
  };
}

const paths = openapi.paths || {};
for (const [openapiPath, methods] of Object.entries(paths)) {
  for (const [method, operation] of Object.entries(methods)) {
    if (!['get', 'post', 'put', 'patch', 'delete'].includes(method)) continue;

    const tag = (operation.tags && operation.tags[0]) || 'Default';
    const folder = ensureFolder(tag);
    const name = operation.summary || `${method.toUpperCase()} ${openapiPath}`;
    const parameters = [
      ...(operation.parameters || []),
      ...(methods.parameters || []),
    ];

    const item = {
      name,
      request: {
        method: method.toUpperCase(),
        header: [
          { key: 'Content-Type', value: 'application/json' },
          { key: 'X-Session-Id', value: '{{sessionId}}', disabled: true },
        ],
        url: buildUrl(openapiPath, parameters),
        description: operation.description || '',
      },
      response: [],
    };

    if (needsAuth(operation)) {
      item.request.auth = {
        type: 'bearer',
        bearer: [{ key: 'token', value: '{{token}}', type: 'string' }],
      };
    } else {
      item.request.auth = { type: 'noauth' };
    }

    const body = buildBody(operation.requestBody);
    if (body && ['POST', 'PUT', 'PATCH'].includes(item.request.method)) {
      item.request.body = body;
    }

    // 登入／註冊成功後寫入 token
    if (
      openapiPath === '/api/auth/login' ||
      openapiPath === '/api/auth/register'
    ) {
      item.event = [loginTestScript()];
    }

    folder.item.push(item);
  }
}

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(collection, null, 2));
JSON.parse(fs.readFileSync(outPath, 'utf8')); // 驗證有效 JSON
console.log(`Postman collection written to ${path.relative(root, outPath)}`);

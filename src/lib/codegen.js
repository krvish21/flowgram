/**
 * Scaffold a codebase from the flow diagram.
 *
 * Every node maps to one layer of the generated app:
 *   controller → an AWS Lambda handler in src/handlers/
 *   service    → a service function in src/services/
 *   data       → a repository in src/repositories/
 *   model      → a TypeScript interface in src/models/
 *   interface  → a contract interface in src/interfaces/
 *   external   → an API client in src/external/
 *   decision   → becomes an inline `if` in the calling function
 *   note       → becomes a comment in the calling function
 *
 * Controllers are the entry points: each one is wired up as a Lambda in
 * serverless.yml and calls the nodes hanging off it (a `service`, which
 * in turn calls the nodes hanging off it, and so on).
 */

const FOLDER = {
  controller: 'handlers',
  service: 'services',
  data: 'repositories',
  model: 'models',
  interface: 'interfaces',
  external: 'external',
};

const RUNTIME_MAP = {
  'Node 18': 'nodejs18.x',
  'Node 20': 'nodejs20.x',
  'Node 22': 'nodejs22.x',
  'Python 3.12': 'python3.12',
  Go: 'provided.al2',
  '.NET 8': 'dotnet8',
};

const CODE_TYPES = Object.keys(FOLDER);

const isJsExpr = (s) => {
  try {
    new Function(`return (${s});`);
    return true;
  } catch {
    return false;
  }
};

const singleLine = (s = '') => s.replace(/\s+/g, ' ').trim();

const toWords = (s = '') =>
  String(s)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .trim();

function toPascal(s, fallback = 'Resource') {
  const w = toWords(s);
  if (!w) return fallback;
  return w
    .split(/\s+/)
    .map((p) => p[0].toUpperCase() + p.slice(1))
    .join('');
}

function toCamel(s, fallback = 'resource') {
  const p = toPascal(s, fallback);
  return p ? p[0].toLowerCase() + p.slice(1) : fallback;
}

function toKebab(s, fallback = 'resource') {
  const w = toWords(s).toLowerCase();
  return w ? w.split(/\s+/).join('-') : fallback;
}

/** Line-based argument lists like `id: string — user id` map to members. */
function argsToLines(text) {
  const out = [];
  for (const raw of String(text || '').split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(/^([A-Za-z_$][\w$]*)(\??)\s*:\s*(\S+?)(?:\s*—.*)?$/);
    if (m) out.push({ key: m[1], optional: m[2], type: m[3] });
  }
  return out;
}

const jsKey = (k) => (/^[A-Za-z_$][\w$]*$/.test(k) ? k : `'${k}'`);

function tsType(v, pad = '') {
  if (v === null || v === undefined) return 'unknown';
  if (Array.isArray(v)) return `${tsType(v[0], pad)}[]`;
  switch (typeof v) {
    case 'string':
      return 'string';
    case 'number':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'object': {
      const entries = Object.entries(v);
      if (!entries.length) return 'Record<string, unknown>';
      const body = entries
        .map(([k, val]) => `${pad}  ${jsKey(k)}?: ${tsType(val, pad + '  ')}`)
        .join('\n');
      return `{\n${body}\n${pad}}`;
    }
    default:
      return 'unknown';
  }
}

/** Members for a model / interface, from a JSON schema or an arg list. */
function schemaToMembers(text) {
  const out = [];
  if (text && text.trim()) {
    try {
      const v = JSON.parse(text);
      if (Array.isArray(v)) {
        return [`  [index: number]: ${tsType(v[0])};`];
      }
      if (v && typeof v === 'object') {
        for (const [k, val] of Object.entries(v)) {
          out.push(`  ${jsKey(k)}: ${tsType(val, '  ')};`);
        }
        if (out.length) return out;
      }
    } catch {
      /* fall through to the args-parser below */
    }
  }
  const parsed = argsToLines(text);
  if (parsed.length) {
    return parsed.map((a) => `  ${a.key}${a.optional}: ${a.type};`);
  }
  return null;
}

const noteLines = (node) =>
  (node.notes || '')
    .split('\n')
    .filter(Boolean)
    .map(singleLine);

function docHead(title, extra = []) {
  return ['/**', ` * ${title || 'Implementation'}`, ...extra.map((l) => ` * ${l}`), ' */'];
}

/** Join imports (when present) to the body with one blank separator line. */
function withImports(imports, body) {
  return imports.length ? [...imports, '', ...body] : [...body];
}

/* ------------------------------------------------------------------ *
 * return-type inference — lets a function use the models created      *
 * ------------------------------------------------------------------ */

/** Characters a hand-written TypeScript type may reasonably contain. */
const TYPE_OK = /^[A-Za-z0-9_$.[\]<>|&,?'":\s]+$/;

/** Normalize a hand-written return type to something async-compatible. */
function asAsyncType(t) {
  t = String(t || '').trim();
  if (!t) return 'unknown';
  if (!TYPE_OK.test(t)) return 'unknown';
  if (/^(Promise|PromiseLike|void|never)\b/.test(t)) return t;
  return `Promise<${t}>`;
}

/** `Promise<X>` in a "returns" field becomes just `X` — async already returns it. */
function unwrapPromise(t) {
  const m = /^Promise\s*<([\s\S]+)>\s*$/.exec(t);
  return m ? m[1] : t;
}

/** Final type used in an async signature: a single (non-doubled) Promise<T>. */
const resolvedType = (t) => unwrapPromise(asAsyncType(t));

/**
 * Work out the return type of a generated function.
 *
 * Precedence:
 *  1. the node's own `returns` field, when it names a model/interface
 *     that exists in the diagram (getUser → `Promise<getUser>`);
 *  2. the node's `returns` field as written (still respected, so a user
 *     can point at a hand-written type);
 *  3. models/interfaces connected to the node (multiple join with `&`).
 *
 * Returns `{ retType, names }` where `names` are the types to import.
 */
function resolveReturnType(node, children, typeIndex, ctx) {
  const rel = children.filter((c) => c.type === 'model' || c.type === 'interface');
  const relNames = [...new Set(rel.map((c) => ctx.exportOf.get(c.id)))];
  const text = [node.returns, node.response].filter(Boolean).join('\n');
  const mentioned = [...typeIndex.keys()].filter(
    (n) => text && new RegExp(`\\b${n}\\b`).test(text)
  );

  const raw = (node.returns || '').trim();
  if (raw && mentioned.length) return { retType: resolvedType(raw), names: mentioned };
  if (raw) return { retType: resolvedType(raw), names: [] };
  if (relNames.length) return { retType: resolvedType(relNames.join(' & ')), names: relNames };
  return { retType: null, names: [] };
}

/** `import type { X } from '../models/x'` for the given type names. */
function renderTypeImportLines(names, typeIndex) {
  const byFile = new Map();
  for (const n of names) {
    const ref = typeIndex.get(n);
    if (!ref) continue;
    const key = `${ref.folder}/${ref.base}`;
    if (!byFile.has(key)) byFile.set(key, []);
    byFile.get(key).push(n);
  }
  return [...byFile.entries()].map(
    ([key, ns]) =>
      `import type { ${[...new Set(ns)].sort().join(', ')} } from '../${key}';`
  );
}

/* ------------------------------------------------------------------ *
 * identifier reservation (numbers appended so nothing collides)       *
 * ------------------------------------------------------------------ */

function reserveNames(nodes) {
  const baseOf = new Map();
  const exportOf = new Map();
  const usedBases = new Map();
  const usedFns = new Map();
  const usedTypes = new Map();

  const takeFrom = (used, base, glue = '-') => {
    const n = used.get(base) || 0;
    used.set(base, n + 1);
    return n ? `${base}${glue}${n + 1}` : base;
  };

  for (const n of nodes) {
    if (!CODE_TYPES.includes(n.type)) continue;
    baseOf.set(n.id, takeFrom(usedBases, toKebab(n.title) || 'item'));
    if (n.type === 'controller') {
      exportOf.set(n.id, 'handler');
    } else if (n.type === 'model' || n.type === 'interface') {
      exportOf.set(n.id, takeFrom(usedTypes, toPascal(n.title), ''));
    } else {
      exportOf.set(n.id, takeFrom(usedFns, toCamel(n.title) || 'fn', ''));
    }
  }
  return { baseOf, exportOf };
}

const childrenBy = (node, ctx) => ctx.childrenMap.get(node.id) || [];

/**
 * Turn a node's children into code. Function children end up in `targets`
 * and are awaited by the caller; models/interfaces, decisions and notes
 * become comments / inline conditionals.
 */
function renderCalls(node, children, ctx, indent = '  ') {
  const lines = [];
  const targets = [];
  for (const c of children) {
    if (c.type === 'note') {
      const t = c.title ? c.title : 'note';
      lines.push(`${indent}// ${t}${c.notes ? ': ' + singleLine(c.notes) : ''}`);
    } else if (c.type === 'decision') {
      const cond = (c.condition || '').trim();
      if (cond && isJsExpr(cond)) {
        lines.push(`${indent}if (${cond}) {`);
        const inner = renderCalls(c, childrenBy(c, ctx), ctx, indent + '  ');
        lines.push(
          ...(inner.lines.length
            ? inner.lines
            : [`${indent}  // TODO: branch body for "${c.title}"`])
        );
        lines.push(`${indent}}`);
      } else {
        const hint = cond ? ` — ${singleLine(cond)}` : '';
        lines.push(`${indent}// DECISION "${c.title}"${hint}`);
        lines.push(`${indent}// TODO: implement branch "${c.title}" in code`);
      }
    } else if (c.type === 'model' || c.type === 'interface') {
      const name = ctx.exportOf.get(c.id) || c.title;
      const base = ctx.baseOf.get(c.id);
      if (!(ctx.usedTypeNames && ctx.usedTypeNames.has(name))) {
        lines.push(`${indent}// ${c.type} "${name}" defined in src/${FOLDER[c.type]}/${base}.ts`);
      }
    } else {
      targets.push(c);
    }
  }

  if (targets.length === 1) {
    lines.push(`${indent}const result = await ${ctx.exportOf.get(targets[0].id)}(input);`);
  } else if (targets.length > 1) {
    const calls = targets.map((t) => `${ctx.exportOf.get(t.id)}(input)`);
    lines.push(`${indent}const result = await Promise.all([${calls.join(', ')}]);`);
  }
  return { lines, targets };
}

/** Import lines for a node's function children, grouped per target file. */
function renderImports(node, children, ctx) {
  const byTarget = new Map();
  for (const c of children) {
    if (!CODE_TYPES.includes(c.type) || !FOLDER[c.type]) continue;
    if (c.type === 'model' || c.type === 'interface') continue;
    const key = `${FOLDER[c.type]}/${ctx.baseOf.get(c.id)}`;
    if (!byTarget.has(key)) byTarget.set(key, new Set());
    byTarget.get(key).add(ctx.exportOf.get(c.id));
  }
  return [...byTarget.entries()].map(
    ([key, names]) => `import { ${[...names].sort().join(', ')} } from '../${key}';`
  );
}

/* ------------------------------------------------------------------ *
 * file renderers                                                     *
 * ------------------------------------------------------------------ */

function renderResponseLib() {
  return [
    "import { APIGatewayProxyResult } from 'aws-lambda';",
    '',
    'export const ok = <T>(data: T, statusCode = 200): APIGatewayProxyResult => ({',
    '  statusCode,',
    "  headers: { 'Content-Type': 'application/json' },",
    '  body: JSON.stringify(data),',
    '});',
    '',
    'export const fail = (error: Error, statusCode = 500): APIGatewayProxyResult => ({',
    '  statusCode,',
    "  headers: { 'Content-Type': 'application/json' },",
    '  body: JSON.stringify({ error: error.message }),',
    '});',
    '',
  ].join('\n');
}

function renderHandler(node, ctx) {
  const method = node.method || 'GET';
  const path = node.path || '/';
  const title = node.title || ctx.baseOf.get(node.id);
  const children = childrenBy(node, ctx);
  const calls = renderCalls(node, children, ctx, '    ');
  const hasTargets = calls.targets.length > 0;

  const lines = [
    "import { APIGatewayEvent, APIGatewayProxyResult } from 'aws-lambda';",
    "import { ok, fail } from '../lib/response';",
    ...renderImports(node, children, ctx),
    '',
    ...docHead(`${method} ${path} — ${title}`, noteLines(node)),
    'export async function handler(event: APIGatewayEvent): Promise<APIGatewayProxyResult> {',
    '  try {',
    '    const input = {',
    '      params: event.pathParameters ?? {},',
    '      query: event.queryStringParameters ?? {},',
    '      body: event.body ? JSON.parse(event.body) : undefined,',
    '    };',
    ...calls.lines,
    hasTargets ? '    return ok(result);' : `    return ok({ message: '${method} ${path}' });`,
    '  } catch (err) {',
    '    return fail(err as Error);',
    '  }',
    '}',
    '',
  ];
  return lines.join('\n');
}

function renderService(node, ctx) {
  const name = ctx.exportOf.get(node.id);
  const children = childrenBy(node, ctx);
  const calls = renderCalls(node, children, ctx);
  const hasTargets = calls.targets.length > 0;
  const { retType, names } = resolveReturnType(node, children, ctx.typeIndex, ctx);
  const closable = retType ? `as unknown as ${retType}` : null;

  return withImports(
    [...renderImports(node, children, ctx), ...renderTypeImportLines(names, ctx.typeIndex)],
    [
      ...docHead(node.title || name, noteLines(node)),
      `export async function ${name}(input: unknown): Promise<${retType || 'unknown'}> {`,
      ...calls.lines,
      hasTargets
        ? `  return ${closable ? `result ${closable}` : 'result'};`
        : `  return ${closable ? `null ${closable}` : 'null'}; // TODO: implement ${name}`,
      '}',
      '',
    ]
  ).join('\n');
}

function renderData(node, ctx) {
  const name = ctx.exportOf.get(node.id);
  const engine = node.engine || 'datastore';
  const children = childrenBy(node, ctx);
  const calls = renderCalls(node, children, ctx);
  const hasTargets = calls.targets.length > 0;
  const schema = node.schema ? singleLine(node.schema).slice(0, 80) : '';
  const { retType, names } = resolveReturnType(node, children, ctx.typeIndex, ctx);
  const closable = retType ? `as unknown as ${retType}` : null;

  return withImports(
    [...renderImports(node, children, ctx), ...renderTypeImportLines(names, ctx.typeIndex)],
    [
      ...docHead(`${node.title || name} — ${engine}`, noteLines(node)),
      `export async function ${name}(input: unknown): Promise<${retType || 'unknown'}> {`,
      `  // TODO: implement the ${engine} query`,
      ...(schema ? [`  // schema: ${schema}`] : []),
      ...calls.lines,
      hasTargets
        ? `  return ${closable ? `result ${closable}` : 'result'};`
        : `  return ${closable ? `null ${closable}` : 'null'};`,
      '}',
      '',
    ]
  ).join('\n');
}

function renderModel(node, ctx, interfaceMode) {
  const name = ctx.exportOf.get(node.id);
  const members = schemaToMembers(node.schema);
  return [
    ...docHead(node.title || name, [
      ...noteLines(node),
      ...(interfaceMode ? ['Contract used at the HTTP boundary.'] : []),
    ]),
    `export interface ${name} {`,
    ...(members ?? ['  // TODO: define members']),
    '}',
    '',
  ].join('\n');
}

function renderExternal(node, ctx) {
  const name = ctx.exportOf.get(node.id);
  const baseUrl = (node.baseUrl || '').replace(/['"`]/g, '');
  const auth = node.auth || 'None';
  const children = childrenBy(node, ctx);
  const { retType, names } = resolveReturnType(node, children, ctx.typeIndex, ctx);

  const authHeaders = {
    None: ['      // no auth configured'],
    Bearer: ["      Authorization: 'Bearer <token>',"],
    'API key': ["      'X-Api-Key': '<api-key>',"],
    Basic: ["      Authorization: 'Basic <token>',"],
    OAuth2: ["      Authorization: 'Bearer <access-token>', // OAuth2"],
    mTLS: ['      // mTLS identity is pinned at the infrastructure layer'],
  };
  const headers = authHeaders[auth] || authHeaders.OAuth2;

  return withImports(renderTypeImportLines(names, ctx.typeIndex), [
    ...docHead(`${node.title || name} (${baseUrl || 'external API'})`, noteLines(node)),
    `const BASE_URL = '${baseUrl}';`,
    '',
    `export async function ${name}(path = '', init?: RequestInit): Promise<${retType || 'unknown'}> {`,
    '  const res = await fetch(`${BASE_URL}${path}`, {',
    '    ...init,',
    '    headers: {',
    '      ...(init?.headers ?? {}),',
    ...headers,
    '    },',
    '  });',
    `  if (!res.ok) throw new Error('${baseUrl || 'External API'} responded with ' + res.status);`,
    retType ? `  return res.json() as unknown as ${retType};` : '  return res.json();',
    '}',
    '',
  ]).join('\n');
}

/* ------------------------------------------------------------------ *
 * entry point                                                        *
 * ------------------------------------------------------------------ */

export function generateCodebase(doc) {
  const nodes = (doc.nodes || []).slice();
  const edges = doc.edges || [];

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const childrenMap = new Map();
  for (const e of edges) {
    const child = byId.get(e.to);
    if (!child) continue;
    if (!childrenMap.has(e.from)) childrenMap.set(e.from, []);
    childrenMap.get(e.from).push(child);
  }
  for (const list of childrenMap.values()) list.sort((a, b) => (a.id < b.id ? -1 : 1));

  const ctx = reserveNames(nodes);
  ctx.childrenMap = childrenMap;

  // index every model / interface by its exported name so return-type
  // inference can reference & import them from anywhere in the diagram
  ctx.typeIndex = new Map();
  for (const n of nodes) {
    if (n.type === 'model' || n.type === 'interface') {
      ctx.typeIndex.set(ctx.exportOf.get(n.id), {
        folder: FOLDER[n.type],
        base: ctx.baseOf.get(n.id),
      });
    }
  }

  // models referenced by a generate-able signature stop being just a
  // comment in the calling function — they become its return type
  ctx.usedTypeNames = new Set();
  for (const n of nodes) {
    if (n.type === 'model' || n.type === 'interface') continue;
    const { names } = resolveReturnType(n, childrenMap.get(n.id) || [], ctx.typeIndex, ctx);
    for (const name of names) ctx.usedTypeNames.add(name);
  }

  const groups = { controller: [], service: [], data: [], model: [], interface: [], external: [] };
  for (const n of nodes) if (groups[n.type]) groups[n.type].push(n);

  const files = {};
  const add = (name, content) => {
    files[name] = content;
  };

  const project = 'flowgram-api';

  add(
    'package.json',
    JSON.stringify(
      {
        name: project,
        version: '1.0.0',
        private: true,
        description: 'Scaffolded from a Flowgram API flow diagram.',
        scripts: {
          build: 'tsc -p tsconfig.json',
          typecheck: 'tsc --noEmit',
        },
        dependencies: {},
        devDependencies: {
          '@types/aws-lambda': '^8.10.130',
          '@types/node': '^20.11.0',
          typescript: '^5.4.0',
        },
      },
      null,
      2
    ) + '\n'
  );

  add(
    'tsconfig.json',
    JSON.stringify(
      {
        compilerOptions: {
          target: 'ES2022',
          module: 'CommonJS',
          moduleResolution: 'node',
          rootDir: 'src',
          outDir: 'dist',
          strict: true,
          esModuleInterop: true,
          skipLibCheck: true,
          resolveJsonModule: true,
        },
        include: ['src'],
      },
      null,
      2
    ) + '\n'
  );

  add('.gitignore', 'node_modules/\ndist/\n.env\n');

  const runtime = RUNTIME_MAP[groups.controller[0]?.runtime] || 'nodejs20.x';

  if (groups.controller.length) {
    const fns = groups.controller
      .map((n) => {
        const base = ctx.baseOf.get(n.id);
        const method = (n.method || 'GET').toLowerCase();
        const path = (n.path || '/').replace(/:([A-Za-z_][\w]*)/g, '{$1}');
        return [
          `  ${base}:`,
          `    handler: src/handlers/${base}.handler`,
          '    events:',
          '      - httpApi:',
          `          method: ${method}`,
          `          path: ${path}`,
        ].join('\n');
      })
      .join('\n');
    add(
      'serverless.yml',
      `service: ${project}\n\nprovider:\n  name: aws\n  runtime: ${runtime}\n\nfunctions:\n${fns}\n`
    );
  }

  add('src/lib/response.ts', renderResponseLib());

  const readme = [
    `# ${project}`,
    '',
    'Generated from a Flowgram API flow diagram.',
    '',
    '## Architecture',
    '',
    `- **Handlers** (AWS Lambda) — ${groups.controller.length}`,
    `- **Services** — ${groups.service.length}`,
    `- **Repositories** — ${groups.data.length}`,
    `- **Models** — ${groups.model.length}`,
    `- **Interfaces** — ${groups.interface.length}`,
    `- **External APIs** — ${groups.external.length}`,
  ];

  if (groups.controller.length) {
    readme.push('', '## Flows');
    for (const c of groups.controller) {
      const parts = [];
      const visited = new Set([c.id]);
      const walk = (node) => {
        for (const child of childrenMap.get(node.id) || []) {
          if (visited.has(child.id)) continue;
          visited.add(child.id);
          if (child.type === 'decision') {
            parts.push(`if(${child.condition || '?'})`);
          } else if (
            child.type !== 'note' &&
            child.type !== 'model' &&
            child.type !== 'interface'
          ) {
            parts.push(child.title || ctx.exportOf.get(child.id));
          }
          walk(child);
        }
      };
      walk(c);
      const label = parts.length ? parts.join(' → ') : '(no downstream steps)';
      readme.push(`- \`${c.method || 'GET'} ${c.path || '/'}\` → ${label}`);
    }
  }

  readme.push(
    '',
    '## Getting started',
    '',
    '```bash',
    'npm install',
    'npm run build',
    '```',
    '',
    'Deploy with the Serverless Framework: `npx serverless deploy`.',
    ''
  );
  add('README.md', readme.join('\n'));

  for (const n of groups.controller) {
    add(`src/handlers/${ctx.baseOf.get(n.id)}.ts`, renderHandler(n, ctx));
  }
  for (const n of groups.service) {
    add(`src/services/${ctx.baseOf.get(n.id)}.ts`, renderService(n, ctx));
  }
  for (const n of groups.data) {
    add(`src/repositories/${ctx.baseOf.get(n.id)}.ts`, renderData(n, ctx));
  }
  for (const n of groups.model) {
    add(`src/models/${ctx.baseOf.get(n.id)}.ts`, renderModel(n, ctx, false));
  }
  for (const n of groups.interface) {
    add(`src/interfaces/${ctx.baseOf.get(n.id)}.ts`, renderModel(n, ctx, true));
  }
  for (const n of groups.external) {
    add(`src/external/${ctx.baseOf.get(n.id)}.ts`, renderExternal(n, ctx));
  }

  return { files, counts: groups, runtime };
}
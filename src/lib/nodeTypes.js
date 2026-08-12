/**
 * Node type registry.
 *
 * Each type declares how it looks on the board and which fields the
 * inspector should render for it. Adding a new kind of node is just a
 * matter of adding an entry here.
 */

/** Field kinds understood by the card and inspector. */
// 'text' | 'textarea' | 'payload' | 'select'

export const NODE_TYPES = {
  controller: {
    label: 'Controller',
    icon: 'λ',
    accent: '#4f8cff',
    defaults: {
      title: 'getResource',
      method: 'GET',
      path: '/resources/:id',
      runtime: 'Node 20',
      notes: '',
      request: '',
      requestKind: 'none',
      response: '{\n  \n}',
      responseKind: 'json',
    },
    subtitle: (n) => n.path,
    chip: (n) => n.method,
    fields: [
      {
        key: 'method',
        label: 'Method',
        kind: 'select',
        slot: 'chip',
        width: 110,
        options: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'],
      },
      { key: 'title', label: 'Handler name', kind: 'text', slot: 'title' },
      {
        key: 'path',
        label: 'Route',
        kind: 'text',
        slot: 'sub',
        mono: true,
        placeholder: '/users/:id',
      },
      {
        key: 'runtime',
        label: 'Runtime',
        kind: 'select',
        slot: 'meta',
        options: ['Node 18', 'Node 20', 'Node 22', 'Python 3.12', 'Go', '.NET 8'],
      },
      { key: 'notes', label: 'Notes', kind: 'textarea', slot: 'body' },
      { key: 'request', label: 'Request', kind: 'json', slot: 'drawer' },
      { key: 'response', label: 'Response', kind: 'json', slot: 'drawer' },
    ],
  },

  service: {
    label: 'Service',
    icon: '⚙',
    accent: '#26e0a5',
    defaults: {
      title: 'getResourceById',
      returns: 'Promise<Resource>',
      notes: '',
      request: 'id: string — resource id\n',
      requestKind: 'args',
      response: '{\n  \n}',
      responseKind: 'json',
    },
    subtitle: (n) => n.returns,
    chip: () => 'SRV',
    fields: [
      { key: 'title', label: 'Function', kind: 'text', slot: 'title' },
      {
        key: 'returns',
        label: 'Returns',
        kind: 'text',
        slot: 'sub',
        mono: true,
        placeholder: 'Promise<Resource>',
      },
      { key: 'notes', label: 'Notes', kind: 'textarea', slot: 'body' },
      { key: 'request', label: 'Params', kind: 'json', slot: 'drawer' },
      { key: 'response', label: 'Returns', kind: 'json', slot: 'drawer' },
    ],
  },

  data: {
    label: 'Data layer',
    icon: '🗃',
    accent: '#ffca62',
    defaults: {
      title: 'resourceRepository',
      engine: 'DynamoDB',
      notes: '',
      schema: '{\n  \n}',
      schemaKind: 'json',
    },
    subtitle: (n) => n.engine,
    chip: () => 'DB',
    fields: [
      { key: 'title', label: 'Repository', kind: 'text', slot: 'title' },
      {
        key: 'engine',
        label: 'Engine',
        kind: 'select',
        slot: 'sub',
        options: ['DynamoDB', 'PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'S3'],
      },
      { key: 'notes', label: 'Notes', kind: 'textarea', slot: 'body' },
      { key: 'schema', label: 'Table / shape', kind: 'json', slot: 'drawer' },
    ],
  },

  model: {
    label: 'Model',
    icon: '◇',
    accent: '#c792ea',
    defaults: {
      title: 'Resource',
      notes: '',
      schema: '{\n  "id": "string",\n  "name": "string"\n}',
      schemaKind: 'json',
    },
    subtitle: () => '',
    chip: () => 'MOD',
    fields: [
      { key: 'title', label: 'Model', kind: 'text', slot: 'title' },
      { key: 'notes', label: 'Notes', kind: 'textarea', slot: 'body' },
      { key: 'schema', label: 'Fields', kind: 'json', slot: 'drawer' },
    ],
  },

  interface: {
    label: 'Interface',
    icon: '☰',
    accent: '#7fdbca',
    defaults: {
      title: 'CreateResourceRequest',
      notes: '',
      schema: '{\n  "name": "string"\n}',
      schemaKind: 'json',
    },
    subtitle: () => '',
    chip: () => 'INT',
    fields: [
      { key: 'title', label: 'Interface', kind: 'text', slot: 'title' },
      { key: 'notes', label: 'Notes', kind: 'textarea', slot: 'body' },
      { key: 'schema', label: 'Members', kind: 'json', slot: 'drawer' },
    ],
  },

  decision: {
    label: 'Decision',
    icon: '◆',
    accent: '#26e0a5',
    defaults: {
      title: 'Is it valid?',
      condition: '',
      notes: '',
    },
    subtitle: (n) => n.condition,
    chip: () => 'IF',
    shape: 'diamond',
    fields: [
      { key: 'title', label: 'Question', kind: 'text', slot: 'title' },
      {
        key: 'condition',
        label: 'Condition',
        kind: 'text',
        slot: 'sub',
        mono: true,
        placeholder: 'status === 200',
      },
      { key: 'notes', label: 'Notes', kind: 'textarea', slot: 'body' },
    ],
  },

  external: {
    label: 'External API',
    icon: '☁',
    accent: '#7fdbca',
    defaults: {
      title: 'Third-party API',
      baseUrl: 'https://api.example.com',
      auth: 'Bearer',
      notes: '',
      response: '{\n  \n}',
      responseKind: 'json',
    },
    subtitle: (n) => n.baseUrl,
    chip: () => 'EXT',
    fields: [
      { key: 'title', label: 'Provider', kind: 'text', slot: 'title' },
      { key: 'baseUrl', label: 'Base URL', kind: 'text', slot: 'sub', mono: true },
      {
        key: 'auth',
        label: 'Auth',
        kind: 'select',
        slot: 'meta',
        options: ['None', 'Bearer', 'API key', 'Basic', 'OAuth2', 'mTLS'],
      },
      { key: 'notes', label: 'Notes', kind: 'textarea', slot: 'body' },
      { key: 'response', label: 'Sample response', kind: 'json', slot: 'drawer' },
    ],
  },

  note: {
    label: 'Note',
    icon: '✎',
    accent: '#8b9bb0',
    defaults: { title: 'Note', notes: 'Write anything here…' },
    subtitle: () => '',
    chip: () => null,
    shape: 'sticky',
    fields: [
      { key: 'title', label: 'Heading', kind: 'text', slot: 'title' },
      { key: 'notes', label: 'Text', kind: 'textarea', slot: 'body', rows: 8 },
    ],
  },
};

export const NODE_TYPE_LIST = Object.entries(NODE_TYPES).map(([id, t]) => ({
  id,
  ...t,
}));

export const DEFAULT_TYPE = 'controller';

export function getType(id) {
  return NODE_TYPES[id] || NODE_TYPES[DEFAULT_TYPE];
}

/** Method-specific accent so GET/POST/… still read at a glance. */
export const METHOD_COLORS = {
  GET: '#4fc3f7',
  POST: '#26e0a5',
  PUT: '#ffca62',
  PATCH: '#c792ea',
  DELETE: '#ff8a80',
  HEAD: '#9db4d6',
  OPTIONS: '#9db4d6',
};

export function chipColor(node) {
  const t = getType(node.type);
  if (node.type === 'controller') return METHOD_COLORS[node.method] || t.accent;
  return t.accent;
}

/** Fields belonging to a given card slot. */
export function slotFields(typeId, slot) {
  return getType(typeId).fields.filter((f) => f.slot === slot);
}

/** The one field a slot holds, if any (title/chip/sub are single-valued). */
export function slotField(typeId, slot) {
  return getType(typeId).fields.find((f) => f.slot === slot);
}

/** Tab order for inline editing on the card. */
export function tabOrder(typeId) {
  const order = { title: 0, sub: 1, meta: 2, body: 3, drawer: 4, chip: 5 };
  return [...getType(typeId).fields].sort(
    (a, b) => (order[a.slot] ?? 9) - (order[b.slot] ?? 9)
  );
}

/** Number keys 1-9 map to types, for fast placement. */
export const TYPE_HOTKEYS = NODE_TYPE_LIST.map((t) => t.id);

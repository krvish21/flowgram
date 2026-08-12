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
  endpoint: {
    label: 'Endpoint',
    icon: '⇄',
    accent: '#4f8cff',
    defaults: {
      title: 'New endpoint',
      method: 'GET',
      path: '/resource',
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
      { key: 'title', label: 'Title', kind: 'text', slot: 'title' },
      {
        key: 'path',
        label: 'Path',
        kind: 'text',
        slot: 'sub',
        mono: true,
        placeholder: '/users/:id',
      },
      { key: 'notes', label: 'Notes', kind: 'textarea', slot: 'body' },
      { key: 'request', label: 'Request', kind: 'json', slot: 'drawer' },
      { key: 'response', label: 'Response', kind: 'json', slot: 'drawer' },
    ],
  },

  simple: {
    label: 'Simple',
    icon: '▢',
    accent: '#9db4d6',
    defaults: {
      title: 'Step',
      notes: '',
      request: '',
      requestKind: 'args',
      response: '',
      responseKind: 'none',
    },
    subtitle: () => '',
    chip: () => null,
    fields: [
      { key: 'title', label: 'Title', kind: 'text', slot: 'title' },
      { key: 'notes', label: 'Notes', kind: 'textarea', slot: 'body' },
      { key: 'request', label: 'Request', kind: 'json', slot: 'drawer' },
      { key: 'response', label: 'Response', kind: 'json', slot: 'drawer' },
    ],
  },

  datastore: {
    label: 'Data store',
    icon: '🗄',
    accent: '#ffca62',
    defaults: {
      title: 'Database',
      engine: 'PostgreSQL',
      notes: '',
      schema: '{\n  \n}',
      schemaKind: 'json',
    },
    subtitle: (n) => n.engine,
    chip: () => 'DB',
    fields: [
      { key: 'title', label: 'Name', kind: 'text', slot: 'title' },
      {
        key: 'engine',
        label: 'Engine',
        kind: 'select',
        slot: 'sub',
        options: ['PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'DynamoDB', 'S3', 'Other'],
      },
      { key: 'notes', label: 'Notes', kind: 'textarea', slot: 'body' },
      { key: 'schema', label: 'Schema / shape', kind: 'json', slot: 'drawer' },
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

export const DEFAULT_TYPE = 'endpoint';

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
  if (node.type === 'endpoint') return METHOD_COLORS[node.method] || t.accent;
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

/**
 * Payloads (request / response / schema) aren't always JSON — an endpoint
 * may take no body at all, a list of arguments, form data, or just prose.
 *
 * Each payload therefore stores two values on the node:
 *   <key>       the text itself
 *   <key>Kind   which of the shapes below it is
 */

export const PAYLOAD_KINDS = {
  none: {
    label: 'Void',
    short: 'void',
    hint: 'No body.',
    editable: false,
    color: '#5f7086',
  },
  json: {
    label: 'JSON',
    short: 'json',
    placeholder: '{\n  "id": 1\n}',
    validate: (t) => {
      if (!t.trim()) return null;
      try {
        JSON.parse(t);
        return null;
      } catch (e) {
        return e.message;
      }
    },
    format: (t) => JSON.stringify(JSON.parse(t), null, 2),
    color: '#26e0a5',
  },
  args: {
    label: 'Arguments',
    short: 'args',
    hint: 'One per line — name: type — description',
    placeholder: 'id: string — user id\nlimit?: number — page size',
    color: '#4f8cff',
  },
  query: {
    label: 'Query params',
    short: 'query',
    hint: 'One per line — name=value',
    placeholder: 'page=1\nsort=createdAt',
    color: '#c792ea',
  },
  form: {
    label: 'Form data',
    short: 'form',
    hint: 'multipart / urlencoded fields, one per line',
    placeholder: 'file: binary\nname: string',
    color: '#ffca62',
  },
  text: {
    label: 'Text',
    short: 'text',
    hint: 'Free-form notes, XML, CSV — anything.',
    placeholder: 'Plain text body…',
    color: '#9db4d6',
  },
};

export const PAYLOAD_KIND_LIST = Object.entries(PAYLOAD_KINDS).map(([id, k]) => ({
  id,
  ...k,
}));

export const DEFAULT_KIND = 'json';

export function kindOf(node, key) {
  const id = node[`${key}Kind`];
  return PAYLOAD_KINDS[id] ? id : DEFAULT_KIND;
}

export function getKind(id) {
  return PAYLOAD_KINDS[id] || PAYLOAD_KINDS[DEFAULT_KIND];
}

/** Validation message for a payload, or null when it's fine. */
export function validatePayload(kindId, text) {
  const k = getKind(kindId);
  return k.validate ? k.validate(text ?? '') : null;
}

/** True when the payload carries anything meaningful. */
export function isFilled(kindId, text) {
  if (kindId === 'none') return true; // "void" is a deliberate statement
  if (!text) return false;
  if (kindId === 'json') {
    try {
      const v = JSON.parse(text);
      if (Array.isArray(v)) return v.length > 0;
      if (v && typeof v === 'object') return Object.keys(v).length > 0;
      return v !== null;
    } catch {
      return text.trim().length > 0;
    }
  }
  return text.trim().length > 0;
}

/**
 * Short summary shown on the card badge, e.g. `json·3`, `args·2`, `void`.
 * Deliberately tiny so nodes stay compact.
 */
export function summarize(kindId, text) {
  const k = getKind(kindId);
  if (kindId === 'none') return { short: k.short, count: null };
  if (!text || !text.trim()) return { short: k.short, count: null };

  if (kindId === 'json') {
    try {
      const v = JSON.parse(text);
      if (Array.isArray(v)) return { short: k.short, count: v.length || null };
      if (v && typeof v === 'object') {
        const n = Object.keys(v).length;
        return { short: k.short, count: n || null };
      }
      return { short: k.short, count: null };
    } catch {
      return { short: k.short, count: '!' };
    }
  }

  // line-based kinds: count the non-empty lines
  const lines = text.split('\n').filter((l) => l.trim()).length;
  return { short: k.short, count: lines || null };
}

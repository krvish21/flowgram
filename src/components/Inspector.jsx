import React, { useEffect, useState } from 'react';
import { NODE_TYPE_LIST, getType } from '../lib/nodeTypes.js';
import {
  PAYLOAD_KIND_LIST,
  getKind,
  kindOf,
  validatePayload,
} from '../lib/payloads.js';

/* ------------------------------------------------------------------ */
/* field renderers                                                     */
/* ------------------------------------------------------------------ */

function PayloadField({ field, node, onChange, readOnly }) {
  const value = node[field.key] ?? '';
  const kindId = kindOf(node, field.key);
  const kind = getKind(kindId);
  const error = validatePayload(kindId, value);

  return (
    <label className="field">
      <span className="field-label">
        {field.label}
        {!readOnly && kind.format && (
          <button
            type="button"
            className="mini"
            onClick={() => {
              try {
                onChange({ [field.key]: kind.format(value) });
              } catch {
                /* invalid input is already reported below */
              }
            }}
          >
            format
          </button>
        )}
      </span>

      <div className="kind-row">
        {PAYLOAD_KIND_LIST.map((k) => (
          <button
            key={k.id}
            type="button"
            disabled={readOnly}
            className={`kind ${k.id === kindId ? 'active' : ''}`}
            style={{ '--kind': k.color }}
            onClick={() => onChange({ [`${field.key}Kind`]: k.id })}
            title={k.hint || k.label}
          >
            {k.label}
          </button>
        ))}
      </div>

      {kind.editable === false ? (
        <span className="muted small">No body.</span>
      ) : (
        <>
          <textarea
            className={`${kindId === 'json' ? 'code' : ''} ${error ? 'has-error' : ''}`}
            rows={7}
            readOnly={readOnly}
            value={value}
            placeholder={kind.placeholder}
            onChange={(e) => onChange({ [field.key]: e.target.value })}
            spellCheck={false}
          />
          {error ? <span className="error">{error}</span> : null}
        </>
      )}
    </label>
  );
}

function Field({ field, node, readOnly, onChange }) {
  const value = node[field.key] ?? '';
  const set = (v) => onChange({ [field.key]: v });

  if (field.kind === 'json') {
    return (
      <PayloadField
        field={field}
        node={node}
        readOnly={readOnly}
        onChange={onChange}
      />
    );
  }

  return (
    <label className="field" style={field.width ? { flex: `0 0 ${field.width}px` } : undefined}>
      <span className="field-label">{field.label}</span>
      {field.kind === 'select' ? (
        <select value={value} disabled={readOnly} onChange={(e) => set(e.target.value)}>
          {field.options.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
      ) : field.kind === 'textarea' ? (
        <textarea
          rows={field.rows ?? 3}
          value={value}
          readOnly={readOnly}
          placeholder={field.placeholder}
          onChange={(e) => set(e.target.value)}
        />
      ) : (
        <input
          value={value}
          readOnly={readOnly}
          placeholder={field.placeholder}
          onChange={(e) => set(e.target.value)}
        />
      )}
    </label>
  );
}

/** Group consecutive fields flagged `inline` with the field before them. */
function renderFields(fields, node, readOnly, onChange) {
  const out = [];
  for (let i = 0; i < fields.length; i++) {
    const f = fields[i];
    const next = fields[i + 1];
    if (next?.inline) {
      out.push(
        <div className="row" key={f.key}>
          <Field field={f} node={node} readOnly={readOnly} onChange={onChange} />
          <Field field={next} node={node} readOnly={readOnly} onChange={onChange} />
        </div>
      );
      i++;
    } else {
      out.push(
        <Field key={f.key} field={f} node={node} readOnly={readOnly} onChange={onChange} />
      );
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* inspector                                                           */
/* ------------------------------------------------------------------ */

export default function Inspector({ doc, store, mode, selection, setSelection }) {
  const readOnly = mode !== 'create';

  if (!selection) {
    return (
      <aside className="inspector">
        <h2>Inspector</h2>
        <p className="muted">
          {readOnly
            ? 'Select a node to read its contract.'
            : 'Pick a type on the left, click the board to place it, then edit it here.'}
        </p>
        <Legend />
      </aside>
    );
  }

  if (selection.type === 'edge') {
    const edge = doc.edges.find((e) => e.id === selection.id);
    if (!edge) return null;
    const from = doc.nodes.find((n) => n.id === edge.from);
    const to = doc.nodes.find((n) => n.id === edge.to);
    return (
      <aside className="inspector">
        <h2>Connection</h2>
        <p className="muted small">
          {from?.title} → {to?.title}
        </p>
        <label className="field">
          <span className="field-label">Label</span>
          <input
            value={edge.label || ''}
            readOnly={readOnly}
            onChange={(e) => store.updateEdge(edge.id, { label: e.target.value })}
            placeholder="e.g. on 201 Created"
          />
        </label>
        <label className="field">
          <span className="field-label">Style</span>
          <select
            value={edge.style || 'solid'}
            disabled={readOnly}
            onChange={(e) => store.updateEdge(edge.id, { style: e.target.value })}
          >
            <option value="solid">Solid — sync call</option>
            <option value="dashed">Dashed — async / event</option>
          </select>
        </label>
        {!readOnly && (
          <button
            className="danger"
            onClick={() => {
              store.removeEdge(edge.id);
              setSelection(null);
            }}
          >
            Delete connection
          </button>
        )}
      </aside>
    );
  }

  const node = doc.nodes.find((n) => n.id === selection.id);
  if (!node) return null;
  const type = getType(node.type);
  const set = (patch) => store.updateNode(node.id, patch);

  const outgoing = doc.edges.filter((e) => e.from === node.id);
  const incoming = doc.edges.filter((e) => e.to === node.id);

  return (
    <aside className="inspector">
      <h2>
        <span className="node-icon">{type.icon}</span> {type.label}
      </h2>

      <label className="field">
        <span className="field-label">Type</span>
        <select
          value={node.type}
          disabled={readOnly}
          onChange={(e) => store.setNodeType(node.id, e.target.value)}
        >
          {NODE_TYPE_LIST.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
      </label>

      {renderFields(type.fields, node, readOnly, set)}

      <div className="conn-summary">
        <span>{incoming.length} in</span>
        <span>{outgoing.length} out</span>
      </div>

      {!readOnly && (
        <button
          className="danger"
          onClick={() => {
            store.removeNode(node.id);
            setSelection(null);
          }}
        >
          Delete node
        </button>
      )}
    </aside>
  );
}

function Legend() {
  return (
    <ul className="legend">
      <li>Click empty board → new node of the chosen type</li>
      <li>Drag a node → arrows stretch and re-route</li>
      <li>Click a “+” → branch a new node from that side</li>
      <li>Click the same “+” again → a second branch, fanned out</li>
      <li>Drag a “+” onto a node → connect them</li>
      <li>Wheel = zoom, drag board = pan</li>
      <li>Delete / Ctrl+Z / Ctrl+Shift+Z</li>
    </ul>
  );
}

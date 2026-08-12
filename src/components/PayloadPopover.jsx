import React, { useEffect, useRef, useState } from 'react';
import {
  PAYLOAD_KIND_LIST,
  getKind,
  kindOf,
  validatePayload,
} from '../lib/payloads.js';

/**
 * Floating editor for a node's payloads (request / response / schema).
 *
 * A payload isn't necessarily JSON — pick the shape from the row of kind
 * buttons and the editor adapts (or disappears entirely, for "void").
 */
export default function PayloadPopover({
  node,
  fields,
  initialKey,
  onChange,
  onClose,
  readOnly,
}) {
  const [activeKey, setActiveKey] = useState(initialKey || fields[0]?.key);
  const [error, setError] = useState(null);
  const boxRef = useRef(null);

  const field = fields.find((f) => f.key === activeKey) || fields[0];
  const value = node[field.key] ?? '';
  const kindId = kindOf(node, field.key);
  const kind = getKind(kindId);

  useEffect(() => setActiveKey(initialKey || fields[0]?.key), [initialKey, fields]);

  // re-validate whenever the payload or its kind changes
  useEffect(() => {
    setError(validatePayload(kindId, value));
  }, [kindId, value]);

  // flip to the other side of the node if there isn't room on the right
  const [side, setSide] = useState('right');
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const canvas = el.closest('.canvas')?.getBoundingClientRect();
    if (canvas && r.right > canvas.right - 8) setSide('left');
  }, []);

  // close on outside click / Escape
  useEffect(() => {
    const onDown = (e) => {
      if (!boxRef.current?.contains(e.target) && !e.target.closest('.payload-btn')) {
        onClose();
      }
    };
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const setKind = (id) => onChange(`${field.key}Kind`, id);

  const format = () => {
    if (!kind.format) return;
    try {
      onChange(field.key, kind.format(value));
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div
      ref={boxRef}
      className={`payload-pop side-${side}`}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      <div className="pop-tabs">
        {fields.map((f) => (
          <button
            key={f.key}
            type="button"
            className={f.key === activeKey ? 'active' : ''}
            onClick={() => setActiveKey(f.key)}
          >
            {f.label}
          </button>
        ))}
        <span className="spacer" />
        <button type="button" className="mini" onClick={onClose} title="Close (Esc)">
          ✕
        </button>
      </div>

      <div className="pop-kinds">
        {PAYLOAD_KIND_LIST.map((k) => (
          <button
            key={k.id}
            type="button"
            disabled={readOnly}
            className={`kind ${k.id === kindId ? 'active' : ''}`}
            style={{ '--kind': k.color }}
            onClick={() => setKind(k.id)}
            title={k.hint || k.label}
          >
            {k.label}
          </button>
        ))}
      </div>

      {kind.editable === false ? (
        <div className="pop-void">
          This {field.label.toLowerCase()} carries no body.
        </div>
      ) : (
        <>
          <textarea
            className={`pop-code ${error ? 'has-error' : ''} ${
              kindId === 'json' ? 'is-mono' : ''
            }`}
            value={value}
            readOnly={readOnly}
            spellCheck={false}
            autoFocus
            placeholder={kind.placeholder}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Tab') {
                e.preventDefault();
                const el = e.currentTarget;
                const s = el.selectionStart;
                onChange(
                  field.key,
                  `${el.value.slice(0, s)}  ${el.value.slice(el.selectionEnd)}`
                );
                requestAnimationFrame(() => el.setSelectionRange(s + 2, s + 2));
              }
            }}
            onChange={(e) => onChange(field.key, e.target.value)}
          />

          <div className={`pop-foot ${error ? 'is-error' : ''}`}>
            <span>{error ? error : kind.hint || `${kind.label} payload`}</span>
            {!readOnly && kind.format ? (
              <button type="button" className="mini" onClick={format}>
                format
              </button>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}

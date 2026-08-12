import React, { useEffect, useRef, useState } from 'react';
import { SIDES, WIDTH_HANDLES } from '../lib/geometry.js';
import {
  getType,
  chipColor,
  slotField,
  slotFields,
  tabOrder,
  NODE_TYPE_LIST,
} from '../lib/nodeTypes.js';
import InlineText from './InlineText.jsx';
import ResizeHandles from './ResizeHandles.jsx';
import PayloadPopover from './PayloadPopover.jsx';
import { kindOf, getKind, isFilled, summarize } from '../lib/payloads.js';

/* ------------------------------------------------------------------ */
/* small pieces                                                        */
/* ------------------------------------------------------------------ */

function PillSelect({ field, value, onChange, color, readOnly }) {
  if (readOnly) {
    return (
      <span className="chip" style={color ? { background: color } : undefined}>
        {value}
      </span>
    );
  }
  return (
    <span className="chip-wrap" style={color ? { '--chip-bg': color } : undefined}>
      <select
        className="chip chip-select"
        value={value ?? ''}
        style={color ? { background: color } : undefined}
        onPointerDown={(e) => e.stopPropagation()}
        onChange={(e) => onChange(e.target.value)}
        title={field.label}
      >
        {field.options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </span>
  );
}

function PayloadBadge({ field, node, onOpen, active }) {
  const kindId = kindOf(node, field.key);
  const kind = getKind(kindId);
  const filled = isFilled(kindId, node[field.key]);
  const { count } = summarize(kindId, node[field.key]);

  return (
    <button
      type="button"
      className={`payload-btn ${filled ? 'is-filled' : ''} ${active ? 'is-open' : ''}`}
      style={{ '--kind': kind.color }}
      title={`${field.label} — ${kind.label}`}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        onOpen(field.key);
      }}
    >
      <span className="payload-name">{field.label}</span>
      <span className="payload-kind">{kind.short}</span>
      {count != null ? <span className="payload-count">{count}</span> : null}
    </button>
  );
}

/** Floating actions that appear above the selected node. */
function NodeToolbar({ node, onType, onDuplicate, onDelete, onAutoSize }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="node-toolbar" onPointerDown={(e) => e.stopPropagation()}>
      <button
        type="button"
        className="nt-btn"
        title="Change type"
        onClick={() => setOpen((o) => !o)}
      >
        {getType(node.type).icon} ▾
      </button>
      <button type="button" className="nt-btn" title="Duplicate (Ctrl+D)" onClick={onDuplicate}>
        ⧉
      </button>
      <button type="button" className="nt-btn" title="Reset width" onClick={onAutoSize}>
        ↔
      </button>
      <button type="button" className="nt-btn danger" title="Delete (Del)" onClick={onDelete}>
        ✕
      </button>

      {open ? (
        <div className="type-menu">
          {NODE_TYPE_LIST.map((t, i) => (
            <button
              key={t.id}
              type="button"
              className={t.id === node.type ? 'active' : ''}
              style={{ '--accent-node': t.accent }}
              onClick={() => {
                onType(t.id);
                setOpen(false);
              }}
            >
              <span className="palette-icon">{t.icon}</span>
              {t.label}
              <kbd>{i + 1}</kbd>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* node                                                                */
/* ------------------------------------------------------------------ */

function FlowNode({
  node,
  mode,
  selected,
  onPointerDownNode,
  onSelect,
  onPlusPointerDown,
  onUpdate,
  onSetType,
  onDuplicate,
  onDelete,
  onCheckpoint,
  onResizeStart,
  onAutoSize,
  onMeasure,
  isLinkTarget,
  outCount,
  autoEdit,
}) {
  const editable = mode === 'create';
  const type = getType(node.type);
  const [payloadKey, setPayloadKey] = useState(null);
  const [focusKey, setFocusKey] = useState(autoEdit ? 'title' : null);
  const dirty = useRef(false);

  useEffect(() => {
    if (autoEdit) setFocusKey('title');
  }, [autoEdit]);

  // close the payload editor when the node is deselected
  useEffect(() => {
    if (!selected) setPayloadKey(null);
  }, [selected]);

  const titleF = slotField(node.type, 'title');
  const chipF = slotField(node.type, 'chip');
  const subF = slotField(node.type, 'sub');
  const metaFs = slotFields(node.type, 'meta');
  const bodyF = slotField(node.type, 'body');
  const payloads = slotFields(node.type, 'drawer');

  /** One undo entry per burst of typing in a field. */
  const change = (key, value) => {
    if (!dirty.current) {
      onCheckpoint();
      dirty.current = true;
    }
    onUpdate({ [key]: value });
  };
  const commit = () => {
    dirty.current = false;
  };

  /** Tab / Shift+Tab walks the card's fields. */
  const fieldKeyDown = (field) => (e) => {
    if (e.key !== 'Tab') return;
    e.preventDefault();
    const order = tabOrder(node.type).filter((f) => f.kind !== 'json');
    const i = order.findIndex((f) => f.key === field.key);
    const next = order[(i + (e.shiftKey ? -1 : 1) + order.length) % order.length];
    setFocusKey(null);
    requestAnimationFrame(() => setFocusKey(next.key));
  };

  const showEmpty = selected || focusKey;

  /* The card's height is decided by its content, so report the rendered
     value back to the store — that's what edge anchors are drawn from. */
  const rootRef = useRef(null);
  const measureRef = useRef(onMeasure);
  measureRef.current = onMeasure;
  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    let frame = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() =>
        measureRef.current?.(Math.round(el.offsetHeight))
      );
    });
    ro.observe(el);
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
    };
  }, []);

  return (
    <div
      ref={rootRef}
      className={[
        'node',
        `type-${node.type}`,
        type.shape ? `shape-${type.shape}` : '',
        selected ? 'is-selected' : '',
        isLinkTarget ? 'is-link-target' : '',
        editable ? 'is-editable' : '',
        focusKey ? 'is-editing' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={{
        transform: `translate(${node.x}px, ${node.y}px)`,
        width: node.w,
        '--accent-node': type.accent,
      }}
      data-node-id={node.id}
      onPointerDown={(e) => onPointerDownNode(e, node)}
      onClick={(e) => {
        e.stopPropagation();
        onSelect({ type: 'node', id: node.id });
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        if (editable) setFocusKey('title');
      }}
    >
      {editable && selected ? (
        <NodeToolbar
          node={node}
          onType={onSetType}
          onDuplicate={onDuplicate}
          onDelete={onDelete}
          onAutoSize={onAutoSize}
        />
      ) : null}

      <div className="node-head">
        <span className="node-icon" aria-hidden="true">
          {type.icon}
        </span>
        {chipF ? (
          <PillSelect
            field={chipF}
            value={node[chipF.key]}
            color={chipColor(node)}
            readOnly={!editable}
            onChange={(v) => {
              onCheckpoint();
              onUpdate({ [chipF.key]: v });
            }}
          />
        ) : type.chip?.(node) ? (
          <span className="chip" style={{ background: type.accent }}>
            {type.chip(node)}
          </span>
        ) : null}
        {titleF ? (
          <InlineText
            className="f-title"
            value={node[titleF.key]}
            placeholder={titleF.label}
            readOnly={!editable}
            autoFocus={focusKey === titleF.key}
            selectOnFocus={autoEdit}
            onChange={(v) => change(titleF.key, v)}
            onCommit={commit}
            onKeyDown={fieldKeyDown(titleF)}
          />
        ) : null}
      </div>

      {subF && (editable ? showEmpty || node[subF.key] : node[subF.key]) ? (
        subF.kind === 'select' ? (
          <div className="node-sub">
            <PillSelect
              field={subF}
              value={node[subF.key]}
              readOnly={!editable}
              onChange={(v) => {
                onCheckpoint();
                onUpdate({ [subF.key]: v });
              }}
            />
          </div>
        ) : (
          <InlineText
            className={`f-sub ${subF.mono ? 'mono' : ''}`}
            value={node[subF.key]}
            placeholder={subF.placeholder || subF.label}
            readOnly={!editable}
            autoFocus={focusKey === subF.key}
            onChange={(v) => change(subF.key, v)}
            onCommit={commit}
            onKeyDown={fieldKeyDown(subF)}
          />
        )
      ) : null}

      {metaFs.length ? (
        <div className="node-meta">
          {metaFs.map((f) => (
            <PillSelect
              key={f.key}
              field={f}
              value={node[f.key]}
              readOnly={!editable}
              onChange={(v) => {
                onCheckpoint();
                onUpdate({ [f.key]: v });
              }}
            />
          ))}
        </div>
      ) : null}

      {bodyF && (editable ? showEmpty || node[bodyF.key] : node[bodyF.key]) ? (
        <InlineText
          className="f-body"
          multiline
          value={node[bodyF.key]}
          placeholder={bodyF.placeholder || bodyF.label}
          readOnly={!editable}
          autoFocus={focusKey === bodyF.key}
          onChange={(v) => change(bodyF.key, v)}
          onCommit={commit}
          onKeyDown={fieldKeyDown(bodyF)}
        />
      ) : null}

      {payloads.length ? (
        <div className="node-payloads">
          {payloads.map((f) =>
            !editable && !isFilled(kindOf(node, f.key), node[f.key]) ? null : (
              <PayloadBadge
                key={f.key}
                field={f}
                node={node}
                active={payloadKey === f.key}
                onOpen={(k) => setPayloadKey((p) => (p === k ? null : k))}
              />
            )
          )}
        </div>
      ) : null}

      {payloadKey ? (
        <PayloadPopover
          node={node}
          fields={payloads}
          initialKey={payloadKey}
          readOnly={!editable}
          onChange={(k, v) => change(k, v)}
          onClose={() => {
            commit();
            setPayloadKey(null);
          }}
        />
      ) : null}

      {outCount > 1 ? (
        <span className="fanout" title={`${outCount} outgoing connections`}>
          ⑂ {outCount}
        </span>
      ) : null}

      {editable && selected ? (
        <ResizeHandles
          handles={WIDTH_HANDLES}
          onStart={(h, e) => onResizeStart(h, e, node)}
        />
      ) : null}

      {editable &&
        SIDES.map((side) => (
          <button
            key={side}
            type="button"
            className={`plus plus-${side}`}
            title={`Click to branch ${side} · drag onto a node to connect`}
            onPointerDown={(e) => {
              e.stopPropagation();
              onPlusPointerDown(e, node, side);
            }}
            onClick={(e) => e.stopPropagation()}
          >
            +
          </button>
        ))}
    </div>
  );
}

export default React.memo(FlowNode);

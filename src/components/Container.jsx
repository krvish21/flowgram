import React from 'react';
import InlineText from './InlineText.jsx';
import ResizeHandles from './ResizeHandles.jsx';
import { CONTAINER_HEADER } from '../lib/geometry.js';

const COLORS = [
  '#4f8cff',
  '#26e0a5',
  '#ffca62',
  '#c792ea',
  '#ff8a80',
  '#7fdbca',
  '#9db4d6',
];

/**
 * A titled frame that visually groups nodes. Containment is purely
 * geometric — anything sitting inside travels with it when dragged.
 */
export default function Container({
  container: c,
  mode,
  selected,
  childCount,
  onPointerDownHeader,
  onSelect,
  onUpdate,
  onCheckpoint,
  onResizeStart,
  onFit,
  onDelete,
}) {
  const editable = mode === 'create';

  return (
    <div
      className={`container ${selected ? 'is-selected' : ''} ${
        c.collapsed ? 'is-collapsed' : ''
      }`}
      data-container-id={c.id}
      style={{
        transform: `translate(${c.x}px, ${c.y}px)`,
        width: c.w,
        height: c.collapsed ? CONTAINER_HEADER : c.h,
        '--group': c.color,
      }}
      onPointerDown={(e) => {
        // clicks on the body select but never drag; only the header drags
        e.stopPropagation();
        onSelect({ type: 'container', id: c.id });
      }}
    >
      <div
        className="container-head"
        onPointerDown={(e) => {
          if (e.target.closest('.inline-text, .cbtn, .swatch')) return;
          onPointerDownHeader(e, c);
        }}
      >
        <button
          type="button"
          className="cbtn caret"
          title={c.collapsed ? 'Expand' : 'Collapse'}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => onUpdate({ collapsed: !c.collapsed }, true)}
        >
          {c.collapsed ? '▸' : '▾'}
        </button>

        <InlineText
          className="f-group-title"
          value={c.title}
          placeholder="Group name"
          readOnly={!editable}
          onChange={(v) => onUpdate({ title: v }, false)}
          onCommit={onCheckpoint}
        />

        <span className="container-count">{childCount}</span>

        {editable && selected ? (
          <>
            <span className="swatches" onPointerDown={(e) => e.stopPropagation()}>
              {COLORS.map((col) => (
                <button
                  key={col}
                  type="button"
                  className={`swatch ${c.color === col ? 'active' : ''}`}
                  style={{ background: col }}
                  onClick={() => onUpdate({ color: col }, true)}
                />
              ))}
            </span>
            <button
              type="button"
              className="cbtn"
              title="Shrink to fit contents"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={onFit}
            >
              ⤡
            </button>
            <button
              type="button"
              className="cbtn danger"
              title="Delete group (keeps nodes)"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={onDelete}
            >
              ✕
            </button>
          </>
        ) : null}
      </div>

      {editable && selected && !c.collapsed ? (
        <ResizeHandles onStart={(h, e) => onResizeStart(h, e, c)} />
      ) : null}
    </div>
  );
}

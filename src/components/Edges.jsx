import React from 'react';
import { layoutEdges } from '../lib/geometry.js';

export default function Edges({ nodes, edges, selectedId, onSelect, linking }) {
  const laid = React.useMemo(() => layoutEdges(nodes, edges), [nodes, edges]);

  return (
    <svg className="edges-layer">
      <defs>
        <marker
          id="arrow"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
        </marker>
      </defs>

      {laid.map(({ edge: e, d, mid }) => {
        const active = selectedId === e.id;
        return (
          <g
            key={e.id}
            className={`edge ${active ? 'is-selected' : ''} ${
              e.style === 'dashed' ? 'is-dashed' : ''
            }`}
            onPointerDown={(ev) => {
              ev.stopPropagation();
              onSelect?.({ type: 'edge', id: e.id });
            }}
          >
            <path className="edge-hit" d={d} />
            <path className="edge-line" d={d} markerEnd="url(#arrow)" />
            {e.label ? (
              <text className="edge-label" x={mid.x} y={mid.y - 6}>
                {e.label}
              </text>
            ) : null}
          </g>
        );
      })}

      {linking ? (
        <path
          className="edge-line is-ghost"
          markerEnd="url(#arrow)"
          d={`M ${linking.from.x} ${linking.from.y} L ${linking.to.x} ${linking.to.y}`}
        />
      ) : null}
    </svg>
  );
}

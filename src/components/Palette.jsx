import React from 'react';
import { NODE_TYPE_LIST } from '../lib/nodeTypes.js';

/**
 * Vertical palette of node types. The selected type is what gets created
 * when you click an empty spot on the board.
 */
export default function Palette({ activeType, setActiveType, disabled }) {
  return (
    <div className={`palette ${disabled ? 'is-disabled' : ''}`}>
      <div className="palette-title">Node type</div>
      {NODE_TYPE_LIST.map((t, i) => (
        <button
          key={t.id}
          type="button"
          disabled={disabled}
          className={`palette-item ${activeType === t.id ? 'active' : ''}`}
          style={{ '--accent-node': t.accent }}
          onClick={() => setActiveType(t.id)}
          title={`Create ${t.label} nodes — press ${i + 1}`}
        >
          <span className="palette-icon">{t.icon}</span>
          <span>{t.label}</span>
          <kbd>{i + 1}</kbd>
        </button>
      ))}
      <div className="palette-hints">
        <div><kbd>Ctrl</kbd>+click add node</div>
        <div><kbd>Ctrl</kbd>+<kbd>⇧</kbd>+click group</div>
        <div><kbd>Tab</kbd> branch right</div>
        <div><kbd>Enter</kbd> edit title</div>
        <div><kbd>Ctrl</kbd>+<kbd>G</kbd> group</div>
        <div><kbd>Ctrl</kbd>+<kbd>D</kbd> duplicate</div>
      </div>
    </div>
  );
}

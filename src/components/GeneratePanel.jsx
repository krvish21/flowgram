import React, { useMemo, useState } from 'react';
import { generateCodebase } from '../lib/codegen.js';
import { zipFiles } from '../lib/zip.js';

/**
 * Modal that scaffolds a codebase from the current flow.
 * Shows the generated tree with a preview, and offers the files as a
 * downloadable ZIP.
 */
export default function GeneratePanel({ doc, onClose }) {
  const { files, counts } = useMemo(() => generateCodebase(doc), [doc]);
  const names = useMemo(() => Object.keys(files), [files]);
  const [active, setActive] = useState(() => names[0] || 'README.md');

  const shown = files[active];

  const download = () => {
    const url = URL.createObjectURL(zipFiles(files));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'flowgram-api.zip';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="generate-overlay" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="generate-panel">
        <header className="generate-head">
          <h2>Generate codebase</h2>
          <span className="muted small">
            {counts.controller.length} Lambda · {counts.service.length} services ·{' '}
            {counts.data.length} repositories · {counts.model.length} models ·{' '}
            {counts.interface.length} interfaces · {counts.external.length} external
          </span>
          <span className="spacer" />
          <button onClick={download} title="Download the whole scaffold as a ZIP">
            Download .zip
          </button>
          <button onClick={onClose}>Close</button>
        </header>

        <div className="generate-body">
          <ul className="file-tree">
            {names.map((n) => (
              <li key={n}>
                <button className={n === active ? 'active' : ''} onClick={() => setActive(n)}>
                  {n}
                </button>
              </li>
            ))}
          </ul>
          <pre className="file-preview">{shown}</pre>
        </div>
      </div>
    </div>
  );
}
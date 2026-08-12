import React, { useRef } from 'react';

export default function Toolbar({
  mode,
  setMode,
  store,
  doc,
  onFit,
  onReset,
  onGenerate,
  showInspector,
  toggleInspector,
}) {
  const fileRef = useRef(null);

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(doc, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'api-flow.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const importJson = (file) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        store.replace(JSON.parse(String(reader.result)));
      } catch (e) {
        alert('Could not read that file: ' + e.message);
      }
    };
    reader.readAsText(file);
  };

  return (
    <header className="toolbar">
      <div className="brand">
        <span className="dot" /> Flowgram
        <small>API design flow builder</small>
      </div>

      <div className="mode-switch" role="tablist">
        <button
          role="tab"
          aria-selected={mode === 'create'}
          className={mode === 'create' ? 'active' : ''}
          onClick={() => setMode('create')}
        >
          Create
        </button>
        <button
          role="tab"
          aria-selected={mode === 'view'}
          className={mode === 'view' ? 'active' : ''}
          onClick={() => setMode('view')}
        >
          View
        </button>
      </div>

      <div className="spacer" />

      <button onClick={store.undo} title="Ctrl+Z">Undo</button>
      <button onClick={store.redo} title="Ctrl+Shift+Z">Redo</button>
      <button onClick={onFit}>Fit</button>
      <button onClick={onReset}>100%</button>
      <button
        className={showInspector ? 'active' : ''}
        onClick={toggleInspector}
        title="Nodes are editable in place — this panel is optional"
      >
        Details
      </button>
      <button onClick={onGenerate} title="Scaffold a codebase from the flow diagram">
        Generate
      </button>
      <button onClick={exportJson}>Export</button>
      <button onClick={() => fileRef.current.click()}>Import</button>
      <button
        className="danger"
        onClick={() => {
          if (confirm('Clear the whole board?')) store.clear();
        }}
      >
        Clear
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="application/json"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) importJson(f);
          e.target.value = '';
        }}
      />
    </header>
  );
}

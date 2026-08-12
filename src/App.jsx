import React, { useCallback, useState } from 'react';
import Canvas from './components/Canvas.jsx';
import Inspector from './components/Inspector.jsx';
import Toolbar from './components/Toolbar.jsx';
import Palette from './components/Palette.jsx';
import { useFlowStore } from './hooks/useFlowStore.js';
import { bounds } from './lib/geometry.js';
import { DEFAULT_TYPE } from './lib/nodeTypes.js';

export default function App() {
  const store = useFlowStore();
  const { doc } = store;
  const [mode, setMode] = useState('create');
  const [selection, setSelection] = useState(null);
  const [view, setView] = useState({ x: 0, y: 0, zoom: 1 });
  const [activeType, setActiveType] = useState(DEFAULT_TYPE);
  const [showInspector, setShowInspector] = useState(false);

  const fit = useCallback(() => {
    const items = [...doc.nodes, ...(doc.containers || [])];
    if (!items.length) return setView({ x: 0, y: 0, zoom: 1 });
    const b = bounds(items, 60);
    const el = document.querySelector('.canvas');
    if (!el) return;
    const r = el.getBoundingClientRect();
    const zoom = Math.min(1.5, Math.min(r.width / b.w, r.height / b.h));
    setView({
      zoom,
      x: r.width / 2 - (b.x + b.w / 2) * zoom,
      y: r.height / 2 - (b.y + b.h / 2) * zoom,
    });
  }, [doc.nodes, doc.containers]);

  return (
    <div className="app">
      <Toolbar
        mode={mode}
        setMode={setMode}
        store={store}
        doc={doc}
        onFit={fit}
        onReset={() => setView({ x: 0, y: 0, zoom: 1 })}
        showInspector={showInspector}
        toggleInspector={() => setShowInspector((s) => !s)}
      />
      <div className="body">
        <Palette
          activeType={activeType}
          setActiveType={setActiveType}
          disabled={mode !== 'create'}
        />
        <Canvas
          doc={doc}
          store={store}
          mode={mode}
          selection={selection}
          setSelection={setSelection}
          view={view}
          setView={setView}
          activeType={activeType}
          setActiveType={setActiveType}
        />
        {showInspector && (
          <Inspector
            doc={doc}
            store={store}
            mode={mode}
            selection={selection}
            setSelection={setSelection}
          />
        )}
      </div>
    </div>
  );
}

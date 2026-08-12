import React from 'react';
import { RESIZE_HANDLES } from '../lib/geometry.js';

/**
 * Drag handles for a selected node or container.
 * `onStart(handle, event)` hands control back to the canvas.
 */
export default function ResizeHandles({ onStart, handles = RESIZE_HANDLES }) {
  return (
    <>
      {handles.map((h) => (
        <span
          key={h}
          className={`rz rz-${h}`}
          onPointerDown={(e) => {
            e.stopPropagation();
            onStart(h, e);
          }}
        />
      ))}
    </>
  );
}

import React, { useEffect, useLayoutEffect, useRef } from 'react';

/**
 * An auto-growing textarea that looks like plain text until you focus it.
 * Used for every editable piece of text drawn directly on a node.
 */
export default function InlineText({
  value,
  onChange,
  onCommit,
  placeholder,
  className = '',
  multiline = false,
  autoFocus = false,
  selectOnFocus = false,
  readOnly = false,
  onKeyDown,
}) {
  const ref = useRef(null);

  const resize = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${el.scrollHeight}px`;
  };

  useLayoutEffect(resize, [value]);

  useEffect(() => {
    if (!autoFocus || !ref.current) return;
    const el = ref.current;
    el.focus();
    if (selectOnFocus) el.select();
    else el.setSelectionRange(el.value.length, el.value.length);
  }, [autoFocus, selectOnFocus]);

  if (readOnly) {
    return (
      <div className={`inline-text is-static ${className} ${!value ? 'is-empty' : ''}`}>
        {value || placeholder}
      </div>
    );
  }

  return (
    <textarea
      ref={ref}
      rows={1}
      className={`inline-text ${className}`}
      value={value ?? ''}
      placeholder={placeholder}
      spellCheck={false}
      // keep canvas gestures from hijacking text selection / caret placement
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onChange={(e) => {
        onChange(multiline ? e.target.value : e.target.value.replace(/\n/g, ''));
        resize();
      }}
      onBlur={onCommit}
      onKeyDown={(e) => {
        if (!multiline && e.key === 'Enter') {
          e.preventDefault();
          e.currentTarget.blur();
        }
        if (e.key === 'Escape') {
          e.stopPropagation();
          e.currentTarget.blur();
        }
        onKeyDown?.(e);
      }}
    />
  );
}

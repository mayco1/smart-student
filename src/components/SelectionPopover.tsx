import { useState } from 'react';

export const HIGHLIGHT_COLORS = ['#fff59d', '#a5d6a7', '#90caf9', '#f48fb1'];

export function SelectionPopover({
  x,
  y,
  onTranslate,
  onHighlight,
  onExplain,
  onAddNote,
  onClose,
}: {
  x: number;
  y: number;
  onTranslate: () => void;
  onHighlight: (color: string) => void;
  onExplain: () => void;
  onAddNote: () => void;
  onClose: () => void;
}) {
  const [picking, setPicking] = useState(false);

  return (
    <div className="popover" style={{ left: x, top: y }} onMouseDown={(e) => e.stopPropagation()}>
      <button onClick={onTranslate}>Translate</button>
      <button onClick={() => setPicking((v) => !v)}>Highlight ▾</button>
      {picking && (
        <div className="swatches">
          {HIGHLIGHT_COLORS.map((c) => (
            <button
              key={c}
              className="swatch"
              style={{ background: c }}
              onClick={() => { setPicking(false); onHighlight(c); }}
              aria-label={`Highlight ${c}`}
            />
          ))}
        </div>
      )}
      <button onClick={onExplain}>Explain</button>
      <button onClick={onAddNote}>Add note</button>
      <button onClick={onClose} className="close">×</button>
    </div>
  );
}

import { useState } from 'react';

export function Toolbar({
  title,
  onTitleChange,
  onBack,
  onOpenSettings,
  onToggleNotes,
  zoom,
  canZoomIn,
  canZoomOut,
  onZoomIn,
  onZoomOut,
  onResetZoom,
}: {
  title: string;
  onTitleChange: (t: string) => void;
  onBack: () => void;
  onOpenSettings: () => void;
  onToggleNotes: () => void;
  zoom: number;
  canZoomIn: boolean;
  canZoomOut: boolean;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);

  return (
    <div className="toolbar">
      <button onClick={onBack}>← Library</button>
      {editing ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            setEditing(false);
            onTitleChange(draft.trim() || title);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
        />
      ) : (
        <h2 onClick={() => { setDraft(title); setEditing(true); }} title="Click to rename">
          {title}
        </h2>
      )}
      <div className="spacer" />
      <div className="zoom-controls">
        <button onClick={onZoomOut} disabled={!canZoomOut} title="Zoom out">−</button>
        <button onClick={onResetZoom} title="Reset zoom" className="zoom-readout">
          {Math.round(zoom * 100)}%
        </button>
        <button onClick={onZoomIn} disabled={!canZoomIn} title="Zoom in">+</button>
      </div>
      <button onClick={onToggleNotes}>Notes</button>
      <button onClick={onOpenSettings}>Settings</button>
    </div>
  );
}

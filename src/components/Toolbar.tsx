import { useState } from 'react';

export type ToolbarBookmark = {
  currentPage: number | null;
  bookmarkedPage: number | null;
  onBookmark: () => void;
  savedFlash?: boolean;
};

export type ToolbarBreadcrumb = {
  label: string;
  onClick: () => void;
};

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
  bookmark,
  breadcrumb,
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
  bookmark?: ToolbarBookmark;
  breadcrumb?: ToolbarBreadcrumb;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);

  return (
    <div className="toolbar">
      <button onClick={onBack}>← Library</button>
      {breadcrumb && (
        <button className="breadcrumb" onClick={breadcrumb.onClick} title="Back to collection">
          ↩ {breadcrumb.label}
        </button>
      )}
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
      {bookmark && (
        <button
          className="bookmark-btn"
          onClick={bookmark.onBookmark}
          title="Save current page to reading list"
        >
          {bookmark.savedFlash
            ? `✓ Saved page ${bookmark.currentPage ?? '?'}`
            : bookmark.bookmarkedPage != null
              ? `🔖 Bookmarked p.${bookmark.bookmarkedPage} — update`
              : '🔖 Bookmark current page'}
        </button>
      )}
      <button onClick={onToggleNotes}>Notes</button>
      <button onClick={onOpenSettings}>Settings</button>
    </div>
  );
}

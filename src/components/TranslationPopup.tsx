import { useEffect, useState } from 'react';

export function TranslationPopup({
  x,
  y,
  source,
  translation,
  loading,
  error,
  onRetranslate,
  onClose,
}: {
  x: number;
  y: number;
  source: string;
  translation: string;
  loading: boolean;
  error: string | null;
  onRetranslate: (newSource: string) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(source);

  useEffect(() => {
    setDraft(source);
  }, [source]);

  const dirty = draft !== source;

  return (
    <div className="translation-popup" style={{ left: x, top: y }} onMouseDown={(e) => e.stopPropagation()}>
      <div className="row">
        <strong>Translation</strong>
        <button className="close" onClick={onClose}>×</button>
      </div>
      <label className="src-label">Sent to Google (editable):</label>
      <textarea
        className="src-input"
        rows={2}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            if (draft.trim()) onRetranslate(draft);
          }
        }}
      />
      <div className="row">
        <button
          onClick={() => onRetranslate(draft)}
          disabled={loading || !draft.trim()}
        >
          {dirty ? 'Re-translate' : 'Translate again'}
        </button>
        {dirty && <span className="muted small">edited — press Re-translate or ⌘/Ctrl+Enter</span>}
      </div>
      {loading && <div className="muted">Translating…</div>}
      {error && <div className="error">{error}</div>}
      {!loading && !error && translation && (
        <div className="he" dir="rtl">{translation}</div>
      )}
    </div>
  );
}

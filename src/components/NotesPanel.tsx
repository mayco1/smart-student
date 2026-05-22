import { useEffect, useMemo, useRef, useState } from 'react';
import { deleteNote, listNotes, saveNote, uid, type Note } from '../db/db';

export function NotesPanel({
  articleId,
  refreshKey,
  onJumpToNote,
}: {
  articleId: string;
  refreshKey: number;
  onJumpToNote: (note: Note) => void;
}) {
  const [tab, setTab] = useState<'anchored' | 'pad'>('anchored');
  const [notes, setNotes] = useState<Note[]>([]);

  useEffect(() => {
    listNotes(articleId).then(setNotes);
  }, [articleId, refreshKey]);

  const anchored = useMemo(() => notes.filter((n) => n.anchor !== null), [notes]);
  const pad = useMemo(() => notes.find((n) => n.anchor === null) ?? null, [notes]);

  return (
    <aside className="notes-panel">
      <div className="tabs">
        <button className={tab === 'anchored' ? 'active' : ''} onClick={() => setTab('anchored')}>
          Anchored ({anchored.length})
        </button>
        <button className={tab === 'pad' ? 'active' : ''} onClick={() => setTab('pad')}>
          Thinking pad
        </button>
      </div>
      {tab === 'anchored' && (
        <div className="anchored-list">
          {anchored.length === 0 && <p className="muted">No notes yet. Select text and pick "Add note".</p>}
          {anchored.map((n) => (
            <div key={n.id} className="note-item" onClick={() => onJumpToNote(n)}>
              <div className="note-body">{n.body}</div>
              <button
                className="delete"
                onClick={async (e) => {
                  e.stopPropagation();
                  await deleteNote(n.id);
                  setNotes(await listNotes(articleId));
                }}
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
      {tab === 'pad' && (
        <ThinkingPad
          articleId={articleId}
          existing={pad}
          onSaved={async () => setNotes(await listNotes(articleId))}
        />
      )}
    </aside>
  );
}

function ThinkingPad({
  articleId,
  existing,
  onSaved,
}: {
  articleId: string;
  existing: Note | null;
  onSaved: () => void;
}) {
  const [text, setText] = useState(existing?.body ?? '');
  const timer = useRef<number | null>(null);

  useEffect(() => {
    setText(existing?.body ?? '');
  }, [existing?.id]);

  function onChange(v: string) {
    setText(v);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(async () => {
      const now = Date.now();
      const note: Note =
        existing
          ? { ...existing, body: v, updatedAt: now }
          : { id: uid(), articleId, anchor: null, body: v, createdAt: now, updatedAt: now };
      await saveNote(note);
      onSaved();
    }, 500);
  }

  return (
    <textarea
      className="thinking-pad"
      placeholder="General thoughts about this article…"
      value={text}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

import { useEffect, useState } from 'react';
import {
  deleteCollection,
  listCollections,
  listItems,
  saveCollection,
  uid,
  type Collection,
} from '../db/db';

export function Research({
  onBack,
  onOpenCollection,
}: {
  onBack: () => void;
  onOpenCollection: (collectionId: string) => void;
}) {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [newOpen, setNewOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');

  async function refresh() {
    const cs = await listCollections();
    setCollections(cs);
    const map: Record<string, number> = {};
    for (const c of cs) {
      const items = await listItems(c.id);
      map[c.id] = items.length;
    }
    setCounts(map);
  }

  useEffect(() => {
    refresh();
  }, []);

  async function onCreate() {
    const title = newTitle.trim();
    if (!title) return;
    const now = Date.now();
    const c: Collection = { id: uid(), title, createdAt: now, updatedAt: now };
    await saveCollection(c);
    setNewTitle('');
    setNewOpen(false);
    await refresh();
    onOpenCollection(c.id);
  }

  async function onDelete(c: Collection) {
    if (!confirm(`Delete collection "${c.title}"? Articles stay in your Library.`)) return;
    await deleteCollection(c.id);
    await refresh();
  }

  return (
    <div className="research">
      <header>
        <button onClick={onBack}>← Library</button>
        <h1>Research</h1>
        <div className="actions">
          <button onClick={() => setNewOpen(true)}>+ New collection</button>
        </div>
      </header>
      {collections.length === 0 ? (
        <p className="muted">
          No collections yet. Create one to group articles, brainstorm, and track what you still
          need to find.
        </p>
      ) : (
        <ul className="collection-grid">
          {collections.map((c) => (
            <li key={c.id} className="collection-card">
              <button className="open" onClick={() => onOpenCollection(c.id)}>
                <span className="title">{c.title}</span>
                <span className="meta">
                  {counts[c.id] ?? 0} article{(counts[c.id] ?? 0) === 1 ? '' : 's'} ·{' '}
                  updated {new Date(c.updatedAt).toLocaleDateString()}
                </span>
              </button>
              <button className="delete" onClick={() => onDelete(c)}>
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}

      {newOpen && (
        <div className="modal-backdrop" onClick={() => setNewOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>New collection</h3>
            <input
              autoFocus
              placeholder="Collection title (e.g. 'Cognitive biases')"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onCreate();
              }}
            />
            <div className="row">
              <button onClick={onCreate} disabled={!newTitle.trim()}>
                Create
              </button>
              <button onClick={() => setNewOpen(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

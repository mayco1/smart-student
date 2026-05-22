import { useEffect, useMemo, useState } from 'react';
import { listArticles, type Article } from '../db/db';

export function ArticlePickerModal({
  title,
  multi,
  excludeIds = [],
  onClose,
  onPick,
}: {
  title: string;
  multi: boolean;
  excludeIds?: string[];
  onClose: () => void;
  onPick: (articleIds: string[]) => void;
}) {
  const [articles, setArticles] = useState<Article[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');

  useEffect(() => {
    listArticles().then(setArticles);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const excl = new Set(excludeIds);
    return articles
      .filter((a) => !excl.has(a.id))
      .filter((a) => !q || a.title.toLowerCase().includes(q));
  }, [articles, query, excludeIds]);

  function toggle(id: string) {
    if (!multi) {
      onPick([id]);
      return;
    }
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal article-picker" onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        <input
          autoFocus
          placeholder="Filter by title…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {filtered.length === 0 ? (
          <p className="muted">No matching articles.</p>
        ) : (
          <ul className="picker-list">
            {filtered.map((a) => (
              <li key={a.id}>
                <label>
                  {multi && (
                    <input
                      type="checkbox"
                      checked={selected.has(a.id)}
                      onChange={() => toggle(a.id)}
                    />
                  )}
                  <span className="kind">{a.kind.toUpperCase()}</span>
                  <span className="title" onClick={() => !multi && toggle(a.id)}>
                    {a.title}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
        <div className="row">
          {multi && (
            <button disabled={selected.size === 0} onClick={() => onPick([...selected])}>
              Add {selected.size > 0 ? `(${selected.size})` : ''}
            </button>
          )}
          <button onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

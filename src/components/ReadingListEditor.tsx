import { useEffect, useMemo, useRef, useState } from 'react';
import {
  addItem,
  EMPTY_READING_LIST,
  getArticle,
  getCollectionNote,
  parseReadingList,
  saveCollectionNote,
  uid,
  type CollectionItem,
  type ReadingList,
  type ReadingStatus,
  type ToFindItem,
} from '../db/db';
import { ArticlePickerModal } from './ArticlePickerModal';

export function ReadingListEditor({
  collectionId,
  folderId,
  items,
  onItemsChanged,
}: {
  collectionId: string;
  folderId: string | null;
  items: CollectionItem[];
  onItemsChanged: () => void;
}) {
  const [list, setList] = useState<ReadingList>(EMPTY_READING_LIST);
  const [articleTitles, setArticleTitles] = useState<Record<string, string>>({});
  const [picker, setPicker] = useState<{ toFindId: string } | null>(null);
  const saveTimer = useRef<number | null>(null);
  const loadedRef = useRef(false);

  useEffect(() => {
    loadedRef.current = false;
    (async () => {
      const n = await getCollectionNote('collection-reading-list', collectionId, folderId);
      setList(n ? parseReadingList(n.body) : { ...EMPTY_READING_LIST });
      loadedRef.current = true;
    })();
  }, [collectionId, folderId]);

  // Look up titles for articles in this folder (and any found articles referenced in to-find).
  useEffect(() => {
    (async () => {
      const ids = new Set<string>([
        ...items.map((i) => i.articleId),
        ...list.toFind.filter((t) => t.foundArticleId).map((t) => t.foundArticleId!),
      ]);
      const map: Record<string, string> = {};
      for (const id of ids) {
        const a = await getArticle(id);
        if (a) map[id] = a.title;
      }
      setArticleTitles(map);
    })();
  }, [items, list.toFind]);

  function scheduleSave(next: ReadingList) {
    setList(next);
    if (!loadedRef.current) return;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(async () => {
      await saveCollectionNote(
        'collection-reading-list',
        collectionId,
        folderId,
        JSON.stringify(next),
      );
    }, 500);
  }

  // Derived view of in-collection rows: live items + persisted status (default 'unread'), stale rows pruned.
  const inCollectionView = useMemo(() => {
    const statusByArticle = new Map(list.inCollection.map((r) => [r.articleId, r.status]));
    return items.map((it) => ({
      item: it,
      status: statusByArticle.get(it.articleId) ?? ('unread' as ReadingStatus),
    }));
  }, [items, list.inCollection]);

  function setStatus(articleId: string, status: ReadingStatus) {
    const others = list.inCollection.filter((r) => r.articleId !== articleId);
    const liveIds = new Set(items.map((i) => i.articleId));
    const pruned = others.filter((r) => liveIds.has(r.articleId));
    scheduleSave({ ...list, inCollection: [...pruned, { articleId, status }] });
  }

  function addToFind() {
    const entry: ToFindItem = {
      id: uid(),
      title: '',
      status: 'not-found',
    };
    scheduleSave({ ...list, toFind: [...list.toFind, entry] });
  }

  function updateToFind(id: string, patch: Partial<ToFindItem>) {
    scheduleSave({
      ...list,
      toFind: list.toFind.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    });
  }

  function removeToFind(id: string) {
    scheduleSave({ ...list, toFind: list.toFind.filter((t) => t.id !== id) });
  }

  async function markFoundFromPick(toFindId: string, articleId: string) {
    setPicker(null);
    await addItem(collectionId, folderId, articleId);
    onItemsChanged();
    scheduleSave({
      ...list,
      toFind: list.toFind.map((t) =>
        t.id === toFindId ? { ...t, status: 'found', foundArticleId: articleId } : t,
      ),
    });
  }

  return (
    <div className="reading-list-editor">
      <section>
        <h4>In this folder</h4>
        {inCollectionView.length === 0 ? (
          <p className="muted">No articles in this folder yet.</p>
        ) : (
          <table className="rl-table">
            <thead>
              <tr>
                <th>Article</th>
                <th>Bookmark</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {inCollectionView.map(({ item, status }) => (
                <tr key={item.id}>
                  <td>{articleTitles[item.articleId] ?? '(loading…)'}</td>
                  <td className="bookmark-cell">
                    {item.bookmarkPage != null ? `page ${item.bookmarkPage}` : '—'}
                  </td>
                  <td>
                    <select
                      value={status}
                      onChange={(e) => setStatus(item.articleId, e.target.value as ReadingStatus)}
                    >
                      <option value="unread">Unread</option>
                      <option value="reading">Reading</option>
                      <option value="done">Done</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section>
        <div className="rl-section-head">
          <h4>To find</h4>
          <button onClick={addToFind}>+ Add</button>
        </div>
        {list.toFind.length === 0 ? (
          <p className="muted">Nothing on the wishlist yet.</p>
        ) : (
          <ul className="tofind-list">
            {list.toFind.map((t) => (
              <li key={t.id} className={t.status === 'found' ? 'found' : ''}>
                <div className="tofind-row">
                  <input
                    placeholder="Title or topic"
                    value={t.title}
                    onChange={(e) => updateToFind(t.id, { title: e.target.value })}
                  />
                  <input
                    placeholder="URL (optional)"
                    value={t.url ?? ''}
                    onChange={(e) => updateToFind(t.id, { url: e.target.value })}
                  />
                  {t.status === 'found' && t.foundArticleId ? (
                    <span className="found-tag">
                      ✓ {articleTitles[t.foundArticleId] ?? 'Added'}
                    </span>
                  ) : (
                    <button onClick={() => setPicker({ toFindId: t.id })}>Mark as found…</button>
                  )}
                  <button className="link-btn" onClick={() => removeToFind(t.id)}>
                    Remove
                  </button>
                </div>
                <textarea
                  rows={2}
                  placeholder="Notes (optional)"
                  value={t.notes ?? ''}
                  onChange={(e) => updateToFind(t.id, { notes: e.target.value })}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      {picker && (
        <ArticlePickerModal
          title="Mark as found — pick the article"
          multi={false}
          onClose={() => setPicker(null)}
          onPick={(ids) => ids[0] && markFoundFromPick(picker.toFindId, ids[0])}
        />
      )}
    </div>
  );
}


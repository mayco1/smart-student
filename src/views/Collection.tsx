import { useEffect, useMemo, useRef, useState } from 'react';
import {
  addItem,
  deleteCollection,
  deleteFolder,
  getArticle,
  getCollection,
  getCollectionNote,
  listFolders,
  listItems,
  removeItem,
  saveCollection,
  saveCollectionNote,
  saveFolder,
  uid,
  type Article,
  type Collection,
  type CollectionItem,
  type Folder,
} from '../db/db';
import { ArticlePickerModal } from '../components/ArticlePickerModal';
import { ReadingListEditor } from '../components/ReadingListEditor';

type Tab = 'articles' | 'notebook' | 'reading-list';

export function CollectionView({
  collectionId,
  folderId,
  onNavigateFolder,
  onOpenArticle,
  onBackToResearch,
}: {
  collectionId: string;
  folderId: string | null;
  onNavigateFolder: (folderId: string | null) => void;
  onOpenArticle: (articleId: string) => void;
  onBackToResearch: () => void;
}) {
  const [collection, setCollection] = useState<Collection | null>(null);
  const [allFolders, setAllFolders] = useState<Folder[]>([]);
  const [items, setItems] = useState<CollectionItem[]>([]);
  const [articleMap, setArticleMap] = useState<Record<string, Article>>({});
  const [tab, setTab] = useState<Tab>('articles');
  const [picker, setPicker] = useState(false);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderTitle, setNewFolderTitle] = useState('');
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');

  const [notebookBody, setNotebookBody] = useState('');
  const notebookSaveTimer = useRef<number | null>(null);
  const notebookLoadedRef = useRef(false);

  async function refresh() {
    const c = await getCollection(collectionId);
    setCollection(c ?? null);
    const fs = await listFolders(collectionId);
    setAllFolders(fs);
    const its = await listItems(collectionId);
    setItems(its);
    const ids = new Set(its.map((i) => i.articleId));
    const map: Record<string, Article> = {};
    for (const id of ids) {
      const a = await getArticle(id);
      if (a) map[id] = a;
    }
    setArticleMap(map);
  }

  useEffect(() => {
    refresh();
  }, [collectionId]);

  useEffect(() => {
    notebookLoadedRef.current = false;
    (async () => {
      const n = await getCollectionNote('collection-notebook', collectionId, folderId);
      setNotebookBody(n?.body ?? '');
      notebookLoadedRef.current = true;
    })();
  }, [collectionId, folderId]);

  const currentFolder = useMemo(
    () => (folderId ? allFolders.find((f) => f.id === folderId) ?? null : null),
    [folderId, allFolders],
  );

  const childFolders = useMemo(
    () => allFolders.filter((f) => (f.parentId ?? null) === folderId),
    [allFolders, folderId],
  );

  const itemsHere = useMemo(
    () => items.filter((i) => (i.folderId ?? null) === folderId),
    [items, folderId],
  );

  const excludeIds = useMemo(() => itemsHere.map((i) => i.articleId), [itemsHere]);

  // Breadcrumb chain (collection root → … → current folder)
  const breadcrumbs = useMemo(() => {
    const chain: { id: string | null; title: string }[] = [
      { id: null, title: collection?.title ?? '…' },
    ];
    if (!folderId) return chain;
    const byId = new Map(allFolders.map((f) => [f.id, f]));
    const stack: Folder[] = [];
    let cur: Folder | undefined = byId.get(folderId);
    while (cur) {
      stack.unshift(cur);
      cur = cur.parentId ? byId.get(cur.parentId) : undefined;
    }
    for (const f of stack) chain.push({ id: f.id, title: f.title });
    return chain;
  }, [collection, allFolders, folderId]);

  async function onAddPicked(articleIds: string[]) {
    setPicker(false);
    for (const id of articleIds) {
      await addItem(collectionId, folderId, id);
    }
    await refresh();
  }

  async function onCreateFolder() {
    const title = newFolderTitle.trim();
    if (!title) return;
    const f: Folder = {
      id: uid(),
      collectionId,
      parentId: folderId,
      title,
      createdAt: Date.now(),
    };
    await saveFolder(f);
    setNewFolderTitle('');
    setNewFolderOpen(false);
    await refresh();
  }

  async function onRemoveArticleItem(itemId: string) {
    await removeItem(itemId);
    await refresh();
  }

  async function onDeleteFolderHere(f: Folder) {
    if (!confirm(`Delete folder "${f.title}" and all its sub-folders? Articles stay in your Library.`))
      return;
    await deleteFolder(f.id);
    if (folderId === f.id) onNavigateFolder(f.parentId ?? null);
    else await refresh();
  }

  async function onRenameSubmit() {
    if (!collection && !currentFolder) return;
    const t = titleDraft.trim();
    setEditingTitle(false);
    if (!t) return;
    if (currentFolder) {
      const updated = { ...currentFolder, title: t };
      await saveFolder(updated);
    } else if (collection) {
      const updated = { ...collection, title: t, updatedAt: Date.now() };
      await saveCollection(updated);
    }
    await refresh();
  }

  async function onDeleteCurrent() {
    if (currentFolder) {
      await onDeleteFolderHere(currentFolder);
      return;
    }
    if (!collection) return;
    if (!confirm(`Delete the entire collection "${collection.title}"? Articles stay in your Library.`))
      return;
    await deleteCollection(collection.id);
    onBackToResearch();
  }

  function onNotebookChange(v: string) {
    setNotebookBody(v);
    if (!notebookLoadedRef.current) return;
    if (notebookSaveTimer.current) window.clearTimeout(notebookSaveTimer.current);
    notebookSaveTimer.current = window.setTimeout(async () => {
      await saveCollectionNote('collection-notebook', collectionId, folderId, v);
      if (collection) {
        await saveCollection({ ...collection, updatedAt: Date.now() });
      }
    }, 500);
  }

  if (!collection) return <div className="loading">Loading…</div>;

  const headingTitle = currentFolder ? currentFolder.title : collection.title;

  return (
    <div className="collection-view">
      <header className="collection-header">
        <button onClick={onBackToResearch}>← Research</button>
        <nav className="breadcrumbs">
          {breadcrumbs.map((b, i) => (
            <span key={b.id ?? 'root'}>
              {i > 0 && <span className="sep"> › </span>}
              {i === breadcrumbs.length - 1 ? (
                <strong>{b.title}</strong>
              ) : (
                <button className="link-btn" onClick={() => onNavigateFolder(b.id)}>
                  {b.title}
                </button>
              )}
            </span>
          ))}
        </nav>
        <div className="spacer" />
        {editingTitle ? (
          <input
            autoFocus
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={onRenameSubmit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            }}
          />
        ) : (
          <button
            className="link-btn"
            onClick={() => {
              setTitleDraft(headingTitle);
              setEditingTitle(true);
            }}
          >
            Rename
          </button>
        )}
        <button onClick={onDeleteCurrent}>Delete</button>
      </header>

      <div className="tabs">
        <button className={tab === 'articles' ? 'active' : ''} onClick={() => setTab('articles')}>
          Articles
        </button>
        <button className={tab === 'notebook' ? 'active' : ''} onClick={() => setTab('notebook')}>
          Notebook
        </button>
        <button
          className={tab === 'reading-list' ? 'active' : ''}
          onClick={() => setTab('reading-list')}
        >
          Reading list
        </button>
      </div>

      <div className="tab-body">
        {tab === 'articles' && (
          <div className="articles-tab">
            <div className="action-row">
              <button onClick={() => setNewFolderOpen(true)}>+ New folder</button>
              <button onClick={() => setPicker(true)}>+ Add article</button>
            </div>
            {childFolders.length === 0 && itemsHere.length === 0 ? (
              <p className="muted">Empty folder. Add an article or create a sub-folder.</p>
            ) : (
              <>
                {childFolders.length > 0 && (
                  <ul className="folder-list">
                    {childFolders.map((f) => (
                      <li key={f.id}>
                        <button className="folder-card" onClick={() => onNavigateFolder(f.id)}>
                          📁 {f.title}
                        </button>
                        <button className="link-btn" onClick={() => onDeleteFolderHere(f)}>
                          Delete
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {itemsHere.length > 0 && (
                  <ul className="collection-articles">
                    {itemsHere.map((it) => {
                      const a = articleMap[it.articleId];
                      return (
                        <li key={it.id}>
                          <button className="open" onClick={() => onOpenArticle(it.articleId)}>
                            <span className="kind">{a?.kind?.toUpperCase() ?? '...'}</span>
                            <span className="title">{a?.title ?? '(missing article)'}</span>
                            {it.bookmarkPage != null && (
                              <span className="bookmark-pill">🔖 p.{it.bookmarkPage}</span>
                            )}
                          </button>
                          <button className="link-btn" onClick={() => onRemoveArticleItem(it.id)}>
                            Remove
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </>
            )}
          </div>
        )}

        {tab === 'notebook' && (
          <div className="notebook-tab">
            <textarea
              className="collection-notebook"
              placeholder="Brainstorm, jot ideas, link thoughts across articles…"
              value={notebookBody}
              onChange={(e) => onNotebookChange(e.target.value)}
            />
          </div>
        )}

        {tab === 'reading-list' && (
          <div className="reading-list-tab">
            <ReadingListEditor
              collectionId={collectionId}
              folderId={folderId}
              items={itemsHere}
              onItemsChanged={refresh}
            />
          </div>
        )}
      </div>

      {picker && (
        <ArticlePickerModal
          title="Add articles to this folder"
          multi
          excludeIds={excludeIds}
          onClose={() => setPicker(false)}
          onPick={onAddPicked}
        />
      )}

      {newFolderOpen && (
        <div className="modal-backdrop" onClick={() => setNewFolderOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>New folder</h3>
            <input
              autoFocus
              placeholder="Folder name"
              value={newFolderTitle}
              onChange={(e) => setNewFolderTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onCreateFolder();
              }}
            />
            <div className="row">
              <button onClick={onCreateFolder} disabled={!newFolderTitle.trim()}>
                Create
              </button>
              <button onClick={() => setNewFolderOpen(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

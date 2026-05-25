import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

export type Anchor =
  | { kind: 'text'; charStart: number; charEnd: number }
  | { kind: 'pdf'; page: number; charStart: number; charEnd: number }
  | { kind: 'collection-notebook'; collectionId: string; folderId: string | null }
  | { kind: 'collection-reading-list'; collectionId: string; folderId: string | null };

export interface Article {
  id: string;
  title: string;
  kind: 'text' | 'pdf';
  text?: string;
  pdfBlob?: Blob;
  createdAt: number;
  lastOpenedAt: number;
}

export interface Highlight {
  id: string;
  articleId: string;
  anchor: Anchor;
  color: string;
  createdAt: number;
}

export interface Note {
  id: string;
  articleId: string;
  anchor: Anchor | null;
  body: string;
  createdAt: number;
  updatedAt: number;
}

export interface Collection {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
}

export interface Folder {
  id: string;
  collectionId: string;
  parentId: string | null;
  title: string;
  createdAt: number;
}

export interface CollectionItem {
  id: string;
  collectionId: string;
  folderId: string | null;
  articleId: string;
  bookmarkPage?: number;
  bookmarkUpdatedAt?: number;
  addedAt: number;
}

export type ReadingStatus = 'unread' | 'reading' | 'done';
export type ToFindStatus = 'not-found' | 'found';

export interface ReadingListInItem {
  articleId: string;
  status: ReadingStatus;
}
export interface ToFindItem {
  id: string;
  title: string;
  url?: string;
  notes?: string;
  status: ToFindStatus;
  foundArticleId?: string;
}
export interface ReadingList {
  inCollection: ReadingListInItem[];
  toFind: ToFindItem[];
}

interface ReaderDB extends DBSchema {
  articles: { key: string; value: Article };
  highlights: { key: string; value: Highlight; indexes: { 'by-article': string } };
  notes: { key: string; value: Note; indexes: { 'by-article': string } };
  settings: { key: string; value: { key: string; value: string } };
  collections: { key: string; value: Collection };
  folders: {
    key: string;
    value: Folder;
    indexes: { 'by-collection': string; 'by-parent': string };
  };
  collectionItems: {
    key: string;
    value: CollectionItem;
    indexes: { 'by-collection': string; 'by-folder': string; 'by-article': string };
  };
}

let dbPromise: Promise<IDBPDatabase<ReaderDB>> | null = null;

export function getDB() {
  if (!dbPromise) {
    dbPromise = openDB<ReaderDB>('reader-app', 2, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          db.createObjectStore('articles', { keyPath: 'id' });
          const h = db.createObjectStore('highlights', { keyPath: 'id' });
          h.createIndex('by-article', 'articleId');
          const n = db.createObjectStore('notes', { keyPath: 'id' });
          n.createIndex('by-article', 'articleId');
          db.createObjectStore('settings', { keyPath: 'key' });
        }
        if (oldVersion < 2) {
          db.createObjectStore('collections', { keyPath: 'id' });
          const f = db.createObjectStore('folders', { keyPath: 'id' });
          f.createIndex('by-collection', 'collectionId');
          f.createIndex('by-parent', 'parentId');
          const ci = db.createObjectStore('collectionItems', { keyPath: 'id' });
          ci.createIndex('by-collection', 'collectionId');
          ci.createIndex('by-folder', 'folderId');
          ci.createIndex('by-article', 'articleId');
        }
      },
    });
  }
  return dbPromise;
}

export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export async function listArticles(): Promise<Article[]> {
  const db = await getDB();
  const all = await db.getAll('articles');
  return all.sort((a, b) => b.lastOpenedAt - a.lastOpenedAt);
}

export async function getArticle(id: string) {
  return (await getDB()).get('articles', id);
}

export async function saveArticle(a: Article) {
  await (await getDB()).put('articles', a);
}

export async function deleteArticle(id: string) {
  const db = await getDB();
  await db.delete('articles', id);
  const hs = await db.getAllFromIndex('highlights', 'by-article', id);
  const ns = await db.getAllFromIndex('notes', 'by-article', id);
  const items = await db.getAllFromIndex('collectionItems', 'by-article', id);
  const tx = db.transaction(['highlights', 'notes', 'collectionItems'], 'readwrite');
  for (const h of hs) await tx.objectStore('highlights').delete(h.id);
  for (const n of ns) await tx.objectStore('notes').delete(n.id);
  for (const it of items) await tx.objectStore('collectionItems').delete(it.id);
  await tx.done;
}

export async function listHighlights(articleId: string) {
  return (await getDB()).getAllFromIndex('highlights', 'by-article', articleId);
}

export async function saveHighlight(h: Highlight) {
  await (await getDB()).put('highlights', h);
}

export async function deleteHighlight(id: string) {
  await (await getDB()).delete('highlights', id);
}

export async function listNotes(articleId: string) {
  return (await getDB()).getAllFromIndex('notes', 'by-article', articleId);
}

export async function saveNote(n: Note) {
  await (await getDB()).put('notes', n);
}

export async function deleteNote(id: string) {
  await (await getDB()).delete('notes', id);
}

export async function getSetting(key: string): Promise<string | undefined> {
  const row = await (await getDB()).get('settings', key);
  return row?.value;
}

export async function setSetting(key: string, value: string) {
  await (await getDB()).put('settings', { key, value });
}

// ---------- Collections ----------

export async function listCollections(): Promise<Collection[]> {
  const all = await (await getDB()).getAll('collections');
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getCollection(id: string) {
  return (await getDB()).get('collections', id);
}

export async function saveCollection(c: Collection) {
  await (await getDB()).put('collections', c);
}

export async function deleteCollection(id: string) {
  const db = await getDB();
  const folders = await db.getAllFromIndex('folders', 'by-collection', id);
  const items = await db.getAllFromIndex('collectionItems', 'by-collection', id);

  // Notes whose synthetic articleId belongs to this collection or any of its folders.
  const syntheticIds = new Set<string>([
    `collection:${id}`,
    ...folders.map((f) => `folder:${f.id}`),
  ]);
  const allNotes = await db.getAll('notes');
  const noteIdsToDelete = allNotes
    .filter((n) => syntheticIds.has(n.articleId))
    .map((n) => n.id);

  const tx = db.transaction(['collections', 'folders', 'collectionItems', 'notes'], 'readwrite');
  await tx.objectStore('collections').delete(id);
  for (const f of folders) await tx.objectStore('folders').delete(f.id);
  for (const it of items) await tx.objectStore('collectionItems').delete(it.id);
  for (const nid of noteIdsToDelete) await tx.objectStore('notes').delete(nid);
  await tx.done;
}

export async function listFolders(collectionId: string): Promise<Folder[]> {
  return (await getDB()).getAllFromIndex('folders', 'by-collection', collectionId);
}

export async function getFolder(id: string) {
  return (await getDB()).get('folders', id);
}

export async function saveFolder(f: Folder) {
  await (await getDB()).put('folders', f);
}

/** Recursively delete a folder, its descendant folders, their items, and their notebook/reading-list notes. */
export async function deleteFolder(id: string) {
  const db = await getDB();
  const all = await db.getAllFromIndex('folders', 'by-collection', (await db.get('folders', id))?.collectionId ?? '');
  const toDelete = new Set<string>();
  const collect = (fid: string) => {
    toDelete.add(fid);
    for (const child of all.filter((f) => f.parentId === fid)) collect(child.id);
  };
  collect(id);

  const itemsAll: CollectionItem[] = [];
  for (const fid of toDelete) {
    const its = await db.getAllFromIndex('collectionItems', 'by-folder', fid);
    itemsAll.push(...its);
  }
  const syntheticIds = new Set([...toDelete].map((fid) => `folder:${fid}`));
  const allNotes = await db.getAll('notes');
  const noteIdsToDelete = allNotes
    .filter((n) => syntheticIds.has(n.articleId))
    .map((n) => n.id);

  const tx = db.transaction(['folders', 'collectionItems', 'notes'], 'readwrite');
  for (const fid of toDelete) await tx.objectStore('folders').delete(fid);
  for (const it of itemsAll) await tx.objectStore('collectionItems').delete(it.id);
  for (const nid of noteIdsToDelete) await tx.objectStore('notes').delete(nid);
  await tx.done;
}

export async function listItems(collectionId: string): Promise<CollectionItem[]> {
  return (await getDB()).getAllFromIndex('collectionItems', 'by-collection', collectionId);
}

export async function listItemsInFolder(
  collectionId: string,
  folderId: string | null,
): Promise<CollectionItem[]> {
  const all = await listItems(collectionId);
  return all.filter((i) => (i.folderId ?? null) === folderId);
}

export async function addItem(
  collectionId: string,
  folderId: string | null,
  articleId: string,
): Promise<CollectionItem | null> {
  const existing = await listItems(collectionId);
  if (existing.some((i) => i.articleId === articleId && (i.folderId ?? null) === folderId)) {
    return null;
  }
  const item: CollectionItem = {
    id: uid(),
    collectionId,
    folderId,
    articleId,
    addedAt: Date.now(),
  };
  await (await getDB()).put('collectionItems', item);
  return item;
}

export async function removeItem(itemId: string) {
  await (await getDB()).delete('collectionItems', itemId);
}

export async function updateItemBookmark(itemId: string, page: number) {
  const db = await getDB();
  const item = await db.get('collectionItems', itemId);
  if (!item) return;
  item.bookmarkPage = page;
  item.bookmarkUpdatedAt = Date.now();
  await db.put('collectionItems', item);
}

export async function findItem(
  collectionId: string,
  folderId: string | null,
  articleId: string,
): Promise<CollectionItem | undefined> {
  const all = await listItems(collectionId);
  return all.find((i) => i.articleId === articleId && (i.folderId ?? null) === folderId);
}

// ---------- Collection-scoped notes (notebook & reading list) ----------

function syntheticArticleId(collectionId: string, folderId: string | null): string {
  return folderId ? `folder:${folderId}` : `collection:${collectionId}`;
}

export async function getCollectionNote(
  kind: 'collection-notebook' | 'collection-reading-list',
  collectionId: string,
  folderId: string | null,
): Promise<Note | undefined> {
  const synth = syntheticArticleId(collectionId, folderId);
  const notes = await (await getDB()).getAllFromIndex('notes', 'by-article', synth);
  return notes.find(
    (n) =>
      n.anchor !== null &&
      n.anchor.kind === kind &&
      n.anchor.collectionId === collectionId &&
      (n.anchor.folderId ?? null) === folderId,
  );
}

export async function saveCollectionNote(
  kind: 'collection-notebook' | 'collection-reading-list',
  collectionId: string,
  folderId: string | null,
  body: string,
): Promise<Note> {
  const existing = await getCollectionNote(kind, collectionId, folderId);
  const now = Date.now();
  const note: Note = existing
    ? { ...existing, body, updatedAt: now }
    : {
        id: uid(),
        articleId: syntheticArticleId(collectionId, folderId),
        anchor: { kind, collectionId, folderId },
        body,
        createdAt: now,
        updatedAt: now,
      };
  await (await getDB()).put('notes', note);
  return note;
}

export const EMPTY_READING_LIST: ReadingList = { inCollection: [], toFind: [] };

export function parseReadingList(body: string): ReadingList {
  if (!body.trim()) return { ...EMPTY_READING_LIST };
  try {
    const parsed = JSON.parse(body);
    return {
      inCollection: Array.isArray(parsed?.inCollection) ? parsed.inCollection : [],
      toFind: Array.isArray(parsed?.toFind) ? parsed.toFind : [],
    };
  } catch {
    return { ...EMPTY_READING_LIST };
  }
}

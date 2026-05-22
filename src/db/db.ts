import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

export type Anchor =
  | { kind: 'text'; charStart: number; charEnd: number }
  | { kind: 'pdf'; page: number; charStart: number; charEnd: number };

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

interface ReaderDB extends DBSchema {
  articles: { key: string; value: Article };
  highlights: { key: string; value: Highlight; indexes: { 'by-article': string } };
  notes: { key: string; value: Note; indexes: { 'by-article': string } };
  settings: { key: string; value: { key: string; value: string } };
}

let dbPromise: Promise<IDBPDatabase<ReaderDB>> | null = null;

export function getDB() {
  if (!dbPromise) {
    dbPromise = openDB<ReaderDB>('reader-app', 1, {
      upgrade(db) {
        db.createObjectStore('articles', { keyPath: 'id' });
        const h = db.createObjectStore('highlights', { keyPath: 'id' });
        h.createIndex('by-article', 'articleId');
        const n = db.createObjectStore('notes', { keyPath: 'id' });
        n.createIndex('by-article', 'articleId');
        db.createObjectStore('settings', { keyPath: 'key' });
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
  const tx = db.transaction(['highlights', 'notes'], 'readwrite');
  for (const h of hs) await tx.objectStore('highlights').delete(h.id);
  for (const n of ns) await tx.objectStore('notes').delete(n.id);
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

import { useEffect, useRef, useState } from 'react';
import { deleteArticle, listArticles, saveArticle, uid, type Article } from '../db/db';

export function Library({
  onOpen,
  onOpenResearch,
}: {
  onOpen: (id: string) => void;
  onOpenResearch: () => void;
}) {
  const [articles, setArticles] = useState<Article[]>([]);
  const [showPaste, setShowPaste] = useState(false);
  const fileTxtRef = useRef<HTMLInputElement>(null);
  const filePdfRef = useRef<HTMLInputElement>(null);

  async function refresh() {
    setArticles(await listArticles());
  }

  useEffect(() => {
    refresh();
  }, []);

  async function addText(title: string, text: string) {
    const now = Date.now();
    await saveArticle({
      id: uid(),
      title: title || 'Untitled',
      kind: 'text',
      text,
      createdAt: now,
      lastOpenedAt: now,
    });
    await refresh();
  }

  async function addPdf(file: File) {
    const now = Date.now();
    await saveArticle({
      id: uid(),
      title: file.name.replace(/\.pdf$/i, ''),
      kind: 'pdf',
      pdfBlob: file,
      createdAt: now,
      lastOpenedAt: now,
    });
    await refresh();
  }

  return (
    <div className="library">
      <header>
        <h1>Reader</h1>
        <div className="actions">
          <button onClick={onOpenResearch}>Research</button>
          <button onClick={() => setShowPaste(true)}>Paste text</button>
          <button onClick={() => fileTxtRef.current?.click()}>Upload .txt</button>
          <button onClick={() => filePdfRef.current?.click()}>Upload .pdf</button>
          <input
            ref={fileTxtRef}
            type="file"
            accept=".txt,text/plain"
            style={{ display: 'none' }}
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              const text = await f.text();
              await addText(f.name.replace(/\.txt$/i, ''), text);
              e.target.value = '';
            }}
          />
          <input
            ref={filePdfRef}
            type="file"
            accept="application/pdf,.pdf"
            style={{ display: 'none' }}
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              await addPdf(f);
              e.target.value = '';
            }}
          />
        </div>
      </header>
      {articles.length === 0 ? (
        <p className="muted">No articles yet. Import one to get started.</p>
      ) : (
        <ul className="article-list">
          {articles.map((a) => (
            <li key={a.id}>
              <button className="open" onClick={() => onOpen(a.id)}>
                <span className="kind">{a.kind.toUpperCase()}</span>
                <span className="title">{a.title}</span>
                <span className="date">{new Date(a.lastOpenedAt).toLocaleString()}</span>
              </button>
              <button
                className="delete"
                onClick={async () => {
                  if (confirm(`Delete "${a.title}"?`)) {
                    await deleteArticle(a.id);
                    await refresh();
                  }
                }}
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
      {showPaste && (
        <PasteModal onClose={() => setShowPaste(false)} onSave={async (t, b) => { await addText(t, b); setShowPaste(false); }} />
      )}
    </div>
  );
}

function PasteModal({ onClose, onSave }: { onClose: () => void; onSave: (title: string, body: string) => void }) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Paste article text</h3>
        <input placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
        <textarea
          placeholder="Paste the article text here…"
          rows={14}
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <div className="row">
          <button onClick={() => onSave(title, body)} disabled={!body.trim()}>Save</button>
          <button onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

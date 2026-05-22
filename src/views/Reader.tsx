import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  deleteHighlight,
  getArticle,
  listHighlights,
  listNotes,
  saveArticle,
  saveHighlight,
  saveNote,
  uid,
  type Anchor,
  type Article,
  type Highlight,
  type Note,
} from '../db/db';
import { Toolbar } from '../components/Toolbar';
import { SelectionPopover } from '../components/SelectionPopover';
import { TranslationPopup } from '../components/TranslationPopup';
import { NotesPanel } from '../components/NotesPanel';
import { SettingsModal } from '../components/SettingsModal';
import { TextReader, type TextReaderHandle } from '../readers/TextReader';
import { PdfReader, type PdfReaderHandle } from '../readers/PdfReader';
import { getTextOffsetsWithinRoot, pdfAnchor, textAnchor } from '../utils/ranges';
import { translateToHebrew, TranslateError } from '../services/translate';
import { ExplainPanel } from '../components/ExplainPanel';

type ActiveSelection = {
  text: string;
  anchor: Anchor;
  x: number;
  y: number;
};

export function Reader({ articleId, onBack }: { articleId: string; onBack: () => void }) {
  const [article, setArticle] = useState<Article | null>(null);
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [showNotes, setShowNotes] = useState(true);
  const [zoom, setZoom] = useState(1);

  const [active, setActive] = useState<ActiveSelection | null>(null);
  const [translation, setTranslation] = useState<{ x: number; y: number; src: string; he: string; loading: boolean; error: string | null } | null>(null);
  const [noteDraft, setNoteDraft] = useState<{ anchor: Anchor; x: number; y: number; body: string } | null>(null);
  const [hlMenu, setHlMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [explainState, setExplainState] = useState<{
    anchor: Anchor;
    passage: string;
    article: string;
    absStart: number;
    absEnd: number;
  } | null>(null);

  const textRef = useRef<TextReaderHandle>(null);
  const pdfRef = useRef<PdfReaderHandle>(null);

  useEffect(() => {
    (async () => {
      const a = await getArticle(articleId);
      if (!a) return;
      a.lastOpenedAt = Date.now();
      await saveArticle(a);
      setArticle(a);
      setHighlights(await listHighlights(a.id));
      setNotes(await listNotes(a.id));
    })();
  }, [articleId]);

  const anchoredNotes = useMemo(() => notes.filter((n) => n.anchor !== null), [notes]);

  const refreshHighlights = useCallback(async () => {
    if (!article) return;
    setHighlights(await listHighlights(article.id));
  }, [article]);

  const refreshNotes = useCallback(async () => {
    if (!article) return;
    setNotes(await listNotes(article.id));
    setRefreshKey((k) => k + 1);
  }, [article]);

  function getRootForArticle(): HTMLElement | null {
    if (!article) return null;
    return article.kind === 'text' ? textRef.current?.getRoot() ?? null : pdfRef.current?.getRoot() ?? null;
  }

  function computeAnchorFromSelection(sel: Selection): { anchor: Anchor; text: string; rect: DOMRect } | null {
    if (!article || sel.rangeCount === 0) return null;
    const range = sel.getRangeAt(0);
    if (range.collapsed) return null;
    const text = sel.toString();
    if (!text.trim()) return null;

    if (article.kind === 'text') {
      const root = textRef.current?.getRoot();
      if (!root) return null;
      const off = getTextOffsetsWithinRoot(root, range);
      if (!off) return null;
      return { anchor: textAnchor(off.start, off.end), text, rect: range.getBoundingClientRect() };
    } else {
      let node: Node | null = range.commonAncestorContainer;
      let layer: HTMLElement | null = null;
      while (node) {
        if (node instanceof HTMLElement && node.classList.contains('pdf-text-layer')) {
          layer = node;
          break;
        }
        node = node.parentNode;
      }
      if (!layer) return null;
      const page = Number(layer.dataset.page);
      const off = getTextOffsetsWithinRoot(layer, range);
      if (!off) return null;
      return { anchor: pdfAnchor(page, off.start, off.end), text, rect: range.getBoundingClientRect() };
    }
  }

  useEffect(() => {
    function onMouseUp() {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) return;
      const root = getRootForArticle();
      if (!root) return;
      if (!root.contains(sel.anchorNode) || !root.contains(sel.focusNode)) return;
      const r = computeAnchorFromSelection(sel);
      if (!r) return;
      setActive({
        text: r.text,
        anchor: r.anchor,
        x: r.rect.left + window.scrollX + r.rect.width / 2,
        y: r.rect.top + window.scrollY - 8,
      });
    }
    function onMouseDown(e: MouseEvent) {
      const t = e.target as HTMLElement;
      if (
        t.closest('.popover') ||
        t.closest('.translation-popup') ||
        t.closest('.note-draft') ||
        t.closest('.hl-popover')
      ) return;
      setActive(null);
      setHlMenu(null);
    }
    function onClick(e: MouseEvent) {
      const t = e.target as HTMLElement;
      const hl = t.closest<HTMLElement>('.hl');
      const sel = window.getSelection();
      if (hl && (!sel || sel.isCollapsed) && hl.dataset.hlId) {
        const rect = hl.getBoundingClientRect();
        setHlMenu({
          id: hl.dataset.hlId,
          x: rect.left + window.scrollX + rect.width / 2,
          y: rect.top + window.scrollY - 6,
        });
      }
    }
    document.addEventListener('mouseup', onMouseUp);
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('click', onClick);
    return () => {
      document.removeEventListener('mouseup', onMouseUp);
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('click', onClick);
    };
  }, [article]);

  async function runTranslate(text: string, pos: { x: number; y: number }) {
    setTranslation({ x: pos.x, y: pos.y, src: text, he: '', loading: true, error: null });
    try {
      const he = await translateToHebrew(text);
      setTranslation((t) => (t ? { ...t, src: text, he, loading: false } : t));
    } catch (e) {
      const msg = e instanceof TranslateError ? e.message : 'Translation failed.';
      setTranslation((t) => (t ? { ...t, src: text, loading: false, error: msg } : t));
    }
  }

  async function doTranslate() {
    if (!active) return;
    const pos = { x: active.x, y: active.y + 24 };
    const text = active.text;
    setActive(null);
    window.getSelection()?.removeAllRanges();
    await runTranslate(text, pos);
  }

  async function doRetranslate(newSource: string) {
    if (!translation) return;
    await runTranslate(newSource, { x: translation.x, y: translation.y });
  }

  async function doHighlight(color: string) {
    if (!article || !active) return;
    const h: Highlight = {
      id: uid(),
      articleId: article.id,
      anchor: active.anchor,
      color,
      createdAt: Date.now(),
    };
    await saveHighlight(h);
    setActive(null);
    window.getSelection()?.removeAllRanges();
    await refreshHighlights();
  }

  function startNote() {
    if (!active) return;
    setNoteDraft({ anchor: active.anchor, x: active.x, y: active.y + 24, body: '' });
    setActive(null);
  }

  function startExplain() {
    if (!article || !active) return;
    const ctx =
      article.kind === 'text'
        ? textRef.current?.getArticleContext(active.anchor)
        : pdfRef.current?.getArticleContext(active.anchor);
    if (!ctx) return;
    setExplainState({
      anchor: active.anchor,
      passage: active.text,
      article: ctx.article,
      absStart: ctx.absStart,
      absEnd: ctx.absEnd,
    });
    setActive(null);
    window.getSelection()?.removeAllRanges();
  }

  async function saveExplainAsNote(body: string) {
    if (!article || !explainState) return;
    const now = Date.now();
    await saveNote({
      id: uid(),
      articleId: article.id,
      anchor: explainState.anchor,
      body,
      createdAt: now,
      updatedAt: now,
    });
    await refreshNotes();
  }

  async function saveNoteDraft() {
    if (!article || !noteDraft || !noteDraft.body.trim()) return;
    const now = Date.now();
    const n: Note = {
      id: uid(),
      articleId: article.id,
      anchor: noteDraft.anchor,
      body: noteDraft.body.trim(),
      createdAt: now,
      updatedAt: now,
    };
    await saveNote(n);
    setNoteDraft(null);
    window.getSelection()?.removeAllRanges();
    await refreshNotes();
  }

  function onJumpToNote(n: Note) {
    if (!n.anchor) return;
    if (n.anchor.kind === 'text') {
      textRef.current?.scrollToOffset(n.anchor.charStart);
    } else {
      pdfRef.current?.scrollToPage(n.anchor.page);
    }
  }

  const zoomLevels = [0.75, 0.9, 1.0, 1.15, 1.3, 1.5, 1.75, 2.0];
  const zoomIndex = zoomLevels.findIndex((z) => Math.abs(z - zoom) < 0.001);
  const currentIdx = zoomIndex === -1 ? zoomLevels.findIndex((z) => z >= zoom) : zoomIndex;
  const canZoomIn = currentIdx < zoomLevels.length - 1;
  const canZoomOut = currentIdx > 0;

  if (!article) return <div className="loading">Loading…</div>;

  return (
    <div className="reader">
      <Toolbar
        title={article.title}
        onTitleChange={async (t) => {
          const updated = { ...article, title: t };
          setArticle(updated);
          await saveArticle(updated);
        }}
        onBack={onBack}
        onOpenSettings={() => setShowSettings(true)}
        onToggleNotes={() => setShowNotes((v) => !v)}
        zoom={zoom}
        canZoomIn={canZoomIn}
        canZoomOut={canZoomOut}
        onZoomIn={() => canZoomIn && setZoom(zoomLevels[currentIdx + 1])}
        onZoomOut={() => canZoomOut && setZoom(zoomLevels[currentIdx - 1])}
        onResetZoom={() => setZoom(1)}
      />
      <div className={`reader-body ${showNotes ? 'with-notes' : ''}`}>
        <div className="article-pane">
          {article.kind === 'text' ? (
            <TextReader ref={textRef} article={article} highlights={highlights} anchoredNotes={anchoredNotes} zoom={zoom} />
          ) : (
            <PdfReader ref={pdfRef} article={article} highlights={highlights} anchoredNotes={anchoredNotes} zoom={zoom} />
          )}
        </div>
        {showNotes && (
          <NotesPanel articleId={article.id} refreshKey={refreshKey} onJumpToNote={onJumpToNote} />
        )}
      </div>

      {active && (
        <SelectionPopover
          x={active.x}
          y={active.y}
          onTranslate={doTranslate}
          onHighlight={doHighlight}
          onExplain={startExplain}
          onAddNote={startNote}
          onClose={() => setActive(null)}
        />
      )}
      {explainState && (
        <ExplainPanel
          article={explainState.article}
          absStart={explainState.absStart}
          absEnd={explainState.absEnd}
          passage={explainState.passage}
          onSaveAsNote={saveExplainAsNote}
          onClose={() => setExplainState(null)}
        />
      )}
      {translation && (
        <TranslationPopup
          x={translation.x}
          y={translation.y}
          source={translation.src}
          translation={translation.he}
          loading={translation.loading}
          error={translation.error}
          onRetranslate={doRetranslate}
          onClose={() => setTranslation(null)}
        />
      )}
      {noteDraft && (
        <div className="note-draft" style={{ left: noteDraft.x, top: noteDraft.y }} onMouseDown={(e) => e.stopPropagation()}>
          <textarea
            autoFocus
            placeholder="Your note…"
            value={noteDraft.body}
            onChange={(e) => setNoteDraft({ ...noteDraft, body: e.target.value })}
          />
          <div className="row">
            <button onClick={saveNoteDraft} disabled={!noteDraft.body.trim()}>Save</button>
            <button onClick={() => setNoteDraft(null)}>Cancel</button>
          </div>
        </div>
      )}
      {hlMenu && (
        <div className="hl-popover" style={{ left: hlMenu.x, top: hlMenu.y }} onMouseDown={(e) => e.stopPropagation()}>
          <button
            onClick={async () => {
              await deleteHighlight(hlMenu.id);
              setHlMenu(null);
              await refreshHighlights();
            }}
          >
            Remove highlight
          </button>
        </div>
      )}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </div>
  );
}

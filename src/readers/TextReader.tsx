import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import type { Anchor, Article, Highlight, Note } from '../db/db';
import { paintRange, rangeFromOffsets } from '../utils/ranges';

export type TextReaderHandle = {
  /** Root element for the article text content. */
  getRoot: () => HTMLElement | null;
  /** Map a selection range to {charStart, charEnd} within the article text. */
  scrollToOffset: (start: number) => void;
  /** Full article text plus absolute offsets of the given anchor. */
  getArticleContext: (anchor: Anchor) => { article: string; absStart: number; absEnd: number } | null;
};

export const TextReader = forwardRef<TextReaderHandle, {
  article: Article;
  highlights: Highlight[];
  anchoredNotes: Note[];
  zoom?: number;
}>(function TextReader({ article, highlights, anchoredNotes, zoom = 1 }, ref) {
  const rootRef = useRef<HTMLDivElement | null>(null);

  useImperativeHandle(ref, () => ({
    getRoot: () => rootRef.current,
    scrollToOffset: (start: number) => {
      const root = rootRef.current;
      if (!root) return;
      const r = rangeFromOffsets(root, start, start + 1);
      if (!r) return;
      const rect = r.getBoundingClientRect();
      const containerRect = root.getBoundingClientRect();
      root.parentElement?.scrollBy({
        top: rect.top - containerRect.top - 100,
        behavior: 'smooth',
      });
    },
    getArticleContext: (anchor) => {
      if (anchor.kind !== 'text') return null;
      const text = article.text ?? '';
      return { article: text, absStart: anchor.charStart, absEnd: anchor.charEnd };
    },
  }));

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    root.textContent = article.text ?? '';

    for (const h of highlights) {
      if (h.anchor.kind !== 'text') continue;
      const r = rangeFromOffsets(root, h.anchor.charStart, h.anchor.charEnd);
      if (r) paintRange(r, 'hl', { backgroundColor: h.color }, { hlId: h.id });
    }
    for (const n of anchoredNotes) {
      if (!n.anchor || n.anchor.kind !== 'text') continue;
      const r = rangeFromOffsets(root, n.anchor.charStart, n.anchor.charEnd);
      if (r) paintRange(r, 'note-anchor', {}, { noteId: n.id });
    }
  }, [article.id, article.text, highlights, anchoredNotes]);

  return <div ref={rootRef} className="article-text" style={{ fontSize: `${17 * zoom}px` }} />;
});

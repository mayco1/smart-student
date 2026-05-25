import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
// @ts-ignore - vite ?url import for worker
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { Anchor, Article, Highlight, Note } from '../db/db';
import { paintRange, rangeFromOffsets } from '../utils/ranges';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

const PAGE_SEPARATOR = '\n\n';

export type PdfReaderHandle = {
  getRoot: () => HTMLElement | null;
  /** Get the text-layer element for a given (1-based) page. */
  getPageTextLayer: (page: number) => HTMLElement | null;
  scrollToPage: (page: number) => void;
  /** The page (1-based) currently most visible in the viewport, or null if unknown. */
  getCurrentPage: () => number | null;
  /** Concatenate all rendered pages' text-layer text and compute absolute offsets for the given pdf anchor. */
  getArticleContext: (anchor: Anchor) => { article: string; absStart: number; absEnd: number } | null;
};

export const PdfReader = forwardRef<PdfReaderHandle, {
  article: Article;
  highlights: Highlight[];
  anchoredNotes: Note[];
  zoom?: number;
}>(function PdfReader({ article, highlights, anchoredNotes, zoom = 1 }, ref) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const pageRefs = useRef<Map<number, HTMLElement>>(new Map());
  const visibleRatios = useRef<Map<number, number>>(new Map());
  const currentPageRef = useRef<number | null>(null);
  const [renderedPages, setRenderedPages] = useState(0);

  useImperativeHandle(ref, () => ({
    getRoot: () => rootRef.current,
    getPageTextLayer: (page: number) => pageRefs.current.get(page) ?? null,
    scrollToPage: (page: number) => {
      const el = pageRefs.current.get(page);
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    },
    getCurrentPage: () => currentPageRef.current,
    getArticleContext: (anchor) => {
      if (anchor.kind !== 'pdf') return null;
      const pages = [...pageRefs.current.entries()].sort((a, b) => a[0] - b[0]);
      let prefix = 0;
      let absStart = -1;
      let absEnd = -1;
      const parts: string[] = [];
      for (const [page, layer] of pages) {
        const txt = layer.textContent ?? '';
        if (page === anchor.page) {
          absStart = prefix + anchor.charStart;
          absEnd = prefix + anchor.charEnd;
        }
        parts.push(txt);
        prefix += txt.length + PAGE_SEPARATOR.length;
      }
      if (absStart < 0) return null;
      return { article: parts.join(PAGE_SEPARATOR), absStart, absEnd };
    },
  }));

  useEffect(() => {
    let cancelled = false;
    const root = rootRef.current;
    if (!root || !article.pdfBlob) return;
    root.innerHTML = '';
    pageRefs.current.clear();
    visibleRatios.current.clear();
    currentPageRef.current = null;
    setRenderedPages(0);

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const layer = entry.target as HTMLElement;
          const pageNum = Number(layer.dataset.page);
          if (!pageNum) continue;
          visibleRatios.current.set(pageNum, entry.intersectionRatio);
        }
        let bestPage: number | null = null;
        let bestRatio = 0;
        for (const [pn, ratio] of visibleRatios.current) {
          if (ratio > bestRatio) {
            bestRatio = ratio;
            bestPage = pn;
          }
        }
        if (bestPage !== null) currentPageRef.current = bestPage;
      },
      { threshold: [0, 0.25, 0.5, 0.75, 1] },
    );

    (async () => {
      const buf = await article.pdfBlob!.arrayBuffer();
      const doc = await pdfjsLib.getDocument({
        data: buf,
        cMapUrl: `${import.meta.env.BASE_URL}cmaps/`,
        cMapPacked: true,
        standardFontDataUrl: `${import.meta.env.BASE_URL}standard_fonts/`,
        wasmUrl: `${import.meta.env.BASE_URL}wasm/`,
        iccUrl: `${import.meta.env.BASE_URL}iccs/`,
      }).promise;
      for (let p = 1; p <= doc.numPages; p++) {
        if (cancelled) return;
        const page = await doc.getPage(p);
        const scale = 1.4 * zoom;
        const viewport = page.getViewport({ scale });

        const pageWrap = document.createElement('div');
        pageWrap.className = 'pdf-page';
        pageWrap.style.width = `${viewport.width}px`;
        pageWrap.style.height = `${viewport.height}px`;

        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        pageWrap.appendChild(canvas);

        const textLayer = document.createElement('div');
        textLayer.className = 'pdf-text-layer';
        textLayer.dataset.page = String(p);
        textLayer.style.width = `${viewport.width}px`;
        textLayer.style.height = `${viewport.height}px`;
        pageWrap.appendChild(textLayer);

        root.appendChild(pageWrap);
        pageRefs.current.set(p, textLayer);
        observer.observe(textLayer);

        const ctx = canvas.getContext('2d')!;
        await page.render({ canvasContext: ctx, viewport, canvas }).promise;

        const tc = await page.getTextContent();
        for (const item of tc.items as any[]) {
          if (!('str' in item)) continue;
          const tx = pdfjsLib.Util.transform(viewport.transform, item.transform);
          const fontHeight = Math.hypot(tx[2], tx[3]);
          const span = document.createElement('span');
          span.textContent = item.str + (item.hasEOL ? '\n' : '');
          span.style.position = 'absolute';
          span.style.left = `${tx[4]}px`;
          span.style.top = `${tx[5] - fontHeight}px`;
          span.style.fontSize = `${fontHeight}px`;
          span.style.fontFamily = 'sans-serif';
          span.style.whiteSpace = 'pre';
          span.style.transformOrigin = '0 0';
          textLayer.appendChild(span);
        }

        if (cancelled) return;
        setRenderedPages(p);
      }
    })();

    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [article.id, zoom]);

  useEffect(() => {
    for (const [page, layer] of pageRefs.current) {
      layer.querySelectorAll('.hl, .note-anchor').forEach((el) => {
        const parent = el.parentNode;
        if (!parent) return;
        while (el.firstChild) parent.insertBefore(el.firstChild, el);
        parent.removeChild(el);
        (parent as Node).normalize();
      });
      for (const h of highlights) {
        if (h.anchor.kind !== 'pdf' || h.anchor.page !== page) continue;
        const r = rangeFromOffsets(layer, h.anchor.charStart, h.anchor.charEnd);
        if (r) paintRange(r, 'hl', { backgroundColor: h.color }, { hlId: h.id });
      }
      for (const n of anchoredNotes) {
        if (!n.anchor || n.anchor.kind !== 'pdf' || n.anchor.page !== page) continue;
        const r = rangeFromOffsets(layer, n.anchor.charStart, n.anchor.charEnd);
        if (r) paintRange(r, 'note-anchor', {}, { noteId: n.id });
      }
    }
  }, [highlights, anchoredNotes, renderedPages]);

  return <div ref={rootRef} className="pdf-root" />;
});

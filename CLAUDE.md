# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this app is

A single-user, local-first browser app that helps a student read complex articles (often not in their native language). Users import text or PDF articles, select words/phrases for inline Hebrew translation via Google Translate, multi-color highlight passages, and keep both anchored notes and a per-article "thinking pad". Everything persists in IndexedDB — there is no backend and no auth.

## Commands

- `npm run dev` — start Vite dev server on http://localhost:5173.
- `npm run build` — `tsc -b && vite build` (typecheck then bundle).
- `npm run lint` — ESLint.
- `npm run preview` — preview the production build.
- `npx tsc -p tsconfig.app.json --noEmit` — typecheck only (faster than `build`); useful after edits.

No test runner is configured.

## Architecture — the parts that span multiple files

### Local-first data model ([src/db/db.ts](src/db/db.ts))

One IndexedDB database (`reader-app`) with four stores: `articles`, `highlights`, `notes`, `settings`. All persistence goes through the typed helpers in `db.ts` — do **not** call `openDB` or hand-roll transactions elsewhere. `idb` is the only DB wrapper. The `settings` store is keyval-shaped and currently holds just `googleApiKey`.

### Anchors — the heart of the app

An `Anchor` (defined in `db.ts`) locates a selection inside an article *without* relying on DOM node identity, so highlights and notes survive reloads and re-renders:

- `{ kind: 'text', charStart, charEnd }` — offsets into the article's canonical string.
- `{ kind: 'pdf', page, charStart, charEnd }` — offsets into the per-page text-layer string (1-based page).

The bridge between DOM `Range` objects and these offsets lives in [src/utils/ranges.ts](src/utils/ranges.ts):
- `getTextOffsetsWithinRoot(root, range)` walks text nodes via `TreeWalker` and converts a `Range` to `{start, end}`.
- `rangeFromOffsets(root, start, end)` does the inverse.
- `paintRange(range, className, style, dataset)` wraps the matching text nodes in spans (used to render highlights and note underlines).

Both readers depend on having a single root element whose text-node order is stable. Any change to how text is rendered must preserve that invariant or anchors break silently.

### Two readers, one interface ([src/readers/](src/readers/))

`TextReader` and `PdfReader` both expose `getRoot()` so the parent can ask "what's the root element for this article?". `PdfReader` additionally exposes `getPageTextLayer(page)` because anchors are scoped to a page, not the whole document.

`PdfReader` builds its own absolute-positioned text layer from `page.getTextContent()` rather than using pdfjs's `renderTextLayer`. Spans are appended in pdfjs item order, which is the order a `TreeWalker` will visit them — that's what makes the char-offset scheme work. The canvas underneath is what the user actually sees; the text layer is transparent and only there for selection. **Known limitation:** for PDFs with custom font encodings (common in academic papers), the text stream may not match what's drawn — see [src/components/TranslationPopup.tsx](src/components/TranslationPopup.tsx) for the editable-source workaround. A future Tesseract-based OCR path is the proper fix.

When highlights/notes change, `PdfReader` strips all existing `.hl` / `.note-anchor` spans, normalizes the text nodes, then repaints from the props. `TextReader` re-renders the whole text on every change and then repaints. Either way, anchors must survive a full repaint cycle.

### Selection flow ([src/views/Reader.tsx](src/views/Reader.tsx))

All selection handling is centralized in `Reader.tsx` with document-level `mouseup` / `mousedown` / `click` listeners. The flow:

1. On `mouseup`, check if the selection lives inside the article root, then call `computeAnchorFromSelection`. For text it uses `textRef`; for PDF it walks up to the nearest `.pdf-text-layer` to determine the page.
2. `setActive(...)` opens the floating `SelectionPopover` with Translate / Highlight / Add note.
3. Translate is *ephemeral* (never persisted). Highlight and note actions persist via the `db.ts` helpers and trigger a refresh.
4. Clicking an existing `.hl` span (with no live selection) opens the remove-highlight menu — `data-hl-id` on the span is the link back to the DB row.

The `mousedown` handler clears state but exempts any popover/modal so clicking inside them doesn't dismiss them.

### Translation ([src/services/translate.ts](src/services/translate.ts))

Calls Google Cloud Translation v2 directly from the browser with an **API key** (the `AIza...` kind), read from the `settings` store. **Do not** switch this to OAuth / service-account / ADC — those require a backend; API keys don't expire and work from the browser. The `TranslationPopup` shows the exact source string sent to Google in an editable field so the user can fix bad PDF extraction and re-translate (`doRetranslate` in `Reader.tsx`).

### Notes and the thinking pad ([src/components/NotesPanel.tsx](src/components/NotesPanel.tsx))

Anchored notes and the thinking pad share the same `notes` store; the thinking pad is the single row per article with `anchor: null`. `ThinkingPad` debounces writes by 500ms.

## Conventions worth knowing

- The Vite TS template enables `erasableSyntaxOnly` — TypeScript parameter properties (`constructor(public x: T)`) are rejected. Declare fields explicitly (see `TranslateError`).
- `pdfjs-dist`'s worker is loaded via a Vite `?url` import in `PdfReader.tsx`; copying that pattern is the supported way to wire the worker.
- Highlights use `mix-blend-mode: multiply` so they tint rather than cover. The text layer is `color: transparent`, so a solid background would hide both the canvas glyphs and the text layer.

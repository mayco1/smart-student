import type { Anchor } from '../db/db';

export function getTextOffsetsWithinRoot(root: HTMLElement, range: Range): { start: number; end: number } | null {
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return null;
  const start = offsetOf(root, range.startContainer, range.startOffset);
  const end = offsetOf(root, range.endContainer, range.endOffset);
  if (start === end) return null;
  return start < end ? { start, end } : { start: end, end: start };
}

function offsetOf(root: HTMLElement, node: Node, offset: number): number {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let total = 0;
  let n: Node | null = walker.nextNode();
  while (n) {
    if (n === node) return total + offset;
    total += (n.nodeValue ?? '').length;
    n = walker.nextNode();
  }
  if (node === root) return offset;
  return total;
}

export function rangeFromOffsets(root: HTMLElement, start: number, end: number): Range | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let acc = 0;
  let startNode: Text | null = null;
  let startOffset = 0;
  let endNode: Text | null = null;
  let endOffset = 0;
  let n = walker.nextNode() as Text | null;
  while (n) {
    const len = n.nodeValue?.length ?? 0;
    if (!startNode && acc + len >= start) {
      startNode = n;
      startOffset = start - acc;
    }
    if (acc + len >= end) {
      endNode = n;
      endOffset = end - acc;
      break;
    }
    acc += len;
    n = walker.nextNode() as Text | null;
  }
  if (!startNode || !endNode) return null;
  const r = document.createRange();
  r.setStart(startNode, startOffset);
  r.setEnd(endNode, endOffset);
  return r;
}

export function paintRange(range: Range, className: string, style: Partial<CSSStyleDeclaration> = {}, dataset: Record<string, string> = {}) {
  const spans: HTMLSpanElement[] = [];
  const rects = splitRangeByTextNodes(range);
  for (const r of rects) {
    const span = document.createElement('span');
    span.className = className;
    Object.assign(span.style, style);
    for (const [k, v] of Object.entries(dataset)) span.dataset[k] = v;
    try {
      r.surroundContents(span);
      spans.push(span);
    } catch {
      // skip if range crosses element boundaries we can't wrap
    }
  }
  return spans;
}

function splitRangeByTextNodes(range: Range): Range[] {
  const out: Range[] = [];
  const start = range.startContainer;
  const end = range.endContainer;
  if (start === end && start.nodeType === Node.TEXT_NODE) {
    out.push(range.cloneRange());
    return out;
  }
  const root = range.commonAncestorContainer;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let inRange = false;
  let n = walker.nextNode() as Text | null;
  while (n) {
    if (n === start) inRange = true;
    if (inRange && n.nodeValue && n.nodeValue.length > 0) {
      const r = document.createRange();
      r.setStart(n, n === start ? range.startOffset : 0);
      r.setEnd(n, n === end ? range.endOffset : n.nodeValue.length);
      if (!r.collapsed) out.push(r);
    }
    if (n === end) break;
    n = walker.nextNode() as Text | null;
  }
  return out;
}

export function textAnchor(start: number, end: number): Anchor {
  return { kind: 'text', charStart: start, charEnd: end };
}

export function pdfAnchor(page: number, start: number, end: number): Anchor {
  return { kind: 'pdf', page, charStart: start, charEnd: end };
}

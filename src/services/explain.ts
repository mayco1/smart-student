import { getSetting } from '../db/db';

export class ExplainError extends Error {
  readonly kind: 'no-key' | 'http' | 'network';
  constructor(message: string, kind: 'no-key' | 'http' | 'network') {
    super(message);
    this.kind = kind;
  }
}

export interface ExplainMessage {
  role: 'user' | 'assistant';
  content: string;
}

const SYSTEM_PROMPT = `You are helping a student understand a complex article they are reading themselves.
Your job is to clarify, prompt their thinking, and answer specific questions about the passage they have selected.
Do not summarize the whole article. Do not do the reading for them.
Be concise — usually 3 to 6 sentences. When relevant, point them back to specific parts of the article rather than restating them.
If the question is vague, ask one brief clarifying question instead of guessing.
The student's selected passage is wrapped in <selected>…</selected> tags within the article so you know exactly which part they mean.
Reply in the same language the student wrote in.`;

const ARTICLE_CHAR_LIMIT = 80_000;

/** Insert <selected>…</selected> around [absStart, absEnd) in `article`, then
 *  truncate the surrounding context to ~ARTICLE_CHAR_LIMIT chars while keeping
 *  the tagged passage centered. */
function markAndTruncate(article: string, absStart: number, absEnd: number): string {
  const open = '<selected>';
  const close = '</selected>';
  if (absStart < 0 || absEnd > article.length || absStart >= absEnd) {
    return article.length <= ARTICLE_CHAR_LIMIT
      ? article
      : article.slice(0, ARTICLE_CHAR_LIMIT) + '\n\n[…article truncated…]';
  }
  const tagged =
    article.slice(0, absStart) +
    open + article.slice(absStart, absEnd) + close +
    article.slice(absEnd);

  if (tagged.length <= ARTICLE_CHAR_LIMIT) return tagged;

  const passageMid = absStart + Math.floor((absEnd - absStart) / 2) + open.length / 2;
  const half = Math.floor(ARTICLE_CHAR_LIMIT / 2);
  const start = Math.max(0, Math.floor(passageMid - half));
  const end = Math.min(tagged.length, Math.floor(passageMid + half));
  let slice = tagged.slice(start, end);
  if (start > 0) slice = '[…earlier omitted…]\n\n' + slice;
  if (end < tagged.length) slice = slice + '\n\n[…later omitted…]';
  return slice;
}

export async function explain({
  article,
  absStart,
  absEnd,
  passage,
  history,
}: {
  article: string;
  absStart: number;
  absEnd: number;
  passage: string;
  history: ExplainMessage[];
}): Promise<string> {
  const key = await getSetting('anthropicApiKey');
  if (!key) throw new ExplainError('Set your Anthropic API key in Settings.', 'no-key');
  if (history.length === 0) throw new ExplainError('Empty conversation.', 'http');

  const articleText = markAndTruncate(article, absStart, absEnd);

  const messages = history.map((m, i) => {
    if (i === 0 && m.role === 'user') {
      return {
        role: 'user' as const,
        content: [
          {
            type: 'text',
            text: `Article the student is reading (the passage they selected is wrapped in <selected> tags):\n\n${articleText}`,
            cache_control: { type: 'ephemeral' },
          },
          { type: 'text', text: `Passage (verbatim):\n\n"""${passage}"""` },
          { type: 'text', text: `Student's question:\n\n${m.content}` },
        ],
      };
    }
    return { role: m.role, content: m.content };
  });

  let res: Response;
  try {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages,
      }),
    });
  } catch {
    throw new ExplainError('Network error contacting Anthropic.', 'network');
  }
  if (!res.ok) {
    const body = await res.text();
    throw new ExplainError(`Anthropic API error ${res.status}: ${body}`, 'http');
  }
  const json = await res.json();
  const block = Array.isArray(json?.content) ? json.content.find((b: any) => b.type === 'text') : null;
  const text = block?.text;
  if (typeof text !== 'string') throw new ExplainError('Unexpected response from Anthropic.', 'http');
  return text;
}

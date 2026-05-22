import { getSetting } from '../db/db';

export class TranslateError extends Error {
  readonly kind: 'no-key' | 'http' | 'network';
  constructor(message: string, kind: 'no-key' | 'http' | 'network') {
    super(message);
    this.kind = kind;
  }
}

export async function translateToHebrew(q: string): Promise<string> {
  const key = await getSetting('googleApiKey');
  if (!key) throw new TranslateError('Set your Google Translate API key in Settings.', 'no-key');
  const url = `https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(key)}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ q, target: 'he', format: 'text' }),
    });
  } catch (e) {
    throw new TranslateError('Network error while contacting Google Translate.', 'network');
  }
  if (!res.ok) {
    const body = await res.text();
    throw new TranslateError(`Google Translate error ${res.status}: ${body}`, 'http');
  }
  const json = await res.json();
  const t = json?.data?.translations?.[0]?.translatedText;
  if (typeof t !== 'string') throw new TranslateError('Unexpected response from Google Translate.', 'http');
  return t;
}

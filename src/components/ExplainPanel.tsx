import { useEffect, useRef, useState } from 'react';
import { explain, ExplainError, type ExplainMessage } from '../services/explain';

const QUICK_QUESTIONS = [
  "I don't understand the logic here.",
  'What does this phrase mean in this context?',
  'How does this part relate to the point of the article?',
];

export function ExplainPanel({
  article,
  absStart,
  absEnd,
  passage,
  onSaveAsNote,
  onClose,
}: {
  article: string;
  absStart: number;
  absEnd: number;
  passage: string;
  onSaveAsNote: (body: string) => Promise<void>;
  onClose: () => void;
}) {
  const [passageDraft, setPassageDraft] = useState(passage);
  const [messages, setMessages] = useState<ExplainMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const threadRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight });
  }, [messages, loading]);

  async function ask(text: string) {
    const q = text.trim();
    if (!q || loading) return;
    setError(null);
    const next: ExplainMessage[] = [...messages, { role: 'user', content: q }];
    setMessages(next);
    setInput('');
    setLoading(true);
    try {
      const reply = await explain({
        article,
        absStart,
        absEnd,
        passage: passageDraft,
        history: next,
      });
      setMessages([...next, { role: 'assistant', content: reply }]);
    } catch (e) {
      const msg = e instanceof ExplainError ? e.message : 'Explain failed.';
      setError(msg);
      setMessages(next);
    } finally {
      setLoading(false);
    }
  }

  async function saveAsNote() {
    if (messages.length === 0) return;
    const body = messages.map((m) => (m.role === 'user' ? `Q: ${m.content}` : `A: ${m.content}`)).join('\n\n');
    await onSaveAsNote(body);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="explain-panel" onMouseDown={(e) => e.stopPropagation()}>
        <div className="row header">
          <strong>Explain this</strong>
          <button className="close" onClick={onClose}>×</button>
        </div>

        <label className="src-label">Passage (editable — fix any garbled chars before asking):</label>
        <textarea
          className="src-input passage"
          rows={3}
          value={passageDraft}
          onChange={(e) => setPassageDraft(e.target.value)}
        />

        <div className="chips">
          {QUICK_QUESTIONS.map((q) => (
            <button key={q} className="chip" onClick={() => ask(q)} disabled={loading}>
              {q}
            </button>
          ))}
        </div>

        <div className="thread" ref={threadRef}>
          {messages.length === 0 && !loading && (
            <p className="muted">Pick a question above or type your own.</p>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`explain-msg ${m.role}`}>
              <div className="role">{m.role === 'user' ? 'You' : 'Claude'}</div>
              <div className="body">{m.content}</div>
            </div>
          ))}
          {loading && <div className="muted">Thinking…</div>}
          {error && <div className="error">{error}</div>}
        </div>

        <div className="row composer">
          <input
            value={input}
            placeholder="Ask a follow-up…"
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                ask(input);
              }
            }}
            disabled={loading}
          />
          <button onClick={() => ask(input)} disabled={loading || !input.trim()}>
            Ask
          </button>
        </div>

        <div className="row footer">
          <button onClick={saveAsNote} disabled={messages.length === 0}>
            Save as note
          </button>
          {saved && <span className="ok">Saved.</span>}
        </div>
      </div>
    </div>
  );
}

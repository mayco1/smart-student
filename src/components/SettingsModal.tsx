import { useEffect, useState } from 'react';
import { getSetting, setSetting } from '../db/db';

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const [googleKey, setGoogleKey] = useState('');
  const [anthropicKey, setAnthropicKey] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getSetting('googleApiKey').then((v) => setGoogleKey(v ?? ''));
    getSetting('anthropicApiKey').then((v) => setAnthropicKey(v ?? ''));
  }, []);

  async function save() {
    await setSetting('googleApiKey', googleKey.trim());
    await setSetting('anthropicApiKey', anthropicKey.trim());
    setSaved(true);
    setTimeout(() => setSaved(false), 1200);
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Settings</h3>
        <label>
          Google Translate API key
          <input
            type="password"
            value={googleKey}
            onChange={(e) => setGoogleKey(e.target.value)}
            placeholder="AIza..."
          />
        </label>
        <p className="hint">
          Used for Hebrew translations. Get one from Google Cloud Console → Translation API.
        </p>
        <label>
          Anthropic API key
          <input
            type="password"
            value={anthropicKey}
            onChange={(e) => setAnthropicKey(e.target.value)}
            placeholder="sk-ant-..."
          />
        </label>
        <p className="hint">
          Used for "Explain this". Get one from console.anthropic.com. Stored locally in your browser.
        </p>
        <div className="row">
          <button onClick={save}>Save</button>
          <button onClick={onClose}>Close</button>
          {saved && <span className="ok">Saved.</span>}
        </div>
      </div>
    </div>
  );
}

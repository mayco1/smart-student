import { useState } from 'react';
import { Library } from './views/Library';
import { Reader } from './views/Reader';
import './styles.css';

export default function App() {
  const [openId, setOpenId] = useState<string | null>(null);
  return openId ? (
    <Reader articleId={openId} onBack={() => setOpenId(null)} />
  ) : (
    <Library onOpen={setOpenId} />
  );
}

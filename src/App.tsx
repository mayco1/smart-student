import { useState } from 'react';
import { Library } from './views/Library';
import { Reader, type ReaderFrom } from './views/Reader';
import { Research } from './views/Research';
import { CollectionView } from './views/Collection';
import { getCollection } from './db/db';
import './styles.css';

type View =
  | { name: 'library' }
  | { name: 'research' }
  | { name: 'collection'; collectionId: string; folderId: string | null }
  | { name: 'reader'; articleId: string; from?: ReaderFrom };

export default function App() {
  const [view, setView] = useState<View>({ name: 'library' });

  if (view.name === 'library') {
    return (
      <Library
        onOpen={(id) => setView({ name: 'reader', articleId: id })}
        onOpenResearch={() => setView({ name: 'research' })}
      />
    );
  }

  if (view.name === 'research') {
    return (
      <Research
        onBack={() => setView({ name: 'library' })}
        onOpenCollection={(id) =>
          setView({ name: 'collection', collectionId: id, folderId: null })
        }
      />
    );
  }

  if (view.name === 'collection') {
    const { collectionId, folderId } = view;
    return (
      <CollectionView
        collectionId={collectionId}
        folderId={folderId}
        onNavigateFolder={(nextFolderId) =>
          setView({ name: 'collection', collectionId, folderId: nextFolderId })
        }
        onBackToResearch={() => setView({ name: 'research' })}
        onOpenArticle={async (articleId) => {
          const c = await getCollection(collectionId);
          setView({
            name: 'reader',
            articleId,
            from: {
              collectionId,
              collectionTitle: c?.title ?? 'collection',
              folderId,
            },
          });
        }}
      />
    );
  }

  // reader
  const fromInfo = view.from;
  return (
    <Reader
      articleId={view.articleId}
      from={fromInfo}
      onBack={() =>
        fromInfo
          ? setView({
              name: 'collection',
              collectionId: fromInfo.collectionId,
              folderId: fromInfo.folderId,
            })
          : setView({ name: 'library' })
      }
      onBackToCollection={
        fromInfo
          ? () =>
              setView({
                name: 'collection',
                collectionId: fromInfo.collectionId,
                folderId: fromInfo.folderId,
              })
          : undefined
      }
    />
  );
}

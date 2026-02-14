import Link from 'next/link';
import { getSongs } from '@/lib/queries';
import { buildSearchTerms, normalizeSearch } from '@cifras/shared';

export const revalidate = 60;
const DISCOVERY_SUGGESTIONS = ['hinos', 'adoracao', 'louvor', 'harpa', 'guitarra'];

export default async function MusicasPage({
  searchParams
}: {
  searchParams?: { q?: string };
}) {
  const query = searchParams?.q?.toString() ?? '';
  const songs = await getSongs({ search: query || undefined });
  const categories = Array.from(new Set(songs.map((song) => song.category ?? 'Louvor'))).slice(0, 8);
  const normalized = normalizeSearch(query);
  const fallbackTerms = buildSearchTerms(query).filter((term) => term !== normalized);
  const suggestedQueries = Array.from(new Set([...fallbackTerms, ...DISCOVERY_SUGGESTIONS])).slice(0, 5);

  return (
    <div className="page">
      <section className="card page-header">
        <div>
          <h1 className="page-title">Músicas</h1>
          <p className="page-subtitle">Explore o catálogo completo de cifras cristãs.</p>
        </div>
        <form className="search-form">
          <input className="search-input" name="q" placeholder="Buscar por título ou artista" defaultValue={query} />
          <button className="search-button" type="submit">Buscar</button>
        </form>
        <div className="chips">
          {categories.map((category) => (
            <span key={category} className="chip">{category}</span>
          ))}
        </div>
      </section>
      <section className="card">
        <div className="section-header">
          <p className="muted">{songs.length} músicas encontradas</p>
        </div>
        {normalized && songs.length === 0 ? (
          <div className="empty-state">
            <p>Nenhuma música encontrada para "{query}".</p>
            <p className="muted">Tente com menos palavras ou use uma sugestão abaixo.</p>
            <div className="chips" style={{ justifyContent: 'center', marginTop: 14 }}>
              {suggestedQueries.map((suggestion) => (
                <Link key={suggestion} href={`/musicas?q=${encodeURIComponent(suggestion)}`} className="chip">
                  {suggestion}
                </Link>
              ))}
              <Link href="/musicas" className="chip">
                Em alta
              </Link>
              <Link href="/artistas" className="chip">
                Buscar artistas
              </Link>
            </div>
          </div>
        ) : (
          <div className="list">
            {songs.map((song) => (
              <Link key={song.id} href={`/cifra/${song.id}`}>
                <div className="list-item">
                  <div className="list-info">
                    <span className="list-title">{song.title}</span>
                    <span className="list-meta">{song.artists?.name ?? 'Artista'} · {song.category ?? 'Louvor'}</span>
                  </div>
                  <span className="badge">Cifra</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

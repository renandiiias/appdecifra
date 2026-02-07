import Link from 'next/link';
import { getSongs } from '@/lib/queries';
import { normalizeSearch } from '@cifras/shared';

export const revalidate = 60;

export default async function MusicasPage({
  searchParams
}: {
  searchParams?: { q?: string };
}) {
  const query = searchParams?.q?.toString() ?? '';
  const songs = await getSongs({ search: query || undefined });
  const categories = Array.from(new Set(songs.map((song) => song.category ?? 'Louvor'))).slice(0, 8);
  const normalized = normalizeSearch(query);
  const filtered = normalized
    ? songs.filter((song) =>
        song.title_search.includes(normalized) ||
        (song.artists?.name ? normalizeSearch(song.artists.name).includes(normalized) : false)
      )
    : songs;

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
          <p className="muted">{filtered.length} músicas encontradas</p>
        </div>
        <div className="list">
          {filtered.map((song) => (
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
      </section>
    </div>
  );
}

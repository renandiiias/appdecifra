import Link from 'next/link';
import { getArtistBySlug, getArtistSongs } from '@/lib/queries';

export const revalidate = 60;

export default async function ArtistPage({ params }: { params: { slug: string } }) {
  const artist = await getArtistBySlug(params.slug);
  if (!artist) {
    return (
      <div className="card">
        <h1>Artista não encontrado</h1>
        <Link href="/artistas">Voltar</Link>
      </div>
    );
  }

  const songs = await getArtistSongs(artist.id);

  return (
    <div className="page">
      <section className="card glow page-header">
        <div>
          <h1 className="page-title">{artist.name}</h1>
          <p className="page-subtitle">{songs.length} músicas disponíveis</p>
        </div>
        <div className="pill">Artista</div>
      </section>
      <section className="card">
        <div className="section-header">
          <h2 className="section-title">Cifras</h2>
        </div>
        <div className="list">
          {songs.map((song) => (
            <Link key={song.id} href={`/cifra/${song.id}`}>
              <div className="list-item">
                <div className="list-info">
                  <span className="list-title">{song.title}</span>
                  <span className="list-meta">{song.category ?? 'Louvor'}</span>
                </div>
                <span className="badge">Abrir</span>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

import Link from 'next/link';
import { getSharedPlaylistById, getSharedPlaylistSongs } from '@/lib/queries';

export const revalidate = 60;

type Props = { params: { id: string } };

export default async function PlaylistPage({ params }: Props) {
  const id = params.id;
  const [playlist, items] = await Promise.all([getSharedPlaylistById(id), getSharedPlaylistSongs(id)]);

  if (!playlist || playlist.is_public !== true) {
    return (
      <div className="page">
        <section className="home-section">
          <div className="section-header">
            <h1 className="section-title">Playlist</h1>
          </div>
          <p style={{ color: 'var(--muted)' }}>Playlist não encontrada ou indisponível.</p>
          <Link className="section-action" href="/">Voltar</Link>
        </section>
      </div>
    );
  }

  const songs = items
    .map((row: any) => row.songs)
    .filter(Boolean)
    .map((song: any) => ({
      id: String(song.id),
      title: String(song.title ?? ''),
      artist: String(song.artists?.name ?? 'Artista'),
      category: song.category ?? null
    }));

  return (
    <div className="page">
      <section className="home-section">
        <div className="section-header">
          <h1 className="section-title">{playlist.title}</h1>
          <Link className="section-action" href="/favoritos">Favoritos</Link>
        </div>
        {playlist.description ? (
          <p style={{ color: 'var(--muted)', marginTop: -6 }}>{playlist.description}</p>
        ) : null}
        <p style={{ color: 'var(--muted)' }}>{songs.length} {songs.length === 1 ? 'música' : 'músicas'}</p>

        <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>
          {songs.map((song) => (
            <Link key={song.id} href={`/cifra/${song.id}`} className="chart-item" style={{ borderRadius: 16 }}>
              <span className="chart-rank">♪</span>
              <div className="chart-text">
                <span className="chart-title">{song.title}</span>
                <span className="chart-artist">{song.artist}</span>
              </div>
              <span className="chart-more">›</span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}


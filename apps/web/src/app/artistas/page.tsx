import Link from 'next/link';
import { getArtists } from '@/lib/queries';
import { slugify } from '@cifras/shared';

export const revalidate = 60;

export default async function ArtistasPage() {
  const artists = await getArtists();
  const grouped: Record<string, typeof artists> = {};

  artists.forEach((artist) => {
    const letter = artist.name[0]?.toUpperCase() ?? '#';
    grouped[letter] = grouped[letter] ?? [];
    grouped[letter].push(artist);
  });

  const letters = Object.keys(grouped).sort();

  return (
    <div className="page">
      <section className="card glow page-header">
        <div>
          <h1 className="page-title">Artistas A‑Z</h1>
          <p className="page-subtitle">Descubra por ordem alfabética.</p>
        </div>
        <div className="chips">
          {letters.map((letter) => (
            <span key={letter} className="chip">{letter}</span>
          ))}
        </div>
      </section>

      {letters.map((letter) => (
        <section key={letter} className="card">
          <h2 className="section-title">{letter}</h2>
          <div className="grid grid-3">
            {grouped[letter].map((artist) => (
              <Link key={artist.id} className="card" href={`/artistas/${slugify(artist.name)}`}>
                <h3 style={{ margin: 0 }}>{artist.name}</h3>
                <p className="muted" style={{ marginTop: 8 }}>Ver cifras</p>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

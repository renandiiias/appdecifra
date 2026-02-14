import Link from 'next/link';
import { getArtists, getSongs } from '@/lib/queries';
import { slugify } from '@cifras/shared';

export const revalidate = 60;

const heroImages = [
  'https://images.unsplash.com/photo-1485579149621-3123dd979885?auto=format&fit=crop&w=900&q=80',
  'https://images.unsplash.com/photo-1511379938547-c1f69419868d?auto=format&fit=crop&w=900&q=80',
  'https://images.unsplash.com/photo-1485579149621-3123dd979885?auto=format&fit=crop&w=900&q=80'
];

const chartImages = [
  'https://images.unsplash.com/photo-1522199755839-a2bacb67c546?auto=format&fit=crop&w=200&q=80',
  'https://images.unsplash.com/photo-1511379938547-c1f69419868d?auto=format&fit=crop&w=200&q=80',
  'https://images.unsplash.com/photo-1485579149621-3123dd979885?auto=format&fit=crop&w=200&q=80',
  'https://images.unsplash.com/photo-1516280440614-37939bbacd81?auto=format&fit=crop&w=200&q=80',
  'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=200&q=80',
  'https://images.unsplash.com/photo-1506157786151-b8491531f063?auto=format&fit=crop&w=200&q=80'
];

const artistImages = [
  'https://images.unsplash.com/photo-1516280440614-37939bbacd81?auto=format&fit=crop&w=260&q=80',
  'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=260&q=80',
  'https://images.unsplash.com/photo-1508214751196-bcfd4ca60f91?auto=format&fit=crop&w=260&q=80',
  'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=260&q=80',
  'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=260&q=80',
  'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=260&q=80'
];

const categoryTabs = ['Todos', 'Louvor', 'Adoração', 'Hinos', 'Congregacional'];
const letters = 'A B C D E F G H I J K L M N O P Q R S T U V W X Y Z #'.split(' ');

type SongSummary = {
  id: string;
  title: string;
  category?: string | null;
  artists?: { name: string } | null;
};

export default async function HomePage() {
  const [songsData, artists] = await Promise.all([getSongs(), getArtists()]);
  const songs: SongSummary[] = songsData.map((song) => ({
    id: song.id,
    title: song.title,
    category: song.category,
    artists: song.artists
  }));

  const topSongs = songs.slice(0, 10);
  const columns = [0, 1]
    .map((column) => topSongs.slice(column * 5, column * 5 + 5))
    .filter((column) => column.length > 0);
  const popularArtists = artists.slice(0, 8);
  const featuredSongs = songs.slice(0, 3);

	  const heroCards = featuredSongs.map((song, index) => ({
	    title: song.title,
	    subtitle: song.artists?.name ?? 'Artista',
	    image: heroImages[index % heroImages.length],
	    href: `/cifra/${song.id}`,
	    cta: 'Abrir cifra',
	    tag: index === 2 ? 'Guitarra' : null,
	    gradient:
	      index === 0
	        ? 'linear-gradient(140deg, #4a1d00, #7b2f00)'
        : index === 1
          ? 'linear-gradient(140deg, #262626, #3a3a3a)'
          : 'linear-gradient(140deg, #5a2a00, #a85a14)'
  }));

  return (
    <div className="page">
      <h1 className="sr-only">Cifra Cristã: cifras, artistas e recursos para tocar no louvor</h1>
      <section className="category-strip">
        {categoryTabs.map((tab, index) => (
          <Link
            key={tab}
            href="/musicas"
            className={`category-tab ${index === 0 ? 'active' : ''}`}
          >
            {tab}
          </Link>
        ))}
      </section>

      <section className="hero-carousel">
        {heroCards.map((card, index) => (
          <Link
            key={`${card.title}-${index}`}
            href={card.href}
            className="promo-card"
            style={{ background: card.gradient }}
          >
            <div className="promo-card__thumb">
              <img src={card.image} alt="" />
            </div>
            <div className="promo-card__content">
              <h3 className="promo-card__title">{card.title}</h3>
              <p className="promo-card__subtitle">{card.subtitle}</p>
            </div>
            <div className="promo-card__actions">
              <span className="promo-card__button">{card.cta}</span>
              {card.tag ? <span className="promo-card__chip">{card.tag}</span> : null}
            </div>
          </Link>
        ))}
      </section>

      <section className="home-section">
        <div className="section-header">
          <h2 className="section-title">Músicas em alta</h2>
          <Link className="section-action" href="/musicas">Ver mais</Link>
        </div>
        <div className="charts-grid">
          {columns.map((column, columnIndex) => (
            <div key={`col-${columnIndex}`} className="charts-column">
              {column.map((song, index) => {
                const position = columnIndex * 5 + index + 1;
                return (
                  <Link
                    key={song.id}
                    href={`/cifra/${song.id}`}
                    className="chart-item"
                  >
                    <span className="chart-rank">{String(position).padStart(2, '0')}</span>
                    <img
                      className="chart-avatar"
                      src={chartImages[(position - 1) % chartImages.length]}
                      alt=""
                    />
                    <div className="chart-text">
                      <span className="chart-title">{song.title}</span>
                      <span className="chart-artist">{song.artists?.name ?? 'Artista'}</span>
                    </div>
                    <span className="chart-more">⋮</span>
                  </Link>
                );
              })}
            </div>
          ))}
        </div>
      </section>

      <section className="home-section">
        <div className="section-header">
          <h2 className="section-title">Artistas populares</h2>
          <Link className="section-action" href="/artistas">Ver mais</Link>
        </div>
        <div className="artist-grid">
          {popularArtists.map((artist, index) => (
            <Link
              key={artist.id}
              href={`/artistas/${slugify(artist.name)}`}
              className="artist-card"
            >
              <img className="artist-image" src={artistImages[index % artistImages.length]} alt="" />
              <span className="artist-name">{artist.name}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="footer-links">
        <div>
          <div className="section-title">Todos os artistas</div>
          <div className="az-row">
            {letters.map((letter) => (
              <Link key={letter} href="/artistas" className="az-letter">
                {letter}
              </Link>
            ))}
          </div>
        </div>
        <div>
          <div className="section-title">Siga a Cifra Cristã</div>
          <div className="social-row">
            {['YouTube', 'Instagram', 'Facebook', 'TikTok', 'X'].map((social) => (
              <Link key={social} href="/artistas" className="social-pill">
                {social}
              </Link>
            ))}
          </div>
        </div>
        <div className="footer-columns">
          <div>
            <div className="footer-title">Músicas</div>
            <Link className="footer-link" href="/musicas">Em alta</Link>
            <Link className="footer-link" href="/musicas">Estilos musicais</Link>
            <Link className="footer-link" href="/favoritos">Favoritos</Link>
            <Link className="footer-link" href="/enviar-cifra">Enviar cifra</Link>
          </div>
          <div>
            <div className="footer-title">Ferramentas</div>
            <Link className="footer-link" href="/afinador">Afinador</Link>
            <Link className="footer-link" href="/musicas">Busca de cifras</Link>
          </div>
          <div>
            <div className="footer-title">Sobre o site</div>
            <Link className="footer-link" href="/artistas">Artistas</Link>
            <Link className="footer-link" href="/login">Conta</Link>
          </div>
        </div>
      </section>
    </div>
  );
}

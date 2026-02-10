import Link from 'next/link';
import { getArtists, getSongs } from '@/lib/queries';
import { slugify } from '@cifras/shared';

export const revalidate = 60;

const heroImages = [
  'https://images.unsplash.com/photo-1485579149621-3123dd979885?auto=format&fit=crop&w=900&q=80',
  'https://images.unsplash.com/photo-1511379938547-c1f69419868d?auto=format&fit=crop&w=900&q=80',
  'https://images.unsplash.com/photo-1485579149621-3123dd979885?auto=format&fit=crop&w=900&q=80',
  'https://images.unsplash.com/photo-1510915361894-db8b60106cb1?auto=format&fit=crop&w=900&q=80'
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

const lessons = [
  {
    title: 'Porque Ele Vive',
    meta: 'Hinos (Simplificada) | Como tocar no violao',
    tag: 'Simplificada',
    image: 'https://images.unsplash.com/photo-1510915361894-db8b60106cb1?auto=format&fit=crop&w=700&q=80'
  },
  {
    title: 'Rendido Estou',
    meta: 'Adoração (Simplificada) | Como tocar no violao',
    tag: 'Simplificada',
    image: 'https://images.unsplash.com/photo-1485579149621-3123dd979885?auto=format&fit=crop&w=700&q=80'
  },
  {
    title: 'Ao Único',
    meta: 'Louvor (Completa) | Como tocar no violao',
    tag: 'Completa',
    image: 'https://images.unsplash.com/photo-1511379938547-c1f69419868d?auto=format&fit=crop&w=700&q=80'
  }
];

const courses = [
  {
    title: 'Violão Iniciante',
    meta: 'Fundamentos para tocar no louvor',
    image: 'https://images.unsplash.com/photo-1506157786151-b8491531f063?auto=format&fit=crop&w=700&q=80'
  },
  {
    title: 'Violão Intermediário',
    meta: 'Levadas, dinâmica e harmonia no culto',
    image: 'https://images.unsplash.com/photo-1522199755839-a2bacb67c546?auto=format&fit=crop&w=700&q=80'
  },
  {
    title: 'Fingerstyle',
    meta: 'Arranjos instrumentais para hinos',
    image: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=700&q=80'
  },
  {
    title: 'Violão Gospel',
    meta: 'Ritmos e levadas para louvor',
    image: 'https://images.unsplash.com/photo-1516280440614-37939bbacd81?auto=format&fit=crop&w=700&q=80'
  }
];

const articles = [
  {
    title: '5 hinos para tocar no violão (nível iniciante)',
    image: 'https://images.unsplash.com/photo-1485579149621-3123dd979885?auto=format&fit=crop&w=700&q=80'
  },
  {
    title: 'Como escolher a tonalidade para a congregação',
    image: 'https://images.unsplash.com/photo-1511379938547-c1f69419868d?auto=format&fit=crop&w=700&q=80'
  },
  {
    title: 'Capotraste no louvor: quando usar e como soar bem',
    image: 'https://images.unsplash.com/photo-1510915361894-db8b60106cb1?auto=format&fit=crop&w=700&q=80'
  },
  {
    title: 'Dinâmica no louvor: tocando com sensibilidade',
    image: 'https://images.unsplash.com/photo-1516280440614-37939bbacd81?auto=format&fit=crop&w=700&q=80'
  }
];

const categoryTabs = ['Todos', 'Louvor', 'Adoração', 'Hinos', 'Congregacional', 'Mais'];
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

  const heroCards = [
    ...featuredSongs.map((song, index) => ({
      title: song.title,
      subtitle: song.artists?.name ?? 'Artista',
      image: heroImages[index % heroImages.length],
      href: `/cifra/${song.id}`,
      cta: 'Aprender a tocar',
      tag: index === 2 ? 'Guitarra' : null,
      gradient:
        index === 0
          ? 'linear-gradient(140deg, #4a1d00, #7b2f00)'
          : index === 1
            ? 'linear-gradient(140deg, #262626, #3a3a3a)'
            : 'linear-gradient(140deg, #5a2a00, #a85a14)'
    })),
    {
      title: 'Dicas, técnicas e curiosidades do mundo da música',
      subtitle: 'Blog da Cifra Cristã',
      image: heroImages[3],
      href: '/manutencao',
      cta: 'Blog do Cifras',
      tag: null,
      gradient: 'linear-gradient(140deg, #6b3a00, #c9751f)'
    }
  ];

  return (
    <div className="page">
      <h1 className="sr-only">Cifra Cristã: cifras, artistas e recursos para tocar no louvor</h1>
      <section className="category-strip">
        {categoryTabs.map((tab, index) => (
          <Link
            key={tab}
            href={tab === 'Mais' ? '/manutencao' : '/musicas'}
            className={`category-tab ${index === 0 ? 'active' : ''}`}
          >
            {tab}
            {tab === 'Mais' ? <span className="chevron">▼</span> : null}
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

      <section className="home-section">
        <div className="section-header">
          <h2 className="section-title">Novas aulas</h2>
          <Link className="section-action" href="/manutencao">Ver mais</Link>
        </div>
        <div className="carousel-row">
          {lessons.map((lesson) => (
            <Link key={lesson.title} href="/manutencao" className="lesson-card">
              <div className="lesson-media">
                <img src={lesson.image} alt="" />
                <span className="lesson-tag">{lesson.tag}</span>
              </div>
              <div className="lesson-body">
                <h3 className="lesson-title">{lesson.title}</h3>
                <p className="lesson-meta">{lesson.meta}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="home-section">
        <div className="section-header">
          <h2 className="section-title">Cursos para você</h2>
          <Link className="section-action" href="/manutencao">Liberar todos os cursos</Link>
        </div>
        <div className="carousel-row">
          {courses.map((course) => (
            <Link key={course.title} href="/manutencao" className="course-card">
              <div className="course-media">
                <img src={course.image} alt="" />
              </div>
              <div className="course-body">
                <h3 className="course-title">{course.title}</h3>
                <p className="course-meta">{course.meta}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="home-section">
        <div className="section-header">
          <h2 className="section-title">Leia também</h2>
          <Link className="section-action" href="/manutencao">Ver mais</Link>
        </div>
        <div className="carousel-row">
          {articles.map((article) => (
            <Link key={article.title} href="/manutencao" className="article-card">
              <div className="article-media">
                <img src={article.image} alt="" />
              </div>
              <div className="article-body">
                <h3 className="article-title">{article.title}</h3>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="cta-banner">
        <img
          className="cta-image"
          src="https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?auto=format&fit=crop&w=1400&q=80"
          alt=""
        />
        <div className="cta-overlay" />
        <div className="cta-content">
          <h2 className="cta-title">Toque mais e melhor, aprenda mais rápido e chegue mais longe</h2>
          <p className="cta-text">
            Assine a Cifra Cristã e tenha acesso ilimitado às melhores ferramentas e conteúdos para tocar.
          </p>
          <Link className="cta-button" href="/manutencao">Explorar os benefícios</Link>
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
              <Link key={social} href="/manutencao" className="social-pill">
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
            <Link className="footer-link" href="/manutencao">Novidades</Link>
            <Link className="footer-link" href="/manutencao">Vídeos</Link>
          </div>
          <div>
            <div className="footer-title">Ferramentas</div>
            <Link className="footer-link" href="/afinador">Afinador</Link>
            <Link className="footer-link" href="/manutencao">Metrônomo</Link>
          </div>
          <div>
            <div className="footer-title">Sobre o site</div>
            <Link className="footer-link" href="/manutencao">Termos de uso e privacidade</Link>
            <Link className="footer-link" href="/manutencao">Ajuda</Link>
          </div>
        </div>
      </section>
    </div>
  );
}

import Link from 'next/link';
import { getSharedSetlistById } from '@/lib/queries';

export const revalidate = 60;

type Props = { params: { id: string } };

export default async function EscalaPage({ params }: Props) {
  const id = params.id;
  const setlist = await getSharedSetlistById(id);

  if (!setlist || setlist.is_public !== true) {
    return (
      <div className="page">
        <section className="home-section">
          <div className="section-header">
            <h1 className="section-title">Escala</h1>
          </div>
          <p style={{ color: 'var(--muted)' }}>Escala não encontrada ou indisponível.</p>
          <Link className="section-action" href="/">Voltar</Link>
        </section>
      </div>
    );
  }

  const payload = setlist.payload ?? {};
  const songs = Array.isArray(payload.songs) ? payload.songs : [];
  const team = Array.isArray(payload.team) ? payload.team : [];

  return (
    <div className="page">
      <section className="home-section">
        <div className="section-header">
          <h1 className="section-title">{setlist.title}</h1>
          <Link className="section-action" href="/musicas">Buscar músicas</Link>
        </div>
        <p style={{ color: 'var(--muted)' }}>
          {setlist.scheduled_at}
          {setlist.church_name ? ` · ${setlist.church_name}` : ''}
        </p>

        <div style={{ marginTop: 14, padding: 14, border: '1px solid var(--border)', borderRadius: 16 }}>
          <div style={{ fontWeight: 900 }}>Importar no app</div>
          <div style={{ color: 'var(--muted)', marginTop: 6 }}>
            Abra o app e vá em <strong>Conta</strong> → <strong>Grupo de louvor</strong> → <strong>Importar</strong> e cole este código:
          </div>
          <div style={{ marginTop: 10, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace', fontWeight: 800 }}>
            {id}
          </div>
        </div>

        <div style={{ marginTop: 18 }}>
          <div className="section-title">Repertório</div>
          <div style={{ display: 'grid', gap: 10, marginTop: 10 }}>
            {songs.length ? (
              songs.map((s: any, idx: number) => (
                <Link key={`${s.id}-${idx}`} href={`/cifra/${s.id}`} className="chart-item" style={{ borderRadius: 16 }}>
                  <span className="chart-rank">{String(idx + 1).padStart(2, '0')}</span>
                  <div className="chart-text">
                    <span className="chart-title">{String(s.title ?? '')}</span>
                    <span className="chart-artist">{String(s.artist ?? 'Artista')}</span>
                  </div>
                  <span className="chart-more">›</span>
                </Link>
              ))
            ) : (
              <div style={{ color: 'var(--muted)' }}>Sem músicas.</div>
            )}
          </div>
        </div>

        <div style={{ marginTop: 18 }}>
          <div className="section-title">Equipe</div>
          <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
            {team.length ? (
              team.map((m: any, idx: number) => (
                <div key={`${m.name}-${idx}`} style={{ padding: 12, border: '1px solid var(--border)', borderRadius: 16 }}>
                  <div style={{ fontWeight: 900 }}>{String(m.name ?? '')}</div>
                  <div style={{ color: 'var(--muted)', marginTop: 4 }}>{String(m.instrument ?? '')}</div>
                </div>
              ))
            ) : (
              <div style={{ color: 'var(--muted)' }}>Sem equipe.</div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}


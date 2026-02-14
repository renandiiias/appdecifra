'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';

type SuggestionRow = {
  id: string;
  song_id: string;
  song_title: string;
  artist: string;
  kind: string;
  text: string;
  created_at: string;
};

type ArtistClaimRow = {
  id: string;
  artist_id: string;
  user_id: string;
  name: string;
  email: string;
  whatsapp: string | null;
  instagram: string | null;
  message: string;
  created_at: string;
  artists?: { name: string; verified_at?: string | null; claimed_user_id?: string | null } | null;
};

type SongClaimRow = {
  id: string;
  song_id: string;
  song_title: string;
  artist: string;
  user_id: string;
  name: string;
  email: string;
  whatsapp: string | null;
  instagram: string | null;
  message: string;
  extra: string | null;
  created_at: string;
};

type VideoLessonRow = {
  id: string;
  song_id: string;
  song_title: string;
  artist: string;
  user_id: string;
  name: string;
  email: string;
  whatsapp: string | null;
  youtube_url: string;
  message: string | null;
  created_at: string;
};

type ExecutionTipRow = {
  id: string;
  song_id: string;
  song_title: string;
  artist: string;
  user_id: string;
  kind: string;
  text: string;
  created_at: string;
};

type Payload = {
  suggestions: SuggestionRow[];
  suggestionVotes: Record<string, { upvotes: number; downvotes: number }>;
  artistClaims: ArtistClaimRow[];
  songClaims: SongClaimRow[];
  videoLessons: VideoLessonRow[];
  executionTips: ExecutionTipRow[];
  errors?: Record<string, string | null>;
};

async function getAccessToken() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

export default function ModeracaoAdminPage() {
  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<Payload | null>(null);
  const [activeTab, setActiveTab] = useState<'sug' | 'artist' | 'song' | 'video' | 'tips'>('sug');

  const [applyOpen, setApplyOpen] = useState<Record<string, boolean>>({});
  const [applyLyrics, setApplyLyrics] = useState<Record<string, string>>({});
  const [applyLoading, setApplyLoading] = useState<Record<string, boolean>>({});

  const counts = useMemo(() => {
    return {
      sug: data?.suggestions?.length ?? 0,
      artist: data?.artistClaims?.length ?? 0,
      song: data?.songClaims?.length ?? 0,
      video: data?.videoLessons?.length ?? 0,
      tips: data?.executionTips?.length ?? 0
    };
  }, [data]);

  const load = async () => {
    setError(null);
    setLoading(true);
    try {
      const token = await getAccessToken();
      if (!token) {
        setData(null);
        return;
      }
      const res = await fetch('/api/admin/moderation', {
        headers: { authorization: `Bearer ${token}` }
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || `HTTP ${res.status}`);
      }
      const json = (await res.json()) as Payload;
      setData(json);
    } catch (e: any) {
      setData(null);
      setError(e instanceof Error ? e.message : 'Falha ao carregar.');
    } finally {
      setLoading(false);
    }
  };

  const act = async (body: any) => {
    setError(null);
    try {
      const token = await getAccessToken();
      if (!token) throw new Error('Faça login para continuar.');
      const res = await fetch('/api/admin/moderation', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify(body)
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json?.message || json?.error || `HTTP ${res.status}`);
      }
      await load();
    } catch (e: any) {
      setError(e instanceof Error ? e.message : 'Falha na ação.');
    }
  };

  const loadSongLyrics = async (suggestionId: string, songId: string) => {
    setApplyLoading((m) => ({ ...m, [suggestionId]: true }));
    try {
      const token = await getAccessToken();
      if (!token) throw new Error('Faça login para continuar.');
      const res = await fetch(`/api/admin/song?songId=${encodeURIComponent(songId)}`, {
        headers: { authorization: `Bearer ${token}` }
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json?.error || `HTTP ${res.status}`);
      }
      const json = await res.json();
      const lyrics = String(json?.song?.lyrics_chords ?? '');
      setApplyLyrics((m) => ({ ...m, [suggestionId]: lyrics }));
    } catch (e: any) {
      setError(e instanceof Error ? e.message : 'Falha ao carregar música.');
    } finally {
      setApplyLoading((m) => ({ ...m, [suggestionId]: false }));
    }
  };

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setEmail(data.session?.user.email ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setEmail(session?.user.email ?? null);
      void load();
    });
    void load();
    return () => {
      mounted = false;
      sub?.subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!email) {
    return (
      <div className="page" style={{ padding: 28, maxWidth: 1100, margin: '0 auto' }}>
        <div className="card glow">
          <h1 style={{ marginTop: 0 }}>Moderação</h1>
          <p className="muted">Entre com uma conta admin para acessar o painel.</p>
          <Link className="button secondary" href="/login">
            Entrar
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="page" style={{ padding: 28, maxWidth: 1100, margin: '0 auto' }}>
      <div className="card glow">
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ marginTop: 0, marginBottom: 8 }}>Moderação</h1>
            <p className="muted" style={{ margin: 0 }}>
              Aprovar/rejeitar sugestões, claims e videoaulas. “Aplicar e aprovar” salva a música e fecha a sugestão.
            </p>
          </div>
          <button className="button secondary" onClick={() => void load()} disabled={loading}>
            {loading ? 'Atualizando...' : 'Atualizar'}
          </button>
        </div>
        {error ? (
          <p className="muted" style={{ marginTop: 12 }}>
            Erro: {error}
          </p>
        ) : null}
      </div>

      <div className="card">
        <div className="tabs">
          <button className={`tab ${activeTab === 'sug' ? 'active' : ''}`} onClick={() => setActiveTab('sug')}>
            Sugestões ({counts.sug})
          </button>
          <button className={`tab ${activeTab === 'artist' ? 'active' : ''}`} onClick={() => setActiveTab('artist')}>
            Claims artista ({counts.artist})
          </button>
          <button className={`tab ${activeTab === 'song' ? 'active' : ''}`} onClick={() => setActiveTab('song')}>
            Claims música ({counts.song})
          </button>
          <button className={`tab ${activeTab === 'video' ? 'active' : ''}`} onClick={() => setActiveTab('video')}>
            Videoaulas ({counts.video})
          </button>
          <button className={`tab ${activeTab === 'tips' ? 'active' : ''}`} onClick={() => setActiveTab('tips')}>
            Dicas ({counts.tips})
          </button>
        </div>

        {activeTab === 'sug' ? (
          <div style={{ marginTop: 16, display: 'grid', gap: 14 }}>
            {(data?.suggestions ?? []).length ? (
              (data?.suggestions ?? []).map((s) => {
                const votes = data?.suggestionVotes?.[s.id] ?? { upvotes: 0, downvotes: 0 };
                const open = Boolean(applyOpen[s.id]);
                const currentLyrics = applyLyrics[s.id] ?? '';
                const isSongLoading = Boolean(applyLoading[s.id]);
                return (
                  <div key={s.id} className="card" style={{ padding: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                      <div style={{ minWidth: 280 }}>
                        <div className="badge" style={{ marginBottom: 8 }}>
                          {s.kind} · {votes.upvotes} confere · {votes.downvotes} não confere
                        </div>
                        <div style={{ fontWeight: 800 }}>{s.song_title}</div>
                        <div className="muted" style={{ marginTop: 2 }}>
                          {s.artist} · {new Date(s.created_at).toLocaleString('pt-BR')}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                        <button className="button secondary" onClick={() => void act({ type: 'song_suggestion', id: s.id, action: 'reject' })}>
                          Rejeitar
                        </button>
                        <button className="button secondary" onClick={() => void act({ type: 'song_suggestion', id: s.id, action: 'approve' })}>
                          Aprovar (sem aplicar)
                        </button>
                        <button
                          className="button"
                          onClick={() => {
                            setApplyOpen((m) => ({ ...m, [s.id]: !open }));
                            if (!open && !(s.id in applyLyrics)) void loadSongLyrics(s.id, s.song_id);
                          }}
                        >
                          {open ? 'Fechar aplicar' : 'Aplicar e aprovar'}
                        </button>
                      </div>
                    </div>

                    <pre
                      style={{
                        whiteSpace: 'pre-wrap',
                        background: 'rgba(0,0,0,0.03)',
                        border: '1px solid var(--border)',
                        borderRadius: 12,
                        padding: 12,
                        marginTop: 12,
                        fontSize: 13,
                        lineHeight: 1.45
                      }}
                    >
                      {s.text}
                    </pre>

                    {open ? (
                      <div style={{ marginTop: 12, display: 'grid', gap: 10 }}>
                        <div className="muted">Cole/edite o `lyrics_chords` final da música e clique para salvar.</div>
                        <textarea
                          className="input"
                          style={{ minHeight: 260, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12 }}
                          value={currentLyrics}
                          onChange={(e) => setApplyLyrics((m) => ({ ...m, [s.id]: e.target.value }))}
                          placeholder={isSongLoading ? 'Carregando cifra atual...' : 'Cole aqui a cifra final (lyrics_chords)'}
                        />
                        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                          <button
                            className="button secondary"
                            onClick={() => void loadSongLyrics(s.id, s.song_id)}
                            disabled={isSongLoading}
                          >
                            {isSongLoading ? 'Carregando...' : 'Recarregar cifra atual'}
                          </button>
                          <button
                            className="button"
                            onClick={() =>
                              void act({
                                type: 'song_suggestion',
                                id: s.id,
                                action: 'apply_and_approve',
                                lyrics_chords: applyLyrics[s.id] ?? ''
                              })
                            }
                          >
                            Salvar música e aprovar
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })
            ) : (
              <p className="muted" style={{ marginTop: 10 }}>
                Sem sugestões pendentes.
              </p>
            )}
          </div>
        ) : null}

        {activeTab === 'artist' ? (
          <div style={{ marginTop: 16, display: 'grid', gap: 14 }}>
            {(data?.artistClaims ?? []).length ? (
              (data?.artistClaims ?? []).map((c) => (
                <div key={c.id} className="card" style={{ padding: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ fontWeight: 800 }}>{c.artists?.name ?? 'Artista'}</div>
                      <div className="muted" style={{ marginTop: 2 }}>
                        {c.name} · {c.email}
                        {c.whatsapp ? ` · ${c.whatsapp}` : ''}
                        {c.instagram ? ` · @${c.instagram}` : ''}
                      </div>
                      <div className="muted" style={{ marginTop: 2 }}>
                        {new Date(c.created_at).toLocaleString('pt-BR')}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      <button className="button secondary" onClick={() => void act({ type: 'artist_claim', id: c.id, action: 'reject' })}>
                        Rejeitar
                      </button>
                      <button className="button secondary" onClick={() => void act({ type: 'artist_claim', id: c.id, action: 'approve' })}>
                        Aprovar (claim)
                      </button>
                      <button className="button" onClick={() => void act({ type: 'artist_claim', id: c.id, action: 'approve_and_verify' })}>
                        Aprovar e verificar
                      </button>
                    </div>
                  </div>
                  <pre
                    style={{
                      whiteSpace: 'pre-wrap',
                      background: 'rgba(0,0,0,0.03)',
                      border: '1px solid var(--border)',
                      borderRadius: 12,
                      padding: 12,
                      marginTop: 12,
                      fontSize: 13,
                      lineHeight: 1.45
                    }}
                  >
                    {c.message}
                  </pre>
                </div>
              ))
            ) : (
              <p className="muted" style={{ marginTop: 10 }}>
                Sem claims de artista pendentes.
              </p>
            )}
          </div>
        ) : null}

        {activeTab === 'song' ? (
          <div style={{ marginTop: 16, display: 'grid', gap: 14 }}>
            {(data?.songClaims ?? []).length ? (
              (data?.songClaims ?? []).map((c) => (
                <div key={c.id} className="card" style={{ padding: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ fontWeight: 800 }}>{c.song_title}</div>
                      <div className="muted" style={{ marginTop: 2 }}>
                        {c.artist} · {c.name} · {c.email}
                        {c.whatsapp ? ` · ${c.whatsapp}` : ''}
                        {c.instagram ? ` · @${c.instagram}` : ''}
                      </div>
                      <div className="muted" style={{ marginTop: 2 }}>
                        {new Date(c.created_at).toLocaleString('pt-BR')}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      <button className="button secondary" onClick={() => void act({ type: 'song_claim', id: c.id, action: 'reject' })}>
                        Rejeitar
                      </button>
                      <button className="button" onClick={() => void act({ type: 'song_claim', id: c.id, action: 'approve' })}>
                        Aprovar
                      </button>
                    </div>
                  </div>
                  <pre
                    style={{
                      whiteSpace: 'pre-wrap',
                      background: 'rgba(0,0,0,0.03)',
                      border: '1px solid var(--border)',
                      borderRadius: 12,
                      padding: 12,
                      marginTop: 12,
                      fontSize: 13,
                      lineHeight: 1.45
                    }}
                  >
                    {c.message}
                    {c.extra ? `\n\nExtra\n${c.extra}` : ''}
                  </pre>
                </div>
              ))
            ) : (
              <p className="muted" style={{ marginTop: 10 }}>
                Sem claims de música pendentes.
              </p>
            )}
          </div>
        ) : null}

        {activeTab === 'video' ? (
          <div style={{ marginTop: 16, display: 'grid', gap: 14 }}>
            {(data?.videoLessons ?? []).length ? (
              (data?.videoLessons ?? []).map((v) => (
                <div key={v.id} className="card" style={{ padding: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ fontWeight: 800 }}>{v.song_title}</div>
                      <div className="muted" style={{ marginTop: 2 }}>
                        {v.artist} · {v.name} · {v.email}
                        {v.whatsapp ? ` · ${v.whatsapp}` : ''}
                      </div>
                      <div className="muted" style={{ marginTop: 2 }}>
                        {new Date(v.created_at).toLocaleString('pt-BR')}
                      </div>
                      <div style={{ marginTop: 10 }}>
                        <a className="button secondary" href={v.youtube_url} target="_blank" rel="noreferrer">
                          Abrir YouTube
                        </a>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      <button className="button secondary" onClick={() => void act({ type: 'video_lesson', id: v.id, action: 'reject' })}>
                        Rejeitar
                      </button>
                      <button className="button" onClick={() => void act({ type: 'video_lesson', id: v.id, action: 'approve' })}>
                        Aprovar
                      </button>
                    </div>
                  </div>
                  {v.message ? (
                    <pre
                      style={{
                        whiteSpace: 'pre-wrap',
                        background: 'rgba(0,0,0,0.03)',
                        border: '1px solid var(--border)',
                        borderRadius: 12,
                        padding: 12,
                        marginTop: 12,
                        fontSize: 13,
                        lineHeight: 1.45
                      }}
                    >
                      {v.message}
                    </pre>
                  ) : null}
                </div>
              ))
            ) : (
              <p className="muted" style={{ marginTop: 10 }}>
                Sem videoaulas pendentes.
              </p>
            )}
          </div>
        ) : null}

        {activeTab === 'tips' ? (
          <div style={{ marginTop: 16, display: 'grid', gap: 14 }}>
            {(data?.executionTips ?? []).length ? (
              (data?.executionTips ?? []).map((t) => (
                <div key={t.id} className="card" style={{ padding: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                    <div>
                      <div className="badge" style={{ marginBottom: 8 }}>{t.kind}</div>
                      <div style={{ fontWeight: 800 }}>{t.song_title}</div>
                      <div className="muted" style={{ marginTop: 2 }}>
                        {t.artist} · {new Date(t.created_at).toLocaleString('pt-BR')}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      <button className="button secondary" onClick={() => void act({ type: 'execution_tip', id: t.id, action: 'reject' })}>
                        Rejeitar
                      </button>
                      <button className="button" onClick={() => void act({ type: 'execution_tip', id: t.id, action: 'approve' })}>
                        Aprovar
                      </button>
                    </div>
                  </div>
                  <pre
                    style={{
                      whiteSpace: 'pre-wrap',
                      background: 'rgba(0,0,0,0.03)',
                      border: '1px solid var(--border)',
                      borderRadius: 12,
                      padding: 12,
                      marginTop: 12,
                      fontSize: 13,
                      lineHeight: 1.45
                    }}
                  >
                    {t.text}
                  </pre>
                </div>
              ))
            ) : (
              <p className="muted" style={{ marginTop: 10 }}>
                Sem dicas pendentes.
              </p>
            )}
          </div>
        ) : null}
      </div>

      <div className="card">
        <p className="muted" style={{ margin: 0 }}>
          Acesso: configure `ADMIN_EMAILS` (lista separada por vírgula) e `SUPABASE_SERVICE_ROLE_KEY` no ambiente do web.
        </p>
      </div>
    </div>
  );
}


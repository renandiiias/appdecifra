'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import { normalizeSearch } from '@cifras/shared';

export default function FavoritosPage() {
  const [favorites, setFavorites] = useState<any[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      const user = data.session?.user;
      if (!mounted) return;
      setUserId(user?.id ?? null);
      if (!user) {
        setLoading(false);
        return;
      }
      supabase
        .from('favorites')
        .select('song_id, songs(*)')
        .eq('user_id', user.id)
        .then(({ data }) => {
          if (mounted) {
            setFavorites(data ?? []);
            setLoading(false);
          }
        });
    });
    return () => {
      mounted = false;
    };
  }, []);

  const filtered = useMemo(() => {
    if (!query) return favorites;
    const q = normalizeSearch(query);
    return favorites.filter((fav) =>
      normalizeSearch(fav.songs?.title ?? '').includes(q)
    );
  }, [favorites, query]);

  if (!userId && !loading) {
    return (
      <div className="card empty-state">
        <h1>Favoritos</h1>
        <p className="muted">Você precisa entrar para ver seus favoritos.</p>
        <Link className="button" href="/login">Entrar</Link>
      </div>
    );
  }

  return (
    <div className="page">
      <section className="card glow page-header">
        <div>
          <h1 className="page-title">Favoritos</h1>
          <p className="page-subtitle">Suas cifras salvas para acesso rápido.</p>
        </div>
        <input
          className="input"
          placeholder="Buscar nos favoritos"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </section>
      <section className="card">
        {loading ? (
          <p className="muted">Carregando...</p>
        ) : (
          <div className="list">
            {filtered.map((fav) => (
              <Link key={fav.song_id} href={`/cifra/${fav.song_id}`}>
                <div className="list-item">
                  <div className="list-info">
                    <span className="list-title">{fav.songs?.title}</span>
                    <span className="list-meta">{fav.songs?.category ?? 'Louvor'}</span>
                  </div>
                  <span className="badge">Abrir</span>
                </div>
              </Link>
            ))}
            {!filtered.length && <p className="muted">Nenhum favorito ainda.</p>}
          </div>
        )}
      </section>
    </div>
  );
}

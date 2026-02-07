'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import { supabase } from '@/lib/supabaseClient';

export default function FavoriteButton({ songId, className }: { songId: string; className?: string }) {
  const [userId, setUserId] = useState<string | null>(null);
  const [isFavorite, setIsFavorite] = useState(false);
  const [loading, setLoading] = useState(true);

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
        .select('song_id')
        .eq('song_id', songId)
        .eq('user_id', user.id)
        .maybeSingle()
        .then(({ data }) => {
          if (mounted) {
            setIsFavorite(!!data);
            setLoading(false);
          }
        });
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user.id ?? null);
    });

    return () => {
      mounted = false;
      subscription?.subscription.unsubscribe();
    };
  }, [songId]);

  if (!userId) {
    return (
      <Link className={clsx('button', className)} href="/login">
        <span className="favorite-icon" aria-hidden>
          ♡
        </span>
        Entrar para favoritar
      </Link>
    );
  }

  return (
    <button
      className={clsx('button', className)}
      disabled={loading}
      aria-pressed={isFavorite}
      onClick={async () => {
        if (isFavorite) {
          await supabase.from('favorites').delete().eq('song_id', songId).eq('user_id', userId);
          setIsFavorite(false);
        } else {
          await supabase.from('favorites').insert({ song_id: songId, user_id: userId });
          setIsFavorite(true);
        }
      }}
    >
      <span className="favorite-icon" aria-hidden>
        {isFavorite ? '♥' : '♡'}
      </span>
      {isFavorite ? 'Cifra favoritada' : 'Favoritar cifra'}
    </button>
  );
}

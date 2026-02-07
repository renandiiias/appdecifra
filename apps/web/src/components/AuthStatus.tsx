'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';

export default function AuthStatus() {
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (mounted) setEmail(data.session?.user.email ?? null);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      setEmail(session?.user.email ?? null);
    });

    return () => {
      mounted = false;
      subscription?.subscription.unsubscribe();
    };
  }, []);

  if (!email) {
    return (
      <Link className="button secondary" href="/login">
        Entrar
      </Link>
    );
  }

  return (
    <button
      className="button secondary"
      onClick={() => supabase.auth.signOut()}
    >
      Sair ({email})
    </button>
  );
}

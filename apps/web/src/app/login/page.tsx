'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
    if (authError) {
      setError(authError.message);
      return;
    }
    router.push('/');
  };

  return (
    <div className="auth-layout">
      <div className="card glow auth-card">
        <h1 style={{ marginTop: 0 }}>Entrar</h1>
        <p className="muted">Acesse sua conta para salvar favoritos.</p>
        <form onSubmit={submit} style={{ display: 'grid', gap: 12 }}>
          <input
            className="input"
            type="email"
            placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          className="input"
          type="password"
          placeholder="Senha"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {error && <p className="muted">{error}</p>}
          <button className="button" type="submit">Entrar</button>
        </form>
        <p className="muted">Ainda não tem conta? <Link href="/cadastro">Cadastre-se</Link></p>
      </div>
    </div>
  );
}

import Link from 'next/link';

export default function EnviarCifraPage() {
  return (
    <div className="page">
      <section className="card glow page-header">
        <div>
          <h1 className="page-title">Enviar cifra</h1>
          <p className="page-subtitle">
            Compartilhe sua cifra com a comunidade e ajude outros músicos do louvor.
          </p>
        </div>
      </section>

      <section className="card" style={{ display: 'grid', gap: 12, maxWidth: 720 }}>
        <p className="muted" style={{ margin: 0 }}>
          Para manter a qualidade do catálogo, recebemos envios apenas de usuários autenticados.
        </p>
        <div style={{ display: 'grid', gap: 8 }}>
          <strong>Como funciona:</strong>
          <span className="muted">1. Crie sua conta ou entre no app.</span>
          <span className="muted">2. Envie a música com tom, cifra e observações.</span>
          <span className="muted">3. O time editorial revisa e publica no catálogo.</span>
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Link className="button" href="/cadastro">Criar conta</Link>
          <Link className="button ghost" href="/login">Já tenho conta</Link>
        </div>
      </section>
    </div>
  );
}

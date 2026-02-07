import Link from 'next/link';

export default function ManutencaoPage() {
  return (
    <div className="page">
      <section className="card" style={{ display: 'grid', gap: 12, maxWidth: 540 }}>
        <h1 style={{ margin: 0 }}>Estamos ajustando esta página</h1>
        <p className="muted">
          Esta área está em manutenção enquanto finalizamos novas funcionalidades. Volte em breve.
        </p>
        <Link className="button" href="/">Voltar para a home</Link>
      </section>
    </div>
  );
}

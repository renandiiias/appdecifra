'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

type DashboardPayload = {
  ok?: boolean;
  stale?: boolean;
  error?: string;
  generated_at_utc?: string;
  cached?: boolean;
  cache_age_ms?: number;
  source?: {
    db_files?: number;
    songs_done_unique_song_key?: number;
    artists_done_unique_slug?: number;
    status_counts?: Record<string, number>;
  };
  supabase?: {
    connected?: boolean;
    songs_total?: number;
    artists_total?: number;
    song_sections_total?: number;
    songs_with_source_song_key?: number;
    songs_with_source_processed_at?: number;
    artists_with_source_slug?: number;
  };
  pipeline?: {
    songs_transferred?: number;
    artists_transferred?: number;
    songs_remaining?: number;
    artists_remaining?: number;
    songs_completion_pct?: number;
    artists_completion_pct?: number;
    last_sync_utc?: string;
    lag_seconds?: number | null;
    state_initialized?: boolean;
    last_cycle?: {
      cycle?: number;
      candidates?: number;
      inserted?: number;
      skipped?: number;
      missing_json?: number;
      bad_rows?: number;
      sections?: number;
      patched?: number;
      artifacts?: number;
      elapsed_seconds?: number;
    } | null;
  };
};

const REFRESH_MS = 15_000;

function formatInt(value: number | null | undefined): string {
  if (typeof value !== 'number' || Number.isNaN(value) || value < 0) return '--';
  return value.toLocaleString('pt-BR');
}

function formatPct(value: number | null | undefined): string {
  if (typeof value !== 'number' || Number.isNaN(value)) return '--';
  return `${value.toFixed(2).replace('.', ',')}%`;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '--';
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return '--';
  return dt.toLocaleString('pt-BR');
}

function formatLag(seconds: number | null | undefined): string {
  if (typeof seconds !== 'number' || seconds < 0) return '--';
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 60) return `${m}m ${s}s`;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${h}h ${mm}m`;
}

export default function IngestionLiveDashboard() {
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastFetchAt, setLastFetchAt] = useState<Date | null>(null);

  const load = useCallback(async (force = false) => {
    try {
      if (force) setLoading(true);
      setRefreshing(true);
      const query = force ? '?refresh=1' : '';
      const response = await fetch(`/api/ingestion/live${query}`, { cache: 'no-store' });
      const payload = (await response.json()) as DashboardPayload;
      setData(payload);
      setLastFetchAt(new Date());
    } catch (error) {
      setData((prev) => ({
        ...(prev || {}),
        ok: false,
        error: error instanceof Error ? error.message : 'Falha ao atualizar'
      }));
      setLastFetchAt(new Date());
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load(true);
    const timer = setInterval(() => {
      void load(false);
    }, REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  const songsCompletion = useMemo(() => {
    const value = data?.pipeline?.songs_completion_pct;
    if (typeof value !== 'number' || Number.isNaN(value)) return 0;
    return Math.max(0, Math.min(100, value));
  }, [data?.pipeline?.songs_completion_pct]);

  const artistsCompletion = useMemo(() => {
    const value = data?.pipeline?.artists_completion_pct;
    if (typeof value !== 'number' || Number.isNaN(value)) return 0;
    return Math.max(0, Math.min(100, value));
  }, [data?.pipeline?.artists_completion_pct]);

  return (
    <section className="card ingestion-live">
      <div className="ingestion-live__header">
        <div>
          <h1 className="ingestion-live__title">Painel Live de Transferência</h1>
          <p className="ingestion-live__subtitle">
            Fonte do scraping x base de produção (Supabase), com atualização automática a cada 15s.
          </p>
        </div>
        <div className="ingestion-live__actions">
          <span className={`ingestion-pill ${data?.ok ? 'ok' : 'warn'}`}>
            {data?.ok ? 'Operando' : 'Atenção'}
          </span>
          <span className={`ingestion-pill ${data?.stale ? 'warn' : 'ok'}`}>
            {data?.stale ? 'Dados em cache' : 'Live'}
          </span>
          <button className="button secondary" onClick={() => void load(true)} disabled={refreshing}>
            {refreshing ? 'Atualizando...' : 'Atualizar agora'}
          </button>
        </div>
      </div>

      <div className="ingestion-meta-line">
        <span>Última leitura: {lastFetchAt ? formatDate(lastFetchAt.toISOString()) : '--'}</span>
        <span>Snapshot: {formatDate(data?.generated_at_utc)}</span>
        <span>Lag sync: {formatLag(data?.pipeline?.lag_seconds)}</span>
      </div>

      {data?.error ? <p className="ingestion-error">{data.error}</p> : null}

      {loading ? (
        <div className="ingestion-loading">Carregando métricas...</div>
      ) : (
        <>
          <div className="ingestion-grid">
            <article className="ingestion-kpi">
              <h3>Fonte: músicas</h3>
              <strong>{formatInt(data?.source?.songs_done_unique_song_key)}</strong>
            </article>
            <article className="ingestion-kpi">
              <h3>Produção: músicas</h3>
              <strong>{formatInt(data?.supabase?.songs_with_source_song_key)}</strong>
            </article>
            <article className="ingestion-kpi">
              <h3>Faltando músicas</h3>
              <strong>{formatInt(data?.pipeline?.songs_remaining)}</strong>
            </article>
            <article className="ingestion-kpi">
              <h3>Cobertura músicas</h3>
              <strong>{formatPct(data?.pipeline?.songs_completion_pct)}</strong>
            </article>

            <article className="ingestion-kpi">
              <h3>Fonte: artistas</h3>
              <strong>{formatInt(data?.source?.artists_done_unique_slug)}</strong>
            </article>
            <article className="ingestion-kpi">
              <h3>Produção: artistas</h3>
              <strong>{formatInt(data?.supabase?.artists_with_source_slug)}</strong>
            </article>
            <article className="ingestion-kpi">
              <h3>Faltando artistas</h3>
              <strong>{formatInt(data?.pipeline?.artists_remaining)}</strong>
            </article>
            <article className="ingestion-kpi">
              <h3>Cobertura artistas</h3>
              <strong>{formatPct(data?.pipeline?.artists_completion_pct)}</strong>
            </article>
          </div>

          <div className="ingestion-progress-grid">
            <article className="ingestion-progress-card">
              <div className="ingestion-progress-head">
                <span>Músicas</span>
                <strong>{formatPct(data?.pipeline?.songs_completion_pct)}</strong>
              </div>
              <div className="ingestion-progress-track">
                <span style={{ width: `${songsCompletion}%` }} />
              </div>
              <small>
                {formatInt(data?.pipeline?.songs_transferred)} transferidas de {formatInt(data?.source?.songs_done_unique_song_key)}
              </small>
            </article>

            <article className="ingestion-progress-card">
              <div className="ingestion-progress-head">
                <span>Artistas</span>
                <strong>{formatPct(data?.pipeline?.artists_completion_pct)}</strong>
              </div>
              <div className="ingestion-progress-track">
                <span style={{ width: `${artistsCompletion}%` }} />
              </div>
              <small>
                {formatInt(data?.pipeline?.artists_transferred)} transferidos de {formatInt(data?.source?.artists_done_unique_slug)}
              </small>
            </article>
          </div>

          <div className="ingestion-grid ingestion-grid--infra">
            <article className="ingestion-kpi">
              <h3>DBs da fonte</h3>
              <strong>{formatInt(data?.source?.db_files)}</strong>
            </article>
            <article className="ingestion-kpi">
              <h3>Músicas em produção</h3>
              <strong>{formatInt(data?.supabase?.songs_total)}</strong>
            </article>
            <article className="ingestion-kpi">
              <h3>Artistas em produção</h3>
              <strong>{formatInt(data?.supabase?.artists_total)}</strong>
            </article>
            <article className="ingestion-kpi">
              <h3>Seções categorizadas</h3>
              <strong>{formatInt(data?.supabase?.song_sections_total)}</strong>
            </article>
          </div>

          <article className="ingestion-cycle card glow">
            <h3>Ciclo mais recente do sync</h3>
            {data?.pipeline?.last_cycle ? (
              <div className="ingestion-cycle-grid">
                <span>Ciclo #{formatInt(data.pipeline.last_cycle.cycle)}</span>
                <span>Candidatas: {formatInt(data.pipeline.last_cycle.candidates)}</span>
                <span>Inseridas: {formatInt(data.pipeline.last_cycle.inserted)}</span>
                <span>Puladas: {formatInt(data.pipeline.last_cycle.skipped)}</span>
                <span>Seções: {formatInt(data.pipeline.last_cycle.sections)}</span>
                <span>Patched: {formatInt(data.pipeline.last_cycle.patched)}</span>
                <span>Erros de linha: {formatInt(data.pipeline.last_cycle.bad_rows)}</span>
                <span>Tempo: {typeof data.pipeline.last_cycle.elapsed_seconds === 'number' ? `${data.pipeline.last_cycle.elapsed_seconds.toFixed(1)}s` : '--'}</span>
              </div>
            ) : (
              <p className="muted">Sem ciclo recente encontrado no log.</p>
            )}
          </article>
        </>
      )}
    </section>
  );
}

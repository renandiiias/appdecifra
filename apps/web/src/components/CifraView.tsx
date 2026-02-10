'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  extractChords,
  tokenizeLine,
  transposeChord,
  transposeTokens,
  type Token
} from '@cifras/shared';
import { useRouter } from 'next/navigation';
import ChordDiagram from './ChordDiagram';
import FavoriteButton from './FavoriteButton';

const THEME_STORAGE_KEY = 'cifras-theme';
const INSTRUMENT_TABS = ['Violão e guitarra', 'Teclado', 'Cavaco', 'Ukulele', 'Viola caipira'] as const;

export type SongData = {
  id: string;
  title: string;
  lyrics_chords: string;
  original_key: string;
  tuning: string | null;
  capo: number | null;
  category: string | null;
  views?: number | null;
  artists?: { name: string } | null;
};

function hashHue(value: string) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) % 360;
  }
  return hash;
}

export default function CifraView({ song, sharedVersion }: { song: SongData; sharedVersion?: boolean }) {
  const router = useRouter();
  const [semitones, setSemitones] = useState(0);
  const [fontSize, setFontSize] = useState(16);
  const [autoScroll, setAutoScroll] = useState(false);
  const [speed, setSpeed] = useState(0.6);
  const [showDiagrams, setShowDiagrams] = useState(true);
  const [leftHanded, setLeftHanded] = useState(false);
  const [theater, setTheater] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [selectedChord, setSelectedChord] = useState<string | null>(null);
  const scrollInterval = useRef<number | null>(null);
  const chordsSectionRef = useRef<HTMLElement | null>(null);
  const [instrumentTab, setInstrumentTab] = useState<(typeof INSTRUMENT_TABS)[number]>('Violão e guitarra');

  useEffect(() => {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY) as 'light' | 'dark' | null;
    if (stored) {
      setDarkMode(stored === 'dark');
    }
  }, []);

  useEffect(() => {
    if (!autoScroll) {
      if (scrollInterval.current) window.clearInterval(scrollInterval.current);
      return;
    }

    scrollInterval.current = window.setInterval(() => {
      window.scrollBy(0, speed);
    }, 30);

    return () => {
      if (scrollInterval.current) window.clearInterval(scrollInterval.current);
    };
  }, [autoScroll, speed]);

  useEffect(() => {
    const theme = darkMode ? 'dark' : 'light';
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [darkMode]);

  const lines = useMemo(() => song.lyrics_chords.split(/\r?\n/), [song.lyrics_chords]);
  const tokens = useMemo(() => lines.map((line) => tokenizeLine(line)), [lines]);
  const transposedTokens = useMemo(
    () => tokens.map((line) => transposeTokens(line, semitones)),
    [tokens, semitones]
  );

  const chords = useMemo(() => {
    const list = extractChords(song.lyrics_chords).map((chord) => transposeChord(chord, semitones));
    return Array.from(new Set(list));
  }, [song.lyrics_chords, semitones]);

  const currentKey = transposeChord(song.original_key, semitones);
  const shapeKey = currentKey;
  const soundingKey = song.capo !== null ? transposeChord(shapeKey, song.capo) : shapeKey;

  const renderLine = (lineTokens: Token[], index: number) => (
    <div key={`${index}-${lineTokens.length}`} className="cifra-line">
      {lineTokens.map((token, idx) => {
        if (token.type === 'chord') {
          return (
            <span
              key={`${index}-c-${idx}`}
              className="chord chord-token"
              onClick={() => setSelectedChord(token.value)}
            >
              {token.value}
            </span>
          );
        }
        return <span key={`${index}-t-${idx}`}>{token.value}</span>;
      })}
    </div>
  );

  const artistName = song.artists?.name ?? 'Artista';
  const category = song.category ?? 'Louvor';
  const avatarHue = useMemo(() => hashHue(`${artistName}-${category}`), [artistName, category]);
  const artistInitial = useMemo(() => (artistName.trim()[0] ?? 'A').toUpperCase(), [artistName]);
  const viewsLabel =
    song.views !== null && song.views !== undefined ? `${song.views.toLocaleString('pt-BR')} exibições` : null;

  const scrollToChords = () => chordsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <div className={theater ? 'song-page song-page--theater' : 'song-page'}>
      <div className="breadcrumb song-breadcrumb">
        página inicial · {category} · {artistName} · <span>{song.title}</span>
      </div>

      <div className="song-layout">
        <aside className="song-left">
          <div className="song-avatar" style={{ ['--avatar-hue' as any]: avatarHue }}>
            <div className="song-avatar__image" aria-hidden>
              {artistInitial}
            </div>
          </div>

          <div className="card song-side-card">
            <button className="side-button active" type="button">
              Videoaula
            </button>
            <button
              className={autoScroll ? 'side-button side-button--toggled' : 'side-button'}
              type="button"
              onClick={() => setAutoScroll((v) => !v)}
            >
              Auto rolagem
            </button>

            <div className="song-side-divider" />

            <div className="control-group">
              <span className="control-label">Tom</span>
              <div className="song-key-row">
                <button className="key-step" type="button" onClick={() => setSemitones((s) => s - 1)}>
                  −
                </button>
                <div className="key-pill">
                  <div className="key-pill__label">Tom</div>
                  <div className="key-pill__value">{soundingKey}</div>
                </div>
                <button className="key-step" type="button" onClick={() => setSemitones((s) => s + 1)}>
                  +
                </button>
              </div>
              <button className="side-button side-button--compact" type="button" onClick={() => setSemitones(0)}>
                Voltar ao original
              </button>
            </div>

            {autoScroll && (
              <div className="control-group">
                <span className="control-label">Velocidade</span>
                <label className="control-pill">
                  <input
                    className="control-slider"
                    type="range"
                    min="0.2"
                    max="2"
                    step="0.1"
                    value={speed}
                    onChange={(e) => setSpeed(Number(e.target.value))}
                  />
                  <span className="song-side-muted">{speed.toFixed(1)}x</span>
                </label>
              </div>
            )}

            <div className="control-group">
              <span className="control-label">Texto</span>
              <label className="control-pill">
                <input
                  className="control-slider"
                  type="range"
                  min="14"
                  max="24"
                  step="1"
                  value={fontSize}
                  onChange={(e) => setFontSize(Number(e.target.value))}
                />
                <span className="song-side-muted">{fontSize}px</span>
              </label>
            </div>

            <div className="control-group">
              <span className="control-label">Exibir</span>
              <label className="control-pill">
                <input type="checkbox" checked={darkMode} onChange={(e) => setDarkMode(e.target.checked)} />
                Modo noturno
              </label>
              <label className="control-pill">
                <input type="checkbox" checked={theater} onChange={(e) => setTheater(e.target.checked)} />
                Modo teatro
              </label>
            </div>

            <div className="control-group">
              <span className="control-label">Acordes</span>
              <button className="side-button" type="button" onClick={scrollToChords}>
                Ver acordes usados
              </button>
              <label className="control-pill">
                <input type="checkbox" checked={showDiagrams} onChange={(e) => setShowDiagrams(e.target.checked)} />
                Mostrar diagramas
              </label>
              <label className="control-pill">
                <input type="checkbox" checked={leftHanded} onChange={(e) => setLeftHanded(e.target.checked)} />
                Canhoto
              </label>
            </div>
          </div>
        </aside>

        <div className="song-center">
          <header className="song-header">
            {sharedVersion ? (
              <div
                className="card"
                style={{
                  padding: '10px 12px',
                  marginBottom: 12,
                  borderRadius: 14,
                  background: 'var(--accent-soft)',
                  border: '1px solid var(--border)',
                  fontWeight: 700
                }}
              >
                Versão compartilhada: esta cifra pode ter alterações feitas por outra pessoa.
              </div>
            ) : null}
            <div className="song-title-row">
              <div>
                <h1 className="song-title">{song.title}</h1>
                <div className="song-artist">{artistName}</div>
              </div>
              {viewsLabel ? <div className="song-views">{viewsLabel}</div> : null}
            </div>

            <div className="song-meta-actions">
              <FavoriteButton songId={song.id} className="favorite-pill" />
            </div>

            <div className="song-info">
              <div className="song-info-line">
                Tom: <span className="song-info-accent">{soundingKey}</span>
              </div>
              {song.capo !== null ? (
                <div className="song-info-line">
                  Forma dos acordes no tom de <span className="song-info-accent">{shapeKey}</span>
                </div>
              ) : null}
              {song.capo !== null ? (
                <div className="song-info-line">
                  Capotraste na <span className="song-info-accent">{song.capo}ª</span> casa
                </div>
              ) : null}
              <div className="song-info-line">
                Afinação: <span className="song-info-accent">{song.tuning ?? 'E A D G B E'}</span>
              </div>
            </div>
          </header>

          <section className="card song-sheet" style={theater ? { background: '#141414', color: '#f8fafc' } : undefined}>
            <div className="cifra" style={{ fontSize }}>
              {transposedTokens.map(renderLine)}
            </div>
          </section>

          <button className="floating-action" type="button" onClick={scrollToChords}>
            Acordes
          </button>

          <section className="card song-chords" ref={chordsSectionRef}>
            <div className="song-chords-header">
              <div className="song-chords-title">Acordes</div>
              <div className="song-instruments">
                {INSTRUMENT_TABS.map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    className={tab === instrumentTab ? 'song-tab song-tab--active' : 'song-tab'}
                    onClick={() => {
                      if (tab !== 'Violão e guitarra') {
                        router.push('/manutencao');
                        return;
                      }
                      setInstrumentTab(tab);
                    }}
                  >
                    {tab}
                  </button>
                ))}
              </div>
            </div>

            {showDiagrams ? (
              <div className="song-diagrams">
                {chords.map((chord) => (
                  <div key={chord} className="song-diagram-card">
                    <div className="song-diagram-title">{chord}</div>
                    <ChordDiagram chord={chord} leftHanded={leftHanded} />
                  </div>
                ))}
              </div>
            ) : (
              <div className="muted">Diagramas ocultos.</div>
            )}
          </section>
        </div>

        <aside className="song-right">
          <div className="song-video" style={{ ['--avatar-hue' as any]: avatarHue }}>
            <div className="song-video__play">▶</div>
            <div className="song-video__label">Vídeo</div>
          </div>
          <div className="song-right-note">
            <div className="muted">
              Videoaula e recursos avançados ainda não estão disponíveis no MVP.
            </div>
          </div>
        </aside>
      </div>

      {selectedChord && (
        <div className="modal-backdrop" onClick={() => setSelectedChord(null)}>
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>{selectedChord}</h3>
            <ChordDiagram chord={selectedChord} leftHanded={leftHanded} />
            <button className="button" onClick={() => setSelectedChord(null)}>Fechar</button>
          </div>
        </div>
      )}
    </div>
  );
}

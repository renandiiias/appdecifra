'use client';

import { useEffect, useRef, useState } from 'react';

const noteStrings = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const log2 = (value: number) => Math.log(value) / Math.log(2);

type TunerMode = 'auto' | 'string';
type GuitarTuning = 'standard' | 'half';

type GuitarString = {
  id: string;
  label: string;
  midi: number;
};

const STRINGS_BY_TUNING: Record<GuitarTuning, GuitarString[]> = {
  standard: [
    { id: 'E2', label: 'E', midi: 40 },
    { id: 'A2', label: 'A', midi: 45 },
    { id: 'D3', label: 'D', midi: 50 },
    { id: 'G3', label: 'G', midi: 55 },
    { id: 'B3', label: 'B', midi: 59 },
    { id: 'E4', label: 'E agudo', midi: 64 }
  ],
  half: [
    { id: 'Eb2', label: 'Eb', midi: 39 },
    { id: 'Ab2', label: 'Ab', midi: 44 },
    { id: 'Db3', label: 'Db', midi: 49 },
    { id: 'Gb3', label: 'Gb', midi: 54 },
    { id: 'Bb3', label: 'Bb', midi: 58 },
    { id: 'Eb4', label: 'Eb agudo', midi: 63 }
  ]
};

function noteFromPitch(frequency: number) {
  const noteNum = 12 * (Math.log(frequency / 440) / Math.log(2));
  return Math.round(noteNum) + 69;
}

function frequencyFromNoteNumber(note: number) {
  return 440 * Math.pow(2, (note - 69) / 12);
}

function centsOffFromPitch(frequency: number, note: number) {
  return Math.floor(1200 * Math.log(frequency / frequencyFromNoteNumber(note)) / Math.log(2));
}

function centsBetweenFrequencies(frequency: number, targetFrequency: number) {
  return 1200 * log2(frequency / targetFrequency);
}

function wrapCents(value: number) {
  let cents = value;
  while (cents > 600) cents -= 1200;
  while (cents < -600) cents += 1200;
  return cents;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function autoCorrelate(buffer: Float32Array, sampleRate: number) {
  let size = buffer.length;
  let rms = 0;

  for (let i = 0; i < size; i += 1) {
    const value = buffer[i];
    rms += value * value;
  }
  rms = Math.sqrt(rms / size);
  if (rms < 0.01) return -1;

  let r1 = 0;
  let r2 = size - 1;
  const threshold = 0.2;
  while (r1 < size / 2 && Math.abs(buffer[r1]) < threshold) r1 += 1;
  while (r2 > size / 2 && Math.abs(buffer[r2]) < threshold) r2 -= 1;

  buffer = buffer.slice(r1, r2);
  size = buffer.length;

  const c = new Array(size).fill(0);
  for (let i = 0; i < size; i += 1) {
    for (let j = 0; j < size - i; j += 1) {
      c[i] = c[i] + buffer[j] * buffer[j + i];
    }
  }

  let d = 0;
  while (c[d] > c[d + 1]) d += 1;

  let maxValue = -1;
  let maxPos = -1;
  for (let i = d; i < size; i += 1) {
    if (c[i] > maxValue) {
      maxValue = c[i];
      maxPos = i;
    }
  }

  let T0 = maxPos;
  const x1 = c[T0 - 1];
  const x2 = c[T0];
  const x3 = c[T0 + 1];
  const a = (x1 + x3 - 2 * x2) / 2;
  const b = (x3 - x1) / 2;
  if (a) T0 = T0 - b / (2 * a);

  return sampleRate / T0;
}

export default function AfinadorPage() {
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const smoothFreqRef = useRef<number | null>(null);
  const [active, setActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<TunerMode>('auto');
  const [tuning, setTuning] = useState<GuitarTuning>('standard');
  const [selectedStringIndex, setSelectedStringIndex] = useState(0);
  const [pitch, setPitch] = useState<{
    frequency: number;
    noteNumber: number;
    noteName: string;
    cents: number;
  } | null>(null);

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((track) => track.stop());
      audioContextRef.current?.close();
    };
  }, []);

  const updatePitch = () => {
    const analyser = analyserRef.current;
    const audioContext = audioContextRef.current;
    if (!analyser || !audioContext) return;
    const bufferLength = analyser.fftSize;
    const buffer = new Float32Array(bufferLength);
    analyser.getFloatTimeDomainData(buffer);
    const detected = autoCorrelate(buffer, audioContext.sampleRate);
    if (detected !== -1) {
      const smoothed =
        smoothFreqRef.current === null ? detected : smoothFreqRef.current * 0.86 + detected * 0.14;
      smoothFreqRef.current = smoothed;

      const noteNumber = noteFromPitch(smoothed);
      const noteName = noteStrings[noteNumber % 12];
      const cents = centsOffFromPitch(smoothed, noteNumber);
      setPitch({ frequency: smoothed, noteNumber, noteName, cents });
    }
    rafRef.current = requestAnimationFrame(updatePitch);
  };

  const start = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const audioContext = new AudioContext();
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 4096;
      analyser.smoothingTimeConstant = 0.2;
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);
      audioContextRef.current = audioContext;
      analyserRef.current = analyser;
      smoothFreqRef.current = null;
      setActive(true);
      updatePitch();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Não foi possível acessar o microfone.';
      setError(message);
      setActive(false);
    }
  };

  const stop = async () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    await audioContextRef.current?.close();
    analyserRef.current = null;
    audioContextRef.current = null;
    setActive(false);
    smoothFreqRef.current = null;
    setPitch(null);
  };

  const strings = STRINGS_BY_TUNING[tuning];
  const selectedString = strings[selectedStringIndex] ?? strings[0];
  const targetFrequency = selectedString ? frequencyFromNoteNumber(selectedString.midi) : null;

  const display = (() => {
    if (!pitch) return null;
    if (mode === 'auto') {
      return {
        title: pitch.noteName,
        subtitle: `Detectado`,
        cents: pitch.cents
      };
    }

    if (!targetFrequency) return null;
    const cents = wrapCents(centsBetweenFrequencies(pitch.frequency, targetFrequency));
    return {
      title: selectedString.label.split(' ')[0] ?? selectedString.label,
      subtitle: `Corda: ${selectedString.label}`,
      cents
    };
  })();

  const guessedString = (() => {
    if (!pitch) return null;
    let bestIndex = 0;
    let bestAbs = Number.POSITIVE_INFINITY;
    for (let i = 0; i < strings.length; i += 1) {
      const base = frequencyFromNoteNumber(strings[i].midi);
      const cents = wrapCents(centsBetweenFrequencies(pitch.frequency, base));
      const abs = Math.abs(cents);
      if (abs < bestAbs) {
        bestAbs = abs;
        bestIndex = i;
      }
    }
    return { index: bestIndex, cents: bestAbs };
  })();

  const cents = display?.cents ?? null;
  const centsClamped = cents === null ? null : clamp(cents, -50, 50);
  const needleAngle = centsClamped === null ? 0 : (centsClamped / 50) * 90;

  const status = (() => {
    if (cents === null) return { label: 'Aguardando sinal', kind: 'idle' as const };
    const abs = Math.abs(cents);
    if (abs <= 5) return { label: 'Afinado', kind: 'ok' as const };
    if (cents < 0) return { label: abs > 25 ? 'Muito abaixo' : 'Abaixo', kind: 'flat' as const };
    return { label: abs > 25 ? 'Muito acima' : 'Acima', kind: 'sharp' as const };
  })();

  return (
    <div className="page">
      <section className="card glow page-header">
        <div>
          <h1 className="page-title">Afinador</h1>
          <p className="page-subtitle">Ponteiro em tempo real, com modo geral e por corda.</p>
        </div>
        <div className="controls">
          {!active ? (
            <button className="button" onClick={start}>Ativar microfone</button>
          ) : (
            <button className="button secondary" onClick={stop}>Parar</button>
          )}
        </div>
      </section>

      <section className="tuner-grid">
        <div className="tuner-display">
          <div className="tuner-display-top">
            <div>
              <p className="tuner-kicker">{mode === 'auto' ? 'Geral' : 'Por corda'}</p>
              <h2 className="tuner-note">{display?.title ?? '--'}</h2>
              <p className="tuner-sub">
                {pitch ? `${pitch.frequency.toFixed(2)} Hz` : active ? 'Aguardando sinal' : 'Microfone desligado'}
              </p>
            </div>
            <div className="tuner-display-meta">
              <span className={`tuner-status ${status.kind}`}>{status.label}</span>
              {mode === 'auto' && guessedString ? (
                <span className="tuner-hint">Corda sugerida: {strings[guessedString.index]?.label}</span>
              ) : (
                <span className="tuner-hint">{display?.subtitle ?? 'Toque uma corda por vez'}</span>
              )}
            </div>
          </div>

          <div className="tuner-dial" aria-hidden="true">
            <svg className="tuner-dial-svg" viewBox="0 0 320 190">
              <path
                d="M40 160 A120 120 0 0 0 280 160"
                stroke="rgba(255,255,255,0.22)"
                strokeWidth="10"
                strokeLinecap="round"
                fill="none"
              />

              {([-50, -25, 0, 25, 50] as const).map((tick) => {
                const angle = (tick / 50) * 90;
                const rad = (angle * Math.PI) / 180;
                const x1 = 160 + 102 * Math.sin(rad);
                const y1 = 160 - 102 * Math.cos(rad);
                const x2 = 160 + 120 * Math.sin(rad);
                const y2 = 160 - 120 * Math.cos(rad);
                const isCenter = tick === 0;
                return (
                  <line
                    key={`tick-${tick}`}
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    stroke={isCenter ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.35)'}
                    strokeWidth={isCenter ? 4 : 2}
                    strokeLinecap="round"
                  />
                );
              })}

              <g transform={`rotate(${needleAngle} 160 160)`}>
                <line
                  x1="160"
                  y1="160"
                  x2="160"
                  y2="54"
                  stroke="var(--accent)"
                  strokeWidth="6"
                  strokeLinecap="round"
                />
              </g>
              <circle cx="160" cy="160" r="9" fill="#fff" opacity="0.9" />
              <circle cx="160" cy="160" r="4" fill="var(--accent)" />

              <text x="48" y="178" fill="rgba(255,255,255,0.6)" fontSize="12" fontWeight="700">
                -50
              </text>
              <text x="152" y="178" fill="rgba(255,255,255,0.85)" fontSize="12" fontWeight="800">
                0
              </text>
              <text x="266" y="178" fill="rgba(255,255,255,0.6)" fontSize="12" fontWeight="700">
                +50
              </text>
            </svg>
          </div>

          <div className="tuner-readouts">
            <span className="tuner-readout">
              {cents === null ? '--' : `${Math.round(cents)} cents`}
            </span>
            <span className="tuner-readout muted" style={{ color: 'rgba(255,255,255,0.7)' }}>
              {mode === 'string' && targetFrequency ? `Alvo: ${targetFrequency.toFixed(1)} Hz` : 'Alvo: nota mais próxima'}
            </span>
          </div>

          {error ? <p className="tuner-error">{error}</p> : null}
        </div>
        <div className="tuner-side">
          <div className="card">
            <h2 className="section-title">Modo</h2>
            <div className="tuner-segmented" role="tablist" aria-label="Modo do afinador">
              <button
                type="button"
                className={mode === 'auto' ? 'tuner-segment active' : 'tuner-segment'}
                onClick={() => setMode('auto')}
              >
                Geral
              </button>
              <button
                type="button"
                className={mode === 'string' ? 'tuner-segment active' : 'tuner-segment'}
                onClick={() => setMode('string')}
              >
                Por corda
              </button>
            </div>

            <label className="toggle" style={{ marginTop: 12, justifyContent: 'space-between' }}>
              Afinação
              <select
                className="input"
                style={{ width: 190 }}
                value={tuning}
                onChange={(e) => {
                  const next = e.target.value as GuitarTuning;
                  setTuning(next);
                  setSelectedStringIndex(0);
                }}
              >
                <option value="standard">Padrão (E A D G B E)</option>
                <option value="half">Meio tom abaixo (Eb Ab Db Gb Bb Eb)</option>
              </select>
            </label>
          </div>

          {mode === 'string' ? (
            <div className="card">
              <h2 className="section-title">Escolha a corda</h2>
              <div className="tuner-strings">
                {strings.map((string, index) => (
                  <button
                    key={string.id}
                    type="button"
                    className={index === selectedStringIndex ? 'tuner-string active' : 'tuner-string'}
                    onClick={() => setSelectedStringIndex(index)}
                  >
                    <span className="tuner-string-title">{string.label.split(' ')[0]}</span>
                    <span className="tuner-string-sub">{string.label.includes('agudo') ? 'agudo' : '\u00A0'}</span>
                  </button>
                ))}
              </div>
              <p className="muted" style={{ marginBottom: 0 }}>
                Dica: toque a corda escolhida e ajuste até o ponteiro ficar no centro.
              </p>
            </div>
          ) : (
            <div className="card">
              <h2 className="section-title">Referência rápida</h2>
              <div className="tuner-reference">
                {strings.map((string, index) => (
                  <span key={`${string.id}-${index}`} className="badge">
                    {string.label.split(' ')[0]}
                  </span>
                ))}
              </div>
            </div>
          )}
          <div className="card">
            <h2 className="section-title">Dica</h2>
            <p className="muted" style={{ marginBottom: 0 }}>
              Toque uma corda por vez. Se o ponteiro ficar “pulando”, toque mais perto do braço e com menos força.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

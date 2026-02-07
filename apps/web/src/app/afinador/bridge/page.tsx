'use client';

import { useEffect, useRef, useState } from 'react';

const log2 = (value: number) => Math.log(value) / Math.log(2);

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

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export default function AfinadorBridgePage() {
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastPostRef = useRef<number>(0);
  const smoothFreqRef = useRef<number | null>(null);
  const [active, setActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [freq, setFreq] = useState<number | null>(null);

  const post = (payload: any) => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const w = window as any;
      if (w.ReactNativeWebView?.postMessage) {
        w.ReactNativeWebView.postMessage(JSON.stringify(payload));
      }
    } catch {
      // ignore
    }
  };

  const stop = async () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    await audioContextRef.current?.close();
    audioContextRef.current = null;
    analyserRef.current = null;
    smoothFreqRef.current = null;
    setActive(false);
    setFreq(null);
    post({ type: 'state', active: false });
  };

  const update = () => {
    const analyser = analyserRef.current;
    const audioContext = audioContextRef.current;
    if (!analyser || !audioContext) return;

    const bufferLength = analyser.fftSize;
    const buffer = new Float32Array(bufferLength);
    analyser.getFloatTimeDomainData(buffer);
    const detected = autoCorrelate(buffer, audioContext.sampleRate);

    const now = performance.now();
    const shouldPost = now - lastPostRef.current > 90;
    if (detected !== -1) {
      const smoothed =
        smoothFreqRef.current === null ? detected : smoothFreqRef.current * 0.86 + detected * 0.14;
      smoothFreqRef.current = smoothed;
      setFreq(smoothed);
      if (shouldPost) {
        lastPostRef.current = now;
        post({ type: 'pitch', frequency: smoothed, ts: Date.now() });
      }
    } else if (shouldPost) {
      lastPostRef.current = now;
      post({ type: 'idle', ts: Date.now() });
    }

    rafRef.current = requestAnimationFrame(update);
  };

  const start = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const audioContext = new AudioContext();
      await audioContext.resume().catch(() => null);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 4096;
      analyser.smoothingTimeConstant = 0.2;
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);

      audioContextRef.current = audioContext;
      analyserRef.current = analyser;
      smoothFreqRef.current = null;
      lastPostRef.current = 0;

      setActive(true);
      post({ type: 'state', active: true });
      update();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Não foi possível acessar o microfone.';
      setError(message);
      setActive(false);
      post({ type: 'error', message });
    }
  };

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    const isReactNativeWebView = typeof w.ReactNativeWebView?.postMessage === 'function';
    if (isReactNativeWebView) {
      // Try auto-start on mount for the native app.
      start();
    }

    const handler = (event: any) => {
      const raw = event?.data;
      if (!raw) return;
      try {
        const msg = JSON.parse(String(raw));
        if (msg?.cmd === 'start') start();
        if (msg?.cmd === 'stop') stop();
      } catch {
        // ignore
      }
    };

    // WebView: iOS -> document, Android -> window. Safe to listen both.
    window.addEventListener('message', handler);
    document.addEventListener('message', handler as any);

    return () => {
      window.removeEventListener('message', handler);
      document.removeEventListener('message', handler as any);
      stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main
      style={{
        fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
        padding: 16,
        color: '#111',
        background: '#fff'
      }}
    >
      <h1 style={{ margin: 0, fontSize: 18 }}>Bridge do Afinador</h1>
      <p style={{ marginTop: 8, marginBottom: 12, opacity: 0.75 }}>
        Esta pagina existe para o app mobile ler a frequencia via Web Audio API.
      </p>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {!active ? (
          <button
            onClick={start}
            style={{
              padding: '10px 14px',
              borderRadius: 999,
              border: '1px solid #ddd',
              background: '#111',
              color: '#fff',
              fontWeight: 800,
              cursor: 'pointer'
            }}
          >
            Ativar microfone
          </button>
        ) : (
          <button
            onClick={stop}
            style={{
              padding: '10px 14px',
              borderRadius: 999,
              border: '1px solid #ddd',
              background: '#f2f2f2',
              color: '#111',
              fontWeight: 800,
              cursor: 'pointer'
            }}
          >
            Parar
          </button>
        )}
        <span style={{ alignSelf: 'center', fontWeight: 700, opacity: 0.8 }}>
          freq: {freq ? `${freq.toFixed(2)} Hz` : '--'}
        </span>
      </div>

      {error ? (
        <p style={{ marginTop: 12, color: '#b00020', fontWeight: 700 }}>
          {error}
        </p>
      ) : null}

      <p style={{ marginTop: 12, opacity: 0.7 }}>
        Debug: ponteiro e calculos ficam no app nativo. Intervalo de envio: {clamp(90, 50, 250)}ms.
      </p>
    </main>
  );
}


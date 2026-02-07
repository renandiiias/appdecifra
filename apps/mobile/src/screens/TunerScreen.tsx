import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Audio } from 'expo-av';
import Constants from 'expo-constants';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  Animated,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View
} from 'react-native';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';
import { WebView } from 'react-native-webview';
import { colors, radii, shadows } from '../lib/theme';

type TunerMode = 'auto' | 'string';
type GuitarTuning = 'standard' | 'half';

type GuitarString = {
  id: string;
  label: string;
  midi: number;
};

const NOTE_STRINGS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;
const log2 = (value: number) => Math.log(value) / Math.log(2);

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

const NOTES = [
  { name: 'E', file: require('../../assets/tuner/E2.wav') },
  { name: 'A', file: require('../../assets/tuner/A2.wav') },
  { name: 'D', file: require('../../assets/tuner/D3.wav') },
  { name: 'G', file: require('../../assets/tuner/G3.wav') },
  { name: 'B', file: require('../../assets/tuner/B3.wav') },
  { name: 'E agudo', file: require('../../assets/tuner/E4.wav') }
];

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function wrapCents(value: number) {
  let cents = value;
  while (cents > 600) cents -= 1200;
  while (cents < -600) cents += 1200;
  return cents;
}

function noteFromPitch(frequency: number) {
  const noteNum = 12 * log2(frequency / 440);
  return Math.round(noteNum) + 69;
}

function frequencyFromNoteNumber(note: number) {
  return 440 * Math.pow(2, (note - 69) / 12);
}

function centsOffFromPitch(frequency: number, note: number) {
  return 1200 * log2(frequency / frequencyFromNoteNumber(note));
}

function centsBetweenFrequencies(frequency: number, targetFrequency: number) {
  return 1200 * log2(frequency / targetFrequency);
}

function toBridgeUrl(base: string) {
  const trimmed = String(base || '').trim();
  if (!trimmed) return 'http://localhost:3000/afinador/bridge';
  if (trimmed.includes('/afinador/bridge')) return trimmed;
  if (/\/afinador\/?$/u.test(trimmed)) return trimmed.replace(/\/afinador\/?$/u, '/afinador/bridge');
  return `${trimmed.replace(/\/$/u, '')}/afinador/bridge`;
}

function dialPoint(cx: number, cy: number, r: number, deg: number) {
  const rad = (deg * Math.PI) / 180;
  return { x: cx + r * Math.sin(rad), y: cy - r * Math.cos(rad) };
}

function dialArcPath(cx: number, cy: number, r: number, startDeg: number, endDeg: number) {
  const start = dialPoint(cx, cy, r, startDeg);
  const end = dialPoint(cx, cy, r, endDeg);
  const sweep = 0; // match the original dial: arc across the top
  const largeArc = Math.abs(endDeg - startDeg) > 180 ? 1 : 0;
  return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${r} ${r} 0 ${largeArc} ${sweep} ${end.x.toFixed(
    2
  )} ${end.y.toFixed(2)}`;
}

function splitNoteAndOctave(label: string) {
  const match = /^([A-G](?:#|b)?)(-?\d+)$/u.exec(label.trim());
  if (!match) return { note: label, octave: '' };
  return { note: match[1], octave: match[2] };
}

const SOLFEGE_PT: Record<string, string> = {
  C: 'Do',
  'C#': 'Do#',
  Db: 'Reb',
  D: 'Re',
  'D#': 'Re#',
  Eb: 'Mib',
  E: 'Mi',
  F: 'Fa',
  'F#': 'Fa#',
  Gb: 'Solb',
  G: 'Sol',
  'G#': 'Sol#',
  Ab: 'Lab',
  A: 'La',
  'A#': 'La#',
  Bb: 'Sib',
  B: 'Si'
};

function solfegeFor(note: string) {
  return SOLFEGE_PT[note] ?? note;
}

function Dial({ statusLabel, dialW }: { statusLabel: string; dialW: number }) {
  const dialH = Math.round(dialW * (190 / 320));

  return (
    <Svg width={dialW} height={dialH} viewBox="0 0 320 190">
      <Path
        d="M40 160 A120 120 0 0 0 280 160"
        stroke="rgba(0,0,0,0.10)"
        strokeWidth={8}
        strokeLinecap="round"
        fill="none"
      />

      {Array.from({ length: 21 }).map((_, i) => {
        const tick = -50 + i * 5;
        const deg = (tick / 50) * 90;
        const rad = (deg * Math.PI) / 180;
        const major = tick % 10 === 0;
        const center = tick === 0;
        const len = center ? 22 : major ? 16 : 10;
        const r1 = 120 - len;
        const r2 = 120;
        const x1 = 160 + r1 * Math.sin(rad);
        const y1 = 160 - r1 * Math.cos(rad);
        const x2 = 160 + r2 * Math.sin(rad);
        const y2 = 160 - r2 * Math.cos(rad);
        return (
          <Line
            key={`tick-${tick}`}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke={center ? 'rgba(0,0,0,0.75)' : major ? 'rgba(0,0,0,0.30)' : 'rgba(0,0,0,0.18)'}
            strokeWidth={center ? 3 : major ? 2 : 1.4}
            strokeLinecap="round"
          />
        );
      })}

      <SvgText x={48} y={178} fill="rgba(0,0,0,0.45)" fontSize={12} fontWeight="700">
        -50
      </SvgText>
      <SvgText x={154} y={178} fill="rgba(0,0,0,0.8)" fontSize={12} fontWeight="800">
        0
      </SvgText>
      <SvgText x={266} y={178} fill="rgba(0,0,0,0.45)" fontSize={12} fontWeight="700">
        +50
      </SvgText>

      <SvgText
        x={160}
        y={122}
        fill="rgba(0,0,0,0.60)"
        fontSize={16}
        fontWeight="800"
        textAnchor="middle"
      >
        {statusLabel}
      </SvgText>

      {/* Center hub */}
      <Circle cx={160} cy={160} r={9} fill="#fff" opacity={0.95} />
      <Circle cx={160} cy={160} r={4} fill={colors.accent} />
    </Svg>
  );
}

export default function TunerScreen() {
  const [mode, setMode] = useState<TunerMode>('auto');
  const [tuning, setTuning] = useState<GuitarTuning>('standard');
  const [selectedStringIndex, setSelectedStringIndex] = useState(0);
  const [bridgeMounted, setBridgeMounted] = useState(false);
  const [micActive, setMicActive] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [frequency, setFrequency] = useState<number | null>(null);
  const [referenceOpen, setReferenceOpen] = useState(false);
  const lastPitchAtRef = useRef<number>(0);
  const needleAnim = useRef(new Animated.Value(0)).current;
  const webRef = useRef<WebView | null>(null);
  const { width } = useWindowDimensions();

  const baseWebUrl = process.env.EXPO_PUBLIC_WEB_TUNER_URL || 'http://localhost:3000/afinador';
  const baseBridgeUrl = toBridgeUrl(baseWebUrl);
  const hostUri =
    (Constants.expoConfig as any)?.hostUri ||
    (Constants.expoGoConfig as any)?.debuggerHost ||
    (Constants as any)?.manifest?.debuggerHost ||
    (Constants as any)?.manifest2?.extra?.expoClient?.hostUri ||
    '';
  const host = typeof hostUri === 'string' ? hostUri.split(':')[0] : '';
  const bridgeUrl =
    host && /localhost|127\\.0\\.0\\.1/u.test(baseBridgeUrl)
      ? baseBridgeUrl.replace(/localhost|127\\.0\\.0\\.1/u, host)
      : baseBridgeUrl;

  useEffect(() => {
    Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
  }, []);

  const playNote = async (file: any) => {
    const { sound } = await Audio.Sound.createAsync(file);
    await sound.playAsync();
    sound.setOnPlaybackStatusUpdate((status) => {
      if (status.isLoaded && status.didJustFinish) {
        sound.unloadAsync();
      }
    });
  };

  const effectiveFrequency = useMemo(() => {
    const now = Date.now();
    if (!frequency) return null;
    if (now - lastPitchAtRef.current > 900) return null;
    return frequency;
  }, [frequency]);

  const strings = STRINGS_BY_TUNING[tuning];
  const selectedString = strings[selectedStringIndex] ?? strings[0];
  const targetFrequency = selectedString ? frequencyFromNoteNumber(selectedString.midi) : null;

  const pitch = useMemo(() => {
    if (!effectiveFrequency) return null;
    const noteNumber = noteFromPitch(effectiveFrequency);
    const noteName = NOTE_STRINGS[noteNumber % 12] ?? '--';
    const cents = centsOffFromPitch(effectiveFrequency, noteNumber);
    return { frequency: effectiveFrequency, noteNumber, noteName, cents };
  }, [effectiveFrequency]);

  const guessedString = useMemo(() => {
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
    return { index: bestIndex, abs: bestAbs };
  }, [pitch, strings]);

  const display = useMemo(() => {
    if (!pitch) return null;
    if (mode === 'auto') {
      return {
        title: `${pitch.noteName}${Math.floor(pitch.noteNumber / 12) - 1}`,
        subtitle: solfegeFor(pitch.noteName),
        cents: pitch.cents
      };
    }
    if (!targetFrequency) return null;
    const cents = wrapCents(centsBetweenFrequencies(pitch.frequency, targetFrequency));
    const idLabel = selectedString.id;
    const { note } = splitNoteAndOctave(idLabel);
    return {
      title: idLabel,
      subtitle: solfegeFor(note),
      cents
    };
  }, [mode, pitch, selectedString.label, targetFrequency]);

  const cents = display?.cents ?? null;
  const centsClamped = cents === null ? 0 : clamp(cents, -50, 50);
  const needleAngle = (centsClamped / 50) * 90;

  useEffect(() => {
    Animated.spring(needleAnim, {
      toValue: needleAngle,
      useNativeDriver: true,
      damping: 18,
      stiffness: 170,
      mass: 0.55
    }).start();
  }, [needleAngle, needleAnim]);

  const status = useMemo(() => {
    if (!bridgeMounted) return { label: 'Microfone', kind: 'idle' as const };
    if (!pitch) return { label: 'Toque a corda', kind: 'idle' as const };
    const current = cents ?? 0;
    const abs = Math.abs(current);
    if (abs <= 5) return { label: 'Estavel', kind: 'ok' as const };
    if (current < 0) return { label: abs > 25 ? 'Muito abaixo' : 'Abaixo', kind: 'flat' as const };
    return { label: abs > 25 ? 'Muito acima' : 'Acima', kind: 'sharp' as const };
  }, [bridgeMounted, cents, pitch]);

  const needleColor = useMemo(() => {
    if (!bridgeMounted) return 'rgba(0,0,0,0.25)';
    if (status.kind === 'ok') return colors.accent;
    if (status.kind === 'flat') return '#f0b429';
    if (status.kind === 'sharp') return '#d32f2f';
    return 'rgba(0,0,0,0.25)';
  }, [bridgeMounted, status.kind]);

  const onBridgeMessage = useCallback((event: any) => {
    const raw = event?.nativeEvent?.data;
    if (!raw) return;
    try {
      const msg = JSON.parse(String(raw));
      if (msg?.type === 'state') {
        setMicActive(Boolean(msg.active));
        if (!msg.active) {
          setFrequency(null);
          lastPitchAtRef.current = 0;
        }
      }
      if (msg?.type === 'pitch' && typeof msg.frequency === 'number') {
        setMicError(null);
        setMicActive(true);
        setFrequency(msg.frequency);
        lastPitchAtRef.current = Date.now();
      }
      if (msg?.type === 'idle') {
        // Keep last frequency for a short grace period.
        // We derive "no signal" from lastPitchAtRef.
      }
      if (msg?.type === 'error') {
        setMicError(typeof msg.message === 'string' ? msg.message : 'Não foi possível acessar o microfone.');
        setMicActive(false);
      }
    } catch {
      // ignore
    }
  }, []);

  const startMic = () => {
    setMicError(null);
    setBridgeMounted(true);
  };

  const stopMic = () => {
    try {
      webRef.current?.postMessage(JSON.stringify({ cmd: 'stop' }));
    } catch {
      // ignore
    }
    setMicActive(false);
    setFrequency(null);
    lastPitchAtRef.current = 0;
    setBridgeMounted(false);
  };

  const outerPad = 16;
  const stringListW = 110;
  const stringGap = 10;
  const dialW =
    mode === 'string'
      ? Math.min(340, Math.max(0, width - outerPad * 2 - stringListW - stringGap))
      : Math.min(width - outerPad * 2, 360);
  const dialH = Math.round(dialW * (190 / 320));
  const centerX = dialW * 0.5;
  const centerY = dialH * (160 / 190);
  const needleLength = dialH * (106 / 190);
  const needleRotate = needleAnim.interpolate({
    inputRange: [-90, 90],
    outputRange: ['-90deg', '90deg']
  });

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Afinador</Text>
          <Text style={styles.subtitle}>Cromatico ou corda a corda.</Text>
        </View>

        <TouchableOpacity
          style={[styles.micIconButton, bridgeMounted ? styles.micIconButtonOn : null]}
          onPress={bridgeMounted ? stopMic : startMic}
        >
          <Ionicons
            name={bridgeMounted ? 'mic' : 'mic-outline'}
            size={18}
            color={bridgeMounted ? '#fff' : colors.text}
          />
        </TouchableOpacity>
      </View>

      <View style={styles.topControls}>
        <View style={styles.segmented}>
          <TouchableOpacity
            style={[styles.segmentedItem, mode === 'auto' ? styles.segmentedItemActive : null]}
            onPress={() => setMode('auto')}
          >
            <Text style={mode === 'auto' ? styles.segmentedTextActive : styles.segmentedText}>Cromatico</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.segmentedItem, mode === 'string' ? styles.segmentedItemActive : null]}
            onPress={() => setMode('string')}
          >
            <Text style={mode === 'string' ? styles.segmentedTextActive : styles.segmentedText}>Corda a corda</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.segmentedSmall}>
          <TouchableOpacity
            style={[styles.segmentedSmallItem, tuning === 'standard' ? styles.segmentedSmallItemActive : null]}
            onPress={() => {
              setTuning('standard');
              setSelectedStringIndex(0);
            }}
          >
            <Text style={tuning === 'standard' ? styles.segmentedSmallTextActive : styles.segmentedSmallText}>
              Padrao
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.segmentedSmallItem, tuning === 'half' ? styles.segmentedSmallItemActive : null]}
            onPress={() => {
              setTuning('half');
              setSelectedStringIndex(0);
            }}
          >
            <Text style={tuning === 'half' ? styles.segmentedSmallTextActive : styles.segmentedSmallText}>
              1/2 abaixo
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
        {mode === 'string' ? (
          <View style={styles.stringLayout}>
            <View style={styles.stringList}>
              {strings.map((s, index) => {
                const { note, octave } = splitNoteAndOctave(s.id);
                const selected = index === selectedStringIndex;
                return (
                  <TouchableOpacity
                    key={s.id}
                    style={[styles.stringButton, selected ? styles.stringButtonActive : null]}
                    onPress={() => setSelectedStringIndex(index)}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6 }}>
                      <Text style={selected ? styles.stringNoteActive : styles.stringNote}>{note}</Text>
                      <Text style={selected ? styles.stringOctaveActive : styles.stringOctave}>{octave}</Text>
                    </View>
                    <Text style={selected ? styles.stringNameActive : styles.stringName}>{solfegeFor(note)}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.tunerMain}>
              <View style={styles.noteBlock}>
                <Text style={styles.noteBig}>
                  {(() => {
                    const label = display?.title ?? '--';
                    const { note, octave } = splitNoteAndOctave(label);
                    return (
                      <>
                        {note}
                        <Text style={styles.noteBigOctave}>{octave}</Text>
                      </>
                    );
                  })()}
                </Text>
                <Text style={styles.noteName}>{display?.subtitle ?? 'Toque a corda'}</Text>
                <Text style={styles.noteHint}>
                  {!bridgeMounted
                    ? 'Ative o microfone'
                    : pitch
                      ? cents === null
                        ? 'Toque a corda'
                        : cents < 0
                          ? 'Aperte para aumentar'
                          : 'Aperte para diminuir'
                      : 'Toque a corda'}
                </Text>
              </View>

              <View style={styles.dialArea}>
                <Dial statusLabel={status.label} dialW={dialW} />
                <Animated.View
                  pointerEvents="none"
                  style={[
                    styles.needle,
                    {
                      left: centerX - 1,
                      top: centerY - needleLength,
                      height: needleLength,
                      backgroundColor: needleColor,
                      transform: [
                        { translateY: needleLength },
                        { rotate: needleRotate },
                        { translateY: -needleLength }
                      ]
                    }
                  ]}
                />
                <View pointerEvents="none" style={[styles.needleHub, { left: centerX - 8, top: centerY - 8 }]} />
                <View
                  pointerEvents="none"
                  style={[
                    styles.needleHubInner,
                    { left: centerX - 3, top: centerY - 3, backgroundColor: needleColor }
                  ]}
                />
              </View>

              <Text style={styles.centsLabel}>
                {pitch && cents !== null ? `${cents > 0 ? '+' : ''}${Math.round(cents)} cents` : 'Toque a corda'}
              </Text>

              {pitch && cents !== null && Math.abs(cents) > 25 ? (
                <Text style={styles.detectedHint}>
                  Detectado: {pitch.noteName}
                  {Math.floor(pitch.noteNumber / 12) - 1} ({pitch.frequency.toFixed(1)} Hz)
                </Text>
              ) : null}
            </View>
          </View>
        ) : (
          <View style={styles.autoLayout}>
            <View style={styles.noteBlock}>
              <Text style={styles.noteBig}>
                {(() => {
                  const label = display?.title ?? '--';
                  const { note, octave } = splitNoteAndOctave(label);
                  return (
                    <>
                      {note}
                      <Text style={styles.noteBigOctave}>{octave}</Text>
                    </>
                  );
                })()}
              </Text>
              <Text style={styles.noteName}>{display?.subtitle ?? 'Toque a corda'}</Text>
              <Text style={styles.noteHint}>
                {!bridgeMounted ? 'Ative o microfone' : pitch ? 'Toque a corda' : 'Toque a corda'}
              </Text>
            </View>

            <View style={styles.dialArea}>
              <Dial statusLabel={status.label} dialW={dialW} />
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.needle,
                  {
                    left: centerX - 1,
                    top: centerY - needleLength,
                    height: needleLength,
                    backgroundColor: needleColor,
                    transform: [
                      { translateY: needleLength },
                      { rotate: needleRotate },
                      { translateY: -needleLength }
                    ]
                  }
                ]}
              />
              <View pointerEvents="none" style={[styles.needleHub, { left: centerX - 8, top: centerY - 8 }]} />
              <View
                pointerEvents="none"
                style={[
                  styles.needleHubInner,
                  { left: centerX - 3, top: centerY - 3, backgroundColor: needleColor }
                ]}
              />
            </View>

            <Text style={styles.centsLabel}>
              {pitch && cents !== null ? `${cents > 0 ? '+' : ''}${Math.round(cents)} cents` : 'Toque a corda'}
            </Text>

            {guessedString && pitch ? (
              <Text style={styles.detectedHint}>Corda sugerida: {strings[guessedString.index]?.id}</Text>
            ) : null}
          </View>
        )}

        {micError ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{micError}</Text>
          </View>
        ) : null}

        <View style={styles.bottomRow}>
          <TouchableOpacity style={styles.referencePill} onPress={() => setReferenceOpen(true)}>
            <Text style={styles.referencePillText}>Referencia: 440Hz</Text>
          </TouchableOpacity>

          {!bridgeMounted ? (
            <TouchableOpacity style={styles.micButton} onPress={startMic}>
              <Ionicons name="mic" size={16} color="#fff" />
              <Text style={styles.micButtonText}>Ativar microfone</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.micButtonSecondary} onPress={stopMic}>
              <Ionicons name="stop" size={16} color={colors.text} />
              <Text style={styles.micButtonTextSecondary}>Parar</Text>
            </TouchableOpacity>
          )}
        </View>

        <Modal visible={referenceOpen} transparent animationType="fade" onRequestClose={() => setReferenceOpen(false)}>
          <Pressable style={styles.modalBackdrop} onPress={() => setReferenceOpen(false)}>
            <Pressable style={styles.modalCard} onPress={() => null}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Referencia sonora</Text>
                <TouchableOpacity onPress={() => setReferenceOpen(false)} style={styles.modalClose}>
                  <Ionicons name="close" size={18} color={colors.text} />
                </TouchableOpacity>
              </View>
              <Text style={styles.modalSubtitle}>Toque uma corda por vez e compare.</Text>
              <View style={styles.grid}>
                {NOTES.map((note) => (
                  <TouchableOpacity key={note.name} style={styles.noteButton} onPress={() => playNote(note.file)}>
                    <Ionicons name="play" size={14} color="#fff" />
                    <Text style={styles.noteButtonText}>{note.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </Pressable>
          </Pressable>
        </Modal>

        {/* Hidden bridge: reads frequency from Web Audio API and posts messages to RN */}
        {bridgeMounted ? (
          <WebView
            ref={(node) => {
              webRef.current = node;
            }}
            source={{ uri: bridgeUrl }}
            onMessage={onBridgeMessage}
            originWhitelist={['*']}
            javaScriptEnabled
            allowsInlineMediaPlayback
            mediaPlaybackRequiresUserAction={false}
            mediaCapturePermissionGrantType="grantIfSameHostElsePrompt"
            style={styles.bridgeWebView}
          />
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fbfaf7' },
  header: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8, flexDirection: 'row', alignItems: 'center' },
  title: { fontSize: 28, fontWeight: '900', color: colors.text },
  subtitle: { color: colors.muted, marginTop: 6, fontWeight: '600' },

  micIconButton: {
    width: 40,
    height: 40,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center'
  },
  micIconButtonOn: { backgroundColor: colors.accent, borderColor: colors.accent },

  topControls: { paddingHorizontal: 16, paddingBottom: 12, gap: 10 },
  segmented: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.04)',
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
    overflow: 'hidden'
  },
  segmentedItem: { flex: 1, paddingVertical: 10, alignItems: 'center', justifyContent: 'center' },
  segmentedItemActive: { backgroundColor: colors.accent },
  segmentedText: { fontWeight: '900', color: 'rgba(0,0,0,0.72)' },
  segmentedTextActive: { fontWeight: '900', color: '#fff' },

  segmentedSmall: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.03)',
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    overflow: 'hidden'
  },
  segmentedSmallItem: { flex: 1, paddingVertical: 8, alignItems: 'center', justifyContent: 'center' },
  segmentedSmallItemActive: { backgroundColor: '#fff' },
  segmentedSmallText: { fontWeight: '800', color: 'rgba(0,0,0,0.60)', fontSize: 12 },
  segmentedSmallTextActive: { fontWeight: '900', color: colors.text, fontSize: 12 },

  autoLayout: {
    paddingHorizontal: 16,
    paddingTop: 10,
    alignItems: 'center'
  },

  stringLayout: { paddingHorizontal: 16, paddingTop: 10, flexDirection: 'row', gap: 10 },
  stringList: { width: 110, gap: 10 },
  stringButton: {
    borderRadius: radii.lg,
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.card
  },
  stringButtonActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  stringNote: { fontSize: 18, fontWeight: '900', color: colors.text },
  stringOctave: { fontSize: 12, fontWeight: '900', color: colors.muted, marginBottom: 2 },
  stringName: { marginTop: 2, fontWeight: '800', color: colors.muted },
  stringNoteActive: { fontSize: 18, fontWeight: '900', color: '#fff' },
  stringOctaveActive: { fontSize: 12, fontWeight: '900', color: 'rgba(255,255,255,0.78)', marginBottom: 2 },
  stringNameActive: { marginTop: 2, fontWeight: '800', color: 'rgba(255,255,255,0.84)' },

  tunerMain: { flex: 1, alignItems: 'center' },
  noteBlock: { alignItems: 'center', paddingTop: 6 },
  noteBig: { fontSize: 68, fontWeight: '900', letterSpacing: -1.2, color: colors.text },
  noteBigOctave: { fontSize: 28, fontWeight: '900', color: colors.muted },
  noteName: { marginTop: 2, fontSize: 16, fontWeight: '800', color: colors.muted },
  noteHint: { marginTop: 8, fontSize: 14, fontWeight: '700', color: 'rgba(0,0,0,0.58)' },

  dialArea: {
    marginTop: 8,
    alignItems: 'center',
    justifyContent: 'center'
  },
  needle: {
    position: 'absolute',
    width: 2,
    borderRadius: 999
  },
  needleHub: {
    position: 'absolute',
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.10)'
  },
  needleHubInner: { position: 'absolute', width: 6, height: 6, borderRadius: 3 },

  centsLabel: { marginTop: 12, fontWeight: '900', color: colors.text },
  detectedHint: { marginTop: 8, fontWeight: '700', color: colors.muted, textAlign: 'center' },

  errorBanner: {
    marginTop: 14,
    marginHorizontal: 16,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: '#ffcdd2',
    backgroundColor: '#ffebee',
    paddingVertical: 10,
    paddingHorizontal: 12
  },
  errorText: { color: '#b00020', fontWeight: '800' },

  bottomRow: {
    marginTop: 18,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12
  },
  referencePill: {
    flex: 1,
    height: 42,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center'
  },
  referencePillText: { fontWeight: '900', color: colors.text },

  micButton: {
    height: 42,
    borderRadius: radii.pill,
    backgroundColor: colors.text,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  micButtonText: { color: '#fff', fontWeight: '900' },
  micButtonSecondary: {
    height: 42,
    borderRadius: radii.pill,
    paddingHorizontal: 14,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  micButtonTextSecondary: { color: colors.text, fontWeight: '900' },

  bridgeWebView: { position: 'absolute', width: 10, height: 10, opacity: 0.01, left: 0, top: 0 },

  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.25)', justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: '#fff',
    padding: 16,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: 1,
    borderColor: colors.border
  },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modalTitle: { fontSize: 18, fontWeight: '900', color: colors.text },
  modalClose: {
    width: 34,
    height: 34,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.06)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  modalSubtitle: { marginTop: 6, fontWeight: '700', color: colors.muted },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 14, marginBottom: 10 },
  noteButton: {
    backgroundColor: colors.accent,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: radii.pill,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  noteButtonText: { color: '#fff', fontWeight: '700' }
});

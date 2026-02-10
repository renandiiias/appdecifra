import { View, Text, StyleSheet } from 'react-native';
import { getChordShapeForInstrument, type Instrument } from '@cifras/chords';
import { colors } from '../lib/theme';

type DiagramVariant = 'inline' | 'modal';

type Config = {
  stringSpacing: number;
  fretSpacing: number;
  padX: number;
  dot: number;
  open: number;
  stringWidth: number;
  fretWidth: number;
  nutHeight: number;
  label: number;
  capoBox: number;
  baseLabelOffset: number;
  bottomOffset: number;
  barreHeight: number;
};

function getConfig(variant: DiagramVariant): Config {
  if (variant === 'inline') {
    return {
      stringSpacing: 12,
      fretSpacing: 14,
      padX: 6,
      dot: 12,
      open: 8,
      stringWidth: 1,
      fretWidth: 1,
      nutHeight: 2,
      label: 10,
      capoBox: 14,
      baseLabelOffset: 10,
      bottomOffset: 10,
      barreHeight: 6
    };
  }

  return {
    stringSpacing: 16,
    fretSpacing: 18,
    padX: 8,
    dot: 16,
    open: 10,
    stringWidth: 1,
    fretWidth: 1,
    nutHeight: 3,
    label: 12,
    capoBox: 16,
    baseLabelOffset: 12,
    bottomOffset: 12,
    barreHeight: 8
  };
}

function getBarre(positions: number[], fingers?: number[]) {
  // A-shape barre chords: only the outer strings show the barre fret, but it still
  // applies across the whole shape (e.g. B, Bm, Cm in A-shape family).
  if (positions.length >= 6 && positions[0] === -1) {
    const barreFret = positions[1] ?? 0;
    const last = positions[positions.length - 1] ?? 0;
    const middle = positions.slice(2, 5);
    const frettedMiddle = middle.filter((p) => p > 0);
    if (barreFret > 0 && last === barreFret && frettedMiddle.length >= 2) {
      const minFret = Math.min(...positions.filter((p) => p > 0));
      const higherCount = middle.filter((p) => p > barreFret).length;
      if (minFret === barreFret && higherCount >= 2) {
        return { fret: barreFret, min: 1, max: positions.length - 1, finger: 1 };
      }
    }
  }

  // Prefer explicit finger data (finger 1 repeated across strings usually indicates a barre).
  if (fingers && fingers.length === positions.length) {
    const groups = new Map<string, { fret: number; finger: number; strings: number[] }>();
    for (let i = 0; i < positions.length; i += 1) {
      const fret = positions[i] ?? 0;
      const finger = fingers[i] ?? 0;
      if (fret <= 0 || finger <= 0) continue;
      const key = `${fret}:${finger}`;
      const existing = groups.get(key) ?? { fret, finger, strings: [] };
      existing.strings.push(i);
      groups.set(key, existing);
    }

    const candidates = Array.from(groups.values())
      .filter((g) => g.strings.length >= 2)
      .map((g) => ({ fret: g.fret, finger: g.finger, min: Math.min(...g.strings), max: Math.max(...g.strings) }))
      .sort((a, b) => {
        const aFinger = a.finger === 1 ? 0 : 1;
        const bFinger = b.finger === 1 ? 0 : 1;
        if (aFinger !== bFinger) return aFinger - bFinger;
        if (a.fret !== b.fret) return a.fret - b.fret;
        return (b.max - b.min) - (a.max - a.min);
      });
    if (candidates.length) return candidates[0];
  }

  // Fallback heuristic: multiple strings fretted on the same fret.
  const fretted = positions.map((p, i) => ({ p, i })).filter((v) => v.p > 0);
  if (!fretted.length) return null;
  const minFret = Math.min(...fretted.map((v) => v.p));
  const frets = new Map<number, number[]>();
  for (const item of fretted) {
    const list = frets.get(item.p) ?? [];
    list.push(item.i);
    frets.set(item.p, list);
  }
  const threshold = positions.length >= 6 ? 3 : 2;
  const candidates = Array.from(frets.entries())
    // Avoid false barres on higher frets (e.g. B major shape has 3 notes on fret 4).
    .filter(([fret, list]) => fret === minFret && list.length >= threshold)
    .sort((a, b) => a[0] - b[0]);
  if (!candidates.length) return null;
  const [fret, list] = candidates[0];
  return { fret, min: Math.min(...list), max: Math.max(...list), finger: 0 };
}

function inferFingers(positions: number[], barre: ReturnType<typeof getBarre>) {
  const out = new Array(positions.length).fill(0);
  const fretted = positions.map((p, i) => ({ fret: p, i })).filter((v) => v.fret > 0);
  if (!fretted.length) return out;

  const barreFret = barre?.fret ?? null;
  if (barreFret) {
    for (const item of fretted) {
      if (item.fret === barreFret) out[item.i] = 1;
    }
  }

  const groups = new Map<number, number[]>();
  for (const item of fretted) {
    if (barreFret && item.fret === barreFret) continue;
    const list = groups.get(item.fret) ?? [];
    list.push(item.i);
    groups.set(item.fret, list);
  }

  const sortedFrets = Array.from(groups.keys()).sort((a, b) => a - b);
  let finger = barreFret ? 2 : 1;
  for (const fret of sortedFrets) {
    const strings = (groups.get(fret) ?? []).slice().sort((a, b) => a - b);
    for (const stringIndex of strings) {
      if (out[stringIndex]) continue;
      out[stringIndex] = Math.min(4, finger);
      finger = Math.min(4, finger + 1);
    }
  }

  return out;
}

export default function ChordDiagram({
  chord,
  instrument = 'guitar',
  leftHanded,
  variant = 'inline'
}: {
  chord: string;
  instrument?: Instrument;
  leftHanded?: boolean;
  variant?: DiagramVariant;
}) {
  const shape = getChordShapeForInstrument(chord, instrument);
  if (!shape) {
    return <Text style={styles.muted}>Sem diagrama</Text>;
  }

  const cfg = getConfig(variant);
  const showCapoBoxes = variant === 'modal';
  const positions = leftHanded ? [...shape.positions].reverse() : shape.positions;
  const explicitFingers = shape.fingers ? (leftHanded ? [...shape.fingers].reverse() : shape.fingers) : undefined;
  const stringCount = positions.length;
  const baseFret = shape.baseFret ?? 1;
  const baseLabel = baseFret > 1 ? String(baseFret) : '';
  const barre = getBarre(positions, explicitFingers);
  const fingers = explicitFingers ?? inferFingers(positions, barre);

  const fretCount = 5;
  const stringsHeight = cfg.fretSpacing * (fretCount - 1);
  const gridHeight = stringsHeight + cfg.nutHeight + cfg.bottomOffset + cfg.open;
  const gridWidth = cfg.padX * 2 + cfg.stringSpacing * Math.max(0, stringCount - 1);

  const gridTop = 0;
  const stringsTop = gridTop;
  const openRowY = stringsTop + stringsHeight + cfg.bottomOffset;

  return (
    <View
      style={[
        styles.wrapper,
        {
          width: gridWidth,
          height: gridHeight + (showCapoBoxes ? cfg.capoBox + 10 : 0)
        }
      ]}
    >
      {showCapoBoxes ? (
        <View style={[styles.capoRow, { height: cfg.capoBox + 6 }]}>
          {'CAPO'.split('').map((char) => (
            <View key={char} style={[styles.capoBox, { width: cfg.capoBox, height: cfg.capoBox }]}>
              <Text style={styles.capoBoxText}>{char}</Text>
            </View>
          ))}
        </View>
      ) : null}

      <View style={[styles.grid, { width: gridWidth, height: gridHeight }]}>
        {baseLabel ? (
          <Text style={[styles.baseFretLabel, { top: stringsTop + cfg.baseLabelOffset, left: 0, fontSize: cfg.label }]}> 
            {baseLabel}
          </Text>
        ) : null}

        {Array.from({ length: stringCount }).map((_, stringIndex) => (
          <View
            key={`s-${stringIndex}`}
            style={[
              styles.string,
              {
                left: cfg.padX + stringIndex * cfg.stringSpacing,
                top: stringsTop,
                height: stringsHeight,
                width: cfg.stringWidth
              }
            ]}
          />
        ))}

        {Array.from({ length: fretCount }).map((_, fretIndex) => (
          <View
            key={`f-${fretIndex}`}
            style={[
              styles.fret,
              {
                top: stringsTop + fretIndex * cfg.fretSpacing,
                left: cfg.padX,
                right: cfg.padX,
                height: fretIndex === 0 && baseFret === 1 ? cfg.nutHeight : cfg.fretWidth
              }
            ]}
          />
        ))}

        {barre ? (
          <View
            style={[
              styles.barre,
              {
                top:
                  stringsTop +
                  (barre.fret - baseFret + 1 - 0.5) * cfg.fretSpacing -
                  Math.round(cfg.barreHeight / 2),
                left: cfg.padX + barre.min * cfg.stringSpacing - 2,
                width: (barre.max - barre.min) * cfg.stringSpacing + 4,
                height: cfg.barreHeight
              }
            ]}
          />
        ) : null}

        {positions.map((pos, stringIndex) => {
          if (pos <= 0) return null;
          const x = cfg.padX + stringIndex * cfg.stringSpacing;
          const fret = pos - baseFret + 1;
          const centerY = stringsTop + (fret - 0.5) * cfg.fretSpacing;
          const finger = fingers?.[stringIndex];

          return (
            <View
              key={`p-${stringIndex}`}
              style={[
                styles.dot,
                {
                  width: cfg.dot,
                  height: cfg.dot,
                  borderRadius: Math.round(cfg.dot / 2),
                  left: x - Math.round(cfg.dot / 2),
                  top: Math.round(centerY - cfg.dot / 2)
                }
              ]}
            >
              {finger ? <Text style={[styles.dotLabel, { fontSize: cfg.label }]}>{finger}</Text> : null}
            </View>
          );
        })}

        {positions.map((pos, stringIndex) => {
          const x = cfg.padX + stringIndex * cfg.stringSpacing;
          if (pos === -1) {
            return (
              <Text
                key={`x-${stringIndex}`}
                style={[
                  styles.muted,
                  {
                    position: 'absolute',
                    fontSize: cfg.label,
                    width: 14,
                    textAlign: 'center',
                    left: x - 7,
                    top: openRowY
                  }
                ]}
              >
                x
              </Text>
            );
          }

          if (pos === 0) {
            return (
              <View
                key={`o-${stringIndex}`}
                style={[
                  styles.open,
                  {
                    width: cfg.open,
                    height: cfg.open,
                    borderRadius: Math.round(cfg.open / 2),
                    left: x - Math.round(cfg.open / 2),
                    top: openRowY
                  }
                ]}
              />
            );
          }

          return (
            <View
              key={`f-${stringIndex}`}
              style={[
                styles.open,
                styles.filled,
                {
                  width: cfg.open,
                  height: cfg.open,
                  borderRadius: Math.round(cfg.open / 2),
                  left: x - Math.round(cfg.open / 2),
                  top: openRowY
                }
              ]}
            />
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    justifyContent: 'flex-start'
  },
  capoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingBottom: 4
  },
  capoBox: {
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#111'
  },
  capoBoxText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '800'
  },
  grid: {
    position: 'relative'
  },
  string: {
    position: 'absolute',
    backgroundColor: '#222'
  },
  fret: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: '#222'
  },
  barre: {
    position: 'absolute',
    backgroundColor: '#111',
    borderRadius: 6
  },
  dot: {
    position: 'absolute',
    backgroundColor: '#111',
    alignItems: 'center',
    justifyContent: 'center'
  },
  dotLabel: {
    color: '#fff',
    fontWeight: '800'
  },
  open: {
    position: 'absolute',
    borderWidth: 1,
    borderColor: '#222',
    backgroundColor: '#fff'
  },
  filled: {
    backgroundColor: '#111',
    borderColor: '#111'
  },
  muted: {
    color: colors.muted,
    fontSize: 11
  },
  baseFretLabel: {
    position: 'absolute',
    color: colors.muted,
    fontWeight: '700'
  }
});

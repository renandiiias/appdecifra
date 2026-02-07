import { View, Text, StyleSheet } from 'react-native';
import { getChordShape } from '@cifras/chords';
import { colors } from '../lib/theme';

type DiagramVariant = 'inline' | 'modal';

type Config = {
  stringSpacing: number;
  fretSpacing: number;
  padX: number;
  gridWidth: number;
  gridHeight: number;
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
      gridWidth: 84,
      gridHeight: 96,
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
    gridWidth: 116,
    gridHeight: 132,
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

function getBarre(positions: number[]) {
  const fretted = positions.map((p, i) => ({ p, i })).filter((v) => v.p > 0);
  if (!fretted.length) return null;
  const frets = new Map<number, number[]>();
  for (const item of fretted) {
    const list = frets.get(item.p) ?? [];
    list.push(item.i);
    frets.set(item.p, list);
  }
  const candidates = Array.from(frets.entries())
    .filter(([, list]) => list.length >= 3)
    .sort((a, b) => a[0] - b[0]);
  if (!candidates.length) return null;
  const [fret, list] = candidates[0];
  return { fret, min: Math.min(...list), max: Math.max(...list) };
}

export default function ChordDiagram({
  chord,
  leftHanded,
  variant = 'inline'
}: {
  chord: string;
  leftHanded?: boolean;
  variant?: DiagramVariant;
}) {
  const shape = getChordShape(chord);
  if (!shape) {
    return <Text style={styles.muted}>Sem diagrama</Text>;
  }

  const cfg = getConfig(variant);
  const positions = leftHanded ? [...shape.positions].reverse() : shape.positions;
  const baseFret = shape.baseFret ?? 1;
  const baseLabel = baseFret > 1 ? String(baseFret) : '';
  const barre = getBarre(positions);

  const fretCount = 5;
  const stringsHeight = cfg.fretSpacing * (fretCount - 1);
  const gridHeight = stringsHeight + cfg.nutHeight + cfg.bottomOffset + cfg.open;

  const gridTop = 0;
  const stringsTop = gridTop;
  const openRowY = stringsTop + stringsHeight + cfg.bottomOffset;

  return (
    <View style={[styles.wrapper, { width: cfg.gridWidth, height: cfg.gridHeight + cfg.capoBox + 10 }]}>
      <View style={[styles.capoRow, { height: cfg.capoBox + 6 }]}> 
        {'CAPO'.split('').map((char) => (
          <View key={char} style={[styles.capoBox, { width: cfg.capoBox, height: cfg.capoBox }]}>
            <Text style={styles.capoBoxText}>{char}</Text>
          </View>
        ))}
      </View>

      <View style={[styles.grid, { width: cfg.gridWidth, height: gridHeight }]}>
        {baseLabel ? (
          <Text style={[styles.baseFretLabel, { top: stringsTop + cfg.baseLabelOffset, left: 0, fontSize: cfg.label }]}> 
            {baseLabel}
          </Text>
        ) : null}

        {Array.from({ length: 6 }).map((_, stringIndex) => (
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
          const finger = shape.fingers?.[stringIndex];

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

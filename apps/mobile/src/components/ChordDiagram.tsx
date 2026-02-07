import { View, Text, StyleSheet } from 'react-native';
import { getChordShape } from '@cifras/chords';
import { colors } from '../lib/theme';

type DiagramSize = 'sm' | 'md';

function getConfig(size: DiagramSize) {
  if (size === 'sm') {
    return {
      stringSpacing: 18,
      fretSpacing: 22,
      markerRow: 18,
      padX: 8,
      gridWidth: 108,
      gridHeight: 132,
      dot: 12,
      open: 10,
      stringWidth: 2,
      fretWidth: 2,
      nutHeight: 4,
      label: 12
    };
  }

  return {
    stringSpacing: 20,
    fretSpacing: 24,
    markerRow: 20,
    padX: 10,
    gridWidth: 122,
    gridHeight: 152,
    dot: 14,
    open: 12,
    stringWidth: 2,
    fretWidth: 2,
    nutHeight: 4,
    label: 13
  };
}

export default function ChordDiagram({
  chord,
  leftHanded,
  size = 'sm'
}: {
  chord: string;
  leftHanded?: boolean;
  size?: DiagramSize;
}) {
  const shape = getChordShape(chord);
  if (!shape) {
    return <Text style={styles.muted}>Sem diagrama</Text>;
  }

  const cfg = getConfig(size);
  const positions = leftHanded ? [...shape.positions].reverse() : shape.positions;
  const baseFret = shape.baseFret ?? 1;
  const stringsHeight = cfg.fretSpacing * 5;
  const footerHeight = cfg.label + 10;

  return (
    <View style={[styles.wrapper, { width: cfg.gridWidth, height: cfg.gridHeight + footerHeight }]}>
      <View style={[styles.grid, { width: cfg.gridWidth, height: cfg.gridHeight }]}>
        {Array.from({ length: 6 }).map((_, stringIndex) => (
          <View
            key={`s-${stringIndex}`}
            style={[
              styles.string,
              {
                left: cfg.padX + stringIndex * cfg.stringSpacing,
                top: cfg.markerRow,
                height: stringsHeight,
                width: cfg.stringWidth
              }
            ]}
          />
        ))}
        {Array.from({ length: 6 }).map((_, fretIndex) => (
          <View
            key={`f-${fretIndex}`}
            style={[
              styles.fret,
              {
                top: cfg.markerRow + fretIndex * cfg.fretSpacing,
                left: cfg.padX,
                right: cfg.padX,
                height: fretIndex === 0 ? cfg.nutHeight : cfg.fretWidth
              }
            ]}
          />
        ))}
        {positions.map((pos, stringIndex) => {
          const x = cfg.padX + stringIndex * cfg.stringSpacing;
          if (pos === -1) {
            return (
              <Text
                key={`x-${stringIndex}`}
                style={[
                  styles.muted,
                  {
                    fontSize: cfg.label,
                    width: 16,
                    textAlign: 'center',
                    left: x - 8,
                    top: 0
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
                    top: 2
                  }
                ]}
              />
            );
          }
          const fret = pos - baseFret + 1;
          const centerY = cfg.markerRow + (fret - 0.5) * cfg.fretSpacing;
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
            />
          );
        })}
      </View>
      {baseFret > 1 && (
        <Text style={[styles.fretLabel, { fontSize: cfg.label }]}>{baseFret}fr</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    justifyContent: 'flex-start'
  },
  grid: {
    position: 'relative'
  },
  string: {
    position: 'absolute',
    backgroundColor: colors.text
  },
  fret: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: colors.text
  },
  dot: {
    position: 'absolute',
    backgroundColor: colors.text
  },
  open: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: colors.text
  },
  muted: {
    color: colors.muted,
    fontSize: 12
  },
  fretLabel: {
    color: colors.muted,
    marginTop: 4
  }
});

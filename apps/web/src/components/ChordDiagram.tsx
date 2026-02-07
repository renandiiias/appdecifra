import { getChordShape, renderChordSvg } from '@cifras/chords';

export default function ChordDiagram({ chord, leftHanded }: { chord: string; leftHanded?: boolean }) {
  const shape = getChordShape(chord);
  if (!shape) {
    return <div className="muted">Sem diagrama disponível</div>;
  }
  const svg = renderChordSvg(shape, { leftHanded });
  return (
    <div
      aria-label={`Diagrama do acorde ${chord}`}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

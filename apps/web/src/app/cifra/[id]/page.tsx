import { getSongById } from '@/lib/queries';
import CifraView from '@/components/CifraView';
import { decodeSharedSongVersion } from '@cifras/shared';

export const revalidate = 60;

export async function generateMetadata({ params }: { params: { id: string } }) {
  const song = await getSongById(params.id);
  if (!song) {
    return { title: 'Cifra não encontrada' };
  }
  const artist = song.artists?.name ?? 'Artista';
  return {
    title: `${song.title} - ${artist}`,
    description: `Cifra de ${song.title} por ${artist}. Tom original ${song.original_key}.`
  };
}

export default async function CifraPage({
  params,
  searchParams
}: {
  params: { id: string };
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const song = await getSongById(params.id);
  if (!song) {
    return (
      <div className="card">
        <h1>Cifra não encontrada</h1>
      </div>
    );
  }

  const v = typeof searchParams?.v === 'string' ? searchParams?.v : null;
  const sharedText = v ? decodeSharedSongVersion(v) : null;
  const songForRender = sharedText ? { ...song, lyrics_chords: sharedText } : song;

  return <CifraView song={songForRender} sharedVersion={Boolean(sharedText)} />;
}

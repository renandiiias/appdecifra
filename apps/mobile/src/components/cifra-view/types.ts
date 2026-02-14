export type SongData = {
  id: string;
  title: string;
  lyrics_chords: string;
  original_key: string;
  tuning: string | null;
  capo: number | null;
  category: string | null;
  views?: number | null;
  artists?: {
    name: string;
    verified_at?: string | null;
    official_links?: any[] | null;
    profile_highlight?: string | null;
  } | null;
};

export type CifraViewProps = {
  song: SongData;
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
  onBack?: () => void;
  onOpenTuner?: () => void;
};

export type ParsedCifra = {
  cleanText: string;
  composers: string[];
  reviewers: string[];
};

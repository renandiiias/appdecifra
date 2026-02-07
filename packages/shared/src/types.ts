export type Artist = {
  id: string;
  name: string;
  name_search: string;
  created_at: string;
};

export type Song = {
  id: string;
  title: string;
  title_search: string;
  artist_id: string | null;
  lyrics_chords: string;
  original_key: string;
  tuning: string | null;
  capo: number | null;
  category: string | null;
  views: number | null;
  created_at: string;
  updated_at: string;
};

export type Favorite = {
  user_id: string;
  song_id: string;
  created_at: string;
};

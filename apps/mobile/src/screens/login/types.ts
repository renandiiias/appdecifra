export type ChurchProfile = {
  name: string;
  instagram?: string | null;
  address?: string | null;
  whatsapp?: string | null;
  updatedAt: string;
};

export type SetlistSong = { id: string; title: string; artist?: string | null };
export type SetlistMember = { name: string; instrument: string };
export type WorshipSetlist = {
  id: string;
  sharedId?: string | null;
  title: string;
  scheduledAt: string;
  songs: SetlistSong[];
  team: SetlistMember[];
  createdAt: string;
};

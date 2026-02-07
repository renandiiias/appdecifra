import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

const FAVORITES_KEY = 'cifras:favorites';
const FAVORITES_CACHE_KEY = 'cifras:favorites_cache';
const FAVORITES_QUEUE_KEY = 'cifras:favorites_queue';
const FAVORITE_FOLDERS_KEY = 'cifras:favorite_folders:v1';
const FAVORITES_FOLDER_MAP_KEY = 'cifras:favorite_folder_map:v1';

export type FavoriteQueueItem = { songId: string; action: 'add' | 'remove'; folderId?: string | null };

export type FavoriteFolder = {
  id: string;
  name: string;
  createdAt: string;
};

function uuidV4() {
  // Non-crypto UUID (good enough for client-side IDs in this MVP).
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/gu, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export async function getLocalFavorites(): Promise<string[]> {
  const raw = await AsyncStorage.getItem(FAVORITES_KEY);
  return raw ? JSON.parse(raw) : [];
}

export async function setLocalFavorites(ids: string[]) {
  await AsyncStorage.setItem(FAVORITES_KEY, JSON.stringify(ids));
}

export async function getLocalFavoriteFolders(): Promise<FavoriteFolder[]> {
  const raw = await AsyncStorage.getItem(FAVORITE_FOLDERS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as FavoriteFolder[]) : [];
  } catch {
    return [];
  }
}

export async function setLocalFavoriteFolders(folders: FavoriteFolder[]) {
  await AsyncStorage.setItem(FAVORITE_FOLDERS_KEY, JSON.stringify(folders));
}

export async function createLocalFavoriteFolder(name: string) {
  const folder: FavoriteFolder = { id: uuidV4(), name, createdAt: new Date().toISOString() };
  const existing = await getLocalFavoriteFolders();
  const next = [...existing, folder];
  await setLocalFavoriteFolders(next);
  return folder;
}

export async function getLocalFavoriteFolderMap(): Promise<Record<string, string | null>> {
  const raw = await AsyncStorage.getItem(FAVORITES_FOLDER_MAP_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, string | null>) : {};
  } catch {
    return {};
  }
}

export async function setLocalFavoriteFolderMap(map: Record<string, string | null>) {
  await AsyncStorage.setItem(FAVORITES_FOLDER_MAP_KEY, JSON.stringify(map));
}

export async function setLocalFavoriteFolderForSong(songId: string, folderId: string | null) {
  const map = await getLocalFavoriteFolderMap();
  map[songId] = folderId;
  await setLocalFavoriteFolderMap(map);
}

export async function clearLocalFavoriteFolderForSong(songId: string) {
  const map = await getLocalFavoriteFolderMap();
  delete map[songId];
  await setLocalFavoriteFolderMap(map);
}

export async function getCachedSongs(): Promise<Record<string, any>> {
  const raw = await AsyncStorage.getItem(FAVORITES_CACHE_KEY);
  return raw ? JSON.parse(raw) : {};
}

export async function cacheSong(song: any) {
  const cache = await getCachedSongs();
  cache[song.id] = song;
  await AsyncStorage.setItem(FAVORITES_CACHE_KEY, JSON.stringify(cache));
}

export async function getCachedSong(id: string) {
  const cache = await getCachedSongs();
  return cache[id] ?? null;
}

export async function enqueueFavoriteChange(item: FavoriteQueueItem) {
  const raw = await AsyncStorage.getItem(FAVORITES_QUEUE_KEY);
  const queue = raw ? (JSON.parse(raw) as FavoriteQueueItem[]) : [];
  queue.push(item);
  await AsyncStorage.setItem(FAVORITES_QUEUE_KEY, JSON.stringify(queue));
}

export async function flushFavoriteQueue(userId: string) {
  const raw = await AsyncStorage.getItem(FAVORITES_QUEUE_KEY);
  const queue = raw ? (JSON.parse(raw) as FavoriteQueueItem[]) : [];
  if (!queue.length) return;

  const remaining: FavoriteQueueItem[] = [];

  for (const item of queue) {
    try {
      if (item.action === 'add') {
        // Try the new schema first (with folder_id). Fallback silently for older DB schema.
        const payload: any = { song_id: item.songId, user_id: userId };
        if (item.folderId !== undefined) payload.folder_id = item.folderId;
        const { error } = await supabase.from('favorites').insert(payload);
        if (error && /column .*folder_id|schema cache|PGRST/iu.test(String((error as any).message ?? error))) {
          await supabase.from('favorites').insert({ song_id: item.songId, user_id: userId });
        } else if (error) {
          throw error;
        }
      } else {
        await supabase.from('favorites').delete().eq('song_id', item.songId).eq('user_id', userId);
      }
    } catch (error) {
      remaining.push(item);
    }
  }

  await AsyncStorage.setItem(FAVORITES_QUEUE_KEY, JSON.stringify(remaining));
}

export async function syncFavoriteFolders(userId: string) {
  // Best-effort. If the table isn't created yet, we keep local-only folders.
  const local = await getLocalFavoriteFolders();
  if (!local.length) return;

  try {
    const { data, error } = await supabase
      .from('favorite_folders')
      .select('id,name,created_at')
      .eq('user_id', userId);

    if (error) return;

    const remote = (data ?? []).map((row: any) => ({
      id: row.id,
      name: row.name,
      createdAt: row.created_at ?? new Date().toISOString()
    })) as FavoriteFolder[];

    const remoteIds = new Set(remote.map((f) => f.id));
    const missingRemote = local.filter((f) => !remoteIds.has(f.id));
    if (missingRemote.length) {
      await supabase.from('favorite_folders').insert(
        missingRemote.map((f) => ({
          id: f.id,
          user_id: userId,
          name: f.name
        })) as any
      );
    }

    // Merge by id, prefer local name if set.
    const merged = new Map<string, FavoriteFolder>();
    for (const f of remote) merged.set(f.id, f);
    for (const f of local) merged.set(f.id, { ...merged.get(f.id), ...f } as FavoriteFolder);
    await setLocalFavoriteFolders(Array.from(merged.values()).sort((a, b) => a.name.localeCompare(b.name)));
  } catch {
    // ignore
  }
}

export async function syncFavorites(userId: string) {
  await flushFavoriteQueue(userId);
  await syncFavoriteFolders(userId);

  // Try to fetch with folder_id (new schema); fallback to old schema.
  let data: any[] | null = null;
  let error: any = null;
  {
    const res = await supabase.from('favorites').select('song_id,folder_id').eq('user_id', userId);
    data = res.data as any;
    error = res.error;
    if (error) {
      const res2 = await supabase.from('favorites').select('song_id').eq('user_id', userId);
      data = res2.data as any;
      error = res2.error;
    }
  }

  if (error) {
    return;
  }

  // If some queue items failed to flush, we must NOT "resurrect" removed favorites by merging
  // remote state back into local. We treat pending removals as the intended source of truth.
  const rawQueue = await AsyncStorage.getItem(FAVORITES_QUEUE_KEY);
  const pendingQueue = rawQueue ? (JSON.parse(rawQueue) as FavoriteQueueItem[]) : [];
  const pendingRemovals = new Set(pendingQueue.filter((q) => q.action === 'remove').map((q) => q.songId));

  const remoteIds = (data ?? []).map((fav) => fav.song_id).filter((id) => !pendingRemovals.has(id));
  const remoteMap: Record<string, string | null> = {};
  for (const fav of data ?? []) {
    if (fav?.song_id && !pendingRemovals.has(fav.song_id)) remoteMap[fav.song_id] = fav.folder_id ?? null;
  }
  const localIds = (await getLocalFavorites()).filter((id) => !pendingRemovals.has(id));
  const merged = Array.from(new Set([...localIds, ...remoteIds]));

  // Merge folder map too (prefer remote if present).
  const localMap = await getLocalFavoriteFolderMap();
  const mergedMap: Record<string, string | null> = { ...localMap };
  for (const [songId, folderId] of Object.entries(remoteMap)) mergedMap[songId] = folderId;
  await setLocalFavoriteFolderMap(mergedMap);

  const missingOnRemote = merged.filter((id) => !remoteIds.includes(id));
  if (missingOnRemote.length) {
    // Best effort: include folder_id if supported (ignore if not).
    const rows = missingOnRemote.map((song_id) => {
      const folder_id = mergedMap[song_id];
      return folder_id ? { song_id, user_id: userId, folder_id } : { song_id, user_id: userId };
    });
    await supabase.from('favorites').insert(rows as any);
  }

  await setLocalFavorites(merged);
}

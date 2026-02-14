import AsyncStorage from '@react-native-async-storage/async-storage';
import { churchStorageKey, worshipSetlistsStorageKey } from '../constants';
import type { ChurchProfile, WorshipSetlist } from '../types';

export async function loadChurchProfile(userId: string): Promise<ChurchProfile | null> {
  const raw = await AsyncStorage.getItem(churchStorageKey(userId));
  return raw ? JSON.parse(raw) : null;
}

export async function saveChurchProfile(userId: string, record: ChurchProfile): Promise<void> {
  await AsyncStorage.setItem(churchStorageKey(userId), JSON.stringify(record));
}

export async function removeChurchProfile(userId: string): Promise<void> {
  await AsyncStorage.removeItem(churchStorageKey(userId));
}

export async function loadWorshipSetlists(userId: string): Promise<WorshipSetlist[]> {
  const raw = await AsyncStorage.getItem(worshipSetlistsStorageKey(userId));
  return raw ? JSON.parse(raw) : [];
}

export async function saveWorshipSetlists(userId: string, setlists: WorshipSetlist[]): Promise<void> {
  await AsyncStorage.setItem(worshipSetlistsStorageKey(userId), JSON.stringify(setlists));
}

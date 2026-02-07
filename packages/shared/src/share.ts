import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string';

export function encodeSharedSongVersion(text: string): string {
  return compressToEncodedURIComponent(String(text ?? ''));
}

export function decodeSharedSongVersion(encoded: string): string | null {
  if (!encoded) return null;
  try {
    const value = decompressFromEncodedURIComponent(encoded);
    if (typeof value !== 'string' || !value.trim()) return null;
    return value;
  } catch {
    return null;
  }
}


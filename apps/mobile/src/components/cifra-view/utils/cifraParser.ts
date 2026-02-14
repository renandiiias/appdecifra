import { tokenizeLine } from '@cifras/shared';
import type { ParsedCifra } from '../types';
import { compactNormalize } from './musicTheory';

export function isJunkScrapeLine(line: string) {
  const trimmed = line.trim();
  if (!trimmed) return false;

  const normalized = compactNormalize(trimmed);

  if (normalized.startsWith('composicao')) return true;
  if (normalized.startsWith('colaboracaoerevisao')) return true;
  if (/^\d+(?:\.\d+)*exibicoes$/u.test(normalized)) return true;
  if (/https?:\/\//iu.test(trimmed)) return true;
  if (/cifraclub\.com|letras\.mus\.br|palcomp3/iu.test(trimmed)) return true;

  const exact = new Set([
    'videoaula',
    'simplificarcifra',
    'autorolagem',
    'texto',
    'restaurar',
    'acordes',
    'afinacao',
    'capotraste',
    'exibir',
    'adicionaralista',
    'metronomo',
    'dicionario',
    'baixarcifra',
    'cifraclubpro',
    'cancelar',
    'ok',
    'cancelarok'
  ]);
  if (exact.has(normalized)) return true;

  const contains = [
    'repetir',
    'modoteatro',
    'visualizacaopadrao',
    'miniplayer',
    'outrosvideos',
    'exibircifraemduascolunas',
    'diagramasnocorpodacifra',
    'diagramasnofimdacifra',
    'montagensparacanhoto'
  ];
  return contains.some((marker) => normalized.includes(marker));
}

export function parseCredits(lines: string[]) {
  const blob = lines.join('\n');
  const compact = blob.replace(/\s+/g, ' ').trim();

  const composerMatch = compact.match(/Composi(?:c|ç)ão(?:\s+de|\s*:)\s+(.+?)(?:\.|\n|$)/iu);
  const composersRaw = composerMatch?.[1]?.trim() ?? '';
  const composers = composersRaw
    ? composersRaw
        .replace(/Esta informação.*$/iu, '')
        .split(/\s*\/\s*|\s*,\s*/u)
        .map((name) => name.trim())
        .filter(Boolean)
    : [];

  const reviewers: string[] = [];
  const startIndex = lines.findIndex((line) => compactNormalize(line).startsWith('colaboracaoerevisao'));
  if (startIndex !== -1) {
    const inline = String(lines[startIndex] ?? '');
    const inlineParts = inline.split(/:\s*/u);
    if (inlineParts.length >= 2) {
      const restInline = inlineParts.slice(1).join(':').trim();
      if (restInline) {
        for (const part of restInline.split(/\s*\/\s*|\s*,\s*/u).map((name) => name.trim()).filter(Boolean)) {
          reviewers.push(part);
        }
      }
    }

    for (let i = startIndex + 1; i < lines.length; i += 1) {
      const raw = lines[i] ?? '';
      const value = raw.trim().replace(/\s+/g, ' ');
      if (!value) continue;
      const normalized = compactNormalize(value);

      if (isJunkScrapeLine(value) || normalized.includes('exibicoes')) break;
      if (value.startsWith('+')) continue;
      if (/^\d+$/u.test(normalized)) continue;
      if (normalized.startsWith('colaboracaoerevisao')) continue;

      for (const part of value.split(/\s*,\s*/u).map((name) => name.trim()).filter(Boolean)) {
        reviewers.push(part);
      }
      if (reviewers.length >= 12) break;
    }
  }

  const uniqueReviewers = Array.from(new Set(reviewers));
  return { composers, reviewers: uniqueReviewers };
}

export function parseAndCleanCifra(raw: string): ParsedCifra {
  const lines = raw.split(/\r?\n/);
  const start = lines.findIndex((line) => isJunkScrapeLine(line));
  const main = (start === -1 ? lines : lines.slice(0, start)).join('\n').trim();
  const rest = start === -1 ? [] : lines.slice(start);

  const { composers, reviewers } = parseCredits(rest);
  return { cleanText: main, composers, reviewers };
}

export function isChordLine(tokens: ReturnType<typeof tokenizeLine>) {
  const hasChord = tokens.some((t) => t.type === 'chord');
  const hasNonSpaceText = tokens.some((t) => t.type !== 'chord' && t.value.trim().length > 0);
  return hasChord && !hasNonSpaceText;
}

# Cifras Cristãs MVP

MVP completo de uma plataforma de cifras cristãs (web + mobile) com foco em experiência limpa, sem anúncios.

## Requisitos

- Node.js 18+
- pnpm 9+
- Supabase CLI (opcional, mas recomendado para rodar local)
- Expo CLI (via `npx expo`)

## Estrutura

- `apps/web` — Next.js (App Router)
- `apps/mobile` — React Native com Expo
- `packages/shared` — tipos, parsing e transposição
- `packages/chords` — dicionário e diagramas
- `supabase/migrations` — schema + RLS
- `supabase/seed` — seed e importador CSV

## Setup rápido

1. Instale dependências

```bash
pnpm install
```

2. Configure envs

```bash
cp apps/web/.env.example apps/web/.env.local
cp apps/mobile/.env.example apps/mobile/.env
```

3. Supabase local (opcional)

```bash
supabase start
supabase db reset
```

Se preferir, rode manualmente:

```bash
psql "$DATABASE_URL" -f supabase/migrations/20260204120000_init.sql
psql "$DATABASE_URL" -f supabase/seed/seed.sql
```

4. Rodar Web

```bash
pnpm dev:web
```

5. Rodar Mobile

```bash
pnpm dev:mobile
```

## Variáveis de ambiente

### Web (`apps/web/.env.local`)

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

### Mobile (`apps/mobile/.env`)

```
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=
EXPO_PUBLIC_WEB_TUNER_URL=http://localhost:3000/afinador
```

## Seed e importador CSV

Seed rápido:

```bash
psql "$DATABASE_URL" -f supabase/seed/seed.sql
```

Importar CSV simples (sem aspas, separador `,`):

```bash
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... ts-node supabase/seed/import_csv.ts caminho/arquivo.csv
```

Formato esperado do CSV:

```
title,artist,lyrics_chords,original_key,tuning,capo,category
```

## Sync live do scraper (lotes de 1000)

Para subir artistas + musicas em paralelo ao scrape (sem parar o scraper), use:

```bash
SUPABASE_URL=... \
SUPABASE_SERVICE_ROLE_KEY=... \
./scripts/run_live_cifraclub_sync.sh --dataset-dir /srv/data/cifraclub-full-v3
```

Comportamento:

- Le novas musicas `status='done'` dos `sqlite` em `/db/letter_*.sqlite3`.
- Sincroniza em lotes (`--batch-size`, default `1000`).
- Persiste checkpoint em `<dataset-dir>/supabase_sync/state.json`.
- Gera categorizacao de secoes (intro/verse/pre_chorus/chorus/bridge/etc) em:
  `<dataset-dir>/supabase_sync/sections/<artist>/<song>.json`.

Modo one-shot (uma rodada):

```bash
SUPABASE_URL=... \
SUPABASE_SERVICE_ROLE_KEY=... \
./scripts/run_live_cifraclub_sync.sh --dataset-dir /srv/data/cifraclub-full-v3 --once
```

## Testes de transposição

```bash
pnpm test
```

## Afinador

- Web: abra `/afinador` e permita o microfone.
- Mobile: modo referência sonora (notas E A D G B E). Se precisar de detecção via microfone, use o botão para abrir o afinador web dentro do app.

## Offline no mobile

- Favoritos ficam em `AsyncStorage`.
- As cifras favoritas são cacheadas para abrir offline.
- Quando a conexão retorna, o app sincroniza com o Supabase.

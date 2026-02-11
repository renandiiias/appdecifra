import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const execFileAsync = promisify(execFile);
const CACHE_TTL_MS = 15_000;

type CacheEntry = {
  at: number;
  payload: Record<string, unknown>;
};

let cache: CacheEntry | null = null;

function resolveScriptPath() {
  const cwd = process.cwd();
  const candidates = [
    path.join(cwd, 'scripts', 'live_ingestion_dashboard.py'),
    path.join(cwd, 'apps', 'web', 'scripts', 'live_ingestion_dashboard.py')
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) || candidates[0];
}

export async function GET(request: NextRequest) {
  const forceRefresh = request.nextUrl.searchParams.get('refresh') === '1';

  if (!forceRefresh && cache && Date.now() - cache.at < CACHE_TTL_MS) {
    return NextResponse.json({
      ...cache.payload,
      cached: true,
      cache_age_ms: Date.now() - cache.at
    });
  }

  const scriptPath = resolveScriptPath();
  const pythonBin = process.env.PYTHON_BIN || 'python3';

  try {
    const { stdout } = await execFileAsync(pythonBin, [scriptPath], {
      timeout: 25_000,
      maxBuffer: 8 * 1024 * 1024,
      env: process.env
    });

    const payload = JSON.parse((stdout || '').trim() || '{}') as Record<string, unknown>;
    cache = {
      at: Date.now(),
      payload
    };

    return NextResponse.json({
      ...payload,
      cached: false,
      cache_age_ms: 0
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';

    if (cache) {
      return NextResponse.json(
        {
          ...cache.payload,
          stale: true,
          error: `Live refresh failed: ${message}`,
          cached: true,
          cache_age_ms: Date.now() - cache.at
        },
        { status: 200 }
      );
    }

    return NextResponse.json(
      {
        ok: false,
        error: `Live refresh failed: ${message}`
      },
      { status: 500 }
    );
  }
}

import { NextResponse, type NextRequest } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

function parseAdminEmails() {
  const raw = process.env.ADMIN_EMAILS || '';
  return raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

async function requireAdmin(req: NextRequest) {
  const auth = req.headers.get('authorization') || '';
  const token = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
  if (!token) {
    return { error: NextResponse.json({ error: 'unauthenticated' }, { status: 401 }) as NextResponse };
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    return { error: NextResponse.json({ error: 'unauthenticated' }, { status: 401 }) as NextResponse };
  }

  const email = (data.user.email || '').toLowerCase();
  const allow = parseAdminEmails();
  if (!allow.length || !email || !allow.includes(email)) {
    return { error: NextResponse.json({ error: 'forbidden' }, { status: 403 }) as NextResponse };
  }

  return { user: data.user, token };
}

export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if ('error' in admin) return admin.error;

  const songId = new URL(req.url).searchParams.get('songId') || '';
  if (!songId) return NextResponse.json({ error: 'missing_songId' }, { status: 400 });

  const supabase = getSupabaseAdmin() as any;
  const { data, error } = await supabase
    .from('songs')
    .select('id,title,lyrics_chords,artists(name)')
    .eq('id', songId)
    .single();
  if (error) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  return NextResponse.json({ song: data });
}

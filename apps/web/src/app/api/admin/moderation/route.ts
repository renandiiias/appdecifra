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

  const supabase = getSupabaseAdmin() as any;

  const [
    suggestionsRes,
    artistClaimsRes,
    songClaimsRes,
    videoLessonsRes,
    executionTipsRes
  ] = await Promise.all([
    supabase
      .from('song_suggestions')
      .select('id,song_id,song_title,artist,kind,text,status,created_at')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(120),
    supabase
      .from('artist_claim_requests')
      .select('id,artist_id,user_id,name,email,whatsapp,instagram,message,status,created_at,artists(name,verified_at,claimed_user_id)')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(120),
    supabase
      .from('song_claim_requests')
      .select('id,song_id,song_title,artist,user_id,name,email,whatsapp,instagram,message,extra,status,created_at')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(120),
    supabase
      .from('song_video_lesson_requests')
      .select('id,song_id,song_title,artist,user_id,name,email,whatsapp,youtube_url,message,status,created_at')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(120),
    supabase
      .from('song_execution_tip_requests')
      .select('id,song_id,song_title,artist,user_id,kind,text,status,created_at')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(120)
  ]);

  const suggestions = (suggestionsRes.data as any[] | null) ?? [];
  const suggestionIds = suggestions.map((s) => s.id).filter(Boolean);
  let suggestionVotes: Record<string, { upvotes: number; downvotes: number }> = {};
  if (suggestionIds.length) {
    const { data: queue } = await supabase
      .from('song_suggestions_queue')
      .select('suggestion_id,upvotes,downvotes')
      .in('suggestion_id', suggestionIds)
      .limit(500);
    suggestionVotes = Object.fromEntries(
      ((queue as any[] | null) ?? []).map((row) => [
        String(row.suggestion_id),
        { upvotes: Number(row.upvotes ?? 0), downvotes: Number(row.downvotes ?? 0) }
      ])
    );
  }

  return NextResponse.json({
    suggestions,
    suggestionVotes,
    artistClaims: (artistClaimsRes.data as any[] | null) ?? [],
    songClaims: (songClaimsRes.data as any[] | null) ?? [],
    videoLessons: (videoLessonsRes.data as any[] | null) ?? [],
    executionTips: (executionTipsRes.data as any[] | null) ?? [],
    errors: {
      suggestions: suggestionsRes.error?.message ?? null,
      artistClaims: artistClaimsRes.error?.message ?? null,
      songClaims: songClaimsRes.error?.message ?? null,
      videoLessons: videoLessonsRes.error?.message ?? null,
      executionTips: executionTipsRes.error?.message ?? null
    }
  });
}

type ModerationActionBody =
  | { type: 'song_suggestion'; id: string; action: 'approve' | 'reject' | 'apply_and_approve'; lyrics_chords?: string }
  | { type: 'artist_claim'; id: string; action: 'approve' | 'reject' | 'approve_and_verify' }
  | { type: 'song_claim'; id: string; action: 'approve' | 'reject' }
  | { type: 'video_lesson'; id: string; action: 'approve' | 'reject' }
  | { type: 'execution_tip'; id: string; action: 'approve' | 'reject' };

export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if ('error' in admin) return admin.error;

  let body: ModerationActionBody;
  try {
    body = (await req.json()) as ModerationActionBody;
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin() as any;
  const reviewedBy = admin.user.id;
  const reviewedAt = new Date().toISOString();
  const id = String((body as any)?.id || '');
  if (!id) return NextResponse.json({ error: 'missing_id' }, { status: 400 });

  try {
    if (body.type === 'song_suggestion') {
      if (body.action === 'apply_and_approve') {
        const lyrics = String(body.lyrics_chords ?? '').trim();
        if (!lyrics) return NextResponse.json({ error: 'missing_lyrics_chords' }, { status: 400 });

        const { data: sug, error: sugErr } = await supabase
          .from('song_suggestions')
          .select('id,song_id')
          .eq('id', id)
          .single();
        if (sugErr) throw sugErr;

        const songId = String((sug as any).song_id || '');
        if (!songId) return NextResponse.json({ error: 'missing_song_id' }, { status: 400 });

        const { error: songErr } = await supabase.from('songs').update({ lyrics_chords: lyrics }).eq('id', songId);
        if (songErr) throw songErr;

        const { error: upErr } = await supabase
          .from('song_suggestions')
          .update({ status: 'approved', reviewed_at: reviewedAt, reviewed_by: reviewedBy })
          .eq('id', id);
        if (upErr) throw upErr;

        return NextResponse.json({ ok: true });
      }

      const nextStatus = body.action === 'approve' ? 'approved' : 'rejected';
      const { error } = await supabase
        .from('song_suggestions')
        .update({ status: nextStatus, reviewed_at: reviewedAt, reviewed_by: reviewedBy })
        .eq('id', id);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    if (body.type === 'artist_claim') {
      if (body.action === 'approve' || body.action === 'approve_and_verify') {
        const { data: reqRow, error: selErr } = await supabase
          .from('artist_claim_requests')
          .select('id,artist_id,user_id')
          .eq('id', id)
          .single();
        if (selErr) throw selErr;

        const artistId = String((reqRow as any).artist_id || '');
        const claimantId = String((reqRow as any).user_id || '');
        if (!artistId || !claimantId) return NextResponse.json({ error: 'invalid_request' }, { status: 400 });

        const artistUpdate: any = { claimed_user_id: claimantId, claimed_at: reviewedAt };
        if (body.action === 'approve_and_verify') artistUpdate.verified_at = reviewedAt;

        const { error: artErr } = await supabase.from('artists').update(artistUpdate).eq('id', artistId);
        if (artErr) throw artErr;

        const { error: upErr } = await supabase
          .from('artist_claim_requests')
          .update({ status: 'approved', reviewed_at: reviewedAt, reviewed_by: reviewedBy })
          .eq('id', id);
        if (upErr) throw upErr;

        return NextResponse.json({ ok: true });
      }

      const { error } = await supabase
        .from('artist_claim_requests')
        .update({ status: 'rejected', reviewed_at: reviewedAt, reviewed_by: reviewedBy })
        .eq('id', id);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    if (body.type === 'song_claim') {
      const nextStatus = body.action === 'approve' ? 'approved' : 'rejected';
      const { error } = await supabase
        .from('song_claim_requests')
        .update({ status: nextStatus, reviewed_at: reviewedAt, reviewed_by: reviewedBy })
        .eq('id', id);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    if (body.type === 'video_lesson') {
      const nextStatus = body.action === 'approve' ? 'approved' : 'rejected';
      const { error } = await supabase
        .from('song_video_lesson_requests')
        .update({ status: nextStatus, reviewed_at: reviewedAt, reviewed_by: reviewedBy })
        .eq('id', id);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    if (body.type === 'execution_tip') {
      const nextStatus = body.action === 'approve' ? 'approved' : 'rejected';
      const { error } = await supabase
        .from('song_execution_tip_requests')
        .update({ status: nextStatus, reviewed_at: reviewedAt, reviewed_by: reviewedBy })
        .eq('id', id);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'unknown_type' }, { status: 400 });
  } catch (err: any) {
    const message = err instanceof Error ? err.message : 'failed';
    return NextResponse.json({ error: 'failed', message }, { status: 500 });
  }
}

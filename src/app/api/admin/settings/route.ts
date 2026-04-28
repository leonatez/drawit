import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { loadAdminSettings, saveAdminSettings } from '@/lib/storage';

async function isAdmin(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const { data: p } = await supabase.from('profiles').select('user_type').eq('id', user.id).single();
  return p?.user_type === 'admin';
}

export async function GET() {
  const settings = await loadAdminSettings();
  return NextResponse.json({ settings });
}

export async function PUT(req: NextRequest) {
  if (!(await isAdmin(req))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const body = await req.json();
  const settings = await loadAdminSettings();
  const updated = {
    compress_images: body.compress_images ?? settings.compress_images,
    compress_width: body.compress_width ?? settings.compress_width,
    vec_n_colors: body.vec_n_colors ?? settings.vec_n_colors,
    vec_min_area: body.vec_min_area ?? settings.vec_min_area,
    vec_smoothing: body.vec_smoothing ?? settings.vec_smoothing,
    rmbg_model: body.rmbg_model ?? settings.rmbg_model,
  };
  await saveAdminSettings(updated);
  return NextResponse.json({ ok: true, settings: updated });
}

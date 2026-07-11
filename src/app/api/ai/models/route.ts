import { NextResponse } from 'next/server';
import { requireMember } from '@/lib/auth-guard';
import { getConfiguredModels } from '@/lib/ai/providers/types';

export const dynamic = 'force-dynamic';

export async function GET() {
  const guard = await requireMember();
  if (!guard.ok) return guard.response;

  const models = getConfiguredModels();
  return NextResponse.json({ models, default: models[0] });
}

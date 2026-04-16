import { NextRequest, NextResponse } from 'next/server';
import { nanoid } from 'nanoid';
import { saveProject, loadProject } from '@/lib/storage';
import type { Project } from '@/types';

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const project = await loadProject(id);
  if (!project) return NextResponse.json({ error: 'not found' }, { status: 404 });

  return NextResponse.json({ project });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const id = (body.id as string) || nanoid();
  const name = (body.name as string) || 'Untitled Project';

  const existing = await loadProject(id);
  if (existing) {
    return NextResponse.json({ project: existing });
  }

  const project: Project = {
    id,
    name,
    userId: body.userId ?? null,
    pictures: [],
    selectionBoxes: [],
    versions: [],
    chatMessages: [],
    nextBoxNumber: 1,
    sceneJSON: '{}',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await saveProject(project);
  return NextResponse.json({ project });
}

export async function PUT(req: NextRequest) {
  const body = await req.json();
  const project = body as Project;
  if (!project.id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  project.updatedAt = new Date().toISOString();
  await saveProject(project);
  return NextResponse.json({ ok: true });
}

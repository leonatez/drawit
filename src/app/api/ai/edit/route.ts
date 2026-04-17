import { NextRequest, NextResponse } from 'next/server';
import { editImage } from '@/lib/ai/gemini';
import { readPictureBase64, savePictureFile, loadProject, saveProject, saveVersionSnapshot } from '@/lib/storage';
import { parseMentions } from '@/lib/utils';
import { requireMember } from '@/lib/auth-guard';
import { nanoid } from 'nanoid';
import type { EditRequest, ResolvedMention } from '@/types';

export async function POST(req: NextRequest) {
  const guard = await requireMember();
  if (!guard.ok) return guard.response;

  const body: EditRequest = await req.json();
  const { projectId, prompt, mentions } = body;

  if (!projectId || !prompt) {
    return NextResponse.json({ error: 'projectId and prompt required' }, { status: 400 });
  }

  const project = await loadProject(projectId);
  if (!project) return NextResponse.json({ error: 'project not found' }, { status: 404 });

  // Determine which pictures to load
  const pictureIdsToLoad = new Set<string>();
  for (const m of mentions) {
    pictureIdsToLoad.add(m.pictureId);
  }

  if (pictureIdsToLoad.size === 0) {
    return NextResponse.json({ error: 'no pictures referenced' }, { status: 400 });
  }

  // Snapshot current state as a version BEFORE editing
  const versionId = nanoid();
  const snapshotData: Record<string, string> = {};
  for (const pic of project.pictures) {
    try {
      snapshotData[pic.id] = await readPictureBase64(pic.storagePath);
    } catch { /* skip if file missing */ }
  }
  await saveVersionSnapshot(projectId, versionId, snapshotData);

  // Add version to project
  project.versions = [
    {
      id: versionId,
      description: `Edit: ${prompt.slice(0, 60)}`,
      createdAt: new Date().toISOString(),
      pictureData: {},  // stored on disk, not in JSON
      sceneJSON: project.sceneJSON,
    },
    ...project.versions,
  ].slice(0, 20);

  // Load picture base64 data
  const pictureBase64Map: Record<string, string> = {};
  for (const picId of pictureIdsToLoad) {
    const pic = project.pictures.find((p) => p.id === picId);
    if (!pic) continue;
    try {
      pictureBase64Map[picId] = await readPictureBase64(pic.storagePath);
    } catch { /* skip */ }
  }

  // Target is the picture that owns the first box mention (the box defines the destination).
  // Fall back to the first picture mention, then the first picture in the project.
  const boxMention = mentions.find((m) => m.type === 'box');
  const targetPictureId =
    boxMention?.pictureId ?? mentions[0]?.pictureId ?? project.pictures[0]?.id;

  if (!targetPictureId || !pictureBase64Map[targetPictureId]) {
    return NextResponse.json({ error: 'target picture not found' }, { status: 400 });
  }

  // Enrich mentions with box data
  const enrichedMentions: ResolvedMention[] = mentions.map((m) => {
    if (m.type === 'box') {
      const box = project.selectionBoxes.find((b) => b.label === m.label);
      return { ...m, box };
    }
    return m;
  });

  // Call Gemini
  const result = await editImage({
    prompt,
    mentions: enrichedMentions,
    pictureBase64Map,
    targetPictureId,
  });

  const editedImages: { pictureId: string; base64: string }[] = [];

  if (result.editedBase64) {
    // Save the edited image, overwriting the current picture
    const targetPic = project.pictures.find((p) => p.id === targetPictureId);
    if (targetPic) {
      const buf = Buffer.from(result.editedBase64, 'base64');
      await savePictureFile(projectId, targetPictureId, buf);
      editedImages.push({ pictureId: targetPictureId, base64: result.editedBase64 });
    }
  }

  await saveProject(project);

  return NextResponse.json({
    success: result.editedBase64 !== null,
    editedImages,
    message: result.message,
    versionId,
  });
}

import { NextRequest, NextResponse } from 'next/server';
import { loadProject, saveProject, readVersionSnapshot, savePictureFile } from '@/lib/storage';

export async function POST(req: NextRequest) {
  const { projectId, versionId } = await req.json();

  if (!projectId || !versionId) {
    return NextResponse.json({ error: 'projectId and versionId required' }, { status: 400 });
  }

  const project = await loadProject(projectId);
  if (!project) return NextResponse.json({ error: 'project not found' }, { status: 404 });

  const version = project.versions.find((v) => v.id === versionId);
  if (!version) return NextResponse.json({ error: 'version not found' }, { status: 404 });

  // Restore picture files from version snapshot
  const pictureIds = project.pictures.map((p) => p.id);
  const snapshotData = await readVersionSnapshot(projectId, versionId, pictureIds);

  const restoredBase64Map: Record<string, string> = {};
  for (const [picId, base64] of Object.entries(snapshotData)) {
    await savePictureFile(projectId, picId, Buffer.from(base64, 'base64'));
    restoredBase64Map[picId] = base64;
  }

  // Restore scene JSON
  project.sceneJSON = version.sceneJSON;
  project.updatedAt = new Date().toISOString();
  await saveProject(project);

  return NextResponse.json({
    ok: true,
    sceneJSON: version.sceneJSON,
    restoredImages: restoredBase64Map,
  });
}

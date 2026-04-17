'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { FolderOpen, Plus, Trash2, X, Clock, Image as ImageIcon } from 'lucide-react';
import { useEditorStore } from '@/store';
import { sceneSerializerRef, sceneRestorerRef } from '@/lib/scene-ref';
import { nanoid } from 'nanoid';
import toast from 'react-hot-toast';

interface ProjectSummary {
  id: string;
  name: string;
  updatedAt: string;
  pictureCount: number;
}

export default function ProjectsModal() {
  const { setShowProjects, projectId, toProject, markClean, loadProject } = useEditorStore();

  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState<string | null>(null);

  const fetchProjects = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/projects');
      const data = await res.json();
      setProjects(data.projects ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchProjects(); }, [fetchProjects]);

  const saveCurrentProject = async () => {
    const state = useEditorStore.getState();
    const json = sceneSerializerRef.current();
    if (json !== '{}') state.setSceneJSON(json);
    await fetch('/api/project', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state.toProject()),
    });
    markClean();
  };

  const switchToProject = async (id: string) => {
    if (id === projectId) { setShowProjects(false); return; }
    setSwitching(id);
    try {
      await saveCurrentProject();
      const res = await fetch(`/api/project?id=${id}`);
      if (!res.ok) throw new Error('Project not found');
      const { project } = await res.json();
      loadProject(project);
      localStorage.setItem('drawit-project-id', id);
      // Restore Excalidraw scene and reload images
      if (project.sceneJSON && project.sceneJSON !== '{}') {
        sceneRestorerRef.current(project.sceneJSON);
      }
      window.dispatchEvent(new CustomEvent('drawit:picture-updated'));
      setShowProjects(false);
      toast.success(`Opened "${project.name}"`);
    } catch (err) {
      toast.error(`Failed to open project: ${err}`);
    } finally {
      setSwitching(null);
    }
  };

  const createNewProject = async () => {
    setSwitching('new');
    try {
      await saveCurrentProject();
      const id = nanoid();
      const name = `Project ${new Date().toLocaleDateString()}`;
      const res = await fetch('/api/project', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, name }),
      });
      const { project } = await res.json();
      loadProject(project);
      localStorage.setItem('drawit-project-id', id);
      sceneRestorerRef.current('{}');
      window.dispatchEvent(new CustomEvent('drawit:picture-updated'));
      setShowProjects(false);
      toast.success(`Created "${project.name}"`);
    } catch (err) {
      toast.error(`Failed to create project: ${err}`);
    } finally {
      setSwitching(null);
    }
  };

  const handleDelete = async (e: React.MouseEvent, proj: ProjectSummary) => {
    e.stopPropagation();
    if (proj.id === projectId) {
      toast.error("Can't delete the currently open project");
      return;
    }
    if (!window.confirm(`Delete "${proj.name}"? This cannot be undone.`)) return;
    try {
      await fetch(`/api/project?id=${proj.id}`, { method: 'DELETE' });
      setProjects((prev) => prev.filter((p) => p.id !== proj.id));
      toast.success(`Deleted "${proj.name}"`);
    } catch {
      toast.error('Delete failed');
    }
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHrs = Math.floor(diffMins / 60);
    if (diffHrs < 24) return `${diffHrs}h ago`;
    return d.toLocaleDateString();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-[#2a2a3e] border border-[#3a3a4e] rounded-xl shadow-2xl w-[560px] max-h-[70vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-[#3a3a4e]">
          <FolderOpen size={15} className="text-[#89b4fa]" />
          <span className="text-sm font-semibold text-[#cdd6f4] flex-1">Projects</span>
          <button
            onClick={createNewProject}
            disabled={!!switching}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] bg-[#89b4fa] text-[#1e1e2e] font-semibold hover:bg-[#b4cefa] transition-colors disabled:opacity-50"
          >
            <Plus size={11} />
            New Project
          </button>
          <button
            onClick={() => setShowProjects(false)}
            className="ml-1 p-1 rounded-md text-[#6c7086] hover:text-[#cdd6f4] hover:bg-[#313145] transition-colors"
          >
            <X size={14} />
          </button>
        </div>

        {/* Project list */}
        <div className="overflow-y-auto flex-1 p-2">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-[#6c7086] text-xs">
              Loading projects…
            </div>
          ) : projects.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2 text-[#6c7086]">
              <FolderOpen size={28} />
              <p className="text-xs">No projects yet</p>
            </div>
          ) : (
            projects.map((proj) => {
              const isCurrent = proj.id === projectId;
              const isLoading = switching === proj.id;
              return (
                <div
                  key={proj.id}
                  onClick={() => !switching && switchToProject(proj.id)}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg mb-1 cursor-pointer group transition-colors ${
                    isCurrent
                      ? 'bg-[#89b4fa]/15 border border-[#89b4fa]/30'
                      : 'hover:bg-[#313145] border border-transparent'
                  } ${switching && !isLoading ? 'opacity-50 pointer-events-none' : ''}`}
                >
                  {/* Icon */}
                  <div className={`w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0 ${
                    isCurrent ? 'bg-[#89b4fa]/20' : 'bg-[#1e1e2e]'
                  }`}>
                    {isLoading ? (
                      <div className="w-3 h-3 border-2 border-[#89b4fa] border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <FolderOpen size={14} className={isCurrent ? 'text-[#89b4fa]' : 'text-[#6c7086]'} />
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className={`text-xs font-medium truncate ${isCurrent ? 'text-[#89b4fa]' : 'text-[#cdd6f4]'}`}>
                        {proj.name}
                      </p>
                      {isCurrent && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#89b4fa]/20 text-[#89b4fa] font-semibold flex-shrink-0">
                          open
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className="flex items-center gap-1 text-[9px] text-[#6c7086]">
                        <Clock size={8} />
                        {formatDate(proj.updatedAt)}
                      </span>
                      <span className="flex items-center gap-1 text-[9px] text-[#6c7086]">
                        <ImageIcon size={8} />
                        {proj.pictureCount} {proj.pictureCount === 1 ? 'image' : 'images'}
                      </span>
                    </div>
                  </div>

                  {/* Delete */}
                  {!isCurrent && (
                    <button
                      onClick={(e) => handleDelete(e, proj)}
                      className="opacity-0 group-hover:opacity-100 p-1 rounded text-[#6c7086] hover:text-[#f38ba8] hover:bg-[#f38ba8]/10 transition-all"
                      title="Delete project"
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

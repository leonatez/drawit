'use client';

import { useEffect } from 'react';
import { useEditorStore } from '@/store';
import toast from 'react-hot-toast';
import { createClient } from '@/lib/supabase/client';
import dynamic from 'next/dynamic';
import TopBar from '@/components/layout/TopBar';
import { sceneSerializerRef } from '@/lib/scene-ref';
import ChatPanel from '@/components/chat/ChatPanel';
import LayersPanel from '@/components/sidebar/LayersPanel';
import HistoryPanel from '@/components/sidebar/HistoryPanel';
import AuthModal from '@/components/auth/AuthModal';
import AdminPanel from '@/components/admin/AdminPanel';
import ProjectsModal from '@/components/projects/ProjectsModal';
import ChangePasswordModal from '@/components/auth/ChangePasswordModal';
import LimitExceededModal from '@/components/auth/LimitExceededModal';

const CanvasEditor = dynamic(() => import('@/components/canvas/CanvasEditor'), {
  ssr: false,
  loading: () => (
    <div className="flex-1 flex items-center justify-center bg-[#0f172a]">
      <div className="text-[#64748b]">Loading canvas…</div>
    </div>
  ),
});

export default function HomePage() {
  const { setUser, showAuth, showAdmin, showProjects, showChangePw, setShowChangePw, projectId, toProject, markClean } = useEditorStore();

  // ── Handle URL query params ────────────────────────────────────────────────
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('admin') === '1') {
        useEditorStore.getState().setShowAdmin(true);
      }
      if (params.get('auth_error') === '1') {
        toast.error('Sign-in failed. Please try again.');
        window.history.replaceState({}, '', '/');
      }
    }
  }, []);

  // ── Auth bootstrap ─────────────────────────────────────────────────────────
  useEffect(() => {
    const supabase = createClient();

    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      setUser({ id: user.id, email: user.email!, display_name: user.email!.split('@')[0], user_type: 'guest', created_at: '' });
      supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()
        .then(({ data }) => { if (data) setUser(data); });
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setShowChangePw(true);
        return;
      }
      if (!session?.user) { setUser(null); return; }
      const u = session.user;
      setUser({ id: u.id, email: u.email!, display_name: u.email!.split('@')[0], user_type: 'guest', created_at: '' });
      supabase
        .from('profiles')
        .select('*')
        .eq('id', u.id)
        .single()
        .then(({ data }) => { if (data) setUser(data); });
    });

    return () => subscription.unsubscribe();
  }, [setUser]);

  // ── Load or create project ─────────────────────────────────────────────────
  useEffect(() => {
    const stored = localStorage.getItem('drawit-project-id');
    const id = stored || projectId;
    if (!stored) localStorage.setItem('drawit-project-id', id);

    fetch(`/api/project?id=${id}`)
      .then(async (r) => {
        if (!r.ok) throw new Error('not found');
        return r.json();
      })
      .then(({ project }) => {
        if (project) useEditorStore.getState().loadProject(project);
      })
      .catch(() => {
        fetch('/api/project', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id }),
        });
      });

    // Load admin settings
    fetch('/api/admin/settings')
      .then((r) => r.json())
      .then(({ settings }) => {
        if (settings) useEditorStore.getState().setAdminSettings(settings);
      });
  }, []);

  // ── Auto-save ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const interval = setInterval(async () => {
      const state = useEditorStore.getState();
      if (!state.isDirty) return;
      try {
        // Capture current scene before saving
        const json = sceneSerializerRef.current();
        if (json !== '{}') state.setSceneJSON(json);

        await fetch('/api/project', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(state.toProject()),
        });
        markClean();
      } catch { /* ignore */ }
    }, 5000);
    return () => clearInterval(interval);
  }, [markClean]);

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === 'v' || e.key === 'V') useEditorStore.getState().setTool('select');
      if (e.key === 'b' || e.key === 'B') useEditorStore.getState().setTool('draw-box');

      if (e.key === 'Delete' || e.key === 'Backspace') {
        const state = useEditorStore.getState();
        if (state.selectedBoxId) {
          state.removeSelectionBox(state.selectedBoxId);
        } else if (state.selectedPictureId) {
          const pic = state.pictures.find((p) => p.id === state.selectedPictureId);
          state.removePicture(state.selectedPictureId);
          if (pic) toast(`Deleted ${pic.name}`, { icon: '🗑️' });
        }
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        useEditorStore.getState().undo();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        const state = useEditorStore.getState();
        const json = sceneSerializerRef.current();
        if (json !== '{}') state.setSceneJSON(json);
        fetch('/api/project', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(state.toProject()),
        }).then(() => { markClean(); toast.success('Saved'); });
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [markClean]);

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-[#0f172a]">
      <TopBar />

      <div className="flex flex-1 overflow-hidden">
        {/* Left sidebar */}
        <div className="flex flex-col w-56 border-r border-[#334155] bg-[#1e293b] flex-shrink-0">
          <LayersPanel />
          <HistoryPanel />
        </div>

        {/* Canvas */}
        <div className="flex-1 relative overflow-hidden">
          <CanvasEditor />
        </div>

        {/* Right: Chat */}
        <div className="w-80 border-l border-[#334155] flex-shrink-0 flex flex-col">
          <ChatPanel />
        </div>
      </div>

      {showAuth && <AuthModal />}
      {showAdmin && <AdminPanel />}
      {showProjects && <ProjectsModal />}
      {showChangePw && <ChangePasswordModal onClose={() => setShowChangePw(false)} />}
      <LimitExceededModal />
    </div>
  );
}

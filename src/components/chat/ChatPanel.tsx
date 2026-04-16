'use client';

import React, { useRef, useEffect } from 'react';
import { MessageSquare, Sparkles, Lock } from 'lucide-react';
import { useEditorStore } from '@/store';
import { parseMentions } from '@/lib/utils';
import type { ResolvedMention, ChatMessage } from '@/types';
import toast from 'react-hot-toast';
import MentionInput from './MentionInput';

export default function ChatPanel() {
  const {
    chatMessages, user, pictures, selectionBoxes, projectId,
    isAiLoading, setAiLoading, addChatMessage, createVersion,
    getPictureByName, getBoxByLabel, setShowAuth,
  } = useEditorStore();

  const scrollRef = useRef<HTMLDivElement>(null);

  const isMember = user?.user_type === 'member' || user?.user_type === 'admin';

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [chatMessages.length]);

  const handleSend = async (text: string) => {
    if (!text.trim()) return;
    if (!isMember) { setShowAuth(true); return; }
    if (pictures.length === 0) {
      toast('Upload at least one picture first', { icon: '🖼️' });
      return;
    }

    // Add user message
    addChatMessage({ role: 'user', content: text });

    // Parse and resolve mentions
    const mentionLabels = parseMentions(text);
    const mentions: ResolvedMention[] = [];
    const errors: string[] = [];

    for (const label of mentionLabels) {
      const box = getBoxByLabel(label);
      if (box) {
        mentions.push({ label, type: 'box', pictureId: box.pictureId, box });
        continue;
      }
      const pic = getPictureByName(label);
      if (pic) {
        mentions.push({ label, type: 'picture', pictureId: pic.id });
        continue;
      }
      errors.push(`@${label} not found`);
    }

    if (errors.length) {
      toast.error(errors.join(', '));
      addChatMessage({ role: 'assistant', content: `⚠️ ${errors.join(', ')}` });
      return;
    }

    // If no mentions, apply to first picture by default
    if (mentions.length === 0 && pictures.length > 0) {
      mentions.push({ label: pictures[0].name, type: 'picture', pictureId: pictures[0].id });
    }

    setAiLoading(true);
    try {
      const res = await fetch('/api/ai/edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, prompt: text, mentions }),
      });

      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'AI request failed');

      if (data.success && data.editedImages?.length > 0) {
        // Update picture data URLs in browser
        for (const { pictureId, base64 } of data.editedImages) {
          // Force image reload by busting cache
          const pic = pictures.find((p) => p.id === pictureId);
          if (pic) {
            // Trigger re-fetch by updating the timestamp param — handled by img key
            // The actual file was already updated on the server
          }
        }
        createVersion(`Edit: ${text.slice(0, 60)}`);
        addChatMessage({
          role: 'assistant',
          content: data.message || 'Done! The image has been edited.',
          editedPictureId: data.editedImages[0]?.pictureId,
        });
        // Force picture re-render
        window.dispatchEvent(new CustomEvent('drawit:picture-updated'));
        toast.success('AI edit applied');
      } else {
        addChatMessage({ role: 'assistant', content: data.message || 'No image was generated.' });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(msg);
      addChatMessage({ role: 'assistant', content: `❌ ${msg}` });
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#2a2a3e]">
      {/* Header */}
      <div className="px-3 py-2 border-b border-[#3a3a4e] flex items-center gap-2">
        <MessageSquare size={14} className="text-[#89b4fa]" />
        <span className="text-xs font-semibold text-[#cdd6f4]">AI Chat</span>
        {!isMember && (
          <div className="ml-auto flex items-center gap-1 text-[10px] text-[#fab387]">
            <Lock size={10} />
            <span>Member only</span>
          </div>
        )}
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3">
        {chatMessages.length === 0 && (
          <div className="text-center mt-8 space-y-2">
            <Sparkles size={24} className="mx-auto text-[#6c7086]" />
            <p className="text-xs text-[#6c7086]">
              Upload pictures, draw selection boxes,<br />
              then describe your edits here.
            </p>
            <div className="text-[10px] text-[#6c7086] bg-[#1e1e2e] rounded-lg p-3 text-left space-y-1">
              <p>• <code className="text-[#89b4fa]">@01</code> — reference a box</p>
              <p>• <code className="text-[#89b4fa]">@picture-1</code> — reference a picture</p>
              <p>• <em>"replace the gun in @01 with a book"</em></p>
              <p>• <em>"use the style of @picture-2 on @picture-1"</em></p>
            </div>
          </div>
        )}
        {chatMessages.map((msg) => (
          <MessageBubble key={msg.id} msg={msg} />
        ))}
        {isAiLoading && (
          <div className="flex gap-2 items-start">
            <div className="w-6 h-6 rounded-full bg-[#89b4fa] flex items-center justify-center flex-shrink-0">
              <Sparkles size={12} className="text-[#1e1e2e]" />
            </div>
            <div className="bg-[#1e1e2e] rounded-xl rounded-tl-none px-3 py-2">
              <div className="flex gap-1">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="w-1.5 h-1.5 rounded-full bg-[#6c7086] animate-bounce"
                    style={{ animationDelay: `${i * 0.15}s` }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-[#3a3a4e] p-2">
        {isMember ? (
          <MentionInput onSend={handleSend} disabled={isAiLoading} />
        ) : (
          <button
            onClick={() => setShowAuth(true)}
            className="w-full py-2 rounded-lg bg-[#89b4fa] text-[#1e1e2e] text-xs font-bold"
          >
            Sign in to use AI
          </button>
        )}
      </div>
    </div>
  );
}

// ─── MessageBubble ─────────────────────────────────────────────────────────

function MessageBubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === 'user';

  // Highlight @mentions in message content
  const highlighted = msg.content.replace(/@([\w-]+)/g, '<span style="color:#89b4fa;font-weight:600">@$1</span>');

  return (
    <div className={`flex gap-2 items-start ${isUser ? 'flex-row-reverse' : ''}`}>
      <div
        className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-[10px] font-bold"
        style={{ background: isUser ? '#89b4fa' : '#313145', color: isUser ? '#1e1e2e' : '#cdd6f4' }}
      >
        {isUser ? 'U' : 'AI'}
      </div>
      <div
        className="max-w-[85%] rounded-xl px-3 py-2 text-xs leading-relaxed"
        style={{
          background: isUser ? '#89b4fa20' : '#1e1e2e',
          borderRadius: isUser ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
          color: '#cdd6f4',
        }}
        dangerouslySetInnerHTML={{ __html: highlighted }}
      />
    </div>
  );
}

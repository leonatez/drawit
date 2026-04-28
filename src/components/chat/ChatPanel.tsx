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
    getPictureByName, getBoxByLabel, setShowAuth, setLimitExceeded,
  } = useEditorStore();

  const scrollRef = useRef<HTMLDivElement>(null);

  const isMember = user?.user_type === 'member' || user?.user_type === 'premium' || user?.user_type === 'admin';

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

      if (res.status === 429 && data.limitExceeded) {
        setLimitExceeded({ limitType: data.limitType, limit: data.limit, used: data.used, tier: data.tier });
        return;
      }
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
    <div className="flex flex-col h-full bg-[#1e293b]">
      {/* Header */}
      <div className="px-3 py-2 border-b border-[#334155] flex items-center gap-2">
        <MessageSquare size={14} className="text-[#14b8a6]" />
        <span className="text-xs font-semibold text-[#f1f5f9]">AI Chat</span>
        {!isMember && (
          <div className="ml-auto flex items-center gap-1 text-[10px] text-[#fb923c]">
            <Lock size={10} />
            <span>Member only</span>
          </div>
        )}
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3">
        {chatMessages.length === 0 && (
          <div className="text-center mt-8 space-y-2">
            <Sparkles size={24} className="mx-auto text-[#64748b]" />
            <p className="text-xs text-[#64748b]">
              Upload pictures, draw selection boxes,<br />
              then describe your edits here.
            </p>
            <div className="text-[10px] text-[#64748b] bg-[#0f172a] rounded-lg p-3 text-left space-y-1">
              <p>• <code className="text-[#14b8a6]">@01</code> — reference a box</p>
              <p>• <code className="text-[#14b8a6]">@picture-1</code> — reference a picture</p>
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
            <div className="w-6 h-6 rounded-full bg-[#14b8a6] flex items-center justify-center flex-shrink-0">
              <Sparkles size={12} className="text-[#0f172a]" />
            </div>
            <div className="bg-[#0f172a] rounded-xl rounded-tl-none px-3 py-2">
              <div className="flex gap-1">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="w-1.5 h-1.5 rounded-full bg-[#64748b] animate-bounce"
                    style={{ animationDelay: `${i * 0.15}s` }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-[#334155] p-2">
        {isMember ? (
          <MentionInput onSend={handleSend} disabled={isAiLoading} />
        ) : (
          <button
            onClick={() => setShowAuth(true)}
            className="w-full py-2 rounded-lg bg-[#14b8a6] text-[#0f172a] text-xs font-bold"
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

  // Escape HTML then highlight @mentions — prevents XSS from AI-sourced content
  const escaped = msg.content
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
  const highlighted = escaped.replace(/@([\w-]+)/g, '<span style="color:#14b8a6;font-weight:600">@$1</span>');

  return (
    <div className={`flex gap-2 items-start ${isUser ? 'flex-row-reverse' : ''}`}>
      <div
        className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-[10px] font-bold"
        style={{ background: isUser ? '#14b8a6' : '#334155', color: isUser ? '#0f172a' : '#f1f5f9' }}
      >
        {isUser ? 'U' : 'AI'}
      </div>
      <div
        className="max-w-[85%] rounded-xl px-3 py-2 text-xs leading-relaxed"
        style={{
          background: isUser ? 'rgba(20,184,166,0.12)' : '#0f172a',
          borderRadius: isUser ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
          color: '#f1f5f9',
        }}
        dangerouslySetInnerHTML={{ __html: highlighted }}
      />
    </div>
  );
}

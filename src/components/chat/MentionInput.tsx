'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Send } from 'lucide-react';
import { useEditorStore } from '@/store';

interface Props {
  onSend: (text: string) => void;
  disabled?: boolean;
}

interface MentionSuggestion {
  label: string;
  display: string;
  type: 'box' | 'picture';
  color?: string;
}

export default function MentionInput({ onSend, disabled }: Props) {
  const { pictures, selectionBoxes } = useEditorStore();
  const [value, setValue] = useState('');
  const [suggestions, setSuggestions] = useState<MentionSuggestion[]>([]);
  const [suggestionsVisible, setSuggestionsVisible] = useState(false);
  const [selectedSuggestionIdx, setSelectedSuggestionIdx] = useState(0);
  const [mentionTriggerStart, setMentionTriggerStart] = useState<number | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const allMentions: MentionSuggestion[] = [
    ...selectionBoxes.map((b) => ({
      label: b.label,
      display: `@${b.label}`,
      type: 'box' as const,
      color: b.color,
    })),
    ...pictures.map((p) => ({
      label: p.name,
      display: `@${p.name}`,
      type: 'picture' as const,
    })),
  ];

  const detectMentionTrigger = useCallback(
    (text: string, cursor: number) => {
      const before = text.slice(0, cursor);
      const atIdx = before.lastIndexOf('@');
      if (atIdx === -1) return null;

      // Check nothing between @ and cursor breaks the mention
      const fragment = before.slice(atIdx + 1);
      if (/\s/.test(fragment)) return null;

      return { start: atIdx, query: fragment };
    },
    [],
  );

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value;
    setValue(text);
    const cursor = e.target.selectionStart ?? text.length;
    const trigger = detectMentionTrigger(text, cursor);

    if (trigger) {
      const filtered = allMentions.filter((m) =>
        m.label.toLowerCase().startsWith(trigger.query.toLowerCase()),
      );
      setSuggestions(filtered);
      setSuggestionsVisible(filtered.length > 0);
      setSelectedSuggestionIdx(0);
      setMentionTriggerStart(trigger.start);
    } else {
      setSuggestionsVisible(false);
      setMentionTriggerStart(null);
    }
  };

  const insertMention = (suggestion: MentionSuggestion) => {
    if (mentionTriggerStart === null) return;
    const before = value.slice(0, mentionTriggerStart);
    const after = value.slice(textareaRef.current?.selectionStart ?? value.length);
    const newValue = `${before}@${suggestion.label} ${after}`;
    setValue(newValue);
    setSuggestionsVisible(false);
    setMentionTriggerStart(null);

    // Restore focus
    setTimeout(() => {
      textareaRef.current?.focus();
      const pos = before.length + suggestion.label.length + 2;
      textareaRef.current?.setSelectionRange(pos, pos);
    }, 0);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (suggestionsVisible) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedSuggestionIdx((i) => Math.min(i + 1, suggestions.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedSuggestionIdx((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        if (suggestions[selectedSuggestionIdx]) {
          insertMention(suggestions[selectedSuggestionIdx]);
        }
        return;
      }
      if (e.key === 'Escape') {
        setSuggestionsVisible(false);
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (value.trim()) {
        onSend(value.trim());
        setValue('');
        setSuggestionsVisible(false);
      }
    }
  };

  const handleSendClick = () => {
    if (value.trim()) {
      onSend(value.trim());
      setValue('');
      setSuggestionsVisible(false);
    }
  };

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 120)}px`;
  }, [value]);

  return (
    <div className="relative">
      {/* Suggestions dropdown */}
      {suggestionsVisible && (
        <div className="absolute bottom-full mb-1 left-0 right-0 bg-[#0f172a] border border-[#334155] rounded-lg overflow-hidden shadow-xl z-50">
          {suggestions.map((s, i) => (
            <button
              key={s.label}
              className={`w-full flex items-center gap-2 px-3 py-2 text-xs text-left transition-colors ${
                i === selectedSuggestionIdx ? 'bg-[#334155]' : 'hover:bg-[#334155]'
              }`}
              onMouseDown={(e) => { e.preventDefault(); insertMention(s); }}
            >
              {s.type === 'box' ? (
                <span
                  className="w-3 h-3 rounded-sm flex-shrink-0"
                  style={{ background: s.color }}
                />
              ) : (
                <span className="w-3 h-3 rounded-sm flex-shrink-0 bg-[#14b8a6]/30" />
              )}
              <span className="text-[#14b8a6] font-mono">{s.display}</span>
              <span className="text-[#64748b] ml-auto">{s.type}</span>
            </button>
          ))}
        </div>
      )}

      {/* Input area */}
      <div className="flex gap-2 items-end">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder="Type @ to mention boxes/pictures…"
          rows={1}
          className="flex-1 bg-[#0f172a] text-[#f1f5f9] border border-[#334155] rounded-lg px-3 py-2 text-xs resize-none outline-none focus:border-[#14b8a6] placeholder-[#64748b] disabled:opacity-50"
          style={{ minHeight: 36, maxHeight: 120 }}
        />
        <button
          onClick={handleSendClick}
          disabled={disabled || !value.trim()}
          className="w-8 h-8 flex-shrink-0 rounded-lg bg-[#14b8a6] text-[#0f172a] flex items-center justify-center disabled:opacity-40"
        >
          <Send size={13} />
        </button>
      </div>
      <p className="text-[10px] text-[#64748b] mt-1">Enter to send · Shift+Enter for new line</p>
    </div>
  );
}

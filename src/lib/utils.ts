import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatLabel(n: number): string {
  return String(n).padStart(2, '0');
}

/** Parse @mentions from a string. Returns array of label strings (without @). */
export function parseMentions(text: string): string[] {
  const matches = text.matchAll(/@([\w-]+)/g);
  return [...matches].map(m => m[1]);
}

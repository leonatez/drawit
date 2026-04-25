// SePay (VietQR) payment utilities — server-only (uses Node crypto)
import crypto from 'crypto';

/** Generate a cryptographically random 8-char uppercase alphanumeric order code. */
export function generateOrderCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const bytes = crypto.randomBytes(8);
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

/**
 * Build the SePay QR image URL.
 * Account number and bank code are public — safe to use client-side.
 */
export function buildQrUrl(
  accountNumber: string,
  bankCode: string,
  amount: number,
  orderCode: string,
): string {
  const params = new URLSearchParams({
    acc: accountNumber,
    bank: bankCode,
    amount: String(amount),
    des: orderCode,
    template: 'compact',
  });
  return `https://qr.sepay.vn/img?${params.toString()}`;
}

/**
 * Verify the SePay webhook API key header.
 * SePay sends apikey header with the secret configured in their dashboard.
 */
export function verifyWebhookApiKey(apiKey: string | null): boolean {
  const secret = process.env.SEPAY_WEBHOOK_SECRET;
  if (!secret || !apiKey) return false;
  // Timing-safe comparison prevents timing-attack key enumeration
  if (apiKey.length !== secret.length) return false;
  return crypto.timingSafeEqual(Buffer.from(apiKey), Buffer.from(secret));
}

/**
 * Extract the first matching order code from a transfer content string.
 * Tries case-insensitive match against the provided list of valid codes.
 */
/**
 * Extract the first matching order code from a transfer content string.
 * Matches on word boundaries to avoid false positives from superstrings.
 */
export function extractOrderCode(content: string, validCodes: string[]): string | null {
  const upper = content.toUpperCase();
  // Split on non-alphanumeric delimiters and match whole tokens only
  const tokens = upper.split(/[^A-Z0-9]+/);
  return validCodes.find((code) => tokens.includes(code)) ?? null;
}

/** Add 30 days to a date (subscription period). */
export function addSubscriptionMonth(from: Date = new Date()): Date {
  const d = new Date(from);
  d.setDate(d.getDate() + 30);
  return d;
}

// Best-effort transactional email via Resend (same provider as auth OTP). Unlike the auth
// path — which MUST have email configured in production — operational alerts are advisory:
// when RESEND_API_KEY / AUTH_EMAIL_FROM are absent we log and skip rather than throw, so a
// missing mail config never takes down a worker job. Returns whether the mail was sent.

import { log } from "@/log";

export interface SendEmailInput {
  to: string;
  subject: string;
  text: string;
}

export interface SendEmailResult {
  sent: boolean;
  skippedReason?: "not_configured" | "no_recipient";
}

const RESEND_ENDPOINT = "https://api.resend.com/emails";

/**
 * Send one plaintext email. Best-effort: returns { sent:false, skippedReason } when mail
 * isn't configured (no key/from) or there's no recipient, and propagates a thrown error
 * only when the Resend API itself rejects a fully-configured send (so callers can decide
 * whether to swallow it). Never logs the API key.
 */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.AUTH_EMAIL_FROM?.trim();
  const to = input.to.trim();

  if (!to) return { sent: false, skippedReason: "no_recipient" };
  if (!apiKey || !from) {
    log.warn(`[email] not configured (RESEND_API_KEY/AUTH_EMAIL_FROM) — skipped "${input.subject}"`);
    return { sent: false, skippedReason: "not_configured" };
  }

  const response = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ from, to, subject: input.subject, text: input.text }),
  });
  if (!response.ok) {
    throw new Error(`email send failed: ${response.status}`);
  }
  return { sent: true };
}

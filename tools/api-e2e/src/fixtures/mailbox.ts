import type { Config } from '../config/env.js';

/**
 * Reading an invitation out of the mailbox it was sent to.
 *
 * The backend no longer returns an invite's token to anybody: it stores the
 * hash, and the raw value exists only long enough to be put in an email. So the
 * suite gets it the way the invited person does — out of their mail. That is
 * not a workaround for the API being awkward; it is the same path a real
 * recipient takes, and it would fail loudly the day a token started appearing
 * in an API response instead.
 *
 * Mail is delivered asynchronously, so the read polls briefly rather than
 * assuming the message has landed by the time the HTTP call returned.
 */

type MailpitSummary = { ID: string; To?: { Address?: string }[] };

const TOKEN = /token=([A-Za-z0-9_-]+)/;

async function messagesTo(config: Config, email: string): Promise<string[]> {
  const response = await fetch(`${config.mailApiUrl}/api/v1/messages?limit=200`);
  if (!response.ok) return [];
  const body = (await response.json()) as { messages?: MailpitSummary[] };
  const wanted = email.trim().toLowerCase();
  return (body.messages ?? [])
    .filter((message) => (message.To ?? []).some(
      (recipient) => (recipient.Address ?? '').trim().toLowerCase() === wanted))
    .map((message) => message.ID);
}

async function bodyOf(config: Config, id: string): Promise<string> {
  const response = await fetch(`${config.mailApiUrl}/api/v1/message/${id}`);
  if (!response.ok) return '';
  const message = (await response.json()) as { Text?: string; HTML?: string };
  return `${message.Text ?? ''}\n${message.HTML ?? ''}`;
}

/**
 * The raw token from the most recent message sent to an address — an
 * invite, a workspace-registration confirmation, or anything else this
 * application mails a `token=…` link for; the name predates the second use.
 *
 * The address is compared case-insensitively because the backend normalises it
 * before storing or mailing anything — matching exactly would make this helper
 * disagree with the system it is exercising.
 */
export async function inviteTokenFor(
  config: Config, email: string, timeoutMs = 15_000,
): Promise<string> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const ids = await messagesTo(config, email);
    // Newest first in Mailpit, so a re-invite finds its replacement.
    for (const id of ids) {
      const match = TOKEN.exec(await bodyOf(config, id));
      if (match?.[1]) return match[1];
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`no invitation email reached ${email} within ${timeoutMs}ms`);
}

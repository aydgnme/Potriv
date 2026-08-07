import type { Config } from '../config/env.js';
import type { ApiClient } from '../http/client.js';
import { REPLAY_PASSWORD, ROTATED_PASSWORD } from '../config/credentials.js';
import { DEFAULT_PASSWORD, identity, type RunContext } from '../fixtures/context.js';
import { Prober } from './probe.js';

/**
 * The password-reset mail path, verified through Mailpit's REST API.
 *
 * The reset token is read inside this process to complete the flow and is never
 * written to a report — the redaction layer strips it, and nothing here prints it.
 */
export async function runMailScenarios(
  client: ApiClient, prober: Prober, ctx: RunContext, config: Config,
): Promise<void> {
  const email = identity(ctx.runId, 'resetme', 'A');
  const created = await client.post(`/auth/register-employee/${ctx.orgA.inviteToken}`, {
    body: { name: 'QA Reset Target', email, password: DEFAULT_PASSWORD },
  });
  if (!created.ok) {
    prober.record({ id: 'mail.setup', kind: 'mail', description: 'create reset target',
      passed: false, message: `could not create the account: HTTP ${created.status}` });
    return;
  }

  await clearMailbox(config);

  await prober.run({
    id: 'mail.reset.request.known', kind: 'mail', method: 'POST',
    template: '/auth/password-reset/request', url: '/auth/password-reset/request',
    expect: 202, options: { body: { email } },
  });
  await prober.run({
    id: 'mail.reset.request.unknown', kind: 'mail', method: 'POST',
    template: '/auth/password-reset/request', url: '/auth/password-reset/request',
    expect: 202, options: { body: { email: `nobody-${ctx.runId}@potriv.test` } },
  });

  const messages = await fetchMessages(config);
  prober.record({
    id: 'mail.reset.exactly-one-message', kind: 'mail',
    description: 'one message for the real account, none for the unknown one',
    passed: messages.length === 1,
    expected: '1', actual: String(messages.length),
    message: messages.length === 1 ? undefined
      : `expected exactly one captured message, found ${messages.length}`,
  });
  if (messages.length !== 1) return;

  const detail = await fetchMessage(config, String(messages[0]!.ID));
  const body = String(detail.Text ?? '');
  const recipients = (detail.To ?? []).map((t: { Address: string }) => t.Address);

  prober.record({
    id: 'mail.reset.envelope', kind: 'mail',
    description: 'sender and recipient are the configured ones',
    passed: recipients.includes(email) && Boolean(detail.From?.Address),
    expected: email, actual: recipients.join(','),
  });

  const link = /https?:\/\/\S+\/reset-password\?token=\S+/.exec(body);
  prober.record({
    id: 'mail.reset.link-shape', kind: 'mail',
    description: 'reset link uses the configured frontend base URL',
    passed: Boolean(link),
    message: link ? undefined : 'no reset link of the expected shape in the message body',
  });

  const leaks = ['$2a$', '$2b$', 'eyJ', DEFAULT_PASSWORD, ROTATED_PASSWORD, 'refreshToken']
    .filter((needle) => body.includes(needle));
  prober.record({
    id: 'mail.reset.no-secrets', kind: 'mail',
    description: 'message body carries no hash, JWT, password or refresh token',
    passed: leaks.length === 0,
    message: leaks.length ? `message body contained ${leaks.length} forbidden marker(s)` : undefined,
  });

  if (!link) return;
  const token = link[0].split('token=')[1]!;
  const newPassword = ROTATED_PASSWORD;

  await prober.run({
    id: 'mail.reset.confirm.success', kind: 'success', method: 'POST',
    template: '/auth/password-reset/confirm', url: '/auth/password-reset/confirm',
    expect: 204, options: { body: { token, newPassword } },
  });

  const oldLogin = await client.post('/auth/login', { body: { email, password: DEFAULT_PASSWORD } });
  prober.record({
    id: 'mail.reset.old-password-rejected', kind: 'mail',
    description: 'the previous password no longer authenticates',
    passed: oldLogin.status === 400 || oldLogin.status === 401,
    expected: '400|401', actual: String(oldLogin.status),
  });

  const newLogin = await client.post('/auth/login', { body: { email, password: newPassword } });
  prober.record({
    id: 'mail.reset.new-password-works', kind: 'mail',
    description: 'the new password authenticates',
    passed: newLogin.ok, expected: '200', actual: String(newLogin.status),
  });

  const reuse = await client.post('/auth/password-reset/confirm',
    { body: { token, newPassword: REPLAY_PASSWORD } });
  prober.record({
    id: 'mail.reset.token-single-use', kind: 'mail',
    description: 'the reset token cannot be replayed',
    passed: reuse.status >= 400 && reuse.status < 500,
    expected: '4xx', actual: String(reuse.status),
  });
}

type MailpitMessage = { ID: string };

async function clearMailbox(config: Config): Promise<void> {
  await fetch(`${config.mailApiUrl}/api/v1/messages`, { method: 'DELETE' }).catch(() => undefined);
}

async function fetchMessages(config: Config): Promise<MailpitMessage[]> {
  const response = await fetch(`${config.mailApiUrl}/api/v1/messages`);
  const body = (await response.json()) as { messages?: MailpitMessage[] };
  return body.messages ?? [];
}

async function fetchMessage(config: Config, id: string): Promise<any> {
  const response = await fetch(`${config.mailApiUrl}/api/v1/message/${id}`);
  return response.json();
}

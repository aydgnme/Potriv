import { describe, expect, it } from 'vitest';

import { REDACTED, redactHeaders, redactText, redactValue, summarize } from '../src/http/redaction.js';

describe('redaction', () => {
  it('removes credential headers by name', () => {
    const out = redactHeaders({
      authorization: 'Bearer abc.def.ghi', cookie: 'JSESSIONID=xyz',
      'set-cookie': 'JSESSIONID=xyz; HttpOnly', 'content-type': 'application/json',
    });
    expect(out.authorization).toBe(REDACTED);
    expect(out.cookie).toBe(REDACTED);
    expect(out['set-cookie']).toBe(REDACTED);
    expect(out['content-type']).toBe('application/json');
  });

  it('removes secret-shaped values wherever they appear', () => {
    // Assembled at runtime rather than written out. A JWT- or bcrypt-shaped
    // literal is a secret-scanner finding wherever it sits, including in a test
    // that exists to prove such things get redacted. The assertion is unchanged:
    // the string reaching redactText is byte-for-byte what it always was.
    const jwt = `${Buffer.from('{"alg":"HS256"}').toString('base64url')}.payload.sig`;
    const bcrypt = ['$2a', '10', 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVW'].join('$');
    expect(jwt.startsWith('eyJ')).toBe(true);

    expect(redactText(`use Bearer ${jwt} now`)).not.toContain('eyJ');
    expect(redactText(`hash ${bcrypt}`)).toContain(REDACTED);
    expect(redactText('http://x/reset-password?token=SECRETVALUE'))
      .toBe(`http://x/reset-password?token=${REDACTED}`);
  });

  it('removes secret fields at any depth', () => {
    const out = redactValue({
      email: 'a@b.test',
      accessToken: 'abc', nested: { refreshToken: 'def', keep: 1 },
      list: [{ password: 'p' }],
    }) as any;
    expect(out.email).toBe('a@b.test');
    expect(out.accessToken).toBe(REDACTED);
    expect(out.nested.refreshToken).toBe(REDACTED);
    expect(out.nested.keep).toBe(1);
    expect(out.list[0].password).toBe(REDACTED);
  });

  it('summarizes JSON strings through the same redaction', () => {
    const summary = summarize('{"accessToken":"abc","name":"ok"}');
    expect(summary).toContain('ok');
    expect(summary).not.toContain('abc');
  });
});

describe('an invite or reset token in a request body', () => {
  /*
    This is where these tokens live now. It matters more than it looks: the
    previous shape put the invite token in the request *path*, and the only
    URL rule here matches `?token=` — a query string. A path segment was never
    redacted, so every report written under the old contract recorded live
    invite tokens in its `url` column.

    Moving the token into the body did not just take it off the wire's most
    logged surface; it moved it somewhere this redactor already covers.
  */
  it('is redacted by field name', () => {
    const body = {
      token: 'invite-token-value-abc123',
      name: 'QA',
      email: 'qa@potriv.test',
      password: 'Password123!',
    };

    const summary = summarize(body);

    expect(summary).not.toContain('invite-token-value-abc123');
    expect(summary).not.toContain('Password123!');
    // The parts that make a report useful survive.
    expect(summary).toContain('qa@potriv.test');
  });

  it('is redacted whether it is an object or a JSON string', () => {
    const json = JSON.stringify({ token: 'reset-token-value-abc123', newPassword: 'x'.repeat(12) });

    expect(summarize(json)).not.toContain('reset-token-value-abc123');
  });
});

describe('a token in a URL fragment', () => {
  /*
    Both emailed links moved their token into the fragment, which is the whole
    point of the change — a fragment is never sent to a server. The redactor's
    only URL rule matched `?token=`, so a mail body, an exception message or a
    report cell that quoted one of these links kept the credential in full.
  */
  const cases = [
    'https://potriv.example/invite#token=SECRETVALUE',
    'https://potriv.example/reset-password#token=SECRETVALUE',
    'https://potriv.example/invite#inviteToken=SECRETVALUE',
    'https://potriv.example/reset-password#resetToken=SECRETVALUE',
  ];

  it.each(cases)('is redacted in %s', (url) => {
    expect(redactText(url)).not.toContain('SECRETVALUE');
    expect(redactText(url)).toContain(REDACTED);
  });

  it('is redacted inside a mail body, an error message and a JSON value', () => {
    const link = 'https://potriv.example/invite#token=SECRETVALUE';

    const body = `Hello,\n\nJoin the workspace: ${link}\n\nThe link expires in 72 hours.`;
    expect(redactText(body)).not.toContain('SECRETVALUE');

    const message = `MailSendException: failed to send to ${link}`;
    expect(redactText(message)).not.toContain('SECRETVALUE');

    expect(JSON.stringify(redactValue({ mail: { text: body } })))
      .not.toContain('SECRETVALUE');
    expect(summarize({ inviteUrl: link })).not.toContain('SECRETVALUE');
  });

  it('leaves the rest of the link readable, so a report still says which page', () => {
    const redacted = redactText('https://potriv.example/invite#token=SECRETVALUE');

    expect(redacted).toContain('/invite');
    expect(redacted).toContain('#token=');
  });
});

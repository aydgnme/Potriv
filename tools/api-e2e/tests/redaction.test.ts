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

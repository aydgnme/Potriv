/**
 * Central redaction. Every report writer consumes data that has already passed
 * through here — a value must never be scrubbed in Markdown while surviving in
 * JSON.
 */

export const REDACTED = '<redacted>';

/** Header names whose values never appear in any artifact. */
const SECRET_HEADERS = new Set([
  'authorization',
  'cookie',
  'set-cookie',
  'proxy-authorization',
  'x-csrf-token',
]);

/** JSON field names whose values never appear in any artifact. */
const SECRET_FIELDS = [
  'password',
  'newpassword',
  'oldpassword',
  'currentpassword',
  'passwordhash',
  'accesstoken',
  'refreshtoken',
  'token',
  'resettoken',
  'invitetoken',
  'secret',
  'jwt',
  'credential',
  'employeeinviteurl',
];

/** Shapes that are secrets wherever they appear, even inside free text. */
const SECRET_PATTERNS: ReadonlyArray<RegExp> = [
  /\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi,
  /\beyJ[A-Za-z0-9._-]{10,}/g, // JWT
  // Deliberately looser than the exact 53-character bcrypt tail: a truncated or
  // partially-quoted hash is still a hash, and still must not reach a report.
  /\$2[aby]\$\d{2}\$[./A-Za-z0-9]{20,}/g,
  /([?&](token|resetToken|inviteToken)=)[^&\s"']+/gi,
];

export function redactHeaders(
  headers: Readonly<Record<string, string>>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    out[key] = SECRET_HEADERS.has(key.toLowerCase()) ? REDACTED : redactText(value);
  }
  return out;
}

export function redactText(input: string): string {
  let out = input;
  for (const pattern of SECRET_PATTERNS) {
    out = out.replace(pattern, (_match: string, prefix?: string) =>
      prefix ? `${prefix}${REDACTED}` : REDACTED,
    );
  }
  return out;
}

function isSecretField(name: string): boolean {
  const key = name.toLowerCase();
  return SECRET_FIELDS.some((field) => key === field || key.endsWith(field));
}

/** Deep-redacts a parsed JSON value by field name and by value shape. */
export function redactValue(value: unknown, depth = 0): unknown {
  if (depth > 8) return '<truncated>';
  if (typeof value === 'string') return redactText(value);
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => redactValue(v, depth + 1));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
      out[key] = isSecretField(key) ? REDACTED : redactValue(inner, depth + 1);
    }
    return out;
  }
  return value;
}

/** A short, already-redacted summary suitable for a report cell. */
export function summarize(body: unknown, maxLength = 400): string {
  if (body === undefined || body === null || body === '') return '';
  let text: string;
  if (typeof body === 'string') {
    try {
      text = JSON.stringify(redactValue(JSON.parse(body)));
    } catch {
      text = redactText(body);
    }
  } else {
    text = JSON.stringify(redactValue(body));
  }
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
}

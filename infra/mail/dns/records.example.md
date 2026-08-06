# DNS, TLS and deliverability records

**Nothing in this file has been published.** These are templates. Every value in
angle brackets must come from the running server or the hosting provider — never
from this document.

Variables used below come from `.env.mail`:

```text
MAIL_HOSTNAME   default mail.aydgn.me     public hostname of the mail server
MAIL_DOMAIN     default potriv.aydgn.me   domain Potriv sends from
MAIL_FROM       default noreply@potriv.aydgn.me
```

---

## 1. A / AAAA — the mail server itself

```dns
mail.aydgn.me.        300  IN  A     <PUBLIC_IPV4>
mail.aydgn.me.        300  IN  AAAA  <PUBLIC_IPV6>     ; only if the host really has one
```

Publish AAAA **only** if outbound IPv6 mail actually works and has its own PTR;
a broken IPv6 path is a common, silent deliverability failure.

## 2. MX — where mail for the domain goes

```dns
potriv.aydgn.me.      300  IN  MX    10 mail.aydgn.me.
```

Needed only if you intend to **receive** mail (bounces, `postmaster@`,
`abuse@`, DMARC reports). Sending does not require an MX on the sending domain.

## 3. PTR / reverse DNS — **not** a DNS-zone record

```text
<PUBLIC_IPV4>  →  mail.aydgn.me
```

Set at the **VPS/cloud provider**, not at the registrar. Most large receivers
reject or heavily penalise mail from an IP with no PTR, or whose PTR does not
resolve forward to the same address (FCrDNS).

Verify:

```bash
dig -x <PUBLIC_IPV4> +short          # must print mail.aydgn.me.
dig +short A mail.aydgn.me           # must print <PUBLIC_IPV4>
```

## 4. SPF — who may send as the domain

For the topology this repository builds (one self-hosted server, direct
delivery):

```dns
potriv.aydgn.me.      300  IN  TXT   "v=spf1 a:mail.aydgn.me -all"
```

- `a:mail.aydgn.me` authorises the host's own address.
- `-all` is a hard fail. Start with `~all` (softfail) for the first days if you
  are unsure, then tighten.
- If you later add a relay (SES, Postmark, …), add its `include:` **and** remove
  what no longer sends. Never exceed 10 DNS lookups.
- One SPF record per domain. Two records is a misconfiguration, not a merge.

## 5. DKIM — signature published by the server

The selector and public key **must be read from the running server** after it
generates the key. Do not invent them and do not reuse another deployment's.

```dns
<SELECTOR>._domainkey.potriv.aydgn.me.  300  IN  TXT  "v=DKIM1; k=rsa; p=<PUBLIC_KEY>"
```

Verify what you published matches what the server signs with:

```bash
dig +short TXT <SELECTOR>._domainkey.potriv.aydgn.me
```

The **private** key never leaves the server's data volume and is never committed.
See the rotation runbook in `infra/mail/README.md`.

## 6. DMARC — reporting, then enforcement

Roll out in stages. Skipping to `reject` before reading reports is how you
discover a broken SPF alignment by losing real mail.

```dns
; Stage 1 — monitor only. Publish this first and leave it for 1–2 weeks.
_dmarc.potriv.aydgn.me.  300  IN  TXT  "v=DMARC1; p=none; rua=mailto:dmarc@potriv.aydgn.me; fo=1"

; Stage 2 — once reports show SPF *and* DKIM aligning for real traffic.
_dmarc.potriv.aydgn.me.  300  IN  TXT  "v=DMARC1; p=quarantine; pct=25; rua=mailto:dmarc@potriv.aydgn.me"

; Stage 3 — steady state.
_dmarc.potriv.aydgn.me.  300  IN  TXT  "v=DMARC1; p=reject; rua=mailto:dmarc@potriv.aydgn.me"
```

`dmarc@potriv.aydgn.me` must exist and be monitored, which means inbound mail
must work — otherwise publish an address you actually read.

## 7. TLS

Two supported shapes; pick one and document which is in use:

1. **Stalwart terminates ACME itself.** Publish port 443 and let it obtain and
   renew certificates. HTTP-01/TLS-ALPN-01 require the public hostname to
   resolve to this host and the port to be reachable.
2. **A reverse proxy terminates TLS** and Stalwart runs behind it. Only viable
   for the HTTP/JMAP surface — SMTP STARTTLS on 25/587 still needs a certificate
   on the mail server itself.

If neither port 80 nor 443 can be exposed, use **DNS-01**, which needs an API
token for the DNS provider. That token is a secret: it belongs in the host's
secret store, never in this repository.

Verify the certificate actually served on the submission port:

```bash
openssl s_client -starttls smtp -connect mail.aydgn.me:587 -servername mail.aydgn.me </dev/null 2>/dev/null \
  | openssl x509 -noout -subject -dates
```

## 8. MTA-STS and TLS-RPT — optional

Only publish these when the policy file is genuinely hosted at
`https://mta-sts.potriv.aydgn.me/.well-known/mta-sts.txt` and served over a valid
certificate. A published `_mta-sts` record with no reachable policy is worse than
none.

## 9. TTL strategy

Use a **short TTL (300s)** while rolling out or rotating, so a mistake is
correctable in minutes. Raise to 3600s once the records are stable. Lower the TTL
*before* a planned DKIM rotation or IP change, not after.

## 10. Verification command set

```bash
dig +short A    mail.aydgn.me
dig +short MX   potriv.aydgn.me
dig +short TXT  potriv.aydgn.me                              # SPF
dig +short TXT  _dmarc.potriv.aydgn.me                       # DMARC
dig +short TXT  <SELECTOR>._domainkey.potriv.aydgn.me        # DKIM
dig -x <PUBLIC_IPV4> +short                                  # PTR
openssl s_client -starttls smtp -connect mail.aydgn.me:587 -servername mail.aydgn.me
```

`./infra/mail/scripts/mail-smoke.sh --dns` runs the record checks and exits
non-zero on the first missing one.

---

## Status in this repository

| Record | Status |
| --- | --- |
| A / AAAA | **NOT RUN** — no public IP available in this environment |
| MX | **NOT RUN** |
| PTR | **BLOCKED BY PTR** — provider-managed, no host provisioned |
| SPF | **NOT RUN** |
| DKIM | **NOT RUN** — no key generated, so no selector or public key exists to publish |
| DMARC | **NOT RUN** |
| TLS certificate | **NOT RUN** |
| Outbound port 25 | **BLOCKED BY PORT 25** — not verified from any host |

No record above has been published, and no value in this file was taken from a
live server.

// =============================================================================
// Mailer (email transaccional)  [SPEC §C-9.7 — decisión D-3: Resend]
// Interfaz desacoplada: Resend si hay RESEND_API_KEY; si no, no-op + log (dev/CI).
// =============================================================================

import { logger } from '../observability/logger';

export interface Mailer {
  send(to: string, subject: string, html: string): Promise<boolean>;
}

class ResendMailer implements Mailer {
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
  ) {}

  async send(to: string, subject: string, html: string): Promise<boolean> {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${this.apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: this.from, to, subject, html }),
    });
    if (!res.ok) {
      logger.warn({ event: 'email.send_failed', status: res.status });
      return false;
    }
    return true;
  }
}

class NoopMailer implements Mailer {
  async send(to: string, subject: string): Promise<boolean> {
    logger.info({ event: 'email.noop', route: 'mailer', status: 200 });
    void to;
    void subject;
    return true;
  }
}

export function getMailer(): Mailer {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM ?? 'FlowDay <ops@flowday.app>';
  if (apiKey) return new ResendMailer(apiKey, from);
  return new NoopMailer();
}

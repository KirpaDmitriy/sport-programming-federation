import { randomUUID } from 'node:crypto';

const realMail = process.env.FSP_AUTH_MODE === 'resend';
const domain = process.env.FSP_TEST_EMAIL_DOMAIN ?? 'auth.nddev.link';

export function testEmail(actor: string): string {
  return `fsp-ci-${actor}-${randomUUID()}@${realMail ? domain : 'example.com'}`;
}

async function mailbox(path: string): Promise<unknown> {
  const key = process.env.FSP_RESEND_ACCEPTANCE_KEY;
  if (!key) throw new Error('FSP_RESEND_ACCEPTANCE_KEY is required for real email acceptance');
  const response = await fetch(`https://api.resend.com/emails/receiving${path}`, {
    headers: { Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (response.status === 429) return null;
  if (!response.ok) throw new Error(`Acceptance mailbox returned HTTP ${response.status}`);
  return response.json();
}

export async function verificationCode(email: string): Promise<string> {
  if (!realMail) return process.env.FSP_DEMO_CODE ?? '123456';
  if (!email.startsWith('fsp-ci-') || !email.endsWith(`@${domain}`)) {
    throw new Error('Acceptance tests may only read their dedicated mailbox addresses');
  }
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    const list = (await mailbox('?limit=100')) as { data?: Array<{ id: string; to: string[] }> } | null;
    const found = list?.data?.find((entry) => entry.to.includes(email));
    if (found) {
      const mail = (await mailbox(`/${encodeURIComponent(found.id)}`)) as {
        from?: string;
        text?: string;
        authentication?: { dkim?: string; dmarc?: string };
      } | null;
      if (mail) {
        if (!mail.from?.includes('login@auth.nddev.link')) throw new Error('Unexpected verification sender');
        if (mail.authentication?.dkim !== 'pass' || mail.authentication?.dmarc !== 'pass') {
          throw new Error('Verification email failed DKIM or DMARC');
        }
        const code = mail.text?.match(/Ваш код входа: (\d{6})/)?.[1];
        if (!code) throw new Error('Received verification email has no valid code');
        return code;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 3_000));
  }
  throw new Error('Real verification email did not arrive within two minutes');
}

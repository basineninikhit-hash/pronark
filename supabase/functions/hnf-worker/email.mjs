// Resend's test sender is restricted to the account's verified test recipient.
// Keep this allowlist until an owner-controlled domain is verified.
export const SANDBOX_FROM = 'onboarding@resend.dev';
export const SANDBOX_RECIPIENT = 'basineni.nikhit@gmail.com';

export async function sendSandboxEmail({ apiKey, to, subject, html, idempotencyKey, fetcher = fetch }) {
  if (!apiKey) throw new Error('RESEND_API_KEY is not configured');
  if (typeof to !== 'string' || to.trim().toLowerCase() !== SANDBOX_RECIPIENT) {
    throw new Error('Resend sandbox can send only to the verified test recipient');
  }
  if (!subject?.trim() || !html?.trim()) throw new Error('Email subject and content are required');

  const response = await fetcher('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
    },
    body: JSON.stringify({
      from: SANDBOX_FROM,
      to: [SANDBOX_RECIPIENT],
      subject,
      html,
    }),
  });
  if (!response.ok) throw new Error(`Resend rejected the email (${response.status})`);
  const result = await response.json();
  if (!result?.id) throw new Error('Resend returned no message ID');
  return result.id;
}

import { Resend } from 'resend';

export interface EmailNotificationItem {
  title: string;
  body?: string | null;
  href?: string;
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function renderNotificationDigestHtml(items: EmailNotificationItem[]) {
  const list = items
    .map((item) => {
      const title = escapeHtml(item.title);
      const body = item.body ? `<p>${escapeHtml(item.body)}</p>` : '';
      const link = item.href
        ? `<p><a href="${escapeHtml(item.href)}">Open in Hakbang</a></p>`
        : '';
      return `<li><strong>${title}</strong>${body}${link}</li>`;
    })
    .join('');

  return `
    <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #111827;">
      <h1 style="font-size: 20px;">Hakbang daily tracker digest</h1>
      <p>Here are the tracker items that need your attention.</p>
      <ul>${list}</ul>
    </div>
  `;
}

export async function sendNotificationDigestEmail({
  to,
  items,
  subject = 'Hakbang daily tracker digest',
}: {
  to: string;
  items: EmailNotificationItem[];
  subject?: string;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) {
    return { skipped: true, reason: 'missing_resend_env' as const };
  }

  const resend = new Resend(apiKey);
  const result = await resend.emails.send({
    from,
    to,
    subject,
    html: renderNotificationDigestHtml(items),
  });

  return { skipped: false, result };
}

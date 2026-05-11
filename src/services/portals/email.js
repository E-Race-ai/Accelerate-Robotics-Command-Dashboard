/**
 * Customer Portals — transactional email
 *
 * Uses Resend (already in package.json + .env.example).
 * Wraps templates so the route handlers stay clean.
 */

const { Resend } = require('resend');

let _resend;
function getClient() {
  if (_resend) return _resend;
  if (!process.env.RESEND_API_KEY) {
    // In dev without an API key, log emails to console instead of failing.
    return null;
  }
  _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
}

const FROM_ADDRESS = process.env.PORTAL_EMAIL_FROM || 'Accelerate Robotics <portals@acceleraterobotics.ai>';

async function sendMagicLinkEmail({ toEmail, toName, portal, link }) {
  const subject = `Sign in to your ${portal.customer_name} portal`;
  const greeting = toName ? `Hi ${toName.split(' ')[0]},` : 'Hi,';

  const html = baseTemplate({
    title: subject,
    primaryColor: portal.theme.primary_color,
    body: `
      <p style="margin: 0 0 16px;">${escapeHtml(greeting)}</p>
      <p style="margin: 0 0 16px;">
        Click the button below to sign in to the
        <strong>${escapeHtml(portal.customer_name)}</strong> portal,
        your shared workspace with the Accelerate Robotics team.
      </p>
      ${button({ href: link, label: 'Sign in to portal', color: portal.theme.primary_color })}
      <p style="margin: 28px 0 8px; font-size: 13px; color: #6B7280;">
        This link expires in 15 minutes and can be used only once.
      </p>
      <p style="margin: 0; font-size: 13px; color: #6B7280;">
        If you didn't request this, you can safely ignore this email.
      </p>
    `,
    customerName: portal.customer_name,
  });

  const text = [
    greeting,
    '',
    `Click the link below to sign in to the ${portal.customer_name} portal:`,
    link,
    '',
    'This link expires in 15 minutes and can be used only once.',
    "If you didn't request this, you can ignore this email.",
  ].join('\n');

  return await actuallySend({ to: toEmail, subject, html, text });
}

async function sendPortalActivityNotification({ toEmail, toName, portal, summary }) {
  // Sent to the internal owner when something interesting happens.
  const subject = `Activity on ${portal.customer_name} portal`;
  const html = baseTemplate({
    title: subject,
    primaryColor: portal.theme.primary_color,
    body: `
      <p style="margin: 0 0 16px;">Hi ${escapeHtml((toName || '').split(' ')[0] || 'there')},</p>
      <p style="margin: 0 0 16px;">Recent activity on the <strong>${escapeHtml(portal.customer_name)}</strong> portal:</p>
      <ul style="margin: 0 0 16px; padding-left: 18px; color: #1A1A1A;">
        ${summary.map(line => `<li style="margin-bottom: 6px;">${escapeHtml(line)}</li>`).join('')}
      </ul>
      ${button({
        href: `${process.env.PORTAL_BASE_URL || 'https://acceleraterobotics.ai'}/admin/portals.html#${portal.id}`,
        label: 'Open portal',
        color: portal.theme.primary_color,
      })}
    `,
    customerName: portal.customer_name,
  });
  return await actuallySend({ to: toEmail, subject, html });
}

async function actuallySend({ to, subject, html, text }) {
  const client = getClient();
  if (!client) {
    // Dev fallback — log to console so devs can copy the link in local dev.
    console.log('\n[portal-email DEV] (no RESEND_API_KEY set, would send):');
    console.log('  to:', to);
    console.log('  subject:', subject);
    if (text) console.log('  text:\n', text);
    console.log('');
    return { id: 'dev-noop', to };
  }
  try {
    const result = await client.emails.send({
      from: FROM_ADDRESS,
      to,
      subject,
      html,
      text,
    });
    return result;
  } catch (err) {
    console.error('[portal-email] send failed:', err);
    throw err;
  }
}

// ----------------- HTML helpers -----------------

function baseTemplate({ title, primaryColor, body, customerName }) {
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>${escapeHtml(title)}</title></head>
<body style="margin: 0; background: #F5F7FA; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1A1A1A;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background: #F5F7FA; padding: 32px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="max-width: 100%; background: #fff; border-radius: 10px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
        <tr><td style="background: ${escapeHtml(primaryColor || '#1F4E79')}; padding: 18px 28px; color: #fff;">
          <div style="font-size: 12px; opacity: 0.85; letter-spacing: 0.04em;">${escapeHtml((customerName || '').toUpperCase())} · ACCELERATE ROBOTICS</div>
        </td></tr>
        <tr><td style="padding: 32px 28px; line-height: 1.6; color: #1A1A1A;">${body}</td></tr>
        <tr><td style="padding: 18px 28px; border-top: 1px solid #E5E7EB; font-size: 11px; color: #9CA3AF; text-align: center;">
          Powered by Accelerate Robotics · One Brain. Many Bots.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function button({ href, label, color }) {
  return `
    <table cellpadding="0" cellspacing="0" style="margin: 18px 0;"><tr>
      <td style="background: ${escapeHtml(color || '#1F4E79')}; border-radius: 6px;">
        <a href="${escapeHtmlAttr(href)}" style="display: inline-block; padding: 12px 22px; color: #fff; font-weight: 600; text-decoration: none; font-size: 14px;">${escapeHtml(label)}</a>
      </td>
    </tr></table>
  `;
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}
function escapeHtmlAttr(s) { return escapeHtml(s); }

module.exports = {
  sendMagicLinkEmail,
  sendPortalActivityNotification,
};

const { Resend } = require('resend');
const db = require('../db/database');

const resend = new Resend(process.env.RESEND_API_KEY);
const EMAIL_FROM = process.env.EMAIL_FROM || 'notifications@acceleraterobotics.ai';

/**
 * Sends an inquiry notification to all active recipients.
 * Fails silently (logs error) so the inquiry POST still succeeds even if email is misconfigured.
 */
async function notifyNewInquiry(inquiry) {
  const recipients = db.prepare(
    'SELECT email FROM notification_recipients WHERE active = 1'
  ).all();

  if (recipients.length === 0) {
    console.log('[email] No active recipients — skipping notification');
    return;
  }

  const to = recipients.map(r => r.email);

  try {
    await resend.emails.send({
      from: EMAIL_FROM,
      to,
      subject: `New Investment Inquiry from ${inquiry.name}`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #0055ff;">New Investment Inquiry</h2>
          <table style="width: 100%; border-collapse: collapse;">
            <tr><td style="padding: 8px 0; color: #666; width: 100px;">Name</td><td style="padding: 8px 0; font-weight: 600;">${escapeHtml(inquiry.name)}</td></tr>
            <tr><td style="padding: 8px 0; color: #666;">Email</td><td style="padding: 8px 0;"><a href="mailto:${escapeHtml(inquiry.email)}">${escapeHtml(inquiry.email)}</a></td></tr>
            ${inquiry.company ? `<tr><td style="padding: 8px 0; color: #666;">Company</td><td style="padding: 8px 0;">${escapeHtml(inquiry.company)}</td></tr>` : ''}
            ${inquiry.phone ? `<tr><td style="padding: 8px 0; color: #666;">Phone</td><td style="padding: 8px 0;">${escapeHtml(inquiry.phone)}</td></tr>` : ''}
          </table>
          <div style="margin-top: 16px; padding: 16px; background: #f7f8fc; border-radius: 8px;">
            <p style="margin: 0; color: #333; white-space: pre-wrap;">${escapeHtml(inquiry.message)}</p>
          </div>
          <p style="margin-top: 24px; color: #999; font-size: 12px;">
            Sent from the Accelerate Robotics inquiry form
          </p>
        </div>
      `,
    });
    console.log(`[email] Notification sent to ${to.length} recipient(s)`);
  } catch (err) {
    console.error('[email] Failed to send notification:', err.message);
  }
}

/** Prevent XSS in email HTML */
function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

module.exports = { notifyNewInquiry };

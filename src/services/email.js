const { Resend } = require('resend');
const db = require('../db/database');

// WHY: The Resend SDK throws if RESEND_API_KEY is missing, which crashes the
// server on boot during local development. Lazily construct the client so the
// app still runs without email configured — callers just get a logged warning
// and the send becomes a no-op.
let _resend = null;
function getResend() {
  if (_resend) return _resend;
  if (!process.env.RESEND_API_KEY) return null;
  _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
}
const EMAIL_FROM = process.env.EMAIL_FROM || 'notifications@acceleraterobotics.ai';

/**
 * Sends an inquiry notification to all active recipients.
 * Fails silently (logs error) so the inquiry POST still succeeds even if email is misconfigured.
 */
async function notifyNewInquiry(inquiry) {
  const recipients = await db.all('SELECT email FROM notification_recipients WHERE active = 1');

  if (recipients.length === 0) {
    console.log('[email] No active recipients — skipping notification');
    return;
  }

  const to = recipients.map(r => r.email);

  const resend = getResend();
  if (!resend) {
    console.warn('[email] RESEND_API_KEY not set — skipping inquiry notification');
    return;
  }

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

/**
 * Sends an invite email to a newly-invited team member.
 * Fails silently (logs) so the invite POST succeeds even if Resend is misconfigured.
 */
async function sendInviteEmail({ to, name, inviterEmail, role, inviteUrl }) {
  const resend = getResend();
  if (!resend) {
    console.warn('[email] RESEND_API_KEY not set — skipping invite email');
    return;
  }
  const roleLabel = {
    admin: 'Admin',
    module_owner: 'Module Owner',
    viewer: 'Viewer',
  }[role] || role;

  try {
    await resend.emails.send({
      from: EMAIL_FROM,
      to: [to],
      subject: `You're invited to Accelerate Robotics`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; padding: 32px;">
          <h2 style="color: #0055ff; margin: 0 0 16px;">Welcome to Accelerate Robotics</h2>
          <p>${escapeHtml(inviterEmail)} has invited you to the Command Center as a <strong>${escapeHtml(roleLabel)}</strong>.</p>
          <p style="margin: 24px 0;">
            <a href="${inviteUrl}" style="display: inline-block; padding: 12px 24px; background: #0055ff; color: #fff; text-decoration: none; border-radius: 8px; font-weight: 600;">Accept Invite &rarr;</a>
          </p>
          <p style="color: #666; font-size: 13px;">This link expires in 24 hours. If it expires, ask ${escapeHtml(inviterEmail)} to re-send.</p>
          <p style="color: #999; font-size: 12px; margin-top: 32px;">If you weren't expecting this invite, you can safely ignore it.</p>
        </div>
      `,
    });
    console.log(`[email] Invite sent to ${to}`);
  } catch (err) {
    console.error('[email] Invite email failed:', err.message);
    throw err;
  }
}

module.exports = { notifyNewInquiry, sendInviteEmail };

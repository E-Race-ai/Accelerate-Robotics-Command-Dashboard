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

/**
 * Sends an invite email to a new user with a link to set their password.
 * WHY: Fire-and-forget like notifyNewInquiry — log errors, don't block the response.
 */
async function sendInviteEmail({ to, name, inviterName, role, token }) {
  const baseUrl = process.env.RAILWAY_PUBLIC_DOMAIN
    ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
    : `http://localhost:${process.env.PORT || 3000}`;
  const inviteUrl = `${baseUrl}/accept-invite?token=${token}`;

  try {
    await resend.emails.send({
      from: EMAIL_FROM,
      to,
      subject: "You've been invited to Accelerate Robotics",
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #0055ff;">You're Invited</h2>
          <p>Hi ${escapeHtml(name)},</p>
          <p>${escapeHtml(inviterName)} has invited you to join the Accelerate Robotics command dashboard as <strong>${escapeHtml(role)}</strong>.</p>
          <p>Click below to set your password and get started:</p>
          <div style="margin: 24px 0;">
            <a href="${inviteUrl}" style="display: inline-block; padding: 12px 28px; background: #0055ff; color: #fff; text-decoration: none; border-radius: 8px; font-weight: 600;">Accept Invite</a>
          </div>
          <p style="color: #999; font-size: 13px;">This link expires in 24 hours.</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;">
          <p style="color: #999; font-size: 12px;">Accelerate Robotics — One Brain, Many Bots</p>
        </div>
      `,
    });
    console.log('[email] Invite sent to ' + to);
  } catch (err) {
    console.error('[email] Failed to send invite to ' + to + ':', err.message);
  }
}

/**
 * Sends a password reset email with a secure link.
 * WHY: Fire-and-forget — same pattern as invite and inquiry notifications.
 */
async function sendPasswordResetEmail({ to, name, token }) {
  const baseUrl = process.env.RAILWAY_PUBLIC_DOMAIN
    ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
    : `http://localhost:${process.env.PORT || 3000}`;
  const resetUrl = `${baseUrl}/reset-password?token=${token}`;

  try {
    await resend.emails.send({
      from: EMAIL_FROM,
      to,
      subject: 'Reset Your Password — Accelerate Robotics',
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #0055ff;">Password Reset</h2>
          <p>Hi ${escapeHtml(name || 'there')},</p>
          <p>We received a request to reset your password. Click below to set a new one:</p>
          <div style="margin: 24px 0;">
            <a href="${resetUrl}" style="display: inline-block; padding: 12px 28px; background: #0055ff; color: #fff; text-decoration: none; border-radius: 8px; font-weight: 600;">Reset Password</a>
          </div>
          <p style="color: #999; font-size: 13px;">This link expires in 1 hour. If you didn't request this, you can safely ignore this email.</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;">
          <p style="color: #999; font-size: 12px;">Accelerate Robotics — One Brain, Many Bots</p>
        </div>
      `,
    });
    console.log('[email] Password reset sent to ' + to);
  } catch (err) {
    console.error('[email] Failed to send password reset to ' + to + ':', err.message);
  }
}

module.exports = { notifyNewInquiry, sendInviteEmail, sendPasswordResetEmail };

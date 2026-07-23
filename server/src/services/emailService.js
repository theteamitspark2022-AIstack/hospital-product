const nodemailer = require("nodemailer");

function getTransporter() {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) return null;
  return nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass },
  });
}

async function sendEmail({ to, subject, html }) {
  const transporter = getTransporter();
  if (!transporter) {
    console.warn("[email] GMAIL_USER or GMAIL_APP_PASSWORD not set — email not sent");
    return false;
  }
  try {
    await transporter.sendMail({
      from: `"AIVoiceConnect" <${process.env.GMAIL_USER}>`,
      to, subject, html,
    });
    console.log(`[email] Sent "${subject}" to ${to}`);
    return true;
  } catch (err) {
    console.error("[email] Failed to send:", err.message);
    return false;
  }
}

async function sendWelcomeEmail(email, businessName) {
  return sendEmail({
    to: email,
    subject: "Welcome to AIVoiceConnect",
    html: `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #E2E8F0;">
        <div style="background:linear-gradient(135deg,#020817,#1368D8);padding:32px 36px;">
          <h1 style="color:#fff;font-size:22px;margin:0;font-weight:800;">AIVoiceConnect</h1>
          <p style="color:rgba(255,255,255,0.65);font-size:13px;margin:6px 0 0;">Powered by TheTeam ITSpark</p>
        </div>
        <div style="padding:32px 36px;">
          <h2 style="color:#020817;font-size:18px;margin:0 0 12px;">Welcome, ${businessName}! 👋</h2>
          <p style="color:#64748B;font-size:14px;line-height:1.65;margin:0 0 20px;">Your AIVoiceConnect account has been created. You can now log in and start managing missed calls, tickets, and appointments from your dashboard.</p>
          <a href="${process.env.APP_URL || "https://hospital-product.onrender.com"}/dashboard"
             style="display:inline-block;background:linear-gradient(135deg,#3182ED,#1368D8);color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:700;font-size:14px;">
            Go to Dashboard →
          </a>
          <p style="color:#94A3B8;font-size:12px;margin:28px 0 0;padding-top:20px;border-top:1px solid #F1F5F9;">
            If you didn't create this account, please ignore this email.
          </p>
        </div>
      </div>`,
  });
}

async function sendPasswordResetEmail(email, resetUrl) {
  return sendEmail({
    to: email,
    subject: "Reset your AIVoiceConnect password",
    html: `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #E2E8F0;">
        <div style="background:linear-gradient(135deg,#020817,#1368D8);padding:32px 36px;">
          <h1 style="color:#fff;font-size:22px;margin:0;font-weight:800;">AIVoiceConnect</h1>
          <p style="color:rgba(255,255,255,0.65);font-size:13px;margin:6px 0 0;">Password Reset Request</p>
        </div>
        <div style="padding:32px 36px;">
          <h2 style="color:#020817;font-size:18px;margin:0 0 12px;">Reset your password</h2>
          <p style="color:#64748B;font-size:14px;line-height:1.65;margin:0 0 20px;">We received a request to reset your password. Click the button below to set a new password. This link expires in <strong>1 hour</strong>.</p>
          <a href="${resetUrl}"
             style="display:inline-block;background:linear-gradient(135deg,#3182ED,#1368D8);color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:700;font-size:14px;">
            Reset Password →
          </a>
          <p style="color:#64748B;font-size:13px;margin:20px 0 0;">If the button doesn't work, copy this link:<br><span style="color:#3182ED;word-break:break-all;">${resetUrl}</span></p>
          <p style="color:#94A3B8;font-size:12px;margin:28px 0 0;padding-top:20px;border-top:1px solid #F1F5F9;">
            If you didn't request a password reset, you can safely ignore this email. Your password will not change.
          </p>
        </div>
      </div>`,
  });
}

module.exports = { sendWelcomeEmail, sendPasswordResetEmail };

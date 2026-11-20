/**
 * Envoi Brevo REST (meme compte boutique, suzinabot@gmail.com).
 */
const DEFAULT_SENDER_EMAIL = 'suzinabot@gmail.com';
const DEFAULT_SENDER_NAME = 'Boxing Trophy';

function readApiKey() {
  return String(process.env.BREVO_API_KEY || '')
    .trim()
    .replace(/^["']|["']$/g, '');
}

function apiKeyConfigured() {
  return readApiKey().startsWith('xkeysib-');
}

function senderEmail() {
  return process.env.BREVO_SENDER_EMAIL || DEFAULT_SENDER_EMAIL;
}

function senderName() {
  return process.env.BREVO_SENDER_NAME || DEFAULT_SENDER_NAME;
}

function defaultReplyTo() {
  return process.env.BREVO_REPLY_TO || process.env.MAIL_REPLY_TO || 'boxingcenter31@gmail.com';
}

async function sendEmailViaBrevo({ to, subject, html, text, replyTo, fromName, fromEmail }) {
  if (!to) throw new Error('Destinataire email manquant');
  if (!apiKeyConfigured()) return null;

  const body = {
    sender: {
      name: fromName || senderName(),
      email: fromEmail || senderEmail()
    },
    to: [{ email: to }],
    replyTo: { email: replyTo || defaultReplyTo(), name: senderName() },
    subject: subject || 'Boxing Trophy',
    htmlContent: html || undefined,
    textContent: text || undefined
  };

  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': readApiKey(),
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify(body)
  });

  const raw = await res.text();
  let data = {};
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    data = { message: raw.slice(0, 200) };
  }
  if (!res.ok) {
    throw new Error(data.message || data.error || 'Brevo API HTTP ' + res.status);
  }
  return { sent: true, messageId: data.messageId, via: 'brevo-api', sender: senderEmail() };
}

function isConfigured() {
  return apiKeyConfigured();
}

module.exports = {
  DEFAULT_SENDER_EMAIL,
  DEFAULT_SENDER_NAME,
  senderEmail,
  senderName,
  defaultReplyTo,
  apiKeyConfigured,
  isConfigured,
  sendEmailViaBrevo
};

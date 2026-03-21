import nodemailer from 'nodemailer';
import { logger } from './logger';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT ?? 587),
  secure: false, // STARTTLS
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const FROM = process.env.SMTP_FROM ?? 'BetIntel <noreply@betintel.app>';

/** Sends an email verification link. Token is the raw (un-hashed) token. */
export async function sendVerificationEmail(email: string, rawToken: string): Promise<void> {
  const appUrl = process.env.APP_URL ?? 'https://betintel.app';
  const link = `${appUrl}/verify-email?token=${encodeURIComponent(rawToken)}`;

  try {
    await transporter.sendMail({
      from: FROM,
      to: email,
      subject: 'Verifica o teu email — BetIntel',
      html: `
        <p>Olá,</p>
        <p>Clica no link abaixo para verificar o teu email. O link expira em 24 horas.</p>
        <p><a href="${link}" style="font-weight:bold">Verificar email</a></p>
        <p>Se não criaste uma conta no BetIntel, ignora este email.</p>
      `,
      text: `Verifica o teu email: ${link}\n\nO link expira em 24 horas.`,
    });
  } catch (err) {
    logger.error('Failed to send verification email', {
      // Log only domain, not full address, in production
      domain: email.split('@')[1],
    });
    throw err;
  }
}

/** Sends a password-reset deep link email. Link expires in 1 hour. */
export async function sendPasswordResetEmail(email: string, rawToken: string): Promise<void> {
  // betintel:// deep link opens the app directly on iOS/Android
  const link = `betintel://reset-password?token=${encodeURIComponent(rawToken)}`;
  // Fallback web link for email clients that block custom scheme links
  const webFallback = `${process.env.APP_URL ?? 'https://betintel.app'}/reset-password?token=${encodeURIComponent(rawToken)}`;

  try {
    await transporter.sendMail({
      from: FROM,
      to: email,
      subject: 'Redefinir password — BetIntel',
      html: `
        <p>Olá,</p>
        <p>Clica no link abaixo para redefinir a tua password. O link expira em <strong>1 hora</strong>.</p>
        <p><a href="${webFallback}" style="font-weight:bold">Redefinir password</a></p>
        <p>Se não pediste a redefinição da password, ignora este email — a tua conta está segura.</p>
      `,
      text: `Redefine a tua password: ${link}\n\nO link expira em 1 hora.`,
    });
  } catch (err) {
    logger.error('Failed to send password reset email', {
      domain: email.split('@')[1],
    });
    throw err;
  }
}

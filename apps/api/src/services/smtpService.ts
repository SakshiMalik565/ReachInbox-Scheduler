import nodemailer, { Transporter } from 'nodemailer';
import { config } from '../config/env';
import { decrypt } from '../utils/crypto';
import { logger } from '../utils/logger';

export interface SendMailParams {
  fromEmail: string;
  fromName: string;
  toEmail: string;
  subject: string;
  body: string;
  senderCustomConfig?: {
    smtpHost?: string | null;
    smtpPort?: number | null;
    smtpSecure?: boolean | null;
    etherealUser?: string | null;
    etherealPassEncrypted?: string | null;
  };
}

export interface SendMailResult {
  messageId: string;
  previewUrl: string | null;
}

export class SmtpService {
  private static defaultTransporter: Transporter | null = null;
  private static cachedTestAccount: nodemailer.TestAccount | null = null;

  /**
   * Initializes or returns the default Ethereal transporter.
   */
  public static async getDefaultTransporter(): Promise<Transporter> {
    if (this.defaultTransporter) {
      return this.defaultTransporter;
    }

    let user = config.ETHEREAL_SMTP_USER;
    let pass = config.ETHEREAL_SMTP_PASS;

    // If no credentials supplied in .env, automatically provision an Ethereal test account
    if (!user || !pass) {
      if (!this.cachedTestAccount) {
        logger.info('No Ethereal credentials provided in .env; automatically creating an on-demand Ethereal test account...');
        this.cachedTestAccount = await nodemailer.createTestAccount();
        logger.info(
          {
            user: this.cachedTestAccount.user,
            webUrl: 'https://ethereal.email/messages'
          },
          'Created on-demand Ethereal test account'
        );
      }
      user = this.cachedTestAccount.user;
      pass = this.cachedTestAccount.pass;
    }

    this.defaultTransporter = nodemailer.createTransport({
      host: config.ETHEREAL_SMTP_HOST,
      port: config.ETHEREAL_SMTP_PORT,
      secure: config.ETHEREAL_SMTP_PORT === 465,
      auth: {
        user,
        pass
      }
    });

    return this.defaultTransporter;
  }

  /**
   * Builds a transporter for a specific sender if custom credentials are provided,
   * otherwise falls back to the default Ethereal transporter.
   */
  public static async getTransporterForSender(
    customConfig?: SendMailParams['senderCustomConfig']
  ): Promise<Transporter> {
    if (
      customConfig?.etherealUser &&
      customConfig?.etherealPassEncrypted
    ) {
      const pass = decrypt(customConfig.etherealPassEncrypted);
      return nodemailer.createTransport({
        host: customConfig.smtpHost || config.ETHEREAL_SMTP_HOST,
        port: customConfig.smtpPort || config.ETHEREAL_SMTP_PORT,
        secure: customConfig.smtpSecure ?? false,
        auth: {
          user: customConfig.etherealUser,
          pass
        }
      });
    }

    return this.getDefaultTransporter();
  }

  /**
   * Sends an email via Nodemailer and returns messageId and Ethereal preview URL.
   */
  public static async sendMail(params: SendMailParams): Promise<SendMailResult> {
    const transporter = await this.getTransporterForSender(params.senderCustomConfig);

    const fromAddress = params.fromName
      ? `"${params.fromName}" <${params.fromEmail}>`
      : params.fromEmail;

    try {
      const info = await transporter.sendMail({
        from: fromAddress,
        to: params.toEmail,
        subject: params.subject,
        html: params.body,
        text: params.body.replace(/<[^>]*>?/gm, '') // fallback plaintext
      });

      const previewUrl = nodemailer.getTestMessageUrl(info) || null;

      logger.info(
        {
          messageId: info.messageId,
          to: params.toEmail,
          previewUrl
        },
        'Email successfully dispatched via Ethereal SMTP'
      );

      return {
        messageId: info.messageId,
        previewUrl: typeof previewUrl === 'string' ? previewUrl : null
      };
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      logger.error({ err: errorMessage, to: params.toEmail }, 'Failed to send email via SMTP');
      throw err;
    }
  }

  /**
   * Helper to verify whether an error is permanent (non-retryable) or transient.
   */
  public static isPermanentError(error: unknown): boolean {
    if (!error) return false;
    const msg = String(error).toLowerCase();
    // 5xx SMTP codes, invalid mailbox syntax, recipient rejected
    if (
      msg.includes('550') ||
      msg.includes('553') ||
      msg.includes('501') ||
      msg.includes('invalid address') ||
      msg.includes('user not found') ||
      msg.includes('mailbox unavailable')
    ) {
      return true;
    }
    return false;
  }
}

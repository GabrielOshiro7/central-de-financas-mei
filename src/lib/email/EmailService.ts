export interface EmailService {
  sendPasswordResetEmail(to: string, resetUrl: string): Promise<void>;
}

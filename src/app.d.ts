declare global {
  namespace App {
    interface Locals {
      user: import('$lib/types').SessionUser | null;
      webhookBuffer: import('$lib/server/services/webhook-buffer').WebhookBuffer;
    }
  }
}
export {};
import type { PaymentStatus } from '../../generated/prisma/client.js';

export interface VerifyPaymentDto {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}

export interface PaymentListQuery {
  cursor?: string;
  limit: number;
}

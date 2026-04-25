import Razorpay from 'razorpay';
import crypto from 'crypto';
import { paymentRepository } from './payment.repository.js';
import { HttpError } from '../../shared/errors/HttpError.js';
import { ErrorCodes } from '../../shared/errors/errorCodes.js';
import { config } from '../../config/index.js';
import redis from '../../config/redis.js';
import type { VerifyPaymentDto, PaymentListQuery } from './payment.types.js';

// Instantiate Razorpay
const razorpay = new Razorpay({
  key_id: config.RAZORPAY_KEY_ID,
  key_secret: config.RAZORPAY_KEY_SECRET,
});

function calculateEndDate(startDate: Date, durationType: string): Date {
  const end = new Date(startDate);
  switch (durationType) {
    case 'daily': break;
    case 'weekly': end.setDate(end.getDate() + 6); break;
    case 'monthly': end.setDate(end.getDate() + 29); break;
  }
  return end;
}

function generateSlotDates(startDate: Date, endDate: Date, mealSlot: string) {
  const slots: { date: Date; slot: any }[] = [];
  const current = new Date(startDate);
  while (current <= endDate) {
    if (mealSlot === 'full_day') {
      slots.push(
        { date: new Date(current), slot: 'breakfast' as any },
        { date: new Date(current), slot: 'lunch' as any },
        { date: new Date(current), slot: 'dinner' as any },
      );
    } else {
      slots.push({ date: new Date(current), slot: mealSlot as any });
    }
    current.setDate(current.getDate() + 1);
  }
  return slots;
}

export const paymentService = {
  async createOrder(userId: string, subscriptionId: string, amountDue: number, walletAmountUsed: number) {
    const amountInPaise = Math.round(amountDue * 100);
    const order = await razorpay.orders.create({
      amount: amountInPaise,
      currency: 'INR',
      receipt: subscriptionId,
    });

    await paymentRepository.create({
      userId,
      subscriptionId,
      amount: amountDue,
      walletAmountUsed,
      razorpayOrderId: order.id,
    });

    return {
      id: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: config.RAZORPAY_KEY_ID,
    };
  },

  async verifyPayment(userId: string, dto: VerifyPaymentDto) {
    const payment = await paymentRepository.findByOrderId(dto.razorpayOrderId);
    if (!payment) {
      throw new HttpError(404, ErrorCodes.PAYMENT_NOT_FOUND, 'Payment not found for this order ID.');
    }
    
    // Verify ownership
    if (payment.userId !== userId) {
      throw new HttpError(403, 'FORBIDDEN', 'Access denied.');
    }

    if (payment.status !== 'pending') {
      throw new HttpError(409, ErrorCodes.PAYMENT_ALREADY_CAPTURED, 'Payment has already been processed.');
    }

    // HMAC verification
    const text = dto.razorpayOrderId + '|' + dto.razorpayPaymentId;
    const expectedSig = crypto
      .createHmac('sha256', config.RAZORPAY_KEY_SECRET)
      .update(text)
      .digest('hex');

    if (expectedSig !== dto.razorpaySignature) {
      await paymentRepository.failPayment(payment.id, payment.subscriptionId!, 'Signature mismatch');
      throw new HttpError(400, ErrorCodes.PAYMENT_VERIFICATION_FAILED, 'Payment signature is invalid.');
    }

    // Activated! We need to generate slot rows here
    const sub = payment.subscription!;
    const slotRows = generateSlotDates(sub.startDate, sub.endDate, sub.mealSlot);

    const result = await paymentRepository.activateSubscription(
      payment.id,
      sub.id,
      dto.razorpayPaymentId,
      dto.razorpaySignature,
      slotRows
    );

    // INCR Redis headcounts
    const pipeline = redis.pipeline();
    for (const slot of slotRows) {
      const dateStr = slot.date.toISOString().split('T')[0];
      const key = `hungrygo:headcount:${sub.messId}:${dateStr}:${slot.slot}`;
      pipeline.incr(key);
      pipeline.expire(key, 86400 * 35);
    }
    await pipeline.exec();

    return {
      subscriptionId: result!.id,
      status: 'active',
      startDate: result!.startDate,
      endDate: result!.endDate,
      totalSlots: result!.mealSlots.length,
    };
  },

  async handleWebhook(rawBody: Buffer, signature: string) {
    const expectedSig = crypto
      .createHmac('sha256', config.RAZORPAY_WEBHOOK_SECRET)
      .update(rawBody)
      .digest('hex');

    if (expectedSig !== signature) {
      throw new HttpError(400, ErrorCodes.WEBHOOK_INVALID_SIGNATURE, 'Signature mismatch');
    }

    const event = JSON.parse(rawBody.toString('utf-8'));
    
    if (event.event === 'payment.captured') {
      const orderId = event.payload.payment.entity.order_id;
      const paymentId = event.payload.payment.entity.id;
      
      const payment = await paymentRepository.findByOrderId(orderId);
      if (payment && payment.status === 'pending') {
        const sub = payment.subscription!;
        const slotRows = generateSlotDates(sub.startDate, sub.endDate, sub.mealSlot);
        await paymentRepository.activateSubscription(payment.id, sub.id, paymentId, signature, slotRows);
        
        const pipeline = redis.pipeline();
        for (const slot of slotRows) {
          const dateStr = slot.date.toISOString().split('T')[0];
          const key = `hungrygo:headcount:${sub.messId}:${dateStr}:${slot.slot}`;
          pipeline.incr(key);
          pipeline.expire(key, 86400 * 35);
        }
        await pipeline.exec();
      }
    } else if (event.event === 'payment.failed') {
      const orderId = event.payload.payment.entity.order_id;
      const payment = await paymentRepository.findByOrderId(orderId);
      if (payment && payment.status === 'pending') {
        await paymentRepository.failPayment(payment.id, payment.subscriptionId!, 'Payment failed');
      }
    }
  },

  async getPayments(userId: string, opts: PaymentListQuery) {
    const result = await paymentRepository.getPayments(userId, opts);
    return {
      items: result.items.map((tx: any) => ({
        id: tx.id,
        amount: Number(tx.amount),
        walletAmountUsed: Number(tx.walletAmountUsed),
        currency: tx.currency,
        status: tx.status,
        razorpayOrderId: tx.razorpayOrderId,
        razorpayPaymentId: tx.razorpayPaymentId,
        createdAt: tx.createdAt,
      })),
      cursor: result.cursor,
      hasMore: result.hasMore,
    };
  }
};

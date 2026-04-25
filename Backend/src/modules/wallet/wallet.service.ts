import { walletRepository } from './wallet.repository.js';
import type { WalletTxType } from '../../generated/prisma/client.js';

export const walletService = {
  async getBalance(userId: string) {
    const wallet = await walletRepository.getOrCreate(userId);
    return {
      balance: Number(wallet.balance),
      updatedAt: wallet.updatedAt,
    };
  },

  async getTransactions(
    userId: string,
    opts: { type?: string; cursor?: string; limit: number },
  ) {
    const txType = opts.type && opts.type !== 'all'
      ? (opts.type as WalletTxType)
      : undefined;

    const result = await walletRepository.getTransactions(userId, {
      type: txType,
      cursor: opts.cursor,
      limit: opts.limit,
    });

    return {
      items: result.items.map((tx) => ({
        id: tx.id,
        amount: Number(tx.amount),
        type: tx.type,
        reason: tx.reason,
        referenceId: tx.referenceId,
        createdAt: tx.createdAt,
      })),
      cursor: result.cursor,
      hasMore: result.hasMore,
    };
  },
};

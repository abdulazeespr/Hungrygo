import prisma from '../../config/database.js';
import type { WalletTxType } from '../../generated/prisma/client.js';

export const walletRepository = {
  /**
   * Get or create a wallet for the user. Uses upsert so the wallet
   * is lazily created on first access.
   */
  async getOrCreate(userId: string) {
    return prisma.creditWallet.upsert({
      where: { userId },
      update: {},
      create: { userId, balance: 0 },
    });
  },

  /**
   * Cursor-paginated wallet transaction history.
   */
  async getTransactions(
    userId: string,
    opts: { type?: WalletTxType; cursor?: string; limit: number },
  ) {
    const { type, cursor, limit } = opts;

    const where: Record<string, unknown> = { userId };
    if (type) where.type = type;

    const transactions = await prisma.walletTransaction.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
    });

    const hasMore = transactions.length > limit;
    if (hasMore) transactions.pop();

    return {
      items: transactions,
      cursor: transactions.length > 0 ? transactions[transactions.length - 1]!.id : null,
      hasMore,
    };
  },
};

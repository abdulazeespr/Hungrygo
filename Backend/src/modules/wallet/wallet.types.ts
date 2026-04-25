export interface WalletBalance {
  balance: number;
  updatedAt: Date;
}

export interface WalletTransactionRow {
  id: string;
  amount: number;
  type: 'credit' | 'debit';
  reason: string | null;
  referenceId: string | null;
  createdAt: Date;
}

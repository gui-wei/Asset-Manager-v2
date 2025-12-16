export enum AssetType {
  FUND = 'Fund',
  STOCK = 'Stock', // 新增这一行
  GOLD = 'Gold',
  OTHER = 'Other'
}

export type Currency = 'CNY' | 'USD' | 'HKD';

export interface Transaction {
  id: string;
  date: string; // ISO Date string YYYY-MM-DD
  type: 'deposit' | 'earning';
  amount: number;
  description?: string;
}

export interface DailyEarning {
  date: string;
  amount: number;
}

export interface Asset {
  id: string;
  institution: string; // The "Channel" e.g., Alipay, Bank
  productName: string; // The specific product
  type: AssetType;
  currency: Currency; // CNY, USD, HKD
  remark?: string;
  currentAmount: number; // Total value
  totalEarnings: number; // Accumulated earnings
  sevenDayYield?: number; // %
  history: Transaction[];
  dailyEarnings: Record<string, number>; // Map date to amount for fast lookup
}

export interface DashboardStats {
  totalAssets: number;
  totalEarnings: number;
}

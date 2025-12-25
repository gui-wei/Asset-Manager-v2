export enum AssetType {
  FUND = 'Fund',
  STOCK = 'Stock',
  GOLD = 'Gold',
  OTHER = 'Other'
}

export type Currency = 'CNY' | 'USD' | 'HKD';

// 现有的资产相关接口
export interface Transaction {
  id: string;
  date: string;
  type: 'deposit' | 'earning';
  amount: number;
  description?: string;
  currency?: Currency;
}

export interface Asset {
  id: string;
  institution: string;
  productName: string;
  type: AssetType;
  currency: Currency;
  earningsCurrency?: Currency;
  remark?: string;
  currentAmount: number;
  totalEarnings: number;
  sevenDayYield?: number;
  history: Transaction[];
  dailyEarnings: Record<string, number>;
}

// [UPDATED] 薪资详情子项
export interface SalaryDetail {
  name: string;   // 细则名称 (如 "基本工资", "高温补贴")
  amount: number; // 金额
}

// [UPDATED] 薪资记录接口 - 支持动态细则
export interface SalaryRecord {
  id: string;
  date: string; // YYYY-MM 格式
  details: SalaryDetail[]; // 动态存储所有细则
  total: number; // 当月实发总计
  remark?: string; // 备注
}

export interface DashboardStats {
  totalAssets: number;
  totalEarnings: number;
}

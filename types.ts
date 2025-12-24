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

// [NEW] 新增工资记录接口
export interface SalaryRecord {
  id: string;
  date: string; // YYYY-MM 格式，用于标记月份
  basicSalary: number; // 基本工资
  settlingInAllowance: number; // 安家费
  extraIncome: number; // 额外收入
  subsidy: number; // 每月补贴金额
  subsidyType: 'card' | 'cash'; // 补贴类型：购物卡/现金
  monthlyBonus: number; // 每月奖金
  total: number; // 当月总计 (自动计算)
  remark?: string; // 备注
}

export interface DashboardStats {
  totalAssets: number;
  totalEarnings: number;
}

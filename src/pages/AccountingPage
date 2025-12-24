import React, { useMemo } from 'react';
import { Asset, Transaction } from '../../types';
import { FileText, ArrowUpRight, ArrowDownLeft, Calendar } from 'lucide-react';

interface AccountingPageProps {
  assets: Asset[];
}

const AccountingPage: React.FC<AccountingPageProps> = ({ assets }) => {
  // 1. 扁平化所有交易记录并添加资产信息
  const allTransactions = useMemo(() => {
    const list: (Transaction & { assetName: string; assetCurrency: string })[] = [];
    assets.forEach(asset => {
      asset.history.forEach(tx => {
        list.push({
          ...tx,
          assetName: asset.productName,
          assetCurrency: asset.currency // 简化处理，实际应考虑 earningsCurrency
        });
      });
    });
    // 按日期降序排列
    return list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [assets]);

  // 2. 按月份分组
  const groupedTransactions = useMemo(() => {
    const groups: Record<string, typeof allTransactions> = {};
    allTransactions.forEach(tx => {
      const monthStr = tx.date.substring(0, 7); // YYYY-MM
      if (!groups[monthStr]) groups[monthStr] = [];
      groups[monthStr].push(tx);
    });
    return groups;
  }, [allTransactions]);

  const sortedMonths = Object.keys(groupedTransactions).sort((a, b) => b.localeCompare(a));

  const getSymbol = (c?: string) => c === 'USD' ? '$' : c === 'HKD' ? 'HK$' : '¥';

  return (
    <div className="pb-24 px-4 pt-4 min-h-screen">
      <header className="mb-6 px-2">
        <h1 className="text-2xl font-extrabold text-gray-900 flex items-center gap-2">
          <FileText className="text-gray-800" /> 交易明细
        </h1>
        <p className="text-gray-500 text-sm mt-1 font-medium">共 {allTransactions.length} 笔收支记录</p>
      </header>

      <div className="space-y-6">
        {sortedMonths.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 opacity-50">
            <div className="bg-gray-200 p-4 rounded-full mb-4">
               <FileText size={32} className="text-gray-400" />
            </div>
            <p className="text-gray-500 font-bold">暂无记账记录</p>
          </div>
        ) : (
          sortedMonths.map(month => (
            <div key={month} className="animate-slideUp">
              <div className="sticky top-[72px] z-10 bg-[#ededed]/95 backdrop-blur py-2 mb-2 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-gray-900"></div>
                <h3 className="text-sm font-bold text-gray-700 font-mono">{month}</h3>
              </div>
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden divide-y divide-gray-50">
                {groupedTransactions[month].map(tx => {
                  const isEarning = tx.type === 'earning';
                  const isPositive = tx.amount > 0;
                  const symbol = getSymbol(tx.currency || 'CNY');
                  
                  return (
                    <div key={tx.id} className="p-4 flex justify-between items-center hover:bg-gray-50 transition-colors group">
                      <div className="flex items-center gap-3 overflow-hidden">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                          isEarning 
                            ? 'bg-red-50 text-red-500' 
                            : 'bg-blue-50 text-blue-500'
                        }`}>
                          {isEarning ? <ArrowUpRight size={18} /> : <ArrowDownLeft size={18} />}
                        </div>
                        <div className="min-w-0">
                          <p className="font-bold text-gray-800 text-sm truncate">{tx.assetName}</p>
                          <div className="flex items-center gap-2 text-xs text-gray-400 mt-0.5">
                            <span className="bg-gray-100 px-1.5 rounded text-[10px]">{isEarning ? '收益' : '买入'}</span>
                            <span>{tx.date}</span>
                            {tx.description && <span className="truncate max-w-[100px] border-l border-gray-200 pl-2">{tx.description}</span>}
                          </div>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className={`font-mono font-bold text-base ${
                          isEarning 
                            ? (isPositive ? 'text-red-500' : 'text-green-600')
                            : 'text-gray-900'
                        }`}>
                          {isEarning && isPositive ? '+' : ''}
                          {isEarning && !isPositive ? '' : ''}
                          {isEarning ? '' : '-'} 
                          {symbol}{Math.abs(tx.amount).toLocaleString()}
                        </p>
                        <p className="text-[10px] text-gray-400 font-medium">{tx.currency || 'CNY'}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default AccountingPage;

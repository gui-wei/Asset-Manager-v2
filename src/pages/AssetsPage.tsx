import React, { useState, useMemo } from 'react';
import { 
  TrendingUp, Percent, Clock, BarChart4, Wallet, 
  History, Sparkles, Calendar, Pencil, Trash2, Settings,
  ArrowUpRight, ArrowDownLeft, RefreshCw
} from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';

import { Asset, Transaction, AssetType, Currency } from '../../types'; 
import EarningsCalendar from '../../components/EarningsCalendar';

// --- 辅助函数 ---
const RATES: Record<Currency, number> = { CNY: 1, USD: 7.2, HKD: 0.92 };
const getSymbol = (c: Currency) => c === 'USD' ? '$' : c === 'HKD' ? 'HK$' : '¥';
const convertCurrency = (amount: number, from: Currency, to: Currency) => {
  if (from === to) return amount;
  return (amount * RATES[from]) / RATES[to];
};
const COLORS = ['#3b82f6', '#ef4444', '#fbbf24', '#a855f7'];

/**
 * --- 子组件: AssetItem (资产卡片) ---
 */
const AssetItem: React.FC<{ 
  asset: Asset; 
  onEditTransaction: (tx: Transaction) => void; 
  onDeleteTransaction: (txId: string) => void; 
  onDelete: (id: string) => void; 
  onEditInfo: () => void; 
  onDirectAIScan: () => void; 
}> = ({ asset, onEditTransaction, onDeleteTransaction, onDelete, onEditInfo, onDirectAIScan }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  
  const principalSymbol = getSymbol(asset.currency);
  const earningsCurrency = asset.earningsCurrency || asset.currency;
  const earningsSymbol = getSymbol(earningsCurrency);
  
  const totalEarningsInBase = convertCurrency(asset.totalEarnings, earningsCurrency, asset.currency);
  const principal = asset.currentAmount - totalEarningsInBase;
  const holdingYield = principal > 0 ? (totalEarningsInBase / principal) * 100 : 0;
  
  const today = new Date();
  let sum7DayEarningsDisplay = 0; 
  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    sum7DayEarningsDisplay += (asset.dailyEarnings[dateStr] || 0);
  }
  const sum7DayEarningsInBase = convertCurrency(sum7DayEarningsDisplay, earningsCurrency, asset.currency);
  const real7DayYield = principal > 0 ? (sum7DayEarningsInBase / principal) * (365 / 7) * 100 : 0;

  const getDaysHeld = () => {
    if (asset.history.length === 0) return 0;
    const earliestDate = asset.history.reduce((min, p) => p.date < min ? p.date : min, asset.history[0].date);
    const diffTime = new Date().getTime() - new Date(earliestDate).getTime();
    return Math.max(0, Math.floor(diffTime / (1000 * 60 * 60 * 24))); 
  };
  const daysHeld = getDaysHeld();

  return (
    <>
      <div className="transition-all duration-300">
        <div onClick={() => setIsOpen(!isOpen)} className="p-5 flex justify-between items-center cursor-pointer hover:bg-gray-50 transition active:bg-gray-100">
          <div className="flex items-center gap-3 flex-1 min-w-0 pr-2">
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-white font-bold text-sm shadow-md shrink-0 ${
                asset.type === AssetType.FUND ? 'bg-gradient-to-br from-blue-400 to-blue-600' : 
                asset.type === AssetType.STOCK ? 'bg-gradient-to-br from-red-500 to-red-700' : 
                asset.type === AssetType.GOLD ? 'bg-gradient-to-br from-yellow-400 to-yellow-600' : 
                'bg-gradient-to-br from-purple-400 to-purple-600'
            }`}>
              {asset.type === AssetType.FUND ? '基' : asset.type === AssetType.STOCK ? '股' : asset.type === AssetType.GOLD ? '金' : '其'}
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-bold text-gray-800 text-base break-words leading-tight">{asset.productName}</h3>
              <div className="flex flex-wrap items-center gap-2 mt-1.5">
                  <div className={`text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1 font-bold ${holdingYield >= 0 ? 'bg-red-50 text-red-500' : 'bg-green-50 text-green-500'}`}><span>持仓 {holdingYield.toFixed(2)}%</span></div>
                  <div className={`text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1 font-bold ${real7DayYield >= 0 ? 'bg-red-50 text-red-500' : 'bg-green-50 text-green-500'}`}><span>近7日年化 {real7DayYield.toFixed(2)}%</span></div>
                  <div className="text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1 font-bold bg-blue-50 text-blue-500"><span>持仓 {daysHeld} 天</span></div>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
             <div className="text-right">
              <p className="font-bold text-gray-900 text-lg font-mono tracking-tight leading-tight">{principalSymbol} {asset.currentAmount.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</p>
              <p className={`text-xs font-bold ${asset.totalEarnings >= 0 ? 'text-red-500' : 'text-green-500'}`}>{asset.totalEarnings >= 0 ? '+' : ''}{earningsSymbol} {asset.totalEarnings.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</p>
            </div>
          </div>
        </div>
        <div className={`overflow-hidden transition-all duration-300 ease-in-out bg-gray-50 border-t border-gray-100 ${isOpen ? 'max-h-[1000px] opacity-100' : 'max-h-0 opacity-0'}`}>
          <div className="p-4">
            <div className="flex justify-between items-center mb-3 px-1">
              <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5"><History size={14} /> 资金明细</h4>
              <div className="flex items-center gap-2">
                  <button onClick={(e) => { e.stopPropagation(); onDirectAIScan(); }} className="text-xs bg-indigo-50 border border-indigo-100 px-3 py-1.5 rounded-full text-indigo-600 flex items-center gap-1.5 hover:bg-indigo-100 font-bold shadow-sm transition-colors whitespace-nowrap"><Sparkles size={12} /> AI 录入</button>
                  <button onClick={(e) => { e.stopPropagation(); setShowCalendar(true); }} className="text-xs bg-white border border-gray-200 px-3 py-1.5 rounded-full text-gray-600 flex items-center gap-1.5 hover:bg-gray-100 font-medium shadow-sm transition-colors whitespace-nowrap"><Calendar size={14} className="text-blue-500"/> 查看日历</button>
              </div>
            </div>
            <div className="space-y-3 max-h-56 overflow-y-auto pr-1 custom-scrollbar">
              {asset.history.length === 0 ? <p className="text-center text-xs text-gray-400 py-4">暂无记录</p> : asset.history.map(record => {
                  const txCurrency = record.currency || (record.type === 'deposit' ? asset.currency : earningsCurrency);
                  const txSymbol = getSymbol(txCurrency);
                  const isDeposit = record.type === 'deposit';
                  const isPositiveEarning = record.type === 'earning' && record.amount > 0;
                  
                  let textColorClass = isDeposit ? 'text-blue-500' : (isPositiveEarning ? 'text-red-500' : 'text-green-600');
                  let dotColorClass = isDeposit ? 'bg-blue-500' : (isPositiveEarning ? 'bg-red-500' : 'bg-green-600');

                  return (
                    <div key={record.id} className="flex justify-between items-center text-sm bg-white p-3 rounded-lg shadow-sm border border-gray-100 group">
                      <div className="flex items-center gap-3">
                        <div className={`w-1.5 h-1.5 rounded-full ${dotColorClass} shrink-0`}></div>
                        <span className="text-gray-400 text-xs shrink-0">{record.date}</span>
                        <div className="flex items-center gap-1 min-w-0">
                            <span className="text-gray-700 font-medium truncate max-w-[100px]">{record.description}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className={`font-mono font-bold ${textColorClass}`}>
                            {record.type === 'earning' && record.amount > 0 ? '+' : ''}{txSymbol}{Math.abs(record.amount).toLocaleString()}
                        </span>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={(e) => { e.stopPropagation(); onEditTransaction(record); }} className="p-1.5 text-gray-300 hover:text-blue-500 hover:bg-blue-50 rounded transition"><Pencil size={14} /></button>
                            <button onClick={(e) => { e.stopPropagation(); onDeleteTransaction(record.id); }} className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded transition"><Trash2 size={14} /></button>
                        </div>
                      </div>
                    </div>
                  );
                })
              }
            </div>
            <div className="mt-4 pt-3 border-t border-gray-100 flex gap-2">
               <button onClick={(e) => { e.stopPropagation(); onEditInfo(); }} className="flex-1 flex items-center justify-center gap-1.5 text-xs text-blue-500 hover:text-blue-600 transition-colors py-2 rounded-lg hover:bg-blue-50 font-bold bg-blue-50/50 cursor-pointer whitespace-nowrap"><Settings size={14} /><span>修改信息</span></button>
               <button onClick={(e) => { e.stopPropagation(); onDelete(asset.id); }} className="flex-1 flex items-center justify-center gap-1.5 text-xs text-gray-400 hover:text-red-500 transition-colors py-2 rounded-lg hover:bg-red-50 cursor-pointer whitespace-nowrap"><Trash2 size={14} /><span>删除资产</span></button>
            </div>
          </div>
        </div>
      </div>
      {showCalendar && <EarningsCalendar asset={asset} onClose={() => setShowCalendar(false)} />}
    </>
  );
};

interface AssetsPageProps {
  assets: Asset[];
  dashboardCurrency: Currency;
  setDashboardCurrency: React.Dispatch<React.SetStateAction<Currency>>;
  onOpenAdd: () => void;
  onOpenScan: (mode: 'global' | 'earning' | 'withdrawal') => void;
  onEditAsset: (asset: Asset) => void;
  onDeleteAsset: (id: string) => void;
  onEditTransaction: (assetId: string, tx: Transaction) => void;
  onDeleteTransaction: (assetId: string, txId: string) => void;
  privacyMode: boolean;
}

const AssetsPage: React.FC<AssetsPageProps> = ({ 
  assets, dashboardCurrency, setDashboardCurrency, 
  onOpenAdd, onOpenScan, onEditAsset, onDeleteAsset, 
  onEditTransaction, onDeleteTransaction, privacyMode 
}) => {
  const totalAssets = assets.reduce((sum, a) => sum + convertCurrency(a.currentAmount, a.currency, dashboardCurrency), 0);
  const totalEarnings = assets.reduce((sum, a) => sum + convertCurrency(a.totalEarnings, a.earningsCurrency || a.currency, dashboardCurrency), 0);
  
  const totalPrincipal = totalAssets - totalEarnings;
  const totalYield = totalPrincipal > 0 ? (totalEarnings / totalPrincipal) * 100 : 0;

  const allDates = assets.flatMap(a => a.history.map(t => t.date));
  const minDate = allDates.length > 0 ? allDates.reduce((min, d) => d < min ? d : min, allDates[0]) : null;
  const daysInvested = minDate ? Math.max(0, Math.floor((new Date().getTime() - new Date(minDate).getTime()) / (1000 * 60 * 60 * 24))) : 0;

  let annualizedYield = 0;
  if (totalPrincipal > 0 && daysInvested > 7) {
      const growthRatio = totalAssets / totalPrincipal;
      const yearRatio = 365 / daysInvested;
      annualizedYield = (Math.pow(growthRatio, yearRatio) - 1) * 100;
  }

  const chartData = [
    { name: '基金', value: assets.filter(a => a.type === AssetType.FUND).reduce((s, a) => s + convertCurrency(a.currentAmount, a.currency, dashboardCurrency), 0) },
    { name: '股票', value: assets.filter(a => a.type === AssetType.STOCK).reduce((s, a) => s + convertCurrency(a.currentAmount, a.currency, dashboardCurrency), 0) },
    { name: '黄金', value: assets.filter(a => a.type === AssetType.GOLD).reduce((s, a) => s + convertCurrency(a.currentAmount, a.currency, dashboardCurrency), 0) },
    { name: '其他', value: assets.filter(a => a.type === AssetType.OTHER).reduce((s, a) => s + convertCurrency(a.currentAmount, a.currency, dashboardCurrency), 0) },
  ].filter(d => d.value > 0);

  const assetsByInstitution = useMemo(() => {
    return assets.reduce((groups, asset) => {
      const key = asset.institution || '其他';
      if (!groups[key]) groups[key] = [];
      groups[key].push(asset);
      return groups;
    }, {} as Record<string, Asset[]>);
  }, [assets]);

  return (
    <div className="pb-8"> 
      <div className="mx-4 sm:mx-6 mb-6">
        <div className="bg-gradient-to-br from-gray-800 to-black text-white rounded-2xl p-6 shadow-xl relative overflow-hidden transition-all duration-500">
           <div className="flex justify-between items-center relative z-10">
              <div className="flex-1 min-w-0">
                 <div className="flex items-center gap-2 mb-1">
                   <p className="text-gray-400 text-xs font-medium tracking-wide">总资产估值</p>
                   <button onClick={() => setDashboardCurrency(curr => curr === 'CNY' ? 'USD' : curr === 'USD' ? 'HKD' : 'CNY')} className="text-[10px] font-bold bg-white/10 px-1.5 py-0.5 rounded text-gray-300 hover:bg-white/20 transition flex items-center gap-0.5">{dashboardCurrency} <RefreshCw size={8} /></button>
                 </div>
                 <h2 className="text-3xl sm:text-4xl font-bold mb-4 font-mono tracking-tight animate-fadeIn truncate">
                   {dashboardCurrency === 'USD' ? '$' : dashboardCurrency === 'HKD' ? 'HK$' : '¥'} 
                   {privacyMode ? '****' : totalAssets.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                 </h2>
                 <div className="grid grid-cols-2 gap-2">
                    <div className="bg-white/10 px-3 py-1.5 rounded-lg backdrop-blur-md flex items-center gap-2 border border-white/5">
                        <TrendingUp size={14} className="text-red-400 shrink-0" />
                        <div className="min-w-0">
                            <p className="text-[10px] text-gray-400 leading-none mb-0.5">累计收益</p>
                            <p className="text-sm font-bold leading-none truncate">{privacyMode ? '***' : (totalEarnings > 0 ? '+' : '') + totalEarnings.toLocaleString(undefined, {minimumFractionDigits: 0})}</p>
                        </div>
                    </div>
                    <div className="bg-white/10 px-3 py-1.5 rounded-lg backdrop-blur-md flex items-center gap-2 border border-white/5">
                        <Percent size={14} className="text-yellow-400 shrink-0" />
                        <div className="min-w-0">
                            <p className="text-[10px] text-gray-400 leading-none mb-0.5">收益率</p>
                            <p className={`text-sm font-bold leading-none truncate ${totalYield >= 0 ? 'text-red-400' : 'text-green-400'}`}>
                                {totalYield >= 0 ? '+' : ''}{totalYield.toFixed(2)}%
                            </p>
                        </div>
                    </div>
                 </div>
              </div>
              <div className="hidden sm:block w-32 h-32 relative shrink-0"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={chartData} innerRadius="60%" outerRadius="100%" paddingAngle={5} dataKey="value" stroke="none">{chartData.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}</Pie></PieChart></ResponsiveContainer></div>
           </div>
        </div>
      </div>

      <div className="px-4 sm:px-6 space-y-5">
         {Object.keys(assetsByInstitution).length === 0 ? 
           <div className="text-center py-16">
             <div className="bg-gray-100 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4"><Wallet className="text-gray-300" size={32} /></div>
             <p className="text-gray-400 text-sm">暂无资产，点击下方按钮开始记录</p>
           </div> : 
           Object.entries(assetsByInstitution).map(([institution, instAssets]) => (
             <div key={institution} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden animate-slideUp">
                <div className="bg-[#ededed]/50 px-5 py-3 border-b border-gray-100 flex items-center justify-between"><div className="flex items-center gap-2"><div className="w-1 h-4 bg-gray-800 rounded-full"></div><h3 className="font-bold text-gray-700 text-sm">{institution}</h3></div></div>
                <div className="divide-y divide-gray-50">
                  {instAssets.map(asset => (
                    <AssetItem 
                      key={asset.id} 
                      asset={asset} 
                      onEditTransaction={(tx) => onEditTransaction(asset.id, tx)} 
                      onDeleteTransaction={(txId) => onDeleteTransaction(asset.id, txId)} 
                      onDelete={onDeleteAsset} 
                      onEditInfo={() => onEditAsset(asset)} 
                      onDirectAIScan={() => onOpenScan('earning')} // Pass simple mode or default
                    />
                  ))}
                </div>
             </div>
           ))
         }
      </div>
      {/* 底部悬浮按钮已移除，统一移至 App.tsx */}
    </div>
  );
};

export default AssetsPage;

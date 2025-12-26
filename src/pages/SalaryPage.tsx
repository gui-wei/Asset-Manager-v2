import React, { useState } from 'react';
import { 
  ChevronDown, Briefcase, 
  Home, Rocket, CreditCard, Banknote, Trophy, Calendar, Trash2, 
  Coins, PiggyBank, Receipt, Sparkles
} from 'lucide-react';
import { SalaryRecord, SalaryDetail } from '../../types';

interface SalaryPageProps {
  salaryRecords: SalaryRecord[];
  onOpenAdd: () => void;
  onOpenScan: () => void;
  onDeleteRecord: (id: string) => void;
}

// 智能匹配图标助手
const getIconForName = (name: string) => {
  const n = name.toLowerCase();
  if (n.includes('基本') || n.includes('岗位') || n.includes('工资')) return Briefcase;
  if (n.includes('奖') || n.includes('绩效')) return Trophy;
  if (n.includes('补') || n.includes('贴') || n.includes('房') || n.includes('餐')) return Sparkles;
  if (n.includes('安家')) return Home;
  if (n.includes('兼职') || n.includes('稿费')) return Rocket;
  if (n.includes('公积金') || n.includes('社保') || n.includes('险') || n.includes('年金')) return PiggyBank;
  if (n.includes('税') || n.includes('扣')) return Receipt;
  return Coins; // 默认图标
};

// 智能匹配颜色
const getColorForName = (name: string, amount: number) => {
  if (amount < 0) return 'text-red-500 bg-red-50';
  const n = name.toLowerCase();
  if (n.includes('扣') || n.includes('税') || n.includes('险') || n.includes('金')) return 'text-orange-500 bg-orange-50'; 
  if (n.includes('奖') || n.includes('绩效')) return 'text-yellow-600 bg-yellow-50';
  if (n.includes('补')) return 'text-purple-500 bg-purple-50';
  if (n.includes('基本')) return 'text-blue-500 bg-blue-50';
  return 'text-indigo-500 bg-indigo-50';
};

const DetailRow: React.FC<{ 
  detail: SalaryDetail
}> = ({ detail }) => {
  const Icon = getIconForName(detail.name);
  const colorClass = getColorForName(detail.name, detail.amount);
  
  const n = detail.name.toLowerCase();
  const isIncomeLike = n.includes('应发') || n.includes('实发') || n.includes('收入') || n.includes('合计');

  let prefix = '';
  if (detail.amount > 0 && isIncomeLike) prefix = '+';
  
  const isDeductionName = n.includes('扣') || n.includes('税');
  if (detail.amount > 0 && isDeductionName) {
      prefix = '-'; 
  }

  const displayValue = Math.abs(detail.amount).toLocaleString(undefined, { minimumFractionDigits: 2 });
  const finalSign = (detail.amount < 0 || prefix === '-') ? '-' : prefix;

  return (
    <div className="flex justify-between items-center py-3 border-b border-gray-50 last:border-0 hover:bg-gray-50/50 transition-colors px-2 rounded-lg">
      <div className="flex items-center gap-3 min-w-0">
        <div className={`p-2 rounded-lg ${colorClass} shrink-0`}>
          <Icon size={16} />
        </div>
        <span className="text-sm text-gray-600 font-bold truncate">{detail.name}</span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className={`font-mono font-bold text-sm ${detail.amount < 0 || finalSign === '-' ? 'text-red-500' : 'text-gray-800'}`}>
          {finalSign}{displayValue}
        </span>
      </div>
    </div>
  );
};

const SalaryPage: React.FC<SalaryPageProps> = ({ salaryRecords, onDeleteRecord }) => {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const currentYear = new Date().getFullYear();
  const yearlyTotal = salaryRecords
    .filter(r => r.date.startsWith(currentYear.toString()))
    .reduce((sum, r) => sum + r.total, 0);

  const sortedRecords = [...salaryRecords].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="pb-32">
      <div className="bg-gradient-to-br from-indigo-900 to-indigo-700 pt-12 pb-20 px-6 rounded-b-[2.5rem] shadow-xl text-white relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-white opacity-5 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl pointer-events-none"></div>
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-indigo-400 opacity-10 rounded-full translate-y-1/2 -translate-x-1/4 blur-3xl pointer-events-none"></div>
        
        <div className="relative z-10 animate-fadeIn">
          <div className="flex items-center gap-2 mb-3 opacity-80">
            <div className="bg-white/20 p-1.5 rounded-lg backdrop-blur-sm">
              <Calendar size={14} className="text-white" />
            </div>
            <span className="text-xs font-bold tracking-widest uppercase text-indigo-100">{currentYear} 年度总薪资 (实发)</span>
          </div>
          <h1 className="text-5xl font-mono font-bold tracking-tight text-white drop-shadow-sm">
            <span className="text-2xl mr-2 opacity-80 font-sans">¥</span>
            {yearlyTotal.toLocaleString()}
          </h1>
          <p className="text-indigo-200 text-xs mt-3 font-medium flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse"></span>
            已统计 {salaryRecords.length} 笔入账记录
          </p>
        </div>
      </div>

      <div className="px-4 -mt-10 relative z-20 space-y-4">
        {sortedRecords.length === 0 ? (
          <div className="bg-white rounded-3xl p-10 text-center shadow-lg border border-gray-100 animate-slideUp">
            <div className="w-20 h-20 bg-indigo-50 rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner">
              <Banknote className="text-indigo-300" size={40} />
            </div>
            <h3 className="text-gray-800 font-bold text-lg mb-2">暂无工资记录</h3>
            <p className="text-gray-400 text-sm leading-relaxed">点击下方“记一笔”开始记录您的<br/>第一笔工资收入吧！</p>
          </div>
        ) : (
          sortedRecords.map((record) => {
            const isExpanded = expandedId === record.id;
            const [year, month] = record.date.split('-');
            const summaryItems = record.details.slice(0, 2);
            const remainingCount = record.details.length - 2;
            
            return (
              <div 
                key={record.id} 
                className={`bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden transition-all duration-300 animate-slideUp ${isExpanded ? 'shadow-xl ring-1 ring-indigo-50 scale-[1.02]' : 'hover:shadow-md'}`}
              >
                <div 
                  onClick={() => setExpandedId(isExpanded ? null : record.id)}
                  className="p-5 flex justify-between items-center cursor-pointer bg-white relative overflow-hidden group"
                >
                  <div className={`absolute inset-0 bg-indigo-50 transition-opacity duration-300 ${isExpanded ? 'opacity-100' : 'opacity-0 group-hover:opacity-30'}`}></div>

                  <div className="flex items-center gap-4 relative z-10 flex-1 min-w-0">
                    <div className={`flex flex-col items-center justify-center w-14 h-14 rounded-2xl font-bold transition-all duration-300 border shrink-0 ${
                      isExpanded 
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-lg shadow-indigo-200' 
                        : 'bg-white text-gray-700 border-gray-200 shadow-sm'
                    }`}>
                      <span className="text-[10px] opacity-80">{year}</span>
                      <span className="text-xl leading-none">{parseInt(month)}<span className="text-[10px] ml-0.5">月</span></span>
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <h3 className={`font-bold text-lg font-mono transition-colors truncate ${isExpanded ? 'text-indigo-900' : 'text-gray-800'}`}>
                        ¥ {record.total.toLocaleString()}
                      </h3>
                      <p className="text-xs text-gray-400 mt-1 flex items-center gap-1.5 font-medium flex-wrap">
                        {record.remark ? <span className="truncate max-w-[100px]">{record.remark}</span> : <span className="opacity-50">无备注</span>}
                        
                        {summaryItems.map((item, idx) => (
                          <span key={idx} className="bg-gray-100 px-1.5 py-0.5 rounded text-[9px] truncate max-w-[60px]">{item.name}</span>
                        ))}
                        {remainingCount > 0 && <span className="bg-gray-100 px-1.5 py-0.5 rounded text-[9px]">+{remainingCount}</span>}
                      </p>
                    </div>
                  </div>

                  <div className={`relative z-10 p-2 rounded-full transition-all duration-300 shrink-0 ${isExpanded ? 'bg-white text-indigo-600 rotate-180 shadow-sm' : 'text-gray-400 bg-transparent'}`}>
                    <ChevronDown size={20} />
                  </div>
                </div>

                <div 
                  className={`transition-all duration-300 ease-in-out bg-white border-t border-gray-50 px-5 overflow-hidden ${
                    isExpanded ? 'max-h-[1000px] opacity-100 py-4' : 'max-h-0 opacity-0 py-0'
                  }`}
                >
                  <div className="space-y-1">
                    {record.details.map((detail, idx) => (
                      <DetailRow key={idx} detail={detail} />
                    ))}
                  </div>
                  
                  <div className="mt-5 pt-4 border-t border-gray-100 flex justify-end">
                    <button 
                      onClick={(e) => { e.stopPropagation(); onDeleteRecord(record.id); }}
                      className="group flex items-center gap-2 text-xs text-red-500 px-4 py-2 rounded-xl hover:bg-red-50 transition-all font-bold active:scale-95 whitespace-nowrap"
                    >
                      <Trash2 size={14} className="group-hover:scale-110 transition-transform" /> 
                      删除记录
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
      {/* 底部悬浮按钮已移除，统一移至 App.tsx */}
    </div>
  );
};

export default SalaryPage;

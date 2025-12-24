import React, { useState } from 'react';
import { 
  Plus, Camera, ChevronDown, ChevronUp, Briefcase, 
  Home, Rocket, CreditCard, Banknote, Trophy, FileText, Calendar, Trash2 
} from 'lucide-react';
import { SalaryRecord } from '../../types';

interface SalaryPageProps {
  salaryRecords: SalaryRecord[];
  onOpenAdd: () => void;
  onOpenScan: () => void;
  onDeleteRecord: (id: string) => void;
}

// 辅助组件：详情行 (用于显示基本工资、安家费等细则)
const DetailRow: React.FC<{ 
  icon: React.ElementType; 
  label: string; 
  amount: number; 
  colorClass: string; 
  suffix?: React.ReactNode 
}> = ({ icon: Icon, label, amount, colorClass, suffix }) => (
  <div className="flex justify-between items-center py-3 border-b border-gray-50 last:border-0 hover:bg-gray-50/50 transition-colors px-2 rounded-lg">
    <div className="flex items-center gap-3">
      <div className={`p-2 rounded-lg ${colorClass} bg-opacity-10`}>
        <Icon size={16} className={colorClass.replace('bg-', 'text-')} />
      </div>
      <span className="text-sm text-gray-600 font-bold">{label}</span>
    </div>
    <div className="flex items-center gap-2">
      <span className="font-mono font-bold text-gray-800 text-sm">
        {amount > 0 ? '+' : ''}¥{amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
      </span>
      {suffix}
    </div>
  </div>
);

const SalaryPage: React.FC<SalaryPageProps> = ({ salaryRecords, onOpenAdd, onOpenScan, onDeleteRecord }) => {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // 计算年度总收入
  const currentYear = new Date().getFullYear();
  const yearlyTotal = salaryRecords
    .filter(r => r.date.startsWith(currentYear.toString()))
    .reduce((sum, r) => sum + r.total, 0);

  // 按日期降序排列 (最新的月份在最上面)
  const sortedRecords = [...salaryRecords].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="pb-32"> {/* 底部留白，防止被悬浮按钮遮挡 */}
      
      {/* 顶部总览卡片 */}
      <div className="bg-gradient-to-br from-indigo-900 to-indigo-700 pt-12 pb-20 px-6 rounded-b-[2.5rem] shadow-xl text-white relative overflow-hidden">
        {/* 背景装饰 */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-white opacity-5 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl pointer-events-none"></div>
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-indigo-400 opacity-10 rounded-full translate-y-1/2 -translate-x-1/4 blur-3xl pointer-events-none"></div>
        
        <div className="relative z-10 animate-fadeIn">
          <div className="flex items-center gap-2 mb-3 opacity-80">
            <div className="bg-white/20 p-1.5 rounded-lg backdrop-blur-sm">
              <Calendar size={14} className="text-white" />
            </div>
            <span className="text-xs font-bold tracking-widest uppercase text-indigo-100">{currentYear} 年度总薪资</span>
          </div>
          <h1 className="text-5xl font-mono font-bold tracking-tight text-white drop-shadow-sm">
            <span className="text-2xl mr-2 opacity-80 font-sans">¥</span>
            {yearlyTotal.toLocaleString()}
          </h1>
          <p className="text-indigo-200 text-xs mt-3 font-medium flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse"></span>
            包含所有工资、奖金及额外补贴
          </p>
        </div>
      </div>

      {/* 记录列表区域 */}
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
            
            return (
              <div 
                key={record.id} 
                className={`bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden transition-all duration-300 animate-slideUp ${isExpanded ? 'shadow-xl ring-1 ring-indigo-50 scale-[1.02]' : 'hover:shadow-md'}`}
              >
                {/* 卡片头部 (点击展开/收起) */}
                <div 
                  onClick={() => setExpandedId(isExpanded ? null : record.id)}
                  className="p-5 flex justify-between items-center cursor-pointer bg-white relative overflow-hidden group"
                >
                  {/* 点击波纹效果容器 */}
                  <div className={`absolute inset-0 bg-indigo-50 transition-opacity duration-300 ${isExpanded ? 'opacity-100' : 'opacity-0 group-hover:opacity-30'}`}></div>

                  <div className="flex items-center gap-4 relative z-10">
                    {/* 日期方块 */}
                    <div className={`flex flex-col items-center justify-center w-14 h-14 rounded-2xl font-bold transition-all duration-300 border ${
                      isExpanded 
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-lg shadow-indigo-200' 
                        : 'bg-white text-gray-700 border-gray-200 shadow-sm'
                    }`}>
                      <span className="text-[10px] opacity-80">{year}</span>
                      <span className="text-xl leading-none">{parseInt(month)}<span className="text-[10px] ml-0.5">月</span></span>
                    </div>
                    
                    {/* 标题与总额 */}
                    <div>
                      <h3 className={`font-bold text-lg font-mono transition-colors ${isExpanded ? 'text-indigo-900' : 'text-gray-800'}`}>
                        ¥ {record.total.toLocaleString()}
                      </h3>
                      <p className="text-xs text-gray-400 mt-1 flex items-center gap-1.5 font-medium">
                        {record.remark ? (
                          <span className="truncate max-w-[150px]">{record.remark}</span>
                        ) : (
                          <span className="opacity-50">无备注</span>
                        )}
                        {/* 简略标签 */}
                        {record.monthlyBonus > 0 && <span className="bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded text-[9px]">奖金</span>}
                        {record.extraIncome > 0 && <span className="bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded text-[9px]">额外</span>}
                      </p>
                    </div>
                  </div>

                  {/* 展开箭头 */}
                  <div className={`relative z-10 p-2 rounded-full transition-all duration-300 ${isExpanded ? 'bg-white text-indigo-600 rotate-180 shadow-sm' : 'text-gray-400 bg-transparent'}`}>
                    <ChevronDown size={20} />
                  </div>
                </div>

                {/* 抽屉详情 (展开显示) */}
                <div 
                  className={`transition-all duration-300 ease-in-out bg-white border-t border-gray-50 px-5 overflow-hidden ${
                    isExpanded ? 'max-h-[600px] opacity-100 py-4' : 'max-h-0 opacity-0 py-0'
                  }`}
                >
                  <div className="space-y-1">
                    <DetailRow 
                      icon={Briefcase} 
                      label="基本工资" 
                      amount={record.basicSalary} 
                      colorClass="bg-blue-500" 
                    />
                    
                    {(record.settlingInAllowance > 0) && (
                      <DetailRow 
                        icon={Home} 
                        label="安家费" 
                        amount={record.settlingInAllowance} 
                        colorClass="bg-green-500" 
                      />
                    )}
                    
                    {(record.extraIncome > 0) && (
                      <DetailRow 
                        icon={Rocket} 
                        label="额外收入" 
                        amount={record.extraIncome} 
                        colorClass="bg-purple-500" 
                      />
                    )}
                    
                    <DetailRow 
                      icon={record.subsidyType === 'card' ? CreditCard : Banknote} 
                      label="每月补贴" 
                      amount={record.subsidy} 
                      colorClass="bg-orange-500" 
                      suffix={
                        <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold border ${
                          record.subsidyType === 'card' 
                            ? 'bg-blue-50 text-blue-600 border-blue-100' 
                            : 'bg-green-50 text-green-600 border-green-100'
                        }`}>
                          {record.subsidyType === 'card' ? '购物卡' : '现金'}
                        </span>
                      }
                    />
                    
                    {(record.monthlyBonus > 0) && (
                      <DetailRow 
                        icon={Trophy} 
                        label="每月奖金" 
                        amount={record.monthlyBonus} 
                        colorClass="bg-yellow-500" 
                      />
                    )}
                  </div>
                  
                  {/* 底部操作栏 */}
                  <div className="mt-5 pt-4 border-t border-gray-100 flex justify-end">
                    <button 
                      onClick={(e) => { e.stopPropagation(); onDeleteRecord(record.id); }}
                      className="group flex items-center gap-2 text-xs text-red-500 px-4 py-2 rounded-xl hover:bg-red-50 transition-all font-bold active:scale-95"
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

      {/* 悬浮操作按钮 (Floating Action Bar) */}
      <div className="fixed bottom-24 left-0 right-0 flex justify-center z-40 pointer-events-none">
        <div className="pointer-events-auto bg-gray-900 text-white rounded-full shadow-2xl shadow-indigo-200/50 flex items-center p-1.5 px-6 gap-0 backdrop-blur-xl hover:scale-105 transition duration-300 border border-white/10">
          <button 
            onClick={onOpenAdd} 
            className="flex items-center gap-2 font-bold text-sm sm:text-base py-2.5 px-4 active:opacity-70 group"
          >
            <div className="bg-indigo-500 p-1 rounded-full group-hover:bg-indigo-400 transition-colors">
              <Plus size={14} className="text-white" />
            </div>
            <span>记一笔</span>
          </button>
          
          <div className="w-px h-6 bg-gray-700 mx-2"></div>
          
          <button 
            onClick={onOpenScan} 
            className="flex items-center gap-2 font-bold text-sm sm:text-base py-2.5 px-4 active:opacity-70 group"
          >
            <div className="bg-indigo-500 p-1 rounded-full group-hover:bg-indigo-400 transition-colors">
              <Camera size={14} className="text-white" />
            </div>
            <span>AI 识别</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default SalaryPage;

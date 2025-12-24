{
type: uploaded file
fileName: gui-wei/asset-manager-v2/Asset-Manager-v2-main/src/pages/SalaryPage.tsx
fullContent:
import React, { useState } from 'react';
import { 
  Plus, Camera, ChevronDown, ChevronUp, Briefcase, 
  Home, Rocket, CreditCard, Banknote, Trophy, FileText, Calendar 
} from 'lucide-react';
import { SalaryRecord } from '../../types';

interface SalaryPageProps {
  salaryRecords: SalaryRecord[];
  onOpenAdd: () => void;
  onOpenScan: () => void;
  onDeleteRecord: (id: string) => void;
}

// 辅助组件：详情行
const DetailRow: React.FC<{ icon: React.ElementType; label: string; amount: number; colorClass: string; suffix?: React.ReactNode }> = ({ icon: Icon, label, amount, colorClass, suffix }) => (
  <div className="flex justify-between items-center py-2 border-b border-gray-50 last:border-0">
    <div className="flex items-center gap-2">
      <div className={`p-1.5 rounded-lg ${colorClass} bg-opacity-10`}>
        <Icon size={14} className={colorClass.replace('bg-', 'text-')} />
      </div>
      <span className="text-sm text-gray-600 font-medium">{label}</span>
    </div>
    <div className="flex items-center gap-2">
      <span className="font-mono font-bold text-gray-800">¥{amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
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

  // 按日期降序排列
  const sortedRecords = [...salaryRecords].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="pb-24">
      {/* 顶部总览卡片 */}
      <div className="bg-gradient-to-br from-indigo-900 to-indigo-700 pt-12 pb-16 px-6 rounded-b-[2.5rem] shadow-xl text-white relative overflow-hidden">
        <div className="absolute top-0 right-0 w-48 h-48 bg-white opacity-5 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl"></div>
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-2 opacity-80">
            <Calendar size={14} />
            <span className="text-xs font-bold tracking-widest uppercase">{currentYear} 年度总薪资</span>
          </div>
          <h1 className="text-4xl font-mono font-bold tracking-tight">
            <span className="text-2xl mr-1">¥</span>
            {yearlyTotal.toLocaleString()}
          </h1>
          <p className="text-indigo-200 text-xs mt-2 font-medium">包含所有工资、奖金及额外补贴</p>
        </div>
      </div>

      {/* 记录列表 */}
      <div className="px-4 -mt-8 relative z-20 space-y-4">
        {sortedRecords.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 text-center shadow-sm border border-gray-100">
            <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <Banknote className="text-gray-300" size={32} />
            </div>
            <p className="text-gray-400 text-sm">暂无工资记录</p>
            <button onClick={onOpenAdd} className="mt-4 text-indigo-600 text-sm font-bold hover:underline">立即记录第一笔</button>
          </div>
        ) : (
          sortedRecords.map((record) => {
            const isExpanded = expandedId === record.id;
            
            return (
              <div key={record.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden transition-all duration-300">
                {/* 卡片头部 (点击展开) */}
                <div 
                  onClick={() => setExpandedId(isExpanded ? null : record.id)}
                  className={`p-5 flex justify-between items-center cursor-pointer transition-colors ${isExpanded ? 'bg-indigo-50/50' : 'hover:bg-gray-50'}`}
                >
                  <div className="flex items-center gap-4">
                    <div className="flex flex-col items-center justify-center bg-gray-100 rounded-xl w-12 h-12 text-gray-600 font-bold border border-gray-200">
                      <span className="text-xs">{record.date.split('-')[0]}</span>
                      <span className="text-lg leading-none">{record.date.split('-')[1]}<span className="text-[10px]">月</span></span>
                    </div>
                    <div>
                      <h3 className="font-bold text-gray-800">¥ {record.total.toLocaleString()}</h3>
                      <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
                        {record.remark ? record.remark : '无备注'}
                      </p>
                    </div>
                  </div>
                  <div className="text-gray-400">
                    {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                  </div>
                </div>

                {/* 抽屉详情 (展开显示) */}
                <div className={`transition-all duration-300 ease-in-out border-t border-gray-100 bg-white px-5 ${isExpanded ? 'max-h-[500px] py-4 opacity-100' : 'max-h-0 py-0 opacity-0 overflow-hidden'}`}>
                  <div className="space-y-1">
                    <DetailRow icon={Briefcase} label="基本工资" amount={record.basicSalary} colorClass="bg-blue-500" />
                    <DetailRow icon={Home} label="安家费" amount={record.settlingInAllowance} colorClass="bg-green-500" />
                    <DetailRow icon={Rocket} label="额外收入" amount={record.extraIncome} colorClass="bg-purple-500" />
                    <DetailRow 
                      icon={record.subsidyType === 'card' ? CreditCard : Banknote} 
                      label="每月补贴" 
                      amount={record.subsidy} 
                      colorClass="bg-orange-500" 
                      suffix={<span className="text-[10px] px-1.5 py-0.5 bg-gray-100 rounded text-gray-500">{record.subsidyType === 'card' ? '购物卡' : '现金'}</span>}
                    />
                    <DetailRow icon={Trophy} label="每月奖金" amount={record.monthlyBonus} colorClass="bg-yellow-500" />
                  </div>
                  
                  <div className="mt-4 pt-3 border-t border-gray-100 flex justify-end">
                    <button 
                      onClick={(e) => { e.stopPropagation(); onDeleteRecord(record.id); }}
                      className="flex items-center gap-1.5 text-xs text-red-500 px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors font-bold"
                    >
                      <FileText size={14} /> 删除记录
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* 悬浮操作按钮 */}
      <div className="fixed bottom-24 left-0 right-0 flex justify-center z-40 pointer-events-none">
        <div className="pointer-events-auto bg-indigo-600 text-white rounded-full shadow-2xl shadow-indigo-200 flex items-center p-1.5 px-6 gap-0 backdrop-blur-xl hover:scale-105 transition duration-200">
          <button onClick={onOpenAdd} className="flex items-center gap-2 font-bold text-sm sm:text-base py-2 px-4 active:opacity-70">
            <Plus size={18} /> <span>记一笔</span>
          </button>
          <div className="w-px h-5 bg-indigo-400 mx-1 opacity-50"></div>
          <button onClick={onOpenScan} className="flex items-center gap-2 font-bold text-sm sm:text-base py-2 px-4 active:opacity-70">
            <Camera size={18} /> <span>AI 识别</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default SalaryPage;
}

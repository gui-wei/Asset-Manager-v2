import React from 'react';
import { Asset } from '../types';

interface EarningsCalendarProps {
  asset: Asset;
  onClose: () => void;
}

const EarningsCalendar: React.FC<EarningsCalendarProps> = ({ asset, onClose }) => {
  const today = new Date();
  const [currentDate, setCurrentDate] = React.useState(today);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfMonth = new Date(year, month, 1).getDay(); // 0 is Sunday

  const days = [];
  for (let i = 0; i < firstDayOfMonth; i++) {
    days.push(null);
  }
  for (let i = 1; i <= daysInMonth; i++) {
    days.push(i);
  }

  const getEventsForDay = (day: number) => {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const earning = asset.dailyEarnings[dateStr] || 0;
    
    // Calculate total deposits for this day from history
    const deposits = asset.history
      .filter(t => t.type === 'deposit' && t.date === dateStr)
      .reduce((sum, t) => sum + t.amount, 0);

    // Calculate total withdrawals for this day from history
    const withdrawals = asset.history
      .filter(t => t.type === 'withdrawal' && t.date === dateStr)
      .reduce((sum, t) => sum + t.amount, 0);

    return { earning, deposits, withdrawals };
  };

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fadeIn">
      <div className="bg-white rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl">
        <div className="bg-[#07c160] p-4 flex justify-between items-center text-white">
          <h3 className="font-bold text-lg">{asset.productName} 收益日历</h3>
          <button onClick={onClose} className="p-1 hover:bg-white/20 rounded-full transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>
        
        <div className="p-4">
          <div className="flex justify-between items-center mb-4">
            <button onClick={prevMonth} className="p-2 hover:bg-gray-100 rounded-full transition-colors">&lt;</button>
            <span className="font-bold text-gray-800">{year}年 {month + 1}月</span>
            <button onClick={nextMonth} className="p-2 hover:bg-gray-100 rounded-full transition-colors">&gt;</button>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center mb-2">
            {['日', '一', '二', '三', '四', '五', '六'].map(d => (
              <div key={d} className="text-xs text-gray-400 font-medium">{d}</div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {days.map((day, idx) => {
              if (!day) return <div key={`empty-${idx}`} />;
              const { earning, deposits, withdrawals } = getEventsForDay(day);
              
              const hasEarning = earning !== 0;
              const hasDeposit = deposits > 0;
              const hasWithdrawal = withdrawals > 0;
              
              return (
                <div key={day} className="flex flex-col items-center justify-start pt-1 h-14 rounded-lg bg-gray-50 border border-gray-100 relative overflow-hidden group hover:border-blue-200 transition-colors">
                  <span className="text-[10px] font-medium text-gray-400 mb-0.5 group-hover:text-blue-500">{day}</span>
                  
                  {/* Earnings (Red for positive, Green for negative) */}
                  {hasEarning && (
                     <span className={`text-[9px] font-bold leading-tight tracking-tighter ${earning > 0 ? 'text-red-500' : 'text-green-600'}`}>
                       {earning > 0 ? '' : ''}{Math.abs(earning).toFixed(0)}
                     </span>
                  )}

                  {/* Deposits (Blue) */}
                  {hasDeposit && (
                     <span className="text-[9px] font-bold text-blue-500 leading-tight tracking-tighter">
                       +{deposits.toLocaleString(undefined, {maximumFractionDigits:0})}
                     </span>
                  )}

                  {/* Withdrawals (Orange) - New Feature */}
                  {hasWithdrawal && (
                     <span className="text-[9px] font-bold text-orange-500 leading-tight tracking-tighter">
                       -{withdrawals.toLocaleString(undefined, {maximumFractionDigits:0})}
                     </span>
                  )}
                </div>
              );
            })}
          </div>
          
          <div className="mt-4 flex gap-3 justify-center text-[10px] text-gray-500 pt-3 border-t border-gray-100">
             <div className="flex items-center gap-1">
               <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span> 收益
             </div>
             <div className="flex items-center gap-1">
               <span className="w-1.5 h-1.5 rounded-full bg-green-600"></span> 亏损
             </div>
             <div className="flex items-center gap-1">
               <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span> 存入
             </div>
             {/* 新增图例 */}
             <div className="flex items-center gap-1">
               <span className="w-1.5 h-1.5 rounded-full bg-orange-500"></span> 赎回
             </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EarningsCalendar;

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

    return { earning, deposits };
  };

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fadeIn">
      <div className="bg-white rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl">
        <div className="bg-wechat-green p-4 flex justify-between items-center text-white">
          <h3 className="font-bold text-lg">{asset.productName} 收益日历</h3>
          <button onClick={onClose} className="p-1 hover:bg-white/20 rounded-full">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>
        
        <div className="p-4">
          <div className="flex justify-between items-center mb-4">
            <button onClick={prevMonth} className="p-2 hover:bg-gray-100 rounded-full">&lt;</button>
            <span className="font-bold text-gray-800">{year}年 {month + 1}月</span>
            <button onClick={nextMonth} className="p-2 hover:bg-gray-100 rounded-full">&gt;</button>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center mb-2">
            {['日', '一', '二', '三', '四', '五', '六'].map(d => (
              <div key={d} className="text-xs text-gray-400">{d}</div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {days.map((day, idx) => {
              if (!day) return <div key={`empty-${idx}`} />;
              const { earning, deposits } = getEventsForDay(day);
              
              const hasEarning = earning !== 0;
              const hasDeposit = deposits > 0;
              
              return (
                <div key={day} className="flex flex-col items-center justify-start pt-1 h-14 rounded-lg bg-gray-50 border border-gray-100 relative overflow-hidden">
                  <span className="text-[10px] font-medium text-gray-400 mb-0.5">{day}</span>
                  
                  {/* Earnings (Red for positive) */}
                  {hasEarning && (
                     <span className={`text-[9px] font-bold leading-tight ${earning > 0 ? 'text-red-500' : 'text-green-600'}`}>
                       {earning > 0 ? '+' : ''}{earning}
                     </span>
                  )}

                  {/* Deposits (Green as requested) */}
                  {hasDeposit && (
                     <span className="text-[9px] font-bold text-green-600 leading-tight">
                       +{deposits}
                     </span>
                  )}
                </div>
              );
            })}
          </div>
          
          <div className="mt-4 flex gap-4 justify-center text-xs text-gray-500">
             <div className="flex items-center gap-1">
               <span className="w-2 h-2 rounded-full bg-red-500"></span> 收益
             </div>
             <div className="flex items-center gap-1">
               <span className="w-2 h-2 rounded-full bg-green-600"></span> 存入记录
             </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EarningsCalendar;
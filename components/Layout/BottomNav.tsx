import React from 'react';
import { Wallet, TrendingUp, User, Banknote } from 'lucide-react';

interface BottomNavProps {
  activeTab: 'invest' | 'salary' | 'analysis' | 'me';
  onChange: (tab: 'invest' | 'salary' | 'analysis' | 'me') => void;
}

const BottomNav: React.FC<BottomNavProps> = ({ activeTab, onChange }) => {
  const navItems = [
    { id: 'invest', label: '投资', icon: Wallet },
    { id: 'salary', label: '薪资', icon: Banknote }, // Changed from NotebookPen to Banknote for Salary
    { id: 'analysis', label: '分析', icon: TrendingUp },
    { id: 'me', label: '我的', icon: User },
  ] as const;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-white/90 backdrop-blur-xl border-t border-gray-200 pb-safe pt-2 px-6 shadow-[0_-5px_20px_rgba(0,0,0,0.03)]">
      <div className="flex justify-between items-center max-w-md mx-auto">
        {navItems.map((item) => {
          const isActive = activeTab === item.id;
          const Icon = item.icon;
          
          // @ts-ignore
          const handleClick = () => onChange(item.id);

          return (
            <button
              key={item.id}
              onClick={handleClick}
              className={`group flex flex-col items-center justify-center w-16 py-1 transition-all duration-300 relative ${
                isActive ? 'scale-105' : 'opacity-60 hover:opacity-100'
              }`}
            >
              <div className={`
                p-2 rounded-2xl mb-1 transition-all duration-300 relative
                ${isActive ? 'bg-indigo-600 text-white shadow-lg -translate-y-1' : 'text-gray-600 group-hover:bg-gray-100'}
              `}>
                <Icon size={isActive ? 22 : 24} strokeWidth={isActive ? 2.5 : 2} />
              </div>
              <span className={`text-[10px] font-bold tracking-wide transition-colors duration-300 ${isActive ? 'text-indigo-900' : 'text-gray-500'}`}>
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default BottomNav;
}

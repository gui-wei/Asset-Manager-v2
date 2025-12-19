import React from 'react';
import { Wallet, TrendingUp, Sparkles, User } from 'lucide-react';

interface BottomNavProps {
  activeTab: 'assets' | 'analysis' | 'ai' | 'me';
  onChange: (tab: 'assets' | 'analysis' | 'ai' | 'me') => void;
}

const BottomNav: React.FC<BottomNavProps> = ({ activeTab, onChange }) => {
  const navItems = [
    { id: 'assets', label: '资产', icon: Wallet },
    { id: 'analysis', label: '趋势', icon: TrendingUp },
    { id: 'ai', label: 'AI', icon: Sparkles },
    { id: 'me', label: '我的', icon: User },
  ] as const;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-lg border-t border-gray-200 pb-safe pt-2 px-6 shadow-lg">
      <div className="flex justify-between items-center max-w-md mx-auto">
        {navItems.map((item) => {
          const isActive = activeTab === item.id;
          const Icon = item.icon;
          
          return (
            <button
              key={item.id}
              onClick={() => onChange(item.id)}
              className={`flex flex-col items-center justify-center w-16 py-1 transition-all duration-300 ${
                isActive ? 'scale-105' : 'opacity-50 hover:opacity-75'
              }`}
            >
              <div className={`
                p-1.5 rounded-xl mb-1 transition-colors duration-300
                ${isActive ? 'bg-gray-900 text-white shadow-md' : 'text-gray-600'}
              `}>
                <Icon size={isActive ? 20 : 22} strokeWidth={isActive ? 2.5 : 2} />
              </div>
              <span className={`text-[10px] font-bold ${isActive ? 'text-gray-900' : 'text-gray-500'}`}>
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

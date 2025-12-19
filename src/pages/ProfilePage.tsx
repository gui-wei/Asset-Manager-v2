import React from 'react';
import { User, LogOut, Settings, Shield } from 'lucide-react';

interface ProfilePageProps {
  user: any; // User type
  onLogout: () => void;
}

const ProfilePage: React.FC<ProfilePageProps> = ({ user, onLogout }) => {
  return (
    <div className="px-6 pt-4">
      <div className="bg-white rounded-2xl p-6 shadow-sm mb-6 flex items-center gap-4">
        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center">
          <User size={32} className="text-gray-400" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-gray-900">当前用户</h2>
          <p className="text-xs text-gray-500 font-mono mt-1">{user?.isAnonymous ? '匿名用户' : user?.email}</p>
        </div>
      </div>

      <div className="space-y-3">
        <button className="w-full bg-white p-4 rounded-xl flex items-center gap-3 shadow-sm active:scale-95 transition-all">
          <Settings size={20} className="text-gray-600" />
          <span className="text-sm font-bold text-gray-700">通用设置</span>
        </button>
        <button className="w-full bg-white p-4 rounded-xl flex items-center gap-3 shadow-sm active:scale-95 transition-all">
          <Shield size={20} className="text-gray-600" />
          <span className="text-sm font-bold text-gray-700">隐私与安全</span>
        </button>
        <button onClick={onLogout} className="w-full bg-red-50 p-4 rounded-xl flex items-center gap-3 shadow-sm active:scale-95 transition-all mt-8">
          <LogOut size={20} className="text-red-500" />
          <span className="text-sm font-bold text-red-500">退出登录</span>
        </button>
      </div>
    </div>
  );
};

export default ProfilePage;

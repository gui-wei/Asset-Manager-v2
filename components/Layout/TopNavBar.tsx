import React from 'react';
import { Eye, EyeOff, Camera } from 'lucide-react';

interface TopNavBarProps {
  title: string;
  privacyMode: boolean;
  onTogglePrivacy: () => void;
  onScan: () => void;
}

const TopNavBar: React.FC<TopNavBarProps> = ({ title, privacyMode, onTogglePrivacy, onScan }) => {
  return (
    <header className="sticky top-0 z-40 bg-[#ededed]/90 backdrop-blur-md px-6 pt-12 pb-4 flex justify-between items-end">
      {/* 左侧：大标题 */}
      <div>
        <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight leading-none">
          {title}
        </h1>
        {/* 这里预留放“上次更新时间”或“二级标题”的空间 */}
        {/* <p className="text-[10px] text-gray-400 font-bold mt-1">TOTAL VALUATION</p> */}
      </div>

      {/* 右侧：功能按钮组 */}
      <div className="flex items-center gap-3">
        {/* 隐私模式开关 */}
        <button 
          onClick={onTogglePrivacy}
          className="w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-sm border border-gray-100 text-gray-600 hover:bg-gray-50 active:scale-95 transition-all"
          aria-label={privacyMode ? "显示金额" : "隐藏金额"}
        >
          {privacyMode ? <EyeOff size={20} /> : <Eye size={20} />}
        </button>

        {/* 扫一扫快捷入口 */}
        <button 
          onClick={onScan}
          className="w-10 h-10 bg-gray-900 rounded-full flex items-center justify-center shadow-lg text-white hover:bg-black active:scale-95 transition-all"
          aria-label="AI 识别"
        >
          <Camera size={20} />
        </button>
      </div>
    </header>
  );
};

export default TopNavBar;

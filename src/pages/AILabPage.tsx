import React from 'react';

const AILabPage = () => {
  return (
    <div className="flex flex-col items-center justify-center h-[60vh] text-center px-6">
      <div className="w-20 h-20 bg-purple-50 rounded-full flex items-center justify-center mb-6 animate-pulse">
        <span className="text-4xl">🤖</span>
      </div>
      <h2 className="text-xl font-bold text-gray-800 mb-2">AI 实验室</h2>
      <p className="text-gray-500 text-sm">Gemini 智能顾问即将上线。<br/>支持自然语言查账、持仓风险诊断等高级功能。</p>
    </div>
  );
};

export default AILabPage;

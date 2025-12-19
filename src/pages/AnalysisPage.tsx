import React from 'react';

const AnalysisPage = () => {
  return (
    <div className="flex flex-col items-center justify-center h-[60vh] text-center px-6">
      <div className="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center mb-6">
        <span className="text-4xl">📈</span>
      </div>
      <h2 className="text-xl font-bold text-gray-800 mb-2">资产趋势分析</h2>
      <p className="text-gray-500 text-sm">这里将展示您的净值走势图、收益热力图和资产配置建议。</p>
      <div className="mt-8 p-4 bg-yellow-50 rounded-xl border border-yellow-100 text-yellow-700 text-xs font-bold">
        🚧 功能开发中
      </div>
    </div>
  );
};

export default AnalysisPage;

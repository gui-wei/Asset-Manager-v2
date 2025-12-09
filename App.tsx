
import React, { useState, useEffect, useRef } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { Plus, Scan, ChevronDown, HelpCircle, History, Calendar, Wallet, Pencil, X, TrendingUp, RefreshCw, Camera, Trash2, Settings, AlertTriangle, Sparkles } from 'lucide-react';
import { Asset, AssetType, Transaction, Currency } from './types';
import * as storage from './services/storage';
import * as gemini from './services/gemini';
import SmartInput from './components/SmartInput';
import EarningsCalendar from './components/EarningsCalendar';

const COLORS = ['#3b82f6', '#fbbf24', '#a855f7', '#f87171']; // Blue, Gold, Purple

// Exchange rates relative to CNY
const RATES: Record<Currency, number> = {
  CNY: 1,
  USD: 7.2,
  HKD: 0.92
};

// --- Helper Functions ---

const recalculateAsset = (asset: Asset): Asset => {
  let currentAmount = 0;
  let totalEarnings = 0;
  const dailyEarnings: Record<string, number> = {};

  // Sort history by date descending
  const sortedHistory = [...asset.history].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  sortedHistory.forEach(t => {
    currentAmount += t.amount;
    
    if (t.type === 'earning') {
      totalEarnings += t.amount;
      const date = t.date;
      dailyEarnings[date] = (dailyEarnings[date] || 0) + t.amount;
    }
  });

  return {
    ...asset,
    currentAmount,
    totalEarnings,
    dailyEarnings,
    history: sortedHistory
  };
};

const consolidateAssets = (assets: Asset[]): Asset[] => {
  const uniqueMap = new Map<string, Asset>();
  
  assets.forEach(asset => {
     // Normalize key
     const key = `${asset.productName.trim()}|${asset.currency}`;
     
     if (uniqueMap.has(key)) {
        const existing = uniqueMap.get(key)!;
        
        // Merge histories
        const mergedHistory = [...existing.history, ...asset.history];
        
        // Remove exact duplicates in history (same date, type, amount)
        const seenTx = new Set<string>();
        const distinctHistory: Transaction[] = [];
        mergedHistory.forEach(tx => {
           const sig = `${tx.date}|${tx.type}|${tx.amount.toFixed(2)}`;
           if (!seenTx.has(sig)) {
              seenTx.add(sig);
              distinctHistory.push(tx);
           }
        });
        existing.history = distinctHistory;

        // Update Institution: prefer the one that isn't "Unknown" or "未命名"
        const isExistingGeneric = !existing.institution || existing.institution === '未命名渠道' || existing.institution === 'Auto-created';
        const isNewSpecific = asset.institution && asset.institution !== '未命名渠道';
        
        if (isExistingGeneric && isNewSpecific) {
            existing.institution = asset.institution;
        }

        // Keep the merged asset
        uniqueMap.set(key, existing);
     } else {
        uniqueMap.set(key, asset);
     }
  });

  // Recalculate totals for all consolidated assets
  return Array.from(uniqueMap.values()).map(recalculateAsset);
};

// --- Components ---

// Edit Asset Info Modal
const EditAssetInfoModal: React.FC<{
  asset: Asset;
  onSave: (asset: Asset) => void;
  onClose: () => void;
}> = ({ asset, onSave, onClose }) => {
  // Use local state with strings for numbers to allow smooth decimal typing
  const [formData, setFormData] = useState({
    institution: asset.institution,
    productName: asset.productName,
    type: asset.type,
    currency: asset.currency,
    sevenDayYield: asset.sevenDayYield?.toString() || '',
    remark: asset.remark || ''
  });

  const handleSave = () => {
    onSave({
      ...asset,
      institution: formData.institution,
      productName: formData.productName,
      type: formData.type,
      currency: formData.currency,
      sevenDayYield: parseFloat(formData.sevenDayYield) || 0,
      remark: formData.remark
    });
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fadeIn">
      <div className="bg-white w-full max-w-md rounded-2xl p-6 shadow-2xl animate-slideUp">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-lg font-bold text-gray-800">修改资产信息</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-full">
            <X size={20} className="text-gray-400" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-gray-500 text-xs font-bold mb-1.5">投资渠道</label>
            <input
              type="text"
              className="w-full bg-gray-50 border border-gray-200 rounded-xl py-3 px-3 text-sm font-bold text-gray-800 outline-none focus:ring-2 focus:ring-blue-500"
              value={formData.institution}
              onChange={(e) => setFormData({ ...formData, institution: e.target.value })}
            />
          </div>

          <div>
            <label className="block text-gray-500 text-xs font-bold mb-1.5">产品名称</label>
            <input
              type="text"
              className="w-full bg-gray-50 border border-gray-200 rounded-xl py-3 px-3 text-sm font-bold text-gray-800 outline-none focus:ring-2 focus:ring-blue-500"
              value={formData.productName}
              onChange={(e) => setFormData({ ...formData, productName: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-gray-500 text-xs font-bold mb-1.5">资产类型</label>
              <select
                className="w-full bg-gray-50 border border-gray-200 rounded-xl py-3 px-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none appearance-none"
                value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value as AssetType })}
              >
                <option value={AssetType.FUND}>基金</option>
                <option value={AssetType.GOLD}>黄金</option>
                <option value={AssetType.OTHER}>其他</option>
              </select>
            </div>
            <div>
              <label className="block text-gray-500 text-xs font-bold mb-1.5">货币种类</label>
              <select
                className="w-full bg-gray-50 border border-gray-200 rounded-xl py-3 px-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none appearance-none font-bold"
                value={formData.currency}
                onChange={(e) => setFormData({ ...formData, currency: e.target.value as Currency })}
              >
                <option value="CNY">CNY (人民币)</option>
                <option value="USD">USD (美元)</option>
                <option value="HKD">HKD (港币)</option>
              </select>
            </div>
          </div>

          <div className="flex gap-4">
             <div className="flex-1">
                <label className="block text-gray-500 text-xs font-bold mb-1.5">年化 (%)</label>
                <input
                  type="number"
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl py-3 px-3 text-sm"
                  value={formData.sevenDayYield}
                  onChange={(e) => setFormData({ ...formData, sevenDayYield: e.target.value })}
                />
             </div>
             <div className="flex-[2]">
                <label className="block text-gray-500 text-xs font-bold mb-1.5">备注</label>
                <input
                  type="text"
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl py-3 px-3 text-sm"
                  value={formData.remark}
                  onChange={(e) => setFormData({ ...formData, remark: e.target.value })}
                />
             </div>
          </div>
        </div>

        <div className="flex gap-3 mt-8">
          <button
            onClick={onClose}
            className="flex-1 py-3.5 rounded-xl bg-gray-100 text-gray-600 font-bold text-sm"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            className="flex-1 py-3.5 rounded-xl bg-gray-900 text-white font-bold text-sm shadow-lg active:scale-95 transition"
          >
            保存修改
          </button>
        </div>
      </div>
    </div>
  );
};

// Edit Transaction Modal Component
const EditTransactionModal: React.FC<{ 
  transaction: Transaction, 
  onSave: (t: Transaction) => void, 
  onDelete: () => void,
  onClose: () => void 
}> = ({ transaction, onSave, onDelete, onClose }) => {
  const [date, setDate] = useState(transaction.date);
  const [amountStr, setAmountStr] = useState(transaction.amount.toString());
  const [description, setDescription] = useState(transaction.description || '');

  const handleSave = () => {
    onSave({
      ...transaction,
      date,
      amount: parseFloat(amountStr) || 0,
      description
    });
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fadeIn">
      <div className="bg-white w-full max-w-xs rounded-2xl p-6 shadow-2xl">
         <div className="flex justify-between items-center mb-6">
           <h3 className="font-bold text-lg text-gray-800">编辑记录</h3>
           <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-full"><X size={20} className="text-gray-400" /></button>
         </div>

         <div className="space-y-4">
            <div>
              <label className="text-xs text-gray-500 font-bold block mb-1.5">日期</label>
              <input 
                type="date" 
                className="w-full bg-gray-50 border border-gray-200 rounded-lg p-2.5 text-sm" 
                value={date}
                onChange={e => setDate(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 font-bold block mb-1.5">金额</label>
              <input 
                type="number" 
                className="w-full bg-gray-50 border border-gray-200 rounded-lg p-2.5 text-sm font-bold" 
                value={amountStr}
                onChange={e => setAmountStr(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 font-bold block mb-1.5">备注</label>
              <input 
                type="text" 
                className="w-full bg-gray-50 border border-gray-200 rounded-lg p-2.5 text-sm" 
                value={description}
                onChange={e => setDescription(e.target.value)}
              />
            </div>
         </div>

         <div className="flex gap-3 mt-8">
            <button onClick={onDelete} className="flex-1 py-2.5 bg-red-50 text-red-500 text-sm font-bold rounded-lg hover:bg-red-100 transition">删除</button>
            <button onClick={handleSave} className="flex-1 py-2.5 bg-gray-900 text-white text-sm font-bold rounded-lg hover:bg-black transition">保存</button>
         </div>
      </div>
    </div>
  );
};

// Sub-component for Asset Item (Drawer style)
const AssetItem: React.FC<{ 
  asset: Asset, 
  onEditTransaction: (tx: Transaction) => void,
  onDelete: (id: string) => void,
  onEditInfo: () => void,
  onDirectAIScan: () => void
}> = ({ asset, onEditTransaction, onDelete, onEditInfo, onDirectAIScan }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  
  const currencySymbol = asset.currency === 'USD' ? '$' : asset.currency === 'HKD' ? 'HK$' : '¥';

  return (
    <>
      <div className="transition-all duration-300">
        {/* Main Card */}
        <div 
          onClick={() => setIsOpen(!isOpen)}
          className="p-5 flex justify-between items-center cursor-pointer hover:bg-gray-50 transition"
        >
          {/* Left Side: flex-1 ensures it takes available space, min-w-0 allows truncation */}
          <div className="flex items-center gap-3 flex-1 min-w-0 pr-2">
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-white font-bold text-sm shadow-md shrink-0
              ${asset.type === AssetType.FUND ? 'bg-gradient-to-br from-blue-400 to-blue-600' : asset.type === AssetType.GOLD ? 'bg-gradient-to-br from-yellow-400 to-yellow-600' : 'bg-gradient-to-br from-purple-400 to-purple-600'}`}>
              {asset.type === AssetType.FUND ? '基' : asset.type === AssetType.GOLD ? '金' : '其'}
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-bold text-gray-800 text-base break-words leading-tight">{asset.productName}</h3>
              <p className="text-xs text-gray-400 mt-0.5 truncate">
                {asset.sevenDayYield ? `七日年化 ${asset.sevenDayYield}%` : asset.remark || '无备注'} · {asset.currency}
              </p>
            </div>
          </div>

          {/* Right Side: shrink-0 ensures it doesn't get squashed */}
          <div className="flex items-center gap-3 shrink-0">
             <div className="text-right">
              <p className="font-bold text-gray-900 text-lg font-mono tracking-tight leading-tight">
                {currencySymbol} {asset.currentAmount.toLocaleString()}
              </p>
              <p className={`text-xs font-bold ${asset.totalEarnings >= 0 ? 'text-red-500' : 'text-green-500'}`}>
                {asset.totalEarnings >= 0 ? '+' : ''}{currencySymbol} {asset.totalEarnings.toLocaleString()}
              </p>
            </div>
          </div>
        </div>

        {/* Drawer Content */}
        <div className={`overflow-hidden transition-all duration-300 ease-in-out bg-gray-50 border-t border-gray-100 ${isOpen ? 'max-h-[1000px] opacity-100' : 'max-h-0 opacity-0'}`}>
          <div className="p-4">
            <div className="flex justify-between items-center mb-3 px-1">
              <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                 <History size={14} /> 资金明细
              </h4>
              <div className="flex items-center gap-2">
                  <button 
                    onClick={(e) => { e.stopPropagation(); onDirectAIScan(); }}
                    className="text-xs bg-indigo-50 border border-indigo-100 px-3 py-1.5 rounded-full text-indigo-600 flex items-center gap-1.5 hover:bg-indigo-100 font-bold shadow-sm"
                  >
                    <Sparkles size={12} /> AI 录入
                  </button>
                  <button 
                    onClick={(e) => { e.stopPropagation(); setShowCalendar(true); }}
                    className="text-xs bg-white border border-gray-200 px-3 py-1.5 rounded-full text-gray-600 flex items-center gap-1.5 hover:bg-gray-100 font-medium shadow-sm"
                  >
                    <Calendar size={14} className="text-blue-500"/> 查看日历
                  </button>
              </div>
            </div>
            
            <div className="space-y-3 max-h-56 overflow-y-auto pr-1 custom-scrollbar">
              {asset.history.length === 0 ? (
                 <p className="text-center text-xs text-gray-400 py-4">暂无记录</p>
              ) : (
                asset.history.map(record => (
                  <div key={record.id} className="flex justify-between items-center text-sm bg-white p-3 rounded-lg shadow-sm border border-gray-100">
                    <div className="flex items-center gap-3">
                      <div className={`w-1.5 h-1.5 rounded-full ${record.type === 'deposit' ? 'bg-green-500' : 'bg-red-500'}`}></div>
                      <span className="text-gray-400 text-xs">{record.date}</span>
                      <span className="text-gray-700 font-medium truncate max-w-[80px] sm:max-w-[120px]">{record.description}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`font-mono font-bold ${record.type === 'earning' ? 'text-red-500' : 'text-green-600'}`}>
                        {record.type === 'earning' ? '+' : ''}{record.amount}
                      </span>
                      <button 
                        onClick={(e) => { e.stopPropagation(); onEditTransaction(record); }}
                        className="p-1.5 text-gray-300 hover:text-blue-500 hover:bg-blue-50 rounded transition"
                      >
                          <Pencil size={14} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Asset Actions (Edit & Delete) */}
            <div className="mt-4 pt-3 border-t border-gray-100 flex gap-2">
               <button 
                  onClick={(e) => { 
                    e.preventDefault(); 
                    e.stopPropagation(); 
                    e.nativeEvent.stopImmediatePropagation();
                    onEditInfo(); 
                  }}
                  className="flex-1 flex items-center justify-center gap-1.5 text-xs text-blue-500 hover:text-blue-600 transition-colors py-2 rounded-lg hover:bg-blue-50 font-bold bg-blue-50/50 cursor-pointer"
               >
                  <Settings size={14} />
                  <span>修改信息</span>
               </button>
               <button 
                  type="button"
                  onClick={(e) => { 
                    e.preventDefault();
                    e.stopPropagation();
                    e.nativeEvent.stopImmediatePropagation(); // Ensure click isn't swallowed
                    onDelete(asset.id); 
                  }}
                  className="flex-1 flex items-center justify-center gap-1.5 text-xs text-gray-400 hover:text-red-500 transition-colors py-2 rounded-lg hover:bg-red-50 cursor-pointer"
               >
                  <Trash2 size={14} />
                  <span>删除资产</span>
               </button>
            </div>

          </div>
        </div>
      </div>

      {showCalendar && (
        <EarningsCalendar asset={asset} onClose={() => setShowCalendar(false)} />
      )}
    </>
  );
};

export default function App() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showAIModal, setShowAIModal] = useState(false); 
  const [showDirectScanModal, setShowDirectScanModal] = useState(false); // New modal for direct scan
  const [showGuide, setShowGuide] = useState(false);
  const [isProcessingAI, setIsProcessingAI] = useState(false);
  
  // Currency State
  const [dashboardCurrency, setDashboardCurrency] = useState<Currency>('CNY');
  
  // AI Scan State
  const [targetAssetId, setTargetAssetId] = useState<string>('auto'); // 'auto' for smart match
  const [manualInstitution, setManualInstitution] = useState(''); // Manual override for institution
  const [manualCurrency, setManualCurrency] = useState<Currency | ''>(''); // Manual override for currency
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Edit Transaction State
  const [editingTransaction, setEditingTransaction] = useState<{ assetId: string, transaction: Transaction } | null>(null);

  // Edit Asset Info State
  const [editingAssetInfo, setEditingAssetInfo] = useState<Asset | null>(null);

  // Delete Asset State
  const [confirmDeleteAssetId, setConfirmDeleteAssetId] = useState<string | null>(null);

  // New Asset Form State
  const [newAsset, setNewAsset] = useState<{
    institution: string;
    productName: string;
    type: AssetType;
    currency: Currency;
    amount: string;
    date: string; // YYYY-MM-DD
    yield: string;
    remark: string;
  }>({
    institution: '',
    productName: '',
    type: AssetType.FUND,
    currency: 'CNY',
    amount: '',
    date: new Date().toISOString().split('T')[0],
    yield: '',
    remark: ''
  });

  // Load data on mount and consolidate
  useEffect(() => {
    const loaded = storage.getAssets();
    // Normalize currencies
    const normalized = loaded.map(a => ({ ...a, currency: a.currency || 'CNY' }));
    
    // Automatically consolidate duplicates (same name + currency)
    const consolidated = consolidateAssets(normalized);
    
    setAssets(consolidated);
  }, []);

  // Save data on change
  useEffect(() => {
    storage.saveAssets(assets);
  }, [assets]);

  // Currency Conversion Helper
  const convertToDashboard = (amount: number, fromCurrency: Currency) => {
    const amountInCNY = amount * RATES[fromCurrency];
    return amountInCNY / RATES[dashboardCurrency];
  };

  const totalAssets = assets.reduce((sum, a) => sum + convertToDashboard(a.currentAmount, a.currency), 0);
  const totalEarnings = assets.reduce((sum, a) => sum + convertToDashboard(a.totalEarnings, a.currency), 0);

  // Group assets for charts
  const chartData = [
    { name: '基金', value: assets.filter(a => a.type === AssetType.FUND).reduce((s, a) => s + convertToDashboard(a.currentAmount, a.currency), 0) },
    { name: '黄金', value: assets.filter(a => a.type === AssetType.GOLD).reduce((s, a) => s + convertToDashboard(a.currentAmount, a.currency), 0) },
    { name: '其他', value: assets.filter(a => a.type === AssetType.OTHER).reduce((s, a) => s + convertToDashboard(a.currentAmount, a.currency), 0) },
  ].filter(d => d.value > 0);

  // Group assets by Institution for the list view
  const assetsByInstitution = assets.reduce((groups, asset) => {
    const key = asset.institution;
    if (!groups[key]) groups[key] = [];
    groups[key].push(asset);
    return groups;
  }, {} as Record<string, Asset[]>);


  const handleAddAsset = () => {
    if (!newAsset.institution || !newAsset.productName || !newAsset.amount) return;

    const amountNum = parseFloat(newAsset.amount);
    
    const existingIndex = assets.findIndex(
      a => a.institution === newAsset.institution && 
           a.productName === newAsset.productName &&
           a.currency === newAsset.currency
    );

    let updatedAssets = [...assets];
    const newTransaction: Transaction = {
      id: Date.now().toString() + Math.random().toString().slice(2,6),
      date: newAsset.date || new Date().toISOString().split('T')[0],
      type: 'deposit',
      amount: amountNum,
      description: newAsset.remark || '手动记录'
    };

    if (existingIndex >= 0) {
      const existingAsset = updatedAssets[existingIndex];
      const updatedAsset = {
        ...existingAsset,
        sevenDayYield: newAsset.yield ? parseFloat(newAsset.yield) : existingAsset.sevenDayYield,
        history: [newTransaction, ...existingAsset.history]
      };
      updatedAssets[existingIndex] = recalculateAsset(updatedAsset);
    } else {
      const asset: Asset = {
        id: Date.now().toString() + Math.random().toString().slice(2,6),
        institution: newAsset.institution,
        productName: newAsset.productName,
        type: newAsset.type,
        currency: newAsset.currency,
        currentAmount: 0,
        totalEarnings: 0,
        sevenDayYield: newAsset.yield ? parseFloat(newAsset.yield) : 0,
        remark: newAsset.remark,
        history: [newTransaction],
        dailyEarnings: {}
      };
      updatedAssets.push(recalculateAsset(asset));
    }
    
    // Consolidate one more time just in case of weird state (though above logic is sound)
    setAssets(consolidateAssets(updatedAssets));
    
    setShowAddModal(false);
    setNewAsset({ 
      institution: '', 
      productName: '', 
      type: AssetType.FUND, 
      currency: 'CNY',
      amount: '', 
      date: new Date().toISOString().split('T')[0],
      yield: '', 
      remark: '' 
    });
  };

  const handleUpdateTransaction = (updatedTx: Transaction) => {
    if (!editingTransaction) return;

    const assetIndex = assets.findIndex(a => a.id === editingTransaction.assetId);
    if (assetIndex === -1) return;

    const updatedAssets = [...assets];
    const asset = updatedAssets[assetIndex];
    
    const newHistory = asset.history.map(t => t.id === updatedTx.id ? updatedTx : t);
    
    updatedAssets[assetIndex] = recalculateAsset({
      ...asset,
      history: newHistory
    });

    setAssets(updatedAssets);
    setEditingTransaction(null);
  };

  const handleDeleteTransaction = (txId: string) => {
    if (!editingTransaction) return;
    if (!confirm('确定要删除这条记录吗？')) return;

    const assetIndex = assets.findIndex(a => a.id === editingTransaction.assetId);
    if (assetIndex === -1) return;

    const updatedAssets = [...assets];
    const asset = updatedAssets[assetIndex];
    
    const newHistory = asset.history.filter(t => t.id !== txId);
    
    updatedAssets[assetIndex] = recalculateAsset({
      ...asset,
      history: newHistory
    });

    setAssets(updatedAssets);
    setEditingTransaction(null);
  };

  const handleDeleteAssetRequest = (assetId: string) => {
    console.log("Requesting delete for asset:", assetId);
    setConfirmDeleteAssetId(assetId);
  };

  const executeDeleteAsset = () => {
    if (confirmDeleteAssetId) {
      setAssets(prev => prev.filter(a => a.id !== confirmDeleteAssetId));
      setConfirmDeleteAssetId(null);
    }
  };

  const handleSaveAssetInfo = (updatedInfo: Asset) => {
    setAssets(prev => prev.map(a => a.id === updatedInfo.id ? updatedInfo : a));
    setEditingAssetInfo(null);
  };

  const handleOpenAIModal = () => {
    setTargetAssetId('auto');
    setManualInstitution('');
    setManualCurrency('');
    setShowAIModal(true);
  };

  const handleDirectScan = (assetId: string) => {
    const asset = assets.find(a => a.id === assetId);
    setTargetAssetId(assetId);
    setManualInstitution('');
    // Pre-select currency based on asset default
    setManualCurrency(asset?.currency || 'CNY');
    setShowDirectScanModal(true);
  };

  const triggerFileSelect = () => {
    fileInputRef.current?.click();
  };

  const handleAIUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsProcessingAI(true);
    
    const fileArray = Array.from(files);
    let allNewRecords: gemini.AIAssetRecord[] = [];

    try {
        const processFile = (file: File): Promise<gemini.AIAssetRecord[]> => {
            return new Promise((resolve) => {
                const reader = new FileReader();
                reader.onloadend = async () => {
                    const base64 = reader.result as string;
                    try {
                        const records = await gemini.analyzeEarningsScreenshot(base64);
                        resolve(records || []);
                    } catch (err: any) {
                         if (err.message === "GEMINI_REGION_ERROR") {
                             alert("AI 服务连接失败：当前网络环境不支持 (403 Region not supported)。\n请尝试切换 VPN 节点至支持地区 (如美国/新加坡)。");
                        }
                        console.error("Error analyzing file", file.name, err);
                        resolve([]);
                    }
                };
                reader.readAsDataURL(file);
            });
        };

        // 1. Process all files sequentially to gather raw data
        for (const file of fileArray) {
            const records = await processFile(file);
            allNewRecords.push(...records);
        }

        if (allNewRecords.length > 0) {
             
             // 1.5 Apply Manual Currency Override if set
             if (manualCurrency) {
                 allNewRecords.forEach(r => {
                     r.currency = manualCurrency as Currency;
                 });
             }

             // 2. [Context Inference] Improve Names based on siblings in the same batch
             // Find "Strong" records (those with explicit product names, usually from purchase/deposit screenshots)
             const strongRecords = allNewRecords.filter(r => r.productName && r.productName !== '未命名产品' && r.productName.length > 3);
             
             // Map Currency -> Primary Product Name
             const batchContext = new Map<Currency, string>();
             strongRecords.forEach(r => {
                 if (r.currency && r.productName) {
                     // If we have multiple strong names for the same currency in one batch, this logic prefers the last one 
                     // (or we could count frequency, but usually users upload 1 product's flow at a time).
                     batchContext.set(r.currency as Currency, r.productName);
                 }
             });

             // Apply inferred names to "Weak" records (earnings lists usually missing headers)
             allNewRecords.forEach(record => {
                 const currency = (record.currency as Currency) || 'CNY';
                 const isWeakName = !record.productName || record.productName === '未命名产品' || record.productName.length <= 3;
                 
                 if (isWeakName && batchContext.has(currency)) {
                     const inferredName = batchContext.get(currency)!;
                     console.log(`Context Inference: Associating unnamed ${currency} record to '${inferredName}'`);
                     record.productName = inferredName;
                 }
             });

             // 3. Grouping Logic
             const groupedRecords = new Map<string, {
                 productName: string;
                 currency: Currency;
                 assetType: AssetType;
                 institution: string | null;
                 records: gemini.AIAssetRecord[];
             }>();

             allNewRecords.forEach(record => {
                 if (!record.productName) record.productName = "未命名产品";
                 const currency = (record.currency as Currency) || 'CNY';
                 const key = `${record.productName}|${currency}`;

                 if (!groupedRecords.has(key)) {
                     groupedRecords.set(key, {
                         productName: record.productName,
                         currency: currency,
                         assetType: (record.assetType as AssetType) || AssetType.FUND,
                         institution: record.institution || null,
                         records: []
                     });
                 }
                 
                 const group = groupedRecords.get(key)!;
                 // Consolidate Institution info: if any record in the group has it, apply to group
                 if (!group.institution && record.institution) {
                     group.institution = record.institution;
                 }
                 group.records.push(record);
             });

             let updatedAssets = [...assets];
             let createdCount = 0;
             let updatedCount = 0;
             let totalRecordsProcessed = 0;

             groupedRecords.forEach(group => {
                 const institution = manualInstitution || group.institution || '未命名渠道';
                 const productName = group.productName;
                 const currency = group.currency;

                 let assetIndex = -1;
                 
                 if (targetAssetId !== 'auto') {
                     // If manual target, force all groups into this asset
                     assetIndex = updatedAssets.findIndex(a => a.id === targetAssetId);
                 } else {
                     // 1. Strict Match: Institution + Name + Currency
                     assetIndex = updatedAssets.findIndex(a => 
                         a.institution === institution && 
                         a.productName === productName &&
                         a.currency === currency
                     );

                     // 2. Fuzzy/Smart Match: Name + Currency only
                     if (assetIndex === -1) {
                         const potentialMatches = updatedAssets.map((a, idx) => ({ ...a, originalIndex: idx }))
                             .filter(a => a.productName === productName && a.currency === currency);
                         
                         if (potentialMatches.length === 1) {
                             // Found exactly one candidate -> Merge into it
                             assetIndex = potentialMatches[0].originalIndex;
                             console.log(`Smart Merge: Merging records for '${productName}' into existing asset '${updatedAssets[assetIndex].institution} - ${productName}'`);
                         }
                     }
                 }

                 // Helper to check duplicates
                 const isDuplicate = (history: Transaction[], r: gemini.AIAssetRecord) => {
                     const type = r.type || 'earning';
                     return history.some(h => 
                        h.date === r.date && 
                        h.type === type && 
                        Math.abs(h.amount - r.amount) < 0.01
                     );
                 };

                 const newTransactions: Transaction[] = [];

                 group.records.forEach(r => {
                     if (!r.date || typeof r.amount !== 'number') return;
                     
                     // Check against existing asset history if it exists
                     if (assetIndex >= 0) {
                         const existingAsset = updatedAssets[assetIndex];
                         if (isDuplicate(existingAsset.history, r)) return;
                     } 
                     // Check against newly created transactions for this batch
                     const type = r.type || 'earning';
                     if (newTransactions.some(t => t.date === r.date && t.type === type && Math.abs(t.amount - r.amount) < 0.01)) return;

                     newTransactions.push({
                         id: Date.now().toString() + Math.random().toString().slice(2, 6),
                         date: r.date,
                         type: type,
                         amount: r.amount,
                         description: type === 'deposit' ? 'AI 识别买入' : 'AI 识别收益'
                     });
                 });

                 if (newTransactions.length === 0) return;

                 if (assetIndex >= 0) {
                     // Update
                     const asset = updatedAssets[assetIndex];
                     asset.history = [...newTransactions, ...asset.history];
                     updatedAssets[assetIndex] = recalculateAsset(asset);
                     updatedCount++;
                 } else {
                     // Create
                     const newAsset: Asset = {
                         id: Date.now().toString() + Math.random().toString().slice(2, 6),
                         institution: institution,
                         productName: productName,
                         type: group.assetType,
                         currency: currency,
                         currentAmount: 0,
                         totalEarnings: 0,
                         sevenDayYield: 0,
                         remark: 'AI 自动创建',
                         history: newTransactions,
                         dailyEarnings: {}
                     };
                     updatedAssets.push(recalculateAsset(newAsset));
                     createdCount++;
                 }
                 totalRecordsProcessed += newTransactions.length;
             });

            // Perform final consolidation to ensure cleanliness
            setAssets(consolidateAssets(updatedAssets));
            setShowAIModal(false);
            
            if (totalRecordsProcessed > 0) {
                let msg = `处理完成！\n新增记录: ${totalRecordsProcessed} 条`;
                if (createdCount > 0) msg += `\n新建资产: ${createdCount} 个`;
                if (updatedCount > 0) msg += `\n更新资产: ${updatedCount} 个`;
                alert(msg);
            } else {
                alert(`所有识别到的记录均已存在。`);
            }
        } else {
             // Only show this generic alert if no records found AND no errors alerted
             if (!allNewRecords || allNewRecords.length === 0) {
                 alert("未能识别图片中的有效信息，请确保截图清晰。");
             }
        }

    } catch (error) {
        console.error("AI Batch Process Error:", error);
        alert("处理过程中发生错误，请重试。");
    } finally {
        setIsProcessingAI(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const toggleDashboardCurrency = () => {
    const next: Record<Currency, Currency> = {
      'CNY': 'USD',
      'USD': 'HKD',
      'HKD': 'CNY'
    };
    setDashboardCurrency(next[dashboardCurrency]);
  };

  return (
    <div className="min-h-screen bg-[#f5f6f7] text-gray-800 pb-32">
      
      {/* Hidden File Input for AI Scan */}
      <input 
        type="file" 
        multiple
        accept="image/*" 
        ref={fileInputRef}
        onChange={handleAIUpload}
        className="hidden" 
      />

      {/* Top Header */}
      <div className="px-6 pt-8 pb-4 flex justify-between items-center bg-white sticky top-0 z-30 shadow-sm sm:hidden">
         <h1 className="text-lg font-bold">我的资产</h1>
         <button onClick={() => setShowGuide(true)}><HelpCircle size={20} className="text-gray-400" /></button>
      </div>
      <div className="hidden sm:flex px-6 pt-10 pb-4 justify-between items-center">
         <h1 className="text-2xl font-bold text-gray-800">资产管家</h1>
         <button onClick={() => setShowGuide(true)}><HelpCircle size={24} className="text-gray-400" /></button>
      </div>

      {/* Fintech Dashboard Card */}
      <div className="mx-4 sm:mx-6 mb-6">
        <div className="bg-gradient-to-br from-gray-800 to-black text-white rounded-2xl p-6 shadow-xl relative overflow-hidden transition-all duration-500">
           
           <div className="absolute -top-10 -right-10 w-40 h-40 bg-white/5 rounded-full blur-2xl"></div>
           <div className="absolute bottom-0 left-0 w-32 h-32 bg-blue-500/10 rounded-full blur-xl"></div>

           <div className="flex justify-between items-center relative z-10">
              <div>
                 <div className="flex items-center gap-2 mb-1">
                   <p className="text-gray-400 text-xs font-medium tracking-wide">总资产估值</p>
                   <button 
                     onClick={toggleDashboardCurrency}
                     className="text-[10px] font-bold bg-white/10 px-1.5 py-0.5 rounded text-gray-300 hover:bg-white/20 transition flex items-center gap-0.5"
                   >
                     {dashboardCurrency} <RefreshCw size={8} />
                   </button>
                 </div>
                 
                 <h2 className="text-3xl sm:text-4xl font-bold mb-4 font-mono tracking-tight animate-fadeIn">
                   {dashboardCurrency === 'USD' ? '$' : dashboardCurrency === 'HKD' ? 'HK$' : '¥'} 
                   {totalAssets.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
                 </h2>
                 
                 <div className="flex items-center gap-2">
                    <div className="bg-white/10 px-3 py-1.5 rounded-lg backdrop-blur-md flex items-center gap-2 border border-white/5">
                       <TrendingUp size={14} className="text-red-400" />
                       <div>
                          <p className="text-[10px] text-gray-400 leading-none mb-0.5">累计收益 ({dashboardCurrency})</p>
                          <p className="text-sm font-bold leading-none">
                            {totalEarnings > 0 ? '+' : ''}{totalEarnings.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
                          </p>
                       </div>
                    </div>
                 </div>
              </div>

              {totalAssets > 0 && (
                <div className="w-24 h-24 sm:w-32 sm:h-32 relative">
                   <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                         <Pie
                            data={chartData}
                            innerRadius="60%"
                            outerRadius="100%"
                            paddingAngle={5}
                            dataKey="value"
                            stroke="none"
                         >
                            {chartData.map((entry, index) => (
                               <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                         </Pie>
                      </PieChart>
                   </ResponsiveContainer>
                   <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <span className="text-[10px] text-gray-400">分布</span>
                   </div>
                </div>
              )}
           </div>
        </div>
      </div>

      {/* Asset List */}
      <div className="px-4 sm:px-6 space-y-5">
         {Object.keys(assetsByInstitution).length === 0 ? (
           <div className="text-center py-16">
             <div className="bg-gray-100 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4">
                <Wallet className="text-gray-300" size={32} />
             </div>
             <p className="text-gray-400 text-sm">暂无资产，点击下方按钮开始记录</p>
           </div>
         ) : (
           Object.entries(assetsByInstitution).map(([institution, instAssets]: [string, Asset[]]) => (
             <div key={institution} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="bg-gray-50/50 px-5 py-3 border-b border-gray-100 flex items-center justify-between">
                   <div className="flex items-center gap-2">
                      <div className="w-1 h-4 bg-gray-800 rounded-full"></div>
                      <h3 className="font-bold text-gray-700 text-sm">{institution}</h3>
                   </div>
                </div>

                <div className="divide-y divide-gray-50">
                  {instAssets.map(asset => (
                    <AssetItem 
                      key={asset.id} 
                      asset={asset} 
                      onEditTransaction={(tx) => setEditingTransaction({ assetId: asset.id, transaction: tx })}
                      onDelete={handleDeleteAssetRequest}
                      onEditInfo={() => setEditingAssetInfo(asset)}
                      onDirectAIScan={() => handleDirectScan(asset.id)}
                    />
                  ))}
                </div>
             </div>
           ))
         )}
      </div>

      {/* Floating Action Capsule */}
      <div className="fixed bottom-8 left-0 right-0 flex justify-center z-40 pointer-events-none">
         <div className="pointer-events-auto bg-gray-900 text-white rounded-full shadow-2xl shadow-gray-400/50 flex items-center p-1.5 px-6 gap-0 backdrop-blur-xl bg-opacity-95 transform hover:scale-105 transition duration-200">
            <button 
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-2 font-bold text-sm sm:text-base active:opacity-70 transition py-2 px-4"
            >
              <Plus size={18} className="text-blue-400" />
              <span>记一笔</span>
            </button>
            <div className="w-px h-5 bg-gray-700 mx-1"></div>
            <button 
              onClick={handleOpenAIModal}
              className="flex items-center gap-2 font-bold text-sm sm:text-base active:opacity-70 transition py-2 px-4"
            >
              <Camera size={18} className="text-blue-400" />
              <span>AI 识别</span>
            </button>
         </div>
      </div>

      {/* Direct AI Scan Modal */}
      {showDirectScanModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fadeIn p-4">
           <div className="bg-white w-full max-w-sm rounded-2xl p-6 shadow-2xl">
              <div className="flex justify-between items-center mb-6">
                 <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                   <Sparkles size={20} className="text-purple-500" />
                   AI 录入明细
                 </h2>
                 <button onClick={() => setShowDirectScanModal(false)} className="p-1 hover:bg-gray-100 rounded-full">
                    <X size={20} className="text-gray-400" />
                 </button>
              </div>
              
              <div className="space-y-6">
                 <div className="bg-gray-50 p-3 rounded-xl border border-gray-100">
                     <p className="text-xs text-gray-400 mb-1">目标资产</p>
                     <p className="font-bold text-gray-800 text-sm">
                        {assets.find(a => a.id === targetAssetId)?.productName || '未知资产'}
                     </p>
                 </div>

                 <div>
                    <label className="block text-gray-500 text-xs font-bold mb-2">确认货币种类</label>
                    <div className="relative">
                       <select 
                          value={manualCurrency}
                          onChange={(e) => setManualCurrency(e.target.value as Currency)}
                          className="w-full bg-gray-50 border border-gray-200 rounded-xl py-3 pl-3 pr-10 text-sm font-bold text-gray-800 appearance-none focus:ring-2 focus:ring-purple-500 outline-none"
                       >
                          <option value="CNY">CNY (人民币)</option>
                          <option value="USD">USD (美元)</option>
                          <option value="HKD">HKD (港币)</option>
                       </select>
                       <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                    </div>
                 </div>

                 <button 
                    onClick={() => {
                        setShowDirectScanModal(false);
                        triggerFileSelect();
                    }}
                    disabled={isProcessingAI}
                    className="w-full py-3.5 bg-gray-900 text-white font-bold rounded-xl shadow-lg active:scale-95 transition flex justify-center items-center gap-2"
                 >
                    <Scan size={18} />
                    <span>上传截图</span>
                 </button>
              </div>
           </div>
        </div>
      )}

      {/* AI Scan Modal */}
      {showAIModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fadeIn p-4">
           <div className="bg-white w-full max-w-sm rounded-2xl p-6 shadow-2xl">
              <div className="flex justify-between items-center mb-6">
                 <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                   <Camera size={20} className="text-blue-500" />
                   AI 智能识别
                 </h2>
                 <button onClick={() => setShowAIModal(false)} className="p-1 hover:bg-gray-100 rounded-full">
                    <X size={20} className="text-gray-400" />
                 </button>
              </div>

              <div className="space-y-6">
                 
                 {/* Target Select */}
                 <div>
                    <label className="block text-gray-500 text-xs font-bold mb-2">识别模式</label>
                    <div className="relative">
                       <select 
                          value={targetAssetId}
                          onChange={(e) => setTargetAssetId(e.target.value)}
                          className="w-full bg-gray-50 border border-gray-200 rounded-xl py-3 pl-3 pr-10 text-sm font-bold text-gray-800 appearance-none focus:ring-2 focus:ring-blue-500 outline-none"
                       >
                          <option value="auto">✨ 自动匹配 / 新建资产</option>
                          <option disabled>──────────</option>
                          {assets.map(asset => (
                             <option key={asset.id} value={asset.id}>
                                更新: {asset.institution} - {asset.productName}
                             </option>
                          ))}
                       </select>
                       <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                    </div>
                 </div>

                 {/* Manual Institution Override */}
                 {targetAssetId === 'auto' && (
                     <>
                        <div>
                           <label className="block text-gray-500 text-xs font-bold mb-2">投资渠道 (可选, 留空则自动识别)</label>
                           <input 
                              type="text"
                              value={manualInstitution}
                              onChange={(e) => setManualInstitution(e.target.value)}
                              placeholder="例如：支付宝、招商银行"
                              className="w-full bg-gray-50 border border-gray-200 rounded-xl py-3 px-3 text-sm font-bold text-gray-800 outline-none focus:ring-2 focus:ring-blue-500"
                           />
                        </div>

                        {/* Manual Currency Override */}
                        <div>
                           <label className="block text-gray-500 text-xs font-bold mb-2">货币种类 (可选, 留空则自动识别)</label>
                           <div className="relative">
                              <select 
                                 value={manualCurrency}
                                 onChange={(e) => setManualCurrency(e.target.value as Currency | '')}
                                 className="w-full bg-gray-50 border border-gray-200 rounded-xl py-3 pl-3 pr-10 text-sm font-bold text-gray-800 appearance-none focus:ring-2 focus:ring-blue-500 outline-none"
                              >
                                 <option value="">✨ 自动识别</option>
                                 <option value="CNY">CNY (人民币)</option>
                                 <option value="USD">USD (美元)</option>
                                 <option value="HKD">HKD (港币)</option>
                              </select>
                              <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                           </div>
                        </div>
                     </>
                 )}

                 <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 text-blue-800 text-xs leading-relaxed">
                    <p>📸 <strong>功能升级</strong></p>
                    <ul className="list-disc pl-4 mt-1 space-y-1 text-blue-600/80">
                       <li>支持自动识别产品名称、日期、金额、类型</li>
                       <li>支持识别港币(HKD)、美元(USD)等外币</li>
                       <li>自动创建新资产，或匹配已有资产</li>
                    </ul>
                 </div>

                 <button 
                    onClick={triggerFileSelect}
                    disabled={isProcessingAI}
                    className="w-full py-3.5 bg-gray-900 text-white font-bold rounded-xl shadow-lg active:scale-95 transition flex justify-center items-center gap-2"
                 >
                    {isProcessingAI ? (
                       <>
                         <div className="animate-spin w-4 h-4 border-2 border-white/30 border-t-white rounded-full" />
                         <span>智能分析中...</span>
                       </>
                    ) : (
                       <>
                         <Scan size={18} />
                         <span>上传截图</span>
                       </>
                    )}
                 </button>
              </div>
           </div>
        </div>
      )}

      {/* Edit Asset Info Modal */}
      {editingAssetInfo && (
        <EditAssetInfoModal 
          asset={editingAssetInfo}
          onSave={handleSaveAssetInfo}
          onClose={() => setEditingAssetInfo(null)}
        />
      )}

      {/* Add Asset Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl animate-slideUp">
            <div className="w-12 h-1.5 bg-gray-200 rounded-full mx-auto mb-6 sm:hidden"></div>
            <h2 className="text-xl font-bold mb-6 text-gray-800 text-center">记录新资产</h2>
            
            <div className="space-y-4">
              <SmartInput 
                label="投资渠道"
                placeholder="例如：支付宝"
                value={newAsset.institution}
                onChange={(v) => setNewAsset({...newAsset, institution: v})}
                suggestions={['支付宝', '微信理财通', '招商银行', '工商银行']}
              />
              
              <SmartInput 
                label="产品名称"
                placeholder="例如：易方达蓝筹"
                value={newAsset.productName}
                onChange={(v) => setNewAsset({...newAsset, productName: v})}
                suggestions={storage.getUniqueProductNames(assets)}
              />

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-gray-500 text-xs font-bold mb-1.5">记录日期</label>
                  <input 
                    type="date"
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl py-3 px-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    value={newAsset.date}
                    onChange={(e) => setNewAsset({...newAsset, date: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-gray-500 text-xs font-bold mb-1.5">资产类型</label>
                  <select 
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl py-3 px-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none appearance-none"
                    value={newAsset.type}
                    onChange={(e) => setNewAsset({...newAsset, type: e.target.value as AssetType})}
                  >
                    <option value={AssetType.FUND}>基金</option>
                    <option value={AssetType.GOLD}>黄金</option>
                    <option value={AssetType.OTHER}>其他</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                 <div>
                   <label className="block text-gray-500 text-xs font-bold mb-1.5">货币种类</label>
                   <select 
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl py-3 px-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none appearance-none font-bold text-gray-700"
                      value={newAsset.currency}
                      onChange={(e) => setNewAsset({...newAsset, currency: e.target.value as Currency})}
                    >
                      <option value="CNY">CNY (人民币)</option>
                      <option value="USD">USD (美元)</option>
                      <option value="HKD">HKD (港币)</option>
                    </select>
                 </div>
                 <div>
                     <label className="block text-gray-500 text-xs font-bold mb-1.5">金额</label>
                     <div className="relative">
                       <input 
                        type="number"
                        className="w-full bg-gray-50 border border-gray-200 rounded-xl py-3 px-3 text-lg font-bold text-gray-800 focus:ring-2 focus:ring-blue-500 outline-none"
                        placeholder="0.00"
                        value={newAsset.amount}
                        onChange={(e) => setNewAsset({...newAsset, amount: e.target.value})}
                       />
                     </div>
                  </div>
              </div>

              <div className="flex gap-4">
                  <div className="flex-1">
                     <label className="block text-gray-500 text-xs font-bold mb-1.5">年化 (%)</label>
                     <input 
                      type="number"
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl py-3 px-3 text-sm"
                      placeholder="2.5"
                      value={newAsset.yield}
                      onChange={(e) => setNewAsset({...newAsset, yield: e.target.value})}
                     />
                  </div>
                  <div className="flex-[2]">
                     <label className="block text-gray-500 text-xs font-bold mb-1.5">备注</label>
                     <input 
                      type="text"
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl py-3 px-3 text-sm"
                      placeholder="选填"
                      value={newAsset.remark}
                      onChange={(e) => setNewAsset({...newAsset, remark: e.target.value})}
                     />
                  </div>
              </div>

            <div className="flex gap-3 mt-8">
              <button 
                onClick={() => setShowAddModal(false)}
                className="flex-1 py-3.5 rounded-xl bg-gray-100 text-gray-600 font-bold text-sm"
              >
                取消
              </button>
              <button 
                onClick={handleAddAsset}
                className="flex-1 py-3.5 rounded-xl bg-gray-900 text-white font-bold text-sm shadow-lg active:scale-95 transition"
              >
                确认
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Transaction Modal */}
      {editingTransaction && (
         <EditTransactionModal 
            transaction={editingTransaction.transaction}
            onSave={handleUpdateTransaction}
            onDelete={() => handleDeleteTransaction(editingTransaction.transaction.id)}
            onClose={() => setEditingTransaction(null)}
         />
      )}

      {/* Confirm Delete Asset Modal */}
      {confirmDeleteAssetId && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fadeIn">
          <div className="bg-white w-full max-w-xs rounded-2xl p-6 shadow-2xl animate-scaleIn">
             <div className="flex flex-col items-center text-center mb-6">
               <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mb-4">
                 <AlertTriangle size={24} className="text-red-500" />
               </div>
               <h3 className="text-lg font-bold text-gray-800">确认删除该资产？</h3>
               <p className="text-sm text-gray-500 mt-2 leading-relaxed">删除后，该资产的所有历史记录和收益明细将无法恢复。</p>
             </div>
             <div className="flex gap-3">
               <button 
                 onClick={() => setConfirmDeleteAssetId(null)}
                 className="flex-1 py-3 rounded-xl bg-gray-100 text-gray-700 font-bold text-sm"
               >
                 取消
               </button>
               <button 
                 onClick={executeDeleteAsset}
                 className="flex-1 py-3 rounded-xl bg-red-500 text-white font-bold text-sm shadow-lg shadow-red-200"
               >
                 确认删除
               </button>
             </div>
          </div>
        </div>
      )}

      {/* Guide Modal */}
      {showGuide && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm p-6 animate-fadeIn">
          <div className="bg-white rounded-2xl max-w-md w-full p-8 shadow-2xl">
             <h2 className="text-2xl font-bold text-gray-800 mb-6">使用说明</h2>
             <div className="space-y-4 text-gray-600 text-sm leading-relaxed">
               <p>👋 <strong>欢迎使用资产管家</strong></p>
               <ul className="list-disc pl-5 space-y-2">
                 <li><strong>货币切换</strong>：点击顶部总资产旁的货币符号，可切换 CNY/USD/HKD 显示。</li>
                 <li><strong>记录资产</strong>：点击底部“记一笔”添加资产，支持选择货币种类。</li>
                 <li><strong>AI 智能识别</strong>：点击底部“AI 识别”按钮，可自动创建或更新资产。</li>
                 <li><strong>数据安全</strong>：所有数据仅存储在您的本地浏览器中。</li>
               </ul>
             </div>
             <button onClick={() => setShowGuide(false)} className="mt-8 w-full py-3 bg-gray-900 text-white font-bold rounded-xl active:scale-95 transition">开始使用</button>
          </div>
        </div>
      )}

    </div>
  );
}

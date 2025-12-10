import React, { useState, useEffect, useRef, useMemo } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { 
  Plus, Scan, ChevronDown, HelpCircle, History, Calendar, Wallet, 
  Pencil, X, TrendingUp, RefreshCw, Camera, Trash2, Settings, 
  AlertTriangle, Sparkles, ArrowRightLeft, Loader2
} from 'lucide-react';

/**
 * --- TYPES & CONSTANTS ---
 */

const COLORS = ['#3b82f6', '#fbbf24', '#a855f7', '#f87171']; // Blue, Gold, Purple, Red

enum AssetType {
  FUND = 'Fund',
  GOLD = 'Gold',
  OTHER = 'Other'
}

type Currency = 'CNY' | 'USD' | 'HKD';

interface Transaction {
  id: string;
  date: string; // ISO Date string YYYY-MM-DD
  type: 'deposit' | 'earning';
  amount: number;
  currency?: Currency; // Each transaction can technically have its own currency
  description?: string;
}

interface Asset {
  id: string;
  institution: string; 
  productName: string; 
  type: AssetType;
  currency: Currency; // Principal/Holding Currency
  earningsCurrency?: Currency; // Separate Currency for Earnings (e.g., Fund is USD, but pays yield in CNY)
  remark?: string;
  currentAmount: number; 
  totalEarnings: number; 
  sevenDayYield?: number; 
  history: Transaction[];
  dailyEarnings: Record<string, number>;
}

// Exchange rates relative to CNY
const RATES: Record<Currency, number> = {
  CNY: 1,
  USD: 7.2,
  HKD: 0.92
};

const getSymbol = (c: Currency) => c === 'USD' ? '$' : c === 'HKD' ? 'HK$' : '¥';

/**
 * --- SERVICES: STORAGE ---
 */

const STORAGE_KEY = 'wechat_asset_manager_data_v2'; // Bumped version for new schema

const saveAssets = (assets: Asset[]) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(assets));
  } catch (e) {
    console.error("Failed to save to local storage", e);
  }
};

const getAssets = (): Asset[] => {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch (e) {
    console.error("Failed to load from local storage", e);
    return [];
  }
};

const getUniqueProductNames = (assets: Asset[]): string[] => {
  const names = new Set<string>();
  assets.forEach(a => names.add(a.productName));
  return Array.from(names);
};

/**
 * --- SERVICES: GEMINI AI ---
 */

interface AIAssetRecord {
  date: string;
  amount: number;
  type: 'deposit' | 'earning';
  productName?: string;
  institution?: string;
  currency?: 'CNY' | 'USD' | 'HKD';
  assetType?: 'Fund' | 'Gold' | 'Other';
}

const compressImage = (base64Str: string, maxWidth = 1024, quality = 0.6): Promise<string> => {
  return new Promise((resolve) => {
    if (!base64Str || !base64Str.startsWith('data:image')) {
        resolve(base64Str);
        return;
    }
    const img = new Image();
    img.src = base64Str;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;
      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width);
        width = maxWidth;
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(base64Str);
        return;
      }
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => resolve(base64Str);
  });
};

const analyzeEarningsScreenshot = async (base64Image: string): Promise<AIAssetRecord[]> => {
  const apiKey = ""; 
  
  if (!base64Image) return [];

  try {
    const compressedDataUrl = await compressImage(base64Image);
    const parts = compressedDataUrl.split(',');
    const cleanBase64 = parts.length > 1 ? parts[1] : compressedDataUrl;
    
    const todayStr = new Date().toISOString().split('T')[0];
    const yesterdayStr = new Date(Date.now() - 86400000).toISOString().split('T')[0];

    const prompt = `
      Analyze this screenshot of an investment app (Alipay, Bank Apps, etc.).
      
      YOUR TASK: Extract a list of asset transactions or earnings.
      
      CRITICAL - PURCHASE CONFIRMATION SCREENS:
      If the image shows "Purchase Successful", "Buying", "Order Confirmed" (e.g., "购买确认成功", "交易成功"):
      1. This is a **'deposit'** type transaction.
      2. You MUST extract the **FULL Product Name**.
      3. Extract the Amount and Currency.
      4. Extract the Date.

      EARNINGS LISTS / CALENDARS:
      1. Extract daily earnings rows.
      2. If Product Name is visible, extract it.
      
      RULES:
      1. **Institution**: Look at header (e.g., "Alipay", "ICBC").
      2. **Date**: YYYY-MM-DD. "Yesterday"=${yesterdayStr}, "Today"=${todayStr}.
      3. **Type**: "deposit" (Buy, Purchase, 买入) or "earning" (Income, Profit, 收益, +xx.xx).
      4. **Currency**: default "CNY" unless "USD", "HKD" found.

      Output JSON ONLY with this schema:
      {
        "records": [
          {
            "productName": "string",
            "institution": "string",
            "amount": number,
            "date": "YYYY-MM-DD",
            "type": "deposit" | "earning",
            "assetType": "Fund" | "Gold" | "Other",
            "currency": "CNY" | "USD" | "HKD"
          }
        ]
      }
    `;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: prompt },
              { inlineData: { mimeType: "image/jpeg", data: cleanBase64 } }
            ]
          }],
          generationConfig: {
            responseMimeType: "application/json"
          }
        })
      }
    );

    if (!response.ok) throw new Error(`API Error: ${response.status}`);
    
    const result = await response.json();
    const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (!text) return [];
    
    const parsed = JSON.parse(text);
    return parsed.records || [];

  } catch (error) {
    console.error("Gemini Analysis Failed:", error);
    throw error;
  }
};

/**
 * --- SUB-COMPONENTS ---
 */

// 1. Smart Input
const SmartInput: React.FC<{
  label: string;
  value: string;
  onChange: (val: string) => void;
  suggestions: string[];
  placeholder?: string;
}> = ({ label, value, onChange, suggestions, placeholder }) => {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const filteredSuggestions = suggestions.filter(s => 
    s.toLowerCase().includes(value.toLowerCase()) && s !== value
  );

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="mb-4 relative" ref={wrapperRef}>
      <label className="block text-gray-700 text-sm font-bold mb-1">{label}</label>
      <input
        type="text"
        className="shadow-sm appearance-none border rounded w-full py-3 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-[#07c160]"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setShowSuggestions(true);
        }}
        onFocus={() => setShowSuggestions(true)}
        placeholder={placeholder}
      />
      
      {showSuggestions && value && filteredSuggestions.length > 0 && (
        <div className="absolute z-10 w-full bg-white border border-gray-200 mt-1 rounded-md shadow-lg max-h-40 overflow-y-auto">
          {filteredSuggestions.map((suggestion, idx) => (
            <div
              key={idx}
              className="px-4 py-2 hover:bg-gray-100 cursor-pointer text-sm text-gray-600"
              onClick={() => {
                onChange(suggestion);
                setShowSuggestions(false);
              }}
            >
              <span className="text-[#07c160] mr-2">⟲</span>
              {suggestion}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// 2. Earnings Calendar
const EarningsCalendar: React.FC<{
  asset: Asset;
  onClose: () => void;
}> = ({ asset, onClose }) => {
  const today = new Date();
  const [currentDate, setCurrentDate] = useState(today);

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
    
    const deposits = asset.history
      .filter(t => t.type === 'deposit' && t.date === dateStr)
      .reduce((sum, t) => sum + t.amount, 0);

    return { earning, deposits };
  };

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));

  const earningsSymbol = getSymbol(asset.earningsCurrency || asset.currency);
  const principalSymbol = getSymbol(asset.currency);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fadeIn">
      <div className="bg-white rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl">
        <div className="bg-[#07c160] p-4 flex justify-between items-center text-white">
          <h3 className="font-bold text-lg">{asset.productName} 收益日历</h3>
          <button onClick={onClose} className="p-1 hover:bg-white/20 rounded-full">
            <X size={24} />
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
                  {hasEarning && (
                     <span className={`text-[9px] font-bold leading-tight ${earning > 0 ? 'text-red-500' : 'text-green-600'}`}>
                       {earning > 0 ? '+' : ''}{earningsSymbol}{earning.toFixed(2)}
                     </span>
                  )}
                  {hasDeposit && (
                     <span className="text-[9px] font-bold text-blue-500 leading-tight">
                       +{principalSymbol}{deposits.toLocaleString()}
                     </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

// 3. Edit Asset Modal
const EditAssetInfoModal: React.FC<{
  asset: Asset;
  onSave: (asset: Asset) => void;
  onClose: () => void;
}> = ({ asset, onSave, onClose }) => {
  const [formData, setFormData] = useState({
    institution: asset.institution,
    productName: asset.productName,
    type: asset.type,
    currency: asset.currency,
    earningsCurrency: asset.earningsCurrency || asset.currency,
    sevenDayYield: asset.sevenDayYield?.toString() || '',
    remark: asset.remark || ''
  });

  const handleSave = () => {
    onSave({
      ...asset,
      ...formData,
      sevenDayYield: parseFloat(formData.sevenDayYield) || 0,
      currency: formData.currency as Currency,
      earningsCurrency: formData.earningsCurrency as Currency,
      type: formData.type as AssetType
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
            {/* Asset Currency (Principal) */}
            <div>
              <label className="block text-gray-500 text-xs font-bold mb-1.5">本金货币</label>
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
          
           {/* Earnings Currency (Separate) */}
           <div>
              <label className="block text-gray-500 text-xs font-bold mb-1.5 flex items-center gap-2">
                 收益货币 <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded font-normal">若收益与本金货币不同请修改</span>
              </label>
              <div className="relative">
                <select
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl py-3 px-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none appearance-none font-bold"
                  value={formData.earningsCurrency}
                  onChange={(e) => setFormData({ ...formData, earningsCurrency: e.target.value as Currency })}
                >
                  <option value="CNY">CNY (人民币)</option>
                  <option value="USD">USD (美元)</option>
                  <option value="HKD">HKD (港币)</option>
                </select>
                <ArrowRightLeft size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
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
          <button onClick={onClose} className="flex-1 py-3.5 rounded-xl bg-gray-100 text-gray-600 font-bold text-sm">取消</button>
          <button onClick={handleSave} className="flex-1 py-3.5 rounded-xl bg-gray-900 text-white font-bold text-sm shadow-lg">保存修改</button>
        </div>
      </div>
    </div>
  );
};

// 4. Edit Transaction Modal
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

// 5. AssetItem Component
const AssetItem: React.FC<{ 
  asset: Asset, 
  onEditTransaction: (tx: Transaction) => void,
  onDelete: (id: string) => void,
  onEditInfo: () => void,
  onDirectAIScan: () => void
}> = ({ asset, onEditTransaction, onDelete, onEditInfo, onDirectAIScan }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  
  const principalSymbol = getSymbol(asset.currency);
  // Default earnings currency to principal currency if not set
  const earningsCurrency = asset.earningsCurrency || asset.currency;
  const earningsSymbol = getSymbol(earningsCurrency);

  return (
    <>
      <div className="transition-all duration-300">
        <div 
          onClick={() => setIsOpen(!isOpen)}
          className="p-5 flex justify-between items-center cursor-pointer hover:bg-gray-50 transition"
        >
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

          <div className="flex items-center gap-3 shrink-0">
             <div className="text-right">
              {/* Display Principal in Asset Currency */}
              <p className="font-bold text-gray-900 text-lg font-mono tracking-tight leading-tight">
                {principalSymbol} {asset.currentAmount.toLocaleString()}
              </p>
              {/* Display Earnings in Earnings Currency */}
              <p className={`text-xs font-bold ${asset.totalEarnings >= 0 ? 'text-red-500' : 'text-green-500'}`}>
                {asset.totalEarnings >= 0 ? '+' : ''}{earningsSymbol} {asset.totalEarnings.toLocaleString()}
              </p>
            </div>
          </div>
        </div>

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
                asset.history.map(record => {
                  // If transaction has explicit currency, use it. Otherwise fallback.
                  const txCurrency = record.currency || (record.type === 'deposit' ? asset.currency : earningsCurrency);
                  const txSymbol = getSymbol(txCurrency);
                  
                  return (
                    <div key={record.id} className="flex justify-between items-center text-sm bg-white p-3 rounded-lg shadow-sm border border-gray-100">
                      <div className="flex items-center gap-3">
                        <div className={`w-1.5 h-1.5 rounded-full ${record.type === 'deposit' ? 'bg-green-500' : 'bg-red-500'}`}></div>
                        <span className="text-gray-400 text-xs">{record.date}</span>
                        <span className="text-gray-700 font-medium truncate max-w-[80px] sm:max-w-[120px]">{record.description}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`font-mono font-bold ${record.type === 'earning' ? 'text-red-500' : 'text-green-600'}`}>
                          {record.type === 'earning' ? '+' : ''} {txSymbol}{record.amount}
                        </span>
                        <button 
                          onClick={(e) => { e.stopPropagation(); onEditTransaction(record); }}
                          className="p-1.5 text-gray-300 hover:text-blue-500 hover:bg-blue-50 rounded transition"
                        >
                            <Pencil size={14} />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="mt-4 pt-3 border-t border-gray-100 flex gap-2">
               <button 
                  onClick={(e) => { e.stopPropagation(); onEditInfo(); }}
                  className="flex-1 flex items-center justify-center gap-1.5 text-xs text-blue-500 hover:text-blue-600 transition-colors py-2 rounded-lg hover:bg-blue-50 font-bold bg-blue-50/50 cursor-pointer"
               >
                  <Settings size={14} />
                  <span>修改信息</span>
               </button>
               <button 
                  onClick={(e) => { e.stopPropagation(); onDelete(asset.id); }}
                  className="flex-1 flex items-center justify-center gap-1.5 text-xs text-gray-400 hover:text-red-500 transition-colors py-2 rounded-lg hover:bg-red-50 cursor-pointer"
               >
                  <Trash2 size={14} />
                  <span>删除资产</span>
               </button>
            </div>
          </div>
        </div>
      </div>
      {showCalendar && <EarningsCalendar asset={asset} onClose={() => setShowCalendar(false)} />}
    </>
  );
};

/**
 * --- MAIN APP COMPONENT ---
 */

const recalculateAsset = (asset: Asset): Asset => {
  let currentAmount = 0;
  let totalEarnings = 0;
  const dailyEarnings: Record<string, number> = {};

  const sortedHistory = [...asset.history].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  sortedHistory.forEach(t => {
    // Note: We simply sum amounts here. The distinction is visual in the UI.
    // The assumption is: All Deposits match 'asset.currency', All Earnings match 'asset.earningsCurrency'
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
     const key = `${asset.productName.trim()}|${asset.currency}`;
     if (uniqueMap.has(key)) {
        const existing = uniqueMap.get(key)!;
        const mergedHistory = [...existing.history, ...asset.history];
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
        
        const isExistingGeneric = !existing.institution || existing.institution === '未命名渠道' || existing.institution === 'Auto-created';
        const isNewSpecific = asset.institution && asset.institution !== '未命名渠道';
        if (isExistingGeneric && isNewSpecific) existing.institution = asset.institution;
        
        // Preserve earnings currency if set on either
        if (!existing.earningsCurrency && asset.earningsCurrency) {
            existing.earningsCurrency = asset.earningsCurrency;
        }

        uniqueMap.set(key, existing);
     } else {
        uniqueMap.set(key, asset);
     }
  });
  return Array.from(uniqueMap.values()).map(recalculateAsset);
};

export default function App() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showAIModal, setShowAIModal] = useState(false); 
  const [showDirectScanModal, setShowDirectScanModal] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [isProcessingAI, setIsProcessingAI] = useState(false);
  
  const [dashboardCurrency, setDashboardCurrency] = useState<Currency>('CNY');
  const [targetAssetId, setTargetAssetId] = useState<string>('auto');
  const [manualInstitution, setManualInstitution] = useState('');
  const [manualCurrency, setManualCurrency] = useState<Currency | ''>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [editingTransaction, setEditingTransaction] = useState<{ assetId: string, transaction: Transaction } | null>(null);
  const [editingAssetInfo, setEditingAssetInfo] = useState<Asset | null>(null);
  const [confirmDeleteAssetId, setConfirmDeleteAssetId] = useState<string | null>(null);

  const [newAsset, setNewAsset] = useState<{
    institution: string;
    productName: string;
    type: AssetType;
    currency: Currency;
    amount: string;
    date: string;
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

  useEffect(() => {
    const loaded = getAssets();
    const normalized = loaded.map(a => ({ ...a, currency: a.currency || 'CNY' }));
    setAssets(consolidateAssets(normalized));
  }, []);

  useEffect(() => {
    saveAssets(assets);
  }, [assets]);

  const convertToDashboard = (amount: number, fromCurrency: Currency) => {
    const amountInCNY = amount * RATES[fromCurrency];
    return amountInCNY / RATES[dashboardCurrency];
  };

  const totalAssets = assets.reduce((sum, a) => sum + convertToDashboard(a.currentAmount, a.currency), 0);
  const totalEarnings = assets.reduce((sum, a) => sum + convertToDashboard(a.totalEarnings, a.earningsCurrency || a.currency), 0);

  const chartData = [
    { name: '基金', value: assets.filter(a => a.type === AssetType.FUND).reduce((s, a) => s + convertToDashboard(a.currentAmount, a.currency), 0) },
    { name: '黄金', value: assets.filter(a => a.type === AssetType.GOLD).reduce((s, a) => s + convertToDashboard(a.currentAmount, a.currency), 0) },
    { name: '其他', value: assets.filter(a => a.type === AssetType.OTHER).reduce((s, a) => s + convertToDashboard(a.currentAmount, a.currency), 0) },
  ].filter(d => d.value > 0);

  const assetsByInstitution = useMemo(() => {
    return assets.reduce((groups, asset) => {
      const key = asset.institution || '其他';
      if (!groups[key]) groups[key] = [];
      groups[key].push(asset);
      return groups;
    }, {} as Record<string, Asset[]>);
  }, [assets]);

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
      currency: newAsset.currency,
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
    
    setAssets(consolidateAssets(updatedAssets));
    setShowAddModal(false);
    setNewAsset({ 
      institution: '', productName: '', type: AssetType.FUND, currency: 'CNY',
      amount: '', date: new Date().toISOString().split('T')[0], yield: '', remark: '' 
    });
  };

  const handleUpdateTransaction = (updatedTx: Transaction) => {
    if (!editingTransaction) return;
    const assetIndex = assets.findIndex(a => a.id === editingTransaction.assetId);
    if (assetIndex === -1) return;
    const updatedAssets = [...assets];
    const asset = updatedAssets[assetIndex];
    const newHistory = asset.history.map(t => t.id === updatedTx.id ? updatedTx : t);
    updatedAssets[assetIndex] = recalculateAsset({ ...asset, history: newHistory });
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
    updatedAssets[assetIndex] = recalculateAsset({ ...asset, history: newHistory });
    setAssets(updatedAssets);
    setEditingTransaction(null);
  };

  const handleDeleteAssetRequest = (assetId: string) => setConfirmDeleteAssetId(assetId);

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

  const handleAIUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setIsProcessingAI(true);
    
    const fileArray = Array.from(files);
    let allNewRecords: AIAssetRecord[] = [];

    try {
        const processFile = (file: File): Promise<AIAssetRecord[]> => {
            return new Promise((resolve) => {
                const reader = new FileReader();
                reader.onloadend = async () => {
                    const base64 = reader.result as string;
                    try {
                        const records = await analyzeEarningsScreenshot(base64);
                        resolve(records || []);
                    } catch (err: any) {
                        console.error("Error analyzing file", file.name, err);
                        resolve([]);
                    }
                };
                reader.readAsDataURL(file);
            });
        };

        for (const file of fileArray) {
            const records = await processFile(file);
            allNewRecords.push(...records);
        }

        if (allNewRecords.length > 0) {
             // If manual currency was explicitly set, override for NEW records.
             // But we will be smarter about applying it to assets later.
             if (manualCurrency) {
                 allNewRecords.forEach(r => r.currency = manualCurrency as Currency);
             }

             const groupedRecords = new Map<string, {
                 productName: string;
                 currency: Currency;
                 assetType: AssetType;
                 institution: string | null;
                 records: AIAssetRecord[];
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
                 if (!group.institution && record.institution) group.institution = record.institution;
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
                     // Direct Scan Mode
                     assetIndex = updatedAssets.findIndex(a => a.id === targetAssetId);
                     
                     // Logic Update:
                     // If we are updating an existing asset, and the user provided a manual currency:
                     // 1. If we are adding 'deposit', it might imply the whole asset currency is wrong, or just this deposit.
                     // 2. If we are adding 'earning', it implies the earnings currency might be different.
                     
                     if (assetIndex >= 0 && manualCurrency) {
                        const asset = updatedAssets[assetIndex];
                        // If we are adding earnings, and the manual currency differs from asset principal currency,
                        // update the earningsCurrency field.
                        if (group.records.some(r => r.type === 'earning') && manualCurrency !== asset.currency) {
                             console.log(`Updating earnings currency for ${asset.productName} to ${manualCurrency}`);
                             asset.earningsCurrency = manualCurrency as Currency;
                        }
                     }
                 } else {
                     // Auto Mode
                     assetIndex = updatedAssets.findIndex(a => 
                         a.institution === institution && 
                         a.productName === productName && 
                         a.currency === currency
                     );
                 }

                 const newTransactions: Transaction[] = [];
                 group.records.forEach(r => {
                     if (!r.date || typeof r.amount !== 'number') return;
                     const type = r.type || 'earning';
                     
                     // De-dupe
                     const exists = assetIndex >= 0 
                        ? updatedAssets[assetIndex].history.some(h => h.date === r.date && h.type === type && Math.abs(h.amount - r.amount) < 0.01)
                        : false;
                     
                     if (!exists && !newTransactions.some(t => t.date === r.date && t.type === type && Math.abs(t.amount - r.amount) < 0.01)) {
                         newTransactions.push({
                             id: Date.now().toString() + Math.random().toString().slice(2, 6),
                             date: r.date,
                             type: type,
                             amount: r.amount,
                             currency: r.currency as Currency, // Store specific currency
                             description: type === 'deposit' ? 'AI 识别买入' : 'AI 识别收益'
                         });
                     }
                 });

                 if (newTransactions.length > 0) {
                     if (assetIndex >= 0) {
                         const asset = updatedAssets[assetIndex];
                         
                         // Auto-detect Mixed Currency for Auto Mode too
                         // If we are adding mixed currency earnings, update earningsCurrency
                         newTransactions.forEach(tx => {
                             if (tx.type === 'earning' && tx.currency && tx.currency !== asset.currency) {
                                 asset.earningsCurrency = tx.currency;
                             }
                         });

                         asset.history = [...newTransactions, ...asset.history];
                         updatedAssets[assetIndex] = recalculateAsset(asset);
                         updatedCount++;
                     } else {
                         const newAsset: Asset = {
                             id: Date.now().toString() + Math.random().toString().slice(2, 6),
                             institution: institution,
                             productName: productName,
                             type: group.assetType,
                             currency: currency,
                             earningsCurrency: currency, // Default to same
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
                 }
             });

            setAssets(consolidateAssets(updatedAssets));
            setShowAIModal(false);
            setShowDirectScanModal(false);
            
            if (totalRecordsProcessed > 0) {
                alert(`处理完成！\n新增记录: ${totalRecordsProcessed} 条`);
            } else {
                alert(`所有识别到的记录均已存在。`);
            }
        } else {
             alert("未能识别图片中的有效信息，请确保截图清晰。");
        }
    } catch (error) {
        console.error("AI Batch Process Error:", error);
        alert("处理过程中发生错误，请重试。");
    } finally {
        setIsProcessingAI(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Styles injection
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
      @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
      @keyframes scaleIn { from { transform: scale(0.95); opacity: 0; } to { transform: scale(1); opacity: 1; } }
      .animate-fadeIn { animation: fadeIn 0.2s ease-out; }
      .animate-slideUp { animation: slideUp 0.3s ease-out; }
      .animate-scaleIn { animation: scaleIn 0.2s ease-out; }
      .custom-scrollbar::-webkit-scrollbar { width: 4px; }
      .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
      .custom-scrollbar::-webkit-scrollbar-thumb { background-color: #e5e7eb; border-radius: 20px; }
    `;
    document.head.appendChild(style);
    return () => { document.head.removeChild(style); };
  }, []);

  return (
    <div className="min-h-screen bg-[#f5f6f7] text-gray-800 pb-32">
      <input type="file" multiple accept="image/*" ref={fileInputRef} onChange={handleAIUpload} className="hidden" />

      {/* Header */}
      <div className="px-6 pt-8 pb-4 flex justify-between items-center bg-white sticky top-0 z-30 shadow-sm sm:hidden">
         <h1 className="text-lg font-bold">我的资产</h1>
         <button onClick={() => setShowGuide(true)}><HelpCircle size={20} className="text-gray-400" /></button>
      </div>
      <div className="hidden sm:flex px-6 pt-10 pb-4 justify-between items-center">
         <h1 className="text-2xl font-bold text-gray-800">资产管家</h1>
         <button onClick={() => setShowGuide(true)}><HelpCircle size={24} className="text-gray-400" /></button>
      </div>

      {/* Dashboard Card */}
      <div className="mx-4 sm:mx-6 mb-6">
        <div className="bg-gradient-to-br from-gray-800 to-black text-white rounded-2xl p-6 shadow-xl relative overflow-hidden transition-all duration-500">
           <div className="absolute -top-10 -right-10 w-40 h-40 bg-white/5 rounded-full blur-2xl"></div>
           <div className="absolute bottom-0 left-0 w-32 h-32 bg-blue-500/10 rounded-full blur-xl"></div>

           <div className="flex justify-between items-center relative z-10">
              <div>
                 <div className="flex items-center gap-2 mb-1">
                   <p className="text-gray-400 text-xs font-medium tracking-wide">总资产估值</p>
                   <button 
                     onClick={() => setDashboardCurrency(curr => curr === 'CNY' ? 'USD' : curr === 'USD' ? 'HKD' : 'CNY')}
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
                         <Pie data={chartData} innerRadius="60%" outerRadius="100%" paddingAngle={5} dataKey="value" stroke="none">
                            {chartData.map((entry, index) => (
                               <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                         </Pie>
                      </PieChart>
                   </ResponsiveContainer>
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
           Object.entries(assetsByInstitution).map(([institution, instAssets]) => (
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
                      onDirectAIScan={() => {
                        setTargetAssetId(asset.id);
                        // Default manualCurrency to earningsCurrency, but allow change
                        setManualCurrency(asset.earningsCurrency || asset.currency);
                        setShowDirectScanModal(true);
                      }}
                    />
                  ))}
                </div>
             </div>
           ))
         )}
      </div>

      {/* Action Bar */}
      <div className="fixed bottom-8 left-0 right-0 flex justify-center z-40 pointer-events-none">
         <div className="pointer-events-auto bg-gray-900 text-white rounded-full shadow-2xl flex items-center p-1.5 px-6 gap-0 backdrop-blur-xl bg-opacity-95 hover:scale-105 transition duration-200">
            <button onClick={() => setShowAddModal(true)} className="flex items-center gap-2 font-bold text-sm sm:text-base py-2 px-4 active:opacity-70">
              <Plus size={18} className="text-blue-400" /> <span>记一笔</span>
            </button>
            <div className="w-px h-5 bg-gray-700 mx-1"></div>
            <button 
              onClick={() => {
                setTargetAssetId('auto');
                setManualInstitution('');
                setManualCurrency('');
                setShowAIModal(true);
              }}
              className="flex items-center gap-2 font-bold text-sm sm:text-base py-2 px-4 active:opacity-70"
            >
              <Camera size={18} className="text-blue-400" /> <span>AI 识别</span>
            </button>
         </div>
      </div>

      {/* Modals */}
      {showAIModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fadeIn p-4">
           <div className="bg-white w-full max-w-sm rounded-2xl p-6 shadow-2xl">
              <div className="flex justify-between items-center mb-6">
                 <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                   <Camera size={20} className="text-blue-500" /> AI 智能识别
                 </h2>
                 <button 
                    onClick={() => setShowAIModal(false)} 
                    disabled={isProcessingAI}
                    className="p-1 hover:bg-gray-100 rounded-full disabled:opacity-50 disabled:cursor-not-allowed"
                 >
                    <X size={20} className="text-gray-400" />
                 </button>
              </div>
              <div className="space-y-6">
                 <div>
                    <label className="block text-gray-500 text-xs font-bold mb-2">识别模式</label>
                    <div className="relative">
                       <select 
                          value={targetAssetId}
                          onChange={(e) => setTargetAssetId(e.target.value)}
                          disabled={isProcessingAI}
                          className="w-full bg-gray-50 border border-gray-200 rounded-xl py-3 pl-3 pr-10 text-sm font-bold text-gray-800 appearance-none focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-gray-100 disabled:text-gray-400"
                       >
                          <option value="auto">✨ 自动匹配 / 新建资产</option>
                          <option disabled>──────────</option>
                          {assets.map(asset => (
                             <option key={asset.id} value={asset.id}>更新: {asset.institution} - {asset.productName}</option>
                          ))}
                       </select>
                       <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                    </div>
                 </div>
                 {targetAssetId === 'auto' && (
                     <>
                        <div>
                           <label className="block text-gray-500 text-xs font-bold mb-2">投资渠道 (可选)</label>
                           <input 
                              type="text" value={manualInstitution} onChange={(e) => setManualInstitution(e.target.value)}
                              disabled={isProcessingAI}
                              placeholder="例如：支付宝" className="w-full bg-gray-50 border border-gray-200 rounded-xl py-3 px-3 text-sm font-bold disabled:bg-gray-100 disabled:text-gray-400"
                           />
                        </div>
                        <div>
                           <label className="block text-gray-500 text-xs font-bold mb-2">货币种类 (可选)</label>
                           <div className="relative">
                              <select 
                                 value={manualCurrency} onChange={(e) => setManualCurrency(e.target.value as Currency | '')}
                                 disabled={isProcessingAI}
                                 className="w-full bg-gray-50 border border-gray-200 rounded-xl py-3 pl-3 pr-10 text-sm font-bold appearance-none disabled:bg-gray-100 disabled:text-gray-400"
                              >
                                 <option value="">✨ 自动识别</option>
                                 <option value="CNY">CNY</option>
                                 <option value="USD">USD</option>
                                 <option value="HKD">HKD</option>
                              </select>
                              <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                           </div>
                        </div>
                     </>
                 )}
                 <button 
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isProcessingAI}
                    className={`w-full py-3.5 rounded-xl shadow-lg transition flex justify-center items-center gap-2 font-bold text-white
                        ${isProcessingAI ? 'bg-gray-700 cursor-not-allowed' : 'bg-gray-900 active:scale-95'}`}
                 >
                    {isProcessingAI ? (
                        <>
                            <Loader2 className="animate-spin" size={18} />
                            <span>AI 正在分析中...</span>
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

      {showDirectScanModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fadeIn p-4">
           <div className="bg-white w-full max-w-sm rounded-2xl p-6 shadow-2xl">
              <div className="flex justify-between items-center mb-6">
                 <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                   <Sparkles size={20} className="text-purple-500" /> AI 录入明细
                 </h2>
                 <button 
                    onClick={() => setShowDirectScanModal(false)} 
                    disabled={isProcessingAI}
                    className="p-1 hover:bg-gray-100 rounded-full disabled:opacity-50 disabled:cursor-not-allowed"
                 >
                    <X size={20} className="text-gray-400" />
                 </button>
              </div>
              <div className="space-y-6">
                 <div className="bg-gray-50 p-3 rounded-xl border border-gray-100">
                     <p className="text-xs text-gray-400 mb-1">目标资产</p>
                     <p className="font-bold text-gray-800 text-sm">{assets.find(a => a.id === targetAssetId)?.productName || '未知资产'}</p>
                 </div>
                 <div>
                    <label className="block text-gray-500 text-xs font-bold mb-2">确认货币种类</label>
                    <div className="relative">
                       <select 
                          value={manualCurrency} onChange={(e) => setManualCurrency(e.target.value as Currency)}
                          disabled={isProcessingAI}
                          className="w-full bg-gray-50 border border-gray-200 rounded-xl py-3 pl-3 pr-10 text-sm font-bold appearance-none disabled:bg-gray-100 disabled:text-gray-400"
                       >
                          <option value="CNY">CNY</option>
                          <option value="USD">USD</option>
                          <option value="HKD">HKD</option>
                       </select>
                       <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                    </div>
                 </div>
                 <button 
                    onClick={() => {
                        // Don't close modal here, let handleAIUpload handle it on success
                        fileInputRef.current?.click(); 
                    }}
                    disabled={isProcessingAI}
                    className={`w-full py-3.5 rounded-xl shadow-lg transition flex justify-center items-center gap-2 font-bold text-white
                        ${isProcessingAI ? 'bg-gray-700 cursor-not-allowed' : 'bg-gray-900 active:scale-95'}`}
                 >
                    {isProcessingAI ? (
                        <>
                            <Loader2 className="animate-spin" size={18} />
                            <span>正在分析截图...</span>
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

      {/* Add Asset Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl animate-slideUp">
            <h2 className="text-xl font-bold mb-6 text-gray-800 text-center">记录新资产</h2>
            <div className="space-y-4">
              <SmartInput 
                label="投资渠道" placeholder="例如：支付宝" value={newAsset.institution}
                onChange={(v) => setNewAsset({...newAsset, institution: v})}
                suggestions={['支付宝', '微信理财通', '招商银行', '工商银行']}
              />
              <SmartInput 
                label="产品名称" placeholder="例如：易方达蓝筹" value={newAsset.productName}
                onChange={(v) => setNewAsset({...newAsset, productName: v})}
                suggestions={getUniqueProductNames(assets)}
              />
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-gray-500 text-xs font-bold mb-1.5">记录日期</label>
                  <input 
                    type="date" className="w-full bg-gray-50 border border-gray-200 rounded-xl py-3 px-3 text-sm"
                    value={newAsset.date} onChange={(e) => setNewAsset({...newAsset, date: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-gray-500 text-xs font-bold mb-1.5">资产类型</label>
                  <select 
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl py-3 px-3 text-sm appearance-none"
                    value={newAsset.type} onChange={(e) => setNewAsset({...newAsset, type: e.target.value as AssetType})}
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
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl py-3 px-3 text-sm appearance-none font-bold"
                      value={newAsset.currency} onChange={(e) => setNewAsset({...newAsset, currency: e.target.value as Currency})}
                    >
                      <option value="CNY">CNY</option>
                      <option value="USD">USD</option>
                      <option value="HKD">HKD</option>
                    </select>
                 </div>
                 <div>
                     <label className="block text-gray-500 text-xs font-bold mb-1.5">金额</label>
                     <input 
                      type="number" className="w-full bg-gray-50 border border-gray-200 rounded-xl py-3 px-3 text-lg font-bold"
                      placeholder="0.00" value={newAsset.amount} onChange={(e) => setNewAsset({...newAsset, amount: e.target.value})}
                     />
                  </div>
              </div>
              <div className="flex gap-4">
                  <div className="flex-1">
                     <label className="block text-gray-500 text-xs font-bold mb-1.5">年化 (%)</label>
                     <input 
                      type="number" className="w-full bg-gray-50 border border-gray-200 rounded-xl py-3 px-3 text-sm"
                      placeholder="2.5" value={newAsset.yield} onChange={(e) => setNewAsset({...newAsset, yield: e.target.value})}
                     />
                  </div>
                  <div className="flex-[2]">
                     <label className="block text-gray-500 text-xs font-bold mb-1.5">备注</label>
                     <input 
                      type="text" className="w-full bg-gray-50 border border-gray-200 rounded-xl py-3 px-3 text-sm"
                      placeholder="选填" value={newAsset.remark} onChange={(e) => setNewAsset({...newAsset, remark: e.target.value})}
                     />
                  </div>
              </div>
            <div className="flex gap-3 mt-8">
              <button onClick={() => setShowAddModal(false)} className="flex-1 py-3.5 rounded-xl bg-gray-100 text-gray-600 font-bold text-sm">取消</button>
              <button onClick={handleAddAsset} className="flex-1 py-3.5 rounded-xl bg-gray-900 text-white font-bold text-sm shadow-lg">确认</button>
            </div>
          </div>
        </div>
      </div>
      )}

      {/* Other Modals */}
      {editingAssetInfo && <EditAssetInfoModal asset={editingAssetInfo} onSave={handleSaveAssetInfo} onClose={() => setEditingAssetInfo(null)} />}
      {editingTransaction && <EditTransactionModal transaction={editingTransaction.transaction} onSave={handleUpdateTransaction} onDelete={() => handleDeleteTransaction(editingTransaction.transaction.id)} onClose={() => setEditingTransaction(null)} />}
      {confirmDeleteAssetId && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fadeIn">
          <div className="bg-white w-full max-w-xs rounded-2xl p-6 shadow-2xl">
             <div className="flex flex-col items-center text-center mb-6">
               <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mb-4"><AlertTriangle size={24} className="text-red-500" /></div>
               <h3 className="text-lg font-bold text-gray-800">确认删除该资产？</h3>
               <p className="text-sm text-gray-500 mt-2">删除后，该资产的所有历史记录和收益明细将无法恢复。</p>
             </div>
             <div className="flex gap-3">
               <button onClick={() => setConfirmDeleteAssetId(null)} className="flex-1 py-3 rounded-xl bg-gray-100 text-gray-700 font-bold text-sm">取消</button>
               <button onClick={executeDeleteAsset} className="flex-1 py-3 rounded-xl bg-red-500 text-white font-bold text-sm">确认删除</button>
             </div>
          </div>
        </div>
      )}
      {showGuide && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm p-6 animate-fadeIn">
          <div className="bg-white rounded-2xl max-w-md w-full p-8 shadow-2xl">
             <h2 className="text-2xl font-bold text-gray-800 mb-6">使用说明</h2>
             <div className="space-y-4 text-gray-600 text-sm leading-relaxed">
               <ul className="list-disc pl-5 space-y-2">
                 <li><strong>货币切换</strong>：点击顶部总资产旁的货币符号，可切换 CNY/USD/HKD 显示。</li>
                 <li><strong>混合货币支持</strong>：现在支持本金和收益使用不同的货币（例如：美元理财，人民币收益）。在“AI 识别”或“修改信息”中可自动或手动调整。</li>
                 <li><strong>记录资产</strong>：点击底部“记一笔”添加资产。</li>
                 <li><strong>AI 智能识别</strong>：支持上传支付宝/银行App的截图，自动识别资产和收益。</li>
               </ul>
             </div>
             <button onClick={() => setShowGuide(false)} className="mt-8 w-full py-3 bg-gray-900 text-white font-bold rounded-xl active:scale-95 transition">开始使用</button>
          </div>
        </div>
      )}
    </div>
  );
}

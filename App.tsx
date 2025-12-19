import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Plus, ChevronDown, HelpCircle, History, Calendar, Wallet, 
  Pencil, X, TrendingUp, RefreshCw, Camera, Trash2, Settings, 
  AlertTriangle, Sparkles, ArrowRightLeft, Loader2, UserCircle, LogOut, 
  UploadCloud, CheckCircle2, Mail, Lock, ArrowRight, Percent, Clock, BarChart4,
  Check, ArrowUpRight, Eye, EyeOff, Shield
} from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';

// Firebase Imports
import { initializeApp } from "firebase/app";
import { 
  getAuth, 
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  signInAnonymously,
  signInWithCustomToken
} from "firebase/auth";
// 🔥 移除 User 类型导入，避免构建错误

import { 
  getFirestore, 
  collection, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  query, 
  onSnapshot
} from "firebase/firestore";

/**
 * --- TYPES & CONSTANTS ---
 */

const COLORS = ['#3b82f6', '#ef4444', '#fbbf24', '#a855f7']; 

export enum AssetType {
  FUND = 'Fund',
  STOCK = 'Stock', 
  GOLD = 'Gold',
  OTHER = 'Other'
}

export type Currency = 'CNY' | 'USD' | 'HKD';

export interface Transaction {
  id: string;
  date: string; 
  type: 'deposit' | 'earning' | 'withdrawal';
  amount: number;
  currency?: Currency;
  description?: string;
}

export interface Asset {
  id: string;
  institution: string; 
  productName: string; 
  type: AssetType;
  currency: Currency; 
  earningsCurrency?: Currency; 
  remark?: string;
  currentAmount: number; 
  totalEarnings: number; 
  sevenDayYield?: number; 
  history: Transaction[];
  dailyEarnings: Record<string, number>;
}

export interface AIAssetRecord {
  date: string;
  amount: number;
  type: 'deposit' | 'earning' | 'withdrawal';
  productName?: string;
  institution?: string;
  currency?: 'CNY' | 'USD' | 'HKD';
  assetType?: 'Fund' | 'Stock' | 'Gold' | 'Other';
}

const RATES: Record<Currency, number> = {
  CNY: 1,
  USD: 7.2,
  HKD: 0.92
};

const getSymbol = (c: Currency) => c === 'USD' ? '$' : c === 'HKD' ? 'HK$' : '¥';

const convertCurrency = (amount: number, from: Currency, to: Currency) => {
  if (from === to) return amount;
  const amountInCNY = amount * RATES[from];
  return amountInCNY / RATES[to];
};

const getUniqueProductNames = (assets: Asset[]): string[] => {
  const names = new Set<string>();
  assets.forEach(a => names.add(a.productName));
  return Array.from(names);
};

const normalizeString = (str: string) => {
    if (!str) return '';
    return str
        .replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '') 
        .toLowerCase();
};

const findMatchingAsset = (assets: Asset[], targetName: string, targetInst: string, targetCurrency: string): Asset | undefined => {
  return assets.find(a => {
    if (a.currency !== targetCurrency && a.earningsCurrency !== targetCurrency) return false;
    const normTargetName = normalizeString(targetName);
    const normAssetName = normalizeString(a.productName);
    if (normAssetName.includes(normTargetName) || normTargetName.includes(normAssetName)) {
        return true;
    }
    return false;
  });
};

/**
 * --- SERVICES: GEMINI AI ---
 */

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

// Fixed: Set empty string as apiKey is provided by environment at runtime
const apiKey = ""; 

const analyzeEarningsScreenshot = async (base64Image: string): Promise<AIAssetRecord[]> => {
  if (!base64Image) return [];

  try {
    const compressedDataUrl = await compressImage(base64Image);
    const parts = compressedDataUrl.split(',');
    const cleanBase64 = parts.length > 1 ? parts[1] : compressedDataUrl;
    
    const prompt = `
      You are an expert personal finance assistant. Analyze this screenshot of an investment transaction.
      
      **GOAL**: Extract data to "Group" assets logically, like a human would.

      **INTELLIGENT EXTRACTION RULES**:

      1. **Date (CRITICAL T+N Logic)**:
         - Financial transactions have "Order Time" and "Confirmation/Settlement Time".
         - **RULE**: Always prioritize the **"Confirmation Date"** (确认日期, 确认交易, 结算日期, 完成日期) over the "Order Date".
         - Only use "Order/Transaction Time" (下单时间) if NO confirmation date is visible.
         - Format: YYYY-MM-DD.

      2. **Product Name (Human-Like Grouping)**:
         - Extract the **Core Product Name**.
         - **Action**: Intelligent Cleaning. Remove noise that splits identical assets into duplicates.
         - *Example*: If image says "China Fund USD (Class B Acc)", output "China Fund".
         - Remove suffixes like "Class A/B/C", "(Acc)", "(Dist)", "USD/CNY" ONLY IF they are just redundant labels. 
         - Keep unique identifiers if they denote a fundamentally different asset (e.g. "Bond Fund" vs "Equity Fund").

      3. **Institution (Entity Recognition)**:
         - Identify the **Asset Manager** or **Platform** holding the asset (e.g. "China Asset Mgmt", "Alipay").
         - **Negative Rule**: Ignore "Payment Method" (付款方式). If the user paid via "ZA Bank" to buy a "China Fund", the Institution is "China Fund" (or the App name), NOT "ZA Bank".

      4. **Type (CRITICAL)**:
         - **deposit**: Capital inflow (Buy, Purchase, Subscription, 已交收, 买入).
         - **earning**: Income (Profit, Dividend, Interest, 收益).
         - **withdrawal**: Capital outflow (Sell, Redemption, 卖出, 赎回, 取出, 资金转出).

      5. **Asset Type**:
         - Infer Fund/Stock/Gold/Other based on keywords (e.g., "Stock", "Share", "Equities", "Gold", "ETF", "Bond").

      OUTPUT JSON ONLY: { "records": [ { "productName": "...", "institution": "...", "amount": number, "date": "...", "type": "deposit"|"earning"|"withdrawal", "currency": "CNY"|"USD"|"HKD", "assetType": "Fund"|"Stock"|"Gold"|"Other" } ] }
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

    if (!response.ok) {
        throw new Error(`API Error: ${response.status}`);
    }
    
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
 * --- FIREBASE CONFIGURATION ---
 */
// @ts-ignore
const firebaseConfig = {
  apiKey: "AIzaSyCcWjG9efLujQ2dc4Aunn4TQhOsWfL0K5I",
  authDomain: "asset-manager-v2.firebaseapp.com",
  projectId: "asset-manager-v2",
  storageBucket: "asset-manager-v2.firebasestorage.app",
  messagingSenderId: "476410671438",
  appId: "1:476410671438:web:2adb008bbb4c448be1ae1f",
  measurementId: "G-BYRH32EHH9"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
// @ts-ignore
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

/**
 * --- UTILS ---
 */

const consolidateAssets = (rawAssets: Asset[]): Asset[] => {
  return rawAssets.map(asset => {
    let totalPrincipalBase = 0; 
    let totalEarningsBase = 0;
    let totalEarningsDisplay = 0; 
    let totalWithdrawalBase = 0;
    const dailyMap: Record<string, number> = {}; 

    const sortedHistory = [...asset.history].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    sortedHistory.forEach(tx => {
      const txCurrency = tx.currency || (tx.type === 'deposit' ? asset.currency : (asset.earningsCurrency || asset.currency));

      if (tx.type === 'deposit') {
        totalPrincipalBase += convertCurrency(tx.amount, txCurrency, asset.currency);
      } else if (tx.type === 'earning') {
        const earningForDisplay = convertCurrency(tx.amount, txCurrency, asset.earningsCurrency || asset.currency);
        totalEarningsDisplay += earningForDisplay;
        dailyMap[tx.date] = (dailyMap[tx.date] || 0) + earningForDisplay;
        const earningForBase = convertCurrency(tx.amount, txCurrency, asset.currency);
        totalEarningsBase += earningForBase;
      } else if (tx.type === 'withdrawal') {
        totalWithdrawalBase += convertCurrency(tx.amount, txCurrency, asset.currency);
      }
    });
    
    // Current Amount = Principal + Earnings - Withdrawals
    const currentAmount = totalPrincipalBase + totalEarningsBase - totalWithdrawalBase;

    return {
      ...asset,
      currentAmount,
      totalEarnings: totalEarningsDisplay,
      dailyEarnings: dailyMap,
      history: [...sortedHistory].reverse()
    };
  });
};

/**
 * --- COMPONENTS ---
 */

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
      </div>

      {/* 右侧：功能按钮组 */}
      <div className="flex items-center gap-3">
        <button 
          onClick={onTogglePrivacy}
          className="w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-sm border border-gray-100 text-gray-600 hover:bg-gray-50 active:scale-95 transition-all"
          aria-label={privacyMode ? "显示金额" : "隐藏金额"}
        >
          {privacyMode ? <EyeOff size={20} /> : <Eye size={20} />}
        </button>

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

interface BottomNavProps {
  activeTab: 'assets' | 'analysis' | 'ai' | 'me';
  onChange: (tab: 'assets' | 'analysis' | 'ai' | 'me') => void;
}

const BottomNav: React.FC<BottomNavProps> = ({ activeTab, onChange }) => {
  const navItems = [
    { id: 'assets', label: '资产', icon: Wallet },
    { id: 'analysis', label: '趋势', icon: TrendingUp },
    { id: 'ai', label: 'AI', icon: Sparkles },
    { id: 'me', label: '我的', icon: UserCircle },
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
              onClick={() => onChange(item.id)} // @ts-ignore
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

const SmartInput: React.FC<{
  label: string; value: string; onChange: (val: string) => void; suggestions: string[]; placeholder?: string;
}> = ({ label, value, onChange, suggestions, placeholder }) => {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const filteredSuggestions = suggestions.filter(s => s.toLowerCase().includes(value.toLowerCase()) && s !== value);

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
        className="w-full bg-gray-50 border border-gray-200 rounded-xl h-12 px-3 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-blue-500 transition-all"
        value={value}
        onChange={(e) => { onChange(e.target.value); setShowSuggestions(true); }}
        onFocus={() => setShowSuggestions(true)}
        placeholder={placeholder}
      />
      {showSuggestions && value && filteredSuggestions.length > 0 && (
        <div className="absolute z-10 w-full bg-white border border-gray-200 mt-1 rounded-xl shadow-lg max-h-40 overflow-y-auto">
          {filteredSuggestions.map((suggestion, idx) => (
            <div key={idx} className="px-4 py-2 hover:bg-gray-100 cursor-pointer text-sm text-gray-600 flex items-center"
              onClick={() => { onChange(suggestion); setShowSuggestions(false); }}
            >
              <RefreshCw size={12} className="text-[#07c160] mr-2" />{suggestion}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const EarningsCalendar: React.FC<{ asset: Asset; onClose: () => void; }> = ({ asset, onClose }) => {
  const today = new Date();
  const [currentDate, setCurrentDate] = useState(today);
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfMonth = new Date(year, month, 1).getDay(); 
  const days = [];
  for (let i = 0; i < firstDayOfMonth; i++) days.push(null);
  for (let i = 1; i <= daysInMonth; i++) days.push(i);

  const getEventsForDay = (day: number) => {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const earning = asset.dailyEarnings[dateStr] || 0;
    const deposits = asset.history.filter(t => t.type === 'deposit' && t.date === dateStr).reduce((sum, t) => sum + t.amount, 0);
    const withdrawals = asset.history.filter(t => t.type === 'withdrawal' && t.date === dateStr).reduce((sum, t) => sum + t.amount, 0);
    return { earning, deposits, withdrawals };
  };

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fadeIn">
      <div className="bg-white rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl">
        <div className="bg-[#07c160] p-4 flex justify-between items-center text-white">
          <h3 className="font-bold text-lg">{asset.productName} 收益日历</h3>
          <button onClick={onClose} className="p-1 hover:bg-white/20 rounded-full transition-colors"><X size={24} /></button>
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
                  {hasEarning && (
                     <span className={`text-[9px] font-bold leading-tight tracking-tighter ${earning > 0 ? 'text-red-500' : 'text-green-600'}`}>{earning > 0 ? '' : ''}{Math.abs(earning).toFixed(0)}</span>
                  )}
                  {hasDeposit && <span className="text-[9px] font-bold text-blue-500 leading-tight tracking-tighter">+{deposits.toLocaleString(undefined, {maximumFractionDigits:0})}</span>}
                  {hasWithdrawal && <span className="text-[9px] font-bold text-orange-500 leading-tight tracking-tighter">-{withdrawals.toLocaleString(undefined, {maximumFractionDigits:0})}</span>}
                </div>
              );
            })}
          </div>
          
          <div className="mt-4 flex gap-3 justify-center text-[10px] text-gray-500 pt-3 border-t border-gray-100">
             <div className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-red-500"></span> 收益</div>
             <div className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-green-600"></span> 亏损</div>
             <div className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span> 存入</div>
             <div className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-orange-500"></span> 赎回</div>
          </div>
        </div>
      </div>
    </div>
  );
};

const AuthScreen: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isRegister, setIsRegister] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (isRegister) {
        await createUserWithEmailAndPassword(auth, email, password);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (err: any) {
      console.error(err);
      let msg = '操作失败，请重试';
      if (err.code === 'auth/invalid-email') msg = '邮箱格式不正确';
      if (err.code === 'auth/user-not-found') msg = '用户不存在，请先注册';
      if (err.code === 'auth/wrong-password') msg = '密码错误';
      if (err.code === 'auth/email-already-in-use') msg = '该邮箱已被注册';
      if (err.code === 'auth/weak-password') msg = '密码太弱，至少需要6位';
      if (err.code === 'auth/invalid-credential') msg = '账号或密码错误';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#ededed] p-4">
      <div className="bg-white w-full max-w-sm rounded-2xl p-8 shadow-xl animate-scaleIn">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-gray-900 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
             <Wallet className="text-white" size={32} />
          </div>
          <h1 className="text-2xl font-bold text-gray-800">资产管家</h1>
          <p className="text-gray-500 text-sm mt-2">安全、智能的个人财富管理助手</p>
        </div>
        
        <form onSubmit={handleAuth} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1.5 ml-1">电子邮箱</label>
            <div className="relative">
              <input 
                type="email" 
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl py-3 pl-10 pr-4 text-sm font-bold text-gray-800 focus:ring-2 focus:ring-blue-500 focus:outline-none transition-all"
                placeholder="name@example.com"
              />
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            </div>
          </div>
          
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1.5 ml-1">密码</label>
            <div className="relative">
              <input 
                type="password" 
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl py-3 pl-10 pr-4 text-sm font-bold text-gray-800 focus:ring-2 focus:ring-blue-500 focus:outline-none transition-all"
                placeholder="••••••••"
              />
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            </div>
          </div>

          {error && (
            <div className="text-red-500 text-xs font-bold bg-red-50 p-3 rounded-lg flex items-center gap-2">
              <AlertTriangle size={14} /> {error}
            </div>
          )}

          <button 
            type="submit" 
            disabled={loading}
            className="w-full py-3.5 bg-gray-900 text-white font-bold rounded-xl shadow-lg hover:bg-black active:scale-95 transition-all flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="animate-spin" size={20} /> : (
              <>{isRegister ? '注册账号' : '立即登录'} <ArrowRight size={18} /></>
            )}
          </button>
        </form>

        <div className="mt-6 text-center">
          <button 
            onClick={() => { setIsRegister(!isRegister); setError(''); }}
            className="text-sm font-bold text-blue-500 hover:text-blue-600 transition-colors"
          >
            {isRegister ? '已有账号？去登录' : '没有账号？注册新账号'}
          </button>
        </div>
      </div>
    </div>
  );
};

// --- AIScanModal ---
const AIScanModal: React.FC<{
  isOpen: boolean; onClose: () => void; onUpload: () => void; isProcessing: boolean; assets: Asset[]; targetAssetId: string; setTargetAssetId: (id: string) => void;
  manualCurrency: Currency | ''; setManualCurrency: (c: Currency | '') => void; manualInstitution: string; setManualInstitution: (s: string) => void; lastProcessedCount: number;
  manualAmount: string; setManualAmount: (s: string) => void; 
  manualDate: string; setManualDate: (s: string) => void;
  onManualSubmit: () => void;
  modalMode: 'global' | 'earning' | 'withdrawal';
}> = ({ isOpen, onClose, onUpload, isProcessing, assets, targetAssetId, setTargetAssetId, manualCurrency, setManualCurrency, manualInstitution, setManualInstitution, lastProcessedCount, manualAmount, setManualAmount, manualDate, setManualDate, onManualSubmit, modalMode }) => {
  if (!isOpen) return null;

  const getTitle = () => {
    if (modalMode === 'withdrawal') return '赎回录入';
    if (modalMode === 'earning') return '收益录入明细';
    return 'AI 智能识别';
  };

  const isManualMode = modalMode !== 'global';

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fadeIn p-4">
       <div className="bg-white w-full max-w-sm rounded-2xl p-6 shadow-2xl">
          <div className="flex justify-between items-center mb-6">
             <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
               <Sparkles size={20} className={modalMode === 'withdrawal' ? "text-orange-500" : "text-purple-500"} /> 
               {getTitle()}
             </h2>
             <button onClick={onClose} disabled={isProcessing} className="p-1 hover:bg-gray-100 rounded-full disabled:opacity-50 disabled:cursor-not-allowed transition-colors"><X size={20} className="text-gray-400" /></button>
          </div>
          <div className="space-y-6">
             {!isProcessing && lastProcessedCount > 0 && (
                <div className="bg-green-50 text-green-700 p-3 rounded-xl flex items-center gap-2 text-xs font-bold animate-fadeIn"><CheckCircle2 size={16} />已成功录入 {lastProcessedCount} 条记录</div>
             )}
             <div>
                <label className="block text-gray-500 text-xs font-bold mb-2">目标资产</label>
                <div className="relative">
                   <select value={targetAssetId} onChange={(e) => setTargetAssetId(e.target.value)} disabled={isProcessing}
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl h-12 pl-3 pr-10 text-sm font-bold text-gray-800 appearance-none focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-gray-100 disabled:text-gray-400 transition-all">
                      <option value="auto">✨ 自动匹配 / 新建资产</option>
                      <option disabled>──────────</option>
                      {assets.map(asset => <option key={asset.id} value={asset.id}>{asset.institution} - {asset.productName}</option>)}
                   </select>
                   <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                </div>
             </div>
             
             {targetAssetId === 'auto' && (
                <div>
                   <label className="block text-gray-500 text-xs font-bold mb-2">投资渠道 (可选)</label>
                   <input type="text" value={manualInstitution} onChange={(e) => setManualInstitution(e.target.value)} disabled={isProcessing} placeholder="例如：支付宝" className="w-full bg-gray-50 border border-gray-200 rounded-xl h-12 px-3 text-sm font-bold disabled:bg-gray-100 disabled:text-gray-400 transition-all" />
                </div>
             )}

             {isManualMode && (
               <div className="grid grid-cols-2 gap-4">
                   <div>
                      <label className="block text-gray-500 text-xs font-bold mb-2">
                          {modalMode === 'withdrawal' ? '赎回金额' : '收益金额'} <span className="text-[10px] font-normal text-gray-400 ml-1">(选填)</span>
                      </label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold">¥/$</span>
                        <input 
                          type="number" 
                          value={manualAmount} 
                          onChange={(e) => setManualAmount(e.target.value)} 
                          disabled={isProcessing} 
                          placeholder="0.00" 
                          className="w-full bg-gray-50 border border-gray-200 rounded-xl h-12 pl-14 pr-3 text-sm font-bold text-gray-800 outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-400 transition-all"
                        />
                      </div>
                   </div>

                   <div>
                      <label className="block text-gray-500 text-xs font-bold mb-2">日期</label>
                      <input 
                          type="date" 
                          value={manualDate}
                          onChange={(e) => setManualDate(e.target.value)}
                          disabled={isProcessing}
                          className="w-full bg-gray-50 border border-gray-200 rounded-xl h-12 px-3 text-sm font-bold text-gray-800 outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-400 transition-all"
                      />
                   </div>
               </div>
             )}

             <div>
                <label className="block text-gray-500 text-xs font-bold mb-2">确认货币种类 <span className="ml-2 text-[10px] text-gray-400 font-normal bg-gray-100 px-1.5 py-0.5 rounded">{targetAssetId === 'auto' ? '可选，若不选则自动识别' : '强制指定'}</span></label>
                <div className="relative">
                   <select value={manualCurrency} onChange={(e) => setManualCurrency(e.target.value as Currency | '')} disabled={isProcessing} className="w-full bg-gray-50 border border-gray-200 rounded-xl h-12 pl-3 pr-10 text-sm font-bold appearance-none disabled:bg-gray-100 disabled:text-gray-400 transition-all">
                      <option value="">{targetAssetId === 'auto' ? '✨ 自动识别' : '💰 继承资产原币种'}</option>
                      <option value="CNY">CNY (人民币)</option>
                      <option value="USD">USD (美元)</option>
                      <option value="HKD">HKD (港币)</option>
                   </select>
                   <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                </div>
             </div>

             {isManualMode ? (
                <div className="flex gap-3">
                    <button 
                      onClick={onManualSubmit} 
                      disabled={isProcessing} 
                      className={`flex-1 py-4 text-white rounded-xl shadow-lg transition flex justify-center items-center gap-2 font-bold disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 ${modalMode === 'withdrawal' ? 'bg-orange-500 hover:bg-orange-600' : 'bg-blue-500 hover:bg-blue-600'}`}
                    >
                      <Check size={20} />
                      <span>确认</span>
                    </button>
                    <button 
                      onClick={onUpload} 
                      disabled={isProcessing} 
                      className={`flex-[2] py-4 rounded-xl shadow-lg transition flex justify-center items-center gap-2 font-bold text-white ${isProcessing ? 'bg-gray-700 cursor-not-allowed' : 'bg-gray-900 active:scale-95 hover:bg-black'}`}
                    >
                      {isProcessing ? <><Loader2 className="animate-spin" size={18} /><span>AI 分析中...</span></> : <><UploadCloud size={20} /><span>上传截图 (支持多张)</span></>}
                    </button>
                </div>
             ) : (
                <button 
                  onClick={onUpload} 
                  disabled={isProcessing} 
                  className={`w-full py-4 rounded-xl shadow-lg transition flex justify-center items-center gap-2 font-bold text-white ${isProcessing ? 'bg-gray-700 cursor-not-allowed' : 'bg-gray-900 active:scale-95 hover:bg-black'}`}
                >
                  {isProcessing ? <><Loader2 className="animate-spin" size={18} /><span>AI 正在分析中...</span></> : <><UploadCloud size={20} /><span>上传截图 (支持多张)</span></>}
                </button>
             )}
          </div>
       </div>
    </div>
  );
};

// --- AssetItem & Modals ---
const AssetItem: React.FC<{ asset: Asset; onEditTransaction: (tx: Transaction) => void; onDeleteTransaction: (txId: string) => void; onDelete: (id: string) => void; onEditInfo: () => void; 
  onDirectAIScan: (mode: 'earning' | 'withdrawal') => void; 
}> = ({ asset, onEditTransaction, onDeleteTransaction, onDelete, onEditInfo, onDirectAIScan }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  
  const principalSymbol = getSymbol(asset.currency);
  const earningsCurrency = asset.earningsCurrency || asset.currency;
  const earningsSymbol = getSymbol(earningsCurrency);
  
  const totalEarningsInBase = convertCurrency(asset.totalEarnings, earningsCurrency, asset.currency);
  const principal = asset.currentAmount - totalEarningsInBase;
  const holdingYield = principal > 0 ? (totalEarningsInBase / principal) * 100 : 0;
  
  const today = new Date();
  let sum7DayEarningsDisplay = 0; 
  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    sum7DayEarningsDisplay += (asset.dailyEarnings[dateStr] || 0);
  }
  const sum7DayEarningsInBase = convertCurrency(sum7DayEarningsDisplay, earningsCurrency, asset.currency);
  const real7DayYield = principal > 0 ? (sum7DayEarningsInBase / principal) * (365 / 7) * 100 : 0;

  const getDaysHeld = () => {
    if (asset.history.length === 0) return 0;
    const earliestDate = asset.history.reduce((min, p) => p.date < min ? p.date : min, asset.history[0].date);
    const diffTime = new Date().getTime() - new Date(earliestDate).getTime();
    return Math.max(0, Math.floor(diffTime / (1000 * 60 * 60 * 24))); 
  };
  const daysHeld = getDaysHeld();

  return (
    <>
      <div className="transition-all duration-300">
        <div onClick={() => setIsOpen(!isOpen)} className="p-5 flex justify-between items-center cursor-pointer hover:bg-gray-50 transition active:bg-gray-100">
          <div className="flex items-center gap-3 flex-1 min-w-0 pr-2">
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-white font-bold text-sm shadow-md shrink-0 ${
                asset.type === AssetType.FUND ? 'bg-gradient-to-br from-blue-400 to-blue-600' : 
                asset.type === AssetType.STOCK ? 'bg-gradient-to-br from-red-500 to-red-700' : 
                asset.type === AssetType.GOLD ? 'bg-gradient-to-br from-yellow-400 to-yellow-600' : 
                'bg-gradient-to-br from-purple-400 to-purple-600'
            }`}>
              {asset.type === AssetType.FUND ? '基' : 
               asset.type === AssetType.STOCK ? '股' : 
               asset.type === AssetType.GOLD ? '金' : '其'}
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-bold text-gray-800 text-base break-words leading-tight">{asset.productName}</h3>
              <div className="flex flex-wrap items-center gap-2 mt-1.5">
                  <div className={`text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1 font-bold ${holdingYield >= 0 ? 'bg-red-50 text-red-500' : 'bg-green-50 text-green-500'}`}><span>持仓 {holdingYield.toFixed(2)}%</span></div>
                  <div className={`text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1 font-bold ${real7DayYield >= 0 ? 'bg-red-50 text-red-500' : 'bg-green-50 text-green-500'}`}><span>近7日年化 {real7DayYield.toFixed(2)}%</span></div>
                  <div className="text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1 font-bold bg-blue-50 text-blue-500"><span>持仓 {daysHeld} 天</span></div>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
             <div className="text-right">
              <p className="font-bold text-gray-900 text-lg font-mono tracking-tight leading-tight">{principalSymbol} {asset.currentAmount.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</p>
              <p className={`text-xs font-bold ${asset.totalEarnings >= 0 ? 'text-red-500' : 'text-green-500'}`}>{asset.totalEarnings >= 0 ? '+' : ''}{earningsSymbol} {asset.totalEarnings.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</p>
            </div>
          </div>
        </div>
        <div className={`overflow-hidden transition-all duration-300 ease-in-out bg-gray-50 border-t border-gray-100 ${isOpen ? 'max-h-[1000px] opacity-100' : 'max-h-0 opacity-0'}`}>
          <div className="p-4">
            <div className="flex justify-between items-center mb-3 px-1">
              <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5"><History size={14} /> 资金明细</h4>
              <div className="flex items-center gap-2">
                  <button onClick={(e) => { e.stopPropagation(); onDirectAIScan('earning'); }} className="text-xs bg-indigo-50 border border-indigo-100 px-3 py-1.5 rounded-full text-indigo-600 flex items-center gap-1.5 hover:bg-indigo-100 font-bold shadow-sm transition-colors"><Sparkles size={12} /> 收益录入</button>
                  <button onClick={(e) => { e.stopPropagation(); onDirectAIScan('withdrawal'); }} className="text-xs bg-orange-50 border border-orange-100 px-3 py-1.5 rounded-full text-orange-600 flex items-center gap-1.5 hover:bg-orange-100 font-bold shadow-sm transition-colors"><ArrowUpRight size={12} /> 赎回</button>
                  <button onClick={(e) => { e.stopPropagation(); setShowCalendar(true); }} className="text-xs bg-white border border-gray-200 px-3 py-1.5 rounded-full text-gray-600 flex items-center gap-1.5 hover:bg-gray-100 font-medium shadow-sm transition-colors"><Calendar size={14} className="text-blue-500"/> 查看日历</button>
              </div>
            </div>
            <div className="space-y-3 max-h-56 overflow-y-auto pr-1 custom-scrollbar">
              {asset.history.length === 0 ? <p className="text-center text-xs text-gray-400 py-4">暂无记录</p> : asset.history.map(record => {
                  const txCurrency = record.currency || (record.type === 'deposit' ? asset.currency : earningsCurrency);
                  const txSymbol = getSymbol(txCurrency);
                  const isDeposit = record.type === 'deposit';
                  const isWithdrawal = record.type === 'withdrawal';
                  const isPositiveEarning = record.type === 'earning' && record.amount > 0;
                  
                  let textColorClass = '';
                  let dotColorClass = '';

                  if (isDeposit) {
                    textColorClass = 'text-blue-500';
                    dotColorClass = 'bg-blue-500';
                  } else if (isWithdrawal) {
                    textColorClass = 'text-orange-500';
                    dotColorClass = 'bg-orange-500';
                  } else {
                    textColorClass = isPositiveEarning ? 'text-red-500' : 'text-green-600';
                    dotColorClass = isPositiveEarning ? 'bg-red-500' : 'bg-green-600';
                  }

                  return (
                    <div key={record.id} className="flex justify-between items-center text-sm bg-white p-3 rounded-lg shadow-sm border border-gray-100 group">
                      <div className="flex items-center gap-3">
                        <div className={`w-1.5 h-1.5 rounded-full ${dotColorClass}`}></div>
                        <span className="text-gray-400 text-xs">{record.date}</span>
                        <div className="flex items-center gap-1">
                            {isWithdrawal && <LogOut size={12} className="text-orange-400" />}
                            <span className="text-gray-700 font-medium truncate max-w-[80px] sm:max-w-[120px]">{record.description}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`font-mono font-bold ${textColorClass}`}>
                            {isWithdrawal ? '-' : ''}{txSymbol}{Math.abs(record.amount).toLocaleString()}
                        </span>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={(e) => { e.stopPropagation(); onEditTransaction(record); }} className="p-1.5 text-gray-300 hover:text-blue-500 hover:bg-blue-50 rounded transition"><Pencil size={14} /></button>
                            <button onClick={(e) => { e.stopPropagation(); onDeleteTransaction(record.id); }} className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded transition"><Trash2 size={14} /></button>
                        </div>
                      </div>
                    </div>
                  );
                })
              }
            </div>
            <div className="mt-4 pt-3 border-t border-gray-100 flex gap-2">
               <button onClick={(e) => { e.stopPropagation(); onEditInfo(); }} className="flex-1 flex items-center justify-center gap-1.5 text-xs text-blue-500 hover:text-blue-600 transition-colors py-2 rounded-lg hover:bg-blue-50 font-bold bg-blue-50/50 cursor-pointer"><Settings size={14} /><span>修改信息</span></button>
               <button onClick={(e) => { e.stopPropagation(); onDelete(asset.id); }} className="flex-1 flex items-center justify-center gap-1.5 text-xs text-gray-400 hover:text-red-500 transition-colors py-2 rounded-lg hover:bg-red-50 cursor-pointer"><Trash2 size={14} /><span>删除资产</span></button>
            </div>
          </div>
        </div>
      </div>
      {showCalendar && <EarningsCalendar asset={asset} onClose={() => setShowCalendar(false)} />}
    </>
  );
};

const EditTransactionModal: React.FC<{ transaction: Transaction; onSave: (t: Transaction) => void; onDelete: () => void; onClose: () => void }> = ({ transaction, onSave, onDelete, onClose }) => {
  const [date, setDate] = useState(transaction.date);
  const [amountStr, setAmountStr] = useState(transaction.amount.toString());
  const [description, setDescription] = useState(transaction.description || '');
  const handleSave = () => onSave({ ...transaction, date, amount: parseFloat(amountStr) || 0, description });
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fadeIn">
      <div className="bg-white w-full max-w-xs rounded-2xl p-6 shadow-2xl">
         <div className="flex justify-between items-center mb-6"><h3 className="font-bold text-lg text-gray-800">编辑记录</h3><button onClick={onClose}><X size={20} className="text-gray-400" /></button></div>
         <div className="space-y-4">
            <div><label className="text-xs text-gray-500 font-bold block mb-1.5">日期</label><input type="date" className="w-full bg-gray-50 border border-gray-200 rounded-lg h-12 px-3 text-sm" value={date} onChange={e => setDate(e.target.value)} /></div>
            <div><label className="text-xs text-gray-500 font-bold block mb-1.5">金额</label><input type="number" className="w-full bg-gray-50 border border-gray-200 rounded-lg h-12 px-3 text-sm font-bold" value={amountStr} onChange={e => setAmountStr(e.target.value)} /></div>
            <div><label className="text-xs text-gray-500 font-bold block mb-1.5">备注</label><input type="text" className="w-full bg-gray-50 border border-gray-200 rounded-lg h-12 px-3 text-sm" value={description} onChange={e => setDescription(e.target.value)} /></div>
         </div>
         <div className="flex gap-3 mt-8"><button onClick={onDelete} className="flex-1 py-2.5 bg-red-50 text-red-500 text-sm font-bold rounded-lg hover:bg-red-100 transition">删除</button><button onClick={handleSave} className="flex-1 py-2.5 bg-gray-900 text-white text-sm font-bold rounded-lg hover:bg-black transition">保存</button></div>
      </div>
    </div>
  );
};

const EditAssetInfoModal: React.FC<{ asset: Asset; onSave: (asset: Asset) => void; onClose: () => void; }> = ({ asset, onSave, onClose }) => {
  const [formData, setFormData] = useState({ institution: asset.institution, productName: asset.productName, type: asset.type, currency: asset.currency, earningsCurrency: asset.earningsCurrency || asset.currency, sevenDayYield: asset.sevenDayYield?.toString() || '', remark: asset.remark || '' });
  const handleSave = () => onSave({ ...asset, ...formData, sevenDayYield: parseFloat(formData.sevenDayYield) || 0, currency: formData.currency as Currency, earningsCurrency: formData.earningsCurrency as Currency, type: formData.type as AssetType });
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fadeIn">
      <div className="bg-white w-full max-w-md rounded-2xl p-6 shadow-2xl animate-slideUp">
        <div className="flex justify-between items-center mb-6"><h2 className="text-lg font-bold text-gray-800">修改资产信息</h2><button onClick={onClose}><X size={20} className="text-gray-400" /></button></div>
        <div className="space-y-4">
          <div><label className="block text-gray-500 text-xs font-bold mb-1.5">投资渠道</label><input type="text" className="w-full bg-gray-50 border border-gray-200 rounded-xl h-12 px-3 text-sm font-bold text-gray-800 outline-none focus:ring-2 focus:ring-blue-500 transition-all" value={formData.institution} onChange={(e) => setFormData({ ...formData, institution: e.target.value })} /></div>
          <div><label className="block text-gray-500 text-xs font-bold mb-1.5">产品名称</label><input type="text" className="w-full bg-gray-50 border border-gray-200 rounded-xl h-12 px-3 text-sm font-bold text-gray-800 outline-none focus:ring-2 focus:ring-blue-500 transition-all" value={formData.productName} onChange={(e) => setFormData({ ...formData, productName: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-gray-500 text-xs font-bold mb-1.5">资产类型</label><select className="w-full bg-gray-50 border border-gray-200 rounded-xl h-12 px-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none appearance-none transition-all" value={formData.type} onChange={(e) => setFormData({ ...formData, type: e.target.value as AssetType})}><option value={AssetType.FUND}>基金</option><option value={AssetType.STOCK}>股票</option><option value={AssetType.GOLD}>黄金</option><option value={AssetType.OTHER}>其他</option></select></div>
            <div><label className="block text-gray-500 text-xs font-bold mb-1.5">本金货币</label><select className="w-full bg-gray-50 border border-gray-200 rounded-xl h-12 px-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none appearance-none font-bold transition-all" value={formData.currency} onChange={(e) => setFormData({ ...formData, currency: e.target.value as Currency })}><option value="CNY">CNY (人民币)</option><option value="USD">USD (美元)</option><option value="HKD">HKD (港币)</option></select></div>
          </div>
          <div><label className="block text-gray-500 text-xs font-bold mb-1.5 flex items-center gap-2">收益货币</label><div className="relative"><select className="w-full bg-gray-50 border border-gray-200 rounded-xl h-12 px-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none appearance-none font-bold transition-all" value={formData.earningsCurrency} onChange={(e) => setFormData({ ...formData, earningsCurrency: e.target.value as Currency })}><option value="CNY">CNY (人民币)</option><option value="USD">USD (美元)</option><option value="HKD">HKD (港币)</option></select><ArrowRightLeft size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" /></div></div>
          <div className="flex gap-4">
             <div className="flex-1"><label className="block text-gray-500 text-xs font-bold mb-1.5">年化 (%)</label><input type="number" className="w-full bg-gray-50 border border-gray-200 rounded-xl h-12 px-3 text-sm" value={formData.sevenDayYield} onChange={(e) => setFormData({ ...formData, sevenDayYield: e.target.value })} /></div>
             <div className="flex-[2]"><label className="block text-gray-500 text-xs font-bold mb-1.5">备注</label><input type="text" className="w-full bg-gray-50 border border-gray-200 rounded-xl h-12 px-3 text-sm" value={formData.remark} onChange={(e) => setFormData({ ...formData, remark: e.target.value })} /></div>
          </div>
        </div>
        <div className="flex gap-3 mt-8"><button onClick={onClose} className="flex-1 py-3.5 rounded-xl bg-gray-100 text-gray-600 font-bold text-sm hover:bg-gray-200 transition-colors">取消</button><button onClick={handleSave} className="flex-1 py-3.5 rounded-xl bg-gray-900 text-white font-bold text-sm shadow-lg hover:bg-black transition-colors">保存修改</button></div>
      </div>
    </div>
  );
};

const UserProfileModal: React.FC<{ user: any; onClose: () => void; onLogout: () => void; }> = ({ user, onClose, onLogout }) => {
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fadeIn">
      <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-2xl animate-scaleIn">
        <div className="flex flex-col items-center mb-6">
          <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mb-4"><UserCircle size={48} className="text-gray-400" /></div>
          <h3 className="font-bold text-lg text-gray-800">当前账号</h3>
          <p className="text-sm text-gray-500 font-mono mt-1 text-center truncate w-full px-4">{user?.isAnonymous ? "匿名用户 (数据仅在本地/当前会话有效)" : user?.email || user?.uid}</p>
        </div>
        <div className="space-y-3">
          <button onClick={onLogout} className="w-full py-3.5 bg-red-50 text-red-500 font-bold text-sm rounded-xl flex items-center justify-center gap-2 hover:bg-red-100 transition"><LogOut size={16} /> 退出登录</button>
          <button onClick={onClose} className="w-full py-3.5 bg-gray-50 text-gray-600 font-bold text-sm rounded-xl hover:bg-gray-100 transition">关闭</button>
        </div>
      </div>
    </div>
  );
};

/**
 * --- MAIN COMPONENT ---
 */
export default function App() {
  const [user, setUser] = useState<any | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [assets, setAssets] = useState<Asset[]>([]);
  
  const [activeTab, setActiveTab] = useState<'assets' | 'analysis' | 'ai' | 'me'>('assets');
  const [privacyMode, setPrivacyMode] = useState(false);
  const [dashboardCurrency, setDashboardCurrency] = useState<Currency>('CNY');

  // Modal Control
  const [showAddModal, setShowAddModal] = useState(false);
  const [showScanModal, setShowScanModal] = useState(false);
  const [scanTargetId, setScanTargetId] = useState<string>('auto'); 
  const [manualInstitution, setManualInstitution] = useState('');
  const [manualCurrency, setManualCurrency] = useState<Currency | ''>('');
  const [manualAmount, setManualAmount] = useState(''); 
  const [manualDate, setManualDate] = useState<string>(new Date().toISOString().split('T')[0]); 
  
  // 新增：isManualEntryMode 状态，用于区分是点击了主页扫描按钮还是点击了卡片录入按钮
  const [modalMode, setModalMode] = useState<'global' | 'earning' | 'withdrawal'>('global');

  const [showGuide, setShowGuide] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [isProcessingAI, setIsProcessingAI] = useState(false);
  const [lastProcessedCount, setLastProcessedCount] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [editingTransaction, setEditingTransaction] = useState<{ assetId: string, transaction: Transaction } | null>(null);
  const [editingAssetInfo, setEditingAssetInfo] = useState<Asset | null>(null);
  const [confirmDeleteAssetId, setConfirmDeleteAssetId] = useState<string | null>(null);
  const [newAsset, setNewAsset] = useState<{ institution: string; productName: string; type: AssetType; currency: Currency; amount: string; date: string; yield: string; remark: string; }>({ institution: '', productName: '', type: AssetType.FUND, currency: 'CNY', amount: '', date: new Date().toISOString().split('T')[0], yield: '', remark: '' });

  // Auth & Data
  useEffect(() => {
    const initAuth = async () => {
      // @ts-ignore
      if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
        // @ts-ignore
        await signInWithCustomToken(auth, __initial_auth_token);
      } else {
        await signInAnonymously(auth);
      }
    };
    initAuth();

    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'artifacts', appId, 'users', user.uid, 'assets'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const loaded: Asset[] = [];
      snapshot.forEach((doc) => loaded.push({ id: doc.id, ...doc.data() } as Asset));
      setAssets(consolidateAssets(loaded));
    });
    return () => unsubscribe();
  }, [user]);

  // Handlers

  // 手动处理收益/赎回录入
  const handleManualEarningSubmit = async () => {
    if (!manualAmount || !user) return;
    const amt = parseFloat(manualAmount);
    if (isNaN(amt)) {
      alert("请输入有效的金额");
      return;
    }

    if (scanTargetId === 'auto') {
      alert("手动录入时，请先选择一个确定的目标资产，或者使用“记一笔”功能创建新资产。");
      return;
    }

    const asset = assets.find(a => a.id === scanTargetId);
    if (!asset) return;

    const newTx: Transaction = {
      id: Date.now().toString(),
      date: manualDate, 
      type: modalMode === 'withdrawal' ? 'withdrawal' : 'earning',
      amount: amt,
      currency: (manualCurrency as Currency) || asset.earningsCurrency || asset.currency,
      description: modalMode === 'withdrawal' ? '手动录入赎回' : '手动录入收益'
    };

    const updatedHistory = [newTx, ...asset.history];
    let earningsCurrencyUpdate = asset.earningsCurrency;
    if (newTx.currency && newTx.currency !== asset.currency) {
      earningsCurrencyUpdate = newTx.currency;
    }

    try {
      await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'assets', scanTargetId), { 
        history: updatedHistory,
        earningsCurrency: earningsCurrencyUpdate
      });
      setLastProcessedCount(1);
      setManualAmount('');
      setTimeout(() => setShowScanModal(false), 500);
    } catch (e) {
      console.error(e);
      alert("保存失败，请重试");
    }
  };

  const handleAIUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length || !user) return;
    setIsProcessingAI(true);
    setLastProcessedCount(0);
    try {
      const records = await Promise.all(Array.from(e.target.files).map(async f => {
        const reader = new FileReader();
        return new Promise<AIAssetRecord[]>((resolve, reject) => { 
          reader.onload = async () => {
              try {
                  resolve(await analyzeEarningsScreenshot(reader.result as string));
              } catch (e) {
                  reject(e); 
              }
          };
          reader.onerror = (e) => reject(e);
          reader.readAsDataURL(f);
        });
      }));
      
      const flatRecords = records.flat();
      if (manualCurrency) flatRecords.forEach(r => r.currency = manualCurrency as Currency);
      
      const groups = new Map<string, { product: string; currency: Currency; type: AssetType; inst: string; records: AIAssetRecord[] }>();
      flatRecords.forEach(r => {
         const key = `${r.productName}|${r.currency || 'CNY'}`;
         if (!groups.has(key)) groups.set(key, { product: r.productName!, currency: (r.currency as Currency) || 'CNY', type: (r.assetType as AssetType) || AssetType.FUND, inst: r.institution || '', records: [] });
         groups.get(key)!.records.push(r);
      });

      let count = 0;
      for (const group of groups.values()) {
         let targetId = scanTargetId !== 'auto' ? scanTargetId : findMatchingAsset(assets, group.product, manualInstitution || group.inst, group.currency)?.id;
         
         const newTx: Transaction[] = group.records.filter(r => r.amount).map(r => {
            let txType = r.type;
            let desc = '';
            
            if (modalMode === 'withdrawal') {
                txType = 'withdrawal';
                desc = 'AI 识别赎回';
            } else if (txType === 'withdrawal') {
                desc = 'AI 识别赎回';
            } else {
                desc = r.type === 'deposit' ? 'AI 识别买入' : 'AI 识别收益';
            }

            return {
                id: Date.now() + Math.random().toString(),
                date: r.date,
                type: txType,
                amount: r.amount,
                currency: r.currency as Currency,
                description: desc
            };
         });

         if (targetId) {
            const asset = assets.find(a => a.id === targetId)!;
            const uniqueTx = newTx.filter(tx => !asset.history.some(h => h.date === tx.date && h.type === tx.type && Math.abs(h.amount - tx.amount) < 0.01));
            if (uniqueTx.length) {
               const assetRef = doc(db, 'artifacts', appId, 'users', user.uid, 'assets', targetId);
               const updatedHistory = [...uniqueTx, ...asset.history];
               let earningsCurrencyUpdate = asset.earningsCurrency;
               uniqueTx.forEach(tx => {
                   if (tx.type === 'earning' && tx.currency && tx.currency !== asset.currency) {
                       earningsCurrencyUpdate = tx.currency;
                   }
               });
               await updateDoc(assetRef, { history: updatedHistory, earningsCurrency: earningsCurrencyUpdate });
               count += uniqueTx.length;
            }
         } else {
            await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'assets'), {
               institution: manualInstitution || group.inst || '未命名渠道',
               productName: group.product,
               type: group.type,
               currency: group.currency,
               earningsCurrency: group.currency,
               currentAmount: 0, totalEarnings: 0, sevenDayYield: 0, remark: 'AI 自动创建', dailyEarnings: {},
               history: newTx
            });
            count += newTx.length;
         }
      }
      setLastProcessedCount(count);
    } catch (e) { 
        console.error(e); 
        alert("识别过程中出现错误，请检查网络或图片内容"); 
    }
    finally { setIsProcessingAI(false); if(fileInputRef.current) fileInputRef.current.value = ''; }
  };

  const handleAddAsset = async () => {
     if (!newAsset.productName || !newAsset.amount || !user) return;
     const amt = parseFloat(newAsset.amount);
     const tx: Transaction = { id: Date.now().toString(), date: newAsset.date, type: 'deposit', amount: amt, currency: newAsset.currency, description: newAsset.remark || '手动记录' };
     const existing = assets.find(a => a.institution === newAsset.institution && a.productName === newAsset.productName && a.currency === newAsset.currency);
     
     if (existing) {
        await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'assets', existing.id), { history: [tx, ...existing.history], sevenDayYield: parseFloat(newAsset.yield) || existing.sevenDayYield });
     } else {
        await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'assets'), {
           institution: newAsset.institution, productName: newAsset.productName, type: newAsset.type, currency: newAsset.currency, earningsCurrency: newAsset.currency,
           currentAmount: 0, totalEarnings: 0, sevenDayYield: parseFloat(newAsset.yield) || 0, remark: newAsset.remark, dailyEarnings: {}, history: [tx]
        });
     }
     setShowAddModal(false);
  };

  const handleUpdateTransaction = async (updatedTx: Transaction) => {
    if (!editingTransaction || !user) return;
    const asset = assets.find(a => a.id === editingTransaction.assetId);
    if (!asset) return;
    const newHistory = asset.history.map(tx => tx.id === updatedTx.id ? updatedTx : tx);
    await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'assets', asset.id), { history: newHistory });
    setEditingTransaction(null);
  };

  const handleDeleteTransaction = async (txId: string) => {
    if (!editingTransaction || !user) return;
    const asset = assets.find(a => a.id === editingTransaction.assetId);
    if (!asset) return;
    const newHistory = asset.history.filter(tx => tx.id !== txId);
    await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'assets', asset.id), { history: newHistory });
    setEditingTransaction(null);
  };

  const handleDeleteSpecificTransaction = async (assetId: string, txId: string) => {
    if (!user) return;
    const asset = assets.find(a => a.id === assetId);
    if (!asset) return;
    const newHistory = asset.history.filter(tx => tx.id !== txId);
    await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'assets', assetId), { history: newHistory });
    setEditingTransaction(null);
  };

  const handleSaveAssetInfo = async (updatedAsset: Asset) => {
    if (!user) return;
    const { id, currentAmount, totalEarnings, dailyEarnings, history, ...rest } = updatedAsset;
    await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'assets', id), rest);
    setEditingAssetInfo(null);
  };

  const handleDeleteAssetRequest = (id: string) => {
    setConfirmDeleteAssetId(id);
  };

  const executeDeleteAsset = async () => {
    if (!confirmDeleteAssetId || !user) return;
    await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'assets', confirmDeleteAssetId));
    setConfirmDeleteAssetId(null);
  };

  if (authLoading) return <div className="min-h-screen flex items-center justify-center bg-[#ededed]"><Loader2 className="animate-spin text-gray-400" size={32} /></div>;

  if (!user) {
    return <AuthScreen />;
  }

  const renderContent = () => {
    switch (activeTab) {
      case 'assets':
        return (
          <AssetsPage 
            assets={assets}
            dashboardCurrency={dashboardCurrency}
            setDashboardCurrency={setDashboardCurrency}
            privacyMode={privacyMode}
            onOpenAdd={() => setShowAddModal(true)}
            onOpenScan={(mode) => {
              setScanTargetId('auto');
              setManualInstitution('');
              setManualCurrency('');
              setManualAmount('');
              setManualDate(new Date().toISOString().split('T')[0]);
              setModalMode(mode);
              setShowScanModal(true);
              setLastProcessedCount(0);
            }}
            onEditAsset={handleEditAsset}
            onDeleteAsset={(id) => setConfirmDeleteAssetId(id)}
            onEditTransaction={(assetId, tx) => setEditingTransaction({ assetId, transaction: tx })}
            onDeleteTransaction={(assetId, txId) => handleDeleteTransaction(assetId, txId)}
          />
        );
      case 'analysis':
        return <AnalysisPage />;
      case 'ai':
        return <AILabPage />;
      case 'me':
        return <ProfilePage user={user} onLogout={() => signOut(auth)} />;
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-[#ededed] text-[#111111] pb-32 font-sans">
      <input type="file" multiple accept="image/*" ref={fileInputRef} onChange={handleAIUpload} className="hidden" />
      
      {activeTab === 'assets' && (
        <TopNavBar 
          title="我的资产" 
          privacyMode={privacyMode}
          onTogglePrivacy={() => setPrivacyMode(!privacyMode)}
          onScan={() => {
             setScanTargetId('auto');
             setManualInstitution('');
             setManualCurrency('');
             setManualAmount('');
             setManualDate(new Date().toISOString().split('T')[0]);
             setModalMode('global');
             setShowScanModal(true);
             setLastProcessedCount(0);
          }}
        />
      )}
      
      {activeTab !== 'assets' && (
         <header className="sticky top-0 z-40 bg-[#ededed]/90 backdrop-blur-md px-6 pt-12 pb-4">
            <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight leading-none">
              {activeTab === 'analysis' ? '趋势分析' : activeTab === 'ai' ? 'AI 实验室' : '个人中心'}
            </h1>
         </header>
      )}

      <main className="pb-24 pt-4">
        {renderContent()}
      </main>

      <BottomNav activeTab={activeTab} onChange={setActiveTab} />

      <AIScanModal 
        isOpen={showScanModal} 
        onClose={() => !isProcessingAI && setShowScanModal(false)} 
        onUpload={() => fileInputRef.current?.click()} 
        isProcessing={isProcessingAI} 
        assets={assets} 
        targetAssetId={scanTargetId} 
        setTargetAssetId={setScanTargetId} 
        manualCurrency={manualCurrency} 
        setManualCurrency={setManualCurrency} 
        manualInstitution={manualInstitution} 
        setManualInstitution={setManualInstitution} 
        lastProcessedCount={lastProcessedCount}
        manualAmount={manualAmount} 
        setManualAmount={setManualAmount}
        manualDate={manualDate} 
        setManualDate={setManualDate}
        onManualSubmit={handleManualEarningSubmit}
        modalMode={modalMode} 
      />
      
      {showAddModal && <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm animate-fadeIn"><div className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl animate-slideUp"><h2 className="text-xl font-bold mb-6 text-gray-800 text-center">记录新资产</h2><div className="space-y-4">
      {/* 统一高度修改：SmartInput */}
      <SmartInput label="投资渠道" placeholder="例如：支付宝" value={newAsset.institution} onChange={(v) => setNewAsset({...newAsset, institution: v})} suggestions={['支付宝', '微信理财通', '招商银行', '工商银行']} />
      <SmartInput label="产品名称" placeholder="例如：易方达蓝筹" value={newAsset.productName} onChange={(v) => setNewAsset({...newAsset, productName: v})} suggestions={getUniqueProductNames(assets)} />
      <div className="grid grid-cols-2 gap-4">
        <div><label className="block text-gray-500 text-xs font-bold mb-1.5">记录日期</label>
        {/* 统一高度修改：h-12 */}
        <input type="date" className="w-full bg-gray-50 border border-gray-200 rounded-xl h-12 px-3 text-sm font-bold text-gray-800 outline-none focus:ring-2 focus:ring-blue-500 transition-all" value={newAsset.date} onChange={(e) => setNewAsset({...newAsset, date: e.target.value})} /></div>
        <div><label className="block text-gray-500 text-xs font-bold mb-1.5">资产类型</label>
        {/* 统一高度修改：h-12 */}
        <select className="w-full bg-gray-50 border border-gray-200 rounded-xl h-12 px-3 text-sm font-bold text-gray-800 outline-none focus:ring-2 focus:ring-blue-500 transition-all appearance-none" value={newAsset.type} onChange={(e) => setNewAsset({...newAsset, type: e.target.value as AssetType})}><option value={AssetType.FUND}>基金</option><option value={AssetType.STOCK}>股票</option><option value={AssetType.GOLD}>黄金</option><option value={AssetType.OTHER}>其他</option></select></div></div>
        <div className="grid grid-cols-2 gap-4">
          <div><label className="block text-gray-500 text-xs font-bold mb-1.5">货币种类</label>
          {/* 统一高度修改：h-12 */}
          <select className="w-full bg-gray-50 border border-gray-200 rounded-xl h-12 px-3 text-sm font-bold text-gray-800 outline-none focus:ring-2 focus:ring-blue-500 transition-all appearance-none" value={newAsset.currency} onChange={(e) => setNewAsset({...newAsset, currency: e.target.value as Currency})}><option value="CNY">CNY</option><option value="USD">USD</option><option value="HKD">HKD</option></select></div>
          <div><label className="block text-gray-500 text-xs font-bold mb-1.5">金额</label>
          {/* 统一高度修改：h-12，移除了 py-3 以避免高度撑开 */}
          <input type="number" className="w-full bg-gray-50 border border-gray-200 rounded-xl h-12 px-3 text-lg font-bold text-gray-900 outline-none focus:ring-2 focus:ring-blue-500 transition-all" placeholder="0.00" value={newAsset.amount} onChange={(e) => setNewAsset({...newAsset, amount: e.target.value})} /></div></div>
          <div className="flex gap-4">
            <div className="flex-1"><label className="block text-gray-500 text-xs font-bold mb-1.5">年化 (%)</label>
            {/* 统一高度修改：h-12 */}
            <input type="number" className="w-full bg-gray-50 border border-gray-200 rounded-xl h-12 px-3 text-sm font-bold text-gray-800 outline-none focus:ring-2 focus:ring-blue-500 transition-all" placeholder="2.5" value={newAsset.yield} onChange={(e) => setNewAsset({...newAsset, yield: e.target.value})} /></div>
            <div className="flex-[2]"><label className="block text-gray-500 text-xs font-bold mb-1.5">备注</label>
            {/* 统一高度修改：h-12 */}
            <input type="text" className="w-full bg-gray-50 border border-gray-200 rounded-xl h-12 px-3 text-sm font-bold text-gray-800 outline-none focus:ring-2 focus:ring-blue-500 transition-all" placeholder="选填" value={newAsset.remark} onChange={(e) => setNewAsset({...newAsset, remark: e.target.value})} /></div></div><div className="flex gap-3 mt-8"><button onClick={() => setShowAddModal(false)} className="flex-1 py-3.5 rounded-xl bg-gray-100 text-gray-600 font-bold text-sm hover:bg-gray-200 transition-colors">取消</button><button onClick={handleAddAsset} className="flex-1 py-3.5 rounded-xl bg-gray-900 text-white font-bold text-sm shadow-lg hover:bg-black transition-colors">确认</button></div></div></div></div>}
      
      {editingAssetInfo && <EditAssetInfoModal asset={editingAssetInfo} onSave={handleSaveAssetInfo} onClose={() => setEditingAssetInfo(null)} />}
      {editingTransaction && <EditTransactionModal transaction={editingTransaction.transaction} onSave={handleUpdateTransaction} onDelete={() => handleDeleteTransaction(editingTransaction.transaction.id)} onClose={() => setEditingTransaction(null)} />}
      {confirmDeleteAssetId && <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fadeIn"><div className="bg-white w-full max-w-xs rounded-2xl p-6 shadow-2xl"><div className="flex flex-col items-center text-center mb-6"><div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mb-4"><AlertTriangle size={24} className="text-red-500" /></div><h3 className="text-lg font-bold text-gray-800">确认删除该资产？</h3><p className="text-sm text-gray-500 mt-2">删除后，该资产的所有历史记录和收益明细将无法恢复。</p></div><div className="flex gap-3"><button onClick={() => setConfirmDeleteAssetId(null)} className="flex-1 py-3 rounded-xl bg-gray-100 text-gray-700 font-bold text-sm">取消</button><button onClick={executeDeleteAsset} className="flex-1 py-3 rounded-xl bg-red-500 text-white font-bold text-sm">确认删除</button></div></div></div>}
      {showProfileModal && user && <UserProfileModal user={user} onClose={() => setShowProfileModal(false)} onLogout={() => { signOut(auth); setShowProfileModal(false); }} />}
      {showGuide && <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm p-6 animate-fadeIn"><div className="bg-white rounded-2xl max-w-md w-full p-8 shadow-2xl"><h2 className="text-2xl font-bold text-gray-800 mb-6">使用说明</h2><div className="space-y-4 text-gray-600 text-sm leading-relaxed"><ul className="list-disc pl-5 space-y-2"><li><strong>货币切换</strong>：点击顶部总资产旁的货币符号，可切换 CNY/USD/HKD 显示。</li><li><strong>混合货币支持</strong>：支持本金和收益使用不同的货币。</li><li><strong>记录资产</strong>：点击底部“记一笔”添加资产。</li><li><strong>AI 智能识别</strong>：支持上传支付宝/银行App的截图，自动识别资产和收益。</li></ul></div><button onClick={() => setShowGuide(false)} className="mt-8 w-full py-3 bg-gray-900 text-white font-bold rounded-xl active:scale-95 transition">开始使用</button></div></div>}
    </div>
  );
}

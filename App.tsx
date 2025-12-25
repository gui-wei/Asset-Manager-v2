import React, { useState, useEffect, useRef } from 'react';
import { 
  Plus, ChevronDown, HelpCircle, Wallet, 
  X, RefreshCw, Camera, AlertTriangle, Sparkles, ArrowRightLeft, 
  Loader2, Mail, Lock, ArrowRight, CheckCircle2, UploadCloud,
  Briefcase, Home, Rocket, CreditCard, Banknote, Trophy, Edit3
} from 'lucide-react';

// Firebase Imports
import { initializeApp } from "firebase/app";
import { 
  getAuth, 
  onAuthStateChanged,
  User,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut
} from "firebase/auth";
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

// Component Imports
import BottomNav from './components/Layout/BottomNav';
import AssetsPage from './src/pages/AssetsPage';
import AnalysisPage from './src/pages/AnalysisPage';
import ProfilePage from './src/pages/ProfilePage';
import SalaryPage from './src/pages/SalaryPage';
import SmartInput from './components/SmartInput';

import { analyzeEarningsScreenshot, analyzeSalaryScreenshot, AIAssetRecord } from './services/gemini';
import { Asset, Transaction, AssetType, Currency, SalaryRecord } from './types';

// --- TYPES & CONSTANTS ---

const getUniqueProductNames = (assets: Asset[]): string[] => {
  const names = new Set<string>();
  assets.forEach(a => names.add(a.productName));
  return Array.from(names);
};

const normalizeString = (str: string) => {
    if (!str) return '';
    return str.replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '').toLowerCase();
};

const consolidateAssets = (rawAssets: Asset[]): Asset[] => {
  const RATES: Record<string, number> = { CNY: 1, USD: 7.2, HKD: 0.92 };
  const convert = (amt: number, f: string, t: string) => (f === t) ? amt : (amt * RATES[f]) / RATES[t];

  return rawAssets.map(asset => {
    let totalPrincipalBase = 0; 
    let totalEarningsBase = 0;
    let totalEarningsDisplay = 0; 
    const dailyMap: Record<string, number> = {}; 

    const sortedHistory = [...asset.history].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    sortedHistory.forEach(tx => {
      const txCurrency = tx.currency || (tx.type === 'deposit' ? asset.currency : (asset.earningsCurrency || asset.currency));
      const isDeposit = tx.type === 'deposit';
      const isEarning = tx.type === 'earning';

      if (isDeposit) {
        totalPrincipalBase += convert(tx.amount, txCurrency as string, asset.currency);
      } else if (isEarning) {
        const earningForDisplay = convert(tx.amount, txCurrency as string, asset.earningsCurrency || asset.currency);
        totalEarningsDisplay += earningForDisplay;
        dailyMap[tx.date] = (dailyMap[tx.date] || 0) + earningForDisplay;
        const earningForBase = convert(tx.amount, txCurrency as string, asset.currency);
        totalEarningsBase += earningForBase;
      }
    });
    
    const currentAmount = totalPrincipalBase + totalEarningsBase;

    return {
      ...asset,
      currentAmount,
      totalEarnings: totalEarningsDisplay,
      dailyEarnings: dailyMap,
      history: [...sortedHistory].reverse()
    };
  });
};

const findMatchingAsset = (assets: Asset[], targetName: string, targetInst: string, targetCurrency: string): Asset | undefined => {
  return assets.find(a => {
    if (a.currency !== targetCurrency && a.earningsCurrency !== targetCurrency) return false;
    const normTargetName = normalizeString(targetName);
    const normAssetName = normalizeString(a.productName);
    return normAssetName.includes(normTargetName) || normTargetName.includes(normAssetName);
  });
};

// --- MODALS ---

const AuthScreen: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isRegister, setIsRegister] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const auth = getAuth();

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
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-xl py-3 px-4 text-sm font-bold text-gray-800" placeholder="name@example.com" />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1.5 ml-1">密码</label>
            <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-xl py-3 px-4 text-sm font-bold text-gray-800" placeholder="••••••••" />
          </div>
          {error && <div className="text-red-500 text-xs font-bold bg-red-50 p-3 rounded-lg flex items-center gap-2"><AlertTriangle size={14} /> {error}</div>}
          <button type="submit" disabled={loading} className="w-full py-3.5 bg-gray-900 text-white font-bold rounded-xl shadow-lg hover:bg-black active:scale-95 transition-all flex items-center justify-center gap-2">{loading ? <Loader2 className="animate-spin" size={20} /> : <>{isRegister ? '注册账号' : '立即登录'} <ArrowRight size={18} /></>}</button>
        </form>
        <div className="mt-6 text-center"><button onClick={() => { setIsRegister(!isRegister); setError(''); }} className="text-sm font-bold text-blue-500 hover:text-blue-600 transition-colors">{isRegister ? '已有账号？去登录' : '没有账号？注册新账号'}</button></div>
      </div>
    </div>
  );
};

const AddSalaryModal: React.FC<{ 
  isOpen: boolean; 
  onClose: () => void; 
  onSave: (data: Omit<SalaryRecord, 'id' | 'total'>) => void;
  initialData?: Partial<Omit<SalaryRecord, 'id' | 'total'>>;
}> = ({ isOpen, onClose, onSave, initialData }) => {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM
  const [basicSalary, setBasicSalary] = useState('');
  const [settlingInAllowance, setSettlingInAllowance] = useState('');
  const [extraIncome, setExtraIncome] = useState('');
  const [subsidy, setSubsidy] = useState('');
  const [subsidyType, setSubsidyType] = useState<'card' | 'cash'>('card');
  const [monthlyBonus, setMonthlyBonus] = useState('');
  const [remark, setRemark] = useState('');

  // 监听 initialData 变化，自动填充
  useEffect(() => {
    if(isOpen && initialData) {
        if(initialData.date) setDate(initialData.date);
        if(initialData.basicSalary) setBasicSalary(initialData.basicSalary.toString());
        if(initialData.settlingInAllowance) setSettlingInAllowance(initialData.settlingInAllowance.toString());
        if(initialData.extraIncome) setExtraIncome(initialData.extraIncome.toString());
        if(initialData.subsidy) setSubsidy(initialData.subsidy.toString());
        if(initialData.subsidyType) setSubsidyType(initialData.subsidyType);
        if(initialData.monthlyBonus) setMonthlyBonus(initialData.monthlyBonus.toString());
        if(initialData.remark) setRemark(initialData.remark);
    }
  }, [isOpen, initialData]);

  if (!isOpen) return null;

  const handleSubmit = () => {
    onSave({
      date,
      basicSalary: parseFloat(basicSalary) || 0,
      settlingInAllowance: parseFloat(settlingInAllowance) || 0,
      extraIncome: parseFloat(extraIncome) || 0,
      subsidy: parseFloat(subsidy) || 0,
      subsidyType,
      monthlyBonus: parseFloat(monthlyBonus) || 0,
      remark
    });
    onClose();
    // Reset form
    setBasicSalary(''); setSettlingInAllowance(''); setExtraIncome(''); setSubsidy(''); setMonthlyBonus(''); setRemark('');
  };

  const InputField = ({ label, icon: Icon, value, setValue, placeholder = "¥ 0.00" }: any) => (
    <div className="flex items-center gap-3 mb-4">
      <div className="w-24 text-sm font-bold text-gray-600 flex items-center gap-1">
        <span>{label}</span>
        {Icon && <Icon size={14} className="text-gray-400" />}
      </div>
      <input type={label === '备注' ? 'text' : 'number'} className="flex-1 bg-gray-50 border border-gray-200 rounded-xl py-3 px-4 text-sm font-bold text-gray-800 focus:ring-2 focus:ring-indigo-500 outline-none transition-all" placeholder={placeholder} value={value} onChange={(e) => setValue(e.target.value)} />
    </div>
  );

  return (
    <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl animate-slideUp max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6"><h2 className="text-xl font-bold text-gray-800 flex items-center gap-2"><Plus size={24} className="text-indigo-600" /> 记一笔</h2><button onClick={onClose}><X size={24} className="text-gray-400" /></button></div>
        <div className="mb-6"><label className="block text-xs font-bold text-gray-500 mb-1.5">月份</label><input type="month" className="w-full bg-indigo-50 border border-indigo-100 rounded-xl py-3 px-4 text-lg font-bold text-indigo-900" value={date} onChange={(e) => setDate(e.target.value)} /></div>
        <InputField label="基本工资" icon={Briefcase} value={basicSalary} setValue={setBasicSalary} />
        <InputField label="安家费" icon={Home} value={settlingInAllowance} setValue={setSettlingInAllowance} />
        <InputField label="额外收入" icon={Rocket} value={extraIncome} setValue={setExtraIncome} placeholder="兼职/理财等" />
        <div className="flex items-center gap-3 mb-4"><div className="w-24 text-sm font-bold text-gray-600 flex items-center gap-1">每月补贴 <Sparkles size={14} className="text-red-400"/></div><div className="flex-1 flex flex-col gap-2"><input type="number" className="w-full bg-gray-50 border border-gray-200 rounded-xl py-3 px-4 text-sm font-bold" placeholder="¥ 0.00" value={subsidy} onChange={(e) => setSubsidy(e.target.value)} /><div className="flex gap-4 px-1"><label className="flex items-center gap-2 cursor-pointer"><input type="radio" checked={subsidyType === 'card'} onChange={() => setSubsidyType('card')} className="accent-indigo-600" /><span className="text-xs font-bold text-gray-600 flex items-center gap-1"><CreditCard size={12}/> 购物卡</span></label><label className="flex items-center gap-2 cursor-pointer"><input type="radio" checked={subsidyType === 'cash'} onChange={() => setSubsidyType('cash')} className="accent-indigo-600" /><span className="text-xs font-bold text-gray-600 flex items-center gap-1"><Banknote size={12}/> 现金</span></label></div></div></div>
        <InputField label="每月奖金" icon={Trophy} value={monthlyBonus} setValue={setMonthlyBonus} />
        <InputField label="备注" icon={null} value={remark} setValue={setRemark} placeholder="添加备注..." />
        <button onClick={handleSubmit} className="w-full mt-4 py-4 bg-indigo-600 text-white font-bold rounded-xl shadow-lg shadow-indigo-200 hover:bg-indigo-700 active:scale-95 transition-all">+ 保存记录</button>
      </div>
    </div>
  );
};

// Task 3: Modified AIScanModal with Manual Product Name Input
const AIScanModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onUpload: () => void;
  isProcessing: boolean;
  assets: Asset[];
  targetAssetId: string;
  setTargetAssetId: (id: string) => void;
  manualCurrency: string;
  setManualCurrency: (c: string) => void;
  manualInstitution: string;
  setManualInstitution: (i: string) => void;
  manualProductName: string; // [Task 3] New Prop
  setManualProductName: (n: string) => void; // [Task 3] New Prop
  lastProcessedCount: number;
}> = ({
  isOpen, onClose, onUpload, isProcessing, assets,
  targetAssetId, setTargetAssetId,
  manualCurrency, setManualCurrency,
  manualInstitution, setManualInstitution,
  manualProductName, setManualProductName,
  lastProcessedCount
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fadeIn p-4">
      <div className="bg-white w-full max-w-sm rounded-2xl p-6 shadow-2xl animate-scaleIn">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
            <Sparkles size={20} className="text-indigo-500" />
            AI 智能识别
          </h2>
          <button onClick={onClose} disabled={isProcessing} className="p-1 hover:bg-gray-100 rounded-full transition-colors">
            <X size={20} className="text-gray-400" />
          </button>
        </div>

        {lastProcessedCount > 0 ? (
          <div className="text-center py-6 animate-slideUp">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 size={32} className="text-green-500" />
            </div>
            <h3 className="text-xl font-bold text-gray-800 mb-2">识别成功</h3>
            <p className="text-gray-500 text-sm font-medium">已成功录入 <span className="text-indigo-600 font-bold text-base">{lastProcessedCount}</span> 条记录</p>
            <button onClick={onClose} className="mt-8 w-full py-3.5 bg-gray-900 text-white font-bold rounded-xl shadow-lg hover:bg-black transition-all">
              完成
            </button>
          </div>
        ) : (
          <div className="space-y-5">
             {/* Target Selector */}
             <div>
               <label className="block text-xs font-bold text-gray-500 mb-1.5 ml-1">识别目标 (归档到)</label>
               <div className="relative">
                 <select
                   value={targetAssetId}
                   onChange={(e) => setTargetAssetId(e.target.value)}
                   disabled={targetAssetId !== 'auto' && assets.some(a => a.id === targetAssetId)} // Optional: lock if passed from asset item
                   className="w-full bg-gray-50 border border-gray-200 rounded-xl py-3 px-4 text-sm font-bold text-gray-800 outline-none focus:ring-2 focus:ring-indigo-500 appearance-none disabled:opacity-70 disabled:bg-gray-100"
                 >
                   <option value="auto">🤖 自动匹配 / 创建新资产</option>
                   {assets.map(a => (
                     <option key={a.id} value={a.id}>{a.productName} ({a.institution})</option>
                   ))}
                 </select>
                 <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={16}/>
               </div>
             </div>

             {/* [Task 3] Manual Product Name Input (Green Arrow Position) */}
             <div>
                <label className="block text-xs font-bold text-gray-500 mb-1.5 ml-1 flex items-center gap-1">
                   指定产品名称 <span className="bg-green-100 text-green-600 px-1.5 rounded text-[10px]">AI 修正</span>
                </label>
                <div className="relative">
                   <input
                     type="text"
                     placeholder="AI 识别不准时，在此手动输入..."
                     value={manualProductName}
                     onChange={(e) => setManualProductName(e.target.value)}
                     className="w-full bg-gray-50 border border-gray-200 rounded-xl py-3 pl-10 pr-3 text-sm font-bold text-gray-800 outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all placeholder:font-normal"
                   />
                   <Edit3 className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                </div>
             </div>

             {/* Manual Overrides Row */}
             <div className="grid grid-cols-2 gap-3">
               <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1.5 ml-1">指定货币 (可选)</label>
                  <div className="relative">
                    <select
                      value={manualCurrency}
                      onChange={(e) => setManualCurrency(e.target.value)}
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl py-3 px-3 text-sm font-bold text-gray-800 appearance-none outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="">自动识别</option>
                      <option value="CNY">CNY</option>
                      <option value="USD">USD</option>
                      <option value="HKD">HKD</option>
                    </select>
                    <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={14}/>
                  </div>
               </div>
               <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1.5 ml-1">指定渠道 (可选)</label>
                  <input
                    type="text"
                    placeholder="如: 支付宝"
                    value={manualInstitution}
                    onChange={(e) => setManualInstitution(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl py-3 px-3 text-sm font-bold text-gray-800 outline-none focus:ring-2 focus:ring-indigo-500"
                  />
               </div>
             </div>

             <button
               onClick={onUpload}
               disabled={isProcessing}
               className={`w-full py-4 rounded-xl shadow-lg transition flex justify-center items-center gap-2 font-bold text-white ${
                 isProcessing ? 'bg-gray-700 cursor-not-allowed' : 'bg-indigo-600 active:scale-95 hover:bg-indigo-700 shadow-indigo-200'
               }`}
             >
               {isProcessing ? (
                 <>
                   <Loader2 className="animate-spin" size={18} />
                   <span>正在分析截图...</span>
                 </>
               ) : (
                 <>
                   <UploadCloud size={20} />
                   <span>上传截图开始识别</span>
                 </>
               )}
             </button>
             <p className="text-[10px] text-center text-gray-400 leading-relaxed">
               支持支付宝、微信、银行App的<br/>资产详情页或交易记录截图
             </p>
          </div>
        )}
      </div>
    </div>
  );
};

// Task 1: Updated Salary Scan Modal
const AISalaryScanModal: React.FC<{
  isOpen: boolean; onClose: () => void; onUpload: () => void; isProcessing: boolean;
}> = ({ isOpen, onClose, onUpload, isProcessing }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fadeIn p-4">
       <div className="bg-white w-full max-w-sm rounded-2xl p-6 shadow-2xl animate-scaleIn">
          <div className="flex justify-between items-center mb-6">
             <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2"><Sparkles size={20} className="text-indigo-500" /> AI 工资条识别</h2>
             <button onClick={onClose} disabled={isProcessing} className="p-1 hover:bg-gray-100 rounded-full"><X size={20} className="text-gray-400" /></button>
          </div>
          <div className="space-y-6 text-center">
             <div className="bg-indigo-50 p-4 rounded-2xl border border-indigo-100">
                <p className="text-sm text-indigo-800 mb-2 font-bold">支持识别内容：</p>
                <p className="text-xs text-indigo-600 leading-relaxed">基本工资、安家费、补贴、奖金、月份等。<br/>请确保截图清晰。</p>
             </div>
             <button onClick={onUpload} disabled={isProcessing} className={`w-full py-4 rounded-xl shadow-lg transition flex justify-center items-center gap-2 font-bold text-white ${isProcessing ? 'bg-gray-700 cursor-not-allowed' : 'bg-indigo-600 active:scale-95 hover:bg-indigo-700'}`}>
                {isProcessing ? <><Loader2 className="animate-spin" size={18} /><span>正在分析工资条...</span></> : <><UploadCloud size={20} /><span>上传工资条截图</span></>}
             </button>
          </div>
       </div>
    </div>
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
            <div><label className="text-xs text-gray-500 font-bold block mb-1.5">日期</label><input type="date" className="w-full bg-gray-50 border border-gray-200 rounded-lg p-2.5 text-sm" value={date} onChange={e => setDate(e.target.value)} /></div>
            <div><label className="text-xs text-gray-500 font-bold block mb-1.5">金额</label><input type="number" className="w-full bg-gray-50 border border-gray-200 rounded-lg p-2.5 text-sm font-bold" value={amountStr} onChange={e => setAmountStr(e.target.value)} /></div>
            <div><label className="text-xs text-gray-500 font-bold block mb-1.5">备注</label><input type="text" className="w-full bg-gray-50 border border-gray-200 rounded-lg p-2.5 text-sm" value={description} onChange={e => setDescription(e.target.value)} /></div>
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
          <div><label className="block text-gray-500 text-xs font-bold mb-1.5">投资渠道</label><input type="text" className="w-full bg-gray-50 border border-gray-200 rounded-xl py-3 px-3 text-sm font-bold text-gray-800 outline-none focus:ring-2 focus:ring-blue-500 transition-all" value={formData.institution} onChange={(e) => setFormData({ ...formData, institution: e.target.value })} /></div>
          <div><label className="block text-gray-500 text-xs font-bold mb-1.5">产品名称</label><input type="text" className="w-full bg-gray-50 border border-gray-200 rounded-xl py-3 px-3 text-sm font-bold text-gray-800 outline-none focus:ring-2 focus:ring-blue-500 transition-all" value={formData.productName} onChange={(e) => setFormData({ ...formData, productName: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-gray-500 text-xs font-bold mb-1.5">资产类型</label><select className="w-full bg-gray-50 border border-gray-200 rounded-xl py-3 px-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none appearance-none transition-all" value={formData.type} onChange={(e) => setFormData({ ...formData, type: e.target.value as AssetType })}><option value={AssetType.FUND}>基金</option><option value={AssetType.STOCK}>股票</option><option value={AssetType.GOLD}>黄金</option><option value={AssetType.OTHER}>其他</option></select></div>
            <div><label className="block text-gray-500 text-xs font-bold mb-1.5">本金货币</label><select className="w-full bg-gray-50 border border-gray-200 rounded-xl py-3 px-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none appearance-none font-bold transition-all" value={formData.currency} onChange={(e) => setFormData({ ...formData, currency: e.target.value as Currency })}><option value="CNY">CNY (人民币)</option><option value="USD">USD (美元)</option><option value="HKD">HKD (港币)</option></select></div>
          </div>
          <div><label className="block text-gray-500 text-xs font-bold mb-1.5 flex items-center gap-2">收益货币</label><div className="relative"><select className="w-full bg-gray-50 border border-gray-200 rounded-xl py-3 px-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none appearance-none font-bold transition-all" value={formData.earningsCurrency} onChange={(e) => setFormData({ ...formData, earningsCurrency: e.target.value as Currency })}><option value="CNY">CNY (人民币)</option><option value="USD">USD (美元)</option><option value="HKD">HKD (港币)</option></select><ArrowRightLeft size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" /></div></div>
          <div className="flex gap-4">
             <div className="flex-1"><label className="block text-gray-500 text-xs font-bold mb-1.5">年化 (%)</label><input type="number" className="w-full bg-gray-50 border border-gray-200 rounded-xl py-3 px-3 text-sm" value={formData.sevenDayYield} onChange={(e) => setFormData({ ...formData, sevenDayYield: e.target.value })} /></div>
             <div className="flex-[2]"><label className="block text-gray-500 text-xs font-bold mb-1.5">备注</label><input type="text" className="w-full bg-gray-50 border border-gray-200 rounded-xl py-3 px-3 text-sm" value={formData.remark} onChange={(e) => setFormData({ ...formData, remark: e.target.value })} /></div>
          </div>
        </div>
        <div className="flex gap-3 mt-8"><button onClick={onClose} className="flex-1 py-3.5 rounded-xl bg-gray-100 text-gray-600 font-bold text-sm hover:bg-gray-200 transition-colors">取消</button><button onClick={handleSave} className="flex-1 py-3.5 rounded-xl bg-gray-900 text-white font-bold text-sm shadow-lg hover:bg-black transition-colors">保存修改</button></div>
      </div>
    </div>
  );
};

// --- APP COMPONENT ---

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

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [salaryRecords, setSalaryRecords] = useState<SalaryRecord[]>([]);
  
  // Navigation State
  const [activeTab, setActiveTab] = useState<'invest' | 'salary' | 'analysis' | 'me'>('invest');

  // UI State
  const [showAddModal, setShowAddModal] = useState(false);
  const [showScanModal, setShowScanModal] = useState(false);
  const [showSalaryAddModal, setShowSalaryAddModal] = useState(false);
  const [showSalaryScanModal, setShowSalaryScanModal] = useState(false);
  
  // Scan State
  const [scannedSalaryData, setScannedSalaryData] = useState<Partial<SalaryRecord> | undefined>(undefined);
  const [scanTargetId, setScanTargetId] = useState<string>('auto'); 
  const [manualInstitution, setManualInstitution] = useState('');
  const [manualCurrency, setManualCurrency] = useState<Currency | ''>('');
  const [manualProductName, setManualProductName] = useState(''); // [Task 3] State
  const [isProcessingAI, setIsProcessingAI] = useState(false);
  const [lastProcessedCount, setLastProcessedCount] = useState(0);

  const [dashboardCurrency, setDashboardCurrency] = useState<Currency>('CNY');
  const [privacyMode, setPrivacyMode] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const salaryFileInputRef = useRef<HTMLInputElement>(null);
  
  const [editingTransaction, setEditingTransaction] = useState<{ assetId: string, transaction: Transaction } | null>(null);
  const [editingAssetInfo, setEditingAssetInfo] = useState<Asset | null>(null);
  const [confirmDeleteAssetId, setConfirmDeleteAssetId] = useState<string | null>(null);
  const [newAsset, setNewAsset] = useState<{ institution: string; productName: string; type: AssetType; currency: Currency; amount: string; date: string; yield: string; remark: string; }>({ institution: '', productName: '', type: AssetType.FUND, currency: 'CNY', amount: '', date: new Date().toISOString().split('T')[0], yield: '', remark: '' });

  // Auth & Data
  useEffect(() => {
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

  // Fetch Salaries
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'artifacts', appId, 'users', user.uid, 'salaries'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const loaded: SalaryRecord[] = [];
      snapshot.forEach((doc) => loaded.push({ id: doc.id, ...doc.data() } as SalaryRecord));
      setSalaryRecords(loaded);
    });
    return () => unsubscribe();
  }, [user]);

  // Task 2 & 3: Handle Asset/Earning AI Upload with Manual Override
  const handleAIUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length || !user) return;
    setIsProcessingAI(true);
    setLastProcessedCount(0);
    try {
      const records = await Promise.all(Array.from(e.target.files).map(async f => {
        const reader = new FileReader();
        return new Promise<AIAssetRecord[]>((resolve, reject) => { 
          reader.onload = async () => {
              try { resolve(await analyzeEarningsScreenshot(reader.result as string)); } catch (e) { reject(e); }
          };
          reader.onerror = (e) => reject(e);
          reader.readAsDataURL(f);
        });
      }));
      
      const flatRecords = records.flat();
      
      // Apply Manual Overrides [Task 3]
      flatRecords.forEach(r => {
          if (manualCurrency) r.currency = manualCurrency as Currency;
          if (manualProductName) r.productName = manualProductName; // Force Manual Name
          if (manualInstitution) r.institution = manualInstitution;
      });
      
      const groups = new Map<string, { product: string; currency: Currency; type: AssetType; inst: string; records: AIAssetRecord[] }>();
      flatRecords.forEach(r => {
         // If manual product name is set, everything goes into one bucket (simplification)
         const productKey = r.productName || '未命名资产';
         const key = `${productKey}|${r.currency || 'CNY'}`;
         
         if (!groups.has(key)) groups.set(key, { product: productKey, currency: (r.currency as Currency) || 'CNY', type: (r.assetType as AssetType) || AssetType.FUND, inst: r.institution || '', records: [] });
         groups.get(key)!.records.push(r);
      });

      let count = 0;
      for (const group of groups.values()) {
         // Determine Target Asset ID
         let targetId = scanTargetId !== 'auto' ? scanTargetId : findMatchingAsset(assets, group.product, manualInstitution || group.inst, group.currency)?.id;
         
         const newTx: Transaction[] = group.records.filter(r => r.amount).map(r => ({
            id: Date.now() + Math.random().toString(),
            date: r.date,
            type: r.type,
            amount: r.amount,
            currency: r.currency as Currency,
            description: r.type === 'deposit' ? 'AI 识别买入' : 'AI 识别收益'
         }));

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

  // Task 1: Handle Salary AI Upload
  const handleSalaryAIUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length || !user) return;
    setIsProcessingAI(true);
    try {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          // Use new specific function
          const result = await analyzeSalaryScreenshot(reader.result as string);
          
          const mappedData: Partial<SalaryRecord> = {
            date: result.year && result.month ? `${result.year}-${String(result.month).padStart(2, '0')}` : undefined,
            basicSalary: result.basicSalary,
            settlingInAllowance: result.settlingInAllowance,
            extraIncome: result.extraIncome,
            subsidy: result.subsidy,
            monthlyBonus: result.monthlyBonus,
            subsidyType: 'card' 
          };
          setScannedSalaryData(mappedData);
          setShowSalaryScanModal(false);
          setShowSalaryAddModal(true); // Open edit modal with pre-filled data
        } catch (err) {
          alert("识别失败，请重试");
        } finally {
          setIsProcessingAI(false);
        }
      };
      reader.readAsDataURL(file);
    } catch (e) {
      setIsProcessingAI(false);
    } finally {
      if(salaryFileInputRef.current) salaryFileInputRef.current.value = '';
    }
  };

  const handleSaveSalary = async (data: Omit<SalaryRecord, 'id' | 'total'>) => {
    if (!user) return;
    const total = (data.basicSalary || 0) + (data.settlingInAllowance || 0) + (data.extraIncome || 0) + (data.subsidy || 0) + (data.monthlyBonus || 0);
    await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'salaries'), { ...data, total });
    setScannedSalaryData(undefined);
  };

  const handleDeleteSalary = async (id: string) => {
    if (!user) return;
    if (confirm("确定要删除这条工资记录吗？")) {
      await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'salaries', id));
    }
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
    await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'assets', asset.id), { history: newHistory });
    setEditingTransaction(null);
  };

  const handleSaveAssetInfo = async (updatedAsset: Asset) => {
    if (!user) return;
    const { id, currentAmount, totalEarnings, dailyEarnings, history, ...rest } = updatedAsset;
    await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'assets', id), rest);
    setEditingAssetInfo(null);
  };

  const executeDeleteAsset = async () => {
    if (!confirmDeleteAssetId || !user) return;
    await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'assets', confirmDeleteAssetId));
    setConfirmDeleteAssetId(null);
  };

  if (authLoading) return <div className="min-h-screen flex items-center justify-center bg-[#ededed]"><Loader2 className="animate-spin text-gray-400" size={32} /></div>;
  if (!user) return <AuthScreen />;

  return (
    <div className="min-h-screen bg-[#ededed] text-[#111111] font-sans">
      
      {/* File Inputs */}
      <input type="file" multiple accept="image/*" ref={fileInputRef} onChange={handleAIUpload} className="hidden" />
      <input type="file" accept="image/*" ref={salaryFileInputRef} onChange={handleSalaryAIUpload} className="hidden" />

      {/* Main Content */}
      <div className="pb-24">
        {activeTab === 'invest' && (
          <AssetsPage 
            assets={assets}
            dashboardCurrency={dashboardCurrency}
            setDashboardCurrency={setDashboardCurrency}
            onOpenAdd={() => setShowAddModal(true)}
            onOpenScan={(mode) => { 
                // [Task 2] Global Scan Logic
                setScanTargetId('auto'); 
                setManualInstitution(''); 
                setManualCurrency(''); 
                setManualProductName(''); 
                setShowScanModal(true); 
                setLastProcessedCount(0); 
            }}
            onEditAsset={(asset) => setEditingAssetInfo(asset)}
            onDeleteAsset={(id) => setConfirmDeleteAssetId(id)}
            onEditTransaction={(assetId, tx) => setEditingTransaction({ assetId, transaction: tx })}
            onDeleteTransaction={handleDeleteSpecificTransaction}
            privacyMode={privacyMode}
          />
        )}
        
        {activeTab === 'salary' && (
          <SalaryPage 
            salaryRecords={salaryRecords}
            onOpenAdd={() => { setScannedSalaryData(undefined); setShowSalaryAddModal(true); }}
            onOpenScan={() => setShowSalaryScanModal(true)} // [Task 2] Salary Scan Logic
            onDeleteRecord={handleDeleteSalary}
          />
        )}

        {activeTab === 'analysis' && <AnalysisPage />}
        {activeTab === 'me' && <ProfilePage user={user} onLogout={() => signOut(auth)} />}
      </div>

      <BottomNav activeTab={activeTab} onChange={setActiveTab} />

      {/* Modals */}
      
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
        manualProductName={manualProductName} // [Task 3]
        setManualProductName={setManualProductName} // [Task 3]
        lastProcessedCount={lastProcessedCount} 
      />
      
      <AddSalaryModal 
        isOpen={showSalaryAddModal} 
        onClose={() => setShowSalaryAddModal(false)} 
        onSave={handleSaveSalary}
        initialData={scannedSalaryData}
      />
      <AISalaryScanModal
        isOpen={showSalaryScanModal}
        onClose={() => !isProcessingAI && setShowSalaryScanModal(false)}
        onUpload={() => salaryFileInputRef.current?.click()}
        isProcessing={isProcessingAI}
      />
      
      {showAddModal && <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm animate-fadeIn"><div className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl animate-slideUp"><h2 className="text-xl font-bold mb-6 text-gray-800 text-center">记录新资产</h2><div className="space-y-4"><SmartInput label="投资渠道" placeholder="例如：支付宝" value={newAsset.institution} onChange={(v) => setNewAsset({...newAsset, institution: v})} suggestions={['支付宝', '微信理财通', '招商银行', '工商银行']} /><SmartInput label="产品名称" placeholder="例如：易方达蓝筹" value={newAsset.productName} onChange={(v) => setNewAsset({...newAsset, productName: v})} suggestions={getUniqueProductNames(assets)} /><div className="grid grid-cols-2 gap-4"><div><label className="block text-gray-500 text-xs font-bold mb-1.5">记录日期</label><input type="date" className="w-full bg-gray-50 border border-gray-200 rounded-xl py-3 px-3 text-sm" value={newAsset.date} onChange={(e) => setNewAsset({...newAsset, date: e.target.value})} /></div><div><label className="block text-gray-500 text-xs font-bold mb-1.5">资产类型</label><select className="w-full bg-gray-50 border border-gray-200 rounded-xl py-3 px-3 text-sm appearance-none" value={newAsset.type} onChange={(e) => setNewAsset({...newAsset, type: e.target.value as AssetType})}><option value={AssetType.FUND}>基金</option><option value={AssetType.STOCK}>股票</option><option value={AssetType.GOLD}>黄金</option><option value={AssetType.OTHER}>其他</option></select></div></div><div className="grid grid-cols-2 gap-4"><div><label className="block text-gray-500 text-xs font-bold mb-1.5">货币种类</label><select className="w-full bg-gray-50 border border-gray-200 rounded-xl py-3 px-3 text-sm appearance-none font-bold" value={newAsset.currency} onChange={(e) => setNewAsset({...newAsset, currency: e.target.value as Currency})}><option value="CNY">CNY</option><option value="USD">USD</option><option value="HKD">HKD</option></select></div><div><label className="block text-gray-500 text-xs font-bold mb-1.5">金额</label><input type="number" className="w-full bg-gray-50 border border-gray-200 rounded-xl py-3 px-3 text-lg font-bold" placeholder="0.00" value={newAsset.amount} onChange={(e) => setNewAsset({...newAsset, amount: e.target.value})} /></div></div><div className="flex gap-4"><div className="flex-1"><label className="block text-gray-500 text-xs font-bold mb-1.5">年化 (%)</label><input type="number" className="w-full bg-gray-50 border border-gray-200 rounded-xl py-3 px-3 text-sm" placeholder="2.5" value={newAsset.yield} onChange={(e) => setNewAsset({...newAsset, yield: e.target.value})} /></div><div className="flex-[2]"><label className="block text-gray-500 text-xs font-bold mb-1.5">备注</label><input type="text" className="w-full bg-gray-50 border border-gray-200 rounded-xl py-3 px-3 text-sm" placeholder="选填" value={newAsset.remark} onChange={(e) => setNewAsset({...newAsset, remark: e.target.value})} /></div></div><div className="flex gap-3 mt-8"><button onClick={() => setShowAddModal(false)} className="flex-1 py-3.5 rounded-xl bg-gray-100 text-gray-600 font-bold text-sm">取消</button><button onClick={handleAddAsset} className="flex-1 py-3.5 rounded-xl bg-gray-900 text-white font-bold text-sm shadow-lg">确认</button></div></div></div></div>}
      {editingAssetInfo && <EditAssetInfoModal asset={editingAssetInfo} onSave={handleSaveAssetInfo} onClose={() => setEditingAssetInfo(null)} />}
      {editingTransaction && <EditTransactionModal transaction={editingTransaction.transaction} onSave={handleUpdateTransaction} onDelete={() => handleDeleteTransaction(editingTransaction.transaction.id)} onClose={() => setEditingTransaction(null)} />}
      {confirmDeleteAssetId && <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fadeIn"><div className="bg-white w-full max-w-xs rounded-2xl p-6 shadow-2xl"><div className="flex flex-col items-center text-center mb-6"><div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mb-4"><AlertTriangle size={24} className="text-red-500" /></div><h3 className="text-lg font-bold text-gray-800">确认删除该资产？</h3><p className="text-sm text-gray-500 mt-2">删除后，该资产的所有历史记录和收益明细将无法恢复。</p></div><div className="flex gap-3"><button onClick={() => setConfirmDeleteAssetId(null)} className="flex-1 py-3 rounded-xl bg-gray-100 text-gray-700 font-bold text-sm">取消</button><button onClick={executeDeleteAsset} className="flex-1 py-3 rounded-xl bg-red-500 text-white font-bold text-sm">确认删除</button></div></div></div>}
    </div>
  );
}

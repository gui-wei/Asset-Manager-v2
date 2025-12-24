export interface AIAssetRecord {
  date: string;
  amount: number;
  type: 'deposit' | 'earning';
  productName?: string;
  institution?: string;
  currency?: 'CNY' | 'USD' | 'HKD';
  assetType?: 'Fund' | 'Stock' | 'Gold' | 'Other';
}

export interface AISalaryResult {
  year?: number;
  month?: number;
  basicSalary?: number;
  settlingInAllowance?: number;
  extraIncome?: number;
  subsidy?: number;
  monthlyBonus?: number;
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

const apiKey = import.meta.env.VITE_GEMINI_API_KEY; 

// --- 功能 1: 识别投资资产/收益截图 ---
export const analyzeEarningsScreenshot = async (base64Image: string): Promise<AIAssetRecord[]> => {
  if (!base64Image) return [];
  if (!apiKey) {
    console.error("Gemini API Key is missing");
    throw new Error("API Key Missing");
  }

  try {
    const compressedDataUrl = await compressImage(base64Image);
    const parts = compressedDataUrl.split(',');
    const cleanBase64 = parts.length > 1 ? parts[1] : compressedDataUrl;
    
    const prompt = `
      You are an expert personal finance assistant. Analyze this screenshot of an investment transaction.
      **GOAL**: Extract data to "Group" assets logically.
      1. **Date**: Prioritize "Confirmation Date". Format: YYYY-MM-DD.
      2. **Product Name**: Extract Core Product Name.
      3. **Institution**: Identify Asset Manager/Platform.
      4. **Type**: "deposit" (Buy) or "earning" (Income).
      OUTPUT JSON ONLY: { "records": [ { "productName": "...", "institution": "...", "amount": number, "date": "...", "type": "deposit"|"earning", "currency": "CNY"|"USD"|"HKD", "assetType": "Fund"|"Stock"|"Gold"|"Other" } ] }
    `;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }, { inlineData: { mimeType: "image/jpeg", data: cleanBase64 } }] }], generationConfig: { responseMimeType: "application/json" } }) }
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

// --- 功能 2: 识别工资条截图 ---
export const analyzeSalaryScreenshot = async (base64Image: string): Promise<AISalaryResult> => {
  if (!base64Image) return {};
  if (!apiKey) {
    console.error("Gemini API Key is missing");
    throw new Error("API Key Missing");
  }

  try {
    const compressedDataUrl = await compressImage(base64Image);
    const parts = compressedDataUrl.split(',');
    const cleanBase64 = parts.length > 1 ? parts[1] : compressedDataUrl;

    const prompt = `
      你是一个专业的财务助手。请分析这张中文工资条或银行入账截图。
      
      **目标**：提取以下特定的收入组成部分。如果某项没有明确列出，请返回 0。
      
      请提取：
      1. **Year/Month**: 工资所属的年份和月份 (例如 2025, 12)。
      2. **Basic Salary (基本工资)**: 包含岗位工资、基础工资等核心部分。
      3. **Settling-in Allowance (安家费)**: 明确标记为“安家费”或类似的项目。
      4. **Extra Income (额外收入)**: 兼职、理财收益、其他非常规收入。
      5. **Subsidy (补贴)**: 餐补、交通补、通讯补、高温补等补贴的总和。
      6. **Bonus (奖金)**: 绩效奖金、月度奖金等。

      **注意**：
      - 请智能合并同类项（例如“交通补”+“餐补”都算进 Subsidy）。
      - 只提取数字，不要单位。

      **输出格式 (JSON)**:
      {
        "year": 2025,
        "month": 12,
        "basicSalary": 0.00,
        "settlingInAllowance": 0.00,
        "extraIncome": 0.00,
        "subsidy": 0.00,
        "monthlyBonus": 0.00
      }
    `;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
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
    
    if (!text) return {};
    return JSON.parse(text);

  } catch (error) {
    console.error("Gemini Salary Analysis Failed:", error);
    throw error;
  }
};

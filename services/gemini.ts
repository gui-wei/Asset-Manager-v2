import { GoogleGenAI } from "@google/genai";
import { SalaryDetail } from '../types';

// Initialize the client
// ---------------------------------------------------------------------------
// [配置指南] 请在 .env 文件中设置 GEMINI_API_KEY
// ---------------------------------------------------------------------------
const apiKey = process.env.API_KEY || 'AIzaSyCJdgOOO4DAyqxmZabUx1-FcyB5Guq0g-U'; 
const ai = new GoogleGenAI({ apiKey });

export interface EarningsRecord {
  date: string; // YYYY-MM-DD
  amount: number;
  type: 'deposit' | 'earning';
  productName?: string;
  institution?: string;
  currency?: 'CNY' | 'USD' | 'HKD';
  assetType?: 'Fund' | 'Gold' | 'Other';
}

export type AIAssetRecord = EarningsRecord;

// [Refined] Image compression with better defaults for OCR
const compressImage = (base64Str: string, maxWidth = 1600, quality = 0.85): Promise<string> => {
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
      
      // Preserve aspect ratio but limit max dimension
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
      
      // White background for transparency
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => resolve(base64Str);
  });
};

// [Refined] JSON Extractor - robust against markdown blocks and extra text
const extractJSON = (text: string): any => {
  try {
    // 1. Try direct parse
    return JSON.parse(text);
  } catch (e) {
    // 2. Try extracting from markdown block ```json ...
  if (jsonBlockMatch && jsonBlockMatch[1]) {
      try { return JSON.parse(jsonBlockMatch[1]); } catch (e2) { /* continue */ }
    }
    
    // 3. Try finding first '{' and last '}'
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start !== -1 && end !== -1) {
      try { return JSON.parse(text.substring(start, end + 1)); } catch (e3) { /* continue */ }
    }
    
    console.error("Failed to extract JSON from:", text);
    throw new Error("No valid JSON found in response");
  }
};

/**
 * Task 1 & 2: 资产/收益识别 AI
 */
export const analyzeEarningsScreenshot = async (base64Image: string): Promise<AIAssetRecord[]> => {
  if (!apiKey) {
      console.error("Gemini API Key is missing.");
      return [];
  }

  try {
    const model = 'gemini-2.5-flash';
    const compressedDataUrl = await compressImage(base64Image);
    const parts = compressedDataUrl.split(',');
    const cleanBase64 = parts.length > 1 ? parts[1] : compressedDataUrl;

    const prompt = `
      Analyze this screenshot of an investment app.
      
      TASK: Extract asset transactions or earnings.
      
      RULES:
      1. **Product Name**: CRITICAL. Extract the full name.
      2. **Type**: 
         - 'deposit': Buying, Subscription, "买入", "申购确认".
         - 'earning': Daily profit, "收益", "盈亏", "+xx.xx".
      3. **Currency**: Look for symbols or text. Default to CNY.
      
      Output JSON with "records" array.
    `;

    const result = await ai.models.generateContent({
        model: model,
        contents: {
            parts: [
            { inlineData: { mimeType: 'image/jpeg', data: cleanBase64 } },
            { text: prompt }
            ]
        },
        config: { responseMimeType: "application/json" }
    });

    const rawText = result.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) return [];
    
    const parsed = extractJSON(rawText) as { records: AIAssetRecord[] };
    return parsed.records || [];

  } catch (error) {
    console.error("Gemini Analysis Failed:", error);
    return [];
  }
};

/**
 * Task: 薪资识别 AI (重构版 - 支持批量)
 */
export const analyzeSalaryScreenshots = async (base64Images: string[]): Promise<{ details: SalaryDetail[], year?: number, month?: number, realWage?: number }> => {
  if (!apiKey || base64Images.length === 0) return { details: [] };

  try {
    const model = 'gemini-2.5-flash';
    
    // Prepare images
    const imageParts = await Promise.all(base64Images.map(async (img) => {
        const compressed = await compressImage(img);
        const parts = compressed.split(',');
        const cleanBase64 = parts.length > 1 ? parts[1] : compressed;
        return { inlineData: { mimeType: 'image/jpeg', data: cleanBase64 } };
    }));

    // [Chain of Thought Prompt]
    const prompt = `
      You are an expert OCR and financial data extraction AI.
      Analyze these ${base64Images.length} salary slip screenshot(s).

      ### OBJECTIVE
      Extract the "Real Wage" (Net Pay) and all individual salary components.

      ### STEP-BY-STEP INSTRUCTIONS
      1. **Identify Date**: Look for year and month (e.g., "2024年5月", "2024-05").
      2. **Identify Real Wage (Target)**: Find the final amount paid to the employee. 
         - Keywords: "实发", "实发工资", "实发合计", "打卡金额", "到手", "Net Pay".
         - This is usually a prominent number at the bottom or top.
      3. **Extract Details**: List every single line item with a monetary value.
         - **Income**: Basic salary, bonus, allowance, subsidy, overtime, etc. (Positive values)
         - **Deduction**: Tax, social security, provident fund, insurance, leave deduction. (Negative values)
         - **Keywords for Deduction**: "扣", "税", "险", "金", "代扣".
      
      ### RULES
      - **Merge Duplicates**: If multiple screenshots cover the same slip, remove duplicates based on name and value.
      - **Clean Names**: Remove symbols like "+", "-", ":" from the NAME. Keep the name clean (e.g., "基本工资" not "基本工资:").
      - **Sign Logic**: 
         - If it is a deduction (e.g. tax, insurance), make the amount NEGATIVE.
         - If it is income, make the amount POSITIVE.
      
      ### OUTPUT FORMAT
      Return PURE JSON.
      {
        "year": 2024,
        "month": 5,
        "realWage": 12345.67,
        "details": [
          { "name": "基本工资", "amount": 10000 },
          { "name": "绩效奖金", "amount": 3000 },
          { "name": "养老保险", "amount": -800 },
          { "name": "个税", "amount": -150.5 }
        ]
      }
    `;

    const result = await ai.models.generateContent({
        model: model,
        contents: {
            parts: [
              ...imageParts,
              { text: prompt }
            ]
        },
        config: { responseMimeType: "application/json" }
    });

    const rawText = result.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!rawText) {
        console.warn("Salary Analysis: Empty response from AI");
        return { details: [] };
    }
    
    // Use the robust extractor
    const data = extractJSON(rawText);
    
    return {
        details: data.details || [],
        year: data.year,
        month: data.month,
        realWage: data.realWage
    };

  } catch (error) {
    console.error("Salary Analysis Failed:", error);
    return { details: [] };
  }
};

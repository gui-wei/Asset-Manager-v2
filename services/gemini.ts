import { GoogleGenAI } from "@google/genai";
import { SalaryDetail } from '../types';

// Initialize the client
// ---------------------------------------------------------------------------
// [配置指南] API Key 填写位置
// 方式 1 (推荐 - 安全): 不修改代码。在项目根目录创建 .env 文件，写入 GEMINI_API_KEY=你的Key
// 方式 2 (简单 - 仅本地测试): 直接将下面的 '' 替换为你的 Key 字符串
// 例如: const apiKey = process.env.API_KEY || 'AIzaSyCcWjG9ef...'; 
// ---------------------------------------------------------------------------
const apiKey = process.env.API_KEY || ''; 
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

// Re-export as AIAssetRecord for compatibility
export type AIAssetRecord = EarningsRecord;

// [FIX] Increased quality and dimensions for better OCR text recognition
// 提高图片压缩上限，确保文字清晰度 (1024 -> 1600, 0.6 -> 0.8)
const compressImage = (base64Str: string, maxWidth = 1600, quality = 0.8): Promise<string> => {
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
      // Fill white background for transparency safety
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => {
      resolve(base64Str);
    };
  });
};

// [FIX] Helper to remove markdown formatting if Gemini includes it
// 强制清洗 JSON 字符串，防止 ```json 导致的解析错误
const cleanJsonString = (str: string): string => {
  if (!str) return '';
  return str.replace(/```json/g, '').replace(/```/g, '').trim();
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
      1. **Product Name**: CRITICAL. Extract the full name (e.g., "易方达蓝筹精选").
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
        config: {
            responseMimeType: "application/json",
            responseSchema: {
            type: "OBJECT",
            properties: {
                records: {
                type: "ARRAY",
                items: {
                    type: "OBJECT",
                    properties: {
                    productName: { type: "STRING" },
                    institution: { type: "STRING" },
                    amount: { type: "NUMBER" },
                    date: { type: "STRING" },
                    type: { type: "STRING", enum: ["deposit", "earning"] },
                    assetType: { type: "STRING", enum: ["Fund", "Gold", "Other"] },
                    currency: { type: "STRING", enum: ["CNY", "USD", "HKD"] }
                    },
                    required: ["amount", "date", "type"]
                }
                }
            },
            required: ["records"],
            }
        }
    });

    const rawText = result.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) return [];
    
    // [FIX] Clean and parse
    const cleanText = cleanJsonString(rawText);
    const parsed = JSON.parse(cleanText) as { records: AIAssetRecord[] };
    return parsed.records || [];

  } catch (error) {
    console.error("Gemini Analysis Failed:", error);
    return [];
  }
};

/**
 * Task 1 [OPTIMIZED]: 薪资条识别 AI (自主判断字段)
 * Task 2: 多图去重
 * Task 3: 智能正负号与实发工资识别
 */
export const analyzeSalaryScreenshots = async (base64Images: string[]): Promise<{ details: SalaryDetail[], year?: number, month?: number, realWage?: number }> => {
  if (!apiKey || base64Images.length === 0) return { details: [] };

  try {
    const model = 'gemini-2.5-flash';
    
    const imageParts = await Promise.all(base64Images.map(async (img) => {
        const compressed = await compressImage(img);
        const parts = compressed.split(',');
        const cleanBase64 = parts.length > 1 ? parts[1] : compressed;
        return { inlineData: { mimeType: 'image/jpeg', data: cleanBase64 } };
    }));

    const prompt = `
      Analyze these ${base64Images.length} screenshot(s) of a salary slip.

      TASK: 
      1. **Billing Cycle**: Identify Year and Month.
      2. **Real Wage (Task 1)**: Identify the FINAL amount paid to the user. Look for keywords like "实发", "实发工资", "实发合计", "打卡金额", "Net Pay". This is the most important number.
      3. **Details (Task 2 & 3)**: Extract ALL unique salary items.
      
      RULES FOR DETAILS:
      - **Deductions**: If an item is a deduction (e.g., "Tax", "Social Security", "Provident Fund", "个税", "五险一金", "扣款", "养老保险"), the amount MUST be NEGATIVE.
      - **Earnings**: If an item is income (e.g., "Basic Salary", "Bonus", "Subsidy", "应发", "基本工资"), the amount MUST be POSITIVE.
      - **Clean Numbers**: DO NOT include "+" or "-" signs in the 'name'. ONLY put the sign in the 'amount' value.
      - **Merge**: Deduplicate items if they appear in multiple images.
      
      Output JSON with 'year', 'month', 'realWage' (number), and 'details' array.
    `;

    const result = await ai.models.generateContent({
        model: model,
        contents: {
            parts: [
              ...imageParts,
              { text: prompt }
            ]
        },
        config: {
            responseMimeType: "application/json",
            responseSchema: {
            type: "OBJECT",
            properties: {
                year: { type: "NUMBER" },
                month: { type: "NUMBER" },
                realWage: { type: "NUMBER", description: "The final net pay amount (实发工资)" },
                details: {
                  type: "ARRAY",
                  items: {
                    type: "OBJECT",
                    properties: {
                      name: { type: "STRING" },
                      amount: { type: "NUMBER", description: "Positive for income, negative for deductions" }
                    },
                    required: ["name", "amount"]
                  }
                }
            },
            required: ["details"]
            }
        }
    });

    const rawText = result.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!rawText) {
        console.warn("Salary Analysis: Empty response from AI");
        return { details: [] };
    }
    
    // [FIX] Robust parsing with cleaning and logging
    console.log("Raw AI Response (Salary):", rawText); // Debugging
    const cleanText = cleanJsonString(rawText);
    
    return JSON.parse(cleanText) as { details: SalaryDetail[], year?: number, month?: number, realWage?: number };

  } catch (error) {
    console.error("Salary Analysis Failed:", error);
    // Return empty structure on error to prevent app crash
    return { details: [] };
  }
};

import { GoogleGenAI } from "@google/genai";
import { SalaryDetail } from '../types';

// Initialize the client
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

// Helper to compress image to avoid payload limits
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
    img.onerror = () => {
      resolve(base64Str);
    };
  });
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

    const text = result.text();
    if (!text) return [];
    const parsed = JSON.parse(text) as { records: AIAssetRecord[] };
    return parsed.records || [];

  } catch (error) {
    console.error("Gemini Analysis Failed:", error);
    return [];
  }
};

/**
 * Task 1 [OPTIMIZED]: 薪资条识别 AI (自主判断字段)
 * 能够识别任意名称的工资细则
 */
export const analyzeSalaryScreenshot = async (base64Image: string): Promise<{ details: SalaryDetail[], year?: number, month?: number }> => {
  if (!apiKey) return { details: [] };

  try {
    const model = 'gemini-2.5-flash';
    const compressedDataUrl = await compressImage(base64Image);
    const parts = compressedDataUrl.split(',');
    const cleanBase64 = parts.length > 1 ? parts[1] : compressedDataUrl;

    const prompt = `
      Analyze this image of a salary slip, bank transaction, or payroll screenshot.
      
      TASK: 
      1. Identify the billing cycle (Year and Month).
      2. Extract **ALL** visible salary breakdown items (names and amounts).
      
      RULES:
      - **Do not** limit to specific fields like "basic salary". 
      - Extract ANY numeric item that looks like a component of the salary (e.g., "Housing Subsidy", "Performance Bonus", "Tax Deduction", "Social Security", "Overtime Pay").
      - Return the exact name found in the image for the 'name' field.
      - Ensure 'amount' is a number. If it's a deduction (e.g., Tax), make it negative or keep it positive as it appears, but usually salary slips show absolute numbers. Let's keep them positive unless explicitly marked with a minus sign in the image.
      
      Output JSON with 'year', 'month', and a 'details' array containing objects with 'name' and 'amount'.
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
                year: { type: "NUMBER" },
                month: { type: "NUMBER" },
                details: {
                  type: "ARRAY",
                  items: {
                    type: "OBJECT",
                    properties: {
                      name: { type: "STRING" },
                      amount: { type: "NUMBER" }
                    },
                    required: ["name", "amount"]
                  }
                }
            },
            required: ["details"]
            }
        }
    });

    const text = result.text();
    if (!text) return { details: [] };
    return JSON.parse(text) as { details: SalaryDetail[], year?: number, month?: number };

  } catch (error) {
    console.error("Salary Analysis Failed:", error);
    return { details: [] };
  }
};

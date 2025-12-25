import { GoogleGenAI } from "@google/genai";
import { SalaryRecord } from '../types';

// Initialize the client
// Ensure we handle the case where API_KEY might be undefined/empty string during initialization
// Note: process.env.API_KEY is populated by vite.config.ts define
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
    // Basic check to ensure we have a valid base64 string
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

      // Resize if too large
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
      // Convert to clean JPEG base64
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
      console.error("Gemini API Key is missing. Please check your .env or configuration.");
      return [];
  }

  try {
    const model = 'gemini-2.5-flash';
    
    // Remove header if present, and ensure it's a valid string
    if (!base64Image || typeof base64Image !== 'string') return [];
    
    // Compress the image to reduce payload size and avoid timeouts/500 errors
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
                    productName: { type: "STRING", description: "Full Name of the product/fund" },
                    institution: { type: "STRING", description: "App or Bank name" },
                    amount: { type: "NUMBER", description: "Transaction amount (absolute value)" },
                    date: { type: "STRING", description: "YYYY-MM-DD" },
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

    const text = result.text(); // Ensure we call text() as a method
    if (!text) return [];
    const parsed = JSON.parse(text) as { records: AIAssetRecord[] };
    return parsed.records || [];

  } catch (error: any) {
    console.error("Gemini Analysis Failed:", error);
    return [];
  }
};

/**
 * Task 1: 薪资条识别 AI
 * 专门针对工资条截图进行结构化提取
 */
export const analyzeSalaryScreenshot = async (base64Image: string): Promise<Partial<SalaryRecord> & { year?: number, month?: number }> => {
  if (!apiKey) return {};

  try {
    const model = 'gemini-2.5-flash';
    const compressedDataUrl = await compressImage(base64Image);
    const parts = compressedDataUrl.split(',');
    const cleanBase64 = parts.length > 1 ? parts[1] : compressedDataUrl;

    const prompt = `
      Analyze this image of a salary slip or banking transaction for salary.
      
      TASK: Extract salary components.
      
      FIELDS TO EXTRACT:
      1. **basicSalary**: Base pay, "基本工资", "岗位工资", "职务工资".
      2. **settlingInAllowance**: "安家费", "住房补贴(一次性)".
      3. **extraIncome**: "兼职", "额外收入", "稿费".
      4. **subsidy**: Monthly subsidies like "房补", "餐补", "交通补", "通讯补".
      5. **monthlyBonus**: "绩效", "月度奖金", "季度奖".
      6. **year** & **month**: The billing cycle date.

      Sum up relevant fields if multiple items belong to the same category (e.g. sum all subsidies).
      
      Output JSON.
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
                basicSalary: { type: "NUMBER" },
                settlingInAllowance: { type: "NUMBER" },
                extraIncome: { type: "NUMBER" },
                subsidy: { type: "NUMBER" },
                monthlyBonus: { type: "NUMBER" },
                year: { type: "NUMBER" },
                month: { type: "NUMBER" }
            }
            }
        }
    });

    const text = result.text();
    if (!text) return {};
    return JSON.parse(text) as Partial<SalaryRecord> & { year?: number, month?: number };

  } catch (error) {
    console.error("Salary Analysis Failed:", error);
    return {};
  }
};

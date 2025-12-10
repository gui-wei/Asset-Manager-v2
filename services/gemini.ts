{
type: "file",
fileName: "gui-wei/asset-manager-v2/Asset-Manager-v2-839a3cdbb571849521450816574d02cdde1e29e1/services/gemini.ts",
fullContent: `
import { GoogleGenAI, SchemaType } from "@google/genai";

// Initialize the client
// Ensure we handle the case where API_KEY might be undefined/empty string during initialization
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

    const today = new Date();
    const year = today.getFullYear();
    const yesterdayDate = new Date(Date.now() - 86400000);
    const yesterdayStr = yesterdayDate.toISOString().split('T')[0];
    const todayStr = today.toISOString().split('T')[0];

    const prompt = \`
      Analyze this screenshot of an investment app (Alipay, Bank Apps, etc.).
      
      YOUR TASK:
      Extract a list of asset transactions or earnings. 
      
      CRITICAL - PURCHASE CONFIRMATION SCREENS:
      If the image shows "Purchase Successful", "Buying", "Order Confirmed" (e.g., "购买确认成功", "交易成功"):
      1. This is a **'deposit'** type transaction.
      2. You MUST extract the **FULL Product Name** (e.g., "高盛工银理财·盛景每日开放固定收益类美元理财产品1期"). Do not abbreviate it. This name is the key to matching other screenshots.
      3. Extract the Amount and Currency (USD, CNY, HKD).
      4. Extract the Date.

      EARNINGS LISTS / CALENDARS:
      1. Extract daily earnings rows.
      2. If the Product Name is visible, extract it. If NOT visible, leave it empty or generic.
      
      RULES FOR EXTRACTION:
      1. **Institution**: Look at the top header (e.g., "Alipay", "ICBC").
      2. **Date**: 
         - Format: YYYY-MM-DD.
         - If year is missing in a calendar view, look for "202x" headers. Default to \${year} if absolutely no year found.
         - "Yesterday"=\${yesterdayStr}, "Today"=\${todayStr}.
      3. **Type Classification**:
         - **deposit**: "Buy", "Purchase", "Success", "买入", "申购", "交易成功".
         - **earning**: "Income", "Profit", "Yield", "收益", "盈亏", "+xx.xx".
      4. **Currency**: 
         - Explicitly look for "USD", "美元", "US$", "HKD", "HK$", "港币".
         - If text says "美元理财", currency is "USD".
         - Default to "CNY" only if no other currency indicators exist.

      Output JSON with a "records" array.
    \`;

    const makeRequest = async () => {
        return await ai.models.generateContent({
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
                type: SchemaType.OBJECT,
                properties: {
                    records: {
                    type: SchemaType.ARRAY,
                    items: {
                        type: SchemaType.OBJECT,
                        properties: {
                        productName: { type: SchemaType.STRING, description: "Full Name of the product/fund" },
                        institution: { type: SchemaType.STRING, description: "App or Bank name" },
                        amount: { type: SchemaType.NUMBER, description: "Transaction amount (absolute value)" },
                        date: { type: SchemaType.STRING, description: "YYYY-MM-DD" },
                        type: { type: SchemaType.STRING, enum: ["deposit", "earning"] },
                        assetType: { type: SchemaType.STRING, enum: ["Fund", "Gold", "Other"] },
                        currency: { type: SchemaType.STRING, enum: ["CNY", "USD", "HKD"] }
                        },
                        required: ["amount", "date", "type"]
                    }
                    }
                },
                required: ["records"],
                }
            }
        });
    };

    // First attempt
    try {
        const response = await makeRequest();
        const text = response.text(); // Ensure we call text() as a method if required by version, or property
        // The new SDK often uses response.text() method or response.text property. 
        // Adapting to standard accessing:
        if (!text) return [];
        const result = JSON.parse(text) as { records: AIAssetRecord[] };
        return result.records || [];
    } catch (e: any) {
        // Simple retry logic for 500/503 errors
        if (e.message?.includes('500') || e.message?.includes('503')) {
             console.warn("Retrying Gemini request due to server error...");
             const response = await makeRequest();
             const text = response.text();
             if (!text) return [];
             const result = JSON.parse(text) as { records: AIAssetRecord[] };
             return result.records || [];
        }
        throw e;
    }

  } catch (error: any) {
    console.error("Gemini Analysis Failed:", error);
    // Re-throw permission/quota errors to be handled by UI
    if (error.message?.includes('403') || error.message?.includes('Region') || error.status === 403) {
        throw new Error("GEMINI_REGION_ERROR");
    }
    return [];
  }
};
`
}

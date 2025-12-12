import { GoogleGenAI } from "@google/genai";

export interface AIAssetRecord {
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

export const analyzeEarningsScreenshot = async (base64Image: string): Promise<AIAssetRecord[]> => {
  if (!base64Image) return [];

  // ✅ 生产环境变更：使用标准的 Vite 环境变量
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  
  if (!apiKey) {
      console.error("Gemini API Key is missing. Please check your .env file.");
      return [];
  }

  try {
    const compressedDataUrl = await compressImage(base64Image);
    const parts = compressedDataUrl.split(',');
    const cleanBase64 = parts.length > 1 ? parts[1] : compressedDataUrl;
    
    const todayStr = new Date().toISOString().split('T')[0];
    const yesterdayDate = new Date(Date.now() - 86400000);
    const yesterdayStr = yesterdayDate.toISOString().split('T')[0];
    const year = new Date().getFullYear();

    // 优化后的 Prompt，支持中英文混合识别和更准确的归类
    const prompt = `
      Analyze this screenshot of an investment/banking app (e.g., Alipay, WeChat Wealth, Bank Apps).
      YOUR GOAL: Extract transaction data and identifying product details to group records correctly.

      KEY EXTRACTION RULES:
      1. **Product Name** (CRITICAL): Extract FULL product name. IGNORE codes like "(001234)".
      2. **Institution**: Standardize names (Alipay, WeChat, ICBC, etc.).
      3. **Transaction Type**:
         - **deposit**: "Buy", "Purchase", "买入", "申购", "确认成功", "交易成功".
         - **earning**: "Income", "Profit", "收益", "昨收", "+xx.xx".
      4. **Date**: YYYY-MM-DD. Handle "Yesterday"=${yesterdayStr}, "Today"=${todayStr}. Default year=${year}.
      5. **Asset Type**: Infer Fund/Gold/Other based on keywords (e.g., "Gold", "ETF", "Bond").

      OUTPUT JSON ONLY: { "records": [ { "productName": "...", "institution": "...", "amount": number, "date": "...", "type": "...", "currency": "...", "assetType": "..." } ] }
    `;

    // 使用 fetch 直接调用 REST API，避免 SDK 版本兼容性问题，且更轻量
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
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

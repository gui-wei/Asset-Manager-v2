import { GoogleGenAI } from "@google/genai";

export interface AIAssetRecord {
  date: string;
  amount: number;
  type: 'deposit' | 'earning';
  productName?: string;
  institution?: string;
  currency?: 'CNY' | 'USD' | 'HKD';
  assetType?: 'Fund' | 'Stock' | 'Gold' | 'Other';
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
    const year = new Date().getFullYear();

    // 🔥 核心优化：针对“收益日历”和“列表视图”的双重识别逻辑
    const prompt = `
      You are an expert financial data assistant. Analyze this screenshot from a Chinese investment app (e.g., Tonghuashun, Alipay).
      
      **GOAL**: Extract transaction records accurately.

      **SCENARIO A: EARNINGS CALENDAR (收益日历 Grid View)**
      If the image looks like a monthly calendar grid with numbers in cells:
      1. **Header Date**: Find the Year and Month at the top (e.g., "2024年11月" or "2023.06"). Use this to construct full dates.
      2. **Grid Iteration**: Go through every day-cell in the grid.
      3. **Value & Sign Logic (CRITICAL)**:
         - **PROFIT (Positive)**: Cell has Red/Orange/Pink background OR text color OR a "+" sign. -> Extract as POSITIVE earning.
         - **LOSS (Negative)**: Cell has Green/Blue background OR text color OR a "-" sign. -> Extract as NEGATIVE earning (e.g., -1250.00).
         - **Ignore**: Cells marked "休" (Holiday), "0", or empty cells.
      4. **Record Construction**:
         - Date: YYYY-MM-DD (Combine header year/month + cell day).
         - Amount: The number in the cell.
         - Type: "earning".
         - Institution: "Tonghuashun" (or infer from UI).
         - Product Name: "股票账户" (Stock Account) or specific stock name if visible in header.
         - Asset Type: "Stock".

      **SCENARIO B: TRANSACTION LIST (List View)**
      If the image is a standard list of rows:
      1. **Product Name**: Extract full name, remove codes like (001234).
      2. **Institution**: Standardize (Alipay, WeChat, etc.).
      3. **Type**: 
         - "deposit" for keywords: Buy, Purchase, 买入, 申购.
         - "earning" for keywords: Income, Profit, 收益, +xx.xx.
      4. **Asset Type**: Infer Fund/Stock/Gold based on name.

      **OUTPUT JSON ONLY**: 
      { "records": [ { "productName": "...", "institution": "...", "amount": number, "date": "YYYY-MM-DD", "type": "deposit"|"earning", "currency": "CNY"|"USD"|"HKD", "assetType": "Fund"|"Stock"|"Gold"|"Other" } ] }
    `;

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

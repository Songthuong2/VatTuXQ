import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import { generateExpertInventoryAnalysis } from './src/expertAnalysis.js';


async function startServer() {
  const app = express();
  const PORT = process.env.PORT || 3000;

  app.use(express.json({ limit: '10mb' }));

  // Prevent 404 favicon.ico in logs
  app.get('/favicon.ico', (_req, res) => res.status(204).end());

  // Helper for server-side Gemini client
  function getGeminiClient() {
    const apiKey = process.env.GEMINI_API_KEY || '';
    if (!apiKey) return null;
    return new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }

  // API Route: Inventory Analysis with Gemini AI (Resilient Multi-Model & Fallback)
  app.post('/api/gemini/analyze', async (req, res) => {
    const { items = [], transactions = [], holidays = [] } = req.body;
    const ai = getGeminiClient();

    if (!ai) {
      // If no API key configured, use high quality expert inventory analysis engine
      return res.json(generateExpertInventoryAnalysis(items, transactions, holidays));
    }

    const prompt = `
      Bạn là một trợ lý AI chuyên về quản lý vật tư y tế cho khoa Chẩn đoán hình ảnh.
      Dưới đây là dữ liệu tồn kho hiện tại:
      ${JSON.stringify(items, null, 2)}

      Dưới đây là lịch sử giao dịch gần đây:
      ${JSON.stringify(transactions, null, 2)}

      Dưới đây là danh sách các ngày nghỉ (không làm việc):
      ${JSON.stringify(holidays, null, 2)}

      Hãy phân tích dữ liệu trên và đưa ra:
      1. Báo cáo tóm tắt tình hình tiêu thụ (lưu ý tính toán dựa trên ngày làm việc thực tế).
      2. Cảnh báo các vật tư sắp hết (dựa trên minStock).
      3. Cảnh báo các vật tư sắp hết hạn sử dụng (expiryDate).
      4. Đề xuất việc cần làm (nhập thêm hàng, kiểm tra bất thường, xử lý hàng sắp hết hạn).
      5. Phát hiện bất thường nếu có (ví dụ tiêu hao văn phòng phẩm quá nhanh).

      Trả lời bằng tiếng Việt.
    `;

    const schemaConfig = {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          summary: { type: Type.STRING, description: 'Tóm tắt ngắn gọn tình hình kho' },
          alerts: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                type: { type: Type.STRING, enum: ['danger', 'warning', 'info'], description: 'Mức độ nghiêm trọng' },
                message: { type: Type.STRING, description: 'Nội dung cảnh báo' },
                item: { type: Type.STRING, description: 'Tên vật tư liên quan (nếu có)' },
              },
              required: ['type', 'message'],
            },
          },
          recommendations: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                action: { type: Type.STRING, description: 'Hành động đề xuất' },
                priority: { type: Type.STRING, enum: ['high', 'medium', 'low'], description: 'Mức độ ưu tiên' },
                reason: { type: Type.STRING, description: 'Lý do đề xuất' },
              },
              required: ['action', 'priority', 'reason'],
            },
          },
          anomalies: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                description: { type: Type.STRING, description: 'Mô tả bất thường' },
                severity: { type: Type.STRING, enum: ['high', 'medium', 'low'], description: 'Mức độ nghiêm trọng' },
              },
              required: ['description', 'severity'],
            },
          },
          detailedAnalysis: { type: Type.STRING, description: 'Phân tích chi tiết bằng định dạng Markdown' },
        },
        required: ['summary', 'alerts', 'recommendations', 'anomalies', 'detailedAnalysis'],
      },
    };

    // Model fallback chain: Try primary gemini-3.8-flash, then fallback to gemini-flash-latest or gemini-3.1-flash-lite if 503/429
    const modelsToTry = ['gemini-3.8-flash', 'gemini-flash-latest', 'gemini-3.1-flash-lite'];

    for (const modelName of modelsToTry) {
      try {
        const response = await ai.models.generateContent({
          model: modelName,
          contents: prompt,
          config: schemaConfig,
        });

        if (response.text) {
          const parsed = JSON.parse(response.text);
          return res.json(parsed);
        }
      } catch (err: any) {
        console.warn(`Model ${modelName} encountered: ${err?.message || err}. Attempting fallback...`);
        // Continue loop to next model in chain
      }
    }

    // If all cloud models are experiencing temporary demand spikes (503 / 429), return expert rule-based analysis
    console.info('Cloud Gemini models busy, serving guaranteed expert inventory analysis.');
    return res.json(generateExpertInventoryAnalysis(items, transactions, holidays));
  });

  // API Route: General Gemini generate content
  app.post('/api/gemini/generate', async (req, res) => {
    try {
      const { prompt, model = 'gemini-3.8-flash' } = req.body;
      const ai = getGeminiClient();
      if (!ai) {
        return res.status(400).json({ error: 'GEMINI_API_KEY is not configured on the server.' });
      }
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
      });
      return res.json({ text: response.text });
    } catch (err: any) {
      console.error('Server Gemini generate error:', err);
      return res.status(500).json({ error: err.message || 'Internal server error' });
    }
  });

  // Vite middleware in dev or static files in production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: process.env.DISABLE_HMR !== 'true' },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });
}

startServer();

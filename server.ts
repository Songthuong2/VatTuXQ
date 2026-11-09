import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import { generateExpertInventoryAnalysis, generateExpertChatAnswer } from './src/expertAnalysis.js';


async function startServer() {
  const app = express();
  const PORT = process.env.PORT || 3000;

  app.use(express.json({ limit: '10mb' }));

  // Prevent 404 favicon.ico in logs
  app.get('/favicon.ico', (_req, res) => res.status(204).end());

  // Helper for server-side Gemini client
  function getGeminiClient() {
    const apiKey = (process.env.GEMINI_API_KEY || '').trim();
    if (!apiKey || apiKey === 'MY_GEMINI_API_KEY' || apiKey.startsWith('MY_') || apiKey.length < 15) {
      return null;
    }
    try {
      return new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });
    } catch {
      return null;
    }
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

    // Model fallback chain: Try primary gemini-3.8-flash, then fallback to gemini-flash-latest with 8s timeout
    const modelsToTry = ['gemini-3.8-flash', 'gemini-flash-latest'];

    for (const modelName of modelsToTry) {
      try {
        const timeoutPromise = new Promise<null>((_, reject) =>
          setTimeout(() => reject(new Error('TIMEOUT_AFTER_8S')), 8000)
        );

        const apiPromise = ai.models.generateContent({
          model: modelName,
          contents: prompt,
          config: schemaConfig,
        });

        const response: any = await Promise.race([apiPromise, timeoutPromise]);

        if (response && response.text) {
          const parsed = JSON.parse(response.text);
          return res.json(parsed);
        }
      } catch (err: any) {
        const errStr = String(err?.message || err || '');
        if (errStr.includes('API_KEY_INVALID') || errStr.includes('API key not valid') || errStr.includes('PERMISSION_DENIED')) {
          break;
        }
      }
    }

    // If cloud models unavailable or API key invalid, serve guaranteed expert inventory analysis
    return res.json(generateExpertInventoryAnalysis(items, transactions, holidays));
  });

  // API Route: Interactive Q&A Warehouse Copilot with Gemini AI (Grounded in Inventory Database)
  app.post('/api/gemini/chat', async (req, res) => {
    const { question = '', history = [], items = [], transactions = [], holidays = [] } = req.body;

    if (!question || typeof question !== 'string') {
      return res.status(400).json({ error: 'Question is required' });
    }

    const ai = getGeminiClient();
    if (!ai) {
      const fallbackText = generateExpertChatAnswer(question, items, transactions, holidays);
      return res.json({ text: fallbackText });
    }

    // Build compact context of inventory database
    const inventoryOverview = items.map(i => ({
      name: i.name,
      category: i.category,
      currentStock: i.currentStock,
      minStock: i.minStock,
      unit: i.unit,
      price: i.price,
      batches: (i.batches || []).map((b: any) => ({
        batchNumber: b.batchNumber,
        expiryDate: b.expiryDate,
        quantity: b.quantity,
      })),
      expiryDate: i.expiryDate,
    }));

    const recentTx = transactions.slice(0, 30).map(t => ({
      type: t.type,
      itemName: t.itemName,
      quantity: t.quantity,
      department: t.department,
      date: t.date || t.timestamp,
    }));

    const systemInstruction = `
Bạn là Trợ lý AI Chuyên gia Quản lý Kho Dược & Vật tư Y tế của Khoa Chẩn đoán Hình ảnh (CĐHA).
Nhiệm vụ cốt lõi:
1. Dựa trên dữ liệu kho thực tế được cung cấp dưới đây, hãy trả lời chính xác, trung thực các câu hỏi của nhân viên và bác sĩ.
2. Tra cứu tồn kho, hạn dùng lô (FEFO), định mức tối thiểu:
   - Nêu rõ số lượng tồn, đơn vị, định mức an toàn.
   - Nếu có các lô hàng, liệt kê rõ số lô, hạn dùng và số lượng từng lô.
   - Ưu tiên xuất dùng lô cận hạn trước theo nguyên tắc FEFO.
3. Khi được hỏi về kế hoạch dự trù hoặc xin lời khuyên:
   - Dựa trên lượng tiêu hao thực tế, số ngày làm việc (đã trừ ngày nghỉ).
   - Đưa ra khuyến nghị nhập hàng cụ thể, có căn cứ số liệu rõ ràng.
4. Phong cách:
   - Chuẩn văn phong y tế, mạch lạc, dễ hiểu.
   - Trình bày dạng Markdown với gạch đầu dòng hoặc bảng biểu số liệu khi cần thiết.
   - KHÔNG bịa đặt số liệu (Zero Hallucination). Nếu vật tư không tồn tại trong danh mục, hãy nêu rõ ràng.
`;

    const prompt = `
DỮ LIỆU KHO HIỆN TẠI (TỔNG CỘNG ${items.length} MẶT HÀNG):
${JSON.stringify(inventoryOverview, null, 2)}

GIAO DỊCH GẦN ĐÂY (${recentTx.length} GIAO DỊCH):
${JSON.stringify(recentTx, null, 2)}

DANH SÁCH NGÀY NGHỈ ĐÃ GHI NHẬN:
${JSON.stringify(holidays, null, 2)}

LỊCH SỬ TRAO ĐỔI TRƯỚC ĐÓ:
${history.map((h: any) => `${h.role === 'user' ? 'Người dùng' : 'Trợ lý AI'}: ${h.text}`).join('\n')}

CÂU HỎI MỚI CỦA NGƯỜI DÙNG:
${question}
`;

    const modelsToTry = ['gemini-3.8-flash', 'gemini-flash-latest'];

    for (const modelName of modelsToTry) {
      try {
        const timeoutPromise = new Promise<null>((_, reject) =>
          setTimeout(() => reject(new Error('TIMEOUT_AFTER_6S')), 6000)
        );

        const apiPromise = ai.models.generateContent({
          model: modelName,
          contents: prompt,
          config: {
            systemInstruction,
          },
        });

        const response: any = await Promise.race([apiPromise, timeoutPromise]);

        if (response && response.text) {
          return res.json({ text: response.text });
        }
      } catch (err: any) {
        const errStr = String(err?.message || err || '');
        if (errStr.includes('API_KEY_INVALID') || errStr.includes('API key not valid') || errStr.includes('PERMISSION_DENIED')) {
          break; // Stop retrying other models with an invalid key
        }
      }
    }

    // Fallback if cloud API is busy or API key is not active
    const fallbackText = generateExpertChatAnswer(question, items, transactions, holidays);
    return res.json({ text: fallbackText });
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

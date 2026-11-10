import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import { generateExpertInventoryAnalysis, generateExpertChatAnswer, computeItemStockAndExpiry } from './src/expertAnalysis.js';


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
    const { items = [], transactions = [], holidays = [], categories = [] } = req.body;
    const ai = getGeminiClient();

    if (!ai) {
      // If no API key configured, use high quality expert inventory analysis engine
      return res.json(generateExpertInventoryAnalysis(items, transactions, holidays, categories));
    }

    const prompt = `
      Bạn là một trợ lý AI chuyên gia về quản lý dược và vật tư y tế cho khoa Chẩn đoán hình ảnh.
      Dưới đây là dữ liệu tồn kho hiện tại:
      ${JSON.stringify(items, null, 2)}

      Dưới đây là danh mục phân loại:
      ${JSON.stringify(categories, null, 2)}

      Dưới đây là lịch sử giao dịch gần đây:
      ${JSON.stringify(transactions, null, 2)}

      Dưới đây là danh sách các ngày nghỉ (không làm việc):
      ${JSON.stringify(holidays, null, 2)}

      Hãy phân tích dữ liệu trên và đưa ra:
      1. Báo cáo tóm tắt tình hình tiêu thụ (tính toán dựa trên ngày làm việc thực tế).
      2. CẢNH BÁO ĐẶC BIỆT CÁC VẬT TƯ ĐÃ HẾT HẠN SỬ DỤNG:
         - Mọi lô hàng có hạn dùng trước ngày hiện tại là TUYỆT ĐỐI KHÔNG ĐƯỢC DÙNG CHO BỆNH NHÂN.
         - Tồn khả dụng thực tế = Tồn sổ sách - Lượng hết hạn.
         - Nếu một mặt hàng có lượng tồn khả dụng <= định mức tối thiểu hoặc có hàng hết hạn (ví dụ Barit sulfat có 73 gói nhưng đã hết hạn từ 15/09/2026), BẮT BUỘC phải phát cảnh báo nghiêm trọng (danger).
      3. ĐỀ XUẤT MUA SẮM BỔ SUNG KHẨN CẤP (BẮT BUỘC):
         - Với mọi mặt hàng có lô hàng đã hết hạn hoặc cạn kho khả dụng, BẮT BUỘC phải tạo đề xuất hành động ưu tiên cao (priority: high) để mua sắm bổ sung thay thế lượng hàng đã quá hạn!
      4. Cảnh báo các vật tư cận hạn trong 60 ngày để xuất trước theo nguyên tắc FEFO.
      5. Phát hiện bất thường nếu có.

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
    const { question = '', history = [], items = [], transactions = [], holidays = [], categories = [] } = req.body;

    if (!question || typeof question !== 'string') {
      return res.status(400).json({ error: 'Question is required' });
    }

    const ai = getGeminiClient();
    if (!ai) {
      const fallbackText = generateExpertChatAnswer(question, items, transactions, holidays, categories);
      return res.json({ text: fallbackText });
    }

    // Build compact context of inventory database with clinical stock analysis (Usable vs Expired)
    const now = new Date();
    const sixtyDaysLater = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);

    const inventoryOverview = items.map(i => {
      const stock = computeItemStockAndExpiry(i, now, sixtyDaysLater, categories);
      return {
        name: stock.name,
        category: stock.categoryName,
        totalStock: stock.totalStock,
        usableStock: stock.usableStock,
        expiredQty: stock.expiredQty,
        nearingQty: stock.nearingQty,
        minStock: stock.minStock,
        unit: stock.unit,
        price: stock.price,
        hasExpired: stock.hasExpired,
        isFullyExpired: stock.isFullyExpired,
        suggestedPurchaseQty: stock.suggestedReorder,
        batches: [...stock.expiredBatches, ...stock.nearingBatches, ...stock.validBatches].map(b => ({
          batchNumber: b.batchNumber,
          expiryDate: b.expiryDate,
          quantity: b.quantity,
          isExpired: b.isExpired,
        })),
        expiryDate: i.expiryDate,
      };
    });

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
2. Tra cứu danh mục, nhóm vật tư (Văn phòng phẩm, Dược, Vật tư tiêu hao, Hóa chất & cản quang):
   - ĐẶC BIỆT CHÚ Ý: Khi người dùng yêu cầu xem danh sách, danh mục, bảng kê, so sánh, hoặc tổng hợp: BẮT BUỘC TRÌNH BÀY BẰNG ĐỊNH DẠNG BẢNG MARKDOWN (Markdown Table) chuẩn GitHub-Flavored Markdown với dòng tiêu đề và phân cách cột chuẩn xác.
   - Luôn chừa dòng trống trước và sau bảng markdown để giao diện kết xuất bảng HTML trực quan, dễ quan sát.
   - Tuyệt đối phân loại đúng nhóm: Thuốc (Pdsolone, Vinsolon, NaCl, v.v.) thuộc nhóm Dược; Túi phim, dây nối thuộc Vật tư tiêu hao; Giấy in, bút, ghim, v.v. thuộc Văn phòng phẩm. Không bao giờ xếp thuốc hoặc túi phim vào nhóm văn phòng phẩm!
3. NGUYÊN TẮC Y TẾ BẮT BUỘC VỀ HẠN DÙNG & ĐỀ XUẤT MUA SẮM BỔ SUNG:
   - Trong y tế, mọi lô hàng đã quá hạn sử dụng (hạn dùng trước ngày hiện tại) TUYỆT ĐỐI KHÔNG ĐƯỢC PHÉP DÙNG CHO BỆNH NHÂN và phải lập tức niêm phong.
   - Tồn khả dụng an toàn = Tồn sổ sách - Lượng hàng đã hết hạn.
   - Khi một mặt hàng có hàng hết hạn (ví dụ Barit sulfat có 73 gói nhưng toàn bộ 73 gói đã hết hạn ngày 15/09/2026 nên tồn khả dụng an toàn = 0):
     * BẮT BUỘC PHẢI CẢNH BÁO NGUY HIỂM VỀ LÔ HÀNG ĐÃ QUÁ HẠN.
     * BẮT BUỘC PHẢI ĐƯA NGAY VÀO DANH SÁCH ĐỀ XUẤT MUA SẮM BỔ SUNG KHẨN CẤP với số lượng cụ thể (bù lại lượng hết hạn + duy trì đệm an toàn dự phòng) để không làm gián đoạn ca chụp cản quang hay khám chữa bệnh!
4. Tra cứu hạn dùng lô (FEFO), định mức tối thiểu:
   - Trình bày dạng bảng chi tiết các lô hàng, số lô, hạn dùng, lượng hết hạn, tồn khả dụng, và số lượng đề xuất mua sắm bù đắp.
5. Dự trù và tiêu hao:
   - Trình bày bảng chi tiết số lượng đề xuất nhập, đơn giá, ước tính chi phí và lý do cụ thể (Bù hàng hết hạn / Chạm định mức).
6. Phong cách:
   - Chuẩn văn phong y tế, mạch lạc, dễ quan sát, trực quan bằng bảng số liệu.
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
    const fallbackText = generateExpertChatAnswer(question, items, transactions, holidays, categories);
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

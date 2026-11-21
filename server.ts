import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type, type FunctionDeclaration } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import {
  generateExpertInventoryAnalysis,
  generateExpertChatAnswer,
  buildInventoryAnalyticsContext,
  executeInventoryTool,
} from './src/expertAnalysis.js';


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

    // Model fallback chain: Use active Gemini 4 models
    const modelsToTry = ['gemini-4-hydrogen', 'gemini-3.1-flash-lite'];

    for (const modelName of modelsToTry) {
      try {
        const timeoutPromise = new Promise<null>((_, reject) =>
          setTimeout(() => reject(new Error('TIMEOUT_AFTER_25S')), 25000)
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
    return res.json(generateExpertInventoryAnalysis(items, transactions, holidays, categories));
  });

  const INVENTORY_TOOLS: FunctionDeclaration[] = [
    {
      name: 'searchInventoryItems',
      description:
        'Tìm kiếm và tra cứu chi tiết tồn kho, tồn khả dụng an toàn, hạn sử dụng từng lô hàng và tốc độ tiêu hao của một hoặc nhiều vật tư theo tên, kích thước (tự hiểu 8x10 <-> 10x8) hoặc nhóm danh mục.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          query: {
            type: Type.STRING,
            description: 'Tên, kích thước hoặc từ khóa vật tư cần tra cứu (ví dụ: "phim x quang 8x10", "barit", "omnipaque"). Để trống nếu lọc theo danh mục.',
          },
          categoryFilter: {
            type: Type.STRING,
            description: 'Tên nhóm vật tư tùy chọn để lọc (ví dụ: "Văn phòng phẩm", "Dược", "Vật tư tiêu hao", "Hóa chất").',
          },
        },
      },
    },
    {
      name: 'forecastItemDepletion',
      description:
        'Dự báo ngày hết dự kiến theo ngày làm việc thực tế (đã trừ ngày nghỉ lễ), so sánh 4 chu kỳ (30 ngày, 90 ngày, YTD, 365 ngày) và tính toán kế hoạch dự trù nhập kho theo số ngày tới + tỷ lệ % dự phòng.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          itemQuery: {
            type: Type.STRING,
            description: 'Tên hoặc kích thước vật tư cần dự báo / tính dự trù.',
          },
          horizonDays: {
            type: Type.INTEGER,
            description: 'Số ngày dự trù trong tương lai (mặc định 30).',
          },
          safetyPercent: {
            type: Type.NUMBER,
            description: 'Tỷ lệ % dự phòng an toàn cộng thêm (ví dụ 20 cho 20%, mặc định 0).',
          },
          referenceWindow: {
            type: Type.STRING,
            description: 'Chu kỳ tham chiếu tốc độ tiêu hao: "30d", "90d", "ytd", hoặc "365d".',
          },
        },
        required: ['itemQuery'],
      },
    },
    {
      name: 'analyzeTransactionsAndDepartments',
      description:
        'Thống kê chi tiết lịch sử xuất/nhập kho, mức tiêu hao theo từng phòng ban/máy CĐHA (Phòng CLVT/CT, X-quang, MRI/CHT, Siêu âm, DSA) và top vật tư xuất nhiều nhất.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          itemQuery: {
            type: Type.STRING,
            description: 'Lọc theo tên vật tư cụ thể (tùy chọn).',
          },
          department: {
            type: Type.STRING,
            description: 'Tên phòng ban / modality (ví dụ: "clvt", "x quang", "mri", "sieu am").',
          },
          type: {
            type: Type.STRING,
            description: 'Loại giao dịch: "OUT" (xuất kho), "IN" (nhập kho), hoặc "ALL". Mặc định "OUT".',
          },
          days: {
            type: Type.INTEGER,
            description: 'Số ngày gần nhất cần thống kê (mặc định 90, tối đa 730).',
          },
        },
      },
    },
    {
      name: 'checkExpiryAndFefo',
      description:
        'Rà soát toàn bộ lô hàng đã quá hạn sử dụng cần niêm phong/mua bù và các lô hàng cận hạn cần ưu tiên xuất trước theo nguyên tắc FEFO.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          nearingDays: {
            type: Type.INTEGER,
            description: 'Ngưỡng số ngày cận hạn cần kiểm tra (mặc định 60).',
          },
        },
      },
    },
    {
      name: 'computeInventoryValuation',
      description:
        'Tính tổng giá trị tài sản tồn kho hiện tại bằng VNĐ: tổng giá trị sổ sách, giá trị tồn khả dụng an toàn, giá trị tổn thất do hàng quá hạn và phân bổ theo từng nhóm vật tư.',
      parameters: {
        type: Type.OBJECT,
        properties: {},
      },
    },
  ];

  // API Route: Interactive Q&A Warehouse Copilot with Gemini AI (Function Calling + Grounded DB)
  app.post('/api/gemini/chat', async (req, res) => {
    const { question = '', history = [], items = [], transactions = [], holidays = [], categories = [] } = req.body;

    if (!question || typeof question !== 'string') {
      return res.status(400).json({ error: 'Question is required' });
    }

    const ai = getGeminiClient();
    if (!ai) {
      const fallbackText = generateExpertChatAnswer(question, items, transactions, holidays, categories, history);
      return res.json({ text: fallbackText, engine: 'expert' });
    }

    // Compact warehouse index so Gemini knows exact item names & high-level overview before invoking tools
    const analyticsContext = buildInventoryAnalyticsContext(items, transactions, holidays, categories);
    const compactDirectory = analyticsContext.items.map(i => ({
      name: i.name,
      category: i.category,
      unit: i.unit,
      usableStock: i.usableStock,
      minStock: i.minStock,
      hasExpired: i.hasExpired,
    }));

    const systemInstruction = `
Bạn là Trợ lý AI Chuyên gia Quản lý Kho Dược & Vật tư Y tế của Khoa Chẩn đoán Hình ảnh (CĐHA).
Ngày hiện tại trên hệ thống: ${analyticsContext.todayStr} (đã cấu hình ${analyticsContext.holidaysRecordedCount} ngày nghỉ lễ/nghỉ trực, quản lý ${analyticsContext.totalItemsCount} mặt hàng và ${analyticsContext.totalTransactionsCount} giao dịch).

NGUYÊN TẮC BẮT BUỘC KHI PHÂN TÍCH & TRẢ LỜI:
1. SỬ DỤNG CÔNG CỤ TRUY VẤN DỮ LIỆU CHÍNH XÁC (FUNCTION CALLING):
   - LUÔN gọi đúng công cụ (tool) phù hợp để lấy số liệu tính toán chính xác trước khi trả lời câu hỏi về vật tư, ngày hết, dự trù, phòng ban, hạn dùng hay giá trị kho.
   - Khi người dùng hỏi dự báo / ước tính ngày hết / dự trù số ngày tới + % dự phòng: gọi \`forecastItemDepletion\`.
   - Khi người dùng hỏi so sánh các vật tư hoặc hỏi thông số chi tiết: gọi \`searchInventoryItems\` (hoặc \`forecastItemDepletion\`).
   - Khi hỏi tiêu hao theo phòng máy (Phòng CLVT/CT, X-quang, MRI/CHT, Siêu âm) hoặc lịch sử nhập/xuất: gọi \`analyzeTransactionsAndDepartments\`.
   - Khi hỏi lô quá hạn / cận hạn FEFO: gọi \`checkExpiryAndFefo\`.
   - Khi hỏi tổng giá trị kho / tiền hàng: gọi \`computeInventoryValuation\`.
2. ĐỐI CHIẾU TÊN & QUY ĐỔI KÍCH CỠ:
   - Tự hiểu kích thước đảo chiều (8x10 <-> 10x8) và viết tắt ngành (XQ = X-quang, CLVT = CT, CHT = MRI, VPP = Văn phòng phẩm).
   - Danh mục tóm tắt hiện có: ${JSON.stringify(compactDirectory)}
3. ĐỊNH DẠNG CHUYÊN NGHIỆP & ZERO HALLUCINATION:
   - Trả lời thẳng trọng tâm câu hỏi bằng tiếng Việt, trình bày số liệu chi tiết bằng Bảng Markdown chuẩn GFM (có dòng trống trước và sau bảng).
   - Phân biệt rõ Tồn sổ sách vs. Tồn khả dụng an toàn (đã trừ hàng hết hạn). Tuyệt đối không bịa đặt số liệu ngoài kết quả từ các tool.
`;

    // Build structured conversation history + new user message
    const baseContents: any[] = [];
    if (Array.isArray(history)) {
      for (const h of history.slice(-8)) {
        if (h?.text && (h.role === 'user' || h.role === 'model')) {
          baseContents.push({
            role: h.role,
            parts: [{ text: String(h.text) }],
          });
        }
      }
    }
    baseContents.push({
      role: 'user',
      parts: [{ text: question }],
    });

    const modelsToTry = ['gemini-4-hydrogen', 'gemini-3.1-flash-lite'];

    for (const modelName of modelsToTry) {
      try {
        const conversation = [...baseContents];
        const MAX_TOOL_ROUNDS = 4;

        for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
          const timeoutPromise = new Promise<null>((_, reject) =>
            setTimeout(() => reject(new Error('TIMEOUT_AFTER_25S')), 25000)
          );

          const apiPromise = ai.models.generateContent({
            model: modelName,
            contents: conversation,
            config: {
              systemInstruction,
              tools: [{ functionDeclarations: INVENTORY_TOOLS }],
            },
          });

          const response: any = await Promise.race([apiPromise, timeoutPromise]);

          if (response?.functionCalls && response.functionCalls.length > 0 && round < MAX_TOOL_ROUNDS) {
            const modelContent = response.candidates?.[0]?.content || {
              role: 'model',
              parts: response.functionCalls.map((fc: any) => ({ functionCall: fc })),
            };
            conversation.push(modelContent);

            const functionResponseParts = response.functionCalls.map((call: any) => {
              const result = executeInventoryTool(
                call.name,
                (call.args as Record<string, any>) || {},
                items,
                transactions,
                holidays,
                categories
              );
              return {
                functionResponse: {
                  id: call.id,
                  name: call.name,
                  response: { result },
                },
              };
            });

            conversation.push({
              role: 'user',
              parts: functionResponseParts,
            });
            continue;
          }

          if (response && response.text) {
            return res.json({ text: response.text, engine: 'gemini' });
          }
          break;
        }
      } catch (err: any) {
        const errStr = String(err?.message || err || '');
        if (errStr.includes('API_KEY_INVALID') || errStr.includes('API key not valid') || errStr.includes('PERMISSION_DENIED')) {
          break;
        }
      }
    }

    // Fallback if cloud API is busy or API key is not active
    const fallbackText = generateExpertChatAnswer(question, items, transactions, holidays, categories, history);
    return res.json({ text: fallbackText, engine: 'expert' });
  });

  // API Route: General Gemini generate content
  app.post('/api/gemini/generate', async (req, res) => {
    try {
      const { prompt, model = 'gemini-4-hydrogen' } = req.body;
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
      server: { middlewareMode: true, hmr: false, ws: false },
      appType: 'spa',
    });

    // Skip HMR WebSocket handshake in @vite/client when HMR is disabled behind proxy
    app.get('/@vite/client', async (_req, res, next) => {
      try {
        const result = await vite.transformRequest('/@vite/client');
        if (result?.code) {
          const patched = result.code
            .replace(
              'let isConnected = !invokeableTransport.connect;',
              'let isConnected = true;'
            )
            .replace(
              'await invokeableTransport.send(data);',
              'return;'
            )
            .replace(
              'transport.connect(createHMRHandler(handleMessage));',
              '/* HMR disabled: skip WebSocket connection */'
            );
          res.type('application/javascript').send(patched);
          return;
        }
      } catch {
        // Fallback to standard Vite middleware
      }
      next();
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

import { collection, query, getDocs, limit, orderBy } from "firebase/firestore";
import { db } from "./firebase";
import { generateExpertInventoryAnalysis, generateExpertChatAnswer, AnalysisResult } from "./expertAnalysis";

export async function analyzeInventory(
  cachedData?: {
    items?: Record<string, any>[];
    categories?: Record<string, any>[];
    transactions?: Record<string, any>[];
    holidays?: Record<string, any>[];
  }
): Promise<AnalysisResult> {
  let items: Record<string, any>[] = cachedData?.items || [];
  let categories: Record<string, any>[] = cachedData?.categories || [];
  let transactions: Record<string, any>[] = cachedData?.transactions || [];
  let holidays: Record<string, any>[] = cachedData?.holidays || [];

  // Lấy dữ liệu tồn kho hiện tại từ Firestore nếu chưa có sẵn trong RAM
  if (items.length === 0) {
    try {
      const itemsSnapshot = await getDocs(collection(db, "items"));
      items = itemsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      const categoriesSnapshot = await getDocs(collection(db, "categories"));
      categories = categoriesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      const transactionsSnapshot = await getDocs(
        query(collection(db, "transactions"), orderBy("timestamp", "desc"), limit(50))
      );
      transactions = transactionsSnapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as Record<string, any>) }));

      const holidaysSnapshot = await getDocs(collection(db, "holidays"));
      holidays = holidaysSnapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as Record<string, any>) }));
    } catch (dbErr) {
      console.warn("Could not query Firestore for AI analysis, using empty or local state:", dbErr);
    }
  }

  // Gắn tên danh mục nếu có
  if (categories.length > 0) {
    items = items.map(i => {
      const cat = categories.find(c => c.id === i.categoryId);
      return {
        ...i,
        categoryName: cat?.name || i.category || '',
      };
    });
  }

  // Thử gọi endpoint phân tích AI trên server (Node.js Express / Gemini backend)
  try {
    const response = await fetch("/api/gemini/analyze", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        items,
        categories,
        transactions,
        holidays,
      }),
    });

    if (response.ok) {
      const data = await response.json();
      if (data && data.summary && Array.isArray(data.alerts)) {
        return data;
      }
    }
  } catch (_netErr) {
    // Bỏ qua lỗi mạng (VD khi host static trên GitHub Pages hoặc mất kết nối server)
  }

  // Fallback an toàn tuyệt đối: Luôn trả về kết quả phân tích chuyên gia đầy đủ
  return generateExpertInventoryAnalysis(items, transactions, holidays, categories);
}

export async function askAiAssistant(
  question: string,
  history: Array<{ role: 'user' | 'model'; text: string }> = [],
  cachedData?: {
    items?: Record<string, any>[];
    transactions?: Record<string, any>[];
    holidays?: Record<string, any>[];
    categories?: Record<string, any>[];
  }
): Promise<string> {
  let items: Record<string, any>[] = cachedData?.items || [];
  let transactions: Record<string, any>[] = cachedData?.transactions || [];
  let holidays: Record<string, any>[] = cachedData?.holidays || [];

  // Nếu chưa có sẵn dữ liệu trong RAM, mới truy vấn Firestore
  if (items.length === 0) {
    try {
      const itemsSnapshot = await getDocs(collection(db, "items"));
      items = itemsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      const transactionsSnapshot = await getDocs(
        query(collection(db, "transactions"), orderBy("timestamp", "desc"), limit(40))
      );
      transactions = transactionsSnapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as Record<string, any>) }));

      const holidaysSnapshot = await getDocs(collection(db, "holidays"));
      holidays = holidaysSnapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as Record<string, any>) }));
    } catch (dbErr) {
      console.warn("Could not query Firestore for AI Q&A, using fallback:", dbErr);
    }
  }

  // Tự động gắn tên nhóm phân loại (categoryName) vào từng vật tư
  if (cachedData?.categories && cachedData.categories.length > 0) {
    items = items.map(i => {
      const cat = cachedData.categories?.find(c => c.id === i.categoryId);
      return {
        ...i,
        categoryName: cat?.name || i.category || '',
      };
    });
  }

  try {
    const response = await fetch("/api/gemini/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        question,
        history,
        items,
        transactions,
        categories: cachedData?.categories || [],
      }),
    });

    if (response.ok) {
      const data = await response.json();
      if (data && data.text) {
        return data.text;
      }
    }
  } catch (_netErr) {
    // Offline fallback
  }

  return generateExpertChatAnswer(question, items, transactions, holidays, cachedData?.categories);
}

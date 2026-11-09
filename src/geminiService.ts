import { collection, query, getDocs, limit, orderBy } from "firebase/firestore";
import { db } from "./firebase";
import { generateExpertInventoryAnalysis, AnalysisResult } from "./expertAnalysis";

export async function analyzeInventory(): Promise<AnalysisResult> {
  let items: Record<string, any>[] = [];
  let transactions: Record<string, any>[] = [];
  let holidays: Record<string, any>[] = [];

  // Lấy dữ liệu tồn kho hiện tại từ Firestore
  try {
    const itemsSnapshot = await getDocs(collection(db, "items"));
    items = itemsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    const transactionsSnapshot = await getDocs(
      query(collection(db, "transactions"), orderBy("timestamp", "desc"), limit(50))
    );
    transactions = transactionsSnapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as Record<string, any>) }));

    const holidaysSnapshot = await getDocs(collection(db, "holidays"));
    holidays = holidaysSnapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as Record<string, any>) }));
  } catch (dbErr) {
    console.warn("Could not query Firestore for AI analysis, using empty or local state:", dbErr);
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
  return generateExpertInventoryAnalysis(items, transactions, holidays);
}

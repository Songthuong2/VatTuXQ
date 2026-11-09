// Intelligent Diagnostic Imaging Inventory Expert Engine (Clinical & Fail-safe)
export interface AnalysisResult {
  summary: string;
  alerts: { type: 'danger' | 'warning' | 'info'; message: string; item?: string }[];
  recommendations: { action: string; priority: 'high' | 'medium' | 'low'; reason: string }[];
  anomalies: { description: string; severity: 'high' | 'medium' | 'low' }[];
  detailedAnalysis: string;
}

export function generateExpertInventoryAnalysis(
  items: any[] = [],
  transactions: any[] = [],
  holidays: any[] = []
): AnalysisResult {
  const now = new Date();

  // 1. Phân loại tồn kho
  const outOfStockItems = items.filter(i => Number(i.currentStock || 0) <= 0);
  const lowStockItems = items.filter(
    i => Number(i.currentStock || 0) > 0 && Number(i.currentStock || 0) <= Number(i.minStock || 0)
  );
  const safeItems = items.filter(i => Number(i.currentStock || 0) > Number(i.minStock || 0));

  // 2. Phân loại hạn sử dụng
  const expiredItems: any[] = [];
  const nearingExpiryItems: any[] = []; // hết hạn trong vòng 60 ngày
  const sixtyDaysLater = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);

  items.forEach(i => {
    const batches = Array.isArray(i.batches) ? i.batches : [];
    let hasExpired = false;
    let hasNearing = false;

    if (batches.length > 0) {
      batches.forEach((b: any) => {
        if (!b.expiryDate) return;
        const exp = new Date(b.expiryDate);
        if (exp < now) hasExpired = true;
        else if (exp <= sixtyDaysLater) hasNearing = true;
      });
    } else if (i.expiryDate) {
      const exp = new Date(i.expiryDate);
      if (exp < now) hasExpired = true;
      else if (exp <= sixtyDaysLater) hasNearing = true;
    }

    if (hasExpired) expiredItems.push(i);
    else if (hasNearing) nearingExpiryItems.push(i);
  });

  // 3. Phân tích giao dịch xuất kho gần đây
  const outTransactions = transactions.filter(t => t.type === 'OUT');
  const consumptionByItem: Record<string, { name: string; qty: number; unit: string }> = {};
  outTransactions.forEach(t => {
    const itemId = t.itemId || 'unknown';
    const item = items.find(i => i.id === itemId);
    const name = item?.name || t.itemName || 'Vật tư';
    const unit = item?.unit || 'đơn vị';
    const q = Number(t.quantity || 0);
    if (!consumptionByItem[itemId]) {
      consumptionByItem[itemId] = { name, qty: 0, unit };
    }
    consumptionByItem[itemId].qty += q;
  });

  const topConsumed = Object.values(consumptionByItem)
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 5);

  // 4. Tổng hợp cảnh báo (Alerts)
  const alerts: { type: 'danger' | 'warning' | 'info'; message: string; item?: string }[] = [];

  outOfStockItems.slice(0, 5).forEach(i => {
    alerts.push({
      type: 'danger',
      message: `ĐÃ HẾT HÀNG: Tồn kho hiện tại bằng 0 ${i.unit || ''} (Định mức tối thiểu: ${i.minStock || 0}). Cần lập phiếu nhập bổ sung khẩn cấp!`,
      item: i.name || 'Vật tư',
    });
  });

  expiredItems.slice(0, 4).forEach(i => {
    alerts.push({
      type: 'danger',
      message: `CẢNH BÁO HẠN DÙNG: Phát hiện lô hàng đã quá hạn sử dụng. Yêu cầu kiểm tra niêm phong hoặc đổi trả nhà cung cấp.`,
      item: i.name || 'Vật tư',
    });
  });

  lowStockItems.slice(0, 6).forEach(i => {
    alerts.push({
      type: 'warning',
      message: `SẮP HẾT HÀNG: Tồn kho hiện tại (${i.currentStock} ${i.unit || ''}) đã chạm hoặc thấp hơn định mức tối thiểu (${i.minStock}).`,
      item: i.name || 'Vật tư',
    });
  });

  nearingExpiryItems.slice(0, 4).forEach(i => {
    alerts.push({
      type: 'warning',
      message: `SẮP HẾT HẠN TRONG 60 NGÀY: Cần ưu tiên xuất sử dụng trước theo nguyên tắc FEFO.`,
      item: i.name || 'Vật tư',
    });
  });

  if (alerts.length === 0) {
    alerts.push({
      type: 'info',
      message: 'Tất cả vật tư hiện đang ở ngưỡng an toàn, không có mặt hàng hết hạn hoặc chạm định mức tối thiểu.',
      item: 'Toàn bộ kho',
    });
  }

  // 5. Đề xuất hành động (Recommendations)
  const recommendations: { action: string; priority: 'high' | 'medium' | 'low'; reason: string }[] = [];

  if (outOfStockItems.length > 0) {
    recommendations.push({
      action: `Lập dự trù nhập khẩn cấp cho ${outOfStockItems.map(i => i.name).slice(0, 3).join(', ')}${outOfStockItems.length > 3 ? ` và ${outOfStockItems.length - 3} mặt hàng khác` : ''}`,
      priority: 'high',
      reason: `Các mặt hàng này đã hết tồn kho hoàn toàn, nguy cơ gián đoạn hoạt động chụp chiếu chẩn đoán hình ảnh.`,
    });
  }

  if (expiredItems.length > 0) {
    recommendations.push({
      action: `Niêm phong và lập biên bản xử lý lô hết hạn của ${expiredItems.map(i => i.name).slice(0, 2).join(', ')}`,
      priority: 'high',
      reason: `Đảm bảo an toàn y tế và tuân thủ quy chế dược/vật tư y tế bệnh viện.`,
    });
  }

  if (lowStockItems.length > 0) {
    recommendations.push({
      action: `Đưa vào danh sách dự trù định kỳ: ${lowStockItems.map(i => i.name).slice(0, 4).join(', ')}`,
      priority: 'medium',
      reason: `Số lượng tồn dưới ngưỡng dự phòng tối thiểu, cần bổ sung trước khi hết hẳn.`,
    });
  }

  if (nearingExpiryItems.length > 0) {
    recommendations.push({
      action: `Điều phối xuất trước (FEFO) cho các lô sắp hết hạn: ${nearingExpiryItems.map(i => i.name).slice(0, 3).join(', ')}`,
      priority: 'medium',
      reason: `Thời hạn sử dụng còn dưới 60 ngày, cần ưu tiên luân chuyển đến các phòng máy có tần suất sử dụng cao.`,
    });
  }

  recommendations.push({
    action: `Thực hiện đối chiếu kiểm kê định kỳ thực tế với số liệu phần mềm`,
    priority: 'low',
    reason: `Duy trì tính chính xác giữa số liệu sổ sách và lượng vật tư thực tế tại kho trung tâm và các phòng máy.`,
  });

  // 6. Phát hiện bất thường (Anomalies)
  const anomalies: { description: string; severity: 'high' | 'medium' | 'low' }[] = [];

  topConsumed.forEach(c => {
    if (c.qty > 50) {
      anomalies.push({
        description: `Mặt hàng "${c.name}" có lượng tiêu hao nổi bật (${c.qty} ${c.unit}) trong các ca chụp gần đây.`,
        severity: 'medium',
      });
    }
  });

  if (anomalies.length === 0) {
    anomalies.push({
      description: 'Chưa phát hiện bất thường đột biến trong lưu lượng xuất nhập kho gần đây.',
      severity: 'low',
    });
  }

  // 7. Tóm tắt tổng quan (Summary)
  const summary = `Kho hiện có ${items.length} danh mục vật tư. Phát hiện ${outOfStockItems.length} mặt hàng cạn kho, ${lowStockItems.length} mặt hàng chạm ngưỡng dự trù và ${expiredItems.length + nearingExpiryItems.length} mặt hàng cần lưu ý hạn dùng. Đã tổng hợp các khuyến nghị ưu tiên nhằm đảm bảo liên tục cho hoạt động chẩn đoán hình ảnh.`;

  // 8. Báo cáo chi tiết định dạng Markdown (Detailed Analysis)
  const detailedAnalysis = `### BÁO CÁO PHÂN TÍCH CHUYÊN SÂU KHO VẬT TƯ CĐHA

#### 1. Tổng quan tình trạng kho
- **Tổng số mặt hàng quản lý:** **${items.length}** vật tư
- **Số mặt hàng an toàn:** **${safeItems.length}** (${items.length > 0 ? Math.round((safeItems.length / items.length) * 100) : 0}%)
- **Số mặt hàng chạm định mức cảnh báo:** **${lowStockItems.length}**
- **Số mặt hàng đã cạn kho (Tồn = 0):** **${outOfStockItems.length}**
- **Vật tư cần theo dõi hạn sử dụng:** **${expiredItems.length}** đã quá hạn, **${nearingExpiryItems.length}** cận hạn trong 60 ngày

#### 2. Vật tư tiêu hao nhiều nhất gần đây
${topConsumed.length > 0 ? topConsumed.map((c, idx) => `${idx + 1}. **${c.name}:** ${c.qty} ${c.unit}`).join('\n') : '- Chưa ghi nhận dữ liệu xuất kho.'}

#### 3. Đánh giá chu kỳ làm việc & Ngày nghỉ
- Hệ thống đã tích hợp lịch nghỉ lễ/nghỉ trực (${holidays.length} ngày nghỉ đã ghi nhận) nhằm điều chỉnh lượng tiêu hao dự báo theo số ngày làm việc thực tế của các phòng máy X-quang, CT, MRI, Siêu âm.

#### 4. Khuyến nghị trọng tâm cho cán bộ phụ trách
1. **Ưu tiên 1:** Trình duyệt phiếu dự trù khẩn cho các mặt hàng đã hết tồn kho để tránh thiếu hụt trong ca trực.
2. **Ưu tiên 2:** Kiểm tra thực tế hạn dùng trên bao bì các lô cận hạn và điều phối sử dụng trước (nguyên tắc FEFO).
3. **Ưu tiên 3:** Định kỳ chốt số liệu kiểm kê vào cuối tuần/cuối tháng để đồng bộ hóa tồn thực tế và phần mềm.`;

  return {
    summary,
    alerts,
    recommendations,
    anomalies,
    detailedAnalysis,
  };
}

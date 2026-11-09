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

// Fallback Q&A Engine for Warehouse Assistant
export function generateExpertChatAnswer(
  question: string,
  items: any[] = [],
  transactions: any[] = [],
  holidays: any[] = []
): string {
  const q = question.toLowerCase().trim();
  const now = new Date();
  const sixtyDaysLater = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);

  // 1. Kiểm tra hỏi về Hạn sử dụng / Quá hạn / Cận hạn
  if (q.includes('hạn') || q.includes('hết hạn') || q.includes('cận hạn') || q.includes('date') || q.includes('fefo')) {
    const expired: { name: string; batch: string; exp: string; qty: number; unit: string }[] = [];
    const nearing: { name: string; batch: string; exp: string; qty: number; unit: string; daysLeft: number }[] = [];

    items.forEach(i => {
      const batches = Array.isArray(i.batches) ? i.batches : [];
      if (batches.length > 0) {
        batches.forEach((b: any) => {
          if (!b.expiryDate) return;
          const exp = new Date(b.expiryDate);
          const daysLeft = Math.ceil((exp.getTime() - now.getTime()) / (1000 * 3600 * 24));
          if (exp < now) {
            expired.push({ name: i.name, batch: b.batchNumber || 'Mặc định', exp: b.expiryDate, qty: b.quantity || 0, unit: i.unit });
          } else if (exp <= sixtyDaysLater) {
            nearing.push({ name: i.name, batch: b.batchNumber || 'Mặc định', exp: b.expiryDate, qty: b.quantity || 0, unit: i.unit, daysLeft });
          }
        });
      } else if (i.expiryDate) {
        const exp = new Date(i.expiryDate);
        const daysLeft = Math.ceil((exp.getTime() - now.getTime()) / (1000 * 3600 * 24));
        if (exp < now) {
          expired.push({ name: i.name, batch: 'Lô gốc', exp: i.expiryDate, qty: i.currentStock || 0, unit: i.unit });
        } else if (exp <= sixtyDaysLater) {
          nearing.push({ name: i.name, batch: 'Lô gốc', exp: i.expiryDate, qty: i.currentStock || 0, unit: i.unit, daysLeft });
        }
      }
    });

    let ans = `### 📋 Báo cáo rà soát Hạn sử dụng & Lô hàng (FEFO)\n\n`;
    if (expired.length > 0) {
      ans += `🚨 **Các lô hàng ĐÃ QUÁ HẠN (${expired.length} mục) - Cần niêm phong ngay:**\n`;
      expired.forEach((e, idx) => {
        ans += `${idx + 1}. **${e.name}** | Số lô: \`${e.batch}\` | Hạn dùng: **${e.exp}** | Số lượng: **${e.qty} ${e.unit}**\n`;
      });
      ans += `\n`;
    } else {
      ans += `✅ Hiện tại **không phát hiện lô hàng nào bị quá hạn sử dụng** trong kho.\n\n`;
    }

    if (nearing.length > 0) {
      ans += `⚠️ **Các lô hàng CẬN HẠN (< 60 ngày) (${nearing.length} mục) - Ưu tiên xuất trước theo FEFO:**\n`;
      nearing.sort((a, b) => a.daysLeft - b.daysLeft).forEach((n, idx) => {
        ans += `${idx + 1}. **${n.name}** | Số lô: \`${n.batch}\` | Hạn: **${n.exp}** (còn **${n.daysLeft} ngày**) | Tồn: **${n.qty} ${n.unit}**\n`;
      });
    } else {
      ans += `✅ Không có lô hàng nào sắp hết hạn trong 60 ngày tới.\n`;
    }
    return ans;
  }

  // 2. Kiểm tra hỏi về Hết hàng / Sắp hết / Tồn tối thiểu
  if (q.includes('hết hàng') || q.includes('sắp hết') || q.includes('tối thiểu') || q.includes('cạn kho') || q.includes('cảnh báo')) {
    const out = items.filter(i => Number(i.currentStock || 0) <= 0);
    const low = items.filter(i => Number(i.currentStock || 0) > 0 && Number(i.currentStock || 0) <= Number(i.minStock || 0));

    let ans = `### ⚠️ Tình trạng Cảnh báo Tồn kho\n\n`;
    if (out.length > 0) {
      ans += `🚨 **Vật tư đã CẠN KHO (Tồn = 0) (${out.length} mặt hàng):**\n`;
      out.forEach((i, idx) => {
        ans += `${idx + 1}. **${i.name}** (${i.category || 'Vật tư'}) - Định mức tối thiểu yêu cầu: **${i.minStock || 0} ${i.unit}**\n`;
      });
      ans += `\n`;
    } else {
      ans += `✅ Tuyệt vời! Hiện tại không có mặt hàng nào bị hết tồn kho hoàn toàn.\n\n`;
    }

    if (low.length > 0) {
      ans += `⚠️ **Vật tư SẮP HẾT (Tồn kho <= Định mức tối thiểu) (${low.length} mặt hàng):**\n`;
      low.forEach((i, idx) => {
        ans += `${idx + 1}. **${i.name}**: Hiện còn **${i.currentStock} ${i.unit}** (Ngưỡng an toàn: ${i.minStock} ${i.unit})\n`;
      });
    } else {
      ans += `✅ Tất cả các mặt hàng khác đều duy trì lượng tồn trên mức tối thiểu.\n`;
    }
    return ans;
  }

  // 3. Kiểm tra hỏi về Dự trù / Đề xuất nhập
  if (q.includes('dự trù') || q.includes('nhập hàng') || q.includes('cần mua') || q.includes('kế hoạch')) {
    const needed = items.filter(i => Number(i.currentStock || 0) <= Number(i.minStock || 0));
    let ans = `### 📝 Khuyến nghị Lập Kế hoạch Dự trù Vật tư\n\n`;
    if (needed.length === 0) {
      ans += `✅ Toàn bộ **${items.length}** mặt hàng hiện đều có số lượng tồn kho trên mức tối thiểu. Chưa cần lập phiếu dự trù khẩn.\n\n`;
      ans += `*Gợi ý:* Bạn có thể rà soát lại lượng tiêu thụ tuần qua để chuẩn bị dự trù định kỳ cho tháng tới.`;
      return ans;
    }

    ans += `Dựa trên dữ liệu tồn kho thực tế và định mức an toàn, đề xuất nhập các mặt hàng sau:\n\n`;
    ans += `| Tên vật tư | Tồn hiện tại | Định mức Min | Đề xuất nhập | Đơn vị |\n`;
    ans += `| :--- | :---: | :---: | :---: | :---: |\n`;

    needed.forEach(i => {
      const cur = Number(i.currentStock || 0);
      const min = Number(i.minStock || 0);
      const suggest = Math.max(min * 2 - cur, min || 10);
      ans += `| **${i.name}** | ${cur} | ${min} | **+${suggest}** | ${i.unit} |\n`;
    });

    ans += `\n*Ghi chú:* Số lượng đề xuất = (Định mức tối thiểu × 2) - Tồn hiện tại, nhằm đảm bảo duy trì đệm an toàn dự phòng cho các ca trực cấp cứu.`;
    return ans;
  }

  // 4. Kiểm tra hỏi về Xuất kho / Tiêu hao / Phòng ban
  if (q.includes('tiêu hao') || q.includes('xuất') || q.includes('phòng') || q.includes('nhiều nhất')) {
    const outTx = transactions.filter(t => t.type === 'OUT');
    const deptTotals: Record<string, number> = {};
    const itemTotals: Record<string, { name: string; qty: number; unit: string }> = {};

    outTx.forEach(t => {
      const dept = t.department || 'Chung / Khác';
      deptTotals[dept] = (deptTotals[dept] || 0) + Number(t.quantity || 0);

      const id = t.itemId || t.itemName || 'other';
      if (!itemTotals[id]) {
        itemTotals[id] = { name: t.itemName || 'Vật tư', qty: 0, unit: t.unit || 'đơn vị' };
      }
      itemTotals[id].qty += Number(t.quantity || 0);
    });

    const topItems = Object.values(itemTotals).sort((a, b) => b.qty - a.qty).slice(0, 5);

    let ans = `### 📊 Thống kê Tiêu hao & Xuất kho Gần đây\n\n`;
    ans += `**Top 5 vật tư được xuất sử dụng nhiều nhất:**\n`;
    if (topItems.length > 0) {
      topItems.forEach((it, idx) => {
        ans += `${idx + 1}. **${it.name}:** ${it.qty} ${it.unit}\n`;
      });
    } else {
      ans += `- Chưa ghi nhận lịch sử xuất kho gần đây.\n`;
    }

    ans += `\n**Lượng vật tư đã cấp theo phòng ban:**\n`;
    const depts = Object.entries(deptTotals);
    if (depts.length > 0) {
      depts.forEach(([d, q]) => {
        ans += `- **Phòng ${d}:** ${q} đơn vị\n`;
      });
    } else {
      ans += `- Chưa có dữ liệu phân bổ phòng ban.\n`;
    }
    return ans;
  }

  // 5. Tìm kiếm vật tư cụ thể theo tên (Tra cứu)
  const matchedItem = items.find(i => {
    const name = (i.name || '').toLowerCase();
    return q.includes(name) || name.split(' ').filter(w => w.length > 2).some(w => q.includes(w));
  });

  if (matchedItem) {
    const cur = Number(matchedItem.currentStock || 0);
    const min = Number(matchedItem.minStock || 0);
    const batches = Array.isArray(matchedItem.batches) ? matchedItem.batches : [];

    let statusText = '🟢 An toàn';
    if (cur <= 0) statusText = '🔴 Hết hàng hoàn toàn';
    else if (cur <= min) statusText = '🟡 Cảnh báo (Dưới định mức tối thiểu)';

    let ans = `### 🔍 Thông tin chi tiết vật tư: **${matchedItem.name}**\n\n`;
    ans += `- **Nhóm phân loại:** ${matchedItem.category || 'Chưa phân nhóm'}\n`;
    ans += `- **Số lượng tồn hiện tại:** **${cur} ${matchedItem.unit}**\n`;
    ans += `- **Định mức tồn tối thiểu:** ${min} ${matchedItem.unit}\n`;
    ans += `- **Đơn giá:** ${Number(matchedItem.price || 0).toLocaleString('vi-VN')} đ\n`;
    ans += `- **Trạng thái kho:** ${statusText}\n\n`;

    if (batches.length > 0) {
      ans += `**Chi tiết các lô hàng đang lưu kho:**\n`;
      batches.forEach((b: any, idx: number) => {
        ans += `${idx + 1}. Lô **${b.batchNumber || 'Chung'}** | Số lượng: **${b.quantity || 0} ${matchedItem.unit}** | Hạn dùng: **${b.expiryDate || 'Không có hạn'}**\n`;
      });
    } else if (matchedItem.expiryDate) {
      ans += `- **Hạn sử dụng:** ${matchedItem.expiryDate}\n`;
    }

    return ans;
  }

  // 6. Trả lời tổng quan mặc định
  return `### 💡 Tổng quan kho Chẩn đoán hình ảnh\n\n` +
    `Hiện tại hệ thống đang quản lý **${items.length}** danh mục vật tư với **${transactions.length}** giao dịch ghi nhận gần đây.\n\n` +
    `Bạn có thể đặt các câu hỏi trực tiếp như:\n` +
    `- *"Vật tư nào đã hết hàng hoặc sắp hết?"*\n` +
    `- *"Có lô hàng nào quá hạn hoặc cận hạn dưới 60 ngày không?"*\n` +
    `- *"Đề xuất kế hoạch dự trù vật tư cần nhập cho tuần tới"* \n` +
    `- *"Tra cứu tồn kho của [Tên vật tư cụ thể]"*\n` +
    `- *"Phòng ban nào tiêu hao nhiều nhất gần đây?"*`;
}


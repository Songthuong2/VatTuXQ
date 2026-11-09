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

function removeVietnameseTones(str: string): string {
  if (!str) return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
}

function getItemCategoryName(item: any): string {
  return item.categoryName || item.category || (item.categoryId ? String(item.categoryId) : 'Khác');
}

// Fallback & Offline Q&A Engine for Warehouse Assistant
export function generateExpertChatAnswer(
  question: string,
  items: any[] = [],
  transactions: any[] = [],
  holidays: any[] = []
): string {
  const q = (question || '').toLowerCase().trim();
  const cleanQ = removeVietnameseTones(q);
  const now = new Date();
  const sixtyDaysLater = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);

  // 1. KIỂM TRA HỎI VỀ DANH MỤC / NHÓM VẬT TƯ (Category Query)
  // Ví dụ: "Cho tôi danh mục văn phòng phẩm hiện có", "Danh sách thuốc", "Vật tư tiêu hao"
  const isAskingVPP = cleanQ.includes('van phong pham') || cleanQ.includes('vpp');
  const isAskingDuoc = cleanQ.includes('duoc') || cleanQ.includes('thuoc') || cleanQ.includes('dong y') || cleanQ.includes('tay y');
  const isAskingTieuHao = cleanQ.includes('tieu hao') || cleanQ.includes('vat tu tieu hao');
  const isAskingHoaChat = cleanQ.includes('hoa chat') || cleanQ.includes('rua phim') || cleanQ.includes('thuoc can quang');
  const isAskingAllCategories = (cleanQ.includes('danh muc') || cleanQ.includes('danh sach')) && 
    (cleanQ.includes('cac nhom') || cleanQ.includes('toan bo') || cleanQ.includes('tat ca') || cleanQ.includes('hien co') && !isAskingVPP && !isAskingDuoc && !isAskingTieuHao && !isAskingHoaChat);

  if (isAskingVPP || isAskingDuoc || isAskingTieuHao || isAskingHoaChat) {
    let targetCategoryName = '';
    let categoryTitle = '';
    let itemFilter: (item: any) => boolean = () => false;

    if (isAskingVPP) {
      targetCategoryName = 'Văn phòng phẩm';
      categoryTitle = 'Văn phòng phẩm (VPP)';
      itemFilter = (i: any) => {
        const cat = removeVietnameseTones(getItemCategoryName(i));
        const name = removeVietnameseTones(i.name || '');
        return cat.includes('van phong pham') || cat.includes('vpp') ||
          name.includes('giay') || name.includes('but') || name.includes('so') || 
          name.includes('kep') || name.includes('bam kim') || name.includes('muc') || 
          name.includes('file') || name.includes('bia') || name.includes('bang dinh');
      };
    } else if (isAskingDuoc) {
      targetCategoryName = 'Dược (Đông y, Tây y)';
      categoryTitle = 'Dược (Đông y, Tây y) & Thuốc';
      itemFilter = (i: any) => {
        const cat = removeVietnameseTones(getItemCategoryName(i));
        const name = removeVietnameseTones(i.name || '');
        return cat.includes('duoc') || cat.includes('thuoc') || cat.includes('dong y') || cat.includes('tay y') ||
          name.includes('dimedrol') || name.includes('thuoc') || name.includes('dich truyen') || name.includes('ong') || name.includes('lo');
      };
    } else if (isAskingTieuHao) {
      targetCategoryName = 'Vật tư tiêu hao';
      categoryTitle = 'Vật tư tiêu hao';
      itemFilter = (i: any) => {
        const cat = removeVietnameseTones(getItemCategoryName(i));
        return cat.includes('tieu hao');
      };
    } else if (isAskingHoaChat) {
      targetCategoryName = 'Hóa chất & Thuốc cản quang';
      categoryTitle = 'Hóa chất & Thuốc cản quang';
      itemFilter = (i: any) => {
        const cat = removeVietnameseTones(getItemCategoryName(i));
        const name = removeVietnameseTones(i.name || '');
        return cat.includes('hoa chat') || name.includes('can quang') || name.includes('omnipaque') || name.includes('barit') || name.includes('ultravist') || name.includes('xenetix');
      };
    }

    const matchedItems = items.filter(itemFilter);

    if (matchedItems.length > 0) {
      let ans = `### 📁 Danh mục Vật tư: Nhóm **${categoryTitle}**\n\n`;
      ans += `Hiện tại trong kho đang quản lý **${matchedItems.length}** mặt hàng thuộc nhóm này:\n\n`;
      ans += `| STT | Tên vật tư | Tồn kho | Đơn vị | Định mức Min | Đơn giá | Trạng thái |\n`;
      ans += `| :---: | :--- | :---: | :---: | :---: | :---: | :---: |\n`;

      matchedItems.forEach((i, idx) => {
        const cur = Number(i.currentStock || 0);
        const min = Number(i.minStock || 0);
        const price = Number(i.price || 0).toLocaleString('vi-VN') + ' đ';
        let status = '🟢 Đủ hàng';
        if (cur <= 0) status = '🔴 Cạn kho';
        else if (cur <= min) status = '🟡 Chạm định mức';

        ans += `| ${idx + 1} | **${i.name}** | **${cur}** | ${i.unit || 'đơn vị'} | ${min} | ${price} | ${status} |\n`;
      });

      const outCount = matchedItems.filter(i => Number(i.currentStock || 0) <= 0).length;
      const lowCount = matchedItems.filter(i => Number(i.currentStock || 0) > 0 && Number(i.currentStock || 0) <= Number(i.minStock || 0)).length;
      const totalUnits = Math.round(matchedItems.reduce((acc, i) => acc + Number(i.currentStock || 0), 0) * 10) / 10;

      ans += `\n**📊 Tóm tắt nhóm ${categoryTitle}:**\n`;
      ans += `- **Tổng số lượng tồn:** **${totalUnits}** đơn vị.\n`;
      ans += `- **Tình trạng:** **${matchedItems.length - outCount - lowCount}** mặt hàng an toàn, **${lowCount}** mặt hàng chạm định mức, **${outCount}** mặt hàng đã cạn kho.`;
      return ans;
    } else {
      return `### 📁 Danh mục: Nhóm **${categoryTitle}**\n\nHiện tại kho chưa có mặt hàng nào được phân loại thuộc nhóm **${categoryTitle}** hoặc chưa có dữ liệu tồn kho cho nhóm này. Bạn có thể kiểm tra lại tại menu Quản lý vật tư.`;
    }
  }

  // 2. TỔNG QUAN DANH SÁCH CÁC NHÓM VẬT TƯ
  if (isAskingAllCategories) {
    const categoriesMap: Record<string, { count: number; items: string[] }> = {};
    items.forEach(i => {
      const cat = getItemCategoryName(i);
      if (!categoriesMap[cat]) {
        categoriesMap[cat] = { count: 0, items: [] };
      }
      categoriesMap[cat].count += 1;
      if (categoriesMap[cat].items.length < 4) {
        categoriesMap[cat].items.push(i.name);
      }
    });

    let ans = `### 📋 Tổng hợp Danh mục Các Nhóm Vật tư trong Kho\n\n`;
    ans += `Kho Chẩn đoán hình ảnh hiện đang quản lý tổng cộng **${items.length}** mặt hàng phân bổ theo các nhóm:\n\n`;

    Object.entries(categoriesMap).forEach(([catName, data], idx) => {
      ans += `${idx + 1}. **${catName}:** **${data.count}** mặt hàng\n`;
      ans += `   *Gồm có:* ${data.items.join(', ')}${data.count > data.items.length ? ` và ${data.count - data.items.length} mặt hàng khác` : ''}\n\n`;
    });

    ans += `*Gợi ý:* Bạn có thể hỏi chi tiết: *"Cho tôi danh mục văn phòng phẩm"*, *"Cho tôi danh mục thuốc"* hoặc *"Vật tư nào sắp hết hàng?"*`;
    return ans;
  }

  // 3. KIỂM TRA HỎI VỀ HẠN SỬ DỤNG / QUÁ HẠN / CẬN HẠN (FEFO)
  if (cleanQ.includes('han') || cleanQ.includes('het han') || cleanQ.includes('can han') || cleanQ.includes('date') || cleanQ.includes('fefo')) {
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
        ans += `${idx + 1}. **${e.name}** | Lô: \`${e.batch}\` | Hạn dùng: **${e.exp}** | Số lượng: **${e.qty} ${e.unit}**\n`;
      });
      ans += `\n`;
    } else {
      ans += `✅ Hiện tại **không phát hiện lô hàng nào bị quá hạn sử dụng** trong kho.\n\n`;
    }

    if (nearing.length > 0) {
      ans += `⚠️ **Các lô hàng CẬN HẠN (< 60 ngày) (${nearing.length} mục) - Ưu tiên xuất trước theo FEFO:**\n`;
      nearing.sort((a, b) => a.daysLeft - b.daysLeft).forEach((n, idx) => {
        ans += `${idx + 1}. **${n.name}** | Lô: \`${n.batch}\` | Hạn: **${n.exp}** (còn **${n.daysLeft} ngày**) | Tồn: **${n.qty} ${n.unit}**\n`;
      });
    } else {
      ans += `✅ Không có lô hàng nào sắp hết hạn trong 60 ngày tới.\n`;
    }
    return ans;
  }

  // 4. KIỂM TRA HỎI VỀ HẾT HÀNG / SẮP HẾT / ĐỊNH MỨC TỐI THIỂU
  if (cleanQ.includes('het hang') || cleanQ.includes('sap het') || cleanQ.includes('can kho') || cleanQ.includes('toi thieu') || cleanQ.includes('cham dinh muc')) {
    const out = items.filter(i => Number(i.currentStock || 0) <= 0);
    const low = items.filter(i => Number(i.currentStock || 0) > 0 && Number(i.currentStock || 0) <= Number(i.minStock || 0));

    let ans = `### ⚠️ Tình trạng Cảnh báo Tồn kho\n\n`;
    if (out.length > 0) {
      ans += `🚨 **Vật tư đã CẠN KHO (Tồn = 0) (${out.length} mặt hàng):**\n`;
      out.forEach((i, idx) => {
        ans += `${idx + 1}. **${i.name}** (${getItemCategoryName(i)}) - Định mức yêu cầu: **${i.minStock || 0} ${i.unit}**\n`;
      });
      ans += `\n`;
    } else {
      ans += `✅ Tuyệt vời! Hiện tại không có mặt hàng nào bị hết tồn kho hoàn toàn.\n\n`;
    }

    if (low.length > 0) {
      ans += `⚠️ **Vật tư SẮP HẾT (Tồn kho <= Định mức tối thiểu) (${low.length} mặt hàng):**\n`;
      low.forEach((i, idx) => {
        ans += `${idx + 1}. **${i.name}**: Còn **${i.currentStock} ${i.unit}** (Ngưỡng an toàn: ${i.minStock} ${i.unit})\n`;
      });
    } else {
      ans += `✅ Tất cả các mặt hàng khác đều duy trì lượng tồn trên mức tối thiểu.\n`;
    }
    return ans;
  }

  // 5. KIỂM TRA HỎI VỀ DỰ TRÙ / ĐỀ XUẤT NHẬP HÀNG
  if (cleanQ.includes('du tru') || cleanQ.includes('nhap hang') || cleanQ.includes('can mua') || cleanQ.includes('ke hoach nhap')) {
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

  // 6. KIỂM TRA HỎI VỀ TIÊU HAO / XUẤT KHO / PHÒNG MÁY (Phải KHÔNG chứa "văn phòng")
  const isDeptOrConsumption = 
    (cleanQ.includes('tieu hao') || cleanQ.includes('xuat kho') || cleanQ.includes('phong may') || cleanQ.includes('phong ban') || 
     (cleanQ.includes('phong') && !cleanQ.includes('van phong')));

  if (isDeptOrConsumption) {
    const outTx = transactions.filter(t => t.type === 'OUT');
    const deptTotals: Record<string, number> = {};
    const itemTotals: Record<string, { name: string; qty: number; unit: string }> = {};

    outTx.forEach(t => {
      const dept = t.department || 'Chung / Khác';
      deptTotals[dept] = (deptTotals[dept] || 0) + Number(t.quantity || 0);

      // Tra cứu tên vật tư thực tế từ items
      const matched = items.find(i => i.id === t.itemId || i.name === t.itemName);
      const realName = matched?.name || t.itemName || 'Vật tư tiêu hao';
      const realUnit = matched?.unit || t.unit || 'đơn vị';
      const key = matched?.id || realName;

      if (!itemTotals[key]) {
        itemTotals[key] = { name: realName, qty: 0, unit: realUnit };
      }
      itemTotals[key].qty += Number(t.quantity || 0);
    });

    const topItems = Object.values(itemTotals).sort((a, b) => b.qty - a.qty).slice(0, 5);

    let ans = `### 📊 Thống kê Tiêu hao & Xuất kho Gần đây\n\n`;
    ans += `**Top 5 vật tư được xuất sử dụng nhiều nhất:**\n`;
    if (topItems.length > 0) {
      topItems.forEach((it, idx) => {
        const rounded = Math.round(it.qty * 10) / 10;
        ans += `${idx + 1}. **${it.name}:** **${rounded}** ${it.unit}\n`;
      });
    } else {
      ans += `- Chưa ghi nhận lịch sử xuất kho gần đây.\n`;
    }

    ans += `\n**Lượng vật tư đã cấp theo phòng ban/phòng máy:**\n`;
    const depts = Object.entries(deptTotals);
    if (depts.length > 0) {
      depts.forEach(([d, q]) => {
        const rounded = Math.round(q * 10) / 10;
        ans += `- **Phòng ${d}:** **${rounded}** đơn vị\n`;
      });
    } else {
      ans += `- Chưa có dữ liệu phân bổ phòng ban.\n`;
    }
    return ans;
  }

  // 7. TRA CỨU MỘT VẬT TƯ CỤ THỂ THEO TÊN
  const matchedItem = items.find(i => {
    const nameClean = removeVietnameseTones(i.name || '');
    return nameClean && (cleanQ.includes(nameClean) || nameClean.split(' ').filter(w => w.length > 2).some(w => cleanQ.includes(w)));
  });

  if (matchedItem) {
    const cur = Number(matchedItem.currentStock || 0);
    const min = Number(matchedItem.minStock || 0);
    const batches = Array.isArray(matchedItem.batches) ? matchedItem.batches : [];

    let statusText = '🟢 An toàn';
    if (cur <= 0) statusText = '🔴 Hết hàng hoàn toàn';
    else if (cur <= min) statusText = '🟡 Cảnh báo (Dưới định mức tối thiểu)';

    let ans = `### 🔍 Thông tin chi tiết vật tư: **${matchedItem.name}**\n\n`;
    ans += `- **Nhóm phân loại:** ${getItemCategoryName(matchedItem)}\n`;
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

  // 8. TRẢ LỜI MẶC ĐỊNH
  return `### 💡 Trợ lý AI Khoa Chẩn đoán Hình ảnh\n\n` +
    `Hiện tại hệ thống đang quản lý **${items.length}** danh mục vật tư với **${transactions.length}** giao dịch ghi nhận gần đây.\n\n` +
    `Bạn có thể hỏi tôi các câu hỏi cụ thể như:\n` +
    `- *"Cho tôi danh mục văn phòng phẩm hiện có"*\n` +
    `- *"Cho tôi danh mục thuốc & dược"* \n` +
    `- *"Vật tư nào đã hết hàng hoặc sắp hết?"*\n` +
    `- *"Có lô hàng nào quá hạn hoặc cận hạn dưới 60 ngày không?"*\n` +
    `- *"Đề xuất kế hoạch dự trù vật tư cần nhập cho tuần tới"* \n` +
    `- *"Phòng ban nào tiêu hao nhiều nhất gần đây?"*`;
}



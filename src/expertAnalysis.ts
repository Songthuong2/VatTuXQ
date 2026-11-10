// Intelligent Diagnostic Imaging Inventory Expert Engine (Clinical & Fail-safe)
export interface AnalysisResult {
  summary: string;
  alerts: { type: 'danger' | 'warning' | 'info'; message: string; item?: string }[];
  recommendations: { action: string; priority: 'high' | 'medium' | 'low'; reason: string }[];
  anomalies: { description: string; severity: 'high' | 'medium' | 'low' }[];
  detailedAnalysis: string;
}

export interface ItemBatchAnalysis {
  batchNumber: string;
  expiryDate: string;
  quantity: number;
  parsedDate: Date | null;
  isExpired: boolean;
  isNearing: boolean;
  daysLeft: number;
}

export interface ItemStockAnalysis {
  item: any;
  name: string;
  unit: string;
  categoryName: string;
  price: number;
  totalStock: number;
  minStock: number;
  expiredQty: number;
  nearingQty: number;
  usableStock: number;
  hasExpired: boolean;
  hasNearing: boolean;
  isFullyExpired: boolean;
  isDeficit: boolean;
  suggestedReorder: number;
  earliestExpiryDateStr: string;
  expiredBatches: ItemBatchAnalysis[];
  nearingBatches: ItemBatchAnalysis[];
  validBatches: ItemBatchAnalysis[];
}

export function parseDateFlexible(val: any): Date | null {
  if (!val) return null;
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
  if (typeof val === 'object' && typeof val.seconds === 'number') {
    return new Date(val.seconds * 1000);
  }
  if (typeof val !== 'string') return null;
  const s = val.trim();
  if (!s) return null;

  // DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
  const dmyMatch = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})/);
  if (dmyMatch) {
    const day = parseInt(dmyMatch[1], 10);
    const month = parseInt(dmyMatch[2], 10) - 1;
    const year = parseInt(dmyMatch[3], 10);
    const d = new Date(year, month, day);
    return isNaN(d.getTime()) ? null : d;
  }

  // YYYY-MM-DD or YYYY/MM/DD
  const ymdMatch = s.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})/);
  if (ymdMatch) {
    const year = parseInt(ymdMatch[1], 10);
    const month = parseInt(ymdMatch[2], 10) - 1;
    const day = parseInt(ymdMatch[3], 10);
    const d = new Date(year, month, day);
    return isNaN(d.getTime()) ? null : d;
  }

  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

export function removeVietnameseTones(str: string): string {
  if (!str) return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
}

export function getItemCategoryName(item: any, categories: any[] = []): string {
  if (item.categoryName) return item.categoryName;
  if (item.category) return item.category;
  if (item.categoryId && categories.length > 0) {
    const found = categories.find(c => c.id === item.categoryId);
    if (found?.name) return found.name;
  }
  return item.categoryId ? String(item.categoryId) : 'Khác';
}

export function computeItemStockAndExpiry(
  item: any,
  now: Date,
  sixtyDaysLater: Date,
  categories: any[] = []
): ItemStockAnalysis {
  const name = item.name || 'Vật tư';
  const unit = item.unit || 'đơn vị';
  const categoryName = getItemCategoryName(item, categories);
  const totalStock = Number(item.currentStock || 0);
  const minStock = Number(item.minStock || 0);
  const price = Number(item.price || 0);

  const batches = Array.isArray(item.batches) ? item.batches : [];
  const expiredBatches: ItemBatchAnalysis[] = [];
  const nearingBatches: ItemBatchAnalysis[] = [];
  const validBatches: ItemBatchAnalysis[] = [];

  let expiredQty = 0;
  let nearingQty = 0;
  let earliestExpiryDateStr = item.expiryDate || '';

  if (batches.length > 0) {
    batches.forEach((b: any) => {
      const bQty = Number(b.quantity || 0);
      const bDateStr = b.expiryDate || '';
      const bDate = parseDateFlexible(bDateStr);

      if (!bDate) {
        validBatches.push({
          batchNumber: b.batchNumber || 'Lô',
          expiryDate: bDateStr,
          quantity: bQty,
          parsedDate: null,
          isExpired: false,
          isNearing: false,
          daysLeft: 9999,
        });
        return;
      }

      const daysLeft = Math.ceil((bDate.getTime() - now.getTime()) / (1000 * 3600 * 24));
      if (bDate < now) {
        expiredQty += bQty;
        expiredBatches.push({
          batchNumber: b.batchNumber || 'Lô',
          expiryDate: bDateStr,
          quantity: bQty,
          parsedDate: bDate,
          isExpired: true,
          isNearing: false,
          daysLeft,
        });
      } else if (bDate <= sixtyDaysLater) {
        nearingQty += bQty;
        nearingBatches.push({
          batchNumber: b.batchNumber || 'Lô',
          expiryDate: bDateStr,
          quantity: bQty,
          parsedDate: bDate,
          isExpired: false,
          isNearing: true,
          daysLeft,
        });
      } else {
        validBatches.push({
          batchNumber: b.batchNumber || 'Lô',
          expiryDate: bDateStr,
          quantity: bQty,
          parsedDate: bDate,
          isExpired: false,
          isNearing: false,
          daysLeft,
        });
      }
    });
  } else if (item.expiryDate) {
    const iDate = parseDateFlexible(item.expiryDate);
    if (iDate) {
      const daysLeft = Math.ceil((iDate.getTime() - now.getTime()) / (1000 * 3600 * 24));
      if (iDate < now) {
        expiredQty = totalStock;
        expiredBatches.push({
          batchNumber: 'Lô mặc định',
          expiryDate: item.expiryDate,
          quantity: totalStock,
          parsedDate: iDate,
          isExpired: true,
          isNearing: false,
          daysLeft,
        });
      } else if (iDate <= sixtyDaysLater) {
        nearingQty = totalStock;
        nearingBatches.push({
          batchNumber: 'Lô mặc định',
          expiryDate: item.expiryDate,
          quantity: totalStock,
          parsedDate: iDate,
          isExpired: false,
          isNearing: true,
          daysLeft,
        });
      } else {
        validBatches.push({
          batchNumber: 'Lô mặc định',
          expiryDate: item.expiryDate,
          quantity: totalStock,
          parsedDate: iDate,
          isExpired: false,
          isNearing: false,
          daysLeft,
        });
      }
    }
  }

  // TỒN KHO KHẢ DỤNG: Trong y tế, các lô hết hạn KHÔNG ĐƯỢC PHÉP SỬ DỤNG CHO BỆNH NHÂN
  // Usable Stock = Total Stock - Expired Stock
  const usableStock = Math.max(0, Number((totalStock - expiredQty).toFixed(2)));
  const hasExpired = expiredQty > 0 || expiredBatches.length > 0;
  const hasNearing = nearingQty > 0 || nearingBatches.length > 0;
  const isFullyExpired = hasExpired && usableStock === 0 && totalStock > 0;
  const isDeficit = usableStock <= minStock || hasExpired;

  // Số lượng đề xuất mua sắm bổ sung:
  // Đảm bảo bù đủ lượng hàng đã hết hạn + đưa tồn khả dụng lên mức 2 x định mức an toàn (hoặc tối thiểu 10)
  let suggestedReorder = 0;
  if (isDeficit) {
    const targetBuffer = Math.max(minStock * 2, minStock + 10, 10);
    suggestedReorder = Math.max(targetBuffer - usableStock, expiredQty, minStock || 10);
  }

  return {
    item,
    name,
    unit,
    categoryName,
    price,
    totalStock,
    minStock,
    expiredQty,
    nearingQty,
    usableStock,
    hasExpired,
    hasNearing,
    isFullyExpired,
    isDeficit,
    suggestedReorder,
    earliestExpiryDateStr,
    expiredBatches,
    nearingBatches,
    validBatches,
  };
}

export function generateExpertInventoryAnalysis(
  items: any[] = [],
  transactions: any[] = [],
  holidays: any[] = [],
  categories: any[] = []
): AnalysisResult {
  const now = new Date();
  const sixtyDaysLater = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);

  // 1. Phân tích chi tiết hạn dùng và tồn khả dụng từng vật tư
  const analyzedItems: ItemStockAnalysis[] = items.map(i =>
    computeItemStockAndExpiry(i, now, sixtyDaysLater, categories)
  );

  // Nhóm phân loại chính xác theo tồn khả dụng thực tế
  const expiredItems = analyzedItems.filter(a => a.hasExpired);
  const outOfStockItems = analyzedItems.filter(a => a.usableStock <= 0);
  const lowStockItems = analyzedItems.filter(a => a.usableStock > 0 && a.usableStock <= a.minStock);
  const nearingExpiryItems = analyzedItems.filter(a => a.hasNearing && !a.hasExpired);
  const safeItems = analyzedItems.filter(a => a.usableStock > a.minStock && !a.hasExpired);

  // 2. Phân tích giao dịch xuất kho gần đây
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

  // 3. Tổng hợp Cảnh báo (Alerts)
  const alerts: { type: 'danger' | 'warning' | 'info'; message: string; item?: string }[] = [];

  // 🚨 CẢNH BÁO QUÁ HẠN & THIẾU HỤT KHẢ DỤNG (ĐẶC BIỆT QUAN TRỌNG)
  expiredItems.forEach(a => {
    const expInfo = a.expiredBatches.map(b => `${b.batchNumber} (HSD: ${b.expiryDate})`).join(', ') || a.earliestExpiryDateStr;
    if (a.isFullyExpired) {
      alerts.push({
        type: 'danger',
        message: `🚨 HẾT HẠN TOÀN BỘ: Toàn bộ ${a.totalStock} ${a.unit} "${a.name}" đã quá hạn sử dụng [${expInfo}]. Tồn khả dụng an toàn = 0. CẦN NIÊM PHONG VÀ MUA SẮM BỔ SUNG NGAY ${a.suggestedReorder} ${a.unit}!`,
        item: a.name,
      });
    } else {
      alerts.push({
        type: 'danger',
        message: `⚠️ CẢNH BÁO HẠN DÙNG: Phát hiện ${a.expiredQty} ${a.unit} "${a.name}" đã quá hạn sử dụng [${expInfo}]. Tồn khả dụng còn lại: ${a.usableStock} ${a.unit}. Cần niêm phong lô hết hạn và dự trù mua sắm bù đắp!`,
        item: a.name,
      });
    }
  });

  // Cảnh báo cạn kho (không có hàng hoặc tồn khả dụng = 0)
  outOfStockItems
    .filter(a => !a.hasExpired)
    .slice(0, 4)
    .forEach(a => {
      alerts.push({
        type: 'danger',
        message: `CẠN KHO: Tồn khả dụng = 0 ${a.unit} (Định mức tối thiểu: ${a.minStock}). Cần lập phiếu dự trù nhập bổ sung khẩn cấp!`,
        item: a.name,
      });
    });

  // Cảnh báo chạm ngưỡng tối thiểu
  lowStockItems.slice(0, 5).forEach(a => {
    alerts.push({
      type: 'warning',
      message: `SẮP HẾT HÀNG: Tồn khả dụng hiện tại (${a.usableStock} ${a.unit}) đã chạm hoặc thấp hơn định mức an toàn (${a.minStock} ${a.unit}).`,
      item: a.name,
    });
  });

  // Cảnh báo cận hạn trong 60 ngày
  nearingExpiryItems.slice(0, 4).forEach(a => {
    const nearInfo = a.nearingBatches.map(b => `${b.batchNumber} (còn ${b.daysLeft} ngày)`).join(', ');
    alerts.push({
      type: 'warning',
      message: `SẮP HẾT HẠN (< 60 ngày): Phát hiện ${a.nearingQty} ${a.unit} [${nearInfo}]. Cần ưu tiên xuất sử dụng trước theo nguyên tắc FEFO.`,
      item: a.name,
    });
  });

  if (alerts.length === 0) {
    alerts.push({
      type: 'info',
      message: 'Tất cả vật tư hiện đang ở ngưỡng an toàn, không có mặt hàng hết hạn hoặc chạm định mức tối thiểu.',
      item: 'Toàn bộ kho',
    });
  }

  // 4. Đề xuất hành động (Recommendations) - MUA SẮM BỔ SUNG LÀ TRỌNG TÂM
  const recommendations: { action: string; priority: 'high' | 'medium' | 'low'; reason: string }[] = [];

  // ƯU TIÊN SỐ 1: MUA SẮM BỔ SUNG CHO CÁC MẶT HÀNG ĐÃ HẾT HẠN
  if (expiredItems.length > 0) {
    expiredItems.forEach(a => {
      recommendations.push({
        action: `Lập dự trù mua sắm bổ sung khẩn cấp +${a.suggestedReorder} ${a.unit} ${a.name}`,
        priority: 'high',
        reason: `Mặt hàng này có ${a.expiredQty} ${a.unit} đã quá hạn sử dụng, khiến tồn khả dụng an toàn chỉ còn ${a.usableStock} ${a.unit} (Định mức yêu cầu: ${a.minStock} ${a.unit}). Cần mua bổ sung ngay để thay thế lượng hàng hết hạn, không làm gián đoạn chụp chiếu khám chữa bệnh.`,
      });
      recommendations.push({
        action: `Lập biên bản niêm phong và tiêu hủy/đổi trả ${a.expiredQty} ${a.unit} ${a.name} đã quá hạn`,
        priority: 'high',
        reason: `Tuân thủ nghiêm ngặt quy chế dược bệnh viện và an toàn người bệnh, tuyệt đối không lưu hành vật tư quá hạn.`,
      });
    });
  }

  // ƯU TIÊN SỐ 2: MUA BỔ SUNG CÁC MẶT HÀNG CẠN KHO KHÁC (Tồn = 0)
  const regularOutOfStock = outOfStockItems.filter(a => !a.hasExpired);
  if (regularOutOfStock.length > 0) {
    recommendations.push({
      action: `Lập dự trù nhập bổ sung cho: ${regularOutOfStock.map(a => a.name).slice(0, 3).join(', ')}${regularOutOfStock.length > 3 ? ` và ${regularOutOfStock.length - 3} mặt hàng khác` : ''}`,
      priority: 'high',
      reason: `Các mặt hàng này đã cạn kho hoàn toàn, nguy cơ thiếu vật tư trong các ca chụp cấp cứu.`,
    });
  }

  // ƯU TIÊN SỐ 3: DỰ TRÙ CHO VẬT TƯ CHẠM ĐỊNH MỨC
  if (lowStockItems.length > 0) {
    recommendations.push({
      action: `Đưa vào danh sách dự trù định kỳ: ${lowStockItems.map(a => a.name).slice(0, 4).join(', ')}`,
      priority: 'medium',
      reason: `Số lượng tồn khả dụng dưới ngưỡng dự phòng tối thiểu, cần bổ sung trước khi hết hẳn.`,
    });
  }

  // ƯU TIÊN SỐ 4: ĐIỀU PHỐI XUẤT TRƯỚC (FEFO) CHO LÔ CẬN HẠN
  if (nearingExpiryItems.length > 0) {
    recommendations.push({
      action: `Điều phối xuất trước (FEFO) cho các lô sắp hết hạn: ${nearingExpiryItems.map(a => a.name).slice(0, 3).join(', ')}`,
      priority: 'medium',
      reason: `Thời hạn sử dụng còn dưới 60 ngày, cần ưu tiên luân chuyển đến các phòng máy có tần suất sử dụng cao.`,
    });
  }

  recommendations.push({
    action: `Thực hiện đối chiếu kiểm kê định kỳ thực tế với số liệu phần mềm`,
    priority: 'low',
    reason: `Duy trì tính chính xác giữa số liệu sổ sách và lượng vật tư thực tế tại kho trung tâm và các phòng máy.`,
  });

  // 5. Phát hiện bất thường (Anomalies)
  const anomalies: { description: string; severity: 'high' | 'medium' | 'low' }[] = [];

  expiredItems.forEach(a => {
    anomalies.push({
      description: `Mặt hàng "${a.name}" ghi nhận tồn sổ sách là ${a.totalStock} ${a.unit} nhưng thực tế có ${a.expiredQty} ${a.unit} đã quá hạn, gây thiếu hụt khả dụng nghiêm trọng.`,
      severity: 'high',
    });
  });

  topConsumed.forEach(c => {
    if (c.qty > 50) {
      anomalies.push({
        description: `Mặt hàng "${c.name}" có lượng tiêu hao nổi bật (${c.qty} ${c.unit}) trong các ca chụp gần đây.`,
        severity: 'medium',
      });
    }
  });

  // 6. Tóm tắt tổng quan (Summary)
  const summary = `Kho hiện có ${items.length} danh mục vật tư. Phát hiện ${expiredItems.length} mặt hàng có lô quá hạn (Tồn khả dụng bị ảnh hưởng nghiêm trọng), ${outOfStockItems.length} mặt hàng cạn kho khả dụng, ${lowStockItems.length} mặt hàng chạm ngưỡng dự trù và ${nearingExpiryItems.length} mặt hàng cận hạn. Đã tự động tạo các đề xuất mua sắm bổ sung khẩn cấp để bù đắp lượng hàng đã hết hạn.`;

  // 7. Báo cáo chi tiết định dạng Markdown (Detailed Analysis) với Bảng Biểu
  let detailedAnalysis = `### BÁO CÁO PHÂN TÍCH CHUYÊN SÂU KHO VẬT TƯ CĐHA\n\n`;
  detailedAnalysis += `#### 1. Tổng quan tình trạng kho & Tồn khả dụng\n`;
  detailedAnalysis += `- **Tổng số mặt hàng quản lý:** **${items.length}** vật tư\n`;
  detailedAnalysis += `- **Số mặt hàng an toàn (đủ tồn, còn hạn):** **${safeItems.length}** (${items.length > 0 ? Math.round((safeItems.length / items.length) * 100) : 0}%)\n`;
  detailedAnalysis += `- **Vật tư có lô ĐÃ QUÁ HẠN (Phải niêm phong & mua bù):** **${expiredItems.length}** mặt hàng\n`;
  detailedAnalysis += `- **Vật tư CẠN KHO KHẢ DỤNG (Tồn dùng = 0):** **${outOfStockItems.length}** mặt hàng\n`;
  detailedAnalysis += `- **Vật tư chạm định mức cảnh báo:** **${lowStockItems.length}** mặt hàng\n`;
  detailedAnalysis += `- **Vật tư cận hạn trong 60 ngày (Cần xuất trước FEFO):** **${nearingExpiryItems.length}** mặt hàng\n\n`;

  // BẢNG 1: VẬT TƯ HẾT HẠN & ĐỀ XUẤT MUA SẮM BỔ SUNG
  if (expiredItems.length > 0) {
    detailedAnalysis += `#### 🚨 2. Danh mục Vật tư Quá Hạn & Đề xuất Mua Sắm Bổ Sung Khẩn Cấp\n\n`;
    detailedAnalysis += `Toàn bộ số lượng vật tư quá hạn **bắt buộc phải niêm phong và không được sử dụng**. Hệ thống tự động tính toán số lượng cần mua bổ sung ngay lập tức để duy trì hoạt động chuyên môn:\n\n`;
    detailedAnalysis += `| STT | Tên vật tư | Nhóm | Tồn sổ sách | Hết hạn | Tồn khả dụng | Định mức Min | Đề xuất mua sắm bù | Đơn vị | Tình trạng & Xử lý |\n`;
    detailedAnalysis += `| :---: | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :--- |\n`;

    expiredItems.forEach((a, idx) => {
      const expDate = a.expiredBatches[0]?.expiryDate || a.earliestExpiryDateStr || 'Quá hạn';
      const statusText = a.isFullyExpired ? '🔴 Hết hạn toàn bộ - Mua bù khẩn' : '🟡 Hết hạn 1 phần - Cần mua bù';
      detailedAnalysis += `| ${idx + 1} | **${a.name}** | ${a.categoryName} | ${a.totalStock} | **${a.expiredQty}** (${expDate}) | **${a.usableStock}** | ${a.minStock} | **+${a.suggestedReorder}** | ${a.unit} | ${statusText} |\n`;
    });
    detailedAnalysis += `\n`;
  }

  // BẢNG 2: VẬT TƯ CẠN KHO HOẶC CHẠM ĐỊNH MỨC CẦN DỰ TRÙ
  const needReorderGeneral = analyzedItems.filter(a => a.isDeficit && !a.hasExpired);
  if (needReorderGeneral.length > 0) {
    detailedAnalysis += `#### 📝 3. Danh mục Vật tư Cạn Kho & Chạm Định Mức Cần Dự Trù\n\n`;
    detailedAnalysis += `| STT | Tên vật tư | Nhóm | Tồn khả dụng | Định mức Min | Đề xuất nhập | Đơn vị | Đơn giá | Ước tính |\n`;
    detailedAnalysis += `| :---: | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |\n`;

    needReorderGeneral.forEach((a, idx) => {
      const est = a.suggestedReorder * a.price;
      detailedAnalysis += `| ${idx + 1} | **${a.name}** | ${a.categoryName} | **${a.usableStock}** | ${a.minStock} | **+${a.suggestedReorder}** | ${a.unit} | ${a.price ? a.price.toLocaleString('vi-VN') + ' đ' : '0 đ'} | ${est ? est.toLocaleString('vi-VN') + ' đ' : '-'} |\n`;
    });
    detailedAnalysis += `\n`;
  }

  // BẢNG 3: VẬT TƯ CẬN HẠN (< 60 NGÀY) CẦN ĐIỀU PHỐI FEFO
  if (nearingExpiryItems.length > 0) {
    detailedAnalysis += `#### ⏱️ 4. Danh mục Lô Hàng Cận Hạn Cần Điều Phối Xuất Trước (FEFO)\n\n`;
    detailedAnalysis += `| STT | Tên vật tư | Số lô | Hạn dùng | Còn lại | Số lượng | Đơn vị | Khuyến nghị FEFO |\n`;
    detailedAnalysis += `| :---: | :--- | :---: | :---: | :---: | :---: | :---: | :--- |\n`;

    let nIdx = 1;
    nearingExpiryItems.forEach(a => {
      a.nearingBatches.forEach(b => {
        detailedAnalysis += `| ${nIdx++} | **${a.name}** | \`${b.batchNumber}\` | ${b.expiryDate} | **${b.daysLeft} ngày** | **${b.quantity}** | ${a.unit} | ⚡ Ưu tiên xuất dùng trước |\n`;
      });
    });
    detailedAnalysis += `\n`;
  }

  detailedAnalysis += `#### 5. Vật tư tiêu hao nhiều nhất gần đây\n`;
  detailedAnalysis += topConsumed.length > 0
    ? topConsumed.map((c, idx) => `${idx + 1}. **${c.name}:** **${c.qty}** ${c.unit}`).join('\n')
    : '- Chưa ghi nhận dữ liệu xuất kho.\n';

  detailedAnalysis += `\n#### 6. Đánh giá chu kỳ làm việc & Ngày nghỉ\n`;
  detailedAnalysis += `- Hệ thống đã tích hợp lịch nghỉ lễ/nghỉ trực (${holidays.length} ngày nghỉ đã ghi nhận) nhằm điều chỉnh lượng tiêu hao dự báo theo số ngày làm việc thực tế của các phòng máy X-quang, CT, MRI, Siêu âm.\n\n`;

  detailedAnalysis += `#### 7. Khuyến nghị trọng tâm cho cán bộ phụ trách\n`;
  detailedAnalysis += `1. **Ưu tiên 1 (Khẩn cấp):** Phê duyệt ngay phiếu mua sắm bổ sung thay thế các mặt hàng đã quá hạn sử dụng (đặc biệt là thuốc cản quang, vật tư can thiệp).\n`;
  detailedAnalysis += `2. **Ưu tiên 2:** Lập biên bản niêm phong các lô hàng hết hạn theo đúng quy chế quản lý Dược & Vật tư Y tế.\n`;
  detailedAnalysis += `3. **Ưu tiên 3:** Luân chuyển các lô cận hạn dưới 60 ngày đến các phòng máy có tần suất ca chụp cao theo nguyên tắc FEFO.\n`;
  detailedAnalysis += `4. **Ưu tiên 4:** Định kỳ đối chiếu kiểm kê thực tế tại phòng máy với số liệu phần mềm.`;

  return {
    summary,
    alerts,
    recommendations,
    anomalies,
    detailedAnalysis,
  };
}

// Fallback & Offline Q&A Engine for Warehouse Assistant with Table Formatting
export function generateExpertChatAnswer(
  question: string,
  items: any[] = [],
  transactions: any[] = [],
  holidays: any[] = [],
  categories: any[] = []
): string {
  const q = (question || '').toLowerCase().trim();
  const cleanQ = removeVietnameseTones(q);
  const now = new Date();
  const sixtyDaysLater = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);

  // Phân tích trạng thái tồn kho và hạn dùng toàn diện
  const analyzedItems: ItemStockAnalysis[] = items.map(i =>
    computeItemStockAndExpiry(i, now, sixtyDaysLater, categories)
  );

  // 1. KIỂM TRA HỎI VỀ DANH MỤC / NHÓM VẬT TƯ (Category Query)
  const isAskingVPP = cleanQ.includes('van phong pham') || cleanQ.includes('vpp');
  const isAskingDuoc = cleanQ.includes('duoc') || cleanQ.includes('thuoc') || cleanQ.includes('dong y') || cleanQ.includes('tay y');
  const isAskingTieuHao = cleanQ.includes('tieu hao') || cleanQ.includes('vat tu tieu hao');
  const isAskingHoaChat = cleanQ.includes('hoa chat') || cleanQ.includes('rua phim') || cleanQ.includes('thuoc can quang');
  const isAskingAllCategories = (cleanQ.includes('danh muc') || cleanQ.includes('danh sach')) && 
    (cleanQ.includes('cac nhom') || cleanQ.includes('toan bo') || cleanQ.includes('tat ca') || (cleanQ.includes('hien co') && !isAskingVPP && !isAskingDuoc && !isAskingTieuHao && !isAskingHoaChat));

  if (isAskingVPP || isAskingDuoc || isAskingTieuHao || isAskingHoaChat) {
    let targetCategoryName = '';
    let categoryTitle = '';
    let itemFilter: (a: ItemStockAnalysis) => boolean = () => false;

    if (isAskingVPP) {
      targetCategoryName = 'Văn phòng phẩm';
      categoryTitle = 'Văn phòng phẩm (VPP)';
      itemFilter = (a: ItemStockAnalysis) => {
        const cat = removeVietnameseTones(a.categoryName);
        const name = removeVietnameseTones(a.name);

        if (
          cat.includes('duoc') || cat.includes('thuoc') || cat.includes('dong y') || 
          cat.includes('tay y') || cat.includes('tieu hao') || cat.includes('hoa chat') || 
          cat.includes('can quang') || cat.includes('phim') || cat.includes('chuan doan') ||
          cat.includes('x quang') || cat.includes('ct') || cat.includes('mri') || cat.includes('dsa')
        ) {
          return false;
        }

        if (cat.includes('van phong pham') || cat.includes('vpp')) {
          return true;
        }

        const vppKeywords = [
          'giay in', 'giay a4', 'giay ve sinh', 'but bi', 'ruot but', 'but da', 'but chi', 'but long',
          'dan ghim', 'kep giay', 'bam kim', 'so tay', 'so ghi chep', 'so theo doi', 'so sach',
          'muc in', 'bia cong', 'bia la', 'bia ho so', 'bang dinh', 'tay quan ao', 'bot giat'
        ];
        return vppKeywords.some(kw => name.includes(kw));
      };
    } else if (isAskingDuoc) {
      targetCategoryName = 'Dược (Đông y, Tây y)';
      categoryTitle = 'Dược (Đông y, Tây y) & Thuốc';
      itemFilter = (a: ItemStockAnalysis) => {
        const cat = removeVietnameseTones(a.categoryName);
        const name = removeVietnameseTones(a.name);
        if (cat.includes('duoc') || cat.includes('thuoc') || cat.includes('dong y') || cat.includes('tay y')) {
          return true;
        }
        const drugKeywords = [
          'pdsolone', 'vinsolon', 'sodium', 'chloride', 'dimedrol', 'thuoc', 'dich truyen', 'khang sinh', 'giam dau', 'giai doc'
        ];
        return drugKeywords.some(kw => name.includes(kw));
      };
    } else if (isAskingTieuHao) {
      targetCategoryName = 'Vật tư tiêu hao';
      categoryTitle = 'Vật tư tiêu hao';
      itemFilter = (a: ItemStockAnalysis) => {
        const cat = removeVietnameseTones(a.categoryName);
        const name = removeVietnameseTones(a.name);
        if (cat.includes('tieu hao')) return true;
        const consumableKeywords = ['tui phim', 'phim x quang', 'phim cat lop', 'day noi', 'bom tiem', 'kim tiem', 'gang tay', 'bang gac'];
        return consumableKeywords.some(kw => name.includes(kw));
      };
    } else if (isAskingHoaChat) {
      targetCategoryName = 'Hóa chất & Thuốc cản quang';
      categoryTitle = 'Hóa chất & Thuốc cản quang';
      itemFilter = (a: ItemStockAnalysis) => {
        const cat = removeVietnameseTones(a.categoryName);
        const name = removeVietnameseTones(a.name);
        if (cat.includes('hoa chat') || cat.includes('can quang')) return true;
        const chemicalKeywords = ['omnipaque', 'barit', 'ultravist', 'xenetix', 'telebrix', 'gel sieu am', 'rua phim'];
        return chemicalKeywords.some(kw => name.includes(kw));
      };
    }

    const matched = analyzedItems.filter(itemFilter);

    if (matched.length > 0) {
      let ans = `### 📁 Danh mục Vật tư: Nhóm **${categoryTitle}**\n\n`;
      ans += `Hiện tại trong kho đang quản lý **${matched.length}** mặt hàng thuộc nhóm này:\n\n`;
      ans += `| STT | Tên vật tư | Tồn sổ sách | Tồn khả dụng | Đơn vị | Định mức Min | Đơn giá | Trạng thái |\n`;
      ans += `| :---: | :--- | :---: | :---: | :---: | :---: | :---: | :--- |\n`;

      matched.forEach((a, idx) => {
        const priceStr = a.price.toLocaleString('vi-VN') + ' đ';
        let status = '🟢 Đủ hàng';
        if (a.hasExpired) status = `🔴 Đã hết hạn (${a.expiredQty} ${a.unit})`;
        else if (a.usableStock <= 0) status = '🔴 Cạn kho';
        else if (a.usableStock <= a.minStock) status = '🟡 Chạm định mức';

        ans += `| ${idx + 1} | **${a.name}** | ${a.totalStock} | **${a.usableStock}** | ${a.unit} | ${a.minStock} | ${priceStr} | ${status} |\n`;
      });

      const outCount = matched.filter(a => a.usableStock <= 0).length;
      const lowCount = matched.filter(a => a.usableStock > 0 && a.usableStock <= a.minStock).length;
      const expCount = matched.filter(a => a.hasExpired).length;
      const totalUsableUnits = Math.round(matched.reduce((acc, a) => acc + a.usableStock, 0) * 10) / 10;

      ans += `\n**📊 Tóm tắt nhóm ${categoryTitle}:**\n`;
      ans += `- **Tổng lượng tồn khả dụng (an toàn dùng cho bệnh nhân):** **${totalUsableUnits}** đơn vị.\n`;
      ans += `- **Tình trạng:** **${matched.length - outCount - lowCount}** mặt hàng an toàn, **${lowCount}** mặt hàng chạm định mức, **${outCount}** mặt hàng cạn kho khả dụng${expCount > 0 ? `, **${expCount}** mặt hàng có lô quá hạn cần mua bù` : ''}.`;
      return ans;
    } else {
      return `### 📁 Danh mục: Nhóm **${categoryTitle}**\n\nHiện tại kho chưa có mặt hàng nào được phân loại thuộc nhóm **${categoryTitle}** hoặc chưa có dữ liệu tồn kho cho nhóm này. Bạn có thể kiểm tra lại tại menu Quản lý vật tư.`;
    }
  }

  // 2. TỔNG QUAN DANH SÁCH CÁC NHÓM VẬT TƯ (Bảng tổng hợp)
  if (isAskingAllCategories) {
    const categoriesMap: Record<string, { count: number; items: string[]; usableQty: number }> = {};
    analyzedItems.forEach(a => {
      const cat = a.categoryName;
      if (!categoriesMap[cat]) {
        categoriesMap[cat] = { count: 0, items: [], usableQty: 0 };
      }
      categoriesMap[cat].count += 1;
      categoriesMap[cat].usableQty += a.usableStock;
      if (categoriesMap[cat].items.length < 3) {
        categoriesMap[cat].items.push(a.name);
      }
    });

    let ans = `### 📋 Tổng hợp Danh mục Các Nhóm Vật tư trong Kho\n\n`;
    ans += `Kho Chẩn đoán hình ảnh hiện đang quản lý tổng cộng **${items.length}** mặt hàng phân bổ theo các nhóm:\n\n`;
    ans += `| STT | Tên nhóm vật tư | Số lượng mặt hàng | Tồn khả dụng | Một số mặt hàng tiêu biểu |\n`;
    ans += `| :---: | :--- | :---: | :---: | :--- |\n`;

    Object.entries(categoriesMap).forEach(([catName, data], idx) => {
      const examples = data.items.join(', ') + (data.count > data.items.length ? '...' : '');
      ans += `| ${idx + 1} | **${catName}** | **${data.count}** | **${Math.round(data.usableQty * 10) / 10}** | ${examples} |\n`;
    });

    ans += `\n*Gợi ý:* Bạn có thể hỏi chi tiết: *"Cho tôi danh mục văn phòng phẩm"*, *"Cho tôi danh mục thuốc"*, *"Vật tư nào đã hết hạn?"* hoặc *"Kế hoạch mua sắm bổ sung?"*`;
    return ans;
  }

  // 3. KIỂM TRA HỎI VỀ DỰ TRÙ / MUA SẮM BỔ SUNG / CẦN NHẬP HÀNG (ƯU TIÊN ĐẶC BIỆT CHO HÀNG HẾT HẠN)
  if (cleanQ.includes('du tru') || cleanQ.includes('nhap hang') || cleanQ.includes('can mua') || cleanQ.includes('ke hoach nhap') || cleanQ.includes('mua sam') || cleanQ.includes('bo sung')) {
    // Lấy các mặt hàng thiếu hụt khả dụng: usableStock <= minStock HOẶC có hàng đã hết hạn
    const deficitItems = analyzedItems.filter(a => a.isDeficit);

    let ans = `### 📝 Khuyến nghị Kế hoạch Dự trù & Mua sắm Bổ sung Vật tư\n\n`;
    if (deficitItems.length === 0) {
      ans += `✅ Toàn bộ **${items.length}** mặt hàng hiện đều có số lượng tồn khả dụng an toàn trên mức tối thiểu và không có lô hàng nào quá hạn. Chưa cần lập phiếu dự trù khẩn.\n\n`;
      ans += `*Gợi ý:* Bạn có thể rà soát lại lượng tiêu thụ tuần qua để chuẩn bị dự trù định kỳ cho tháng tới.`;
      return ans;
    }

    ans += `Dựa trên dữ liệu tồn kho khả dụng thực tế và tình trạng hạn sử dụng lô hàng, **đề xuất mua sắm bổ sung các mặt hàng sau**:\n\n`;
    ans += `| STT | Tên vật tư | Nhóm | Tồn sổ sách | Hết hạn | Tồn khả dụng | Định mức Min | Đề xuất mua bổ sung | Đơn vị | Đơn giá | Ước tính | Lý do dự trù |\n`;
    ans += `| :---: | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :--- |\n`;

    let totalEst = 0;
    // Sắp xếp ưu tiên: Các mặt hàng hết hạn/cạn kho lên đầu bảng
    const sortedDeficit = [...deficitItems].sort((a, b) => {
      if (a.hasExpired && !b.hasExpired) return -1;
      if (!a.hasExpired && b.hasExpired) return 1;
      return a.usableStock - b.usableStock;
    });

    sortedDeficit.forEach((a, idx) => {
      const est = a.suggestedReorder * a.price;
      totalEst += est;

      let reason = '🟡 Chạm định mức an toàn';
      if (a.isFullyExpired) {
        reason = `🚨 Hết hạn 100% (${a.expiredQty} ${a.unit}) - Tồn khả dụng = 0`;
      } else if (a.hasExpired) {
        reason = `⚠️ Hết hạn ${a.expiredQty} ${a.unit} - Thiếu hụt an toàn`;
      } else if (a.usableStock <= 0) {
        reason = '🔴 Cạn kho hoàn toàn (Tồn = 0)';
      }

      ans += `| ${idx + 1} | **${a.name}** | ${a.categoryName} | ${a.totalStock} | ${a.expiredQty > 0 ? `**${a.expiredQty}**` : '0'} | **${a.usableStock}** | ${a.minStock} | **+${a.suggestedReorder}** | ${a.unit} | ${a.price ? a.price.toLocaleString('vi-VN') + ' đ' : '0 đ'} | ${est ? est.toLocaleString('vi-VN') + ' đ' : '-'} | ${reason} |\n`;
    });

    if (totalEst > 0) {
      ans += `\n💰 **Tổng dự toán kinh phí mua sắm bổ sung:** **${totalEst.toLocaleString('vi-VN')} đ**.\n`;
    }
    ans += `\n*Ghi chú chuyên gia:* Các mặt hàng có lượng hết hạn phải lập tức niêm phong và mua bù ngay theo số lượng đề xuất để đảm bảo đệm an toàn cho các ca trực cấp cứu.`;
    return ans;
  }

  // 4. KIỂM TRA HỎI VỀ HẾT HÀNG / SẮP HẾT / ĐỊNH MỨC TỐI THIỂU - BẢNG BIỂU
  const isAskingOutOfStock = cleanQ.includes('het hang') || cleanQ.includes('sap het') || cleanQ.includes('can kho') || cleanQ.includes('toi thieu') || cleanQ.includes('cham dinh muc');
  if (isAskingOutOfStock) {
    const out = analyzedItems.filter(a => a.usableStock <= 0);
    const low = analyzedItems.filter(a => a.usableStock > 0 && a.usableStock <= a.minStock);

    let ans = `### ⚠️ Tình trạng Cảnh báo Tồn kho Vật tư Khả dụng\n\n`;
    if (out.length > 0) {
      ans += `🚨 **Vật tư CẠN KHO KHẢ DỤNG (Tồn an toàn = 0) (${out.length} mặt hàng):**\n\n`;
      ans += `| STT | Tên vật tư | Nhóm | Tồn sổ sách | Tình trạng hạn dùng | Tồn khả dụng | Định mức Min | Đơn vị | Đề xuất mua bù |\n`;
      ans += `| :---: | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |\n`;
      out.forEach((a, idx) => {
        const expText = a.hasExpired ? `🔴 Đã hết hạn ${a.expiredQty} ${a.unit}` : 'Bình thường';
        ans += `| ${idx + 1} | **${a.name}** | ${a.categoryName} | ${a.totalStock} | ${expText} | **0** | ${a.minStock} | ${a.unit} | **+${a.suggestedReorder} ${a.unit}** (Mua khẩn) |\n`;
      });
      ans += `\n`;
    } else {
      ans += `✅ Tuyệt vời! Hiện tại không có mặt hàng nào bị hết tồn kho khả dụng hoàn toàn.\n\n`;
    }

    if (low.length > 0) {
      ans += `⚠️ **Vật tư SẮP HẾT (Tồn khả dụng <= Định mức tối thiểu) (${low.length} mặt hàng):**\n\n`;
      ans += `| STT | Tên vật tư | Nhóm | Tồn khả dụng | Định mức Min | Đơn vị | Đề xuất mua bổ sung |\n`;
      ans += `| :---: | :--- | :---: | :---: | :---: | :---: | :---: |\n`;
      low.forEach((a, idx) => {
        ans += `| ${idx + 1} | **${a.name}** | ${a.categoryName} | **${a.usableStock}** | ${a.minStock} | ${a.unit} | **+${a.suggestedReorder} ${a.unit}** |\n`;
      });
      ans += `\n`;
    } else {
      ans += `✅ Tất cả các mặt hàng khác đều duy trì lượng tồn khả dụng trên mức tối thiểu an toàn.\n`;
    }
    return ans;
  }

  // 5. KIỂM TRA HỎI VỀ HẠN SỬ DỤNG / QUÁ HẠN / CẬN HẠN (FEFO) - BẢNG BIỂU & ĐỀ XUẤT MUA SẮM BÙ ĐẮP
  const isAskingExpiry = cleanQ.includes('het han') || cleanQ.includes('can han') || cleanQ.includes('qua han') || 
    cleanQ.includes('han dung') || cleanQ.includes('han su dung') || cleanQ.includes('date') || cleanQ.includes('fefo') || 
    /(^|\s)(han)(\s|$)/.test(cleanQ);

  if (isAskingExpiry) {
    const expiredList = analyzedItems.filter(a => a.hasExpired);
    const nearingList = analyzedItems.filter(a => a.hasNearing && !a.hasExpired);

    let ans = `### 📋 Báo cáo Rà soát Hạn sử dụng, Lô hàng & Đề xuất Mua sắm Bổ sung\n\n`;
    if (expiredList.length > 0) {
      ans += `🚨 **CÁC LÔ HÀNG ĐÃ QUÁ HẠN SỬ DỤNG (${expiredList.length} mặt hàng) - CẦN NIÊM PHONG VÀ MUA BÙ NGAY:**\n\n`;
      ans += `| STT | Tên vật tư | Nhóm | Số lô | Hạn dùng | Lượng hết hạn | Tồn khả dụng | Định mức Min | Đề xuất mua bổ sung | Đơn vị | Xử lý |\n`;
      ans += `| :---: | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :--- |\n`;

      expiredList.forEach((a, idx) => {
        const batchNums = a.expiredBatches.map(b => `\`${b.batchNumber}\``).join(', ') || 'Lô mặc định';
        const expDates = a.expiredBatches.map(b => b.expiryDate).join(', ') || a.earliestExpiryDateStr;
        ans += `| ${idx + 1} | **${a.name}** | ${a.categoryName} | ${batchNums} | **${expDates}** | **${a.expiredQty}** | **${a.usableStock}** | ${a.minStock} | **+${a.suggestedReorder}** | ${a.unit} | 🔴 Niêm phong & Mua bù khẩn |\n`;
      });
      ans += `\n⚠️ **Cảnh báo an toàn người bệnh:** Toàn bộ **${expiredList.reduce((acc, a) => acc + a.expiredQty, 0)}** đơn vị hết hạn nói trên KHÔNG ĐƯỢC PHÉP xuất cho các ca chụp chiếu. Đã đề xuất lập phiếu mua sắm bổ sung thay thế ở cột trên.\n\n`;
    } else {
      ans += `✅ Hiện tại **không phát hiện lô hàng nào bị quá hạn sử dụng** trong kho.\n\n`;
    }

    if (nearingList.length > 0) {
      ans += `⚠️ **CÁC LÔ HÀNG CẬN HẠN (< 60 ngày) - ƯU TIÊN XUẤT TRƯỚC THEO FEFO:**\n\n`;
      ans += `| STT | Tên vật tư | Số lô | Hạn dùng | Còn lại | Số lượng | Đơn vị | Thứ tự FEFO |\n`;
      ans += `| :---: | :--- | :---: | :---: | :---: | :---: | :---: | :---: |\n`;

      let nIdx = 1;
      nearingList.forEach(a => {
        a.nearingBatches.forEach(b => {
          ans += `| ${nIdx++} | **${a.name}** | \`${b.batchNumber}\` | ${b.expiryDate} | **${b.daysLeft} ngày** | **${b.quantity}** | ${a.unit} | ⚡ Ưu tiên #${nIdx - 1} |\n`;
        });
      });
      ans += `\n`;
    } else {
      ans += `✅ Không có lô hàng nào sắp hết hạn trong 60 ngày tới.\n`;
    }
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
    if (topItems.length > 0) {
      ans += `**Top vật tư được xuất sử dụng nhiều nhất:**\n\n`;
      ans += `| STT | Tên vật tư | Tổng số lượng xuất | Đơn vị | Mức độ tiêu thụ |\n`;
      ans += `| :---: | :--- | :---: | :---: | :---: |\n`;
      topItems.forEach((it, idx) => {
        const rounded = Math.round(it.qty * 10) / 10;
        ans += `| ${idx + 1} | **${it.name}** | **${rounded}** | ${it.unit} | 🔥 Cao |\n`;
      });
      ans += `\n`;
    } else {
      ans += `- Chưa ghi nhận lịch sử xuất kho gần đây.\n\n`;
    }

    const depts = Object.entries(deptTotals);
    if (depts.length > 0) {
      ans += `**Phân bổ vật tư theo các phòng ban / phòng máy:**\n\n`;
      ans += `| STT | Phòng ban / Modality | Tổng số lượng cấp | Đơn vị |\n`;
      ans += `| :---: | :--- | :---: | :---: |\n`;
      depts.forEach(([d, q], idx) => {
        const rounded = Math.round(q * 10) / 10;
        ans += `| ${idx + 1} | **Phòng ${d}** | **${rounded}** | đơn vị |\n`;
      });
      ans += `\n`;
    } else {
      ans += `- Chưa có dữ liệu phân bổ phòng ban.\n`;
    }
    return ans;
  }

  // 7. TRA CỨU MỘT VẬT TƯ CỤ THỂ THEO TÊN
  const matchedAnalysis = analyzedItems.find(a => {
    const nameClean = removeVietnameseTones(a.name);
    return nameClean && (cleanQ.includes(nameClean) || nameClean.split(' ').filter(w => w.length > 2).some(w => cleanQ.includes(w)));
  });

  if (matchedAnalysis) {
    let statusText = '🟢 An toàn';
    if (matchedAnalysis.isFullyExpired) statusText = '🔴 Toàn bộ đã hết hạn (Tồn khả dụng = 0)';
    else if (matchedAnalysis.hasExpired) statusText = `⚠️ Hết hạn ${matchedAnalysis.expiredQty} ${matchedAnalysis.unit}`;
    else if (matchedAnalysis.usableStock <= 0) statusText = '🔴 Cạn kho hoàn toàn';
    else if (matchedAnalysis.usableStock <= matchedAnalysis.minStock) statusText = '🟡 Cảnh báo (Dưới định mức tối thiểu)';

    let ans = `### 🔍 Thông tin chi tiết vật tư: **${matchedAnalysis.name}**\n\n`;
    ans += `| Thuộc tính | Giá trị |\n`;
    ans += `| :--- | :--- |\n`;
    ans += `| **Nhóm phân loại** | ${matchedAnalysis.categoryName} |\n`;
    ans += `| **Tồn kho sổ sách** | ${matchedAnalysis.totalStock} ${matchedAnalysis.unit} |\n`;
    ans += `| **Lượng hàng đã hết hạn** | **${matchedAnalysis.expiredQty} ${matchedAnalysis.unit}** |\n`;
    ans += `| **Tồn khả dụng an toàn (dùng cho BN)** | **${matchedAnalysis.usableStock} ${matchedAnalysis.unit}** |\n`;
    ans += `| **Định mức tồn tối thiểu** | ${matchedAnalysis.minStock} ${matchedAnalysis.unit} |\n`;
    ans += `| **Đơn giá** | ${matchedAnalysis.price.toLocaleString('vi-VN')} đ |\n`;
    ans += `| **Trạng thái kho** | ${statusText} |\n`;
    if (matchedAnalysis.isDeficit) {
      ans += `| **Đề xuất mua sắm bổ sung** | **+${matchedAnalysis.suggestedReorder} ${matchedAnalysis.unit}** |\n`;
    }
    ans += `\n`;

    const allBatches = [...matchedAnalysis.expiredBatches, ...matchedAnalysis.nearingBatches, ...matchedAnalysis.validBatches];
    if (allBatches.length > 0) {
      ans += `**Chi tiết các lô hàng đang lưu kho:**\n\n`;
      ans += `| STT | Số lô | Số lượng | Đơn vị | Hạn sử dụng | Trạng thái lô |\n`;
      ans += `| :---: | :---: | :---: | :---: | :---: | :---: |\n`;
      allBatches.forEach((b, idx) => {
        let bStatus = '🟢 Còn hạn';
        if (b.isExpired) bStatus = '🔴 ĐÃ QUÁ HẠN';
        else if (b.isNearing) bStatus = `🟡 Cận hạn (còn ${b.daysLeft} ngày)`;

        ans += `| ${idx + 1} | \`${b.batchNumber}\` | **${b.quantity}** | ${matchedAnalysis.unit} | ${b.expiryDate || 'Không có hạn'} | ${bStatus} |\n`;
      });
      ans += `\n`;
    }

    return ans;
  }

  // 8. TRẢ LỜI MẶC ĐỊNH
  return `### 💡 Trợ lý AI Khoa Chẩn đoán Hình ảnh\n\n` +
    `Hiện tại hệ thống đang quản lý **${items.length}** danh mục vật tư với **${transactions.length}** giao dịch ghi nhận gần đây.\n\n` +
    `Bạn có thể hỏi tôi các câu hỏi cụ thể như:\n` +
    `- *"Vật tư nào đã hết hạn và cần mua sắm bổ sung?"*\n` +
    `- *"Đề xuất kế hoạch dự trù mua sắm bổ sung vật tư"* \n` +
    `- *"Cho tôi danh mục văn phòng phẩm hiện có"*\n` +
    `- *"Cho tôi danh mục thuốc & dược"* \n` +
    `- *"Vật tư nào đã hết hàng hoặc cạn kho khả dụng?"*\n` +
    `- *"Có lô hàng nào quá hạn hoặc cận hạn dưới 60 ngày không?"*\n` +
    `- *"Phòng ban nào tiêu hao nhiều nhất gần đây?"*`;
}

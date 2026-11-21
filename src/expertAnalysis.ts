// Intelligent Diagnostic Imaging Inventory Expert Engine (Clinical & Quantitative)
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

export interface ConsumptionWindowMetrics {
  label: string;
  totalOut: number;
  workingDays: number;
  dailyUsage: number;
  workingDaysRemaining: number | null;
  depletionDateStr: string;
}

export interface ItemConsumptionAnalysis {
  window30d: ConsumptionWindowMetrics;
  window90d: ConsumptionWindowMetrics;
  windowYTD: ConsumptionWindowMetrics;
  window365d: ConsumptionWindowMetrics;
  allTimeOut: number;
  primarySourceLabel: string;
  primaryDailyUsage: number;
  primaryWorkingDaysRemaining: number | null;
  primaryDepletionDateStr: string;
  recentOutCount: number;
  lastOutDateStr: string | null;
}

export function getLocalDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function formatDateVi(date: Date): string {
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const y = date.getFullYear();
  return `${d}/${m}/${y}`;
}

export function parseDateFlexible(val: any): Date | null {
  if (!val) return null;
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
  if (typeof val === 'object' && typeof val.seconds === 'number') {
    return new Date(val.seconds * 1000);
  }
  if (typeof val === 'object' && typeof val.toDate === 'function') {
    try {
      const d = val.toDate();
      return d instanceof Date && !isNaN(d.getTime()) ? d : null;
    } catch {
      return null;
    }
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

export function parseTransactionDate(t: any): Date | null {
  if (!t) return null;
  return parseDateFlexible(t.timestamp) || parseDateFlexible(t.date);
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

export function buildHolidaySet(holidays: any[] = []): Set<string> {
  const set = new Set<string>();
  for (const h of holidays) {
    if (h?.date && typeof h.date === 'string') {
      const normalized = h.date.trim().slice(0, 10);
      if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
        set.add(normalized);
      } else {
        const parsed = parseDateFlexible(h.date);
        if (parsed) set.add(getLocalDateStr(parsed));
      }
    }
  }
  return set;
}

export function countWorkingDays(startDate: Date, endDate: Date, holidaySet: Set<string>): number {
  const cur = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
  const end = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
  if (cur > end) return 0;

  let count = 0;
  while (cur <= end) {
    if (!holidaySet.has(getLocalDateStr(cur))) {
      count++;
    }
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

export function estimateDepletionFromStock(
  stockQty: number,
  dailyUsage: number,
  startDate: Date,
  holidaySet: Set<string>
): { workingDaysRemaining: number | null; depletionDateStr: string } {
  if (stockQty <= 0) {
    return {
      workingDaysRemaining: 0,
      depletionDateStr: `Đã hết (${formatDateVi(startDate)})`,
    };
  }
  if (dailyUsage <= 0) {
    return {
      workingDaysRemaining: null,
      depletionDateStr: 'Chưa có dữ liệu tiêu hao (N/A)',
    };
  }

  let stockLeft = stockQty;
  const checkDate = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
  const maxDate = new Date(checkDate.getTime() + 730 * 24 * 60 * 60 * 1000);
  let workingDays = 0;

  while (stockLeft > 0 && checkDate < maxDate) {
    checkDate.setDate(checkDate.getDate() + 1);
    if (!holidaySet.has(getLocalDateStr(checkDate))) {
      stockLeft -= dailyUsage;
      workingDays++;
    }
  }

  if (stockLeft <= 0) {
    return {
      workingDaysRemaining: workingDays,
      depletionDateStr: formatDateVi(checkDate),
    };
  }
  return {
    workingDaysRemaining: Math.round(stockQty / dailyUsage),
    depletionDateStr: '> 2 năm',
  };
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
  const earliestExpiryDateStr = item.expiryDate || '';

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
  const usableStock = Math.max(0, Number((totalStock - expiredQty).toFixed(2)));
  const hasExpired = expiredQty > 0 || expiredBatches.length > 0;
  const hasNearing = nearingQty > 0 || nearingBatches.length > 0;
  const isFullyExpired = hasExpired && usableStock === 0 && totalStock > 0;
  const isDeficit = usableStock <= minStock || hasExpired;

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

export function computeItemConsumptionAndDepletion(
  analysis: ItemStockAnalysis,
  transactions: any[] = [],
  holidays: any[] = [],
  now: Date = new Date()
): ItemConsumptionAnalysis {
  const holidaySet = buildHolidaySet(holidays);
  const itemId = analysis.item?.id;
  const itemNameClean = removeVietnameseTones(analysis.name);

  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);

  const start30d = new Date(todayStart.getTime() - 30 * 24 * 60 * 60 * 1000);
  const start90d = new Date(todayStart.getTime() - 90 * 24 * 60 * 60 * 1000);
  const startYTD = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
  const start365d = new Date(todayStart.getTime() - 365 * 24 * 60 * 60 * 1000);

  const wd30 = Math.max(1, countWorkingDays(start30d, todayStart, holidaySet));
  const wd90 = Math.max(1, countWorkingDays(start90d, todayStart, holidaySet));
  const wdYTD = Math.max(1, countWorkingDays(startYTD, todayStart, holidaySet));
  const wd365 = Math.max(1, countWorkingDays(start365d, todayStart, holidaySet));

  let out30 = 0;
  let out90 = 0;
  let outYTD = 0;
  let out365 = 0;
  let allTimeOut = 0;
  let recentOutCount = 0;
  let latestTxDate: Date | null = null;

  for (const t of transactions) {
    if (t?.type !== 'OUT') continue;
    const matchById = itemId && t.itemId && t.itemId === itemId;
    const matchByName = !t.itemId && t.itemName && removeVietnameseTones(t.itemName) === itemNameClean;
    if (!matchById && !matchByName) continue;

    const qty = Number(t.quantity || 0);
    if (qty <= 0) continue;

    allTimeOut += qty;
    recentOutCount++;

    const txDate = parseTransactionDate(t);
    if (!txDate) continue;
    if (!latestTxDate || txDate > latestTxDate) {
      latestTxDate = txDate;
    }

    if (txDate <= todayEnd) {
      if (txDate >= start30d) out30 += qty;
      if (txDate >= start90d) out90 += qty;
      if (txDate >= startYTD) outYTD += qty;
      if (txDate >= start365d) out365 += qty;
    }
  }

  const buildWindow = (label: string, totalOut: number, workingDays: number): ConsumptionWindowMetrics => {
    const dailyUsage = workingDays > 0 ? Number((totalOut / workingDays).toFixed(2)) : 0;
    const dep = estimateDepletionFromStock(analysis.usableStock, dailyUsage, todayStart, holidaySet);
    return {
      label,
      totalOut: Number(totalOut.toFixed(2)),
      workingDays,
      dailyUsage,
      workingDaysRemaining: dep.workingDaysRemaining,
      depletionDateStr: dep.depletionDateStr,
    };
  };

  const window30d = buildWindow('30 ngày gần nhất', out30, wd30);
  const window90d = buildWindow('90 ngày gần nhất', out90, wd90);
  const windowYTD = buildWindow(`Từ đầu năm ${now.getFullYear()} (YTD)`, outYTD, wdYTD);
  const window365d = buildWindow('1 năm gần nhất (365 ngày)', out365, wd365);

  // Pick best primary window: 90d if active, otherwise YTD, then 365d, then 30d
  let primary = window90d;
  if (window90d.dailyUsage <= 0) {
    if (windowYTD.dailyUsage > 0) primary = windowYTD;
    else if (window365d.dailyUsage > 0) primary = window365d;
    else if (window30d.dailyUsage > 0) primary = window30d;
  }

  return {
    window30d,
    window90d,
    windowYTD,
    window365d,
    allTimeOut: Number(allTimeOut.toFixed(2)),
    primarySourceLabel: primary.label,
    primaryDailyUsage: primary.dailyUsage,
    primaryWorkingDaysRemaining: primary.workingDaysRemaining,
    primaryDepletionDateStr: primary.depletionDateStr,
    recentOutCount,
    lastOutDateStr: latestTxDate ? formatDateVi(latestTxDate) : null,
  };
}

// Vietnamese stop-words to ignore when matching specific item names
const QUERY_STOP_WORDS = new Set([
  'uoc', 'tinh', 'giup', 'toi', 'minh', 'ban', 'cho', 'xem', 'hoi', 'biet',
  'ngay', 'het', 'han', 'hang', 'ton', 'kho', 'bao', 'nhieu', 'lau', 'con',
  'may', 'duoc', 'khong', 'khi', 'nao', 'the', 'sao', 'can', 'nhap', 'them',
  'bo', 'sung', 'mua', 'sam', 'du', 'tru', 'kiem', 'tra', 'tim', 'thong',
  'tin', 'chi', 'tiet', 've', 'cua', 'loai', 'vat', 'tu', 'nay', 'kia',
  'hien', 'tai', 'dang', 'co', 'la', 'gi', 'cac', 'nhung', 'voi', 'trong',
  'den', 'su', 'dung', 'muc', 'toi', 'thieu', 'don', 'gia', 'lo',
  'tieu', 'hao', 'xuat', 'moi', 'trung', 'binh', 'kien', 'chinh', 'xac',
  'mot', 'hai', 'ba', 'hay', 'va', 'hoac', 'nha', 'nhe', 'a', 'oi',
  // Analytics, time horizon, comparison & department stop-words
  'tong', 'tri', 'tien', 'ngan', 'sach', 'thanh', 'lich', 'gan', 'day', 'vua',
  'qua', 'truoc', 'sau', 'tuan', 'thang', 'quy', 'nam', 'toi', 'so', 'sanh',
  'giua', 'khac', 'nhau', 'hon', 'it', 'nhat', 'phan', 'tram', 'phong', 'ban',
  'khu', 'vuc', 'clvt', 'ct', 'cht', 'mri', 'sieu', 'am', 'dsa', 'noi', 'soi',
  'muc', 'do', 'bao', 'cao', 'danh', 'sach', 'tat', 'ca', 'toan', 'bo'
]);

function tokenizeForItemMatch(text: string): string[] {
  const clean = removeVietnameseTones(text)
    .replace(/(\d+)\s*[x×*]\s*(\d+)/gi, '$1x$2') // normalize "8 x 10" -> "8x10"
    .replace(/x[\s-]+quang/g, 'xquang') // normalize "x quang" / "x-quang" -> "xquang"
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

  if (!clean) return [];
  return clean.split(/\s+/).filter(Boolean);
}

function expandDimensionAliases(tokens: string[]): string[] {
  const expanded = new Set<string>(tokens);
  for (const tok of tokens) {
    const dim = tok.match(/^(\d+)x(\d+)$/);
    if (dim) {
      expanded.add(`${dim[2]}x${dim[1]}`); // 8x10 <-> 10x8
    }
    if (tok === 'xq') expanded.add('xquang');
    if (tok === 'clvt') expanded.add('ct');
    if (tok === 'cht') expanded.add('mri');
  }
  return Array.from(expanded);
}

export interface ScoredItemMatch {
  analysis: ItemStockAnalysis;
  score: number;
  matchedTokens: string[];
}

export function findMatchingItems(
  question: string,
  analyzedItems: ItemStockAnalysis[]
): ScoredItemMatch[] {
  const rawCleanQ = removeVietnameseTones(question)
    .replace(/(\d+)\s*[x×*]\s*(\d+)/gi, '$1x$2')
    .replace(/x[\s-]+quang/g, 'xquang')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

  const queryTokensAll = tokenizeForItemMatch(question);
  const queryKeywords = expandDimensionAliases(
    queryTokensAll.filter(t => !QUERY_STOP_WORDS.has(t) && t.length >= 2)
  );

  if (queryKeywords.length === 0) return [];

  const matches: ScoredItemMatch[] = [];

  for (const analysis of analyzedItems) {
    const itemTokens = tokenizeForItemMatch(analysis.name);
    const itemClean = itemTokens.join(' ');
    const itemTokenSet = new Set(itemTokens);

    let score = 0;
    const matchedTokens: string[] = [];

    // 1. Exact full item name present inside query
    if (itemClean.length >= 4 && rawCleanQ.includes(itemClean)) {
      score += 120;
    }

    // 2. Exact whole-token matching (prevents "tinh" matching inside "uoc tinh" or partial substrings)
    for (const qTok of queryKeywords) {
      if (itemTokenSet.has(qTok)) {
        const isDimensionOrCode = /\d/.test(qTok) || qTok === 'xquang' || qTok === 'barit' || qTok === 'omnipaque';
        // Check whether exact match vs swapped dimension (e.g. 8x10 matched 10x8)
        const isExactLiteral = queryTokensAll.includes(qTok);
        score += isDimensionOrCode ? (isExactLiteral ? 35 : 28) : 16;
        matchedTokens.push(qTok);
      } else if (qTok.length >= 4) {
        // Only allow compound prefix/contains if token is genuinely long (>= 4 chars) and starts/matches whole word
        const partialHit = itemTokens.some(it => it.length >= 4 && (it.startsWith(qTok) || qTok.startsWith(it)));
        if (partialHit) {
          score += 8;
          matchedTokens.push(qTok);
        }
      }
    }

    // 3. Bigram bonus for consecutive phrase match
    for (let i = 0; i < queryTokensAll.length - 1; i++) {
      const t1 = queryTokensAll[i];
      const t2 = queryTokensAll[i + 1];
      if (QUERY_STOP_WORDS.has(t1) && QUERY_STOP_WORDS.has(t2)) continue;
      const bigram = `${t1} ${t2}`;
      if (itemClean.includes(bigram)) {
        score += 20;
      }
    }

    // 4. Coverage bonus (higher ratio of query keywords matched)
    const uniqueNonDimMatched = matchedTokens.length;
    if (uniqueNonDimMatched >= 2) {
      score += uniqueNonDimMatched * 6;
    }

    // Require strong confidence: either >= 20 points or >= 2 matched meaningful tokens
    if (score >= 20 || (score >= 16 && matchedTokens.length >= 1 && queryKeywords.length <= 2)) {
      matches.push({ analysis, score, matchedTokens });
    }
  }

  return matches.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.matchedTokens.length - a.matchedTokens.length;
  });
}

export function buildInventoryAnalyticsContext(
  items: any[] = [],
  transactions: any[] = [],
  holidays: any[] = [],
  categories: any[] = []
) {
  const now = new Date();
  const sixtyDaysLater = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);
  const holidaySet = buildHolidaySet(holidays);

  const enrichedItems = items.map(i => {
    const stock = computeItemStockAndExpiry(i, now, sixtyDaysLater, categories);
    const consumption = computeItemConsumptionAndDepletion(stock, transactions, holidays, now);
    return {
      id: i.id,
      name: stock.name,
      category: stock.categoryName,
      unit: stock.unit,
      price: stock.price,
      totalStock: stock.totalStock,
      usableStock: stock.usableStock,
      expiredQty: stock.expiredQty,
      nearingQty: stock.nearingQty,
      minStock: stock.minStock,
      hasExpired: stock.hasExpired,
      isFullyExpired: stock.isFullyExpired,
      suggestedPurchaseQty: stock.suggestedReorder,
      // Pre-computed exact consumption & stockout metrics (matching InventoryPlanning)
      dailyUsage30d: consumption.window30d.dailyUsage,
      dailyUsage90d: consumption.window90d.dailyUsage,
      dailyUsageYTD: consumption.windowYTD.dailyUsage,
      dailyUsage365d: consumption.window365d.dailyUsage,
      primaryDailyUsage: consumption.primaryDailyUsage,
      primaryWindowLabel: consumption.primarySourceLabel,
      estimatedWorkingDaysLeft: consumption.primaryWorkingDaysRemaining,
      estimatedDepletionDate: consumption.primaryDepletionDateStr,
      depletionDate90d: consumption.window90d.depletionDateStr,
      depletionDateYTD: consumption.windowYTD.depletionDateStr,
      depletionDate365d: consumption.window365d.depletionDateStr,
      totalOut90d: consumption.window90d.totalOut,
      totalOutYTD: consumption.windowYTD.totalOut,
      totalOut365d: consumption.window365d.totalOut,
      allTimeOut: consumption.allTimeOut,
      lastOutDate: consumption.lastOutDateStr,
      batches: [...stock.expiredBatches, ...stock.nearingBatches, ...stock.validBatches].map(b => ({
        batchNumber: b.batchNumber,
        expiryDate: b.expiryDate,
        quantity: b.quantity,
        isExpired: b.isExpired,
        daysLeft: b.daysLeft,
      })),
    };
  });

  // Aggregate department OUT consumption
  const deptOutTotals: Record<string, number> = {};
  const recentOutTransactions: any[] = [];
  const sortedTx = [...transactions].sort((a, b) => {
    const da = parseTransactionDate(a)?.getTime() || 0;
    const db = parseTransactionDate(b)?.getTime() || 0;
    return db - da;
  });

  for (const t of sortedTx) {
    if (t?.type === 'OUT') {
      const dept = t.department || 'Chung / Khác';
      deptOutTotals[dept] = Number(((deptOutTotals[dept] || 0) + Number(t.quantity || 0)).toFixed(2));
      if (recentOutTransactions.length < 40) {
        const matchedItem = items.find(i => i.id === t.itemId);
        const dt = parseTransactionDate(t);
        recentOutTransactions.push({
          date: dt ? formatDateVi(dt) : t.date || '',
          itemName: matchedItem?.name || t.itemName || 'Vật tư',
          quantity: Number(t.quantity || 0),
          unit: matchedItem?.unit || t.unit || '',
          department: dept,
        });
      }
    }
  }

  return {
    todayStr: formatDateVi(now),
    holidaysRecordedCount: holidaySet.size,
    totalItemsCount: items.length,
    totalTransactionsCount: transactions.length,
    items: enrichedItems,
    departmentConsumptionTotals: deptOutTotals,
    recentOutTransactions,
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

  const analyzedItems: ItemStockAnalysis[] = items.map(i =>
    computeItemStockAndExpiry(i, now, sixtyDaysLater, categories)
  );

  const expiredItems = analyzedItems.filter(a => a.hasExpired);
  const outOfStockItems = analyzedItems.filter(a => a.usableStock <= 0);
  const lowStockItems = analyzedItems.filter(a => a.usableStock > 0 && a.usableStock <= a.minStock);
  const nearingExpiryItems = analyzedItems.filter(a => a.hasNearing && !a.hasExpired);
  const safeItems = analyzedItems.filter(a => a.usableStock > a.minStock && !a.hasExpired);

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

  const alerts: { type: 'danger' | 'warning' | 'info'; message: string; item?: string }[] = [];

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

  lowStockItems.slice(0, 5).forEach(a => {
    alerts.push({
      type: 'warning',
      message: `SẮP HẾT HÀNG: Tồn khả dụng hiện tại (${a.usableStock} ${a.unit}) đã chạm hoặc thấp hơn định mức an toàn (${a.minStock} ${a.unit}).`,
      item: a.name,
    });
  });

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

  const recommendations: { action: string; priority: 'high' | 'medium' | 'low'; reason: string }[] = [];

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

  const regularOutOfStock = outOfStockItems.filter(a => !a.hasExpired);
  if (regularOutOfStock.length > 0) {
    recommendations.push({
      action: `Lập dự trù nhập bổ sung cho: ${regularOutOfStock.map(a => a.name).slice(0, 3).join(', ')}${regularOutOfStock.length > 3 ? ` và ${regularOutOfStock.length - 3} mặt hàng khác` : ''}`,
      priority: 'high',
      reason: `Các mặt hàng này đã cạn kho hoàn toàn, nguy cơ thiếu vật tư trong các ca chụp cấp cứu.`,
    });
  }

  if (lowStockItems.length > 0) {
    recommendations.push({
      action: `Đưa vào danh sách dự trù định kỳ: ${lowStockItems.map(a => a.name).slice(0, 4).join(', ')}`,
      priority: 'medium',
      reason: `Số lượng tồn khả dụng dưới ngưỡng dự phòng tối thiểu, cần bổ sung trước khi hết hẳn.`,
    });
  }

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

  const summary = `Kho hiện có ${items.length} danh mục vật tư. Phát hiện ${expiredItems.length} mặt hàng có lô quá hạn (Tồn khả dụng bị ảnh hưởng nghiêm trọng), ${outOfStockItems.length} mặt hàng cạn kho khả dụng, ${lowStockItems.length} mặt hàng chạm ngưỡng dự trù và ${nearingExpiryItems.length} mặt hàng cận hạn. Đã tự động tạo các đề xuất mua sắm bổ sung khẩn cấp để bù đắp lượng hàng đã hết hạn.`;

  let detailedAnalysis = `### BÁO CÁO PHÂN TÍCH CHUYÊN SÂU KHO VẬT TƯ CĐHA\n\n`;
  detailedAnalysis += `#### 1. Tổng quan tình trạng kho & Tồn khả dụng\n`;
  detailedAnalysis += `- **Tổng số mặt hàng quản lý:** **${items.length}** vật tư\n`;
  detailedAnalysis += `- **Số mặt hàng an toàn (đủ tồn, còn hạn):** **${safeItems.length}** (${items.length > 0 ? Math.round((safeItems.length / items.length) * 100) : 0}%)\n`;
  detailedAnalysis += `- **Vật tư có lô ĐÃ QUÁ HẠN (Phải niêm phong & mua bù):** **${expiredItems.length}** mặt hàng\n`;
  detailedAnalysis += `- **Vật tư CẠN KHO KHẢ DỤNG (Tồn dùng = 0):** **${outOfStockItems.length}** mặt hàng\n`;
  detailedAnalysis += `- **Vật tư chạm định mức cảnh báo:** **${lowStockItems.length}** mặt hàng\n`;
  detailedAnalysis += `- **Vật tư cận hạn trong 60 ngày (Cần xuất trước FEFO):** **${nearingExpiryItems.length}** mặt hàng\n\n`;

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

function extractHorizonAndSafetyFromQuestion(cleanQ: string): {
  horizonDays: number | null;
  safetyPercent: number;
  preferredWindow: '30d' | '90d' | 'ytd' | '365d' | null;
} {
  let horizonDays: number | null = null;
  const dayMatch = cleanQ.match(/(\d+)\s*ngay(\s+toi|\s+tiep|\s+sau|\s+nua|\s+du\s*tru)?/);
  const weekMatch = cleanQ.match(/(\d+)\s*tuan(\s+toi|\s+tiep|\s+sau|\s+nua)?/);
  const monthMatch = cleanQ.match(/(\d+)\s*thang(\s+toi|\s+tiep|\s+sau|\s+nua)?/);

  if (dayMatch && !cleanQ.includes(`${dayMatch[1]} ngay gan nhat`)) {
    horizonDays = Math.min(730, Math.max(1, parseInt(dayMatch[1], 10)));
  } else if (weekMatch) {
    horizonDays = Math.min(730, Math.max(1, parseInt(weekMatch[1], 10) * 7));
  } else if (monthMatch) {
    horizonDays = Math.min(730, Math.max(1, parseInt(monthMatch[1], 10) * 30));
  } else if (cleanQ.includes('tuan toi')) {
    horizonDays = 7;
  } else if (cleanQ.includes('thang toi')) {
    horizonDays = 30;
  } else if (cleanQ.includes('quy toi')) {
    horizonDays = 90;
  }

  let safetyPercent = 0;
  const pctMatch = cleanQ.match(/(?:du\s*phong|an\s*toan|them|dem)\s*(\d+)\s*%/);
  const genericPct = cleanQ.match(/(\d+)\s*%/);
  if (pctMatch) {
    safetyPercent = Math.min(200, Math.max(0, parseInt(pctMatch[1], 10)));
  } else if (genericPct) {
    safetyPercent = Math.min(200, Math.max(0, parseInt(genericPct[1], 10)));
  }

  let preferredWindow: '30d' | '90d' | 'ytd' | '365d' | null = null;
  if (cleanQ.includes('30 ngay')) preferredWindow = '30d';
  else if (cleanQ.includes('90 ngay')) preferredWindow = '90d';
  else if (cleanQ.includes('dau nam') || cleanQ.includes('ytd')) preferredWindow = 'ytd';
  else if (cleanQ.includes('1 nam') || cleanQ.includes('365 ngay')) preferredWindow = '365d';

  return { horizonDays, safetyPercent, preferredWindow };
}

function formatSingleItemExpertReport(
  matchedAnalysis: ItemStockAnalysis,
  consumption: ItemConsumptionAnalysis,
  transactions: any[],
  holidays: any[],
  isForecastQuery: boolean,
  isExpiryQuery: boolean,
  now: Date,
  options?: { horizonDays?: number | null; safetyPercent?: number; preferredWindow?: '30d' | '90d' | 'ytd' | '365d' | null }
): string {
  let statusText = '🟢 An toàn';
  if (matchedAnalysis.isFullyExpired) statusText = '🔴 Toàn bộ đã hết hạn (Tồn khả dụng = 0)';
  else if (matchedAnalysis.hasExpired) statusText = `⚠️ Hết hạn ${matchedAnalysis.expiredQty} ${matchedAnalysis.unit}`;
  else if (matchedAnalysis.usableStock <= 0) statusText = '🔴 Cạn kho hoàn toàn';
  else if (matchedAnalysis.usableStock <= matchedAnalysis.minStock) statusText = '🟡 Cảnh báo (Dưới định mức tối thiểu)';

  const selectedWindow =
    options?.preferredWindow === '30d'
      ? consumption.window30d
      : options?.preferredWindow === 'ytd'
      ? consumption.windowYTD
      : options?.preferredWindow === '365d'
      ? consumption.window365d
      : options?.preferredWindow === '90d'
      ? consumption.window90d
      : null;

  const activeDailyUsage = selectedWindow ? selectedWindow.dailyUsage : consumption.primaryDailyUsage;
  const activeSourceLabel = selectedWindow ? selectedWindow.label : consumption.primarySourceLabel;
  const activeWorkingDaysRem = selectedWindow ? selectedWindow.workingDaysRemaining : consumption.primaryWorkingDaysRemaining;
  const activeDepletionDate = selectedWindow ? selectedWindow.depletionDateStr : consumption.primaryDepletionDateStr;

  let ans = isForecastQuery
    ? `### ⏳ Ước tính Ngày Hết & Dự báo Tiêu hao: **${matchedAnalysis.name}**\n\n`
    : `### 🔍 Thông tin chi tiết vật tư: **${matchedAnalysis.name}**\n\n`;

  // Custom horizon reorder calculation if user specified e.g. "cho 45 ngày tới với dự phòng 20%"
  if (options?.horizonDays && options.horizonDays > 0) {
    const holidaySet = buildHolidaySet(holidays);
    const futureEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + options.horizonDays);
    const futureWorkingDays = Math.max(1, countWorkingDays(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1), futureEnd, holidaySet));
    const baseDemand = Number((activeDailyUsage * futureWorkingDays).toFixed(2));
    const safetyQty = Number((baseDemand * ((options.safetyPercent || 0) / 100)).toFixed(2));
    const grossRequired = Number((baseDemand + safetyQty + matchedAnalysis.minStock).toFixed(2));
    const netNeed = Math.max(0, Math.ceil(grossRequired - matchedAnalysis.usableStock));
    const estCost = netNeed * matchedAnalysis.price;

    ans += `> 🎯 **Dự trù riêng cho ${options.horizonDays} ngày tới (${futureWorkingDays} ngày làm việc thực tế, từ ${formatDateVi(now)} → ${formatDateVi(futureEnd)}):**\n` +
      `> - Nhu cầu tiêu hao dự kiến: **${baseDemand} ${matchedAnalysis.unit}** (tốc độ **${activeDailyUsage} ${matchedAnalysis.unit}/ngày lv** theo *${activeSourceLabel}*)\n` +
      (options.safetyPercent ? `> - Dư lượng dự phòng an toàn (+${options.safetyPercent}%): **${safetyQty} ${matchedAnalysis.unit}**\n` : '') +
      `> - Tồn tối thiểu cần giữ: **${matchedAnalysis.minStock} ${matchedAnalysis.unit}** · Tồn khả dụng hiện có: **${matchedAnalysis.usableStock} ${matchedAnalysis.unit}**\n` +
      `> - 👉 **Đề xuất cần nhập thêm:** **${netNeed > 0 ? `+${netNeed} ${matchedAnalysis.unit}` : '0 (Đủ dùng)'}**` +
      (netNeed > 0 && estCost > 0 ? ` *(Ước tính: **${estCost.toLocaleString('vi-VN')} đ**)*` : '') + `\n\n`;
  } else if (isForecastQuery) {
    if (matchedAnalysis.usableStock <= 0) {
      ans += `> 🚨 **Kết luận nhanh:** Hiện tại tồn kho khả dụng an toàn của **${matchedAnalysis.name}** là **0 ${matchedAnalysis.unit}**${matchedAnalysis.hasExpired ? ` (do có ${matchedAnalysis.expiredQty} ${matchedAnalysis.unit} đã hết hạn)` : ''}. Cần nhập bổ sung ngay!\n\n`;
    } else if (activeDailyUsage > 0) {
      ans += `> 📅 **Ước tính ngày hết dự kiến (${activeSourceLabel}):** Khoảng ngày **${activeDepletionDate}** (còn khoảng **${activeWorkingDaysRem} ngày làm việc thực tế**, với tồn khả dụng **${matchedAnalysis.usableStock} ${matchedAnalysis.unit}** và tốc độ tiêu hao trung bình **${activeDailyUsage} ${matchedAnalysis.unit}/ngày làm việc**).\n\n`;
    } else {
      ans += `> ℹ️ Hiện tại vật tư **${matchedAnalysis.name}** còn **${matchedAnalysis.usableStock} ${matchedAnalysis.unit}** tồn khả dụng, nhưng **chưa ghi nhận giao dịch xuất kho** trong kỳ tham chiếu nên chưa thể tính ngày hết dự kiến.\n\n`;
    }
  }

  ans += `| Thuộc tính | Giá trị |\n`;
  ans += `| :--- | :--- |\n`;
  ans += `| **Nhóm phân loại** | ${matchedAnalysis.categoryName} |\n`;
  ans += `| **Tồn kho sổ sách** | ${matchedAnalysis.totalStock} ${matchedAnalysis.unit} |\n`;
  ans += `| **Lượng hàng đã hết hạn** | **${matchedAnalysis.expiredQty} ${matchedAnalysis.unit}** |\n`;
  ans += `| **Tồn khả dụng an toàn (dùng cho BN)** | **${matchedAnalysis.usableStock} ${matchedAnalysis.unit}** |\n`;
  ans += `| **Định mức tồn tối thiểu** | ${matchedAnalysis.minStock} ${matchedAnalysis.unit} |\n`;
  ans += `| **Tốc độ tiêu hao (${activeSourceLabel})** | **${activeDailyUsage} ${matchedAnalysis.unit}/ngày làm việc** |\n`;
  ans += `| **Ngày hết dự kiến (trừ ngày nghỉ)** | **${activeDepletionDate}**${activeWorkingDaysRem !== null ? ` (còn **${activeWorkingDaysRem}** ngày lv)` : ''} |\n`;
  ans += `| **Đơn giá** | ${matchedAnalysis.price.toLocaleString('vi-VN')} đ |\n`;
  ans += `| **Trạng thái kho** | ${statusText} |\n`;
  if (matchedAnalysis.isDeficit) {
    ans += `| **Đề xuất mua sắm bổ sung** | **+${matchedAnalysis.suggestedReorder} ${matchedAnalysis.unit}** |\n`;
  }
  ans += `\n`;

  if (isForecastQuery || consumption.allTimeOut > 0) {
    ans += `**📊 Chi tiết Dự báo theo các Chu kỳ Tiêu hao Thực tế (tính đến ${formatDateVi(now)}, đã trừ ngày nghỉ):**\n\n`;
    ans += `| Chu kỳ tham chiếu | Tổng xuất trong kỳ | Số ngày làm việc | Tiêu hao/ngày lv | Ngày làm việc còn lại | Ngày hết dự kiến |\n`;
    ans += `| :--- | :---: | :---: | :---: | :---: | :---: |\n`;
    const windows = [consumption.window30d, consumption.window90d, consumption.windowYTD, consumption.window365d];
    for (const w of windows) {
      ans += `| **${w.label}** | ${w.totalOut} ${matchedAnalysis.unit} | ${w.workingDays} ngày | **${w.dailyUsage}** ${matchedAnalysis.unit}/ngày | ${w.workingDaysRemaining !== null ? `**${w.workingDaysRemaining} ngày**` : 'N/A'} | **${w.depletionDateStr}** |\n`;
    }
    ans += `\n`;
  }

  const allBatches = [...matchedAnalysis.expiredBatches, ...matchedAnalysis.nearingBatches, ...matchedAnalysis.validBatches];
  if (allBatches.length > 0 && (isExpiryQuery || !isForecastQuery || matchedAnalysis.hasExpired || matchedAnalysis.hasNearing)) {
    ans += `**📦 Chi tiết các lô hàng đang lưu kho:**\n\n`;
    ans += `| STT | Số lô | Số lượng | Đơn vị | Hạn sử dụng | Trạng thái lô |\n`;
    ans += `| :---: | :--- | :---: | :---: | :---: | :---: |\n`;
    allBatches.forEach((b, idx) => {
      let bStatus = '🟢 Còn hạn';
      if (b.isExpired) bStatus = '🔴 ĐÃ QUÁ HẠN';
      else if (b.isNearing) bStatus = `🟡 Cận hạn (còn ${b.daysLeft} ngày)`;

      ans += `| ${idx + 1} | \`${b.batchNumber}\` | **${b.quantity}** | ${matchedAnalysis.unit} | ${b.expiryDate || 'Không có hạn'} | ${bStatus} |\n`;
    });
    ans += `\n`;
  }

  const itemOutTx = transactions
    .filter(t => t?.type === 'OUT' && (t.itemId === matchedAnalysis.item?.id || removeVietnameseTones(t.itemName || '') === removeVietnameseTones(matchedAnalysis.name)))
    .sort((a, b) => (parseTransactionDate(b)?.getTime() || 0) - (parseTransactionDate(a)?.getTime() || 0))
    .slice(0, 5);

  if (itemOutTx.length > 0 && (isForecastQuery || options?.horizonDays)) {
    ans += `**🧾 5 lần xuất kho gần nhất của ${matchedAnalysis.name}:**\n\n`;
    ans += `| Ngày xuất | Số lượng | Đơn vị | Phòng / Nơi sử dụng |\n`;
    ans += `| :---: | :---: | :---: | :--- |\n`;
    for (const t of itemOutTx) {
      const d = parseTransactionDate(t);
      ans += `| ${d ? formatDateVi(d) : (t.date || '-')} | **${t.quantity}** | ${matchedAnalysis.unit} | ${t.department || 'Chung'} |\n`;
    }
    ans += `\n`;
  }

  return ans;
}

// Structured Function-Calling Executors for Gemini AI Server Tools
export function executeInventoryTool(
  toolName: string,
  args: Record<string, any> = {},
  items: any[] = [],
  transactions: any[] = [],
  holidays: any[] = [],
  categories: any[] = []
): any {
  const now = new Date();
  const sixtyDaysLater = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);
  const holidaySet = buildHolidaySet(holidays);
  const analyzedItems = items.map(i => computeItemStockAndExpiry(i, now, sixtyDaysLater, categories));

  if (toolName === 'searchInventoryItems') {
    const queryStr = String(args.query || '').trim();
    const categoryFilter = removeVietnameseTones(String(args.categoryFilter || ''));

    let candidates = analyzedItems;
    if (categoryFilter) {
      candidates = candidates.filter(a => removeVietnameseTones(a.categoryName).includes(categoryFilter));
    }

    const matches = queryStr ? findMatchingItems(queryStr, candidates) : candidates.map(a => ({ analysis: a, score: 1, matchedTokens: [] }));
    const topList = (matches.length > 0 ? matches.map(m => m.analysis) : candidates.slice(0, 15)).slice(0, 15);

    return {
      todayStr: formatDateVi(now),
      matchedCount: topList.length,
      items: topList.map(a => {
        const c = computeItemConsumptionAndDepletion(a, transactions, holidays, now);
        return {
          id: a.item?.id,
          name: a.name,
          category: a.categoryName,
          unit: a.unit,
          price: a.price,
          totalStock: a.totalStock,
          usableStock: a.usableStock,
          expiredQty: a.expiredQty,
          nearingQty: a.nearingQty,
          minStock: a.minStock,
          dailyUsage90d: c.window90d.dailyUsage,
          dailyUsageYTD: c.windowYTD.dailyUsage,
          dailyUsage365d: c.window365d.dailyUsage,
          estimatedDepletionDate: c.primaryDepletionDateStr,
          workingDaysRemaining: c.primaryWorkingDaysRemaining,
          batches: [...a.expiredBatches, ...a.nearingBatches, ...a.validBatches].map(b => ({
            batchNumber: b.batchNumber,
            expiryDate: b.expiryDate,
            quantity: b.quantity,
            isExpired: b.isExpired,
            daysLeft: b.daysLeft,
          })),
        };
      }),
    };
  }

  if (toolName === 'forecastItemDepletion') {
    const queryStr = String(args.itemQuery || '').trim();
    const horizonDays = Math.min(730, Math.max(0, Number(args.horizonDays || 30)));
    const safetyPercent = Math.min(200, Math.max(0, Number(args.safetyPercent || 0)));
    const refWindow = String(args.referenceWindow || '90d');

    const matches = queryStr ? findMatchingItems(queryStr, analyzedItems) : [];
    const targetList = (matches.length > 0 ? matches.slice(0, 5).map(m => m.analysis) : analyzedItems.slice(0, 10));

    const futureEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + horizonDays);
    const futureWorkingDays = horizonDays > 0
      ? Math.max(1, countWorkingDays(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1), futureEnd, holidaySet))
      : 0;

    return {
      todayStr: formatDateVi(now),
      horizonDays,
      futureWorkingDays,
      safetyPercent,
      referenceWindow: refWindow,
      forecasts: targetList.map(a => {
        const c = computeItemConsumptionAndDepletion(a, transactions, holidays, now);
        const chosen =
          refWindow === '30d' ? c.window30d :
          refWindow === 'ytd' ? c.windowYTD :
          refWindow === '365d' ? c.window365d :
          c.window90d;
        const rate = chosen.dailyUsage > 0 ? chosen.dailyUsage : c.primaryDailyUsage;
        const baseDemand = Number((rate * futureWorkingDays).toFixed(2));
        const safetyQty = Number((baseDemand * (safetyPercent / 100)).toFixed(2));
        const grossRequired = Number((baseDemand + safetyQty + a.minStock).toFixed(2));
        const recommendedImportQty = Math.max(0, Math.ceil(grossRequired - a.usableStock));

        return {
          name: a.name,
          category: a.categoryName,
          unit: a.unit,
          totalStock: a.totalStock,
          expiredQty: a.expiredQty,
          usableStock: a.usableStock,
          minStock: a.minStock,
          price: a.price,
          windows: {
            d30: c.window30d,
            d90: c.window90d,
            ytd: c.windowYTD,
            d365: c.window365d,
          },
          primarySource: c.primarySourceLabel,
          primaryDailyUsage: c.primaryDailyUsage,
          estimatedDepletionDate: c.primaryDepletionDateStr,
          workingDaysRemaining: c.primaryWorkingDaysRemaining,
          horizonPlan: horizonDays > 0 ? {
            futureWorkingDays,
            baseDemand,
            safetyQty,
            recommendedImportQty,
            estimatedCostVND: recommendedImportQty * a.price,
          } : null,
        };
      }),
    };
  }

  if (toolName === 'analyzeTransactionsAndDepartments') {
    const itemQuery = String(args.itemQuery || '').trim();
    const deptFilter = removeVietnameseTones(String(args.department || ''));
    const txType = String(args.type || 'OUT').toUpperCase();
    const days = Math.min(730, Math.max(1, Number(args.days || 90)));
    const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

    let targetItemIds: Set<string> | null = null;
    if (itemQuery) {
      const matched = findMatchingItems(itemQuery, analyzedItems).slice(0, 5);
      targetItemIds = new Set(matched.map(m => m.analysis.item?.id).filter(Boolean));
    }

    const filtered = transactions.filter(t => {
      if (txType !== 'ALL' && t?.type !== txType) return false;
      const d = parseTransactionDate(t);
      if (d && d < cutoff) return false;
      if (targetItemIds && targetItemIds.size > 0 && !targetItemIds.has(t.itemId)) return false;
      if (deptFilter) {
        const tDept = removeVietnameseTones(t.department || '');
        const deptAliases = [deptFilter];
        if (deptFilter === 'clvt') deptAliases.push('ct');
        if (deptFilter === 'ct') deptAliases.push('clvt');
        if (deptFilter === 'cht') deptAliases.push('mri');
        if (deptFilter === 'mri') deptAliases.push('cht');
        if (deptFilter === 'xquang') deptAliases.push('x quang');
        if (deptFilter === 'x quang') deptAliases.push('xquang');
        if (!deptAliases.some(alias => tDept.includes(alias))) return false;
      }
      return true;
    });

    const byDept: Record<string, number> = {};
    const byItem: Record<string, { name: string; unit: string; totalQty: number; txCount: number }> = {};

    for (const t of filtered) {
      const qty = Number(t.quantity || 0);
      const dept = t.department || 'Chung / Khác';
      byDept[dept] = Number(((byDept[dept] || 0) + qty).toFixed(2));

      const matched = items.find(i => i.id === t.itemId);
      const name = matched?.name || t.itemName || 'Vật tư';
      const unit = matched?.unit || t.unit || 'đơn vị';
      const key = matched?.id || name;
      if (!byItem[key]) byItem[key] = { name, unit, totalQty: 0, txCount: 0 };
      byItem[key].totalQty = Number((byItem[key].totalQty + qty).toFixed(2));
      byItem[key].txCount++;
    }

    const recent = [...filtered]
      .sort((a, b) => (parseTransactionDate(b)?.getTime() || 0) - (parseTransactionDate(a)?.getTime() || 0))
      .slice(0, 20)
      .map(t => {
        const d = parseTransactionDate(t);
        const matched = items.find(i => i.id === t.itemId);
        return {
          date: d ? formatDateVi(d) : t.date || '',
          type: t.type,
          itemName: matched?.name || t.itemName || 'Vật tư',
          quantity: Number(t.quantity || 0),
          unit: matched?.unit || t.unit || '',
          department: t.department || 'Chung',
        };
      });

    return {
      periodDays: days,
      txType,
      matchedTransactionsCount: filtered.length,
      departmentBreakdown: byDept,
      topItems: Object.values(byItem).sort((a, b) => b.totalQty - a.totalQty).slice(0, 15),
      recentTransactions: recent,
    };
  }

  if (toolName === 'checkExpiryAndFefo') {
    const nearingDays = Math.min(365, Math.max(1, Number(args.nearingDays || 60)));
    const cutoffDate = new Date(now.getTime() + nearingDays * 24 * 60 * 60 * 1000);
    const customAnalyzed = items.map(i => computeItemStockAndExpiry(i, now, cutoffDate, categories));

    return {
      todayStr: formatDateVi(now),
      nearingDaysWindow: nearingDays,
      expiredItems: customAnalyzed
        .filter(a => a.hasExpired)
        .map(a => ({
          name: a.name,
          category: a.categoryName,
          unit: a.unit,
          totalStock: a.totalStock,
          expiredQty: a.expiredQty,
          usableStock: a.usableStock,
          suggestedReorder: a.suggestedReorder,
          expiredBatches: a.expiredBatches,
        })),
      nearingItems: customAnalyzed
        .filter(a => a.hasNearing)
        .map(a => ({
          name: a.name,
          category: a.categoryName,
          unit: a.unit,
          nearingQty: a.nearingQty,
          usableStock: a.usableStock,
          nearingBatches: a.nearingBatches,
        })),
    };
  }

  if (toolName === 'computeInventoryValuation') {
    const byCategory: Record<string, { itemCount: number; totalValue: number; usableValue: number; expiredValue: number }> = {};
    let totalValue = 0;
    let usableValue = 0;
    let expiredValue = 0;

    for (const a of analyzedItems) {
      const tv = a.totalStock * a.price;
      const uv = a.usableStock * a.price;
      const ev = a.expiredQty * a.price;
      totalValue += tv;
      usableValue += uv;
      expiredValue += ev;

      if (!byCategory[a.categoryName]) {
        byCategory[a.categoryName] = { itemCount: 0, totalValue: 0, usableValue: 0, expiredValue: 0 };
      }
      byCategory[a.categoryName].itemCount++;
      byCategory[a.categoryName].totalValue += tv;
      byCategory[a.categoryName].usableValue += uv;
      byCategory[a.categoryName].expiredValue += ev;
    }

    const topValueItems = [...analyzedItems]
      .map(a => ({ name: a.name, category: a.categoryName, usableStock: a.usableStock, unit: a.unit, price: a.price, usableValue: a.usableStock * a.price }))
      .sort((a, b) => b.usableValue - a.usableValue)
      .slice(0, 10);

    return {
      todayStr: formatDateVi(now),
      totalItems: analyzedItems.length,
      totalBookValueVND: Math.round(totalValue),
      usableSafeValueVND: Math.round(usableValue),
      expiredLossValueVND: Math.round(expiredValue),
      byCategory,
      topValueItems,
    };
  }

  return { error: `Unknown tool: ${toolName}` };
}

// Fallback & Offline Q&A Engine for Warehouse Assistant with High-Accuracy NLP Routing
export function generateExpertChatAnswer(
  question: string,
  items: any[] = [],
  transactions: any[] = [],
  holidays: any[] = [],
  categories: any[] = [],
  history: Array<{ role: 'user' | 'model'; text: string }> = []
): string {
  const q = (question || '').toLowerCase().trim();
  const cleanQ = removeVietnameseTones(q);
  const now = new Date();
  const sixtyDaysLater = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);

  const analyzedItems: ItemStockAnalysis[] = items.map(i =>
    computeItemStockAndExpiry(i, now, sixtyDaysLater, categories)
  );

  const parsedParams = extractHorizonAndSafetyFromQuestion(cleanQ);

  // Detect intent flags
  const isForecastIntent =
    cleanQ.includes('uoc tinh') ||
    cleanQ.includes('ngay het') ||
    cleanQ.includes('bao lau') ||
    cleanQ.includes('dung duoc') ||
    cleanQ.includes('du bao') ||
    cleanQ.includes('khi nao het') ||
    cleanQ.includes('con may ngay') ||
    parsedParams.horizonDays !== null;

  const isExpiryIntent =
    cleanQ.includes('het han') ||
    cleanQ.includes('can han') ||
    cleanQ.includes('qua han') ||
    cleanQ.includes('han dung') ||
    cleanQ.includes('han su dung') ||
    cleanQ.includes('fefo') ||
    /(^|\s)(han)(\s|$)/.test(cleanQ);

  const isComparisonIntent =
    cleanQ.includes('so sanh') || cleanQ.includes('khac nhau') || cleanQ.includes('nhieu hon') || cleanQ.includes('it hon');

  const isValuationIntent =
    cleanQ.includes('gia tri') || cleanQ.includes('tri gia') || cleanQ.includes('tong tien') || cleanQ.includes('thanh tien') || cleanQ.includes('ngan sach');

  const isInboundIntent =
    (cleanQ.includes('nhap kho') || cleanQ.includes('lich su nhap') || cleanQ.includes('moi nhap')) &&
    !cleanQ.includes('can nhap') &&
    !cleanQ.includes('de xuat nhap');

  // 1. PRIORITY CHECK: SPECIFIC ITEM MATCHING (with optional conversation follow-up fallback)
  let itemMatches = findMatchingItems(question, analyzedItems);

  const isPronounFollowUp =
    itemMatches.length === 0 &&
    history.length > 0 &&
    (isForecastIntent || isExpiryIntent || parsedParams.preferredWindow !== null || cleanQ.includes('nay') || cleanQ.includes('no') || cleanQ.includes('do') || cleanQ.includes('lo hang'));

  if (isPronounFollowUp) {
    for (let i = history.length - 1; i >= 0; i--) {
      const histMatches = findMatchingItems(history[i].text || '', analyzedItems);
      if (histMatches.length > 0) {
        itemMatches = histMatches;
        break;
      }
    }
  }

  const isGlobalListPhrase =
    cleanQ.includes('danh muc') ||
    cleanQ.includes('danh sach') ||
    cleanQ.includes('toan bo') ||
    cleanQ.includes('tat ca') ||
    cleanQ.includes('nhung vat tu nao') ||
    cleanQ.includes('vat tu nao') ||
    cleanQ.includes('mat hang nao') ||
    cleanQ.includes('ke hoach du tru');

  // If strong item match(es) found and NOT explicitly asking for a whole-warehouse list
  if (itemMatches.length > 0 && (!isGlobalListPhrase || isForecastIntent || isComparisonIntent)) {
    const topScore = itemMatches[0].score;
    const closeMatches = itemMatches
      .filter(m => m.score >= Math.max(20, topScore * (isComparisonIntent ? 0.45 : 0.72)))
      .slice(0, 6);

    if (closeMatches.length > 1 && (isComparisonIntent || topScore - closeMatches[1].score < 12)) {
      let ans = isComparisonIntent
        ? `### ⚖️ Bảng So sánh Chi tiết (${closeMatches.length} vật tư phù hợp)\n\n`
        : isForecastIntent
        ? `### ⏳ Ước tính Ngày Hết & Dự báo (${closeMatches.length} vật tư phù hợp)\n\n`
        : `### 🔍 Kết quả Tra cứu (${closeMatches.length} mặt hàng phù hợp)\n\n`;

      ans += `| STT | Tên vật tư | Tồn sổ sách | Tồn khả dụng | Tiêu hao/ngày (90d) | Tiêu hao/ngày (YTD) | Còn lại | Ngày hết dự kiến | Trạng thái |\n`;
      ans += `| :---: | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :--- |\n`;

      closeMatches.forEach((m, idx) => {
        const a = m.analysis;
        const c = computeItemConsumptionAndDepletion(a, transactions, holidays, now);
        let status = '🟢 An toàn';
        if (a.isFullyExpired) status = '🔴 Hết hạn toàn bộ';
        else if (a.hasExpired) status = `⚠️ Hết hạn ${a.expiredQty}`;
        else if (a.usableStock <= 0) status = '🔴 Cạn kho';
        else if (a.usableStock <= a.minStock) status = '🟡 Chạm định mức';

        ans += `| ${idx + 1} | **${a.name}** | ${a.totalStock} ${a.unit} | **${a.usableStock} ${a.unit}** | **${c.window90d.dailyUsage}** ${a.unit}/ngày | ${c.windowYTD.dailyUsage} ${a.unit}/ngày | ${c.primaryWorkingDaysRemaining !== null ? `**${c.primaryWorkingDaysRemaining} ngày**` : 'N/A'} | **${c.primaryDepletionDateStr}** | ${status} |\n`;
      });

      ans += `\n*Mẹo:* Bạn có thể hỏi cụ thể tên/kích thước (ví dụ: *"Dự trù ${closeMatches[0].analysis.name} cho 30 ngày tới với dự phòng 15%"*) để xem phương án nhập chi tiết.`;
      return ans;
    }

    const best = itemMatches[0].analysis;
    const consumption = computeItemConsumptionAndDepletion(best, transactions, holidays, now);
    return formatSingleItemExpertReport(best, consumption, transactions, holidays, isForecastIntent, isExpiryIntent, now, parsedParams);
  }

  // 2. KIỂM TRA HỎI TỔNG GIÁ TRỊ KHO
  if (isValuationIntent) {
    const val = executeInventoryTool('computeInventoryValuation', {}, items, transactions, holidays, categories);
    let ans = `### 💰 Báo cáo Tổng Giá trị Tài sản & Tồn kho (${val.todayStr})\n\n`;
    ans += `- **Tổng giá trị sổ sách (${val.totalItems} mặt hàng):** **${val.totalBookValueVND.toLocaleString('vi-VN')} đ**\n`;
    ans += `- **Giá trị tồn khả dụng an toàn (được phép dùng):** **${val.usableSafeValueVND.toLocaleString('vi-VN')} đ**\n`;
    if (val.expiredLossValueVND > 0) {
      ans += `- **Giá trị hàng đã quá hạn (cần niêm phong/xử lý):** **${val.expiredLossValueVND.toLocaleString('vi-VN')} đ**\n`;
    }
    ans += `\n| STT | Nhóm vật tư | Số mặt hàng | Giá trị khả dụng | Giá trị quá hạn |\n`;
    ans += `| :---: | :--- | :---: | :---: | :---: |\n`;
    Object.entries(val.byCategory as Record<string, any>).forEach(([cat, d], idx) => {
      ans += `| ${idx + 1} | **${cat}** | ${d.itemCount} | **${Math.round(d.usableValue).toLocaleString('vi-VN')} đ** | ${Math.round(d.expiredValue).toLocaleString('vi-VN')} đ |\n`;
    });
    return ans;
  }

  // 3. KIỂM TRA HỎI LỊCH SỬ NHẬP KHO
  if (isInboundIntent) {
    const res = executeInventoryTool('analyzeTransactionsAndDepartments', { type: 'IN', days: 90 }, items, transactions, holidays, categories);
    let ans = `### 📥 Lịch sử Nhập kho Gần đây (90 ngày qua)\n\n`;
    if (res.recentTransactions.length === 0) {
      ans += `Chưa ghi nhận giao dịch nhập kho nào trong 90 ngày qua.`;
      return ans;
    }
    ans += `| Ngày nhập | Tên vật tư | Số lượng | Đơn vị | Ghi chú / Phòng |\n`;
    ans += `| :---: | :--- | :---: | :---: | :--- |\n`;
    for (const t of res.recentTransactions) {
      ans += `| ${t.date} | **${t.itemName}** | **+${t.quantity}** | ${t.unit} | ${t.department} |\n`;
    }
    return ans;
  }

  // 4. KIỂM TRA HỎI VỀ DANH MỤC / NHÓM VẬT TƯ (bỏ qua nếu đang hỏi tiêu hao theo phòng ban cụ thể)
  const deptKeywordsEarly = ['clvt', 'ct', 'mri', 'cht', 'sieu am', 'dsa', 'noi soi', 'phong x quang', 'phong xquang'];
  const isSpecificDeptQuestion = deptKeywordsEarly.some(kw => cleanQ.includes(kw)) && !cleanQ.includes('danh muc') && !cleanQ.includes('nhom vat tu');

  const isAskingVPP = cleanQ.includes('van phong pham') || cleanQ.includes('vpp');
  const isAskingDuoc = cleanQ.includes('duoc') || cleanQ.includes('thuoc') || cleanQ.includes('dong y') || cleanQ.includes('tay y');
  const isAskingTieuHao = !isSpecificDeptQuestion && (cleanQ.includes('vat tu tieu hao') || cleanQ.includes('bom tiem') || (cleanQ.includes('tieu hao') && (cleanQ.includes('danh muc') || cleanQ.includes('nhom') || cleanQ.includes('danh sach'))));
  const isAskingHoaChat = cleanQ.includes('hoa chat') || cleanQ.includes('rua phim') || cleanQ.includes('can quang');
  const isAskingAllCategories =
    (cleanQ.includes('danh muc') || cleanQ.includes('danh sach')) &&
    (cleanQ.includes('cac nhom') || cleanQ.includes('toan bo') || cleanQ.includes('tat ca') ||
      (cleanQ.includes('hien co') && !isAskingVPP && !isAskingDuoc && !isAskingTieuHao && !isAskingHoaChat));

  if (!isSpecificDeptQuestion && (isAskingVPP || (isAskingDuoc && !cleanQ.includes('thuoc can quang')) || isAskingTieuHao || isAskingHoaChat)) {
    const selectedTitles: string[] = [];
    const filters: Array<(a: ItemStockAnalysis) => boolean> = [];

    if (isAskingVPP) {
      selectedTitles.push('Văn phòng phẩm (VPP)');
      filters.push((a: ItemStockAnalysis) => {
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
        if (cat.includes('van phong pham') || cat.includes('vpp')) return true;
        const vppKeywords = [
          'giay in', 'giay a4', 'giay ve sinh', 'but bi', 'ruot but', 'but da', 'but chi', 'but long',
          'dan ghim', 'kep giay', 'bam kim', 'so tay', 'so ghi chep', 'so theo doi', 'so sach',
          'muc in', 'bia cong', 'bia la', 'bia ho so', 'bang dinh'
        ];
        return vppKeywords.some(kw => name.includes(kw));
      });
    }

    if (isAskingDuoc && !cleanQ.includes('thuoc can quang')) {
      selectedTitles.push('Dược (Đông y, Tây y) & Thuốc');
      filters.push((a: ItemStockAnalysis) => {
        const cat = removeVietnameseTones(a.categoryName);
        const name = removeVietnameseTones(a.name);
        if (cat.includes('duoc') || cat.includes('thuoc') || cat.includes('dong y') || cat.includes('tay y')) return true;
        const drugKeywords = ['pdsolone', 'vinsolon', 'sodium', 'chloride', 'dimedrol', 'adrenalin', 'lidocain', 'dich truyen'];
        return drugKeywords.some(kw => name.includes(kw));
      });
    }

    if (isAskingHoaChat) {
      selectedTitles.push('Hóa chất & Thuốc cản quang');
      filters.push((a: ItemStockAnalysis) => {
        const cat = removeVietnameseTones(a.categoryName);
        const name = removeVietnameseTones(a.name);
        if (cat.includes('hoa chat') || cat.includes('can quang')) return true;
        const chemicalKeywords = ['omnipaque', 'barit', 'ultravist', 'xenetix', 'telebrix', 'iopromide', 'iohexol', 'gel sieu am', 'rua phim', 'can quang'];
        return chemicalKeywords.some(kw => name.includes(kw));
      });
    }

    if (isAskingTieuHao) {
      selectedTitles.push(cleanQ.includes('bom tiem') && !cleanQ.includes('tieu hao') ? 'Bơm tiêm & Dây nối' : 'Vật tư tiêu hao');
      filters.push((a: ItemStockAnalysis) => {
        const cat = removeVietnameseTones(a.categoryName);
        const name = removeVietnameseTones(a.name);
        if (cleanQ.includes('bom tiem') && !cleanQ.includes('tieu hao')) {
          return name.includes('bom tiem') || name.includes('kim') || name.includes('day noi');
        }
        if (cat.includes('tieu hao')) return true;
        const consumableKeywords = ['tui phim', 'phim x', 'phim cat lop', 'day noi', 'bom tiem', 'kim luon', 'kim lay', 'gang tay', 'bang gac'];
        return consumableKeywords.some(kw => name.includes(kw));
      });
    }

    const categoryTitle = selectedTitles.join(' & ');
    const matched = analyzedItems.filter(a => filters.some(fn => fn(a)));

    if (matched.length > 0) {
      let ans = `### 📁 Danh mục Vật tư: **${categoryTitle}**\n\n`;
      ans += `Hiện tại trong kho đang quản lý **${matched.length}** mặt hàng phù hợp:\n\n`;
      ans += `| STT | Tên vật tư | Tồn sổ sách | Tồn khả dụng | Tiêu hao/ngày | Ngày hết dự kiến | Trạng thái |\n`;
      ans += `| :---: | :--- | :---: | :---: | :---: | :---: | :--- |\n`;

      matched.forEach((a, idx) => {
        const c = computeItemConsumptionAndDepletion(a, transactions, holidays, now);
        let status = '🟢 Đủ hàng';
        if (a.hasExpired) status = `🔴 Đã hết hạn (${a.expiredQty} ${a.unit})`;
        else if (a.usableStock <= 0) status = '🔴 Cạn kho';
        else if (a.usableStock <= a.minStock) status = '🟡 Chạm định mức';

        ans += `| ${idx + 1} | **${a.name}** | ${a.totalStock} ${a.unit} | **${a.usableStock} ${a.unit}** | ${c.primaryDailyUsage} ${a.unit}/ngày | **${c.primaryDepletionDateStr}** | ${status} |\n`;
      });

      const outCount = matched.filter(a => a.usableStock <= 0).length;
      const lowCount = matched.filter(a => a.usableStock > 0 && a.usableStock <= a.minStock).length;
      const expCount = matched.filter(a => a.hasExpired).length;
      const totalUsableUnits = Math.round(matched.reduce((acc, a) => acc + a.usableStock, 0) * 10) / 10;

      ans += `\n**📊 Tóm tắt:** Tổng tồn khả dụng an toàn **${totalUsableUnits}** đơn vị · **${matched.length - outCount - lowCount}** an toàn · **${lowCount}** chạm định mức · **${outCount}** cạn kho${expCount > 0 ? ` · **${expCount}** có lô quá hạn` : ''}.`;
      return ans;
    }
  }

  // 5. TỔNG QUAN DANH SÁCH CÁC NHÓM VẬT TƯ
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

    return ans;
  }

  // 6. DỰ TRÙ / MUA SẮM BỔ SUNG
  if (cleanQ.includes('du tru') || cleanQ.includes('nhap hang') || cleanQ.includes('can mua') || cleanQ.includes('ke hoach nhap') || cleanQ.includes('mua sam') || cleanQ.includes('bo sung')) {
    const deficitItems = analyzedItems.filter(a => a.isDeficit);

    let ans = `### 📝 Khuyến nghị Kế hoạch Dự trù & Mua sắm Bổ sung Vật tư\n\n`;
    if (deficitItems.length === 0) {
      ans += `✅ Toàn bộ **${items.length}** mặt hàng hiện đều có số lượng tồn khả dụng an toàn trên mức tối thiểu và không có lô hàng nào quá hạn. Chưa cần lập phiếu dự trù khẩn.`;
      return ans;
    }

    ans += `Dựa trên dữ liệu tồn kho khả dụng thực tế và tình trạng hạn sử dụng lô hàng, **đề xuất mua sắm bổ sung các mặt hàng sau**:\n\n`;
    ans += `| STT | Tên vật tư | Nhóm | Tồn sổ sách | Hết hạn | Tồn khả dụng | Định mức Min | Đề xuất mua bổ sung | Đơn vị | Đơn giá | Ước tính | Lý do dự trù |\n`;
    ans += `| :---: | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :--- |\n`;

    let totalEst = 0;
    const sortedDeficit = [...deficitItems].sort((a, b) => {
      if (a.hasExpired && !b.hasExpired) return -1;
      if (!a.hasExpired && b.hasExpired) return 1;
      return a.usableStock - b.usableStock;
    });

    sortedDeficit.forEach((a, idx) => {
      const est = a.suggestedReorder * a.price;
      totalEst += est;

      let reason = '🟡 Chạm định mức an toàn';
      if (a.isFullyExpired) reason = `🚨 Hết hạn 100% (${a.expiredQty} ${a.unit}) - Tồn khả dụng = 0`;
      else if (a.hasExpired) reason = `⚠️ Hết hạn ${a.expiredQty} ${a.unit} - Thiếu hụt an toàn`;
      else if (a.usableStock <= 0) reason = '🔴 Cạn kho hoàn toàn (Tồn = 0)';

      ans += `| ${idx + 1} | **${a.name}** | ${a.categoryName} | ${a.totalStock} | ${a.expiredQty > 0 ? `**${a.expiredQty}**` : '0'} | **${a.usableStock}** | ${a.minStock} | **+${a.suggestedReorder}** | ${a.unit} | ${a.price ? a.price.toLocaleString('vi-VN') + ' đ' : '0 đ'} | ${est ? est.toLocaleString('vi-VN') + ' đ' : '-'} | ${reason} |\n`;
    });

    if (totalEst > 0) {
      ans += `\n💰 **Tổng dự toán kinh phí mua sắm bổ sung:** **${totalEst.toLocaleString('vi-VN')} đ**.\n`;
    }
    return ans;
  }

  // 7. HẾT HÀNG / SẮP HẾT / ĐỊNH MỨC TỐI THIỂU
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
      ans += `✅ Hiện tại không có mặt hàng nào bị hết tồn kho khả dụng hoàn toàn.\n\n`;
    }

    if (low.length > 0) {
      ans += `⚠️ **Vật tư SẮP HẾT (Tồn khả dụng <= Định mức tối thiểu) (${low.length} mặt hàng):**\n\n`;
      ans += `| STT | Tên vật tư | Nhóm | Tồn khả dụng | Định mức Min | Đơn vị | Đề xuất mua bổ sung |\n`;
      ans += `| :---: | :--- | :---: | :---: | :---: | :---: | :---: |\n`;
      low.forEach((a, idx) => {
        ans += `| ${idx + 1} | **${a.name}** | ${a.categoryName} | **${a.usableStock}** | ${a.minStock} | ${a.unit} | **+${a.suggestedReorder} ${a.unit}** |\n`;
      });
      ans += `\n`;
    }
    return ans;
  }

  // 8. HẠN SỬ DỤNG / QUÁ HẠN / CẬN HẠN (FEFO)
  if (isExpiryIntent) {
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
      ans += `\n`;
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

  // 9. DỰ BÁO NGÀY HẾT CHUNG TOÀN KHO
  if (isForecastIntent) {
    const itemsWithConsumption = analyzedItems
      .map(a => ({ a, c: computeItemConsumptionAndDepletion(a, transactions, holidays, now) }))
      .filter(x => x.c.primaryDailyUsage > 0)
      .sort((x, y) => (x.c.primaryWorkingDaysRemaining ?? 9999) - (y.c.primaryWorkingDaysRemaining ?? 9999))
      .slice(0, 12);

    let ans = `### ⏳ Dự báo Ngày Hết các Vật tư Đang Tiêu Hao Nhanh Nhất\n\n`;
    if (itemsWithConsumption.length === 0) {
      ans += `Chưa có dữ liệu xuất kho (${transactions.length} giao dịch) để tính tốc độ tiêu hao hàng ngày.`;
      return ans;
    }
    ans += `| STT | Tên vật tư | Tồn khả dụng | Tiêu hao/ngày lv | Còn lại (ngày lv) | Ngày hết dự kiến |\n`;
    ans += `| :---: | :--- | :---: | :---: | :---: | :---: |\n`;
    itemsWithConsumption.forEach(({ a, c }, idx) => {
      ans += `| ${idx + 1} | **${a.name}** | **${a.usableStock} ${a.unit}** | ${c.primaryDailyUsage} ${a.unit}/ngày | ${c.primaryWorkingDaysRemaining !== null ? `**${c.primaryWorkingDaysRemaining} ngày**` : 'N/A'} | **${c.primaryDepletionDateStr}** |\n`;
    });
    return ans;
  }

  // 10. TIÊU HAO / XUẤT KHO / PHÒNG MÁY (Hỗ trợ lọc theo từng phòng cụ thể như Phòng CLVT, X-quang, Siêu âm)
  const deptKeywords = ['clvt', 'ct', 'mri', 'cht', 'sieu am', 'x quang', 'xquang', 'dsa', 'noi soi'];
  const matchedDeptKeyword = deptKeywords.find(kw => cleanQ.includes(kw));
  const isDeptOrConsumption =
    Boolean(matchedDeptKeyword) ||
    cleanQ.includes('tieu hao') || cleanQ.includes('xuat kho') || cleanQ.includes('phong may') ||
    cleanQ.includes('phong ban') || (cleanQ.includes('phong') && !cleanQ.includes('van phong'));

  if (isDeptOrConsumption) {
    const res = executeInventoryTool(
      'analyzeTransactionsAndDepartments',
      { type: 'OUT', days: 365, department: matchedDeptKeyword || '' },
      items,
      transactions,
      holidays,
      categories
    );

    let ans = matchedDeptKeyword
      ? `### 📊 Thống kê Tiêu hao theo Khu vực / Phòng máy khớp "${matchedDeptKeyword.toUpperCase()}"\n\n`
      : `### 📊 Thống kê Tiêu hao & Xuất kho Gần đây\n\n`;

    if (res.topItems.length > 0) {
      ans += `**Top vật tư được xuất sử dụng nhiều nhất:**\n\n`;
      ans += `| STT | Tên vật tư | Tổng số lượng xuất | Đơn vị | Số lần xuất |\n`;
      ans += `| :---: | :--- | :---: | :---: | :---: |\n`;
      res.topItems.slice(0, 8).forEach((it: any, idx: number) => {
        ans += `| ${idx + 1} | **${it.name}** | **${it.totalQty}** | ${it.unit} | ${it.txCount} lần |\n`;
      });
      ans += `\n`;
    } else {
      ans += `- Chưa ghi nhận lịch sử xuất kho phù hợp trong 365 ngày qua.\n\n`;
    }

    const depts = Object.entries(res.departmentBreakdown as Record<string, number>).sort((a, b) => b[1] - a[1]);
    if (depts.length > 0) {
      ans += `**Phân bổ vật tư theo các phòng ban / phòng máy:**\n\n`;
      ans += `| STT | Phòng ban / Modality | Tổng số lượng cấp | Đơn vị |\n`;
      ans += `| :---: | :--- | :---: | :---: |\n`;
      depts.forEach(([d, qVal], idx) => {
        ans += `| ${idx + 1} | **${d}** | **${qVal}** | đơn vị |\n`;
      });
      ans += `\n`;
    }
    return ans;
  }

  // 11. TRẢ LỜI MẶC ĐỊNH
  return `### 💡 Trợ lý AI Khoa Chẩn đoán Hình ảnh\n\n` +
    `Tôi chưa tìm thấy vật tư hoặc chủ đề khớp rõ ràng với câu hỏi của bạn (hiện hệ thống đang quản lý **${items.length}** vật tư và **${transactions.length}** giao dịch).\n\n` +
    `Bạn có thể thử các câu hỏi tự nhiên như:\n` +
    `- *"Ước tính ngày hết của Phim X-quang 8x10"*\n` +
    `- *"Dự trù Phim X-quang 10x8 cho 30 ngày tới với dự phòng 20%"*\n` +
    `- *"So sánh Phim X-quang 10x8 và 10x12"*\n` +
    `- *"Tổng giá trị tồn kho hiện tại là bao nhiêu?"*\n` +
    `- *"Phòng CLVT tiêu hao những vật tư nào?"*\n` +
    `- *"Vật tư nào đã hết hạn và cần mua sắm bổ sung?"*`;
}


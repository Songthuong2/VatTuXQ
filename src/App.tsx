import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import * as XLSX from 'xlsx';
// @ts-ignore
import html2pdf from 'html2pdf.js';
import { 
  LayoutDashboard, 
  Package, 
  ArrowLeftRight, 
  FileText, 
  BrainCircuit, 
  Plus, 
  Download, 
  AlertTriangle,
  LogOut,
  User,
  Search,
  Filter,
  ChevronRight,
  Menu,
  X,
  Loader2,
  Trash2,
  TrendingUp,
  TrendingDown,
  Clock,
  CheckCircle2,
  AlertCircle,
  ArrowUpRight,
  ArrowDownRight,
  Calendar,
  DollarSign,
  ClipboardCheck,
  CalendarRange,
  Pencil,
  Sun,
  Moon,
  RefreshCw,
  ClipboardList,
  PieChart as PieChartIcon,
  FileSpreadsheet,
  Users,
  Layers,
  ChevronDown,
  ChevronUp,
  Tag,
  Sparkles,
  Info,
  ChevronLeft,
  Send,
  MessageSquare,
  Copy,
  Check,
  Bot,
  Shield,
  Percent,
  Printer
} from 'lucide-react';
import { GoogleSheetsHub } from './GoogleSheetsHub';
import { UsersManager, StaffUser } from './UsersManager';
import { 
  downloadStandardDiagnosticImagingTemplate, 
  exportLiveDatabaseToGoogleSheets 
} from './googleSheetsService';
import { 
  auth, 
  db 
} from './firebase';
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut,
  User as FirebaseUser
} from 'firebase/auth';
import { 
  collection, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  serverTimestamp, 
  query, 
  orderBy,
  getDocs,
  where
} from 'firebase/firestore';
import { analyzeInventory, askAiAssistant } from './geminiService';
import { parseDateFlexible } from './expertAnalysis';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { toast, Toaster } from 'sonner';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
  LineChart,
  Line,
  AreaChart,
  Area,
  Legend,
  LabelList
} from 'recharts';

// --- Types ---
interface Category { 
  id: string; 
  name: string; 
  code?: string;
  description?: string;
  status?: string;
}
interface Department { 
  id: string; 
  name: string; 
  code?: string;
  deviceType?: string;
  manager?: string;
  location?: string;
  note?: string;
}
interface ItemBatch {
  id: string;
  batchNumber: string; // Số lô (vd: LO-2026-01)
  quantity: number; // Số lượng tồn của lô này
  expiryDate: string; // Hạn dùng YYYY-MM-DD
  importDate?: string; // Ngày nhập kho YYYY-MM-DD
  note?: string; // Ghi chú lô
}

interface Item { 
  id: string; 
  name: string; 
  code?: string;
  categoryId: string; 
  departmentId?: string;
  unit: string; 
  specification?: string;
  manufacturer?: string;
  minStock: number; 
  currentStock: number; 
  expiryDate?: string;
  price?: number;
  note?: string;
  batches?: ItemBatch[];
  createdAt?: any;
}
interface Holiday {
  id: string;
  date: string;
  note?: string;
}
interface Transaction {
  id: string;
  code?: string;
  itemId: string;
  type: 'IN' | 'OUT' | 'TRANSFER' | 'AUDIT';
  fromDeptId?: string;
  toDeptId?: string;
  quantity: number;
  unitPrice?: number;
  totalAmount?: number;
  batchId?: string;
  batchNumber?: string;
  batchExpiry?: string;
  performer?: string;
  timestamp: any;
  note?: string;
}

interface AiAnalysis {
  summary: string;
  alerts: { type: 'danger' | 'warning' | 'info'; message: string; item?: string }[];
  recommendations: { action: string; priority: 'high' | 'medium' | 'low'; reason: string }[];
  anomalies: { description: string; severity: 'high' | 'medium' | 'low' }[];
  detailedAnalysis: string;
}

// --- Utils ---
enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

const handleFirestoreError = (error: unknown, operationType: OperationType, path: string | null) => {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

const formatDate = (dateStr: string | undefined) => {
  if (!dateStr) return '-';
  // Input is usually yyyy-mm-dd from <input type="date">
  const parts = dateStr.split('-');
  if (parts.length === 3 && parts[0].length === 4) {
    const [year, month, day] = parts;
    return `${day}/${month}/${year}`;
  }
  // If it's already dd/mm/yyyy, return as is
  if (dateStr.match(/^\d{2}\/\d{2}\/\d{4}$/)) return dateStr;
  return dateStr;
};

const formatQty = (num: number | string | undefined) => {
  if (num === undefined || num === null) return '0';
  const n = typeof num === 'string' ? parseFloat(num) : num;
  if (isNaN(n)) return '0';
  // Use toFixed(10) to fix floating point precision issues, then Number() to remove trailing zeros
  return Number(n.toFixed(10)).toString();
};

const removeVietnameseTones = (str: string): string => {
  if (!str) return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
};

const matchesSearchQuery = (text: string | undefined | null, query: string): boolean => {
  if (!query || !query.trim()) return true;
  if (!text) return false;
  const q = query.trim().toLowerCase();
  const t = text.toLowerCase();
  if (t.includes(q)) return true;
  return removeVietnameseTones(t).includes(removeVietnameseTones(q));
};

interface MobileQuickSearchBarProps {
  searchTerm: string;
  onSearchChange: (value: string) => void;
  placeholder?: string;
  totalCount?: number;
  filteredCount?: number;
  darkMode?: boolean;
}

function MobileQuickSearchBar({
  searchTerm,
  onSearchChange,
  placeholder = 'Tìm nhanh vật tư...',
  totalCount,
  filteredCount,
  darkMode
}: MobileQuickSearchBarProps) {
  return (
    <div 
      className={`md:hidden fixed bottom-16 left-0 right-0 z-30 px-3 py-2 border-t transition-all backdrop-blur-md ${
        darkMode 
          ? 'bg-slate-900/95 border-slate-800 text-white shadow-[0_-4px_20px_rgba(0,0,0,0.4)]' 
          : 'bg-white/95 border-slate-200 text-slate-900 shadow-[0_-4px_20px_rgba(0,0,0,0.08)]'
      }`}
    >
      <div className="flex items-center gap-2 max-w-lg mx-auto">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={placeholder}
            className={`w-full pl-9 pr-8 py-2 text-xs sm:text-sm font-medium rounded-xl border transition-all outline-none focus:ring-2 focus:ring-blue-500 ${
              darkMode
                ? 'bg-slate-800 border-slate-700 text-white placeholder-slate-500'
                : 'bg-slate-50 border-slate-300 text-slate-900 placeholder-slate-400'
            }`}
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => onSearchChange('')}
              className={`absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-full transition-colors ${
                darkMode ? 'text-slate-400 hover:text-white hover:bg-slate-700' : 'text-slate-400 hover:text-slate-700 hover:bg-slate-200'
              }`}
              title="Xóa tìm kiếm"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {totalCount !== undefined && filteredCount !== undefined && (
          <div 
            className={`shrink-0 px-2 py-1.5 rounded-lg text-[11px] font-mono font-bold flex items-center gap-1 ${
              searchTerm 
                ? (darkMode ? 'bg-blue-900/40 text-blue-300 border border-blue-800/60' : 'bg-blue-50 text-blue-700 border border-blue-200')
                : (darkMode ? 'bg-slate-800 text-slate-400 border border-slate-700' : 'bg-slate-100 text-slate-500 border border-slate-200')
            }`}
            title="Số vật tư hiển thị / Tổng số vật tư"
          >
            <span>{filteredCount}/{totalCount}</span>
          </div>
        )}
      </div>
    </div>
  );
}


const normalizeDate = (dateVal: any) => {
  if (!dateVal) return '';
  if (typeof dateVal === 'number') {
    // Excel serial date
    const date = new Date((dateVal - 25569) * 86400 * 1000);
    return date.toISOString().split('T')[0];
  }
  const dateStr = String(dateVal).trim();
  // Handle dd/mm/yyyy
  const ddmm_yyyy = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (ddmm_yyyy) {
    const [_, d, m, y] = ddmm_yyyy;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  // Handle yyyy-mm-dd
  if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) return dateStr;
  return dateStr;
};

const getLocalFormattedDate = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const getWorkingDays = (startDate: Date, endDate: Date, holidays: Holiday[]) => {
  let count = 0;
  const curDate = new Date(startDate.getTime());
  // Normalize to start of day
  curDate.setHours(0, 0, 0, 0);
  const end = new Date(endDate.getTime());
  end.setHours(0, 0, 0, 0);

  while (curDate <= end) {
    const dateStr = getLocalFormattedDate(curDate);
    const isHoliday = holidays.some(h => h.date === dateStr);
    if (!isHoliday) {
      count++;
    }
    curDate.setDate(curDate.getDate() + 1);
  }
  return count;
};

interface WorkingDaysCalculationResult {
  actualWorkingDays: number;
  actualCalendarDays: number;
  actualHolidaysDeducted: number;
  fullRangeWorkingDays: number;
  fullRangeCalendarDays: number;
  fullRangeHolidaysCount: number;
  isFutureEnd: boolean;
  isFutureStart: boolean;
  todayStr: string;
}

const calculateWorkingDaysWithFutureCutoff = (startDateStr: string, endDateStr: string, holidays: Holiday[]): WorkingDaysCalculationResult => {
  const now = new Date();
  const todayStr = getLocalFormattedDate(now);
  const today = new Date(todayStr + 'T00:00:00');
  const start = new Date(startDateStr + 'T00:00:00');
  const end = new Date(endDateStr + 'T00:00:00');

  const isFutureEnd = end.getTime() > today.getTime();
  const isFutureStart = start.getTime() > today.getTime();

  // 1. Tính toán toàn kỳ đã chọn (từ start đến end)
  let fullRangeCalendarDays = 0;
  let fullRangeWorkingDays = 0;
  let fullRangeHolidaysCount = 0;
  if (start.getTime() <= end.getTime()) {
    const cur = new Date(start.getTime());
    while (cur.getTime() <= end.getTime()) {
      fullRangeCalendarDays++;
      const curStr = getLocalFormattedDate(cur);
      if (holidays.some(h => h.date === curStr)) {
        fullRangeHolidaysCount++;
      } else {
        fullRangeWorkingDays++;
      }
      cur.setDate(cur.getDate() + 1);
    }
  }

  // 2. Tính số ngày làm việc thực tế: Nếu mốc kết thúc ở tương lai, tính từ ngày bắt đầu tới hiện tại (today) trừ ngày nghỉ
  let actualCalendarDays = 0;
  let actualWorkingDays = 0;
  let actualHolidaysDeducted = 0;

  if (isFutureStart) {
    // Nếu cả khoảng thời gian nằm hoàn toàn ở tương lai (chưa bắt đầu)
    actualCalendarDays = 0;
    actualWorkingDays = 0;
    actualHolidaysDeducted = 0;
  } else {
    const effectiveEnd = isFutureEnd ? today : end;
    if (start.getTime() <= effectiveEnd.getTime()) {
      const cur = new Date(start.getTime());
      while (cur.getTime() <= effectiveEnd.getTime()) {
        actualCalendarDays++;
        const curStr = getLocalFormattedDate(cur);
        if (holidays.some(h => h.date === curStr)) {
          actualHolidaysDeducted++;
        } else {
          actualWorkingDays++;
        }
        cur.setDate(cur.getDate() + 1);
      }
    }
  }

  return {
    actualWorkingDays,
    actualCalendarDays,
    actualHolidaysDeducted,
    fullRangeWorkingDays,
    fullRangeCalendarDays,
    fullRangeHolidaysCount,
    isFutureEnd,
    isFutureStart,
    todayStr
  };
};

// Reusable Markdown Table & Typography components with clear visible grid borders
const createAiMarkdownComponents = (_isDark: boolean) => ({
  table: ({ node, ...props }: any) => (
    <div className="my-4 overflow-x-auto rounded-xl border-2 border-slate-300 dark:border-slate-600 shadow-sm bg-white dark:bg-slate-900">
      <table className="w-full text-left text-xs border-collapse border border-slate-300 dark:border-slate-600 min-w-[650px]" {...props} />
    </div>
  ),
  thead: ({ node, ...props }: any) => (
    <thead className="bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-bold border-b-2 border-slate-300 dark:border-slate-600" {...props} />
  ),
  th: ({ node, ...props }: any) => (
    <th className="px-3.5 py-2.5 font-bold uppercase tracking-wider text-[11px] whitespace-nowrap text-slate-800 dark:text-slate-100 border border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-800/90" {...props} />
  ),
  tbody: ({ node, ...props }: any) => (
    <tbody className="bg-white dark:bg-slate-900" {...props} />
  ),
  tr: ({ node, ...props }: any) => (
    <tr className="hover:bg-blue-50/70 dark:hover:bg-slate-800/80 transition-colors odd:bg-white even:bg-slate-50 dark:odd:bg-slate-900 dark:even:bg-slate-800/50" {...props} />
  ),
  td: ({ node, ...props }: any) => (
    <td className="px-3.5 py-2.5 text-slate-800 dark:text-slate-200 text-xs border border-slate-300 dark:border-slate-600 whitespace-nowrap" {...props} />
  ),
  p: ({ node, ...props }: any) => (
    <p className="my-2 leading-relaxed" {...props} />
  ),
  ul: ({ node, ...props }: any) => (
    <ul className="my-2.5 space-y-1 pl-5 list-disc" {...props} />
  ),
  ol: ({ node, ...props }: any) => (
    <ol className="my-2.5 space-y-1 pl-5 list-decimal" {...props} />
  ),
  li: ({ node, ...props }: any) => (
    <li className="leading-relaxed" {...props} />
  ),
  h1: ({ node, ...props }: any) => (
    <h1 className="text-lg font-black text-slate-900 dark:text-white mt-4 mb-2 pb-1 border-b border-slate-200 dark:border-slate-700" {...props} />
  ),
  h2: ({ node, ...props }: any) => (
    <h2 className="text-base font-bold text-slate-900 dark:text-white mt-3 mb-2" {...props} />
  ),
  h3: ({ node, ...props }: any) => (
    <h3 className="text-sm font-bold text-slate-900 dark:text-white mt-3 mb-1.5 flex items-center gap-1.5" {...props} />
  ),
  strong: ({ node, ...props }: any) => (
    <strong className="font-bold text-slate-900 dark:text-white" {...props} />
  ),
  blockquote: ({ node, ...props }: any) => (
    <blockquote className="my-3 pl-3.5 border-l-4 border-blue-500 bg-blue-50/50 dark:bg-slate-800/50 py-2 pr-3 rounded-r-lg italic text-slate-700 dark:text-slate-300 text-xs" {...props} />
  ),
});

// Batch Management Helpers
const getItemBatches = (item: Item): ItemBatch[] => {
  if (item.batches && Array.isArray(item.batches) && item.batches.length > 0) {
    return item.batches;
  }
  if (item.currentStock > 0 || (item.expiryDate && item.expiryDate.trim().length > 0)) {
    return [{
      id: 'default',
      batchNumber: 'Lô mặc định',
      quantity: Number(item.currentStock) || 0,
      expiryDate: item.expiryDate || '',
      note: 'Lô ban đầu'
    }];
  }
  return [];
};

const syncBatchesToItem = (batches: ItemBatch[]): { currentStock: number; expiryDate: string } => {
  const currentStock = Number(batches.reduce((sum, b) => sum + (Number(b.quantity) || 0), 0).toFixed(10));
  // Earliest expiry date among batches with positive quantity
  const activeBatchesWithExpiry = batches
    .filter(b => (Number(b.quantity) || 0) > 0 && b.expiryDate && b.expiryDate.trim().length > 0)
    .sort((a, b) => a.expiryDate.localeCompare(b.expiryDate));

  let expiryDate = '';
  if (activeBatchesWithExpiry.length > 0) {
    expiryDate = activeBatchesWithExpiry[0].expiryDate;
  } else {
    const anyBatchWithExpiry = batches
      .filter(b => b.expiryDate && b.expiryDate.trim().length > 0)
      .sort((a, b) => a.expiryDate.localeCompare(b.expiryDate));
    if (anyBatchWithExpiry.length > 0) {
      expiryDate = anyBatchWithExpiry[0].expiryDate;
    }
  }

  return { currentStock, expiryDate };
};

// --- Components ---
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean, error: any }> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      let errorMessage = "Đã có lỗi xảy ra.";
      try {
        const parsedError = JSON.parse(this.state.error.message);
        errorMessage = `Lỗi hệ thống: ${parsedError.error} (Operation: ${parsedError.operationType})`;
      } catch (e) {
        errorMessage = this.state.error.message || "Đã có lỗi xảy ra.";
      }

      return (
        <div className="h-screen w-screen flex flex-col items-center justify-center p-4 bg-slate-50">
          <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center border border-red-100">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <AlertTriangle className="w-8 h-8 text-red-600" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900 mb-4">Rất tiếc!</h2>
            <p className="text-slate-600 mb-8">{errorMessage}</p>
            <button 
              onClick={() => window.location.reload()}
              className="w-full py-3 px-6 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-all shadow-lg shadow-blue-100"
            >
              Tải lại trang
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

const formatTimestamp = (timestamp: any) => {
  if (!timestamp) return '-';
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
};

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isSidebarOpen, setSidebarOpen] = useState(false);
  const [theme, setTheme] = useState<'medical' | 'light' | 'dark'>(() => {
    const saved = localStorage.getItem('theme_mode');
    if (saved === 'medical' || saved === 'light' || saved === 'dark') {
      return saved as 'medical' | 'light' | 'dark';
    }
    const legacy = localStorage.getItem('theme');
    if (legacy === 'dark') return 'dark';
    if (legacy === 'light') return 'light';
    return 'medical';
  });
  const [showThemeMenu, setShowThemeMenu] = useState(false);
  const themeMenuRef = useRef<HTMLDivElement>(null);

  const darkMode = theme === 'dark';
  const isMedical = theme === 'medical';
  const setDarkMode = (val: boolean) => {
    setTheme(val ? 'dark' : 'medical');
  };
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  // Data States
  const [categories, setCategories] = useState<Category[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [usersList, setUsersList] = useState<StaffUser[]>([]);
  const [usersLoaded, setUsersLoaded] = useState(false);
  const autoRegisteredRef = useRef<string | null>(null);
  const [globalSearch, setGlobalSearch] = useState('');
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [showMobileSearch, setShowMobileSearch] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Real-time live clock for header banner
  const [liveClock, setLiveClock] = useState(() => {
    const d = new Date();
    return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  });

  useEffect(() => {
    const timer = setInterval(() => {
      const d = new Date();
      setLiveClock(d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Live alert stats for hospital operations banner
  const bannerAlerts = useMemo(() => {
    let expired = 0;
    let lowStock = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    items.forEach(item => {
      if (item.currentStock <= (item.minStock || 0)) {
        lowStock++;
      }
      if (item.expiryDate) {
        const parts = item.expiryDate.split(/[-/]/);
        let exp: Date | null = null;
        if (parts.length === 3) {
          if (parts[0].length === 4) {
            exp = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
          } else {
            exp = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
          }
        } else {
          const parsed = new Date(item.expiryDate);
          if (!isNaN(parsed.getTime())) exp = parsed;
        }
        if (exp && exp < today) {
          expired++;
        }
      }
    });
    return { expired, lowStock };
  }, [items]);

  // Keyboard shortcut Ctrl+B / Cmd+B or Escape to toggle / close sidebar, Ctrl+K to search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSidebarOpen(false);
        setShowSearchResults(false);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
        setShowSearchResults(true);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        const target = e.target as HTMLElement;
        if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
          return;
        }
        e.preventDefault();
        setSidebarOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowSearchResults(false);
      }
      if (themeMenuRef.current && !themeMenuRef.current.contains(event.target as Node)) {
        setShowThemeMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);
  
  // AI States
  const [aiAnalysis, setAiAnalysis] = useState<AiAnalysis | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // --- Auth ---
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (!u) {
        setUsersLoaded(false);
        autoRegisteredRef.current = null;
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    document.documentElement.classList.remove('dark', 'theme-medical');
    document.documentElement.removeAttribute('data-theme');

    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
      document.documentElement.setAttribute('data-theme', 'dark');
    } else if (theme === 'medical') {
      document.documentElement.classList.add('theme-medical');
      document.documentElement.setAttribute('data-theme', 'medical');
    } else {
      document.documentElement.setAttribute('data-theme', 'light');
    }
    localStorage.setItem('theme_mode', theme);
    localStorage.setItem('theme', theme === 'dark' ? 'dark' : 'light');
  }, [theme]);

  const handleResetData = async () => {
    if (user?.email !== 'manhha2@gmail.com') {
      toast.error("Bạn không có quyền thực hiện thao tác này.");
      return;
    }
    setIsResetting(true);
    try {
      const collectionsToReset = ['categories', 'departments', 'items', 'transactions', 'holidays', 'users'];
      for (const colName of collectionsToReset) {
        const snap = await getDocs(collection(db, colName));
        const deletePromises = snap.docs.map(d => deleteDoc(doc(db, colName, d.id)));
        await Promise.all(deletePromises);
      }
      toast.success("Đã reset toàn bộ dữ liệu thành công!");
      setShowResetConfirm(false);
      // Refresh the page to clear any local state if necessary, 
      // though onSnapshot should handle it.
    } catch (error) {
      console.error("Reset Error:", error);
      toast.error("Có lỗi xảy ra khi reset dữ liệu.");
      handleFirestoreError(error, OperationType.DELETE, "bulk-reset");
    } finally {
      setIsResetting(false);
    }
  };

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error: any) {
      console.error("Login Error:", error);
      if (error.code === 'auth/popup-blocked') {
        toast.error("Trình duyệt đã chặn cửa sổ đăng nhập. Vui lòng cho phép hiện cửa sổ bật lên (popup) cho trang web này và thử lại.", {
          duration: 6000,
        });
      } else {
        toast.error("Lỗi đăng nhập: " + (error.message || "Đã có lỗi xảy ra."));
      }
    }
  };

  const handleLogout = () => signOut(auth);

  // Kiểm tra quyền truy cập (Phê duyệt tài khoản Google)
  const isRootAdmin = user?.email?.toLowerCase() === 'manhha2@gmail.com';
  const currentUserRecord = useMemo(() => {
    if (!user?.email) return undefined;
    return usersList.find(u => u.email?.toLowerCase() === user.email?.toLowerCase());
  }, [usersList, user?.email]);

  const isApprovedUser = useMemo(() => {
    if (!user) return false;
    if (isRootAdmin) return true;
    if (!currentUserRecord) return false;
    return currentUserRecord.status !== 'Chờ duyệt' && currentUserRecord.status !== 'Tạm khóa';
  }, [user, isRootAdmin, currentUserRecord]);

  const pendingUsersCount = useMemo(
    () => usersList.filter(u => u.status === 'Chờ duyệt').length,
    [usersList]
  );

  // 1. Luôn lắng nghe danh sách users trước để kiểm tra phê duyệt
  useEffect(() => {
    if (!user) return;

    const unsubUsers = onSnapshot(collection(db, "users"), (snap) => {
      setUsersList(snap.docs.map(d => ({ id: d.id, ...d.data() } as StaffUser)));
      setUsersLoaded(true);
    }, (error) => {
      setUsersLoaded(true);
      handleFirestoreError(error, OperationType.GET, "users");
    });

    return () => unsubUsers();
  }, [user]);

  // 2. Tự động tạo yêu cầu "Chờ duyệt" nếu tài khoản mới đăng nhập lần đầu (hoặc tạo Admin gốc)
  useEffect(() => {
    if (!user?.email || !usersLoaded) return;
    const emailLower = user.email.toLowerCase();
    const exists = usersList.some(u => u.email?.toLowerCase() === emailLower);
    if (exists || autoRegisteredRef.current === emailLower) return;

    autoRegisteredRef.current = emailLower;
    const registerUser = async () => {
      try {
        if (isRootAdmin) {
          await addDoc(collection(db, "users"), {
            code: 'NV-ADMIN',
            name: user.displayName || 'Quản trị viên',
            email: emailLower,
            role: 'Admin',
            status: 'Hoạt động',
            createdAt: serverTimestamp()
          });
        } else {
          await addDoc(collection(db, "users"), {
            code: 'NV-CHO',
            name: user.displayName || emailLower.split('@')[0],
            email: emailLower,
            role: 'KyThuatVien',
            status: 'Chờ duyệt',
            createdAt: serverTimestamp()
          });
        }
      } catch (err) {
        console.error("Auto-register user error:", err);
      }
    };
    registerUser();
  }, [user, usersLoaded, usersList, isRootAdmin]);

  // 3. Chỉ tải dữ liệu kho vật tư khi tài khoản ĐÃ ĐƯỢC DUYỆT
  useEffect(() => {
    if (!user || !usersLoaded || !isApprovedUser) return;

    const unsubCats = onSnapshot(collection(db, "categories"), (snap) => {
      setCategories(snap.docs.map(d => ({ id: d.id, ...d.data() } as Category)));
    }, (error) => handleFirestoreError(error, OperationType.GET, "categories"));

    const unsubDepts = onSnapshot(collection(db, "departments"), (snap) => {
      setDepartments(snap.docs.map(d => ({ id: d.id, ...d.data() } as Department)));
    }, (error) => handleFirestoreError(error, OperationType.GET, "departments"));

    const unsubItems = onSnapshot(collection(db, "items"), (snap) => {
      setItems(snap.docs.map(d => ({ id: d.id, ...d.data() } as Item)));
    }, (error) => handleFirestoreError(error, OperationType.GET, "items"));

    const unsubTrans = onSnapshot(query(collection(db, "transactions"), orderBy("timestamp", "desc")), (snap) => {
      setTransactions(snap.docs.map(d => ({ id: d.id, ...d.data() } as Transaction)));
    }, (error) => handleFirestoreError(error, OperationType.GET, "transactions"));

    const unsubHolidays = onSnapshot(collection(db, "holidays"), (snap) => {
      setHolidays(snap.docs.map(d => ({ id: d.id, ...d.data() } as Holiday)));
    }, (error) => handleFirestoreError(error, OperationType.GET, "holidays"));

    return () => {
      unsubCats();
      unsubDepts();
      unsubItems();
      unsubTrans();
      unsubHolidays();
    };
  }, [user, usersLoaded, isApprovedUser]);

  // Initialize default departments
  useEffect(() => {
    if (!user || !usersLoaded || !isApprovedUser || departments.length > 0) return;
    const initDepts = async () => {
      try {
        const defaults = ["Tất cả", "X quang", "CLVT"];
        for (const name of defaults) {
          const q = query(collection(db, "departments"), where("name", "==", name));
          const snap = await getDocs(q);
          if (snap.empty) {
            await addDoc(collection(db, "departments"), { name });
          }
        }
      } catch (error) {
        console.error("Init Departments Error:", error);
        handleFirestoreError(error, OperationType.WRITE, "departments-init");
      }
    };
    initDepts();
  }, [user, usersLoaded, isApprovedUser, departments.length]);

  // --- AI Analysis ---
  const runAiAnalysis = async () => {
    setIsAnalyzing(true);
    try {
      const result = await analyzeInventory({ items, categories, transactions, holidays });
      if (result) {
        setAiAnalysis(result);
        toast.success("Phân tích kho bằng AI hoàn tất!");
      } else {
        toast.error("Không thể hoàn tất phân tích. Vui lòng thử lại.");
      }
    } catch (err) {
      console.warn("AI Analysis error:", err);
      toast.error("Đã xảy ra lỗi trong quá trình phân tích.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  if (loading || (user && !usersLoaded)) {
    return (
      <ErrorBoundary>
        <div className="h-screen w-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        </div>
      </ErrorBoundary>
    );
  }

  if (!user) {
    return (
      <ErrorBoundary>
        <div className={`h-screen w-screen flex flex-col items-center justify-center p-4 relative ${
          darkMode ? 'bg-slate-900' : isMedical ? 'bg-[#f0f6fc]' : 'bg-slate-50'
        }`}>
          <Toaster position="top-right" richColors />

          {/* Quick theme selector on login screen */}
          <div className="absolute top-4 right-4">
            <button 
              onClick={() => {
                const nextTheme = theme === 'medical' ? 'light' : theme === 'light' ? 'dark' : 'medical';
                setTheme(nextTheme);
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                darkMode ? 'bg-slate-800 border-slate-700 text-amber-300' :
                isMedical ? 'bg-white border-blue-200 text-blue-700 shadow-sm' :
                'bg-white border-slate-200 text-slate-700 shadow-sm'
              }`}
              title="Nhấn để đổi chủ đề giao diện"
            >
              <span>{theme === 'medical' ? '🏥 Chuẩn Y Tế' : theme === 'dark' ? '🌙 Giao diện Tối' : '☀️ Giao diện Sáng'}</span>
            </button>
          </div>

          <div className={`max-w-md w-full rounded-3xl shadow-xl p-8 text-center border transition-all ${
            darkMode ? 'bg-slate-800 border-slate-700' : 
            isMedical ? 'bg-white border-blue-100 shadow-[0_12px_40px_rgba(26,86,219,0.08)]' : 
            'bg-white border-slate-100 shadow-lg'
          }`}>
            <div 
              style={{ backgroundColor: '#1a56db' }}
              className="w-20 h-20 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-blue-200 text-3xl"
            >
              🏥
            </div>

            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 mb-3">
              <span>Bệnh Viện · Khoa Chẩn Đoán Hình Ảnh</span>
            </div>

            <h1 className={`text-2xl font-bold mb-2 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
              Quản Lý Vật Tư Y Tế
            </h1>
            <p className={`text-sm mb-7 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
              Cổng thông tin nội bộ quản lý kho vật tư tiêu hao, phim, hóa chất & dược chẩn đoán hình ảnh.
            </p>

            <button 
              onClick={handleLogin}
              style={{ backgroundColor: '#1a56db', color: '#ffffff' }}
              className="w-full py-4 px-6 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-all flex items-center justify-center gap-3 shadow-lg shadow-blue-100 active:scale-95 cursor-pointer"
            >
              <img src="https://www.google.com/favicon.ico" className="w-5 h-5 shrink-0" alt="Google" />
              <span>Đăng nhập với Google</span>
            </button>
            <div className={`mt-4 flex items-center justify-center gap-2 text-xs ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
              <AlertCircle className="w-4 h-4 shrink-0 text-blue-500" />
              <span>Chỉ tài khoản Google được Quản trị viên duyệt mới được truy cập.</span>
            </div>
          </div>
        </div>
      </ErrorBoundary>
    );
  }

  if (!isApprovedUser) {
    const isLocked = currentUserRecord?.status === 'Tạm khóa';
    return (
      <ErrorBoundary>
        <div className={`h-screen w-screen flex flex-col items-center justify-center p-4 ${darkMode ? 'bg-slate-900' : 'bg-slate-50'}`}>
          <Toaster position="top-right" richColors />
          <div className={`max-w-md w-full rounded-3xl shadow-2xl p-8 text-center border ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-100'}`}>
            <div className={`w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg ${
              isLocked ? 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400' : 'bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400'
            }`}>
              {isLocked ? <AlertTriangle className="w-10 h-10" /> : <Clock className="w-10 h-10" />}
            </div>

            <h2 className={`text-2xl font-bold mb-2 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
              {isLocked ? 'Tài khoản đã bị khóa quyền truy cập' : 'Đang chờ Quản trị viên phê duyệt'}
            </h2>

            <div className={`my-5 p-4 rounded-2xl border flex items-center gap-3 text-left ${
              darkMode ? 'bg-slate-900/60 border-slate-700' : 'bg-slate-50 border-slate-200'
            }`}>
              <img
                src={user.photoURL || 'https://www.google.com/favicon.ico'}
                alt="Avatar"
                className="w-11 h-11 rounded-full border-2 border-white shadow-sm shrink-0"
              />
              <div className="min-w-0 flex-1">
                <p className={`text-sm font-bold truncate ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                  {user.displayName || 'Người dùng Google'}
                </p>
                <p className="text-xs font-mono text-slate-500 truncate">{user.email}</p>
              </div>
              <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold shrink-0 ${
                isLocked ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800'
              }`}>
                {isLocked ? 'Đã khóa' : 'Chờ duyệt'}
              </span>
            </div>

            <p className={`text-sm mb-6 leading-relaxed ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
              {isLocked
                ? 'Tài khoản Google này hiện đang bị khóa quyền truy cập vào hệ thống Vật tư Chẩn đoán Hình ảnh. Vui lòng liên hệ Quản trị viên để được mở khóa.'
                : 'Yêu cầu đăng nhập của bạn đã được gửi tới Quản trị viên hệ thống. Ngay khi Quản trị viên nhấn "Duyệt" trong mục Người dùng, màn hình này sẽ tự động mở khóa.'}
            </p>

            <button
              onClick={handleLogout}
              style={{ backgroundColor: '#1e293b', color: '#ffffff' }}
              className="w-full py-3.5 px-6 bg-slate-800 hover:bg-slate-900 dark:bg-slate-700 dark:hover:bg-slate-600 text-white font-semibold rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              <span>Đăng xuất / Đổi tài khoản Google khác</span>
            </button>
          </div>
        </div>
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <div className={`h-screen overflow-hidden flex ${
        darkMode ? 'bg-slate-900 text-slate-100' : 
        isMedical ? 'bg-[#f0f6fc] text-slate-900' : 'bg-slate-50 text-slate-900'
      }`}>
      <Toaster position="top-right" richColors />
      
      {/* Sidebar Backdrop Overlay (All screens) */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/30 backdrop-blur-[2px] z-40 transition-opacity duration-300"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar Drawer (Slides out from left when clicking ☰ on any screen size) */}
      <aside className={`
        fixed inset-y-0 left-0 z-50 h-screen w-72 max-w-[85vw] shrink-0 border-r transform transition-all duration-300 ease-in-out shadow-2xl
        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        ${darkMode ? 'bg-slate-800 border-slate-700' : 
          isMedical ? 'bg-white border-blue-100 shadow-[4px_0_24px_rgba(26,86,219,0.12)]' : 'bg-white border-slate-200'}
      `}>
        <div className="h-full flex flex-col overflow-hidden">
          {/* Sidebar Header */}
          <div className={`p-4 flex items-center justify-between border-b shrink-0 transition-all ${
            darkMode ? 'border-slate-700 bg-slate-800' : 
            isMedical ? 'bg-gradient-to-r from-blue-700 to-sky-700 text-white border-blue-800' : 
            'border-slate-100 bg-white'
          }`}>
            <div className="flex items-center gap-3 min-w-0">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-md shrink-0 ${
                isMedical ? 'bg-white text-blue-700 font-bold text-lg' : 'bg-blue-600 text-white'
              }`}>
                {isMedical ? '🏥' : <Package className="w-6 h-6 text-white" />}
              </div>
              <div className="min-w-0">
                <span className={`font-bold text-base block truncate ${darkMode || isMedical ? 'text-white' : 'text-slate-900'}`}>
                  Vật tư X Quang
                </span>
                <span className={`text-[10px] font-semibold tracking-wide uppercase block truncate ${
                  darkMode ? 'text-slate-400' : isMedical ? 'text-blue-100' : 'text-slate-500'
                }`}>
                  Khoa Chẩn Đoán Hình Ảnh
                </span>
              </div>
            </div>
            <button 
              onClick={() => setSidebarOpen(false)} 
              title="Đóng menu (Esc hoặc Ctrl+B)"
              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                darkMode ? 'text-slate-400 hover:bg-slate-700 hover:text-white' : 
                isMedical ? 'text-white/80 hover:bg-white/15 hover:text-white' : 
                'text-slate-400 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <nav className="flex-1 px-4 py-5 space-y-2 overflow-y-auto custom-scrollbar">
            <NavItem 
              icon={<LayoutDashboard />} 
              label="Tổng quan" 
              active={activeTab === 'dashboard'} 
              onClick={() => {setActiveTab('dashboard'); setSidebarOpen(false);}} 
              darkMode={darkMode}
              isMedical={isMedical}
            />
            <NavItem 
              icon={<Package />} 
              label="Quản lý Vật tư" 
              active={activeTab === 'inventory'} 
              onClick={() => {setActiveTab('inventory'); setSidebarOpen(false);}} 
              darkMode={darkMode}
              isMedical={isMedical}
            />
            <NavItem 
              icon={<ArrowLeftRight />} 
              label="Nhập/Xuất Tồn" 
              active={activeTab === 'transactions'} 
              onClick={() => {setActiveTab('transactions'); setSidebarOpen(false);}} 
              darkMode={darkMode}
              isMedical={isMedical}
            />
            <NavItem 
              icon={<ClipboardCheck />} 
              label="Kiểm kê kho" 
              active={activeTab === 'audit'} 
              onClick={() => {setActiveTab('audit'); setSidebarOpen(false);}} 
              darkMode={darkMode}
              isMedical={isMedical}
            />
            <NavItem 
              icon={<CalendarRange />} 
              label="Dự trù vật tư" 
              active={activeTab === 'planning'} 
              onClick={() => {setActiveTab('planning'); setSidebarOpen(false);}} 
              darkMode={darkMode}
              isMedical={isMedical}
            />
            <NavItem 
              icon={<FileText />} 
              label="Báo cáo" 
              active={activeTab === 'reports'} 
              onClick={() => {setActiveTab('reports'); setSidebarOpen(false);}} 
              darkMode={darkMode}
              isMedical={isMedical}
            />
            <NavItem 
              icon={<Calendar />} 
              label="Ngày nghỉ" 
              active={activeTab === 'holidays'} 
              onClick={() => {setActiveTab('holidays'); setSidebarOpen(false);}} 
              darkMode={darkMode}
              isMedical={isMedical}
            />
            <NavItem 
              icon={<FileSpreadsheet className="text-emerald-500" />} 
              label="Mẫu Google Sheets" 
              active={activeTab === 'google-sheets'} 
              onClick={() => {setActiveTab('google-sheets'); setSidebarOpen(false);}} 
              darkMode={darkMode}
              isMedical={isMedical}
            />
            <NavItem 
              icon={<Users className="text-indigo-500" />} 
              label="Người dùng" 
              active={activeTab === 'users'} 
              onClick={() => {setActiveTab('users'); setSidebarOpen(false);}} 
              darkMode={darkMode}
              isMedical={isMedical}
              badge={pendingUsersCount > 0 ? pendingUsersCount : undefined}
            />
            <NavItem 
              icon={<BrainCircuit />} 
              label="Trợ lý AI" 
              active={activeTab === 'assistant'} 
              onClick={() => {setActiveTab('assistant'); setSidebarOpen(false);}} 
              darkMode={darkMode}
              isMedical={isMedical}
            />
            
            {user.email === 'manhha2@gmail.com' && (
              <button 
                onClick={() => setShowResetConfirm(true)}
                title="Reset dữ liệu"
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all mt-8 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 cursor-pointer"
              >
                <RefreshCw className="w-5 h-5 shrink-0" />
                <span>Reset dữ liệu</span>
              </button>
            )}
          </nav>

          <div className={`p-3 border-t shrink-0 ${darkMode ? 'border-slate-700' : 'border-slate-100'}`}>
            <div className={`flex items-center gap-3 p-3 rounded-xl ${darkMode ? 'bg-slate-700/50' : 'bg-slate-50'}`}>
              <img 
                src={user.photoURL || ''} 
                className="w-9 h-9 rounded-full border-2 border-white shadow-sm shrink-0 object-cover" 
                alt="User" 
                title={user.displayName || user.email || 'Người dùng'} 
              />
              <div className="flex-1 overflow-hidden min-w-0">
                <p className={`text-sm font-semibold truncate ${darkMode ? 'text-white' : 'text-slate-900'}`}>{user.displayName}</p>
                <p className={`text-xs truncate ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>{user.email}</p>
              </div>
              <button 
                onClick={handleLogout} 
                title="Đăng xuất"
                className={`p-1.5 rounded-lg transition-colors cursor-pointer ${darkMode ? 'text-slate-400 hover:text-red-400 hover:bg-slate-600' : 'text-slate-400 hover:text-red-500 hover:bg-slate-200'}`}
              >
                <LogOut className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        {/* Header */}
        {/* Professional Hospital Executive Banner (Fully Responsive Across All Devices) */}
        <header className={`shrink-0 border-b relative z-40 transition-all duration-200 w-full ${
          darkMode 
            ? 'bg-slate-900 border-slate-800 text-white shadow-md' 
            : isMedical 
            ? 'bg-gradient-to-r from-[#072552] via-[#0d3b7a] to-[#1253a4] text-white border-sky-500/25 shadow-[0_4px_24px_rgba(7,37,82,0.32)]' 
            : 'bg-white border-slate-200 text-slate-900 shadow-sm'
        }`}>
          {/* Subtle medical ambient glow for medical theme */}
          {isMedical && (
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(56,189,248,0.18),rgba(255,255,255,0))] pointer-events-none" />
          )}

          <div className="h-14 sm:h-16 md:h-18 px-2 sm:px-4 lg:px-6 flex items-center justify-between gap-1.5 sm:gap-3 relative w-full">
            {/* Left Brand Identity Section */}
            <div className="flex items-center gap-1.5 sm:gap-3 min-w-0 flex-1 sm:flex-initial">
              {/* Hamburger Button ☰ */}
              <button 
                onClick={() => setSidebarOpen(prev => !prev)} 
                title="Mở menu điều hướng hệ thống (Ctrl+B)"
                className={`p-1.5 sm:p-2.5 rounded-xl transition-all shrink-0 cursor-pointer ${
                  darkMode 
                    ? 'bg-slate-800 text-slate-200 hover:bg-slate-700 hover:text-white border border-slate-700' 
                    : isMedical 
                    ? 'bg-white/12 hover:bg-white/22 active:scale-95 text-white border border-white/20 shadow-sm' 
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200'
                }`}
              >
                <Menu className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>

              {/* Department Crest / Logo */}
              <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center shrink-0 shadow-md transition-transform ${
                isMedical 
                  ? 'bg-gradient-to-br from-white to-blue-50 text-blue-700 border border-white/50 text-lg sm:text-xl font-bold shadow-[0_2px_8px_rgba(0,0,0,0.15)]' 
                  : darkMode 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-blue-600 text-white'
              }`}>
                {isMedical ? '🏥' : <Package className="w-4 h-4 sm:w-6 sm:h-6 text-white" />}
              </div>

              {/* Brand Hierarchy Titles with Adaptive Truncation */}
              <div className="min-w-0 overflow-hidden">
                <div className="flex items-center gap-1.5 leading-none mb-0.5 sm:mb-1">
                  <span className={`text-[9px] sm:text-[11px] font-bold tracking-wider uppercase truncate ${
                    isMedical ? 'text-sky-200' : darkMode ? 'text-slate-400' : 'text-slate-500'
                  }`}>
                    <span className="inline sm:hidden">KHOA CĐHA</span>
                    <span className="hidden sm:inline">KHOA CHẨN ĐOÁN HÌNH ẢNH</span>
                  </span>
                  <span className={`hidden xl:inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide shrink-0 ${
                    isMedical 
                      ? 'bg-emerald-400/20 text-emerald-300 border border-emerald-400/30' 
                      : darkMode 
                      ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' 
                      : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  }`}>
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    Trực tuyến 24/7
                  </span>
                </div>
                <div className="flex items-center gap-1.5 leading-tight">
                  <h1 className={`text-xs sm:text-base md:text-lg font-black tracking-tight truncate ${
                    darkMode || isMedical ? 'text-white' : 'text-slate-900'
                  }`}>
                    VẬT TƯ X-QUANG & CĐHA
                  </h1>
                  <span className={`hidden md:inline font-light ${isMedical ? 'text-sky-300/40' : 'text-slate-300'}`}>/</span>
                  <span className={`hidden md:inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold truncate ${
                    isMedical 
                      ? 'bg-white/15 text-white border border-white/20' 
                      : darkMode 
                      ? 'bg-slate-800 text-slate-300 border border-slate-700' 
                      : 'bg-slate-100 text-slate-700 border border-slate-200'
                  }`}>
                    {activeTab === 'dashboard' ? 'Bảng điều khiển' : 
                     activeTab === 'inventory' ? 'Quản lý Vật tư' :  
                     activeTab === 'transactions' ? 'Nhập/Xuất Tồn' : 
                     activeTab === 'audit' ? 'Kiểm kê kho' :
                     activeTab === 'planning' ? 'Dự trù vật tư' :
                     activeTab === 'reports' ? 'Báo cáo thống kê' : 
                     activeTab === 'holidays' ? 'Quản lý ngày nghỉ' : 
                     activeTab === 'google-sheets' ? 'Mẫu & Đồng bộ Sheets' :
                     activeTab === 'users' ? 'Người dùng & Cán bộ' : 'Trợ lý AI Gemini'}
                  </span>
                </div>
              </div>
            </div>

            {/* Center Operational Live Clock & Alerts (Desktop only >= 1400px) */}
            <div className={`hidden 2xl:flex items-center gap-3 px-3.5 py-1.5 rounded-xl border text-xs backdrop-blur-sm shadow-inner shrink-0 ${
              isMedical 
                ? 'bg-white/10 border-white/15 text-white' 
                : darkMode 
                ? 'bg-slate-800/80 border-slate-700 text-slate-200' 
                : 'bg-slate-100/90 border-slate-200 text-slate-700'
            }`}>
              <div className="flex items-center gap-1.5 font-mono font-bold tracking-wide">
                <Clock className={`w-3.5 h-3.5 ${isMedical ? 'text-sky-300' : 'text-blue-500'}`} />
                <span>{liveClock}</span>
              </div>
              <div className={`h-3 w-px ${isMedical ? 'bg-white/20' : darkMode ? 'bg-slate-700' : 'bg-slate-300'}`} />
              <div className="flex items-center gap-1.5 text-[11px]">
                <span className="opacity-90">Tổng kho: <b>{items.length}</b> vật tư</span>
              </div>
              {(bannerAlerts.expired > 0 || bannerAlerts.lowStock > 0) && (
                <>
                  <div className={`h-3 w-px ${isMedical ? 'bg-white/20' : darkMode ? 'bg-slate-700' : 'bg-slate-300'}`} />
                  <button 
                    onClick={() => setActiveTab('inventory')}
                    className={`flex items-center gap-1 text-[11px] font-bold px-1.5 py-0.5 rounded transition-all cursor-pointer ${
                      isMedical 
                        ? 'bg-amber-400/25 text-amber-200 hover:bg-amber-400/35 border border-amber-300/40' 
                        : 'bg-amber-100 text-amber-800 hover:bg-amber-200'
                    }`}
                    title="Xem chi tiết các mặt hàng cần cảnh báo trong kho"
                  >
                    <AlertCircle className="w-3 h-3 text-amber-300 shrink-0" />
                    <span>
                      {bannerAlerts.expired > 0 ? `${bannerAlerts.expired} hết hạn` : ''}
                      {bannerAlerts.expired > 0 && bannerAlerts.lowStock > 0 ? ' · ' : ''}
                      {bannerAlerts.lowStock > 0 ? `${bannerAlerts.lowStock} sắp hết` : ''}
                    </span>
                  </button>
                </>
              )}
            </div>

            {/* Right Tools & Profile Zone (Strictly Sized & Non-Overflowing) */}
            <div className="flex items-center gap-1 sm:gap-2 shrink-0">
              {/* Mobile Search Toggle Button (< md) */}
              <button 
                onClick={() => setShowMobileSearch(prev => !prev)}
                title="Tìm kiếm vật tư"
                className={`md:hidden p-1.5 sm:p-2 rounded-xl transition-all border shrink-0 cursor-pointer ${
                  showMobileSearch 
                    ? 'bg-white text-blue-700 shadow-sm border-white' 
                    : (isMedical ? 'bg-white/12 text-white border-white/20 hover:bg-white/22' : darkMode ? 'bg-slate-800 text-slate-300 border-slate-700' : 'bg-slate-100 text-slate-700 border-slate-200')
                }`}
              >
                <Search className="w-4 h-4" />
              </button>

              {/* Google Sheets Hub Shortcut (visible on xl+ screens) */}
              <button
                onClick={() => setActiveTab('google-sheets')}
                className={`hidden xl:flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer shrink-0 ${
                  activeTab === 'google-sheets'
                    ? (isMedical ? 'bg-white text-emerald-700 font-extrabold shadow-md border-white' : 'bg-emerald-600 text-white border-emerald-600 shadow-sm')
                    : (darkMode 
                        ? 'bg-slate-800 border-slate-700 text-emerald-400 hover:bg-slate-700' 
                        : isMedical
                        ? 'bg-white/12 border-white/20 text-white hover:bg-white/22 shadow-sm'
                        : 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100')
                }`}
                title="Mở Trung tâm Mẫu & Đồng bộ Google Sheets"
              >
                <FileSpreadsheet className={`w-3.5 h-3.5 ${isMedical && activeTab !== 'google-sheets' ? 'text-emerald-300' : 'text-emerald-500'}`} />
                <span className="hidden 2xl:inline">Mẫu Google Sheets CĐHA</span>
                <span className="inline 2xl:hidden">Mẫu Sheets</span>
              </button>

              {/* AI Assistant Quick Trigger (visible on 2xl screens) */}
              <button
                onClick={() => setActiveTab('assistant')}
                className={`hidden 2xl:flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer shrink-0 ${
                  activeTab === 'assistant'
                    ? (isMedical ? 'bg-white text-blue-800 shadow-md border-white' : 'bg-blue-600 text-white')
                    : (darkMode
                        ? 'bg-slate-800 border-slate-700 text-purple-300 hover:bg-slate-700'
                        : isMedical
                        ? 'bg-white/12 border-white/20 text-white hover:bg-white/22 shadow-sm'
                        : 'bg-purple-50 border-purple-200 text-purple-700 hover:bg-purple-100')
                }`}
                title="Mở Trợ lý AI Phân tích Kho Chẩn đoán hình ảnh"
              >
                <Sparkles className={`w-3.5 h-3.5 ${isMedical ? 'text-amber-300' : 'text-purple-500'}`} />
                <span>Trợ lý AI</span>
              </button>

              {/* Theme Selector Popover (Responsive: Icon-only on mobile/tablet, Icon + Text on lg+) */}
              <div className="relative shrink-0" ref={themeMenuRef}>
                <button 
                  onClick={() => setShowThemeMenu(!showThemeMenu)}
                  className={`flex items-center gap-1 sm:gap-1.5 p-1.5 sm:px-2.5 sm:py-1.5 rounded-xl text-xs font-bold transition-all border cursor-pointer shrink-0 ${
                    isMedical 
                      ? 'bg-white/15 hover:bg-white/25 text-white border-white/25 shadow-sm' 
                      : darkMode 
                      ? 'bg-slate-800 border-slate-700 text-amber-300 hover:bg-slate-700' 
                      : 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200'
                  }`}
                  title="Đổi chủ đề giao diện (Chuẩn Y Tế / Sáng / Tối)"
                >
                  {theme === 'medical' ? (
                    <>
                      <span className="text-sm">🏥</span>
                      <span className="hidden lg:inline">Chuẩn Y Tế</span>
                    </>
                  ) : theme === 'dark' ? (
                    <>
                      <Moon className="w-3.5 h-3.5 text-amber-300" />
                      <span className="hidden lg:inline">Giao diện Tối</span>
                    </>
                  ) : (
                    <>
                      <Sun className="w-3.5 h-3.5 text-amber-500" />
                      <span className="hidden lg:inline">Giao diện Sáng</span>
                    </>
                  )}
                  <ChevronDown className="w-3 h-3 opacity-70 ml-0.5" />
                </button>

                {showThemeMenu && (
                  <div className={`absolute right-0 mt-2 w-72 rounded-2xl shadow-2xl border p-2 z-50 text-left ${
                    darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-900'
                  }`}>
                    <div className={`px-3 py-2 text-[10px] font-bold uppercase tracking-wider border-b ${
                      darkMode ? 'text-slate-400 border-slate-700' : 'text-slate-400 border-slate-100'
                    }`}>
                      Chọn giao diện hệ thống
                    </div>
                    
                    {/* Option 1: Chuẩn Y Tế (Mặc định) */}
                    <button
                      onClick={() => {
                        setTheme('medical');
                        setShowThemeMenu(false);
                      }}
                      className={`w-full flex items-start gap-3 p-2.5 rounded-xl text-left transition-all mt-1 cursor-pointer ${
                        theme === 'medical'
                          ? (darkMode ? 'bg-blue-900/40 text-blue-300 border border-blue-700/60' : 'bg-blue-50 text-blue-900 border border-blue-200')
                          : (darkMode ? 'hover:bg-slate-700 text-slate-300' : 'hover:bg-slate-50 text-slate-700')
                      }`}
                    >
                      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-sky-500 text-white flex items-center justify-center text-sm font-bold shadow-sm shrink-0">
                        🏥
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold">Chuẩn Y Tế</span>
                          <span className="text-[10px] px-1.5 py-0.2 rounded-md font-bold bg-blue-600 text-white">Mặc định</span>
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
                          Xanh & Trắng chuẩn website y tế chính thức, giao diện bệnh viện
                        </p>
                      </div>
                      {theme === 'medical' && <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0 mt-1" />}
                    </button>

                    {/* Option 2: Giao diện Sáng */}
                    <button
                      onClick={() => {
                        setTheme('light');
                        setShowThemeMenu(false);
                      }}
                      className={`w-full flex items-start gap-3 p-2.5 rounded-xl text-left transition-all mt-1 cursor-pointer ${
                        theme === 'light'
                          ? (darkMode ? 'bg-slate-700 text-white' : 'bg-slate-100 text-slate-900 border border-slate-300')
                          : (darkMode ? 'hover:bg-slate-700 text-slate-300' : 'hover:bg-slate-50 text-slate-700')
                      }`}
                    >
                      <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-600 border border-amber-200 flex items-center justify-center text-sm font-bold shadow-sm shrink-0">
                        <Sun className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-xs font-bold block">Giao diện Sáng (Light)</span>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
                          Tone xám sáng trung tính tiêu chuẩn
                        </p>
                      </div>
                      {theme === 'light' && <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0 mt-1" />}
                    </button>

                    {/* Option 3: Giao diện Tối */}
                    <button
                      onClick={() => {
                        setTheme('dark');
                        setShowThemeMenu(false);
                      }}
                      className={`w-full flex items-start gap-3 p-2.5 rounded-xl text-left transition-all mt-1 cursor-pointer ${
                        theme === 'dark'
                          ? 'bg-slate-700 text-white border border-slate-600'
                          : (darkMode ? 'hover:bg-slate-700 text-slate-300' : 'hover:bg-slate-50 text-slate-700')
                      }`}
                    >
                      <div className="w-8 h-8 rounded-lg bg-slate-900 text-amber-300 border border-slate-700 flex items-center justify-center text-sm font-bold shadow-sm shrink-0">
                        <Moon className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-xs font-bold block">Giao diện Tối (Dark)</span>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
                          Tối ưu cho phòng đọc phim X-Quang & làm việc ban đêm
                        </p>
                      </div>
                      {theme === 'dark' && <CheckCircle2 className="w-4 h-4 text-blue-400 shrink-0 mt-1" />}
                    </button>
                  </div>
                )}
              </div>

              {/* Global Search Bar (Tablet & Desktop: md+) */}
              <div className="relative hidden md:block shrink-0" ref={searchRef}>
                <Search className={`w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none ${
                  isMedical ? 'text-sky-200' : darkMode ? 'text-slate-400' : 'text-slate-400'
                }`} />
                <input 
                  ref={searchInputRef}
                  type="text" 
                  placeholder="Tìm vật tư... (Ctrl+K)" 
                  value={globalSearch}
                  onChange={(e) => {
                    setGlobalSearch(e.target.value);
                    setShowSearchResults(true);
                  }}
                  onFocus={() => setShowSearchResults(true)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      setActiveTab('inventory');
                      setShowSearchResults(false);
                    }
                  }}
                  className={`pl-8 pr-11 py-1.5 sm:py-2 rounded-xl text-xs sm:text-sm focus:outline-none transition-all w-36 md:w-44 lg:w-52 xl:w-60 border ${
                    isMedical
                      ? 'bg-white/15 text-white placeholder-sky-200/80 border-white/20 focus:bg-white focus:text-slate-900 focus:placeholder-slate-400 focus:ring-2 focus:ring-sky-300 shadow-inner'
                      : darkMode 
                      ? 'bg-slate-800 text-white placeholder-slate-500 border-slate-700 focus:ring-2 focus:ring-blue-500' 
                      : 'bg-slate-100 text-slate-900 placeholder-slate-400 border-slate-200 focus:bg-white focus:ring-2 focus:ring-blue-500 shadow-inner'
                  }`}
                />
                {globalSearch ? (
                  <button 
                    onClick={() => {
                      setGlobalSearch('');
                      setShowSearchResults(false);
                    }}
                    className={`absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded cursor-pointer ${
                      isMedical ? 'text-sky-100 hover:text-white' : 'text-slate-400 hover:text-slate-600'
                    }`}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                ) : (
                  <span className={`absolute right-2 top-1/2 -translate-y-1/2 text-[9px] font-mono px-1 py-0.5 rounded border pointer-events-none ${
                    isMedical 
                      ? 'bg-white/15 text-sky-200 border-white/20' 
                      : darkMode 
                      ? 'bg-slate-700 text-slate-400 border-slate-600' 
                      : 'bg-slate-200 text-slate-500 border-slate-300'
                  }`}>
                    ⌘K
                  </span>
                )}
                {globalSearch && showSearchResults && (
                  <div className={`absolute top-full left-0 right-0 mt-2 rounded-xl shadow-2xl border max-h-96 overflow-y-auto z-50 ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
                    <div className={`p-2.5 text-xs font-bold border-b ${darkMode ? 'text-slate-400 border-slate-700 bg-slate-800/80' : 'text-slate-500 border-slate-100 bg-slate-50'}`}>
                      Kết quả tìm kiếm ({items.filter(i => i.name.toLowerCase().includes(globalSearch.toLowerCase())).length})
                    </div>
                    {items
                      .filter(i => i.name.toLowerCase().includes(globalSearch.toLowerCase()))
                      .slice(0, 10)
                      .map(item => (
                        <button
                          key={item.id}
                          onClick={() => {
                            setActiveTab('inventory');
                            setShowSearchResults(false);
                          }}
                          className={`w-full text-left px-4 py-2.5 transition-colors flex items-center justify-between group border-b last:border-0 ${darkMode ? 'border-slate-700/60 hover:bg-slate-700' : 'border-slate-100 hover:bg-blue-50/70'}`}
                        >
                          <div>
                            <p className={`text-sm font-semibold ${darkMode ? 'text-slate-200 group-hover:text-blue-400' : 'text-slate-800 group-hover:text-blue-600'}`}>{item.name}</p>
                            <p className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>{categories.find(c => c.id === item.categoryId)?.name || 'Chưa phân loại'}</p>
                          </div>
                          <div className="text-right">
                            <p className={`text-xs font-bold ${darkMode ? 'text-slate-200' : 'text-slate-800'}`}>{formatQty(item.currentStock)} {item.unit}</p>
                            <p className={`text-[10px] font-semibold ${item.currentStock <= item.minStock ? 'text-red-500' : 'text-emerald-600'}`}>
                              {item.currentStock <= item.minStock ? 'Sắp hết' : 'Ổn định'}
                            </p>
                          </div>
                        </button>
                      ))}
                    {items.filter(i => i.name.toLowerCase().includes(globalSearch.toLowerCase())).length > 10 && (
                      <button 
                        onClick={() => {
                          setActiveTab('inventory');
                          setShowSearchResults(false);
                        }}
                        className={`w-full py-2.5 text-center text-xs font-bold ${darkMode ? 'text-blue-400 hover:bg-slate-700' : 'text-blue-600 hover:bg-blue-50'}`}
                      >
                        Xem tất cả ({items.filter(i => i.name.toLowerCase().includes(globalSearch.toLowerCase())).length}) kết quả
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Quick User Card on Banner - always fully visible & shrink-0 */}
              <div className={`flex items-center gap-1.5 sm:gap-2 pl-1.5 sm:pl-2.5 border-l shrink-0 ${
                isMedical ? 'border-white/20' : darkMode ? 'border-slate-700' : 'border-slate-200'
              }`}>
                <img 
                  src={user.photoURL || ''} 
                  alt={user.displayName || 'User'} 
                  className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full border-2 shadow-sm object-cover shrink-0 ${
                    isMedical ? 'border-white/80' : darkMode ? 'border-slate-700' : 'border-white'
                  }`}
                  title={`${user.displayName || 'Cán bộ'} (${user.email || ''})`} 
                />
                <div className="hidden 2xl:block text-left text-xs leading-tight min-w-0 max-w-[100px]">
                  <p className={`font-bold truncate ${darkMode || isMedical ? 'text-white' : 'text-slate-900'}`}>
                    {user.displayName || 'Cán bộ Y tế'}
                  </p>
                  <p className={`text-[10px] truncate ${isMedical ? 'text-sky-200' : darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                    {user.email === 'manhha2@gmail.com' ? 'Quản trị viên' : 'Khoa CĐHA'}
                  </p>
                </div>
                <button 
                  onClick={handleLogout} 
                  title="Đăng xuất khỏi hệ thống"
                  className={`p-1.5 rounded-lg transition-colors cursor-pointer shrink-0 ${
                    isMedical 
                      ? 'bg-white/10 hover:bg-red-500/30 text-white/90 hover:text-white border border-white/15' 
                      : darkMode 
                      ? 'bg-slate-800 hover:bg-red-500/20 text-slate-400 hover:text-red-400 border border-slate-700' 
                      : 'bg-slate-100 hover:bg-red-50 text-slate-500 hover:text-red-600 border border-slate-200'
                  }`}
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>

          {/* Mobile Collapsible Search Dropdown (< md) */}
          {showMobileSearch && (
            <div className={`md:hidden px-3 py-2 border-t flex items-center gap-2 relative z-50 ${
              darkMode ? 'bg-slate-800 border-slate-700' : isMedical ? 'bg-[#082855] border-sky-400/30' : 'bg-slate-50 border-slate-200'
            }`}>
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-sky-200 pointer-events-none" />
                <input 
                  type="text" 
                  placeholder="Tìm kiếm vật tư, hóa chất, mã kho..."
                  autoFocus
                  value={globalSearch}
                  onChange={(e) => {
                    setGlobalSearch(e.target.value);
                    setShowSearchResults(true);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      setActiveTab('inventory');
                      setShowSearchResults(false);
                      setShowMobileSearch(false);
                    }
                  }}
                  className="w-full pl-9 pr-8 py-2 rounded-xl text-xs bg-white/20 text-white placeholder-sky-200/80 border border-white/30 focus:outline-none focus:ring-2 focus:ring-sky-300"
                />
                {globalSearch && (
                  <button 
                    onClick={() => setGlobalSearch('')} 
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-sky-200 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <button 
                onClick={() => setShowMobileSearch(false)}
                className="px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-white/10 text-white hover:bg-white/20 border border-white/20 cursor-pointer shrink-0"
              >
                Đóng
              </button>
            </div>
          )}
        </header>

        {/* Scrollable Area */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-4 lg:p-8 pb-36 md:pb-8">
          {activeTab === 'dashboard' && (
            <Dashboard 
              items={items} 
              transactions={transactions} 
              categories={categories} 
              aiAnalysis={aiAnalysis}
              onRunAnalysis={runAiAnalysis}
              isAnalyzing={isAnalyzing}
              setActiveTab={setActiveTab}
              globalSearch={globalSearch}
              darkMode={darkMode}
            />
          )}
          {activeTab === 'inventory' && <Inventory items={items} transactions={transactions} categories={categories} departments={departments} globalSearch={globalSearch} darkMode={darkMode} />}
          {activeTab === 'transactions' && <Transactions transactions={transactions} items={items} departments={departments} categories={categories} globalSearch={globalSearch} darkMode={darkMode} />}
          {activeTab === 'audit' && <InventoryAudit items={items} categories={categories} globalSearch={globalSearch} darkMode={darkMode} />}
          {activeTab === 'planning' && <InventoryPlanning items={items} transactions={transactions} categories={categories} holidays={holidays} globalSearch={globalSearch} darkMode={darkMode} />}
          {activeTab === 'reports' && (
            <Reports 
              transactions={transactions} 
              items={items} 
              categories={categories} 
              departments={departments} 
              holidays={holidays} 
              globalSearch={globalSearch} 
              darkMode={darkMode}
              onNavigateHolidays={() => setActiveTab('holidays')}
            />
          )}
          {activeTab === 'holidays' && <Holidays holidays={holidays} darkMode={darkMode} />}
          {activeTab === 'google-sheets' && (
            <GoogleSheetsHub 
              categories={categories}
              departments={departments}
              items={items}
              transactions={transactions}
              users={usersList}
              darkMode={darkMode}
              currentUserEmail={user.email || undefined}
            />
          )}
          {activeTab === 'users' && (
            <UsersManager 
              users={usersList}
              departments={departments}
              darkMode={darkMode}
              currentUserEmail={user.email || undefined}
            />
          )}
          {activeTab === 'assistant' && (
            <AiAssistant 
              analysis={aiAnalysis} 
              isAnalyzing={isAnalyzing} 
              onAnalyze={runAiAnalysis} 
              darkMode={darkMode}
              items={items}
              categories={categories}
              transactions={transactions}
              departments={departments}
              holidays={holidays}
            />
          )}
        </div>

        {/* Mobile Bottom Navigation Bar (< md) */}
        <nav className={`md:hidden shrink-0 border-t flex items-center justify-around h-16 px-1 safe-area-pb z-40 transition-colors ${
          darkMode 
            ? 'bg-slate-900/95 border-slate-800 text-slate-400' 
            : isMedical
            ? 'bg-white/95 border-blue-200/80 text-slate-600 shadow-[0_-4px_16px_rgba(26,86,219,0.06)]'
            : 'bg-white/95 border-slate-200 text-slate-600'
        }`}>
          <button
            type="button"
            onClick={() => setActiveTab('inventory')}
            className={`flex flex-col items-center justify-center flex-1 h-full py-1 min-w-[56px] transition-colors ${
              activeTab === 'inventory' 
                ? (darkMode ? 'text-blue-400 font-bold' : 'text-blue-600 font-bold') 
                : 'hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Package className="w-5 h-5 mb-0.5" />
            <span className="text-[10px] whitespace-nowrap">Vật tư</span>
          </button>
          
          <button
            type="button"
            onClick={() => setActiveTab('transactions')}
            className={`flex flex-col items-center justify-center flex-1 h-full py-1 min-w-[56px] transition-colors ${
              activeTab === 'transactions' 
                ? (darkMode ? 'text-blue-400 font-bold' : 'text-blue-600 font-bold') 
                : 'hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <ArrowLeftRight className="w-5 h-5 mb-0.5" />
            <span className="text-[10px] whitespace-nowrap">Giao dịch</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('audit')}
            className={`flex flex-col items-center justify-center flex-1 h-full py-1 min-w-[56px] transition-colors ${
              activeTab === 'audit' 
                ? (darkMode ? 'text-blue-400 font-bold' : 'text-blue-600 font-bold') 
                : 'hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <ClipboardCheck className="w-5 h-5 mb-0.5" />
            <span className="text-[10px] whitespace-nowrap">Kiểm kê</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('planning')}
            className={`flex flex-col items-center justify-center flex-1 h-full py-1 min-w-[56px] transition-colors ${
              activeTab === 'planning' 
                ? (darkMode ? 'text-blue-400 font-bold' : 'text-blue-600 font-bold') 
                : 'hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <CalendarRange className="w-5 h-5 mb-0.5" />
            <span className="text-[10px] whitespace-nowrap">Dự trù</span>
          </button>

          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="flex flex-col items-center justify-center flex-1 h-full py-1 min-w-[56px] text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors"
          >
            <Menu className="w-5 h-5 mb-0.5" />
            <span className="text-[10px] whitespace-nowrap">Thêm</span>
          </button>
        </nav>
      </main>

      {/* Reset Confirmation Modal */}
      {showResetConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className={`rounded-2xl shadow-2xl w-full max-w-sm p-8 text-center border ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-100'}`}>
            <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-8 h-8" />
            </div>
            <h3 className={`text-xl font-bold mb-2 ${darkMode ? 'text-white' : 'text-slate-900'}`}>Xác nhận Reset</h3>
            <p className={`mb-8 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Bạn có chắc chắn muốn xóa TOÀN BỘ dữ liệu? Hành động này sẽ xóa sạch các vật tư, giao dịch, phòng ban và không thể hoàn tác.</p>
            <div className="flex gap-3">
              <button 
                onClick={() => setShowResetConfirm(false)}
                disabled={isResetting}
                className={`flex-1 py-3 font-bold rounded-xl transition-colors ${darkMode ? 'bg-slate-700 text-slate-300 hover:bg-slate-600' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
              >
                Hủy
              </button>
              <button 
                onClick={handleResetData}
                disabled={isResetting}
                className="flex-1 py-3 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 transition-colors shadow-lg shadow-red-100 flex items-center justify-center gap-2"
              >
                {isResetting && <Loader2 className="w-4 h-4 animate-spin" />}
                Xác nhận
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </ErrorBoundary>
  );
}

// --- Sub-components ---

function NavItem({ 
  icon, 
  label, 
  active, 
  onClick, 
  darkMode, 
  isMedical, 
  badge,
  isCollapsed 
}: { 
  icon: any, 
  label: string, 
  active: boolean, 
  onClick: () => void, 
  darkMode?: boolean, 
  isMedical?: boolean, 
  badge?: number,
  isCollapsed?: boolean 
}) {
  return (
    <button 
      onClick={onClick}
      title={isCollapsed ? label : undefined}
      className={`
        w-full flex items-center ${isCollapsed ? 'justify-center px-2 py-3' : 'justify-between px-4 py-3'} rounded-xl transition-all relative group cursor-pointer
        ${active 
          ? (darkMode 
              ? 'bg-blue-900/30 text-blue-400 font-semibold' 
              : isMedical
              ? 'bg-blue-600 text-white font-bold shadow-md shadow-blue-200/50'
              : 'bg-blue-50 text-blue-600 font-semibold shadow-sm') 
          : (darkMode 
              ? 'text-slate-400 hover:bg-slate-700 hover:text-slate-100' 
              : isMedical
              ? 'text-slate-600 hover:bg-blue-50/80 hover:text-blue-700 font-medium'
              : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900')}
      `}
    >
      <div className={`flex items-center gap-3 min-w-0 ${isCollapsed ? 'justify-center' : ''}`}>
        {React.cloneElement(icon, { className: `w-5 h-5 shrink-0 ${active && isMedical ? 'text-white' : ''}` })}
        {!isCollapsed && <span className="truncate">{label}</span>}
      </div>

      {!isCollapsed && badge && badge > 0 ? (
        <span className={`px-2 py-0.5 text-[11px] font-bold rounded-full shrink-0 ${
          active && isMedical ? 'bg-white text-blue-700' : 'bg-amber-500 text-white'
        }`}>
          {badge}
        </span>
      ) : null}

      {/* When collapsed: show notification badge dot */}
      {isCollapsed && badge && badge > 0 && (
        <span className="absolute top-2 right-2 w-2.5 h-2.5 bg-amber-500 rounded-full border-2 border-white dark:border-slate-800" />
      )}

      {/* Floating tooltip on hover when collapsed on desktop */}
      {isCollapsed && (
        <div className="hidden lg:group-hover:flex absolute left-full ml-3 px-3 py-1.5 bg-slate-900/95 text-white text-xs font-semibold rounded-lg shadow-xl whitespace-nowrap z-50 pointer-events-none items-center gap-1.5 backdrop-blur-sm border border-slate-700">
          <span>{label}</span>
          {badge && badge > 0 && (
            <span className="px-1.5 py-0.2 text-[10px] bg-amber-500 text-white rounded-full font-bold">
              {badge}
            </span>
          )}
        </div>
      )}
    </button>
  );
}

function Dashboard({ 
  items, 
  transactions, 
  categories, 
  aiAnalysis, 
  onRunAnalysis, 
  isAnalyzing,
  setActiveTab,
  globalSearch,
  darkMode
}: { 
  items: Item[], 
  transactions: Transaction[], 
  categories: Category[],
  aiAnalysis: AiAnalysis | null,
  onRunAnalysis: () => void,
  isAnalyzing: boolean,
  setActiveTab: (tab: string) => void,
  globalSearch: string,
  darkMode?: boolean
}) {
  const [isChartReady, setIsChartReady] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setIsChartReady(true), 1000);
    return () => clearTimeout(timer);
  }, []);

  const filteredItems = useMemo(() => {
    if (!globalSearch) return items;
    return items.filter(i => i.name.toLowerCase().includes(globalSearch.toLowerCase()));
  }, [items, globalSearch]);

  const lowStockItems = filteredItems.filter(i => i.currentStock <= i.minStock);
  const expiredItems = filteredItems.filter(i => i.expiryDate && new Date(i.expiryDate) < new Date());
  const safeItems = filteredItems.filter(i => i.currentStock > i.minStock && (!i.expiryDate || new Date(i.expiryDate) >= new Date()));

  // Total Inventory Value
  const totalValue = filteredItems.reduce((sum, item) => sum + (item.currentStock * (item.price || 0)), 0);

  // Health Score (0-100)
  const healthScore = filteredItems.length > 0 ? Math.round((safeItems.length / filteredItems.length) * 100) : 100;

  // Category Distribution Data
  const categoryData = Array.from(
    categories.reduce((acc, cat) => {
      const count = filteredItems.filter(i => i.categoryId === cat.id).length;
      const existing = acc.get(cat.name) || 0;
      acc.set(cat.name, existing + count);
      return acc;
    }, new Map<string, number>())
  )
    .map(([name, value]) => ({ name, value }))
    .filter(d => d.value > 0)
    .sort((a, b) => b.value - a.value);

  // Stock Status Data
  const statusData = [
    { name: 'An toàn', value: safeItems.length, color: '#10b981' },
    { name: 'Sắp hết', value: lowStockItems.length, color: '#f59e0b' },
    { name: 'Hết hạn', value: expiredItems.length, color: '#ef4444' },
  ].filter(d => d.value > 0);

  // Transaction History (Last 7 days)
  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return d.toISOString().split('T')[0];
  });

  const transactionHistory = last7Days.map(date => {
    const dayTransactions = transactions.filter(t => {
      const tDate = t.timestamp?.toDate ? t.timestamp.toDate().toISOString().split('T')[0] : '';
      return tDate === date;
    });
    const nhập = dayTransactions.filter(t => t.type === 'IN').reduce((sum, t) => sum + t.quantity, 0);
    const xuất = dayTransactions.filter(t => t.type === 'OUT').reduce((sum, t) => sum + t.quantity, 0);
    return {
      date: new Date(date).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' }),
      nhập,
      xuất
    };
  });

  // Top Consumed Items
  const topConsumed = Array.from(
    transactions
      .filter(t => t.type === 'OUT')
      .reduce((acc, t) => {
        const item = filteredItems.find(i => i.id === t.itemId);
        if (!item && globalSearch) return acc; // Filter out if not in search results
        const existing = acc.get(t.itemId) || 0;
        acc.set(t.itemId, existing + t.quantity);
        return acc;
      }, new Map<string, number>())
  )
    .map(([itemId, total]) => {
      const item = items.find(i => i.id === itemId);
      return { name: item?.name || 'Vật tư đã xóa', total, unit: item?.unit || '' };
    })
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1
      }
    }
  };

  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: {
      y: 0,
      opacity: 1
    }
  };

  return (
    <motion.div 
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-8 pb-8"
    >
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className={`text-2xl font-bold tracking-tight ${darkMode ? 'text-white' : 'text-slate-900'}`}>Tổng quan kho</h2>
          <p className={darkMode ? 'text-slate-400' : 'text-slate-500'}>Hệ thống quản lý vật tư y tế thông minh CDHA.</p>
          {globalSearch && (
            <div className={`mt-4 p-3 border rounded-xl flex items-center justify-between animate-in fade-in slide-in-from-top-2 duration-300 ${darkMode ? 'bg-blue-900/20 border-blue-800/30' : 'bg-blue-50 border-blue-100'}`}>
              <div className={`flex items-center gap-2 ${darkMode ? 'text-blue-300' : 'text-blue-700'}`}>
                <Search className="w-4 h-4" />
                <span className="text-sm font-medium">Đang lọc theo: <strong>"{globalSearch}"</strong></span>
              </div>
              <button 
                onClick={() => setActiveTab('inventory')}
                className={`text-xs font-semibold hover:underline ${darkMode ? 'text-blue-400' : 'text-blue-600'}`}
              >
                Xem chi tiết trong Kho vật tư
              </button>
            </div>
          )}
        </div>
        <div className="flex items-center gap-4">
          <div className={`flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-xl border shadow-sm ${darkMode ? 'bg-slate-800 border-slate-700 text-slate-300' : 'bg-white border-slate-200 text-slate-500'}`}>
            <Calendar className="w-4 h-4" />
            {new Date().toLocaleDateString('vi-VN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </div>
          <button 
            onClick={() => setActiveTab('assistant')}
            className="p-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors shadow-lg shadow-blue-100"
          >
            <BrainCircuit className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Main Stats Bento Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <motion.div variants={itemVariants}>
          <StatCard 
            label="Tổng vật tư" 
            value={filteredItems.length} 
            icon={<Package className="text-blue-600" />} 
            color={darkMode ? "bg-blue-900/30" : "bg-blue-50"}
            trend="+2.5%"
            isUp={true}
            darkMode={darkMode}
          />
        </motion.div>
        <motion.div variants={itemVariants}>
          <StatCard 
            label="Sắp hết hàng" 
            value={lowStockItems.length} 
            icon={<AlertTriangle className="text-amber-600" />} 
            color={darkMode ? "bg-amber-900/30" : "bg-amber-50"}
            trend={lowStockItems.length > 5 ? "+12%" : "-5%"}
            isUp={lowStockItems.length > 5}
            darkMode={darkMode}
          />
        </motion.div>
        <motion.div variants={itemVariants}>
          <StatCard 
            label="Giá trị kho" 
            value={totalValue.toLocaleString('vi-VN') + ' đ'} 
            icon={<FileText className="text-purple-600" />} 
            color={darkMode ? "bg-purple-900/30" : "bg-purple-50"}
            trend="+5.2%"
            isUp={true}
            darkMode={darkMode}
          />
        </motion.div>
        <motion.div variants={itemVariants}>
          <div className={`p-6 rounded-2xl border shadow-sm flex flex-col justify-between h-full group transition-colors ${darkMode ? 'bg-slate-800 border-slate-700 hover:border-blue-800' : 'bg-white border-slate-200 hover:border-blue-200'}`}>
            <div className="flex justify-between items-start">
              <p className={`text-sm font-medium ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Chỉ số sức khỏe kho</p>
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${healthScore > 80 ? (darkMode ? 'bg-emerald-900/30 text-emerald-400' : 'bg-emerald-50 text-emerald-600') : (darkMode ? 'bg-amber-900/30 text-amber-400' : 'bg-amber-50 text-amber-600')}`}>
                <CheckCircle2 className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-4">
              <div className="flex items-end gap-2">
                <p className={`text-3xl font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>{healthScore}%</p>
                <span className={`text-xs mb-1.5 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>An toàn</span>
              </div>
              <div className={`w-full h-2 rounded-full mt-3 overflow-hidden ${darkMode ? 'bg-slate-700' : 'bg-slate-100'}`}>
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: `${healthScore}%` }}
                  transition={{ duration: 1, ease: "easeOut" }}
                  className={`h-full rounded-full ${healthScore > 80 ? 'bg-emerald-500' : 'bg-amber-500'}`}
                />
              </div>
            </div>
          </div>
        </motion.div>
      </div>

      {/* AI & Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <motion.div variants={itemVariants} className="lg:col-span-2">
          <div className="bg-gradient-to-br from-blue-600 to-indigo-700 p-8 rounded-2xl shadow-xl shadow-blue-200 text-white relative overflow-hidden h-full">
            <div className="relative z-10 h-full flex flex-col">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-md">
                    <BrainCircuit className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold">Phân tích AI thông minh</h3>
                    <p className="text-blue-100 text-xs">Dự báo và tối ưu hóa tồn kho</p>
                  </div>
                </div>
                <button 
                  onClick={onRunAnalysis}
                  disabled={isAnalyzing}
                  className="px-6 py-2 bg-white text-blue-600 hover:bg-blue-50 rounded-xl text-sm font-bold transition-all flex items-center gap-2 shadow-lg shadow-black/10 disabled:opacity-50"
                >
                  {isAnalyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <TrendingUp className="w-4 h-4" />}
                  {aiAnalysis ? 'Cập nhật phân tích' : 'Chạy phân tích'}
                </button>
              </div>
              
              <div className="flex-1 bg-white/10 p-6 rounded-2xl backdrop-blur-sm border border-white/10 overflow-hidden relative">
                {aiAnalysis ? (
                  <div className="h-full flex flex-col justify-center">
                    <p className="text-lg font-medium text-blue-50 leading-relaxed italic">
                      "{aiAnalysis.summary}"
                    </p>
                    <div className="mt-4 flex gap-2">
                      {aiAnalysis.alerts.length > 0 && (
                        <span className="px-2 py-1 bg-red-500/20 text-red-100 text-[10px] font-bold rounded-lg border border-red-500/30">
                          {aiAnalysis.alerts.length} Cảnh báo
                        </span>
                      )}
                      {aiAnalysis.recommendations.length > 0 && (
                        <span className="px-2 py-1 bg-emerald-500/20 text-emerald-100 text-[10px] font-bold rounded-lg border border-emerald-500/30">
                          {aiAnalysis.recommendations.length} Đề xuất
                        </span>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-center space-y-4">
                    <div className="w-16 h-16 bg-white/10 rounded-full flex items-center justify-center animate-pulse">
                      <BrainCircuit className="w-8 h-8 text-blue-200" />
                    </div>
                    <p className="text-blue-100 text-sm max-w-xs">Nhấn nút để AI phân tích dữ liệu kho và đưa ra các đề xuất tối ưu.</p>
                  </div>
                )}
                {aiAnalysis && (
                  <button 
                    onClick={() => setActiveTab('assistant')}
                    className="absolute bottom-4 right-4 text-xs font-bold text-white hover:underline flex items-center gap-1"
                  >
                    Xem chi tiết <ChevronRight className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
            <div className="absolute -right-20 -bottom-20 opacity-10 pointer-events-none">
              <BrainCircuit size={300} />
            </div>
          </div>
        </motion.div>

        <motion.div variants={itemVariants}>
          <div className={`p-6 rounded-2xl border shadow-sm h-full ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
            <h3 className={`text-lg font-bold mb-6 flex items-center gap-2 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
              <TrendingUp className="w-5 h-5 text-blue-600" />
              Thao tác nhanh
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <QuickActionButton 
                icon={<Plus />} 
                label="Thêm vật tư" 
                color="blue" 
                onClick={() => setActiveTab('inventory')} 
                darkMode={darkMode}
              />
              <QuickActionButton 
                icon={<ArrowLeftRight />} 
                label="Nhập/Xuất Tồn" 
                color="emerald" 
                onClick={() => setActiveTab('transactions')} 
                darkMode={darkMode}
              />
              <QuickActionButton 
                icon={<FileText />} 
                label="Báo cáo" 
                color="purple" 
                onClick={() => setActiveTab('reports')} 
                darkMode={darkMode}
              />
              <QuickActionButton 
                icon={<Download />} 
                label="Nhập Excel" 
                color="amber" 
                onClick={() => setActiveTab('inventory')} 
                darkMode={darkMode}
              />
            </div>
            
            <div className={`mt-8 p-4 rounded-2xl border ${darkMode ? 'bg-slate-700/50 border-slate-700' : 'bg-slate-50 border-slate-100'}`}>
              <div className="flex items-center justify-between mb-4">
                <h4 className={`text-xs font-bold uppercase tracking-wider ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Tiêu thụ nhiều nhất</h4>
                <TrendingDown className="w-3 h-3 text-red-500" />
              </div>
              <div className="space-y-3">
                {topConsumed.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between">
                    <span className={`text-sm truncate max-w-[120px] ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>{item.name}</span>
                    <span className={`text-xs font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>{formatQty(item.total)} {item.unit}</span>
                  </div>
                ))}
                {topConsumed.length === 0 && <p className="text-xs text-slate-400 italic">Chưa có dữ liệu xuất kho.</p>}
              </div>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Main Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <motion.div variants={itemVariants} className="lg:col-span-2 min-w-0">
          <div className={`p-6 rounded-2xl border shadow-sm min-w-0 ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
            <div className="flex items-center justify-between mb-8">
              <div>
                <h3 className={`text-lg font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>Lưu lượng giao dịch</h3>
                <p className={`text-xs ${darkMode ? 'text-slate-500' : 'text-slate-500'}`}>Thống kê nhập/xuất trong 7 ngày gần nhất</p>
              </div>
              <div className="flex items-center gap-4 text-xs font-semibold">
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                  <span className={darkMode ? 'text-slate-400' : 'text-slate-600'}>Nhập kho</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
                  <span className={darkMode ? 'text-slate-400' : 'text-slate-600'}>Xuất kho</span>
                </div>
              </div>
            </div>
            <div className="h-80 min-h-[320px] w-full">
              {isChartReady && transactionHistory.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={200} debounce={100}>
                  <AreaChart data={transactionHistory} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorIn" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.1}/>
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="colorOut" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.1}/>
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={darkMode ? "#334155" : "#f1f5f9"} />
                    <XAxis 
                      dataKey="date" 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{fill: darkMode ? '#94a3b8' : '#64748b', fontSize: 12}} 
                      dy={10}
                    />
                    <YAxis 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{fill: darkMode ? '#94a3b8' : '#64748b', fontSize: 12}} 
                    />
                    <Tooltip 
                      contentStyle={{
                        borderRadius: '16px', 
                        border: 'none', 
                        boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)',
                        backgroundColor: darkMode ? '#1e293b' : '#ffffff',
                        color: darkMode ? '#ffffff' : '#000000'
                      }}
                      itemStyle={{ color: darkMode ? '#cbd5e1' : '#475569' }}
                    />
                    <Area 
                      type="monotone" 
                      dataKey="nhập" 
                      stroke="#3b82f6" 
                      strokeWidth={4}
                      fillOpacity={1} 
                      fill="url(#colorIn)" 
                    />
                    <Area 
                      type="monotone" 
                      dataKey="xuất" 
                      stroke="#10b981" 
                      strokeWidth={4}
                      fillOpacity={1} 
                      fill="url(#colorOut)" 
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : null}
            </div>
          </div>
        </motion.div>

        <motion.div variants={itemVariants} className="min-w-0">
          <div className={`p-6 rounded-2xl border shadow-sm flex flex-col h-full min-w-0 ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
            <h3 className={`text-lg font-bold mb-2 ${darkMode ? 'text-white' : 'text-slate-900'}`}>Tình trạng tồn kho</h3>
            <p className={`text-xs mb-6 ${darkMode ? 'text-slate-500' : 'text-slate-500'}`}>Phân loại vật tư theo mức độ an toàn</p>
            <div className="flex-1 min-h-[250px] relative w-full">
              {isChartReady && statusData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={200} debounce={100}>
                  <PieChart>
                    <Pie
                      data={statusData}
                      cx="50%"
                      cy="50%"
                      innerRadius={70}
                      outerRadius={90}
                      paddingAngle={8}
                      dataKey="value"
                      stroke="none"
                    >
                      {statusData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip 
                      contentStyle={{
                        borderRadius: '16px', 
                        border: 'none', 
                        boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)',
                        backgroundColor: darkMode ? '#1e293b' : '#ffffff',
                        color: darkMode ? '#ffffff' : '#000000'
                      }}
                      itemStyle={{ color: darkMode ? '#cbd5e1' : '#475569' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : null}
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className={`text-3xl font-black ${darkMode ? 'text-white' : 'text-slate-900'}`}>{items.length}</span>
                <span className={`text-[10px] font-bold uppercase tracking-widest ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>Vật tư</span>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 mt-6">
              {statusData.map((item, idx) => (
                <div key={idx} className={`flex items-center justify-between p-3 rounded-xl border ${darkMode ? 'bg-slate-700/50 border-slate-700' : 'bg-slate-50 border-slate-100'}`}>
                  <div className="flex items-center gap-3">
                    <div className="w-2.5 h-2.5 rounded-full" style={{backgroundColor: item.color}}></div>
                    <span className={`text-sm font-medium ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>{item.name}</span>
                  </div>
                  <span className={`text-sm font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>{item.value}</span>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Category Distribution Chart */}
        <motion.div variants={itemVariants} className="min-w-0">
          <div className={`p-6 rounded-2xl border shadow-sm min-w-0 ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
            <div className="flex items-center justify-between mb-8">
              <div>
                <h3 className={`text-lg font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>Phân bổ theo nhóm</h3>
                <p className={`text-xs ${darkMode ? 'text-slate-500' : 'text-slate-500'}`}>Số lượng loại vật tư trong mỗi nhóm</p>
              </div>
              <Filter className="w-4 h-4 text-slate-400" />
            </div>
            <div className="h-96 min-h-[384px] w-full">
              {isChartReady && categoryData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={200} debounce={100}>
                  <BarChart data={categoryData.slice(0, 5)} layout="vertical" margin={{ left: 20, right: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={darkMode ? "#334155" : "#f1f5f9"} />
                    <XAxis type="number" hide />
                    <YAxis 
                      dataKey="name" 
                      type="category" 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{fill: darkMode ? '#94a3b8' : '#64748b', fontSize: 11}} 
                      width={120}
                    />
                    <Tooltip 
                      cursor={{fill: darkMode ? '#334155' : '#f8fafc'}}
                      contentStyle={{
                        borderRadius: '16px', 
                        border: 'none', 
                        boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)',
                        backgroundColor: darkMode ? '#1e293b' : '#ffffff',
                        color: darkMode ? '#ffffff' : '#000000'
                      }}
                      itemStyle={{ color: darkMode ? '#cbd5e1' : '#475569' }}
                    />
                    <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={24}>
                      {categoryData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ec4899'][index % 5]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : null}
            </div>
          </div>
        </motion.div>

        {/* Alerts & Recent Transactions */}
        <motion.div variants={itemVariants}>
          <div className={`p-6 rounded-2xl border shadow-sm h-full ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
            <div className="flex items-center justify-between mb-8">
              <div>
                <h3 className={`text-lg font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>Cảnh báo & Gần đây</h3>
                <p className={`text-xs ${darkMode ? 'text-slate-500' : 'text-slate-500'}`}>Các sự kiện cần chú ý trong kho</p>
              </div>
              <button 
                onClick={() => setActiveTab('transactions')}
                className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-colors ${darkMode ? 'text-blue-400 hover:text-blue-300 bg-blue-900/30' : 'text-blue-600 hover:text-blue-700 bg-blue-50'}`}
              >
                Xem tất cả
              </button>
            </div>
            <div className="space-y-4">
              <AnimatePresence>
                {lowStockItems.slice(0, 3).map((item, idx) => (
                  <motion.div 
                    key={`alert-${item.id}`}
                    initial={{ x: -20, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{ delay: idx * 0.1 }}
                    className={`flex items-center gap-4 p-4 rounded-2xl border group transition-colors cursor-pointer ${darkMode ? 'bg-amber-900/20 border-amber-900/30 hover:bg-amber-900/30' : 'bg-amber-50 border-amber-100 hover:bg-amber-100'}`}
                    onClick={() => setActiveTab('inventory')}
                  >
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform ${darkMode ? 'bg-slate-800' : 'bg-white'}`}>
                      <AlertTriangle className="w-6 h-6 text-amber-600" />
                    </div>
                    <div className="flex-1">
                      <p className={`text-sm font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>{item.name}</p>
                      <p className={`text-xs ${darkMode ? 'text-slate-500' : 'text-slate-500'}`}>Tồn kho thấp: <span className={`font-bold ${darkMode ? 'text-amber-400' : 'text-amber-700'}`}>{formatQty(item.currentStock)} {item.unit}</span> (Tối thiểu: {item.minStock})</p>
                    </div>
                    <ArrowUpRight className="w-4 h-4 text-slate-400 group-hover:text-amber-600" />
                  </motion.div>
                ))}
                {transactions.slice(0, 3).map((t, idx) => {
                  const item = items.find(i => i.id === t.itemId);
                  return (
                    <motion.div 
                      key={`trans-${t.id}`}
                      initial={{ x: -20, opacity: 0 }}
                      animate={{ x: 0, opacity: 1 }}
                      transition={{ delay: (lowStockItems.length + idx) * 0.1 }}
                      className={`flex items-center gap-4 p-4 rounded-2xl border group transition-all cursor-pointer ${darkMode ? 'bg-slate-700/30 border-slate-700 hover:bg-slate-700/50 hover:shadow-lg hover:shadow-black/20' : 'bg-slate-50 border-slate-100 hover:bg-white hover:shadow-md'}`}
                      onClick={() => setActiveTab('transactions')}
                    >
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform ${t.type === 'IN' ? (darkMode ? 'bg-blue-900/30 text-blue-400' : 'bg-blue-50 text-blue-600') : (darkMode ? 'bg-emerald-900/30 text-emerald-400' : 'bg-emerald-50 text-emerald-600')}`}>
                        {t.type === 'IN' ? <ArrowUpRight className="w-6 h-6" /> : <ArrowDownRight className="w-6 h-6" />}
                      </div>
                      <div className="flex-1">
                        <p className={`text-sm font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>{item?.name || 'Vật tư đã xóa'}</p>
                        <p className={`text-xs ${darkMode ? 'text-slate-500' : 'text-slate-500'}`}>{t.type === 'IN' ? 'Nhập kho' : 'Xuất kho'}: <span className={`font-bold ${t.type === 'IN' ? 'text-blue-600' : 'text-emerald-600'}`}>{formatQty(t.quantity)} {item?.unit}</span></p>
                      </div>
                      <div className="text-right">
                        <span className={`text-[10px] font-bold block uppercase ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>{new Date(t.timestamp?.toDate ? t.timestamp.toDate() : t.timestamp).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })}</span>
                        <Clock className={`w-3 h-3 ml-auto mt-1 ${darkMode ? 'text-slate-600' : 'text-slate-300'}`} />
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
              {lowStockItems.length === 0 && transactions.length === 0 && (
                <div className="text-center py-20">
                  <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4 ${darkMode ? 'bg-slate-700' : 'bg-slate-50'}`}>
                    <CheckCircle2 className={`w-10 h-10 ${darkMode ? 'text-slate-600' : 'text-slate-200'}`} />
                  </div>
                  <p className={`text-sm font-medium ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>Kho hàng đang ở trạng thái lý tưởng.</p>
                </div>
              )}
            </div>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}

function QuickActionButton({ icon, label, color, onClick, darkMode }: { icon: any, label: string, color: string, onClick: () => void, darkMode?: boolean }) {
  const colors: any = {
    blue: darkMode ? 'bg-blue-900/30 text-blue-400 border-blue-800/50 hover:bg-blue-900/50' : 'bg-blue-50 text-blue-600 hover:bg-blue-100 border-blue-100',
    emerald: darkMode ? 'bg-emerald-900/30 text-emerald-400 border-emerald-800/50 hover:bg-emerald-900/50' : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100 border-emerald-100',
    purple: darkMode ? 'bg-purple-900/30 text-purple-400 border-purple-800/50 hover:bg-purple-900/50' : 'bg-purple-50 text-purple-600 hover:bg-purple-100 border-purple-100',
    amber: darkMode ? 'bg-amber-900/30 text-amber-400 border-amber-800/50 hover:bg-amber-900/50' : 'bg-amber-50 text-amber-600 hover:bg-amber-100 border-amber-100',
    pink: darkMode ? 'bg-pink-900/30 text-pink-400 border-pink-800/50 hover:bg-pink-900/50' : 'bg-pink-50 text-pink-600 hover:bg-pink-100 border-pink-100',
  };

  return (
    <button 
      onClick={onClick}
      className={`flex flex-col items-center justify-center gap-3 p-4 rounded-2xl border transition-all active:scale-95 ${colors[color]}`}
    >
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-sm ${darkMode ? 'bg-slate-800' : 'bg-white'}`}>
        {React.cloneElement(icon, { className: 'w-5 h-5' })}
      </div>
      <span className="text-xs font-bold tracking-tight">{label}</span>
    </button>
  );
}

function StatCard({ label, value, icon, color, trend, isUp, darkMode }: { label: string, value: string | number, icon: any, color: string, trend?: string, isUp?: boolean, darkMode?: boolean }) {
  return (
    <div className={`p-6 rounded-2xl border shadow-sm relative overflow-hidden group transition-colors ${darkMode ? 'bg-slate-800 border-slate-700 hover:border-blue-800' : 'bg-white border-slate-200 hover:border-blue-200'}`}>
      <div className="flex justify-between items-start mb-4">
        <div className={`w-12 h-12 ${color} rounded-xl flex items-center justify-center transition-transform group-hover:scale-110`}>
          {icon}
        </div>
        {trend && (
          <div className={`flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-lg ${isUp ? (darkMode ? 'text-emerald-400 bg-emerald-900/30' : 'text-emerald-600 bg-emerald-50') : (darkMode ? 'text-red-400 bg-red-900/30' : 'text-red-600 bg-red-50')}`}>
            {isUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {trend}
          </div>
        )}
      </div>
      <div>
        <p className={`text-sm font-medium mb-1 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>{label}</p>
        <p className={`text-3xl font-bold tracking-tight ${darkMode ? 'text-white' : 'text-slate-900'}`}>{value.toLocaleString()}</p>
      </div>
      <div className="absolute -right-4 -bottom-4 opacity-[0.03] group-hover:opacity-[0.06] transition-opacity">
        {React.cloneElement(icon, { size: 100 })}
      </div>
    </div>
  );
}

function RoomSelect({ 
  value, 
  onChange, 
  departments, 
  darkMode, 
  placeholder = "Chọn phòng..." 
}: { 
  value: string, 
  onChange: (val: string) => void, 
  departments: Department[], 
  darkMode?: boolean,
  placeholder?: string
}) {
  const [isAdding, setIsAdding] = useState(false);
  const [newRoom, setNewRoom] = useState('');

  const handleAdd = async () => {
    if (!newRoom.trim()) {
      setIsAdding(false);
      return;
    }
    const existing = departments.find(d => d.name.toLowerCase() === newRoom.trim().toLowerCase());
    if (existing) {
      onChange(existing.id);
    } else {
      try {
        const docRef = await addDoc(collection(db, "departments"), { name: newRoom.trim() });
        onChange(docRef.id);
      } catch (error) {
        toast.error("Lỗi khi thêm phòng mới");
      }
    }
    setNewRoom('');
    setIsAdding(false);
  };

  if (isAdding) {
    return (
      <div className="flex gap-2">
        <input 
          autoFocus
          type="text"
          className={`flex-1 px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${darkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-white border-slate-200 text-slate-900'}`}
          placeholder="Tên phòng mới..."
          value={newRoom}
          onChange={e => setNewRoom(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleAdd();
            }
            if (e.key === 'Escape') setIsAdding(false);
          }}
        />
        <button 
          type="button"
          onClick={handleAdd}
          className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex gap-2">
      <select 
        className={`flex-1 px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${darkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-white border-slate-200 text-slate-900'}`}
        value={value}
        onChange={e => {
          if (e.target.value === 'ADD_NEW') {
            setIsAdding(true);
          } else {
            onChange(e.target.value);
          }
        }}
      >
        <option value="">{placeholder}</option>
        {departments.filter(d => d.name !== 'Tất cả' && d.name !== 'Tất cả phòng').map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        <option value="ADD_NEW">+ Thêm phòng mới...</option>
      </select>
    </div>
  );
}

function Inventory({ items, transactions, categories, departments, globalSearch, darkMode }: { items: Item[], transactions: Transaction[], categories: Category[], departments: Department[], globalSearch: string, darkMode?: boolean }) {
  const [showAdd, setShowAdd] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [newItem, setNewItem] = useState({ 
    name: '', 
    code: '',
    categoryId: '', 
    departmentId: '', 
    unit: '', 
    specification: '',
    manufacturer: '',
    minStock: '0', 
    currentStock: '0', 
    batchNumber: '',
    expiryDate: '', 
    price: '0',
    note: ''
  });
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [editForm, setEditForm] = useState({ 
    name: '', 
    code: '',
    categoryId: '', 
    departmentId: '', 
    unit: '', 
    specification: '',
    manufacturer: '',
    minStock: '0', 
    expiryDate: '', 
    price: '0',
    note: ''
  });
  const [nameSuggestions, setNameSuggestions] = useState<Item[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Lot/Batch Management Modal State
  const [selectedBatchItem, setSelectedBatchItem] = useState<Item | null>(null);
  const [currentBatches, setCurrentBatches] = useState<ItemBatch[]>([]);
  const [newBatchForm, setNewBatchForm] = useState({
    batchNumber: '',
    quantity: '',
    expiryDate: '',
    importDate: new Date().toISOString().split('T')[0],
    note: ''
  });
  const [isSavingBatches, setIsSavingBatches] = useState(false);

  const handleOpenBatchManager = (item: Item) => {
    setSelectedBatchItem(item);
    const existing = getItemBatches(item);
    setCurrentBatches(existing);
    setNewBatchForm({
      batchNumber: `Lô ${new Date().getFullYear()}-${String(existing.length + 1).padStart(2, '0')}`,
      quantity: '',
      expiryDate: '',
      importDate: new Date().toISOString().split('T')[0],
      note: ''
    });
  };

  const handleAddBatchToItem = (e: React.FormEvent) => {
    e.preventDefault();
    const qty = parseFloat(newBatchForm.quantity);
    if (isNaN(qty) || qty <= 0) {
      toast.error('Số lượng lô phải lớn hơn 0!');
      return;
    }

    const exp = newBatchForm.expiryDate.trim();
    const existingIdx = currentBatches.findIndex(b => (b.expiryDate || '').trim() === exp);

    if (existingIdx >= 0) {
      const existing = currentBatches[existingIdx];
      const updatedQty = Number((existing.quantity + qty).toFixed(10));
      setCurrentBatches(prev => prev.map((b, idx) => idx === existingIdx ? { ...b, quantity: updatedQty } : b));
      toast.success(`Hạn dùng trùng với "${existing.batchNumber}", đã tự động cộng gộp thêm ${formatQty(qty)}!`);
    } else {
      let lotName = newBatchForm.batchNumber.trim();
      if (!lotName) {
        const nextNum = currentBatches.length + 1;
        lotName = `Lô ${String(nextNum).padStart(2, '0')}`;
        let ctr = nextNum;
        while (currentBatches.some(b => b.batchNumber.trim().toLowerCase() === lotName.toLowerCase())) {
          ctr++;
          lotName = `Lô ${String(ctr).padStart(2, '0')}`;
        }
      }

      const newBatch: ItemBatch = {
        id: `batch-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        batchNumber: lotName,
        quantity: Number(qty.toFixed(10)),
        expiryDate: exp,
        importDate: newBatchForm.importDate || new Date().toISOString().split('T')[0],
        note: newBatchForm.note.trim()
      };

      setCurrentBatches(prev => [...prev, newBatch]);
      toast.success(`Đã tự động tạo mới "${lotName}" (${formatQty(qty)})!`);
    }

    setNewBatchForm({
      batchNumber: '',
      quantity: '',
      expiryDate: '',
      importDate: new Date().toISOString().split('T')[0],
      note: ''
    });
  };

  const handleUpdateBatchQuantity = (batchId: string, newQtyStr: string) => {
    const qty = parseFloat(newQtyStr);
    if (isNaN(qty) || qty < 0) return;
    setCurrentBatches(prev => prev.map(b => b.id === batchId ? { ...b, quantity: Number(qty.toFixed(10)) } : b));
  };

  const handleUpdateBatchExpiry = (batchId: string, newExpiry: string) => {
    setCurrentBatches(prev => prev.map(b => b.id === batchId ? { ...b, expiryDate: newExpiry } : b));
  };

  const handleUpdateBatchNumber = (batchId: string, newNumber: string) => {
    setCurrentBatches(prev => prev.map(b => b.id === batchId ? { ...b, batchNumber: newNumber } : b));
  };

  const handleDeleteBatch = (batchId: string) => {
    setCurrentBatches(prev => prev.filter(b => b.id !== batchId));
  };

  const handleSaveBatchesToFirestore = async () => {
    if (!selectedBatchItem) return;
    setIsSavingBatches(true);
    try {
      const { currentStock, expiryDate } = syncBatchesToItem(currentBatches);
      await updateDoc(doc(db, "items", selectedBatchItem.id), {
        batches: currentBatches,
        currentStock,
        expiryDate
      });
      toast.success(`Đã lưu ${currentBatches.length} lô! Tồn kho đồng bộ thành: ${formatQty(currentStock)} ${selectedBatchItem.unit}`);
      setSelectedBatchItem(null);
    } catch (err) {
      toast.error('Lỗi khi lưu thông tin lô');
      handleFirestoreError(err, OperationType.UPDATE, `items/${selectedBatchItem.id}`);
    } finally {
      setIsSavingBatches(false);
    }
  };

  useEffect(() => {
    if (newItem.name.trim().length > 0 && showAdd) {
      const filtered = items.filter(i => {
        const matchesName = i.name.toLowerCase().includes(newItem.name.toLowerCase());
        const matchesCategory = newItem.categoryId ? i.categoryId === newItem.categoryId : true;
        return matchesName && matchesCategory;
      });
      setNameSuggestions(filtered.slice(0, 5));
      setShowSuggestions(filtered.length > 0);
    } else {
      setShowSuggestions(false);
    }
  }, [newItem.name, newItem.categoryId, items, showAdd]);

  const handleSelectSuggestion = (item: Item) => {
    setNewItem({
      name: item.name,
      code: item.code || '',
      categoryId: item.categoryId,
      departmentId: item.departmentId || '',
      unit: item.unit,
      specification: item.specification || '',
      manufacturer: item.manufacturer || '',
      minStock: item.minStock.toString(),
      currentStock: item.currentStock.toString(),
      batchNumber: item.batches?.[0]?.batchNumber || '',
      expiryDate: item.expiryDate || '',
      price: (item.price || 0).toString(),
      note: item.note || ''
    });
    setShowSuggestions(false);
  };
  
  // Selection State
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Filtering & Sorting States
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategoryName, setFilterCategoryName] = useState('');
  const [filterDeptId, setFilterDeptId] = useState('');
  const [filterStatus, setFilterStatus] = useState('all'); // all, low, expired, safe
  const [sortKey, setSortKey] = useState<keyof Item>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isImporting, setIsImporting] = useState(false);

  const handleExportItemsExcel = () => {
    const data = filteredAndSortedItems.map((item, idx) => {
      const cat = categories.find(c => c.id === item.categoryId);
      const dept = departments.find(d => d.id === item.departmentId);
      const batches = getItemBatches(item);
      const batchSummary = batches.map(b => `${b.batchNumber}: ${formatQty(b.quantity)} (HSD: ${b.expiryDate || 'N/A'})`).join('; ');
      return {
        'MaVatTu': item.code || `VT-${String(idx + 1).padStart(3, '0')}`,
        'TenVatTu': item.name,
        'MaNhom': cat?.code || cat?.name || '-',
        'DonViTinh': item.unit,
        'QuyCach': item.specification || '',
        'HangSanXuat': item.manufacturer || '',
        'TonToiThieu': item.minStock,
        'TonHienTai': item.currentStock,
        'CacLoChiTiet': batchSummary || 'Không có lô',
        'DonGia': item.price || 0,
        'HanSuDung': item.expiryDate || '',
        'MaPhongBan': dept?.name || '-',
        'GhiChu': item.note || ''
      };
    });
    const ws = XLSX.utils.json_to_sheet(data);
    ws['!cols'] = [
      { wch: 14 }, { wch: 40 }, { wch: 14 }, { wch: 12 }, { wch: 25 },
      { wch: 22 }, { wch: 14 }, { wch: 14 }, { wch: 35 }, { wch: 14 }, { wch: 14 },
      { wch: 18 }, { wch: 35 }
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "DanhSach_VatTu");
    XLSX.writeFile(wb, `DanhSach_VatTu_CDHA_${new Date().toISOString().split('T')[0]}.xlsx`);
    toast.success('Đã xuất danh sách vật tư theo chuẩn Google Sheets!');
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const minStock = parseFloat(newItem.minStock) || 0;
      const currentStock = parseFloat(newItem.currentStock) || 0;
      const price = parseFloat(newItem.price) || 0;

      const initialBatchNumber = newItem.batchNumber.trim() || 'Lô 01';
      const initialBatches: ItemBatch[] = (currentStock > 0 || newItem.expiryDate) ? [{
        id: `batch-${Date.now()}`,
        batchNumber: initialBatchNumber,
        quantity: currentStock,
        expiryDate: newItem.expiryDate || '',
        importDate: new Date().toISOString().split('T')[0],
        note: 'Lô tạo khi thêm mới'
      }] : [];

      const itemRef = await addDoc(collection(db, "items"), {
        name: newItem.name,
        code: newItem.code,
        categoryId: newItem.categoryId,
        departmentId: newItem.departmentId,
        unit: newItem.unit,
        specification: newItem.specification,
        manufacturer: newItem.manufacturer,
        minStock,
        currentStock,
        expiryDate: newItem.expiryDate,
        price,
        note: newItem.note,
        batches: initialBatches,
        createdAt: serverTimestamp()
      });

      // Create initial transaction if stock > 0
      if (currentStock > 0) {
        await addDoc(collection(db, "transactions"), {
          code: `PN-INIT-${Date.now().toString().slice(-6)}`,
          itemId: itemRef.id,
          type: 'IN',
          quantity: currentStock,
          unitPrice: price,
          totalAmount: currentStock * price,
          batchNumber: initialBatchNumber,
          batchExpiry: newItem.expiryDate,
          toDeptId: newItem.departmentId,
          timestamp: serverTimestamp(),
          note: 'Nhập kho ban đầu'
        });
      }

      setShowAdd(false);
      setNewItem({ 
        name: '', 
        code: '',
        categoryId: '', 
        departmentId: '', 
        unit: '', 
        specification: '',
        manufacturer: '',
        minStock: '0', 
        currentStock: '0', 
        batchNumber: '',
        expiryDate: '', 
        price: '0',
        note: ''
      });
      toast.success('Thêm vật tư thành công!');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, "items");
    }
  };

  const handleEdit = (item: Item) => {
    setEditingItem(item);
    setEditForm({
      name: item.name,
      code: item.code || '',
      categoryId: item.categoryId,
      departmentId: item.departmentId || '',
      unit: item.unit,
      specification: item.specification || '',
      manufacturer: item.manufacturer || '',
      minStock: item.minStock.toString(),
      expiryDate: item.expiryDate || '',
      price: (item.price || 0).toString(),
      note: item.note || ''
    });
    setShowEdit(true);
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem) return;
    try {
      const minStock = parseFloat(editForm.minStock) || 0;
      const price = parseFloat(editForm.price) || 0;

      await updateDoc(doc(db, "items", editingItem.id), {
        ...editForm,
        minStock,
        price
      });

      setShowEdit(false);
      setEditingItem(null);
      toast.success("Cập nhật vật tư thành công!");
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `items/${editingItem.id}`);
    }
  };

  const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames.find(n => n.toLowerCase().includes('danhsach') || n.toLowerCase().includes('vattu')) || wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws) as any[];

        // Local cache for categories and departments
        const batchCategories = new Map<string, string>(); // name or code -> id
        categories.forEach(c => {
          batchCategories.set(c.name.toLowerCase(), c.id);
          if (c.code) batchCategories.set(c.code.toLowerCase(), c.id);
        });

        const batchDepts = new Map<string, string>();
        departments.forEach(d => {
          batchDepts.set(d.name.toLowerCase(), d.id);
          if (d.code) batchDepts.set(d.code.toLowerCase(), d.id);
        });

        for (const row of data) {
          // Map category name or code to ID
          let categoryId = '';
          const categoryName = (row['MaNhom'] || row['Nhóm'] || row['Category'] || row['Mã nhóm'] || '').toString().trim();
          if (categoryName) {
            const normalizedName = categoryName.toLowerCase();
            if (batchCategories.has(normalizedName)) {
              categoryId = batchCategories.get(normalizedName)!;
            } else {
              try {
                const docRef = await addDoc(collection(db, "categories"), { 
                  name: categoryName,
                  code: categoryName.toUpperCase().replace(/\s+/g, '_'),
                  description: 'Tự động tạo từ import',
                  status: 'Hoạt động'
                });
                categoryId = docRef.id;
                batchCategories.set(normalizedName, categoryId);
              } catch (err) {
                handleFirestoreError(err, OperationType.CREATE, "categories");
              }
            }
          }

          const deptName = (row['MaPhongBan'] || row['Phòng'] || row['Department'] || row['Phòng ban'] || '').toString().trim();
          let departmentId = '';
          if (deptName) {
            departmentId = batchDepts.get(deptName.toLowerCase()) || '';
          }

          try {
            const initialStock = Number(row['TonHienTai'] ?? row['Tồn hiện tại'] ?? row['Tồn kho'] ?? row['CurrentStock'] ?? 0);
            const price = Number(row['DonGia'] ?? row['Đơn giá'] ?? row['Price'] ?? 0);
            const code = (row['MaVatTu'] || row['Mã vật tư'] || row['Code'] || '').toString().trim();
            const specification = (row['QuyCach'] || row['Quy cách'] || row['Specification'] || '').toString().trim();
            const manufacturer = (row['HangSanXuat'] || row['Hãng sản xuất'] || row['Manufacturer'] || '').toString().trim();
            const note = (row['GhiChu'] || row['Ghi chú'] || row['Note'] || '').toString().trim();

            const itemRef = await addDoc(collection(db, "items"), {
              name: row['TenVatTu'] || row['Tên vật tư'] || row['Name'] || 'Chưa đặt tên',
              code: code || `VT-${Date.now().toString().slice(-4)}`,
              categoryId: categoryId || (categories[0]?.id || ''),
              departmentId,
              unit: row['DonViTinh'] || row['Đơn vị'] || row['Đơn vị tính'] || row['Unit'] || 'Cái',
              specification,
              manufacturer,
              minStock: Number(row['TonToiThieu'] ?? row['Tồn tối thiểu'] ?? row['MinStock'] ?? 0),
              currentStock: initialStock,
              expiryDate: normalizeDate(row['HanSuDung'] || row['Hạn sử dụng'] || row['ExpiryDate']),
              price,
              note,
              createdAt: serverTimestamp()
            });

            // Create initial transaction if stock > 0
            if (initialStock > 0) {
              await addDoc(collection(db, "transactions"), {
                code: `PN-INIT-${Date.now().toString().slice(-6)}`,
                itemId: itemRef.id,
                type: 'IN',
                quantity: initialStock,
                unitPrice: price,
                totalAmount: initialStock * price,
                toDeptId: departmentId,
                timestamp: serverTimestamp(),
                note: 'Nhập kho ban đầu (Import)'
              });
            }
          } catch (err) {
            handleFirestoreError(err, OperationType.CREATE, "items");
          }
        }
        toast.success(`Đã nhập thành công ${data.length} vật tư.`);
      } catch (error) {
        console.error("Import Error:", error);
        toast.error("Có lỗi xảy ra khi nhập file Excel. Vui lòng kiểm tra lại định dạng file.");
      } finally {
        setIsImporting(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleSort = (key: keyof Item) => {
    if (sortKey === key) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortOrder('asc');
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === filteredAndSortedItems.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredAndSortedItems.map(i => i.id));
    }
  };

  const handleBulkDelete = async () => {
    try {
      for (const id of selectedIds) {
        try {
          await deleteDoc(doc(db, "items", id));
        } catch (err) {
          handleFirestoreError(err, OperationType.DELETE, `items/${id}`);
        }
      }
      setSelectedIds([]);
      setShowDeleteConfirm(false);
      toast.success(`Đã xóa thành công ${selectedIds.length} vật tư.`);
    } catch (error) {
      console.error("Delete Error:", error);
      toast.error("Có lỗi xảy ra khi xóa vật tư.");
    }
  };

  const uniqueCategories = useMemo(() => {
    const map = new Map<string, Category>();
    categories.forEach(cat => {
      const normalizedName = cat.name.trim().toLowerCase();
      if (!map.has(normalizedName)) {
        map.set(normalizedName, cat);
      }
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [categories]);

  const filteredAndSortedItems = useMemo(() => {
    return items
      .filter(item => {
        const matchesSearch = (
          matchesSearchQuery(item.name, searchTerm) ||
          matchesSearchQuery(item.code, searchTerm) ||
          matchesSearchQuery(item.specification, searchTerm) ||
          matchesSearchQuery(item.manufacturer, searchTerm)
        ) && (
          matchesSearchQuery(item.name, globalSearch) ||
          matchesSearchQuery(item.code, globalSearch)
        );
        
        let matchesCategory = true;
        if (filterCategoryName !== '') {
          const itemCat = categories.find(c => c.id === item.categoryId);
          // Normalize both for comparison to handle duplicates in DB
          matchesCategory = itemCat?.name.trim().toLowerCase() === filterCategoryName.trim().toLowerCase();
        }
        
        const matchesDept = !filterDeptId || item.departmentId === filterDeptId;
        
        const isLow = item.currentStock <= item.minStock;
        const isExpired = item.expiryDate && new Date(item.expiryDate) < new Date();
        
        let matchesStatus = true;
        if (filterStatus === 'low') matchesStatus = isLow;
        if (filterStatus === 'expired') matchesStatus = !!isExpired;
        if (filterStatus === 'safe') matchesStatus = !isLow && !isExpired;
        
        return matchesSearch && matchesCategory && matchesDept && matchesStatus;
      })
      .sort((a, b) => {
      // Priority Sorting: Expired > Nearing Expiry > Low Stock > Others
      const getPriority = (item: Item) => {
        const isExpired = item.expiryDate && new Date(item.expiryDate) < new Date();
        if (isExpired) return 0;
        
        const isNearingExpiry = item.expiryDate && 
          (new Date(item.expiryDate).getTime() - new Date().getTime()) < (30 * 24 * 60 * 60 * 1000) &&
          (new Date(item.expiryDate).getTime() - new Date().getTime()) > 0;
        if (isNearingExpiry) return 1;
        
        const isLow = item.currentStock <= item.minStock;
        if (isLow) return 2;
        
        return 3;
      };

      const priorityA = getPriority(a);
      const priorityB = getPriority(b);

      if (priorityA !== priorityB) return priorityA - priorityB;

      // Secondary sort based on user selection
      let valA = a[sortKey] || '';
      let valB = b[sortKey] || '';

      if (typeof valA === 'string') valA = valA.toLowerCase();
      if (typeof valB === 'string') valB = valB.toLowerCase();

      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });
  }, [items, searchTerm, globalSearch, filterCategoryName, filterDeptId, filterStatus, sortKey, sortOrder, categories]);

  const transSummary = useMemo(() => {
    const summary = {
      IN: 0,
      OUT: 0,
      TRANSFER: 0,
      byDept: {} as Record<string, { IN: number, OUT: number, TRANSFER: number }>
    };

    // Filter transactions to match items visible in inventory
    const itemIds = new Set(filteredAndSortedItems.map(i => i.id));
    const filteredTrans = transactions.filter(t => itemIds.has(t.itemId));

    filteredTrans.forEach(t => {
      summary[t.type as 'IN' | 'OUT' | 'TRANSFER'] += t.quantity;
      const deptId = t.toDeptId || 'unknown';
      if (!summary.byDept[deptId]) {
        summary.byDept[deptId] = { IN: 0, OUT: 0, TRANSFER: 0 };
      }
      summary.byDept[deptId][t.type as 'IN' | 'OUT' | 'TRANSFER'] += t.quantity;
    });

    return summary;
  }, [transactions, filteredAndSortedItems]);

  return (
    <div className="space-y-6">
      <div className={`p-4 rounded-2xl border shadow-sm ${darkMode ? 'bg-slate-800/50 border-slate-700/50' : 'bg-white border-slate-200'}`}>
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 mb-6">
          <div className="flex flex-wrap gap-3 flex-1 w-full lg:max-w-2xl">
            <div className="relative flex-1 min-w-[240px]">
              <Search className={`w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`} />
              <input 
                type="text" 
                placeholder="Tìm tên vật tư..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className={`w-full pl-10 pr-4 py-2.5 border rounded-xl text-sm transition-all focus:ring-2 focus:ring-blue-500/20 outline-none ${darkMode ? 'bg-slate-900 border-slate-700 text-white placeholder-slate-500 focus:border-blue-500' : 'bg-slate-50 border-slate-200 text-slate-900 focus:border-blue-500'}`}
              />
            </div>
            <div className="flex gap-2 w-full sm:w-auto">
              <select 
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className={`flex-1 sm:flex-none px-3 py-2.5 border rounded-xl text-sm font-medium focus:ring-2 focus:ring-blue-500/20 outline-none transition-all ${darkMode ? 'bg-slate-900 border-slate-700 text-white focus:border-blue-500' : 'bg-slate-50 border-slate-200 text-slate-900 focus:border-blue-500'}`}
              >
                <option value="all">Tất cả trạng thái</option>
                <option value="low">Sắp hết hàng</option>
                <option value="expired">Đã hết hạn</option>
                <option value="safe">An toàn</option>
              </select>
              <select 
                value={filterDeptId}
                onChange={(e) => setFilterDeptId(e.target.value)}
                className={`flex-1 sm:flex-none px-3 py-2.5 border rounded-xl text-sm font-medium focus:ring-2 focus:ring-blue-500/20 outline-none transition-all ${darkMode ? 'bg-slate-900 border-slate-700 text-white focus:border-blue-500' : 'bg-slate-50 border-slate-200 text-slate-900 focus:border-blue-500'}`}
              >
                <option value="">Tất cả phòng</option>
                {departments.filter(d => d.name !== 'Tất cả' && d.name !== 'Tất cả phòng').map(d => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
          </div>
          
          <div className="flex items-center gap-2 w-full lg:w-auto justify-end">
            {/* Hidden on mobile to keep interface clean; visible on tablet/desktop */}
            <div className={`hidden sm:flex items-center p-1 rounded-xl border ${darkMode ? 'bg-slate-900 border-slate-700' : 'bg-slate-50 border-slate-200'}`}>
              <input 
                type="file" 
                accept=".xlsx, .xls" 
                className="hidden" 
                ref={fileInputRef} 
                onChange={handleImportExcel} 
              />
              <button 
                onClick={() => fileInputRef.current?.click()}
                disabled={isImporting}
                title="Nhập từ Excel"
                className={`p-2 rounded-lg transition-all disabled:opacity-50 ${darkMode ? 'text-slate-400 hover:bg-slate-800 hover:text-white' : 'text-slate-600 hover:bg-white hover:shadow-sm'}`}
              >
                {isImporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4 rotate-180" />}
              </button>
              <button 
                onClick={handleExportItemsExcel}
                title="Xuất Danh sách Vật tư (Chuẩn Google Sheets)"
                className={`p-2 rounded-lg transition-all cursor-pointer ${darkMode ? 'text-slate-400 hover:bg-slate-800 hover:text-white' : 'text-slate-600 hover:bg-white hover:shadow-sm'}`}
              >
                <Download className="w-4 h-4" />
              </button>
            </div>

            {selectedIds.length > 0 && (
              <button 
                onClick={() => setShowDeleteConfirm(true)}
                className={`flex-1 sm:flex-none justify-center px-4 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 transition-all ${darkMode ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20' : 'bg-red-50 text-red-600 hover:bg-red-100'}`}
              >
                <Trash2 className="w-4 h-4" /> <span>Xóa ({selectedIds.length})</span>
              </button>
            )}
            
            <button 
              onClick={() => setShowAdd(true)}
              className="w-full sm:w-auto justify-center px-5 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-blue-700 transition-all shadow-lg shadow-blue-500/20 active:scale-95 cursor-pointer"
            >
              <Plus className="w-4 h-4" /> <span>Thêm vật tư</span>
            </button>
          </div>
        </div>

        {/* Category Buttons */}
        <div className="flex flex-wrap gap-2 pb-2 overflow-x-auto no-scrollbar">
          <button
            onClick={() => setFilterCategoryName('')}
            className={`px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider transition-all whitespace-nowrap border flex items-center gap-2 ${
              filterCategoryName === '' 
                ? 'bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-100' 
                : (darkMode ? 'bg-slate-800 text-slate-400 border-slate-700 hover:border-blue-800 hover:text-blue-400' : 'bg-white text-slate-500 border-slate-200 hover:border-blue-300 hover:text-blue-600')
            }`}
          >
            Tất cả nhóm
            <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${filterCategoryName === '' ? 'bg-white/20 text-white' : (darkMode ? 'bg-slate-700 text-slate-500' : 'bg-slate-100 text-slate-400')}`}>
              {items.length}
            </span>
          </button>
          {uniqueCategories.map(cat => {
            const name = cat.name;
            const count = items.filter(i => {
              const itemCat = categories.find(c => c.id === i.categoryId);
              return itemCat?.name.trim().toLowerCase() === name.trim().toLowerCase();
            }).length;
            return (
              <button
                key={cat.id}
                onClick={() => setFilterCategoryName(name)}
                className={`px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider transition-all whitespace-nowrap border flex items-center gap-2 ${
                  filterCategoryName.trim().toLowerCase() === name.trim().toLowerCase()
                    ? 'bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-100' 
                    : (darkMode ? 'bg-slate-800 text-slate-400 border-slate-700 hover:border-blue-800 hover:text-blue-400' : 'bg-white text-slate-500 border-slate-200 hover:border-blue-300 hover:text-blue-600')
                }`}
              >
                {name}
                <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${filterCategoryName.trim().toLowerCase() === name.trim().toLowerCase() ? 'bg-white/20 text-white' : (darkMode ? 'bg-slate-700 text-slate-500' : 'bg-slate-100 text-slate-400')}`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Transaction Summary Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div className={`p-6 rounded-2xl border shadow-sm ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
          <h3 className={`text-sm font-bold mb-4 uppercase tracking-wider ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Tổng hợp giao dịch</h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 rounded-xl bg-blue-500/5 border border-blue-500/10">
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                <span className={`text-sm font-medium ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>Tổng nhập kho</span>
              </div>
              <span className="text-sm font-bold text-blue-600">{formatQty(transSummary.IN)} đơn vị</span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-xl bg-rose-500/5 border border-rose-500/10">
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-rose-500"></div>
                <span className={`text-sm font-medium ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>Tổng xuất kho</span>
              </div>
              <span className="text-sm font-bold text-rose-600">{formatQty(transSummary.OUT)} đơn vị</span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-xl bg-amber-500/5 border border-amber-500/10">
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-amber-500"></div>
                <span className={`text-sm font-medium ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>Tổng chuyển kho</span>
              </div>
              <span className="text-sm font-bold text-amber-600">{formatQty(transSummary.TRANSFER)} đơn vị</span>
            </div>
          </div>
        </div>

        <div className={`p-6 rounded-2xl border shadow-sm ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
          <h3 className={`text-sm font-bold mb-4 uppercase tracking-wider ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Tiêu thụ theo phòng ban</h3>
          <div className="space-y-2 max-h-[180px] overflow-y-auto pr-2 no-scrollbar">
            {Object.entries(transSummary.byDept).length > 0 ? (
              Object.entries(transSummary.byDept).map(([deptId, counts]) => {
                const dept = departments.find(d => d.id === deptId);
                if (counts.OUT === 0) return null;
                return (
                  <div key={deptId} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
                    <span className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>{dept?.name || 'Khác'}</span>
                    <span className={`text-sm font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>{formatQty(counts.OUT)} đơn vị</span>
                  </div>
                );
              })
            ) : (
              <p className="text-xs text-slate-400 italic text-center py-8">Chưa có dữ liệu tiêu thụ.</p>
            )}
          </div>
        </div>
      </div>

      {/* Mobile Card View (Hiển thị tối ưu dạng thẻ trên điện thoại di động) */}
      <div className="md:hidden space-y-3">
        {filteredAndSortedItems.length === 0 ? (
          <div className={`p-8 text-center rounded-2xl border text-sm ${darkMode ? 'bg-slate-800 border-slate-700 text-slate-400' : 'bg-white border-slate-200 text-slate-500'}`}>
            Không tìm thấy vật tư nào phù hợp với bộ lọc.
          </div>
        ) : (
          filteredAndSortedItems.map(item => {
            const category = categories.find(c => c.id === item.categoryId);
            const dept = departments.find(d => d.id === item.departmentId);
            const isLow = item.currentStock <= item.minStock;
            const now = new Date();
            const expiryDate = parseDateFlexible(item.expiryDate);
            const isExpired = expiryDate && expiryDate < now;
            const isNearingExpiry = expiryDate && 
              (expiryDate.getTime() - now.getTime()) < (30 * 24 * 60 * 60 * 1000) &&
              (expiryDate.getTime() - now.getTime()) > 0;
            const isSelected = selectedIds.includes(item.id);

            return (
              <div 
                key={item.id}
                className={`p-4 rounded-2xl border transition-all ${
                  darkMode ? 'bg-slate-800 border-slate-700/80 shadow-sm' : 'bg-white border-slate-200 shadow-sm'
                } ${isSelected ? (darkMode ? 'ring-2 ring-blue-500 bg-blue-950/20' : 'ring-2 ring-blue-500 bg-blue-50/40') : ''}`}
              >
                {/* Header card: Checkbox, Code, Status & Edit Button */}
                <div className="flex items-start justify-between gap-2 pb-2.5 border-b border-slate-100 dark:border-slate-700/60">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <input 
                      type="checkbox" 
                      className={`w-4 h-4 rounded focus:ring-blue-500 shrink-0 ${darkMode ? 'bg-slate-700 border-slate-600 text-blue-500' : 'border-slate-300 text-blue-600'}`}
                      checked={isSelected}
                      onChange={() => toggleSelect(item.id)}
                    />
                    {item.code ? (
                      <span className="font-mono text-xs px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 font-bold border border-blue-100 dark:border-blue-800 shrink-0">
                        {item.code}
                      </span>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase whitespace-nowrap border ${
                      isExpired 
                        ? (darkMode ? 'bg-red-500/10 text-red-400 border-red-500/20' : 'bg-red-100 text-red-600 border-red-200') : 
                      isNearingExpiry 
                        ? (darkMode ? 'bg-orange-500/10 text-orange-400 border-orange-500/20' : 'bg-orange-100 text-orange-600 border-orange-200') :
                      isLow 
                        ? (darkMode ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' : 'bg-amber-100 text-amber-600 border-amber-200') : 
                        (darkMode ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-emerald-100 text-emerald-600 border-emerald-200')
                    }`}>
                      {isExpired ? 'Hết hạn' : isNearingExpiry ? 'Sắp hết hạn' : isLow ? 'Cần nhập' : 'An toàn'}
                    </span>
                    <button 
                      onClick={() => handleEdit(item)}
                      className={`p-1.5 rounded-lg border transition-colors ${
                        darkMode ? 'border-slate-700 text-slate-400 hover:text-blue-400 hover:bg-slate-700' : 'border-slate-200 text-slate-500 hover:text-blue-600 hover:bg-slate-50'
                      }`}
                      title="Chỉnh sửa vật tư"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Tên vật tư & thông tin kỹ thuật */}
                <div className="py-2.5">
                  <h4 className={`text-sm font-bold leading-snug ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                    {item.name}
                  </h4>
                  {(item.specification || item.manufacturer) && (
                    <p className={`text-xs mt-1 leading-relaxed ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                      {item.specification}
                      {item.specification && item.manufacturer ? ' • ' : ''}
                      {item.manufacturer && `Hãng: ${item.manufacturer}`}
                    </p>
                  )}
                  <div className="flex flex-wrap items-center gap-1.5 mt-2">
                    {category && (
                      <span className={`text-[11px] px-2 py-0.5 rounded-md ${darkMode ? 'bg-slate-700 text-slate-300' : 'bg-slate-100 text-slate-600'}`}>
                        {category.name}
                      </span>
                    )}
                    {dept && dept.name !== '-' && (
                      <span className={`text-[11px] px-2 py-0.5 rounded-md ${darkMode ? 'bg-indigo-950/60 text-indigo-300 border border-indigo-800/40' : 'bg-indigo-50 text-indigo-700'}`}>
                        Phòng {dept.name}
                      </span>
                    )}
                    {item.expiryDate && (
                      <span className={`text-[11px] px-2 py-0.5 rounded-md ${
                        isExpired ? 'bg-red-50 text-red-600 font-bold dark:bg-red-950/60 dark:text-red-300' : 
                        isNearingExpiry ? 'bg-orange-50 text-orange-600 font-bold dark:bg-orange-950/60 dark:text-orange-300' : 
                        (darkMode ? 'bg-slate-700 text-slate-400' : 'bg-slate-100 text-slate-600')
                      }`}>
                        Hạn: {formatDate(item.expiryDate)}
                      </span>
                    )}
                  </div>
                </div>

                {/* Footer card: Tồn kho thực tế nổi bật & đơn giá */}
                <div className={`pt-2.5 mt-1 border-t flex items-center justify-between ${darkMode ? 'border-slate-700/60' : 'border-slate-100'}`}>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-slate-400 uppercase font-semibold">Tồn kho hiện tại:</span>
                      <button 
                        type="button"
                        onClick={() => handleOpenBatchManager(item)}
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border transition-colors cursor-pointer ${
                          darkMode 
                            ? 'bg-purple-950/50 text-purple-300 border-purple-800/60 hover:bg-purple-900/60' 
                            : 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100'
                        }`}
                        title="Bấm để xem và quản lý chi tiết từng lô"
                      >
                        <Layers className="w-3 h-3 text-purple-500" />
                        <span>{getItemBatches(item).length} lô</span>
                      </button>
                    </div>
                    <div className="flex items-baseline gap-1 mt-0.5">
                      <span className={`text-lg font-black ${isLow ? 'text-amber-500 dark:text-amber-400' : (darkMode ? 'text-white' : 'text-slate-900')}`}>
                        {formatQty(item.currentStock)}
                      </span>
                      <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                        {item.unit}
                      </span>
                      <span className="text-[10px] text-slate-400 ml-1">
                        (Tối thiểu: {formatQty(item.minStock)})
                      </span>
                    </div>
                  </div>
                  {item.price ? (
                    <div className="text-right">
                      <span className="text-[11px] text-slate-400 uppercase font-semibold">Đơn giá:</span>
                      <p className={`text-xs font-bold mt-0.5 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                        {(item.price || 0).toLocaleString('vi-VN')} đ
                      </p>
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Desktop Table View (Giữ nguyên giao diện bảng chuẩn cho màn hình máy tính) */}
      <div className={`hidden md:block rounded-2xl border shadow-sm overflow-hidden ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className={`border-b ${darkMode ? 'bg-slate-800/50 border-slate-700' : 'bg-slate-50 border-slate-200'}`}>
                <th className="px-6 py-4 w-10">
                  <input 
                    type="checkbox" 
                    className={`rounded focus:ring-blue-500 ${darkMode ? 'bg-slate-700 border-slate-600 text-blue-500' : 'border-slate-300 text-blue-600'}`}
                    checked={filteredAndSortedItems.length > 0 && selectedIds.length === filteredAndSortedItems.length}
                    onChange={toggleSelectAll}
                  />
                </th>
                <th 
                  className={`px-6 py-4 text-xs font-bold uppercase tracking-wider cursor-pointer transition-colors ${darkMode ? 'text-slate-400 hover:bg-slate-700' : 'text-slate-500 hover:bg-slate-100'}`}
                  onClick={() => handleSort('name')}
                >
                  <div className="flex items-center gap-1">
                    Tên vật tư {sortKey === 'name' && (sortOrder === 'asc' ? '↑' : '↓')}
                  </div>
                </th>
                <th className={`px-6 py-4 text-xs font-bold uppercase tracking-wider ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Nhóm</th>
                <th className={`px-6 py-4 text-xs font-bold uppercase tracking-wider ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Phòng</th>
                <th className={`px-6 py-4 text-xs font-bold uppercase tracking-wider ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Đơn vị</th>
                <th 
                  className={`px-6 py-4 text-xs font-bold uppercase tracking-wider cursor-pointer transition-colors ${darkMode ? 'text-slate-400 hover:bg-slate-700' : 'text-slate-500 hover:bg-slate-100'}`}
                  onClick={() => handleSort('price')}
                >
                  <div className="flex items-center gap-1">
                    Đơn giá {sortKey === 'price' && (sortOrder === 'asc' ? '↑' : '↓')}
                  </div>
                </th>
                <th 
                  className={`px-6 py-4 text-xs font-bold uppercase tracking-wider cursor-pointer transition-colors ${darkMode ? 'text-slate-400 hover:bg-slate-700' : 'text-slate-500 hover:bg-slate-100'}`}
                  onClick={() => handleSort('currentStock')}
                >
                  <div className="flex items-center gap-1">
                    Tồn kho {sortKey === 'currentStock' && (sortOrder === 'asc' ? '↑' : '↓')}
                  </div>
                </th>
                <th 
                  className={`px-6 py-4 text-xs font-bold uppercase tracking-wider cursor-pointer transition-colors ${darkMode ? 'text-slate-400 hover:bg-slate-700' : 'text-slate-500 hover:bg-slate-100'}`}
                  onClick={() => handleSort('expiryDate')}
                >
                  <div className="flex items-center gap-1">
                    Hạn dùng {sortKey === 'expiryDate' && (sortOrder === 'asc' ? '↑' : '↓')}
                  </div>
                </th>
                <th className={`px-6 py-4 text-xs font-bold uppercase tracking-wider text-center ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Trạng thái</th>
              </tr>
            </thead>
            <tbody className={`divide-y ${darkMode ? 'divide-slate-700' : 'divide-slate-100'}`}>
              {filteredAndSortedItems.map(item => {
                const category = categories.find(c => c.id === item.categoryId);
                const isLow = item.currentStock <= item.minStock;
                const now = new Date();
                const expiryDate = parseDateFlexible(item.expiryDate);
                const isExpired = expiryDate && expiryDate < now;
                const isNearingExpiry = expiryDate && 
                  (expiryDate.getTime() - now.getTime()) < (30 * 24 * 60 * 60 * 1000) &&
                  (expiryDate.getTime() - now.getTime()) > 0;

                return (
                  <tr key={item.id} className={`transition-colors ${darkMode ? 'hover:bg-slate-700/50' : 'hover:bg-slate-50'} ${isExpired ? (darkMode ? 'bg-red-900/10' : 'bg-red-50/30') : isNearingExpiry ? (darkMode ? 'bg-orange-900/10' : 'bg-orange-50/30') : ''} ${selectedIds.includes(item.id) ? (darkMode ? 'bg-blue-900/20' : 'bg-blue-50/50') : ''}`}>
                    <td className="px-6 py-4">
                      <input 
                        type="checkbox" 
                        className={`rounded focus:ring-blue-500 ${darkMode ? 'bg-slate-700 border-slate-600 text-blue-500' : 'border-slate-300 text-blue-600'}`}
                        checked={selectedIds.includes(item.id)}
                        onChange={() => toggleSelect(item.id)}
                      />
                    </td>
                    <td className={`px-6 py-4 font-medium ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                      <div className="flex flex-col">
                        <div className="flex items-center gap-2 group">
                          {item.code && (
                            <span className="font-mono text-xs px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 font-bold border border-blue-100 dark:border-blue-800 shrink-0">
                              {item.code}
                            </span>
                          )}
                          <span className="font-semibold">{item.name}</span>
                          <button 
                            onClick={() => handleEdit(item)}
                            className={`opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-blue-50 dark:hover:bg-blue-900/30 ${darkMode ? 'text-slate-500 hover:text-blue-400' : 'text-slate-400 hover:text-blue-600'}`}
                            title="Chỉnh sửa nhanh"
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                          {isExpired && <span title="Đã hết hạn"><AlertTriangle className="w-4 h-4 text-red-600" /></span>}
                          {isNearingExpiry && <span title="Sắp hết hạn"><AlertTriangle className="w-4 h-4 text-orange-600" /></span>}
                        </div>
                        {(item.specification || item.manufacturer) && (
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-2 flex-wrap">
                            {item.specification && <span>Quy cách: {item.specification}</span>}
                            {item.specification && item.manufacturer && <span>•</span>}
                            {item.manufacturer && <span>Hãng: {item.manufacturer}</span>}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className={`px-6 py-4 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>{category?.name || 'N/A'}</td>
                    <td className={`px-6 py-4 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                      {departments.find(d => d.id === item.departmentId)?.name || '-'}
                    </td>
                    <td className={`px-6 py-4 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>{item.unit}</td>
                    <td className={`px-6 py-4 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>{(item.price || 0).toLocaleString('vi-VN')} đ</td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className={`font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                          {formatQty(item.currentStock)} {item.unit}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleOpenBatchManager(item)}
                          className={`mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold border transition-all w-fit cursor-pointer ${
                            darkMode 
                              ? 'bg-purple-950/40 text-purple-300 border-purple-800/60 hover:bg-purple-900/60' 
                              : 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100'
                          }`}
                          title="Bấm để xem và quản lý chi tiết từng lô"
                        >
                          <Layers className="w-3 h-3 text-purple-500" />
                          <span>{getItemBatches(item).length} lô</span>
                        </button>
                      </div>
                    </td>
                    <td className={`px-6 py-4 font-medium ${isExpired ? 'text-red-600' : isNearingExpiry ? 'text-orange-600' : (darkMode ? 'text-slate-400' : 'text-slate-500')}`}>
                      <div>
                        <span>{formatDate(item.expiryDate)}</span>
                        {getItemBatches(item).length > 1 && (
                          <span className="block text-[10px] text-slate-400 dark:text-slate-500 font-normal">
                            (Lô hạn gần nhất)
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase whitespace-nowrap border ${
                        isExpired 
                          ? (darkMode ? 'bg-red-500/10 text-red-400 border-red-500/20' : 'bg-red-100 text-red-600 border-red-200') : 
                        isNearingExpiry 
                          ? (darkMode ? 'bg-orange-500/10 text-orange-400 border-orange-500/20' : 'bg-orange-100 text-orange-600 border-orange-200') :
                        isLow 
                          ? (darkMode ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' : 'bg-amber-100 text-amber-600 border-amber-200') : 
                          (darkMode ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-emerald-100 text-emerald-600 border-emerald-200')
                      }`}>
                        {isExpired ? 'Hết hạn' : isNearingExpiry ? 'Sắp hết hạn' : isLow ? 'Cần nhập' : 'An toàn'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {filteredAndSortedItems.length === 0 && (
          <div className="p-12 text-center text-slate-500">
            Không tìm thấy vật tư nào phù hợp với bộ lọc.
          </div>
        )}
      </div>

      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className={`rounded-3xl shadow-2xl w-full max-w-lg p-6 sm:p-8 border max-h-[90vh] overflow-y-auto ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-100'}`}>
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className={`text-xl font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>Thêm vật tư mới (Chuẩn CĐHA)</h3>
                <p className="text-xs text-slate-500">Chuẩn hóa theo cấu trúc Google Sheets DanhSach_VatTu</p>
              </div>
              <button onClick={() => setShowAdd(false)} className={`transition-colors p-1.5 rounded-lg ${darkMode ? 'text-slate-500 hover:text-slate-300' : 'text-slate-400 hover:text-slate-600'}`}><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleAdd} className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-1">
                  <label className={`block text-xs font-semibold mb-1 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>Mã vật tư</label>
                  <input 
                    type="text" 
                    placeholder="VT-CT-01"
                    className={`w-full px-3 py-2 border rounded-xl font-mono text-sm focus:ring-2 focus:ring-blue-500 outline-none ${darkMode ? 'bg-slate-700 border-slate-600 text-white placeholder-slate-500' : 'bg-slate-50 border-slate-200 text-slate-900'}`} 
                    value={newItem.code} 
                    onChange={e => setNewItem({...newItem, code: e.target.value})}
                  />
                </div>
                <div className="col-span-2 relative">
                  <label className={`block text-xs font-semibold mb-1 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>Tên vật tư y tế *</label>
                  <input 
                    required 
                    type="text" 
                    placeholder="Tên thuốc / hóa chất / vật tư..."
                    className={`w-full px-3 py-2 border rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none ${darkMode ? 'bg-slate-700 border-slate-600 text-white placeholder-slate-500' : 'bg-slate-50 border-slate-200 text-slate-900'}`} 
                    value={newItem.name} 
                    onChange={e => setNewItem({...newItem, name: e.target.value})}
                    onFocus={() => newItem.name.length > 0 && setShowSuggestions(true)}
                    onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                  />
                  {showSuggestions && (
                    <div className={`absolute z-10 w-full mt-1 border rounded-lg shadow-xl overflow-hidden ${darkMode ? 'bg-slate-700 border-slate-600' : 'bg-white border-slate-200'}`}>
                      {nameSuggestions.map(suggestion => (
                        <button
                          key={suggestion.id}
                          type="button"
                          onClick={() => handleSelectSuggestion(suggestion)}
                          className={`w-full px-4 py-2 text-left text-sm flex flex-col border-b last:border-0 ${darkMode ? 'hover:bg-slate-600 border-slate-600' : 'hover:bg-slate-50 border-slate-50'}`}
                        >
                          <span className={`font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>{suggestion.name}</span>
                          <span className={`text-[10px] ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                            {categories.find(c => c.id === suggestion.categoryId)?.name} • {suggestion.unit}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={`block text-xs font-semibold mb-1 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>Nhóm vật tư *</label>
                  <select required className={`w-full px-3 py-2 border rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500 ${darkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'}`} value={newItem.categoryId} onChange={e => setNewItem({...newItem, categoryId: e.target.value})}>
                    <option value="">Chọn nhóm...</option>
                    {uniqueCategories.map(cat => (
                      <option key={cat.id} value={cat.id}>{cat.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={`block text-xs font-semibold mb-1 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>Phòng máy / Bộ phận</label>
                  <RoomSelect 
                    value={newItem.departmentId} 
                    onChange={val => setNewItem({...newItem, departmentId: val})} 
                    departments={departments} 
                    darkMode={darkMode} 
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={`block text-xs font-semibold mb-1 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>Quy cách đóng gói</label>
                  <input 
                    type="text" 
                    placeholder="Hộp 10 chai x 100ml..."
                    className={`w-full px-3 py-2 border rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none ${darkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'}`} 
                    value={newItem.specification} 
                    onChange={e => setNewItem({...newItem, specification: e.target.value})} 
                  />
                </div>
                <div>
                  <label className={`block text-xs font-semibold mb-1 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>Hãng sản xuất / Xuất xứ</label>
                  <input 
                    type="text" 
                    placeholder="Bayer, GE, Fujifilm..."
                    className={`w-full px-3 py-2 border rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none ${darkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'}`} 
                    value={newItem.manufacturer} 
                    onChange={e => setNewItem({...newItem, manufacturer: e.target.value})} 
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className={`block text-xs font-semibold mb-1 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>Đơn vị tính *</label>
                  <input required placeholder="Hộp, Chai..." type="text" className={`w-full px-3 py-2 border rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none ${darkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'}`} value={newItem.unit} onChange={e => setNewItem({...newItem, unit: e.target.value})} />
                </div>
                <div>
                  <label className={`block text-xs font-semibold mb-1 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>Đơn vị ban đầu</label>
                  <input required type="number" step="any" className={`w-full px-3 py-2 border rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none ${darkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'}`} value={newItem.currentStock} onChange={e => setNewItem({...newItem, currentStock: e.target.value})} />
                </div>
                <div>
                  <label className={`block text-xs font-semibold mb-1 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>Tồn tối thiểu</label>
                  <input required type="number" step="any" className={`w-full px-3 py-2 border rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none ${darkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'}`} value={newItem.minStock} onChange={e => setNewItem({...newItem, minStock: e.target.value})} />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className={`block text-xs font-semibold mb-1 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>Đơn giá (VNĐ)</label>
                  <input type="number" step="any" className={`w-full px-3 py-2 border rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none ${darkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'}`} value={newItem.price} onChange={e => setNewItem({...newItem, price: e.target.value})} />
                </div>
                <div>
                  <label className={`block text-xs font-semibold mb-1 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>Số lô ban đầu</label>
                  <input type="text" placeholder="LO-2026-01" className={`w-full px-3 py-2 border rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none ${darkMode ? 'bg-slate-700 border-slate-600 text-white placeholder-slate-500' : 'bg-slate-50 border-slate-200 text-slate-900'}`} value={newItem.batchNumber} onChange={e => setNewItem({...newItem, batchNumber: e.target.value})} />
                </div>
                <div>
                  <label className={`block text-xs font-semibold mb-1 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>Hạn dùng của lô</label>
                  <input type="date" className={`w-full px-3 py-2 border rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none ${darkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'}`} value={newItem.expiryDate} onChange={e => setNewItem({...newItem, expiryDate: e.target.value})} />
                </div>
              </div>

              <div>
                <label className={`block text-xs font-semibold mb-1 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>Ghi chú & Điều kiện bảo quản</label>
                <input 
                  type="text" 
                  placeholder="Bảo quản 15-25°C, tránh ánh sáng..."
                  className={`w-full px-3 py-2 border rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none ${darkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'}`} 
                  value={newItem.note} 
                  onChange={e => setNewItem({...newItem, note: e.target.value})} 
                />
              </div>

              <div className="pt-2">
                <button type="submit" className="w-full py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-colors shadow-lg shadow-blue-500/20 active:scale-95 cursor-pointer">
                  Lưu vật tư vào hệ thống
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showEdit && editingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className={`rounded-3xl shadow-2xl w-full max-w-lg p-6 sm:p-8 border max-h-[90vh] overflow-y-auto ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-100'}`}>
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className={`text-xl font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>Chỉnh sửa vật tư</h3>
                <p className="text-xs text-slate-500">Cập nhật thông tin chi tiết</p>
              </div>
              <button onClick={() => setShowEdit(false)} className={`transition-colors p-1.5 rounded-lg ${darkMode ? 'text-slate-500 hover:text-slate-300' : 'text-slate-400 hover:text-slate-600'}`}><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleUpdate} className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-1">
                  <label className={`block text-xs font-semibold mb-1 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>Mã vật tư</label>
                  <input 
                    type="text" 
                    className={`w-full px-3 py-2 border rounded-xl font-mono text-sm focus:ring-2 focus:ring-blue-500 outline-none ${darkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'}`} 
                    value={editForm.code} 
                    onChange={e => setEditForm({...editForm, code: e.target.value})} 
                  />
                </div>
                <div className="col-span-2">
                  <label className={`block text-xs font-semibold mb-1 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>Tên vật tư y tế *</label>
                  <input 
                    required 
                    type="text" 
                    className={`w-full px-3 py-2 border rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none ${darkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'}`} 
                    value={editForm.name} 
                    onChange={e => setEditForm({...editForm, name: e.target.value})} 
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={`block text-xs font-semibold mb-1 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>Nhóm vật tư *</label>
                  <select required className={`w-full px-3 py-2 border rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500 ${darkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'}`} value={editForm.categoryId} onChange={e => setEditForm({...editForm, categoryId: e.target.value})}>
                    <option value="">Chọn nhóm...</option>
                    {uniqueCategories.map(cat => (
                      <option key={cat.id} value={cat.id}>{cat.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={`block text-xs font-semibold mb-1 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>Phòng máy / Bộ phận</label>
                  <RoomSelect 
                    value={editForm.departmentId} 
                    onChange={val => setEditForm({...editForm, departmentId: val})} 
                    departments={departments} 
                    darkMode={darkMode} 
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={`block text-xs font-semibold mb-1 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>Quy cách đóng gói</label>
                  <input 
                    type="text" 
                    className={`w-full px-3 py-2 border rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none ${darkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'}`} 
                    value={editForm.specification} 
                    onChange={e => setEditForm({...editForm, specification: e.target.value})} 
                  />
                </div>
                <div>
                  <label className={`block text-xs font-semibold mb-1 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>Hãng sản xuất / Xuất xứ</label>
                  <input 
                    type="text" 
                    className={`w-full px-3 py-2 border rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none ${darkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'}`} 
                    value={editForm.manufacturer} 
                    onChange={e => setEditForm({...editForm, manufacturer: e.target.value})} 
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className={`block text-xs font-semibold mb-1 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>Đơn vị tính *</label>
                  <input required type="text" className={`w-full px-3 py-2 border rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none ${darkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'}`} value={editForm.unit} onChange={e => setEditForm({...editForm, unit: e.target.value})} />
                </div>
                <div>
                  <label className={`block text-xs font-semibold mb-1 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>Đơn giá (VNĐ)</label>
                  <input required type="number" step="any" className={`w-full px-3 py-2 border rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none ${darkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'}`} value={editForm.price} onChange={e => setEditForm({...editForm, price: e.target.value})} />
                </div>
                <div>
                  <label className={`block text-xs font-semibold mb-1 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>Tồn tối thiểu</label>
                  <input required type="number" step="any" className={`w-full px-3 py-2 border rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none ${darkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'}`} value={editForm.minStock} onChange={e => setEditForm({...editForm, minStock: e.target.value})} />
                </div>
              </div>

              {/* Direct Lot/Batch link from Edit Modal */}
              <div className={`p-3.5 rounded-2xl border flex items-center justify-between ${
                darkMode ? 'bg-purple-950/30 border-purple-800/50' : 'bg-purple-50/70 border-purple-200/80'
              }`}>
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400">
                    <Layers className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-purple-900 dark:text-purple-200">
                      Quản lý từng lô & hạn sử dụng ({getItemBatches(editingItem).length} lô)
                    </p>
                    <p className="text-[11px] text-purple-700 dark:text-purple-300">
                      Tổng tồn các lô: {formatQty(editingItem.currentStock)} {editingItem.unit}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const item = editingItem;
                    setShowEdit(false);
                    handleOpenBatchManager(item);
                  }}
                  className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer"
                >
                  Quản lý lô
                </button>
              </div>

              <div>
                <label className={`block text-xs font-semibold mb-1 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>Hạn sử dụng</label>
                <input type="date" className={`w-full px-3 py-2 border rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none ${darkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'}`} value={editForm.expiryDate} onChange={e => setEditForm({...editForm, expiryDate: e.target.value})} />
              </div>

              <div>
                <label className={`block text-xs font-semibold mb-1 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>Ghi chú & Điều kiện bảo quản</label>
                <input 
                  type="text" 
                  className={`w-full px-3 py-2 border rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none ${darkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'}`} 
                  value={editForm.note} 
                  onChange={e => setEditForm({...editForm, note: e.target.value})} 
                />
              </div>

              <div className="pt-2">
                <button type="submit" className="w-full py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-colors shadow-lg shadow-blue-500/20 active:scale-95 cursor-pointer">
                  Lưu thay đổi
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Batch / Lot Management Modal */}
      {selectedBatchItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className={`rounded-3xl shadow-2xl w-full max-w-2xl p-6 sm:p-8 border max-h-[92vh] flex flex-col ${
            darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-900'
          }`}>
            {/* Modal Header */}
            <div className="flex justify-between items-start pb-4 border-b border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400">
                  <Layers className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-bold">Quản lý Lô & Hạn sử dụng</h3>
                  <div className="flex items-center gap-2 mt-0.5">
                    {selectedBatchItem.code && (
                      <span className="font-mono text-xs px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 font-bold border border-blue-100 dark:border-blue-800">
                        {selectedBatchItem.code}
                      </span>
                    )}
                    <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                      {selectedBatchItem.name}
                    </span>
                  </div>
                </div>
              </div>
              <button 
                onClick={() => setSelectedBatchItem(null)} 
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body: Scrollable */}
            <div className="flex-1 overflow-y-auto py-4 space-y-5 pr-1">
              {/* Summary Stats of all lots */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className={`p-3.5 rounded-xl border ${darkMode ? 'bg-slate-900/60 border-slate-700' : 'bg-slate-50 border-slate-200'}`}>
                  <span className="text-[11px] uppercase tracking-wider text-slate-400 font-bold block">Tổng số lô</span>
                  <span className="text-lg font-extrabold text-purple-600 dark:text-purple-400 mt-0.5 block">
                    {currentBatches.length} lô
                  </span>
                </div>
                <div className={`p-3.5 rounded-xl border ${darkMode ? 'bg-slate-900/60 border-slate-700' : 'bg-slate-50 border-slate-200'}`}>
                  <span className="text-[11px] uppercase tracking-wider text-slate-400 font-bold block">Tổng tồn các lô</span>
                  <span className="text-lg font-extrabold text-blue-600 dark:text-blue-400 mt-0.5 block">
                    {formatQty(currentBatches.reduce((sum, b) => sum + (Number(b.quantity) || 0), 0))} {selectedBatchItem.unit}
                  </span>
                </div>
                <div className={`p-3.5 rounded-xl border ${darkMode ? 'bg-slate-900/60 border-slate-700' : 'bg-slate-50 border-slate-200'}`}>
                  <span className="text-[11px] uppercase tracking-wider text-slate-400 font-bold block">Hạn dùng sớm nhất (FEFO)</span>
                  <span className="text-sm font-extrabold text-amber-600 dark:text-amber-400 mt-1 block">
                    {syncBatchesToItem(currentBatches).expiryDate ? formatDate(syncBatchesToItem(currentBatches).expiryDate) : 'Chưa có'}
                  </span>
                </div>
              </div>

              {/* Current Batches List */}
              <div>
                <div className="flex items-center justify-between mb-2.5">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Danh sách các lô ({currentBatches.length})
                  </h4>
                  <span className="text-[11px] text-slate-400 italic">
                    Có thể sửa trực tiếp số lượng hoặc hạn dùng của từng lô
                  </span>
                </div>

                {currentBatches.length === 0 ? (
                  <div className={`p-6 text-center rounded-xl border border-dashed ${darkMode ? 'border-slate-700 text-slate-400' : 'border-slate-300 text-slate-500'}`}>
                    Chưa có lô nào. Hãy thêm lô mới ở bên dưới để phân bổ số lượng tồn kho.
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {currentBatches.map((b, index) => {
                      const isExpired = b.expiryDate && new Date(b.expiryDate) < new Date();
                      const isNearingExpiry = b.expiryDate && 
                        (new Date(b.expiryDate).getTime() - new Date().getTime()) < (30 * 24 * 60 * 60 * 1000) &&
                        (new Date(b.expiryDate).getTime() - new Date().getTime()) > 0;

                      return (
                        <div 
                          key={b.id || index}
                          className={`p-3.5 rounded-xl border transition-all ${
                            darkMode ? 'bg-slate-700/40 border-slate-600' : 'bg-slate-50 border-slate-200'
                          }`}
                        >
                          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
                            {/* Mã lô */}
                            <div className="sm:col-span-4">
                              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                                Số lô / Mã lô
                              </label>
                              <div className="flex items-center gap-1.5">
                                <Tag className="w-3.5 h-3.5 text-purple-500 shrink-0" />
                                <input
                                  type="text"
                                  value={b.batchNumber}
                                  onChange={e => handleUpdateBatchNumber(b.id, e.target.value)}
                                  className={`w-full px-2.5 py-1.5 rounded-lg border text-xs font-semibold focus:ring-2 focus:ring-purple-500 outline-none ${
                                    darkMode ? 'bg-slate-800 border-slate-600 text-white' : 'bg-white border-slate-300 text-slate-900'
                                  }`}
                                  placeholder="Mã số lô..."
                                />
                              </div>
                            </div>

                            {/* Số lượng tồn lô */}
                            <div className="sm:col-span-3">
                              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                                Tồn lô ({selectedBatchItem.unit})
                              </label>
                              <input
                                type="number"
                                step="any"
                                min="0"
                                value={b.quantity}
                                onChange={e => handleUpdateBatchQuantity(b.id, e.target.value)}
                                className={`w-full px-2.5 py-1.5 rounded-lg border text-xs font-bold text-blue-600 focus:ring-2 focus:ring-blue-500 outline-none ${
                                  darkMode ? 'bg-slate-800 border-slate-600 text-blue-400' : 'bg-white border-slate-300'
                                }`}
                              />
                            </div>

                            {/* Hạn sử dụng */}
                            <div className="sm:col-span-4">
                              <div className="flex items-center justify-between mb-1">
                                <label className="text-[10px] font-bold text-slate-400 uppercase">
                                  Hạn dùng
                                </label>
                                {b.expiryDate && (
                                  <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded ${
                                    isExpired ? 'bg-red-500/20 text-red-500' :
                                    isNearingExpiry ? 'bg-orange-500/20 text-orange-500' :
                                    'bg-emerald-500/20 text-emerald-500'
                                  }`}>
                                    {isExpired ? 'Hết hạn' : isNearingExpiry ? 'Sắp hết' : 'An toàn'}
                                  </span>
                                )}
                              </div>
                              <input
                                type="date"
                                value={b.expiryDate || ''}
                                onChange={e => handleUpdateBatchExpiry(b.id, e.target.value)}
                                className={`w-full px-2 py-1.5 rounded-lg border text-xs focus:ring-2 focus:ring-purple-500 outline-none ${
                                  darkMode ? 'bg-slate-800 border-slate-600 text-white' : 'bg-white border-slate-300 text-slate-900'
                                }`}
                              />
                            </div>

                            {/* Nút xóa lô */}
                            <div className="sm:col-span-1 flex justify-end">
                              <button
                                type="button"
                                onClick={() => handleDeleteBatch(b.id)}
                                className="p-2 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                                title="Xóa lô này"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Form thêm lô mới */}
              <div className={`p-4 rounded-2xl border ${darkMode ? 'bg-slate-900/50 border-slate-700' : 'bg-purple-50/40 border-purple-100'}`}>
                <h5 className="text-xs font-bold uppercase tracking-wider text-purple-700 dark:text-purple-300 flex items-center gap-1.5 mb-3">
                  <Plus className="w-3.5 h-3.5" /> Thêm lô mới cho vật tư này
                </h5>
                <form onSubmit={handleAddBatchToItem} className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                  <div className="sm:col-span-4">
                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                      Số lô (tùy chọn)
                    </label>
                    <input
                      type="text"
                      placeholder="vd: LO-2026-B (để trống tự sinh)"
                      value={newBatchForm.batchNumber}
                      onChange={e => setNewBatchForm({ ...newBatchForm, batchNumber: e.target.value })}
                      className={`w-full px-3 py-2 rounded-xl border text-xs outline-none focus:ring-2 focus:ring-purple-500 ${
                        darkMode ? 'bg-slate-800 border-slate-600 text-white placeholder-slate-500' : 'bg-white border-slate-300 text-slate-900'
                      }`}
                    />
                  </div>
                  <div className="sm:col-span-3">
                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                      Số lượng *
                    </label>
                    <input
                      required
                      type="number"
                      step="any"
                      min="0"
                      placeholder="0"
                      value={newBatchForm.quantity}
                      onChange={e => setNewBatchForm({ ...newBatchForm, quantity: e.target.value })}
                      className={`w-full px-3 py-2 rounded-xl border text-xs outline-none focus:ring-2 focus:ring-purple-500 ${
                        darkMode ? 'bg-slate-800 border-slate-600 text-white placeholder-slate-500' : 'bg-white border-slate-300 text-slate-900'
                      }`}
                    />
                  </div>
                  <div className="sm:col-span-3">
                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                      Hạn sử dụng
                    </label>
                    <input
                      type="date"
                      value={newBatchForm.expiryDate}
                      onChange={e => setNewBatchForm({ ...newBatchForm, expiryDate: e.target.value })}
                      className={`w-full px-2.5 py-2 rounded-xl border text-xs outline-none focus:ring-2 focus:ring-purple-500 ${
                        darkMode ? 'bg-slate-800 border-slate-600 text-white' : 'bg-white border-slate-300 text-slate-900'
                      }`}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <button
                      type="submit"
                      className="w-full py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-purple-500/20 cursor-pointer flex items-center justify-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" /> Thêm lô
                    </button>
                  </div>
                </form>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="pt-4 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setSelectedBatchItem(null)}
                className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-colors ${
                  darkMode ? 'bg-slate-700 hover:bg-slate-600 text-slate-300' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                }`}
              >
                Đóng
              </button>
              <button
                type="button"
                onClick={handleSaveBatchesToFirestore}
                disabled={isSavingBatches}
                className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-blue-500/20 flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {isSavingBatches ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Đang đồng bộ...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" /> Lưu cập nhật & Đồng bộ tồn kho
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className={`rounded-2xl shadow-2xl w-full max-w-sm p-8 text-center border ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-100'}`}>
            <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <Trash2 className="w-8 h-8" />
            </div>
            <h3 className={`text-xl font-bold mb-2 ${darkMode ? 'text-white' : 'text-slate-900'}`}>Xác nhận xóa</h3>
            <p className={`mb-8 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Bạn có chắc chắn muốn xóa {selectedIds.length} vật tư đã chọn? Hành động này không thể hoàn tác.</p>
            <div className="flex gap-3">
              <button 
                onClick={() => setShowDeleteConfirm(false)}
                className={`flex-1 py-3 font-bold rounded-xl transition-colors ${darkMode ? 'bg-slate-700 text-slate-300 hover:bg-slate-600' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
              >
                Hủy
              </button>
              <button 
                onClick={handleBulkDelete}
                className="flex-1 py-3 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 transition-colors shadow-lg shadow-red-100"
              >
                Xóa ngay
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile Sticky Quick Search Bar (docked directly above bottom nav) */}
      <MobileQuickSearchBar 
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        placeholder="🔍 Tìm nhanh vật tư (tên, mã, quy cách)..."
        totalCount={items.length}
        filteredCount={filteredAndSortedItems.length}
        darkMode={darkMode}
      />
    </div>
  );
}

function Transactions({ transactions, items, departments, categories, globalSearch, darkMode }: { transactions: Transaction[], items: Item[], departments: Department[], categories: Category[], globalSearch: string, darkMode?: boolean }) {
  const [showAdd, setShowAdd] = useState(false);
  const [newTrans, setNewTrans] = useState({ 
    itemId: '', 
    type: 'OUT' as any, 
    quantity: '0', 
    fromDeptId: '', 
    toDeptId: '', 
    batchId: '', 
    batchNumber: '', 
    batchExpiry: '', 
    note: '' 
  });
  const [itemSearchTerm, setItemSearchTerm] = useState('');
  const [itemSuggestions, setItemSuggestions] = useState<Item[]>([]);
  const [showItemSuggestions, setShowItemSuggestions] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [transactionToDelete, setTransactionToDelete] = useState<Transaction | null>(null);

  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [filterDeptId, setFilterDeptId] = useState('');

  const filteredTransactions = useMemo(() => {
    let filtered = transactions;

    if (filterDeptId) {
      filtered = filtered.filter(t => t.toDeptId === filterDeptId);
    }
    
    if (globalSearch) {
      filtered = filtered.filter(t => {
        const item = items.find(i => i.id === t.itemId);
        return item?.name.toLowerCase().includes(globalSearch.toLowerCase());
      });
    }

    const getTs = (t: any) => {
      if (!t.timestamp) return 0;
      if (typeof t.timestamp.toDate === 'function') return t.timestamp.toDate().getTime();
      if (t.timestamp.seconds !== undefined) return t.timestamp.seconds * 1000;
      const ts = new Date(t.timestamp).getTime();
      if (!isNaN(ts)) return ts;
      const dateStr = String(t.timestamp);
      const ddmmyyyy = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(.*)$/);
      if (ddmmyyyy) {
        const [_, d, m, y, rest] = ddmmyyyy;
        return new Date(`${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}${rest || ''}`).getTime();
      }
      return 0;
    };

    if (startDate) {
      const start = new Date(startDate + 'T00:00:00').getTime();
      filtered = filtered.filter(t => getTs(t) >= start);
    }

    if (endDate) {
      const end = new Date(endDate + 'T23:59:59').getTime();
      filtered = filtered.filter(t => getTs(t) <= end);
    }

    return filtered;
  }, [transactions, items, globalSearch, startDate, endDate, filterDeptId]);

  useEffect(() => {
    if (itemSearchTerm.trim().length > 0 && showAdd) {
      const filtered = items.filter(i => 
        i.name.toLowerCase().includes(itemSearchTerm.toLowerCase())
      );
      setItemSuggestions(filtered.slice(0, 5));
      setShowItemSuggestions(filtered.length > 0);
    } else {
      setShowItemSuggestions(false);
    }
  }, [itemSearchTerm, items, showAdd]);

  const handleSelectItem = (item: Item) => {
    const itemBatches = getItemBatches(item);
    const activeBatches = itemBatches.filter(b => (Number(b.quantity) || 0) > 0);
    const earliestBatch = activeBatches.sort((a, b) => (a.expiryDate || '9999').localeCompare(b.expiryDate || '9999'))[0];

    setNewTrans(prev => ({
      ...prev,
      itemId: item.id,
      batchId: earliestBatch ? earliestBatch.id : (itemBatches[0]?.id || ''),
      batchNumber: earliestBatch ? earliestBatch.batchNumber : (itemBatches[0]?.batchNumber || ''),
      batchExpiry: earliestBatch ? earliestBatch.expiryDate : (itemBatches[0]?.expiryDate || '')
    }));
    setItemSearchTerm(item.name);
    setShowItemSuggestions(false);
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const item = items.find(i => i.id === newTrans.itemId);
    if (!item) {
      toast.error('Vui lòng chọn vật tư!');
      return;
    }

    const quantity = Number(parseFloat(newTrans.quantity).toFixed(10)) || 0;
    if (quantity <= 0) {
      toast.error('Số lượng giao dịch phải lớn hơn 0!');
      return;
    }

    let batches = [...getItemBatches(item)];
    let recordedBatchNumber = newTrans.batchNumber.trim();
    let recordedBatchExpiry = newTrans.batchExpiry.trim();
    let recordedBatchId = newTrans.batchId || '';
    let successDetailMsg = '';

    if (newTrans.type === 'IN') {
      const targetExpiry = recordedBatchExpiry; // normalized "YYYY-MM-DD" or "" (no expiry)

      // Match existing batch by EXPIRY DATE:
      // (both have the same non-empty date, OR both have no expiry date ""/undefined)
      const existingIdx = batches.findIndex(b => (b.expiryDate || '').trim() === targetExpiry);

      if (existingIdx >= 0) {
        // MATCH FOUND: Auto-merge into existing batch!
        const matched = batches[existingIdx];
        const updatedQty = Number((matched.quantity + quantity).toFixed(10));
        batches[existingIdx] = {
          ...matched,
          quantity: updatedQty
        };
        recordedBatchNumber = matched.batchNumber;
        recordedBatchExpiry = matched.expiryDate || '';
        recordedBatchId = matched.id;
        successDetailMsg = `Đã tự động cộng gộp ${formatQty(quantity)} ${item.unit} vào "${matched.batchNumber}" (HSD: ${matched.expiryDate ? formatDate(matched.expiryDate) : 'Không có HSD'}). Tổng tồn lô này: ${formatQty(updatedQty)} ${item.unit}!`;
      } else {
        // NO MATCH: Auto-create a brand new batch!
        let lotName = recordedBatchNumber;
        if (!lotName) {
          const nextNum = batches.length + 1;
          lotName = `Lô ${String(nextNum).padStart(2, '0')}`;
          let ctr = nextNum;
          while (batches.some(b => b.batchNumber.trim().toLowerCase() === lotName.toLowerCase())) {
            ctr++;
            lotName = `Lô ${String(ctr).padStart(2, '0')}`;
          }
        }
        const newBatchId = `batch-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
        const newBatchObj: ItemBatch = {
          id: newBatchId,
          batchNumber: lotName,
          quantity: quantity,
          expiryDate: targetExpiry,
          importDate: new Date().toISOString().split('T')[0],
          note: newTrans.note ? `Nhập kho: ${newTrans.note}` : 'Nhập kho tự động'
        };
        batches.push(newBatchObj);
        recordedBatchNumber = lotName;
        recordedBatchExpiry = targetExpiry;
        recordedBatchId = newBatchId;
        successDetailMsg = `Đã tự động tạo mới "${lotName}" với ${formatQty(quantity)} ${item.unit} (HSD: ${targetExpiry ? formatDate(targetExpiry) : 'Không có HSD'})!`;
      }
    } else if (newTrans.type === 'OUT' || newTrans.type === 'TRANSFER') {
      if (quantity > item.currentStock) {
        toast.error(`Số lượng xuất (${quantity}) vượt quá tổng tồn kho hiện tại (${item.currentStock})!`);
        return;
      }

      if (newTrans.batchId && newTrans.batchId !== 'AUTO_FEFO') {
        const bIdx = batches.findIndex(b => b.id === newTrans.batchId || b.batchNumber === newTrans.batchNumber);
        if (bIdx >= 0) {
          if (batches[bIdx].quantity < quantity) {
            toast.error(`Số lượng xuất (${quantity}) vượt quá tồn của lô ${batches[bIdx].batchNumber} (${batches[bIdx].quantity})!`);
            return;
          }
          batches[bIdx] = {
            ...batches[bIdx],
            quantity: Number((batches[bIdx].quantity - quantity).toFixed(10))
          };
          recordedBatchNumber = batches[bIdx].batchNumber;
          recordedBatchExpiry = batches[bIdx].expiryDate;
        } else {
          // Fallback auto FEFO
          let rem = quantity;
          const sorted = [...batches].sort((a, b) => (a.expiryDate || '9999').localeCompare(b.expiryDate || '9999'));
          for (const sb of sorted) {
            if (rem <= 0) break;
            const orig = batches.find(o => o.id === sb.id);
            if (!orig || orig.quantity <= 0) continue;
            const dec = Math.min(orig.quantity, rem);
            orig.quantity = Number((orig.quantity - dec).toFixed(10));
            rem = Number((rem - dec).toFixed(10));
          }
          recordedBatchNumber = 'FEFO';
        }
      } else {
        // AUTO_FEFO deduction
        let rem = quantity;
        const sorted = [...batches].sort((a, b) => (a.expiryDate || '9999-99-99').localeCompare(b.expiryDate || '9999-99-99'));
        const deductedLots: string[] = [];
        for (const sb of sorted) {
          if (rem <= 0) break;
          const orig = batches.find(o => o.id === sb.id);
          if (!orig || orig.quantity <= 0) continue;
          const dec = Math.min(orig.quantity, rem);
          orig.quantity = Number((orig.quantity - dec).toFixed(10));
          rem = Number((rem - dec).toFixed(10));
          deductedLots.push(orig.batchNumber);
        }
        recordedBatchNumber = deductedLots.join(', ');
      }
    }

    const { currentStock: newStock, expiryDate: newExpiryDate } = syncBatchesToItem(batches);

    try {
      await addDoc(collection(db, "transactions"), {
        itemId: newTrans.itemId,
        type: newTrans.type,
        quantity,
        fromDeptId: newTrans.fromDeptId || '',
        toDeptId: newTrans.toDeptId || '',
        batchId: newTrans.batchId || '',
        batchNumber: recordedBatchNumber,
        batchExpiry: recordedBatchExpiry,
        note: newTrans.note || '',
        timestamp: serverTimestamp()
      });

      await updateDoc(doc(db, "items", item.id), {
        batches,
        currentStock: newStock,
        expiryDate: newExpiryDate
      });

      if (successDetailMsg) {
        toast.success(successDetailMsg);
      } else {
        toast.success(`Đã ghi nhận giao dịch ${newTrans.type === 'IN' ? 'Nhập' : newTrans.type === 'OUT' ? 'Xuất' : 'Chuyển'} thành công!`);
      }
      setShowAdd(false);
      setNewTrans({ itemId: '', type: newTrans.type, quantity: '0', fromDeptId: '', toDeptId: '', batchId: '', batchNumber: '', batchExpiry: '', note: '' });
      setItemSearchTerm('');
    } catch (err) {
      toast.error('Lỗi khi ghi nhận giao dịch');
      handleFirestoreError(err, OperationType.WRITE, "transactions/items");
    }
  };

  const confirmDelete = (transaction: Transaction) => {
    setTransactionToDelete(transaction);
    setShowDeleteConfirm(true);
  };

  const handleDeleteTransaction = async () => {
    if (!transactionToDelete) return;

    try {
      const item = items.find(i => i.id === transactionToDelete.itemId);
      if (item) {
        let batches = [...getItemBatches(item)];
        const qty = Number(transactionToDelete.quantity) || 0;

        if (transactionToDelete.batchNumber) {
          const bIdx = batches.findIndex(b => b.batchNumber === transactionToDelete.batchNumber || b.id === transactionToDelete.batchId);
          if (bIdx >= 0) {
            if (transactionToDelete.type === 'IN') {
              batches[bIdx] = {
                ...batches[bIdx],
                quantity: Math.max(0, Number((batches[bIdx].quantity - qty).toFixed(10)))
              };
            } else if (transactionToDelete.type === 'OUT' || transactionToDelete.type === 'TRANSFER') {
              batches[bIdx] = {
                ...batches[bIdx],
                quantity: Number((batches[bIdx].quantity + qty).toFixed(10))
              };
            }
          } else {
            let newStock = item.currentStock;
            if (transactionToDelete.type === 'IN') newStock -= qty;
            if (transactionToDelete.type === 'OUT' || transactionToDelete.type === 'TRANSFER') newStock += qty;
            newStock = Math.max(0, Number(newStock.toFixed(10)));
            await updateDoc(doc(db, "items", item.id), { currentStock: newStock });
          }
        }

        const { currentStock: newStock, expiryDate: newExpiryDate } = syncBatchesToItem(batches);
        await updateDoc(doc(db, "items", item.id), {
          batches,
          currentStock: newStock,
          expiryDate: newExpiryDate
        });
      }

      await deleteDoc(doc(db, "transactions", transactionToDelete.id));
      toast.success('Đã xóa giao dịch thành công!');
      setShowDeleteConfirm(false);
      setTransactionToDelete(null);
    } catch (err) {
      toast.error('Lỗi khi xóa giao dịch');
      handleFirestoreError(err, OperationType.DELETE, `transactions/${transactionToDelete.id}`);
    }
  };

  const handleExportTransExcel = () => {
    const rows = filteredTransactions.map((t, idx) => {
      const item = items.find(i => i.id === t.itemId);
      const fromDept = departments.find(d => d.id === t.fromDeptId);
      const toDept = departments.find(d => d.id === t.toDeptId);
      const dateStr = t.timestamp?.toDate ? t.timestamp.toDate().toLocaleString('vi-VN') : '';
      const unitPrice = t.unitPrice || item?.price || 0;
      const qty = t.quantity || 0;
      return {
        'MaPhieu': t.code || `GD-${String(idx + 1).padStart(4, '0')}`,
        'NgayThucHien': dateStr,
        'LoaiGiaoDich': t.type === 'IN' ? 'Nhập kho' : t.type === 'OUT' ? 'Xuất sử dụng' : t.type === 'TRANSFER' ? 'Chuyển phòng' : 'Kiểm kê',
        'MaVatTu': item?.code || t.itemId || '',
        'TenVatTu': item?.name || '',
        'SoLuong': qty,
        'DonGia': unitPrice,
        'ThanhTien': qty * unitPrice,
        'TuPhongBan': fromDept?.name || t.fromDeptId || '',
        'DenPhongBan': toDept?.name || t.toDeptId || '',
        'SoLo': t.batchNumber || '',
        'HanDung': t.batchExpiry || '',
        'NguoiThucHien': t.performer || '',
        'LyDo_GhiChu': t.note || ''
      };
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [
      { wch: 16 }, { wch: 20 }, { wch: 16 }, { wch: 14 }, { wch: 35 },
      { wch: 10 }, { wch: 14 }, { wch: 16 }, { wch: 22 }, { wch: 22 },
      { wch: 16 }, { wch: 14 }, { wch: 24 }, { wch: 45 }
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'LichSu_XuatNhap');
    XLSX.writeFile(wb, `LichSu_XuatNhap_CDHA_${new Date().toISOString().split('T')[0]}.xlsx`);
    toast.success('Đã xuất lịch sử xuất nhập theo chuẩn Google Sheets!');
  };

  const uniqueItemsCount = useMemo(() => {
    const itemIds = new Set(filteredTransactions.map(t => t.itemId));
    return itemIds.size;
  }, [filteredTransactions]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <h2 className={`text-xl font-bold flex items-center gap-2 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
          <CalendarRange className="w-6 h-6 text-purple-500" />
          Dự trù & Kế hoạch vật tư
        </h2>
        <div className={`p-4 rounded-xl border shadow-sm flex flex-wrap items-center gap-4 ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
          <div className="flex items-center gap-2">
            <Calendar className={`w-4 h-4 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`} />
            <span className={`text-xs font-bold uppercase ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Từ ngày:</span>
            <input 
              type="date" 
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className={`px-3 py-1.5 border rounded-lg text-xs focus:ring-2 focus:ring-blue-500 ${darkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'}`}
            />
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-xs font-bold uppercase ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Đến ngày:</span>
            <input 
              type="date" 
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className={`px-3 py-1.5 border rounded-lg text-xs focus:ring-2 focus:ring-blue-500 ${darkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'}`}
            />
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-xs font-bold uppercase ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Phòng:</span>
            <select 
              value={filterDeptId}
              onChange={(e) => setFilterDeptId(e.target.value)}
              className={`px-3 py-1.5 border rounded-lg text-xs focus:ring-2 focus:ring-blue-500 ${darkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-white border-slate-200 text-slate-900'}`}
            >
              <option value="">Tất cả</option>
              {departments.filter(d => d.name !== 'Tất cả' && d.name !== 'Tất cả phòng').map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>
          {(startDate || endDate || filterDeptId) && (
            <button 
              onClick={() => { setStartDate(''); setEndDate(''); setFilterDeptId(''); }}
              className={`text-xs font-medium px-2 py-1 rounded hover:bg-slate-100 ${darkMode ? 'text-slate-400 hover:bg-slate-700' : 'text-slate-500'}`}
            >
              Xóa lọc
            </button>
          )}
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <button 
            onClick={handleExportTransExcel}
            className={`hidden sm:flex px-4 py-2 border rounded-xl text-sm font-medium items-center gap-2 transition-colors cursor-pointer ${
              darkMode ? 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
            }`}
            title="Xuất theo cấu trúc Google Sheets LichSu_XuatNhap"
          >
            <Download className="w-4 h-4" /> Xuất Sheet
          </button>
          <button 
            onClick={() => {
              setNewTrans(prev => ({ ...prev, type: 'IN' }));
              setShowAdd(true);
            }}
            className="flex-1 sm:flex-none justify-center px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-medium flex items-center gap-1.5 transition-colors shadow-lg shadow-emerald-500/20 active:scale-95 cursor-pointer"
          >
            <Plus className="w-4 h-4" /> Nhập kho
          </button>
          <button 
            onClick={() => setShowAdd(true)}
            className="flex-1 sm:flex-none justify-center px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium flex items-center gap-2 hover:bg-blue-700 transition-colors shadow-lg shadow-blue-500/20 active:scale-95 cursor-pointer"
          >
            <Plus className="w-4 h-4" /> Tạo giao dịch
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className={`p-4 rounded-2xl border shadow-sm ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
          <div className="flex items-center gap-3 mb-2">
            <div className={`p-2 rounded-lg ${darkMode ? 'bg-blue-500/10 text-blue-400' : 'bg-blue-50 text-blue-600'}`}>
              <ArrowLeftRight className="w-4 h-4" />
            </div>
            <span className={`text-xs font-bold uppercase tracking-wider ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Tổng số giao dịch</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className={`text-2xl font-black ${darkMode ? 'text-white' : 'text-slate-900'}`}>{filteredTransactions.length}</span>
            <span className={`text-[10px] font-medium ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>giao dịch</span>
          </div>
        </div>

        <div className={`p-4 rounded-2xl border shadow-sm ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
          <div className="flex items-center gap-3 mb-2">
            <div className={`p-2 rounded-lg ${darkMode ? 'bg-purple-500/10 text-purple-400' : 'bg-purple-50 text-purple-600'}`}>
              <Package className="w-4 h-4" />
            </div>
            <span className={`text-xs font-bold uppercase tracking-wider ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Vật tư có biến động</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className={`text-2xl font-black ${darkMode ? 'text-white' : 'text-slate-900'}`}>{uniqueItemsCount}</span>
            <span className={`text-[10px] font-medium ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>loại vật tư</span>
          </div>
        </div>

        <div className={`p-4 rounded-2xl border shadow-sm ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
          <div className="flex items-center gap-3 mb-2">
            <div className={`p-2 rounded-lg ${darkMode ? 'bg-amber-500/10 text-amber-400' : 'bg-amber-50 text-amber-600'}`}>
              <CalendarRange className="w-4 h-4" />
            </div>
            <span className={`text-xs font-bold uppercase tracking-wider ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Khoảng thời gian</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className={`text-sm font-bold ${darkMode ? 'text-slate-200' : 'text-slate-700'}`}>
              {startDate && endDate ? `${formatDate(startDate)} - ${formatDate(endDate)}` : 
               startDate ? `Từ ${formatDate(startDate)}` : 
               endDate ? `Đến ${formatDate(endDate)}` : 'Tất cả thời gian'}
            </span>
          </div>
        </div>
      </div>

      {/* Mobile Transactions Card View (< md) */}
      <div className="md:hidden space-y-3">
        {filteredTransactions.length === 0 ? (
          <div className={`p-8 text-center rounded-2xl border ${darkMode ? 'bg-slate-800 border-slate-700 text-slate-400' : 'bg-white border-slate-200 text-slate-500'}`}>
            Không có giao dịch nào phù hợp.
          </div>
        ) : (
          filteredTransactions.map(t => {
            const item = items.find(i => i.id === t.itemId);
            const toDept = departments.find(d => d.id === t.toDeptId);
            const fromDept = departments.find(d => d.id === t.fromDeptId);
            const unitPrice = t.unitPrice || item?.price || 0;
            const totalAmount = t.quantity * unitPrice;

            return (
              <div 
                key={t.id} 
                className={`p-4 rounded-2xl border shadow-sm transition-all ${
                  darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'
                }`}
              >
                {/* Header: Date + Type badge + Action */}
                <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-700/60">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-mono font-medium ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                      {formatTimestamp(t.timestamp)}
                    </span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                      t.type === 'IN' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300' : 
                      t.type === 'OUT' ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300' : 
                      'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300'
                    }`}>
                      {t.type === 'IN' ? 'Nhập kho' : t.type === 'OUT' ? 'Xuất kho' : 'Chuyển'}
                    </span>
                  </div>
                  <button 
                    onClick={() => confirmDelete(t)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                    title="Xóa giao dịch"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                {/* Body: Item Name & Notes */}
                <div className="py-2.5">
                  <h4 className={`text-sm font-bold leading-snug ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                    {item?.name || 'Vật tư không xác định'}
                  </h4>
                  {item?.code && (
                    <span className="text-[11px] font-mono text-slate-400 dark:text-slate-500 block mt-0.5">
                      Mã: {item.code}
                    </span>
                  )}
                  {t.batchNumber && (
                    <div className="flex items-center gap-1.5 text-[11px] text-purple-600 dark:text-purple-400 font-mono mt-1">
                      <Tag className="w-3 h-3" />
                      <span>Lô: {t.batchNumber}</span>
                      {t.batchExpiry && <span className="text-slate-400 font-sans">· HSD: {formatDate(t.batchExpiry)}</span>}
                    </div>
                  )}
                  {t.note && (
                    <p className={`text-xs mt-1 italic ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                      "{t.note}"
                    </p>
                  )}
                </div>

                {/* Footer Metrics */}
                <div className={`pt-2.5 border-t grid grid-cols-2 gap-2 text-xs ${darkMode ? 'border-slate-700/60' : 'border-slate-100'}`}>
                  <div>
                    <span className="text-[11px] text-slate-400 uppercase font-semibold">Số lượng:</span>
                    <p className={`text-base font-black mt-0.5 ${
                      t.type === 'IN' ? 'text-emerald-600 dark:text-emerald-400' : 
                      t.type === 'OUT' ? 'text-rose-600 dark:text-rose-400' : 
                      (darkMode ? 'text-white' : 'text-slate-900')
                    }`}>
                      {t.type === 'IN' ? '+' : t.type === 'OUT' ? '-' : ''}{formatQty(t.quantity)} {item?.unit || ''}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-[11px] text-slate-400 uppercase font-semibold">Thành tiền:</span>
                    <p className={`text-sm font-bold mt-0.5 ${darkMode ? 'text-slate-200' : 'text-slate-800'}`}>
                      {totalAmount.toLocaleString('vi-VN')} đ
                    </p>
                  </div>
                  {(toDept || fromDept) && (
                    <div className="col-span-2 pt-1 flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                      <span className="font-semibold">Bộ phận:</span>
                      <span>
                        {t.type === 'TRANSFER' && fromDept ? `${fromDept.name} ➔ ${toDept?.name || 'Phòng nhận'}` : (toDept?.name || fromDept?.name || '-')}
                      </span>
                    </div>
                  )}
                  {t.performer && (
                    <div className="col-span-2 text-[11px] text-slate-400">
                      Người thực hiện: <span className="font-medium text-slate-600 dark:text-slate-300">{t.performer}</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Desktop Table View (>= md) */}
      <div className={`hidden md:block rounded-2xl border shadow-sm overflow-hidden ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className={`border-b ${darkMode ? 'bg-slate-800/50 border-slate-700' : 'bg-slate-50 border-slate-200'}`}>
              <th className={`px-6 py-4 text-xs font-bold uppercase tracking-wider ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Thời gian</th>
              <th className={`px-6 py-4 text-xs font-bold uppercase tracking-wider ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Vật tư & Lô</th>
              <th className={`px-6 py-4 text-xs font-bold uppercase tracking-wider ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Loại</th>
              <th className={`px-6 py-4 text-xs font-bold uppercase tracking-wider ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Số lượng</th>
              <th className={`px-6 py-4 text-xs font-bold uppercase tracking-wider ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Thành tiền</th>
              <th className={`px-6 py-4 text-xs font-bold uppercase tracking-wider ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Phòng ban</th>
              <th className={`px-6 py-4 text-xs font-bold uppercase tracking-wider text-right ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Thao tác</th>
            </tr>
          </thead>
          <tbody className={`divide-y ${darkMode ? 'divide-slate-700' : 'divide-slate-100'}`}>
            {filteredTransactions.map(t => {
              const item = items.find(i => i.id === t.itemId);
              const toDept = departments.find(d => d.id === t.toDeptId);
              return (
                <tr key={t.id} className={`transition-colors ${darkMode ? 'hover:bg-slate-700/50' : 'hover:bg-slate-50'}`}>
                  <td className={`px-6 py-4 text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                    {formatTimestamp(t.timestamp)}
                  </td>
                  <td className={`px-6 py-4 font-medium ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                    <div>
                      <span>{item?.name || 'N/A'}</span>
                      {t.batchNumber && (
                        <div className="flex items-center gap-1.5 text-[11px] text-purple-600 dark:text-purple-400 font-mono mt-0.5">
                          <Tag className="w-3 h-3" />
                          <span>Lô: {t.batchNumber}</span>
                          {t.batchExpiry && <span className="text-slate-400 font-sans">· HSD: {formatDate(t.batchExpiry)}</span>}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase ${
                      t.type === 'IN' ? 'bg-emerald-100 text-emerald-600' : 
                      t.type === 'OUT' ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'
                    }`}>
                      {t.type === 'IN' ? 'Nhập' : t.type === 'OUT' ? 'Xuất' : 'Chuyển'}
                    </span>
                  </td>
                  <td className={`px-6 py-4 font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>{formatQty(t.quantity)}</td>
                  <td className={`px-6 py-4 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>{(t.quantity * (item?.price || 0)).toLocaleString('vi-VN')} đ</td>
                  <td className={`px-6 py-4 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>{toDept?.name || '-'}</td>
                  <td className="px-6 py-4 text-right">
                    <button 
                      onClick={() => confirmDelete(t)}
                      className={`p-2 transition-colors ${darkMode ? 'text-slate-500 hover:text-red-400' : 'text-slate-400 hover:text-red-500'}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className={`rounded-2xl shadow-2xl w-full max-w-lg p-6 sm:p-8 border max-h-[90vh] overflow-y-auto ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-100'}`}>
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className={`text-xl font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>Ghi nhận giao dịch</h3>
                <p className="text-xs text-slate-500">Quản lý nhập xuất kho theo từng lô (FEFO)</p>
              </div>
              <button onClick={() => setShowAdd(false)} className={`transition-colors ${darkMode ? 'text-slate-500 hover:text-slate-300' : 'text-slate-400 hover:text-slate-600'}`}><X /></button>
            </div>
            <form onSubmit={handleAdd} className="space-y-4">
              <div>
                <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>Loại giao dịch</label>
                <div className="grid grid-cols-3 gap-2">
                  {['IN', 'OUT', 'TRANSFER'].map(type => (
                    <button 
                      key={type}
                      type="button"
                      onClick={() => setNewTrans({...newTrans, type: type as any})}
                      className={`py-2 rounded-lg text-xs font-bold border transition-all ${
                        newTrans.type === type 
                          ? 'bg-blue-600 text-white border-blue-600' 
                          : (darkMode ? 'bg-slate-700 text-slate-400 border-slate-600 hover:bg-slate-600' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50')
                      }`}
                    >
                      {type === 'IN' ? 'NHẬP' : type === 'OUT' ? 'XUẤT' : 'CHUYỂN'}
                    </button>
                  ))}
                </div>
              </div>
              <div className="relative">
                <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>Vật tư</label>
                <input 
                  required 
                  type="text" 
                  placeholder="Nhập tên vật tư để tìm kiếm..."
                  className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${darkMode ? 'bg-slate-700 border-slate-600 text-white placeholder-slate-500' : 'bg-white border-slate-200 text-slate-900'}`} 
                  value={itemSearchTerm} 
                  onChange={e => {
                    setItemSearchTerm(e.target.value);
                    if (newTrans.itemId) setNewTrans({ ...newTrans, itemId: '' });
                  }}
                  onFocus={() => itemSearchTerm.length > 0 && setShowItemSuggestions(true)}
                  onBlur={() => setTimeout(() => setShowItemSuggestions(false), 200)}
                />
                {showItemSuggestions && (
                  <div className={`absolute z-10 w-full mt-1 border rounded-lg shadow-xl overflow-hidden ${darkMode ? 'bg-slate-700 border-slate-600' : 'bg-white border-slate-200'}`}>
                    {itemSuggestions.map(suggestion => (
                      <button
                        key={suggestion.id}
                        type="button"
                        onClick={() => handleSelectItem(suggestion)}
                        className={`w-full px-4 py-2 text-left text-sm flex flex-col border-b last:border-0 ${darkMode ? 'hover:bg-slate-600 border-slate-600' : 'hover:bg-slate-50 border-slate-50'}`}
                      >
                        <span className={`font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>{suggestion.name}</span>
                        <span className={`text-[10px] ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                          {categories.find(c => c.id === suggestion.categoryId)?.name} • Tồn: {formatQty(suggestion.currentStock)} {suggestion.unit} ({getItemBatches(suggestion).length} lô)
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                {/* Hidden input to maintain required validation on itemId */}
                <input type="hidden" required value={newTrans.itemId} />
              </div>

              {/* Lot / Batch Selection based on transaction type */}
              {newTrans.type === 'IN' && (() => {
                const selectedItem = items.find(i => i.id === newTrans.itemId);
                const itemBatches = selectedItem ? getItemBatches(selectedItem) : [];
                const currentExpiry = (newTrans.batchExpiry || '').trim();
                const matchedBatch = selectedItem ? itemBatches.find(b => (b.expiryDate || '').trim() === currentExpiry) : null;

                return (
                  <div className={`p-3.5 rounded-xl border space-y-3 ${
                    darkMode ? 'bg-slate-800/90 border-slate-700' : 'bg-blue-50/70 border-blue-200'
                  }`}>
                    <div className="flex items-center justify-between">
                      <label className={`text-xs font-bold flex items-center gap-1.5 ${darkMode ? 'text-blue-300' : 'text-blue-800'}`}>
                        <Calendar className="w-3.5 h-3.5" /> Quản lý Hạn sử dụng & Lô nhập
                      </label>
                      <span className={`text-[10px] px-2 py-0.5 rounded-md font-semibold ${
                        darkMode ? 'bg-blue-900/60 text-blue-300' : 'bg-blue-100 text-blue-700'
                      }`}>
                        Tự động quản lý lô
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className={`block text-[11px] font-semibold mb-1 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                          Hạn sử dụng (HSD) của đợt nhập
                        </label>
                        <input 
                          type="date" 
                          className={`w-full px-3 py-2 border rounded-lg text-xs focus:ring-2 focus:ring-blue-500 outline-none ${
                            darkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-white border-slate-300 text-slate-900'
                          }`}
                          value={newTrans.batchExpiry}
                          onChange={e => setNewTrans({ ...newTrans, batchExpiry: e.target.value })}
                        />
                        <span className={`text-[10px] block mt-1 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                          * Để trống nếu vật tư không có hạn sử dụng
                        </span>
                      </div>

                      <div>
                        <label className={`block text-[11px] font-semibold mb-1 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                          Số lô (tùy chọn)
                        </label>
                        <input 
                          type="text" 
                          placeholder={matchedBatch ? `Lô ${matchedBatch.batchNumber} (tự động gộp)` : "Tự động tạo (vd: Lô 01, Lô 02...)"}
                          className={`w-full px-3 py-2 border rounded-lg text-xs font-mono focus:ring-2 focus:ring-blue-500 outline-none ${
                            darkMode ? 'bg-slate-700 border-slate-600 text-white placeholder-slate-500' : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400'
                          }`}
                          value={newTrans.batchNumber}
                          onChange={e => setNewTrans({ ...newTrans, batchNumber: e.target.value })}
                        />
                        <span className={`text-[10px] block mt-1 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                          {matchedBatch ? 'Trùng HSD sẽ tự động gộp vào lô cũ' : 'HSD mới sẽ tự động sinh mã lô'}
                        </span>
                      </div>
                    </div>

                    {/* Real-time merge / create lot status badge */}
                    {selectedItem && (
                      <div className="pt-1 space-y-2">
                        {matchedBatch ? (
                          <div className="p-2.5 rounded-lg border border-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 dark:border-emerald-700 text-xs text-emerald-900 dark:text-emerald-200 flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
                            <div>
                              <div className="font-bold flex items-center gap-1.5 flex-wrap">
                                <span>Trùng HSD với lô: <strong>"{matchedBatch.batchNumber}"</strong></span>
                                <span className="text-[10px] px-1.5 py-0.5 bg-emerald-200/80 dark:bg-emerald-800 text-emerald-900 dark:text-emerald-100 rounded font-semibold">
                                  Hiện có: {formatQty(matchedBatch.quantity)} {selectedItem.unit}
                                </span>
                              </div>
                              <div className="text-[11px] text-emerald-700 dark:text-emerald-300 mt-0.5">
                                ➔ Hệ thống sẽ <strong>tự động CỘNG GỘP</strong> số lượng nhập vào lô này.
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="p-2.5 rounded-lg border border-blue-300 bg-blue-50/80 dark:bg-blue-950/40 dark:border-blue-700 text-xs text-blue-900 dark:text-blue-200 flex items-start gap-2">
                            <Sparkles className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
                            <div>
                              <div className="font-bold">
                                Hạn sử dụng mới {currentExpiry ? `(${formatDate(currentExpiry)})` : '(Không có HSD)'}
                              </div>
                              <div className="text-[11px] text-blue-700 dark:text-blue-300 mt-0.5">
                                ➔ Chưa có lô trùng HSD. Hệ thống sẽ <strong>tự động TẠO LÔ MỚI</strong> với số lượng nhập này.
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Quick-pick existing lots */}
                        {itemBatches.length > 0 && (
                          <div className="pt-1 border-t border-slate-200 dark:border-slate-700">
                            <span className={`text-[10px] font-semibold block mb-1.5 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                              Các lô hiện có của vật tư này (nhấn để chọn nhanh cùng HSD):
                            </span>
                            <div className="flex flex-wrap gap-1.5">
                              {itemBatches.map(b => {
                                const isMatching = (b.expiryDate || '').trim() === currentExpiry;
                                return (
                                  <button
                                    key={b.id}
                                    type="button"
                                    onClick={() => setNewTrans({ 
                                      ...newTrans, 
                                      batchExpiry: b.expiryDate || '', 
                                      batchNumber: b.batchNumber 
                                    })}
                                    className={`px-2.5 py-1 rounded-lg text-xs font-mono border transition-all flex items-center gap-1.5 cursor-pointer ${
                                      isMatching
                                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm ring-2 ring-emerald-300 dark:ring-emerald-800'
                                        : (darkMode ? 'bg-slate-700 hover:bg-slate-600 border-slate-600 text-slate-200' : 'bg-white hover:bg-slate-100 border-slate-300 text-slate-700')
                                    }`}
                                  >
                                    <span className="font-bold">{b.batchNumber}</span>
                                    <span className="opacity-90">({formatQty(b.quantity)} {selectedItem.unit})</span>
                                    <span className="text-[10px] opacity-75">· {b.expiryDate ? formatDate(b.expiryDate) : 'Ko HSD'}</span>
                                    {isMatching && <CheckCircle2 className="w-3 h-3 text-white" />}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}

              {(newTrans.type === 'OUT' || newTrans.type === 'TRANSFER') && newTrans.itemId && (() => {
                const selectedItem = items.find(i => i.id === newTrans.itemId);
                const itemBatches = selectedItem ? getItemBatches(selectedItem) : [];

                return (
                  <div className="p-3 rounded-xl border bg-purple-50/50 dark:bg-purple-950/20 border-purple-200 dark:border-purple-800 space-y-1.5">
                    <div className="flex justify-between items-center">
                      <label className={`block text-xs font-semibold ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                        Chọn lô xuất (Ưu tiên FEFO - Lô hết hạn trước)
                      </label>
                      <span className="text-[10px] text-purple-600 dark:text-purple-400 font-bold">
                        Tồn tổng: {formatQty(selectedItem?.currentStock)} {selectedItem?.unit}
                      </span>
                    </div>
                    <select
                      className={`w-full px-3 py-2 border rounded-lg text-xs focus:ring-2 focus:ring-purple-500 outline-none ${
                        darkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-white border-slate-200 text-slate-900'
                      }`}
                      value={newTrans.batchId || 'AUTO_FEFO'}
                      onChange={e => {
                        const val = e.target.value;
                        if (val === 'AUTO_FEFO') {
                          setNewTrans({ ...newTrans, batchId: 'AUTO_FEFO', batchNumber: 'FEFO', batchExpiry: '' });
                        } else {
                          const chosenBatch = itemBatches.find(b => b.id === val);
                          setNewTrans({
                            ...newTrans,
                            batchId: val,
                            batchNumber: chosenBatch?.batchNumber || '',
                            batchExpiry: chosenBatch?.expiryDate || ''
                          });
                        }
                      }}
                    >
                      <option value="AUTO_FEFO">
                        ⚡ Tự động phân bổ FEFO (Xuất từ lô có hạn dùng gần nhất)
                      </option>
                      {itemBatches.filter(b => (Number(b.quantity) || 0) > 0).map(b => (
                        <option key={b.id} value={b.id}>
                          Lô {b.batchNumber} - Còn {formatQty(b.quantity)} {selectedItem?.unit} (HSD: {b.expiryDate ? formatDate(b.expiryDate) : 'Không có'})
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })()}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>Số lượng</label>
                  <input required type="number" step="any" className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${darkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-white border-slate-200 text-slate-900'}`} value={newTrans.quantity} onChange={e => setNewTrans({...newTrans, quantity: e.target.value})} />
                </div>
                <div>
                  <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>Đến phòng</label>
                  <RoomSelect 
                    value={newTrans.toDeptId} 
                    onChange={val => setNewTrans({...newTrans, toDeptId: val})} 
                    departments={departments} 
                    darkMode={darkMode} 
                    placeholder="Chọn phòng..."
                  />
                </div>
              </div>
              <div>
                <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>Ghi chú</label>
                <textarea className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${darkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-white border-slate-200 text-slate-900'}`} rows={2} value={newTrans.note} onChange={e => setNewTrans({...newTrans, note: e.target.value})}></textarea>
              </div>
              <button type="submit" className="w-full py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-colors shadow-lg shadow-blue-100 cursor-pointer">Xác nhận</button>
            </form>
          </div>
        </div>
      )}

      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className={`rounded-2xl shadow-2xl w-full max-w-sm p-8 text-center border ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-100'}`}>
            <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <Trash2 className="w-8 h-8" />
            </div>
            <h3 className={`text-xl font-bold mb-2 ${darkMode ? 'text-white' : 'text-slate-900'}`}>Xác nhận xóa</h3>
            <p className={`mb-8 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Bạn có chắc chắn muốn xóa giao dịch này không? Hành động này không thể hoàn tác.</p>
            <div className="flex gap-3">
              <button 
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setTransactionToDelete(null);
                }}
                className={`flex-1 py-3 font-bold rounded-xl transition-colors ${darkMode ? 'bg-slate-700 text-slate-300 hover:bg-slate-600' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
              >
                Hủy
              </button>
              <button 
                onClick={handleDeleteTransaction}
                className="flex-1 py-3 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 transition-colors shadow-lg shadow-red-100"
              >
                Đồng ý
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function InventoryAudit({ items, categories, globalSearch, darkMode }: { items: Item[], categories: Category[], globalSearch: string, darkMode?: boolean }) {
  const [auditDate, setAuditDate] = useState(new Date().toISOString().split('T')[0]);
  const [auditData, setAuditData] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState('');

  const uniqueCategories = useMemo(() => {
    const map = new Map<string, Category>();
    categories.forEach(cat => {
      const normalizedName = cat.name.trim().toLowerCase();
      if (!map.has(normalizedName)) {
        map.set(normalizedName, cat);
      }
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [categories]);

  const categoryIdMap = useMemo(() => {
    const idMap = new Map<string, string>();
    categories.forEach(cat => {
      const normalizedName = cat.name.trim().toLowerCase();
      const primaryCat = uniqueCategories.find(c => c.name.trim().toLowerCase() === normalizedName);
      if (primaryCat) {
        idMap.set(cat.id, primaryCat.id);
      }
    });
    return idMap;
  }, [categories, uniqueCategories]);

  const filteredItems = useMemo(() => {
    return items.filter(item => {
      const matchesSearch = (
        matchesSearchQuery(item.name, searchTerm) ||
        matchesSearchQuery(item.code, searchTerm) ||
        matchesSearchQuery(item.specification, searchTerm)
      ) && (
        matchesSearchQuery(item.name, globalSearch) ||
        matchesSearchQuery(item.code, globalSearch)
      );
      const matchesCategory = filterCategory ? categoryIdMap.get(item.categoryId) === filterCategory : true;
      return matchesSearch && matchesCategory;
    });
  }, [items, searchTerm, globalSearch, filterCategory, categoryIdMap]);

  const changedCount = useMemo(() => {
    return Object.entries(auditData).filter(([itemId, value]) => {
      if (value === '') return false;
      const item = items.find(i => i.id === itemId);
      if (!item) return false;
      const actual = parseFloat(value);
      return !isNaN(actual) && Math.abs(item.currentStock - actual) > 0.000001;
    }).length;
  }, [auditData, items]);

  const handleActualChange = (itemId: string, value: string) => {
    setAuditData(prev => ({ ...prev, [itemId]: value }));
  };

  const handleSaveAudit = async () => {
    // Removed window.confirm as it's blocked in iframes
    setIsSaving(true);
    try {
      const auditTimestamp = new Date(auditDate + 'T12:00:00');
      
      for (const itemId of Object.keys(auditData)) {
        const item = items.find(i => i.id === itemId);
        if (!item) continue;
        
        const actualStr = auditData[itemId];
        const actual = actualStr === '' ? item.currentStock : Number(parseFloat(actualStr).toFixed(10));
        if (isNaN(actual)) continue;

        const current = item.currentStock;
        const diff = Number((current - actual).toFixed(10));
        
        if (Math.abs(diff) > 0.000001) {
          // Record transaction
          await addDoc(collection(db, "transactions"), {
            itemId,
            type: diff > 0 ? 'OUT' : 'IN',
            quantity: Math.abs(diff),
            timestamp: auditTimestamp,
            note: `Kiểm kê kho ngày ${auditDate} - ${diff > 0 ? 'Tiêu hao chênh lệch' : 'Điều chỉnh tăng'}`
          });
          
          // Update item stock
          await updateDoc(doc(db, "items", itemId), {
            currentStock: actual
          });
        }
      }
      
      setAuditData({});
      // Removed alert as it's blocked in iframes
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, "audit");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className={`p-6 rounded-2xl border shadow-sm ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <h2 className={`text-xl font-bold flex items-center gap-2 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
            <ClipboardCheck className="w-6 h-6 text-emerald-500" />
            Kiểm kê kho thực tế
          </h2>
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex flex-col">
              <label className={`text-xs font-bold uppercase mb-1 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Ngày kiểm kê</label>
              <input 
                type="date" 
                value={auditDate}
                onChange={(e) => setAuditDate(e.target.value)}
                className={`px-4 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 ${darkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'}`}
              />
            </div>
            <div className="flex flex-col">
              <label className={`text-xs font-bold uppercase mb-1 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Tìm kiếm</label>
              <input 
                type="text" 
                placeholder="Tên vật tư..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className={`px-4 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 ${darkMode ? 'bg-slate-700 border-slate-600 text-white placeholder-slate-500' : 'bg-slate-50 border-slate-200 text-slate-900'}`}
              />
            </div>
            <div className="flex flex-col">
              <label className={`text-xs font-bold uppercase mb-1 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Nhóm</label>
              <select 
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                className={`px-4 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 ${darkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'}`}
              >
                <option value="">Tất cả nhóm</option>
                {uniqueCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {changedCount > 0 && (
              <div className={`flex items-center gap-2 px-4 py-2 rounded-xl border animate-pulse ${darkMode ? 'bg-orange-500/10 border-orange-500/20 text-orange-400' : 'bg-orange-50 border-orange-100 text-orange-600'}`}>
                <AlertCircle className="w-4 h-4" />
                <span className="text-sm font-bold">{changedCount} vật tư thay đổi</span>
              </div>
            )}
            <button 
              onClick={handleSaveAudit}
              disabled={isSaving || Object.keys(auditData).length === 0}
              className="px-6 py-2.5 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-100 disabled:opacity-50 flex items-center gap-2"
            >
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              Lưu kết quả
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Audit Card List (< md) */}
      <div className="md:hidden space-y-3">
        {filteredItems.length === 0 ? (
          <div className={`p-8 text-center rounded-2xl border ${darkMode ? 'bg-slate-800 border-slate-700 text-slate-400' : 'bg-white border-slate-200 text-slate-500'}`}>
            <p className="font-medium mb-2">
              {searchTerm 
                ? `Không tìm thấy vật tư nào khớp với từ khóa "${searchTerm}".`
                : 'Không tìm thấy vật tư nào để kiểm kê.'}
            </p>
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="mt-1 px-3 py-1.5 text-xs font-bold rounded-xl bg-blue-600 text-white hover:bg-blue-700 transition-colors"
              >
                Xóa bộ lọc tìm kiếm
              </button>
            )}
          </div>
        ) : (
          filteredItems.map(item => {
            const auditVal = auditData[item.id];
            const actual = auditVal === undefined || auditVal === '' ? item.currentStock : parseFloat(auditVal);
            const diff = item.currentStock - actual;
            const category = categories.find(c => c.id === item.categoryId);
            const isModified = auditVal !== undefined && auditVal !== '';

            return (
              <div 
                key={item.id}
                className={`p-4 rounded-2xl border transition-all ${
                  isModified 
                    ? (darkMode ? 'bg-slate-800 border-blue-500/60 shadow-md ring-1 ring-blue-500/30' : 'bg-white border-blue-300 shadow-md ring-1 ring-blue-200')
                    : (darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200')
                }`}
              >
                {/* Header: Name, Unit, Category & Diff Badge */}
                <div className="flex items-start justify-between gap-2 pb-2.5 border-b border-slate-100 dark:border-slate-700/60">
                  <div className="min-w-0 flex-1">
                    <h4 className={`text-sm font-bold leading-snug ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                      {item.name}
                    </h4>
                    <div className="flex flex-wrap items-center gap-1.5 mt-1">
                      {category && (
                        <span className={`text-[11px] px-2 py-0.5 rounded-md ${darkMode ? 'bg-slate-700 text-slate-300' : 'bg-slate-100 text-slate-600'}`}>
                          {category.name}
                        </span>
                      )}
                      <span className="text-[11px] text-slate-400">Đơn vị: {item.unit}</span>
                    </div>
                  </div>
                  <span className={`px-2.5 py-1 rounded-full text-xs font-bold whitespace-nowrap shrink-0 ${
                    diff > 0 
                      ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300' 
                      : diff < 0 
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300' 
                      : (darkMode ? 'bg-slate-700 text-slate-400' : 'bg-slate-100 text-slate-500')
                  }`}>
                    {diff > 0 ? `Tiêu hao: +${formatQty(diff)}` : diff < 0 ? `Dư: ${formatQty(diff)}` : 'Khớp'}
                  </span>
                </div>

                {/* Body: Tồn hệ thống vs Nhập tồn thực tế */}
                <div className="pt-3 grid grid-cols-2 gap-3 items-center">
                  <div>
                    <span className="text-[11px] text-slate-400 uppercase font-semibold block">Tồn PM hiện tại:</span>
                    <span className={`text-base font-black ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                      {formatQty(item.currentStock)} <span className="text-xs font-normal text-slate-400">{item.unit}</span>
                    </span>
                  </div>

                  <div>
                    <span className="text-[11px] text-slate-400 uppercase font-semibold block mb-1">Tồn thực tế đếm được:</span>
                    <input 
                      type="number" 
                      step="any"
                      value={auditData[item.id] ?? ''}
                      placeholder={item.currentStock.toString()}
                      onChange={(e) => handleActualChange(item.id, e.target.value)}
                      className={`w-full px-3 py-2 text-center text-sm font-bold rounded-xl border focus:ring-2 focus:ring-blue-500 ${
                        darkMode 
                          ? 'bg-slate-700 border-slate-600 text-white placeholder-slate-500' 
                          : 'bg-slate-50 border-slate-300 text-slate-900 placeholder-slate-400'
                      }`}
                    />
                  </div>
                </div>

                {/* Quick actions for mobile */}
                <div className="flex items-center justify-end gap-1.5 mt-2.5 pt-2 border-t border-slate-100 dark:border-slate-700/40">
                  <span className="text-[10px] text-slate-400 mr-auto">Điền nhanh:</span>
                  <button
                    type="button"
                    onClick={() => handleActualChange(item.id, item.currentStock.toString())}
                    className={`px-2 py-1 rounded text-[11px] font-semibold border transition-colors ${
                      darkMode ? 'border-slate-700 text-slate-300 hover:bg-slate-700' : 'border-slate-200 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    = Tồn PM
                  </button>
                  <button
                    type="button"
                    onClick={() => handleActualChange(item.id, '0')}
                    className={`px-2 py-1 rounded text-[11px] font-semibold border transition-colors ${
                      darkMode ? 'border-slate-700 text-slate-300 hover:bg-slate-700' : 'border-slate-200 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    = 0
                  </button>
                  {isModified && (
                    <button
                      type="button"
                      onClick={() => {
                        const next = { ...auditData };
                        delete next[item.id];
                        setAuditData(next);
                      }}
                      className="px-2 py-1 text-[11px] text-rose-500 hover:underline"
                    >
                      Bỏ sửa
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Desktop Audit Table View (>= md) */}
      <div className={`hidden md:block rounded-2xl border shadow-sm overflow-hidden ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className={`border-b ${darkMode ? 'bg-slate-800/50 border-slate-700' : 'bg-slate-50 border-slate-200'}`}>
              <th className={`px-6 py-4 text-xs font-bold uppercase tracking-wider ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Vật tư</th>
              <th className={`px-6 py-4 text-xs font-bold uppercase tracking-wider ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Nhóm</th>
              <th className={`px-6 py-4 text-xs font-bold uppercase tracking-wider ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Đơn vị</th>
              <th className={`px-6 py-4 text-xs font-bold uppercase tracking-wider text-center ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Tồn hiện tại</th>
              <th className={`px-6 py-4 text-xs font-bold uppercase tracking-wider text-center w-32 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Tồn thực tế</th>
              <th className={`px-6 py-4 text-xs font-bold uppercase tracking-wider text-center ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Tiêu hao</th>
            </tr>
          </thead>
          <tbody className={`divide-y ${darkMode ? 'divide-slate-700' : 'divide-slate-100'}`}>
            {filteredItems.map(item => {
              const auditVal = auditData[item.id];
              const actual = auditVal === undefined || auditVal === '' ? item.currentStock : parseFloat(auditVal);
              const diff = item.currentStock - actual;
              const category = categories.find(c => c.id === item.categoryId);
              
              return (
                <tr key={item.id} className={`transition-colors ${darkMode ? 'hover:bg-slate-700/50' : 'hover:bg-slate-50'}`}>
                  <td className={`px-6 py-4 font-medium ${darkMode ? 'text-white' : 'text-slate-900'}`}>{item.name}</td>
                  <td className={`px-6 py-4 text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>{category?.name}</td>
                  <td className={`px-6 py-4 text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>{item.unit}</td>
                  <td className={`px-6 py-4 font-bold text-center ${darkMode ? 'text-white' : 'text-slate-900'}`}>{formatQty(item.currentStock)}</td>
                  <td className="px-6 py-4 text-center">
                    <input 
                      type="number" 
                      step="any"
                      value={auditData[item.id] ?? ''}
                      placeholder={item.currentStock.toString()}
                      onChange={(e) => handleActualChange(item.id, e.target.value)}
                      className={`w-20 px-2 py-1 text-center border rounded focus:ring-2 focus:ring-blue-500 font-bold ${darkMode ? 'bg-slate-700 border-slate-600 text-white placeholder-slate-500' : 'bg-white border-slate-200 text-slate-900'}`}
                    />
                  </td>
                  <td className={`px-6 py-4 font-bold text-center ${diff > 0 ? 'text-orange-600' : diff < 0 ? 'text-emerald-600' : (darkMode ? 'text-slate-500' : 'text-slate-400')}`}>
                    {diff > 0 ? `+${formatQty(diff)}` : formatQty(diff)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile Sticky Quick Search Bar (docked directly above bottom nav) */}
      <MobileQuickSearchBar 
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        placeholder="🔍 Tìm nhanh vật tư để kiểm kê..."
        totalCount={items.length}
        filteredCount={filteredItems.length}
        darkMode={darkMode}
      />
    </div>
  );
}

function InventoryPlanning({ items, transactions, categories, holidays, globalSearch, darkMode }: { items: Item[], transactions: Transaction[], categories: Category[], holidays: Holiday[], globalSearch: string, darkMode?: boolean }) {
  const [planningDate, setPlanningDate] = useState(() => {
    return getLocalFormattedDate(new Date());
  });
  const [forecastUntilDate, setForecastUntilDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return getLocalFormattedDate(d);
  });
  const [actualStockData, setActualStockData] = useState<Record<string, string>>({});
  
  // Safety Buffer Settings (Persisted in localStorage)
  const [safetyBufferType, setSafetyBufferType] = useState<'percent' | 'days'>(() => {
    return (localStorage.getItem('inventoryPlanning_safetyBufferType') as 'percent' | 'days') || 'percent';
  });
  const [safetyBufferValue, setSafetyBufferValue] = useState<number>(() => {
    const saved = localStorage.getItem('inventoryPlanning_safetyBufferValue');
    return saved !== null ? Math.max(0, parseFloat(saved)) : 15; // default 15% safety buffer
  });
  const [includeMinStock, setIncludeMinStock] = useState<boolean>(() => {
    const saved = localStorage.getItem('inventoryPlanning_includeMinStock');
    return saved !== null ? saved === 'true' : true; // default true: maintain min stock
  });

  const [results, setResults] = useState<Record<string, { 
    depletionDate: string;
    dailyUsage: number;
    pastTotalOut: number;
    pastWorkingDays: number;
    workingDaysInFuture: number;
    basePeriodUsage: number;
    safetyBufferQty: number;
    minStockBuffer: number;
    totalGrossDemand: number;
    actualStock: number;
    needed: number;
    surplus: number;
  }>>({});
  
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [usageMode, setUsageMode] = useState<string>(() => {
    return localStorage.getItem('inventoryPlanning_usageMode') || 'ytd';
  });
  const [customPastStartDate, setCustomPastStartDate] = useState<string>(() => {
    const saved = localStorage.getItem('inventoryPlanning_customPastStartDate');
    if (saved) return saved;
    const now = new Date();
    return `${now.getFullYear()}-01-01`;
  });
  const [isCalculating, setIsCalculating] = useState(false);
  const [filterOnlyNeeded, setFilterOnlyNeeded] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem('inventoryPlanning_safetyBufferType', safetyBufferType);
    } catch (e) {
      // Ignore localStorage errors
    }
  }, [safetyBufferType]);

  useEffect(() => {
    try {
      localStorage.setItem('inventoryPlanning_safetyBufferValue', safetyBufferValue.toString());
    } catch (e) {
      // Ignore localStorage errors
    }
  }, [safetyBufferValue]);

  useEffect(() => {
    try {
      localStorage.setItem('inventoryPlanning_includeMinStock', includeMinStock.toString());
    } catch (e) {
      // Ignore localStorage errors
    }
  }, [includeMinStock]);

  useEffect(() => {
    try {
      localStorage.setItem('inventoryPlanning_usageMode', usageMode);
    } catch (e) {
      // Ignore localStorage errors
    }
  }, [usageMode]);

  useEffect(() => {
    try {
      localStorage.setItem('inventoryPlanning_customPastStartDate', customPastStartDate);
    } catch (e) {
      // Ignore localStorage errors
    }
  }, [customPastStartDate]);

  const uniqueCategories = useMemo(() => {
    const map = new Map<string, Category>();
    categories.forEach(cat => {
      const normalizedName = cat.name.trim().toLowerCase();
      if (!map.has(normalizedName)) {
        map.set(normalizedName, cat);
      }
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [categories]);

  const categoryIdMap = useMemo(() => {
    const idMap = new Map<string, string>();
    categories.forEach(cat => {
      const normalizedName = cat.name.trim().toLowerCase();
      const primaryCat = uniqueCategories.find(c => c.name.trim().toLowerCase() === normalizedName);
      if (primaryCat) {
        idMap.set(cat.id, primaryCat.id);
      }
    });
    return idMap;
  }, [categories, uniqueCategories]);

  // Working days in future planning period
  const futurePeriodStats = useMemo(() => {
    return calculateWorkingDaysWithFutureCutoff(planningDate, forecastUntilDate, holidays);
  }, [planningDate, forecastUntilDate, holidays]);

  // Summary of past consumption reference period
  const pastPeriodSummary = useMemo(() => {
    const planningDateTime = new Date(planningDate + 'T00:00:00');
    let startDateObj: Date;
    let label = '';

    if (usageMode === 'ytd') {
      startDateObj = new Date(planningDateTime.getFullYear(), 0, 1, 0, 0, 0);
      label = `Từ đầu năm đến nay (01/01/${planningDateTime.getFullYear()} → ${formatDate(planningDate)})`;
    } else if (usageMode === 'custom') {
      startDateObj = new Date(customPastStartDate + 'T00:00:00');
      label = `Tùy chọn (${formatDate(customPastStartDate)} → ${formatDate(planningDate)})`;
    } else {
      const days = parseInt(usageMode, 10) || 90;
      startDateObj = new Date(planningDateTime.getTime() - (days * 24 * 60 * 60 * 1000));
      label = `${days === 365 ? '1 năm gần nhất (365 ngày lịch)' : `${days} ngày gần nhất`} (${formatDate(getLocalFormattedDate(startDateObj))} → ${formatDate(planningDate)})`;
    }

    const workingDays = Math.max(1, getWorkingDays(startDateObj, planningDateTime, holidays));
    return {
      startDateObj,
      startDateStr: getLocalFormattedDate(startDateObj),
      endDateStr: planningDate,
      label,
      workingDays
    };
  }, [planningDate, usageMode, customPastStartDate, holidays]);

  const handleCalculate = () => {
    setIsCalculating(true);
    setTimeout(() => {
      const newResults: Record<string, { 
        depletionDate: string;
        dailyUsage: number;
        pastTotalOut: number;
        pastWorkingDays: number;
        workingDaysInFuture: number;
        basePeriodUsage: number;
        safetyBufferQty: number;
        minStockBuffer: number;
        totalGrossDemand: number;
        actualStock: number;
        needed: number;
        surplus: number;
      }> = {};

      const planningDateTime = new Date(planningDate + 'T00:00:00');
      const forecastUntilDateTime = new Date(forecastUntilDate + 'T23:59:59');
      
      let pastStartDateObj: Date;
      if (usageMode === 'ytd') {
        pastStartDateObj = new Date(planningDateTime.getFullYear(), 0, 1, 0, 0, 0);
      } else if (usageMode === 'custom') {
        pastStartDateObj = new Date(customPastStartDate + 'T00:00:00');
      } else {
        const days = parseInt(usageMode, 10) || 90;
        pastStartDateObj = new Date(planningDateTime.getTime() - (days * 24 * 60 * 60 * 1000));
      }
      
      // Working days in past window and in future forecast window
      const workingDaysInPast = Math.max(1, getWorkingDays(pastStartDateObj, planningDateTime, holidays));
      const workingDaysInFuture = Math.max(1, getWorkingDays(planningDateTime, forecastUntilDateTime, holidays));

      items.forEach(item => {
        const itemTrans = transactions.filter(t => {
          if (!t.itemId || t.itemId !== item.id || t.type !== 'OUT') return false;
          const ts = t.timestamp?.toDate ? t.timestamp.toDate().getTime() : 
                     (t.timestamp?.seconds ? t.timestamp.seconds * 1000 : 
                     (t.timestamp ? new Date(t.timestamp).getTime() : 0));
          return ts >= pastStartDateObj.getTime() && ts <= planningDateTime.getTime();
        });
        
        const totalOut = itemTrans.reduce((sum, t) => sum + t.quantity, 0);
        // Daily usage based on actual working days in past
        const dailyUsage = workingDaysInPast > 0 ? totalOut / workingDaysInPast : 0;
        
        const actualStockStr = actualStockData[item.id];
        const actualStock = actualStockStr !== undefined && actualStockStr !== '' ? parseFloat(actualStockStr) : item.currentStock;
        
        let depletionDateStr = 'N/A';
        if (dailyUsage > 0) {
          // Find the date when stock will be depleted by counting working days
          let stockLeft = actualStock;
          const checkDate = new Date(planningDateTime.getTime());
          // Limit to 2 years to avoid infinite loop
          const maxDate = new Date(planningDateTime.getTime() + (730 * 24 * 60 * 60 * 1000));
          
          while (stockLeft > 0 && checkDate < maxDate) {
            checkDate.setDate(checkDate.getDate() + 1);
            const dateStr = getLocalFormattedDate(checkDate);
            const isHoliday = holidays.some(h => h.date === dateStr);
            if (!isHoliday) {
              stockLeft -= dailyUsage;
            }
          }
          
          if (stockLeft <= 0) {
            depletionDateStr = formatDate(getLocalFormattedDate(checkDate));
          } else {
            depletionDateStr = '> 2 năm';
          }
        }
        
        // 1. Tiêu hao cơ bản trong kỳ = dailyUsage * workingDaysInFuture
        const basePeriodUsage = workingDaysInFuture * dailyUsage;

        // 2. Dư lượng an toàn (Safety Buffer)
        let safetyBufferQty = 0;
        if (safetyBufferType === 'percent') {
          safetyBufferQty = basePeriodUsage * (Math.max(0, safetyBufferValue) / 100);
        } else {
          // Theo số ngày đệm an toàn
          safetyBufferQty = dailyUsage * Math.max(0, safetyBufferValue);
        }

        // 3. Mức tồn tối thiểu duy trì (Min Stock)
        const minStockBuffer = includeMinStock ? (Number(item.minStock) || 0) : 0;

        // 4. Tổng nhu cầu an toàn trong kỳ
        const totalGrossDemand = basePeriodUsage + safetyBufferQty + minStockBuffer;

        // 5. Số lượng cần nhập thêm
        const needed = Math.max(0, Math.ceil(totalGrossDemand - actualStock));
        const surplus = Math.max(0, actualStock - totalGrossDemand);
        
        newResults[item.id] = { 
          depletionDate: depletionDateStr, 
          dailyUsage,
          pastTotalOut: totalOut,
          pastWorkingDays: workingDaysInPast,
          workingDaysInFuture,
          basePeriodUsage,
          safetyBufferQty,
          minStockBuffer,
          totalGrossDemand,
          actualStock,
          needed,
          surplus
        };
      });
      
      setResults(newResults);
      setIsCalculating(false);
    }, 350);
  };

  // Run calculation on initial mount and when parameters change
  useEffect(() => {
    handleCalculate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planningDate, forecastUntilDate, usageMode, customPastStartDate, safetyBufferType, safetyBufferValue, includeMinStock, items.length]);

  const filteredItems = useMemo(() => {
    return items.filter(item => {
      const matchesSearch = (
        matchesSearchQuery(item.name, searchTerm) ||
        matchesSearchQuery(item.code, searchTerm) ||
        matchesSearchQuery(item.specification, searchTerm)
      ) && (
        matchesSearchQuery(item.name, globalSearch) ||
        matchesSearchQuery(item.code, globalSearch)
      );
      const matchesCategory = filterCategory ? categoryIdMap.get(item.categoryId) === filterCategory : true;
      const res = results[item.id];
      const matchesNeeded = filterOnlyNeeded ? (res && res.needed > 0) : true;
      return matchesSearch && matchesCategory && matchesNeeded;
    });
  }, [items, searchTerm, globalSearch, filterCategory, categoryIdMap, filterOnlyNeeded, results]);

  const summaryStats = useMemo(() => {
    let itemsNeededCount = 0;
    let itemsAdequateCount = 0;
    let totalNeededQuantity = 0;
    let totalEstimatedCost = 0;

    items.forEach(item => {
      const res = results[item.id];
      if (!res) return;
      if (res.needed > 0) {
        itemsNeededCount++;
        totalNeededQuantity += res.needed;
        totalEstimatedCost += res.needed * (Number(item.price) || 0);
      } else {
        itemsAdequateCount++;
      }
    });

    return {
      itemsNeededCount,
      itemsAdequateCount,
      totalNeededQuantity,
      totalEstimatedCost,
      totalItems: items.length
    };
  }, [results, items]);

  const handleExportPlanningExcel = () => {
    const data = filteredItems.map((item, idx) => {
      const res = results[item.id];
      const category = categories.find(c => c.id === item.categoryId);
      const actualStockStr = actualStockData[item.id];
      const actualStock = actualStockStr !== undefined && actualStockStr !== '' ? parseFloat(actualStockStr) : item.currentStock;

      const bufferLabel = safetyBufferType === 'percent' 
        ? `${safetyBufferValue}% (+${res ? res.safetyBufferQty.toFixed(1) : 0})` 
        : `+${safetyBufferValue} ngày (+${res ? res.safetyBufferQty.toFixed(1) : 0})`;

      return {
        'STT': idx + 1,
        'Tên vật tư': item.name,
        'Nhóm': category?.name || '-',
        'Đơn vị': item.unit,
        'Tồn PM': item.currentStock,
        'Tồn thực tế kiểm tra': actualStock,
        'Định mức Min': item.minStock || 0,
        'Tiêu hao bình quân/ngày': res ? res.dailyUsage.toFixed(2) : 0,
        'Chi tiết tiêu hao': res ? `(${res.pastTotalOut} ÷ ${res.pastWorkingDays} ngày lv)` : '',
        'Tiêu hao cơ bản trong kỳ': res ? res.basePeriodUsage.toFixed(2) : 0,
        'Mức dư lượng an toàn': bufferLabel,
        'Duy trì tồn Min': includeMinStock ? (item.minStock || 0) : 0,
        'Tổng nhu cầu dự trù an toàn': res ? Math.ceil(res.totalGrossDemand) : 0,
        'Dự kiến hết': res?.depletionDate || 'N/A',
        'Số lượng cần nhập thêm': res ? res.needed : 0,
        'Trạng thái': res && res.needed > 0 ? `Cần nhập (+${res.needed})` : 'Đủ dùng',
        'Đơn giá (đ)': item.price || 0,
        'Thành tiền dự trù (đ)': res && res.needed > 0 ? (res.needed * (item.price || 0)) : 0
      };
    });

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Ke_hoach_du_tru");
    XLSX.writeFile(wb, `Du_tru_vat_tu_CDHA_${planningDate}_den_${forecastUntilDate}.xlsx`);
    toast.success('Đã xuất file Excel dự trù vật tư thành công!');
  };

  const handlePrintPlanning = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      {/* Settings & Filter Panel */}
      <div className={`p-6 rounded-2xl border shadow-sm transition-all ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
        {/* Row 1: Period and Basic Parameters */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 items-end mb-4">
          <div className="flex flex-col">
            <label className={`text-xs font-bold uppercase mb-1 flex items-center gap-1 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
              <Calendar className="w-3.5 h-3.5 text-blue-500" />
              Ngày làm dự trù
            </label>
            <input 
              type="date" 
              value={planningDate}
              onChange={(e) => setPlanningDate(e.target.value)}
              className={`px-3.5 py-2 border rounded-xl text-sm font-medium focus:ring-2 focus:ring-blue-500 outline-none ${darkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'}`}
            />
          </div>

          <div className="flex flex-col">
            <label className={`text-xs font-bold uppercase mb-1 flex items-center gap-1 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
              <CalendarRange className="w-3.5 h-3.5 text-blue-500" />
              Dự trù đến ngày
            </label>
            <input 
              type="date" 
              value={forecastUntilDate}
              onChange={(e) => setForecastUntilDate(e.target.value)}
              className={`px-3.5 py-2 border rounded-xl text-sm font-medium focus:ring-2 focus:ring-blue-500 outline-none ${darkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'}`}
            />
          </div>

          <div className="flex flex-col">
            <div className="flex items-center justify-between mb-1">
              <label className={`text-xs font-bold uppercase ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                Dữ liệu tiêu hao quá khứ
              </label>
              <span className="text-[10px] font-bold text-blue-500" title={`Số ngày làm việc thực tế trong kỳ: ${pastPeriodSummary.workingDays} ngày`}>
                {pastPeriodSummary.workingDays}d lv
              </span>
            </div>
            <select 
              value={usageMode}
              onChange={(e) => setUsageMode(e.target.value)}
              className={`px-3 py-2 border rounded-xl text-xs sm:text-sm font-medium focus:ring-2 focus:ring-blue-500 outline-none ${darkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'}`}
            >
              <option value="ytd">⭐ Từ đầu năm đến nay (Năm {new Date(planningDate + 'T00:00:00').getFullYear()} - Khớp Báo cáo)</option>
              <option value="90">90 ngày gần nhất (Khuyên dùng)</option>
              <option value="30">30 ngày gần nhất</option>
              <option value="60">60 ngày gần nhất</option>
              <option value="180">180 ngày gần nhất</option>
              <option value="365">1 năm gần nhất (365 ngày lịch)</option>
              <option value="custom">📅 Tùy chọn ngày bắt đầu...</option>
            </select>
            {usageMode === 'custom' && (
              <div className="mt-1.5 flex items-center gap-1.5">
                <span className={`text-[10px] font-bold whitespace-nowrap ${darkMode ? 'text-amber-400' : 'text-amber-700'}`}>Từ ngày:</span>
                <input 
                  type="date"
                  value={customPastStartDate}
                  onChange={(e) => setCustomPastStartDate(e.target.value)}
                  className={`w-full px-2 py-1 text-xs font-bold border rounded-lg focus:ring-2 focus:ring-amber-500 outline-none ${
                    darkMode ? 'bg-slate-700 border-amber-500/50 text-white' : 'bg-amber-50/80 border-amber-300 text-slate-900'
                  }`}
                  title="Chọn ngày bắt đầu của chu kỳ tiêu hao mẫu"
                />
              </div>
            )}
          </div>

          <div className="flex flex-col">
            <label className={`text-xs font-bold uppercase mb-1 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Tìm kiếm vật tư</label>
            <div className="relative">
              <input 
                type="text" 
                placeholder="Tên, mã, quy cách..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className={`w-full pl-9 pr-3.5 py-2 border rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none ${darkMode ? 'bg-slate-700 border-slate-600 text-white placeholder-slate-500' : 'bg-slate-50 border-slate-200 text-slate-900'}`}
              />
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            </div>
          </div>

          <div className="flex flex-col">
            <label className={`text-xs font-bold uppercase mb-1 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Nhóm vật tư</label>
            <select 
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className={`px-3.5 py-2 border rounded-xl text-sm font-medium focus:ring-2 focus:ring-blue-500 outline-none ${darkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'}`}
            >
              <option value="">Tất cả nhóm</option>
              {uniqueCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          <button 
            type="button"
            onClick={handleCalculate}
            disabled={isCalculating}
            className="px-5 py-2.5 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 active:scale-95 transition-all shadow-md shadow-blue-500/20 flex items-center justify-center gap-2"
          >
            {isCalculating ? <Loader2 className="w-4 h-4 animate-spin" /> : <TrendingUp className="w-4 h-4" />}
            Tính dự trù
          </button>
        </div>

        {/* Row 2: Configurable Safety Buffer & Retention Options */}
        <div className={`pt-4 border-t ${darkMode ? 'border-slate-700/80' : 'border-slate-100'} flex flex-col lg:flex-row lg:items-center justify-between gap-4`}>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5">
              <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <Shield className="w-4 h-4" />
              </div>
              <span className={`text-xs font-bold uppercase tracking-wider ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                Chỉ số Dư lượng an toàn:
              </span>
            </div>

            {/* Toggle Buffer Type: % vs Days */}
            <div className={`p-0.5 rounded-xl border flex items-center ${darkMode ? 'bg-slate-900/80 border-slate-700' : 'bg-slate-100 border-slate-200'}`}>
              <button
                type="button"
                onClick={() => setSafetyBufferType('percent')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
                  safetyBufferType === 'percent'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : darkMode ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'
                }`}
                title="Tính theo tỷ lệ % lượng tiêu hao dự kiến"
              >
                <Percent className="w-3 h-3" />
                <span>Theo % dự phòng</span>
              </button>
              <button
                type="button"
                onClick={() => setSafetyBufferType('days')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
                  safetyBufferType === 'days'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : darkMode ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'
                }`}
                title="Tính theo số ngày làm việc đệm an toàn"
              >
                <Clock className="w-3 h-3" />
                <span>Theo số ngày đệm</span>
              </button>
            </div>

            {/* Preset Buttons */}
            {safetyBufferType === 'percent' ? (
              <div className="flex items-center gap-1.5 flex-wrap">
                {[0, 5, 10, 15, 20, 25].map((pct) => (
                  <button
                    key={pct}
                    type="button"
                    onClick={() => setSafetyBufferValue(pct)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-all ${
                      safetyBufferValue === pct
                        ? 'bg-emerald-600 border-emerald-600 text-white shadow-xs'
                        : darkMode 
                        ? 'bg-slate-700/60 border-slate-600 text-slate-300 hover:bg-slate-700' 
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {pct === 0 ? '0% (Không)' : pct === 15 ? '15% ⭐ Khuyên dùng' : `${pct}%`}
                  </button>
                ))}
              </div>
            ) : (
              <div className="flex items-center gap-1.5 flex-wrap">
                {[0, 3, 5, 7, 10, 15].map((days) => (
                  <button
                    key={days}
                    type="button"
                    onClick={() => setSafetyBufferValue(days)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-all ${
                      safetyBufferValue === days
                        ? 'bg-emerald-600 border-emerald-600 text-white shadow-xs'
                        : darkMode 
                        ? 'bg-slate-700/60 border-slate-600 text-slate-300 hover:bg-slate-700' 
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {days === 0 ? '+0 ngày' : days === 5 ? '+5 ngày ⭐ Khuyên dùng' : `+${days} ngày`}
                  </button>
                ))}
              </div>
            )}

            {/* Custom Buffer Input */}
            <div className="flex items-center gap-1.5">
              <span className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Tùy chỉnh:</span>
              <div className="relative w-24">
                <input
                  type="number"
                  min="0"
                  max={safetyBufferType === 'percent' ? 200 : 90}
                  step={safetyBufferType === 'percent' ? 1 : 1}
                  value={safetyBufferValue}
                  onChange={(e) => setSafetyBufferValue(Math.max(0, parseFloat(e.target.value) || 0))}
                  className={`w-full px-2.5 py-1 text-center text-xs font-black rounded-lg border focus:ring-2 focus:ring-blue-500 outline-none ${
                    darkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-white border-slate-300 text-slate-900'
                  }`}
                />
                <span className="absolute right-2 top-1 text-[11px] font-semibold text-slate-400 pointer-events-none">
                  {safetyBufferType === 'percent' ? '%' : 'ng'}
                </span>
              </div>
            </div>

            {/* Min Stock Retention Checkbox */}
            <label className="flex items-center gap-2 cursor-pointer ml-1 select-none">
              <input
                type="checkbox"
                checked={includeMinStock}
                onChange={(e) => setIncludeMinStock(e.target.checked)}
                className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
              />
              <span className={`text-xs font-semibold ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                Duy trì mức tồn tối thiểu (Min Stock) khi hết kỳ
              </span>
            </label>
          </div>

          {/* Action buttons: Filter needed only, Export Excel, Print */}
          <div className="flex items-center gap-2 self-start lg:self-center shrink-0">
            <button
              type="button"
              onClick={() => setFilterOnlyNeeded(!filterOnlyNeeded)}
              className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition-all flex items-center gap-1.5 ${
                filterOnlyNeeded
                  ? 'bg-rose-600 border-rose-600 text-white shadow-xs'
                  : darkMode ? 'bg-slate-700/60 border-slate-600 text-slate-300 hover:bg-slate-700' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              <AlertCircle className="w-3.5 h-3.5" />
              <span>Chỉ xem mặt hàng cần nhập ({summaryStats.itemsNeededCount})</span>
            </button>

            <button
              type="button"
              onClick={handleExportPlanningExcel}
              className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition-all flex items-center gap-1.5 ${
                darkMode ? 'bg-slate-700/60 border-slate-600 text-slate-300 hover:bg-slate-700' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
              title="Xuất file Excel kế hoạch dự trù"
            >
              <Download className="w-3.5 h-3.5 text-emerald-500" />
              <span>Xuất Excel</span>
            </button>

            <button
              type="button"
              onClick={handlePrintPlanning}
              className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition-all flex items-center gap-1.5 ${
                darkMode ? 'bg-slate-700/60 border-slate-600 text-slate-300 hover:bg-slate-700' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
              title="In phiếu dự trù vật tư"
            >
              <Printer className="w-3.5 h-3.5 text-blue-500" />
              <span>In phiếu</span>
            </button>
          </div>
        </div>
      </div>

      {/* Safety Buffer & Planning Summary Banner */}
      <div className={`p-4 rounded-2xl border transition-all ${
        darkMode 
          ? 'bg-slate-800/90 border-emerald-500/30 shadow-md' 
          : 'bg-gradient-to-r from-emerald-50/90 via-teal-50/60 to-blue-50/80 border-emerald-200 shadow-sm'
      }`}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-600/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 shrink-0 mt-0.5">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <span className={`text-sm font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                  Kế hoạch dự trù an toàn:
                </span>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-black bg-emerald-600 text-white shadow-xs">
                  {safetyBufferType === 'percent' ? `Dư lượng an toàn: +${safetyBufferValue}%` : `Đệm an toàn: +${safetyBufferValue} ngày`}
                </span>
                {includeMinStock && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-700 dark:bg-blue-900/60 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                    + Duy trì tồn Min
                  </span>
                )}
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300">
                  Kỳ dự trù: {futurePeriodStats.fullRangeWorkingDays} ngày làm việc
                </span>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800" title={pastPeriodSummary.label}>
                  Mẫu tiêu hao: {pastPeriodSummary.workingDays} ngày làm việc thực tế
                </span>
              </div>

              <p className={`text-xs leading-relaxed ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                • Dự trù tương lai: <strong className={darkMode ? 'text-white' : 'text-slate-800'}>{formatDate(planningDate)} → {formatDate(forecastUntilDate)}</strong> ({futurePeriodStats.fullRangeCalendarDays} ngày lịch, đã trừ {futurePeriodStats.fullRangeHolidaysCount} ngày nghỉ).
                <br />
                • Dữ liệu tiêu hao quá khứ tham chiếu: <strong className={darkMode ? 'text-indigo-300' : 'text-indigo-700'}>{pastPeriodSummary.label}</strong> (tính trên <strong className="font-bold underline decoration-indigo-400">{pastPeriodSummary.workingDays} ngày làm việc thực tế</strong> sau khi trừ các ngày nghỉ/ngừng hoạt động).
              </p>
            </div>
          </div>

          {/* Quick Metrics */}
          <div className="flex items-center gap-3 self-start md:self-center shrink-0">
            <div className={`px-3 py-2 rounded-xl border text-center ${darkMode ? 'bg-slate-800/80 border-slate-700' : 'bg-white border-slate-200 shadow-xs'}`}>
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Cần nhập thêm</span>
              <span className="text-base font-black text-rose-600 dark:text-rose-400">
                {summaryStats.itemsNeededCount} <span className="text-xs font-normal">mặt hàng</span>
              </span>
            </div>
            <div className={`px-3 py-2 rounded-xl border text-center ${darkMode ? 'bg-slate-800/80 border-slate-700' : 'bg-white border-slate-200 shadow-xs'}`}>
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Tổng số lượng bù</span>
              <span className="text-base font-black text-blue-600 dark:text-blue-400">
                +{formatQty(summaryStats.totalNeededQuantity)} <span className="text-xs font-normal">đv</span>
              </span>
            </div>
            {summaryStats.totalEstimatedCost > 0 && (
              <div className={`px-3 py-2 rounded-xl border text-center hidden sm:block ${darkMode ? 'bg-slate-800/80 border-slate-700' : 'bg-white border-slate-200 shadow-xs'}`}>
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Ước tính kinh phí</span>
                <span className="text-base font-black text-slate-900 dark:text-white">
                  {summaryStats.totalEstimatedCost.toLocaleString('vi-VN')} <span className="text-xs font-normal">đ</span>
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile Planning Card List (< md) */}
      <div className="md:hidden space-y-3">
        {filteredItems.length === 0 ? (
          <div className={`p-8 text-center rounded-2xl border ${darkMode ? 'bg-slate-800 border-slate-700 text-slate-400' : 'bg-white border-slate-200 text-slate-500'}`}>
            <p className="font-medium mb-2">
              {searchTerm 
                ? `Không tìm thấy vật tư nào khớp với từ khóa "${searchTerm}".`
                : 'Không có vật tư nào trong danh mục dự trù.'}
            </p>
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="mt-1 px-3 py-1.5 text-xs font-bold rounded-xl bg-blue-600 text-white hover:bg-blue-700 transition-colors"
              >
                Xóa bộ lọc tìm kiếm
              </button>
            )}
          </div>
        ) : (
          filteredItems.map(item => {
            const result = results[item.id];
            const category = categories.find(c => c.id === item.categoryId);

            return (
              <div 
                key={item.id}
                className={`p-4 rounded-2xl border shadow-sm transition-all ${
                  darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'
                }`}
              >
                {/* Header: Item name + Category + Replenishment status */}
                <div className="flex items-start justify-between gap-2 pb-2.5 border-b border-slate-100 dark:border-slate-700/60">
                  <div className="min-w-0 flex-1">
                    <h4 className={`text-sm font-bold leading-snug ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                      {item.name}
                    </h4>
                    <div className="flex flex-wrap items-center gap-1.5 mt-1">
                      {category && (
                        <span className={`text-[11px] px-2 py-0.5 rounded-md ${darkMode ? 'bg-slate-700 text-slate-300' : 'bg-slate-100 text-slate-600'}`}>
                          {category.name}
                        </span>
                      )}
                      <span className="text-[11px] text-slate-400">Đơn vị: {item.unit}</span>
                      {Number(item.minStock) > 0 && (
                        <span className="text-[11px] text-amber-500 font-medium">Min: {item.minStock}</span>
                      )}
                    </div>
                  </div>
                  <div>
                    {result && result.needed > 0 ? (
                      <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 whitespace-nowrap">
                        Cần nhập: +{formatQty(result.needed)}
                      </span>
                    ) : result ? (
                      <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 whitespace-nowrap">
                        Đủ dùng (Dư {formatQty(result.surplus)})
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400">Chưa tính</span>
                    )}
                  </div>
                </div>

                {/* Stock Details & Input */}
                <div className="py-2.5 grid grid-cols-2 gap-3 items-center">
                  <div>
                    <span className="text-[11px] text-slate-400 uppercase font-semibold block">Tồn PM hiện tại:</span>
                    <span className={`text-base font-black ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                      {formatQty(item.currentStock)} {item.unit}
                    </span>
                  </div>
                  <div>
                    <span className="text-[11px] text-slate-400 uppercase font-semibold block mb-1">Tồn thực tế kiểm tra:</span>
                    <input 
                      type="number" 
                      step="any"
                      value={actualStockData[item.id] ?? ''}
                      placeholder={item.currentStock.toString()}
                      onChange={(e) => {
                        setActualStockData(prev => ({ ...prev, [item.id]: e.target.value }));
                      }}
                      className={`w-full px-3 py-2 text-center text-sm font-bold rounded-xl border focus:ring-2 focus:ring-blue-500 ${
                        darkMode ? 'bg-slate-700 border-slate-600 text-white placeholder-slate-500' : 'bg-slate-50 border-slate-300 text-slate-900 placeholder-slate-400'
                      }`}
                    />
                  </div>
                </div>

                {/* Calculation Breakdown: Base + Safety Buffer + Total Demand */}
                <div className={`py-2 px-3 rounded-xl mb-2 text-xs border ${
                  darkMode ? 'bg-slate-900/60 border-slate-700' : 'bg-slate-50 border-slate-200'
                }`}>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div>
                      <span className="text-[10px] text-slate-400 block">Dùng kỳ:</span>
                      <span className="font-bold">{result ? formatQty(result.basePeriodUsage) : '-'}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-emerald-600 dark:text-emerald-400 block font-semibold">
                        +{safetyBufferType === 'percent' ? `${safetyBufferValue}%` : `${safetyBufferValue}d`} an toàn:
                      </span>
                      <span className="font-bold text-emerald-600 dark:text-emerald-400">
                        +{result ? formatQty(result.safetyBufferQty) : '-'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-blue-600 dark:text-blue-400 block font-semibold">Tổng dự trù:</span>
                      <span className="font-bold text-blue-600 dark:text-blue-400">
                        {result ? formatQty(Math.ceil(result.totalGrossDemand)) : '-'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Depletion Forecast & Daily Usage Footer */}
                <div className={`pt-2 border-t grid grid-cols-2 gap-2 text-xs ${darkMode ? 'border-slate-700/60' : 'border-slate-100'}`}>
                  <div>
                    <span className="text-[11px] text-slate-400 uppercase font-semibold block">Tiêu hao TB:</span>
                    <div className="flex items-baseline gap-1">
                      <span className={`font-bold ${darkMode ? 'text-slate-200' : 'text-slate-800'}`}>
                        {result ? result.dailyUsage.toFixed(2) : '-'}
                      </span>
                      <span className="text-[11px] text-slate-400">{item.unit}/ngày</span>
                    </div>
                    {result && (
                      <span className="text-[10px] text-slate-400 font-mono block">
                        ({formatQty(result.pastTotalOut)} ÷ {result.pastWorkingDays}d lv)
                      </span>
                    )}
                  </div>
                  <div className="text-right">
                    <span className="text-[11px] text-slate-400 uppercase font-semibold block">Dự kiến hết:</span>
                    <span className={`font-bold ${
                      result?.depletionDate && result.depletionDate !== 'N/A' && result.depletionDate !== '> 2 năm'
                        ? 'text-amber-600 dark:text-amber-400'
                        : (darkMode ? 'text-slate-300' : 'text-slate-600')
                    }`}>
                      {result?.depletionDate || '-'}
                    </span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Desktop Planning Table View (>= md) */}
      <div className={`hidden md:block rounded-2xl border shadow-sm overflow-hidden ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[980px]">
            <thead>
              <tr className={`border-b ${darkMode ? 'bg-slate-800/80 border-slate-700' : 'bg-slate-100 border-slate-200'}`}>
                <th className={`px-4 py-3.5 text-xs font-bold uppercase tracking-wider ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>Vật tư</th>
                <th className={`px-3 py-3.5 text-xs font-bold uppercase tracking-wider text-center ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>Tồn PM</th>
                <th className={`px-3 py-3.5 text-xs font-bold uppercase tracking-wider text-center w-28 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>Tồn thực tế</th>
                <th className={`px-3 py-3.5 text-xs font-bold uppercase tracking-wider text-center ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                  Tiêu hao/Ngày
                  <span className="block text-[10px] normal-case font-normal text-slate-400 font-mono">
                    (Xuất ÷ {pastPeriodSummary.workingDays}d)
                  </span>
                </th>
                <th className={`px-3 py-3.5 text-xs font-bold uppercase tracking-wider text-center ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>Dùng trong kỳ</th>
                <th className={`px-3 py-3.5 text-xs font-bold uppercase tracking-wider text-center ${darkMode ? 'text-emerald-400' : 'text-emerald-700'}`}>
                  Dư lượng an toàn ({safetyBufferType === 'percent' ? `+${safetyBufferValue}%` : `+${safetyBufferValue}d`})
                </th>
                <th className={`px-3 py-3.5 text-xs font-bold uppercase tracking-wider text-center ${darkMode ? 'text-blue-400' : 'text-blue-700'}`}>Tổng nhu cầu</th>
                <th className={`px-3 py-3.5 text-xs font-bold uppercase tracking-wider text-center ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>Dự kiến hết</th>
                <th className={`px-4 py-3.5 text-xs font-bold uppercase tracking-wider text-center ${darkMode ? 'text-rose-400' : 'text-rose-700'}`}>Cần nhập thêm</th>
              </tr>
            </thead>
            <tbody className={`divide-y ${darkMode ? 'divide-slate-700' : 'divide-slate-200'}`}>
              {filteredItems.map(item => {
                const result = results[item.id];
                const category = categories.find(c => c.id === item.categoryId);

                return (
                  <tr key={item.id} className={`transition-colors ${darkMode ? 'hover:bg-slate-700/50' : 'hover:bg-blue-50/40'}`}>
                    {/* Item info */}
                    <td className="px-4 py-3">
                      <div className={`font-semibold text-sm ${darkMode ? 'text-white' : 'text-slate-900'}`}>{item.name}</div>
                      <div className="flex items-center gap-1.5 text-xs text-slate-400 mt-0.5">
                        <span>ĐVT: {item.unit}</span>
                        {category && <span>· {category.name}</span>}
                        {Number(item.minStock) > 0 && <span className="text-amber-500 font-medium">· Min: {item.minStock}</span>}
                      </div>
                    </td>

                    {/* Stock PM */}
                    <td className={`px-3 py-3 text-center font-bold text-sm ${darkMode ? 'text-slate-200' : 'text-slate-700'}`}>
                      {formatQty(item.currentStock)}
                    </td>

                    {/* Stock Actual Input */}
                    <td className="px-3 py-3 text-center">
                      <input 
                        type="number" 
                        step="any"
                        value={actualStockData[item.id] ?? ''}
                        placeholder={item.currentStock.toString()}
                        onChange={(e) => {
                          setActualStockData(prev => ({ ...prev, [item.id]: e.target.value }));
                        }}
                        className={`w-20 px-2 py-1 text-center border rounded-lg focus:ring-2 focus:ring-blue-500 text-xs font-bold ${
                          darkMode ? 'bg-slate-700 border-slate-600 text-white placeholder-slate-500' : 'bg-white border-slate-300 text-slate-900'
                        }`}
                        title="Nhập tồn thực tế kiểm tra (bỏ trống để lấy bằng Tồn PM)"
                      />
                    </td>

                    {/* Daily Usage */}
                    <td className="px-3 py-3 text-center">
                      {result ? (
                        <div className="inline-flex flex-col items-center">
                          <span className={`text-sm font-bold ${darkMode ? 'text-slate-100' : 'text-slate-800'}`}>
                            {result.dailyUsage.toFixed(2)}
                          </span>
                          <span 
                            className="text-[10px] text-slate-400 dark:text-slate-500 font-mono tracking-tight"
                            title={`Tổng lượng xuất trong kỳ: ${formatQty(result.pastTotalOut)} ${item.unit} trong ${result.pastWorkingDays} ngày làm việc thực tế`}
                          >
                            ({formatQty(result.pastTotalOut)} ÷ {result.pastWorkingDays}d)
                          </span>
                        </div>
                      ) : '-'}
                    </td>

                    {/* Base period usage */}
                    <td className={`px-3 py-3 text-center text-xs font-semibold ${darkMode ? 'text-slate-200' : 'text-slate-800'}`}>
                      {result ? formatQty(result.basePeriodUsage) : '-'}
                    </td>

                    {/* Safety Buffer Qty */}
                    <td className="px-3 py-3 text-center">
                      {result ? (
                        <div className="inline-flex flex-col items-center">
                          <span className="px-2 py-0.5 rounded-md text-xs font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                            +{formatQty(result.safetyBufferQty)}
                          </span>
                          {includeMinStock && Number(item.minStock) > 0 && (
                            <span className="text-[10px] text-blue-600 dark:text-blue-400 mt-0.5">
                              +Min: {item.minStock}
                            </span>
                          )}
                        </div>
                      ) : '-'}
                    </td>

                    {/* Total Gross Demand */}
                    <td className="px-3 py-3 text-center">
                      {result ? (
                        <span className="text-xs font-black text-blue-600 dark:text-blue-400">
                          {formatQty(Math.ceil(result.totalGrossDemand))}
                        </span>
                      ) : '-'}
                    </td>

                    {/* Estimated Depletion Date */}
                    <td className="px-3 py-3 text-center">
                      {result ? (
                        <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                          result.depletionDate === 'N/A' 
                            ? (darkMode ? 'bg-slate-700 text-slate-400' : 'bg-slate-100 text-slate-500') 
                            : result.depletionDate === '> 2 năm'
                            ? (darkMode ? 'bg-slate-700 text-slate-300' : 'bg-slate-100 text-slate-600')
                            : (darkMode ? 'bg-amber-900/40 text-amber-300 border border-amber-800' : 'bg-amber-50 text-amber-700 border border-amber-200')
                        }`}>
                          {result.depletionDate}
                        </span>
                      ) : '-'}
                    </td>

                    {/* Replenishment Needed */}
                    <td className="px-4 py-3 text-center">
                      {result && result.needed > 0 ? (
                        <div className="inline-flex flex-col items-center">
                          <span className="px-2.5 py-1 rounded-full text-xs font-black bg-rose-100 text-rose-700 dark:bg-rose-950/70 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
                            +{formatQty(result.needed)} {item.unit}
                          </span>
                          {item.price ? (
                            <span className="text-[10px] text-slate-400 mt-0.5">
                              ~{(result.needed * item.price).toLocaleString('vi-VN')} đ
                            </span>
                          ) : null}
                        </div>
                      ) : result ? (
                        <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                          Đủ dùng
                        </span>
                      ) : '-'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile Sticky Quick Search Bar (docked directly above bottom nav) */}
      <MobileQuickSearchBar 
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        placeholder="🔍 Tìm nhanh vật tư để dự trù..."
        totalCount={items.length}
        filteredCount={filteredItems.length}
        darkMode={darkMode}
      />
    </div>
  );
}

function Reports({ 
  transactions, 
  items, 
  categories, 
  departments, 
  holidays, 
  globalSearch, 
  darkMode,
  onNavigateHolidays
}: { 
  transactions: Transaction[], 
  items: Item[], 
  categories: Category[], 
  departments: Department[], 
  holidays: Holiday[], 
  globalSearch: string, 
  darkMode?: boolean,
  onNavigateHolidays?: () => void
}) {
  const [reportType, setReportType] = useState<'custom' | 'week' | 'month' | 'quarter' | 'year'>('month');
  
  const getLocalYYYYMMDD = (date: Date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  const [startDate, setStartDate] = useState(getLocalYYYYMMDD(new Date(new Date().getFullYear(), new Date().getMonth(), 1)));
  const [endDate, setEndDate] = useState(getLocalYYYYMMDD(new Date()));
  
  const [reportYear, setReportYear] = useState(new Date().getFullYear());
  const [reportMonth, setReportMonth] = useState(new Date().getMonth());
  const [reportQuarter, setReportQuarter] = useState(Math.floor(new Date().getMonth() / 3));
  const [reportWeek, setReportWeek] = useState(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 1);
    const diff = now.getTime() - start.getTime();
    const oneDay = 1000 * 60 * 60 * 24;
    const day = Math.floor(diff / oneDay);
    return Math.floor(day / 7) + 1;
  });
  const [filterDeptId, setFilterDeptId] = useState('');
  const [expandedReportItemIds, setExpandedReportItemIds] = useState<string[]>([]);
  const [showWorkingDaysDetail, setShowWorkingDaysDetail] = useState(false);

  const toggleExpandReportItem = (itemId: string) => {
    setExpandedReportItemIds(prev => prev.includes(itemId) ? prev.filter(id => id !== itemId) : [...prev, itemId]);
  };

  useEffect(() => {
    if (reportType === 'custom') return;

    let start = new Date();
    let end = new Date();

    if (reportType === 'week') {
      const firstDayOfYear = new Date(reportYear, 0, 1);
      const daysOffset = (reportWeek - 1) * 7;
      start = new Date(reportYear, 0, 1 + daysOffset);
      end = new Date(reportYear, 0, 1 + daysOffset + 6);
    } else if (reportType === 'month') {
      start = new Date(reportYear, reportMonth, 1);
      end = new Date(reportYear, reportMonth + 1, 0);
    } else if (reportType === 'quarter') {
      start = new Date(reportYear, reportQuarter * 3, 1);
      end = new Date(reportYear, (reportQuarter + 1) * 3, 0);
    } else if (reportType === 'year') {
      start = new Date(reportYear, 0, 1);
      end = new Date(reportYear, 11, 31);
    }

    setStartDate(getLocalYYYYMMDD(start));
    setEndDate(getLocalYYYYMMDD(end));
  }, [reportType, reportYear, reportMonth, reportQuarter, reportWeek]);

  const setPeriod = (type: 'week' | 'month' | 'quarter' | 'year') => {
    setReportType(type);
  };

  // Use local time for comparison
  const startDateTime = useMemo(() => new Date(startDate + 'T00:00:00').getTime(), [startDate]);
  const endDateTime = useMemo(() => new Date(endDate + 'T23:59:59').getTime(), [endDate]);

  // Calculate actual working days in range with future cutoff and holiday exclusions
  const workingDaysInfo = useMemo(() => {
    return calculateWorkingDaysWithFutureCutoff(startDate, endDate, holidays);
  }, [startDate, endDate, holidays]);

  const workingDaysInRange = useMemo(() => {
    return Math.max(1, workingDaysInfo.actualWorkingDays > 0 ? workingDaysInfo.actualWorkingDays : workingDaysInfo.fullRangeWorkingDays);
  }, [workingDaysInfo]);

  // Pre-group transactions by itemId for performance
  const transactionsByItem = useMemo(() => {
    const map: Record<string, Transaction[]> = {};
    transactions.forEach(t => {
      if (!t.itemId) return;
      if (!map[t.itemId]) map[t.itemId] = [];
      map[t.itemId].push(t);
    });
    return map;
  }, [transactions]);

  const daysInRange = Math.max(1, Math.ceil((endDateTime - startDateTime) / 86400000));

  const prevStartDateTime = useMemo(() => {
    const start = new Date(startDate + 'T00:00:00');
    if (reportType === 'month') {
      return new Date(start.getFullYear(), start.getMonth() - 1, 1).getTime();
    } else if (reportType === 'week') {
      return start.getTime() - 7 * 24 * 60 * 60 * 1000;
    } else if (reportType === 'quarter') {
      return new Date(start.getFullYear(), start.getMonth() - 3, 1).getTime();
    } else if (reportType === 'year') {
      return new Date(start.getFullYear() - 1, 0, 1).getTime();
    }
    const end = new Date(endDate + 'T23:59:59');
    return start.getTime() - (end.getTime() - start.getTime()) - 1000;
  }, [startDate, endDate, reportType]);

  const prevEndDateTime = useMemo(() => {
    const start = new Date(startDate + 'T00:00:00');
    if (reportType === 'month') {
      return new Date(start.getFullYear(), start.getMonth(), 0, 23, 59, 59).getTime();
    } else if (reportType === 'week') {
      return start.getTime() - 1000;
    } else if (reportType === 'quarter') {
      return new Date(start.getFullYear(), start.getMonth(), 0, 23, 59, 59).getTime();
    } else if (reportType === 'year') {
      return new Date(start.getFullYear() - 1, 11, 31, 23, 59, 59).getTime();
    }
    return start.getTime() - 1000;
  }, [startDate, endDate, reportType]);

  const filteredTransactions = useMemo(() => {
    return transactions.filter(t => {
      const ts = t.timestamp?.toDate ? t.timestamp.toDate().getTime() : 
                 (t.timestamp?.seconds ? t.timestamp.seconds * 1000 :
                 (t.timestamp ? new Date(t.timestamp).getTime() : 0));
      return ts >= startDateTime && ts <= endDateTime;
    });
  }, [transactions, startDateTime, endDateTime]);

  const transSummary = useMemo(() => {
    const summary = {
      IN: 0,
      OUT: 0,
      TRANSFER: 0,
      byDept: {} as Record<string, { IN: number, OUT: number, TRANSFER: number }>
    };

    filteredTransactions.forEach(t => {
      summary[t.type as 'IN' | 'OUT' | 'TRANSFER'] += t.quantity;
      
      const deptId = t.toDeptId || 'unknown';
      if (!summary.byDept[deptId]) {
        summary.byDept[deptId] = { IN: 0, OUT: 0, TRANSFER: 0 };
      }
      summary.byDept[deptId][t.type as 'IN' | 'OUT' | 'TRANSFER'] += t.quantity;
    });

    return summary;
  }, [filteredTransactions]);

  const detailedReport = useMemo(() => {
    let filteredItems = globalSearch 
      ? items.filter(i => i.name.toLowerCase().includes(globalSearch.toLowerCase()))
      : items;

    if (filterDeptId) {
      filteredItems = filteredItems.filter(i => i.departmentId === filterDeptId);
    }

    return filteredItems.map(item => {
      const itemTrans = transactionsByItem[item.id] || [];
      
      const createdAtTs = item.createdAt?.toDate ? item.createdAt.toDate().getTime() : 
                          (item.createdAt?.seconds ? item.createdAt.seconds * 1000 :
                          (item.createdAt ? new Date(item.createdAt).getTime() : 0));
      
      const getTs = (t: any) => {
        if (!t.timestamp) return 0;
        
        // Handle Firestore Timestamp
        if (typeof t.timestamp.toDate === 'function') {
          return t.timestamp.toDate().getTime();
        }
        
        // Handle Firestore Timestamp-like object {seconds, nanoseconds}
        if (t.timestamp.seconds !== undefined) {
          return t.timestamp.seconds * 1000;
        }
        
        // Handle Date object or string
        const ts = new Date(t.timestamp).getTime();
        if (!isNaN(ts)) return ts;

        // Handle DD/MM/YYYY format
        const dateStr = String(t.timestamp);
        const ddmmyyyy = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(.*)$/);
        if (ddmmyyyy) {
          const [_, d, m, y, rest] = ddmmyyyy;
          return new Date(`${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}${rest || ''}`).getTime();
        }
        
        return 0;
      };

      const earliestTransTs = itemTrans.length > 0 
        ? Math.min(...itemTrans.map(t => getTs(t)))
        : Infinity;
      
      const effectiveCreatedAtTs = createdAtTs > 0 
        ? Math.min(createdAtTs, earliestTransTs) 
        : (earliestTransTs === Infinity ? 0 : earliestTransTs);

      // If item didn't exist yet (no transactions and created later), hide it
      if (effectiveCreatedAtTs > endDateTime && earliestTransTs > endDateTime) {
        return {
          ...item,
          openingBalance: 0,
          closingBalance: 0,
          inQty: 0,
          outQty: 0,
          prevOutQty: 0,
          avgDailyUsage: 0
        };
      }

      // Transactions within the selected range
      const transInRange = itemTrans.filter(t => {
        const ts = getTs(t);
        return ts >= startDateTime && ts <= endDateTime;
      });

      const inQty = transInRange.filter(t => t.type === 'IN').reduce((sum, t) => sum + Number(t.quantity || 0), 0);
      const outQty = transInRange.filter(t => t.type === 'OUT' || t.type === 'TRANSFER').reduce((sum, t) => sum + Number(t.quantity || 0), 0);

      // Previous period out quantity
      const prevTransInRange = itemTrans.filter(t => {
        const ts = getTs(t);
        return ts >= prevStartDateTime && ts <= prevEndDateTime;
      });
      const prevOutQty = prevTransInRange.filter(t => t.type === 'OUT' || t.type === 'TRANSFER').reduce((sum, t) => sum + Number(t.quantity || 0), 0);

      // Transactions from startDateTime until NOW (to calculate opening balance)
      const transFromStart = itemTrans.filter(t => getTs(t) >= startDateTime);
      const inFromStart = transFromStart.filter(t => t.type === 'IN').reduce((sum, t) => sum + Number(t.quantity || 0), 0);
      const outFromStart = transFromStart.filter(t => t.type === 'OUT' || t.type === 'TRANSFER').reduce((sum, t) => sum + Number(t.quantity || 0), 0);
      
      // Opening Balance = Current Stock - (All IN since Start) + (All OUT since Start)
      let openingBalance = Number(item.currentStock || 0) - inFromStart + outFromStart;
      
      // If item didn't exist before startDateTime, its opening balance was 0
      if (effectiveCreatedAtTs > startDateTime) {
        openingBalance = 0;
      }

      const closingBalance = openingBalance + inQty - outQty;
      const avgDailyUsage = outQty / (workingDaysInRange || 1);

      return {
        ...item,
        openingBalance,
        closingBalance,
        inQty,
        outQty,
        prevOutQty,
        avgDailyUsage
      };
    });
  }, [items, transactionsByItem, startDateTime, endDateTime, prevStartDateTime, prevEndDateTime, workingDaysInRange, globalSearch, startDate, endDate]);

  const totalIn = useMemo(() => detailedReport.reduce((sum, item) => sum + item.inQty, 0), [detailedReport]);
  const totalOut = useMemo(() => detailedReport.reduce((sum, item) => sum + item.outQty, 0), [detailedReport]);
  const totalPrevOut = useMemo(() => detailedReport.reduce((sum, item) => sum + item.prevOutQty, 0), [detailedReport]);
  const totalValue = useMemo(() => detailedReport.reduce((sum, item) => sum + (Number(item.closingBalance) * Number(item.price || 0)), 0), [detailedReport]);
  
  const { totalTransactionsInRange, uniqueItemsWithTransactionsCount } = useMemo(() => {
    const getTs = (t: any) => {
      if (!t.timestamp) return 0;
      if (typeof t.timestamp.toDate === 'function') return t.timestamp.toDate().getTime();
      if (t.timestamp.seconds !== undefined) return t.timestamp.seconds * 1000;
      const ts = new Date(t.timestamp).getTime();
      if (!isNaN(ts)) return ts;
      const dateStr = String(t.timestamp);
      const ddmmyyyy = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(.*)$/);
      if (ddmmyyyy) {
        const [_, d, m, y, rest] = ddmmyyyy;
        return new Date(`${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}${rest || ''}`).getTime();
      }
      return 0;
    };

    const inRange = transactions.filter(t => {
      const ts = getTs(t);
      return ts >= startDateTime && ts <= endDateTime;
    });

    return {
      totalTransactionsInRange: inRange.length,
      uniqueItemsWithTransactionsCount: new Set(inRange.map(t => t.itemId)).size
    };
  }, [transactions, startDateTime, endDateTime]);

  const uniqueCategories = useMemo(() => {
    const map = new Map<string, Category>();
    categories.forEach(cat => {
      const normalizedName = cat.name.trim().toLowerCase();
      if (!map.has(normalizedName)) {
        map.set(normalizedName, cat);
      }
    });
    return Array.from(map.values());
  }, [categories]);

  const categoryValueData = useMemo(() => {
    if (!uniqueCategories.length || !detailedReport.length) return [];
    return uniqueCategories.map(cat => {
      const catItems = detailedReport.filter(i => i.categoryId === cat.id);
      const value = catItems.reduce((sum, i) => {
        const closing = Number(i.closingBalance) || 0;
        const price = Number(i.price) || 0;
        return sum + (closing * price);
      }, 0);
      return { name: cat.name, value: Math.max(0, value) };
    }).filter(d => d.value > 0).sort((a, b) => b.value - a.value);
  }, [uniqueCategories, detailedReport]);

  const categoryFluctuationData = useMemo(() => {
    if (!uniqueCategories.length || !detailedReport.length) return [];
    return uniqueCategories.map(cat => {
      const catItems = detailedReport.filter(i => i.categoryId === cat.id);
      const inQty = catItems.reduce((sum, i) => sum + (Number(i.inQty) || 0), 0);
      const outQty = catItems.reduce((sum, i) => sum + (Number(i.outQty) || 0), 0);
      return { name: cat.name, inQty, outQty };
    }).filter(d => d.inQty > 0 || d.outQty > 0).sort((a, b) => (b.inQty + b.outQty) - (a.inQty + a.outQty));
  }, [uniqueCategories, detailedReport]);

  const [searchTerm, setSearchTerm] = useState('');
  const [showOnlyWithChanges, setShowOnlyWithChanges] = useState(false);

  const filteredDetailedReport = useMemo(() => {
    return detailedReport.filter(item => {
      const matchesSearch = (
        matchesSearchQuery(item.name, searchTerm) ||
        matchesSearchQuery(item.code, searchTerm) ||
        matchesSearchQuery(item.specification, searchTerm)
      ) && (
        matchesSearchQuery(item.name, globalSearch) ||
        matchesSearchQuery(item.code, globalSearch)
      );
      const hasChanges = item.inQty > 0 || item.outQty > 0;
      return matchesSearch && (!showOnlyWithChanges || hasChanges);
    });
  }, [detailedReport, searchTerm, globalSearch, showOnlyWithChanges]);

  const itemComparisonData = useMemo(() => {
    const data = filteredDetailedReport
      .filter(item => item.outQty > 0 || item.prevOutQty > 0)
      .map(item => {
        const current = item.outQty;
        const previous = item.prevOutQty || 0;
        let percentChange = 0;
        if (previous > 0) {
          percentChange = ((current - previous) / previous) * 100;
        } else if (current > 0) {
          percentChange = 100;
        }
        return {
          name: item.name,
          current,
          previous,
          percentChange: Math.round(percentChange)
        };
      })
      .sort((a, b) => b.current - a.current)
      .slice(0, 10);
    
    return data;
  }, [filteredDetailedReport]);

  const [isChartReady, setIsChartReady] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setIsChartReady(true), 1000);
    return () => clearTimeout(timer);
  }, []);

  const handleExportExcel = () => {
    const data = filteredDetailedReport.map(item => {
      const batches = getItemBatches(item);
      const batchSummary = batches.map(b => `${b.batchNumber}: ${formatQty(b.quantity)} (HSD: ${b.expiryDate || 'N/A'})`).join('; ');
      return {
        'Tên vật tư': item.name,
        'Nhóm': categories.find(c => c.id === item.categoryId)?.name || '-',
        'Đơn vị': item.unit,
        'Tồn đầu (Tất cả lô)': formatQty(item.openingBalance),
        'Nhập trong kỳ': formatQty(item.inQty),
        'Xuất trong kỳ': formatQty(item.outQty),
        'Tồn cuối (Tổng các lô)': formatQty(item.closingBalance),
        'Chi tiết các lô': batchSummary || 'Không có lô',
        'Tiêu thụ bình quân/ngày': item.avgDailyUsage.toFixed(2)
      };
    });

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Báo cáo tồn kho");
    XLSX.writeFile(wb, `Bao_cao_ton_kho_${startDate}_den_${endDate}.xlsx`);
    toast.success('Đã xuất file Excel thành công!');
  };

  const handleExportPDF = () => {
    const element = document.createElement('div');
    // Use explicit inline styles with hex colors to avoid oklch parsing issues in html2canvas/html2pdf
    element.style.backgroundColor = '#ffffff';
    element.style.color = '#0f172a';
    element.style.fontFamily = 'Inter, ui-sans-serif, system-ui, sans-serif';
    element.style.width = '100%'; 
    
    const title = `
      <div style="text-align: center; margin-bottom: 20px; padding-top: 10px;">
        <h1 style="font-size: 24px; font-weight: bold; margin-bottom: 8px; color: #1e293b;">BÁO CÁO TỒN KHO VẬT TƯ</h1>
        <p style="font-size: 12px; color: #64748b;">Từ ngày: ${formatDate(startDate)} đến ngày: ${formatDate(endDate)}</p>
      </div>
    `;

    const tableHeader = `
      <table style="width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 9px;">
        <thead>
          <tr style="background-color: #3b82f6; color: white;">
            <th style="padding: 8px; border: 1px solid #e2e8f0; text-align: left;">Vật tư</th>
            <th style="padding: 8px; border: 1px solid #e2e8f0; text-align: left;">Nhóm</th>
            <th style="padding: 8px; border: 1px solid #e2e8f0; text-align: center;">Đơn vị</th>
            <th style="padding: 8px; border: 1px solid #e2e8f0; text-align: right;">Tồn đầu</th>
            <th style="padding: 8px; border: 1px solid #e2e8f0; text-align: right;">Nhập</th>
            <th style="padding: 8px; border: 1px solid #e2e8f0; text-align: right;">Xuất</th>
            <th style="padding: 8px; border: 1px solid #e2e8f0; text-align: right;">Tồn cuối</th>
          </tr>
        </thead>
        <tbody>
          ${filteredDetailedReport.map(item => `
            <tr style="page-break-inside: avoid;">
              <td style="padding: 6px; border: 1px solid #e2e8f0;">${item.name}</td>
              <td style="padding: 6px; border: 1px solid #e2e8f0;">${categories.find(c => c.id === item.categoryId)?.name || '-'}</td>
              <td style="padding: 6px; border: 1px solid #e2e8f0; text-align: center;">${item.unit}</td>
              <td style="padding: 6px; border: 1px solid #e2e8f0; text-align: right;">${formatQty(item.openingBalance)}</td>
              <td style="padding: 6px; border: 1px solid #e2e8f0; text-align: right; color: #2563eb;">+${formatQty(item.inQty)}</td>
              <td style="padding: 6px; border: 1px solid #e2e8f0; text-align: right; color: #059669;">-${formatQty(item.outQty)}</td>
              <td style="padding: 6px; border: 1px solid #e2e8f0; text-align: right; font-weight: bold;">${formatQty(item.closingBalance)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;

    const footer = `
      <div style="margin-top: 30px; text-align: right; font-size: 9px; color: #64748b; page-break-inside: avoid;">
        <p>Ngày xuất báo cáo: ${new Date().toLocaleDateString('vi-VN')} ${new Date().toLocaleTimeString('vi-VN')}</p>
        <p>Người lập biểu: ${auth.currentUser?.displayName || auth.currentUser?.email || 'Hệ thống'}</p>
      </div>
    `;

    element.innerHTML = title + tableHeader + footer;

    const opt = {
      margin: [15, 15, 20, 15] as [number, number, number, number],
      filename: `Bao_cao_ton_kho_${startDate}_den_${endDate}.pdf`,
      image: { type: 'jpeg' as const, quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' as const },
      pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
    };

    html2pdf().from(element).set(opt).save().then(() => {
      toast.success('Đã xuất file PDF thành công!');
    });
  };

  return (
    <div className="space-y-8 pb-8">
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
        <div>
          <h2 className={`text-2xl font-bold tracking-tight ${darkMode ? 'text-white' : 'text-slate-900'}`}>Báo cáo & Thống kê</h2>
          <p className={`${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Phân tích chi tiết lưu lượng và giá trị kho hàng.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className={`flex p-1 rounded-xl border ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-slate-100 border-slate-200'}`}>
            <button 
              onClick={() => setPeriod('week')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${reportType === 'week' ? (darkMode ? 'bg-slate-700 text-blue-400 shadow-sm' : 'bg-white text-blue-600 shadow-sm') : (darkMode ? 'text-slate-500 hover:text-slate-300' : 'text-slate-500 hover:text-slate-700')}`}
            >
              Tuần
            </button>
            <button 
              onClick={() => setPeriod('month')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${reportType === 'month' ? (darkMode ? 'bg-slate-700 text-blue-400 shadow-sm' : 'bg-white text-blue-600 shadow-sm') : (darkMode ? 'text-slate-500 hover:text-slate-300' : 'text-slate-500 hover:text-slate-700')}`}
            >
              Tháng
            </button>
            <button 
              onClick={() => setPeriod('quarter')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${reportType === 'quarter' ? (darkMode ? 'bg-slate-700 text-blue-400 shadow-sm' : 'bg-white text-blue-600 shadow-sm') : (darkMode ? 'text-slate-500 hover:text-slate-300' : 'text-slate-500 hover:text-slate-700')}`}
            >
              Quý
            </button>
            <button 
              onClick={() => setPeriod('year')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${reportType === 'year' ? (darkMode ? 'bg-slate-700 text-blue-400 shadow-sm' : 'bg-white text-blue-600 shadow-sm') : (darkMode ? 'text-slate-500 hover:text-slate-300' : 'text-slate-500 hover:text-slate-700')}`}
            >
              Năm
            </button>
            <button 
              onClick={() => setReportType('custom')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${reportType === 'custom' ? (darkMode ? 'bg-slate-700 text-blue-400 shadow-sm' : 'bg-white text-blue-600 shadow-sm') : (darkMode ? 'text-slate-500 hover:text-slate-300' : 'text-slate-500 hover:text-slate-700')}`}
            >
              Tùy chọn
            </button>
          </div>
          
          {reportType !== 'custom' && (
            <div className="flex items-center gap-2">
              <select 
                value={reportYear}
                onChange={(e) => setReportYear(parseInt(e.target.value))}
                className={`px-3 py-1.5 border rounded-xl text-xs font-bold focus:ring-2 focus:ring-blue-500 outline-none ${darkMode ? 'bg-slate-800 border-slate-700 text-slate-300' : 'bg-white border-slate-200 text-slate-600'}`}
              >
                {[2023, 2024, 2025, 2026, 2027].map(y => (
                  <option key={y} value={y}>Năm {y}</option>
                ))}
              </select>

              {reportType === 'week' && (
                <select 
                  value={reportWeek}
                  onChange={(e) => setReportWeek(parseInt(e.target.value))}
                  className={`px-3 py-1.5 border rounded-xl text-xs font-bold focus:ring-2 focus:ring-blue-500 outline-none ${darkMode ? 'bg-slate-800 border-slate-700 text-slate-300' : 'bg-white border-slate-200 text-slate-600'}`}
                >
                  {Array.from({ length: 53 }, (_, i) => i + 1).map(w => (
                    <option key={w} value={w}>Tuần {w}</option>
                  ))}
                </select>
              )}

              {reportType === 'month' && (
                <select 
                  value={reportMonth}
                  onChange={(e) => setReportMonth(parseInt(e.target.value))}
                  className={`px-3 py-1.5 border rounded-xl text-xs font-bold focus:ring-2 focus:ring-blue-500 outline-none ${darkMode ? 'bg-slate-800 border-slate-700 text-slate-300' : 'bg-white border-slate-200 text-slate-600'}`}
                >
                  {Array.from({ length: 12 }, (_, i) => i).map(m => (
                    <option key={m} value={m}>Tháng {m + 1}</option>
                  ))}
                </select>
              )}

              {reportType === 'quarter' && (
                <select 
                  value={reportQuarter}
                  onChange={(e) => setReportQuarter(parseInt(e.target.value))}
                  className={`px-3 py-1.5 border rounded-xl text-xs font-bold focus:ring-2 focus:ring-blue-500 outline-none ${darkMode ? 'bg-slate-800 border-slate-700 text-slate-300' : 'bg-white border-slate-200 text-slate-600'}`}
                >
                  {[0, 1, 2, 3].map(q => (
                    <option key={q} value={q}>Quý {q + 1}</option>
                  ))}
                </select>
              )}
            </div>
          )}
          
          {reportType === 'custom' && (
            <div className="flex items-center gap-2">
              <input 
                type="date" 
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className={`px-3 py-1.5 border rounded-xl text-xs font-medium focus:ring-2 focus:ring-blue-500 outline-none ${darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-900'}`}
              />
              <span className="text-slate-400">→</span>
              <input 
                type="date" 
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className={`px-3 py-1.5 border rounded-xl text-xs font-medium focus:ring-2 focus:ring-blue-500 outline-none ${darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-900'}`}
              />
            </div>
          )}

          <div className="flex items-center gap-2">
            <select 
              value={filterDeptId}
              onChange={(e) => setFilterDeptId(e.target.value)}
              className={`px-3 py-1.5 border rounded-xl text-xs font-bold focus:ring-2 focus:ring-blue-500 outline-none ${darkMode ? 'bg-slate-800 border-slate-700 text-slate-300' : 'bg-white border-slate-200 text-slate-600'}`}
            >
              <option value="">Tất cả phòng</option>
              {departments.filter(d => d.name !== 'Tất cả' && d.name !== 'Tất cả phòng').map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>

          <div className="flex gap-2">
            <button 
              onClick={handleExportExcel}
              title="Xuất file Excel"
              className={`p-2 border rounded-xl transition-all ${darkMode ? 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
            >
              <Download className="w-4 h-4" />
            </button>
            <button 
              onClick={handleExportPDF}
              title="Xuất file PDF"
              className="p-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-100"
            >
              <FileText className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Thông báo số ngày làm việc thực tế (có trừ ngày nghỉ & xử lý mốc tương lai) */}
      <div className={`mb-6 p-3 sm:p-4 rounded-2xl border transition-all ${
        darkMode 
          ? 'bg-slate-800/90 border-blue-500/30 shadow-md' 
          : 'bg-gradient-to-r from-blue-50/90 via-sky-50/70 to-indigo-50/80 border-blue-200 shadow-sm'
      }`}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className={`p-2 rounded-xl shrink-0 ${
              workingDaysInfo.isFutureEnd 
                ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30' 
                : 'bg-blue-600/10 text-blue-600 dark:text-blue-400 border border-blue-500/20'
            }`}>
              {workingDaysInfo.isFutureEnd ? (
                <Clock className="w-5 h-5" />
              ) : (
                <Calendar className="w-5 h-5" />
              )}
            </div>
            
            <div className="flex flex-wrap items-center gap-2">
              <span className={`text-sm font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                Số ngày làm việc thực tế:
              </span>
              <span className="inline-flex items-center px-3 py-0.5 rounded-full text-sm font-black bg-blue-600 text-white shadow-sm">
                {workingDaysInfo.actualWorkingDays} ngày
              </span>
              {workingDaysInfo.isFutureEnd && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200 border border-amber-300 dark:border-amber-700">
                  ⚡ Mốc kết thúc ở tương lai
                </span>
              )}
              {workingDaysInfo.actualHolidaysDeducted > 0 && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
                  Đã trừ {workingDaysInfo.actualHolidaysDeducted} ngày nghỉ
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 self-start md:self-center">
            {/* Nút hiển thị / ẩn chi tiết */}
            <button
              type="button"
              onClick={() => setShowWorkingDaysDetail(prev => !prev)}
              className={`px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-all ${
                showWorkingDaysDetail
                  ? 'bg-blue-600 border-blue-600 text-white shadow-xs'
                  : darkMode 
                  ? 'bg-slate-700/80 border-slate-600 text-slate-200 hover:bg-slate-700' 
                  : 'bg-white border-blue-200 text-blue-700 hover:bg-blue-50 shadow-xs'
              }`}
              title={showWorkingDaysDetail ? "Thu gọn chi tiết giải thích" : "Xem chi tiết cách tính số ngày"}
            >
              <Info className="w-3.5 h-3.5" />
              <span>{showWorkingDaysDetail ? 'Ẩn chi tiết' : 'Hiển thị chi tiết'}</span>
              {showWorkingDaysDetail ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
            </button>

            {onNavigateHolidays && (
              <button
                type="button"
                onClick={onNavigateHolidays}
                className={`px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                  darkMode 
                    ? 'bg-slate-700/80 border-slate-600 text-slate-200 hover:bg-slate-700' 
                    : 'bg-white border-blue-200 text-blue-700 hover:bg-blue-50 shadow-xs'
                }`}
                title="Xem và chỉnh sửa danh sách ngày nghỉ"
              >
                <Calendar className="w-3.5 h-3.5 text-blue-500" />
                <span>Xem ngày nghỉ ({holidays.length})</span>
              </button>
            )}
          </div>
        </div>

        {/* Nội dung chi tiết chỉ hiển thị khi bấm 'Hiển thị chi tiết' */}
        {showWorkingDaysDetail && (
          <div className={`mt-3 pt-3 border-t text-xs leading-relaxed animate-in fade-in duration-200 ${
            darkMode ? 'border-slate-700/80 text-slate-300' : 'border-blue-200/60 text-slate-600'
          }`}>
            {workingDaysInfo.isFutureStart ? (
              <p>
                Khoảng thời gian chọn: <strong className={darkMode ? 'text-white' : 'text-slate-800'}>{formatDate(startDate)} → {formatDate(endDate)}</strong> ({workingDaysInfo.fullRangeCalendarDays} ngày lịch). 
                Toàn bộ thời gian nằm ở tương lai (sau hôm nay {formatDate(workingDaysInfo.todayStr)}). Số ngày làm việc thực tế đã qua: <strong>0 ngày</strong> (Dự kiến toàn kỳ: <strong>{workingDaysInfo.fullRangeWorkingDays} ngày làm việc</strong>, trừ {workingDaysInfo.fullRangeHolidaysCount} ngày nghỉ).
              </p>
            ) : workingDaysInfo.isFutureEnd ? (
              <div className="space-y-1">
                <p>
                  Khoảng thời gian đã chọn: <strong className={darkMode ? 'text-white' : 'text-slate-800'}>{formatDate(startDate)} → {formatDate(endDate)}</strong> (Dự kiến toàn kỳ: <strong>{workingDaysInfo.fullRangeWorkingDays} ngày làm việc</strong> / {workingDaysInfo.fullRangeCalendarDays} ngày lịch, đã trừ {workingDaysInfo.fullRangeHolidaysCount} ngày nghỉ).
                </p>
                <p className="text-amber-700 dark:text-amber-300 font-medium">
                  ↳ Do mốc kết thúc nằm ở tương lai, hệ thống tự động tính từ mốc bắt đầu (<strong>{formatDate(startDate)}</strong>) đến hiện tại (<strong>{formatDate(workingDaysInfo.todayStr)}</strong>) là <strong className="font-bold underline decoration-amber-500">{workingDaysInfo.actualWorkingDays} ngày làm việc thực tế</strong> (đã khấu trừ <strong>{workingDaysInfo.actualHolidaysDeducted} ngày nghỉ</strong> trong mục Ngày nghỉ) để phản ánh chính xác tốc độ tiêu hao thực tế.
                </p>
              </div>
            ) : (
              <p>
                Khoảng thời gian: <strong className={darkMode ? 'text-white' : 'text-slate-800'}>{formatDate(startDate)} → {formatDate(endDate)}</strong> ({workingDaysInfo.actualCalendarDays} ngày lịch). 
                Đã trừ <strong>{workingDaysInfo.actualHolidaysDeducted} ngày nghỉ lễ/nghỉ trực</strong> trong mục "Ngày nghỉ". Số ngày làm việc thực tế phục vụ tính định mức tiêu hao trung bình/ngày: <strong className="font-bold text-blue-600 dark:text-blue-400">{workingDaysInfo.actualWorkingDays} ngày</strong>.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Summary Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        <div className={`p-5 rounded-2xl border shadow-sm ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-xl bg-blue-500/10 text-blue-500">
              <DollarSign className="w-6 h-6" />
            </div>
            <div>
              <p className={`text-xs font-medium ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Tổng giá trị tồn</p>
              <h4 className={`text-lg font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                {totalValue.toLocaleString('vi-VN')} <span className="text-xs font-normal opacity-70">đ</span>
              </h4>
            </div>
          </div>
        </div>
        <div className={`p-5 rounded-2xl border shadow-sm ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-xl bg-blue-500/10 text-blue-500">
              <ArrowUpRight className="w-6 h-6" />
            </div>
            <div>
              <p className={`text-xs font-medium ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Tổng nhập trong kỳ</p>
              <h4 className={`text-lg font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                {formatQty(totalIn)} <span className="text-xs font-normal opacity-70">đơn vị</span>
              </h4>
            </div>
          </div>
        </div>
        <div className={`p-5 rounded-2xl border shadow-sm ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-xl bg-rose-500/10 text-rose-500">
              <ArrowDownRight className="w-6 h-6" />
            </div>
            <div>
              <p className={`text-xs font-medium ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Tổng xuất trong kỳ</p>
              <h4 className={`text-lg font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                {formatQty(totalOut)} <span className="text-xs font-normal opacity-70">đơn vị</span>
              </h4>
            </div>
          </div>
        </div>
        
        {/* New Transaction Stats in Reports */}
        <div className={`p-5 rounded-2xl border shadow-sm ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-xl bg-indigo-500/10 text-indigo-500">
              <ArrowLeftRight className="w-6 h-6" />
            </div>
            <div>
              <p className={`text-xs font-medium ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Số lượt giao dịch</p>
              <h4 className={`text-lg font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                {totalTransactionsInRange.toLocaleString('vi-VN')} <span className="text-xs font-normal opacity-70">lượt</span>
              </h4>
            </div>
          </div>
        </div>
        <div className={`p-5 rounded-2xl border shadow-sm ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-xl bg-purple-500/10 text-purple-500">
              <Package className="w-6 h-6" />
            </div>
            <div>
              <p className={`text-xs font-medium ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Vật tư có biến động</p>
              <h4 className={`text-lg font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                {uniqueItemsWithTransactionsCount.toLocaleString('vi-VN')} <span className="text-xs font-normal opacity-70">loại</span>
              </h4>
            </div>
          </div>
        </div>

        <div className={`p-5 rounded-2xl border shadow-sm ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-xl bg-amber-500/10 text-amber-500">
              <TrendingUp className="w-6 h-6" />
            </div>
            <div>
              <p className={`text-xs font-medium ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Biến động tiêu thụ</p>
              <div className="flex items-baseline gap-2">
                <h4 className={`text-lg font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                  {totalPrevOut > 0 ? (((totalOut - totalPrevOut) / totalPrevOut) * 100).toFixed(1) : (totalOut > 0 ? '100' : '0')}%
                </h4>
                <span className={`text-[10px] ${totalOut > totalPrevOut ? 'text-rose-500' : 'text-emerald-500'}`}>
                  {totalOut > totalPrevOut ? 'Tăng' : 'Giảm'} so với kỳ trước
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Transaction Summary Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div className={`p-6 rounded-2xl border shadow-sm ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
          <h3 className={`text-sm font-bold mb-4 uppercase tracking-wider ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Tổng hợp giao dịch</h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 rounded-xl bg-blue-500/5 border border-blue-500/10">
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                <span className={`text-sm font-medium ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>Tổng nhập kho</span>
              </div>
              <span className="text-sm font-bold text-blue-600">{formatQty(transSummary.IN)} đơn vị</span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-xl bg-rose-500/5 border border-rose-500/10">
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-rose-500"></div>
                <span className={`text-sm font-medium ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>Tổng xuất kho</span>
              </div>
              <span className="text-sm font-bold text-rose-600">{formatQty(transSummary.OUT)} đơn vị</span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-xl bg-amber-500/5 border border-amber-500/10">
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-amber-500"></div>
                <span className={`text-sm font-medium ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>Tổng chuyển kho</span>
              </div>
              <span className="text-sm font-bold text-amber-600">{formatQty(transSummary.TRANSFER)} đơn vị</span>
            </div>
          </div>
        </div>

        <div className={`p-6 rounded-2xl border shadow-sm ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
          <h3 className={`text-sm font-bold mb-4 uppercase tracking-wider ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Tiêu thụ theo phòng ban</h3>
          <div className="space-y-2 max-h-[180px] overflow-y-auto pr-2 no-scrollbar">
            {Object.entries(transSummary.byDept).length > 0 ? (
              Object.entries(transSummary.byDept).map(([deptId, counts]) => {
                const dept = departments.find(d => d.id === deptId);
                if (counts.OUT === 0) return null;
                return (
                  <div key={deptId} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
                    <span className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>{dept?.name || 'Khác'}</span>
                    <span className={`text-sm font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>{formatQty(counts.OUT)} đơn vị</span>
                  </div>
                );
              })
            ) : (
              <p className="text-xs text-slate-400 italic text-center py-8">Chưa có dữ liệu tiêu thụ.</p>
            )}
          </div>
        </div>
      </div>

      {/* Detailed Table */}
      <div className={`mb-8 rounded-2xl border shadow-sm overflow-hidden ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
        <div className={`p-6 border-b flex flex-col md:flex-row justify-between items-start md:items-center gap-4 ${darkMode ? 'border-slate-700' : 'border-slate-100'}`}>
          <div>
            <h3 className={`font-bold flex items-center gap-2 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
              <ClipboardList className="w-5 h-5 text-blue-500" />
              Chi tiết vật tư trong kỳ
            </h3>
            <span className={`text-xs ${darkMode ? 'text-slate-500' : 'text-slate-500'}`}>Từ {formatDate(startDate)} đến {formatDate(endDate)}</span>
          </div>
          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
            <div className="relative flex-1 md:flex-none">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input 
                type="text"
                placeholder="Tìm kiếm vật tư..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className={`pl-9 pr-4 py-2 border rounded-xl text-xs focus:ring-2 focus:ring-blue-500 outline-none w-full md:w-64 ${darkMode ? 'bg-slate-700 border-slate-600 text-white placeholder-slate-500' : 'bg-slate-50 border-slate-200 text-slate-900'}`}
              />
            </div>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input 
                type="checkbox"
                checked={showOnlyWithChanges}
                onChange={(e) => setShowOnlyWithChanges(e.target.checked)}
                className={`w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 ${darkMode ? 'bg-slate-700 border-slate-600' : ''}`}
              />
              <span className={`text-xs font-medium ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>Chỉ hiện có biến động</span>
            </label>
          </div>
        </div>
        {/* Mobile Detailed Report Card List (< md) */}
        <div className="md:hidden divide-y divide-slate-100 dark:divide-slate-700/60">
          {filteredDetailedReport.length > 0 ? (
            filteredDetailedReport.map((item) => {
              const itemBatches = getItemBatches(item);
              const isExpanded = expandedReportItemIds.includes(item.id);

              return (
                <div key={item.id} className="p-4 space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h5 className={`text-sm font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>{item.name}</h5>
                        {item.code && (
                          <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 font-bold border border-blue-100 dark:border-blue-800">
                            {item.code}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[11px] text-slate-400">{categories.find(c => c.id === item.categoryId)?.name} · ĐV: {item.unit}</span>
                        <button
                          type="button"
                          onClick={() => toggleExpandReportItem(item.id)}
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border transition-colors cursor-pointer ${
                            isExpanded
                              ? 'bg-purple-600 text-white border-purple-600'
                              : (darkMode ? 'bg-purple-950/50 text-purple-300 border-purple-800/60' : 'bg-purple-50 text-purple-700 border-purple-200')
                          }`}
                        >
                          <Layers className="w-3 h-3 text-purple-500" />
                          <span>{itemBatches.length} lô</span>
                          <ChevronDown className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                        </button>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-[10px] text-slate-400 block uppercase font-semibold">Tồn cuối (Tất cả lô)</span>
                      <span className={`text-sm font-black px-2 py-0.5 rounded-md inline-block mt-0.5 ${darkMode ? 'bg-slate-700 text-slate-100' : 'bg-slate-100 text-slate-900'}`}>
                        {formatQty(item.closingBalance)} {item.unit}
                      </span>
                    </div>
                  </div>

                  {/* Lot breakdown expanded section (Mobile) */}
                  {isExpanded && (
                    <div className={`p-3 rounded-xl border space-y-2 ${darkMode ? 'bg-slate-900/70 border-slate-700' : 'bg-purple-50/50 border-purple-100'}`}>
                      <div className="flex items-center justify-between text-[11px] font-bold text-purple-700 dark:text-purple-300">
                        <span className="flex items-center gap-1">
                          <Layers className="w-3 h-3" /> Chi tiết phân bổ theo từng lô:
                        </span>
                        <span className="text-[10px] text-slate-400 font-normal">
                          Tổng tồn: {formatQty(item.currentStock)} {item.unit}
                        </span>
                      </div>
                      <div className="space-y-1.5">
                        {itemBatches.map(b => {
                          const isExp = b.expiryDate && new Date(b.expiryDate) < new Date();
                          const isNear = b.expiryDate && 
                            (new Date(b.expiryDate).getTime() - new Date().getTime()) < (30 * 24 * 60 * 60 * 1000) &&
                            (new Date(b.expiryDate).getTime() - new Date().getTime()) > 0;
                          return (
                            <div key={b.id} className={`p-2 rounded-lg border text-xs flex justify-between items-center ${
                              darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-purple-100 shadow-xs'
                            }`}>
                              <div>
                                <span className="font-mono font-bold text-purple-600 dark:text-purple-400 block">
                                  {b.batchNumber}
                                </span>
                                <span className="text-[10px] text-slate-400">
                                  HSD: {b.expiryDate ? formatDate(b.expiryDate) : 'Chưa có'}
                                </span>
                              </div>
                              <div className="text-right">
                                <span className="font-bold text-slate-800 dark:text-white block">
                                  {formatQty(b.quantity)} {item.unit}
                                </span>
                                <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded ${
                                  isExp ? 'bg-red-100 text-red-600 dark:bg-red-950/60 dark:text-red-300' :
                                  isNear ? 'bg-orange-100 text-orange-600 dark:bg-orange-950/60 dark:text-orange-300' :
                                  'bg-emerald-100 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-300'
                                }`}>
                                  {isExp ? 'Hết hạn' : isNear ? 'Sắp hết' : 'An toàn'}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-3 gap-2 text-xs pt-1">
                    <div className={`p-2 rounded-lg ${darkMode ? 'bg-slate-700/50' : 'bg-slate-50'}`}>
                      <span className="text-[10px] text-slate-400 block">Tồn đầu</span>
                      <span className="font-semibold">{formatQty(item.openingBalance)}</span>
                    </div>
                    <div className="p-2 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
                      <span className="text-[10px] block opacity-80">Tổng nhập</span>
                      <span className="font-bold">+{formatQty(item.inQty)}</span>
                    </div>
                    <div className="p-2 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400">
                      <span className="text-[10px] block opacity-80">Tổng xuất</span>
                      <span className="font-bold">-{formatQty(item.outQty)}</span>
                    </div>
                  </div>
                  <div className="text-[11px] text-slate-400 flex justify-between items-center pt-0.5">
                    <span>Tiêu thụ trung bình:</span>
                    <span className="font-medium text-slate-600 dark:text-slate-300">{item.avgDailyUsage.toFixed(2)} {item.unit}/ngày</span>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="p-8 text-center text-slate-400">
              <p className="font-medium mb-2">
                {searchTerm 
                  ? `Không tìm thấy vật tư nào khớp với từ khóa "${searchTerm}".`
                  : 'Không tìm thấy dữ liệu vật tư phù hợp trong kỳ.'}
              </p>
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="mt-1 px-3 py-1.5 text-xs font-bold rounded-xl bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                >
                  Xóa bộ lọc tìm kiếm
                </button>
              )}
            </div>
          )}
        </div>

        {/* Desktop Detailed Report Table (>= md) */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className={`${darkMode ? 'bg-slate-900/50' : 'bg-slate-50/50'}`}>
                <th className={`p-4 text-xs font-bold uppercase tracking-wider border-b ${darkMode ? 'text-slate-400 border-slate-700' : 'text-slate-500 border-slate-100'}`}>
                  Vật tư & Phân lô
                </th>
                <th className={`p-4 text-xs font-bold uppercase tracking-wider border-b text-right ${darkMode ? 'text-slate-400 border-slate-700' : 'text-slate-500 border-slate-100'}`}>
                  Tồn đầu (Tất cả lô)
                </th>
                <th className={`p-4 text-xs font-bold uppercase tracking-wider border-b text-right ${darkMode ? 'text-slate-400 border-slate-700' : 'text-slate-500 border-slate-100'}`}>
                  Tổng nhập
                </th>
                <th className={`p-4 text-xs font-bold uppercase tracking-wider border-b text-right ${darkMode ? 'text-slate-400 border-slate-700' : 'text-slate-500 border-slate-100'}`}>
                  Tổng xuất
                </th>
                <th className={`p-4 text-xs font-bold uppercase tracking-wider border-b text-right ${darkMode ? 'text-slate-400 border-slate-700' : 'text-slate-500 border-slate-100'}`}>
                  Tồn cuối (Tổng các lô)
                </th>
                <th className={`p-4 text-xs font-bold uppercase tracking-wider border-b text-right ${darkMode ? 'text-slate-400 border-slate-700' : 'text-slate-500 border-slate-100'}`}>
                  Sử dụng/ngày
                </th>
              </tr>
            </thead>
            <tbody className={`divide-y ${darkMode ? 'divide-slate-700' : 'divide-slate-100'}`}>
              {filteredDetailedReport.length > 0 ? (
                filteredDetailedReport.map((item) => {
                  const itemBatches = getItemBatches(item);
                  const isExpanded = expandedReportItemIds.includes(item.id);

                  return (
                    <React.Fragment key={item.id}>
                      <tr className={`transition-colors ${darkMode ? 'hover:bg-slate-700/50' : 'hover:bg-slate-50/50'} ${isExpanded ? (darkMode ? 'bg-slate-800/40' : 'bg-purple-50/20') : ''}`}>
                        <td className="p-4">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <div className="flex items-center gap-2">
                                <p className={`text-sm font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>{item.name}</p>
                                {item.code && (
                                  <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 font-bold border border-blue-100 dark:border-blue-800">
                                    {item.code}
                                  </span>
                                )}
                              </div>
                              <p className={`text-[10px] ${darkMode ? 'text-slate-500' : 'text-slate-500'}`}>{categories.find(c => c.id === item.categoryId)?.name}</p>
                            </div>
                            <button
                              type="button"
                              onClick={() => toggleExpandReportItem(item.id)}
                              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold border transition-all cursor-pointer ${
                                isExpanded
                                  ? 'bg-purple-600 text-white border-purple-600 shadow-sm'
                                  : (darkMode ? 'bg-purple-950/40 text-purple-300 border-purple-800/60 hover:bg-purple-900/60' : 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100')
                              }`}
                              title="Bấm để xem danh sách chi tiết các lô"
                            >
                              <Layers className="w-3.5 h-3.5 text-purple-500" />
                              <span>{itemBatches.length} lô</span>
                              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                            </button>
                          </div>
                        </td>
                        <td className={`p-4 text-right text-sm font-medium ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>{formatQty(item.openingBalance)} {item.unit}</td>
                        <td className="p-4 text-right text-sm font-bold text-blue-600">+{formatQty(item.inQty)}</td>
                        <td className="p-4 text-right text-sm font-bold text-rose-600">-{formatQty(item.outQty)}</td>
                        <td className={`p-4 text-right text-sm font-bold ${darkMode ? 'text-slate-200' : 'text-slate-900'}`}>{formatQty(item.closingBalance)} {item.unit}</td>
                        <td className={`p-4 text-right text-sm font-medium ${darkMode ? 'text-slate-500' : 'text-slate-500'}`}>{item.avgDailyUsage.toFixed(2)}</td>
                      </tr>

                      {/* Expanded Sub-row for lot breakdown */}
                      {isExpanded && (
                        <tr className={`${darkMode ? 'bg-slate-900/70' : 'bg-purple-50/30'}`}>
                          <td colSpan={6} className="px-6 py-3 border-b border-purple-100 dark:border-slate-700">
                            <div className="space-y-2">
                              <div className="flex items-center justify-between text-xs font-bold text-purple-700 dark:text-purple-300">
                                <span className="flex items-center gap-1.5">
                                  <Layers className="w-3.5 h-3.5" /> Chi tiết phân bổ theo từng lô của vật tư (Tổng tồn: {formatQty(item.currentStock)} {item.unit}):
                                </span>
                                <span className="text-[11px] text-slate-500 font-normal">
                                  Tồn cuối hiển thị ở trên là tổng số lượng của tất cả các lô gộp lại
                                </span>
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
                                {itemBatches.map(b => {
                                  const isExp = b.expiryDate && new Date(b.expiryDate) < new Date();
                                  const isNear = b.expiryDate && 
                                    (new Date(b.expiryDate).getTime() - new Date().getTime()) < (30 * 24 * 60 * 60 * 1000) &&
                                    (new Date(b.expiryDate).getTime() - new Date().getTime()) > 0;

                                  return (
                                    <div key={b.id} className={`p-2.5 rounded-xl border text-xs flex justify-between items-center ${
                                      darkMode ? 'bg-slate-800/80 border-slate-700' : 'bg-white border-purple-100 shadow-sm'
                                    }`}>
                                      <div>
                                        <span className="font-mono font-bold text-purple-600 dark:text-purple-400 block">
                                          {b.batchNumber}
                                        </span>
                                        <span className="text-[10px] text-slate-400">
                                          HSD: {b.expiryDate ? formatDate(b.expiryDate) : 'Chưa có'}
                                        </span>
                                      </div>
                                      <div className="text-right">
                                        <span className="font-extrabold text-slate-800 dark:text-white block">
                                          {formatQty(b.quantity)} {item.unit}
                                        </span>
                                        <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded ${
                                          isExp ? 'bg-red-100 text-red-600 dark:bg-red-950/60 dark:text-red-300' :
                                          isNear ? 'bg-orange-100 text-orange-600 dark:bg-orange-950/60 dark:text-orange-300' :
                                          'bg-emerald-100 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-300'
                                        }`}>
                                          {isExp ? 'Hết hạn' : isNear ? 'Sắp hết' : 'An toàn'}
                                        </span>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={6} className="p-12 text-center">
                    <div className="flex flex-col items-center justify-center opacity-30">
                      <Search className="w-12 h-12 mb-2" />
                      <p className="text-sm">Không tìm thấy dữ liệu phù hợp</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6">
        <div className={`p-6 rounded-2xl border shadow-sm min-w-0 flex flex-col h-[450px] ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
          <div className="mb-6">
            <h3 className={`text-lg font-bold flex items-center gap-2 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
              <PieChartIcon className="w-5 h-5 text-purple-500" />
              Giá trị theo nhóm vật tư
            </h3>
            <p className={`text-xs mt-1 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Phân bổ giá trị tồn kho hiện tại</p>
          </div>
          <div className="flex-1 relative min-h-[300px]">
            {isChartReady && categoryValueData.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={200} debounce={100}>
                  <PieChart>
                    <Pie
                      data={categoryValueData}
                      cx="50%"
                      cy="45%"
                      innerRadius={70}
                      outerRadius={95}
                      paddingAngle={4}
                      dataKey="value"
                      stroke="none"
                    >
                      {categoryValueData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ec4899', '#06b6d4', '#84cc16'][index % 7]} />
                      ))}
                    </Pie>
                    <Tooltip 
                      formatter={(value: number) => value.toLocaleString('vi-VN') + ' đ'}
                      contentStyle={{
                        borderRadius: '16px', 
                        border: 'none', 
                        boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)',
                        backgroundColor: darkMode ? '#1e293b' : '#ffffff',
                        color: darkMode ? '#ffffff' : '#000000'
                      }}
                      itemStyle={{ color: darkMode ? '#cbd5e1' : '#475569' }}
                    />
                    <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ paddingTop: '20px' }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute top-[45%] left-1/2 -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none">
                  <p className={`text-xl font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                    {totalValue > 1000000 ? (totalValue / 1000000).toFixed(1) + 'M' : totalValue.toLocaleString('vi-VN')}
                  </p>
                  <p className={`text-[10px] font-medium ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                    Tổng giá trị (đ)
                  </p>
                </div>
              </>
            ) : categoryValueData.length === 0 ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-8">
                <Package className={`w-12 h-12 mb-4 opacity-20 ${darkMode ? 'text-white' : 'text-slate-900'}`} />
                <p className={`text-sm font-medium ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                  {detailedReport.length === 0 
                    ? 'Không có vật tư nào trong kỳ báo cáo' 
                    : (detailedReport.some(i => i.price > 0) 
                        ? 'Tồn kho hiện tại đang bằng 0' 
                        : 'Chưa có dữ liệu giá trị (vui lòng cập nhật đơn giá vật tư)')}
                </p>
              </div>
            ) : (
              <div className="absolute inset-0 flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-blue-500 opacity-20" />
              </div>
            )}
          </div>
        </div>

        <div className={`p-6 rounded-2xl border shadow-sm min-w-0 flex flex-col h-[450px] ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
          <div className="mb-6">
            <h3 className={`text-lg font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
              So sánh tiêu hao {reportType === 'month' ? 'với tháng trước' : 
                               reportType === 'week' ? 'với tuần trước' : 
                               reportType === 'quarter' ? 'với quý trước' : 
                               reportType === 'year' ? 'với năm trước' : 'với kỳ trước'}
            </h3>
            <p className={`text-xs mt-1 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Top 10 vật tư biến động tiêu thụ mạnh nhất</p>
          </div>
          <div className="flex-1 relative min-h-0">
            {isChartReady && itemComparisonData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={200}>
                <BarChart data={itemComparisonData} margin={{ top: 40, right: 10, left: 0, bottom: 60 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={darkMode ? "#334155" : "#f1f5f9"} />
                  <XAxis 
                    dataKey="name" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{fill: darkMode ? '#94a3b8' : '#64748b', fontSize: 9}}
                    interval={0}
                    angle={-45}
                    textAnchor="end"
                    height={80}
                  />
                  <YAxis axisLine={false} tickLine={false} tick={{fill: darkMode ? '#94a3b8' : '#64748b', fontSize: 10}} />
                  <Tooltip 
                    contentStyle={{
                      borderRadius: '16px', 
                      border: 'none', 
                      boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)',
                      backgroundColor: darkMode ? '#1e293b' : '#ffffff',
                      color: darkMode ? '#ffffff' : '#000000'
                    }}
                    itemStyle={{ color: darkMode ? '#cbd5e1' : '#475569' }}
                    formatter={(value: number, name: string, props: any) => {
                      const isCurrent = name.includes('này') || name.includes('Kỳ này');
                      if (isCurrent) {
                        const percent = props.payload.percentChange;
                        const sign = percent > 0 ? '+' : '';
                        return [`${value} (${sign}${percent}%)`, name];
                      }
                      return [value, name];
                    }}
                  />
                  <Legend verticalAlign="top" align="right" iconType="circle" wrapperStyle={{ paddingTop: '0px', marginBottom: '20px' }} />
                  <Bar 
                    name={reportType === 'month' ? 'Tháng này' : reportType === 'week' ? 'Tuần này' : reportType === 'quarter' ? 'Quý này' : reportType === 'year' ? 'Năm này' : 'Kỳ này'} 
                    dataKey="current" 
                    fill="#3b82f6" 
                    radius={[4, 4, 0, 0]} 
                    barSize={20}
                  >
                    <LabelList 
                      dataKey="percentChange" 
                      position="top" 
                      offset={10}
                      style={{ fontSize: '9px', fontWeight: 'bold', fill: darkMode ? '#3b82f6' : '#2563eb' }}
                      formatter={(val: number) => val > 0 ? `+${val}%` : `${val}%`}
                    />
                  </Bar>
                  <Bar 
                    name={reportType === 'month' ? 'Tháng trước' : reportType === 'week' ? 'Tuần trước' : reportType === 'quarter' ? 'Quý trước' : reportType === 'year' ? 'Năm trước' : 'Kỳ trước'} 
                    dataKey="previous" 
                    fill={darkMode ? "#475569" : "#cbd5e1"} 
                    radius={[4, 4, 0, 0]} 
                    barSize={20} 
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : itemComparisonData.length === 0 ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-8">
                <ArrowLeftRight className={`w-12 h-12 mb-4 opacity-20 ${darkMode ? 'text-white' : 'text-slate-900'}`} />
                <p className={`text-sm font-medium ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                  Không có dữ liệu tiêu hao để so sánh
                </p>
              </div>
            ) : (
              <div className="absolute inset-0 flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-blue-500 opacity-20" />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile Sticky Quick Search Bar (docked directly above bottom nav) */}
      <MobileQuickSearchBar 
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        placeholder="🔍 Tìm nhanh vật tư trong báo cáo..."
        totalCount={detailedReport.length}
        filteredCount={filteredDetailedReport.length}
        darkMode={darkMode}
      />
    </div>
  );
}

function Holidays({ holidays, darkMode }: { holidays: Holiday[], darkMode?: boolean }) {
  const [newHoliday, setNewHoliday] = useState({ 
    startDate: new Date().toISOString().split('T')[0], 
    endDate: new Date().toISOString().split('T')[0], 
    note: '' 
  });
  const [isAdding, setIsAdding] = useState(false);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const start = new Date(newHoliday.startDate);
      const end = new Date(newHoliday.endDate);
      
      const daysToAdd = [];
      let current = new Date(start);
      
      // Safety check to prevent infinite loop or too many days
      const diffTime = Math.abs(end.getTime() - start.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      if (diffDays > 365) {
        // Limit to 1 year for safety
        return;
      }

      while (current <= end) {
        const dateStr = current.toISOString().split('T')[0];
        // Check if already exists in local state to avoid redundant adds
        if (!holidays.some(h => h.date === dateStr)) {
          daysToAdd.push({
            date: dateStr,
            note: newHoliday.note
          });
        }
        current.setDate(current.getDate() + 1);
      }

      if (daysToAdd.length > 0) {
        const promises = daysToAdd.map(day => addDoc(collection(db, "holidays"), day));
        await Promise.all(promises);
      }

      setNewHoliday({ 
        startDate: new Date().toISOString().split('T')[0], 
        endDate: new Date().toISOString().split('T')[0], 
        note: '' 
      });
      setIsAdding(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, "holidays");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteDoc(doc(db, "holidays", id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `holidays/${id}`);
    }
  };

  const sortedHolidays = [...holidays].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h3 className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>Quản lý ngày nghỉ</h3>
          <p className={`${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Thiết lập các ngày nghỉ lễ, ngày không làm việc để tính toán tiêu hao chính xác.</p>
        </div>
        <button 
          onClick={() => setIsAdding(true)}
          className="px-6 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-100 flex items-center gap-2"
        >
          <Plus className="w-5 h-5" />
          Thêm ngày nghỉ
        </button>
      </div>

      {isAdding && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className={`rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-100'}`}
          >
            <div className={`p-6 border-b flex justify-between items-center ${darkMode ? 'border-slate-700' : 'border-slate-100'}`}>
              <h3 className={`text-xl font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>Thêm ngày nghỉ mới</h3>
              <button onClick={() => setIsAdding(false)} className={`p-2 rounded-lg transition-colors ${darkMode ? 'hover:bg-slate-700' : 'hover:bg-slate-100'}`}>
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>
            <form onSubmit={handleAdd} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>Từ ngày</label>
                  <input 
                    required 
                    type="date" 
                    className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${darkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-white border-slate-200 text-slate-900'}`} 
                    value={newHoliday.startDate} 
                    onChange={e => setNewHoliday({...newHoliday, startDate: e.target.value, endDate: e.target.value > newHoliday.endDate ? e.target.value : newHoliday.endDate})} 
                  />
                </div>
                <div>
                  <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>Đến ngày</label>
                  <input 
                    required 
                    type="date" 
                    className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${darkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-white border-slate-200 text-slate-900'}`} 
                    value={newHoliday.endDate} 
                    min={newHoliday.startDate}
                    onChange={e => setNewHoliday({...newHoliday, endDate: e.target.value})} 
                  />
                </div>
              </div>
              <div>
                <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>Ghi chú</label>
                <input 
                  type="text" 
                  placeholder="Lễ Quốc khánh, Nghỉ Tết..."
                  className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${darkMode ? 'bg-slate-700 border-slate-600 text-white placeholder-slate-500' : 'bg-white border-slate-200 text-slate-900'}`} 
                  value={newHoliday.note} 
                  onChange={e => setNewHoliday({...newHoliday, note: e.target.value})} 
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button 
                  type="button"
                  onClick={() => setIsAdding(false)}
                  className={`flex-1 py-3 font-bold rounded-xl transition-colors ${darkMode ? 'bg-slate-700 text-slate-300 hover:bg-slate-600' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
                >
                  Hủy
                </button>
                <button 
                  type="submit"
                  className="flex-1 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-colors shadow-lg shadow-blue-100"
                >
                  Lưu
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      <div className={`rounded-2xl border shadow-sm overflow-hidden ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className={`border-b ${darkMode ? 'bg-slate-800/50 border-slate-700' : 'bg-slate-50 border-slate-200'}`}>
              <th className={`px-6 py-4 text-xs font-bold uppercase tracking-wider ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Ngày</th>
              <th className={`px-6 py-4 text-xs font-bold uppercase tracking-wider ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Ghi chú</th>
              <th className={`px-6 py-4 text-xs font-bold uppercase tracking-wider text-right ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Thao tác</th>
            </tr>
          </thead>
          <tbody className={`divide-y ${darkMode ? 'divide-slate-700' : 'divide-slate-100'}`}>
            {sortedHolidays.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-6 py-12 text-center text-slate-400">
                  Chưa có ngày nghỉ nào được thiết lập.
                </td>
              </tr>
            ) : (
              sortedHolidays.map(holiday => (
                <tr key={holiday.id} className={`transition-colors ${darkMode ? 'hover:bg-slate-700/50' : 'hover:bg-slate-50'}`}>
                  <td className={`px-6 py-4 font-medium ${darkMode ? 'text-white' : 'text-slate-900'}`}>{formatDate(holiday.date)}</td>
                  <td className={`px-6 py-4 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>{holiday.note || '-'}</td>
                  <td className="px-6 py-4 text-right">
                    <button 
                      onClick={() => handleDelete(holiday.id)}
                      className="p-2 text-slate-400 hover:text-red-500 transition-colors"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AiAssistant({ 
  analysis, 
  isAnalyzing, 
  onAnalyze, 
  darkMode,
  items = [],
  categories = [],
  transactions = [],
  departments = [],
  holidays = []
}: { 
  analysis: AiAnalysis | null;
  isAnalyzing: boolean;
  onAnalyze: () => void;
  darkMode?: boolean;
  items?: any[];
  categories?: any[];
  transactions?: any[];
  departments?: any[];
  holidays?: any[];
}) {
  const [activeMode, setActiveMode] = useState<'chat' | 'report'>('chat');
  const [messages, setMessages] = useState<Array<{ id: string; role: 'user' | 'model'; text: string; time: string }>>([
    {
      id: 'welcome',
      role: 'model',
      text: `Xin chào! Tôi là **Trợ lý AI Khoa Chẩn đoán Hình ảnh**. \n\nTôi được kết nối trực tiếp với **cơ sở dữ liệu thời gian thực** của hệ thống (bao gồm danh mục vật tư, số lượng tồn kho thực tế, các lô hạn dùng theo nguyên tắc **FEFO**, lịch sử xuất nhập kho và lịch nghỉ trực).\n\nBạn có thể hỏi tôi bất kỳ câu hỏi nào về tình trạng kho, tra cứu vật tư, hoặc yêu cầu tính toán dự trù nhập hàng!`,
      time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
    }
  ]);
  const [inputQuestion, setInputQuestion] = useState('');
  const [isAsking, setIsAsking] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const quickQuestions = [
    'Cho tôi danh mục văn phòng phẩm hiện có',
    'Vật tư nào đã hết hoặc sắp hết hàng?',
    'Kiểm tra các lô hàng cận hạn (< 60 ngày) và đã quá hạn?',
    'Đề xuất kế hoạch dự trù vật tư cần nhập cho tuần tới',
    'Phòng ban nào tiêu hao nhiều vật tư nhất gần đây?',
    'Tra cứu tồn kho các loại thuốc cản quang và bơm tiêm'
  ];

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (activeMode === 'chat') {
      scrollToBottom();
    }
  }, [messages, isAsking, activeMode]);

  const handleSend = async (questionText?: string) => {
    const textToSend = (questionText || inputQuestion).trim();
    if (!textToSend || isAsking) return;

    const userMsgId = 'user-' + Date.now();
    const newMsg = {
      id: userMsgId,
      role: 'user' as const,
      text: textToSend,
      time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
    };

    setMessages(prev => [...prev, newMsg]);
    setInputQuestion('');
    setIsAsking(true);

    try {
      const history = messages
        .filter(m => m.id !== 'welcome')
        .slice(-6)
        .map(m => ({ role: m.role, text: m.text }));

      const answer = await askAiAssistant(textToSend, history, {
        items,
        categories,
        transactions,
        holidays
      });

      const botMsgId = 'bot-' + Date.now();
      setMessages(prev => [
        ...prev,
        {
          id: botMsgId,
          role: 'model',
          text: answer || 'Đã ghi nhận yêu cầu. Hiện tại chưa có dữ liệu bổ sung.',
          time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
        }
      ]);
    } catch (err) {
      console.error('Chat AI error:', err);
      setMessages(prev => [
        ...prev,
        {
          id: 'err-' + Date.now(),
          role: 'model',
          text: '⚠️ Không thể kết nối với dịch vụ AI. Đang hiển thị kết quả tra cứu nội bộ...',
          time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
        }
      ]);
    } finally {
      setIsAsking(false);
    }
  };

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    toast.success('Đã sao chép nội dung trả lời của AI!');
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleClearChat = () => {
    setMessages([
      {
        id: 'welcome',
        role: 'model',
        text: `Đã làm mới cuộc hội thoại. Bạn có thể tiếp tục đặt câu hỏi về kho vật tư CĐHA!`,
        time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
      }
    ]);
    toast.info('Đã xóa lịch sử hỏi đáp.');
  };

  return (
    <div className="space-y-6">
      {/* Hero Banner with Mode Selector */}
      <div className="bg-gradient-to-br from-blue-600 via-indigo-600 to-blue-800 p-6 md:p-8 rounded-3xl text-white shadow-xl shadow-blue-500/10 relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/15 backdrop-blur-md text-xs font-semibold mb-3 border border-white/20">
              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
              <span>AI Copilot Khoa Chẩn đoán Hình ảnh</span>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
            </div>
            <h3 className="text-2xl md:text-3xl font-extrabold tracking-tight mb-2 flex items-center gap-3">
              <BrainCircuit className="w-8 h-8 shrink-0 text-blue-200" />
              Trợ lý Trí tuệ Nhân tạo Thông minh
            </h3>
            <p className="text-blue-100 text-sm md:text-base leading-relaxed">
              Truy vấn và tương tác trực tiếp trên cơ sở dữ liệu tồn kho, phân tích hạn sử dụng lô (FEFO), dự báo tiêu thụ phòng máy và đề xuất kế hoạch dự trù y tế chuẩn xác.
            </p>
          </div>

          {/* Navigation Pills */}
          <div className="flex bg-white/10 backdrop-blur-md p-1.5 rounded-2xl border border-white/20 shrink-0 self-start md:self-auto">
            <button
              type="button"
              onClick={() => setActiveMode('chat')}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs md:text-sm font-bold transition-all ${
                activeMode === 'chat'
                  ? 'bg-white text-blue-600 shadow-md'
                  : 'text-white/80 hover:text-white hover:bg-white/10'
              }`}
            >
              <MessageSquare className="w-4 h-4" />
              Hỏi đáp trực tiếp (Q&A)
            </button>
            <button
              type="button"
              onClick={() => setActiveMode('report')}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs md:text-sm font-bold transition-all ${
                activeMode === 'report'
                  ? 'bg-white text-blue-600 shadow-md'
                  : 'text-white/80 hover:text-white hover:bg-white/10'
              }`}
            >
              <FileText className="w-4 h-4" />
              Báo cáo chuyên sâu
            </button>
          </div>
        </div>

        {/* Decorative background glow */}
        <div className="absolute top-0 right-0 w-80 h-80 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/3 blur-3xl pointer-events-none"></div>
      </div>

      {/* MODE 1: INTERACTIVE Q&A COPILOT */}
      {activeMode === 'chat' && (
        <div className="grid grid-cols-1 gap-6">
          {/* Quick suggestions */}
          <div className={`p-4 rounded-2xl border shadow-sm ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
            <div className="flex items-center justify-between gap-2 mb-3">
              <span className={`text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                <Sparkles className="w-3.5 h-3.5 text-blue-500" /> Gợi ý câu hỏi nhanh:
              </span>
              {messages.length > 1 && (
                <button
                  type="button"
                  onClick={handleClearChat}
                  className="text-xs text-slate-400 hover:text-red-500 transition-colors flex items-center gap-1"
                >
                  <RefreshCw className="w-3 h-3" /> Làm mới đoạn chat
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {quickQuestions.map((q, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleSend(q)}
                  disabled={isAsking}
                  className={`text-xs px-3.5 py-2 rounded-xl border transition-all text-left flex items-center gap-2 ${
                    darkMode 
                      ? 'bg-slate-700/50 hover:bg-blue-900/30 border-slate-600 text-slate-200 hover:border-blue-500' 
                      : 'bg-slate-50 hover:bg-blue-50 border-slate-200 text-slate-700 hover:border-blue-400 hover:text-blue-700'
                  }`}
                >
                  <ChevronRight className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                  <span>{q}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Chat Messages Feed */}
          <div className={`rounded-3xl border shadow-sm flex flex-col h-[580px] overflow-hidden ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
            {/* Chat header */}
            <div className={`px-6 py-3.5 border-b flex items-center justify-between ${darkMode ? 'bg-slate-800/80 border-slate-700' : 'bg-slate-50/80 border-slate-200'}`}>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-sm">
                  <Bot className="w-5 h-5" />
                </div>
                <div>
                  <h4 className={`text-sm font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                    AI Copilot - Trực tuyến
                  </h4>
                  <p className="text-[11px] text-emerald-500 font-medium flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                    Sẵn sàng giải đáp từ cơ sở dữ liệu kho
                  </p>
                </div>
              </div>

              <span className={`text-xs px-3 py-1 rounded-full border ${darkMode ? 'bg-slate-700 border-slate-600 text-slate-300' : 'bg-white border-slate-200 text-slate-600'}`}>
                {messages.length} tin nhắn
              </span>
            </div>

            {/* Scrollable messages */}
            <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-5">
              {messages.map((m) => {
                const isUser = m.role === 'user';
                return (
                  <div
                    key={m.id}
                    className={`flex gap-3 max-w-[90%] md:max-w-[80%] ${isUser ? 'ml-auto flex-row-reverse' : 'mr-auto'}`}
                  >
                    {!isUser && (
                      <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
                        <Sparkles className="w-4 h-4 text-amber-300" />
                      </div>
                    )}
                    <div className="space-y-1">
                      <div
                        className={`p-4 rounded-2xl text-sm leading-relaxed ${
                          isUser
                            ? 'bg-blue-600 text-white rounded-br-none shadow-md shadow-blue-500/10'
                            : darkMode
                            ? 'bg-slate-700/60 border border-slate-600 text-slate-100 rounded-bl-none shadow-sm'
                            : 'bg-slate-50 border border-slate-200 text-slate-800 rounded-bl-none shadow-sm'
                        }`}
                      >
                        {isUser ? (
                          <p className="whitespace-pre-wrap font-medium">{m.text}</p>
                        ) : (
                          <div className={`prose max-w-none text-sm ${darkMode ? 'prose-invert text-slate-100' : 'text-slate-800'}`}>
                            <ReactMarkdown
                              remarkPlugins={[remarkGfm]}
                              components={createAiMarkdownComponents(!!darkMode)}
                            >
                              {m.text}
                            </ReactMarkdown>
                          </div>
                        )}
                      </div>

                      <div className={`flex items-center gap-2 text-[10px] px-1 ${isUser ? 'justify-end text-blue-200/80' : darkMode ? 'text-slate-400' : 'text-slate-400'}`}>
                        <span>{m.time}</span>
                        {!isUser && (
                          <button
                            type="button"
                            onClick={() => handleCopy(m.id, m.text)}
                            className="hover:text-blue-500 transition-colors flex items-center gap-1"
                          >
                            {copiedId === m.id ? (
                              <>
                                <Check className="w-3 h-3 text-emerald-500" />
                                <span className="text-emerald-500">Đã chép</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3 h-3" />
                                <span>Sao chép</span>
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}

              {isAsking && (
                <div className="flex gap-3 max-w-[80%] mr-auto items-center">
                  <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-sm animate-pulse">
                    <Loader2 className="w-4 h-4 animate-spin text-white" />
                  </div>
                  <div className={`p-4 rounded-2xl rounded-bl-none text-xs flex items-center gap-3 border ${
                    darkMode ? 'bg-slate-700/60 border-slate-600 text-slate-300' : 'bg-slate-50 border-slate-200 text-slate-600'
                  }`}>
                    <span className="flex gap-1">
                      <span className="w-2 h-2 rounded-full bg-blue-500 animate-bounce"></span>
                      <span className="w-2 h-2 rounded-full bg-blue-500 animate-bounce [animation-delay:0.2s]"></span>
                      <span className="w-2 h-2 rounded-full bg-blue-500 animate-bounce [animation-delay:0.4s]"></span>
                    </span>
                    <span>Đang đối chiếu dữ liệu tồn kho và tổng hợp câu trả lời...</span>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input form */}
            <div className={`p-4 border-t ${darkMode ? 'bg-slate-800/90 border-slate-700' : 'bg-slate-50 border-slate-200'}`}>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSend();
                }}
                className="flex items-center gap-2"
              >
                <input
                  type="text"
                  value={inputQuestion}
                  onChange={(e) => setInputQuestion(e.target.value)}
                  placeholder="Đặt câu hỏi về tồn kho, hạn dùng, dự trù hoặc phân bổ phòng ban..."
                  disabled={isAsking}
                  className={`flex-1 px-4 py-3 rounded-2xl text-sm border focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all ${
                    darkMode
                      ? 'bg-slate-700 border-slate-600 text-white placeholder-slate-400'
                      : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400 shadow-inner'
                  }`}
                />
                <button
                  type="submit"
                  disabled={!inputQuestion.trim() || isAsking}
                  className="px-5 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-bold flex items-center gap-2 transition-all disabled:opacity-40 disabled:hover:bg-blue-600 shadow-md shadow-blue-500/20"
                >
                  <Send className="w-4 h-4" />
                  <span className="hidden sm:inline">Gửi</span>
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* MODE 2: COMPREHENSIVE DIAGNOSTIC REPORT */}
      {activeMode === 'report' && (
        <div className="space-y-6">
          <div className="flex justify-end">
            <button
              type="button"
              onClick={onAnalyze}
              disabled={isAnalyzing}
              className="px-6 py-2.5 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-all flex items-center gap-2 disabled:opacity-50 shadow-md"
            >
              {isAnalyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              {isAnalyzing ? 'Đang phân tích...' : 'Làm mới báo cáo phân tích'}
            </button>
          </div>

          {analysis ? (
            <div className="space-y-6">
              {/* Summary Card */}
              <div className={`p-8 rounded-2xl border shadow-sm ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
                <div className="flex items-center gap-3 text-blue-600 mb-4">
                  <BrainCircuit className="w-6 h-6" />
                  <h4 className="font-bold text-lg">Tóm tắt tình trạng kho</h4>
                </div>
                <p className={`text-lg leading-relaxed italic ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                  "{analysis.summary}"
                </p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Alerts Section */}
                <div className={`p-6 rounded-2xl border shadow-sm ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
                  <h4 className={`font-bold mb-4 flex items-center gap-2 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                    <AlertTriangle className="w-5 h-5 text-red-500" /> Cảnh báo quan trọng
                  </h4>
                  <div className="space-y-3">
                    {analysis.alerts.map((alert, idx) => (
                      <div key={idx} className={`p-4 rounded-xl border flex gap-3 ${
                        alert.type === 'danger' ? (darkMode ? 'bg-red-900/20 border-red-800/30 text-red-400' : 'bg-red-50 border-red-100 text-red-700') :
                        alert.type === 'warning' ? (darkMode ? 'bg-amber-900/20 border-amber-800/30 text-amber-400' : 'bg-amber-50 border-amber-100 text-amber-700') :
                        (darkMode ? 'bg-blue-900/20 border-blue-800/30 text-blue-400' : 'bg-blue-50 border-blue-100 text-blue-700')
                      }`}>
                        <div className="mt-0.5">
                          {alert.type === 'danger' ? <X className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                        </div>
                        <div>
                          <p className="text-sm font-bold">{alert.item || 'Cảnh báo hệ thống'}</p>
                          <p className="text-xs opacity-90">{alert.message}</p>
                        </div>
                      </div>
                    ))}
                    {analysis.alerts.length === 0 && (
                      <p className="text-sm text-slate-400 italic">Không có cảnh báo nào.</p>
                    )}
                  </div>
                </div>

                {/* Recommendations Section */}
                <div className={`p-6 rounded-2xl border shadow-sm ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
                  <h4 className={`font-bold mb-4 flex items-center gap-2 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                    <TrendingUp className="w-5 h-5 text-emerald-500" /> Đề xuất tối ưu (FEFO & Dự trù)
                  </h4>
                  <div className="space-y-3">
                    {analysis.recommendations.map((rec, idx) => (
                      <div key={idx} className={`p-4 rounded-xl border flex gap-3 ${darkMode ? 'bg-slate-700/50 border-slate-700' : 'bg-slate-50 border-slate-100'}`}>
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                          rec.priority === 'high' ? (darkMode ? 'bg-red-900/30 text-red-400' : 'bg-red-100 text-red-600') :
                          rec.priority === 'medium' ? (darkMode ? 'bg-amber-900/30 text-amber-400' : 'bg-amber-100 text-amber-600') :
                          (darkMode ? 'bg-blue-900/30 text-blue-400' : 'bg-blue-100 text-blue-600')
                        }`}>
                          <span className="text-[10px] font-black uppercase">{rec.priority}</span>
                        </div>
                        <div>
                          <p className={`text-sm font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>{rec.action}</p>
                          <p className={`text-xs ${darkMode ? 'text-slate-500' : 'text-slate-500'}`}>{rec.reason}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Anomalies Section */}
              {analysis.anomalies.length > 0 && (
                <div className={`p-6 rounded-2xl border shadow-sm ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
                  <h4 className={`font-bold mb-4 flex items-center gap-2 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                    <Search className="w-5 h-5 text-purple-500" /> Phát hiện bất thường lưu lượng
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {analysis.anomalies.map((anomaly, idx) => (
                      <div key={idx} className={`p-4 rounded-xl border flex items-center justify-between ${darkMode ? 'bg-purple-900/20 border-purple-800/30' : 'bg-purple-50 border-purple-100'}`}>
                        <p className={`text-sm ${darkMode ? 'text-purple-300' : 'text-purple-900'}`}>{anomaly.description}</p>
                        <span className={`px-2 py-1 rounded-lg text-[10px] font-bold uppercase ${
                          anomaly.severity === 'high' ? 'bg-red-500 text-white' :
                          anomaly.severity === 'medium' ? 'bg-amber-500 text-white' :
                          'bg-blue-500 text-white'
                        }`}>
                          {anomaly.severity}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Detailed Analysis Section */}
              <div className={`p-8 rounded-2xl border shadow-sm prose max-w-none ${darkMode ? 'bg-slate-800 border-slate-700 prose-invert' : 'bg-white border-slate-200 prose-slate'}`}>
                <div className={`flex items-center gap-2 mb-6 pb-4 border-b ${darkMode ? 'text-white border-slate-700' : 'text-slate-900 border-slate-100'}`}>
                  <FileText className="w-6 h-6" />
                  <span className="font-bold text-lg">Báo cáo phân tích chi tiết</span>
                </div>
                <ReactMarkdown 
                  remarkPlugins={[remarkGfm]}
                  components={createAiMarkdownComponents(!!darkMode)}
                >
                  {analysis.detailedAnalysis}
                </ReactMarkdown>
              </div>
            </div>
          ) : (
            <div className={`p-12 text-center rounded-3xl border ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
              <BrainCircuit className="w-16 h-16 text-blue-500 mx-auto mb-4 opacity-50" />
              <h4 className={`text-lg font-bold mb-2 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                Chưa có dữ liệu báo cáo phân tích
              </h4>
              <p className={`text-sm max-w-md mx-auto mb-6 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                Nhấn nút bên dưới để hệ thống quét toàn bộ kho, các lô hạn dùng và đưa ra báo cáo chẩn đoán toàn diện.
              </p>
              <button
                type="button"
                onClick={onAnalyze}
                disabled={isAnalyzing}
                className="px-8 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-all inline-flex items-center gap-2 shadow-lg shadow-blue-500/20"
              >
                {isAnalyzing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
                {isAnalyzing ? 'Đang phân tích...' : 'Bắt đầu phân tích ngay'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

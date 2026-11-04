import React, { useState, useRef } from 'react';
import { 
  FileSpreadsheet, 
  Download, 
  Upload, 
  CheckCircle2, 
  Copy, 
  ExternalLink, 
  Database, 
  FileText, 
  Layers, 
  AlertTriangle, 
  Sparkles, 
  Check, 
  Table, 
  RefreshCw,
  HelpCircle,
  ShieldCheck,
  ChevronRight,
  Info,
  Code2,
  FileCode,
  Play,
  ArrowRight,
  CheckCircle,
  FileDown,
  Terminal
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { 
  DIAGNOSTIC_IMAGING_SHEETS_SPEC, 
  SAMPLE_CDHA_DATA, 
  downloadStandardDiagnosticImagingTemplate, 
  exportLiveDatabaseToGoogleSheets,
  normalizeExcelRow
} from './googleSheetsService';
import { 
  APPS_SCRIPT_CODE_GS, 
  APPS_SCRIPT_UPLOAD_DIALOG_HTML 
} from './googleAppsScriptCode';
import { collection, addDoc, serverTimestamp, getDocs, doc, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import { toast } from 'sonner';

interface GoogleSheetsHubProps {
  categories: any[];
  departments: any[];
  items: any[];
  transactions: any[];
  users?: any[];
  darkMode?: boolean;
  currentUserEmail?: string;
  onRefreshData?: () => void;
}

export function GoogleSheetsHub({
  categories,
  departments,
  items,
  transactions,
  users = [],
  darkMode = false,
  currentUserEmail
}: GoogleSheetsHubProps) {
  const [hubTab, setHubTab] = useState<'structure' | 'gas'>('structure');
  const [gasSubTab, setGasSubTab] = useState<'code' | 'dialog' | 'guide' | 'tester'>('code');
  const [selectedSheetIndex, setSelectedSheetIndex] = useState(0);
  const [copiedFormula, setCopiedFormula] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [isSeeding, setIsSeeding] = useState(false);
  const [showSeedConfirm, setShowSeedConfirm] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const testerFileInputRef = useRef<HTMLInputElement>(null);

  // Tester state
  const [testResults, setTestResults] = useState<{
    fileName: string;
    fileSize: string;
    totalRows: number;
    validRows: any[];
    invalidRows: { row: number; reason: string; data: any }[];
  } | null>(null);

  const activeSpec = DIAGNOSTIC_IMAGING_SHEETS_SPEC[selectedSheetIndex];

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedFormula(id);
    toast.success('Đã sao chép công thức vào clipboard!');
    setTimeout(() => setCopiedFormula(null), 2000);
  };

  const handleDownloadTemplate = () => {
    try {
      downloadStandardDiagnosticImagingTemplate();
      toast.success('Đã tải xuống file mẫu Google Sheets chuẩn 5 trang tính!');
    } catch (err: any) {
      console.error(err);
      toast.error('Lỗi tải file mẫu: ' + err.message);
    }
  };

  const handleExportLive = () => {
    try {
      exportLiveDatabaseToGoogleSheets(categories, departments, items, transactions, users);
      toast.success('Đã xuất toàn bộ dữ liệu ra 5 trang tính Google Sheets!');
    } catch (err: any) {
      console.error(err);
      toast.error('Lỗi xuất dữ liệu: ' + err.message);
    }
  };

  const handleCopyCodeText = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCode(id);
    toast.success('Đã sao chép mã nguồn vào clipboard!');
    setTimeout(() => setCopiedCode(null), 2500);
  };

  const handleDownloadFileText = (content: string, filename: string) => {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success(`Đã tải xuống tệp ${filename}!`);
  };

  const handleTestFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!['xlsx', 'xls', 'csv'].includes(ext || '')) {
      toast.error('Chỉ hỗ trợ tệp .xlsx, .xls hoặc .csv');
      return;
    }

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        let wb: XLSX.WorkBook;
        if (ext === 'csv') {
          wb = XLSX.read(bstr, { type: 'string' });
        } else {
          wb = XLSX.read(bstr, { type: 'binary' });
        }

        const targetSheetName = wb.SheetNames.find(n => {
          const l = n.toLowerCase();
          return l.includes('danhsach') || l.includes('vattu') || l.includes('item');
        }) || wb.SheetNames[0];

        const ws = wb.Sheets[targetSheetName];
        const rawJson = XLSX.utils.sheet_to_json(ws) as any[];

        const validRows: any[] = [];
        const invalidRows: { row: number; reason: string; data: any }[] = [];

        rawJson.forEach((row, idx) => {
          const norm = normalizeExcelRow(row);
          const name = (norm['tenvattu'] || norm['name'] || row['Tên vật tư'] || row['TenVatTu'] || '').toString().trim();
          if (!name) {
            invalidRows.push({
              row: idx + 2,
              reason: 'Thiếu trường bắt buộc "Tên vật tư" (TenVatTu)',
              data: row
            });
            return;
          }

          const code = (norm['mavattu'] || norm['code'] || row['Mã vật tư'] || row['MaVatTu'] || `VT-GEN-${String(idx + 1).padStart(3, '0')}`).toString().trim();
          const unit = (norm['donvitinh'] || norm['unit'] || row['Đơn vị tính'] || row['DonViTinh'] || 'Cái').toString().trim();
          const minStock = Number(norm['tontoithieu'] ?? norm['minstock'] ?? row['Tồn tối thiểu'] ?? 0);
          const currentStock = Number(norm['tonhientai'] ?? norm['currentstock'] ?? row['Tồn hiện tại'] ?? 0);
          const price = Number(norm['dongia'] ?? norm['price'] ?? row['Đơn giá'] ?? 0);
          const expiry = norm['hansudung'] || norm['expirydate'] || row['Hạn sử dụng'] || '';

          validRows.push({
            code,
            name,
            unit,
            category: norm['manhom'] || norm['nhom'] || 'NHOM_CĐHA',
            specification: norm['quycach'] || '',
            manufacturer: norm['hangsanxuat'] || '',
            minStock: isNaN(minStock) ? 0 : minStock,
            currentStock: isNaN(currentStock) ? 0 : currentStock,
            price: isNaN(price) ? 0 : price,
            expiryDate: String(expiry),
            note: norm['ghichu'] || ''
          });
        });

        setTestResults({
          fileName: file.name,
          fileSize: `${Math.round(file.size / 1024)} KB`,
          totalRows: rawJson.length,
          validRows,
          invalidRows
        });

        toast.success(`Đã kiểm tra xong: ${validRows.length} dòng hợp lệ, ${invalidRows.length} dòng lỗi.`);
      } catch (err: any) {
        console.error(err);
        toast.error('Lỗi khi đọc file kiểm tra: ' + err.message);
      }
    };

    if (ext === 'csv') {
      reader.readAsText(file);
    } else {
      reader.readAsBinaryString(file);
    }
  };

  // Import Handler for Excel / Google Sheets downloaded files
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });

        let importedCats = 0;
        let importedDepts = 0;
        let importedItems = 0;
        let importedTrans = 0;
        let importedUsers = 0;

        // Map existing categories and departments for ID resolution
        const catMap = new Map<string, string>(); // name or code -> ID
        categories.forEach(c => {
          if (c.name) catMap.set(c.name.trim().toLowerCase(), c.id);
          if (c.code) catMap.set(c.code.trim().toLowerCase(), c.id);
        });

        const deptMap = new Map<string, string>(); // name or code -> ID
        departments.forEach(d => {
          if (d.name) deptMap.set(d.name.trim().toLowerCase(), d.id);
          if (d.code) deptMap.set(d.code.trim().toLowerCase(), d.id);
        });

        // 1. Process DanhMuc_VatTu if present
        const catSheetName = wb.SheetNames.find(n => n.toLowerCase().includes('danhmuc') || n.toLowerCase().includes('nhom'));
        if (catSheetName) {
          const catSheet = wb.Sheets[catSheetName];
          const rawRows = XLSX.utils.sheet_to_json(catSheet) as any[];
          for (const row of rawRows) {
            const norm = normalizeExcelRow(row);
            const name = (norm['tennhom'] || norm['name'] || norm['danhmuc'] || row['Tên nhóm'] || row['TenNhom'] || '').toString().trim();
            const code = (norm['manhom'] || norm['code'] || row['Mã nhóm'] || row['MaNhom'] || '').toString().trim();
            const description = (norm['mota'] || norm['description'] || row['Mô tả'] || '').toString().trim();
            const status = (norm['trangthai'] || norm['status'] || row['Trạng thái'] || 'Hoạt động').toString().trim();

            if (name && !catMap.has(name.toLowerCase())) {
              try {
                const docRef = await addDoc(collection(db, 'categories'), {
                  name,
                  code: code || `NHOM_${Date.now().toString().slice(-4)}`,
                  description,
                  status
                });
                catMap.set(name.toLowerCase(), docRef.id);
                if (code) catMap.set(code.toLowerCase(), docRef.id);
                importedCats++;
              } catch (e) {
                console.error('Error importing category:', e);
              }
            }
          }
        }

        // 2. Process PhongBan if present
        const deptSheetName = wb.SheetNames.find(n => n.toLowerCase().includes('phongban') || n.toLowerCase().includes('kho') || n.toLowerCase().includes('dept'));
        if (deptSheetName) {
          const deptSheet = wb.Sheets[deptSheetName];
          const rawRows = XLSX.utils.sheet_to_json(deptSheet) as any[];
          for (const row of rawRows) {
            const norm = normalizeExcelRow(row);
            const name = (norm['tenphongban'] || norm['name'] || row['Tên phòng ban'] || row['TenPhongBan'] || '').toString().trim();
            const code = (norm['maphongban'] || norm['code'] || row['Mã phòng ban'] || row['MaPhongBan'] || '').toString().trim();
            const deviceType = (norm['loaithietbi'] || norm['type'] || row['Loại thiết bị'] || 'X-quang / CĐHA').toString().trim();
            const manager = (norm['nguoiphutrach'] || norm['manager'] || row['Người phụ trách'] || '').toString().trim();
            const location = (norm['vitri'] || norm['location'] || row['Vị trí'] || '').toString().trim();
            const note = (norm['ghichu'] || norm['note'] || row['Ghi chú'] || '').toString().trim();

            if (name && !deptMap.has(name.toLowerCase())) {
              try {
                const docRef = await addDoc(collection(db, 'departments'), {
                  name,
                  code: code || `PB_${Date.now().toString().slice(-4)}`,
                  deviceType,
                  manager,
                  location,
                  note
                });
                deptMap.set(name.toLowerCase(), docRef.id);
                if (code) deptMap.set(code.toLowerCase(), docRef.id);
                importedDepts++;
              } catch (e) {
                console.error('Error importing department:', e);
              }
            }
          }
        }

        // 3. Process DanhSach_VatTu (or default first sheet if not multi-sheet)
        const itemSheetName = wb.SheetNames.find(n => n.toLowerCase().includes('danhsach') || n.toLowerCase().includes('vattu') || n.toLowerCase().includes('item')) || wb.SheetNames[0];
        if (itemSheetName) {
          const itemSheet = wb.Sheets[itemSheetName];
          const rawRows = XLSX.utils.sheet_to_json(itemSheet) as any[];
          
          for (const row of rawRows) {
            const norm = normalizeExcelRow(row);
            const name = (norm['tenvattu'] || norm['name'] || row['Tên vật tư'] || row['TenVatTu'] || '').toString().trim();
            if (!name) continue;

            const code = (norm['mavattu'] || norm['code'] || row['Mã vật tư'] || row['MaVatTu'] || '').toString().trim();
            const rawCat = (norm['manhom'] || norm['nhom'] || norm['category'] || row['Mã nhóm'] || row['MaNhom'] || row['Nhóm'] || '').toString().trim();
            let categoryId = '';
            if (rawCat) {
              categoryId = catMap.get(rawCat.toLowerCase()) || '';
              if (!categoryId) {
                // Auto create category
                try {
                  const newCat = await addDoc(collection(db, 'categories'), {
                    name: rawCat,
                    code: rawCat.toUpperCase().replace(/\s+/g, '_'),
                    description: 'Tự động tạo từ import',
                    status: 'Hoạt động'
                  });
                  categoryId = newCat.id;
                  catMap.set(rawCat.toLowerCase(), categoryId);
                  importedCats++;
                } catch (e) {
                  console.error(e);
                }
              }
            }

            const rawDept = (norm['maphongban'] || norm['phongban'] || norm['department'] || row['Mã phòng ban'] || row['MaPhongBan'] || row['Phòng ban'] || '').toString().trim();
            let departmentId = '';
            if (rawDept) {
              departmentId = deptMap.get(rawDept.toLowerCase()) || '';
            }

            const unit = (norm['donvitinh'] || norm['unit'] || row['Đơn vị tính'] || row['DonViTinh'] || row['Đơn vị'] || 'Cái').toString().trim();
            const specification = (norm['quycach'] || norm['specification'] || row['Quy cách'] || row['QuyCach'] || '').toString().trim();
            const manufacturer = (norm['hangsanxuat'] || norm['manufacturer'] || row['Hãng sản xuất'] || row['HangSanXuat'] || '').toString().trim();
            const minStock = Number(norm['tontoithieu'] ?? norm['minstock'] ?? row['Tồn tối thiểu'] ?? row['TonToiThieu'] ?? 0);
            const currentStock = Number(norm['tonhientai'] ?? norm['tonkho'] ?? norm['currentstock'] ?? row['Tồn hiện tại'] ?? row['TonHienTai'] ?? 0);
            const price = Number(norm['dongia'] ?? norm['price'] ?? row['Đơn giá'] ?? row['DonGia'] ?? 0);
            const expiryRaw = norm['hansudung'] || norm['expirydate'] || row['Hạn sử dụng'] || row['HanSuDung'] || '';
            let expiryDate = '';
            if (typeof expiryRaw === 'number') {
              const d = new Date((expiryRaw - 25569) * 86400 * 1000);
              expiryDate = d.toISOString().split('T')[0];
            } else if (expiryRaw) {
              const s = String(expiryRaw).trim();
              if (s.match(/^\d{4}-\d{2}-\d{2}$/)) expiryDate = s;
              else {
                const match = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
                if (match) expiryDate = `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`;
              }
            }
            const note = (norm['ghichu'] || norm['note'] || row['Ghi chú'] || row['GhiChu'] || '').toString().trim();

            try {
              const itemDoc = await addDoc(collection(db, 'items'), {
                name,
                code: code || `VT-${Date.now().toString().slice(-4)}`,
                categoryId: categoryId || (categories[0]?.id || ''),
                departmentId: departmentId || '',
                unit,
                specification,
                manufacturer,
                minStock: isNaN(minStock) ? 0 : minStock,
                currentStock: isNaN(currentStock) ? 0 : currentStock,
                price: isNaN(price) ? 0 : price,
                expiryDate,
                note,
                createdAt: serverTimestamp()
              });
              importedItems++;

              // If stock > 0, log initial transaction
              if (currentStock > 0) {
                await addDoc(collection(db, 'transactions'), {
                  code: `PN-INIT-${Date.now().toString().slice(-6)}`,
                  itemId: itemDoc.id,
                  type: 'IN',
                  quantity: currentStock,
                  unitPrice: price,
                  totalAmount: currentStock * price,
                  toDeptId: departmentId || '',
                  timestamp: serverTimestamp(),
                  note: 'Nhập tồn đầu kỳ từ Google Sheets / Excel'
                });
                importedTrans++;
              }
            } catch (err) {
              console.error('Error importing item:', err);
            }
          }
        }

        // 4. Process LichSu_XuatNhap if present
        const transSheetName = wb.SheetNames.find(n => n.toLowerCase().includes('lichsu') || n.toLowerCase().includes('xuatnhap') || n.toLowerCase().includes('trans'));
        if (transSheetName && transSheetName !== itemSheetName) {
          const transSheet = wb.Sheets[transSheetName];
          const rawRows = XLSX.utils.sheet_to_json(transSheet) as any[];
          for (const row of rawRows) {
            const norm = normalizeExcelRow(row);
            const itemCodeOrName = (norm['mavattu'] || norm['tenvattu'] || row['Mã vật tư'] || row['Tên vật tư'] || '').toString().trim();
            if (!itemCodeOrName) continue;

            // Find matching item
            const foundItem = items.find(i => 
              (i.code && i.code.toLowerCase() === itemCodeOrName.toLowerCase()) || 
              (i.name && i.name.toLowerCase() === itemCodeOrName.toLowerCase())
            );

            if (foundItem) {
              const rawType = (norm['loaigiaodich'] || norm['type'] || row['Loại giao dịch'] || 'IN').toString().trim().toUpperCase();
              let transType: 'IN' | 'OUT' | 'TRANSFER' | 'AUDIT' = 'IN';
              if (rawType.includes('XUAT') || rawType === 'OUT') transType = 'OUT';
              else if (rawType.includes('CHUYEN') || rawType === 'TRANSFER') transType = 'TRANSFER';
              else if (rawType.includes('KIEM') || rawType === 'AUDIT') transType = 'AUDIT';

              const quantity = Math.abs(Number(norm['soluong'] ?? norm['quantity'] ?? row['Số lượng'] ?? 1));
              const unitPrice = Number(norm['dongia'] ?? norm['unitprice'] ?? row['Đơn giá'] ?? foundItem.price ?? 0);
              const note = (norm['lydoghichu'] || norm['ghichu'] || norm['note'] || row['Lý do / Ghi chú'] || '').toString().trim();
              const batchNumber = (norm['solo'] || norm['batchnumber'] || row['Số lô'] || '').toString().trim();
              const batchExpiry = (norm['handung'] || norm['batchexpiry'] || row['Hạn dùng'] || '').toString().trim();
              const performer = (norm['nguoithuchien'] || norm['performer'] || row['Người thực hiện'] || '').toString().trim();

              try {
                await addDoc(collection(db, 'transactions'), {
                  code: norm['maphieu'] || row['Mã phiếu'] || `GD-${Date.now().toString().slice(-6)}`,
                  itemId: foundItem.id,
                  type: transType,
                  quantity,
                  unitPrice,
                  totalAmount: quantity * unitPrice,
                  batchNumber,
                  batchExpiry,
                  performer,
                  timestamp: serverTimestamp(),
                  note: note || 'Đồng bộ từ Google Sheets'
                });
                importedTrans++;
              } catch (err) {
                console.error('Error importing transaction:', err);
              }
            }
          }
        }

        toast.success(
          `Đồng bộ hoàn tất: ${importedCats} nhóm, ${importedDepts} phòng máy, ${importedItems} vật tư, ${importedTrans} giao dịch!`,
          { duration: 5000 }
        );
      } catch (error: any) {
        console.error('Import error:', error);
        toast.error('Lỗi khi đọc file Google Sheets/Excel: ' + error.message);
      } finally {
        setIsImporting(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsBinaryString(file);
  };

  // Seed sample Diagnostic Imaging dataset
  const handleSeedSampleData = async () => {
    setIsSeeding(true);
    setShowSeedConfirm(false);
    try {
      // 1. Seed Categories
      const catMap = new Map<string, string>();
      for (const cat of SAMPLE_CDHA_DATA.categories) {
        const existing = categories.find(c => c.name.toLowerCase() === cat.name.toLowerCase() || (c.code && c.code === cat.code));
        if (existing) {
          catMap.set(cat.code, existing.id);
        } else {
          const docRef = await addDoc(collection(db, 'categories'), {
            name: cat.name,
            code: cat.code,
            description: cat.description,
            status: cat.status
          });
          catMap.set(cat.code, docRef.id);
        }
      }

      // 2. Seed Departments
      const deptMap = new Map<string, string>();
      for (const dept of SAMPLE_CDHA_DATA.departments) {
        const existing = departments.find(d => d.name.toLowerCase() === dept.name.toLowerCase() || (d.code && d.code === dept.code));
        if (existing) {
          deptMap.set(dept.code, existing.id);
        } else {
          const docRef = await addDoc(collection(db, 'departments'), {
            name: dept.name,
            code: dept.code,
            deviceType: dept.deviceType,
            manager: dept.manager,
            location: dept.location,
            note: dept.note
          });
          deptMap.set(dept.code, docRef.id);
        }
      }

      // 3. Seed Items
      const itemMap = new Map<string, string>();
      for (const item of SAMPLE_CDHA_DATA.items) {
        const existing = items.find(i => i.name.toLowerCase() === item.name.toLowerCase() || (i.code && i.code === item.code));
        const categoryId = catMap.get(item.categoryCode) || categories[0]?.id || '';
        const departmentId = deptMap.get(item.deptCode) || departments[0]?.id || '';

        if (!existing) {
          const docRef = await addDoc(collection(db, 'items'), {
            name: item.name,
            code: item.code,
            categoryId,
            departmentId,
            unit: item.unit,
            specification: item.specification,
            manufacturer: item.manufacturer,
            minStock: item.minStock,
            currentStock: item.currentStock,
            price: item.price,
            expiryDate: item.expiryDate,
            note: item.note,
            createdAt: serverTimestamp()
          });
          itemMap.set(item.code, docRef.id);

          // Add initial stock transaction
          if (item.currentStock > 0) {
            await addDoc(collection(db, 'transactions'), {
              code: `PN-INIT-${item.code}`,
              itemId: docRef.id,
              type: 'IN',
              quantity: item.currentStock,
              unitPrice: item.price,
              totalAmount: item.currentStock * item.price,
              toDeptId: departmentId,
              timestamp: serverTimestamp(),
              note: 'Nhập kho ban đầu theo chuẩn CĐHA'
            });
          }
        } else {
          itemMap.set(item.code, existing.id);
        }
      }

      // 4. Seed Transactions
      for (const t of SAMPLE_CDHA_DATA.transactions) {
        const itemId = itemMap.get(t.itemCode);
        if (itemId) {
          let transType: 'IN' | 'OUT' | 'TRANSFER' | 'AUDIT' = 'IN';
          if (t.type === 'Xuất sử dụng') transType = 'OUT';
          else if (t.type === 'Chuyển phòng') transType = 'TRANSFER';
          else if (t.type === 'Kiểm kê') transType = 'AUDIT';

          await addDoc(collection(db, 'transactions'), {
            code: t.code,
            itemId,
            type: transType,
            quantity: t.quantity,
            unitPrice: t.unitPrice,
            totalAmount: t.quantity * t.unitPrice,
            batchNumber: t.batch,
            batchExpiry: t.expiry,
            performer: t.performer,
            timestamp: serverTimestamp(),
            note: t.note
          });
        }
      }

      toast.success('Đã nạp toàn bộ bộ dữ liệu mẫu chuẩn Khoa Chẩn đoán hình ảnh thành công!');
    } catch (err: any) {
      console.error('Seed error:', err);
      toast.error('Lỗi khi nạp dữ liệu mẫu: ' + err.message);
    } finally {
      setIsSeeding(false);
    }
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Top Main Navigation Tabs */}
      <div className={`p-1.5 rounded-2xl border flex items-center gap-1.5 w-fit ${darkMode ? 'bg-slate-850 border-slate-700' : 'bg-slate-100/90 border-slate-200'}`}>
        <button
          onClick={() => setHubTab('structure')}
          className={`px-5 py-2.5 rounded-xl font-bold text-sm transition-all flex items-center gap-2 cursor-pointer ${
            hubTab === 'structure'
              ? (darkMode ? 'bg-slate-750 text-white shadow-sm' : 'bg-white text-slate-900 shadow-sm')
              : (darkMode ? 'text-slate-400 hover:text-slate-200' : 'text-slate-600 hover:text-slate-900')
          }`}
        >
          <FileSpreadsheet className="w-4 h-4 text-emerald-500" />
          <span>Cấu trúc 5 Trang tính Chuẩn CĐHA</span>
        </button>

        <button
          onClick={() => setHubTab('gas')}
          className={`px-5 py-2.5 rounded-xl font-bold text-sm transition-all flex items-center gap-2 cursor-pointer ${
            hubTab === 'gas'
              ? (darkMode ? 'bg-slate-750 text-white shadow-sm' : 'bg-white text-slate-900 shadow-sm')
              : (darkMode ? 'text-slate-400 hover:text-slate-200' : 'text-slate-600 hover:text-slate-900')
          }`}
        >
          <Code2 className="w-4 h-4 text-blue-500" />
          <span>Google Apps Script (Import Excel/CSV)</span>
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300">
            Mã nguồn
          </span>
        </button>
      </div>

      {hubTab === 'gas' ? (
        /* ================== GOOGLE APPS SCRIPT SUITE ================== */
        <div className="space-y-6">
          {/* GAS Hero Banner */}
          <div className={`p-6 lg:p-8 rounded-3xl border shadow-sm relative overflow-hidden ${
            darkMode ? 'bg-gradient-to-br from-slate-800 via-slate-850 to-slate-900 border-slate-700' : 'bg-gradient-to-br from-indigo-50/80 via-white to-blue-50/50 border-indigo-100'
          }`}>
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 relative z-10">
              <div>
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold mb-3 bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300">
                  <Terminal className="w-3.5 h-3.5" />
                  <span>Google Apps Script Tự Động Hóa Nhập Dữ Liệu</span>
                </div>
                <h2 className={`text-2xl lg:text-3xl font-bold tracking-tight mb-2 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                  Mã Nguồn Google Apps Script: Nhập Vật Tư từ Excel/CSV
                </h2>
                <p className={`text-sm lg:text-base max-w-2xl leading-relaxed ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                  Bộ mã nguồn hoàn chỉnh tích hợp menu tùy chỉnh <strong>"🏥 Quản lý Vật tư CĐHA"</strong> ngay trên Google Sheets. Hỗ trợ tải tệp <code>.xlsx</code>, <code>.xls</code>, <code>.csv</code>, tự động đọc và ghi chuẩn xác vào trang tính <strong>'Danh sách Vật tư'</strong>, kiểm tra trùng lặp và tính toán cảnh báo tồn kho.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
                <button
                  onClick={() => handleDownloadFileText(APPS_SCRIPT_CODE_GS, 'Code.gs')}
                  className="flex-1 lg:flex-initial px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-2xl shadow-lg shadow-blue-500/20 transition-all flex items-center justify-center gap-2 text-xs sm:text-sm active:scale-95 cursor-pointer"
                >
                  <FileDown className="w-4 h-4" />
                  <span>Tải Code.gs</span>
                </button>
                <button
                  onClick={() => handleDownloadFileText(APPS_SCRIPT_UPLOAD_DIALOG_HTML, 'UploadDialog.html')}
                  className={`flex-1 lg:flex-initial px-4 py-2.5 font-semibold rounded-2xl border transition-all flex items-center justify-center gap-2 text-xs sm:text-sm active:scale-95 cursor-pointer ${
                    darkMode ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700' : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200'
                  }`}
                >
                  <FileDown className="w-4 h-4" />
                  <span>Tải UploadDialog.html</span>
                </button>
              </div>
            </div>

            {/* Quick feature summary pills */}
            <div className={`mt-6 pt-5 border-t grid grid-cols-2 md:grid-cols-4 gap-3 text-xs ${darkMode ? 'border-slate-700/80 text-slate-300' : 'border-indigo-100/80 text-slate-600'}`}>
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
                <span>Hỗ trợ .xlsx, .xls, .csv</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
                <span>Tự động kiểm tra trùng lặp</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
                <span>Tự tạo Sheet nếu chưa có</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
                <span>Công thức cảnh báo tự động</span>
              </div>
            </div>
          </div>

          {/* GAS Sub Tabs */}
          <div className="flex items-center gap-2 border-b pb-3 dark:border-slate-700">
            <button
              onClick={() => setGasSubTab('code')}
              className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all flex items-center gap-2 cursor-pointer ${
                gasSubTab === 'code'
                  ? (darkMode ? 'bg-blue-600 text-white' : 'bg-blue-600 text-white shadow-sm')
                  : (darkMode ? 'text-slate-400 hover:text-slate-200' : 'text-slate-600 hover:text-slate-900')
              }`}
            >
              <FileCode className="w-4 h-4" />
              <span>1. Mã chính (Code.gs)</span>
            </button>

            <button
              onClick={() => setGasSubTab('dialog')}
              className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all flex items-center gap-2 cursor-pointer ${
                gasSubTab === 'dialog'
                  ? (darkMode ? 'bg-blue-600 text-white' : 'bg-blue-600 text-white shadow-sm')
                  : (darkMode ? 'text-slate-400 hover:text-slate-200' : 'text-slate-600 hover:text-slate-900')
              }`}
            >
              <Code2 className="w-4 h-4" />
              <span>2. Giao diện tải tệp (UploadDialog.html)</span>
            </button>

            <button
              onClick={() => setGasSubTab('guide')}
              className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all flex items-center gap-2 cursor-pointer ${
                gasSubTab === 'guide'
                  ? (darkMode ? 'bg-blue-600 text-white' : 'bg-blue-600 text-white shadow-sm')
                  : (darkMode ? 'text-slate-400 hover:text-slate-200' : 'text-slate-600 hover:text-slate-900')
              }`}
            >
              <HelpCircle className="w-4 h-4" />
              <span>3. Hướng dẫn cài đặt 30 giây</span>
            </button>

            <button
              onClick={() => setGasSubTab('tester')}
              className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all flex items-center gap-2 cursor-pointer ${
                gasSubTab === 'tester'
                  ? (darkMode ? 'bg-emerald-600 text-white' : 'bg-emerald-600 text-white shadow-sm')
                  : (darkMode ? 'text-slate-400 hover:text-slate-200' : 'text-slate-600 hover:text-slate-900')
              }`}
            >
              <Play className="w-4 h-4" />
              <span>4. Giả lập kiểm tra tệp Excel/CSV</span>
            </button>
          </div>

          {/* SubTab Content 1: Code.gs */}
          {gasSubTab === 'code' && (
            <div className={`p-6 rounded-3xl border shadow-sm ${darkMode ? 'bg-slate-850 border-slate-700' : 'bg-white border-slate-200'}`}>
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4 pb-4 border-b dark:border-slate-700">
                <div>
                  <h3 className={`text-lg font-bold flex items-center gap-2 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                    <FileCode className="w-5 h-5 text-blue-500" />
                    <span>Mã nguồn Code.gs (Apps Script)</span>
                  </h3>
                  <p className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                    Xử lý tạo menu, khởi tạo trang tính, đọc và ghi dữ liệu hàng loạt (Batch append/update), xử lý ngày tháng và công thức
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleCopyCodeText(APPS_SCRIPT_CODE_GS, 'code_gs')}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-md shadow-blue-500/20 cursor-pointer active:scale-95 transition-all"
                  >
                    {copiedCode === 'code_gs' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    <span>{copiedCode === 'code_gs' ? 'Đã sao chép!' : 'Sao chép toàn bộ Code.gs'}</span>
                  </button>
                  <button
                    onClick={() => handleDownloadFileText(APPS_SCRIPT_CODE_GS, 'Code.gs')}
                    className={`p-2 rounded-xl border text-xs cursor-pointer ${darkMode ? 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700' : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'}`}
                    title="Tải về máy"
                  >
                    <Download className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="relative">
                <pre className={`p-4 rounded-2xl text-xs font-mono overflow-x-auto max-h-[550px] leading-relaxed ${
                  darkMode ? 'bg-slate-950 text-emerald-400 border border-slate-800' : 'bg-slate-900 text-emerald-300'
                }`}>
                  <code>{APPS_SCRIPT_CODE_GS}</code>
                </pre>
              </div>
            </div>
          )}

          {/* SubTab Content 2: UploadDialog.html */}
          {gasSubTab === 'dialog' && (
            <div className={`p-6 rounded-3xl border shadow-sm ${darkMode ? 'bg-slate-850 border-slate-700' : 'bg-white border-slate-200'}`}>
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4 pb-4 border-b dark:border-slate-700">
                <div>
                  <h3 className={`text-lg font-bold flex items-center gap-2 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                    <Code2 className="w-5 h-5 text-indigo-500" />
                    <span>Giao diện hộp thoại tải tệp (UploadDialog.html)</span>
                  </h3>
                  <p className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                    Hộp thoại kéo & thả tệp, tích hợp SheetJS để đọc cả file Excel (.xlsx, .xls) và CSV trực tiếp trên trình duyệt với tốc độ tức thì
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleCopyCodeText(APPS_SCRIPT_UPLOAD_DIALOG_HTML, 'dialog_html')}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-md shadow-indigo-500/20 cursor-pointer active:scale-95 transition-all"
                  >
                    {copiedCode === 'dialog_html' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    <span>{copiedCode === 'dialog_html' ? 'Đã sao chép!' : 'Sao chép UploadDialog.html'}</span>
                  </button>
                  <button
                    onClick={() => handleDownloadFileText(APPS_SCRIPT_UPLOAD_DIALOG_HTML, 'UploadDialog.html')}
                    className={`p-2 rounded-xl border text-xs cursor-pointer ${darkMode ? 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700' : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'}`}
                    title="Tải về máy"
                  >
                    <Download className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="relative">
                <pre className={`p-4 rounded-2xl text-xs font-mono overflow-x-auto max-h-[550px] leading-relaxed ${
                  darkMode ? 'bg-slate-950 text-cyan-400 border border-slate-800' : 'bg-slate-900 text-cyan-300'
                }`}>
                  <code>{APPS_SCRIPT_UPLOAD_DIALOG_HTML}</code>
                </pre>
              </div>
            </div>
          )}

          {/* SubTab Content 3: Guide */}
          {gasSubTab === 'guide' && (
            <div className={`p-6 lg:p-8 rounded-3xl border shadow-sm ${darkMode ? 'bg-slate-850 border-slate-700' : 'bg-white border-slate-200'}`}>
              <h3 className={`text-xl font-bold mb-2 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                Hướng dẫn Cài đặt & Sử dụng Google Apps Script trên Google Sheets
              </h3>
              <p className={`text-sm mb-6 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                Chỉ mất chưa đầy 1 phút để tích hợp vào bất kỳ file Google Sheets nào bạn đang quản lý:
              </p>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Step 1 */}
                <div className={`p-5 rounded-2xl border flex flex-col justify-between ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-blue-50/50 border-blue-100'}`}>
                  <div>
                    <div className="w-9 h-9 rounded-xl bg-blue-600 text-white font-bold flex items-center justify-center text-sm mb-4">
                      1
                    </div>
                    <h4 className={`font-bold text-base mb-2 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                      Mở trình soạn thảo Apps Script
                    </h4>
                    <p className={`text-xs leading-relaxed ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                      Trên thanh menu của Google Sheets, chọn <strong>Tiện ích mở rộng (Extensions)</strong> &rarr; <strong>Apps Script</strong>.
                    </p>
                  </div>
                  <div className={`mt-4 p-3 rounded-xl border text-[11px] font-mono ${darkMode ? 'bg-slate-900 border-slate-700 text-slate-400' : 'bg-white border-blue-200 text-slate-700'}`}>
                    Extensions &gt; Apps Script
                  </div>
                </div>

                {/* Step 2 */}
                <div className={`p-5 rounded-2xl border flex flex-col justify-between ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-blue-50/50 border-blue-100'}`}>
                  <div>
                    <div className="w-9 h-9 rounded-xl bg-blue-600 text-white font-bold flex items-center justify-center text-sm mb-4">
                      2
                    </div>
                    <h4 className={`font-bold text-base mb-2 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                      Tạo 2 tệp mã nguồn
                    </h4>
                    <ul className={`text-xs space-y-2 leading-relaxed ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                      <li>
                        • Trong tệp <code>Mã.gs</code> (hoặc <code>Code.gs</code>): Xóa hết mã cũ và dán toàn bộ mã <strong>Code.gs</strong> ở Tab 1.
                      </li>
                      <li>
                        • Nhấn dấu <strong>(+) Thêm tệp</strong> &rarr; Chọn <strong>HTML</strong> &rarr; Đặt tên là <code>UploadDialog</code> &rarr; Dán mã ở Tab 2.
                      </li>
                    </ul>
                  </div>
                  <div className={`mt-4 p-3 rounded-xl border text-[11px] font-mono ${darkMode ? 'bg-slate-900 border-slate-700 text-slate-400' : 'bg-white border-blue-200 text-slate-700'}`}>
                    1 tệp .gs + 1 tệp UploadDialog.html
                  </div>
                </div>

                {/* Step 3 */}
                <div className={`p-5 rounded-2xl border flex flex-col justify-between ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-blue-50/50 border-blue-100'}`}>
                  <div>
                    <div className="w-9 h-9 rounded-xl bg-blue-600 text-white font-bold flex items-center justify-center text-sm mb-4">
                      3
                    </div>
                    <h4 className={`font-bold text-base mb-2 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                      Lưu & Thưởng thức
                    </h4>
                    <p className={`text-xs leading-relaxed ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                      Nhấn biểu tượng <strong>Lưu (Ctrl+S)</strong>. Quay lại trang Google Sheets và bấm <strong>F5 (Tải lại trang)</strong>. Bạn sẽ thấy menu mới <strong>"🏥 Quản lý Vật tư CĐHA"</strong> xuất hiện trên thanh công cụ!
                    </p>
                  </div>
                  <div className={`mt-4 p-3 rounded-xl border text-[11px] font-mono ${darkMode ? 'bg-slate-900 border-slate-700 text-slate-400' : 'bg-white border-blue-200 text-slate-700'}`}>
                    🏥 Quản lý Vật tư CĐHA &gt; 📥 Nhập Vật tư...
                  </div>
                </div>
              </div>

              {/* Advanced notes */}
              <div className={`mt-8 p-5 rounded-2xl border ${darkMode ? 'bg-slate-900/50 border-slate-700' : 'bg-slate-50 border-slate-200'}`}>
                <h4 className={`text-sm font-bold mb-2 flex items-center gap-2 ${darkMode ? 'text-amber-400' : 'text-amber-800'}`}>
                  <AlertTriangle className="w-4 h-4 text-amber-500" />
                  <span>Lưu ý về Quyền truy cập lần đầu tiên (Google Authorization)</span>
                </h4>
                <p className={`text-xs leading-relaxed ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                  Khi bạn lần đầu bấm chạy hoặc mở hộp thoại nhập tệp, Google Sheets sẽ yêu cầu cấp quyền cho script: Chọn <strong>Xem xét quyền (Review permissions)</strong> &rarr; Chọn tài khoản Google của bạn &rarr; Nhấn <strong>Nâng cao (Advanced)</strong> &rarr; Chọn <strong>Đi tới dự án (Không an toàn)</strong> &rarr; Nhấn <strong>Cho phép (Allow)</strong>. Đây là quy trình tiêu chuẩn của Google cho các Apps Script cá nhân.
                </p>
              </div>
            </div>
          )}

          {/* SubTab Content 4: In-App File Tester / Simulator */}
          {gasSubTab === 'tester' && (
            <div className={`p-6 lg:p-8 rounded-3xl border shadow-sm ${darkMode ? 'bg-slate-850 border-slate-700' : 'bg-white border-slate-200'}`}>
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 pb-4 border-b dark:border-slate-700">
                <div>
                  <h3 className={`text-lg font-bold flex items-center gap-2 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                    <Play className="w-5 h-5 text-emerald-500" />
                    <span>Trình Giả Lập & Kiểm Tra Tệp Trước Khi Đưa Lên Google Sheets</span>
                  </h3>
                  <p className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                    Tải thử tệp Excel hoặc CSV của bệnh viện lên để kiểm tra xem script sẽ đọc cột nào, phát hiện dòng lỗi nào (thiếu Tên vật tư, số liệu sai) trước khi ghi vào Google Sheets.
                  </p>
                </div>

                <div>
                  <input
                    type="file"
                    accept=".xlsx, .xls, .csv"
                    ref={testerFileInputRef}
                    onChange={handleTestFileUpload}
                    className="hidden"
                  />
                  <button
                    onClick={() => testerFileInputRef.current?.click()}
                    className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs sm:text-sm font-bold shadow-md shadow-emerald-500/20 cursor-pointer active:scale-95 transition-all flex items-center gap-2"
                  >
                    <Upload className="w-4 h-4" />
                    <span>Chọn tệp Excel/CSV để kiểm tra</span>
                  </button>
                </div>
              </div>

              {testResults ? (
                <div className="space-y-6">
                  {/* Summary Bar */}
                  <div className={`p-4 rounded-2xl border grid grid-cols-2 md:grid-cols-4 gap-4 ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-slate-50 border-slate-200'}`}>
                    <div>
                      <div className="text-[11px] text-slate-400">Tên tệp kiểm tra</div>
                      <div className="font-bold text-sm truncate">{testResults.fileName} ({testResults.fileSize})</div>
                    </div>
                    <div>
                      <div className="text-[11px] text-slate-400">Tổng số dòng đọc được</div>
                      <div className="font-bold text-sm">{testResults.totalRows} dòng</div>
                    </div>
                    <div>
                      <div className="text-[11px] text-emerald-500">Dòng hợp lệ (Sẽ ghi)</div>
                      <div className="font-bold text-sm text-emerald-600">{testResults.validRows.length} dòng</div>
                    </div>
                    <div>
                      <div className="text-[11px] text-red-500">Dòng lỗi / Thiếu dữ liệu</div>
                      <div className="font-bold text-sm text-red-600">{testResults.invalidRows.length} dòng</div>
                    </div>
                  </div>

                  {/* Invalid Rows Table if any */}
                  {testResults.invalidRows.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-xs font-bold text-red-600 uppercase tracking-wider flex items-center gap-1.5">
                        <AlertTriangle className="w-4 h-4" />
                        <span>Danh sách các dòng bị lỗi / Bỏ qua ({testResults.invalidRows.length})</span>
                      </h4>
                      <div className="overflow-x-auto rounded-xl border border-red-200 bg-red-50/50 p-3 text-xs">
                        <table className="w-full text-left">
                          <thead>
                            <tr className="text-red-700 font-bold border-b border-red-200">
                              <th className="p-2">Dòng thứ</th>
                              <th className="p-2">Nguyên nhân lỗi</th>
                              <th className="p-2">Dữ liệu thô</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-red-100 text-red-800">
                            {testResults.invalidRows.map((inv, i) => (
                              <tr key={i}>
                                <td className="p-2 font-mono font-bold">Dòng {inv.row}</td>
                                <td className="p-2">{inv.reason}</td>
                                <td className="p-2 font-mono text-[11px] truncate max-w-xs">{JSON.stringify(inv.data)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Valid Rows Preview Table */}
                  <div className="space-y-2">
                    <h4 className={`text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                      <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                      <span>Xem trước dữ liệu sẽ ghi vào 'Danh sách Vật tư' ({testResults.validRows.length} dòng)</span>
                    </h4>
                    <div className="overflow-x-auto rounded-2xl border dark:border-slate-700 text-xs">
                      <table className="w-full text-left">
                        <thead className={`font-semibold ${darkMode ? 'bg-slate-900 text-slate-300' : 'bg-slate-100 text-slate-700'}`}>
                          <tr>
                            <th className="p-3">Mã vật tư</th>
                            <th className="p-3">Tên vật tư</th>
                            <th className="p-3">Đơn vị</th>
                            <th className="p-3">Quy cách</th>
                            <th className="p-3">Tồn kho</th>
                            <th className="p-3">Đơn giá</th>
                            <th className="p-3">Hạn dùng</th>
                          </tr>
                        </thead>
                        <tbody className={`divide-y ${darkMode ? 'divide-slate-700 text-slate-300' : 'divide-slate-100 text-slate-700'}`}>
                          {testResults.validRows.slice(0, 10).map((row, i) => (
                            <tr key={i}>
                              <td className="p-3 font-mono font-bold text-blue-600 dark:text-blue-400">{row.code}</td>
                              <td className="p-3 font-semibold">{row.name}</td>
                              <td className="p-3">{row.unit}</td>
                              <td className="p-3 text-slate-500">{row.specification || '-'}</td>
                              <td className="p-3 font-bold text-emerald-600">{row.currentStock}</td>
                              <td className="p-3">{row.price.toLocaleString('vi-VN')} ₫</td>
                              <td className="p-3 font-mono">{row.expiryDate || '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {testResults.validRows.length > 10 && (
                      <p className="text-[11px] text-slate-500 italic text-right">
                        Đang hiển thị 10/{testResults.validRows.length} dòng đầu tiên.
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <div className={`p-12 text-center rounded-2xl border-2 border-dashed ${darkMode ? 'border-slate-700 text-slate-500' : 'border-slate-200 text-slate-400'}`}>
                  <FileSpreadsheet className="w-12 h-12 mx-auto mb-3 opacity-60 text-emerald-500" />
                  <p className="text-sm font-semibold mb-1">Chưa có tệp nào được kiểm tra</p>
                  <p className="text-xs mb-4">Hãy tải lên một tệp Excel (.xlsx, .xls) hoặc CSV để xem kết quả phân tích dữ liệu ngay lập tức.</p>
                  <button
                    onClick={() => testerFileInputRef.current?.click()}
                    className="px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700 transition-colors cursor-pointer"
                  >
                    Tải tệp kiểm tra lên
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        /* ================== EXISTING STRUCTURE & SPECIFICATION VIEW ================== */
        <div className="space-y-8">
          {/* Top Hero Banner */}
          <div className={`p-6 lg:p-8 rounded-3xl border shadow-sm relative overflow-hidden ${
            darkMode ? 'bg-gradient-to-br from-slate-800 via-slate-850 to-slate-900 border-slate-700' : 'bg-gradient-to-br from-blue-50/80 via-white to-indigo-50/50 border-blue-100'
          }`}>
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 relative z-10">
              <div>
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold mb-3 bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Cấu trúc chuẩn hóa Google Sheets cho Khoa Chẩn đoán Hình ảnh</span>
                </div>
                <h2 className={`text-2xl lg:text-3xl font-bold tracking-tight mb-2 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                  Trung tâm Mẫu & Đồng bộ Google Sheets
                </h2>
                <p className={`text-sm lg:text-base max-w-2xl leading-relaxed ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                  Thiết kế chuyên sâu gồm <strong>5 trang tính</strong> liên kết (Danh mục Nhóm, Danh sách Vật tư, Phòng ban Modality, Sổ Xuất Nhập Tồn, và Phân quyền Người dùng) tối ưu cho tra cứu, tự động tính toán và đối soát dữ liệu y tế.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
                {/* Download Template Button */}
                <button
                  onClick={handleDownloadTemplate}
                  className="flex-1 lg:flex-initial px-5 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-2xl shadow-lg shadow-blue-500/20 transition-all flex items-center justify-center gap-2 text-sm active:scale-95 cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>Tải File Mẫu (5 Sheets .xlsx)</span>
                </button>

                {/* Export Live DB to Google Sheets */}
                <button
                  onClick={handleExportLive}
                  className={`flex-1 lg:flex-initial px-5 py-3 font-semibold rounded-2xl border transition-all flex items-center justify-center gap-2 text-sm active:scale-95 cursor-pointer ${
                    darkMode ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700' : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200 shadow-sm'
                  }`}
                >
                  <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                  <span>Xuất Dữ Liệu Hiện Tại</span>
                </button>

                {/* Upload & Sync File */}
                <input
                  type="file"
                  accept=".xlsx, .xls, .csv"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isImporting}
                  className={`flex-1 lg:flex-initial px-5 py-3 font-semibold rounded-2xl border transition-all flex items-center justify-center gap-2 text-sm active:scale-95 cursor-pointer disabled:opacity-60 ${
                    darkMode ? 'bg-indigo-900/30 hover:bg-indigo-900/50 text-indigo-300 border-indigo-800' : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border-indigo-200'
                  }`}
                >
                  <Upload className="w-4 h-4" />
                  <span>{isImporting ? 'Đang đồng bộ...' : 'Tải lên từ Google Sheets'}</span>
                </button>
              </div>
            </div>

            {/* Quick Seed Demo Alert for Admins */}
            <div className={`mt-6 pt-5 border-t flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs ${darkMode ? 'border-slate-700/80 text-slate-400' : 'border-blue-100/80 text-slate-600'}`}>
              <div className="flex items-center gap-2">
                <Info className="w-4 h-4 text-blue-500 shrink-0" />
                <span>
                  Bộ dữ liệu mẫu gồm 13+ vật tư CĐHA thực tế (Omnipaque, Ultravist, Phim Fuji, Parker Gel, Kim can thiệp DSA...) và 7 phòng máy CĐHA.
                </span>
              </div>
              <button
                onClick={() => setShowSeedConfirm(true)}
                disabled={isSeeding}
                className="font-semibold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 shrink-0 cursor-pointer"
              >
                <Database className="w-3.5 h-3.5" />
                <span>{isSeeding ? 'Đang nạp...' : 'Nạp dữ liệu mẫu CĐHA'}</span>
              </button>
            </div>
          </div>

          {/* Sheets Navigation Tabs */}
          <div className="flex items-center gap-2 overflow-x-auto pb-2 custom-scrollbar">
            {DIAGNOSTIC_IMAGING_SHEETS_SPEC.map((spec, index) => {
              const isActive = selectedSheetIndex === index;
              return (
                <button
                  key={spec.sheetName}
                  onClick={() => setSelectedSheetIndex(index)}
                  className={`px-4 py-3 rounded-2xl text-sm font-semibold transition-all whitespace-nowrap flex items-center gap-2.5 border cursor-pointer ${
                    isActive
                      ? (darkMode ? 'bg-blue-600 text-white border-blue-500 shadow-lg shadow-blue-900/30' : 'bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-200')
                      : (darkMode ? 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-750 hover:text-slate-200' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:text-slate-900')
                  }`}
                >
                  <Table className="w-4 h-4" />
                  <span>{spec.title}</span>
                  <span className={`px-2 py-0.5 rounded-full text-xs ${
                    isActive ? 'bg-white/20 text-white' : (darkMode ? 'bg-slate-700 text-slate-400' : 'bg-slate-100 text-slate-500')
                  }`}>
                    {spec.columns.length} cột
                  </span>
                </button>
              );
            })}
          </div>

          {/* Sheet Detail View */}
          <div className={`p-6 lg:p-8 rounded-3xl border shadow-sm ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
            {/* Sheet Overview Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pb-6 border-b dark:border-slate-700">
              <div>
                <div className="flex items-center gap-3 mb-1">
                  <h3 className={`text-xl font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                    {activeSpec.title}
                  </h3>
                  <span className="font-mono text-xs px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 font-bold border border-blue-100 dark:border-blue-900">
                    Sheet: {activeSpec.sheetName}
                  </span>
                </div>
                <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                  {activeSpec.description}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span className={`text-xs px-3 py-1.5 rounded-xl border ${darkMode ? 'bg-slate-700/50 border-slate-600 text-slate-300' : 'bg-slate-50 border-slate-200 text-slate-600'}`}>
                  Tổng cộng <strong>{activeSpec.columns.length}</strong> cột dữ liệu chuẩn
                </span>
              </div>
            </div>

            {/* Columns Specification Table */}
            <div className="mt-6">
              <h4 className={`text-sm font-bold uppercase tracking-wider mb-4 flex items-center gap-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                <Layers className="w-4 h-4 text-blue-500" />
                <span>Cấu trúc chi tiết các cột trong bảng</span>
              </h4>

              <div className="overflow-x-auto rounded-2xl border dark:border-slate-700">
                <table className="w-full text-left text-xs sm:text-sm">
                  <thead className={`${darkMode ? 'bg-slate-900/70 text-slate-400 border-b border-slate-700' : 'bg-slate-50 text-slate-600 border-b border-slate-200'}`}>
                    <tr>
                      <th className="py-3 px-4 font-semibold">Tên cột (Header)</th>
                      <th className="py-3 px-4 font-semibold">Trường lưu (Field)</th>
                      <th className="py-3 px-4 font-semibold">Kiểu dữ liệu</th>
                      <th className="py-3 px-4 font-semibold text-center">Bắt buộc</th>
                      <th className="py-3 px-4 font-semibold">Giá trị mẫu</th>
                      <th className="py-3 px-4 font-semibold">Diễn giải & Quy tắc nghiệp vụ</th>
                    </tr>
                  </thead>
                  <tbody className={`divide-y ${darkMode ? 'divide-slate-700/60 text-slate-300' : 'divide-slate-100 text-slate-700'}`}>
                    {activeSpec.columns.map((col, idx) => (
                      <tr key={col.name} className={`${darkMode ? 'hover:bg-slate-750/50' : 'hover:bg-slate-50/80'} transition-colors`}>
                        <td className="py-3.5 px-4 font-mono font-bold text-blue-600 dark:text-blue-400">
                          {col.name}
                        </td>
                        <td className="py-3.5 px-4 font-mono text-xs text-slate-500 dark:text-slate-400">
                          {col.field}
                        </td>
                        <td className="py-3.5 px-4">
                          <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                            col.type.includes('Mã') || col.type.includes('Khóa')
                              ? 'bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800'
                              : col.type.includes('Dropdown')
                              ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
                              : col.type.includes('Số')
                              ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                              : 'bg-slate-100 dark:bg-slate-700/60 text-slate-700 dark:text-slate-300'
                          }`}>
                            {col.type}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          {col.required ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-400">
                              Bắt buộc
                            </span>
                          ) : (
                            <span className="text-slate-400 dark:text-slate-500 text-xs">
                              Tùy chọn
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 font-medium text-slate-800 dark:text-slate-200">
                          {col.example}
                        </td>
                        <td className="py-3.5 px-4 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                          {col.description}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Formulas & Validation Section */}
            <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Google Sheets Formulas */}
              {activeSpec.formulas && activeSpec.formulas.length > 0 && (
                <div className={`p-5 rounded-2xl border ${darkMode ? 'bg-slate-900/60 border-slate-700' : 'bg-slate-50 border-slate-200'}`}>
                  <h4 className={`text-sm font-bold uppercase tracking-wider mb-3 flex items-center gap-2 ${darkMode ? 'text-slate-200' : 'text-slate-800'}`}>
                    <FileText className="w-4 h-4 text-indigo-500" />
                    <span>Công thức Google Sheets đề xuất</span>
                  </h4>
                  <div className="space-y-3">
                    {activeSpec.formulas.map((item, idx) => (
                      <div key={idx} className={`p-3 rounded-xl border ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400">{item.name}</span>
                          <button
                            onClick={() => handleCopy(item.formula, `f-${idx}`)}
                            className={`text-xs px-2 py-1 rounded-lg flex items-center gap-1 font-medium transition-colors cursor-pointer ${
                              copiedFormula === `f-${idx}`
                                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300'
                                : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                            }`}
                          >
                            {copiedFormula === `f-${idx}` ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                            <span>{copiedFormula === `f-${idx}` ? 'Đã chép' : 'Sao chép'}</span>
                          </button>
                        </div>
                        <code className="block p-2 rounded-lg bg-slate-100 dark:bg-slate-900 text-xs font-mono text-emerald-600 dark:text-emerald-400 overflow-x-auto">
                          {item.formula}
                        </code>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5">{item.description}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Data Validation Rules */}
              {activeSpec.validations && activeSpec.validations.length > 0 && (
                <div className={`p-5 rounded-2xl border ${darkMode ? 'bg-slate-900/60 border-slate-700' : 'bg-slate-50 border-slate-200'}`}>
                  <h4 className={`text-sm font-bold uppercase tracking-wider mb-3 flex items-center gap-2 ${darkMode ? 'text-slate-200' : 'text-slate-800'}`}>
                    <ShieldCheck className="w-4 h-4 text-emerald-500" />
                    <span>Xác thực dữ liệu (Data Validation Dropdown)</span>
                  </h4>
                  <div className="space-y-3">
                    {activeSpec.validations.map((val, idx) => (
                      <div key={idx} className={`p-3 rounded-xl border ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                            Cột: <span className="font-mono text-blue-600 dark:text-blue-400">{val.column}</span>
                          </span>
                          <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300">
                            {val.rule}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-2 mt-2">
                          <code className="text-xs font-mono p-1.5 rounded bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-300 flex-1 truncate">
                            {val.source}
                          </code>
                          <button
                            onClick={() => handleCopy(val.source, `v-${idx}`)}
                            className="text-xs p-1.5 rounded-lg bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-600 dark:text-slate-300 cursor-pointer"
                            title="Sao chép biểu thức dải ô"
                          >
                            {copiedFormula === `v-${idx}` ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Conditional Formatting Rules */}
              {activeSpec.conditionalFormatting && activeSpec.conditionalFormatting.length > 0 && (
                <div className={`p-5 rounded-2xl border lg:col-span-2 ${darkMode ? 'bg-slate-900/60 border-slate-700' : 'bg-slate-50 border-slate-200'}`}>
                  <h4 className={`text-sm font-bold uppercase tracking-wider mb-3 flex items-center gap-2 ${darkMode ? 'text-slate-200' : 'text-slate-800'}`}>
                    <AlertTriangle className="w-4 h-4 text-amber-500" />
                    <span>Định dạng có điều kiện (Conditional Formatting)</span>
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {activeSpec.conditionalFormatting.map((cf, idx) => (
                      <div key={idx} className={`p-3.5 rounded-xl border flex items-start gap-3 ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
                        <div className={`w-3.5 h-3.5 rounded-full mt-1 shrink-0 ${cf.rule.includes('Ton') ? 'bg-red-500' : 'bg-amber-500'}`} />
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <code className="text-xs font-mono font-bold text-slate-800 dark:text-slate-200">{cf.rule}</code>
                          </div>
                          <p className="text-xs text-slate-500 dark:text-slate-400">{cf.description}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Step-by-step Setup Guide on Google Drive */}
            <div className={`mt-8 p-5 rounded-2xl border ${darkMode ? 'bg-slate-850 border-slate-700' : 'bg-blue-50/50 border-blue-100'}`}>
              <h4 className={`text-sm font-bold mb-3 flex items-center gap-2 ${darkMode ? 'text-blue-400' : 'text-blue-800'}`}>
                <HelpCircle className="w-4 h-4" />
                <span>Hướng dẫn 3 bước đưa file lên Google Sheets & cài đặt</span>
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs leading-relaxed">
                <div className={`p-3 rounded-xl border ${darkMode ? 'bg-slate-800/80 border-slate-700 text-slate-300' : 'bg-white border-blue-100 text-slate-700'}`}>
                  <div className="font-bold text-blue-600 dark:text-blue-400 mb-1">1. Tải lên Google Drive</div>
                  Truy cập <code>drive.google.com</code> &rarr; Nhấn <strong>Mới (+)</strong> &rarr; Chọn <strong>Tải tệp lên</strong> &rarr; Chọn file mẫu vừa tải về máy.
                </div>
                <div className={`p-3 rounded-xl border ${darkMode ? 'bg-slate-800/80 border-slate-700 text-slate-300' : 'bg-white border-blue-100 text-slate-700'}`}>
                  <div className="font-bold text-blue-600 dark:text-blue-400 mb-1">2. Mở bằng Google Trang tính</div>
                  Nhấp đúp vào file trên Drive &rarr; Nhấn <strong>Mở bằng Google Trang tính (Open with Google Sheets)</strong> để làm việc trực tuyến và chia sẻ với đồng nghiệp.
                </div>
                <div className={`p-3 rounded-xl border ${darkMode ? 'bg-slate-800/80 border-slate-700 text-slate-300' : 'bg-white border-blue-100 text-slate-700'}`}>
                  <div className="font-bold text-blue-600 dark:text-blue-400 mb-1">3. Cài đặt Dropdown xác thực</div>
                  Chọn cột <code>MaNhom</code> &rarr; Vào menu <strong>Dữ liệu &rarr; Xác thực dữ liệu</strong> &rarr; Chọn <strong>Dải ô từ trang tính</strong> &rarr; Nhập <code>='DanhMuc_VatTu'!$A$2:$A</code>.
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal for Demo Data Seed */}
      {showSeedConfirm && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className={`rounded-2xl shadow-2xl w-full max-w-md p-6 text-center border ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-100'}`}>
            <div className="w-14 h-14 bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 rounded-full flex items-center justify-center mx-auto mb-4">
              <Database className="w-7 h-7" />
            </div>
            <h3 className={`text-lg font-bold mb-2 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
              Nạp dữ liệu mẫu Khoa Chẩn đoán Hình ảnh?
            </h3>
            <p className={`text-xs mb-6 leading-relaxed ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
              Hệ thống sẽ thêm 6 nhóm vật tư CĐHA, 7 phòng máy (X-quang, CT 128, MRI 1.5T, Siêu âm Doppler, DSA can thiệp), 13 mặt hàng y tế thực tế và lịch sử giao dịch ban đầu. Dữ liệu hiện có của bạn sẽ không bị xóa.
            </p>
            <div className="flex gap-3">
              <button 
                onClick={() => setShowSeedConfirm(false)}
                className={`flex-1 py-2.5 font-bold text-sm rounded-xl transition-colors cursor-pointer ${darkMode ? 'bg-slate-700 text-slate-300 hover:bg-slate-650' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
              >
                Hủy bỏ
              </button>
              <button 
                onClick={handleSeedSampleData}
                disabled={isSeeding}
                className="flex-1 py-2.5 bg-blue-600 text-white font-bold text-sm rounded-xl hover:bg-blue-700 transition-colors shadow-lg shadow-blue-500/20 flex items-center justify-center gap-2 cursor-pointer"
              >
                {isSeeding ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                <span>Xác nhận nạp</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

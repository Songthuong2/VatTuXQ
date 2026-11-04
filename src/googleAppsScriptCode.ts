/**
 * Google Apps Script source code and HTML dialog templates
 * for importing Excel/CSV supplies into Google Sheets 'Danh sách Vật tư'
 */

export const APPS_SCRIPT_CODE_GS = `/**
 * ==============================================================================
 * GOOGLE APPS SCRIPT: QUẢN LÝ VẬT TƯ KHOA CHẨN ĐOÁN HÌNH ẢNH (CĐHA)
 * Chức năng: Nhập dữ liệu vật tư từ tệp Excel (.xlsx, .xls) và CSV vào
 * trang tính 'Danh sách Vật tư' (hoặc 'DanhSach_VatTu').
 * ==============================================================================
 */

// Tên trang tính mặc định (hỗ trợ cả có dấu và không dấu)
var TARGET_SHEET_NAME = "Danh sách Vật tư";
var ALT_SHEET_NAME = "DanhSach_VatTu";

/**
 * 1. Tự động tạo Menu tùy chỉnh khi mở Google Sheets
 */
function onOpen() {
  var ui = SpreadsheetApp.getUi();
  ui.createMenu("🏥 Quản lý Vật tư CĐHA")
    .addItem("📥 Nhập Vật tư từ Excel / CSV...", "showImportDialog")
    .addSeparator()
    .addItem("⚙️ Khởi tạo / Chuẩn hóa Trang tính 'Danh sách Vật tư'", "initSupplySheet")
    .addItem("📊 Cập nhật Công thức & Cảnh báo Tồn kho", "refreshFormulasAndValidation")
    .addToUi();
}

/**
 * 2. Mở Hộp thoại (Modal Dialog) Tải lên tệp
 */
function showImportDialog() {
  var html = HtmlService.createHtmlOutputFromFile("UploadDialog")
    .setWidth(680)
    .setHeight(560)
    .setTitle("Nhập Vật tư Y tế từ tệp Excel / CSV");
  SpreadsheetApp.getUi().showModalDialog(html, "Nhập Vật tư Y tế từ tệp Excel / CSV");
}

/**
 * 3. Tìm hoặc Khởi tạo Trang tính mục tiêu
 */
function getOrCreateTargetSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(TARGET_SHEET_NAME) || ss.getSheetByName(ALT_SHEET_NAME);
  
  if (!sheet) {
    sheet = ss.insertSheet(TARGET_SHEET_NAME);
    initSheetStructure(sheet);
  }
  return sheet;
}

/**
 * Khởi tạo cấu trúc và định dạng chuẩn cho sheet 'Danh sách Vật tư'
 */
function initSupplySheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(TARGET_SHEET_NAME) || ss.getSheetByName(ALT_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(TARGET_SHEET_NAME);
  }
  initSheetStructure(sheet);
  SpreadsheetApp.getUi().alert("✅ Đã khởi tạo và chuẩn hóa định dạng trang tính '" + sheet.getName() + "' thành công!");
}

function initSheetStructure(sheet) {
  var headers = [
    "MaVatTu",       // A: Mã vật tư
    "TenVatTu",      // B: Tên vật tư
    "MaNhom",        // C: Nhóm vật tư
    "DonViTinh",     // D: Đơn vị tính
    "QuyCach",       // E: Quy cách đóng gói
    "HangSanXuat",   // F: Hãng sản xuất / Xuất xứ
    "TonToiThieu",   // G: Định mức tồn tối thiểu
    "TonHienTai",    // H: Tồn kho hiện tại
    "DonGia",        // I: Đơn giá (VNĐ)
    "HanSuDung",     // J: Hạn dùng (YYYY-MM-DD)
    "MaPhongBan",    // K: Phòng máy / Kho
    "GhiChu",        // L: Ghi chú bảo quản
    "CanhBaoTon",    // M: Cảnh báo tự động
    "ThanhTienTon"   // N: Tổng giá trị tồn
  ];

  // Nếu sheet trống thì ghi header
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
  } else {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }

  // Định dạng hàng tiêu đề
  var headerRange = sheet.getRange(1, 1, 1, headers.length);
  headerRange.setFontWeight("bold")
             .setFontColor("#FFFFFF")
             .setBackground("#1E40AF") // Màu xanh đậm y tế
             .setHorizontalAlignment("center")
             .setVerticalAlignment("middle");
  
  sheet.setRowHeight(1, 38);
  sheet.setFrozenRows(1);

  // Đặt độ rộng các cột tối ưu
  var colWidths = [120, 260, 120, 90, 180, 160, 110, 110, 120, 110, 130, 220, 130, 140];
  for (var i = 0; i < colWidths.length; i++) {
    sheet.setColumnWidth(i + 1, colWidths[i]);
  }
}

/**
 * 4. Hàm xử lý dữ liệu nhập từ giao diện UploadDialog
 * @param {Array<Object>} rowsData - Danh sách dòng vật tư đã parse từ Excel/CSV
 * @param {Object} options - Các tùy chọn (duplicateMode: 'update' | 'skip' | 'append')
 */
function processSuppliesImport(rowsData, options) {
  options = options || { duplicateMode: "update", autoGenerateCode: true };
  
  if (!rowsData || !Array.isArray(rowsData) || rowsData.length === 0) {
    return {
      success: false,
      message: "Tệp không chứa dữ liệu hoặc danh sách dòng trống!"
    };
  }

  var sheet = getOrCreateTargetSheet();
  var lastRow = sheet.getLastRow();
  
  // Đọc danh sách vật tư hiện có để kiểm tra trùng lặp
  var existingMap = {}; // key: code hoặc name -> rowIndex
  if (lastRow > 1) {
    var existingCodes = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
    for (var i = 0; i < existingCodes.length; i++) {
      var cCode = String(existingCodes[i][0] || "").trim().toUpperCase();
      var cName = String(existingCodes[i][1] || "").trim().toLowerCase();
      var rIdx = i + 2;
      if (cCode) existingMap["CODE:" + cCode] = rIdx;
      if (cName) existingMap["NAME:" + cName] = rIdx;
    }
  }

  var insertedCount = 0;
  var updatedCount = 0;
  var skippedCount = 0;
  var errorDetails = [];
  var newRowsToAppend = [];

  for (var idx = 0; idx < rowsData.length; idx++) {
    var item = rowsData[idx];
    var lineNum = idx + 2; // Số thứ tự theo file Excel (tính cả tiêu đề)

    // Chuẩn hóa tên trường
    var name = String(item.name || item.TenVatTu || item.ten_vat_tu || item.Ten || "").trim();
    if (!name) {
      errorDetails.push("Dòng " + lineNum + ": Bỏ qua vì thiếu Tên vật tư (TenVatTu)");
      skippedCount++;
      continue;
    }

    var code = String(item.code || item.MaVatTu || item.ma_vat_tu || "").trim().toUpperCase();
    if (!code && options.autoGenerateCode) {
      code = "VT-CĐHA-" + Utilities.formatDate(new Date(), "GMT+7", "yyMMdd") + "-" + String(idx + 1).padStart(3, "0");
    }

    var category = String(item.category || item.categoryId || item.MaNhom || item.nhom || "NHOM_CĐHA").trim();
    var unit = String(item.unit || item.DonViTinh || item.don_vi || "Cái").trim();
    var spec = String(item.specification || item.QuyCach || item.quy_cach || "").trim();
    var manufacturer = String(item.manufacturer || item.HangSanXuat || item.hang_sx || "").trim();
    
    // Xử lý số lượng an toàn
    var minStock = parseSafeNumber(item.minStock || item.TonToiThieu || item.min_stock, 0);
    var currentStock = parseSafeNumber(item.currentStock || item.TonHienTai || item.current_stock || item.ton_kho, 0);
    var price = parseSafeNumber(item.price || item.DonGia || item.don_gia, 0);
    
    // Xử lý ngày hạn dùng
    var expiry = parseSafeDate(item.expiryDate || item.HanSuDung || item.han_dung);
    var department = String(item.department || item.departmentId || item.MaPhongBan || item.phong_ban || "").trim();
    var note = String(item.note || item.GhiChu || item.ghi_chu || "").trim();

    // Kiểm tra trùng lặp
    var existingRowIdx = (code && existingMap["CODE:" + code]) || existingMap["NAME:" + name.toLowerCase()];

    if (existingRowIdx && options.duplicateMode === "skip") {
      skippedCount++;
      continue;
    }

    if (existingRowIdx && options.duplicateMode === "update") {
      // Cập nhật dòng hiện có
      var updateRange = sheet.getRange(existingRowIdx, 1, 1, 12);
      updateRange.setValues([[
        code,
        name,
        category,
        unit,
        spec,
        manufacturer,
        minStock,
        currentStock,
        price,
        expiry,
        department,
        note
      ]]);
      
      // Cập nhật công thức cảnh báo và thành tiền
      sheet.getRange(existingRowIdx, 13).setFormula('=IF(H' + existingRowIdx + '<=G' + existingRowIdx + ', "⚠️ CẦN NHẬP THÊM", "AN TOÀN")');
      sheet.getRange(existingRowIdx, 14).setFormula('=H' + existingRowIdx + '*I' + existingRowIdx);

      updatedCount++;
    } else {
      // Chuẩn bị thêm dòng mới
      var targetRowNum = lastRow + newRowsToAppend.length + 1;
      var alertFormula = '=IF(H' + targetRowNum + '<=G' + targetRowNum + ', "⚠️ CẦN NHẬP THÊM", "AN TOÀN")';
      var amountFormula = '=H' + targetRowNum + '*I' + targetRowNum;

      newRowsToAppend.push([
        code,
        name,
        category,
        unit,
        spec,
        manufacturer,
        minStock,
        currentStock,
        price,
        expiry,
        department,
        note,
        alertFormula,
        amountFormula
      ]);
      
      if (code) existingMap["CODE:" + code] = targetRowNum;
      existingMap["NAME:" + name.toLowerCase()] = targetRowNum;
      insertedCount++;
    }
  }

  // Ghi hàng loạt các dòng mới để đạt hiệu năng cao nhất (Batch writing)
  if (newRowsToAppend.length > 0) {
    sheet.getRange(lastRow + 1, 1, newRowsToAppend.length, 14).setValues(newRowsToAppend);
  }

  // Định dạng lại các cột số và tiền tệ
  var newTotalRows = sheet.getLastRow();
  if (newTotalRows > 1) {
    sheet.getRange(2, 7, newTotalRows - 1, 2).setNumberFormat("#,##0"); // Tồn kho
    sheet.getRange(2, 9, newTotalRows - 1, 1).setNumberFormat("#,##0 ₫"); // Đơn giá
    sheet.getRange(2, 10, newTotalRows - 1, 1).setNumberFormat("yyyy-MM-dd"); // Ngày
    sheet.getRange(2, 14, newTotalRows - 1, 1).setNumberFormat("#,##0 ₫"); // Thành tiền
    applyConditionalFormatting(sheet, newTotalRows);
  }

  return {
    success: true,
    totalRecords: rowsData.length,
    inserted: insertedCount,
    updated: updatedCount,
    skipped: skippedCount,
    errors: errorDetails,
    message: "Nhập thành công! Đã thêm mới " + insertedCount + ", cập nhật " + updatedCount + ", bỏ qua " + skippedCount + " dòng."
  };
}

/**
 * 5. Định dạng có điều kiện (Tô đỏ cảnh báo tồn, vàng sắp hết hạn)
 */
function applyConditionalFormatting(sheet, totalRows) {
  var stockRule = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=$H2<=$G2')
    .setBackground("#FEE2E2") // Đỏ nhạt
    .setFontColor("#B91C1C") // Chữ đỏ đậm
    .setRanges([sheet.getRange(2, 1, totalRows - 1, 14)])
    .build();

  var rules = sheet.getConditionalFormatRules();
  rules.push(stockRule);
  sheet.setConditionalFormatRules(rules);
}

/**
 * Hàm phụ trợ: Chuyển đổi số an toàn
 */
function parseSafeNumber(val, defaultVal) {
  if (val === undefined || val === null || val === "") return defaultVal;
  if (typeof val === "number") return isNaN(val) ? defaultVal : val;
  var cleaned = String(val).replace(/[^0-9.-]/g, "");
  var num = parseFloat(cleaned);
  return isNaN(num) ? defaultVal : num;
}

/**
 * Hàm phụ trợ: Chuẩn hóa ngày (YYYY-MM-DD)
 */
function parseSafeDate(val) {
  if (!val) return "";
  if (val instanceof Date) {
    return Utilities.formatDate(val, "GMT+7", "yyyy-MM-dd");
  }
  var s = String(val).trim();
  if (s.match(/^\\d{4}-\\d{2}-\\d{2}$/)) return s;
  
  // Hỗ trợ DD/MM/YYYY
  var match = s.match(/^(\\d{1,2})[\\/\\-\\.](\\d{1,2})[\\/\\-\\.](\\d{4})$/);
  if (match) {
    var d = match[1].padStart(2, "0");
    var m = match[2].padStart(2, "0");
    var y = match[3];
    return y + "-" + m + "-" + d;
  }
  return s;
}

/**
 * Làm mới toàn bộ công thức và kiểm tra cảnh báo tồn
 */
function refreshFormulasAndValidation() {
  var sheet = getOrCreateTargetSheet();
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) {
    SpreadsheetApp.getUi().alert("Chưa có dòng dữ liệu nào để cập nhật công thức!");
    return;
  }

  for (var r = 2; r <= lastRow; r++) {
    sheet.getRange(r, 13).setFormula('=IF(H' + r + '<=G' + r + ', "⚠️ CẦN NHẬP THÊM", "AN TOÀN")');
    sheet.getRange(r, 14).setFormula('=H' + r + '*I' + r);
  }
  SpreadsheetApp.getUi().alert("✅ Đã cập nhật lại toàn bộ công thức tính toán và cảnh báo tồn kho!");
}
`;

export const APPS_SCRIPT_UPLOAD_DIALOG_HTML = `<!DOCTYPE html>
<html>
<head>
  <base target="_top">
  <meta charset="utf-8">
  <!-- Tải Tailwind CSS & SheetJS CDN để đọc tệp Excel/CSV ngay trên trình duyệt -->
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js"></script>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    .drop-active { border-color: #2563eb !important; background-color: #eff6ff !important; }
  </style>
</head>
<body class="bg-slate-50 text-slate-800 p-5">
  <div class="max-w-xl mx-auto space-y-4">
    <!-- Header -->
    <div class="border-b pb-3">
      <h2 class="text-lg font-bold text-slate-900 flex items-center gap-2">
        <span class="w-2.5 h-2.5 rounded-full bg-blue-600"></span>
        Nhập Dữ Liệu Vật Tư CĐHA từ Excel / CSV
      </h2>
      <p class="text-xs text-slate-500 mt-0.5">
        Hỗ trợ các định dạng <b>.xlsx, .xls, .csv</b>. Dữ liệu sẽ tự động ghi vào trang tính <b>'Danh sách Vật tư'</b>.
      </p>
    </div>

    <!-- Drag & Drop Upload Zone -->
    <div 
      id="dropZone" 
      class="border-2 border-dashed border-slate-300 rounded-2xl p-6 text-center bg-white hover:border-blue-400 transition-all cursor-pointer"
      onclick="document.getElementById('fileInput').click()"
    >
      <input type="file" id="fileInput" accept=".xlsx, .xls, .csv" class="hidden" onchange="handleFileSelected(event)" />
      
      <div id="uploadPrompt" class="space-y-2">
        <svg class="w-10 h-10 mx-auto text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
        </svg>
        <div class="text-sm font-semibold text-slate-700">Kéo & thả tệp Excel/CSV vào đây hoặc <span class="text-blue-600 underline">chọn tệp</span></div>
        <p class="text-xs text-slate-400">Dung lượng tối đa 10MB (.xlsx, .xls, .csv)</p>
      </div>

      <div id="fileInfo" class="hidden space-y-1">
        <div class="inline-flex items-center gap-2 px-3 py-1 bg-blue-50 border border-blue-200 rounded-full text-blue-700 text-xs font-semibold">
          <span id="fileName">data.xlsx</span> (<span id="fileSize">0 KB</span>)
        </div>
        <p id="rowCount" class="text-xs text-emerald-600 font-medium">Đã phát hiện 0 dòng dữ liệu</p>
      </div>
    </div>

    <!-- Preview Table -->
    <div id="previewContainer" class="hidden border rounded-xl bg-white p-3 shadow-sm">
      <div class="flex items-center justify-between mb-2">
        <span class="text-xs font-bold uppercase tracking-wider text-slate-600">Xem trước 3 dòng đầu:</span>
        <span id="previewSheetName" class="text-[11px] font-mono text-blue-600 bg-blue-50 px-2 py-0.5 rounded">Sheet: DanhSach_VatTu</span>
      </div>
      <div class="overflow-x-auto max-h-36 border rounded text-xs">
        <table class="w-full text-left" id="previewTable">
          <thead class="bg-slate-100 text-slate-600 sticky top-0"></thead>
          <tbody class="divide-y divide-slate-100"></tbody>
        </table>
      </div>
    </div>

    <!-- Options -->
    <div class="grid grid-cols-2 gap-3 bg-white p-3.5 rounded-xl border text-xs">
      <div>
        <label class="font-semibold text-slate-700 block mb-1">Xử lý khi trùng Mã / Tên vật tư:</label>
        <select id="duplicateMode" class="w-full border rounded-lg p-2 bg-slate-50 outline-none">
          <option value="update" selected>Cập nhật số tồn & giá (Update)</option>
          <option value="skip">Bỏ qua dòng trùng (Skip)</option>
          <option value="append">Thêm mới thành dòng khác (Append)</option>
        </select>
      </div>
      <div>
        <label class="font-semibold text-slate-700 block mb-1">Tự động sinh mã nếu thiếu:</label>
        <select id="autoCode" class="w-full border rounded-lg p-2 bg-slate-50 outline-none">
          <option value="true" selected>Có (sinh mã tự động VT-CĐHA-...)</option>
          <option value="false">Không (để trống)</option>
        </select>
      </div>
    </div>

    <!-- Status & Progress -->
    <div id="statusMessage" class="hidden text-xs p-3 rounded-xl"></div>

    <!-- Action Buttons -->
    <div class="flex items-center justify-end gap-2.5 pt-2 border-t">
      <button 
        type="button" 
        onclick="google.script.host.close()" 
        class="px-4 py-2 border rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
      >
        Đóng
      </button>
      <button 
        id="btnImport" 
        disabled 
        onclick="startImportProcess()" 
        class="px-5 py-2.5 bg-blue-600 text-white rounded-xl text-xs font-bold shadow-md shadow-blue-500/20 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 transition-all"
      >
        <span id="btnText">Tiến hành Nhập Dữ Liệu</span>
      </button>
    </div>
  </div>

  <script>
    var parsedRowsData = [];

    // Drag & Drop Listeners
    var dropZone = document.getElementById('dropZone');
    ['dragenter', 'dragover'].forEach(function(eventName) {
      dropZone.addEventListener(eventName, function(e) {
        e.preventDefault();
        dropZone.classList.add('drop-active');
      }, false);
    });
    ['dragleave', 'drop'].forEach(function(eventName) {
      dropZone.addEventListener(eventName, function(e) {
        e.preventDefault();
        dropZone.classList.remove('drop-active');
      }, false);
    });
    dropZone.addEventListener('drop', function(e) {
      var dt = e.dataTransfer;
      var files = dt.files;
      if (files.length > 0) {
        processSelectedFile(files[0]);
      }
    });

    function handleFileSelected(e) {
      var file = e.target.files[0];
      if (file) processSelectedFile(file);
    }

    function processSelectedFile(file) {
      var ext = file.name.split('.').pop().toLowerCase();
      if (!['xlsx', 'xls', 'csv'].includes(ext)) {
        showStatus('Lỗi: Định dạng tệp không được hỗ trợ! Vui lòng chọn tệp .xlsx, .xls hoặc .csv', 'error');
        return;
      }

      document.getElementById('fileName').innerText = file.name;
      document.getElementById('fileSize').innerText = Math.round(file.size / 1024) + ' KB';
      document.getElementById('uploadPrompt').classList.add('hidden');
      document.getElementById('fileInfo').classList.remove('hidden');

      var reader = new FileReader();
      reader.onload = function(evt) {
        try {
          var data = evt.target.result;
          var workbook;
          if (ext === 'csv') {
            workbook = XLSX.read(data, { type: 'string' });
          } else {
            workbook = XLSX.read(data, { type: 'binary' });
          }

          // Chọn sheet phù hợp (ưu tiên sheet chứa từ 'DanhSach', 'VatTu')
          var targetSheetName = workbook.SheetNames.find(function(n) {
            var lower = n.toLowerCase();
            return lower.includes('danhsach') || lower.includes('vattu') || lower.includes('items');
          }) || workbook.SheetNames[0];

          var worksheet = workbook.Sheets[targetSheetName];
          var rawJson = XLSX.utils.sheet_to_json(worksheet);

          if (!rawJson || rawJson.length === 0) {
            showStatus('Cảnh báo: Tệp không có dòng dữ liệu nào!', 'warning');
            document.getElementById('btnImport').disabled = true;
            return;
          }

          parsedRowsData = rawJson;
          document.getElementById('rowCount').innerText = '✅ Đã đọc thành công ' + parsedRowsData.length + ' dòng vật tư từ trang "' + targetSheetName + '"';
          document.getElementById('previewSheetName').innerText = 'Sheet: ' + targetSheetName;
          
          renderPreview(rawJson.slice(0, 3));
          document.getElementById('btnImport').disabled = false;
          showStatus('Sẵn sàng nhập dữ liệu. Nhấn "Tiến hành Nhập Dữ Liệu" bên dưới.', 'info');
        } catch (err) {
          showStatus('Lỗi khi đọc tệp Excel/CSV: ' + err.message, 'error');
          document.getElementById('btnImport').disabled = true;
        }
      };

      if (ext === 'csv') {
        reader.readAsText(file);
      } else {
        reader.readAsBinaryString(file);
      }
    }

    function renderPreview(previewRows) {
      if (!previewRows || previewRows.length === 0) return;
      var container = document.getElementById('previewContainer');
      var thead = document.querySelector('#previewTable thead');
      var tbody = document.querySelector('#previewTable tbody');
      
      var headers = Object.keys(previewRows[0]).slice(0, 6); // Lấy 6 cột đầu để hiển thị
      thead.innerHTML = '<tr>' + headers.map(function(h) { return '<th class="p-2 font-semibold">' + h + '</th>'; }).join('') + '</tr>';
      
      tbody.innerHTML = previewRows.map(function(row) {
        return '<tr>' + headers.map(function(h) {
          return '<td class="p-2 border-t">' + (row[h] !== undefined ? row[h] : '') + '</td>';
        }).join('') + '</tr>';
      }).join('');

      container.classList.remove('hidden');
    }

    function startImportProcess() {
      if (!parsedRowsData || parsedRowsData.length === 0) {
        showStatus('Chưa có dữ liệu để nhập!', 'error');
        return;
      }

      var duplicateMode = document.getElementById('duplicateMode').value;
      var autoGenerateCode = document.getElementById('autoCode').value === 'true';

      document.getElementById('btnImport').disabled = true;
      document.getElementById('btnText').innerText = 'Đang ghi vào trang tính...';
      showStatus('Đang gửi ' + parsedRowsData.length + ' dòng dữ liệu vào Google Sheets. Vui lòng chờ...', 'info');

      // Gọi hàm phía server Google Apps Script
      google.script.run
        .withSuccessHandler(function(response) {
          document.getElementById('btnImport').disabled = false;
          document.getElementById('btnText').innerText = 'Hoàn tất';
          if (response && response.success) {
            showStatus(response.message, 'success');
            setTimeout(function() {
              google.script.host.close();
            }, 3500);
          } else {
            showStatus('Lỗi: ' + (response ? response.message : 'Không xác định'), 'error');
          }
        })
        .withFailureHandler(function(error) {
          document.getElementById('btnImport').disabled = false;
          document.getElementById('btnText').innerText = 'Thử lại';
          showStatus('Lỗi thực thi Apps Script: ' + error.message, 'error');
        })
        .processSuppliesImport(parsedRowsData, {
          duplicateMode: duplicateMode,
          autoGenerateCode: autoGenerateCode
        });
    }

    function showStatus(text, type) {
      var box = document.getElementById('statusMessage');
      box.classList.remove('hidden', 'bg-blue-50', 'text-blue-700', 'bg-emerald-50', 'text-emerald-700', 'bg-red-50', 'text-red-700', 'bg-amber-50', 'text-amber-700');
      
      if (type === 'success') {
        box.classList.add('bg-emerald-50', 'text-emerald-700', 'border', 'border-emerald-200');
      } else if (type === 'error') {
        box.classList.add('bg-red-50', 'text-red-700', 'border', 'border-red-200');
      } else if (type === 'warning') {
        box.classList.add('bg-amber-50', 'text-amber-700', 'border', 'border-amber-200');
      } else {
        box.classList.add('bg-blue-50', 'text-blue-700', 'border', 'border-blue-200');
      }
      box.innerText = text;
    }
  </script>
</body>
</html>
`;

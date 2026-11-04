import * as XLSX from 'xlsx';

export interface SheetColumnDef {
  name: string;
  field: string;
  type: string;
  required: boolean;
  example: string;
  description: string;
}

export interface SheetStructureDef {
  sheetName: string;
  title: string;
  description: string;
  columns: SheetColumnDef[];
  formulas?: { name: string; formula: string; description: string }[];
  validations?: { column: string; rule: string; source: string }[];
  conditionalFormatting?: { rule: string; color: string; description: string }[];
}

export const DIAGNOSTIC_IMAGING_SHEETS_SPEC: SheetStructureDef[] = [
  {
    sheetName: 'DanhMuc_VatTu',
    title: '1. Danh mục Nhóm Vật tư CĐHA',
    description: 'Bảng quản lý các nhóm/chủng loại vật tư y tế trong khoa Chẩn đoán hình ảnh (X-quang, CT, MRI, Siêu âm, DSA, Tiêu hao chung).',
    columns: [
      { name: 'MaNhom', field: 'code', type: 'Văn bản (Mã)', required: true, example: 'NHOM_XQ', description: 'Mã nhóm vật tư duy nhất, viết hoa không dấu' },
      { name: 'TenNhom', field: 'name', type: 'Văn bản', required: true, example: 'Vật tư X-Quang kỹ thuật số', description: 'Tên đầy đủ của nhóm vật tư' },
      { name: 'MoTa', field: 'description', type: 'Văn bản', required: false, example: 'Phim khô, túi đựng phim, hóa chất liên quan', description: 'Mô tả chi tiết phạm vi nhóm vật tư' },
      { name: 'TrangThai', field: 'status', type: 'Dropdown', required: true, example: 'Hoạt động', description: 'Trạng thái: Hoạt động / Tạm ngừng' }
    ],
    validations: [
      { column: 'TrangThai', rule: 'Danh sách giá trị', source: '"Hoạt động, Tạm ngừng"' }
    ]
  },
  {
    sheetName: 'DanhSach_VatTu',
    title: '2. Danh sách Vật tư Chi tiết',
    description: 'Bảng tổng hợp toàn bộ vật tư y tế khoa Chẩn đoán hình ảnh với thông số kỹ thuật, quy cách đóng gói, tồn kho an toàn và hạn dùng.',
    columns: [
      { name: 'MaVatTu', field: 'code', type: 'Văn bản (Mã)', required: true, example: 'VT-CT-001', description: 'Mã vật tư chuẩn hóa định danh duy nhất' },
      { name: 'TenVatTu', field: 'name', type: 'Văn bản', required: true, example: 'Thuốc cản quang Omnipaque 350mgI/ml 100ml', description: 'Tên hoạt chất, biệt dược hoặc tên thương mại của vật tư' },
      { name: 'MaNhom', field: 'categoryId', type: 'Khóa ngoại', required: true, example: 'NHOM_CT', description: 'Liên kết tới MaNhom trong trang DanhMuc_VatTu' },
      { name: 'DonViTinh', field: 'unit', type: 'Văn bản (ĐVT)', required: true, example: 'Chai', description: 'Đơn vị đo lường: Hộp, Chai, Cuộn, Cái, Bộ, Lọ, Túi...' },
      { name: 'QuyCach', field: 'specification', type: 'Văn bản', required: false, example: 'Hộp 10 chai x 100ml', description: 'Quy cách đóng gói của nhà sản xuất' },
      { name: 'HangSanXuat', field: 'manufacturer', type: 'Văn bản', required: false, example: 'GE Healthcare - Ireland', description: 'Hãng sản xuất và nước xuất xứ' },
      { name: 'TonToiThieu', field: 'minStock', type: 'Số nguyên (>=0)', required: true, example: '20', description: 'Định mức tồn an toàn tối thiểu cảnh báo cần nhập bổ sung' },
      { name: 'TonHienTai', field: 'currentStock', type: 'Số nguyên (>=0)', required: true, example: '45', description: 'Số lượng thực tế còn trong kho tại thời điểm hiện tại' },
      { name: 'DonGia', field: 'price', type: 'Số tiền (VNĐ)', required: false, example: '650000', description: 'Đơn giá thầu hoặc giá nhập gần nhất' },
      { name: 'HanSuDung', field: 'expiryDate', type: 'Ngày (YYYY-MM-DD)', required: false, example: '2027-12-31', description: 'Hạn dùng gần nhất của lô hàng' },
      { name: 'MaPhongBan', field: 'departmentId', type: 'Khóa ngoại', required: false, example: 'PB_CT01', description: 'Phòng máy sử dụng chính hoặc Kho tổng' },
      { name: 'GhiChu', field: 'note', type: 'Văn bản', required: false, example: 'Bảo quản nhiệt độ dưới 30°C, tránh ánh sáng trực tiếp', description: 'Điều kiện bảo quản đặc biệt, quy trình sử dụng' }
    ],
    formulas: [
      { name: 'Cảnh báo mức tồn', formula: '=IF(H2<=G2, "⚠️ CẦN NHẬP THÊM", "AN TOÀN")', description: 'Tự động cảnh báo nếu Tồn hiện tại (cột H) <= Tồn tối thiểu (cột G)' },
      { name: 'Tính tổng giá trị tồn kho', formula: '=H2*I2', description: 'Thành tiền tồn kho = Tồn hiện tại * Đơn giá' }
    ],
    validations: [
      { column: 'MaNhom', rule: 'Dải ô dữ liệu', source: "='DanhMuc_VatTu'!$A$2:$A" },
      { column: 'MaPhongBan', rule: 'Dải ô dữ liệu', source: "='PhongBan'!$A$2:$A" }
    ],
    conditionalFormatting: [
      { rule: 'TonHienTai <= TonToiThieu', color: 'bg-red-100 text-red-700', description: 'Tô nền đỏ nhạt cho các mặt hàng chạm ngưỡng tồn tối thiểu' },
      { rule: 'HanSuDung <= TODAY() + 90', color: 'bg-amber-100 text-amber-700', description: 'Tô nền vàng cam cho vật tư sắp hết hạn dưới 90 ngày' }
    ]
  },
  {
    sheetName: 'PhongBan',
    title: '3. Phòng Ban & Phòng Máy CĐHA',
    description: 'Danh sách các phòng máy chuyên dụng, modality chẩn đoán hình ảnh và các điểm lưu trữ vật tư.',
    columns: [
      { name: 'MaPhongBan', field: 'code', type: 'Văn bản (Mã)', required: true, example: 'PB_CT01', description: 'Mã định danh phòng máy / kho duy nhất' },
      { name: 'TenPhongBan', field: 'name', type: 'Văn bản', required: true, example: 'Phòng Cắt lớp vi tính (CT Scanner 128)', description: 'Tên đầy đủ của phòng máy hoặc kho' },
      { name: 'LoaiThietBi', field: 'deviceType', type: 'Dropdown', required: true, example: 'Cắt lớp vi tính (CT)', description: 'Chủng loại: X-quang, CLVT/CT, MRI, Siêu âm, DSA, Kho trung tâm' },
      { name: 'NguoiPhuTrach', field: 'manager', type: 'Văn bản', required: false, example: 'KTV Trưởng Nguyễn Văn An', description: 'Cán bộ kỹ thuật hoặc bác sĩ phụ trách máy' },
      { name: 'ViTri', field: 'location', type: 'Văn bản', required: false, example: 'Tầng 1 - Tòa nhà A (Khu CĐHA)', description: 'Vị trí địa lý trong bệnh viện' },
      { name: 'GhiChu', field: 'note', type: 'Văn bản', required: false, example: 'Trang bị 01 máy tiêm điện đôi Medrad', description: 'Ghi chú thiết bị đi kèm' }
    ],
    validations: [
      { column: 'LoaiThietBi', rule: 'Danh sách giá trị', source: '"X-quang, Cắt lớp vi tính (CT), Cộng hưởng từ (MRI), Siêu âm, Can thiệp mạch (DSA), Kho trung tâm, Khác"' }
    ]
  },
  {
    sheetName: 'LichSu_XuatNhap',
    title: '4. Sổ Theo Dõi Xuất - Nhập - Tồn (Transactions)',
    description: 'Nhật ký toàn bộ các giao dịch xuất kho, nhập kho, điều chuyển giữa các phòng máy và kiểm kê điều chỉnh số dư.',
    columns: [
      { name: 'MaPhieu', field: 'code', type: 'Văn bản (Mã)', required: true, example: 'PN20260901-001', description: 'Mã số phiếu nhập/xuất tự động theo ngày' },
      { name: 'NgayThucHien', field: 'timestamp', type: 'Ngày giờ', required: true, example: '2026-09-28 09:30', description: 'Thời điểm phát sinh giao dịch xuất nhập' },
      { name: 'LoaiGiaoDich', field: 'type', type: 'Dropdown', required: true, example: 'Nhập kho', description: 'Loại: Nhập kho (IN), Xuất sử dụng (OUT), Chuyển phòng (TRANSFER), Kiểm kê (AUDIT)' },
      { name: 'MaVatTu', field: 'itemId', type: 'Khóa ngoại', required: true, example: 'VT-CT-001', description: 'Mã vật tư phát sinh giao dịch' },
      { name: 'TenVatTu', field: 'itemName', type: 'Tự động tra cứu', required: false, example: 'Thuốc cản quang Omnipaque 350mgI/ml', description: 'Tên vật tư (lấy từ VLOOKUP theo MaVatTu)' },
      { name: 'SoLuong', field: 'quantity', type: 'Số nguyên (>0)', required: true, example: '20', description: 'Số lượng vật tư luân chuyển' },
      { name: 'DonGia', field: 'unitPrice', type: 'Số tiền', required: false, example: '650000', description: 'Đơn giá tại thời điểm giao dịch' },
      { name: 'ThanhTien', field: 'totalAmount', type: 'Công thức', required: false, example: '13000000', description: 'Thành tiền = SoLuong * DonGia' },
      { name: 'TuPhongBan', field: 'fromDeptId', type: 'Khóa ngoại', required: false, example: 'KHO_TONG', description: 'Nơi xuất (Kho tổng, phòng chuyển)' },
      { name: 'DenPhongBan', field: 'toDeptId', type: 'Khóa ngoại', required: false, example: 'PB_CT01', description: 'Nơi nhận (Phòng máy, Bệnh nhân, hoặc Kho nhận)' },
      { name: 'SoLo', field: 'batchNumber', type: 'Văn bản', required: false, example: 'LOT-24G08', description: 'Số lô sản xuất của nhà cung cấp' },
      { name: 'HanDung', field: 'batchExpiry', type: 'Ngày (YYYY-MM-DD)', required: false, example: '2027-12-31', description: 'Hạn sử dụng cụ thể của lô hàng giao dịch' },
      { name: 'NguoiThucHien', field: 'performer', type: 'Văn bản', required: false, example: 'KTV Trần Thị Bình', description: 'Nhân viên thực hiện thao tác xuất nhập' },
      { name: 'LyDo_GhiChu', field: 'note', type: 'Văn bản', required: false, example: 'Xuất sử dụng cho các ca chụp CLVT lồng ngực và ổ bụng ca trực sáng', description: 'Lý do cụ thể hoặc số bệnh án liên quan' }
    ],
    formulas: [
      { name: 'Tự động điền Tên vật tư', formula: '=IFERROR(VLOOKUP(D2, \'DanhSach_VatTu\'!$A$2:$B, 2, FALSE), "")', description: 'Tự động lấy tên vật tư từ mã vật tư cột D' },
      { name: 'Tự động tính Thành tiền', formula: '=F2*G2', description: 'Thành tiền = Số lượng (cột F) * Đơn giá (cột G)' }
    ],
    validations: [
      { column: 'LoaiGiaoDich', rule: 'Danh sách giá trị', source: '"Nhập kho, Xuất sử dụng, Chuyển phòng, Kiểm kê"' },
      { column: 'MaVatTu', rule: 'Dải ô dữ liệu', source: "='DanhSach_VatTu'!$A$2:$A" },
      { column: 'TuPhongBan', rule: 'Dải ô dữ liệu', source: "='PhongBan'!$A$2:$A" },
      { column: 'DenPhongBan', rule: 'Dải ô dữ liệu', source: "='PhongBan'!$A$2:$A" }
    ]
  },
  {
    sheetName: 'NguoiDung',
    title: '5. Người Dùng & Phân Quyền Cán Bộ',
    description: 'Quản lý tài khoản đăng nhập, số điện thoại, vai trò và phân quyền thao tác trên hệ thống CĐHA.',
    columns: [
      { name: 'MaNguoiDung', field: 'code', type: 'Văn bản (Mã)', required: true, example: 'NV-001', description: 'Mã số nhân viên hoặc mã cán bộ bệnh viện' },
      { name: 'HoTen', field: 'name', type: 'Văn bản', required: true, example: 'Nguyễn Văn Mạnh', description: 'Họ và tên đầy đủ của cán bộ y tế' },
      { name: 'Email', field: 'email', type: 'Email', required: true, example: 'manhha2@gmail.com', description: 'Địa chỉ Gmail dùng để đăng nhập hệ thống' },
      { name: 'SoDienThoai', field: 'phone', type: 'Số điện thoại', required: false, example: '0912345678', description: 'Số điện thoại di động liên hệ công việc' },
      { name: 'VaiTro', field: 'role', type: 'Dropdown', required: true, example: 'Quản trị viên', description: 'Vai trò: Quản trị viên (Admin), Thủ kho (ThuKho), Kỹ thuật viên (KyThuatVien), Bác sĩ (BacSi), Người xem (Xem)' },
      { name: 'PhongBanId', field: 'departmentId', type: 'Khóa ngoại', required: false, example: 'PB_CT01', description: 'Phòng máy công tác chính hoặc Kho' },
      { name: 'TrangThai', field: 'status', type: 'Dropdown', required: true, example: 'Hoạt động', description: 'Trạng thái hoạt động: Hoạt động / Tạm khóa' }
    ],
    validations: [
      { column: 'VaiTro', rule: 'Danh sách giá trị', source: '"Quản trị viên, Quản lý kho, Kỹ thuật viên CĐHA, Bác sĩ chẩn đoán, Người xem"' },
      { column: 'TrangThai', rule: 'Danh sách giá trị', source: '"Hoạt động, Tạm khóa"' },
      { column: 'PhongBanId', rule: 'Dải ô dữ liệu', source: "='PhongBan'!$A$2:$A" }
    ]
  }
];

// Sample standard Diagnostic Imaging Dataset for the template
export const SAMPLE_CDHA_DATA = {
  categories: [
    { code: 'NHOM_XQ', name: 'Phim X-Quang & Hóa chất', description: 'Phim khô laser y tế, túi đựng phim, gel rửa', status: 'Hoạt động' },
    { code: 'NHOM_CT', name: 'Vật tư Cắt lớp vi tính (CT)', description: 'Thuốc cản quang iod, dây nối áp lực cao, kim tiêm điện', status: 'Hoạt động' },
    { code: 'NHOM_MRI', name: 'Vật tư Cộng hưởng từ (MRI)', description: 'Thuốc cản từ Gadolinium, tai nghe chống ồn, bông bịt tai phi từ tính', status: 'Hoạt động' },
    { code: 'NHOM_SA', name: 'Vật tư Siêu âm', description: 'Gel siêu âm y tế, bao bọc đầu dò vô trùng, giấy in siêu âm nhiệt', status: 'Hoạt động' },
    { code: 'NHOM_DSA', name: 'Vật tư Can thiệp mạch (DSA)', description: 'Ống thông dẫn đường (Catheter), dây dẫn (Guide wire), kim chọc mạch, stent', status: 'Hoạt động' },
    { code: 'NHOM_VTHC', name: 'Vật tư Tiêu hao chung', description: 'Găng tay vô trùng, bơm tiêm các cỡ, cồn sát khuẩn, gạc y tế', status: 'Hoạt động' }
  ],
  departments: [
    { code: 'KHO_TONG', name: 'Kho Vật tư Trung tâm CĐHA', deviceType: 'Kho trung tâm', manager: 'Thủ kho Nguyễn Thị Mai', location: 'Tầng hầm B1 - Nhà Kỹ thuật', note: 'Kho lưu trữ và cấp phát chính' },
    { code: 'PB_XQ01', name: 'Phòng chụp X-quang KTS 1', deviceType: 'X-quang', manager: 'KTV Phạm Văn Tuấn', location: 'Tầng 1 - Khoa CĐHA', note: 'Máy X-quang treo trần Shimadzu' },
    { code: 'PB_XQ02', name: 'Phòng chụp X-quang KTS 2', deviceType: 'X-quang', manager: 'KTV Lê Văn Huy', location: 'Tầng 1 - Khoa CĐHA', note: 'Máy X-quang cao tần Philips' },
    { code: 'PB_CT01', name: 'Phòng Cắt lớp vi tính (CT 128 lát)', deviceType: 'Cắt lớp vi tính (CT)', manager: 'KTV Trưởng Nguyễn Văn An', location: 'Tầng 1 - Khu CĐHA', note: 'Trang bị 01 máy tiêm điện đôi Medrad' },
    { code: 'PB_MRI01', name: 'Phòng Cộng hưởng từ (MRI 1.5 Tesla)', deviceType: 'Cộng hưởng từ (MRI)', manager: 'KTV Hoàng Minh Đức', location: 'Tầng trệt - Phòng cách từ', note: 'Hệ thống GE Signa Creator 1.5T' },
    { code: 'PB_SA01', name: 'Phòng Siêu âm Tổng quát & Doppler', deviceType: 'Siêu âm', manager: 'BS Đỗ Thu Hà', location: 'Tầng 2 - Phòng 204', note: 'Máy siêu âm GE Logiq E9 & Samsung WS80A' },
    { code: 'PB_DSA01', name: 'Phòng Can thiệp tim mạch & DSA', deviceType: 'Can thiệp mạch (DSA)', manager: 'BS CKII Vũ Tiến Long', location: 'Tầng 3 - Khu Phẫu thuật', note: 'Hệ thống can thiệp mạch Siemens Artis Zee' }
  ],
  items: [
    {
      code: 'VT-XQ-001',
      name: 'Phim X-quang khô kỹ thuật số DI-HL 35x43cm',
      categoryCode: 'NHOM_XQ',
      unit: 'Hộp',
      specification: 'Hộp 100 tấm (14x17 inch)',
      manufacturer: 'Fujifilm - Nhật Bản',
      minStock: 15,
      currentStock: 42,
      price: 2450000,
      expiryDate: '2028-06-30',
      deptCode: 'PB_XQ01',
      note: 'Bảo quản nhiệt độ 10-23°C, độ ẩm 30-65%'
    },
    {
      code: 'VT-XQ-002',
      name: 'Phim X-quang khô kỹ thuật số DI-HL 20x25cm',
      categoryCode: 'NHOM_XQ',
      unit: 'Hộp',
      specification: 'Hộp 150 tấm (8x10 inch)',
      manufacturer: 'Fujifilm - Nhật Bản',
      minStock: 10,
      currentStock: 28,
      price: 1850000,
      expiryDate: '2028-08-15',
      deptCode: 'PB_XQ02',
      note: 'Dùng in phim chụp xương chi, khớp nhỏ'
    },
    {
      code: 'VT-CT-001',
      name: 'Thuốc cản quang Omnipaque 350mgI/ml 100ml',
      categoryCode: 'NHOM_CT',
      unit: 'Chai',
      specification: 'Chai thủy tinh 100ml (Hộp 10 chai)',
      manufacturer: 'GE Healthcare - Ireland',
      minStock: 25,
      currentStock: 65,
      price: 680000,
      expiryDate: '2027-11-20',
      deptCode: 'PB_CT01',
      note: 'Bảo quản dưới 30°C, tránh ánh sáng'
    },
    {
      code: 'VT-CT-002',
      name: 'Thuốc cản quang Ultravist 370 100ml',
      categoryCode: 'NHOM_CT',
      unit: 'Chai',
      specification: 'Chai 100ml',
      manufacturer: 'Bayer - CHLB Đức',
      minStock: 20,
      currentStock: 18, // Sắp hết hàng cảnh báo
      price: 720000,
      expiryDate: '2027-09-15',
      deptCode: 'PB_CT01',
      note: 'Dùng cho chụp CT mạch máu có tiêm áp lực cao'
    },
    {
      code: 'VT-CT-003',
      name: 'Dây nối áp lực cao máy tiêm điện CT 150cm',
      categoryCode: 'NHOM_CT',
      unit: 'Sợi',
      specification: 'Áp lực chịu đựng 300 PSI, van 1 chiều',
      manufacturer: 'Bayer Medrad - Mỹ',
      minStock: 50,
      currentStock: 120,
      price: 45000,
      expiryDate: '2029-01-01',
      deptCode: 'PB_CT01',
      note: 'Sử dụng 1 lần cho từng bệnh nhân'
    },
    {
      code: 'VT-CT-004',
      name: 'Xy-lanh đôi tiêm cản quang CT 200ml/200ml',
      categoryCode: 'NHOM_CT',
      unit: 'Bộ',
      specification: 'Bộ gồm 2 xilanh 200ml + dây hút thuốc',
      manufacturer: 'Nemoto Kyorindo - Nhật Bản',
      minStock: 30,
      currentStock: 55,
      price: 185000,
      expiryDate: '2028-12-31',
      deptCode: 'PB_CT01',
      note: 'Dùng tương thích máy tiêm Dual Shot'
    },
    {
      code: 'VT-MRI-001',
      name: 'Thuốc cản từ Dotarem 0.5mmol/ml 15ml',
      categoryCode: 'NHOM_MRI',
      unit: 'Lọ',
      specification: 'Lọ thủy tinh 15ml tiệt trùng',
      manufacturer: 'Guerbet - Pháp',
      minStock: 15,
      currentStock: 34,
      price: 1150000,
      expiryDate: '2027-10-10',
      deptCode: 'PB_MRI01',
      note: 'Bảo quản nhiệt độ phòng, tránh nhiễm từ'
    },
    {
      code: 'VT-SA-001',
      name: 'Gel bôi siêu âm y tế Parker Aquasonic 5000ml',
      categoryCode: 'NHOM_SA',
      unit: 'Can',
      specification: 'Can 5 lít kèm bình chiết 250ml',
      manufacturer: 'Parker Laboratories - Mỹ',
      minStock: 8,
      currentStock: 14,
      price: 320000,
      expiryDate: '2028-05-30',
      deptCode: 'PB_SA01',
      note: 'Độ truyền âm cao, không gây kích ứng da'
    },
    {
      code: 'VT-SA-002',
      name: 'Giấy in siêu âm đen trắng nhiệt UPP-110HD',
      categoryCode: 'NHOM_SA',
      unit: 'Cuộn',
      specification: 'Khổ 110mm x 20m (Độ nét cao Type II)',
      manufacturer: 'Sony - Nhật Bản',
      minStock: 20,
      currentStock: 19, // Cảnh báo tồn
      price: 195000,
      expiryDate: '2029-12-31',
      deptCode: 'PB_SA01',
      note: 'Bảo quản nơi khô ráo, tránh nhiệt và ánh sáng'
    },
    {
      code: 'VT-DSA-001',
      name: 'Dây dẫn đường can thiệp Hydrophilic Guide Wire 0.035"',
      categoryCode: 'NHOM_DSA',
      unit: 'Sợi',
      specification: 'Đường kính 0.035 inch, dài 150cm, đầu J',
      manufacturer: 'Terumo - Nhật Bản',
      minStock: 10,
      currentStock: 22,
      price: 850000,
      expiryDate: '2028-04-12',
      deptCode: 'PB_DSA01',
      note: 'Dùng trong chụp và can thiệp mạch máu ngoại biên'
    },
    {
      code: 'VT-DSA-002',
      name: 'Ống thông chụp mạch can thiệp Judkins Right (JR 4.0 5F)',
      categoryCode: 'NHOM_DSA',
      unit: 'Cái',
      specification: 'Kích thước 5F, dài 100cm, đầu uốn cong',
      manufacturer: 'Cordis - Mỹ',
      minStock: 12,
      currentStock: 26,
      price: 490000,
      expiryDate: '2028-09-30',
      deptCode: 'PB_DSA01',
      note: 'Chụp mạch vành phải qua đường động mạch quay/đùi'
    },
    {
      code: 'VT-VTHC-001',
      name: 'Kim luồn tĩnh mạch cánh bướm BD Angiocath 18G',
      categoryCode: 'NHOM_VTHC',
      unit: 'Hộp',
      specification: 'Hộp 50 cây, kim phủ silicon trơn',
      manufacturer: 'Becton Dickinson (BD) - Mỹ',
      minStock: 15,
      currentStock: 38,
      price: 360000,
      expiryDate: '2029-03-31',
      deptCode: 'KHO_TONG',
      note: 'Dùng đặt đường truyền tiêm cản quang áp lực cao'
    },
    {
      code: 'VT-VTHC-002',
      name: 'Găng tay y tế phẫu thuật tiệt trùng số 7.5',
      categoryCode: 'NHOM_VTHC',
      unit: 'Hộp',
      specification: 'Hộp 50 đôi (vô trùng từng đôi)',
      manufacturer: 'Top Glove - Malaysia',
      minStock: 25,
      currentStock: 80,
      price: 280000,
      expiryDate: '2028-11-15',
      deptCode: 'KHO_TONG',
      note: 'Găng phủ bột y tế USP tiệt trùng bằng tia Gamma'
    }
  ],
  transactions: [
    {
      code: 'PN20260901-001',
      date: '2026-09-01 08:30',
      type: 'Nhập kho',
      itemCode: 'VT-CT-001',
      quantity: 50,
      unitPrice: 680000,
      fromDept: 'Nhà cung cấp GE',
      toDept: 'KHO_TONG',
      batch: 'LOT-24G08',
      expiry: '2027-11-20',
      performer: 'Thủ kho Nguyễn Thị Mai',
      note: 'Nhập kho định kỳ gói thầu Q3/2026'
    },
    {
      code: 'PX20260905-002',
      date: '2026-09-05 14:15',
      type: 'Chuyển phòng',
      itemCode: 'VT-CT-001',
      quantity: 15,
      unitPrice: 680000,
      fromDept: 'KHO_TONG',
      toDept: 'PB_CT01',
      batch: 'LOT-24G08',
      expiry: '2027-11-20',
      performer: 'KTV Trưởng Nguyễn Văn An',
      note: 'Cấp phát cho tủ trực phòng chụp CT Scanner'
    },
    {
      code: 'PX20260920-003',
      date: '2026-09-20 09:45',
      type: 'Xuất sử dụng',
      itemCode: 'VT-XQ-001',
      quantity: 5,
      unitPrice: 2450000,
      fromDept: 'PB_XQ01',
      toDept: 'Bệnh nhân điều trị',
      batch: 'LOT-DIHL-24A',
      expiry: '2028-06-30',
      performer: 'KTV Phạm Văn Tuấn',
      note: 'In phim chụp X-quang phổi và cột sống ca sáng'
    },
    {
      code: 'PK20260925-004',
      date: '2026-09-25 16:00',
      type: 'Kiểm kê',
      itemCode: 'VT-SA-002',
      quantity: 2,
      unitPrice: 195000,
      fromDept: 'PB_SA01',
      toDept: 'PB_SA01',
      batch: 'LOT-SN2309',
      expiry: '2029-12-31',
      performer: 'BS Đỗ Thu Hà',
      note: 'Điều chỉnh số lượng kiểm kê thực tế khớp sổ sách'
    }
  ],
  users: [
    {
      code: 'NV-001',
      name: 'Nguyễn Văn Mạnh',
      email: 'manhha2@gmail.com',
      phone: '0912345678',
      role: 'Quản trị viên',
      department: 'KHO_TONG',
      status: 'Hoạt động'
    },
    {
      code: 'NV-002',
      name: 'Nguyễn Văn An',
      email: 'ktv.an@hospital.gov.vn',
      phone: '0987654321',
      role: 'Kỹ thuật viên CĐHA',
      department: 'PB_CT01',
      status: 'Hoạt động'
    },
    {
      code: 'NV-003',
      name: 'Nguyễn Thị Mai',
      email: 'thukho.mai@hospital.gov.vn',
      phone: '0903112233',
      role: 'Quản lý kho',
      department: 'KHO_TONG',
      status: 'Hoạt động'
    },
    {
      code: 'NV-004',
      name: 'Đỗ Thu Hà',
      email: 'bs.ha@hospital.gov.vn',
      phone: '0934567890',
      role: 'Bác sĩ chẩn đoán',
      department: 'PB_SA01',
      status: 'Hoạt động'
    },
    {
      code: 'NV-005',
      name: 'Lê Hoàng Nam',
      email: 'nam.viewer@hospital.gov.vn',
      phone: '0977889900',
      role: 'Người xem',
      department: 'PB_XQ01',
      status: 'Hoạt động'
    }
  ]
};

/**
 * Downloads a standardized 5-sheet workbook (.xlsx) ready to import into Google Drive and open with Google Sheets
 */
export function downloadStandardDiagnosticImagingTemplate() {
  const wb = XLSX.utils.book_new();

  // 1. Sheet: DanhMuc_VatTu
  const catRows = SAMPLE_CDHA_DATA.categories.map(c => ({
    'MaNhom': c.code,
    'TenNhom': c.name,
    'MoTa': c.description,
    'TrangThai': c.status
  }));
  const wsCats = XLSX.utils.json_to_sheet(catRows);
  wsCats['!cols'] = [{ wch: 16 }, { wch: 32 }, { wch: 45 }, { wch: 16 }];
  XLSX.utils.book_append_sheet(wb, wsCats, 'DanhMuc_VatTu');

  // 2. Sheet: DanhSach_VatTu
  const itemRows = SAMPLE_CDHA_DATA.items.map(i => ({
    'MaVatTu': i.code,
    'TenVatTu': i.name,
    'MaNhom': i.categoryCode,
    'DonViTinh': i.unit,
    'QuyCach': i.specification,
    'HangSanXuat': i.manufacturer,
    'TonToiThieu': i.minStock,
    'TonHienTai': i.currentStock,
    'DonGia': i.price,
    'HanSuDung': i.expiryDate,
    'MaPhongBan': i.deptCode,
    'GhiChu': i.note
  }));
  const wsItems = XLSX.utils.json_to_sheet(itemRows);
  wsItems['!cols'] = [
    { wch: 14 }, // MaVatTu
    { wch: 40 }, // TenVatTu
    { wch: 14 }, // MaNhom
    { wch: 12 }, // DonViTinh
    { wch: 30 }, // QuyCach
    { wch: 25 }, // HangSanXuat
    { wch: 14 }, // TonToiThieu
    { wch: 14 }, // TonHienTai
    { wch: 14 }, // DonGia
    { wch: 14 }, // HanSuDung
    { wch: 14 }, // MaPhongBan
    { wch: 45 }  // GhiChu
  ];
  XLSX.utils.book_append_sheet(wb, wsItems, 'DanhSach_VatTu');

  // 3. Sheet: PhongBan
  const deptRows = SAMPLE_CDHA_DATA.departments.map(d => ({
    'MaPhongBan': d.code,
    'TenPhongBan': d.name,
    'LoaiThietBi': d.deviceType,
    'NguoiPhuTrach': d.manager,
    'ViTri': d.location,
    'GhiChu': d.note
  }));
  const wsDepts = XLSX.utils.json_to_sheet(deptRows);
  wsDepts['!cols'] = [{ wch: 16 }, { wch: 38 }, { wch: 25 }, { wch: 26 }, { wch: 30 }, { wch: 35 }];
  XLSX.utils.book_append_sheet(wb, wsDepts, 'PhongBan');

  // 4. Sheet: LichSu_XuatNhap
  const transRows = SAMPLE_CDHA_DATA.transactions.map(t => ({
    'MaPhieu': t.code,
    'NgayThucHien': t.date,
    'LoaiGiaoDich': t.type,
    'MaVatTu': t.itemCode,
    'TenVatTu': SAMPLE_CDHA_DATA.items.find(i => i.code === t.itemCode)?.name || '',
    'SoLuong': t.quantity,
    'DonGia': t.unitPrice,
    'ThanhTien': t.quantity * t.unitPrice,
    'TuPhongBan': t.fromDept,
    'DenPhongBan': t.toDept,
    'SoLo': t.batch,
    'HanDung': t.expiry,
    'NguoiThucHien': t.performer,
    'LyDo_GhiChu': t.note
  }));
  const wsTrans = XLSX.utils.json_to_sheet(transRows);
  wsTrans['!cols'] = [
    { wch: 16 }, { wch: 18 }, { wch: 16 }, { wch: 14 }, { wch: 35 },
    { wch: 10 }, { wch: 12 }, { wch: 16 }, { wch: 18 }, { wch: 18 },
    { wch: 16 }, { wch: 14 }, { wch: 24 }, { wch: 45 }
  ];
  XLSX.utils.book_append_sheet(wb, wsTrans, 'LichSu_XuatNhap');

  // 5. Sheet: NguoiDung
  const userRows = SAMPLE_CDHA_DATA.users.map(u => ({
    'MaNguoiDung': u.code,
    'HoTen': u.name,
    'Email': u.email,
    'SoDienThoai': u.phone,
    'VaiTro': u.role,
    'PhongBanId': u.department,
    'TrangThai': u.status
  }));
  const wsUsers = XLSX.utils.json_to_sheet(userRows);
  wsUsers['!cols'] = [{ wch: 14 }, { wch: 24 }, { wch: 30 }, { wch: 16 }, { wch: 22 }, { wch: 16 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, wsUsers, 'NguoiDung');

  // 6. Instructions Sheet
  const instructionRows = [
    { 'Mục': 'HỆ THỐNG', 'Nội dung': 'CẤU TRÚC GOOGLE SHEETS QUẢN LÝ VẬT TƯ KHOA CHẨN ĐOÁN HÌNH ẢNH (CĐHA)' },
    { 'Mục': 'Cách dùng', 'Nội dung': '1. Mở Google Drive (drive.google.com) -> Nhấn Mới (New) -> Tải tệp lên (File upload).' },
    { 'Mục': 'Cách dùng', 'Nội dung': '2. Nhấp đúp vào tệp vừa tải -> Chọn "Mở bằng Google Trang tính" (Open with Google Sheets).' },
    { 'Mục': 'Quy tắc 1', 'Nội dung': 'Giữ nguyên tên 5 trang tính: DanhMuc_VatTu, DanhSach_VatTu, PhongBan, LichSu_XuatNhap, NguoiDung.' },
    { 'Mục': 'Quy tắc 2', 'Nội dung': 'Giữ nguyên hàng tiêu đề cột (Hàng 1). Không đổi tên các cột mã: MaNhom, MaVatTu, MaPhongBan, MaPhieu, MaNguoiDung.' },
    { 'Mục': 'Công thức', 'Nội dung': 'Thành tiền = SoLuong * DonGia (ví dụ =F2*G2 trong LichSu_XuatNhap).' },
    { 'Mục': 'Công thức', 'Nội dung': 'Cảnh báo tồn: =IF(H2<=G2, "⚠️ CẦN NHẬP THÊM", "AN TOÀN") trong DanhSach_VatTu.' },
    { 'Mục': 'Validation', 'Nội dung': 'Cài đặt Dropdown xác thực dữ liệu: Dữ liệu -> Xác thực dữ liệu -> Chọn dải ô từ trang khác để tránh sai chính tả.' },
    { 'Mục': 'Đồng bộ', 'Nội dung': 'Bạn có thể tải tệp này lên phần mềm bất kỳ lúc nào để nhập hoặc cập nhật tự động toàn bộ dữ liệu.' }
  ];
  const wsInst = XLSX.utils.json_to_sheet(instructionRows);
  wsInst['!cols'] = [{ wch: 16 }, { wch: 90 }];
  XLSX.utils.book_append_sheet(wb, wsInst, 'HuongDan_SuDung');

  // Trigger download
  XLSX.writeFile(wb, 'Mau_QuanLy_VatTu_CDHA_GoogleSheets.xlsx');
}

/**
 * Exports current live database into a standardized 5-sheet workbook
 */
export function exportLiveDatabaseToGoogleSheets(
  categories: any[],
  departments: any[],
  items: any[],
  transactions: any[],
  users: any[]
) {
  const wb = XLSX.utils.book_new();

  // 1. DanhMuc_VatTu
  const catRows = categories.map((c, idx) => ({
    'MaNhom': c.code || `NHOM_${String(idx + 1).padStart(2, '0')}`,
    'TenNhom': c.name || '',
    'MoTa': c.description || '',
    'TrangThai': c.status || 'Hoạt động'
  }));
  const wsCats = XLSX.utils.json_to_sheet(catRows.length > 0 ? catRows : [{ 'MaNhom': '', 'TenNhom': '', 'MoTa': '', 'TrangThai': '' }]);
  wsCats['!cols'] = [{ wch: 16 }, { wch: 32 }, { wch: 45 }, { wch: 16 }];
  XLSX.utils.book_append_sheet(wb, wsCats, 'DanhMuc_VatTu');

  // 2. DanhSach_VatTu
  const itemRows = items.map((i, idx) => {
    const cat = categories.find(c => c.id === i.categoryId);
    const dept = departments.find(d => d.id === i.departmentId);
    return {
      'MaVatTu': i.code || `VT-${String(idx + 1).padStart(3, '0')}`,
      'TenVatTu': i.name || '',
      'MaNhom': cat?.code || cat?.name || i.categoryId || '',
      'DonViTinh': i.unit || 'Cái',
      'QuyCach': i.specification || '',
      'HangSanXuat': i.manufacturer || '',
      'TonToiThieu': Number(i.minStock ?? 0),
      'TonHienTai': Number(i.currentStock ?? 0),
      'DonGia': Number(i.price ?? 0),
      'HanSuDung': i.expiryDate || '',
      'MaPhongBan': dept?.code || dept?.name || i.departmentId || '',
      'GhiChu': i.note || ''
    };
  });
  const wsItems = XLSX.utils.json_to_sheet(itemRows.length > 0 ? itemRows : [{ 'MaVatTu': '', 'TenVatTu': '', 'MaNhom': '', 'DonViTinh': '', 'TonToiThieu': 0, 'TonHienTai': 0 }]);
  wsItems['!cols'] = [
    { wch: 14 }, { wch: 40 }, { wch: 14 }, { wch: 12 }, { wch: 30 },
    { wch: 25 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 },
    { wch: 16 }, { wch: 40 }
  ];
  XLSX.utils.book_append_sheet(wb, wsItems, 'DanhSach_VatTu');

  // 3. PhongBan
  const deptRows = departments.map((d, idx) => ({
    'MaPhongBan': d.code || `PB_${String(idx + 1).padStart(2, '0')}`,
    'TenPhongBan': d.name || '',
    'LoaiThietBi': d.deviceType || 'X-quang / CĐHA',
    'NguoiPhuTrach': d.manager || '',
    'ViTri': d.location || '',
    'GhiChu': d.note || ''
  }));
  const wsDepts = XLSX.utils.json_to_sheet(deptRows.length > 0 ? deptRows : [{ 'MaPhongBan': '', 'TenPhongBan': '', 'LoaiThietBi': '', 'NguoiPhuTrach': '', 'ViTri': '', 'GhiChu': '' }]);
  wsDepts['!cols'] = [{ wch: 16 }, { wch: 38 }, { wch: 25 }, { wch: 26 }, { wch: 30 }, { wch: 35 }];
  XLSX.utils.book_append_sheet(wb, wsDepts, 'PhongBan');

  // 4. LichSu_XuatNhap
  const transRows = transactions.map((t, idx) => {
    const item = items.find(i => i.id === t.itemId);
    const fromDept = departments.find(d => d.id === t.fromDeptId);
    const toDept = departments.find(d => d.id === t.toDeptId);
    const dateStr = t.timestamp?.toDate ? t.timestamp.toDate().toLocaleString('vi-VN') : '';
    const unitPrice = Number(t.unitPrice || item?.price || 0);
    const qty = Number(t.quantity || 0);
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
  const wsTrans = XLSX.utils.json_to_sheet(transRows.length > 0 ? transRows : [{ 'MaPhieu': '', 'NgayThucHien': '', 'LoaiGiaoDich': '', 'MaVatTu': '', 'SoLuong': 0 }]);
  wsTrans['!cols'] = [
    { wch: 16 }, { wch: 20 }, { wch: 16 }, { wch: 14 }, { wch: 35 },
    { wch: 10 }, { wch: 14 }, { wch: 16 }, { wch: 22 }, { wch: 22 },
    { wch: 16 }, { wch: 14 }, { wch: 24 }, { wch: 45 }
  ];
  XLSX.utils.book_append_sheet(wb, wsTrans, 'LichSu_XuatNhap');

  // 5. NguoiDung
  const userRows = users.map((u, idx) => ({
    'MaNguoiDung': u.code || `NV-${String(idx + 1).padStart(3, '0')}`,
    'HoTen': u.name || '',
    'Email': u.email || '',
    'SoDienThoai': u.phone || '',
    'VaiTro': u.role || 'Người xem',
    'PhongBanId': u.departmentId || '',
    'TrangThai': u.status || 'Hoạt động'
  }));
  const wsUsers = XLSX.utils.json_to_sheet(userRows.length > 0 ? userRows : [{ 'MaNguoiDung': '', 'HoTen': '', 'Email': '', 'VaiTro': '' }]);
  wsUsers['!cols'] = [{ wch: 14 }, { wch: 24 }, { wch: 30 }, { wch: 16 }, { wch: 22 }, { wch: 16 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, wsUsers, 'NguoiDung');

  const now = new Date();
  const dateSuffix = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  XLSX.writeFile(wb, `Du_Lieu_Khoa_CDHA_GoogleSheets_${dateSuffix}.xlsx`);
}

/**
 * Normalizes string keys and maps variations of Vietnamese/English column names
 */
export function normalizeExcelRow(row: Record<string, any>): Record<string, any> {
  const normalized: Record<string, any> = {};
  for (const [key, val] of Object.entries(row)) {
    const cleanKey = key.trim().toLowerCase()
      .replace(/à|á|ạ|ả|ã|â|ầ|ấ|ậ|ẩ|ẫ|ă|ằ|ắ|ặ|ẳ|ẵ/g, "a")
      .replace(/è|é|ẹ|ẻ|ẽ|ê|ề|ế|ệ|ể|ễ/g, "e")
      .replace(/ì|í|ị|ỉ|ĩ/g, "i")
      .replace(/ò|ó|ọ|ỏ|õ|ô|ồ|ố|ộ|ổ|ỗ|ơ|ờ|ớ|ợ|ở|ỡ/g, "o")
      .replace(/ù|ú|ụ|ủ|ũ|ư|ừ|ứ|ự|ử|ữ/g, "u")
      .replace(/ỳ|ý|ỵ|ỷ|ỹ/g, "y")
      .replace(/đ/g, "d")
      .replace(/[^a-z0-9]/g, "");
    normalized[cleanKey] = val;
  }
  return normalized;
}

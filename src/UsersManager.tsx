import React, { useState } from 'react';
import { 
  Users, 
  UserPlus, 
  Search, 
  ShieldCheck, 
  Phone, 
  Mail, 
  Building, 
  Trash2, 
  Edit3, 
  CheckCircle2, 
  X, 
  Download,
  AlertCircle,
  Clock,
  Lock,
  Unlock,
  UserCheck,
  UserX
} from 'lucide-react';
import { collection, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';

export interface StaffUser {
  id: string;
  code?: string;
  name: string;
  email: string;
  phone?: string;
  role: 'Admin' | 'ThuKho' | 'KyThuatVien' | 'BacSi' | 'Xem';
  departmentId?: string;
  status?: 'Hoạt động' | 'Chờ duyệt' | 'Tạm khóa';
  createdAt?: any;
}

interface UsersManagerProps {
  users: StaffUser[];
  departments: any[];
  darkMode?: boolean;
  currentUserEmail?: string;
}

export function UsersManager({
  users,
  departments,
  darkMode = false,
  currentUserEmail
}: UsersManagerProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingUser, setEditingUser] = useState<StaffUser | null>(null);

  const [form, setForm] = useState({
    code: '',
    name: '',
    email: '',
    phone: '',
    role: 'KyThuatVien' as StaffUser['role'],
    departmentId: '',
    status: 'Hoạt động' as 'Hoạt động' | 'Chờ duyệt' | 'Tạm khóa'
  });

  const pendingUsers = users.filter(u => u.status === 'Chờ duyệt');

  const filteredUsers = users.filter(u => {
    const matchesSearch = 
      (u.name?.toLowerCase().includes(searchTerm.toLowerCase()) || false) ||
      (u.email?.toLowerCase().includes(searchTerm.toLowerCase()) || false) ||
      (u.code?.toLowerCase().includes(searchTerm.toLowerCase()) || false);
    const matchesRole = !roleFilter || u.role === roleFilter;
    const matchesStatus = !statusFilter || (u.status || 'Hoạt động') === statusFilter;
    return matchesSearch && matchesRole && matchesStatus;
  });

  const handleOpenAdd = () => {
    setEditingUser(null);
    setForm({
      code: `NV-${String(users.length + 1).padStart(3, '0')}`,
      name: '',
      email: '',
      phone: '',
      role: 'KyThuatVien',
      departmentId: departments[0]?.id || '',
      status: 'Hoạt động'
    });
    setShowAddModal(true);
  };

  const handleOpenEdit = (user: StaffUser) => {
    setEditingUser(user);
    setForm({
      code: user.code || '',
      name: user.name || '',
      email: user.email || '',
      phone: user.phone || '',
      role: user.role || 'KyThuatVien',
      departmentId: user.departmentId || '',
      status: user.status || 'Hoạt động'
    });
    setShowAddModal(true);
  };

  const handleQuickStatusChange = async (user: StaffUser, newStatus: 'Hoạt động' | 'Chờ duyệt' | 'Tạm khóa') => {
    try {
      const updatedCode =
        newStatus === 'Hoạt động' && (!user.code || user.code === 'NV-CHO')
          ? `NV-${String(users.length).padStart(3, '0')}`
          : user.code || 'NV-001';
      await updateDoc(doc(db, 'users', user.id), {
        status: newStatus,
        code: updatedCode
      });
      if (newStatus === 'Hoạt động') {
        toast.success(`Đã phê duyệt cho phép "${user.email}" đăng nhập!`);
      } else if (newStatus === 'Tạm khóa') {
        toast.warning(`Đã khóa quyền đăng nhập của "${user.email}".`);
      } else {
        toast.info(`Đã chuyển "${user.email}" sang trạng thái Chờ duyệt.`);
      }
    } catch (err: any) {
      console.error(err);
      toast.error('Lỗi khi cập nhật trạng thái: ' + err.message);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim()) {
      toast.error('Vui lòng nhập Họ tên và Email hợp lệ');
      return;
    }

    const normalizedEmail = form.email.trim().toLowerCase();

    try {
      if (editingUser) {
        await updateDoc(doc(db, 'users', editingUser.id), {
          ...form,
          email: normalizedEmail
        });
        toast.success('Đã cập nhật thông tin cán bộ thành công!');
      } else {
        await addDoc(collection(db, 'users'), {
          ...form,
          email: normalizedEmail,
          createdAt: serverTimestamp()
        });
        toast.success('Đã thêm cán bộ mới vào danh sách được phép đăng nhập!');
      }
      setShowAddModal(false);
    } catch (err: any) {
      console.error(err);
      toast.error('Lỗi khi lưu thông tin: ' + err.message);
    }
  };

  const handleDelete = async (id: string, name: string, email?: string) => {
    if (email?.toLowerCase() === 'manhha2@gmail.com') {
      toast.error('Không thể xóa tài khoản Quản trị viên gốc (manhha2@gmail.com)');
      return;
    }
    try {
      await deleteDoc(doc(db, 'users', id));
      toast.success(`Đã xóa tài khoản "${name}" khỏi danh sách!`);
    } catch (err: any) {
      console.error(err);
      toast.error('Lỗi khi xóa tài khoản: ' + err.message);
    }
  };

  const handleExportUsers = () => {
    const rows = filteredUsers.map(u => {
      const dept = departments.find(d => d.id === u.departmentId);
      return {
        'MaNguoiDung': u.code || '',
        'HoTen': u.name,
        'Email': u.email,
        'SoDienThoai': u.phone || '',
        'VaiTro': u.role === 'Admin' ? 'Quản trị viên' : u.role === 'ThuKho' ? 'Quản lý kho' : u.role === 'KyThuatVien' ? 'Kỹ thuật viên CĐHA' : u.role === 'BacSi' ? 'Bác sĩ chẩn đoán' : 'Người xem',
        'PhongBanId': dept?.name || u.departmentId || '',
        'TrangThai': u.status || 'Hoạt động'
      };
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'NguoiDung');
    XLSX.writeFile(wb, 'DanhSach_NguoiDung_CDHA.xlsx');
    toast.success('Đã xuất danh sách người dùng sang Excel/Google Sheets!');
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'Admin':
        return (
          <span className={`inline-flex items-center whitespace-nowrap px-2.5 py-1 rounded-full text-xs font-bold ${
            darkMode ? 'bg-purple-950/80 text-purple-300 border border-purple-800/50' : 'bg-purple-100 text-purple-700'
          }`}>
            Quản trị viên
          </span>
        );
      case 'ThuKho':
        return (
          <span className={`inline-flex items-center whitespace-nowrap px-2.5 py-1 rounded-full text-xs font-bold ${
            darkMode ? 'bg-blue-950/80 text-blue-300 border border-blue-800/50' : 'bg-blue-100 text-blue-700'
          }`}>
            Quản lý kho
          </span>
        );
      case 'KyThuatVien':
        return (
          <span className={`inline-flex items-center whitespace-nowrap px-2.5 py-1 rounded-full text-xs font-bold ${
            darkMode ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800/50' : 'bg-emerald-100 text-emerald-700'
          }`}>
            Kỹ thuật viên CĐHA
          </span>
        );
      case 'BacSi':
        return (
          <span className={`inline-flex items-center whitespace-nowrap px-2.5 py-1 rounded-full text-xs font-bold ${
            darkMode ? 'bg-amber-950/80 text-amber-300 border border-amber-800/50' : 'bg-amber-100 text-amber-700'
          }`}>
            Bác sĩ chẩn đoán
          </span>
        );
      default:
        return (
          <span className={`inline-flex items-center whitespace-nowrap px-2.5 py-1 rounded-full text-xs font-bold ${
            darkMode ? 'bg-slate-700 text-slate-300' : 'bg-slate-100 text-slate-700'
          }`}>
            Người xem
          </span>
        );
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Banner thông báo các tài khoản đang chờ phê duyệt */}
      {pendingUsers.length > 0 && (
        <div className={`p-5 rounded-3xl border-2 shadow-sm ${
          darkMode ? 'bg-amber-950/30 border-amber-600/60' : 'bg-amber-50/90 border-amber-300'
        }`}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-500 text-white flex items-center justify-center shadow-md shadow-amber-500/20 shrink-0">
                <Clock className="w-5 h-5" />
              </div>
              <div>
                <h4 className={`text-base font-bold ${darkMode ? 'text-amber-300' : 'text-amber-900'}`}>
                  Có {pendingUsers.length} tài khoản Google đang chờ bạn phê duyệt đăng nhập
                </h4>
                <p className={`text-xs ${darkMode ? 'text-amber-400/80' : 'text-amber-800'}`}>
                  Những tài khoản này đã đăng nhập bằng Google nhưng đang bị chặn ở màn hình chờ cho đến khi bạn nhấn "Duyệt".
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-2.5">
            {pendingUsers.map(pUser => (
              <div
                key={pUser.id}
                className={`p-3.5 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                  darkMode ? 'bg-slate-800/90 border-slate-700' : 'bg-white border-amber-200'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-full bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 font-bold text-xs flex items-center justify-center shrink-0">
                    {(pUser.name || pUser.email || 'U').slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className={`text-sm font-bold truncate ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                      {pUser.name}
                    </p>
                    <p className="text-xs font-mono text-slate-500 dark:text-slate-400 truncate">
                      {pUser.email}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => handleQuickStatusChange(pUser, 'Hoạt động')}
                    className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shadow-sm transition-all cursor-pointer"
                  >
                    <UserCheck className="w-4 h-4 shrink-0" />
                    <span>Duyệt cho phép vào App</span>
                  </button>
                  <button
                    onClick={() => handleQuickStatusChange(pUser, 'Tạm khóa')}
                    className={`px-3 py-2 rounded-xl border text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap transition-all cursor-pointer ${
                      darkMode ? 'border-slate-600 text-slate-300 hover:bg-slate-700' : 'border-slate-200 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <Lock className="w-3.5 h-3.5 shrink-0" />
                    <span>Từ chối / Khóa</span>
                  </button>
                  <button
                    onClick={() => handleDelete(pUser.id, pUser.name, pUser.email)}
                    className="p-2 rounded-xl text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all cursor-pointer"
                    title="Xóa yêu cầu"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top Header Card */}
      <div className={`p-6 rounded-3xl border shadow-sm ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-2xl shrink-0 flex items-center justify-center shadow-sm ${
                darkMode ? 'bg-indigo-900/50 text-indigo-400' : 'bg-indigo-100 text-indigo-600'
              }`}>
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h3 className={`text-lg sm:text-xl font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                  Quản Lý & Phê Duyệt Tài Khoản Đăng Nhập
                </h3>
                <p className={`text-xs sm:text-sm mt-0.5 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                  Chỉ những email Google có trạng thái "Hoạt động" trong danh sách này mới được phép truy cập hệ thống
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              onClick={handleExportUsers}
              className={`px-4 py-2.5 rounded-xl border text-sm font-semibold flex items-center gap-2 whitespace-nowrap shrink-0 transition-all cursor-pointer ${
                darkMode ? 'bg-slate-700 border-slate-600 text-slate-200 hover:bg-slate-650' : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
              }`}
            >
              <Download className="w-4 h-4 shrink-0" />
              <span>Xuất Sheet</span>
            </button>
            <button
              onClick={handleOpenAdd}
              className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl text-sm flex items-center gap-2 whitespace-nowrap shrink-0 shadow-lg shadow-blue-500/20 active:scale-95 transition-all cursor-pointer"
            >
              <UserPlus className="w-4 h-4 shrink-0" />
              <span>Thêm email được phép</span>
            </button>
          </div>
        </div>

        {/* Filter bar */}
        <div className="mt-6 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className={`w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`} />
            <input
              type="text"
              placeholder="Tìm theo họ tên, email, mã nhân viên..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className={`w-full pl-9 pr-4 py-2.5 border rounded-xl text-sm outline-none transition-all ${
                darkMode ? 'bg-slate-900 border-slate-700 text-white placeholder-slate-500' : 'bg-slate-50 border-slate-200 text-slate-900'
              }`}
            />
          </div>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className={`px-3 py-2.5 border rounded-xl text-sm font-medium outline-none shrink-0 ${
              darkMode ? 'bg-slate-900 border-slate-700 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'
            }`}
          >
            <option value="">Tất cả trạng thái</option>
            <option value="Hoạt động">Đang hoạt động (Đã duyệt)</option>
            <option value="Chờ duyệt">Đang chờ duyệt</option>
            <option value="Tạm khóa">Đã khóa (Chặn truy cập)</option>
          </select>
          <select
            value={roleFilter}
            onChange={e => setRoleFilter(e.target.value)}
            className={`px-3 py-2.5 border rounded-xl text-sm font-medium outline-none shrink-0 ${
              darkMode ? 'bg-slate-900 border-slate-700 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'
            }`}
          >
            <option value="">Tất cả vai trò</option>
            <option value="Admin">Quản trị viên (Admin)</option>
            <option value="ThuKho">Quản lý kho</option>
            <option value="KyThuatVien">Kỹ thuật viên CĐHA</option>
            <option value="BacSi">Bác sĩ chẩn đoán</option>
            <option value="Xem">Người xem</option>
          </select>
        </div>
      </div>

      {/* Mobile Users Card View (< md) */}
      <div className="md:hidden space-y-3">
        {filteredUsers.length === 0 ? (
          <div className={`p-8 text-center rounded-2xl border ${darkMode ? 'bg-slate-800 border-slate-700 text-slate-400' : 'bg-white border-slate-200 text-slate-500'}`}>
            Chưa có tài khoản cán bộ nào trong danh sách. Hãy nhấn "Thêm email được phép" để cấp quyền!
          </div>
        ) : (
          filteredUsers.map(user => {
            const dept = departments.find(d => d.id === user.departmentId);
            const isCurrent = currentUserEmail && user.email.toLowerCase() === currentUserEmail.toLowerCase();
            const isRootAdmin = user.email.toLowerCase() === 'manhha2@gmail.com';

            return (
              <div
                key={user.id}
                className={`p-4 rounded-2xl border shadow-sm transition-all ${
                  darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'
                } ${user.status === 'Chờ duyệt' ? (darkMode ? 'ring-2 ring-amber-500/50 bg-amber-950/20' : 'ring-2 ring-amber-400 bg-amber-50/40') : ''}`}
              >
                {/* Header: Name, Code & Status */}
                <div className="flex items-start justify-between gap-2 pb-2.5 border-b border-slate-100 dark:border-slate-700/60">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className={`font-mono font-bold text-xs px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-800 shrink-0`}>
                        {user.code || 'NV-000'}
                      </span>
                      <h4 className={`text-sm font-bold truncate ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                        {user.name}
                      </h4>
                      {isCurrent && (
                        <span className={`text-[10px] px-2 py-0.5 rounded-md font-semibold whitespace-nowrap shrink-0 ${
                          darkMode ? 'bg-blue-900/80 text-blue-300 border border-blue-700/50' : 'bg-blue-100 text-blue-700'
                        }`}>
                          Bạn
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="shrink-0">
                    {user.status === 'Chờ duyệt' ? (
                      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                        darkMode ? 'bg-amber-950/80 text-amber-300 border border-amber-800/50' : 'bg-amber-100 text-amber-800'
                      }`}>
                        <Clock className="w-3 h-3 shrink-0" />
                        <span>Chờ duyệt</span>
                      </span>
                    ) : user.status === 'Tạm khóa' ? (
                      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                        darkMode ? 'bg-red-950/80 text-red-300 border border-red-800/50' : 'bg-red-100 text-red-700'
                      }`}>
                        <Lock className="w-3 h-3 shrink-0" />
                        <span>Đã khóa</span>
                      </span>
                    ) : (
                      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                        darkMode ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800/50' : 'bg-emerald-100 text-emerald-700'
                      }`}>
                        <CheckCircle2 className="w-3 h-3 shrink-0" />
                        <span>Được phép</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* Details */}
                <div className="py-2.5 space-y-1.5 text-xs">
                  <div className={`flex items-center gap-2 ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                    <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="font-mono truncate">{user.email}</span>
                  </div>
                  {user.phone && (
                    <div className={`flex items-center gap-2 ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                      <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>{user.phone}</span>
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    {getRoleBadge(user.role)}
                    <div className={`flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md ${darkMode ? 'bg-slate-700 text-slate-300' : 'bg-slate-100 text-slate-600'}`}>
                      <Building className="w-3 h-3 text-slate-400 shrink-0" />
                      <span>{dept?.name || 'Kho trung tâm'}</span>
                    </div>
                  </div>
                </div>

                {/* Actions Row */}
                <div className={`pt-2.5 border-t flex items-center justify-between gap-2 ${darkMode ? 'border-slate-700/60' : 'border-slate-100'}`}>
                  <div className="flex items-center gap-1.5">
                    {!isRootAdmin && user.status === 'Chờ duyệt' && (
                      <button
                        onClick={() => handleQuickStatusChange(user, 'Hoạt động')}
                        className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1 shadow-sm active:scale-95 transition-all cursor-pointer"
                      >
                        <UserCheck className="w-3.5 h-3.5" />
                        <span>Duyệt tài khoản</span>
                      </button>
                    )}
                    {!isRootAdmin && user.status !== 'Tạm khóa' && user.status !== 'Chờ duyệt' && (
                      <button
                        onClick={() => handleQuickStatusChange(user, 'Tạm khóa')}
                        className={`px-2.5 py-1.5 rounded-xl border text-xs font-medium flex items-center gap-1 transition-all cursor-pointer ${
                          darkMode ? 'border-slate-700 text-slate-400 hover:text-amber-400' : 'border-slate-200 text-slate-600 hover:text-amber-600'
                        }`}
                      >
                        <Lock className="w-3.5 h-3.5" />
                        <span>Khóa</span>
                      </button>
                    )}
                    {!isRootAdmin && user.status === 'Tạm khóa' && (
                      <button
                        onClick={() => handleQuickStatusChange(user, 'Hoạt động')}
                        className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1 shadow-sm active:scale-95 transition-all cursor-pointer"
                      >
                        <Unlock className="w-3.5 h-3.5" />
                        <span>Mở khóa</span>
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleOpenEdit(user)}
                      className={`p-2 rounded-xl border transition-colors ${
                        darkMode ? 'border-slate-700 text-slate-400 hover:text-blue-400' : 'border-slate-200 text-slate-500 hover:text-blue-600'
                      }`}
                      title="Sửa"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    {!isRootAdmin && (
                      <button
                        onClick={() => handleDelete(user.id, user.name, user.email)}
                        className="p-2 rounded-xl text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                        title="Xóa"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Desktop Users Table (>= md) */}
      <div className={`hidden md:block rounded-3xl border shadow-sm overflow-hidden ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className={`text-xs uppercase font-semibold whitespace-nowrap ${darkMode ? 'bg-slate-900/60 text-slate-400 border-b border-slate-700' : 'bg-slate-50 text-slate-500 border-b border-slate-200'}`}>
              <tr>
                <th className="py-3.5 px-4 whitespace-nowrap">Mã NV</th>
                <th className="py-3.5 px-4 whitespace-nowrap">Cán bộ y tế</th>
                <th className="py-3.5 px-4 whitespace-nowrap">Email đăng nhập</th>
                <th className="py-3.5 px-4 whitespace-nowrap">Số điện thoại</th>
                <th className="py-3.5 px-4 whitespace-nowrap">Vai trò hệ thống</th>
                <th className="py-3.5 px-4 whitespace-nowrap">Phòng máy phụ trách</th>
                <th className="py-3.5 px-4 whitespace-nowrap">Trạng thái duyệt</th>
                <th className="py-3.5 px-4 text-right whitespace-nowrap">Thao tác</th>
              </tr>
            </thead>
            <tbody className={`divide-y ${darkMode ? 'divide-slate-700/60 text-slate-200' : 'divide-slate-100 text-slate-700'}`}>
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    Chưa có tài khoản cán bộ nào trong danh sách. Hãy nhấn "Thêm email được phép" để cấp quyền!
                  </td>
                </tr>
              ) : (
                filteredUsers.map(user => {
                  const dept = departments.find(d => d.id === user.departmentId);
                  const isCurrent = currentUserEmail && user.email.toLowerCase() === currentUserEmail.toLowerCase();
                  const isRootAdmin = user.email.toLowerCase() === 'manhha2@gmail.com';
                  return (
                    <tr key={user.id} className={`${darkMode ? 'hover:bg-slate-700/40' : 'hover:bg-slate-50/80'} transition-colors`}>
                      <td className={`py-3.5 px-4 font-mono font-bold text-xs whitespace-nowrap ${darkMode ? 'text-blue-400' : 'text-blue-600'}`}>
                        {user.code || 'NV-000'}
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className={`font-semibold flex items-center gap-2 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                          <span>{user.name}</span>
                          {isCurrent && (
                            <span className={`text-[10px] px-2 py-0.5 rounded-md font-semibold whitespace-nowrap ${
                              darkMode ? 'bg-blue-900/80 text-blue-300 border border-blue-700/50' : 'bg-blue-100 text-blue-700'
                            }`}>
                              Bạn
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 font-mono text-xs whitespace-nowrap">
                        <div className={`flex items-center gap-1.5 ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                          <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>{user.email}</span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-xs whitespace-nowrap">
                        <div className={`flex items-center gap-1.5 ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                          <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>{user.phone || 'Chưa cập nhật'}</span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {getRoleBadge(user.role)}
                      </td>
                      <td className="py-3.5 px-4 text-xs font-medium whitespace-nowrap">
                        <div className={`flex items-center gap-1.5 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                          <Building className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>{dept?.name || 'Kho trung tâm'}</span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {user.status === 'Chờ duyệt' ? (
                          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold whitespace-nowrap ${
                            darkMode ? 'bg-amber-950/80 text-amber-300 border border-amber-800/50' : 'bg-amber-100 text-amber-800'
                          }`}>
                            <Clock className="w-3 h-3 shrink-0" />
                            <span>Chờ duyệt</span>
                          </span>
                        ) : user.status === 'Tạm khóa' ? (
                          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold whitespace-nowrap ${
                            darkMode ? 'bg-red-950/80 text-red-300 border border-red-800/50' : 'bg-red-100 text-red-700'
                          }`}>
                            <Lock className="w-3 h-3 shrink-0" />
                            <span>Đã khóa</span>
                          </span>
                        ) : (
                          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold whitespace-nowrap ${
                            darkMode ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800/50' : 'bg-emerald-100 text-emerald-700'
                          }`}>
                            <CheckCircle2 className="w-3 h-3 shrink-0" />
                            <span>Được phép</span>
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          {!isRootAdmin && user.status === 'Chờ duyệt' && (
                            <button
                              onClick={() => handleQuickStatusChange(user, 'Hoạt động')}
                              className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1 whitespace-nowrap cursor-pointer"
                              title="Duyệt cho phép đăng nhập"
                            >
                              <UserCheck className="w-3.5 h-3.5 shrink-0" />
                              <span>Duyệt</span>
                            </button>
                          )}
                          {!isRootAdmin && user.status !== 'Tạm khóa' && user.status !== 'Chờ duyệt' && (
                            <button
                              onClick={() => handleQuickStatusChange(user, 'Tạm khóa')}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-slate-700 cursor-pointer"
                              title="Khóa quyền đăng nhập"
                            >
                              <Lock className="w-4 h-4" />
                            </button>
                          )}
                          {!isRootAdmin && user.status === 'Tạm khóa' && (
                            <button
                              onClick={() => handleQuickStatusChange(user, 'Hoạt động')}
                              className="p-1.5 rounded-lg text-amber-500 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-slate-700 cursor-pointer"
                              title="Mở khóa cho phép đăng nhập"
                            >
                              <Unlock className="w-4 h-4" />
                            </button>
                          )}
                          <button
                            onClick={() => handleOpenEdit(user)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-slate-700 cursor-pointer"
                            title="Sửa thông tin & Phân quyền"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          {!isRootAdmin && (
                            <button
                              onClick={() => handleDelete(user.id, user.name, user.email)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-slate-700 cursor-pointer"
                              title="Xóa tài khoản"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className={`w-full max-w-lg rounded-3xl p-6 shadow-2xl border ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-100'}`}>
            <div className="flex justify-between items-center pb-4 border-b dark:border-slate-700 mb-5">
              <h3 className={`text-lg font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                {editingUser ? 'Cập nhật Quyền & Thông tin Cán bộ' : 'Thêm Email Google Được Phép Đăng Nhập'}
              </h3>
              <button 
                onClick={() => setShowAddModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={`block text-xs font-semibold mb-1 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                    Mã nhân viên (MaNguoiDung)
                  </label>
                  <input
                    type="text"
                    required
                    value={form.code}
                    onChange={e => setForm({ ...form, code: e.target.value })}
                    className={`w-full px-3 py-2 border rounded-xl outline-none font-mono ${darkMode ? 'bg-slate-900 border-slate-700 text-white' : 'bg-slate-50 border-slate-200'}`}
                  />
                </div>
                <div>
                  <label className={`block text-xs font-semibold mb-1 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                    Họ và tên (HoTen) *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="BS / KTV..."
                    value={form.name}
                    onChange={e => setForm({ ...form, name: e.target.value })}
                    className={`w-full px-3 py-2 border rounded-xl outline-none ${darkMode ? 'bg-slate-900 border-slate-700 text-white' : 'bg-slate-50 border-slate-200'}`}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={`block text-xs font-semibold mb-1 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                    Email Google (Đăng nhập) *
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="email@gmail.com"
                    value={form.email}
                    onChange={e => setForm({ ...form, email: e.target.value })}
                    className={`w-full px-3 py-2 border rounded-xl outline-none ${darkMode ? 'bg-slate-900 border-slate-700 text-white' : 'bg-slate-50 border-slate-200'}`}
                  />
                </div>
                <div>
                  <label className={`block text-xs font-semibold mb-1 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                    Số điện thoại liên hệ
                  </label>
                  <input
                    type="tel"
                    placeholder="09..."
                    value={form.phone}
                    onChange={e => setForm({ ...form, phone: e.target.value })}
                    className={`w-full px-3 py-2 border rounded-xl outline-none ${darkMode ? 'bg-slate-900 border-slate-700 text-white' : 'bg-slate-50 border-slate-200'}`}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={`block text-xs font-semibold mb-1 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                    Vai trò hệ thống (VaiTro)
                  </label>
                  <select
                    value={form.role}
                    onChange={e => setForm({ ...form, role: e.target.value as any })}
                    className={`w-full px-3 py-2 border rounded-xl outline-none font-medium ${darkMode ? 'bg-slate-900 border-slate-700 text-white' : 'bg-slate-50 border-slate-200'}`}
                  >
                    <option value="Admin">Quản trị viên (Admin)</option>
                    <option value="ThuKho">Quản lý kho</option>
                    <option value="KyThuatVien">Kỹ thuật viên CĐHA</option>
                    <option value="BacSi">Bác sĩ chẩn đoán</option>
                    <option value="Xem">Người xem (Chỉ đọc)</option>
                  </select>
                </div>
                <div>
                  <label className={`block text-xs font-semibold mb-1 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                    Phòng máy công tác (PhongBanId)
                  </label>
                  <select
                    value={form.departmentId}
                    onChange={e => setForm({ ...form, departmentId: e.target.value })}
                    className={`w-full px-3 py-2 border rounded-xl outline-none font-medium ${darkMode ? 'bg-slate-900 border-slate-700 text-white' : 'bg-slate-50 border-slate-200'}`}
                  >
                    <option value="">Kho trung tâm</option>
                    {departments.map(d => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className={`block text-xs font-semibold mb-1 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                  Trạng thái phê duyệt (TrangThai)
                </label>
                <select
                  value={form.status}
                  onChange={e => setForm({ ...form, status: e.target.value as any })}
                  className={`w-full px-3 py-2 border rounded-xl outline-none font-medium ${darkMode ? 'bg-slate-900 border-slate-700 text-white' : 'bg-slate-50 border-slate-200'}`}
                >
                  <option value="Hoạt động">Hoạt động (Cho phép đăng nhập)</option>
                  <option value="Chờ duyệt">Chờ duyệt (Tạm chặn chờ Admin)</option>
                  <option value="Tạm khóa">Tạm khóa (Chặn truy cập)</option>
                </select>
              </div>

              <div className="pt-4 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className={`px-4 py-2.5 rounded-xl font-semibold cursor-pointer ${darkMode ? 'bg-slate-700 text-slate-300 hover:bg-slate-650' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl shadow-lg shadow-blue-500/20 active:scale-95 transition-all cursor-pointer"
                >
                  {editingUser ? 'Lưu thay đổi' : 'Cấp quyền ngay'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}


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
  AlertCircle
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
  status?: 'Hoạt động' | 'Tạm khóa';
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
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingUser, setEditingUser] = useState<StaffUser | null>(null);

  const [form, setForm] = useState({
    code: '',
    name: '',
    email: '',
    phone: '',
    role: 'KyThuatVien' as StaffUser['role'],
    departmentId: '',
    status: 'Hoạt động' as 'Hoạt động' | 'Tạm khóa'
  });

  const filteredUsers = users.filter(u => {
    const matchesSearch = 
      (u.name?.toLowerCase().includes(searchTerm.toLowerCase()) || false) ||
      (u.email?.toLowerCase().includes(searchTerm.toLowerCase()) || false) ||
      (u.code?.toLowerCase().includes(searchTerm.toLowerCase()) || false);
    const matchesRole = !roleFilter || u.role === roleFilter;
    return matchesSearch && matchesRole;
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

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim()) {
      toast.error('Vui lòng nhập Họ tên và Email hợp lệ');
      return;
    }

    try {
      if (editingUser) {
        await updateDoc(doc(db, 'users', editingUser.id), {
          ...form
        });
        toast.success('Đã cập nhật thông tin cán bộ thành công!');
      } else {
        await addDoc(collection(db, 'users'), {
          ...form,
          createdAt: serverTimestamp()
        });
        toast.success('Đã thêm cán bộ mới thành công!');
      }
      setShowAddModal(false);
    } catch (err: any) {
      console.error(err);
      toast.error('Lỗi khi lưu thông tin: ' + err.message);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (confirm(`Bạn có chắc chắn muốn xóa tài khoản của cán bộ "${name}"?`)) {
      try {
        await deleteDoc(doc(db, 'users', id));
        toast.success('Đã xóa tài khoản thành công!');
      } catch (err: any) {
        console.error(err);
        toast.error('Lỗi khi xóa tài khoản: ' + err.message);
      }
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
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300">Quản trị viên</span>;
      case 'ThuKho':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300">Quản lý kho</span>;
      case 'KyThuatVien':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">Kỹ thuật viên CĐHA</span>;
      case 'BacSi':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300">Bác sĩ chẩn đoán</span>;
      default:
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300">Người xem</span>;
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Top Header Card */}
      <div className={`p-6 rounded-3xl border shadow-sm ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shadow-sm">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <h3 className={`text-xl font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                  Người Dùng & Phân Quyền Cán Bộ (Trang tính NguoiDung)
                </h3>
                <p className={`text-xs sm:text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                  Quản lý danh sách nhân sự khoa Chẩn đoán Hình ảnh, số điện thoại, vai trò và phòng máy phân công
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto">
            <button
              onClick={handleExportUsers}
              className={`px-4 py-2.5 rounded-xl border text-sm font-semibold flex items-center gap-2 transition-all cursor-pointer ${
                darkMode ? 'bg-slate-700 border-slate-600 text-slate-200 hover:bg-slate-650' : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
              }`}
            >
              <Download className="w-4 h-4" />
              <span>Xuất Sheet</span>
            </button>
            <button
              onClick={handleOpenAdd}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl text-sm flex items-center gap-2 shadow-lg shadow-blue-500/20 active:scale-95 transition-all cursor-pointer"
            >
              <UserPlus className="w-4 h-4" />
              <span>Thêm cán bộ</span>
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
            value={roleFilter}
            onChange={e => setRoleFilter(e.target.value)}
            className={`px-3 py-2.5 border rounded-xl text-sm font-medium outline-none ${
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

      {/* Users Table */}
      <div className={`rounded-3xl border shadow-sm overflow-hidden ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className={`text-xs uppercase font-semibold ${darkMode ? 'bg-slate-900/60 text-slate-400 border-b border-slate-700' : 'bg-slate-50 text-slate-500 border-b border-slate-200'}`}>
              <tr>
                <th className="py-3.5 px-4">Mã NV</th>
                <th className="py-3.5 px-4">Cán bộ y tế</th>
                <th className="py-3.5 px-4">Email đăng nhập</th>
                <th className="py-3.5 px-4">Số điện thoại</th>
                <th className="py-3.5 px-4">Vai trò hệ thống</th>
                <th className="py-3.5 px-4">Phòng máy phụ trách</th>
                <th className="py-3.5 px-4">Trạng thái</th>
                <th className="py-3.5 px-4 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className={`divide-y ${darkMode ? 'divide-slate-700/60 text-slate-300' : 'divide-slate-100 text-slate-700'}`}>
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    Chưa có tài khoản cán bộ nào trong danh sách. Hãy nhấn "Thêm cán bộ" hoặc tải lên từ Google Sheets!
                  </td>
                </tr>
              ) : (
                filteredUsers.map(user => {
                  const dept = departments.find(d => d.id === user.departmentId);
                  const isCurrent = currentUserEmail && user.email.toLowerCase() === currentUserEmail.toLowerCase();
                  return (
                    <tr key={user.id} className={`${darkMode ? 'hover:bg-slate-750/50' : 'hover:bg-slate-50/80'} transition-colors`}>
                      <td className="py-3.5 px-4 font-mono font-bold text-xs text-blue-600 dark:text-blue-400">
                        {user.code || 'NV-000'}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                          <span>{user.name}</span>
                          {isCurrent && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 font-normal">
                              Bạn
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 font-mono text-xs">
                        <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
                          <Mail className="w-3.5 h-3.5 text-slate-400" />
                          <span>{user.email}</span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-xs">
                        <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
                          <Phone className="w-3.5 h-3.5 text-slate-400" />
                          <span>{user.phone || 'Chưa cập nhật'}</span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        {getRoleBadge(user.role)}
                      </td>
                      <td className="py-3.5 px-4 text-xs font-medium">
                        <div className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
                          <Building className="w-3.5 h-3.5 text-slate-400" />
                          <span>{dept?.name || 'Kho trung tâm'}</span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className={`inline-flex items-center gap-1 text-xs font-medium ${
                          user.status === 'Tạm khóa' ? 'text-red-500' : 'text-emerald-600 dark:text-emerald-400'
                        }`}>
                          <CheckCircle2 className="w-3 h-3" />
                          <span>{user.status || 'Hoạt động'}</span>
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleOpenEdit(user)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-slate-700 cursor-pointer"
                            title="Sửa thông tin"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(user.id, user.name)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-slate-700 cursor-pointer"
                            title="Xóa tài khoản"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
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
                {editingUser ? 'Cập nhật Thông tin Cán bộ' : 'Thêm Cán bộ Mới (Khoa CĐHA)'}
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
                  Trạng thái tài khoản (TrangThai)
                </label>
                <select
                  value={form.status}
                  onChange={e => setForm({ ...form, status: e.target.value as any })}
                  className={`w-full px-3 py-2 border rounded-xl outline-none font-medium ${darkMode ? 'bg-slate-900 border-slate-700 text-white' : 'bg-slate-50 border-slate-200'}`}
                >
                  <option value="Hoạt động">Hoạt động</option>
                  <option value="Tạm khóa">Tạm khóa</option>
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
                  {editingUser ? 'Lưu thay đổi' : 'Tạo tài khoản'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

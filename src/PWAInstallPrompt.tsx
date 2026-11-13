import React, { useState } from 'react';
import { Download, Share, X, WifiOff, Smartphone, Check, Copy, ExternalLink, MoreVertical } from 'lucide-react';
import { usePWAInstall, useOnlineStatus } from './usePWAInstall';

interface PWAInstallButtonProps {
  variant?: 'header' | 'sidebar';
  darkMode?: boolean;
  isMedical?: boolean;
}

export function PWAInstallButton({
  variant = 'header',
  darkMode = false,
  isMedical = false,
}: PWAInstallButtonProps) {
  const { isInstallable, isInstalled, isIOS, isInIframe, install } = usePWAInstall();
  const [showGuideModal, setShowGuideModal] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);

  // Never show install UI when already running inside the installed standalone PWA
  if (isInstalled) {
    return null;
  }

  const handleClick = async () => {
    if (isInstallable && !isInIframe) {
      const accepted = await install();
      if (!accepted) {
        setShowGuideModal(true);
      }
      return;
    }
    setShowGuideModal(true);
  };

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(window.location.origin);
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2500);
    } catch {
      // Fallback ignored if clipboard blocked
    }
  };

  return (
    <>
      {variant === 'header' ? (
        <button
          type="button"
          onClick={handleClick}
          title={isInstallable ? 'Cài đặt ứng dụng về điện thoại / máy tính' : 'Hướng dẫn cài đặt ứng dụng trên điện thoại'}
          className={`flex items-center gap-1 sm:gap-1.5 p-1.5 sm:px-2.5 sm:py-1.5 rounded-xl text-xs font-bold transition-all border cursor-pointer shrink-0 ${
            isInstallable
              ? isMedical
                ? 'bg-emerald-500/90 hover:bg-emerald-500 text-white border-emerald-300/60 shadow-sm'
                : 'bg-blue-600 hover:bg-blue-700 text-white border-blue-500 shadow-sm'
              : isMedical
              ? 'bg-white/12 hover:bg-white/22 text-white border-white/20'
              : darkMode
              ? 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700'
              : 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200'
          }`}
        >
          <Download className="w-3.5 h-3.5 shrink-0" />
          <span className="hidden lg:inline">Cài đặt App</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={handleClick}
          className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all cursor-pointer border ${
            isInstallable
              ? darkMode
                ? 'bg-emerald-900/30 border-emerald-700/60 text-emerald-300 hover:bg-emerald-900/50'
                : 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'
              : darkMode
              ? 'bg-slate-700/40 border-slate-700 text-slate-200 hover:bg-slate-700'
              : 'bg-blue-50/70 border-blue-200/80 text-blue-700 hover:bg-blue-100/80'
          }`}
        >
          <Smartphone className="w-4 h-4 shrink-0" />
          <span className="flex-1 text-left truncate">Cài đặt lên điện thoại</span>
          {isInstallable && (
            <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-emerald-600 text-white">
              Sẵn sàng
            </span>
          )}
        </button>
      )}

      {showGuideModal && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
          onClick={() => setShowGuideModal(false)}
        >
          <div
            className={`w-full max-w-md rounded-2xl border shadow-2xl overflow-hidden ${
              darkMode ? 'bg-slate-900 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-900'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="bg-gradient-to-r from-[#072552] via-[#0d3b7a] to-[#1253a4] text-white px-5 py-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <img
                  src="/pwa-192x192.png"
                  alt="Kho CĐHA"
                  className="w-10 h-10 rounded-xl border border-white/30 shadow-md shrink-0"
                />
                <div className="min-w-0">
                  <h3 className="font-bold text-sm sm:text-base truncate">Cài đặt Kho CĐHA lên Mobile</h3>
                  <p className="text-xs text-sky-200 truncate">Chạy toàn màn hình · Quét mã vạch nhanh</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowGuideModal(false)}
                className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white cursor-pointer"
                aria-label="Đóng"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-sm">
              {isInIframe && (
                <div
                  className={`p-3.5 rounded-xl border text-xs leading-relaxed ${
                    darkMode
                      ? 'bg-amber-900/25 border-amber-700/60 text-amber-200'
                      : 'bg-amber-50 border-amber-200 text-amber-900'
                  }`}
                >
                  <p className="font-bold mb-1 flex items-center gap-1.5">
                    <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                    Lưu ý khi mở trong khung xem trước
                  </p>
                  <p>
                    Trình duyệt di động chỉ cho phép cài đặt ứng dụng khi bạn mở trực tiếp đường dẫn web (không nằm trong khung nhúng). Hãy sao chép link dưới đây và dán vào <strong>Chrome / Cốc Cốc</strong> (Android) hoặc <strong>Safari</strong> (iPhone):
                  </p>
                  <div className="mt-2.5 flex items-center gap-2">
                    <code
                      className={`flex-1 px-2.5 py-1.5 rounded-lg text-[11px] truncate border ${
                        darkMode ? 'bg-slate-800 border-slate-700 text-slate-200' : 'bg-white border-amber-200 text-slate-700'
                      }`}
                    >
                      {typeof window !== 'undefined' ? window.location.origin : ''}
                    </code>
                    <button
                      type="button"
                      onClick={handleCopyUrl}
                      className="px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold flex items-center gap-1 shrink-0 cursor-pointer"
                    >
                      {copiedUrl ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedUrl ? 'Đã chép' : 'Sao chép'}</span>
                    </button>
                  </div>
                </div>
              )}

              {isIOS ? (
                <div className="space-y-3">
                  <p className={`font-bold text-xs uppercase tracking-wider ${darkMode ? 'text-sky-400' : 'text-blue-700'}`}>
                    Hướng dẫn trên iPhone / iPad (Safari)
                  </p>
                  <ol className={`space-y-2.5 text-xs sm:text-sm ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                    <li className="flex items-start gap-2.5">
                      <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                        1
                      </span>
                      <span>
                        Mở trang này bằng trình duyệt <strong>Safari</strong> (không dùng trình duyệt trong Zalo/Facebook).
                      </span>
                    </li>
                    <li className="flex items-start gap-2.5">
                      <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                        2
                      </span>
                      <span className="flex items-center gap-1 flex-wrap">
                        Nhấn nút <strong>Chia sẻ</strong> <Share className="w-4 h-4 inline text-blue-500" /> ở thanh công cụ dưới cùng.
                      </span>
                    </li>
                    <li className="flex items-start gap-2.5">
                      <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                        3
                      </span>
                      <span>
                        Cuộn xuống chọn <strong>Thêm vào MH chính (Add to Home Screen)</strong> rồi nhấn <strong>Thêm</strong>.
                      </span>
                    </li>
                  </ol>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className={`font-bold text-xs uppercase tracking-wider ${darkMode ? 'text-sky-400' : 'text-blue-700'}`}>
                    Hướng dẫn trên Android (Chrome / Cốc Cốc / Edge)
                  </p>
                  <ol className={`space-y-2.5 text-xs sm:text-sm ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                    <li className="flex items-start gap-2.5">
                      <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                        1
                      </span>
                      <span>
                        Mở trực tiếp đường dẫn ứng dụng trong trình duyệt <strong>Chrome</strong> hoặc <strong>Cốc Cốc</strong>.
                      </span>
                    </li>
                    <li className="flex items-start gap-2.5">
                      <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                        2
                      </span>
                      <span className="flex items-center gap-1 flex-wrap">
                        Nhấn nút menu <MoreVertical className="w-4 h-4 inline text-slate-500" /> ở góc trên bên phải trình duyệt và chọn <strong>Thêm vào màn hình chính / Cài đặt ứng dụng</strong>.
                      </span>
                    </li>
                    <li className="flex items-start gap-2.5">
                      <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                        3
                      </span>
                      <span>
                        Khi hộp thoại hiện ra 2 lựa chọn, hãy bấm <strong>Cài đặt</strong> (biểu tượng dấu + có mũi tên tải) thay vì <em>Tạo lối tắt</em> để ứng dụng mở toàn màn hình và lưu quyền Camera tốt hơn.
                      </span>
                    </li>
                  </ol>
                </div>
              )}

              <div className="pt-2 flex justify-end gap-2">
                {isInstallable && !isInIframe && (
                  <button
                    type="button"
                    onClick={async () => {
                      const ok = await install();
                      if (ok) setShowGuideModal(false);
                    }}
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                  >
                    <Download className="w-4 h-4" />
                    <span>Cài đặt ngay</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowGuideModal(false)}
                  className={`px-4 py-2 rounded-xl text-xs font-bold cursor-pointer ${
                    darkMode
                      ? 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                  }`}
                >
                  Đã hiểu
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export function OfflineIndicator() {
  const isOnline = useOnlineStatus();

  if (isOnline) {
    return null;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-20 md:bottom-4 left-4 z-50 flex items-center gap-2 rounded-xl border border-amber-400/60 bg-amber-50/95 px-3.5 py-2 text-xs font-semibold text-amber-900 shadow-lg backdrop-blur-sm dark:border-amber-700 dark:bg-amber-950/95 dark:text-amber-200"
    >
      <WifiOff className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
      <span>Đang ngoại tuyến — Hiển thị dữ liệu đã lưu</span>
    </div>
  );
}

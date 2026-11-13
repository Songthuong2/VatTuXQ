import React, { useState, useEffect, useRef } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { 
  X, 
  Camera, 
  Flashlight, 
  ArrowUpRight, 
  ArrowDownRight, 
  ArrowLeftRight, 
  Plus, 
  Link as LinkIcon, 
  Search, 
  AlertCircle, 
  CheckCircle2, 
  RefreshCw, 
  Upload, 
  Keyboard, 
  ChevronRight,
  Loader2,
  Layers,
  QrCode,
  ShieldCheck,
  ShieldAlert,
  SwitchCamera,
  ExternalLink
} from 'lucide-react';
import { db } from './firebase';
import { collection, addDoc, updateDoc, doc, serverTimestamp } from 'firebase/firestore';
import { toast } from 'sonner';
import { 
  Item, 
  Category, 
  Department, 
  ItemBatch, 
  formatQty, 
  formatDate, 
  getItemBatches, 
  syncBatchesToItem,
  OperationType,
  handleFirestoreError
} from './App';

interface BarcodeScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: Item[];
  categories: Category[];
  departments: Department[];
  darkMode?: boolean;
  isMedical?: boolean;
  currentUserId?: string;
  currentUserName?: string;
}

export function BarcodeScannerModal({
  isOpen,
  onClose,
  items,
  categories,
  departments,
  darkMode,
  isMedical,
  currentUserName
}: BarcodeScannerModalProps) {
  // Scanner & Permission state
  type CameraPermissionState = 'checking' | 'prompt' | 'granted' | 'denied' | 'unsupported';
  const [permissionState, setPermissionState] = useState<CameraPermissionState>('checking');
  const [isRequestingPermission, setIsRequestingPermission] = useState(false);
  const [availableCameras, setAvailableCameras] = useState<{ id: string; label: string }[]>([]);
  const [selectedCameraIdx, setSelectedCameraIdx] = useState<number>(0);
  const [scannerActive, setScannerActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isTorchOn, setIsTorchOn] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);
  const [manualCodeInput, setManualCodeInput] = useState('');
  const [showManualInput, setShowManualInput] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  // Workflow state
  // 'scanning' | 'matched' | 'not-found' | 'link-existing' | 'create-new' | 'transaction'
  const [workflowState, setWorkflowState] = useState<'scanning' | 'matched' | 'not-found' | 'link-existing' | 'create-new' | 'transaction'>('scanning');
  const [scannedCode, setScannedCode] = useState<string>('');
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);

  // Transaction action state (for matched item)
  const [txType, setTxType] = useState<'IN' | 'OUT' | 'TRANSFER'>('IN');
  const [txQuantity, setTxQuantity] = useState<string>('1');
  const [txToDeptId, setTxToDeptId] = useState<string>('');
  const [txFromDeptId, setTxFromDeptId] = useState<string>('');
  const [txBatchNumber, setTxBatchNumber] = useState<string>('');
  const [txBatchExpiry, setTxBatchExpiry] = useState<string>('');
  const [txSelectedBatchId, setTxSelectedBatchId] = useState<string>('AUTO_FEFO');
  const [txNote, setTxNote] = useState<string>('');

  // Link existing item state
  const [linkSearchTerm, setLinkSearchTerm] = useState<string>('');
  const [itemToLink, setItemToLink] = useState<Item | null>(null);

  // Create new item state
  const [newItemName, setNewItemName] = useState<string>('');
  const [newItemCategoryId, setNewItemCategoryId] = useState<string>('');
  const [newItemDepartmentId, setNewItemDepartmentId] = useState<string>('');
  const [newItemUnit, setNewItemUnit] = useState<string>('Cái');
  const [newItemSpecification, setNewItemSpecification] = useState<string>('');
  const [newItemMinStock, setNewItemMinStock] = useState<string>('0');
  const [newItemCurrentStock, setNewItemCurrentStock] = useState<string>('0');
  const [newItemExpiryDate, setNewItemExpiryDate] = useState<string>('');
  const [newItemManufacturer, setNewItemManufacturer] = useState<string>('');
  const [newItemPrice, setNewItemPrice] = useState<string>('0');

  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const isMountedRef = useRef<boolean>(false);
  const scanLockedRef = useRef<boolean>(false);
  const scannerContainerId = 'qr-code-scanner-element';

  const validDepartments = departments.filter(
    d => d.name !== 'Tất cả' && d.name !== 'Tất cả phòng'
  );

  // Sound & Haptic Feedback
  const playScanBeep = () => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1046.5, ctx.currentTime); // C6 note
        gain.gain.setValueAtTime(0.2, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
        osc.start();
        osc.stop(ctx.currentTime + 0.12);
      }
      if ('vibrate' in navigator) {
        navigator.vibrate([70, 40, 70]);
      }
    } catch {
      // Audio or vibration unavailable
    }
  };

  // Stop camera helper
  const stopCamera = async () => {
    const instance = html5QrCodeRef.current;
    if (instance) {
      try {
        if (instance.isScanning) {
          await instance.stop();
        }
        await instance.clear();
      } catch {
        // Ignore if already stopped or DOM unmounted
      }
      html5QrCodeRef.current = null;
    }
    if (isMountedRef.current) {
      setScannerActive(false);
      setIsTorchOn(false);
      setHasTorch(false);
    }
  };

  // Check browser camera permission status without forcing an unprompted error
  const checkCameraPermission = async () => {
    setCameraError(null);
    setPermissionState('checking');

    if (typeof window === 'undefined' || !window.isSecureContext || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setPermissionState('unsupported');
      setCameraError('Trình duyệt hoặc kết nối hiện tại chưa hỗ trợ truy cập Camera trực tiếp (yêu cầu HTTPS). Vui lòng dùng tính năng Chụp / Chọn ảnh hoặc Nhập mã.');
      return;
    }

    try {
      if (navigator.permissions && typeof navigator.permissions.query === 'function') {
        const status = await navigator.permissions.query({ name: 'camera' as PermissionName });
        if (!isMountedRef.current) return;

        status.onchange = () => {
          if (!isMountedRef.current) return;
          if (status.state === 'granted') {
            setPermissionState('granted');
            setCameraError(null);
          } else if (status.state === 'denied') {
            setPermissionState('denied');
          } else {
            setPermissionState('prompt');
          }
        };

        if (status.state === 'granted') {
          setPermissionState('granted');
          await startCamera();
          return;
        }
        if (status.state === 'denied') {
          setPermissionState('denied');
          setCameraError('Quyền truy cập Camera đang bị chặn trên trình duyệt.');
          return;
        }
        setPermissionState('prompt');
        return;
      }
    } catch {
      // Permissions API for 'camera' may not be supported (e.g., iOS Safari / older Firefox)
    }

    // Fallback check via enumerateDevices labels
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(d => d.kind === 'videoinput');
      const alreadyGranted = videoDevices.some(d => Boolean(d.label && d.label.trim().length > 0));
      if (alreadyGranted) {
        setPermissionState('granted');
        await startCamera();
      } else {
        setPermissionState('prompt');
      }
    } catch {
      setPermissionState('prompt');
    }
  };

  // Explicit user-triggered camera permission request
  const requestCameraPermission = async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setPermissionState('unsupported');
      setCameraError('Trình duyệt không hỗ trợ API Camera. Vui lòng dùng nút Chụp / Chọn ảnh hoặc Nhập mã số tay.');
      return;
    }

    setIsRequestingPermission(true);
    setCameraError(null);

    let probeStream: MediaStream | null = null;
    try {
      try {
        probeStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false
        });
      } catch (innerErr: any) {
        if (innerErr?.name === 'OverconstrainedError' || innerErr?.name === 'ConstraintNotSatisfiedError') {
          probeStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false
          });
        } else {
          throw innerErr;
        }
      }

      // Immediately release probe stream so Html5Qrcode can acquire the camera cleanly
      if (probeStream) {
        probeStream.getTracks().forEach(track => track.stop());
      }

      if (!isMountedRef.current) return;
      setPermissionState('granted');
      toast.success('Đã cấp quyền truy cập Camera!');
      await startCamera();
    } catch (err: any) {
      if (probeStream) {
        probeStream.getTracks().forEach(track => track.stop());
      }
      if (!isMountedRef.current) return;

      const errName = err?.name || '';
      if (errName === 'NotAllowedError' || errName === 'PermissionDeniedError' || errName === 'SecurityError') {
        setPermissionState('denied');
        setCameraError('Quyền truy cập Camera đã bị từ chối hoặc bị chặn bởi trình duyệt.');
        toast.error('Chưa được cấp quyền Camera. Vui lòng cho phép trong trình duyệt.');
      } else if (errName === 'NotFoundError' || errName === 'DevicesNotFoundError') {
        setCameraError('Không tìm thấy camera nào trên thiết bị này.');
      } else if (errName === 'NotReadableError' || errName === 'TrackStartError') {
        setCameraError('Camera đang được sử dụng bởi ứng dụng khác. Hãy đóng ứng dụng khác rồi thử lại.');
      } else {
        setCameraError(err?.message || 'Không thể mở camera. Vui lòng thử lại hoặc dùng tính năng Chụp / Chọn ảnh.');
      }
    } finally {
      if (isMountedRef.current) {
        setIsRequestingPermission(false);
      }
    }
  };

  // Start camera scanner
  const startCamera = async (cameraIdOverride?: string) => {
    setCameraError(null);
    scanLockedRef.current = false;
    try {
      await stopCamera();

      // Wait for DOM element to settle
      await new Promise(r => setTimeout(r, 150));
      if (!isMountedRef.current || !isOpen) return;

      const el = document.getElementById(scannerContainerId);
      if (!el) return;

      const html5QrCode = new Html5Qrcode(scannerContainerId);
      html5QrCodeRef.current = html5QrCode;

      const formatsToSupport = [
        Html5QrcodeSupportedFormats.QR_CODE,
        Html5QrcodeSupportedFormats.EAN_13,
        Html5QrcodeSupportedFormats.EAN_8,
        Html5QrcodeSupportedFormats.CODE_128,
        Html5QrcodeSupportedFormats.CODE_39,
        Html5QrcodeSupportedFormats.UPC_A,
        Html5QrcodeSupportedFormats.UPC_E,
        Html5QrcodeSupportedFormats.CODABAR,
        Html5QrcodeSupportedFormats.ITF
      ];

      const config = {
        fps: 15,
        qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
          const minDim = Math.min(viewfinderWidth, viewfinderHeight);
          const boxWidth = Math.floor(Math.min(viewfinderWidth * 0.85, 300));
          const boxHeight = Math.floor(Math.min(boxWidth * 0.65, minDim * 0.7));
          return { width: Math.max(140, boxWidth), height: Math.max(100, boxHeight) };
        },
        aspectRatio: 1.0,
        formatsToSupport
      };

      // Discover available cameras for accurate rear selection & switching
      let detectedCameras: { id: string; label: string }[] = [];
      try {
        const cams = await Html5Qrcode.getCameras();
        if (cams && cams.length > 0) {
          detectedCameras = cams.map(c => ({ id: c.id, label: c.label || `Camera` }));
          if (isMountedRef.current) {
            setAvailableCameras(detectedCameras);
          }
        }
      } catch {
        // Ignore enumeration error; proceed with facingMode
      }

      let cameraTarget: string | { facingMode: string } = { facingMode: 'environment' };
      if (cameraIdOverride) {
        cameraTarget = cameraIdOverride;
      } else if (detectedCameras.length > 0) {
        const rearIdx = detectedCameras.findIndex(c =>
          /back|rear|environment|sau/i.test(c.label)
        );
        const chosenIdx = rearIdx >= 0 ? rearIdx : 0;
        if (isMountedRef.current) setSelectedCameraIdx(chosenIdx);
        cameraTarget = detectedCameras[chosenIdx].id;
      }

      const onDecoded = (decodedText: string) => {
        if (!scanLockedRef.current) {
          scanLockedRef.current = true;
          handleBarcodeDetected(decodedText);
        }
      };

      try {
        await html5QrCode.start(cameraTarget, config, onDecoded, () => {});
      } catch (startErr: any) {
        // Fallback to any user/default camera if environment camera is unavailable
        if (!cameraIdOverride && typeof cameraTarget !== 'string') {
          await html5QrCode.start({ facingMode: 'user' }, config, onDecoded, () => {});
        } else {
          throw startErr;
        }
      }

      if (!isMountedRef.current) {
        await stopCamera();
        return;
      }

      setPermissionState('granted');
      setScannerActive(true);

      // Check if torch is available
      try {
        const capabilities = html5QrCode.getRunningTrackCapabilities();
        if (capabilities && (capabilities as any).torch) {
          setHasTorch(true);
        }
      } catch {
        setHasTorch(false);
      }
    } catch (err: any) {
      console.warn('Failed to start camera scanner:', err);
      if (isMountedRef.current) {
        const errStr = String(err?.name || err?.message || err || '');
        if (/NotAllowed|Permission|denied|SecurityError/i.test(errStr)) {
          setPermissionState('denied');
          setCameraError('Quyền truy cập Camera đã bị từ chối hoặc chưa được cấp.');
        } else {
          setCameraError(
            err?.message ||
            'Không thể mở camera. Vui lòng cấp quyền truy cập máy ảnh trong trình duyệt hoặc sử dụng tính năng tải ảnh / nhập mã.'
          );
        }
        setScannerActive(false);
      }
    }
  };

  // Switch between front/back cameras when multiple cameras exist
  const handleSwitchCamera = async () => {
    if (availableCameras.length < 2) return;
    const nextIdx = (selectedCameraIdx + 1) % availableCameras.length;
    setSelectedCameraIdx(nextIdx);
    await startCamera(availableCameras[nextIdx].id);
  };

  // Toggle flashlight
  const toggleTorch = async () => {
    if (!html5QrCodeRef.current || !scannerActive) return;
    try {
      await html5QrCodeRef.current.applyVideoConstraints({
        advanced: [{ torch: !isTorchOn } as any]
      });
      setIsTorchOn(!isTorchOn);
    } catch {
      toast.error('Thiết bị không hỗ trợ bật đèn flash cho camera này.');
    }
  };

  // File upload barcode scanner
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsProcessing(true);
    try {
      await stopCamera();
      const scanner = new Html5Qrcode(scannerContainerId);
      html5QrCodeRef.current = scanner;
      const decodedText = await scanner.scanFile(file, true);
      try {
        await scanner.clear();
      } catch {
        // ignore
      }
      html5QrCodeRef.current = null;
      handleBarcodeDetected(decodedText);
    } catch {
      toast.error('Không tìm thấy mã vạch trong ảnh đã chọn. Vui lòng chụp rõ nét hơn.');
      if (permissionState === 'granted') {
        startCamera();
      }
    } finally {
      setIsProcessing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Helper to configure default departments for selected item
  const initTransactionDefaults = (item: Item, targetType: 'IN' | 'OUT' | 'TRANSFER') => {
    const sourceDept = item.departmentId || validDepartments[0]?.id || '';
    setTxFromDeptId(sourceDept);
    if (targetType === 'TRANSFER') {
      const altDept = validDepartments.find(d => d.id !== sourceDept);
      setTxToDeptId(altDept?.id || sourceDept);
    } else {
      setTxToDeptId(sourceDept);
    }
    setTxQuantity('1');
    setTxBatchNumber('');
    setTxBatchExpiry('');
    setTxSelectedBatchId('AUTO_FEFO');
    setTxNote('');
  };

  // Main barcode detection handler
  const handleBarcodeDetected = (rawCode: string) => {
    const code = rawCode.trim();
    if (!code) return;

    playScanBeep();
    stopCamera();
    setScannedCode(code);

    // Look for matching item in local items database
    const codeLower = code.toLowerCase();
    const matched = items.find(i =>
      (i.barcode && i.barcode.trim().toLowerCase() === codeLower) ||
      (i.code && i.code.trim().toLowerCase() === codeLower) ||
      i.id.toLowerCase() === codeLower
    );

    if (matched) {
      setSelectedItem(matched);
      setWorkflowState('matched');
      initTransactionDefaults(matched, 'IN');
      toast.success(`Đã nhận diện: ${matched.name}`);
    } else {
      setSelectedItem(null);
      setWorkflowState('not-found');
      // Pre-fill creation form with scanned code
      setNewItemName('');
      setNewItemCategoryId(categories[0]?.id || '');
      setNewItemDepartmentId(validDepartments[0]?.id || '');
      setNewItemUnit('Cái');
      setNewItemSpecification('');
      setNewItemMinStock('0');
      setNewItemCurrentStock('0');
      setNewItemExpiryDate('');
      setNewItemManufacturer('');
      setNewItemPrice('0');
    }
  };

  // Handle open/close lifecycle
  useEffect(() => {
    isMountedRef.current = true;
    if (isOpen) {
      setWorkflowState('scanning');
      setScannedCode('');
      setSelectedItem(null);
      setShowManualInput(false);
      setManualCodeInput('');
      setCameraError(null);
      checkCameraPermission();
    } else {
      stopCamera();
    }
    return () => {
      isMountedRef.current = false;
      stopCamera();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Restart scanning
  const handleRestartScan = () => {
    setWorkflowState('scanning');
    setScannedCode('');
    setSelectedItem(null);
    setItemToLink(null);
    setManualCodeInput('');
    checkCameraPermission();
  };

  // 1. Submit Link Barcode to Existing Item
  const handleConfirmLinkItem = async () => {
    if (!itemToLink || !scannedCode) return;
    setIsProcessing(true);
    try {
      const updatePayload: Record<string, string> = {
        barcode: scannedCode.slice(0, 100)
      };
      if (!itemToLink.code) {
        updatePayload.code = scannedCode.slice(0, 50);
      }
      await updateDoc(doc(db, 'items', itemToLink.id), updatePayload);

      toast.success(`Đã gán mã vạch "${scannedCode}" cho "${itemToLink.name}" thành công!`);
      const updated = { ...itemToLink, ...updatePayload };
      setSelectedItem(updated);
      initTransactionDefaults(updated, 'IN');
      setWorkflowState('matched');
    } catch (err: any) {
      toast.error('Lỗi khi cập nhật mã vạch: ' + (err?.message || 'Vui lòng thử lại'));
      handleFirestoreError(err, OperationType.UPDATE, `items/${itemToLink.id}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // 2. Submit Create New Item with Scanned Barcode
  const handleCreateNewItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemName.trim()) {
      toast.error('Vui lòng nhập tên vật tư');
      return;
    }
    const chosenCatId = newItemCategoryId || categories[0]?.id || '';
    if (!chosenCatId) {
      toast.error('Vui lòng tạo ít nhất một nhóm vật tư trước khi thêm mới');
      return;
    }

    setIsProcessing(true);
    try {
      const minStockNum = Math.max(0, parseFloat(newItemMinStock) || 0);
      const currentStockNum = Math.max(0, parseFloat(newItemCurrentStock) || 0);
      const priceNum = Math.max(0, parseFloat(newItemPrice) || 0);

      const initialBatches: ItemBatch[] = (currentStockNum > 0 || newItemExpiryDate) ? [{
        id: `batch-${Date.now()}`,
        batchNumber: 'Lô 01',
        quantity: currentStockNum,
        expiryDate: newItemExpiryDate,
        importDate: new Date().toISOString().split('T')[0],
        note: 'Tạo nhanh từ Quét mã vạch'
      }] : [];

      const docRef = await addDoc(collection(db, 'items'), {
        name: newItemName.trim().slice(0, 200),
        code: scannedCode.slice(0, 50),
        barcode: scannedCode.slice(0, 100),
        categoryId: chosenCatId,
        departmentId: newItemDepartmentId || '',
        unit: (newItemUnit.trim() || 'Cái').slice(0, 50),
        specification: newItemSpecification.trim().slice(0, 200),
        manufacturer: newItemManufacturer.trim().slice(0, 200),
        minStock: minStockNum,
        currentStock: currentStockNum,
        expiryDate: newItemExpiryDate || '',
        price: priceNum,
        batches: initialBatches,
        createdAt: serverTimestamp()
      });

      // Add initial IN transaction if currentStock > 0
      if (currentStockNum > 0) {
        await addDoc(collection(db, 'transactions'), {
          code: `PN-SCAN-${Date.now().toString().slice(-6)}`,
          itemId: docRef.id,
          type: 'IN',
          quantity: currentStockNum,
          unitPrice: priceNum,
          totalAmount: currentStockNum * priceNum,
          toDeptId: newItemDepartmentId || '',
          batchId: initialBatches[0]?.id || '',
          batchNumber: 'Lô 01',
          batchExpiry: newItemExpiryDate,
          performer: currentUserName || 'Cán bộ kho',
          timestamp: serverTimestamp(),
          note: `Nhập kho ban đầu khi quét mã vạch ${scannedCode}`
        });
      }

      toast.success(`Đã thêm mới vật tư "${newItemName.trim()}" thành công!`);

      const createdObj: Item = {
        id: docRef.id,
        name: newItemName.trim(),
        code: scannedCode,
        barcode: scannedCode,
        categoryId: chosenCatId,
        departmentId: newItemDepartmentId || '',
        unit: newItemUnit.trim() || 'Cái',
        specification: newItemSpecification.trim(),
        manufacturer: newItemManufacturer.trim(),
        minStock: minStockNum,
        currentStock: currentStockNum,
        expiryDate: newItemExpiryDate || '',
        price: priceNum,
        batches: initialBatches
      };

      setSelectedItem(createdObj);
      initTransactionDefaults(createdObj, 'IN');
      setWorkflowState('matched');
    } catch (err: any) {
      toast.error('Lỗi khi tạo vật tư: ' + (err?.message || 'Vui lòng thử lại'));
      handleFirestoreError(err, OperationType.CREATE, 'items');
    } finally {
      setIsProcessing(false);
    }
  };

  // 3. Submit Quick Transaction (IN / OUT / TRANSFER) for Matched Item
  const handleExecuteTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem) return;

    const qty = parseFloat(txQuantity);
    if (isNaN(qty) || qty <= 0) {
      toast.error('Số lượng giao dịch phải lớn hơn 0');
      return;
    }

    if ((txType === 'OUT' || txType === 'TRANSFER') && qty > selectedItem.currentStock) {
      toast.error(`Số lượng xuất (${formatQty(qty)}) vượt quá tồn kho hiện tại (${formatQty(selectedItem.currentStock)})!`);
      return;
    }

    if (txType === 'TRANSFER' && validDepartments.length > 1 && txFromDeptId && txToDeptId && txFromDeptId === txToDeptId) {
      toast.error('Phòng nhận phải khác phòng nguồn khi chuyển kho!');
      return;
    }

    setIsProcessing(true);
    try {
      // Normalize batches using shared helper so legacy items without `batches` array never lose stock
      const batches: ItemBatch[] = JSON.parse(JSON.stringify(getItemBatches(selectedItem)));
      let recordedBatchNumber = txBatchNumber.trim();
      let recordedBatchExpiry = txBatchExpiry.trim();
      let recordedBatchId = '';

      if (txType === 'IN') {
        const targetExpiry = recordedBatchExpiry;
        const existingIdx = batches.findIndex(b => (b.expiryDate || '').trim() === targetExpiry);

        if (existingIdx >= 0) {
          const matched = batches[existingIdx];
          const updatedQty = Number((matched.quantity + qty).toFixed(10));
          batches[existingIdx] = {
            ...matched,
            quantity: updatedQty
          };
          recordedBatchNumber = matched.batchNumber;
          recordedBatchExpiry = matched.expiryDate || '';
          recordedBatchId = matched.id;
        } else {
          let lotName = recordedBatchNumber;
          if (!lotName) {
            let nextNum = batches.length + 1;
            lotName = `Lô ${String(nextNum).padStart(2, '0')}`;
            while (batches.some(b => b.batchNumber.trim().toLowerCase() === lotName.toLowerCase())) {
              nextNum++;
              lotName = `Lô ${String(nextNum).padStart(2, '0')}`;
            }
          }
          const newBatchId = `batch-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
          batches.push({
            id: newBatchId,
            batchNumber: lotName,
            quantity: qty,
            expiryDate: targetExpiry,
            importDate: new Date().toISOString().split('T')[0],
            note: txNote ? `Quét mã: ${txNote}` : 'Nhập qua quét mã vạch'
          });
          recordedBatchNumber = lotName;
          recordedBatchExpiry = targetExpiry;
          recordedBatchId = newBatchId;
        }
      } else {
        // OUT or TRANSFER: specific batch or Auto-FEFO lot deduction
        if (txSelectedBatchId && txSelectedBatchId !== 'AUTO_FEFO') {
          const bIdx = batches.findIndex(b => b.id === txSelectedBatchId);
          if (bIdx >= 0) {
            if (batches[bIdx].quantity < qty) {
              toast.error(`Số lượng (${formatQty(qty)}) vượt quá tồn của ${batches[bIdx].batchNumber} (${formatQty(batches[bIdx].quantity)})!`);
              setIsProcessing(false);
              return;
            }
            batches[bIdx] = {
              ...batches[bIdx],
              quantity: Number((batches[bIdx].quantity - qty).toFixed(10))
            };
            recordedBatchId = batches[bIdx].id;
            recordedBatchNumber = batches[bIdx].batchNumber;
            recordedBatchExpiry = batches[bIdx].expiryDate || '';
          }
        }

        if (!recordedBatchId) {
          let rem = qty;
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
            if (!recordedBatchId) {
              recordedBatchId = orig.id;
              recordedBatchExpiry = orig.expiryDate || '';
            }
          }
          recordedBatchNumber = deductedLots.join(', ') || 'FEFO';
        }
      }

      // Sync stock and earliest expiry consistently with App.tsx
      const { currentStock: newStock, expiryDate: newExpiryDate } = syncBatchesToItem(batches);

      const unitPrice = Number(selectedItem.price) || 0;

      // 1. Add transaction record
      await addDoc(collection(db, 'transactions'), {
        code: `${txType === 'IN' ? 'PN' : txType === 'OUT' ? 'PX' : 'PC'}-${Date.now().toString().slice(-6)}`,
        itemId: selectedItem.id,
        type: txType,
        quantity: qty,
        unitPrice,
        totalAmount: qty * unitPrice,
        fromDeptId: txType === 'TRANSFER' ? txFromDeptId : '',
        toDeptId: txType === 'TRANSFER' || txType === 'OUT' ? txToDeptId : '',
        batchId: recordedBatchId,
        batchNumber: recordedBatchNumber,
        batchExpiry: recordedBatchExpiry,
        note: txNote ? `[Quét mã ${scannedCode}] ${txNote}` : `Giao dịch qua quét mã vạch ${scannedCode}`,
        performer: currentUserName || 'Cán bộ kho',
        timestamp: serverTimestamp()
      });

      // 2. Update item document
      await updateDoc(doc(db, 'items', selectedItem.id), {
        batches,
        currentStock: newStock,
        expiryDate: newExpiryDate
      });

      const typeLabel = txType === 'IN' ? 'Nhập kho' : txType === 'OUT' ? 'Xuất kho' : 'Chuyển kho';
      toast.success(`Đã thực hiện ${typeLabel} thành công: ${formatQty(qty)} ${selectedItem.unit}!`);

      // Update local item representation
      const updatedItem: Item = {
        ...selectedItem,
        batches,
        currentStock: newStock,
        expiryDate: newExpiryDate
      };
      setSelectedItem(updatedItem);

      // Return to matched overview
      setWorkflowState('matched');
      setTxQuantity('1');
      setTxNote('');
      setTxBatchNumber('');
      setTxBatchExpiry('');
      setTxSelectedBatchId('AUTO_FEFO');
    } catch (err: any) {
      toast.error('Lỗi khi thực hiện giao dịch: ' + (err?.message || 'Vui lòng thử lại'));
      handleFirestoreError(err, OperationType.WRITE, `transactions/items/${selectedItem.id}`);
    } finally {
      setIsProcessing(false);
    }
  };

  if (!isOpen) return null;

  // Filter items for linking
  const filteredItemsToLink = items.filter(item => {
    if (!linkSearchTerm.trim()) return true;
    const term = linkSearchTerm.toLowerCase();
    return (
      item.name.toLowerCase().includes(term) ||
      (item.code && item.code.toLowerCase().includes(term)) ||
      (item.barcode && item.barcode.toLowerCase().includes(term)) ||
      (item.specification && item.specification.toLowerCase().includes(term)) ||
      (item.manufacturer && item.manufacturer.toLowerCase().includes(term))
    );
  }).slice(0, 12);

  const matchedCategory = selectedItem ? categories.find(c => c.id === selectedItem.categoryId) : null;
  const matchedDepartment = selectedItem ? departments.find(d => d.id === selectedItem.departmentId) : null;
  const matchedActiveBatches = selectedItem ? getItemBatches(selectedItem).filter(b => b.quantity > 0) : [];

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-2.5 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div
        className={`w-full max-w-lg rounded-3xl border shadow-2xl flex flex-col max-h-[94vh] overflow-hidden transition-all ${
          darkMode
            ? 'bg-slate-900 border-slate-700/80 text-white'
            : 'bg-white border-slate-200 text-slate-900'
        }`}
      >
        {/* Top Header */}
        <div className={`px-4 sm:px-5 py-3.5 border-b flex items-center justify-between shrink-0 ${
          darkMode ? 'border-slate-800 bg-slate-900/90' : 'border-slate-100 bg-slate-50/80'
        }`}>
          <div className="flex items-center gap-2.5 min-w-0">
            <div className={`p-2 rounded-xl shrink-0 ${
              isMedical
                ? 'bg-blue-600 text-white'
                : darkMode ? 'bg-blue-900/50 text-blue-400' : 'bg-blue-50 text-blue-600'
            }`}>
              <Camera className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm sm:text-base font-black tracking-tight flex items-center gap-2">
                <span className="truncate">Quét mã vạch / QR</span>
                <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 shrink-0">
                  Mobile Live
                </span>
              </h3>
              <p className="text-[11px] text-slate-400 line-clamp-1">
                Tự động nhận diện mã vạch vỏ hộp, bao bì vật tư
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {scannerActive && availableCameras.length > 1 && (
              <button
                type="button"
                onClick={handleSwitchCamera}
                className={`p-2 rounded-xl border transition-all cursor-pointer ${
                  darkMode ? 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
                title="Đổi camera (Trước / Sau)"
              >
                <SwitchCamera className="w-4 h-4" />
              </button>
            )}

            {scannerActive && hasTorch && (
              <button
                type="button"
                onClick={toggleTorch}
                className={`p-2 rounded-xl border transition-all cursor-pointer ${
                  isTorchOn
                    ? 'bg-amber-500 text-white border-amber-400 shadow-md shadow-amber-500/30'
                    : darkMode ? 'bg-slate-800 border-slate-700 text-slate-300' : 'bg-white border-slate-200 text-slate-600'
                }`}
                title={isTorchOn ? 'Tắt đèn flash' : 'Bật đèn flash'}
              >
                <Flashlight className="w-4 h-4" />
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className={`p-2 rounded-xl border transition-colors cursor-pointer ${
                darkMode ? 'border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800' : 'border-slate-200 text-slate-500 hover:text-slate-900 hover:bg-slate-100'
              }`}
              title="Đóng"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 custom-scrollbar">

          {/* 1. SCANNING STATE */}
          {workflowState === 'scanning' && (
            <div className="flex flex-col items-center">
              {/* Camera Permission Status Strip */}
              <div className={`w-full mb-3 px-3 py-2 rounded-xl border flex items-center justify-between gap-2 text-xs ${
                permissionState === 'granted'
                  ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-700 dark:text-emerald-300'
                  : permissionState === 'denied' || permissionState === 'unsupported'
                  ? 'bg-rose-500/10 border-rose-500/25 text-rose-700 dark:text-rose-300'
                  : 'bg-blue-500/10 border-blue-500/25 text-blue-700 dark:text-blue-300'
              }`}>
                <div className="flex items-center gap-2 min-w-0">
                  {permissionState === 'granted' ? (
                    <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
                  ) : permissionState === 'denied' || permissionState === 'unsupported' ? (
                    <ShieldAlert className="w-4 h-4 text-rose-500 shrink-0" />
                  ) : (
                    <Camera className="w-4 h-4 text-blue-500 shrink-0" />
                  )}
                  <span className="font-bold truncate">
                    {permissionState === 'checking' && 'Đang kiểm tra quyền Camera...'}
                    {permissionState === 'prompt' && 'Chưa cấp quyền Camera cho ứng dụng'}
                    {permissionState === 'granted' && 'Đã cấp quyền truy cập Camera'}
                    {permissionState === 'denied' && 'Quyền Camera đang bị trình duyệt chặn'}
                    {permissionState === 'unsupported' && 'Thiết bị/Kết nối không hỗ trợ Camera trực tiếp'}
                  </span>
                </div>

                {permissionState !== 'granted' && permissionState !== 'unsupported' && (
                  <button
                    type="button"
                    onClick={requestCameraPermission}
                    disabled={isRequestingPermission}
                    className="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-bold shrink-0 cursor-pointer flex items-center gap-1"
                  >
                    {isRequestingPermission && <Loader2 className="w-3 h-3 animate-spin" />}
                    <span>Cấp quyền</span>
                  </button>
                )}
              </div>

              {/* Camera Frame Container */}
              <div className="w-full relative rounded-2xl overflow-hidden bg-slate-950 aspect-square max-h-[300px] sm:max-h-[340px] flex items-center justify-center border-2 border-dashed border-blue-500/40 shadow-inner">
                {/* HTML5 QR Container Target */}
                <div
                  id={scannerContainerId}
                  className="w-full h-full [&_video]:w-full [&_video]:h-full [&_video]:object-cover"
                />

                {/* Simulated Overlay Laser Line when scanning */}
                {scannerActive && (
                  <div className="absolute inset-0 pointer-events-none flex flex-col justify-center items-center">
                    <div className="w-[80%] h-[58%] border-2 border-emerald-400/80 rounded-xl relative shadow-[0_0_15px_rgba(52,211,153,0.3)]">
                      <div className="absolute -top-1 -left-1 w-4 h-4 border-t-2 border-l-2 border-emerald-400 rounded-tl" />
                      <div className="absolute -top-1 -right-1 w-4 h-4 border-t-2 border-r-2 border-emerald-400 rounded-tr" />
                      <div className="absolute -bottom-1 -left-1 w-4 h-4 border-b-2 border-l-2 border-emerald-400 rounded-bl" />
                      <div className="absolute -bottom-1 -right-1 w-4 h-4 border-b-2 border-r-2 border-emerald-400 rounded-br" />
                      <div className="w-full h-0.5 bg-gradient-to-r from-transparent via-red-500 to-transparent absolute top-1/2 -translate-y-1/2 animate-pulse shadow-[0_0_10px_red]" />
                    </div>
                  </div>
                )}

                {/* Permission Request Prompt Overlay (when state === 'prompt' or 'checking') */}
                {!scannerActive && !cameraError && (permissionState === 'prompt' || permissionState === 'checking') && (
                  <div className="absolute inset-0 bg-slate-900/95 flex flex-col items-center justify-center p-5 text-center text-white">
                    <div className="w-14 h-14 rounded-2xl bg-blue-600/20 border border-blue-500/40 flex items-center justify-center mb-3">
                      <Camera className="w-7 h-7 text-blue-400" />
                    </div>
                    <h4 className="text-sm font-black mb-1.5">
                      Yêu cầu quyền truy cập Camera
                    </h4>
                    <p className="text-xs text-slate-300 leading-relaxed mb-4 max-w-[270px]">
                      Cho phép trình duyệt mở máy ảnh để quét trực tiếp mã vạch / mã QR trên vỏ hộp vật tư y tế.
                    </p>
                    <button
                      type="button"
                      onClick={requestCameraPermission}
                      disabled={isRequestingPermission || permissionState === 'checking'}
                      className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-xs font-bold text-white shadow-lg shadow-blue-600/30 flex items-center gap-2 cursor-pointer active:scale-95 transition-all"
                    >
                      {isRequestingPermission ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <ShieldCheck className="w-4 h-4" />
                      )}
                      <span>{isRequestingPermission ? 'Đang xin quyền...' : 'Cấp quyền & Bật Camera'}</span>
                    </button>
                  </div>
                )}

                {/* Error / Permission Denied Fallback */}
                {(cameraError || permissionState === 'denied' || permissionState === 'unsupported') && !scannerActive && (
                  <div className="absolute inset-0 bg-slate-900/95 flex flex-col items-center justify-center p-5 text-center text-white overflow-y-auto">
                    <ShieldAlert className="w-9 h-9 text-rose-500 mb-2 shrink-0" />
                    <p className="text-xs font-bold mb-1.5 text-white">
                      {permissionState === 'denied' ? 'Chưa có quyền truy cập Camera' : 'Không thể khởi động Camera'}
                    </p>
                    <p className="text-[11px] font-medium mb-3 leading-relaxed text-slate-300 max-w-[290px]">
                      {cameraError || 'Vui lòng cấp quyền Máy ảnh (Camera) trong cài đặt trình duyệt.'}
                    </p>

                    {permissionState === 'denied' && (
                      <div className="text-left text-[11px] text-slate-300 bg-slate-800/90 border border-slate-700 rounded-xl p-2.5 mb-3 w-full max-w-[300px] space-y-1">
                        <p className="font-bold text-amber-300">Cách bật lại nhanh:</p>
                        <p>1. Nhấn biểu tượng <b>Khóa / Máy ảnh</b> trên thanh địa chỉ trình duyệt.</p>
                        <p>2. Chuyển mục <b>Máy ảnh (Camera)</b> sang <b>Cho phép (Allow)</b>.</p>
                        <p>3. Nhấn <b>Yêu cầu lại quyền Camera</b> bên dưới.</p>
                      </div>
                    )}

                    <div className="flex flex-wrap items-center justify-center gap-2">
                      {permissionState !== 'unsupported' && (
                        <button
                          type="button"
                          onClick={requestCameraPermission}
                          disabled={isRequestingPermission}
                          className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-xs font-bold text-white shadow-md flex items-center gap-1.5 cursor-pointer"
                        >
                          {isRequestingPermission ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                          <span>Yêu cầu lại quyền Camera</span>
                        </button>
                      )}

                      {typeof window !== 'undefined' && window.self !== window.top && (
                        <a
                          href={window.location.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-600 text-xs font-bold text-slate-200 flex items-center gap-1.5"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          <span>Mở tab riêng</span>
                        </a>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <p className="text-center text-xs text-slate-400 mt-2.5 px-4 leading-relaxed">
                Đưa mã vạch (EAN, Code 128) hoặc mã QR vào giữa khung hình chữ nhật.
              </p>

              {/* Action Fallbacks: File upload & Manual Typing */}
              <div className="w-full grid grid-cols-2 gap-2.5 mt-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                <input
                  type="file"
                  ref={fileInputRef}
                  accept="image/*"
                  capture="environment"
                  onChange={handleFileUpload}
                  className="hidden"
                />

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isProcessing}
                  className={`py-2.5 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    darkMode
                      ? 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700'
                      : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <Upload className="w-4 h-4 text-emerald-500" />
                  <span>Chụp / Chọn ảnh</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowManualInput(!showManualInput)}
                  className={`py-2.5 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    showManualInput
                      ? 'bg-blue-600 border-blue-600 text-white'
                      : darkMode ? 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700' : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <Keyboard className="w-4 h-4 text-blue-500" />
                  <span>Nhập mã số tay</span>
                </button>
              </div>

              {/* Manual code input drop */}
              {showManualInput && (
                <div className={`w-full mt-3 p-3 rounded-xl border animate-in fade-in ${
                  darkMode ? 'bg-slate-800/80 border-slate-700' : 'bg-blue-50/50 border-blue-200'
                }`}>
                  <label className="text-[11px] font-bold text-slate-400 block mb-1">
                    Nhập mã vạch hoặc mã vật tư:
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Ví dụ: 8935001234567 hoặc VT-XQ-01"
                      value={manualCodeInput}
                      onChange={(e) => setManualCodeInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && manualCodeInput.trim()) {
                          e.preventDefault();
                          handleBarcodeDetected(manualCodeInput);
                        }
                      }}
                      className={`flex-1 px-3 py-2 text-xs font-mono font-bold rounded-xl border outline-none focus:ring-2 focus:ring-blue-500 ${
                        darkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-white border-slate-300 text-slate-900'
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (manualCodeInput.trim()) {
                          handleBarcodeDetected(manualCodeInput);
                        }
                      }}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition-all shadow-xs cursor-pointer"
                    >
                      Tra cứu
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 2. MATCHED STATE: ITEM FOUND IN DATABASE */}
          {workflowState === 'matched' && selectedItem && (
            <div className="space-y-4 animate-in fade-in duration-200">
              {/* Success Badge Banner */}
              <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <CheckCircle2 className="w-5 h-5 shrink-0" />
                  <span className="text-xs font-bold uppercase tracking-wider truncate">
                    Đã khớp vật tư trong kho
                  </span>
                </div>
                <span className="font-mono text-xs px-2 py-0.5 rounded bg-emerald-600 text-white font-bold shrink-0 max-w-[140px] truncate">
                  {scannedCode}
                </span>
              </div>

              {/* Matched Item Summary Card */}
              <div className={`p-4 rounded-2xl border ${
                darkMode ? 'bg-slate-800/80 border-slate-700' : 'bg-slate-50 border-slate-200'
              }`}>
                <h4 className="text-base font-black leading-snug">
                  {selectedItem.name}
                </h4>

                <div className="flex flex-wrap items-center gap-2 mt-2">
                  {matchedCategory && (
                    <span className={`text-[11px] px-2 py-0.5 rounded-md font-semibold ${
                      darkMode ? 'bg-slate-700 text-slate-300' : 'bg-white text-slate-700 border border-slate-200'
                    }`}>
                      {matchedCategory.name}
                    </span>
                  )}
                  {matchedDepartment && matchedDepartment.name !== '-' && (
                    <span className={`text-[11px] px-2 py-0.5 rounded-md font-semibold ${
                      darkMode ? 'bg-indigo-950/60 text-indigo-300 border border-indigo-800/40' : 'bg-indigo-50 text-indigo-700 border border-indigo-100'
                    }`}>
                      {matchedDepartment.name}
                    </span>
                  )}
                  {selectedItem.code && (
                    <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 font-bold border border-blue-100 dark:border-blue-800">
                      Mã: {selectedItem.code}
                    </span>
                  )}
                  <span className="text-xs text-slate-400 font-medium">
                    Đơn vị: <b>{selectedItem.unit}</b>
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 mt-3 pt-3 border-t border-slate-200 dark:border-slate-700 text-xs">
                  <div>
                    <span className="text-[11px] text-slate-400 block uppercase font-semibold">Tồn kho hiện tại:</span>
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-black text-blue-600 dark:text-blue-400">
                        {formatQty(selectedItem.currentStock)} {selectedItem.unit}
                      </span>
                      {matchedActiveBatches.length > 0 && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-500/10 text-purple-600 dark:text-purple-300 border border-purple-500/20">
                          <Layers className="w-3 h-3" /> {matchedActiveBatches.length} lô
                        </span>
                      )}
                    </div>
                  </div>
                  <div>
                    <span className="text-[11px] text-slate-400 block uppercase font-semibold">Hạn dùng gần nhất:</span>
                    <span className="text-sm font-bold text-amber-600 dark:text-amber-400">
                      {selectedItem.expiryDate ? formatDate(selectedItem.expiryDate) : 'Chưa cập nhật'}
                    </span>
                  </div>
                </div>
              </div>

              {/* 3 Actions: Nhập kho, Xuất kho, Chuyển kho */}
              <div>
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-2">
                  Chọn thao tác cần thực hiện:
                </span>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setTxType('IN');
                      initTransactionDefaults(selectedItem, 'IN');
                      setWorkflowState('transaction');
                    }}
                    className="p-3 rounded-2xl bg-gradient-to-b from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white shadow-md shadow-emerald-500/20 font-bold text-xs flex flex-col items-center justify-center gap-1.5 transition-all active:scale-95 cursor-pointer"
                  >
                    <ArrowUpRight className="w-5 h-5" />
                    <span>NHẬP KHO</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setTxType('OUT');
                      initTransactionDefaults(selectedItem, 'OUT');
                      setWorkflowState('transaction');
                    }}
                    className="p-3 rounded-2xl bg-gradient-to-b from-rose-500 to-rose-600 hover:from-rose-600 hover:to-rose-700 text-white shadow-md shadow-rose-500/20 font-bold text-xs flex flex-col items-center justify-center gap-1.5 transition-all active:scale-95 cursor-pointer"
                  >
                    <ArrowDownRight className="w-5 h-5" />
                    <span>XUẤT KHO</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setTxType('TRANSFER');
                      initTransactionDefaults(selectedItem, 'TRANSFER');
                      setWorkflowState('transaction');
                    }}
                    className="p-3 rounded-2xl bg-gradient-to-b from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 text-white shadow-md shadow-indigo-500/20 font-bold text-xs flex flex-col items-center justify-center gap-1.5 transition-all active:scale-95 cursor-pointer"
                  >
                    <ArrowLeftRight className="w-5 h-5" />
                    <span>CHUYỂN KHO</span>
                  </button>
                </div>
              </div>

              {/* Secondary action: Scan another */}
              <button
                type="button"
                onClick={handleRestartScan}
                className={`w-full py-2.5 rounded-xl border text-xs font-bold transition-all flex items-center justify-center gap-1.5 mt-2 cursor-pointer ${
                  darkMode ? 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700' : 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200'
                }`}
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Quét tiếp vật tư khác</span>
              </button>
            </div>
          )}

          {/* 3. TRANSACTION EXECUTION STATE (Nhập / Xuất / Chuyển) */}
          {workflowState === 'transaction' && selectedItem && (
            <form onSubmit={handleExecuteTransaction} className="space-y-4 animate-in fade-in duration-200">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`px-2.5 py-1 rounded-xl text-xs font-black text-white shrink-0 ${
                    txType === 'IN' ? 'bg-emerald-600' : txType === 'OUT' ? 'bg-rose-600' : 'bg-indigo-600'
                  }`}>
                    {txType === 'IN' ? 'NHẬP KHO' : txType === 'OUT' ? 'XUẤT KHO' : 'CHUYỂN KHO'}
                  </span>
                  <span className="text-xs font-bold truncate">
                    {selectedItem.name}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setWorkflowState('matched')}
                  className="text-xs text-blue-500 font-bold hover:underline shrink-0 cursor-pointer"
                >
                  Quay lại
                </button>
              </div>

              {/* Quantity Input */}
              <div>
                <label className="text-xs font-bold uppercase text-slate-400 block mb-1">
                  Số lượng ({selectedItem.unit}) *
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    step="any"
                    min="0.001"
                    required
                    value={txQuantity}
                    onChange={(e) => setTxQuantity(e.target.value)}
                    className={`flex-1 min-w-0 px-3.5 py-2.5 text-base font-black rounded-xl border focus:ring-2 focus:ring-blue-500 outline-none ${
                      darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
                    }`}
                  />
                  {/* Quick Preset Buttons */}
                  <div className="flex gap-1 shrink-0">
                    {[1, 5, 10, 20].map(n => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setTxQuantity(n.toString())}
                        className={`px-2 py-2 text-xs font-bold rounded-lg border transition-all cursor-pointer ${
                          txQuantity === n.toString()
                            ? 'bg-blue-600 text-white border-blue-600'
                            : darkMode ? 'bg-slate-800 border-slate-700 text-slate-300' : 'bg-slate-100 border-slate-200 text-slate-700'
                        }`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
                {(txType === 'OUT' || txType === 'TRANSFER') && (
                  <span className="text-[11px] text-slate-400 mt-1 block">
                    Tồn kho tối đa có thể {txType === 'OUT' ? 'xuất' : 'chuyển'}: <b>{formatQty(selectedItem.currentStock)} {selectedItem.unit}</b>
                  </span>
                )}
              </div>

              {/* Nhập kho specific: Lô & Hạn dùng */}
              {txType === 'IN' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold uppercase text-slate-400 block mb-1">Số lô (Lot):</label>
                    <input
                      type="text"
                      placeholder="Tự tạo nếu để trống"
                      value={txBatchNumber}
                      onChange={(e) => setTxBatchNumber(e.target.value)}
                      className={`w-full px-3 py-2 text-xs font-bold rounded-xl border focus:ring-2 focus:ring-blue-500 outline-none ${
                        darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
                      }`}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold uppercase text-slate-400 block mb-1">Hạn dùng (Expiry):</label>
                    <input
                      type="date"
                      value={txBatchExpiry}
                      onChange={(e) => setTxBatchExpiry(e.target.value)}
                      className={`w-full px-3 py-2 text-xs font-bold rounded-xl border focus:ring-2 focus:ring-blue-500 outline-none ${
                        darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
                      }`}
                    />
                  </div>
                </div>
              )}

              {/* Batch Selection for OUT / TRANSFER */}
              {(txType === 'OUT' || txType === 'TRANSFER') && matchedActiveBatches.length > 0 && (
                <div>
                  <label className="text-xs font-bold uppercase text-slate-400 block mb-1">
                    Chọn lô xuất (FEFO):
                  </label>
                  <select
                    value={txSelectedBatchId}
                    onChange={(e) => setTxSelectedBatchId(e.target.value)}
                    className={`w-full px-3 py-2 text-xs font-bold rounded-xl border focus:ring-2 focus:ring-blue-500 outline-none ${
                      darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
                    }`}
                  >
                    <option value="AUTO_FEFO">
                      Tự động xuất theo hạn gần nhất (FEFO)
                    </option>
                    {matchedActiveBatches
                      .slice()
                      .sort((a, b) => (a.expiryDate || '9999-99-99').localeCompare(b.expiryDate || '9999-99-99'))
                      .map(b => (
                        <option key={b.id} value={b.id}>
                          {b.batchNumber} — Tồn: {formatQty(b.quantity)} {selectedItem.unit} {b.expiryDate ? `(HSD: ${formatDate(b.expiryDate)})` : '(Không HSD)'}
                        </option>
                      ))}
                  </select>
                </div>
              )}

              {/* Xuất kho / Chuyển kho specific: Phòng nguồn & Phòng nhận */}
              {txType === 'TRANSFER' && validDepartments.length > 0 && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold uppercase text-slate-400 block mb-1">
                      Từ phòng:
                    </label>
                    <select
                      value={txFromDeptId}
                      onChange={(e) => setTxFromDeptId(e.target.value)}
                      className={`w-full px-3 py-2 text-xs font-bold rounded-xl border focus:ring-2 focus:ring-blue-500 outline-none ${
                        darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
                      }`}
                    >
                      {validDepartments.map(d => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-bold uppercase text-slate-400 block mb-1">
                      Chuyển tới phòng:
                    </label>
                    <select
                      value={txToDeptId}
                      onChange={(e) => setTxToDeptId(e.target.value)}
                      className={`w-full px-3 py-2 text-xs font-bold rounded-xl border focus:ring-2 focus:ring-blue-500 outline-none ${
                        darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
                      }`}
                    >
                      {validDepartments.map(d => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {txType === 'OUT' && validDepartments.length > 0 && (
                <div>
                  <label className="text-xs font-bold uppercase text-slate-400 block mb-1">
                    Phòng sử dụng:
                  </label>
                  <select
                    value={txToDeptId}
                    onChange={(e) => setTxToDeptId(e.target.value)}
                    className={`w-full px-3 py-2 text-xs font-bold rounded-xl border focus:ring-2 focus:ring-blue-500 outline-none ${
                      darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
                    }`}
                  >
                    {validDepartments.map(d => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Note */}
              <div>
                <label className="text-xs font-bold uppercase text-slate-400 block mb-1">Ghi chú giao dịch:</label>
                <input
                  type="text"
                  placeholder="Ghi chú thêm (không bắt buộc)..."
                  value={txNote}
                  onChange={(e) => setTxNote(e.target.value)}
                  className={`w-full px-3 py-2 text-xs rounded-xl border focus:ring-2 focus:ring-blue-500 outline-none ${
                    darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
                  }`}
                />
              </div>

              {/* Submit Button */}
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setWorkflowState('matched')}
                  className={`flex-1 py-2.5 rounded-xl border text-xs font-bold cursor-pointer ${
                    darkMode ? 'bg-slate-800 border-slate-700 text-slate-300' : 'bg-slate-100 border-slate-200 text-slate-700'
                  }`}
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isProcessing}
                  className={`flex-1 py-2.5 rounded-xl text-white text-xs font-bold shadow-md flex items-center justify-center gap-1.5 active:scale-95 transition-all cursor-pointer ${
                    txType === 'IN' ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-500/20' :
                    txType === 'OUT' ? 'bg-rose-600 hover:bg-rose-700 shadow-rose-500/20' :
                    'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-500/20'
                  }`}
                >
                  {isProcessing && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Xác nhận {txType === 'IN' ? 'Nhập kho' : txType === 'OUT' ? 'Xuất kho' : 'Chuyển kho'}</span>
                </button>
              </div>
            </form>
          )}

          {/* 4. NOT FOUND STATE: UNMATCHED BARCODE */}
          {workflowState === 'not-found' && (
            <div className="space-y-4 animate-in fade-in duration-200">
              {/* Warning Alert */}
              <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-300">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-6 h-6 text-amber-500 shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <h4 className="text-sm font-black">
                      Mã vạch chưa trùng khớp với dữ liệu kho!
                    </h4>
                    <p className="text-xs mt-1 text-slate-600 dark:text-slate-300 leading-relaxed break-all">
                      Mã vừa quét: <strong className="font-mono text-xs px-2 py-0.5 rounded bg-amber-200/60 dark:bg-amber-900/60 text-amber-900 dark:text-amber-100 font-bold">{scannedCode}</strong>
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      Chưa có mặt hàng nào mang mã này. Vui lòng chọn 1 trong 2 tùy chọn bên dưới:
                    </p>
                  </div>
                </div>
              </div>

              {/* 2 Options as requested by user */}
              <div className="space-y-3">
                {/* Option 1: Update/Link to existing item */}
                <button
                  type="button"
                  onClick={() => {
                    setLinkSearchTerm('');
                    setItemToLink(null);
                    setWorkflowState('link-existing');
                  }}
                  className={`w-full p-4 rounded-2xl border text-left transition-all flex items-center justify-between gap-3 group cursor-pointer ${
                    darkMode
                      ? 'bg-slate-800/80 border-slate-700 hover:border-blue-500 hover:bg-slate-800'
                      : 'bg-white border-slate-200 hover:border-blue-400 hover:bg-blue-50/50 shadow-sm'
                  }`}
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="p-2.5 rounded-xl bg-blue-50 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-800 shrink-0 mt-0.5">
                      <LinkIcon className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <h5 className="text-sm font-bold text-blue-600 dark:text-blue-400 group-hover:underline">
                        Cập nhật mã vạch cho vật tư hiện có
                      </h5>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
                        Chọn một vật tư trong danh sách hiện tại để gắn với mã vạch <strong className="font-mono break-all">{scannedCode}</strong>.
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-slate-400 group-hover:translate-x-1 transition-transform shrink-0" />
                </button>

                {/* Option 2: Add new item */}
                <button
                  type="button"
                  onClick={() => {
                    setWorkflowState('create-new');
                  }}
                  className={`w-full p-4 rounded-2xl border text-left transition-all flex items-center justify-between gap-3 group cursor-pointer ${
                    darkMode
                      ? 'bg-slate-800/80 border-slate-700 hover:border-emerald-500 hover:bg-slate-800'
                      : 'bg-white border-slate-200 hover:border-emerald-400 hover:bg-emerald-50/50 shadow-sm'
                  }`}
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-800 shrink-0 mt-0.5">
                      <Plus className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <h5 className="text-sm font-bold text-emerald-600 dark:text-emerald-400 group-hover:underline">
                        Thêm danh mục vật tư mới
                      </h5>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
                        Tạo hồ sơ vật tư mới trong kho với mã vạch <strong className="font-mono break-all">{scannedCode}</strong> được điền tự động.
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-slate-400 group-hover:translate-x-1 transition-transform shrink-0" />
                </button>
              </div>

              {/* Action: Scan again */}
              <button
                type="button"
                onClick={handleRestartScan}
                className={`w-full py-2.5 rounded-xl border text-xs font-bold transition-all flex items-center justify-center gap-1.5 mt-2 cursor-pointer ${
                  darkMode ? 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700' : 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200'
                }`}
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Quét mã khác</span>
              </button>
            </div>
          )}

          {/* 5. LINK EXISTING ITEM SUB-FLOW */}
          {workflowState === 'link-existing' && (
            <div className="space-y-3 animate-in fade-in duration-200">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
                <span className="text-xs font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider">
                  Chọn vật tư cần cập nhật mã vạch:
                </span>
                <button
                  type="button"
                  onClick={() => setWorkflowState('not-found')}
                  className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 font-semibold cursor-pointer"
                >
                  Quay lại
                </button>
              </div>

              {/* Search input */}
              <div className="relative">
                <input
                  type="text"
                  placeholder="Tìm tên vật tư, quy cách, hãng hoặc mã hiện tại..."
                  value={linkSearchTerm}
                  onChange={(e) => setLinkSearchTerm(e.target.value)}
                  className={`w-full pl-9 pr-3.5 py-2 text-xs rounded-xl border outline-none focus:ring-2 focus:ring-blue-500 ${
                    darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'
                  }`}
                  autoFocus
                />
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
              </div>

              {/* Item selection list */}
              <div className="space-y-1.5 max-h-[240px] overflow-y-auto custom-scrollbar">
                {filteredItemsToLink.length === 0 ? (
                  <div className="text-center py-6 text-xs text-slate-400">
                    Không tìm thấy vật tư phù hợp.
                  </div>
                ) : (
                  filteredItemsToLink.map(item => {
                    const isCurSelected = itemToLink?.id === item.id;
                    const cat = categories.find(c => c.id === item.categoryId);

                    return (
                      <div
                        key={item.id}
                        onClick={() => setItemToLink(item)}
                        className={`p-2.5 rounded-xl border cursor-pointer transition-all flex items-center justify-between gap-2 ${
                          isCurSelected
                            ? 'border-blue-500 bg-blue-500/10 ring-1 ring-blue-500'
                            : darkMode ? 'bg-slate-800/60 border-slate-700 hover:bg-slate-800' : 'bg-white border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="font-bold text-xs truncate">{item.name}</div>
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-slate-400 mt-0.5">
                            {cat && <span>{cat.name}</span>}
                            <span>· ĐVT: {item.unit}</span>
                            <span>· Tồn: {formatQty(item.currentStock)}</span>
                            {item.barcode && (
                              <span className="inline-flex items-center gap-0.5 text-amber-500 font-mono font-semibold">
                                · <QrCode className="w-2.5 h-2.5" /> {item.barcode}
                              </span>
                            )}
                          </div>
                        </div>
                        {isCurSelected && (
                          <CheckCircle2 className="w-4 h-4 text-blue-500 shrink-0" />
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              {/* Confirmation Action */}
              {itemToLink && (
                <div className={`p-3 rounded-xl border text-xs ${
                  darkMode ? 'bg-slate-800 border-blue-500/40' : 'bg-blue-50 border-blue-200'
                }`}>
                  <p className="font-semibold text-slate-700 dark:text-slate-300">
                    Xác nhận cập nhật mã vạch <strong className="font-mono text-blue-600 dark:text-blue-400">{scannedCode}</strong> cho mặt hàng:
                  </p>
                  <p className="font-black text-sm text-slate-900 dark:text-white mt-1">
                    {itemToLink.name}
                  </p>
                  {itemToLink.barcode && (
                    <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1">
                      Lưu ý: Sẽ ghi đè mã vạch cũ (<span className="font-mono">{itemToLink.barcode}</span>).
                    </p>
                  )}

                  <div className="flex gap-2 mt-3">
                    <button
                      type="button"
                      onClick={() => setItemToLink(null)}
                      className={`flex-1 py-2 rounded-lg border text-xs font-bold cursor-pointer ${
                        darkMode ? 'bg-slate-700 border-slate-600 text-slate-300' : 'bg-white border-slate-200 text-slate-700'
                      }`}
                    >
                      Chọn lại
                    </button>
                    <button
                      type="button"
                      onClick={handleConfirmLinkItem}
                      disabled={isProcessing}
                      className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold shadow-sm flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      {isProcessing && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                      <span>Lưu & Cập nhật mã</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 6. CREATE NEW ITEM SUB-FLOW */}
          {workflowState === 'create-new' && (
            <form onSubmit={handleCreateNewItem} className="space-y-3 animate-in fade-in duration-200">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
                <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
                  Thêm danh mục vật tư mới:
                </span>
                <button
                  type="button"
                  onClick={() => setWorkflowState('not-found')}
                  className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 font-semibold cursor-pointer"
                >
                  Quay lại
                </button>
              </div>

              {/* Barcode readout badge */}
              <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs">
                <span className="text-slate-400">Mã vạch / Barcode:</span>
                <span className="font-mono font-bold text-blue-600 dark:text-blue-400 truncate max-w-[220px]">{scannedCode}</span>
              </div>

              {/* Name */}
              <div>
                <label className="text-[11px] font-bold uppercase text-slate-400 block mb-1">
                  Tên vật tư *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ví dụ: Phim X-quang 10x12, Kim tiêm 18G..."
                  value={newItemName}
                  onChange={(e) => setNewItemName(e.target.value)}
                  className={`w-full px-3 py-2 text-xs font-bold rounded-xl border focus:ring-2 focus:ring-emerald-500 outline-none ${
                    darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
                  }`}
                  autoFocus
                />
              </div>

              {/* Category & Department */}
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="text-[11px] font-bold uppercase text-slate-400 block mb-1">
                    Nhóm vật tư *
                  </label>
                  <select
                    required
                    value={newItemCategoryId}
                    onChange={(e) => setNewItemCategoryId(e.target.value)}
                    className={`w-full px-3 py-2 text-xs font-semibold rounded-xl border focus:ring-2 focus:ring-emerald-500 outline-none ${
                      darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
                    }`}
                  >
                    {categories.length === 0 ? (
                      <option value="">Chưa có nhóm</option>
                    ) : (
                      categories.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))
                    )}
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-bold uppercase text-slate-400 block mb-1">
                    Phòng máy / Bộ phận
                  </label>
                  <select
                    value={newItemDepartmentId}
                    onChange={(e) => setNewItemDepartmentId(e.target.value)}
                    className={`w-full px-3 py-2 text-xs font-semibold rounded-xl border focus:ring-2 focus:ring-emerald-500 outline-none ${
                      darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
                    }`}
                  >
                    <option value="">Kho chung</option>
                    {validDepartments.map(d => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Unit & MinStock */}
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="text-[11px] font-bold uppercase text-slate-400 block mb-1">
                    Đơn vị tính *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Cái, Hộp, Gói, Lọ..."
                    value={newItemUnit}
                    onChange={(e) => setNewItemUnit(e.target.value)}
                    className={`w-full px-3 py-2 text-xs font-semibold rounded-xl border focus:ring-2 focus:ring-emerald-500 outline-none ${
                      darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
                    }`}
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold uppercase text-slate-400 block mb-1">
                    Tồn tối thiểu
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={newItemMinStock}
                    onChange={(e) => setNewItemMinStock(e.target.value)}
                    className={`w-full px-3 py-2 text-xs font-bold rounded-xl border focus:ring-2 focus:ring-emerald-500 outline-none ${
                      darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
                    }`}
                  />
                </div>
              </div>

              {/* Specification & Manufacturer */}
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="text-[11px] font-bold uppercase text-slate-400 block mb-1">
                    Quy cách
                  </label>
                  <input
                    type="text"
                    placeholder="Hộp 100 tờ..."
                    value={newItemSpecification}
                    onChange={(e) => setNewItemSpecification(e.target.value)}
                    className={`w-full px-3 py-2 text-xs rounded-xl border focus:ring-2 focus:ring-emerald-500 outline-none ${
                      darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
                    }`}
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold uppercase text-slate-400 block mb-1">
                    Hãng sản xuất
                  </label>
                  <input
                    type="text"
                    placeholder="Fujifilm, Bayer..."
                    value={newItemManufacturer}
                    onChange={(e) => setNewItemManufacturer(e.target.value)}
                    className={`w-full px-3 py-2 text-xs rounded-xl border focus:ring-2 focus:ring-emerald-500 outline-none ${
                      darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
                    }`}
                  />
                </div>
              </div>

              {/* Initial Stock & Expiry */}
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="text-[11px] font-bold uppercase text-slate-400 block mb-1">
                    Số lượng nhập ban đầu:
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={newItemCurrentStock}
                    onChange={(e) => setNewItemCurrentStock(e.target.value)}
                    className={`w-full px-3 py-2 text-xs font-bold rounded-xl border focus:ring-2 focus:ring-emerald-500 outline-none ${
                      darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
                    }`}
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold uppercase text-slate-400 block mb-1">
                    Hạn dùng ban đầu:
                  </label>
                  <input
                    type="date"
                    value={newItemExpiryDate}
                    onChange={(e) => setNewItemExpiryDate(e.target.value)}
                    className={`w-full px-3 py-2 text-xs font-bold rounded-xl border focus:ring-2 focus:ring-emerald-500 outline-none ${
                      darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
                    }`}
                  />
                </div>
              </div>

              {/* Submit Buttons */}
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setWorkflowState('not-found')}
                  className={`flex-1 py-2.5 rounded-xl border text-xs font-bold cursor-pointer ${
                    darkMode ? 'bg-slate-800 border-slate-700 text-slate-300' : 'bg-slate-100 border-slate-200 text-slate-700'
                  }`}
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isProcessing}
                  className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-md shadow-emerald-500/20 flex items-center justify-center gap-1.5 active:scale-95 transition-all cursor-pointer"
                >
                  {isProcessing && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Tạo & Lưu vật tư</span>
                </button>
              </div>
            </form>
          )}

        </div>
      </div>
    </div>
  );
}

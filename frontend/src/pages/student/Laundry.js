import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Card } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Label } from '../../components/ui/label';
import { Textarea } from '../../components/ui/textarea';
import api from '../../utils/api';
import { getUser, setAuth, getToken } from '../../utils/auth';
import { toast } from 'sonner';
import { QRCodeCanvas } from 'qrcode.react';
import {
  Shirt,
  Upload,
  X,
  Wallet,
  RefreshCw,
  MapPin,
  QrCode,
  Search,
  PlayCircle,
  CheckCircle,
  AlertTriangle,
  Building2,
  CalendarClock,
  History,
  IndianRupee,
  Camera,
  Bell,
  ScanLine,
  CircleDollarSign,
  FileText,
  Receipt,
  CreditCard
} from 'lucide-react';

const backendUrl = process.env.REACT_APP_BACKEND_URL || 'http://127.0.0.1:8000';

const hostelAliases = {
  azad: 'Azad Bhawan',
  'azad bhawan': 'Azad Bhawan',
  atal: 'Atal Bhawan',
  'atal bhawan': 'Atal Bhawan',
  tagore: 'Tagore Bhawan',
  'tagore bhawan': 'Tagore Bhawan',
  shakuntala: 'Shakuntala Bhawan',
  'shakuntala bhawan': 'Shakuntala Bhawan',
  shakunthala: 'Shakuntala Bhawan',
  'shakunthala bhawan': 'Shakuntala Bhawan',
  janaki: 'Janaki Bhawan',
  'janaki bhawan': 'Janaki Bhawan',
  teresa: 'Teresa Bhawan',
  'teresa bhawan': 'Teresa Bhawan'
};

const normalizeHostel = (name = '') => {
  const cleaned = String(name || '').trim();
  if (!cleaned) return 'N/A';
  const key = cleaned.toLowerCase().replace(/\s+/g, ' ').trim();
  return hostelAliases[key] || cleaned;
};

const normalizeCompare = (value = '') =>
  String(value || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace('shakunthala', 'shakuntala')
    .trim();

const normalizeBlock = (value = '') => {
  const raw = String(value || '').trim().toUpperCase();
  if (!raw) return 'N/A';
  return raw.replace(/^BLOCK\s+/i, '').trim();
};

const normalizeMachine = (item = {}, index = 0) => ({
  ...item,
  _id: item._id || item.id || item.machine_code || `machine-${index}`,
  machine_code: String(item.machine_code || item.code || '').toUpperCase(),
  hostel_name: normalizeHostel(item.hostel_name || item.hostel || item.bhawan || 'N/A'),
  block: normalizeBlock(item.block || item.block_name || item.wing || 'N/A'),
  machine_type: String(item.machine_type || item.type || 'washer').toLowerCase(),
  status: String(item.status || 'idle').toLowerCase(),
  location_label: item.location_label || item.location || item.room_label || 'Laundry Room',
  price_per_cycle: Number(item.price_per_cycle || item.price || 50),
  cycle_duration_minutes: Number(item.cycle_duration_minutes || item.duration || 45),
  remaining_minutes: Number(item.remaining_minutes || 0)
});

const getMachineStatusClass = (status) => {
  switch ((status || '').toLowerCase()) {
    case 'running':
      return 'bg-orange-100 text-orange-700 border-orange-200';
    case 'booked':
      return 'bg-blue-100 text-blue-700 border-blue-200';
    case 'idle':
      return 'bg-green-100 text-green-700 border-green-200';
    case 'offline':
      return 'bg-slate-200 text-slate-700 border-slate-300';
    case 'maintenance':
    case 'needs_service':
      return 'bg-red-100 text-red-700 border-red-200';
    default:
      return 'bg-slate-100 text-slate-700 border-slate-200';
  }
};

const getBookingStatusClass = (status) => {
  switch ((status || '').toLowerCase()) {
    case 'running':
      return 'bg-orange-100 text-orange-700';
    case 'booked':
      return 'bg-blue-100 text-blue-700';
    case 'completed':
      return 'bg-green-100 text-green-700';
    case 'failed':
      return 'bg-red-100 text-red-700';
    case 'cancelled':
      return 'bg-slate-200 text-slate-700';
    default:
      return 'bg-slate-100 text-slate-700';
  }
};

const isMachineBookable = (machine) => {
  return String(machine?.status || '').toLowerCase() === 'idle';
};

const buildMachineMapFromMachines = (machineList = []) => {
  const map = {};
  machineList.forEach((machine) => {
    const hostel = normalizeHostel(machine.hostel_name);
    const block = normalizeBlock(machine.block);
    if (!map[hostel]) map[hostel] = {};
    if (!map[hostel][block]) map[hostel][block] = [];
    map[hostel][block].push(machine);
  });
  return map;
};

const formatDateTime = (value) => {
  if (!value) return 'N/A';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'N/A' : date.toLocaleString();
};

const isPdfFile = (file) =>
  file?.type === 'application/pdf' || String(file?.name || '').toLowerCase().endsWith('.pdf');

const buildSafeQrValue = (value, fallbackAmount = 1) => {
  const cleaned = String(value || '').trim();
  if (cleaned && cleaned.startsWith('upi://pay')) return cleaned;
  return `upi://pay?pa=hostelease@upi&pn=HOSTELEASE&am=${Number(fallbackAmount || 1)}&cu=INR`;
};

export default function Laundry() {
  const [user, setUser] = useState(getUser());
  const [machines, setMachines] = useState([]);
  const [machineMap, setMachineMap] = useState({});
  const [bookings, setBookings] = useState([]);
  const [usageHistory, setUsageHistory] = useState({ total_cycles: 0, total_spend: 0, bookings: [] });
  const [wallet, setWallet] = useState({ balance: 0 });
  const [walletTransactions, setWalletTransactions] = useState([]);
  const [pendingPayments, setPendingPayments] = useState([]);

  const [showUpiScanner, setShowUpiScanner] = useState(false);
  const [upiAmount, setUpiAmount] = useState(0);
  const [upiLink, setUpiLink] = useState('');
  const [paymentReference, setPaymentReference] = useState('');
  const [paymentPurpose, setPaymentPurpose] = useState('');
  const [paymentReceiptUrl, setPaymentReceiptUrl] = useState('');

  const [showBookingScanner, setShowBookingScanner] = useState(false);
  const [pendingBookingData, setPendingBookingData] = useState(null);

  const [reminderPrefs, setReminderPrefs] = useState({
    cycle_started: true,
    ten_minutes_left: true,
    cycle_completed: true
  });

  const [loading, setLoading] = useState(true);
  const [bookingLoading, setBookingLoading] = useState(false);
  const [walletLoading, setWalletLoading] = useState(false);
  const [paymentVerifyLoading, setPaymentVerifyLoading] = useState(false);
  const [showIssueForm, setShowIssueForm] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [selectedMachine, setSelectedMachine] = useState(null);
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [showRefundModal, setShowRefundModal] = useState(false);

  const [selectedBlock, setSelectedBlock] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [machineCodeInput, setMachineCodeInput] = useState('');

  const [topupAmount, setTopupAmount] = useState('');
  const [selectedMachineForIssue, setSelectedMachineForIssue] = useState('');
  const [issueType, setIssueType] = useState('manual');
  const [description, setDescription] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);

  const [bookingForm, setBookingForm] = useState({
    machine_code: '',
    booking_type: 'instant',
    schedule_date: '',
    schedule_time: '',
    payment_mode: 'wallet'
  });

  const [refundForm, setRefundForm] = useState({
    booking_id: '',
    reason: ''
  });

  const fileInputRef = useRef(null);
  const videoRef = useRef(null);
  const scannerStreamRef = useRef(null);
  const scannerIntervalRef = useRef(null);

  const studentHostel = normalizeHostel(user?.hostel_name || user?.hostel || 'N/A');

  useEffect(() => {
    loadAll();

    const interval = setInterval(() => {
      loadBookings();
      loadMachines();
      loadWallet();
      loadUsageHistory();
      loadPendingPayments();
    }, 60000);

    return () => {
      clearInterval(interval);
      stopScanner();
    };
  }, []);

  const syncStudentProfile = async () => {
    try {
      if (!getToken()) return;

      const response = await api.get('/student/me');
      if (response?.data) {
        const freshUser = response.data;
        setUser(freshUser);
        setAuth(getToken(), freshUser);
      }
    } catch (error) {
      console.error('Student profile sync failed:', error);
    }
  };

  const loadAll = async () => {
    try {
      setLoading(true);
      await syncStudentProfile();
      await Promise.all([
        loadMachines(),
        loadMachineMap(),
        loadBookings(),
        loadUsageHistory(),
        loadWallet(),
        loadReminderPreferences(),
        loadPendingPayments()
      ]);
    } finally {
      setLoading(false);
    }
  };

  const loadMachines = async () => {
    try {
      const response = await api.get('/laundry/machines');
      const data = Array.isArray(response.data) ? response.data : [];
      const normalized = data.map((item, index) => normalizeMachine(item, index));
      setMachines(normalized);
    } catch (error) {
      console.error('Error loading machines:', error);
      toast.error('Failed to load laundry machines');
      setMachines([]);
    }
  };

  const loadMachineMap = async () => {
    try {
      const response = await api.get('/laundry/machine-map');
      const fullMap = response.data || {};
      const formattedMap = {};

      Object.keys(fullMap || {}).forEach((hostelKey) => {
        const normalizedHostelKey = normalizeHostel(hostelKey);
        const blocks = fullMap[hostelKey] || {};
        const formattedBlocks = {};

        Object.keys(blocks).forEach((blockKey) => {
          const normalizedBlockKey = normalizeBlock(blockKey);
          formattedBlocks[normalizedBlockKey] = Array.isArray(blocks[blockKey])
            ? blocks[blockKey].map((m, idx) =>
                normalizeMachine(
                  {
                    ...m,
                    hostel_name: normalizedHostelKey,
                    block: normalizedBlockKey
                  },
                  idx
                )
              )
            : [];
        });

        formattedMap[normalizedHostelKey] = formattedBlocks;
      });

      setMachineMap(formattedMap);
    } catch (error) {
      console.error('Error loading machine map:', error);
      setMachineMap({});
    }
  };

  const loadBookings = async () => {
    try {
      const response = await api.get('/laundry/bookings');
      setBookings(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.error('Error loading bookings:', error);
      setBookings([]);
    }
  };

  const loadUsageHistory = async () => {
    try {
      const response = await api.get('/laundry/usage-history');
      setUsageHistory(response.data || { total_cycles: 0, total_spend: 0, bookings: [] });
    } catch (error) {
      console.error('Error loading usage history:', error);
      setUsageHistory({ total_cycles: 0, total_spend: 0, bookings: [] });
    }
  };

  const loadWallet = async () => {
    try {
      const response = await api.get('/laundry/wallet');
      setWallet(response.data?.wallet || { balance: 0 });
      setWalletTransactions(Array.isArray(response.data?.transactions) ? response.data.transactions : []);
    } catch (error) {
      console.error('Error loading wallet:', error);
      setWallet({ balance: 0 });
      setWalletTransactions([]);
    }
  };

  const loadPendingPayments = async () => {
    try {
      const response = await api.get('/laundry/payments/pending');
      setPendingPayments(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.error('Error loading pending payments:', error);
      setPendingPayments([]);
    }
  };

  const loadReminderPreferences = async () => {
    try {
      const response = await api.get('/laundry/reminder-preferences');
      setReminderPrefs(
        response.data || {
          cycle_started: true,
          ten_minutes_left: true,
          cycle_completed: true
        }
      );
    } catch (error) {
      console.error('Error loading reminder preferences:', error);
    }
  };

  const saveReminderPreferences = async (updated) => {
    try {
      await api.put('/laundry/reminder-preferences', updated);
      setReminderPrefs(updated);
      toast.success('Reminder preferences updated');
    } catch (error) {
      console.error(error);
      toast.error('Failed to save reminder preferences');
    }
  };

  const createWalletTopupPayment = async (amount) => {
    const res = await api.post('/laundry/payments/create-wallet-topup', { amount });
    return res.data;
  };

  const createBookingPayment = async (payload) => {
    const res = await api.post('/laundry/payments/create-booking', payload);
    return res.data;
  };

  const verifyPendingPayment = async (referenceId, callback) => {
    try {
      setPaymentVerifyLoading(true);
      const response = await api.post('/laundry/payments/verify-manual', {
        reference_id: referenceId
      });

      toast.success('Payment verified successfully');
      setPaymentReceiptUrl(response.data?.receipt_url || '');
      await Promise.all([loadWallet(), loadPendingPayments()]);

      if (typeof callback === 'function') {
        await callback(response.data);
      }
    } catch (error) {
      console.error(error);
      toast.error(error.response?.data?.detail || 'Payment verification failed');
    } finally {
      setPaymentVerifyLoading(false);
    }
  };

  const handleWalletTopup = async () => {
    const amount = Number(topupAmount);
    if (!amount || amount <= 0) {
      toast.error('Enter a valid top-up amount');
      return;
    }

    if (window.Razorpay) {
      try {
        setWalletLoading(true);
        const data = await createWalletTopupPayment(amount);
        const userObj = getUser() || {};
        const options = {
          key: "rzp_test_1DP5mmOlF5G5ag",
          amount: amount * 100,
          currency: "INR",
          name: "HOSTELEASE Smart Laundry",
          description: `Wallet Top-Up - ₹${amount}`,
          image: "https://cdn-icons-png.flaticon.com/512/3063/3063823.png",
          handler: async function (response) {
            toast.success(`Payment verified via Razorpay! ID: ${response.razorpay_payment_id}`);
            await verifyPendingPayment(data.reference_id, async () => {
              setTopupAmount('');
              toast.success(`₹${amount} credited to Laundry Wallet!`);
            });
          },
          prefill: {
            name: userObj.student_name || userObj.username || "Student",
            email: userObj.college_email || userObj.email || "student@hostel.com",
            contact: userObj.phone || "9999999999"
          },
          theme: {
            color: "#5B7FED"
          }
        };
        const rzp = new window.Razorpay(options);
        rzp.open();
        setWalletLoading(false);
        return;
      } catch (err) {
        console.error("Razorpay topup init error, falling back to scanner:", err);
      } finally {
        setWalletLoading(false);
      }
    }

    try {
      setWalletLoading(true);
      setPaymentReceiptUrl('');
      const data = await createWalletTopupPayment(amount);

      setUpiLink(buildSafeQrValue(data.upi_link, data.amount || amount));
      setUpiAmount(Number(data.amount || amount));
      setPaymentReference(data.reference_id || '');
      setPaymentPurpose('wallet_topup');
      setShowUpiScanner(true);
    } catch (error) {
      console.error(error);
      toast.error(error.response?.data?.detail || 'Failed to create top-up payment');
    } finally {
      setWalletLoading(false);
    }
  };

  const handleVerifyWalletTopup = async () => {
    if (!paymentReference) {
      toast.error('No payment reference found');
      return;
    }

    await verifyPendingPayment(paymentReference, async () => {
      setShowUpiScanner(false);
      setTopupAmount('');
      setPaymentReference('');
      setPaymentPurpose('');
      setUpiLink('');
      setUpiAmount(0);
    });
  };

  const handleOpenBooking = (machine) => {
    setSelectedMachine(machine);
    setBookingForm({
      machine_code: machine.machine_code,
      booking_type: 'instant',
      schedule_date: '',
      schedule_time: '',
      payment_mode: 'wallet'
    });
    setShowBookingModal(true);
  };

  const confirmBookingAfterVerifiedPayment = async (paymentRef = '') => {
    try {
      setBookingLoading(true);

      await api.post('/laundry/book', {
        ...bookingForm,
        payment_reference: paymentRef
      });

      toast.success(`Machine ${bookingForm.machine_code} booked successfully`);
      setShowBookingModal(false);
      setShowBookingScanner(false);
      setSelectedMachine(null);
      setPendingBookingData(null);
      setPaymentReference('');
      setPaymentPurpose('');
      setUpiLink('');
      setUpiAmount(0);
      await Promise.all([loadMachines(), loadBookings(), loadWallet(), loadUsageHistory(), loadPendingPayments()]);
    } catch (error) {
      console.error(error);
      toast.error(error?.response?.data?.detail || 'Booking failed');
    } finally {
      setBookingLoading(false);
    }
  };

  const handleBookMachine = async () => {
    if (!bookingForm.machine_code) {
      toast.error('Machine is required');
      return;
    }

    if (bookingForm.booking_type === 'scheduled' && (!bookingForm.schedule_date || !bookingForm.schedule_time)) {
      toast.error('Please select schedule date and time');
      return;
    }

    try {
      setBookingLoading(true);
      setPaymentReceiptUrl('');

      const paymentInit = await createBookingPayment({
        machine_code: bookingForm.machine_code,
        booking_type: bookingForm.booking_type,
        schedule_date: bookingForm.schedule_date,
        schedule_time: bookingForm.schedule_time
      });

      if (!paymentInit?.requires_online_payment) {
        await confirmBookingAfterVerifiedPayment('');
        return;
      }

      setPendingBookingData({
        ...paymentInit,
        bookingForm: { ...bookingForm }
      });
      setUpiLink(buildSafeQrValue(paymentInit.upi_link, paymentInit.online_amount || 1));
      setUpiAmount(Number(paymentInit.online_amount || 0));
      setPaymentReference(paymentInit.reference_id || '');
      setPaymentPurpose('laundry_booking');
      setShowBookingModal(false);
      setShowBookingScanner(true);
      toast.info(`Please pay the remaining amount of ₹${paymentInit.online_amount}`);
    } catch (error) {
      console.error(error);
      toast.error(error?.response?.data?.detail || 'Booking preparation failed');
    } finally {
      setBookingLoading(false);
    }
  };

  const handleVerifyBookingPayment = async () => {
    if (!paymentReference || !pendingBookingData) {
      toast.error('Booking payment reference not found');
      return;
    }

    await verifyPendingPayment(paymentReference, async () => {
      await confirmBookingAfterVerifiedPayment(paymentReference);
    });
  };

  const handleRecoverPendingPayment = async (payment) => {
    const referenceId = payment?.reference_id;
    if (!referenceId) return;

    if (payment?.purpose === 'wallet_topup') {
      await verifyPendingPayment(referenceId);
      return;
    }

    toast.info('Payment verified. Please reopen booking for final confirmation if needed.');
    await verifyPendingPayment(referenceId);
  };

  const handleQRJump = async (codeOverride) => {
    const code = (codeOverride || machineCodeInput).trim().toUpperCase();
    if (!code) {
      toast.error('Enter a machine code');
      return;
    }

    try {
      const response = await api.get(`/laundry/machine/${code}`);
      const machine = normalizeMachine(response.data || {});

      if (!machine?.machine_code) {
        toast.error('Machine not found');
        return;
      }

      if (normalizeCompare(machine.hostel_name) !== normalizeCompare(studentHostel)) {
        toast.error('This machine is not from your hostel');
        return;
      }

      setSelectedBlock(normalizeBlock(machine.block || 'all'));
      setSearchTerm(machine.machine_code || '');
      setMachineCodeInput(machine.machine_code || '');
      toast.success(`Jumped to ${machine.machine_code}`);
    } catch (error) {
      console.error(error);
      toast.error('Machine QR / code not found');
    }
  };

  const startScanner = async () => {
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        toast.error('Camera access is not supported on this device');
        return;
      }

      setShowScanner(true);

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }
      });

      scannerStreamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      if ('BarcodeDetector' in window) {
        const barcodeDetector = new window.BarcodeDetector({ formats: ['qr_code'] });

        scannerIntervalRef.current = setInterval(async () => {
          try {
            if (!videoRef.current) return;
            const barcodes = await barcodeDetector.detect(videoRef.current);
            if (barcodes?.length) {
              const value = barcodes[0]?.rawValue || '';
              if (value) {
                stopScanner();
                handleQRJump(value);
              }
            }
          } catch (error) {
            console.error(error);
          }
        }, 1000);
      } else {
        toast.info('QR camera preview opened. Enter machine code manually if auto-detect does not work.');
      }
    } catch (error) {
      console.error(error);
      toast.error('Failed to open camera scanner');
      setShowScanner(false);
    }
  };

  const stopScanner = () => {
    if (scannerIntervalRef.current) {
      clearInterval(scannerIntervalRef.current);
      scannerIntervalRef.current = null;
    }
    if (scannerStreamRef.current) {
      scannerStreamRef.current.getTracks().forEach((track) => track.stop());
      scannerStreamRef.current = null;
    }
    setShowScanner(false);
  };

  const handleOpenRefund = (booking) => {
    setRefundForm({
      booking_id: booking._id,
      reason: ''
    });
    setShowRefundModal(true);
  };

  const handleSubmitRefund = async () => {
    if (!refundForm.booking_id || !refundForm.reason.trim()) {
      toast.error('Refund reason is required');
      return;
    }

    try {
      await api.post('/laundry/refund-request', refundForm);
      toast.success('Refund request submitted');
      setShowRefundModal(false);
      setRefundForm({ booking_id: '', reason: '' });
      await loadBookings();
    } catch (error) {
      console.error(error);
      toast.error(error.response?.data?.detail || 'Refund request failed');
    }
  };

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast.error('File too large (Max 5MB)');
      return;
    }

    setSelectedFile(file);

    if (isPdfFile(file)) {
      setPreviewUrl('pdf');
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => setPreviewUrl(reader.result);
    reader.readAsDataURL(file);
  };

  const removeFile = () => {
    setSelectedFile(null);
    setPreviewUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSubmitIssue = async (e) => {
    e.preventDefault();

    if (description.trim().length < 10) {
      toast.error('Description must be at least 10 characters');
      return;
    }

    if (issueType === 'machine' && !selectedMachineForIssue) {
      toast.error('Please select a machine for machine complaint');
      return;
    }

    try {
      const formData = new FormData();
      formData.append('type', issueType);
      formData.append('description', description);

      if (selectedMachineForIssue) {
        formData.append('machine_code', selectedMachineForIssue);
      }

      if (selectedFile) {
        formData.append('image', selectedFile);
      }

      await api.post('/laundry/complaint', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      toast.success('Laundry issue submitted successfully');
      setDescription('');
      setIssueType('manual');
      setSelectedMachineForIssue('');
      removeFile();
      setShowIssueForm(false);
    } catch (error) {
      console.error(error);
      toast.error(error.response?.data?.detail || 'Issue submission failed');
    }
  };

  const fallbackMachineMap = useMemo(() => buildMachineMapFromMachines(machines), [machines]);

  const effectiveMachineMap = useMemo(() => {
    const existingHasData =
      Object.keys(machineMap || {}).length > 0 &&
      Object.values(machineMap || {}).some((blocks) =>
        Object.values(blocks || {}).some((list) => Array.isArray(list) && list.length > 0)
      );

    return existingHasData ? machineMap : fallbackMachineMap;
  }, [machineMap, fallbackMachineMap]);

  const filteredMachines = useMemo(() => {
    return machines.filter((machine) => {
      const matchesBlock =
        selectedBlock === 'all' ||
        normalizeBlock(machine.block) === normalizeBlock(selectedBlock);

      const q = searchTerm.toLowerCase().trim();
      const matchesSearch =
        !q ||
        String(machine.machine_code || '').toLowerCase().includes(q) ||
        String(machine.location_label || '').toLowerCase().includes(q) ||
        String(machine.status || '').toLowerCase().includes(q) ||
        String(machine.machine_type || '').toLowerCase().includes(q);

      return matchesBlock && matchesSearch;
    });
  }, [machines, selectedBlock, searchTerm]);

  const activeBookings = useMemo(() => {
    return bookings.filter((b) => ['booked', 'running'].includes((b.status || '').toLowerCase()));
  }, [bookings]);

  const blockOptions = useMemo(() => {
    const set = new Set(
      machines.map((m) => normalizeBlock(m.block)).filter((b) => b && b !== 'N/A')
    );
    return Array.from(set).sort();
  }, [machines]);

  const availabilitySummary = useMemo(() => {
    return {
      idle: machines.filter((m) => String(m.status || '').toLowerCase() === 'idle').length,
      running: machines.filter((m) => String(m.status || '').toLowerCase() === 'running').length,
      booked: machines.filter((m) => String(m.status || '').toLowerCase() === 'booked').length,
      maintenance: machines.filter((m) =>
        ['maintenance', 'needs_service', 'offline'].includes(String(m.status || '').toLowerCase())
      ).length
    };
  }, [machines]);

  const hostelMachineCodes = useMemo(() => {
    return machines
      .filter((m) => selectedBlock === 'all' || normalizeBlock(m.block) === normalizeBlock(selectedBlock))
      .map((m) => ({
        code: m.machine_code,
        block: m.block,
        type: m.machine_type,
        status: m.status
      }));
  }, [machines, selectedBlock]);

  const walletQrValue = useMemo(() => buildSafeQrValue(upiLink, upiAmount || 1), [upiLink, upiAmount]);
  const bookingQrValue = useMemo(() => buildSafeQrValue(upiLink, upiAmount || 1), [upiLink, upiAmount]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px]">
        <RefreshCw className="animate-spin text-[#5B7FED] mb-4" size={40} />
        <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px]">
          Loading smart laundry services...
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 fade-in pb-10">
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center text-[#5B7FED] border border-blue-100 shadow-sm">
            <Shirt size={26} />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Smart Laundry</h1>
            <p className="text-slate-500 text-sm mt-1">
              {studentHostel} • Self-service booking, QR washer access, wallet, verified UPI and manual laundry support
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="outline"
            onClick={loadAll}
            className="rounded-xl border-slate-200 text-slate-600 font-bold text-xs gap-2"
          >
            <RefreshCw size={14} /> Refresh
          </Button>
          <Button
            onClick={() => setShowIssueForm((prev) => !prev)}
            className="bg-[#5B7FED] hover:bg-[#4A6FD6] text-white"
          >
            {showIssueForm ? 'View Machines' : 'Manual Laundry / Report Issue'}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-5 rounded-2xl border-none shadow-sm bg-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Wallet Balance</p>
              <h3 className="text-2xl font-black text-slate-900 mt-2">₹{Number(wallet?.balance || 0).toFixed(0)}</h3>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-500 border border-emerald-100 flex items-center justify-center">
              <Wallet size={22} />
            </div>
          </div>
        </Card>

        <Card className="p-5 rounded-2xl border-none shadow-sm bg-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Available</p>
              <h3 className="text-2xl font-black text-slate-900 mt-2">{availabilitySummary.idle}</h3>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-green-50 text-green-500 border border-green-100 flex items-center justify-center">
              <CheckCircle size={22} />
            </div>
          </div>
        </Card>

        <Card className="p-5 rounded-2xl border-none shadow-sm bg-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Running / Booked</p>
              <h3 className="text-2xl font-black text-slate-900 mt-2">{availabilitySummary.running + availabilitySummary.booked}</h3>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-orange-50 text-orange-500 border border-orange-100 flex items-center justify-center">
              <CalendarClock size={22} />
            </div>
          </div>
        </Card>

        <Card className="p-5 rounded-2xl border-none shadow-sm bg-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Total Spend</p>
              <h3 className="text-2xl font-black text-slate-900 mt-2">₹{Number(usageHistory.total_spend || 0).toFixed(0)}</h3>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-violet-50 text-violet-500 border border-violet-100 flex items-center justify-center">
              <IndianRupee size={22} />
            </div>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.1fr_0.9fr] gap-6">
        <Card className="p-6 bg-white rounded-2xl shadow-sm border-none">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <CircleDollarSign size={20} className="text-emerald-500" />
            Wallet & UPI Payments
          </h2>

          <div className="flex flex-col md:flex-row gap-3 items-start md:items-center">
            <input
              type="number"
              min="1"
              placeholder="Enter amount"
              value={topupAmount}
              onChange={(e) => setTopupAmount(e.target.value)}
              className="w-full md:w-64 px-4 py-3 bg-slate-50 rounded-xl border-none outline-none focus:ring-2 focus:ring-blue-100"
            />
            <Button
              onClick={handleWalletTopup}
              disabled={walletLoading}
              className="bg-[#5B7FED] hover:bg-[#4A6FD6] text-white rounded-xl px-6"
            >
              {walletLoading ? 'Processing...' : 'Top-up with UPI'}
            </Button>
          </div>

          {showUpiScanner && (
            <div className="mt-4 p-5 rounded-xl bg-blue-50 border border-blue-100 flex flex-col items-center text-center fade-in">
              <h3 className="font-bold text-slate-800 text-lg mb-2">Scan to Pay via UPI</h3>

              <div className="bg-white p-4 rounded-xl shadow-sm mb-4 border border-slate-100">
                <QRCodeCanvas value={walletQrValue} size={192} includeMargin />
              </div>

              <p className="text-slate-600 mb-2 text-sm font-medium">
                Amount to pay: <span className="text-xl font-bold text-slate-900">₹{upiAmount}</span>
              </p>
              <p className="text-xs font-black uppercase tracking-wider text-slate-500 mb-2">
                Ref: {paymentReference || 'N/A'}
              </p>
              <p className="text-[11px] break-all text-slate-400 mb-4 max-w-xs">{walletQrValue}</p>

              <div className="flex gap-3 w-full max-w-xs justify-center">
                <Button
                  onClick={handleVerifyWalletTopup}
                  disabled={paymentVerifyLoading}
                  className="w-full bg-[#10B981] hover:bg-emerald-600 text-white rounded-xl"
                >
                  {paymentVerifyLoading ? 'Verifying...' : 'I Have Paid - Verify'}
                </Button>
                <Button
                  onClick={() => {
                    setShowUpiScanner(false);
                    setPaymentReference('');
                    setPaymentPurpose('');
                    setUpiLink('');
                    setUpiAmount(0);
                  }}
                  variant="outline"
                  className="w-full rounded-xl border-slate-300 text-slate-600"
                >
                  Cancel
                </Button>
              </div>

              {paymentReceiptUrl ? (
                <button
                  type="button"
                  onClick={() => window.open(`${backendUrl}${paymentReceiptUrl}`, '_blank')}
                  className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-[#5B7FED]"
                >
                  <Receipt size={16} /> View Receipt
                </button>
              ) : null}
            </div>
          )}

          <div className="mt-5 space-y-3 max-h-[260px] overflow-y-auto pr-1">
            {walletTransactions.length === 0 ? (
              <p className="text-sm text-slate-500">No payment history yet</p>
            ) : (
              walletTransactions.map((tx) => (
                <div key={tx._id} className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-bold text-slate-800 capitalize">
                        {tx.type} • {String(tx.source || '').replaceAll('_', ' ')}
                      </p>
                      <p className="text-xs text-slate-500">{formatDateTime(tx.date)}</p>
                      {tx.reference_id ? (
                        <p className="text-[11px] text-slate-400 font-semibold mt-1">
                          Ref: {tx.reference_id}
                        </p>
                      ) : null}
                    </div>
                    <span className={`font-black ${tx.type === 'credit' ? 'text-emerald-600' : 'text-red-500'}`}>
                      {tx.type === 'credit' ? '+' : '-'}₹{tx.amount}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>

        <Card className="p-6 bg-white rounded-2xl shadow-sm border-none">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <Bell size={20} className="text-[#5B7FED]" />
            Reminder Preferences
          </h2>

          <div className="space-y-4">
            {[
              ['cycle_started', 'Notify when cycle starts'],
              ['ten_minutes_left', 'Notify when 10 minutes are left'],
              ['cycle_completed', 'Notify when cycle completes']
            ].map(([key, label]) => (
              <label key={key} className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-100 cursor-pointer">
                <span className="font-semibold text-slate-700">{label}</span>
                <input
                  type="checkbox"
                  checked={!!reminderPrefs[key]}
                  onChange={(e) => {
                    const updated = { ...reminderPrefs, [key]: e.target.checked };
                    saveReminderPreferences(updated);
                  }}
                  className="w-5 h-5"
                />
              </label>
            ))}
          </div>
        </Card>
      </div>

      {pendingPayments.length > 0 && (
        <Card className="p-5 bg-yellow-50 rounded-2xl border border-yellow-100 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <CreditCard className="text-yellow-700" size={18} />
            <h2 className="text-lg font-black text-yellow-800">Pending Payment Recovery</h2>
          </div>

          <div className="space-y-3">
            {pendingPayments.map((payment) => (
              <div key={payment._id} className="p-4 bg-white rounded-xl border border-yellow-100 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div>
                  <p className="font-black text-slate-900">
                    {String(payment.purpose || '').replaceAll('_', ' ')} • ₹{payment.amount || payment.online_amount || 0}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    Ref: {payment.reference_id} {payment.machine_code ? `• Machine: ${payment.machine_code}` : ''}
                  </p>
                </div>
                <Button
                  onClick={() => handleRecoverPendingPayment(payment)}
                  disabled={paymentVerifyLoading}
                  className="bg-[#5B7FED] hover:bg-[#4A6FD6] text-white rounded-xl"
                >
                  Verify Now
                </Button>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card className="p-5 bg-white rounded-2xl shadow-sm border-none">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold mb-1">Your Hostel Machine Codes</h2>
            <p className="text-sm text-slate-500">
              Students from {studentHostel} can use only these machine codes
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            {blockOptions.length > 1 && (
              <div className="relative">
                <Building2 size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <select
                  value={selectedBlock}
                  onChange={(e) => setSelectedBlock(e.target.value)}
                  className="pl-9 pr-8 py-3 bg-slate-50 rounded-xl border-none outline-none text-sm font-semibold uppercase"
                >
                  <option value="all">All Blocks</option>
                  {blockOptions.map((block) => (
                    <option key={block} value={block}>
                      Block {block}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search machine / type / status..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 pr-4 py-3 bg-slate-50 rounded-xl border-none outline-none text-sm font-semibold"
              />
            </div>

            <Button onClick={startScanner} className="bg-slate-900 hover:bg-slate-800 text-white rounded-xl">
              <Camera size={15} /> Scan QR
            </Button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {hostelMachineCodes.length === 0 ? (
            <span className="text-sm text-slate-500">No machine codes found for your hostel.</span>
          ) : (
            hostelMachineCodes.map((m) => (
              <button
                key={m.code}
                type="button"
                onClick={() => handleQRJump(m.code)}
                className={`px-3 py-2 rounded-xl text-xs font-black uppercase border ${getMachineStatusClass(m.status)}`}
              >
                {m.code} • Block {m.block} • {m.type || 'washer'} • {m.status}
              </button>
            ))
          )}
        </div>

        <div className="mt-4 flex gap-3">
          <input
            type="text"
            placeholder="Enter machine code manually"
            value={machineCodeInput}
            onChange={(e) => setMachineCodeInput(e.target.value.toUpperCase())}
            className="w-full max-w-md px-4 py-3 bg-slate-50 rounded-xl border-none outline-none"
          />
          <Button onClick={() => handleQRJump()} className="bg-[#5B7FED] hover:bg-[#4A6FD6] text-white rounded-xl">
            <QrCode size={15} /> Jump
          </Button>
        </div>
      </Card>

      {activeBookings.length > 0 && (
        <Card className="p-6 bg-white rounded-2xl shadow-sm border-none">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <PlayCircle size={20} className="text-orange-500" />
            Booking Status & Remaining Time
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {activeBookings.map((booking) => (
              <div key={booking._id} className="p-5 rounded-2xl border border-slate-100 bg-slate-50">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-black text-slate-900">{booking.machine_code}</h3>
                  <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase ${getBookingStatusClass(booking.status)}`}>
                    {booking.status}
                  </span>
                </div>

                <div className="space-y-1 text-sm text-slate-600">
                  <p><span className="font-bold">Hostel:</span> {booking.hostel_name}</p>
                  <p><span className="font-bold">Block:</span> {booking.block}</p>
                  <p><span className="font-bold">Type:</span> {booking.booking_type}</p>
                  <p><span className="font-bold">Start:</span> {formatDateTime(booking.start_time)}</p>
                  <p><span className="font-bold">End:</span> {formatDateTime(booking.end_time)}</p>
                  <p><span className="font-bold">Remaining:</span> {booking.remaining_minutes ?? 0} min</p>
                  <p><span className="font-bold">Paid:</span> ₹{booking.amount_paid || 0}</p>
                  <p><span className="font-bold">Wallet Used:</span> ₹{booking.wallet_used || 0}</p>
                  <p><span className="font-bold">Online Paid:</span> ₹{booking.online_paid || 0}</p>
                  <p><span className="font-bold">Reference:</span> {booking.payment_reference || 'N/A'}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {showIssueForm ? (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <Card className="p-6 bg-white rounded-2xl shadow-sm border-none">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <AlertTriangle size={20} className="text-red-500" />
              Manual Laundry / Missing Clothes / Machine Issue
            </h2>

            <form onSubmit={handleSubmitIssue} className="space-y-4">
              <div>
                <Label>Issue Type</Label>
                <select
                  value={issueType}
                  onChange={(e) => {
                    const nextType = e.target.value;
                    setIssueType(nextType);
                    if (nextType !== 'machine') {
                      setSelectedMachineForIssue('');
                    }
                  }}
                  className="mt-2 w-full px-4 py-3 bg-slate-50 rounded-xl border-none outline-none focus:ring-2 focus:ring-blue-100"
                >
                  <option value="manual">General manual laundry issue</option>
                  <option value="machine">Machine complaint</option>
                  <option value="missing_clothes">Missing clothes</option>
                  <option value="payment_issue">Payment issue</option>
                </select>
              </div>

              <div>
                <Label>Select Machine</Label>
                <select
                  value={selectedMachineForIssue}
                  onChange={(e) => setSelectedMachineForIssue(e.target.value)}
                  className="mt-2 w-full px-4 py-3 bg-slate-50 rounded-xl border-none outline-none focus:ring-2 focus:ring-blue-100"
                >
                  <option value="">
                    {issueType === 'machine' ? 'Select machine for complaint' : 'General issue without machine'}
                  </option>
                  {machines.map((machine) => (
                    <option key={machine._id} value={machine.machine_code}>
                      {machine.machine_code} • {machine.hostel_name} • Block {machine.block}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <Label>Description</Label>
                <Textarea
                  placeholder="Explain your laundry problem..."
                  className="min-h-[120px] mt-2"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  required
                />
              </div>

              <div>
                <Label>Upload Proof</Label>
                {!previewUrl ? (
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="mt-2 border-2 border-dashed border-slate-200 rounded-xl p-8 text-center cursor-pointer hover:border-[#5B7FED] transition-colors"
                  >
                    <Upload className="mx-auto text-slate-400 mb-2" size={24} />
                    <p className="text-sm text-slate-500">Click to upload receipt, bag slip or machine proof</p>
                    <p className="text-xs text-slate-400 mt-2">Allowed: PDF, JPG, JPEG, PNG, WEBP • Max size: 5 MB</p>
                    <input
                      type="file"
                      ref={fileInputRef}
                      hidden
                      onChange={handleFileSelect}
                      accept="image/*,.pdf"
                    />
                  </div>
                ) : previewUrl === 'pdf' ? (
                  <div className="mt-2 relative rounded-xl overflow-hidden border border-slate-200 bg-slate-50 p-5">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-xl bg-red-50 text-red-500 flex items-center justify-center">
                        <FileText size={22} />
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold text-slate-800 truncate">{selectedFile?.name || 'document.pdf'}</p>
                        <p className="text-xs text-slate-500">
                          {(Number(selectedFile?.size || 0) / (1024 * 1024)).toFixed(2)} MB
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={removeFile}
                      className="absolute top-2 right-2 p-1 bg-red-500 text-white rounded-full"
                    >
                      <X size={16} />
                    </button>
                  </div>
                ) : (
                  <div className="mt-2 relative rounded-xl overflow-hidden border border-slate-200">
                    <img src={previewUrl} alt="Preview" className="w-full h-48 object-cover" />
                    <button
                      type="button"
                      onClick={removeFile}
                      className="absolute top-2 right-2 p-1 bg-red-500 text-white rounded-full"
                    >
                      <X size={16} />
                    </button>
                  </div>
                )}
              </div>

              <Button type="submit" className="w-full bg-red-500 hover:bg-red-600 text-white py-6 text-lg font-bold">
                Submit Laundry Request
              </Button>
            </form>
          </Card>

          <Card className="p-6 bg-slate-50 rounded-2xl shadow-sm border-none">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <History size={20} className="text-slate-500" />
              Usage History by Date & Spend
            </h2>

            <div className="space-y-3 max-h-[520px] overflow-y-auto pr-1">
              {usageHistory.bookings?.length === 0 ? (
                <p className="text-center text-slate-500 py-10">No laundry usage yet</p>
              ) : (
                usageHistory.bookings.map((item) => (
                  <div key={item._id} className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
                    <div className="flex justify-between items-start gap-3 mb-2">
                      <div>
                        <p className="font-bold text-slate-900">{item.machine_code}</p>
                        <p className="text-xs text-slate-500">
                          {item.hostel_name} • Block {item.block}
                        </p>
                      </div>
                      <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase ${getBookingStatusClass(item.status)}`}>
                        {item.status}
                      </span>
                    </div>

                    <div className="space-y-1 text-sm text-slate-600">
                      <p><span className="font-semibold">Date:</span> {item.created_at ? new Date(item.created_at).toLocaleDateString() : 'N/A'}</p>
                      <p><span className="font-semibold">Start:</span> {formatDateTime(item.start_time)}</p>
                      <p><span className="font-semibold">End:</span> {formatDateTime(item.end_time)}</p>
                      <p><span className="font-semibold">Spend:</span> ₹{item.amount_paid || 0}</p>
                      <p><span className="font-semibold">Payment Mode:</span> {item.payment_mode || 'wallet'}</p>
                      <p><span className="font-semibold">Wallet Used:</span> ₹{item.wallet_used || 0}</p>
                      <p><span className="font-semibold">Online Paid:</span> ₹{item.online_paid || 0}</p>
                      <p><span className="font-semibold">Reference:</span> {item.payment_reference || 'N/A'}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>
      ) : (
        <>
          <Card className="p-6 bg-white rounded-2xl shadow-sm border-none">
            <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 mb-5">
              <div>
                <h2 className="text-xl font-semibold mb-1">Machine Availability in {studentHostel}</h2>
                <p className="text-sm text-slate-500">
                  Green means available, orange/blue means busy, red means not usable
                </p>
              </div>

              <div className="flex flex-wrap gap-3">
                {blockOptions.length > 1 && (
                  <div className="relative">
                    <MapPin size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <select
                      value={selectedBlock}
                      onChange={(e) => setSelectedBlock(e.target.value)}
                      className="pl-9 pr-8 py-3 bg-slate-50 rounded-xl border-none outline-none text-sm font-semibold uppercase"
                    >
                      <option value="all">All Blocks</option>
                      {blockOptions.map((block) => (
                        <option key={block} value={block}>
                          Block {block}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="relative">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search machine / type / status..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9 pr-4 py-3 bg-slate-50 rounded-xl border-none outline-none text-sm font-semibold"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filteredMachines.length === 0 ? (
                <div className="col-span-full text-center py-16 text-slate-400 font-semibold">
                  No machines found for your hostel / block
                </div>
              ) : (
                filteredMachines.map((machine) => (
                  <Card key={machine._id} className="p-5 bg-slate-50 rounded-2xl border border-slate-100 shadow-none">
                    {machine.photo_url && (
                      <img
                        src={`${backendUrl}${machine.photo_url}`}
                        alt={machine.machine_code}
                        className="w-full h-40 object-cover rounded-xl mb-4"
                      />
                    )}

                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div>
                        <h3 className="font-black text-slate-900 text-lg">{machine.machine_code}</h3>
                        <p className="text-xs text-slate-500">
                          {machine.hostel_name} • Block {machine.block}
                        </p>
                        <p className="text-xs text-slate-400 mt-1">{machine.location_label}</p>
                      </div>
                      <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase border ${getMachineStatusClass(machine.status)}`}>
                        {String(machine.status || '').replaceAll('_', ' ')}
                      </span>
                    </div>

                    <div className="space-y-1 text-sm text-slate-600 mb-4">
                      <p><span className="font-semibold">Type:</span> {machine.machine_type || 'washer'}</p>
                      <p><span className="font-semibold">Price:</span> ₹{machine.price_per_cycle || 50}</p>
                      <p><span className="font-semibold">Cycle Duration:</span> {machine.cycle_duration_minutes || 45} min</p>
                      <p><span className="font-semibold">Remaining:</span> {machine.remaining_minutes || 0} min</p>
                    </div>

                    <div className="flex gap-2 flex-wrap">
                      <Button
                        disabled={bookingLoading || !isMachineBookable(machine)}
                        onClick={() => handleOpenBooking(machine)}
                        className="bg-[#10b981] hover:bg-[#059669] text-white rounded-xl"
                      >
                        {isMachineBookable(machine) ? 'Book' : 'Unavailable'}
                      </Button>

                      <button
                        type="button"
                        onClick={() => {
                          setMachineCodeInput(machine.machine_code);
                          setSearchTerm(machine.machine_code);
                        }}
                        className="px-4 py-2 rounded-xl bg-blue-50 text-[#5B7FED] font-bold text-sm"
                      >
                        QR Jump
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setShowIssueForm(true);
                          setIssueType('machine');
                          setSelectedMachineForIssue(machine.machine_code);
                        }}
                        className="px-4 py-2 rounded-xl bg-red-50 text-red-500 font-bold text-sm"
                      >
                        Report
                      </button>
                    </div>
                  </Card>
                ))
              )}
            </div>
          </Card>

          <Card className="p-6 bg-white rounded-2xl shadow-sm border-none">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <MapPin size={20} className="text-[#5B7FED]" />
              Machine-wise Hostel Map
            </h2>

            <div className="space-y-6">
              {Object.keys(effectiveMachineMap || {}).length === 0 ? (
                <p className="text-slate-500">No machine map available</p>
              ) : (
                Object.entries(effectiveMachineMap).map(([hostel, blocks]) => (
                  <div key={hostel} className="border border-slate-100 rounded-2xl p-5">
                    <h3 className="font-black text-slate-900 text-lg mb-4">{hostel}</h3>

                    <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                      {Object.entries(blocks || {}).map(([block, machinesInBlock]) => (
                        <div key={block} className="bg-slate-50 rounded-2xl p-4">
                          <h4 className="font-bold text-slate-800 mb-3">Block {block}</h4>
                          <div className="flex flex-wrap gap-2">
                            {machinesInBlock.map((m) => (
                              <button
                                key={m.machine_code}
                                type="button"
                                onClick={() => handleQRJump(m.machine_code)}
                                className={`px-3 py-2 rounded-xl text-xs font-black uppercase border ${getMachineStatusClass(m.status)}`}
                              >
                                {m.machine_code}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>
        </>
      )}

      {showBookingModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/70 backdrop-blur-sm p-4">
          <Card className="w-full max-w-lg bg-white rounded-[2rem] p-6 shadow-2xl border-none">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-xl font-black text-slate-900">Book Machine</h2>
              <button
                onClick={() => setShowBookingModal(false)}
                className="p-2 rounded-full hover:bg-slate-100"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <Label>Machine</Label>
                <input
                  value={bookingForm.machine_code}
                  readOnly
                  className="mt-2 w-full px-4 py-3 bg-slate-50 rounded-xl border-none outline-none"
                />
              </div>

              <div>
                <Label>Booking Type</Label>
                <select
                  value={bookingForm.booking_type}
                  onChange={(e) => setBookingForm({ ...bookingForm, booking_type: e.target.value })}
                  className="mt-2 w-full px-4 py-3 bg-slate-50 rounded-xl border-none outline-none"
                >
                  <option value="instant">Instant Cycle</option>
                  <option value="scheduled">Scheduled Slot</option>
                </select>
              </div>

              {bookingForm.booking_type === 'scheduled' && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Date</Label>
                    <input
                      type="date"
                      value={bookingForm.schedule_date}
                      onChange={(e) => setBookingForm({ ...bookingForm, schedule_date: e.target.value })}
                      className="mt-2 w-full px-4 py-3 bg-slate-50 rounded-xl border-none outline-none"
                    />
                  </div>
                  <div>
                    <Label>Time</Label>
                    <input
                      type="time"
                      value={bookingForm.schedule_time}
                      onChange={(e) => setBookingForm({ ...bookingForm, schedule_time: e.target.value })}
                      className="mt-2 w-full px-4 py-3 bg-slate-50 rounded-xl border-none outline-none"
                    />
                  </div>
                </div>
              )}

              <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 text-sm text-slate-600">
                <p><span className="font-bold">Wallet Balance:</span> ₹{wallet?.balance || 0}</p>
                <p className="mt-1"><span className="font-bold">If wallet is not enough:</span> remaining amount will open verified UPI payment.</p>
              </div>

              <Button
                onClick={handleBookMachine}
                disabled={bookingLoading}
                className="w-full bg-[#10b981] hover:bg-[#059669] text-white py-6 text-lg font-bold"
              >
                {bookingLoading ? 'Processing...' : 'Confirm Booking'}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {showRefundModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/70 backdrop-blur-sm p-4">
          <Card className="w-full max-w-lg bg-white rounded-[2rem] p-6 shadow-2xl border-none">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-xl font-black text-slate-900">Refund Request</h2>
              <button
                onClick={() => setShowRefundModal(false)}
                className="p-2 rounded-full hover:bg-slate-100"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <Label>Reason</Label>
                <Textarea
                  value={refundForm.reason}
                  onChange={(e) => setRefundForm({ ...refundForm, reason: e.target.value })}
                  placeholder="Explain why this cycle failed and why refund is needed..."
                  className="mt-2 min-h-[120px]"
                />
              </div>

              <Button
                onClick={handleSubmitRefund}
                className="w-full bg-red-500 hover:bg-red-600 text-white py-6 text-lg font-bold"
              >
                Submit Refund Request
              </Button>
            </div>
          </Card>
        </div>
      )}

      {showScanner && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-4">
          <Card className="w-full max-w-xl bg-white rounded-[2rem] p-5 shadow-2xl border-none">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
                <ScanLine size={18} className="text-[#5B7FED]" />
                QR Scanner
              </h2>
              <button onClick={stopScanner} className="p-2 rounded-full hover:bg-slate-100">
                <X size={18} />
              </button>
            </div>

            <div className="rounded-2xl overflow-hidden bg-slate-900">
              <video ref={videoRef} autoPlay playsInline className="w-full h-[360px] object-cover" />
            </div>

            <p className="text-sm text-slate-500 mt-4">
              Point the camera at the washer or dryer QR code in your hostel.
            </p>
          </Card>
        </div>
      )}

      {showBookingScanner && pendingBookingData && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-4">
          <Card className="w-full max-w-sm bg-white rounded-[2rem] p-6 shadow-2xl border-none text-center fade-in">
            <h3 className="font-bold text-slate-800 text-lg mb-2">Complete Remaining Payment</h3>
            <p className="text-sm text-slate-500 mb-4">
              Wallet usable: ₹{pendingBookingData.wallet_amount || 0} <br />
              Remaining to pay: <span className="font-bold text-slate-900">₹{pendingBookingData.online_amount || 0}</span>
            </p>

            <div className="bg-white p-4 rounded-xl shadow-sm mb-4 border border-slate-100">
              <QRCodeCanvas value={bookingQrValue} size={192} includeMargin />
            </div>

            <p className="text-xs font-black uppercase tracking-wider text-slate-500 mb-2">
              Ref: {paymentReference || 'N/A'}
            </p>
            <p className="text-[11px] break-all text-slate-400 mb-5">{bookingQrValue}</p>

            <div className="flex flex-col gap-3">
              <Button
                onClick={handleVerifyBookingPayment}
                disabled={paymentVerifyLoading}
                className="w-full bg-[#10B981] hover:bg-emerald-600 text-white rounded-xl"
              >
                {paymentVerifyLoading ? 'Verifying...' : 'I Have Paid - Verify'}
              </Button>

              <Button
                onClick={() => {
                  setShowBookingScanner(false);
                  setPendingBookingData(null);
                  setPaymentReference('');
                  setPaymentPurpose('');
                  setUpiLink('');
                  setUpiAmount(0);
                }}
                variant="outline"
                className="w-full rounded-xl border-slate-300 text-slate-600"
              >
                Cancel Payment
              </Button>
            </div>

            {paymentReceiptUrl ? (
              <button
                type="button"
                onClick={() => window.open(`${backendUrl}${paymentReceiptUrl}`, '_blank')}
                className="mt-4 inline-flex items-center justify-center gap-2 text-sm font-bold text-[#5B7FED]"
              >
                <Receipt size={16} /> View Receipt
              </button>
            ) : null}
          </Card>
        </div>
      )}
    </div>
  );
}
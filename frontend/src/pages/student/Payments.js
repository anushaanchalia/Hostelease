import React, { useEffect, useMemo, useState } from 'react';
import { Card } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Label } from '../../components/ui/label';
import api from '../../utils/api';
import {
  CreditCard,
  AlertTriangle,
  FileText,
  CheckCircle2,
  FileSignature,
  QrCode,
  RefreshCcw,
  IndianRupee,
  Building2,
  Clock3,
  ShieldCheck,
  X,
  BadgeCheck,
  Scale,
  Search,
  Download,
  Filter,
  Receipt,
  CalendarDays
} from 'lucide-react';
import { toast } from 'sonner';

export default function Payments() {
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [appealFineId, setAppealFineId] = useState(null);
  const [appealText, setAppealText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [payModal, setPayModal] = useState(null);
  const [paymentForm, setPaymentForm] = useState({
    paymentMethod: 'upi',
    payerUpi: '',
    transactionRef: '',
    qrScanned: false
  });

  const [fineSearch, setFineSearch] = useState('');
  const [fineStatusFilter, setFineStatusFilter] = useState('all');
  const [fineFromDate, setFineFromDate] = useState('');
  const [fineToDate, setFineToDate] = useState('');

  const upiId = 'hostelease@upi';
  const merchantName = 'Hostelease Hostel Fees';
  const payAmount = payModal?.type === 'fine'
    ? Number(payModal?.final_payable_amount || (Number(payModal?.amount || 0) + Number(payModal?.late_fee_amount || 0)))
    : Number(payModal?.amount || 0);

  const upiPayload = `upi://pay?pa=${upiId}&pn=${encodeURIComponent(merchantName)}&am=${payAmount}&cu=INR&tn=${encodeURIComponent(payModal?.purpose || payModal?.reason || 'Hostel Payment')}`;
  const qrImageUrl = `https://quickchart.io/qr?text=${encodeURIComponent(upiPayload)}&size=220`;

  useEffect(() => {
    loadPayments();
  }, []);

  const loadPayments = async (showRefresh = false) => {
    try {
      if (showRefresh) setRefreshing(true);
      else setLoading(true);

      const response = await api.get('/payments');
      setPayments(Array.isArray(response.data) ? response.data : []);
      if (showRefresh) toast.success('Payments refreshed');
    } catch (error) {
      console.error('Error loading payments:', error);
      toast.error('Failed to load payments history');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const submitAppeal = async () => {
    if (!appealText.trim()) {
      toast.error('Please provide a reason for the appeal.');
      return;
    }
    setIsSubmitting(true);
    try {
      await api.post(`/student/fines/${appealFineId}/appeal`, { appeal_text: appealText });
      toast.success('Appeal submitted successfully. Awaiting Warden review.');
      setAppealFineId(null);
      setAppealText('');
      loadPayments();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to submit appeal');
    } finally {
      setIsSubmitting(false);
    }
  };

  const bookingPayments = useMemo(
    () =>
      payments.filter(
        (p) =>
          String(p.purpose || '').toLowerCase().includes('yearly booking') ||
          p.type === 'hostel_booking'
      ),
    [payments]
  );

  const fines = useMemo(() => payments.filter((p) => p.type === 'fine'), [payments]);

  const filteredFines = useMemo(() => {
    return fines.filter((fine) => {
      const searchMatch =
        !fineSearch.trim() ||
        String(fine.reason || '').toLowerCase().includes(fineSearch.toLowerCase()) ||
        String(fine.category || '').toLowerCase().includes(fineSearch.toLowerCase()) ||
        String(fine.status || '').toLowerCase().includes(fineSearch.toLowerCase()) ||
        String(fine.admin_remarks || '').toLowerCase().includes(fineSearch.toLowerCase());

      const statusMatch =
        fineStatusFilter === 'all'
          ? true
          : String(fine.status || '').toLowerCase() === fineStatusFilter.toLowerCase();

      const rawDate = fine.date || fine.created_at;
      const fineDate = rawDate ? new Date(rawDate) : null;

      const fromMatch = fineFromDate
        ? fineDate && fineDate >= new Date(`${fineFromDate}T00:00:00`)
        : true;

      const toMatch = fineToDate
        ? fineDate && fineDate <= new Date(`${fineToDate}T23:59:59`)
        : true;

      return searchMatch && statusMatch && fromMatch && toMatch;
    });
  }, [fines, fineSearch, fineStatusFilter, fineFromDate, fineToDate]);

  const generalPayments = useMemo(
    () =>
      payments.filter(
        (p) => p.type !== 'fine' && !bookingPayments.some((bp) => String(bp._id) === String(p._id))
      ),
    [payments, bookingPayments]
  );

  const fineSummary = useMemo(() => {
    const pending = fines.filter((f) => String(f.status || '').toLowerCase() === 'pending').length;
    const appealed = fines.filter((f) => String(f.status || '').toLowerCase() === 'appealed').length;
    const paid = fines.filter((f) => String(f.status || '').toLowerCase() === 'paid').length;
    const waived = fines.filter((f) => String(f.status || '').toLowerCase() === 'waived').length;
    return { pending, appealed, paid, waived };
  }, [fines]);

  const openRepayModal = (payment) => {
    setPayModal(payment);
    setPaymentForm({
      paymentMethod: 'upi',
      payerUpi: '',
      transactionRef: '',
      qrScanned: false
    });
  };

  const openFinePaymentModal = (fine) => {
    setPayModal({
      ...fine,
      payment_kind: 'fine',
      purpose: fine.category ? `${fine.category} Fine Payment` : 'Fine Payment',
      final_payable_amount: Number(fine.amount || 0) + Number(fine.late_fee_amount || 0)
    });
    setPaymentForm({
      paymentMethod: 'upi',
      payerUpi: '',
      transactionRef: '',
      qrScanned: false
    });
  };

  const handleSubmitPendingPayment = async () => {
    if (!payModal) {
      return toast.error('Payment data missing');
    }

    if (!paymentForm.qrScanned) {
      return toast.error('Please confirm QR scan and payment');
    }
    if (!paymentForm.transactionRef.trim()) {
      return toast.error('Enter transaction reference / UTR');
    }
    if (!paymentForm.payerUpi.trim()) {
      return toast.error('Enter payer UPI / payer account ID');
    }

    try {
      if (payModal.payment_kind === 'fine' || payModal.type === 'fine') {
        await api.post(`/student/fines/${payModal._id}/pay`, {
          payment_method: paymentForm.paymentMethod,
          payer_upi: paymentForm.payerUpi,
          transaction_ref: paymentForm.transactionRef,
          qr_scanned: paymentForm.qrScanned
        });
        toast.success('Fine paid successfully');
      } else {
        if (!payModal?.booking_ref) {
          return toast.error('Booking reference missing for this payment');
        }

        await api.post(`/bookings/submit-payment/${payModal.booking_ref}`, {
          payment_method: paymentForm.paymentMethod,
          payer_upi: paymentForm.payerUpi,
          transaction_ref: paymentForm.transactionRef,
          qr_scanned: paymentForm.qrScanned
        });
        toast.success('Payment completed successfully');
      }

      setPayModal(null);
      loadPayments();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Payment failed');
    }
  };

  const getFineStatusChip = (status) => {
    const value = String(status || '').toLowerCase();
    if (value === 'paid') return 'bg-emerald-100 text-emerald-700';
    if (value === 'appealed') return 'bg-purple-100 text-purple-700';
    if (value === 'waived') return 'bg-blue-100 text-blue-700';
    return 'bg-orange-100 text-orange-700';
  };

  const exportFinesCsv = () => {
    if (!filteredFines.length) {
      toast.error('No fine records available to export');
      return;
    }

    const headers = [
      'Category',
      'Reason',
      'Amount',
      'Late Fee',
      'Final Paid Amount',
      'Status',
      'Date',
      'Due Date',
      'Paid At',
      'Payment Mode',
      'Transaction Ref',
      'Appeal Text',
      'Admin Remarks'
    ];

    const rows = filteredFines.map((fine) => [
      fine.category || '',
      fine.reason || '',
      fine.amount || '',
      fine.late_fee_amount || '',
      fine.final_paid_amount || '',
      fine.status || '',
      fine.date || fine.created_at || '',
      fine.due_date || '',
      fine.paid_at || '',
      fine.payment_mode || '',
      fine.transaction_ref || '',
      fine.appeal_text || '',
      fine.admin_remarks || ''
    ]);

    const csvContent = [headers, ...rows]
      .map((row) =>
        row
          .map((item) => `"${String(item ?? '').replace(/"/g, '""')}"`)
          .join(',')
      )
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'student_fines_history.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const isOverdueFine = (fine) => {
    if (!fine?.due_date) return false;
    if (String(fine.status || '').toLowerCase() !== 'pending') return false;
    return new Date(fine.due_date).getTime() < Date.now();
  };

  const applyFineQuickDatePreset = (preset) => {
    const now = new Date();

    if (preset === 'all') {
      setFineFromDate('');
      setFineToDate('');
      return;
    }

    if (preset === 'today') {
      const today = now.toISOString().slice(0, 10);
      setFineFromDate(today);
      setFineToDate(today);
      return;
    }

    if (preset === 'week') {
      const day = now.getDay();
      const diffToMonday = day === 0 ? 6 : day - 1;
      const monday = new Date(now);
      monday.setDate(now.getDate() - diffToMonday);
      setFineFromDate(monday.toISOString().slice(0, 10));
      setFineToDate(now.toISOString().slice(0, 10));
      return;
    }

    if (preset === 'month') {
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      setFineFromDate(firstDay.toISOString().slice(0, 10));
      setFineToDate(now.toISOString().slice(0, 10));
    }
  };

  if (loading) return <div className="p-8 text-center text-slate-500">Loading payment records...</div>;

  return (
    <div className="space-y-8 fade-in" data-testid="payments-page">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <CreditCard size={32} className="text-[#5B7FED]" />
          <div>
            <h1 className="text-3xl font-bold text-slate-900" style={{ fontFamily: 'Manrope, sans-serif' }}>
              Payments & Fines
            </h1>
            <p className="text-slate-500 text-sm mt-1">Manage hostel booking payments, fee obligations and disciplinary records</p>
          </div>
        </div>

        <Button
          variant="outline"
          onClick={() => loadPayments(true)}
          disabled={refreshing}
          className="border-slate-200 text-slate-700"
        >
          <RefreshCcw size={14} className={`mr-2 ${refreshing ? 'animate-spin' : ''}`} />
          {refreshing ? 'Refreshing...' : 'Refresh'}
        </Button>
      </div>

      {bookingPayments.length > 0 && (
        <Card className="p-6 bg-white rounded-2xl shadow-sm border border-slate-100">
          <div className="flex items-center gap-2 mb-4 text-[#5B7FED]">
            <Building2 size={20} />
            <h2 className="text-xl font-bold">Hostel Booking Payments</h2>
          </div>

          <div className="space-y-4">
            {bookingPayments.map((payment, index) => {
              const status = String(payment.status || '').toLowerCase();
              const canRetry = status === 'pending' || status === 'failed' || status === 'pending_payment';

              return (
                <div key={index} className="p-5 bg-slate-50 rounded-xl border border-slate-100">
                  <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-3 mb-2">
                        <span className="font-black text-xl text-slate-900">₹{payment.amount}</span>
                        <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                          status === 'success' || status === 'paid'
                            ? 'bg-emerald-100 text-emerald-700'
                            : status === 'failed'
                            ? 'bg-rose-100 text-rose-700'
                            : 'bg-orange-100 text-orange-700'
                        }`}>
                          {payment.status}
                        </span>
                      </div>

                      <p className="text-sm font-medium text-slate-700">{payment.purpose}</p>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4 text-xs">
                        <div className="rounded-lg bg-white p-3 border border-slate-100">
                          <p className="font-black text-slate-400 uppercase tracking-widest mb-1">Payment Method</p>
                          <p className="font-semibold text-slate-700">{payment.payment_method || payment.payment_mode || 'UPI'}</p>
                        </div>
                        <div className="rounded-lg bg-white p-3 border border-slate-100">
                          <p className="font-black text-slate-400 uppercase tracking-widest mb-1">Transaction Ref</p>
                          <p className="font-semibold text-slate-700">{payment.transaction_ref || 'Not submitted yet'}</p>
                        </div>
                        <div className="rounded-lg bg-white p-3 border border-slate-100">
                          <p className="font-black text-slate-400 uppercase tracking-widest mb-1">Payer UPI</p>
                          <p className="font-semibold text-slate-700">{payment.payer_upi || 'Not submitted yet'}</p>
                        </div>
                        <div className="rounded-lg bg-white p-3 border border-slate-100">
                          <p className="font-black text-slate-400 uppercase tracking-widest mb-1">Date</p>
                          <p className="font-semibold text-slate-700">{new Date(payment.date || payment.created_at).toLocaleString()}</p>
                        </div>
                      </div>
                    </div>

                    {canRetry && (
                      <Button onClick={() => openRepayModal(payment)} className="bg-slate-900 hover:bg-slate-800 text-white">
                        <RefreshCcw size={16} className="mr-2" />
                        Pay / Retry
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {fines.length > 0 && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="p-4 rounded-2xl border border-orange-100 bg-white shadow-sm">
              <p className="text-[11px] font-black uppercase tracking-widest text-orange-500">Pending</p>
              <p className="text-2xl font-black text-slate-900 mt-2">{fineSummary.pending}</p>
            </Card>
            <Card className="p-4 rounded-2xl border border-purple-100 bg-white shadow-sm">
              <p className="text-[11px] font-black uppercase tracking-widest text-purple-500">Appealed</p>
              <p className="text-2xl font-black text-slate-900 mt-2">{fineSummary.appealed}</p>
            </Card>
            <Card className="p-4 rounded-2xl border border-emerald-100 bg-white shadow-sm">
              <p className="text-[11px] font-black uppercase tracking-widest text-emerald-500">Paid</p>
              <p className="text-2xl font-black text-slate-900 mt-2">{fineSummary.paid}</p>
            </Card>
            <Card className="p-4 rounded-2xl border border-blue-100 bg-white shadow-sm">
              <p className="text-[11px] font-black uppercase tracking-widest text-blue-500">Waived</p>
              <p className="text-2xl font-black text-slate-900 mt-2">{fineSummary.waived}</p>
            </Card>
          </div>

          <Card className="p-6 bg-white rounded-2xl shadow-sm border-2 border-orange-100">
            <div className="flex flex-col gap-4 mb-4">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 text-orange-600">
                <div className="flex items-center gap-2">
                  <AlertTriangle size={20} />
                  <h2 className="text-xl font-bold">Disciplinary Fines</h2>
                </div>

                <div className="flex flex-col sm:flex-row items-center gap-3 w-full lg:w-auto">
                  <div className="relative w-full sm:w-64">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      value={fineSearch}
                      onChange={(e) => setFineSearch(e.target.value)}
                      placeholder="Search fine category or reason"
                      className="w-full pl-9 pr-4 py-3 rounded-xl border border-slate-200 bg-slate-50 text-sm outline-none"
                    />
                  </div>

                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    <Filter size={14} className="text-slate-400" />
                    <select
                      value={fineStatusFilter}
                      onChange={(e) => setFineStatusFilter(e.target.value)}
                      className="w-full sm:w-auto px-3 py-3 rounded-xl border border-slate-200 bg-slate-50 text-sm outline-none"
                    >
                      <option value="all">All Status</option>
                      <option value="pending">Pending</option>
                      <option value="appealed">Appealed</option>
                      <option value="paid">Paid</option>
                      <option value="waived">Waived</option>
                    </select>
                  </div>

                  <Button
                    variant="outline"
                    onClick={exportFinesCsv}
                    className="border-slate-200 text-slate-700"
                  >
                    <Download size={14} className="mr-2" />
                    Export CSV
                  </Button>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" onClick={() => applyFineQuickDatePreset('today')} className="border-slate-200 text-slate-700">
                  Today
                </Button>
                <Button type="button" variant="outline" onClick={() => applyFineQuickDatePreset('week')} className="border-slate-200 text-slate-700">
                  This Week
                </Button>
                <Button type="button" variant="outline" onClick={() => applyFineQuickDatePreset('month')} className="border-slate-200 text-slate-700">
                  This Month
                </Button>
                <Button type="button" variant="outline" onClick={() => applyFineQuickDatePreset('all')} className="border-slate-200 text-slate-700">
                  All Time
                </Button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 block">From Date</Label>
                  <input
                    type="date"
                    value={fineFromDate}
                    onChange={(e) => setFineFromDate(e.target.value)}
                    className="w-full px-3 py-3 rounded-xl border border-slate-200 bg-slate-50 text-sm outline-none"
                  />
                </div>

                <div>
                  <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 block">To Date</Label>
                  <input
                    type="date"
                    value={fineToDate}
                    onChange={(e) => setFineToDate(e.target.value)}
                    className="w-full px-3 py-3 rounded-xl border border-slate-200 bg-slate-50 text-sm outline-none"
                  />
                </div>

                <div className="flex items-end">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setFineFromDate('');
                      setFineToDate('');
                    }}
                    className="w-full border-slate-200 text-slate-700"
                  >
                    Clear Dates
                  </Button>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              {filteredFines.map((fine, index) => (
                <div key={index} className="flex flex-col md:flex-row md:items-start justify-between p-5 bg-orange-50/30 rounded-xl border border-orange-100/50">
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-3 mb-1">
                      <span className="font-black text-xl text-slate-900">₹{fine.amount}</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${getFineStatusChip(fine.status)}`}>
                        {fine.status}
                      </span>
                      {fine.category && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-600">
                          {fine.category}
                        </span>
                      )}
                      {isOverdueFine(fine) && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-rose-100 text-rose-700">
                          Overdue
                        </span>
                      )}
                    </div>

                    <p className="text-sm font-medium text-slate-700 my-2">{fine.reason}</p>

                    <div className="flex flex-wrap items-center gap-4 text-xs font-bold text-slate-500 uppercase tracking-widest mt-2">
                      <span>{new Date(fine.date || fine.created_at).toLocaleDateString()}</span>
                      {fine.due_date && (
                        <span className="flex items-center gap-1">
                          <CalendarDays size={12} />
                          Due: {new Date(fine.due_date).toLocaleDateString()}
                        </span>
                      )}
                      {fine.paid_at && <span className="text-emerald-600">Paid: {new Date(fine.paid_at).toLocaleDateString()}</span>}
                      {fine.payment_mode && <span>{fine.payment_mode}</span>}
                      {fine.transaction_ref && <span>Ref: {fine.transaction_ref}</span>}
                      {fine.proof_url && (
                        <a href={fine.proof_url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-[#5B7FED] hover:underline">
                          <FileText size={12} /> View Evidence
                        </a>
                      )}
                    </div>

                    {Number(fine.late_fee_amount || 0) > 0 && (
                      <div className="mt-4 rounded-xl bg-rose-50 border border-rose-100 p-4">
                        <div className="flex items-center gap-2">
                          <IndianRupee size={14} className="text-rose-600" />
                          <p className="text-sm font-semibold text-rose-700">
                            Late Fee Applied: ₹{fine.late_fee_amount}
                          </p>
                        </div>
                      </div>
                    )}

                    {fine.status === 'Appealed' && fine.appeal_text && (
                      <div className="mt-4 rounded-xl bg-purple-50 border border-purple-100 p-4">
                        <div className="flex items-center gap-2 mb-1">
                          <Scale size={14} className="text-purple-600" />
                          <p className="text-[10px] uppercase tracking-widest font-black text-purple-600">Your Appeal</p>
                        </div>
                        <p className="text-sm text-purple-900/80 italic">"{fine.appeal_text}"</p>
                      </div>
                    )}

                    {fine.admin_remarks ? (
                      <div className="mt-4 rounded-xl bg-slate-50 border border-slate-200 p-4">
                        <div className="flex items-center gap-2 mb-1">
                          <Receipt size={14} className="text-slate-600" />
                          <p className="text-[10px] uppercase tracking-widest font-black text-slate-600">Admin Remarks</p>
                        </div>
                        <p className="text-sm text-slate-700">{fine.admin_remarks}</p>
                      </div>
                    ) : null}

                    {fine.status === 'Waived' && (
                      <div className="mt-4 rounded-xl bg-blue-50 border border-blue-100 p-4">
                        <div className="flex items-center gap-2">
                          <BadgeCheck size={14} className="text-blue-600" />
                          <p className="text-sm font-semibold text-blue-700">This fine was waived by admin after review.</p>
                        </div>
                      </div>
                    )}

                    {fine.status === 'Paid' && (
                      <div className="mt-4 rounded-xl bg-emerald-50 border border-emerald-100 p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <Receipt size={14} className="text-emerald-600" />
                          <p className="text-[10px] uppercase tracking-widest font-black text-emerald-600">Receipt Snapshot</p>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                          <div>
                            <p className="font-black text-slate-400 uppercase tracking-widest mb-1">Base Amount</p>
                            <p className="font-semibold text-slate-700">₹{fine.amount}</p>
                          </div>
                          <div>
                            <p className="font-black text-slate-400 uppercase tracking-widest mb-1">Late Fee</p>
                            <p className="font-semibold text-slate-700">₹{fine.late_fee_amount || 0}</p>
                          </div>
                          <div>
                            <p className="font-black text-slate-400 uppercase tracking-widest mb-1">Final Paid</p>
                            <p className="font-semibold text-slate-700">₹{fine.final_paid_amount || fine.amount}</p>
                          </div>
                          <div>
                            <p className="font-black text-slate-400 uppercase tracking-widest mb-1">Method</p>
                            <p className="font-semibold text-slate-700">{fine.payment_mode || 'Online'}</p>
                          </div>
                          <div>
                            <p className="font-black text-slate-400 uppercase tracking-widest mb-1">Paid Date</p>
                            <p className="font-semibold text-slate-700">
                              {fine.paid_at ? new Date(fine.paid_at).toLocaleString() : '-'}
                            </p>
                          </div>
                          <div>
                            <p className="font-black text-slate-400 uppercase tracking-widest mb-1">Transaction Ref</p>
                            <p className="font-semibold text-slate-700">{fine.transaction_ref || 'Not available'}</p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {String(fine.status || '').toLowerCase() === 'pending' && (
                    <div className="mt-4 md:mt-0 flex flex-col gap-2 shrink-0 md:ml-6">
                      <Button onClick={() => openFinePaymentModal(fine)} className="w-full md:w-32 bg-slate-900 hover:bg-slate-800 text-white shadow-lg">
                        <QrCode size={16} className="mr-2" /> Pay Now
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => setAppealFineId(fine._id)}
                        className="w-full md:w-32 border-slate-200 text-slate-600 hover:bg-slate-50"
                      >
                        <FileSignature size={14} className="mr-2" /> File Appeal
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Card>
        </>
      )}

      {appealFineId && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <Card className="w-full max-w-md p-6 bg-white rounded-2xl shadow-2xl">
            <h3 className="text-xl font-bold text-slate-900 mb-2">File an Appeal</h3>
            <p className="text-sm text-slate-500 mb-4">Explain why you are disputing this fine. The Warden will review your appeal and make a final decision.</p>
            <textarea
              className="w-full h-32 p-3 border border-slate-200 rounded-xl bg-slate-50 mb-4 text-sm focus:outline-none focus:ring-2 focus:ring-[#5B7FED]"
              placeholder="Provide evidence or context for your appeal..."
              value={appealText}
              onChange={(e) => setAppealText(e.target.value)}
            />
            <div className="flex justify-end gap-3">
              <Button variant="ghost" onClick={() => setAppealFineId(null)} disabled={isSubmitting}>Cancel</Button>
              <Button className="bg-[#5B7FED] text-white" onClick={submitAppeal} disabled={isSubmitting}>
                {isSubmitting ? 'Submitting...' : 'Submit Appeal'}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {payModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <Card className="w-full max-w-4xl p-6 bg-white rounded-2xl shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-xl font-bold text-slate-900">
                  {payModal.payment_kind === 'fine' || payModal.type === 'fine'
                    ? 'Complete Fine Payment'
                    : 'Complete Pending Payment'}
                </h3>
                <p className="text-sm text-slate-500">
                  {payModal.payment_kind === 'fine' || payModal.type === 'fine'
                    ? 'Scan and pay the disciplinary fine to clear your ledger.'
                    : 'Pay now to reopen and confirm your hostel booking.'}
                </p>
              </div>
              <button onClick={() => setPayModal(null)} className="p-2 hover:bg-slate-100 rounded-full">
                <X size={18} />
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="rounded-2xl border border-slate-100 bg-slate-50 p-6 text-center">
                <img src={qrImageUrl} alt="UPI QR" className="w-[220px] h-[220px] mx-auto rounded-xl border border-slate-200 bg-white" />
                <div className="mt-4 space-y-2 text-sm">
                  <p className="font-bold text-slate-900">UPI ID: {upiId}</p>
                  <p className="text-slate-600">Merchant: {merchantName}</p>
                  <p className="text-slate-600">Amount: ₹{payAmount}</p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="rounded-xl bg-slate-50 border border-slate-100 p-4">
                  <p className="font-semibold text-slate-900">{payModal.purpose || payModal.reason}</p>
                  <p className="text-sm text-slate-500 mt-1">
                    Status: <span className="font-bold">{payModal.status}</span>
                  </p>
                  {payModal.category && (
                    <p className="text-xs text-slate-500 mt-2">Category: {payModal.category}</p>
                  )}
                  {(payModal.type === 'fine' || payModal.payment_kind === 'fine') && (
                    <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                      <div className="rounded-lg bg-white p-3 border border-slate-100">
                        <p className="font-black text-slate-400 uppercase tracking-widest mb-1">Base</p>
                        <p className="font-semibold text-slate-700">₹{payModal.amount || 0}</p>
                      </div>
                      <div className="rounded-lg bg-white p-3 border border-slate-100">
                        <p className="font-black text-slate-400 uppercase tracking-widest mb-1">Late Fee</p>
                        <p className="font-semibold text-slate-700">₹{payModal.late_fee_amount || 0}</p>
                      </div>
                      <div className="rounded-lg bg-white p-3 border border-slate-100">
                        <p className="font-black text-slate-400 uppercase tracking-widest mb-1">Final Payable</p>
                        <p className="font-semibold text-slate-700">₹{payAmount}</p>
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <Label className="text-sm font-semibold text-slate-700 mb-2 block">Payment Method</Label>
                  <select
                    value={paymentForm.paymentMethod}
                    onChange={(e) => setPaymentForm((prev) => ({ ...prev, paymentMethod: e.target.value }))}
                    className="w-full p-3 border border-slate-200 rounded-xl bg-slate-50 outline-none"
                  >
                    <option value="upi">UPI</option>
                    <option value="card">Card</option>
                    <option value="netbanking">Net Banking</option>
                  </select>
                </div>

                <div>
                  <Label className="text-sm font-semibold text-slate-700 mb-2 block">Payer UPI / Account</Label>
                  <input
                    value={paymentForm.payerUpi}
                    onChange={(e) => setPaymentForm((prev) => ({ ...prev, payerUpi: e.target.value }))}
                    className="w-full p-3 border border-slate-200 rounded-xl bg-slate-50 outline-none"
                    placeholder="example@upi"
                  />
                </div>

                <div>
                  <Label className="text-sm font-semibold text-slate-700 mb-2 block">Transaction Ref / UTR</Label>
                  <input
                    value={paymentForm.transactionRef}
                    onChange={(e) => setPaymentForm((prev) => ({ ...prev, transactionRef: e.target.value }))}
                    className="w-full p-3 border border-slate-200 rounded-xl bg-slate-50 outline-none"
                    placeholder="Enter transaction reference"
                  />
                </div>

                <label className="flex items-center gap-3 p-3 rounded-xl bg-blue-50 border border-blue-100 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={paymentForm.qrScanned}
                    onChange={(e) => setPaymentForm((prev) => ({ ...prev, qrScanned: e.target.checked }))}
                  />
                  <span className="text-sm font-medium text-slate-700">
                    I scanned the QR and completed the payment
                  </span>
                </label>

                <div className="rounded-xl bg-slate-50 border border-slate-100 p-4 space-y-2 text-sm text-slate-600">
                  <div className="flex items-center gap-2"><IndianRupee size={14} /> Amount: ₹{payAmount}</div>
                  <div className="flex items-center gap-2"><Clock3 size={14} /> Pending payment can be reopened from here</div>
                  <div className="flex items-center gap-2"><ShieldCheck size={14} /> Record updates after successful payment</div>
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <Button variant="ghost" onClick={() => setPayModal(null)}>Cancel</Button>
                  <Button className="bg-slate-900 hover:bg-slate-800 text-white" onClick={handleSubmitPendingPayment}>
                    Confirm Payment
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        </div>
      )}

      <Card className="p-6 bg-white rounded-2xl shadow-sm border border-slate-100" data-testid="payments-list">
        <h2 className="text-xl font-bold text-slate-900 mb-4">General Payment History</h2>
        {generalPayments.length === 0 ? (
          <div className="text-center py-12 text-slate-500">No regular payment records found</div>
        ) : (
          <div className="space-y-4">
            {generalPayments.map((payment, index) => (
              <div key={index} className="flex justify-between items-center p-4 bg-slate-50 rounded-xl border border-slate-100" data-testid={`payment-item-${index}`}>
                <div>
                  <p className="font-bold text-slate-900 text-lg">₹{payment.amount}</p>
                  <p className="text-sm font-medium text-slate-600 mt-0.5">{payment.purpose || payment.payment_mode}</p>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-2">{new Date(payment.date || payment.created_at).toLocaleDateString()}</p>
                </div>
                <span className={`px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider ${
                  payment.status === 'Paid' || payment.status === 'Success' ? 'bg-emerald-100 text-emerald-700' :
                  payment.status === 'Refunded' ? 'bg-slate-200 text-slate-700' :
                  'bg-orange-100 text-orange-700'
                }`}>
                  {payment.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
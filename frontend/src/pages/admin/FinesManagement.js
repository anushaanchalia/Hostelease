import React, { useState, useEffect, useMemo } from 'react';
import { Card } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import {
  Upload,
  AlertTriangle,
  Search,
  ShieldCheck,
  XCircle,
  FileText,
  CheckCircle2,
  Filter,
  User,
  MapPin,
  GraduationCap,
  RefreshCcw,
  Download,
  CalendarDays,
  Receipt,
  IndianRupee,
  Clock3
} from 'lucide-react';
import { toast } from 'sonner';
import api from '../../utils/api';

const VIOLATION_CATEGORIES = [
  'Late Entry',
  'Property Damage',
  'Noise Violation',
  'Prohibited Items',
  'Hygiene / Cleanliness',
  'Other'
];

const STATUS_OPTIONS = ['All', 'Pending', 'Paid', 'Appealed', 'Waived'];

export default function FinesManagement() {
  const [fines, setFines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [fromDateFilter, setFromDateFilter] = useState('');
  const [toDateFilter, setToDateFilter] = useState('');

  const [enrollmentNumber, setEnrollmentNumber] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState(VIOLATION_CATEGORIES[0]);
  const [reason, setReason] = useState('');
  const [proofFile, setProofFile] = useState(null);
  const [dueDate, setDueDate] = useState('');
  const [adminRemarks, setAdminRemarks] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lateFeeLoading, setLateFeeLoading] = useState(false);
  const [refreshingLedger, setRefreshingLedger] = useState(false);

  const [studentSearch, setStudentSearch] = useState('');
  const [studentResults, setStudentResults] = useState([]);
  const [searchingStudents, setSearchingStudents] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState(null);

  useEffect(() => {
    fetchFines();
  }, []);

  useEffect(() => {
    const delay = setTimeout(() => {
      if (studentSearch.trim().length >= 1) {
        searchStudents(studentSearch);
      } else {
        setStudentResults([]);
      }
    }, 300);

    return () => clearTimeout(delay);
  }, [studentSearch]);

  const fetchFines = async (showRefreshState = false) => {
    try {
      if (showRefreshState) setRefreshingLedger(true);
      else setLoading(true);

      const response = await api.get('/admin/fines');
      setFines(Array.isArray(response.data) ? response.data : []);
      if (showRefreshState) toast.success('Ledger refreshed');
    } catch (error) {
      console.error('Failed to fetch fines:', error);
      toast.error('Failed to load fines dataset');
    } finally {
      setLoading(false);
      setRefreshingLedger(false);
    }
  };

  const searchStudents = async (q) => {
    try {
      setSearchingStudents(true);
      const response = await api.get('/admin/students/search', { params: { q } });
      setStudentResults(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.error('Student search failed:', error);
    } finally {
      setSearchingStudents(false);
    }
  };

  const handleSelectStudent = (student) => {
    setSelectedStudent(student);
    setEnrollmentNumber(student.enrollment_number || '');
    setStudentSearch(student.student_name || student.enrollment_number || '');
    setStudentResults([]);
    toast.success(`Selected ${student.student_name}`);
  };

  const resetStudentSelection = () => {
    setSelectedStudent(null);
    setEnrollmentNumber('');
    setStudentSearch('');
    setStudentResults([]);
  };

  const handleIssueFine = async (e) => {
    e.preventDefault();
    if (!enrollmentNumber || !amount || !reason) {
      toast.error('Please fill in all required fields');
      return;
    }

    setIsSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('student_enrollment', enrollmentNumber.toUpperCase());
      formData.append('amount', amount);
      formData.append('category', category);
      formData.append('reason', reason);
      if (proofFile) formData.append('proof_image', proofFile);
      if (dueDate) formData.append('due_date', new Date(dueDate).toISOString());
      if (adminRemarks.trim()) formData.append('admin_remarks', adminRemarks.trim());

      await api.post('/admin/fines/issue', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      toast.success('Fine issued successfully');
      setEnrollmentNumber('');
      setAmount('');
      setReason('');
      setProofFile(null);
      setCategory(VIOLATION_CATEGORIES[0]);
      setSelectedStudent(null);
      setStudentSearch('');
      setDueDate('');
      setAdminRemarks('');
      fetchFines();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to issue fine');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResolveAppeal = async (fineId, action) => {
    try {
      const remarks = window.prompt(
        action === 'approve'
          ? 'Add remarks for waiving this fine (optional):'
          : 'Add remarks for rejecting this appeal (optional):',
        ''
      );

      await api.post(`/admin/fines/${fineId}/resolve-appeal`, {
        action,
        admin_remarks: remarks || ''
      });

      toast.success(
        action === 'approve'
          ? 'Appeal approved. Fine has been waived.'
          : 'Appeal rejected. Fine remains pending.'
      );
      fetchFines();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to resolve appeal');
    }
  };

  const handleApplyLateFees = async () => {
    try {
      setLateFeeLoading(true);
      const response = await api.post('/admin/fines/apply-late-fees');
      toast.success(`Late fees applied to ${response.data?.updated_count || 0} overdue fine(s)`);
      fetchFines();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to apply late fees');
    } finally {
      setLateFeeLoading(false);
    }
  };

  const applyQuickDatePreset = (preset) => {
    const now = new Date();

    if (preset === 'all') {
      setFromDateFilter('');
      setToDateFilter('');
      return;
    }

    if (preset === 'today') {
      const today = now.toISOString().slice(0, 10);
      setFromDateFilter(today);
      setToDateFilter(today);
      return;
    }

    if (preset === 'week') {
      const day = now.getDay();
      const diffToMonday = day === 0 ? 6 : day - 1;
      const monday = new Date(now);
      monday.setDate(now.getDate() - diffToMonday);
      setFromDateFilter(monday.toISOString().slice(0, 10));
      setToDateFilter(now.toISOString().slice(0, 10));
      return;
    }

    if (preset === 'month') {
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      setFromDateFilter(firstDay.toISOString().slice(0, 10));
      setToDateFilter(now.toISOString().slice(0, 10));
    }
  };

  const filteredFines = useMemo(() => {
    return fines.filter((f) => {
      const haystack = [
        f.student_enrollment,
        f.student_name,
        f.reason,
        f.category,
        f.hostel_name,
        f.course,
        f.block,
        f.room_number,
        f.bed_number,
        f.admin_remarks
      ]
        .join(' ')
        .toLowerCase();

      const searchMatch = haystack.includes(searchTerm.toLowerCase());

      const statusMatch =
        statusFilter === 'All' ? true : String(f.status || '').toLowerCase() === statusFilter.toLowerCase();

      const rawDate = f.date || f.created_at;
      const fineDate = rawDate ? new Date(rawDate) : null;

      const fromMatch = fromDateFilter
        ? fineDate && fineDate >= new Date(`${fromDateFilter}T00:00:00`)
        : true;

      const toMatch = toDateFilter
        ? fineDate && fineDate <= new Date(`${toDateFilter}T23:59:59`)
        : true;

      return searchMatch && statusMatch && fromMatch && toMatch;
    });
  }, [fines, searchTerm, statusFilter, fromDateFilter, toDateFilter]);

  const summary = useMemo(() => {
    const total = fines.length;
    const pending = fines.filter((f) => String(f.status || '').toLowerCase() === 'pending').length;
    const appealed = fines.filter((f) => String(f.status || '').toLowerCase() === 'appealed').length;
    const paid = fines.filter((f) => String(f.status || '').toLowerCase() === 'paid').length;
    const waived = fines.filter((f) => String(f.status || '').toLowerCase() === 'waived').length;

    const totalAmount = fines.reduce((sum, f) => sum + Number(f.amount || 0), 0);
    const collectedAmount = fines
      .filter((f) => String(f.status || '').toLowerCase() === 'paid')
      .reduce((sum, f) => sum + Number(f.final_paid_amount || f.amount || 0), 0);

    return { total, pending, appealed, paid, waived, totalAmount, collectedAmount };
  }, [fines]);

  const getStatusChip = (status) => {
    const value = String(status || '').toLowerCase();
    if (value === 'paid') return 'bg-emerald-100 text-emerald-700';
    if (value === 'appealed') return 'bg-purple-100 text-purple-700';
    if (value === 'waived') return 'bg-blue-100 text-blue-700';
    return 'bg-orange-100 text-orange-700';
  };

  const isOverdue = (fine) => {
    if (!fine?.due_date) return false;
    if (String(fine.status || '').toLowerCase() !== 'pending') return false;
    return new Date(fine.due_date).getTime() < Date.now();
  };

  const exportFineCsv = () => {
    if (!filteredFines.length) {
      toast.error('No fine records available to export');
      return;
    }

    const headers = [
      'Student Name',
      'Enrollment Number',
      'Course',
      'Year',
      'Hostel',
      'Block',
      'Room',
      'Bed',
      'Category',
      'Reason',
      'Amount',
      'Final Paid Amount',
      'Status',
      'Created Date',
      'Due Date',
      'Paid At',
      'Late Fee',
      'Appeal Text',
      'Admin Remarks'
    ];

    const rows = filteredFines.map((fine) => [
      fine.student_name || '',
      fine.student_enrollment || '',
      fine.course || '',
      fine.year || '',
      fine.hostel_name || '',
      fine.block || '',
      fine.room_number || '',
      fine.bed_number || '',
      fine.category || '',
      fine.reason || '',
      fine.amount || '',
      fine.final_paid_amount || '',
      fine.status || '',
      fine.date || fine.created_at || '',
      fine.due_date || '',
      fine.paid_at || '',
      fine.late_fee_amount || '',
      fine.appeal_text || '',
      fine.admin_remarks || ''
    ]);

    const csv = [headers, ...rows]
      .map((row) => row.map((item) => `"${String(item ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'fines_ledger_export.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const clearDateFilters = () => {
    setFromDateFilter('');
    setToDateFilter('');
  };

  return (
    <div className="space-y-6 fade-in" data-testid="admin-fines-page">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold text-slate-900" style={{ fontFamily: 'Manrope, sans-serif' }}>
            Fines & Disciplinary
          </h1>
          <p className="text-slate-500 mt-1">Issue and manage student violations, fine history and appeals</p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <Button
            type="button"
            variant="outline"
            onClick={() => fetchFines(true)}
            disabled={refreshingLedger}
            className="border-slate-200 text-slate-700"
          >
            <RefreshCcw size={14} className={`mr-2 ${refreshingLedger ? 'animate-spin' : ''}`} />
            {refreshingLedger ? 'Refreshing...' : 'Refresh Ledger'}
          </Button>

          <Button
            type="button"
            variant="outline"
            onClick={handleApplyLateFees}
            disabled={lateFeeLoading}
            className="border-orange-200 text-orange-700 hover:bg-orange-50"
          >
            <Clock3 size={14} className={`mr-2 ${lateFeeLoading ? 'animate-spin' : ''}`} />
            {lateFeeLoading ? 'Applying...' : 'Apply Late Fees'}
          </Button>

          <Button
            type="button"
            variant="outline"
            onClick={exportFineCsv}
            className="border-slate-200 text-slate-700"
          >
            <Download size={14} className="mr-2" />
            Export CSV
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
        <Card className="p-4 rounded-2xl border border-slate-100 bg-white shadow-sm">
          <p className="text-[11px] font-black uppercase tracking-widest text-slate-400">Total Fines</p>
          <p className="text-2xl font-black text-slate-900 mt-2">{summary.total}</p>
        </Card>
        <Card className="p-4 rounded-2xl border border-slate-100 bg-white shadow-sm">
          <p className="text-[11px] font-black uppercase tracking-widest text-orange-500">Pending</p>
          <p className="text-2xl font-black text-slate-900 mt-2">{summary.pending}</p>
        </Card>
        <Card className="p-4 rounded-2xl border border-slate-100 bg-white shadow-sm">
          <p className="text-[11px] font-black uppercase tracking-widest text-purple-500">Appealed</p>
          <p className="text-2xl font-black text-slate-900 mt-2">{summary.appealed}</p>
        </Card>
        <Card className="p-4 rounded-2xl border border-slate-100 bg-white shadow-sm">
          <p className="text-[11px] font-black uppercase tracking-widest text-emerald-500">Collected</p>
          <p className="text-2xl font-black text-slate-900 mt-2">₹{summary.collectedAmount}</p>
        </Card>
        <Card className="p-4 rounded-2xl border border-slate-100 bg-white shadow-sm">
          <p className="text-[11px] font-black uppercase tracking-widest text-blue-500">Waived</p>
          <p className="text-2xl font-black text-slate-900 mt-2">{summary.waived}</p>
        </Card>
        <Card className="p-4 rounded-2xl border border-slate-100 bg-white shadow-sm">
          <p className="text-[11px] font-black uppercase tracking-widest text-slate-500">Ledger Value</p>
          <p className="text-2xl font-black text-slate-900 mt-2">₹{summary.totalAmount}</p>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="p-6 bg-white rounded-2xl shadow-sm border border-slate-100 lg:col-span-1 h-fit sticky top-24">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center">
              <AlertTriangle size={20} />
            </div>
            <h2 className="text-xl font-bold text-slate-900">Issue Fine</h2>
          </div>

          <form onSubmit={handleIssueFine} className="space-y-4">
            <div className="relative">
              <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 block">Search Student</Label>
              <Input
                placeholder="Search by name, enrollment, hostel..."
                value={studentSearch}
                onChange={(e) => setStudentSearch(e.target.value)}
                className="bg-slate-50 border-slate-200"
              />
              {searchingStudents && (
                <p className="text-xs text-slate-400 mt-2 font-medium">Searching students...</p>
              )}

              {studentResults.length > 0 && (
                <div className="mt-2 max-h-56 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg">
                  {studentResults.map((student, idx) => (
                    <button
                      key={`${student.enrollment_number}-${idx}`}
                      type="button"
                      onClick={() => handleSelectStudent(student)}
                      className="w-full text-left px-4 py-3 hover:bg-slate-50 border-b border-slate-100 last:border-b-0"
                    >
                      <p className="font-semibold text-slate-900">{student.student_name}</p>
                      <p className="text-xs text-slate-500">
                        {student.enrollment_number} • {student.course} • Year {student.year}
                      </p>
                      <p className="text-xs text-slate-400">
                        {student.hostel_name || 'No hostel'} • Block {student.block || '-'} • Room {student.room_number || '-'} • Bed {student.bed_number || '-'}
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div>
              <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 block">Enrollment No</Label>
              <Input
                placeholder="e.g. CS12345"
                value={enrollmentNumber}
                onChange={(e) => setEnrollmentNumber(e.target.value)}
                className="bg-slate-50 border-slate-200"
              />
            </div>

            {selectedStudent && (
              <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-bold text-slate-900 flex items-center gap-2">
                      <User size={14} className="text-[#5B7FED]" />
                      {selectedStudent.student_name}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      {selectedStudent.enrollment_number} • {selectedStudent.course} • Year {selectedStudent.year}
                    </p>
                    <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                      <MapPin size={12} />
                      {selectedStudent.hostel_name || 'No hostel'} • Block {selectedStudent.block || '-'} • Room {selectedStudent.room_number || '-'} • Bed {selectedStudent.bed_number || '-'}
                    </p>
                  </div>
                  <Button type="button" variant="outline" onClick={resetStudentSelection} className="border-slate-200">
                    <RefreshCcw size={14} className="mr-2" />
                    Change
                  </Button>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 block">Amount (₹)</Label>
                <Input
                  type="number"
                  min="0"
                  placeholder="500"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="bg-slate-50 border-slate-200"
                />
              </div>
              <div>
                <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 block">Category</Label>
                <select
                  className="w-full flex h-10 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#5B7FED]"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                >
                  {VIOLATION_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 block">Description/Reason</Label>
              <textarea
                className="w-full h-24 p-3 rounded-md border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-[#5B7FED]"
                placeholder="Provide specific details of the violation..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>

            <div>
              <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 block">Due Date</Label>
              <Input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="bg-slate-50 border-slate-200"
              />
            </div>

            <div>
              <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 block">Admin Remarks</Label>
              <textarea
                className="w-full h-20 p-3 rounded-md border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-[#5B7FED]"
                placeholder="Optional note visible in records..."
                value={adminRemarks}
                onChange={(e) => setAdminRemarks(e.target.value)}
              />
            </div>

            <div>
              <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 block">Proof Image (Optional)</Label>
              <div className="border-2 border-dashed border-slate-200 rounded-xl p-4 text-center hover:bg-slate-50 transition-colors cursor-pointer relative overflow-hidden group">
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setProofFile(e.target.files?.[0] || null)}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                />
                <div className="flex flex-col items-center justify-center text-slate-500">
                  <Upload size={24} className="mb-2 text-slate-400 group-hover:text-[#5B7FED] transition-colors" />
                  <p className="text-xs font-medium">
                    {proofFile ? proofFile.name : 'Click to upload photographic evidence'}
                  </p>
                </div>
              </div>
            </div>

            <Button
              type="submit"
              className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold h-12 rounded-xl mt-6"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Processing...' : 'Issue Disciplinary Fine'}
            </Button>
          </form>
        </Card>

        <Card className="p-6 bg-white rounded-2xl shadow-sm border border-slate-100 lg:col-span-2">
          <div className="flex flex-col gap-4 mb-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <h2 className="text-xl font-bold text-slate-900">Fines Ledger</h2>

              <div className="flex flex-col sm:flex-row items-center gap-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                  <Input
                    placeholder="Search student, category or reason..."
                    className="pl-9 w-72 bg-slate-50 border-slate-200"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>

                <div className="flex items-center gap-2">
                  <Filter size={15} className="text-slate-400" />
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="h-10 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:outline-none"
                  >
                    {STATUS_OPTIONS.map((status) => (
                      <option key={status} value={status}>{status}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={() => applyQuickDatePreset('today')} className="border-slate-200 text-slate-700">
                Today
              </Button>
              <Button type="button" variant="outline" onClick={() => applyQuickDatePreset('week')} className="border-slate-200 text-slate-700">
                This Week
              </Button>
              <Button type="button" variant="outline" onClick={() => applyQuickDatePreset('month')} className="border-slate-200 text-slate-700">
                This Month
              </Button>
              <Button type="button" variant="outline" onClick={() => applyQuickDatePreset('all')} className="border-slate-200 text-slate-700">
                All Time
              </Button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 block">From Date</Label>
                <Input
                  type="date"
                  value={fromDateFilter}
                  onChange={(e) => setFromDateFilter(e.target.value)}
                  className="bg-slate-50 border-slate-200"
                />
              </div>

              <div>
                <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 block">To Date</Label>
                <Input
                  type="date"
                  value={toDateFilter}
                  onChange={(e) => setToDateFilter(e.target.value)}
                  className="bg-slate-50 border-slate-200"
                />
              </div>

              <div className="flex items-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={clearDateFilters}
                  className="w-full border-slate-200 text-slate-700"
                >
                  Clear Dates
                </Button>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            {loading ? (
              <div className="p-8 text-center text-slate-500">Loading fine records...</div>
            ) : filteredFines.length === 0 ? (
              <div className="p-12 text-center border-2 border-dashed border-slate-100 rounded-2xl bg-slate-50/50">
                <ShieldCheck size={48} className="mx-auto text-slate-300 mb-4" />
                <h3 className="text-lg font-bold text-slate-700">No Disciplinary Records</h3>
                <p className="text-sm text-slate-500 mt-1">The ledger is currently clean.</p>
              </div>
            ) : (
              filteredFines.map((fine, index) => (
                <div
                  key={index}
                  className="flex flex-col sm:flex-row sm:items-start justify-between p-5 rounded-2xl border border-slate-100 bg-white hover:border-[#5B7FED]/30 transition-all hover:shadow-md group"
                >
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-xl bg-slate-50 flex items-center justify-center font-bold text-slate-700 border border-slate-100 shrink-0">
                      {String(fine.student_name || fine.student_enrollment || 'ST').substring(0, 2).toUpperCase()}
                    </div>

                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-bold text-slate-900">{fine.student_name || 'Student'}</h4>
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-600">
                          {fine.student_enrollment}
                        </span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${getStatusChip(fine.status)}`}>
                          {fine.status}
                        </span>
                        {fine.category && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-600">
                            {fine.category}
                          </span>
                        )}
                        {isOverdue(fine) && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-rose-100 text-rose-700">
                            Overdue
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-4 mt-2 text-xs text-slate-500 font-medium">
                        {fine.course && (
                          <span className="flex items-center gap-1">
                            <GraduationCap size={12} />
                            {fine.course} • Year {fine.year || '-'}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <MapPin size={12} />
                          {fine.hostel_name || 'No hostel'} • Block {fine.block || '-'} • Room {fine.room_number || '-'} • Bed {fine.bed_number || '-'}
                        </span>
                      </div>

                      <p className="text-sm text-slate-600 mt-3">{fine.reason}</p>

                      {fine.status === 'Appealed' && fine.appeal_text && (
                        <div className="mt-3 p-3 rounded-lg bg-purple-50 border border-purple-100">
                          <p className="text-xs font-bold text-purple-800 uppercase tracking-widest mb-1">Student Appeal:</p>
                          <p className="text-sm text-purple-900/80 italic">"{fine.appeal_text}"</p>
                          <div className="flex items-center gap-2 mt-3">
                            <Button
                              size="sm"
                              onClick={() => handleResolveAppeal(fine._id, 'approve')}
                              className="h-8 bg-emerald-500 hover:bg-emerald-600 text-white text-xs"
                            >
                              <CheckCircle2 size={14} className="mr-1" /> Waive Fine
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => handleResolveAppeal(fine._id, 'reject')}
                              className="h-8 bg-rose-500 hover:bg-rose-600 text-white text-xs"
                            >
                              <XCircle size={14} className="mr-1" /> Enforce Fine
                            </Button>
                          </div>
                        </div>
                      )}

                      {fine.admin_remarks && (
                        <div className="mt-3 p-3 rounded-lg bg-slate-50 border border-slate-200">
                          <div className="flex items-center gap-2 mb-1">
                            <Receipt size={13} className="text-slate-500" />
                            <p className="text-xs font-bold text-slate-700 uppercase tracking-widest">Admin Remarks</p>
                          </div>
                          <p className="text-sm text-slate-700">{fine.admin_remarks}</p>
                        </div>
                      )}

                      {Number(fine.late_fee_amount || 0) > 0 && (
                        <div className="mt-3 p-3 rounded-lg bg-rose-50 border border-rose-100">
                          <div className="flex items-center gap-2">
                            <IndianRupee size={13} className="text-rose-500" />
                            <p className="text-sm font-semibold text-rose-700">
                              Late Fee Applied: ₹{fine.late_fee_amount}
                            </p>
                          </div>
                        </div>
                      )}

                      <div className="flex flex-wrap items-center gap-4 mt-3 opacity-80 text-[11px] font-bold uppercase tracking-widest text-slate-500">
                        <span>{new Date(fine.date || fine.created_at).toLocaleDateString()}</span>
                        {fine.due_date && (
                          <span className="flex items-center gap-1">
                            <CalendarDays size={12} />
                            Due: {new Date(fine.due_date).toLocaleDateString()}
                          </span>
                        )}
                        {fine.paid_at && <span className="text-emerald-600">Paid: {new Date(fine.paid_at).toLocaleDateString()}</span>}
                        {fine.status === 'Waived' && fine.resolved_at && (
                          <span className="text-blue-600">Waived: {new Date(fine.resolved_at).toLocaleDateString()}</span>
                        )}
                        {fine.proof_url && (
                          <a href={fine.proof_url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-[#5B7FED] hover:underline">
                            <FileText size={12} /> View Proof
                          </a>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="text-right mt-4 sm:mt-0 font-bold tabular-nums text-lg text-slate-900 shrink-0">
                    ₹{fine.amount}
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
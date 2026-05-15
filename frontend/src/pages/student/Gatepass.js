import React, { useEffect, useState, useRef, useMemo } from 'react';
import { Card } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Label } from '../../components/ui/label';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import api from '../../utils/api';
import { toast } from 'sonner';
import {
  FileText,
  Upload,
  X,
  MapPin,
  Phone,
  Clock,
  CheckCircle,
  Search,
  Filter,
  ArrowUpDown,
  AlertCircle,
  Download,
  BedDouble,
  Building2,
  CalendarClock,
  ShieldAlert,
  History,
  BadgeCheck,
  XCircle,
  TimerReset,
  RefreshCw
} from 'lucide-react';

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_FILE_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp'
];

export default function Gatepass() {
  const [gatepasses, setGatepasses] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [reason, setReason] = useState('');
  const [leaveFrom, setLeaveFrom] = useState('');
  const [leaveTo, setLeaveTo] = useState('');
  const [loading, setLoading] = useState(false);

  const [parentPhone, setParentPhone] = useState('');
  const [destination, setDestination] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const fileInputRef = useRef(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortOrder, setSortOrder] = useState('newest');

  useEffect(() => {
    loadGatepasses();
  }, []);

  const loadGatepasses = async () => {
    try {
      const response = await api.get('/gatepass');
      setGatepasses(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.error('Error loading gatepasses:', error);
      toast.error('Failed to load gatepasses');
    }
  };

  const stats = useMemo(() => {
    const total = gatepasses.length;
    const pending = gatepasses.filter((g) => g.status === 'pending').length;
    const approved = gatepasses.filter((g) => g.status === 'approved').length;
    const rejected = gatepasses.filter((g) => g.status === 'rejected').length;
    return { total, pending, approved, rejected };
  }, [gatepasses]);

  const processedGatepasses = useMemo(() => {
    return gatepasses
      .filter((pass) => {
        const q = searchQuery.toLowerCase();
        const matchesSearch =
          pass.destination?.toLowerCase().includes(q) ||
          pass.reason?.toLowerCase().includes(q) ||
          pass.hostel_name?.toLowerCase().includes(q) ||
          pass.room_number?.toString().toLowerCase().includes(q) ||
          pass.bed_number?.toString().toLowerCase().includes(q) ||
          pass.block?.toString().toLowerCase().includes(q);

        const matchesStatus = statusFilter === 'all' || pass.status === statusFilter;
        return matchesSearch && matchesStatus;
      })
      .sort((a, b) => {
        const dateA = new Date(a.applied_date || 0);
        const dateB = new Date(b.applied_date || 0);
        return sortOrder === 'newest' ? dateB - dateA : dateA - dateB;
      });
  }, [gatepasses, searchQuery, statusFilter, sortOrder]);

  const handleFileChange = (e) => {
    const file = e.target.files[0];

    if (!file) return;

    if (!ALLOWED_FILE_TYPES.includes(file.type)) {
      toast.error('Only PDF, JPG, JPEG, PNG, and WEBP files are allowed');
      e.target.value = '';
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      toast.error('File size exceeds 5MB');
      e.target.value = '';
      return;
    }

    setSelectedFile(file);
  };

  const resetForm = () => {
    setReason('');
    setLeaveFrom('');
    setLeaveTo('');
    setParentPhone('');
    setDestination('');
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!destination.trim()) return toast.error('Destination is required');
    if (!parentPhone.trim()) return toast.error('Parent/Guardian contact is required');
    if (!reason.trim()) return toast.error('Detailed reason is required');
    if (!leaveFrom) return toast.error('Leave time is required');
    if (!leaveTo) return toast.error('Expected return time is required');
    if (!selectedFile) return toast.error('Permission letter is mandatory');

    if (new Date(leaveTo) <= new Date(leaveFrom)) {
      return toast.error('Expected return must be after leave time');
    }

    setLoading(true);

    try {
      const formData = new FormData();
      formData.append('reason', reason);
      formData.append('leave_from', leaveFrom);
      formData.append('leave_to', leaveTo);
      formData.append('parent_phone', parentPhone);
      formData.append('destination', destination);
      formData.append('permission_letter', selectedFile);

      const response = await api.post('/gatepass', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      if (response.status === 200 || response.data.status === 'success') {
        toast.success('Gatepass applied successfully!');
        resetForm();
        setShowForm(false);
        loadGatepasses();
      }
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to apply for gatepass');
    } finally {
      setLoading(false);
    }
  };

  const formatDateTime = (value) => {
    if (!value) return 'N/A';
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? 'N/A' : d.toLocaleString();
  };

  const statusBadgeClass = (status) => {
    if (status === 'approved') return 'bg-emerald-100 text-emerald-700';
    if (status === 'rejected') return 'bg-red-100 text-red-700';
    return 'bg-amber-100 text-amber-700';
  };

  return (
    <div className="space-y-6 fade-in pb-10" data-testid="gatepass-page">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <FileText size={32} className="text-[#5B7FED]" />
          <div>
            <h1 className="text-3xl font-bold text-slate-900" style={{ fontFamily: 'Manrope, sans-serif' }}>
              Gatepass
            </h1>
            <p className="text-slate-500 text-sm mt-1">
              Apply for leave, view room and bed allocation, and track approval updates.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            onClick={loadGatepasses}
            className="border-slate-200"
          >
            <RefreshCw size={16} className="mr-2" />
            Refresh
          </Button>

          <Button
            onClick={() => setShowForm(!showForm)}
            className="bg-[#5B7FED] hover:bg-[#4A6FD6] text-white"
            data-testid="toggle-gatepass-form-btn"
          >
            {showForm ? 'View Gatepasses' : 'Apply Gatepass'}
          </Button>
        </div>
      </div>

      {!showForm && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <Card className="p-5 bg-white rounded-2xl shadow-sm border border-slate-100">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-black uppercase tracking-widest text-slate-400">Total Requests</p>
                <h3 className="text-2xl font-black text-slate-900 mt-1">{stats.total}</h3>
              </div>
              <History className="text-slate-300" size={22} />
            </div>
          </Card>

          <Card className="p-5 bg-white rounded-2xl shadow-sm border border-slate-100">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-black uppercase tracking-widest text-slate-400">Pending</p>
                <h3 className="text-2xl font-black text-amber-600 mt-1">{stats.pending}</h3>
              </div>
              <TimerReset className="text-amber-300" size={22} />
            </div>
          </Card>

          <Card className="p-5 bg-white rounded-2xl shadow-sm border border-slate-100">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-black uppercase tracking-widest text-slate-400">Approved</p>
                <h3 className="text-2xl font-black text-emerald-600 mt-1">{stats.approved}</h3>
              </div>
              <BadgeCheck className="text-emerald-300" size={22} />
            </div>
          </Card>

          <Card className="p-5 bg-white rounded-2xl shadow-sm border border-slate-100">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-black uppercase tracking-widest text-slate-400">Rejected</p>
                <h3 className="text-2xl font-black text-red-600 mt-1">{stats.rejected}</h3>
              </div>
              <XCircle className="text-red-300" size={22} />
            </div>
          </Card>
        </div>
      )}

      {!showForm && gatepasses.length > 0 && (
        <div className="flex flex-wrap items-center gap-4 bg-white p-4 rounded-xl shadow-sm border border-slate-100 animate-in fade-in duration-300">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <Input
              placeholder="Search destination, reason, room, bed..."
              className="pl-10 h-11 bg-slate-50 border-none focus:ring-2 focus:ring-[#5B7FED]"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-2">
            <Filter size={16} className="text-slate-400" />
            <select
              className="h-11 bg-slate-50 border-none rounded-md px-3 text-sm font-medium text-slate-600 focus:ring-2 focus:ring-[#5B7FED]"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">All Status</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>

          <Button
            variant="outline"
            onClick={() => setSortOrder(prev => prev === 'newest' ? 'oldest' : 'newest')}
            className="h-11 flex items-center gap-2 text-slate-600 border-slate-200"
          >
            <ArrowUpDown size={16} />
            {sortOrder === 'newest' ? 'Newest' : 'Oldest'}
          </Button>
        </div>
      )}

      {showForm ? (
        <Card className="p-6 bg-white rounded-xl shadow-sm max-w-3xl" data-testid="gatepass-form-card">
          <h2 className="text-xl font-semibold mb-4">Apply for Gatepass</h2>

          <div className="rounded-2xl bg-blue-50 border border-blue-100 px-4 py-4 mb-5">
            <div className="flex items-start gap-3">
              <ShieldAlert className="text-[#5B7FED] mt-0.5" size={18} />
              <div>
                <p className="text-sm font-black text-slate-800">Professional workflow enabled</p>
                <p className="text-xs text-slate-600 mt-1">
                  Your request will include room/bed details from your profile automatically, and you will receive a personal notification if status changes.
                </p>
              </div>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="destination">Destination Place <span className="text-red-500">*</span></Label>
                <div className="relative mt-1">
                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                  <Input
                    id="destination"
                    placeholder="E.g. Home, Delhi"
                    className="pl-10"
                    value={destination}
                    onChange={(e) => setDestination(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="parentPhone">Parent/Guardian Contact <span className="text-red-500">*</span></Label>
                <div className="relative mt-1">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                  <Input
                    id="parentPhone"
                    placeholder="+91 XXXXX XXXXX"
                    className="pl-10"
                    value={parentPhone}
                    onChange={(e) => setParentPhone(e.target.value)}
                    required
                  />
                </div>
              </div>
            </div>

            <div>
              <Label htmlFor="reason">Detailed Reason for Leave <span className="text-red-500">*</span></Label>
              <Textarea
                id="reason"
                placeholder="Enter reason..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="leave-from">Leave Time (From) <span className="text-red-500">*</span></Label>
                <Input
                  id="leave-from"
                  type="datetime-local"
                  value={leaveFrom}
                  onChange={(e) => setLeaveFrom(e.target.value)}
                  required
                />
              </div>

              <div>
                <Label htmlFor="leave-to">Expected Return (To) <span className="text-red-500">*</span></Label>
                <Input
                  id="leave-to"
                  type="datetime-local"
                  value={leaveTo}
                  onChange={(e) => setLeaveTo(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>
                Permission Letter (Signed by HOD/Dean) <span className="text-red-500">*</span>
              </Label>

              <div className="rounded-xl bg-amber-50 border border-amber-100 px-4 py-3">
                <p className="text-[11px] font-bold text-amber-700 uppercase tracking-wide">
                  Required document rules
                </p>
                <p className="text-xs text-amber-700 mt-1">Allowed file types: PDF, JPG, JPEG, PNG, WEBP</p>
                <p className="text-xs text-amber-700">Maximum file size: 5 MB</p>
              </div>

              <div
                className="border-2 border-dashed border-slate-200 rounded-xl p-4 hover:border-[#5B7FED] transition-colors cursor-pointer bg-slate-50"
                onClick={() => fileInputRef.current.click()}
              >
                <div className="flex flex-col items-center justify-center gap-2">
                  {selectedFile ? (
                    <div className="flex items-center gap-2 text-[#5B7FED] font-medium text-sm text-center">
                      <FileText size={20} />
                      {selectedFile.name}
                      <X
                        size={18}
                        className="text-red-500 ml-2 shrink-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedFile(null);
                          if (fileInputRef.current) fileInputRef.current.value = '';
                        }}
                      />
                    </div>
                  ) : (
                    <>
                      <Upload className="text-slate-400" size={24} />
                      <p className="text-xs text-slate-500 font-medium">
                        Upload signed permission letter
                      </p>
                    </>
                  )}
                </div>

                <input
                  type="file"
                  ref={fileInputRef}
                  className="hidden"
                  accept=".pdf,.jpg,.jpeg,.png,.webp"
                  onChange={handleFileChange}
                  required={!selectedFile}
                />
              </div>
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full bg-[#5B7FED] hover:bg-[#4A6FD6] text-white py-6 text-lg font-bold"
            >
              {loading ? 'Processing...' : 'Apply for Gatepass'}
            </Button>
          </form>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {processedGatepasses.length === 0 ? (
            <Card className="p-12 text-center bg-white rounded-xl shadow-sm">
              <AlertCircle size={40} className="mx-auto text-slate-200 mb-2" />
              <p className="text-slate-500">
                {searchQuery || statusFilter !== 'all' ? 'No matching gatepasses found' : 'No gatepasses applied yet'}
              </p>
            </Card>
          ) : (
            processedGatepasses.map((pass, index) => (
              <Card key={pass._id || index} className="p-6 bg-white rounded-xl shadow-sm border-l-4 border-[#5B7FED] hover:shadow-md transition-shadow">
                <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4 mb-4">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="px-2 py-0.5 bg-blue-50 text-[#5B7FED] text-[10px] font-bold rounded uppercase">
                        {pass.destination || 'N/A'}
                      </span>

                      <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${statusBadgeClass(pass.status)}`}>
                        {pass.status}
                      </span>

                      {pass.is_overdue && (
                        <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-red-100 text-red-700">
                          Overdue
                        </span>
                      )}
                    </div>

                    <p className="text-lg font-bold text-slate-900">{pass.reason}</p>
                  </div>

                  <div className="flex flex-col items-start lg:items-end gap-2">
                    {pass.status === 'approved' && pass.pdf_url && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 text-[#5B7FED] hover:text-[#4A6FD6] hover:bg-blue-50 flex items-center gap-1 font-bold text-xs"
                        onClick={() => window.open(`${process.env.REACT_APP_BACKEND_URL || 'http://127.0.0.1:8000'}${pass.pdf_url}`, '_blank')}
                      >
                        <Download size={14} /> Download PDF
                      </Button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-100">
                  <div>
                    <div className="flex items-center gap-1 mb-1">
                      <Clock size={12} className="text-slate-400" />
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">Planned Leave Time</p>
                    </div>
                    <p className="text-sm font-bold text-slate-700">
                      {formatDateTime(pass.leave_from)}
                    </p>
                  </div>

                  <div>
                    <div className="flex items-center gap-1 mb-1">
                      <CalendarClock size={12} className="text-slate-400" />
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">Expected Return</p>
                    </div>
                    <p className="text-sm font-bold text-slate-700">
                      {formatDateTime(pass.leave_to)}
                    </p>
                  </div>

                  <div>
                    <div className="flex items-center gap-1 mb-1">
                      <Building2 size={12} className="text-slate-400" />
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">Hostel / Room</p>
                    </div>
                    <p className="text-sm font-bold text-slate-700">
                      {pass.hostel_name || 'N/A'} / {pass.room_number || 'N/A'}
                    </p>
                  </div>

                  <div>
                    <div className="flex items-center gap-1 mb-1">
                      <BedDouble size={12} className="text-slate-400" />
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">Bed Number</p>
                    </div>
                    <p className="text-sm font-bold text-slate-700">
                      {pass.bed_number || 'N/A'}
                    </p>
                  </div>
                </div>

                {pass.status_note && (
                  <div className={`mt-4 rounded-xl border px-4 py-3 ${
                    pass.status === 'rejected'
                      ? 'bg-red-50 border-red-100'
                      : 'bg-blue-50 border-blue-100'
                  }`}>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                      Admin Note
                    </p>
                    <p className="text-sm font-medium text-slate-700 mt-1">{pass.status_note}</p>
                  </div>
                )}

                {pass.explanation_required && (
                  <div className="mt-4 rounded-xl border border-orange-100 bg-orange-50 px-4 py-3">
                    <p className="text-[10px] font-black uppercase tracking-widest text-orange-600">
                      Security Explanation Status
                    </p>
                    <p className="text-sm font-medium text-orange-700 mt-1">
                      {pass.explanation_status === 'submitted'
                        ? 'Explanation submitted and awaiting review.'
                        : 'Explanation required due to overdue return.'}
                    </p>
                  </div>
                )}

                <div className="mt-4 pt-4 border-t border-slate-100 flex flex-wrap justify-between items-center gap-4">
                  <div className="flex flex-wrap items-center gap-4">
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase">Applied On</p>
                      <p className="text-xs font-medium text-slate-600">
                        {formatDateTime(pass.applied_date)}
                      </p>
                    </div>

                    {pass.letter_url && (
                      <a
                        href={`${process.env.REACT_APP_BACKEND_URL || 'http://127.0.0.1:8000'}${pass.letter_url}`}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1 text-[10px] font-bold text-[#5B7FED] hover:underline"
                      >
                        <FileText size={12} /> View Document
                      </a>
                    )}
                  </div>

                  {pass.approval_date && (
                    <div className="text-right flex items-center gap-2">
                      <div className="h-8 w-[1px] bg-slate-100 mx-2 hidden md:block"></div>
                      <div>
                        <div className="flex items-center justify-end gap-1">
                          <CheckCircle size={10} className="text-emerald-500" />
                          <p className="text-[10px] font-black text-emerald-500 uppercase">Decision Time</p>
                        </div>
                        <p className="text-xs font-bold text-slate-600">
                          {formatDateTime(pass.approval_date)}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </Card>
            ))
          )}
        </div>
      )}
    </div>
  );
}
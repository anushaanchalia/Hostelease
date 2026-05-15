import React, { useEffect, useMemo, useState } from 'react';
import { Card } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import api from '../../utils/api';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  CheckCircle,
  Clock,
  Loader2,
  Search,
  MapPin,
  User,
  Download,
  Filter,
  Eye,
  FileText,
  XCircle,
  ArrowUpDown,
  Wrench,
  ShieldAlert,
  CircleDot,
  ClipboardList,
  UserRound,
  MessageSquareMore,
  History
} from 'lucide-react';

const hostels = [
  'ALL BHAWANS',
  'Azad Bhawan',
  'Atal Bhawan',
  'Tagore Bhawan',
  'Shakuntala Bhawan',
  'Janaki Bhawan',
  'Teresa Bhawan'
];

const categories = ['ALL CATEGORIES', 'electricity', 'washroom', 'cleaning', 'other'];
const statuses = ['ALL STATUS', 'pending', 'in_progress', 'resolved', 'rejected'];
const priorities = ['ALL PRIORITY', 'low', 'medium', 'high', 'urgent'];

const normalizeHostel = (name = '') => {
  const cleaned = String(name).trim();
  if (!cleaned) return 'N/A';
  if (cleaned.toLowerCase() === 'shakunthala bhawan') return 'Shakuntala Bhawan';
  return cleaned;
};

const normalizeForCompare = (value = '') =>
  String(value)
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace('shakunthala', 'shakuntala')
    .trim();

const getStatusBadgeClass = (status) => {
  switch ((status || '').toLowerCase()) {
    case 'resolved':
      return 'bg-emerald-50 text-emerald-600 border-emerald-100';
    case 'in_progress':
      return 'bg-blue-50 text-blue-600 border-blue-100';
    case 'rejected':
      return 'bg-red-50 text-red-600 border-red-100';
    default:
      return 'bg-orange-50 text-orange-500 border-orange-100';
  }
};

const getPriorityBadgeClass = (priority) => {
  switch ((priority || '').toLowerCase()) {
    case 'urgent':
      return 'bg-red-50 text-red-600 border-red-100';
    case 'high':
      return 'bg-orange-50 text-orange-600 border-orange-100';
    case 'medium':
      return 'bg-amber-50 text-amber-600 border-amber-100';
    default:
      return 'bg-slate-100 text-slate-600 border-slate-200';
  }
};

const getStatusIcon = (status) => {
  switch ((status || '').toLowerCase()) {
    case 'resolved':
      return <CheckCircle size={11} />;
    case 'rejected':
      return <XCircle size={11} />;
    case 'in_progress':
      return <Wrench size={11} />;
    default:
      return <Clock size={11} />;
  }
};

const backendUrl = process.env.REACT_APP_BACKEND_URL || 'http://127.0.0.1:8000';

export default function ComplaintManagement() {
  const [complaints, setComplaints] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('ALL BHAWANS');
  const [activeCategory, setActiveCategory] = useState('ALL CATEGORIES');
  const [activeStatus, setActiveStatus] = useState('ALL STATUS');
  const [activePriority, setActivePriority] = useState('ALL PRIORITY');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortOrder, setSortOrder] = useState('latest');
  const [previewImage, setPreviewImage] = useState(null);
  const [exporting, setExporting] = useState(false);

  const [stats, setStats] = useState({
    total: 0,
    active: 0,
    resolved: 0,
    rejected: 0,
    pending: 0,
    in_progress: 0,
    low: 0,
    medium: 0,
    high: 0,
    urgent: 0,
    electricity: 0,
    washroom: 0,
    cleaning: 0,
    other: 0
  });

  const navigate = useNavigate();

  useEffect(() => {
    const user = JSON.parse(localStorage.getItem('user'));
    if (!user || user.role !== 'admin') {
      navigate('/login');
      return;
    }
    loadComplaints();
  }, [navigate]);

  useEffect(() => {
    loadComplaintStats({
      hostel: activeTab,
      category: activeCategory,
      status: activeStatus,
      priority: activePriority
    });
  }, [activeTab, activeCategory, activeStatus, activePriority]);

  const loadComplaints = async () => {
    try {
      setLoading(true);
      const response = await api.get('/complaints');
      const normalized = Array.isArray(response.data)
        ? response.data.map((item) => ({
            ...item,
            hostel_name: normalizeHostel(item.hostel_name || item.hostel),
            status: (item.status || 'pending').toLowerCase(),
            priority: (item.priority || 'medium').toLowerCase(),
            status_history: item.status_history || []
          }))
        : [];
      setComplaints(normalized);
    } catch (error) {
      console.error('Error loading complaints:', error);
      toast.error('Failed to load complaints');
    } finally {
      setLoading(false);
    }
  };

  const loadComplaintStats = async ({
    hostel = activeTab,
    category = activeCategory,
    status = activeStatus,
    priority = activePriority
  } = {}) => {
    try {
      const params = new URLSearchParams();
      params.append('hostel', hostel === 'ALL BHAWANS' ? 'all' : normalizeHostel(hostel));
      params.append('category', category === 'ALL CATEGORIES' ? 'all' : category);
      params.append('status', status === 'ALL STATUS' ? 'all' : status);
      params.append('priority', priority === 'ALL PRIORITY' ? 'all' : priority);

      const response = await api.get(`/admin/complaints/stats?${params.toString()}`);
      setStats(response.data || {});
    } catch (error) {
      console.error('Error loading complaint stats:', error);
      toast.error('Failed to load complaint stats');
    }
  };

  const updateStatus = async (complaintId, newStatus) => {
    try {
      await api.patch(`/complaints/${complaintId}`, { status: newStatus });
      toast.success(`Complaint status changed to ${newStatus.toUpperCase()}`);
      await loadComplaints();
      await loadComplaintStats();
    } catch (error) {
      console.error('Status Update Error:', error);
      toast.error(error.response?.data?.detail || 'Update failed');
    }
  };

  const filteredData = useMemo(() => {
    let data = [...complaints];

    data = data.filter((item) => {
      const enr = String(item.enrollment_number || item.student_id || '');
      const studentName = String(item.student_name || '').toLowerCase();
      const desc = String(item.description || '').toLowerCase();
      const code = String(item.complaint_code || '').toLowerCase();
      const q = searchTerm.toLowerCase().trim();

      const matchesSearch =
        !q ||
        studentName.includes(q) ||
        enr.includes(q) ||
        desc.includes(q) ||
        code.includes(q);

      const itemHostel = normalizeForCompare(item.hostel_name || item.hostel || '');
      const selectedHostel = normalizeForCompare(activeTab);

      const matchesHostel =
        activeTab === 'ALL BHAWANS' || itemHostel === selectedHostel;

      const matchesCategory =
        activeCategory === 'ALL CATEGORIES' ||
        String(item.category || '').toLowerCase() === activeCategory.toLowerCase();

      const matchesStatus =
        activeStatus === 'ALL STATUS' ||
        String(item.status || '').toLowerCase() === activeStatus.toLowerCase();

      const matchesPriority =
        activePriority === 'ALL PRIORITY' ||
        String(item.priority || '').toLowerCase() === activePriority.toLowerCase();

      return matchesSearch && matchesHostel && matchesCategory && matchesStatus && matchesPriority;
    });

    data.sort((a, b) => {
      const aTime = new Date(a.date || a.created_at || 0).getTime();
      const bTime = new Date(b.date || b.created_at || 0).getTime();
      return sortOrder === 'latest' ? bTime - aTime : aTime - bTime;
    });

    return data;
  }, [complaints, searchTerm, activeTab, activeCategory, activeStatus, activePriority, sortOrder]);

  const exportComplaints = async (format) => {
    try {
      setExporting(true);

      const params = new URLSearchParams();
      params.append('format', format);
      params.append('hostel', activeTab === 'ALL BHAWANS' ? 'all' : normalizeHostel(activeTab));
      params.append('category', activeCategory === 'ALL CATEGORIES' ? 'all' : activeCategory);
      params.append('status', activeStatus === 'ALL STATUS' ? 'all' : activeStatus);

      const res = await api.get(`/admin/complaints/export?${params.toString()}`);
      const fileUrl = res.data?.file_url || res.data?.pdf_url;

      if (fileUrl) {
        window.open(`${backendUrl}${fileUrl}`, '_blank');
        toast.success(`${format.toUpperCase()} report generated`);
      } else {
        toast.error('Export failed');
      }
    } catch (error) {
      console.error(error);
      toast.error('Failed to export complaint report');
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px]">
        <Loader2 className="animate-spin text-[#5B7FED] mb-4" size={40} />
        <p className="text-slate-400 font-black uppercase tracking-widest text-[10px]">
          Syncing Database...
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 fade-in pb-12 w-full px-6 lg:px-8">
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-red-50 flex items-center justify-center text-red-500 border border-red-100 shadow-sm">
            <AlertTriangle size={26} />
          </div>
          <div>
            <h1 className="text-3xl font-black text-slate-900 tracking-tight leading-none">
              Complaint Management
            </h1>
            <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mt-2">
              Track and resolve issues raised by residents
            </p>
          </div>
        </div>

        <div className="flex gap-3 flex-wrap">
          <div className="bg-white border-2 border-slate-100 rounded-2xl px-6 py-2 text-center shadow-sm min-w-[120px]">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">Total</p>
            <p className="text-xl font-black text-slate-900">{stats.total}</p>
          </div>
          <div className="bg-white border-2 border-red-100 rounded-2xl px-6 py-2 text-center shadow-sm min-w-[120px]">
            <p className="text-[10px] font-black text-red-400 uppercase tracking-tighter">Active</p>
            <p className="text-xl font-black text-slate-900">{stats.active}</p>
          </div>
          <div className="bg-white border-2 border-emerald-100 rounded-2xl px-6 py-2 text-center shadow-sm min-w-[120px]">
            <p className="text-[10px] font-black text-emerald-400 uppercase tracking-tighter">Resolved</p>
            <p className="text-xl font-black text-slate-900">{stats.resolved}</p>
          </div>
          <div className="bg-white border-2 border-yellow-100 rounded-2xl px-6 py-2 text-center shadow-sm min-w-[120px]">
            <p className="text-[10px] font-black text-yellow-500 uppercase tracking-tighter">Electricity</p>
            <p className="text-xl font-black text-slate-900">{stats.electricity}</p>
          </div>
          <div className="bg-white border-2 border-cyan-100 rounded-2xl px-6 py-2 text-center shadow-sm min-w-[120px]">
            <p className="text-[10px] font-black text-cyan-500 uppercase tracking-tighter">Washroom</p>
            <p className="text-xl font-black text-slate-900">{stats.washroom}</p>
          </div>
          <div className="bg-white border-2 border-violet-100 rounded-2xl px-6 py-2 text-center shadow-sm min-w-[120px]">
            <p className="text-[10px] font-black text-violet-500 uppercase tracking-tighter">Cleaning</p>
            <p className="text-xl font-black text-slate-900">{stats.cleaning}</p>
          </div>
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-white p-4 rounded-[2rem] shadow-sm border border-slate-100">
        <div className="relative group flex-1 max-w-xl">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-[#5B7FED]" size={18} />
          <input
            type="text"
            placeholder="Search by complaint code, student name, enrollment or description..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-12 pr-4 py-3 bg-slate-50 border-none rounded-2xl text-sm font-bold w-full outline-none focus:ring-2 focus:ring-blue-100 transition-all"
          />
        </div>

        <div className="flex gap-3 flex-wrap">
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <select
              value={activeCategory}
              onChange={(e) => setActiveCategory(e.target.value)}
              className="pl-9 pr-8 py-3 bg-slate-50 border-none rounded-xl text-[11px] font-black uppercase text-slate-600 outline-none cursor-pointer appearance-none shadow-sm hover:bg-slate-100"
            >
              {categories.map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          <div className="relative">
            <ShieldAlert className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <select
              value={activePriority}
              onChange={(e) => setActivePriority(e.target.value)}
              className="pl-9 pr-8 py-3 bg-slate-50 border-none rounded-xl text-[11px] font-black uppercase text-slate-600 outline-none cursor-pointer appearance-none shadow-sm hover:bg-slate-100"
            >
              {priorities.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </div>

          <div className="relative">
            <CircleDot className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <select
              value={activeStatus}
              onChange={(e) => setActiveStatus(e.target.value)}
              className="pl-9 pr-8 py-3 bg-slate-50 border-none rounded-xl text-[11px] font-black uppercase text-slate-600 outline-none cursor-pointer appearance-none shadow-sm hover:bg-slate-100"
            >
              {statuses.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </div>

          <button
            onClick={() => setSortOrder((prev) => (prev === 'latest' ? 'oldest' : 'latest'))}
            className="inline-flex items-center gap-2 px-4 py-3 bg-slate-50 rounded-xl text-[11px] font-black uppercase text-slate-600 shadow-sm hover:bg-slate-100"
          >
            <ArrowUpDown size={14} />
            {sortOrder === 'latest' ? 'Latest First' : 'Oldest First'}
          </button>

          <Button
            onClick={() => exportComplaints('pdf')}
            disabled={exporting}
            className="bg-[#10B981] hover:bg-emerald-600 text-white rounded-2xl h-12 px-6 font-bold gap-2"
          >
            <Download size={18} /> Export PDF
          </Button>

          <Button
            onClick={() => exportComplaints('csv')}
            disabled={exporting}
            className="bg-slate-900 hover:bg-slate-800 text-white rounded-2xl h-12 px-6 font-bold gap-2"
          >
            <FileText size={18} /> Export CSV
          </Button>
        </div>
      </div>

      <div className="flex bg-slate-100/50 p-1.5 rounded-2xl w-fit border border-slate-200/50 overflow-x-auto max-w-full no-scrollbar shadow-inner">
        {hostels.map((hostel) => (
          <button
            key={hostel}
            onClick={() => setActiveTab(hostel)}
            className={`px-6 py-2.5 rounded-xl text-[10px] font-black transition-all uppercase tracking-widest whitespace-nowrap ${
              activeTab === hostel
                ? 'bg-white text-[#5B7FED] shadow-md border border-slate-100'
                : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            {hostel}
          </button>
        ))}
      </div>

      <div className="space-y-5">
        {filteredData.length > 0 ? (
          filteredData.map((item) => (
            <Card
              key={item._id}
              className="overflow-hidden border-none shadow-xl shadow-slate-200/40 rounded-[2rem] bg-white"
            >
              <div className="p-6 border-b border-slate-100">
                <div className="flex flex-col xl:flex-row xl:items-start justify-between gap-5">
                  <div className="flex items-start gap-4 flex-1">
                    <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center text-[#5B7FED] border border-blue-100 shadow-sm shrink-0">
                      <User size={20} />
                    </div>

                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <span className="inline-flex items-center gap-2 px-3 py-1 rounded-xl text-[10px] font-black uppercase bg-indigo-50 text-indigo-700 border border-indigo-100">
                          <ClipboardList size={12} />
                          {item.complaint_code || 'N/A'}
                        </span>

                        <span className="bg-slate-100 text-slate-600 px-3 py-1 rounded-xl text-[10px] font-black uppercase border border-slate-200">
                          {item.category || 'other'}
                        </span>

                        <span className={`px-3 py-1 rounded-xl text-[10px] font-black uppercase border ${getPriorityBadgeClass(item.priority)}`}>
                          {item.priority || 'medium'}
                        </span>

                        <span className={`px-3 py-1 rounded-xl text-[10px] font-black uppercase tracking-widest inline-flex items-center gap-2 border ${getStatusBadgeClass(item.status)}`}>
                          {getStatusIcon(item.status)}
                          {String(item.status || 'pending').replace('_', ' ')}
                        </span>
                      </div>

                      <div className="font-black text-slate-900 text-[16px] capitalize leading-tight mb-1">
                        {item.student_name || 'N/A'}
                      </div>

                      <div className="text-[11px] font-black text-[#5B7FED] uppercase tracking-tighter font-mono">
                        {item.enrollment_number || item.student_id || 'N/A'}
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-slate-500 font-black uppercase tracking-tighter mt-2">
                        <MapPin size={10} className="shrink-0" />
                        <span>{normalizeHostel(item.hostel_name || item.hostel || 'N/A')}</span>
                        <span className="text-slate-200 mx-1">|</span>
                        <span>BLOCK: {item.block || 'N/A'}</span>
                        <span className="text-slate-200 mx-1">|</span>
                        <span>ROOM: {item.room_number || 'N/A'}</span>
                        {item.bed_number && (
                          <>
                            <span className="text-slate-200 mx-1">|</span>
                            <span>BED: {item.bed_number}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="w-full xl:w-auto">
                    <select
                      value={item.status}
                      onChange={(e) => updateStatus(item._id, e.target.value)}
                      className="bg-white border-2 border-slate-100 rounded-xl px-4 py-3 text-[10px] font-black text-slate-700 outline-none focus:ring-4 focus:ring-blue-50 transition-all cursor-pointer shadow-sm w-full xl:w-auto"
                    >
                      <option value="pending">PENDING</option>
                      <option value="in_progress">IN PROGRESS</option>
                      <option value="resolved">RESOLVED</option>
                      <option value="rejected">REJECTED</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-12 gap-0">
                <div className="xl:col-span-5 p-6 border-b xl:border-b-0 xl:border-r border-slate-100">
                  <p className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-3">
                    Complaint Description
                  </p>
                  <p className="text-[14px] font-semibold text-slate-700 leading-relaxed italic">
                    "{item.description || 'N/A'}"
                  </p>

                  <div className="mt-4 space-y-2">
                    <div className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter">
                      Submitted: {item.date ? new Date(item.date).toLocaleString() : 'N/A'}
                    </div>

                    {item.resolved_at && (
                      <div className="text-[10px] text-emerald-500 font-bold uppercase tracking-tighter">
                        Resolved: {new Date(item.resolved_at).toLocaleString()}
                      </div>
                    )}

                    {item.resolved_by && (
                      <div className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter">
                        By: {item.resolved_by}
                      </div>
                    )}

                    {item.assigned_to && (
                      <div className="flex items-center gap-2 text-[11px] text-blue-700 font-bold mt-3">
                        <UserRound size={13} />
                        Assigned To: {item.assigned_to}
                      </div>
                    )}
                  </div>
                </div>

                <div className="xl:col-span-4 p-6 border-b xl:border-b-0 xl:border-r border-slate-100">
                  <p className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-3">
                    Notes & History
                  </p>

                  {item.admin_note && (
                    <div className="mb-3 rounded-xl border border-orange-200 bg-orange-50 p-3">
                      <div className="flex items-center gap-2 text-[11px] font-black text-orange-700 uppercase mb-1">
                        <MessageSquareMore size={13} />
                        Admin Note
                      </div>
                      <p className="text-[12px] text-orange-700 font-medium">{item.admin_note}</p>
                    </div>
                  )}

                  {item.resolution_note && (
                    <div className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                      <div className="flex items-center gap-2 text-[11px] font-black text-emerald-700 uppercase mb-1">
                        <CheckCircle size={13} />
                        Resolution Note
                      </div>
                      <p className="text-[12px] text-emerald-700 font-medium">{item.resolution_note}</p>
                    </div>
                  )}

                  {item.reopen_reason && (
                    <div className="mb-3 rounded-xl border border-red-200 bg-red-50 p-3">
                      <div className="flex items-center gap-2 text-[11px] font-black text-red-700 uppercase mb-1">
                        <AlertTriangle size={13} />
                        Reopen Reason
                      </div>
                      <p className="text-[12px] text-red-700 font-medium">{item.reopen_reason}</p>
                    </div>
                  )}

                  {item.status_history?.length > 0 ? (
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <div className="flex items-center gap-2 text-[11px] font-black text-slate-700 uppercase mb-2">
                        <History size={13} />
                        Status History
                      </div>
                      <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
                        {item.status_history.slice().reverse().map((entry, idx) => (
                          <div key={idx} className="text-[12px] text-slate-600 border-b border-slate-200 pb-2 last:border-b-0 last:pb-0">
                            <div className="font-bold capitalize">
                              {String(entry.status || '').replace('_', ' ')}
                            </div>
                            <div className="text-[11px] text-slate-500">
                              {entry.changed_at ? new Date(entry.changed_at).toLocaleString() : 'N/A'}
                            </div>
                            {entry.note ? (
                              <div className="text-[11px] text-slate-500 mt-1">{entry.note}</div>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-[12px] text-slate-500">
                      No status history available
                    </div>
                  )}
                </div>

                <div className="xl:col-span-3 p-6">
                  <p className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-3">
                    Evidence & Record
                  </p>

                  <div className="flex flex-col gap-3">
                    {item.image_url ? (
                      <button
                        onClick={() => setPreviewImage(`${backendUrl}${item.image_url}`)}
                        className="inline-flex items-center justify-center gap-2 text-[11px] font-black uppercase text-[#5B7FED] hover:underline bg-blue-50 px-4 py-3 rounded-xl border border-blue-100 shadow-sm"
                      >
                        <Eye size={13} />
                        Preview Image
                      </button>
                    ) : (
                      <div className="text-[11px] font-black text-slate-300 uppercase italic bg-slate-50 px-4 py-3 rounded-xl border border-slate-100 text-center">
                        No Image
                      </div>
                    )}

                    {item.pdf_url ? (
                      <button
                        onClick={() => window.open(`${backendUrl}${item.pdf_url}`, '_blank')}
                        className="inline-flex items-center justify-center gap-2 text-[11px] font-black uppercase text-slate-700 hover:underline bg-slate-100 px-4 py-3 rounded-xl border border-slate-200 shadow-sm"
                      >
                        <FileText size={13} />
                        View Record
                      </button>
                    ) : (
                      <div className="text-[11px] font-black text-slate-300 uppercase italic bg-slate-50 px-4 py-3 rounded-xl border border-slate-100 text-center">
                        No PDF
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          ))
        ) : (
          <Card className="border-none shadow-xl shadow-slate-200/40 rounded-[2rem] bg-white">
            <div className="py-28 text-center">
              <div className="flex flex-col items-center justify-center opacity-30">
                <Filter size={64} className="text-slate-400 mb-4" />
                <p className="text-lg font-black uppercase tracking-widest text-slate-500">
                  No records found
                </p>
              </div>
            </div>
          </Card>
        )}
      </div>

      {previewImage && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-4">
          <div className="relative max-w-4xl w-full">
            <button
              onClick={() => setPreviewImage(null)}
              className="absolute -top-4 -right-4 bg-white text-slate-700 rounded-full p-2 shadow-lg"
            >
              <XCircle size={22} />
            </button>
            <div className="bg-white rounded-[2rem] p-4 shadow-2xl">
              <img
                src={previewImage}
                alt="Complaint proof"
                className="w-full max-h-[80vh] object-contain rounded-[1.5rem]"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
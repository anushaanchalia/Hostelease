import React, { useState, useEffect, useMemo } from 'react';
import { Card } from '../../components/ui/card';
import {
  FileCheck,
  Clock,
  Loader2,
  User,
  History as HistoryIcon,
  Filter,
  MapPin,
  AlertTriangle,
  Send,
  Download,
  Search,
  BedDouble,
  Building2,
  CheckCircle2,
  XCircle,
  TimerReset,
  ShieldCheck,
  MessageSquare,
  RefreshCw
} from 'lucide-react';
import api from '../../utils/api';
import { toast } from 'sonner';

export default function GatepassApprovals() {
  const [gatepasses, setGatepasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('pending');
  const [searchTerm, setSearchTerm] = useState('');
  const [hostelFilter, setHostelFilter] = useState('all');
  const [statusNoteMap, setStatusNoteMap] = useState({});
  const [actionLoadingId, setActionLoadingId] = useState(null);

  useEffect(() => {
    fetchGatepasses();
  }, []);

  const fetchGatepasses = async () => {
    try {
      setLoading(true);
      const res = await api.get('/admin/gatepasses/all');
      setGatepasses(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      toast.error("Failed to load gatepass data");
    } finally {
      setLoading(false);
    }
  };

  const hostelOptions = [
    'all',
    'Azad Bhawan',
    'Atal Bhawan',
    'Tagore Bhawan',
    'Shakuntala Bhawan',
    'Janaki Bhawan',
    'Teresa Bhawan'
  ];

  const setStatusNote = (id, value) => {
    setStatusNoteMap((prev) => ({ ...prev, [id]: value }));
  };

  const updateStatus = async (id, newStatus) => {
    try {
      setActionLoadingId(id);
      await api.put(`/admin/gatepass-action/${id}`, {
        status: newStatus,
        note: statusNoteMap[id] || ''
      });
      toast.success(`Request ${newStatus.toUpperCase()}`);
      fetchGatepasses();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Action failed");
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleSendAlert = async (pass) => {
    const confirmed = window.confirm(`Notify ${pass.student_name} and mark this gatepass as overdue?`);
    if (!confirmed) return;

    try {
      toast.loading("Dispatching security alerts...");
      await api.post(`/admin/gatepass/send-overdue-alert/${pass._id}`);
      toast.dismiss();
      toast.success(`Overdue alert sent to ${pass.student_name}.`);
      fetchGatepasses();
    } catch (err) {
      toast.dismiss();
      toast.error(err?.response?.data?.detail || "Failed to send alert. Check backend logs.");
    }
  };

  const exportToPDF = async () => {
    try {
      toast.loading("Generating Security Report PDF...");
      const res = await api.get('/admin/gatepass-report');
      toast.dismiss();

      if (res.data?.pdf_url) {
        window.open(`${process.env.REACT_APP_BACKEND_URL || 'http://127.0.0.1:8000'}${res.data.pdf_url}`, '_blank');
        toast.success("PDF generated successfully");
      } else {
        toast.error("PDF generation failed");
      }
    } catch (err) {
      toast.dismiss();
      toast.error("Failed to export PDF");
    }
  };

  const filteredData = useMemo(() => {
    return gatepasses.filter((pass) => {
      const statusMatch = activeTab === 'pending' ? pass.status === 'pending' : pass.status !== 'pending';

      const q = searchTerm.toLowerCase();
      const searchMatch =
        pass.student_name?.toLowerCase().includes(q) ||
        pass.enrollment_number?.toString().includes(searchTerm) ||
        pass.destination?.toLowerCase().includes(q) ||
        pass.reason?.toLowerCase().includes(q) ||
        pass.room_number?.toString().toLowerCase().includes(q) ||
        pass.bed_number?.toString().toLowerCase().includes(q) ||
        pass.block?.toString().toLowerCase().includes(q);

      const normalizedHostel = (pass.hostel_name || '').replace('Shakunthala Bhawan', 'Shakuntala Bhawan');
      const hostelMatch = hostelFilter === 'all' || normalizedHostel === hostelFilter;

      return statusMatch && searchMatch && hostelMatch;
    });
  }, [gatepasses, activeTab, searchTerm, hostelFilter]);

  const stats = useMemo(() => {
    const total = gatepasses.length;
    const pending = gatepasses.filter((g) => g.status === 'pending').length;
    const approved = gatepasses.filter((g) => g.status === 'approved').length;
    const rejected = gatepasses.filter((g) => g.status === 'rejected').length;
    const overdue = gatepasses.filter((g) => g.is_overdue).length;
    return { total, pending, approved, rejected, overdue };
  }, [gatepasses]);

  const formatDateTime = (value) => {
    if (!value) return 'N/A';
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? 'N/A' : d.toLocaleString();
  };

  if (loading) return (
    <div className="flex flex-col items-center justify-center min-h-[400px]">
      <Loader2 className="animate-spin text-[#5B7FED] mb-4" size={40} />
      <p className="text-slate-400 font-bold uppercase tracking-[0.3em] text-[10px]">Updating Security Logs</p>
    </div>
  );

  return (
    <div className="space-y-8 fade-in pb-20">
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-12 h-12 rounded-2xl bg-slate-900 flex items-center justify-center text-white shadow-xl">
              <FileCheck size={28} />
            </div>
            <h1 className="text-3xl font-black text-slate-900 tracking-tight">Gatepass Approval Portal</h1>
          </div>
          <p className="text-slate-500 text-sm font-medium ml-1">
            Monitor requests, room/bed allocation, status actions, and overdue returns.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <button
            onClick={fetchGatepasses}
            className="flex items-center gap-2 bg-white border border-slate-200 px-4 py-2.5 rounded-xl text-[11px] font-black text-slate-700 hover:bg-slate-50 transition-all"
          >
            <RefreshCw size={14} /> Refresh
          </button>

          <div className="relative group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="text"
              placeholder="Search student, ID, room, bed, destination..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-11 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold w-72 outline-none transition-all"
            />
          </div>

          <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2.5">
            <Filter size={14} className="text-slate-400" />
            <select
              value={hostelFilter}
              onChange={(e) => setHostelFilter(e.target.value)}
              className="bg-transparent text-[11px] font-black text-slate-700 outline-none"
            >
              {hostelOptions.map((hostel) => (
                <option key={hostel} value={hostel}>
                  {hostel === 'all' ? 'All Hostels' : hostel}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={exportToPDF}
            className="flex items-center gap-2 bg-[#EF4444] text-white px-5 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-red-100 hover:bg-red-600 transition-all"
          >
            <Download size={14} /> Export PDF
          </button>

          <div className="flex bg-slate-100 p-1.5 rounded-2xl border border-slate-200/50">
            <button
              onClick={() => setActiveTab('pending')}
              className={`flex items-center gap-2 px-6 py-2 rounded-xl text-[10px] font-black transition-all ${activeTab === 'pending' ? 'bg-white text-orange-500 shadow-sm' : 'text-slate-400'}`}
            >
              <Clock size={14} /> PENDING
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`flex items-center gap-2 px-6 py-2 rounded-xl text-[10px] font-black transition-all ${activeTab === 'history' ? 'bg-white text-[#5B7FED] shadow-sm' : 'text-slate-400'}`}
            >
              <HistoryIcon size={14} /> HISTORY
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
        <Card className="p-5 rounded-3xl border-none shadow-lg bg-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] font-black uppercase tracking-widest text-slate-400">Total</p>
              <h3 className="text-2xl font-black text-slate-900 mt-1">{stats.total}</h3>
            </div>
            <ShieldCheck className="text-slate-300" size={24} />
          </div>
        </Card>

        <Card className="p-5 rounded-3xl border-none shadow-lg bg-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] font-black uppercase tracking-widest text-slate-400">Pending</p>
              <h3 className="text-2xl font-black text-amber-600 mt-1">{stats.pending}</h3>
            </div>
            <TimerReset className="text-amber-300" size={24} />
          </div>
        </Card>

        <Card className="p-5 rounded-3xl border-none shadow-lg bg-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] font-black uppercase tracking-widest text-slate-400">Approved</p>
              <h3 className="text-2xl font-black text-emerald-600 mt-1">{stats.approved}</h3>
            </div>
            <CheckCircle2 className="text-emerald-300" size={24} />
          </div>
        </Card>

        <Card className="p-5 rounded-3xl border-none shadow-lg bg-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] font-black uppercase tracking-widest text-slate-400">Rejected</p>
              <h3 className="text-2xl font-black text-red-600 mt-1">{stats.rejected}</h3>
            </div>
            <XCircle className="text-red-300" size={24} />
          </div>
        </Card>

        <Card className="p-5 rounded-3xl border-none shadow-lg bg-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] font-black uppercase tracking-widest text-slate-400">Overdue</p>
              <h3 className="text-2xl font-black text-orange-600 mt-1">{stats.overdue}</h3>
            </div>
            <AlertTriangle className="text-orange-300" size={24} />
          </div>
        </Card>
      </div>

      <Card className="overflow-hidden border-none shadow-2xl shadow-slate-200/50 rounded-[2.5rem] bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[1300px]">
            <thead>
              <tr className="bg-slate-900 text-white">
                <th className="px-8 py-6 text-[10px] font-black uppercase tracking-widest">Student Detail</th>
                <th className="px-6 py-6 text-[10px] font-black uppercase tracking-widest">Hostel / Room / Bed</th>
                <th className="px-6 py-6 text-[10px] font-black uppercase tracking-widest">Place / Reason</th>
                <th className="px-6 py-6 text-[10px] font-black uppercase tracking-widest">Dates</th>
                <th className="px-6 py-6 text-[10px] font-black uppercase tracking-widest">Decision Note</th>
                <th className="px-6 py-6 text-[10px] font-black uppercase tracking-widest text-center">Status</th>
                <th className="px-8 py-6 text-[10px] font-black uppercase tracking-widest text-center">Action</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-50">
              {filteredData.length > 0 ? filteredData.map((item) => (
                <tr key={item._id} className="hover:bg-slate-50/30 transition-colors group align-top">
                  <td className="px-8 py-6">
                    <div className="flex items-start gap-4">
                      <div className="w-11 h-11 rounded-2xl bg-blue-50 flex items-center justify-center text-[#5B7FED] border border-blue-100 shrink-0">
                        <User size={20} />
                      </div>
                      <div>
                        <div className="font-black text-slate-900 text-sm capitalize">{item.student_name || 'N/A'}</div>
                        <div className="text-[11px] font-bold text-slate-400 uppercase">{item.enrollment_number || 'N/A'}</div>
                        {item.parent_phone && (
                          <div className="text-[11px] mt-1 text-slate-500 font-semibold">
                            Guardian: {item.parent_phone}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>

                  <td className="px-6 py-6">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
                        <Building2 size={12} className="text-slate-400" />
                        {item.hostel_name || 'N/A'}
                      </div>

                      <div className="text-[11px] text-slate-500 font-bold uppercase tracking-tight">
                        Block: {item.block || 'N/A'}
                      </div>

                      <div className="text-[11px] text-slate-500 font-bold uppercase tracking-tight">
                        Room: {item.room_number || 'N/A'}
                      </div>

                      <div className="flex items-center gap-2 text-[11px] font-black text-[#5B7FED]">
                        <BedDouble size={12} />
                        Bed: {item.bed_number || 'N/A'}
                      </div>

                      {(item.is_overdue || item.explanation_required) && (
                        <div className="flex items-center gap-1 bg-red-50 text-red-500 px-2 py-1 rounded-lg w-fit border border-red-100">
                          <AlertTriangle size={10} />
                          <span className="text-[9px] font-black uppercase tracking-tighter">
                            {item.explanation_status === 'pending' ? 'Reason Required' : 'Overdue'}
                          </span>
                        </div>
                      )}
                    </div>
                  </td>

                  <td className="px-6 py-6">
                    <div className="space-y-2">
                      <div className="text-xs font-bold text-slate-800 flex items-center gap-1">
                        <MapPin size={10} className="text-slate-400" /> {item.destination || 'Local'}
                      </div>
                      <div className="text-[11px] text-slate-500 italic max-w-[220px] break-words">
                        "{item.reason || 'N/A'}"
                      </div>
                    </div>
                  </td>

                  <td className="px-6 py-6">
                    <div className="space-y-2">
                      <div>
                        <div className="text-[10px] font-black uppercase tracking-tight text-slate-400">Leave From</div>
                        <div className="text-[11px] font-black text-slate-800">{formatDateTime(item.leave_from)}</div>
                      </div>

                      <div>
                        <div className="text-[10px] font-black uppercase tracking-tight text-slate-400">Return By</div>
                        <div className="text-[11px] font-black text-slate-800">{formatDateTime(item.leave_to)}</div>
                      </div>

                      <button
                        onClick={() => handleSendAlert(item)}
                        className="flex items-center gap-1 text-[9px] font-black uppercase text-[#5B7FED] hover:underline disabled:opacity-40"
                        disabled={item.status === 'pending'}
                      >
                        <Send size={10} /> Send Overdue Alert
                      </button>
                    </div>
                  </td>

                  <td className="px-6 py-6">
                    <div className="space-y-2">
                      <div className="relative">
                        <MessageSquare className="absolute left-3 top-3 text-slate-300" size={14} />
                        <textarea
                          rows={4}
                          placeholder="Add approval/rejection note for student..."
                          value={statusNoteMap[item._id] ?? item.status_note ?? ''}
                          onChange={(e) => setStatusNote(item._id, e.target.value)}
                          className="w-full rounded-2xl border border-slate-200 bg-slate-50 pl-9 pr-3 py-3 text-[11px] font-semibold text-slate-700 outline-none focus:ring-4 focus:ring-blue-50 resize-none"
                        />
                      </div>

                      {item.status_note && !statusNoteMap[item._id] && (
                        <div className="text-[10px] text-slate-500 font-bold">
                          Existing note: {item.status_note}
                        </div>
                      )}
                    </div>
                  </td>

                  <td className="px-6 py-6 text-center">
                    <span className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest ${
                      item.status === 'approved' ? 'bg-emerald-100 text-emerald-600' :
                      item.status === 'rejected' ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-600'
                    }`}>
                      {item.status}
                    </span>

                    {item.approval_date && (
                      <div className="mt-3 text-[10px] text-slate-400 font-bold">
                        {formatDateTime(item.approval_date)}
                      </div>
                    )}
                  </td>

                  <td className="px-8 py-6">
                    <div className="flex items-center justify-center">
                      <select
                        value={item.status}
                        disabled={actionLoadingId === item._id}
                        onChange={(e) => updateStatus(item._id, e.target.value)}
                        className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-[10px] font-black text-slate-700 outline-none focus:ring-4 focus:ring-blue-50 transition-all cursor-pointer min-w-[130px]"
                      >
                        <option value="pending">PENDING</option>
                        <option value="approved">APPROVE</option>
                        <option value="rejected">REJECT</option>
                      </select>
                    </div>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan="7" className="py-24 text-center">
                    <Filter size={48} className="mx-auto text-slate-200 mb-4" />
                    <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px]">No records found</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
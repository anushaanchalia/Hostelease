import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { Card } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import {
  Search, User, MapPin, Phone, Mail, BookOpen,
  History, ShieldAlert, FileText, Loader2, AlertCircle,
  GraduationCap, Heart, CheckCircle, X, IndianRupee,
  Building2, Layers3, BedDouble, Copy, UserCheck, Clock3, Shield,
  BadgeAlert, Droplets, WashingMachine, CalendarClock, RefreshCw, ClipboardList,
  CheckCircle2, XCircle, CircleDashed, Info, UserCog, KeyRound,
  Users, CreditCard, TrendingUp, Wallet, Eye, ChevronRight
} from 'lucide-react';
import api from '../../utils/api';
import { toast } from 'sonner';

const HOSTEL_OPTIONS = [
  'Azad Bhawan',
  'Atal Bhawan',
  'Tagore Bhawan',
  'Shakuntala Bhawan',
  'Janaki Bhawan',
  'Teresa Bhawan'
];

const normalizeHostelName = (name = '') => {
  if (!name) return 'N/A';
  if (name === 'Shakunthala Bhawan') return 'Shakuntala Bhawan';
  return name;
};

const formatDate = (value) => {
  if (!value) return 'N/A';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
};

const formatDateTime = (value) => {
  if (!value) return 'N/A';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

const getComplaintStatusClass = (status) => {
  const s = (status || '').toLowerCase();
  if (s === 'resolved' || s === 'completed') return 'bg-emerald-100 text-emerald-600';
  if (s === 'rejected' || s === 'closed') return 'bg-red-100 text-red-600';
  return 'bg-amber-100 text-amber-600';
};

const getFineStatusClass = (status) => {
  const s = (status || '').toLowerCase();
  if (s === 'paid') return 'bg-emerald-500 text-white';
  return 'bg-red-500 text-white';
};

const getLaundryStatusClass = (status) => {
  const s = (status || '').toLowerCase();
  if (s === 'completed' || s === 'resolved') return 'bg-emerald-100 text-emerald-600';
  if (s === 'cancelled' || s === 'failed') return 'bg-red-100 text-red-600';
  return 'bg-amber-100 text-amber-600';
};

const getPaymentStatusClass = (status) => {
  const s = (status || '').toLowerCase();
  if (s === 'paid' || s === 'success' || s === 'completed') return 'bg-emerald-100 text-emerald-600';
  if (s === 'failed' || s === 'cancelled') return 'bg-red-100 text-red-600';
  return 'bg-amber-100 text-amber-600';
};

const getVisitorStatusClass = (status) => {
  const s = (status || '').toLowerCase();
  if (s === 'checked_out' || s === 'completed') return 'bg-emerald-100 text-emerald-600';
  if (s === 'rejected' || s === 'cancelled') return 'bg-red-100 text-red-600';
  return 'bg-cyan-100 text-cyan-700';
};

const getAttendanceBarClass = (status) => {
  const s = (status || '').toLowerCase();
  if (s === 'present') return 'bg-emerald-400';
  if (s === 'late') return 'bg-amber-400';
  if (s === 'absent') return 'bg-red-400';
  return 'bg-slate-300';
};

export default function GlobalLookup() {
  const location = useLocation();
  const dropdownRef = useRef(null);

  const [searchID, setSearchID] = useState(location.state?.searchID || '');
  const [searchType, setSearchType] = useState(location.state?.searchType || 'enrollment');
  const [selectedHostel, setSelectedHostel] = useState(
    location.state?.hostel || 'Atal Bhawan'
  );
  const [selectedBlock, setSelectedBlock] = useState(location.state?.block || '');
  const [selectedFloor, setSelectedFloor] = useState(location.state?.floor || '');
  const [activeHistoryTab, setActiveHistoryTab] = useState('gatepasses');

  const [student, setStudent] = useState(null);
  const [history, setHistory] = useState({
    gatepasses: [],
    complaints: [],
    fines: [],
    fine_count: 0,
    laundry_complaints: [],
    laundry_bookings: [],
    visitors: [],
    payments: [],
    payment_summary: {
      total_paid: 0,
      total_unpaid: 0,
      total_fines_paid: 0,
      total_fines_unpaid: 0
    }
  });
  const [attendanceSummary, setAttendanceSummary] = useState({
    present: 0,
    absent: 0,
    late: 0,
    percentage: 0
  });
  const [attendanceTrend, setAttendanceTrend] = useState([]);

  const [loading, setLoading] = useState(false);
  const [trendLoading, setTrendLoading] = useState(false);
  const [error, setError] = useState(null);

  const [suggestions, setSuggestions] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);

  const [isFineModalOpen, setIsFineModalOpen] = useState(false);
  const [fineData, setFineData] = useState({ amount: '', description: '' });
  const [submittingFine, setSubmittingFine] = useState(false);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);
  
  useEffect(() => {
    const stateSearchId = location.state?.searchID;
    const stateSearchType = location.state?.searchType || 'enrollment';

    if (stateSearchId) {
      handleSearch(stateSearchId, stateSearchType);
    }
  }, [location.state]);

  useEffect(() => {
    const fetchSuggestions = async () => {
      if (searchType !== 'enrollment') {
        setSuggestions([]);
        setShowDropdown(false);
        return;
      }

      if (searchID.trim().length > 1) {
        try {
          const res = await api.get(`/admin/students/search-suggestions?query=${encodeURIComponent(searchID.trim())}`);
          setSuggestions(Array.isArray(res.data) ? res.data : []);
          if (Array.isArray(res.data) && res.data.length > 0) {
            setShowDropdown(true);
          } else {
            setShowDropdown(false);
          }
        } catch (err) {
          setSuggestions([]);
          setShowDropdown(false);
        }
      } else {
        setSuggestions([]);
        setShowDropdown(false);
      }
    };

    const timer = setTimeout(fetchSuggestions, 300);
    return () => clearTimeout(timer);
  }, [searchID, searchType]);

  const fetchAttendanceSummary = async (enrollmentNumber) => {
    try {
      const res = await api.get(`/admin/students/attendance-summary/${enrollmentNumber}`);
      setAttendanceSummary({
        present: res.data?.present || 0,
        absent: res.data?.absent || 0,
        late: res.data?.late || 0,
        percentage: res.data?.percentage || 0
      });
    } catch (err) {
      setAttendanceSummary({
        present: 0,
        absent: 0,
        late: 0,
        percentage: 0
      });
    }
  };

  const fetchAttendanceTrend = async (enrollmentNumber) => {
    try {
      setTrendLoading(true);
      const res = await api.get(`/admin/students/attendance-trend/${enrollmentNumber}`);
      setAttendanceTrend(Array.isArray(res.data?.trend) ? res.data.trend : []);
    } catch (err) {
      setAttendanceTrend([]);
    } finally {
      setTrendLoading(false);
    }
  };

  const handleSearch = async (manualTerm, manualType) => {
    const term = (manualTerm ?? searchID).toString().trim();
    const currentType = manualType || searchType;

    if (!term) {
      toast.error(currentType === 'room' ? 'Please enter room number' : 'Please enter enrollment ID or name');
      return;
    }

    if (currentType === 'room' && !selectedHostel) {
      toast.error('Please select hostel for room lookup');
      return;
    }

    setShowDropdown(false);
    setError(null);
    setStudent(null);

    try {
      setLoading(true);

      let profileRes;

      if (currentType === 'enrollment') {
        profileRes = await api.get(`/admin/students/profile/${encodeURIComponent(term)}`);
      } else {
        profileRes = await api.get('/admin/students/lookup', {
          params: {
            room: term,
            hostel: selectedHostel,
            block: selectedBlock || undefined,
            floor: selectedFloor || undefined
          }
        });
      }

      const profile = {
        ...profileRes.data,
        hostel_name: normalizeHostelName(profileRes.data?.hostel_name)
      };

      setStudent(profile);

      if (profile?.enrollment_number) {
        const historyRes = await api.get(`/admin/students/history/${profile.enrollment_number}`);
        setHistory({
          gatepasses: historyRes.data?.gatepasses || [],
          complaints: historyRes.data?.complaints || [],
          fines: historyRes.data?.fines || [],
          fine_count: historyRes.data?.fine_count || (historyRes.data?.fines || []).filter(f => (f.status || '').toLowerCase() === 'unpaid').length,
          laundry_complaints: historyRes.data?.laundry_complaints || [],
          laundry_bookings: historyRes.data?.laundry_bookings || [],
          visitors: historyRes.data?.visitors || [],
          payments: historyRes.data?.payments || [],
          payment_summary: historyRes.data?.payment_summary || {
            total_paid: 0,
            total_unpaid: 0,
            total_fines_paid: 0,
            total_fines_unpaid: 0
          }
        });

        await Promise.all([
          fetchAttendanceSummary(profile.enrollment_number),
          fetchAttendanceTrend(profile.enrollment_number)
        ]);
      } else {
        setHistory({
          gatepasses: [],
          complaints: [],
          fines: [],
          fine_count: 0,
          laundry_complaints: [],
          laundry_bookings: [],
          visitors: [],
          payments: [],
          payment_summary: {
            total_paid: 0,
            total_unpaid: 0,
            total_fines_paid: 0,
            total_fines_unpaid: 0
          }
        });
        setAttendanceSummary({ present: 0, absent: 0, late: 0, percentage: 0 });
        setAttendanceTrend([]);
      }
    } catch (err) {
      setStudent(null);
      setHistory({
        gatepasses: [],
        complaints: [],
        fines: [],
        fine_count: 0,
        laundry_complaints: [],
        laundry_bookings: [],
        visitors: [],
        payments: [],
        payment_summary: {
          total_paid: 0,
          total_unpaid: 0,
          total_fines_paid: 0,
          total_fines_unpaid: 0
        }
      });
      setAttendanceSummary({ present: 0, absent: 0, late: 0, percentage: 0 });
      setAttendanceTrend([]);

      if (currentType === 'room') {
        setError(`No resident found in Room ${term}, ${selectedHostel}`);
      } else {
        setError('No resident found with this Enrollment ID / Name');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleMarkFine = async (e) => {
    e.preventDefault();
    if (!student?.enrollment_number) return;

    setSubmittingFine(true);
    try {
      await api.post('/admin/students/mark-fine', {
        enrollment_number: student.enrollment_number,
        amount: fineData.amount,
        description: fineData.description
      });

      toast.success('Fine imposed successfully');
      setIsFineModalOpen(false);
      setFineData({ amount: '', description: '' });
      handleSearch(student.enrollment_number, 'enrollment');
    } catch (err) {
      toast.error('Failed to impose fine');
    } finally {
      setSubmittingFine(false);
    }
  };

  const downloadConductReport = async () => {
    if (!student?.enrollment_number) return;

    try {
      const res = await api.get(`/admin/students/conduct-report/${student.enrollment_number}`);
      const backendUrl = process.env.REACT_APP_BACKEND_URL || 'http://127.0.0.1:8000';

      if (res.data?.pdf_url) {
        window.open(`${backendUrl}${res.data.pdf_url}`, '_blank');
        toast.success('Conduct Report Generated');
      } else {
        toast.error('Report generation failed');
      }
    } catch (err) {
      toast.error('Report generation failed');
    }
  };

  const copyText = async (text, label) => {
    if (!text || text === 'N/A') {
      toast.error(`No ${label} available`);
      return;
    }

    try {
      await navigator.clipboard.writeText(String(text));
      toast.success(`${label} copied`);
    } catch (err) {
      toast.error(`Failed to copy ${label}`);
    }
  };

  const refreshLookup = async () => {
    if (!student?.enrollment_number) return;
    await handleSearch(student.enrollment_number, 'enrollment');
    toast.success('Lookup refreshed');
  };

  const getRoleBadge = (role) => {
    const normalized = (role || 'student').toLowerCase();
    const isAdmin = normalized === 'admin';

    return (
      <span className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest ${
        isAdmin
          ? 'bg-red-50 text-red-600 border border-red-100'
          : 'bg-emerald-50 text-emerald-600 border border-emerald-100'
      }`}>
        {isAdmin ? 'Admin' : 'Student'}
      </span>
    );
  };

  const getGatepassStatusClass = (status) => {
    const s = (status || '').toLowerCase();
    if (s === 'approved') return 'bg-emerald-100 text-emerald-600';
    if (s === 'rejected') return 'bg-red-100 text-red-600';
    return 'bg-amber-100 text-amber-600';
  };

  const riskFlags = useMemo(() => {
    const flags = [];

    if ((history.fine_count || 0) > 0) {
      flags.push({
        label: `${history.fine_count} Active Fine${history.fine_count > 1 ? 's' : ''}`,
        className: 'bg-red-50 text-red-600 border border-red-100',
        icon: <BadgeAlert size={12} />
      });
    }

    if ((attendanceSummary.percentage || 0) > 0 && (attendanceSummary.percentage || 0) < 75) {
      flags.push({
        label: `Low Attendance ${attendanceSummary.percentage}%`,
        className: 'bg-amber-50 text-amber-600 border border-amber-100',
        icon: <AlertCircle size={12} />
      });
    }

    if (student?.is_default_password) {
      flags.push({
        label: 'Default Password',
        className: 'bg-blue-50 text-[#5B7FED] border border-blue-100',
        icon: <KeyRound size={12} />
      });
    }

    if ((history.visitors || []).some(v => ['active', 'checked_in', 'inside'].includes((v.status || '').toLowerCase()))) {
      flags.push({
        label: 'Recent Visitor Activity',
        className: 'bg-cyan-50 text-cyan-700 border border-cyan-100',
        icon: <Users size={12} />
      });
    }

    if (!flags.length) {
      flags.push({
        label: 'No Critical Flags',
        className: 'bg-emerald-50 text-emerald-600 border border-emerald-100',
        icon: <CheckCircle2 size={12} />
      });
    }

    return flags;
  }, [history.fine_count, history.visitors, attendanceSummary.percentage, student?.is_default_password]);

  const summaryCards = useMemo(() => {
    return [
      {
        label: 'Gatepasses',
        value: history.gatepasses.length,
        icon: <FileText size={18} className="text-emerald-500" />,
        className: 'bg-emerald-50 border-emerald-100'
      },
      {
        label: 'Complaints',
        value: history.complaints.length,
        icon: <Shield size={18} className="text-amber-500" />,
        className: 'bg-amber-50 border-amber-100'
      },
      {
        label: 'Laundry',
        value: history.laundry_complaints.length + history.laundry_bookings.length,
        icon: <WashingMachine size={18} className="text-indigo-500" />,
        className: 'bg-indigo-50 border-indigo-100'
      },
      {
        label: 'Visitors',
        value: history.visitors.length,
        icon: <Users size={18} className="text-cyan-600" />,
        className: 'bg-cyan-50 border-cyan-100'
      },
      {
        label: 'Payments',
        value: history.payments.length,
        icon: <Wallet size={18} className="text-violet-600" />,
        className: 'bg-violet-50 border-violet-100'
      },
      {
        label: 'Fines',
        value: history.fines.length,
        icon: <BadgeAlert size={18} className="text-red-500" />,
        className: 'bg-red-50 border-red-100'
      }
    ];
  }, [history]);

  const maxTrendBar = useMemo(() => {
    return attendanceTrend.length > 0 ? Math.max(...attendanceTrend.map(x => Number(x.count || 0)), 1) : 1;
  }, [attendanceTrend]);

  return (
    <div className="space-y-8 fade-in pb-20 w-full max-w-[calc(100vw-310px)] ml-auto pr-8 text-left">
      <div className="bg-slate-900 p-10 rounded-[3rem] shadow-2xl relative overflow-visible">
        <div className="relative z-20">
          <h1 className="text-3xl font-black text-white tracking-tight mb-2">Global Resident Lookup</h1>
          <p className="text-slate-300 text-sm font-medium mb-6">
            Unified resident intelligence view with profile, room status, conduct, visitors, payments, fines, attendance and service activity.
          </p>

          <div className="flex bg-white/10 p-1 rounded-2xl w-fit mb-6 border border-white/5">
            <button
              onClick={() => {
                setSearchType('enrollment');
                setError(null);
              }}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                searchType === 'enrollment'
                  ? 'bg-white text-slate-900 shadow-lg'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <User size={14} /> By Enrollment
            </button>

            <button
              onClick={() => {
                setSearchType('room');
                setError(null);
                setShowDropdown(false);
              }}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                searchType === 'room'
                  ? 'bg-white text-slate-900 shadow-lg'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <MapPin size={14} /> By Room
            </button>
          </div>

          {searchType === 'room' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4 max-w-4xl">
              <div>
                <select
                  value={selectedHostel}
                  onChange={(e) => setSelectedHostel(e.target.value)}
                  className="w-full px-5 py-4 bg-white rounded-[1.5rem] text-sm font-bold shadow-xl outline-none focus:ring-4 focus:ring-blue-500/20"
                >
                  {HOSTEL_OPTIONS.map((hostel) => (
                    <option key={hostel} value={hostel}>
                      {hostel}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <input
                  type="text"
                  placeholder="Optional Block"
                  value={selectedBlock}
                  onChange={(e) => setSelectedBlock(e.target.value)}
                  className="w-full px-5 py-4 bg-white rounded-[1.5rem] text-sm font-bold shadow-xl outline-none focus:ring-4 focus:ring-blue-500/20"
                />
              </div>

              <div>
                <input
                  type="text"
                  placeholder="Optional Floor"
                  value={selectedFloor}
                  onChange={(e) => setSelectedFloor(e.target.value)}
                  className="w-full px-5 py-4 bg-white rounded-[1.5rem] text-sm font-bold shadow-xl outline-none focus:ring-4 focus:ring-blue-500/20"
                />
              </div>
            </div>
          )}

          <div className="relative max-w-2xl" ref={dropdownRef}>
            <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-500" size={20} />

            <input
              type="text"
              placeholder={
                searchType === 'room'
                  ? 'Search by Room Number...'
                  : 'Search Enrollment ID, Username, or Email...'
              }
              value={searchID}
              onChange={(e) => setSearchID(e.target.value)}
              onFocus={() => {
                if (searchType === 'enrollment' && searchID.length > 1 && suggestions.length > 0) {
                  setShowDropdown(true);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSearch();
              }}
              className="w-full pl-14 pr-32 py-5 bg-white border-none rounded-[2rem] text-sm font-bold shadow-2xl outline-none focus:ring-4 focus:ring-blue-500/20 transition-all"
            />

            {showDropdown && searchType === 'enrollment' && suggestions.length > 0 && (
              <div className="absolute top-full left-0 w-full mt-2 bg-white rounded-[2rem] shadow-[0_20px_50px_rgba(0,0,0,0.2)] border border-slate-100 z-[999] max-h-[300px] overflow-y-auto overflow-x-hidden custom-scrollbar">
                {suggestions.map((s, i) => (
                  <div
                    key={i}
                    onClick={() => {
                      setSearchID(String(s.enrollment_number));
                      handleSearch(String(s.enrollment_number), 'enrollment');
                    }}
                    className="p-5 hover:bg-blue-50 cursor-pointer border-b border-slate-50 flex justify-between items-center transition-colors group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-400 group-hover:bg-[#5B7FED] group-hover:text-white transition-all">
                        <User size={18} />
                      </div>
                      <div>
                        <span className="font-bold text-slate-800 text-[15px] block">{s.student_name}</span>
                        {s.hostel_name && (
                          <span className="text-[10px] font-bold text-slate-400 uppercase">
                            {normalizeHostelName(s.hostel_name)}
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="text-[11px] font-black text-[#5B7FED] bg-blue-50 px-3 py-1 rounded-lg uppercase tracking-widest">
                      {s.enrollment_number}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <button
              onClick={() => handleSearch()}
              className="absolute right-3 top-1/2 -translate-y-1/2 bg-[#5B7FED] text-white px-8 py-4 rounded-2xl font-black text-[11px] uppercase tracking-widest hover:bg-blue-600 transition-all shadow-lg active:scale-95"
            >
              Find
            </button>
          </div>
        </div>
      </div>

      {loading && (
        <div className="py-20 text-center">
          <Loader2 className="animate-spin text-[#5B7FED] mx-auto mb-4" size={40} />
          <p className="text-slate-400 font-black text-[10px] uppercase tracking-[0.3em]">Syncing Data...</p>
        </div>
      )}

      {error && !showDropdown && (
        <div className="bg-red-50 p-6 rounded-3xl flex items-center gap-4 text-red-600 border border-red-100 animate-shake">
          <AlertCircle size={20} />
          <p className="font-bold text-sm">{error}</p>
        </div>
      )}

      {student && !loading && (
        <>
          <Card className="p-5 rounded-[2rem] border-none shadow-xl bg-gradient-to-r from-blue-50 to-white">
            <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.25em] mb-2">
                  Resident Found
                </p>
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="text-xl font-black text-slate-900">{student.student_name}</h2>
                  {getRoleBadge(student.role)}
                  {student.gender && student.gender !== 'N/A' && (
                    <span className="px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest bg-slate-100 text-slate-700 border border-slate-200">
                      {student.gender}
                    </span>
                  )}
                </div>
                <p className="text-sm font-bold text-slate-600 mt-2">
                  {normalizeHostelName(student.hostel_name)} • Block {student.block || 'N/A'} • Floor {student.floor || 'N/A'} • Room {student.room_number || 'N/A'} {student.bed_number ? `• Bed ${student.bed_number}` : ''}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <span className="px-4 py-2 bg-white rounded-xl border border-slate-100 text-[11px] font-black text-slate-700 uppercase">
                  Active Fines: {history.fine_count || 0}
                </span>
                <span className="px-4 py-2 bg-white rounded-xl border border-slate-100 text-[11px] font-black text-slate-700 uppercase">
                  Attendance: {attendanceSummary.percentage || 0}%
                </span>
                <Button
                  onClick={refreshLookup}
                  className="bg-slate-900 text-white rounded-2xl py-6 font-black uppercase text-[9px] tracking-widest shadow-xl"
                >
                  <RefreshCw size={14} className="mr-2" />
                  Refresh
                </Button>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 mt-5">
              {riskFlags.map((flag, idx) => (
                <span
                  key={idx}
                  className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest ${flag.className}`}
                >
                  {flag.icon}
                  {flag.label}
                </span>
              ))}
            </div>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-4">
            {summaryCards.map((card, idx) => (
              <Card key={idx} className={`p-5 rounded-[2rem] border shadow-sm ${card.className}`}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">{card.label}</p>
                    <h3 className="text-2xl font-black text-slate-900 mt-1">{card.value}</h3>
                  </div>
                  <div className="w-12 h-12 rounded-2xl bg-white border border-white/70 flex items-center justify-center shadow-sm">
                    {card.icon}
                  </div>
                </div>
              </Card>
            ))}
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
            <div className="xl:col-span-1 space-y-6">
              <Card className="p-8 rounded-[3rem] border-none shadow-2xl bg-white relative overflow-hidden">
                <div className="text-center mb-8">
                  <div className="w-28 h-28 rounded-[2.5rem] bg-slate-50 border-4 border-white shadow-xl flex items-center justify-center mx-auto mb-4 text-[#5B7FED] overflow-hidden">
                    {student.profile_photo ? (
                      <img
                        src={student.profile_photo}
                        alt={student.student_name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <User size={56} />
                    )}
                  </div>

                  <h2 className="text-2xl font-black text-slate-900 capitalize">{student.student_name}</h2>
                  <div className="flex items-center justify-center gap-2 mt-2 flex-wrap">
                    <span className="px-3 py-1 bg-blue-50 text-[#5B7FED] rounded-lg text-[10px] font-black uppercase tracking-tighter">
                      {student.enrollment_number}
                    </span>
                    {getRoleBadge(student.role)}
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="p-4 bg-slate-50 rounded-2xl flex items-center gap-4">
                    <MapPin className="text-slate-400" size={18} />
                    <div>
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Residence</p>
                      <p className="text-xs font-black text-slate-700">
                        {normalizeHostelName(student.hostel_name)}
                      </p>
                    </div>
                  </div>

                  <div className="p-4 bg-slate-50 rounded-2xl flex items-center gap-4">
                    <Building2 className="text-slate-400" size={18} />
                    <div>
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Block / Floor</p>
                      <p className="text-xs font-black text-slate-700">
                        Block {student.block || 'N/A'} • Floor {student.floor || 'N/A'}
                      </p>
                    </div>
                  </div>

                  <div className="p-4 bg-slate-50 rounded-2xl flex items-center gap-4">
                    <BedDouble className="text-slate-400" size={18} />
                    <div>
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Room / Bed</p>
                      <p className="text-xs font-black text-slate-700">
                        Room {student.room_number || 'N/A'} • Bed {student.bed_number || 'N/A'}
                      </p>
                    </div>
                  </div>

                  <div className="p-4 bg-slate-50 rounded-2xl flex items-center gap-4">
                    <GraduationCap className="text-slate-400" size={18} />
                    <div>
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Academic Program</p>
                      <p className="text-xs font-black text-slate-700">
                        {student.course || 'N/A'} • Year {student.year || 'N/A'}
                      </p>
                    </div>
                  </div>

                  <div className="p-4 bg-slate-50 rounded-2xl flex items-center gap-4">
                    <Phone className="text-slate-400" size={18} />
                    <div>
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Contact</p>
                      <p className="text-xs font-black text-slate-700">{student.phone || 'N/A'}</p>
                    </div>
                  </div>

                  <div className="p-4 bg-slate-50 rounded-2xl flex items-center gap-4">
                    <Mail className="text-slate-400" size={18} />
                    <div>
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Institution Email</p>
                      <p className="text-[10px] font-black text-[#5B7FED] lowercase break-all">
                        {student.college_email || 'N/A'}
                      </p>
                    </div>
                  </div>

                  {student.personal_email && student.personal_email !== 'N/A' && (
                    <div className="p-4 bg-slate-50 rounded-2xl flex items-center gap-4">
                      <Mail className="text-slate-400" size={18} />
                      <div>
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Personal Email</p>
                        <p className="text-[10px] font-black text-slate-700 lowercase break-all">
                          {student.personal_email}
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3 mt-6">
                    <Button
                      onClick={downloadConductReport}
                      className="bg-slate-900 text-white rounded-2xl py-6 font-black uppercase text-[9px] tracking-widest shadow-xl flex-1"
                    >
                      Report
                    </Button>

                    <Button
                      onClick={() => setIsFineModalOpen(true)}
                      className="bg-red-500 text-white rounded-2xl py-6 font-black uppercase text-[9px] tracking-widest shadow-xl shadow-red-100 flex-1"
                    >
                      Mark Fine
                    </Button>
                  </div>

                  <div className="grid grid-cols-2 gap-3 mt-2">
                    <Button
                      onClick={() => copyText(student.enrollment_number, 'Enrollment ID')}
                      className="bg-blue-50 text-[#5B7FED] hover:bg-blue-100 rounded-2xl py-6 font-black uppercase text-[9px] tracking-widest shadow-none"
                    >
                      <Copy size={14} className="mr-2" />
                      Copy ID
                    </Button>

                    <Button
                      onClick={() => copyText(student.parent_phone || student.father_contact || student.mother_contact, 'Parent contact')}
                      className="bg-emerald-50 text-emerald-600 hover:bg-emerald-100 rounded-2xl py-6 font-black uppercase text-[9px] tracking-widest shadow-none"
                    >
                      <Phone size={14} className="mr-2" />
                      Copy Parent
                    </Button>
                  </div>

                  <div className="grid grid-cols-2 gap-3 mt-2">
                    <Button
                      onClick={() => copyText(student.phone, 'Phone')}
                      className="bg-slate-50 text-slate-700 hover:bg-slate-100 rounded-2xl py-6 font-black uppercase text-[9px] tracking-widest shadow-none"
                    >
                      <Phone size={14} className="mr-2" />
                      Copy Phone
                    </Button>

                    <Button
                      onClick={() => copyText(student.college_email || student.personal_email, 'Email')}
                      className="bg-slate-50 text-slate-700 hover:bg-slate-100 rounded-2xl py-6 font-black uppercase text-[9px] tracking-widest shadow-none"
                    >
                      <Mail size={14} className="mr-2" />
                      Copy Email
                    </Button>
                  </div>

                  <div className="grid grid-cols-2 gap-3 mt-2">
                    <Button
                      onClick={() => copyText(`${student.room_number || 'N/A'} / ${student.bed_number || 'N/A'}`, 'Room and bed')}
                      className="bg-violet-50 text-violet-600 hover:bg-violet-100 rounded-2xl py-6 font-black uppercase text-[9px] tracking-widest shadow-none"
                    >
                      <BedDouble size={14} className="mr-2" />
                      Copy Room
                    </Button>

                    <Button
                      onClick={() => copyText(student.username, 'Username')}
                      className="bg-amber-50 text-amber-600 hover:bg-amber-100 rounded-2xl py-6 font-black uppercase text-[9px] tracking-widest shadow-none"
                    >
                      <UserCog size={14} className="mr-2" />
                      Copy User
                    </Button>
                  </div>
                </div>
              </Card>

              <Card className="p-8 rounded-[3rem] border-none shadow-2xl bg-white">
                <h4 className="text-[10px] font-black text-slate-300 uppercase tracking-widest ml-1 mb-4 flex items-center gap-2">
                  <Heart size={12} className="text-rose-400" />
                  Parent Information
                </h4>

                <div className="space-y-4">
                  <div>
                    <p className="text-[9px] font-black text-slate-400 uppercase mb-1">Father</p>
                    <p className="text-sm font-black text-slate-800">{student.father_name || 'N/A'}</p>
                    <p className="text-[10px] font-bold text-slate-500">{student.father_contact || 'N/A'}</p>
                  </div>

                  <div className="pt-4 border-t border-slate-50">
                    <p className="text-[9px] font-black text-slate-400 uppercase mb-1">Mother</p>
                    <p className="text-sm font-black text-slate-800">{student.mother_name || 'N/A'}</p>
                    <p className="text-[10px] font-bold text-slate-500">{student.mother_contact || 'N/A'}</p>
                  </div>

                  <div className="pt-4 border-t border-slate-50">
                    <p className="text-[9px] font-black text-slate-400 uppercase mb-1">Primary Parent Phone</p>
                    <p className="text-sm font-black text-slate-800">{student.parent_phone || 'N/A'}</p>
                  </div>
                </div>
              </Card>

              <Card className="p-8 rounded-[3rem] border-none shadow-2xl bg-white">
                <h4 className="text-[10px] font-black text-slate-300 uppercase tracking-widest ml-1 mb-5 flex items-center gap-2">
                  <UserCheck size={12} className="text-[#5B7FED]" />
                  Attendance Snapshot
                </h4>

                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-100">
                    <p className="text-[9px] font-black text-emerald-500 uppercase tracking-widest">Present</p>
                    <p className="text-2xl font-black text-slate-900 mt-1">{attendanceSummary.present}</p>
                  </div>

                  <div className="p-4 rounded-2xl bg-red-50 border border-red-100">
                    <p className="text-[9px] font-black text-red-500 uppercase tracking-widest">Absent</p>
                    <p className="text-2xl font-black text-slate-900 mt-1">{attendanceSummary.absent}</p>
                  </div>

                  <div className="p-4 rounded-2xl bg-amber-50 border border-amber-100">
                    <p className="text-[9px] font-black text-amber-500 uppercase tracking-widest">Late</p>
                    <p className="text-2xl font-black text-slate-900 mt-1">{attendanceSummary.late}</p>
                  </div>

                  <div className="p-4 rounded-2xl bg-blue-50 border border-blue-100">
                    <p className="text-[9px] font-black text-[#5B7FED] uppercase tracking-widest">Attendance %</p>
                    <p className="text-2xl font-black text-slate-900 mt-1">{attendanceSummary.percentage}%</p>
                  </div>
                </div>
              </Card>

              <Card className="p-8 rounded-[3rem] border-none shadow-2xl bg-white">
                <div className="flex items-center justify-between mb-5">
                  <h4 className="text-[10px] font-black text-slate-300 uppercase tracking-widest ml-1 flex items-center gap-2">
                    <TrendingUp size={12} className="text-[#5B7FED]" />
                    Attendance Trend
                  </h4>
                  <span className="text-[10px] font-black uppercase text-slate-400">
                    Last {attendanceTrend.length || 0} Days
                  </span>
                </div>

                {trendLoading ? (
                  <div className="py-8 text-center">
                    <Loader2 className="animate-spin text-[#5B7FED] mx-auto mb-3" size={24} />
                    <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest">Loading Trend...</p>
                  </div>
                ) : attendanceTrend.length === 0 ? (
                  <div className="py-8 text-center">
                    <Info className="mx-auto text-slate-300 mb-2" size={24} />
                    <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest">No attendance trend available</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-end gap-2 h-40">
                      {attendanceTrend.map((item, idx) => {
                        const height = Math.max(16, Math.round((Number(item.count || 0) / maxTrendBar) * 120));
                        return (
                          <div key={idx} className="flex-1 flex flex-col items-center gap-2">
                            <div
                              className={`w-full rounded-t-2xl ${getAttendanceBarClass(item.status)}`}
                              style={{ height: `${height}px` }}
                              title={`${item.label}: ${item.status} (${item.count})`}
                            />
                            <span className="text-[9px] font-black text-slate-400 uppercase truncate max-w-full">
                              {item.short_label || item.label}
                            </span>
                          </div>
                        );
                      })}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <span className="px-3 py-1 rounded-xl text-[10px] font-black uppercase bg-emerald-50 text-emerald-600 border border-emerald-100">
                        Present
                      </span>
                      <span className="px-3 py-1 rounded-xl text-[10px] font-black uppercase bg-amber-50 text-amber-600 border border-amber-100">
                        Late
                      </span>
                      <span className="px-3 py-1 rounded-xl text-[10px] font-black uppercase bg-red-50 text-red-600 border border-red-100">
                        Absent
                      </span>
                    </div>
                  </div>
                )}
              </Card>

              <Card className="p-8 rounded-[3rem] border-none shadow-2xl bg-white">
                <h4 className="text-[10px] font-black text-slate-300 uppercase tracking-widest ml-1 mb-5 flex items-center gap-2">
                  <CreditCard size={12} className="text-violet-500" />
                  Payment Snapshot
                </h4>

                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-100">
                    <p className="text-[9px] font-black text-emerald-500 uppercase tracking-widest">Total Paid</p>
                    <p className="text-xl font-black text-slate-900 mt-1">₹{history.payment_summary?.total_paid || 0}</p>
                  </div>

                  <div className="p-4 rounded-2xl bg-amber-50 border border-amber-100">
                    <p className="text-[9px] font-black text-amber-500 uppercase tracking-widest">Pending / Unpaid</p>
                    <p className="text-xl font-black text-slate-900 mt-1">₹{history.payment_summary?.total_unpaid || 0}</p>
                  </div>

                  <div className="p-4 rounded-2xl bg-blue-50 border border-blue-100">
                    <p className="text-[9px] font-black text-[#5B7FED] uppercase tracking-widest">Fines Paid</p>
                    <p className="text-xl font-black text-slate-900 mt-1">₹{history.payment_summary?.total_fines_paid || 0}</p>
                  </div>

                  <div className="p-4 rounded-2xl bg-red-50 border border-red-100">
                    <p className="text-[9px] font-black text-red-500 uppercase tracking-widest">Fines Unpaid</p>
                    <p className="text-xl font-black text-slate-900 mt-1">₹{history.payment_summary?.total_fines_unpaid || 0}</p>
                  </div>
                </div>
              </Card>
            </div>

            <div className="xl:col-span-2 space-y-8">
              <Card className="p-5 rounded-[2rem] border-none shadow-xl bg-white">
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setActiveHistoryTab('gatepasses')}
                    className={`px-5 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${
                      activeHistoryTab === 'gatepasses'
                        ? 'bg-slate-900 text-white'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    Gatepasses
                  </button>
                  <button
                    onClick={() => setActiveHistoryTab('complaints')}
                    className={`px-5 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${
                      activeHistoryTab === 'complaints'
                        ? 'bg-slate-900 text-white'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    Complaints
                  </button>
                  <button
                    onClick={() => setActiveHistoryTab('laundry_complaints')}
                    className={`px-5 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${
                      activeHistoryTab === 'laundry_complaints'
                        ? 'bg-slate-900 text-white'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    Laundry Complaints
                  </button>
                  <button
                    onClick={() => setActiveHistoryTab('laundry_bookings')}
                    className={`px-5 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${
                      activeHistoryTab === 'laundry_bookings'
                        ? 'bg-slate-900 text-white'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    Laundry Bookings
                  </button>
                  <button
                    onClick={() => setActiveHistoryTab('visitors')}
                    className={`px-5 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${
                      activeHistoryTab === 'visitors'
                        ? 'bg-slate-900 text-white'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    Visitors
                  </button>
                  <button
                    onClick={() => setActiveHistoryTab('payments')}
                    className={`px-5 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${
                      activeHistoryTab === 'payments'
                        ? 'bg-slate-900 text-white'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    Payments
                  </button>
                  <button
                    onClick={() => setActiveHistoryTab('fines')}
                    className={`px-5 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${
                      activeHistoryTab === 'fines'
                        ? 'bg-slate-900 text-white'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    Flags / Fines
                  </button>
                </div>
              </Card>

              {activeHistoryTab === 'gatepasses' && (
                <div className="space-y-4">
                  <h3 className="flex items-center gap-3 text-lg font-black text-slate-900 ml-2">
                    <History size={20} className="text-[#5B7FED]" />
                    Gatepass History
                  </h3>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {history.gatepasses.length > 0 ? (
                      history.gatepasses.map((gp, i) => (
                        <div key={gp._id || i} className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm group hover:shadow-xl transition-all">
                          <div className="flex justify-between items-start mb-4">
                            <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-500">
                              <FileText size={20} />
                            </div>

                            <span className={`px-4 py-1 rounded-lg text-[9px] font-black uppercase ${getGatepassStatusClass(gp.status)}`}>
                              {gp.status || 'pending'}
                            </span>
                          </div>

                          <p className="text-sm font-black text-slate-800 mb-1 capitalize">{gp.reason || 'No reason provided'}</p>
                          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-tighter">
                            Destination: {gp.destination || 'N/A'}
                          </p>
                          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter italic mt-2">
                            From: {formatDateTime(gp.leave_from)}
                          </p>
                          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter italic mt-1">
                            To: {formatDateTime(gp.leave_to)}
                          </p>
                          {gp.status_note && (
                            <div className="mt-3 p-3 rounded-xl bg-slate-50 border border-slate-100">
                              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Admin Note</p>
                              <p className="text-xs font-bold text-slate-700 mt-1">{gp.status_note}</p>
                            </div>
                          )}
                        </div>
                      ))
                    ) : (
                      <div className="bg-slate-50/60 p-8 rounded-[2rem] border-2 border-dashed border-slate-100 flex flex-col items-center justify-center md:col-span-2">
                        <Clock3 className="text-slate-300 mb-2" size={30} />
                        <p className="text-slate-400 font-black text-[10px] uppercase tracking-widest">No gatepass records found</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {activeHistoryTab === 'complaints' && (
                <div className="space-y-4">
                  <h3 className="flex items-center gap-3 text-lg font-black text-slate-900 ml-2">
                    <Shield size={20} className="text-amber-500" />
                    Complaint History
                  </h3>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {history.complaints.length > 0 ? (
                      history.complaints.map((cp, i) => (
                        <div key={cp._id || i} className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm hover:shadow-xl transition-all">
                          <div className="flex justify-between items-start mb-4">
                            <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center text-amber-500">
                              <ShieldAlert size={20} />
                            </div>

                            <span className={`px-4 py-1 rounded-lg text-[9px] font-black uppercase ${getComplaintStatusClass(cp.status)}`}>
                              {cp.status || 'pending'}
                            </span>
                          </div>

                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">
                            {cp.category || 'General'}
                          </p>
                          <p className="text-sm font-black text-slate-800 mb-2">
                            {cp.description || 'No description'}
                          </p>
                          <div className="flex flex-wrap gap-2 mt-3">
                            <span className="px-3 py-1 rounded-lg bg-slate-50 text-slate-600 border border-slate-100 text-[10px] font-black uppercase">
                              Priority: {cp.priority || 'medium'}
                            </span>
                            <span className="px-3 py-1 rounded-lg bg-slate-50 text-slate-600 border border-slate-100 text-[10px] font-black uppercase">
                              {formatDate(cp.date)}
                            </span>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="bg-slate-50/60 p-8 rounded-[2rem] border-2 border-dashed border-slate-100 flex flex-col items-center justify-center md:col-span-2">
                        <CheckCircle className="text-slate-300 mb-2" size={30} />
                        <p className="text-slate-400 font-black text-[10px] uppercase tracking-widest">No complaint history found</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {activeHistoryTab === 'laundry_complaints' && (
                <div className="space-y-4">
                  <h3 className="flex items-center gap-3 text-lg font-black text-slate-900 ml-2">
                    <Droplets size={20} className="text-indigo-500" />
                    Laundry Complaint History
                  </h3>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {history.laundry_complaints.length > 0 ? (
                      history.laundry_complaints.map((cp, i) => (
                        <div key={cp._id || i} className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm hover:shadow-xl transition-all">
                          <div className="flex justify-between items-start mb-4">
                            <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-500">
                              <Droplets size={20} />
                            </div>

                            <span className={`px-4 py-1 rounded-lg text-[9px] font-black uppercase ${getLaundryStatusClass(cp.status)}`}>
                              {cp.status || 'pending'}
                            </span>
                          </div>

                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">
                            {cp.type || 'Laundry'}
                          </p>
                          <p className="text-sm font-black text-slate-800 mb-2">
                            {cp.description || 'No description'}
                          </p>
                          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter italic">
                            {formatDate(cp.date)}
                          </p>
                        </div>
                      ))
                    ) : (
                      <div className="bg-slate-50/60 p-8 rounded-[2rem] border-2 border-dashed border-slate-100 flex flex-col items-center justify-center md:col-span-2">
                        <CircleDashed className="text-slate-300 mb-2" size={30} />
                        <p className="text-slate-400 font-black text-[10px] uppercase tracking-widest">No laundry complaint history found</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {activeHistoryTab === 'laundry_bookings' && (
                <div className="space-y-4">
                  <h3 className="flex items-center gap-3 text-lg font-black text-slate-900 ml-2">
                    <WashingMachine size={20} className="text-indigo-500" />
                    Laundry Booking History
                  </h3>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {history.laundry_bookings.length > 0 ? (
                      history.laundry_bookings.map((lb, i) => (
                        <div key={lb._id || i} className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm hover:shadow-xl transition-all">
                          <div className="flex justify-between items-start mb-4">
                            <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-500">
                              <WashingMachine size={20} />
                            </div>

                            <span className={`px-4 py-1 rounded-lg text-[9px] font-black uppercase ${getLaundryStatusClass(lb.status)}`}>
                              {lb.status || 'active'}
                            </span>
                          </div>

                          <p className="text-sm font-black text-slate-800 mb-2">
                            Machine: {lb.machine_number || lb.machine_id || 'N/A'}
                          </p>
                          <div className="space-y-1">
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter">
                              Start: {formatDateTime(lb.start_time)}
                            </p>
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter">
                              End: {formatDateTime(lb.end_time)}
                            </p>
                            <p className="text-[10px] text-[#5B7FED] font-black uppercase tracking-tighter">
                              Remaining: {lb.remaining_minutes ?? 'N/A'} min
                            </p>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="bg-slate-50/60 p-8 rounded-[2rem] border-2 border-dashed border-slate-100 flex flex-col items-center justify-center md:col-span-2">
                        <CalendarClock className="text-slate-300 mb-2" size={30} />
                        <p className="text-slate-400 font-black text-[10px] uppercase tracking-widest">No laundry booking history found</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {activeHistoryTab === 'visitors' && (
                <div className="space-y-4">
                  <h3 className="flex items-center gap-3 text-lg font-black text-slate-900 ml-2">
                    <Users size={20} className="text-cyan-600" />
                    Visitor History
                  </h3>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {history.visitors.length > 0 ? (
                      history.visitors.map((v, i) => (
                        <div key={v._id || i} className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm hover:shadow-xl transition-all">
                          <div className="flex justify-between items-start mb-4">
                            <div className="w-10 h-10 rounded-xl bg-cyan-50 flex items-center justify-center text-cyan-600">
                              <Users size={20} />
                            </div>

                            <span className={`px-4 py-1 rounded-lg text-[9px] font-black uppercase ${getVisitorStatusClass(v.status)}`}>
                              {v.status || 'active'}
                            </span>
                          </div>

                          <p className="text-sm font-black text-slate-800">{v.visitor_name || 'Visitor'}</p>
                          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-2">
                            {v.visitor_type || 'General'} {v.visitor_code ? `• ${v.visitor_code}` : ''}
                          </p>

                          <div className="space-y-1 mt-3">
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter">
                              Check-in: {formatDateTime(v.check_in)}
                            </p>
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter">
                              Check-out: {formatDateTime(v.check_out)}
                            </p>
                            {v.duration_minutes !== undefined && v.duration_minutes !== null && (
                              <p className="text-[10px] text-cyan-700 font-black uppercase tracking-tighter">
                                Duration: {v.duration_minutes} min
                              </p>
                            )}
                          </div>

                          {v.purpose && (
                            <div className="mt-3 p-3 rounded-xl bg-slate-50 border border-slate-100">
                              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Purpose</p>
                              <p className="text-xs font-bold text-slate-700 mt-1">{v.purpose}</p>
                            </div>
                          )}
                        </div>
                      ))
                    ) : (
                      <div className="bg-slate-50/60 p-8 rounded-[2rem] border-2 border-dashed border-slate-100 flex flex-col items-center justify-center md:col-span-2">
                        <Users className="text-slate-300 mb-2" size={30} />
                        <p className="text-slate-400 font-black text-[10px] uppercase tracking-widest">No visitor history found</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {activeHistoryTab === 'payments' && (
                <div className="space-y-4">
                  <h3 className="flex items-center gap-3 text-lg font-black text-slate-900 ml-2">
                    <Wallet size={20} className="text-violet-600" />
                    Payment History
                  </h3>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {history.payments.length > 0 ? (
                      history.payments.map((p, i) => (
                        <div key={p._id || i} className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm hover:shadow-xl transition-all">
                          <div className="flex justify-between items-start mb-4">
                            <div className="w-10 h-10 rounded-xl bg-violet-50 flex items-center justify-center text-violet-600">
                              <CreditCard size={20} />
                            </div>

                            <span className={`px-4 py-1 rounded-lg text-[9px] font-black uppercase ${getPaymentStatusClass(p.status)}`}>
                              {p.status || 'pending'}
                            </span>
                          </div>

                          <p className="text-sm font-black text-slate-800">
                            {p.type || 'Payment'} • ₹{p.amount || 0}
                          </p>
                          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-2">
                            Method: {p.payment_method || p.method || 'N/A'}
                          </p>

                          <div className="space-y-1 mt-3">
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter">
                              Date: {formatDateTime(p.date || p.created_at)}
                            </p>
                            {p.reference_id && (
                              <p className="text-[10px] text-[#5B7FED] font-black uppercase tracking-tighter break-all">
                                Ref: {p.reference_id}
                              </p>
                            )}
                          </div>

                          {p.description && (
                            <div className="mt-3 p-3 rounded-xl bg-slate-50 border border-slate-100">
                              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Description</p>
                              <p className="text-xs font-bold text-slate-700 mt-1">{p.description}</p>
                            </div>
                          )}
                        </div>
                      ))
                    ) : (
                      <div className="bg-slate-50/60 p-8 rounded-[2rem] border-2 border-dashed border-slate-100 flex flex-col items-center justify-center md:col-span-2">
                        <Wallet className="text-slate-300 mb-2" size={30} />
                        <p className="text-slate-400 font-black text-[10px] uppercase tracking-widest">No payment history found</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {activeHistoryTab === 'fines' && (
                <div className="space-y-4">
                  <h3 className="flex items-center gap-3 text-lg font-black text-slate-900 ml-2">
                    <ShieldAlert size={20} className="text-red-500" />
                    Administrative Flags
                  </h3>

                  <div className="space-y-3">
                    {history.fines.length > 0 ? (
                      history.fines.map((f, i) => (
                        <div key={f._id || i} className="bg-white p-6 rounded-[2rem] border-2 border-red-50 flex justify-between items-center shadow-lg">
                          <div className="flex items-center gap-5">
                            <div className="w-12 h-12 rounded-2xl bg-red-50 flex items-center justify-center text-red-500 font-black tracking-tighter">
                              !
                            </div>
                            <div>
                              <p className="text-sm font-black text-slate-800">{f.description || 'Fine / penalty entry'}</p>
                              <p className="text-[10px] text-red-400 font-bold uppercase mt-0.5">
                                ₹{f.amount || 0} • {formatDate(f.date)}
                              </p>
                            </div>
                          </div>

                          <span className={`px-5 py-2 rounded-xl text-[9px] font-black uppercase shadow-lg ${getFineStatusClass(f.status)}`}>
                            {f.status || 'unpaid'}
                          </span>
                        </div>
                      ))
                    ) : (
                      <div className="bg-emerald-50/30 p-8 rounded-[2rem] border-2 border-dashed border-emerald-100 flex flex-col items-center justify-center">
                        <CheckCircle className="text-emerald-400 mb-2" size={32} />
                        <p className="text-emerald-600 font-black text-[10px] uppercase tracking-widest">
                          Clean record • No Fines Found
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {isFineModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/90 backdrop-blur-md p-4">
          <Card className="w-full max-w-md bg-white rounded-[3.5rem] overflow-hidden relative shadow-2xl">
            <button
              onClick={() => setIsFineModalOpen(false)}
              className="absolute top-8 right-8 text-slate-400 hover:text-slate-900 bg-slate-50 p-2 rounded-full border border-slate-100"
            >
              <X size={20} />
            </button>

            <form onSubmit={handleMarkFine} className="p-10">
              <div className="w-16 h-16 bg-red-50 text-red-500 rounded-3xl flex items-center justify-center mx-auto mb-6 border border-red-100">
                <ShieldAlert size={32} />
              </div>

              <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tighter mb-2 text-center">
                Impose Fine
              </h2>

              <div className="space-y-4">
                <div className="relative group">
                  <IndianRupee className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-red-500 transition-colors" size={18} />
                  <input
                    type="number"
                    required
                    placeholder="Amount"
                    className="w-full pl-12 pr-4 py-4 bg-slate-50 border-none rounded-2xl text-sm font-bold focus:ring-2 focus:ring-red-100 outline-none"
                    value={fineData.amount}
                    onChange={(e) => setFineData({ ...fineData, amount: e.target.value })}
                  />
                </div>

                <textarea
                  required
                  placeholder="Reason for fine..."
                  className="w-full p-5 bg-slate-50 border-none rounded-2xl text-sm font-bold min-h-[120px] focus:ring-2 focus:ring-red-100 outline-none"
                  value={fineData.description}
                  onChange={(e) => setFineData({ ...fineData, description: e.target.value })}
                />
              </div>

              <Button
                type="submit"
                disabled={submittingFine}
                className="w-full mt-8 py-8 bg-red-500 hover:bg-red-600 text-white rounded-3xl font-black uppercase tracking-widest shadow-xl shadow-red-100 transition-all active:scale-95"
              >
                {submittingFine ? <Loader2 className="animate-spin" /> : 'Impose Disciplinary Fine'}
              </Button>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}
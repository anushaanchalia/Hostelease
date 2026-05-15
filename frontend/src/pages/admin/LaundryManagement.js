import React, { useEffect, useMemo, useState } from 'react';
import { Card } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import api from '../../utils/api';
import { toast } from 'sonner';
import {
  Shirt,
  CheckCircle,
  Clock,
  ExternalLink,
  Loader2,
  Search,
  Filter,
  MapPin,
  User,
  RefreshCw,
  Wrench,
  AlertTriangle,
  Settings,
  Wallet,
  Activity,
  Power,
  Building2,
  Download,
  FileText,
  Droplets,
  BarChart3,
  TimerReset
} from 'lucide-react';

const fallbackHostels = [
  'ALL BHAWANS',
  'Azad Bhawan',
  'Atal Bhawan',
  'Tagore Bhawan',
  'Shakuntala Bhawan',
  'Janaki Bhawan',
  'Teresa Bhawan'
];

const machineStatuses = ['all', 'idle', 'booked', 'running', 'offline', 'maintenance', 'needs_service'];
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

const getMachineStatusClass = (status) => {
  switch ((status || '').toLowerCase()) {
    case 'running':
      return 'bg-orange-100 text-orange-700';
    case 'booked':
      return 'bg-blue-100 text-blue-700';
    case 'idle':
      return 'bg-green-100 text-green-700';
    case 'offline':
      return 'bg-slate-200 text-slate-700';
    case 'maintenance':
    case 'needs_service':
      return 'bg-red-100 text-red-700';
    default:
      return 'bg-slate-100 text-slate-700';
  }
};

const getComplaintSlaClass = (hours) => {
  if (hours >= 48) return 'bg-red-100 text-red-700 border-red-200';
  if (hours >= 24) return 'bg-orange-100 text-orange-700 border-orange-200';
  return 'bg-emerald-100 text-emerald-700 border-emerald-200';
};

const buildSummaryFromMachines = (machineList = []) => {
  const statuses = machineList.map((m) => String(m.status || '').toLowerCase());

  return {
    total_machines: machineList.length,
    running: statuses.filter((s) => s === 'running').length,
    idle: statuses.filter((s) => s === 'idle').length,
    offline: statuses.filter((s) => s === 'offline').length,
    maintenance: statuses.filter((s) => ['maintenance', 'needs_service'].includes(s)).length,
    total_revenue: machineList.reduce((sum, item) => sum + Number(item.total_revenue || 0), 0),
    pending_refunds: 0
  };
};

const getHoursSince = (value) => {
  if (!value) return 0;
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return 0;
  return Math.max(0, Math.floor((Date.now() - dt.getTime()) / (1000 * 60 * 60)));
};

export default function LaundryManagement() {
  const [complaints, setComplaints] = useState([]);
  const [machines, setMachines] = useState([]);
  const [dashboard, setDashboard] = useState({
    summary: {
      total_machines: 0,
      running: 0,
      idle: 0,
      offline: 0,
      maintenance: 0,
      total_revenue: 0,
      pending_refunds: 0
    },
    machines: [],
    revenue_by_hostel: [],
    complaint_sla: {
      over_24h: 0,
      over_48h: 0
    }
  });

  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('ALL BHAWANS');
  const [searchTerm, setSearchTerm] = useState('');
  const [machineStatusFilter, setMachineStatusFilter] = useState('all');
  const [selectedBlock, setSelectedBlock] = useState('all');
  const [selectedDate, setSelectedDate] = useState('');

  useEffect(() => {
    loadAll();
  }, []);

  useEffect(() => {
    setSelectedBlock('all');
  }, [activeTab]);

  const loadAll = async () => {
    try {
      setLoading(true);
      await Promise.all([
        fetchLaundryComplaints(),
        fetchMachineDashboard(),
        fetchMachines()
      ]);
    } finally {
      setLoading(false);
    }
  };

  const fetchLaundryComplaints = async () => {
    try {
      const response = await api.get('/admin/laundry/complaints');
      const data = Array.isArray(response.data) ? response.data : [];
      const normalized = data.map((item) => ({
        ...item,
        hostel_name: normalizeHostel(item.hostel_name || item.hostel || 'N/A'),
        block: normalizeBlock(item.block || 'N/A'),
        room_number: item.room_number || 'N/A',
        type: String(item.type || (item.machine_code ? 'machine' : 'manual')).toLowerCase()
      }));
      setComplaints(normalized);
    } catch (error) {
      console.error('Error loading complaints:', error);
      toast.error('Complaint sync failed');
      setComplaints([]);
    }
  };

  const fetchMachineDashboard = async () => {
    try {
      const response = await api.get('/admin/laundry/health-dashboard');
      setDashboard(
        response.data || {
          summary: {
            total_machines: 0,
            running: 0,
            idle: 0,
            offline: 0,
            maintenance: 0,
            total_revenue: 0,
            pending_refunds: 0
          },
          machines: [],
          revenue_by_hostel: [],
          complaint_sla: {
            over_24h: 0,
            over_48h: 0
          }
        }
      );
    } catch (error) {
      console.error('Error loading dashboard:', error);
      toast.error('Failed to load machine health dashboard');
    }
  };

  const fetchMachines = async () => {
    try {
      const response = await api.get('/admin/laundry/machines');
      const data = Array.isArray(response.data) ? response.data : [];
      const normalized = data.map((item) => ({
        ...item,
        hostel_name: normalizeHostel(item.hostel_name || 'N/A'),
        block: normalizeBlock(item.block || 'N/A')
      }));
      setMachines(normalized);
    } catch (error) {
      console.error('Error loading machines:', error);
      toast.error('Machine sync failed');
      setMachines([]);
    }
  };

  const handleMarkCompleted = async (id) => {
    try {
      await api.put(`/admin/laundry/complaint/${id}`);
      toast.success('Complaint marked resolved');
      await Promise.all([fetchLaundryComplaints(), fetchMachineDashboard(), fetchMachines()]);
    } catch (error) {
      console.error(error);
      toast.error('Complaint update failed');
    }
  };

  const updateMachineStatus = async (machineCode, status) => {
    try {
      await api.patch(`/admin/laundry/machine/${machineCode}`, {
        status,
        note: ''
      });
      toast.success(`${machineCode} updated to ${status}`);
      await Promise.all([fetchMachineDashboard(), fetchMachines()]);
    } catch (error) {
      console.error(error);
      toast.error(error.response?.data?.detail || 'Machine status update failed');
    }
  };

  const exportRevenueReport = async (format) => {
    try {
      const params = new URLSearchParams();
      params.append('format', format);
      params.append('hostel', activeTab === 'ALL BHAWANS' ? 'all' : activeTab);
      params.append('block', selectedBlock);

      if (selectedDate) {
        params.append('date', selectedDate);
      }

      const response = await api.get(`/admin/laundry/export-usage?${params.toString()}`);
      const fileUrl = response.data?.file_url || response.data?.pdf_url;

      if (fileUrl) {
        window.open(`${backendUrl}${fileUrl}`, '_blank');
        toast.success(`${format.toUpperCase()} export generated`);
      } else {
        toast.error('Export failed');
      }
    } catch (error) {
      console.error(error);
      toast.error('Failed to export machine revenue / usage report');
    }
  };

  const effectiveSummary = useMemo(() => {
    const apiSummary = dashboard.summary || {};
    const totalMachines = Number(apiSummary.total_machines || 0);
    if (totalMachines > 0) return apiSummary;
    return buildSummaryFromMachines(machines);
  }, [dashboard.summary, machines]);

  const hostelRevenueChart = useMemo(() => {
    const fixedHostels = fallbackHostels.slice(1);

    const revenueMap = {};
    const apiRevenue = Array.isArray(dashboard?.revenue_by_hostel) ? dashboard.revenue_by_hostel : [];

    apiRevenue.forEach((item) => {
      const hostelName = normalizeHostel(item?.hostel_name || item?.hostel || '');
      revenueMap[hostelName] = Number(item?.revenue || 0);
    });

    const merged = fixedHostels.map((hostel) => ({
      hostel_name: hostel,
      revenue: Number(revenueMap[hostel] || 0)
    }));

    const extras = apiRevenue
      .map((item) => ({
        hostel_name: normalizeHostel(item?.hostel_name || item?.hostel || ''),
        revenue: Number(item?.revenue || 0)
      }))
      .filter(
        (item) =>
          item.hostel_name &&
          item.hostel_name !== 'N/A' &&
          !fixedHostels.includes(item.hostel_name)
      );

    const finalRows = [...merged, ...extras];
    const maxRevenue = Math.max(...finalRows.map((item) => Number(item.revenue || 0)), 0);

    return finalRows.map((item) => ({
      ...item,
      percent: maxRevenue > 0 ? (Number(item.revenue || 0) / maxRevenue) * 100 : 0
    }));
  }, [dashboard]);

  const hostelTabs = useMemo(() => {
    const guaranteed = fallbackHostels.slice(1);

    const machineHostels = machines.map((m) => normalizeHostel(m.hostel_name));
    const complaintHostels = complaints.map((c) => normalizeHostel(c.hostel_name));
    const combined = [...machineHostels, ...complaintHostels];
    const unique = Array.from(new Set(combined.filter((h) => h && h !== 'N/A')));

    const ordered = guaranteed.filter((hostel) => unique.includes(hostel));
    const missingGuaranteed = guaranteed.filter((hostel) => !ordered.includes(hostel));
    const extras = unique.filter((hostel) => !guaranteed.includes(hostel));

    return ['ALL BHAWANS', ...ordered, ...missingGuaranteed, ...extras];
  }, [machines, complaints]);

  const filteredComplaints = useMemo(() => {
    return complaints.filter((item) => {
      const enrollment = String(item.enrollment_number || item.enrollment || item.student_id || '').toLowerCase();
      const q = searchTerm.toLowerCase().trim();

      const matchesSearch =
        !q ||
        String(item.student_name || '').toLowerCase().includes(q) ||
        enrollment.includes(q) ||
        String(item.machine_code || '').toLowerCase().includes(q) ||
        String(item.hostel_name || '').toLowerCase().includes(q) ||
        String(item.block || '').toLowerCase().includes(q) ||
        String(item.room_number || '').toLowerCase().includes(q) ||
        String(item.type || '').toLowerCase().includes(q);

      if (!matchesSearch) return false;

      if (activeTab === 'ALL BHAWANS') return true;

      return normalizeCompare(item.hostel_name || item.hostel || '') === normalizeCompare(activeTab);
    });
  }, [complaints, searchTerm, activeTab]);

  const filteredMachines = useMemo(() => {
    return machines.filter((machine) => {
      const matchesHostel =
        activeTab === 'ALL BHAWANS' ||
        normalizeCompare(machine.hostel_name) === normalizeCompare(activeTab);

      const matchesStatus =
        machineStatusFilter === 'all' ||
        String(machine.status || '').toLowerCase() === machineStatusFilter.toLowerCase();

      const matchesBlock =
        selectedBlock === 'all' ||
        normalizeBlock(machine.block || '') === normalizeBlock(selectedBlock);

      const q = searchTerm.toLowerCase().trim();
      const matchesSearch =
        !q ||
        String(machine.machine_code || '').toLowerCase().includes(q) ||
        String(machine.location_label || '').toLowerCase().includes(q) ||
        String(machine.hostel_name || '').toLowerCase().includes(q) ||
        String(machine.machine_type || '').toLowerCase().includes(q) ||
        String(machine.block || '').toLowerCase().includes(q);

      return matchesHostel && matchesStatus && matchesBlock && matchesSearch;
    });
  }, [machines, activeTab, machineStatusFilter, selectedBlock, searchTerm]);

  const blockOptions = useMemo(() => {
    const source =
      activeTab === 'ALL BHAWANS'
        ? machines
        : machines.filter((m) => normalizeCompare(m.hostel_name) === normalizeCompare(activeTab));

    const set = new Set(source.map((m) => normalizeBlock(m.block || '')).filter((b) => b && b !== 'N/A'));
    return ['all', ...Array.from(set).sort()];
  }, [machines, activeTab]);

  const repeatIssueMachines = useMemo(() => {
    return filteredMachines.filter(
      (m) => Number(m.complaint_count_7d || 0) >= 3 || Number(m.complaint_count_30d || 0) >= 5
    );
  }, [filteredMachines]);

  const complaintSla = useMemo(() => {
    return dashboard?.complaint_sla || { over_24h: 0, over_48h: 0 };
  }, [dashboard]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px]">
        <Loader2 className="animate-spin text-[#5B7FED] mb-4" size={40} />
        <p className="text-slate-400 font-black uppercase tracking-widest text-[10px]">
          Syncing smart laundry control center
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 fade-in pb-12">
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 flex items-center justify-center text-emerald-500 shadow-sm border border-emerald-100">
            <Shirt size={26} />
          </div>
          <div>
            <h1 className="text-3xl font-black text-slate-900 tracking-tight leading-none text-left">
              Laundry Management
            </h1>
            <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mt-2 text-left tracking-[0.1em]">
              Smart machine inventory, complaints, revenue and service dashboard
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <Button
            variant="outline"
            onClick={loadAll}
            className="rounded-xl border-slate-200 text-slate-500 font-bold text-xs gap-2 h-10 px-4"
          >
            <RefreshCw size={14} /> Sync Records
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-7 gap-4">
        <Card className="p-5 bg-white rounded-2xl border-none shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Total Machines</p>
              <h3 className="text-2xl font-black text-slate-900 mt-2">{effectiveSummary.total_machines || 0}</h3>
            </div>
            <div className="w-11 h-11 rounded-2xl bg-blue-50 text-blue-500 border border-blue-100 flex items-center justify-center">
              <Shirt size={20} />
            </div>
          </div>
        </Card>

        <Card className="p-5 bg-white rounded-2xl border-none shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Running</p>
              <h3 className="text-2xl font-black text-slate-900 mt-2">{effectiveSummary.running || 0}</h3>
            </div>
            <div className="w-11 h-11 rounded-2xl bg-orange-50 text-orange-500 border border-orange-100 flex items-center justify-center">
              <Activity size={20} />
            </div>
          </div>
        </Card>

        <Card className="p-5 bg-white rounded-2xl border-none shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Idle</p>
              <h3 className="text-2xl font-black text-slate-900 mt-2">{effectiveSummary.idle || 0}</h3>
            </div>
            <div className="w-11 h-11 rounded-2xl bg-green-50 text-green-500 border border-green-100 flex items-center justify-center">
              <CheckCircle size={20} />
            </div>
          </div>
        </Card>

        <Card className="p-5 bg-white rounded-2xl border-none shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Offline</p>
              <h3 className="text-2xl font-black text-slate-900 mt-2">{effectiveSummary.offline || 0}</h3>
            </div>
            <div className="w-11 h-11 rounded-2xl bg-slate-100 text-slate-600 border border-slate-200 flex items-center justify-center">
              <Power size={20} />
            </div>
          </div>
        </Card>

        <Card className="p-5 bg-white rounded-2xl border-none shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Needs Service</p>
              <h3 className="text-2xl font-black text-slate-900 mt-2">{effectiveSummary.maintenance || 0}</h3>
            </div>
            <div className="w-11 h-11 rounded-2xl bg-red-50 text-red-500 border border-red-100 flex items-center justify-center">
              <Wrench size={20} />
            </div>
          </div>
        </Card>

        <Card className="p-5 bg-white rounded-2xl border-none shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Revenue</p>
              <h3 className="text-2xl font-black text-slate-900 mt-2">₹{Number(effectiveSummary.total_revenue || 0).toFixed(0)}</h3>
            </div>
            <div className="w-11 h-11 rounded-2xl bg-violet-50 text-violet-500 border border-violet-100 flex items-center justify-center">
              <Wallet size={20} />
            </div>
          </div>
        </Card>

        <Card className="p-5 bg-white rounded-2xl border-none shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Pending Refunds</p>
              <h3 className="text-2xl font-black text-slate-900 mt-2">{Number(effectiveSummary.pending_refunds || 0)}</h3>
            </div>
            <div className="w-11 h-11 rounded-2xl bg-amber-50 text-amber-500 border border-amber-100 flex items-center justify-center">
              <FileText size={20} />
            </div>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[0.9fr_1.1fr] gap-6">
        <Card className="p-5 bg-white rounded-2xl border-none shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <TimerReset className="text-orange-500" size={18} />
            <h2 className="text-[15px] font-black uppercase tracking-widest text-slate-900">
              Complaint SLA
            </h2>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-2xl bg-slate-50 border border-slate-100 p-4">
              <p className="text-xs font-black text-slate-500 uppercase tracking-widest">Pending 24h+</p>
              <h3 className="text-4xl font-black text-orange-500 mt-2">{Number(complaintSla.over_24h || 0)}</h3>
            </div>

            <div className="rounded-2xl bg-slate-50 border border-slate-100 p-4">
              <p className="text-xs font-black text-slate-500 uppercase tracking-widest">Pending 48h+</p>
              <h3 className="text-4xl font-black text-red-500 mt-2">{Number(complaintSla.over_48h || 0)}</h3>
            </div>
          </div>
        </Card>

        <Card className="p-5 bg-white rounded-2xl border-none shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="text-[#5B7FED]" size={18} />
            <h2 className="text-[15px] font-black uppercase tracking-widest text-slate-900">
              Hostel Revenue Chart
            </h2>
          </div>

          <div className="space-y-4">
            {hostelRevenueChart.map((item) => (
              <div key={item.hostel_name}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[13px] font-black text-slate-700">
                    {item.hostel_name}
                  </span>
                  <span className="text-[13px] font-black text-emerald-600">
                    ₹{Number(item.revenue || 0).toFixed(0)}
                  </span>
                </div>

                <div className="w-full h-3 rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className="h-3 rounded-full bg-gradient-to-r from-[#5B7FED] to-[#10B981] transition-all duration-500"
                    style={{
                      width: `${item.percent}%`,
                      minWidth: item.percent > 0 ? '12px' : '0px'
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="flex bg-slate-100/50 p-1.5 rounded-2xl w-fit border border-slate-200/50 overflow-x-auto max-w-full no-scrollbar shadow-inner">
        {hostelTabs.map((hostel) => (
          <button
            key={hostel}
            onClick={() => setActiveTab(hostel)}
            className={`px-5 py-2.5 rounded-xl text-[10px] font-black transition-all uppercase tracking-widest whitespace-nowrap ${
              activeTab === hostel
                ? 'bg-white text-[#5B7FED] shadow-md border border-slate-100'
                : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            {hostel}
          </button>
        ))}
      </div>

      <Card className="p-5 bg-white rounded-2xl shadow-sm border-none">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
          <div className="relative group min-w-[280px] max-w-[380px] w-full">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-[#5B7FED]" size={16} />
            <input
              type="text"
              placeholder="Search machine / student / hostel..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-11 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold w-full outline-none focus:ring-4 focus:ring-blue-50 transition-all"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="relative">
              <Settings className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
              <select
                value={machineStatusFilter}
                onChange={(e) => setMachineStatusFilter(e.target.value)}
                className="pl-9 pr-8 py-3 bg-slate-50 border-none rounded-xl text-[11px] font-black uppercase text-slate-600 outline-none cursor-pointer appearance-none shadow-sm"
              >
                {machineStatuses.map((status) => (
                  <option key={status} value={status}>
                    {status === 'all' ? 'All Status' : status}
                  </option>
                ))}
              </select>
            </div>

            <div className="relative">
              <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
              <select
                value={selectedBlock}
                onChange={(e) => setSelectedBlock(e.target.value)}
                className="pl-9 pr-8 py-3 bg-slate-50 border-none rounded-xl text-[11px] font-black uppercase text-slate-600 outline-none cursor-pointer appearance-none shadow-sm"
              >
                {blockOptions.map((block) => (
                  <option key={block} value={block}>
                    {block === 'all' ? 'All Blocks' : `Block ${block}`}
                  </option>
                ))}
              </select>
            </div>

            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="px-4 py-3 bg-slate-50 border-none rounded-xl text-sm"
            />

            <Button onClick={() => exportRevenueReport('pdf')} className="bg-[#10B981] hover:bg-emerald-600 text-white rounded-xl">
              <Download size={16} /> Export PDF
            </Button>

            <Button onClick={() => exportRevenueReport('csv')} className="bg-slate-900 hover:bg-slate-800 text-white rounded-xl">
              <FileText size={16} /> Export CSV
            </Button>
          </div>
        </div>
      </Card>

      {repeatIssueMachines.length > 0 && (
        <Card className="p-5 bg-red-50 rounded-2xl border border-red-100 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="text-red-500" size={18} />
            <h2 className="text-lg font-black text-red-700">Repeat Issue Detection</h2>
          </div>

          <div className="flex flex-wrap gap-2">
            {repeatIssueMachines.map((machine) => (
              <span
                key={machine._id}
                className="px-4 py-2 rounded-xl bg-white text-red-600 border border-red-100 font-black text-xs"
              >
                {machine.machine_code} • {machine.hostel_name} • Block {machine.block} • 7d: {machine.complaint_count_7d || 0} • 30d: {machine.complaint_count_30d || 0}
              </span>
            ))}
          </div>
        </Card>
      )}

      <Card className="overflow-hidden border-none shadow-2xl shadow-slate-200/40 rounded-[2.5rem] bg-white">
        <div className="p-6 border-b border-slate-100">
          <h2 className="text-xl font-black text-slate-900">Machine Inventory by Hostel and Block</h2>
          <p className="text-sm text-slate-500 mt-1">Washer and dryer inventory, health, revenue, utilization and complaint count</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-900 text-white">
                <th className="px-8 py-7 text-[10px] font-black uppercase tracking-widest">Machine</th>
                <th className="px-6 py-7 text-[10px] font-black uppercase tracking-widest">Location</th>
                <th className="px-6 py-7 text-[10px] font-black uppercase tracking-widest text-center">Health</th>
                <th className="px-6 py-7 text-[10px] font-black uppercase tracking-widest text-center">Cycles / Revenue</th>
                <th className="px-6 py-7 text-[10px] font-black uppercase tracking-widest text-center">Utilization / Last Used</th>
                <th className="px-8 py-7 text-[10px] font-black uppercase tracking-widest text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filteredMachines.length > 0 ? (
                filteredMachines.map((machine) => (
                  <tr key={machine._id} className="hover:bg-slate-50/30 transition-colors group">
                    <td className="px-8 py-6">
                      <div className="flex items-center gap-4">
                        <div className="w-11 h-11 rounded-2xl bg-blue-50 flex items-center justify-center text-[#5B7FED] border border-blue-100 shadow-sm">
                          {(machine.machine_type || '').toLowerCase() === 'dryer' ? <Droplets size={18} /> : <Shirt size={18} />}
                        </div>
                        <div>
                          <div className="font-black text-slate-900 text-[14px]">{machine.machine_code}</div>
                          <div className="text-[11px] font-black text-[#5B7FED] uppercase tracking-wider mt-1">
                            {machine.machine_type || 'washer'}
                          </div>
                        </div>
                      </div>
                    </td>

                    <td className="px-6 py-6">
                      <div className="flex flex-col gap-1">
                        <span className="text-[12px] font-black text-slate-700 leading-none">
                          {normalizeHostel(machine.hostel_name)}
                        </span>
                        <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-black uppercase tracking-tighter">
                          <MapPin size={10} className="text-emerald-500 shrink-0" />
                          <span>BLOCK: {machine.block || 'A'}</span>
                          <span className="text-slate-200">|</span>
                          <span>{machine.location_label || 'Laundry Room'}</span>
                        </div>
                      </div>
                    </td>

                    <td className="px-6 py-6 text-center">
                      <div className="flex flex-col items-center gap-2">
                        <span className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest inline-flex items-center gap-2 ${getMachineStatusClass(machine.status)}`}>
                          {String(machine.status || '').replaceAll('_', ' ')}
                        </span>
                        <span className="text-[10px] font-bold text-red-500">
                          Complaints: {machine.complaint_count_7d || 0} / 7d
                        </span>
                      </div>
                    </td>

                    <td className="px-6 py-6 text-center">
                      <div className="space-y-1">
                        <div className="text-[12px] font-black text-slate-800">
                          {machine.total_cycles || 0} cycles
                        </div>
                        <div className="text-[11px] font-black text-emerald-600">
                          ₹{machine.total_revenue || 0}
                        </div>
                      </div>
                    </td>

                    <td className="px-6 py-6 text-center">
                      <div className="space-y-1">
                        <div className="text-[12px] font-black text-slate-800">
                          {Number(machine.utilization_percentage || 0).toFixed(1)}%
                        </div>
                        <div className="text-[10px] font-bold text-slate-500">
                          {machine.last_used_at ? new Date(machine.last_used_at).toLocaleString() : 'Never used'}
                        </div>
                      </div>
                    </td>

                    <td className="px-8 py-6 text-center">
                      <select
                        value={machine.status || 'idle'}
                        onChange={(e) => updateMachineStatus(machine.machine_code, e.target.value)}
                        className="bg-white border-2 border-slate-100 rounded-xl px-4 py-2.5 text-[10px] font-black text-slate-700 outline-none focus:ring-4 focus:ring-blue-50 transition-all cursor-pointer shadow-sm"
                      >
                        <option value="idle">IDLE</option>
                        <option value="booked">BOOKED</option>
                        <option value="running">RUNNING</option>
                        <option value="offline">OFFLINE</option>
                        <option value="maintenance">MAINTENANCE</option>
                        <option value="needs_service">NEEDS SERVICE</option>
                      </select>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="6" className="py-24 text-center">
                    <div className="flex flex-col items-center justify-center opacity-20">
                      <Filter size={48} className="text-slate-400 mb-4" />
                      <p className="text-sm font-black uppercase tracking-widest text-slate-500">
                        No machine data found for {activeTab}
                      </p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="overflow-hidden border-none shadow-2xl shadow-slate-200/40 rounded-[2.5rem] bg-white">
        <div className="p-6 border-b border-slate-100">
          <h2 className="text-xl font-black text-slate-900">Manual Laundry & Machine Complaint Panel</h2>
          <p className="text-sm text-slate-500 mt-1">Student laundry issues, machine-linked complaints and proof review</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-900 text-white">
                <th className="px-8 py-7 text-[10px] font-black uppercase tracking-widest">Student Details</th>
                <th className="px-6 py-7 text-[10px] font-black uppercase tracking-widest">Residency / Machine</th>
                <th className="px-6 py-7 text-[10px] font-black uppercase tracking-widest">Problem Note</th>
                <th className="px-6 py-7 text-[10px] font-black uppercase tracking-widest text-center">SLA</th>
                <th className="px-6 py-7 text-[10px] font-black uppercase tracking-widest text-center">Proof</th>
                <th className="px-6 py-7 text-[10px] font-black uppercase tracking-widest text-center">Status</th>
                <th className="px-8 py-7 text-[10px] font-black uppercase tracking-widest text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filteredComplaints.length > 0 ? (
                filteredComplaints.map((item) => {
                  const hoursOpen = item.status === 'completed' ? 0 : getHoursSince(item.date);

                  return (
                    <tr key={item._id} className="hover:bg-slate-50/30 transition-colors group">
                      <td className="px-8 py-6">
                        <div className="flex items-center gap-4">
                          <div className="w-11 h-11 rounded-2xl bg-blue-50 flex items-center justify-center text-[#5B7FED] border border-blue-100 shadow-sm">
                            <User size={18} />
                          </div>
                          <div>
                            <div className="font-black text-slate-900 text-[14px] capitalize leading-none mb-1">
                              {item.student_name || 'N/A'}
                            </div>
                            <div className="text-[11px] font-black text-[#5B7FED] uppercase tracking-wider mt-1 font-mono">
                              ID: {item.enrollment_number || item.enrollment || item.student_id || 'N/A'}
                            </div>
                            <div className="text-[10px] font-black text-orange-500 uppercase tracking-wider mt-1">
                              Type: {String(item.type || 'manual').replaceAll('_', ' ')}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="px-6 py-6">
                        <div className="flex flex-col gap-1">
                          <span className="text-[12px] font-black text-slate-700 leading-none">
                            {normalizeHostel(item.hostel_name || item.hostel)}
                          </span>
                          <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-black uppercase tracking-tighter">
                            <MapPin size={10} className="text-emerald-500 shrink-0" />
                            <span>BLOCK: {item.block || 'N/A'}</span>
                            <span className="text-slate-200">|</span>
                            <span>ROOM: {item.room_number || 'N/A'}</span>
                          </div>
                          <div className="text-[10px] font-black text-red-500 uppercase tracking-widest mt-1">
                            Machine: {item.machine_code || 'MANUAL / GENERAL'}
                          </div>
                        </div>
                      </td>

                      <td className="px-6 py-6 min-w-[250px] max-w-[350px]">
                        <div className="bg-slate-50/50 p-4 rounded-xl border border-slate-100 shadow-inner">
                          <p className="text-[12px] font-semibold text-slate-700 leading-relaxed italic">
                            "{item.description}"
                          </p>
                        </div>
                      </td>

                      <td className="px-6 py-6 text-center">
                        {item.status === 'completed' ? (
                          <span className="px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest inline-flex items-center gap-2 bg-emerald-100 text-emerald-700 border border-emerald-200">
                            Closed
                          </span>
                        ) : (
                          <span className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest inline-flex items-center gap-2 border ${getComplaintSlaClass(hoursOpen)}`}>
                            {hoursOpen >= 48 ? '48H+' : hoursOpen >= 24 ? '24H+' : `${hoursOpen}H`}
                          </span>
                        )}
                      </td>

                      <td className="px-6 py-6 text-center">
                        {item.image_url ? (
                          <button
                            onClick={() => {
                              const path = item.image_url.startsWith('/') ? item.image_url : `/${item.image_url}`;
                              window.open(`${backendUrl}${path}`, '_blank');
                            }}
                            className="inline-flex items-center gap-2 text-[9px] font-black uppercase text-[#5B7FED] hover:underline bg-blue-50/50 px-4 py-2 rounded-xl border border-blue-100"
                          >
                            <ExternalLink size={11} /> View Proof
                          </button>
                        ) : (
                          <span className="text-[9px] font-black text-slate-300 uppercase italic">No Proof</span>
                        )}
                      </td>

                      <td className="px-6 py-6 text-center">
                        <span className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest inline-flex items-center gap-2 ${
                          item.status === 'completed'
                            ? 'bg-emerald-100 text-emerald-600'
                            : 'bg-orange-50 text-orange-500 border border-orange-100'
                        }`}>
                          {item.status === 'completed' ? <CheckCircle size={10} /> : <Clock size={10} />}
                          {item.status}
                        </span>
                      </td>

                      <td className="px-8 py-6">
                        <div className="flex justify-center">
                          {item.status !== 'completed' ? (
                            <Button
                              onClick={() => handleMarkCompleted(item._id)}
                              className="bg-[#10B981] hover:bg-emerald-600 text-white rounded-xl text-[10px] font-black uppercase px-4 py-2.5 h-auto shadow-md transition-all active:scale-95 whitespace-nowrap"
                            >
                              Resolve
                            </Button>
                          ) : (
                            <div className="text-[9px] font-black text-slate-300 uppercase tracking-widest">Logged</div>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan="7" className="py-24 text-center">
                    <div className="flex flex-col items-center justify-center opacity-20">
                      <Filter size={48} className="text-slate-400 mb-4" />
                      <p className="text-sm font-black uppercase tracking-widest text-slate-500">
                        No complaint data found for {activeTab}
                      </p>
                    </div>
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
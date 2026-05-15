import React, { useState, useEffect, useMemo } from 'react';
import { Card } from '../../components/ui/card';
import {
  Home,
  User,
  Loader2,
  Building2,
  MapPin,
  ArrowRight,
  X,
  TrendingUp,
  PieChart,
  LayoutGrid,
  RefreshCw,
  BedDouble,
  Search,
  Layers3,
  Snowflake,
  CheckCircle2,
  Wrench,
  Copy,
  Phone,
  Mail,
  Users,
  Filter,
  CircleDashed,
  Download,
  AlertTriangle,
  MoveRight,
  FileText,
  BarChart3
} from 'lucide-react';
import api from '../../utils/api';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

const fallbackHostels = [
  'Azad Bhawan',
  'Atal Bhawan',
  'Tagore Bhawan',
  'Shakuntala Bhawan',
  'Janaki Bhawan',
  'Teresa Bhawan'
];

const normalizeHostel = (value = '') => {
  const cleaned = String(value || '').trim();
  if (!cleaned) return 'N/A';
  const key = cleaned.toLowerCase().replace(/\s+/g, ' ').trim();

  const aliases = {
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

  return aliases[key] || cleaned;
};

const normalizeBlock = (value = '') => {
  const raw = String(value || '').trim().toUpperCase();
  if (!raw) return 'A';
  return raw.replace(/^BLOCK\s+/i, '').trim();
};

const normalizeFloor = (value) => {
  const stringValue = String(value ?? '').trim();
  if (!stringValue) return '1';
  return stringValue;
};

const getStrictAcFlag = (room = {}) => {
  const roomType = String(room.room_type || room.type || '').trim().toLowerCase();
  const acType = String(room.ac_type || '').trim().toLowerCase();
  const cooling = String(room.cooling || '').trim().toLowerCase();

  if (room.is_ac === true) return true;
  if (room.is_ac === false) return false;

  if (acType === 'ac') return true;
  if (acType === 'non-ac' || acType === 'non ac') return false;

  if (cooling === 'ac') return true;
  if (cooling === 'non-ac' || cooling === 'non ac') return false;

  if (roomType === 'ac') return true;
  if (roomType === 'non-ac' || roomType === 'non ac') return false;

  if (roomType.includes('non-ac') || roomType.includes('non ac')) return false;
  if (roomType.includes('ac room')) return true;
  if (roomType.startsWith('ac ')) return true;
  if (roomType.endsWith(' ac')) return true;

  return false;
};

const getDisplayRoomType = (room = {}) => {
  const raw = String(room.room_type || room.type || 'standard').trim();
  return raw || 'standard';
};

const normalizeRoom = (room = {}, index = 0) => {
  const hostel = normalizeHostel(room.hostel || room.hostel_name || room.bhawan || '');
  const block = normalizeBlock(room.block || room.wing || 'A');
  const floor = normalizeFloor(room.floor || room.level || 1);
  const number = String(room.number || room.room_number || `R-${index + 1}`).trim();

  const capacity = Number(room.capacity || room.total_beds || 2) || 2;
  const occupancyCount = Number(
    room.occupancy_count ?? room.occupied_count ?? room.residents?.length ?? 0
  ) || 0;

  return {
    ...room,
    _id: room._id || `${hostel}-${block}-${floor}-${number}-${index}`,
    hostel,
    block,
    floor,
    number,
    status: String(
      room.status ||
        (occupancyCount >= capacity ? 'occupied' : occupancyCount > 0 ? 'partial' : 'available')
    ).toLowerCase(),
    studentName: room.studentName || room.student_name || 'Resident',
    capacity,
    occupancy_count: occupancyCount,
    room_type: getDisplayRoomType(room),
    is_ac: getStrictAcFlag(room),
    residents: Array.isArray(room.residents) ? room.residents : [],
    empty_beds: Array.isArray(room.empty_beds) ? room.empty_beds : [],
    occupied_beds: Array.isArray(room.occupied_beds) ? room.occupied_beds : [],
    alerts: Array.isArray(room.alerts) ? room.alerts : [],
    fine_count: Number(room.fine_count || 0),
    complaint_count: Number(room.complaint_count || 0),
    maintenance_note: room.maintenance_note || '',
    maintenance_expected_reopen: room.maintenance_expected_reopen || null,
    last_updated_at: room.last_updated_at || null
  };
};

const getRoomStatusClass = (status) => {
  const s = String(status || '').toLowerCase();
  if (s === 'occupied' || s === 'full') return 'bg-red-100 text-red-600';
  if (s === 'partial') return 'bg-blue-100 text-[#5B7FED]';
  if (s === 'maintenance' || s === 'blocked') return 'bg-amber-100 text-amber-700';
  return 'bg-emerald-100 text-emerald-600';
};

const getRoomBorderClass = (status) => {
  const s = String(status || '').toLowerCase();
  if (s === 'occupied' || s === 'full') return 'bg-white border-none shadow-xl shadow-slate-200/50 hover:shadow-red-100/50';
  if (s === 'partial') return 'bg-white border-none shadow-xl shadow-slate-200/50 hover:shadow-blue-100/50';
  if (s === 'maintenance' || s === 'blocked') return 'bg-amber-50/40 border-2 border-dashed border-amber-200 hover:bg-amber-50';
  return 'bg-emerald-50/30 border-2 border-dashed border-emerald-100/50 hover:bg-emerald-50';
};

const getRoomAccentClass = (status) => {
  const s = String(status || '').toLowerCase();
  if (s === 'occupied' || s === 'full') return 'bg-red-400';
  if (s === 'partial') return 'bg-[#5B7FED]';
  if (s === 'maintenance' || s === 'blocked') return 'bg-amber-400';
  return 'bg-emerald-400';
};

const getRoomStatusLabel = (room) => {
  const status = String(room.status || '').toLowerCase();
  if (status === 'maintenance') return 'MAINTENANCE';
  if (status === 'blocked') return 'BLOCKED';
  if (status === 'occupied' || room.occupancy_count >= room.capacity) return 'FULL';
  if (status === 'partial') return `${room.occupancy_count}/${room.capacity} OCCUPIED`;
  return 'AVAILABLE';
};

export default function LiveRoomMap() {
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedHostel, setSelectedHostel] = useState('Azad Bhawan');
  const [selectedBlock, setSelectedBlock] = useState('A');
  const [selectedFloor, setSelectedFloor] = useState('1');
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [showProfile, setShowProfile] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [acFilter, setAcFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const [trend, setTrend] = useState([]);
  const [trendLoading, setTrendLoading] = useState(false);

  const [showMaintenanceModal, setShowMaintenanceModal] = useState(false);
  const [maintenanceForm, setMaintenanceForm] = useState({
    status: 'maintenance',
    note: '',
    expected_reopen: ''
  });
  const [maintenanceSaving, setMaintenanceSaving] = useState(false);

  const [showShiftModal, setShowShiftModal] = useState(false);
  const [selectedResident, setSelectedResident] = useState(null);
  const [shiftForm, setShiftForm] = useState({
    target_hostel: '',
    target_block: '',
    target_floor: '',
    target_room_number: '',
    target_bed_number: ''
  });
  const [shiftSaving, setShiftSaving] = useState(false);

  const navigate = useNavigate();

  useEffect(() => {
    fetchRoomData();
  }, []);

  useEffect(() => {
    fetchTrend();
  }, [selectedHostel, selectedBlock, selectedFloor]);

  const fetchRoomData = async () => {
    try {
      setLoading(true);
      const response = await api.get('/admin/rooms/live-status');
      const data = Array.isArray(response.data) ? response.data : [];
      const normalized = data.map((room, index) => normalizeRoom(room, index));
      setRooms(normalized);
    } catch (err) {
      console.error('Fetch error:', err);
      toast.error('Failed to load room map');
      setRooms([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchTrend = async () => {
    try {
      setTrendLoading(true);
      const res = await api.get('/admin/rooms/occupancy-trend', {
        params: {
          hostel: selectedHostel,
          block: selectedBlock,
          floor: selectedFloor,
          days: 14
        }
      });
      setTrend(Array.isArray(res.data?.trend) ? res.data.trend : []);
    } catch (err) {
      setTrend([]);
    } finally {
      setTrendLoading(false);
    }
  };

  const exportCurrentView = async () => {
    try {
      const res = await api.get('/admin/rooms/export', {
        params: {
          hostel: selectedHostel,
          block: selectedBlock,
          floor: selectedFloor,
          ac_filter: acFilter,
          status_filter: statusFilter,
          search: searchTerm
        }
      });
      const backendUrl = process.env.REACT_APP_BACKEND_URL || 'http://127.0.0.1:8000';
      if (res.data?.file_url) {
        window.open(`${backendUrl}${res.data.file_url}`, '_blank');
        toast.success('Room export generated');
      } else {
        toast.error('Export failed');
      }
    } catch (err) {
      toast.error('Export failed');
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

  const hostels = useMemo(() => {
    const fromData = Array.from(new Set(rooms.map((r) => normalizeHostel(r.hostel)).filter(Boolean)));
    const ordered = fallbackHostels.filter((h) => fromData.includes(h));
    const missing = fallbackHostels.filter((h) => !ordered.includes(h));
    const extras = fromData.filter((h) => !fallbackHostels.includes(h));
    return [...ordered, ...missing, ...extras];
  }, [rooms]);

  useEffect(() => {
    if (!hostels.includes(selectedHostel) && hostels.length > 0) {
      setSelectedHostel(hostels[0]);
    }
  }, [hostels, selectedHostel]);

  const availableBlocksForHostel = useMemo(() => {
    const blocks = new Set(
      rooms
        .filter((r) => normalizeHostel(r.hostel) === normalizeHostel(selectedHostel))
        .map((r) => normalizeBlock(r.block))
        .filter(Boolean)
    );

    const ordered = ['A', 'B', 'C'].filter((b) => blocks.has(b));
    const extras = Array.from(blocks).filter((b) => !ordered.includes(b)).sort();
    const combined = [...ordered, ...extras];
    return combined.length > 0 ? combined : ['A', 'B', 'C'];
  }, [rooms, selectedHostel]);

  useEffect(() => {
    if (!availableBlocksForHostel.includes(selectedBlock)) {
      setSelectedBlock(availableBlocksForHostel[0] || 'A');
    }
  }, [availableBlocksForHostel, selectedBlock]);

  const availableFloorsForSelection = useMemo(() => {
    const floors = new Set(
      rooms
        .filter(
          (r) =>
            normalizeHostel(r.hostel) === normalizeHostel(selectedHostel) &&
            normalizeBlock(r.block) === normalizeBlock(selectedBlock)
        )
        .map((r) => normalizeFloor(r.floor))
        .filter(Boolean)
    );

    const sorted = Array.from(floors).sort((a, b) => Number(a) - Number(b));
    return sorted.length > 0 ? sorted : ['1', '2', '3'];
  }, [rooms, selectedHostel, selectedBlock]);

  useEffect(() => {
    if (!availableFloorsForSelection.includes(selectedFloor)) {
      setSelectedFloor(availableFloorsForSelection[0] || '1');
    }
  }, [availableFloorsForSelection, selectedFloor]);

  const allRoomsForSelection = useMemo(() => {
    return rooms.filter((r) => {
      const hostelMatch = normalizeHostel(r.hostel) === normalizeHostel(selectedHostel);
      const blockMatch = normalizeBlock(r.block) === normalizeBlock(selectedBlock);
      const floorMatch = normalizeFloor(r.floor) === normalizeFloor(selectedFloor);

      const acMatch =
        acFilter === 'all' ||
        (acFilter === 'ac' && r.is_ac === true) ||
        (acFilter === 'non_ac' && r.is_ac === false);

      const normalizedStatus = String(r.status || '').toLowerCase();
      const statusMatch =
        statusFilter === 'all' ||
        (statusFilter === 'available' && normalizedStatus === 'available') ||
        (statusFilter === 'partial' && normalizedStatus === 'partial') ||
        (statusFilter === 'occupied' && (normalizedStatus === 'occupied' || normalizedStatus === 'full')) ||
        (statusFilter === 'maintenance' && (normalizedStatus === 'maintenance' || normalizedStatus === 'blocked'));

      return hostelMatch && blockMatch && floorMatch && acMatch && statusMatch;
    });
  }, [rooms, selectedHostel, selectedBlock, selectedFloor, acFilter, statusFilter]);

  const currentViewRooms = useMemo(() => {
    const q = searchTerm.toLowerCase().trim();
    return allRoomsForSelection.filter((r) => {
      if (!q) return true;

      const residentBlob = (r.residents || [])
        .map((res) => `${res.student_name || ''} ${res.enrollment_number || ''} ${res.bed_number || ''} ${res.phone || ''}`)
        .join(' ')
        .toLowerCase();

      const emptyBedBlob = (r.empty_beds || []).join(' ').toLowerCase();

      return (
        String(r.number || '').toLowerCase().includes(q) ||
        String(r.studentName || '').toLowerCase().includes(q) ||
        String(r.status || '').toLowerCase().includes(q) ||
        String(r.floor || '').toLowerCase().includes(q) ||
        String(r.block || '').toLowerCase().includes(q) ||
        residentBlob.includes(q) ||
        emptyBedBlob.includes(q)
      );
    });
  }, [allRoomsForSelection, searchTerm]);

  const handleRoomClick = async (room) => {
    setSelectedRoom(room);
    setShowProfile(true);
  };

  const handleEvictStudent = async (studentId) => {
    try {
      if (!window.confirm("Are you sure you want to evict this student from the room?")) return;
      await api.post('/admin/rooms/remove-student', { student_id: studentId });
      toast.success('Student evicted successfully');
      setShowProfile(false);
      fetchRoomData();
      fetchTrend();
    } catch (err) {
      console.error('Eviction error:', err);
      toast.error('Failed to evict student');
    }
  };

  const handleSaveMaintenance = async (e) => {
    e.preventDefault();
    if (!selectedRoom?._id) return;

    try {
      setMaintenanceSaving(true);
      await api.post('/admin/rooms/update-maintenance', {
        room_id: selectedRoom._id,
        hostel: selectedRoom.hostel,
        block: selectedRoom.block,
        floor: selectedRoom.floor,
        room_number: selectedRoom.number,
        status: maintenanceForm.status,
        note: maintenanceForm.note,
        expected_reopen: maintenanceForm.expected_reopen || null
      });
      toast.success('Room maintenance status updated');
      setShowMaintenanceModal(false);
      fetchRoomData();
      fetchTrend();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to update room maintenance');
    } finally {
      setMaintenanceSaving(false);
    }
  };

  const handleShiftResident = async (e) => {
    e.preventDefault();
    if (!selectedResident?.student_id) return;

    try {
      setShiftSaving(true);
      await api.post('/admin/rooms/shift-student', {
        student_id: selectedResident.student_id,
        target_hostel: shiftForm.target_hostel,
        target_block: shiftForm.target_block,
        target_floor: shiftForm.target_floor,
        target_room_number: shiftForm.target_room_number,
        target_bed_number: shiftForm.target_bed_number
      });
      toast.success('Resident shifted successfully');
      setShowShiftModal(false);
      setShowProfile(false);
      fetchRoomData();
      fetchTrend();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to shift resident');
    } finally {
      setShiftSaving(false);
    }
  };

  const viewStats = useMemo(() => {
    const totalRooms = currentViewRooms.length;
    const totalBeds = currentViewRooms.reduce((acc, r) => acc + (Number(r.capacity) || 0), 0);
    const occupiedBeds = currentViewRooms.reduce((acc, r) => acc + (Number(r.occupancy_count) || 0), 0);

    const availableBeds = currentViewRooms.reduce((acc, r) => {
      const status = String(r.status || '').toLowerCase();
      if (status === 'maintenance' || status === 'blocked') return acc;
      return acc + Math.max(0, (Number(r.capacity) || 0) - (Number(r.occupancy_count) || 0));
    }, 0);

    const acRooms = currentViewRooms.filter((r) => r.is_ac === true);
    const nonAcRooms = currentViewRooms.filter((r) => r.is_ac === false);

    const totalAcBeds = acRooms.reduce((acc, r) => acc + (Number(r.capacity) || 0), 0);
    const occupiedAcBeds = acRooms.reduce((acc, r) => acc + (Number(r.occupancy_count) || 0), 0);
    const availableAcBeds = acRooms.reduce((acc, r) => {
      const status = String(r.status || '').toLowerCase();
      if (status === 'maintenance' || status === 'blocked') return acc;
      return acc + Math.max(0, (Number(r.capacity) || 0) - (Number(r.occupancy_count) || 0));
    }, 0);

    const totalNonAcBeds = nonAcRooms.reduce((acc, r) => acc + (Number(r.capacity) || 0), 0);
    const occupiedNonAcBeds = nonAcRooms.reduce((acc, r) => acc + (Number(r.occupancy_count) || 0), 0);
    const availableNonAcBeds = nonAcRooms.reduce((acc, r) => {
      const status = String(r.status || '').toLowerCase();
      if (status === 'maintenance' || status === 'blocked') return acc;
      return acc + Math.max(0, (Number(r.capacity) || 0) - (Number(r.occupancy_count) || 0));
    }, 0);

    const occupancyRate = totalBeds > 0 ? Math.round((occupiedBeds / totalBeds) * 100) : 0;
    const alertCount = currentViewRooms.reduce((acc, r) => acc + (r.alerts?.length || 0), 0);

    return {
      totalRooms,
      totalBeds,
      occupiedBeds,
      availableBeds,
      totalAcBeds,
      occupiedAcBeds,
      availableAcBeds,
      totalNonAcBeds,
      occupiedNonAcBeds,
      availableNonAcBeds,
      occupancyRate,
      alertCount
    };
  }, [currentViewRooms]);

  const trendMax = useMemo(() => {
    return trend.length ? Math.max(...trend.map((t) => Number(t.occupied_beds || 0)), 1) : 1;
  }, [trend]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px]">
        <Loader2 className="animate-spin text-[#5B7FED] mb-4" size={40} />
        <p className="text-slate-400 font-bold uppercase tracking-[0.3em] text-[10px]">Synchronizing Map Data</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 fade-in pb-12">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 2xl:grid-cols-10 gap-6">
        <div className="bg-white p-6 rounded-[2rem] border border-slate-100 flex items-center gap-4 shadow-sm">
          <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center text-[#5B7FED]">
            <TrendingUp size={24} />
          </div>
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Occupancy Rate</p>
            <h4 className="text-2xl font-black text-slate-900">{viewStats.occupancyRate}%</h4>
          </div>
        </div>

        <div className="bg-white p-6 rounded-[2rem] border border-slate-100 flex items-center gap-4 shadow-sm">
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 flex items-center justify-center text-emerald-500">
            <PieChart size={24} />
          </div>
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Available Beds</p>
            <h4 className="text-2xl font-black text-slate-900">{viewStats.availableBeds}</h4>
          </div>
        </div>

        <div className="bg-white p-6 rounded-[2rem] border border-slate-100 flex items-center gap-4 shadow-sm">
          <div className="w-12 h-12 rounded-2xl bg-violet-50 flex items-center justify-center text-violet-600">
            <BedDouble size={24} />
          </div>
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Beds</p>
            <h4 className="text-2xl font-black text-slate-900">{viewStats.totalBeds}</h4>
          </div>
        </div>

        <div className="bg-white p-6 rounded-[2rem] border border-slate-100 flex items-center gap-4 shadow-sm">
          <div className="w-12 h-12 rounded-2xl bg-cyan-50 flex items-center justify-center text-cyan-600">
            <Snowflake size={24} />
          </div>
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">AC Beds</p>
            <h4 className="text-2xl font-black text-slate-900">{viewStats.totalAcBeds}</h4>
          </div>
        </div>

        <div className="bg-white p-6 rounded-[2rem] border border-slate-100 flex items-center gap-4 shadow-sm">
          <div className="w-12 h-12 rounded-2xl bg-cyan-50 flex items-center justify-center text-cyan-600">
            <CheckCircle2 size={24} />
          </div>
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">AC Available</p>
            <h4 className="text-2xl font-black text-slate-900">{viewStats.availableAcBeds}</h4>
          </div>
        </div>

        <div className="bg-white p-6 rounded-[2rem] border border-slate-100 flex items-center gap-4 shadow-sm">
          <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-700">
            <BedDouble size={24} />
          </div>
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Non-AC Beds</p>
            <h4 className="text-2xl font-black text-slate-900">{viewStats.totalNonAcBeds}</h4>
          </div>
        </div>

        <div className="bg-white p-6 rounded-[2rem] border border-slate-100 flex items-center gap-4 shadow-sm">
          <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-700">
            <CheckCircle2 size={24} />
          </div>
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Non-AC Available</p>
            <h4 className="text-2xl font-black text-slate-900">{viewStats.availableNonAcBeds}</h4>
          </div>
        </div>

        <div className="bg-white p-6 rounded-[2rem] border border-slate-100 flex items-center gap-4 shadow-sm">
          <div className="w-12 h-12 rounded-2xl bg-amber-50 flex items-center justify-center text-amber-700">
            <AlertTriangle size={24} />
          </div>
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Data Alerts</p>
            <h4 className="text-2xl font-black text-slate-900">{viewStats.alertCount}</h4>
          </div>
        </div>

        <div className="bg-white p-6 rounded-[2rem] border border-slate-100 flex items-center gap-4 shadow-sm">
          <div className="w-12 h-12 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-700">
            <LayoutGrid size={24} />
          </div>
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Rooms In View</p>
            <h4 className="text-2xl font-black text-slate-900">{viewStats.totalRooms}</h4>
          </div>
        </div>

        <div className="bg-slate-900 p-6 rounded-[2rem] shadow-xl shadow-slate-200 min-h-[118px] min-w-0 flex flex-col justify-between">
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Current View</p>
            <h4 className="text-lg font-bold text-white leading-tight break-words">{selectedHostel}</h4>
          </div>
          <div className="flex items-center justify-between gap-3 mt-3">
            <p className="text-[11px] text-slate-400 truncate">Floor {selectedFloor}</p>
            <span className="shrink-0 px-3 py-1 bg-white/10 rounded-lg text-white font-bold text-xs uppercase tracking-wider">
              Block {selectedBlock}
            </span>
          </div>
        </div>
      </div>

      <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100 flex flex-col xl:flex-row items-start xl:items-center justify-between gap-6">
        <div className="flex items-center gap-5">
          <div className="w-14 h-14 rounded-2xl bg-slate-900 flex items-center justify-center shadow-xl shadow-slate-200">
            <Building2 size={28} className="text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-black text-slate-900 tracking-tight">Room Inventory</h1>
            <p className="text-slate-400 text-[11px] font-bold uppercase tracking-widest mt-1">
              Live Occupancy Monitor
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full xl:w-auto">
          <div className="relative group">
            <MapPin size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <select
              value={selectedHostel}
              onChange={(e) => setSelectedHostel(e.target.value)}
              className="pl-10 pr-10 py-3 bg-slate-50 border-none rounded-2xl text-xs font-black text-slate-700 outline-none focus:ring-4 focus:ring-blue-50 transition-all cursor-pointer appearance-none"
            >
              {hostels.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
          </div>

          <div className="flex bg-slate-50 p-1.5 rounded-2xl">
            {availableBlocksForHostel.map((b) => (
              <button
                key={b}
                onClick={() => setSelectedBlock(b)}
                className={`px-5 py-2 rounded-xl text-xs font-black transition-all ${
                  selectedBlock === b ? 'bg-white text-slate-900 shadow-md' : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                {b}
              </button>
            ))}
          </div>

          <div className="flex bg-slate-50 p-1.5 rounded-2xl flex-wrap">
            {availableFloorsForSelection.map((f) => (
              <button
                key={f}
                onClick={() => setSelectedFloor(f)}
                className={`px-5 py-2 rounded-xl text-xs font-black transition-all ${
                  selectedFloor === f ? 'bg-white text-slate-900 shadow-md' : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                F{f}
              </button>
            ))}
          </div>

          <div className="flex bg-slate-50 p-1.5 rounded-2xl">
            {[
              { value: 'all', label: 'All' },
              { value: 'ac', label: 'AC' },
              { value: 'non_ac', label: 'Non-AC' }
            ].map((opt) => (
              <button
                key={opt.value}
                onClick={() => setAcFilter(opt.value)}
                className={`px-4 py-2 rounded-xl text-xs font-black transition-all ${
                  acFilter === opt.value ? 'bg-white text-slate-900 shadow-md' : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="relative group">
            <Filter size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="pl-10 pr-10 py-3 bg-slate-50 border-none rounded-2xl text-xs font-black text-slate-700 outline-none focus:ring-4 focus:ring-blue-50 transition-all cursor-pointer appearance-none"
            >
              <option value="all">All Status</option>
              <option value="available">Available</option>
              <option value="partial">Partial</option>
              <option value="occupied">Full</option>
              <option value="maintenance">Maintenance/Blocked</option>
            </select>
          </div>

          <div className="relative">
            <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search room, resident, enrollment, phone..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 pr-4 py-3 bg-slate-50 border-none rounded-2xl text-xs font-bold text-slate-700 outline-none focus:ring-4 focus:ring-blue-50 transition-all min-w-[260px]"
            />
          </div>

          <button
            type="button"
            onClick={fetchRoomData}
            className="inline-flex items-center gap-2 px-4 py-3 rounded-2xl bg-slate-900 text-white text-xs font-black uppercase tracking-wider shadow-sm"
          >
            <RefreshCw size={14} />
            Refresh
          </button>

          <button
            type="button"
            onClick={exportCurrentView}
            className="inline-flex items-center gap-2 px-4 py-3 rounded-2xl bg-[#5B7FED] text-white text-xs font-black uppercase tracking-wider shadow-sm"
          >
            <Download size={14} />
            Export
          </button>
        </div>
      </div>

      <Card className="p-6 bg-white rounded-[2rem] border border-slate-100 shadow-sm">
        <div className="flex items-center gap-3 mb-4">
          <BarChart3 size={18} className="text-[#5B7FED]" />
          <h2 className="text-lg font-black text-slate-900">Occupancy Trend</h2>
        </div>

        {trendLoading ? (
          <div className="py-8 text-center">
            <Loader2 className="animate-spin text-[#5B7FED] mx-auto mb-3" size={24} />
            <p className="text-slate-400 font-black uppercase text-[10px] tracking-widest">Loading trend...</p>
          </div>
        ) : trend.length === 0 ? (
          <div className="py-8 text-center">
            <CircleDashed className="mx-auto text-slate-300 mb-2" size={26} />
            <p className="text-slate-400 font-black uppercase text-[10px] tracking-widest">No trend data available</p>
          </div>
        ) : (
          <div className="flex items-end gap-2 h-40">
            {trend.map((item, idx) => {
              const height = Math.max(18, Math.round((Number(item.occupied_beds || 0) / trendMax) * 130));
              return (
                <div key={idx} className="flex-1 flex flex-col items-center gap-2">
                  <div className="w-full rounded-t-2xl bg-[#5B7FED]" style={{ height: `${height}px` }} />
                  <span className="text-[9px] font-black text-slate-400 uppercase">
                    {item.short_label || item.label}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <div className="flex items-center gap-8 px-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.4)]" />
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Available</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-2.5 h-2.5 rounded-full bg-[#5B7FED] shadow-[0_0_12px_rgba(91,127,237,0.4)]" />
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Partial</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-2.5 h-2.5 rounded-full bg-red-400 shadow-[0_0_12px_rgba(248,113,113,0.4)]" />
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Full</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-2.5 h-2.5 rounded-full bg-amber-400" />
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Maintenance / Blocked</span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-6">
        {currentViewRooms.map((room) => (
          <div
            key={room._id}
            onClick={() => handleRoomClick(room)}
            className={`relative group overflow-hidden rounded-[2rem] p-6 transition-all duration-300 hover:-translate-y-2 ${
              getRoomBorderClass(room.status)
            } cursor-pointer`}
          >
            <div className="flex justify-between items-start mb-8">
              <div
                className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-colors ${
                  String(room.status).toLowerCase() === 'available'
                    ? 'bg-white text-emerald-500 shadow-sm'
                    : String(room.status).toLowerCase() === 'maintenance' || String(room.status).toLowerCase() === 'blocked'
                    ? 'bg-amber-50 text-amber-600'
                    : String(room.status).toLowerCase() === 'occupied' || String(room.status).toLowerCase() === 'full'
                    ? 'bg-red-50 text-red-500'
                    : 'bg-blue-50 text-[#5B7FED]'
                }`}
              >
                {String(room.status).toLowerCase() === 'maintenance' || String(room.status).toLowerCase() === 'blocked'
                  ? <Wrench size={22} />
                  : <Home size={22} />
                }
              </div>

              <div className="flex flex-col items-end gap-2">
                <div className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-tighter ${getRoomStatusClass(room.status)}`}>
                  {getRoomStatusLabel(room)}
                </div>

                <div className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-tighter ${
                  room.is_ac ? 'bg-cyan-100 text-cyan-700' : 'bg-slate-100 text-slate-700'
                }`}>
                  {room.is_ac ? 'AC' : 'NON-AC'}
                </div>
              </div>
            </div>

            <div className="space-y-1">
              <h3 className="text-3xl font-black text-slate-900 tracking-tight leading-none">Room {room.number}</h3>
              <p className="text-[11px] font-bold uppercase text-slate-400 tracking-wider">
                Floor {room.floor} • Block {room.block}
              </p>
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                {room.is_ac ? 'AC' : 'NON-AC'}
              </p>

              <div className="flex items-center gap-2">
                <p className={`text-[11px] font-bold uppercase truncate ${
                  String(room.status).toLowerCase() === 'available'
                    ? 'text-emerald-500'
                    : String(room.status).toLowerCase() === 'maintenance' || String(room.status).toLowerCase() === 'blocked'
                    ? 'text-amber-600'
                    : 'text-slate-600'
                }`}>
                  {String(room.status).toLowerCase() === 'available'
                    ? 'Open for assignment'
                    : String(room.status).toLowerCase() === 'maintenance' || String(room.status).toLowerCase() === 'blocked'
                    ? 'Temporarily unavailable'
                    : `${room.occupancy_count} Resident(s)`}
                </p>
                <ArrowRight size={12} className="text-slate-300 group-hover:translate-x-1 transition-transform" />
              </div>
            </div>

            <div className="mt-5 flex items-center gap-2">
              {Array.from({ length: room.capacity || 0 }).map((_, idx) => {
                const occupied = idx < (room.occupancy_count || 0);
                return (
                  <div
                    key={idx}
                    className={`h-3 flex-1 rounded-full ${
                      String(room.status).toLowerCase() === 'maintenance' || String(room.status).toLowerCase() === 'blocked'
                        ? 'bg-amber-200'
                        : occupied
                        ? 'bg-[#5B7FED]'
                        : 'bg-emerald-200'
                    }`}
                  />
                );
              })}
            </div>

            {room.occupancy_count<room.capacity && (room.empty_beds || []).length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {room.empty_beds.slice(0, 3).map((bed, idx) => (
                  <span
                    key={idx}
                    className="px-2 py-1 rounded-lg bg-emerald-50 border border-emerald-100 text-emerald-600 text-[9px] font-black uppercase"
                  >
                    {bed} empty
                  </span>
                ))}
              </div>
            )}

            {(room.fine_count > 0 || room.complaint_count > 0 || room.alerts.length > 0) && (
              <div className="mt-4 flex flex-wrap gap-2">
                {room.fine_count > 0 && (
                  <span className="px-2 py-1 rounded-lg bg-red-50 border border-red-100 text-red-600 text-[9px] font-black uppercase">
                    {room.fine_count} fine
                  </span>
                )}
                {room.complaint_count > 0 && (
                  <span className="px-2 py-1 rounded-lg bg-amber-50 border border-amber-100 text-amber-700 text-[9px] font-black uppercase">
                    {room.complaint_count} complaint
                  </span>
                )}
                {room.alerts.length > 0 && (
                  <span className="px-2 py-1 rounded-lg bg-slate-100 border border-slate-200 text-slate-700 text-[9px] font-black uppercase">
                    {room.alerts.length} alert
                  </span>
                )}
              </div>
            )}

            <div className={`absolute bottom-0 left-0 right-0 h-1.5 ${getRoomAccentClass(room.status)}`} />
          </div>
        ))}

        {currentViewRooms.length === 0 && (
          <div className="col-span-full py-24 text-center bg-white rounded-[2.5rem] border-2 border-dashed border-slate-100">
            <LayoutGrid className="mx-auto text-slate-200 mb-4" size={48} />
            <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px]">
              No rooms found in current selection
            </p>
          </div>
        )}
      </div>

      {showProfile && selectedRoom && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4">
          <Card className="w-full max-w-4xl bg-white rounded-[3.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 max-h-[90vh] overflow-y-auto">
            <div className="p-10 lg:p-12">
              <div className="flex justify-between items-start mb-8">
                <div>
                  <h2 className="text-4xl font-black text-slate-900 tracking-tight leading-tight">
                    Room {selectedRoom.number}
                  </h2>
                  <p className="text-[#5B7FED] font-black text-xs uppercase tracking-[0.2em] mt-3">
                    {selectedRoom.hostel} • Block {selectedRoom.block} • Floor {selectedRoom.floor} • {selectedRoom.is_ac ? 'AC' : 'NON-AC'} • {selectedRoom.room_type}
                  </p>
                </div>
                <button
                  onClick={() => setShowProfile(false)}
                  className="p-4 bg-slate-50 hover:bg-slate-100 rounded-2xl text-slate-400 transition-colors"
                >
                  <X size={24} />
                </button>
              </div>

              <div className="flex flex-wrap gap-3 mb-6">
                <button
                  onClick={() => {
                    setMaintenanceForm({
                      status: String(selectedRoom.status).toLowerCase() === 'blocked' ? 'blocked' : 'maintenance',
                      note: selectedRoom.maintenance_note || '',
                      expected_reopen: selectedRoom.maintenance_expected_reopen || ''
                    });
                    setShowMaintenanceModal(true);
                  }}
                  className="px-5 py-3 bg-amber-50 hover:bg-amber-100 text-amber-700 rounded-2xl font-black text-[10px] uppercase tracking-widest inline-flex items-center gap-2"
                >
                  <Wrench size={14} />
                  Maintenance
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-8">
                <div className="rounded-2xl bg-slate-50 border border-slate-100 p-4">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Capacity</p>
                  <p className="text-2xl font-black text-slate-900 mt-1">{selectedRoom.capacity}</p>
                </div>
                <div className="rounded-2xl bg-blue-50 border border-blue-100 p-4">
                  <p className="text-[10px] font-black uppercase tracking-widest text-[#5B7FED]">Occupied</p>
                  <p className="text-2xl font-black text-slate-900 mt-1">{selectedRoom.occupancy_count}</p>
                </div>
                <div className="rounded-2xl bg-emerald-50 border border-emerald-100 p-4">
                  <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600">Available</p>
                  <p className="text-2xl font-black text-slate-900 mt-1">
                    {Math.max(0, (selectedRoom.capacity || 0) - (selectedRoom.occupancy_count || 0))}
                  </p>
                </div>
                <div className="rounded-2xl bg-slate-50 border border-slate-100 p-4">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Status</p>
                  <p className="text-xl font-black text-slate-900 mt-1">{getRoomStatusLabel(selectedRoom)}</p>
                </div>
                <div className="rounded-2xl bg-slate-50 border border-slate-100 p-4">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Updated</p>
                  <p className="text-sm font-black text-slate-900 mt-1">
                    {selectedRoom.last_updated_at ? new Date(selectedRoom.last_updated_at).toLocaleString() : 'N/A'}
                  </p>
                </div>
              </div>

              {selectedRoom.alerts.length > 0 && (
                <div className="mb-8 rounded-[2rem] bg-red-50 border border-red-100 p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <AlertTriangle size={18} className="text-red-500" />
                    <p className="text-sm font-black uppercase tracking-widest text-red-600">Data Alerts</p>
                  </div>
                  <div className="space-y-2">
                    {selectedRoom.alerts.map((alert, idx) => (
                      <p key={idx} className="text-sm font-bold text-red-700">{alert}</p>
                    ))}
                  </div>
                </div>
              )}

              {(selectedRoom.maintenance_note || selectedRoom.maintenance_expected_reopen) && (
                <div className="mb-8 rounded-[2rem] bg-amber-50 border border-amber-100 p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <FileText size={18} className="text-amber-600" />
                    <p className="text-sm font-black uppercase tracking-widest text-amber-700">Maintenance Note</p>
                  </div>
                  {selectedRoom.maintenance_note && (
                    <p className="text-sm font-bold text-amber-700">{selectedRoom.maintenance_note}</p>
                  )}
                  {selectedRoom.maintenance_expected_reopen && (
                    <p className="text-xs font-black uppercase tracking-widest text-amber-600 mt-2">
                      Expected reopen: {new Date(selectedRoom.maintenance_expected_reopen).toLocaleString()}
                    </p>
                  )}
                </div>
              )}

              <div className="space-y-6">
                <h3 className="text-sm font-black uppercase text-slate-400 tracking-widest mb-4">
                  Bed Layout
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {Array.from({ length: selectedRoom.capacity || 0 }).map((_, idx) => {
                    const resident =
                      (selectedRoom.residents || []).find((r) => String(r.bed_number || '').trim() === String(selectedRoom.occupied_beds?.[idx] || '').trim()) ||
                      selectedRoom.residents?.[idx];

                    const fallbackEmptyBed = selectedRoom.empty_beds?.[idx] || `Bed ${String.fromCharCode(65 + idx)}`;
                    const isOccupied = !!resident;

                    return (
                      <div
                        key={idx}
                        className={`rounded-[1.75rem] border p-5 ${
                          isOccupied
                            ? 'bg-white border-slate-100 shadow-sm'
                            : 'bg-emerald-50 border-emerald-100'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className={`w-11 h-11 rounded-2xl flex items-center justify-center ${
                            isOccupied ? 'bg-blue-50 text-[#5B7FED]' : 'bg-white text-emerald-500'
                          }`}>
                            {isOccupied ? <Users size={18} /> : <BedDouble size={18} />}
                          </div>

                          <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase ${
                            isOccupied
                              ? 'bg-blue-100 text-[#5B7FED]'
                              : 'bg-emerald-100 text-emerald-600'
                          }`}>
                            {isOccupied ? 'Occupied' : 'Vacant'}
                          </span>
                        </div>

                        <div className="mt-4">
                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                            {isOccupied ? resident?.bed_number || fallbackEmptyBed : fallbackEmptyBed}
                          </p>

                          {isOccupied ? (
                            <>
                              <h4 className="text-lg font-black text-slate-900 mt-1">{resident.student_name || 'Resident'}</h4>
                              <p className="text-[11px] font-bold text-slate-500 mt-1">
                                {resident.course || 'N/A'} {resident.year ? `• Year ${resident.year}` : ''}
                              </p>
                              <p className="text-[10px] font-black uppercase tracking-widest text-[#5B7FED] mt-2">
                                {resident.enrollment_number || 'N/A'}
                              </p>
                            </>
                          ) : (
                            <>
                              <h4 className="text-lg font-black text-emerald-700 mt-1">Vacant Bed</h4>
                              <p className="text-[11px] font-bold text-emerald-600 mt-1">
                                Available for allocation
                              </p>
                            </>
                          )}
                        </div>

                        {isOccupied && (
                          <div className="flex items-center gap-2 mt-4">
                            <button
                              onClick={() => {
                                navigate('/admin/global-lookup', {
                                  state: { searchID: resident.enrollment_number }
                                });
                              }}
                              className="flex-1 px-4 py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-black text-[10px] uppercase tracking-widest shadow-md transition-colors"
                            >
                              Profile
                            </button>

                            <button
                              onClick={() => copyText(resident.enrollment_number, 'Enrollment')}
                              className="px-4 py-3 bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-xl font-black text-[10px] uppercase tracking-widest"
                            >
                              <Copy size={14} />
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="pt-4">
                  <h3 className="text-sm font-black uppercase text-slate-400 tracking-widest mb-4">
                    Occupants ({selectedRoom.occupancy_count}/{selectedRoom.capacity})
                  </h3>
                  {selectedRoom.residents && selectedRoom.residents.length > 0 ? (
                    selectedRoom.residents.map((resident, idx) => (
                      <div key={idx} className="p-6 bg-slate-50 rounded-[2rem] border border-slate-100 flex flex-col md:flex-row gap-6 items-start md:items-center justify-between shadow-sm hover:shadow-md transition-shadow mb-4 last:mb-0">
                        <div className="flex items-center gap-4">
                          <div className="w-14 h-14 rounded-2xl bg-slate-900 flex items-center justify-center text-white shadow-xl shadow-slate-200">
                            <User size={24} />
                          </div>
                          <div>
                            <h3 className="text-lg font-black text-slate-900">{resident.student_name}</h3>
                            <p className="text-xs font-bold text-slate-500">
                              {resident.course || 'N/A'} {resident.year ? `• Year ${resident.year}` : ''} • {resident.bed_number || 'Bed N/A'}
                            </p>
                            <p className="text-[10px] font-black uppercase tracking-widest text-[#5B7FED] mt-1">{resident.enrollment_number}</p>
                            {resident.phone && (
                              <p className="text-[11px] text-slate-500 font-bold mt-1">{resident.phone}</p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 w-full md:w-auto flex-wrap">
                          <button
                            onClick={() => copyText(resident.phone, 'Phone')}
                            className="flex-1 md:flex-none px-4 py-3 bg-blue-50 hover:bg-blue-100 text-[#5B7FED] rounded-xl font-black text-[10px] uppercase tracking-widest"
                          >
                            <Phone size={14} />
                          </button>
                          <button
                            onClick={() => copyText(resident.college_email || resident.personal_email, 'Email')}
                            className="flex-1 md:flex-none px-4 py-3 bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-xl font-black text-[10px] uppercase tracking-widest"
                          >
                            <Mail size={14} />
                          </button>
                          <button
                            onClick={() => {
                              setSelectedResident(resident);
                              setShiftForm({
                                target_hostel: selectedRoom.hostel,
                                target_block: selectedRoom.block,
                                target_floor: selectedRoom.floor,
                                target_room_number: '',
                                target_bed_number: ''
                              });
                              setShowShiftModal(true);
                            }}
                            className="flex-1 md:flex-none px-5 py-3 bg-amber-50 hover:bg-amber-100 text-amber-700 rounded-xl font-black text-[10px] uppercase tracking-widest transition-colors shadow-sm inline-flex items-center gap-2"
                          >
                            <MoveRight size={14} />
                            Shift
                          </button>
                          <button
                            onClick={() => handleEvictStudent(resident.student_id)}
                            className="flex-1 md:flex-none px-5 py-3 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl font-black text-[10px] uppercase tracking-widest transition-colors shadow-sm"
                          >
                            Evict
                          </button>
                          <button
                            onClick={() => {
                              navigate('/admin/global-lookup', {
                                state: { searchID: resident.enrollment_number }
                              });
                            }}
                            className="flex-1 md:flex-none px-5 py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-black text-[10px] uppercase tracking-widest shadow-md transition-colors"
                          >
                            Profile
                          </button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-center text-slate-400 py-4 font-bold uppercase tracking-widest text-xs">No residents assigned to this room.</p>
                  )}
                </div>
              </div>
            </div>
          </Card>
        </div>
      )}

      {showMaintenanceModal && selectedRoom && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/70 backdrop-blur-md p-4">
          <Card className="w-full max-w-lg bg-white rounded-[3rem] shadow-2xl">
            <form onSubmit={handleSaveMaintenance} className="p-8">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-2xl font-black text-slate-900">Room Maintenance</h3>
                <button
                  type="button"
                  onClick={() => setShowMaintenanceModal(false)}
                  className="p-3 rounded-2xl bg-slate-50 text-slate-400"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="space-y-4">
                <select
                  value={maintenanceForm.status}
                  onChange={(e) => setMaintenanceForm((prev) => ({ ...prev, status: e.target.value }))}
                  className="w-full px-4 py-4 bg-slate-50 rounded-2xl border-none outline-none"
                >
                  <option value="maintenance">Maintenance</option>
                  <option value="blocked">Blocked</option>
                  <option value="available">Available</option>
                </select>

                <textarea
                  placeholder="Maintenance / blocked note..."
                  value={maintenanceForm.note}
                  onChange={(e) => setMaintenanceForm((prev) => ({ ...prev, note: e.target.value }))}
                  className="w-full p-5 bg-slate-50 rounded-2xl border-none outline-none min-h-[120px]"
                />

                <input
                  type="datetime-local"
                  value={maintenanceForm.expected_reopen}
                  onChange={(e) => setMaintenanceForm((prev) => ({ ...prev, expected_reopen: e.target.value }))}
                  className="w-full px-4 py-4 bg-slate-50 rounded-2xl border-none outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={maintenanceSaving}
                className="w-full mt-6 py-4 rounded-2xl bg-amber-500 hover:bg-amber-600 text-white font-black uppercase tracking-widest"
              >
                {maintenanceSaving ? 'Saving...' : 'Save Room Status'}
              </button>
            </form>
          </Card>
        </div>
      )}

      {showShiftModal && selectedResident && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/70 backdrop-blur-md p-4">
          <Card className="w-full max-w-xl bg-white rounded-[3rem] shadow-2xl">
            <form onSubmit={handleShiftResident} className="p-8">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-2xl font-black text-slate-900">Shift Resident</h3>
                  <p className="text-sm text-slate-500 font-bold mt-1">{selectedResident.student_name}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowShiftModal(false)}
                  className="p-3 rounded-2xl bg-slate-50 text-slate-400"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <select
                  value={shiftForm.target_hostel}
                  onChange={(e) => setShiftForm((prev) => ({ ...prev, target_hostel: e.target.value }))}
                  className="w-full px-4 py-4 bg-slate-50 rounded-2xl border-none outline-none"
                  required
                >
                  <option value="">Select Hostel</option>
                  {hostels.map((h) => <option key={h} value={h}>{h}</option>)}
                </select>

                <input
                  placeholder="Target Block"
                  value={shiftForm.target_block}
                  onChange={(e) => setShiftForm((prev) => ({ ...prev, target_block: e.target.value }))}
                  className="w-full px-4 py-4 bg-slate-50 rounded-2xl border-none outline-none"
                  required
                />

                <input
                  placeholder="Target Floor"
                  value={shiftForm.target_floor}
                  onChange={(e) => setShiftForm((prev) => ({ ...prev, target_floor: e.target.value }))}
                  className="w-full px-4 py-4 bg-slate-50 rounded-2xl border-none outline-none"
                  required
                />

                <input
                  placeholder="Target Room Number"
                  value={shiftForm.target_room_number}
                  onChange={(e) => setShiftForm((prev) => ({ ...prev, target_room_number: e.target.value }))}
                  className="w-full px-4 py-4 bg-slate-50 rounded-2xl border-none outline-none"
                  required
                />

                <input
                  placeholder="Target Bed Number"
                  value={shiftForm.target_bed_number}
                  onChange={(e) => setShiftForm((prev) => ({ ...prev, target_bed_number: e.target.value }))}
                  className="w-full px-4 py-4 bg-slate-50 rounded-2xl border-none outline-none md:col-span-2"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={shiftSaving}
                className="w-full mt-6 py-4 rounded-2xl bg-[#5B7FED] hover:bg-blue-600 text-white font-black uppercase tracking-widest"
              >
                {shiftSaving ? 'Shifting...' : 'Confirm Shift'}
              </button>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}
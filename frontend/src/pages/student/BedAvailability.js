import React, { useEffect, useMemo, useState } from 'react';
import { Card } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Input } from '../../components/ui/input';
import api from '../../utils/api';
import { toast } from 'sonner';
import {
  Bed,
  Filter,
  DoorOpen,
  Users,
  X,
  AlertCircle,
  Info,
  RefreshCcw,
  History,
  Calendar,
  MapPin,
  Search,
  EyeOff,
  Layout,
  Camera,
  Columns,
  Wifi,
  Wind,
  Sun,
  Snowflake,
  Bath,
  Building2,
  CheckCircle2
} from 'lucide-react';

const getRoomType = (room) => {
  if (!room) return 'Standard';
  if (room.sharing_type) return room.sharing_type;
  if (room.capacity) return `${room.capacity}-Sharing`;
  if (room.ac_type === 'ac') return 'AC';
  return 'Standard';
};

const getRoomFeatureBadges = (room) => {
  const badges = [];

  if (String(room?.ac_type || '').toLowerCase() === 'ac') {
    badges.push({ label: 'AC', className: 'bg-blue-50 text-blue-600' });
  } else {
    badges.push({ label: 'Non-AC', className: 'bg-slate-100 text-slate-600' });
  }

  if (String(room?.washroom_type || '').toLowerCase() === 'attached') {
    badges.push({ label: 'Attached', className: 'bg-emerald-50 text-emerald-600' });
  } else {
    badges.push({ label: 'Common', className: 'bg-amber-50 text-amber-600' });
  }

  if (room?.is_available) {
    badges.push({ label: 'Available', className: 'bg-green-50 text-green-600' });
  } else {
    badges.push({ label: 'Occupied', className: 'bg-rose-50 text-rose-600' });
  }

  return badges;
};

export default function BedAvailability() {
  const [beds, setBeds] = useState([]);
  const [filteredBeds, setFilteredBeds] = useState([]);
  const [bookingHistory, setBookingHistory] = useState([]);
  const [genderFilter, setGenderFilter] = useState('all');
  const [blockFilter, setBlockFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [hideFull, setHideFull] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [selectedHostel, setSelectedHostel] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [hoveredRoom, setHoveredRoom] = useState(null);
  const [compareList, setCompareList] = useState([]);

  useEffect(() => {
    loadBeds();
    loadBookingHistory();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [beds, genderFilter, blockFilter, searchQuery, hideFull]);

  const uniqueBlocks = useMemo(() => {
    const blocks = [...new Set((beds || []).map((b) => String(b?.block || '').trim()).filter(Boolean))];
    return blocks.sort();
  }, [beds]);

  const loadBeds = async (isManualRefresh = false) => {
    if (isManualRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const response = await api.get('/bed-availability', {
        params: {
          gender: genderFilter === 'all' ? null : genderFilter,
          block: blockFilter === 'all' ? null : blockFilter
        }
      });

      const rows = Array.isArray(response.data) ? response.data : [];
      setBeds(rows);
      setFilteredBeds(rows);

      if (isManualRefresh) toast.success('Availability updated!');
    } catch (error) {
      console.error('Error loading beds:', error);
      toast.error('Failed to load bed availability');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const loadBookingHistory = async () => {
    try {
      const response = await api.get('/bed-availability/history');
      setBookingHistory(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.error('Error loading history:', error);
    }
  };

  const applyFilters = () => {
    let filtered = [...beds];

    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter((b) =>
        `${b?.hostel_name || ''} ${b?.block || ''}`.toLowerCase().includes(q)
      );
    }

    if (genderFilter !== 'all') {
      filtered = filtered.filter(
        (b) => String(b?.gender || '').toLowerCase() === genderFilter.toLowerCase()
      );
    }

    if (blockFilter !== 'all') {
      filtered = filtered.filter((b) => String(b?.block || '') === blockFilter);
    }

    if (hideFull) {
      filtered = filtered.filter((b) => {
        const total = Number(b?.total_beds || 0);
        const available = Number(b?.available_beds || 0);
        const occupied = Math.max(0, total - available);
        const rate = total > 0 ? (occupied / total) * 100 : 0;
        return rate <= 90;
      });
    }

    setFilteredBeds(filtered);
  };

  const handleBookRoom = async (room) => {
    try {
      const response = await api.post('/bed-availability/book', {
        hostel_name: selectedHostel?.hostel_name,
        block: selectedHostel?.block,
        floor: room?.floor,
        room_number: room?.room_number
      });

      if (response.status === 200) {
        toast.success(`Room ${room?.room_number} booked successfully!`);
        setIsModalOpen(false);
        loadBeds(true);
        loadBookingHistory();
      }
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Booking failed. Please try again.');
    }
  };

  const handleSwapRequest = async (room) => {
    try {
      const response = await api.post('/bed-availability/swap-request', {
        target_hostel: selectedHostel?.hostel_name,
        target_room: room?.room_number
      });

      if (response.status === 200) {
        toast.success(`Swap request for Room ${room?.room_number} sent to Admin!`);
        setIsModalOpen(false);
      }
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to submit swap request.');
    }
  };

  const handleOpenDetails = (hostel) => {
    setSelectedHostel(hostel);
    setIsModalOpen(true);
    setHoveredRoom(null);
    setCompareList([]);
  };

  const toggleCompare = (room) => {
    if (compareList.find((r) => r.room_number === room.room_number)) {
      setCompareList(compareList.filter((r) => r.room_number !== room.room_number));
    } else if (compareList.length < 2) {
      setCompareList([...compareList, room]);
    } else {
      toast.info('You can only compare up to 2 rooms.');
    }
  };

  if (loading) {
    return <div className="text-center py-12">Loading bed availability...</div>;
  }

  return (
    <div className="space-y-6 fade-in relative" data-testid="bed-availability-page">
      <div className="flex items-center gap-3">
        <Bed size={32} className="text-[#5B7FED]" />
        <div>
          <h1 className="text-3xl font-bold text-slate-900" style={{ fontFamily: 'Manrope, sans-serif' }}>
            Hostel Bed Availability
          </h1>
          <p className="text-slate-500 text-sm mt-1">Real-time bed occupancy status</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card className="p-6 bg-white rounded-xl shadow-sm" data-testid="filters-card">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
              <div className="flex items-center gap-3">
                <Filter size={20} className="text-slate-600" />
                <h3 className="font-semibold text-slate-900">Filters & Search</h3>
              </div>
              <div className="relative w-full md:w-64">
                <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <Input
                  placeholder="Search hostel or block..."
                  className="pl-10 rounded-xl bg-slate-50 border-slate-100"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Select value={genderFilter} onValueChange={setGenderFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Gender" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Genders</SelectItem>
                  <SelectItem value="male">Boys Hostel</SelectItem>
                  <SelectItem value="female">Girls Hostel</SelectItem>
                </SelectContent>
              </Select>

              <Select value={blockFilter} onValueChange={setBlockFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Block" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Blocks</SelectItem>
                  {uniqueBlocks.map((block) => (
                    <SelectItem key={block} value={block}>
                      Block {block}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="mt-6 pt-6 border-t border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2 text-slate-600">
                <EyeOff size={16} />
                <span className="text-sm font-medium">Hide almost full hostels (&gt;90%)</span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={hideFull}
                  onChange={(e) => setHideFull(e.target.checked)}
                />
                <div className="w-11 h-6 bg-slate-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-[#5B7FED] after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all"></div>
              </label>
            </div>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredBeds.map((bed, index) => {
              const total = Number(bed?.total_beds || 0);
              const available = Number(bed?.available_beds || 0);
              const occupied = Math.max(0, total - available);
              const occupancyRate = total > 0 ? (occupied / total) * 100 : 0;

              return (
                <Card
                  key={index}
                  className="p-6 bg-white rounded-xl shadow-sm hover-lift cursor-pointer flex flex-col justify-between"
                  onClick={() => handleOpenDetails(bed)}
                >
                  <div>
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h3 className="font-semibold text-slate-900">{bed?.hostel_name || 'Hostel'}</h3>
                        <p className="text-sm text-slate-500">
                          Block {bed?.block || '-'} {bed?.gender ? `| ${bed.gender}` : ''}
                        </p>

                        <div className="flex gap-2 mt-2 flex-wrap">
                          {Number(bed?.feature_summary?.ac?.available_beds || 0) > 0 && (
                            <span className="text-[10px] px-2 py-1 bg-blue-50 text-blue-600 rounded-full font-bold">
                              AC
                            </span>
                          )}
                          {Number(bed?.feature_summary?.attached?.available_beds || 0) > 0 && (
                            <span className="text-[10px] px-2 py-1 bg-emerald-50 text-emerald-600 rounded-full font-bold">
                              Attached
                            </span>
                          )}
                          {Number(bed?.feature_summary?.common?.available_beds || 0) > 0 && (
                            <span className="text-[10px] px-2 py-1 bg-orange-50 text-orange-600 rounded-full font-bold">
                              Common
                            </span>
                          )}
                        </div>
                      </div>

                      <span
                        className={`px-2 py-1 rounded text-xs font-medium ${
                          String(bed?.gender || '').toLowerCase() === 'female'
                            ? 'bg-pink-100 text-pink-700'
                            : 'bg-blue-100 text-blue-700'
                        }`}
                      >
                        {String(bed?.gender || '').toLowerCase() === 'female' ? 'Girls' : 'Boys'}
                      </span>
                    </div>

                    <div className="space-y-3 text-sm">
                      <div className="flex justify-between items-center">
                        <span className="text-slate-600">Capacity:</span>
                        <span className="font-semibold">{total} Beds</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-slate-600">Available:</span>
                        <span className="font-semibold text-green-600">{available}</span>
                      </div>
                    </div>

                    <div className="mt-3 text-[11px] text-slate-500">
                      🚿 Attached: {bed?.feature_summary?.attached?.available_beds || 0} | Common:{' '}
                      {bed?.feature_summary?.common?.available_beds || 0}
                    </div>

                    <div className="mt-4 pt-4 border-t border-slate-100">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-slate-500">Occupancy</span>
                        <span className="text-xs font-medium">{occupancyRate.toFixed(1)}%</span>
                      </div>
                      <div className="w-full bg-slate-200 rounded-full h-2">
                        <div
                          className="h-2 rounded-full transition-all"
                          style={{
                            width: `${Math.min(occupancyRate, 100)}%`,
                            backgroundColor:
                              occupancyRate > 90 ? '#EF4444' : occupancyRate > 75 ? '#F59E0B' : '#5B7FED'
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </Card>
              );
            })}

            {filteredBeds.length === 0 && (
              <div className="col-span-full text-center py-20 text-slate-400">
                <Bed size={40} className="mx-auto mb-3 opacity-30" />
                <p className="text-sm font-semibold">No hostels found</p>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <Card className="p-6 bg-white rounded-xl shadow-sm border-none min-h-[400px]">
            <div className="flex items-center gap-2 mb-6">
              <History size={20} className="text-[#5B7FED]" />
              <h3 className="font-bold text-slate-900">Your Booking History</h3>
            </div>
            <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar text-left">
              {bookingHistory.length === 0 ? (
                <div className="text-center py-20">
                  <Calendar size={32} className="mx-auto text-slate-200 mb-2" />
                  <p className="text-sm text-slate-400 font-medium">No previous stays found</p>
                </div>
              ) : (
                bookingHistory.map((stay, idx) => (
                  <div key={idx} className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex items-center gap-2">
                        <MapPin size={14} className="text-[#5B7FED]" />
                        <span className="text-xs font-bold text-slate-700">{stay?.hostel_name}</span>
                      </div>
                      <span className="text-[9px] font-black uppercase px-2 py-0.5 bg-white rounded-md text-[#5B7FED]">
                        RM {stay?.room_number}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-[10px]">
                      <p className="font-bold text-slate-400 uppercase">{stay?.duration || 'Current Stay'}</p>
                      <span className="font-black text-emerald-500 uppercase tracking-widest">
                        {stay?.status || 'APPROVED'}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>
      </div>

      <button
        onClick={() => loadBeds(true)}
        className="fixed bottom-8 right-8 p-4 bg-[#5B7FED] text-white rounded-full shadow-2xl active:scale-95 z-40"
      >
        <RefreshCcw size={24} className={refreshing ? 'animate-spin' : ''} />
      </button>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-4">
          <div className="bg-white rounded-[2.5rem] w-full max-w-6xl overflow-hidden shadow-2xl animate-in zoom-in duration-300 flex flex-col md:flex-row">
            <div className="flex-1 p-8 border-r border-slate-100 overflow-y-auto">
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-3">
                  <Layout className="text-[#5B7FED]" />
                  <h2 className="text-xl font-bold">
                    {selectedHostel?.hostel_name} - Block {selectedHostel?.block} Floor Map
                  </h2>
                </div>
                <button onClick={() => setIsModalOpen(false)} className="md:hidden">
                  <X size={20} />
                </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="space-y-4">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-left">
                    Room Preview
                  </p>
                  <div className="aspect-[4/5] bg-slate-900 rounded-[2rem] overflow-hidden relative group border-4 border-slate-50 shadow-xl">
                    {hoveredRoom ? (
                      <>
                        <img
                          src={
                            parseInt(hoveredRoom?.room_number || hoveredRoom || 0, 10) % 2 === 0
                              ? 'https://images.unsplash.com/photo-1555854817-5b2247a8175f?auto=format&fit=crop&q=80&w=800'
                              : 'https://images.unsplash.com/photo-1595526114035-0d45ed16cfbf?auto=format&fit=crop&q=80&w=800'
                          }
                          className="w-full h-full object-cover opacity-80"
                          alt="Room Preview"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent p-6 flex flex-col justify-end text-left">
                          <p className="text-white font-bold text-lg">
                            Room {hoveredRoom?.room_number || hoveredRoom}
                          </p>
                          <div className="flex gap-3 mt-2">
                            <Wifi size={14} className="text-white/60" />
                            <Wind size={14} className="text-white/60" />
                            <Sun size={14} className="text-white/60" />
                          </div>

                          {hoveredRoom?.washroom_type && (
                            <div className="flex gap-2 mt-3 flex-wrap">
                              <span className="text-[10px] px-2 py-1 rounded-full bg-white/15 text-white font-bold">
                                {hoveredRoom.washroom_type}
                              </span>
                              {hoveredRoom?.ac_type && (
                                <span className="text-[10px] px-2 py-1 rounded-full bg-white/15 text-white font-bold">
                                  {hoveredRoom.ac_type}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </>
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center text-slate-500 gap-3">
                        <Camera size={32} />
                        <p className="text-[10px] font-bold uppercase tracking-widest text-center px-4">
                          Hover map to preview
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-4">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-left">
                    Architectural Layout
                  </p>
                  <div className="aspect-square bg-slate-50 rounded-[2rem] p-6 border-2 border-slate-100 grid grid-cols-3 gap-3">
                    {Array.isArray(selectedHostel?.rooms) && selectedHostel.rooms.length > 0 ? (
                      selectedHostel.rooms.map((room, i) => (
                        <div
                          key={i}
                          onMouseEnter={() => setHoveredRoom(room)}
                          onClick={() => toggleCompare(room)}
                          className={`rounded-2xl border-2 flex items-center justify-center text-xs font-bold transition-all cursor-pointer ${
                            compareList.find((r) => r.room_number === room.room_number)
                              ? 'bg-[#5B7FED] text-white border-[#5B7FED] scale-105 shadow-lg'
                              : room.is_available
                              ? 'bg-white border-[#5B7FED] text-[#5B7FED] hover:scale-105'
                              : 'bg-slate-100 border-transparent text-slate-300'
                          }`}
                        >
                          {room.room_number}
                        </div>
                      ))
                    ) : (
                      <div className="col-span-full text-center text-slate-400 text-sm flex items-center justify-center">
                        No room layout available
                      </div>
                    )}
                  </div>
                  <div className="flex gap-4 justify-center text-[10px] font-bold text-slate-400 uppercase">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-[#5B7FED]" /> Available
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-slate-300" /> Occupied
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="w-full md:w-80 bg-slate-50 p-8 flex flex-col justify-between overflow-y-auto">
              <div>
                <div className="flex items-center gap-2 mb-6">
                  <Columns size={18} className="text-[#5B7FED]" />
                  <h3 className="font-bold text-slate-900">Compare & Book</h3>
                </div>

                <div className="space-y-4">
                  {compareList.length === 0 ? (
                    <div className="py-12 px-4 text-center border-2 border-dashed border-slate-200 rounded-2xl">
                      <p className="text-[10px] text-slate-400 font-bold uppercase leading-relaxed">
                        Click room numbers on the map to compare up to 2 options
                      </p>
                    </div>
                  ) : (
                    compareList.map((room, idx) => (
                      <div
                        key={idx}
                        className="bg-white p-5 rounded-[1.5rem] shadow-sm border border-slate-200 relative group animate-in slide-in-from-right-2 text-left"
                      >
                        <button
                          onClick={() => toggleCompare(room)}
                          className="absolute -top-2 -right-2 bg-red-500 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
                        >
                          <X size={12} />
                        </button>

                        <p className="text-xl font-black text-[#5B7FED]">RM {room.room_number}</p>

                        <div className="flex gap-2 my-3 flex-wrap">
                          {getRoomFeatureBadges(room).map((badge, badgeIdx) => (
                            <span
                              key={badgeIdx}
                              className={`px-2 py-1 rounded-full text-[9px] font-black uppercase tracking-wider ${badge.className}`}
                            >
                              {badge.label}
                            </span>
                          ))}
                        </div>

                        <div className="space-y-1 mb-4 text-[9px] font-bold">
                          <div className="flex justify-between">
                            <span>TYPE:</span>
                            <span className="text-slate-600 uppercase">{getRoomType(room)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>FLOOR:</span>
                            <span className="text-slate-600 uppercase">{room?.floor || '-'}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>STATUS:</span>
                            <span className={room?.is_available ? 'text-emerald-500' : 'text-rose-500'}>
                              {room?.is_available ? 'AVAILABLE' : 'OCCUPIED'}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span>BEDS LEFT:</span>
                            <span className="text-slate-600 uppercase">{room?.available_beds ?? 0}</span>
                          </div>
                        </div>

                        <div className="rounded-xl bg-slate-50 border border-slate-100 p-3 mb-4">
                          <div className="flex items-center gap-2 mb-2">
                            <Info size={12} className="text-[#5B7FED]" />
                            <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">
                              Room Features
                            </span>
                          </div>
                          <div className="space-y-1 text-[10px] text-slate-600">
                            <div className="flex items-center gap-2">
                              <Snowflake size={12} />
                              <span>{String(room?.ac_type || 'non-ac').toUpperCase()}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Bath size={12} />
                              <span>{room?.washroom_type || 'Common'} Washroom</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Users size={12} />
                              <span>{room?.sharing_type || getRoomType(room)}</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-col gap-2 relative z-10">
                          <button
                            onClick={() => handleBookRoom(room)}
                            disabled={!room?.is_available}
                            className={`w-full py-2 text-[9px] font-black uppercase tracking-widest rounded-xl transition-all shadow-md relative z-20 ${
                              room?.is_available
                                ? 'bg-[#5B7FED] text-white hover:bg-slate-900 shadow-blue-100 cursor-pointer'
                                : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                            }`}
                          >
                            {room?.is_available ? 'Reserve Now' : 'Not Available'}
                          </button>

                          <button
                            onClick={() => handleSwapRequest(room)}
                            className="w-full py-2 bg-slate-100 text-[#5B7FED] text-[9px] font-black uppercase tracking-widest rounded-xl hover:bg-blue-50 transition-all border border-blue-100 cursor-pointer relative z-20"
                          >
                            Request Swap
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="mt-8 space-y-3">
                {hoveredRoom && (
                  <div className="rounded-2xl bg-white p-4 border border-slate-200 shadow-sm">
                    <div className="flex items-center gap-2 mb-3">
                      <Building2 size={15} className="text-[#5B7FED]" />
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                        Quick Room Insight
                      </p>
                    </div>

                    <div className="space-y-2 text-[11px]">
                      <div className="flex justify-between">
                        <span className="text-slate-500">Room</span>
                        <span className="font-bold text-slate-800">{hoveredRoom?.room_number || '-'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Washroom</span>
                        <span className="font-bold text-slate-800">{hoveredRoom?.washroom_type || 'Common'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">AC Type</span>
                        <span className="font-bold text-slate-800">{hoveredRoom?.ac_type || 'non-ac'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Beds Left</span>
                        <span className="font-bold text-emerald-600">{hoveredRoom?.available_beds ?? 0}</span>
                      </div>
                    </div>
                  </div>
                )}

                <button
                  onClick={() => setIsModalOpen(false)}
                  className="w-full py-4 bg-slate-900 text-white rounded-2xl font-bold shadow-xl hover:bg-slate-800 transition-all uppercase text-xs tracking-widest"
                >
                  Close Viewer
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
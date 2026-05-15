import React, { useEffect, useMemo, useState } from 'react';
import { Card } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { toast } from 'sonner';
import api from '../../utils/api';
import {
  BookMarked,
  User,
  MapPin,
  Calendar,
  CheckCircle2,
  Clock,
  CreditCard,
  Building2,
  Bed,
  Users,
  Sparkles,
  RefreshCcw,
  ShieldCheck,
  Search,
  Moon,
  BookOpen,
  Heart,
  MessageSquare,
  Wand2
} from 'lucide-react';

export default function YearlyBookings() {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [assigningId, setAssigningId] = useState('');
  const [filters, setFilters] = useState({
    status: 'all',
    payment: 'all',
    search: ''
  });
  const [assignForms, setAssignForms] = useState({});

  useEffect(() => {
    fetchBookings();
  }, []);

  const fetchBookings = async () => {
    try {
      setLoading(true);
      const res = await api.get('/admin/yearly-bookings');
      const rows = Array.isArray(res.data) ? res.data : [];
      setBookings(rows);

      const seedForms = {};
      rows.forEach((booking) => {
        seedForms[booking._id] = {
          targetHostel: booking.hostel_name || '',
          targetBlock: booking.block || '',
          targetFloor: booking.assigned_floor || '',
          targetRoom: booking.assigned_room_number || '',
          targetBed: booking.assigned_bed_number || ''
        };
      });
      setAssignForms(seedForms);
    } catch (error) {
      toast.error('Failed to load yearly bookings');
    } finally {
      setLoading(false);
    }
  };

  const filteredBookings = useMemo(() => {
    return bookings.filter((booking) => {
      const matchStatus =
        filters.status === 'all'
          ? true
          : String(booking.status || '').toLowerCase() === filters.status;

      const matchPayment =
        filters.payment === 'all'
          ? true
          : String(booking.payment_status || '').toLowerCase() === filters.payment;

      const combined = `
        ${booking.student_name || ''}
        ${booking.student_id || ''}
        ${booking.hostel_name || ''}
        ${booking.block || ''}
        ${booking.personality?.sleepSchedule || ''}
        ${booking.personality?.studyHabits || ''}
      `.toLowerCase();

      const matchSearch = filters.search.trim()
        ? combined.includes(filters.search.trim().toLowerCase())
        : true;

      return matchStatus && matchPayment && matchSearch;
    });
  }, [bookings, filters]);

  const summary = useMemo(() => {
    const total = bookings.length;
    const paid = bookings.filter((b) => String(b.payment_status || '').toLowerCase() === 'success').length;
    const pending = bookings.filter((b) => String(b.payment_status || '').toLowerCase() !== 'success').length;
    const assigned = bookings.filter((b) => String(b.status || '').toLowerCase() === 'assigned').length;
    return { total, paid, pending, assigned };
  }, [bookings]);

  const handleAssignFieldChange = (bookingId, key, value) => {
    setAssignForms((prev) => ({
      ...prev,
      [bookingId]: {
        ...(prev[bookingId] || {}),
        [key]: value
      }
    }));
  };

  const handleAssignRoom = async (booking) => {
    const form = assignForms[booking._id] || {};
    if (!form.targetFloor || !form.targetRoom || !form.targetBed) {
      return toast.error('Fill floor, room number and bed number');
    }

    setAssigningId(booking._id);
    try {
      await api.post('/admin/yearly-bookings/assign-room', {
        booking_id: booking._id,
        student_id: booking.student_id,
        hostel_name: form.targetHostel || booking.hostel_name,
        block: form.targetBlock || booking.block,
        floor: form.targetFloor,
        room_number: form.targetRoom,
        bed_number: form.targetBed
      });
      toast.success('Room assigned successfully');
      fetchBookings();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to assign room');
    } finally {
      setAssigningId('');
    }
  };

  const handleResetCycle = async () => {
    if (!window.confirm('This will reopen next-year inventory and clear yearly booking/payment holds. Continue?')) return;
    try {
      await api.post('/admin/yearly-bookings/reset-cycle');
      toast.success('Yearly booking cycle reset successfully');
      fetchBookings();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to reset cycle');
    }
  };

  const renderTagList = (items, emptyText = 'Not specified') => {
    if (!Array.isArray(items) || items.length === 0) {
      return <span className="text-xs text-slate-400 font-medium">{emptyText}</span>;
    }

    return (
      <div className="flex flex-wrap gap-2">
        {items.map((item, idx) => (
          <span
            key={idx}
            className="px-2 py-1 rounded-full text-[10px] font-black bg-white border border-slate-200 text-slate-700 uppercase tracking-wider"
          >
            {item}
          </span>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-8 fade-in pb-12 w-full max-w-[calc(100vw-310px)] ml-auto pr-8 text-left">
      <div className="flex items-center justify-between gap-4 border-b border-slate-200 pb-6 flex-wrap">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-600 border border-blue-100 shadow-sm">
            <BookMarked size={32} />
          </div>
          <div>
            <h1 className="text-3xl font-black text-slate-900 tracking-tight" style={{ fontFamily: 'Manrope, sans-serif' }}>
              Next Year Bookings
            </h1>
            <p className="text-slate-500 text-sm font-medium mt-1">
              Bookings, payment report, allocation workflow and roommate-fit suggestions.
            </p>
          </div>
        </div>

        <Button
          onClick={handleResetCycle}
          className="bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-black text-xs uppercase tracking-widest"
        >
          <RefreshCcw size={14} className="mr-2" />
          Reset New Year Cycle
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-5 rounded-2xl border-none shadow-lg bg-white">
          <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Total Requests</p>
          <p className="text-3xl font-black text-slate-900 mt-2">{summary.total}</p>
        </Card>
        <Card className="p-5 rounded-2xl border-none shadow-lg bg-white">
          <p className="text-[11px] font-black text-emerald-500 uppercase tracking-widest">Paid / Blocked</p>
          <p className="text-3xl font-black text-slate-900 mt-2">{summary.paid}</p>
        </Card>
        <Card className="p-5 rounded-2xl border-none shadow-lg bg-white">
          <p className="text-[11px] font-black text-orange-500 uppercase tracking-widest">Pending Payment</p>
          <p className="text-3xl font-black text-slate-900 mt-2">{summary.pending}</p>
        </Card>
        <Card className="p-5 rounded-2xl border-none shadow-lg bg-white">
          <p className="text-[11px] font-black text-[#5B7FED] uppercase tracking-widest">Assigned</p>
          <p className="text-3xl font-black text-slate-900 mt-2">{summary.assigned}</p>
        </Card>
      </div>

      <Card className="p-4 rounded-2xl bg-white border border-slate-100 shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={filters.search}
              onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))}
              placeholder="Search student or hostel"
              className="w-full pl-9 pr-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-sm outline-none"
            />
          </div>

          <select
            value={filters.status}
            onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))}
            className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-sm outline-none"
          >
            <option value="all">All Booking Status</option>
            <option value="pending_payment">Pending Payment</option>
            <option value="half_paid">Half Paid</option>
            <option value="assigned">Assigned</option>
          </select>

          <select
            value={filters.payment}
            onChange={(e) => setFilters((prev) => ({ ...prev, payment: e.target.value }))}
            className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-sm outline-none"
          >
            <option value="all">All Payment Status</option>
            <option value="success">Success</option>
            <option value="pending">Pending</option>
            <option value="failed">Failed</option>
          </select>

          <Button onClick={fetchBookings} variant="outline" className="rounded-xl border-slate-200 text-slate-700">
            <RefreshCcw size={14} className="mr-2" />
            Refresh
          </Button>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {loading ? (
          <div className="col-span-full h-40 flex items-center justify-center text-slate-400 font-bold uppercase tracking-widest text-xs">
            Loading Bookings...
          </div>
        ) : filteredBookings.length === 0 ? (
          <div className="col-span-full h-40 flex flex-col items-center justify-center text-slate-400 gap-4">
            <BookMarked size={48} className="opacity-30" />
            <span className="font-bold uppercase tracking-widest text-xs">No bookings found for next year</span>
          </div>
        ) : (
          filteredBookings.map((booking, idx) => {
            const form = assignForms[booking._id] || {};
            const paid = String(booking.payment_status || '').toLowerCase() === 'success';
            const assigned = String(booking.status || '').toLowerCase() === 'assigned';
            const personality = booking.personality || {};

            return (
              <Card
                key={idx}
                className="p-6 border-none shadow-xl rounded-2xl bg-white flex flex-col hover:shadow-2xl hover:-translate-y-1 transition-all relative overflow-hidden group"
              >
                <div className={`absolute top-0 left-0 w-2 h-full ${paid ? 'bg-green-500' : 'bg-orange-400'}`} />

                <div className="pl-4 space-y-4">
                  <div className="flex justify-between items-start gap-3">
                    <div>
                      <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                        <User size={16} className="text-blue-500" /> {booking.student_name}
                      </h3>
                      <p className="text-xs text-slate-500 font-bold ml-6 uppercase tracking-widest">{booking.student_id}</p>
                    </div>

                    <div className="flex flex-col gap-2 items-end">
                      <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-1 ${
                        paid ? 'bg-green-50 text-green-700' : 'bg-orange-50 text-orange-700'
                      }`}>
                        {paid ? <CheckCircle2 size={12} /> : <Clock size={12} />}
                        {paid ? 'PAID' : 'PENDING'}
                      </span>

                      <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                        assigned ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-600'
                      }`}>
                        {assigned ? 'ASSIGNED' : String(booking.status || 'pending').replace('_', ' ')}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-3 bg-slate-50 p-4 rounded-xl border border-slate-100">
                    <div className="flex items-center gap-3">
                      <MapPin size={16} className="text-slate-400" />
                      <div>
                        <p className="text-[10px] uppercase font-black tracking-widest text-slate-400 mb-0.5">Hostel & Block</p>
                        <p className="text-sm font-bold text-slate-800">{booking.hostel_name} - Block {booking.block}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <Calendar size={16} className="text-slate-400" />
                      <div>
                        <p className="text-[10px] uppercase font-black tracking-widest text-slate-400 mb-0.5">Booking Valid For</p>
                        <p className="text-sm font-bold text-slate-800">Next Academic Year</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <CreditCard size={16} className="text-slate-400" />
                      <div>
                        <p className="text-[10px] uppercase font-black tracking-widest text-slate-400 mb-0.5">Payment Report</p>
                        <p className="text-sm font-bold text-slate-800">
                          ₹{booking.payment_amount || 0} • {booking.payment_method || booking.payment_mode || 'UPI'} • {booking.payment_status || 'Pending'}
                        </p>
                        <p className="text-xs text-slate-500 mt-1">
                          UPI: {booking.payer_upi || '-'} • Ref: {booking.transaction_ref || '-'}
                        </p>
                      </div>
                    </div>
                  </div>

                  {booking.preferences && (
                    <div className="flex flex-wrap gap-2">
                      <span className="bg-slate-100 text-slate-600 px-2 py-1 rounded text-[10px] font-black uppercase tracking-wider">
                        {booking.preferences.acType}
                      </span>
                      <span className="bg-slate-100 text-slate-600 px-2 py-1 rounded text-[10px] font-black uppercase tracking-wider">
                        {booking.preferences.roomType}
                      </span>
                      <span className="bg-slate-100 text-slate-600 px-2 py-1 rounded text-[10px] font-black uppercase tracking-wider">
                        {booking.preferences.washroom} washroom
                      </span>
                    </div>
                  )}

                  <div className="rounded-xl border border-purple-100 bg-purple-50 p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Wand2 size={15} className="text-purple-600" />
                      <p className="text-xs font-black uppercase tracking-widest text-purple-600">Student Personality Snapshot</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="rounded-lg bg-white p-3 border border-purple-100">
                        <div className="flex items-center gap-2 mb-1">
                          <Moon size={13} className="text-purple-600" />
                          <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Sleep</span>
                        </div>
                        <p className="text-sm font-bold text-slate-800 capitalize">{personality.sleepSchedule || 'Not specified'}</p>
                      </div>

                      <div className="rounded-lg bg-white p-3 border border-purple-100">
                        <div className="flex items-center gap-2 mb-1">
                          <BookOpen size={13} className="text-purple-600" />
                          <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Study</span>
                        </div>
                        <p className="text-sm font-bold text-slate-800 capitalize">{personality.studyHabits || 'Not specified'}</p>
                      </div>

                      <div className="rounded-lg bg-white p-3 border border-purple-100">
                        <div className="flex items-center gap-2 mb-1">
                          <Sparkles size={13} className="text-purple-600" />
                          <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Cleanliness</span>
                        </div>
                        <p className="text-sm font-bold text-slate-800">{personality.cleanliness ? `${personality.cleanliness}/5` : 'Not specified'}</p>
                      </div>

                      <div className="rounded-lg bg-white p-3 border border-purple-100">
                        <div className="flex items-center gap-2 mb-1">
                          <Users size={13} className="text-purple-600" />
                          <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Compatibility</span>
                        </div>
                        <p className="text-sm font-bold text-slate-800">
                          {personality.isLooking ? 'Enabled' : 'Disabled'}
                        </p>
                      </div>
                    </div>

                    <div className="mt-3 space-y-3">
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <Heart size={13} className="text-purple-600" />
                          <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Likes</span>
                        </div>
                        {renderTagList(personality.likes)}
                      </div>

                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <MessageSquare size={13} className="text-purple-600" />
                          <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Dislikes</span>
                        </div>
                        {renderTagList(personality.dislikes)}
                      </div>

                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <Sparkles size={13} className="text-purple-600" />
                          <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Hobbies / Traits</span>
                        </div>
                        {renderTagList(personality.hobbies)}
                      </div>
                    </div>
                  </div>

                  {Array.isArray(booking.roommate_matches) && booking.roommate_matches.length > 0 && (
                    <div className="rounded-xl border border-pink-100 bg-pink-50 p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <Sparkles size={15} className="text-pink-600" />
                        <p className="text-xs font-black uppercase tracking-widest text-pink-600">Compatibility Suggestions</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {booking.roommate_matches.map((match, i) => (
                          <span
                            key={i}
                            className="px-2 py-1 rounded-full text-[10px] font-black bg-white border border-pink-100 text-pink-700"
                          >
                            {match.student_name} • {match.score}%
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="rounded-xl border border-blue-100 bg-blue-50 p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Bed size={15} className="text-blue-600" />
                      <p className="text-xs font-black uppercase tracking-widest text-blue-600">Admin Room Assignment</p>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <input
                        value={form.targetBlock || ''}
                        onChange={(e) => handleAssignFieldChange(booking._id, 'targetBlock', e.target.value)}
                        placeholder="Block"
                        className="px-3 py-2 rounded-xl bg-white border border-blue-100 text-sm outline-none"
                      />
                      <input
                        value={form.targetFloor || ''}
                        onChange={(e) => handleAssignFieldChange(booking._id, 'targetFloor', e.target.value)}
                        placeholder="Floor"
                        className="px-3 py-2 rounded-xl bg-white border border-blue-100 text-sm outline-none"
                      />
                      <input
                        value={form.targetRoom || ''}
                        onChange={(e) => handleAssignFieldChange(booking._id, 'targetRoom', e.target.value)}
                        placeholder="Room No"
                        className="px-3 py-2 rounded-xl bg-white border border-blue-100 text-sm outline-none"
                      />
                      <input
                        value={form.targetBed || ''}
                        onChange={(e) => handleAssignFieldChange(booking._id, 'targetBed', e.target.value)}
                        placeholder="Bed No"
                        className="px-3 py-2 rounded-xl bg-white border border-blue-100 text-sm outline-none"
                      />
                    </div>

                    <div className="flex items-center justify-between mt-4 flex-wrap gap-3">
                      <div className="text-xs text-slate-500 font-semibold">
                        Assigned now: {booking.assigned_floor ? `Floor ${booking.assigned_floor}, Room ${booking.assigned_room_number}, Bed ${booking.assigned_bed_number}` : 'Not assigned yet'}
                      </div>

                      <Button
                        onClick={() => handleAssignRoom(booking)}
                        disabled={!paid || assigningId === booking._id}
                        className="bg-[#5B7FED] hover:bg-[#4A6FD6] text-white rounded-xl font-black text-xs uppercase tracking-widest"
                      >
                        {assigningId === booking._id ? (
                          <RefreshCcw size={14} className="mr-2 animate-spin" />
                        ) : (
                          <ShieldCheck size={14} className="mr-2" />
                        )}
                        Assign Room
                      </Button>
                    </div>
                  </div>
                </div>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
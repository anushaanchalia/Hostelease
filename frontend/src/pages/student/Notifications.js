import React, { useEffect, useMemo, useState } from 'react';
import { Card } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import api from '../../utils/api';
import { toast } from 'sonner';
import {
  Bell,
  Clock,
  Info,
  Utensils,
  CreditCard,
  Palmtree,
  Shirt,
  AlertTriangle,
  CheckCircle2,
  MapPin,
  Loader2,
  Search,
  Pin,
  FileText,
  Eye,
  XCircle,
  Users,
  ShieldAlert,
  ClipboardList,
  ExternalLink
} from 'lucide-react';
import { getUser } from '../../utils/auth';

const backendUrl = process.env.REACT_APP_BACKEND_URL || 'http://127.0.0.1:8000';

const getNotificationStyle = (type) => {
  switch (type) {
    case 'holiday':
      return { icon: <Palmtree size={24} />, color: 'text-emerald-500', bg: 'bg-emerald-50', border: 'border-emerald-100' };
    case 'fee_reminder':
    case 'fees':
      return { icon: <CreditCard size={24} />, color: 'text-blue-500', bg: 'bg-blue-50', border: 'border-blue-100' };
    case 'emergency':
      return { icon: <AlertTriangle size={24} />, color: 'text-rose-500', bg: 'bg-rose-50', border: 'border-rose-100' };
    case 'mess_timing':
      return { icon: <Utensils size={24} />, color: 'text-amber-500', bg: 'bg-amber-50', border: 'border-amber-100' };
    case 'laundry':
      return { icon: <Shirt size={24} />, color: 'text-indigo-500', bg: 'bg-indigo-50', border: 'border-indigo-100' };
    case 'visitor':
      return { icon: <Users size={24} />, color: 'text-cyan-600', bg: 'bg-cyan-50', border: 'border-cyan-100' };
    case 'complaint':
      return { icon: <ShieldAlert size={24} />, color: 'text-fuchsia-600', bg: 'bg-fuchsia-50', border: 'border-fuchsia-100' };
    default:
      return { icon: <Info size={24} />, color: 'text-slate-500', bg: 'bg-slate-50', border: 'border-slate-100' };
  }
};

const getPriorityStyle = (priority) => {
  switch (priority) {
    case 'emergency':
      return 'bg-red-100 text-red-700 border border-red-200';
    case 'critical':
      return 'bg-orange-100 text-orange-700 border border-orange-200';
    case 'important':
      return 'bg-amber-100 text-amber-700 border border-amber-200';
    default:
      return 'bg-slate-100 text-slate-700 border border-slate-200';
  }
};

const formatDateTime = (value) => {
  if (!value) return 'N/A';
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return 'N/A';
  return dt.toLocaleString();
};

const formatMinutes = (minutes) => {
  if (minutes === null || minutes === undefined || Number.isNaN(Number(minutes))) return 'N/A';
  const total = Number(minutes);
  const hrs = Math.floor(total / 60);
  const mins = total % 60;

  if (hrs > 0) return `${hrs} hr ${mins} min`;
  return `${mins} min`;
};

export default function Notifications() {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [markingId, setMarkingId] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [readFilter, setReadFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [sortOrder, setSortOrder] = useState('latest');
  const [includeArchived, setIncludeArchived] = useState(false);
  const [selectedNotice, setSelectedNotice] = useState(null);

  const user = getUser();

  useEffect(() => {
    loadNotifications();
  }, [includeArchived]);

  const loadNotifications = async () => {
    try {
      setLoading(true);
      const response = await api.get(`/notifications?include_archived=${includeArchived}`);
      setNotifications(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.error('Error loading notifications:', error);
      toast.error('Failed to load notifications');
    } finally {
      setLoading(false);
    }
  };

  const handleMarkRead = async (id) => {
    if (!id) {
      toast.error("Notification ID missing from server response");
      return;
    }

    try {
      setMarkingId(id);
      await api.post(`/notifications/read/${id}`);
      toast.success("Receipt Confirmed");

      setNotifications((prev) =>
        prev.map((notif) =>
          notif._id === id
            ? {
                ...notif,
                read_by: [...(notif.read_by || []), user?.enrollment_number],
                is_read: true,
                read_at: new Date().toISOString()
              }
            : notif
        )
      );

      if (selectedNotice?._id === id) {
        setSelectedNotice((prev) => ({
          ...prev,
          read_by: [...(prev.read_by || []), user?.enrollment_number],
          is_read: true,
          read_at: new Date().toISOString()
        }));
      }
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Failed to acknowledge receipt");
    } finally {
      setMarkingId(null);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await api.post('/notifications/mark-all-read');
      toast.success('All notifications marked as read');
      loadNotifications();
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Failed to mark all as read');
    }
  };

  const pinnedNotifications = useMemo(
    () => notifications.filter((x) => x.is_pinned && !x.is_expired),
    [notifications]
  );

  const unreadCount = useMemo(
    () => notifications.filter((x) => !x.is_read && !x.is_expired).length,
    [notifications]
  );

  const filteredNotifications = useMemo(() => {
    let data = [...notifications];

    data = data.filter((notif) => {
      const q = searchTerm.toLowerCase().trim();
      const metaText = JSON.stringify(notif.meta || {}).toLowerCase();

      const matchSearch =
        !q ||
        String(notif.title || '').toLowerCase().includes(q) ||
        String(notif.message || '').toLowerCase().includes(q) ||
        metaText.includes(q);

      const matchRead =
        readFilter === 'all' ||
        (readFilter === 'read' && notif.is_read) ||
        (readFilter === 'unread' && !notif.is_read);

      const matchType =
        typeFilter === 'all' ||
        String(notif.type || '').toLowerCase() === typeFilter;

      return matchSearch && matchRead && matchType;
    });

    data.sort((a, b) => {
      if (sortOrder === 'unread_first') {
        if (a.is_read === b.is_read) return new Date(b.date) - new Date(a.date);
        return a.is_read ? 1 : -1;
      }
      return sortOrder === 'oldest'
        ? new Date(a.date) - new Date(b.date)
        : new Date(b.date) - new Date(a.date);
    });

    return data;
  }, [notifications, searchTerm, readFilter, typeFilter, sortOrder]);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64 animate-pulse text-slate-400 font-bold uppercase text-[10px] tracking-widest">
        Syncing with Notice Board...
      </div>
    );
  }

  return (
    <div className="space-y-8 fade-in text-left">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center text-[#5B7FED] border border-blue-100 shadow-sm">
            <Bell size={26} />
          </div>
          <div>
            <h1 className="text-3xl font-black text-slate-900 tracking-tight" style={{ fontFamily: 'Manrope, sans-serif' }}>
              Notifications
            </h1>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-1">
              Unread: {unreadCount}
            </p>
          </div>
        </div>

        <Button onClick={handleMarkAllRead} className="rounded-2xl bg-[#10B981] hover:bg-emerald-600 text-white">
          <CheckCircle2 size={14} className="mr-2" />
          Mark All Read
        </Button>
      </div>

      {pinnedNotifications.length > 0 && (
        <div>
          <p className="text-sm font-black text-slate-800 mb-4 flex items-center gap-2 uppercase tracking-widest">
            <Pin size={14} className="text-amber-500" />
            Pinned Notices
          </p>

          <div className="grid grid-cols-1 gap-4">
            {pinnedNotifications.map((notif) => {
              const style = getNotificationStyle(notif.type);
              return (
                <Card key={notif._id} className="p-6 rounded-[2rem] border-2 border-amber-100 bg-amber-50/30 shadow-md">
                  <div className="flex items-start gap-4">
                    <div className={`w-14 h-14 rounded-2xl ${style.bg} ${style.color} flex items-center justify-center border ${style.border}`}>
                      {style.icon}
                    </div>

                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <span className="px-2 py-1 rounded-full text-[10px] font-black uppercase bg-amber-100 text-amber-700 border border-amber-200">
                          Pinned
                        </span>
                        <span className={`px-2 py-1 rounded-full text-[10px] font-black uppercase ${getPriorityStyle(notif.priority)}`}>
                          {notif.priority || 'general'}
                        </span>
                      </div>

                      <h3 className="text-lg font-black text-slate-900">{notif.title}</h3>
                      <p className="text-slate-600 mt-2">{notif.message}</p>

                      <div className="flex flex-wrap gap-3 mt-4">
                        <Button onClick={() => setSelectedNotice(notif)} variant="outline" className="rounded-xl">
                          <Eye size={14} className="mr-2" />
                          View
                        </Button>
                      </div>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      <Card className="p-5 rounded-[2rem] border-none shadow-lg bg-white">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <div className="relative md:col-span-2">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search title, message, visitor name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-3 rounded-xl bg-slate-50 border-none outline-none"
            />
          </div>

          <select value={readFilter} onChange={(e) => setReadFilter(e.target.value)} className="rounded-xl bg-slate-50 border-none px-3 py-3 text-sm">
            <option value="all">All</option>
            <option value="unread">Unread</option>
            <option value="read">Read</option>
          </select>

          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="rounded-xl bg-slate-50 border-none px-3 py-3 text-sm">
            <option value="all">All Types</option>
            <option value="general">General</option>
            <option value="mess_timing">Mess Timing</option>
            <option value="fee_reminder">Fee Reminder</option>
            <option value="holiday">Holiday</option>
            <option value="laundry">Laundry</option>
            <option value="emergency">Emergency</option>
            <option value="complaint">Complaint</option>
            <option value="visitor">Visitor</option>
            <option value="fees">Fees</option>
          </select>

          <div className="flex gap-2">
            <select value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} className="rounded-xl bg-slate-50 border-none px-3 py-3 text-sm flex-1">
              <option value="latest">Latest First</option>
              <option value="oldest">Oldest First</option>
              <option value="unread_first">Unread First</option>
            </select>
            <Button
              variant="outline"
              className="rounded-xl"
              onClick={() => setIncludeArchived((prev) => !prev)}
            >
              {includeArchived ? 'Hide Archive' : 'Show Archive'}
            </Button>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4">
        {filteredNotifications.length === 0 ? (
          <Card className="p-20 text-center bg-white rounded-[2.5rem] border-none shadow-xl border-dashed border-2 border-slate-100">
            <Bell size={48} className="mx-auto mb-4 text-slate-200" />
            <p className="text-slate-400 font-bold uppercase text-xs tracking-widest">No active announcements</p>
          </Card>
        ) : (
          filteredNotifications.map((notif, index) => {
            const style = getNotificationStyle(notif.type);
            const isRead = notif.is_read;
            const isProcessing = markingId === notif._id;

            return (
              <Card
                key={notif._id || index}
                className={`p-8 rounded-[2.5rem] border-none shadow-xl transition-all relative overflow-hidden ${
                  isRead ? 'bg-slate-50/80 opacity-70' : 'bg-white hover:shadow-2xl'
                } ${notif.priority === 'emergency' ? 'ring-2 ring-red-200' : ''}`}
              >
                <div className={`absolute top-0 right-0 w-32 h-32 ${style.bg} opacity-20 rounded-full -mr-16 -mt-16`} />
                <div className="flex flex-col md:flex-row gap-6 relative z-10">
                  <div className={`w-16 h-16 shrink-0 rounded-[1.5rem] ${style.bg} ${style.color} flex items-center justify-center border ${style.border}`}>
                    {isRead ? <CheckCircle2 size={24} className="text-emerald-500" /> : style.icon}
                  </div>

                  <div className="flex-1">
                    <div className="flex justify-between items-start mb-2 gap-3 flex-wrap">
                      <div className="flex flex-wrap gap-2 items-center">
                        <span className={`text-[10px] font-black uppercase tracking-widest ${style.color}`}>
                          {notif.type?.replace('_', ' ')}
                        </span>
                        <span className={`px-2 py-1 rounded-full text-[10px] font-black uppercase ${getPriorityStyle(notif.priority)}`}>
                          {notif.priority || 'general'}
                        </span>
                        {notif.is_pinned && (
                          <span className="px-2 py-1 rounded-full text-[10px] font-black uppercase bg-amber-100 text-amber-700 border border-amber-200 inline-flex items-center gap-1">
                            <Pin size={10} />
                            Pinned
                          </span>
                        )}
                        {notif.is_expired && (
                          <span className="px-2 py-1 rounded-full text-[10px] font-black uppercase bg-slate-200 text-slate-700 border border-slate-300">
                            Expired
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 text-slate-400">
                        <Clock size={12} />
                        <span className="text-[10px] font-bold uppercase">
                          {new Date(notif.date).toLocaleString('en-GB', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </span>
                      </div>
                    </div>

                    <h3 className="text-xl font-black text-slate-900 mb-2 leading-tight">
                      {notif.title || "Notice Board Update"}
                    </h3>

                    <p className="text-slate-500 font-medium leading-relaxed mb-4 line-clamp-3">
                      {notif.message}
                    </p>

                    <div className="flex flex-wrap items-center gap-3 mt-4">
                      <div className="flex items-center gap-2">
                        <MapPin size={12} className="text-[#5B7FED]" />
                        <span className="text-[9px] font-black text-[#5B7FED] uppercase tracking-widest">
                          Scope: {notif.hostel || "all"}
                        </span>
                      </div>

                      {notif.read_at && (
                        <span className="text-[10px] font-bold text-emerald-600">
                          Read at: {new Date(notif.read_at).toLocaleString()}
                        </span>
                      )}

                      {notif.read_deadline && (
                        <span className="text-[10px] font-bold text-orange-600">
                          Deadline: {new Date(notif.read_deadline).toLocaleString()}
                        </span>
                      )}

                      {notif.meta?.check_in && (
                        <span className="text-[10px] font-bold text-cyan-700">
                          Check-in: {formatDateTime(notif.meta.check_in)}
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-3 mt-6 pt-4 border-t border-slate-100">
                      <Button
                        variant="outline"
                        className="rounded-xl"
                        onClick={() => setSelectedNotice(notif)}
                      >
                        <Eye size={14} className="mr-2" />
                        View Details
                      </Button>

                      {notif.attachment_url && (
                        <a
                          href={notif.attachment_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50"
                        >
                          <FileText size={14} />
                          Attachment
                        </a>
                      )}

                      {!isRead ? (
                        <Button
                          onClick={() => handleMarkRead(notif._id)}
                          disabled={isProcessing}
                          className="bg-[#10B981] hover:bg-emerald-600 text-white rounded-xl text-[10px] font-black uppercase px-6 py-2 h-9 gap-2 shadow-lg shadow-emerald-100 disabled:opacity-60"
                        >
                          {isProcessing ? (
                            <>
                              <Loader2 size={12} className="animate-spin" />
                              Confirming...
                            </>
                          ) : (
                            <>
                              <CheckCircle2 size={12} /> Confirm Receipt
                            </>
                          )}
                        </Button>
                      ) : (
                        <span className="flex items-center gap-1.5 text-emerald-500 font-black text-[9px] uppercase tracking-widest">
                          <CheckCircle2 size={12} /> Notice Acknowledged
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </Card>
            );
          })
        )}
      </div>

      {selectedNotice && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-4xl">
            <Card className="p-8 rounded-[2rem] bg-white border-none shadow-2xl relative max-h-[90vh] overflow-y-auto">
              <button
                onClick={() => setSelectedNotice(null)}
                className="absolute top-4 right-4 w-10 h-10 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center"
              >
                <XCircle size={18} />
              </button>

              <div className="pr-12">
                <h3 className="text-2xl font-black text-slate-900">{selectedNotice.title}</h3>
                <div className="flex flex-wrap gap-2 mt-3">
                  <span className={`px-2 py-1 rounded-full text-[10px] font-black uppercase ${getPriorityStyle(selectedNotice.priority)}`}>
                    {selectedNotice.priority}
                  </span>
                  <span className="px-2 py-1 rounded-full text-[10px] font-black uppercase bg-slate-100 text-slate-700">
                    {selectedNotice.type}
                  </span>
                  {selectedNotice.is_pinned && (
                    <span className="px-2 py-1 rounded-full text-[10px] font-black uppercase bg-amber-100 text-amber-700 border border-amber-200 inline-flex items-center gap-1">
                      <Pin size={10} />
                      Pinned
                    </span>
                  )}
                </div>

                <p className="mt-5 text-slate-700 leading-relaxed whitespace-pre-wrap">
                  {selectedNotice.message}
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
                    <p className="text-[10px] font-black uppercase text-slate-400">Published</p>
                    <p className="text-sm font-bold text-slate-800 mt-1">
                      {selectedNotice.date ? new Date(selectedNotice.date).toLocaleString() : 'N/A'}
                    </p>
                  </div>

                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
                    <p className="text-[10px] font-black uppercase text-slate-400">Hostel Scope</p>
                    <p className="text-sm font-bold text-slate-800 mt-1">
                      {selectedNotice.hostel || 'all'}
                    </p>
                  </div>

                  {selectedNotice.read_deadline && (
                    <div className="p-4 rounded-2xl bg-orange-50 border border-orange-100">
                      <p className="text-[10px] font-black uppercase text-orange-500">Read Deadline</p>
                      <p className="text-sm font-bold text-orange-700 mt-1">
                        {new Date(selectedNotice.read_deadline).toLocaleString()}
                      </p>
                    </div>
                  )}

                  {selectedNotice.expires_at && (
                    <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
                      <p className="text-[10px] font-black uppercase text-slate-400">Expires At</p>
                      <p className="text-sm font-bold text-slate-800 mt-1">
                        {new Date(selectedNotice.expires_at).toLocaleString()}
                      </p>
                    </div>
                  )}

                  {selectedNotice.read_at && (
                    <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-100">
                      <p className="text-[10px] font-black uppercase text-emerald-500">Acknowledged At</p>
                      <p className="text-sm font-bold text-emerald-700 mt-1">
                        {new Date(selectedNotice.read_at).toLocaleString()}
                      </p>
                    </div>
                  )}

                  {selectedNotice.meta?.student_enrollment && (
                    <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
                      <p className="text-[10px] font-black uppercase text-slate-400">Student Enrollment</p>
                      <p className="text-sm font-bold text-slate-800 mt-1">
                        {selectedNotice.meta.student_enrollment}
                      </p>
                    </div>
                  )}
                </div>

                {selectedNotice?.meta && Object.keys(selectedNotice.meta).length > 0 && (
                  <div className="mt-6">
                    <div className="flex items-center gap-2 mb-4">
                      <ClipboardList size={16} className="text-[#5B7FED]" />
                      <p className="text-[12px] font-black uppercase tracking-widest text-slate-500">
                        Additional Details
                      </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {selectedNotice.meta.visitor_name && (
                        <div className="p-4 rounded-2xl bg-cyan-50 border border-cyan-100">
                          <p className="text-[10px] font-black uppercase text-cyan-600">Visitor Name</p>
                          <p className="text-sm font-bold text-cyan-800 mt-1">{selectedNotice.meta.visitor_name}</p>
                        </div>
                      )}

                      {selectedNotice.meta.visitor_type && (
                        <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
                          <p className="text-[10px] font-black uppercase text-slate-400">Visitor Type</p>
                          <p className="text-sm font-bold text-slate-800 mt-1">{selectedNotice.meta.visitor_type}</p>
                        </div>
                      )}

                      {selectedNotice.meta.contact_no && (
                        <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
                          <p className="text-[10px] font-black uppercase text-slate-400">Contact No</p>
                          <p className="text-sm font-bold text-slate-800 mt-1">{selectedNotice.meta.contact_no}</p>
                        </div>
                      )}

                      {selectedNotice.meta.visitor_code && (
                        <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
                          <p className="text-[10px] font-black uppercase text-slate-400">Visitor Code</p>
                          <p className="text-sm font-bold text-slate-800 mt-1">{selectedNotice.meta.visitor_code}</p>
                        </div>
                      )}

                      {selectedNotice.meta.check_in && (
                        <div className="p-4 rounded-2xl bg-blue-50 border border-blue-100">
                          <p className="text-[10px] font-black uppercase text-blue-500">Check In</p>
                          <p className="text-sm font-bold text-blue-700 mt-1">
                            {formatDateTime(selectedNotice.meta.check_in)}
                          </p>
                        </div>
                      )}

                      {selectedNotice.meta.check_out && (
                        <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-100">
                          <p className="text-[10px] font-black uppercase text-emerald-500">Check Out</p>
                          <p className="text-sm font-bold text-emerald-700 mt-1">
                            {formatDateTime(selectedNotice.meta.check_out)}
                          </p>
                        </div>
                      )}

                      {(selectedNotice.meta.hostel_name || selectedNotice.meta.room_number || selectedNotice.meta.bed_number) && (
                        <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
                          <p className="text-[10px] font-black uppercase text-slate-400">Visitor Location</p>
                          <p className="text-sm font-bold text-slate-800 mt-1">
                            {selectedNotice.meta.hostel_name || 'N/A'}
                            {selectedNotice.meta.room_number ? ` / Room ${selectedNotice.meta.room_number}` : ''}
                            {selectedNotice.meta.bed_number ? ` / Bed ${selectedNotice.meta.bed_number}` : ''}
                          </p>
                        </div>
                      )}

                      {selectedNotice.meta.duration_minutes !== undefined && selectedNotice.meta.duration_minutes !== null && (
                        <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
                          <p className="text-[10px] font-black uppercase text-slate-400">Duration</p>
                          <p className="text-sm font-bold text-slate-800 mt-1">
                            {formatMinutes(selectedNotice.meta.duration_minutes)}
                          </p>
                        </div>
                      )}

                      {selectedNotice.meta.qr_token && (
                        <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
                          <p className="text-[10px] font-black uppercase text-slate-400">QR Token</p>
                          <p className="text-sm font-bold text-slate-800 mt-1 break-all">
                            {selectedNotice.meta.qr_token}
                          </p>
                        </div>
                      )}

                      {selectedNotice.meta.is_overstay !== undefined && (
                        <div className={`p-4 rounded-2xl border ${selectedNotice.meta.is_overstay ? 'bg-red-50 border-red-100' : 'bg-emerald-50 border-emerald-100'}`}>
                          <p className={`text-[10px] font-black uppercase ${selectedNotice.meta.is_overstay ? 'text-red-500' : 'text-emerald-500'}`}>
                            Overstay Status
                          </p>
                          <p className={`text-sm font-bold mt-1 ${selectedNotice.meta.is_overstay ? 'text-red-700' : 'text-emerald-700'}`}>
                            {selectedNotice.meta.is_overstay ? 'Overstay Detected' : 'Within Allowed Time'}
                          </p>
                        </div>
                      )}

                      {selectedNotice.meta.after_hours !== undefined && (
                        <div className={`p-4 rounded-2xl border ${selectedNotice.meta.after_hours ? 'bg-amber-50 border-amber-100' : 'bg-slate-50 border-slate-100'}`}>
                          <p className={`text-[10px] font-black uppercase ${selectedNotice.meta.after_hours ? 'text-amber-500' : 'text-slate-400'}`}>
                            Entry Timing
                          </p>
                          <p className={`text-sm font-bold mt-1 ${selectedNotice.meta.after_hours ? 'text-amber-700' : 'text-slate-800'}`}>
                            {selectedNotice.meta.after_hours ? 'After Hours Entry' : 'Regular Timing'}
                          </p>
                        </div>
                      )}

                      {selectedNotice.meta.purpose && (
                        <div className="md:col-span-2 p-4 rounded-2xl bg-slate-50 border border-slate-100">
                          <p className="text-[10px] font-black uppercase text-slate-400">Purpose</p>
                          <p className="text-sm font-bold text-slate-800 mt-1 whitespace-pre-wrap">
                            {selectedNotice.meta.purpose}
                          </p>
                        </div>
                      )}

                      {selectedNotice.meta.check_out_note && (
                        <div className="md:col-span-2 p-4 rounded-2xl bg-slate-50 border border-slate-100">
                          <p className="text-[10px] font-black uppercase text-slate-400">Checkout Note</p>
                          <p className="text-sm font-bold text-slate-800 mt-1 whitespace-pre-wrap">
                            {selectedNotice.meta.check_out_note}
                          </p>
                        </div>
                      )}

                      {selectedNotice.meta.entry_slip_url && (
                        <div className="md:col-span-2">
                          <a
                            href={`${backendUrl}${selectedNotice.meta.entry_slip_url}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-2 px-4 py-3 rounded-xl border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50"
                          >
                            <FileText size={14} />
                            Open Entry Slip
                            <ExternalLink size={14} />
                          </a>
                        </div>
                      )}

                      {selectedNotice.meta.photo_url && (
                        <div className="md:col-span-2 p-4 rounded-2xl bg-slate-50 border border-slate-100">
                          <p className="text-[10px] font-black uppercase text-slate-400 mb-3">Visitor Photo</p>
                          <img
                            src={`${backendUrl}${selectedNotice.meta.photo_url}`}
                            alt="Visitor"
                            className="w-full max-h-80 object-contain rounded-xl border border-slate-200 bg-white"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap gap-3 mt-6">
                  {selectedNotice.attachment_url && (
                    <a
                      href={selectedNotice.attachment_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                      <FileText size={14} />
                      Open Attachment
                    </a>
                  )}
                </div>
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
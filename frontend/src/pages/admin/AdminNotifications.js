import React, { useEffect, useMemo, useState } from "react";
import { Card } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import api from "../../utils/api";
import { toast } from "sonner";
import {
  Bell,
  Send,
  Info,
  Utensils,
  CreditCard,
  Palmtree,
  Shirt,
  AlertCircle,
  Eye,
  Users,
  ShieldAlert,
  ChevronRight,
  Sparkles,
  CalendarDays,
  Building2,
  BarChart3,
  Search,
  Pin,
  Archive,
  Trash2,
  Pencil,
  Copy,
  Download,
  FileText,
  ClipboardList,
  ExternalLink
} from "lucide-react";

const backendUrl = process.env.REACT_APP_BACKEND_URL || "http://127.0.0.1:8000";

const hostelOptions = [
  { value: "all", label: "All Hostels" },
  { value: "Azad Bhawan", label: "Azad Bhawan" },
  { value: "Atal Bhawan", label: "Atal Bhawan" },
  { value: "Tagore Bhawan", label: "Tagore Bhawan" },
  { value: "Shakuntala Bhawan", label: "Shakuntala Bhawan" },
  { value: "Janaki Bhawan", label: "Janaki Bhawan" },
  { value: "Teresa Bhawan", label: "Teresa Bhawan" }
];

const typeOptions = [
  "general",
  "mess_timing",
  "fee_reminder",
  "holiday",
  "laundry",
  "emergency",
  "complaint",
  "visitor",
  "fees"
];

const priorityOptions = ["general", "important", "critical", "emergency"];
const roleOptions = ["student", "admin"];

const getTypeMeta = (type) => {
  switch (type) {
    case "mess_timing":
      return {
        label: "Mess Timing",
        icon: <Utensils size={15} />,
        chip: "from-amber-500/20 to-orange-500/10 text-amber-300 border-amber-400/20",
        glow: "shadow-amber-500/10"
      };
    case "fee_reminder":
      return {
        label: "Fee Reminder",
        icon: <CreditCard size={15} />,
        chip: "from-sky-500/20 to-blue-500/10 text-sky-300 border-sky-400/20",
        glow: "shadow-sky-500/10"
      };
    case "holiday":
      return {
        label: "Holiday",
        icon: <Palmtree size={15} />,
        chip: "from-emerald-500/20 to-green-500/10 text-emerald-300 border-emerald-400/20",
        glow: "shadow-emerald-500/10"
      };
    case "laundry":
      return {
        label: "Laundry",
        icon: <Shirt size={15} />,
        chip: "from-violet-500/20 to-indigo-500/10 text-violet-300 border-violet-400/20",
        glow: "shadow-violet-500/10"
      };
    case "emergency":
      return {
        label: "Emergency",
        icon: <AlertCircle size={15} />,
        chip: "from-rose-500/20 to-red-500/10 text-rose-300 border-rose-400/20",
        glow: "shadow-rose-500/10"
      };
    case "complaint":
      return {
        label: "Complaint",
        icon: <ShieldAlert size={15} />,
        chip: "from-red-500/20 to-pink-500/10 text-red-300 border-red-400/20",
        glow: "shadow-red-500/10"
      };
    case "visitor":
      return {
        label: "Visitor",
        icon: <Users size={15} />,
        chip: "from-cyan-500/20 to-blue-500/10 text-cyan-300 border-cyan-400/20",
        glow: "shadow-cyan-500/10"
      };
    default:
      return {
        label: "General",
        icon: <Info size={15} />,
        chip: "from-[#5B7FED]/20 to-blue-500/10 text-blue-300 border-blue-400/20",
        glow: "shadow-blue-500/10"
      };
  }
};

const getPriorityBadge = (priority) => {
  switch (priority) {
    case "emergency":
      return "bg-red-50 text-red-700 border border-red-100";
    case "critical":
      return "bg-orange-50 text-orange-700 border border-orange-100";
    case "important":
      return "bg-amber-50 text-amber-700 border border-amber-100";
    default:
      return "bg-slate-100 text-slate-700 border border-slate-200";
  }
};

const emptyForm = {
  title: "",
  type: "general",
  hostel: "all",
  target_role: "student",
  message: "",
  priority: "general",
  scheduled_for: "",
  expires_at: "",
  read_deadline: "",
  is_pinned: false,
  requires_ack: false,
  save_as_draft: false,
  deep_link: "",
  target_users_text: "",
  attachment_url: ""
};

const formatDateTime = (value) => {
  if (!value) return "N/A";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return "N/A";
  return dt.toLocaleString();
};

const formatMinutes = (minutes) => {
  if (minutes === null || minutes === undefined || Number.isNaN(Number(minutes))) return "N/A";
  const total = Number(minutes);
  const hours = Math.floor(total / 60);
  const mins = total % 60;
  if (hours > 0) return `${hours} hr ${mins} min`;
  return `${mins} min`;
};

const normalizeDateTimeLocalValue = (value) => {
  if (!value) return "";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
};

const historySelectClassName =
  "rounded-xl bg-white/10 border border-white/10 px-3 py-2 text-xs text-white font-semibold outline-none w-full appearance-none";

export default function AdminNotifications() {
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState([]);
  const [selectedNotice, setSelectedNotice] = useState(null);
  const [studentCount, setStudentCount] = useState(0);
  const [editId, setEditId] = useState(null);
  const [unreadUsers, setUnreadUsers] = useState([]);
  const [loadingUnread, setLoadingUnread] = useState(false);

  const [historySearch, setHistorySearch] = useState("");
  const [historyType, setHistoryType] = useState("all");
  const [historyHostel, setHistoryHostel] = useState("all");
  const [historyStatus, setHistoryStatus] = useState("all");
  const [historyPinned, setHistoryPinned] = useState("all");
  const [historyExpired, setHistoryExpired] = useState("all");

  useEffect(() => {
    fetchSentHistory();
    fetchStudentCount();
  }, []);

  useEffect(() => {
    fetchSentHistory();
  }, [historySearch, historyType, historyHostel, historyStatus, historyPinned, historyExpired]);

  useEffect(() => {
    if (selectedNotice?._id) {
      fetchUnreadUsers(selectedNotice._id);
    } else {
      setUnreadUsers([]);
    }
  }, [selectedNotice]);

  const fetchSentHistory = async () => {
    try {
      const params = new URLSearchParams();
      params.append("search", historySearch || "");
      params.append("type", historyType);
      params.append("hostel", historyHostel);
      params.append("status", historyStatus);
      params.append("pinned", historyPinned);
      params.append("expired", historyExpired);

      const res = await api.get(`/notifications/sent-history?${params.toString()}`);
      const rows = Array.isArray(res.data) ? res.data : [];
      setHistory(rows);

      if (!selectedNotice && rows.length > 0) {
        setSelectedNotice(rows[0]);
      } else if (selectedNotice?._id) {
        const updated = rows.find((x) => x._id === selectedNotice._id);
        if (updated) setSelectedNotice(updated);
      }
    } catch (err) {
      console.error("Engagement sync failed", err);
    }
  };

  const fetchStudentCount = async () => {
    try {
      const res = await api.get("/admin/stats");
      setStudentCount(res.data?.total_students || 0);
    } catch (err) {
      console.error("Student count fetch failed");
    }
  };

  const fetchUnreadUsers = async (id) => {
    try {
      setLoadingUnread(true);
      const res = await api.get(`/notifications/${id}/unread-users`);
      setUnreadUsers(res.data?.students || []);
    } catch (err) {
      setUnreadUsers([]);
    } finally {
      setLoadingUnread(false);
    }
  };

  const updateField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const resetForm = () => {
    setForm(emptyForm);
    setEditId(null);
  };

  const buildPayload = (forceCreate = false) => {
    let targetUsers = "all";
    const parsedList = form.target_users_text
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);

    if (parsedList.length > 0) {
      targetUsers = parsedList;
    }

    return {
      title: form.title.trim(),
      type: form.type,
      hostel: form.hostel,
      target_role: form.target_role,
      message: form.message.trim(),
      priority: form.priority,
      scheduled_for: form.scheduled_for || null,
      expires_at: form.expires_at || null,
      read_deadline: form.read_deadline || null,
      is_pinned: form.is_pinned,
      requires_ack: form.requires_ack,
      save_as_draft: form.save_as_draft,
      deep_link: null,
      target_users: targetUsers,
      attachment_url: form.attachment_url || null,
      force_create: forceCreate
    };
  };

  const publishNotification = async (forceCreate = false) => {
    if (!form.title.trim() || !form.message.trim()) {
      toast.error("Please fill title and message");
      return;
    }

    if (
      form.hostel === "all" &&
      form.target_role === "student" &&
      !form.target_users_text.trim() &&
      !window.confirm("This will broadcast to a wide audience. Continue?")
    ) {
      return;
    }

    setLoading(true);
    try {
      const payload = buildPayload(forceCreate);

      let res;
      if (editId) {
        res = await api.put(`/notifications/${editId}`, payload);
      } else {
        res = await api.post("/notifications", payload);
      }

      if (res.data?.duplicate_warning) {
        if (window.confirm(res.data.message || "Duplicate found. Create anyway?")) {
          await publishNotification(true);
        }
        return;
      }

      toast.success(editId ? "Notification updated" : "Notification saved successfully");
      resetForm();
      fetchSentHistory();
    } catch (error) {
      toast.error(error?.response?.data?.detail || "Failed to save notification");
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (item) => {
    setEditId(item._id);
    setForm({
      title: item.title || "",
      type: item.type || "general",
      hostel: item.hostel || "all",
      target_role: item.target_role || "student",
      message: item.message || "",
      priority: item.priority || "general",
      scheduled_for: normalizeDateTimeLocalValue(item.scheduled_for),
      expires_at: normalizeDateTimeLocalValue(item.expires_at),
      read_deadline: normalizeDateTimeLocalValue(item.read_deadline),
      is_pinned: !!item.is_pinned,
      requires_ack: !!item.requires_ack,
      save_as_draft: item.status === "draft",
      deep_link: "",
      target_users_text: Array.isArray(item.target_users)
        ? item.target_users.join(", ")
        : (typeof item.target_users === "string" && item.target_users !== "all" ? item.target_users : ""),
      attachment_url: item.attachment_url || ""
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleArchive = async (id) => {
    try {
      await api.post(`/notifications/${id}/archive`);
      toast.success("Notification archived");
      fetchSentHistory();
    } catch (error) {
      toast.error("Failed to archive notification");
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this notification?")) return;

    try {
      await api.delete(`/notifications/${id}`);
      toast.success("Notification deleted");
      if (selectedNotice?._id === id) setSelectedNotice(null);
      fetchSentHistory();
    } catch (error) {
      toast.error("Failed to delete notification");
    }
  };

  const handleResend = async (id) => {
    try {
      await api.post(`/notifications/${id}/resend`);
      toast.success("Notification rebroadcasted");
      fetchSentHistory();
    } catch (error) {
      toast.error("Failed to rebroadcast notification");
    }
  };

  const exportAnalytics = async () => {
    try {
      const res = await api.get("/notifications/analytics/export");
      if (res.data?.file_url) {
        window.open(`${backendUrl}${res.data.file_url}`, "_blank");
        toast.success("Analytics exported");
      }
    } catch (error) {
      toast.error("Failed to export analytics");
    }
  };

  const getAudienceCount = (item) => item?.audience_count || 0;
  const getReadCount = (item) => item?.read_count || item?.read_by?.length || 0;
  const getUnreadCount = (item) => item?.unread_count || Math.max(getAudienceCount(item) - getReadCount(item), 0);
  const getReadPercent = (item) => item?.read_percent || 0;

  const selectedMeta = selectedNotice?.meta || {};

  const totals = useMemo(() => {
    return {
      total: history.length,
      pinned: history.filter((x) => x.is_pinned).length,
      drafts: history.filter((x) => x.status === "draft").length,
      published: history.filter((x) => x.status === "published").length,
      expired: history.filter((x) => x.is_expired).length
    };
  }, [history]);

  return (
    <div className="space-y-8 fade-in pb-20 w-full max-w-[calc(100vw-310px)] ml-auto pr-8 text-left">
      <div className="flex items-center gap-4">
        <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center text-[#5B7FED] border border-blue-100 shadow-sm">
          <Bell size={32} />
        </div>
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight" style={{ fontFamily: "Manrope, sans-serif" }}>
            Notice Board Management
          </h1>
          <p className="text-slate-500 text-sm font-medium mt-1 uppercase tracking-widest text-[10px] font-bold">
            Broadcast, schedule, track, archive and analyze announcements
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-5 gap-4">
        <Card className="p-5 rounded-[1.75rem] shadow-md border-none bg-white">
          <p className="text-[10px] uppercase font-black text-slate-400">Total</p>
          <h3 className="text-2xl font-black text-slate-900 mt-2">{totals.total}</h3>
        </Card>
        <Card className="p-5 rounded-[1.75rem] shadow-md border-none bg-white">
          <p className="text-[10px] uppercase font-black text-slate-400">Published</p>
          <h3 className="text-2xl font-black text-slate-900 mt-2">{totals.published}</h3>
        </Card>
        <Card className="p-5 rounded-[1.75rem] shadow-md border-none bg-white">
          <p className="text-[10px] uppercase font-black text-slate-400">Drafts</p>
          <h3 className="text-2xl font-black text-slate-900 mt-2">{totals.drafts}</h3>
        </Card>
        <Card className="p-5 rounded-[1.75rem] shadow-md border-none bg-white">
          <p className="text-[10px] uppercase font-black text-slate-400">Pinned</p>
          <h3 className="text-2xl font-black text-slate-900 mt-2">{totals.pinned}</h3>
        </Card>
        <Card className="p-5 rounded-[1.75rem] shadow-md border-none bg-white">
          <p className="text-[10px] uppercase font-black text-slate-400">Expired</p>
          <h3 className="text-2xl font-black text-slate-900 mt-2">{totals.expired}</h3>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        <Card className="xl:col-span-2 p-10 border-none shadow-2xl rounded-[2.5rem] bg-white relative overflow-hidden">
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-black text-slate-900">
                {editId ? "Edit Notification" : "Create Notification"}
              </h3>
              {editId && (
                <Button onClick={resetForm} variant="outline" className="rounded-xl">
                  Cancel Edit
                </Button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest ml-1">Title</label>
                <input
                  className="w-full px-4 py-4 bg-slate-50 border-none rounded-2xl text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-100"
                  placeholder="e.g. Mess Timing Update"
                  value={form.title}
                  onChange={(e) => updateField("title", e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest ml-1">Hostel Scope</label>
                <select
                  className="w-full px-4 py-4 bg-slate-50 border-none rounded-2xl text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-100"
                  value={form.hostel}
                  onChange={(e) => updateField("hostel", e.target.value)}
                >
                  {hostelOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest ml-1">Type</label>
                <select
                  className="w-full px-4 py-4 bg-slate-50 border-none rounded-2xl text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-100"
                  value={form.type}
                  onChange={(e) => updateField("type", e.target.value)}
                >
                  {typeOptions.map((cat) => (
                    <option key={cat} value={cat}>{cat.replaceAll("_", " ")}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest ml-1">Priority</label>
                <select
                  className="w-full px-4 py-4 bg-slate-50 border-none rounded-2xl text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-100"
                  value={form.priority}
                  onChange={(e) => updateField("priority", e.target.value)}
                >
                  {priorityOptions.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest ml-1">Target Role</label>
                <select
                  className="w-full px-4 py-4 bg-slate-50 border-none rounded-2xl text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-100"
                  value={form.target_role}
                  onChange={(e) => updateField("target_role", e.target.value)}
                >
                  {roleOptions.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest ml-1">Private Targets</label>
                <input
                  className="w-full px-4 py-4 bg-slate-50 border-none rounded-2xl text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-100"
                  placeholder="Comma-separated enrollment numbers"
                  value={form.target_users_text}
                  onChange={(e) => updateField("target_users_text", e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest ml-1">Schedule For</label>
                <input
                  type="datetime-local"
                  className="w-full px-4 py-4 bg-slate-50 border-none rounded-2xl text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-100"
                  value={form.scheduled_for}
                  onChange={(e) => updateField("scheduled_for", e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest ml-1">Expires At</label>
                <input
                  type="datetime-local"
                  className="w-full px-4 py-4 bg-slate-50 border-none rounded-2xl text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-100"
                  value={form.expires_at}
                  onChange={(e) => updateField("expires_at", e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest ml-1">Read Deadline</label>
                <input
                  type="datetime-local"
                  className="w-full px-4 py-4 bg-slate-50 border-none rounded-2xl text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-100"
                  value={form.read_deadline}
                  onChange={(e) => updateField("read_deadline", e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest ml-1">Navigation</label>
                <div className="w-full px-4 py-4 bg-slate-100 border border-slate-200 rounded-2xl text-sm font-bold text-slate-500">
                  Deep link disabled for clarity
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest ml-1">Attachment URL / PDF URL</label>
              <input
                className="w-full px-4 py-4 bg-slate-50 border-none rounded-2xl text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-100"
                placeholder="Paste uploaded PDF/file URL"
                value={form.attachment_url}
                onChange={(e) => updateField("attachment_url", e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest ml-1">Message</label>
              <textarea
                className="w-full p-6 bg-slate-50 border-none rounded-3xl text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-100 transition-all min-h-[150px]"
                placeholder="Type your announcement content here..."
                value={form.message}
                onChange={(e) => updateField("message", e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <button
                type="button"
                onClick={() => updateField("is_pinned", !form.is_pinned)}
                className={`rounded-2xl px-4 py-3 text-xs font-black uppercase ${form.is_pinned ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-700"}`}
              >
                Pin Notice
              </button>

              <button
                type="button"
                onClick={() => updateField("requires_ack", !form.requires_ack)}
                className={`rounded-2xl px-4 py-3 text-xs font-black uppercase ${form.requires_ack ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-700"}`}
              >
                Require Ack
              </button>

              <button
                type="button"
                onClick={() => updateField("save_as_draft", !form.save_as_draft)}
                className={`rounded-2xl px-4 py-3 text-xs font-black uppercase ${form.save_as_draft ? "bg-violet-100 text-violet-800" : "bg-slate-100 text-slate-700"}`}
              >
                Save as Draft
              </button>

              <div className="rounded-2xl px-4 py-3 text-xs font-black uppercase bg-slate-50 text-slate-700 border border-slate-100">
                Role: {form.target_role}
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button
                onClick={() => publishNotification(false)}
                disabled={loading}
                className="flex-1 py-8 bg-[#1E293B] hover:bg-slate-800 text-white rounded-3xl font-black uppercase text-xs tracking-widest gap-2 shadow-xl"
              >
                {loading ? "Saving..." : <><Send size={18} /> {editId ? "Update Notification" : "Save Notification"}</>}
              </Button>

              <Button
                onClick={exportAnalytics}
                variant="outline"
                className="rounded-3xl py-8 px-6 font-black uppercase text-xs tracking-widest gap-2"
              >
                <Download size={16} />
                Export Analytics
              </Button>
            </div>
          </div>
        </Card>

        <div className="space-y-6">
          <Card className="p-7 bg-gradient-to-br from-slate-900 via-[#14213d] to-[#1d3557] border-none rounded-[2.5rem] shadow-2xl text-white overflow-hidden relative">
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-6">
                <h3 className="font-black uppercase tracking-[0.22em] text-[11px] flex items-center gap-2 text-slate-100">
                  <Eye size={15} className="text-emerald-400" />
                  History
                </h3>
                <div className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-emerald-300 bg-emerald-400/10 border border-emerald-400/20 rounded-full px-3 py-1">
                  <Sparkles size={11} />
                  Live
                </div>
              </div>

              <div className="space-y-3 mb-4">
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    className="w-full pl-9 pr-3 py-3 rounded-2xl bg-white/10 border border-white/10 text-sm text-white placeholder:text-slate-400 outline-none"
                    placeholder="Search title or message"
                    value={historySearch}
                    onChange={(e) => setHistorySearch(e.target.value)}
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <select
                    className={historySelectClassName}
                    value={historyHostel}
                    onChange={(e) => setHistoryHostel(e.target.value)}
                  >
                    <option value="all" className="text-slate-900 bg-white">All Hostels</option>
                    {hostelOptions.map((x) => (
                      <option key={x.value} value={x.value} className="text-slate-900 bg-white">
                        {x.label}
                      </option>
                    ))}
                  </select>

                  <select
                    className={historySelectClassName}
                    value={historyType}
                    onChange={(e) => setHistoryType(e.target.value)}
                  >
                    <option value="all" className="text-slate-900 bg-white">All Types</option>
                    {typeOptions.map((x) => (
                      <option key={x} value={x} className="text-slate-900 bg-white">
                        {x}
                      </option>
                    ))}
                  </select>

                  <select
                    className={historySelectClassName}
                    value={historyStatus}
                    onChange={(e) => setHistoryStatus(e.target.value)}
                  >
                    <option value="all" className="text-slate-900 bg-white">All Status</option>
                    <option value="draft" className="text-slate-900 bg-white">Draft</option>
                    <option value="scheduled" className="text-slate-900 bg-white">Scheduled</option>
                    <option value="published" className="text-slate-900 bg-white">Published</option>
                    <option value="archived" className="text-slate-900 bg-white">Archived</option>
                    <option value="expired" className="text-slate-900 bg-white">Expired</option>
                  </select>

                  <select
                    className={historySelectClassName}
                    value={historyPinned}
                    onChange={(e) => setHistoryPinned(e.target.value)}
                  >
                    <option value="all" className="text-slate-900 bg-white">Pinned: All</option>
                    <option value="true" className="text-slate-900 bg-white">Pinned Only</option>
                    <option value="false" className="text-slate-900 bg-white">Unpinned</option>
                  </select>
                </div>
              </div>

              <div className="space-y-4 max-h-[520px] overflow-y-auto pr-1 no-scrollbar">
                {history.length > 0 ? history.map((item, i) => {
                  const meta = getTypeMeta(item.type);
                  const isSelected = selectedNotice?._id === item._id;

                  return (
                    <div
                      key={item._id || i}
                      className={`group relative overflow-hidden rounded-[1.75rem] border backdrop-blur-sm p-5 transition-all duration-300 ${
                        isSelected
                          ? "border-[#7ea2ff]/50 bg-white/[0.10] shadow-xl"
                          : `border-white/10 bg-white/[0.06] hover:bg-white/[0.09] hover:-translate-y-0.5 hover:shadow-xl ${meta.glow}`
                      }`}
                    >
                      <div className="relative z-10">
                        <div className="flex items-start justify-between gap-3 mb-4">
                          <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] bg-gradient-to-r ${meta.chip}`}>
                            {meta.icon}
                            {meta.label}
                          </div>

                          {item.is_pinned && <Pin size={14} className="text-amber-300 shrink-0" />}
                        </div>

                        <h4 className="text-sm font-extrabold text-white leading-snug line-clamp-1 tracking-wide">
                          {item.title || "Notice Board Update"}
                        </h4>

                        <div className="mt-2 flex flex-wrap gap-2">
                          <span className={`px-2 py-1 rounded-full text-[10px] font-black uppercase ${getPriorityBadge(item.priority)}`}>
                            {item.priority}
                          </span>
                          <span className="px-2 py-1 rounded-full text-[10px] font-black uppercase bg-white/10">
                            {item.status}
                          </span>
                        </div>

                        <div className="mt-3 flex items-center justify-between gap-3">
                          <div className="space-y-1">
                            <p className="text-[11px] text-slate-300 font-semibold tracking-wide">
                              {item.hostel === "all" ? "All Hostels" : item.hostel}
                            </p>
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.18em]">
                              {new Date(item.date).toLocaleDateString("en-GB", {
                                day: "numeric",
                                month: "short",
                                year: "numeric"
                              })}
                            </p>
                          </div>

                          <button
                            type="button"
                            onClick={() => setSelectedNotice(item)}
                            className={`w-9 h-9 rounded-full border flex items-center justify-center transition-all ${
                              isSelected
                                ? "bg-[#5B7FED]/30 border-[#7ea2ff]/40 text-white"
                                : "bg-white/10 border-white/10 text-slate-300 group-hover:text-white group-hover:bg-[#5B7FED]/30"
                            }`}
                          >
                            <ChevronRight size={14} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                }) : (
                  <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest text-center py-8">
                    No history found
                  </p>
                )}
              </div>
            </div>
          </Card>

          {selectedNotice && (
            <Card className="p-8 bg-white border border-slate-100 rounded-[2.5rem] shadow-xl">
              <div className="flex items-center justify-between gap-3 mb-5">
                <h3 className="font-black uppercase tracking-tight text-sm text-slate-900 flex items-center gap-2">
                  <BarChart3 size={18} className="text-[#5B7FED]" />
                  Notification Details
                </h3>
                <span className="text-[10px] font-black uppercase tracking-widest text-emerald-600 bg-emerald-50 border border-emerald-100 rounded-full px-3 py-1">
                  {getReadPercent(selectedNotice)}% Read
                </span>
              </div>

              <div className="space-y-4">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Title</p>
                  <h4 className="text-lg font-black text-slate-900 leading-snug">
                    {selectedNotice.title || "Notice Board Update"}
                  </h4>
                </div>

                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Message</p>
                  <p className="text-sm text-slate-600 leading-relaxed font-medium whitespace-pre-wrap">
                    {selectedNotice.message || "No detailed message available."}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-2xl bg-slate-50 p-4 border border-slate-100">
                    <div className="flex items-center gap-2 text-slate-500 mb-1">
                      <Building2 size={14} />
                      <span className="text-[10px] font-black uppercase tracking-widest">Hostel Scope</span>
                    </div>
                    <p className="text-sm font-extrabold text-slate-900">
                      {selectedNotice.hostel === "all" ? "All Hostels" : selectedNotice.hostel}
                    </p>
                  </div>

                  <div className="rounded-2xl bg-slate-50 p-4 border border-slate-100">
                    <div className="flex items-center gap-2 text-slate-500 mb-1">
                      <CalendarDays size={14} />
                      <span className="text-[10px] font-black uppercase tracking-widest">Published</span>
                    </div>
                    <p className="text-sm font-extrabold text-slate-900">
                      {selectedNotice.date ? new Date(selectedNotice.date).toLocaleString() : "N/A"}
                    </p>
                  </div>

                  <div className="rounded-2xl bg-emerald-50 p-4 border border-emerald-100">
                    <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600 mb-1">Read</p>
                    <p className="text-lg font-black text-emerald-700">{getReadCount(selectedNotice)}</p>
                  </div>

                  <div className="rounded-2xl bg-rose-50 p-4 border border-rose-100">
                    <p className="text-[10px] font-black uppercase tracking-widest text-rose-600 mb-1">Unread</p>
                    <p className="text-lg font-black text-rose-700">{getUnreadCount(selectedNotice)}</p>
                  </div>
                </div>

                <div className="rounded-2xl bg-slate-50 p-4 border border-slate-100">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Audience</p>
                  <p className="text-sm font-extrabold text-slate-900">{getAudienceCount(selectedNotice)}</p>
                </div>

                {selectedNotice.scheduled_for && (
                  <div className="rounded-2xl bg-blue-50 p-4 border border-blue-100">
                    <p className="text-[10px] font-black uppercase tracking-widest text-blue-600 mb-1">Scheduled For</p>
                    <p className="text-sm font-extrabold text-blue-700">{formatDateTime(selectedNotice.scheduled_for)}</p>
                  </div>
                )}

                {selectedNotice.read_deadline && (
                  <div className="rounded-2xl bg-orange-50 p-4 border border-orange-100">
                    <p className="text-[10px] font-black uppercase tracking-widest text-orange-600 mb-1">Read Deadline</p>
                    <p className="text-sm font-extrabold text-orange-700">{formatDateTime(selectedNotice.read_deadline)}</p>
                  </div>
                )}

                {selectedNotice.expires_at && (
                  <div className="rounded-2xl bg-slate-50 p-4 border border-slate-100">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">Expires At</p>
                    <p className="text-sm font-extrabold text-slate-900">{formatDateTime(selectedNotice.expires_at)}</p>
                  </div>
                )}

                {selectedNotice.attachment_url && (
                  <a
                    href={selectedNotice.attachment_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 text-sm font-bold text-[#5B7FED] hover:underline"
                  >
                    <FileText size={14} />
                    Open attachment
                  </a>
                )}

                {selectedMeta && Object.keys(selectedMeta).length > 0 && (
                  <div className="pt-2 border-t border-slate-100">
                    <div className="flex items-center gap-2 mb-3">
                      <ClipboardList size={15} className="text-slate-500" />
                      <p className="text-[11px] font-black uppercase tracking-widest text-slate-500">
                        Related Details
                      </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {selectedMeta.visitor_name && (
                        <div className="rounded-xl bg-slate-50 border border-slate-100 px-4 py-3">
                          <p className="text-[10px] font-black uppercase text-slate-400">Visitor Name</p>
                          <p className="text-sm font-bold text-slate-800 mt-1">{selectedMeta.visitor_name}</p>
                        </div>
                      )}

                      {selectedMeta.visitor_type && (
                        <div className="rounded-xl bg-slate-50 border border-slate-100 px-4 py-3">
                          <p className="text-[10px] font-black uppercase text-slate-400">Visitor Type</p>
                          <p className="text-sm font-bold text-slate-800 mt-1">{selectedMeta.visitor_type}</p>
                        </div>
                      )}

                      {selectedMeta.student_name && (
                        <div className="rounded-xl bg-slate-50 border border-slate-100 px-4 py-3">
                          <p className="text-[10px] font-black uppercase text-slate-400">Student Name</p>
                          <p className="text-sm font-bold text-slate-800 mt-1">{selectedMeta.student_name}</p>
                        </div>
                      )}

                      {selectedMeta.student_enrollment && (
                        <div className="rounded-xl bg-slate-50 border border-slate-100 px-4 py-3">
                          <p className="text-[10px] font-black uppercase text-slate-400">Enrollment</p>
                          <p className="text-sm font-bold text-slate-800 mt-1">{selectedMeta.student_enrollment}</p>
                        </div>
                      )}

                      {selectedMeta.contact_no && (
                        <div className="rounded-xl bg-slate-50 border border-slate-100 px-4 py-3">
                          <p className="text-[10px] font-black uppercase text-slate-400">Contact No</p>
                          <p className="text-sm font-bold text-slate-800 mt-1">{selectedMeta.contact_no}</p>
                        </div>
                      )}

                      {selectedMeta.visitor_code && (
                        <div className="rounded-xl bg-slate-50 border border-slate-100 px-4 py-3">
                          <p className="text-[10px] font-black uppercase text-slate-400">Visitor Code</p>
                          <p className="text-sm font-bold text-slate-800 mt-1">{selectedMeta.visitor_code}</p>
                        </div>
                      )}

                      {selectedMeta.check_in && (
                        <div className="rounded-xl bg-blue-50 border border-blue-100 px-4 py-3">
                          <p className="text-[10px] font-black uppercase text-blue-500">Check In</p>
                          <p className="text-sm font-bold text-blue-700 mt-1">{formatDateTime(selectedMeta.check_in)}</p>
                        </div>
                      )}

                      {selectedMeta.check_out && (
                        <div className="rounded-xl bg-emerald-50 border border-emerald-100 px-4 py-3">
                          <p className="text-[10px] font-black uppercase text-emerald-500">Check Out</p>
                          <p className="text-sm font-bold text-emerald-700 mt-1">{formatDateTime(selectedMeta.check_out)}</p>
                        </div>
                      )}

                      {selectedMeta.duration_minutes !== undefined && selectedMeta.duration_minutes !== null && (
                        <div className="rounded-xl bg-slate-50 border border-slate-100 px-4 py-3">
                          <p className="text-[10px] font-black uppercase text-slate-400">Duration</p>
                          <p className="text-sm font-bold text-slate-800 mt-1">{formatMinutes(selectedMeta.duration_minutes)}</p>
                        </div>
                      )}

                      {selectedMeta.qr_token && (
                        <div className="rounded-xl bg-slate-50 border border-slate-100 px-4 py-3">
                          <p className="text-[10px] font-black uppercase text-slate-400">QR Token</p>
                          <p className="text-sm font-bold text-slate-800 mt-1 break-all">{selectedMeta.qr_token}</p>
                        </div>
                      )}

                      {(selectedMeta.hostel_name || selectedMeta.room_number || selectedMeta.bed_number) && (
                        <div className="rounded-xl bg-slate-50 border border-slate-100 px-4 py-3">
                          <p className="text-[10px] font-black uppercase text-slate-400">Location</p>
                          <p className="text-sm font-bold text-slate-800 mt-1">
                            {selectedMeta.hostel_name || "N/A"}
                            {selectedMeta.room_number ? ` / Room ${selectedMeta.room_number}` : ""}
                            {selectedMeta.bed_number ? ` / Bed ${selectedMeta.bed_number}` : ""}
                          </p>
                        </div>
                      )}

                      {selectedMeta.after_hours !== undefined && (
                        <div className={`rounded-xl border px-4 py-3 ${selectedMeta.after_hours ? "bg-amber-50 border-amber-100" : "bg-slate-50 border-slate-100"}`}>
                          <p className={`text-[10px] font-black uppercase ${selectedMeta.after_hours ? "text-amber-500" : "text-slate-400"}`}>Entry Timing</p>
                          <p className={`text-sm font-bold mt-1 ${selectedMeta.after_hours ? "text-amber-700" : "text-slate-800"}`}>
                            {selectedMeta.after_hours ? "After Hours Entry" : "Regular Timing"}
                          </p>
                        </div>
                      )}

                      {selectedMeta.is_overstay !== undefined && (
                        <div className={`rounded-xl border px-4 py-3 ${selectedMeta.is_overstay ? "bg-red-50 border-red-100" : "bg-emerald-50 border-emerald-100"}`}>
                          <p className={`text-[10px] font-black uppercase ${selectedMeta.is_overstay ? "text-red-500" : "text-emerald-500"}`}>Overstay</p>
                          <p className={`text-sm font-bold mt-1 ${selectedMeta.is_overstay ? "text-red-700" : "text-emerald-700"}`}>
                            {selectedMeta.is_overstay ? "Detected" : "No"}
                          </p>
                        </div>
                      )}

                      {selectedMeta.purpose && (
                        <div className="md:col-span-2 rounded-xl bg-slate-50 border border-slate-100 px-4 py-3">
                          <p className="text-[10px] font-black uppercase text-slate-400">Purpose</p>
                          <p className="text-sm font-bold text-slate-800 mt-1 whitespace-pre-wrap">{selectedMeta.purpose}</p>
                        </div>
                      )}

                      {selectedMeta.check_out_note && (
                        <div className="md:col-span-2 rounded-xl bg-slate-50 border border-slate-100 px-4 py-3">
                          <p className="text-[10px] font-black uppercase text-slate-400">Checkout Note</p>
                          <p className="text-sm font-bold text-slate-800 mt-1 whitespace-pre-wrap">{selectedMeta.check_out_note}</p>
                        </div>
                      )}

                      {selectedMeta.entry_slip_url && (
                        <div className="md:col-span-2">
                          <a
                            href={`${backendUrl}${selectedMeta.entry_slip_url}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-2 text-sm font-bold text-[#5B7FED] hover:underline"
                          >
                            <FileText size={14} />
                            Open Entry Slip
                            <ExternalLink size={14} />
                          </a>
                        </div>
                      )}

                      {selectedMeta.photo_url && (
                        <div className="md:col-span-2 rounded-xl bg-slate-50 border border-slate-100 px-4 py-3">
                          <p className="text-[10px] font-black uppercase text-slate-400 mb-3">Visitor Photo</p>
                          <img
                            src={`${backendUrl}${selectedMeta.photo_url}`}
                            alt="Visitor"
                            className="w-full max-h-72 object-contain rounded-xl border border-slate-200 bg-white"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                      Acknowledgment Progress
                    </span>
                    <span className="text-xs font-black text-slate-700">
                      {getReadCount(selectedNotice)} / {getAudienceCount(selectedNotice)}
                    </span>
                  </div>
                  <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-[#5B7FED] to-emerald-400 transition-all duration-500"
                      style={{ width: `${getReadPercent(selectedNotice)}%` }}
                    />
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 pt-2">
                  <Button onClick={() => handleEdit(selectedNotice)} variant="outline" className="rounded-xl gap-2">
                    <Pencil size={14} />
                    Edit
                  </Button>

                  <Button onClick={() => handleResend(selectedNotice._id)} variant="outline" className="rounded-xl gap-2">
                    <Copy size={14} />
                    Resend
                  </Button>

                  <Button onClick={() => handleArchive(selectedNotice._id)} variant="outline" className="rounded-xl gap-2">
                    <Archive size={14} />
                    Archive
                  </Button>

                  <Button onClick={() => handleDelete(selectedNotice._id)} variant="outline" className="rounded-xl gap-2 text-red-600">
                    <Trash2 size={14} />
                    Delete
                  </Button>
                </div>

                <div className="pt-4 border-t">
                  <div className="flex items-center gap-2 mb-3">
                    <Users size={15} className="text-slate-500" />
                    <p className="text-[11px] font-black uppercase tracking-widest text-slate-500">
                      Unread Students
                    </p>
                  </div>

                  {loadingUnread ? (
                    <p className="text-sm text-slate-500">Loading unread students...</p>
                  ) : unreadUsers.length === 0 ? (
                    <p className="text-sm text-slate-500">No unread students found.</p>
                  ) : (
                    <div className="max-h-44 overflow-y-auto space-y-2 pr-1">
                      {unreadUsers.map((student) => (
                        <div key={student.enrollment_number} className="rounded-xl bg-slate-50 border border-slate-100 px-3 py-2">
                          <p className="text-sm font-bold text-slate-800">{student.student_name}</p>
                          <p className="text-xs text-slate-500">
                            {student.enrollment_number} • {student.hostel_name || "N/A"} • Room {student.room_number || "N/A"}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
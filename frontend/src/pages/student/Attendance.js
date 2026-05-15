import React, { useEffect, useMemo, useState } from "react";
import { Card } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import api from "../../utils/api";
import { toast } from "sonner";
import {
  Calendar,
  CheckCircle,
  Clock,
  ShieldAlert,
  BarChart3,
  TimerReset,
  UserCheck,
  UserX,
  TrendingUp,
  Activity,
  Download,
  Search,
  Info,
  Sparkles,
  AlertTriangle,
  ClipboardList,
  Eye,
  X,
  XCircle,
  FileText,
  Send,
  ShieldCheck,
  Upload,
  Paperclip,
  Image as ImageIcon,
} from "lucide-react";

const statusStyles = {
  present: "bg-emerald-50 text-emerald-600 border-emerald-100",
  late: "bg-amber-50 text-amber-600 border-amber-100",
  absent: "bg-red-50 text-red-600 border-red-100",
  excused_absence: "bg-violet-50 text-violet-600 border-violet-100",
  pending: "bg-slate-50 text-slate-500 border-slate-100",
};

const chartBarClass = {
  present: "from-emerald-500 to-emerald-300",
  late: "from-amber-500 to-amber-300",
  absent: "from-red-500 to-red-300",
  excused_absence: "from-violet-500 to-violet-300",
  pending: "from-slate-400 to-slate-300",
};

const normalizeAttendanceStatus = (status = "") => {
  const value = String(status || "")
    .trim()
    .toLowerCase();
  if (value === "leave_approved") return "excused_absence";
  if (value === "leave-approved") return "excused_absence";
  if (value === "excused-absence") return "excused_absence";
  if (value === "excused_absence") return "excused_absence";
  if (value === "present") return "present";
  if (value === "late") return "late";
  if (value === "absent") return "absent";
  return "pending";
};

const getStatusLabel = (status = "") => {
  const normalized = normalizeAttendanceStatus(status);
  if (normalized === "excused_absence") return "Excused Absence";
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
};

const getBarHeight = (status = "") => {
  const normalized = normalizeAttendanceStatus(status);
  if (normalized === "present") return 92;
  if (normalized === "late") return 72;
  if (normalized === "excused_absence") return 58;
  if (normalized === "absent") return 24;
  return 18;
};

const getLinePointTop = (status = "") => {
  const normalized = normalizeAttendanceStatus(status);
  if (normalized === "present") return 18;
  if (normalized === "late") return 38;
  if (normalized === "excused_absence") return 54;
  if (normalized === "absent") return 84;
  return 90;
};

const formatPercent = (value) => `${Number(value || 0).toFixed(1)}%`;

const getTodayLocal = () => {
  const d = new Date();
  const year = d.getFullYear();
  const month = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const getMonthKey = (dateValue) => {
  const d = new Date(dateValue);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, "0")}`;
};

const getReadableMonth = (monthKey) => {
  if (!monthKey) return "All Months";
  const [year, month] = monthKey.split("-");
  const d = new Date(Number(year), Number(month) - 1, 1);
  return d.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
};

const getShortDate = (dateValue) => {
  const d = new Date(dateValue);
  if (Number.isNaN(d.getTime())) return "N/A";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
};

const getLongDate = (dateValue) => {
  const d = new Date(dateValue);
  if (Number.isNaN(d.getTime())) return "N/A";
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
};

const getTimeText = (value) => {
  if (!value) return "N/A";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "N/A";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};

const getConsistencyScore = (records = []) => {
  if (!records.length) return 0;
  const positive = records.filter((r) =>
    ["present", "late", "excused_absence"].includes(
      normalizeAttendanceStatus(r.status),
    ),
  ).length;
  return Math.round((positive / records.length) * 100);
};

const fileToDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

const getWeeklyNumericScore = (status = "") => {
  const normalized = normalizeAttendanceStatus(status);
  if (normalized === "present") return 100;
  if (normalized === "late") return 72;
  if (normalized === "excused_absence") return 58;
  if (normalized === "absent") return 18;
  return 10;
};

const getWeeklyStatusTone = (status = "") => {
  const normalized = normalizeAttendanceStatus(status);
  if (normalized === "present") return "text-emerald-600";
  if (normalized === "late") return "text-amber-600";
  if (normalized === "excused_absence") return "text-violet-600";
  if (normalized === "absent") return "text-red-600";
  return "text-slate-500";
};

export default function Attendance() {
  const [attendance, setAttendance] = useState([]);
  const [loading, setLoading] = useState(true);

  const [searchMonth, setSearchMonth] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [historySearch, setHistorySearch] = useState("");
  const [selectedRecord, setSelectedRecord] = useState(null);

  const [showCorrectionModal, setShowCorrectionModal] = useState(false);
  const [correctionTarget, setCorrectionTarget] = useState(null);
  const [correctionReason, setCorrectionReason] = useState("");
  const [correctionRequests, setCorrectionRequests] = useState([]);
  const [loadingCorrections, setLoadingCorrections] = useState(false);
  const [correctionProofFile, setCorrectionProofFile] = useState(null);
  const [correctionProofPreview, setCorrectionProofPreview] = useState("");
  const [submittingCorrection, setSubmittingCorrection] = useState(false);

  useEffect(() => {
    loadAttendance();
    loadCorrectionRequests();
  }, []);

  useEffect(() => {
    return () => {
      if (
        correctionProofPreview &&
        correctionProofPreview.startsWith("blob:")
      ) {
        URL.revokeObjectURL(correctionProofPreview);
      }
    };
  }, [correctionProofPreview]);

  const loadAttendance = async () => {
    try {
      setLoading(true);
      const response = await api.get("/attendance");
      const rows = Array.isArray(response.data) ? response.data : [];
      const normalized = rows.map((item) => ({
        ...item,
        status: normalizeAttendanceStatus(item.status),
      }));
      setAttendance(normalized);
    } catch (error) {
      console.error("Error loading attendance:", error);
      toast.error("Failed to load attendance");
    } finally {
      setLoading(false);
    }
  };

  const loadCorrectionRequests = async () => {
    try {
      setLoadingCorrections(true);
      const res = await api.get("/student/attendance/correction-requests");
      setCorrectionRequests(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error("Failed to load correction requests", err);
    } finally {
      setLoadingCorrections(false);
    }
  };

  const today = getTodayLocal();
  const todayAttendance = attendance.find((a) => a.date === today);

  const availableMonths = useMemo(() => {
    const unique = [
      ...new Set(attendance.map((r) => getMonthKey(r.date)).filter(Boolean)),
    ];
    return unique.sort((a, b) => (a < b ? 1 : -1));
  }, [attendance]);

  const filteredAttendance = useMemo(() => {
    return attendance.filter((record) => {
      const normalizedStatus = normalizeAttendanceStatus(record.status);
      const monthKey = getMonthKey(record.date);
      const search = historySearch.toLowerCase().trim();

      const matchesMonth = searchMonth === "all" || monthKey === searchMonth;
      const matchesStatus =
        statusFilter === "all" || normalizedStatus === statusFilter;
      const matchesSearch =
        !search ||
        String(record.date || "")
          .toLowerCase()
          .includes(search) ||
        normalizedStatus.includes(search) ||
        getLongDate(record.date).toLowerCase().includes(search);

      return matchesMonth && matchesStatus && matchesSearch;
    });
  }, [attendance, searchMonth, statusFilter, historySearch]);

  const summary = useMemo(() => {
    const present = attendance.filter((r) => r.status === "present").length;
    const late = attendance.filter((r) => r.status === "late").length;
    const absent = attendance.filter((r) => r.status === "absent").length;
    const excusedAbsence = attendance.filter(
      (r) => r.status === "excused_absence",
    ).length;

    const counted = present + late + absent + excusedAbsence;
    const positive = present + late + excusedAbsence;
    const percentage = counted
      ? ((positive / counted) * 100).toFixed(1)
      : "0.0";

    return { present, late, absent, excusedAbsence, percentage };
  }, [attendance]);

  const currentMonthStats = useMemo(() => {
    const now = new Date();
    const monthRecords = attendance.filter((r) => {
      const d = new Date(r.date);
      return (
        d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
      );
    });

    const present = monthRecords.filter((r) => r.status === "present").length;
    const late = monthRecords.filter((r) => r.status === "late").length;
    const absent = monthRecords.filter((r) => r.status === "absent").length;
    const excusedAbsence = monthRecords.filter(
      (r) => r.status === "excused_absence",
    ).length;

    const total = monthRecords.length;
    const positive = present + late + excusedAbsence;
    const percentage = total ? ((positive / total) * 100).toFixed(1) : "0.0";

    return {
      total,
      present,
      late,
      absent,
      excusedAbsence,
      percentage,
    };
  }, [attendance]);

  const monthlyPercentageCard = useMemo(() => {
    const percentage = Number(currentMonthStats.percentage || 0);
    const neededTarget = 75;
    const monthRecords = currentMonthStats.total;
    const positiveDays =
      currentMonthStats.present +
      currentMonthStats.late +
      currentMonthStats.excusedAbsence;

    let daysNeeded = 0;
    if (percentage < neededTarget) {
      let extraDays = 0;
      while (true) {
        const projected =
          ((positiveDays + extraDays) / (monthRecords + extraDays || 1)) * 100;
        if (projected >= neededTarget) {
          daysNeeded = extraDays;
          break;
        }
        extraDays += 1;
        if (extraDays > 365) break;
      }
    }

    return {
      percentage,
      daysNeeded,
    };
  }, [currentMonthStats]);

  const streakCounter = useMemo(() => {
    const sorted = [...attendance].sort(
      (a, b) => new Date(b.date) - new Date(a.date),
    );
    let streak = 0;
    for (const item of sorted) {
      const status = normalizeAttendanceStatus(item.status);
      if (
        status === "present" ||
        status === "late" ||
        status === "excused_absence"
      ) {
        streak += 1;
      } else {
        break;
      }
    }
    return streak;
  }, [attendance]);

  const weeklyTrend = useMemo(() => {
    const last7 = [...attendance]
      .sort((a, b) => new Date(a.date) - new Date(b.date))
      .slice(-7);

    return last7.map((r, index) => ({
      ...r,
      status: normalizeAttendanceStatus(r.status),
      shortDate: getShortDate(r.date),
      longDate: getLongDate(r.date),
      barHeight: getBarHeight(r.status),
      pointTop: getLinePointTop(r.status),
      numericScore: getWeeklyNumericScore(r.status),
      index,
    }));
  }, [attendance]);

  const previousWeekTrend = useMemo(() => {
    const sorted = [...attendance].sort(
      (a, b) => new Date(a.date) - new Date(b.date),
    );
    const previousRows = sorted.slice(-14, -7);

    return previousRows.map((r, index) => ({
      ...r,
      status: normalizeAttendanceStatus(r.status),
      shortDate: getShortDate(r.date),
      longDate: getLongDate(r.date),
      barHeight: getBarHeight(r.status),
      pointTop: getLinePointTop(r.status),
      numericScore: getWeeklyNumericScore(r.status),
      index,
    }));
  }, [attendance]);

  const compareWeekly = useMemo(() => {
    const scoreFor = (rows) =>
      rows.reduce((acc, row) => {
        const status = normalizeAttendanceStatus(row.status);
        if (status === "present") return acc + 1;
        if (status === "late") return acc + 0.7;
        if (status === "excused_absence") return acc + 0.5;
        return acc;
      }, 0);

    const currentScore = scoreFor(weeklyTrend);
    const prevScore = scoreFor(previousWeekTrend);
    return {
      currentScore: currentScore.toFixed(1),
      prevScore: prevScore.toFixed(1),
      improved: currentScore >= prevScore,
      delta: (currentScore - prevScore).toFixed(1),
    };
  }, [weeklyTrend, previousWeekTrend]);

  const semesterAttendanceProgress = useMemo(() => {
    const total = attendance.length;
    const positive = attendance.filter((r) =>
      ["present", "late", "excused_absence"].includes(
        normalizeAttendanceStatus(r.status),
      ),
    ).length;
    return total ? (positive / total) * 100 : 0;
  }, [attendance]);

  const ringStats = useMemo(() => {
    const total =
      summary.present +
        summary.late +
        summary.absent +
        summary.excusedAbsence || 1;
    return [
      {
        label: "Present",
        value: summary.present,
        percent: Math.round((summary.present / total) * 100),
        style: "text-emerald-600 bg-emerald-50 border-emerald-100",
      },
      {
        label: "Late",
        value: summary.late,
        percent: Math.round((summary.late / total) * 100),
        style: "text-amber-600 bg-amber-50 border-amber-100",
      },
      {
        label: "Absent",
        value: summary.absent,
        percent: Math.round((summary.absent / total) * 100),
        style: "text-red-600 bg-red-50 border-red-100",
      },
      {
        label: "Excused",
        value: summary.excusedAbsence,
        percent: Math.round((summary.excusedAbsence / total) * 100),
        style: "text-violet-600 bg-violet-50 border-violet-100",
      },
    ];
  }, [summary]);

  const weekdayLateStats = useMemo(() => {
    const lateRecords = attendance.filter(
      (r) => normalizeAttendanceStatus(r.status) === "late",
    );
    const map = {};

    lateRecords.forEach((item) => {
      const d = new Date(item.date);
      const day = d.toLocaleDateString("en-GB", { weekday: "short" });
      map[day] = (map[day] || 0) + 1;
    });

    const sorted = Object.entries(map).sort((a, b) => b[1] - a[1]);
    return sorted[0]
      ? { day: sorted[0][0], count: sorted[0][1] }
      : { day: "N/A", count: 0 };
  }, [attendance]);

  const bestAttendanceMonth = useMemo(() => {
    const grouped = {};

    attendance.forEach((item) => {
      const key = getMonthKey(item.date);
      if (!key) return;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(item);
    });

    let best = null;

    Object.entries(grouped).forEach(([month, rows]) => {
      const positive = rows.filter((r) =>
        ["present", "late", "excused_absence"].includes(
          normalizeAttendanceStatus(r.status),
        ),
      ).length;
      const percent = rows.length ? (positive / rows.length) * 100 : 0;
      if (!best || percent > best.percent) {
        best = { month, percent };
      }
    });

    return best;
  }, [attendance]);

  const missingRecordHighlights = useMemo(() => {
    return filteredAttendance.filter(
      (record) => !record.time || record.time === "N/A",
    ).length;
  }, [filteredAttendance]);

  const consistencyScore = useMemo(
    () => getConsistencyScore(weeklyTrend),
    [weeklyTrend],
  );

  const weeklyInsightText = useMemo(() => {
    const presentDays = weeklyTrend.filter(
      (x) => x.status === "present",
    ).length;
    const lateDays = weeklyTrend.filter((x) => x.status === "late").length;
    const absentDays = weeklyTrend.filter((x) => x.status === "absent").length;

    if (presentDays >= 5) return "Strong attendance consistency this week.";
    if (absentDays >= 3)
      return "Attendance needs urgent improvement this week.";
    if (lateDays >= 2) return "Late entries are affecting your weekly pattern.";
    return "Your weekly trend is moderately stable.";
  }, [weeklyTrend]);

  const weeklyCompareRows = useMemo(() => {
    const maxLength = Math.max(weeklyTrend.length, previousWeekTrend.length);
    return Array.from({ length: maxLength }).map((_, index) => {
      const current = weeklyTrend[index] || null;
      const previous = previousWeekTrend[index] || null;
      return {
        current,
        previous,
        label: current?.shortDate || previous?.shortDate || `Day ${index + 1}`,
      };
    });
  }, [weeklyTrend, previousWeekTrend]);

  const weeklySvgData = useMemo(() => {
    const pointsCurrent = [];
    const pointsPrevious = [];
    const width = 720;
    const height = 240;
    const topPadding = 26;
    const bottomPadding = 30;
    const leftPadding = 18;
    const rightPadding = 18;
    const usableHeight = height - topPadding - bottomPadding;
    const segmentCount = Math.max(weeklyCompareRows.length - 1, 1);
    const xStep = (width - leftPadding - rightPadding) / segmentCount;

    const toY = (score) => {
      const bounded = Math.max(0, Math.min(100, Number(score || 0)));
      return topPadding + ((100 - bounded) / 100) * usableHeight;
    };

    weeklyCompareRows.forEach((row, index) => {
      const x = leftPadding + xStep * index;
      if (row.current) {
        pointsCurrent.push({
          x,
          y: toY(row.current.numericScore),
          item: row.current,
        });
      }
      if (row.previous) {
        pointsPrevious.push({
          x,
          y: toY(row.previous.numericScore),
          item: row.previous,
        });
      }
    });

    const currentPath = pointsCurrent
      .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
      .join(" ");

    const previousPath = pointsPrevious
      .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
      .join(" ");

    return {
      width,
      height,
      currentPath,
      previousPath,
      pointsCurrent,
      pointsPrevious,
    };
  }, [weeklyCompareRows]);

  const downloadPersonalReport = async () => {
    const rows = filteredAttendance.map((record) => ({
      Date: getLongDate(record.date),
      Status: getStatusLabel(record.status),
      Time: getTimeText(record.time),
      Source:
        record.source ||
        (record.marked_by
          ? "manual"
          : record.time
            ? "marked"
            : "system_absent"),
      MarkedBy: record.marked_by || "System",
    }));

    const header = ["Date", "Status", "Time", "Source", "MarkedBy"];
    const csv = [
      header.join(","),
      ...rows.map((row) =>
        header
          .map((key) => `"${String(row[key]).replace(/"/g, '""')}"`)
          .join(","),
      ),
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.download = `attendance_report_${searchMonth === "all" ? "all" : searchMonth}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const openCorrectionModal = (record) => {
    if (correctionProofPreview && correctionProofPreview.startsWith("blob:")) {
      URL.revokeObjectURL(correctionProofPreview);
    }
    setCorrectionTarget(record);
    setCorrectionReason("");
    setCorrectionProofFile(null);
    setCorrectionProofPreview("");
    setShowCorrectionModal(true);
  };

  const handleCorrectionFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedSize = 4 * 1024 * 1024;
    if (file.size > allowedSize) {
      toast.error("Proof file must be under 4MB");
      return;
    }

    if (correctionProofPreview && correctionProofPreview.startsWith("blob:")) {
      URL.revokeObjectURL(correctionProofPreview);
    }

    setCorrectionProofFile(file);

    if (file.type.startsWith("image/")) {
      const previewUrl = URL.createObjectURL(file);
      setCorrectionProofPreview(previewUrl);
    } else {
      setCorrectionProofPreview("");
    }
  };

  const submitCorrectionRequest = async (e) => {
    e.preventDefault();

    if (!correctionTarget?.date) {
      toast.error("Attendance date missing");
      return;
    }

    if (!correctionReason.trim()) {
      toast.error("Please enter your reason");
      return;
    }

    if (!correctionProofFile) {
      toast.error("Supporting file or image is compulsory");
      return;
    }

    try {
      setSubmittingCorrection(true);

      const proofDataUrl = await fileToDataUrl(correctionProofFile);

      await api.post("/student/attendance/correction-request", {
        date: correctionTarget.date,
        reason: correctionReason.trim(),
        proof_url: proofDataUrl,
      });
      await loadCorrectionRequests();

      toast.success("Correction request submitted successfully");
      setShowCorrectionModal(false);
      setCorrectionTarget(null);
      setCorrectionReason("");
      setCorrectionProofFile(null);

      if (
        correctionProofPreview &&
        correctionProofPreview.startsWith("blob:")
      ) {
        URL.revokeObjectURL(correctionProofPreview);
      }
      setCorrectionProofPreview("");
    } catch (error) {
      toast.error(
        error?.response?.data?.detail || "Failed to submit correction request",
      );
    } finally {
      setSubmittingCorrection(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Clock className="animate-pulse text-[#5B7FED]" size={40} />
      </div>
    );
  }

  return (
    <div className="space-y-6 fade-in text-left">
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-5">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center text-[#5B7FED] border border-blue-100 shadow-sm">
            <Calendar size={26} />
          </div>
          <div>
            <h1 className="text-3xl font-black text-slate-900 tracking-tight leading-none">
              Your Attendance
            </h1>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-1">
              Verified attendance records
            </p>
          </div>
        </div>

        <Button
          onClick={downloadPersonalReport}
          className="bg-[#1E293B] hover:bg-slate-800 text-white rounded-2xl h-11 px-5 font-black uppercase text-[11px] tracking-widest gap-2"
        >
          <Download size={14} />
          Download Report
        </Button>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-5 gap-4">
        <Card className="p-6 bg-white border-none shadow-xl rounded-[2rem]">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                Present Days
              </p>
              <h3 className="text-2xl font-black text-slate-900 mt-2">
                {summary.present}
              </h3>
            </div>
            <UserCheck className="text-emerald-500" size={22} />
          </div>
        </Card>

        <Card className="p-6 bg-white border-none shadow-xl rounded-[2rem]">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                Absent Days
              </p>
              <h3 className="text-2xl font-black text-slate-900 mt-2">
                {summary.absent}
              </h3>
            </div>
            <UserX className="text-red-500" size={22} />
          </div>
        </Card>

        <Card className="p-6 bg-white border-none shadow-xl rounded-[2rem]">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                Late Days
              </p>
              <h3 className="text-2xl font-black text-slate-900 mt-2">
                {summary.late}
              </h3>
            </div>
            <TimerReset className="text-amber-500" size={22} />
          </div>
        </Card>

        <Card className="p-6 bg-white border-none shadow-xl rounded-[2rem]">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                Excused Days
              </p>
              <h3 className="text-2xl font-black text-slate-900 mt-2">
                {summary.excusedAbsence}
              </h3>
            </div>
            <ClipboardList className="text-violet-500" size={22} />
          </div>
        </Card>

        <Card className="p-6 bg-white border-none shadow-xl rounded-[2rem]">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                Attendance Rate
              </p>
              <h3 className="text-2xl font-black text-slate-900 mt-2">
                {summary.percentage}%
              </h3>
            </div>
            <BarChart3 className="text-[#5B7FED]" size={22} />
          </div>
        </Card>
      </div>

      <Card className="p-8 bg-white border-none shadow-2xl rounded-[2.5rem]">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <h2 className="text-lg font-black text-slate-800 uppercase tracking-tighter">
            Today&apos;s Record
          </h2>
          <span className="text-[10px] font-black text-slate-400 uppercase bg-slate-50 px-3 py-1 rounded-full italic border border-slate-100">
            Visibility window: daily live status
          </span>
        </div>

        {todayAttendance ? (
          <div
            className={`flex items-center gap-6 p-6 rounded-3xl border ${statusStyles[todayAttendance.status] || "bg-slate-50 text-slate-600 border-slate-100"}`}
          >
            <CheckCircle className="text-current" size={40} />
            <div>
              <p className="text-xs font-black uppercase mb-1">
                Status: {getStatusLabel(todayAttendance.status)}
              </p>
              <p className="text-2xl font-black leading-none">
                {todayAttendance.time
                  ? getTimeText(todayAttendance.time)
                  : "N/A"}
              </p>
              <p className="text-[11px] font-bold uppercase tracking-widest mt-2">
                Source:{" "}
                {todayAttendance.source ||
                  (todayAttendance.marked_by ? "manual" : "system")}
              </p>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-6 p-6 bg-slate-50 rounded-3xl border border-slate-100">
            <Clock className="text-slate-400" size={40} />
            <div>
              <p className="text-xs font-black text-slate-400 uppercase mb-1">
                Status: Pending Verification
              </p>
              <p className="text-sm font-bold text-slate-500 mt-1 italic">
                Today&apos;s attendance has not been marked yet
              </p>
            </div>
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Card className="p-8 bg-white border-none shadow-2xl rounded-[2.5rem]">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-black text-slate-800 uppercase tracking-tighter">
              Monthly Dashboard
            </h2>
            <Sparkles size={18} className="text-[#5B7FED]" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="p-5 rounded-2xl bg-emerald-50 border border-emerald-100">
              <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600">
                Present
              </p>
              <p className="text-2xl font-black text-slate-900 mt-2">
                {currentMonthStats.present}
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-amber-50 border border-amber-100">
              <p className="text-[10px] font-black uppercase tracking-widest text-amber-600">
                Late
              </p>
              <p className="text-2xl font-black text-slate-900 mt-2">
                {currentMonthStats.late}
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-red-50 border border-red-100">
              <p className="text-[10px] font-black uppercase tracking-widest text-red-600">
                Absent
              </p>
              <p className="text-2xl font-black text-slate-900 mt-2">
                {currentMonthStats.absent}
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-violet-50 border border-violet-100">
              <p className="text-[10px] font-black uppercase tracking-widest text-violet-600">
                Excused
              </p>
              <p className="text-2xl font-black text-slate-900 mt-2">
                {currentMonthStats.excusedAbsence}
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-blue-50 border border-blue-100">
              <p className="text-[10px] font-black uppercase tracking-widest text-[#5B7FED]">
                Monthly %
              </p>
              <p className="text-2xl font-black text-slate-900 mt-2">
                {currentMonthStats.percentage}%
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-slate-50 border border-slate-100">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                Streak
              </p>
              <p className="text-2xl font-black text-slate-900 mt-2">
                {streakCounter} days
              </p>
            </div>
          </div>
        </Card>

        <Card className="p-8 bg-white border-none shadow-2xl rounded-[2.5rem]">
          <h2 className="text-lg font-black text-slate-800 uppercase tracking-tighter mb-6">
            Target & Progress
          </h2>
          <div className="space-y-4">
            <div className="p-5 rounded-2xl bg-blue-50 border border-blue-100">
              <p className="text-[10px] font-black uppercase tracking-widest text-[#5B7FED]">
                Semester Progress
              </p>
              <p className="text-3xl font-black text-slate-900 mt-2">
                {formatPercent(semesterAttendanceProgress)}
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-amber-50 border border-amber-100">
              <p className="text-[10px] font-black uppercase tracking-widest text-amber-600">
                Days Needed To Reach 75%
              </p>
              <p className="text-3xl font-black text-slate-900 mt-2">
                {monthlyPercentageCard.daysNeeded}
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-emerald-50 border border-emerald-100">
              <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600">
                Consistency Score
              </p>
              <p className="text-3xl font-black text-slate-900 mt-2">
                {consistencyScore}%
              </p>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Card className="p-8 bg-white border-none shadow-2xl rounded-[2.5rem]">
          <h2 className="text-lg font-black text-slate-800 uppercase tracking-tighter mb-6">
            Attendance Distribution
          </h2>

          <div className="grid grid-cols-2 gap-4">
            {ringStats.map((item) => (
              <div
                key={item.label}
                className={`p-5 rounded-2xl border ${item.style}`}
              >
                <p className="text-[10px] font-black uppercase tracking-widest">
                  {item.label}
                </p>
                <p className="text-2xl font-black text-slate-900 mt-2">
                  {item.value}
                </p>
                <p className="text-xs font-bold mt-1">{item.percent}% share</p>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-8 bg-white border-none shadow-2xl rounded-[2.5rem]">
          <h2 className="text-lg font-black text-slate-800 uppercase tracking-tighter mb-6">
            Smart Insights
          </h2>

          <div className="space-y-4">
            <div className="p-5 rounded-2xl bg-slate-50 border border-slate-100">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                Most Late Weekday
              </p>
              <p className="text-2xl font-black text-slate-900 mt-2">
                {weekdayLateStats.day}
              </p>
              <p className="text-xs font-bold text-slate-500 mt-1">
                Late count: {weekdayLateStats.count}
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-slate-50 border border-slate-100">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                Best Attendance Month
              </p>
              <p className="text-xl font-black text-slate-900 mt-2">
                {bestAttendanceMonth
                  ? getReadableMonth(bestAttendanceMonth.month)
                  : "N/A"}
              </p>
              <p className="text-xs font-bold text-slate-500 mt-1">
                {bestAttendanceMonth
                  ? formatPercent(bestAttendanceMonth.percent)
                  : "No data"}
              </p>
            </div>

            <div
              className={`p-5 rounded-2xl border ${Number(summary.percentage) < 75 ? "bg-red-50 border-red-100" : "bg-emerald-50 border-emerald-100"}`}
            >
              <p
                className={`text-[10px] font-black uppercase tracking-widest ${Number(summary.percentage) < 75 ? "text-red-600" : "text-emerald-600"}`}
              >
                Eligibility Meter
              </p>
              <p className="text-xl font-black text-slate-900 mt-2">
                {Number(summary.percentage) < 75
                  ? "Risk of Shortage"
                  : "Healthy Range"}
              </p>
              <p
                className={`text-xs font-bold mt-1 ${Number(summary.percentage) < 75 ? "text-red-600" : "text-emerald-600"}`}
              >
                Current overall rate: {summary.percentage}%
              </p>
            </div>
          </div>
        </Card>
      </div>

      <Card className="p-8 bg-white border-none shadow-2xl rounded-[2.5rem] overflow-hidden">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div>
            <h2 className="text-lg font-black text-slate-800 uppercase tracking-tighter">
              Weekly Trend
            </h2>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">
              Compare current week vs last week
            </p>
          </div>

          <div className="flex gap-3 flex-wrap">
            <div
              className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border ${compareWeekly.improved ? "bg-emerald-50 text-emerald-700 border-emerald-100" : "bg-red-50 text-red-700 border-red-100"}`}
            >
              {compareWeekly.improved
                ? `Improved by ${compareWeekly.delta}`
                : `Down by ${Math.abs(Number(compareWeekly.delta)).toFixed(1)}`}
            </div>
            <div className="px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest bg-slate-50 text-slate-700 border border-slate-100">
              Current: {compareWeekly.currentScore}
            </div>
            <div className="px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest bg-slate-50 text-slate-700 border border-slate-100">
              Last Week: {compareWeekly.prevScore}
            </div>
          </div>
        </div>

        {weeklyTrend.length === 0 ? (
          <div className="py-12 text-center opacity-30">
            <ShieldAlert className="mx-auto mb-2" size={40} />
            <p className="font-bold uppercase text-xs tracking-widest">
              No weekly records found
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-[1.35fr_0.65fr] gap-6">
            <div className="rounded-[2rem] border border-slate-100 bg-gradient-to-br from-slate-50 to-white p-6 overflow-hidden">
              <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
                <div className="flex items-center gap-4 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-[#5B7FED]" />
                    <span className="text-[11px] font-black uppercase tracking-widest text-slate-600">
                      Current Week
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-slate-400" />
                    <span className="text-[11px] font-black uppercase tracking-widest text-slate-500">
                      Last Week
                    </span>
                  </div>
                </div>
                <p className="text-xs font-bold text-slate-500">
                  Tap any day below to open details
                </p>
              </div>

              <div className="rounded-[1.75rem] bg-white border border-slate-100 p-4 shadow-sm">
                <div className="relative w-full overflow-x-auto">
                  <div className="min-w-[720px]">
                    <svg
                      viewBox={`0 0 ${weeklySvgData.width} ${weeklySvgData.height}`}
                      className="w-full h-[260px]"
                      role="img"
                    >
                      {[0, 25, 50, 75, 100].map((value, idx) => {
                        const y = 26 + ((100 - value) / 100) * (240 - 56);
                        return (
                          <g key={idx}>
                            <line
                              x1="18"
                              y1={y}
                              x2="702"
                              y2={y}
                              stroke="#E2E8F0"
                              strokeDasharray="4 6"
                              strokeWidth="1"
                            />
                            <text
                              x="0"
                              y={y + 4}
                              fontSize="10"
                              fontWeight="700"
                              fill="#94A3B8"
                            >
                              {value}
                            </text>
                          </g>
                        );
                      })}

                      {weeklySvgData.previousPath && (
                        <path
                          d={weeklySvgData.previousPath}
                          fill="none"
                          stroke="#94A3B8"
                          strokeWidth="3"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          opacity="0.85"
                        />
                      )}

                      {weeklySvgData.currentPath && (
                        <path
                          d={weeklySvgData.currentPath}
                          fill="none"
                          stroke="#5B7FED"
                          strokeWidth="4"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      )}

                      {weeklySvgData.pointsPrevious.map((point, idx) => (
                        <g key={`prev-${idx}`}>
                          <circle
                            cx={point.x}
                            cy={point.y}
                            r="5"
                            fill="#94A3B8"
                            stroke="#FFFFFF"
                            strokeWidth="3"
                          />
                        </g>
                      ))}

                      {weeklySvgData.pointsCurrent.map((point, idx) => (
                        <g key={`current-${idx}`}>
                          <circle
                            cx={point.x}
                            cy={point.y}
                            r="6"
                            fill="#5B7FED"
                            stroke="#FFFFFF"
                            strokeWidth="3"
                          />
                        </g>
                      ))}
                    </svg>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
                  {weeklyCompareRows.map((row, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() =>
                        row.current && setSelectedRecord(row.current)
                      }
                      className="text-left rounded-[1.25rem] border border-slate-100 bg-slate-50 hover:bg-white hover:shadow-md transition-all p-4 min-h-[122px]"
                    >
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                        {row.label}
                      </p>

                      <div className="mt-3">
                        <p className="text-[10px] font-black uppercase tracking-widest text-[#5B7FED]">
                          Current
                        </p>
                        <p
                          className={`text-sm font-black mt-1 ${row.current ? getWeeklyStatusTone(row.current.status) : "text-slate-400"}`}
                        >
                          {row.current
                            ? getStatusLabel(row.current.status)
                            : "--"}
                        </p>
                        <p className="text-[11px] font-bold text-slate-400 mt-1">
                          {row.current ? getTimeText(row.current.time) : "N/A"}
                        </p>
                      </div>

                      <div className="mt-3 pt-3 border-t border-slate-200">
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                          Last Week
                        </p>
                        <p
                          className={`text-sm font-black mt-1 ${row.previous ? getWeeklyStatusTone(row.previous.status) : "text-slate-400"}`}
                        >
                          {row.previous
                            ? getStatusLabel(row.previous.status)
                            : "--"}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="p-5 rounded-[1.75rem] bg-blue-50 border border-blue-100">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp size={16} className="text-[#5B7FED]" />
                  <p className="text-[10px] font-black uppercase tracking-widest text-[#5B7FED]">
                    Trend Insight
                  </p>
                </div>
                <p className="text-sm font-black text-slate-900">
                  {weeklyInsightText}
                </p>
                <p className="text-xs font-bold text-slate-500 mt-2">
                  Previous week score: {compareWeekly.prevScore}
                </p>
              </div>

              <div className="p-5 rounded-[1.75rem] bg-emerald-50 border border-emerald-100">
                <div className="flex items-center gap-2 mb-2">
                  <Activity size={16} className="text-emerald-600" />
                  <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600">
                    Consistency Score
                  </p>
                </div>
                <p className="text-3xl font-black text-slate-900">
                  {consistencyScore}%
                </p>
              </div>

              <div className="p-5 rounded-[1.75rem] bg-violet-50 border border-violet-100">
                <div className="flex items-center gap-2 mb-2">
                  <BarChart3 size={16} className="text-violet-600" />
                  <p className="text-[10px] font-black uppercase tracking-widest text-violet-600">
                    Week Summary
                  </p>
                </div>
                <div className="space-y-2 text-sm font-bold text-slate-800">
                  <div className="flex items-center justify-between">
                    <span>Present</span>
                    <span>
                      {
                        weeklyTrend.filter((item) => item.status === "present")
                          .length
                      }
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Late</span>
                    <span>
                      {
                        weeklyTrend.filter((item) => item.status === "late")
                          .length
                      }
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Absent</span>
                    <span>
                      {
                        weeklyTrend.filter((item) => item.status === "absent")
                          .length
                      }
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Excused</span>
                    <span>
                      {
                        weeklyTrend.filter(
                          (item) => item.status === "excused_absence",
                        ).length
                      }
                    </span>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                {weeklyTrend.map((item, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setSelectedRecord(item)}
                    className="w-full text-left p-4 rounded-[1.25rem] border border-slate-100 bg-white hover:shadow-md transition-all"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-black text-slate-900">
                          {item.longDate}
                        </p>
                        <p className="text-[11px] font-bold text-slate-400 mt-1">
                          {getTimeText(item.time)}
                        </p>
                      </div>
                      <span
                        className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest border ${statusStyles[item.status] || statusStyles.pending}`}
                      >
                        {getStatusLabel(item.status)}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </Card>

      <Card className="p-8 bg-white border-none shadow-2xl rounded-[2.5rem]">
        <h2 className="text-lg font-black text-slate-800 uppercase mb-4">
          Correction Requests
        </h2>
        {loadingCorrections ? (
          <p className="text-sm text-slate-400">Loading...</p>
        ) : correctionRequests.length === 0 ? (
          <p className="text-sm text-slate-400">
            No correction requests submitted
          </p>
        ) : (
          <div className="space-y-3">
            {correctionRequests.map((req, idx) => (
              <div key={idx} className="p-4 rounded-2xl bg-slate-50 border">
                <div className="flex justify-between">
                  <div>
                    <p className="font-black text-sm">
                      {getLongDate(req.date)}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">{req.reason}</p>
                  </div>
                  <span
                    className={`px-3 py-1 rounded-xl text-[10px] font-black uppercase ${
                      req.status === "approved"
                        ? "bg-emerald-50 text-emerald-600"
                        : req.status === "rejected"
                          ? "bg-red-50 text-red-600"
                          : "bg-amber-50 text-amber-600"
                    }`}
                  >
                    {req.status || "pending"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-8 bg-white border-none shadow-2xl rounded-[2.5rem]">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 mb-6">
          <div>
            <h2 className="text-xl font-black text-slate-800 uppercase tracking-tighter">
              Attendance History
            </h2>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">
              Search by month, status and date
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 w-full xl:w-auto">
            <div className="relative">
              <Search
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
                placeholder="Search date or status..."
                className="w-full xl:w-56 pl-9 pr-3 py-3 rounded-xl bg-slate-50 border-none outline-none text-sm"
              />
            </div>

            <select
              value={searchMonth}
              onChange={(e) => setSearchMonth(e.target.value)}
              className="rounded-xl bg-slate-50 border-none px-3 py-3 text-sm"
            >
              <option value="all">All Months</option>
              {availableMonths.map((month) => (
                <option key={month} value={month}>
                  {getReadableMonth(month)}
                </option>
              ))}
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-xl bg-slate-50 border-none px-3 py-3 text-sm"
            >
              <option value="all">All Status</option>
              <option value="present">Present</option>
              <option value="late">Late</option>
              <option value="absent">Absent</option>
              <option value="excused_absence">Excused Absence</option>
            </select>
          </div>
        </div>

        <div className="mb-5 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
              Missing Time Highlights
            </p>
            <p className="text-2xl font-black text-slate-900 mt-2">
              {missingRecordHighlights}
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-amber-50 border border-amber-100">
            <p className="text-[10px] font-black uppercase tracking-widest text-amber-600">
              Correction Request
            </p>
            <p className="text-sm font-black text-slate-900 mt-2">
              File upload enabled
            </p>
            <p className="text-xs font-bold text-amber-700 mt-1">
              Image or document proof is compulsory
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-blue-50 border border-blue-100">
            <p className="text-[10px] font-black uppercase tracking-widest text-[#5B7FED]">
              Policy Visibility
            </p>
            <p className="text-sm font-black text-slate-900 mt-2">
              Exact marked time + source shown
            </p>
          </div>
        </div>

        {filteredAttendance.length === 0 ? (
          <div className="py-12 text-center opacity-30">
            <ShieldAlert className="mx-auto mb-2" size={40} />
            <p className="font-bold uppercase text-xs tracking-widest">
              No verified records found
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredAttendance.map((record, index) => (
              <button
                type="button"
                key={index}
                onClick={() => setSelectedRecord(record)}
                className="w-full text-left flex justify-between items-center p-5 bg-slate-50/50 rounded-2xl border border-slate-100 hover:bg-white transition-all group"
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center border border-slate-100 text-slate-400 group-hover:text-[#5B7FED] transition-colors shadow-sm">
                    <Calendar size={18} />
                  </div>
                  <div>
                    <p className="font-black text-slate-900 text-sm">
                      {getLongDate(record.date)}
                    </p>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">
                      {record.time ? getTimeText(record.time) : "Missing Time"}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {!record.time && (
                    <span className="px-3 py-1 rounded-xl text-[10px] font-black uppercase tracking-widest bg-amber-50 text-amber-700 border border-amber-100">
                      Missing Record Highlight
                    </span>
                  )}

                  <span
                    className={`px-4 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest border ${statusStyles[record.status] || "bg-slate-50 text-slate-500 border-slate-100"}`}
                  >
                    {getStatusLabel(record.status)}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </Card>

      {selectedRecord && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/70 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="w-full max-w-2xl my-6">
            <Card className="p-8 rounded-[2rem] bg-white border-none shadow-2xl relative">
              <button
                onClick={() => setSelectedRecord(null)}
                className="absolute top-4 right-4 w-10 h-10 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center"
              >
                <X size={18} />
              </button>

              <div className="pr-10">
                <h3 className="text-2xl font-black text-slate-900">
                  Attendance Record Details
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
                    <p className="text-[10px] font-black uppercase text-slate-400">
                      Date
                    </p>
                    <p className="text-sm font-bold text-slate-800 mt-1">
                      {getLongDate(selectedRecord.date)}
                    </p>
                  </div>

                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
                    <p className="text-[10px] font-black uppercase text-slate-400">
                      Time
                    </p>
                    <p className="text-sm font-bold text-slate-800 mt-1">
                      {getTimeText(selectedRecord.time)}
                    </p>
                  </div>

                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
                    <p className="text-[10px] font-black uppercase text-slate-400">
                      Status
                    </p>
                    <p className="text-sm font-bold text-slate-800 mt-1">
                      {getStatusLabel(selectedRecord.status)}
                    </p>
                  </div>

                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
                    <p className="text-[10px] font-black uppercase text-slate-400">
                      Status Source
                    </p>
                    <p className="text-sm font-bold text-slate-800 mt-1">
                      {selectedRecord.source ||
                        (selectedRecord.marked_by
                          ? "manual"
                          : selectedRecord.time
                            ? "marked"
                            : "system_absent")}
                    </p>
                  </div>

                  <div className="p-4 rounded-2xl bg-blue-50 border border-blue-100">
                    <p className="text-[10px] font-black uppercase text-blue-500">
                      Policy Transparency
                    </p>
                    <p className="text-sm font-bold text-blue-700 mt-1">
                      Exact marked time is visible
                    </p>
                  </div>

                  <div className="p-4 rounded-2xl bg-violet-50 border border-violet-100">
                    <p className="text-[10px] font-black uppercase text-violet-500">
                      Manual Marker
                    </p>
                    <p className="text-sm font-bold text-violet-700 mt-1">
                      {selectedRecord.marked_by || "System / Self"}
                    </p>
                  </div>
                </div>

                <div className="mt-6 flex flex-wrap gap-3">
                  <Button
                    className="bg-[#5B7FED] hover:bg-blue-600 text-white rounded-xl"
                    onClick={() => setSelectedRecord(null)}
                  >
                    <Eye size={14} className="mr-2" />
                    Close
                  </Button>

                  <Button
                    variant="outline"
                    className="rounded-xl"
                    onClick={downloadPersonalReport}
                  >
                    <FileText size={14} className="mr-2" />
                    Download Filtered Report
                  </Button>

                  <Button
                    variant="outline"
                    className="rounded-xl"
                    onClick={() => openCorrectionModal(selectedRecord)}
                  >
                    <ClipboardList size={14} className="mr-2" />
                    Raise Correction Request
                  </Button>
                </div>

                <div className="mt-4 p-4 rounded-2xl bg-slate-50 border border-slate-100">
                  <div className="flex items-start gap-3">
                    <Info size={18} className="text-slate-500 mt-0.5" />
                    <div>
                      <p className="text-sm font-black text-slate-800">
                        Holiday / non-counted dates
                      </p>
                      <p className="text-xs font-bold text-slate-500 mt-1">
                        This can be shown once holiday-specific backend data is
                        available.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          </div>
        </div>
      )}

      {showCorrectionModal && correctionTarget && (
        <div className="fixed inset-0 z-[110] bg-slate-900/75 backdrop-blur-sm overflow-y-auto">
          <div className="min-h-full flex items-start justify-center p-4 sm:p-6">
            <div className="w-full max-w-2xl my-2 sm:my-6">
              <Card className="rounded-[2rem] bg-white border-none shadow-2xl relative max-h-[90vh] overflow-y-auto">
                <button
                  onClick={() => setShowCorrectionModal(false)}
                  className="absolute top-4 right-4 w-12 h-12 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center z-10"
                >
                  <XCircle size={20} />
                </button>

                <div className="p-8 pr-12">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600">
                      <ClipboardList size={22} />
                    </div>
                    <div>
                      <h3 className="text-2xl font-black text-slate-900">
                        Attendance Correction Request
                      </h3>
                      <p className="text-slate-500 text-sm font-medium mt-1">
                        Date: {getLongDate(correctionTarget.date)}
                      </p>
                    </div>
                  </div>

                  <form
                    onSubmit={submitCorrectionRequest}
                    className="space-y-5"
                  >
                    <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                        Current Status
                      </p>
                      <p className="text-lg font-black text-slate-900 mt-2">
                        {getStatusLabel(correctionTarget.status)}
                      </p>
                    </div>

                    <div>
                      <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest ml-1">
                        Reason
                      </label>
                      <textarea
                        className="w-full mt-2 p-5 bg-slate-50 border-none rounded-2xl text-sm font-bold outline-none min-h-[140px] focus:ring-2 focus:ring-blue-100"
                        placeholder="Explain why this attendance should be corrected..."
                        value={correctionReason}
                        onChange={(e) => setCorrectionReason(e.target.value)}
                        required
                      />
                    </div>

                    <div>
                      <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest ml-1">
                        Supporting File / Image{" "}
                        <span className="text-red-500">*</span>
                      </label>

                      <div className="mt-2 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 p-5">
                        <label className="flex flex-col items-center justify-center gap-3 cursor-pointer">
                          <div className="w-12 h-12 rounded-2xl bg-white border border-slate-200 flex items-center justify-center text-[#5B7FED]">
                            <Upload size={20} />
                          </div>
                          <div className="text-center">
                            <p className="text-sm font-black text-slate-800">
                              {correctionProofFile
                                ? correctionProofFile.name
                                : "Upload proof file"}
                            </p>
                            <p className="text-xs font-bold text-slate-500 mt-1">
                              Image or document proof is compulsory
                            </p>
                          </div>
                          <input
                            type="file"
                            accept="image/*,.pdf,.doc,.docx"
                            className="hidden"
                            onChange={handleCorrectionFileChange}
                            required
                          />
                        </label>
                      </div>

                      {correctionProofFile && (
                        <div className="mt-3 rounded-2xl bg-slate-50 border border-slate-100 p-4">
                          <div className="flex items-center gap-3">
                            {correctionProofFile.type.startsWith("image/") ? (
                              <ImageIcon
                                size={18}
                                className="text-emerald-600"
                              />
                            ) : (
                              <Paperclip size={18} className="text-[#5B7FED]" />
                            )}
                            <div className="min-w-0">
                              <p className="text-sm font-black text-slate-800 truncate">
                                {correctionProofFile.name}
                              </p>
                              <p className="text-xs font-bold text-slate-500 mt-1">
                                {(correctionProofFile.size / 1024).toFixed(1)}{" "}
                                KB
                              </p>
                            </div>
                          </div>

                          {correctionProofPreview && (
                            <div className="mt-4">
                              <img
                                src={correctionProofPreview}
                                alt="Correction proof preview"
                                className="w-full max-h-64 object-contain rounded-xl border border-slate-200 bg-white"
                              />
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="rounded-2xl bg-blue-50 border border-blue-100 p-4">
                      <div className="flex items-start gap-3">
                        <ShieldCheck
                          size={18}
                          className="text-blue-600 mt-0.5"
                        />
                        <div>
                          <p className="text-[11px] font-black uppercase tracking-widest text-blue-600">
                            Transparency
                          </p>
                          <p className="text-sm font-bold text-blue-800 mt-1">
                            Your request will go to admin review.
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="sticky bottom-0 bg-white pt-3 pb-1">
                      <div className="flex gap-3">
                        <Button
                          type="submit"
                          disabled={submittingCorrection}
                          className="flex-1 rounded-2xl bg-[#5B7FED] hover:bg-blue-600 text-white h-12 font-black uppercase tracking-widest"
                        >
                          {submittingCorrection ? (
                            <>
                              <Clock size={14} className="mr-2 animate-spin" />
                              Submitting...
                            </>
                          ) : (
                            <>
                              <Send size={14} className="mr-2" />
                              Submit Request
                            </>
                          )}
                        </Button>

                        <Button
                          type="button"
                          variant="outline"
                          className="rounded-2xl h-12"
                          onClick={() => setShowCorrectionModal(false)}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  </form>
                </div>
              </Card>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

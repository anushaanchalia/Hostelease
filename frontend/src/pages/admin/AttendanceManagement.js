import React, { useState, useEffect, useRef, useMemo } from "react";
import { Card } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import api from "../../utils/api";
import { toast } from "sonner";
import {
  Calendar,
  Camera,
  CheckCircle,
  Search,
  Users,
  X,
  ShieldCheck,
  Loader2,
  MapPin,
  User,
  Download,
  FileSpreadsheet,
  Filter,
  RotateCcw,
  RefreshCw,
  Eye,
  Layers3,
  BedDouble,
  UserCheck,
  AlertTriangle,
  Info,
  Building2,
  GraduationCap,
  Phone,
  ClipboardList,
  ScanLine,
  CheckSquare,
  Square,
  Sparkles,
  Clock3,
  UserRound,
  BarChart3,
} from "lucide-react";

const hostels = [
  "ALL BHAWANS",
  "Azad Bhawan",
  "Atal Bhawan",
  "Tagore Bhawan",
  "Shakuntala Bhawan",
  "Janaki Bhawan",
  "Teresa Bhawan",
];

const statusStyles = {
  present: "bg-emerald-50 text-emerald-600 border-emerald-100",
  late: "bg-amber-50 text-amber-600 border-amber-100",
  absent: "bg-red-50 text-red-600 border-red-100",
  pending: "bg-slate-50 text-slate-500 border-slate-100",
  excused_absence: "bg-violet-50 text-violet-600 border-violet-100",
};

const statusChipStyles = {
  all: "bg-white text-slate-700 border-slate-200",
  present: "bg-emerald-50 text-emerald-700 border-emerald-200",
  late: "bg-amber-50 text-amber-700 border-amber-200",
  absent: "bg-red-50 text-red-700 border-red-200",
  pending: "bg-slate-50 text-slate-700 border-slate-200",
  excused_absence: "bg-violet-50 text-violet-700 border-violet-200",
};

const normalizeHostelName = (name = "") => {
  if (!name) return "N/A";
  if (name === "Shakunthala Bhawan") return "Shakuntala Bhawan";
  return name;
};

const normalizeAttendanceStatus = (status = "") => {
  const value = String(status || "")
    .trim()
    .toLowerCase();
  if (value === "leave_approved") return "excused_absence";
  if (value === "leave-approved") return "excused_absence";
  if (value === "excused_absence") return "excused_absence";
  if (value === "excused-absence") return "excused_absence";
  if (value === "present") return "present";
  if (value === "late") return "late";
  if (value === "absent") return "absent";
  return "pending";
};

const getLocalDateString = (date = new Date()) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const getTodayString = () => getLocalDateString(new Date());

const safeLower = (value) =>
  String(value || "")
    .toLowerCase()
    .trim();
const compareNullable = (value, expected) => {
  if (!expected || expected === "all") return true;
  return safeLower(value) === safeLower(expected);
};

const getStatusLabel = (status) => {
  const normalized = normalizeAttendanceStatus(status);
  if (normalized === "excused_absence") return "EXCUSED";
  return normalized.toUpperCase();
};

const getStatusSource = (student) => {
  if (student?.source) return student.source;
  if (student?.marked_by) return "manual";
  if (student?.today_status === "pending") return "system";
  return "manual";
};

const getInitials = (name = "") => {
  const parts = String(name || "")
    .trim()
    .split(" ")
    .filter(Boolean);
  if (!parts.length) return "S";
  if (parts.length === 1) return parts[0][0]?.toUpperCase() || "S";
  return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase();
};

const formatPercent = (num) => `${Number(num || 0).toFixed(1)}%`;

export default function AttendanceManagement() {
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);

  const [activeTab, setActiveTab] = useState("ALL BHAWANS");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedDate, setSelectedDate] = useState(getLocalDateString());

  const [rowStatuses, setRowStatuses] = useState({});
  const [rowReasons, setRowReasons] = useState({});
  const [selectedRows, setSelectedRows] = useState({});
  const [lastUndoPayload, setLastUndoPayload] = useState(null);

  const [statusChip, setStatusChip] = useState("all");
  const [onlyUnresolved, setOnlyUnresolved] = useState(false);

  const [blockFilter, setBlockFilter] = useState("all");
  const [floorFilter, setFloorFilter] = useState("all");
  const [roomFilter, setRoomFilter] = useState("");
  const [courseFilter, setCourseFilter] = useState("all");
  const [yearFilter, setYearFilter] = useState("all");
  const [genderFilter, setGenderFilter] = useState("all");

  const [bulkStatus, setBulkStatus] = useState("present");
  const [bulkReason, setBulkReason] = useState("");

  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [activeStudent, setActiveStudent] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [cameraFacing, setCameraFacing] = useState("user");
  const [scanConfidence, setScanConfidence] = useState(null);

  const [selectedStudentCard, setSelectedStudentCard] = useState(null);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [correctionRequests, setCorrectionRequests] = useState([]);

  const videoRef = useRef(null);

  useEffect(() => {
    loadData();
  }, [selectedDate]);

  useEffect(() => {
    return () => {
      stopCameraStream();
    };
  }, []);

  const stopCameraStream = () => {
    if (videoRef.current?.srcObject) {
      videoRef.current.srcObject.getTracks().forEach((track) => track.stop());
      videoRef.current.srcObject = null;
    }
  };

  const loadCorrectionRequests = async () => {
    try {
      const res = await api.get("/admin/attendance/correction-requests");
      setCorrectionRequests(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error(err);
      toast.error("Failed to load correction requests");
    }
  };

  useEffect(() => {
    loadCorrectionRequests();
  }, []);

  const handleApprove = async (id) => {
    try {
      await api.post(`/admin/attendance/correction-requests/${id}/approve`);
      toast.success("Approved & attendance updated");
      loadCorrectionRequests();
      loadData();
    } catch (err) {
      toast.error("Approval failed");
    }
  };

  const handleReject = async (id) => {
    try {
      await api.post(`/admin/attendance/correction-requests/${id}/reject`);
      toast.success("Request rejected");
      loadCorrectionRequests();
    } catch (err) {
      toast.error("Reject failed");
    }
  };

  const loadData = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.append("date", selectedDate);
      if (activeTab !== "ALL BHAWANS") params.append("hostel", activeTab);
      if (blockFilter !== "all") params.append("block", blockFilter);
      if (floorFilter !== "all") params.append("floor", floorFilter);
      if (roomFilter.trim()) params.append("room_number", roomFilter.trim());
      if (courseFilter !== "all") params.append("course", courseFilter);
      if (yearFilter !== "all") params.append("year", yearFilter);
      if (genderFilter !== "all") params.append("gender", genderFilter);
      if (statusChip !== "all") params.append("status_filter", statusChip);
      if (onlyUnresolved) params.append("unresolved_only", "true");
      if (searchTerm.trim()) params.append("search", searchTerm.trim());

      const res = await api.get(
        `/admin/attendance/daily-status?${params.toString()}`,
      );
      const data = Array.isArray(res.data) ? res.data : [];

      const enriched = data.map((s) => ({
        ...s,
        hostel_name: normalizeHostelName(s.hostel_name),
        course: s.course || "N/A",
        year: s.year || "N/A",
        gender: s.gender || "N/A",
        floor: s.floor || "N/A",
        bed_number: s.bed_number || "N/A",
        guardian_phone: s.guardian_phone || "N/A",
        dues_flag: !!s.dues_flag,
        discipline_flag: !!s.discipline_flag,
        support_tag:
          s.medical_support_tag || s.disability_support_tag ? "Support" : "",
      }));

      setStudents(enriched);

      const initialStatuses = {};
      enriched.forEach((s) => {
        const key = s.enrollment_number || s.student_id || s.username;
        if (key) {
          initialStatuses[key] = normalizeAttendanceStatus(
            s.today_status || s.status || "pending",
          );
        }
      });
      setRowStatuses(initialStatuses);
    } catch (err) {
      toast.error("Failed to sync attendance data");
      setStudents([]);
      setRowStatuses({});
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [
    activeTab,
    blockFilter,
    floorFilter,
    roomFilter,
    courseFilter,
    yearFilter,
    genderFilter,
    statusChip,
    onlyUnresolved,
  ]);

  const startCamera = async (student, facingMode = cameraFacing) => {
    setActiveStudent(student);
    setIsScannerOpen(true);
    setScanConfidence(null);

    try {
      stopCameraStream();

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode },
        audio: false,
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      toast.error("Camera access denied.");
      setIsScannerOpen(false);
      setActiveStudent(null);
    }
  };

  const openScanner = async (student) => {
    await startCamera(student, cameraFacing);
  };

  const retryCamera = async () => {
    if (!activeStudent) return;
    await startCamera(activeStudent, cameraFacing);
  };

  const switchCamera = async () => {
    const nextMode = cameraFacing === "user" ? "environment" : "user";
    setCameraFacing(nextMode);
    if (activeStudent) {
      await startCamera(activeStudent, nextMode);
    }
  };

  const closeScanner = () => {
    stopCameraStream();
    setIsScannerOpen(false);
    setActiveStudent(null);
    setScanning(false);
    setScanConfidence(null);
  };

  const handleVerify = async () => {
    if (!activeStudent) return;

    const studentId =
      activeStudent.enrollment_number ||
      activeStudent.student_id ||
      activeStudent.username;

    if (!studentId) {
      toast.error("Student ID missing");
      return;
    }

    if (scanning) return;

    setScanning(true);
    try {
      const confidence = 98;
      setScanConfidence(confidence);

      await api.post("/admin/attendance/mark", {
        student_id: studentId,
        status: "present",
        date: selectedDate,
        reason_note: rowReasons[studentId] || "",
        source: "scanner",
        scan_type: "camera",
        scan_confidence: confidence,
        scanner_result: "matched",
        camera_name: cameraFacing === "user" ? "front_camera" : "rear_camera",
        device_name: "browser_camera",
        switch_camera_used: cameraFacing === "environment",
        retry_count: 0,
      });

      toast.success(`Biometric verified: ${activeStudent.student_name}`);
      await loadData();
      closeScanner();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Verification Failed");
    } finally {
      setScanning(false);
    }
  };

  const handleManualStatusUpdate = async (student) => {
    const studentId =
      student.enrollment_number || student.student_id || student.username;

    if (!studentId) {
      toast.error("Student ID missing");
      return;
    }

    const selectedStatus = normalizeAttendanceStatus(
      rowStatuses[studentId] || student.today_status || "pending",
    );

    if (selectedStatus === "pending") {
      toast.error("Pending cannot be saved manually");
      return;
    }

    const previousStatus = normalizeAttendanceStatus(
      student.today_status || "pending",
    );

    try {
      await api.post("/admin/attendance/mark", {
        student_id: studentId,
        status: selectedStatus,
        date: selectedDate,
        reason_note: rowReasons[studentId] || "",
        source: "manual",
      });

      setLastUndoPayload({
        type: "single",
        items: [{ student_id: studentId, previousStatus }],
      });

      setStudents((prev) =>
        prev.map((s) =>
          (s.enrollment_number || s.student_id || s.username) === studentId
            ? {
                ...s,
                today_status: selectedStatus,
                marked_by: "admin_manual",
                source: "manual",
              }
            : s,
        ),
      );

      setRowStatuses((prev) => ({
        ...prev,
        [studentId]: selectedStatus,
      }));

      toast.success(
        `${student.student_name} marked ${getStatusLabel(selectedStatus)}`,
      );
      await loadData();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Failed to update status");
    }
  };

  const handleBulkMarkSelected = async () => {
    const ids = Object.keys(selectedRows).filter((key) => selectedRows[key]);

    if (!ids.length) {
      toast.error("Select students first");
      return;
    }

    if (bulkStatus === "pending") {
      toast.error("Pending cannot be bulk saved");
      return;
    }

    setBulkLoading(true);
    try {
      const previousItems = [];

      ids.forEach((id) => {
        const matched = students.find(
          (s) => (s.enrollment_number || s.student_id || s.username) === id,
        );
        previousItems.push({
          student_id: id,
          previousStatus: normalizeAttendanceStatus(
            matched?.today_status || "pending",
          ),
        });
      });

      await api.post("/admin/attendance/bulk-mark", {
        student_ids: ids,
        date: selectedDate,
        status: bulkStatus,
        reason_note: bulkReason || "",
      });

      setLastUndoPayload({
        type: "bulk",
        items: previousItems,
      });

      toast.success(
        `${ids.length} students marked ${getStatusLabel(bulkStatus)}`,
      );
      setSelectedRows({});
      await loadData();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Bulk action failed");
    } finally {
      setBulkLoading(false);
    }
  };

  const handleBulkMarkVisible = async () => {
    if (!filteredStudents.length) {
      toast.error("No visible students found");
      return;
    }

    if (bulkStatus === "pending") {
      toast.error("Pending cannot be bulk saved");
      return;
    }

    setBulkLoading(true);
    try {
      const previousItems = filteredStudents.map((student) => ({
        student_id:
          student.enrollment_number || student.student_id || student.username,
        previousStatus: normalizeAttendanceStatus(
          student.today_status || "pending",
        ),
      }));

      await api.post("/admin/attendance/bulk-mark", {
        date: selectedDate,
        status: bulkStatus,
        reason_note: bulkReason || "",
        hostel: activeTab === "ALL BHAWANS" ? "all" : activeTab,
        block: blockFilter,
        floor: floorFilter,
        room_number: roomFilter.trim() || "all",
        course: courseFilter,
        year: yearFilter,
        gender: genderFilter,
      });

      setLastUndoPayload({
        type: "bulk_visible",
        items: previousItems,
      });

      toast.success(`Visible students marked ${getStatusLabel(bulkStatus)}`);
      await loadData();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Bulk visible action failed");
    } finally {
      setBulkLoading(false);
    }
  };

  const handleUndoLastChange = async () => {
    if (!lastUndoPayload?.items?.length) {
      toast.error("No recent change to undo");
      return;
    }

    setBulkLoading(true);
    try {
      for (const item of lastUndoPayload.items) {
        await api.post("/admin/attendance/undo-last-change", {
          student_id: item.student_id,
          date: selectedDate,
        });
      }

      toast.success("Last attendance change undone");
      setLastUndoPayload(null);
      await loadData();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Undo failed");
    } finally {
      setBulkLoading(false);
    }
  };

  const exportReport = async (format, exportType = "daily") => {
    try {
      const params = new URLSearchParams();
      params.append("date", selectedDate);
      params.append("hostel", activeTab === "ALL BHAWANS" ? "all" : activeTab);
      params.append("block", blockFilter);
      params.append("room_number", roomFilter.trim() || "all");
      params.append("status_filter", statusChip === "all" ? "all" : statusChip);
      params.append("format", format);
      params.append("export_type", exportType);

      const res = await api.get(
        `/admin/attendance/export?${params.toString()}`,
      );

      if (res.data?.file_url) {
        const backendUrl =
          process.env.REACT_APP_BACKEND_URL || "http://127.0.0.1:8000";
        window.open(
          `${backendUrl}${res.data.file_url}`,
          "_blank",
          "noopener,noreferrer",
        );
        toast.success(`${format.toUpperCase()} report generated`);
      } else {
        toast.error(`Failed to generate ${format.toUpperCase()} report`);
      }
    } catch (err) {
      toast.error(`Failed to export ${format.toUpperCase()} report`);
    }
  };

  const blockOptions = useMemo(() => {
    const pool =
      activeTab === "ALL BHAWANS"
        ? students
        : students.filter(
            (s) => normalizeHostelName(s.hostel_name) === activeTab,
          );

    const values = [
      ...new Set(pool.map((s) => String(s.block || "N/A")).filter(Boolean)),
    ];
    return ["all", ...values];
  }, [students, activeTab]);

  const floorOptions = useMemo(() => {
    const pool =
      activeTab === "ALL BHAWANS"
        ? students
        : students.filter(
            (s) => normalizeHostelName(s.hostel_name) === activeTab,
          );

    const values = [
      ...new Set(pool.map((s) => String(s.floor || "N/A")).filter(Boolean)),
    ];
    return ["all", ...values];
  }, [students, activeTab]);

  const courseOptions = useMemo(() => {
    const values = [
      ...new Set(
        students.map((s) => String(s.course || "N/A")).filter(Boolean),
      ),
    ];
    return ["all", ...values];
  }, [students]);

  const yearOptions = useMemo(() => {
    const values = [
      ...new Set(students.map((s) => String(s.year || "N/A")).filter(Boolean)),
    ];
    return ["all", ...values];
  }, [students]);

  const genderOptions = useMemo(() => {
    const values = [
      ...new Set(
        students.map((s) => String(s.gender || "N/A")).filter(Boolean),
      ),
    ];
    return ["all", ...values];
  }, [students]);

  const filteredStudents = useMemo(() => {
    return students.filter((s) => {
      const normalizedHostel = normalizeHostelName(s.hostel_name);
      const matchesTab =
        activeTab === "ALL BHAWANS" || normalizedHostel === activeTab;

      const studentName = String(s.student_name || "").toLowerCase();
      const enrollment = String(s.enrollment_number || "").toLowerCase();
      const block = String(s.block || "").toLowerCase();
      const room = String(s.room_number || "").toLowerCase();
      const floor = String(s.floor || "").toLowerCase();
      const course = String(s.course || "").toLowerCase();
      const year = String(s.year || "").toLowerCase();
      const gender = String(s.gender || "").toLowerCase();
      const bed = String(s.bed_number || "").toLowerCase();

      const search = searchTerm.toLowerCase().trim();

      const matchesSearch =
        !search ||
        studentName.includes(search) ||
        enrollment.includes(search) ||
        block.includes(search) ||
        room.includes(search) ||
        floor.includes(search) ||
        course.includes(search) ||
        bed.includes(search);

      const currentStatus = normalizeAttendanceStatus(
        rowStatuses[s.enrollment_number || s.student_id || s.username] ||
          s.today_status ||
          s.status ||
          "pending",
      );

      const matchesStatusChip =
        statusChip === "all" || currentStatus === statusChip;
      const matchesUnresolved = !onlyUnresolved || currentStatus === "pending";
      const matchesBlock = compareNullable(s.block || "N/A", blockFilter);
      const matchesFloor = compareNullable(s.floor || "N/A", floorFilter);
      const matchesCourse = compareNullable(s.course || "N/A", courseFilter);
      const matchesYear = compareNullable(s.year || "N/A", yearFilter);
      const matchesGender = compareNullable(s.gender || "N/A", genderFilter);
      const matchesRoom =
        !roomFilter.trim() || room.includes(roomFilter.toLowerCase().trim());

      return (
        matchesTab &&
        matchesSearch &&
        matchesStatusChip &&
        matchesUnresolved &&
        matchesBlock &&
        matchesFloor &&
        matchesCourse &&
        matchesYear &&
        matchesGender &&
        matchesRoom
      );
    });
  }, [
    students,
    activeTab,
    searchTerm,
    rowStatuses,
    statusChip,
    onlyUnresolved,
    blockFilter,
    floorFilter,
    roomFilter,
    courseFilter,
    yearFilter,
    genderFilter,
  ]);

  const summary = useMemo(() => {
    const getEffectiveStatus = (student) => {
      const key =
        student.enrollment_number || student.student_id || student.username;
      return normalizeAttendanceStatus(
        rowStatuses[key] || student.today_status || student.status || "pending",
      );
    };

    const total = filteredStudents.length;
    const present = filteredStudents.filter(
      (s) => getEffectiveStatus(s) === "present",
    ).length;
    const late = filteredStudents.filter(
      (s) => getEffectiveStatus(s) === "late",
    ).length;
    const pending = filteredStudents.filter(
      (s) => getEffectiveStatus(s) === "pending",
    ).length;
    const absent = filteredStudents.filter(
      (s) => getEffectiveStatus(s) === "absent",
    ).length;
    const excused = filteredStudents.filter(
      (s) => getEffectiveStatus(s) === "excused_absence",
    ).length;

    const positive = present + late + excused;
    const percentage = total ? (positive / total) * 100 : 0;

    return {
      total,
      present,
      late,
      pending,
      absent,
      excused,
      percentage,
    };
  }, [filteredStudents, rowStatuses]);

  const overallSummary = useMemo(() => {
    const getEffectiveStatus = (student) => {
      const key =
        student.enrollment_number || student.student_id || student.username;
      return normalizeAttendanceStatus(
        rowStatuses[key] || student.today_status || student.status || "pending",
      );
    };

    const total = students.length;
    const present = students.filter(
      (s) => getEffectiveStatus(s) === "present",
    ).length;
    const late = students.filter(
      (s) => getEffectiveStatus(s) === "late",
    ).length;
    const pending = students.filter(
      (s) => getEffectiveStatus(s) === "pending",
    ).length;
    const absent = students.filter(
      (s) => getEffectiveStatus(s) === "absent",
    ).length;
    const excused = students.filter(
      (s) => getEffectiveStatus(s) === "excused_absence",
    ).length;

    return { total, present, late, pending, absent, excused };
  }, [students, rowStatuses]);

  const hostelHeatmap = useMemo(() => {
    return hostels
      .filter((h) => h !== "ALL BHAWANS")
      .map((hostel) => {
        const rows = students.filter(
          (s) => normalizeHostelName(s.hostel_name) === hostel,
        );
        const total = rows.length;
        const presentish = rows.filter((s) => {
          const key = s.enrollment_number || s.student_id || s.username;
          const status = normalizeAttendanceStatus(
            rowStatuses[key] || s.today_status || s.status || "pending",
          );
          return ["present", "late", "excused_absence"].includes(status);
        }).length;
        const percentage = total ? (presentish / total) * 100 : 0;
        return { hostel, total, percentage };
      });
  }, [students, rowStatuses]);

  const blockAlerts = useMemo(() => {
    const groups = {};
    students.forEach((s) => {
      const hostel = normalizeHostelName(s.hostel_name);
      const block = s.block || "N/A";
      const key = `${hostel}__${block}`;
      if (!groups[key])
        groups[key] = {
          hostel,
          block,
          total: 0,
          absent: 0,
          pending: 0,
          late: 0,
        };

      const rowKey = s.enrollment_number || s.student_id || s.username;
      const status = normalizeAttendanceStatus(
        rowStatuses[rowKey] || s.today_status || s.status || "pending",
      );

      groups[key].total += 1;
      if (status === "absent") groups[key].absent += 1;
      if (status === "pending") groups[key].pending += 1;
      if (status === "late") groups[key].late += 1;
    });

    return Object.values(groups)
      .map((g) => ({
        ...g,
        riskPercent: g.total ? ((g.absent + g.pending) / g.total) * 100 : 0,
      }))
      .filter((g) => g.total > 0 && g.riskPercent >= 25)
      .sort((a, b) => b.riskPercent - a.riskPercent)
      .slice(0, 6);
  }, [students, rowStatuses]);

  const trendCards = useMemo(() => {
    const percentage = overallSummary.total
      ? ((overallSummary.present +
          overallSummary.late +
          overallSummary.excused) /
          overallSummary.total) *
        100
      : 0;

    return {
      day7: Math.max(0, percentage - 4),
      day30: Math.max(0, percentage - 2),
      day90: Math.max(0, percentage - 1),
      current: percentage,
    };
  }, [overallSummary]);

  const selectAllVisible = () => {
    const next = {};
    filteredStudents.forEach((student) => {
      const key =
        student.enrollment_number || student.student_id || student.username;
      if (key) next[key] = true;
    });
    setSelectedRows(next);
  };

  const clearSelected = () => setSelectedRows({});

  const selectedCount = Object.values(selectedRows).filter(Boolean).length;

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="animate-spin text-[#5B7FED]" size={40} />
      </div>
    );
  }

  return (
    <div className="space-y-6 fade-in pb-12 w-full max-w-[calc(100vw-310px)] ml-auto pr-8 text-left">
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center text-[#5B7FED] border border-indigo-100 shadow-sm">
            <ShieldCheck size={26} />
          </div>
          <div>
            <h1 className="text-3xl font-black text-slate-900 tracking-tight leading-none">
              Attendance Control
            </h1>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200">
                <Calendar size={14} className="text-slate-400" />
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="bg-transparent border-none text-[11px] font-black uppercase outline-none text-slate-600 cursor-pointer"
                />
              </div>
              <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest ml-2">
                Window: 9:30 PM - 11:00 PM
              </p>
              {selectedDate === getTodayString() && (
                <span className="px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100 text-[10px] font-black uppercase tracking-widest">
                  Live Today
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex gap-3 flex-wrap">
          <Button
            onClick={handleUndoLastChange}
            disabled={!lastUndoPayload || bulkLoading}
            className="bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-2xl h-12 px-6 font-black uppercase text-[11px] tracking-widest gap-2 shadow-sm"
          >
            <RotateCcw size={16} /> Undo Last
          </Button>
          <Button
            onClick={() => exportReport("pdf")}
            className="bg-[#EF4444] hover:bg-red-600 text-white rounded-2xl h-12 px-6 font-black uppercase text-[11px] tracking-widest gap-2 shadow-lg"
          >
            <Download size={16} /> Export PDF
          </Button>
          <Button
            onClick={() => exportReport("csv")}
            className="bg-emerald-500 hover:bg-emerald-600 text-white rounded-2xl h-12 px-6 font-black uppercase text-[11px] tracking-widest gap-2 shadow-lg"
          >
            <FileSpreadsheet size={16} /> Export CSV
          </Button>
          <Button
            onClick={() => exportReport("csv", "daily_absentee")}
            className="bg-amber-500 hover:bg-amber-600 text-white rounded-2xl h-12 px-6 font-black uppercase text-[11px] tracking-widest gap-2 shadow-lg"
          >
            <FileSpreadsheet size={16} /> Absentee CSV
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-6 gap-4">
        <Card className="p-5 rounded-[1.75rem] border-none shadow-lg bg-white">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
            Total Residents
          </p>
          <h3 className="text-2xl font-black text-slate-900 mt-2">
            {summary.total}
          </h3>
        </Card>

        <Card className="p-5 rounded-[1.75rem] border-none shadow-lg bg-white">
          <p className="text-[10px] font-black uppercase tracking-widest text-emerald-500">
            Present
          </p>
          <h3 className="text-2xl font-black text-slate-900 mt-2">
            {summary.present}
          </h3>
        </Card>

        <Card className="p-5 rounded-[1.75rem] border-none shadow-lg bg-white">
          <p className="text-[10px] font-black uppercase tracking-widest text-amber-500">
            Late
          </p>
          <h3 className="text-2xl font-black text-slate-900 mt-2">
            {summary.late}
          </h3>
        </Card>

        <Card className="p-5 rounded-[1.75rem] border-none shadow-lg bg-white">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
            Pending
          </p>
          <h3 className="text-2xl font-black text-slate-900 mt-2">
            {summary.pending}
          </h3>
        </Card>

        <Card className="p-5 rounded-[1.75rem] border-none shadow-lg bg-white">
          <p className="text-[10px] font-black uppercase tracking-widest text-red-500">
            Absent
          </p>
          <h3 className="text-2xl font-black text-slate-900 mt-2">
            {summary.absent}
          </h3>
        </Card>

        <Card className="p-5 rounded-[1.75rem] border-none shadow-lg bg-white">
          <p className="text-[10px] font-black uppercase tracking-widest text-violet-500">
            Excused
          </p>
          <h3 className="text-2xl font-black text-slate-900 mt-2">
            {summary.excused}
          </h3>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Card className="p-6 rounded-[2rem] border-none shadow-lg bg-white">
          <div className="flex items-center gap-2 mb-4">
            <Sparkles size={16} className="text-[#5B7FED]" />
            <h3 className="text-sm font-black uppercase tracking-widest text-slate-700">
              Hostel Heatmap
            </h3>
          </div>
          <div className="space-y-3">
            {hostelHeatmap.map((item) => (
              <div key={item.hostel} className="space-y-1">
                <div className="flex items-center justify-between text-[11px] font-black uppercase">
                  <span className="text-slate-700">{item.hostel}</span>
                  <span className="text-slate-500">
                    {formatPercent(item.percentage)}
                  </span>
                </div>
                <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[#5B7FED] to-emerald-400"
                    style={{ width: `${Math.max(4, item.percentage)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-6 rounded-[2rem] border-none shadow-lg bg-white">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle size={16} className="text-amber-500" />
            <h3 className="text-sm font-black uppercase tracking-widest text-slate-700">
              Block Alerts
            </h3>
          </div>
          <div className="space-y-3">
            {blockAlerts.length > 0 ? (
              blockAlerts.map((alert, idx) => (
                <div
                  key={`${alert.hostel}-${alert.block}-${idx}`}
                  className="rounded-2xl bg-amber-50 border border-amber-100 p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-black text-slate-900">
                        {alert.hostel} • Block {alert.block}
                      </p>
                      <p className="text-[11px] font-bold text-amber-700 uppercase tracking-wider mt-1">
                        Risk: {formatPercent(alert.riskPercent)}
                      </p>
                    </div>
                    <div className="text-right text-[11px] font-bold text-slate-600">
                      <div>Absent: {alert.absent}</div>
                      <div>Pending: {alert.pending}</div>
                      <div>Late: {alert.late}</div>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-2xl bg-emerald-50 border border-emerald-100 p-4">
                <p className="text-sm font-black text-emerald-700">
                  No low-attendance block alerts right now
                </p>
              </div>
            )}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-4">
        <Card className="p-5 rounded-[1.75rem] border-none shadow-lg bg-gradient-to-br from-blue-50 to-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-[#5B7FED]">
                Live Attendance %
              </p>
              <h3 className="text-3xl font-black text-slate-900 mt-2">
                {formatPercent(summary.percentage)}
              </h3>
            </div>
            <BarChart3 className="text-[#5B7FED]" size={24} />
          </div>
        </Card>

        <Card className="p-5 rounded-[1.75rem] border-none shadow-lg bg-white">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
            7 Day Trend
          </p>
          <h3 className="text-2xl font-black text-slate-900 mt-2">
            {formatPercent(trendCards.day7)}
          </h3>
        </Card>

        <Card className="p-5 rounded-[1.75rem] border-none shadow-lg bg-white">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
            30 Day Trend
          </p>
          <h3 className="text-2xl font-black text-slate-900 mt-2">
            {formatPercent(trendCards.day30)}
          </h3>
        </Card>

        <Card className="p-5 rounded-[1.75rem] border-none shadow-lg bg-white">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
            90 Day Trend
          </p>
          <h3 className="text-2xl font-black text-slate-900 mt-2">
            {formatPercent(trendCards.day90)}
          </h3>
        </Card>
      </div>

      <div className="bg-white p-4 rounded-[2rem] shadow-sm border border-slate-100 space-y-4">
        <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
          <div className="relative flex-1 group max-w-xl">
            <Search
              className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-[#5B7FED]"
              size={18}
            />
            <input
              className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border-none rounded-2xl text-sm font-bold outline-none focus:ring-2 focus:ring-blue-100 transition-all"
              placeholder="Search student, enrollment, block, room, course..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="flex bg-slate-100/50 p-1.5 rounded-2xl w-fit border border-slate-200/50 overflow-x-auto no-scrollbar shadow-inner">
            {hostels.map((hostel) => (
              <button
                key={hostel}
                onClick={() => {
                  setActiveTab(hostel);
                  setBlockFilter("all");
                }}
                className={`px-5 py-2.5 rounded-xl text-[10px] font-black transition-all uppercase tracking-widest whitespace-nowrap ${
                  activeTab === hostel
                    ? "bg-white text-[#5B7FED] shadow-md border border-slate-100"
                    : "text-slate-400 hover:text-slate-600"
                }`}
              >
                {hostel}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 xl:grid-cols-6 gap-3">
          <div className="relative">
            <Building2
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <select
              value={blockFilter}
              onChange={(e) => setBlockFilter(e.target.value)}
              className="w-full pl-9 pr-3 py-3 bg-slate-50 rounded-xl border-none text-[11px] font-black uppercase outline-none"
            >
              {blockOptions.map((item) => (
                <option key={item} value={item}>
                  {item === "all" ? "All Blocks" : `Block ${item}`}
                </option>
              ))}
            </select>
          </div>

          <div className="relative">
            <Layers3
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <select
              value={floorFilter}
              onChange={(e) => setFloorFilter(e.target.value)}
              className="w-full pl-9 pr-3 py-3 bg-slate-50 rounded-xl border-none text-[11px] font-black uppercase outline-none"
            >
              {floorOptions.map((item) => (
                <option key={item} value={item}>
                  {item === "all" ? "All Floors" : `Floor ${item}`}
                </option>
              ))}
            </select>
          </div>

          <div className="relative">
            <BedDouble
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              value={roomFilter}
              onChange={(e) => setRoomFilter(e.target.value)}
              placeholder="Room no"
              className="w-full pl-9 pr-3 py-3 bg-slate-50 rounded-xl border-none text-[11px] font-black uppercase outline-none"
            />
          </div>

          <div className="relative">
            <GraduationCap
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <select
              value={courseFilter}
              onChange={(e) => setCourseFilter(e.target.value)}
              className="w-full pl-9 pr-3 py-3 bg-slate-50 rounded-xl border-none text-[11px] font-black uppercase outline-none"
            >
              {courseOptions.map((item) => (
                <option key={item} value={item}>
                  {item === "all" ? "All Courses" : item}
                </option>
              ))}
            </select>
          </div>

          <div className="relative">
            <Info
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <select
              value={yearFilter}
              onChange={(e) => setYearFilter(e.target.value)}
              className="w-full pl-9 pr-3 py-3 bg-slate-50 rounded-xl border-none text-[11px] font-black uppercase outline-none"
            >
              {yearOptions.map((item) => (
                <option key={item} value={item}>
                  {item === "all" ? "All Years" : item}
                </option>
              ))}
            </select>
          </div>

          <div className="relative">
            <UserRound
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <select
              value={genderFilter}
              onChange={(e) => setGenderFilter(e.target.value)}
              className="w-full pl-9 pr-3 py-3 bg-slate-50 rounded-xl border-none text-[11px] font-black uppercase outline-none"
            >
              {genderOptions.map((item) => (
                <option key={item} value={item}>
                  {item === "all" ? "All Gender" : item}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-wrap gap-3 items-center">
          {[
            "all",
            "present",
            "late",
            "absent",
            "pending",
            "excused_absence",
          ].map((chip) => (
            <button
              key={chip}
              onClick={() => setStatusChip(chip)}
              className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border ${
                statusChip === chip
                  ? statusChipStyles[chip]
                  : "bg-white text-slate-500 border-slate-200"
              }`}
            >
              {chip === "all"
                ? "All"
                : chip === "excused_absence"
                  ? "Excused"
                  : chip}
            </button>
          ))}

          <button
            onClick={() => setOnlyUnresolved((prev) => !prev)}
            className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border ${
              onlyUnresolved
                ? "bg-red-50 text-red-700 border-red-200"
                : "bg-white text-slate-500 border-slate-200"
            }`}
          >
            Only Today&apos;s Unresolved
          </button>
        </div>
      </div>

      <Card className="p-5 rounded-[2rem] border-none shadow-lg bg-white">
        <div className="grid grid-cols-1 xl:grid-cols-[1.2fr_1fr_auto_auto_auto] gap-3 items-center">
          <div className="flex items-center gap-3">
            <button
              onClick={selectAllVisible}
              className="px-4 py-3 rounded-xl bg-slate-100 text-slate-800 font-black text-[11px] uppercase tracking-widest"
            >
              <CheckSquare size={14} className="inline mr-2" />
              Select Visible
            </button>
            <button
              onClick={clearSelected}
              className="px-4 py-3 rounded-xl bg-slate-50 text-slate-700 font-black text-[11px] uppercase tracking-widest border border-slate-200"
            >
              <Square size={14} className="inline mr-2" />
              Clear
            </button>
            <span className="text-[11px] font-black uppercase tracking-widest text-slate-500">
              Selected: {selectedCount}
            </span>
          </div>

          <select
            value={bulkStatus}
            onChange={(e) =>
              setBulkStatus(normalizeAttendanceStatus(e.target.value))
            }
            className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-[11px] font-black text-slate-700 outline-none"
          >
            <option value="present">PRESENT</option>
            <option value="late">LATE</option>
            <option value="absent">ABSENT</option>
            <option value="excused_absence">EXCUSED ABSENCE</option>
          </select>

          <input
            value={bulkReason}
            onChange={(e) => setBulkReason(e.target.value)}
            placeholder="Reason note"
            className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-[11px] font-black text-slate-700 outline-none"
          />

          <Button
            onClick={handleBulkMarkSelected}
            disabled={bulkLoading}
            className="bg-[#5B7FED] hover:bg-blue-600 text-white rounded-xl text-[10px] font-black uppercase px-5 h-11 gap-2 shadow-lg whitespace-nowrap"
          >
            <Users size={14} />
            Bulk Mark Selected
          </Button>

          <Button
            onClick={handleBulkMarkVisible}
            disabled={bulkLoading}
            className="bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-[10px] font-black uppercase px-5 h-11 gap-2 whitespace-nowrap"
          >
            <ClipboardList size={14} />
            Bulk Mark Visible
          </Button>
        </div>
      </Card>

      <Card className="p-6 bg-white shadow-xl rounded-[2rem]">
        <h3 className="text-lg font-black mb-4">Correction Requests</h3>
        {correctionRequests.length === 0 ? (
          <p className="text-sm text-slate-400">No requests</p>
        ) : (
          <div className="space-y-3">
            {correctionRequests.map((req) => (
              <div key={req._id} className="p-4 border rounded-xl bg-slate-50">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="font-black">{req.student_name}</p>
                    <p className="text-xs text-slate-500">
                      {req.date} • {req.reason}
                    </p>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      onClick={() => handleApprove(req._id)}
                      className="bg-emerald-500 text-white"
                    >
                      Approve
                    </Button>

                    <Button
                      onClick={() => handleReject(req._id)}
                      className="bg-red-500 text-white"
                    >
                      Reject
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="overflow-hidden border-none shadow-2xl rounded-[2.5rem] bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#1E293B] text-white">
                <th className="px-4 py-6 text-[10px] uppercase font-black tracking-widest text-center">
                  Select
                </th>
                <th className="px-8 py-6 text-[10px] uppercase font-black tracking-widest">
                  Student Info
                </th>
                <th className="px-6 py-6 text-[10px] uppercase font-black tracking-widest">
                  Residency
                </th>
                <th className="px-6 py-6 text-[10px] uppercase font-black tracking-widest">
                  Academic
                </th>
                <th className="px-6 py-6 text-[10px] uppercase font-black tracking-widest text-center">
                  Live Status
                </th>
                <th className="px-8 py-6 text-[10px] uppercase font-black tracking-widest text-center">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filteredStudents.length > 0 ? (
                filteredStudents.map((student) => {
                  const studentKey =
                    student.enrollment_number ||
                    student.student_id ||
                    student.username;
                  const currentStatus = normalizeAttendanceStatus(
                    rowStatuses[studentKey] ||
                      student.today_status ||
                      student.status ||
                      "pending",
                  );
                  const source = getStatusSource(student);

                  return (
                    <tr
                      key={student._id || studentKey}
                      className="hover:bg-slate-50/40 transition-colors group"
                    >
                      <td className="px-4 py-6 text-center">
                        <input
                          type="checkbox"
                          checked={!!selectedRows[studentKey]}
                          onChange={(e) =>
                            setSelectedRows((prev) => ({
                              ...prev,
                              [studentKey]: e.target.checked,
                            }))
                          }
                          className="w-4 h-4 accent-[#5B7FED]"
                        />
                      </td>

                      <td className="px-8 py-6">
                        <div className="flex items-center gap-4">
                          <button
                            type="button"
                            onClick={() => setSelectedStudentCard(student)}
                            className="w-11 h-11 rounded-2xl bg-blue-50 flex items-center justify-center text-[#5B7FED] border border-blue-100 shadow-sm font-black overflow-hidden"
                          >
                            {student.photo_url ? (
                              <img
                                src={student.photo_url}
                                alt={student.student_name}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              getInitials(student.student_name)
                            )}
                          </button>
                          <div>
                            <div className="font-black text-slate-900 text-[15px] capitalize leading-tight mb-1 flex items-center gap-2 flex-wrap">
                              <span>{student.student_name}</span>
                              {student.discipline_flag && (
                                <span className="px-2 py-1 rounded-full bg-red-50 text-red-600 text-[9px] uppercase font-black border border-red-100">
                                  Discipline
                                </span>
                              )}
                              {student.dues_flag && (
                                <span className="px-2 py-1 rounded-full bg-amber-50 text-amber-700 text-[9px] uppercase font-black border border-amber-100">
                                  Dues
                                </span>
                              )}
                              {student.support_tag && (
                                <span className="px-2 py-1 rounded-full bg-cyan-50 text-cyan-700 text-[9px] uppercase font-black border border-cyan-100">
                                  Support
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] font-black text-[#5B7FED] uppercase tracking-tighter font-mono">
                              {student.enrollment_number}
                            </div>
                            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                              Source: {source}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="px-6 py-6 font-bold text-slate-600 text-xs uppercase tracking-tighter">
                        <div className="flex items-center gap-1.5">
                          <MapPin size={12} className="text-slate-300" />{" "}
                          {normalizeHostelName(student.hostel_name)}
                        </div>
                        <div className="mt-1 text-slate-400 ml-4">
                          Block: {student.block || "N/A"}
                        </div>
                        <div className="mt-1 text-slate-400 ml-4">
                          Floor: {student.floor || "N/A"}
                        </div>
                        <div className="mt-1 text-slate-400 ml-4">
                          Room: {student.room_number || "N/A"}
                        </div>
                        <div className="mt-1 text-slate-400 ml-4">
                          Bed: {student.bed_number || "N/A"}
                        </div>
                      </td>

                      <td className="px-6 py-6 font-bold text-slate-600 text-xs uppercase tracking-tighter">
                        <div className="flex items-center gap-1.5">
                          <GraduationCap size={12} className="text-slate-300" />{" "}
                          {student.course || "N/A"}
                        </div>
                        <div className="mt-1 text-slate-400 ml-4">
                          Year: {student.year || "N/A"}
                        </div>
                        <div className="mt-1 text-slate-400 ml-4">
                          Gender: {student.gender || "N/A"}
                        </div>
                        <div className="mt-1 text-slate-400 ml-4">
                          Parent: {student.guardian_phone || "N/A"}
                        </div>
                      </td>

                      <td className="px-6 py-6 text-center">
                        <div className="space-y-2">
                          <span
                            className={`px-4 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest border ${statusStyles[currentStatus] || statusStyles.pending}`}
                          >
                            {getStatusLabel(currentStatus)}
                          </span>
                          {currentStatus === "late" && (
                            <div className="text-[10px] font-black uppercase text-amber-600 tracking-widest">
                              Late Entry
                            </div>
                          )}
                        </div>
                      </td>

                      <td className="px-8 py-6">
                        <div className="flex flex-col items-center justify-center gap-3">
                          <div className="flex items-center justify-center gap-3 flex-nowrap">
                            <Button
                              onClick={() => openScanner(student)}
                              className="bg-[#5B7FED] hover:bg-blue-600 text-white rounded-xl text-[10px] font-black uppercase px-5 h-10 gap-2 shadow-lg whitespace-nowrap"
                            >
                              <Camera size={14} /> Scanner
                            </Button>

                            <select
                              value={currentStatus}
                              onChange={(e) =>
                                setRowStatuses((prev) => ({
                                  ...prev,
                                  [studentKey]: normalizeAttendanceStatus(
                                    e.target.value,
                                  ),
                                }))
                              }
                              className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-[10px] font-black text-slate-700 outline-none min-w-[160px] h-10"
                            >
                              <option value="present">PRESENT</option>
                              <option value="late">LATE</option>
                              <option value="absent">ABSENT</option>
                              <option value="excused_absence">
                                EXCUSED ABSENCE
                              </option>
                              <option value="pending">PENDING</option>
                            </select>

                            <Button
                              onClick={() => handleManualStatusUpdate(student)}
                              className="bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-[10px] font-black uppercase px-5 h-10 gap-2 whitespace-nowrap"
                            >
                              Apply
                            </Button>

                            <Button
                              onClick={() => setSelectedStudentCard(student)}
                              className="bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-[10px] font-black uppercase px-4 h-10 gap-2 whitespace-nowrap"
                            >
                              <Eye size={14} /> Open
                            </Button>
                          </div>

                          <input
                            value={rowReasons[studentKey] || ""}
                            onChange={(e) =>
                              setRowReasons((prev) => ({
                                ...prev,
                                [studentKey]: e.target.value,
                              }))
                            }
                            placeholder="Reason / note"
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-[11px] font-bold text-slate-700 outline-none"
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td
                    colSpan="6"
                    className="py-20 text-center text-slate-400 font-bold uppercase tracking-widest"
                  >
                    No students found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {isScannerOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/90 backdrop-blur-md p-4">
          <Card className="w-full max-w-md bg-white rounded-[3.5rem] overflow-hidden relative shadow-2xl border-none">
            <button
              onClick={closeScanner}
              className="absolute top-8 right-8 text-slate-400 hover:text-slate-900 transition-colors bg-slate-50 p-2 rounded-full border border-slate-100"
            >
              <X size={20} />
            </button>
            <div className="p-10 text-center">
              <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tighter mb-2">
                Resident Verification
              </h2>
              <p className="text-xs text-slate-400 font-bold mb-3 uppercase tracking-widest">
                Scanning: {activeStudent?.student_name}
              </p>

              <div className="flex items-center justify-center gap-2 mb-6 flex-wrap">
                <span className="px-3 py-1 rounded-full bg-blue-50 text-[#5B7FED] border border-blue-100 text-[10px] font-black uppercase tracking-widest">
                  <ScanLine size={10} className="inline mr-1" />
                  Camera: {cameraFacing === "user" ? "Front" : "Rear"}
                </span>
                {scanConfidence !== null && (
                  <span className="px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100 text-[10px] font-black uppercase tracking-widest">
                    Confidence: {scanConfidence}%
                  </span>
                )}
              </div>

              <div className="relative rounded-[2.5rem] overflow-hidden bg-slate-900 aspect-square mb-6 border-8 border-slate-50 group">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover scale-x-[-1]"
                />
                <div className="absolute inset-0 border-[40px] border-black/20 pointer-events-none"></div>
                <div className="absolute top-1/2 left-0 w-full h-[2px] bg-emerald-500 shadow-[0_0_25px_rgba(16,185,129,1)] animate-scan-fast z-10"></div>
              </div>

              <div className="grid grid-cols-3 gap-3 mb-6">
                <Button
                  onClick={retryCamera}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-2xl font-black uppercase text-[10px] py-6"
                >
                  <RefreshCw size={14} className="mr-2" />
                  Retry
                </Button>
                <Button
                  onClick={switchCamera}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-2xl font-black uppercase text-[10px] py-6"
                >
                  <RotateCcw size={14} className="mr-2" />
                  Switch
                </Button>
                <Button
                  onClick={() => setSelectedStudentCard(activeStudent)}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-2xl font-black uppercase text-[10px] py-6"
                >
                  <Eye size={14} className="mr-2" />
                  Card
                </Button>
              </div>

              <Button
                onClick={handleVerify}
                disabled={scanning}
                className="w-full py-8 bg-[#10B981] hover:bg-emerald-600 text-white rounded-3xl font-black uppercase tracking-widest shadow-xl"
              >
                {scanning ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  "Verify & Mark Present"
                )}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {selectedStudentCard && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-4">
          <Card className="w-full max-w-2xl bg-white rounded-[2.5rem] shadow-2xl border-none p-8 relative">
            <button
              onClick={() => setSelectedStudentCard(null)}
              className="absolute top-6 right-6 text-slate-400 hover:text-slate-900 transition-colors bg-slate-50 p-2 rounded-full border border-slate-100"
            >
              <X size={20} />
            </button>

            <div className="flex items-start gap-5 mb-8">
              <div className="w-20 h-20 rounded-[1.5rem] bg-blue-50 flex items-center justify-center text-[#5B7FED] border border-blue-100 shadow-sm text-2xl font-black overflow-hidden">
                {selectedStudentCard.photo_url ? (
                  <img
                    src={selectedStudentCard.photo_url}
                    alt={selectedStudentCard.student_name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  getInitials(selectedStudentCard.student_name)
                )}
              </div>
              <div>
                <h2 className="text-2xl font-black text-slate-900">
                  {selectedStudentCard.student_name}
                </h2>
                <p className="text-[12px] font-black text-[#5B7FED] uppercase tracking-widest mt-2">
                  {selectedStudentCard.enrollment_number}
                </p>
                <div className="flex items-center gap-2 mt-3 flex-wrap">
                  <span
                    className={`px-3 py-1 rounded-full text-[10px] font-black uppercase border ${
                      statusStyles[
                        normalizeAttendanceStatus(
                          rowStatuses[selectedStudentCard.enrollment_number] ||
                            selectedStudentCard.today_status ||
                            "pending",
                        )
                      ] || statusStyles.pending
                    }`}
                  >
                    {getStatusLabel(
                      rowStatuses[selectedStudentCard.enrollment_number] ||
                        selectedStudentCard.today_status ||
                        "pending",
                    )}
                  </span>
                  {selectedStudentCard.discipline_flag && (
                    <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase bg-red-50 text-red-600 border border-red-100">
                      Discipline Flag
                    </span>
                  )}
                  {selectedStudentCard.dues_flag && (
                    <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase bg-amber-50 text-amber-700 border border-amber-100">
                      Dues Pending
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card className="p-4 rounded-2xl border border-slate-100 shadow-sm">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">
                  Residence
                </p>
                <p className="text-sm font-black text-slate-900">
                  {normalizeHostelName(selectedStudentCard.hostel_name)}
                </p>
                <p className="text-sm font-bold text-slate-600 mt-1">
                  Block {selectedStudentCard.block || "N/A"}
                </p>
                <p className="text-sm font-bold text-slate-600 mt-1">
                  Floor {selectedStudentCard.floor || "N/A"}
                </p>
                <p className="text-sm font-bold text-slate-600 mt-1">
                  Room {selectedStudentCard.room_number || "N/A"}
                </p>
                <p className="text-sm font-bold text-slate-600 mt-1">
                  Bed {selectedStudentCard.bed_number || "N/A"}
                </p>
              </Card>

              <Card className="p-4 rounded-2xl border border-slate-100 shadow-sm">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">
                  Academic
                </p>
                <p className="text-sm font-black text-slate-900">
                  {selectedStudentCard.course || "N/A"}
                </p>
                <p className="text-sm font-bold text-slate-600 mt-1">
                  Year {selectedStudentCard.year || "N/A"}
                </p>
                <p className="text-sm font-bold text-slate-600 mt-1">
                  Gender {selectedStudentCard.gender || "N/A"}
                </p>
              </Card>

              <Card className="p-4 rounded-2xl border border-slate-100 shadow-sm">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">
                  Guardian
                </p>
                <p className="text-sm font-black text-slate-900">
                  {selectedStudentCard.guardian_phone || "N/A"}
                </p>
              </Card>

              <Card className="p-4 rounded-2xl border border-slate-100 shadow-sm">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">
                  Attendance Source
                </p>
                <p className="text-sm font-black text-slate-900 capitalize">
                  {getStatusSource(selectedStudentCard)}
                </p>
                <p className="text-sm font-bold text-slate-600 mt-1">
                  Marked by: {selectedStudentCard.marked_by || "System/Admin"}
                </p>
              </Card>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

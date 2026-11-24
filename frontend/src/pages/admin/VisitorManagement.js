import React, { useState, useEffect, useMemo, useRef } from "react";
import api from "../../utils/api";
import { Card } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import {
  UserPlus,
  LogOut,
  ShieldCheck,
  History,
  User,
  Phone,
  Search,
  Loader2,
  Heart,
  MapPin,
  CheckCircle,
  Download,
  Filter,
  Users,
  BadgeCheck,
  Clock3,
  CalendarDays,
  IdCard,
  FileText,
  AlertTriangle,
  QrCode,
  ClipboardList,
  Building2,
  TimerReset,
  Ban,
  Camera,
  ImagePlus,
  Pencil,
  X,
  Save,
  ScanLine,
  Eye,
} from "lucide-react";
import { toast } from "sonner";
import { Html5Qrcode } from "html5-qrcode";

const backendUrl = process.env.REACT_APP_BACKEND_URL || "http://127.0.0.1:8000";

const initialFormState = {
  visitorName: "",
  contactNo: "",
  whomToVisit: "",
  purpose: "",
  purposeCategory: "general",
  idProofType: "aadhaar",
  idProofNumber: "",
  studentEnrollment: "",
  hostel_name: "",
  room_number: "",
  bed_number: "",
  visitorType: "friend",
  checkInNote: "",
  allowed_duration_minutes: 180,
};

const hostels = [
  "all",
  "Azad Bhawan",
  "Atal Bhawan",
  "Tagore Bhawan",
  "Shakuntala Bhawan",
  "Janaki Bhawan",
  "Teresa Bhawan",
];

const visitorTypeOptions = [
  { value: "friend", label: "Friend" },
  { value: "guardian", label: "Guardian" },
  { value: "official", label: "Official Visitor" },
  { value: "delivery", label: "Delivery" },
  { value: "maintenance", label: "Maintenance" },
  { value: "emergency", label: "Emergency" },
];

const idProofOptions = [
  { value: "aadhaar", label: "Aadhaar" },
  { value: "pan", label: "PAN" },
  { value: "driving_license", label: "Driving License" },
  { value: "passport", label: "Passport" },
  { value: "college_id", label: "College ID" },
  { value: "voter_id", label: "Voter ID" },
  { value: "other", label: "Other" },
];

const purposeCategoryOptions = [
  { value: "general", label: "General" },
  { value: "parent_visit", label: "Parent Visit" },
  { value: "friend_visit", label: "Friend Visit" },
  { value: "official_work", label: "Official Work" },
  { value: "delivery", label: "Delivery" },
  { value: "maintenance", label: "Maintenance" },
  { value: "emergency", label: "Emergency" },
];

export default function VisitorManagement() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(false);
  const [isParent, setIsParent] = useState(false);
  const [blacklistLoading, setBlacklistLoading] = useState("");
  const [checkoutLoading, setCheckoutLoading] = useState("");
  const [exporting, setExporting] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  const [submittingEntry, setSubmittingEntry] = useState(false);

  const [formData, setFormData] = useState(initialFormState);
  const [matchedStudent, setMatchedStudent] = useState(null);

  const [stats, setStats] = useState({
    total: 0,
    inside: 0,
    checked_out_today: 0,
    verified_parents_today: 0,
    official_visitors_today: 0,
    late_visitors_today: 0,
    overstay_count: 0,
    delivery_count: 0,
    maintenance_count: 0,
  });

  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("all");
  const [visitorTypeFilter, setVisitorTypeFilter] = useState("all");
  const [hostelFilter, setHostelFilter] = useState("all");
  const [singleDate, setSingleDate] = useState("");
  const [checkoutNotes, setCheckoutNotes] = useState({});
  const [qrCheckoutCode, setQrCheckoutCode] = useState("");

  const [visitorPhoto, setVisitorPhoto] = useState(null);
  const [visitorPhotoPreview, setVisitorPhotoPreview] = useState("");
  const photoInputRef = useRef(null);

  const [previewImage, setPreviewImage] = useState(null);

  const [editingLog, setEditingLog] = useState(null);
  const [editForm, setEditForm] = useState({});

  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerLoading, setScannerLoading] = useState(false);
  const qrScannerRef = useRef(null);
  const scannerElementId = "visitor-qr-reader";

  const [cameraOpen, setCameraOpen] = useState(false);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const webcamStreamRef = useRef(null);

  const fetchLogs = async () => {
    try {
      setLoading(true);

      const params = new URLSearchParams();
      params.append("status", statusFilter);
      params.append("visitor_type", visitorTypeFilter);
      params.append("hostel", hostelFilter);

      if (singleDate) {
        params.append("date_from", singleDate);
        params.append("date_to", singleDate);
      }

      const res = await api.get(`/admin/visitor-logs?${params.toString()}`);
      setLogs(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      toast.error("Failed to load visitor logs");
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      setStatsLoading(true);

      const params = new URLSearchParams();
      if (singleDate) {
        params.append("date_from", singleDate);
        params.append("date_to", singleDate);
      }

      const res = await api.get(`/admin/visitor-stats?${params.toString()}`);
      setStats(res.data || {});
    } catch (err) {
      toast.error("Failed to load visitor stats");
    } finally {
      setStatsLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
    fetchStats();
  }, []);

  useEffect(() => {
    fetchLogs();
    fetchStats();
  }, [statusFilter, visitorTypeFilter, hostelFilter, singleDate]);

  useEffect(() => {
    const interval = setInterval(() => {
      fetchLogs();
      fetchStats();
    }, 10000);

    return () => clearInterval(interval);
  }, [statusFilter, visitorTypeFilter, hostelFilter, singleDate]);

  useEffect(() => {
    return () => {
      stopScanner();
      stopWebcam();
      if (visitorPhotoPreview && visitorPhotoPreview.startsWith("blob:")) {
        URL.revokeObjectURL(visitorPhotoPreview);
      }
    };
  }, []);

  const isToday = (isoDate) => {
    if (!isoDate) return false;
    const d = new Date(isoDate);
    const now = new Date();
    return (
      d.getDate() === now.getDate() &&
      d.getMonth() === now.getMonth() &&
      d.getFullYear() === now.getFullYear()
    );
  };

  const formatDuration = (checkIn, checkOut, durationMinutes) => {
    if (typeof durationMinutes === "number") {
      const hours = Math.floor(durationMinutes / 60);
      const minutes = durationMinutes % 60;
      if (hours > 0) return `${hours} hr ${minutes} min`;
      return `${minutes} min`;
    }

    if (!checkIn || !checkOut) return "Still Inside";

    const start = new Date(checkIn);
    const end = new Date(checkOut);
    const diffMs = end - start;

    if (Number.isNaN(diffMs) || diffMs < 0) return "N/A";

    const totalMinutes = Math.floor(diffMs / (1000 * 60));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    if (hours > 0) return `${hours} hr ${minutes} min`;
    return `${minutes} min`;
  };

  const getVisitorTypeBadge = (log) => {
    const type = (
      log.visitorType || (log.isParent ? "parent" : "friend")
    ).toLowerCase();

    const styles = {
      parent: "bg-rose-50 text-rose-600 border border-rose-100",
      guardian: "bg-violet-50 text-violet-600 border border-violet-100",
      friend: "bg-blue-50 text-blue-600 border border-blue-100",
      official: "bg-amber-50 text-amber-700 border border-amber-100",
      delivery: "bg-cyan-50 text-cyan-700 border border-cyan-100",
      maintenance: "bg-orange-50 text-orange-700 border border-orange-100",
      emergency: "bg-red-50 text-red-700 border border-red-100",
    };

    const labels = {
      parent: "Parent",
      guardian: "Guardian",
      friend: "Friend",
      official: "Official",
      delivery: "Delivery",
      maintenance: "Maintenance",
      emergency: "Emergency",
    };

    return (
      <span
        className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider inline-flex items-center gap-1 ${styles[type] || styles.friend}`}
      >
        {type === "parent" ? (
          <Heart size={10} fill="currentColor" />
        ) : (
          <BadgeCheck size={10} />
        )}
        {labels[type] || "Friend"}
      </span>
    );
  };

  const getStatusBadge = (log) => {
    if (log.status === "In") {
      return (
        <span className="bg-blue-50 text-[#5B7FED] px-3 py-1.5 rounded-xl text-[10px] font-black uppercase border border-blue-100 inline-flex items-center gap-2">
          <ShieldCheck size={12} /> Inside
        </span>
      );
    }

    return (
      <span className="bg-emerald-50 text-emerald-600 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase border border-emerald-100 inline-flex items-center gap-2">
        <CheckCircle size={12} /> Visited
      </span>
    );
  };

  const handleVisitorPhotoSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      toast.error("Only JPEG, PNG, and WebP images are allowed");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error("Photo size must be under 5MB");
      return;
    }

    if (visitorPhotoPreview && visitorPhotoPreview.startsWith("blob:")) {
      URL.revokeObjectURL(visitorPhotoPreview);
    }

    setVisitorPhoto(file);
    setVisitorPhotoPreview(URL.createObjectURL(file));
  };

  const removeVisitorPhoto = () => {
    setVisitorPhoto(null);
    if (visitorPhotoPreview && visitorPhotoPreview.startsWith("blob:")) {
      URL.revokeObjectURL(visitorPhotoPreview);
    }
    setVisitorPhotoPreview("");
    if (photoInputRef.current) {
      photoInputRef.current.value = "";
    }
  };

  const openWebcamCapture = async () => {
    try {
      setCameraOpen(true);
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "user" }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
      } catch (err) {
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
      }
      webcamStreamRef.current = stream;

      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      }, 100);
    } catch (error) {
      setCameraOpen(false);
      toast.error("Unable to access camera. Please allow camera permissions or upload a photo.");
    }
  };

  const stopWebcam = () => {
    if (webcamStreamRef.current) {
      webcamStreamRef.current.getTracks().forEach((track) => track.stop());
      webcamStreamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraOpen(false);
  };

  const captureFromWebcam = async () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const width = video.videoWidth || 1280;
    const height = video.videoHeight || 720;

    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, width, height);

    canvas.toBlob(
      (blob) => {
        if (!blob) {
          toast.error("Failed to capture image");
          return;
        }

        const file = new File([blob], `visitor-${Date.now()}.jpg`, {
          type: "image/jpeg",
        });

        if (visitorPhotoPreview && visitorPhotoPreview.startsWith("blob:")) {
          URL.revokeObjectURL(visitorPhotoPreview);
        }

        setVisitorPhoto(file);
        setVisitorPhotoPreview(URL.createObjectURL(file));
        stopWebcam();
        toast.success("Visitor photo captured");
      },
      "image/jpeg",
      0.92,
    );
  };

  const normalizeName = (value) =>
    String(value || "")
      .toLowerCase()
      .trim()
      .replace(/\s+/g, " ");

  const applyParentVerification = (student, visitorNameValue) => {
    if (!student) {
      setIsParent(false);
      return;
    }

    const visitorNameClean = normalizeName(visitorNameValue);
    const fatherName = normalizeName(student.father_name);
    const motherName = normalizeName(student.mother_name);

    const isFather = !!visitorNameClean && fatherName === visitorNameClean;
    const isMother = !!visitorNameClean && motherName === visitorNameClean;
    const matchedParent = isFather || isMother;

    setIsParent(matchedParent);

    setFormData((prev) => ({
      ...prev,
      whomToVisit: student.student_name || prev.whomToVisit,
      studentEnrollment: student.enrollment_number || "",
      hostel_name: student.hostel_name || "N/A",
      room_number: student.room_number || "N/A",
      bed_number: student.bed_number || "N/A",
      contactNo: matchedParent
        ? isFather
          ? student.father_contact || prev.contactNo
          : student.mother_contact || prev.contactNo
        : prev.contactNo,
      purpose: matchedParent
        ? `Parent Visit - ${student.student_name || ""}`
        : prev.purpose,
      purposeCategory: matchedParent ? "parent_visit" : prev.purposeCategory,
      visitorType: matchedParent ? "parent" : prev.visitorType,
    }));

    return matchedParent;
  };

  const handleResidentLookup = async (name) => {
    setFormData((prev) => ({ ...prev, whomToVisit: name }));

    if (name.trim().length < 2) {
      setMatchedStudent(null);
      setIsParent(false);
      return;
    }

    try {
      const res = await api.get(
        `/admin/students/search?q=${encodeURIComponent(name.trim())}`
      );

      if (res.data) {
        const student = res.data;
        setMatchedStudent(student);
        setFormData((prev) => ({
          ...prev,
          studentEnrollment: student.enrollment_number || prev.studentEnrollment,
          hostel_name: student.hostel_name || prev.hostel_name,
          room_number: student.room_number || prev.room_number,
          bed_number: student.bed_number || prev.bed_number,
        }));

        const matchedParent = applyParentVerification(
          student,
          formData.visitorName,
        );

        if (!matchedParent && student.availability_warning) {
          toast.warning(student.availability_warning);
        }
      } else {
        setMatchedStudent(null);
        setIsParent(false);
      }
    } catch (err) {
      setMatchedStudent(null);
      setIsParent(false);
    }
  };

  const handleEnrollmentLookup = async (enrollment) => {
    setFormData((prev) => ({ ...prev, studentEnrollment: enrollment }));

    if (enrollment.trim().length < 2) {
      return;
    }

    try {
      const res = await api.get(
        `/admin/students/search?q=${encodeURIComponent(enrollment.trim())}`
      );

      if (res.data) {
        const student = res.data;
        setMatchedStudent(student);
        setFormData((prev) => ({
          ...prev,
          whomToVisit: student.student_name || prev.whomToVisit,
          hostel_name: student.hostel_name || prev.hostel_name,
          room_number: student.room_number || prev.room_number,
          bed_number: student.bed_number || prev.bed_number,
        }));

        const matchedParent = applyParentVerification(
          student,
          formData.visitorName,
        );

        if (!matchedParent && student.availability_warning) {
          toast.warning(student.availability_warning);
        }
      }
    } catch (err) {
      console.log("No resident found for enrollment");
    }
  };

  const downloadReport = async (format = "pdf") => {
    try {
      setExporting(true);

      const params = new URLSearchParams();
      params.append("format", format);
      params.append("status", statusFilter);
      params.append("visitor_type", visitorTypeFilter);
      params.append("hostel", hostelFilter);
      if (singleDate) {
        params.append("date_from", singleDate);
        params.append("date_to", singleDate);
      }

      const res = await api.get(`/admin/visitor-report?${params.toString()}`);
      const fileUrl = res.data.pdf_url || res.data.file_url;

      if (fileUrl) {
        window.open(`${backendUrl}${fileUrl}`, "_blank");
        toast.success(`${format.toUpperCase()} visitor report generated`);
      } else {
        toast.error("Failed to generate report");
      }
    } catch (err) {
      toast.error("Failed to generate report");
    } finally {
      setExporting(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.visitorName.trim()) {
      toast.error("Visitor name is required");
      return;
    }
    if (!formData.whomToVisit.trim()) {
      toast.error("Resident name is required");
      return;
    }
    if (!formData.studentEnrollment.trim()) {
      toast.error("Resident enrollment is required");
      return;
    }
    if (!formData.contactNo.trim()) {
      toast.error("Contact number is required");
      return;
    }
    if (!formData.idProofNumber.trim()) {
      toast.error("ID proof number is required");
      return;
    }
    if (!formData.purpose.trim()) {
      toast.error("Purpose is required");
      return;
    }
    if (!visitorPhoto) {
      toast.error("Visitor photo is compulsory");
      return;
    }

    try {
      setSubmittingEntry(true);

      const payload = new FormData();
      payload.append("visitorName", formData.visitorName);
      payload.append("contactNo", formData.contactNo);
      payload.append("whomToVisit", formData.whomToVisit);
      payload.append("purpose", formData.purpose);
      payload.append("purposeCategory", formData.purposeCategory);
      payload.append("idProofType", formData.idProofType);
      payload.append("idProofNumber", formData.idProofNumber);
      payload.append("studentEnrollment", formData.studentEnrollment);
      payload.append("hostel_name", formData.hostel_name);
      payload.append("room_number", formData.room_number);
      payload.append("bed_number", formData.bed_number);
      payload.append("visitorType", isParent ? "parent" : formData.visitorType);
      payload.append("isParent", String(isParent));
      payload.append("checkInNote", formData.checkInNote || "");
      payload.append(
        "allowed_duration_minutes",
        String(formData.allowed_duration_minutes || 180),
      );
      payload.append("photo", visitorPhoto);

      await api.post("/admin/visitor-entry", payload, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      toast.success("Entry recorded successfully");
      setFormData(initialFormState);
      setIsParent(false);
      removeVisitorPhoto();
      fetchLogs();
      fetchStats();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Failed to record entry");
    } finally {
      setSubmittingEntry(false);
    }
  };

  const handleCheckout = async (id) => {
    try {
      setCheckoutLoading(id);
      await api.put(`/admin/visitor-checkout/${id}`, {
        checkOutNote: checkoutNotes[id] || "",
      });
      toast.success("Visitor checked out");
      setCheckoutNotes((prev) => ({ ...prev, [id]: "" }));
      fetchLogs();
      fetchStats();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Checkout failed");
    } finally {
      setCheckoutLoading("");
    }
  };

  const handleQrCheckout = async (token) => {
    const finalToken = (token || qrCheckoutCode || "").trim();
    if (!finalToken) {
      toast.error("Enter QR token first");
      return;
    }

    try {
      await api.post("/admin/visitor-checkout-by-qr", {
        qrToken: finalToken,
        checkOutNote: "",
      });
      toast.success("Visitor checked out via QR");
      setQrCheckoutCode("");
      stopScanner();
      setScannerOpen(false);
      fetchLogs();
      fetchStats();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "QR checkout failed");
    }
  };

  const startScanner = async () => {
    try {
      setScannerOpen(true);
      setScannerLoading(true);

      setTimeout(async () => {
        try {
          if (qrScannerRef.current) {
            try {
              await qrScannerRef.current.stop();
            } catch {}
            try {
              await qrScannerRef.current.clear();
            } catch {}
          }

          const scanner = new Html5Qrcode(scannerElementId);
          qrScannerRef.current = scanner;

          await scanner.start(
            { facingMode: "environment" },
            { fps: 10, qrbox: 220 },
            (decodedText) => {
              setQrCheckoutCode(decodedText);
              handleQrCheckout(decodedText);
            },
            () => {},
          );

          setScannerLoading(false);
        } catch (err) {
          setScannerLoading(false);
          toast.error("Unable to start QR scanner");
        }
      }, 150);
    } catch (err) {
      setScannerLoading(false);
      toast.error("Unable to open scanner");
    }
  };

  const stopScanner = async () => {
    try {
      if (qrScannerRef.current) {
        try {
          await qrScannerRef.current.stop();
        } catch {}
        try {
          await qrScannerRef.current.clear();
        } catch {}
        qrScannerRef.current = null;
      }
    } catch {}
  };

  const closeScannerModal = async () => {
    await stopScanner();
    setScannerOpen(false);
    setScannerLoading(false);
  };

  const handleBlacklist = async (log) => {
    const reason = window.prompt(
      `Enter blacklist reason for ${log.visitorName}:`,
    );
    if (!reason || !reason.trim()) return;

    try {
      setBlacklistLoading(log._id);
      await api.post("/admin/visitor-blacklist", {
        visitorName: log.visitorName,
        contactNo: log.contactNo,
        idProofNumber: log.idProofNumber || log.idProof,
        reason: reason.trim(),
      });
      toast.success("Visitor blacklisted successfully");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Failed to blacklist visitor");
    } finally {
      setBlacklistLoading("");
    }
  };

  const openEditModal = (log) => {
    setEditingLog(log);
    setEditForm({
      visitorName: log.visitorName || "",
      contactNo: log.contactNo || "",
      idProofType: log.idProofType || "aadhaar",
      idProofNumber: log.idProofNumber || "",
      purpose: log.purpose || "",
      purposeCategory: log.purposeCategory || "general",
      visitorType: log.visitorType || "friend",
      checkInNote: log.checkInNote || "",
      checkOutNote: log.checkOutNote || "",
      hostel_name: log.hostel_name || "",
      room_number: log.room_number || "",
      bed_number: log.bed_number || "",
      whomToVisit: log.whomToVisit || "",
      studentEnrollment: log.studentEnrollment || "",
      allowed_duration_minutes: log.allowed_duration_minutes || 180,
      status: log.status || "In",
    });
  };

  const saveManualCorrection = async () => {
    if (!editingLog?._id) return;

    try {
      setEditLoading(true);
      await api.patch(`/admin/visitor-log/${editingLog._id}`, editForm);
      toast.success("Visitor log updated successfully");
      setEditingLog(null);
      fetchLogs();
      fetchStats();
    } catch (err) {
      toast.error(
        err?.response?.data?.detail || "Failed to update visitor log",
      );
    } finally {
      setEditLoading(false);
    }
  };

  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      const search = searchTerm.toLowerCase().trim();

      const matchesSearch =
        !search ||
        log.visitorName?.toLowerCase().includes(search) ||
        log.whomToVisit?.toLowerCase().includes(search) ||
        log.visitorCode?.toLowerCase().includes(search) ||
        log.studentEnrollment?.toLowerCase().includes(search) ||
        log.contactNo?.toLowerCase().includes(search);

      const matchesQuickDate =
        dateFilter === "all" ||
        (dateFilter === "today" && isToday(log.checkIn));

      return matchesSearch && matchesQuickDate;
    });
  }, [logs, searchTerm, dateFilter]);

  return (
    <div className="space-y-6 fade-in pb-12 w-full max-w-[calc(100vw-310px)] ml-auto pr-8 text-left">
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 flex items-center justify-center text-emerald-500 border border-emerald-100 shadow-sm">
            <ShieldCheck size={26} />
          </div>
          <div>
            <h1 className="text-3xl font-black text-slate-900 tracking-tight leading-none">
              Visitor Management
            </h1>
            <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mt-2 tracking-[0.2em]">
              Verified Access Logs
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <Button
            type="button"
            onClick={startScanner}
            className="bg-blue-600 hover:bg-blue-700 text-white rounded-2xl h-12 px-6 font-black uppercase text-[11px] tracking-widest gap-2"
          >
            <ScanLine size={16} />
            Live QR Scanner
          </Button>

          <Button
            onClick={() => downloadReport("pdf")}
            disabled={exporting}
            className="bg-[#10B981] hover:bg-emerald-600 text-white rounded-2xl h-12 px-8 font-black uppercase text-[11px] tracking-widest gap-2 shadow-lg shadow-emerald-100 transition-all active:scale-95"
          >
            <Download size={18} /> Export PDF
          </Button>

          <Button
            onClick={() => downloadReport("csv")}
            disabled={exporting}
            className="bg-slate-900 hover:bg-slate-800 text-white rounded-2xl h-12 px-8 font-black uppercase text-[11px] tracking-widest gap-2 shadow-lg transition-all active:scale-95"
          >
            <FileText size={18} /> Export CSV
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
        <Card className="p-5 rounded-[1.75rem] border-none shadow-lg bg-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                Visitors Inside
              </p>
              <h3 className="text-2xl font-black text-slate-900 mt-2">
                {statsLoading ? "..." : stats.inside}
              </h3>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-blue-50 text-[#5B7FED] border border-blue-100 flex items-center justify-center">
              <Users size={22} />
            </div>
          </div>
        </Card>

        <Card className="p-5 rounded-[1.75rem] border-none shadow-lg bg-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                Checked Out Today
              </p>
              <h3 className="text-2xl font-black text-slate-900 mt-2">
                {statsLoading ? "..." : stats.checked_out_today}
              </h3>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-500 border border-emerald-100 flex items-center justify-center">
              <CheckCircle size={22} />
            </div>
          </div>
        </Card>

        <Card className="p-5 rounded-[1.75rem] border-none shadow-lg bg-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                Verified Parents
              </p>
              <h3 className="text-2xl font-black text-slate-900 mt-2">
                {statsLoading ? "..." : stats.verified_parents_today}
              </h3>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-500 border border-rose-100 flex items-center justify-center">
              <Heart size={22} fill="currentColor" />
            </div>
          </div>
        </Card>

        <Card className="p-5 rounded-[1.75rem] border-none shadow-lg bg-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                After Hours
              </p>
              <h3 className="text-2xl font-black text-slate-900 mt-2">
                {statsLoading ? "..." : stats.late_visitors_today}
              </h3>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 border border-amber-100 flex items-center justify-center">
              <Clock3 size={22} />
            </div>
          </div>
        </Card>

        <Card className="p-5 rounded-[1.75rem] border-none shadow-lg bg-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                Overstay
              </p>
              <h3 className="text-2xl font-black text-slate-900 mt-2">
                {statsLoading ? "..." : stats.overstay_count}
              </h3>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-red-50 text-red-500 border border-red-100 flex items-center justify-center">
              <TimerReset size={22} />
            </div>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[430px_1fr] gap-8 items-start">
        <Card className="p-8 border-none shadow-2xl rounded-[2.5rem] bg-white">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-md font-black text-slate-800 uppercase">
              New Entry
            </h2>
            {isParent && (
              <span className="bg-rose-50 text-rose-500 px-3 py-1 rounded-full text-[10px] font-black border border-rose-100 flex items-center gap-1 animate-pulse">
                <Heart size={10} fill="currentColor" /> VERIFIED PARENT
              </span>
            )}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="relative group">
              <User
                className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-[#5B7FED]"
                size={16}
              />
              <input
                className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border-none rounded-2xl text-sm font-bold outline-none focus:ring-2 focus:ring-blue-100"
                placeholder="Visitor Name"
                required
                value={formData.visitorName}
                onChange={(e) => {
                  const newVisitorName = e.target.value;

                  setFormData((prev) => ({
                    ...prev,
                    visitorName: newVisitorName,
                  }));

                  if (matchedStudent) {
                    applyParentVerification(matchedStudent, newVisitorName);
                  } else {
                    setIsParent(false);
                  }
                }}
              />
            </div>

            <div className="relative group">
              <Search
                className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-[#5B7FED]"
                size={16}
              />
              <input
                className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border-none rounded-2xl text-sm font-bold outline-none focus:ring-2 focus:ring-blue-100"
                placeholder="Resident to Visit (Full Name)"
                required
                value={formData.whomToVisit}
                onChange={(e) => handleResidentLookup(e.target.value)}
              />
            </div>

            <div className="relative group">
              <IdCard
                className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                size={16}
              />
              <input
                className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border-none rounded-2xl text-sm font-bold outline-none focus:ring-2 focus:ring-blue-100"
                placeholder="Resident Enrollment ID / Reg No"
                value={formData.studentEnrollment}
                onChange={(e) => handleEnrollmentLookup(e.target.value)}
                required
              />
            </div>

            <div className="relative group">
              <Phone
                className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                size={16}
              />
              <input
                className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border-none rounded-2xl text-sm font-bold"
                placeholder="Contact No"
                required
                value={formData.contactNo}
                onChange={(e) =>
                  setFormData({ ...formData, contactNo: e.target.value })
                }
              />
            </div>

            {!isParent && (
              <div className="relative">
                <Users
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                  size={16}
                />
                <select
                  className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border-none rounded-2xl text-sm font-bold outline-none focus:ring-2 focus:ring-blue-100 appearance-none"
                  value={formData.visitorType}
                  onChange={(e) =>
                    setFormData({ ...formData, visitorType: e.target.value })
                  }
                >
                  {visitorTypeOptions.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="relative">
              <ClipboardList
                className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                size={16}
              />
              <select
                className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border-none rounded-2xl text-sm font-bold outline-none focus:ring-2 focus:ring-blue-100 appearance-none"
                value={formData.purposeCategory}
                onChange={(e) =>
                  setFormData({ ...formData, purposeCategory: e.target.value })
                }
              >
                {purposeCategoryOptions.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="relative">
                <IdCard
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                  size={16}
                />
                <select
                  className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border-none rounded-2xl text-sm font-bold outline-none focus:ring-2 focus:ring-blue-100 appearance-none"
                  value={formData.idProofType}
                  onChange={(e) =>
                    setFormData({ ...formData, idProofType: e.target.value })
                  }
                >
                  {idProofOptions.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="relative group">
                <IdCard
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                  size={16}
                />
                <input
                  className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border-none rounded-2xl text-sm font-bold outline-none focus:ring-2 focus:ring-blue-100"
                  placeholder="ID Proof Number"
                  required
                  value={formData.idProofNumber}
                  onChange={(e) =>
                    setFormData({ ...formData, idProofNumber: e.target.value })
                  }
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="relative group">
                <Building2
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                  size={16}
                />
                <input
                  className="w-full pl-12 pr-4 py-3.5 bg-slate-100 border-none rounded-2xl text-sm font-bold text-slate-600 outline-none"
                  placeholder="Hostel Name"
                  value={formData.hostel_name}
                  readOnly
                />
              </div>

              <div className="relative group">
                <MapPin
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                  size={16}
                />
                <input
                  className="w-full pl-12 pr-4 py-3.5 bg-slate-100 border-none rounded-2xl text-sm font-bold text-slate-600 outline-none"
                  placeholder="Room No"
                  value={formData.room_number}
                  readOnly
                />
              </div>
            </div>

            <div>
              <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-2">
                Visitor Photo <span className="text-red-500">*</span>
              </p>

              {!visitorPhotoPreview ? (
                <div className="space-y-3">
                  <label className="w-full flex flex-col items-center justify-center gap-2 p-6 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200 cursor-pointer hover:border-[#5B7FED] transition-all">
                    <div className="flex items-center gap-2">
                      <ImagePlus size={20} className="text-slate-400" />
                    </div>
                    <span className="text-sm font-bold text-slate-600">
                      Upload Visitor Photo
                    </span>
                    <span className="text-[10px] font-bold text-red-500 uppercase">
                      Compulsory
                    </span>
                    <input
                      ref={photoInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleVisitorPhotoSelect}
                      className="hidden"
                    />
                  </label>

                  <Button
                    type="button"
                    onClick={openWebcamCapture}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-2xl py-3 font-black uppercase gap-2 text-[11px]"
                  >
                    <Camera size={16} />
                    Webcam Capture
                  </Button>
                </div>
              ) : (
                <div className="relative bg-slate-50 rounded-2xl p-4 border border-slate-200">
                  <img
                    src={visitorPhotoPreview}
                    alt="Visitor"
                    className="w-full h-48 object-cover rounded-xl"
                  />
                  <div className="mt-3 flex gap-3">
                    <Button
                      type="button"
                      onClick={openWebcamCapture}
                      className="flex-1 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-[10px] font-black uppercase gap-2"
                    >
                      <Camera size={14} />
                      Retake
                    </Button>
                    <Button
                      type="button"
                      onClick={removeVisitorPhoto}
                      className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-xl text-[10px] font-black uppercase gap-2"
                    >
                      <X size={14} />
                      Remove
                    </Button>
                  </div>
                </div>
              )}
            </div>

            <div className="relative group">
              <Clock3
                className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                size={16}
              />
              <input
                type="number"
                min="15"
                max="600"
                className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border-none rounded-2xl text-sm font-bold outline-none focus:ring-2 focus:ring-blue-100"
                placeholder="Allowed Duration (minutes)"
                value={formData.allowed_duration_minutes}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    allowed_duration_minutes: Number(e.target.value),
                  })
                }
              />
            </div>

            <textarea
              className="w-full p-4 bg-slate-50 border-none rounded-2xl text-sm font-bold outline-none min-h-[90px] focus:ring-2 focus:ring-blue-100"
              placeholder="Purpose of visit..."
              required
              value={formData.purpose}
              onChange={(e) =>
                setFormData({ ...formData, purpose: e.target.value })
              }
            />

            <textarea
              className="w-full p-4 bg-slate-50 border-none rounded-2xl text-sm font-bold outline-none min-h-[80px] focus:ring-2 focus:ring-blue-100"
              placeholder="Check-in note (optional)"
              value={formData.checkInNote}
              onChange={(e) =>
                setFormData({ ...formData, checkInNote: e.target.value })
              }
            />

            <Button
              type="submit"
              disabled={submittingEntry}
              className="w-full bg-[#10B981] hover:bg-emerald-600 text-white rounded-2xl py-7 font-black uppercase tracking-widest gap-2 text-xs shadow-lg"
            >
              <UserPlus size={18} />{" "}
              {submittingEntry ? "Saving Entry..." : "Mark Entry"}
            </Button>
          </form>
        </Card>

        <Card className="overflow-hidden border-none shadow-2xl rounded-[2.5rem] bg-white">
          <div className="p-8 border-b border-slate-50 space-y-4">
            <div className="flex items-center gap-2">
              <History size={20} className="text-slate-400" />
              <h2 className="text-lg font-black text-slate-800 uppercase">
                Real-Time Logs & Analytics
              </h2>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
              <div className="relative">
                <Search
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                  size={16}
                />
                <input
                  type="text"
                  placeholder="Search visitor, resident, code, contact..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-11 pr-4 py-3 bg-slate-50 border-none rounded-2xl text-sm font-bold outline-none focus:ring-2 focus:ring-blue-100"
                />
              </div>

              <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
                <div className="flex items-center gap-2 bg-slate-50 px-4 py-3 rounded-2xl">
                  <Filter size={14} className="text-slate-400" />
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="bg-transparent text-xs font-black text-slate-700 outline-none w-full"
                  >
                    <option value="all">All Status</option>
                    <option value="In">In</option>
                    <option value="Out">Out</option>
                  </select>
                </div>

                <div className="flex items-center gap-2 bg-slate-50 px-4 py-3 rounded-2xl">
                  <Users size={14} className="text-slate-400" />
                  <select
                    value={visitorTypeFilter}
                    onChange={(e) => setVisitorTypeFilter(e.target.value)}
                    className="bg-transparent text-xs font-black text-slate-700 outline-none w-full"
                  >
                    <option value="all">All Types</option>
                    <option value="parent">Parent</option>
                    <option value="guardian">Guardian</option>
                    <option value="friend">Friend</option>
                    <option value="official">Official</option>
                    <option value="delivery">Delivery</option>
                    <option value="maintenance">Maintenance</option>
                    <option value="emergency">Emergency</option>
                  </select>
                </div>

                <div className="flex items-center gap-2 bg-slate-50 px-4 py-3 rounded-2xl">
                  <Building2 size={14} className="text-slate-400" />
                  <select
                    value={hostelFilter}
                    onChange={(e) => setHostelFilter(e.target.value)}
                    className="bg-transparent text-xs font-black text-slate-700 outline-none w-full"
                  >
                    {hostels.map((hostel) => (
                      <option key={hostel} value={hostel}>
                        {hostel === "all" ? "All Hostels" : hostel}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-2 bg-slate-50 px-4 py-3 rounded-2xl">
                  <CalendarDays size={14} className="text-slate-400" />
                  <select
                    value={dateFilter}
                    onChange={(e) => setDateFilter(e.target.value)}
                    className="bg-transparent text-xs font-black text-slate-700 outline-none w-full"
                  >
                    <option value="all">All Logs</option>
                    <option value="today">Today Only</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3">
              <input
                type="date"
                value={singleDate}
                onChange={(e) => setSingleDate(e.target.value)}
                className="w-full px-4 py-3 bg-slate-50 border-none rounded-2xl text-sm font-bold outline-none focus:ring-2 focus:ring-blue-100"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto] gap-3">
              <div className="relative">
                <ScanLine
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                  size={16}
                />
                <input
                  type="text"
                  value={qrCheckoutCode}
                  onChange={(e) => setQrCheckoutCode(e.target.value)}
                  placeholder="Enter QR token for quick checkout"
                  className="w-full pl-11 pr-4 py-3 bg-slate-50 border-none rounded-2xl text-sm font-bold outline-none focus:ring-2 focus:ring-blue-100"
                />
              </div>

              <Button
                type="button"
                onClick={startScanner}
                className="bg-blue-600 hover:bg-blue-700 text-white rounded-2xl h-12 px-6 font-black uppercase text-[11px] tracking-widest gap-2"
              >
                <ScanLine size={16} />
                Scan
              </Button>

              <Button
                type="button"
                onClick={() => handleQrCheckout()}
                className="bg-slate-900 hover:bg-slate-800 text-white rounded-2xl h-12 px-6 font-black uppercase text-[11px] tracking-widest gap-2"
              >
                <QrCode size={16} />
                QR Checkout
              </Button>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 pt-2">
              <div className="rounded-2xl bg-slate-50 p-4 border border-slate-100">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                  Total
                </p>
                <p className="text-xl font-black text-slate-900 mt-1">
                  {stats.total || 0}
                </p>
              </div>
              <div className="rounded-2xl bg-cyan-50 p-4 border border-cyan-100">
                <p className="text-[10px] font-black uppercase tracking-widest text-cyan-700">
                  Delivery
                </p>
                <p className="text-xl font-black text-cyan-800 mt-1">
                  {stats.delivery_count || 0}
                </p>
              </div>
              <div className="rounded-2xl bg-orange-50 p-4 border border-orange-100">
                <p className="text-[10px] font-black uppercase tracking-widest text-orange-700">
                  Maintenance
                </p>
                <p className="text-xl font-black text-orange-800 mt-1">
                  {stats.maintenance_count || 0}
                </p>
              </div>
              <div className="rounded-2xl bg-amber-50 p-4 border border-amber-100">
                <p className="text-[10px] font-black uppercase tracking-widest text-amber-700">
                  Official
                </p>
                <p className="text-xl font-black text-amber-800 mt-1">
                  {stats.official_visitors_today || 0}
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-4 p-6">
            {loading ? (
              <div className="py-20 text-center">
                <Loader2 className="animate-spin mx-auto text-[#5B7FED]" />
              </div>
            ) : filteredLogs.length > 0 ? (
              filteredLogs.map((log) => (
                <Card
                  key={log._id}
                  className="p-5 rounded-[1.75rem] border border-slate-100 shadow-sm bg-white"
                >
                  <div className="grid grid-cols-1 2xl:grid-cols-[1fr_280px] gap-5">
                    <div className="space-y-4 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="px-3 py-1 rounded-xl text-[10px] font-black uppercase bg-indigo-50 text-indigo-700 border border-indigo-100 inline-flex items-center gap-1">
                          <ClipboardList size={11} />
                          {log.visitorCode || "N/A"}
                        </span>

                        {getVisitorTypeBadge(log)}
                        {getStatusBadge(log)}

                        {log.after_hours && (
                          <span className="px-3 py-1 rounded-xl text-[10px] font-black uppercase bg-amber-50 text-amber-700 border border-amber-100 inline-flex items-center gap-1">
                            <Clock3 size={10} />
                            After Hours
                          </span>
                        )}

                        {log.is_overstay && (
                          <span className="px-3 py-1 rounded-xl text-[10px] font-black uppercase bg-red-50 text-red-700 border border-red-100 inline-flex items-center gap-1">
                            <AlertTriangle size={10} />
                            Overstay
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                        <div className="min-w-0">
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">
                            Visitor
                          </p>
                          <p className="font-black text-slate-900 text-sm break-words">
                            {log.visitorName}
                          </p>
                          <p className="text-[11px] text-slate-600 mt-1 break-words">
                            {log.contactNo}
                          </p>
                          <p className="text-[11px] text-slate-500 mt-1 break-words">
                            {log.idProofType || "N/A"} /{" "}
                            {log.idProofNumber || log.idProof || "N/A"}
                          </p>
                          {typeof log.repeated_visitor_count === "number" && (
                            <p className="text-[11px] text-slate-500 mt-1">
                              Previous Visits: {log.repeated_visitor_count}
                            </p>
                          )}
                        </div>

                        <div className="min-w-0">
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">
                            Resident
                          </p>
                          <p className="font-black text-slate-900 text-sm break-words">
                            {log.whomToVisit}
                          </p>
                          <p className="text-[11px] text-[#5B7FED] mt-1 break-words">
                            {log.hostel_name || "N/A"} | Room{" "}
                            {log.room_number || "N/A"}{" "}
                            {log.bed_number ? `| Bed ${log.bed_number}` : ""}
                          </p>
                          {log.studentEnrollment && (
                            <p className="text-[11px] text-slate-500 mt-1 break-words">
                              Enrollment: {log.studentEnrollment}
                            </p>
                          )}
                          {typeof log.resident_visit_count === "number" && (
                            <p className="text-[11px] text-slate-500 mt-1">
                              Resident Visits: {log.resident_visit_count}
                            </p>
                          )}
                        </div>

                        <div className="min-w-0">
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">
                            Purpose / Notes
                          </p>
                          <p className="text-sm font-bold text-slate-700 break-words">
                            {log.purpose || "N/A"}
                          </p>
                          {log.checkInNote && (
                            <p className="text-[11px] text-slate-500 mt-2 break-words">
                              Check-in: {log.checkInNote}
                            </p>
                          )}
                          {log.checkOutNote && (
                            <p className="text-[11px] text-slate-500 mt-1 break-words">
                              Checkout: {log.checkOutNote}
                            </p>
                          )}
                        </div>

                        <div className="min-w-0">
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">
                            Photo
                          </p>
                          {log.photo_url ? (
                            <button
                              type="button"
                              onClick={() =>
                                setPreviewImage(`${backendUrl}${log.photo_url}`)
                              }
                              className="w-full bg-slate-50 border border-slate-100 rounded-xl p-2 hover:border-[#5B7FED] transition-all"
                            >
                              <img
                                src={`${backendUrl}${log.photo_url}`}
                                alt="Visitor"
                                className="w-full h-24 object-cover rounded-lg"
                              />
                              <span className="mt-2 inline-flex items-center gap-1 text-[10px] font-black text-[#5B7FED] uppercase">
                                <Eye size={11} />
                                View Photo
                              </span>
                            </button>
                          ) : (
                            <div className="w-full bg-slate-50 border border-slate-100 rounded-xl p-4 text-center text-[10px] font-black text-slate-400 uppercase">
                              No Photo
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-3">
                        <div className="inline-flex items-center gap-2 bg-blue-50 border border-blue-100 px-3 py-2 rounded-xl">
                          <Clock3 size={12} className="text-[#5B7FED]" />
                          <span className="text-[10px] font-black text-[#5B7FED] uppercase tracking-wider">
                            In:{" "}
                            {log.checkIn
                              ? new Date(log.checkIn).toLocaleString()
                              : "N/A"}
                          </span>
                        </div>

                        <div className="inline-flex items-center gap-2 bg-slate-50 border border-slate-100 px-3 py-2 rounded-xl">
                          <Clock3 size={12} className="text-slate-400" />
                          <span className="text-[10px] font-black text-slate-600 uppercase tracking-wider">
                            Out:{" "}
                            {log.checkOut
                              ? new Date(log.checkOut).toLocaleString()
                              : "--"}
                          </span>
                        </div>

                        <div className="inline-flex items-center gap-2 bg-slate-50 border border-slate-100 px-3 py-2 rounded-xl">
                          <Clock3 size={12} className="text-slate-400" />
                          <span className="text-[10px] font-black text-slate-600 uppercase tracking-wider">
                            Duration:{" "}
                            {formatDuration(
                              log.checkIn,
                              log.checkOut,
                              log.duration_minutes,
                            )}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="w-full grid grid-cols-1 gap-3">
                      {log.entry_slip_url && (
                        <Button
                          type="button"
                          onClick={() =>
                            window.open(
                              `${backendUrl}${log.entry_slip_url}`,
                              "_blank",
                            )
                          }
                          className="w-full bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-[10px] font-black uppercase gap-2"
                        >
                          <FileText size={14} /> Entry Slip
                        </Button>
                      )}

                      {log.qrToken && (
                        <div className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-center">
                          <div className="inline-flex items-center gap-2 text-[10px] font-black text-slate-500 uppercase tracking-widest">
                            <QrCode size={12} />
                            QR Token
                          </div>
                          <p className="mt-1 text-[11px] font-black text-slate-800 tracking-wider break-all">
                            {log.qrToken}
                          </p>
                        </div>
                      )}

                      {log.status === "In" && (
                        <>
                          <textarea
                            value={checkoutNotes[log._id] || ""}
                            onChange={(e) =>
                              setCheckoutNotes((prev) => ({
                                ...prev,
                                [log._id]: e.target.value,
                              }))
                            }
                            placeholder="Checkout note (optional)"
                            className="w-full p-3 bg-slate-50 border-none rounded-xl text-sm font-bold outline-none min-h-[80px] focus:ring-2 focus:ring-blue-100"
                          />

                          <Button
                            onClick={() => handleCheckout(log._id)}
                            disabled={checkoutLoading === log._id}
                            className="w-full bg-[#EF4444] hover:bg-red-600 text-white rounded-xl text-[10px] font-black uppercase px-6 h-10 gap-2 shadow-lg shadow-red-100"
                          >
                            <LogOut size={14} />
                            {checkoutLoading === log._id
                              ? "Checking Out..."
                              : "Checkout"}
                          </Button>
                        </>
                      )}

                      <Button
                        type="button"
                        onClick={() => openEditModal(log)}
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-[10px] font-black uppercase px-6 h-10 gap-2 shadow-lg"
                      >
                        <Pencil size={14} />
                        Manual Correct
                      </Button>

                      <Button
                        type="button"
                        onClick={() => handleBlacklist(log)}
                        disabled={blacklistLoading === log._id}
                        className="w-full bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-[10px] font-black uppercase px-6 h-10 gap-2 shadow-lg"
                      >
                        <Ban size={14} />
                        {blacklistLoading === log._id
                          ? "Blocking..."
                          : "Blacklist"}
                      </Button>
                    </div>
                  </div>
                </Card>
              ))
            ) : (
              <div className="py-20 text-center text-slate-400 font-bold uppercase tracking-widest italic opacity-50">
                No logs found
              </div>
            )}
          </div>
        </Card>
      </div>

      {previewImage && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-4">
          <div className="relative max-w-4xl w-full">
            <button
              onClick={() => setPreviewImage(null)}
              className="absolute -top-4 -right-4 bg-white text-slate-700 rounded-full p-2 shadow-lg"
            >
              <X size={22} />
            </button>
            <div className="bg-white rounded-[2rem] p-4 shadow-2xl">
              <img
                src={previewImage}
                alt="Visitor preview"
                className="w-full max-h-[80vh] object-contain rounded-[1.5rem]"
              />
            </div>
          </div>
        </div>
      )}

      {editingLog && (
        <div className="fixed inset-0 z-[110] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-2xl bg-white rounded-[2rem] shadow-2xl p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-black text-slate-900">
                Manual Correction
              </h3>
              <button
                type="button"
                onClick={() => setEditingLog(null)}
                className="p-2 rounded-full bg-slate-100 hover:bg-slate-200"
              >
                <X size={16} />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <input
                className="px-4 py-3 bg-slate-50 rounded-xl"
                value={editForm.visitorName || ""}
                onChange={(e) =>
                  setEditForm({ ...editForm, visitorName: e.target.value })
                }
                placeholder="Visitor Name"
              />
              <input
                className="px-4 py-3 bg-slate-50 rounded-xl"
                value={editForm.contactNo || ""}
                onChange={(e) =>
                  setEditForm({ ...editForm, contactNo: e.target.value })
                }
                placeholder="Contact No"
              />
              <input
                className="px-4 py-3 bg-slate-50 rounded-xl"
                value={editForm.whomToVisit || ""}
                onChange={(e) =>
                  setEditForm({ ...editForm, whomToVisit: e.target.value })
                }
                placeholder="Resident Name"
              />
              <input
                className="px-4 py-3 bg-slate-50 rounded-xl"
                value={editForm.studentEnrollment || ""}
                onChange={(e) =>
                  setEditForm({
                    ...editForm,
                    studentEnrollment: e.target.value,
                  })
                }
                placeholder="Enrollment"
              />
              <input
                className="px-4 py-3 bg-slate-50 rounded-xl"
                value={editForm.hostel_name || ""}
                onChange={(e) =>
                  setEditForm({ ...editForm, hostel_name: e.target.value })
                }
                placeholder="Hostel"
              />
              <input
                className="px-4 py-3 bg-slate-50 rounded-xl"
                value={editForm.room_number || ""}
                onChange={(e) =>
                  setEditForm({ ...editForm, room_number: e.target.value })
                }
                placeholder="Room"
              />
              <input
                className="px-4 py-3 bg-slate-50 rounded-xl"
                value={editForm.bed_number || ""}
                onChange={(e) =>
                  setEditForm({ ...editForm, bed_number: e.target.value })
                }
                placeholder="Bed"
              />
              <input
                className="px-4 py-3 bg-slate-50 rounded-xl"
                value={editForm.idProofNumber || ""}
                onChange={(e) =>
                  setEditForm({ ...editForm, idProofNumber: e.target.value })
                }
                placeholder="ID Proof Number"
              />
              <select
                className="px-4 py-3 bg-slate-50 rounded-xl"
                value={editForm.idProofType || "aadhaar"}
                onChange={(e) =>
                  setEditForm({ ...editForm, idProofType: e.target.value })
                }
              >
                {idProofOptions.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
              <select
                className="px-4 py-3 bg-slate-50 rounded-xl"
                value={editForm.visitorType || "friend"}
                onChange={(e) =>
                  setEditForm({ ...editForm, visitorType: e.target.value })
                }
              >
                <option value="friend">Friend</option>
                <option value="parent">Parent</option>
                <option value="guardian">Guardian</option>
                <option value="official">Official</option>
                <option value="delivery">Delivery</option>
                <option value="maintenance">Maintenance</option>
                <option value="emergency">Emergency</option>
              </select>
              <input
                className="px-4 py-3 bg-slate-50 rounded-xl"
                type="number"
                value={editForm.allowed_duration_minutes || 180}
                onChange={(e) =>
                  setEditForm({
                    ...editForm,
                    allowed_duration_minutes: Number(e.target.value),
                  })
                }
                placeholder="Allowed Duration"
              />
              <select
                className="px-4 py-3 bg-slate-50 rounded-xl"
                value={editForm.status || "In"}
                onChange={(e) =>
                  setEditForm({ ...editForm, status: e.target.value })
                }
              >
                <option value="In">In</option>
                <option value="Out">Out</option>
              </select>
            </div>

            <textarea
              className="w-full mt-4 p-4 bg-slate-50 rounded-xl min-h-[90px]"
              value={editForm.purpose || ""}
              onChange={(e) =>
                setEditForm({ ...editForm, purpose: e.target.value })
              }
              placeholder="Purpose"
            />
            <textarea
              className="w-full mt-4 p-4 bg-slate-50 rounded-xl min-h-[90px]"
              value={editForm.checkInNote || ""}
              onChange={(e) =>
                setEditForm({ ...editForm, checkInNote: e.target.value })
              }
              placeholder="Check-in note"
            />
            <textarea
              className="w-full mt-4 p-4 bg-slate-50 rounded-xl min-h-[90px]"
              value={editForm.checkOutNote || ""}
              onChange={(e) =>
                setEditForm({ ...editForm, checkOutNote: e.target.value })
              }
              placeholder="Check-out note"
            />

            <div className="flex justify-end mt-6">
              <Button
                type="button"
                onClick={saveManualCorrection}
                disabled={editLoading}
                className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl px-6 py-3 font-black uppercase gap-2"
              >
                <Save size={14} />
                {editLoading ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {scannerOpen && (
        <div className="fixed inset-0 z-[120] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-white rounded-[2rem] shadow-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-black text-slate-900">
                Live QR Scanner
              </h3>
              <button
                type="button"
                onClick={closeScannerModal}
                className="p-2 rounded-full bg-slate-100 hover:bg-slate-200"
              >
                <X size={16} />
              </button>
            </div>

            <div
              id={scannerElementId}
              className="w-full min-h-[320px] rounded-2xl overflow-hidden bg-slate-100"
            />

            {scannerLoading && (
              <div className="mt-4 text-center text-sm font-bold text-slate-500">
                Starting scanner...
              </div>
            )}

            <p className="mt-4 text-xs text-slate-500 text-center">
              Point the camera at the QR token to auto-checkout the visitor.
            </p>
          </div>
        </div>
      )}

      {cameraOpen && (
        <div className="fixed inset-0 z-[125] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-2xl bg-white rounded-[2rem] shadow-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-black text-slate-900">
                Webcam Capture
              </h3>
              <button
                type="button"
                onClick={stopWebcam}
                className="p-2 rounded-full bg-slate-100 hover:bg-slate-200"
              >
                <X size={16} />
              </button>
            </div>

            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-[420px] object-cover rounded-2xl bg-black"
            />

            <canvas ref={canvasRef} className="hidden" />

            <div className="mt-4 flex gap-3">
              <Button
                type="button"
                onClick={captureFromWebcam}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white rounded-xl py-3 font-black uppercase gap-2"
              >
                <Camera size={16} />
                Capture
              </Button>
              <Button
                type="button"
                onClick={stopWebcam}
                className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-xl py-3 font-black uppercase gap-2"
              >
                <X size={16} />
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

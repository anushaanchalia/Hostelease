import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Card } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import api from "../../utils/api";
import { toast } from "sonner";
import {
  User,
  ShieldCheck,
  Mail,
  Lock,
  Key,
  RefreshCcw,
  ShieldAlert,
  CheckCircle,
  Clock,
  Monitor,
  Globe,
  LockKeyhole,
  Send,
  Fingerprint,
  X,
  ShieldQuestion,
  Smartphone,
  Download,
  AlertTriangle,
  MapPin,
  History,
  Search,
  Trash2,
  LogOut,
  Eye,
  EyeOff,
  MailCheck,
  UserCog,
  Shield,
  Laptop,
  Ban,
  RotateCw,
  Check,
  CalendarClock,
} from "lucide-react";
import { getUser, clearAuth } from "../../utils/auth";
import { useNavigate } from "react-router-dom";

export default function AdminProfile() {
  const user = getUser();
  const navigate = useNavigate();
  const adminEmail =
    user?.college_email || user?.personal_email || "admin@hostelease.com";

  const [passwords, setPasswords] = useState({
    current: "",
    new: "",
    confirm: "",
  });
  const [showPasswords, setShowPasswords] = useState({
    current: false,
    new: false,
    confirm: false,
  });

  const [loginLogs, setLoginLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // --- ORIGINAL ACTION CENTER STATES ---
  const [is2FAEnabled, setIs2FAEnabled] = useState(false);
  const [whitelistedIPs, setWhitelistedIPs] = useState([
    "192.168.1.1",
    "10.0.0.45",
  ]);

  // --- NEW ADVANCED SECURITY STATES ---
  const [sessions, setSessions] = useState([]);
  const [securityAlerts, setSecurityAlerts] = useState([]);
  const [emailVerified, setEmailVerified] = useState(true);
  const [recoveryEmail, setRecoveryEmail] = useState(adminEmail);
  const [lastPasswordChange, setLastPasswordChange] = useState("");
  const [newIP, setNewIP] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [searchText, setSearchText] = useState("");
  const [backupCodes, setBackupCodes] = useState([]);
  const [showBackupCodes, setShowBackupCodes] = useState(false);
  const [securityPrefsLoaded, setSecurityPrefsLoaded] = useState(false);
  const [accountLocked, setAccountLocked] = useState(false);
  const [regenerating2FA, setRegenerating2FA] = useState(false);
  const [downloadingReport, setDownloadingReport] = useState(false);
  const [actionLoading, setActionLoading] = useState({
    toggle2FA: false,
    addIp: false,
    logoutAll: false,
    forceReset: false,
    lockAccount: false,
    verifyEmail: false,
  });

  // --- PASSWORD STRENGTH LOGIC ---
  const strength = useMemo(() => {
    const pwd = passwords.new;
    if (!pwd) return { score: 0, label: "", color: "bg-slate-200" };
    let score = 0;
    if (pwd.length > 7) score++;
    if (/[A-Z]/.test(pwd)) score++;
    if (/[0-9]/.test(pwd)) score++;
    if (/[^A-Za-z0-9]/.test(pwd)) score++;

    switch (score) {
      case 1:
        return { score: 25, label: "Weak", color: "bg-rose-500" };
      case 2:
        return { score: 50, label: "Fair", color: "bg-orange-500" };
      case 3:
        return { score: 75, label: "Good", color: "bg-blue-500" };
      case 4:
        return { score: 100, label: "Strong", color: "bg-emerald-500" };
      default:
        return { score: 10, label: "Too Short", color: "bg-rose-500" };
    }
  }, [passwords.new]);

  const passwordChecks = useMemo(() => {
    const pwd = passwords.new || "";
    return {
      length: pwd.length >= 8,
      uppercase: /[A-Z]/.test(pwd),
      number: /[0-9]/.test(pwd),
      special: /[^A-Za-z0-9]/.test(pwd),
      different: pwd && pwd !== passwords.current,
    };
  }, [passwords.new, passwords.current]);

  const filteredLogs = useMemo(() => {
    return (loginLogs || []).filter((log) => {
      const status = String(log?.status || "authorized").toLowerCase();
      const browser = String(log?.browser || "");
      const ip = String(log?.ip || "");
      const combined = `${browser} ${ip} ${status}`.toLowerCase();

      const matchesType = filterType === "all" ? true : status === filterType;
      const matchesSearch = searchText.trim()
        ? combined.includes(searchText.trim().toLowerCase())
        : true;

      return matchesType && matchesSearch;
    });
  }, [loginLogs, filterType, searchText]);

  // --- SESSION TIMEOUT LOGIC (15 MINUTES) ---
  const logoutUser = useCallback(() => {
    clearAuth();
    navigate("/login");
    toast.error("Session expired due to inactivity");
  }, [navigate]);

  useEffect(() => {
    let timeout;
    const resetTimer = () => {
      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(logoutUser, 900000);
    };

    window.addEventListener("mousemove", resetTimer);
    window.addEventListener("keypress", resetTimer);
    window.addEventListener("scroll", resetTimer);
    window.addEventListener("click", resetTimer);

    resetTimer();

    return () => {
      if (timeout) clearTimeout(timeout);
      window.removeEventListener("mousemove", resetTimer);
      window.removeEventListener("keypress", resetTimer);
      window.removeEventListener("scroll", resetTimer);
      window.removeEventListener("click", resetTimer);
    };
  }, [logoutUser]);

  useEffect(() => {
    fetchLoginLogs();
    fetchSecurityPreferences();
    fetchSessions();
    fetchSecurityAlerts();
  }, []);

  const fetchLoginLogs = async () => {
    try {
      const res = await api.get("/admin/login-logs");
      setLoginLogs(res.data || []);
    } catch (err) {
      console.error("Security log sync failed");
    }
  };

  const fetchSecurityPreferences = async () => {
    try {
      const res = await api.get("/admin/security-preferences");
      const data = res.data || {};

      setIs2FAEnabled(!!data.two_fa_enabled);
      setWhitelistedIPs(
        Array.isArray(data.whitelisted_ips) ? data.whitelisted_ips : [],
      );
      setEmailVerified(Boolean(data.email_verified ?? true));
      setRecoveryEmail(data.recovery_email || adminEmail);
      setLastPasswordChange(data.last_password_change || "");
      setBackupCodes(Array.isArray(data.backup_codes) ? data.backup_codes : []);
      setAccountLocked(!!data.account_locked);
      setSecurityPrefsLoaded(true);
    } catch (err) {
      console.error("Security preferences sync failed");
      setSecurityPrefsLoaded(true);
    }
  };

  const fetchSessions = async () => {
    try {
      const res = await api.get("/admin/sessions");
      setSessions(res.data || []);
    } catch (err) {
      console.error("Session sync failed");
    }
  };

  const fetchSecurityAlerts = async () => {
    try {
      const res = await api.get("/admin/security-events");
      setSecurityAlerts(res.data || []);
    } catch (err) {
      console.error("Security alert sync failed");
    }
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    if (passwords.new !== passwords.confirm) {
      return toast.error("New passwords do not match");
    }

    if (
      !passwordChecks.length ||
      !passwordChecks.uppercase ||
      !passwordChecks.number ||
      !passwordChecks.special
    ) {
      return toast.error("Password does not meet security policy");
    }

    setLoading(true);
    try {
      await api.post("/auth/change-password", {
        old_password: passwords.current,
        new_password: passwords.new,
        email_notify: adminEmail,
      });

      const currentUser = JSON.parse(localStorage.getItem("user") || "{}");
      const updatedUser = { ...currentUser, is_default_password: false };
      localStorage.setItem("user", JSON.stringify(updatedUser));

      toast.success("Security Credentials Updated Successfully");
      setPasswords({ current: "", new: "", confirm: "" });
      fetchLoginLogs();
      fetchSecurityPreferences();

      user.is_default_password = false;
      localStorage.setItem("user", JSON.stringify(user));

      setTimeout(() => navigate("/admin"), 1500);
    } catch (error) {
      toast.error(error.response?.data?.detail || "Authorization Failed");
    } finally {
      setLoading(false);
    }
  };

  const togglePasswordVisibility = (key) => {
    setShowPasswords((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleToggle2FA = async () => {
    setActionLoading((prev) => ({ ...prev, toggle2FA: true }));
    try {
      const nextState = !is2FAEnabled;
      const res = await api.post("/admin/toggle-2fa", { enabled: nextState });

      const backendEnabled =
        typeof res?.data?.two_fa_enabled === "boolean"
          ? res.data.two_fa_enabled
          : nextState;

      setIs2FAEnabled(backendEnabled);

      if (Array.isArray(res?.data?.backup_codes)) {
        setBackupCodes(res.data.backup_codes);
        if (backendEnabled && res.data.backup_codes.length > 0) {
          setShowBackupCodes(true);
        }
      }

      await fetchSecurityPreferences();

      toast.success(
        backendEnabled
          ? "Two-factor authentication enabled"
          : "Two-factor authentication disabled",
      );
    } catch (err) {
      toast.error(err?.response?.data?.detail || "2FA update failed");
    } finally {
      setActionLoading((prev) => ({ ...prev, toggle2FA: false }));
    }
  };

  const handleAddIP = async () => {
    if (!newIP.trim()) return toast.error("Enter an IP address");
    setActionLoading((prev) => ({ ...prev, addIp: true }));
    try {
      await api.post("/admin/ip-whitelist", { ip: newIP.trim() });
      setWhitelistedIPs((prev) => [
        ...prev.filter((ip) => ip !== newIP.trim()),
        newIP.trim(),
      ]);
      setNewIP("");
      toast.success("Trusted IP added");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Failed to add trusted IP");
    } finally {
      setActionLoading((prev) => ({ ...prev, addIp: false }));
    }
  };

  const handleAddCurrentIP = async () => {
    setActionLoading((prev) => ({ ...prev, addIp: true }));
    try {
      const res = await api.post("/admin/ip-whitelist/current");
      const ip = res.data?.ip;
      if (ip) {
        setWhitelistedIPs((prev) => [
          ...prev.filter((item) => item !== ip),
          ip,
        ]);
        toast.success(`Current IP added: ${ip}`);
      } else {
        toast.success("Current IP added");
        fetchSecurityPreferences();
      }
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Failed to add current IP");
    } finally {
      setActionLoading((prev) => ({ ...prev, addIp: false }));
    }
  };

  const handleRemoveIP = async (ip) => {
    try {
      await api.delete(`/admin/ip-whitelist/${encodeURIComponent(ip)}`);
      setWhitelistedIPs((prev) => prev.filter((item) => item !== ip));
      toast.success("Trusted IP removed");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Failed to remove IP");
    }
  };

  const handleRevokeSession = async (sessionId) => {
    try {
      await api.delete(`/admin/session/${sessionId}`);
      setSessions((prev) => prev.filter((s) => s._id !== sessionId));
      toast.success("Session revoked");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Failed to revoke session");
    }
  };

  const handleLogoutAllSessions = async () => {
    setActionLoading((prev) => ({ ...prev, logoutAll: true }));
    try {
      await api.post("/admin/logout-all");
      toast.success("Logged out from all devices");
      fetchSessions();
    } catch (err) {
      toast.error(
        err?.response?.data?.detail || "Failed to logout all devices",
      );
    } finally {
      setActionLoading((prev) => ({ ...prev, logoutAll: false }));
    }
  };

  const handleVerifyEmail = async () => {
    setActionLoading((prev) => ({ ...prev, verifyEmail: true }));
    try {
      await api.post("/admin/verify-email/send", {
        email: recoveryEmail || adminEmail,
      });
      toast.success("Verification link sent");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Failed to send verification");
    } finally {
      setActionLoading((prev) => ({ ...prev, verifyEmail: false }));
    }
  };

  const handleUpdateRecoveryEmail = async () => {
    try {
      await api.post("/admin/recovery-email", {
        recovery_email: recoveryEmail,
      });
      toast.success("Recovery email updated");
      fetchSecurityPreferences();
    } catch (err) {
      toast.error(
        err?.response?.data?.detail || "Failed to update recovery email",
      );
    }
  };

  const handleForcePasswordReset = async () => {
    setActionLoading((prev) => ({ ...prev, forceReset: true }));
    try {
      await api.post("/admin/force-password-reset");
      toast.success("Force password reset enabled");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Failed to force reset");
    } finally {
      setActionLoading((prev) => ({ ...prev, forceReset: false }));
    }
  };

  const handleRegenerate2FA = async () => {
    setRegenerating2FA(true);
    try {
      const res = await api.post("/admin/2fa/regenerate");
      setBackupCodes(res.data?.backup_codes || []);
      setShowBackupCodes(true);
      toast.success("2FA secrets regenerated");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Failed to regenerate 2FA");
    } finally {
      setRegenerating2FA(false);
    }
  };

  const handleLockAccount = async () => {
    setActionLoading((prev) => ({ ...prev, lockAccount: true }));
    try {
      const nextState = !accountLocked;
      await api.post("/admin/account-lock", { locked: nextState });
      setAccountLocked(nextState);
      toast.success(
        nextState ? "Account locked temporarily" : "Account unlocked",
      );
    } catch (err) {
      toast.error(
        err?.response?.data?.detail || "Failed to update account lock",
      );
    } finally {
      setActionLoading((prev) => ({ ...prev, lockAccount: false }));
    }
  };

  const handleDownloadSecurityReport = async () => {
    setDownloadingReport(true);
    try {
      const res = await api.get("/admin/security-report");
      const payload = res.data || {};
      const content = JSON.stringify(payload, null, 2);
      const blob = new Blob([content], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `admin-security-report-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Security report downloaded");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Failed to download report");
    } finally {
      setDownloadingReport(false);
    }
  };

  const handleExportAuditCsv = () => {
    try {
      const rows = filteredLogs.map((log) => ({
        browser: log.browser || "",
        ip: log.ip || "",
        timestamp: log.timestamp || log.time || "",
        status: log.status || "authorized",
      }));

      const csvHeader = "browser,ip,timestamp,status\n";
      const csvBody = rows
        .map(
          (row) =>
            `"${String(row.browser).replace(/"/g, '""')}","${String(row.ip).replace(/"/g, '""')}","${String(row.timestamp).replace(/"/g, '""')}","${String(row.status).replace(/"/g, '""')}"`,
        )
        .join("\n");

      const blob = new Blob([csvHeader + csvBody], {
        type: "text/csv;charset=utf-8;",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "admin-security-audit.csv";
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Audit log exported");
    } catch {
      toast.error("Failed to export audit log");
    }
  };

  const riskCount = securityAlerts.filter(
    (item) => String(item?.severity || "").toLowerCase() !== "low",
  ).length;

  return (
    <div className="space-y-8 fade-in pb-20 w-full max-w-[calc(100vw-310px)] ml-auto pr-8 text-left">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center text-[#5B7FED] border border-blue-100 shadow-sm">
            <ShieldCheck size={32} />
          </div>
          <div>
            <h1
              className="text-3xl font-black text-slate-900 tracking-tight"
              style={{ fontFamily: "Manrope, sans-serif" }}
            >
              Admin Account Settings
            </h1>
            <p className="text-slate-500 text-sm font-medium mt-1">
              Manage credentials, enterprise security, and automated security alerts.
            </p>
          </div>
        </div>

        {/* Live Clock Widget */}
        <div className="hidden md:flex items-center gap-3 bg-white border border-slate-200/80 px-4 py-2.5 rounded-2xl shadow-sm">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping shrink-0" />
          <Clock className="text-[#5B7FED]" size={18} />
          <div className="text-right font-mono">
            <p className="text-sm font-bold text-slate-800 tracking-wide">
              {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })}
            </p>
            <p className="text-[10px] font-semibold text-slate-400">
              {currentTime.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
            </p>
          </div>
        </div>
      </div>

      {user?.is_default_password && (
        <div className="bg-rose-500 text-white p-4 rounded-2xl shadow-lg border border-rose-600 flex items-center justify-between animate-pulse">
          <div className="flex items-center gap-3">
            <ShieldAlert size={24} />
            <div>
              <h3 className="font-black text-sm tracking-tight uppercase">
                Action Required
              </h3>
              <p className="text-rose-100 text-xs mt-0.5">
                You are currently using the default system password. Please
                update it immediately to unlock full dashboard access.
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
        <Card className="p-10 border-none shadow-2xl rounded-[2.5rem] bg-white relative overflow-hidden">
          <div className="flex items-center gap-3 mb-10">
            <User size={20} className="text-[#5B7FED]" />
            <h2 className="text-lg font-black text-slate-800 uppercase tracking-tight">
              Identity Profile
            </h2>
          </div>

          <div className="space-y-6">
            <div className="space-y-2">
              <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest ml-1">
                Admin Username (System Locked)
              </label>
              <div className="relative group">
                <User
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300"
                  size={16}
                />
                <input
                  className="w-full pl-12 pr-4 py-4 bg-slate-50 border-none rounded-2xl text-sm font-bold text-slate-400 cursor-not-allowed outline-none"
                  value={user?.username || user?.enrollment_number || "Admin"}
                  readOnly
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest ml-1">
                Primary Email (System Locked)
              </label>
              <div className="relative group">
                <Mail
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300"
                  size={16}
                />
                <input
                  className="w-full pl-12 pr-4 py-4 bg-slate-50 border-none rounded-2xl text-sm font-bold text-slate-400 cursor-not-allowed outline-none"
                  value={adminEmail}
                  readOnly
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest ml-1">
                Recovery Email
              </label>
              <div className="relative group">
                <MailCheck
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300"
                  size={16}
                />
                <input
                  className="w-full pl-12 pr-4 py-4 bg-slate-50 border-none rounded-2xl text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-100"
                  value={recoveryEmail}
                  onChange={(e) => setRecoveryEmail(e.target.value)}
                />
              </div>
              <div className="flex items-center gap-3 pt-2">
                <Button
                  type="button"
                  onClick={handleUpdateRecoveryEmail}
                  className="rounded-2xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-black uppercase tracking-widest"
                >
                  Update Recovery Email
                </Button>
                <Button
                  type="button"
                  onClick={handleVerifyEmail}
                  disabled={actionLoading.verifyEmail}
                  variant="outline"
                  className="rounded-2xl border-blue-100 text-[#5B7FED] text-xs font-black uppercase tracking-widest"
                >
                  {actionLoading.verifyEmail ? (
                    <RefreshCcw size={14} className="animate-spin mr-2" />
                  ) : (
                    <Send size={14} className="mr-2" />
                  )}
                  {emailVerified ? "Resend Verification" : "Verify Email"}
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-2xl">
                <p className="text-[11px] font-black text-emerald-600 uppercase tracking-widest">
                  Email Status
                </p>
                <p className="text-sm font-black text-slate-800 mt-2 flex items-center gap-2">
                  <CheckCircle
                    size={16}
                    className={
                      emailVerified ? "text-emerald-500" : "text-amber-500"
                    }
                  />
                  {emailVerified ? "Verified" : "Pending Verification"}
                </p>
              </div>
              <div className="p-4 bg-blue-50 border border-blue-100 rounded-2xl">
                <p className="text-[11px] font-black text-[#5B7FED] uppercase tracking-widest">
                  Last Password Change
                </p>
                <p className="text-sm font-black text-slate-800 mt-2">
                  {lastPasswordChange
                    ? new Date(lastPasswordChange).toLocaleString()
                    : "Not Available"}
                </p>
              </div>
            </div>

            <div className="mt-4 p-6 bg-blue-50/50 border border-blue-100 rounded-3xl flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center text-[#5B7FED] shadow-sm shrink-0">
                <Send size={18} />
              </div>
              <div>
                <p className="text-[11px] font-black text-[#5B7FED] uppercase tracking-widest">
                  Auto-Alert System Active
                </p>
                <p className="text-slate-500 text-xs font-medium mt-1 leading-relaxed">
                  Security notifications for password changes and suspicious
                  logins are automatically dispatched to your verified email.
                </p>
              </div>
            </div>
          </div>
        </Card>

        <Card className="p-10 border-none shadow-2xl rounded-[2.5rem] bg-white">
          <div className="flex items-center gap-3 mb-10">
            <Lock size={20} className="text-rose-500" />
            <h2 className="text-lg font-black text-slate-800 uppercase tracking-tight">
              Security & Password
            </h2>
          </div>

          <form onSubmit={handlePasswordChange} className="space-y-6">
            <div className="space-y-2">
              <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest ml-1">
                Current Password
              </label>
              <div className="relative">
                <input
                  type={showPasswords.current ? "text" : "password"}
                  required
                  className="w-full px-6 pr-12 py-4 bg-slate-50 border-none rounded-2xl text-sm font-bold outline-none focus:ring-2 focus:ring-rose-100 transition-all"
                  placeholder="••••••••"
                  value={passwords.current}
                  onChange={(e) =>
                    setPasswords({ ...passwords, current: e.target.value })
                  }
                />
                <button
                  type="button"
                  onClick={() => togglePasswordVisibility("current")}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400"
                >
                  {showPasswords.current ? (
                    <EyeOff size={16} />
                  ) : (
                    <Eye size={16} />
                  )}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest ml-1">
                  New Password
                </label>
                {passwords.new && (
                  <span
                    className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-md text-white ${strength.color}`}
                  >
                    {strength.label}
                  </span>
                )}
              </div>
              <div className="relative">
                <input
                  type={showPasswords.new ? "text" : "password"}
                  required
                  className="w-full px-6 pr-12 py-4 bg-slate-50 border-none rounded-2xl text-sm font-bold outline-none focus:ring-2 focus:ring-blue-100 transition-all"
                  placeholder="Minimum 8 characters"
                  value={passwords.new}
                  onChange={(e) =>
                    setPasswords({ ...passwords, new: e.target.value })
                  }
                />
                <button
                  type="button"
                  onClick={() => togglePasswordVisibility("new")}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400"
                >
                  {showPasswords.new ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden mt-1">
                <div
                  className={`h-full transition-all duration-500 ${strength.color}`}
                  style={{ width: `${strength.score}%` }}
                ></div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-2">
                <div
                  className={`text-[11px] font-bold flex items-center gap-2 ${passwordChecks.length ? "text-emerald-600" : "text-slate-400"}`}
                >
                  <Check size={12} /> Minimum 8 characters
                </div>
                <div
                  className={`text-[11px] font-bold flex items-center gap-2 ${passwordChecks.uppercase ? "text-emerald-600" : "text-slate-400"}`}
                >
                  <Check size={12} /> Uppercase letter
                </div>
                <div
                  className={`text-[11px] font-bold flex items-center gap-2 ${passwordChecks.number ? "text-emerald-600" : "text-slate-400"}`}
                >
                  <Check size={12} /> Number
                </div>
                <div
                  className={`text-[11px] font-bold flex items-center gap-2 ${passwordChecks.special ? "text-emerald-600" : "text-slate-400"}`}
                >
                  <Check size={12} /> Special character
                </div>
                <div
                  className={`text-[11px] font-bold flex items-center gap-2 ${passwordChecks.different ? "text-emerald-600" : "text-slate-400"} md:col-span-2`}
                >
                  <Check size={12} /> New password must be different from
                  current
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest ml-1">
                Confirm New Password
              </label>
              <div className="relative">
                <input
                  type={showPasswords.confirm ? "text" : "password"}
                  required
                  className="w-full px-6 pr-12 py-4 bg-slate-50 border-none rounded-2xl text-sm font-bold outline-none focus:ring-2 focus:ring-blue-100 transition-all"
                  placeholder="Confirm new password"
                  value={passwords.confirm}
                  onChange={(e) =>
                    setPasswords({ ...passwords, confirm: e.target.value })
                  }
                />
                <button
                  type="button"
                  onClick={() => togglePasswordVisibility("confirm")}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400"
                >
                  {showPasswords.confirm ? (
                    <EyeOff size={16} />
                  ) : (
                    <Eye size={16} />
                  )}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full py-7 bg-[#1E293B] hover:bg-slate-800 text-white rounded-2xl font-black uppercase text-xs tracking-widest gap-2 shadow-xl shadow-slate-200 mt-4 transition-all active:scale-95"
            >
              {loading ? (
                <RefreshCcw className="animate-spin" />
              ) : (
                "Authorize & Change Password"
              )}
            </Button>
          </form>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        <Card className="p-8 border-none shadow-2xl rounded-[2.5rem] bg-white">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <Fingerprint size={20} className="text-emerald-500" />
              <h3 className="font-black text-slate-800 uppercase text-sm tracking-tight">
                2FA Manager
              </h3>
            </div>
            <button
              type="button"
              onClick={handleToggle2FA}
              disabled={actionLoading.toggle2FA}
              className={`w-12 h-6 rounded-full transition-all relative ${
                is2FAEnabled ? "bg-emerald-500" : "bg-slate-200"
              } ${actionLoading.toggle2FA ? "opacity-60 cursor-not-allowed" : ""}`}
            >
              <div
                className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${
                  is2FAEnabled ? "right-1" : "left-1"
                }`}
              />
            </button>
          </div>
          <p className="text-slate-500 text-xs font-medium leading-relaxed">
            Multi-factor authentication adds an extra layer of protection by
            requiring a second verification step during login.
          </p>
          <div className="mt-6 flex items-center gap-2 px-4 py-3 bg-emerald-50 rounded-2xl border border-emerald-100">
            <ShieldCheck size={16} className="text-emerald-500" />
            <span
              className={`text-[10px] font-black uppercase tracking-widest ${
                is2FAEnabled ? "text-emerald-600" : "text-slate-500"
              }`}
            >
              Status: {is2FAEnabled ? "Maximum Protection" : "2FA Disabled"}
            </span>
          </div>

          <div className="mt-4 flex flex-col gap-3">
            <Button
              onClick={handleRegenerate2FA}
              disabled={regenerating2FA}
              variant="outline"
              className="rounded-2xl border-slate-200 text-slate-700 font-black text-xs uppercase tracking-widest"
            >
              {regenerating2FA ? (
                <RefreshCcw size={14} className="animate-spin mr-2" />
              ) : (
                <RotateCw size={14} className="mr-2" />
              )}
              Regenerate 2FA Secret
            </Button>

            <Button
              onClick={() => setShowBackupCodes(!showBackupCodes)}
              variant="outline"
              className="rounded-2xl border-blue-100 text-[#5B7FED] font-black text-xs uppercase tracking-widest"
            >
              <Key size={14} className="mr-2" />
              {showBackupCodes ? "Hide Backup Codes" : "Show Backup Codes"}
            </Button>
          </div>

          {showBackupCodes && (
            <div className="mt-4 grid grid-cols-2 gap-2">
              {(backupCodes.length
                ? backupCodes
                : ["No", "Codes", "Generated", "Yet"]
              ).map((code, idx) => (
                <div
                  key={idx}
                  className="px-3 py-2 rounded-xl bg-slate-50 border border-slate-100 text-xs font-black text-slate-700 tracking-wider text-center"
                >
                  {code}
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-8 border-none shadow-2xl rounded-[2.5rem] bg-white xl:col-span-2">
          <div className="flex items-center gap-3 mb-8">
            <Globe size={20} className="text-[#5B7FED]" />
            <h3 className="font-black text-slate-800 uppercase text-sm tracking-tight">
              IP Access Whitelist
            </h3>
          </div>

          <div className="flex flex-wrap gap-3 mb-4">
            {whitelistedIPs.map((ip, i) => (
              <div
                key={i}
                className="flex items-center gap-2 px-4 py-2 bg-slate-50 rounded-xl border border-slate-100 group transition-all hover:bg-slate-100"
              >
                <code className="text-xs font-black text-[#5B7FED] tracking-tighter">
                  {ip}
                </code>
                <button
                  onClick={() => handleRemoveIP(ip)}
                  className="text-slate-300 hover:text-rose-500 transition-colors"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>

          <div className="flex flex-col md:flex-row gap-3">
            <input
              value={newIP}
              onChange={(e) => setNewIP(e.target.value)}
              placeholder="Enter trusted IP address"
              className="flex-1 px-5 py-3 rounded-2xl bg-slate-50 border border-slate-100 text-sm font-bold outline-none focus:ring-2 focus:ring-blue-100"
            />
            <Button
              onClick={handleAddIP}
              disabled={actionLoading.addIp}
              className="rounded-2xl bg-[#5B7FED] hover:bg-blue-600 text-white font-black text-xs uppercase tracking-widest"
            >
              {actionLoading.addIp ? (
                <RefreshCcw size={14} className="animate-spin mr-2" />
              ) : (
                <Globe size={14} className="mr-2" />
              )}
              Add Trusted IP
            </Button>
            <Button
              onClick={handleAddCurrentIP}
              variant="outline"
              className="rounded-2xl border-slate-200 text-slate-700 font-black text-xs uppercase tracking-widest"
            >
              <MapPin size={14} className="mr-2" />
              Add Current IP
            </Button>
          </div>

          <p className="text-slate-400 text-[10px] font-bold mt-6 flex items-center gap-2">
            <ShieldQuestion size={12} /> Restricted Access: Logins from unlisted
            IPs will trigger immediate administrative alerts.
          </p>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
        <Card className="p-8 border-none shadow-2xl rounded-[2.5rem] bg-white">
          <div className="flex items-center gap-3 mb-8">
            <Laptop size={20} className="text-[#5B7FED]" />
            <h3 className="font-black text-slate-800 uppercase text-sm tracking-tight">
              Active Sessions
            </h3>
          </div>

          <div className="space-y-4">
            {sessions.length > 0 ? (
              sessions.map((session, idx) => (
                <div
                  key={session._id || idx}
                  className="p-4 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-between gap-4"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-white border border-slate-100 flex items-center justify-center text-[#5B7FED]">
                      <Monitor size={16} />
                    </div>
                    <div>
                      <p className="font-black text-slate-800 text-sm">
                        {session.device || session.browser || "Unknown Device"}
                      </p>
                      <p className="text-[11px] text-slate-500 font-bold">
                        {session.ip || "Unknown IP"}
                      </p>
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">
                        {session.is_current
                          ? "Current Session"
                          : "Secondary Session"}{" "}
                        •{" "}
                        {session.created_at
                          ? new Date(session.created_at).toLocaleString()
                          : "Recent"}
                      </p>
                    </div>
                  </div>
                  {!session.is_current && (
                    <Button
                      onClick={() => handleRevokeSession(session._id)}
                      variant="outline"
                      className="rounded-xl border-rose-100 text-rose-500 font-black text-[10px] uppercase tracking-widest"
                    >
                      Revoke
                    </Button>
                  )}
                </div>
              ))
            ) : (
              <div className="p-6 rounded-2xl bg-slate-50 border border-slate-100 text-center text-slate-400 text-sm font-bold">
                No extra sessions found.
              </div>
            )}
          </div>

          <Button
            onClick={handleLogoutAllSessions}
            disabled={actionLoading.logoutAll}
            className="w-full mt-6 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white font-black text-xs uppercase tracking-widest"
          >
            {actionLoading.logoutAll ? (
              <RefreshCcw size={14} className="animate-spin mr-2" />
            ) : (
              <LogOut size={14} className="mr-2" />
            )}
            Logout All Devices
          </Button>
        </Card>

        <Card className="p-8 border-none shadow-2xl rounded-[2.5rem] bg-white">
          <div className="flex items-center gap-3 mb-8">
            <AlertTriangle size={20} className="text-amber-500" />
            <h3 className="font-black text-slate-800 uppercase text-sm tracking-tight">
              Security Alerts
            </h3>
          </div>

          <div className="mb-5 grid grid-cols-2 gap-4">
            <div className="rounded-2xl bg-rose-50 border border-rose-100 p-4">
              <p className="text-[11px] font-black text-rose-500 uppercase tracking-widest">
                Risk Events
              </p>
              <p className="text-2xl font-black text-slate-900 mt-2">
                {riskCount}
              </p>
            </div>
            <div className="rounded-2xl bg-blue-50 border border-blue-100 p-4">
              <p className="text-[11px] font-black text-[#5B7FED] uppercase tracking-widest">
                Total Alerts
              </p>
              <p className="text-2xl font-black text-slate-900 mt-2">
                {securityAlerts.length}
              </p>
            </div>
          </div>

          <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
            {securityAlerts.length > 0 ? (
              securityAlerts.map((alert, idx) => {
                const severity = String(
                  alert?.severity || "medium",
                ).toLowerCase();
                const severityClass =
                  severity === "high"
                    ? "bg-rose-50 border-rose-100 text-rose-500"
                    : severity === "medium"
                      ? "bg-amber-50 border-amber-100 text-amber-500"
                      : "bg-emerald-50 border-emerald-100 text-emerald-500";

                return (
                  <div
                    key={alert._id || idx}
                    className="p-4 rounded-2xl bg-slate-50 border border-slate-100"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-black text-slate-800 text-sm">
                          {alert.message || "Suspicious login detected"}
                        </p>
                        <p className="text-[11px] text-slate-500 font-bold mt-1">
                          {alert.ip || "Unknown IP"} •{" "}
                          {alert.device || alert.browser || "Unknown Device"}
                        </p>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-2">
                          {alert.timestamp
                            ? new Date(alert.timestamp).toLocaleString()
                            : "Recent"}
                        </p>
                      </div>
                      <span
                        className={`px-3 py-1 rounded-xl border text-[10px] font-black uppercase tracking-widest ${severityClass}`}
                      >
                        {severity}
                      </span>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="p-6 rounded-2xl bg-slate-50 border border-slate-100 text-center text-slate-400 text-sm font-bold">
                No suspicious activity detected.
              </div>
            )}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-8">
        <Card className="p-8 border-none shadow-2xl rounded-[2.5rem] bg-white xl:col-span-2">
          <div className="flex items-center gap-3 mb-8">
            <UserCog size={20} className="text-[#5B7FED]" />
            <h3 className="font-black text-slate-800 uppercase text-sm tracking-tight">
              Admin Action Center
            </h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Button
              onClick={handleForcePasswordReset}
              disabled={actionLoading.forceReset}
              className="rounded-2xl bg-slate-900 hover:bg-slate-800 text-white font-black text-xs uppercase tracking-widest py-6"
            >
              {actionLoading.forceReset ? (
                <RefreshCcw size={14} className="animate-spin mr-2" />
              ) : (
                <Key size={14} className="mr-2" />
              )}
              Force Password Reset
            </Button>

            <Button
              onClick={handleRegenerate2FA}
              disabled={regenerating2FA}
              variant="outline"
              className="rounded-2xl border-blue-100 text-[#5B7FED] font-black text-xs uppercase tracking-widest py-6"
            >
              {regenerating2FA ? (
                <RefreshCcw size={14} className="animate-spin mr-2" />
              ) : (
                <Fingerprint size={14} className="mr-2" />
              )}
              Regenerate 2FA Secret
            </Button>

            <Button
              onClick={handleLockAccount}
              disabled={actionLoading.lockAccount}
              className={`rounded-2xl font-black text-xs uppercase tracking-widest py-6 ${accountLocked ? "bg-emerald-500 hover:bg-emerald-600 text-white" : "bg-amber-500 hover:bg-amber-600 text-white"}`}
            >
              {actionLoading.lockAccount ? (
                <RefreshCcw size={14} className="animate-spin mr-2" />
              ) : accountLocked ? (
                <Shield size={14} className="mr-2" />
              ) : (
                <Ban size={14} className="mr-2" />
              )}
              {accountLocked ? "Unlock Account" : "Lock Account"}
            </Button>

            <Button
              onClick={handleDownloadSecurityReport}
              disabled={downloadingReport}
              variant="outline"
              className="rounded-2xl border-slate-200 text-slate-700 font-black text-xs uppercase tracking-widest py-6"
            >
              {downloadingReport ? (
                <RefreshCcw size={14} className="animate-spin mr-2" />
              ) : (
                <Download size={14} className="mr-2" />
              )}
              Download Security Report
            </Button>
          </div>
        </Card>

        <Card className="p-8 border-none shadow-2xl rounded-[2.5rem] bg-white">
          <div className="flex items-center gap-3 mb-8">
            <Smartphone size={20} className="text-emerald-500" />
            <h3 className="font-black text-slate-800 uppercase text-sm tracking-tight">
              Account Recovery
            </h3>
          </div>
          <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
              <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest">
                Recovery Channel
              </p>
              <p className="text-sm font-black text-slate-800 mt-2 break-all">
                {recoveryEmail}
              </p>
            </div>
            <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-100">
              <p className="text-[11px] font-black text-emerald-600 uppercase tracking-widest">
                Verification Status
              </p>
              <p className="text-sm font-black text-slate-800 mt-2">
                {emailVerified ? "Verified and Active" : "Pending Verification"}
              </p>
            </div>
          </div>
        </Card>

        <Card className="p-8 border-none shadow-2xl rounded-[2.5rem] bg-white">
          <div className="flex items-center gap-3 mb-8">
            <CalendarClock size={20} className="text-amber-500" />
            <h3 className="font-black text-slate-800 uppercase text-sm tracking-tight">
              Security Summary
            </h3>
          </div>
          <div className="space-y-4">
            <div className="rounded-2xl bg-slate-50 border border-slate-100 p-4">
              <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest">
                2FA
              </p>
              <p className="text-sm font-black text-slate-800 mt-2">
                {is2FAEnabled ? "Enabled" : "Disabled"}
              </p>
            </div>
            <div className="rounded-2xl bg-slate-50 border border-slate-100 p-4">
              <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest">
                Trusted IPs
              </p>
              <p className="text-sm font-black text-slate-800 mt-2">
                {whitelistedIPs.length}
              </p>
            </div>
            <div className="rounded-2xl bg-slate-50 border border-slate-100 p-4">
              <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest">
                Open Sessions
              </p>
              <p className="text-sm font-black text-slate-800 mt-2">
                {sessions.length}
              </p>
            </div>
          </div>
        </Card>
      </div>

      <Card className="p-6 bg-slate-900 border-none rounded-3xl shadow-xl flex items-center gap-6">
        <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center text-amber-400 border border-white/5">
          <ShieldAlert size={24} />
        </div>
        <div className="flex-1 text-left">
          <p className="text-white font-black text-sm uppercase tracking-tight">
            Security Protocol Active
          </p>
          <p className="text-slate-400 text-xs mt-0.5">
            Your sessions are encrypted using AES-256 standards. Inactivity
            timeout set to 15m.
          </p>
        </div>
        <div className="hidden md:flex items-center gap-2 px-4 py-2 bg-emerald-500/10 rounded-xl border border-emerald-500/20">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-emerald-500 text-[10px] font-black uppercase tracking-widest">
            {securityPrefsLoaded ? "Active" : "Syncing"}
          </span>
        </div>
      </Card>

      <Card className="overflow-hidden border-none shadow-2xl rounded-[2.5rem] bg-white">
        <div className="p-8 border-b border-slate-50 flex flex-col xl:flex-row xl:items-center xl:justify-between gap-5">
          <div className="flex items-center gap-3">
            <Clock size={20} className="text-[#5B7FED]" />
            <h2 className="text-lg font-black text-slate-800 uppercase tracking-tight">
              Security Audit Log
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="relative">
              <Search
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder="Search IP or browser"
                className="pl-9 pr-4 py-2.5 rounded-xl bg-slate-50 border border-slate-100 text-xs font-bold outline-none"
              />
            </div>

            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-100 text-xs font-black uppercase tracking-widest outline-none text-slate-600"
            >
              <option value="all">All Events</option>
              <option value="authorized">Authorized</option>
              <option value="failed">Failed</option>
              <option value="suspicious">Suspicious</option>
            </select>

            <Button
              onClick={handleExportAuditCsv}
              variant="outline"
              className="rounded-xl border-emerald-100 text-emerald-600 text-[10px] font-black uppercase tracking-widest"
            >
              <Download size={12} className="mr-2" />
              Export CSV
            </Button>

            <span className="bg-emerald-50 text-emerald-600 px-4 py-1.5 rounded-xl text-[10px] font-black uppercase border border-emerald-100 flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />{" "}
              Live Audit Active
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest">
                <th className="px-8 py-5">Device / Browser</th>
                <th className="px-6 py-5">Access point (IP)</th>
                <th className="px-6 py-5">Timestamp</th>
                <th className="px-8 py-5 text-right">Verification</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filteredLogs.length > 0 ? (
                filteredLogs.map((log, i) => {
                  const status = String(
                    log.status || "authorized",
                  ).toLowerCase();
                  const badgeClass =
                    status === "failed"
                      ? "bg-rose-50 text-rose-500 border-rose-100"
                      : status === "suspicious"
                        ? "bg-amber-50 text-amber-500 border-amber-100"
                        : "bg-blue-50 text-[#5B7FED] border-blue-100";

                  return (
                    <tr
                      key={log._id || i}
                      className="hover:bg-slate-50/40 transition-colors"
                    >
                      <td className="px-8 py-6">
                        <div className="flex items-center gap-3">
                          <Monitor
                            size={18}
                            className="text-slate-400 shrink-0"
                          />
                          <div>
                            <p className="font-black text-slate-800 text-sm">
                              {log.browser || "Chrome / Windows 11"}
                            </p>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                              {log.device || "System Authorized"}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-6 font-bold text-slate-600 text-xs tracking-tighter font-mono">
                        {log.ip || "192.168.1.42"}
                      </td>
                      <td className="px-6 py-6 font-bold text-slate-600 text-xs capitalize">
                        {log.timestamp
                          ? new Date(log.timestamp).toLocaleString()
                          : log.time || "Recent"}
                      </td>
                      <td className="px-8 py-6 text-right">
                        <span
                          className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase border inline-flex items-center gap-1 w-fit ml-auto ${badgeClass}`}
                        >
                          <CheckCircle
                            size={10}
                            fill="currentColor"
                            className={
                              status === "failed"
                                ? "text-rose-500"
                                : status === "suspicious"
                                  ? "text-amber-500"
                                  : "text-blue-500"
                            }
                          />
                          {status}
                        </span>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td
                    colSpan="4"
                    className="p-20 text-center text-slate-300 font-black uppercase tracking-[0.2em] italic text-[10px]"
                  >
                    Updating Security Records...
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

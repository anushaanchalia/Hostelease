import React, { useEffect, useState, useRef } from "react";
import api from "../../utils/api";
import { Card } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Label } from "../../components/ui/label";
import {
  UtensilsCrossed,
  Printer,
  Loader2,
  Image as ImageIcon,
  Upload,
  Bookmark,
  FolderOpen,
  Sparkles,
  TrendingUp,
  Wand2,
  Megaphone,
  Save,
  FileText,
  Undo2,
  History,
  X,
  RotateCw,
  Trash2,
  UserCheck,
  Lock,
  Unlock,
  BarChart3,
  CalendarDays,
  Clock3,
  PlayCircle,
  StopCircle,
} from "lucide-react";
import { toast } from "sonner";
import { getUser } from "../../utils/auth";
import html2canvas from "html2canvas";

const daysOfWeek = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

export default function MessMenuManagement() {
  const menuRef = useRef(null);
  const csvInputRef = useRef(null);

  const [menu, setMenu] = useState(
    daysOfWeek.map((day) => ({ day, breakfast: "", lunch: "", dinner: "" })),
  );
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [winningItem, setWinningItem] = useState(null);
  const [isDraft, setIsDraft] = useState(false);
  const [lastPublished, setLastPublished] = useState(null);
  const [lastSavedAt, setLastSavedAt] = useState(null);
  const [auditHistory, setAuditHistory] = useState([]);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [archiveWeeks, setArchiveWeeks] = useState([]);
  const [selectedArchiveWeek, setSelectedArchiveWeek] = useState("");
  const [archiveMenu, setArchiveMenu] = useState([]);
  const [monthlyTopItems, setMonthlyTopItems] = useState([]);
  const [hostelAnalytics, setHostelAnalytics] = useState([]);
  const [manualItem, setManualItem] = useState("");
  const [runtimeStatus, setRuntimeStatus] = useState(null);
  const [manualStartNote, setManualStartNote] = useState("");
  const [manualDuration, setManualDuration] = useState(120);

  const [importingCsv, setImportingCsv] = useState(false);
  const [showImportPreview, setShowImportPreview] = useState(false);
  const [importPreviewMenu, setImportPreviewMenu] = useState([]);
  const [importPreviewFileName, setImportPreviewFileName] = useState("");
  const [importSourceType, setImportSourceType] = useState("");

  const [showPasteTextModal, setShowPasteTextModal] = useState(false);
  const [pastedMenuText, setPastedMenuText] = useState("");
  const [parsingText, setParsingText] = useState(false);

  useEffect(() => {
    fetchMenu();
    fetchTemplates();
    fetchWinningItem();
    fetchAuditHistory();
    fetchArchiveWeeks();
    fetchAnalytics();
    fetchVotingRuntimeStatus();
  }, []);

  const fetchMenu = async () => {
    try {
      setLoading(true);
      const response = await api.get("/mess/menu");
      const dbMenu = response.data?.menu || [];
      const mergedMenu = daysOfWeek.map((day) => {
        const existing = dbMenu.find((item) => item.day === day);
        return existing || { day, breakfast: "", lunch: "", dinner: "" };
      });
      setMenu(mergedMenu);
      if (response.data?.last_updated) {
        setLastPublished(response.data.last_updated);
        setLastSavedAt(response.data.last_updated);
      }
      setIsLocked(!!response.data?.is_locked);
      setIsDraft(false);
    } catch (error) {
      console.error("Load error:", error);
      toast.error("Failed to load admin menu");
    } finally {
      setLoading(false);
    }
  };

  const fetchTemplates = async () => {
    try {
      const response = await api.get("/mess/templates");
      setTemplates(response.data || []);
    } catch (error) {
      console.error("Template load error:", error);
    }
  };

  const fetchWinningItem = async () => {
    try {
      const response = await api.get("/voting-results");
      const rows = Array.isArray(response.data) ? response.data : [];
      if (rows.length > 0) {
        const sorted = rows.sort((a, b) => b.vote_count - a.vote_count);
        setWinningItem(sorted[0]);
      } else {
        setWinningItem(null);
      }
    } catch (error) {
      console.error("Winner load error:", error);
      setWinningItem(null);
    }
  };

  const fetchAuditHistory = async () => {
    try {
      const response = await api.get("/mess/audit-log");
      setAuditHistory(response.data || []);
    } catch (error) {
      console.error("Audit load error:", error);
    }
  };

  const fetchArchiveWeeks = async () => {
    try {
      const response = await api.get("/mess/menu/archive");
      setArchiveWeeks(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.error("Archive fetch error:", error);
    }
  };

  const fetchArchiveMenu = async (weekStartDate) => {
    try {
      const response = await api.get(
        `/mess/menu/archive?week_start_date=${encodeURIComponent(weekStartDate)}`,
      );
      setArchiveMenu(response.data?.menu || []);
      setSelectedArchiveWeek(weekStartDate);
    } catch (error) {
      toast.error("Failed to load archive week");
    }
  };

  const fetchAnalytics = async () => {
    try {
      const topRes = await api.get("/mess/analytics/monthly-top-items");
      const hostelRes = await api.get("/mess/analytics/hostel-preferences");
      setMonthlyTopItems(topRes.data?.items || []);
      setHostelAnalytics(hostelRes.data?.hostels || []);
    } catch (error) {
      console.error("Analytics fetch error:", error);
    }
  };

  const fetchVotingRuntimeStatus = async () => {
    try {
      const res = await api.get("/voting/runtime-status");
      setRuntimeStatus(res.data || null);
    } catch (error) {
      console.error("Voting runtime fetch error:", error);
    }
  };

  const getFilledSlotsCount = (rows = []) => {
    let count = 0;
    rows.forEach((row) => {
      if (row.breakfast) count += 1;
      if (row.lunch) count += 1;
      if (row.dinner) count += 1;
    });
    return count;
  };

  const normalizeImportedMenu = (importedMenu = []) => {
    return daysOfWeek.map((day) => {
      const existing = importedMenu.find((item) => item.day === day);
      return (
        existing || {
          day,
          breakfast: "",
          lunch: "",
          dinner: "",
        }
      );
    });
  };

  const handleStartVotingNow = async () => {
    try {
      await api.post("/voting/start-now", {
        note: manualStartNote || "Manual voting start by admin",
        duration_minutes: manualDuration,
      });
      toast.success("Voting started manually. Students can vote now.");
      setManualStartNote("");
      fetchVotingRuntimeStatus();
      fetchWinningItem();
    } catch (error) {
      toast.error(error?.response?.data?.detail || "Failed to start voting");
    }
  };

  const handleStopVotingNow = async () => {
    try {
      await api.post("/voting/stop-now", {});
      toast.success("Voting stopped manually.");
      fetchVotingRuntimeStatus();
    } catch (error) {
      toast.error(error?.response?.data?.detail || "Failed to stop voting");
    }
  };

  const handleExtendVoting = async (minutes) => {
    try {
      await api.post("/voting/extend", { extend_minutes: minutes });
      toast.success(`Voting extended by ${minutes} minutes.`);
      fetchVotingRuntimeStatus();
    } catch (error) {
      toast.error(error?.response?.data?.detail || "Failed to extend voting");
    }
  };

  const handleBulkClear = () => {
    if (isLocked) return toast.error("Menu is locked. Reopen it first.");
    if (
      window.confirm(
        "Delete everything in the editor? This will not affect the live menu until you save or publish.",
      )
    ) {
      setMenu(
        daysOfWeek.map((day) => ({
          day,
          breakfast: "",
          lunch: "",
          dinner: "",
        })),
      );
      setIsDraft(true);
      toast.info("Menu editor cleared.");
    }
  };

  const viewParticipation = async () => {
    try {
      const res = await api.get("/admin/reports/participation");
      const total = Array.isArray(res.data) ? res.data.length : 0;
      const voted = Array.isArray(res.data)
        ? res.data.filter((s) => s.voted === true).length
        : 0;
      toast.info(
        `Voting Report: ${voted}/${total} students participated this week.`,
      );
      console.table(res.data);
    } catch (error) {
      toast.error("Failed to fetch participation data.");
    }
  };

  const handleRestoreVersion = (oldMenu) => {
    if (!oldMenu || !Array.isArray(oldMenu)) {
      return toast.error("Invalid menu data in this version");
    }
    if (isLocked) return toast.error("Menu is locked. Reopen it first.");
    setMenu(oldMenu);
    setIsDraft(true);
    setShowHistoryModal(false);
    toast.success("Historical version loaded into editor!");
  };

  const handleResetToLive = () => {
    if (!isDraft) return;
    fetchMenu();
    toast.info("Draft discarded. Reloaded live menu.");
  };

  const handleSaveTemplate = async () => {
    if (!templateName.trim()) return toast.error("Enter a template name");
    try {
      await api.post("/mess/templates", { name: templateName, menu });
      toast.success(`Template "${templateName}" saved!`);
      setTemplateName("");
      fetchTemplates();
    } catch (error) {
      toast.error("Failed to save template");
    }
  };

  const loadTemplate = (selectedTemplate) => {
    if (!selectedTemplate) return;
    if (isLocked) return toast.error("Menu is locked. Reopen it first.");
    setMenu(selectedTemplate.menu);
    setIsDraft(true);
    toast.success(`Loaded "${selectedTemplate.name}"`);
  };

  const downloadMenuImage = async () => {
    if (!menuRef.current) return;
    try {
      toast.loading("Capturing high-quality menu...");
      const canvas = await html2canvas(menuRef.current, {
        backgroundColor: "#F8FAFC",
        scale: 2,
        padding: 15,
      });
      const image = canvas.toDataURL("image/png");
      const link = document.createElement("a");
      link.href = image;
      link.download = `Mess_Menu_${new Date().toLocaleDateString()}.png`;
      link.click();
      toast.dismiss();
      toast.success("Image saved!");
    } catch (err) {
      toast.dismiss();
      toast.error("Failed to save image");
    }
  };

  const handleInputChange = (day, meal, value) => {
    if (isLocked) return toast.error("Menu is locked. Reopen it first.");
    setIsDraft(true);
    setMenu((prev) =>
      prev.map((item) =>
        item.day === day ? { ...item, [meal]: value } : item,
      ),
    );
  };

  const applyWinningItem = (mealType) => {
    if (!winningItem) return;
    if (isLocked) return toast.error("Menu is locked. Reopen it first.");
    setIsDraft(true);
    const itemName = winningItem.item_name;
    setMenu((prev) =>
      prev.map((item) => {
        if (item.day === "Sunday") {
          const currentVal = item[mealType];
          const specialExists = String(currentVal || "")
            .toLowerCase()
            .includes(String(itemName).toLowerCase());
          if (specialExists) {
            return item;
          }
          const newVal = currentVal
            ? `${currentVal}, ${itemName} (Special)`
            : `${itemName} (Special)`;
          return { ...item, [mealType]: newVal };
        }
        return item;
      }),
    );
    toast.success(`${itemName} added to Sunday ${mealType}!`);
  };

  const sendMenuBroadcast = async () => {
    try {
      const hasSpecial =
        winningItem && JSON.stringify(menu).includes(winningItem.item_name);
      const message = hasSpecial
        ? `📅 New Weekly Menu Published! Includes your Sunday Special: ${winningItem.item_name}. Check it out now!`
        : `📅 The new mess menu for the upcoming week has been published. Check it out on your dashboard!`;

      await api.post("/notifications", {
        type: "general",
        message,
        target_users: "all",
      });
    } catch (error) {
      console.error("Broadcast failed:", error);
    }
  };

  const logMenuAudit = async (action = "publish", summary = "") => {
    const admin = getUser();
    try {
      await api.post("/mess/audit-log", {
        action,
        admin_name: admin?.student_name || admin?.username || "Warden",
        timestamp: new Date().toISOString(),
        changes_summary:
          summary ||
          `${action === "draft_save" ? "Saved" : "Published"} weekly menu for ${daysOfWeek.length} days.`,
        menu_snapshot: menu,
      });
      fetchAuditHistory();
    } catch (e) {
      console.error("Audit logging failed");
    }
  };

  const handleSaveAll = async () => {
    if (isLocked) return toast.error("Menu is locked. Reopen it first.");
    setSavingDraft(true);
    try {
      for (const item of menu) {
        await api.post("/mess/menu", item);
      }
      await logMenuAudit("draft_save", "Saved weekly menu draft");
      setIsDraft(false);
      setLastSavedAt(new Date().toISOString());
      toast.success("Menu saved successfully");
      await fetchMenu();
      await fetchArchiveWeeks();
    } catch (error) {
      toast.error(error?.response?.data?.detail || "Failed to save menu");
    } finally {
      setSavingDraft(false);
    }
  };

  const handleUpdateAll = async () => {
    if (isLocked) return toast.error("Menu is locked. Reopen it first.");
    setSaving(true);
    try {
      for (const item of menu) {
        await api.post("/mess/menu", item);
      }
      await logMenuAudit("publish", "Published weekly menu");
      await sendMenuBroadcast();
      await api.post("/mess/menu/lock", {});
      setIsDraft(false);
      setLastPublished(new Date().toISOString());
      setLastSavedAt(new Date().toISOString());
      setIsLocked(true);
      toast.success("Published, locked & broadcasted to all students! 📢");
      await fetchMenu();
      await fetchWinningItem();
      await fetchArchiveWeeks();
    } catch (error) {
      toast.error(error?.response?.data?.detail || "Failed to publish menu");
    } finally {
      setSaving(false);
    }
  };

  const handleReopenMenu = async () => {
    try {
      await api.post("/mess/menu/reopen", {});
      setIsLocked(false);
      toast.success("Menu reopened for editing");
      await fetchMenu();
    } catch (error) {
      toast.error("Failed to reopen menu");
    }
  };

  const handleManualAdd = async () => {
    if (!manualItem.trim()) return toast.error("Please enter a food item name");
    try {
      await api.post("/voting/manual-add", { item_name: manualItem });
      toast.success(`${manualItem} added to voting manually!`);
      setManualItem("");
      fetchWinningItem();
    } catch (error) {
      toast.error(
        error?.response?.data?.detail || "Failed to add item manually.",
      );
    }
  };

  const handleForceFreeze = async () => {
    try {
      const res = await api.post("/voting/freeze-now");
      toast.success(
        res.data?.winner
          ? `Winner applied: ${res.data.winner}`
          : "Voting frozen.",
      );
      await fetchMenu();
      await fetchWinningItem();
      await fetchArchiveWeeks();
      await fetchVotingRuntimeStatus();
    } catch (error) {
      toast.error(error?.response?.data?.detail || "Failed to freeze voting.");
    }
  };

  const openImportPreview = (rows, label, sourceType) => {
    const mergedMenu = normalizeImportedMenu(rows);
    setImportPreviewMenu(mergedMenu);
    setImportPreviewFileName(label);
    setImportSourceType(sourceType);
    setShowImportPreview(true);

    const filledCount = getFilledSlotsCount(mergedMenu);
    if (filledCount < 5) {
      toast.warning(
        "Only a few menu slots were detected. Please review carefully.",
      );
    } else {
      toast.success("Import parsed successfully. Review before applying.");
    }
  };

  const handleCsvImportUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (isLocked) {
      toast.error("Menu is locked. Reopen it first.");
      event.target.value = "";
      return;
    }

    try {
      setImportingCsv(true);

      const formData = new FormData();
      formData.append("file", file);

      const response = await api.post("/mess/menu/import-csv", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      const importedMenu = Array.isArray(response.data?.menu)
        ? response.data.menu
        : [];

      if (importedMenu.length === 0) {
        toast.error("No menu rows detected from CSV");
      } else {
        openImportPreview(importedMenu, file.name || "Imported CSV", "csv");
      }
    } catch (error) {
      toast.error(
        error?.response?.data?.detail || "Failed to import CSV menu",
      );
      setImportPreviewMenu([]);
      setShowImportPreview(false);
    } finally {
      setImportingCsv(false);
      event.target.value = "";
    }
  };

  const handleOpenPasteTextModal = () => {
    if (isLocked) return toast.error("Menu is locked. Reopen it first.");
    setShowPasteTextModal(true);
  };

  const handleParsePastedText = async () => {
    if (!pastedMenuText.trim()) {
      return toast.error("Please paste menu text first");
    }

    try {
      setParsingText(true);
      const response = await api.post("/mess/menu/import-text", {
        raw_text: pastedMenuText,
      });

      const importedMenu = Array.isArray(response.data?.menu)
        ? response.data.menu
        : [];

      if (importedMenu.length === 0) {
        toast.error("No menu rows detected from pasted text");
      } else {
        setShowPasteTextModal(false);
        openImportPreview(importedMenu, "Pasted Menu Text", "text");
      }
    } catch (error) {
      toast.error(
        error?.response?.data?.detail || "Failed to parse pasted menu text",
      );
    } finally {
      setParsingText(false);
    }
  };

  const handleApplyImportedMenu = () => {
    if (!Array.isArray(importPreviewMenu) || importPreviewMenu.length === 0) {
      return toast.error("No imported menu available to apply");
    }

    setMenu(importPreviewMenu);
    setIsDraft(true);
    setShowImportPreview(false);
    toast.success(
      "Imported menu applied to editor. Click Save All to store it.",
    );
  };

  const handleCloseImportPreview = () => {
    setShowImportPreview(false);
  };

  if (loading)
    return (
      <div className="flex flex-col items-center justify-center h-96">
        <Loader2 className="animate-spin text-[#5B7FED] mb-4" size={40} />
        <p className="text-slate-400 font-black text-[10px] tracking-widest uppercase">
          Syncing Kitchen Data...
        </p>
      </div>
    );

  return (
    <div className="space-y-6 fade-in pb-12 px-2 max-w-[1400px] mx-auto">
      {showHistoryModal && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/40 backdrop-blur-md p-4">
          <Card className="w-full max-w-xl bg-white rounded-[2rem] shadow-2xl border-none overflow-hidden">
            <div className="p-6 border-b border-slate-50 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-slate-900 text-white rounded-xl">
                  <History size={20} />
                </div>
                <h2 className="text-lg font-black text-slate-900 uppercase tracking-tighter">
                  Publication History
                </h2>
              </div>
              <button
                onClick={() => setShowHistoryModal(false)}
                className="p-2 hover:bg-slate-200 rounded-full transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-6 max-h-[60vh] overflow-y-auto space-y-4">
              {auditHistory.length === 0 ? (
                <p className="text-center text-slate-400 py-8 text-sm font-bold uppercase tracking-widest">
                  No logs found
                </p>
              ) : (
                auditHistory.map((log, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-4 p-4 rounded-2xl bg-slate-50 border border-slate-100 group"
                  >
                    <div className="p-2 bg-white rounded-lg shadow-sm text-[#5B7FED]">
                      <FileText size={16} />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-black text-slate-800">
                          {log.admin_name}
                        </p>
                        <button
                          onClick={() =>
                            handleRestoreVersion(log.menu_snapshot)
                          }
                          className="opacity-0 group-hover:opacity-100 transition-opacity bg-white text-[#5B7FED] border border-[#5B7FED] hover:bg-[#5B7FED] hover:text-white px-2 py-1 rounded-md text-[9px] font-black uppercase flex items-center gap-1"
                        >
                          <RotateCw size={10} /> Restore
                        </button>
                      </div>
                      <p className="text-[11px] text-slate-500 font-medium">
                        {log.changes_summary}
                      </p>
                      <p className="text-[10px] text-slate-400 mt-2 font-bold italic">
                        {new Date(log.timestamp).toLocaleString()}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>
      )}

      {showImportPreview && (
        <div className="fixed inset-0 z-[115] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <Card className="w-full max-w-6xl bg-white rounded-[2rem] shadow-2xl border-none overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/60">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-[#5B7FED] text-white rounded-xl">
                  <FileText size={20} />
                </div>
                <div>
                  <h2 className="text-xl font-black text-slate-900">
                    Imported Menu Preview
                  </h2>
                  <p className="text-sm text-slate-500 mt-0.5">
                    {importPreviewFileName} • {importSourceType.toUpperCase()} •{" "}
                    {getFilledSlotsCount(importPreviewMenu)} filled meal slots detected
                  </p>
                </div>
              </div>

              <button
                onClick={handleCloseImportPreview}
                className="p-2 hover:bg-slate-200 rounded-full transition-colors"
              >
                <X size={20} className="text-slate-500" />
              </button>
            </div>

            <div className="p-6 max-h-[70vh] overflow-y-auto">
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                {importPreviewMenu.map((row) => (
                  <div
                    key={row.day}
                    className={`rounded-[1.5rem] border p-4 ${
                      row.day === "Sunday"
                        ? "border-emerald-200 bg-emerald-50/40"
                        : "border-slate-200 bg-slate-50"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-4">
                      <CalendarDays
                        size={16}
                        className={
                          row.day === "Sunday"
                            ? "text-emerald-600"
                            : "text-[#5B7FED]"
                        }
                      />
                      <h3 className="text-base font-black text-slate-900">
                        {row.day}
                      </h3>
                    </div>

                    <div className="space-y-3">
                      <div className="rounded-xl bg-white border border-slate-200 p-3">
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">
                          Breakfast
                        </p>
                        <p className="text-sm text-slate-700 leading-relaxed">
                          {row.breakfast || (
                            <span className="text-slate-300">Not detected</span>
                          )}
                        </p>
                      </div>

                      <div className="rounded-xl bg-white border border-slate-200 p-3">
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">
                          Lunch
                        </p>
                        <p className="text-sm text-slate-700 leading-relaxed">
                          {row.lunch || (
                            <span className="text-slate-300">Not detected</span>
                          )}
                        </p>
                      </div>

                      <div className="rounded-xl bg-white border border-slate-200 p-3">
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">
                          Dinner
                        </p>
                        <p className="text-sm text-slate-700 leading-relaxed">
                          {row.dinner || (
                            <span className="text-slate-300">Not detected</span>
                          )}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-5 border-t border-slate-100 bg-white flex flex-col sm:flex-row items-center justify-between gap-3">
              <p className="text-sm text-slate-500">
                Review the imported menu once. Apply it to the editor, then click{" "}
                <span className="font-black text-slate-700">Save All</span>.
              </p>

              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  onClick={handleCloseImportPreview}
                  className="rounded-xl border-slate-200 text-slate-600 font-bold"
                >
                  Cancel
                </Button>

                <Button
                  onClick={handleApplyImportedMenu}
                  className="bg-[#5B7FED] hover:bg-[#4A6FD6] text-white rounded-xl font-black"
                >
                  <Upload size={16} className="mr-2" />
                  Apply To Editor
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {showPasteTextModal && (
        <div className="fixed inset-0 z-[112] flex items-center justify-center bg-slate-900/45 backdrop-blur-sm p-4">
          <Card className="w-full max-w-4xl bg-white rounded-[2rem] shadow-2xl border-none overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/60">
              <div>
                <h2 className="text-xl font-black text-slate-900">
                  Paste Menu Text
                </h2>
                <p className="text-sm text-slate-500 mt-1">
                  Paste menu in a readable format. Example: Day + Breakfast/Lunch/Dinner lines.
                </p>
              </div>
              <button
                onClick={() => setShowPasteTextModal(false)}
                className="p-2 hover:bg-slate-200 rounded-full transition-colors"
              >
                <X size={20} className="text-slate-500" />
              </button>
            </div>

            <div className="p-6">
              <textarea
                value={pastedMenuText}
                onChange={(e) => setPastedMenuText(e.target.value)}
                placeholder={`Example:

Monday
Breakfast: Poha, Tea
Lunch: Dal, Rice, Roti
Dinner: Paneer Curry, Jeera Rice

Tuesday
Breakfast: Idli, Chutney
Lunch: Rajma, Rice
Dinner: Pav Bhaji

...`}
                className="w-full min-h-[320px] rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 outline-none resize-none"
              />
            </div>

            <div className="p-5 border-t border-slate-100 bg-white flex items-center justify-between gap-3 flex-wrap">
              <p className="text-sm text-slate-500">
                Parser supports day-wise blocks and Breakfast/Lunch/Dinner labels.
              </p>

              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  onClick={() => setShowPasteTextModal(false)}
                  className="rounded-xl border-slate-200 text-slate-600 font-bold"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleParsePastedText}
                  disabled={parsingText}
                  className="bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-black"
                >
                  {parsingText ? (
                    <Loader2 size={16} className="mr-2 animate-spin" />
                  ) : (
                    <FileText size={16} className="mr-2" />
                  )}
                  {parsingText ? "Parsing..." : "Parse Text"}
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}

      <input
        ref={csvInputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={handleCsvImportUpload}
      />

      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div className="text-left flex items-center gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-black text-slate-900 tracking-tight leading-none">
              Mess Menu Management
            </h1>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <p className="text-slate-500 text-sm font-medium">
                Save drafts anytime. Publish only when the week is final.
              </p>
              {lastPublished && (
                <button
                  onClick={() => setShowHistoryModal(true)}
                  className="text-[10px] text-[#5B7FED] hover:text-[#4A6FD6] flex items-center gap-1 font-bold italic transition-colors group"
                >
                  <History
                    size={10}
                    className="group-hover:rotate-[-45deg] transition-transform"
                  />
                  Last Published: {new Date(lastPublished).toLocaleString()}
                </button>
              )}
              {lastSavedAt && (
                <span className="text-[10px] text-slate-400 font-bold italic">
                  Last Saved: {new Date(lastSavedAt).toLocaleString()}
                </span>
              )}
            </div>
          </div>

          {isDraft && (
            <div className="bg-amber-100 text-amber-700 px-3 py-1 rounded-lg flex items-center gap-2 border border-amber-200 animate-pulse">
              <FileText size={14} />
              <span className="text-[10px] font-black uppercase tracking-widest">
                Unsaved Draft
              </span>
            </div>
          )}

          <div
            className={`px-3 py-1 rounded-lg flex items-center gap-2 border ${isLocked ? "bg-red-50 text-red-600 border-red-200" : "bg-emerald-50 text-emerald-600 border-emerald-200"}`}
          >
            {isLocked ? <Lock size={14} /> : <Unlock size={14} />}
            <span className="text-[10px] font-black uppercase tracking-widest">
              {isLocked ? "Locked" : "Editable"}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {isDraft && (
            <Button
              variant="ghost"
              onClick={handleResetToLive}
              className="text-slate-400 hover:text-red-500 font-bold text-xs hover:bg-red-50 rounded-xl transition-all"
            >
              <Undo2 size={16} className="mr-2" /> Discard Changes
            </Button>
          )}

          {isLocked && (
            <Button
              onClick={handleReopenMenu}
              variant="outline"
              className="rounded-xl border-emerald-200 text-emerald-600 font-bold text-xs h-10"
            >
              <Unlock size={16} className="mr-2" /> Reopen Menu
            </Button>
          )}

          <Button
            variant="outline"
            onClick={() => window.print()}
            className="rounded-xl border-slate-200 text-slate-600 font-bold text-xs h-10 shadow-sm"
          >
            <Printer size={16} className="mr-2" /> Print
          </Button>

          <Button
            variant="outline"
            onClick={downloadMenuImage}
            className="rounded-xl border-slate-200 text-slate-600 font-bold text-xs h-10 shadow-sm"
          >
            <ImageIcon size={16} className="mr-2" /> Save Image
          </Button>

          <Button
            variant="outline"
            onClick={() => csvInputRef.current?.click()}
            disabled={importingCsv}
            className="rounded-xl border-slate-200 text-slate-600 font-bold text-xs h-10 shadow-sm"
          >
            {importingCsv ? (
              <Loader2 size={16} className="mr-2 animate-spin" />
            ) : (
              <Upload size={16} className="mr-2" />
            )}
            {importingCsv ? "Reading CSV..." : "Import CSV"}
          </Button>

          <Button
            variant="outline"
            onClick={handleOpenPasteTextModal}
            className="rounded-xl border-slate-200 text-slate-600 font-bold text-xs h-10 shadow-sm"
          >
            <FileText size={16} className="mr-2" /> Paste Menu Text
          </Button>

          <Button
            onClick={handleForceFreeze}
            variant="outline"
            className="rounded-xl border-amber-200 text-amber-600 font-bold text-xs h-10 shadow-sm"
          >
            <Sparkles size={16} className="mr-2" /> Freeze Winner Now
          </Button>

          <Button
            onClick={handleSaveAll}
            disabled={savingDraft}
            className="bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-black text-xs h-10 px-6 shadow-lg"
          >
            {savingDraft ? (
              <Loader2 size={16} className="animate-spin mr-2" />
            ) : (
              <Save size={16} className="mr-2" />
            )}
            {savingDraft ? "SAVING..." : "SAVE ALL"}
          </Button>

          <Button
            onClick={handleUpdateAll}
            disabled={saving}
            className="bg-[#5B7FED] hover:bg-[#4A6FD6] text-white rounded-xl font-black text-xs h-10 px-6 shadow-lg shadow-blue-200 transition-all"
          >
            {saving ? (
              <Loader2 size={16} className="animate-spin mr-2" />
            ) : (
              <Megaphone size={16} className="mr-2" />
            )}
            {saving ? "PUBLISHING..." : "PUBLISH & LOCK"}
          </Button>
        </div>
      </div>

      {winningItem && (
        <Card className="p-4 bg-gradient-to-r from-emerald-50 to-teal-50 border-emerald-100 flex items-center justify-between gap-4 shadow-sm rounded-2xl">
          <div className="flex items-center gap-3">
            <div className="bg-emerald-500 p-2 rounded-xl text-white shadow-md">
              <Sparkles size={20} />
            </div>
            <div>
              <h4 className="text-xs font-black text-emerald-700 uppercase tracking-widest">
                Student Choice Winner
              </h4>
              <p className="text-sm font-bold text-emerald-900">
                Majority voted for:{" "}
                <span className="underline decoration-emerald-300 decoration-2 italic">
                  {winningItem.item_name}
                </span>
              </p>
            </div>
          </div>
        </Card>
      )}

      <Card className="p-5 rounded-2xl shadow-sm bg-white border border-slate-100">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="min-w-[260px]">
            <h3 className="text-lg font-black text-slate-900">
              Manual Voting Control
            </h3>
            <p className="text-sm text-slate-500 mt-1">
              Use this if scheduler fails or if admin wants to start poll earlier.
            </p>

            {runtimeStatus && (
              <div className="mt-2 space-y-1">
                <p className="text-xs font-bold text-slate-600">
                  Status:{" "}
                  {runtimeStatus.manual_voting_force_closed
                    ? "Force Closed"
                    : runtimeStatus.manual_voting_enabled
                    ? "Started Manually"
                    : "Scheduled Mode"}
                </p>

                {runtimeStatus.manual_voting_started_by && (
                  <p className="text-xs text-slate-500">
                    Started by: {runtimeStatus.manual_voting_started_by}
                  </p>
                )}

                {runtimeStatus.manual_voting_note && (
                  <p className="text-xs text-slate-500">
                    Note: {runtimeStatus.manual_voting_note}
                  </p>
                )}

                {runtimeStatus.effective_voting_end && (
                  <p className="text-xs text-slate-500">
                    Ends at:{" "}
                    {new Date(
                      runtimeStatus.effective_voting_end,
                    ).toLocaleString("en-IN", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                )}

                {runtimeStatus.extension_minutes > 0 && (
                  <p className="text-xs text-emerald-600 font-bold">
                    Extended by {runtimeStatus.extension_minutes} minutes
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-3 w-full xl:w-auto xl:min-w-[620px]">
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="text"
                placeholder="Reason / note for manual start"
                value={manualStartNote}
                onChange={(e) => setManualStartNote(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm font-semibold outline-none flex-1"
              />

              <select
                value={manualDuration}
                onChange={(e) => setManualDuration(Number(e.target.value))}
                className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm font-semibold outline-none"
              >
                <option value={120}>2 Hours</option>
                <option value={180}>3 Hours</option>
                <option value={240}>4 Hours</option>
              </select>

              <Button
                onClick={handleStartVotingNow}
                className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black text-xs whitespace-nowrap"
              >
                <PlayCircle size={14} className="mr-2" />
                Start Voting Now
              </Button>

              <Button
                onClick={handleStopVotingNow}
                variant="outline"
                className="border-red-200 text-red-600 hover:bg-red-50 rounded-xl font-black text-xs whitespace-nowrap"
              >
                <StopCircle size={14} className="mr-2" />
                Stop Voting
              </Button>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => handleExtendVoting(30)}
                variant="outline"
                className="border-amber-200 text-amber-600 hover:bg-amber-50 rounded-xl font-black text-xs"
              >
                <Clock3 size={14} className="mr-2" />
                Extend +30 Min
              </Button>

              <Button
                onClick={() => handleExtendVoting(60)}
                variant="outline"
                className="border-blue-200 text-blue-600 hover:bg-blue-50 rounded-xl font-black text-xs"
              >
                <Clock3 size={14} className="mr-2" />
                Extend +1 Hour
              </Button>
            </div>
          </div>
        </div>
      </Card>

      <div className="bg-white p-4 rounded-[1.5rem] shadow-sm border border-slate-100 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3 flex-1 min-w-[280px] flex-wrap">
          <Bookmark size={18} className="text-[#5B7FED] ml-2" />
          <input
            type="text"
            placeholder="Template Name (e.g. Summer Special)"
            value={templateName}
            onChange={(e) => setTemplateName(e.target.value)}
            className="flex-1 bg-slate-50 border-none rounded-xl px-4 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-blue-100 placeholder:text-slate-300"
          />
          <Button
            onClick={handleSaveTemplate}
            className="bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-black text-[9px] uppercase tracking-widest px-5 h-9"
          >
            Save As Template
          </Button>
          <Button
            onClick={handleBulkClear}
            variant="ghost"
            className="text-red-500 hover:bg-red-50 rounded-xl px-3"
            title="Wipe entire editor"
          >
            <Trash2 size={18} />
          </Button>
          <Button
            onClick={viewParticipation}
            variant="outline"
            className="rounded-xl font-bold text-xs h-9 border-slate-200"
          >
            <UserCheck size={16} className="mr-2" /> Participation Report
          </Button>
        </div>

        <div className="flex items-center gap-3 pr-2">
          <FolderOpen size={18} className="text-slate-400" />
          <select
            onChange={(e) => loadTemplate(templates[e.target.value])}
            className="bg-slate-50 border-none rounded-xl px-4 py-2 text-xs font-bold text-slate-600 outline-none cursor-pointer min-w-[180px]"
          >
            <option value="">Load Saved Template...</option>
            {templates.map((t, i) => (
              <option key={i} value={i}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <Card className="p-4 bg-slate-50 border-dashed border-2 border-slate-200 rounded-2xl">
        <div className="flex flex-col sm:flex-row items-center gap-3">
          <input
            value={manualItem}
            onChange={(e) => setManualItem(e.target.value)}
            placeholder="Warden Override: Add item manually if AI misses it..."
            className="flex-1 bg-white border border-slate-200 rounded-xl px-4 py-2 text-sm font-semibold focus:ring-2 focus:ring-blue-100 outline-none"
          />
          <Button
            onClick={handleManualAdd}
            className="bg-slate-900 hover:bg-slate-800 text-white rounded-xl px-6 font-black text-[10px] uppercase tracking-widest"
          >
            <Wand2 size={16} className="mr-2" /> Add to Poll
          </Button>
        </div>
      </Card>

      <div ref={menuRef} className="space-y-4">
        {menu.map((item) => (
          <Card
            key={item.day}
            className={`p-5 border-none shadow-sm rounded-[1.5rem] bg-white border ${item.day === "Sunday" ? "ring-2 ring-emerald-100 shadow-emerald-50" : "border-slate-50"}`}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <UtensilsCrossed
                  size={16}
                  className={
                    item.day === "Sunday"
                      ? "text-emerald-500"
                      : "text-[#5B7FED]"
                  }
                />
                <h3 className="text-md font-black text-slate-800 tracking-tight">
                  {item.day}
                </h3>
              </div>
              {item.day === "Sunday" && winningItem && (
                <div className="flex items-center gap-1 bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full">
                  <TrendingUp size={12} />
                  <span className="text-[10px] font-black uppercase tracking-tighter">
                    Student Choice: {winningItem.item_name}
                  </span>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {["breakfast", "lunch", "dinner"].map((meal) => (
                <div key={meal} className="space-y-1.5 relative group">
                  <div className="flex items-center justify-between ml-1">
                    <Label className="text-[9px] font-black uppercase tracking-[0.1em] text-slate-400">
                      {meal}
                    </Label>
                    {item.day === "Sunday" && winningItem && (
                      <button
                        type="button"
                        onClick={() => applyWinningItem(meal)}
                        className="text-emerald-500 hover:text-emerald-700 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 text-[8px] font-black uppercase"
                        title={`Add ${winningItem.item_name} to ${meal}`}
                      >
                        <Wand2 size={10} /> Magic Fill: {winningItem.item_name}
                      </button>
                    )}
                  </div>
                  <textarea
                    placeholder={
                      item.day === "Sunday" && winningItem
                        ? `Winner: ${winningItem.item_name}`
                        : `Enter ${meal} menu`
                    }
                    value={item[meal]}
                    onChange={(e) =>
                      handleInputChange(item.day, meal, e.target.value)
                    }
                    disabled={isLocked}
                    className={`w-full min-h-[60px] border rounded-xl p-3 text-xs font-semibold text-slate-600 outline-none transition-all resize-none placeholder:text-slate-300 placeholder:font-normal ${item.day === "Sunday" ? "bg-emerald-50/20 border-emerald-100 focus:bg-white focus:border-emerald-500" : "bg-slate-50/50 border-slate-200 focus:bg-white focus:border-[#5B7FED]"} ${isLocked ? "opacity-70 cursor-not-allowed" : ""}`}
                  />
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Card className="p-6 rounded-2xl shadow-sm bg-white">
          <div className="flex items-center gap-2 mb-4">
            <CalendarDays size={18} className="text-[#5B7FED]" />
            <h3 className="text-lg font-black text-slate-900">
              Weekly Archive
            </h3>
          </div>
          <div className="space-y-3">
            <select
              value={selectedArchiveWeek}
              onChange={(e) => fetchArchiveMenu(e.target.value)}
              className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 text-sm font-bold text-slate-700 outline-none"
            >
              <option value="">Select archived week...</option>
              {archiveWeeks.map((week) => (
                <option key={week.week_start_date} value={week.week_start_date}>
                  {week.week_start_date}{" "}
                  {week.winner_item_name
                    ? `• Winner: ${week.winner_item_name}`
                    : ""}
                </option>
              ))}
            </select>

            {archiveMenu.length > 0 && (
              <div className="space-y-2 max-h-72 overflow-y-auto">
                {archiveMenu.map((dayRow) => (
                  <div
                    key={dayRow.day}
                    className="rounded-xl border border-slate-100 p-3 bg-slate-50"
                  >
                    <p className="text-sm font-black text-slate-800">
                      {dayRow.day}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      Breakfast: {dayRow.breakfast || "-"}
                    </p>
                    <p className="text-xs text-slate-500">
                      Lunch: {dayRow.lunch || "-"}
                    </p>
                    <p className="text-xs text-slate-500">
                      Dinner: {dayRow.dinner || "-"}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>

        <Card className="p-6 rounded-2xl shadow-sm bg-white">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 size={18} className="text-emerald-500" />
            <h3 className="text-lg font-black text-slate-900">
              Food Analytics
            </h3>
          </div>

          <div className="space-y-5">
            <div>
              <p className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-2">
                Top Requested This Month
              </p>
              <div className="space-y-2">
                {monthlyTopItems.length > 0 ? (
                  monthlyTopItems.map((item, idx) => (
                    <div
                      key={idx}
                      className="rounded-xl bg-slate-50 border border-slate-100 px-3 py-2"
                    >
                      <p className="text-sm font-bold text-slate-800">
                        {item.item_name}
                      </p>
                      <p className="text-xs text-slate-500">{item.reason}</p>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-slate-500">
                    No monthly analytics yet.
                  </p>
                )}
              </div>
            </div>

            <div>
              <p className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-2">
                Hostel-wise Preferences
              </p>
              <div className="space-y-3 max-h-72 overflow-y-auto">
                {hostelAnalytics.length > 0 ? (
                  hostelAnalytics.map((hostel, idx) => (
                    <div
                      key={idx}
                      className="rounded-xl bg-slate-50 border border-slate-100 p-3"
                    >
                      <p className="text-sm font-black text-slate-800">
                        {hostel.hostel_name}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {(hostel.top_items || []).map((it, i) => (
                          <span
                            key={i}
                            className="px-2 py-1 rounded-full text-[10px] font-black bg-emerald-50 text-emerald-700 border border-emerald-100"
                          >
                            {it.item_name}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-slate-500">
                    No hostel analytics yet.
                  </p>
                )}
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
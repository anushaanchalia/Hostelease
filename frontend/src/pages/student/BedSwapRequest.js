import React, { useEffect, useMemo, useState } from "react";
import { Card } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import api from "../../utils/api";
import { toast } from "sonner";
import {
  ArrowRightLeft,
  Bed,
  Search,
  Send,
  RefreshCcw,
  MessageSquare,
  Users,
  Home,
} from "lucide-react";

export default function BedSwapRequest() {
  const [mode, setMode] = useState("available_bed");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [availability, setAvailability] = useState([]);
  const [myRequests, setMyRequests] = useState([]);

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedHostel, setSelectedHostel] = useState("");
  const [selectedBlock, setSelectedBlock] = useState("");
  const [selectedFloor, setSelectedFloor] = useState("");
  const [selectedRoom, setSelectedRoom] = useState("");
  const [selectedBed, setSelectedBed] = useState("");

  const [targetStudentId, setTargetStudentId] = useState("");
  const [reason, setReason] = useState("");
  const [mutualConfirmed, setMutualConfirmed] = useState(true);

  useEffect(() => {
    loadAll();
  }, []);

  const loadAll = async (manual = false) => {
    try {
      if (manual) setRefreshing(true);
      else setLoading(true);

      const [availabilityRes, requestsRes] = await Promise.all([
        api.get("/bed-availability"),
        api.get("/bed-availability/my-swap-requests"),
      ]);

      setAvailability(Array.isArray(availabilityRes.data) ? availabilityRes.data : []);
      setMyRequests(Array.isArray(requestsRes.data) ? requestsRes.data : []);
    } catch (error) {
      toast.error("Failed to load swap data");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const flattenedRooms = useMemo(() => {
    const rows = [];

    for (const hostel of availability) {
      const hostelName = hostel?.hostel_name || "";
      const block = hostel?.block || "";
      const rooms = Array.isArray(hostel?.rooms) ? hostel.rooms : [];

      for (const room of rooms) {
        rows.push({
          hostel_name: hostelName,
          block,
          floor: String(room?.floor || ""),
          room_number: String(room?.room_number || ""),
          available_beds: Number(room?.available_beds || 0),
          washroom_type: room?.washroom_type || "Common",
          ac_type: room?.ac_type || "non-ac",
          sharing_type: room?.sharing_type || `${room?.capacity || 0}-sharing`,
          is_available: Boolean(room?.is_available),
        });
      }
    }

    return rows;
  }, [availability]);

  const filteredRooms = useMemo(() => {
    return flattenedRooms.filter((room) => {
      const matchesSearch =
        !searchQuery.trim() ||
        `${room.hostel_name} ${room.block} ${room.floor} ${room.room_number}`
          .toLowerCase()
          .includes(searchQuery.toLowerCase());

      const matchesOnlyAvailable = room.available_beds > 0;

      return matchesSearch && matchesOnlyAvailable;
    });
  }, [flattenedRooms, searchQuery]);

  const handleSelectRoom = (room) => {
    setSelectedHostel(room.hostel_name);
    setSelectedBlock(room.block);
    setSelectedFloor(room.floor);
    setSelectedRoom(room.room_number);
    setSelectedBed("");
    toast.success(
      `Selected ${room.hostel_name} Block ${room.block} Room ${room.room_number}`
    );
  };

  const resetForm = () => {
    setTargetStudentId("");
    setReason("");
    setSelectedHostel("");
    setSelectedBlock("");
    setSelectedFloor("");
    setSelectedRoom("");
    setSelectedBed("");
    setMutualConfirmed(true);
  };

  const handleSubmit = async () => {
    try {
      setSubmitting(true);

      if (mode === "student_swap") {
        if (!targetStudentId.trim()) {
          toast.error("Enter target student ID / enrollment");
          return;
        }

        await api.post("/bed-availability/swap-request", {
          request_type: "student_swap",
          target_student_id: targetStudentId.trim(),
          mutual_confirmed: mutualConfirmed,
          reason: reason.trim(),
        });

        toast.success("Student-to-student swap request sent to admin");
      } else {
        if (!selectedHostel || !selectedBlock || !selectedFloor || !selectedRoom) {
          toast.error("Select a target room first");
          return;
        }

        await api.post("/bed-availability/swap-request", {
          request_type: "available_bed",
          target_hostel: selectedHostel,
          target_block: selectedBlock,
          target_floor: selectedFloor,
          target_room: selectedRoom,
          target_bed: selectedBed.trim().toUpperCase() || null,
          reason: reason.trim(),
        });

        toast.success("Available-bed swap request sent to admin");
      }

      resetForm();
      loadAll(true);
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to submit swap request");
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusClass = (status) => {
    const value = String(status || "").toLowerCase();
    if (value === "approved") return "bg-emerald-50 text-emerald-600 border-emerald-100";
    if (value === "rejected") return "bg-rose-50 text-rose-600 border-rose-100";
    return "bg-amber-50 text-amber-600 border-amber-100";
  };

  if (loading) {
    return (
      <div className="text-center py-12 text-slate-500 font-semibold">
        Loading swap options...
      </div>
    );
  }

  return (
    <div className="space-y-6 fade-in" data-testid="bed-swap-request-page">
      <div className="flex items-center gap-3">
        <ArrowRightLeft size={32} className="text-[#5B7FED]" />
        <div>
          <h1
            className="text-3xl font-bold text-slate-900"
            style={{ fontFamily: "Manrope, sans-serif" }}
          >
            Bed Swap Requests
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Request swap with an agreed student or move to an available bed.
            Admin approval is required.
          </p>
        </div>
      </div>

      <Card className="p-6 bg-white rounded-2xl shadow-sm border border-slate-100">
        <div className="flex flex-col md:flex-row gap-4">
          <button
            type="button"
            onClick={() => setMode("available_bed")}
            className={`flex-1 rounded-2xl border-2 p-5 text-left transition-all ${
              mode === "available_bed"
                ? "border-[#5B7FED] bg-blue-50 shadow-sm"
                : "border-slate-200 bg-white"
            }`}
          >
            <div className="flex items-center gap-3 mb-2">
              <Bed size={20} className="text-[#5B7FED]" />
              <p className="font-bold text-slate-900">Swap to Available Bed</p>
            </div>
            <p className="text-sm text-slate-500">
              Choose an available room/bed and send a request to admin.
            </p>
          </button>

          <button
            type="button"
            onClick={() => setMode("student_swap")}
            className={`flex-1 rounded-2xl border-2 p-5 text-left transition-all ${
              mode === "student_swap"
                ? "border-[#5B7FED] bg-blue-50 shadow-sm"
                : "border-slate-200 bg-white"
            }`}
          >
            <div className="flex items-center gap-3 mb-2">
              <Users size={20} className="text-[#5B7FED]" />
              <p className="font-bold text-slate-900">Swap with Agreed Student</p>
            </div>
            <p className="text-sm text-slate-500">
              Request a direct exchange with another student after mutual agreement.
            </p>
          </button>
        </div>
      </Card>

      {mode === "available_bed" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2 p-6 bg-white rounded-2xl shadow-sm border border-slate-100">
            <div className="flex items-center justify-between gap-4 mb-5 flex-wrap">
              <div className="flex items-center gap-2">
                <Search size={18} className="text-slate-500" />
                <h3 className="font-bold text-slate-900">Available Rooms</h3>
              </div>

              <div className="relative w-full md:w-72">
                <Search
                  size={16}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search hostel, block, room..."
                  className="pl-9 rounded-xl bg-slate-50 border-slate-200"
                />
              </div>
            </div>

            <div className="space-y-4 max-h-[540px] overflow-y-auto pr-2 custom-scrollbar">
              {filteredRooms.length === 0 ? (
                <div className="text-center py-14 text-slate-400">
                  <Bed size={36} className="mx-auto mb-3 opacity-30" />
                  <p className="font-semibold">No available rooms found</p>
                </div>
              ) : (
                filteredRooms.map((room, idx) => (
                  <div
                    key={`${room.hostel_name}-${room.block}-${room.floor}-${room.room_number}-${idx}`}
                    className={`rounded-2xl border p-5 transition-all ${
                      selectedHostel === room.hostel_name &&
                      selectedBlock === room.block &&
                      selectedFloor === room.floor &&
                      selectedRoom === room.room_number
                        ? "border-[#5B7FED] bg-blue-50"
                        : "border-slate-200 bg-white"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                      <div>
                        <p className="font-bold text-slate-900 flex items-center gap-2">
                          <Home size={15} className="text-[#5B7FED]" />
                          {room.hostel_name}
                        </p>
                        <p className="text-sm text-slate-500 mt-1">
                          Block {room.block} • Floor {room.floor} • Room {room.room_number}
                        </p>
                      </div>

                      <div className="text-right">
                        <p className="text-lg font-black text-emerald-600">
                          {room.available_beds}
                        </p>
                        <p className="text-[10px] uppercase tracking-widest font-black text-slate-400">
                          Beds Left
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 mt-4">
                      <span className="px-2 py-1 rounded-full text-[10px] font-black bg-slate-100 text-slate-600 uppercase">
                        {room.ac_type}
                      </span>
                      <span className="px-2 py-1 rounded-full text-[10px] font-black bg-slate-100 text-slate-600 uppercase">
                        {room.washroom_type}
                      </span>
                      <span className="px-2 py-1 rounded-full text-[10px] font-black bg-slate-100 text-slate-600 uppercase">
                        {room.sharing_type}
                      </span>
                    </div>

                    <div className="mt-4">
                      <Button
                        onClick={() => handleSelectRoom(room)}
                        className="bg-[#5B7FED] hover:bg-[#4A6FD6] text-white rounded-xl"
                      >
                        Select Room
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>

          <Card className="p-6 bg-white rounded-2xl shadow-sm border border-slate-100">
            <div className="flex items-center gap-2 mb-5">
              <Send size={18} className="text-[#5B7FED]" />
              <h3 className="font-bold text-slate-900">Submit Request</h3>
            </div>

            <div className="space-y-4">
              <div>
                <Label className="text-sm text-slate-600">Selected Hostel</Label>
                <Input value={selectedHostel} readOnly className="mt-1 bg-slate-50 rounded-xl" />
              </div>

              <div>
                <Label className="text-sm text-slate-600">Block</Label>
                <Input value={selectedBlock} readOnly className="mt-1 bg-slate-50 rounded-xl" />
              </div>

              <div>
                <Label className="text-sm text-slate-600">Floor</Label>
                <Input value={selectedFloor} readOnly className="mt-1 bg-slate-50 rounded-xl" />
              </div>

              <div>
                <Label className="text-sm text-slate-600">Room</Label>
                <Input value={selectedRoom} readOnly className="mt-1 bg-slate-50 rounded-xl" />
              </div>

              <div>
                <Label className="text-sm text-slate-600">Preferred Bed (optional)</Label>
                <Input
                  value={selectedBed}
                  onChange={(e) => setSelectedBed(e.target.value.toUpperCase())}
                  placeholder="Example: A"
                  className="mt-1 rounded-xl"
                />
              </div>

              <div>
                <Label className="text-sm text-slate-600">Reason</Label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Why do you want to move?"
                  rows={4}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white p-3 text-sm outline-none focus:border-[#5B7FED]"
                />
              </div>

              <Button
                onClick={handleSubmit}
                disabled={submitting}
                className="w-full bg-[#5B7FED] hover:bg-[#4A6FD6] text-white rounded-xl"
              >
                {submitting ? "Submitting..." : "Send Request to Admin"}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {mode === "student_swap" && (
        <Card className="p-6 bg-white rounded-2xl shadow-sm border border-slate-100">
          <div className="max-w-2xl space-y-5">
            <div className="flex items-center gap-2 mb-2">
              <Users size={18} className="text-[#5B7FED]" />
              <h3 className="font-bold text-slate-900">Swap with Another Student</h3>
            </div>

            <div>
              <Label className="text-sm text-slate-600">Target Student ID / Enrollment</Label>
              <Input
                value={targetStudentId}
                onChange={(e) => setTargetStudentId(e.target.value)}
                placeholder="Enter agreed student's ID"
                className="mt-1 rounded-xl"
              />
            </div>

            <div className="rounded-xl bg-pink-50 border border-pink-100 p-4">
              <label className="flex items-center gap-3 text-sm font-medium text-slate-700">
                <input
                  type="checkbox"
                  checked={mutualConfirmed}
                  onChange={(e) => setMutualConfirmed(e.target.checked)}
                />
                Both students have mutually agreed to the swap
              </label>
            </div>

            <div>
              <Label className="text-sm text-slate-600">Reason</Label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Write the reason for swap"
                rows={4}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white p-3 text-sm outline-none focus:border-[#5B7FED]"
              />
            </div>

            <Button
              onClick={handleSubmit}
              disabled={submitting}
              className="bg-[#5B7FED] hover:bg-[#4A6FD6] text-white rounded-xl"
            >
              {submitting ? "Submitting..." : "Send Student Swap Request"}
            </Button>
          </div>
        </Card>
      )}

      <Card className="p-6 bg-white rounded-2xl shadow-sm border border-slate-100">
        <div className="flex items-center justify-between gap-4 flex-wrap mb-5">
          <div className="flex items-center gap-2">
            <MessageSquare size={18} className="text-[#5B7FED]" />
            <h3 className="font-bold text-slate-900">My Swap Requests</h3>
          </div>

          <Button
            variant="outline"
            onClick={() => loadAll(true)}
            className="rounded-xl border-slate-200"
          >
            <RefreshCcw
              size={14}
              className={`mr-2 ${refreshing ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
        </div>

        <div className="space-y-4">
          {myRequests.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <ArrowRightLeft size={36} className="mx-auto mb-3 opacity-30" />
              <p className="font-semibold">No swap requests yet</p>
            </div>
          ) : (
            myRequests.map((req, idx) => (
              <div
                key={idx}
                className="rounded-2xl border border-slate-200 bg-slate-50 p-5"
              >
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div>
                    <p className="font-bold text-slate-900">
                      {req.request_type === "student_swap"
                        ? "Student ↔ Student Swap"
                        : "Student → Available Bed"}
                    </p>
                    <p className="text-sm text-slate-500 mt-1">
                      Requested on{" "}
                      {req.requested_at
                        ? new Date(req.requested_at).toLocaleString()
                        : "-"}
                    </p>
                  </div>

                  <span
                    className={`px-3 py-1 rounded-full border text-[10px] font-black uppercase tracking-widest ${getStatusClass(req.status)}`}
                  >
                    {req.status || "pending"}
                  </span>
                </div>

                <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="rounded-xl bg-white p-4 border border-slate-100">
                    <p className="text-[10px] uppercase tracking-widest font-black text-slate-400 mb-1">
                      Current
                    </p>
                    <p className="text-sm font-bold text-slate-800">
                      {req.current_hostel || "-"} • Block {req.current_block || "-"} • Floor {req.current_floor || "-"}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      Room {req.current_room || "-"} • Bed {req.current_bed || "-"}
                    </p>
                  </div>

                  <div className="rounded-xl bg-white p-4 border border-slate-100">
                    <p className="text-[10px] uppercase tracking-widest font-black text-slate-400 mb-1">
                      Target
                    </p>
                    <p className="text-sm font-bold text-slate-800">
                      {req.target_hostel || "-"} • Block {req.target_block || "-"} • Floor {req.target_floor || "-"}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      Room {req.target_room || "-"} • Bed {req.target_bed || req.final_bed || "-"}
                    </p>
                  </div>
                </div>

                {req.reason ? (
                  <div className="mt-4 rounded-xl bg-blue-50 border border-blue-100 p-4">
                    <p className="text-[10px] uppercase tracking-widest font-black text-blue-600 mb-1">
                      Reason
                    </p>
                    <p className="text-sm text-slate-700">{req.reason}</p>
                  </div>
                ) : null}
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}
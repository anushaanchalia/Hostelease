import React, { useState, useEffect } from 'react';
import { Card } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { toast } from 'sonner';
import api from '../../utils/api';
import {
  Bed,
  RefreshCcw,
  User,
  MapPin,
  ArrowRightLeft,
  Check,
  X,
  Building,
  Users,
  CheckCircle2,
  Clock3,
  ShieldAlert,
  Home,
  LayoutGrid,
  FileText,
  Eye
} from 'lucide-react';

export default function BedManagement() {
  const [swapRequests, setSwapRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState('');

  const [editBedForm, setEditBedForm] = useState({
    username: '',
    targetHostel: '',
    targetBlock: '',
    targetFloor: '',
    targetRoom: '',
    targetBed: ''
  });

  useEffect(() => {
    fetchSwapRequests();
  }, []);

  const fetchSwapRequests = async () => {
    try {
      setLoading(true);
      const res = await api.get('/admin/bed-management/swaps');
      setSwapRequests(Array.isArray(res.data) ? res.data : []);
    } catch (error) {
      toast.error('Failed to load swap requests');
    } finally {
      setLoading(false);
    }
  };

  const handleSwapAction = async (requestId, action) => {
    try {
      setActingId(requestId);
      await api.post(`/admin/bed-management/swaps/${requestId}/${action}`);
      toast.success(`Swap request ${action}ed successfully.`);
      fetchSwapRequests();
    } catch (error) {
      toast.error(error.response?.data?.detail || `Failed to ${action} swap`);
    } finally {
      setActingId('');
    }
  };

  const handleManualAssignment = async (e) => {
    e.preventDefault();
    if (
      !editBedForm.username ||
      !editBedForm.targetHostel ||
      !editBedForm.targetBlock ||
      !editBedForm.targetFloor ||
      !editBedForm.targetRoom
    ) {
      return toast.error('Please fill required assignment fields');
    }

    try {
      await api.post('/admin/bed-management/assign', editBedForm);
      toast.success(
        `Resident ${editBedForm.username} successfully assigned to ${editBedForm.targetHostel} / ${editBedForm.targetRoom}`
      );
      setEditBedForm({
        username: '',
        targetHostel: '',
        targetBlock: '',
        targetFloor: '',
        targetRoom: '',
        targetBed: ''
      });
      fetchSwapRequests();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Manual assignment failed');
    }
  };

  const getRequestTypeMeta = (req) => {
    const type = String(req.request_type || '').toLowerCase();
    if (type === 'student_swap') {
      return {
        label: 'Student ↔ Student',
        className: 'bg-violet-100 text-violet-700',
        icon: <Users size={12} />
      };
    }
    return {
      label: 'Student → Available Bed',
      className: 'bg-emerald-100 text-emerald-700',
      icon: <Bed size={12} />
    };
  };

  return (
    <div className="space-y-8 fade-in pb-12 w-full max-w-[calc(100vw-310px)] ml-auto pr-8 text-left">
      <div className="flex items-center gap-4">
        <div className="w-14 h-14 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-500 border border-indigo-100 shadow-sm">
          <Bed size={32} />
        </div>
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight" style={{ fontFamily: 'Manrope, sans-serif' }}>
            Resident Bed Logistics
          </h1>
          <p className="text-slate-500 text-sm font-medium mt-1">
            Review swap requests and instantly assign beds.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <Card className="p-8 border-none shadow-2xl rounded-[2.5rem] bg-white flex flex-col h-[700px]">
          <div className="flex items-center justify-between mb-8 shrink-0">
            <div className="flex items-center gap-3">
              <ArrowRightLeft className="text-[#5B7FED]" size={20} />
              <h2 className="text-lg font-black text-slate-800 uppercase tracking-tight">
                Pending Swap Requests
              </h2>
            </div>
            <button onClick={fetchSwapRequests} className="text-slate-400 hover:text-[#5B7FED] transition-colors">
              <RefreshCcw size={16} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-4">
            {loading ? (
              <div className="h-full flex items-center justify-center text-slate-300 font-black uppercase text-xs tracking-widest">
                Loading Requests...
              </div>
            ) : swapRequests.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-300 gap-4">
                <Bed size={40} className="opacity-50" />
                <span className="font-black uppercase text-xs tracking-widest">No pending requests</span>
              </div>
            ) : (
              swapRequests.map((req) => {
                const typeMeta = getRequestTypeMeta(req);

                return (
                  <div
                    key={req._id}
                    className="p-5 bg-slate-50 border border-slate-100 rounded-2xl flex flex-col gap-4 relative group hover:border-[#5B7FED] transition-colors"
                  >
                    <div className="flex justify-between items-start gap-4">
                      <div>
                        <p className="font-black text-sm text-slate-800 flex items-center gap-2">
                          <User size={14} className="text-[#5B7FED]" />
                          {req.student_name}
                          <span className="text-[10px] text-slate-400 font-bold tracking-widest">
                            ({req.student_id})
                          </span>
                        </p>
                        <p className="text-xs text-slate-500 font-bold mt-1">
                          Submitted on {req.requested_at ? new Date(req.requested_at).toLocaleDateString() : '-'}
                        </p>
                      </div>

                      <div className="flex flex-col items-end gap-2">
                        <span className="bg-amber-100 text-amber-700 px-2 py-1 rounded text-[9px] font-black uppercase tracking-widest flex items-center gap-1">
                          <Clock3 size={11} />
                          Pending
                        </span>
                        <span className={`px-2 py-1 rounded text-[9px] font-black uppercase tracking-widest flex items-center gap-1 ${typeMeta.className}`}>
                          {typeMeta.icon}
                          {typeMeta.label}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-3">
                      <div className="flex items-center gap-4 bg-white p-4 rounded-xl shadow-sm border border-slate-100">
                        <div className="flex-1">
                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Current Allocation</p>
                          <p className="text-xs font-bold text-slate-700">{req.current_hostel || '-'}</p>
                          <p className="text-[10px] font-black text-rose-500 uppercase">
                            Block {req.current_block || '-'} • Floor {req.current_floor || '-'} • RM {req.current_room || '-'} • Bed {req.current_bed || '-'}
                          </p>
                        </div>
                      </div>

                      {String(req.request_type || '').toLowerCase() === 'student_swap' ? (
                        <div className="flex flex-col gap-2.5 bg-white p-4 rounded-xl shadow-sm border border-slate-100">
                          <div>
                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Requested Swap Partner</p>
                            <p className="text-xs font-bold text-slate-700">
                              {req.target_student_name || 'Target Student'}
                              {req.target_student_id ? (
                                <span className="text-slate-400 ml-1">({req.target_student_id})</span>
                              ) : null}
                            </p>
                            <p className="text-[10px] font-black text-emerald-500 uppercase">
                              {req.target_hostel || '-'} • Block {req.target_block || '-'} • Floor {req.target_floor || '-'} • RM {req.target_room || '-'} • Bed {req.target_bed || '-'}
                            </p>
                          </div>

                          <div className="flex items-center gap-2 pt-1 border-t border-slate-100">
                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <CheckCircle2 size={12} className="text-emerald-600" />
                              Mutual Consent: {req.mutual_confirmed ? 'Both Students Agreed' : 'Target Student Notified'}
                            </span>
                          </div>

                          {req.approval_proof ? (
                            <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 flex items-center justify-between mt-1">
                              <div className="flex items-center gap-2 overflow-hidden mr-2">
                                <FileText size={16} className="text-amber-600 shrink-0" />
                                <div className="truncate">
                                  <p className="text-xs font-bold text-amber-900 truncate">
                                    {req.approval_proof_name || 'Mutual_Agreement_Proof.pdf'}
                                  </p>
                                  <p className="text-[10px] text-amber-700">Signed Consent Attached</p>
                                </div>
                              </div>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  try {
                                    const w = window.open();
                                    if (w) {
                                      w.document.write(`<iframe src="${req.approval_proof}" frameborder="0" style="border:0; top:0; left:0; bottom:0; right:0; width:100%; height:100%;" allowfullscreen></iframe>`);
                                    } else {
                                      const a = document.createElement('a');
                                      a.href = req.approval_proof;
                                      a.download = req.approval_proof_name || 'Approval_Proof.pdf';
                                      a.click();
                                    }
                                  } catch (e) {
                                    toast.error('Unable to open PDF directly');
                                  }
                                }}
                                className="text-[11px] font-bold bg-white text-amber-900 border-amber-300 hover:bg-amber-100 h-7 px-2.5 flex items-center gap-1 shrink-0"
                              >
                                <Eye size={12} /> View Proof
                              </Button>
                            </div>
                          ) : null}
                        </div>
                      ) : (
                        <div className="flex items-center gap-4 bg-white p-4 rounded-xl shadow-sm border border-slate-100">
                          <div className="flex-1">
                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Requested Target Bed</p>
                            <p className="text-xs font-bold text-slate-700">{req.target_hostel || '-'}</p>
                            <p className="text-[10px] font-black text-emerald-500 uppercase">
                              Block {req.target_block || '-'} • Floor {req.target_floor || '-'} • RM {req.target_room || '-'} • Bed {req.target_bed || 'Auto'}
                            </p>
                          </div>
                        </div>
                      )}

                      {req.reason ? (
                        <div className="rounded-xl bg-blue-50 border border-blue-100 p-4">
                          <div className="flex items-center gap-2 mb-1">
                            <ShieldAlert size={13} className="text-blue-600" />
                            <p className="text-[9px] font-black text-blue-600 uppercase tracking-widest">Reason</p>
                          </div>
                          <p className="text-xs text-slate-700 font-medium leading-relaxed">{req.reason}</p>
                        </div>
                      ) : null}
                    </div>

                    <div className="flex gap-2 mt-2">
                      <Button
                        onClick={() => handleSwapAction(req._id, 'approve')}
                        disabled={actingId === req._id}
                        className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-md flex items-center justify-center gap-2 py-5"
                      >
                        {actingId === req._id ? <RefreshCcw size={14} className="animate-spin" /> : <Check size={14} />}
                        Approve Swap
                      </Button>
                      <Button
                        onClick={() => handleSwapAction(req._id, 'reject')}
                        disabled={actingId === req._id}
                        className="flex-1 max-w-28 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-none border border-rose-100 flex items-center justify-center"
                      >
                        <X size={14} />
                      </Button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </Card>

        <Card className="p-8 border-none shadow-2xl rounded-[2.5rem] bg-white flex flex-col h-[700px]">
          <div className="flex items-center gap-3 mb-8 shrink-0">
            <Building className="text-indigo-500" size={20} />
            <h2 className="text-lg font-black text-slate-800 uppercase tracking-tight">Direct Bed Assignment</h2>
          </div>

          <p className="text-xs text-slate-500 font-medium leading-relaxed mb-6">
            Use this module to manually forcibly assign or swap a student into a specific bed. This bypasses the student request pipeline.
          </p>

          <form onSubmit={handleManualAssignment} className="flex-1 flex flex-col space-y-5 relative">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Resident Username / Enrollment</label>
              <div className="relative group">
                <User size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                <Input
                  required
                  value={editBedForm.username}
                  onChange={(e) => setEditBedForm({ ...editBedForm, username: e.target.value })}
                  placeholder="e.g. EC22144"
                  className="pl-11 py-6 bg-slate-50 border-none rounded-2xl text-sm font-bold placeholder:text-slate-300 focus:ring-2 focus:ring-indigo-100 transition-all font-mono"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Target Hostel Name</label>
              <div className="relative group">
                <Home size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                <Input
                  required
                  value={editBedForm.targetHostel}
                  onChange={(e) => setEditBedForm({ ...editBedForm, targetHostel: e.target.value })}
                  placeholder="e.g. Tagore Bhawan"
                  className="pl-11 py-6 bg-slate-50 border-none rounded-2xl text-sm font-bold placeholder:text-slate-300 focus:ring-2 focus:ring-indigo-100 transition-all"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Block</label>
                <div className="relative group">
                  <Building size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                  <Input
                    required
                    value={editBedForm.targetBlock}
                    onChange={(e) => setEditBedForm({ ...editBedForm, targetBlock: e.target.value })}
                    placeholder="e.g. A"
                    className="pl-11 py-6 bg-slate-50 border-none rounded-2xl text-sm font-bold placeholder:text-slate-300 focus:ring-2 focus:ring-indigo-100 transition-all font-mono"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Floor</label>
                <div className="relative group">
                  <LayoutGrid size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                  <Input
                    required
                    value={editBedForm.targetFloor}
                    onChange={(e) => setEditBedForm({ ...editBedForm, targetFloor: e.target.value })}
                    placeholder="e.g. 1"
                    className="pl-11 py-6 bg-slate-50 border-none rounded-2xl text-sm font-bold placeholder:text-slate-300 focus:ring-2 focus:ring-indigo-100 transition-all font-mono"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Target Room</label>
                <div className="relative group">
                  <MapPin size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                  <Input
                    required
                    value={editBedForm.targetRoom}
                    onChange={(e) => setEditBedForm({ ...editBedForm, targetRoom: e.target.value })}
                    placeholder="e.g. 102"
                    className="pl-11 py-6 bg-slate-50 border-none rounded-2xl text-sm font-bold placeholder:text-slate-300 focus:ring-2 focus:ring-indigo-100 transition-all font-mono"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Bed No (Opt)</label>
                <div className="relative group">
                  <Bed size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                  <Input
                    value={editBedForm.targetBed}
                    onChange={(e) => setEditBedForm({ ...editBedForm, targetBed: e.target.value.toUpperCase() })}
                    placeholder="e.g. A"
                    className="pl-11 py-6 bg-slate-50 border-none rounded-2xl text-sm font-bold placeholder:text-slate-300 focus:ring-2 focus:ring-indigo-100 transition-all font-mono"
                  />
                </div>
              </div>
            </div>

            <div className="mt-8 pt-6 border-t border-slate-100"></div>

            <Button
              type="submit"
              className="w-full mt-auto py-7 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-black uppercase text-[11px] tracking-widest gap-2 shadow-xl shadow-indigo-100 transition-all active:scale-95"
            >
              Execute Direct Assignment <ArrowRightLeft size={16} />
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
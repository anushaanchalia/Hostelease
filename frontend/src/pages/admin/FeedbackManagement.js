import React, { useEffect, useMemo, useState } from 'react';
import { Card } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import api from '../../utils/api';
import { toast } from 'sonner';
import {
  Sparkles,
  RotateCcw,
  Wand2,
  Ban,
  Cpu,
  UserCheck,
  X,
  MessageCircleMore,
  UtensilsCrossed,
  Trash2,
  BarChart3
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Cell
} from 'recharts';

export default function FeedbackManagement() {
  const [feedback, setFeedback] = useState([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [manualItem, setManualItem] = useState('');
  const [isAiOnline, setIsAiOnline] = useState(false);
  const [showParticipationModal, setShowParticipationModal] = useState(false);
  const [participationData, setParticipationData] = useState([]);
  const [deletingId, setDeletingId] = useState('');

  useEffect(() => {
    loadFeedback();
    checkAiStatus();
  }, []);

  const loadFeedback = async () => {
    try {
      const response = await api.get('/food-feedback');
      setFeedback(response.data || []);
    } catch (error) {
      console.error('Error loading feedback:', error);
    }
  };

  const checkAiStatus = async () => {
    try {
      const res = await api.get('/admin/stats');
      if (res.data) setIsAiOnline(true);
    } catch (e) {
      setIsAiOnline(false);
    }
  };

  const handleOpenParticipation = async () => {
    try {
      const res = await api.get('/admin/reports/participation');
      setParticipationData(res.data || []);
      setShowParticipationModal(true);
    } catch (e) {
      toast.error('Failed to load participation report.');
    }
  };

  const handleResetFeedback = async () => {
    if (!window.confirm('Wipe all active-cycle student feedback?')) return;
    try {
      await api.delete('/food-feedback/clear-all');
      setFeedback([]);
      toast.success('Feedback database reset!');
    } catch (error) {
      toast.error('Failed to reset feedback.');
    }
  };

  const handleManualAdd = async () => {
    if (!manualItem.trim()) return toast.error('Please enter a food item name');
    try {
      await api.post('/voting/manual-add', { item_name: manualItem });
      toast.success(`${manualItem} added to the voting poll manually!`);
      setManualItem('');
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Failed to add item manually.');
    }
  };

  const handleFullVotingReset = async () => {
    if (!window.confirm('CRITICAL: This will delete ALL current voting items and student votes. Reset for the new week?')) return;
    try {
      await api.delete('/voting/reset-all');
      toast.success('Voting pool cleared. You can now add new items or run AI analysis.');
    } catch (error) {
      toast.error('Failed to reset voting data.');
    }
  };

  const analyzeFeedback = async () => {
    setAnalyzing(true);
    try {
      const response = await api.post('/food-feedback/analyze');
      toast.success(`AI Analysis Complete! ${response.data.items?.length || 0} items generated for voting`);
      if (response.data.items?.length > 0) {
        toast.info(`The top requested item is: ${response.data.items[0]}. Voting starts Wednesday 9PM!`);
      }
      loadFeedback();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Analysis failed.');
    } finally {
      setAnalyzing(false);
    }
  };

  const handleDeleteFeedback = async (item) => {
    const feedbackId = item.id || item._id;
    const isAnonymous = !!item.anonymous;

    if (!feedbackId) {
      return toast.error('Feedback id missing. Please return _id/id from backend.');
    }

    if (!window.confirm('Delete this feedback entry?')) return;

    try {
      setDeletingId(feedbackId);
      await api.delete(`/food-feedback/${feedbackId}`, {
        data: { anonymous: isAnonymous }
      });
      toast.success('Feedback deleted successfully');
      setFeedback((prev) => prev.filter((x) => (x.id || x._id) !== feedbackId));
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Failed to delete feedback');
    } finally {
      setDeletingId('');
    }
  };

  const chartData = useMemo(() => {
    const base = {
      breakfast: { meal: 'Breakfast', Bad: 0, Average: 0, Good: 0, 'Very Good': 0 },
      lunch: { meal: 'Lunch', Bad: 0, Average: 0, Good: 0, 'Very Good': 0 },
      dinner: { meal: 'Dinner', Bad: 0, Average: 0, Good: 0, 'Very Good': 0 }
    };

    feedback.forEach((item) => {
      const meal = String(item.meal_type || '').toLowerCase();
      if (!base[meal]) return;

      const rawRating =
        Number(item.rating) ||
        Number(item.ratings?.[meal]) ||
        0;

      let bucket = '';
      if (rawRating <= 1 && rawRating > 0) bucket = 'Bad';
      else if (rawRating === 2) bucket = 'Average';
      else if (rawRating === 3) bucket = 'Good';
      else if (rawRating >= 4) bucket = 'Very Good';

      if (bucket) base[meal][bucket] += 1;
    });

    return [base.breakfast, base.lunch, base.dinner];
  }, [feedback]);

  const anonymousVoice = useMemo(() => {
    return feedback.filter((item) => {
      const text = item.comment || item.suggestions || '';
      return item.anonymous && String(text).trim();
    });
  }, [feedback]);

  return (
    <div className="space-y-6">
      {showParticipationModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center px-4">
          <Card className="w-full max-w-3xl rounded-[2rem] bg-white shadow-2xl border-none overflow-hidden">
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
              <div>
                <h2 className="text-2xl font-black text-slate-900">Voting Participation</h2>
                <p className="text-sm text-slate-500 mt-1">Students who voted in the current cycle</p>
              </div>
              <button
                onClick={() => setShowParticipationModal(false)}
                className="p-2 hover:bg-slate-100 rounded-full transition-colors"
              >
                <X size={20} className="text-slate-500" />
              </button>
            </div>

            <div className="p-6 max-h-[400px] overflow-y-auto space-y-3">
              {participationData.length === 0 ? (
                <p className="text-center text-slate-400 py-4 font-bold uppercase tracking-widest text-[10px]">
                  No student records found.
                </p>
              ) : (
                participationData.map((student, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 border border-slate-100"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm ${
                          student.voted ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-600'
                        }`}
                      >
                        {(student.name || 'S').charAt(0)}
                      </div>
                      <div>
                        <p className="font-black text-slate-800 text-sm">{student.name}</p>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter">
                          ID: {student.id || student.enrollment_number}
                        </p>
                      </div>
                    </div>

                    <div className="text-right">
                      <span
                        className={`text-[9px] font-black px-3 py-1 rounded-lg border-2 ${
                          student.voted
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-600'
                            : 'bg-red-50 border-red-200 text-red-600'
                        }`}
                      >
                        {student.voted ? 'Duty Fulfilled' : 'Duty Pending'}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>
      )}

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <BarChart3 size={32} className="text-[#5B7FED]" />
          <div>
            <h1
              className="text-3xl font-black text-slate-900"
              style={{ fontFamily: 'Manrope, sans-serif' }}
            >
              Mess Feedback Analytics
            </h1>
            <p className="text-slate-500 text-sm mt-1">
              Visualizing student satisfaction across all daily meals.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button
            onClick={handleOpenParticipation}
            variant="outline"
            className="rounded-xl font-bold text-xs h-10 border-slate-200 text-slate-600"
          >
            <UserCheck size={16} className="mr-2" />
            Reports
          </Button>

          <Button
            onClick={handleResetFeedback}
            variant="outline"
            className="border-red-100 text-red-500 hover:bg-red-50 rounded-xl font-bold text-xs h-10"
          >
            <RotateCcw size={16} className="mr-2" />
            Reset Cycle
          </Button>

          <Button
            onClick={analyzeFeedback}
            disabled={analyzing}
            className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white rounded-xl font-bold text-xs h-10"
          >
            <Sparkles size={18} className="mr-2" />
            {analyzing ? 'Analyzing...' : 'AI Analyze'}
          </Button>
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
          <div className="flex gap-2 w-full sm:w-auto">
            <Button
              onClick={handleManualAdd}
              className="flex-1 sm:flex-none bg-slate-900 hover:bg-slate-800 text-white rounded-xl px-6 font-black text-[10px] uppercase tracking-widest"
            >
              <Wand2 size={16} className="mr-2" />
              Add to Poll
            </Button>

            <Button
              onClick={handleFullVotingReset}
              variant="outline"
              className="border-red-200 text-red-500 hover:bg-red-50 rounded-xl px-4"
              title="Wipe entire voting pool"
            >
              <Ban size={18} />
            </Button>
          </div>
        </div>

        <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <Cpu size={14} className="text-slate-400" />
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">
              AI Processing Core:
            </span>
            <div className="flex items-center gap-1.5 ml-1">
              <div
                className={`w-2 h-2 rounded-full ${
                  isAiOnline ? 'bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-red-500'
                }`}
              />
              <span className={`text-[10px] font-bold ${isAiOnline ? 'text-emerald-600' : 'text-red-600'}`}>
                {isAiOnline ? 'AI Analyzer Connected' : 'Backend Disconnected'}
              </span>
            </div>
          </div>
          <p className="text-[9px] font-bold italic text-slate-400">Gemini + fallback supported</p>
        </div>
      </Card>

      <Card className="p-6 rounded-[2rem] bg-white border border-slate-100 shadow-sm">
        <div className="flex items-center gap-3 mb-6">
          <UtensilsCrossed size={22} className="text-[#5B7FED]" />
          <h2 className="text-2xl font-black text-slate-900">Meal Quality Distribution</h2>
        </div>

        <div className="h-[360px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              margin={{ top: 20, right: 10, left: 0, bottom: 0 }}
              barGap={8}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
              <XAxis
                dataKey="meal"
                axisLine={false}
                tickLine={false}
                tick={{ fill: '#64748B', fontSize: 14, fontWeight: 700 }}
              />
              <YAxis
                allowDecimals={false}
                axisLine={false}
                tickLine={false}
                tick={{ fill: '#94A3B8', fontSize: 12 }}
              />
              <Tooltip
                cursor={{ fill: '#F8FAFC' }}
                contentStyle={{
                  borderRadius: '16px',
                  border: '1px solid #E2E8F0',
                  boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.08)'
                }}
              />
              <Legend />
              <Bar dataKey="Average" radius={[8, 8, 0, 0]} fill="#F4C20D" />
              <Bar dataKey="Bad" radius={[8, 8, 0, 0]} fill="#E3354A" />
              <Bar dataKey="Good" radius={[8, 8, 0, 0]} fill="#14B8A6" />
              <Bar dataKey="Very Good" radius={[8, 8, 0, 0]} fill="#22C55E" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card className="p-6 rounded-[2rem] bg-white border border-slate-100 shadow-sm">
        <div className="flex items-center gap-3 mb-6">
          <MessageCircleMore size={22} className="text-slate-700" />
          <h2 className="text-2xl font-black text-slate-900">Anonymous Student Voice</h2>
        </div>

        {anonymousVoice.length === 0 ? (
          <p className="text-center text-slate-400 py-8">No anonymous feedback yet</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {anonymousVoice.map((item, index) => {
              const feedbackId = item.id || item._id;
              const text = item.comment || item.suggestions || '';

              return (
                <div
                  key={feedbackId || index}
                  className="rounded-[1.5rem] bg-slate-50 border border-slate-200 p-5 shadow-sm relative"
                >
                  <div className="flex justify-between items-start gap-3">
                    <p className="text-slate-700 italic text-lg leading-relaxed pr-8">
                      "{text}"
                    </p>

                    <button
                      onClick={() => handleDeleteFeedback(item)}
                      className="p-2 rounded-xl hover:bg-red-100 transition-colors"
                      title="Delete feedback"
                      disabled={deletingId === feedbackId}
                    >
                      <Trash2 size={16} className="text-red-500" />
                    </button>
                  </div>

                  <div className="mt-6 pt-4 border-t border-slate-200">
                    <p className="text-sm font-black text-slate-700">🔒 Anonymous Submission</p>
                    <p className="text-xs text-slate-500 mt-1 uppercase tracking-wide">
                      {item.meal_type || 'Meal'} • {new Date(item.date).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
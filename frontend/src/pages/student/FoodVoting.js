import React, { useEffect, useRef, useState } from 'react';
import { Card } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import api from '../../utils/api';
import { toast } from 'sonner';
import {
  ThumbsUp,
  Clock,
  Award,
  AlertCircle,
  X,
  CheckCircle2,
  Sparkles,
  ShieldCheck
} from 'lucide-react';

export default function FoodVoting() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [votingEnabled, setVotingEnabled] = useState(false);
  const [hasVoted, setHasVoted] = useState(false);
  const [windowLabel, setWindowLabel] = useState('');
  const [badge, setBadge] = useState({
    points: 0,
    badge_name: 'Pending Participation',
    message: ''
  });
  const [timeLeft, setTimeLeft] = useState('');
  const [manualVotingEnabled, setManualVotingEnabled] = useState(false);
  const [manualVotingNote, setManualVotingNote] = useState('');
  const [manualVotingStartedBy, setManualVotingStartedBy] = useState('');
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [showLastTenMinutePopup, setShowLastTenMinutePopup] = useState(false);
  const [submittingVote, setSubmittingVote] = useState('');
  const [selectedItem, setSelectedItem] = useState('');

  const hasShownTenMinutePopupRef = useRef(false);

  useEffect(() => {
    loadVotingItems();
    loadBadgeStatus();

    const slowInterval = setInterval(() => {
      loadVotingItems();
      loadBadgeStatus();
    }, 60000);

    const countdownInterval = setInterval(() => {
      updateCountdown();
    }, 1000);

    return () => {
      clearInterval(slowInterval);
      clearInterval(countdownInterval);
    };
  }, []);

  useEffect(() => {
    let fastPollingInterval = null;

    if (votingEnabled || manualVotingEnabled) {
      fastPollingInterval = setInterval(() => {
        loadVotingItems(true);
      }, 5000);
    }

    return () => {
      if (fastPollingInterval) clearInterval(fastPollingInterval);
    };
  }, [votingEnabled, manualVotingEnabled]);

  useEffect(() => {
    if ((votingEnabled || manualVotingEnabled) && remainingSeconds > 0 && remainingSeconds <= 600 && !hasVoted) {
      if (!hasShownTenMinutePopupRef.current) {
        hasShownTenMinutePopupRef.current = true;
        setShowLastTenMinutePopup(true);

        toast.error('⏰ Last 10 Minutes!', {
          description: 'Voting is about to close. Cast your vote now before the deadline.',
          duration: 10000
        });
      }
    }

    if (remainingSeconds > 600 || remainingSeconds <= 0) {
      hasShownTenMinutePopupRef.current = false;
    }
  }, [remainingSeconds, votingEnabled, manualVotingEnabled, hasVoted]);

  const updateCountdown = () => {
    const end = localStorage.getItem('foodVotingEndTime');
    if (!end) {
      setTimeLeft('');
      return;
    }

    const diff = new Date(end).getTime() - new Date().getTime();

    if (diff <= 0) {
      setTimeLeft('Voting closed');
      setRemainingSeconds(0);
      return;
    }

    const totalSeconds = Math.floor(diff / 1000);
    setRemainingSeconds(totalSeconds);

    const hours = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;

    setTimeLeft(`${hours}h ${mins}m ${secs}s`);
  };

  const loadVotingItems = async (silent = false) => {
    try {
      const response = await api.get('/voting-items');
      const payload = response.data || {};

      const finalItems = Array.isArray(payload.items) ? payload.items : [];

      setItems(finalItems);
      setHasVoted(!!payload.has_voted);
      setVotingEnabled(!!payload.voting_enabled);
      setManualVotingEnabled(!!payload.manual_voting_enabled);
      setManualVotingNote(payload.manual_voting_note || '');
      setManualVotingStartedBy(payload.manual_voting_started_by || '');
      setRemainingSeconds(Number(payload.remaining_seconds || 0));

      if (payload.voting_window_start && payload.voting_window_end) {
        const start = new Date(payload.voting_window_start);
        const end = new Date(payload.voting_window_end);
        setWindowLabel(`${start.toLocaleString()} - ${end.toLocaleTimeString()}`);
        localStorage.setItem('foodVotingEndTime', payload.voting_window_end);
        updateCountdown();
      }

      if (!silent && payload.voting_enabled && !payload.has_voted) {
        toast.error('🚨 COMPULSORY ACTION', {
          description: 'It is voting time. You must vote before the window closes.',
          duration: 5000
        });
      }
    } catch (error) {
      console.error('Error loading voting items:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadBadgeStatus = async () => {
    try {
      const response = await api.get('/user/voter-status');
      setBadge(
        response.data || {
          points: 0,
          badge_name: 'Pending Participation',
          message: ''
        }
      );
    } catch (error) {
      console.error('Error loading badge status:', error);
    }
  };

  const handleVote = async (itemName) => {
    if (!votingEnabled && !manualVotingEnabled) {
      toast.error('Voting is currently closed');
      return;
    }

    if (hasVoted) {
      toast.error('You have already voted in this cycle');
      return;
    }

    try {
      setSubmittingVote(itemName);
      await api.post('/vote', { item_name: itemName });
      setSelectedItem(itemName);
      toast.success('Vote recorded! Winning item becomes Sunday Special! 🥳');
      setShowLastTenMinutePopup(false);
      await loadVotingItems(true);
      await loadBadgeStatus();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to vote');
    } finally {
      setSubmittingVote('');
    }
  };

  if (loading) {
    return <div className="p-6 text-slate-500 font-semibold">Loading voting items...</div>;
  }

  const isVotingLive = votingEnabled || manualVotingEnabled;

  return (
    <div className="space-y-6">
      {showLastTenMinutePopup && !hasVoted && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center px-4">
          <Card className="w-full max-w-md rounded-[2rem] bg-white shadow-2xl overflow-hidden">
            <div className="px-6 py-5 border-b border-red-100 bg-red-50 flex items-center justify-between">
              <div>
                <h3 className="text-2xl font-black text-red-700">Last 10 Minutes</h3>
                <p className="text-sm text-red-500 mt-1">Voting is closing soon</p>
              </div>
              <button
                onClick={() => setShowLastTenMinutePopup(false)}
                className="p-2 hover:bg-red-100 rounded-full transition-colors"
              >
                <X size={18} className="text-red-500" />
              </button>
            </div>

            <div className="p-6">
              <p className="text-sm text-slate-700 leading-relaxed">
                Please cast your vote now. The Sunday Special selection window will close very soon.
              </p>

              <div className="mt-4 rounded-2xl bg-red-50 border border-red-100 px-4 py-3">
                <p className="text-xs font-black uppercase tracking-widest text-red-500">
                  Time Remaining
                </p>
                <p className="text-2xl font-black text-red-600 mt-1">
                  {timeLeft || 'Closing...'}
                </p>
              </div>

              <Button
                onClick={() => window.scrollTo({ top: document.body.scrollHeight / 3, behavior: 'smooth' })}
                className="w-full mt-5 bg-red-600 hover:bg-red-700 text-white rounded-2xl font-black"
              >
                Vote Now
              </Button>
            </div>
          </Card>
        </div>
      )}

      <div className="flex items-center gap-3">
        <ThumbsUp size={32} className="text-[#F4C20D]" />
        <div>
          <h1
            className="text-3xl font-black text-slate-900"
            style={{ fontFamily: 'Manrope, sans-serif' }}
          >
            Food Voting
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Vote for your favorite AI-selected food item for the Sunday Special.
          </p>
        </div>
      </div>

      {manualVotingEnabled && (
        <Card className="p-5 bg-gradient-to-r from-blue-50 to-emerald-50 border border-blue-200 rounded-[1.75rem]">
          <div className="flex items-start gap-3">
            <AlertCircle size={22} className="text-blue-600 mt-0.5" />
            <div>
              <p className="text-sm font-black text-slate-900">Manual Voting Started by Admin</p>
              <p className="text-sm text-slate-600 mt-1">
                {manualVotingNote || 'Voting has been started manually.'}
              </p>
              {manualVotingStartedBy && (
                <p className="text-xs text-slate-500 mt-1">
                  Started by: {manualVotingStartedBy}
                </p>
              )}
            </div>
          </div>
        </Card>
      )}

      <Card className="p-5 bg-gradient-to-r from-emerald-50 to-blue-50 border border-emerald-100 rounded-[1.75rem]">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <Award size={22} className="text-emerald-600" />
            <div>
              <p className="text-sm font-black text-slate-900">{badge.badge_name}</p>
              <p className="text-xs text-slate-500">{badge.message}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-2xl font-black text-emerald-600">{badge.points || 0}</p>
            <p className="text-xs text-slate-500 uppercase tracking-widest">Reward Points</p>
          </div>
        </div>
      </Card>

      <Card className="p-6 bg-white rounded-[2rem] shadow-sm border border-slate-100">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-5">
            <div className="flex items-center gap-3">
              <Clock size={22} className="text-slate-600" />
              <div>
                <p className="font-black text-slate-900">Voting Window</p>
                <p className="text-sm text-slate-600 mt-1">
                  {isVotingLive ? (
                    <span className="text-emerald-600 font-bold">🟢 Poll Live</span>
                  ) : (
                    <span className="text-red-600 font-bold">🔴 Voting Closed</span>
                  )}
                </p>
              </div>
            </div>
            {windowLabel && <p className="text-xs text-slate-500 mt-4">{windowLabel}</p>}
          </div>

          <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-5 text-center">
            <p
              className={`text-2xl font-black ${
                remainingSeconds <= 600 && isVotingLive ? 'text-red-600' : 'text-slate-900'
              }`}
            >
              {timeLeft || '—'}
            </p>
            <p className="text-xs text-slate-500 uppercase tracking-widest mt-1">Time Left</p>
          </div>

          <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-5 text-center">
            <p className="text-2xl font-black text-[#26429B]">{items.length}</p>
            <p className="text-xs text-slate-500 uppercase tracking-widest mt-1">
              AI Selected Options
            </p>
          </div>
        </div>
      </Card>

      {hasVoted && (
        <Card className="p-5 bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 rounded-[2rem]">
          <div className="flex items-start gap-3">
            <CheckCircle2 size={22} className="text-emerald-600 mt-0.5" />
            <div>
              <p className="text-sm font-black text-slate-900">Your vote has been submitted</p>
              <p className="text-sm text-slate-600 mt-1">
                {selectedItem
                  ? `You voted for ${selectedItem}.`
                  : 'You have already participated in this cycle.'}
              </p>
            </div>
          </div>
        </Card>
      )}

      {!isVotingLive && items.length === 0 && (
        <Card className="p-8 rounded-[2rem] bg-white border border-slate-100 shadow-sm text-center">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-slate-100 flex items-center justify-center">
            <Clock size={28} className="text-slate-500" />
          </div>
          <h2 className="text-2xl font-black text-slate-900 mt-5">Voting not live right now</h2>
          <p className="text-slate-500 text-sm mt-2 max-w-xl mx-auto">
            Voting opens on Wednesday after Tuesday night AI analysis prepares the top 10 food items.
            The poll stays open during the active voting window and closes according to the backend schedule.
          </p>
        </Card>
      )}

      {items.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {items.map((item, index) => {
            const disabled = !isVotingLive || hasVoted || !!submittingVote;

            return (
              <Card
                key={`${item.item_name}-${index}`}
                className="p-6 bg-white rounded-[2rem] shadow-sm border border-slate-100 hover:shadow-md transition-all"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700">
                        Option #{index + 1}
                      </span>
                    </div>

                    <h3 className="text-xl font-black text-slate-900 mt-4">
                      {item.item_name}
                    </h3>

                    <div className="mt-3 rounded-2xl bg-slate-50 border border-slate-100 p-4">
                      <div className="flex items-start gap-2">
                        <Sparkles size={15} className="text-indigo-500 mt-0.5" />
                        <p className="text-sm text-slate-600 leading-relaxed">
                          {item.reason || 'Highly requested by students across recent feedback entries.'}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-5">
                  <p className="text-xs text-slate-400 font-semibold">
                    Vote for this item to make it Sunday Special
                  </p>
                </div>

                <div className="mt-5 flex justify-between items-center gap-3">
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <ShieldCheck size={14} />
                    <span>One student can vote once</span>
                  </div>

                  <Button
                    onClick={() => handleVote(item.item_name)}
                    disabled={disabled}
                    className="bg-[#26429B] hover:bg-[#1F3782] text-white rounded-xl"
                  >
                    <ThumbsUp size={14} className="mr-1" />
                    {submittingVote === item.item_name
                      ? 'Submitting...'
                      : hasVoted
                      ? 'Voted'
                      : 'Vote'}
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
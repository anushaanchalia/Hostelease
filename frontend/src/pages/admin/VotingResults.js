import React, { useEffect, useRef, useState } from 'react';
import { Card } from '../../components/ui/card';
import { Progress } from '../../components/ui/progress';
import api from '../../utils/api';
import { Trophy, Users, Clock, AlertCircle, RefreshCw } from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell
} from 'recharts';

export default function VotingResults() {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [votingEnabled, setVotingEnabled] = useState(false);
  const [manualVotingEnabled, setManualVotingEnabled] = useState(false);
  const [manualVotingNote, setManualVotingNote] = useState('');
  const [manualVotingStartedBy, setManualVotingStartedBy] = useState('');
  const [windowLabel, setWindowLabel] = useState('');
  const [timeLeft, setTimeLeft] = useState('');
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const firstLoadDone = useRef(false);

  useEffect(() => {
    loadResults();
    loadVotingRuntime();

    const slowInterval = setInterval(() => {
      loadResults(true);
      loadVotingRuntime(true);
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
        loadResults(true);
        loadVotingRuntime(true);
      }, 5000);
    }

    return () => {
      if (fastPollingInterval) clearInterval(fastPollingInterval);
    };
  }, [votingEnabled, manualVotingEnabled]);

  const updateCountdown = () => {
    const end = localStorage.getItem('adminFoodVotingEndTime');
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

  const loadVotingRuntime = async (silent = false) => {
    try {
      const response = await api.get('/voting-items');
      const payload = response.data || {};

      setVotingEnabled(!!payload.voting_enabled);
      setManualVotingEnabled(!!payload.manual_voting_enabled);
      setManualVotingNote(payload.manual_voting_note || '');
      setManualVotingStartedBy(payload.manual_voting_started_by || '');
      setRemainingSeconds(Number(payload.remaining_seconds || 0));

      if (payload.voting_window_start && payload.voting_window_end) {
        const start = new Date(payload.voting_window_start);
        const end = new Date(payload.voting_window_end);
        setWindowLabel(`${start.toLocaleString()} - ${end.toLocaleTimeString()}`);
        localStorage.setItem('adminFoodVotingEndTime', payload.voting_window_end);
        updateCountdown();
      }
    } catch (error) {
      if (!silent) console.error('Error loading voting runtime:', error);
    }
  };

  const loadResults = async (silent = false) => {
    try {
      const response = await api.get('/voting-results');
      const sortedResults = (Array.isArray(response.data) ? response.data : []).sort(
        (a, b) => Number(b.vote_count || 0) - Number(a.vote_count || 0)
      );
      setResults(sortedResults);
    } catch (error) {
      if (!silent) console.error('Error loading results:', error);
    } finally {
      if (!firstLoadDone.current) {
        setLoading(false);
        firstLoadDone.current = true;
      }
    }
  };

  if (loading) {
    return <div className="p-6 text-slate-500 font-semibold">Loading results...</div>;
  }

  const totalVotes = results.reduce((sum, item) => sum + Number(item.vote_count || 0), 0);
  const winner = results.length > 0 ? results[0] : null;
  const isLive = votingEnabled || manualVotingEnabled;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Trophy size={32} className="text-[#F4C20D]" />
          <div>
            <h1
              className="text-3xl font-black text-slate-900"
              style={{ fontFamily: 'Manrope, sans-serif' }}
            >
              Live Food Voting Results
            </h1>
            <p className="text-slate-500 text-sm mt-1">
              Admin view of current voting leaderboard and distribution
            </p>
          </div>
        </div>

        <button
          onClick={() => {
            loadResults();
            loadVotingRuntime();
          }}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 font-bold hover:bg-slate-50"
        >
          <RefreshCw size={16} />
          Refresh
        </button>
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
                <p className="text-xs text-slate-500 mt-1">Started by: {manualVotingStartedBy}</p>
              )}
            </div>
          </div>
        </Card>
      )}

      <Card className="p-6 bg-white rounded-[2rem] shadow-sm border border-slate-100">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-5">
            <div className="flex items-center gap-3">
              <Clock size={22} className="text-slate-600" />
              <div>
                <p className="font-black text-slate-900">Voting Window</p>
                <p className="text-sm text-slate-600 mt-1">
                  {isLive ? (
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
                remainingSeconds <= 600 && isLive ? 'text-red-600' : 'text-slate-900'
              }`}
            >
              {timeLeft || '—'}
            </p>
            <p className="text-xs text-slate-500 uppercase tracking-widest mt-1">Time Left</p>
          </div>

          <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-5 text-center">
            <p className="text-2xl font-black text-[#26429B]">{totalVotes}</p>
            <p className="text-xs text-slate-500 uppercase tracking-widest mt-1">
              Total Votes
            </p>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_1fr] gap-6">
        <Card className="p-6 bg-white rounded-[2rem] shadow-sm border border-slate-100 min-h-[520px]">
          <h2 className="text-2xl font-black text-slate-900 mb-8 text-center">Vote Distribution</h2>

          {results.length > 0 ? (
            <div className="h-[380px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={results} margin={{ top: 10, right: 20, left: 0, bottom: 30 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                  <XAxis
                    dataKey="item_name"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#64748B', fontSize: 12 }}
                  />
                  <YAxis
                    allowDecimals={false}
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#64748B', fontSize: 12 }}
                  />
                  <Tooltip
                    cursor={{ fill: '#F8FAFC' }}
                    contentStyle={{
                      borderRadius: '18px',
                      border: '1px solid #E2E8F0',
                      boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.08)'
                    }}
                  />
                  <Bar dataKey="vote_count" radius={[8, 8, 0, 0]}>
                    {results.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={index === 0 ? '#F4C20D' : isLive ? '#26429B' : '#E3354A'}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-[380px] flex items-center justify-center text-slate-400 font-semibold">
              No voting data available
            </div>
          )}
        </Card>

        <Card className="p-6 bg-white rounded-[2rem] shadow-sm border border-slate-100 min-h-[520px]">
          <div className="flex items-start justify-between gap-4 mb-6">
            <h2 className="text-2xl font-black text-slate-900">Leaderboard</h2>

            <div className="rounded-2xl bg-slate-100 px-4 py-3 text-right min-w-[140px]">
              <div className="flex items-center justify-end gap-2">
                <Users size={14} className="text-slate-600" />
                <p className="text-sm font-semibold text-slate-700">Total Votes</p>
              </div>
              <p className="text-2xl font-black text-slate-900 mt-1">{totalVotes}</p>
            </div>
          </div>

          <div className="grid grid-cols-[1fr_90px_70px] gap-3 px-3 py-3 text-sm font-black text-slate-700 border-b border-slate-200">
            <div>Food Item</div>
            <div className="text-center">Votes</div>
            <div className="text-right">%</div>
          </div>

          <div className="mt-2 space-y-3">
            {results.length === 0 ? (
              <div className="py-12 text-center text-slate-400 font-semibold">No items available</div>
            ) : (
              results.map((item, index) => {
                const percentage = totalVotes > 0
                  ? ((Number(item.vote_count || 0) / totalVotes) * 100).toFixed(1)
                  : '0.0';

                return (
                  <div key={index} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                    <div className="grid grid-cols-[1fr_90px_70px] gap-3 items-center">
                      <div>
                        <p className="font-black text-slate-900">{item.item_name}</p>
                        <p className="text-xs text-slate-500 mt-1">
                          {item.reason || 'Highly requested by students.'}
                        </p>
                      </div>
                      <div className="text-center text-lg font-black text-slate-900">
                        {item.vote_count}
                      </div>
                      <div className="text-right text-sm font-black text-slate-600">
                        {percentage}%
                      </div>
                    </div>

                    <div className="mt-4">
                      <Progress value={Number(percentage)} className="h-2.5" />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </Card>
      </div>

      {winner && (
        <Card className="p-5 bg-gradient-to-r from-yellow-50 to-amber-50 border border-yellow-200 rounded-[2rem]">
          <div className="flex items-center gap-3">
            <Trophy size={24} className="text-yellow-600" />
            <div>
              <p className="text-xs font-black uppercase tracking-widest text-yellow-600">Current Winner</p>
              <p className="text-lg font-black text-slate-900">{winner.item_name}</p>
              <p className="text-sm text-slate-500">{winner.vote_count} votes</p>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
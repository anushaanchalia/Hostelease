import React, { useState, useEffect } from 'react';
import { Routes, Route, Link, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { clearAuth, getUser, setAuth, getToken } from '../utils/auth';
import api from '../utils/api';
import {
  Home,
  User,
  Utensils,
  MessageSquare,
  ThumbsUp,
  Bed,
  AlertTriangle,
  CreditCard,
  FileText,
  Shirt,
  Calendar,
  Bell,
  LogOut,
  ShieldAlert,
  Clock,
  CloudSun,
  Send,
  ShieldCheck,
  Medal,
  ArrowRightLeft
} from 'lucide-react';
import { Card } from '../components/ui/card';

import StudentHome from './student/StudentHome';
import MessMenu from './student/MessMenu';
import MessFeedback from './student/MessFeedback';
import FoodVoting from './student/FoodVoting';
import BedAvailability from './student/BedAvailability';
import Complaints from './student/Complaints';
import Payments from './student/Payments';
import Gatepass from './student/Gatepass';
import Laundry from './student/Laundry';
import Attendance from './student/Attendance';
import Notifications from './student/Notifications';
import Profile from './student/Profile';
import BookHostel from './student/BookHostel';
import BedSwapRequest from './student/BedSwapRequest';

const hostelAliases = {
  azad: 'Azad Bhawan',
  'azad bhawan': 'Azad Bhawan',
  atal: 'Atal Bhawan',
  'atal bhawan': 'Atal Bhawan',
  tagore: 'Tagore Bhawan',
  'tagore bhawan': 'Tagore Bhawan',
  shakuntala: 'Shakuntala Bhawan',
  'shakuntala bhawan': 'Shakuntala Bhawan',
  shakunthala: 'Shakuntala Bhawan',
  'shakunthala bhawan': 'Shakuntala Bhawan',
  janaki: 'Janaki Bhawan',
  'janaki bhawan': 'Janaki Bhawan',
  teresa: 'Teresa Bhawan',
  'teresa bhawan': 'Teresa Bhawan'
};

const normalizeHostel = (name = '') => {
  const cleaned = String(name || '').trim();
  if (!cleaned) return 'N/A';
  const key = cleaned.toLowerCase().replace(/\s+/g, ' ').trim();
  return hostelAliases[key] || cleaned;
};

const StudentDashboard = () => {
  const location = useLocation();
  const navigate = useNavigate();

  const [user, setUser] = useState(getUser());
  const [currentTime, setCurrentTime] = useState(new Date());
  const [isOverdue, setIsOverdue] = useState(false);
  const [explanation, setExplanation] = useState('');
  const [voterStatus, setVoterStatus] = useState(null);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const checkSecurityAndVoterStatus = async () => {
      try {
        const token = getToken();
        if (!token) return;

        let freshUser = getUser();

        try {
          const res = await api.get('/student/me');
          if (res?.data) {
            freshUser = {
              ...res.data,
              hostel_name: normalizeHostel(res.data?.hostel_name || res.data?.hostel || 'N/A'),
              block: res.data?.block || 'N/A',
              room_number: res.data?.room_number || 'N/A'
            };

            setUser(freshUser);
            setAuth(token, freshUser);

            if (freshUser?.explanation_required) {
              setIsOverdue(true);
            } else {
              setIsOverdue(false);
            }
          }
        } catch (profileErr) {
          console.error('Student profile sync failed:', profileErr);
        }

        try {
          const voterRes = await api.get('/user/voter-status');
          setVoterStatus(voterRes?.data || null);
        } catch (voterErr) {
          console.error('Voter status sync failed:', voterErr);
          setVoterStatus(null);
        }
      } catch (err) {
        console.error('Status sync failed:', err);
      }
    };

    checkSecurityAndVoterStatus();
  }, []);

  const handleLogout = () => {
    clearAuth();
    navigate('/login');
  };

  const submitOverdueReason = async () => {
    if (!explanation.trim()) return;

    try {
      await api.post('/student/gatepass/submit-explanation', { reason: explanation });
      setIsOverdue(false);
      setExplanation('');
      window.alert('Explanation submitted. Waiting for Warden approval.');
    } catch (err) {
      console.error('Overdue explanation submit failed:', err);
      window.alert('Submission failed. Try again.');
    }
  };

  const menuItems = [
    { path: '/student', icon: Home, label: 'Dashboard', exact: true },
    { path: '/student/profile', icon: User, label: 'My Profile' },
    { path: '/student/book-hostel', icon: Bed, label: 'Book Hostel', badge: 'New' },
    { path: '/student/mess-menu', icon: Utensils, label: 'Mess Menu' },
    { path: '/student/feedback', icon: MessageSquare, label: 'Mess Feedback' },
    { path: '/student/voting', icon: ThumbsUp, label: 'Food Voting' },
    { path: '/student/beds', icon: Bed, label: 'Bed Availability' },
    { path: '/student/bed-swap', icon: ArrowRightLeft, label: 'Bed Swap' },
    { path: '/student/complaints', icon: AlertTriangle, label: 'Complaints' },
    { path: '/student/payments', icon: CreditCard, label: 'Payments' },
    { path: '/student/gatepass', icon: FileText, label: 'Gatepass' },
    { path: '/student/laundry', icon: Shirt, label: 'Laundry' },
    { path: '/student/attendance', icon: Calendar, label: 'Attendance' },
    { path: '/student/notifications', icon: Bell, label: 'Notifications' }
  ];

  const displayName = user?.student_name || user?.username || 'Student';
  const displayHostel = normalizeHostel(user?.hostel_name || user?.hostel || 'N/A');
  const displayRoom = user?.room_number || 'N/A';

  return (
    <div className="flex min-h-screen bg-[#F8FAFC] font-sans">
      <aside className="fixed left-0 top-0 h-screen w-64 z-50 shadow-[5px_0_25px_rgba(0,0,0,0.1)] bg-[#1E293B]">
        <div className="p-8">
          <h1 className="text-2xl font-black tracking-tighter text-white">HOSTELEASE</h1>
          <div className="h-1 w-12 bg-[#5B7FED] mt-2 rounded-full shadow-[0_0_10px_#5B7FED]" />
        </div>

        <nav className="px-4 space-y-2 overflow-y-auto h-[calc(100vh-220px)] custom-scrollbar">
          {menuItems.map((item) => (
            <motion.div key={item.path} whileHover={{ x: 4 }}>
              <Link
                to={item.path}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 ${
                  location.pathname === item.path
                    ? 'bg-[#5B7FED] text-white shadow-lg'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                <item.icon size={19} strokeWidth={2.5} />
                <span className="text-sm font-bold">{item.label}</span>
                {item.badge && (
                  <span className="ml-auto px-2 py-0.5 bg-emerald-500 text-white text-[9px] rounded-full font-black">
                    {item.badge}
                  </span>
                )}
              </Link>
            </motion.div>
          ))}
        </nav>

        <div className="absolute bottom-8 left-0 w-full px-6">
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-3 p-4 rounded-2xl bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white transition-all duration-300"
          >
            <LogOut size={18} />
            <span className="font-bold text-sm">Sign Out</span>
          </button>
        </div>
      </aside>

      <main className="flex-1 ml-64 min-h-screen relative">
        <AnimatePresence>
          {isOverdue && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="fixed inset-0 z-[70] bg-slate-900/95 backdrop-blur-xl flex items-center justify-center p-6"
            >
              <motion.div
                initial={{ scale: 0.9 }}
                animate={{ scale: 1 }}
                className="bg-white p-10 rounded-[3rem] shadow-2xl max-w-lg w-full border-t-8 border-red-500"
              >
                <div className="w-20 h-20 bg-red-50 text-red-500 rounded-3xl flex items-center justify-center mb-6">
                  <ShieldAlert size={40} />
                </div>
                <h2 className="text-3xl font-black text-slate-900 mb-2">Return Overdue</h2>
                <p className="text-slate-500 mb-8 font-medium">
                  Your residency status is flagged. Access to the dashboard is restricted until you submit a valid
                  reason for your late return (Parent verification required).
                </p>

                <textarea
                  placeholder="Describe your reason here..."
                  className="w-full p-5 bg-slate-50 border-2 border-slate-100 rounded-2xl mb-6 text-sm font-bold h-32 focus:border-red-200 outline-none transition-all"
                  value={explanation}
                  onChange={(e) => setExplanation(e.target.value)}
                />

                <button
                  onClick={submitOverdueReason}
                  className="w-full py-5 bg-red-600 text-white rounded-2xl font-black shadow-xl shadow-red-200 hover:bg-red-700 transition-all flex items-center justify-center gap-2"
                >
                  <Send size={18} /> Submit Explanation
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <header className="sticky top-0 z-40 h-24 px-12 flex items-center justify-between bg-white/70 backdrop-blur-xl border-b border-slate-100">
          <div className="flex items-center gap-8">
            <div className="flex items-center gap-3 bg-slate-50 px-5 py-3 rounded-2xl border border-slate-100 shadow-sm">
              <Clock size={20} className="text-[#5B7FED]" />
              <div className="leading-tight">
                <p className="text-[15px] font-black text-slate-800 tabular-nums">
                  {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </p>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  {currentTime.toLocaleDateString([], { month: 'short', day: 'numeric' })}
                </p>
              </div>
            </div>

            <div className="hidden lg:flex items-center gap-3 bg-blue-50/50 px-5 py-3 rounded-2xl border border-blue-100">
              <CloudSun size={20} className="text-blue-500" />
              <div className="leading-tight">
                <p className="text-[15px] font-black text-slate-800">28°C</p>
                <p className="text-[10px] font-bold text-blue-400 uppercase tracking-widest">Clear Sky</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-5">
            <div className="text-right">
              <p className="text-[15px] font-black text-slate-900 uppercase tracking-tight">{displayName}</p>
              <p className="text-[11px] text-slate-400 font-black uppercase tracking-wider">
                {displayHostel} • RM {displayRoom}
              </p>
            </div>
            <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-[#5B7FED] to-[#3B82F6] flex items-center justify-center text-white font-black text-xl shadow-lg">
              {displayName?.charAt(0) || 'S'}
            </div>
          </div>
        </header>

        <div className="p-10 max-w-[1600px] mx-auto">
          {voterStatus?.earned_badge && (
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="mb-8">
              <Card className="p-5 bg-gradient-to-br from-emerald-500 to-teal-600 text-white border-none rounded-[2rem] shadow-xl shadow-emerald-100 flex items-center justify-between overflow-hidden relative group">
                <div className="flex items-center gap-5 relative z-10">
                  <div className="p-3 bg-white/20 rounded-2xl backdrop-blur-md shadow-inner">
                    <Medal size={28} className="text-yellow-300 fill-yellow-300 animate-bounce" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-[11px] font-black uppercase tracking-[0.2em] text-emerald-100">
                        Weekly Achievement
                      </p>
                      <div className="h-1 w-1 bg-white/40 rounded-full" />
                      <p className="text-[11px] font-bold text-emerald-50 italic">Verified Resident Duty</p>
                    </div>
                    <h3 className="font-black text-xl tracking-tight mt-0.5">{voterStatus.badge_name}</h3>
                    <p className="text-xs font-medium text-emerald-50/90 mt-1 flex items-center gap-1.5">
                      <ShieldCheck size={14} className="text-emerald-200" /> {voterStatus.message}
                    </p>
                  </div>
                </div>
                <ShieldCheck
                  size={80}
                  className="absolute -right-4 -bottom-4 opacity-10 rotate-12 group-hover:rotate-0 transition-transform duration-500"
                />
                <div className="absolute top-0 right-1/4 w-32 h-full bg-white/5 skew-x-[-20deg] group-hover:translate-x-20 transition-transform duration-1000" />
              </Card>
            </motion.div>
          )}

          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
            >
              <Routes>
                <Route index element={<StudentHome />} />
                <Route path="profile" element={<Profile />} />
                <Route path="book-hostel" element={<BookHostel />} />
                <Route path="mess-menu" element={<MessMenu />} />
                <Route path="feedback" element={<MessFeedback />} />
                <Route path="voting" element={<FoodVoting />} />
                <Route path="beds" element={<BedAvailability />} />
                <Route path="bed-swap" element={<BedSwapRequest />} />
                <Route path="complaints" element={<Complaints />} />
                <Route path="payments" element={<Payments />} />
                <Route path="gatepass" element={<Gatepass />} />
                <Route path="laundry" element={<Laundry />} />
                <Route path="attendance" element={<Attendance />} />
                <Route path="notifications" element={<Notifications />} />
              </Routes>
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
};

export default StudentDashboard;
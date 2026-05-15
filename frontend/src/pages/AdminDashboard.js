import React from 'react';
import { Routes, Route, Link, useLocation, useNavigate } from 'react-router-dom';
import { clearAuth, getUser } from '../utils/auth';
import { 
  LayoutDashboard, Users, Map, Search, User as UserIcon,
  Utensils, MessageSquare, BarChart3, AlertTriangle, 
  FileText, Calendar, LogOut, Bed, ShieldCheck, ShieldAlert , Bell, BookMarked
} from 'lucide-react';
import { Card } from '../components/ui/card'; // Ensure Card is imported

import AdminHome from './admin/AdminHome';
import StudentDatabase from './admin/StudentDatabase';
import BedManagement from './admin/BedManagement';
import MessMenuManagement from './admin/MessMenuManagement';
import FeedbackManagement from './admin/FeedbackManagement';
import VotingResults from './admin/VotingResults';
import ComplaintManagement from './admin/ComplaintManagement';
import GatepassApprovals from './admin/GatepassApprovals';
import AttendanceManagement from './admin/AttendanceManagement';
import LaundryManagement from './admin/LaundryManagement';
import VisitorManagement from './admin/VisitorManagement';
import LiveRoomMap from './admin/LiveRoomMap';
import GlobalLookup from './admin/GlobalLookup';
import AdminProfile from './admin/AdminProfile'; 
import AdminNotifications from './admin/AdminNotifications'; 
import YearlyBookings from './admin/YearlyBookings';
import FinesManagement from './admin/FinesManagement';

export default function AdminDashboard() {
  const location = useLocation();
  const navigate = useNavigate();
  const user = getUser();

  // LOGIC: Mandatory Password Change Check
  const needsPasswordChange = user?.is_default_password;

  const handleLogout = () => {
    clearAuth();
    navigate('/login');
  };

  const menuItems = [
    { path: '/admin', icon: LayoutDashboard, label: 'Main Dashboard', exact: true },
    { path: '/admin/students', icon: Users, label: 'Student Database' },
    { path: '/admin/beds', icon: Bed, label: 'Bed Management' },
    { path: '/admin/yearly-bookings', icon: BookMarked, label: 'Yearly Bookings' },
    { path: '/admin/fines', icon: AlertTriangle, label: 'Disciplinary Fines' },
    { path: '/admin/mess-menu', icon: Utensils, label: 'Mess Menu' },
    { path: '/admin/feedback', icon: MessageSquare, label: 'Mess Feedback' },
    { path: '/admin/voting', icon: BarChart3, label: 'Voting Results' },
    { path: '/admin/live-map', icon: Map, label: 'Live Room Map' },
    { path: '/admin/global-lookup', icon: Search, label: 'Global Lookup' },
    { path: '/admin/visitors', icon: ShieldCheck, label: 'Visitor Log' },
    { path: '/admin/notifications', icon: Bell, label: 'Notice Board' },
    { path: '/admin/profile', icon: UserIcon, label: 'Admin Profile' },
  ];

  const isActive = (path, exact = false) => {
    return exact ? location.pathname === path : location.pathname.startsWith(path);
  };

  // Guardrail Overlay
  if (needsPasswordChange && window.location.pathname !== '/admin/profile') {
    return (
        <div className="fixed inset-0 z-[9999] bg-slate-900/90 backdrop-blur-md flex items-center justify-center p-6">
            <Card className="w-full max-w-md p-10 bg-white rounded-[3rem] text-center border-none shadow-2xl">
                <div className="w-20 h-20 bg-rose-50 rounded-3xl flex items-center justify-center mx-auto mb-6 border border-rose-100 text-rose-500">
                    <ShieldAlert size={40} />
                </div>
                <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tighter mb-2">Security Required</h2>
                <p className="text-slate-500 font-medium mb-8">For security purposes, you must update your default password before accessing the admin dashboard.</p>
                <Link to="/admin/profile" className="block w-full py-5 bg-[#5B7FED] hover:bg-blue-600 text-white rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl shadow-blue-100 transition-all">
                    Update Security Settings
                </Link>
            </Card>
        </div>
    );
  }

  return (
    <div className="flex min-h-screen" style={{ backgroundColor: '#F8FAFC' }}>
      {/* Sidebar logic preserved */}
      <aside 
        className="fixed left-0 top-0 h-screen w-64 overflow-y-auto flex flex-col shadow-xl z-50"
        style={{ backgroundColor: '#2C3E50' }}
      >
        <div className="p-6">
          <h1 className="text-2xl font-bold text-white tracking-tight" style={{ fontFamily: 'Manrope, sans-serif' }}>
            HOSTELEASE
          </h1>
          <p className="text-slate-400 text-[10px] mt-1 uppercase tracking-[0.2em] font-black opacity-80">Admin Panel</p>
        </div>

        <nav className="px-3 mt-4 space-y-1 flex-1">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.path, item.exact);
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 px-4 py-3.5 rounded-xl transition-all group ${
                  active
                    ? 'bg-[#5B7FED] text-white shadow-lg shadow-blue-900/20'
                    : 'text-slate-400 hover:text-white hover:bg-[#34495E]'
                }`}
              >
                <Icon size={18} className={active ? "text-white" : "group-hover:text-white"} />
                <span className="text-sm font-bold tracking-tight">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="p-4 mt-auto border-t border-slate-700/50">
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 px-4 py-3.5 rounded-2xl text-white bg-[#EF4444] hover:bg-red-600 transition-all font-black text-[11px] uppercase tracking-widest shadow-lg shadow-red-900/20"
          >
            <LogOut size={16} />
            <span>Logout System</span>
          </button>
        </div>
      </aside>

      <main className="flex-1 ml-64 min-h-screen flex flex-col">
        <header className="sticky top-0 z-40 h-20 px-8 flex items-center justify-between bg-white/80 backdrop-blur-md border-b border-slate-100">
          <div className="flex flex-col text-left">
            <h2 className="text-xl font-black text-slate-900 tracking-tight" style={{ fontFamily: 'Manrope, sans-serif' }}>
              Welcome back, Warden!
            </h2>
            <div className="flex items-center gap-2 mt-0.5">
              <div className="w-2 h-2 rounded-full bg-[#10B981] animate-pulse"></div>
              <span className="text-[10px] font-black text-[#10B981] uppercase tracking-widest">
                System status: Operational
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right mr-2 hidden md:block">
               <p className="text-xs font-black text-slate-900 uppercase">Administrator</p>
               {/* <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">{user?.email || 'admin@hostelease.com'}</p> */}
               <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">{user?.college_email || user?.username || 'Administrator'}</p>
            </div>
            <div className="w-11 h-11 rounded-2xl bg-[#5B7FED] flex items-center justify-center text-white font-black shadow-lg shadow-blue-100 border-2 border-white">
              {user?.username?.charAt(0).toUpperCase() || 'A'}
            </div>
          </div>
        </header>

        <div className="p-8 flex-1">
          <Routes>
            <Route index element={<AdminHome />} />
            <Route path="students" element={<StudentDatabase />} />
            <Route path="live-map" element={<LiveRoomMap />} />
            <Route path="global-lookup" element={<GlobalLookup />} />
            <Route path="profile" element={<AdminProfile />} />
            <Route path="visitors" element={<VisitorManagement />} />
            <Route path="notifications" element={<AdminNotifications />} />
            <Route path="beds" element={<BedManagement />} />
            <Route path="mess-menu" element={<MessMenuManagement />} />
            <Route path="feedback" element={<FeedbackManagement />} />
            <Route path="voting" element={<VotingResults />} />
            <Route path="laundry" element={<LaundryManagement />} />
            <Route path="complaints" element={<ComplaintManagement />} />
            <Route path="gatepass" element={<GatepassApprovals />} />
            <Route path="attendance" element={<AttendanceManagement />} />
            <Route path="yearly-bookings" element={<YearlyBookings />} />
            <Route path="fines" element={<FinesManagement />} />
          </Routes>
        </div>
      </main>
    </div>
  );
}
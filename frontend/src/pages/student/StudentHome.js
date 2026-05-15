import React, { useEffect, useState } from 'react';
import { Card } from '../../components/ui/card';
import { getUser } from '../../utils/auth';
import api from '../../utils/api';
import { User, Home as HomeIcon, BookOpen, Building } from 'lucide-react';
import { Link } from 'react-router-dom';

const normalizeAttendanceStatus = (status = '') => {
  const value = String(status || '').trim().toLowerCase();
  if (value === 'leave_approved') return 'leave-approved';
  if (value === 'leave-approved') return 'leave-approved';
  if (value === 'present') return 'present';
  if (value === 'late') return 'late';
  if (value === 'absent') return 'absent';
  return 'pending';
};

const getLocalDateString = (date = new Date()) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export default function StudentHome() {
  const user = getUser();
  const [attendance, setAttendance] = useState(null);

  useEffect(() => {
    loadTodayAttendance();
  }, []);

  const loadTodayAttendance = async () => {
    try {
      const response = await api.get('/attendance');
      const rows = Array.isArray(response.data) ? response.data : [];
      const today = getLocalDateString();

      const todayAttendance = rows.find(
        (a) => String(a.date || '').slice(0, 10) === today
      );

      setAttendance(
        todayAttendance
          ? { ...todayAttendance, status: normalizeAttendanceStatus(todayAttendance.status) }
          : null
      );
    } catch (error) {
      console.error('Error loading attendance:', error);
      setAttendance(null);
    }
  };

  const quickLinks = [
    { to: '/student/profile', icon: User, label: 'My Profile', color: '#3B82F6' },
    { to: '/student/mess-menu', icon: HomeIcon, label: 'Mess Menu', color: '#F59E0B' },
    { to: '/student/feedback', icon: BookOpen, label: 'Food Feedback', color: '#EC4899' },
    { to: '/student/voting', icon: BookOpen, label: 'Vote Now', color: '#8B5CF6' },
    { to: '/student/complaints', icon: Building, label: 'Raise Complaint', color: '#EF4444' },
    { to: '/student/gatepass', icon: Building, label: 'Apply Gatepass', color: '#F97316' },
    { to: '/student/laundry', icon: Building, label: 'Laundry', color: '#10B981' },
    { to: '/student/attendance', icon: Building, label: 'Attendance', color: '#6366F1' },
  ];

  return (
    <div className="space-y-8 fade-in" data-testid="student-home">
      <div>
        <h1 className="text-3xl font-bold text-slate-900" style={{ fontFamily: 'Manrope, sans-serif' }}>
          Student Dashboard
        </h1>
        <p className="text-slate-500 mt-1">Welcome back, {user?.student_name || user?.username}!</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="p-6 bg-white rounded-xl shadow-sm hover-lift" data-testid="assigned-room-card">
          <p className="text-sm text-slate-500 uppercase tracking-wider mb-2">Assigned Room</p>
          <p className="text-3xl font-bold text-slate-900">{user?.room_number}</p>
        </Card>

        <Card className="p-6 bg-white rounded-xl shadow-sm hover-lift" data-testid="course-branch-card">
          <p className="text-sm text-slate-500 uppercase tracking-wider mb-2">Course / Branch</p>
          <p className="text-3xl font-bold text-slate-900">{user?.course}</p>
        </Card>

        <Card className="p-6 bg-white rounded-xl shadow-sm hover-lift" data-testid="hostel-name-card">
          <p className="text-sm text-slate-500 uppercase tracking-wider mb-2">Hostel</p>
          <p className="text-3xl font-bold text-slate-900">{user?.hostel_name}</p>
        </Card>
      </div>

      <div>
        <h2 className="text-xl font-semibold text-slate-900 mb-4" style={{ fontFamily: 'Manrope, sans-serif' }}>
          Quick Access
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {quickLinks.map((link) => {
            const Icon = link.icon;
            return (
              <Link
                key={link.to}
                to={link.to}
                className="p-6 bg-white rounded-xl shadow-sm hover-lift transition-all border border-slate-100"
                data-testid={`quick-link-${link.label.toLowerCase().replace(/\s+/g, '-')}`}
              >
                <div
                  className="w-12 h-12 rounded-lg flex items-center justify-center mb-3"
                  style={{ backgroundColor: `${link.color}20` }}
                >
                  <Icon size={24} style={{ color: link.color }} />
                </div>
                <p className="text-sm font-medium text-slate-900">{link.label}</p>
              </Link>
            );
          })}
        </div>
      </div>

      <Card className="p-6 bg-gradient-to-br from-[#5B7FED] to-[#4A6FD6] text-white rounded-xl shadow-lg" data-testid="today-status-card">
        <h3 className="text-lg font-semibold mb-4">Today's Status</h3>
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <span>Attendance:</span>
            <span className="font-semibold">
              {attendance ? attendance.status.toUpperCase() : 'Not Marked'}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span>Date:</span>
            <span className="font-semibold">{new Date().toLocaleDateString()}</span>
          </div>
        </div>
      </Card>
    </div>
  );
}
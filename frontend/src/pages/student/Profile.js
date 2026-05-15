import React, { useState, useEffect } from 'react';
import { Card } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { getUser } from '../../utils/auth';
import api from '../../utils/api';
import { toast } from 'sonner';
import {
  User,
  Mail,
  Phone,
  Home,
  Users,
  Utensils,
  ShieldCheck,
  MessageSquare,
  Sun,
  CheckCircle2,
  Trophy,
  Loader2,
  Bed,
  Building2,
  CreditCard,
  Sparkles,
  Moon,
  BookOpen,
  RefreshCcw
} from 'lucide-react';

const ICON_MAP = {
  Utensils: Utensils,
  ShieldCheck: ShieldCheck,
  MessageSquare: MessageSquare,
  Sun: Sun,
  CheckCircle2: CheckCircle2
};

export default function Profile() {
  const localUser = getUser();

  const [profileUser, setProfileUser] = useState(localUser || {});
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [loading, setLoading] = useState(false);

  const [achievements, setAchievements] = useState(null);
  const [achievementsLoading, setAchievementsLoading] = useState(true);

  const [profileLoading, setProfileLoading] = useState(true);
  const [roommateProfile, setRoommateProfile] = useState(null);
  const [bookingStatus, setBookingStatus] = useState(null);

  useEffect(() => {
    if (localUser?.is_default_password) {
      setShowPasswordChange(true);
      toast.info('Please update your password to continue using the dashboard.');
    }
    loadProfileData();
    loadAchievements();
  }, []);

  const loadProfileData = async () => {
    try {
      setProfileLoading(true);

      const [profileRes, bookingRes, roommateRes] = await Promise.allSettled([
        api.get('/student/profile-live'),
        api.get('/student/yearly-booking-status'),
        api.get('/student/roommate-profile')
      ]);

      if (profileRes.status === 'fulfilled') {
        const liveUser = profileRes.value.data || {};
        setProfileUser((prev) => ({ ...prev, ...liveUser }));

        const existingLocal = JSON.parse(localStorage.getItem('user') || '{}');
        const mergedUser = { ...existingLocal, ...liveUser };
        localStorage.setItem('user', JSON.stringify(mergedUser));
      }

      if (bookingRes.status === 'fulfilled') {
        setBookingStatus(bookingRes.value.data || null);
      }

      if (roommateRes.status === 'fulfilled') {
        setRoommateProfile(roommateRes.value.data || null);
      }
    } catch (error) {
      console.error('Failed to load profile data:', error);
    } finally {
      setProfileLoading(false);
    }
  };

  const loadAchievements = async () => {
    try {
      const response = await api.get('/user/achievements');
      setAchievements(response.data);
    } catch (error) {
      console.error('Failed to load achievements:', error);
    } finally {
      setAchievementsLoading(false);
    }
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post('/auth/change-password', {
        old_password: oldPassword,
        new_password: newPassword,
        totp_code: totpCode
      });

      toast.success('Password changed successfully!');

      const updatedUser = { ...profileUser, is_default_password: false, two_factor_enabled: profileUser?.two_factor_enabled };
      localStorage.setItem('user', JSON.stringify(updatedUser));

      setShowPasswordChange(false);
      setOldPassword('');
      setNewPassword('');
      setTotpCode('');

      await loadProfileData();
      window.location.reload();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to change password');
    } finally {
      setLoading(false);
    }
  };

  const user = profileUser || {};
  const booking = bookingStatus?.booking || null;
  const payment = bookingStatus?.payment || null;

  return (
    <div className="space-y-6 fade-in" data-testid="profile-page">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-[#5B7FED] flex items-center justify-center text-white text-2xl font-bold">
            {user?.student_name?.charAt(0).toUpperCase() || user?.username?.charAt(0).toUpperCase()}
          </div>
          <div>
            <h1 className="text-3xl font-bold text-slate-900" style={{ fontFamily: 'Manrope, sans-serif' }}>
              My Profile
            </h1>
            <p className="text-slate-500 text-sm mt-1">Comprehensive student and residency information</p>
          </div>
        </div>

        <Button
          variant="outline"
          onClick={loadProfileData}
          disabled={profileLoading}
          className="rounded-xl border-slate-200 text-slate-600"
        >
          <RefreshCcw size={15} className={`mr-2 ${profileLoading ? 'animate-spin' : ''}`} />
          Refresh Profile
        </Button>
      </div>

      {/* Personal & Academic Details */}
      <Card className="p-6 bg-white rounded-xl shadow-sm" data-testid="personal-academic-details">
        <h2 className="text-xl font-semibold mb-6 flex items-center gap-2">
          <User size={24} className="text-[#5B7FED]" />
          Personal & Academic Details
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <Label className="text-sm text-slate-600">Enrollment No</Label>
            <p className="text-lg font-medium text-slate-900 mt-1">{user?.enrollment_number || 'N/A'}</p>
          </div>

          <div>
            <Label className="text-sm text-slate-600">Course & Year</Label>
            <p className="text-lg font-medium text-slate-900 mt-1">
              {user?.course || 'N/A'} {user?.year ? `- Year ${user.year}` : ''}
            </p>
          </div>

          <div>
            <Label className="text-sm text-slate-600">College Mail</Label>
            <p className="text-lg font-medium text-slate-900 mt-1">{user?.college_email || 'N/A'}</p>
          </div>

          <div>
            <Label className="text-sm text-slate-600">Personal Mail</Label>
            <p className="text-lg font-medium text-slate-900 mt-1">{user?.personal_email || 'N/A'}</p>
          </div>

          <div>
            <Label className="text-sm text-slate-600">Contact No</Label>
            <p className="text-lg font-medium text-slate-900 mt-1">{user?.phone || 'N/A'}</p>
          </div>

          <div>
            <Label className="text-sm text-slate-600">Gender</Label>
            <p className="text-lg font-medium text-slate-900 mt-1 capitalize">{user?.gender || 'N/A'}</p>
          </div>
        </div>
      </Card>

      {/* Family Contact Information */}
      <Card className="p-6 bg-white rounded-xl shadow-sm" data-testid="family-contact-info">
        <h2 className="text-xl font-semibold mb-6 flex items-center gap-2">
          <Users size={24} className="text-[#5B7FED]" />
          Family Contact Information
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <Label className="text-sm text-slate-600">Father's Name</Label>
            <p className="text-lg font-medium text-slate-900 mt-1">{user?.father_name || 'N/A'}</p>
          </div>

          <div>
            <Label className="text-sm text-slate-600">Father's Contact</Label>
            <p className="text-lg font-medium text-slate-900 mt-1">{user?.father_contact || user?.parent_phone || 'N/A'}</p>
          </div>

          <div>
            <Label className="text-sm text-slate-600">Mother's Name</Label>
            <p className="text-lg font-medium text-slate-900 mt-1">{user?.mother_name || 'N/A'}</p>
          </div>

          <div>
            <Label className="text-sm text-slate-600">Mother's Contact</Label>
            <p className="text-lg font-medium text-slate-900 mt-1">{user?.mother_contact || 'N/A'}</p>
          </div>
        </div>
      </Card>

      {/* Room & Residency Details */}
      <Card className="p-6 bg-white rounded-xl shadow-sm" data-testid="room-residency-details">
        <h2 className="text-xl font-semibold mb-6 flex items-center gap-2">
          <Home size={24} className="text-[#5B7FED]" />
          Room & Residency Details
        </h2>

        {profileLoading ? (
          <div className="py-10 text-center text-slate-400">
            <Loader2 className="animate-spin mx-auto mb-3" size={26} />
            Loading latest room assignment...
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <Label className="text-sm text-slate-600">Hostel Bhawan</Label>
              <div className="mt-2 p-3 bg-slate-50 rounded-lg">
                <p className="text-lg font-medium text-slate-900">{user?.hostel_name || 'Not Assigned Yet'}</p>
              </div>
            </div>

            <div>
              <Label className="text-sm text-slate-600">Room & Bed</Label>
              <div className="mt-2 p-3 bg-slate-50 rounded-lg">
                <p className="text-lg font-medium text-slate-900">
                  {user?.room_number ? `Room ${user.room_number}` : 'Room Pending'} {user?.bed_number ? `- Bed ${user.bed_number}` : ''}
                </p>
              </div>
            </div>

            <div>
              <Label className="text-sm text-slate-600">Block</Label>
              <div className="mt-2 p-3 bg-slate-50 rounded-lg">
                <p className="text-lg font-medium text-slate-900">
                  {user?.block ? `Block ${user.block}` : 'Pending'}
                </p>
              </div>
            </div>

            <div>
              <Label className="text-sm text-slate-600">Floor</Label>
              <div className="mt-2 p-3 bg-slate-50 rounded-lg">
                <p className="text-lg font-medium text-slate-900">
                  {user?.floor ? `Floor ${user.floor}` : 'Pending'}
                </p>
              </div>
            </div>
          </div>
        )}
      </Card>

      {/* Yearly Booking & Payment Status */}
      <Card className="p-6 bg-white rounded-xl shadow-sm border border-slate-100" data-testid="yearly-booking-status">
        <h2 className="text-xl font-semibold mb-6 flex items-center gap-2">
          <CreditCard size={24} className="text-[#5B7FED]" />
          Yearly Booking & Payment Status
        </h2>

        {!booking ? (
          <div className="rounded-xl bg-slate-50 p-4 border border-slate-100">
            <p className="text-sm text-slate-600">No active yearly hostel booking found yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="rounded-xl bg-slate-50 p-4 border border-slate-100">
              <div className="flex items-center gap-2 mb-3">
                <Building2 size={18} className="text-[#5B7FED]" />
                <p className="font-semibold text-slate-900">Booking Information</p>
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-slate-500">Hostel</span><span className="font-bold text-slate-900">{booking.hostel_name || 'N/A'}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Block</span><span className="font-bold text-slate-900">{booking.block || 'N/A'}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Booking Status</span><span className="font-bold text-slate-900">{booking.status || 'N/A'}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">AC Type</span><span className="font-bold text-slate-900 capitalize">{booking?.preferences?.acType || 'N/A'}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Washroom</span><span className="font-bold text-slate-900 capitalize">{booking?.preferences?.washroom || 'N/A'}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Sharing</span><span className="font-bold text-slate-900">{booking?.preferences?.roomType || 'N/A'}</span></div>
              </div>
            </div>

            <div className="rounded-xl bg-slate-50 p-4 border border-slate-100">
              <div className="flex items-center gap-2 mb-3">
                <Bed size={18} className="text-emerald-600" />
                <p className="font-semibold text-slate-900">Payment / Assignment</p>
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-slate-500">Payment Status</span><span className="font-bold text-slate-900">{payment?.status || 'Pending'}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Amount</span><span className="font-bold text-slate-900">₹{payment?.amount || 0}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Method</span><span className="font-bold text-slate-900">{payment?.payment_method || payment?.payment_mode || 'N/A'}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Transaction Ref</span><span className="font-bold text-slate-900">{payment?.transaction_ref || 'N/A'}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Assigned Room</span><span className="font-bold text-slate-900">{booking?.assigned_room_number || 'Pending'}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Assigned Bed</span><span className="font-bold text-slate-900">{booking?.assigned_bed_number || 'Pending'}</span></div>
              </div>
            </div>
          </div>
        )}
      </Card>

      {/* Roommate Personality / Compatibility Card */}
      <Card className="p-6 bg-gradient-to-br from-pink-50 to-rose-50 border border-pink-100 shadow-sm" data-testid="roommate-compatibility-profile">
        <h2 className="text-xl font-semibold mb-6 flex items-center gap-2 text-slate-900">
          <Sparkles size={24} className="text-pink-600" />
          My Roommate Compatibility Profile
        </h2>

        {!roommateProfile ? (
          <div className="rounded-xl bg-white/70 p-4 border border-pink-100">
            <p className="text-sm text-slate-600">
              Your personality / roommate preference form has not been found yet. It should be filled during hostel booking so admin can match similar students together.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-xl bg-white/80 p-4 border border-pink-100">
              <div className="flex items-center gap-2 mb-2">
                <Moon size={16} className="text-pink-600" />
                <p className="text-sm font-semibold text-slate-900">Sleep Schedule</p>
              </div>
              <p className="text-slate-700 text-sm font-medium">{roommateProfile.sleepSchedule || 'Not specified'}</p>
            </div>

            <div className="rounded-xl bg-white/80 p-4 border border-pink-100">
              <div className="flex items-center gap-2 mb-2">
                <BookOpen size={16} className="text-pink-600" />
                <p className="text-sm font-semibold text-slate-900">Study Habits</p>
              </div>
              <p className="text-slate-700 text-sm font-medium">{roommateProfile.studyHabits || 'Not specified'}</p>
            </div>

            <div className="rounded-xl bg-white/80 p-4 border border-pink-100">
              <div className="flex items-center gap-2 mb-2">
                <Utensils size={16} className="text-pink-600" />
                <p className="text-sm font-semibold text-slate-900">Likes</p>
              </div>
              <p className="text-slate-700 text-sm font-medium">
                {Array.isArray(roommateProfile.likes) && roommateProfile.likes.length > 0
                  ? roommateProfile.likes.join(', ')
                  : 'Not specified'}
              </p>
            </div>

            <div className="rounded-xl bg-white/80 p-4 border border-pink-100">
              <div className="flex items-center gap-2 mb-2">
                <MessageSquare size={16} className="text-pink-600" />
                <p className="text-sm font-semibold text-slate-900">Dislikes</p>
              </div>
              <p className="text-slate-700 text-sm font-medium">
                {Array.isArray(roommateProfile.dislikes) && roommateProfile.dislikes.length > 0
                  ? roommateProfile.dislikes.join(', ')
                  : 'Not specified'}
              </p>
            </div>

            <div className="rounded-xl bg-white/80 p-4 border border-pink-100 md:col-span-2">
              <div className="flex items-center gap-2 mb-2">
                <Users size={16} className="text-pink-600" />
                <p className="text-sm font-semibold text-slate-900">Compatibility Matching Preference</p>
              </div>
              <p className="text-slate-700 text-sm font-medium">
                {roommateProfile.isLooking ? 'Yes, admin may use my traits to match compatible roommates' : 'No compatibility matching selected'}
              </p>
            </div>
          </div>
        )}
      </Card>

      {/* Gamified Achievements Board */}
      <Card className="p-6 bg-gradient-to-br from-indigo-50 to-blue-50 border-blue-200 border shadow-sm" data-testid="achievements-board">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold flex items-center gap-2 text-indigo-900">
            <Trophy size={24} className="text-[#5B7FED]" />
            Resident Achievements
          </h2>
          {achievements && (
            <div className="text-xs font-bold text-indigo-700 bg-indigo-100 px-3 py-1 rounded-full uppercase tracking-widest">
              Unlocked: {achievements.earned} / {achievements.total_possible}
            </div>
          )}
        </div>

        {achievementsLoading ? (
          <div className="flex items-center justify-center py-6 text-indigo-400">
            <Loader2 className="animate-spin" size={24} />
          </div>
        ) : !achievements ? (
          <p className="text-sm text-indigo-400 font-medium">Unable to load achievements.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {achievements.badges.map((badge, idx) => {
              const BadgeIcon = ICON_MAP[badge.icon] || CheckCircle2;
              return (
                <div key={idx} className="p-4 bg-white rounded-xl shadow-sm border border-slate-100 flex items-start gap-4 transition-transform hover:-translate-y-1">
                  <div className={`p-3 rounded-full ${badge.bg} ${badge.color} shrink-0`}>
                    <BadgeIcon size={24} />
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-800">{badge.name}</h4>
                    <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{badge.description}</p>
                  </div>
                </div>
              );
            })}

            {Array.from({ length: Math.max(0, 5 - achievements.earned) }).map((_, idx) => (
              <div key={`locked-${idx}`} className="p-4 bg-slate-50/50 rounded-xl border border-slate-100 border-dashed flex items-start gap-4 opacity-70 grayscale">
                <div className="p-3 rounded-full bg-slate-100 text-slate-400 shrink-0">
                  <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path>
                  </svg>
                </div>
                <div>
                  <h4 className="font-bold text-slate-400">Locked Badge</h4>
                  <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">Keep engaging with the hostel platform to unlock.</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Security Settings */}
      <Card className="p-6 bg-white rounded-xl shadow-sm" data-testid="security-settings">
        <h2 className="text-xl font-semibold mb-6 flex items-center gap-2">
          <svg className="w-6 h-6 text-[#5B7FED]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          Security Settings
        </h2>

        {!showPasswordChange ? (
          <div>
            <p className="text-slate-600 mb-4">Update your password to keep your account secure</p>
            <Button
              onClick={() => setShowPasswordChange(true)}
              className="bg-[#5B7FED] hover:bg-[#4A6FD6] text-white"
              data-testid="show-password-change-btn"
            >
              Update Credentials
            </Button>
          </div>
        ) : (
          <form onSubmit={handlePasswordChange} className="space-y-4">
            <div>
              <Label htmlFor="old-password" className="text-slate-700">Current Password</Label>
              <Input
                id="old-password"
                type="password"
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                className="mt-1"
                required
                data-testid="old-password-input"
              />
            </div>

            <div>
              <Label htmlFor="new-password" className="text-slate-700">New Password</Label>
              <Input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="mt-1"
                required
                data-testid="new-password-input"
              />
            </div>

            {user?.two_factor_enabled && (
              <div>
                <Label htmlFor="totp-code" className="text-slate-700">Authenticator Code (2FA)</Label>
                <Input
                  id="totp-code"
                  type="text"
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  className="mt-1 tracker-widest text-center"
                  required
                />
              </div>
            )}

            <div className="flex gap-2">
              <Button
                type="submit"
                disabled={loading}
                className="bg-[#5B7FED] hover:bg-[#4A6FD6] text-white"
                data-testid="submit-password-change-btn"
              >
                {loading ? 'Updating...' : 'Update Credentials'}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowPasswordChange(false)}
                data-testid="cancel-password-change-btn"
              >
                Cancel
              </Button>
            </div>
          </form>
        )}
      </Card>
    </div>
  );
}
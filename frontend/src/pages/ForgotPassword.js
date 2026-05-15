import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { toast } from 'sonner';
import api from '../utils/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card } from '../components/ui/card';
import {
  Mail,
  Lock,
  ArrowLeft,
  Shield,
  Key,
  Smartphone,
  Eye,
  EyeOff
} from 'lucide-react';

export default function ForgotPassword() {
  const navigate = useNavigate();

  const [resetMode, setResetMode] = useState('otp'); // otp | authenticator
  const [step, setStep] = useState(1);
  const [otpMethod, setOtpMethod] = useState('email');

  const [contact, setContact] = useState('');
  const [loginId, setLoginId] = useState('');
  const [otp, setOtp] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [devOtp, setDevOtp] = useState('');

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [loading, setLoading] = useState(false);

  const validatePassword = (password) => {
    if (!password || password.length < 8) {
      return 'Password must be at least 8 characters long';
    }
    if (!/^[A-Z]/.test(password)) {
      return 'Password must start with a capital letter';
    }
    if (!/[a-z]/.test(password)) {
      return 'Password must contain at least one lowercase letter';
    }
    if (!/[A-Z]/.test(password)) {
      return 'Password must contain at least one uppercase letter';
    }
    if (!/[0-9]/.test(password)) {
      return 'Password must contain at least one digit';
    }
    if (!/[!@#$%^&*()_\-+=\[{\]};:'",.<>?/\\|`~]/.test(password)) {
      return 'Password must contain at least one special character';
    }
    return '';
  };

  const resetUiState = () => {
    setStep(1);
    setOtp('');
    setTotpCode('');
    setNewPassword('');
    setConfirmPassword('');
    setDevOtp('');
    setShowNewPassword(false);
    setShowConfirmPassword(false);
    setLoading(false);
  };

  const handleSendOTP = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const payload = {
        contact: contact.trim(),
        type: otpMethod === 'sms' ? 'phone' : 'email'
      };

      const response = await api.post('/auth/send-otp', payload);
      setDevOtp(response?.data?.dev_otp || '');

      toast.success(`OTP sent to your ${otpMethod}`);
      setStep(2);
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Failed to send OTP');
    } finally {
      setLoading(false);
    }
  };

  const handleResetWithOTP = async (e) => {
    e.preventDefault();

    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    const passwordError = validatePassword(newPassword);
    if (passwordError) {
      toast.error(passwordError);
      return;
    }

    setLoading(true);

    try {
      await api.post('/auth/reset-password', {
        contact: contact.trim(),
        otp: otp.trim(),
        new_password: newPassword,
        type: otpMethod === 'sms' ? 'phone' : 'email'
      });

      toast.success('Password reset successful');
      setTimeout(() => navigate('/login'), 1200);
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Failed to reset password');
    } finally {
      setLoading(false);
    }
  };

  const handleResetWithAuthenticator = async (e) => {
    e.preventDefault();

    if (!loginId.trim()) {
      toast.error('Enter enrollment number, username, or college email');
      return;
    }

    if (totpCode.trim().length !== 6) {
      toast.error('Enter a valid 6-digit authenticator code');
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    const passwordError = validatePassword(newPassword);
    if (passwordError) {
      toast.error(passwordError);
      return;
    }

    setLoading(true);

    try {
      await api.post('/auth/reset-password-2fa', {
        login_id: loginId.trim(),
        totp_code: totpCode.trim(),
        new_password: newPassword
      });

      toast.success('Password reset successful using authenticator');
      setTimeout(() => navigate('/login'), 1200);
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Failed to reset using authenticator');
    } finally {
      setLoading(false);
    }
  };

  const passwordRules = (
    <div className="mt-2 text-xs text-slate-500 leading-5">
      <p className="font-medium text-slate-600 mb-1">Password rules:</p>
      <ul className="list-disc pl-5 space-y-1">
        <li>Minimum 8 characters</li>
        <li>First letter must be capital</li>
        <li>At least one uppercase letter</li>
        <li>At least one lowercase letter</li>
        <li>At least one number</li>
        <li>At least one special symbol</li>
      </ul>
    </div>
  );

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{
        background: 'linear-gradient(135deg, #F8FAFC 0%, #E0E7FF 100%)'
      }}
    >
      <Card className="w-full max-w-md p-8 bg-white/95 backdrop-blur-md shadow-xl border-0">
        <Link
          to="/login"
          className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-[#5B7FED] mb-6"
        >
          <ArrowLeft size={16} />
          Back to Login
        </Link>

        <div className="text-center mb-8">
          <div className="mx-auto w-16 h-16 bg-[#5B7FED]/10 rounded-full flex items-center justify-center mb-4">
            <Shield className="text-[#5B7FED]" size={32} />
          </div>
          <h1 className="text-3xl font-bold text-slate-800">Reset Password</h1>
          <p className="text-slate-500 text-sm mt-2">
            Reset using OTP or authenticator
          </p>
        </div>

        <div className="flex gap-2 mb-6">
          <button
            type="button"
            onClick={() => {
              setResetMode('otp');
              resetUiState();
            }}
            className={`flex-1 py-2 px-4 rounded-lg font-medium transition-all flex items-center justify-center gap-2 ${
              resetMode === 'otp'
                ? 'bg-[#5B7FED] text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <Mail size={16} />
            OTP
          </button>

          <button
            type="button"
            onClick={() => {
              setResetMode('authenticator');
              resetUiState();
            }}
            className={`flex-1 py-2 px-4 rounded-lg font-medium transition-all flex items-center justify-center gap-2 ${
              resetMode === 'authenticator'
                ? 'bg-[#5B7FED] text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <Key size={16} />
            Authenticator
          </button>
        </div>

        {resetMode === 'otp' ? (
          <>
            {step === 1 ? (
              <form onSubmit={handleSendOTP} className="space-y-4">
                <div className="flex gap-2 mb-4">
                  <button
                    type="button"
                    onClick={() => setOtpMethod('email')}
                    className={`flex-1 py-2 px-4 rounded-lg font-medium transition-all ${
                      otpMethod === 'email'
                        ? 'bg-[#5B7FED] text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    Email
                  </button>
                  <button
                    type="button"
                    onClick={() => setOtpMethod('sms')}
                    className={`flex-1 py-2 px-4 rounded-lg font-medium transition-all ${
                      otpMethod === 'sms'
                        ? 'bg-[#5B7FED] text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    SMS
                  </button>
                </div>

                <div>
                  <Label htmlFor="contact" className="text-slate-700 text-sm font-medium">
                    {otpMethod === 'email' ? 'College Email' : 'Phone Number'}
                  </Label>
                  <div className="relative mt-1">
                    {otpMethod === 'email' ? (
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    ) : (
                      <Smartphone className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    )}
                    <Input
                      id="contact"
                      type={otpMethod === 'email' ? 'email' : 'tel'}
                      placeholder={otpMethod === 'email' ? 'your.email@hostel.com' : '+91XXXXXXXXXX'}
                      value={contact}
                      onChange={(e) => setContact(e.target.value)}
                      className="pl-10 border-slate-200 focus:border-[#5B7FED] focus:ring-[#5B7FED]"
                      required
                    />
                  </div>
                </div>

                <Button
                  type="submit"
                  className="w-full py-3 bg-[#5B7FED] hover:bg-[#4A6FD6] text-white font-medium"
                  disabled={loading}
                >
                  {loading ? 'Sending...' : 'Send OTP'}
                </Button>
              </form>
            ) : (
              <form onSubmit={handleResetWithOTP} className="space-y-4">
                {devOtp && (
                  <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 font-semibold">
                    Testing OTP: {devOtp}
                  </div>
                )}

                <div>
                  <Label htmlFor="otp" className="text-slate-700 text-sm font-medium">
                    Enter OTP
                  </Label>
                  <Input
                    id="otp"
                    type="text"
                    placeholder="6-digit OTP"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    className="border-slate-200 focus:border-[#5B7FED] focus:ring-[#5B7FED]"
                    maxLength={6}
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="newPassword" className="text-slate-700 text-sm font-medium">
                    New Password
                  </Label>
                  <div className="relative mt-1">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <Input
                      id="newPassword"
                      type={showNewPassword ? 'text' : 'password'}
                      placeholder="Enter new password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="pl-10 pr-10 border-slate-200 focus:border-[#5B7FED] focus:ring-[#5B7FED]"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      {showNewPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>

                <div>
                  <Label htmlFor="confirmPassword" className="text-slate-700 text-sm font-medium">
                    Confirm Password
                  </Label>
                  <div className="relative mt-1">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <Input
                      id="confirmPassword"
                      type={showConfirmPassword ? 'text' : 'password'}
                      placeholder="Confirm new password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="pl-10 pr-10 border-slate-200 focus:border-[#5B7FED] focus:ring-[#5B7FED]"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>

                {passwordRules}

                <Button
                  type="submit"
                  className="w-full py-3 bg-[#5B7FED] hover:bg-[#4A6FD6] text-white font-medium"
                  disabled={loading}
                >
                  {loading ? 'Resetting...' : 'Reset Password'}
                </Button>

                <button
                  type="button"
                  onClick={() => {
                    setStep(1);
                    setOtp('');
                    setDevOtp('');
                  }}
                  className="w-full text-sm text-slate-600 hover:text-[#5B7FED]"
                >
                  Resend OTP
                </button>
              </form>
            )}
          </>
        ) : (
          <form onSubmit={handleResetWithAuthenticator} className="space-y-4">
            <div>
              <Label htmlFor="loginId" className="text-slate-700 text-sm font-medium">
                Enrollment Number / Username / College Email
              </Label>
              <div className="relative mt-1">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <Input
                  id="loginId"
                  type="text"
                  placeholder="Enter enrollment, username, or email"
                  value={loginId}
                  onChange={(e) => setLoginId(e.target.value)}
                  className="pl-10 border-slate-200 focus:border-[#5B7FED] focus:ring-[#5B7FED]"
                  required
                />
              </div>
            </div>

            <div>
              <Label htmlFor="totpCode" className="text-slate-700 text-sm font-medium">
                Authenticator Code
              </Label>
              <Input
                id="totpCode"
                type="text"
                placeholder="6-digit authenticator code"
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="border-slate-200 focus:border-[#5B7FED] focus:ring-[#5B7FED]"
                maxLength={6}
                required
              />
            </div>

            <div>
              <Label htmlFor="authNewPassword" className="text-slate-700 text-sm font-medium">
                New Password
              </Label>
              <div className="relative mt-1">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <Input
                  id="authNewPassword"
                  type={showNewPassword ? 'text' : 'password'}
                  placeholder="Enter new password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="pl-10 pr-10 border-slate-200 focus:border-[#5B7FED] focus:ring-[#5B7FED]"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showNewPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <div>
              <Label htmlFor="authConfirmPassword" className="text-slate-700 text-sm font-medium">
                Confirm Password
              </Label>
              <div className="relative mt-1">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <Input
                  id="authConfirmPassword"
                  type={showConfirmPassword ? 'text' : 'password'}
                  placeholder="Confirm new password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="pl-10 pr-10 border-slate-200 focus:border-[#5B7FED] focus:ring-[#5B7FED]"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {passwordRules}

            <p className="text-xs text-slate-500">
              Use this only if authenticator is already set up on your account.
            </p>

            <Button
              type="submit"
              className="w-full py-3 bg-[#5B7FED] hover:bg-[#4A6FD6] text-white font-medium"
              disabled={loading}
            >
              {loading ? 'Resetting...' : 'Reset with Authenticator'}
            </Button>
          </form>
        )}
      </Card>
    </div>
  );
}
import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  ShieldCheck,
  Mail,
  Key,
  ArrowRight,
  CheckCircle,
  Lock,
  Eye,
  EyeOff
} from 'lucide-react';
import { setAuth } from '../../utils/auth';

const FirstLoginReset = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const RAW_API_URL = process.env.REACT_APP_BACKEND_URL || 'http://127.0.0.1:8000';
  const API_URL = `${RAW_API_URL}/api`;

  const [step, setStep] = useState(1);
  const [setupOnly2FA, setSetupOnly2FA] = useState(false);

  const [enrollment, setEnrollment] = useState('');
  const [email, setEmail] = useState('');

  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [testingOtp, setTestingOtp] = useState('');

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);

  const [totpSecret, setTotpSecret] = useState('');
  const [totpUri, setTotpUri] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [setupError, setSetupError] = useState('');
  const [globalError, setGlobalError] = useState('');

  useEffect(() => {
    if (location.state?.user) {
      const user = location.state.user;
      setEnrollment(user.enrollment_number || '');
      setEmail(user.email || user.college_email || '');

      if (user.role === 'admin') {
        setSetupOnly2FA(true);
        setStep(2);
      }
    } else {
      navigate('/login', { replace: true });
    }
  }, [location, navigate]);

  useEffect(() => {
    if (setupOnly2FA && enrollment) {
      generate2FA();
    }
  }, [setupOnly2FA, enrollment]);

  const validatePassword = (password) => {
    if (!password || password.length < 8) return 'Password must be at least 8 characters long';
    if (!/^[A-Z]/.test(password)) return 'Password must start with a capital letter';
    if (!/[a-z]/.test(password)) return 'Password must contain at least one lowercase letter';
    if (!/[A-Z]/.test(password)) return 'Password must contain at least one uppercase letter';
    if (!/[0-9]/.test(password)) return 'Password must contain at least one digit';
    if (!/[!@#$%^&*()_\-+=\[{\]};:'",.<>?/\\|`~]/.test(password)) {
      return 'Password must contain at least one special character';
    }
    return '';
  };

  const handleSendOTP = async () => {
    try {
      setGlobalError('');
      setTestingOtp('');

      const res = await fetch(`${API_URL}/auth/first-login/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enrollment_number: enrollment })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.detail || 'Failed to send OTP');

      setOtpSent(true);
      setTestingOtp(data?.dev_otp || '');
      setEmail(data?.email || email);
    } catch (err) {
      setGlobalError(err.message || 'Failed to send OTP');
    }
  };

  const verifyAndChangePassword = async () => {
    setPasswordError('');
    setGlobalError('');

    if (newPassword !== confirmPassword) {
      setPasswordError('Passwords do not match');
      return;
    }

    const validationError = validatePassword(newPassword);
    if (validationError) {
      setPasswordError(validationError);
      return;
    }

    try {
      setIsVerifying(true);

      const res = await fetch(`${API_URL}/auth/first-login/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enrollment_number: enrollment,
          otp_code: otpCode.trim(),
          new_password: newPassword
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.detail || 'Verification failed');

      setStep(2);
      await generate2FA();
    } catch (err) {
      setGlobalError(err.message || 'Verification failed');
    } finally {
      setIsVerifying(false);
    }
  };

  const generate2FA = async () => {
    try {
      setSetupError('');

      const res = await fetch(`${API_URL}/auth/2fa/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enrollment_number: enrollment })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.detail || 'Failed to generate 2FA');

      setTotpSecret(data.secret);
      setTotpUri(
        `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(data.uri)}`
      );
    } catch (err) {
      setSetupError(err.message || 'Failed to generate authenticator setup');
    }
  };

  const finalize2FASetup = async () => {
    try {
      setSetupError('');

      const res = await fetch(`${API_URL}/auth/2fa/verify-setup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enrollment_number: enrollment,
          totp_code: totpCode.trim()
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.detail || '2FA verification failed');

      setAuth(data.access_token, data.user);

      if (data.user.role === 'admin') {
        navigate('/admin', { replace: true });
      } else {
        navigate('/student', { replace: true });
      }
    } catch (err) {
      setSetupError(err.message || 'Failed to verify authenticator code');
    }
  };

  const passwordRules = (
    <div className="text-xs text-gray-400 mt-2 leading-5">
      <p className="font-medium text-gray-300 mb-1">Password rules:</p>
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
    <div className="min-h-screen bg-gray-900 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center">
          <ShieldCheck className="w-12 h-12 text-teal-400" />
        </div>
        <h2 className="mt-6 text-center text-3xl font-extrabold text-white">
          Secure Your Account
        </h2>
        <p className="mt-2 text-center text-sm text-gray-400">
          Complete the required security setup to continue.
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-gray-800 py-8 px-4 shadow sm:rounded-lg sm:px-10 border border-gray-700">
          {!setupOnly2FA && (
            <div className="flex justify-center mb-8 border-b border-gray-700 pb-4">
              <div
                className={`text-sm font-medium ${
                  step === 1 ? 'text-teal-400' : 'text-gray-500'
                } flex items-center`}
              >
                <Mail className="w-4 h-4 mr-1" /> verification
              </div>
              <ArrowRight className="w-4 h-4 text-gray-600 mx-4 mt-0.5" />
              <div
                className={`text-sm font-medium ${
                  step === 2 ? 'text-teal-400' : 'text-gray-500'
                } flex items-center`}
              >
                <Key className="w-4 h-4 mr-1" /> 2FA Setup
              </div>
            </div>
          )}

          {globalError && (
            <div className="bg-red-900/50 border border-red-500 p-3 rounded-md mb-6 text-sm text-red-200">
              {globalError}
            </div>
          )}

          {!setupOnly2FA && step === 1 && (
            <div className="space-y-6">
              {!otpSent ? (
                <div className="text-center">
                  <p className="text-gray-300 text-sm mb-6">
                    We need to verify your registered college email address ({email}) before
                    proceeding.
                  </p>
                  <button
                    onClick={handleSendOTP}
                    className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-gray-900 bg-teal-400 hover:bg-teal-500"
                  >
                    Send Verification Code
                  </button>
                </div>
              ) : (
                <div className="space-y-5">
                  {testingOtp && (
                    <div className="bg-yellow-900/30 border border-yellow-500 text-yellow-200 p-3 rounded-md text-sm font-semibold">
                      Testing OTP: {testingOtp}
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-medium text-gray-300">
                      Email OTP Code
                    </label>
                    <input
                      type="text"
                      value={otpCode}
                      onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="123456"
                      className="mt-1 appearance-none block w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-700 text-white text-center text-xl tracking-widest"
                    />
                  </div>

                  <div className="pt-2 border-t border-gray-700">
                    <label className="block text-sm font-medium text-gray-300 mb-1">
                      New Secure Password
                    </label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                      <input
                        type={showNewPassword ? 'text' : 'password'}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="appearance-none block w-full pl-10 pr-10 py-2 border border-gray-600 rounded-md bg-gray-700 text-white mb-3"
                        placeholder="Enter new password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPassword((prev) => !prev)}
                        className="absolute right-3 top-[38%] -translate-y-1/2 text-gray-400 hover:text-gray-200"
                      >
                        {showNewPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>

                    <label className="block text-sm font-medium text-gray-300 mb-1">
                      Confirm New Password
                    </label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                      <input
                        type={showConfirmPassword ? 'text' : 'password'}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="appearance-none block w-full pl-10 pr-10 py-2 border border-gray-600 rounded-md bg-gray-700 text-white"
                        placeholder="Confirm new password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword((prev) => !prev)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-200"
                      >
                        {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>

                    {passwordRules}

                    {passwordError && <p className="text-red-400 text-xs mt-2">{passwordError}</p>}
                  </div>

                  <button
                    onClick={verifyAndChangePassword}
                    disabled={isVerifying || otpCode.length !== 6 || !newPassword || !confirmPassword}
                    className="w-full flex justify-center py-2 px-4 rounded-md text-sm font-medium text-gray-900 bg-teal-400 hover:bg-teal-500 disabled:opacity-50"
                  >
                    {isVerifying ? 'Verifying...' : 'Verify & Continue'}
                  </button>
                </div>
              )}
            </div>
          )}

          {(setupOnly2FA || step === 2) && (
            <div className="space-y-6">
              <div className="bg-teal-900/30 border border-teal-500/50 p-4 rounded-lg flex items-start">
                <CheckCircle className="w-5 h-5 text-teal-400 mt-0.5 mr-3 flex-shrink-0" />
                <p className="text-sm text-teal-200">
                  Scan this QR code in Google Authenticator or Authy, then enter the 6-digit code.
                </p>
              </div>

              {setupError && (
                <div className="bg-red-900/50 border border-red-500 p-3 rounded-md text-sm text-red-200">
                  {setupError}
                </div>
              )}

              {totpSecret ? (
                <div className="flex flex-col items-center p-4 bg-white rounded-lg">
                  <img src={totpUri} alt="QR Code" className="w-52 h-52 border-4 border-white shadow-sm" />
                  <p className="mt-3 text-xs text-gray-500 font-mono tracking-widest break-all px-4 text-center">
                    {totpSecret}
                  </p>
                </div>
              ) : (
                <div className="h-48 flex items-center justify-center border-2 border-dashed border-gray-600 rounded-lg">
                  <span className="text-gray-400 text-sm">Generating secure key...</span>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-300">
                  Authenticator App Code
                </label>
                <div className="mt-1 flex gap-2">
                  <input
                    type="text"
                    value={totpCode}
                    onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="Enter 6-digit code"
                    className="flex-1 appearance-none block w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-700 text-white"
                  />
                  <button
                    onClick={finalize2FASetup}
                    disabled={totpCode.length !== 6 || !totpSecret}
                    className="flex justify-center py-2 px-6 rounded-md text-sm font-medium text-gray-900 bg-teal-400 hover:bg-teal-500 disabled:opacity-50"
                  >
                    Verify
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default FirstLoginReset;
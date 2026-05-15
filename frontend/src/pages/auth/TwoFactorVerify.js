import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ShieldCheck, Key, RefreshCcw } from 'lucide-react';
import { setAuth } from '../../utils/auth';

const TwoFactorVerify = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const RAW_API_URL = process.env.REACT_APP_BACKEND_URL || 'http://127.0.0.1:8000';
  const API_URL = `${RAW_API_URL}/api`;

  const [enrollment, setEnrollment] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [error, setError] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [isChecking2FA, setIsChecking2FA] = useState(true);

  useEffect(() => {
    const init = async () => {
      const userFromState = location.state?.user;
      const tokenFromState = location.state?.access_token;

      if (!userFromState) {
        navigate('/login', { replace: true });
        return;
      }

      const currentEnrollment =
        userFromState.enrollment_number ||
        userFromState.username ||
        '';

      setEnrollment(currentEnrollment);

      try {
        const res = await fetch(`${API_URL}/auth/2fa-status/${encodeURIComponent(currentEnrollment)}`);
        const data = await res.json();

        const enabled = Boolean(data?.two_factor_enabled);

        if (!enabled) {
          if (tokenFromState) {
            setAuth(tokenFromState, userFromState);
            navigate(userFromState.role === 'admin' ? '/admin' : '/student', { replace: true });
            return;
          }

          navigate('/login', { replace: true });
          return;
        }
      } catch (err) {
        console.error('2FA status check failed:', err);
      } finally {
        setIsChecking2FA(false);
      }
    };

    init();
  }, [location, navigate, API_URL]);

  const handleVerify = async (e) => {
    e.preventDefault();

    const cleanCode = totpCode.replace(/\D/g, '').slice(0, 6);
    if (cleanCode.length !== 6) {
      setError('Please enter a valid 6-digit code.');
      return;
    }

    try {
      setIsVerifying(true);
      setError('');

      const res = await fetch(`${API_URL}/auth/verify-2fa`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enrollment_number: enrollment,
          totp_code: cleanCode
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || data.message || 'Verification failed');
      }

      setAuth(data.access_token, data.user);
      navigate(data.user.role === 'admin' ? '/admin' : '/student', { replace: true });
    } catch (err) {
      setError(err.message || 'Verification failed');
    } finally {
      setIsVerifying(false);
    }
  };

  if (isChecking2FA) {
    return (
      <div className="min-h-screen bg-gray-900 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
        <div className="sm:mx-auto sm:w-full sm:max-w-md">
          <div className="bg-gray-800 py-10 px-6 shadow sm:rounded-lg border border-gray-700 text-center">
            <RefreshCcw className="w-8 h-8 text-teal-400 mx-auto animate-spin" />
            <p className="mt-4 text-sm text-gray-300">Checking security status...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center">
          <ShieldCheck className="w-12 h-12 text-teal-400" />
        </div>
        <h2 className="mt-6 text-center text-3xl font-extrabold text-white">
          Two-Factor Authentication
        </h2>
        <p className="mt-2 text-center text-sm text-gray-400">
          Enter the code from your Authenticator App to continue.
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-gray-800 py-8 px-4 shadow sm:rounded-lg sm:px-10 border border-gray-700">
          {error && (
            <div className="bg-red-900/50 border border-red-500 p-3 rounded-md mb-6 text-sm text-red-200">
              {error}
            </div>
          )}

          <form onSubmit={handleVerify} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-300 flex items-center gap-2">
                <Key className="w-4 h-4 text-gray-400" /> Authenticator Code
              </label>
              <div className="mt-2">
                <input
                  type="text"
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  className="appearance-none block w-full px-3 py-3 border border-gray-600 rounded-md shadow-sm placeholder-gray-500 focus:outline-none focus:ring-teal-500 focus:border-teal-500 sm:text-lg bg-gray-700 text-white tracking-widest text-center"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isVerifying || totpCode.length !== 6}
              className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-gray-900 bg-teal-400 hover:bg-teal-500 disabled:opacity-50"
            >
              {isVerifying ? 'Verifying...' : 'Submit & Login'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default TwoFactorVerify;
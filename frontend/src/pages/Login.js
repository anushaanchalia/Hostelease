import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { toast } from "sonner";
import api from "../utils/api";
import { setAuth } from "../utils/auth";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Card } from "../components/ui/card";
import { User, Shield, Mail, Lock, Eye, EyeOff } from "lucide-react";

export default function Login() {
  const [role, setRole] = useState("student");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();

    const cleanUsername = username.trim();

    if (!cleanUsername || !password) {
      toast.error("Please enter username and password");
      return;
    }

    setLoading(true);

    try {
      const response = await api.post("/auth/login", {
        username: cleanUsername,
        password,
      });

      const data = response.data;

      if (data.requires_first_login_reset) {
        toast.info("First login detected. Redirecting to security setup.");
        navigate("/first-login-reset", { state: { user: data.user } });
        return;
      }

      if (data.requires_2fa_setup) {
        toast.info("Admin 2FA setup required");
        navigate("/first-login-reset", { state: { user: data.user } });
        return;
      }

      if (data.requires_2fa) {
        toast.info("2FA code required");
        navigate("/2fa-verify", {
          state: {
            user: data.user,
            access_token: data.access_token || null,
          },
        });
        return;
      }

      const { access_token, user, is_default_password } = data;

      if (!access_token || !user) {
        toast.error("Invalid login response from server");
        return;
      }

      if (is_default_password !== undefined) {
        user.is_default_password = is_default_password;
      }

      const targetRole = role === "admin" ? "admin" : "student";

      if (user.role !== targetRole) {
        toast.error("Please login with the correct role");
        return;
      }

      setAuth(access_token, user);
      toast.success("Login successful");

      navigate(user.role === "admin" ? "/admin" : "/student", {
        replace: true,
      });
    } catch (error) {
      toast.error(
        error?.response?.data?.detail ||
          "Invalid credentials or server offline",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{
        background: "linear-gradient(135deg, #F8FAFC 0%, #E0E7FF 100%)",
      }}
    >
      <Card className="w-full max-w-md p-8 bg-white/95 backdrop-blur-md shadow-xl border-0">
        <div className="text-center mb-8">
          <h1
            className="text-4xl font-bold mb-2"
            style={{ color: "#5B7FED", fontFamily: "Manrope, sans-serif" }}
          >
            HOSTELEASE
          </h1>
          <p className="text-slate-500 text-sm">Hostel Management System</p>
        </div>

        <div className="flex gap-2 mb-6">
          <button
            type="button"
            onClick={() => setRole("student")}
            className={`flex-1 py-3 px-4 rounded-lg font-medium transition-all flex items-center justify-center gap-2 ${
              role === "student"
                ? "bg-[#5B7FED] text-white shadow-md"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            <User size={18} />
            Student
          </button>

          <button
            type="button"
            onClick={() => setRole("admin")}
            className={`flex-1 py-3 px-4 rounded-lg font-medium transition-all flex items-center justify-center gap-2 ${
              role === "admin"
                ? "bg-[#5B7FED] text-white shadow-md"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            <Shield size={18} />
            Warden
          </button>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <Label
              htmlFor="username"
              className="text-slate-700 text-sm font-medium"
            >
              Email / Enrollment Number / Username
            </Label>
            <div className="relative mt-1">
              <Mail
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                size={18}
              />
              <Input
                id="username"
                type="text"
                placeholder="Enter your college email, enrollment number, or username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="pl-10 border-slate-200 focus:border-[#5B7FED] focus:ring-[#5B7FED]"
                required
              />
            </div>
          </div>

          <div>
            <Label
              htmlFor="password"
              className="text-slate-700 text-sm font-medium"
            >
              Password
            </Label>
            <div className="relative mt-1">
              <Lock
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                size={18}
              />
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                placeholder={role === "student" ? "Enter your password (Default is DOB: DD-MM-YYYY)" : "Enter admin password (Default: Hostel@123)"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pl-10 pr-10 border-slate-200 focus:border-[#5B7FED] focus:ring-[#5B7FED]"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            <p className="text-xs text-slate-500 mt-2">
              {role === "student"
                ? "* Note: Default password is your Date of Birth in DD-MM-YYYY format."
                : "* Note: Default password for Warden / Admin is Hostel@123"}
            </p>
          </div>

          <Button
            type="submit"
            className="w-full py-3 bg-[#5B7FED] hover:bg-[#4A6FD6] text-white font-medium rounded-lg shadow-md transition-all active:scale-95"
            disabled={loading}
          >
            {loading ? "Logging in..." : "Login to Account"}
          </Button>
        </form>

        <div className="mt-6 text-center text-sm text-slate-500">
          <Link
            to="/forgot-password"
            className="text-[#5B7FED] hover:underline"
          >
            Forgot Password?
          </Link>
        </div>
      </Card>
    </div>
  );
}

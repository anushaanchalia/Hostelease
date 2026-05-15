import React, { useEffect, useState } from "react";
import { Card } from "../../components/ui/card";
import api from "../../utils/api";
import {
  Users,
  Bed,
  AlertTriangle,
  FileText,
  MapPin,
  Shirt,
  Calendar,
  UserCheck,
  Utensils,
  MessageSquare,
  BarChart3,
  CreditCard,
  Bell,
  ChevronRight,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";

export default function AdminHome() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      setError("");
      const response = await api.get("/admin/stats");
      setStats(response.data);
    } catch (error) {
      console.error("Error loading stats:", error);
      setError("Failed to load dashboard stats");
    } finally {
      setLoading(false);
    }
  };

  /**
   * Navigates to the Student Database and passes the bhawan name
   * so the table can automatically filter the student list.
   */
  const handleHostelClick = (bhawanName) => {
    navigate("/admin/students", { state: { filterBhawan: bhawanName } });
  };

  const getHostelBarColor = (hostelName = "") => {
    const value = String(hostelName).trim().toLowerCase();

    const girlsHostels = [
      "shakuntala bhawan",
      "janaki bhawan",
      "teresa bhawan",
    ];

    const boysHostels = ["atal bhawan", "azad bhawan", "tagore bhawan"];

    if (girlsHostels.includes(value)) return "#8B5CF6";
    if (boysHostels.includes(value)) return "#5B7FED";

    return "#5B7FED";
  };

  const getHostelOrder = (hostelName = "") => {
    const value = String(hostelName).trim().toLowerCase();

    const orderedHostels = [
      "shakuntala bhawan",
      "janaki bhawan",
      "teresa bhawan",
      "atal bhawan",
      "azad bhawan",
      "tagore bhawan",
    ];

    const index = orderedHostels.indexOf(value);
    return index === -1 ? 999 : index;
  };

  if (loading)
    return <div className="text-center py-12">Loading dashboard...</div>;
  if (error)
    return <div className="text-center py-12 text-red-600">{error}</div>;
  if (!stats)
    return <div className="text-center py-12">No data available.</div>;

  const occupancyRate =
    stats.total_beds > 0 ? (stats.occupied_beds / stats.total_beds) * 100 : 0;

  const sortedHostelDistribution = Array.isArray(stats.hostel_distribution)
    ? [...stats.hostel_distribution].sort(
        (a, b) => getHostelOrder(a.name) - getHostelOrder(b.name),
      )
    : [];

  const categories = [
    {
      title: "Student Operations",
      subtitle: "Daily management of residency requests.",
      items: [
        {
          label: "Gatepass Approvals",
          path: "/admin/gatepass",
          icon: FileText,
          color: "text-orange-500",
          bg: "bg-orange-50",
        },
        {
          label: "Laundry Requests",
          path: "/admin/laundry",
          icon: Shirt,
          color: "text-emerald-500",
          bg: "bg-emerald-50",
        },
        {
          label: "Mark Attendance",
          path: "/admin/attendance",
          icon: Calendar,
          color: "text-blue-500",
          bg: "bg-blue-50",
        },
        {
          label: "Student Complaints",
          path: "/admin/complaints",
          icon: AlertTriangle,
          color: "text-red-500",
          bg: "bg-red-50",
        },
        {
          label: "Visitor Logs",
          path: "/admin/visitors",
          icon: UserCheck,
          color: "text-slate-500",
          bg: "bg-slate-50",
        },
      ],
    },
    {
      title: "Mess & Dining",
      subtitle: "Menu management and student feedback.",
      items: [
        {
          label: "Mess Menu",
          path: "/admin/mess-menu",
          icon: Utensils,
          color: "text-yellow-600",
          bg: "bg-yellow-50",
        },
        {
          label: "Mess Feedback",
          path: "/admin/feedback",
          icon: MessageSquare,
          color: "text-pink-500",
          bg: "bg-pink-50",
        },
        {
          label: "Voting Results",
          path: "/admin/voting",
          icon: BarChart3,
          color: "text-indigo-500",
          bg: "bg-indigo-50",
        },
      ],
    },
    {
      title: "Finance & Admin",
      subtitle: "Billing, fines, and communication.",
      items: [
        {
          label: "Manage Fines",
          path: "/admin/fines",
          icon: AlertTriangle,
          color: "text-red-500",
          bg: "bg-red-50",
        },
        {
          label: "Notifications",
          path: "/admin/notifications",
          icon: Bell,
          color: "text-orange-500",
          bg: "bg-orange-50",
        },
      ],
    },
  ];

  return (
    <div className="space-y-10 fade-in pb-12" data-testid="admin-home">
      <div>
        <h1
          className="text-[28px] font-bold text-[#1E293B]"
          style={{ fontFamily: "Manrope, sans-serif" }}
        >
          Admin Dashboard
        </h1>
        <p className="text-[#64748B] text-sm mt-0.5">
          System Overview and Statistics
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="p-6 bg-white rounded-xl shadow-sm border border-slate-100 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
            <Users className="text-[#3B82F6]" size={22} />
          </div>
          <div>
            <p className="text-[11px] font-bold text-[#94A3B8] uppercase tracking-wider">
              Total Students
            </p>
            <p className="text-2xl font-bold text-[#1E293B]">
              {stats.total_students}
            </p>
          </div>
        </Card>

        <Card className="p-6 bg-white rounded-xl shadow-sm border border-slate-100 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0">
            <Bed className="text-[#10B981]" size={22} />
          </div>
          <div>
            <p className="text-[11px] font-bold text-[#94A3B8] uppercase tracking-wider">
              Available Beds
            </p>
            <p className="text-2xl font-bold text-[#1E293B]">
              {stats.available_beds}
            </p>
          </div>
        </Card>

        <Card className="p-6 bg-white rounded-xl shadow-sm border border-slate-100 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-red-50 flex items-center justify-center shrink-0">
            <AlertTriangle className="text-[#EF4444]" size={22} />
          </div>
          <div>
            <p className="text-[11px] font-bold text-[#94A3B8] uppercase tracking-wider">
              Pending Issues
            </p>
            <p className="text-2xl font-bold text-[#1E293B]">
              {stats.pending_complaints}
            </p>
          </div>
        </Card>

        <Card className="p-6 bg-white rounded-xl shadow-sm border border-slate-100 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-orange-50 flex items-center justify-center shrink-0">
            <FileText className="text-[#F59E0B]" size={22} />
          </div>
          <div>
            <p className="text-[11px] font-bold text-[#94A3B8] uppercase tracking-wider">
              Pending Gatepasses
            </p>
            <p className="text-2xl font-bold text-[#1E293B]">
              {stats.pending_gatepasses}
            </p>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <Card className="lg:col-span-3 p-6 bg-white rounded-xl shadow-sm border border-slate-100 flex flex-col items-center">
          <div className="w-full flex justify-between items-start mb-2">
            <div>
              <h3 className="text-lg font-bold text-[#1E293B]">
                Live Bed Occupancy
              </h3>
              <p className="text-sm text-slate-500">
                Real-time capacity tracking across all {stats.total_beds} beds
              </p>
            </div>
            <div className="text-right">
              <span className="text-xl font-bold text-[#5B7FED]">
                {occupancyRate.toFixed(1)}%
              </span>
              <p className="text-[10px] uppercase font-bold text-slate-400">
                Total Filled
              </p>
            </div>
          </div>

          <div className="w-full h-64 flex-1">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={[
                    { name: "Occupied", value: stats.occupied_beds },
                    { name: "Available", value: stats.available_beds },
                  ]}
                  cx="50%"
                  cy="50%"
                  innerRadius={70}
                  outerRadius={100}
                  paddingAngle={5}
                  dataKey="value"
                >
                  <Cell key="cell-0" fill="#F59E0B" />
                  <Cell key="cell-1" fill="#10B981" />
                </Pie>
                <RechartsTooltip
                  contentStyle={{
                    borderRadius: "0.75rem",
                    border: "none",
                    boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)",
                  }}
                  formatter={(value, name) => [value, name]}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex gap-6 w-full justify-center mt-2">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-[#10B981]" />
              <span className="text-sm font-semibold text-slate-700">
                Available ({stats.available_beds})
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-[#F59E0B]" />
              <span className="text-sm font-semibold text-slate-700">
                Occupied ({stats.occupied_beds})
              </span>
            </div>
          </div>
        </Card>

        <Card className="lg:col-span-2 p-8 bg-[#5B7FED] text-white rounded-xl shadow-lg flex flex-col justify-center">
          <h3 className="text-xl font-bold mb-6">Quick Actions</h3>
          <ul className="space-y-4 opacity-90 text-sm font-semibold list-none">
            <li className="flex items-center gap-2 cursor-pointer hover:translate-x-1 transition-all">
              • Review pending complaints
            </li>
            <li className="flex items-center gap-2 cursor-pointer hover:translate-x-1 transition-all">
              • Approve gatepasses
            </li>
            <li className="flex items-center gap-2 cursor-pointer hover:translate-x-1 transition-all">
              • Update mess menu
            </li>
            <li className="flex items-center gap-2 cursor-pointer hover:translate-x-1 transition-all">
              • Mark student attendance
            </li>
            <li className="flex items-center gap-2 cursor-pointer hover:translate-x-1 transition-all">
              • Send notifications
            </li>
          </ul>
        </Card>
      </div>

      <Card className="p-8 bg-white rounded-2xl shadow-sm border border-slate-100">
        <h3
          className="text-xl font-bold text-slate-800 mb-1"
          style={{ fontFamily: "Manrope, sans-serif" }}
        >
          Hostel Distribution (Total {stats.total_students})
        </h3>
        <p className="text-sm text-slate-400 font-medium mb-8">
          Visualizing student population across all Bhawans.
        </p>

        {sortedHostelDistribution && sortedHostelDistribution.length > 0 ? (
          <>
            <div className="w-full h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={sortedHostelDistribution}
                  margin={{ top: 20, right: 30, left: 0, bottom: 5 }}
                  onClick={(state) => {
                    if (
                      state &&
                      state.activePayload &&
                      state.activePayload.length > 0
                    ) {
                      handleHostelClick(state.activePayload[0].payload.name);
                    }
                  }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke="#E2E8F0"
                  />
                  <XAxis
                    dataKey="name"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "#64748B", fontSize: 12 }}
                  />
                  <YAxis
                    allowDecimals={false}
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "#64748B", fontSize: 12 }}
                  />
                  <RechartsTooltip
                    cursor={{ fill: "#F1F5F9" }}
                    contentStyle={{
                      borderRadius: "0.75rem",
                      border: "none",
                      boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)",
                    }}
                    formatter={(value) => [`${value} Students`, "Population"]}
                  />
                  <Bar
                    dataKey="count"
                    radius={[6, 6, 0, 0]}
                    className="cursor-pointer"
                    fill="#3B82F6"
                  >
                    {sortedHostelDistribution.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={getHostelBarColor(entry.name)}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="flex justify-center gap-8 mt-6 flex-wrap">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-[#8B5CF6]" />
                <span className="text-sm font-semibold text-slate-600">
                  Girls Hostel
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-[#5B7FED]" />
                <span className="text-sm font-semibold text-slate-600">
                  Boys Hostel
                </span>
              </div>
            </div>
          </>
        ) : (
          <div className="h-72 flex items-center justify-center text-slate-400">
            No distribution data available
          </div>
        )}
      </Card>

      {categories.map((cat, idx) => (
        <div key={idx} className="space-y-6 pt-4">
          <div>
            <h3
              className="text-xl font-bold text-[#1E293B]"
              style={{ fontFamily: "Manrope, sans-serif" }}
            >
              {cat.title}
            </h3>
            <p className="text-sm text-[#94A3B8] font-medium mt-0.5">
              {cat.subtitle}
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {cat.items.map((item, i) => (
              <Card
                key={i}
                onClick={() => navigate(item.path)}
                className="p-6 bg-white rounded-3xl shadow-sm border-none hover:shadow-xl hover:-translate-y-1 transition-all cursor-pointer flex items-center gap-5 group"
              >
                <div
                  className={`w-14 h-14 rounded-2xl ${item.bg} flex items-center justify-center shrink-0 transition-transform group-hover:scale-110`}
                >
                  <item.icon className={item.color} size={24} />
                </div>
                <div className="flex-1">
                  <h4 className="font-bold text-[#1E293B] leading-tight">
                    {item.label}
                  </h4>
                  <div className="flex items-center gap-1 mt-1 text-[10px] font-bold text-[#94A3B8] uppercase tracking-widest">
                    <span>Manage</span>
                    <ChevronRight
                      size={10}
                      className="group-hover:translate-x-1 transition-transform"
                    />
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

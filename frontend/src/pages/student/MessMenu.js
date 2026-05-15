import React, { useEffect, useState } from 'react';
import { Card } from '../../components/ui/card';
import api from '../../utils/api';
import { Utensils, Calendar, Clock, Star, Share2 } from 'lucide-react';
import { Button } from '../../components/ui/button';

export default function MessMenu() {
  const [menu, setMenu] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());

  // Define the strict order of days
  const dayOrder = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

  useEffect(() => {
    loadMenu();
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  const loadMenu = async () => {
    try {
      const response = await api.get('/mess-menu');
      
      // Sort the array based on the dayOrder reference
      const sortedMenu = response.data.sort((a, b) => {
        return dayOrder.indexOf(a.day) - dayOrder.indexOf(b.day);
      });

      setMenu(sortedMenu);
    } catch (error) {
      console.error('Error loading menu:', error);
    } finally {
      setLoading(false);
    }
  };

  // NEW: LOGIC TO DETERMINE CURRENT MEAL
  const getActiveMeal = () => {
    const hour = currentTime.getHours();
    if (hour >= 7 && hour < 11) return 'breakfast';
    if (hour >= 12 && hour < 15) return 'lunch';
    if (hour >= 19 && hour < 22) return 'dinner';
    return null;
  };

  // --- NEW: WHATSAPP SHARE LOGIC ---
  const shareToWhatsApp = (dayData) => {
    const formatList = (val) => Array.isArray(val) ? val.join(', ') : (val || "Not specified");
    
    const message = `🍴 *Mess Menu: ${dayData.day}* 🍴%0A%0A` +
      `🌅 *Breakfast:* ${formatList(dayData.breakfast)}%0A` +
      `☀️ *Lunch:* ${formatList(dayData.lunch)}%0A` +
      `🌙 *Dinner:* ${formatList(dayData.dinner)}%0A%0A` +
      `_Sent via Hostelease Dashboard_`;

    window.open(`https://wa.me/?text=${message}`, '_blank');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-10 h-10 border-4 border-[#5B7FED] border-t-transparent rounded-full animate-spin"></div>
        <span className="ml-3 text-slate-500 font-medium">Loading menu...</span>
      </div>
    );
  }

  const activeMeal = getActiveMeal();
  const todayIndex = currentTime.getDay() === 0 ? 6 : currentTime.getDay() - 1;
  const todayName = dayOrder[todayIndex];

  return (
    <div className="space-y-6 fade-in max-w-5xl mx-auto" data-testid="mess-menu-page">
      
      {/* TODAY'S LIVE BANNER */}
      {activeMeal && (
        <Card className="p-6 bg-gradient-to-r from-[#5B7FED] to-[#4A6FD6] text-white border-none shadow-xl rounded-3xl overflow-hidden relative">
            <div className="relative z-10 flex items-center justify-between">
                <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-80 mb-1">Live from the Kitchen</p>
                    <h2 className="text-2xl font-black capitalize flex items-center gap-2">
                      <Clock size={24} /> {activeMeal} is being served!
                    </h2>
                    <p className="text-sm opacity-90 mt-1">Check today's card below for the full menu.</p>
                </div>
                <Utensils size={40} className="opacity-20 rotate-12" />
            </div>
            <div className="absolute -right-4 -bottom-4 w-32 h-32 bg-white/10 rounded-full blur-2xl" />
        </Card>
      )}

      <div className="flex items-center gap-3">
        <div className="p-3 bg-[#5B7FED]/10 rounded-2xl">
          <Utensils size={32} className="text-[#5B7FED]" />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-slate-900" style={{ fontFamily: 'Manrope, sans-serif' }}>
            Weekly Mess Menu
          </h1>
          <p className="text-slate-500 text-sm mt-1">Check what's cooking this week</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6">
        {menu.map((day, index) => (
          /* UPDATED: Added special emerald styling for Sunday and Border for Today */
          <Card 
            key={index} 
            className={`p-6 rounded-2xl shadow-sm transition-all border ${
              day.day === todayName ? 'border-[#5B7FED] ring-1 ring-[#5B7FED]/20' : 'border-slate-100'
            } ${
              day.day === 'Sunday' ? 'ring-2 ring-emerald-500 bg-emerald-50/10' : 'bg-white'
            }`} 
            data-testid={`menu-day-${day.day.toLowerCase()}`}
          >
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <Calendar className={day.day === 'Sunday' ? "text-emerald-500" : "text-[#5B7FED]"} size={22} />
                <div>
                    <h3 className="text-xl font-bold text-slate-800">
                      {day.day} {day.day === todayName && <span className="text-[#5B7FED] text-xs font-black ml-2 uppercase">(Today)</span>}
                    </h3>
                </div>
              </div>
              
              <div className="flex items-center gap-3">
                  {/* WhatsApp Share Button */}
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => shareToWhatsApp(day)}
                    className="rounded-full text-slate-400 hover:text-green-600 hover:bg-green-50"
                  >
                    <Share2 size={18} />
                  </Button>

                  {day.day === 'Sunday' && (
                    <div className="bg-emerald-500 text-white text-[10px] font-black uppercase px-3 py-1 rounded-full animate-pulse">
                        ★ Student Choice ★
                    </div>
                  )}
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {['breakfast', 'lunch', 'dinner'].map((mealType) => (
                <div key={mealType} className={`space-y-3 p-3 rounded-2xl transition-colors ${activeMeal === mealType && day.day === todayName ? 'bg-blue-50/50' : ''}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-lg">
                      {mealType === 'breakfast' ? '🌅' : mealType === 'lunch' ? '☀️' : '🌙'}
                    </span>
                    <p className={`text-xs font-black uppercase tracking-widest ${
                      day.day === 'Sunday' ? 'text-emerald-600' : 
                      mealType === 'breakfast' ? 'text-amber-600' : 
                      mealType === 'lunch' ? 'text-orange-600' : 'text-indigo-600'
                    }`}>
                      {mealType}
                    </p>
                  </div>
                  <ul className="space-y-2">
                    {/* UPDATED: Handle both Array and String data types with Special Item Highlighting */}
                    {(Array.isArray(day[mealType]) ? day[mealType] : (day[mealType] || "").split(',')).map((item, i) => (
                      item.trim() && (
                        <li key={i} className="text-sm text-slate-600 flex items-start gap-2">
                          {/* HIGHLIGHT WINNER ANIMATION */}
                          {item.includes("(Special)") ? (
                            <Star size={14} className="text-amber-500 fill-amber-500 animate-spin-slow mt-0.5" />
                          ) : (
                            <div className={`w-1.5 h-1.5 rounded-full mt-2 ${day.day === 'Sunday' ? 'bg-emerald-400' : 'bg-slate-200'}`} />
                          )}
                          <span className={item.includes("(Special)") ? "font-bold text-slate-900" : ""}>
                            {item.trim()}
                          </span>
                        </li>
                      )
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
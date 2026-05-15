import React, { useEffect, useState } from 'react';
import api from '../../utils/api';
import { toast } from 'sonner';
import { Card } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Label } from '../../components/ui/label';
import { Textarea } from '../../components/ui/textarea';
import {
  MessageCircle,
  Star,
  ShieldCheck,
  Sparkles,
  Send,
  UtensilsCrossed,
  Clock3,
  Lock
} from 'lucide-react';

const ratingOptions = [
  { value: 1, stars: '⭐', label: 'Bad', color: 'text-rose-500' },
  { value: 2, stars: '⭐⭐', label: 'Average', color: 'text-amber-500' },
  { value: 3, stars: '⭐⭐⭐', label: 'Good', color: 'text-yellow-500' },
  { value: 4, stars: '⭐⭐⭐⭐', label: 'Very Good', color: 'text-emerald-500' },
  { value: 5, stars: '⭐⭐⭐⭐⭐', label: 'Excellent', color: 'text-green-600' }
];

const mealCards = [
  { value: 'breakfast', label: 'Morning Mess Rating', short: 'Breakfast', icon: '🌅', time: '7:00 AM - 9:00 AM' },
  { value: 'lunch', label: 'Afternoon Mess Rating', short: 'Lunch', icon: '☀️', time: '12:00 PM - 2:00 PM' },
  { value: 'dinner', label: 'Night Mess Rating', short: 'Dinner', icon: '🌙', time: '7:00 PM - 9:00 PM' }
];

export default function MessFeedback() {
  const [mealType, setMealType] = useState('breakfast');
  const [loading, setLoading] = useState(false);

  const [mealRating, setMealRating] = useState({
    breakfast: 3,
    lunch: 3,
    dinner: 3
  });

  const [generalFeedback, setGeneralFeedback] = useState('');
  const [weeklyChoice, setWeeklyChoice] = useState('');
  const [status, setStatus] = useState({
    weekly_choice_open: true,
    weekly_choice_deadline: null
  });

  useEffect(() => {
    loadFeedbackStatus();
  }, []);

  const loadFeedbackStatus = async () => {
    try {
      const res = await api.get('/food-feedback/status');
      setStatus({
        weekly_choice_open: !!res.data?.weekly_choice_open,
        weekly_choice_deadline: res.data?.weekly_choice_deadline || null
      });
    } catch (error) {
      console.error('Failed to load feedback status:', error);
    }
  };

  const handleMealRatingChange = (meal, value) => {
    setMealRating((prev) => ({
      ...prev,
      [meal]: value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const payload = {
        meal_type: mealType,
        ratings: {
          breakfast: mealRating.breakfast,
          lunch: mealRating.lunch,
          dinner: mealRating.dinner
        },
        rating: mealRating[mealType],
        comment: generalFeedback,
        weekly_food_choice: weeklyChoice,
        suggestions: status.weekly_choice_open ? weeklyChoice : generalFeedback,
        timestamp: new Date().toISOString(),
        anonymous: true
      };

      await api.post('/food-feedback/anonymous', payload);

      toast.success('🎉 Anonymous feedback submitted successfully!', {
        description: 'Your identity will not be shown to the warden.'
      });

      setGeneralFeedback('');
      setWeeklyChoice('');
      setMealRating({
        breakfast: 3,
        lunch: 3,
        dinner: 3
      });
      setMealType('breakfast');
      await loadFeedbackStatus();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to submit feedback');
    } finally {
      setLoading(false);
    }
  };

  const selectedRating = ratingOptions.find((r) => r.value === mealRating[mealType]) || ratingOptions[2];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 px-1">
        <Star size={30} className="text-yellow-500 fill-yellow-400" />
        <div>
          <h1
            className="text-3xl font-black text-slate-900"
            style={{ fontFamily: 'Manrope, sans-serif' }}
          >
            Anonymous Mess Feedback
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Share your honest opinion. Your name will not be shown.
          </p>
        </div>
      </div>

      <Card className="p-6 rounded-[2rem] bg-gradient-to-r from-indigo-50 via-white to-blue-50 border border-indigo-100 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-indigo-600 flex items-center justify-center shadow-sm">
            <ShieldCheck className="text-white" size={22} />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-black text-slate-900">Anonymous Submission Enabled</h3>
            <p className="text-sm text-slate-600 mt-1 leading-relaxed">
              All meal ratings and suggestions are submitted anonymously. Daily meal feedback and weekly food choice are now handled separately.
            </p>
          </div>
        </div>
      </Card>

      <Card className="p-8 bg-white rounded-[2rem] shadow-xl border border-slate-100">
        <form onSubmit={handleSubmit} className="space-y-8">
          <div>
            <Label className="text-lg font-black text-slate-900 mb-5 block">
              Choose the meal you want to review
            </Label>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {mealCards.map((meal) => {
                const current = ratingOptions.find((r) => r.value === mealRating[meal.value]) || ratingOptions[2];
                const active = mealType === meal.value;

                return (
                  <button
                    key={meal.value}
                    type="button"
                    onClick={() => setMealType(meal.value)}
                    className={`text-left rounded-[1.5rem] border transition-all p-5 ${
                      active
                        ? 'border-indigo-300 bg-indigo-50 shadow-md'
                        : 'border-slate-200 bg-white hover:border-indigo-200'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-3xl">{meal.icon}</div>
                        <p className="font-black text-slate-900 mt-3">{meal.short}</p>
                        <p className="text-xs text-slate-500 font-semibold mt-1">{meal.time}</p>
                      </div>
                      <div className={`text-xs font-black px-3 py-1 rounded-full bg-white border ${current.color}`}>
                        {current.label}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <Label className="text-lg font-black text-slate-900 mb-4 block">
              {mealCards.find((m) => m.value === mealType)?.label}
            </Label>

            <div className="rounded-[1.5rem] border border-slate-200 bg-white overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                <div>
                  <p className="font-black text-slate-900">{mealCards.find((m) => m.value === mealType)?.short}</p>
                  <p className="text-xs text-slate-500 mt-1">Select one rating below</p>
                </div>
                <div className={`text-sm font-black px-4 py-2 rounded-xl bg-white border ${selectedRating.color}`}>
                  {selectedRating.stars} {selectedRating.label}
                </div>
              </div>

              <div className="p-4 space-y-3">
                {ratingOptions.map((rating) => (
                  <button
                    key={rating.value}
                    type="button"
                    onClick={() => handleMealRatingChange(mealType, rating.value)}
                    className={`w-full flex items-center justify-between rounded-2xl border px-4 py-4 transition-all ${
                      mealRating[mealType] === rating.value
                        ? 'border-indigo-300 bg-indigo-50 shadow-sm'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{rating.stars}</span>
                      <span className="font-bold text-slate-800">{rating.label}</span>
                    </div>
                    <span className={`text-sm font-black ${rating.color}`}>{rating.value}/5</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div>
            <Label
              htmlFor="generalFeedback"
              className="text-lg font-black text-slate-900 mb-3 flex items-center gap-2"
            >
              <MessageCircle size={18} className="text-slate-700" />
              Suggestions (Anonymous)
            </Label>
            <Textarea
              id="generalFeedback"
              placeholder="Help us improve. Your name will not be shown to the Warden."
              value={generalFeedback}
              onChange={(e) => setGeneralFeedback(e.target.value)}
              className="min-h-40 resize-none rounded-[1.25rem] border-slate-200 text-base placeholder:text-slate-400"
            />
            <p className="text-xs text-slate-500 mt-2">
              Share what was good, what was bad, or what should improve in this meal.
            </p>
          </div>

          <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-5">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center">
                {status.weekly_choice_open ? (
                  <UtensilsCrossed size={18} className="text-indigo-600" />
                ) : (
                  <Lock size={18} className="text-slate-500" />
                )}
              </div>

              <div className="flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-black text-slate-900">Next Week Food Choice</h3>
                  <span
                    className={`text-[10px] font-black px-2.5 py-1 rounded-full uppercase tracking-widest ${
                      status.weekly_choice_open
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-slate-200 text-slate-600'
                    }`}
                  >
                    {status.weekly_choice_open ? 'Open' : 'Closed'}
                  </span>
                </div>

                <p className="text-sm text-slate-600 mt-2 leading-relaxed">
                  This is separate from daily feedback. You can still submit breakfast/lunch/dinner feedback even when weekly menu choice is closed.
                </p>

                {status.weekly_choice_deadline && (
                  <div className="mt-3 flex items-center gap-2 text-xs text-slate-500 font-semibold">
                    <Clock3 size={14} />
                    Weekly choice deadline: {new Date(status.weekly_choice_deadline).toLocaleString()}
                  </div>
                )}
              </div>
            </div>

            <Textarea
              id="weeklyChoice"
              placeholder={
                status.weekly_choice_open
                  ? "Tell us what food item you'd like to see in next week's menu..."
                  : 'Weekly food choice is closed for this cycle.'
              }
              value={weeklyChoice}
              onChange={(e) => setWeeklyChoice(e.target.value)}
              disabled={!status.weekly_choice_open}
              className="mt-4 min-h-28 resize-none rounded-[1.25rem] border-slate-200 bg-white disabled:opacity-70"
            />
          </div>

          <Button
            type="submit"
            disabled={loading}
            className="w-full py-6 rounded-2xl bg-[#26429B] hover:bg-[#1F3782] text-white text-lg font-black shadow-lg"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Submitting...
              </span>
            ) : (
              <span className="flex items-center justify-center gap-2">
                <Send size={18} />
                Submit Anonymous Feedback
              </span>
            )}
          </Button>
        </form>
      </Card>
    </div>
  );
}
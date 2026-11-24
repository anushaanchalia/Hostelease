import React, { useState, useEffect, useMemo } from 'react';
import { Card } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Label } from '../../components/ui/label';
import api from '../../utils/api';
import { toast } from 'sonner';
import {
  Home,
  Bed,
  Sparkles,
  Check,
  CreditCard,
  ShieldCheck,
  Building2,
  Users,
  ArrowLeft,
  QrCode,
  IndianRupee,
  Clock3,
  Moon,
  BookOpen,
  Heart,
  MessageSquare,
  Bath,
  Snowflake
} from 'lucide-react';

const defaultPreferences = {
  washroom: 'common',
  roomType: '3-sharing',
  acType: 'non-ac',
  specialRequests: '',
  useCompatibilityMatching: true
};

const defaultPersonality = {
  sleepSchedule: 'night owl',
  studyHabits: 'silent',
  cleanliness: 3,
  likesText: '',
  dislikesText: '',
  hobbiesText: '',
  isLooking: true
};

export default function BookHostel() {
  const [step, setStep] = useState(1);
  const [selectedHostel, setSelectedHostel] = useState(null);
  const [hostelData, setHostelData] = useState([]);
  const [preferences, setPreferences] = useState(defaultPreferences);
  const [personality, setPersonality] = useState(defaultPersonality);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [bookingRef, setBookingRef] = useState(null);
  const [bookingStatus, setBookingStatus] = useState(null);
  const [paymentDetails, setPaymentDetails] = useState({
    paymentMethod: 'upi',
    payerUpi: '',
    transactionRef: '',
    qrScanned: false
  });

  const [filterAc, setFilterAc] = useState('all');
  const [filterWashroom, setFilterWashroom] = useState('all');
  const [filterSharing, setFilterSharing] = useState('all');

  const upiId = 'hostelease@upi';
  const merchantName = 'Hostelease Hostel Fees';

  const calculateBookingAmount = useMemo(() => {
    let baseAmount = 18000;
    let acCharge = 0;
    let washroomCharge = 0;
    let sharingCharge = 0;

    if (preferences.acType === 'ac') acCharge = 12000;
    if (preferences.washroom === 'attached') washroomCharge = 5000;
    if (preferences.roomType === '3-sharing') sharingCharge = 4000;
    if (preferences.roomType === '4-sharing') sharingCharge = 2000;

    const totalAmount = baseAmount + acCharge + washroomCharge + sharingCharge;

    return {
      totalAmount,
      breakdown: {
        hostelBase: baseAmount,
        acCharge,
        washroomCharge,
        sharingCharge
      }
    };
  }, [preferences]);

  const paymentAmount = bookingStatus?.payment?.amount || calculateBookingAmount.totalAmount;
  const upiPayload = `upi://pay?pa=${upiId}&pn=${encodeURIComponent(merchantName)}&am=${paymentAmount}&cu=INR&tn=${encodeURIComponent(`Yearly Hostel Booking ${bookingRef || ''}`)}`;
  const qrImageUrl = `https://quickchart.io/qr?text=${encodeURIComponent(upiPayload)}&size=220`;

  useEffect(() => {
    fetchHostels();
    fetchExistingBooking();
  }, []);

  const fetchHostels = async () => {
    try {
      setFetching(true);
      const response = await api.get('/bed-availability');
      setHostelData(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      toast.error('Failed to load real-time hostel availability');
    } finally {
      setFetching(false);
    }
  };

  const fetchExistingBooking = async () => {
    try {
      const res = await api.get('/student/yearly-booking-status');
      const payload = res.data || null;
      if (!payload?.booking) return;

      setBookingStatus(payload);
      setBookingRef(payload.booking._id);
      setSelectedHostel({
        hostel_name: payload.booking.hostel_name,
        block: payload.booking.block
      });

      setPreferences({
        ...defaultPreferences,
        ...(payload.booking.preferences || {})
      });

      if (payload.roommate_profile) {
        setPersonality({
          ...defaultPersonality,
          sleepSchedule: payload.roommate_profile.sleepSchedule || defaultPersonality.sleepSchedule,
          studyHabits: payload.roommate_profile.studyHabits || defaultPersonality.studyHabits,
          cleanliness: Number(payload.roommate_profile.cleanliness || 3),
          likesText: Array.isArray(payload.roommate_profile.likes) ? payload.roommate_profile.likes.join(', ') : '',
          dislikesText: Array.isArray(payload.roommate_profile.dislikes) ? payload.roommate_profile.dislikes.join(', ') : '',
          hobbiesText: Array.isArray(payload.roommate_profile.hobbies) ? payload.roommate_profile.hobbies.join(', ') : '',
          isLooking: Boolean(payload.roommate_profile.isLooking ?? true)
        });
      }

      if (payload.booking.status === 'pending_payment') {
        setStep(4);
      } else if (payload.booking.status === 'half_paid') {
        setStep(6);
      } else if (payload.booking.status === 'assigned') {
        setStep(6);
      }
    } catch (error) {
      // no active booking is okay
    }
  };

  const filteredHostels = useMemo(() => {
    return hostelData.filter((hostel) => {
      const acOk = filterAc === 'all' ? true : Number(hostel?.feature_summary?.[filterAc]?.available_beds || 0) > 0;
      const washroomOk = filterWashroom === 'all' ? true : Number(hostel?.feature_summary?.[filterWashroom]?.available_beds || 0) > 0;
      const sharingOk = filterSharing === 'all' ? true : Number(hostel?.feature_summary?.[filterSharing]?.available_beds || 0) > 0;
      return acOk && washroomOk && sharingOk;
    });
  }, [hostelData, filterAc, filterWashroom, filterSharing]);

  const matchingAvailabilityForSelection = useMemo(() => {
    if (!selectedHostel) return 0;
    const matched = hostelData.find(
      (h) => h.hostel_name === selectedHostel.hostel_name && h.block === selectedHostel.block
    );
    if (!matched) return 0;

    return Number(
      matched?.matching_available_beds_map?.[
        `${preferences.acType}|${preferences.washroom}|${preferences.roomType}`
      ] || 0
    );
  }, [selectedHostel, hostelData, preferences]);

  const handleHostelSelect = (hostel) => {
    setSelectedHostel(hostel);
    setStep(2);
  };

  const handleSubmitBooking = async () => {
    if (!selectedHostel) {
      toast.error('Please select a hostel first');
      return;
    }

    setLoading(true);
    try {
      const roommateProfile = {
        sleepSchedule: personality.sleepSchedule,
        studyHabits: personality.studyHabits,
        cleanliness: Number(personality.cleanliness || 3),
        likes: personality.likesText.split(',').map((v) => v.trim()).filter(Boolean),
        dislikes: personality.dislikesText.split(',').map((v) => v.trim()).filter(Boolean),
        hobbies: personality.hobbiesText.split(',').map((v) => v.trim()).filter(Boolean),
        isLooking: Boolean(personality.isLooking)
      };

      const response = await api.post('/bookings/create', {
        hostel_name: selectedHostel.hostel_name,
        block: selectedHostel.block,
        preferences,
        roommate_profile: roommateProfile,
        booking_amount: calculateBookingAmount.totalAmount,
        booking_date: new Date().toISOString()
      });

      toast.success('Preferences saved. Complete payment to lock your booking.');
      setBookingRef(response.data.booking_id);
      setBookingStatus({
        booking: response.data.booking,
        payment: response.data.payment,
        roommate_profile: response.data.roommate_profile
      });
      setStep(4);
      fetchHostels();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to submit booking');
    } finally {
      setLoading(false);
    }
  };

  const handleGoToScanner = () => {
    if (!bookingRef) return toast.error('Booking reference missing');
    setStep(5);
  };

  const handleRazorpayHostelPayment = () => {
    if (!window.Razorpay) {
      toast.error('Razorpay SDK not loaded. You can still scan the QR code to pay.');
      return;
    }
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    const options = {
      key: "rzp_test_1DP5mmOlF5G5ag",
      amount: Number(paymentAmount) * 100,
      currency: "INR",
      name: "HOSTELEASE Campus Living",
      description: `Yearly Hostel Advance Booking - ₹${paymentAmount}`,
      image: "https://cdn-icons-png.flaticon.com/512/3063/3063823.png",
      handler: async function (response) {
        toast.success(`Payment verified via Razorpay! ID: ${response.razorpay_payment_id}`);
        setPaymentDetails({
          paymentMethod: 'razorpay',
          payerUpi: response.razorpay_payment_id,
          transactionRef: response.razorpay_payment_id,
          qrScanned: true
        });
        setLoading(true);
        try {
          const res = await api.post(`/bookings/submit-payment/${bookingRef}`, {
            payment_method: 'razorpay',
            payer_upi: response.razorpay_payment_id,
            transaction_ref: response.razorpay_payment_id,
            qr_scanned: true
          });
          toast.success('Payment verified successfully. Your booking is now blocked.');
          setBookingStatus({
            booking: res.data.booking,
            payment: res.data.payment,
            roommate_profile: res.data.roommate_profile
          });
          setStep(6);
          fetchHostels();
        } catch (err) {
          toast.error(err.response?.data?.detail || 'Verification error');
        } finally {
          setLoading(false);
        }
      },
      prefill: {
        name: user.student_name || user.name || "Student",
        email: user.college_email || user.email || "student@hostel.com",
        contact: user.phone || "9999999999"
      },
      theme: {
        color: "#5B7FED"
      }
    };
    const rzp = new window.Razorpay(options);
    rzp.open();
  };

  const handlePaymentConfirm = async () => {
    if (!paymentDetails.paymentMethod) return toast.error('Select a payment method');
    if (!paymentDetails.qrScanned) return toast.error('Please scan the QR and confirm before continuing');
    if (!paymentDetails.transactionRef.trim()) return toast.error('Enter transaction reference / UTR number');
    if (paymentDetails.paymentMethod === 'upi' && !paymentDetails.payerUpi.trim()) {
      return toast.error('Enter payer UPI ID');
    }

    setLoading(true);
    // Simulate real payment processing delay
    await new Promise(resolve => setTimeout(resolve, 2500));
    try {
      const res = await api.post(`/bookings/submit-payment/${bookingRef}`, {
        payment_method: paymentDetails.paymentMethod,
        payer_upi: paymentDetails.payerUpi,
        transaction_ref: paymentDetails.transactionRef,
        qr_scanned: paymentDetails.qrScanned
      });

      toast.success('Payment recorded successfully. Your booking is now blocked.');
      setBookingStatus({
        booking: res.data.booking,
        payment: res.data.payment,
        roommate_profile: res.data.roommate_profile
      });
      setStep(6);
      fetchHostels();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Payment verification failed');
    } finally {
      setLoading(false);
    }
  };

  const resetFlow = async () => {
    try {
      await api.delete('/bookings/draft');
    } catch (e) {
      console.log('No draft booking to delete or error deleting', e);
    }
    setStep(1);
    setSelectedHostel(null);
    setPreferences(defaultPreferences);
    setPersonality(defaultPersonality);
    setPaymentDetails({
      paymentMethod: 'upi',
      payerUpi: '',
      transactionRef: '',
      qrScanned: false
    });
    setBookingRef(null);
    setBookingStatus(null);
    fetchExistingBooking();
    fetchHostels();
  };

  if (fetching) {
    return <div className="text-center py-12 text-slate-500 font-semibold">Syncing with real-time hostel data...</div>;
  }

  return (
    <div className="space-y-6 fade-in" data-testid="book-hostel-page">
      <div className="flex justify-end mb-2">
        {step > 1 && step < 6 && (
          <Button onClick={resetFlow} variant="outline" size="sm" className="text-red-500 border-red-200 hover:bg-red-50 shadow-sm font-semibold">
            Start Over
          </Button>
        )}
      </div>
      <div className="flex items-start justify-center gap-2 mb-8 hidden md:flex">
        {[
          { num: 1, label: 'Choose Hostel', icon: Home },
          { num: 2, label: 'Preferences', icon: Bed },
          { num: 3, label: 'Personality', icon: Users },
          { num: 4, label: 'Payment Type', icon: CreditCard },
          { num: 5, label: 'Scan & Pay', icon: QrCode },
          { num: 6, label: 'Confirmation', icon: Sparkles }
        ].map((item, index) => (
          <React.Fragment key={item.num}>
            <div className={`flex flex-col items-center w-24 ${step >= item.num ? 'opacity-100' : 'opacity-40'}`}>
              <div className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${
                step > item.num
                  ? 'bg-green-500 text-white'
                  : step === item.num
                  ? 'bg-[#5B7FED] text-white shadow-lg scale-110'
                  : 'bg-slate-200 text-slate-500'
              }`}>
                {step > item.num ? <Check size={20} /> : React.createElement(item.icon, { size: 20 })}
              </div>
              <span className="text-[10px] sm:text-xs font-semibold mt-2 text-center text-slate-600 leading-tight">{item.label}</span>
            </div>
            {index < 5 && (
              <div className={`w-8 sm:w-12 h-1 mt-6 rounded transition-all ${
                step > item.num ? 'bg-green-500' : step === item.num ? 'bg-[#5B7FED]' : 'bg-slate-200'
              }`} />
            )}
          </React.Fragment>
        ))}
      </div>

      {step === 1 && (
        <div>
          <div className="text-center mb-6">
            <h1 className="text-3xl font-bold text-slate-900 mb-2" style={{ fontFamily: 'Manrope, sans-serif' }}>
              Choose Your Hostel
            </h1>
            <p className="text-slate-500">Real-time inventory based on hostel, block, AC type, washroom type and sharing type.</p>
          </div>

          <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 mb-6 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label className="text-xs text-slate-500 mb-1 block">AC / Non-AC</Label>
              <select value={filterAc} onChange={(e) => setFilterAc(e.target.value)} className="w-full p-2 border border-slate-200 rounded-lg text-sm bg-slate-50 outline-none">
                <option value="all">Any</option>
                <option value="ac">AC Only</option>
                <option value="non-ac">Non-AC Only</option>
              </select>
            </div>

            <div>
              <Label className="text-xs text-slate-500 mb-1 block">Washroom Type</Label>
              <select value={filterWashroom} onChange={(e) => setFilterWashroom(e.target.value)} className="w-full p-2 border border-slate-200 rounded-lg text-sm bg-slate-50 outline-none">
                <option value="all">Any</option>
                <option value="attached">Attached</option>
                <option value="common">Common</option>
              </select>
            </div>

            <div>
              <Label className="text-xs text-slate-500 mb-1 block">Sharing Type</Label>
              <select value={filterSharing} onChange={(e) => setFilterSharing(e.target.value)} className="w-full p-2 border border-slate-200 rounded-lg text-sm bg-slate-50 outline-none">
                <option value="all">Any</option>
                <option value="3-sharing">3 Sharing</option>
                <option value="4-sharing">4 Sharing</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredHostels.map((hostel, index) => {
              const total = Number(hostel.total_beds || 0);
              const available = Number(hostel.available_beds || 0);
              const occupancyPct = total > 0 ? Math.round(((total - available) / total) * 100) : 0;

              return (
                <Card
                  key={index}
                  className="group cursor-pointer hover-lift overflow-hidden border-2 hover:border-[#5B7FED] transition-all"
                  onClick={() => handleHostelSelect(hostel)}
                >
                  <div className="p-6">
                    <div className="flex items-center justify-between mb-4">
                      <div className="text-5xl">🏛️</div>
                      <div className={`px-3 py-1 rounded-full text-xs font-medium ${
                        String(hostel.gender || '').toLowerCase() === 'female'
                          ? 'bg-pink-100 text-pink-700'
                          : 'bg-blue-100 text-blue-700'
                      }`}>
                        {hostel.gender || 'Hostel'}
                      </div>
                    </div>

                    <h3 className="text-xl font-bold text-slate-900 mb-2">
                      {hostel.hostel_name} - Block {hostel.block}
                    </h3>

                    <div className="space-y-2 mb-4 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-600">Capacity:</span>
                        <span className="font-semibold text-slate-900">{total} beds</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-600">Available:</span>
                        <span className={`font-semibold ${
                          available > 15 ? 'text-green-600' : available > 5 ? 'text-orange-600' : 'text-red-600'
                        }`}>
                          {available} beds
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 mb-4 text-[11px]">
                      <div className="rounded-lg bg-slate-50 p-2 border border-slate-100">
                        <p className="font-black text-slate-500 uppercase">AC</p>
                        <p className="font-bold text-slate-900">{hostel.feature_summary?.ac?.available_beds || 0}</p>
                      </div>
                      <div className="rounded-lg bg-slate-50 p-2 border border-slate-100">
                        <p className="font-black text-slate-500 uppercase">NON-AC</p>
                        <p className="font-bold text-slate-900">{hostel.feature_summary?.['non-ac']?.available_beds || 0}</p>
                      </div>
                      <div className="rounded-lg bg-slate-50 p-2 border border-slate-100">
                        <p className="font-black text-slate-500 uppercase">ATTACHED</p>
                        <p className="font-bold text-slate-900">{hostel.feature_summary?.attached?.available_beds || 0}</p>
                      </div>
                      <div className="rounded-lg bg-slate-50 p-2 border border-slate-100">
                        <p className="font-black text-slate-500 uppercase">COMMON</p>
                        <p className="font-bold text-slate-900">{hostel.feature_summary?.common?.available_beds || 0}</p>
                      </div>
                      <div className="rounded-lg bg-slate-50 p-2 border border-slate-100">
                        <p className="font-black text-slate-500 uppercase">3 SHARING</p>
                        <p className="font-bold text-slate-900">{hostel.feature_summary?.['3-sharing']?.available_beds || 0}</p>
                      </div>
                      <div className="rounded-lg bg-slate-50 p-2 border border-slate-100">
                        <p className="font-black text-slate-500 uppercase">4 SHARING</p>
                        <p className="font-bold text-slate-900">{hostel.feature_summary?.['4-sharing']?.available_beds || 0}</p>
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between text-xs text-slate-500 mb-1">
                        <span>Occupancy</span>
                        <span>{occupancyPct}%</span>
                      </div>
                      <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-[#5B7FED] to-[#4A6FD6] rounded-full transition-all"
                          style={{ width: `${occupancyPct}%` }}
                        />
                      </div>
                    </div>

                    <Button className="w-full mt-4 bg-[#5B7FED] hover:bg-[#4A6FD6] text-white transition-all">
                      Select This Hostel
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {step === 2 && selectedHostel && (
        <Card className="max-w-3xl mx-auto p-8 bg-white rounded-2xl shadow-lg">
          <div className="text-center mb-8">
            <div className="text-5xl mb-3">🏢</div>
            <h2 className="text-2xl font-bold text-slate-900 mb-2">
              {selectedHostel.hostel_name} - Block {selectedHostel.block}
            </h2>
            <p className="text-slate-500">Choose only the features you want. Floor will be assigned by admin later.</p>
          </div>

          <div className="space-y-8">
            <div>
              <Label className="text-lg font-semibold text-slate-900 mb-4 block">❄️ AC Preference</Label>
              <div className="grid grid-cols-2 gap-4">
                {[
                  { value: 'non-ac', label: 'Non-AC', desc: 'Standard room', icon: '🌤️' },
                  { value: 'ac', label: 'AC Room', desc: 'Air-conditioned', icon: '❄️' }
                ].map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setPreferences({ ...preferences, acType: option.value })}
                    className={`p-6 rounded-xl border-2 text-left transition-all ${
                      preferences.acType === option.value ? 'border-[#5B7FED] bg-blue-50 shadow-md' : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="text-3xl mb-2">{option.icon}</div>
                    <div className="font-semibold text-slate-900 mb-1">{option.label}</div>
                    <div className="text-xs text-slate-500">{option.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <Label className="text-lg font-semibold text-slate-900 mb-4 block">🚿 Washroom Preference</Label>
              <div className="grid grid-cols-2 gap-4">
                {[
                  { value: 'common', label: 'Common Washroom', desc: 'Shared facility', icon: '🚻' },
                  { value: 'attached', label: 'Attached Washroom', desc: 'Private facility', icon: '🚪' }
                ].map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setPreferences({ ...preferences, washroom: option.value })}
                    className={`p-6 rounded-xl border-2 text-left transition-all ${
                      preferences.washroom === option.value ? 'border-[#5B7FED] bg-blue-50 shadow-md' : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="text-3xl mb-2">{option.icon}</div>
                    <div className="font-semibold text-slate-900 mb-1">{option.label}</div>
                    <div className="text-xs text-slate-500">{option.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <Label className="text-lg font-semibold text-slate-900 mb-4 block">🛏️ Sharing Type</Label>
              <div className="grid grid-cols-2 gap-4">
                {[
                  { value: '3-sharing', label: '3 Bed Sharing', icon: '👥👤' },
                  { value: '4-sharing', label: '4 Bed Sharing', icon: '👥👥' }
                ].map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setPreferences({ ...preferences, roomType: option.value })}
                    className={`p-6 rounded-xl border-2 text-center transition-all ${
                      preferences.roomType === option.value ? 'border-[#5B7FED] bg-blue-50 shadow-md' : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="text-3xl mb-2">{option.icon}</div>
                    <div className="font-semibold text-slate-900">{option.label}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-xl bg-slate-50 border border-slate-100 p-4">
              <div className="flex items-center gap-3 mb-2">
                <ShieldCheck size={18} className="text-emerald-600" />
                <p className="font-semibold text-slate-900">Matching Availability</p>
              </div>
              <p className="text-sm text-slate-600">
                Available beds for this exact preference combination:
                <span className={`ml-2 font-black ${matchingAvailabilityForSelection > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                  {matchingAvailabilityForSelection}
                </span>
              </p>
            </div>

            <div className="rounded-2xl bg-gradient-to-br from-emerald-50 to-blue-50 border border-emerald-100 p-5">
              <div className="flex items-center gap-2 mb-4">
                <IndianRupee size={18} className="text-emerald-600" />
                <p className="font-bold text-slate-900">Estimated Hostel Cost</p>
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-600">Base Hostel Fee</span>
                  <span className="font-bold text-slate-900">₹{calculateBookingAmount.breakdown.hostelBase}</span>
                </div>

                <div className="flex justify-between">
                  <span className="text-slate-600">AC Charge</span>
                  <span className="font-bold text-slate-900">₹{calculateBookingAmount.breakdown.acCharge}</span>
                </div>

                <div className="flex justify-between">
                  <span className="text-slate-600">Washroom Charge</span>
                  <span className="font-bold text-slate-900">₹{calculateBookingAmount.breakdown.washroomCharge}</span>
                </div>

                <div className="flex justify-between">
                  <span className="text-slate-600">Sharing Type Charge</span>
                  <span className="font-bold text-slate-900">₹{calculateBookingAmount.breakdown.sharingCharge}</span>
                </div>

                <div className="border-t border-slate-200 pt-3 mt-3 flex justify-between">
                  <span className="font-black text-slate-900">Total Estimated Amount</span>
                  <span className="font-black text-emerald-600 text-lg">₹{calculateBookingAmount.totalAmount}</span>
                </div>
              </div>
            </div>

            <div>
              <Label className="text-lg font-semibold text-slate-900 mb-2 block">📝 Special Requests (Optional)</Label>
              <textarea
                value={preferences.specialRequests}
                onChange={(e) => setPreferences({ ...preferences, specialRequests: e.target.value })}
                className="w-full p-4 border-2 border-slate-200 rounded-xl focus:border-[#5B7FED] focus:outline-none resize-none"
                rows={4}
                placeholder="Mention medical needs, study environment preference, accessibility request, etc."
              />
            </div>
          </div>

          <div className="flex gap-4 mt-8">
            <Button variant="outline" onClick={() => setStep(1)} className="flex-1 py-3 border-2 border-slate-200">
              <ArrowLeft size={16} className="mr-2" /> Back
            </Button>
            <Button
              onClick={() => setStep(3)}
              disabled={matchingAvailabilityForSelection <= 0}
              className="flex-1 py-3 bg-[#5B7FED] text-white font-semibold"
            >
              Continue →
            </Button>
          </div>
        </Card>
      )}

      {step === 3 && (
        <Card className="max-w-3xl mx-auto p-8 bg-white rounded-2xl shadow-lg">
          <div className="text-center mb-8">
            <div className="text-5xl mb-3">🧠</div>
            <h2 className="text-2xl font-bold text-slate-900 mb-2">Personality & Roommate Features</h2>
            <p className="text-slate-500">These will help admin place compatible students together in the same room.</p>
          </div>

          <div className="space-y-8">
            <div>
              <Label className="text-lg font-semibold text-slate-900 mb-4 block">🌙 Sleep Schedule</Label>
              <div className="grid grid-cols-2 gap-4">
                {['early sleeper', 'night owl'].map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setPersonality({ ...personality, sleepSchedule: option })}
                    className={`p-5 rounded-xl border-2 transition-all ${
                      personality.sleepSchedule === option ? 'border-[#5B7FED] bg-blue-50 shadow-md' : 'border-slate-200'
                    }`}
                  >
                    <Moon size={18} className="mx-auto mb-2 text-[#5B7FED]" />
                    <div className="font-semibold capitalize">{option}</div>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <Label className="text-lg font-semibold text-slate-900 mb-4 block">📚 Study Habit</Label>
              <div className="grid grid-cols-2 gap-4">
                {['silent', 'group study'].map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setPersonality({ ...personality, studyHabits: option })}
                    className={`p-5 rounded-xl border-2 transition-all ${
                      personality.studyHabits === option ? 'border-[#5B7FED] bg-blue-50 shadow-md' : 'border-slate-200'
                    }`}
                  >
                    <BookOpen size={18} className="mx-auto mb-2 text-[#5B7FED]" />
                    <div className="font-semibold capitalize">{option}</div>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <Label className="text-lg font-semibold text-slate-900 mb-2 block">🧼 Cleanliness Level (1 to 5)</Label>
              <input
                type="range"
                min="1"
                max="5"
                value={personality.cleanliness}
                onChange={(e) => setPersonality({ ...personality, cleanliness: Number(e.target.value) })}
                className="w-full"
              />
              <p className="text-sm text-slate-600 mt-2 font-semibold">Selected: {personality.cleanliness} / 5</p>
            </div>

            <div>
              <Label className="text-lg font-semibold text-slate-900 mb-2 block">❤️ Likes</Label>
              <input
                value={personality.likesText}
                onChange={(e) => setPersonality({ ...personality, likesText: e.target.value })}
                className="w-full p-4 border-2 border-slate-200 rounded-xl focus:border-[#5B7FED] focus:outline-none"
                placeholder="Example: reading, music, sports, quiet room"
              />
            </div>

            <div>
              <Label className="text-lg font-semibold text-slate-900 mb-2 block">🙅 Dislikes</Label>
              <input
                value={personality.dislikesText}
                onChange={(e) => setPersonality({ ...personality, dislikesText: e.target.value })}
                className="w-full p-4 border-2 border-slate-200 rounded-xl focus:border-[#5B7FED] focus:outline-none"
                placeholder="Example: loud noise, late-night calls, messy room"
              />
            </div>

            <div>
              <Label className="text-lg font-semibold text-slate-900 mb-2 block">🎯 Hobbies / Features</Label>
              <input
                value={personality.hobbiesText}
                onChange={(e) => setPersonality({ ...personality, hobbiesText: e.target.value })}
                className="w-full p-4 border-2 border-slate-200 rounded-xl focus:border-[#5B7FED] focus:outline-none"
                placeholder="Example: night reading, coding, painting, gym"
              />
            </div>

            <div className="rounded-xl bg-pink-50 border border-pink-100 p-4">
              <div className="flex items-start gap-3">
                <Users size={18} className="text-pink-600 mt-0.5" />
                <div className="w-full">
                  <p className="font-semibold text-slate-900">Roommate Compatibility Support</p>
                  <p className="text-sm text-slate-600 mt-1">
                    Admin can use your sleep/study/cleanliness traits, likes and dislikes to assign compatible roommates.
                  </p>
                  <label className="flex items-center gap-2 mt-3 text-sm font-medium text-slate-700">
                    <input
                      type="checkbox"
                      checked={personality.isLooking}
                      onChange={(e) => setPersonality({ ...personality, isLooking: e.target.checked })}
                    />
                    Use my compatibility traits for room allocation
                  </label>
                </div>
              </div>
            </div>
          </div>

          <div className="flex gap-4 mt-8">
            <Button variant="outline" onClick={() => setStep(2)} className="flex-1 py-3 border-2 border-slate-200">
              <ArrowLeft size={16} className="mr-2" /> Back
            </Button>
            <Button onClick={handleSubmitBooking} disabled={loading} className="flex-1 py-3 bg-[#5B7FED] text-white font-semibold">
              {loading ? 'Saving...' : 'Continue to Payment →'}
            </Button>
          </div>
        </Card>
      )}

      {step === 4 && (
        <Card className="max-w-2xl mx-auto p-8 bg-white rounded-2xl shadow-xl overflow-hidden relative">
          <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-blue-400 via-[#5B7FED] to-purple-500" />
          <div className="text-center mb-8">
            <div className="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4 border-4 border-white shadow-sm">
              <CreditCard className="text-[#5B7FED]" size={34} />
            </div>
            <h2 className="text-2xl font-black text-slate-900 tracking-tight">Choose Payment Mode</h2>
            <p className="text-slate-500 text-sm mt-1">Booking will be blocked only after successful payment.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { value: 'upi', label: 'UPI', icon: '📱', desc: 'Scan and pay by UPI' },
              { value: 'card', label: 'Card', icon: '💳', desc: 'Use card after scanner screen' },
              { value: 'netbanking', label: 'Net Banking', icon: '🏦', desc: 'Bank transfer after QR reference' }
            ].map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setPaymentDetails((prev) => ({ ...prev, paymentMethod: option.value }))}
                className={`p-5 rounded-xl border-2 text-center transition-all ${
                  paymentDetails.paymentMethod === option.value ? 'border-[#5B7FED] bg-blue-50 shadow-md' : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="text-3xl mb-2">{option.icon}</div>
                <div className="font-semibold text-slate-900">{option.label}</div>
                <div className="text-xs text-slate-500 mt-1">{option.desc}</div>
              </button>
            ))}
          </div>

          <div className="mt-8 bg-slate-50 rounded-2xl p-6 text-left border border-slate-100">
            <div className="flex justify-between items-center mb-4">
              <span className="text-sm font-semibold text-slate-600">Booking Amount</span>
              <span className="text-2xl font-black text-slate-900">₹{paymentAmount}</span>
            </div>

            <div className="space-y-3 pt-4 border-t border-slate-200">
              <div className="flex items-center gap-3">
                <Building2 size={16} className="text-[#5B7FED]" />
                <div>
                  <p className="text-xs font-bold text-slate-800">{selectedHostel?.hostel_name} - Block {selectedHostel?.block}</p>
                  <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest">Selected Hostel</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Snowflake size={16} className="text-slate-600" />
                <div>
                  <p className="text-xs font-bold text-slate-800">{preferences.acType} • {preferences.roomType} • {preferences.washroom} washroom</p>
                  <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest">Preference Snapshot</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Users size={16} className="text-pink-600" />
                <div>
                  <p className="text-xs font-bold text-slate-800">{personality.sleepSchedule} • {personality.studyHabits} • Cleanliness {personality.cleanliness}/5</p>
                  <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest">Compatibility Snapshot</p>
                </div>
              </div>
            </div>
          </div>

          <Button onClick={handleGoToScanner} className="w-full mt-6 bg-slate-900 hover:bg-slate-800 text-white rounded-xl py-6 font-black tracking-widest hover:shadow-xl transition-all">
            Continue to Scanner
          </Button>
        </Card>
      )}

      {step === 5 && (
        <Card className="max-w-3xl mx-auto p-8 bg-white rounded-2xl shadow-xl overflow-hidden relative">
          <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-blue-400 via-[#5B7FED] to-purple-500" />

          <div className="text-center mb-6">
            <div className="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4 border-4 border-white shadow-sm">
              <QrCode className="text-[#5B7FED]" size={34} />
            </div>
            <h2 className="text-2xl font-black text-slate-900 tracking-tight">Complete Hostel Booking Payment</h2>
            <p className="text-slate-500 text-sm mt-1">Use the real-time Razorpay checkout gateway or scan the UPI QR code below.</p>
          </div>

          <div className="mb-6 p-4 rounded-2xl bg-gradient-to-r from-blue-600 to-[#5B7FED] text-white flex flex-col sm:flex-row items-center justify-between gap-4 shadow-lg">
            <div>
              <p className="font-black text-lg flex items-center gap-2">
                <span>⚡</span> Pay via Razorpay Live Gateway
              </p>
              <p className="text-xs text-blue-100 mt-0.5">Pay seamlessly with UPI (GPay, PhonePe, Paytm), Cards, or Net Banking</p>
            </div>
            <Button
              onClick={handleRazorpayHostelPayment}
              disabled={loading}
              className="bg-white text-[#5B7FED] hover:bg-slate-100 font-black px-6 py-2.5 rounded-xl shadow-md shrink-0 active:scale-95 transition-all"
            >
              Pay ₹{paymentAmount} with Razorpay
            </Button>
          </div>

          <div className="relative my-6 text-center">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-200"></div></div>
            <span className="relative bg-white px-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Or Pay Manually via UPI QR</span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-6 text-center">
              <img src={qrImageUrl} alt="UPI QR" className="w-[220px] h-[220px] mx-auto rounded-xl border border-slate-200 bg-white" />
              <div className="mt-4 space-y-2 text-sm">
                <p className="font-bold text-slate-900">UPI ID: {upiId}</p>
                <p className="text-slate-600">Merchant: {merchantName}</p>
                <p className="text-slate-600">Amount: ₹{paymentAmount}</p>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-100 bg-white p-6">
              <div className="space-y-4">
                <div>
                  <Label className="text-sm font-semibold text-slate-700 mb-2 block">Payment Method</Label>
                  <select
                    value={paymentDetails.paymentMethod}
                    onChange={(e) => setPaymentDetails((prev) => ({ ...prev, paymentMethod: e.target.value }))}
                    className="w-full p-3 border border-slate-200 rounded-xl bg-slate-50 outline-none"
                  >
                    <option value="upi">UPI</option>
                    <option value="card">Card</option>
                    <option value="netbanking">Net Banking</option>
                  </select>
                </div>

                <div>
                  <Label className="text-sm font-semibold text-slate-700 mb-2 block">Payer UPI ID / Account ID</Label>
                  <input
                    value={paymentDetails.payerUpi}
                    onChange={(e) => setPaymentDetails((prev) => ({ ...prev, payerUpi: e.target.value }))}
                    className="w-full p-3 border border-slate-200 rounded-xl bg-slate-50 outline-none"
                    placeholder="example@upi"
                  />
                </div>

                <div>
                  <Label className="text-sm font-semibold text-slate-700 mb-2 block">Transaction Reference / UTR</Label>
                  <input
                    value={paymentDetails.transactionRef}
                    onChange={(e) => setPaymentDetails((prev) => ({ ...prev, transactionRef: e.target.value }))}
                    className="w-full p-3 border border-slate-200 rounded-xl bg-slate-50 outline-none"
                    placeholder="Enter transaction reference"
                  />
                </div>

                <label className="flex items-center gap-3 p-3 rounded-xl bg-blue-50 border border-blue-100 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={paymentDetails.qrScanned}
                    onChange={(e) => setPaymentDetails((prev) => ({ ...prev, qrScanned: e.target.checked }))}
                  />
                  <span className="text-sm font-medium text-slate-700">
                    I scanned the QR and completed the payment
                  </span>
                </label>

                <div className="rounded-xl bg-slate-50 border border-slate-100 p-4">
                  <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest mb-2">Payment Notes</p>
                  <div className="space-y-2 text-sm text-slate-600">
                    <div className="flex items-center gap-2"><IndianRupee size={14} /> Booking is confirmed only after successful payment</div>
                    <div className="flex items-center gap-2"><Clock3 size={14} /> Pending/failed payments can be reopened in the Payments page</div>
                    <div className="flex items-center gap-2"><ShieldCheck size={14} /> Your selected hostel inventory will reduce only after successful payment</div>
                  </div>
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <Button variant="outline" onClick={() => setStep(4)} className="flex-1">
                  Back
                </Button>
                <Button onClick={handlePaymentConfirm} disabled={loading} className="flex-1 bg-slate-900 hover:bg-slate-800 text-white">
                  {loading ? 'Verifying...' : 'Confirm Payment'}
                </Button>
              </div>
            </div>
          </div>
        </Card>
      )}

      {step === 6 && (
        <Card className="max-w-2xl mx-auto p-12 text-center bg-white rounded-2xl shadow-lg">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <Check className="text-green-600" size={40} />
          </div>

          <h2 className="text-3xl font-bold text-slate-900 mb-3">
            {bookingStatus?.booking?.status === 'assigned' ? 'Room Assigned Successfully!' : 'Booking Confirmed!'}
          </h2>

          <div className="bg-slate-50 rounded-xl p-6 mb-8 text-left space-y-3">
            <h3 className="font-semibold text-slate-900 mb-4">
              Summary for {bookingStatus?.booking?.hostel_name || selectedHostel?.hostel_name}:
            </h3>
            <div className="flex justify-between text-sm"><span>Block:</span><span className="font-bold">{bookingStatus?.booking?.block || selectedHostel?.block}</span></div>
            <div className="flex justify-between text-sm"><span>AC Type:</span><span className="font-bold capitalize">{bookingStatus?.booking?.preferences?.acType || preferences.acType}</span></div>
            <div className="flex justify-between text-sm"><span>Washroom:</span><span className="font-bold capitalize">{bookingStatus?.booking?.preferences?.washroom || preferences.washroom}</span></div>
            <div className="flex justify-between text-sm"><span>Sharing Type:</span><span className="font-bold">{bookingStatus?.booking?.preferences?.roomType || preferences.roomType}</span></div>
            <div className="flex justify-between text-sm"><span>Total Paid:</span><span className="font-bold text-slate-900">₹{bookingStatus?.payment?.amount || paymentAmount}</span></div>
            <div className="flex justify-between text-sm"><span>Payment Status:</span><span className="font-bold text-emerald-600">{bookingStatus?.payment?.status || 'Success'}</span></div>

            {bookingStatus?.booking?.assigned_floor && (
              <>
                <div className="border-t border-slate-200 my-2" />
                <div className="flex justify-between text-sm"><span>Assigned Floor:</span><span className="font-bold">{bookingStatus.booking.assigned_floor}</span></div>
                <div className="flex justify-between text-sm"><span>Assigned Room:</span><span className="font-bold">{bookingStatus.booking.assigned_room_number}</span></div>
                <div className="flex justify-between text-sm"><span>Assigned Bed:</span><span className="font-bold">{bookingStatus.booking.assigned_bed_number}</span></div>
              </>
            )}
          </div>

          <div className="flex gap-4">
            <Button onClick={fetchExistingBooking} variant="outline" className="flex-1">
              Refresh Status
            </Button>
            <Button onClick={resetFlow} className="flex-1 bg-[#5B7FED] text-white px-8 py-3">
              Finish
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
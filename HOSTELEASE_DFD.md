"# HOSTELEASE - Data Flow Diagram (DFD) Documentation

## Project Overview
**HOSTELEASE** is a comprehensive hostel management system with separate portals for students and administrators to manage hostel operations including mess management, complaints, attendance, gatepasses, laundry services, bed bookings, and more.

---

## 📊 DFD HIERARCHY

### **LEVEL 0: CONTEXT DIAGRAM**

```
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│                        EXTERNAL ENTITIES                                │
│                                                                         │
│  ┌──────────┐      ┌──────────┐      ┌──────────┐    ┌──────────┐    │
│  │ Students │      │  Admin/  │      │ Parents  │    │ Visitors │    │
│  │          │      │  Warden  │      │          │    │          │    │
│  └────┬─────┘      └────┬─────┘      └────┬─────┘    └────┬─────┘    │
│       │                 │                  │               │           │
│       │                 │                  │               │           │
│       ▼                 ▼                  ▼               ▼           │
│  ┌────────────────────────────────────────────────────────────┐       │
│  │                                                            │       │
│  │              HOSTELEASE MANAGEMENT SYSTEM                  │       │
│  │                                                            │       │
│  │  • Authentication & Authorization                          │       │
│  │  • Student Profile Management                             │       │
│  │  • Bed Booking & Room Management                          │       │
│  │  • Mess Menu & Food Services                              │       │
│  │  • Complaints Management                                  │       │
│  │  • Payment & Fines System                                 │       │
│  │  • Gatepass Management                                    │       │
│  │  • Laundry Services                                       │       │
│  │  • Attendance Tracking                                    │       │
│  │  • Notifications System                                   │       │
│  │  • Visitor Management                                     │       │
│  │  • Analytics & Reporting                                  │       │
│  │                                                            │       │
│  └────┬───────────────────────────────────────────────┬───────┘       │
│       │                                               │               │
│       ▼                                               ▼               │
│  ┌─────────────┐                                ┌──────────────┐     │
│  │   MongoDB   │                                │   External   │     │
│  │  Database   │                                │   Services   │     │
│  │             │                                │              │     │
│  │ • users     │                                │ • Twilio     │     │
│  │ • bookings  │                                │ • Resend     │     │
│  │ • mess_menu │                                │ • Gemini AI  │
│  │ • complaints│                                │ • Razorpay   │     │
│  │ • payments  │                                │              │     │
│  │ • attendance│                                └──────────────┘     │
│  │ • laundry   │                                                     │
│  │ • gatepasses│                                                     │
│  │ • notifs    │                                                     │
│  └─────────────┘                                                     │
│                                                                       │
└───────────────────────────────────────────────────────────────────────┘
```

**External Entities:**
1. **Students** - Access student portal features
2. **Admin/Warden** - Manage hostel operations
3. **Parents** - Receive attendance/gatepass notifications
4. **Visitors** - Check-in/out at hostel

**Data Stores:**
1. **MongoDB Database** - All application data
2. **External Services** - Third-party integrations

---

## 📋 LEVEL 1: MAIN SYSTEM PROCESSES

```
┌────────────────────────────────────────────────────────────────────────────────┐
│                                                                                │
│  STUDENTS ──────┐                                  ┌────────── ADMIN/WARDEN   │
│                 │                                  │                           │
│                 ▼                                  ▼                           │
│           ┌──────────────────────────────────────────────┐                    │
│           │   1.0 AUTHENTICATION & AUTHORIZATION         │                    │
│           │   • Login/Register                           │                    │
│           │   • Password Reset (OTP)                     │                    │
│           │   • 2FA/TOTP                                 │                    │
│           │   • JWT Token Management                     │                    │
│           │   • Session Management                       │                    │
│           └──────────────┬───────────────────────────────┘                    │
│                          │ Auth Token                                         │
│                          │                                                    │
│           ┌──────────────┴───────────────────────────────┐                    │
│           │   2.0 STUDENT PROFILE MANAGEMENT             │                    │
│           │   • View/Update Profile                      │                    │
│           │   • Password Change                          │                    │
│           │   • View Roommate Info                       │                    │
│           │   • Academic & Contact Details               │                    │
│           └──────────────┬───────────────────────────────┘                    │
│                          │                                                    │
│           ┌──────────────┴───────────────────────────────┐                    │
│           │   3.0 BED BOOKING & ROOM MANAGEMENT          │                    │
│           │   • View Bed Availability                    │                    │
│           │   • Book Hostel Room                         │                    │
│           │   • Request Bed Swap                         │                    │
│           │   • Payment for Booking                      │                    │
│           │   • Room Assignment (Admin)                  │                    │
│           └──────────────┬───────────────────────────────┘                    │
│                          │                                                    │
│           ┌──────────────┴───────────────────────────────┐                    │
│           │   4.0 MESS MENU & FOOD SERVICES              │                    │
│           │   • View Weekly Menu                         │                    │
│           │   • Submit Food Feedback                     │                    │
│           │   • Vote for Food Items                      │                    │
│           │   • AI Feedback Analysis (Gemini)            │                    │
│           │   • Menu Management (Admin)                  │                    │
│           └──────────────┬───────────────────────────────┘                    │
│                          │                                                    │
│           ┌──────────────┴───────────────────────────────┐                    │
│           │   5.0 COMPLAINTS MANAGEMENT                  │                    │
│           │   • Submit Complaint (with Image)            │                    │
│           │   • View Complaint Status                    │                    │
│           │   • Resolve Complaints (Admin)               │                    │
│           │   • Export Reports                           │                    │
│           └──────────────┬───────────────────────────────┘                    │
│                          │                                                    │
│           ┌──────────────┴───────────────────────────────┐                    │
│           │   6.0 PAYMENT & FINES MANAGEMENT             │                    │
│           │   • View Payment History                     │                    │
│           │   • Pay Fines                                │                    │
│           │   • Issue Fines (Admin)                      │                    │
│           │   • Payment Gateway (Razorpay)               │                    │
│           │   • Late Fee Calculation                     │                    │
│           └──────────────┬───────────────────────────────┘                    │
│                          │                                                    │
│           ┌──────────────┴───────────────────────────────┐                    │
│           │   7.0 GATEPASS MANAGEMENT                    │                    │
│           │   • Apply for Gatepass                       │                    │
│           │   • Track Status                             │                    │
│           │   • Approve/Reject (Admin)                   │                    │
│           │   • Overdue Alerts                           │                    │
│           │   • Send Notifications to Parents            │                    │
│           └──────────────┬───────────────────────────────┘                    │
│                          │                                                    │
│           ┌──────────────┴───────────────────────────────┐                    │
│           │   8.0 LAUNDRY SERVICES                       │                    │
│           │   • View Machine Availability                │                    │
│           │   • Book Laundry Slot                        │                    │
│           │   • Wallet Management                        │                    │
│           │   • Payment Processing                       │                    │
│           │   • Machine Status Monitoring                │                    │
│           │   • Complaint Management                     │                    │
│           └──────────────┬───────────────────────────────┘                    │
│                          │                                                    │
│           ┌──────────────┴───────────────────────────────┐                    │
│           │   9.0 ATTENDANCE MANAGEMENT                  │                    │
│           │   • Mark Attendance (Biometric)              │                    │
│           │   • View Attendance History                  │                    │
│           │   • Request Corrections                      │                    │
│           │   • Bulk Marking (Admin)                     │                    │
│           │   • Analytics & Reports                      │                    │
│           │   • Defaulter Notifications                  │                    │
│           └──────────────┬───────────────────────────────┘                    │
│                          │                                                    │
│           ┌──────────────┴───────────────────────────────┐                    │
│           │   10.0 NOTIFICATIONS SYSTEM                  │                    │
│           │   • Create Notifications (Admin)             │                    │
│           │   • View Notifications (Students)            │                    │
│           │   • SMS/Email Delivery (Twilio/Resend)       │                    │
│           │   • Read Status Tracking                     │                    │
│           │   • Analytics                                │                    │
│           └──────────────┬───────────────────────────────┘                    │
│                          │                                                    │
│           ┌──────────────┴───────────────────────────────┐                    │
│           │   11.0 VISITOR MANAGEMENT                    │                    │
│           │   • Visitor Check-in                         │                    │
│           │   • Visitor Check-out                        │                    │
│           │   • QR Code Generation                       │                    │
│           │   • Blacklist Management                     │                    │
│           │   • Visit Logs & Reports                     │                    │
│           └──────────────┬───────────────────────────────┘                    │
│                          │                                                    │
│           ┌──────────────┴───────────────────────────────┐                    │
│           │   12.0 ADMIN DASHBOARD & ANALYTICS           │                    │
│           │   • System Statistics                        │                    │
│           │   • Occupancy Reports                        │                    │
│           │   • Financial Reports                        │                    │
│           │   • Participation Analytics                  │                    │
│           │   • Export Data (CSV/PDF)                    │                    │
│           └──────────────────────────────────────────────┘                    │
│                                                                                │
└────────────────────────────────────────────────────────────────────────────────┘
```

---

## 🔐 LEVEL 2: DETAILED PROCESS FLOWS

### **2.1 AUTHENTICATION & AUTHORIZATION (Process 1.0)**

```
┌───────────────────────────────────────────────────────────────────────────┐
│                                                                           │
│  STUDENT/ADMIN                                                            │
│       │                                                                   │
│       │ Login Request                                                     │
│       ▼                                                                   │
│  ┌─────────────────────────┐                                             │
│  │ 1.1 Validate            │                                             │
│  │ Credentials             │◄──── D1: users                              │
│  └──────┬──────────────────┘                                             │
│         │ Valid?                                                          │
│         │                                                                 │
│    ┌────┴────┐                                                            │
│    │   NO    │                                                            │
│    │         │                                                            │
│    │  Return │                                                            │
│    │  Error  │                                                            │
│    └─────────┘                                                            │
│         │ YES                                                             │
│         ▼                                                                 │
│  ┌─────────────────────────┐                                             │
│  │ 1.2 Check 2FA           │                                             │
│  │ Enabled?                │◄──── D2: security_preferences               │
│  └──────┬──────────────────┘                                             │
│         │                                                                 │
│    ┌────┴────┐                                                            │
│    │   YES   │                 │   NO                                     │
│    │         │                 │                                          │
│    ▼         │                 ▼                                          │
│  ┌─────────────────┐     ┌─────────────────┐                             │
│  │ 1.3 Generate    │     │ 1.5 Generate    │                             │
│  │ & Send OTP      │     │ JWT Token       │                             │
│  │                 │     │                 │                             │
│  └────┬────────────┘     └────┬────────────┘                             │
│       │                       │                                           │
│       │ OTP                   │ Token                                     │
│       ▼                       │                                           │
│  ┌─────────────────┐          │                                           │
│  │ Twilio/Resend   │          │                                           │
│  │ (SMS/Email)     │          │                                           │
│  └─────────────────┘          │                                           │
│       │                       │                                           │
│       │ User enters OTP       │                                           │
│       ▼                       │                                           │
│  ┌─────────────────┐          │                                           │
│  │ 1.4 Verify      │          │                                           │
│  │ OTP/TOTP        │◄──── D3: otps                                        │
│  └────┬────────────┘          │                                           │
│       │ Valid?                │                                           │
│       │ YES                   │                                           │
│       ▼                       │                                           │
│  ┌─────────────────┐          │                                           │
│  │ 1.5 Generate    │          │                                           │
│  │ JWT Token       │          │                                           │
│  └────┬────────────┘          │                                           │
│       │                       │                                           │
│       └───────┬───────────────┘                                           │
│               ▼                                                           │
│       ┌──────────────────┐                                                │
│       │ 1.6 Create       │                                                │
│       │ Session Record   │───► D4: admin_sessions                         │
│       └──────┬───────────┘                                                │
│              │                                                            │
│              │ Access Token + User Data                                   │
│              ▼                                                            │
│          USER AUTHENTICATED                                               │
│                                                                           │
└───────────────────────────────────────────────────────────────────────────┘

**Data Flows:**
- Login credentials → Validate Credentials
- User data ← MongoDB (users collection)
- OTP → SMS/Email service (Twilio/Resend)
- JWT Token → Client
- Session data → MongoDB (admin_sessions)

**Data Stores:**
- D1: users - User credentials and profile
- D2: security_preferences - 2FA settings
- D3: otps - One-time passwords
- D4: admin_sessions - Active sessions
```

---

### **2.2 BED BOOKING & ROOM MANAGEMENT (Process 3.0)**

```
┌───────────────────────────────────────────────────────────────────────────┐
│                                                                           │
│  STUDENT                                                                  │
│     │                                                                     │
│     │ View Availability Request                                           │
│     ▼                                                                     │
│  ┌─────────────────────────┐                                             │
│  │ 3.1 Get Bed             │                                             │
│  │ Availability            │◄──── D1: hostel_beds                        │
│  └──────┬──────────────────┘                                             │
│         │                                                                 │
│         │ Availability Data                                               │
│         ▼                                                                 │
│     STUDENT                                                               │
│         │                                                                 │
│         │ Book Bed Request (hostel, block, room)                          │
│         ▼                                                                 │
│  ┌─────────────────────────┐                                             │
│  │ 3.2 Validate            │                                             │
│  │ Booking Request         │                                             │
│  │ • Check availability    │◄──── D2: bookings                           │
│  │ • Check student status  │◄──── D3: users                              │
│  └──────┬──────────────────┘                                             │
│         │                                                                 │
│    ┌────┴────┐                                                            │
│    │ Valid?  │                                                            │
│    │   NO    │                                                            │
│    │  Error  │                                                            │
│    └─────────┘                                                            │
│         │ YES                                                             │
│         ▼                                                                 │
│  ┌─────────────────────────┐                                             │
│  │ 3.3 Create              │                                             │
│  │ Booking Record          │───► D4: bookings                            │
│  │ (status: pending)       │                                             │
│  └──────┬──────────────────┘                                             │
│         │                                                                 │
│         │ Booking ID                                                      │
│         ▼                                                                 │
│  ┌─────────────────────────┐                                             │
│  │ 3.4 Generate            │                                             │
│  │ Payment Order           │                                             │
│  │ (Razorpay)              │───► Razorpay API                            │
│  └──────┬──────────────────┘                                             │
│         │                                                                 │
│         │ Payment Details                                                 │
│         ▼                                                                 │
│     STUDENT                                                               │
│         │                                                                 │
│         │ Complete Payment                                                │
│         ▼                                                                 │
│  ┌─────────────────────────┐                                             │
│  │ 3.5 Verify              │                                             │
│  │ Payment                 │◄──── Razorpay Webhook                       │
│  └──────┬──────────────────┘                                             │
│         │                                                                 │
│    ┌────┴────┐                                                            │
│    │Success? │                                                            │
│    │         │                                                            │
│    │   YES   │                                                            │
│    ▼         │                                                            │
│  ┌─────────────────────────┐                                             │
│  │ 3.6 Update              │                                             │
│  │ Booking Status          │                                             │
│  │ (confirmed)             │───► D5: bookings                            │
│  │                         │                                             │
│  │ Update Bed Count        │───► D6: hostel_beds                         │
│  │ (occupied++)            │                                             │
│  └──────┬──────────────────┘                                             │
│         │                                                                 │
│         │                                                                 │
│         ▼                                                                 │
│  ┌─────────────────────────┐                                             │
│  │ 3.7 Admin Assigns       │                                             │
│  │ Room & Bed              │───► D7: users                               │
│  │ (updates user profile)  │                                             │
│  └──────┬──────────────────┘                                             │
│         │                                                                 │
│         │ Confirmation                                                    │
│         ▼                                                                 │
│     STUDENT                                                               │
│                                                                           │
│  ┌─────────────────────────────────────────────────┐                     │
│  │  BED SWAP REQUEST FLOW                          │                     │
│  └─────────────────────────────────────────────────┘                     │
│                                                                           │
│  STUDENT                                                                  │
│     │                                                                     │
│     │ Swap Request (current bed → desired bed)                            │
│     ▼                                                                     │
│  ┌─────────────────────────┐                                             │
│  │ 3.8 Create              │                                             │
│  │ Swap Request            │───► D8: swap_requests                       │
│  └──────┬──────────────────┘                                             │
│         │                                                                 │
│         │ Pending Approval                                                │
│         ▼                                                                 │
│     ADMIN                                                                 │
│         │                                                                 │
│         │ Review Swap                                                     │
│         ▼                                                                 │
│  ┌─────────────────────────┐                                             │
│  │ 3.9 Approve/Reject      │                                             │
│  │ Swap Request            │                                             │
│  └──────┬──────────────────┘                                             │
│         │                                                                 │
│    ┌────┴────┐                                                            │
│    │Approved?│                                                            │
│    │   YES   │                                                            │
│    ▼         │                                                            │
│  ┌─────────────────────────┐                                             │
│  │ 3.10 Execute            │                                             │
│  │ Bed Swap                │                                             │
│  │ • Update user records   │───► D9: users                               │
│  │ • Update bed count      │───► D10: hostel_beds                        │
│  │ • Update swap status    │───► D11: swap_requests                      │
│  └──────┬──────────────────┘                                             │
│         │                                                                 │
│         │ Notification                                                    │
│         ▼                                                                 │
│     STUDENT                                                               │
│                                                                           │
└───────────────────────────────────────────────────────────────────────────┘

**Data Flows:**
- Availability query → Get Bed Availability
- Bed data ← MongoDB (hostel_beds)
- Booking request → Create Booking
- Payment data → Razorpay
- Confirmation ← Payment verification
- Room assignment → Update User Profile

**Data Stores:**
- D1: hostel_beds - Bed availability by hostel/block/floor
- D2: bookings - Booking records
- D3: users - Student information
- D4-D7: Same as above (booking flow)
- D8: swap_requests - Bed swap requests
- D9-D11: users, hostel_beds, swap_requests
```

---

### **2.3 MESS MENU & FOOD SERVICES (Process 4.0)**

```
┌───────────────────────────────────────────────────────────────────────────┐
│                                                                           │
│  ┌───────────────────────────────────────────────┐                       │
│  │  MESS MENU MANAGEMENT (Admin)                 │                       │
│  └───────────────────────────────────────────────┘                       │
│                                                                           │
│  ADMIN                                                                    │
│     │                                                                     │
│     │ Create/Update Menu                                                  │
│     ▼                                                                     │
│  ┌─────────────────────────┐                                             │
│  │ 4.1 Manage              │                                             │
│  │ Weekly Menu             │───► D1: mess_menu                           │
│  │ • Day-wise items        │                                             │
│  │ • Breakfast/Lunch/Dinner│                                             │
│  │ • Import from CSV/Text  │                                             │
│  │ • Templates             │───► D2: mess_templates                      │
│  └──────┬──────────────────┘                                             │
│         │                                                                 │
│         │ Menu Published                                                  │
│         ▼                                                                 │
│  ┌─────────────────────────┐                                             │
│  │ 4.2 Create Audit        │                                             │
│  │ Log Entry               │───► D3: mess_audit_log                      │
│  └─────────────────────────┘                                             │
│                                                                           │
│  ┌───────────────────────────────────────────────┐                       │
│  │  STUDENT VIEW & FEEDBACK                      │                       │
│  └───────────────────────────────────────────────┘                       │
│                                                                           │
│  STUDENT                                                                  │
│     │                                                                     │
│     │ View Menu                                                           │
│     ▼                                                                     │
│  ┌─────────────────────────┐                                             │
│  │ 4.3 Get Weekly          │                                             │
│  │ Menu                    │◄──── D4: mess_menu                          │
│  └──────┬──────────────────┘                                             │
│         │                                                                 │
│         │ Display Menu                                                    │
│         ▼                                                                 │
│     STUDENT                                                               │
│         │                                                                 │
│         │ Submit Feedback (rating, meal_type, suggestions)                │
│         ▼                                                                 │
│  ┌─────────────────────────┐                                             │
│  │ 4.4 Save                │                                             │
│  │ Food Feedback           │───► D5: food_feedback                       │
│  │ • Anonymous option      │───► D6: anonymous_feedback                  │
│  │ • Rating (1-5)          │                                             │
│  │ • Suggestions           │                                             │
│  └──────┬──────────────────┘                                             │
│         │                                                                 │
│         │ Feedback Saved                                                  │
│         ▼                                                                 │
│     STUDENT                                                               │
│                                                                           │
│  ┌───────────────────────────────────────────────┐                       │
│  │  AI-POWERED FEEDBACK ANALYSIS                 │                       │
│  └───────────────────────────────────────────────┘                       │
│                                                                           │
│  ADMIN                                                                    │
│     │                                                                     │
│     │ Trigger AI Analysis                                                 │
│     ▼                                                                     │
│  ┌─────────────────────────┐                                             │
│  │ 4.5 Fetch All           │                                             │
│  │ Feedback                │◄──── D7: food_feedback                      │
│  │                         │◄──── D8: anonymous_feedback                 │
│  └──────┬──────────────────┘                                             │
│         │                                                                 │
│         │ All Suggestions                                                 │
│         ▼                                                                 │
│  ┌─────────────────────────┐                                             │
│  │ 4.6 Send to             │                                             │
│  │ Google Gemini 2.5       │───► Gemini API                              │
│  │ for Analysis            │                                             │
│  │ • Extract top items     │                                             │
│  │ • Identify patterns     │                                             │
│  └──────┬──────────────────┘                                             │
│         │                                                                 │
│         │ AI Response (Top 10 items)                                      │
│         ▼                                                                 │
│  ┌─────────────────────────┐                                             │
│  │ 4.7 Create              │                                             │
│  │ Voting Items            │───► D9: voting_items                        │
│  │ • Extract items         │                                             │
│  │ • Set status: active    │                                             │
│  │ • Vote count: 0         │                                             │
│  └──────┬──────────────────┘                                             │
│         │                                                                 │
│         │ Voting Items Created                                            │
│         ▼                                                                 │
│     ADMIN                                                                 │
│                                                                           │
│  ┌───────────────────────────────────────────────┐                       │
│  │  FOOD VOTING SYSTEM                           │                       │
│  └───────────────────────────────────────────────┘                       │
│                                                                           │
│  STUDENT                                                                  │
│     │                                                                     │
│     │ View Voting Items (9 PM - 10 PM only)                               │
│     ▼                                                                     │
│  ┌─────────────────────────┐                                             │
│  │ 4.8 Get Active          │                                             │
│  │ Voting Items            │◄──── D10: voting_items                      │
│  └──────┬──────────────────┘                                             │
│         │                                                                 │
│         │ Display Items                                                   │
│         ▼                                                                 │
│     STUDENT                                                               │
│         │                                                                 │
│         │ Cast Vote                                                       │
│         ▼                                                                 │
│  ┌─────────────────────────┐                                             │
│  │ 4.9 Validate            │                                             │
│  │ Voting Rules            │                                             │
│  │ • Time window check     │                                             │
│  │ • One vote per day      │◄──── D11: votes                             │
│  │ • Student authenticated │                                             │
│  └──────┬──────────────────┘                                             │
│         │                                                                 │
│    ┌────┴────┐                                                            │
│    │ Valid?  │                                                            │
│    │   YES   │                                                            │
│    ▼         │                                                            │
│  ┌─────────────────────────┐                                             │
│  │ 4.10 Record Vote        │                                             │
│  │ • Save vote record      │───► D12: votes                              │
│  │ • Increment vote count  │───► D13: voting_items                       │
│  └──────┬──────────────────┘                                             │
│         │                                                                 │
│         │ Confirmation                                                    │
│         ▼                                                                 │
│     STUDENT                                                               │
│                                                                           │
│  ┌───────────────────────────────────────────────┐                       │
│  │  VOTING RESULTS & ANALYTICS                   │                       │
│  └───────────────────────────────────────────────┘                       │
│                                                                           │
│  ADMIN/STUDENT                                                            │
│     │                                                                     │
│     │ View Results                                                        │
│     ▼                                                                     │
│  ┌─────────────────────────┐                                             │
│  │ 4.11 Generate           │                                             │
│  │ Voting Results          │◄──── D14: voting_items                      │
│  │ • Ranked by votes       │◄──── D15: votes                             │
│  │ • Percentage calc       │                                             │
│  │ • Participation stats   │                                             │
│  └──────┬──────────────────┘                                             │
│         │                                                                 │
│         │ Results Data                                                    │
│         ▼                                                                 │
│     ADMIN/STUDENT                                                         │
│                                                                           │
└───────────────────────────────────────────────────────────────────────────┘

**Data Flows:**
- Menu data → MongoDB (mess_menu)
- Feedback → MongoDB (food_feedback)
- Suggestions → Google Gemini AI API
- AI analysis → Voting items
- Vote → Update vote count
- Results ← Aggregate votes

**Data Stores:**
- D1: mess_menu - Weekly menu items
- D2: mess_templates - Saved templates
- D3: mess_audit_log - Change history
- D4-D8: food_feedback, anonymous_feedback
- D9-D15: voting_items, votes

**External Services:**
- OpenAI GPT-4o for feedback analysis
```

---

### **2.4 LAUNDRY SERVICES (Process 8.0)**

```
┌───────────────────────────────────────────────────────────────────────────┐
│                                                                           │
│  ┌───────────────────────────────────────────────┐                       │
│  │  LAUNDRY WALLET MANAGEMENT                    │                       │
│  └───────────────────────────────────────────────┘                       │
│                                                                           │
│  STUDENT                                                                  │
│     │                                                                     │
│     │ View Wallet Balance                                                 │
│     ▼                                                                     │
│  ┌─────────────────────────┐                                             │
│  │ 8.1 Get/Create          │                                             │
│  │ Wallet                  │◄──── D1: laundry_wallets                    │
│  └──────┬──────────────────┘                                             │
│         │                                                                 │
│         │ Balance Info                                                    │
│         ▼                                                                 │
│     STUDENT                                                               │
│         │                                                                 │
│         │ Top-up Wallet                                                   │
│         ▼                                                                 │
│  ┌─────────────────────────┐                                             │
│  │ 8.2 Create              │                                             │
│  │ Payment Order           │───► Razorpay API                            │
│  │ (Razorpay)              │                                             │
│  └──────┬──────────────────┘                                             │
│         │                                                                 │
│         │ Payment Details                                                 │
│         ▼                                                                 │
│     STUDENT                                                               │
│         │                                                                 │
│         │ Complete Payment                                                │
│         ▼                                                                 │
│  ┌─────────────────────────┐                                             │
│  │ 8.3 Verify              │                                             │
│  │ Payment                 │◄──── Razorpay Webhook                       │
│  └──────┬──────────────────┘                                             │
│         │                                                                 │
│    ┌────┴────┐                                                            │
│    │Success? │                                                            │
│    │   YES   │                                                            │
│    ▼         │                                                            │
│  ┌─────────────────────────┐                                             │
│  │ 8.4 Credit              │                                             │
│  │ Wallet                  │                                             │
│  │ • Update balance        │───► D2: laundry_wallets                     │
│  │ • Create transaction    │───► D3: laundry_wallet_transactions         │
│  └──────┬──────────────────┘                                             │
│         │                                                                 │
│         │ Confirmation                                                    │
│         ▼                                                                 │
│     STUDENT                                                               │
│                                                                           │
│  ┌───────────────────────────────────────────────┐                       │
│  │  MACHINE AVAILABILITY & BOOKING               │                       │
│  └───────────────────────────────────────────────┘                       │
│                                                                           │
│  STUDENT                                                                  │
│     │                                                                     │
│     │ View Machines                                                       │
│     ▼                                                                     │
│  ┌─────────────────────────┐                                             │
│  │ 8.5 Get Laundry         │                                             │
│  │ Machines                │◄──── D4: laundry_machines                   │
│  │ • Filter by hostel      │                                             │
│  │ • Filter by block       │                                             │
│  │ • Status (available/    │                                             │
│  │   in-use/maintenance)   │                                             │
│  └──────┬──────────────────┘                                             │
│         │                                                                 │
│         │ Machine List with Status                                        │
│         ▼                                                                 │
│     STUDENT                                                               │
│         │                                                                 │
│         │ Book Machine                                                    │
│         ▼                                                                 │
│  ┌─────────────────────────┐                                             │
│  │ 8.6 Validate            │                                             │
│  │ Booking                 │                                             │
│  │ • Machine available?    │◄──── D5: laundry_machines                   │
│  │ • Sufficient balance?   │◄──── D6: laundry_wallets                    │
│  │ • Active bookings?      │◄──── D7: laundry_bookings                   │
│  └──────┬──────────────────┘                                             │
│         │                                                                 │
│    ┌────┴────┐                                                            │
│    │ Valid?  │                                                            │
│    │   YES   │                                                            │
│    ▼         │                                                            │
│  ┌─────────────────────────┐                                             │
│  │ 8.7 Create              │                                             │
│  │ Booking                 │                                             │
│  │ • Debit wallet (₹50)    │───► D8: laundry_wallets                     │
│  │ • Create booking        │───► D9: laundry_bookings                    │
│  │ • Update machine status │───► D10: laundry_machines                   │
│  │ • Set start/end time    │                                             │
│  │   (45 min cycle)        │                                             │
│  └──────┬──────────────────┘                                             │
│         │                                                                 │
│         │ Booking Confirmation                                            │
│         ▼                                                                 │
│     STUDENT                                                               │
│                                                                           │
│  ┌───────────────────────────────────────────────┐                       │
│  │  AUTOMATED CYCLE MONITORING                   │                       │
│  └───────────────────────────────────────────────┘                       │
│                                                                           │
│  ┌─────────────────────────┐                                             │
│  │ 8.8 Scheduled Job       │                                             │
│  │ (Every 1 minute)        │                                             │
│  │ • Check active bookings │◄──── D11: laundry_bookings                  │
│  │ • Calculate remaining   │                                             │
│  │   time                  │                                             │
│  └──────┬──────────────────┘                                             │
│         │                                                                 │
│    ┌────┴────────┐                                                        │
│    │ Cycle       │                                                        │
│    │ Complete?   │                                                        │
│    │     YES     │                                                        │
│    ▼             │                                                        │
│  ┌─────────────────────────┐                                             │
│  │ 8.9 Complete            │                                             │
│  │ Booking                 │                                             │
│  │ • Update status         │───► D12: laundry_bookings                   │
│  │ • Free machine          │───► D13: laundry_machines                   │
│  │ • Send notification     │───► D14: notifications                      │
│  └──────┬──────────────────┘                                             │
│         │                                                                 │
│         │ Notification                                                    │
│         ▼                                                                 │
│  ┌─────────────────────────┐                                             │
│  │ Twilio/Resend           │                                             │
│  │ (SMS/Email)             │                                             │
│  │ \"Laundry Complete\"      │                                             │
│  └─────────────────────────┘                                             │
│         │                                                                 │
│         │ Alert                                                           │
│         ▼                                                                 │
│     STUDENT                                                               │
│                                                                           │
│  ┌───────────────────────────────────────────────┐                       │
│  │  LAUNDRY COMPLAINTS                           │                       │
│  └───────────────────────────────────────────────┘                       │
│                                                                           │
│  STUDENT                                                                  │
│     │                                                                     │
│     │ Submit Complaint                                                    │
│     │ (missing clothes, machine issue, etc.)                              │
│     ▼                                                                     │
│  ┌─────────────────────────┐                                             │
│  │ 8.10 Create             │                                             │
│  │ Laundry Complaint       │───► D15: laundry_complaints                 │
│  │ • Description           │                                             │
│  │ • Missing clothes count │                                             │
│  │ • Image upload          │                                             │
│  └──────┬──────────────────┘                                             │
│         │                                                                 │
│         │ Complaint ID                                                    │
│         ▼                                                                 │
│     ADMIN                                                                 │
│         │                                                                 │
│         │ Review & Resolve                                                │
│         ▼                                                                 │
│  ┌─────────────────────────┐                                             │
│  │ 8.11 Process            │                                             │
│  │ Complaint               │                                             │
│  │ • Update status         │───► D16: laundry_complaints                 │
│  │ • Issue refund if needed│───► D17: laundry_wallets                    │
│  └──────┬──────────────────┘                                             │
│         │                                                                 │
│         │ Resolution Notification                                         │
│         ▼                                                                 │
│     STUDENT                                                               │
│                                                                           │
│  ┌───────────────────────────────────────────────┐                       │
│  │  ADMIN MACHINE MANAGEMENT                     │                       │
│  └───────────────────────────────────────────────┘                       │
│                                                                           │
│  ADMIN                                                                    │
│     │                                                                     │
│     │ Manage Machines                                                     │
│     ▼                                                                     │
│  ┌─────────────────────────┐                                             │
│  │ 8.12 Update             │                                             │
│  │ Machine Status          │                                             │
│  │ • Mark maintenance      │───► D18: laundry_machines                   │
│  │ • Upload photos         │───► D19: uploads/laundry_machines           │
│  │ • Health monitoring     │                                             │
│  │ • Usage analytics       │                                             │
│  └─────────────────────────┘                                             │
│                                                                           │
└───────────────────────────────────────────────────────────────────────────┘

**Data Flows:**
- Wallet query → Get wallet balance
- Top-up request → Razorpay
- Payment confirmation → Credit wallet
- Machine query → Get available machines
- Booking → Debit wallet, Update machine status
- Cycle complete → Free machine, Send notification
- Complaint → Save complaint record

**Data Stores:**
- D1-D3: laundry_wallets, laundry_wallet_transactions
- D4-D13: laundry_machines, laundry_bookings
- D14: notifications
- D15-D17: laundry_complaints, laundry_wallets
- D18-D19: laundry_machines, file uploads

**External Services:**
- Razorpay for payments
- Twilio/Resend for SMS/Email notifications
- Scheduled jobs for cycle monitoring
```

---

### **2.5 ATTENDANCE MANAGEMENT (Process 9.0)**

```
┌───────────────────────────────────────────────────────────────────────────┐
│                                                                           │
│  ┌───────────────────────────────────────────────┐                       │
│  │  STUDENT ATTENDANCE MARKING                   │                       │
│  └───────────────────────────────────────────────┘                       │
│                                                                           │
│  STUDENT                                                                  │
│     │                                                                     │
│     │ Mark Attendance (Biometric Simulation)                              │
│     ▼                                                                     │
│  ┌─────────────────────────┐                                             │
│  │ 9.1 Validate            │                                             │
│  │ Attendance Request      │                                             │
│  │ • Check time            │                                             │
│  │ • Already marked?       │◄──── D1: attendance                         │
│  │ • Student authenticated │                                             │
│  └──────┬──────────────────┘                                             │
│         │                                                                 │
│    ┌────┴────┐                                                            │
│    │ Valid?  │                                                            │
│    │   YES   │                                                            │
│    ▼         │                                                            │
│  ┌─────────────────────────┐                                             │
│  │ 9.2 Determine           │                                             │
│  │ Attendance Status       │                                             │
│  │ • Before 9:30 AM →      │                                             │
│  │   \"present\"             │                                             │
│  │ • After 9:30 AM →       │                                             │
│  │   \"late\"                │                                             │
│  └──────┬──────────────────┘                                             │
│         │                                                                 │
│         ▼                                                                 │
│  ┌─────────────────────────┐                                             │
│  │ 9.3 Save                │                                             │
│  │ Attendance Record       │───► D2: attendance                          │
│  │ • student_id            │                                             │
│  │ • date                  │                                             │
│  │ • time                  │                                             │
│  │ • status                │                                             │
│  └──────┬──────────────────┘                                             │
│         │                                                                 │
│         │ Confirmation                                                    │
│         ▼                                                                 │
│     STUDENT                                                               │
│                                                                           │
│  ┌───────────────────────────────────────────────┐                       │
│  │  AUTOMATED ABSENT MARKING                     │                       │
│  └───────────────────────────────────────────────┘                       │
│                                                                           │
│  ┌─────────────────────────┐                                             │
│  │ 9.4 Scheduled Job       │                                             │
│  │ (Daily at 11:00 PM IST) │                                             │
│  │ • Get all students      │◄──── D3: users                              │
│  │ • Check attendance      │◄──── D4: attendance                         │
│  └──────┬──────────────────┘                                             │
│         │                                                                 │
│         │ Students without attendance                                     │
│         ▼                                                                 │
│  ┌─────────────────────────┐                                             │
│  │ 9.5 Mark                │                                             │
│  │ Absent                  │                                             │
│  │ • For each student      │───► D5: attendance                          │
│  │   without record        │                                             │
│  │ • status = \"absent\"     │                                             │
│  │ • notification_sent     │                                             │
│  │   = true                │                                             │
│  └──────┬──────────────────┘                                             │
│         │                                                                 │
│         │ Absent students list                                            │
│         ▼                                                                 │
│  ┌─────────────────────────┐                                             │
│  │ 9.6 Send                │                                             │
│  │ Notifications to        │                                             │
│  │ Parents                 │───► Twilio/Resend                           │
│  │ • SMS to parent phone   │                                             │
│  │ • Email alert           │                                             │
│  └──────┬──────────────────┘                                             │
│         │                                                                 │
│         │ SMS/Email                                                       │
│         ▼                                                                 │
│     PARENTS                                                               │
│                                                                           │
│  ┌───────────────────────────────────────────────┐                       │
│  │  ATTENDANCE CORRECTION REQUEST                │                       │
│  └───────────────────────────────────────────────┘                       │
│                                                                           │
│  STUDENT                                                                  │
│     │                                                                     │
│     │ Submit Correction Request                                           │
│     │ (reason, date, evidence)                                            │
│     ▼                                                                     │
│  ┌─────────────────────────┐                                             │
│  │ 9.7 Create              │                                             │
│  │ Correction Request      │───► D6: attendance_correction_requests      │
│  │ • Date                  │                                             │
│  │ • Reason                │                                             │
│  │ • Evidence (optional)   │                                             │
│  │ • Status: pending       │                                             │
│  └──────┬──────────────────┘                                             │
│         │                                                                 │
│         │ Request ID                                                      │
│         ▼                                                                 │
│     ADMIN                                                                 │
│         │                                                                 │
│         │ Review Request                                                  │
│         ▼                                                                 │
│  ┌─────────────────────────┐                                             │
│  │ 9.8 Approve/Reject      │                                             │
│  │ Correction              │                                             │
│  └──────┬──────────────────┘                                             │
│         │                                                                 │
│    ┌────┴────┐                                                            │
│    │Approved?│                                                            │
│    │   YES   │                                                            │
│    ▼         │                                                            │
│  ┌─────────────────────────┐                                             │
│  │ 9.9 Update              │                                             │
│  │ Attendance Record       │───► D7: attendance                          │
│  │ • Change status to      │                                             │
│  │   \"present\"             │                                             │
│  │ • Update request status │───► D8: attendance_correction_requests      │
│  └──────┬──────────────────┘                                             │
│         │                                                                 │
│         │ Notification                                                    │
│         ▼                                                                 │
│     STUDENT                                                               │
│                                                                           │
│  ┌───────────────────────────────────────────────┐                       │
│  │  ADMIN BULK ATTENDANCE MARKING                │                       │
│  └───────────────────────────────────────────────┘                       │
│                                                                           │
│  ADMIN                                                                    │
│     │                                                                     │
│     │ Bulk Mark (date, enrollment_list, status)                           │
│     ▼                                                                     │
│  ┌─────────────────────────┐                                             │
│  │ 9.10 Validate           │                                             │
│  │ Students                │◄──── D9: users                              │
│  └──────┬──────────────────┘                                             │
│         │                                                                 │
│         │ Valid students                                                  │
│         ▼                                                                 │
│  ┌─────────────────────────┐                                             │
│  │ 9.11 Bulk               │                                             │
│  │ Update/Insert           │───► D10: attendance                         │
│  │ Attendance              │                                             │
│  │ • For each student      │                                             │
│  │ • Create/update record  │                                             │
│  │ • marked_by: admin      │                                             │
│  └──────┬──────────────────┘                                             │
│         │                                                                 │
│         │ Summary                                                         │
│         ▼                                                                 │
│     ADMIN                                                                 │
│                                                                           │
│  ┌───────────────────────────────────────────────┐                       │
│  │  ATTENDANCE ANALYTICS & REPORTS               │                       │
│  └───────────────────────────────────────────────┘                       │
│                                                                           │
│  ADMIN                                                                    │
│     │                                                                     │
│     │ View Analytics                                                      │
│     ▼                                                                     │
│  ┌─────────────────────────┐                                             │
│  │ 9.12 Generate           │                                             │
│  │ Reports                 │◄──── D11: attendance                        │
│  │ • Daily status          │◄──── D12: users                             │
│  │ • Attendance summary    │                                             │
│  │ • Defaulter list        │                                             │
│  │ • Trends & patterns     │                                             │
│  │ • Block-wise analytics  │                                             │
│  │ • Export CSV/PDF        │                                             │
│  └──────┬──────────────────┘                                             │
│         │                                                                 │
│         │ Report Data                                                     │
│         ▼                                                                 │
│     ADMIN                                                                 │
│                                                                           │
│  ┌───────────────────────────────────────────────┐                       │
│  │  DEFAULTER NOTIFICATIONS                      │                       │
│  └───────────────────────────────────────────────┘                       │
│                                                                           │
│  ADMIN                                                                    │
│     │                                                                     │
│     │ Send Defaulter Alerts                                               │
│     ▼                                                                     │
│  ┌─────────────────────────┐                                             │
│  │ 9.13 Get                │                                             │
│  │ Defaulters              │◄──── D13: attendance                        │
│  │ (< threshold %)         │◄──── D14: users                             │
│  └──────┬──────────────────┘                                             │
│         │                                                                 │
│         │ Defaulter list                                                  │
│         ▼                                                                 │
│  ┌─────────────────────────┐                                             │
│  │ 9.14 Send               │                                             │
│  │ Notifications           │───► Twilio/Resend                           │
│  │ • To students           │───► D15: notifications                      │
│  │ • To parents            │                                             │
│  │ • Warning message       │                                             │
│  └──────┬──────────────────┘                                             │
│         │                                                                 │
│         │ Alerts                                                          │
│         ▼                                                                 │
│  STUDENTS/PARENTS                                                         │
│                                                                           │
└───────────────────────────────────────────────────────────────────────────┘

**Data Flows:**
- Attendance mark → Save record
- Time check → Determine status (present/late)
- Scheduled job → Check unmarked students → Mark absent
- Absent notification → Parents (SMS/Email)
- Correction request → Admin review → Update record
- Bulk marking → Mass update records
- Analytics query → Generate reports

**Data Stores:**
- D1-D2: attendance - Daily attendance records
- D3: users - Student information
- D4-D5: attendance
- D6-D8: attendance_correction_requests
- D9-D14: users, attendance
- D15: notifications

**External Services:**
- Twilio/Resend for parent notifications
- Scheduled jobs (11 PM IST daily)
```

---

### **2.6 COMPLAINTS MANAGEMENT (Process 5.0)**

```
┌───────────────────────────────────────────────────────────────────────────┐
│                                                                           │
│  STUDENT                                                                  │
│     │                                                                     │
│     │ Submit Complaint                                                    │
│     │ (category, description, image, priority)                            │
│     ▼                                                                     │
│  ┌─────────────────────────┐                                             │
│  │ 5.1 Validate            │                                             │
│  │ Complaint               │                                             │
│  │ • Category valid?       │                                             │
│  │ • Description length    │                                             │
│  │ • Image validation      │                                             │
│  └──────┬──────────────────┘                                             │
│         │                                                                 │
│    ┌────┴────┐                                                            │
│    │ Image   │                                                            │
│    │Uploaded?│                                                            │
│    │   YES   │                                                            │
│    ▼         │                                                            │
│  ┌─────────────────────────┐                                             │
│  │ 5.2 Validate &          │                                             │
│  │ Save Image              │                                             │
│  │ • Check file type       │                                             │
│  │   (JPEG/PNG/GIF/WebP)   │                                             │
│  │ • Check size (< 5MB)    │                                             │
│  │ • Verify using PIL      │                                             │
│  │ • Generate UUID name    │                                             │
│  │ • Save to uploads/      │───► File System                             │
│  └──────┬──────────────────┘                                             │
│         │                                                                 │
│         │ Image URL                                                       │
│         ▼                                                                 │
│  ┌─────────────────────────┐                                             │
│  │ 5.3 Create              │                                             │
│  │ Complaint Record        │───► D1: complaints                          │
│  │ • student_id            │                                             │
│  │ • student_name          │                                             │
│  │ • enrollment_number     │                                             │
│  │ • category              │                                             │
│  │ • description           │                                             │
│  │ • priority              │                                             │
│  │ • image_url (optional)  │                                             │
│  │ • status: pending       │                                             │
│  │ • date (ISO datetime)   │                                             │
│  └──────┬──────────────────┘                                             │
│         │                                                                 │
│         │ Complaint ID                                                    │
│         ▼                                                                 │
│  ┌─────────────────────────┐                                             │
│  │ 5.4 Send                │                                             │
│  │ Notification            │───► D2: notifications                       │
│  │ to Admin                │                                             │
│  └──────┬──────────────────┘                                             │
│         │                                                                 │
│         │ Confirmation                                                    │
│         ▼                                                                 │
│     STUDENT                                                               │
│                                                                           │
│  ┌───────────────────────────────────────────────┐                       │
│  │  STUDENT VIEW COMPLAINTS                      │                       │
│  └───────────────────────────────────────────────┘                       │
│                                                                           │
│  STUDENT                                                                  │
│     │                                                                     │
│     │ View My Complaints                                                  │
│     ▼                                                                     │
│  ┌─────────────────────────┐                                             │
│  │ 5.5 Get Student         │                                             │
│  │ Complaints              │◄──── D3: complaints                         │
│  │ • Filter by student_id  │                                             │
│  │ • Include image URLs    │                                             │
│  │ • Show status           │                                             │
│  └──────┬──────────────────┘                                             │
│         │                                                                 │
│         │ Complaint List                                                  │
│         ▼                                                                 │
│     STUDENT                                                               │
│                                                                           │
│  ┌───────────────────────────────────────────────┐                       │
│  │  ADMIN COMPLAINT MANAGEMENT                   │                       │
│  └───────────────────────────────────────────────┘                       │
│                                                                           │
│  ADMIN                                                                    │
│     │                                                                     │
│     │ View All Complaints                                                 │
│     ▼                                                                     │
│  ┌─────────────────────────┐                                             │
│  │ 5.6 Get All             │                                             │
│  │ Complaints              │◄──── D4: complaints                         │
│  │ • Filter by status      │                                             │
│  │ • Filter by category    │                                             │
│  │ • Filter by priority    │                                             │
│  │ • Sort by date          │                                             │
│  └──────┬──────────────────┘                                             │
│         │                                                                 │
│         │ Complaint List with Student Details                             │
│         ▼                                                                 │
│     ADMIN                                                                 │
│         │                                                                 │
│         │ Resolve Complaint                                               │
│         ▼                                                                 │
│  ┌─────────────────────────┐                                             │
│  │ 5.7 Update              │                                             │
│  │ Complaint Status        │                                             │
│  │ • status: resolved      │───► D5: complaints                          │
│  │ • resolved_by           │                                             │
│  │ • resolved_at           │                                             │
│  └──────┬──────────────────┘                                             │
│         │                                                                 │
│         │                                                                 │
│         ▼                                                                 │
│  ┌─────────────────────────┐                                             │
│  │ 5.8 Send                │                                             │
│  │ Resolution              │───► D6: notifications                       │
│  │ Notification            │                                             │
│  │ to Student              │                                             │
│  └──────┬──────────────────┘                                             │
│         │                                                                 │
│         │ Notification                                                    │
│         ▼                                                                 │
│     STUDENT                                                               │
│                                                                           │
│  ┌───────────────────────────────────────────────┐                       │
│  │  COMPLAINT REOPENING                          │                       │
│  └───────────────────────────────────────────────┘                       │
│                                                                           │
│  STUDENT                                                                  │
│     │                                                                     │
│     │ Reopen Complaint (reason)                                           │
│     ▼                                                                     │
│  ┌─────────────────────────┐                                             │
│  │ 5.9 Validate            │                                             │
│  │ Reopen Request          │◄──── D7: complaints                         │
│  │ • Was resolved?         │                                             │
│  │ • Within time limit?    │                                             │
│  └──────┬──────────────────┘                                             │
│         │                                                                 │
│    ┌────┴────┐                                                            │
│    │ Valid?  │                                                            │
│    │   YES   │                                                            │
│    ▼         │                                                            │
│  ┌─────────────────────────┐                                             │
│  │ 5.10 Update             │                                             │
│  │ Complaint               │                                             │
│  │ • status: pending       │───► D8: complaints                          │
│  │ • reopened_at           │                                             │
│  │ • reopen_reason         │                                             │
│  └──────┬──────────────────┘                                             │
│         │                                                                 │
│         │ Notification                                                    │
│         ▼                                                                 │
│     ADMIN                                                                 │
│                                                                           │
│  ┌───────────────────────────────────────────────┐                       │
│  │  COMPLAINT ANALYTICS & EXPORT                 │                       │
│  └───────────────────────────────────────────────┘                       │
│                                                                           │
│  ADMIN                                                                    │
│     │                                                                     │
│     │ View Statistics / Export                                            │
│     ▼                                                                     │
│  ┌─────────────────────────┐                                             │
│  │ 5.11 Generate           │                                             │
│  │ Reports                 │◄──── D9: complaints                         │
│  │ • Total complaints      │                                             │
│  │ • By category           │                                             │
│  │ • By status             │                                             │
│  │ • By priority           │                                             │
│  │ • Resolution time       │                                             │
│  │ • Export CSV            │                                             │
│  └──────┬──────────────────┘                                             │
│         │                                                                 │
│         │ Report/CSV File                                                 │
│         ▼                                                                 │
│     ADMIN                                                                 │
│                                                                           │
└───────────────────────────────────────────────────────────────────────────┘

**Data Flows:**
- Complaint submission → Validate → Save image → Create record
- Image file → File system (uploads/)
- Complaint query → Filter & retrieve
- Status update → Resolve complaint → Notify student
- Reopen request → Update status → Notify admin
- Analytics query → Aggregate data → Generate report

**Data Stores:**
- D1-D9: complaints - Complaint records
- D2, D6: notifications - System notifications
- File System: uploads/ directory for images

**Validation:**
- Image: Type (JPEG/PNG/GIF/WebP), Size (< 5MB)
- Description: 10-1000 characters
- Category: electricity, washroom, cleaning, other
- Priority: low, medium, high
```

---

### **2.7 GATEPASS MANAGEMENT (Process 7.0)**

```
┌───────────────────────────────────────────────────────────────────────────┐
│                                                                           │
│  STUDENT                                                                  │
│     │                                                                     │
│     │ Apply for Gatepass                                                  │
│     │ (reason, leave_from, leave_to)                                      │
│     ▼                                                                     │
│  ┌─────────────────────────┐                                             │
│  │ 7.1 Validate            │                                             │
│  │ Gatepass Request        │                                             │
│  │ • Date range valid?     │                                             │
│  │ • Leave_from < leave_to?│                                             │
│  │ • No overlapping passes?│◄──── D1: gatepasses                         │
│  └──────┬──────────────────┘                                             │
│         │                                                                 │
│    ┌────┴────┐                                                            │
│    │ Valid?  │                                                            │
│    │   YES   │                                                            │
│    ▼         │                                                            │
│  ┌─────────────────────────┐                                             │
│  │ 7.2 Create              │                                             │
│  │ Gatepass Record         │───► D2: gatepasses                          │
│  │ • student_id            │                                             │
│  │ • reason                │                                             │
│  │ • leave_from (datetime) │                                             │
│  │ • leave_to (datetime)   │                                             │
│  │ • status: pending       │                                             │
│  │ • applied_date          │                                             │
│  └──────┬──────────────────┘                                             │
│         │                                                                 │
│         │ Gatepass ID                                                     │
│         ▼                                                                 │
│  ┌─────────────────────────┐                                             │
│  │ 7.3 Notify              │                                             │
│  │ Admin                   │───► D3: notifications                       │
│  └──────┬──────────────────┘                                             │
│         │                                                                 │
│         │ Confirmation                                                    │
│         ▼                                                                 │
│     STUDENT                                                               │
│                                                                           │
│  ┌───────────────────────────────────────────────┐                       │
│  │  STUDENT VIEW GATEPASSES                      │                       │
│  └───────────────────────────────────────────────┘                       │
│                                                                           │
│  STUDENT                                                                  │
│     │                                                                     │
│     │ View My Gatepasses                                                  │
│     ▼                                                                     │
│  ┌─────────────────────────┐                                             │
│  │ 7.4 Get Student         │                                             │
│  │ Gatepasses              │◄──── D4: gatepasses                         │
│  │ • Filter by student_id  │                                             │
│  │ • Show status           │                                             │
│  │ • Show approved_by      │                                             │
│  └──────┬──────────────────┘                                             │
│         │                                                                 │
│         │ Gatepass List                                                   │
│         ▼                                                                 │
│     STUDENT                                                               │
│                                                                           │
│  ┌───────────────────────────────────────────────┐                       │
│  │  ADMIN APPROVAL WORKFLOW                      │                       │
│  └───────────────────────────────────────────────┘                       │
│                                                                           │
│  ADMIN                                                                    │
│     │                                                                     │
│     │ View Pending Gatepasses                                             │
│     ▼                                                                     │
│  ┌─────────────────────────┐                                             │
│  │ 7.5 Get Pending         │                                             │
│  │ Gatepasses              │◄──── D5: gatepasses                         │
│  │ • status = \"pending\"    │◄──── D6: users (student info)               │
│  │ • Include student info  │                                             │
│  │ • Sort by applied_date  │                                             │
│  └──────┬──────────────────┘                                             │
│         │                                                                 │
│         │ Pending List with Student Details                               │
│         ▼                                                                 │
│     ADMIN                                                                 │
│         │                                                                 │
│         │ Approve/Reject Gatepass                                         │
│         ▼                                                                 │
│  ┌─────────────────────────┐                                             │
│  │ 7.6 Update              │                                             │
│  │ Gatepass Status         │                                             │
│  │ • status: approved/     │───► D7: gatepasses                          │
│  │   rejected              │                                             │
│  │ • approved_by: admin    │                                             │
│  │ • approved_at: timestamp│                                             │
│  └──────┬──────────────────┘                                             │
│         │                                                                 │
│         │                                                                 │
│         ▼                                                                 │
│  ┌─────────────────────────┐                                             │
│  │ 7.7 Send                │                                             │
│  │ Notification            │───► D8: notifications                       │
│  │ • To Student (app)      │                                             │
│  │ • To Parents (SMS/Email)│───► Twilio/Resend                           │
│  └──────┬──────────────────┘                                             │
│         │                                                                 │
│         │ Notification                                                    │
│         ▼                                                                 │
│  STUDENT / PARENTS                                                        │
│                                                                           │
│  ┌───────────────────────────────────────────────┐                       │
│  │  OVERDUE GATEPASS MONITORING                  │                       │
│  └───────────────────────────────────────────────┘                       │
│                                                                           │
│  ┌─────────────────────────┐                                             │
│  │ 7.8 Scheduled Job       │                                             │
│  │ (Periodic Check)        │                                             │
│  │ • Get approved passes   │◄──── D9: gatepasses                         │
│  │ • Check leave_to date   │                                             │
│  └──────┬──────────────────┘                                             │
│         │                                                                 │
│         │ Overdue Gatepasses                                              │
│         ▼                                                                 │
│  ┌─────────────────────────┐                                             │
│  │ 7.9 Identify            │                                             │
│  │ Overdue Students        │                                             │
│  │ • leave_to < current    │                                             │
│  │   time                  │                                             │
│  │ • No return logged      │                                             │
│  └──────┬──────────────────┘                                             │
│         │                                                                 │
│         │ Overdue List                                                    │
│         ▼                                                                 │
│  ┌─────────────────────────┐                                             │
│  │ 7.10 Send               │                                             │
│  │ Overdue Alerts          │                                             │
│  │ • To Student            │───► D10: notifications                      │
│  │ • To Admin              │                                             │
│  │ • To Parents            │───► Twilio/Resend                           │
│  └──────┬──────────────────┘                                             │
│         │                                                                 │
│         │ Alerts                                                          │
│         ▼                                                                 │
│  STUDENT/ADMIN/PARENTS                                                    │
│                                                                           │
│  ┌───────────────────────────────────────────────┐                       │
│  │  STUDENT EXPLANATION SUBMISSION               │                       │
│  └───────────────────────────────────────────────┘                       │
│                                                                           │
│  STUDENT                                                                  │
│     │                                                                     │
│     │ Submit Explanation for Overdue                                      │
│     ▼                                                                     │
│  ┌─────────────────────────┐                                             │
│  │ 7.11 Save               │                                             │
│  │ Explanation             │───► D11: gatepasses                         │
│  │ • explanation_text      │                                             │
│  │ • explanation_submitted │                                             │
│  │   _at                   │                                             │
│  └──────┬──────────────────┘                                             │
│         │                                                                 │
│         │ Confirmation                                                    │
│         ▼                                                                 │
│     ADMIN                                                                 │
│                                                                           │
│  ┌───────────────────────────────────────────────┐                       │
│  │  GATEPASS ANALYTICS & REPORTS                 │                       │
│  └───────────────────────────────────────────────┘                       │
│                                                                           │
│  ADMIN                                                                    │
│     │                                                                     │
│     │ View Gatepass Reports                                               │
│     ▼                                                                     │
│  ┌─────────────────────────┐                                             │
│  │ 7.12 Generate           │                                             │
│  │ Reports                 │◄──── D12: gatepasses                        │
│  │ • Total gatepasses      │◄──── D13: users                             │
│  │ • Approval rate         │                                             │
│  │ • Overdue statistics    │                                             │
│  │ • Student-wise history  │                                             │
│  │ • Export CSV/PDF        │                                             │
│  └──────┬──────────────────┘                                             │
│         │                                                                 │
│         │ Report Data                                                     │
│         ▼                                                                 │
│     ADMIN                                                                 │
│                                                                           │
└───────────────────────────────────────────────────────────────────────────┘

**Data Flows:**
- Gatepass application → Validate → Create record → Notify admin
- Approval/Rejection → Update status → Notify student & parents
- Scheduled job → Check overdue → Send alerts
- Explanation → Save to gatepass record
- Report query → Aggregate data → Generate report

**Data Stores:**
- D1-D13: gatepasses - Gatepass records
- D3, D8, D10: notifications - System notifications
- D6, D13: users - Student information

**External Services:**
- Twilio/Resend for SMS/Email to parents
- Scheduled jobs for overdue monitoring

**Workflow States:**
- pending → approved/rejected
- approved → overdue (if leave_to exceeded)
```

---

## 📁 DATABASE SCHEMA & DATA STORES

### **MongoDB Collections**

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         DATABASE COLLECTIONS                            │
└─────────────────────────────────────────────────────────────────────────┘

1. users
   ├─ username (string)
   ├─ college_email (string)
   ├─ personal_email (string)
   ├─ enrollment_number (string)
   ├─ password (string, hashed)
   ├─ role (string: \"student\" | \"admin\")
   ├─ student_name (string)
   ├─ phone (string)
   ├─ parent_phone (string)
   ├─ father_name, mother_name (string)
   ├─ father_contact, mother_contact (string)
   ├─ hostel_name (string)
   ├─ block, floor, room_number, bed_number (string)
   ├─ course (string)
   ├─ year (integer)
   ├─ gender (string)
   ├─ washroom_preference (string)
   ├─ preferred_floor (string)
   ├─ created_at (ISO datetime)
   ├─ is_default_password (boolean)
   └─ totp_secret (string, optional)

2. mess_menu
   ├─ day (string)
   ├─ breakfast (array of strings)
   ├─ lunch (array of strings)
   ├─ dinner (array of strings)
   └─ week_start_date (string)

3. food_feedback
   ├─ student_id (string)
   ├─ date (ISO datetime)
   ├─ meal_type (string: \"breakfast\" | \"lunch\" | \"dinner\")
   ├─ rating (integer: 1-5)
   ├─ suggestions (string)
   └─ ai_processed (boolean)

4. anonymous_feedback
   ├─ date (ISO datetime)
   ├─ meal_type (string)
   ├─ rating (integer: 1-5)
   └─ suggestions (string)

5. voting_items
   ├─ item_name (string)
   ├─ vote_count (integer)
   ├─ status (string: \"active\" | \"closed\")
   └─ created_at (ISO datetime)

6. votes
   ├─ student_id (string)
   ├─ item_name (string)
   ├─ date (string)
   └─ timestamp (ISO datetime)

7. hostel_beds
   ├─ hostel_name (string)
   ├─ block (string)
   ├─ floor (string)
   ├─ gender (string)
   ├─ total_beds (integer)
   └─ occupied_beds (integer)

8. bookings
   ├─ student_id (string)
   ├─ hostel_name (string)
   ├─ block (string)
   ├─ room_number (string)
   ├─ floor (string)
   ├─ bed_number (string)
   ├─ amount (float)
   ├─ payment_status (string: \"pending\" | \"confirmed\")
   ├─ razorpay_order_id (string)
   ├─ razorpay_payment_id (string)
   ├─ booking_date (ISO datetime)
   └─ academic_year (string)

9. swap_requests
   ├─ student_id (string)
   ├─ current_hostel, current_block, current_room, current_bed (string)
   ├─ desired_hostel, desired_block, desired_room, desired_bed (string)
   ├─ reason (string)
   ├─ status (string: \"pending\" | \"approved\" | \"rejected\")
   ├─ requested_at (ISO datetime)
   └─ reviewed_by, reviewed_at (string, optional)

10. complaints
    ├─ student_id (string)
    ├─ student_name (string)
    ├─ enrollment_number (string)
    ├─ category (string: \"electricity\" | \"washroom\" | \"cleaning\" | \"other\")
    ├─ description (string)
    ├─ priority (string: \"low\" | \"medium\" | \"high\")
    ├─ image_url (string, optional)
    ├─ status (string: \"pending\" | \"resolved\")
    ├─ date (ISO datetime)
    ├─ resolved_by (string, optional)
    └─ resolved_at (ISO datetime, optional)

11. payments
    ├─ student_id (string)
    ├─ amount (float)
    ├─ payment_mode (string: \"UPI\" | \"cash\" | \"online\")
    ├─ transaction_id (string)
    ├─ status (string: \"paid\" | \"unpaid\")
    ├─ date (ISO datetime)
    └─ type (string: \"fee\" | \"fine\")

12. gatepasses
    ├─ student_id (string)
    ├─ reason (string)
    ├─ leave_from (ISO datetime)
    ├─ leave_to (ISO datetime)
    ├─ status (string: \"pending\" | \"approved\" | \"rejected\")
    ├─ applied_date (ISO datetime)
    ├─ approved_by (string, optional)
    ├─ explanation (string, optional)
    └─ explanation_submitted_at (ISO datetime, optional)

13. laundry_machines
    ├─ hostel_name (string)
    ├─ block (string)
    ├─ machine_no (integer)
    ├─ machine_code (string)
    ├─ machine_type (string: \"washer\" | \"dryer\" | \"combo\")
    ├─ status (string: \"available\" | \"in-use\" | \"maintenance\")
    ├─ floor (string)
    ├─ current_user (string, optional)
    ├─ cycle_end_time (ISO datetime, optional)
    └─ image_url (string, optional)

14. laundry_bookings
    ├─ student_id (string)
    ├─ machine_code (string)
    ├─ start_time (ISO datetime)
    ├─ end_time (ISO datetime)
    ├─ amount (float)
    ├─ status (string: \"active\" | \"completed\" | \"cancelled\")
    └─ booking_date (ISO datetime)

15. laundry_wallets
    ├─ student_id (string)
    ├─ balance (float)
    └─ updated_at (ISO datetime)

16. laundry_wallet_transactions
    ├─ student_id (string)
    ├─ amount (float)
    ├─ type (string: \"credit\" | \"debit\")
    ├─ source (string: \"topup\" | \"cycle_payment\" | \"refund\")
    ├─ meta (object)
    ├─ date (ISO datetime)
    └─ status (string: \"success\" | \"failed\")

17. laundry_complaints
    ├─ student_id (string)
    ├─ type (string: \"machine\" | \"manual\")
    ├─ description (string)
    ├─ missing_clothes_count (integer, optional)
    ├─ date (ISO datetime)
    └─ status (string: \"pending\" | \"resolved\")

18. attendance
    ├─ student_id (string)
    ├─ date (string)
    ├─ time (ISO datetime)
    ├─ status (string: \"present\" | \"absent\" | \"late\")
    ├─ notification_sent (boolean)
    └─ marked_by (string, optional)

19. attendance_correction_requests
    ├─ student_id (string)
    ├─ date (string)
    ├─ reason (string)
    ├─ evidence (string, optional)
    ├─ status (string: \"pending\" | \"approved\" | \"rejected\")
    ├─ requested_at (ISO datetime)
    └─ reviewed_by, reviewed_at (string, optional)

20. notifications
    ├─ type (string: \"holiday\" | \"fee_reminder\" | \"emergency\" | \"mess_timing\" | \"laundry\")
    ├─ title (string)
    ├─ message (string)
    ├─ target_users (string | array: \"all\" or specific usernames)
    ├─ hostel (string: \"all\" or specific hostel)
    ├─ date (ISO datetime)
    ├─ created_by (string)
    └─ read_by (array of user IDs)

21. visitor_logs
    ├─ visitor_name (string)
    ├─ visitor_phone (string)
    ├─ student_to_meet (string)
    ├─ student_enrollment (string)
    ├─ purpose (string)
    ├─ id_proof_type (string)
    ├─ id_proof_number (string)
    ├─ check_in_time (ISO datetime)
    ├─ check_out_time (ISO datetime, optional)
    ├─ qr_code (string)
    └─ status (string: \"in\" | \"out\")

22. otps
    ├─ contact (string: email or phone)
    ├─ otp (string: 6 digits)
    ├─ type (string: \"email\" | \"phone\")
    ├─ created_at (ISO datetime)
    ├─ expires_at (ISO datetime)
    └─ verified (boolean)

23. security_preferences
    ├─ admin_username (string)
    ├─ two_factor_enabled (boolean)
    ├─ totp_secret (string, optional)
    ├─ recovery_email (string, optional)
    └─ ip_whitelist (array of strings)

24. admin_sessions
    ├─ session_id (string)
    ├─ admin_username (string)
    ├─ ip_address (string)
    ├─ user_agent (string)
    ├─ created_at (ISO datetime)
    └─ expires_at (ISO datetime)

25. mess_templates
    ├─ template_name (string)
    ├─ menu_data (object)
    └─ created_at (ISO datetime)

26. mess_audit_log
    ├─ action (string)
    ├─ performed_by (string)
    ├─ changes (object)
    └─ timestamp (ISO datetime)
```

---

## 🔄 EXTERNAL INTEGRATIONS

```
┌─────────────────────────────────────────────────────────────────────────┐
│                       EXTERNAL SERVICES & APIs                          │
└─────────────────────────────────────────────────────────────────────────┘

1. OpenAI GPT-4o (Google Gemini)
   ├─ Purpose: AI-powered food feedback analysis
   ├─ Flow: Aggregate feedback → Send to API → Extract top 10 items
   ├─ Endpoint: Google Gemini API
   └─ Used in: Food Feedback Analysis (Process 4.6)

2. Twilio
   ├─ Purpose: SMS delivery (OTP, notifications, alerts)
   ├─ Flow: Generate OTP → Send via Twilio → User receives SMS
   ├─ Endpoints: Twilio REST API
   └─ Used in:
       ├─ Password Reset OTP
       ├─ First Login OTP
       ├─ Parent Notifications (Attendance, Gatepass)
       └─ Laundry Cycle Completion

3. Resend
   ├─ Purpose: Email delivery (OTP, notifications)
   ├─ Flow: Generate email → Send via Resend → User receives email
   ├─ Endpoints: Resend API
   └─ Used in:
       ├─ Password Reset OTP
       ├─ First Login OTP
       ├─ Parent Notifications
       └─ Admin Alerts

4. Razorpay
   ├─ Purpose: Payment processing
   ├─ Flow: Create order → User pays → Verify payment → Credit wallet/booking
   ├─ Endpoints: Razorpay Payment Gateway API
   └─ Used in:
       ├─ Hostel Bed Booking Payments
       ├─ Laundry Wallet Top-up
       └─ Fine Payments

5. Scheduled Jobs (APScheduler)
   ├─ Purpose: Automated background tasks
   ├─ Jobs:
   │   ├─ Auto-mark absent (Daily 11 PM IST)
   │   ├─ Laundry cycle monitor (Every 1 minute)
   │   └─ Auto-reset weekly cycle (Every Monday 12 AM IST)
   └─ Framework: AsyncIOScheduler with IST timezone
```

---

## 🔐 SECURITY & AUTHENTICATION FLOWS

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     SECURITY MECHANISMS                                 │
└─────────────────────────────────────────────────────────────────────────┘

1. JWT Authentication
   ├─ Token Generation: HS256 algorithm
   ├─ Expiry: 24 hours
   ├─ Payload: {username, role, enrollment_number}
   └─ Protected Routes: Require \"Authorization: Bearer <token>\" header

2. Password Security
   ├─ Hashing: bcrypt
   ├─ Salt rounds: Default bcrypt settings
   └─ Validation: Minimum length enforced

3. Two-Factor Authentication (2FA)
   ├─ Method: TOTP (Time-based One-Time Password)
   ├─ Library: pyotp
   ├─ Flow:
   │   ├─ Generate secret → QR code
   │   ├─ User scans QR with authenticator app
   │   ├─ Verify TOTP code during login
   │   └─ Fallback: OTP via SMS/Email
   └─ Admin-specific: IP whitelisting option

4. OTP System
   ├─ Generation: 6-digit random number
   ├─ Expiry: 10 minutes
   ├─ Storage: MongoDB (otps collection)
   ├─ Delivery: Twilio (SMS) / Resend (Email)
   └─ Verification: Match OTP + check expiry

5. File Upload Security
   ├─ Type Validation: JPEG, PNG, GIF, WebP only
   ├─ Size Limit: 5MB maximum
   ├─ Image Verification: PIL (Python Imaging Library)
   ├─ Unique Naming: UUID-based filenames
   └─ Storage: /app/backend/uploads/ directory

6. API Security
   ├─ CORS: Configured origins from environment
   ├─ Rate Limiting: Ready for Redis integration
   ├─ Input Validation: Pydantic models
   └─ Error Handling: No sensitive data in error messages

7. Session Management
   ├─ Admin sessions tracked in MongoDB
   ├─ Session timeout enforced
   ├─ IP address & user agent logged
   └─ Manual logout/logout-all functionality
```

---

## 📊 DATA FLOW SUMMARY BY USER ROLE

### **STUDENT DATA FLOWS**

```
STUDENT
  ├─ Authentication
  │   ├─ Login → JWT Token
  │   ├─ First Login → OTP Verification → Set Password
  │   ├─ Password Reset → OTP → New Password
  │   └─ 2FA Setup (Optional)
  │
  ├─ Profile
  │   ├─ View Profile → MongoDB (users)
  │   ├─ Update Profile → MongoDB (users)
  │   └─ Change Password → bcrypt → MongoDB (users)
  │
  ├─ Hostel Management
  │   ├─ View Bed Availability → MongoDB (hostel_beds)
  │   ├─ Book Hostel → Razorpay → MongoDB (bookings)
  │   ├─ Request Bed Swap → MongoDB (swap_requests)
  │   └─ View Roommate → MongoDB (users)
  │
  ├─ Mess Services
  │   ├─ View Menu → MongoDB (mess_menu)
  │   ├─ Submit Feedback → MongoDB (food_feedback)
  │   └─ Vote for Food → MongoDB (votes, voting_items)
  │
  ├─ Complaints
  │   ├─ Submit Complaint → Image Upload → MongoDB (complaints)
  │   └─ View Complaint Status → MongoDB (complaints)
  │
  ├─ Payments
  │   ├─ View Payments → MongoDB (payments)
  │   └─ Pay Fine → Razorpay → MongoDB (payments)
  │
  ├─ Gatepass
  │   ├─ Apply Gatepass → MongoDB (gatepasses)
  │   └─ View Status → MongoDB (gatepasses)
  │
  ├─ Laundry
  │   ├─ View Machines → MongoDB (laundry_machines)
  │   ├─ Top-up Wallet → Razorpay → MongoDB (laundry_wallets)
  │   ├─ Book Machine → Debit Wallet → MongoDB (laundry_bookings)
  │   └─ Submit Complaint → MongoDB (laundry_complaints)
  │
  ├─ Attendance
  │   ├─ Mark Attendance → MongoDB (attendance)
  │   ├─ View History → MongoDB (attendance)
  │   └─ Request Correction → MongoDB (attendance_correction_requests)
  │
  └─ Notifications
      ├─ View Notifications → MongoDB (notifications)
      └─ Mark as Read → MongoDB (notifications)
```

### **ADMIN DATA FLOWS**

```
ADMIN
  ├─ Authentication
  │   ├─ Login → 2FA/TOTP → JWT Token
  │   ├─ IP Whitelist Check
  │   └─ Session Tracking → MongoDB (admin_sessions)
  │
  ├─ Dashboard
  │   ├─ System Stats → Aggregate from MongoDB
  │   └─ Analytics → Multiple collections
  │
  ├─ Student Management
  │   ├─ View All Students → MongoDB (users)
  │   ├─ Add Student → MongoDB (users)
  │   ├─ Update Student → MongoDB (users)
  │   ├─ Delete Student → MongoDB (users)
  │   └─ Bulk Import → Excel/CSV → MongoDB (users)
  │
  ├─ Hostel Management
  │   ├─ View Bookings → MongoDB (bookings)
  │   ├─ Assign Rooms → MongoDB (users, hostel_beds)
  │   ├─ Approve Bed Swaps → MongoDB (swap_requests)
  │   └─ Update Availability → MongoDB (hostel_beds)
  │
  ├─ Mess Management
  │   ├─ Create/Edit Menu → MongoDB (mess_menu)
  │   ├─ View Feedback → MongoDB (food_feedback)
  │   ├─ AI Analysis → OpenAI → Create Voting Items
  │   ├─ View Voting Results → MongoDB (votes, voting_items)
  │   └─ Manage Templates → MongoDB (mess_templates)
  │
  ├─ Complaints
  │   ├─ View All Complaints → MongoDB (complaints)
  │   ├─ Resolve Complaint → MongoDB (complaints) → Notify Student
  │   └─ Export Reports → CSV/PDF
  │
  ├─ Payments & Fines
  │   ├─ View All Payments → MongoDB (payments)
  │   ├─ Issue Fine → MongoDB (payments)
  │   ├─ Apply Late Fees → MongoDB (payments)
  │   └─ Process Appeals → MongoDB (payments)
  │
  ├─ Gatepass
  │   ├─ View Pending → MongoDB (gatepasses)
  │   ├─ Approve/Reject → MongoDB (gatepasses) → Notify Student/Parents
  │   ├─ View Overdue → MongoDB (gatepasses)
  │   └─ Send Alerts → Twilio/Resend
  │
  ├─ Laundry Management
  │   ├─ View All Machines → MongoDB (laundry_machines)
  │   ├─ Update Machine Status → MongoDB (laundry_machines)
  │   ├─ View Usage → MongoDB (laundry_bookings)
  │   ├─ Process Complaints → MongoDB (laundry_complaints)
  │   ├─ Handle Refunds → MongoDB (laundry_wallets)
  │   └─ Upload Machine Photos → File System
  │
  ├─ Attendance
  │   ├─ Mark Attendance (Manual) → MongoDB (attendance)
  │   ├─ Bulk Mark → MongoDB (attendance)
  │   ├─ Review Corrections → MongoDB (attendance_correction_requests)
  │   ├─ View Analytics → MongoDB (attendance)
  │   ├─ Identify Defaulters → MongoDB (attendance)
  │   └─ Send Notifications → Twilio/Resend
  │
  ├─ Notifications
  │   ├─ Create Notification → MongoDB (notifications)
  │   ├─ Send to Users → SMS/Email (Twilio/Resend)
  │   └─ View Analytics → MongoDB (notifications)
  │
  ├─ Visitor Management
  │   ├─ Check-in Visitor → MongoDB (visitor_logs)
  │   ├─ Check-out Visitor → MongoDB (visitor_logs)
  │   ├─ Generate QR Code → Base64 encoded
  │   ├─ Blacklist Visitor → MongoDB (visitor_blacklist)
  │   └─ View Reports → MongoDB (visitor_logs)
  │
  └─ Security
      ├─ Manage 2FA → MongoDB (security_preferences)
      ├─ IP Whitelist → MongoDB (security_preferences)
      ├─ View Sessions → MongoDB (admin_sessions)
      ├─ Force Logout → MongoDB (admin_sessions)
      └─ Security Events → MongoDB (security_events)
```

---

## 📈 KEY SYSTEM WORKFLOWS

### **1. Complete Bed Booking Workflow**
```
Student Request → Check Availability → Create Booking (Pending) → 
Generate Razorpay Order → Student Payment → Verify Payment → 
Update Booking (Confirmed) → Update Bed Count → Admin Assigns Room → 
Update User Profile → Send Confirmation
```

### **2. AI-Powered Food Voting Workflow**
```
Students Submit Feedback → Admin Triggers AI Analysis → 
Fetch All Suggestions → Send to OpenAI GPT-4o → 
AI Extracts Top 10 Items → Create Voting Items → 
Students Vote (9 PM - 10 PM) → Record Votes → 
Display Results → Admin Reviews → Update Menu
```

### **3. Laundry Cycle Workflow**
```
Student Views Machines → Select Available Machine → 
Check Wallet Balance → Debit ₹50 → Create Booking → 
Update Machine Status (In-Use) → Start 45-min Timer → 
Scheduled Job Monitors → Cycle Complete → 
Free Machine → Send Notification (SMS/Email) → 
Student Collects Laundry
```

### **4. Attendance Workflow with Parent Notification**
```
Student Marks Attendance (Before 9:30 AM → Present | After → Late) → 
Save Record → Scheduled Job (11 PM) → 
Check Unmarked Students → Mark Absent → 
Send SMS to Parents (Twilio) → Send Email (Resend) → 
Log Notification
```

### **5. Gatepass Workflow**
```
Student Applies → Validate Dates → Create Gatepass (Pending) → 
Notify Admin → Admin Reviews → Approve/Reject → 
Update Status → Notify Student → Notify Parents (SMS/Email) → 
Monitor Return Date → If Overdue → Send Alerts → 
Student Submits Explanation
```

---

### **6. Real Gmail SMTP OTP Password Reset Workflow**
```
Student Enters Enrollment/Email → FastAPI Validates User in db.users → 
Generate Secure 6-Digit OTP → Save in db.otps (10-min Expiry) → 
smtplib Connects to smtp.gmail.com:587 (STARTTLS) → 
Authenticate via GMAIL_APP_PASSWORD → Dispatch Formatted HTML Email → 
Student Receives OTP in Gmail Inbox → Enters OTP & Strong New Password → 
FastAPI Cross-Checks db.otps → Hash New Password with Bcrypt → 
Update User Document (db.users) → Invalidate OTP Record → 
Return Success & Redirect to Login
```

### **7. Mutual Bed Swap with Signed Consent Verification Workflow**
```
Student A Initiates Swap Request → Selects Desired Room/Bed & Student B → 
Uploads Signed Mutual-Consent Proof (PDF) to /uploads/ → 
System Stores Record in db.bed_swaps (Status: 'peer_pending') → 
Real-Time Notification Sent to Student B → 
Student B Reviews & Approves Swap in Student Portal → 
Status Updates to 'admin_pending' → 
Admin Bed Management Dashboard Displays Both Approvals & PDF Link → 
Warden Verifies Both Consents & Clicks 'Approve Swap' → 
System Performs Atomic Two-Way Swap in db.users:
  - Updates Student A to Room B / Bed B
  - Updates Student B to Room A / Bed A
System Invalidates In-Memory Cache (_STUDENTS_CACHE & _BED_AVAILABILITY_CACHE) → 
Both Students & Public Bed Availability Matrix Instantly Reflect New Allocations
```

### **8. AI Food Sentiment Analysis & Automated Sunday Menu Injection Workflow**
```
Students Submit Meal Ratings & Feedback → Stored in db.mess_feedback → 
Weekly Tuesday Scheduler / Admin Manual Override Triggered → 
FastAPI Aggregates Feedbacks → Prompts Google Gemini 2.5 NLP Engine → 
AI Identifies Positive Sentiments & Extracts Top 10 Repeated Student Favorites → 
Candidate Items Populated in db.voting_candidates → 
Live Food Voting Opens (Digital Countdown Active) → 
Students Cast Daily Votes (Single Vote per Student Enforcement) → 
Voting Deadline Reached (Wednesday 12:00 AM / Admin Manual End) → 
System Tally Identifies Winner Dish → 
Automated Script Injects Winner Dish into db.mess_menu:
  - Updates Sunday Special Dinner Menu with Winner Item
  - Logs AI Selection & Auto-Updates Both Student & Admin Mess Timetables → 
Generates Weekly PDF Menu & Provides 1-Click WhatsApp Share Link
```

### **9. Automated Attendance & Past-Date Auto-Absent Engine Workflow**
```
Warden / Student Requests Daily Attendance (/api/admin/attendance/daily-status) → 
System Determines Target Date (Asia/Kolkata Timezone) → 
If Target Date is in Past:
  - Query db.users for All Active Residents (3,205 Students)
  - Query db.attendance for Existing Marked Records on Target Date
  - For Every Resident with No Existing Record:
      * Construct Auto-Absent Document (status: 'absent', marked_by: 'system', source: 'auto_absent')
  - Batch Insert Unmarked Students into db.attendance (ordered=False)
System Computes Present/Late/Absent Metrics & Defaulter Risk Scores → 
Calculates 30-Day Monthly Progress for Individual Student Profiles → 
Renders Interactive Attendance Tables with Live Percentages
```

### **10. High-Performance Sub-Millisecond In-Memory Caching Workflow**
```
Client Makes GET Request (/admin/students, /admin/attendance, /bed-availability) → 
FastAPI Constructs Composite Cache Key based on Filters & User Role → 
Check Global In-Memory RAM Cache:
  - [CACHE HIT & Age < TTL (45-60s)]: Return Cached JSON Response Immediately (< 1ms Latency)
  - [CACHE MISS or Expired]:
      * Query MongoDB Atlas using Lean Projections (exclude passwords, blobs, hashes)
      * Serialize Normalized Records in Python
      * Store Output in Global RAM Cache with Current Timestamp
      * Return Response to Client (< 150ms)
On Any Database Write Operation (POST/PATCH/DELETE /admin/students, Bookings, Swaps):
  - Invalidate Targeted Caches Immediately (invalidate_students_cache(), invalidate_bed_cache())
  - Guarantee 100% Data Freshness with Sub-Millisecond Read Speeds
```

### **11. Compulsory First-Time Login, Gmail OTP Dispatch & Conditional UI Workflow**
```
Student Enters Default Credentials (Enrollment ID + DOB: 'DD-MM-YYYY') → 
FastAPI /auth/login Validates Password & Checks 'is_first_login' / 'is_default_password' Flag → 
Flag is True → System Intercepts Session & Redirects to /first-login-reset → 
Client Calls /auth/first-login/send-otp → 
FastAPI Generates Secure 6-Digit Verification Code & Stores in db.otps → 
Send Email Dispatch via Gmail SMTP (port 587) or Resend API:
  - If Resend enforces free-tier restrictions on test student addresses:
      * Smart Fallback catches domain error and routes code to verified tester inbox
      * Prepends Student Account Banner & subject tag: '[{student_email}]'
  - Return: live_email_delivered: true, dev_otp: null
FirstLoginReset Frontend React Component Evaluates live_email_delivered:
  - If True: Completely hides on-screen Testing OTP banner, renders emerald confirmation card
  - If False (dummy account): Displays amber Testing OTP badge on screen for evaluation
Student Inputs 6-Digit Code & Sets New Personal Password → 
FastAPI /auth/first-login/verify Hashes Password (Bcrypt) & Updates db.users (is_first_login: false) → 
Student Automatically Redirected to Main Dashboard
```

### **12. Book Hostel Mid-Way Reset ("Start Again") & Realistic Payment Processing Delay Workflow**
```
Student Navigates to Book Hostel Wizard (/student/book-hostel) → 
Step 1: Select Bhawan & Room Category → Step 2: Choose Floor & Washroom Preferences → 
Mid-Way Change of Mind:
  - Student clicks "Start Again / Redo" button at any stage
  - React State Resets: active step returns to 1, all selections cleared, room cache refreshed
Step 3: Review Allocation & Payment Summary → 
Student Clicks "Pay & Confirm Booking":
  - System Simulates Realistic 2.5-Second Payment Gateway Processing Delay
  - Animated banking spinner displays with status: "Contacting Secure Bank Server..."
  - Razorpay order verification creates permanent booking in db.bookings
  - Generates Downloadable Branded PDF Payment Receipt with Verification Stamp
Instant Bed Availability Invalidation Updates Live Occupancy Across Campus
```

### **13. Warden Notice Board Asynchronous Gmail Broadcast Workflow**
```
Admin / Chief Warden Composes Notice (/api/notifications) with Title, Priority, Hostel Scope → 
FastAPI Validates & Persists Notice Document in db.notifications → 
System Instantly Returns HTTP 200 Success (< 30ms) to Warden UI → 
FastAPI Background Task (asyncio.create_task) Triggers dispatch_notification_emails():
  - Queries db.users for Registered Student Gmail Addresses matching Target Hostel
  - Always Includes the 5 Designated Real Tester Student Accounts
  - Generates High-Priority Branded HTML University Notice Template
  - Dispatches Email via send_email (Gmail SMTP / Resend Fallback)
Students Receive Instant Email Announcement with Priority Badge in their Gmail Inbox
```

---

## 🎯 CONCLUSION

This DFD documentation provides an exhaustive architectural and data flow blueprint for the **HOSTELEASE** hostel management ecosystem.

**Key Technical Capabilities:**
- ✅ **Multi-tier Full-Stack Architecture**: React 18, FastAPI Python 3.11, MongoDB Atlas
- ✅ **External Cloud Integrations**: Google Gemini 2.5 AI, Razorpay, Gmail SMTP, Resend, Twilio
- ✅ **Sub-Millisecond Read Performance**: Custom in-memory TTL RAM caching layer with automated write invalidation
- ✅ **End-to-End Security**: JWT authentication, 2FA/TOTP authenticator, Bcrypt hashing, real Gmail SMTP OTP delivery
- ✅ **File & Document Verification**: Multipart image/PDF validation with signed consent proof audits
- ✅ **Automated Background Engines**: Past unmarked date auto-absent insertion, Wednesday voting deadlines with Admin manual override, Sunday menu injection

**Total API Endpoints**: 65+ Production RESTful APIs  
**Database Collections**: 18 Active MongoDB Collections  
**Document Version**: 2.5.0 (Production Final Release)  
**Last Updated**: October 2026  
**Created For**: HOSTELEASE Hostel Management System Final Year Examination

---

**🎊 End of DFD Documentation 🎊**
"
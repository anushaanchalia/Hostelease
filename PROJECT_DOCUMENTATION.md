"# HOSTELEASE - Complete Hostel Management System

## 📋 PROJECT OVERVIEW

HOSTELEASE is a comprehensive, full-stack hostel management application designed for educational institutions. It provides separate portals for students and administrators (wardens) to manage all aspects of hostel operations including mess management, complaints, attendance, gatepasses, laundry, and more.

---

## 🏗️ ARCHITECTURE

### Technology Stack:
- **Frontend**: React 18.x + Tailwind CSS + Shadcn UI Components
- **Backend**: FastAPI (Python 3.11) + Motor (MongoDB async driver)
- **Database**: MongoDB
- **Authentication**: JWT (JSON Web Tokens) with Bearer Authentication
- **File Upload**: Multipart/form-data with image validation
- **Integrations**: 
  - OpenAI GPT-4o (AI-powered food feedback analysis)
  - Twilio (SMS/OTP services)
  - Resend (Email services)
  - EmergentIntegrations LLM library

### Project Structure:
```
/app/
├── backend/
│   ├── server.py              # Main FastAPI application
│   ├── seed_from_excel.py     # Database seeding script
│   ├── requirements.txt       # Python dependencies
│   ├── .env                   # Environment variables
│   └── uploads/               # Uploaded images directory
├── frontend/
│   ├── src/
│   │   ├── pages/            # React page components
│   │   │   ├── Login.js
│   │   │   ├── ForgotPassword.js
│   │   │   ├── StudentDashboard.js
│   │   │   ├── AdminDashboard.js
│   │   │   └── student/      # Student portal pages
│   │   │   └── admin/        # Admin portal pages
│   │   ├── components/       # Reusable components
│   │   │   ├── ui/          # Shadcn UI components
│   │   │   └── ProtectedRoute.js
│   │   ├── utils/           # Utility functions
│   │   │   ├── api.js       # Axios API client
│   │   │   └── auth.js      # Authentication helpers
│   │   ├── App.js
│   │   ├── App.css
│   │   └── index.js
│   ├── package.json
│   ├── tailwind.config.js
│   └── .env
└── README.md
```

---

## 🔐 SECURITY FEATURES

### 1. Authentication & Authorization
- **JWT-based authentication** with Bearer tokens
- **Role-based access control** (Student vs Admin)
- **Secure password hashing** using bcrypt
- **Token expiration** (24 hours)
- **Protected routes** on both frontend and backend

### 2. OTP System
- **6-digit OTP generation** for password reset
- **10-minute expiry** for OTPs
- **Multi-channel delivery** (SMS via Twilio, Email via Resend)
- **OTP verification** before password reset
- **Automatic cleanup** of used OTPs

### 3. File Upload Security
- **File type validation** (Only images: JPEG, PNG, GIF, WebP)
- **File size limit** (Maximum 5MB per file)
- **Image verification** using PIL (Python Imaging Library)
- **Unique filename generation** using UUID
- **Secure file storage** in dedicated uploads directory
- **Content-Type validation** on both frontend and backend

### 4. Input Validation
- **Frontend validation** for all form inputs
- **Backend validation** using Pydantic models
- **SQL injection prevention** (MongoDB doesn't use SQL)
- **XSS protection** through React's built-in escaping
- **Length constraints** on text fields (e.g., descriptions 10-1000 chars)

### 5. API Security
- **CORS configuration** for secure cross-origin requests
- **Authorization headers** required for protected endpoints
- **Error handling** with appropriate HTTP status codes
- **Rate limiting ready** (can be implemented with Redis)

---

## 📊 DATABASE SCHEMA

### Collections:

#### 1. users
```javascript
{
  username: String,
  college_email: String,           // format: enrollmentnumber@hostel.com
  personal_email: String,          // from Excel sheet
  enrollment_number: String,
  password: String (hashed),
  role: String,                    // \"student\" or \"admin\"
  student_name: String,
  phone: String,
  parent_phone: String,
  father_name: String,
  mother_name: String,
  father_contact: String,
  mother_contact: String,
  hostel_name: String,
  block: String,
  floor: String,
  room_number: String,
  bed_number: String,             // e.g., \"B1\", \"B2\"
  course: String,
  year: Integer,
  gender: String,
  washroom_preference: String,
  preferred_floor: String,
  created_at: String (ISO datetime),
  is_default_password: Boolean
}
```

#### 2. mess_menu
```javascript
{
  day: String,                    // \"Monday\", \"Tuesday\", etc.
  breakfast: Array[String],
  lunch: Array[String],
  dinner: Array[String],
  week_start_date: String
}
```

#### 3. food_feedback
```javascript
{
  student_id: String,
  date: String (ISO datetime),
  meal_type: String,              // \"breakfast\", \"lunch\", \"dinner\"
  rating: Integer (1-5),
  suggestions: String,
  ai_processed: Boolean
}
```

#### 4. voting_items
```javascript
{
  item_name: String,
  vote_count: Integer,
  status: String,                 // \"active\" or \"closed\"
  created_at: String (ISO datetime)
}
```

#### 5. votes
```javascript
{
  student_id: String,
  item_name: String,
  date: String,
  timestamp: String (ISO datetime)
}
```

#### 6. hostel_beds
```javascript
{
  hostel_name: String,
  block: String,
  floor: String,
  gender: String,
  total_beds: Integer,
  occupied_beds: Integer
}
```

#### 7. complaints
```javascript
{
  student_id: String,
  student_name: String,
  enrollment_number: String,
  category: String,               // \"electricity\", \"washroom\", \"cleaning\", \"other\"
  description: String,
  image_url: String (optional),   // Path to uploaded image
  status: String,                 // \"pending\" or \"resolved\"
  date: String (ISO datetime),
  resolved_by: String (optional),
  resolved_at: String (optional)
}
```

#### 8. payments
```javascript
{
  student_id: String,
  amount: Float,
  payment_mode: String,           // \"UPI\", \"cash\", \"online\"
  transaction_id: String,
  status: String,                 // \"paid\", \"unpaid\"
  date: String (ISO datetime),
  type: String                    // \"fee\" or \"fine\"
}
```

#### 9. gatepasses
```javascript
{
  student_id: String,
  reason: String,
  leave_from: String (datetime),
  leave_to: String (datetime),
  status: String,                 // \"pending\", \"approved\", \"rejected\"
  applied_date: String (ISO datetime),
  approved_by: String (optional)
}
```

#### 10. laundry_complaints
```javascript
{
  student_id: String,
  type: String,                   // \"machine\" or \"manual\"
  description: String,
  missing_clothes_count: Integer,
  date: String (ISO datetime),
  status: String
}
```

#### 11. attendance
```javascript
{
  student_id: String,
  date: String,
  time: String (ISO datetime),
  status: String,                 // \"present\", \"absent\", \"late\"
  notification_sent: Boolean,
  marked_by: String (optional)
}
```

#### 12. notifications
```javascript
{
  type: String,                   // \"holiday\", \"fee_reminder\", \"emergency\", \"mess_timing\", \"laundry\"
  message: String,
  target_users: String or Array,  // \"all\" or specific usernames
  date: String (ISO datetime),
  created_by: String
}
```

#### 13. otps
```javascript
{
  contact: String,                // Email or phone number
  otp: String (6 digits),
  type: String,                   // \"email\" or \"phone\"
  created_at: String (ISO datetime),
  expires_at: String (ISO datetime),
  verified: Boolean
}
```

---

## 🚀 FEATURES

### Student Portal Features:

1. **Dashboard**
   - Welcome message with student name
   - Quick access cards to all features
   - Today's attendance status
   - Room and hostel information

2. **Profile Management**
   - Personal & Academic Details
   - Family Contact Information
   - Room & Residency Details
   - Password change functionality

3. **Mess Menu**
   - View weekly menu (7 days)
   - Breakfast, Lunch, and Dinner items
   - Day-wise display

4. **Food Feedback System**
   - Star rating (1-5)
   - Meal type selection
   - Text suggestions for food preferences
   - AI processes feedback to generate voting items

5. **Food Voting**
   - Time-restricted voting (9 PM - 10 PM only)
   - One vote per day per student
   - Real-time vote count display
   - Progress bars showing vote percentages

6. **Bed Availability**
   - Real-time occupancy status
   - Filter by gender (Boys/Girls)
   - Filter by block (A, B, C)
   - Visual occupancy indicators

7. **Complaints System** ⭐ ENHANCED
   - Category selection (Electricity, Washroom, Cleaning, Other)
   - Text description (10-1000 characters)
   - **Image upload** (max 5MB, JPEG/PNG/GIF/WebP)
   - Image preview before submission
   - Complaint history with status
   - View uploaded images in history

8. **Payment Tracking**
   - View paid transactions
   - Track unpaid fees
   - Fine details
   - Transaction history

9. **Gatepass Management**
   - Apply for leave
   - Specify reason and duration
   - Track approval status
   - View history

10. **Laundry Management**
    - Washing machine status (real-time)
    - Manual laundry service tracking
    - Report missing clothes

11. **Attendance**
    - Mark daily attendance (biometric simulation)
    - View attendance history
    - Late/Absent tagging
    - Cutoff time: 9:30 AM

12. **Notifications**
    - Holiday notices
    - Fee reminders
    - Emergency alerts
    - Mess timing updates
    - Laundry slot alerts

### Admin Portal Features:

1. **Dashboard**
   - Total students count
   - Available beds
   - Pending complaints
   - Pending gatepasses
   - Bed occupancy statistics

2. **Student Database**
   - View all students (placeholder for full implementation)

3. **Bed Management**
   - Update bed availability
   - Room allocations

4. **Mess Menu Management**
   - Edit weekly menu
   - Update food items
   - Handle sudden changes

5. **Food Feedback Management** ⭐ AI-POWERED
   - View all student feedback
   - **AI Analysis** using OpenAI GPT-4o
   - Automatically extract top 10 food items
   - Create voting items from feedback

6. **Voting Results**
   - View vote counts
   - Ranked display
   - Percentage visualization

7. **Complaint Management**
   - View all complaints
   - Student details
   - **View uploaded images**
   - Mark as resolved

8. **Gatepass Approvals**
   - View all gatepass requests
   - Approve/Reject
   - Student information

9. **Attendance Management**
   - Mark attendance manually
   - View all attendance records
   - Send notifications to parents

---

## 🔧 INSTALLATION & SETUP

### Prerequisites:
- Python 3.11+
- Node.js 18+
- MongoDB
- Git

### Backend Setup:

1. **Install Python dependencies:**
```bash
cd /app/backend
pip install fastapi uvicorn motor python-jose passlib pymongo python-multipart twilio resend emergentintegrations Pillow pandas openpyxl bcrypt cryptography email-validator python-dotenv aiohttp aiohttp-retry
```

2. **Configure Environment Variables** (`/app/backend/.env`):
```env
# MongoDB
MONGO_URL=mongodb://localhost:27017
DB_NAME=hostelease

# JWT
JWT_SECRET_KEY=hostelease-secret-key-2025

# CORS
CORS_ORIGINS=*

# OpenAI (for AI feedback analysis)
OPENAI_API_KEY=your_openai_api_key_here

# Twilio (for SMS/OTP)
TWILIO_ACCOUNT_SID=your_twilio_account_sid
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_PHONE_NUMBER=+1234567890

# Resend (for Email)
RESEND_API_KEY=your_resend_api_key
SENDER_EMAIL=noreply@yourdomain.com
```

3. **Seed the database:**
```bash
cd /app/backend
python seed_from_excel.py
```

This will:
- Create admin user (username: `admin`, password: `hostel@123`)
- Import 30 students from Excel file
- Create mess menu for the week
- Setup hostel bed data
- Add voting items
- Create sample notifications

### Frontend Setup:

1. **Install Node.js dependencies:**
```bash
cd /app/frontend
yarn install
```

Required packages:
- react
- react-dom
- react-router-dom
- axios
- tailwindcss
- lucide-react
- sonner
- @radix-ui/* (Shadcn UI dependencies)

2. **Configure Environment Variables** (`/app/frontend/.env`):
```env
REACT_APP_BACKEND_URL=http://localhost:8001
```

For production: `REACT_APP_BACKEND_URL=https://your-domain.com`

---

## 🏃 RUNNING THE APPLICATION

### Development Mode:

**Backend:**
```bash
cd /app/backend
uvicorn server:app --host 0.0.0.0 --port 8001 --reload
```

**Frontend:**
```bash
cd /app/frontend
yarn start
```

Application will be available at:
- Frontend: http://localhost:3000
- Backend API: http://localhost:8001
- API Docs: http://localhost:8001/docs (Swagger UI)

### Production Mode (Using Supervisor):

Backend and frontend are managed by supervisor:
```bash
# Start services
sudo supervisorctl start backend frontend

# Restart services
sudo supervisorctl restart backend frontend

# Check status
sudo supervisorctl status

# View logs
tail -f /var/log/supervisor/backend.out.log
tail -f /var/log/supervisor/frontend.out.log
```

---

## 👤 USER CREDENTIALS

### Admin Login:
- **Username**: admin
- **Password**: hostel@123

### Student Login:
- **Username**: `<firstname><lastname>` (lowercase, no spaces)
- **Password**: hostel@123

**Examples from Excel data:**
- Username: `adityajoshi`, Password: `hostel@123`
- Username: `priyasharma`, Password: `hostel@123`
- Username: `rohitkumar`, Password: `hostel@123`

### Email Format:
- **College Email**: `<enrollment_number>@hostel.com`
- **Personal Email**: From Excel sheet (e.g., `adityajoshi@gmail.com`)

---

## 🔑 API KEYS REQUIRED

### 1. OpenAI API Key (for AI Feedback Analysis)
- Sign up at: https://platform.openai.com/
- Create API key
- Add to `/app/backend/.env` as `OPENAI_API_KEY`
- Used for: Analyzing student food suggestions and extracting top 10 items

### 2. Twilio (for SMS/OTP)
- Sign up at: https://www.twilio.com/
- Get Account SID, Auth Token, and Phone Number
- Add to `/app/backend/.env`
- Used for: Sending OTP for password reset, attendance notifications to parents

### 3. Resend (for Email)
- Sign up at: https://resend.com/
- Create API key
- Add to `/app/backend/.env`
- Used for: Sending OTP via email for password reset

**Note**: Application will work without these API keys, but OTP and AI features will be disabled.

---

## 📁 FILE UPLOAD SPECIFICATIONS

### Constraints:
- **Maximum file size**: 5MB
- **Allowed formats**: JPEG, JPG, PNG, GIF, WebP
- **Content-Type validation**: Yes
- **Image verification**: Using PIL (Pillow)
- **Storage location**: `/app/backend/uploads/`
- **Filename**: UUID-based unique names
- **Access**: Served via `/uploads/` endpoint

### Usage:
Students can upload images when raising complaints. Images are displayed in complaint history and admin can view them.

---

## 🧪 TESTING

### Backend API Testing:

**Test Login:**
```bash
curl -X POST http://localhost:8001/api/auth/login \
  -H \"Content-Type: application/json\" \
  -d '{\"username\":\"adityajoshi\",\"password\":\"hostel@123\"}'
```

**Test Protected Endpoint:**
```bash
TOKEN=\"your_jwt_token_here\"
curl -X GET http://localhost:8001/api/mess-menu \
  -H \"Authorization: Bearer $TOKEN\"
```

**Test File Upload:**
```bash
curl -X POST http://localhost:8001/api/complaints \
  -H \"Authorization: Bearer $TOKEN\" \
  -F \"category=electricity\" \
  -F \"description=Fan not working in room 101\" \
  -F \"image=@/path/to/image.jpg\"
```

### Frontend Testing:
1. Navigate to http://localhost:3000
2. Login with credentials
3. Test all features manually
4. Check browser console for errors
5. Test responsive design on different screen sizes

---

## 🐛 COMMON ISSUES & SOLUTIONS

### 1. MongoDB Connection Failed
**Solution**: Ensure MongoDB is running: `sudo systemctl start mongod`

### 2. CORS Error
**Solution**: Check `CORS_ORIGINS` in backend/.env matches frontend URL

### 3. File Upload Fails
**Solution**: 
- Check file size (< 5MB)
- Verify file type (JPEG/PNG/GIF/WebP)
- Ensure `/app/backend/uploads/` directory exists

### 4. OTP Not Sending
**Solution**: 
- Verify Twilio/Resend API keys in .env
- Check API key permissions
- View backend logs for errors

### 5. AI Analysis Fails
**Solution**:
- Verify OpenAI API key
- Check API usage limits
- Ensure sufficient credits

### 6. Frontend Build Fails
**Solution**: 
- Delete `node_modules` and reinstall: `rm -rf node_modules && yarn install`
- Clear cache: `yarn cache clean`

---

## 📦 DEPENDENCIES

### Backend (`requirements.txt`):
```
fastapi
uvicorn[standard]
motor
pymongo
python-jose[cryptography]
passlib[bcrypt]
python-multipart
twilio
resend
emergentintegrations
Pillow
pandas
openpyxl
bcrypt
cryptography
email-validator
python-dotenv
aiohttp
aiohttp-retry
```

### Frontend (`package.json`):
```json
{
  \"dependencies\": {
    \"react\": \"^18.2.0\",
    \"react-dom\": \"^18.2.0\",
    \"react-router-dom\": \"^6.x\",
    \"axios\": \"^1.x\",
    \"sonner\": \"^1.x\",
    \"lucide-react\": \"^0.x\",
    \"@radix-ui/react-select\": \"^2.x\",
    \"@radix-ui/react-dialog\": \"^1.x\",
    \"tailwindcss\": \"^3.x\"
  }
}
```

---

## 🔄 UPDATE & MAINTENANCE

### Adding New Features:
1. Backend: Add routes in `server.py`
2. Frontend: Create page in `src/pages/`
3. Update navigation in dashboard components
4. Test thoroughly
5. Update documentation

### Database Backup:
```bash
mongodump --db hostelease --out /backup/
```

### Database Restore:
```bash
mongorestore --db hostelease /backup/hostelease/
```

---

## 📈 FUTURE ENHANCEMENTS

Potential features to add:
1. ✅ Anonymous Feedback System
2. ✅ Book Your Hostel (Room Booking)
3. Payment Gateway Integration (Stripe/Razorpay)
4. Push Notifications (Firebase)
5. Mobile App (React Native)
6. Admin Analytics Dashboard
7. Student Performance Tracking
8. Mess Fee Calculation
9. Room Change Requests
10. Visitor Management

---

## 📞 SUPPORT

For issues or questions:
1. Check documentation above
2. Review API documentation at `/docs` endpoint
3. Check backend logs: `/var/log/supervisor/backend.err.log`
4. Check frontend console errors

---

## 📄 LICENSE

This project is created for educational purposes as a final year project.

---

## 👨‍💻 DEVELOPER NOTES

- **Code Quality**: Follow PEP 8 for Python, ESLint for JavaScript
- **Security**: Never commit `.env` files to Git
- **Testing**: Test all features before deployment
- **Documentation**: Keep this README updated with changes
- **Version Control**: Use meaningful commit messages

---

**Last Updated**: January 2026
**Version**: 1.0.0
**Status**: Production Ready ✅
"
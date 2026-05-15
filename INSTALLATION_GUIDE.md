"# 🚀 HOSTELEASE - Complete Installation & Running Guide

## 📋 TABLE OF CONTENTS
1. [System Requirements](#system-requirements)
2. [Quick Start Guide](#quick-start-guide)
3. [Detailed Installation](#detailed-installation)
4. [Running the Application](#running-the-application)
5. [Testing Guide](#testing-guide)
6. [API Keys Configuration](#api-keys-configuration)
7. [Troubleshooting](#troubleshooting)
8. [Production Deployment](#production-deployment)

---

## 🖥️ SYSTEM REQUIREMENTS

### Minimum Requirements:
- **OS**: Ubuntu 20.04+ / macOS / Windows 10+ (with WSL)
- **RAM**: 4GB minimum, 8GB recommended
- **Storage**: 2GB free space
- **Internet**: Required for package installation and API calls

### Software Requirements:
- **Python**: 3.11 or higher
- **Node.js**: 18.x or higher
- **MongoDB**: 4.4 or higher
- **Git**: For version control

---

## ⚡ QUICK START GUIDE

### For Linux/macOS:

```bash
# 1. Clone or navigate to project directory
cd /app

# 2. Install backend dependencies
cd backend
pip install -r requirements.txt

# 3. Seed the database
python seed_from_excel.py

# 4. Start backend (in new terminal)
uvicorn server:app --host 0.0.0.0 --port 8001 --reload

# 5. Install frontend dependencies (in new terminal)
cd ../frontend
yarn install

# 6. Start frontend
yarn start

# Application will open at http://localhost:3000
```

### Quick Test:
- **Login**: username: `admin`, password: `hostel@123`
- Or use any student: username: `adityajoshi`, password: `hostel@123`

---

## 📦 DETAILED INSTALLATION

### Step 1: Install Python Dependencies

```bash
cd /app/backend

# Option A: Using pip
pip install fastapi uvicorn motor python-jose passlib pymongo python-multipart twilio resend emergentintegrations Pillow pandas openpyxl bcrypt cryptography email-validator python-dotenv aiohttp aiohttp-retry

# Option B: Using requirements.txt (recommended)
pip install -r requirements.txt

# Verify installation
python -c \"import fastapi, motor, pymongo; print('✓ All backend packages installed')\"
```

**Packages Installed:**
- `fastapi` - Web framework
- `uvicorn` - ASGI server
- `motor` - Async MongoDB driver
- `pymongo` - MongoDB operations
- `python-jose` - JWT handling
- `passlib` - Password hashing
- `python-multipart` - File upload support
- `twilio` - SMS service
- `resend` - Email service
- `emergentintegrations` - AI/LLM integrations
- `Pillow` - Image processing
- `pandas`, `openpyxl` - Excel file reading
- `bcrypt`, `cryptography` - Security
- `email-validator` - Email validation
- `python-dotenv` - Environment variables
- `aiohttp` - Async HTTP client

### Step 2: Configure Backend Environment

```bash
cd /app/backend

# Edit .env file (or create if not exists)
nano .env
```

**Required Configuration** (`/app/backend/.env`):
```env
# Database
MONGO_URL=mongodb://localhost:27017
DB_NAME=hostelease

# JWT Security
JWT_SECRET_KEY=hostelease-secret-key-2025

# CORS (for development, use specific origin in production)
CORS_ORIGINS=*

# Optional: OpenAI (for AI feedback analysis)
OPENAI_API_KEY=sk-proj-your_key_here

# Optional: Twilio (for SMS/OTP)
TWILIO_ACCOUNT_SID=ACxxxxx
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_PHONE_NUMBER=+1234567890

# Optional: Resend (for Email)
RESEND_API_KEY=re_xxxxx
SENDER_EMAIL=noreply@yourdomain.com
```

**Note**: The application will work without optional API keys, but those features will be disabled.

### Step 3: Install MongoDB

**Ubuntu/Debian:**
```bash
# Import MongoDB GPG key
wget -qO - https://www.mongodb.org/static/pgp/server-6.0.asc | sudo apt-key add -

# Add MongoDB repository
echo \"deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu focal/mongodb-org/6.0 multiverse\" | sudo tee /etc/apt/sources.list.d/mongodb-org-6.0.list

# Update and install
sudo apt update
sudo apt install -y mongodb-org

# Start MongoDB
sudo systemctl start mongod
sudo systemctl enable mongod

# Verify
sudo systemctl status mongod
```

**macOS:**
```bash
# Using Homebrew
brew tap mongodb/brew
brew install mongodb-community@6.0
brew services start mongodb-community@6.0
```

**Windows:**
Download and install from: https://www.mongodb.com/try/download/community

### Step 4: Seed the Database

```bash
cd /app/backend

# Run seed script
python seed_from_excel.py
```

**Expected Output:**
```
🌱 Seeding HOSTELEASE database from Excel...
✅ Admin user created (username: admin, password: hostel@123)
📊 Found 30 students in Excel file
✅ Created 30 student users from Excel
✅ Created weekly mess menu
✅ Created 54 hostel bed availability records
✅ Created sample voting items
✅ Created sample notifications

🎉 Database seeding completed successfully!

📝 Login Credentials:
   Admin - username: admin, password: hostel@123
   Students - username: <studentname> (lowercase, no spaces), password: hostel@123
```

### Step 5: Install Node.js and Yarn

**Ubuntu/Debian:**
```bash
# Install Node.js 18.x
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Install Yarn
npm install -g yarn

# Verify
node --version  # Should be v18.x or higher
yarn --version
```

**macOS:**
```bash
# Using Homebrew
brew install node@18
npm install -g yarn
```

**Windows:**
Download from: https://nodejs.org/ (LTS version)

### Step 6: Install Frontend Dependencies

```bash
cd /app/frontend

# Install all packages
yarn install

# This will install:
# - React & React-DOM
# - React Router DOM
# - Axios (API calls)
# - Tailwind CSS
# - Shadcn UI components
# - Lucide React (icons)
# - Sonner (toast notifications)
# - And all other dependencies
```

**If yarn install fails:**
```bash
# Clear cache and retry
yarn cache clean
rm -rf node_modules package-lock.json
yarn install
```

### Step 7: Configure Frontend Environment

```bash
cd /app/frontend

# Edit .env file
nano .env
```

**Configuration** (`/app/frontend/.env`):
```env
# For Development
REACT_APP_BACKEND_URL=http://localhost:8001

# For Production (update with your domain)
# REACT_APP_BACKEND_URL=https://your-domain.com
```

---

## 🏃 RUNNING THE APPLICATION

### Method 1: Manual Start (Development)

**Terminal 1 - Backend:**
```bash
cd /app/backend
uvicorn server:app --host 0.0.0.0 --port 8001 --reload
```

Expected output:
```
INFO:     Uvicorn running on http://0.0.0.0:8001 (Press CTRL+C to quit)
INFO:     Started reloader process
INFO:     Started server process
INFO:     Waiting for application startup.
INFO:     Application startup complete.
```

**Terminal 2 - Frontend:**
```bash
cd /app/frontend
yarn start
```

Expected output:
```
Compiled successfully!

You can now view emergent-app in the browser.

  Local:            http://localhost:3000
  On Your Network:  http://192.168.x.x:3000
```

**Application URLs:**
- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:8001
- **API Docs**: http://localhost:8001/docs (Swagger UI)
- **API Redoc**: http://localhost:8001/redoc

### Method 2: Using Supervisor (Production)

If supervisor is installed:

```bash
# Start both services
sudo supervisorctl start backend frontend

# Check status
sudo supervisorctl status

# View logs
tail -f /var/log/supervisor/backend.out.log
tail -f /var/log/supervisor/frontend.out.log

# Restart services
sudo supervisorctl restart backend frontend

# Stop services
sudo supervisorctl stop backend frontend
```

### Method 3: Using PM2 (Alternative Production)

```bash
# Install PM2
npm install -g pm2

# Start backend
cd /app/backend
pm2 start \"uvicorn server:app --host 0.0.0.0 --port 8001\" --name hostelease-backend

# Start frontend (build first)
cd /app/frontend
yarn build
pm2 serve build 3000 --name hostelease-frontend --spa

# View logs
pm2 logs

# Stop
pm2 stop all

# Restart
pm2 restart all
```

---

## 🧪 TESTING GUIDE

### 1. Backend API Testing

**Test Server Running:**
```bash
curl http://localhost:8001/docs
# Should return HTML page
```

**Test Login Endpoint:**
```bash
# Admin login
curl -X POST http://localhost:8001/api/auth/login \
  -H \"Content-Type: application/json\" \
  -d '{\"username\":\"admin\",\"password\":\"hostel@123\"}'

# Expected response:
# {\"access_token\":\"eyJ...\",\"token_type\":\"bearer\",\"user\":{...}}
```

**Test Student Login:**
```bash
curl -X POST http://localhost:8001/api/auth/login \
  -H \"Content-Type: application/json\" \
  -d '{\"username\":\"adityajoshi\",\"password\":\"hostel@123\"}'
```

**Test Protected Endpoint:**
```bash
# Get token from login response
TOKEN=\"your_jwt_token_here\"

# Test mess menu endpoint
curl -X GET http://localhost:8001/api/mess-menu \
  -H \"Authorization: Bearer $TOKEN\"
```

**Test File Upload:**
```bash
curl -X POST http://localhost:8001/api/complaints \
  -H \"Authorization: Bearer $TOKEN\" \
  -F \"category=electricity\" \
  -F \"description=Testing complaint with image upload\" \
  -F \"image=@/path/to/test/image.jpg\"
```

### 2. Frontend Testing

**Manual Testing Checklist:**

✅ **Login Page:**
- [ ] Can see login form
- [ ] Student/Warden role toggle works
- [ ] Login with valid credentials works
- [ ] Login with invalid credentials shows error
- [ ] \"Forgot Password\" link works

✅ **Student Dashboard:**
- [ ] Dashboard loads after login
- [ ] Shows correct student name
- [ ] All navigation links work
- [ ] Quick access cards are clickable

✅ **Profile Page:**
- [ ] Personal & Academic Details show correctly
- [ ] Family Contact Information displays
- [ ] Room & Residency Details visible
- [ ] Password change works

✅ **Complaints:**
- [ ] Can view complaint form
- [ ] Can select category
- [ ] Can type description (10-1000 chars)
- [ ] Can upload image (< 5MB)
- [ ] Image preview shows
- [ ] Can remove uploaded image
- [ ] Complaint submits successfully
- [ ] Can view complaint history
- [ ] Uploaded images display in history

✅ **Mess Menu:**
- [ ] Weekly menu displays
- [ ] All 7 days show correctly
- [ ] Breakfast, lunch, dinner items visible

✅ **Food Feedback:**
- [ ] Can select meal type
- [ ] Star rating works (1-5)
- [ ] Can write suggestions
- [ ] Form submits successfully

✅ **Food Voting:**
- [ ] Voting items display
- [ ] Can vote (only during 9-10 PM)
- [ ] Shows time restriction message
- [ ] Vote counts update

✅ **OTP/Password Reset:**
- [ ] Can request OTP via email/phone
- [ ] Can enter 6-digit OTP
- [ ] Can set new password
- [ ] Can login with new password

### 3. Integration Testing

**Test with Real API Keys:**

```bash
# 1. Add real API keys to .env
nano /app/backend/.env

# 2. Restart backend
sudo supervisorctl restart backend

# 3. Test OpenAI Integration (Admin panel)
# Login as admin → Food Feedback Management → Click \"Analyze Feedback with AI\"

# 4. Test Twilio SMS
# Go to Forgot Password → Select Phone → Enter number → Should receive SMS

# 5. Test Resend Email
# Go to Forgot Password → Select Email → Enter email → Should receive email
```

---

## 🔑 API KEYS CONFIGURATION

### 1. OpenAI API Key (for AI Feedback Analysis)

**Get Key:**
1. Visit: https://platform.openai.com/
2. Sign up / Login
3. Go to: API Keys section
4. Click \"Create new secret key\"
5. Copy key (starts with `sk-proj-...`)

**Add to .env:**
```env
OPENAI_API_KEY=sk-proj-your_actual_key_here
```

**Usage**: Admin can analyze student food suggestions using AI to extract top 10 requested items.

**Cost**: ~$0.01 per analysis (GPT-4o pricing)

### 2. Twilio API (for SMS/OTP)

**Get Credentials:**
1. Visit: https://www.twilio.com/
2. Sign up (free trial includes $15 credit)
3. Get Account SID and Auth Token from dashboard
4. Get a Twilio phone number

**Add to .env:**
```env
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token_here
TWILIO_PHONE_NUMBER=+1234567890
```

**Usage**: 
- Send OTP via SMS for password reset
- Send attendance notifications to parents

**Cost**: ~$0.0075 per SMS (varies by country)

### 3. Resend API (for Email)

**Get Key:**
1. Visit: https://resend.com/
2. Sign up (free tier: 3,000 emails/month)
3. Create API key
4. Verify your domain (or use their test domain)

**Add to .env:**
```env
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxx
SENDER_EMAIL=noreply@yourdomain.com
```

**Usage**: Send OTP via email for password reset

**Cost**: Free for 3,000 emails/month

### Testing API Keys:

```bash
# Test OpenAI
curl https://api.openai.com/v1/models \
  -H \"Authorization: Bearer $OPENAI_API_KEY\"

# Test Twilio (from Python)
python3 << EOF
from twilio.rest import Client
client = Client('YOUR_SID', 'YOUR_TOKEN')
message = client.messages.create(
    body='Test from HOSTELEASE',
    from_='+1234567890',
    to='+919876543210'
)
print(f\"Message sent: {message.sid}\")
EOF

# Test Resend (from Python)
python3 << EOF
import resend
resend.api_key = 'YOUR_API_KEY'
resend.Emails.send({
    \"from\": \"test@resend.dev\",
    \"to\": \"your@email.com\",
    \"subject\": \"Test\",
    \"html\": \"<p>Test email</p>\"
})
print(\"Email sent!\")
EOF
```

---

## 🐛 TROUBLESHOOTING

### Issue 1: Backend Won't Start

**Symptom**: `uvicorn` command fails or crashes

**Solutions:**
```bash
# Check Python version
python --version  # Should be 3.11+

# Reinstall dependencies
cd /app/backend
pip install --upgrade -r requirements.txt

# Check for port conflicts
sudo lsof -i :8001
# If something is using port 8001, kill it:
sudo kill -9 <PID>

# Check MongoDB is running
sudo systemctl status mongod
sudo systemctl start mongod

# View detailed error
cd /app/backend
python -c \"import server; print('OK')\"
```

### Issue 2: Frontend Won't Start

**Symptom**: `yarn start` fails or shows errors

**Solutions:**
```bash
# Check Node version
node --version  # Should be 18+

# Clear and reinstall
cd /app/frontend
rm -rf node_modules package-lock.json yarn.lock
yarn cache clean
yarn install

# If still fails, check for syntax errors
yarn build
```

### Issue 3: MongoDB Connection Failed

**Symptom**: Backend logs show \"Failed to connect to MongoDB\"

**Solutions:**
```bash
# Check if MongoDB is running
sudo systemctl status mongod

# Start MongoDB
sudo systemctl start mongod

# Check connection
mongo --eval \"db.adminCommand('ping')\"

# Check .env file
cat /app/backend/.env | grep MONGO_URL
# Should be: MONGO_URL=mongodb://localhost:27017
```

### Issue 4: File Upload Fails

**Symptom**: \"File upload failed\" error

**Solutions:**
```bash
# Check uploads directory exists
ls -la /app/backend/uploads/

# Create if missing
mkdir -p /app/backend/uploads/
chmod 755 /app/backend/uploads/

# Check file size and type
# Max: 5MB
# Allowed: JPEG, PNG, GIF, WebP

# Check Pillow installation
python -c \"from PIL import Image; print('✓ Pillow OK')\"
```

### Issue 5: OTP Not Received

**Symptom**: OTP not arriving via SMS or Email

**Solutions:**
```bash
# Check API keys in .env
cat /app/backend/.env | grep -E \"TWILIO|RESEND\"

# Check backend logs
tail -f /var/log/supervisor/backend.err.log

# Test Twilio credentials
python3 -c \"from twilio.rest import Client; c = Client('SID', 'TOKEN'); print('✓ OK')\"

# Test Resend credentials
python3 -c \"import resend; resend.api_key='KEY'; print('✓ OK')\"

# Check phone number format (must include country code)
# Example: +919876543210 (India)
```

### Issue 6: CORS Error

**Symptom**: Frontend shows \"CORS policy\" error

**Solutions:**
```bash
# Check .env files
cat /app/backend/.env | grep CORS_ORIGINS
cat /app/frontend/.env | grep REACT_APP_BACKEND_URL

# Backend .env should have:
CORS_ORIGINS=*
# Or specific: CORS_ORIGINS=http://localhost:3000

# Frontend .env should match backend URL:
REACT_APP_BACKEND_URL=http://localhost:8001

# Restart both services
sudo supervisorctl restart backend frontend
```

### Issue 7: Login Fails with Correct Credentials

**Symptom**: \"Invalid credentials\" error with correct password

**Solutions:**
```bash
# Re-seed database
cd /app/backend
python seed_from_excel.py

# Try default credentials:
# Username: admin
# Password: hostel@123

# Check database
mongo
> use hostelease
> db.users.find({username: \"admin\"}).pretty()
> exit

# Reset admin password manually
python3 << EOF
from passlib.context import CryptContext
pwd_context = CryptContext(schemes=[\"bcrypt\"], deprecated=\"auto\")
print(pwd_context.hash(\"hostel@123\"))
EOF
# Copy the hash and update in MongoDB
```

---

## 🚀 PRODUCTION DEPLOYMENT

### Using Supervisor (Recommended)

1. **Install Supervisor:**
```bash
sudo apt install supervisor
```

2. **Create config files:**

`/etc/supervisor/conf.d/hostelease-backend.conf`:
```ini
[program:hostelease-backend]
command=/usr/bin/python3 -m uvicorn server:app --host 0.0.0.0 --port 8001
directory=/app/backend
user=ubuntu
autostart=true
autorestart=true
stderr_logfile=/var/log/supervisor/hostelease-backend.err.log
stdout_logfile=/var/log/supervisor/hostelease-backend.out.log
```

`/etc/supervisor/conf.d/hostelease-frontend.conf`:
```ini
[program:hostelease-frontend]
command=/usr/bin/yarn start
directory=/app/frontend
user=ubuntu
autostart=true
autorestart=true
stderr_logfile=/var/log/supervisor/hostelease-frontend.err.log
stdout_logfile=/var/log/supervisor/hostelease-frontend.out.log
```

3. **Reload supervisor:**
```bash
sudo supervisorctl reread
sudo supervisorctl update
sudo supervisorctl status
```

### Using Nginx (Reverse Proxy)

```nginx
server {
    listen 80;
    server_name your-domain.com;

    # Frontend
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # Backend API
    location /api {
        proxy_pass http://localhost:8001;
        proxy_http_version 1.1;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header Host $http_host;
    }

    # Uploaded files
    location /uploads {
        proxy_pass http://localhost:8001/uploads;
    }
}
```

### SSL with Let's Encrypt

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

---

## 📊 PERFORMANCE OPTIMIZATION

### Backend:
- Use production ASGI server (Gunicorn + Uvicorn workers)
- Enable MongoDB indexes
- Implement Redis caching
- Add rate limiting

### Frontend:
- Build for production: `yarn build`
- Use CDN for static assets
- Enable gzip compression
- Implement lazy loading

---

## 🎉 SUCCESS INDICATORS

✅ **Backend is ready when:**
- API docs accessible at http://localhost:8001/docs
- Login endpoint returns JWT token
- No errors in logs

✅ **Frontend is ready when:**
- Application loads at http://localhost:3000
- Login page displays correctly
- Can navigate between pages

✅ **System is fully functional when:**
- Can login as admin/student
- Can submit complaints with images
- Can view all dashboard features
- OTP system works (if API keys configured)
- AI feedback analysis works (if OpenAI key configured)

---

## 📞 SUPPORT

If you encounter issues not covered here:
1. Check logs: `/var/log/supervisor/*.log`
2. Review backend logs for API errors
3. Check browser console for frontend errors
4. Verify all environment variables are set correctly
5. Ensure all services (MongoDB, backend, frontend) are running

---

**Last Updated**: January 2026
**Guide Version**: 1.0
**Application Version**: 1.0.0
"
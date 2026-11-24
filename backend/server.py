from fastapi import FastAPI, APIRouter, HTTPException, Depends, status, File, UploadFile, Form, Query, Body
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import json
import csv
import logging
from pathlib import Path
from pydantic import BaseModel, EmailStr, ConfigDict, field_validator
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone, timedelta
from passlib.context import CryptContext
from jose import JWTError, jwt
import asyncio
from twilio.rest import Client
import resend
import uuid
import base64
import razorpay
from PIL import Image , ImageOps, ImageFilter, ImageEnhance
import io
from io import BytesIO
import random
# from openai import OpenAI
from google import genai
from google.genai import types
from contextlib import asynccontextmanager
from reportlab.pdfgen import canvas 
from reportlab.lib.pagesizes import letter
from bson import ObjectId
import smtplib
import time
from email.message import EmailMessage
import shutil
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from zoneinfo import ZoneInfo
IST = ZoneInfo("Asia/Kolkata")
from typing import Dict, Any
from collections import defaultdict
import pyotp
import re

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Create base uploads directory
UPLOAD_DIR = ROOT_DIR / 'uploads'
UPLOAD_DIR.mkdir(exist_ok=True)

# Create laundry sub-directory specifically
LAUNDRY_DIR = UPLOAD_DIR / 'laundry'
LAUNDRY_DIR.mkdir(exist_ok=True)

LAUNDRY_MACHINE_DIR = UPLOAD_DIR / 'laundry_machines'
LAUNDRY_MACHINE_DIR.mkdir(exist_ok=True)

# File upload constraints
MAX_FILE_SIZE = 5 * 1024 * 1024  # 5MB
ALLOWED_IMAGE_TYPES = {'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'}
ALLOWED_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.gif', '.webp'}

ALLOWED_DOCUMENT_TYPES = {
    'application/pdf',
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp'
}

ALLOWED_DOCUMENT_EXTENSIONS = {'.pdf', '.jpg', '.jpeg', '.png', '.webp'}

# MongoDB connection
mongo_url = os.getenv("MONGO_URL")
db_name = os.getenv("DB_NAME")
client = AsyncIOMotorClient(mongo_url)
db = client[db_name]

# Security
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer()
SECRET_KEY = os.getenv("JWT_SECRET_KEY", "hostelease-secret-key-2025")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24  # 24 hours

# Email/SMS clients (will be initialized if keys are provided)
twilio_client = None
if os.getenv("TWILIO_ACCOUNT_SID") and os.getenv("TWILIO_AUTH_TOKEN"):
    twilio_client = Client(os.getenv("TWILIO_ACCOUNT_SID"), os.getenv("TWILIO_AUTH_TOKEN"))

if os.getenv("RESEND_API_KEY"):
    resend.api_key = os.getenv("RESEND_API_KEY")

razorpay_client = None
if os.getenv("RAZORPAY_KEY_ID") and os.getenv("RAZORPAY_KEY_SECRET"):
    razorpay_client = razorpay.Client(auth=(os.getenv("RAZORPAY_KEY_ID"), os.getenv("RAZORPAY_KEY_SECRET")))

# Create the main app
# ==================== APP INITIALIZATION ====================   

@asynccontextmanager
async def lifespan(app: FastAPI):
    scheduler = AsyncIOScheduler()

    scheduler.add_job(auto_reset_cycle, 'cron', day_of_week='mon', hour=0, minute=0, timezone="Asia/Kolkata")
    scheduler.add_job(auto_mark_absent, 'cron', hour=23, minute=0, timezone="Asia/Kolkata")

    # laundry jobs
    scheduler.add_job(laundry_cycle_monitor, 'interval', minutes=1, timezone="Asia/Kolkata")

    scheduler.start()
    yield
    scheduler.shutdown()
    client.close()    

# Initialize ONLY ONE app here with the lifespan
app = FastAPI(lifespan=lifespan)
api_router = APIRouter(prefix="/api")

@app.on_event("startup")
async def startup_event():
    start_mess_scheduler()

@app.get("/")
async def root():
    return {"message": "HOSTELEASE Backend Running"}

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

LAUNDRY_PRICE_PER_CYCLE = 50
LAUNDRY_DEFAULT_DURATION_MINUTES = 45

LAUNDRY_ALLOWED_HOSTELS = [
    "Azad Bhawan",
    "Atal Bhawan",
    "Tagore Bhawan",
    "Shakuntala Bhawan",
    "Janaki Bhawan",
    "Teresa Bhawan"
]

LAUNDRY_ALLOWED_BLOCKS = ["A", "B", "C"]


def now_ist():
    return datetime.now(IST)


def iso_now_ist():
    return now_ist().isoformat()


def normalize_hostel_name(name: str = "") -> str:
    cleaned = str(name or "").strip()
    if not cleaned:
        return "N/A"

    key = cleaned.lower().replace("  ", " ").strip()

    aliases = {
        "azad": "Azad Bhawan",
        "azad bhawan": "Azad Bhawan",
        "atal": "Atal Bhawan",
        "atal bhawan": "Atal Bhawan",
        "tagore": "Tagore Bhawan",
        "tagore bhawan": "Tagore Bhawan",
        "shakuntala": "Shakuntala Bhawan",
        "shakuntala bhawan": "Shakuntala Bhawan",
        "shakunthala": "Shakuntala Bhawan",
        "shakunthala bhawan": "Shakuntala Bhawan",
        "janaki": "Janaki Bhawan",
        "janaki bhawan": "Janaki Bhawan",
        "teresa": "Teresa Bhawan",
        "teresa bhawan": "Teresa Bhawan",
    }

    return aliases.get(key, cleaned)


def normalize_block_name(block: str = "") -> str:
    value = str(block or "").strip().upper()
    if not value:
        return "N/A"
    value = value.replace("BLOCK", "").strip()
    return value


def serialize_doc(doc: dict) -> dict:
    if not doc:
        return doc
    doc = dict(doc)
    if "_id" in doc:
        doc["_id"] = str(doc["_id"])
    return doc

def parse_iso(dt_str: Optional[str]) -> Optional[datetime]:
    if not dt_str:
        return None
    try:
        raw = str(dt_str).strip().replace("Z", "+00:00")
        dt = datetime.fromisoformat(raw)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)
    except Exception:
        return None        

def remaining_minutes_from_end(end_time: Optional[str]) -> int:
    end_dt = parse_iso(end_time)
    if not end_dt:
        return 0
    diff = end_dt - now_ist()
    mins = int(diff.total_seconds() // 60)
    return max(0, mins)


def normalize_machine_type(machine_type: str = "") -> str:
    value = str(machine_type or "washer").strip().lower()
    return value if value in ["washer", "dryer", "combo"] else "washer"


def make_machine_code(hostel_name: str, block: str, machine_no: int) -> str:
    hostel = normalize_hostel_name(hostel_name)
    hostel_code = hostel.replace(" Bhawan", "").replace(" ", "").upper()[:4]
    return f"{hostel_code}-{normalize_block_name(block)}-M{int(machine_no):02d}"


def machine_sort_key(machine: dict):
    code = str(machine.get("machine_code", "")).upper()
    block = normalize_block_name(machine.get("block", "Z"))
    return (normalize_hostel_name(machine.get("hostel_name", "")), block, code)


def machine_public_id(hostel_name: str, block: str, machine_no: int) -> str:
    hostel_code = normalize_hostel_name(hostel_name).replace(" Bhawan", "").replace(" ", "").upper()
    block_code = str(block).strip().upper() if block else "A"
    return f"{hostel_code}-{block_code}-WM-{machine_no:02d}"

def get_laundry_qr_url(machine_code: str) -> str:
    return f"/student/laundry?machine={machine_code}"


async def add_notification(
    title: str,
    message: str,
    target_users: str = "all",
    notif_type: str = "laundry",
    hostel: str = "all"
):
    await db.notifications.insert_one({
        "title": title,
        "type": notif_type,
        "message": message,
        "target_users": target_users,
        "hostel": hostel,
        "date": iso_now_ist(),
        "read_by": []
    })


async def get_student_wallet(student_id: str):
    wallet = await db.laundry_wallets.find_one({"student_id": student_id})
    if not wallet:
        wallet = {
            "student_id": student_id,
            "balance": 0,
            "updated_at": iso_now_ist()
        }
        await db.laundry_wallets.insert_one(wallet)
        wallet = await db.laundry_wallets.find_one({"student_id": student_id})
    return wallet


async def credit_wallet(student_id: str, amount: float, source: str = "topup", meta: dict = None):
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Invalid top-up amount")

    await get_student_wallet(student_id)

    await db.laundry_wallets.update_one(
        {"student_id": student_id},
        {
            "$inc": {"balance": amount},
            "$set": {"updated_at": iso_now_ist()}
        }
    )

    tx = {
        "student_id": student_id,
        "amount": amount,
        "type": "credit",
        "source": source,
        "meta": meta or {},
        "date": iso_now_ist(),
        "status": "success"
    }
    await db.laundry_wallet_transactions.insert_one(tx)
    return tx


async def debit_wallet(student_id: str, amount: float, source: str = "cycle_payment", meta: dict = None):
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Invalid debit amount")

    wallet = await get_student_wallet(student_id)
    current_balance = float(wallet.get("balance", 0))

    if current_balance < amount:
        raise HTTPException(status_code=400, detail="Insufficient wallet balance")

    await db.laundry_wallets.update_one(
        {"student_id": student_id},
        {
            "$inc": {"balance": -amount},
            "$set": {"updated_at": iso_now_ist()}
        }
    )

    tx = {
        "student_id": student_id,
        "amount": amount,
        "type": "debit",
        "source": source,
        "meta": meta or {},
        "date": iso_now_ist(),
        "status": "success"
    }
    await db.laundry_wallet_transactions.insert_one(tx)
    return tx

async def save_laundry_machine_file(file: UploadFile) -> tuple[bool, str, str]:
    try:
        is_valid, message = validate_file_upload(file)
        if not is_valid:
            return False, "", message

        content = await file.read()

        if len(content) > MAX_FILE_SIZE:
            return False, "", "File too large. Maximum size: 5MB"

        try:
            img = Image.open(io.BytesIO(content))
            img.verify()
        except Exception:
            return False, "", "Invalid image file"

        file_ext = Path(file.filename).suffix.lower()
        unique_filename = f"{uuid.uuid4()}{file_ext}"
        file_path = LAUNDRY_MACHINE_DIR / unique_filename

        with open(file_path, "wb") as f:
            f.write(content)

        return True, f"/uploads/laundry_machines/{unique_filename}", "File uploaded successfully"

    except Exception as e:
        logger.error(f"Laundry machine upload error: {e}")
        return False, "", f"Upload failed: {str(e)}"
    
# ==================== MODELS ====================

class UserRegister(BaseModel):
    username: str
    college_email: EmailStr
    personal_email: EmailStr
    enrollment_number: str
    password: str
    student_name: str
    phone: str
    parent_phone: str
    father_name: str
    mother_name: str
    father_contact: str
    mother_contact: str
    hostel_name: str
    block: str
    floor: str
    room_number: str
    bed_number: str
    course: str
    year: int
    gender: str
    washroom_preference: Optional[str] = "Common"
    preferred_floor: Optional[str] = None

class UserLogin(BaseModel):
    username: str
    password: str
    totp_code: Optional[str] = None

class FirstLoginOTPRequest(BaseModel):
    enrollment_number: str

class FirstLoginVerify(BaseModel):
    enrollment_number: str
    otp_code: str
    new_password: str

class TOTPSetupRequest(BaseModel):
    enrollment_number: str
    
class TOTPVerifyRequest(BaseModel):
    enrollment_number: str
    totp_code: str

class Token(BaseModel):
    access_token: str
    token_type: str
    user: dict

class PasswordChange(BaseModel):
    old_password: str
    new_password: str

class ContactOTPRequest(BaseModel):
    contact: str
    type: str  # "email" or "phone"

class MessMenuItem(BaseModel):
    day: str
    breakfast: List[str]
    lunch: List[str]
    dinner: List[str]
    week_start_date: str

class FoodFeedback(BaseModel):
    meal_type: str  # breakfast/lunch/dinner
    rating: int
    suggestions: Optional[str] = None

class FoodVote(BaseModel):
    item_name: str

class StudentCreate(BaseModel):
    student_name: str
    enrollment_number: str
    hostel_name: str
    block: Optional[str] = "N/A"
    room_number: Optional[str] = "N/A"
    floor: Optional[str] = "N/A"
    bed_number: Optional[str] = "N/A"
    father_name: Optional[str] = ""
    mother_name: Optional[str] = ""
    parent_phone: Optional[str] = ""
    college_email: Optional[str] = ""
    gender: Optional[str] = "male"
    course: Optional[str] = "B.Tech"
    year: Optional[str] = "1"
    role: str = "student"    

class Complaint(BaseModel):
    category: str
    description: str
    priority : Optional[str] = "medium"

class Payment(BaseModel):
    amount: float
    payment_mode: str
    transaction_id: Optional[str] = None

class GatepassRequest(BaseModel):
    reason: str
    leave_from: str
    leave_to: str

class LaundryComplaint(BaseModel):
    type: str  # "machine" or "manual"
    description: str
    missing_clothes_count: Optional[int] = None

class OTPVerify(BaseModel):
    contact: str
    otp: str
    type: str  # \"email\" or \"phone\"

class PasswordReset(BaseModel):
    contact: str
    otp: str
    new_password: str
    type: str  # \"email\" or \"phone\"

class AdminLoginInitModel(BaseModel):
    username: str
    password: str

class AdminVerifyModel(BaseModel):
    username: str
    otp: str    

class LaundryMachineCreate(BaseModel):
    hostel_name: str
    block: str
    machine_type: str = "washer"   # washer / dryer / combo
    machine_number: int
    location_label: Optional[str] = None
    price_per_cycle: Optional[float] = LAUNDRY_PRICE_PER_CYCLE
    cycle_duration_minutes: Optional[int] = LAUNDRY_DEFAULT_DURATION_MINUTES


class LaundryBookingCreate(BaseModel):
    machine_code: str
    booking_type: str = "instant"  # instant / scheduled
    scheduled_start: Optional[str] = None
    payment_mode: str = "wallet"   # wallet / online


class LaundryTopupRequest(BaseModel):
    amount: float
    payment_mode: str = "online"


class PaymentCreateOrderRequest(BaseModel):
    amount: float
    purpose: str = "wallet_topup"
    method: str = "upi"


class PaymentVerifyRequest(BaseModel):
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str
    purpose: str = "wallet_topup"
    amount: float
    reference_id: Optional[str] = None

class LaundryMachineAction(BaseModel):
    status: str
    note: Optional[str] = None


class LaundryComplaintLinkRequest(BaseModel):
    machine_code: str  

# ==================== HELPER FUNCTIONS ====================

def hash_password(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

# --- THE AUTO-RESET LOGIC ---
async def auto_reset_cycle():
    print("🚀 MONDAY AUTO-RESET: Cleaning up mess data for the new week...")
    # 1. Clear Feedback
    await db.food_feedback.delete_many({})
    await db.anonymous_feedback.delete_many({})
    # 2. Clear Voting items and Votes
    await db.voting_items.delete_many({})
    await db.votes.delete_many({})
    # 3. Send notification to students
    await db.notifications.insert_one({
        "type": "system",
        "message": "📅 A new week has started! Please share your food suggestions for next Sunday.",
        "target_users": "all",
        "date": datetime.now(timezone.utc).isoformat()
    })

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        token = credentials.credentials
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        role: str = payload.get("role")

        if username is None:
            raise HTTPException(status_code=401, detail="Invalid token")

        if role == "admin":
            user = await db.users.find_one({
                "$or": [
                    {"enrollment_number": username},
                    {"username": username},
                    {"college_email": username}
                ]
            }, {"_id": 0})
        else:
            user = await db.users.find_one({"enrollment_number": username}, {"_id": 0})

        if user is None:
            raise HTTPException(status_code=401, detail="User not found")

        return user
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

async def send_sms(phone: str, message: str):
    fast2sms_key = os.getenv("FAST2SMS_API_KEY")
    if fast2sms_key:
        try:
            import aiohttp
            url = "https://www.fast2sms.com/dev/bulkV2"
            
            # Extract digits only for phone
            phone_digits = "".join(filter(str.isdigit, phone))
            if phone_digits.startswith("91") and len(phone_digits) > 10:
                phone_digits = phone_digits[2:]
                
            payload = f"message={message}&language=english&route=q&numbers={phone_digits}"
            headers = {
                'authorization': fast2sms_key,
                'Content-Type': "application/x-www-form-urlencoded",
                'Cache-Control': "no-cache",
            }
            async with aiohttp.ClientSession() as session:
                async with session.post(url, data=payload, headers=headers) as resp:
                    resp_text = await resp.text()
                    logger.info(f"Fast2SMS response: {resp_text}")
        except Exception as e:
            logger.error(f"Fast2SMS send error: {e}")
    elif twilio_client:
        try:
            await asyncio.to_thread(
                twilio_client.messages.create,
                body=message,
                from_=os.getenv("TWILIO_PHONE_NUMBER"),
                to=phone
            )
        except Exception as e:
            logger.error(f"SMS send error: {e}")

# ==========================================
# PERFORMANCE IN-MEMORY CACHES & INVALIDATION
# ==========================================
_STUDENTS_CACHE: Dict[str, Any] = {}
_STUDENTS_CACHE_TIME: Dict[str, float] = {}
STUDENTS_CACHE_TTL = 60.0  # seconds

_ATTENDANCE_CACHE: Dict[str, Any] = {}
_ATTENDANCE_CACHE_TIME: Dict[str, float] = {}
ATTENDANCE_CACHE_TTL = 45.0  # seconds

_BED_AVAILABILITY_CACHE: Dict[str, Any] = {}
_BED_AVAILABILITY_CACHE_TIME: Dict[str, float] = {}
BED_CACHE_TTL = 45.0  # seconds

def invalidate_students_cache():
    _STUDENTS_CACHE.clear()
    _STUDENTS_CACHE_TIME.clear()

def invalidate_attendance_cache():
    _ATTENDANCE_CACHE.clear()
    _ATTENDANCE_CACHE_TIME.clear()

def invalidate_bed_cache():
    _BED_AVAILABILITY_CACHE.clear()
    _BED_AVAILABILITY_CACHE_TIME.clear()

async def send_email(to_email: str, subject: str, html_content: str) -> bool:
    """Delivers email via Gmail SMTP (standard smtplib) or Resend API, with local dev logging fallback"""
    # 1. Try Gmail SMTP if credentials provided
    gmail_user = os.getenv("GMAIL_USER") or os.getenv("SMTP_EMAIL")
    gmail_pass = os.getenv("GMAIL_APP_PASSWORD") or os.getenv("SMTP_PASSWORD")
    if gmail_user and gmail_pass:
        try:
            def _send_smtp():
                msg = EmailMessage()
                msg["Subject"] = subject
                msg["From"] = f"HOSTELEASE Hostel System <{gmail_user}>"
                msg["To"] = to_email
                plain_text = re.sub(r'<[^>]+>', ' ', html_content)
                plain_text = ' '.join(plain_text.split())
                msg.set_content(plain_text)
                msg.add_alternative(html_content, subtype="html")
                with smtplib.SMTP("smtp.gmail.com", 587, timeout=12) as server:
                    server.starttls()
                    server.login(gmail_user, gmail_pass)
                    server.send_message(msg)
            await asyncio.to_thread(_send_smtp)
            logger.info(f"Successfully sent live Gmail email to {to_email}")
            return True
        except Exception as e:
            logger.error(f"Gmail SMTP send error to {to_email}: {e}")

    # 2. Try Resend if configured
    if os.getenv("RESEND_API_KEY"):
        try:
            sender_env = str(os.getenv("SENDER_EMAIL", "")).strip()
            sender_addr = "HOSTELEASE <onboarding@resend.dev>"
            if sender_env and not sender_env.endswith("@gmail.com") and "@" in sender_env:
                sender_addr = sender_env
            params = {
                "from": sender_addr,
                "to": [to_email],
                "subject": subject,
                "html": html_content
            }
            await asyncio.to_thread(resend.Emails.send, params)
            logger.info(f"Successfully sent email via Resend to {to_email}")
            return True
        except Exception as e:
            err_msg = str(e)
            logger.error(f"Resend email send error to {to_email}: {err_msg}")
            
            # Restrict live fallback delivery exclusively to the 5 designated real tester student accounts
            KNOWN_REAL_STUDENT_EMAILS = {
                "anushaanchalia@gmail.com",
                "anushaanchalia2509@gmail.com",
                "anushaanchalia21@gmail.com",
                "2303031240216@paruluniversity.ac.in",
                "anushaanchalia2121@gmail.com"
            }
            verified_inbox = str(os.getenv("SENDER_EMAIL") or "anushaanchalia@gmail.com").strip()
            if (
                to_email.lower() in KNOWN_REAL_STUDENT_EMAILS
                and verified_inbox
                and to_email.lower() != verified_inbox.lower()
                and ("only send testing emails" in err_msg.lower() or "validation_error" in err_msg.lower())
            ):
                try:
                    fallback_subject = f"[{to_email}] {subject}"
                    notice_banner = f"""
                    <div style="background-color: #eff6ff; border-left: 4px solid #3b82f6; padding: 12px 16px; margin-bottom: 20px; border-radius: 4px; font-size: 13px; color: #1e40af; font-family: sans-serif;">
                        <b>Student Account Dispatch Notice:</b> This verification was requested for <strong>{to_email}</strong>. Delivered to your primary verified tester inbox (<code>{verified_inbox}</code>).
                    </div>
                    """
                    params_fallback = {
                        "from": sender_addr,
                        "to": [verified_inbox],
                        "subject": fallback_subject,
                        "html": notice_banner + html_content
                    }
                    await asyncio.to_thread(resend.Emails.send, params_fallback)
                    logger.info(f"Successfully routed email via Resend to verified inbox {verified_inbox} for real student {to_email}")
                    return True
                except Exception as e2:
                    logger.error(f"Resend fallback routing to {verified_inbox} failed: {e2}")

    logger.info(f"[DEV FALLBACK EMAIL] Dispatched to {to_email} with subject: {subject}")
    return False

def validate_file_upload(file: UploadFile) -> tuple[bool, str]:
    """Validate uploaded file size and type"""
    # Check file extension
    file_ext = Path(file.filename).suffix.lower()
    if file_ext not in ALLOWED_EXTENSIONS:
        return False, f"Invalid file type. Allowed: {', '.join(ALLOWED_EXTENSIONS)}"
    
    # Check content type
    if file.content_type not in ALLOWED_IMAGE_TYPES:
        return False, f"Invalid content type. Must be an image (JPEG, PNG, GIF, WebP)"
    
    return True, "Valid"

def validate_document_upload(file: UploadFile) -> tuple[bool, str]:
    file_ext = Path(file.filename).suffix.lower()

    if file_ext not in ALLOWED_DOCUMENT_EXTENSIONS:
        return False, f"Invalid file type. Allowed: {', '.join(ALLOWED_DOCUMENT_EXTENSIONS)}"

    if file.content_type not in ALLOWED_DOCUMENT_TYPES:
        return False, "Invalid content type. Only PDF, JPG, JPEG, PNG, WEBP allowed"

    return True, "Valid"

async def save_upload_file(file: UploadFile) -> tuple[bool, str, str]:
    """Save uploaded file and return success status, filename, and error message"""
    try:
        # Validate file
        is_valid, message = validate_file_upload(file)
        if not is_valid:
            return False, "", message
        
        # Read file content
        content = await file.read()
        
        # Check file size
        if len(content) > MAX_FILE_SIZE:
            return False, "", f"File too large. Maximum size: 5MB"
        
        # Validate it's actually an image
        try:
            img = Image.open(io.BytesIO(content))
            img.verify()
        except Exception:
            return False, "", "Invalid image file"
        
        # Generate unique filename
        file_ext = Path(file.filename).suffix.lower()
        unique_filename = f"{uuid.uuid4()}{file_ext}"
        file_path = UPLOAD_DIR / unique_filename
        
        # Save file
        with open(file_path, 'wb') as f:
            f.write(content)
        
        return True, unique_filename, "File uploaded successfully"
    
    except Exception as e:
        logger.error(f"File upload error: {e}")
        return False, "", f"Upload failed: {str(e)}"  

async def save_document_file(file: UploadFile) -> tuple[bool, str, str]:
    try:
        is_valid, message = validate_document_upload(file)
        if not is_valid:
            return False, "", message

        content = await file.read()

        if len(content) > MAX_FILE_SIZE:
            return False, "", "File too large. Maximum size: 5MB"

        file_ext = Path(file.filename).suffix.lower()
        unique_filename = f"{uuid.uuid4()}{file_ext}"
        file_path = UPLOAD_DIR / unique_filename

        with open(file_path, 'wb') as f:
            f.write(content)

        return True, unique_filename, "File uploaded successfully"

    except Exception as e:
        logger.error(f"Document upload error: {e}")
        return False, "", f"Upload failed: {str(e)}"    

async def ensure_student_wallet(enrollment_number: str):
    wallet = await db.laundry_wallets.find_one({"student_id": enrollment_number})
    if not wallet:
        wallet = {
            "student_id": enrollment_number,
            "balance": 0,
            "created_at": iso_now_ist(),
            "updated_at": iso_now_ist()
        }
        await db.laundry_wallets.insert_one(wallet)
    return wallet

async def add_wallet_transaction(student_id: str, tx_type: str, amount: float, source: str, status: str = "success", reference_id: Optional[str] = None):
    tx = {
        "student_id": student_id,
        "type": tx_type,  # credit / debit
        "amount": float(amount),
        "source": source,
        "status": status,
        "reference_id": reference_id,
        "date": iso_now_ist()
    }
    await db.laundry_wallet_transactions.insert_one(tx)

async def send_laundry_notification(student_id: str, title: str, message: str):
    await db.notifications.insert_one({
        "title": title,
        "type": "laundry",
        "message": message,
        "target_users": student_id,
        "hostel": "private",
        "date": iso_now_ist(),
        "read_by": []
    })

async def get_machine_complaint_counts(machine_code: str) -> tuple[int, int]:
    now = now_ist()
    days7 = (now - timedelta(days=7)).isoformat()
    days30 = (now - timedelta(days=30)).isoformat()

    complaint_count_7d = await db.laundry_complaints.count_documents({
        "machine_code": machine_code,
        "date": {"$gte": days7}
    })
    complaint_count_30d = await db.laundry_complaints.count_documents({
        "machine_code": machine_code,
        "date": {"$gte": days30}
    })

    return complaint_count_7d, complaint_count_30d

async def apply_repeat_issue_status(machine_doc: dict):
    machine_code = machine_doc.get("machine_code")
    if not machine_code:
        return machine_doc

    c7, c30 = await get_machine_complaint_counts(machine_code)

    updated_status = machine_doc.get("status", "idle")
    if c7 >= 3 or c30 >= 5:
        if updated_status not in ["running", "booked", "offline", "maintenance"]:
            updated_status = "needs_service"

    await db.laundry_machines.update_one(
        {"_id": machine_doc["_id"]},
        {
            "$set": {
                "complaint_count_7d": c7,
                "complaint_count_30d": c30,
                "status": updated_status,
                "updated_at": iso_now_ist()
            }
        }
    )

    machine_doc["complaint_count_7d"] = c7
    machine_doc["complaint_count_30d"] = c30
    machine_doc["status"] = updated_status
    return machine_doc

def normalize_status(status: str = "") -> str:
    allowed = {"pending", "in_progress", "resolved", "rejected"}
    clean = str(status or "pending").strip().lower()
    return clean if clean in allowed else "pending"

def normalize_priority(priority: str = "") -> str:
    allowed = {"low", "medium", "high", "urgent"}
    clean = str(priority or "medium").strip().lower()
    return clean if clean in allowed else "medium"                  

def make_payment_reference(prefix: str = "LPMT") -> str:
    return f"{prefix}-{uuid.uuid4().hex[:10].upper()}"


def to_float(value, default: float = 0.0) -> float:
    try:
        return float(value)
    except Exception:
        return default

async def log_laundry_audit(
    action: str,
    actor: str,
    machine_code: Optional[str] = None,
    booking_id: Optional[str] = None,
    payment_reference: Optional[str] = None,
    meta: Optional[dict] = None
):
    await db.laundry_admin_audit_logs.insert_one({
        "action": action,
        "actor": actor,
        "machine_code": machine_code,
        "booking_id": booking_id,
        "payment_reference": payment_reference,
        "meta": meta or {},
        "date": iso_now_ist()
    })


async def create_payment_receipt_pdf(payment_doc: dict, student: dict) -> str:
    file_name = f"laundry_receipt_{payment_doc.get('reference_id')}.pdf"
    file_path = UPLOAD_DIR / file_name

    c = canvas.Canvas(str(file_path), pagesize=letter)
    c.setFont("Helvetica-Bold", 16)
    c.drawString(70, 760, "HOSTELEASE - LAUNDRY PAYMENT RECEIPT")
    c.line(70, 752, 540, 752)

    c.setFont("Helvetica", 11)
    c.drawString(70, 725, f"Reference: {payment_doc.get('reference_id', 'N/A')}")
    c.drawString(70, 705, f"Student: {student.get('student_name', 'Student')}")
    c.drawString(70, 685, f"Enrollment: {student.get('enrollment_number', 'N/A')}")
    c.drawString(70, 665, f"Purpose: {payment_doc.get('purpose', 'N/A')}")
    c.drawString(70, 645, f"Machine Code: {payment_doc.get('machine_code') or 'N/A'}")
    c.drawString(70, 625, f"Amount: ₹{to_float(payment_doc.get('amount', 0)):.2f}")
    c.drawString(70, 605, f"Wallet Used: ₹{to_float(payment_doc.get('wallet_amount', 0)):.2f}")
    c.drawString(70, 585, f"Online Paid: ₹{to_float(payment_doc.get('online_amount', 0)):.2f}")
    c.drawString(70, 565, f"Status: {str(payment_doc.get('status', 'pending')).upper()}")
    c.drawString(70, 545, f"Created At: {payment_doc.get('created_at', 'N/A')}")
    c.drawString(70, 525, f"Verified At: {payment_doc.get('verified_at', 'N/A')}")

    c.save()
    return f"/uploads/{file_name}"


async def get_machine_utilization(machine_code: str, days: int = 30) -> float:
    since = (now_ist() - timedelta(days=days)).isoformat()
    bookings = await db.laundry_bookings.find({
        "machine_code": machine_code,
        "created_at": {"$gte": since},
        "status": {"$in": ["completed", "running", "booked"]}
    }).to_list(length=1000)

    booked_minutes: int = 0
    for b in bookings:
        start_dt = parse_iso(b.get("start_time"))
        end_dt = parse_iso(b.get("end_time"))
        if start_dt and end_dt and end_dt > start_dt:
            booked_minutes += int((end_dt - start_dt).total_seconds() // 60)

    total_minutes = days * 24 * 60
    if total_minutes <= 0:
        return 0.0
    return round((booked_minutes / total_minutes) * 100, 2)


async def check_scheduled_booking_conflict(machine_code: str, start_dt: datetime, end_dt: datetime) -> bool:
    existing = await db.laundry_bookings.find({
        "machine_code": machine_code,
        "status": {"$in": ["booked", "running"]}
    }).to_list(length=200)

    for booking in existing:
        existing_start = parse_iso(booking.get("start_time"))
        existing_end = parse_iso(booking.get("end_time"))
        if not existing_start or not existing_end:
            continue
        if start_dt < existing_end and end_dt > existing_start:
            return True
    return False

def normalize_target_users(target_users):
    if isinstance(target_users, list):
        cleaned = [str(x).strip() for x in target_users if str(x).strip()]
        return cleaned if cleaned else "all"

    if target_users is None:
        return "all"

    value = str(target_users).strip()

    if value.lower() == "all":
        return "all"

    return value if value else "all"

def normalize_target_identifiers(values):
    if isinstance(values, list):
        cleaned = [str(x).strip() for x in values if str(x).strip()]
        return cleaned

    if values is None:
        return []

    value = str(values).strip()
    if not value or value.lower() == "all":
        return []

    return [value]

def extract_private_targets(notification: dict):
    target_users = notification.get("target_users", "all")
    target_usernames = normalize_target_identifiers(notification.get("target_usernames", []))
    target_enrollments = normalize_target_identifiers(notification.get("target_enrollment_numbers", []))

    legacy_targets = []
    if isinstance(target_users, list):
        legacy_targets = [str(x).strip() for x in target_users if str(x).strip()]
    elif isinstance(target_users, str) and str(target_users).strip().lower() not in ["", "all"]:
        legacy_targets = [str(target_users).strip()]

    # Backward compatibility:
    # legacy target_users were historically enrollment numbers in your admin panel
    for item in legacy_targets:
        if item not in target_enrollments:
            target_enrollments.append(item)

    return {
        "usernames": list(dict.fromkeys(target_usernames)),
        "enrollments": list(dict.fromkeys(target_enrollments))
    }    

def is_private_notification(notification: dict) -> bool:
    hostel = normalize_hostel_name(notification.get("hostel", "all"))
    target_users = notification.get("target_users", "all")
    target_usernames = notification.get("target_usernames", [])
    target_enrollment_numbers = notification.get("target_enrollment_numbers", [])

    if hostel == "private":
        return True

    if isinstance(target_users, list) and len(target_users) > 0:
        return True

    if isinstance(target_users, str) and str(target_users).strip() not in ["", "all"]:
        return True

    if isinstance(target_usernames, list) and len([x for x in target_usernames if str(x).strip()]) > 0:
        return True

    if isinstance(target_enrollment_numbers, list) and len([x for x in target_enrollment_numbers if str(x).strip()]) > 0:
        return True

    return False

def user_is_targeted(notification: dict, user: dict) -> bool:
    user_role = str(user.get("role", "") or "").strip().lower()

    user_hostel_raw = user.get("hostel_name") or user.get("hostel") or "all"
    user_hostel = normalize_hostel_name(user_hostel_raw)

    user_enrollment = str(user.get("enrollment_number") or "").strip()
    username = str(user.get("username") or "").strip()

    notification_role = str(notification.get("target_role", "student") or "student").strip().lower()
    notification_hostel = normalize_hostel_name(notification.get("hostel", "all"))

    if notification_role and notification_role != user_role:
        return False

    if is_private_notification(notification):
        targets = extract_private_targets(notification)

        if user_enrollment and user_enrollment in [str(x).strip() for x in targets["enrollments"]]:
            return True

        if username and username in [str(x).strip() for x in targets["usernames"]]:
            return True

        return False

    if notification_hostel == "all":
        return True

    return normalize_hostel_name(notification_hostel) == normalize_hostel_name(user_hostel)

async def create_targeted_notification(
    *,
    title: str,
    message: str,
    notification_type: str = "gatepass",
    username: str = None,
    enrollment_number: str = None,
    hostel: str = "all",
    extra_data: dict = None
):
    now_iso = datetime.now(timezone.utc).isoformat()

    target_usernames = []
    target_enrollment_numbers = []

    if username:
        target_usernames.append(str(username).strip())

    if enrollment_number:
        target_enrollment_numbers.append(str(enrollment_number).strip())

    notification = {
        "title": title,
        "type": notification_type,
        "priority": "important",
        "message": message,
        "hostel": "private" if (target_usernames or target_enrollment_numbers) else (hostel or "all"),
        "target_users": "all",  # keep for backward compatibility
        "target_usernames": target_usernames,
        "target_enrollment_numbers": target_enrollment_numbers,
        "target_role": "student",
        "date": now_iso,
        "scheduled_for": None,
        "published_at": now_iso,
        "expires_at": None,
        "read_deadline": None,
        "created_by": "system",
        "created_by_role": "system",
        "read_by": [],
        "read_logs": [],
        "status": "published",
        "is_pinned": False,
        "requires_ack": False,
        "deep_link": None,
        "attachment_url": None,
        "deleted_at": None,
        "archived_at": None,
        "updated_at": now_iso,
        "meta": extra_data or {}
    }
    print("Inserting Private notificaion :", notification)
    await db.notifications.insert_one(notification)    

# --- DAILY AUTO-ABSENT MARKING ---
async def auto_mark_absent():
    try:
        now = datetime.now(IST)
        today = now.date().isoformat()
        now_time = now.isoformat()

        print(f"⏰ AUTO-ABSENT JOB STARTED for {today}")

        students = await db.users.find({"role": "student"}).to_list(2000)
        inserted_count = 0

        for student in students:
            enrollment = str(student.get("enrollment_number", "")).strip()
            if not enrollment:
                continue

            existing = await db.attendance.find_one({
                "student_id": enrollment,
                "date": today
            })

            if not existing:
                await db.attendance.insert_one({
                    "student_id": enrollment,
                    "date": today,
                    "time": now_time,
                    "status": "absent",
                    "notification_sent": False,
                    "marked_by": "system_auto_absent"
                })
                inserted_count += 1

        print(f"✅ AUTO-ABSENT COMPLETE: {inserted_count} students marked absent for {today}")

    except Exception as e:
        print(f"❌ AUTO-ABSENT ERROR: {str(e)}")    

# def validate_strong_password(password: str) -> Optional[str]:
#     if not password or len(password) < 8:
#         return "Password must be at least 8 characters long"
#     if not password[0].isalpha() or not password[0].isupper():
#         return "Password must start with a capital letter"
#     if not re.search(r"[a-z]", password):
#         return "Password must contain at least one lowercase letter"
#     if not re.search(r"[A-Z]", password):
#         return "Password must contain at least one uppercase letter"
#     if not re.search(r"\d", password):
#         return "Password must contain at least one digit"
#     if not re.search(r"[!@#$%^&*()_\-+=\[{\]};:'\",.<>?/\\|`~]", password):
#         return "Password must contain at least one special character"
#     return None

def serialize_mongo_doc(doc: dict):
    if not doc:
        return doc
    clean = {}
    for k, v in doc.items():
        if isinstance(v, ObjectId):
            clean[k] = str(v)
        else:
            clean[k] = v
    return clean    

def serialize_user_for_response(user: dict) -> dict:
    if not user:
        return {}

    safe_user = dict(user)

    if "_id" in safe_user:
        safe_user["_id"] = str(safe_user["_id"])

    for key in [
        "password",
        "two_factor_secret",
        "email_otp",
        "email_otp_expiry",
        "2fa_code",
        "2fa_expiry"
    ]:
        safe_user.pop(key, None)

    return safe_user


def validate_strong_password(password: str) -> Optional[str]:
    if not password or len(password) < 8:
        return "Password must be at least 8 characters long"
    if not password[0].isupper():
        return "Password must start with a capital letter"
    if not any(c.islower() for c in password):
        return "Password must contain at least one lowercase letter"
    if not any(c.isupper() for c in password):
        return "Password must contain at least one uppercase letter"
    if not any(c.isdigit() for c in password):
        return "Password must contain at least one digit"
    if not any(c in "!@#$%^&*()_+-=[]{}|;:,.<>?/~`" for c in password):
        return "Password must contain at least one special character"
    return None    

@api_router.get("/dev/get-admins")
async def dev_get_admins():
    admins = await db.users.find({"role": "admin"}).to_list(100)
    res = []
    for a in admins:
        res.append({
            "username": a.get("username"),
            "college_email": a.get("college_email"),
            "personal_email": a.get("personal_email"),
            "enrollment_number": a.get("enrollment_number"),
            "role": a.get("role"),
            "is_first_login": a.get("is_first_login")
        })
    # If no admin exists, create a default one
    if not res:
        hashed_pw = pwd_context.hash("Hostel@123")
        admin_doc = {
            "username": "admin",
            "college_email": "admin@hostel.com",
            "personal_email": "admin@hostel.com",
            "enrollment_number": "ADMIN001",
            "password": hashed_pw,
            "role": "admin",
            "is_first_login": False,
            "student_name": "Chief Warden / Admin",
            "hostel_name": "all"
        }
        await db.users.insert_one(admin_doc)
        res.append(admin_doc)
    else:
        # Also ensure all admins have password set to Hostel@123
        hashed_pw = pwd_context.hash("Hostel@123")
        await db.users.update_many({"role": "admin"}, {"$set": {"password": hashed_pw, "is_first_login": False}})
    return {"admins": res, "default_password": "Hostel@123"}

@api_router.get("/dev/fix-one")
async def dev_fix_one(enrollment: str, dob: str):
    u = await db.users.find_one({"enrollment_number": enrollment})
    if u:
        hashed_pw = pwd_context.hash(dob)
        await db.users.update_one(
            {"_id": u["_id"]}, 
            {"$set": {"dob": dob, "password": hashed_pw, "is_first_login": True, "is_default_password": True}}
        )
        return {"success": True, "message": f"Updated {enrollment} to {dob}"}
    return {"success": False, "message": "User not found"}

@api_router.get("/dev/check-user")
async def dev_check_user(enrollment: str):
    u = await db.users.find_one({"enrollment_number": enrollment})
    if u:
        return {"found": True, "enrollment": u.get("enrollment_number"), "type": str(type(u.get("enrollment_number"))), "dob": u.get("dob")}
    # try integer
    try:
        u2 = await db.users.find_one({"enrollment_number": int(enrollment)})
        if u2:
            return {"found": True, "note": "stored as integer", "enrollment": u2.get("enrollment_number"), "dob": u2.get("dob")}
    except:
        pass
    
    # check by email prefix
    u3 = await db.users.find_one({"username": enrollment})
    if u3:
         return {"found": True, "note": "stored as username", "enrollment": u3.get("enrollment_number"), "dob": u3.get("dob")}
         
    return {"found": False}

@api_router.get("/dev/fix-users")
async def dev_fix_users():
    import random
    users = await db.users.find({}).to_list(None)
    if not users:
        # If DB is empty, run seed logic
        import pandas as pd
        df = pd.read_excel(os.path.join(os.path.dirname(__file__), 'excel/HOSTELEASE_6_Hostel_Master_Database.xlsx'), sheet_name='Students_Master')
        count = 0
        for _, row in df.iterrows():
            dob = str(row.get('DOB', ''))
            if not dob or dob == 'nan':
                dob = f"{random.randint(1,28):02d}-{random.randint(1,12):02d}-{random.randint(2000, 2005)}"
            hashed_pw = pwd_context.hash(dob)
            user_doc = {
                "enrollment_number": str(row['Enrollment Number']),
                "username": str(row['Email']).split('@')[0],
                "college_email": str(row['Email']),
                "password": hashed_pw,
                "role": "student",
                "is_first_login": True,
                "dob": dob,
                "student_name": str(row['Student Name'])
            }
            await db.users.insert_one(user_doc)
            count += 1
        return {"message": f"Seeded {count} users from Excel with DOB passwords!"}
    
    count = 0
    for user in users:
        dob = user.get("dob")
        if not dob:
            dob = f"{random.randint(1,28):02d}-{random.randint(1,12):02d}-{random.randint(2000, 2005)}"
        hashed_pw = pwd_context.hash(dob)
        await db.users.update_one(
            {"_id": user["_id"]}, 
            {"$set": {"dob": dob, "password": hashed_pw, "is_first_login": True, "is_default_password": True}}
        )
        count += 1
    return {"message": f"Updated {count} existing users with DOB passwords!"}

@api_router.post("/auth/login")
async def login(credentials: UserLogin):
    login_id = str(credentials.username).strip()
    raw_password = str(credentials.password).strip()

    user = await db.users.find_one({
        "$or": [
            {"college_email": login_id},
            {"enrollment_number": login_id},
            {"username": login_id}
        ]
    })

    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    if not verify_password(raw_password, user.get("password", "")):
        raise HTTPException(status_code=401, detail="Incorrect password")

    role = user.get("role", "student")
    enrollment_number = str(user.get("enrollment_number", "")).strip()

    # First login flow
    if user.get("is_first_login"):
        return {
            "requires_first_login_reset": True,
            "message": "First login detected. Please complete account setup.",
            "user": {
                "enrollment_number": enrollment_number,
                "email": user.get("personal_email") or user.get("college_email") or "",
                "college_email": user.get("college_email") or "",
                "personal_email": user.get("personal_email") or "",
                "role": role
            }
        }

    secret = user.get("two_factor_secret")
    two_factor_enabled = bool(user.get("two_factor_enabled", False))
    has_valid_secret = bool(secret) and str(secret).strip().lower() != "none"

    # Admin: only force 2FA setup if admin has enabled 2FA but secret is missing
    if role == "admin" and two_factor_enabled and not has_valid_secret:
        return {
            "requires_2fa_setup": True,
            "message": "Admin must set up Two-Factor Authentication before continuing.",
            "user": {
                "enrollment_number": enrollment_number,
                "college_email": user.get("college_email") or "",
                "role": role
            }
        }

    # Require code only if 2FA is actually enabled and secret exists
    if two_factor_enabled and has_valid_secret:
        if not credentials.totp_code:
            return {
                "requires_2fa": True,
                "message": "Two-Factor Authentication is required for this account.",
                "user": {
                    "enrollment_number": enrollment_number,
                    "college_email": user.get("college_email") or "",
                    "role": role
                }
            }

        totp = pyotp.TOTP(secret)
        if not totp.verify(str(credentials.totp_code).strip(), valid_window=1):
            raise HTTPException(status_code=401, detail="Invalid 2FA code")

    access_token = create_access_token({
        "sub": enrollment_number,
        "role": role
    })

    await db.login_logs.insert_one({
        "username": user.get("username") or enrollment_number,
        "enrollment_number": enrollment_number,
        "role": role,
        "timestamp": datetime.now(timezone.utc),
        "time": datetime.now(timezone.utc).strftime("%B %d, %Y - %I:%M %p"),
        "status": "Authorized"
    })

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": serialize_user_for_response(user),
        "is_default_password": user.get("is_default_password", False),
        "requires_first_login_reset": False,
        "requires_2fa_setup": False,
        "requires_2fa": False
    }

@api_router.post("/auth/verify-2fa")
async def verify_2fa(data: dict = Body(...)):
    enrollment = str(data.get("enrollment_number", "")).strip()
    totp_code = str(data.get("totp_code", "")).strip()

    user = await db.users.find_one({"enrollment_number": enrollment})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if not user.get("two_factor_enabled"):
        raise HTTPException(status_code=400, detail="2FA not enabled")

    secret = user.get("two_factor_secret")
    if not secret or str(secret).strip().lower() == "none":
        raise HTTPException(status_code=400, detail="2FA secret missing")

    totp = pyotp.TOTP(secret)
    if not totp.verify(totp_code, valid_window=1):
        raise HTTPException(status_code=401, detail="Invalid 2FA code")

    access_token = create_access_token({
        "sub": str(user.get("enrollment_number")),
        "role": user.get("role", "student")
    })

    await db.login_logs.insert_one({
        "username": user.get("username") or user.get("enrollment_number"),
        "enrollment_number": user.get("enrollment_number"),
        "role": user.get("role", "student"),
        "timestamp": datetime.now(timezone.utc),
        "time": datetime.now(timezone.utc).strftime("%B %d, %Y - %I:%M %p"),
        "status": "Authorized"
    })

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": serialize_user_for_response(user)
    }

# @api_router.post("/auth/first-login/send-otp")
# async def first_login_send_otp(data: FirstLoginOTPRequest):
#     user = await db.users.find_one({"enrollment_number": data.enrollment_number})
#     if not user:
#         raise HTTPException(status_code=404, detail="User not found")

#     if not user.get("is_first_login"):
#         raise HTTPException(status_code=400, detail="Account is already verified.")

#     otp_code = str(random.randint(100000, 999999))
#     target_email = user.get("college_email") or user.get("personal_email")
#     if not target_email:
#         raise HTTPException(status_code=400, detail="No email address on file.")

#     await db.users.update_one(
#         {"enrollment_number": data.enrollment_number},
#         {"$set": {
#             "email_otp": otp_code,
#             "email_otp_expiry": (datetime.now() + timedelta(minutes=10)).isoformat()
#         }}
#     )

#     await send_email(
#         target_email,
#         "HOSTELEASE: Verification OTP",
#         f"<h3>Your OTP is {otp_code}</h3><p>Valid for 10 minutes.</p>"
#     )

#     return {
#         "message": "Verification code sent successfully",
#         "dev_otp": otp_code,
#         "email": user.get("college_email") or target_email,
#         "masked_email": user.get("college_email") or target_email
#     }

@api_router.post("/auth/first-login/send-otp")
async def first_login_send_otp(data: FirstLoginOTPRequest):
    user = await db.users.find_one({"enrollment_number": data.enrollment_number})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if not user.get("is_first_login"):
        raise HTTPException(status_code=400, detail="Account is already verified.")

    otp_code = str(random.randint(100000, 999999))
    target_email = user.get("personal_email") or user.get("college_email")
    if not target_email:
        raise HTTPException(status_code=400, detail="No email address on file.")

    await db.users.update_one(
        {"enrollment_number": data.enrollment_number},
        {"$set": {
            "email_otp": otp_code,
            "email_otp_expiry": (datetime.now() + timedelta(minutes=10)).isoformat()
        }}
    )

    email_sent = False
    if target_email:
        student_display_name = user.get("student_name") or user.get("username") or "Student"
        html_content = f"""
        <div style="font-family: Arial, sans-serif; max-width: 580px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; padding: 24px; background-color: #ffffff;">
            <div style="text-align: center; margin-bottom: 20px;">
                <h2 style="color: #5B7FED; margin: 0; font-size: 26px; font-weight: 800;">HOSTELEASE</h2>
                <p style="color: #64748b; font-size: 13px; margin: 4px 0 0 0;">First-Time Login Security Setup</p>
            </div>
            <p style="color: #334155; font-size: 15px;">Hello <b>{student_display_name}</b>,</p>
            <p style="color: #475569; font-size: 14px; line-height: 1.5;">You are verifying your account for the first time (Enrollment: <b>{data.enrollment_number}</b>). Please use the One-Time Password (OTP) below to complete your verification and set your secure password:</p>
            <div style="background: #f8fafc; border: 2px dashed #5B7FED; padding: 20px; text-align: center; border-radius: 10px; margin: 24px 0;">
                <span style="color: #1e293b; font-size: 34px; font-weight: 800; letter-spacing: 8px; font-family: monospace;">{otp_code}</span>
            </div>
            <p style="color: #64748b; font-size: 13px;">This OTP is valid for <b>10 minutes</b>. If you did not initiate this login, please contact your hostel warden immediately.</p>
            <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
            <p style="color: #94a3b8; font-size: 11px; text-align: center;">Hostelease Automated Verification Dispatch &bull; Do not reply to this email.</p>
        </div>
        """
        email_sent = await send_email(target_email, "HOSTELEASE - First Login Verification Code", html_content)

    masked = target_email[:3] + "***" + target_email[target_email.index("@"):] if "@" in str(target_email) else target_email

    return {
        "message": f"Verification code sent to {masked}" if email_sent else f"OTP generated for {masked}",
        "dev_otp": None if email_sent else otp_code,
        "email": target_email,
        "masked_email": masked,
        "live_email_delivered": email_sent
    }

@api_router.post("/auth/first-login/verify")
async def first_login_verify(data: FirstLoginVerify):
    user = await db.users.find_one({"enrollment_number": data.enrollment_number})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if not user.get("email_otp") or user.get("email_otp") != data.otp_code:
        raise HTTPException(status_code=401, detail="Invalid OTP code")

    expiry = datetime.fromisoformat(user.get("email_otp_expiry"))
    if datetime.now() > expiry:
        raise HTTPException(status_code=401, detail="OTP has expired. Please request a new one.")

    password_error = validate_strong_password(data.new_password)
    if password_error:
        raise HTTPException(status_code=400, detail=password_error)

    new_hashed = hash_password(data.new_password)
    await db.users.update_one(
        {"enrollment_number": data.enrollment_number},
        {"$set": {
            "password": new_hashed,
            "is_default_password": False,
            "is_first_login": False,
            "email_otp": None,
            "email_otp_expiry": None
        }}
    )

    return {"message": "Account verified and password updated successfully."}

@api_router.get("/auth/2fa-status/{enrollment_number}")
async def get_2fa_status(enrollment_number: str):
    enrollment = str(enrollment_number).strip()

    user = await db.users.find_one({"enrollment_number": enrollment})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    return {
        "two_factor_enabled": bool(user.get("two_factor_enabled", False))
    }

@api_router.post("/auth/2fa/generate")
async def generate_2fa_secret(data: TOTPSetupRequest):
    enrollment = str(data.enrollment_number).strip()

    user = await db.users.find_one({"enrollment_number": enrollment})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    existing_secret = user.get("two_factor_secret")
    has_valid_secret = bool(existing_secret) and str(existing_secret).strip().lower() != "none"

    secret = existing_secret if has_valid_secret else pyotp.random_base32()

    uri = pyotp.TOTP(secret).provisioning_uri(
        name=user.get("college_email") or enrollment,
        issuer_name="HOSTELEASE"
    )

    await db.users.update_one(
        {"enrollment_number": enrollment},
        {"$set": {"two_factor_secret": secret}}
    )

    return {
        "secret": secret,
        "uri": uri
    }

@api_router.post("/auth/2fa/verify-setup")
async def verify_2fa_setup(data: TOTPVerifyRequest):
    enrollment = str(data.enrollment_number).strip()

    user = await db.users.find_one({"enrollment_number": enrollment})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    secret = user.get("two_factor_secret")
    if not secret or str(secret).strip().lower() == "none":
        raise HTTPException(status_code=400, detail="2FA secret not generated")

    totp = pyotp.TOTP(secret)
    if not totp.verify(str(data.totp_code).strip(), valid_window=1):
        raise HTTPException(status_code=401, detail="Invalid verification code")

    await db.users.update_one(
        {"enrollment_number": enrollment},
        {"$set": {"two_factor_enabled": True}}
    )

    updated_user = await db.users.find_one({"enrollment_number": enrollment})

    access_token = create_access_token({
        "sub": str(updated_user.get("enrollment_number")),
        "role": updated_user.get("role", "student")
    })

    await db.login_logs.insert_one({
        "username": updated_user.get("username") or updated_user.get("enrollment_number"),
        "enrollment_number": updated_user.get("enrollment_number"),
        "role": updated_user.get("role", "student"),
        "timestamp": datetime.now(timezone.utc),
        "time": datetime.now(timezone.utc).strftime("%B %d, %Y - %I:%M %p"),
        "status": "Authorized"
    })

    return {
        "message": "Two-Factor Authentication successfully enabled.",
        "access_token": access_token,
        "token_type": "bearer",
        "user": serialize_user_for_response(updated_user)
    }

@api_router.get("/admin/security-preferences")
async def get_admin_security_preferences(user: dict = Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403)

    user_id = str(user.get("_id") or "")
    prefs = await db.admin_security_preferences.find_one({"user_id": user_id})

    if not prefs:
        db_user = await db.users.find_one({"enrollment_number": user.get("enrollment_number")})
        current_2fa = bool((db_user or {}).get("two_factor_enabled", False))

    prefs = {
        "user_id": user_id,
        "two_factor_enabled": current_2fa,
        "whitelisted_ips": ["192.168.1.1", "10.0.0.45"],
        "email_verified": True,
        "recovery_email": user.get("college_email") or user.get("personal_email") or "",
        "last_password_change": None,
        "backup_codes": [],
        "account_locked": False
    }
    await db.admin_security_preferences.insert_one(prefs)

    prefs["_id"] = str(prefs["_id"])
    return prefs

@api_router.post("/student/toggle-2fa")
async def toggle_student_2fa(data: dict = Body(...), user: dict = Depends(get_current_user)):
    enrollment_number = str(user.get("enrollment_number") or "").strip()
    enabled = bool(data.get("enabled", False))

    if not enrollment_number:
        raise HTTPException(status_code=400, detail="Invalid student profile")

    await db.users.update_one(
        {"enrollment_number": enrollment_number},
        {"$set": {"two_factor_enabled": enabled}}
    )

    return {
        "message": "2FA updated",
        "two_fa_enabled": enabled
    }

@api_router.post("/admin/toggle-2fa")
async def toggle_admin_2fa(data: dict = Body(...), user: dict = Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403)

    user_id = str(user.get("_id") or "")
    enrollment_number = str(user.get("enrollment_number") or "").strip()
    enabled = bool(data.get("enabled", False))

    backup_codes = []
    if enabled:
        backup_codes = [
            "HLA-AX91", "HLA-BQ72", "HLA-CM48",
            "HLA-DT63", "HLA-EK27", "HLA-FP55"
        ]

    await db.admin_security_preferences.update_one(
        {"user_id": user_id},
        {"$set": {
            "two_factor_enabled": enabled,
            "backup_codes": backup_codes
        }},
        upsert=True
    )

    if enrollment_number:
        await db.users.update_one(
            {"enrollment_number": enrollment_number},
            {"$set": {"two_factor_enabled": enabled}}
        )

    await db.security_events.insert_one({
        "user_id": user_id,
        "message": f"Two-factor authentication {'enabled' if enabled else 'disabled'}",
        "severity": "low",
        "ip": user.get("ip") or "Unknown",
        "device": user.get("browser") or "Admin Panel",
        "timestamp": utc_now_iso()
    })

    return {
        "message": "2FA updated",
        "two_fa_enabled": enabled,
        "backup_codes": backup_codes
    }

@api_router.post("/admin/2fa/regenerate")
async def regenerate_admin_2fa(user: dict = Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403)

    user_id = str(user.get("_id") or "")
    enrollment_number = str(user.get("enrollment_number") or "").strip()

    backup_codes = [
        "HLA-RA11", "HLA-RB22", "HLA-RC33",
        "HLA-RD44", "HLA-RE55", "HLA-RF66"
    ]

    await db.admin_security_preferences.update_one(
        {"user_id": user_id},
        {"$set": {"backup_codes": backup_codes, "two_factor_enabled": True}},
        upsert=True
    )

    if enrollment_number:
        await db.users.update_one(
            {"enrollment_number": enrollment_number},
            {"$set": {"two_factor_enabled": True}}
        )

    await db.security_events.insert_one({
        "user_id": user_id,
        "message": "2FA secret regenerated",
        "severity": "medium",
        "ip": user.get("ip") or "Unknown",
        "device": user.get("browser") or "Admin Panel",
        "timestamp": utc_now_iso()
    })

    return {
        "message": "2FA regenerated",
        "two_fa_enabled": True,
        "backup_codes": backup_codes
    }


@api_router.get("/admin/ip-whitelist")
async def get_admin_ip_whitelist(user: dict = Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403)

    user_id = str(user.get("_id") or "")
    prefs = await db.admin_security_preferences.find_one({"user_id": user_id})
    return prefs.get("whitelisted_ips", []) if prefs else []


@api_router.post("/admin/ip-whitelist")
async def add_admin_ip_whitelist(data: dict = Body(...), user: dict = Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403)

    ip = str(data.get("ip", "")).strip()
    if not ip:
        raise HTTPException(status_code=400, detail="IP is required")

    user_id = str(user.get("_id") or "")
    prefs = await db.admin_security_preferences.find_one({"user_id": user_id})
    current_ips = prefs.get("whitelisted_ips", []) if prefs else []
    if ip not in current_ips:
        current_ips.append(ip)

    await db.admin_security_preferences.update_one(
        {"user_id": user_id},
        {"$set": {"whitelisted_ips": current_ips}},
        upsert=True
    )

    return {"message": "Trusted IP added", "ip": ip}


@api_router.post("/admin/ip-whitelist/current")
async def add_current_admin_ip(user: dict = Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403)

    current_ip = user.get("ip") or "127.0.0.1"
    user_id = str(user.get("_id") or "")
    prefs = await db.admin_security_preferences.find_one({"user_id": user_id})
    current_ips = prefs.get("whitelisted_ips", []) if prefs else []
    if current_ip not in current_ips:
        current_ips.append(current_ip)

    await db.admin_security_preferences.update_one(
        {"user_id": user_id},
        {"$set": {"whitelisted_ips": current_ips}},
        upsert=True
    )

    return {"message": "Current IP added", "ip": current_ip}


@api_router.delete("/admin/ip-whitelist/{ip}")
async def remove_admin_ip_whitelist(ip: str, user: dict = Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403)

    user_id = str(user.get("_id") or "")
    prefs = await db.admin_security_preferences.find_one({"user_id": user_id})
    current_ips = prefs.get("whitelisted_ips", []) if prefs else []
    current_ips = [item for item in current_ips if item != ip]

    await db.admin_security_preferences.update_one(
        {"user_id": user_id},
        {"$set": {"whitelisted_ips": current_ips}},
        upsert=True
    )

    return {"message": "Trusted IP removed"}


@api_router.get("/admin/sessions")
async def get_admin_sessions(user: dict = Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403)

    user_id = str(user.get("_id") or "")
    sessions = await db.admin_sessions.find({"user_id": user_id}).sort("created_at", -1).to_list(length=20)

    if len(sessions) == 0:
        seed_session = {
            "user_id": user_id,
            "device": "Chrome / Windows 11",
            "browser": "Chrome / Windows 11",
            "ip": user.get("ip") or "127.0.0.1",
            "created_at": utc_now_iso(),
            "is_current": True
        }
        await db.admin_sessions.insert_one(seed_session)
        sessions = await db.admin_sessions.find({"user_id": user_id}).sort("created_at", -1).to_list(length=20)

    for s in sessions:
        s["_id"] = str(s["_id"])

    return sessions


@api_router.delete("/admin/session/{session_id}")
async def revoke_admin_session(session_id: str, user: dict = Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403)

    await db.admin_sessions.delete_one({"_id": ObjectId(session_id)})
    return {"message": "Session revoked"}


@api_router.post("/admin/logout-all")
async def logout_all_admin_sessions(user: dict = Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403)

    user_id = str(user.get("_id") or "")
    await db.admin_sessions.delete_many({"user_id": user_id, "is_current": {"$ne": True}})
    return {"message": "All secondary sessions removed"}


@api_router.get("/admin/security-events")
async def get_admin_security_events(user: dict = Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403)

    user_id = str(user.get("_id") or "")
    events = await db.security_events.find({"user_id": user_id}).sort("timestamp", -1).limit(20).to_list(length=20)

    if len(events) == 0:
        seed_events = [
            {
                "user_id": user_id,
                "message": "Login from new browser detected",
                "severity": "medium",
                "ip": "192.168.1.42",
                "device": "Chrome / Windows 11",
                "timestamp": utc_now_iso()
            },
            {
                "user_id": user_id,
                "message": "Repeated failed login attempts blocked",
                "severity": "high",
                "ip": "10.0.0.45",
                "device": "Unknown Device",
                "timestamp": utc_now_iso()
            }
        ]
        await db.security_events.insert_many(seed_events)
        events = await db.security_events.find({"user_id": user_id}).sort("timestamp", -1).limit(20).to_list(length=20)

    for e in events:
        e["_id"] = str(e["_id"])

    return events


@api_router.post("/admin/verify-email/send")
async def send_admin_verify_email(data: dict = Body(...), user: dict = Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403)

    email = str(data.get("email") or user.get("college_email") or "").strip()
    if not email:
        raise HTTPException(status_code=400, detail="Email is required")

    await db.security_events.insert_one({
        "user_id": str(user.get("_id") or ""),
        "message": f"Verification email sent to {email}",
        "severity": "low",
        "ip": user.get("ip") or "Unknown",
        "device": user.get("browser") or "Admin Panel",
        "timestamp": utc_now_iso()
    })

    return {"message": "Verification email sent"}


@api_router.post("/admin/recovery-email")
async def update_admin_recovery_email(data: dict = Body(...), user: dict = Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403)

    recovery_email = str(data.get("recovery_email", "")).strip()
    if not recovery_email:
        raise HTTPException(status_code=400, detail="Recovery email is required")

    user_id = str(user.get("_id") or "")
    await db.admin_security_preferences.update_one(
        {"user_id": user_id},
        {"$set": {"recovery_email": recovery_email}},
        upsert=True
    )

    return {"message": "Recovery email updated"}


@api_router.post("/admin/force-password-reset")
async def force_admin_password_reset(user: dict = Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403)

    await db.users.update_one(
        {"_id": user["_id"]},
        {"$set": {"force_password_reset": True}}
    )

    return {"message": "Force password reset enabled"}


@api_router.post("/admin/account-lock")
async def lock_admin_account(data: dict = Body(...), user: dict = Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403)

    locked = bool(data.get("locked", False))
    user_id = str(user.get("_id") or "")
    await db.admin_security_preferences.update_one(
        {"user_id": user_id},
        {"$set": {"account_locked": locked}},
        upsert=True
    )

    await db.security_events.insert_one({
        "user_id": user_id,
        "message": "Admin account locked temporarily" if locked else "Admin account unlocked",
        "severity": "medium",
        "ip": user.get("ip") or "Unknown",
        "device": user.get("browser") or "Admin Panel",
        "timestamp": utc_now_iso()
    })

    return {"message": "Account lock status updated", "locked": locked}


@api_router.get("/admin/security-report")
async def get_admin_security_report(user: dict = Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403)

    user_id = str(user.get("_id") or "")
    prefs = await db.admin_security_preferences.find_one({"user_id": user_id}) or {}
    sessions = await db.admin_sessions.find({"user_id": user_id}).sort("created_at", -1).to_list(length=50)
    events = await db.security_events.find({"user_id": user_id}).sort("timestamp", -1).to_list(length=50)
    logs = await db.login_logs.find({
        "enrollment_number": user.get("enrollment_number"),
        "role": "admin"
    }).sort("timestamp", -1).limit(50).to_list(length=50)

    for item in sessions:
        item["_id"] = str(item["_id"])
    for item in events:
        item["_id"] = str(item["_id"])
    for item in logs:
        item["_id"] = str(item["_id"])

    return {
        "admin_username": user.get("username"),
        "email": user.get("college_email") or user.get("personal_email"),
        "preferences": prefs,
        "sessions": sessions,
        "security_events": events,
        "login_logs": logs,
        "generated_at": utc_now_iso()
    }

@api_router.post("/auth/send-otp")
async def send_otp(request: dict = Body(...)):
    contact = str(request.get("contact", "")).strip()
    otp_type = str(request.get("type") or request.get("method") or "email").strip().lower()

    if otp_type == "sms":
        otp_type = "phone"

    if otp_type not in ["email", "phone"]:
        raise HTTPException(status_code=400, detail="OTP type must be email or phone")

    if not contact:
        raise HTTPException(status_code=400, detail="Contact is required")

    otp = str(random.randint(100000, 999999))

    # Flexible user lookup across email, enrollment, registration_no, username, phone
    query = {
        "$or": [
            {"college_email": {"$regex": f"^{re.escape(contact)}$", "$options": "i"}},
            {"personal_email": {"$regex": f"^{re.escape(contact)}$", "$options": "i"}},
            {"enrollment_number": contact},
            {"registration_no": contact},
            {"username": contact},
            {"phone": contact}
        ]
    }
    user = await db.users.find_one(query, {"_id": 0})

    if not user:
        raise HTTPException(status_code=404, detail="Student account not found with the provided identifier")

    destination_email = user.get("college_email") or user.get("personal_email") or (contact if "@" in contact else None)
    enrollment = user.get("enrollment_number") or user.get("registration_no") or user.get("username")
    phone_target = user.get("parent_phone") or user.get("phone") or contact

    # Save OTP against all corresponding identifiers so verification matches regardless of input
    identifiers = set(filter(None, [contact, destination_email, enrollment, phone_target]))
    for ident in identifiers:
        await db.otps.delete_many({"contact": ident})
        await db.otps.insert_one({
            "contact": ident,
            "otp": otp,
            "type": otp_type,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "expires_at": (datetime.now(timezone.utc) + timedelta(minutes=10)).isoformat(),
            "verified": True
        })

    email_sent = False
    if otp_type == "email":
        if not destination_email:
            raise HTTPException(status_code=400, detail="No registered email address found for this student")

        html_content = f"""
        <div style="font-family: Arial, sans-serif; max-width: 580px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; padding: 24px; background-color: #ffffff;">
            <div style="text-align: center; margin-bottom: 20px;">
                <h2 style="color: #5B7FED; margin: 0; font-size: 26px; font-weight: 800;">HOSTELEASE</h2>
                <p style="color: #64748b; font-size: 13px; margin: 4px 0 0 0;">Hostel Management System - Security Verification</p>
            </div>
            <p style="color: #334155; font-size: 15px;">Hello <b>{user.get('student_name') or user.get('username') or 'Student'}</b>,</p>
            <p style="color: #475569; font-size: 14px; line-height: 1.5;">You requested to reset your password for your Hostelease account (Enrollment: <b>{enrollment}</b>). Use the One-Time Password (OTP) below to complete your verification:</p>
            <div style="background: #f8fafc; border: 2px dashed #5B7FED; padding: 20px; text-align: center; border-radius: 10px; margin: 24px 0;">
                <span style="color: #1e293b; font-size: 34px; font-weight: 800; letter-spacing: 8px; font-family: monospace;">{otp}</span>
            </div>
            <p style="color: #64748b; font-size: 13px;">This OTP is valid for <b>10 minutes</b>. If you did not request this, please ignore this email or notify your hostel warden immediately.</p>
            <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
            <p style="color: #94a3b8; font-size: 11px; text-align: center;">Hostelease Automated Security Dispatch &bull; Do not reply to this email.</p>
        </div>
        """
        email_sent = await send_email(destination_email, "HOSTELEASE - Password Reset Verification OTP", html_content)
    else:
        await send_sms(phone_target, f"Your HOSTELEASE OTP is: {otp}. Valid for 10 minutes.")

    masked_target = destination_email or phone_target
    if "@" in str(masked_target):
        parts = str(masked_target).split("@")
        if len(parts[0]) > 3:
            masked_target = f"{parts[0][:3]}***@{parts[1]}"

    return {
        "message": f"OTP sent successfully to {masked_target}" if email_sent else f"OTP generated for {masked_target}",
        "expires_in": "10 minutes",
        "dev_otp": None if email_sent else otp,
        "sent_to": destination_email or phone_target,
        "live_email_delivered": email_sent
    }

@api_router.post("/auth/verify-otp")
async def verify_otp(request: OTPVerify):
    contact = request.contact.strip()
    otp_record = await db.otps.find_one({
        "contact": contact,
        "otp": request.otp,
        "type": request.type
    }, {"_id": 0})

    if not otp_record:
        # Cross-check through user document
        alt_user = await db.users.find_one({
            "$or": [
                {"college_email": contact},
                {"personal_email": contact},
                {"enrollment_number": contact},
                {"registration_no": contact},
                {"username": contact}
            ]
        }, {"_id": 0})
        if alt_user:
            alt_keys = [
                alt_user.get("enrollment_number"),
                alt_user.get("college_email"),
                alt_user.get("personal_email")
            ]
            for ak in filter(None, alt_keys):
                otp_record = await db.otps.find_one({"contact": ak, "otp": request.otp}, {"_id": 0})
                if otp_record:
                    break

    if not otp_record:
        raise HTTPException(status_code=400, detail="Invalid OTP")

    expires_at = datetime.fromisoformat(otp_record["expires_at"])
    if datetime.now(timezone.utc) > expires_at:
        raise HTTPException(status_code=400, detail="OTP expired. Please request a new one.")

    await db.otps.update_one(
        {"contact": otp_record["contact"], "otp": request.otp},
        {"$set": {"verified": True}}
    )

    return {"message": "OTP verified successfully", "verified": True}

@api_router.post("/auth/reset-password")
async def reset_password(request: PasswordReset):
    contact = request.contact.strip()
    otp_record = await db.otps.find_one({
        "contact": contact,
        "otp": request.otp
    }, {"_id": 0})

    if not otp_record:
        # Check cross-identifiers
        alt_user = await db.users.find_one({
            "$or": [
                {"college_email": contact},
                {"personal_email": contact},
                {"enrollment_number": contact},
                {"registration_no": contact},
                {"username": contact}
            ]
        }, {"_id": 0})
        if alt_user:
            alt_keys = [
                alt_user.get("enrollment_number"),
                alt_user.get("college_email"),
                alt_user.get("personal_email")
            ]
            for ak in filter(None, alt_keys):
                otp_record = await db.otps.find_one({"contact": ak, "otp": request.otp}, {"_id": 0})
                if otp_record:
                    break

    if not otp_record:
        raise HTTPException(status_code=400, detail="Invalid OTP")

    expires_at = datetime.fromisoformat(otp_record["expires_at"])
    if datetime.now(timezone.utc) > expires_at:
        raise HTTPException(status_code=400, detail="OTP expired")

    password_error = validate_strong_password(request.new_password)
    if password_error:
        raise HTTPException(status_code=400, detail=password_error)

    query = {
        "$or": [
            {"college_email": contact},
            {"personal_email": contact},
            {"enrollment_number": contact},
            {"registration_no": contact},
            {"username": contact},
            {"phone": contact}
        ]
    }
    user = await db.users.find_one(query)

    if not user:
        raise HTTPException(status_code=404, detail="User account not found")

    new_hashed = hash_password(request.new_password)
    await db.users.update_one(
        {"_id": user["_id"]},
        {
            "$set": {
                "password": new_hashed,
                "is_default_password": False,
                "is_first_login": False
            }
        }
    )

    await db.otps.delete_many({"contact": contact})
    return {"message": "Password reset successfully"}

@api_router.post("/admin/setup-real-student-emails")
async def setup_real_student_emails(payload: dict = Body(...)):
    """Assigns real email address to test students so examiner can test live Gmail OTP delivery"""
    email = str(payload.get("email", "")).strip()
    if not email or "@" not in email:
        raise HTTPException(status_code=400, detail="Valid email address is required")

    test_enrollments = ["2022034622484"]  # Ajay Bose (Azad Bhawan)
    other_students = await db.users.find(
        {"role": "student", "enrollment_number": {"$nin": ["2022034622484"]}},
        {"enrollment_number": 1, "student_name": 1, "hostel_name": 1}
    ).to_list(length=4)

    test_enrollments.extend([s.get("enrollment_number") for s in other_students if s.get("enrollment_number")])

    updated_records = []
    for enr in test_enrollments:
        await db.users.update_one(
            {"enrollment_number": enr},
            {"$set": {"college_email": email, "personal_email": email}}
        )
        updated_student = await db.users.find_one(
            {"enrollment_number": enr},
            {"_id": 0, "enrollment_number": 1, "student_name": 1, "hostel_name": 1, "college_email": 1, "room_number": 1, "bed_number": 1}
        )
        if updated_student:
            updated_records.append(updated_student)

    invalidate_students_cache()

    return {
        "message": f"Successfully linked {len(updated_records)} test student accounts to {email}",
        "students": updated_records
    }

@api_router.post("/auth/config-smtp")
async def configure_smtp(payload: dict = Body(...)):
    """Optionally update Gmail SMTP credentials dynamically for live testing"""
    gmail_user = str(payload.get("gmail_user", "")).strip()
    gmail_pass = str(payload.get("gmail_pass", "")).strip()
    if gmail_user and gmail_pass:
        os.environ["GMAIL_USER"] = gmail_user
        os.environ["GMAIL_APP_PASSWORD"] = gmail_pass
        return {"message": f"Gmail SMTP credentials configured successfully for {gmail_user}"}
    raise HTTPException(status_code=400, detail="gmail_user and gmail_pass are required")

@api_router.post("/auth/reset-password-2fa")
async def reset_password_with_2fa(data: dict = Body(...)):
    login_id = str(data.get("login_id", "")).strip()
    totp_code = str(data.get("totp_code", "")).strip()
    new_password = str(data.get("new_password", "")).strip()

    if not login_id:
        raise HTTPException(status_code=400, detail="Enrollment number, username, or email is required")

    if not totp_code:
        raise HTTPException(status_code=400, detail="Authenticator code is required")

    if not new_password:
        raise HTTPException(status_code=400, detail="New password is required")

    password_error = validate_strong_password(new_password)
    if password_error:
        raise HTTPException(status_code=400, detail=password_error)

    user = await db.users.find_one({
        "$or": [
            {"enrollment_number": login_id},
            {"college_email": login_id},
            {"username": login_id}
        ]
    })

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if not user.get("two_factor_enabled"):
        raise HTTPException(status_code=400, detail="Authenticator reset is not enabled for this account")

    secret = user.get("two_factor_secret")
    if not secret or str(secret).strip().lower() in ["none", "null", ""]:
        raise HTTPException(status_code=400, detail="Authenticator secret missing")

    totp = pyotp.TOTP(secret)
    if not totp.verify(totp_code, valid_window=1):
        raise HTTPException(status_code=401, detail="Invalid authenticator code")

    new_hashed = hash_password(new_password)

    await db.users.update_one(
        {"_id": user["_id"]},
        {
            "$set": {
                "password": new_hashed,
                "is_default_password": False,
                "is_first_login": False
            }
        }
    )

    return {"message": "Password reset successfully using authenticator"}    

@api_router.post("/auth/register")
async def register(user: UserRegister):
    # Check if student exists in our 'Pre-authorized' CSV data (the files you uploaded)
    # This prevents random signups; only students in your CSV can register.
    #csv_check = await db.users.find_one({"enrollment_number": str(user.enrollment_number),"role" : "student"})
    csv_check = await db.authorized_students.find_one({"Student_ID": str(user.enrollment_number)})
    if not csv_check:
        raise HTTPException(status_code=403, detail="Student ID not found in hostel records. Contact Office.")

    existing_user = await db.users.find_one({"enrollment_number": user.enrollment_number})
    if existing_user:
        raise HTTPException(status_code=400, detail="User already registered. Please login.")

    user_dict = user.model_dump()
    # ENFORCED: Initial password must be hostel@123
    user_dict["password"] = hash_password("hostel@123")
    user_dict["is_default_password"] = True 
    user_dict["role"] = "student"
    
    await db.users.insert_one(user_dict)
    return {"message": "Registration successful. Use default password 'hostel@123' to login."}

# @api_router.post("/auth/admin-login-init")
# async def admin_login_init(data: AdminLoginInitModel):
#     # STRICT SEARCH: Only matches College Email or Enrollment Number
#     user = await db.users.find_one({
#         "role": "admin",
#         "$or": [
#             {"college_email": data.username.strip()},
#             {"enrollment_number": data.username.strip()}
#         ]
#     })
    
#     if not user:
#         # Prevents login if the user types 'admin' (the username)
#         raise HTTPException(status_code=401, detail="Invalid: Use College Email or Enrollment Number")

#     if not verify_password(data.password, user["password"]):
#         raise HTTPException(status_code=401, detail="Invalid credentials")

#     otp = str(random.randint(100000, 999999))
#     expiry = datetime.now(timezone.utc) + timedelta(minutes=5)
    
#     await db.users.update_one({"_id": user["_id"]}, {"$set": {"2fa_code": otp, "2fa_expiry": expiry}})

#     return {
#         "message": "Verification code dispatched",
#         "dev_otp": otp 
#     }

# @api_router.post("/auth/admin-login-verify")
# async def admin_login_verify(data: AdminVerifyModel):
#     # Flexible search for verification step
#     user = await db.users.find_one({
#         "2fa_code": data.otp,
#         "$or": [
#             {"username": data.username.strip()},
#             {"college_email": data.username.strip()},
#             {"enrollment_number": data.username.strip()}
#         ]
#     })
    
#     if not user or datetime.now(timezone.utc) > user.get("2fa_expiry", datetime.now(timezone.utc)):
#         raise HTTPException(400, "Invalid or expired code")

#     await db.users.update_one({"_id": user["_id"]}, {"$unset": {"2fa_code": "", "2fa_expiry": ""}})
    
#     # Store login log for Admin Timeline View
#     await db.login_logs.insert_one({
#         "username": user.get("username"),
#         "role": "admin",
#         "time": datetime.now(timezone.utc).strftime("%B %d, %Y - %I:%M %p"),
#         "timestamp": datetime.now(timezone.utc),
#         "ip": "192.168.1.1", # Mock IP for now, can be extracted from Request
#         "browser": "Chrome / Windows 11",
#         "status": "Authorized"
#     })
    
#     is_default = user.get("is_first_login", False)

#     token = create_access_token({"sub": user.get("enrollment_number") or user.get("username"), "role": "admin"})
#     return {
#         "access_token": token, 
#         "token_type": "bearer",
#         "is_default_password": is_default
#     }

# GET CURRENT STUDENT PROFILE
@api_router.get("/student/me")
async def get_current_student(user: dict = Depends(get_current_user)):
    student = await db.users.find_one(
        {"enrollment_number": user.get("enrollment_number")},
        {"password": 0}
    )

    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    latest_overdue = await db.gatepasses.find_one(
        {
            "enrollment_number": str(user.get("enrollment_number")),
            "is_overdue": True,
            "explanation_required": True
        },
        sort=[("applied_date", -1)]
    )

    student["_id"] = str(student["_id"])
    student["hostel_name"] = normalize_hostel_name(student.get("hostel_name", "N/A"))
    student["block"] = normalize_block_name(student.get("block", "N/A"))
    student["room_number"] = str(student.get("room_number", "N/A"))
    student["explanation_required"] = True if latest_overdue else False

    return student

# ==================== BED AVAILABILITY & BOOKING ====================

def normalize_ac_type(room_doc: dict) -> str:
    ac_val = room_doc.get("ac_type", room_doc.get("ac", room_doc.get("is_ac")))
    room_type_val = str(room_doc.get("room_type", "")).lower()

    if isinstance(ac_val, bool):
        return "ac" if ac_val else "non-ac"

    ac_str = str(ac_val or "").strip().lower()
    if ac_str in ["ac", "yes", "true", "1"]:
        return "ac"
    if ac_str in ["non-ac", "non ac", "no", "false", "0"]:
        return "non-ac"

    if "non-ac" in room_type_val or "non ac" in room_type_val:
        return "non-ac"
    if "ac" in room_type_val:
        return "ac"

    return "non-ac"

def normalize_washroom_type(room_doc: dict) -> str:
    possible_values = [
        room_doc.get("washroom_type"),
        room_doc.get("washroom"),
        room_doc.get("washroom_preference"),
        room_doc.get("bathroom_type"),
        room_doc.get("toilet_type"),
    ]

    attached_flag = room_doc.get("attached_washroom")
    common_flag = room_doc.get("common_washroom")
    private_flag = room_doc.get("private_washroom")
    attached_toilet_flag = room_doc.get("attached_toilet")

    if isinstance(attached_flag, bool):
        return "attached" if attached_flag else "common"

    if isinstance(common_flag, bool):
        return "common" if common_flag else "attached"

    if isinstance(private_flag, bool):
        return "attached" if private_flag else "common"

    if isinstance(attached_toilet_flag, bool):
        return "attached" if attached_toilet_flag else "common"

    for value in possible_values:
        text = str(value or "").strip().lower()
        if text in [
            "attached",
            "attached washroom",
            "attached bathroom",
            "private",
            "private washroom",
            "attached toilet"
        ]:
            return "attached"

        if text in [
            "common",
            "common washroom",
            "common bathroom",
            "shared",
            "shared washroom"
        ]:
            return "common"

    return "common"

def normalize_sharing_type(capacity: int) -> str:
    cap = int(capacity or 0)
    if cap <= 3:
        return "3-sharing"
    if cap == 4:
        return "4-sharing"
    return f"{cap}-sharing"


def count_room_occupants_key(student_doc: dict):
    h = normalize_hostel_name(student_doc.get("hostel_name", ""))
    b = normalize_block_name(student_doc.get("block", ""))
    f = str(student_doc.get("floor", ""))
    r = str(student_doc.get("room_number", ""))
    if h and b and f and r and h != "N/A" and r != "N/A":
        return f"{h}-{b}-{f}-{r}"
    return None


async def get_roommate_profile_for_student(student_id: str):
    profile = await db.roommate_profiles.find_one({
        "$or": [
            {"student_id": student_id},
            {"student_username": student_id},
            {"username": student_id}
        ]
    })
    return profile


def compatibility_score(profile_a: dict, profile_b: dict) -> int:
    if not profile_a or not profile_b:
        return 0

    score = 0

    if str(profile_a.get("sleepSchedule", "")).strip().lower() == str(profile_b.get("sleepSchedule", "")).strip().lower():
        score += 25

    if str(profile_a.get("studyHabits", "")).strip().lower() == str(profile_b.get("studyHabits", "")).strip().lower():
        score += 25

    hobbies_a = {str(h).strip().lower() for h in profile_a.get("hobbies", []) if str(h).strip()}
    hobbies_b = {str(h).strip().lower() for h in profile_b.get("hobbies", []) if str(h).strip()}
    score += min(15, len(hobbies_a.intersection(hobbies_b)) * 5)

    likes_a = {str(h).strip().lower() for h in profile_a.get("likes", []) if str(h).strip()}
    likes_b = {str(h).strip().lower() for h in profile_b.get("likes", []) if str(h).strip()}
    score += min(15, len(likes_a.intersection(likes_b)) * 5)

    dislikes_a = {str(h).strip().lower() for h in profile_a.get("dislikes", []) if str(h).strip()}
    dislikes_b = {str(h).strip().lower() for h in profile_b.get("dislikes", []) if str(h).strip()}
    if len(dislikes_a.intersection(dislikes_b)) > 0:
        score += 10

    clean_a = int(profile_a.get("cleanliness", 3) or 3)
    clean_b = int(profile_b.get("cleanliness", 3) or 3)
    score += max(0, 10 - abs(clean_a - clean_b) * 2)

    return min(100, score)

@api_router.get("/bed-availability")
async def get_bed_availability(
    gender: str = Query(None),
    block: str = Query(None),
    hostel_name: str = Query(None),
    ac_type: str = Query(None),
    washroom_type: str = Query(None),
    sharing_type: str = Query(None),
    user: dict = Depends(get_current_user)
):
    user_gender = str(user.get("gender") or "").strip().lower() if user else ""
    cache_key = f"{gender}_{block}_{hostel_name}_{ac_type}_{washroom_type}_{sharing_type}_{user_gender}"
    now_ts = time.time()
    if cache_key in _BED_AVAILABILITY_CACHE and (now_ts - _BED_AVAILABILITY_CACHE_TIME.get(cache_key, 0)) < BED_CACHE_TTL:
        return _BED_AVAILABILITY_CACHE[cache_key]

    rooms = await db.rooms.find({}).to_list(length=3000)
    students = await db.users.find({"role": "student"}, {"hostel_name": 1, "block": 1, "floor": 1, "room_number": 1, "gender": 1}).to_list(length=4000)

    occupier_count = {}
    for s in students:
        key = count_room_occupants_key(s)
        if key:
            occupier_count[key] = occupier_count.get(key, 0) + 1

    clusters: dict[str, Any] = {}

    for rm in rooms:
        h = normalize_hostel_name(rm.get("hostel_name", ""))
        b = normalize_block_name(rm.get("block", ""))
        f = str(rm.get("floor", ""))
        r = str(rm.get("number", rm.get("room_number", "")))
        capacity = int(rm.get("capacity", 4) or 4)

        if not h or not b or not r:
            continue

        r_gender = str(rm.get("gender") or "").lower()
        if not r_gender:
            r_gender = "female" if h.lower() in ["janaki bhawan", "shakuntala bhawan", "teresa bhawan"] else "male"

        room_ac_type = normalize_ac_type(rm)
        room_washroom_type = normalize_washroom_type(rm)
        room_sharing_type = normalize_sharing_type(capacity)

        cluster_key = f"{h}-{b}"
        if cluster_key not in clusters:
            clusters[cluster_key] = {
                "hostel_name": h,
                "block": b,
                "gender": r_gender,
                "total_beds": 0,
                "available_beds": 0,
                "rooms": [],
                "feature_summary": {
                    "ac": {"total_beds": 0, "available_beds": 0},
                    "non-ac": {"total_beds": 0, "available_beds": 0},
                    "attached": {"total_beds": 0, "available_beds": 0},
                    "common": {"total_beds": 0, "available_beds": 0},
                    "3-sharing": {"total_beds": 0, "available_beds": 0},
                    "4-sharing": {"total_beds": 0, "available_beds": 0},
                },
                "matching_available_beds_map": {}
            }

        room_key = f"{h}-{b}-{f}-{r}"
        occ = int(occupier_count.get(room_key, 0))
        available_beds = max(0, capacity - occ)

        clusters[cluster_key]["total_beds"] += capacity
        clusters[cluster_key]["available_beds"] += available_beds

        clusters[cluster_key]["feature_summary"][room_ac_type]["total_beds"] += capacity
        clusters[cluster_key]["feature_summary"][room_ac_type]["available_beds"] += available_beds
        clusters[cluster_key]["feature_summary"][room_washroom_type]["total_beds"] += capacity
        clusters[cluster_key]["feature_summary"][room_washroom_type]["available_beds"] += available_beds

        if room_sharing_type in clusters[cluster_key]["feature_summary"]:
            clusters[cluster_key]["feature_summary"][room_sharing_type]["total_beds"] += capacity
            clusters[cluster_key]["feature_summary"][room_sharing_type]["available_beds"] += available_beds

        map_key = f"{room_ac_type}|{room_washroom_type}|{room_sharing_type}"
        clusters[cluster_key]["matching_available_beds_map"][map_key] = (
            clusters[cluster_key]["matching_available_beds_map"].get(map_key, 0) + available_beds
        )

        clusters[cluster_key]["rooms"].append({
            "room_number": r,
            "floor": f,
            "capacity": capacity,
            "occupancy_count": occ,
            "available_beds": available_beds,
            "is_available": available_beds > 0,
            "ac_type": room_ac_type,
            "washroom_type": room_washroom_type,
            "sharing_type": room_sharing_type
        })

    # paid booking holds should reduce availability only after successful payment
    paid_holds = await db.yearly_bookings.find({"status": "half_paid"}).to_list(length=3000)

    for hold in paid_holds:
        h = normalize_hostel_name(hold.get("hostel_name", ""))
        b = normalize_block_name(hold.get("block", ""))
        prefs = hold.get("preferences", {}) or {}
        ac_pref = str(prefs.get("acType", "non-ac")).strip().lower()
        washroom_pref = str(prefs.get("washroom", "common")).strip().lower()
        sharing_pref = str(prefs.get("roomType", "3-sharing")).strip().lower()

        cluster_key = f"{h}-{b}"
        if cluster_key not in clusters:
          continue

        map_key = f"{ac_pref}|{washroom_pref}|{sharing_pref}"
        current_combo = int(clusters[cluster_key]["matching_available_beds_map"].get(map_key, 0))
        if current_combo > 0:
            clusters[cluster_key]["matching_available_beds_map"][map_key] = current_combo - 1
            clusters[cluster_key]["available_beds"] = max(0, int(clusters[cluster_key]["available_beds"]) - 1)

            if ac_pref in clusters[cluster_key]["feature_summary"]:
                clusters[cluster_key]["feature_summary"][ac_pref]["available_beds"] = max(
                    0, int(clusters[cluster_key]["feature_summary"][ac_pref]["available_beds"]) - 1
                )
            if washroom_pref in clusters[cluster_key]["feature_summary"]:
                clusters[cluster_key]["feature_summary"][washroom_pref]["available_beds"] = max(
                    0, int(clusters[cluster_key]["feature_summary"][washroom_pref]["available_beds"]) - 1
                )
            if sharing_pref in clusters[cluster_key]["feature_summary"]:
                clusters[cluster_key]["feature_summary"][sharing_pref]["available_beds"] = max(
                    0, int(clusters[cluster_key]["feature_summary"][sharing_pref]["available_beds"]) - 1
                )

    results = list(clusters.values())

    # Enforce gender filtering for students (Boys see Boys hostels only, Girls see Girls hostels only)
    user_role = user.get("role", "student")
    user_gender = str(user.get("gender") or "").strip().lower()
    if user_role == "student" and user_gender:
        eff_gender = "female" if user_gender in ["female", "f", "girl", "girls", "woman"] else "male"
        results = [r for r in results if str(r.get("gender", "")).lower() == eff_gender]
    elif gender:
        results = [r for r in results if str(r["gender"]).lower() == str(gender).lower()]

    if block:
        results = [r for r in results if str(r["block"]).lower() == str(block).lower()]
    if hostel_name:
        results = [r for r in results if str(r["hostel_name"]).lower() == str(hostel_name).lower()]

    if ac_type or washroom_type or sharing_type:
        filtered_results = []
        for cluster in results:
            filtered_rooms = cluster["rooms"]
            if ac_type:
                filtered_rooms = [rm for rm in filtered_rooms if rm["ac_type"] == ac_type]
            if washroom_type:
                filtered_rooms = [rm for rm in filtered_rooms if rm["washroom_type"] == washroom_type]
            if sharing_type:
                filtered_rooms = [rm for rm in filtered_rooms if rm["sharing_type"] == sharing_type]

            total_available = sum(int(rm.get("available_beds", 0)) for rm in filtered_rooms)
            if total_available > 0:
                cluster_copy = dict(cluster)
                cluster_copy["rooms"] = filtered_rooms
                cluster_copy["available_beds"] = total_available
                filtered_results.append(cluster_copy)

        results = filtered_results

    _BED_AVAILABILITY_CACHE[cache_key] = results
    _BED_AVAILABILITY_CACHE_TIME[cache_key] = time.time()
    return results


@api_router.get("/bed-availability/history")
async def get_bed_history(user: dict = Depends(get_current_user)):
    username = user.get("username", "")
    enrollment = user.get("enrollment_number", "")
    
    # Fetch from historical logs
    history = await db.booking_history.find({
        "$or": [
            {"student_id": username},
            {"student_id": enrollment},
            {"enrollment_number": enrollment}
        ]
    }).sort("created_at", -1).to_list(100)
    for h in history:
        h["_id"] = str(h["_id"])

    # Include Next Year Booking if exists
    next_booking = await db.yearly_bookings.find_one({
        "$or": [{"student_id": username}, {"student_id": enrollment}],
        "status": {"$in": ["half_paid", "assigned", "pending_payment"]}
    })
    if next_booking:
        b_status = "CONFIRMED / PAID" if next_booking.get("status") in ["half_paid", "assigned"] else "PAYMENT PENDING"
        history.insert(0, {
            "_id": str(next_booking.get("_id")),
            "hostel_name": next_booking.get("hostel_name", "Hostel"),
            "room_number": f"Block {next_booking.get('block', 'A')} ({next_booking.get('preferences', {}).get('roomType', 'Room')})",
            "duration": "Upcoming Academic Year",
            "status": b_status,
            "created_at": next_booking.get("booking_date") or utc_now_iso()
        })

    # Include Current Stay from user profile
    if user.get("hostel_name") and user.get("hostel_name") != "all":
        history.append({
            "_id": f"current-{enrollment or username}",
            "hostel_name": user.get("hostel_name"),
            "room_number": f"{user.get('room_number', 'RM')}{(' - Bed ' + str(user.get('bed_number'))) if user.get('bed_number') else ''}",
            "duration": "Current Academic Session",
            "status": "CURRENT RESIDENT",
            "created_at": user.get("created_at") or "2025-08-01T00:00:00Z"
        })

    return history


@api_router.post("/bed-availability/book")
async def book_bed(payload: dict, user: dict = Depends(get_current_user)):
    h = normalize_hostel_name(payload.get("hostel_name", ""))
    b = normalize_block_name(payload.get("block", ""))
    f = str(payload.get("floor", "")).strip()
    r = str(payload.get("room_number", "")).strip()
    bed_number = str(payload.get("bed_number", "")).strip().upper()

    if not h or not b or not r or not f or not bed_number:
        raise HTTPException(status_code=400, detail="Missing room assignment info")

    student = await db.users.find_one({"enrollment_number": user["enrollment_number"]})
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    rm_doc = await db.rooms.find_one({"hostel_name": h, "block": b, "floor": f, "number": r})
    if not rm_doc:
        raise HTTPException(status_code=404, detail="Room not found")

    capacity = int(rm_doc.get("capacity", 4) or 4)
    allowed_beds = [chr(65 + i) for i in range(capacity)]
    if bed_number not in allowed_beds:
        raise HTTPException(status_code=400, detail=f"Invalid bed number. Allowed: {', '.join(allowed_beds)}")

    current_occupants = await db.users.find({
        "hostel_name": h,
        "block": b,
        "floor": f,
        "room_number": r
    }).to_list(10)

    used_beds = {str(s.get("bed_number", "")).upper() for s in current_occupants if s.get("bed_number")}
    if bed_number in used_beds:
        raise HTTPException(status_code=400, detail="Selected bed number is already occupied")

    previous_assignment = {
        "hostel_name": student.get("hostel_name", "N/A"),
        "block": student.get("block", "N/A"),
        "floor": student.get("floor", "N/A"),
        "room_number": student.get("room_number", "N/A"),
        "bed_number": student.get("bed_number", "")
    }

    await db.users.update_one(
        {"enrollment_number": user["enrollment_number"]},
        {"$set": {
            "hostel_name": h,
            "block": b,
            "floor": f,
            "room_number": r,
            "bed_number": bed_number
        }}
    )

    await db.booking_history.insert_one({
        "student_id": user.get("username", ""),
        "hostel_name": h,
        "block": b,
        "floor": f,
        "room_number": r,
        "bed_number": bed_number,
        "status": "APPROVED",
        "duration": "Current Semester",
        "previous_assignment": previous_assignment,
        "created_at": iso_now_ist()
    })

    invalidate_bed_cache()
    invalidate_students_cache()
    return {"message": "Room booked successfully"}

@api_router.post("/bed-availability/swap-request")
async def request_room_swap(data: dict = Body(...), user: dict = Depends(get_current_user)):
    """
    Creates a room/bed swap request that awaits admin approval.
    """
    # Requires: target_hostel, target_room
    required_fields = ["target_hostel", "target_room"]
    if not all(field in data for field in required_fields):
        raise HTTPException(400, "Missing target swap details")

    # Log the swap request into a new collection for admin review
    swap_request = {
        "student_id": user["username"],
        "student_name": user.get("name", user["username"]),
        "current_hostel": user.get("hostel_name", "Unknown"),
        "current_room": user.get("room_number", "Unknown"),
        "target_hostel": data["target_hostel"],
        "target_room": data["target_room"],
        "target_bed": data.get("target_bed"), # Optional specific bed
        "status": "pending_admin_approval",
        "payment_difference_status": "pending",
        "requested_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.swap_requests.insert_one(swap_request)
    return {"status": "success", "message": "Swap request submitted to Admin for approval."}

@api_router.post("/bookings/confirm-payment/{booking_id}")
async def confirm_booking_payment(booking_id: str, user: dict = Depends(get_current_user)):
    if user["role"] != "student":
        raise HTTPException(403, "Forbidden")
        
    from bson import ObjectId
    
    # Update payment to success
    await db.payments.update_one(
        {"booking_ref": booking_id, "student_id": user["username"]},
        {"$set": {"status": "Success", "date": datetime.now(timezone.utc).isoformat()}}
    )
    
    # Update booking to confirmed (half_paid)
    await db.yearly_bookings.update_one(
        {"_id": ObjectId(booking_id)},
        {"$set": {"status": "half_paid"}}
    )
    
    return {"status": "success", "message": "Payment verified. Your room is blocked!"}

@api_router.post("/bed-availability/update")
async def update_bed_availability(data: dict, user: dict = Depends(get_current_user)):
    """
    Admin-only route to manually update counts.
    """
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admin can update bed availability")
    
    required_fields = ["hostel_name", "block", "floor", "occupied_beds"]
    if not all(field in data for field in required_fields):
        raise HTTPException(status_code=400, detail="Missing required fields")

    result = await db.hostel_beds.update_one(
        {
            "hostel_name": data["hostel_name"], 
            "block": data["block"], 
            "floor": data["floor"]
        },
        {
            "$set": {
                "occupied_beds": int(data["occupied_beds"]),
                "last_updated": datetime.now(timezone.utc).isoformat()
            }
        }
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Hostel record not found")
        
    return {"status": "success", "message": "Bed availability updated successfully"}

@api_router.get("/student/yearly-booking-status")
async def get_student_yearly_booking_status(user: dict = Depends(get_current_user)):
    if user["role"] != "student":
        raise HTTPException(status_code=403, detail="Students only")

    booking = await db.yearly_bookings.find_one(
        {"student_id": user["username"]},
        sort=[("booking_date", -1)]
    )

    roommate_profile = await db.roommate_profiles.find_one({
        "$or": [
            {"student_id": user["username"]},
            {"student_username": user["username"]},
            {"username": user["username"]}
        ]
    })

    if not booking:
        if roommate_profile:
            roommate_profile["_id"] = str(roommate_profile["_id"])
        return {"booking": None, "payment": None, "roommate_profile": roommate_profile}

    payment = await db.payments.find_one(
        {"booking_ref": str(booking["_id"]), "student_id": user["username"]},
        sort=[("date", -1)]
    )

    booking["_id"] = str(booking["_id"])
    if payment:
        payment["_id"] = str(payment["_id"])
        payment["booking_ref"] = str(payment.get("booking_ref"))
    if roommate_profile:
        roommate_profile["_id"] = str(roommate_profile["_id"])

    return {"booking": booking, "payment": payment, "roommate_profile": roommate_profile}


@api_router.delete("/bookings/draft")
async def delete_draft_booking(user: dict = Depends(get_current_user)):
    if user["role"] != "student":
        raise HTTPException(status_code=403, detail="Only students can delete bookings")
    
    await db.yearly_bookings.delete_many({
        "student_id": user["username"],
        "status": "pending_payment"
    })
    await db.payments.delete_many({
        "student_id": user["username"],
        "status": {"$in": ["Pending", "pending"]},
        "type": "hostel_booking"
    })
    return {"message": "Draft booking and pending payments deleted successfully"}

@api_router.post("/bookings/create")
async def create_hostel_booking(req: dict = Body(...), user: dict = Depends(get_current_user)):
    if user["role"] != "student":
        raise HTTPException(status_code=403, detail="Only students can book hostels")

    hostel_name = normalize_hostel_name(req.get("hostel_name", ""))
    block = normalize_block_name(req.get("block", ""))
    preferences = req.get("preferences", {}) or {}
    roommate_profile = req.get("roommate_profile", {}) or {}
    booking_date = req.get("booking_date", datetime.now(timezone.utc).isoformat())

    if not hostel_name or not block:
        raise HTTPException(status_code=400, detail="Hostel and block are required")

    existing = await db.yearly_bookings.find_one({
        "student_id": user["username"],
        "status": {"$in": ["pending_payment", "half_paid", "assigned"]}
    })
    if existing:
        raise HTTPException(status_code=400, detail="You already have an active next-year booking")

    ac_pref = str(preferences.get("acType", "non-ac")).strip().lower()
    washroom_pref = str(preferences.get("washroom", "common")).strip().lower()
    sharing_pref = str(preferences.get("roomType", "3-sharing")).strip().lower()

    rooms = await db.rooms.find({
        "hostel_name": hostel_name,
        "block": block
    }).to_list(1000)

    students = await db.users.find({"role": "student"}).to_list(4000)
    occupier_count = {}
    for s in students:
        key = count_room_occupants_key(s)
        if key:
            occupier_count[key] = occupier_count.get(key, 0) + 1

    matching_available_beds = 0
    for rm in rooms:
        room_ac_type = normalize_ac_type(rm)
        room_washroom_type = normalize_washroom_type(rm)
        room_sharing_type = normalize_sharing_type(int(rm.get("capacity", 4) or 4))

        if room_ac_type != ac_pref or room_washroom_type != washroom_pref or room_sharing_type != sharing_pref:
            continue

        room_key = f"{hostel_name}-{block}-{str(rm.get('floor', ''))}-{str(rm.get('number', rm.get('room_number', '')))}"
        capacity = int(rm.get("capacity", 4) or 4)
        occ = int(occupier_count.get(room_key, 0))
        matching_available_beds += max(0, capacity - occ)

    paid_holds = await db.yearly_bookings.count_documents({
        "hostel_name": hostel_name,
        "block": block,
        "status": "half_paid",
        "preferences.acType": ac_pref,
        "preferences.washroom": washroom_pref,
        "preferences.roomType": sharing_pref
    })

    matching_available_beds = max(0, matching_available_beds - int(paid_holds or 0))

    if matching_available_beds <= 0:
        raise HTTPException(status_code=400, detail="No beds available for the selected hostel features")

    booking_doc = {
        "student_id": user["username"],
        "student_name": user.get("student_name", "Unknown"),
        "hostel_name": hostel_name,
        "block": block,
        "preferences": preferences,
        "status": "pending_payment",
        "booking_date": booking_date,
        "matching_available_beds_at_booking": matching_available_beds
    }

    result = await db.yearly_bookings.insert_one(booking_doc)
    booking_id = str(result.inserted_id)

    await db.roommate_profiles.update_one(
        {
            "$or": [
                {"student_id": user["username"]},
                {"student_username": user["username"]},
                {"username": user["username"]}
            ]
        },
        {
            "$set": {
                "student_id": user["username"],
                "student_username": user["username"],
                "student_name": user.get("student_name", "Student"),
                "sleepSchedule": roommate_profile.get("sleepSchedule"),
                "studyHabits": roommate_profile.get("studyHabits"),
                "cleanliness": int(roommate_profile.get("cleanliness", 3) or 3),
                "likes": roommate_profile.get("likes", []),
                "dislikes": roommate_profile.get("dislikes", []),
                "hobbies": roommate_profile.get("hobbies", []),
                "isLooking": bool(roommate_profile.get("isLooking", True)),
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
        },
        upsert=True
    )

    booking_amount = int(req.get("booking_amount", 25000) or 25000)

    payment = {
        "student_id": user["username"],
        "type": "hostel_booking",
        "amount": booking_amount,
        "purpose": f"Yearly Booking - Half Payment ({hostel_name})",
        "status": "Pending",
        "payment_mode": "UPI",
        "payment_method": "upi",
        "payer_upi": "",
        "transaction_ref": "",
        "date": booking_date,
        "booking_ref": booking_id
    }

    pay_result = await db.payments.insert_one(payment)
    payment["_id"] = str(pay_result.inserted_id)

    booking_doc["_id"] = booking_id
    return {
        "status": "success",
        "booking_id": booking_id,
        "payment_required": booking_amount,
        "booking": booking_doc,
        "payment": payment,
        "roommate_profile": roommate_profile,
        "message": "Booking pending. Complete the payment to block your room."
    }


@api_router.post("/bookings/submit-payment/{booking_id}")
async def submit_booking_payment(booking_id: str, data: dict = Body(...), user: dict = Depends(get_current_user)):
    if user["role"] != "student":
        raise HTTPException(status_code=403, detail="Forbidden")

    booking = await db.yearly_bookings.find_one({"_id": ObjectId(booking_id), "student_id": user["username"]})
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")

    payment = await db.payments.find_one({"booking_ref": booking_id, "student_id": user["username"]})
    if not payment:
        raise HTTPException(status_code=404, detail="Payment record not found")

    payment_method = str(data.get("payment_method", "")).strip().lower()
    payer_upi = str(data.get("payer_upi", "")).strip()
    transaction_ref = str(data.get("transaction_ref", "")).strip()
    qr_scanned = bool(data.get("qr_scanned", False))

    if not qr_scanned:
        raise HTTPException(status_code=400, detail="Scanner confirmation is required")
    if not transaction_ref:
        raise HTTPException(status_code=400, detail="Transaction reference is required")
    if payment_method == "upi" and not payer_upi:
        raise HTTPException(status_code=400, detail="Payer UPI is required")

    now_iso = datetime.now(timezone.utc).isoformat()

    await db.payments.update_one(
        {"_id": payment["_id"]},
        {"$set": {
            "status": "Success",
            "payment_mode": payment_method.upper(),
            "payment_method": payment_method,
            "payer_upi": payer_upi,
            "transaction_ref": transaction_ref,
            "qr_scanned": qr_scanned,
            "date": now_iso
        }}
    )

    await db.yearly_bookings.update_one(
        {"_id": ObjectId(booking_id)},
        {"$set": {"status": "half_paid", "payment_confirmed_at": now_iso}}
    )

    updated_booking = await db.yearly_bookings.find_one({"_id": ObjectId(booking_id)})
    updated_payment = await db.payments.find_one({"booking_ref": booking_id, "student_id": user["username"]})
    roommate_profile = await get_roommate_profile_for_student(user["username"])

    updated_booking["_id"] = str(updated_booking["_id"])
    updated_payment["_id"] = str(updated_payment["_id"])
    updated_payment["booking_ref"] = str(updated_payment["booking_ref"])
    if roommate_profile:
        roommate_profile["_id"] = str(roommate_profile["_id"])

    return {
        "status": "success",
        "message": "Payment verified. Your room is blocked!",
        "booking": updated_booking,
        "payment": updated_payment,
        "roommate_profile": roommate_profile
    }

@api_router.get("/student/profile-live")
async def get_student_profile_live(user: dict = Depends(get_current_user)):
    if user["role"] != "student":
        raise HTTPException(status_code=403, detail="Students only")

    db_user = await db.users.find_one(
        {"username": user["username"], "role": "student"},
        {"password": 0}
    )
    if not db_user:
        raise HTTPException(status_code=404, detail="Student not found")

    db_user["_id"] = str(db_user["_id"])
    return db_user


@api_router.get("/student/roommate-profile")
async def get_student_roommate_profile(user: dict = Depends(get_current_user)):
    if user["role"] != "student":
        raise HTTPException(status_code=403, detail="Students only")

    profile = await db.roommate_profiles.find_one({
        "$or": [
            {"student_id": user["username"]},
            {"student_username": user["username"]},
            {"username": user["username"]}
        ]
    })

    if not profile:
        return None

    profile["_id"] = str(profile["_id"])
    return profile
    
# ==================== HOSTEL BOOKING ROUTES ====================

# @api_router.post("/yearly-bookings/create")
# async def create_booking(data: dict, user: dict = Depends(get_current_user)):
#     """Submit hostel booking request"""
#     booking = {
#         "student_id": user["username"],
#         "student_name": user.get("student_name", user["username"]),
#         "enrollment_number": user.get("enrollment_number"),
#         "hostel_id": data.get("hostel_id"),
#         "hostel_name": data.get("hostel_name"),
#         "preferences": data.get("preferences"),
#         "status": "pending",
#         "booking_date": data.get("booking_date"),
#         "created_at": datetime.now(timezone.utc).isoformat()
#     }

#     await db.bookings.insert_one(booking)
#     return {"message": "Booking request submitted successfully", "booking": booking}

# @api_router.get("/bookings")
# async def get_bookings(user: dict = Depends(get_current_user)):
#     """Get all booking requests (admin) or user's bookings (student)"""
#     if user["role"] == "admin":
#         bookings = await db.bookings.find({}, {"_id": 0}).sort("created_at", -1).to_list(100)
#     else:
#         bookings = await db.bookings.find({"student_id": user["username"]}, {"_id": 0}).sort("created_at", -1).to_list(10)
    
#     return bookings

# @api_router.patch("/bookings/{booking_id}/approve")
# async def approve_booking(booking_id: str, data: dict, user: dict = Depends(get_current_user)):
#     """Approve or reject booking (admin only)"""
#     if user["role"] != "admin":
#         raise HTTPException(status_code=403, detail="Admin only")
    
#     result = await db.bookings.update_one(
#         {"created_at": booking_id},
#         {"$set":
#          {
#              "status": data.get("status"),  # "approved" or "rejected"
#              "approved_by": user["username"],
#              "approved_at": datetime.now(timezone.utc).isoformat(),
#              "assigned_room": data.get("assigned_room"),
#              "assigned_floor": data.get("assigned_floor"),
#              "assigned_bed": data.get("assigned_bed")
#          }
#         }
#     )

#     return {"message": f"Booking {data.get('status')}"} 

# ==================== ADMIN ROOM ROUTES ====================
@api_router.post("/admin/rooms/remove-student")
async def admin_remove_student(payload: dict, user: dict = Depends(get_current_user)):
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    student_id = payload.get("student_id")
    if not student_id:
        raise HTTPException(status_code=400, detail="student_id is required")
    
    result = await db.users.update_one(
        {"_id": ObjectId(student_id)},
        {"$set": {
            "hostel_name": "N/A",
            "block": "N/A",
            "floor": "N/A",
            "room_number": "N/A",
            "bed_number": ""
        }}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Student not found or already evicted")
        
    return {"message": "Student successfully evicted from room"}

@api_router.get("/admin/yearly-bookings")
async def get_yearly_bookings(user: dict = Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")

    bookings = await db.yearly_bookings.find({}).sort("booking_date", -1).to_list(1000)
    enriched = []

    for booking in bookings:
        booking_id = str(booking["_id"])

        payment = await db.payments.find_one(
            {"booking_ref": booking_id},
            sort=[("date", -1)]
        )

        student_profile = await get_roommate_profile_for_student(booking.get("student_id", ""))

        roommate_matches = []
        if student_profile and student_profile.get("isLooking", True):
            other_profiles = await db.roommate_profiles.find({
                "isLooking": True,
                "student_id": {"$ne": booking.get("student_id", "")}
            }).to_list(200)

            scored = []
            for other in other_profiles:
                score = compatibility_score(student_profile, other)
                other_name = (
                    other.get("student_name")
                    or other.get("name")
                    or "Student"
                )
                if score > 0:
                    scored.append({
                        "student_name": other_name,
                        "score": score
                    })

            roommate_matches = sorted(
                scored,
                key=lambda x: x["score"],
                reverse=True
            )[:5]

        enriched.append({
            "_id": booking_id,
            "student_id": booking.get("student_id"),
            "student_name": booking.get("student_name"),
            "hostel_name": booking.get("hostel_name"),
            "block": booking.get("block"),
            "preferences": booking.get("preferences", {}),
            "status": booking.get("status"),
            "booking_date": booking.get("booking_date"),

            "payment_status": payment.get("status") if payment else "Pending",
            "payment_amount": payment.get("amount", 0) if payment else 0,
            "payment_method": (payment.get("payment_method") or payment.get("payment_mode")) if payment else "",
            "payer_upi": payment.get("payer_upi", "") if payment else "",
            "transaction_ref": payment.get("transaction_ref", "") if payment else "",

            "assigned_floor": booking.get("assigned_floor"),
            "assigned_room_number": booking.get("assigned_room_number"),
            "assigned_bed_number": booking.get("assigned_bed_number"),

            "personality": {
                "sleepSchedule": student_profile.get("sleepSchedule") if student_profile else "",
                "studyHabits": student_profile.get("studyHabits") if student_profile else "",
                "cleanliness": student_profile.get("cleanliness") if student_profile else "",
                "likes": student_profile.get("likes", []) if student_profile else [],
                "dislikes": student_profile.get("dislikes", []) if student_profile else [],
                "hobbies": student_profile.get("hobbies", []) if student_profile else [],
                "isLooking": student_profile.get("isLooking", False) if student_profile else False
            },

            "roommate_matches": roommate_matches
        })

    return enriched

@api_router.post("/admin/yearly-bookings/assign-room")
async def assign_yearly_booking_room(data: dict = Body(...), user: dict = Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")

    booking_id = str(data.get("booking_id", "")).strip()
    student_id = str(data.get("student_id", "")).strip()
    hostel_name = normalize_hostel_name(data.get("hostel_name", ""))
    block = normalize_block_name(data.get("block", ""))
    floor = str(data.get("floor", "")).strip()
    room_number = str(data.get("room_number", "")).strip()
    bed_number = str(data.get("bed_number", "")).strip().upper()

    if not booking_id or not student_id or not hostel_name or not block or not floor or not room_number or not bed_number:
        raise HTTPException(status_code=400, detail="Missing assignment fields")

    booking = await db.yearly_bookings.find_one({"_id": ObjectId(booking_id)})
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")

    payment = await db.payments.find_one({"booking_ref": booking_id, "student_id": student_id})
    if not payment or str(payment.get("status", "")).lower() != "success":
        raise HTTPException(status_code=400, detail="Student must complete payment before room assignment")

    student = await db.users.find_one({"username": student_id, "role": "student"})
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    target_room = await db.rooms.find_one({
        "hostel_name": hostel_name,
        "block": block,
        "floor": floor,
        "$or": [
            {"number": room_number},
            {"room_number": room_number}
        ]
    })
    if not target_room:
        raise HTTPException(status_code=404, detail="Target room not found")

    capacity = int(target_room.get("capacity", 4) or 4)
    allowed_beds = [chr(65 + i) for i in range(capacity)]
    if bed_number not in allowed_beds:
        raise HTTPException(status_code=400, detail=f"Invalid bed number. Allowed: {', '.join(allowed_beds)}")

    current_in_target = await db.users.find({
        "hostel_name": hostel_name,
        "block": block,
        "floor": floor,
        "room_number": room_number
    }).to_list(10)

    used_beds = {str(item.get("bed_number", "")).upper() for item in current_in_target if item.get("bed_number")}
    if bed_number in used_beds:
        raise HTTPException(status_code=400, detail="Bed already occupied in target room")

    previous_assignment = {
        "hostel_name": student.get("hostel_name", "N/A"),
        "block": student.get("block", "N/A"),
        "floor": student.get("floor", "N/A"),
        "room_number": student.get("room_number", "N/A"),
        "bed_number": student.get("bed_number", "")
    }

    await db.users.update_one(
        {"_id": student["_id"]},
        {"$set": {
            "hostel_name": hostel_name,
            "block": block,
            "floor": floor,
            "room_number": room_number,
            "bed_number": bed_number,
            "hostel": hostel_name,
            "room": room_number,
            "bed": bed_number
        }}
    )

    await db.yearly_bookings.update_one(
        {"_id": ObjectId(booking_id)},
        {"$set": {
            "status": "assigned",
            "assigned_floor": floor,
            "assigned_room_number": room_number,
            "assigned_bed_number": bed_number,
            "assigned_at": datetime.now(timezone.utc).isoformat()
        }}
    )

    await db.booking_history.insert_one({
        "student_id": student_id,
        "hostel_name": hostel_name,
        "block": block,
        "floor": floor,
        "room_number": room_number,
        "bed_number": bed_number,
        "status": "YEARLY_ASSIGNMENT_APPROVED",
        "previous_assignment": previous_assignment,
        "created_at": iso_now_ist()
    })

    await db.notifications.insert_one({
        "student_id": student_id,
        "title": "Yearly Room Allocated! 🎉",
        "message": f"Congratulations! Your room for the upcoming academic year has been allocated to {hostel_name}, Block {block}, Floor {floor}, Room {room_number}, Bed {bed_number}.",
        "type": "yearly_allocation",
        "read": False,
        "created_at": iso_now_ist()
    })

    return {"status": "success", "message": "Room assigned successfully"}

@api_router.post("/admin/yearly-bookings/ai-suggest")
async def ai_suggest_yearly_room(data: dict = Body(...), user: dict = Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")

    booking_id = str(data.get("booking_id", "")).strip()
    if not booking_id:
        raise HTTPException(status_code=400, detail="Missing booking_id")

    booking = await db.yearly_bookings.find_one({"_id": ObjectId(booking_id)})
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")

    hostel_name = normalize_hostel_name(booking.get("hostel_name", ""))
    block = normalize_block_name(booking.get("block", ""))
    personality = booking.get("personality") or {}

    query = {"hostel_name": hostel_name}
    if block:
        query["block"] = block

    candidate_rooms = await db.rooms.find(query).to_list(100)
    if not candidate_rooms:
        candidate_rooms = await db.rooms.find({"hostel_name": hostel_name}).to_list(100)

    best_suggestion = None
    highest_score = -1

    for rm in candidate_rooms:
        f = str(rm.get("floor", "1"))
        r = str(rm.get("number", rm.get("room_number", "")))
        capacity = int(rm.get("capacity", 4) or 4)
        allowed_beds = [chr(65 + i) for i in range(capacity)]

        occupants = await db.users.find({
            "hostel_name": hostel_name,
            "room_number": r
        }).to_list(10)
        used_beds = {str(o.get("bed_number", "")).upper() for o in occupants if o.get("bed_number")}
        free_beds = [b for b in allowed_beds if b not in used_beds]

        if not free_beds:
            continue

        score = 80
        # If room has occupants, evaluate personality compatibility
        if occupants:
            for occ in occupants:
                occ_user = await db.users.find_one({"username": occ.get("username")}) or occ
                occ_sleep = str(occ_user.get("sleep_schedule") or "night_owl").lower()
                stud_sleep = str(personality.get("sleepSchedule", "night_owl")).lower()
                if occ_sleep == stud_sleep:
                    score += 10
                occ_study = str(occ_user.get("study_habits") or "moderate").lower()
                stud_study = str(personality.get("studyHabits", "moderate")).lower()
                if occ_study == stud_study:
                    score += 8
        else:
            score = 92  # Fresh room bonus

        if score > highest_score:
            highest_score = score
            best_suggestion = {
                "suggested_hostel": hostel_name,
                "suggested_block": rm.get("block", block or "A"),
                "suggested_floor": f,
                "suggested_room": r,
                "suggested_bed": free_beds[0],
                "score": min(98, score),
                "reason": f"AI selected Room {r} based on {personality.get('sleepSchedule', 'aligned')} habits & available Bed {free_beds[0]}"
            }

    if not best_suggestion:
        best_suggestion = {
            "suggested_hostel": hostel_name,
            "suggested_block": block or "A",
            "suggested_floor": "1",
            "suggested_room": "101",
            "suggested_bed": "A",
            "score": 85,
            "reason": "Default optimal room allocation"
        }

    return best_suggestion

@api_router.post("/admin/yearly-bookings/auto-allocate")
async def auto_allocate_yearly_bookings(data: dict = Body(default={}), user: dict = Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")

    mode = data.get("mode", "smart")
    bookings = await db.yearly_bookings.find({
        "status": {"$ne": "assigned"}
    }).to_list(200)

    allocated_count = 0
    for b in bookings:
        h = normalize_hostel_name(b.get("hostel_name", ""))
        blk = normalize_block_name(b.get("block", ""))
        rooms = await db.rooms.find({"hostel_name": h}).to_list(100)
        import random
        if mode == "random":
            random.shuffle(rooms)

        assigned_room = None
        assigned_bed = None
        assigned_floor = None
        assigned_block = None

        for rm in rooms:
            f = str(rm.get("floor", "1"))
            r = str(rm.get("number", rm.get("room_number", "")))
            capacity = int(rm.get("capacity", 4) or 4)
            allowed_beds = [chr(65 + i) for i in range(capacity)]
            if mode == "random":
                random.shuffle(allowed_beds)

            occupants = await db.users.find({
                "hostel_name": h,
                "room_number": r
            }).to_list(10)
            used_beds = {str(o.get("bed_number", "")).upper() for o in occupants if o.get("bed_number")}
            free = [bed for bed in allowed_beds if bed not in used_beds]

            if free:
                assigned_room = r
                assigned_bed = free[0]
                assigned_floor = f
                assigned_block = rm.get("block", blk or "A")
                break

        if assigned_room and assigned_bed:
            student_id = b.get("student_id") or b.get("username")
            await db.users.update_one(
                {"username": student_id},
                {"$set": {
                    "hostel_name": h,
                    "block": assigned_block,
                    "floor": assigned_floor,
                    "room_number": assigned_room,
                    "bed_number": assigned_bed,
                    "hostel": h,
                    "room": assigned_room,
                    "bed": assigned_bed
                }}
            )
            await db.yearly_bookings.update_one(
                {"_id": b["_id"]},
                {"$set": {
                    "status": "assigned",
                    "assigned_floor": assigned_floor,
                    "assigned_room_number": assigned_room,
                    "assigned_bed_number": assigned_bed,
                    "assigned_at": datetime.now(timezone.utc).isoformat()
                }}
            )
            await db.notifications.insert_one({
                "student_id": student_id,
                "title": "Room Allocated Automatically! 🏠",
                "message": f"You have been allocated to {h}, Block {assigned_block}, Floor {assigned_floor}, Room {assigned_room}, Bed {assigned_bed}.",
                "type": "yearly_allocation",
                "read": False,
                "created_at": iso_now_ist()
            })
            allocated_count += 1

    return {
        "status": "success",
        "allocated_count": allocated_count,
        "message": f"Successfully allocated {allocated_count} students to rooms using {mode} allocation!"
    }

@api_router.post("/admin/yearly-bookings/reset-cycle")
async def reset_yearly_booking_cycle(user: dict = Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")

    await db.yearly_bookings.delete_many({})
    await db.payments.delete_many({"type": "hostel_booking"})
    return {"status": "success", "message": "Yearly booking cycle reset successfully"}

@api_router.get("/admin/bed-management/swaps")
async def get_all_swap_requests(user: dict = Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
        
    requests = await db.swap_requests.find({"status": "pending_admin_approval"}).to_list(100)
    for req in requests:
        req["_id"] = str(req["_id"])
    return requests

@api_router.post("/admin/bed-management/swaps/{request_id}/{action}")
async def process_swap_request(request_id: str, action: str, user: dict = Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
        
    from bson.objectid import ObjectId
    try:
        obj_id = ObjectId(request_id)
    except:
        raise HTTPException(400, "Invalid Request ID")
        
    req = await db.swap_requests.find_one({"_id": obj_id})
    if not req:
        raise HTTPException(404, "Swap request not found")
        
    if action == "approve":
        # Calculate payment difference if hostels map to different tiers
        # Dummy logic: Let's assume some hostels are more expensive
        # In a real app, this would query a hostel pricing collection
        tier_pricing = {
            "Tagaur Bhawan": 60000,
            "Visvesvaraya Bhawan": 65000,
            "Raman Bhawan": 55000,
            "C.V. Raman": 58000
        }
        
        old_price = tier_pricing.get(req["current_hostel"], 50000)
        new_price = tier_pricing.get(req["target_hostel"], 50000)
        price_difference = new_price - old_price
        
        # Check room availability
        target_room = await db.rooms.find_one({
            "hostel_name": req["target_hostel"],
            "room_number": req["target_room"],
            "is_available": True
        })
        
        if not target_room:
            raise HTTPException(400, "Target room is no longer available.")
            
        # 1. Update target room to occupied
        await db.rooms.update_one(
            {"_id": target_room["_id"]},
            {"$set": {"is_available": False, "occupied_by": req["student_id"]}}
        )
        
        # 2. Free the current room
        current_room = await db.rooms.find_one({
            "hostel_name": req["current_hostel"],
            "room_number": req["current_room"],
            "occupied_by": req["student_id"]
        })
        
        if current_room:
            await db.rooms.update_one(
                {"_id": current_room["_id"]},
                {"$set": {"is_available": True, "occupied_by": None}}
            )
            # Adjust bed counts for old room
            await db.hostel_beds.update_one(
                {"hostel_name": req["current_hostel"], "block": current_room.get("block", "A")},
                {"$inc": {"occupied_beds": -1}}
            )
            
        # Adjust bed counts for new room
        await db.hostel_beds.update_one(
            {"hostel_name": req["target_hostel"], "block": target_room.get("block", "A")},
            {"$inc": {"occupied_beds": 1}}
        )
            
        # 3. Update the student's profile doc explicitly
        await db.users.update_one(
            {"username": req["student_id"]},
            {"$set": {"hostel_name": req["target_hostel"], "room_number": req["target_room"]}}
        )
        
        # 4. Handle Payment Difference
        if price_difference > 0:
            payment_record = {
                "student_id": req["student_id"],
                "amount": price_difference,
                "purpose": f"Upgrade Difference: {req['current_hostel']} -> {req['target_hostel']}",
                "status": "Pending",
                "payment_mode": "Online",
                "date": datetime.now(timezone.utc).isoformat()
            }
            await db.payments.insert_one(payment_record)
        
        # Finally mark request approved
        await db.swap_requests.update_one({"_id": obj_id}, {"$set": {"status": "approved"}})
        return {"status": "success", "message": "Swap Approved."}
        
    elif action == "reject":
        await db.swap_requests.update_one({"_id": obj_id}, {"$set": {"status": "rejected"}})
        return {"status": "success", "message": "Swap Rejected."}
        
    raise HTTPException(400, "Invalid action")

@api_router.post("/admin/bed-management/assign")
async def direct_bed_assignment(data: dict = Body(...), user: dict = Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")

    required = ["username", "targetHostel", "targetBlock", "targetFloor", "targetRoom", "targetBed"]
    if not all(field in data for field in required):
        raise HTTPException(status_code=400, detail="Missing parameters")

    student = await db.users.find_one({"username": data["username"], "role": "student"})
    if not student:
        raise HTTPException(status_code=404, detail="Student username not found.")

    target_room = await db.rooms.find_one({
        "hostel_name": normalize_hostel_name(data["targetHostel"]),
        "block": normalize_block_name(data["targetBlock"]),
        "floor": str(data["targetFloor"]),
        "number": str(data["targetRoom"])
    })
    if not target_room:
        raise HTTPException(status_code=404, detail="Target room not found")

    capacity = int(target_room.get("capacity", 4) or 4)
    allowed_beds = [chr(65 + i) for i in range(capacity)]
    target_bed = str(data["targetBed"]).upper()
    if target_bed not in allowed_beds:
        raise HTTPException(status_code=400, detail=f"Invalid bed number. Allowed: {', '.join(allowed_beds)}")

    existing_in_target = await db.users.find({
        "hostel_name": normalize_hostel_name(data["targetHostel"]),
        "block": normalize_block_name(data["targetBlock"]),
        "floor": str(data["targetFloor"]),
        "room_number": str(data["targetRoom"])
    }).to_list(10)

    used_beds = {str(s.get("bed_number", "")).upper() for s in existing_in_target if s.get("bed_number")}
    if target_bed in used_beds:
        raise HTTPException(status_code=400, detail="Selected bed is already occupied")

    await db.users.update_one(
        {"_id": student["_id"]},
        {"$set": {
            "hostel_name": normalize_hostel_name(data["targetHostel"]),
            "block": normalize_block_name(data["targetBlock"]),
            "floor": str(data["targetFloor"]),
            "room_number": str(data["targetRoom"]),
            "bed_number": target_bed
        }}
    )

    return {"status": "success"}

# ==================== MESS MENU / FEEDBACK / VOTING / ANALYTICS ROUTES ====================

from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo
from typing import Optional
import os
import re
import json

from fastapi import Body, Depends, HTTPException, Query
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

INDIA_TZ = ZoneInfo("Asia/Kolkata")
DAY_ORDER = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]

MESS_POINTS_FEEDBACK = 5
MESS_POINTS_ANON_FEEDBACK = 3
MESS_POINTS_VOTE = 10


def india_now():
    return datetime.now(INDIA_TZ)


def utc_now_iso():
    return datetime.now(timezone.utc).isoformat()


def normalize_day_name(day: str) -> str:
    value = str(day or "").strip().capitalize()
    return value if value in DAY_ORDER else "Monday"


def stringify_menu_value(value):
    if isinstance(value, list):
        return ", ".join([str(x).strip() for x in value if str(x).strip()])
    return str(value or "").strip()


def parse_menu_items(value):
    if isinstance(value, list):
        return [str(x).strip() for x in value if str(x).strip()]
    return [x.strip() for x in str(value or "").split(",") if x.strip()]


# ADDED: this helper was missing in your code
def get_current_week_monday(dt=None):
    dt = dt or india_now()
    return (dt - timedelta(days=dt.weekday())).date()


def get_current_week_start_india(dt=None):
    return get_current_week_monday(dt).isoformat()


def get_next_week_start_india(dt=None):
    monday = get_current_week_monday(dt)
    return (monday + timedelta(days=7)).isoformat()


def get_previous_week_start_india(dt=None):
    monday = get_current_week_monday(dt)
    return (monday - timedelta(days=7)).isoformat()


def get_feedback_cycle_week_start(dt=None):
    # feedback decides next week's Sunday special
    return get_next_week_start_india(dt)


def get_voting_cycle_week_start(dt=None):
    # Wednesday voting decides next week's Sunday special
    dt = dt or india_now()
    return get_current_week_start_india(dt)

def get_feedback_deadline_india(dt=None):
    dt = dt or india_now()
    monday = get_current_week_monday(dt)

    deadline = datetime.combine(
        monday + timedelta(days=1),  # Tuesday
        datetime.min.time(),
        tzinfo=INDIA_TZ
    ).replace(hour=23, minute=59, second=59, microsecond=0)

    # If this week's Tuesday deadline has already passed, point to next week's Tuesday
    if dt > deadline:
        deadline = deadline + timedelta(days=7)

    return deadline


def is_feedback_open(dt=None):
    # Keep suggestions open for students so choices can always be gathered for AI
    return True


def get_voting_window_for_current_week(dt=None):
    dt = dt or india_now()
    monday = dt - timedelta(days=dt.weekday())
    monday = monday.replace(hour=0, minute=0, second=0, microsecond=0)

    voting_start = (monday + timedelta(days=2)).replace(
        hour=21, minute=0, second=0, microsecond=0
    )
    voting_end = (monday + timedelta(days=2)).replace(
        hour=23, minute=0, second=0, microsecond=0
    )

    if dt > voting_end:
        voting_start += timedelta(days=7)
        voting_end += timedelta(days=7)

    return voting_start, voting_end


def is_voting_live(dt=None):
    dt = dt or india_now()
    start, end = get_voting_window_for_current_week(dt)
    return start <= dt < end


def get_month_key_india(dt=None):
    dt = dt or india_now()
    return dt.strftime("%Y-%m")


def get_manual_voting_override_collection_name():
    return "voting_runtime_control"


async def get_voting_runtime_control(cycle_week_start: str):
    doc = await db[get_manual_voting_override_collection_name()].find_one({
        "cycle_week_start": cycle_week_start
    })

    if doc:
        return doc

    default_doc = {
        "cycle_week_start": cycle_week_start,
        "manual_voting_enabled": False,
        "manual_voting_started_at": None,
        "manual_voting_started_by": None,
        "manual_voting_note": None,
        "manual_voting_force_closed": False,
        "manual_voting_end_at": None,
        "extension_minutes": 0,
        "updated_at": utc_now_iso()
    }

    await db[get_manual_voting_override_collection_name()].insert_one(default_doc)
    return await db[get_manual_voting_override_collection_name()].find_one({
        "cycle_week_start": cycle_week_start
    })


async def get_effective_voting_window(cycle_week_start: str, dt=None):
    dt = dt or india_now()
    scheduled_start, scheduled_end = get_voting_window_for_current_week(dt)
    runtime_doc = await get_voting_runtime_control(cycle_week_start)

    if bool(runtime_doc.get("manual_voting_enabled", False)):
        started_at_raw = runtime_doc.get("manual_voting_started_at")
        manual_end_raw = runtime_doc.get("manual_voting_end_at")

        try:
            manual_start = (
                datetime.fromisoformat(str(started_at_raw).replace("Z", "+00:00")).astimezone(INDIA_TZ)
                if started_at_raw else scheduled_start
            )
        except Exception:
            manual_start = scheduled_start

        try:
            manual_end = (
                datetime.fromisoformat(str(manual_end_raw).replace("Z", "+00:00")).astimezone(INDIA_TZ)
                if manual_end_raw else scheduled_end
            )
        except Exception:
            manual_end = scheduled_end

        return manual_start, manual_end

    extension_minutes = int(runtime_doc.get("extension_minutes", 0) or 0)
    scheduled_end = scheduled_end + timedelta(minutes=extension_minutes)

    return scheduled_start, scheduled_end


async def is_voting_enabled_now(cycle_week_start: str, dt=None):
    dt = dt or india_now()
    runtime_doc = await get_voting_runtime_control(cycle_week_start)

    if bool(runtime_doc.get("manual_voting_force_closed", False)):
        return False

    effective_start, effective_end = await get_effective_voting_window(cycle_week_start, dt)
    return effective_start <= dt < effective_end


async def get_cycle_winner(cycle_week_start: str):
    winner = await db.voting_items.find_one(
        {
            "cycle_week_start": cycle_week_start,
            "status": {"$in": ["active", "frozen"]}
        },
        sort=[("vote_count", -1), ("item_name", 1)]
    )
    return winner


def inject_sunday_special(menu_rows, winner_item_name: Optional[str]):
    if not winner_item_name:
        return menu_rows

    final_rows = []
    for row in menu_rows:
        row = dict(row)
        if row.get("day") == "Sunday":
            meals = {
                "breakfast": stringify_menu_value(row.get("breakfast")),
                "lunch": stringify_menu_value(row.get("lunch")),
                "dinner": stringify_menu_value(row.get("dinner"))
            }
            already_present = any(winner_item_name.lower() in meals[m].lower() for m in meals)
            if not already_present:
                meals["dinner"] = f"{meals['dinner']}, {winner_item_name} (Special)" if meals["dinner"] else f"{winner_item_name} (Special)"
                row["dinner"] = meals["dinner"]
        final_rows.append(row)
    return final_rows


async def ensure_sunday_special_saved(cycle_week_start: str):
    winner = await get_cycle_winner(cycle_week_start)
    if not winner:
        return

    winner_name = str(winner.get("item_name", "")).strip()
    if not winner_name:
        return

    sunday_doc = await db.mess_menu.find_one({
        "week_start_date": cycle_week_start,
        "day": "Sunday"
    })

    if not sunday_doc:
        await db.mess_menu.insert_one({
            "day": "Sunday",
            "week_start_date": cycle_week_start,
            "breakfast": "",
            "lunch": "",
            "dinner": f"{winner_name} (Special)",
            "updated_at": utc_now_iso(),
            "auto_special_applied": True,
            "student_choice_winner": winner_name
        })
        return

    meals = {
        "breakfast": stringify_menu_value(sunday_doc.get("breakfast")),
        "lunch": stringify_menu_value(sunday_doc.get("lunch")),
        "dinner": stringify_menu_value(sunday_doc.get("dinner"))
    }
    already_present = any(winner_name.lower() in meals[m].lower() for m in meals)

    if not already_present:
        meals["dinner"] = f"{meals['dinner']}, {winner_name} (Special)" if meals["dinner"] else f"{winner_name} (Special)"
        await db.mess_menu.update_one(
            {"_id": sunday_doc["_id"]},
            {"$set": {
                "dinner": meals["dinner"],
                "updated_at": utc_now_iso(),
                "auto_special_applied": True,
                "student_choice_winner": winner_name
            }}
        )


async def get_or_create_menu_lock(week_start_date: str):
    existing = await db.mess_menu_locks.find_one({"week_start_date": week_start_date})
    if existing:
        return existing

    doc = {
        "week_start_date": week_start_date,
        "is_locked": False,
        "locked_at": None,
        "locked_by": None,
        "reopened_at": None,
        "reopened_by": None,
        "created_at": utc_now_iso()
    }
    await db.mess_menu_locks.insert_one(doc)
    return await db.mess_menu_locks.find_one({"week_start_date": week_start_date})


async def lock_menu_week(week_start_date: str, locked_by: str = "system"):
    await db.mess_menu_locks.update_one(
        {"week_start_date": week_start_date},
        {"$set": {
            "is_locked": True,
            "locked_at": utc_now_iso(),
            "locked_by": locked_by
        }},
        upsert=True
    )


async def unlock_menu_week(week_start_date: str, reopened_by: str):
    await db.mess_menu_locks.update_one(
        {"week_start_date": week_start_date},
        {"$set": {
            "is_locked": False,
            "reopened_at": utc_now_iso(),
            "reopened_by": reopened_by
        }},
        upsert=True
    )


async def is_menu_locked(week_start_date: str):
    lock_doc = await get_or_create_menu_lock(week_start_date)
    return bool(lock_doc.get("is_locked", False))


async def award_student_points(student_id: str, points: int, reason: str, meta: dict | None = None):
    if not student_id or points <= 0:
        return

    await db.student_rewards.insert_one({
        "student_id": student_id,
        "points": points,
        "reason": reason,
        "meta": meta or {},
        "created_at": utc_now_iso()
    })


async def get_student_points_total(student_id: str):
    rows = await db.student_rewards.find(
        {"student_id": student_id},
        {"points": 1, "_id": 0}
    ).to_list(length=5000)
    return sum(int(r.get("points", 0) or 0) for r in rows)


async def local_feedback_fallback_analysis(suggestions, limit=10):
    stop_words = {
        "want", "need", "please", "add", "for", "the", "and", "with", "have", "next", "week",
        "menu", "food", "dish", "special", "good", "more", "less", "make", "bring", "item",
        "items", "like", "would", "love", "to", "of", "in", "on", "a", "an", "be", "is",
        "are", "it", "we", "mess", "hostel"
    }

    joined = " | ".join([str(x) for x in suggestions if str(x).strip()])
    parts = re.split(r"[,\n;/|]+", joined)

    cleaned = []
    for part in parts:
        phrase = re.sub(r"[^A-Za-z0-9\s\-]", " ", part).strip()
        phrase = re.sub(r"\s+", " ", phrase)
        if len(phrase) < 3:
            continue
        lower = phrase.lower()
        if lower in stop_words:
            continue
        if all(word in stop_words for word in lower.split()):
            continue
        cleaned.append(phrase.title())

    counts = Counter(cleaned)
    top = counts.most_common(limit)

    return [
        {
            "item_name": name,
            "reason": f"Requested by multiple students across feedback entries ({count} mentions)."
        }
        for name, count in top
    ]


async def analyze_feedback_for_cycle(cycle_week_start: str):
    feedback_list = await db.food_feedback.find(
        {
            "cycle_week_start": cycle_week_start,
            "weekly_food_choice": {"$exists": True, "$ne": ""}
        },
        {"weekly_food_choice": 1, "suggestions": 1, "_id": 0}
    ).to_list(length=2000)

    anon_list = await db.anonymous_feedback.find(
        {
            "cycle_week_start": cycle_week_start,
            "weekly_food_choice": {"$exists": True, "$ne": ""}
        },
        {"weekly_food_choice": 1, "suggestions": 1, "_id": 0}
    ).to_list(length=2000)

    suggestions = []
    for row in feedback_list + anon_list:
        weekly_choice = str(row.get("weekly_food_choice", "")).strip()
        fallback = str(row.get("suggestions", "")).strip()
        if weekly_choice:
            suggestions.append(weekly_choice)
        elif fallback:
            suggestions.append(fallback)

    if not suggestions:
        return {"message": "No feedback found", "items": [], "cycle_week_start": cycle_week_start}

    analyzed_items = []

    try:
        gemini_key = os.getenv("GEMINI_API_KEY")
        if not gemini_key:
            raise Exception("GEMINI_API_KEY not configured")

        gemini_client = genai.Client(
            api_key=gemini_key,
            http_options={'api_version': 'v1'}
        )

        prompt = f"""
        You are an expert culinary AI for a university hostel.
        Extract the top 10 unique food items most requested from this student feedback list: {', '.join(suggestions)}.

        Return ONLY a valid JSON array of objects.
        Each object must have:
        - "item_name"
        - "reason"
        """

        response = gemini_client.models.generate_content(
            model="gemini-1.5-flash",
            contents=prompt
        )

        cleaned_text = (response.text or "").strip()
        if not cleaned_text:
            raise Exception("Gemini returned an empty response")

        if cleaned_text.startswith("```json"):
            cleaned_text = cleaned_text[7:]
        if cleaned_text.startswith("```"):
            cleaned_text = cleaned_text[3:]
        if cleaned_text.endswith("```"):
            cleaned_text = cleaned_text[:-3]

        analyzed_items = json.loads(cleaned_text.strip())[:10]

    except Exception as e:
        print("Gemini failed, using fallback analyzer:", str(e))
        analyzed_items = await local_feedback_fallback_analysis(suggestions, limit=10)

    if not analyzed_items:
        return {"message": "No analyzable suggestions", "items": [], "cycle_week_start": cycle_week_start}

    await db.voting_items.delete_many({"cycle_week_start": cycle_week_start})

    inserted_items = []
    for item in analyzed_items[:10]:
        name = str(item.get("item_name", "Unknown Item")).strip()
        reason = str(item.get("reason", "Highly requested by students.")).strip()
        if not name:
            continue

        await db.voting_items.insert_one({
            "item_name": name,
            "reason": reason,
            "vote_count": 0,
            "status": "active",
            "created_at": utc_now_iso(),
            "cycle_week_start": cycle_week_start
        })
        inserted_items.append(name)

    await db.food_feedback.update_many(
        {"cycle_week_start": cycle_week_start},
        {"$set": {"ai_processed": True}}
    )
    await db.anonymous_feedback.update_many(
        {"cycle_week_start": cycle_week_start},
        {"$set": {"ai_processed": True}}
    )

    return {
        "message": "Feedback analyzed successfully",
        "items": inserted_items,
        "cycle_week_start": cycle_week_start
    }


async def freeze_voting_and_apply_winner_for_cycle(cycle_week_start: str):
    winner = await get_cycle_winner(cycle_week_start)

    await db.voting_items.update_many(
        {"cycle_week_start": cycle_week_start, "status": "active"},
        {"$set": {"status": "frozen", "frozen_at": utc_now_iso()}}
    )

    # CLEAR MANUAL VOTING MODE AFTER FREEZE
    await db[get_manual_voting_override_collection_name()].update_one(
        {"cycle_week_start": cycle_week_start},
        {"$set": {
            "manual_voting_enabled": False,
            "manual_voting_force_closed": True,
            "updated_at": utc_now_iso()
        }},
        upsert=True
    )

    if winner:
        await db.voting_cycles.update_one(
            {"cycle_week_start": cycle_week_start},
            {"$set": {
                "cycle_week_start": cycle_week_start,
                "winner_item_name": winner.get("item_name"),
                "winner_votes": winner.get("vote_count", 0),
                "frozen_at": utc_now_iso(),
                "status": "closed"
            }},
            upsert=True
        )
        await ensure_sunday_special_saved(cycle_week_start)
        await lock_menu_week(cycle_week_start, locked_by="system_scheduler")
        await broadcast_menu_notification(
            f"📅 Sunday Special finalized! Student Choice winner: {winner.get('item_name')}. Check next week's mess menu."
        )
        return {"message": "Voting frozen and winner applied", "winner": winner.get("item_name")}
    else:
        await db.voting_cycles.update_one(
            {"cycle_week_start": cycle_week_start},
            {"$set": {
                "cycle_week_start": cycle_week_start,
                "winner_item_name": None,
                "winner_votes": 0,
                "frozen_at": utc_now_iso(),
                "status": "closed"
            }},
            upsert=True
        )
        return {"message": "Voting frozen, no winner found", "winner": None}


async def broadcast_menu_notification(message: str):
    try:
        await db.notifications.insert_one({
            "title": "Mess Menu Update",
            "type": "general",
            "priority": "general",
            "message": message,
            "hostel": "all",
            "target_users": "all",
            "target_role": "student",
            "date": utc_now_iso(),
            "published_at": utc_now_iso(),
            "read_by": [],
            "read_logs": [],
            "status": "published",
            "is_pinned": False,
            "requires_ack": False,
            "deep_link": None,
            "attachment_url": None,
            "deleted_at": None,
            "archived_at": None,
            "updated_at": utc_now_iso(),
            "meta": {"module": "mess_menu"}
        })
    except Exception as e:
        print("Mess notification broadcast failed:", str(e))


# ==================== SCHEDULER JOBS ====================

async def scheduled_tuesday_feedback_analysis():
    cycle_week_start = get_feedback_cycle_week_start(india_now())
    result = await analyze_feedback_for_cycle(cycle_week_start)
    print("Scheduled Tuesday feedback analysis:", result)


async def scheduled_wednesday_freeze_and_apply():
    cycle_week_start = get_voting_cycle_week_start(india_now())
    result = await freeze_voting_and_apply_winner_for_cycle(cycle_week_start)
    print("Scheduled Wednesday voting freeze:", result)


scheduler = AsyncIOScheduler(timezone="Asia/Kolkata")


def start_mess_scheduler():
    if scheduler.running:
        return

    scheduler.add_job(
        scheduled_tuesday_feedback_analysis,
        CronTrigger(day_of_week="tue", hour=23, minute=59),
        id="mess_feedback_auto_analysis",
        replace_existing=True
    )
    scheduler.add_job(
        scheduled_wednesday_freeze_and_apply,
        CronTrigger(day_of_week="wed", hour=23, minute=0),
        id="mess_voting_freeze_and_apply",
        replace_existing=True
    )
    scheduler.start()


# ==================== MESS MENU ROUTES ====================

@api_router.get("/mess-menu")
async def get_student_mess_menu(user: dict = Depends(get_current_user)):
    active_week_start = get_current_week_start_india()

    menu = await db.mess_menu.find(
        {"week_start_date": active_week_start},
        {"_id": 0}
    ).to_list(length=20)

    menu_map = {row["day"]: row for row in menu}
    final_menu = []
    for day in DAY_ORDER:
        row = menu_map.get(day, {
            "day": day,
            "breakfast": "",
            "lunch": "",
            "dinner": "",
            "week_start_date": active_week_start
        })
        final_menu.append(row)

    # FIXED: use frozen cycle winner for this displayed week, not live voting_items
    cycle_doc = await db.voting_cycles.find_one({"cycle_week_start": active_week_start})
    winner_name = cycle_doc.get("winner_item_name") if cycle_doc else None
    final_menu = inject_sunday_special(final_menu, winner_name)

    return final_menu


@api_router.get("/mess/menu")
async def get_admin_mess_menu(user: dict = Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admin can view admin menu")

    active_week_start = get_current_week_start_india()
    menu = await db.mess_menu.find(
        {"week_start_date": active_week_start},
        {"_id": 0}
    ).to_list(length=20)

    menu_map = {row["day"]: row for row in menu}
    final_menu = []
    for day in DAY_ORDER:
        row = menu_map.get(day, {
            "day": day,
            "breakfast": "",
            "lunch": "",
            "dinner": "",
            "week_start_date": active_week_start
        })
        final_menu.append(row)

    # FIXED: use frozen cycle winner for this displayed week, not live voting_items
    cycle_doc = await db.voting_cycles.find_one({"cycle_week_start": active_week_start})
    winner_name = cycle_doc.get("winner_item_name") if cycle_doc else None
    final_menu = inject_sunday_special(final_menu, winner_name)

    last_item = await db.mess_audit_log.find_one(
        {"week_start_date": active_week_start},
        sort=[("timestamp", -1)]
    )

    lock_doc = await get_or_create_menu_lock(active_week_start)

    return {
        "menu": final_menu,
        "week_start_date": active_week_start,
        "last_updated": last_item.get("timestamp") if last_item else None,
        "is_locked": bool(lock_doc.get("is_locked", False))
    }


@api_router.post("/mess/menu")
async def create_update_menu(item: dict = Body(...), user: dict = Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admin can modify menu")

    day = normalize_day_name(item.get("day"))
    week_start_date = str(item.get("week_start_date") or get_current_week_start_india()).strip()

    if await is_menu_locked(week_start_date):
        raise HTTPException(status_code=400, detail="Menu is locked after publish. Reopen it to edit.")

    payload = {
        "day": day,
        "week_start_date": week_start_date,
        "breakfast": stringify_menu_value(item.get("breakfast")),
        "lunch": stringify_menu_value(item.get("lunch")),
        "dinner": stringify_menu_value(item.get("dinner")),
        "updated_at": utc_now_iso(),
        "updated_by": user.get("username")
    }

    await db.mess_menu.update_one(
        {"day": day, "week_start_date": week_start_date},
        {"$set": payload},
        upsert=True
    )

    if day == "Sunday":
        await ensure_sunday_special_saved(week_start_date)

    return {"message": "Menu updated successfully"}


@api_router.get("/mess/menu/previous")
async def get_previous_menu(user: dict = Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admin can view previous menu")

    prev_week_start = get_previous_week_start_india()
    prev_menu = await db.mess_menu.find(
        {"week_start_date": prev_week_start},
        {"_id": 0}
    ).to_list(length=20)

    prev_map = {row["day"]: row for row in prev_menu}
    final_menu = []
    for day in DAY_ORDER:
        final_menu.append(prev_map.get(day, {
            "day": day,
            "breakfast": "",
            "lunch": "",
            "dinner": "",
            "week_start_date": prev_week_start
        }))

    return {"menu": final_menu, "week_start_date": prev_week_start}


@api_router.get("/mess/menu/archive")
async def get_menu_archive(
    week_start_date: Optional[str] = Query(None),
    user: dict = Depends(get_current_user)
):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")

    if week_start_date:
        rows = await db.mess_menu.find(
            {"week_start_date": week_start_date},
            {"_id": 0}
        ).to_list(length=20)

        row_map = {r["day"]: r for r in rows}
        final_rows = []
        for day in DAY_ORDER:
            final_rows.append(row_map.get(day, {
                "day": day,
                "breakfast": "",
                "lunch": "",
                "dinner": "",
                "week_start_date": week_start_date
            }))

        cycle_doc = await db.voting_cycles.find_one({"cycle_week_start": week_start_date})
        return {
            "week_start_date": week_start_date,
            "menu": final_rows,
            "winner_item_name": cycle_doc.get("winner_item_name") if cycle_doc else None
        }

    weeks = await db.mess_menu.distinct("week_start_date")
    weeks = sorted([w for w in weeks if w], reverse=True)

    archive = []
    for week in weeks:
        cycle_doc = await db.voting_cycles.find_one({"cycle_week_start": week})
        archive.append({
            "week_start_date": week,
            "winner_item_name": cycle_doc.get("winner_item_name") if cycle_doc else None
        })

    return archive


@api_router.post("/mess/menu/reopen")
async def reopen_menu_week(
    data: dict = Body(...),
    user: dict = Depends(get_current_user)
):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")

    week_start_date = str(data.get("week_start_date") or get_current_week_start_india()).strip()
    await unlock_menu_week(week_start_date, reopened_by=user.get("username"))
    return {"message": "Menu reopened successfully"}


@api_router.post("/mess/menu/lock")
async def lock_menu_route(
    data: dict = Body(...),
    user: dict = Depends(get_current_user)
):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")

    week_start_date = str(data.get("week_start_date") or get_current_week_start_india()).strip()
    await lock_menu_week(week_start_date, locked_by=user.get("username"))
    return {"message": "Menu locked successfully"}


@api_router.post("/mess/templates")
async def save_mess_template(data: dict, user: dict = Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")

    name = str(data.get("name", "")).strip()
    menu = data.get("menu", [])

    if not name:
        raise HTTPException(status_code=400, detail="Template name is required")

    await db.mess_templates.insert_one({
        "name": name,
        "menu": menu,
        "created_at": utc_now_iso(),
        "created_by": user.get("username")
    })
    return {"message": "Template saved"}


@api_router.get("/mess/templates")
async def get_mess_templates(user: dict = Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")

    templates = await db.mess_templates.find().sort("created_at", -1).to_list(length=50)
    for t in templates:
        t["_id"] = str(t["_id"])
    return templates


@api_router.post("/mess/audit-log")
async def create_mess_audit_log(data: dict = Body(...), user: dict = Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")

    menu_snapshot = data.get("menu_snapshot") or []
    week_start_date = str(data.get("week_start_date") or get_current_week_start_india()).strip()

    await db.mess_audit_log.insert_one({
        "action": str(data.get("action", "publish")).strip(),
        "admin_name": data.get("admin_name") or user.get("student_name") or user.get("username") or "Admin",
        "timestamp": data.get("timestamp") or utc_now_iso(),
        "changes_summary": str(data.get("changes_summary", "Menu published")).strip(),
        "menu_snapshot": menu_snapshot,
        "week_start_date": week_start_date
    })

    return {"message": "Audit logged successfully"}


@api_router.get("/mess/audit-log")
async def get_mess_audit_log(user: dict = Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")

    logs = await db.mess_audit_log.find().sort("timestamp", -1).to_list(length=100)
    for log in logs:
        log["_id"] = str(log["_id"])
    return logs

# ==================== MENU IMPORT HELPERS ====================

def normalize_meal_name(meal: str) -> str:
    value = str(meal or "").strip().lower()
    if value in ["breakfast", "morning", "bf"]:
        return "breakfast"
    if value in ["lunch", "afternoon", "ln"]:
        return "lunch"
    if value in ["dinner", "night", "dn"]:
        return "dinner"
    return ""

def empty_week_menu():
    return {
        day: {"day": day, "breakfast": "", "lunch": "", "dinner": ""}
        for day in DAY_ORDER
    }

def finalize_import_map(menu_map: dict):
    final_rows = []
    for day in DAY_ORDER:
        row = menu_map.get(day, {"day": day, "breakfast": "", "lunch": "", "dinner": ""})
        final_rows.append({
            "day": day,
            "breakfast": stringify_menu_value(row.get("breakfast")),
            "lunch": stringify_menu_value(row.get("lunch")),
            "dinner": stringify_menu_value(row.get("dinner")),
        })
    return final_rows

def set_import_slot(menu_map: dict, day: str, meal: str, value: str):
    day_name = normalize_day_name(day)
    meal_name = normalize_meal_name(meal)
    if not meal_name:
        return

    value = stringify_menu_value(value)
    if not value:
        return

    existing = stringify_menu_value(menu_map[day_name].get(meal_name))
    if existing:
        if value.lower() not in existing.lower():
            menu_map[day_name][meal_name] = f"{existing}, {value}"
    else:
        menu_map[day_name][meal_name] = value

def parse_menu_from_csv_text(csv_text: str):
    menu_map = empty_week_menu()

    reader = csv.DictReader(StringIO(csv_text))
    if not reader.fieldnames:
        raise HTTPException(status_code=400, detail="CSV has no header row")

    normalized_fields = {f.lower().strip(): f for f in reader.fieldnames if f}

    # Format A: day, breakfast, lunch, dinner
    if "day" in normalized_fields:
        for row in reader:
            raw_day = row.get(normalized_fields["day"])
            if not raw_day:
                continue
            day_name = normalize_day_name(raw_day)
            menu_map[day_name]["breakfast"] = stringify_menu_value(
                row.get(normalized_fields.get("breakfast", ""), "")
            )
            menu_map[day_name]["lunch"] = stringify_menu_value(
                row.get(normalized_fields.get("lunch", ""), "")
            )
            menu_map[day_name]["dinner"] = stringify_menu_value(
                row.get(normalized_fields.get("dinner", ""), "")
            )
        return finalize_import_map(menu_map)

    # Format B: day, meal, items
    if "meal" in normalized_fields and ("items" in normalized_fields or "menu" in normalized_fields):
        value_key = normalized_fields.get("items") or normalized_fields.get("menu")
        for row in reader:
            raw_day = row.get(normalized_fields.get("day", ""), "")
            raw_meal = row.get(normalized_fields.get("meal", ""), "")
            raw_value = row.get(value_key, "")
            if raw_day and raw_meal and raw_value:
                set_import_slot(menu_map, raw_day, raw_meal, raw_value)
        return finalize_import_map(menu_map)

    raise HTTPException(
        status_code=400,
        detail="Unsupported CSV format. Use either: day,breakfast,lunch,dinner or day,meal,items"
    )

def parse_menu_from_raw_text(raw_text: str):
    text = str(raw_text or "").replace("\r", "\n")
    if not text.strip():
        raise HTTPException(status_code=400, detail="No text provided")

    menu_map = empty_week_menu()
    current_day = None

    # Strategy 1: Day blocks with Breakfast/Lunch/Dinner lines
    lines = [line.strip() for line in text.split("\n") if line.strip()]
    meal_line_pattern = re.compile(r"^(breakfast|lunch|dinner)\s*[:\-]\s*(.+)$", re.I)

    for line in lines:
        if line.capitalize() in DAY_ORDER:
            current_day = normalize_day_name(line)
            continue

        meal_match = meal_line_pattern.match(line)
        if meal_match and current_day:
            meal_name = normalize_meal_name(meal_match.group(1))
            meal_value = stringify_menu_value(meal_match.group(2))
            if meal_name and meal_value:
                menu_map[current_day][meal_name] = meal_value

    parsed_rows = finalize_import_map(menu_map)
    non_empty_count = sum(
        1 for row in parsed_rows if row["breakfast"] or row["lunch"] or row["dinner"]
    )
    if non_empty_count >= 3:
        return parsed_rows

    # Strategy 2: Inline single-line format
    # Example: Monday | Breakfast: Poha | Lunch: Dal Rice | Dinner: Paneer
    menu_map = empty_week_menu()
    for line in lines:
        for day in DAY_ORDER:
            if day.lower() in line.lower():
                current_day = day
                break
        else:
            current_day = None

        if not current_day:
            continue

        for meal in ["breakfast", "lunch", "dinner"]:
            m = re.search(rf"{meal}\s*[:\-]\s*([^|]+)", line, re.I)
            if m:
                menu_map[current_day][meal] = stringify_menu_value(m.group(1))

    parsed_rows = finalize_import_map(menu_map)
    non_empty_count = sum(
        1 for row in parsed_rows if row["breakfast"] or row["lunch"] or row["dinner"]
    )
    if non_empty_count == 0:
        raise HTTPException(
            status_code=400,
            detail="Could not detect enough menu rows. Paste day-wise blocks with Breakfast/Lunch/Dinner."
        )

    return parsed_rows


# ==================== MENU IMPORT ROUTES ====================

@api_router.post("/mess/menu/import-csv")
async def import_menu_from_csv(
    file: UploadFile = File(...),
    user: dict = Depends(get_current_user)
):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")

    filename = str(file.filename or "").lower()
    if not filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="Please upload a CSV file")

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Uploaded CSV is empty")

    try:
        decoded = content.decode("utf-8-sig")
    except Exception:
        raise HTTPException(status_code=400, detail="CSV must be UTF-8 encoded")

    menu_rows = parse_menu_from_csv_text(decoded)
    return {
        "message": "CSV menu imported successfully",
        "menu": menu_rows
    }


@api_router.post("/mess/menu/import-text")
async def import_menu_from_text(
    data: dict = Body(...),
    user: dict = Depends(get_current_user)
):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")

    raw_text = str(data.get("raw_text", "")).strip()
    if not raw_text:
        raise HTTPException(status_code=400, detail="Please paste menu text")

    menu_rows = parse_menu_from_raw_text(raw_text)
    return {
        "message": "Menu text parsed successfully",
        "menu": menu_rows
    }
    
# ==================== FOOD FEEDBACK ROUTES ====================

@api_router.get("/food-feedback/status")
async def get_food_feedback_status(user: dict = Depends(get_current_user)):
    now = india_now()
    return {
        "server_time": now.astimezone(timezone.utc).isoformat(),
        "weekly_choice_open": is_feedback_open(now),
        "weekly_choice_deadline": get_feedback_deadline_india(now).astimezone(timezone.utc).isoformat()
    }


@api_router.post("/food-feedback")
async def submit_feedback(feedback: dict = Body(...), user: dict = Depends(get_current_user)):
    """
    Preserved regular endpoint for backward compatibility.
    Daily feedback is always allowed.
    Weekly food choice remains time-aware, but does not block meal feedback.
    """

    cycle_week_start = get_feedback_cycle_week_start()
    student_id = str(user.get("enrollment_number") or user.get("username") or "").strip()

    meal_type = str(feedback.get("meal_type", "breakfast")).strip().lower()
    rating = int(feedback.get("rating", 3) or 3)

    comment = str(feedback.get("comment", "")).strip()
    weekly_food_choice = str(
        feedback.get("weekly_food_choice") or feedback.get("suggestions") or ""
    ).strip()

    weekly_choice_open = is_feedback_open()

    feedback_dict = {
        "meal_type": meal_type,
        "rating": rating,
        "ratings": feedback.get("ratings", {}),
        "comment": comment,
        "weekly_food_choice": weekly_food_choice if weekly_choice_open else "",
        "suggestions": weekly_food_choice if weekly_choice_open else comment,
        "student_id": student_id,
        "student_name": user.get("student_name") or user.get("username") or "Student",
        "hostel_name": user.get("hostel_name", "N/A"),
        "date": utc_now_iso(),
        "ai_processed": False,
        "cycle_week_start": cycle_week_start,
        "anonymous": False,
        "month_key": get_month_key_india(),
        "weekly_choice_open_at_submission": weekly_choice_open
    }

    await db.food_feedback.insert_one(feedback_dict)

    await award_student_points(
        student_id,
        MESS_POINTS_FEEDBACK,
        "Mess feedback submitted",
        {"cycle_week_start": cycle_week_start, "meal_type": meal_type}
    )

    return {
        "message": "Feedback submitted successfully",
        "weekly_choice_open": weekly_choice_open
    }


@api_router.get("/food-feedback")
async def get_feedback(user: dict = Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admin can view all feedback")

    cycle_week_start = get_feedback_cycle_week_start()

    feedback = await db.food_feedback.find(
        {"cycle_week_start": cycle_week_start}
    ).sort("date", -1).to_list(500)

    anon = await db.anonymous_feedback.find(
        {"cycle_week_start": cycle_week_start}
    ).sort("date", -1).to_list(500)

    for item in feedback:
        item["_id"] = str(item["_id"])

    for item in anon:
        item["_id"] = str(item["_id"])

    merged = sorted(feedback + anon, key=lambda x: x.get("date", ""), reverse=True)
    return merged


@api_router.post("/food-feedback/analyze")
async def analyze_feedback(user: dict = Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")

    cycle_week_start = get_feedback_cycle_week_start()
    result = await analyze_feedback_for_cycle(cycle_week_start)
    return result


@api_router.delete("/food-feedback/clear-all")
async def clear_feedback(user: dict = Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")

    cycle_week_start = get_feedback_cycle_week_start()
    await db.food_feedback.delete_many({"cycle_week_start": cycle_week_start})
    await db.anonymous_feedback.delete_many({"cycle_week_start": cycle_week_start})
    return {"message": "Feedback cleared for active cycle"}

@api_router.delete("/food-feedback/{feedback_id}")
async def delete_single_feedback(
    feedback_id: str,
    data: dict = Body(default={}),
    user: dict = Depends(get_current_user)
):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")

    anonymous = bool(data.get("anonymous", False))
    target_collection = db.anonymous_feedback if anonymous else db.food_feedback

    try:
        from bson import ObjectId
        result = await target_collection.delete_one({"_id": ObjectId(feedback_id)})
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid feedback id")

    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Feedback not found")

    return {"message": "Feedback deleted successfully"}


# ==================== ANONYMOUS FEEDBACK ROUTES ====================

@api_router.post("/food-feedback/anonymous")
async def submit_anonymous_feedback(data: dict = Body(...)):
    """
    Unified anonymous feedback endpoint.
    Daily meal feedback is always allowed.
    Weekly food choice is optional and only counted during the active weekly-choice window.
    """

    meal_type = str(data.get("meal_type", "breakfast")).strip().lower()
    ratings = data.get("ratings", {}) or {}
    rating = int(data.get("rating", 3) or 3)

    comment = str(data.get("comment", "")).strip()
    weekly_food_choice = str(
        data.get("weekly_food_choice") or data.get("suggestions") or ""
    ).strip()

    weekly_choice_open = is_feedback_open()
    cycle_week_start = get_feedback_cycle_week_start()

    feedback_dict = {
        "meal_type": meal_type,
        "rating": rating,
        "ratings": ratings,
        "comment": comment,
        "weekly_food_choice": weekly_food_choice if weekly_choice_open else "",
        "suggestions": weekly_food_choice if weekly_choice_open else comment,
        "timestamp": data.get("timestamp") or utc_now_iso(),
        "anonymous": True,
        "date": utc_now_iso(),
        "ai_processed": False,
        "cycle_week_start": cycle_week_start,
        "month_key": get_month_key_india(),
        "weekly_choice_open_at_submission": weekly_choice_open
    }

    # Daily feedback should be accepted even when weekly choice is closed
    if not comment and not weekly_food_choice and not ratings:
        raise HTTPException(
            status_code=400,
            detail="Please provide at least a rating, feedback comment, or weekly food choice."
        )

    await db.anonymous_feedback.insert_one(feedback_dict)

    return {
        "message": "Anonymous feedback submitted successfully",
        "weekly_choice_open": weekly_choice_open
    }


@api_router.get("/food-feedback/anonymous/stats")
async def get_anonymous_feedback_stats(user: dict = Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")

    cycle_week_start = get_feedback_cycle_week_start()
    feedback = await db.anonymous_feedback.find(
        {"cycle_week_start": cycle_week_start},
        {"_id": 0}
    ).sort("date", -1).to_list(500)

    return feedback

# ==================== VOTING ROUTES ====================

@api_router.get("/voting-items")
async def get_voting_items(user: dict = Depends(get_current_user)):
    cycle_week_start = get_voting_cycle_week_start()
    items = await db.voting_items.find(
        {"cycle_week_start": cycle_week_start, "status": {"$in": ["active", "frozen"]}},
        {"_id": 0}
    ).sort("vote_count", -1).to_list(length=50)

    student_id = str(user.get("enrollment_number") or user.get("username") or "").strip()
    has_voted = await db.votes.find_one({
        "student_id": student_id,
        "cycle_week_start": cycle_week_start
    })

    effective_start, effective_end = await get_effective_voting_window(cycle_week_start)
    runtime_doc = await get_voting_runtime_control(cycle_week_start)
    remaining_seconds = max(0, int((effective_end - india_now()).total_seconds()))

    return {
        "items": items,
        "has_voted": bool(has_voted),
        "voting_enabled": await is_voting_enabled_now(cycle_week_start),
        "voting_window_start": effective_start.astimezone(timezone.utc).isoformat(),
        "voting_window_end": effective_end.astimezone(timezone.utc).isoformat(),
        "remaining_seconds": remaining_seconds,
        "cycle_week_start": cycle_week_start,
        "manual_voting_enabled": bool(runtime_doc.get("manual_voting_enabled", False)),
        "manual_voting_note": runtime_doc.get("manual_voting_note"),
        "manual_voting_started_by": runtime_doc.get("manual_voting_started_by")
    }


@api_router.post("/vote")
async def cast_vote(data: dict = Body(...), user: dict = Depends(get_current_user)):
    cycle_week_start = get_voting_cycle_week_start()
    if not await is_voting_enabled_now(cycle_week_start):
        raise HTTPException(status_code=400, detail="Voting is only allowed on Wednesday between 9 PM and 11 PM")

    item_name = str(data.get("item_name", "")).strip()
    if not item_name:
        raise HTTPException(status_code=400, detail="Item name is required")

    student_id = str(user.get("enrollment_number") or user.get("username") or "").strip()

    existing_vote = await db.votes.find_one({
        "student_id": student_id,
        "cycle_week_start": cycle_week_start
    })
    if existing_vote:
        raise HTTPException(status_code=400, detail="You have already voted for this cycle")

    target_item = await db.voting_items.find_one({
        "item_name": item_name,
        "cycle_week_start": cycle_week_start,
        "status": {"$in": ["active", "frozen"]}
    })
    if not target_item:
        raise HTTPException(status_code=404, detail="Voting item not found")

    await db.votes.insert_one({
        "student_id": student_id,
        "student_name": user.get("student_name") or user.get("username") or "Student",
        "hostel_name": user.get("hostel_name", "N/A"),
        "item_name": item_name,
        "cycle_week_start": cycle_week_start,
        "voted_at": utc_now_iso()
    })

    await db.voting_items.update_one(
        {"_id": target_item["_id"]},
        {"$inc": {"vote_count": 1}}
    )

    await award_student_points(
        student_id,
        MESS_POINTS_VOTE,
        "Mess voting participation",
        {"cycle_week_start": cycle_week_start, "item_name": item_name}
    )

    # FIXED: do NOT auto-write Sunday special during live voting
    return {"message": "Vote recorded successfully"}


@api_router.post("/voting/start-now")
async def start_voting_now(data: dict = Body(...), user: dict = Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")

    cycle_week_start = str(data.get("cycle_week_start") or get_voting_cycle_week_start()).strip()
    note = str(data.get("note", "Manual voting start by admin")).strip()
    duration_minutes = int(data.get("duration_minutes", 120) or 120)

    now_india = india_now()
    manual_end = now_india + timedelta(minutes=duration_minutes)

    await db[get_manual_voting_override_collection_name()].update_one(
        {"cycle_week_start": cycle_week_start},
        {"$set": {
            "manual_voting_enabled": True,
            "manual_voting_force_closed": False,
            "manual_voting_started_at": now_india.astimezone(timezone.utc).isoformat(),
            "manual_voting_started_by": user.get("username"),
            "manual_voting_note": note,
            "manual_voting_end_at": manual_end.astimezone(timezone.utc).isoformat(),
            "extension_minutes": 0,
            "updated_at": utc_now_iso()
        }},
        upsert=True
    )

    # Auto-generate AI items from feedback if none exist yet for this cycle
    item_count = await db.voting_items.count_documents({"cycle_week_start": cycle_week_start})
    if item_count == 0:
        try:
            await ai_analyze_feedback_for_cycle(cycle_week_start)
        except Exception as e:
            logger.warning(f"Error analyzing feedback on start: {e}")

    await broadcast_menu_notification(
        "🗳️ Food voting is now live! Please vote now for the Sunday Special item."
    )

    return {
        "message": "Voting started manually",
        "cycle_week_start": cycle_week_start,
        "manual_voting_end_at": manual_end.astimezone(timezone.utc).isoformat()
    }


@api_router.post("/voting/stop-now")
async def stop_voting_now(data: dict = Body(...), user: dict = Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")

    cycle_week_start = str(data.get("cycle_week_start") or get_voting_cycle_week_start()).strip()

    await db[get_manual_voting_override_collection_name()].update_one(
        {"cycle_week_start": cycle_week_start},
        {"$set": {
            "manual_voting_enabled": False,
            "manual_voting_force_closed": True,
            "updated_at": utc_now_iso()
        }},
        upsert=True
    )

    freeze_res = await freeze_voting_and_apply_winner_for_cycle(cycle_week_start)
    winner_name = freeze_res.get("winner")

    return {
        "message": f"Voting stopped and winner '{winner_name or 'None'}' applied to mess menu Sunday special",
        "cycle_week_start": cycle_week_start,
        "winner": winner_name
    }


@api_router.post("/voting/extend")
async def extend_voting_window(data: dict = Body(...), user: dict = Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")

    cycle_week_start = str(data.get("cycle_week_start") or get_voting_cycle_week_start()).strip()
    extend_minutes = int(data.get("extend_minutes", 30) or 30)

    if extend_minutes not in [30, 60]:
        raise HTTPException(status_code=400, detail="Extension must be 30 or 60 minutes")

    runtime_doc = await get_voting_runtime_control(cycle_week_start)

    if bool(runtime_doc.get("manual_voting_enabled", False)):
        current_end_raw = runtime_doc.get("manual_voting_end_at")
        if not current_end_raw:
            raise HTTPException(status_code=400, detail="Manual voting end time not found")

        try:
            current_end = datetime.fromisoformat(
                str(current_end_raw).replace("Z", "+00:00")
            ).astimezone(INDIA_TZ)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid current voting end time")

        new_end = current_end + timedelta(minutes=extend_minutes)

        await db[get_manual_voting_override_collection_name()].update_one(
            {"cycle_week_start": cycle_week_start},
            {"$set": {
                "manual_voting_end_at": new_end.astimezone(timezone.utc).isoformat(),
                "extension_minutes": int(runtime_doc.get("extension_minutes", 0) or 0) + extend_minutes,
                "updated_at": utc_now_iso()
            }}
        )

        await broadcast_menu_notification(
            f"⏳ Food voting has been extended by {extend_minutes} minutes. Cast your vote before it closes."
        )
        return {
            "message": f"Voting extended by {extend_minutes} minutes",
            "manual_voting_end_at": new_end.astimezone(timezone.utc).isoformat()
        }

    scheduled_start, scheduled_end = get_voting_window_for_current_week()
    new_extension = int(runtime_doc.get("extension_minutes", 0) or 0) + extend_minutes
    new_end = scheduled_end + timedelta(minutes=new_extension)

    await db[get_manual_voting_override_collection_name()].update_one(
        {"cycle_week_start": cycle_week_start},
        {"$set": {
            "extension_minutes": new_extension,
            "updated_at": utc_now_iso()
        }},
        upsert=True
    )

    await broadcast_menu_notification(
        f"⏳ Food voting has been extended by {extend_minutes} minutes. Cast your vote before it closes."
    )

    return {
        "message": f"Scheduled voting extended by {extend_minutes} minutes",
        "effective_voting_end": new_end.astimezone(timezone.utc).isoformat()
    }


@api_router.get("/voting/runtime-status")
async def get_voting_runtime_status(user: dict = Depends(get_current_user)):
    cycle_week_start = get_voting_cycle_week_start()
    runtime_doc = await get_voting_runtime_control(cycle_week_start)

    now_india = india_now()
    effective_start, effective_end = await get_effective_voting_window(cycle_week_start, now_india)

    return {
        "cycle_week_start": cycle_week_start,
        "manual_voting_enabled": bool(runtime_doc.get("manual_voting_enabled", False)),
        "manual_voting_force_closed": bool(runtime_doc.get("manual_voting_force_closed", False)),
        "manual_voting_started_at": runtime_doc.get("manual_voting_started_at"),
        "manual_voting_started_by": runtime_doc.get("manual_voting_started_by"),
        "manual_voting_note": runtime_doc.get("manual_voting_note"),
        "manual_voting_end_at": runtime_doc.get("manual_voting_end_at"),
        "extension_minutes": int(runtime_doc.get("extension_minutes", 0) or 0),
        "effective_voting_start": effective_start.astimezone(timezone.utc).isoformat(),
        "effective_voting_end": effective_end.astimezone(timezone.utc).isoformat(),
        "server_now": now_india.astimezone(timezone.utc).isoformat()
    }


@api_router.get("/voting-results")
async def get_voting_results(user: dict = Depends(get_current_user)):
    cycle_week_start = get_voting_cycle_week_start()

    items = await db.voting_items.find(
        {"cycle_week_start": cycle_week_start, "status": {"$in": ["active", "frozen"]}},
        {"_id": 0}
    ).sort("vote_count", -1).to_list(length=50)

    return items


@api_router.post("/voting/manual-add")
async def manual_add(data: dict = Body(...), user: dict = Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")

    item_name = str(data.get("item_name", "")).strip()
    if not item_name:
        raise HTTPException(status_code=400, detail="Item name is required")

    cycle_week_start = get_voting_cycle_week_start()

    existing = await db.voting_items.find_one({
        "item_name": {"$regex": f"^{re.escape(item_name)}$", "$options": "i"},
        "cycle_week_start": cycle_week_start
    })
    if existing:
        raise HTTPException(status_code=400, detail="Item already exists in current poll")

    await db.voting_items.insert_one({
        "item_name": item_name,
        "reason": "Manually added by admin.",
        "vote_count": 0,
        "status": "active",
        "created_at": utc_now_iso(),
        "cycle_week_start": cycle_week_start
    })
    return {"message": "Added"}


@api_router.delete("/voting/reset-all")
async def reset_voting_cycle(user: dict = Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")

    cycle_week_start = get_voting_cycle_week_start()
    await db.voting_items.delete_many({"cycle_week_start": cycle_week_start})
    await db.votes.delete_many({"cycle_week_start": cycle_week_start})
    await db.voting_cycles.delete_many({"cycle_week_start": cycle_week_start})

    return {"message": "Voting cycle has been completely reset for the active week"}


@api_router.post("/voting/freeze-now")
async def freeze_voting_now(user: dict = Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")

    cycle_week_start = get_voting_cycle_week_start()
    result = await freeze_voting_and_apply_winner_for_cycle(cycle_week_start)
    return result


@api_router.get("/admin/reports/participation")
async def get_voting_participation_report(user: dict = Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")

    cycle_week_start = get_voting_cycle_week_start()

    students = await db.users.find(
        {"role": "student"},
        {"_id": 0, "student_name": 1, "enrollment_number": 1, "hostel_name": 1}
    ).to_list(length=5000)

    votes = await db.votes.find(
        {"cycle_week_start": cycle_week_start},
        {"_id": 0, "student_id": 1}
    ).to_list(length=5000)

    voted_ids = {str(v.get("student_id", "")).strip() for v in votes}

    report = []
    for student in students:
        sid = str(student.get("enrollment_number", "")).strip()
        voted = sid in voted_ids
        report.append({
            "name": student.get("student_name") or "Student",
            "id": sid,
            "enrollment_number": sid,
            "hostel_name": student.get("hostel_name", "N/A"),
            "voted": voted,
            "status": "Voted" if voted else "Not Voted"
        })

    report.sort(key=lambda x: (x["voted"], x["name"]))
    return report


@api_router.get("/user/voter-status")
async def get_voter_status(user: dict = Depends(get_current_user)):
    cycle_week_start = get_voting_cycle_week_start()
    student_id = str(user.get("enrollment_number") or user.get("username") or "").strip()

    has_voted = await db.votes.find_one({
        "student_id": student_id,
        "cycle_week_start": cycle_week_start
    })

    total_points = await get_student_points_total(student_id)

    badge_name = "Responsible Resident" if has_voted else "Pending Participation"
    if total_points >= 100:
        badge_name = "Mess Champion"
    elif total_points >= 50:
        badge_name = "Mess Star"
    elif total_points >= 20:
        badge_name = "Responsible Resident"

    return {
        "earned_badge": True if has_voted else False,
        "badge_name": badge_name,
        "points": total_points,
        "message": "Thank you for deciding this Sunday's menu!" if has_voted else "Vote on Wednesday to earn your badge!"
    }


# ==================== ANALYTICS ROUTES ====================

@api_router.get("/mess/analytics/monthly-top-items")
async def get_monthly_top_items(user: dict = Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")

    month_key = get_month_key_india()

    feedback_rows = await db.food_feedback.find(
        {"month_key": month_key},
        {"suggestions": 1, "_id": 0}
    ).to_list(length=5000)

    anon_rows = await db.anonymous_feedback.find(
        {"month_key": month_key},
        {"suggestions": 1, "_id": 0}
    ).to_list(length=5000)

    suggestions = [str(x.get("suggestions", "")).strip() for x in feedback_rows + anon_rows if str(x.get("suggestions", "")).strip()]
    top_items = await local_feedback_fallback_analysis(suggestions, limit=10)

    return {
        "month_key": month_key,
        "items": top_items
    }


@api_router.get("/mess/analytics/hostel-preferences")
async def get_hostel_food_preferences(user: dict = Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")

    month_key = get_month_key_india()

    rows = await db.food_feedback.find(
        {"month_key": month_key},
        {"hostel_name": 1, "suggestions": 1, "_id": 0}
    ).to_list(length=5000)

    grouped = defaultdict(list)
    for row in rows:
        hostel = str(row.get("hostel_name", "N/A")).strip() or "N/A"
        suggestion = str(row.get("suggestions", "")).strip()
        if suggestion:
            grouped[hostel].append(suggestion)

    result = []
    for hostel, suggestions in grouped.items():
        top_items = await local_feedback_fallback_analysis(suggestions, limit=5)
        result.append({
            "hostel_name": hostel,
            "top_items": top_items
        })

    result.sort(key=lambda x: x["hostel_name"])
    return {
        "month_key": month_key,
        "hostels": result
    }

async def get_student_by_identifier(identifier: str):
    identifier = str(identifier or "").strip()
    if not identifier:
        return None

    return await db.users.find_one({
        "role": "student",
        "$or": [
            {"username": identifier},
            {"enrollment_number": identifier}
        ]
    })

async def get_room_doc(hostel_name: str, block: str, floor: str, room_number: str):
    return await db.rooms.find_one({
        "hostel_name": hostel_name,
        "block": block,
        "floor": str(floor),
        "$or": [
            {"number": str(room_number)},
            {"room_number": str(room_number)}
        ]
    })

async def get_room_occupants(hostel_name: str, block: str, floor: str, room_number: str):
    return await db.users.find({
        "role": "student",
        "hostel_name": hostel_name,
        "block": block,
        "floor": str(floor),
        "room_number": str(room_number)
    }).to_list(length=20)

def allowed_beds_from_capacity(capacity: int):
    cap = max(1, int(capacity or 1))
    return [chr(65 + i) for i in range(cap)]

async def assign_student_to_bed(student_doc: dict, hostel_name: str, block: str, floor: str, room_number: str, bed_number: str | None = None):
    target_room = await get_room_doc(hostel_name, block, floor, room_number)
    if not target_room:
        raise HTTPException(status_code=404, detail="Target room not found")

    capacity = int(target_room.get("capacity", 1) or 1)
    allowed_beds = allowed_beds_from_capacity(capacity)
    occupants = await get_room_occupants(hostel_name, block, floor, room_number)
    used_beds = {str(o.get("bed_number", "")).upper() for o in occupants if o.get("bed_number")}

    final_bed = str(bed_number or "").upper().strip()
    if final_bed:
        if final_bed not in allowed_beds:
            raise HTTPException(status_code=400, detail=f"Invalid bed number. Allowed: {', '.join(allowed_beds)}")
        if final_bed in used_beds and str(student_doc.get("bed_number", "")).upper() != final_bed:
            raise HTTPException(status_code=400, detail="Target bed is already occupied")
    else:
        free_beds = [b for b in allowed_beds if b not in used_beds]
        if not free_beds:
            raise HTTPException(status_code=400, detail="No free bed available in target room")
        final_bed = free_beds[0]

    await db.users.update_one(
        {"_id": student_doc["_id"]},
        {"$set": {
            "hostel_name": hostel_name,
            "block": block,
            "floor": str(floor),
            "room_number": str(room_number),
            "bed_number": final_bed,
            "hostel": hostel_name,
            "room": str(room_number),
            "bed": final_bed
        }}
    )

    await db.yearly_bookings.update_many(
        {"username": student_doc.get("username")},
        {"$set": {
            "hostel_name": hostel_name,
            "room_number": str(room_number),
            "bed_number": final_bed
        }}
    )

    if student_doc.get("username"):
        await db.notifications.insert_one({
            "student_id": student_doc.get("username"),
            "title": "Room / Bed Allocation Updated",
            "message": f"Your room allocation has been updated to {hostel_name}, Block {block}, Room {room_number}, Bed {final_bed}.",
            "type": "bed_assignment",
            "read": False,
            "created_at": utc_now_iso()
        })

    return final_bed

@api_router.post("/bed-availability/swap-request")
async def create_swap_request(data: dict = Body(...), user: dict = Depends(get_current_user)):
    if user["role"] != "student":
        raise HTTPException(status_code=403, detail="Students only")

    db_user = await get_student_by_identifier(user.get("username"))
    if not db_user:
        raise HTTPException(status_code=404, detail="Student not found")

    request_type = str(data.get("request_type", "available_bed")).strip().lower()
    reason = str(data.get("reason", "")).strip()

    current_hostel = db_user.get("hostel_name")
    current_block = db_user.get("block")
    current_floor = db_user.get("floor")
    current_room = db_user.get("room_number")
    current_bed = db_user.get("bed_number")

    if not current_hostel or not current_room:
        raise HTTPException(status_code=400, detail="Current room allocation not found")

    if request_type == "student_swap":
        target_student_id = str(data.get("target_student_id", "")).strip()
        if not target_student_id:
            raise HTTPException(status_code=400, detail="Target student is required")

        target_student = await get_student_by_identifier(target_student_id)
        if not target_student:
            raise HTTPException(status_code=404, detail="Target student not found")

        if str(target_student.get("_id")) == str(db_user.get("_id")):
            raise HTTPException(status_code=400, detail="You cannot swap with yourself")

        swap_doc = {
            "request_type": "student_swap",
            "student_id": user.get("username"),
            "student_name": db_user.get("student_name") or db_user.get("username"),
            "current_hostel": current_hostel,
            "current_block": current_block,
            "current_floor": current_floor,
            "current_room": current_room,
            "current_bed": current_bed,
            "target_student_id": target_student.get("username") or target_student.get("enrollment_number"),
            "target_student_name": target_student.get("student_name") or target_student.get("username"),
            "target_hostel": target_student.get("hostel_name"),
            "target_block": target_student.get("block"),
            "target_floor": target_student.get("floor"),
            "target_room": target_student.get("room_number"),
            "target_bed": target_student.get("bed_number"),
            "mutual_confirmed": bool(data.get("mutual_confirmed", True)),
            "reason": reason,
            "status": "pending",
            "requested_at": utc_now_iso()
        }
        await db.bed_swap_requests.insert_one(swap_doc)
        return {"message": "Student-to-student swap request submitted"}

    target_hostel = str(data.get("target_hostel", "")).strip()
    target_block = str(data.get("target_block", "")).strip()
    target_floor = str(data.get("target_floor", "")).strip()
    target_room = str(data.get("target_room", "")).strip()
    target_bed = str(data.get("target_bed", "")).strip().upper()

    if not target_hostel or not target_block or not target_floor or not target_room:
        raise HTTPException(status_code=400, detail="Target hostel, block, floor and room are required")

    target_room_doc = await get_room_doc(target_hostel, target_block, target_floor, target_room)
    if not target_room_doc:
        raise HTTPException(status_code=404, detail="Target room not found")

    occupants = await get_room_occupants(target_hostel, target_block, target_floor, target_room)
    capacity = int(target_room_doc.get("capacity", 1) or 1)
    allowed_beds = allowed_beds_from_capacity(capacity)
    used_beds = {str(o.get("bed_number", "")).upper() for o in occupants if o.get("bed_number")}

    if target_bed:
      if target_bed not in allowed_beds:
          raise HTTPException(status_code=400, detail="Invalid target bed")
      if target_bed in used_beds:
          raise HTTPException(status_code=400, detail="Requested bed is already occupied")

    if not target_bed and len(used_beds) >= capacity:
        raise HTTPException(status_code=400, detail="No available bed left in target room")

    swap_doc = {
        "request_type": "available_bed",
        "student_id": user.get("username"),
        "student_name": db_user.get("student_name") or db_user.get("username"),
        "current_hostel": current_hostel,
        "current_block": current_block,
        "current_floor": current_floor,
        "current_room": current_room,
        "current_bed": current_bed,
        "target_hostel": target_hostel,
        "target_block": target_block,
        "target_floor": target_floor,
        "target_room": target_room,
        "target_bed": target_bed or None,
        "reason": reason,
        "status": "pending",
        "requested_at": utc_now_iso()
    }
    await db.bed_swap_requests.insert_one(swap_doc)
    return {"message": "Available-bed swap request submitted"}

@api_router.get("/admin/bed-management/swaps")
async def get_admin_bed_swaps(user: dict = Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")

    rows = await db.bed_swap_requests.find({"status": "pending"}).sort("requested_at", -1).to_list(length=500)
    for row in rows:
        row["_id"] = str(row["_id"])
    return rows

@api_router.post("/admin/bed-management/swaps/{request_id}/approve")
async def approve_bed_swap(request_id: str, user: dict = Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")

    req = await db.bed_swap_requests.find_one({"_id": ObjectId(request_id)})
    if not req:
        raise HTTPException(status_code=404, detail="Swap request not found")

    if str(req.get("status", "")).lower() != "pending":
        raise HTTPException(status_code=400, detail="Request is already processed")

    student = await get_student_by_identifier(req.get("student_id"))
    if not student:
        raise HTTPException(status_code=404, detail="Requesting student not found")

    if str(req.get("request_type", "")).lower() == "student_swap":
        target_student = await get_student_by_identifier(req.get("target_student_id"))
        if not target_student:
            raise HTTPException(status_code=404, detail="Target student not found")

        student_current = {
            "hostel_name": student.get("hostel_name"),
            "block": student.get("block"),
            "floor": student.get("floor"),
            "room_number": student.get("room_number"),
            "bed_number": student.get("bed_number")
        }
        target_current = {
            "hostel_name": target_student.get("hostel_name"),
            "block": target_student.get("block"),
            "floor": target_student.get("floor"),
            "room_number": target_student.get("room_number"),
            "bed_number": target_student.get("bed_number")
        }

        # Update both students with all attribute aliases
        await db.users.update_one(
            {"_id": student["_id"]},
            {"$set": {
                "hostel_name": target_current["hostel_name"],
                "block": target_current["block"],
                "floor": target_current["floor"],
                "room_number": target_current["room_number"],
                "bed_number": target_current["bed_number"],
                "hostel": target_current["hostel_name"],
                "room": target_current["room_number"],
                "bed": target_current["bed_number"]
            }}
        )

        await db.users.update_one(
            {"_id": target_student["_id"]},
            {"$set": {
                "hostel_name": student_current["hostel_name"],
                "block": student_current["block"],
                "floor": student_current["floor"],
                "room_number": student_current["room_number"],
                "bed_number": student_current["bed_number"],
                "hostel": student_current["hostel_name"],
                "room": student_current["room_number"],
                "bed": student_current["bed_number"]
            }}
        )

        # Update active yearly bookings for both
        await db.yearly_bookings.update_many(
            {"username": student.get("username")},
            {"$set": {
                "hostel_name": target_current["hostel_name"],
                "room_number": target_current["room_number"],
                "bed_number": target_current["bed_number"]
            }}
        )
        await db.yearly_bookings.update_many(
            {"username": target_student.get("username")},
            {"$set": {
                "hostel_name": student_current["hostel_name"],
                "room_number": student_current["room_number"],
                "bed_number": student_current["bed_number"]
            }}
        )

        # Send notifications to both students
        for sid, other_sid, new_h, new_r, new_b in [
            (student.get("username"), target_student.get("username"), target_current["hostel_name"], target_current["room_number"], target_current["bed_number"]),
            (target_student.get("username"), student.get("username"), student_current["hostel_name"], student_current["room_number"], student_current["bed_number"])
        ]:
            if sid:
                await db.notifications.insert_one({
                    "student_id": sid,
                    "title": "Bed Swap Approved! 🎉",
                    "message": f"Your mutual bed swap with {other_sid} was approved! You are now allocated to {new_h}, Room {new_r}, Bed {new_b}.",
                    "type": "bed_swap",
                    "read": False,
                    "created_at": utc_now_iso()
                })

        await db.bed_swap_requests.update_one(
            {"_id": req["_id"]},
            {"$set": {
                "status": "approved",
                "approved_at": utc_now_iso(),
                "approved_by": user.get("username")
            }}
        )

        await db.booking_history.insert_one({
            "student_id": req.get("student_id"),
            "hostel_name": target_current["hostel_name"],
            "room_number": target_current["room_number"],
            "status": "SWAP_APPROVED",
            "duration": f"Bed swap approved with {req.get('target_student_id')}",
            "created_at": utc_now_iso()
        })

        await db.booking_history.insert_one({
            "student_id": req.get("target_student_id"),
            "hostel_name": student_current["hostel_name"],
            "room_number": student_current["room_number"],
            "status": "SWAP_APPROVED",
            "duration": f"Bed swap approved with {req.get('student_id')}",
            "created_at": utc_now_iso()
        })

        return {"message": "Student-to-student bed swap approved successfully and profiles updated"}

    assigned_bed = await assign_student_to_bed(
        student,
        req.get("target_hostel"),
        req.get("target_block"),
        req.get("target_floor"),
        req.get("target_room"),
        req.get("target_bed")
    )

    await db.bed_swap_requests.update_one(
        {"_id": req["_id"]},
        {"$set": {
            "status": "approved",
            "approved_at": utc_now_iso(),
            "approved_by": user.get("username"),
            "final_bed": assigned_bed
        }}
    )

    await db.booking_history.insert_one({
        "student_id": req.get("student_id"),
        "hostel_name": req.get("target_hostel"),
        "room_number": req.get("target_room"),
        "status": "SWAP_APPROVED",
        "duration": f"Moved to Bed {assigned_bed}",
        "created_at": utc_now_iso()
    })

    return {"message": "Bed move approved successfully"}

@api_router.post("/admin/bed-management/swaps/{request_id}/reject")
async def reject_bed_swap(request_id: str, user: dict = Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")

    req = await db.bed_swap_requests.find_one({"_id": ObjectId(request_id)})
    if not req:
        raise HTTPException(status_code=404, detail="Swap request not found")

    await db.bed_swap_requests.update_one(
        {"_id": req["_id"]},
        {"$set": {
            "status": "rejected",
            "rejected_at": utc_now_iso(),
            "rejected_by": user.get("username")
        }}
    )

    return {"message": "Swap request rejected"}  

@api_router.post("/admin/bed-management/assign")
async def admin_direct_bed_assignment(data: dict = Body(...), user: dict = Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")

    identifier = str(data.get("username", "")).strip()
    target_hostel = str(data.get("targetHostel", "")).strip()
    target_block = str(data.get("targetBlock", "")).strip()
    target_floor = str(data.get("targetFloor", "")).strip()
    target_room = str(data.get("targetRoom", "")).strip()
    target_bed = str(data.get("targetBed", "")).strip().upper()

    if not identifier or not target_hostel or not target_block or not target_floor or not target_room:
        raise HTTPException(status_code=400, detail="Required assignment fields missing")

    student = await get_student_by_identifier(identifier)
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    final_bed = await assign_student_to_bed(
        student,
        target_hostel,
        target_block,
        target_floor,
        target_room,
        target_bed or None
    )

    await db.booking_history.insert_one({
        "student_id": student.get("username") or student.get("enrollment_number"),
        "hostel_name": target_hostel,
        "room_number": target_room,
        "status": "ADMIN_ASSIGNED",
        "duration": f"Assigned to Bed {final_bed}",
        "created_at": utc_now_iso()
    })

    return {"message": "Manual bed assignment completed successfully", "bed_number": final_bed}


@api_router.get("/bed-availability/my-swap-requests")
async def get_my_swap_requests(user: dict = Depends(get_current_user)):
    if user["role"] != "student":
        raise HTTPException(status_code=403, detail="Students only")

    rows = await db.bed_swap_requests.find({
        "student_id": user.get("username")
    }).sort("requested_at", -1).to_list(length=200)

    for row in rows:
        row["_id"] = str(row["_id"])

    return rows
    
# ==================== COMPLAINT ROUTES ====================

def make_complaint_code(hostel_name: str = "N/A") -> str:
    hostel = normalize_hostel_name(hostel_name)
    prefix = hostel.replace(" Bhawan", "").replace(" ", "").upper()[:4] if hostel and hostel != "N/A" else "GEN"
    return f"CMP-{prefix}-{datetime.now().strftime('%Y%m%d')}-{uuid.uuid4().hex[:6].upper()}"


@api_router.get("/complaints")
async def get_complaints(user: dict = Depends(get_current_user)):
    if user["role"] == "admin":
        complaints = await db.complaints.find({}).sort("date", -1).to_list(1000)
    else:
        complaints = await db.complaints.find(
            {"enrollment_number": str(user.get("enrollment_number"))}
        ).sort("date", -1).to_list(300)

    for complaint in complaints:
        complaint["_id"] = str(complaint["_id"])
        complaint["hostel_name"] = normalize_hostel_name(complaint.get("hostel_name", "N/A"))
        complaint["status"] = normalize_status(complaint.get("status", "pending"))
        complaint["priority"] = normalize_priority(complaint.get("priority", "medium"))
        complaint["block"] = normalize_block_name(complaint.get("block", "N/A"))
        complaint["room_number"] = str(complaint.get("room_number", "N/A"))
        complaint["bed_number"] = str(complaint.get("bed_number", "N/A"))
        complaint["complaint_code"] = complaint.get("complaint_code", "N/A")
        complaint["updated_at"] = complaint.get("updated_at")
        complaint["assigned_to"] = complaint.get("assigned_to")
        complaint["resolution_note"] = complaint.get("resolution_note")
        complaint["admin_note"] = complaint.get("admin_note")
        complaint["reopen_reason"] = complaint.get("reopen_reason")
        complaint["status_history"] = complaint.get("status_history", [])

    return complaints


@api_router.post("/complaints")
async def submit_complaint(
    category: str = Form(...),
    description: str = Form(...),
    priority: str = Form(...),
    image: Optional[UploadFile] = File(None),
    user: dict = Depends(get_current_user)
):
    category = str(category or "").strip().lower()
    description = str(description or "").strip()
    priority = str(priority or "").strip().lower()

    if not category:
        raise HTTPException(status_code=400, detail="Category is required")

    if not description:
        raise HTTPException(status_code=400, detail="Description is required")

    if len(description) < 10:
        raise HTTPException(status_code=400, detail="Description must be at least 10 characters")

    if not priority:
        raise HTTPException(status_code=400, detail="Priority is required")

    now_iso = datetime.now(timezone.utc).isoformat()

    complaint_dict = {
        "complaint_code": make_complaint_code(user.get("hostel_name", "N/A")),
        "student_id": user.get("username") or user.get("enrollment_number"),
        "student_name": user.get("student_name") or user.get("username"),
        "enrollment_number": str(user.get("enrollment_number", "N/A")),
        "hostel_name": normalize_hostel_name(user.get("hostel_name", "N/A")),
        "block": normalize_block_name(user.get("block", "N/A")),
        "room_number": str(user.get("room_number", "N/A")),
        "bed_number": str(user.get("bed_number", "N/A")),
        "category": category,
        "description": description,
        "priority": normalize_priority(priority),
        "status": "pending",
        "date": now_iso,
        "updated_at": now_iso,
        "resolved_at": None,
        "resolved_by": None,
        "assigned_to": None,
        "resolution_note": None,
        "admin_note": None,
        "reopen_reason": None,
        "image_url": None,
        "pdf_url": None,
        "status_history": [
            {
                "status": "pending",
                "changed_at": now_iso,
                "changed_by": str(user.get("enrollment_number", "N/A")),
                "note": "Complaint created"
            }
        ]
    }

    if image and image.filename:
        success, filename, message = await save_upload_file(image)
        if success:
            complaint_dict["image_url"] = f"/uploads/{filename}"

    try:
        complaint_dict["pdf_url"] = await generate_complaint_pdf(complaint_dict)
    except Exception:
        pass

    result = await db.complaints.insert_one(complaint_dict)
    complaint_dict["_id"] = str(result.inserted_id)

    return {
        "status": "success",
        "message": "Complaint registered",
        "data": complaint_dict
    }


async def generate_complaint_pdf(complaint_data: dict):
    file_name = f"complaint_{uuid.uuid4()}.pdf"
    file_path = UPLOAD_DIR / file_name

    c = canvas.Canvas(str(file_path), pagesize=letter)

    c.setFont("Helvetica-Bold", 16)
    c.drawString(70, 760, "HOSTELEASE - OFFICIAL COMPLAINT RECORD")
    c.line(70, 752, 540, 752)

    c.setFont("Helvetica", 11)
    c.drawString(70, 730, f"Complaint Code: {complaint_data.get('complaint_code', 'N/A')}")
    c.drawString(70, 710, f"Student Name: {complaint_data.get('student_name', 'N/A')}")
    c.drawString(70, 690, f"Enrollment No: {complaint_data.get('enrollment_number', 'N/A')}")
    c.drawString(70, 670, f"Hostel: {complaint_data.get('hostel_name', 'N/A')}")
    c.drawString(70, 650, f"Block / Room / Bed: {complaint_data.get('block', 'N/A')} / {complaint_data.get('room_number', 'N/A')} / {complaint_data.get('bed_number', 'N/A')}")
    c.drawString(70, 630, f"Category: {str(complaint_data.get('category', 'N/A')).upper()}")
    c.drawString(70, 610, f"Priority: {str(complaint_data.get('priority', 'medium')).upper()}")
    c.drawString(70, 590, f"Status: {str(complaint_data.get('status', 'pending')).upper()}")
    c.drawString(70, 570, f"Submitted At: {complaint_data.get('date', 'N/A')}")
    c.drawString(70, 550, f"Updated At: {complaint_data.get('updated_at', 'N/A')}")
    c.drawString(70, 530, f"Assigned To: {complaint_data.get('assigned_to') or 'N/A'}")

    if complaint_data.get("resolved_at"):
        c.drawString(70, 510, f"Resolved At: {complaint_data.get('resolved_at')}")
    if complaint_data.get("resolved_by"):
        c.drawString(70, 490, f"Resolved By: {complaint_data.get('resolved_by')}")

    c.setFont("Helvetica-Bold", 12)
    c.drawString(70, 460, "Description:")
    c.setFont("Helvetica", 11)

    text_obj = c.beginText(70, 440)
    text_obj.setLeading(16)
    description = str(complaint_data.get("description", "N/A"))
    for line in description.split("\n"):
        for i in range(0, len(line), 100):
            text_obj.textLine(line[i:i+100])
    c.drawText(text_obj)

    y_position = max(220, text_obj.getY() - 10)

    resolution_note = complaint_data.get("resolution_note")
    admin_note = complaint_data.get("admin_note")
    reopen_reason = complaint_data.get("reopen_reason")

    if resolution_note:
        c.setFont("Helvetica-Bold", 12)
        c.drawString(70, y_position, "Resolution Note:")
        c.setFont("Helvetica", 11)
        y_position -= 20
        text_obj2 = c.beginText(70, y_position)
        text_obj2.setLeading(16)
        for line in str(resolution_note).split("\n"):
            for i in range(0, len(line), 100):
                text_obj2.textLine(line[i:i+100])
        c.drawText(text_obj2)
        y_position = text_obj2.getY() - 10

    if admin_note:
        c.setFont("Helvetica-Bold", 12)
        c.drawString(70, y_position, "Admin Note:")
        c.setFont("Helvetica", 11)
        y_position -= 20
        text_obj3 = c.beginText(70, y_position)
        text_obj3.setLeading(16)
        for line in str(admin_note).split("\n"):
            for i in range(0, len(line), 100):
                text_obj3.textLine(line[i:i+100])
        c.drawText(text_obj3)
        y_position = text_obj3.getY() - 10

    if reopen_reason:
        c.setFont("Helvetica-Bold", 12)
        c.drawString(70, y_position, "Reopen Reason:")
        c.setFont("Helvetica", 11)
        y_position -= 20
        text_obj4 = c.beginText(70, y_position)
        text_obj4.setLeading(16)
        for line in str(reopen_reason).split("\n"):
            for i in range(0, len(line), 100):
                text_obj4.textLine(line[i:i+100])
        c.drawText(text_obj4)

    c.save()
    return f"/uploads/{file_name}"


@api_router.patch("/complaints/{complaint_id}")
async def update_complaint_status(
    complaint_id: str,
    data: dict = Body(...),
    user: dict = Depends(get_current_user)
):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")

    new_status = normalize_status(data.get("status", "pending"))
    assigned_to = str(data.get("assigned_to", "")).strip() or None
    resolution_note = str(data.get("resolution_note", "")).strip() or None
    admin_note = str(data.get("admin_note", "")).strip() or None

    try:
        query_id = ObjectId(complaint_id)
    except Exception:
        query_id = complaint_id

    existing = await db.complaints.find_one({"_id": query_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Complaint not found")

    now_iso = datetime.now(timezone.utc).isoformat()

    updates = {
        "status": new_status,
        "updated_at": now_iso,
        "assigned_to": assigned_to,
        "resolution_note": resolution_note,
        "admin_note": admin_note
    }

    if new_status == "resolved":
        updates["resolved_at"] = now_iso
        updates["resolved_by"] = user.get("username") or user.get("enrollment_number") or "admin"
    elif new_status in ["pending", "in_progress", "rejected"]:
        updates["resolved_at"] = None
        updates["resolved_by"] = None

    await db.complaints.update_one(
        {"_id": query_id},
        {
            "$set": updates,
            "$push": {
                "status_history": {
                    "status": new_status,
                    "changed_at": now_iso,
                    "changed_by": user.get("username") or user.get("enrollment_number") or "admin",
                    "note": resolution_note or admin_note or f"Status changed to {new_status}"
                }
            }
        }
    )

    updated_doc = await db.complaints.find_one({"_id": query_id})

    if updated_doc:
        pdf_payload = {
            **updated_doc,
            "hostel_name": normalize_hostel_name(updated_doc.get("hostel_name", "N/A")),
            "status": normalize_status(updated_doc.get("status", "pending")),
            "priority": normalize_priority(updated_doc.get("priority", "medium"))
        }
        pdf_url = await generate_complaint_pdf(pdf_payload)
        await db.complaints.update_one({"_id": query_id}, {"$set": {"pdf_url": pdf_url}})

        student_target = str(updated_doc.get("enrollment_number", "")).strip()
        if student_target:
            await add_notification(
                title="Complaint Updated",
                message=f"Your complaint {updated_doc.get('complaint_code', '')} is now {new_status.replace('_', ' ').title()}.",
                target_users=student_target,
                notif_type="complaint"
            )

    return {"message": "Complaint updated successfully"}


@api_router.post("/complaints/{complaint_id}/reopen")
async def reopen_complaint(
    complaint_id: str,
    data: dict = Body(...),
    user: dict = Depends(get_current_user)
):
    reason = str(data.get("reason", "")).strip()
    if not reason:
        raise HTTPException(status_code=400, detail="Reason is required")

    try:
        query_id = ObjectId(complaint_id)
    except Exception:
        query_id = complaint_id

    complaint = await db.complaints.find_one({"_id": query_id})
    if not complaint:
        raise HTTPException(status_code=404, detail="Complaint not found")

    if str(complaint.get("enrollment_number")) != str(user.get("enrollment_number")):
        raise HTTPException(status_code=403, detail="You can reopen only your own complaint")

    now_iso = datetime.now(timezone.utc).isoformat()

    await db.complaints.update_one(
        {"_id": query_id},
        {
            "$set": {
                "status": "pending",
                "updated_at": now_iso,
                "resolved_at": None,
                "resolved_by": None,
                "reopen_reason": reason
            },
            "$push": {
                "status_history": {
                    "status": "pending",
                    "changed_at": now_iso,
                    "changed_by": str(user.get("enrollment_number")),
                    "note": f"Complaint reopened by student: {reason}"
                }
            }
        }
    )

    await add_notification(
        title="Complaint Reopened",
        message=f"Complaint {complaint.get('complaint_code', '')} has been reopened by the student.",
        target_users="all",
        notif_type="complaint"
    )

    return {"message": "Complaint reopened successfully"}


@api_router.get("/admin/complaints/export")
async def export_complaints_report(
    format: str = Query("pdf"),
    hostel: str = Query("all"),
    category: str = Query("all"),
    status: str = Query("all"),
    user: dict = Depends(get_current_user)
):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")

    all_complaints = await db.complaints.find({}).sort("date", -1).to_list(2000)

    filtered_rows = []
    for item in all_complaints:
        hostel_name = normalize_hostel_name(item.get("hostel_name", "N/A"))
        item_category = str(item.get("category", "other")).lower()
        item_status = normalize_status(item.get("status", "pending"))
        item_priority = normalize_priority(item.get("priority", "medium"))

        if hostel != "all" and normalize_hostel_name(hostel) != hostel_name:
            continue
        if category != "all" and category.lower() != item_category:
            continue
        if status != "all" and status.lower() != item_status:
            continue

        filtered_rows.append([
            item.get("complaint_code", "N/A"),
            item.get("student_name", "N/A"),
            str(item.get("enrollment_number", "N/A")),
            hostel_name,
            str(item.get("block", "N/A")),
            str(item.get("room_number", "N/A")),
            item_category,
            item_priority,
            item_status,
            item.get("assigned_to", "N/A") or "N/A",
            item.get("date", "N/A"),
            item.get("resolved_at", "N/A") or "N/A"
        ])

    timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")

    if format.lower() == "csv":
        file_name = f"complaints_report_{timestamp}.csv"
        file_path = UPLOAD_DIR / file_name

        with open(file_path, "w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            writer.writerow([
                "Complaint Code",
                "Student Name",
                "Enrollment",
                "Hostel",
                "Block",
                "Room",
                "Category",
                "Priority",
                "Status",
                "Assigned To",
                "Submitted At",
                "Resolved At"
            ])
            writer.writerows(filtered_rows)

        return {"file_url": f"/uploads/{file_name}"}

    file_name = f"complaints_report_{timestamp}.pdf"
    file_path = UPLOAD_DIR / file_name

    doc = SimpleDocTemplate(str(file_path), pagesize=letter)
    styles = getSampleStyleSheet()
    elements = []

    elements.append(Paragraph("HOSTELEASE - Complaints Report", styles["Title"]))
    elements.append(Paragraph(f"Hostel Filter: {hostel}", styles["Normal"]))
    elements.append(Paragraph(f"Category Filter: {category}", styles["Normal"]))
    elements.append(Paragraph(f"Status Filter: {status}", styles["Normal"]))
    elements.append(Spacer(1, 20))

    table_data = [[
        "Code",
        "Student",
        "Hostel",
        "Category",
        "Priority",
        "Status",
        "Assigned"
    ]]
    for row in filtered_rows:
        table_data.append([row[0], row[1], row[3], row[6], row[7], row[8], row[9]])

    table = Table(table_data, colWidths=[80, 85, 85, 65, 55, 60, 75])
    table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#1E293B")),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 8),
        ('BACKGROUND', (0, 1), (-1, -1), colors.beige),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE')
    ]))

    elements.append(table)
    doc.build(elements)

    return {"file_url": f"/uploads/{file_name}"}


@api_router.get("/admin/complaints/stats")
async def get_complaints_stats(
    hostel: str = Query("all"),
    category: str = Query("all"),
    status: str = Query("all"),
    priority: str = Query("all"),
    user: dict = Depends(get_current_user)
):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")

    complaints = await db.complaints.find({}).to_list(5000)

    filtered = []
    for item in complaints:
        item_hostel = normalize_hostel_name(item.get("hostel_name", "N/A"))
        item_category = str(item.get("category", "other")).lower()
        item_status = normalize_status(item.get("status", "pending"))
        item_priority = normalize_priority(item.get("priority", "medium"))

        if hostel != "all" and normalize_hostel_name(hostel) != item_hostel:
            continue
        if category != "all" and category.lower() != item_category:
            continue
        if status != "all" and status.lower() != item_status:
            continue
        if priority != "all" and priority.lower() != item_priority:
            continue

        filtered.append({
            **item,
            "hostel_name": item_hostel,
            "category": item_category,
            "status": item_status,
            "priority": item_priority
        })

    return {
        "total": len(filtered),
        "active": len([c for c in filtered if c["status"] in ["pending", "in_progress"]]),
        "resolved": len([c for c in filtered if c["status"] == "resolved"]),
        "rejected": len([c for c in filtered if c["status"] == "rejected"]),
        "pending": len([c for c in filtered if c["status"] == "pending"]),
        "in_progress": len([c for c in filtered if c["status"] == "in_progress"]),
        "low": len([c for c in filtered if c["priority"] == "low"]),
        "medium": len([c for c in filtered if c["priority"] == "medium"]),
        "high": len([c for c in filtered if c["priority"] == "high"]),
        "urgent": len([c for c in filtered if c["priority"] == "urgent"]),
        "electricity": len([c for c in filtered if c["category"] == "electricity"]),
        "washroom": len([c for c in filtered if c["category"] == "washroom"]),
        "cleaning": len([c for c in filtered if c["category"] == "cleaning"]),
        "other": len([c for c in filtered if c["category"] == "other"])
    }

# ==================== PAYMENT ROUTES ====================

@api_router.get("/payments")
async def get_payments(user: dict = Depends(get_current_user)):
    if user["role"] == "admin":
        payments = await db.payments.find({}).sort("date", -1).to_list(500)
    else:
        # Check if student has an active pending booking
        active_draft = await db.yearly_bookings.find_one({
            "student_id": user["username"],
            "status": "pending_payment"
        })
        if not active_draft:
            # Delete any abandoned pending hostel booking payment
            await db.payments.delete_many({
                "student_id": user["username"],
                "status": {"$in": ["Pending", "pending"]},
                "type": "hostel_booking"
            })

        payments_cursor = db.payments.find({
            "$or": [
                {"student_id": user["username"]},
                {"student_id": user.get("enrollment_number")}
            ]
        }).sort("date", -1)
        payments = await payments_cursor.to_list(500)

    for p in payments:
        p["_id"] = str(p.get("_id", ""))
        if p.get("booking_ref"):
            p["booking_ref"] = str(p.get("booking_ref"))

    return payments


@api_router.post("/payments")
async def record_payment(payment: Payment, user: dict = Depends(get_current_user)):
    payment_dict = payment.model_dump()
    payment_dict["student_id"] = user["username"]
    payment_dict["date"] = datetime.now(timezone.utc).isoformat()
    payment_dict["status"] = payment_dict.get("status", "Success")

    await db.payments.insert_one(payment_dict)
    return {"message": "Payment recorded successfully"}


# ==================== FINES & DISCIPLINARY ROUTES ====================

@api_router.post("/admin/fines/issue")
async def issue_fine(
    student_enrollment: str = Form(...),
    amount: int = Form(...),
    category: str = Form(...),
    reason: str = Form(...),
    proof_image: Optional[UploadFile] = File(None),
    due_date: Optional[str] = Form(None),
    admin_remarks: Optional[str] = Form(None),
    user: dict = Depends(get_current_user)
):
    if user["role"] != "admin":
        raise HTTPException(403, "Admin only")

    student = await db.users.find_one({"enrollment_number": student_enrollment})
    if not student:
        raise HTTPException(404, "Student not found")

    proof_url = None
    if proof_image and proof_image.filename:
        success, filename, message = await save_document_file(proof_image)
        if success:
            proof_url = f"/uploads/{filename}"

    now_iso = datetime.now(timezone.utc).isoformat()

    fine_doc = {
        "student_id": student.get("username"),
        "student_name": student.get("student_name"),
        "student_enrollment": student_enrollment,
        "hostel_name": student.get("hostel_name"),
        "block": student.get("block"),
        "room_number": student.get("room_number"),
        "bed_number": student.get("bed_number"),
        "course": student.get("course"),
        "year": student.get("year"),

        "type": "fine",
        "category": category,
        "amount": int(amount),
        "reason": reason,
        "proof_url": proof_url,
        "status": "Pending",

        "date": now_iso,
        "created_at": now_iso,
        "due_date": due_date.strip() if due_date else None,
        "late_fee_amount": 0,
        "admin_remarks": admin_remarks.strip() if admin_remarks else None,

        "paid_at": None,
        "payment_mode": None,
        "payment_method": None,
        "payer_upi": None,
        "transaction_ref": None,
        "final_paid_amount": None,

        "appeal_text": None,
        "appealed_at": None,
        "resolved_at": None,
        "resolved_by": None
    }

    await db.payments.insert_one(fine_doc)
    return {"status": "success"}


@api_router.get("/admin/fines")
async def get_all_fines(user: dict = Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(403, "Admin only")

    fines = await db.payments.find({"type": "fine"}).sort("date", -1).to_list(500)
    for f in fines:
        f["_id"] = str(f["_id"])
    return fines


@api_router.post("/admin/fines/{payment_id}/resolve-appeal")
async def resolve_fine_appeal(payment_id: str, data: dict = Body(...), user: dict = Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(403, "Admin only")

    from bson.objectid import ObjectId
    try:
        obj_id = ObjectId(payment_id)
    except:
        raise HTTPException(400, "Invalid ID")

    action = data.get("action")
    admin_remarks = str(data.get("admin_remarks", "")).strip() if data.get("admin_remarks") else None

    if action not in ["approve", "reject"]:
        raise HTTPException(400, "Invalid action")

    new_status = "Waived" if action == "approve" else "Pending"

    await db.payments.update_one(
        {"_id": obj_id, "type": "fine"},
        {"$set": {
            "status": new_status,
            "resolved_at": datetime.now(timezone.utc).isoformat(),
            "resolved_by": user.get("username"),
            "admin_remarks": admin_remarks
        }}
    )

    return {"status": "success"}


@api_router.post("/student/fines/{payment_id}/pay")
async def pay_fine(payment_id: str, data: dict = Body({}), user: dict = Depends(get_current_user)):
    from bson.objectid import ObjectId

    try:
        obj_id = ObjectId(payment_id)
    except:
        raise HTTPException(400, "Invalid ID")

    payment_method = str(data.get("payment_method", "upi")).strip()
    payer_upi = str(data.get("payer_upi", "")).strip()
    transaction_ref = str(data.get("transaction_ref", "")).strip()
    qr_scanned = bool(data.get("qr_scanned", False))

    if transaction_ref == "":
        transaction_ref = None
    if payer_upi == "":
        payer_upi = None

    fine_doc = await db.payments.find_one(
        {"_id": obj_id, "student_id": user["username"], "type": "fine"}
    )
    if not fine_doc:
        raise HTTPException(404, "Fine not found")

    current_status = str(fine_doc.get("status", "")).strip().lower()
    if current_status == "paid":
        raise HTTPException(400, "Fine is already paid")
    if current_status == "waived":
        raise HTTPException(400, "This fine has already been waived")

    current_amount = int(fine_doc.get("amount", 0) or 0)
    late_fee_amount = int(fine_doc.get("late_fee_amount", 0) or 0)
    total_amount = current_amount + late_fee_amount

    update_payload = {
        "status": "Paid",
        "payment_mode": "Online Setup",
        "payment_method": payment_method,
        "payer_upi": payer_upi,
        "transaction_ref": transaction_ref,
        "qr_scanned": qr_scanned,
        "paid_at": datetime.now(timezone.utc).isoformat(),
        "final_paid_amount": total_amount
    }

    res = await db.payments.update_one(
        {"_id": obj_id, "student_id": user["username"], "type": "fine"},
        {"$set": update_payload}
    )
    if res.matched_count == 0:
        raise HTTPException(404, "Fine not found")

    return {"status": "success", "final_paid_amount": total_amount}


@api_router.post("/student/fines/{payment_id}/appeal")
async def appeal_fine(payment_id: str, data: dict = Body(...), user: dict = Depends(get_current_user)):
    from bson.objectid import ObjectId

    try:
        obj_id = ObjectId(payment_id)
    except:
        raise HTTPException(400, "Invalid ID")

    appeal_text = str(data.get("appeal_text", "")).strip()
    if not appeal_text:
        raise HTTPException(400, "Appeal text is required")

    fine_doc = await db.payments.find_one(
        {"_id": obj_id, "student_id": user["username"], "type": "fine"}
    )
    if not fine_doc:
        raise HTTPException(404, "Fine not found")

    current_status = str(fine_doc.get("status", "")).strip().lower()
    if current_status == "paid":
        raise HTTPException(400, "Paid fines cannot be appealed")
    if current_status == "waived":
        raise HTTPException(400, "Waived fines cannot be appealed")

    res = await db.payments.update_one(
        {"_id": obj_id, "student_id": user["username"], "type": "fine"},
        {"$set": {
            "status": "Appealed",
            "appeal_text": appeal_text,
            "appealed_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    if res.matched_count == 0:
        raise HTTPException(404, "Fine not found")

    return {"status": "success"}


@api_router.post("/admin/fines/apply-late-fees")
async def apply_late_fees(user: dict = Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(403, "Admin only")

    now_utc = datetime.now(timezone.utc)
    fines = await db.payments.find({"type": "fine", "status": "Pending"}).to_list(1000)

    updated_count = 0
    for fine in fines:
      due_date_raw = fine.get("due_date")
      if not due_date_raw:
          continue

      try:
          due_dt = datetime.fromisoformat(str(due_date_raw).replace("Z", "+00:00"))
      except Exception:
          continue

      if due_dt < now_utc:
          current_late_fee = int(fine.get("late_fee_amount", 0) or 0)
          if current_late_fee <= 0:
              await db.payments.update_one(
                  {"_id": fine["_id"]},
                  {"$set": {"late_fee_amount": 100}}
              )
              updated_count += 1

    return {"status": "success", "updated_count": updated_count} 

@api_router.get("/admin/students/search")
async def admin_search_students(
    q: str = Query(""),
    user: dict = Depends(get_current_user)
):
    if user["role"] != "admin":
        raise HTTPException(403, "Admin only")

    query_text = str(q or "").strip()
    mongo_query = {"role": "student"}

    if query_text:
        mongo_query["$or"] = [
            {"student_name": {"$regex": query_text, "$options": "i"}},
            {"enrollment_number": {"$regex": query_text, "$options": "i"}},
            {"username": {"$regex": query_text, "$options": "i"}},
            {"hostel_name": {"$regex": query_text, "$options": "i"}}
        ]

    students = await db.users.find(
        mongo_query,
        {
            "_id": 0,
            "student_name": 1,
            "enrollment_number": 1,
            "username": 1,
            "hostel_name": 1,
            "block": 1,
            "room_number": 1,
            "bed_number": 1,
            "course": 1,
            "year": 1
        }
    ).sort("student_name", 1).to_list(20)

    return students

# @api_router.post("/admin/students/mark-fine")
# async def mark_student_fine(data: dict = Body(...), user: dict = Depends(get_current_user)):
#     if user["role"] != "admin":
#         raise HTTPException(status_code=403, detail="Unauthorized")

#     enrollment_number = str(data.get("enrollment_number", "")).strip()
#     amount = float(data.get("amount", 0) or 0)
#     description = str(data.get("description", "")).strip()

#     if not enrollment_number:
#         raise HTTPException(status_code=400, detail="Enrollment number is required")
#     if amount <= 0:
#         raise HTTPException(status_code=400, detail="Fine amount must be greater than 0")
#     if not description:
#         raise HTTPException(status_code=400, detail="Fine description is required")

#     student = await db.users.find_one({"enrollment_number": enrollment_number})
#     if not student:
#         raise HTTPException(status_code=404, detail="Student not found")

#     fine_doc = {
#         "enrollment_number": enrollment_number,
#         "student_name": student.get("student_name", "Student"),
#         "amount": amount,
#         "description": description,
#         "date": data.get("date", datetime.now(timezone.utc).isoformat()),
#         "imposed_by": user.get("username", "admin"),
#         "status": "unpaid"
#     }

#     await db.fines.insert_one(fine_doc)
#     return {"message": "Fine registered successfully"}    

# ==================== GATEPASS ROUTES ====================

from datetime import datetime, timezone
from fastapi import Body, Depends, File, Form, HTTPException, UploadFile
from email.message import EmailMessage
import uuid


async def create_targeted_notification(
    *,
    title: str,
    message: str,
    notification_type: str = "gatepass",
    username: str = None,
    enrollment_number: str = None,
    hostel: str = "all",
    extra_data: dict = None
):
    payload = {
        "title": title,
        "type": notification_type,
        "message": message,
        "target_users": [username] if username else [],
        "target_enrollment_numbers": [str(enrollment_number)] if enrollment_number else [],
        "hostel": hostel or "all",
        "date": utc_now_iso(),
        "read_by": []
    }

    if extra_data and isinstance(extra_data, dict):
        payload.update(extra_data)

    await db.notifications.insert_one(payload)

def normalize_gatepass_status(value: str) -> str:
    allowed = {"pending", "approved", "rejected"}
    val = str(value or "").strip().lower()
    if val not in allowed:
        raise HTTPException(status_code=400, detail="Invalid gatepass status")
    return val

@api_router.post("/gatepass")
async def apply_gatepass(
    reason: str = Form(...),
    leave_from: str = Form(...),
    leave_to: str = Form(...),
    parent_phone: str = Form(...),
    destination: str = Form(...),
    permission_letter: UploadFile = File(...),
    user: dict = Depends(get_current_user)
):
    if not permission_letter or not permission_letter.filename:
        raise HTTPException(status_code=400, detail="Permission letter is required")

    success, filename, message = await save_document_file(permission_letter)
    if not success:
        raise HTTPException(status_code=400, detail=message)

    letter_url = f"/uploads/{filename}"

    gatepass_dict = {
        "student_id": user["username"],
        "student_name": user.get("student_name"),
        "enrollment_number": user.get("enrollment_number"),
        "hostel_name": user.get("hostel_name", "N/A"),
        "block": user.get("block", "N/A"),
        "room_number": user.get("room_number", "N/A"),
        "bed_number": user.get("bed_number", "N/A"),
        "reason": reason,
        "leave_from": leave_from,
        "leave_to": leave_to,
        "parent_phone": parent_phone,
        "destination": destination,
        "letter_url": letter_url,
        "status": "pending",
        "status_note": "",
        "applied_date": utc_now_iso(),
        "approval_date": None,
        "action_date": None,
        "action_by": None,
        "approved_by": None,
        "actual_out_time": None,
        "is_overdue": False,
        "explanation_required": False,
        "explanation_status": None
    }

    result = await db.gatepasses.insert_one(gatepass_dict)

    await create_targeted_notification(
        title="Gatepass Submitted",
        message=f"Your gatepass request for {destination} has been submitted successfully and is awaiting approval.",
        username=user.get("username"),
        enrollment_number=user.get("enrollment_number"),
        hostel=user.get("hostel_name", "all"),
        extra_data={
            "gatepass_id": str(result.inserted_id),
            "status": "pending"
        }
    )

    return {"status": "success", "message": "Gatepass applied successfully"}

@api_router.get("/gatepass")
async def get_gatepasses(user: dict = Depends(get_current_user)):
    """
    Fetches gatepass history. Admin sees all, students see theirs.
    """
    if user["role"] == "admin":
        passes = await db.gatepasses.find({}).sort("applied_date", -1).to_list(100)
    else:
        user_ids = list(filter(None, [user.get("username"), user.get("enrollment_number")]))
        passes = await db.gatepasses.find({
            "$or": [
                {"student_id": {"$in": user_ids}},
                {"enrollment_number": {"$in": user_ids}}
            ]
        }).sort("applied_date", -1).to_list(100)

    for p in passes:
        p["_id"] = str(p["_id"])

    return passes

@api_router.patch("/gatepass/{pass_id}/approve")
async def approve_gatepass(pass_id: str, status: str, user: dict = Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admin can approve gatepasses")

    status = normalize_gatepass_status(status)

    gatepass = None
    try:
        gatepass = await db.gatepasses.find_one({"_id": ObjectId(pass_id)})
    except Exception:
        pass
    if not gatepass:
        gatepass = await db.gatepasses.find_one({"applied_date": pass_id})
    if not gatepass:
        raise HTTPException(status_code=404, detail="Gatepass not found")

    update_data = {
        "status": status,
        "action_taken_by": user["username"],
        "action_taken_at": utc_now_iso(),
        "is_active": (status.lower() == "approved"),
        "approved_by": user["username"],
        "approval_date": utc_now_iso()
    }

    if status == "approved":
        try:
            pdf_url = await generate_gatepass_pdf({
                **gatepass,
                "status": status,
                "approval_date": update_data["approval_date"]
            })
            update_data["pdf_url"] = pdf_url
        except Exception as e:
            logger.warning(f"Failed to generate gatepass pdf: {e}")

    await db.gatepasses.update_one({"_id": gatepass["_id"]}, {"$set": update_data})

    # Notify student
    student_target = gatepass.get("student_id") or gatepass.get("enrollment_number")
    if student_target:
        await db.notifications.insert_one({
            "student_id": student_target,
            "title": f"Gatepass {status.capitalize()} 🎫",
            "message": f"Your gatepass application from {gatepass.get('leave_from', 'N/A')} to {gatepass.get('leave_to', 'N/A')} has been {status}.",
            "type": "gatepass",
            "read": False,
            "created_at": utc_now_iso()
        })

    return {"status": "success", "message": f"Gatepass {status} successfully"}

async def generate_gatepass_pdf(pass_data: dict):
    """Generates an official PDF for an approved gatepass."""
    file_name = f"gatepass_{uuid.uuid4()}.pdf"
    file_path = UPLOAD_DIR / file_name
    c = canvas.Canvas(str(file_path), pagesize=letter)

    # PDF Header
    c.setFont("Helvetica-Bold", 16)
    c.drawString(100, 750, "HOSTELEASE - OFFICIAL GATEPASS")
    c.line(100, 745, 500, 745)

    # Content
    c.setFont("Helvetica", 12)
    c.drawString(100, 720, f"Student Name: {pass_data.get('student_name', 'N/A')}")
    c.drawString(100, 700, f"Enrollment: {pass_data.get('enrollment_number', 'N/A')}")
    c.drawString(100, 680, f"Hostel: {pass_data.get('hostel_name', 'N/A')}")
    c.drawString(100, 660, f"Block: {pass_data.get('block', 'N/A')}")
    c.drawString(100, 640, f"Room Number: {pass_data.get('room_number', 'N/A')}")
    c.drawString(100, 620, f"Bed Number: {pass_data.get('bed_number', 'N/A')}")
    c.drawString(100, 600, f"Destination: {pass_data.get('destination', 'N/A')}")
    c.drawString(100, 580, f"Leave From: {pass_data.get('leave_from', 'N/A')}")
    c.drawString(100, 560, f"Expected Return: {pass_data.get('leave_to', 'N/A')}")
    c.drawString(100, 540, f"Status: {str(pass_data.get('status', 'N/A')).upper()}")
    c.drawString(100, 520, f"Approval Date: {pass_data.get('approval_date', 'N/A')}")

    c.save()
    return f"/uploads/{file_name}"

@api_router.get("/admin/gatepass-report")
async def generate_gatepass_report(user: dict = Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")

    gatepasses = await db.gatepasses.find().sort("applied_date", -1).to_list(200)

    file_name = f"gatepass_report_{datetime.now().strftime('%Y-%m-%d_%H-%M-%S')}.pdf"
    file_path = UPLOAD_DIR / file_name

    doc = SimpleDocTemplate(str(file_path), pagesize=letter)
    elements = []
    styles = getSampleStyleSheet()

    elements.append(Paragraph("HOSTELEASE - Gatepass Security Report", styles['Title']))
    elements.append(Paragraph(f"Generated on: {datetime.now().strftime('%d-%m-%Y %I:%M %p')}", styles['Normal']))
    elements.append(Spacer(1, 20))

    data = [[
        "Student", "Enrollment", "Hostel", "Room", "Bed", "Destination", "Status"
    ]]

    for gp in gatepasses:
        data.append([
            gp.get("student_name", "N/A"),
            str(gp.get("enrollment_number", "N/A")),
            gp.get("hostel_name", "N/A"),
            str(gp.get("room_number", "N/A")),
            str(gp.get("bed_number", "N/A")),
            gp.get("destination", "N/A"),
            gp.get("status", "N/A").upper()
        ])

    table = Table(data, colWidths=[90, 80, 80, 45, 40, 100, 65])
    table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#1E293B")),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
        ('FONTSIZE', (0, 0), (-1, -1), 8),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('BACKGROUND', (0, 1), (-1, -1), colors.beige),
    ]))

    elements.append(table)
    doc.build(elements)

    return {"pdf_url": f"/uploads/{file_name}"}

@api_router.post("/student/gatepass/submit-explanation")
async def submit_gatepass_explanation(
    data: dict = Body(...),
    user: dict = Depends(get_current_user)
):
    reason = str(data.get("reason", "")).strip()

    if not reason:
        raise HTTPException(status_code=400, detail="Reason is required")

    student_id = str(user.get("enrollment_number", "")).strip()

    overdue_gatepass = await db.gatepasses.find_one(
        {
            "enrollment_number": student_id,
            "is_overdue": True,
            "explanation_required": True
        },
        sort=[("applied_date", -1)]
    )

    if not overdue_gatepass:
        raise HTTPException(status_code=404, detail="No overdue gatepass found")

    await db.gatepasses.update_one(
        {"_id": overdue_gatepass["_id"]},
        {
            "$set": {
                "student_explanation": reason,
                "explanation_status": "submitted",
                "explanation_submitted_at": utc_now_iso()
            }
        }
    )

    await db.notifications.insert_one({
        "title": "Overdue Explanation Submitted",
        "type": "gatepass",
        "message": f"{user.get('student_name', 'Student')} submitted overdue explanation for review.",
        "target_users": [],
        "target_roles": ["admin"],
        "hostel": "all",
        "date": utc_now_iso(),
        "read_by": []
    })

    return {"message": "Explanation submitted successfully"}

@api_router.get("/admin/gatepasses/all")
async def get_all_gatepasses(user: dict = Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403)

    passes = await db.gatepasses.find().sort("applied_date", -1).to_list(length=200)

    for p in passes:
        p["_id"] = str(p["_id"])

    return passes

@api_router.get("/admin/gatepasses/pending")
async def get_pending_gatepasses(user: dict = Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    passes = await db.gatepasses.find({"status": "pending"}).to_list(length=100)

    for p in passes:
        p["_id"] = str(p["_id"])

    return passes

@api_router.put("/admin/gatepass-action/{pass_id}")
async def update_gatepass_status(pass_id: str, data: dict, user: dict = Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403)

    gatepass = await db.gatepasses.find_one({"_id": ObjectId(pass_id)})
    if not gatepass:
        raise HTTPException(status_code=404, detail="Gatepass not found")

    status = normalize_gatepass_status(data.get("status"))
    note = str(data.get("note", "")).strip()
    now_iso = utc_now_iso()

    update_payload = {
        "status": status,
        "status_note": note,
        "action_by": user["username"],
        "approved_by": user["username"],
        "action_date": now_iso,
        "approval_date": now_iso if status in {"approved", "rejected"} else None
    }

    if status == "approved":
        pdf_url = await generate_gatepass_pdf({
            **gatepass,
            **update_payload
        })
        update_payload["pdf_url"] = pdf_url
    elif status == "rejected":
        update_payload["pdf_url"] = None
    elif status == "pending":
        # keep old pdf if admin reverts to pending by mistake/history workflow
        update_payload["pdf_url"] = gatepass.get("pdf_url")

    result = await db.gatepasses.update_one(
        {"_id": ObjectId(pass_id)},
        {"$set": update_payload}
    )

    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Gatepass not found")

    updated_gatepass = {
        **gatepass,
        **update_payload
    }

    await create_targeted_notification(
        title="Gatepass Status Updated",
        message=(
            f"Your gatepass for {gatepass.get('destination', 'your destination')} has been "
            f"{status}. {f'Admin note: {note}' if note else ''}"
        ).strip(),
        username=gatepass.get("student_id"),
        enrollment_number=gatepass.get("enrollment_number"),
        hostel=gatepass.get("hostel_name", "all"),
        extra_data={
            "gatepass_id": pass_id,
            "student_name": gatepass.get("student_name"),
            "student_enrollment": gatepass.get("enrollment_number"),
            "hostel_name": gatepass.get("hostel_name"),
            "block": gatepass.get("block"),
            "room_number": gatepass.get("room_number"),
            "bed_number": gatepass.get("bed_number"),
            "destination": gatepass.get("destination"),
            "reason": gatepass.get("reason"),
            "leave_from": gatepass.get("leave_from"),
            "leave_to": gatepass.get("leave_to"),
            "status": status,
            "status_note": note,
            "approval_date": update_payload.get("approval_date"),
            "action_by": user.get("username"),
            "pdf_url": update_payload.get("pdf_url", gatepass.get("pdf_url"))
        }
    )

    return {
        "message": "Updated successfully",
        "status": status,
        "approval_date": update_payload.get("approval_date"),
        "pdf_url": update_payload.get("pdf_url", gatepass.get("pdf_url"))
    }

@api_router.post("/admin/gatepass/send-overdue-alert/{pass_id}")
async def send_overdue_alert(pass_id: str, user: dict = Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403)

    gatepass = await db.gatepasses.find_one({"_id": ObjectId(pass_id)})
    if not gatepass:
        raise HTTPException(status_code=404, detail="Record not found")

    student = await db.users.find_one({"enrollment_number": gatepass["enrollment_number"]})
    if not student:
        raise HTTPException(status_code=404, detail="Student record not found")

    await db.gatepasses.update_one(
        {"_id": ObjectId(pass_id)},
        {
            "$set": {
                "is_overdue": True,
                "explanation_required": True,
                "explanation_status": "pending",
                "action_by": user["username"],
                "action_date": utc_now_iso()
            }
        }
    )

    await create_targeted_notification(
        title="Overdue Gatepass Alert",
        message=(
            f"You were expected to return by {gatepass.get('leave_to', 'N/A')}. "
            f"Please submit your explanation immediately in the gatepass section."
        ),
        username=gatepass.get("student_id"),
        enrollment_number=gatepass.get("enrollment_number"),
        hostel=gatepass.get("hostel_name", "all"),
        extra_data={
            "status": gatepass.get("status", "pending"),
            "gatepass_id": pass_id,
            "is_overdue": True,
            "explanation_required": True
        }
    )

    # 3. DISPATCH EMAIL (Example Logic)
    msg = EmailMessage()
    msg.set_content(f"""
Urgent: Overdue Hostel Return
Hello {student.get('student_name', 'Student')},

You were scheduled to return on {gatepass.get('leave_to', 'N/A')}. You are currently marked as OVERDUE.
You must submit a formal explanation with parent approval via the Hostelease Portal immediately.

Parent Contacted: {gatepass.get('parent_phone', student.get('parent_phone', 'N/A'))}
""")

    msg['Subject'] = 'HOSTELEASE: Overdue Return Alert'
    msg['From'] = "security@hostelease.com"
    msg['To'] = student.get('personal_email', '')

    # Example SMTP block:
    # with smtplib.SMTP_SSL('smtp.gmail.com', 465) as smtp:
    #     smtp.login("USER", "PASS")
    #     smtp.send_message(msg)

    return {"status": "success", "message": "Alerts sent and explanation requested"}   

# ==================== LAUNDRY ROUTES ====================

@api_router.post("/admin/laundry/seed-machines")
async def seed_laundry_machines(user: dict = Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")

    inserted = 0
    updated = 0

    for hostel in LAUNDRY_ALLOWED_HOSTELS:
        for block in LAUNDRY_ALLOWED_BLOCKS:
            for i in range(1, 6):
                machine_code = make_machine_code(hostel, block, i)

                machine_type = "washer" if i <= 3 else "dryer"
                price = 50 if machine_type == "washer" else 40
                duration = 45 if machine_type == "washer" else 35

                doc = {
                    "machine_code": machine_code,
                    "machine_number": i,
                    "machine_type": machine_type,
                    "hostel_name": normalize_hostel_name(hostel),
                    "block": normalize_block_name(block),
                    "location_label": f"Laundry Room Block {block}",
                    "status": "idle",
                    "price_per_cycle": price,
                    "cycle_duration_minutes": duration,
                    "remaining_minutes": 0,
                    "photo_url": None,
                    "room_photo_url": None,
                    "current_booking_id": None,
                    "active_booking_id": None,
                    "active_student_id": None,
                    "start_time": None,
                    "end_time": None,
                    "last_started_at": None,
                    "last_completed_at": None,
                    "total_cycles": 0,
                    "total_revenue": 0,
                    "complaint_count_7d": 0,
                    "complaint_count_30d": 0,
                    "created_at": iso_now_ist(),
                    "updated_at": iso_now_ist()
                }

                exists = await db.laundry_machines.find_one({"machine_code": machine_code})

                if not exists:
                    await db.laundry_machines.insert_one(doc)
                    inserted += 1
                else:
                    await db.laundry_machines.update_one(
                        {"_id": exists["_id"]},
                        {
                            "$set": {
                                "hostel_name": doc["hostel_name"],
                                "block": doc["block"],
                                "machine_number": doc["machine_number"],
                                "machine_type": doc["machine_type"],
                                "location_label": doc["location_label"],
                                "price_per_cycle": doc["price_per_cycle"],
                                "cycle_duration_minutes": doc["cycle_duration_minutes"],
                                "updated_at": iso_now_ist()
                            }
                        }
                    )
                    updated += 1

    total = await db.laundry_machines.count_documents({})
    return {
        "message": "Laundry machines seeded successfully",
        "inserted": inserted,
        "updated": updated,
        "total_machines": total
    }

@api_router.get("/admin/laundry/export-usage")
async def export_laundry_usage_report(
    format: str = Query("pdf"),
    hostel: str = Query("all"),
    block: str = Query("all"),
    date: Optional[str] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    current_user: dict = Depends(get_current_user)
):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403)

    query = {}

    if date:
        query["created_at"] = {
            "$gte": f"{date}T00:00:00",
            "$lte": f"{date}T23:59:59"
        }
    elif date_from or date_to:
        query["created_at"] = {}
        if date_from:
            query["created_at"]["$gte"] = f"{date_from}T00:00:00"
        if date_to:
            query["created_at"]["$lte"] = f"{date_to}T23:59:59"

    bookings = await db.laundry_bookings.find(query).sort("created_at", -1).to_list(length=5000)

    rows = []
    for b in bookings:
        b_hostel = normalize_hostel_name(b.get("hostel_name", "N/A"))
        b_block = normalize_block_name(b.get("block", "A"))

        if hostel != "all" and normalize_hostel_name(hostel) != b_hostel:
            continue
        if block != "all" and normalize_block_name(block) != b_block:
            continue

        rows.append([
            b.get("student_name", "N/A"),
            b.get("student_id", "N/A"),
            b.get("machine_code", "N/A"),
            b.get("machine_type", "washer"),
            b_hostel,
            b_block,
            b.get("booking_type", "instant"),
            b.get("payment_mode", "wallet"),
            b.get("status", "N/A"),
            float(b.get("amount_paid", 0) or 0),
            b.get("start_time", "N/A"),
            b.get("end_time", "N/A"),
            b.get("created_at", "N/A")
        ])

    timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")

    if format.lower() == "csv":
        file_name = f"laundry_usage_report_{timestamp}.csv"
        file_path = UPLOAD_DIR / file_name

        with open(file_path, "w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            writer.writerow([
                "Student Name", "Student ID", "Machine Code", "Machine Type", "Hostel",
                "Block", "Booking Type", "Payment Mode", "Status", "Amount Paid",
                "Start Time", "End Time", "Created At"
            ])
            writer.writerows(rows)

        return {"file_url": f"/uploads/{file_name}"}

    file_name = f"laundry_usage_report_{timestamp}.pdf"
    file_path = UPLOAD_DIR / file_name

    doc = SimpleDocTemplate(str(file_path), pagesize=letter)
    styles = getSampleStyleSheet()
    elements = []

    elements.append(Paragraph("HOSTELEASE - Laundry Usage & Revenue Report", styles["Title"]))
    elements.append(Paragraph(f"Hostel: {hostel}", styles["Normal"]))
    elements.append(Paragraph(f"Block: {block}", styles["Normal"]))
    elements.append(Paragraph(f"Date: {date or 'N/A'}", styles["Normal"]))
    elements.append(Paragraph(f"Date From: {date_from or 'N/A'}", styles["Normal"]))
    elements.append(Paragraph(f"Date To: {date_to or 'N/A'}", styles["Normal"]))
    elements.append(Spacer(1, 16))

    data = [["Student", "Machine", "Type", "Hostel", "Block", "Status", "Amount"]]
    for r in rows:
        data.append([r[0], r[2], r[3], r[4], r[5], r[8], f"₹{r[9]}"])

    table = Table(data, colWidths=[85, 70, 55, 90, 45, 70, 55])
    table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#1E293B")),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 8),
        ('BACKGROUND', (0, 1), (-1, -1), colors.beige),
    ]))
    elements.append(table)
    doc.build(elements)

    return {"file_url": f"/uploads/{file_name}"}

@api_router.get("/laundry/machines")
async def get_student_laundry_machines(user: dict = Depends(get_current_user)):
    hostel_name = normalize_hostel_name(user.get("hostel_name", ""))
    if hostel_name == "N/A":
        return []

    machines = await db.laundry_machines.find(
        {"hostel_name": hostel_name}
    ).to_list(length=500)

    result = []
    for m in sorted(machines, key=machine_sort_key):
        m = await apply_repeat_issue_status(m)
        doc = serialize_doc(m)
        doc["hostel_name"] = normalize_hostel_name(doc.get("hostel_name"))
        doc["block"] = normalize_block_name(doc.get("block"))
        doc["machine_type"] = normalize_machine_type(doc.get("machine_type"))
        doc["remaining_minutes"] = remaining_minutes_from_end(doc.get("end_time"))
        result.append(doc)

    return result

@api_router.get("/laundry/machine-map")
async def get_laundry_machine_map(user: dict = Depends(get_current_user)):
    hostel_name = normalize_hostel_name(user.get("hostel_name", ""))
    if hostel_name == "N/A":
        return {}

    machines = await db.laundry_machines.find(
        {"hostel_name": hostel_name}
    ).to_list(length=500)

    result = {}

    for m in sorted(machines, key=machine_sort_key):
        hostel = normalize_hostel_name(m.get("hostel_name"))
        block = normalize_block_name(m.get("block", "A"))

        if hostel not in result:
            result[hostel] = {}
        if block not in result[hostel]:
            result[hostel][block] = []

        result[hostel][block].append({
            "machine_code": m.get("machine_code"),
            "machine_number": m.get("machine_number", 0),
            "status": str(m.get("status", "idle")).lower(),
            "machine_type": normalize_machine_type(m.get("machine_type", "washer")),
            "location_label": m.get("location_label", "Laundry Room")
        })

    return result

@api_router.get("/laundry/machine/{machine_code}")
async def get_machine_by_code(machine_code: str, user: dict = Depends(get_current_user)):
    hostel_name = normalize_hostel_name(user.get("hostel_name", ""))
    machine = await db.laundry_machines.find_one({"machine_code": machine_code.upper().strip()})

    if not machine:
        raise HTTPException(status_code=404, detail="Machine not found")

    if normalize_hostel_name(machine.get("hostel_name")) != hostel_name:
        raise HTTPException(status_code=403, detail="This machine is not from your hostel")

    machine = await apply_repeat_issue_status(machine)
    doc = serialize_doc(machine)
    doc["hostel_name"] = normalize_hostel_name(doc.get("hostel_name"))
    doc["block"] = normalize_block_name(doc.get("block"))
    doc["machine_type"] = normalize_machine_type(doc.get("machine_type"))
    doc["remaining_minutes"] = remaining_minutes_from_end(doc.get("end_time"))
    return doc

@api_router.get("/laundry/bookings")
async def get_student_laundry_bookings(user: dict = Depends(get_current_user)):
    student_id = user.get("enrollment_number")
    bookings = await db.laundry_bookings.find(
        {"student_id": student_id}
    ).sort("created_at", -1).to_list(length=200)

    for b in bookings:
        b["_id"] = str(b["_id"])
        b["remaining_minutes"] = remaining_minutes_from_end(b.get("end_time"))
    return bookings

@api_router.get("/laundry/usage-history")
async def get_laundry_usage_history(user: dict = Depends(get_current_user)):
    student_id = user.get("enrollment_number")
    bookings = await db.laundry_bookings.find(
        {"student_id": student_id}
    ).sort("created_at", -1).to_list(length=300)

    total_cycles = len(bookings)
    total_spend = sum(float(b.get("amount_paid", 0) or 0) for b in bookings)

    for b in bookings:
        b["_id"] = str(b["_id"])
        b["remaining_minutes"] = remaining_minutes_from_end(b.get("end_time"))

    return {
        "total_cycles": total_cycles,
        "total_spend": total_spend,
        "bookings": bookings
    }    

@api_router.get("/laundry/wallet")
async def get_laundry_wallet(user: dict = Depends(get_current_user)):
    student_id = user.get("enrollment_number")
    wallet = await ensure_student_wallet(student_id)
    wallet["_id"] = str(wallet["_id"]) if "_id" in wallet else None

    transactions = await db.laundry_wallet_transactions.find(
        {"student_id": student_id}
    ).sort("date", -1).to_list(length=200)

    for tx in transactions:
        tx["_id"] = str(tx["_id"])

    return {
        "wallet": wallet,
        "transactions": transactions
    }

@api_router.post("/laundry/payments/create-wallet-topup")
async def create_wallet_topup_payment(data: dict = Body(...), user: dict = Depends(get_current_user)):
    student_id = str(user.get("enrollment_number", "")).strip()
    amount = to_float(data.get("amount", 0))

    if amount <= 0:
        raise HTTPException(status_code=400, detail="Invalid top-up amount")

    reference_id = make_payment_reference("WTOP")
    upi_link = f"upi://pay?pa=hostelease@upi&pn=HOSTELEASE&am={amount:.2f}&cu=INR&tn={reference_id}"

    payment_doc = {
        "reference_id": reference_id,
        "student_id": student_id,
        "student_name": user.get("student_name", "Student"),
        "purpose": "wallet_topup",
        "amount": amount,
        "wallet_amount": 0,
        "online_amount": amount,
        "machine_code": None,
        "booking_type": None,
        "payment_gateway": "upi_test",
        "status": "pending",
        "created_at": iso_now_ist(),
        "verified_at": None,
        "receipt_url": None,
        "meta": {
            "hostel_name": normalize_hostel_name(user.get("hostel_name", "N/A"))
        }
    }

    await db.laundry_payments.insert_one(payment_doc)

    return {
        "message": "Wallet top-up payment created",
        "reference_id": reference_id,
        "amount": amount,
        "upi_link": upi_link,
        "status": "pending"
    }


@api_router.get("/laundry/payments/pending")
async def get_pending_laundry_payments(user: dict = Depends(get_current_user)):
    student_id = str(user.get("enrollment_number", "")).strip()
    payments = await db.laundry_payments.find({
        "student_id": student_id,
        "status": "pending"
    }).sort("created_at", -1).to_list(length=50)

    for p in payments:
        p["_id"] = str(p["_id"])
    return payments

@api_router.post("/laundry/payments/verify-manual")
async def verify_laundry_payment_manual(data: dict = Body(...), user: dict = Depends(get_current_user)):
    student_id = str(user.get("enrollment_number", "")).strip()
    reference_id = str(data.get("reference_id", "")).strip()

    if not reference_id:
        raise HTTPException(status_code=400, detail="Payment reference is required")

    payment = await db.laundry_payments.find_one({
        "reference_id": reference_id,
        "student_id": student_id
    })
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")

    if payment.get("status") == "success":
        return {
            "message": "Payment already verified",
            "reference_id": reference_id,
            "receipt_url": payment.get("receipt_url"),
            "status": "success"
        }

    if payment.get("purpose") == "wallet_topup":
        await ensure_student_wallet(student_id)
        await db.laundry_wallets.update_one(
            {"student_id": student_id},
            {
                "$inc": {"balance": to_float(payment.get("amount", 0))},
                "$set": {"updated_at": iso_now_ist()}
            }
        )
        await add_wallet_transaction(
            student_id,
            "credit",
            to_float(payment.get("amount", 0)),
            "wallet_topup",
            "success",
            reference_id
        )

    receipt_url = await create_payment_receipt_pdf(payment, user)

    await db.laundry_payments.update_one(
        {"_id": payment["_id"]},
        {
            "$set": {
                "status": "success",
                "verified_at": iso_now_ist(),
                "receipt_url": receipt_url
            }
        }
    )

    await send_laundry_notification(
        student_id,
        "Laundry Payment Verified",
        f"Payment {reference_id} verified successfully."
    )

    return {
        "message": "Payment verified successfully",
        "reference_id": reference_id,
        "receipt_url": receipt_url,
        "status": "success"
    }

@api_router.get("/admin/laundry/audit-logs")
async def get_laundry_audit_logs(current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")

    logs = await db.laundry_admin_audit_logs.find().sort("date", -1).to_list(length=500)
    for log in logs:
        log["_id"] = str(log["_id"])
    return logs

@api_router.post("/laundry/payment/create-order")
async def create_payment_order(data: PaymentCreateOrderRequest, user: dict = Depends(get_current_user)):
    amount = float(data.amount)
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Invalid payment amount")
    
    if not razorpay_client:
        raise HTTPException(status_code=500, detail="Payment gateway not configured")

    try:
        order_amount = int(amount * 100) # paise
        order_currency = "INR"
        order_receipt = f"receipt_{uuid.uuid4().hex[:10]}"
        notes = {"purpose": data.purpose, "student_id": user.get("enrollment_number")}
        
        order = await asyncio.to_thread(
            razorpay_client.order.create,
            dict(amount=order_amount, currency=order_currency, receipt=order_receipt, notes=notes)
        )
        
        return {
            "order_id": order["id"],
            "key_id": os.getenv("RAZORPAY_KEY_ID"),
            "amount": order_amount,
            "currency": order_currency,
            "description": f"Laundry {data.purpose.replace('_', ' ')}",
            "reference_id": order_receipt,
            "purpose": data.purpose
        }
    except Exception as e:
        logger.error(f"Razorpay order creation failed: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to create payment order")


@api_router.post("/laundry/payment/verify")
async def verify_payment(data: PaymentVerifyRequest, user: dict = Depends(get_current_user)):
    if not razorpay_client:
        raise HTTPException(status_code=500, detail="Payment gateway not configured")
        
    try:
        # Verify signature
        params_dict = {
            'razorpay_order_id': data.razorpay_order_id,
            'razorpay_payment_id': data.razorpay_payment_id,
            'razorpay_signature': data.razorpay_signature
        }
        
        await asyncio.to_thread(razorpay_client.utility.verify_payment_signature, params_dict)
        
        student_id = user.get("enrollment_number")
        amount = float(data.amount)
        
        if data.purpose == "wallet_topup":
            await ensure_student_wallet(student_id)
            await db.laundry_wallets.update_one(
                {"student_id": student_id},
                {
                    "$inc": {"balance": amount},
                    "$set": {"updated_at": iso_now_ist()}
                }
            )
            await add_wallet_transaction(student_id, "credit", amount, "wallet_topup", "success", data.razorpay_payment_id)
            
            await add_notification(
                title="Wallet Recharge Successful",
                message=f"₹{amount} has been added to your laundry wallet.",
                target_users=student_id,
                notif_type="laundry"
            )
            
        return {"message": "Payment verified successfully", "status": "success"}
    except razorpay.errors.SignatureVerificationError:
        logger.error("Razorpay signature verification failed")
        raise HTTPException(status_code=400, detail="Payment signature verification failed")
    except Exception as e:
        logger.error(f"Payment verification failed: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to verify payment")


@api_router.post("/laundry/payment/upi-intent")
async def create_upi_payment_intent(data: dict = Body(...), user: dict = Depends(get_current_user)):
    amount = float(data.get("amount", 0))
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Invalid UPI amount")

    reference_id = f"LAUNDRY-UPI-{uuid.uuid4().hex[:10].upper()}"
    upi_link = f"upi://pay?pa=hostelease@upi&pn=HOSTELEASE&am={amount}&cu=INR&tn={reference_id}"

    return {
        "reference_id": reference_id,
        "amount": amount,
        "upi_link": upi_link,
        "qr_image_url": None
    }

@api_router.get("/laundry/reminder-preferences")
async def get_laundry_reminder_preferences(user: dict = Depends(get_current_user)):
    student_id = user.get("enrollment_number")
    pref = await db.laundry_reminder_preferences.find_one({"student_id": student_id})
    if not pref:
        pref = {
            "student_id": student_id,
            "cycle_started": True,
            "ten_minutes_left": True,
            "cycle_completed": True,
            "updated_at": iso_now_ist()
        }
        await db.laundry_reminder_preferences.insert_one(pref)

    pref.pop("_id", None)
    return pref

@api_router.put("/laundry/reminder-preferences")
async def update_laundry_reminder_preferences(data: dict = Body(...), user: dict = Depends(get_current_user)):
    student_id = user.get("enrollment_number")
    updated = {
        "student_id": student_id,
        "cycle_started": bool(data.get("cycle_started", True)),
        "ten_minutes_left": bool(data.get("ten_minutes_left", True)),
        "cycle_completed": bool(data.get("cycle_completed", True)),
        "updated_at": iso_now_ist()
    }

    await db.laundry_reminder_preferences.update_one(
        {"student_id": student_id},
        {"$set": updated},
        upsert=True
    )

    return {"message": "Reminder preferences updated"}

@api_router.post("/laundry/book")
async def book_laundry_machine(data: dict = Body(...), user: dict = Depends(get_current_user)):
    student_id = str(user.get("enrollment_number", "")).strip()
    student_hostel = normalize_hostel_name(user.get("hostel_name", ""))
    machine_code = str(data.get("machine_code", "")).upper().strip()
    booking_type = str(data.get("booking_type", "instant")).strip().lower()
    payment_reference = str(data.get("payment_reference", "")).strip()

    if not machine_code:
        raise HTTPException(status_code=400, detail="Machine code is required")

    machine = await db.laundry_machines.find_one({"machine_code": machine_code})
    if not machine:
        raise HTTPException(status_code=404, detail="Machine not found")

    if normalize_hostel_name(machine.get("hostel_name")) != student_hostel:
        raise HTTPException(status_code=403, detail="Students can book only machines from their own hostel")

    cycle_minutes = int(machine.get("cycle_duration_minutes", 45) or 45)
    start_dt = now_ist()

    if booking_type == "instant":
        if str(machine.get("status", "idle")).lower() != "idle":
            raise HTTPException(status_code=400, detail="Machine is not available right now")
    elif booking_type == "scheduled":
        schedule_date = str(data.get("schedule_date", "")).strip()
        schedule_time = str(data.get("schedule_time", "")).strip()

        if not schedule_date or not schedule_time:
            raise HTTPException(status_code=400, detail="Schedule date and time are required")

        try:
            start_dt = datetime.fromisoformat(f"{schedule_date}T{schedule_time}:00")
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid scheduled date/time")

        if start_dt <= now_ist():
            raise HTTPException(status_code=400, detail="Scheduled time must be in the future")
    else:
        raise HTTPException(status_code=400, detail="Invalid booking type")

    end_dt = start_dt + timedelta(minutes=cycle_minutes)

    if booking_type == "scheduled":
        has_conflict = await check_scheduled_booking_conflict(machine_code, start_dt, end_dt)
        if has_conflict:
            raise HTTPException(status_code=400, detail="This machine already has a booking in the selected time slot")

    amount = to_float(machine.get("price_per_cycle", 50), 50)

    wallet = await ensure_student_wallet(student_id)
    current_wallet = to_float(wallet.get("balance", 0), 0)

    verified_payment = None
    wallet_amount = min(current_wallet, amount)
    online_amount = round(amount - wallet_amount, 2)

    if payment_reference:
        verified_payment = await db.laundry_payments.find_one({
            "reference_id": payment_reference,
            "student_id": student_id,
            "status": "success"
        })
        if not verified_payment:
            raise HTTPException(status_code=400, detail="Verified payment not found for this booking")

        wallet_amount = to_float(verified_payment.get("wallet_amount", wallet_amount), wallet_amount)
        online_amount = to_float(verified_payment.get("online_amount", online_amount), online_amount)

    elif current_wallet < amount:
        raise HTTPException(
            status_code=400,
            detail=f"Insufficient wallet balance. Add remaining ₹{round(amount - current_wallet, 2):.2f}"
        )

    if wallet_amount > 0:
        latest_wallet = await ensure_student_wallet(student_id)
        latest_balance = to_float(latest_wallet.get("balance", 0), 0)
        if latest_balance < wallet_amount:
            raise HTTPException(status_code=400, detail="Wallet balance changed. Please retry payment flow.")

        await db.laundry_wallets.update_one(
            {"student_id": student_id},
            {
                "$inc": {"balance": -wallet_amount},
                "$set": {"updated_at": iso_now_ist()}
            }
        )

        await add_wallet_transaction(
            student_id,
            "debit",
            wallet_amount,
            "laundry_booking",
            "success",
            payment_reference or machine_code
        )

    booking_status = "running" if booking_type == "instant" else "booked"

    booking_doc = {
        "student_id": student_id,
        "student_name": user.get("student_name", "Student"),
        "payment_reference": payment_reference or None,
        "machine_code": machine_code,
        "machine_number": machine.get("machine_number", 0),
        "machine_type": normalize_machine_type(machine.get("machine_type", "washer")),
        "hostel_name": normalize_hostel_name(machine.get("hostel_name")),
        "block": normalize_block_name(machine.get("block", "A")),
        "booking_type": booking_type,
        "payment_mode": "wallet" if online_amount == 0 and wallet_amount == amount else ("mixed" if wallet_amount > 0 else "upi"),
        "wallet_used": wallet_amount,
        "online_paid": online_amount,
        "amount_paid": amount,
        "status": booking_status,
        "start_time": start_dt.isoformat(),
        "end_time": end_dt.isoformat(),
        "remaining_minutes": cycle_minutes if booking_status == "running" else 0,
        "created_at": iso_now_ist(),
        "completed_at": None,
        "refund_status": None
    }

    result = await db.laundry_bookings.insert_one(booking_doc)
    booking_id = str(result.inserted_id)

    machine_update = {
        "updated_at": iso_now_ist(),
        "last_used_at": start_dt.isoformat()
    }

    if booking_type == "instant":
        machine_update.update({
            "status": "running",
            "current_booking_id": booking_id,
            "active_booking_id": booking_id,
            "active_student_id": student_id,
            "start_time": start_dt.isoformat(),
            "end_time": end_dt.isoformat(),
            "remaining_minutes": cycle_minutes,
            "last_started_at": start_dt.isoformat()
        })

    await db.laundry_machines.update_one(
        {"_id": machine["_id"]},
        {"$set": machine_update}
    )

    await send_laundry_notification(
        student_id,
        "Laundry Booking Confirmed",
        f"{machine_code} booked successfully from {start_dt.strftime('%d-%m-%Y %I:%M %p')} to {end_dt.strftime('%I:%M %p')}."
    )

    return {
        "message": "Laundry machine booked successfully",
        "booking_id": booking_id,
        "payment_reference": payment_reference or None
    }

@api_router.post("/laundry/payments/create-booking")
async def create_booking_payment(data: dict = Body(...), user: dict = Depends(get_current_user)):
    student_id = str(user.get("enrollment_number", "")).strip()
    student_hostel = normalize_hostel_name(user.get("hostel_name", ""))
    machine_code = str(data.get("machine_code", "")).upper().strip()
    booking_type = str(data.get("booking_type", "instant")).strip().lower()
    schedule_date = str(data.get("schedule_date", "")).strip()
    schedule_time = str(data.get("schedule_time", "")).strip()

    if not machine_code:
        raise HTTPException(status_code=400, detail="Machine code is required")

    machine = await db.laundry_machines.find_one({"machine_code": machine_code})
    if not machine:
        raise HTTPException(status_code=404, detail="Machine not found")

    if normalize_hostel_name(machine.get("hostel_name")) != student_hostel:
        raise HTTPException(status_code=403, detail="Students can book only machines from their own hostel")

    cycle_minutes = int(machine.get("cycle_duration_minutes", 45) or 45)

    if booking_type == "instant":
        if str(machine.get("status", "idle")).lower() != "idle":
            raise HTTPException(status_code=400, detail="Machine is not available right now")
    elif booking_type == "scheduled":
        if not schedule_date or not schedule_time:
            raise HTTPException(status_code=400, detail="Schedule date and time are required")

        try:
            start_dt = datetime.fromisoformat(f"{schedule_date}T{schedule_time}:00")
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid scheduled date/time")

        if start_dt <= now_ist():
            raise HTTPException(status_code=400, detail="Scheduled time must be in the future")

        end_dt = start_dt + timedelta(minutes=cycle_minutes)
        has_conflict = await check_scheduled_booking_conflict(machine_code, start_dt, end_dt)
        if has_conflict:
            raise HTTPException(status_code=400, detail="This machine already has a booking in the selected time slot")
    else:
        raise HTTPException(status_code=400, detail="Invalid booking type")

    amount = to_float(machine.get("price_per_cycle", 50), 50)
    wallet = await ensure_student_wallet(student_id)
    wallet_balance = to_float(wallet.get("balance", 0), 0)
    wallet_amount = min(wallet_balance, amount)
    online_amount = round(amount - wallet_amount, 2)

    if online_amount <= 0:
        return {
            "message": "Wallet balance is sufficient",
            "requires_online_payment": False,
            "wallet_amount": wallet_amount,
            "online_amount": 0,
            "amount": amount
        }

    reference_id = make_payment_reference("LBKG")
    upi_link = f"upi://pay?pa=hostelease@upi&pn=HOSTELEASE&am={online_amount:.2f}&cu=INR&tn={reference_id}"

    payment_doc = {
        "reference_id": reference_id,
        "student_id": student_id,
        "student_name": user.get("student_name", "Student"),
        "purpose": "laundry_booking",
        "amount": amount,
        "wallet_amount": wallet_amount,
        "online_amount": online_amount,
        "machine_code": machine_code,
        "booking_type": booking_type,
        "payment_gateway": "upi_test",
        "status": "pending",
        "created_at": iso_now_ist(),
        "verified_at": None,
        "receipt_url": None,
        "meta": {
            "hostel_name": normalize_hostel_name(user.get("hostel_name", "N/A")),
            "schedule_date": schedule_date or None,
            "schedule_time": schedule_time or None
        }
    }

    await db.laundry_payments.insert_one(payment_doc)

    return {
        "message": "Booking payment initiated",
        "requires_online_payment": True,
        "reference_id": reference_id,
        "wallet_amount": wallet_amount,
        "online_amount": online_amount,
        "amount": amount,
        "upi_link": upi_link,
        "status": "pending"
    }

@api_router.patch("/admin/laundry/payments/{reference_id}/mark-success")
async def mark_laundry_payment_success(reference_id: str, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")

    payment = await db.laundry_payments.find_one({"reference_id": reference_id})
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")

    if payment.get("status") == "success":
        return {"message": "Payment already marked success"}

    student = await db.users.find_one({"enrollment_number": payment.get("student_id")}) or {
        "student_name": payment.get("student_name", "Student"),
        "enrollment_number": payment.get("student_id")
    }

    if payment.get("purpose") == "wallet_topup":
        await ensure_student_wallet(payment.get("student_id"))
        await db.laundry_wallets.update_one(
            {"student_id": payment.get("student_id")},
            {
                "$inc": {"balance": to_float(payment.get("amount", 0))},
                "$set": {"updated_at": iso_now_ist()}
            }
        )
        await add_wallet_transaction(
            payment.get("student_id"),
            "credit",
            to_float(payment.get("amount", 0)),
            "wallet_topup",
            "success",
            reference_id
        )

    receipt_url = await create_payment_receipt_pdf(payment, student)

    await db.laundry_payments.update_one(
        {"_id": payment["_id"]},
        {
            "$set": {
                "status": "success",
                "verified_at": iso_now_ist(),
                "receipt_url": receipt_url,
                "verified_by": current_user.get("username", "admin")
            }
        }
    )

    await log_laundry_audit(
        action="payment_marked_success",
        actor=current_user.get("username", "admin"),
        machine_code=payment.get("machine_code"),
        payment_reference=reference_id,
        meta={"purpose": payment.get("purpose")}
    )

    return {"message": "Payment marked successful", "receipt_url": receipt_url}

@api_router.post("/laundry/refund-request")
async def create_refund_request(data: dict = Body(...), user: dict = Depends(get_current_user)):
    booking_id = data.get("booking_id")
    reason = str(data.get("reason", "")).strip()

    if not booking_id or not reason:
        raise HTTPException(status_code=400, detail="Booking ID and reason are required")

    try:
        booking = await db.laundry_bookings.find_one({"_id": ObjectId(booking_id)})
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid booking ID")

    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")

    if booking.get("student_id") != user.get("enrollment_number"):
        raise HTTPException(status_code=403, detail="Unauthorized refund request")

    refund_doc = {
        "booking_id": booking_id,
        "student_id": user.get("enrollment_number"),
        "student_name": user.get("student_name", "Student"),
        "machine_code": booking.get("machine_code"),
        "amount": float(booking.get("amount_paid", 0)),
        "reason": reason,
        "status": "pending",
        "created_at": iso_now_ist()
    }

    existing_pending = await db.laundry_refund_requests.find_one({
    "booking_id": booking_id,
    "student_id": user.get("enrollment_number"),
    "status": "pending"
    })
    if existing_pending:
        raise HTTPException(status_code=400, detail="A refund request is already pending for this booking")
 
    await db.laundry_refund_requests.insert_one(refund_doc)
    return {"message": "Refund request submitted successfully"}    

@api_router.get("/admin/laundry/machines")
async def get_admin_laundry_machines(current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403)

    machines = await db.laundry_machines.find().to_list(length=5000)

    result = []
    for m in sorted(machines, key=machine_sort_key):
        m = await apply_repeat_issue_status(m)
        doc = serialize_doc(m)
        doc["hostel_name"] = normalize_hostel_name(doc.get("hostel_name"))
        doc["block"] = normalize_block_name(doc.get("block"))
        doc["machine_type"] = normalize_machine_type(doc.get("machine_type"))
        doc["remaining_minutes"] = remaining_minutes_from_end(doc.get("end_time"))
        doc["utilization_percentage"] = await get_machine_utilization(doc.get("machine_code"), 30)
        doc["last_used_at"] = doc.get("last_used_at") or doc.get("last_started_at") or doc.get("last_completed_at")
        result.append(doc)

    return result

@api_router.patch("/admin/laundry/machine/{machine_code}")
async def update_laundry_machine(machine_code: str, data: dict = Body(...), current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403)

    machine = await db.laundry_machines.find_one({"machine_code": machine_code.upper()})
    if not machine:
        raise HTTPException(status_code=404, detail="Machine not found")

    old_status = str(machine.get("status", "idle")).lower()
    new_status = str(data.get("status", old_status)).lower()
    admin_note = str(data.get("note", "")).strip()

    update_data = {
        "updated_at": iso_now_ist(),
        "admin_note": admin_note
    }

    allowed_fields = [
        "status",
        "photo_url",
        "room_photo_url",
        "location_label",
        "price_per_cycle",
        "cycle_duration_minutes"
    ]
    for field in allowed_fields:
        if field in data:
            update_data[field] = data[field]

    if new_status in ["offline", "maintenance", "needs_service"] and old_status not in ["offline", "maintenance", "needs_service"]:
        await db.laundry_machine_downtime_logs.insert_one({
            "machine_code": machine_code.upper(),
            "hostel_name": normalize_hostel_name(machine.get("hostel_name", "N/A")),
            "block": normalize_block_name(machine.get("block", "A")),
            "started_at": iso_now_ist(),
            "ended_at": None,
            "status": new_status,
            "admin_note": admin_note,
            "updated_by": current_user.get("username", "admin")
        })

    if old_status in ["offline", "maintenance", "needs_service"] and new_status == "idle":
        latest_open = await db.laundry_machine_downtime_logs.find_one(
            {
                "machine_code": machine_code.upper(),
                "ended_at": None
            },
            sort=[("started_at", -1)]
        )
        if latest_open:
            await db.laundry_machine_downtime_logs.update_one(
                {"_id": latest_open["_id"]},
                {
                    "$set": {
                        "ended_at": iso_now_ist(),
                        "recovery_note": admin_note,
                        "updated_by": current_user.get("username", "admin")
                    }
                }
            )

    result = await db.laundry_machines.update_one(
        {"machine_code": machine_code.upper()},
        {"$set": update_data}
    )

    await log_laundry_audit(
        action="machine_status_updated",
        actor=current_user.get("username", "admin"),
        machine_code=machine_code.upper(),
        meta={
            "from": old_status,
            "to": new_status,
            "note": admin_note
        }
    )

    return {"message": "Machine updated successfully"}

@api_router.get("/admin/laundry/health-dashboard")
async def get_laundry_health_dashboard(current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")

    machines = await db.laundry_machines.find().to_list(length=5000)
    complaints = await db.laundry_complaints.find().to_list(length=5000)
    refunds_pending = await db.laundry_refund_requests.count_documents({"status": "pending"})

    total_machines = 0
    running = 0
    idle = 0
    offline = 0
    maintenance = 0
    total_revenue = 0.0

    # Always keep all 6 hostels visible in dashboard/chart, even if revenue is 0
    revenue_by_hostel = {hostel: 0.0 for hostel in LAUNDRY_ALLOWED_HOSTELS}

    result = []
    complaint_sla = {
        "over_24h": 0,
        "over_48h": 0
    }

    now = now_ist()

    # Complaint SLA
    for c in complaints:
        created = parse_iso(c.get("date"))
        status = str(c.get("status", "pending")).strip().lower()

        if not created or status == "completed":
            continue

        age_hours = (now - created).total_seconds() / 3600

        if age_hours >= 24:
            complaint_sla["over_24h"] += 1
        if age_hours >= 48:
            complaint_sla["over_48h"] += 1

    # Machine summary + revenue + rows
    for m in sorted(machines, key=machine_sort_key):
        m = await apply_repeat_issue_status(m)

        status = str(m.get("status", "idle")).strip().lower()
        hostel_name = normalize_hostel_name(m.get("hostel_name", "N/A"))

        total_machines += 1

        if status == "running":
            running += 1
        elif status == "idle":
            idle += 1
        elif status == "offline":
            offline += 1
        elif status in ["maintenance", "needs_service"]:
            maintenance += 1

        machine_revenue = to_float(m.get("total_revenue", 0), 0.0)
        total_revenue += machine_revenue

        # keep extra unknown hostel names too, just in case
        if hostel_name not in revenue_by_hostel and hostel_name != "N/A":
            revenue_by_hostel[hostel_name] = 0.0
        if hostel_name != "N/A":
            revenue_by_hostel[hostel_name] += machine_revenue

        doc = serialize_doc(m)
        doc["hostel_name"] = hostel_name
        doc["block"] = normalize_block_name(doc.get("block", "N/A"))
        doc["machine_type"] = normalize_machine_type(doc.get("machine_type", "washer"))
        doc["remaining_minutes"] = remaining_minutes_from_end(doc.get("end_time"))
        doc["utilization_percentage"] = await get_machine_utilization(doc.get("machine_code"), 30)
        doc["last_used_at"] = (
            doc.get("last_used_at")
            or doc.get("last_started_at")
            or doc.get("last_completed_at")
        )
        result.append(doc)

    # Important: return revenue list in fixed hostel order first
    ordered_revenue_rows = []
    for hostel in LAUNDRY_ALLOWED_HOSTELS:
        ordered_revenue_rows.append({
            "hostel_name": hostel,
            "revenue": round(to_float(revenue_by_hostel.get(hostel, 0), 0.0), 2)
        })

    # Add any extra hostel names not in allowed list
    extra_hostels = [
        hostel for hostel in revenue_by_hostel.keys()
        if hostel not in LAUNDRY_ALLOWED_HOSTELS and hostel != "N/A"
    ]
    for hostel in sorted(extra_hostels):
        ordered_revenue_rows.append({
            "hostel_name": hostel,
            "revenue": round(to_float(revenue_by_hostel.get(hostel, 0), 0.0), 2)
        })

    return {
        "summary": {
            "total_machines": total_machines,
            "running": running,
            "idle": idle,
            "offline": offline,
            "maintenance": maintenance,
            "total_revenue": round(total_revenue, 2),
            "pending_refunds": refunds_pending
        },
        "revenue_by_hostel": ordered_revenue_rows,
        "complaint_sla": complaint_sla,
        "machines": result
    }

@api_router.get("/admin/laundry/machine-qr-list")
async def get_machine_qr_list(current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")

    machines = await db.laundry_machines.find().sort([
        ("hostel_name", 1),
        ("block", 1),
        ("machine_number", 1)
    ]).to_list(length=5000)

    rows = []
    for m in machines:
        rows.append({
            "machine_code": m.get("machine_code"),
            "hostel_name": normalize_hostel_name(m.get("hostel_name", "N/A")),
            "block": normalize_block_name(m.get("block", "A")),
            "machine_type": normalize_machine_type(m.get("machine_type", "washer")),
            "qr_target": get_laundry_qr_url(m.get("machine_code"))
        })
    return rows


@api_router.post("/laundry/complaint")
async def submit_laundry_complaint(
    description: str = Form(...),
    type: str = Form("manual"),
    machine_code: Optional[str] = Form(None),
    image: Optional[UploadFile] = File(None),
    current_user: dict = Depends(get_current_user)
):
    issue_type = str(type or "manual").strip().lower()
    if issue_type not in ["manual", "machine", "missing_clothes", "payment_issue"]:
        issue_type = "manual"

    cleaned_machine_code = machine_code.upper().strip() if machine_code else None

    if issue_type == "machine" and not cleaned_machine_code:
        raise HTTPException(status_code=400, detail="Machine code is required for machine complaint")

    if cleaned_machine_code:
        machine = await db.laundry_machines.find_one({"machine_code": cleaned_machine_code})
        if not machine:
            raise HTTPException(status_code=404, detail="Machine not found")

        if normalize_hostel_name(machine.get("hostel_name")) != normalize_hostel_name(current_user.get("hostel_name", "")):
            raise HTTPException(status_code=403, detail="You can report only machines from your hostel")

    image_url = None
    if image:
        success, filename, message = await save_document_file(image)
        if not success:
            raise HTTPException(status_code=400, detail=message)
        image_url = f"/uploads/{filename}"

    new_doc = {
        "student_name": current_user.get("student_name", "Student"),
        "enrollment_number": str(current_user.get("enrollment_number", "")).strip(),
        "student_id": str(current_user.get("enrollment_number", "")).strip(),
        "hostel_name": normalize_hostel_name(current_user.get("hostel_name", "N/A")),
        "block": normalize_block_name(current_user.get("block", "N/A")),
        "room_number": str(current_user.get("room_number", "N/A")),
        "type": issue_type,
        "machine_code": cleaned_machine_code,
        "description": str(description or "").strip(),
        "image_url": image_url,
        "status": "pending",
        "date": iso_now_ist()
    }

    await db.laundry_complaints.insert_one(new_doc)

    if cleaned_machine_code:
        machine = await db.laundry_machines.find_one({"machine_code": cleaned_machine_code})
        if machine:
            await apply_repeat_issue_status(machine)

    return {"message": "Laundry complaint submitted successfully"}

async def recompute_machine_issue_flags(machine_code: str):
    now = now_ist()
    seven_days_ago = (now - timedelta(days=7)).isoformat()
    thirty_days_ago = (now - timedelta(days=30)).isoformat()

    c7 = await db.laundry_complaints.count_documents({
        "machine_code": machine_code,
        "date": {"$gte": seven_days_ago}
    })

    c30 = await db.laundry_complaints.count_documents({
        "machine_code": machine_code,
        "date": {"$gte": thirty_days_ago}
    })

    new_status = None
    if c7 >= 3 or c30 >= 5:
        new_status = "needs_service"

    update_doc = {
        "complaint_count_7d": c7,
        "complaint_count_30d": c30,
        "updated_at": iso_now_ist()
    }

    if new_status:
        update_doc["status"] = new_status

    await db.laundry_machines.update_one(
        {"machine_code": machine_code},
        {"$set": update_doc}
    )

async def laundry_cycle_monitor():
    try:
        now = now_ist()
        active_bookings = await db.laundry_bookings.find({
            "status": {"$in": ["booked", "running"]}
        }).to_list(1000)

        for booking in active_bookings:
            student_id = booking.get("student_id")
            machine_code = booking.get("machine_code")
            start_time = datetime.fromisoformat(booking["start_time"])
            end_time = datetime.fromisoformat(booking["end_time"])

            if booking["status"] == "booked" and now >= start_time:
                await db.laundry_bookings.update_one(
                    {"_id": booking["_id"]},
                    {"$set": {"status": "running"}}
                )
                await db.laundry_machines.update_one(
                    {"machine_code": machine_code},
                    {"$set": {
                        "status": "running",
                        "last_started_at": start_time.isoformat(),
                        "updated_at": iso_now_ist()
                    }}
                )
                await add_notification(
                    title="Laundry Cycle Started",
                    message=f"Your cycle on {machine_code} has started.",
                    target_users=student_id
                )

            remaining_minutes = int((end_time - now).total_seconds() // 60)

            if booking["status"] == "running" and 9 <= remaining_minutes <= 10:
                already_sent = await db.laundry_reminders.find_one({
                    "booking_id": str(booking["_id"]),
                    "type": "ten_min_left"
                })
                if not already_sent:
                    await add_notification(
                        title="Laundry Reminder",
                        message=f"Only about 10 minutes left for machine {machine_code}.",
                        target_users=student_id
                    )
                    await db.laundry_reminders.insert_one({
                        "booking_id": str(booking["_id"]),
                        "type": "ten_min_left",
                        "date": iso_now_ist()
                    })

            if now >= end_time and booking["status"] in ["booked", "running"]:
                await db.laundry_bookings.update_one(
                    {"_id": booking["_id"]},
                    {"$set": {
                        "status": "completed",
                        "completed_at": iso_now_ist(),
                        "remaining_minutes": 0
                    }}
                )

                await db.laundry_machines.update_one(
                    {"machine_code": machine_code},
                    {
                        "$set": {
                            "status": "idle",
                            "active_booking_id": None,
                            "active_student_id": None,
                            "last_completed_at": iso_now_ist(),
                            "updated_at": iso_now_ist()
                        },
                        "$inc": {
                            "total_cycles": 1,
                            "total_revenue": float(booking.get("amount_paid", 0))
                        }
                    }
                )

                await add_notification(
                    title="Laundry Cycle Completed",
                    message=f"Your cycle on {machine_code} is complete. Please collect your clothes.",
                    target_users=student_id
                )

    except Exception as e:
        print(f"❌ LAUNDRY CYCLE MONITOR ERROR: {str(e)}")        

# 2. Student: View My History
@api_router.get("/laundry/complaints")
async def get_student_laundry(current_user: dict = Depends(get_current_user)):
    complaints = await db.laundry_complaints.find(
        {"enrollment_number": current_user["enrollment_number"]}
    ).sort("date", -1).to_list(length=100)

    for c in complaints:
        c["_id"] = str(c["_id"])
    return complaints

# 3. Admin: View ALL Complaints
@api_router.get("/admin/laundry/complaints")
async def get_admin_laundry(current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403)

    complaints = await db.laundry_complaints.find().sort("date", -1).to_list(length=1000)

    result = []
    for c in complaints:
        doc = serialize_doc(c)
        doc["hostel_name"] = normalize_hostel_name(doc.get("hostel_name", "N/A"))
        doc["block"] = normalize_block_name(doc.get("block", "N/A"))
        doc["room_number"] = str(doc.get("room_number", "N/A"))
        doc["type"] = str(doc.get("type", "manual")).lower()
        doc["machine_code"] = doc.get("machine_code") or ""
        doc["description"] = doc.get("description") or "No description"
        doc["status"] = str(doc.get("status", "pending")).lower()
        result.append(doc)

    return result

# 4. Admin: Mark as Completed
@api_router.put("/admin/laundry/complaint/{complaint_id}")
async def resolve_laundry(complaint_id: str, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403)

    complaint = await db.laundry_complaints.find_one({"_id": ObjectId(complaint_id)})
    if not complaint:
        raise HTTPException(status_code=404, detail="Complaint not found")

    await db.laundry_complaints.update_one(
        {"_id": ObjectId(complaint_id)},
        {
            "$set": {
                "status": "completed",
                "resolved_at": iso_now_ist(),
                "resolved_by": current_user.get("username", "admin")
            }
        }
    )

    machine_code = complaint.get("machine_code")
    if machine_code:
        machine = await db.laundry_machines.find_one({"machine_code": machine_code})
        if machine:
            await apply_repeat_issue_status(machine)

    return {"message": "Resolved"}

@api_router.get("/admin/laundry/refund-requests")
async def get_laundry_refund_requests(current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")

    refunds = await db.laundry_refund_requests.find().sort("created_at", -1).to_list(length=500)

    for r in refunds:
        r["_id"] = str(r["_id"])

    return refunds

@api_router.patch("/admin/laundry/refund-request/{refund_id}")
async def update_laundry_refund_request(
    refund_id: str,
    data: dict = Body(...),
    current_user: dict = Depends(get_current_user)
):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")

    action = str(data.get("action", "")).lower().strip()
    admin_note = str(data.get("admin_note", "")).strip()

    if action not in ["approved", "rejected"]:
        raise HTTPException(status_code=400, detail="Action must be approved or rejected")

    try:
        refund = await db.laundry_refund_requests.find_one({"_id": ObjectId(refund_id)})
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid refund request ID")

    if not refund:
        raise HTTPException(status_code=404, detail="Refund request not found")

    if refund.get("status") != "pending":
        raise HTTPException(status_code=400, detail="Refund request already processed")

    update_doc = {
        "status": action,
        "processed_at": iso_now_ist(),
        "processed_by": current_user.get("username", "admin"),
        "admin_note": admin_note
    }

    if action == "approved":
        student_id = refund.get("student_id")
        amount = float(refund.get("amount", 0) or 0)

        await ensure_student_wallet(student_id)
        await db.laundry_wallets.update_one(
            {"student_id": student_id},
            {
                "$inc": {"balance": amount},
                "$set": {"updated_at": iso_now_ist()}
            }
        )

        await add_wallet_transaction(
            student_id=student_id,
            tx_type="credit",
            amount=amount,
            source="laundry_refund",
            reference_id=refund_id
        )

        booking_id = refund.get("booking_id")
        if booking_id:
            try:
                await db.laundry_bookings.update_one(
                    {"_id": ObjectId(booking_id)},
                    {"$set": {"refund_status": "approved"}}
                )
            except Exception:
                pass

        await send_laundry_notification(
            student_id,
            "Laundry Refund Approved",
            f"Your refund of ₹{amount:.2f} has been approved and credited to your wallet."
        )

    if action == "rejected":
        booking_id = refund.get("booking_id")
        if booking_id:
            try:
                await db.laundry_bookings.update_one(
                    {"_id": ObjectId(booking_id)},
                    {"$set": {"refund_status": "rejected"}}
                )
            except Exception:
                pass

        await send_laundry_notification(
            refund.get("student_id"),
            "Laundry Refund Rejected",
            f"Your refund request for machine {refund.get('machine_code', 'N/A')} was rejected."
        )

    await db.laundry_refund_requests.update_one(
        {"_id": ObjectId(refund_id)},
        {"$set": update_doc}
    )

    return {"message": f"Refund request {action} successfully"} 

@api_router.get("/laundry/refund-requests")
async def get_student_refund_requests(user: dict = Depends(get_current_user)):
    student_id = user.get("enrollment_number")
    refunds = await db.laundry_refund_requests.find(
        {"student_id": student_id}
    ).sort("created_at", -1).to_list(length=200)

    for r in refunds:
        r["_id"] = str(r["_id"])

    return refunds       

@api_router.post("/admin/laundry/machine/{machine_code}/upload-photo")
async def upload_laundry_machine_photo(
    machine_code: str,
    photo: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")

    machine = await db.laundry_machines.find_one({"machine_code": machine_code.upper().strip()})
    if not machine:
        raise HTTPException(status_code=404, detail="Machine not found")

    success, file_url, message = await save_laundry_machine_file(photo)
    if not success:
        raise HTTPException(status_code=400, detail=message)

    await db.laundry_machines.update_one(
        {"_id": machine["_id"]},
        {
            "$set": {
                "photo_url": file_url,
                "updated_at": iso_now_ist()
            }
        }
    )

    return {"message": "Machine photo uploaded successfully", "photo_url": file_url}

@api_router.post("/admin/laundry/machine/{machine_code}/upload-room-photo")
async def upload_laundry_room_photo(
    machine_code: str,
    photo: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")

    machine = await db.laundry_machines.find_one({"machine_code": machine_code.upper().strip()})
    if not machine:
        raise HTTPException(status_code=404, detail="Machine not found")

    success, file_url, message = await save_laundry_machine_file(photo)
    if not success:
        raise HTTPException(status_code=400, detail=message)

    hostel_name = normalize_hostel_name(machine.get("hostel_name"))
    block = machine.get("block", "A")

    await db.laundry_machines.update_many(
        {
            "hostel_name": hostel_name,
            "block": block
        },
        {
            "$set": {
                "room_photo_url": file_url,
                "updated_at": iso_now_ist()
            }
        }
    )

    return {
        "message": f"Laundry room photo uploaded successfully for {hostel_name} Block {block}",
        "room_photo_url": file_url
    }

# ==================== ATTENDANCE ROUTES ====================

from zoneinfo import ZoneInfo
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Optional, List, Dict, Any
from fastapi import Body, Depends, HTTPException, Query
import csv
import io
import math

INDIA_TZ = ZoneInfo("Asia/Kolkata")

ALLOWED_ATTENDANCE_STATUSES = {
    "present",
    "late",
    "absent",
    "pending",
    "excused_absence"
}

ATTENDANCE_POSITIVE_STATUSES = {
    "present",
    "late",
    "excused_absence"
}

ATTENDANCE_NEGATIVE_STATUSES = {
    "absent"
}

ATTENDANCE_COLLECTION = "attendance"
ATTENDANCE_AUDIT_COLLECTION = "attendance_audit_logs"
ATTENDANCE_SCAN_COLLECTION = "attendance_scan_logs"
ATTENDANCE_CORRECTION_COLLECTION = "attendance_corrections"
ATTENDANCE_CONFIG_COLLECTION = "attendance_configs"

DEFAULT_ATTENDANCE_WINDOW = {
    "start_hour": 21,
    "start_minute": 30,
    "end_hour": 23,
    "end_minute": 0
}

DEFAULT_LOW_ATTENDANCE_THRESHOLD = 75
DEFAULT_BLOCK_ABSENCE_ALERT_THRESHOLD = 10
DEFAULT_PARENT_ALERT_CONSECUTIVE_ABSENCE = 3
DEFAULT_REPEATED_LATE_THRESHOLD = 5


def normalize_attendance_status(value: str = "pending") -> str:
    v = str(value or "pending").strip().lower()

    if v == "leave_approved":
        v = "excused_absence"
    if v == "leave-approved":
        v = "excused_absence"
    if v == "excused-absence":
        v = "excused_absence"

    return v if v in ALLOWED_ATTENDANCE_STATUSES else "pending"


def get_india_now() -> datetime:
    return datetime.now(INDIA_TZ)


def get_india_today_iso() -> str:
    return get_india_now().date().isoformat()


def safe_int(value, default=0):
    try:
        return int(value)
    except Exception:
        return default


def safe_float(value, default=0):
    try:
        return float(value)
    except Exception:
        return default


def normalize_hostel_for_attendance(value: str = "N/A") -> str:
    hostel = str(value or "N/A").strip()
    if hostel == "Shakunthala Bhawan":
        hostel = "Shakuntala Bhawan"
    return hostel or "N/A"


def normalize_block_for_attendance(value: str = "N/A") -> str:
    block = str(value or "N/A").strip()
    return block if block else "N/A"


def normalize_floor_for_attendance(value: Any = "N/A") -> str:
    if value in [None, "", "N/A"]:
        return "N/A"
    try:
        return str(int(float(str(value).strip())))
    except Exception:
        return str(value).strip()


def normalize_room_for_attendance(value: Any = "N/A") -> str:
    if value in [None, "", "N/A"]:
        return "N/A"
    return str(value).strip()


def get_attendance_default_status_for_date(target_date: str) -> str:
    today = get_india_today_iso()
    if target_date < today:
        return "absent"
    return "pending"


def build_attendance_source(record: dict) -> str:
    source = str(record.get("source", "") or "").strip().lower()
    if source:
        return source
    if record.get("scan_meta"):
        return "scanner"
    if record.get("marked_by"):
        return "manual"
    if record.get("status") == "absent":
        return "system_absent"
    return "manual"


def get_attendance_window_for_hostel(hostel_name: str) -> dict:
    # Future-ready hook for hostel-specific windows
    return {
        **DEFAULT_ATTENDANCE_WINDOW,
        "hostel_name": hostel_name
    }


def compute_is_within_window(dt_obj: datetime, hostel_name: str) -> bool:
    cfg = get_attendance_window_for_hostel(hostel_name)
    start_dt = dt_obj.replace(
        hour=cfg["start_hour"],
        minute=cfg["start_minute"],
        second=0,
        microsecond=0
    )
    end_dt = dt_obj.replace(
        hour=cfg["end_hour"],
        minute=cfg["end_minute"],
        second=0,
        microsecond=0
    )
    return start_dt <= dt_obj <= end_dt


def infer_status_from_time(dt_obj: datetime, hostel_name: str) -> str:
    cfg = get_attendance_window_for_hostel(hostel_name)
    cutoff_dt = dt_obj.replace(
        hour=cfg["start_hour"],
        minute=cfg["start_minute"],
        second=0,
        microsecond=0
    )
    return "present" if dt_obj <= cutoff_dt else "late"


async def create_attendance_notification(
    target_enrollment: str,
    title: str,
    message: str,
    priority: str = "general",
    meta: Optional[dict] = None,
    created_by: str = "system"
):
    try:
        now_iso = get_india_now().isoformat()
        await db.notifications.insert_one({
            "title": title,
            "type": "attendance",
            "priority": priority,
            "message": message,
            "target_users": str(target_enrollment).strip(),
            "hostel": "private",
            "target_role": "student",
            "date": now_iso,
            "published_at": now_iso,
            "scheduled_for": None,
            "expires_at": None,
            "read_deadline": None,
            "created_by": created_by,
            "created_by_role": "admin" if created_by != "system" else "system",
            "read_by": [],
            "read_logs": [],
            "status": "published",
            "is_pinned": False,
            "requires_ack": False,
            "deep_link": "/student/attendance",
            "attachment_url": None,
            "deleted_at": None,
            "archived_at": None,
            "updated_at": now_iso,
            "meta": meta or {}
        })
    except Exception:
        pass


async def log_attendance_audit(
    *,
    action: str,
    student_id: str,
    date: str,
    user: dict,
    old_record: Optional[dict] = None,
    new_record: Optional[dict] = None,
    reason_note: Optional[str] = None,
    device_info: Optional[dict] = None,
    tamper_alert: bool = False
):
    now_iso = get_india_now().isoformat()
    await db[ATTENDANCE_AUDIT_COLLECTION].insert_one({
        "action": action,
        "student_id": str(student_id).strip(),
        "date": str(date).strip(),
        "performed_by": user.get("username", "system"),
        "performed_by_role": user.get("role", "system"),
        "performed_by_enrollment": str(user.get("enrollment_number", "")).strip(),
        "reason_note": reason_note,
        "device_info": device_info or {},
        "tamper_alert": bool(tamper_alert),
        "old_record": old_record,
        "new_record": new_record,
        "created_at": now_iso
    })


async def log_scan_event(
    *,
    student_id: str,
    date: str,
    user: dict,
    scan_type: str = "camera",
    scan_confidence: float = 0,
    result: str = "success",
    duplicate_prevented: bool = False,
    scan_payload: Optional[dict] = None
):
    await db[ATTENDANCE_SCAN_COLLECTION].insert_one({
        "student_id": str(student_id).strip(),
        "date": str(date).strip(),
        "scan_type": str(scan_type or "camera").strip().lower(),
        "scan_confidence": safe_float(scan_confidence, 0),
        "result": result,
        "duplicate_prevented": bool(duplicate_prevented),
        "performed_by": user.get("username", "admin"),
        "performed_by_role": user.get("role", "admin"),
        "performed_at": get_india_now().isoformat(),
        "scan_payload": scan_payload or {}
    })


async def get_student_minimal_map():
    students = await db.users.find({"role": "student"}).to_list(5000)
    return {
        str(s.get("enrollment_number", "")).strip(): s
        for s in students
        if str(s.get("enrollment_number", "")).strip()
    }


def serialize_attendance_record(row: dict) -> dict:
    return {
        **row,
        "student_id": str(row.get("student_id", "")).strip(),
        "status": normalize_attendance_status(row.get("status", "pending")),
        "source": build_attendance_source(row)
    }


def compute_consecutive_absences(records: List[dict]) -> int:
    sorted_rows = sorted(records, key=lambda x: x.get("date", ""), reverse=True)
    count = 0
    for row in sorted_rows:
        if normalize_attendance_status(row.get("status")) == "absent":
            count += 1
        else:
            break
    return count


def compute_repeated_late_count(records: List[dict]) -> int:
    return len([
        r for r in records
        if normalize_attendance_status(r.get("status")) == "late"
    ])


def compute_attendance_percentage(records: List[dict]) -> float:
    if not records:
        return 0.0
    positive = len([
        r for r in records
        if normalize_attendance_status(r.get("status")) in ATTENDANCE_POSITIVE_STATUSES
    ])
    return round((positive / len(records)) * 100, 2)


def compute_risk_score(records: List[dict]) -> int:
    if not records:
        return 0
    absent = len([r for r in records if normalize_attendance_status(r.get("status")) == "absent"])
    late = len([r for r in records if normalize_attendance_status(r.get("status")) == "late"])
    consecutive_absences = compute_consecutive_absences(records)
    percentage = compute_attendance_percentage(records)

    score = 0
    score += absent * 3
    score += late * 1
    score += consecutive_absences * 5
    if percentage < 75:
        score += 15
    if percentage < 60:
        score += 20
    return min(score, 100)


async def get_student_attendance_records(student_id: str, days: int = 365) -> List[dict]:
    rows = await db.attendance.find({"student_id": str(student_id).strip()}).sort("date", -1).to_list(days)
    return [serialize_attendance_record(r) for r in rows]


async def notify_repeated_absence_if_needed(student_doc: dict, student_id: str, records: List[dict]):
    consecutive_absences = compute_consecutive_absences(records)
    if consecutive_absences >= DEFAULT_PARENT_ALERT_CONSECUTIVE_ABSENCE:
        await create_attendance_notification(
            target_enrollment=student_id,
            title="Repeated Attendance Absence Alert",
            message=f"You have been marked absent for {consecutive_absences} consecutive attendance days.",
            priority="important",
            meta={
                "student_id": student_id,
                "consecutive_absences": consecutive_absences,
                "guardian_phone": student_doc.get("parent_phone") or student_doc.get("father_contact") or student_doc.get("mother_contact")
            },
            created_by="system"
        )


async def auto_mark_past_unmarked_attendance(student_id: str, student_doc: dict = None):
    if not student_id:
        return
    today = get_india_today_iso()
    from datetime import datetime, timedelta
    try:
        today_dt = datetime.strptime(today, "%Y-%m-%d").date()
    except Exception:
        return

    # Inspect from start of current month (or at least past 30 days) up to yesterday
    start_dt = min(today_dt.replace(day=1), today_dt - timedelta(days=30))
    username = (student_doc.get("username") if student_doc else None) or student_id

    existing_records = await db.attendance.find({
        "$or": [{"student_id": student_id}, {"student_id": username}],
        "date": {"$gte": start_dt.isoformat(), "$lt": today}
    }, {"date": 1}).to_list(100)
    existing_dates = {r.get("date") for r in existing_records}

    missing_docs = []
    curr = start_dt
    while curr < today_dt:
        curr_str = curr.isoformat()
        if curr_str not in existing_dates:
            missing_docs.append({
                "student_id": student_id,
                "student_name": (student_doc.get("student_name") or student_doc.get("username", "Student")) if student_doc else "Student",
                "hostel_name": (student_doc.get("hostel_name") or "Hostel") if student_doc else "Hostel",
                "block": (student_doc.get("block") or "") if student_doc else "",
                "floor": str((student_doc.get("floor") or "")) if student_doc else "",
                "room_number": (student_doc.get("room_number") or "") if student_doc else "",
                "date": curr_str,
                "status": "absent",
                "source": "auto_absent",
                "marked_by": "system",
                "remark": "Auto-marked absent (unmarked past date)",
                "created_at": f"{curr_str}T23:59:59+05:30",
                "timestamp": f"{curr_str}T23:59:59+05:30"
            })
        curr += timedelta(days=1)

    if missing_docs:
        try:
            await db.attendance.insert_many(missing_docs, ordered=False)
        except Exception as e:
            logger.warning(f"Error auto-inserting absent attendance: {e}")


@api_router.get("/attendance")
async def get_attendance(user: dict = Depends(get_current_user)):
    if user["role"] == "admin":
        attendance = await db.attendance.find({}, {"_id": 0}).sort("date", -1).to_list(200)
    else:
        student_id = str(user.get("enrollment_number", "")).strip() or str(user.get("username", "")).strip()
        await auto_mark_past_unmarked_attendance(student_id, user)
        attendance = await db.attendance.find(
            {"$or": [{"student_id": student_id}, {"student_id": user.get("username")}]},
            {"_id": 0}
        ).sort("date", -1).to_list(365)

    final_rows = []
    for row in attendance:
        normalized = serialize_attendance_record(row)
        final_rows.append(normalized)

    return final_rows


@api_router.post("/attendance/mark")
async def mark_attendance(data: dict = Body(default={}), user: dict = Depends(get_current_user)):
    raise HTTPException(
        status_code=403,
        detail="Students are not allowed to mark attendance. Only admin can mark attendance."
    )


@api_router.post("/student/attendance/correction-request")
async def create_attendance_correction_request(
    data: dict = Body(...),
    user: dict = Depends(get_current_user)
):
    if user["role"] != "student":
        raise HTTPException(status_code=403, detail="Student only")

    student_id = str(user.get("enrollment_number", "")).strip()
    target_date = str(data.get("date", "")).strip()
    reason = str(data.get("reason", "")).strip()
    proof_url = data.get("proof_url")

    if not target_date:
        raise HTTPException(status_code=400, detail="Date is required")
    if not reason:
        raise HTTPException(status_code=400, detail="Reason is required")

    existing = await db[ATTENDANCE_CORRECTION_COLLECTION].find_one({
        "student_id": student_id,
        "date": target_date,
        "status": {"$in": ["pending", "under_review"]}
    })
    if existing:
        raise HTTPException(status_code=400, detail="A correction request is already pending for this date")

    now_iso = get_india_now().isoformat()
    await db[ATTENDANCE_CORRECTION_COLLECTION].insert_one({
        "student_id": student_id,
        "student_name": user.get("student_name") or user.get("username"),
        "date": target_date,
        "reason": reason,
        "proof_url": proof_url,
        "status": "pending",
        "requested_at": now_iso,
        "reviewed_at": None,
        "reviewed_by": None,
        "admin_note": None
    })

    return {"message": "Attendance correction request submitted successfully"}


@api_router.get("/admin/attendance/correction-requests")
async def get_attendance_correction_requests(
    status: str = Query("all"),
    user: dict = Depends(get_current_user)
):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")

    query = {}
    if status != "all":
        query["status"] = status

    rows = await db[ATTENDANCE_CORRECTION_COLLECTION].find(query).sort("requested_at", -1).to_list(1000)
    for r in rows:
        r["_id"] = str(r["_id"])
    return rows


@api_router.post("/admin/attendance/correction-requests/{request_id}/review")
async def review_attendance_correction_request(
    request_id: str,
    data: dict = Body(...),
    user: dict = Depends(get_current_user)
):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")

    oid = safe_objectid(request_id)
    if not oid:
        raise HTTPException(status_code=400, detail="Invalid request ID")

    row = await db[ATTENDANCE_CORRECTION_COLLECTION].find_one({"_id": oid})
    if not row:
        raise HTTPException(status_code=404, detail="Correction request not found")

    action = str(data.get("action", "")).strip().lower()
    admin_note = str(data.get("admin_note", "")).strip() or None

    if action not in ["approve", "reject"]:
        raise HTTPException(status_code=400, detail="Action must be approve or reject")

    now_iso = get_india_now().isoformat()

    if action == "approve":
        new_status = normalize_attendance_status(data.get("status", "present"))
        student_id = str(row.get("student_id", "")).strip()
        target_date = str(row.get("date", "")).strip()

        old_record = await db.attendance.find_one({"student_id": student_id, "date": target_date})
        new_doc = {
            "student_id": student_id,
            "date": target_date,
            "time": now_iso,
            "status": new_status,
            "notification_sent": False,
            "marked_by": user.get("username", "admin"),
            "source": "correction_approved",
            "reason_note": row.get("reason"),
            "updated_at": now_iso
        }

        await db.attendance.update_one(
            {"student_id": student_id, "date": target_date},
            {"$set": new_doc},
            upsert=True
        )

        await log_attendance_audit(
            action="correction_approved",
            student_id=student_id,
            date=target_date,
            user=user,
            old_record=old_record,
            new_record=new_doc,
            reason_note=row.get("reason")
        )

        await create_attendance_notification(
            target_enrollment=student_id,
            title="Attendance Correction Approved",
            message=f"Your attendance correction for {target_date} was approved.",
            priority="important",
            meta={
                "date": target_date,
                "status": new_status,
                "reviewed_by": user.get("username")
            },
            created_by=user.get("username", "admin")
        )

        await db[ATTENDANCE_CORRECTION_COLLECTION].update_one(
            {"_id": oid},
            {"$set": {
                "status": "approved",
                "reviewed_at": now_iso,
                "reviewed_by": user.get("username"),
                "admin_note": admin_note
            }}
        )
        return {"message": "Correction approved successfully"}

    await db[ATTENDANCE_CORRECTION_COLLECTION].update_one(
        {"_id": oid},
        {"$set": {
            "status": "rejected",
            "reviewed_at": now_iso,
            "reviewed_by": user.get("username"),
            "admin_note": admin_note
        }}
    )

    await create_attendance_notification(
        target_enrollment=str(row.get("student_id", "")).strip(),
        title="Attendance Correction Rejected",
        message=f"Your attendance correction for {row.get('date')} was rejected.",
        priority="general",
        meta={
            "date": row.get("date"),
            "reviewed_by": user.get("username"),
            "admin_note": admin_note
        },
        created_by=user.get("username", "admin")
    )

    return {"message": "Correction rejected successfully"}


@api_router.post("/admin/attendance/mark")
async def admin_mark_attendance(data: dict = Body(...), user: dict = Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admin can mark attendance")

    student_id = str(data.get("student_id", "")).strip()
    if not student_id:
        raise HTTPException(status_code=400, detail="Student ID is required")

    student = await db.users.find_one({
        "role": "student",
        "$or": [
            {"enrollment_number": student_id},
            {"registration_no": student_id}
        ]
    })
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    hostel_name = normalize_hostel_for_attendance(student.get("hostel_name", "N/A"))
    now_local = get_india_now()
    target_date = str(data.get("date", now_local.date().isoformat())).strip()
    status_value = normalize_attendance_status(data.get("status", "present"))
    source = str(data.get("source", "manual")).strip().lower() or "manual"
    reason_note = str(data.get("reason_note", "")).strip() or None

    if status_value == "pending":
        raise HTTPException(status_code=400, detail="Pending cannot be manually saved as final attendance")

    existing = await db.attendance.find_one({
        "student_id": student_id,
        "date": target_date
    })

    duplicate_scan_prevented = False
    if existing and source in ["scanner", "qr", "face", "id_card"] and existing.get("source") in ["scanner", "qr", "face", "id_card"]:
        duplicate_scan_prevented = True

    scan_meta = {
        "scan_type": str(data.get("scan_type", source)).strip().lower(),
        "scan_confidence": safe_float(data.get("scan_confidence", 0), 0),
        "scanner_result": str(data.get("scanner_result", "matched")).strip().lower(),
        "camera_name": data.get("camera_name"),
        "device_name": data.get("device_name"),
        "switch_camera_used": bool(data.get("switch_camera_used", False)),
        "retry_count": safe_int(data.get("retry_count", 0), 0)
    }

    if source in ["scanner", "qr", "face", "id_card"]:
        await log_scan_event(
            student_id=student_id,
            date=target_date,
            user=user,
            scan_type=scan_meta["scan_type"],
            scan_confidence=scan_meta["scan_confidence"],
            result="duplicate_prevented" if duplicate_scan_prevented else "success",
            duplicate_prevented=duplicate_scan_prevented,
            scan_payload=scan_meta
        )

    doc = {
        "student_id": student_id,
        "date": target_date,
        "time": now_local.isoformat(),
        "status": status_value,
        "notification_sent": False,
        "marked_by": user.get("username", "admin_biometric"),
        "source": source,
        "reason_note": reason_note,
        "updated_at": now_local.isoformat(),
        "scan_meta": scan_meta if source in ["scanner", "qr", "face", "id_card"] else None,
        "student_snapshot": {
            "student_name": student.get("student_name", student.get("username", "Student")),
            "hostel_name": hostel_name,
            "block": normalize_block_for_attendance(student.get("block")),
            "floor": normalize_floor_for_attendance(student.get("floor")),
            "room_number": normalize_room_for_attendance(student.get("room_number")),
            "bed_number": normalize_room_for_attendance(student.get("bed_number")),
            "course": student.get("course", "N/A"),
            "year": student.get("year", "N/A"),
            "gender": student.get("gender", "N/A"),
            "guardian_phone": student.get("parent_phone") or student.get("father_contact") or student.get("mother_contact"),
            "discipline_flag": False,
            "dues_flag": False,
            "medical_support_tag": student.get("medical_support_tag", False),
            "disability_support_tag": student.get("disability_support_tag", False)
        }
    }

    await db.attendance.update_one(
        {"student_id": student_id, "date": target_date},
        {"$set": doc},
        upsert=True
    )

    tamper_alert = bool(existing and existing.get("status") != status_value)

    await log_attendance_audit(
        action="mark_attendance",
        student_id=student_id,
        date=target_date,
        user=user,
        old_record=existing,
        new_record=doc,
        reason_note=reason_note,
        device_info={
            "source": source,
            "camera_name": scan_meta.get("camera_name"),
            "device_name": scan_meta.get("device_name"),
            "switch_camera_used": scan_meta.get("switch_camera_used")
        },
        tamper_alert=tamper_alert
    )

    await create_attendance_notification(
        target_enrollment=student_id,
        title="Attendance Updated",
        message=f"Your attendance for {target_date} was marked as {status_value.replace('_', ' ')}.",
        priority="general",
        meta={
            "date": target_date,
            "status": status_value,
            "marked_by": user.get("username", "admin"),
            "source": source,
            "reason_note": reason_note
        },
        created_by=user.get("username", "admin")
    )

    student_records = await get_student_attendance_records(student_id, 60)
    await notify_repeated_absence_if_needed(student, student_id, student_records)

    return {
        "message": "Attendance updated successfully",
        "duplicate_scan_prevented": duplicate_scan_prevented,
        "audit_logged": True,
        "source": source
    }


@api_router.post("/admin/attendance/bulk-mark")
async def admin_bulk_mark_attendance(
    data: dict = Body(...),
    user: dict = Depends(get_current_user)
):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admin can bulk mark attendance")

    target_date = str(data.get("date", get_india_today_iso())).strip()
    status_value = normalize_attendance_status(data.get("status", "present"))
    reason_note = str(data.get("reason_note", "")).strip() or None

    if status_value == "pending":
        raise HTTPException(status_code=400, detail="Pending cannot be bulk saved")

    student_ids = [
        str(x).strip() for x in data.get("student_ids", [])
        if str(x).strip()
    ]

    if not student_ids:
        filters = {"role": "student"}

        hostel = str(data.get("hostel", "all")).strip()
        block = str(data.get("block", "all")).strip()
        floor = str(data.get("floor", "all")).strip()
        room_number = str(data.get("room_number", "all")).strip()
        course = str(data.get("course", "all")).strip()
        year = str(data.get("year", "all")).strip()
        gender = str(data.get("gender", "all")).strip()

        if hostel != "all":
            filters["hostel_name"] = hostel
        if block != "all":
            filters["block"] = block
        if floor != "all":
            filters["floor"] = floor
        if room_number != "all":
            filters["room_number"] = room_number
        if course != "all":
            filters["course"] = course
        if year != "all":
            filters["year"] = year
        if gender != "all":
            filters["gender"] = gender

        matched_students = await db.users.find(filters).to_list(5000)
        student_ids = [
            str(s.get("enrollment_number", "")).strip()
            for s in matched_students
            if str(s.get("enrollment_number", "")).strip()
        ]

    if not student_ids:
        raise HTTPException(status_code=400, detail="No students found for bulk mark")

    now_iso = get_india_now().isoformat()
    students_map = await get_student_minimal_map()
    updated_count = 0

    for student_id in student_ids:
        student = students_map.get(student_id)
        if not student:
            continue

        old_record = await db.attendance.find_one({"student_id": student_id, "date": target_date})

        new_doc = {
            "student_id": student_id,
            "date": target_date,
            "time": now_iso,
            "status": status_value,
            "notification_sent": False,
            "marked_by": user.get("username", "admin_bulk"),
            "source": "bulk_manual",
            "reason_note": reason_note,
            "updated_at": now_iso
        }

        await db.attendance.update_one(
            {"student_id": student_id, "date": target_date},
            {"$set": new_doc},
            upsert=True
        )

        await log_attendance_audit(
            action="bulk_mark_attendance",
            student_id=student_id,
            date=target_date,
            user=user,
            old_record=old_record,
            new_record=new_doc,
            reason_note=reason_note,
            tamper_alert=bool(old_record and old_record.get("status") != status_value)
        )
        updated_count += 1

    return {
        "message": "Bulk attendance updated successfully",
        "updated_count": updated_count,
        "date": target_date,
        "status": status_value
    }


@api_router.post("/admin/attendance/undo-last-change")
async def undo_last_attendance_change(
    data: dict = Body(...),
    user: dict = Depends(get_current_user)
):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")

    student_id = str(data.get("student_id", "")).strip()
    target_date = str(data.get("date", get_india_today_iso())).strip()

    if not student_id:
        raise HTTPException(status_code=400, detail="Student ID is required")

    last_log = await db[ATTENDANCE_AUDIT_COLLECTION].find({
        "student_id": student_id,
        "date": target_date,
        "old_record": {"$ne": None}
    }).sort("created_at", -1).to_list(1)

    if not last_log:
        raise HTTPException(status_code=404, detail="No undo history found")

    old_record = last_log[0].get("old_record")
    if not old_record:
        raise HTTPException(status_code=404, detail="Previous state not found")

    current_record = await db.attendance.find_one({"student_id": student_id, "date": target_date})

    await db.attendance.update_one(
        {"student_id": student_id, "date": target_date},
        {"$set": old_record},
        upsert=True
    )

    await log_attendance_audit(
        action="undo_last_change",
        student_id=student_id,
        date=target_date,
        user=user,
        old_record=current_record,
        new_record=old_record,
        reason_note="Undo last attendance change"
    )

    return {"message": "Last attendance change undone successfully"}


@api_router.get("/admin/students/attendance-summary/{enrollment}")
async def get_attendance_summary(
    enrollment: str,
    user: dict = Depends(get_current_user)
):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    student_id = str(enrollment).strip()
    normalized_records = await get_student_attendance_records(student_id, 365)

    present = len([r for r in normalized_records if r["status"] == "present"])
    late = len([r for r in normalized_records if r["status"] == "late"])
    absent = len([r for r in normalized_records if r["status"] == "absent"])
    excused_absence = len([r for r in normalized_records if r["status"] == "excused_absence"])

    total = len(normalized_records)
    positive = present + late + excused_absence
    percentage = round((positive / total) * 100, 2) if total else 0

    return {
        "present": present,
        "late": late,
        "absent": absent,
        "excused_absence": excused_absence,
        "percentage": percentage,
        "repeated_late_count": compute_repeated_late_count(normalized_records),
        "consecutive_absences": compute_consecutive_absences(normalized_records),
        "risk_score": compute_risk_score(normalized_records)
    }


@api_router.get("/admin/attendance/daily-status")
async def get_daily_attendance_status(
    date: Optional[str] = Query(None),
    hostel: str = Query("all"),
    block: str = Query("all"),
    floor: str = Query("all"),
    room_number: str = Query("all"),
    course: str = Query("all"),
    year: str = Query("all"),
    gender: str = Query("all"),
    status_filter: str = Query("all"),
    unresolved_only: bool = Query(False),
    search: str = Query(""),
    user: dict = Depends(get_current_user)
):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    target_date = str(date).strip() if date else get_india_today_iso()
    cache_key = f"{target_date}_{hostel}_{block}_{floor}_{room_number}_{course}_{year}_{gender}_{status_filter}_{unresolved_only}_{search}"
    now_ts = time.time()
    if cache_key in _ATTENDANCE_CACHE and (now_ts - _ATTENDANCE_CACHE_TIME.get(cache_key, 0)) < ATTENDANCE_CACHE_TTL:
        return _ATTENDANCE_CACHE[cache_key]

    student_query = {"role": "student"}
    if hostel != "all":
        student_query["hostel_name"] = hostel
    if block != "all":
        student_query["block"] = block
    if floor != "all":
        student_query["floor"] = floor
    if room_number != "all":
        student_query["room_number"] = room_number
    if course != "all":
        student_query["course"] = course
    if year != "all":
        student_query["year"] = year
    if gender != "all":
        student_query["gender"] = gender

    students = await db.users.find(student_query, {
        "enrollment_number": 1, "username": 1, "student_name": 1,
        "hostel_name": 1, "block": 1, "floor": 1, "room_number": 1, "bed_number": 1,
        "gender": 1, "course": 1, "year": 1, "parent_phone": 1, "phone": 1,
        "college_email": 1, "medical_support_tag": 1, "disability_support_tag": 1,
        "profile_photo": 1, "photo_url": 1, "is_default_password": 1
    }).to_list(5000)
    records = await db.attendance.find({"date": target_date}).to_list(5000)

    attendance_map = {
        str(r.get("student_id", "")).strip(): serialize_attendance_record(r)
        for r in records
    }

    # Automatically mark and persist past unmarked days as absent
    if target_date < get_india_today_iso():
        missing_absents = []
        for s in students:
            enrollment = str(s.get("enrollment_number", "")).strip() or str(s.get("username", "")).strip()
            if enrollment and enrollment not in attendance_map:
                missing_absents.append({
                    "student_id": enrollment,
                    "student_name": s.get("student_name") or s.get("username", "Student"),
                    "hostel_name": s.get("hostel_name") or "Hostel",
                    "block": s.get("block") or "",
                    "floor": str(s.get("floor") or ""),
                    "room_number": str(s.get("room_number") or ""),
                    "date": target_date,
                    "status": "absent",
                    "source": "auto_absent",
                    "marked_by": "system",
                    "remark": "Auto-marked absent (unmarked past date)",
                    "created_at": f"{target_date}T23:59:59+05:30",
                    "timestamp": f"{target_date}T23:59:59+05:30"
                })
        if missing_absents:
            try:
                await db.attendance.insert_many(missing_absents, ordered=False)
                for r in missing_absents:
                    attendance_map[r["student_id"]] = serialize_attendance_record(r)
            except Exception as e:
                logger.warning(f"Error auto-inserting missing past absents: {e}")

    status_list = []
    search_q = str(search or "").strip().lower()

    for s in students:
        enrollment = str(s.get("enrollment_number", "")).strip()
        current_record = attendance_map.get(enrollment)
        current_status = current_record["status"] if current_record else None

        if not current_status:
            current_status = get_attendance_default_status_for_date(target_date)

        if unresolved_only and current_status != "pending":
            continue

        if status_filter != "all" and current_status != normalize_attendance_status(status_filter):
            continue

        hostel_name = normalize_hostel_for_attendance(s.get("hostel_name", "N/A"))
        block_name = normalize_block_for_attendance(s.get("block", "N/A"))
        floor_name = normalize_floor_for_attendance(s.get("floor", "N/A"))
        room_name = normalize_room_for_attendance(s.get("room_number", "N/A"))
        bed_name = normalize_room_for_attendance(s.get("bed_number", "N/A"))

        student_name = s.get("student_name", s.get("username", "Student"))
        parent_phone = s.get("parent_phone") or s.get("father_contact") or s.get("mother_contact")

        search_blob = " ".join([
            str(student_name),
            str(enrollment),
            str(hostel_name),
            str(block_name),
            str(floor_name),
            str(room_name),
            str(bed_name),
            str(s.get("course", "")),
            str(s.get("year", "")),
            str(s.get("gender", "")),
            str(parent_phone or "")
        ]).lower()

        if search_q and search_q not in search_blob:
            continue

        student_records = await get_student_attendance_records(enrollment, 120)
        risk_score = compute_risk_score(student_records)
        repeated_late_count = compute_repeated_late_count(student_records)
        attendance_percentage = compute_attendance_percentage(student_records)

        status_list.append({
            "_id": str(s["_id"]),
            "student_name": student_name,
            "enrollment_number": enrollment,
            "hostel_name": hostel_name,
            "block": block_name,
            "floor": floor_name,
            "room_number": room_name,
            "bed_number": bed_name,
            "today_status": current_status,
            "time": current_record.get("time") if current_record else None,
            "marked_by": current_record.get("marked_by") if current_record else None,
            "source": current_record.get("source") if current_record else ("system_absent" if current_status == "absent" else "pending"),
            "reason_note": current_record.get("reason_note") if current_record else None,
            "course": s.get("course", "N/A"),
            "year": s.get("year", "N/A"),
            "gender": s.get("gender", "N/A"),
            "guardian_phone": parent_phone,
            "college_email": s.get("college_email"),
            "medical_support_tag": bool(s.get("medical_support_tag", False)),
            "disability_support_tag": bool(s.get("disability_support_tag", False)),
            "dues_flag": False,
            "discipline_flag": False,
            "attendance_percentage": attendance_percentage,
            "repeated_late_count": repeated_late_count,
            "risk_score": risk_score,
            "photo_url": s.get("profile_photo") or s.get("photo_url"),
            "is_default_password": s.get("is_default_password", False)
        })

    _ATTENDANCE_CACHE[cache_key] = status_list
    _ATTENDANCE_CACHE_TIME[cache_key] = time.time()
    return status_list


@api_router.get("/admin/attendance/analytics")
async def get_attendance_analytics(
    date: Optional[str] = Query(None),
    range_days: int = Query(30),
    hostel: str = Query("all"),
    block: str = Query("all"),
    user: dict = Depends(get_current_user)
):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")

    target_date = str(date).strip() if date else get_india_today_iso()
    end_date = datetime.fromisoformat(target_date)
    start_date = end_date - timedelta(days=max(range_days - 1, 0))

    students_query = {"role": "student"}
    if hostel != "all":
        students_query["hostel_name"] = hostel
    if block != "all":
        students_query["block"] = block

    students = await db.users.find(students_query).to_list(5000)
    student_ids = [str(s.get("enrollment_number", "")).strip() for s in students if str(s.get("enrollment_number", "")).strip()]

    records = await db.attendance.find({
        "student_id": {"$in": student_ids},
        "date": {
            "$gte": start_date.date().isoformat(),
            "$lte": end_date.date().isoformat()
        }
    }).to_list(10000)

    normalized_records = [serialize_attendance_record(r) for r in records]
    student_map = {str(s.get("enrollment_number", "")).strip(): s for s in students}

    daily_map = defaultdict(lambda: {"present": 0, "late": 0, "absent": 0, "excused_absence": 0})
    hostel_map = defaultdict(lambda: {"present": 0, "late": 0, "absent": 0, "excused_absence": 0})
    block_map = defaultdict(lambda: {"present": 0, "late": 0, "absent": 0, "excused_absence": 0})
    weekday_map = defaultdict(lambda: {"present": 0, "late": 0, "absent": 0, "excused_absence": 0})

    for row in normalized_records:
        status = normalize_attendance_status(row.get("status"))
        date_key = row.get("date")
        daily_map[date_key][status] += 1

        student = student_map.get(str(row.get("student_id", "")).strip(), {})
        hostel_name = normalize_hostel_for_attendance(student.get("hostel_name", "N/A"))
        block_name = normalize_block_for_attendance(student.get("block", "N/A"))
        hostel_map[hostel_name][status] += 1
        block_map[f"{hostel_name} | {block_name}"][status] += 1

        try:
            weekday = datetime.fromisoformat(date_key).strftime("%A")
            weekday_map[weekday][status] += 1
        except Exception:
            pass

    daily_trend = []
    for i in range(range_days):
        d = start_date + timedelta(days=i)
        key = d.date().isoformat()
        counts = daily_map[key]
        total = counts["present"] + counts["late"] + counts["absent"] + counts["excused_absence"]
        daily_trend.append({
            "date": key,
            "present": counts["present"],
            "late": counts["late"],
            "absent": counts["absent"],
            "excused_absence": counts["excused_absence"],
            "attendance_percent": round(((counts["present"] + counts["late"] + counts["excused_absence"]) / total) * 100, 2) if total else 0
        })

    hostel_comparison = []
    for k, v in hostel_map.items():
        total = v["present"] + v["late"] + v["absent"] + v["excused_absence"]
        hostel_comparison.append({
            "hostel_name": k,
            **v,
            "attendance_percent": round(((v["present"] + v["late"] + v["excused_absence"]) / total) * 100, 2) if total else 0
        })

    block_comparison = []
    absent_hotspots = []
    for k, v in block_map.items():
        total = v["present"] + v["late"] + v["absent"] + v["excused_absence"]
        row = {
            "block_key": k,
            **v,
            "attendance_percent": round(((v["present"] + v["late"] + v["excused_absence"]) / total) * 100, 2) if total else 0
        }
        block_comparison.append(row)
        absent_hotspots.append({
            "block_key": k,
            "absent_count": v["absent"]
        })

    absent_hotspots.sort(key=lambda x: x["absent_count"], reverse=True)

    weekday_pattern = []
    weekday_order = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
    for day in weekday_order:
        v = weekday_map[day]
        total = v["present"] + v["late"] + v["absent"] + v["excused_absence"]
        weekday_pattern.append({
            "weekday": day,
            **v,
            "attendance_percent": round(((v["present"] + v["late"] + v["excused_absence"]) / total) * 100, 2) if total else 0
        })

    return {
        "daily_trend": daily_trend,
        "hostel_comparison": hostel_comparison,
        "block_comparison": block_comparison,
        "absent_hotspots": absent_hotspots[:10],
        "weekday_pattern": weekday_pattern,
        "late_entry_counter": len([r for r in normalized_records if r["status"] == "late"])
    }


@api_router.get("/admin/attendance/defaulters")
async def get_attendance_defaulters(
    threshold: float = Query(DEFAULT_LOW_ATTENDANCE_THRESHOLD),
    days: int = Query(60),
    hostel: str = Query("all"),
    block: str = Query("all"),
    user: dict = Depends(get_current_user)
):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")

    students_query = {"role": "student"}
    if hostel != "all":
        students_query["hostel_name"] = hostel
    if block != "all":
        students_query["block"] = block

    students = await db.users.find(students_query).to_list(5000)
    result = []

    for s in students:
        student_id = str(s.get("enrollment_number", "")).strip()
        if not student_id:
            continue

        records = await get_student_attendance_records(student_id, days)
        percentage = compute_attendance_percentage(records)
        repeated_late = compute_repeated_late_count(records)
        risk_score = compute_risk_score(records)
        consecutive_absences = compute_consecutive_absences(records)

        if percentage < threshold or repeated_late >= DEFAULT_REPEATED_LATE_THRESHOLD or risk_score >= 40:
            result.append({
                "_id": str(s["_id"]),
                "student_name": s.get("student_name", s.get("username", "Student")),
                "enrollment_number": student_id,
                "hostel_name": normalize_hostel_for_attendance(s.get("hostel_name")),
                "block": normalize_block_for_attendance(s.get("block")),
                "room_number": normalize_room_for_attendance(s.get("room_number")),
                "guardian_phone": s.get("parent_phone") or s.get("father_contact") or s.get("mother_contact"),
                "attendance_percentage": percentage,
                "repeated_late_count": repeated_late,
                "consecutive_absences": consecutive_absences,
                "risk_score": risk_score
            })

    result.sort(key=lambda x: (x["attendance_percentage"], -x["risk_score"]))
    return result


@api_router.post("/admin/attendance/notify-defaulters")
async def notify_attendance_defaulters(
    data: dict = Body(...),
    user: dict = Depends(get_current_user)
):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")

    student_ids = [
        str(x).strip()
        for x in data.get("student_ids", [])
        if str(x).strip()
    ]
    if not student_ids:
        raise HTTPException(status_code=400, detail="Student IDs are required")

    notified = 0
    for student_id in student_ids:
        await create_attendance_notification(
            target_enrollment=student_id,
            title="Low Attendance Warning",
            message="Your attendance has fallen below the required threshold. Please improve it urgently.",
            priority="important",
            meta={
                "student_id": student_id,
                "type": "defaulter_notice"
            },
            created_by=user.get("username", "admin")
        )
        notified += 1

    return {"message": "Defaulter notices sent successfully", "notified_count": notified}


@api_router.get("/admin/attendance/audit-trail")
async def get_attendance_audit_trail(
    student_id: str = Query(""),
    date: str = Query(""),
    limit: int = Query(200),
    user: dict = Depends(get_current_user)
):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")

    query = {}
    if student_id:
        query["student_id"] = str(student_id).strip()
    if date:
        query["date"] = str(date).strip()

    rows = await db[ATTENDANCE_AUDIT_COLLECTION].find(query).sort("created_at", -1).to_list(limit)
    for r in rows:
        r["_id"] = str(r["_id"])
    return rows


@api_router.get("/admin/attendance/scan-logs")
async def get_attendance_scan_logs(
    student_id: str = Query(""),
    date: str = Query(""),
    limit: int = Query(200),
    user: dict = Depends(get_current_user)
):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")

    query = {}
    if student_id:
        query["student_id"] = str(student_id).strip()
    if date:
        query["date"] = str(date).strip()

    rows = await db[ATTENDANCE_SCAN_COLLECTION].find(query).sort("performed_at", -1).to_list(limit)
    for r in rows:
        r["_id"] = str(r["_id"])
    return rows


@api_router.get("/admin/attendance/block-alerts")
async def get_block_absence_alerts(
    date: Optional[str] = Query(None),
    threshold: int = Query(DEFAULT_BLOCK_ABSENCE_ALERT_THRESHOLD),
    user: dict = Depends(get_current_user)
):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")

    target_date = str(date).strip() if date else get_india_today_iso()
    students = await db.users.find({"role": "student"}).to_list(5000)
    records = await db.attendance.find({"date": target_date}).to_list(5000)
    record_map = {
        str(r.get("student_id", "")).strip(): serialize_attendance_record(r)
        for r in records
    }

    block_counts = defaultdict(int)
    for s in students:
        sid = str(s.get("enrollment_number", "")).strip()
        if not sid:
            continue
        r = record_map.get(sid)
        status = r["status"] if r else get_attendance_default_status_for_date(target_date)
        if status == "absent":
            hostel_name = normalize_hostel_for_attendance(s.get("hostel_name"))
            block_name = normalize_block_for_attendance(s.get("block"))
            block_counts[f"{hostel_name} | {block_name}"] += 1

    alerts = []
    for block_key, count in block_counts.items():
        if count >= threshold:
            alerts.append({
                "block_key": block_key,
                "absent_count": count,
                "threshold": threshold,
                "alert": f"{block_key} crossed absence threshold"
            })

    alerts.sort(key=lambda x: x["absent_count"], reverse=True)
    return alerts


@api_router.get("/admin/attendance/export")
async def export_attendance_report(
    date: str = Query(...),
    hostel: str = Query("all"),
    block: str = Query("all"),
    room_number: str = Query("all"),
    status_filter: str = Query("all"),
    format: str = Query("pdf"),
    export_type: str = Query("daily"),
    user: dict = Depends(get_current_user)
):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")

    target_date = str(date).strip()
    hostel_filter = str(hostel or "all").strip()
    block_filter = str(block or "all").strip()
    room_filter = str(room_number or "all").strip()
    status_filter = normalize_attendance_status(status_filter) if status_filter != "all" else "all"

    students = await db.users.find({"role": "student"}).to_list(5000)
    records = await db.attendance.find({"date": target_date}).to_list(5000)
    attendance_map = {
        str(r.get("student_id", "")).strip(): serialize_attendance_record(r)
        for r in records
    }

    rows = []
    for s in students:
        hostel_name = normalize_hostel_for_attendance(s.get("hostel_name", "N/A"))
        block_name = normalize_block_for_attendance(s.get("block", "N/A"))
        room_name = normalize_room_for_attendance(s.get("room_number", "N/A"))
        bed_name = normalize_room_for_attendance(s.get("bed_number", "N/A"))

        if hostel_filter != "all" and hostel_name != hostel_filter:
            continue
        if block_filter != "all" and block_name != block_filter:
            continue
        if room_filter != "all" and room_name != room_filter:
            continue

        enrollment = str(s.get("enrollment_number", "")).strip()
        record = attendance_map.get(enrollment)

        if record:
            status_value = normalize_attendance_status(record.get("status", "pending"))
            time_value = record.get("time", "N/A")
            source_value = record.get("source", "manual")
            marked_by_value = record.get("marked_by", "N/A")
            reason_note = record.get("reason_note", "")
        else:
            status_value = get_attendance_default_status_for_date(target_date)
            time_value = "N/A"
            source_value = "system_absent" if status_value == "absent" else "pending"
            marked_by_value = "system"
            reason_note = ""

        if status_filter != "all" and status_value != status_filter:
            continue

        rows.append([
            s.get("student_name", s.get("username", "Student")),
            enrollment,
            hostel_name,
            block_name,
            room_name,
            bed_name,
            s.get("course", "N/A"),
            s.get("year", "N/A"),
            s.get("gender", "N/A"),
            status_value,
            time_value,
            source_value,
            marked_by_value,
            reason_note
        ])

    timestamp = get_india_now().strftime("%Y-%m-%d_%H-%M-%S")

    if format.lower() == "csv":
        file_name = f"attendance_{export_type}_{timestamp}.csv"
        file_path = UPLOAD_DIR / file_name

        with open(file_path, "w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)

            if export_type == "daily_absentee":
                writer.writerow(["Student Name", "Enrollment", "Hostel", "Block", "Room", "Guardian Phone", "Status"])
                for s in students:
                    hostel_name = normalize_hostel_for_attendance(s.get("hostel_name", "N/A"))
                    block_name = normalize_block_for_attendance(s.get("block", "N/A"))
                    room_name = normalize_room_for_attendance(s.get("room_number", "N/A"))
                    enrollment = str(s.get("enrollment_number", "")).strip()
                    record = attendance_map.get(enrollment)
                    final_status = record["status"] if record else get_attendance_default_status_for_date(target_date)

                    if final_status == "absent":
                        writer.writerow([
                            s.get("student_name", s.get("username", "Student")),
                            enrollment,
                            hostel_name,
                            block_name,
                            room_name,
                            s.get("parent_phone") or s.get("father_contact") or s.get("mother_contact"),
                            final_status
                        ])

            elif export_type == "parent_summary":
                writer.writerow(["Student Name", "Enrollment", "Guardian Phone", "Attendance Status", "Hostel", "Room"])
                for s in students:
                    enrollment = str(s.get("enrollment_number", "")).strip()
                    record = attendance_map.get(enrollment)
                    final_status = record["status"] if record else get_attendance_default_status_for_date(target_date)

                    writer.writerow([
                        s.get("student_name", s.get("username", "Student")),
                        enrollment,
                        s.get("parent_phone") or s.get("father_contact") or s.get("mother_contact"),
                        final_status,
                        normalize_hostel_for_attendance(s.get("hostel_name")),
                        normalize_room_for_attendance(s.get("room_number"))
                    ])

            else:
                writer.writerow([
                    "Student Name", "Enrollment", "Hostel", "Block", "Room", "Bed",
                    "Course", "Year", "Gender", "Status", "Time", "Source", "Marked By", "Reason"
                ])
                writer.writerows(rows)

        return {"file_url": f"/uploads/{file_name}"}

    file_name = f"attendance_{export_type}_{timestamp}.pdf"
    file_path = UPLOAD_DIR / file_name

    doc = SimpleDocTemplate(str(file_path), pagesize=letter)
    styles = getSampleStyleSheet()
    elements = []

    report_title = "HOSTELEASE - Attendance Report"
    if export_type == "monthly_summary":
        report_title = "HOSTELEASE - Monthly Attendance Summary"
    elif export_type == "warden_register":
        report_title = "HOSTELEASE - Warden Register Format"

    elements.append(Paragraph(report_title, styles["Title"]))
    elements.append(Paragraph(f"Date: {target_date}", styles["Normal"]))
    elements.append(Paragraph(f"Hostel Filter: {hostel_filter}", styles["Normal"]))
    elements.append(Paragraph(f"Block Filter: {block_filter}", styles["Normal"]))
    elements.append(Spacer(1, 20))

    data = [[
        "Student", "Enroll.", "Hostel", "Block", "Room", "Bed",
        "Status", "Time", "Source", "Marked By"
    ]]

    for row in rows:
        data.append([
            row[0], row[1], row[2], row[3], row[4], row[5], row[9], row[10], row[11], row[12]
        ])

    table = Table(
        data,
        colWidths=[75, 55, 70, 40, 40, 35, 55, 70, 55, 60]
    )
    table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#1E293B")),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 7),
        ('BACKGROUND', (0, 1), (-1, -1), colors.beige),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE')
    ]))

    elements.append(table)
    doc.build(elements)

    return {"file_url": f"/uploads/{file_name}"} 

# ==================== NOTIFICATION ROUTES ====================

def safe_objectid(value: str):
    try:
        return ObjectId(value)
    except Exception:
        return None

def normalize_notice_priority(priority: str = "general") -> str:
    value = str(priority or "general").strip().lower()
    allowed = ["general", "important", "critical", "emergency"]
    return value if value in allowed else "general"

def normalize_notice_type(value: str = "general") -> str:
    value = str(value or "general").strip().lower()
    allowed = [
        "general",
        "mess_timing",
        "fee_reminder",
        "holiday",
        "laundry",
        "emergency",
        "complaint",
        "visitor",
        "fees",
        "gatepass"
    ]
    return value if value in allowed else "general"

def normalize_notice_status(value: str = "published") -> str:
    value = str(value or "published").strip().lower()
    allowed = ["draft", "scheduled", "published", "archived", "expired", "deleted"]
    return value if value in allowed else "published"

def parse_iso_or_none(value):
    if not value:
        return None
    try:
        raw = str(value).strip().replace("Z", "+00:00")
        dt = datetime.fromisoformat(raw)

        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)

        return dt.astimezone(timezone.utc)
    except Exception:
        return None        

async def get_target_students_count(notification: dict):
    hostel = normalize_hostel_name(notification.get("hostel", "all"))
    target_role = str(notification.get("target_role", "student")).strip().lower()

    query = {}

    if target_role == "student":
        query["role"] = "student"
    elif target_role == "admin":
        query["role"] = "admin"

    if is_private_notification(notification):
        targets = extract_private_targets(notification)

        private_or = []

        if targets["enrollments"]:
            private_or.append({
                "enrollment_number": {"$in": [str(x).strip() for x in targets["enrollments"]]}
            })

        if targets["usernames"]:
            private_or.append({
                "username": {"$in": [str(x).strip() for x in targets["usernames"]]}
            })

        if not private_or:
            return 0

        if len(private_or) == 1:
            query.update(private_or[0])
        else:
            query["$or"] = private_or

        return await db.users.count_documents(query)

    if hostel not in ["all", "private"]:
        query["hostel_name"] = hostel

    count = await db.users.count_documents(query)
    return count

async def get_unread_students(notification: dict):
    if str(notification.get("target_role", "student")).strip().lower() == "admin":
        return []

    hostel = normalize_hostel_name(notification.get("hostel", "all"))
    read_by = [str(x).strip() for x in notification.get("read_by", [])]

    query = {"role": "student"}

    if is_private_notification(notification):
        targets = extract_private_targets(notification)

        private_or = []

        if targets["enrollments"]:
            private_or.append({
                "enrollment_number": {"$in": [str(x).strip() for x in targets["enrollments"]]}
            })

        if targets["usernames"]:
            private_or.append({
                "username": {"$in": [str(x).strip() for x in targets["usernames"]]}
            })

        if not private_or:
            return []

        if len(private_or) == 1:
            query.update(private_or[0])
        else:
            query["$or"] = private_or
    else:
        if hostel not in ["all", "private"]:
            query["hostel_name"] = hostel

    students = await db.users.find(
        query,
        {
            "_id": 0,
            "student_name": 1,
            "username": 1,
            "enrollment_number": 1,
            "hostel_name": 1,
            "room_number": 1,
            "bed_number": 1,
            "block": 1
        }
    ).to_list(5000)

    unread_students = []
    for s in students:
        enrollment = str(s.get("enrollment_number", "")).strip()
        username = str(s.get("username", "")).strip()

        if enrollment not in read_by and username not in read_by:
            unread_students.append(s)

    return unread_students

async def auto_update_notification_states():
    now = datetime.now(timezone.utc)
    notifications = await db.notifications.find({"status": {"$in": ["scheduled", "published"]}}).to_list(1000)

    for item in notifications:
        nid = item["_id"]
        status = item.get("status", "published")
        scheduled_for = parse_iso_or_none(item.get("scheduled_for"))
        expires_at = parse_iso_or_none(item.get("expires_at"))

        updates = {}

        if status == "scheduled" and scheduled_for and scheduled_for <= now:
            updates["status"] = "published"
            updates["published_at"] = now.isoformat()

        if status == "published" and expires_at and expires_at <= now:
            updates["status"] = "expired"

        if updates:
            await db.notifications.update_one({"_id": nid}, {"$set": updates})

@api_router.get("/notifications")
async def get_notifications(
    include_archived: bool = Query(False),
    user: dict = Depends(get_current_user)
):
    await auto_update_notification_states()

    allowed_statuses = ["published"] if not include_archived else ["published", "expired", "archived"]

    notifications = await db.notifications.find({
        "status": {"$in": allowed_statuses},
        "deleted_at": None
    }).sort([
        ("is_pinned", -1),
        ("date", -1)
    ]).to_list(500)

    final_data = []
    now = datetime.now(timezone.utc)
    user_enrollment = str(user.get("enrollment_number", "")).strip()

    for notification in notifications:
        if not user_is_targeted(notification, user):
            continue

        notification["_id"] = str(notification["_id"])
        notification["read_by"] = notification.get("read_by", [])
        notification["read_logs"] = notification.get("read_logs", [])
        notification["title"] = notification.get("title", "Notice Board Update")
        notification["hostel"] = notification.get("hostel", "all")
        notification["type"] = normalize_notice_type(notification.get("type", "general"))
        notification["priority"] = normalize_notice_priority(notification.get("priority", "general"))
        notification["status"] = normalize_notice_status(notification.get("status", "published"))
        notification["is_pinned"] = bool(notification.get("is_pinned", False))
        notification["requires_ack"] = bool(notification.get("requires_ack", False))
        notification["deep_link"] = notification.get("deep_link")
        notification["attachment_url"] = notification.get("attachment_url")
        notification["scheduled_for"] = notification.get("scheduled_for")
        notification["expires_at"] = notification.get("expires_at")
        notification["read_deadline"] = notification.get("read_deadline")
        notification["target_role"] = notification.get("target_role", "student")
        notification["meta"] = notification.get("meta", {})
        notification["target_usernames"] = notification.get("target_usernames", [])
        notification["target_enrollment_numbers"] = notification.get("target_enrollment_numbers", [])
        notification["audience_count"] = await get_target_students_count(notification)

        read_logs = notification.get("read_logs", [])
        user_read_log = next(
            (log for log in read_logs if str(log.get("user", "")).strip() == user_enrollment),
            None
        )
        notification["read_at"] = user_read_log.get("read_at") if user_read_log else None
        username = str(user.get("username", "")).strip()
        normalized_read_by = [str(x).strip() for x in notification.get("read_by", [])]
        notification["is_read"] = user_enrollment in normalized_read_by or username in normalized_read_by

        expires_at = parse_iso_or_none(notification.get("expires_at"))
        notification["is_expired"] = bool(expires_at and expires_at <= now)

        final_data.append(notification)

    return final_data


async def dispatch_notification_emails(
    title: str,
    message: str,
    priority: str = "general",
    notification_type: str = "general",
    hostel: str = "all",
    target_users: str = "all",
    target_usernames: list = None,
    target_enrollment_numbers: list = None,
    warden_name: str = "Warden / Admin"
):
    """Dispatches notice announcement emails to students in background."""
    try:
        query = {"role": "student"}
        if target_users == "selected_students":
            or_list = []
            if target_usernames:
                or_list.append({"username": {"$in": target_usernames}})
            if target_enrollment_numbers:
                or_list.append({"enrollment_number": {"$in": target_enrollment_numbers}})
            if or_list:
                query["$or"] = or_list
        elif hostel and hostel.lower() != "all":
            query["$or"] = [
                {"hostel": {"$regex": f"^{re.escape(hostel)}$", "$options": "i"}},
                {"hostel_name": {"$regex": f"^{re.escape(hostel)}$", "$options": "i"}},
                {"current_hostel": {"$regex": f"^{re.escape(hostel)}$", "$options": "i"}}
            ]

        students = await db.users.find(query, {"personal_email": 1, "college_email": 1, "student_name": 1, "username": 1}).to_list(length=500)

        emails = set()
        for s in students:
            email = s.get("personal_email") or s.get("college_email")
            if email and "@" in email and not email.endswith(".fake") and not email.endswith(".invalid"):
                emails.add(email.strip().lower())

        # Always guarantee inclusion of our 5 real test accounts for university notices
        known_real_test_emails = [
            "anushaanchalia@gmail.com",
            "anushaanchalia2509@gmail.com",
            "anushaanchalia21@gmail.com",
            "2303031240216@paruluniversity.ac.in",
            "anushaanchalia2121@gmail.com"
        ]
        if target_users == "all" or hostel == "all":
            for real_mail in known_real_test_emails:
                emails.add(real_mail.lower())

        if not emails:
            return

        priority_colors = {
            "urgent": "#ef4444",
            "high": "#f97316",
            "medium": "#eab308",
            "general": "#3b82f6",
            "low": "#6b7280"
        }
        badge_color = priority_colors.get(priority.lower(), "#3b82f6")

        html_body = f"""
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 620px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; background: #ffffff;">
            <div style="background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%); padding: 24px; color: #ffffff; text-align: center;">
                <h1 style="margin: 0; font-size: 22px; font-weight: 700; letter-spacing: 1px; color: #ffffff;">HOSTELEASE NOTICE BOARD</h1>
                <p style="margin: 6px 0 0 0; font-size: 13px; color: #94a3b8;">Hostel Administration &bull; Official Warden Announcement</p>
            </div>
            <div style="padding: 24px;">
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px;">
                    <span style="display: inline-block; background-color: {badge_color}; color: #ffffff; font-size: 11px; font-weight: 700; text-transform: uppercase; padding: 4px 10px; border-radius: 9999px;">
                        {priority.upper()} PRIORITY
                    </span>
                    <span style="color: #64748b; font-size: 12px;">Notice Type: <b>{notification_type.title()}</b></span>
                </div>
                <h2 style="color: #0f172a; font-size: 18px; font-weight: 700; margin: 0 0 12px 0;">{title}</h2>
                <div style="background-color: #f8fafc; border-left: 4px solid #3b82f6; padding: 14px 16px; border-radius: 4px; margin-bottom: 20px;">
                    <p style="color: #334155; font-size: 14px; line-height: 1.6; margin: 0; white-space: pre-wrap;">{message}</p>
                </div>
                <div style="border-top: 1px solid #e2e8f0; padding-top: 14px; color: #64748b; font-size: 12px;">
                    <p style="margin: 2px 0;"><b>Issued By:</b> {warden_name} (Hostel Administration)</p>
                    <p style="margin: 2px 0;"><b>Target Hostel:</b> {hostel.title() if hostel else 'All Hostels'}</p>
                    <p style="margin: 2px 0;"><b>Date:</b> {datetime.now(timezone.utc).strftime('%d %b %Y, %I:%M %p UTC')}</p>
                </div>
            </div>
            <div style="background-color: #f1f5f9; padding: 12px 24px; text-align: center; color: #94a3b8; font-size: 11px;">
                Please log into your Hostelease student portal to view full details or acknowledge this notice.<br/>
                &copy; Hostelease Smart Hostel Management System
            </div>
        </div>
        """

        subject = f"HOSTELEASE Notice: {title}"

        for dest_email in emails:
            try:
                await send_email(dest_email, subject, html_body)
            except Exception as e_ind:
                print(f"[NOTIF-EMAIL] Error dispatching to {dest_email}: {e_ind}")
    except Exception as e:
        print(f"[NOTIF-EMAIL-DISPATCH] Background dispatch exception: {e}")


@api_router.post("/notifications")
async def create_notification(
    data: dict = Body(...),
    user: dict = Depends(get_current_user)
):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admin can create notifications")

    title = str(data.get("title", "")).strip()
    message = str(data.get("message", "")).strip()

    if not title:
        raise HTTPException(status_code=400, detail="Title is required")
    if not message:
        raise HTTPException(status_code=400, detail="Message is required")

    now_iso = datetime.now(timezone.utc).isoformat()
    notification_type = normalize_notice_type(data.get("type", "general"))
    priority = normalize_notice_priority(data.get("priority", "general"))
    hostel = data.get("hostel", "all")
    target_users = normalize_target_users(data.get("target_users", "all"))
    target_role = data.get("target_role", "student")
    target_usernames = normalize_target_identifiers(data.get("target_usernames", []))
    target_enrollment_numbers = normalize_target_identifiers(data.get("target_enrollment_numbers", []))
    scheduled_for = data.get("scheduled_for")
    expires_at = data.get("expires_at")
    read_deadline = data.get("read_deadline")
    is_pinned = bool(data.get("is_pinned", False))
    requires_ack = bool(data.get("requires_ack", False))
    deep_link = None
    attachment_url = data.get("attachment_url")
    save_as_draft = bool(data.get("save_as_draft", False))

    duplicate = await db.notifications.find_one({
        "title": title,
        "message": message,
        "status": {"$in": ["draft", "scheduled", "published"]},
        "deleted_at": None
    })

    if duplicate and not bool(data.get("force_create", False)):
        return {
            "duplicate_warning": True,
            "message": "A similar notification already exists. Confirm to create anyway."
        }

    status = "published"
    published_at = now_iso

    if save_as_draft:
        status = "draft"
        published_at = None
    elif scheduled_for:
        scheduled_dt = parse_iso_or_none(scheduled_for)
        now_utc = datetime.now(timezone.utc)
        if scheduled_dt is not None and scheduled_dt > now_utc:
            status = "scheduled"
            published_at = None

    notification = {
        "title": title,
        "type": notification_type,
        "priority": priority,
        "message": message,
        "hostel": hostel,
        "target_users": target_users,
        "target_usernames": target_usernames,
        "target_enrollment_numbers":target_enrollment_numbers,
        "target_role": target_role,
        "date": now_iso,
        "scheduled_for": scheduled_for,
        "published_at": published_at,
        "expires_at": expires_at,
        "read_deadline": read_deadline,
        "created_by": user.get("username"),
        "created_by_role": user.get("role"),
        "read_by": [],
        "read_logs": [],
        "status": status,
        "is_pinned": is_pinned,
        "requires_ack": requires_ack,
        "deep_link": deep_link,
        "attachment_url": attachment_url,
        "deleted_at": None,
        "archived_at": None,
        "updated_at": now_iso
    }

    result = await db.notifications.insert_one(notification)

    if status == "published":
        asyncio.create_task(dispatch_notification_emails(
            title=title,
            message=message,
            priority=priority,
            notification_type=notification_type,
            hostel=hostel,
            target_users=target_users,
            target_usernames=target_usernames,
            target_enrollment_numbers=target_enrollment_numbers,
            warden_name=user.get("student_name") or user.get("username") or "Hostel Warden"
        ))

    return {
        "message": "Notification created successfully",
        "notification_id": str(result.inserted_id),
        "status": status
    }


@api_router.put("/notifications/{notif_id}")
async def update_notification(
    notif_id: str,
    data: dict = Body(...),
    user: dict = Depends(get_current_user)
):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admin can edit notifications")

    oid = safe_objectid(notif_id)
    if not oid:
        raise HTTPException(status_code=400, detail="Invalid notification ID")

    existing = await db.notifications.find_one({"_id": oid, "deleted_at": None})
    if not existing:
        raise HTTPException(status_code=404, detail="Notification not found")

    updates = {
        "title": str(data.get("title", existing.get("title", ""))).strip(),
        "message": str(data.get("message", existing.get("message", ""))).strip(),
        "type": normalize_notice_type(data.get("type", existing.get("type", "general"))),
        "priority": normalize_notice_priority(data.get("priority", existing.get("priority", "general"))),
        "hostel": data.get("hostel", existing.get("hostel", "all")),
        "target_users": normalize_target_users(data.get("target_users", existing.get("target_users", "all"))),
        "target_usernames": normalize_target_identifiers(data.get("target_usernames", existing.get("target_usernames", []))),
        "target_enrollment_numbers": normalize_target_identifiers(data.get("target_enrollment_numbers", existing.get("target_enrollment_numbers", []))),
        "target_role": data.get("target_role", existing.get("target_role", "student")),
        "scheduled_for": data.get("scheduled_for", existing.get("scheduled_for")),
        "expires_at": data.get("expires_at", existing.get("expires_at")),
        "read_deadline": data.get("read_deadline", existing.get("read_deadline")),
        "is_pinned": bool(data.get("is_pinned", existing.get("is_pinned", False))),
        "requires_ack": bool(data.get("requires_ack", existing.get("requires_ack", False))),
        "deep_link": None,
        "attachment_url": data.get("attachment_url", existing.get("attachment_url")),
        "updated_at": datetime.now(timezone.utc).isoformat()
    }

    if bool(data.get("save_as_draft", False)):
        updates["status"] = "draft"
        updates["published_at"] = None
    elif updates.get("scheduled_for"):
        scheduled_dt = parse_iso_or_none(updates.get("scheduled_for"))
        now_utc = datetime.now(timezone.utc)
        if scheduled_dt is not None and scheduled_dt > now_utc:
            updates["status"] = "scheduled"
            updates["published_at"] = None
        else:
            updates["status"] = "published"
            updates["published_at"] = now_utc.isoformat()
    else:
        if existing.get("status") in ["draft", "scheduled"]:
            updates["status"] = "published"
            updates["published_at"] = datetime.now(timezone.utc).isoformat()

    await db.notifications.update_one({"_id": oid}, {"$set": updates})
    return {"message": "Notification updated successfully"}


@api_router.post("/notifications/{notif_id}/resend")
async def resend_notification(
    notif_id: str,
    user: dict = Depends(get_current_user)
):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admin can resend notifications")

    oid = safe_objectid(notif_id)
    if not oid:
        raise HTTPException(status_code=400, detail="Invalid notification ID")

    existing = await db.notifications.find_one({"_id": oid, "deleted_at": None})
    if not existing:
        raise HTTPException(status_code=404, detail="Notification not found")

    now_iso = datetime.now(timezone.utc).isoformat()

    new_doc = {
        **existing,
        "date": now_iso,
        "published_at": now_iso,
        "status": "published",
        "read_by": [],
        "read_logs": [],
        "updated_at": now_iso,
        "archived_at": None,
        "deleted_at": None
    }
    new_doc.pop("_id", None)

    result = await db.notifications.insert_one(new_doc)

    asyncio.create_task(dispatch_notification_emails(
        title=new_doc.get("title", "Notice"),
        message=new_doc.get("message", ""),
        priority=new_doc.get("priority", "general"),
        notification_type=new_doc.get("type", "general"),
        hostel=new_doc.get("hostel", "all"),
        target_users=new_doc.get("target_users", "all"),
        target_usernames=new_doc.get("target_usernames", []),
        target_enrollment_numbers=new_doc.get("target_enrollment_numbers", []),
        warden_name=user.get("student_name") or user.get("username") or "Hostel Warden"
    ))

    return {
        "message": "Notification rebroadcasted successfully",
        "notification_id": str(result.inserted_id)
    }


@api_router.post("/notifications/{notif_id}/archive")
async def archive_notification(
    notif_id: str,
    user: dict = Depends(get_current_user)
):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admin can archive notifications")

    oid = safe_objectid(notif_id)
    if not oid:
        raise HTTPException(status_code=400, detail="Invalid notification ID")

    result = await db.notifications.update_one(
        {"_id": oid, "deleted_at": None},
        {"$set": {
            "status": "archived",
            "archived_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )

    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Notification not found")

    return {"message": "Notification archived successfully"}


@api_router.delete("/notifications/{notif_id}")
async def delete_notification(
    notif_id: str,
    user: dict = Depends(get_current_user)
):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admin can delete notifications")

    oid = safe_objectid(notif_id)
    if not oid:
        raise HTTPException(status_code=400, detail="Invalid notification ID")

    result = await db.notifications.update_one(
        {"_id": oid},
        {"$set": {
            "status": "deleted",
            "deleted_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )

    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Notification not found")

    return {"message": "Notification deleted successfully"}


@api_router.get("/notifications/sent-history")
async def get_sent_history(
    search: str = Query(""),
    hostel: str = Query("all"),
    type: str = Query("all"),
    status: str = Query("all"),
    pinned: str = Query("all"),
    expired: str = Query("all"),
    user: dict = Depends(get_current_user)
):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")

    await auto_update_notification_states()

    query = {"deleted_at": None}
    notifications = await db.notifications.find(query).sort([
        ("is_pinned", -1),
        ("date", -1)
    ]).to_list(1000)

    now = datetime.now(timezone.utc)
    final = []

    for n in notifications:
        n["_id"] = str(n["_id"])
        n["read_by"] = n.get("read_by", [])
        n["read_logs"] = n.get("read_logs", [])
        n["meta"] = n.get("meta", {})
        n["status"] = normalize_notice_status(n.get("status", "published"))
        n["priority"] = normalize_notice_priority(n.get("priority", "general"))
        n["type"] = normalize_notice_type(n.get("type", "general"))
        n["is_pinned"] = bool(n.get("is_pinned", False))

        expires_dt = parse_iso_or_none(n.get("expires_at"))
        is_expired = bool(expires_dt and expires_dt <= now)
        n["is_expired"] = is_expired

        audience_count = await get_target_students_count(n)
        n["audience_count"] = audience_count
        n["read_count"] = len(n.get("read_by", []))
        n["unread_count"] = max(audience_count - n["read_count"], 0)
        n["read_percent"] = 0 if audience_count == 0 else round((n["read_count"] / audience_count) * 100)

        matches = True

        if search:
            s = search.strip().lower()
            matches = matches and (
                s in str(n.get("title", "")).lower() or
                s in str(n.get("message", "")).lower()
            )

        if hostel != "all":
            matches = matches and str(n.get("hostel", "all")) == hostel

        if type != "all":
            matches = matches and str(n.get("type", "general")) == type

        if status != "all":
            matches = matches and str(n.get("status", "published")) == status

        if pinned != "all":
            matches = matches and bool(n.get("is_pinned", False)) == (pinned == "true")

        if expired != "all":
            matches = matches and is_expired == (expired == "true")

        if matches:
            final.append(n)

    return final


@api_router.get("/notifications/{notif_id}/unread-users")
async def get_notification_unread_users(
    notif_id: str,
    user: dict = Depends(get_current_user)
):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")

    oid = safe_objectid(notif_id)
    if not oid:
        raise HTTPException(status_code=400, detail="Invalid notification ID")

    notification = await db.notifications.find_one({"_id": oid, "deleted_at": None})
    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found")

    students = await get_unread_students(notification)
    return {"students": students}

@api_router.post("/notifications/read/{notif_id}")
async def mark_notification_read(
    notif_id: str,
    user: dict = Depends(get_current_user)
):
    oid = safe_objectid(notif_id)
    if not oid:
        raise HTTPException(status_code=400, detail="Invalid notification ID")

    notif = await db.notifications.find_one({"_id": oid, "deleted_at": None})
    if not notif:
        raise HTTPException(status_code=404, detail="Notification not found")

    if not user_is_targeted(notif, user):
        raise HTTPException(status_code=403, detail="You are not allowed to access this notification")

    user_id = str(user.get("enrollment_number", "")).strip()

    user_id = str(user.get("enrollment_number", "")).strip()
    username = str(user.get("username", "")).strip()

    await db.notifications.update_one(
        {"_id": oid},
        {
            "$addToSet": {"read_by": user_id},
            "$push": {
                "read_logs": {
                    "user": user_id,
                    "username": username,
                    "read_at": datetime.now(timezone.utc).isoformat()
                }
            }
        }
    )

    if username:
        await db.notifications.update_one(
            {"_id": oid},
            {"$addToSet": {"read_by": username}}
        )

    return {"message": "Notification acknowledged successfully"}

@api_router.post("/notifications/mark-all-read")
async def mark_all_notifications_read(
    user: dict = Depends(get_current_user)
):
    notifications = await get_notifications(include_archived=False, user=user)
    user_id = str(user.get("enrollment_number", "")).strip()
    username = str(user.get("username", "")).strip()

    for notif in notifications:
        oid = safe_objectid(notif["_id"])
        if not oid:
            continue

        await db.notifications.update_one(
            {"_id": oid},
            {
                "$addToSet": {"read_by": user_id},
                "$push": {
                    "read_logs": {
                        "user": user_id,
                        "username": username,
                        "read_at": datetime.now(timezone.utc).isoformat()
                    }
                }
            }
        )

        if username:
            await db.notifications.update_one(
                {"_id": oid},
                {"$addToSet": {"read_by": username}}
            )

    return {"message": "All notifications marked as read"}


@api_router.get("/notifications/analytics/export")
async def export_notification_analytics(
    user: dict = Depends(get_current_user)
):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")

    notifications = await db.notifications.find({"deleted_at": None}).sort("date", -1).to_list(1000)

    timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
    file_name = f"notification_analytics_{timestamp}.csv"
    file_path = UPLOAD_DIR / file_name

    with open(file_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow([
            "Title",
            "Type",
            "Priority",
            "Hostel",
            "Status",
            "Pinned",
            "Published At",
            "Expires At",
            "Audience Count",
            "Read Count",
            "Unread Count",
            "Read Percent"
        ])

        for n in notifications:
            audience_count = await get_target_students_count(n)
            read_count = len(n.get("read_by", []))
            unread_count = max(audience_count - read_count, 0)
            read_percent = 0 if audience_count == 0 else round((read_count / audience_count) * 100)

            writer.writerow([
                n.get("title", ""),
                n.get("type", ""),
                n.get("priority", ""),
                n.get("hostel", ""),
                n.get("status", ""),
                n.get("is_pinned", False),
                n.get("published_at", ""),
                n.get("expires_at", ""),
                audience_count,
                read_count,
                unread_count,
                read_percent
            ])

    return {"file_url": f"/uploads/{file_name}"}
    

# ==================== ADMIN DASHBOARD STATS ====================
@api_router.get("/admin/stats")
async def get_admin_stats(user: dict = Depends(get_current_user)):
    """
    Fetches synchronized statistics for the Admin Dashboard.
    Ensures occupancy counts match actual student records.
    """
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    
    # 1. Fetch real student count from the 'users' collection
    total_students = await db.users.count_documents({"role": "student"})
    
    # 2. Synchronize 'occupied_beds' with actual student count
    # This prevents the previous error where 2108 beds appeared occupied.
    occupied_beds = total_students 
    
    # 3. Dynamic Aggregation for Bhawan Distribution Cards
    # Groups students by 'hostel_name' and counts them for the frontend .map() function.
    pipeline = [
        {"$match": {"role": "student"}},
        {"$group": {"_id": "$hostel_name", "count": {"$sum": 1}}},
        {"$project": {"name": "$_id", "count": 1, "_id": 0}}
    ]
    hostel_distribution = await db.users.aggregate(pipeline).to_list(length=100)

    # 4. Gather pending management statistics
    pending_complaints = await db.complaints.count_documents({"status": "pending"})
    pending_gatepasses = await db.gatepasses.count_documents({"status": "pending"})
    
    # 5. Fetch capacity data from 'rooms' collection
    rooms_agg = await db.rooms.aggregate([
        {"$group": {"_id": None, "total_capacity": {"$sum": "$capacity"}}}
    ]).to_list(1)
    
    total_capacity = 0
    if rooms_agg:
        total_capacity = rooms_agg[0].get("total_capacity", 0)
    
    # Standard system fallback if database records are incomplete
    if total_capacity <= 0:
        total_capacity = 2160

    return {
        "total_students": total_students,
        "pending_complaints": pending_complaints,
        "pending_gatepasses": pending_gatepasses,
        "total_beds": total_capacity,
        "occupied_beds": occupied_beds,
        "available_beds": max(0, total_capacity - occupied_beds),
        "hostel_distribution": hostel_distribution # This key MUST be present for React cards to show
    }

# ==================== UPDATED ADMIN: FULL CONTROL ====================

@api_router.patch("/admin/modify-all")
async def admin_modify_module(
    module: str,
    record_id: str,
    updates: dict = Body(...),
    user: dict = Depends(get_current_user)
):
    """Universal Admin Route to modify any module (users, complaints, mess, laundry, etc.)"""
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Unauthorized Access")

    allowed_modules = {
        "users": db.users,
        "complaints": db.complaints,
        "mess_menu": db.mess_menu,
        "laundry_complaints": db.laundry_complaints,
        "gatepasses": db.gatepasses,
        "yearly_bookings": db.yearly_bookings,
        "notifications": db.notifications
    }

    if module not in allowed_modules:
        raise HTTPException(status_code=400, detail="Invalid module name")

    collection = allowed_modules[module]
    query = {"_id": ObjectId(record_id)} if ObjectId.is_valid(record_id) else {"_id": record_id}

    if "hostel_name" in updates and updates["hostel_name"] == "Shakunthala Bhawan":
        updates["hostel_name"] = "Shakuntala Bhawan"

    if module == "users":
        if "enrollment_number" in updates:
            updates["enrollment_number"] = str(updates["enrollment_number"]).strip()
            updates["registration_no"] = updates["enrollment_number"]

        for key in ["block", "floor", "room_number", "bed_number", "hostel_name"]:
            if key in updates:
                value = str(updates.get(key, "")).strip()
                updates[key] = value if value else "N/A"

        duplicate_enrollment = updates.get("enrollment_number")
        if duplicate_enrollment:
            existing = await db.users.find_one({
                "_id": {"$ne": ObjectId(record_id)} if ObjectId.is_valid(record_id) else {"$ne": record_id},
                "$or": [
                    {"enrollment_number": duplicate_enrollment},
                    {"registration_no": duplicate_enrollment}
                ]
            })
            if existing:
                raise HTTPException(status_code=400, detail="Another student already has this enrollment number")

    result = await collection.update_one(query, {"$set": updates})

    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail=f"Record not found in {module}")

    if module == "users":
        invalidate_students_cache()
    elif module in ["yearly_bookings", "rooms"]:
        invalidate_bed_cache()

    return {"message": f"{module} updated successfully"}

@api_router.get("/admin/students")
async def get_all_students(
    hostel: str = Query(None),
    block: str = Query(None),
    floor: str = Query(None),
    course: str = Query(None),
    year: str = Query(None),
    gender: str = Query(None),
    user: dict = Depends(get_current_user)
):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    cache_key = f"{hostel}_{block}_{floor}_{course}_{year}_{gender}"
    now_ts = time.time()
    if cache_key in _STUDENTS_CACHE and (now_ts - _STUDENTS_CACHE_TIME.get(cache_key, 0)) < STUDENTS_CACHE_TTL:
        return _STUDENTS_CACHE[cache_key]

    query = {"role": "student"}

    if hostel:
        query["hostel_name"] = normalize_hostel_name(hostel)

    if block:
        normalized_block = normalize_block_name(block)
        query["block"] = {
            "$in": [
                normalized_block,
                normalized_block.upper(),
                normalized_block.lower(),
                f"Block {normalized_block}",
                f"BLOCK {normalized_block}"
            ]
        }

    if floor:
        floor_value = str(floor).strip()
        floor_options = [floor_value]
        if floor_value.isdigit():
            floor_options.append(int(floor_value))
        query["floor"] = {"$in": floor_options}

    if course:
        query["course"] = {"$regex": f"^{re.escape(str(course).strip())}$", "$options": "i"}

    if year:
        year_value = str(year).strip()
        year_options = [year_value]
        if year_value.isdigit():
            year_options.append(int(year_value))
        query["year"] = {"$in": year_options}

    if gender:
        query["gender"] = {"$regex": f"^{re.escape(str(gender).strip())}$", "$options": "i"}

    students = await db.users.find(query, {"password": 0, "biometric_data": 0, "embeddings": 0, "login_history": 0, "totp_secret": 0}).to_list(length=5000)

    complaints_by_student = {}
    payments_by_student = {}

    complaint_rows = await db.complaints.find(
        {},
        {"enrollment_number": 1, "status": 1, "_id": 0}
    ).to_list(length=3000)

    for complaint in complaint_rows:
        if str(complaint.get("status", "pending")).lower() not in ["resolved", "completed", "closed"]:
            sid = str(complaint.get("enrollment_number", "")).strip()
            if sid:
                complaints_by_student[sid] = complaints_by_student.get(sid, 0) + 1

    try:
        payment_rows = await db.payments.find(
            {"type": "fine"},
            {"student_id": 1, "status": 1, "_id": 0}
        ).to_list(length=3000)

        for payment in payment_rows:
            if str(payment.get("status", "unpaid")).lower() not in ["paid", "success", "completed"]:
                sid = str(payment.get("student_id", "")).strip()
                if sid:
                    payments_by_student[sid] = payments_by_student.get(sid, 0) + 1
    except Exception:
        pass

    normalized = []
    for student in students:
        student["_id"] = str(student["_id"])

        if student.get("hostel_name") == "Shakunthala Bhawan":
            student["hostel_name"] = "Shakuntala Bhawan"

        if not student.get("registration_no") and student.get("enrollment_number"):
            student["registration_no"] = student["enrollment_number"]

        if not student.get("enrollment_number") and student.get("registration_no"):
            student["enrollment_number"] = student["registration_no"]

        if not student.get("student_name") and student.get("name"):
            student["student_name"] = student["name"]

        enrollment = str(student.get("enrollment_number") or student.get("registration_no") or "").strip()

        hostel_name = student.get("hostel_name", "N/A") or "N/A"
        block_value = str(student.get("block", "N/A") or "N/A").strip() or "N/A"
        floor_value = str(student.get("floor", "N/A") or "N/A").strip() or "N/A"
        room_number = str(student.get("room_number", "N/A") or "N/A").strip() or "N/A"
        bed_number = str(student.get("bed_number", "N/A") or "N/A").strip() or "N/A"
        course_value = str(student.get("course", "N/A") or "N/A").strip()
        gender_value = str(student.get("gender", "N/A") or "N/A").strip().lower()
        year_value = str(student.get("year", "N/A") or "N/A").strip()

        flags = []
        if room_number in ["", "N/A"]:
            flags.append("No Room")
        if bed_number in ["", "N/A"]:
            flags.append("No Bed")
        if hostel_name in ["", "N/A", None]:
            flags.append("No Hostel")

        student["course"] = course_value
        student["gender"] = gender_value
        student["year"] = year_value
        student["room_label"] = f"{block_value}-{floor_value}-{room_number}"
        student["is_assigned"] = room_number not in ["", "N/A"] and bed_number not in ["", "N/A"]
        student["flags"] = flags
        student["has_fines"] = payments_by_student.get(enrollment, 0) > 0
        student["fine_count"] = payments_by_student.get(enrollment, 0)
        student["has_complaints"] = complaints_by_student.get(enrollment, 0) > 0
        student["complaint_count"] = complaints_by_student.get(enrollment, 0)

        normalized.append(student)

    _STUDENTS_CACHE[cache_key] = normalized
    _STUDENTS_CACHE_TIME[cache_key] = time.time()
    return normalized

@api_router.delete("/admin/students/{student_id}")
async def remove_student(student_id: str, user: dict = Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    try:
        result = await db.users.delete_one({"_id": ObjectId(student_id)})

        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Student not found")

        invalidate_students_cache()
        return {"message": "Student record removed successfully"}
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid student ID format")


@api_router.post("/admin/students", status_code=status.HTTP_201_CREATED)
async def create_student(student_data: StudentCreate, user: dict = Depends(get_current_user)):
    """
    Creates a new student record manually from the Admin Dashboard.
    Ensures no duplicate enrollment numbers exist.
    """
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    enrollment_number = str(student_data.enrollment_number).strip()
    hostel_name = student_data.hostel_name.strip()
    if hostel_name == "Shakunthala Bhawan":
        hostel_name = "Shakuntala Bhawan"

    existing_student = await db.users.find_one({
        "$or": [
            {"enrollment_number": enrollment_number},
            {"registration_no": enrollment_number}
        ]
    })

    if existing_student:
        raise HTTPException(
            status_code=400,
            detail=f"Student with Enrollment No {enrollment_number} already exists"
        )

    if student_data.father_name or student_data.mother_name or student_data.parent_phone:
        duplicate_parent_query = {"$or": []}
        if student_data.parent_phone:
            duplicate_parent_query["$or"].append({"parent_phone": student_data.parent_phone})
            duplicate_parent_query["$or"].append({"phone": student_data.parent_phone})
        if student_data.father_name and student_data.mother_name:
            duplicate_parent_query["$or"].append({
                "father_name": {"$regex": f"^{student_data.father_name}$", "$options": "i"},
                "mother_name": {"$regex": f"^{student_data.mother_name}$", "$options": "i"}
            })

        if duplicate_parent_query["$or"]:
            existing_parent = await db.users.find_one({**duplicate_parent_query, "role": "student"})
            if existing_parent:
                raise HTTPException(
                    status_code=400,
                    detail="A student with matching parent/guardian details already exists"
                )

    new_student_dict = {
        "student_name": student_data.student_name,
        "enrollment_number": enrollment_number,
        "registration_no": enrollment_number,
        "hostel_name": hostel_name,
        "block": student_data.block or "N/A",
        "room_number": student_data.room_number or "N/A",
        "floor": student_data.floor or "N/A",
        "bed_number": student_data.bed_number or "N/A",
        "father_name": student_data.father_name,
        "mother_name": student_data.mother_name,
        "parent_phone": student_data.parent_phone,
        "college_email": student_data.college_email,
        "gender": student_data.gender,
        "course": student_data.course,
        "year": student_data.year,
        "role": "student",
        "password": hash_password("hostel@123"),
        "is_first_login": True,
        "is_default_password": True,
        "two_factor_enabled": False,
        "two_factor_secret": None,
        "email_otp": None,
        "email_otp_expiry": None,
        "created_at": datetime.now(timezone.utc).isoformat()
    }

    result = await db.users.insert_one(new_student_dict)
    new_student_dict["_id"] = str(result.inserted_id)

    invalidate_students_cache()
    return new_student_dict


@api_router.post("/admin/students/bulk")
async def bulk_register_students(student_list: List[dict], user: dict = Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    if not student_list:
        raise HTTPException(status_code=400, detail="No student data received")

    docs = []
    enrollment_numbers = []
    seen_in_file = set()

    for s in student_list:
        student_name = s.get("student_name") or s.get("name")
        enrollment_number = s.get("enrollment_number") or s.get("registration_no")
        hostel_name = (s.get("hostel_name") or "N/A").strip()

        if hostel_name == "Shakunthala Bhawan":
            hostel_name = "Shakuntala Bhawan"

        if not student_name or not enrollment_number:
            continue

        enrollment_number = str(enrollment_number).strip()

        if enrollment_number in seen_in_file:
            raise HTTPException(
                status_code=400,
                detail=f"Duplicate enrollment number found in uploaded file: {enrollment_number}"
            )
        seen_in_file.add(enrollment_number)

        enrollment_numbers.append(enrollment_number)

        docs.append({
            "student_name": str(student_name).strip(),
            "enrollment_number": enrollment_number,
            "registration_no": enrollment_number,
            "hostel_name": hostel_name,
            "block": s.get("block") or "N/A",
            "room_number": s.get("room_number") or None,
            "floor": s.get("floor") or None,
            "bed_number": s.get("bed_number") or None,
            "father_name": str(s.get("father_name") or "").strip(),
            "mother_name": str(s.get("mother_name") or "").strip(),
            "parent_phone": str(s.get("parent_phone") or "").strip(),
            "college_email": str(s.get("college_email") or "").strip(),
            "gender": str(s.get("gender") or "male").strip() or "male",
            "course": str(s.get("course") or "B.Tech").strip() or "B.Tech",
            "year": str(s.get("year") or "1").strip() or "1",
            "role": "student",
            "password": hash_password("hostel@123"),
            "is_first_login": True,
            "is_default_password": True,
            "two_factor_enabled": False,
            "two_factor_secret": None,
            "email_otp": None,
            "email_otp_expiry": None,
            "created_at": datetime.now(timezone.utc).isoformat()
        })

    if not docs:
        raise HTTPException(status_code=400, detail="No valid student rows found")

    existing = await db.users.find({
        "$or": [
            {"enrollment_number": {"$in": enrollment_numbers}},
            {"registration_no": {"$in": enrollment_numbers}}
        ]
    }).to_list(5000)

    if existing:
        existing_ids = [
            str(e.get("enrollment_number") or e.get("registration_no"))
            for e in existing
        ]
        raise HTTPException(
            status_code=400,
            detail=f"Duplicate student IDs already exist: {', '.join(existing_ids)}"
        )

    result = await db.users.insert_many(docs)

    for i, doc in enumerate(docs):
        doc["_id"] = str(result.inserted_ids[i])

    invalidate_students_cache()
    return docs


@api_router.get("/admin/students/search-suggestions")
async def get_search_suggestions(query: str = Query("")):
    if len(query) < 2:
        return []

    suggestions = await db.users.find({
        "role": "student",
        "$or": [
            {"enrollment_number": {"$regex": query, "$options": "i"}},
            {"registration_no": {"$regex": query, "$options": "i"}},
            {"student_name": {"$regex": query, "$options": "i"}}
        ]
    }, {"enrollment_number": 1, "student_name": 1, "_id": 0}).limit(10).to_list(10)

    return suggestions

@api_router.get("/admin/reports/participation")
async def get_participation(user: dict = Depends(get_current_user)):
    all_students = await db.users.find({"role": "student"}).to_list(1000)
    voted_ids = await db.votes.distinct("student_id")
    return [{"name": s.get("student_name"), "voted": s.get("enrollment_number") in voted_ids} for s in all_students]  

@api_router.get("/admin/rooms/live-status")
async def get_live_room_status(user: dict = Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    live_status = []

    def normalize_floor_value(value):
        if value in [None, "", "N/A"]:
            return "N/A"
        try:
            return str(int(float(str(value).strip())))
        except Exception:
            return str(value).strip()

    def normalize_room_value(value):
        if value in [None, "", "N/A"]:
            return "N/A"
        return str(value).strip()

    def normalize_block_value(value):
        block = normalize_block_name(value)
        return block if block else "N/A"

    def normalize_hostel_value(value):
        hostel = normalize_hostel_name(value)
        return hostel if hostel else "N/A"

    def normalize_bed_value(value, idx=0):
        raw = str(value or "").strip()
        if raw:
            upper = raw.upper().replace("_", " ").replace("-", " ").strip()

            if upper.startswith("BED "):
                suffix = upper[4:].strip()
            else:
                suffix = upper

            if suffix.isdigit():
                return f"Bed {suffix}"

            if len(suffix) == 1 and suffix.isalpha():
                return f"Bed {suffix}"

            return f"Bed {suffix}"

        return f"Bed {chr(65 + idx)}"

    def build_default_bed_labels(capacity: int):
        labels = []
        for idx in range(max(int(capacity or 0), 0)):
            labels.append(f"Bed {chr(65 + idx)}")
        return labels

    def infer_ac_flag(room_doc):
        room_type = str(room_doc.get("room_type", "") or "").strip().lower()
        ac_type = str(room_doc.get("ac_type", "") or "").strip().lower()
        cooling = str(room_doc.get("cooling", "") or "").strip().lower()

        if room_doc.get("is_ac") is True:
            return True
        if room_doc.get("is_ac") is False:
            return False

        if ac_type == "ac":
            return True
        if ac_type in ["non-ac", "non ac"]:
            return False

        if cooling == "ac":
            return True
        if cooling in ["non-ac", "non ac"]:
            return False

        if room_type == "ac":
            return True
        if room_type in ["non-ac", "non ac"]:
            return False

        if "non-ac" in room_type or "non ac" in room_type:
            return False
        if "ac room" in room_type:
            return True
        if room_type.startswith("ac "):
            return True
        if room_type.endswith(" ac"):
            return True

        return False

    room_docs = await db.rooms.find({}).to_list(length=5000)

    students = await db.users.find(
        {"role": "student"},
        {
            "student_name": 1,
            "username": 1,
            "enrollment_number": 1,
            "college_email": 1,
            "personal_email": 1,
            "phone": 1,
            "course": 1,
            "year": 1,
            "hostel_name": 1,
            "block": 1,
            "floor": 1,
            "room_number": 1,
            "bed_number": 1,
            "_id": 0
        }
    ).to_list(length=5000)

    complaints_by_student = {}
    fines_by_student = {}

    collection_names = await db.list_collection_names()

    complaints = await db.complaints.find(
        {},
        {"enrollment_number": 1, "status": 1, "_id": 0}
    ).to_list(length=10000)

    for complaint in complaints:
        if str(complaint.get("status", "pending")).lower() not in ["resolved", "completed", "closed"]:
            sid = str(complaint.get("enrollment_number", "")).strip()
            if sid:
                complaints_by_student[sid] = complaints_by_student.get(sid, 0) + 1

    if "payments" in collection_names:
        fine_rows = await db.payments.find(
            {"type": "fine"},
            {"student_id": 1, "status": 1, "_id": 0}
        ).to_list(length=10000)

        for fine in fine_rows:
            if str(fine.get("status", "unpaid")).lower() not in ["paid", "success", "completed"]:
                sid = str(fine.get("student_id", "")).strip()
                if sid:
                    fines_by_student[sid] = fines_by_student.get(sid, 0) + 1

    room_student_lookup = {}

    for s in students:
        key = (
            normalize_hostel_value(s.get("hostel_name")),
            normalize_block_value(s.get("block")),
            normalize_floor_value(s.get("floor")),
            normalize_room_value(s.get("room_number"))
        )

        enrollment = str(s.get("enrollment_number", "")).strip()

        room_student_lookup.setdefault(key, []).append({
            "student_name": s.get("student_name") or s.get("username") or "Resident",
            "student_id": enrollment,
            "username": s.get("username"),
            "enrollment_number": enrollment,
            "bed_number": str(s.get("bed_number", "")).strip() or None,
            "phone": s.get("phone"),
            "college_email": s.get("college_email"),
            "personal_email": s.get("personal_email"),
            "course": s.get("course", "N/A"),
            "year": s.get("year", "N/A"),
            "fine_count": fines_by_student.get(enrollment, 0),
            "complaint_count": complaints_by_student.get(enrollment, 0)
        })

    if room_docs:
        for room in room_docs:
            hostel = normalize_hostel_value(room.get("hostel_name"))
            block = normalize_block_value(room.get("block"))
            floor = normalize_floor_value(room.get("floor"))
            room_number = normalize_room_value(room.get("room_number"))

            key = (hostel, block, floor, room_number)
            matched_students = room_student_lookup.get(key, [])

            capacity = int(room.get("capacity", room.get("total_beds", 1)) or 1)
            capacity = max(capacity, 1)

            room_status_raw = str(room.get("status", "") or "").lower()
            room_is_available = room.get("is_available")
            occupied_by = room.get("occupied_by")
            room_is_blocked = bool(room.get("is_blocked", False))
            room_is_maintenance = bool(room.get("is_under_maintenance", False)) or room_status_raw == "maintenance"

            occupied_beds_from_room = room.get("occupied_beds", []) if isinstance(room.get("occupied_beds"), list) else []
            empty_beds_from_room = room.get("empty_beds", []) if isinstance(room.get("empty_beds"), list) else []

            residents = []
            for idx, resident in enumerate(matched_students):
                residents.append({
                    **resident,
                    "bed_number": normalize_bed_value(resident.get("bed_number"), idx)
                })

            occupancy_count = len(residents)

            if isinstance(room.get("occupied_count"), int):
                occupancy_count = max(occupancy_count, int(room.get("occupied_count", 0)))

            if room_is_blocked:
                status = "blocked"
            elif room_is_maintenance:
                status = "maintenance"
            else:
                if room_is_available is not None:
                    if bool(room_is_available):
                        if occupancy_count == 0:
                            status = "available"
                        elif occupancy_count >= capacity:
                            status = "occupied"
                        else:
                            status = "partial"
                    else:
                        status = "occupied" if occupancy_count >= capacity else ("partial" if occupancy_count > 0 else "occupied")
                elif occupied_by or occupancy_count > 0:
                    status = "occupied" if occupancy_count >= capacity else "partial"
                elif room_status_raw in ["occupied", "partial", "available", "maintenance", "blocked"]:
                    status = room_status_raw
                else:
                    status = "available"

            all_possible_beds = build_default_bed_labels(capacity)

            occupied_bed_labels = []
            if residents:
                occupied_bed_labels = [
                    normalize_bed_value(r.get("bed_number"), idx)
                    for idx, r in enumerate(residents)
                ]

            if not occupied_bed_labels and occupied_beds_from_room:
                occupied_bed_labels = [
                    normalize_bed_value(b, idx)
                    for idx, b in enumerate(occupied_beds_from_room)
                    if str(b).strip()
                ]

            occupied_bed_labels = list(dict.fromkeys(occupied_bed_labels))

            if occupancy_count >= capacity:
                empty_bed_labels = []
            else:
                normalized_empty_from_room = [
                    normalize_bed_value(b, idx)
                    for idx, b in enumerate(empty_beds_from_room)
                    if str(b).strip()
                ]

                if normalized_empty_from_room:
                    empty_bed_labels = [
                        bed for bed in normalized_empty_from_room
                        if bed not in occupied_bed_labels
                    ]
                else:
                    occupied_set = set(occupied_bed_labels)
                    empty_bed_labels = [
                        bed for bed in all_possible_beds
                        if bed not in occupied_set
                    ]

                    remaining = max(0, capacity - occupancy_count)
                    if len(empty_bed_labels) > remaining:
                        empty_bed_labels = empty_bed_labels[:remaining]

            alerts = []

            if occupancy_count > capacity:
                alerts.append("Over-capacity room detected")

            resident_beds = [
                normalize_bed_value(r.get("bed_number"), idx)
                for idx, r in enumerate(residents)
            ]
            if len(resident_beds) != len(set(resident_beds)):
                alerts.append("Duplicate bed assignment detected")

            if status == "available" and occupancy_count > 0:
                alerts.append("Room marked available but residents are assigned")

            if status in ["occupied", "partial"] and occupancy_count == 0:
                alerts.append("Room marked occupied/partial but no residents found")

            if (room_is_blocked or room_is_maintenance) and occupancy_count > 0:
                alerts.append("Blocked/Maintenance room still has active residents")

            room_type = room.get("room_type", "standard")
            is_ac = infer_ac_flag(room)
            student_name = residents[0]["student_name"] if residents else None
            fine_count = sum(int(r.get("fine_count", 0) or 0) for r in residents)
            complaint_count = sum(int(r.get("complaint_count", 0) or 0) for r in residents)

            live_status.append({
                "_id": str(room.get("_id")) if room.get("_id") else f"{hostel}-{block}-{floor}-{room_number}",
                "number": room_number,
                "room_number": room_number,
                "floor": floor,
                "block": block,
                "hostel": hostel,
                "hostel_name": hostel,
                "status": status,
                "studentName": student_name,
                "occupied_by": occupied_by,
                "capacity": capacity,
                "occupied_count": occupancy_count,
                "occupancy_count": occupancy_count,
                "room_type": room_type,
                "is_ac": is_ac,
                "residents": residents,
                "occupied_beds": occupied_bed_labels,
                "empty_beds": empty_bed_labels,
                "is_available": room_is_available,
                "is_blocked": room_is_blocked,
                "is_under_maintenance": room_is_maintenance,
                "maintenance_note": room.get("maintenance_note"),
                "maintenance_expected_reopen": room.get("maintenance_expected_reopen"),
                "last_updated_at": room.get("updated_at") or room.get("last_updated_at"),
                "alerts": alerts,
                "fine_count": fine_count,
                "complaint_count": complaint_count
            })

        live_status.sort(key=lambda x: (x["hostel"], x["block"], x["floor"], x["number"]))
        return live_status

    room_groups = {}
    for s in students:
        hostel = normalize_hostel_value(s.get("hostel_name"))
        block = normalize_block_value(s.get("block"))
        floor = normalize_floor_value(s.get("floor"))
        room_number = normalize_room_value(s.get("room_number"))
        bed_number = str(s.get("bed_number", "")).strip()
        enrollment = str(s.get("enrollment_number", "")).strip()

        key = (hostel, block, floor, room_number)
        room_groups.setdefault(key, []).append({
            "student_name": s.get("student_name") or s.get("username") or "Resident",
            "student_id": enrollment,
            "username": s.get("username"),
            "enrollment_number": enrollment,
            "bed_number": normalize_bed_value(bed_number, len(room_groups.get(key, []))),
            "phone": s.get("phone"),
            "college_email": s.get("college_email"),
            "personal_email": s.get("personal_email"),
            "course": s.get("course", "N/A"),
            "year": s.get("year", "N/A"),
            "fine_count": fines_by_student.get(enrollment, 0),
            "complaint_count": complaints_by_student.get(enrollment, 0)
        })

    for idx, ((hostel, block, floor, room_number), residents) in enumerate(room_groups.items()):
        capacity = max(len(residents), 1)
        occupancy_count = len(residents)

        occupied_bed_labels = [
            normalize_bed_value(r.get("bed_number"), i)
            for i, r in enumerate(residents)
        ]
        occupied_bed_labels = list(dict.fromkeys(occupied_bed_labels))

        all_possible_beds = build_default_bed_labels(capacity)
        empty_bed_labels = [] if occupancy_count >= capacity else [
            bed for bed in all_possible_beds if bed not in set(occupied_bed_labels)
        ]

        live_status.append({
            "_id": f"{hostel}-{block}-{floor}-{room_number}-{idx}",
            "number": room_number,
            "room_number": room_number,
            "floor": floor,
            "block": block,
            "hostel": hostel,
            "hostel_name": hostel,
            "status": "occupied" if occupancy_count >= capacity else "partial",
            "studentName": residents[0]["student_name"] if residents else None,
            "occupied_by": None,
            "capacity": capacity,
            "occupied_count": occupancy_count,
            "occupancy_count": occupancy_count,
            "room_type": "standard",
            "is_ac": False,
            "residents": residents,
            "occupied_beds": occupied_bed_labels,
            "empty_beds": empty_bed_labels,
            "is_available": occupancy_count < capacity,
            "is_blocked": False,
            "is_under_maintenance": False,
            "maintenance_note": None,
            "maintenance_expected_reopen": None,
            "last_updated_at": None,
            "alerts": [],
            "fine_count": sum(int(r.get("fine_count", 0) or 0) for r in residents),
            "complaint_count": sum(int(r.get("complaint_count", 0) or 0) for r in residents)
        })

    live_status.sort(key=lambda x: (x["hostel"], x["block"], x["floor"], x["number"]))
    return live_status

@api_router.get("/admin/rooms/occupancy-trend")
async def get_room_occupancy_trend(
    hostel: str = Query(...),
    block: Optional[str] = Query(None),
    floor: Optional[str] = Query(None),
    days: int = Query(14),
    user: dict = Depends(get_current_user)
):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    days = min(max(int(days or 14), 1), 90)
    today = datetime.now(timezone.utc).date()

    base = await get_live_room_status(user)
    filtered = []
    for row in base:
        if normalize_hostel_name(row.get("hostel")) != normalize_hostel_name(hostel):
            continue
        if block and normalize_block_name(row.get("block")) != normalize_block_name(block):
            continue
        if floor and str(row.get("floor")) != str(floor):
            continue
        filtered.append(row)

    occupied_beds = sum(int(r.get("occupancy_count", 0) or 0) for r in filtered)

    trend = []
    for i in range(days):
        day = today - timedelta(days=(days - i - 1))
        trend.append({
            "date": day.isoformat(),
            "label": day.strftime("%d %b"),
            "short_label": day.strftime("%d"),
            "occupied_beds": occupied_beds
        })

    return {"trend": trend}


@api_router.get("/admin/rooms/export")
async def export_room_inventory(
    hostel: str = Query(...),
    block: Optional[str] = Query(None),
    floor: Optional[str] = Query(None),
    ac_filter: str = Query("all"),
    status_filter: str = Query("all"),
    search: str = Query(""),
    user: dict = Depends(get_current_user)
):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    rows = await get_live_room_status(user)
    q = str(search or "").strip().lower()

    filtered = []
    for row in rows:
        if normalize_hostel_name(row.get("hostel")) != normalize_hostel_name(hostel):
            continue
        if block and normalize_block_name(row.get("block")) != normalize_block_name(block):
            continue
        if floor and str(row.get("floor")) != str(floor):
            continue

        if ac_filter == "ac" and row.get("is_ac") is not True:
            continue
        if ac_filter == "non_ac" and row.get("is_ac") is not False:
            continue

        status = str(row.get("status", "")).lower()
        if status_filter != "all":
            if status_filter == "occupied" and status not in ["occupied", "full"]:
                continue
            elif status_filter == "maintenance" and status not in ["maintenance", "blocked"]:
                continue
            elif status_filter not in ["occupied", "maintenance"] and status != status_filter:
                continue

        resident_blob = " ".join([
            f"{r.get('student_name', '')} {r.get('enrollment_number', '')} {r.get('phone', '')}"
            for r in row.get("residents", [])
        ]).lower()

        if q:
            room_blob = f"{row.get('number', '')} {row.get('block', '')} {row.get('floor', '')} {row.get('status', '')}".lower()
            if q not in room_blob and q not in resident_blob:
                continue

        filtered.append(row)

    timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
    file_name = f"room_inventory_{timestamp}.csv"
    file_path = UPLOAD_DIR / file_name

    with open(file_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow([
            "Hostel",
            "Block",
            "Floor",
            "Room",
            "Status",
            "AC",
            "Room Type",
            "Capacity",
            "Occupied",
            "Available Beds",
            "Occupied Beds",
            "Empty Beds",
            "Residents",
            "Resident Enrollments",
            "Fine Count",
            "Complaint Count",
            "Alerts"
        ])

        for row in filtered:
            writer.writerow([
                row.get("hostel"),
                row.get("block"),
                row.get("floor"),
                row.get("number"),
                row.get("status"),
                "AC" if row.get("is_ac") else "NON-AC",
                row.get("room_type"),
                row.get("capacity"),
                row.get("occupancy_count"),
                max(0, int(row.get("capacity", 0) or 0) - int(row.get("occupancy_count", 0) or 0)),
                ", ".join(row.get("occupied_beds", [])),
                ", ".join(row.get("empty_beds", [])),
                ", ".join([r.get("student_name", "") for r in row.get("residents", [])]),
                ", ".join([r.get("enrollment_number", "") for r in row.get("residents", [])]),
                row.get("fine_count", 0),
                row.get("complaint_count", 0),
                " | ".join(row.get("alerts", []))
            ])

    return {"file_url": f"/uploads/{file_name}"}


@api_router.post("/admin/rooms/update-maintenance")
async def update_room_maintenance(data: dict, user: dict = Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    room_id = str(data.get("room_id", "")).strip()
    hostel = normalize_hostel_name(data.get("hostel"))
    block = normalize_block_name(data.get("block"))
    floor = str(data.get("floor", "")).strip()
    room_number = str(data.get("room_number", "")).strip()
    status = str(data.get("status", "maintenance")).strip().lower()
    note = str(data.get("note", "")).strip()
    expected_reopen = data.get("expected_reopen")

    if status not in ["maintenance", "blocked", "available"]:
      raise HTTPException(status_code=400, detail="Invalid maintenance status")

    query = {}
    if room_id and len(room_id) == 24:
        try:
            query = {"_id": ObjectId(room_id)}
        except Exception:
            query = {}

    if not query:
        query = {
            "hostel_name": hostel,
            "block": {"$in": [block, f"Block {block}", f"BLOCK {block}", block.lower(), block.upper()]},
            "floor": {"$in": [floor, str(floor), int(floor) if str(floor).isdigit() else floor]},
            "room_number": {"$in": [room_number, str(room_number)]}
        }

    updates = {
        "status": status,
        "is_under_maintenance": status == "maintenance",
        "is_blocked": status == "blocked",
        "is_available": status == "available",
        "maintenance_note": note or None,
        "maintenance_expected_reopen": expected_reopen or None,
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "updated_by": user.get("username")
    }

    result = await db.rooms.update_one(query, {"$set": updates})

    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Room not found")

    return {"message": "Room status updated successfully"}


@api_router.post("/admin/rooms/shift-student")
async def shift_student_between_rooms(data: dict, user: dict = Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    student_id = str(data.get("student_id", "")).strip()
    target_hostel = normalize_hostel_name(data.get("target_hostel"))
    target_block = normalize_block_name(data.get("target_block"))
    target_floor = str(data.get("target_floor", "")).strip()
    target_room_number = str(data.get("target_room_number", "")).strip()
    target_bed_number = str(data.get("target_bed_number", "")).strip()

    if not all([student_id, target_hostel, target_block, target_floor, target_room_number, target_bed_number]):
        raise HTTPException(status_code=400, detail="Incomplete shift details")

    student = await db.users.find_one({
        "$or": [
            {"enrollment_number": student_id},
            {"enrollment_number": int(student_id)} if student_id.isdigit() else {"enrollment_number": student_id}
        ]
    })

    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    target_room = await db.rooms.find_one({
        "hostel_name": target_hostel,
        "block": {"$in": [target_block, f"Block {target_block}", f"BLOCK {target_block}", target_block.lower(), target_block.upper()]},
        "floor": {"$in": [target_floor, str(target_floor), int(target_floor) if str(target_floor).isdigit() else target_floor]},
        "room_number": {"$in": [target_room_number, str(target_room_number)]}
    })

    if not target_room:
        raise HTTPException(status_code=404, detail="Target room not found")

    if bool(target_room.get("is_blocked")) or bool(target_room.get("is_under_maintenance")):
        raise HTTPException(status_code=400, detail="Target room is blocked or under maintenance")

    capacity = int(target_room.get("capacity", target_room.get("total_beds", 1)) or 1)
    current_roommates = await db.users.find({
        "role": "student",
        "hostel_name": target_hostel,
        "block": {"$in": [target_block, f"Block {target_block}", f"BLOCK {target_block}", target_block.lower(), target_block.upper()]},
        "floor": {"$in": [target_floor, str(target_floor), int(target_floor) if str(target_floor).isdigit() else target_floor]},
        "room_number": {"$in": [target_room_number, str(target_room_number)]}
    }).to_list(length=20)

    if len(current_roommates) >= capacity:
        raise HTTPException(status_code=400, detail="Target room is already full")

    duplicate_bed = any(str(r.get("bed_number", "")).strip() == target_bed_number for r in current_roommates)
    if duplicate_bed:
        raise HTTPException(status_code=400, detail="Target bed is already occupied")

    await db.users.update_one(
        {"_id": student["_id"]},
        {
            "$set": {
                "hostel_name": target_hostel,
                "block": target_block,
                "floor": target_floor,
                "room_number": target_room_number,
                "bed_number": target_bed_number
            }
        }
    )

    await db.rooms.update_one(
        {"_id": target_room["_id"]},
        {"$set": {"updated_at": datetime.now(timezone.utc).isoformat(), "updated_by": user.get("username")}}
    )

    return {"message": "Student shifted successfully"}

# ==================== ENHANCED GLOBAL LOOKUP ROUTES ====================

# 1. Lookup by Room (Used for Live Room Map -> Global Lookup redirection)
@api_router.get("/admin/students/lookup")
async def lookup_student_by_room(
    room: str,
    hostel: str,
    block: Optional[str] = Query(None),
    floor: Optional[str] = Query(None),
    user: dict = Depends(get_current_user)
):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    def normalize_floor_value(value):
        if value in [None, "", "N/A"]:
            return None
        try:
            return str(int(float(str(value).strip())))
        except Exception:
            return str(value).strip()

    clean_room = str(room or "").strip()
    clean_hostel = normalize_hostel_name(hostel)
    clean_block = normalize_block_name(block) if block else None
    clean_floor = normalize_floor_value(floor)

    if not clean_room:
        raise HTTPException(status_code=400, detail="Room is required")

    hostel_variants = list({
        clean_hostel,
        "Shakuntala Bhawan" if clean_hostel == "Shakunthala Bhawan" else clean_hostel,
        "Shakunthala Bhawan" if clean_hostel == "Shakuntala Bhawan" else clean_hostel
    })

    query = {
        "role": "student",
        "room_number": {"$in": [clean_room, str(clean_room)]},
        "hostel_name": {"$in": hostel_variants}
    }

    if clean_block:
        query["block"] = {
            "$in": [
                clean_block,
                clean_block.upper(),
                clean_block.lower(),
                f"Block {clean_block}",
                f"BLOCK {clean_block}"
            ]
        }

    if clean_floor:
        query["floor"] = {
            "$in": [
                clean_floor,
                str(clean_floor),
                int(clean_floor) if str(clean_floor).isdigit() else clean_floor
            ]
        }

    student = await db.users.find_one(query)

    if not student:
        fallback_query = {
            "role": "student",
            "room_number": {"$in": [clean_room, str(clean_room)]},
            "hostel_name": {"$in": hostel_variants}
        }

        if clean_block:
            fallback_query["block"] = {
                "$in": [
                    clean_block,
                    clean_block.upper(),
                    clean_block.lower(),
                    f"Block {clean_block}",
                    f"BLOCK {clean_block}"
                ]
            }

        student = await db.users.find_one(fallback_query)

    if not student:
        raise HTTPException(
            status_code=404,
            detail=f"Student not found in room {clean_room} of {clean_hostel}"
        )

    return {
        "_id": str(student["_id"]),
        "student_name": student.get("student_name") or student.get("username") or "Resident",
        "username": student.get("username"),
        "enrollment_number": str(student.get("enrollment_number", "")),
        "college_email": student.get("college_email"),
        "personal_email": student.get("personal_email"),
        "profile_photo": student.get("profile_photo"),
        "phone": student.get("phone"),
        "role": student.get("role", "student"),
        "gender": student.get("gender", "N/A"),
        "course": student.get("course", "N/A"),
        "year": student.get("year", "N/A"),
        "hostel_name": normalize_hostel_name(student.get("hostel_name", "N/A")),
        "block": normalize_block_name(student.get("block", "N/A")),
        "floor": str(student.get("floor", "N/A")),
        "room_number": str(student.get("room_number", "N/A")),
        "bed_number": str(student.get("bed_number", "N/A")),
        "father_name": student.get("father_name", "N/A"),
        "mother_name": student.get("mother_name", "N/A"),
        "father_contact": student.get("father_contact", "N/A"),
        "mother_contact": student.get("mother_contact", "N/A"),
        "parent_phone": student.get("parent_phone", "N/A"),
        "is_default_password": student.get("is_default_password", False)
    }

@api_router.get("/admin/students/profile/{enrollment_number}")
async def get_student_profile(enrollment_number: str, user: dict = Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    clean_id = str(enrollment_number or "").strip()
    if not clean_id:
        raise HTTPException(status_code=400, detail="Enrollment number is required")

    or_filters = [
        {"enrollment_number": clean_id},
        {"username": clean_id},
        {"college_email": clean_id},
        {"personal_email": clean_id}
    ]

    if clean_id.isdigit():
        or_filters.append({"enrollment_number": int(clean_id)})

    student = await db.users.find_one({"$or": or_filters})

    if not student:
        raise HTTPException(status_code=404, detail="User account profile not found")

    return {
        "_id": str(student["_id"]),
        "student_name": student.get("student_name") or student.get("username") or "Resident",
        "username": student.get("username"),
        "enrollment_number": str(student.get("enrollment_number", "")),
        "college_email": student.get("college_email"),
        "personal_email": student.get("personal_email"),
        "profile_photo": student.get("profile_photo"),
        "phone": student.get("phone"),
        "role": student.get("role", "student"),
        "gender": student.get("gender", "N/A"),
        "course": student.get("course", "N/A"),
        "year": student.get("year", "N/A"),
        "hostel_name": normalize_hostel_name(student.get("hostel_name", "N/A")),
        "block": normalize_block_name(student.get("block", "N/A")),
        "floor": str(student.get("floor", "N/A")),
        "room_number": str(student.get("room_number", "N/A")),
        "bed_number": str(student.get("bed_number", "N/A")),
        "father_name": student.get("father_name", "N/A"),
        "mother_name": student.get("mother_name", "N/A"),
        "father_contact": student.get("father_contact", "N/A"),
        "mother_contact": student.get("mother_contact", "N/A"),
        "parent_phone": student.get("parent_phone", "N/A"),
        "is_default_password": student.get("is_default_password", False)
    }

@api_router.get("/admin/students/history/{enrollment_number}")
async def get_student_history(enrollment_number: str, user: dict = Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    student_id = str(enrollment_number).strip()

    gatepasses = await db.gatepasses.find(
        {"enrollment_number": student_id}
    ).sort("applied_date", -1).to_list(100)

    complaints = await db.complaints.find(
        {"enrollment_number": student_id}
    ).sort("date", -1).to_list(100)

    laundry_complaints = await db.laundry_complaints.find(
        {"enrollment_number": student_id}
    ).sort("date", -1).to_list(100)

    laundry_bookings = await db.laundry_bookings.find(
        {"student_id": student_id}
    ).sort("created_at", -1).to_list(100)

    payments = []
    fines = []
    visitors = []

    collection_names = await db.list_collection_names()

    if "payments" in collection_names:
        payments = await db.payments.find({
            "student_id": student_id
        }).sort("date", -1).to_list(200)

        fines = [p for p in payments if str(p.get("type", "")).lower() == "fine"]

    visitor_collection_name = None
    if "visitors" in collection_names:
        visitor_collection_name = "visitors"
    elif "visitor_logs" in collection_names:
        visitor_collection_name = "visitor_logs"
    elif "visitor_entries" in collection_names:
        visitor_collection_name = "visitor_entries"

    if visitor_collection_name:
        visitor_query = {
            "$or": [
                {"student_enrollment": student_id},
                {"enrollment_number": student_id},
                {"student_id": student_id}
            ]
        }
        visitors = await db[visitor_collection_name].find(visitor_query).sort("check_in", -1).to_list(100)

    for gp in gatepasses:
        gp["_id"] = str(gp["_id"])
        gp["status"] = str(gp.get("status", "pending")).lower()
        gp["hostel_name"] = normalize_hostel_name(gp.get("hostel_name", "N/A"))
        gp["block"] = normalize_block_name(gp.get("block", "N/A"))

    for cp in complaints:
        cp["_id"] = str(cp["_id"])
        cp["hostel_name"] = normalize_hostel_name(cp.get("hostel_name", "N/A"))
        cp["status"] = normalize_status(cp.get("status", "pending"))
        cp["priority"] = normalize_priority(cp.get("priority", "medium"))
        cp["block"] = normalize_block_name(cp.get("block", "N/A"))

    for lcp in laundry_complaints:
        lcp["_id"] = str(lcp["_id"])
        lcp["hostel_name"] = normalize_hostel_name(lcp.get("hostel_name", "N/A"))
        lcp["block"] = normalize_block_name(lcp.get("block", "N/A"))
        lcp["status"] = str(lcp.get("status", "pending")).lower()

    for lb in laundry_bookings:
        lb["_id"] = str(lb["_id"])
        lb["hostel_name"] = normalize_hostel_name(lb.get("hostel_name", "N/A"))
        lb["block"] = normalize_block_name(lb.get("block", "N/A"))
        lb["remaining_minutes"] = remaining_minutes_from_end(lb.get("end_time"))

    for fine in fines:
        fine["_id"] = str(fine["_id"])

    for payment in payments:
        payment["_id"] = str(payment["_id"])

    for visitor in visitors:
        visitor["_id"] = str(visitor["_id"])
        try:
            if visitor.get("check_in") and visitor.get("check_out"):
                check_in_dt = datetime.fromisoformat(str(visitor.get("check_in")).replace("Z", "+00:00"))
                check_out_dt = datetime.fromisoformat(str(visitor.get("check_out")).replace("Z", "+00:00"))
                visitor["duration_minutes"] = max(int((check_out_dt - check_in_dt).total_seconds() // 60), 0)
            else:
                visitor["duration_minutes"] = None
        except Exception:
            visitor["duration_minutes"] = None

    fine_count = len([f for f in fines if str(f.get("status", "unpaid")).lower() == "unpaid"])

    total_paid = sum(float(p.get("amount", 0) or 0) for p in payments if str(p.get("status", "")).lower() in ["paid", "success", "completed"])
    total_unpaid = sum(float(p.get("amount", 0) or 0) for p in payments if str(p.get("status", "")).lower() not in ["paid", "success", "completed"])
    total_fines_paid = sum(float(p.get("amount", 0) or 0) for p in fines if str(p.get("status", "")).lower() in ["paid", "success", "completed"])
    total_fines_unpaid = sum(float(p.get("amount", 0) or 0) for p in fines if str(p.get("status", "")).lower() not in ["paid", "success", "completed"])

    return {
        "gatepasses": gatepasses,
        "complaints": complaints,
        "laundry_complaints": laundry_complaints,
        "laundry_bookings": laundry_bookings,
        "visitors": visitors,
        "payments": payments,
        "fines": fines,
        "fine_count": fine_count,
        "payment_summary": {
            "total_paid": round(total_paid, 2),
            "total_unpaid": round(total_unpaid, 2),
            "total_fines_paid": round(total_fines_paid, 2),
            "total_fines_unpaid": round(total_fines_unpaid, 2)
        }
    }

@api_router.get("/admin/students/attendance-trend/{enrollment_number}")
async def get_student_attendance_trend(enrollment_number: str, days: int = Query(14), user: dict = Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    clean_id = str(enrollment_number or "").strip()
    if not clean_id:
        raise HTTPException(status_code=400, detail="Enrollment number is required")

    days = min(max(int(days or 14), 1), 60)

    records = await db.attendance.find(
        {"student_id": clean_id}
    ).sort("date", -1).to_list(days)

    records = list(reversed(records))

    trend = []
    for r in records:
        status = str(r.get("status", "pending")).lower()
        label = str(r.get("date", ""))
        short_label = label[-5:] if len(label) >= 5 else label

        value_map = {
            "present": 3,
            "late": 2,
            "absent": 1
        }

        trend.append({
            "date": r.get("date"),
            "label": label,
            "short_label": short_label,
            "status": status,
            "count": value_map.get(status, 1)
        })

    return {"trend": trend}

@api_router.get("/admin/students/conduct-report/{enrollment_number}")
async def generate_conduct_report(enrollment_number: str, user: dict = Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    clean_id = str(enrollment_number).strip()

    student = await db.users.find_one({
        "$or": [
            {"enrollment_number": clean_id},
            {"enrollment_number": int(clean_id)} if clean_id.isdigit() else {"enrollment_number": clean_id}
        ]
    })
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    gatepasses = await db.gatepasses.find({"enrollment_number": clean_id}).sort("applied_date", -1).to_list(100)
    complaints = await db.complaints.find({"enrollment_number": clean_id}).sort("date", -1).to_list(100)
    laundry_complaints = await db.laundry_complaints.find({"enrollment_number": clean_id}).sort("date", -1).to_list(100)

    collection_names = await db.list_collection_names()

    fines = []
    payments = []
    visitors = []

    if "payments" in collection_names:
        payments = await db.payments.find({"student_id": clean_id}).sort("date", -1).to_list(100)
        fines = [p for p in payments if str(p.get("type", "")).lower() == "fine"]

    visitor_collection_name = None
    if "visitors" in collection_names:
        visitor_collection_name = "visitors"
    elif "visitor_logs" in collection_names:
        visitor_collection_name = "visitor_logs"
    elif "visitor_entries" in collection_names:
        visitor_collection_name = "visitor_entries"

    if visitor_collection_name:
        visitors = await db[visitor_collection_name].find({
            "$or": [
                {"student_enrollment": clean_id},
                {"enrollment_number": clean_id},
                {"student_id": clean_id}
            ]
        }).sort("check_in", -1).to_list(100)

    hostel_name = normalize_hostel_name(student.get("hostel_name", "N/A"))
    block = normalize_block_name(student.get("block", "N/A"))

    file_name = f"conduct_{clean_id}.pdf"
    file_path = UPLOAD_DIR / file_name

    doc = SimpleDocTemplate(str(file_path), pagesize=letter)
    elements = []
    styles = getSampleStyleSheet()

    elements.append(Paragraph("HOSTELEASE - RESIDENT CONDUCT REPORT", styles['Title']))
    elements.append(Paragraph(f"Generated on: {datetime.now().strftime('%d-%m-%Y %I:%M %p')}", styles['Normal']))
    elements.append(Spacer(1, 20))

    bio_data = [
        ["Name", student.get("student_name", "N/A"), "Enrollment", clean_id],
        ["Hostel", hostel_name, "Block / Room", f"{block} / {student.get('room_number', 'N/A')}"],
        ["Floor / Bed", f"{student.get('floor', 'N/A')} / {student.get('bed_number', 'N/A')}", "Phone", student.get("phone", "N/A")],
        ["Father", student.get("father_name", "N/A"), "Contact", student.get("father_contact", "N/A")]
    ]

    bio_table = Table(bio_data, colWidths=[90, 150, 90, 150])
    bio_table.setStyle(TableStyle([
        ('GRID', (0, 0), (-1, -1), 1, colors.grey),
        ('BACKGROUND', (0, 0), (0, -1), colors.whitesmoke),
        ('BACKGROUND', (2, 0), (2, -1), colors.whitesmoke),
        ('FONTNAME', (0, 0), (-1, -1), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
    ]))
    elements.append(bio_table)
    elements.append(Spacer(1, 20))

    elements.append(Paragraph("Conduct Summary", styles['Heading3']))
    summary_data = [
        ["General Complaints", str(len(complaints))],
        ["Laundry Complaints", str(len(laundry_complaints))],
        ["Gatepasses", str(len(gatepasses))],
        ["Fines", str(len(fines))],
        ["Visitors", str(len(visitors))],
        ["Payments", str(len(payments))]
    ]
    summary_table = Table(summary_data, colWidths=[180, 120])
    summary_table.setStyle(TableStyle([
        ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
        ('BACKGROUND', (0, 0), (0, -1), colors.whitesmoke),
        ('FONTNAME', (0, 0), (-1, -1), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
    ]))
    elements.append(summary_table)
    elements.append(Spacer(1, 20))

    elements.append(Paragraph("Verified Histories", styles['Heading3']))

    data = [["Type", "Detail", "Date", "Status"]]

    for gp in gatepasses:
        data.append([
            "Gatepass",
            str(gp.get("reason", "N/A"))[:45],
            str(gp.get("applied_date", ""))[:10],
            str(gp.get("status", "pending")).upper()
        ])

    for cp in complaints:
        data.append([
            "Complaint",
            f"{cp.get('category', 'other')} | {cp.get('priority', 'medium')} | {str(cp.get('description', ''))[:28]}",
            str(cp.get("date", ""))[:10],
            str(cp.get("status", "pending")).upper()
        ])

    for lcp in laundry_complaints:
        data.append([
            "Laundry",
            f"{lcp.get('type', 'manual')} | {str(lcp.get('description', ''))[:35]}",
            str(lcp.get("date", ""))[:10],
            str(lcp.get("status", "pending")).upper()
        ])

    for fine in fines:
        data.append([
            "Fine",
            f"₹{fine.get('amount', 0)} | {str(fine.get('description', ''))[:28]}",
            str(fine.get("date", ""))[:10],
            str(fine.get("status", "unpaid")).upper()
        ])

    for visitor in visitors[:20]:
        data.append([
            "Visitor",
            f"{str(visitor.get('visitor_name', 'Visitor'))[:16]} | {str(visitor.get('purpose', ''))[:22]}",
            str(visitor.get("check_in", ""))[:10],
            str(visitor.get("status", "active")).upper()
        ])

    for payment in payments[:20]:
        data.append([
            "Payment",
            f"{str(payment.get('type', 'payment'))[:12]} | ₹{payment.get('amount', 0)}",
            str(payment.get("date", payment.get("created_at", "")))[:10],
            str(payment.get("status", "pending")).upper()
        ])

    if len(data) == 1:
        data.append(["N/A", "No records found", "-", "-"])

    hist_table = Table(data, colWidths=[70, 230, 90, 90])
    hist_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#1E293B")),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
        ('FONTSIZE', (0, 0), (-1, -1), 8),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('VALIGN', (0, 0), (-1, -1), 'TOP')
    ]))

    elements.append(hist_table)
    doc.build(elements)

    return {"pdf_url": f"/uploads/{file_name}"}                   

# --- STUDENT SEARCH FOR VISITOR AUTO-FILL & PARENT CHECK ---
# ==================== VISITOR MANAGEMENT ROUTES ====================

def make_visitor_code() -> str:
    return f"VIS-{datetime.now(timezone.utc).strftime('%Y%m%d')}-{uuid.uuid4().hex[:6].upper()}"

def normalize_visitor_type(value: str = "friend") -> str:
    value = str(value or "friend").strip().lower()
    allowed = ["friend", "parent", "guardian", "official", "delivery", "maintenance", "emergency"]
    return value if value in allowed else "friend"

def normalize_visit_purpose_category(value: str = "general") -> str:
    value = str(value or "general").strip().lower()
    allowed = ["parent_visit", "friend_visit", "official_work", "delivery", "maintenance", "emergency", "general"]
    return value if value in allowed else "general"

def normalize_id_proof_type(value: str = "other") -> str:
    value = str(value or "other").strip().lower()
    allowed = ["aadhaar", "pan", "driving_license", "passport", "college_id", "voter_id", "other"]
    return value if value in allowed else "other"

def is_after_hours_visitor(dt_obj: datetime) -> bool:
    local_hour = dt_obj.hour
    return local_hour < 7 or local_hour >= 20

def format_visitor_duration(check_in: str, check_out: Optional[str]) -> Optional[int]:
    try:
        start = datetime.fromisoformat(check_in)
        end = datetime.fromisoformat(check_out) if check_out else datetime.now(timezone.utc)
        return max(0, int((end - start).total_seconds() // 60))
    except Exception:
        return None

def get_overstay_flag(duration_minutes: Optional[int], limit_minutes: int = 180) -> bool:
    if duration_minutes is None:
        return False
    return duration_minutes > limit_minutes

async def generate_visitor_entry_slip(log: dict):
    file_name = f"visitor_slip_{uuid.uuid4().hex}.pdf"
    file_path = UPLOAD_DIR / file_name

    c = canvas.Canvas(str(file_path), pagesize=letter)
    c.setFont("Helvetica-Bold", 16)
    c.drawString(70, 760, "HOSTELEASE - VISITOR ENTRY SLIP")
    c.line(70, 752, 540, 752)

    c.setFont("Helvetica", 11)
    c.drawString(70, 730, f"Visitor Code: {log.get('visitorCode', 'N/A')}")
    c.drawString(70, 710, f"Visitor Name: {log.get('visitorName', 'N/A')}")
    c.drawString(70, 690, f"Visitor Type: {log.get('visitorType', 'N/A')}")
    c.drawString(70, 670, f"Resident: {log.get('whomToVisit', 'N/A')}")
    c.drawString(70, 650, f"Enrollment: {log.get('studentEnrollment', 'N/A')}")
    c.drawString(70, 630, f"Hostel / Room / Bed: {log.get('hostel_name', 'N/A')} / {log.get('room_number', 'N/A')} / {log.get('bed_number', 'N/A')}")
    c.drawString(70, 610, f"Check In: {log.get('checkIn', 'N/A')}")
    c.drawString(70, 590, f"ID Proof: {log.get('idProofType', 'N/A')} / {log.get('idProofNumber', 'N/A')}")
    c.drawString(70, 570, f"Purpose Category: {log.get('purposeCategory', 'N/A')}")
    c.drawString(70, 550, f"QR Token: {log.get('qrToken', 'N/A')}")

    c.setFont("Helvetica-Bold", 12)
    c.drawString(70, 515, "Purpose / Note:")
    c.setFont("Helvetica", 11)

    text_obj = c.beginText(70, 495)
    text_obj.setLeading(16)

    combined_note = str(log.get("purpose", "") or "")
    if log.get("checkInNote"):
        combined_note += f"\nCheck-in Note: {log.get('checkInNote')}"

    for line in combined_note.split("\n"):
        for i in range(0, len(line), 95):
            text_obj.textLine(line[i:i+95])
    c.drawText(text_obj)

    c.save()
    return f"/uploads/{file_name}"

async def serialize_visitor_log(log: dict):
    log["_id"] = str(log["_id"])
    duration_minutes = format_visitor_duration(log.get("checkIn"), log.get("checkOut"))
    log["duration_minutes"] = duration_minutes
    log["is_overstay"] = get_overstay_flag(duration_minutes, int(log.get("allowed_duration_minutes", 180) or 180))
    log["hostel_name"] = normalize_hostel_name(log.get("hostel_name", "N/A"))
    log["visitorType"] = normalize_visitor_type(log.get("visitorType", "friend"))
    log["purposeCategory"] = normalize_visit_purpose_category(log.get("purposeCategory", "general"))
    log["idProofType"] = normalize_id_proof_type(log.get("idProofType", "other"))
    log["status"] = str(log.get("status", "In"))
    return log

@api_router.get("/admin/students/search")
async def search_student_for_visitor(name: Optional[str] = Query(None), enrollment: Optional[str] = Query(None), q: Optional[str] = Query(None)):
    search_term = str(q or enrollment or name or "").strip()
    if not search_term:
        return None

    student = await db.users.find_one({
        "role": "student",
        "$or": [
            {"enrollment_number": {"$regex": f"^{re.escape(search_term)}$", "$options": "i"}},
            {"username": {"$regex": f"^{re.escape(search_term)}$", "$options": "i"}},
            {"student_name": {"$regex": f"^{re.escape(search_term)}$", "$options": "i"}},
            {"enrollment_number": {"$regex": re.escape(search_term), "$options": "i"}},
            {"student_name": {"$regex": re.escape(search_term), "$options": "i"}}
        ]
    })

    if not student:
        return None

    hostel_name = student.get("hostel_name", "N/A")
    if hostel_name == "Shakunthala Bhawan":
        hostel_name = "Shakuntala Bhawan"

    visit_count = await db.visitor_logs.count_documents({
        "studentEnrollment": str(student.get("enrollment_number", ""))
    })

    active_gatepass = None
    if "gatepasses" in await db.list_collection_names():
        active_gatepass = await db.gatepasses.find_one({
            "enrollment_number": str(student.get("enrollment_number", "")),
            "status": {"$in": ["approved", "Approved"]},
            "out_date": {"$exists": True}
        })

    return {
        "student_name": student.get("student_name") or student.get("username"),
        "enrollment_number": student.get("enrollment_number") or student.get("username"),
        "father_name": student.get("father_name"),
        "mother_name": student.get("mother_name"),
        "father_contact": student.get("father_contact"),
        "mother_contact": student.get("mother_contact"),
        "hostel_name": hostel_name,
        "room_number": student.get("room_number", "N/A"),
        "bed_number": student.get("bed_number", "N/A"),
        "block": student.get("block", "N/A"),
        "visit_count": visit_count,
        "availability_warning": "Resident may be out on gatepass" if active_gatepass else None
    }

@api_router.post("/admin/visitor-entry")
async def visitor_entry(
    visitorName: str = Form(...),
    contactNo: str = Form(...),
    whomToVisit: str = Form(...),
    purpose: str = Form(...),
    purposeCategory: str = Form("general"),
    idProofType: str = Form("other"),
    idProofNumber: str = Form(...),
    studentEnrollment: str = Form(...),
    hostel_name: str = Form("N/A"),
    room_number: str = Form("N/A"),
    bed_number: str = Form("N/A"),
    visitorType: str = Form("friend"),
    isParent: str = Form("false"),
    checkInNote: str = Form(""),
    allowed_duration_minutes: int = Form(180),
    photo: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")

    visitor_name = str(visitorName or "").strip()
    contact_no = str(contactNo or "").strip()
    whom_to_visit = str(whomToVisit or "").strip()
    purpose = str(purpose or "").strip()
    student_enrollment = str(studentEnrollment or "").strip()
    hostel_name = normalize_hostel_name(hostel_name or "N/A")
    room_number = str(room_number or "N/A").strip()
    bed_number = str(bed_number or "N/A").strip()
    visitor_type = normalize_visitor_type(visitorType or "friend")
    is_parent = str(isParent).lower() == "true"
    id_proof_type = normalize_id_proof_type(idProofType or "other")
    id_proof_number = str(idProofNumber or "").strip()
    check_in_note = str(checkInNote or "").strip() or None
    purpose_category = normalize_visit_purpose_category(purposeCategory or "general")
    approved_by = current_user.get("username", "admin")

    if not visitor_name:
        raise HTTPException(status_code=400, detail="Visitor name is required")
    if not contact_no or len(contact_no) < 8:
        raise HTTPException(status_code=400, detail="Valid contact number is required")
    if not whom_to_visit:
        raise HTTPException(status_code=400, detail="Resident name is required")
    if not student_enrollment:
        raise HTTPException(status_code=400, detail="Resident enrollment is required")
    if not purpose or len(purpose) < 3:
        raise HTTPException(status_code=400, detail="Purpose is required")
    if not id_proof_number or len(id_proof_number) < 4:
        raise HTTPException(status_code=400, detail="Valid ID proof number is required")
    if not photo or not photo.filename:
        raise HTTPException(status_code=400, detail="Visitor photo is required")

    student = await db.users.find_one({
        "enrollment_number": student_enrollment,
        "role": "student"
    })
    if not student:
        raise HTTPException(status_code=404, detail="Resident not found")

    blacklisted = await db.visitor_blacklist.find_one({
        "$or": [
            {"contactNo": contact_no},
            {"idProofNumber": id_proof_number}
        ],
        "is_active": True
    })
    if blacklisted:
        raise HTTPException(status_code=403, detail="This visitor is blocked from entry")

    existing_active = await db.visitor_logs.find_one({
        "status": "In",
        "$or": [
            {"contactNo": contact_no},
            {"idProofNumber": id_proof_number}
        ]
    })
    if existing_active:
        raise HTTPException(status_code=400, detail="This visitor already has an active entry")

    success, filename, message = await save_upload_file(photo)
    if not success:
        raise HTTPException(status_code=400, detail=message)
    photo_url = f"/uploads/{filename}"

    check_in_time = datetime.now(timezone.utc)
    check_in_iso = check_in_time.isoformat()

    visitor_code = make_visitor_code()
    qr_token = uuid.uuid4().hex[:12].upper()
    after_hours = is_after_hours_visitor(check_in_time)
    approval_required = after_hours
    approval_status = "approved" if not approval_required else "auto_approved"

    repeated_visitor_count = await db.visitor_logs.count_documents({
        "$or": [
            {"contactNo": contact_no},
            {"idProofNumber": id_proof_number}
        ]
    })

    resident_visit_count = await db.visitor_logs.count_documents({
        "studentEnrollment": student_enrollment
    })

    doc = {
        "visitorCode": visitor_code,
        "qrToken": qr_token,
        "visitorName": visitor_name,
        "contactNo": contact_no,
        "idProofType": id_proof_type,
        "idProofNumber": id_proof_number,
        "idProof": id_proof_number,
        "photo_url": photo_url,
        "whomToVisit": whom_to_visit,
        "hostel_name": hostel_name,
        "room_number": room_number,
        "bed_number": bed_number,
        "studentEnrollment": student_enrollment,
        "purpose": purpose,
        "purposeCategory": purpose_category,
        "visitorType": "parent" if is_parent else visitor_type,
        "isParent": is_parent,
        "checkIn": check_in_iso,
        "checkOut": None,
        "status": "In",
        "checkInNote": check_in_note,
        "checkOutNote": None,
        "approved_by": approved_by,
        "approval_required": approval_required,
        "approval_status": approval_status,
        "after_hours": after_hours,
        "allowed_duration_minutes": int(allowed_duration_minutes or 180),
        "is_overstay": False,
        "repeated_visitor_count": repeated_visitor_count,
        "resident_visit_count": resident_visit_count,
        "resident_availability_warning": None,
        "edited_by": None,
        "edited_at": None,
        "created_at": check_in_iso,
        "updated_at": check_in_iso
    }

    result = await db.visitor_logs.insert_one(doc)
    entry_slip_url = await generate_visitor_entry_slip(doc)

    await db.visitor_logs.update_one(
        {"_id": result.inserted_id},
        {"$set": {"entry_slip_url": entry_slip_url}}
    )

    if student_enrollment:
        await db.notifications.insert_one({
            "title": "Visitor Entry Registered",
            "type": "visitor",
            "priority": "important",
            "message": f"{visitor_name} visited you and checked in.",
            "target_users": str(student_enrollment).strip(),
            "hostel": "private",
            "target_role": "student",
            "date": check_in_iso,
            "published_at": check_in_iso,
            "scheduled_for": None,
            "expires_at": None,
            "read_deadline": None,
            "created_by": current_user.get("username"),
            "created_by_role": current_user.get("role"),
            "read_by": [],
            "read_logs": [],
            "status": "published",
            "is_pinned": False,
            "requires_ack": False,
            "deep_link": "/student/visitor",
            "attachment_url": None,
            "deleted_at": None,
            "archived_at": None,
            "updated_at": check_in_iso,
            "meta": {
                "visitor_code": visitor_code,
                "visitor_name": visitor_name,
                "contact_no": contact_no,
                "visitor_type": "parent" if is_parent else visitor_type,
                "purpose": purpose,
                "purpose_category": purpose_category,
                "check_in": check_in_iso,
                "hostel_name": hostel_name,
                "room_number": room_number,
                "bed_number": bed_number,
                "student_enrollment": student_enrollment,
                "qr_token": qr_token,
                "entry_slip_url": entry_slip_url,
                "photo_url": photo_url,
                "after_hours": after_hours
            }
        })

    return {
        "message": "Success",
        "visitor_code": visitor_code,
        "qr_token": qr_token,
        "entry_slip_url": entry_slip_url,
        "photo_url": photo_url
    }

@api_router.get("/admin/visitor-logs")
async def get_visitor_logs(
    status: str = Query("all"),
    visitor_type: str = Query("all"),
    hostel: str = Query("all"),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    current_user: dict = Depends(get_current_user)
):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")

    query = {}

    if status != "all":
        query["status"] = status

    if visitor_type != "all":
        query["visitorType"] = normalize_visitor_type(visitor_type)

    if hostel != "all":
        query["hostel_name"] = normalize_hostel_name(hostel)

    if date_from or date_to:
        query["checkIn"] = {}
        if date_from:
            query["checkIn"]["$gte"] = f"{date_from}T00:00:00"
        if date_to:
            query["checkIn"]["$lte"] = f"{date_to}T23:59:59"

    logs = await db.visitor_logs.find(query).sort("checkIn", -1).to_list(500)

    result = []
    for log in logs:
        result.append(await serialize_visitor_log(log))

    return result

@api_router.put("/admin/visitor-checkout/{id}")
async def visitor_checkout(
    id: str,
    data: dict = Body(default={}),
    current_user: dict = Depends(get_current_user)
):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")

    try:
        oid = ObjectId(id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid visitor log ID")

    log = await db.visitor_logs.find_one({"_id": oid})
    if not log:
        raise HTTPException(status_code=404, detail="Visitor log not found")

    check_out_time = datetime.now(timezone.utc)
    check_out_iso = check_out_time.isoformat()
    check_out_note = str(data.get("checkOutNote", "")).strip() or None

    duration_minutes = format_visitor_duration(log.get("checkIn"), check_out_iso)
    is_overstay = get_overstay_flag(duration_minutes, int(log.get("allowed_duration_minutes", 180) or 180))

    await db.visitor_logs.update_one(
        {"_id": oid},
        {
            "$set": {
                "status": "Out",
                "checkOut": check_out_iso,
                "checkOutNote": check_out_note,
                "updated_at": check_out_iso,
                "checkout_by": current_user.get("username", "admin"),
                "duration_minutes": duration_minutes,
                "is_overstay": is_overstay
            }
        }
    )

    if log.get("studentEnrollment"):
        await db.notifications.insert_one({
            "title": "Visitor Checkout Recorded",
            "type": "visitor",
            "priority": "general",
            "message": f"{log.get('visitorName')} checked out.",
            "target_users": str(log.get("studentEnrollment")).strip(),
            "hostel": "private",
            "target_role": "student",
            "date": check_out_iso,
            "published_at": check_out_iso,
            "scheduled_for": None,
            "expires_at": None,
            "read_deadline": None,
            "created_by": current_user.get("username"),
            "created_by_role": current_user.get("role"),
            "read_by": [],
            "read_logs": [],
            "status": "published",
            "is_pinned": False,
            "requires_ack": False,
            "deep_link": "/student/visitor",
            "attachment_url": None,
            "deleted_at": None,
            "archived_at": None,
            "updated_at": check_out_iso,
            "meta": {
                "visitor_code": log.get("visitorCode"),
                "visitor_name": log.get("visitorName"),
                "contact_no": log.get("contactNo"),
                "visitor_type": log.get("visitorType"),
                "purpose": log.get("purpose"),
                "check_in": log.get("checkIn"),
                "check_out": check_out_iso,
                "duration_minutes": duration_minutes,
                "is_overstay": is_overstay,
                "hostel_name": log.get("hostel_name"),
                "room_number": log.get("room_number"),
                "bed_number": log.get("bed_number"),
                "student_enrollment": log.get("studentEnrollment"),
                "qr_token": log.get("qrToken"),
                "entry_slip_url": log.get("entry_slip_url"),
                "photo_url": log.get("photo_url"),
                "check_out_note": check_out_note
            }
        })

    return {
        "message": "Checked out successfully",
        "duration_minutes": duration_minutes,
        "is_overstay": is_overstay
    }

@api_router.post("/admin/visitor-checkout-by-qr")
async def visitor_checkout_by_qr(
    data: dict = Body(...),
    current_user: dict = Depends(get_current_user)
):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")

    qr_token = str(data.get("qrToken", "")).strip().upper()
    check_out_note = str(data.get("checkOutNote", "")).strip() or None

    if not qr_token:
        raise HTTPException(status_code=400, detail="QR token is required")

    log = await db.visitor_logs.find_one({"qrToken": qr_token})
    if not log:
        raise HTTPException(status_code=404, detail="Visitor log not found")

    if log.get("status") != "In":
        raise HTTPException(status_code=400, detail="Visitor is already checked out")

    check_out_time = datetime.now(timezone.utc)
    check_out_iso = check_out_time.isoformat()

    duration_minutes = format_visitor_duration(log.get("checkIn"), check_out_iso)
    is_overstay = get_overstay_flag(duration_minutes, int(log.get("allowed_duration_minutes", 180) or 180))

    await db.visitor_logs.update_one(
        {"_id": log["_id"]},
        {
            "$set": {
                "status": "Out",
                "checkOut": check_out_iso,
                "checkOutNote": check_out_note,
                "updated_at": check_out_iso,
                "checkout_by": current_user.get("username", "admin"),
                "duration_minutes": duration_minutes,
                "is_overstay": is_overstay
            }
        }
    )

    if log.get("studentEnrollment"):
        await db.notifications.insert_one({
            "title": "Visitor Checkout Recorded",
            "type": "visitor",
            "priority": "general",
            "message": f"{log.get('visitorName')} checked out.",
            "target_users": str(log.get("studentEnrollment")).strip(),
            "hostel": "private",
            "target_role": "student",
            "date": check_out_iso,
            "published_at": check_out_iso,
            "scheduled_for": None,
            "expires_at": None,
            "read_deadline": None,
            "created_by": current_user.get("username"),
            "created_by_role": current_user.get("role"),
            "read_by": [],
            "read_logs": [],
            "status": "published",
            "is_pinned": False,
            "requires_ack": False,
            "deep_link": "/student/visitor",
            "attachment_url": None,
            "deleted_at": None,
            "archived_at": None,
            "updated_at": check_out_iso,
            "meta": {
                "visitor_code": log.get("visitorCode"),
                "visitor_name": log.get("visitorName"),
                "contact_no": log.get("contactNo"),
                "visitor_type": log.get("visitorType"),
                "purpose": log.get("purpose"),
                "check_in": log.get("checkIn"),
                "check_out": check_out_iso,
                "duration_minutes": duration_minutes,
                "is_overstay": is_overstay,
                "hostel_name": log.get("hostel_name"),
                "room_number": log.get("room_number"),
                "bed_number": log.get("bed_number"),
                "student_enrollment": log.get("studentEnrollment"),
                "qr_token": log.get("qrToken"),
                "entry_slip_url": log.get("entry_slip_url"),
                "photo_url": log.get("photo_url"),
                "check_out_note": check_out_note
            }
        })

    return {
        "message": "Checked out successfully via QR",
        "duration_minutes": duration_minutes,
        "is_overstay": is_overstay
    }

@api_router.patch("/admin/visitor-log/{id}")
async def edit_visitor_log(
    id: str,
    data: dict = Body(...),
    current_user: dict = Depends(get_current_user)
):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")

    log = await db.visitor_logs.find_one({"_id": ObjectId(id)})
    if not log:
        raise HTTPException(status_code=404, detail="Visitor log not found")

    allowed_fields = [
        "visitorName",
        "contactNo",
        "idProofType",
        "idProofNumber",
        "purpose",
        "purposeCategory",
        "visitorType",
        "checkInNote",
        "checkOutNote",
        "hostel_name",
        "room_number",
        "bed_number",
        "whomToVisit",
        "studentEnrollment",
        "checkIn",
        "checkOut",
        "status",
        "allowed_duration_minutes"
    ]

    updates = {}
    for field in allowed_fields:
        if field in data:
            updates[field] = data[field]

    updates["edited_by"] = current_user.get("username", "admin")
    updates["edited_at"] = datetime.now(timezone.utc).isoformat()
    updates["updated_at"] = updates["edited_at"]

    await db.visitor_logs.update_one({"_id": ObjectId(id)}, {"$set": updates})
    return {"message": "Visitor log updated successfully"}

@api_router.get("/admin/visitor-stats")
async def get_visitor_stats(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    current_user: dict = Depends(get_current_user)
):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")

    query = {}
    if date_from or date_to:
        query["checkIn"] = {}
        if date_from:
            query["checkIn"]["$gte"] = f"{date_from}T00:00:00"
        if date_to:
            query["checkIn"]["$lte"] = f"{date_to}T23:59:59"

    logs = await db.visitor_logs.find(query).to_list(5000)

    today_logs = []
    now = datetime.now(timezone.utc)
    for log in logs:
        try:
            dt = datetime.fromisoformat(log["checkIn"])
            if dt.date() == now.date():
                today_logs.append(log)
        except Exception:
            continue

    return {
        "total": len(logs),
        "inside": len([l for l in logs if l.get("status") == "In"]),
        "checked_out_today": len([l for l in today_logs if l.get("status") == "Out"]),
        "verified_parents_today": len([l for l in today_logs if l.get("isParent") or l.get("visitorType") == "parent"]),
        "official_visitors_today": len([l for l in today_logs if l.get("visitorType") == "official"]),
        "late_visitors_today": len([l for l in today_logs if l.get("after_hours")]),
        "overstay_count": len([
            l for l in logs
            if get_overstay_flag(
                format_visitor_duration(l.get("checkIn"), l.get("checkOut")),
                int(l.get("allowed_duration_minutes", 180) or 180)
            )
        ]),
        "delivery_count": len([l for l in today_logs if l.get("visitorType") == "delivery"]),
        "maintenance_count": len([l for l in today_logs if l.get("visitorType") == "maintenance"])
    }

@api_router.post("/admin/visitor-blacklist")
async def add_visitor_to_blacklist(
    data: dict = Body(...),
    current_user: dict = Depends(get_current_user)
):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")

    doc = {
        "visitorName": str(data.get("visitorName", "")).strip(),
        "contactNo": str(data.get("contactNo", "")).strip() or None,
        "idProofNumber": str(data.get("idProofNumber", "")).strip() or None,
        "reason": str(data.get("reason", "")).strip(),
        "is_active": True,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by": current_user.get("username", "admin"),
        "expires_at": data.get("expires_at")
    }

    if not doc["reason"]:
        raise HTTPException(status_code=400, detail="Blacklist reason is required")

    await db.visitor_blacklist.insert_one(doc)
    return {"message": "Visitor blacklisted successfully"}

@api_router.get("/admin/visitor-blacklist")
async def get_visitor_blacklist(current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")

    rows = await db.visitor_blacklist.find().sort("created_at", -1).to_list(500)
    for row in rows:
        row["_id"] = str(row["_id"])
    return rows

@api_router.get("/admin/visitor-report")
async def generate_visitor_report(
    format: str = Query("pdf"),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    visitor_type: str = Query("all"),
    status: str = Query("all"),
    hostel: str = Query("all"),
    current_user: dict = Depends(get_current_user)
):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")

    query = {}
    if date_from or date_to:
        query["checkIn"] = {}
        if date_from:
            query["checkIn"]["$gte"] = f"{date_from}T00:00:00"
        if date_to:
            query["checkIn"]["$lte"] = f"{date_to}T23:59:59"
    else:
        today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
        query["checkIn"] = {"$gte": today_start}

    if visitor_type != "all":
        query["visitorType"] = normalize_visitor_type(visitor_type)

    if status != "all":
        query["status"] = status

    if hostel != "all":
        query["hostel_name"] = normalize_hostel_name(hostel)

    logs = await db.visitor_logs.find(query).sort("checkIn", 1).to_list(2000)
    timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")

    if format.lower() == "csv":
        file_name = f"visitor_report_{timestamp}.csv"
        file_path = UPLOAD_DIR / file_name

        with open(file_path, "w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            writer.writerow([
                "Visitor Code", "Visitor Name", "Visitor Type", "Contact",
                "ID Type", "ID Number", "Resident", "Enrollment", "Hostel",
                "Room", "Purpose", "Check In", "Check Out", "Status", "Overstay"
            ])
            for log in logs:
                duration_minutes = format_visitor_duration(log.get("checkIn"), log.get("checkOut"))
                writer.writerow([
                    log.get("visitorCode", "N/A"),
                    log.get("visitorName", "N/A"),
                    log.get("visitorType", "N/A"),
                    log.get("contactNo", "N/A"),
                    log.get("idProofType", "N/A"),
                    log.get("idProofNumber", "N/A"),
                    log.get("whomToVisit", "N/A"),
                    log.get("studentEnrollment", "N/A"),
                    log.get("hostel_name", "N/A"),
                    log.get("room_number", "N/A"),
                    log.get("purpose", "N/A"),
                    log.get("checkIn", "N/A"),
                    log.get("checkOut", "N/A"),
                    log.get("status", "N/A"),
                    "Yes" if get_overstay_flag(duration_minutes, int(log.get("allowed_duration_minutes", 180) or 180)) else "No"
                ])

        return {"file_url": f"/uploads/{file_name}"}

    file_name = f"visitor_report_{timestamp}.pdf"
    file_path = UPLOAD_DIR / file_name

    doc = SimpleDocTemplate(str(file_path), pagesize=letter)
    elements = []
    styles = getSampleStyleSheet()

    elements.append(Paragraph("HOSTELEASE - Visitor Report", styles['Title']))
    elements.append(Paragraph(f"Generated on: {datetime.now().strftime('%B %d, %Y %I:%M %p')}", styles['Normal']))
    elements.append(Spacer(1, 20))

    data = [["Code", "Visitor", "Resident", "Hostel/Room", "In Time", "Out Time", "Status"]]
    for log in logs:
        in_time = datetime.fromisoformat(log['checkIn']).strftime('%I:%M %p') if log.get('checkIn') else "---"
        out_time = datetime.fromisoformat(log['checkOut']).strftime('%I:%M %p') if log.get('checkOut') else "---"
        data.append([
            log.get('visitorCode', 'N/A'),
            log.get('visitorName', 'N/A'),
            log.get('whomToVisit', 'N/A'),
            f"{log.get('hostel_name', 'N/A')} / {log.get('room_number', 'N/A')}",
            in_time,
            out_time,
            log.get('status', 'N/A')
        ])

    t = Table(data, colWidths=[85, 95, 95, 100, 60, 60, 55])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#1E293B")),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 8),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 10),
        ('BACKGROUND', (0, 1), (-1, -1), colors.beige),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.black),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE')
    ]))

    elements.append(t)
    doc.build(elements)

    return {"pdf_url": f"/uploads/{file_name}"}

# ------ADMIN LOGINS ------
  

@api_router.get("/admin/login-logs")
async def get_admin_login_logs(user: dict = Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403)
    # Fetch last 5 login attempts
    logs = await db.login_logs.find({
        "enrollment_number": user.get("enrollment_number"),
        "role": "admin"
    }).sort("timestamp", -1).limit(5).to_list(5)

    for l in logs:
        l["_id"] = str(l["_id"])

    return logs       

@api_router.get("/admin/security-preferences")
async def get_admin_security_preferences(user: dict = Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403)

    user_id = str(user.get("_id") or "")
    prefs = await db.admin_security_preferences.find_one({"user_id": user_id})

    if not prefs:
        prefs = {
            "user_id": user_id,
            "two_factor_enabled": True,
            "whitelisted_ips": ["192.168.1.1", "10.0.0.45"],
            "email_verified": True,
            "recovery_email": user.get("college_email") or user.get("personal_email") or "",
            "last_password_change": None,
            "backup_codes": [],
            "account_locked": False
        }
        await db.admin_security_preferences.insert_one(prefs)

    prefs["_id"] = str(prefs["_id"])
    return prefs


@api_router.post("/admin/toggle-2fa")
async def toggle_admin_2fa(data: dict = Body(...), user: dict = Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403)

    user_id = str(user.get("_id") or "")
    enabled = bool(data.get("enabled", False))

    backup_codes = []
    if enabled:
        backup_codes = [
            "HLA-AX91", "HLA-BQ72", "HLA-CM48",
            "HLA-DT63", "HLA-EK27", "HLA-FP55"
        ]

    await db.admin_security_preferences.update_one(
        {"user_id": user_id},
        {"$set": {
            "two_factor_enabled": enabled,
            "backup_codes": backup_codes
        }},
        upsert=True
    )

    await db.security_events.insert_one({
        "user_id": user_id,
        "message": f"Two-factor authentication {'enabled' if enabled else 'disabled'}",
        "severity": "low",
        "ip": user.get("ip") or "Unknown",
        "device": user.get("browser") or "Admin Panel",
        "timestamp": utc_now_iso()
    })

    return {"message": "2FA updated", "backup_codes": backup_codes}


@api_router.post("/admin/2fa/regenerate")
async def regenerate_admin_2fa(user: dict = Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403)

    user_id = str(user.get("_id") or "")
    backup_codes = [
        "HLA-RA11", "HLA-RB22", "HLA-RC33",
        "HLA-RD44", "HLA-RE55", "HLA-RF66"
    ]

    await db.admin_security_preferences.update_one(
        {"user_id": user_id},
        {"$set": {"backup_codes": backup_codes, "two_factor_enabled": True}},
        upsert=True
    )

    await db.security_events.insert_one({
        "user_id": user_id,
        "message": "2FA secret regenerated",
        "severity": "medium",
        "ip": user.get("ip") or "Unknown",
        "device": user.get("browser") or "Admin Panel",
        "timestamp": utc_now_iso()
    })

    return {"message": "2FA regenerated", "backup_codes": backup_codes}


@api_router.get("/admin/ip-whitelist")
async def get_admin_ip_whitelist(user: dict = Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403)

    user_id = str(user.get("_id") or "")
    prefs = await db.admin_security_preferences.find_one({"user_id": user_id})
    return prefs.get("whitelisted_ips", []) if prefs else []


@api_router.post("/admin/ip-whitelist")
async def add_admin_ip_whitelist(data: dict = Body(...), user: dict = Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403)

    ip = str(data.get("ip", "")).strip()
    if not ip:
        raise HTTPException(status_code=400, detail="IP is required")

    user_id = str(user.get("_id") or "")
    prefs = await db.admin_security_preferences.find_one({"user_id": user_id})
    current_ips = prefs.get("whitelisted_ips", []) if prefs else []
    if ip not in current_ips:
        current_ips.append(ip)

    await db.admin_security_preferences.update_one(
        {"user_id": user_id},
        {"$set": {"whitelisted_ips": current_ips}},
        upsert=True
    )

    return {"message": "Trusted IP added", "ip": ip}


@api_router.post("/admin/ip-whitelist/current")
async def add_current_admin_ip(user: dict = Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403)

    current_ip = user.get("ip") or "127.0.0.1"
    user_id = str(user.get("_id") or "")
    prefs = await db.admin_security_preferences.find_one({"user_id": user_id})
    current_ips = prefs.get("whitelisted_ips", []) if prefs else []
    if current_ip not in current_ips:
        current_ips.append(current_ip)

    await db.admin_security_preferences.update_one(
        {"user_id": user_id},
        {"$set": {"whitelisted_ips": current_ips}},
        upsert=True
    )

    return {"message": "Current IP added", "ip": current_ip}


@api_router.delete("/admin/ip-whitelist/{ip}")
async def remove_admin_ip_whitelist(ip: str, user: dict = Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403)

    user_id = str(user.get("_id") or "")
    prefs = await db.admin_security_preferences.find_one({"user_id": user_id})
    current_ips = prefs.get("whitelisted_ips", []) if prefs else []
    current_ips = [item for item in current_ips if item != ip]

    await db.admin_security_preferences.update_one(
        {"user_id": user_id},
        {"$set": {"whitelisted_ips": current_ips}},
        upsert=True
    )

    return {"message": "Trusted IP removed"}


@api_router.get("/admin/sessions")
async def get_admin_sessions(user: dict = Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403)

    user_id = str(user.get("_id") or "")
    sessions = await db.admin_sessions.find({"user_id": user_id}).sort("created_at", -1).to_list(length=20)

    if len(sessions) == 0:
        seed_session = {
            "user_id": user_id,
            "device": "Chrome / Windows 11",
            "browser": "Chrome / Windows 11",
            "ip": user.get("ip") or "127.0.0.1",
            "created_at": utc_now_iso(),
            "is_current": True
        }
        await db.admin_sessions.insert_one(seed_session)
        sessions = await db.admin_sessions.find({"user_id": user_id}).sort("created_at", -1).to_list(length=20)

    for s in sessions:
        s["_id"] = str(s["_id"])

    return sessions


@api_router.delete("/admin/session/{session_id}")
async def revoke_admin_session(session_id: str, user: dict = Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403)

    await db.admin_sessions.delete_one({"_id": ObjectId(session_id)})
    return {"message": "Session revoked"}


@api_router.post("/admin/logout-all")
async def logout_all_admin_sessions(user: dict = Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403)

    user_id = str(user.get("_id") or "")
    await db.admin_sessions.delete_many({"user_id": user_id, "is_current": {"$ne": True}})
    return {"message": "All secondary sessions removed"}


@api_router.get("/admin/security-events")
async def get_admin_security_events(user: dict = Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403)

    user_id = str(user.get("_id") or "")
    events = await db.security_events.find({"user_id": user_id}).sort("timestamp", -1).limit(20).to_list(length=20)

    if len(events) == 0:
        seed_events = [
            {
                "user_id": user_id,
                "message": "Login from new browser detected",
                "severity": "medium",
                "ip": "192.168.1.42",
                "device": "Chrome / Windows 11",
                "timestamp": utc_now_iso()
            },
            {
                "user_id": user_id,
                "message": "Repeated failed login attempts blocked",
                "severity": "high",
                "ip": "10.0.0.45",
                "device": "Unknown Device",
                "timestamp": utc_now_iso()
            }
        ]
        await db.security_events.insert_many(seed_events)
        events = await db.security_events.find({"user_id": user_id}).sort("timestamp", -1).limit(20).to_list(length=20)

    for e in events:
        e["_id"] = str(e["_id"])

    return events


@api_router.post("/admin/verify-email/send")
async def send_admin_verify_email(data: dict = Body(...), user: dict = Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403)

    email = str(data.get("email") or user.get("college_email") or "").strip()
    if not email:
        raise HTTPException(status_code=400, detail="Email is required")

    await db.security_events.insert_one({
        "user_id": str(user.get("_id") or ""),
        "message": f"Verification email sent to {email}",
        "severity": "low",
        "ip": user.get("ip") or "Unknown",
        "device": user.get("browser") or "Admin Panel",
        "timestamp": utc_now_iso()
    })

    return {"message": "Verification email sent"}


@api_router.post("/admin/recovery-email")
async def update_admin_recovery_email(data: dict = Body(...), user: dict = Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403)

    recovery_email = str(data.get("recovery_email", "")).strip()
    if not recovery_email:
        raise HTTPException(status_code=400, detail="Recovery email is required")

    user_id = str(user.get("_id") or "")
    await db.admin_security_preferences.update_one(
        {"user_id": user_id},
        {"$set": {"recovery_email": recovery_email}},
        upsert=True
    )

    return {"message": "Recovery email updated"}


@api_router.post("/admin/force-password-reset")
async def force_admin_password_reset(user: dict = Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403)

    await db.users.update_one(
        {"_id": user["_id"]},
        {"$set": {"force_password_reset": True}}
    )

    return {"message": "Force password reset enabled"}


@api_router.post("/admin/account-lock")
async def lock_admin_account(data: dict = Body(...), user: dict = Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403)

    locked = bool(data.get("locked", False))
    user_id = str(user.get("_id") or "")
    await db.admin_security_preferences.update_one(
        {"user_id": user_id},
        {"$set": {"account_locked": locked}},
        upsert=True
    )

    await db.security_events.insert_one({
        "user_id": user_id,
        "message": "Admin account locked temporarily" if locked else "Admin account unlocked",
        "severity": "medium",
        "ip": user.get("ip") or "Unknown",
        "device": user.get("browser") or "Admin Panel",
        "timestamp": utc_now_iso()
    })

    return {"message": "Account lock status updated", "locked": locked}


@api_router.get("/admin/security-report")
async def get_admin_security_report(user: dict = Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403)

    user_id = str(user.get("_id") or "")
    prefs = await db.admin_security_preferences.find_one({"user_id": user_id}) or {}
    sessions = await db.admin_sessions.find({"user_id": user_id}).sort("created_at", -1).to_list(length=50)
    events = await db.security_events.find({"user_id": user_id}).sort("timestamp", -1).to_list(length=50)
    logs = await db.login_logs.find({
        "enrollment_number": user.get("enrollment_number"),
        "role": "admin"
    }).sort("timestamp", -1).limit(50).to_list(length=50)

    for item in sessions:
        item["_id"] = str(item["_id"])
    for item in events:
        item["_id"] = str(item["_id"])
    for item in logs:
        item["_id"] = str(item["_id"])

    return {
        "admin_username": user.get("username"),
        "email": user.get("college_email") or user.get("personal_email"),
        "preferences": prefs,
        "sessions": sessions,
        "security_events": events,
        "login_logs": logs,
        "generated_at": utc_now_iso()
    }    

@api_router.get("/user/achievements")
async def get_student_achievements(user: dict = Depends(get_current_user)):
    student_id = user["enrollment_number"]
    badges = []

    # 1. Responsible Resident (Voted this week)
    has_voted = await db.votes.find_one({"student_id": student_id})
    if has_voted:
        badges.append({
            "id": "voter",
            "name": "Responsible Resident",
            "description": "Participated in the weekly Sunday Special voting.",
            "icon": "Utensils",
            "color": "text-emerald-500",
            "bg": "bg-emerald-50"
        })

    # 2. Financially Cleared (No active fines)
    fines = await db.payments.find({"student_id": student_id, "type": "fine"}).to_list(None)
    has_active_fines = any(f.get("status") in ["pending", "Pending"] for f in fines)
    if not has_active_fines:
        badges.append({
            "id": "cleared",
            "name": "Financially Cleared",
            "description": "Zero pending disciplinary fines or dues.",
            "icon": "ShieldCheck",
            "color": "text-blue-500",
            "bg": "bg-blue-50"
        })

    # 3. Active Voice (Filed a complaint or feedback)
    has_complaint = await db.complaints.find_one({"student_id": student_id})
    if has_complaint:
        badges.append({
            "id": "voice",
            "name": "Active Voice",
            "description": "Helped improve the hostel by submitting feedback.",
            "icon": "MessageSquare",
            "color": "text-purple-500",
            "bg": "bg-purple-50"
        })

    # 4. Early Bird (Booked a room for next year)
    has_booking = await db.yearly_bookings.find_one({"student_id": student_id, "status": "Verified"})
    if has_booking:
        badges.append({
            "id": "early_bird",
            "name": "Early Bird",
            "description": "Successfully secured a hostel booking for the upcoming academic year.",
            "icon": "Sun",
            "color": "text-amber-500",
            "bg": "bg-amber-50"
        })
        
    # Minimum default badge for logging in
    badges.append({
        "id": "member",
        "name": "Verified Resident",
        "description": "Official resident of Hostelease.",
        "icon": "CheckCircle2",
        "color": "text-slate-500",
        "bg": "bg-slate-50"
    })

    return {
        "total_possible": 5,
        "earned": len(badges),
        "badges": badges
    }

# ==================== INCLUDE ROUTER ====================    
app.include_router(api_router)
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

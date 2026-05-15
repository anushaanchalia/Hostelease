from fastapi import FastAPI, APIRouter, HTTPException, Depends, status, File, UploadFile, Form, Query, Body
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
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
from PIL import Image
import io
import random
# from openai import OpenAI
from google import genai
from google.genai import types
from contextlib import asynccontextmanager
from reportlab.pdfgen import canvas 
from reportlab.lib.pagesizes import letter
from bson import ObjectId
import smtplib
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
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

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
        return datetime.fromisoformat(dt_str)
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

# class AdminLoginVerify(BaseModel):
#     username: str
#     otp: str

# class AdminLoginRequest(BaseModel):
#     username: str
#     password: str

# class AdminVerifyRequest(BaseModel):
#     username: str
#     otp: str    

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
    if twilio_client:
        try:
            await asyncio.to_thread(
                twilio_client.messages.create,
                body=message,
                from_=os.getenv("TWILIO_PHONE_NUMBER"),
                to=phone
            )
        except Exception as e:
            logger.error(f"SMS send error: {e}")

async def send_email(to_email: str, subject: str, html_content: str):
    if os.getenv("RESEND_API_KEY"):
        try:
            params = {
                "from": os.getenv("SENDER_EMAIL", "onboarding@resend.dev"),
                "to": [to_email],
                "subject": subject,
                "html": html_content
            }
            await asyncio.to_thread(resend.Emails.send, params)
        except Exception as e:
            logger.error(f"Email send error: {e}")

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

# ==================== AUTH ROUTES ====================

# @api_router.post("/auth/register")
# async def register(user: UserRegister):
#     # Check if user exists
#     existing_user = await db.users.find_one({"$or": [
#         {"username": user.username},
#         {"college_email": user.college_email},
#         {"enrollment_number": user.enrollment_number}
#     ]}, {"_id": 0})
    
#     if existing_user:
#         raise HTTPException(status_code=400, detail="User already exists")
    
#     # Create user with default password
#     user_dict = user.model_dump()
#     user_dict["password"] = hash_password("hostel@123")
#     user_dict["role"] = "student"
#     user_dict["created_at"] = datetime.now(timezone.utc).isoformat()
#     user_dict["is_default_password"] = True
    
#     await db.users.insert_one(user_dict)
#     return {"message": "Registration successful. Default password: hostel@123"}

@api_router.post("/auth/login", response_model=Token)
async def login(credentials: UserLogin):
    user = await db.users.find_one({
        "$or": [
            {"college_email": credentials.username},
            {"enrollment_number": credentials.username}
        ]
        }, {"_id": 0})
    
    if not user or not verify_password(credentials.password, user.get("password", "")):
        raise HTTPException(status_code=401, detail="Invalid credentials")
        
    # [1] CHECK FOR FIRST LOGIN (Requires OTP reset flow)
    if user.get("is_first_login"):
        return {
            "requires_first_login_reset": True,
            "message": "First login detected. You must verify your email and change your default password.",
            "user": {"enrollment_number": user.get("enrollment_number"), "email": user.get("personal_email")}
        }
        
    # [2] CHECK FOR 2FA (TOTP)
    if user.get("two_factor_enabled"):
        if not credentials.totp_code:
            return {
                "requires_2fa": True,
                "message": "Two-Factor Authentication is required for this account.",
                "user": {"enrollment_number": user.get("enrollment_number")}
            }
            
        totp = pyotp.TOTP(user.get("two_factor_secret"))
        if not totp.verify(credentials.totp_code):
            raise HTTPException(status_code=401, detail="Invalid 2FA code")
    
    access_token = create_access_token({"sub": user["enrollment_number"], "role": user.get("role", "student")})
    
    # Remove password and secret from response
    user_data = {k: v for k, v in user.items() if k not in ["password", "two_factor_secret", "email_otp"]}
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": user_data
    }

@api_router.post("/auth/change-password")
async def change_password(data: dict = Body(...), user: dict = Depends(get_current_user)):
    query = {"enrollment_number": user["enrollment_number"]}
    db_user = await db.users.find_one(query)
    
    if not verify_password(data["old_password"], db_user["password"]):
        raise HTTPException(status_code=400, detail="Incorrect current password")
        
    # [2FA Enforcement for Security Changes]
    if db_user.get("two_factor_enabled"):
        if "totp_code" not in data or not data["totp_code"]:
            raise HTTPException(status_code=400, detail="2FA verfication required to change passwords.")
            
        totp = pyotp.TOTP(db_user.get("two_factor_secret"))
        if not totp.verify(data["totp_code"]):
            raise HTTPException(status_code=401, detail="Invalid 2FA code.")
    
    new_hashed = hash_password(data["new_password"])
    await db.users.update_one(
        query,
        {"$set": {"password": new_hashed, "is_default_password": False}}
    )
    
    # SIMULATION: Send Security Alert to the Locked Email
    admin_email = db_user.get("college_email") or db_user.get("personal_email")
    if admin_email:
        html_content = f"""
        <div style="font-family: Arial, sans-serif; max-width: 600px; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
            <h2 style="color: #EF4444;">HOSTELEASE: Security Alert</h2>
            <p>Hello <strong>{user.get('username', 'Student')}</strong>,</p>
            <p>This is an automated notification that your password was successfully updated on <strong>{datetime.now().strftime('%B %d, %Y at %I:%M %p')}</strong>.</p>
            <p style="background: #f9fafb; padding: 15px; border-radius: 8px; color: #6b7280; font-size: 13px;">
                If you did not perform this action, please contact the System Superuser immediately to lock your account.
            </p>
            <p style="color: #9ca3af; font-size: 11px; margin-top: 20px;">Secure Session ID: {uuid.uuid4()}</p>
        </div>
        """
        await send_email(admin_email, "HOSTELEASE: Security Update", html_content)
    
    return {"message": "Credentials updated and alert dispatched"}

@api_router.post("/auth/first-login/send-otp")
async def first_login_send_otp(data: FirstLoginOTPRequest):
    user = await db.users.find_one({"enrollment_number": data.enrollment_number})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    if not user.get("is_first_login"):
        raise HTTPException(status_code=400, detail="Account is already verified.")
        
    # Generate 6-digit Email OTP
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
    
    # Send Email
    html_content = f"""
    <div style="font-family: Arial, sans-serif; max-width: 600px; padding: 20px; border: 1px solid #eee; border-radius: 10px; text-align: center;">
        <h2 style="color: #4F46E5;">Authentication Required</h2>
        <p>Hello {user.get('student_name', 'Student')},</p>
        <p>You are attempting to completely verify and activate your student account portal. Please use the One-Time Password below.</p>
        <div style="margin: 20px auto; padding: 15px; background: #f3f4f6; letter-spacing: 5px; font-size: 24px; font-weight: bold; width: 50%; border-radius: 8px; color: #111827;">
            {otp_code}
        </div>
        <p style="color: #6b7280; font-size: 13px;">This code expires in 10 minutes.</p>
    </div>
    """
    await send_email(target_email, "HOSTELEASE: Verification OTP", html_content)
    
    # Masking email for frontend safety
    masked = target_email[:3] + "***" + target_email[target_email.index("@"):]
    return {"message": f"Verification code sent to {masked}"}

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

@api_router.post("/auth/2fa/generate")
async def generate_2fa_secret(data: TOTPSetupRequest):
    user = await db.users.find_one({"enrollment_number": data.enrollment_number})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    if user.get("two_factor_enabled"):
        raise HTTPException(status_code=400, detail="2FA is already setup.")
        
    secret = pyotp.random_base32()
    # Provisioning URI for QR code generation on the frontend
    uri = pyotp.totp.TOTP(secret).provisioning_uri(name=user.get("college_email"), issuer_name="HostelEase")
    
    await db.users.update_one(
        {"enrollment_number": data.enrollment_number},
        {"$set": {"two_factor_secret": secret}}
    )
    
    return {"secret": secret, "uri": uri}

@api_router.post("/auth/2fa/verify-setup")
async def verify_2fa_setup(data: TOTPVerifyRequest):
    user = await db.users.find_one({"enrollment_number": data.enrollment_number})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    secret = user.get("two_factor_secret")
    if not secret:
        raise HTTPException(status_code=400, detail="2FA secret not generated.")
        
    totp = pyotp.TOTP(secret)
    if not totp.verify(data.totp_code):
        raise HTTPException(status_code=401, detail="Invalid verification code")
        
    await db.users.update_one(
        {"enrollment_number": data.enrollment_number},
        {"$set": {"two_factor_enabled": True}}
    )
    
    # We log the user in instantly after verified setup
    access_token = create_access_token({"sub": user["enrollment_number"], "role": user.get("role", "student")})
    user_data = {k: v for k, v in user.items() if k not in ["password", "two_factor_secret", "email_otp"]}
    
    return {
        "message": "Two-Factor Authentication successfully enabled.",
        "access_token": access_token,
        "token_type": "bearer",
        "user": user_data
    }

# --- STEP 1: LOGIN INITIATION (Generates 2FA Code) ---
# @api_router.post("/auth/admin-login-init")
# async def admin_login_init(data: dict = Body(...)):
#     user = await db.users.find_one({"username": data["username"], "role": "admin"})
#     if not user or not verify_password(data["password"], user["password"]):
#         raise HTTPException(400, "Invalid credentials")

#     # Generate 6-digit OTP
#     otp = str(random.randint(100000, 999999))
#     expiry = datetime.now(timezone.utc) + timedelta(minutes=5)
    
#     # Store OTP in DB (or Redis)
#     await db.users.update_one(
#         {"username": user["username"]},
#         {"$set": {"2fa_code": otp, "2fa_expiry": expiry}}
#     )

#     # Send Email Alert
#     email = user.get("college_email")
#     html = f"<h2>Your HOSTELEASE 2FA Code: {otp}</h2><p>Expires in 5 mins.</p>"
#     await send_email(email, "Security Verification Code", html)
    
#     return {"message": "OTP sent to registered email"}

# # --- STEP 2: VERIFY 2FA & ISSUE TOKEN ---
# @api_router.post("/auth/admin-login-verify")
# async def admin_login_verify(data: dict = Body(...)):
#     user = await db.users.find_one({"username": data["username"], "2fa_code": data["otp"]})
    
#     if not user or datetime.now(timezone.utc) > user["2fa_expiry"]:
#         raise HTTPException(400, "Invalid or expired code")

#     # Clear OTP and issue token
#     await db.users.update_one({"_id": user["_id"]}, {"$unset": {"2fa_code": "", "2fa_expiry": ""}})
#     token = create_access_token({"sub": user["username"], "role": "admin"})
    
#     return {"access_token": token, "token_type": "bearer"}    

@api_router.post("/auth/send-otp")
async def send_otp(request: ContactOTPRequest):
    import random
    otp = str(random.randint(100000, 999999))
    
    # Check if user exists
    query = {"$or": [{"college_email": request.contact}, {"phone": request.contact}]}
    user = await db.users.find_one(query, {"_id": 0})
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Store OTP in database with expiry
    await db.otps.delete_many({"contact": request.contact})  # Remove old OTPs
    await db.otps.insert_one({
        "contact": request.contact,
        "otp": otp,
        "type": request.type,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "expires_at": (datetime.now(timezone.utc) + timedelta(minutes=10)).isoformat(),
    })
    
    if request.type == "email":
        html_content = f"""
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #5B7FED;">HOSTELEASE - OTP Verification</h2>
            <p>Your One-Time Password (OTP) for password reset is:</p>
            <div style="background: #f3f4f6; padding: 20px; text-align: center; border-radius: 8px; margin: 20px 0;">
                <h1 style="color: #5B7FED; font-size: 32px; letter-spacing: 5px; margin: 0;">{otp}</h1>
            </div>
            <p style="color: #666;">This OTP will expire in 10 minutes.</p>
            <p style="color: #666;">If you didn't request this, please ignore this email.</p>
        </div>
        """
        await send_email(request.contact, "HOSTELEASE - OTP Verification", html_content)
    else:
        await send_sms(request.contact, f"Your HOSTELEASE OTP is: {otp}. Valid for 10 minutes.")
    
    return {"message": "OTP sent successfully", "expires_in": "10 minutes"}
            
@api_router.post("/auth/verify-otp")
async def verify_otp(request: OTPVerify):
    # Find OTP
    otp_record = await db.otps.find_one({
        "contact": request.contact,
        "otp": request.otp,
        "type": request.type
    }, {"_id": 0})
    
    if not otp_record:
        raise HTTPException(status_code=400, detail="Invalid OTP")
    
    # Check if expired        
    expires_at = datetime.fromisoformat(otp_record["expires_at"])
    if datetime.now(timezone.utc) > expires_at:
        raise HTTPException(status_code=400, detail="OTP expired. Please request a new one.")
    
    # Mark as verified
    await db.otps.update_one(
        {"contact": request.contact, "otp": request.otp},
        {"$set": {"verified": True}}
    )
    
    return {"message": "OTP verified successfully", "verified": True} 

@api_router.post("/auth/reset-password")
async def reset_password(request: PasswordReset):
    # Verify OTP first
    otp_record = await db.otps.find_one({
        "contact": request.contact,
        "otp": request.otp,
        "type": request.type,
        "verified": True
    }, {"_id": 0})
    
    if not otp_record:
        raise HTTPException(status_code=400, detail="Invalid or unverified OTP")
    
    # Check if expired
    expires_at = datetime.fromisoformat(otp_record["expires_at"])
    if datetime.now(timezone.utc) > expires_at:
        raise HTTPException(status_code=400, detail="OTP expired")
    
    # Validate password strength
    if len(request.new_password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
    
    # Find user and update password
    query = {"$or": [{"college_email": request.contact}, {"phone": request.contact}]}
    user = await db.users.find_one(query, {"_id": 0})
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Update password
    new_hashed = hash_password(request.new_password)
    await db.users.update_one(
        query,
        {"$set": {"password": new_hashed, "is_default_password": False}}
    )
    
    # Delete used OTP
    await db.otps.delete_many({"contact": request.contact})
    
    return {"message": "Password reset successfully"} 
   
# -------------------------------
# GET CURRENT STUDENT PROFILE
# -------------------------------

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

@api_router.get("/bed-availability")
async def get_bed_availability(
    gender: str = Query(None),
    block: str = Query(None),
    user: dict = Depends(get_current_user)
):
    # Get all rooms
    rooms = await db.rooms.find({}).to_list(length=3000)
    
    # Get all occupancy
    students = await db.users.find({"role": "student"}).to_list(length=4000)
    occupier_count = {}
    for s in students:
        h = normalize_hostel_name(s.get("hostel_name", ""))
        b = normalize_block_name(s.get("block", ""))
        r = str(s.get("room_number", ""))
        f = str(s.get("floor", ""))
        if h and b and r and f and str(h) != "N/A" and str(r) != "N/A":
            key = f"{h}-{b}-{f}-{r}"
            occupier_count[key] = occupier_count.get(key, 0) + 1
            
    # Group rooms into Hostel/Block/Floor objects for the frontend
    # BedAvailability.js expects an array of "beds" which represent a cluster (hostel+block+floor)
    
    clusters: dict[str, Any] = {}
    for rm in rooms:
        h = normalize_hostel_name(rm.get("hostel_name", ""))
        b = normalize_block_name(rm.get("block", ""))
        f = str(rm.get("floor", ""))
        r = str(rm.get("number", ""))
        capacity = int(rm.get("capacity", 2))
        
        # Mocking gender for demo purposes
        r_gender = "female" if h.lower() in ["janaki bhawan", "shakuntala bhawan", "teresa bhawan"] else "male"
        
        cluster_key = f"{h}-{b}-{f}"
        if cluster_key not in clusters:
            clusters[cluster_key] = {
                "hostel_name": h,
                "block": b,
                "floor": f,
                "gender": r_gender,
                "total_beds": 0,
                "occupied_beds": 0,
                "rooms": []
            }
            
        clusters[cluster_key]["total_beds"] += int(capacity)
        
        room_key = f"{h}-{b}-{f}-{r}"
        occ = int(occupier_count.get(room_key, 0))
        clusters[cluster_key]["occupied_beds"] += occ
        
        clusters[cluster_key]["rooms"].append({
            "room_number": r,
            "capacity": capacity,
            "occupancy_count": occ,
            "is_available": occ < capacity,
            "room_type": rm.get("room_type", "Non-AC")
        })
        
    results = list(clusters.values())
    
    # Apply filters
    if gender:
        results = [r for r in results if r["gender"] == gender]
    if block:
        results = [r for r in results if r["block"] == block]
        
    return results

@api_router.get("/bed-availability/history")
async def get_bed_history(user: dict = Depends(get_current_user)):
    history = await db.booking_history.find({"student_id": user.get("username", "")}).sort("created_at", -1).to_list(100)
    for h in history:
        h["_id"] = str(h["_id"])
    return history

@api_router.post("/bed-availability/book")
async def book_bed(payload: dict, user: dict = Depends(get_current_user)):
    h = normalize_hostel_name(payload.get("hostel_name", ""))
    b = normalize_block_name(payload.get("block", ""))
    r = payload.get("room_number", "")
    
    if not h or not b or not r:
        raise HTTPException(status_code=400, detail="Missing room info")
        
    student = await db.users.find_one({"enrollment_number": user["enrollment_number"]})
    
    if student.get("hostel_name") and str(student.get("hostel_name")) != "N/A":
        raise HTTPException(status_code=400, detail="You are already assigned a room. Contact admin to move.")
        
    # Check if this room has capacity
    # To find floor, we have to look up the room document
    rm_doc = await db.rooms.find_one({"hostel_name": h, "block": b, "number": str(r)})
    if not rm_doc:
        raise HTTPException(status_code=404, detail="Room not found")
        
    f = rm_doc.get("floor", "1")
    capacity = int(rm_doc.get("capacity", 2))
    
    # Check current occupants
    current_occupants = await db.users.count_documents({
        "hostel_name": h,
        "block": b,
        "floor": str(f),
        "room_number": str(r)
    })
    
    if current_occupants >= capacity:
        raise HTTPException(status_code=400, detail="Room is full")
        
    # Find next available bed letter (A, B, C, D)
    assigned_beds = await db.users.find({
        "hostel_name": h,
        "block": b,
        "floor": str(f),
        "room_number": str(r)
    }).to_list(10)
    
    used_letters = [s.get("bed_number") for s in assigned_beds if s.get("bed_number")]
    available_letters = [char for char in ["A", "B", "C", "D"][:capacity] if char not in used_letters]
    
    assigned_bed = available_letters[0] if available_letters else "A"
        
    # Update student
    await db.users.update_one(
        {"enrollment_number": user["enrollment_number"]},
        {"$set": {
            "hostel_name": h,
            "block": b,
            "floor": str(f),
            "room_number": str(r),
            "bed_number": assigned_bed
        }}
    )
    
    # Save History
    await db.booking_history.insert_one({
        "student_id": user.get("username", ""),
        "hostel_name": h,
        "block": b,
        "room_number": str(r),
        "status": "APPROVED",
        "duration": "Current Semester",
        "created_at": iso_now_ist()
    })
    
    return {"message": "Room booked successfully"}

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

# ==================== MESS MENU ROUTES ====================

@api_router.get("/mess-menu")
async def get_mess_menu(user: dict = Depends(get_current_user)):
    menu = await db.mess_menu.find({}, {"_id": 0}).sort("day", 1).to_list(7)
    return menu

@api_router.post("/mess-menu")
async def create_update_menu(item: MessMenuItem, user: dict = Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admin can modify menu")
    
    await db.mess_menu.update_one(
        {"day": item.day, "week_start_date": item.week_start_date},
        {"$set": item.model_dump()},
        upsert=True
    )
    
    return {"message": "Menu updated successfully"}

# ==================== FOOD FEEDBACK ROUTES ====================

@api_router.post("/food-feedback")
async def submit_feedback(feedback: FoodFeedback, user: dict = Depends(get_current_user)):
    feedback_dict = feedback.model_dump()
    feedback_dict["student_id"] = user["username"]
    feedback_dict["date"] = datetime.now(timezone.utc).isoformat()
    feedback_dict["ai_processed"] = False
    
    await db.food_feedback.insert_one(feedback_dict)
    return {"message": "Feedback submitted successfully"}

@api_router.get("/food-feedback")
async def get_feedback(user: dict = Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admin can view all feedback")
    
    feedback = await db.food_feedback.find({}, {"_id": 0}).sort("date", -1).to_list(100)
    return feedback

# @api_router.post("/food-feedback/analyze")
# async def analyze_feedback(user: dict = Depends(get_current_user)):
#     if user["role"] != "admin":
#         raise HTTPException(status_code=403, detail="Only admin can analyze feedback")
    
#     # Get unprocessed feedback
#     feedback = await db.food_feedback.find({"ai_processed": False}, {"_id": 0}).to_list(100)
    
#     if not feedback:
#         return {"message": "No new feedback to analyze", "items": []}
    
#     # Aggregate suggestions
#     suggestions = [f["suggestions"] for f in feedback if f.get("suggestions")]
    
#     if not suggestions or not os.getenv("OPENAI_API_KEY"):
#         return {"message": "AI analysis requires OpenAI API key", "items": []}
    
#     # Use OpenAI to analyze
#     try:
#         client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
        
#         prompt = f"""Analyze these food suggestions from students and extract the top 10 most requested food items. 
# Return only the item names, one per line, without numbering or extra text.

# Suggestions: {', '.join(suggestions)}"""
        
#         response = client.chat.completions.create(
#             model="gpt-4o",
#             messages=[
#                 {"role": "system", "content": "You are a food preference analyzer. Extract and list the top 10 most requested food items from student feedback. Return only the item names, one per line."},
#                 {"role": "user", "content": prompt}
#             ],
#             max_tokens=200,
#             temperature=0.7
#         )
        
#         # Parse response
#         items = [item.strip() for item in response.choices[0].message.content.split('\n') if item.strip()]
#         items = items[:10]
        
#         # Mark feedback as processed
#         await db.food_feedback.update_many({"ai_processed": False}, {"$set": {"ai_processed": True}})
        
#         # Store items for voting
#         for item in items:
#             await db.voting_items.update_one(
#                 {"item_name": item},
#                 {"$set": {"item_name": item, "vote_count": 0, "status": "active", "created_at": datetime.now(timezone.utc).isoformat()}},
#                 upsert=True
#             )
        
#         return {"message": "Analysis complete", "items": items}
#     except Exception as e:
#         logger.error(f"AI analysis error: {e}")
#         raise HTTPException(status_code=500, detail=str(e))

# @api_router.post("/food-feedback/analyze")
# async def analyze_feedback(user: dict = Depends(get_current_user)):
#     if user["role"] != "admin":
#         raise HTTPException(status_code=403, detail="Admin only")
    
#     # 1. Get ALL feedback (not just unprocessed) to ensure we have a good sample
#     feedback_cursor = db.food_feedback.find({}, {"suggestions": 1, "_id": 0})
#     feedback_list = await feedback_cursor.to_list(length=500)
    
#     suggestions = [f["suggestions"] for f in feedback_list if f.get("suggestions")]
    
#     if not suggestions:
#         raise HTTPException(status_code=400, detail="No student feedback found to analyze")

#     # 2. Use OpenAI to extract exactly 10 real items
#     try:
#         client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
#         prompt = f"Analyze these student food requests: {', '.join(suggestions)}. Extract the top 10 most requested unique food items. Return only the names, one per line."
        
#         response = client.chat.completions.create(
#             model="gpt-4o",
#             messages=[{"role": "user", "content": prompt}]
#         )
        
#         real_items = [item.strip() for item in response.choices[0].message.content.split('\n') if item.strip()]
        
#         # 3. CRITICAL: Clear out the old "Momos/Pizza" mock data
#         await db.voting_items.delete_many({}) 
        
#         # 4. Insert ONLY the new real items
#         for item in real_items[:10]:
#             await db.voting_items.insert_one({
#                 "item_name": item,
#                 "vote_count": 0,
#                 "status": "active",
#                 "created_at": datetime.now(timezone.utc).isoformat()
#             })
        
#         return {"message": "AI Analysis complete. Voting poll updated with real student requests.", "items": real_items[:10]}
#     except Exception as e:
#         raise HTTPException(status_code=500, detail=str(e))

# --- REFRESHED AI ANALYSIS (GEMINI) ---
# --- THE FINAL STABLE GEMINI FIX ---
@api_router.post("/food-feedback/analyze")
async def analyze_feedback(user: dict = Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    
    # 1. Fetch real student suggestions
    feedback_cursor = db.food_feedback.find({}, {"suggestions": 1, "_id": 0})
    feedback_list = await feedback_cursor.to_list(length=500)
    
    anon_cursor = db.anonymous_feedback.find({}, {"suggestions": 1, "_id": 0})
    anon_list = await anon_cursor.to_list(length=500)
    
    suggestions = [f["suggestions"] for f in feedback_list + anon_list if f.get("suggestions")]
    
    if not suggestions:
        raise HTTPException(status_code=400, detail="No real student requests found")

    try:
        gemini_client = genai.Client(
            api_key=os.getenv("GEMINI_API_KEY"),
            http_options={'api_version': 'v1'} 
        )
        
        prompt = f"""
        You are an expert culinary AI for a university hostel. 
        Extract the top 10 unique food items most requested from this student feedback list: {', '.join(suggestions)}. 
        
        You MUST return ONLY a strictly valid JSON array of objects. Do not wrap in markdown blocks like ```json.
        Each object must have exactly two keys:
        - "item_name": A short, clean name for the food (e.g., "Paneer Butter Masala")
        - "reason": A short, 1-sentence analytical reason why this item is highly demanded based on the feedback context or general popularity.
        """
        
        response = gemini_client.models.generate_content(
            model="gemini-1.5-flash", 
            contents=prompt
        )
        
        if not response.text:
            raise Exception("Gemini returned an empty response")

        # Clean up any potential markdown formatting the AI might still include
        cleaned_text = response.text.strip()
        if cleaned_text.startswith("```json"):
            cleaned_text = cleaned_text[7:]
        if cleaned_text.startswith("```"):
            cleaned_text = cleaned_text[3:]
        if cleaned_text.endswith("```"):
            cleaned_text = cleaned_text[:-3]

        import json
        real_items = json.loads(cleaned_text.strip())
        
        # 2. Clear old data and insert real items
        await db.voting_items.delete_many({}) 
        
        inserted_items = []
        for item in real_items[:10]:
            name = item.get("item_name", "Unknown Item").strip()
            reason = item.get("reason", "Highly requested by students.").strip()
            
            inserted_items.append(name)
            await db.voting_items.insert_one({
                "item_name": name,
                "reason": reason,
                "vote_count": 0,
                "status": "active",
                "created_at": datetime.now(timezone.utc).isoformat()
            })
        
        return {"message": "Success! Real data analyzed.", "items": inserted_items}
    
    except Exception as e:
        # This will print the EXACT error in your terminal/cmd
        print(f"CRITICAL DEBUG: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Gemini API Error: {str(e)}")
    
    
# --- NEW: RESET AND REPORT ROUTES ---
@api_router.delete("/food-feedback/clear-all")
async def clear_feedback(user: dict = Depends(get_current_user)):
    await db.food_feedback.delete_many({})
    return {"message": "Feedback cleared"}

@api_router.post("/voting/manual-add")
async def manual_add(data: dict = Body(...)):
    await db.voting_items.insert_one({
        "item_name": data["item_name"], "vote_count": 0, "status": "active"
    })
    return {"message": "Added"}

@api_router.get("/admin/reports/participation")
async def get_participation(user: dict = Depends(get_current_user)):
    all_students = await db.users.find({"role": "student"}).to_list(1000)
    voted_ids = await db.votes.distinct("student_id")
    return [{"name": s.get("student_name"), "voted": s.get("enrollment_number") in voted_ids} for s in all_students]  

# --- NEW: ROUTE TO RESET VOTING CYCLE ---
@api_router.delete("/voting/reset-all")
async def reset_voting_cycle(user: dict = Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    
    # This wipes both the items in the poll and the actual student votes
    await db.voting_items.delete_many({})
    await db.votes.delete_many({})
    
    return {"message": "Voting cycle has been completely reset for the new week"}

# ==================== BED AVAILABILITY ROUTES ====================

# @api_router.get("/bed-availability")
# async def get_bed_availability(
#     gender: Optional[str] = Query(None), 
#     block: Optional[str] = Query(None), 
#     user: dict = Depends(get_current_user)
# ):
#     """
#     Fetches hostel bed availability with validated metrics and room lists.
#     """
#     query = {}
    
#     # Case-insensitive filtering for Gender
#     if gender and gender != 'all':
#         query["gender"] = {"$regex": f"^{gender}$", "$options": "i"}
        
#     # Case-insensitive filtering for Block
#     if block and block != 'all':
#         query["block"] = {"$regex": f"^{block}$", "$options": "i"}
    
#     # Fetching from the hostel_beds collection
#     beds = await db.hostel_beds.find(query, {"_id": 0}).to_list(100)
    
#     for bed in beds:
#         # 1. Validated Occupancy Logic: Ensure occupied count never exceeds total
#         total = bed.get("total_beds", 0)
#         # Fix: Cap occupied beds at total_beds to prevent negative availability
#         occupied = min(bed.get("occupied_beds", 0), total)
#         bed["occupied_beds"] = occupied
#         bed["available_beds"] = max(0, total - occupied)
        
#         # 2. Calculate Occupancy Percentage (Capped at 100%)
#         if total > 0:
#             bed["occupancy_rate"] = round((occupied / total) * 100, 1)
#         else:
#             bed["occupancy_rate"] = 0.0
            
#         # 3. Fetch Specific Room Details for the Modal
#         # Fix: Querying rooms based on hostel, block, and floor to populate modal
#         rooms_cursor = db.rooms.find(
#             {
#                 "hostel_name": bed["hostel_name"], 
#                 "block": bed["block"],
#                 "floor": bed["floor"]
#             }, 
#             {"_id": 0}
#         )
#         bed["rooms"] = await rooms_cursor.to_list(length=100)
            
#     return beds

# @api_router.post("/bed-availability/book")
# async def book_hostel_room(
#     data: dict = Body(...), 
#     user: dict = Depends(get_current_user)
# ):
#     """
#     Atomic room booking: Marks room as occupied, updates block counts, and logs history.
#     """
#     # 1. Check if the specific room exists and is actually available
#     room = await db.rooms.find_one({
#         "hostel_name": data["hostel_name"],
#         "block": data["block"],
#         "room_number": data["room_number"],
#         "is_available": True
#     })
    
#     if not room:
#         raise HTTPException(status_code=400, detail="Room is no longer available")

#     # 2. Update Room Status: Assign to student
#     await db.rooms.update_one(
#         {"_id": room["_id"]},
#         {"$set": {"is_available": False, "occupied_by": user["username"]}}
#     )

#     # 3. Synchronize Counts: Atomically increment occupied beds in the summary
#     await db.hostel_beds.update_one(
#         {
#             "hostel_name": data["hostel_name"], 
#             "block": data["block"], 
#             "floor": room["floor"]
#         },
#         {"$inc": {"occupied_beds": 1}}
#     )

#     # 4. Log to Stay History for the student sidebar
#     history_entry = {
#         "student_id": user["username"],
#         "hostel_name": data["hostel_name"],
#         "room_number": data["room_number"],
#         "status": "allocated",
#         "duration": "Current Stay",
#         "date": datetime.now(timezone.utc).isoformat()
#     }
#     await db.bed_history.insert_one(history_entry)

#     return {"status": "success", "message": "Room booked successfully"}

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

# ==================== END OF YEAR HOSTEL BOOKING ROUTES ====================

@api_router.post("/bookings/create")
async def create_hostel_booking(req: dict, user: dict = Depends(get_current_user)):
    if user["role"] != "student":
        raise HTTPException(403, "Only students can book hostels")
        
    hostel_name = req.get("hostel_name")
    block = req.get("block")
    preferences = req.get("preferences", {})
    booking_date = req.get("booking_date", datetime.now(timezone.utc).isoformat())
    
    # 1. Check if they already have a confirmed booking
    existing = await db.yearly_bookings.find_one({
        "student_id": user["username"],
        "status": {"$in": ["confirmed", "half_paid"]}
    })
    
    if existing:
        raise HTTPException(400, "You already have an active booking for the next academic year")
        
    # 2. Add booking intent
    booking_doc = {
        "student_id": user["username"],
        "student_name": user.get("student_name", "Unknown"),
        "hostel_name": hostel_name,
        "block": block,
        "preferences": preferences,
        "status": "pending_payment", 
        "booking_date": booking_date
    }
    
    result = await db.yearly_bookings.insert_one(booking_doc)
    booking_id = str(result.inserted_id)
    
    # 3. Create a pending payment record for First Half Payment
    payment = {
        "student_id": user["username"],
        "amount": 25000, 
        "purpose": f"Yearly Booking - Half Payment ({hostel_name})",
        "status": "Pending",
        "payment_mode": req.get("payment_mode", "Online"),
        "date": booking_date,
        "booking_ref": booking_id
    }
    
    await db.payments.insert_one(payment)
    
    return {"status": "success", "booking_id": booking_id, "payment_required": 25000, "message": "Booking pending. Complete the first half payment to block your room."}

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


@api_router.get("/admin/yearly-bookings")
async def get_yearly_bookings(user: dict = Depends(get_current_user)):
    """
    Fetches all end-of-year hostel bookings for Admin dashboard real-time view.
    """
    if user["role"] != "admin":
        raise HTTPException(403, "Admin only")
        
    bookings = await db.yearly_bookings.find({}, {"_id": 0}).sort("booking_date", -1).to_list(1000)
    return bookings

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

# --- ADMIN ROOM SWAP & DIRECT ASSIGNMENT PROTOCOLS ---

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
        
    required = ["username", "targetHostel", "targetRoom"]
    if not all(field in data for field in required):
        raise HTTPException(400, "Missing parameters")
        
    student = await db.users.find_one({"username": data["username"], "role": "student"})
    if not student:
        raise HTTPException(404, "Student username not found.")
        
    # Free existing room for student if exists
    old_room = await db.rooms.find_one({"occupied_by": data["username"]})
    if old_room:
        await db.rooms.update_one({"_id": old_room["_id"]}, {"$set": {"is_available": True, "occupied_by": None}})
        await db.hostel_beds.update_one(
            {"hostel_name": old_room["hostel_name"], "block": old_room.get("block", "A")},
            {"$inc": {"occupied_beds": -1}}
        )
        
    # Mark target room occupied
    target_room = await db.rooms.find_one({
        "hostel_name": data["targetHostel"],
        "room_number": data["targetRoom"]
    })
    
    if target_room:
        await db.rooms.update_one(
            {"_id": target_room["_id"]}, 
            {"$set": {"is_available": False, "occupied_by": data["username"]}}
        )
        await db.hostel_beds.update_one(
            {"hostel_name": data["targetHostel"], "block": target_room.get("block", "A")},
            {"$inc": {"occupied_beds": 1}}
        )
        
    # Update Student User doc
    await db.users.update_one(
        {"_id": student["_id"]},
        {"$set": {"hostel_name": data["targetHostel"], "room_number": data["targetRoom"]}}
    )

    return {"status": "success"}

# ==================== COMPLAINT ROUTES ====================

@api_router.get("/complaints")
async def get_complaints(user: dict = Depends(get_current_user)):
    if user["role"] == "admin":
        complaints = await db.complaints.find({}).sort("date", -1).to_list(500)
    else:
        complaints = await db.complaints.find(
            {"enrollment_number": str(user.get("enrollment_number"))}
        ).sort("date", -1).to_list(200)

    for complaint in complaints:
        complaint["_id"] = str(complaint["_id"])
        complaint["hostel_name"] = normalize_hostel_name(complaint.get("hostel_name", "N/A"))
        complaint["status"] = normalize_status(complaint.get("status", "pending"))
        complaint["priority"] = normalize_priority(complaint.get("priority", "medium"))

    return complaints

# ==================== PAYMENT ROUTES ====================

@api_router.get("/payments")
async def get_payments(user: dict = Depends(get_current_user)):
    if user["role"] == "admin":
        payments = await db.payments.find({}, {"_id": 0}).sort("date", -1).to_list(100)
    else:
        # Also include fines with string _id parsing so they can be paid/appealed
        payments_cursor = db.payments.find({"student_id": user["username"]}).sort("date", -1)
        payments = await payments_cursor.to_list(100)
        for p in payments:
            p["_id"] = str(p.get("_id", ""))
    return payments

@api_router.post("/payments")
async def record_payment(payment: Payment, user: dict = Depends(get_current_user)):
    payment_dict = payment.model_dump()
    payment_dict["student_id"] = user["username"]
    payment_dict["date"] = datetime.now(timezone.utc).isoformat()
    payment_dict["status"] = "paid"
    
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
            
    fine_doc = {
        "student_id": student["username"],
        "student_enrollment": student_enrollment,
        "type": "fine",
        "category": category,
        "amount": amount,
        "reason": reason,
        "proof_url": proof_url,
        "status": "Pending",
        "date": datetime.now(timezone.utc).isoformat()
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

@api_router.post("/student/fines/{payment_id}/pay")
async def pay_fine(payment_id: str, user: dict = Depends(get_current_user)):
    from bson.objectid import ObjectId
    try:
        obj_id = ObjectId(payment_id)
    except:
        raise HTTPException(400, "Invalid ID")
    res = await db.payments.update_one(
        {"_id": obj_id, "student_id": user["username"]},
        {"$set": {"status": "Paid", "payment_mode": "Online Setup"}}
    )
    if res.matched_count == 0:
        raise HTTPException(404, "Fine not found")
    return {"status": "success"}

@api_router.post("/student/fines/{payment_id}/appeal")
async def appeal_fine(payment_id: str, data: dict = Body(...), user: dict = Depends(get_current_user)):
    from bson.objectid import ObjectId
    try:
        obj_id = ObjectId(payment_id)
    except:
        raise HTTPException(400, "Invalid ID")
    appeal_text = data.get("appeal_text", "")
    res = await db.payments.update_one(
        {"_id": obj_id, "student_id": user["username"]},
        {"$set": {"status": "Appealed", "appeal_text": appeal_text}}
    )
    if res.matched_count == 0:
        raise HTTPException(404, "Fine not found")
    return {"status": "success"}

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
    status = "Paid" if action == "approve" else "Pending"
    await db.payments.update_one(
        {"_id": obj_id},
        {"$set": {"status": status}}
    )
    return {"status": "success"}

# ==================== GATEPASS ROUTES ====================

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
        "reason": reason,
        "leave_from": leave_from,
        "leave_to": leave_to,
        "parent_phone": parent_phone,
        "destination": destination,
        "letter_url": letter_url,
        "status": "pending",
        "applied_date": datetime.now(timezone.utc).isoformat(),
        "approval_date": None,
        "actual_out_time": None
    }

    await db.gatepasses.insert_one(gatepass_dict)
    return {"status": "success", "message": "Gatepass applied successfully"}

@api_router.get("/gatepass")
async def get_gatepasses(user: dict = Depends(get_current_user)):
    """
    Fetches gatepass history. Admin sees all, students see theirs.
    """
    if user["role"] == "admin":
        passes = await db.gatepasses.find({}, {"_id": 0}).sort("applied_date", -1).to_list(100)
    else:
        passes = await db.gatepasses.find({"student_id": user["username"]}, {"_id": 0}).sort("applied_date", -1).to_list(100)
    
    return passes

@api_router.patch("/gatepass/{pass_id}/approve")
async def approve_gatepass(pass_id: str, status: str, user: dict = Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admin can approve gatepasses")

    gatepass = await db.gatepasses.find_one({"applied_date": pass_id})
    if not gatepass:
        raise HTTPException(status_code=404, detail="Gatepass not found")

    update_data = {
        "status": status,
        "approved_by": user["username"],
        "approval_date": datetime.now(timezone.utc).isoformat(),
        "action_date": datetime.now(timezone.utc).isoformat()
    }

    if status == "approved":
        pdf_url = await generate_gatepass_pdf({
            **gatepass,
            "status": status,
            "approval_date": update_data["approval_date"]
        })
        update_data["pdf_url"] = pdf_url

    await db.gatepasses.update_one(
        {"applied_date": pass_id},
        {"$set": update_data}
    )

    return {"message": f"Gatepass {status}"}

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
    c.drawString(100, 720, f"Student Name: {pass_data['student_name']}")
    c.drawString(100, 700, f"Enrollment: {pass_data['enrollment_number']}")
    c.drawString(100, 680, f"Destination: {pass_data['destination']}")
    c.drawString(100, 660, f"Leave From: {pass_data['leave_from']}")
    c.drawString(100, 640, f"Expected Return: {pass_data['leave_to']}")
    c.drawString(100, 620, f"Status: {pass_data['status'].upper()}")
    c.drawString(100, 600, f"Approval Date: {pass_data.get('approval_date', 'N/A')}")
    
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
        "Student", "Enrollment", "Hostel", "Room", "Destination", "Status"
    ]]

    for gp in gatepasses:
        data.append([
            gp.get("student_name", "N/A"),
            str(gp.get("enrollment_number", "N/A")),
            gp.get("hostel_name", "N/A"),
            str(gp.get("room_number", "N/A")),
            gp.get("destination", "N/A"),
            gp.get("status", "N/A").upper()
        ])

    table = Table(data, colWidths=[100, 90, 90, 55, 100, 70])
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

# @api_router.get("/laundry/machines")
# async def get_student_laundry_machines(
#     hostel: Optional[str] = Query(None),
#     block: Optional[str] = Query(None),
#     user: dict = Depends(get_current_user)
# ):
#     query = {}

#     if hostel and hostel.lower() != "all":
#         query["hostel_name"] = normalize_hostel_name(hostel)

#     if block and block.lower() != "all":
#         query["block"] = block.upper()

#     machines = await db.laundry_machines.find(query).sort([
#         ("hostel_name", 1),
#         ("block", 1),
#         ("machine_number", 1)
#     ]).to_list(1000)

#     enriched = []
#     now = now_ist()

#     for m in machines:
#         booking = None
#         remaining_minutes = 0

#         if m.get("active_booking_id"):
#             booking = await db.laundry_bookings.find_one({"_id": ObjectId(m["active_booking_id"])})
#             if booking and booking.get("end_time"):
#                 try:
#                     end_dt = datetime.fromisoformat(booking["end_time"])
#                     diff = int((end_dt - now).total_seconds() // 60)
#                     remaining_minutes = max(0, diff)
#                 except Exception:
#                     remaining_minutes = 0

#         doc = serialize_doc(m)
#         doc["remaining_minutes"] = remaining_minutes
#         doc["active_booking"] = serialize_doc(booking) if booking else None
#         enriched.append(doc)

#     return enriched

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
                "explanation_submitted_at": datetime.now(timezone.utc).isoformat()
            }
        }
    )

    await db.notifications.insert_one({
        "title": "Overdue Explanation Submitted",
        "type": "gatepass",
        "message": f"{user.get('student_name', 'Student')} submitted overdue explanation for review.",
        "target_users": "all",
        "hostel": "all",
        "date": datetime.now(timezone.utc).isoformat(),
        "read_by": []
    })

    return {"message": "Explanation submitted successfully"}    

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

# @api_router.get("/admin/laundry/health-dashboard")
# async def get_laundry_health_dashboard(user: dict = Depends(get_current_user)):
#     if user["role"] != "admin":
#         raise HTTPException(status_code=403, detail="Admin only")

#     machines = await db.laundry_machines.find({}).to_list(1000)
#     complaints = await db.laundry_complaints.find({}).to_list(2000)

#     total_machines = len(machines)
#     running = sum(1 for m in machines if m.get("status") == "running")
#     idle = sum(1 for m in machines if m.get("status") == "idle")
#     offline = sum(1 for m in machines if m.get("status") == "offline")
#     maintenance = sum(1 for m in machines if m.get("status") in ["maintenance", "needs_service"])

#     revenue = sum(float(m.get("total_revenue", 0)) for m in machines)

#     complaint_count_by_machine = defaultdict(int)
#     for c in complaints:
#         machine_code = c.get("machine_code")
#         if machine_code:
#             complaint_count_by_machine[machine_code] += 1

#     machine_rows = []
#     for m in machines:
#         machine_rows.append({
#             "machine_code": m.get("machine_code"),
#             "hostel_name": m.get("hostel_name"),
#             "block": m.get("block"),
#             "status": m.get("status"),
#             "total_cycles": m.get("total_cycles", 0),
#             "total_revenue": m.get("total_revenue", 0),
#             "complaint_count": complaint_count_by_machine.get(m.get("machine_code"), 0)
#         })

#     return {
#         "summary": {
#             "total_machines": total_machines,
#             "running": running,
#             "idle": idle,
#             "offline": offline,
#             "maintenance": maintenance,
#             "total_revenue": revenue
#         },
#         "machines": machine_rows
    # }

# @api_router.patch("/admin/laundry/machine/{machine_code}")
# async def update_laundry_machine_status(
#     machine_code: str,
#     data: LaundryMachineAction,
#     user: dict = Depends(get_current_user)
# ):
#     if user["role"] != "admin":
#         raise HTTPException(status_code=403, detail="Admin only")

#     allowed = ["idle", "booked", "running", "offline", "maintenance", "needs_service"]
#     if data.status not in allowed:
#         raise HTTPException(status_code=400, detail="Invalid status")

#     result = await db.laundry_machines.update_one(
#         {"machine_code": machine_code.upper()},
#         {"$set": {
#             "status": data.status,
#             "updated_at": iso_now_ist(),
#             "admin_note": data.note or ""
#         }}
#     )

#     if result.matched_count == 0:
#         raise HTTPException(status_code=404, detail="Machine not found")

#     return {"message": "Machine status updated"}

# 1. Student: Submit Complaint
# @api_router.post("/laundry/complaint")
# async def submit_laundry_complaint(
#     description: str = Form(...),
#     type: str = Form("manual"),
#     hostel_name: Optional[str] = Form(None),
#     block: Optional[str] = Form(None),
#     room_number: Optional[str] = Form(None),
#     machine_code: Optional[str] = Form(None),
#     image: Optional[UploadFile] = File(None),
#     current_user: dict = Depends(get_current_user)
# ):
#     image_url = None
#     if image:
#         file_ext = os.path.splitext(image.filename)[1]
#         unique_name = f"{current_user['enrollment_number']}_{int(now_ist().timestamp())}{file_ext}"
#         file_path = LAUNDRY_DIR / unique_name
#         with open(file_path, "wb") as buffer:
#             shutil.copyfileobj(image.file, buffer)
#         image_url = f"/uploads/laundry/{unique_name}"

#     machine_code = machine_code.upper() if machine_code else None

#     new_doc = {
#         "student_name": current_user.get("student_name", "Student"),
#         "enrollment_number": current_user["enrollment_number"],
#         "student_id": current_user["enrollment_number"],
#         "hostel_name": normalize_hostel_name(hostel_name or current_user.get("hostel_name", "N/A")),
#         "block": block or current_user.get("block", "N/A"),
#         "room_number": room_number or current_user.get("room_number", "N/A"),
#         "machine_code": machine_code,
#         "type": type,
#         "description": description,
#         "image_url": image_url,
#         "status": "pending",
#         "date": iso_now_ist()
#     }

#     await db.laundry_complaints.insert_one(new_doc)

#     if machine_code:
#         await recompute_machine_issue_flags(machine_code)

#     await add_notification(
#         title="Laundry Issue Submitted",
#         message=f"Your laundry issue has been recorded{f' for {machine_code}' if machine_code else ''}.",
#         target_users=current_user["enrollment_number"]
#     )

#     return {"message": "Submitted"}

# @api_router.get("/admin/laundry/export-usage")
# async def export_laundry_usage_report(
#     format: str = Query("pdf"),
#     hostel: str = Query("all"),
#     block: str = Query("all"),
#     date_from: Optional[str] = Query(None),
#     date_to: Optional[str] = Query(None),
#     current_user: dict = Depends(get_current_user)
# ):
#     if current_user["role"] != "admin":
#         raise HTTPException(status_code=403)

#     query = {}

#     if date_from or date_to:
#         query["created_at"] = {}
#         if date_from:
#             query["created_at"]["$gte"] = f"{date_from}T00:00:00"
#         if date_to:
#             query["created_at"]["$lte"] = f"{date_to}T23:59:59"

#     bookings = await db.laundry_bookings.find(query).sort("created_at", -1).to_list(length=5000)

#     rows = []
#     for b in bookings:
#         b_hostel = normalize_hostel_name(b.get("hostel_name", "N/A"))
#         b_block = str(b.get("block", "A")).upper()

#         if hostel != "all" and normalize_hostel_name(hostel) != b_hostel:
#             continue
#         if block != "all" and str(block).upper() != b_block:
#             continue

#         rows.append([
#             b.get("student_name", "N/A"),
#             b.get("student_id", "N/A"),
#             b.get("machine_code", "N/A"),
#             b.get("machine_type", "washer"),
#             b_hostel,
#             b_block,
#             b.get("booking_type", "instant"),
#             b.get("payment_mode", "wallet"),
#             b.get("status", "N/A"),
#             float(b.get("amount_paid", 0) or 0),
#             b.get("start_time", "N/A"),
#             b.get("end_time", "N/A"),
#             b.get("created_at", "N/A")
#         ])

#     timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")

#     if format.lower() == "csv":
#         file_name = f"laundry_usage_report_{timestamp}.csv"
#         file_path = UPLOAD_DIR / file_name

#         with open(file_path, "w", newline="", encoding="utf-8") as f:
#             writer = csv.writer(f)
#             writer.writerow([
#                 "Student Name", "Student ID", "Machine Code", "Machine Type", "Hostel",
#                 "Block", "Booking Type", "Payment Mode", "Status", "Amount Paid",
#                 "Start Time", "End Time", "Created At"
#             ])
#             writer.writerows(rows)

#         return {"file_url": f"/uploads/{file_name}"}

#     file_name = f"laundry_usage_report_{timestamp}.pdf"
#     file_path = UPLOAD_DIR / file_name

#     doc = SimpleDocTemplate(str(file_path), pagesize=letter)
#     styles = getSampleStyleSheet()
#     elements = []

#     elements.append(Paragraph("HOSTELEASE - Laundry Usage & Revenue Report", styles["Title"]))
#     elements.append(Paragraph(f"Hostel: {hostel}", styles["Normal"]))
#     elements.append(Paragraph(f"Block: {block}", styles["Normal"]))
#     elements.append(Paragraph(f"Date From: {date_from or 'N/A'}", styles["Normal"]))
#     elements.append(Paragraph(f"Date To: {date_to or 'N/A'}", styles["Normal"]))
#     elements.append(Spacer(1, 16))

#     data = [[
#         "Student", "Machine", "Type", "Hostel", "Block", "Status", "Amount"
#     ]]

#     for r in rows:
#         data.append([
#             r[0], r[2], r[3], r[4], r[5], r[8], f"₹{r[9]}"
#         ])

#     table = Table(data, colWidths=[85, 70, 55, 90, 45, 70, 55])
#     table.setStyle(TableStyle([
#         ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#1E293B")),
#         ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
#         ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
#         ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
#         ('FONTSIZE', (0, 0), (-1, -1), 8),
#         ('BACKGROUND', (0, 1), (-1, -1), colors.beige),
#     ]))
#     elements.append(table)
#     doc.build(elements)

#     return {"file_url": f"/uploads/{file_name}"}

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

# --- NEW: Admin Action to Update Complaint Status ---
# @api_router.patch("/complaints/{complaint_id}")
# async def update_complaint_status(
#     complaint_id: str, 
#     data: dict = Body(...), 
#     user: dict = Depends(get_current_user)
# ):
#     if user["role"] != "admin":
#         raise HTTPException(status_code=403, detail="Unauthorized")
    
#     # We use the ID to find and update the status
#     result = await db.complaints.update_one(
#         {"_id": ObjectId(complaint_id)},
#         {"$set": {"status": data.get("status"), "resolved_at": datetime.now(timezone.utc).isoformat()}}
#     )
    
#     if result.matched_count == 0:
#         # Fallback if your DB doesn't use ObjectId for complaints
#         result = await db.complaints.update_one(
#             {"student_id": complaint_id}, # Replace with your unique key if needed
#             {"$set": {"status": data.get("status")}}
#         )

#     return {"message": "Status updated successfully"}    
# ==================== ATTENDANCE ROUTES ====================

@api_router.get("/attendance")
async def get_attendance(user: dict = Depends(get_current_user)):
    if user["role"] == "admin":
        attendance = await db.attendance.find({}, {"_id": 0}).sort("date", -1).to_list(100)
    else:
        attendance = await db.attendance.find(
            {"student_id": user["enrollment_number"]},
            {"_id": 0}
        ).sort("date", -1).to_list(90)

    return attendance

@api_router.post("/attendance/mark")
async def mark_attendance(data: dict, user: dict = Depends(get_current_user)):
    today = datetime.now(timezone.utc).date().isoformat()
    current_time = datetime.now(timezone.utc)
    student_id = str(user.get("enrollment_number", "")).strip()

    if not student_id:
        raise HTTPException(status_code=400, detail="Enrollment number missing")

    existing = await db.attendance.find_one(
        {"student_id": student_id, "date": today},
        {"_id": 0}
    )
    if existing:
        raise HTTPException(status_code=400, detail="Attendance already marked today")

    cutoff_time = current_time.replace(hour=9, minute=30, second=0, microsecond=0)
    status_value = "present" if current_time <= cutoff_time else "late"

    await db.attendance.insert_one({
        "student_id": student_id,
        "date": today,
        "time": current_time.isoformat(),
        "status": status_value,
        "notification_sent": False
    })

    return {"message": f"Attendance marked as {status_value}"}

@api_router.post("/attendance/admin-mark")
async def admin_mark_attendance(data: dict, user: dict = Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admin can mark attendance")
    
    student_id = data.get("student_id")
    date = data.get("date", datetime.now(timezone.utc).date().isoformat())
    status = data.get("status", "present")
    
    await db.attendance.insert_one({
        "student_id": student_id,
        "date": date,
        "time": datetime.now(timezone.utc).isoformat(),
        "status": status,
        "notification_sent": False,
        "marked_by": user["username"]
    })
    
    # Send notification to parent if absent
    if status == "absent":
        student = await db.users.find_one({"enrollment_number": str(student_id)}, {"_id": 0})
        if student and student.get("parent_phone"):
            await send_sms(student["parent_phone"], f"Alert: {student['username']} was marked absent on {date}")
    
    return {"message": "Attendance marked"}

@api_router.get("/admin/students/attendance-summary/{enrollment}")
async def get_attendance_summary(enrollment: str):

    records = await db.attendance.find(
        {"student_id": enrollment}
    ).to_list(365)

    present = len([r for r in records if r["status"] == "present"])
    late = len([r for r in records if r["status"] == "late"])
    absent = len([r for r in records if r["status"] == "absent"])

    total = len(records)

    percentage = round((present / total) * 100, 2) if total else 0

    return {
        "present": present,
        "late": late,
        "absent": absent,
        "percentage": percentage
    }

# ==================== NOTIFICATION ROUTES ====================

# @api_router.get("/notifications")
# async def get_notifications(user: dict = Depends(get_current_user)):
#     notifications = await db.notifications.find(
#         {
#             "$or": [
#                 {"hostel": "all"},
#                 {"hostel": user.get("hostel_name")},
#                 {"target_users": "all"},
#                 {"target_users": user.get("username")}
#             ]
#         }
#     ).sort("date", -1).to_list(50)

#     for notification in notifications:
#         notification["_id"] = str(notification["_id"])
#         if "read_by" not in notification:
#             notification["read_by"] = []
#         if "title" not in notification:
#             notification["title"] = "Notice Board Update"
#         if "hostel" not in notification:
#             notification["hostel"] = "all"

#     return notifications

@api_router.get("/notifications")
async def get_notifications(user: dict = Depends(get_current_user)):
    notifications = await db.notifications.find(
        {
            "$or": [
                {"hostel": "all"},
                {"target_users": "all"},
                {"target_users": user.get("enrollment_number")}
            ]
        }
    ).sort("date", -1).to_list(50)

    for notification in notifications:
        notification["_id"] = str(notification["_id"])
        if "read_by" not in notification:
            notification["read_by"] = []
        if "title" not in notification:
            notification["title"] = "Notice Board Update"
        if "hostel" not in notification:
            notification["hostel"] = "all"

    return notifications    


@api_router.post("/notifications")
async def create_notification(data: dict, user: dict = Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admin can create notifications")

    notification = {
        "title": data.get("title", "Notice Board Update"),
        "type": data.get("type", "general"),
        "message": data.get("message"),
        "hostel": data.get("hostel", "all"),
        "target_users": data.get("target_users", "all"),
        "date": data.get("date", datetime.now(timezone.utc).isoformat()),
        "created_by": user["username"],
        "read_by": data.get("read_by", [])
    }

    await db.notifications.insert_one(notification)
    return {"message": "Notification sent"}

# ==================== ANONYMOUS FEEDBACK ROUTES ====================

@api_router.post("/food-feedback/anonymous")
async def submit_anonymous_feedback(data: dict):
    """Submit anonymous mess feedback (no authentication required)"""
    feedback_dict = {
        "meal_type": data.get("meal_type"),
        "ratings": data.get("ratings"),  # Dict with taste, quantity, hygiene, variety, temperature
        "suggestions": data.get("suggestions"),
        "timestamp": data.get("timestamp"),
        "anonymous": True,
        "date": datetime.now(timezone.utc).isoformat()
    }
    
    await db.anonymous_feedback.insert_one(feedback_dict)
    return {"message": "Anonymous feedback submitted successfully"}   

@api_router.get("/food-feedback/anonymous/stats")
async def get_anonymous_feedback_stats(user: dict = Depends(get_current_user)):
    """Get aggregated anonymous feedback stats (admin only)"""
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    
    feedback = await db.anonymous_feedback.find({}, {"_id": 0}).sort("date", -1).to_list(100)
    return feedback


# ==================== HOSTEL BOOKING ROUTES ====================

@api_router.post("/yearly-bookings/create")
async def create_booking(data: dict, user: dict = Depends(get_current_user)):
    """Submit hostel booking request"""
    booking = {
        "student_id": user["username"],
        "student_name": user.get("student_name", user["username"]),
        "enrollment_number": user.get("enrollment_number"),
        "hostel_id": data.get("hostel_id"),
        "hostel_name": data.get("hostel_name"),
        "preferences": data.get("preferences"),
        "status": "pending",
        "booking_date": data.get("booking_date"),
        "created_at": datetime.now(timezone.utc).isoformat()
    }

    await db.bookings.insert_one(booking)
    return {"message": "Booking request submitted successfully", "booking": booking}

@api_router.get("/bookings")
async def get_bookings(user: dict = Depends(get_current_user)):
    """Get all booking requests (admin) or user's bookings (student)"""
    if user["role"] == "admin":
        bookings = await db.bookings.find({}, {"_id": 0}).sort("created_at", -1).to_list(100)
    else:
        bookings = await db.bookings.find({"student_id": user["username"]}, {"_id": 0}).sort("created_at", -1).to_list(10)
    
    return bookings

@api_router.patch("/bookings/{booking_id}/approve")
async def approve_booking(booking_id: str, data: dict, user: dict = Depends(get_current_user)):
    """Approve or reject booking (admin only)"""
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    
    result = await db.bookings.update_one(
        {"created_at": booking_id},
        {"$set":
         {
             "status": data.get("status"),  # "approved" or "rejected"
             "approved_by": user["username"],
             "approved_at": datetime.now(timezone.utc).isoformat(),
             "assigned_room": data.get("assigned_room"),
             "assigned_floor": data.get("assigned_floor"),
             "assigned_bed": data.get("assigned_bed")
         }
        }
    )

    return {"message": f"Booking {data.get('status')}"}                     

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

# ==================== UPDATED AUTH: REGISTRATION & LOGIN ====================

@api_router.post("/auth/register")
async def register(user: UserRegister):
    # Check if student exists in our 'Pre-authorized' CSV data (the files you uploaded)
    # This prevents random signups; only students in your CSV can register.
    csv_check = await db.authorized_students.find_one({"Student_ID": int(user.enrollment_number)})
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

# ==================== UPDATED COMPLAINT: PDF & IMAGE SUPPORT ====================

@api_router.post("/complaints")
async def submit_complaint(
    category: str = Form(...),
    description: str = Form(...),
    priority: str = Form("medium"),
    image: Optional[UploadFile] = File(None),
    user: dict = Depends(get_current_user)
):
    complaint_dict = {
        "student_id": user.get("username") or user.get("enrollment_number"),
        "student_name": user.get("student_name") or user.get("username"),
        "enrollment_number": str(user.get("enrollment_number", "N/A")),
        "hostel_name": normalize_hostel_name(user.get("hostel_name", "N/A")),
        "block": user.get("block", "N/A"),
        "room_number": user.get("room_number", "N/A"),
        "category": str(category).strip().lower(),
        "description": str(description).strip(),
        "priority": normalize_priority(priority),
        "status": "pending",
        "date": datetime.now(timezone.utc).isoformat(),
        "resolved_at": None,
        "resolved_by": None,
        "image_url": None,
        "pdf_url": None
    }

    if image:
        success, filename, message = await save_upload_file(image)
        if not success:
            raise HTTPException(status_code=400, detail=message)
        complaint_dict["image_url"] = f"/uploads/{filename}"

    complaint_dict["pdf_url"] = await generate_complaint_pdf(complaint_dict)

    result = await db.complaints.insert_one(complaint_dict)
    complaint_dict["_id"] = str(result.inserted_id)

    return {
        "status": "success",
        "message": "Complaint registered",
        "data": complaint_dict
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
        "bookings": db.bookings,
        "notifications": db.notifications
    }

    if module not in allowed_modules:
        raise HTTPException(status_code=400, detail="Invalid module name")

    collection = allowed_modules[module]

    query = {"_id": ObjectId(record_id)} if ObjectId.is_valid(record_id) else {"_id": record_id}

    # normalize hostel spelling if sent from frontend
    if "hostel_name" in updates and updates["hostel_name"] == "Shakunthala Bhawan":
        updates["hostel_name"] = "Shakuntala Bhawan"

    result = await collection.update_one(query, {"$set": updates})

    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail=f"Record not found in {module}")

    return {"message": f"{module} updated successfully"}  

@api_router.get("/admin/students")
async def get_all_students(user: dict = Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    # Fetch students and return required fields for the table
    students = await db.users.find(
        {"role": "student"},
        {"password": 0}  # Security: Never send passwords
    ).to_list(length=1000)

     # Format MongoDB _id to string for the frontend
    for student in students:
        student["_id"] = str(student["_id"])

        if student.get("hostel_name") == "Shakunthala Bhawan":
            student["hostel_name"] = "Shakuntala Bhawan"

        if "registration_no" not in student and student.get("enrollment_number"):
            student["registration_no"] = student["enrollment_number"]

        if "student_name" not in student and student.get("name"):
            student["student_name"] = student["name"]

    return students

# DELETE a student record
@api_router.delete("/admin/students/{student_id}")
async def remove_student(student_id: str, user: dict = Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    try:
        result = await db.users.delete_one({"_id": ObjectId(student_id)})
        
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Student not found")
            
        return {"message": "Student record removed successfully"}
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid student ID format")

@api_router.post("/admin/students", status_code=status.HTTP_201_CREATED)
async def create_student(student_data: StudentCreate, user: dict = Depends(get_current_user)):
    """
    Creates a new student record manually from the Admin Dashboard.
    Ensures no duplicate registration numbers exist.
    """
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    hostel_name = student_data.hostel_name.strip()
    if hostel_name == "Shakunthala Bhawan":
        hostel_name = "Shakuntala Bhawan"

    # 1. Check for duplicate registration numbers
    existing_student = await db.users.find_one({
        "$or": [
            {"enrollment_number": student_data.enrollment_number},
            {"registration_no": student_data.enrollment_number}
        ]
    })

    if existing_student:
        raise HTTPException(
            status_code=400,
            detail=f"Student with Enrollment No {student_data.enrollment_number} already exists"
        )
        
    # 2. Check for duplicate parent combinations
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
                     detail="A student with matching parent/guardian details (Phone or Names) already exists. Sibling accounts must bypass frontend creation."
                 )
    # 3. Prepare the document for MongoDB
    new_student_dict = {
        "student_name": student_data.student_name,
        "enrollment_number": student_data.enrollment_number,
        "registration_no": student_data.enrollment_number,
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
        "password": hash_password("hostel@123"), # Force default hash
        "is_first_login": True,
        "is_default_password": True,
        "two_factor_enabled": False,
        "two_factor_secret": None,
        "email_otp": None,
        "email_otp_expiry": None,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    # 4. Insert into the users collection
    result = await db.users.insert_one(new_student_dict)

    # 4. Attach the new ID and return the created record to the frontend
    new_student_dict["_id"] = str(result.inserted_id)

    return new_student_dict

@api_router.post("/admin/students/bulk")
async def bulk_register_students(student_list: List[dict], user: dict = Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    if not student_list:
        raise HTTPException(status_code=400, detail="No student data received")

    docs = []
    enrollment_numbers = []

    for s in student_list:
        student_name = s.get("student_name") or s.get("name")
        enrollment_number = s.get("enrollment_number") or s.get("registration_no")
        hostel_name = (s.get("hostel_name") or "N/A").strip()

        if hostel_name == "Shakunthala Bhawan":
            hostel_name = "Shakuntala Bhawan"

        if not student_name or not enrollment_number:
            continue

        enrollment_numbers.append(enrollment_number)

        docs.append({
            "student_name": student_name.strip(),
            "enrollment_number": str(enrollment_number).strip(),
            "registration_no": str(enrollment_number).strip(),
            "hostel_name": hostel_name,
            "block": s.get("block", "N/A"),
            "room_number": s.get("room_number", "N/A"),
            "floor": s.get("floor", "N/A"),
            "bed_number": s.get("bed_number", "N/A"),
            "role": "student",
            "created_at": datetime.now(timezone.utc).isoformat()
        })

    if not docs:
        raise HTTPException(status_code=400, detail="No valid student rows found")

    existing = await db.users.find({
        "$or": [
            {"enrollment_number": {"$in": enrollment_numbers}},
            {"registration_no": {"$in": enrollment_numbers}}
        ]
    }).to_list(1000)

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

    return docs       

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

    # --------------------------------------------------
    # PRIMARY SOURCE: db.rooms
    # This should contain all rooms, including vacant ones
    # --------------------------------------------------
    room_docs = await db.rooms.find({}).to_list(length=5000)

    if room_docs:
        # preload students for enrichment
        students = await db.users.find(
            {"role": "student"},
            {
                "student_name": 1,
                "username": 1,
                "enrollment_number": 1,
                "hostel_name": 1,
                "block": 1,
                "floor": 1,
                "room_number": 1,
                "_id": 0
            }
        ).to_list(length=5000)

        # build lookup by hostel + block + floor + room
        student_lookup = {}
        for s in students:
            key = (
                normalize_hostel_value(s.get("hostel_name")),
                normalize_block_value(s.get("block")),
                normalize_floor_value(s.get("floor")),
                normalize_room_value(s.get("room_number"))
            )
            student_lookup[key] = s

        for room in room_docs:
            hostel = normalize_hostel_value(room.get("hostel_name"))
            block = normalize_block_value(room.get("block"))
            floor = normalize_floor_value(room.get("floor"))
            room_number = normalize_room_value(room.get("room_number"))

            # determine occupancy
            is_available = room.get("is_available")
            occupied_by = room.get("occupied_by")

            key = (hostel, block, floor, room_number)
            matched_student = student_lookup.get(key)

            is_occupied = False
            if is_available is not None:
                is_occupied = not bool(is_available)
            elif occupied_by:
                is_occupied = True
            elif matched_student:
                is_occupied = True

            student_name = None
            if matched_student:
                student_name = matched_student.get("student_name") or matched_student.get("username") or "Resident"

            live_status.append({
                "number": room_number,
                "floor": floor,
                "block": block,
                "hostel": hostel,
                "status": "occupied" if is_occupied else "available",
                "studentName": student_name if is_occupied else None,
                "occupied_by": occupied_by,
                "capacity": room.get("capacity", 1),
                "occupied_count": room.get("occupied_count", 1 if is_occupied else 0),
                "room_type": room.get("room_type", "standard")
            })

        live_status.sort(key=lambda x: (
            x["hostel"],
            x["block"],
            x["floor"],
            x["number"]
        ))
        return live_status

    # --------------------------------------------------
    # FALLBACK SOURCE: db.users
    # If db.rooms collection is empty, still show occupied rooms
    # --------------------------------------------------
    students = await db.users.find({
        "role": "student",
        "hostel_name": {"$nin": [None, "", "N/A"]},
        "room_number": {"$nin": [None, "", "N/A"]}
    }).to_list(length=5000)

    seen = set()

    for s in students:
        hostel = normalize_hostel_value(s.get("hostel_name"))
        block = normalize_block_value(s.get("block"))
        floor = normalize_floor_value(s.get("floor"))
        room_number = normalize_room_value(s.get("room_number"))

        key = (hostel, block, floor, room_number)
        if key in seen:
            continue
        seen.add(key)

        live_status.append({
            "number": room_number,
            "floor": floor,
            "block": block,
            "hostel": hostel,
            "status": "occupied",
            "studentName": s.get("student_name") or s.get("username") or "Resident",
            "occupied_by": s.get("enrollment_number") or s.get("username"),
            "capacity": 1,
            "occupied_count": 1,
            "room_type": "standard"
        })

    live_status.sort(key=lambda x: (
        x["hostel"],
        x["block"],
        x["floor"],
        x["number"]
    ))
    return live_status

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

# 3. Comprehensive History Aggregator

# @api_router.get("/admin/students/history/{enrollment_number}")
# async def get_student_history(enrollment_number: str):
#     gatepasses = await db.gatepasses.find(
#         {"enrollment_number": str(enrollment_number)}
#     ).sort("applied_date", -1).to_list(100)

#     complaints = await db.complaints.find(
#         {"enrollment_number": str(enrollment_number)}
#     ).sort("date", -1).to_list(100)

#     fines = await db.fines.find(
#         {"enrollment_number": str(enrollment_number)}
#     ).sort("date", -1).to_list(100) if "fines" in await db.list_collection_names() else []

#     for gp in gatepasses:
#         gp["_id"] = str(gp["_id"])
#         gp["status"] = str(gp.get("status", "pending")).lower()

#     for cp in complaints:
#         cp["_id"] = str(cp["_id"])
#         cp["hostel_name"] = normalize_hostel_name(cp.get("hostel_name", "N/A"))
#         cp["status"] = normalize_status(cp.get("status", "pending"))
#         cp["priority"] = normalize_priority(cp.get("priority", "medium"))

#     for fine in fines:
#         fine["_id"] = str(fine["_id"])

#     return {
#         "gatepasses": gatepasses,
#         "complaints": complaints,
#         "fines": fines
#     }    

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

    fines = []
    if "fines" in await db.list_collection_names():
        fines = await db.fines.find(
            {"enrollment_number": student_id}
        ).sort("date", -1).to_list(100)

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

    return {
        "gatepasses": gatepasses,
        "complaints": complaints,
        "laundry_complaints": laundry_complaints,
        "laundry_bookings": laundry_bookings,
        "fines": fines
    }

# @api_router.get("/admin/students/conduct-report/{enrollment_number}")
# async def generate_conduct_report(enrollment_number: str):
#     # 1. Fetch all data
#     student = await db.users.find_one({"enrollment_number": enrollment_number})
#     gatepasses = await db.gatepasses.find({"enrollment_number": enrollment_number}).to_list(100)
#     complaints = await db.complaints.find({"enrollment_number": enrollment_number}).to_list(100)
    
#     if not student:
#         raise HTTPException(404, "Student not found")

#     file_name = f"conduct_{enrollment_number}.pdf"
#     file_path = UPLOAD_DIR / file_name
    
#     # 2. Build PDF
#     doc = SimpleDocTemplate(str(file_path), pagesize=letter)
#     elements = []
#     styles = getSampleStyleSheet()
    
#     # Header
#     elements.append(Paragraph(f"HOSTELEASE - RESIDENT CONDUCT REPORT", styles['Title']))
#     elements.append(Paragraph(f"Generated on: {datetime.now().strftime('%d-%m-%Y')}", styles['Normal']))
#     elements.append(Spacer(1, 20))
    
#     # Student Bio Table
#     bio_data = [
#         ["Name", student.get("student_name"), "Enrollment", enrollment_number],
#         ["Hostel", student.get("hostel_name"), "Room/Bed", f"{student.get('room_number')}/{student.get('bed_number')}"],
#         ["Father", student.get("father_name"), "Contact", student.get("father_contact")]
#     ]
#     bio_table = Table(bio_data, colWidths=[80, 150, 80, 150])
#     bio_table.setStyle(TableStyle([
#         ('GRID', (0, 0), (-1, -1), 1, colors.grey),
#         ('BACKGROUND', (0, 0), (0, -1), colors.whitesmoke),
#         ('BACKGROUND', (2, 0), (2, -1), colors.whitesmoke),
#         ('FONTNAME', (0, 0), (-1, -1), 'Helvetica-Bold'),
#         ('FONTSIZE', (0, 0), (-1, -1), 9),
#     ]))
#     elements.append(bio_table)
#     elements.append(Spacer(1, 20))
    
#     # History Summary
#     elements.append(Paragraph("Verified Histories", styles['Heading3']))
#     data = [["Type", "Detail", "Date", "Status"]]
#     for gp in gatepasses:
#         data.append(["Gatepass", gp.get("reason"), gp.get("applied_date")[:10], gp.get("status")])
#     for cp in complaints:
#         data.append([
#             "Complaint",
#             f"{cp.get('category', 'other')} | {cp.get('priority', 'medium')} | {cp.get('description', '')[:40]}",
#             str(cp.get("date", ""))[:10],
#             cp.get("status", "pending")
#         ])
#     hist_table = Table(data, colWidths=[70, 200, 100, 90])
#     hist_table.setStyle(TableStyle([
#         ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#1E293B")),
#         ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
#         ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
#         ('FONTSIZE', (0, 0), (-1, -1), 8),
#     ]))
    
#     elements.append(hist_table)
#     doc.build(elements)
    
#     return {"pdf_url": f"/uploads/{file_name}"}

@api_router.get("/admin/students/conduct-report/{enrollment_number}")
async def generate_conduct_report(enrollment_number: str, user: dict = Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    clean_id = str(enrollment_number).strip()

    student = await db.users.find_one({"enrollment_number": clean_id})
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    gatepasses = await db.gatepasses.find({"enrollment_number": clean_id}).sort("applied_date", -1).to_list(100)
    complaints = await db.complaints.find({"enrollment_number": clean_id}).sort("date", -1).to_list(100)
    laundry_complaints = await db.laundry_complaints.find({"enrollment_number": clean_id}).sort("date", -1).to_list(100)

    fines = []
    if "fines" in await db.list_collection_names():
        fines = await db.fines.find({"enrollment_number": clean_id}).sort("date", -1).to_list(100)

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
        ["Fines", str(len(fines))]
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

# @api_router.post("/admin/students/mark-fine")
# async def mark_student_fine(data: dict = Body(...), user: dict = Depends(get_current_user)):
#     """Admin route to penalize students with financial fines."""
#     if user["role"] != "admin":
#         raise HTTPException(status_code=403, detail="Unauthorized")
    
#     fine_doc = {
#         "enrollment_number": data["enrollment_number"],
#         "amount": data["amount"],
#         "description": data["description"],
#         "date": data.get("date", datetime.now(timezone.utc).isoformat()),
#         "imposed_by": user["username"],
#         "status": "unpaid"
#     }
    
#     await db.fines.insert_one(fine_doc)
#     return {"message": "Fine registered successfully"}    

@api_router.post("/admin/students/mark-fine")
async def mark_student_fine(data: dict = Body(...), user: dict = Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Unauthorized")

    enrollment_number = str(data.get("enrollment_number", "")).strip()
    amount = float(data.get("amount", 0) or 0)
    description = str(data.get("description", "")).strip()

    if not enrollment_number:
        raise HTTPException(status_code=400, detail="Enrollment number is required")
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Fine amount must be greater than 0")
    if not description:
        raise HTTPException(status_code=400, detail="Fine description is required")

    student = await db.users.find_one({"enrollment_number": enrollment_number})
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    fine_doc = {
        "enrollment_number": enrollment_number,
        "student_name": student.get("student_name", "Student"),
        "amount": amount,
        "description": description,
        "date": data.get("date", datetime.now(timezone.utc).isoformat()),
        "imposed_by": user.get("username", "admin"),
        "status": "unpaid"
    }

    await db.fines.insert_one(fine_doc)
    return {"message": "Fine registered successfully"}

@api_router.get("/admin/gatepasses/all")
async def get_all_gatepasses(user: dict = Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403)

    # Fetch all records, sorted by most recent date
    passes = await db.gatepasses.find().sort("applied_date", -1).to_list(length=200)
    
    for p in passes:
        p["_id"] = str(p["_id"])
        
    return passes
@api_router.get("/admin/students/search-suggestions")
async def get_search_suggestions(query: str = Query("")):
    if len(query) < 2:
        return []
    
    # Searches for matches in Enrollment Number or Name
    suggestions = await db.users.find({
        "role": "student",
        "$or": [
            {"enrollment_number": {"$regex": query, "$options": "i"}},
            {"student_name": {"$regex": query, "$options": "i"}}
        ]
    }, {"enrollment_number": 1, "student_name": 1, "_id": 0}).limit(10).to_list(10)
    
    return suggestions

@api_router.get("/admin/gatepasses/pending")
async def get_pending_gatepasses(user: dict = Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    # Fetch gatepasses where status is 'pending'
    # Use .to_list() for motor/mongodb
    passes = await db.gatepasses.find({"status": "pending"}).to_list(length=100)
    
    # Enrich data with student details if necessary, 
    # or ensure your 'gatepasses' collection already has student_name
    for p in passes:
        p["_id"] = str(p["_id"])
        
    return passes

@api_router.put("/admin/gatepass-action/{pass_id}")
async def update_gatepass_status(pass_id: str, data: dict, user: dict = Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403)
        
    result = await db.gatepasses.update_one(
        {"_id": ObjectId(pass_id)},
        {"$set": {"status": data["status"], "action_by": user["username"]}}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Gatepass not found")
        
    return {"message": "Updated successfully"}   

@api_router.post("/admin/gatepass/send-overdue-alert/{pass_id}")
async def send_overdue_alert(pass_id: str, user: dict = Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403)

    # 1. Fetch the specific gatepass and student details
    gatepass = await db.gatepasses.find_one({"_id": ObjectId(pass_id)})
    student = await db.users.find_one({"enrollment_number": gatepass["enrollment_number"]})

    if not gatepass or not student:
        raise HTTPException(status_code=404, detail="Record not found")

    # 2. Update status to require explanation
    await db.gatepasses.update_one(
        {"_id": ObjectId(pass_id)},
        {"$set": {"is_overdue": True, "explanation_required": True, "explanation_status": "pending"}}
    )

    # 3. DISPATCH EMAIL (Example Logic)
    msg = EmailMessage()
    msg.set_content(f"""
    Urgent: Overdue Hostel Return
    Hello {student['student_name']},
    
    You were scheduled to return on {gatepass['leave_to']}. You are currently marked as OVERDUE.
    You must submit a formal explanation with parent approval via the Hostelease Portal immediately.
    
    Parent Contacted: {student['parent_phone']}
    """)
    
    msg['Subject'] = 'HOSTELEASE: Overdue Return Alert'
    msg['From'] = "security@hostelease.com"
    msg['To'] = student['personal_email']

    # Note: Configure your SMTP server here (Gmail/SendGrid/etc)
    # with smtplib.SMTP_SSL('smtp.gmail.com', 465) as smtp:
    #     smtp.login("USER", "PASS")
    #     smtp.send_message(msg)

    return {"status": "success", "message": "Alerts sent and explanation requested"} 
@api_router.get("/mess/menu/previous")
async def get_previous_menu():
    # Example logic: Fetch the last saved menu items or a template week
    # In a real app, you might store history with a 'week_id'
    prev_menu = await db.mess_menu.find().to_list(length=7)
    return {"menu": prev_menu}

@api_router.post("/mess/templates")
async def save_mess_template(data: dict):
    # Store the template with a name and the menu array
    await db.mess_templates.insert_one({
        "name": data["name"],
        "menu": data["menu"],
        "created_at": datetime.now()
    })
    return {"message": "Template saved"}

@api_router.get("/mess/templates")
async def get_mess_templates():
    templates = await db.mess_templates.find().to_list(length=50)
    for t in templates: t["_id"] = str(t["_id"])
    return templates    


# ==================== ADMIN DASHBOARD STATS ====================
# @api_router.get("/admin/stats")
# async def get_admin_stats(user: dict = Depends(get_current_user)):
#     if user["role"] != "admin":
#         raise HTTPException(status_code=403, detail="Admin only")
    
#     total_students = await db.users.count_documents({"role": "student"})
#     occupied_beds = total_students 
    
#     pipeline = [
#         {"$match": {"role": "student"}},
#         {"$group": {"_id": "$hostel_name", "count": {"$sum": 1}}},
#         {"$project": {"name": "$_id", "count": 1, "_id": 0}}
#     ]
#     hostel_distribution = await db.users.aggregate(pipeline).to_list(length=100)
#     pending_complaints = await db.complaints.count_documents({"status": "pending"})
#     pending_gatepasses = await db.gatepasses.count_documents({"status": "pending"})
    
#     return {
#         "total_students": total_students,
#         "pending_complaints": pending_complaints,
#         "pending_gatepasses": pending_gatepasses,
#         "occupied_beds": occupied_beds,
#         "hostel_distribution": hostel_distribution
#     }

# SINGLE PDF GENERATOR (Removed the duplicate one)
# async def generate_complaint_pdf(complaint_data: dict):
#     file_name = f"complaint_{uuid.uuid4()}.pdf"
#     file_path = UPLOAD_DIR / file_name
#     c = canvas.Canvas(str(file_path), pagesize=letter)
#     c.setFont("Helvetica-Bold", 16)
#     c.drawString(100, 750, "HOSTELEASE - OFFICIAL COMPLAINT RECORD")
#     c.setFont("Helvetica", 12)
#     c.drawString(100, 730, f"Student: {complaint_data.get('student_name')} ({complaint_data.get('enrollment_number')})")
#     c.drawString(100, 710, f"Category: {complaint_data.get('category', '').upper()}")
#     c.drawString(100, 670, f"Description: {complaint_data.get('description')}")
#     c.save()
#     return f"/uploads/{file_name}"

# @api_router.patch("/complaints/{complaint_id}")
# async def update_complaint_status(complaint_id: str, data: dict = Body(...), user: dict = Depends(get_current_user)):
#     if user["role"] != "admin":
#         raise HTTPException(status_code=403)
    
#     # Use a try-except to handle cases where ID is not a valid ObjectId
#     try:
#         query_id = ObjectId(complaint_id)
#     except:
#         query_id = complaint_id

#     result = await db.complaints.update_one(
#         {"_id": query_id},
#         {"$set": {"status": data.get("status"), "resolved_at": datetime.now(timezone.utc).isoformat()}}
#     )
#     return {"message": "Success"}

async def generate_complaint_pdf(complaint_data: dict):
    file_name = f"complaint_{uuid.uuid4()}.pdf"
    file_path = UPLOAD_DIR / file_name

    c = canvas.Canvas(str(file_path), pagesize=letter)

    c.setFont("Helvetica-Bold", 16)
    c.drawString(70, 760, "HOSTELEASE - OFFICIAL COMPLAINT RECORD")
    c.line(70, 752, 540, 752)

    c.setFont("Helvetica", 11)
    c.drawString(70, 725, f"Student Name: {complaint_data.get('student_name', 'N/A')}")
    c.drawString(70, 705, f"Enrollment No: {complaint_data.get('enrollment_number', 'N/A')}")
    c.drawString(70, 685, f"Hostel: {complaint_data.get('hostel_name', 'N/A')}")
    c.drawString(70, 665, f"Block / Room: {complaint_data.get('block', 'N/A')} / {complaint_data.get('room_number', 'N/A')}")
    c.drawString(70, 645, f"Category: {str(complaint_data.get('category', 'N/A')).upper()}")
    c.drawString(70, 625, f"Priority: {str(complaint_data.get('priority', 'medium')).upper()}")
    c.drawString(70, 605, f"Status: {str(complaint_data.get('status', 'pending')).upper()}")
    c.drawString(70, 585, f"Submitted At: {complaint_data.get('date', 'N/A')}")

    if complaint_data.get("resolved_at"):
        c.drawString(70, 565, f"Resolved At: {complaint_data.get('resolved_at')}")
    if complaint_data.get("resolved_by"):
        c.drawString(70, 545, f"Resolved By: {complaint_data.get('resolved_by')}")

    c.setFont("Helvetica-Bold", 12)
    c.drawString(70, 510, "Description:")
    c.setFont("Helvetica", 11)

    text_obj = c.beginText(70, 490)
    text_obj.setLeading(16)
    description = complaint_data.get("description", "N/A")
    for line in str(description).split("\n"):
        text_obj.textLine(line[:110])
    c.drawText(text_obj)

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
    updates = {
        "status": new_status
    }

    if new_status == "resolved":
        updates["resolved_at"] = datetime.now(timezone.utc).isoformat()
        updates["resolved_by"] = user.get("username") or user.get("enrollment_number") or "admin"
    elif new_status in ["pending", "in_progress", "rejected"]:
        updates["resolved_at"] = None
        updates["resolved_by"] = None

    try:
        query_id = ObjectId(complaint_id)
    except Exception:
        query_id = complaint_id

    existing = await db.complaints.find_one({"_id": query_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Complaint not found")

    await db.complaints.update_one(
        {"_id": query_id},
        {"$set": updates}
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

    return {"message": "Complaint status updated successfully"}

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

    all_complaints = await db.complaints.find({}).sort("date", -1).to_list(1000)

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
            item.get("student_name", "N/A"),
            str(item.get("enrollment_number", "N/A")),
            hostel_name,
            str(item.get("block", "N/A")),
            str(item.get("room_number", "N/A")),
            item_category,
            item_priority,
            item_status,
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
                "Student Name",
                "Enrollment",
                "Hostel",
                "Block",
                "Room",
                "Category",
                "Priority",
                "Status",
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
        "Student",
        "Enroll",
        "Hostel",
        "Block",
        "Room",
        "Category",
        "Priority",
        "Status"
    ]]
    for row in filtered_rows:
        table_data.append(row[:8])

    table = Table(table_data, colWidths=[85, 65, 80, 40, 45, 65, 55, 60])
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

# --- NEW: STUDENT SEARCH FOR VISITOR AUTO-FILL & PARENT CHECK ---
@api_router.get("/admin/students/search")
async def search_student_for_visitor(name: str):
    student = await db.users.find_one({
        "student_name": {"$regex": f"^{name.strip()}$", "$options": "i"},
        "role": "student"
    })

    if not student:
        return None

    hostel_name = student.get("hostel_name", "N/A")
    if hostel_name == "Shakunthala Bhawan":
        hostel_name = "Shakuntala Bhawan"

    return {
        "student_name": student.get("student_name"),
        "enrollment_number": student.get("enrollment_number"),
        "father_name": student.get("father_name"),
        "mother_name": student.get("mother_name"),
        "father_contact": student.get("father_contact"),
        "mother_contact": student.get("mother_contact"),
        "hostel_name": hostel_name,
        "room_number": student.get("room_number", "N/A"),
        "bed_number": student.get("bed_number", "N/A"),
        "block": student.get("block", "N/A")
    }

@api_router.post("/admin/visitor-entry")
async def visitor_entry(data: dict = Body(...)):
    check_in_time = datetime.now(timezone.utc).isoformat()

    doc = {
        "visitorName": data.get("visitorName"),
        "contactNo": data.get("contactNo"),
        "idProof": data.get("idProof"),
        "whomToVisit": data.get("whomToVisit"),
        "hostel_name": data.get("hostel_name"),
        "room_number": data.get("room_number"),
        "bed_number": data.get("bed_number"),
        "studentEnrollment": data.get("studentEnrollment"),
        "purpose": data.get("purpose"),
        "visitorType": data.get("visitorType", "friend"),
        "isParent": data.get("isParent", False),
        "checkIn": check_in_time,
        "status": "In",
        "checkOut": None
    }

    await db.visitor_logs.insert_one(doc)

    if data.get("studentEnrollment"):
        await db.notifications.insert_one({
            "title": "Visitor Entry Registered",
            "type": "general",
            "message": f"{data.get('visitorName')} visited you and checked in.",
            "target_users": data.get("studentEnrollment"),
            "hostel": "private",
            "date": check_in_time,
            "read_by": []
        })

    return {"message": "Success"}

@api_router.get("/admin/visitor-logs")
async def get_visitor_logs():
    logs = await db.visitor_logs.find().sort("checkIn", -1).to_list(100)
    for l in logs: l["_id"] = str(l["_id"])
    return logs

@api_router.put("/admin/visitor-checkout/{id}")
async def visitor_checkout(id: str):
    log = await db.visitor_logs.find_one({"_id": ObjectId(id)})
    if not log:
        raise HTTPException(status_code=404, detail="Visitor log not found")

    check_out_time = datetime.now(timezone.utc).isoformat()

    await db.visitor_logs.update_one(
        {"_id": ObjectId(id)},
        {"$set": {"status": "Out", "checkOut": check_out_time}}
    )

    if log.get("studentEnrollment"):
        await db.notifications.insert_one({
            "title": "Visitor Checkout Recorded",
            "type": "general",
            "message": f"{log.get('visitorName')} checked out.",
            "target_users": log.get("studentEnrollment"),
            "hostel": "private",
            "date": check_out_time,
            "read_by": []
        })

    return {"message": "Checked out successfully"}

@api_router.get("/admin/visitor-report")
async def generate_visitor_report():
    """Generates a professional PDF report of today's visitors."""
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    
    # Fetch today's logs
    logs = await db.visitor_logs.find({"checkIn": {"$gte": today_start}}).sort("checkIn", 1).to_list(200)
    
    file_name = f"visitor_report_{datetime.now().strftime('%Y-%m-%d')}.pdf"
    file_path = UPLOAD_DIR / file_name
    
    doc = SimpleDocTemplate(str(file_path), pagesize=letter)
    elements = []
    styles = getSampleStyleSheet()

    # Title & Header
    elements.append(Paragraph(f"HOSTELEASE - Daily Visitor Report", styles['Title']))
    elements.append(Paragraph(f"Date: {datetime.now().strftime('%B %d, %Y')}", styles['Normal']))
    elements.append(Spacer(1, 20))

    # Table Data
    data = [["Visitor", "Resident", "Hostel/Room", "In Time", "Out Time", "Status"]]
    for log in logs:
        in_time = datetime.fromisoformat(log['checkIn']).strftime('%I:%M %p')
        out_time = datetime.fromisoformat(log['checkOut']).strftime('%I:%M %p') if log.get('checkOut') else "---"
        
        data.append([
            log['visitorName'],
            log['whomToVisit'],
            f"{log.get('hostel_name', 'N/A')} / {log.get('room_number', 'N/A')}",
            in_time,
            out_time,
            log['status']
        ])

    # Table Styling
    t = Table(data, colWidths=[100, 100, 100, 70, 70, 60])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#1E293B")),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 10),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
        ('BACKGROUND', (0, 1), (-1, -1), colors.beige),
        ('GRID', (0, 0), (-1, -1), 1, colors.black)
    ]))
    
    elements.append(t)
    doc.build(elements)
    
    return {"pdf_url": f"/uploads/{file_name}"}

@api_router.get("/admin/attendance/daily-status")
async def get_daily_attendance_status(date: Optional[str] = Query(None), user: dict = Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    target_date = date if date else datetime.now(timezone.utc).date().isoformat()
    now_full = datetime.now(timezone.utc)

    students = await db.users.find({"role": "student"}).to_list(2000)
    records = await db.attendance.find({"date": target_date}).to_list(2000)

    attendance_map = {r["student_id"]: r for r in records}

    status_list = []
    for s in students:
        enrollment = str(s.get("enrollment_number", "")).strip()
        current_record = attendance_map.get(enrollment)
        current_status = current_record["status"] if current_record else None

        if not current_status:
            if target_date < now_full.date().isoformat():
                current_status = "absent"
            else:
                current_status = "pending"

        hostel_name = s.get("hostel_name", "N/A")
        if hostel_name == "Shakunthala Bhawan":
            hostel_name = "Shakuntala Bhawan"

        status_list.append({
            "_id": str(s["_id"]),
            "student_name": s.get("student_name", s.get("username", "Student")),
            "enrollment_number": enrollment,
            "hostel_name": hostel_name,
            "block": s.get("block", "N/A"),
            "room_number": s.get("room_number", "N/A"),
            "today_status": current_status
        })

    return status_list

@api_router.post("/admin/attendance/mark")
async def admin_mark_attendance_legacy(data: dict = Body(...), user: dict = Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only admin can mark attendance")

    now = datetime.now(timezone.utc)
    target_date = data.get("date", now.date().isoformat())
    status_value = data.get("status", "present")

    doc = {
        "student_id": data["student_id"],
        "date": target_date,
        "time": now.isoformat(),
        "status": status_value,
        "marked_by": user.get("username", "admin_biometric")
    }

    await db.attendance.update_one(
        {"student_id": data["student_id"], "date": target_date},
        {"$set": doc},
        upsert=True
    )

    return {"message": "Attendance updated successfully"}

@api_router.get("/admin/attendance/export")
async def export_attendance_report(
    date: str = Query(...),
    hostel: str = Query("all"),
    format: str = Query("pdf"),
    user: dict = Depends(get_current_user)
):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")

    students = await db.users.find({"role": "student"}).to_list(1000)
    records = await db.attendance.find({"date": date}).to_list(1000)
    attendance_map = {r["student_id"]: r for r in records}

    rows = []
    for s in students:
        hostel_name = s.get("hostel_name", "N/A")
        if hostel_name == "Shakunthala Bhawan":
            hostel_name = "Shakuntala Bhawan"

        if hostel != "all" and hostel_name != hostel:
            continue

        enrollment = s.get("enrollment_number")
        record = attendance_map.get(enrollment)

        status_value = record["status"] if record else "absent"
        time_value = record["time"] if record else "N/A"

        rows.append([
            s.get("student_name", s.get("username", "Student")),
            enrollment,
            hostel_name,
            s.get("block", "N/A"),
            s.get("room_number", "N/A"),
            status_value,
            time_value
        ])

    timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")

    if format.lower() == "csv":
        file_name = f"attendance_report_{timestamp}.csv"
        file_path = UPLOAD_DIR / file_name

        with open(file_path, "w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            writer.writerow(["Student Name", "Enrollment", "Hostel", "Block", "Room", "Status", "Time"])
            writer.writerows(rows)

        return {"file_url": f"/uploads/{file_name}"}

    file_name = f"attendance_report_{timestamp}.pdf"
    file_path = UPLOAD_DIR / file_name

    doc = SimpleDocTemplate(str(file_path), pagesize=letter)
    styles = getSampleStyleSheet()
    elements = []

    elements.append(Paragraph("HOSTELEASE - Attendance Report", styles["Title"]))
    elements.append(Paragraph(f"Date: {date}", styles["Normal"]))
    elements.append(Paragraph(f"Hostel Filter: {hostel}", styles["Normal"]))
    elements.append(Spacer(1, 20))

    data = [["Student", "Enrollment", "Hostel", "Block", "Room", "Status", "Time"]]
    data.extend(rows)

    table = Table(data, colWidths=[110, 80, 90, 50, 70, 100])
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

@api_router.get("/admin/login-logs")
async def get_admin_login_logs(user: dict = Depends(get_current_user)):
    """Fetches security logs for the admin profile page."""
    if user["role"] != "admin":
        raise HTTPException(status_code=403)
    
    # Fetch last 5 login attempts
    logs = await db.login_logs.find({"username": user["username"]}).sort("timestamp", -1).limit(5).to_list(5)
    for l in logs: l["_id"] = str(l["_id"])
    return logs      

@api_router.get("/notifications/sent-history")
async def get_sent_history(user: dict = Depends(get_current_user)):
    """Admin route to see all sent broadcasts and their read counts."""
    if user["role"] != "admin":
        raise HTTPException(status_code=403)
    
    # Fetch all, sorted by most recent
    notifications = await db.notifications.find().sort("date", -1).to_list(100)
    for n in notifications:
        n["_id"] = str(n["_id"])
        # Ensure read_by exists so frontend doesn't crash
        if "read_by" not in n: n["read_by"] = []
        
    return notifications

@api_router.post("/notifications/read/{notif_id}")
async def mark_notification_read(notif_id: str, user: dict = Depends(get_current_user)):
    try:
        result = await db.notifications.update_one(
            {"_id": ObjectId(notif_id)},
            {"$addToSet": {"read_by": user["enrollment_number"]}}
        )

        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Notification not found")

        return {"message": "Notification acknowledged successfully"}
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid notification ID")

# @api_router.post("/auth/admin-login-init")
# async def admin_login_init(data: dict = Body(...)):
#     # 1. See what the frontend is sending
#     print(f"--- DEBUG LOGIN START ---")
#     print(f"Typed Username: {data['username']}")
    
#     user = await db.users.find_one({
#         "role": "admin",
#         "$or": [
#             {"college_email": data["username"]}, 
#             {"enrollment_number": data["username"]}, 
#             {"username": data["username"]}
#         ]
#     })
    
#     # 2. Check if the user was even found
#     if not user:
#         print(f"RESULT: No Admin user found with that ID.")
#         print(f"--- DEBUG LOGIN END ---")
#         raise HTTPException(401, "Invalid credentials - User not found")

#     # 3. Check if the password matches the hash
#     is_valid = verify_password(data["password"], user["password"])
#     print(f"User Found: {user.get('username')}")
#     print(f"Password Match: {is_valid}")
    
#     if not is_valid:
#         print(f"--- DEBUG LOGIN END ---")
#         raise HTTPException(401, "Invalid credentials - Password Mismatch")

#     # 4. Generate OTP
#     otp = str(random.randint(100000, 999999))
#     expiry = datetime.now(timezone.utc) + timedelta(minutes=5)
    
#     await db.users.update_one(
#         {"_id": user["_id"]},
#         {"$set": {"2fa_code": otp, "2fa_expiry": expiry}}
#     )

#     email = user.get("college_email") or user.get("personal_email")
#     print(f"Sending OTP to: {email}")
#     print(f"--- DEBUG LOGIN END ---")

#     html = f"<h2>Your Code: {otp}</h2>"
#     await send_email(email, "Security Code", html)
#     return {"message": "Verification code dispatched"}

# # --- NEW: 2FA WARDEN VERIFY ---
# @api_router.post("/auth/admin-login-verify")
# async def admin_login_verify(data: dict = Body(...)):
#     user = await db.users.find_one({
#         "2fa_code": data["otp"],
#         "$or": [{"college_email": data["username"]}, {"enrollment_number": data["username"]}, {"username": data["username"]}]
#     })
    
#     if not user or datetime.now(timezone.utc) > user.get("2fa_expiry", datetime.now(timezone.utc)):
#         raise HTTPException(400, "Invalid or expired code")

#     await db.users.update_one({"_id": user["_id"]}, {"$unset": {"2fa_code": "", "2fa_expiry": ""}})
    
#     token = create_access_token({"sub": user.get("enrollment_number") or user.get("username"), "role": "admin"})
#     return {"access_token": token, "token_type": "bearer"   }  
    
# @api_router.post("/auth/admin-login-init")
# async def admin_login_init(data: AdminLoginInitModel):
#     # Flexible Search: Finds Warden by Username, Email, or Enrollment
#     user = await db.users.find_one({
#         "role": "admin",
#         "$or": [
#             {"username": data.username.strip()},
#             {"college_email": data.username.strip()},
#             {"enrollment_number": data.username.strip()}
#         ]
#     })
    
#     if not user or not verify_password(data.password, user["password"]):
#         raise HTTPException(status_code=401, detail="Invalid Warden Credentials")

#     otp = str(random.randint(100000, 999999))
#     expiry = datetime.now(timezone.utc) + timedelta(minutes=5)
#     await db.users.update_one({"_id": user["_id"]}, {"$set": {"2fa_code": otp, "2fa_expiry": expiry}})

#     email = user.get("college_email") or user.get("personal_email")
#     html = f"<div style='font-family: sans-serif; padding: 20px;'><h2>Warden Access Code</h2><h1>{otp}</h1></div>"
#     await send_email(email, "HOSTELEASE Security Code", html)
    
#     return {"message": "Verification code dispatched"}

@api_router.post("/auth/admin-login-init")
async def admin_login_init(data: AdminLoginInitModel):
    # STRICT SEARCH: Only matches College Email or Enrollment Number
    user = await db.users.find_one({
        "role": "admin",
        "$or": [
            {"college_email": data.username.strip()},
            {"enrollment_number": data.username.strip()}
        ]
    })
    
    if not user:
        # Prevents login if the user types 'admin' (the username)
        raise HTTPException(status_code=401, detail="Invalid: Use College Email or Enrollment Number")

    if not verify_password(data.password, user["password"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    otp = str(random.randint(100000, 999999))
    expiry = datetime.now(timezone.utc) + timedelta(minutes=5)
    
    await db.users.update_one({"_id": user["_id"]}, {"$set": {"2fa_code": otp, "2fa_expiry": expiry}})

    return {
        "message": "Verification code dispatched",
        "dev_otp": otp 
    }

@api_router.post("/auth/admin-login-verify")
async def admin_login_verify(data: AdminVerifyModel):
    # Flexible search for verification step
    user = await db.users.find_one({
        "2fa_code": data.otp,
        "$or": [
            {"username": data.username.strip()},
            {"college_email": data.username.strip()},
            {"enrollment_number": data.username.strip()}
        ]
    })
    
    if not user or datetime.now(timezone.utc) > user.get("2fa_expiry", datetime.now(timezone.utc)):
        raise HTTPException(400, "Invalid or expired code")

    await db.users.update_one({"_id": user["_id"]}, {"$unset": {"2fa_code": "", "2fa_expiry": ""}})
    
    # Store login log for Admin Timeline View
    await db.login_logs.insert_one({
        "username": user.get("username"),
        "role": "admin",
        "time": datetime.now(timezone.utc).strftime("%B %d, %Y - %I:%M %p"),
        "timestamp": datetime.now(timezone.utc),
        "ip": "192.168.1.1", # Mock IP for now, can be extracted from Request
        "browser": "Chrome / Windows 11",
        "status": "Authorized"
    })
    
    # Check if they are still using the default hostel@123 password logic (hashed)
    # We will flag it if 'is_first_login' is true or if they haven't explicitly changed it.
    is_default = user.get("is_first_login", False)

    token = create_access_token({"sub": user.get("enrollment_number") or user.get("username"), "role": "admin"})
    return {
        "access_token": token, 
        "token_type": "bearer",
        "is_default_password": is_default
    }

# --- NEW: CHECK FOR VOTER REWARD BADGE ---
@api_router.get("/user/voter-status")
async def get_voter_status(user: dict = Depends(get_current_user)):
    has_voted = await db.votes.find_one({
        "student_id": user["enrollment_number"]
    })
    
    return {
        "earned_badge": True if has_voted else False,
        "badge_name": "Responsible Resident",
        "message": "Thank you for deciding this Sunday's menu!" if has_voted else "Vote on Wednesday to earn your badge!"
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

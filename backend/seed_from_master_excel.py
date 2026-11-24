"""
Seed HOSTELEASE MongoDB from the master Excel workbook generated for the project.
"""

import asyncio
import os
from pathlib import Path
from datetime import datetime, timezone
from collections import defaultdict

import openpyxl
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
from passlib.context import CryptContext

ROOT_DIR = Path(__file__).parent
EXCEL_DIR = ROOT_DIR / "excel"
MASTER_FILE = EXCEL_DIR / "HOSTELEASE_6_Hostel_Master_Database.xlsx"

load_dotenv(ROOT_DIR / ".env")
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

MALE_HOSTELS = {"Azad Bhawan", "Atal Bhawan", "Tagore Bhawan"}
FEMALE_HOSTELS = {"Shakuntala Bhawan", "Janaki Bhawan", "Teresa Bhawan"}


def norm_hostel(name: str) -> str:
    val = str(name or "").strip()
    aliases = {
        "Shakunthala Bhawan": "Shakuntala Bhawan",
        "shakunthala bhawan": "Shakuntala Bhawan",
        "shakuntala bhawan": "Shakuntala Bhawan",
    }
    return aliases.get(val, val)


def norm_block(block: str) -> str:
    return str(block or "").strip().upper()


def to_str(v):
    if v is None:
        return ""
    return str(v).strip()


def load_sheet_rows(ws):
    rows = list(ws.iter_rows(values_only=True))
    headers = [to_str(x) for x in rows[0]]
    data = []
    for row in rows[1:]:
        if not any(cell is not None and str(cell).strip() != "" for cell in row):
            continue
        item = {}
        for idx, header in enumerate(headers):
            if header:
                item[header] = row[idx] if idx < len(row) else None
        data.append(item)
    return data


async def seed_from_master():
    mongo_url = os.getenv("MONGO_URL")
    db_name = os.getenv("DB_NAME")

    if not mongo_url or not db_name:
        raise RuntimeError("MONGO_URL or DB_NAME missing in backend/.env")

    if not MASTER_FILE.exists():
        raise FileNotFoundError(
            f"Master workbook not found: {MASTER_FILE}\n"
            f"Place HOSTELEASE_6_Hostel_Master_Database.xlsx inside backend/excel/"
        )

    print("Using MongoDB:", mongo_url)
    print("Using database:", db_name)
    print("Using workbook:", MASTER_FILE)

    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]

    wb = openpyxl.load_workbook(MASTER_FILE, data_only=True)

    if "Students_Master" not in wb.sheetnames or "Rooms_Master" not in wb.sheetnames:
        raise RuntimeError("Workbook must contain Students_Master and Rooms_Master sheets")

    student_rows = load_sheet_rows(wb["Students_Master"])
    room_rows = load_sheet_rows(wb["Rooms_Master"])

    print("Workbook student rows:", len(student_rows))
    print("Workbook room rows:", len(room_rows))

    print("Deleting old student and room data...")
    await db.users.delete_many({"role": "student"})
    await db.rooms.delete_many({})

    print("Preparing room documents...")
    rooms_to_insert = []
    for row in room_rows:
        hostel_name = norm_hostel(row.get("Hostel_Name"))
        block = norm_block(row.get("Block"))
        floor = to_str(row.get("Floor"))
        room_no = to_str(row.get("Room_No"))
        room_type = to_str(row.get("Room_Type")) or "Non-AC"
        capacity = int(row.get("Capacity") or 0)
        occupied_count = int(row.get("Occupied_Count") or 0)

        rooms_to_insert.append({
            "number": room_no,
            "room_number": room_no,
            "floor": floor,
            "block": block,
            "hostel_name": hostel_name,
            "capacity": capacity,
            "room_type": room_type,
            "status": "occupied" if occupied_count >= capacity and capacity > 0 else ("partial" if occupied_count > 0 else "available"),
            "is_available": occupied_count < capacity,
            "occupied_count": occupied_count,
            "occupied_by": None,
            "is_under_maintenance": False,
            "created_at": datetime.now(timezone.utc).isoformat()
        })

    if rooms_to_insert:
        await db.rooms.insert_many(rooms_to_insert)

    print("Inserted rooms:", len(rooms_to_insert))

    print("Hashing default password once...")
    default_password_hash = pwd_context.hash("hostel@123")

    print("Preparing student documents...")
    students_to_insert = []
    room_bed_usage = defaultdict(set)

    for idx, row in enumerate(student_rows, start=1):
        enrollment = to_str(row.get("Student_ID"))
        student_name = to_str(row.get("Student_Name"))
        gender = to_str(row.get("Gender"))
        hostel_name = norm_hostel(row.get("Hostel_Name"))
        floor = to_str(row.get("Floor"))
        room_no = to_str(row.get("Room_No"))
        course = to_str(row.get("Course")) or "B.Tech"
        year = int(row.get("Year") or 1)
        student_phone = to_str(row.get("Student_Phone"))
        parent_phone = to_str(row.get("Parent_Phone"))
        email = to_str(row.get("Email"))
        block = norm_block(row.get("Block"))
        bed_no = to_str(row.get("Bed_No"))
        room_type = to_str(row.get("Room_Type")) or "Non-AC"

        if not enrollment or not student_name:
            continue

        if not gender:
            gender = "Female" if hostel_name in FEMALE_HOSTELS else "Male"

        if not bed_no:
            key = (hostel_name, block, floor, room_no)
            for candidate in ["A", "B", "C", "D"]:
                if candidate not in room_bed_usage[key]:
                    bed_no = candidate
                    room_bed_usage[key].add(candidate)
                    break
        else:
            room_bed_usage[(hostel_name, block, floor, room_no)].add(bed_no)

        username_base = "".join(student_name.lower().split())
        username = f"{username_base}{enrollment[-3:]}" if len(enrollment) >= 3 else username_base

        # Default password is DOB (generate random if not in excel)
        dob = to_str(row.get("DOB"))
        if not dob:
            import random
            dob = f"{random.randint(1,28):02d}-{random.randint(1,12):02d}-{random.randint(2000, 2005)}"
        student_password_hash = pwd_context.hash(dob)

        students_to_insert.append({
            "username": username,
            "college_email": f"{enrollment}@hostel.com",
            "personal_email": email or f"{username}@gmail.com",
            "enrollment_number": enrollment,
            "password": student_password_hash,
            "dob": dob,
            "role": "student",
            "student_name": student_name,
            "phone": f"+91{student_phone}" if student_phone and not str(student_phone).startswith("+91") else student_phone,
            "parent_phone": f"+91{parent_phone}" if parent_phone and not str(parent_phone).startswith("+91") else parent_phone,
            "father_name": f"Mr. {student_name}",
            "mother_name": f"Mrs. {student_name}",
            "father_contact": f"+91{parent_phone}" if parent_phone and not str(parent_phone).startswith("+91") else parent_phone,
            "mother_contact": f"+91{parent_phone}" if parent_phone and not str(parent_phone).startswith("+91") else parent_phone,
            "hostel_name": hostel_name,
            "block": block,
            "floor": floor,
            "room_number": room_no,
            "bed_number": bed_no,
            "course": course,
            "year": year,
            "gender": gender,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "is_first_login": True,
            "is_default_password": True,
            "two_factor_enabled": False,
            "two_factor_secret": None,
            "email_otp": None,
            "email_otp_expiry": None,
            "washroom_preference": "Attached" if room_type == "AC" else "Common",
            "preferred_floor": floor
        })

        if idx % 500 == 0:
            print(f"Prepared {idx} student rows...")

    print("Total student docs prepared:", len(students_to_insert))

    if students_to_insert:
        batch = 500
        for i in range(0, len(students_to_insert), batch):
            await db.users.insert_many(students_to_insert[i:i + batch])
            print(f"Inserted student batch {(i // batch) + 1}")

    print("Syncing room occupancy...")
    room_counts = defaultdict(int)
    for s in students_to_insert:
        key = (s["hostel_name"], s["block"], s["floor"], s["room_number"])
        room_counts[key] += 1

    for idx, ((hostel_name, block, floor, room_no), count) in enumerate(room_counts.items(), start=1):
        room_doc = await db.rooms.find_one({
            "hostel_name": hostel_name,
            "block": block,
            "floor": floor,
            "number": room_no
        })
        if room_doc:
            capacity = int(room_doc.get("capacity") or 0)
            status = "occupied" if count >= capacity and capacity > 0 else ("partial" if count > 0 else "available")
            await db.rooms.update_one(
                {"_id": room_doc["_id"]},
                {"$set": {
                    "occupied_count": count,
                    "is_available": count < capacity if capacity > 0 else True,
                    "status": status
                }}
            )
        if idx % 250 == 0:
            print(f"Synced {idx} rooms...")

    room_total = await db.rooms.count_documents({})
    student_total = await db.users.count_documents({"role": "student"})
    admin_total = await db.users.count_documents({"role": "admin"})

    print("Done.")
    print("Rooms in MongoDB:", room_total)
    print("Students in MongoDB:", student_total)
    print("Admins in MongoDB:", admin_total)

    client.close()


if __name__ == "__main__":
    asyncio.run(seed_from_master())
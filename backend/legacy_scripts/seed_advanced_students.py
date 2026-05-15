import asyncio
import os
import random
from datetime import datetime, timezone
from typing import Any
from motor.motor_asyncio import AsyncIOMotorClient
from passlib.context import CryptContext
from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

first_names = ["Aarav", "Vivaan", "Aditya", "Vihaan", "Arjun", "Sai", "Agastya", "Krishna", "Ishaan", "Shaurya", "Atharv", "Dhruv", "Kabir", "Rishi", "Aryan", "Diya", "Isha", "Riya", "Aanya", "Aarohi", "Saanvi", "Aditi", "Kavya", "Kyra", "Anika", "Pari", "Navya", "Niyati", "Rohan", "Vikram", "Sneha", "Ajay", "Neha", "Rahul", "Priya", "Amit", "Kiran", "Sanjay", "Pooja"]
last_names = ["Sharma", "Verma", "Gupta", "Malhotra", "Singh", "Patel", "Reddy", "Rao", "Das", "Jain", "Bose", "Nair", "Iyer", "Kumar", "Yadav", "Rajput", "Kapoor", "Chopra", "Chauhan", "Mehta"]

MALE_HOSTELS = ["Azad Bhawan", "Atal Bhawan", "Tagore Bhawan"]
FEMALE_HOSTELS = ["Shakuntala Bhawan", "Janaki Bhawan", "Teresa Bhawan"]

async def run_advanced_seed():
    mongo_url = os.getenv("MONGO_URL")
    db_name = os.getenv("DB_NAME")

    print("MONGO_URL:", mongo_url)
    print("DB_NAME:", db_name)

    if not mongo_url or not db_name:
        raise ValueError("MONGO_URL or DB_NAME missing in .env")

    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]

    print("Clearing existing student users and rooms...")
    await db.users.delete_many({"role": "student"})
    await db.rooms.delete_many({})

    hostels = MALE_HOSTELS + FEMALE_HOSTELS
    blocks = ["A", "B", "C"]

    rooms_data: list[dict[str, Any]] = []

    print("Building 1080 rooms...")
    for hostel in hostels:
        for block in blocks:
            for floor in range(1, 4):
                for room_num in range(1, 21):
                    capacity = random.choice([3, 4])
                    room_type = "AC" if random.random() < 0.3 else "Non-AC"
                    number = f"{floor}{room_num:02d}"

                    rooms_data.append({
                        "number": number,
                        "room_number": number,
                        "floor": str(floor),
                        "block": block,
                        "hostel_name": hostel,
                        "capacity": capacity,
                        "room_type": room_type,
                        "status": "available",
                        "is_available": True,
                        "occupied_count": 0,
                        "occupied_by": None,
                        "is_under_maintenance": False,
                        "created_at": datetime.now(timezone.utc).isoformat()
                    })

    if rooms_data:
        await db.rooms.insert_many(rooms_data)

    room_count = await db.rooms.count_documents({})
    print(f"Rooms inserted: {room_count}")

    print("Generating students...")
    students_data: list[dict[str, Any]] = []

    used_enrollments = set()
    used_student_phones = set()
    used_parent_phones = set()

    for room in rooms_data:
        capacity = int(room["capacity"])
        occupancy_target = random.choice([
            capacity,
            capacity,
            capacity - 1,
            capacity - 1,
            max(1, capacity - 2)
        ])

        bed_letters = ["A", "B", "C", "D"][:capacity]

        for i in range(occupancy_target):
            while True:
                fn = random.choice(first_names)
                ln = random.choice(last_names)

                enrollment = str(random.randint(2021000000, 2024999999))
                s_phone = f"+91{random.randint(9000000000, 9999999999)}"
                p_phone = f"+91{random.randint(8000000000, 8999999999)}"

                if (
                    enrollment not in used_enrollments
                    and s_phone not in used_student_phones
                    and p_phone not in used_parent_phones
                ):
                    used_enrollments.add(enrollment)
                    used_student_phones.add(s_phone)
                    used_parent_phones.add(p_phone)
                    break

            student_name = f"{fn} {ln}"
            bed = bed_letters[i]

            hostel_name = room["hostel_name"]
            gender = "Female" if hostel_name in FEMALE_HOSTELS else "Male"

            student = {
                "username": student_name.lower().replace(" ", "") + str(random.randint(10, 99)),
                "college_email": f"{enrollment}@hostel.com",
                "personal_email": f"{fn.lower()}.{ln.lower()}{random.randint(1,999)}@gmail.com",
                "enrollment_number": enrollment,
                "password": pwd_context.hash("hostel@123"),
                "role": "student",
                "student_name": student_name,
                "phone": s_phone,
                "parent_phone": p_phone,
                "father_name": f"Mr. {fn} {ln}",
                "mother_name": f"Mrs. {fn} {ln}",
                "father_contact": p_phone,
                "mother_contact": f"+91{random.randint(8000000000, 8999999999)}",
                "hostel_name": hostel_name,
                "block": room["block"],
                "floor": str(room["floor"]),
                "room_number": room["number"],
                "bed_number": bed,
                "course": random.choice(["B.Tech CSE", "B.Tech ECE", "B.Tech ME", "BCA", "MCA"]),
                "year": random.choice([1, 2, 3, 4]),
                "gender": gender,
                "created_at": datetime.now(timezone.utc).isoformat(),
                "is_first_login": True,
                "is_default_password": True,
                "two_factor_enabled": False,
                "two_factor_secret": None,
                "email_otp": None,
                "email_otp_expiry": None,
                "washroom_preference": "Common" if room["room_type"] == "Non-AC" else "Attached"
            }
            students_data.append(student)

    print("Total students prepared:", len(students_data))

    batch_size = 500
    for i in range(0, len(students_data), batch_size):
        await db.users.insert_many(students_data[i:i + batch_size])
        print(f"Inserted batch {i // batch_size + 1}")

    student_count = await db.users.count_documents({"role": "student"})
    admin_count = await db.users.count_documents({"role": "admin"})

    print("Final student count:", student_count)
    print("Final admin count:", admin_count)
    print("Advanced seeding completed successfully.")

    client.close()

if __name__ == "__main__":
    asyncio.run(run_advanced_seed())
import asyncio, os
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from passlib.context import CryptContext
from datetime import datetime, timezone

load_dotenv()
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

async def seed_minimal():
    client = AsyncIOMotorClient(os.getenv("MONGO_URL"))
    db = client[os.getenv("DB_NAME")]
    
    # Clean previous if needed or just insert
    await db.users.delete_many({"username": {"$in": ["teststudent", "testadmin"]}})
    await db.rooms.delete_many({"hostel_name": "Test Hostel"})
    
    # 1 Room
    await db.rooms.insert_one({
        "number": "T101",
        "floor": "1",
        "block": "A",
        "hostel_name": "Test Hostel",
        "capacity": 2,
        "room_type": "AC",
        "status": "available",
        "is_under_maintenance": False
    })
    
    # 1 Bed Avail entry
    await db.hostel_beds.delete_many({"hostel_name": "Test Hostel"})
    await db.hostel_beds.insert_one({
        "hostel_name": "Test Hostel",
        "block": "A",
        "floor": "1",
        "total_beds": 2,
        "occupied_beds": 0,
        "gender": "Male"
    })
    
    # 1 Student
    await db.users.insert_one({
        "username": "teststudent",
        "password": pwd_context.hash("testpassword"),
        "role": "student",
        "student_name": "Test Student",
        "enrollment_number": "TS1000",
        "hostel_name": "Azad Bhawan", # current pseudo-hostel
        "room_number": "101",
        "is_first_login": False # Skip initial force reset
    })
    
    # 1 Admin
    await db.users.insert_one({
        "username": "testadmin",
        "password": pwd_context.hash("testpassword"),
        "role": "admin",
        "name": "Test Admin",
        "is_first_login": False,
        "is_default_password": False # Skip force reset overlay
    })
    
    print("Minimal seed finished. teststudent/testpassword | testadmin/testpassword")
    client.close()

if __name__ == "__main__":
    asyncio.run(seed_minimal())

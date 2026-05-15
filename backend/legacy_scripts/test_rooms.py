import asyncio
import os
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv()

async def check():
    client = AsyncIOMotorClient(os.getenv("MONGO_URL"))
    db = client[os.getenv("DB_NAME")]
    
    users = await db.users.count_documents({"role": "student"})
    rooms = await db.rooms.count_documents({})
    
    print(f"Students: {users}")
    print(f"Rooms: {rooms}")
    
    sample_users = await db.users.find({"role": "student"}).limit(2).to_list(None)
    for u in sample_users:
        print(f"User -> {u.get('student_name')} | {u.get('hostel_name')} | {u.get('block')} | {u.get('floor')} | {u.get('room_number')}")
        
    sample_rooms = await db.rooms.find().limit(2).to_list(None)
    for r in sample_rooms:
        print(f"Room -> {r}")
        
    client.close()

if __name__ == "__main__":
    asyncio.run(check())

import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import os
from dotenv import load_dotenv
import json

load_dotenv()

async def test_live_map():
    client = AsyncIOMotorClient(os.getenv("MONGO_URL"))
    db = client[os.getenv("DB_NAME")]

    print("Fetching live rooms...")
    rooms = await db.rooms.find({}).to_list(length=3000)
    students = await db.users.find({"role": "student"}).to_list(length=3000)

    occupancy = {}
    for s in students:
        h = s.get("hostel_name", "")
        b = s.get("block", "")
        f = str(s.get("floor", ""))
        r = str(s.get("room_number", ""))
        if h and r:
            occupancy[f"{h}-{b}-{f}-{r}"] = s

    occupied_count = 0
    for rm in rooms:
        h = rm.get("hostel_name", "")
        b = rm.get("block", "")
        f = str(rm.get("floor", ""))
        r = str(rm.get("number", ""))
        
        key = f"{h}-{b}-{f}-{r}"
        if key in occupancy:
            occupied_count += 1

    print(f"Total Rooms: {len(rooms)}")
    print(f"Total Students: {len(students)}")
    print(f"Occupied Rooms from script logic: {occupied_count}")
    
    # Let's test the lookup logic for a single occupied room
    for key, student in occupancy.items():
        print(f"\nExample Lookup for Room {student.get('room_number')} in {student.get('hostel_name')} Block {student.get('block')}:")
        lookup = await db.users.find_one({
            "role": "student",
            "room_number": student["room_number"],
            "hostel_name": student["hostel_name"],
            "block": student["block"],
            "floor": str(student["floor"])
        })
        print(f"Found: {lookup['student_name']} (Phone: {lookup.get('phone', 'N/A')})")
        break

    client.close()

if __name__ == "__main__":
    asyncio.run(test_live_map())

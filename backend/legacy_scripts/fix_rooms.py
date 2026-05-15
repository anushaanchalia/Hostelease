import asyncio
import os
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv()

async def fix_rooms():
    client = AsyncIOMotorClient(os.getenv("MONGO_URL"))
    db = client[os.getenv("DB_NAME")]
    
    print("Clearing old rooms...")
    await db.rooms.delete_many({})
    
    hostels = [
        "Azad Bhawan", "Atal Bhawan", "Tagore Bhawan", 
        "Shakuntala Bhawan", "Janaki Bhawan", "Teresa Bhawan"
    ]
    blocks = ["A", "B", "C"]
    
    rooms_data = []
    for hostel in hostels:
        for block in blocks:
            for floor in range(1, 4):
                for room_num in range(1, 21):
                    # Format e.g. 101, 102
                    number = f"{floor}{room_num:02d}"
                    rooms_data.append({
                        "number": number,
                        "floor": str(floor),
                        "block": block,
                        "hostel_name": hostel,
                        "status": "available",
                        "is_under_maintenance": False
                    })
    
    print(f"Inserting {len(rooms_data)} rooms...")
    if rooms_data:
        await db.rooms.insert_many(rooms_data)
        
    print("Done generating rooms with blocks.")
    client.close()

if __name__ == "__main__":
    asyncio.run(fix_rooms())

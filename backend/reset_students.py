import asyncio
import os
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv()

async def reset_db():
    client = AsyncIOMotorClient(os.getenv("MONGO_URL"))
    db = client[os.getenv("DB_NAME")]

    print("Deleting all seeded students...")
    result = await db.users.delete_many({"role": "student"})
    print(f"Deleted {result.deleted_count} student records.")
    
    print("Resetting all room occupancies...")
    await db.rooms.update_many({}, {"$set": {"status": "available", "occupants": []}})
    print("Rooms reset.")
    
    # We don't delete the admins or wardens.
    print("\nDatabase is now clean of test students.")
    print("You can now go to your Admin Dashboard -> Hostel Structure & Data -> Import Data")
    print("And upload your original Excel files located in the backend/excel folder.")

if __name__ == "__main__":
    asyncio.run(reset_db())

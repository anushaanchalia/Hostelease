import asyncio
from motor.motor_asyncio import AsyncIOMotorClient

async def main():
    db = AsyncIOMotorClient('mongodb://localhost:27017')['hosteldb']
    user = await db.users.find_one({"enrollment_number": "TS1000"})
    print("User TS1000:", user)
    
    docs = await db.payments.find({"type": "fine"}).to_list(10)
    print("Fines:", docs)

asyncio.run(main())

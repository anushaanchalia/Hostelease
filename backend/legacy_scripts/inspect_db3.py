import asyncio
from motor.motor_asyncio import AsyncIOMotorClient

async def main():
    db = AsyncIOMotorClient('mongodb://localhost:27017')['hosteldb']
    users = await db.users.find().to_list(20)
    for u in users:
        print(f"Role: {u.get('role')}, Username: {u.get('username')}, Enrollment: {u.get('enrollment_number')}")

asyncio.run(main())

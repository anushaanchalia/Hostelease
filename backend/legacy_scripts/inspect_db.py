import asyncio
from motor.motor_asyncio import AsyncIOMotorClient

async def main():
    db = AsyncIOMotorClient('mongodb://localhost:27017')['hosteldb']
    docs = await db.payments.find({'type': 'fine'}).to_list(10)
    for d in docs:
        print(d)

asyncio.run(main())

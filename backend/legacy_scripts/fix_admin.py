import asyncio, os
from motor.motor_asyncio import AsyncIOMotorClient
from passlib.context import CryptContext
from dotenv import load_dotenv

load_dotenv()
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

async def fix_admin():
    client = AsyncIOMotorClient(os.getenv("MONGO_URL"))
    db = client[os.getenv("DB_NAME")]
    
    # Update admin to have an enrollment_number so token gen works
    await db.users.update_one(
        {"username": "testadmin"},
        {"$set": {"enrollment_number": "ADMIN1000"}}
    )
    
    print("Fixed testadmin. Use TS1000 for student and ADMIN1000 for admin.")
    client.close()

if __name__ == "__main__":
    asyncio.run(fix_admin())

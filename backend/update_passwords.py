
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import os
import random
from pathlib import Path
from passlib.context import CryptContext
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent / ".env")

mongo_url = os.getenv("MONGO_URL")
db_name = os.getenv("DB_NAME")

if not mongo_url or not db_name:
    raise ValueError("MONGO_URL or DB_NAME is missing from backend/.env")

client = AsyncIOMotorClient(mongo_url)
db = client[db_name]


pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

async def update_users():
    users = await db.users.find({}).to_list(None)
    for user in users:
        # Generate DOB if missing
        dob = user.get("dob")
        if not dob:
            dob = f"{random.randint(1,28):02d}-{random.randint(1,12):02d}-{random.randint(2000, 2005)}"
            
        hashed_pw = pwd_context.hash(dob)
        
        await db.users.update_one(
            {"_id": user["_id"]}, 
            {"$set": {
                "dob": dob,
                "password": hashed_pw,
                "is_first_login": True,
                "is_default_password": True
            }}
        )
    print("Database updated successfully")

if __name__ == "__main__":
    asyncio.run(update_users())

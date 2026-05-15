import asyncio, os
from motor.motor_asyncio import AsyncIOMotorClient
from passlib.context import CryptContext
from dotenv import load_dotenv

load_dotenv()
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

async def test_login(username, password):
    client = AsyncIOMotorClient(os.getenv("MONGO_URL"))
    db = client[os.getenv("DB_NAME")]
    
    user = await db.users.find_one({
        "$or": [
            {"username": username},
            {"college_email": username},
            {"personal_email": username}
        ]
    })
    
    if not user:
        print(f"User {username} not found")
        return
        
    print(f"Found {username}: {user}")
    
    match = pwd_context.verify(password, user.get("password", ""))
    print(f"Password match: {match}")
    
    try:
        # simulate token generation
        sub = user.get("enrollment_number") or user.get("username")
        print(f"Token sub would be: {sub}")
    except Exception as e:
        print(f"Error generating token: {e}")
        
    client.close()

if __name__ == "__main__":
    asyncio.run(test_login("teststudent", "testpassword"))
    asyncio.run(test_login("testadmin", "testpassword"))

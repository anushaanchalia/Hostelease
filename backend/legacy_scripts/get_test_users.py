import asyncio, os
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv()

async def get_users():
    client = AsyncIOMotorClient(os.getenv('MONGO_URL'))
    db = client[os.getenv('DB_NAME')]
    
    u = await db.users.find({'role': 'student'}).to_list(1)
    a = await db.users.find({'role': 'admin'}).to_list(1)
    
    if u:
        print(f"Student: {u[0]['username']} | Pass: hostel@123")
    else:
        print("No student found")
        
    if a:
        print(f"Admin: {a[0]['username']} | Pass details in db (default was hostel@123 or admin)")
    else:
        print("No admin found")
        
    client.close()

if __name__ == '__main__':
    asyncio.run(get_users())

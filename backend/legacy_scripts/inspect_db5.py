import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from bson.objectid import ObjectId

async def main():
    db = AsyncIOMotorClient('mongodb://localhost:27017')['hostelease']
    
    fine_id = "69b9e93ff9e28e2aa6f1a9a0" # from earlier output
    
    # Check if the document exists regardless of student_id
    doc = await db.payments.find_one({"_id": ObjectId(fine_id)})
    print("Direct find_one output:", doc)
    
    # Try the exact update query
    res = await db.payments.update_one(
        {"_id": ObjectId(fine_id), "student_id": "teststudent"},
        {"$set": {"status": "Paid", "payment_mode": "Online Setup"}}
    )
    print("matched_count:", res.matched_count)

asyncio.run(main())

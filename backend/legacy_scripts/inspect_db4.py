import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime, timezone

async def main():
    db = AsyncIOMotorClient('mongodb://localhost:27017')['hostelease']
    
    # 1. Show student users
    users = await db.users.find({"role": "student"}).to_list(10)
    print("----- STUDENTS -----")
    for u in users:
         print(f"Username: {u.get('username')}, Enrollment: {u.get('enrollment_number')}")
         
    # 2. Show fines
    fines = await db.payments.find({"type": "fine"}).to_list(10)
    print("\n----- FINES -----")
    for f in fines:
        print(f"ID: {f.get('_id')}, StudentId: {f.get('student_id')}, Status: {f.get('status')}")

    # 3. If there's no fine for teststudent, let's create one so we can explicitly test
    user = await db.users.find_one({'username': 'teststudent'})
    if user:
        has_fine = await db.payments.find_one({"type": "fine", "student_id": "teststudent"})
        if not has_fine:
            fine_doc = {
                'student_id': 'teststudent',
                'student_enrollment': user.get('enrollment_number', 'TS1000'),
                'type': 'fine',
                'category': 'Property Damage',
                'amount': 1500,
                'reason': 'Broke the chair',
                'status': 'Pending',
                'date': datetime.now(timezone.utc).isoformat()
            }
            await db.payments.insert_one(fine_doc)
            print("Inserted fine document for teststudent.")
            
asyncio.run(main())

"""
Seed data script for HOSTELEASE using Excel data
Run this to populate the database with real student data
"""

import asyncio
import pandas as pd
from motor.motor_asyncio import AsyncIOMotorClient
from passlib.context import CryptContext
from datetime import datetime, timezone, timedelta
import os
from dotenv import load_dotenv
from pathlib import Path
import random

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Sample data for random generation
father_names = [
    "Rajesh Kumar", "Suresh Patel", "Amit Sharma", "Vijay Singh", "Ravi Gupta",
    "Manoj Verma", "Anil Agarwal", "Sanjay Reddy", "Prakash Iyer", "Deepak Jain",
    "Ramesh Rao", "Mohan Das", "Ashok Kumar", "Vinod Mishra", "Rakesh Sinha"
]

mother_names = [
    "Sunita Kumar", "Meena Patel", "Priya Sharma", "Lakshmi Singh", "Kavita Gupta",
    "Anita Verma", "Geeta Agarwal", "Savita Reddy", "Radha Iyer", "Pooja Jain",
    "Madhuri Rao", "Rekha Das", "Seema Kumar", "Nisha Mishra", "Kiran Sinha"
]

blocks = ["A", "B", "C"]
bed_letters = ["A", "B", "C", "D"]

async def seed_database():

    mongo_url = os.environ['MONGO_URL']
    client = AsyncIOMotorClient(mongo_url)
    db = client[os.environ['DB_NAME']]

    print("🌱 Seeding HOSTELEASE database from Excel...")

    collections = ['users', 'mess_menu', 'hostel_beds', 'voting_items', 'notifications']
    for coll in collections:
        await db[coll].delete_many({})

    # Admin
    admin_user = {
        "username": "admin",
        "college_email": "admin@hostel.com",
        "personal_email": "admin@hostelease.com",
        "enrollment_number": "ADMIN001",
        "password": pwd_context.hash("hostel@123"),
        "role": "admin",
        "student_name": "Administrator",
        "phone": "+911234567890",
        "parent_phone": "+911234567891",
        "father_name": "Admin Father",
        "mother_name": "Admin Mother",
        "father_contact": "+911234567891",
        "mother_contact": "+911234567892",
        "hostel_name": "Admin Block",
        "block": "A",
        "floor": "1",
        "room_number": "101",
        "bed_number": "B1",
        "course": "Administration",
        "year": 1,
        "gender": "Male",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "is_default_password": True
    }

    await db.users.insert_one(admin_user)
    print("✅ Admin user created (username: admin, password: hostel@123)")

    try:
        excel_files = list((ROOT_DIR / "excel").glob("*.xlsx"))

        all_students = []

        for file in excel_files:
            print(f"📂 Loading {file.name}")
            df = pd.read_excel(file, engine="openpyxl")

            # clean column names
            df.columns = df.columns.str.strip()
            df.columns = df.columns.str.replace(" ", "_")

            print("Columns found:", df.columns.tolist())

            all_students.append(df)

        df = pd.concat(all_students, ignore_index=True)

        print(f"📊 Found {len(df)} students in all Excel files")

        students = []

        for index, row in df.iterrows():

            enrollment_number = str(row['Student_ID'])
            student_name = row['Student_Name']

            username = student_name.lower().replace(' ', '')

            college_email = f"{enrollment_number}@hostel.com"
            personal_email = row['Email']

            father_name = random.choice(father_names)
            mother_name = random.choice(mother_names)

            student_phone = f"+91{row['Student_Phone']}"
            parent_phone = f"+91{row['Parent_Phone']}"

            father_contact = parent_phone
            mother_contact = f"+91{random.randint(9000000000,9999999999)}"

            hostel_name = row['Hostel_Name']
            floor = str(row['Floor'])
            room_number = str(row['Room_No'])

            bed_number = f"B{random.randint(1,4)}"

            block = random.choice(blocks)

            course = row['Course']
            year = int(row['Year'])

            gender = row['Gender']

            student = {
                "username": username,
                "college_email": college_email,
                "personal_email": personal_email,
                "enrollment_number": enrollment_number,
                "password": pwd_context.hash("hostel@123"),
                "role": "student",
                "student_name": student_name,
                "phone": student_phone,
                "parent_phone": parent_phone,
                "father_name": father_name,
                "mother_name": mother_name,
                "father_contact": father_contact,
                "mother_contact": mother_contact,
                "hostel_name": hostel_name,
                "block": block,
                "floor": floor,
                "room_number": room_number,
                "bed_number": bed_number,
                "course": course,
                "year": year,
                "gender": gender,
                "created_at": datetime.now(timezone.utc).isoformat(),
                "is_default_password": True,
                "washroom_preference": random.choice(["Common","Attached"]),
                "preferred_floor": floor
            }

            students.append(student)

        await db.users.insert_many(students)

        print(f"✅ Created {len(students)} student users from Excel")
        print(f"   All passwords: hostel@123")

    except Exception as e:

        print(f"❌ Error reading Excel file: {e}")
        print("   Creating sample students instead...")

        sample_students = []

        for i in range(1,6):

            student = {
                "username": f"student{i}",
                "college_email": f"2021000000{i}@hostel.com",
                "personal_email": f"student{i}@gmail.com",
                "enrollment_number": f"2021000000{i}",
                "password": pwd_context.hash("hostel@123"),
                "role": "student",
                "student_name": f"Student {i}",
                "phone": f"+919876543{i:02d}",
                "parent_phone": f"+918765432{i:02d}",
                "father_name": random.choice(father_names),
                "mother_name": random.choice(mother_names),
                "father_contact": f"+918765432{i:02d}",
                "mother_contact": f"+917654321{i:02d}",
                "hostel_name": random.choice(["Azad Bhawan","Atal Bhawan","Tagore Bhawan"]),
                "block": random.choice(blocks),
                "floor": str(random.randint(1,3)),
                "room_number": f"{i}0{i}",
                "bed_number": f"B{i}",
                "course": "B.Tech CSE",
                "year": random.randint(1,4),
                "gender": "Male" if i%2==0 else "Female",
                "created_at": datetime.now(timezone.utc).isoformat(),
                "is_default_password": True,
                "washroom_preference": "Common",
                "preferred_floor": str(random.randint(1,3))
            }

            sample_students.append(student)

        await db.users.insert_many(sample_students)
        print(f"✅ Created {len(sample_students)} sample students")

    # Mess menu
    days = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"]
    week_start = datetime.now(timezone.utc).date().isoformat()

    breakfast_items = [
        ["Poha","Tea","Banana"],
        ["Aloo Paratha","Curd","Pickle"],
        ["Upma","Coffee","Orange"],
        ["Sandwich","Milk","Apple"],
        ["Dosa","Sambar","Chutney"],
        ["Idli","Coconut Chutney","Tea"],
        ["Bread Toast","Butter","Jam","Milk"]
    ]

    lunch_items = [
        ["Rice","Dal","Roti","Mixed Veg","Salad"],
        ["Rice","Rajma","Roti","Aloo Gobi","Curd"],
        ["Rice","Sambar","Chapati","Paneer Curry","Papad"],
        ["Rice","Kadhi","Roti","Bhindi Masala","Pickle"],
        ["Biryani","Raita","Salad"],
        ["Rice","Chole","Puri","Mixed Veg","Sweet"],
        ["Rice","Dal Fry","Roti","Veg Korma","Curd"]
    ]

    dinner_items = [
        ["Rice","Dal","Roti","Palak Paneer","Salad"],
        ["Rice","Rajma","Roti","Aloo Matar","Curd"],
        ["Fried Rice","Manchurian","Soup"],
        ["Rice","Dal","Roti","Mix Veg","Pickle"],
        ["Rice","Kadhi","Roti","Soybean Curry","Papad"],
        ["Rice","Sambar","Dosa","Chutney"],
        ["Rice","Dal","Roti","Veg Biryani","Raita"]
    ]

    for i,day in enumerate(days):
        menu={
            "day":day,
            "breakfast":breakfast_items[i],
            "lunch":lunch_items[i],
            "dinner":dinner_items[i],
            "week_start_date":week_start
        }
        await db.mess_menu.insert_one(menu)

    print("✅ Created weekly mess menu")

    # ADD THIS TO YOUR SEED SCRIPT TO POPULATE THE ROOMS COLLECTION
    rooms_data = []
    for hostel in ["Azad Bhawan", "Atal Bhawan", "Tagore Bhawan"]:
        for floor in range(1, 4):
            for room_num in range(1, 21): # Create 20 rooms per floor
                number = f"{floor}{room_num:02d}"
                rooms_data.append({
                    "number": number,
                    "floor": floor,
                    "hostel_name": hostel,
                    "status": "available", # Will be calculated by your API logic
                    "is_under_maintenance": False
                })
    await db.rooms.delete_many({}) # Clear old rooms
    await db.rooms.insert_many(rooms_data)
    print(f"✅ Created {len(rooms_data)} individual room records for the Live Map")

    # Beds
    hostels=["Azad Bhawan","Atal Bhawan","Tagore Bhawan","Shakuntala Bhawan","Janaki Bhawan","Teresa Bhawan"]
    bed_data=[]

    for hostel in hostels:
        for block in ["A","B","C"]:
            for floor in ["1","2","3"]:
                bed_data.append({
                    "hostel_name":hostel,
                    "block":block,
                    "floor":floor,
                    "gender":"Male" if hostel in ["Azad Bhwan","Atal Bhawan","Tagore Bhawan"] else "Female",
                    "total_beds":40,
                    "occupied_beds":35+(int(floor)*2)
                })

    await db.hostel_beds.insert_many(bed_data)
    print(f"✅ Created {len(bed_data)} hostel bed availability records")

    # Voting
    food_items=[
        {"item_name":"Pizza","vote_count":45,"status":"active","created_at":datetime.now(timezone.utc).isoformat()},
        {"item_name":"Pasta","vote_count":38,"status":"active","created_at":datetime.now(timezone.utc).isoformat()},
        {"item_name":"Burger","vote_count":42,"status":"active","created_at":datetime.now(timezone.utc).isoformat()},
        {"item_name":"Momos","vote_count":55,"status":"active","created_at":datetime.now(timezone.utc).isoformat()}
    ]

    await db.voting_items.insert_many(food_items)
    print("✅ Created sample voting items")

    notifications=[
        {"type":"holiday","message":"College Holiday on 26th January - Republic Day","target_users":"all","date":datetime.now(timezone.utc).isoformat(),"created_by":"admin"},
        {"type":"fee_reminder","message":"Hostel fee payment due by 5th of this month","target_users":"all","date":datetime.now(timezone.utc).isoformat(),"created_by":"admin"}
    ]

    await db.notifications.insert_many(notifications)
    print("✅ Created sample notifications")

    print("🎉 Database seeding completed successfully!")

    client.close()


if __name__=="__main__":
    asyncio.run(seed_database())
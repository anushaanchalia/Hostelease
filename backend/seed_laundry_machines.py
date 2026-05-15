import asyncio
import os
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv('backend/.env')

LAUNDRY_ALLOWED_HOSTELS = [
    "Azad Bhawan",
    "Atal Bhawan",
    "Tagore Bhawan",
    "Shakuntala Bhawan",
    "Janaki Bhawan",
    "Teresa Bhawan"
]
LAUNDRY_ALLOWED_BLOCKS = ["A", "B", "C"]


def normalize_hostel_name(name: str = "") -> str:
    cleaned = str(name or "").strip()
    key = cleaned.lower().replace("  ", " ").strip()
    aliases = {
        "azad": "Azad Bhawan",
        "azad bhawan": "Azad Bhawan",
        "atal": "Atal Bhawan",
        "atal bhawan": "Atal Bhawan",
        "tagore": "Tagore Bhawan",
        "tagore bhawan": "Tagore Bhawan",
        "shakuntala": "Shakuntala Bhawan",
        "shakuntala bhawan": "Shakuntala Bhawan",
        "shakunthala": "Shakuntala Bhawan",
        "shakunthala bhawan": "Shakuntala Bhawan",
        "janaki": "Janaki Bhawan",
        "janaki bhawan": "Janaki Bhawan",
        "teresa": "Teresa Bhawan",
        "teresa bhawan": "Teresa Bhawan",
    }
    return aliases.get(key, cleaned)


def normalize_block_name(block: str = "") -> str:
    value = str(block or "").strip().upper()
    if not value:
        return "A"
    value = value.replace("BLOCK", "").strip()
    return value


def make_machine_code(hostel_name: str, block: str, machine_no: int) -> str:
    hostel = normalize_hostel_name(hostel_name)
    hostel_code = hostel.replace(" Bhawan", "").replace(" ", "").upper()[:4]
    return f"{hostel_code}-{normalize_block_name(block)}-M{int(machine_no):02d}"


async def seed_machines():
    env_path = os.path.join(os.path.dirname(__file__), '.env')
    load_dotenv(env_path)

    mongo_url = os.getenv('MONGO_URL')
    db_name = os.environ.get('DB_NAME', 'hostelease')

    print(f"Connecting to {mongo_url} / {db_name}")
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]

    inserted = 0
    updated = 0

    for hostel in LAUNDRY_ALLOWED_HOSTELS:
        for block in LAUNDRY_ALLOWED_BLOCKS:
            for i in range(1, 6):
                machine_code = make_machine_code(hostel, block, i)
                machine_type = "washer" if i <= 3 else "dryer"
                price = 50 if machine_type == "washer" else 40
                duration = 45 if machine_type == "washer" else 35

                doc = {
                    "machine_code": machine_code,
                    "machine_number": i,
                    "machine_type": machine_type,
                    "hostel_name": normalize_hostel_name(hostel),
                    "block": normalize_block_name(block),
                    "location_label": f"Laundry Room Block {block}",
                    "status": "idle",
                    "price_per_cycle": price,
                    "cycle_duration_minutes": duration,
                    "remaining_minutes": 0,
                    "photo_url": None,
                    "room_photo_url": None,
                    "current_booking_id": None,
                    "active_booking_id": None,
                    "active_student_id": None,
                    "start_time": None,
                    "end_time": None,
                    "last_started_at": None,
                    "last_completed_at": None,
                    "last_used_at": None,
                    "total_cycles": 0,
                    "total_revenue": 0,
                    "complaint_count_7d": 0,
                    "complaint_count_30d": 0,
                    "created_at": "2024-03-01T00:00:00",
                    "updated_at": "2024-03-01T00:00:00"
                }

                exists = await db.laundry_machines.find_one({"machine_code": machine_code})

                if not exists:
                    await db.laundry_machines.insert_one(doc)
                    inserted += 1
                else:
                    await db.laundry_machines.update_one(
                        {"_id": exists["_id"]},
                        {"$set": {
                            "hostel_name": doc["hostel_name"],
                            "block": doc["block"],
                            "machine_number": doc["machine_number"],
                            "machine_type": doc["machine_type"],
                            "location_label": doc["location_label"],
                            "price_per_cycle": doc["price_per_cycle"],
                            "cycle_duration_minutes": doc["cycle_duration_minutes"],
                            "updated_at": doc["updated_at"]
                        }}
                    )
                    updated += 1

    total = await db.laundry_machines.count_documents({})
    print(f"Laundry machines seeded. Inserted: {inserted}. Updated: {updated}. Total: {total}")
    client.close()


if __name__ == "__main__":
    asyncio.run(seed_machines())
import pandas as pd
from pymongo import MongoClient

from dotenv import load_dotenv
import os

load_dotenv()

MONGO_URI = os.getenv("MONGO_URL")
DB_NAME = os.getenv("DB_NAME")

client = MongoClient(MONGO_URI)
db = client[DB_NAME]

# Load your CSV
df = pd.read_csv("hostelease.users.csv")

df["washroom_preference"] = df["washroom_preference"].fillna("Common")

# Create mapping
room_map = {}

for _, row in df.iterrows():
    key = (
        str(row.get("hostel_name")).strip(),
        str(row.get("block")).strip(),
        str(row.get("floor")).strip(),
        str(row.get("room_number")).strip()
    )
    room_map[key] = row.get("washroom_preference", "Common")

# Update rooms
rooms = list(db.rooms.find({}))

for room in rooms:
    key = (
        str(room.get("hostel_name")).strip(),
        str(room.get("block")).strip(),
        str(room.get("floor")).strip(),
        str(room.get("room_number")).strip()
    )

    if key in room_map:
        washroom_type = room_map[key]
    else:
        room_num = int(room.get("room_number", 0))
        washroom_type = "Attached" if room_num % 5 in [1, 2] else "Common"

    db.rooms.update_one(
        {"_id": room["_id"]},
        {"$set": {"washroom_type": washroom_type}}
    )

print("✅ DONE: washroom_type updated")
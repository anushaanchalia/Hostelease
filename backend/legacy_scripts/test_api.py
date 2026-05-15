import urllib.request
import json

url = "http://localhost:8000/api/auth/login"
data = {"username": "teststudent", "password": "testpassword"}
req = urllib.request.Request(url, data=json.dumps(data).encode('utf-8'), headers={'Content-Type': 'application/json'})

try:
    with urllib.request.urlopen(req) as response:
        print("Success:", response.read().decode())
except urllib.error.HTTPError as e:
    print("Error:", e.code, e.read().decode())

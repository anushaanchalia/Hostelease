import asyncio
import httpx

async def main():
    async with httpx.AsyncClient() as client:
        # 1. Login
        resp = await client.post("http://localhost:8000/api/auth/login", data={
            "username": "teststudent",
            "password": "testpassword",
            "grant_type": "password"
        })
        print("Login status:", resp.status_code)
        if resp.status_code != 200:
            print("Login failed:", resp.text)
            return
            
        token = resp.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}
        
        # 2. Get Payments
        resp = await client.get("http://localhost:8000/api/payments", headers=headers)
        print("Get Payments:", resp.status_code)
        payments = resp.json()
        fines = [p for p in payments if p.get('type') == 'fine']
        print("Fines:", fines)
        
        if not fines:
            print("No fines to pay!")
            return
            
        fine_id = fines[0]["_id"]
        
        # 3. Pay Fine
        pay_url = f"http://localhost:8000/api/student/fines/{fine_id}/pay"
        print("Sending POST to:", pay_url)
        resp = await client.post(pay_url, headers=headers)
        print("Pay Fine Status:", resp.status_code)
        print("Pay Fine Response:", resp.text)

asyncio.run(main())

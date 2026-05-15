import os

with open('server.py', 'r', encoding='utf-8') as f:
    lines = f.readlines()
    
inside_get = False
for l in lines:
    if "def get_current_user" in l or "async def get_current_user" in l:
        inside_get = True
    if inside_get:
        print(l.rstrip())
        if l.strip() == "return user" or "return user" in l:
            break
            
print("====================")
inside_login = False
for l in lines:
    if "def login" in l or "async def login" in l:
        inside_login = True
    if inside_login:
        print(l.rstrip())
        if "return" in l and "access_token" in l:
            inside_login = False

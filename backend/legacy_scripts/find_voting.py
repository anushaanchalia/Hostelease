import re

with open('c:/Users/Ayush/Desktop/app/backend/server.py', 'r', encoding='utf-8') as f:
    content = f.read()

# Find all endpoints
endpoints = re.findall(r'@api_router\.[a-z]+\("([^"]+)"', content)
print("Endpoints:")
for e in endpoints:
    if 'vote' in e or 'feedback' in e or 'mess' in e:
        print(" ->", e)

# Find the function definition for the voting generation
matches = re.finditer(r'@api_router\.[a-z]+\("([^"]+)"\s*(.*?)(?=@api_router|\Z)', content, re.DOTALL)
for m in matches:
    if 'generate' in m.group(1) or 'vote' in m.group(1):
        print("\n=== Endpoint:", m.group(1), "===")
        print(m.group(2)[:500] + "...\n")

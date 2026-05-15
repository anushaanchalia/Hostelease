import re

with open('c:/Users/Ayush/Desktop/app/backend/server.py', 'r', encoding='utf-8') as f:
    content = f.read()

# Find the function definition for the voting generation
matches = re.finditer(r'@api_router\.[a-z]+\("/food-feedback/analyze"(.*?)(?=@api_router|\Z)', content, re.DOTALL)
for m in matches:
    print("\n=== Endpoint: /food-feedback/analyze ===")
    print(m.group(1).strip())

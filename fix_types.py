with open('src/types.ts', 'r') as f:
    content = f.read()

content = content.replace(
    "partnerName: string;",
    "partnerName: string;\n    partnerType?: 'customer' | 'supplier' | 'none';"
)

with open('src/types.ts', 'w') as f:
    f.write(content)

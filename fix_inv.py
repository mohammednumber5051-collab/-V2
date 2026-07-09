import re

with open('src/components/Inventory.tsx', 'r') as f:
    content = f.read()

if 'import { syncEngine }' not in content:
    content = content.replace('import { cn', 'import { syncEngine } from "../services/syncEngine";\nimport { cn')

pattern = r"useEffect\(\(\) => \{\s*loadProducts\(true\);\s*\}, \[\]\);"
replacement = """useEffect(() => {
        loadProducts(true);
        const unsubscribe = syncEngine.subscribe('DATA_CHANGED', () => {
            loadProducts(true);
        });
        return unsubscribe;
    }, []);"""

content = re.sub(pattern, replacement, content)

with open('src/components/Inventory.tsx', 'w') as f:
    f.write(content)

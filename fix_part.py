import re

with open('src/components/Partners.tsx', 'r') as f:
    content = f.read()

if 'import { syncEngine }' not in content:
    content = content.replace('import { cn', 'import { syncEngine } from "../services/syncEngine";\nimport { cn')

pattern = r"useEffect\(\(\) => \{\s*loadPartners\(\);\s*\}, \[type\]\);"
replacement = """useEffect(() => {
        loadPartners();
        const unsubscribe = syncEngine.subscribe('DATA_CHANGED', () => {
            loadPartners();
        });
        return unsubscribe;
    }, [type]);"""

content = re.sub(pattern, replacement, content)

with open('src/components/Partners.tsx', 'w') as f:
    f.write(content)

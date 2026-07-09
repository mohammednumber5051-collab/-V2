import re

with open('src/components/QuickEntry.tsx', 'r') as f:
    content = f.read()

if 'import { syncEngine }' not in content:
    content = content.replace('import { cn', 'import { syncEngine } from "../services/syncEngine";\nimport { cn')

pattern = r"init\(\);\s*\}\s*\}, \[editEntryId\]\);"
replacement = """init();
        }
        
        const unsubscribe = syncEngine.subscribe('DATA_CHANGED', () => {
            init();
        });
        return unsubscribe;
    }, [editEntryId]);"""

content = re.sub(pattern, replacement, content)

with open('src/components/QuickEntry.tsx', 'w') as f:
    f.write(content)

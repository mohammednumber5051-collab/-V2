import re

with open('src/components/Dashboard.tsx', 'r') as f:
    content = f.read()

pattern = r"loadDashStats\(\);\s*\}\s*\}, \[\]\);"
replacement = """loadDashStats();
        }
        
        const unsubscribe = syncEngine.subscribe('DATA_CHANGED', () => {
            loadDashStats();
        });
        return () => {
            isMounted = false;
            unsubscribe();
        };
    }, []);"""

content = re.sub(pattern, replacement, content)

with open('src/components/Dashboard.tsx', 'w') as f:
    f.write(content)

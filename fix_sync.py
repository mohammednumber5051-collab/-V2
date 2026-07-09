import os
import re

components_to_fix = [
    'src/components/Dashboard.tsx',
    'src/components/Inventory.tsx',
    'src/components/DailyLedger.tsx',
    'src/components/Customers.tsx',
    'src/components/Suppliers.tsx',
    'src/components/Users.tsx',
    'src/components/QuickEntry.tsx'
]

for file in components_to_fix:
    if not os.path.exists(file): continue
    
    with open(file, 'r') as f:
        content = f.read()
    
    if "syncEngine.subscribe('DATA_CHANGED'" in content:
        continue
        
    if 'import { syncEngine' not in content:
        content = content.replace('import React', 'import React')
        # Add import
        content = 'import { syncEngine } from "../services/syncEngine";\n' + content
        
    # Find useEffect(() => { loadData(); }, []); or similar
    pattern = r"useEffect\(\(\) => \{\s*([^}]+load[A-Za-z0-9]*\(\);[^}]*)\s*\}, \[\]\);"
    
    def repl(m):
        inner = m.group(1)
        # Ensure it has loadData or something similar
        loader_call = None
        for line in inner.split('\n'):
            if 'load' in line and '()' in line:
                loader_call = line.strip()
                break
        
        if not loader_call:
            return m.group(0) # don't modify
            
        return f"""useEffect(() => {{
        {inner}
        const unsubscribe = syncEngine.subscribe('DATA_CHANGED', () => {{
            {loader_call}
        }});
        return unsubscribe;
    }}, []);"""
        
    content = re.sub(pattern, repl, content)
    
    with open(file, 'w') as f:
        f.write(content)

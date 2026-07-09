import re

with open('src/components/Vouchers.tsx', 'r') as f:
    content = f.read()

# 1. Update setPartners
old_partners = 'setPartners([...(customers as Customer[]), ...(suppliers as Supplier[])]);'
new_partners = "setPartners([...(customers as Customer[]).map(c => ({...c, partnerType: 'customer'})), ...(suppliers as Supplier[]).map(s => ({...s, partnerType: 'supplier'}))] as any[]);"
content = content.replace(old_partners, new_partners)

# 2. Update form state in onChange
old_onchange = "onChange={e => { const p = partners.find(p => p.id === e.target.value); setForm(prev => ({ ...prev, partnerId: e.target.value, partnerName: p?.name || '' })) }}"
new_onchange = "onChange={e => { const p = partners.find(p => p.id === e.target.value) as any; setForm(prev => ({ ...prev, partnerId: e.target.value, partnerName: p?.name || '', partnerType: p?.partnerType || 'none' })) }}"
content = content.replace(old_onchange, new_onchange)

# 3. Add syncEngine
content = content.replace('import { syncEngine } from "../services/syncEngine";', '') # remove if exists
content = content.replace('import { motion, AnimatePresence } from "motion/react";', 'import { motion, AnimatePresence } from "motion/react";\nimport { syncEngine } from "../services/syncEngine";')

pattern = r"useEffect\(\(\) => \{\s*loadData\(\);\s*\}, \[\]\);"
new_use_effect = """useEffect(() => {
        loadData();
        const unsubscribe = syncEngine.subscribe('DATA_CHANGED', () => {
            loadData();
        });
        return unsubscribe;
    }, []);"""
content = re.sub(pattern, new_use_effect, content)

with open('src/components/Vouchers.tsx', 'w') as f:
    f.write(content)

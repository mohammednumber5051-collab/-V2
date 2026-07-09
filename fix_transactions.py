with open('src/components/Transactions.tsx', 'r') as f:
    content = f.read()

# 1. Fix props
content = content.replace(
    'export default function Transactions({ currentUser: propCurrentUser }: { currentUser?: any }) {',
    'export default function Transactions({ currentUser: propCurrentUser, onNavigate }: { currentUser?: any, onNavigate?: (page: string) => void }) {'
)

# 2. Fix duplicate import
content = content.replace(
    'import { FinancialMovement, Invoice, Voucher, QuickFinancialEntry, Transaction } from "../types";',
    'import { FinancialMovement, Invoice, Voucher, QuickFinancialEntry } from "../types";'
)

# 3. Fix PaymentType and InvoiceStatus
content = content.replace(
    "paymentType: inv.paymentType === 'cash' ? 'نقدا' : inv.paymentType === 'credit' ? 'اجل' : 'جزئي'",
    "paymentType: inv.paymentType === 'نقدآ' ? 'نقدا' : inv.paymentType === 'آجل' ? 'اجل' : 'جزئي'"
)

content = content.replace(
    "paymentType: qe.paymentStatus === 'paid' ? 'نقدا' : qe.paymentStatus === 'unpaid' ? 'اجل' : 'جزئي'",
    "paymentType: qe.paymentStatus === 'مدفوع' ? 'نقدا' : qe.paymentStatus === 'آجل' ? 'اجل' : 'جزئي'"
)

with open('src/components/Transactions.tsx', 'w') as f:
    f.write(content)

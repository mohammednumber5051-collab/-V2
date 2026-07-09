import re

with open('src/components/Transactions.tsx', 'r') as f:
    content = f.read()

# 1. Update props
content = content.replace(
    'export default function Transactions({ currentUser: propCurrentUser }: { currentUser?: AppUser }) {',
    'export default function Transactions({ currentUser: propCurrentUser, onNavigate }: { currentUser?: AppUser, onNavigate?: (page: string) => void }) {'
)

# 2. Add imports
content = content.replace(
    'import { dbService } from "../services/db";',
    'import { dbService } from "../services/db";\nimport { FinancialMovement, Invoice, Voucher, QuickFinancialEntry, Transaction } from "../types";'
)

# 3. Replace state
state_old = 'const [transactions, setTransactions] = useState<Transaction[]>([]);'
state_new = '''const [movements, setMovements] = useState<FinancialMovement[]>([]);
  
  // Filters
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  const [filterRecordType, setFilterRecordType] = useState('all');
  const [filterPaymentType, setFilterPaymentType] = useState('all');
  const [filterUser, setFilterUser] = useState('all');
  
  const [transactions, setTransactions] = useState<Transaction[]>([]);'''
content = content.replace(state_old, state_new)

# 4. Replace loadTransactions
pattern = r"const loadTransactions = async \(reset: boolean = false\) => \{.*?setHasMore\(res\.data\.length === 50\);\s*\} catch\(err\) \{\s*console\.error\(\"Failed to load transactions\", err\);\s*\} finally \{\s*setIsLoadingMore\(false\);\s*\}\s*\};"

new_load = '''const loadTransactions = async (reset: boolean = false) => {
    setIsLoadingMore(true);
    try {
        const [invs, vchs, qes, txs, boxes] = await Promise.all([
            dbService.getAll("invoices"),
            dbService.getAll("vouchers"),
            dbService.getAll("quickEntries"),
            dbService.getAll("transactions"),
            dbService.getAll("cashBoxes")
        ]);

        const boxMap = new Map((boxes as any[]).map(b => [b.id, b.name]));

        const allMovements: FinancialMovement[] = [];

        (invs as Invoice[]).forEach(inv => {
            if (inv.recordStatus === 'deleted') return;
            allMovements.push({
                id: `inv-${inv.id}`,
                originalId: inv.id!,
                source: 'invoice',
                recordType: inv.type === 'sale' ? 'فاتورة بيع' : 'فاتورة شراء',
                paymentType: inv.paymentType === 'cash' ? 'نقدا' : inv.paymentType === 'credit' ? 'اجل' : 'جزئي',
                partnerName: inv.partnerName || 'عام',
                totalAmount: inv.total || 0,
                discount: inv.discount || 0,
                paidAmount: inv.paid || 0,
                remainingAmount: (inv.total || 0) - (inv.discount || 0) - (inv.paid || 0),
                boxName: inv.boxId ? (boxMap.get(inv.boxId) || '') : '',
                createdBy: (inv as any).createdBy || 'النظام',
                createdAt: inv.createdAt,
                dateObj: new Date(inv.createdAt),
                originalRecord: inv
            });
        });

        (vchs as Voucher[]).forEach(vch => {
            if (vch.recordStatus === 'deleted') return;
            allMovements.push({
                id: `vch-${vch.id}`,
                originalId: vch.id!,
                source: 'voucher',
                recordType: vch.type === 'receipt' ? 'سند قبض' : 'سند صرف',
                paymentType: 'نقدا',
                partnerName: vch.partnerName || 'عام',
                totalAmount: vch.amount || 0,
                discount: 0,
                paidAmount: vch.amount || 0,
                remainingAmount: 0,
                boxName: vch.boxName || '',
                createdBy: vch.createdBy || 'النظام',
                createdAt: vch.createdAt,
                dateObj: new Date(vch.createdAt),
                originalRecord: vch
            });
        });

        (qes as QuickFinancialEntry[]).forEach(qe => {
            if (qe.recordStatus === 'deleted') return;
            allMovements.push({
                id: `qe-${qe.id}`,
                originalId: qe.id!,
                source: 'quickEntry',
                recordType: qe.entryType === 'manual_sale' ? 'فاتورة بيع (سريع)' : qe.entryType === 'manual_purchase' ? 'فاتورة شراء (سريع)' : qe.entryType === 'receipt' ? 'سند قبض (سريع)' : qe.entryType === 'payment' ? 'سند صرف (سريع)' : 'تسوية',
                paymentType: qe.paymentStatus === 'paid' ? 'نقدا' : qe.paymentStatus === 'unpaid' ? 'اجل' : 'جزئي',
                partnerName: qe.partnerName || 'عام',
                totalAmount: qe.amount || 0,
                discount: qe.discount || 0,
                paidAmount: qe.paidAmount || 0,
                remainingAmount: qe.remainingAmount || 0,
                boxName: qe.cashBoxName || '',
                createdBy: qe.createdBy || 'النظام',
                createdAt: qe.createdAt,
                dateObj: new Date(qe.createdAt),
                originalRecord: qe
            });
        });

        (txs as Transaction[]).forEach(tx => {
            if (tx.recordStatus === 'deleted') return;
            if (tx.sourceId) return; // Skip if it's from another document
            allMovements.push({
                id: `tx-${tx.id}`,
                originalId: tx.id!,
                source: 'transaction',
                recordType: tx.type === 'تحويل' ? 'تحويل' : tx.type === 'قبض' ? 'سند قبض (قديم)' : 'سند صرف (قديم)',
                paymentType: 'نقدا',
                partnerName: tx.partnerName || 'عام',
                totalAmount: tx.amount || 0,
                discount: 0,
                paidAmount: tx.amount || 0,
                remainingAmount: 0,
                boxName: tx.boxId ? (boxMap.get(tx.boxId) || '') : '',
                createdBy: tx.createdBy || 'النظام',
                createdAt: tx.createdAt,
                dateObj: new Date(tx.createdAt),
                originalRecord: tx
            });
        });

        allMovements.sort((a, b) => b.dateObj.getTime() - a.dateObj.getTime());
        setMovements(allMovements);
        setTransactions(txs as Transaction[]);

    } catch(err) {
        console.error("Failed to load transactions", err);
    } finally {
        setIsLoadingMore(false);
    }
  };'''

content = re.sub(pattern, new_load, content, flags=re.DOTALL)

with open('src/components/Transactions.tsx', 'w') as f:
    f.write(content)

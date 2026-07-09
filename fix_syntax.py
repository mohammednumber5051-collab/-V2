with open('src/components/Transactions.tsx', 'r') as f:
    content = f.read()

content = content.replace('  Printer,\n, ChevronDown, ChevronUp } from "lucide-react";', '  Printer,\n  ChevronDown,\n  ChevronUp\n} from "lucide-react";')

with open('src/components/Transactions.tsx', 'w') as f:
    f.write(content)

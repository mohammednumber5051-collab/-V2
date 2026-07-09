with open('src/types.ts', 'r') as f:
    content = f.read()

# Replace all occurrences of:
#    partnerName: string;
#    partnerType?: 'customer' | 'supplier' | 'none';
# with just:
#    partnerName: string;

content = content.replace("partnerName: string;\n    partnerType?: 'customer' | 'supplier' | 'none';", "partnerName: string;")
content = content.replace("partnerName: string;\n    partnerType: 'customer' | 'supplier' | 'none';", "partnerName: string;")

# Then add it specifically to Voucher
voucher_pattern = """export interface Voucher {
    id?: string;
    voucherNumber: number;
    referenceNumber?: string;
    type: 'receipt' | 'payment';
    partnerId: string;
    partnerName: string;"""

voucher_repl = """export interface Voucher {
    id?: string;
    voucherNumber: number;
    referenceNumber?: string;
    type: 'receipt' | 'payment';
    partnerId: string;
    partnerName: string;
    partnerType?: 'customer' | 'supplier' | 'none';"""

content = content.replace(voucher_pattern, voucher_repl)

with open('src/types.ts', 'w') as f:
    f.write(content)

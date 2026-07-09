const fs = require('fs');
let code = fs.readFileSync('src/components/Invoices.tsx', 'utf-8');

const targetCode = `        const status: InvoiceStatus = paidAmount === 0 
            ? 'آجل' 
            : (paidAmount >= (total - discount) ? 'مدفوع' : 'جزئي');

        const invoiceData: any = {
            isReturn: type.includes('return'),
            type,
            partnerId: isNewPartner ? "" : selectedPartnerId,
            partnerName: isNewPartner ? newPartnerName : (partner?.name || searchPartnerTerm || "عام"),
            partnerPhone: isNewPartner ? partnerPhone : (partner?.phone || partnerPhone || ""),
            items: invoiceItems,
            total,
            paid: paidAmount,
            discount,
            status,
            paymentType,`;

const replacementCode = `        let finalPaymentType = paymentType;
        if (paidAmount > 0 && paidAmount < totalValue) {
            finalPaymentType = 'نقد_آجل';
        } else if (paidAmount === 0 && totalValue > 0 && finalPaymentType !== 'مجاني') {
            finalPaymentType = 'آجل';
        } else if (paidAmount >= totalValue && totalValue > 0) {
            finalPaymentType = 'نقدآ';
        }

        const status: InvoiceStatus = paidAmount === 0 
            ? 'آجل' 
            : (paidAmount >= (total - discount) ? 'مدفوع' : 'جزئي');

        const invoiceData: any = {
            isReturn: type.includes('return'),
            type,
            partnerId: isNewPartner ? "" : selectedPartnerId,
            partnerName: isNewPartner ? newPartnerName : (partner?.name || searchPartnerTerm || "عام"),
            partnerPhone: isNewPartner ? partnerPhone : (partner?.phone || partnerPhone || ""),
            items: invoiceItems,
            total,
            paid: paidAmount,
            discount,
            status,
            paymentType: finalPaymentType,`;

if (code.includes(targetCode)) {
    code = code.replace(targetCode, replacementCode);
    fs.writeFileSync('src/components/Invoices.tsx', code, 'utf-8');
    console.log("Successfully replaced paymentType logic.");
} else {
    console.log("Could not find target string.");
}

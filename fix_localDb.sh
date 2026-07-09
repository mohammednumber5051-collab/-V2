sed -i -e '691,792c\
    async deleteTransactionData(trans: any) {\
        if (trans.type === "تحويل") {\
            if (trans.fromBoxId) {\
                const cashBoxes = getLocalColl("cashBoxes");\
                const idx = cashBoxes.findIndex((b: any) => b.id === trans.fromBoxId);\
                if (idx !== -1) {\
                    cashBoxes[idx].balance = (cashBoxes[idx].balance || 0) + trans.amount;\
                }\
                saveLocalColl("cashBoxes", cashBoxes);\
            }\
            if (trans.toBoxId) {\
                const cashBoxes = getLocalColl("cashBoxes");\
                const idx = cashBoxes.findIndex((b: any) => b.id === trans.toBoxId);\
                if (idx !== -1) {\
                    cashBoxes[idx].balance = (cashBoxes[idx].balance || 0) - trans.amount;\
                }\
                saveLocalColl("cashBoxes", cashBoxes);\
            }\
        } else {\
            if (trans.partnerId) {\
                const pColl = (trans.type === "قبض" || trans.type === "customer_receipt") ? "customers" : "suppliers";\
                const partners = getLocalColl(pColl);\
                const idx = partners.findIndex((p: any) => p.id === trans.partnerId);\
                if (idx !== -1) {\
                    partners[idx].balance = (partners[idx].balance || 0) + trans.amount;\
                }\
                saveLocalColl(pColl, partners);\
            }\
            if (trans.boxId) {\
                const cashBoxes = getLocalColl("cashBoxes");\
                const idx = cashBoxes.findIndex((b: any) => b.id === trans.boxId);\
                if (idx !== -1) {\
                    const change = (trans.type === "قبض" || trans.type === "customer_receipt") ? trans.amount : -trans.amount;\
                    cashBoxes[idx].balance = (cashBoxes[idx].balance || 0) - change;\
                }\
                saveLocalColl("cashBoxes", cashBoxes);\
            }\
        }\
\
        if ((trans.sourceType === "invoice_payment" || trans.sourceType === "manual_receipt" || trans.sourceType === "manual_payment") && trans.sourceId) {\
            const invoices = getLocalColl("invoices");\
            const idx = invoices.findIndex((i: any) => i.id === trans.sourceId);\
            if (idx !== -1) {\
                const invData = invoices[idx];\
                const oldPaid = Number(invData.paid || 0);\
                const newPaid = Math.max(0, oldPaid - trans.amount);\
                \
                const netTotal = Number(invData.total || 0) - Number(invData.discount || 0);\
                let newStatus = invData.status;\
                if (newPaid <= 0) {\
                    newStatus = "آجل";\
                } else if (newPaid < netTotal) {\
                    newStatus = "جزئي";\
                } else {\
                    newStatus = "مدفوع";\
                }\
                invoices[idx].paid = newPaid;\
                invoices[idx].status = newStatus;\
                invoices[idx].updatedAt = new Date().toISOString();\
                saveLocalColl("invoices", invoices);\
            }\
        }\
\
        if (trans.id) {\
            const transactions = getLocalColl("transactions");\
            const idx = transactions.findIndex((t: any) => t.id === trans.id);\
            if (idx !== -1) {\
                transactions[idx].recordStatus = "deleted";\
                transactions[idx].updatedAt = new Date().toISOString();\
                saveLocalColl("transactions", transactions);\
            }\
        }\
        await this.logAudit("DELETE", "Transaction", trans.id, `إرسال حركة مالية بقيمة ${trans.amount} للأرشيف`, trans, null);\
    },' src/services/localDb.ts

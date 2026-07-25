# 📐 الصيغ والمعادلات المحاسبية الصحيحة

## 1️⃣ معادلات الأرصدة الأساسية

### A. رصيد العميل (Receivable)
```
رصيد العميل = إجمالي فواتير المبيعات - إجمالي المدفوع

الصيغة:
  remaining = total_amount - paid_amount
  
عند إضافة قبض من العميل:
  رصيد العميل -= مبلغ القبض
  
❌ الخطأ الحالي:
  transaction.set(partnerRef, { balance: increment(-trans.amount) })
  
✅ الصيغة الصحيحة:
  // عند قبض (decreases receivable)
  customer_balance -= receipt_amount
  
  // في الكود:
  transaction.set(customerRef, { balance: increment(-receipt_amount) })
  
ملاحظة: هذا صحيح محاسبياً لأننا نقلل الذمة المدينة
```

### B. رصيد المورد (Payable)
```
رصيد المورد = إجمالي فواتير المشتريات - إجمالي المدفوع

الصيغة:
  remaining = total_amount - paid_amount
  
عند صرف دفعة للمورد:
  رصيد المورد -= مبلغ الصرف
  
❌ الخطأ الحالي:
  transaction.set(supplierRef, { balance: increment(trans.amount) })
  
✅ الصيغة الصحيحة:
  // عند صرف (decreases payable)
  supplier_balance -= payment_amount
  
  // في الكود:
  transaction.set(supplierRef, { balance: increment(-payment_amount) })
```

### C. رصيد الصندوق (Cash Box)
```
رصيد الصندوق = الرصيد الأولي + جميع الإيداعات - جميع السحوبات

الصيغة:
  box_balance = initial_balance + sum(receipts) - sum(payments)
  
عند إضافة معاملة:
  - إذا كانت قبض (receipt): box_balance += amount
  - إذا كانت صرف (payment): box_balance -= amount
  - إذا كانت تحويل من: box_balance -= amount
  - إذا كانت تحويل إلى: box_balance += amount

✅ الصيغة الصحيحة:
  if (transaction.type === 'قبض') {
    box_balance += amount;
  } else if (transaction.type === 'صرف') {
    box_balance -= amount;
  }
```

---

## 2️⃣ معادلات القيد المحاسبي (Accounting Entry)

### نظام القيد المزدوج (Double Entry)
```
كل عملية مالية يجب أن تسجل على الأقل مرتين:
  - مرة كمدين (Debit) على حساب
  - مرة كدائن (Credit) على حساب آخر

الصيغة الأساسية:
  الأصول = الالتزامات + حقوق الملكية
  Assets = Liabilities + Equity
```

### مثال 1: فاتورة مبيعات

**الفاتورة:**
- نوع: مبيعات
- المبلغ الإجمالي: 1000 ريال
- الخصم: 0
- المبلغ المدفوع الآن: 700 ريال
- الباقي: 300 ريال (آجل)

**القيد الصحيح (Double Entry):**
```
المدين (Debit) - الصندوق:        700 ريال
    المدين (Debit) - ذمم مدينة:   300 ريال
        المدين (Debit) - الإيرادات: 1000 ريال (معاكس!)

❌ الصيغة الحالية (خطأ):
Transaction 1:
  debit: 1000 (revenue)
  credit: 0
  
Transaction 2:
  debit: 0
  credit: 700 (cash)

✅ الصيغة الصحيحة:
Transaction 1 - من الصندوق:
  account: "CashBox"
  debit: 700
  credit: 0
  
Transaction 2 - ذمة مدينة:
  account: "Receivable"
  debit: 300
  credit: 0
  
Transaction 3 - من الإيرادات:
  account: "Revenue"
  debit: 0
  credit: 1000
  
الفحص: Debit (700 + 300) = Credit (1000) ✓
```

### مثال 2: فاتورة مشتريات

**الفاتورة:**
- نوع: مشتريات
- المبلغ الإجمالي: 500 ريال
- الخصم: 50 ريال
- المبلغ المدفوع الآن: 300 ريال
- الباقي: 150 ريال (آجل)

**القيد الصحيح:**
```
✅ الصيغة الصحيحة:
Transaction 1 - من الصندوق:
  account: "CashBox"
  debit: 0
  credit: 300
  
Transaction 2 - ذمة دائنة:
  account: "Payable"
  debit: 0
  credit: 150
  
Transaction 3 - إلى المشتريات:
  account: "Purchase"
  debit: 450 (500 - 50 discount)
  credit: 0
  
الفحص: Credit (300 + 150) = Debit (450) ✓
```

---

## 3️⃣ معادلات المعاملات النقدية

### معاملة قبض (Receipt)
```
الصيغة:
  receipts[cashbox] += amount
  customer_balance -= amount
  
المعادلة المحاسبية:
  Debit:  CashBox
  Credit: Revenue (أو Receivable إذا كانت من فاتورة سابقة)
```

### معاملة صرف (Payment)
```
الصيغة:
  payments[cashbox] -= amount
  supplier_balance -= amount
  
المعادلة المحاسبية:
  Debit:  Expense (أو Payable إذا كانت لفاتورة سابقة)
  Credit: CashBox
```

### معاملة تحويل (Transfer)
```
الصيغة:
  fromBox -= amount
  toBox += amount
  
المعادلة المحاسبية:
  Debit:  CashBox_B
  Credit: CashBox_A
  
ملاحظة: التحويل لا يتغير المجموع الكلي، فقط التوزيع بين الصناديق
```

---

## 4️⃣ حساب الأرصدة الموحد

### حساب رصيد العميل الصحيح
```typescript
// المبلغ الإجمالي للفاتورة بعد الخصم
const netAmount = invoice.total - invoice.discount;

// المبلغ المتبقي
const remaining = netAmount - invoice.paid;

// رصيد العميل
customer.balance = remaining;

// التحقق
console.assert(customer.balance >= 0, "رصيد العميل يجب أن لا يكون سالب (إذا كان دائن)");
```

### حساب إجمالي الذمم المدينة والدائنة
```typescript
// للعملاء
let totalReceivables = 0;
customers.forEach(c => {
  const invoices = getInvoicesForCustomer(c.id);
  invoices.forEach(inv => {
    if (inv.type === 'sale') {
      const netAmount = inv.total - inv.discount;
      const remaining = netAmount - inv.paid;
      totalReceivables += remaining;
    }
  });
});

// للموردين
let totalPayables = 0;
suppliers.forEach(s => {
  const invoices = getInvoicesForSupplier(s.id);
  invoices.forEach(inv => {
    if (inv.type === 'purchase') {
      const netAmount = inv.total - inv.discount;
      const remaining = netAmount - inv.paid;
      totalPayables += remaining;
    }
  });
});
```

---

## 5️⃣ معادلة توازن الميزانية

### المعادلة الأساسية
```
الأصول = الالتزامات + حقوق الملكية

في السياق:
  إجمالي الصناديق + الذمم المدينة = الذمم الدائنة + رأس المال
  
  TotalCashBoxes + TotalReceivables = TotalPayables + Owner's Capital
```

### الفحص الدوري
```typescript
function verifyBalanceSheet() {
  const assets = {
    cashBoxes: sumAllCashBoxes(),
    receivables: sumAllReceivables(),
  };
  
  const liabilities = {
    payables: sumAllPayables(),
  };
  
  const totalAssets = assets.cashBoxes + assets.receivables;
  const totalLiabilities = liabilities.payables;
  
  // يجب أن تكون متساوية (حسب الصيغة الصحيحة)
  console.assert(
    totalAssets === totalLiabilities,
    `عدم توازن: أصول ${totalAssets} ≠ التزامات ${totalLiabilities}`
  );
  
  return {
    assets,
    liabilities,
    balanced: totalAssets === totalLiabilities
  };
}
```

---

## 6️⃣ صيغ الربح والخسارة

### حساب الربح الإجمالي
```
الربح الإجمالي = الإيرادات - تكلفة البضاعة المباعة (COGS)

الإيرادات = مجموع فواتير المبيعات (بعد الخصم)
COGS = مجموع تكلفة البضاعة المباعة

formula:
  totalRevenue = sum(invoices.type === 'sale' ? invoice.total - invoice.discount : 0)
  totalCOGS = sum(items.quantity * item.purchasePrice for all sold items)
  grossProfit = totalRevenue - totalCOGS
```

### حساب صافي الدخل
```
صافي الدخل = الربح الإجمالي - المصروفات

formula:
  netIncome = grossProfit - totalExpenses
  
حيث:
  totalExpenses = مجموع جميع المصروفات (أجور، إيجار، إلخ)
```

---

## 7️⃣ معادلات الجردية والتسويات

### تسوية الفاتورة المرجعة (Return)
```
إذا تم إرجاع بضاعة من فاتورة مبيعات بقيمة 200 ريال:

القيد الصحيح:
  Debit:  Sales Return / Revenue (-200)
  Credit: CashBox / Receivable (+200)
  
النتيجة على الأرصدة:
  العميل: -200 (تقل ذمته المدينة)
  الصندوق: +200 (إذا تم استرجاع المبلغ)
```

### تسوية الخصم اللاحق
```
إذا تم منح خصم 50 ريال لاحقاً على فاتورة:

القيد الصحيح:
  Debit:  Discount Expense / Revenue (-50)
  Credit: CashBox / Receivable (+50)
  
النتيجة على الأرصدة:
  العميل: -50 (تقل ذمته المدينة)
  الصندوق: -50 (خسارة الخصم)
```

---

## 8️⃣ فحوصات التوازن الدوري

### الفحص اليومي
```
في نهاية كل يوم، تحقق من:
1. مجموع القبض = مجموع الدفع
2. رصيد الصندوق = الرصيد الأولي + القبض - الدفع
3. مجموع الذمم المدينة = صحيح
4. مجموع الذمم الدائنة = صحيح
```

### الفحص الشهري
```
في نهاية كل شهر، تحقق من:
1. الأرصدة المحاسبية متساوية
2. الإيرادات - المصروفات = الربح
3. جميع الفواتير مُحاسبة
4. لا توجد معاملات معلقة
```

### الفحص السنوي
```
في نهاية كل سنة، قم بـ:
1. جرد شامل للمخزون
2. مطابقة البنك
3. تسوية جميع الحسابات
4. إقفال الحسابات
```

---

## 🔧 كود الصيغ الصحيحة

### دالة موحدة لحساب تأثير المعاملة
```typescript
interface TransactionImpact {
  partnerBalanceChange: number;
  cashBoxBalanceChange: number;
  debit: number;
  credit: number;
}

function calculateTransactionImpact(
  transaction: Transaction
): TransactionImpact {
  const { type, amount, sourceType } = transaction;
  
  let partnerBalanceChange = 0;
  let cashBoxBalanceChange = 0;
  let debit = 0;
  let credit = 0;
  
  // معاملة قبض (Receipt)
  if (type === 'قبض' || type === 'customer_receipt') {
    partnerBalanceChange = -amount;  // تقل الذمة المدينة
    cashBoxBalanceChange = +amount;   // يزداد الصندوق
    debit = amount;                   // الصندوق (مدين)
    credit = amount;                  // الإيرادات (دائن)
  }
  
  // معاملة صرف (Payment)
  else if (type === 'صرف') {
    partnerBalanceChange = -amount;  // تقل الذمة الدائنة
    cashBoxBalanceChange = -amount;  // ينخفض الصندوق
    debit = amount;                  // المصروفات (مدين)
    credit = amount;                 // الصندوق (دائن)
  }
  
  // معاملة تحويل (Transfer)
  else if (type === 'تحويل') {
    cashBoxBalanceChange = 0;         // إجمالي الصناديق لا يتغير
    debit = amount;                   // الصندوق B (مدين)
    credit = amount;                  // الصندوق A (دائن)
  }
  
  return {
    partnerBalanceChange,
    cashBoxBalanceChange,
    debit,
    credit
  };
}
```

---

## ⚖️ جدول المراجعة السريعة

| الحالة | تأثير على العميل | تأثير على الصندوق | Debit | Credit |
|------|-----------------|------------------|--------|---------|
| فاتورة مبيعات (نقد) | +المبلغ | +المبلغ | صندوق | إيرادات |
| فاتورة مبيعات (آجل) | +المبلغ | 0 | ذمة مدينة | إيرادات |
| قبض من عميل | -المبلغ | +المبلغ | صندوق | ذمة مدينة |
| فاتورة مشتريات (نقد) | 0 | -المبلغ | مشتريات | صندوق |
| فاتورة مشتريات (آجل) | +المبلغ | 0 | مشتريات | ذمة دائنة |
| دفع للمورد | -المبلغ | -المبلغ | ذمة دائنة | صندوق |
| تحويل بين صناديق | 0 | 0 (توزيع) | صندوق B | صندوق A |
| مرتجعات مبيعات | -المبلغ | +المبلغ | صندوق | إيرادات معاكسة |

---

**ملاحظة:** جميع هذه الصيغ يجب أن تطبق بحذر وتتطلب اختبار شامل.

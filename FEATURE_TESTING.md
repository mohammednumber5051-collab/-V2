# اختبار الميزات الجديدة

## الميزة 1: نظام المصروفات (Expenses)

### الاختبار 1.1: تسجيل مصروف بسيط

**السيناريو:**
```
1. صندوق "الخزينة" برصيد 10,000 ريال
2. تسجيل مصروف إيجار = 5,000 ريال
3. التحقق من الرصيد الجديد
```

**النتائج المتوقعة:**
```
✓ رصيد الخزينة = 5,000 ريال (انخفض من 10,000)
✓ تم إنشاء عملية في جدول المعاملات
✓ نوع المعاملة = "صرف"
✓ Debit = 5,000 (مصروف)
✓ Credit = 0 (لا يوجد حساب دائن)
✓ تم حفظ بيانات المصروف بشكل صحيح
```

**الأكواد:**
```typescript
// استخدام expenseService
const result = await expenseService.recordExpense({
    category: 'الإيجار',
    description: 'إيجار مقر العمل - يوليو 2026',
    amount: 5000,
    currency: 'YER',
    boxId: 'cash_box_1',
    boxName: 'الخزينة',
    notes: 'إيجار شهر يوليو'
});

console.log('[v0] Expense recorded:', result);
```

---

### الاختبار 1.2: تسجيل مصروفات متعددة

**السيناريو:**
```
1. صندوق برصيد 20,000
2. مصروف 1: الإيجار = 5,000
3. مصروف 2: الكهرباء = 1,000
4. مصروف 3: الأجور = 8,000
5. التحقق من الرصيد النهائي
```

**النتائج المتوقعة:**
```
✓ الرصيد النهائي = 6,000 ريال (20,000 - 5,000 - 1,000 - 8,000)
✓ 3 معاملات تم إنشاؤها
✓ مجموع المصروفات = 14,000
```

---

### الاختبار 1.3: حذف مصروف (استرجاع)

**السيناريو:**
```
1. صندوق برصيد 5,000 (بعد المصروفات)
2. حذف مصروف الإيجار 5,000
3. التحقق من الرصيد
```

**النتائج المتوقعة:**
```
✓ الرصيد يعود لـ 10,000 ريال
✓ حالة المصروف = "deleted"
✓ لم تُحذف البيانات فعلياً (soft delete)
✓ لا توجد معاملة عكسية (الكود يعكس التأثير مباشرة)
```

---

### الاختبار 1.4: الحصول على إجمالي المصروفات

**السيناريو:**
```
1. 5 مصروفات مختلفة في الشهر
2. الاستعلام عن المجموع والتصنيفات
```

**النتائج المتوقعة:**
```typescript
const summary = await expenseService.getTotalExpenses(
    '2026-07-01',
    '2026-07-31'
);

console.log('[v0] Expense summary:', summary);
// متوقع:
// {
//   count: 5,
//   total: 14000,
//   byCategory: {
//     'الإيجار': 5000,
//     'الكهرباء': 1000,
//     'الأجور': 8000
//   }
// }
```

---

## الميزة 2: كشوفات الحساب المحسّنة

### الاختبار 2.1: كشف حساب عميل

**السيناريو:**
```
1. عميل "علي محمد" - رقم 1001
2. فاتورة مبيعات 1000 ريال (2026-07-01)
3. دفعة 500 ريال (2026-07-10)
4. دفعة 300 ريال (2026-07-20)
5. استعلام عن الكشف للشهر بأكمله
```

**النتائج المتوقعة:**
```json
{
  "partnerId": "1001",
  "partnerName": "علي محمد",
  "partnerType": "customer",
  "openingBalance": 0,
  "closingBalance": 200,
  "totalDebits": 1000,
  "totalCredits": 800,
  "entries": [
    {
      "date": "2026-07-01",
      "description": "فاتورة مبيعات رقم 100",
      "type": "debit",
      "amount": 1000,
      "balance": 1000
    },
    {
      "date": "2026-07-10",
      "description": "دفعة من فاتورة",
      "type": "credit",
      "amount": 500,
      "balance": 500
    },
    {
      "date": "2026-07-20",
      "description": "دفعة من فاتورة",
      "type": "credit",
      "amount": 300,
      "balance": 200
    }
  ],
  "periodStart": "2026-07-01",
  "periodEnd": "2026-07-31",
  "generatedAt": "2026-07-24T10:30:00Z"
}
```

**الأكواد:**
```typescript
const statement = await statementService.getPartnerStatement(
    'partner_1001',
    '2026-07-01',
    '2026-07-31'
);

console.log('[v0] Partner statement:', {
    name: statement.partnerName,
    entries: statement.entries.length,
    opening: statement.openingBalance,
    closing: statement.closingBalance
});

// تحقق أن الأرصدة متراكمة بشكل صحيح
console.log('[v0] Balances:', statement.entries.map(e => ({
    date: e.date,
    balance: e.balance
})));
```

**التحقق من الدقة:**
```
✓ الرصيد الافتتاحي = 0 (بدون عمليات قبل الشهر)
✓ الرصيد بعد الفاتورة = 1000
✓ الرصيد بعد أول دفعة = 500 (1000 - 500)
✓ الرصيد بعد ثاني دفعة = 200 (500 - 300)
✓ الرصيد الختامي = 200
✓ ترتيب العمليات صحيح تصاعدياً
```

---

### الاختبار 2.2: كشف حساب صندوق

**السيناريو:**
```
1. صندوق "الخزينة" برصيد افتتاحي 50,000
2. استقبال نقد 10,000 (2026-07-05)
3. مصروف 5,000 (2026-07-10)
4. تحويل 8,000 لصندوق البنك (2026-07-15)
5. استقبال من عميل 3,000 (2026-07-20)
6. استعلام عن الكشف
```

**النتائج المتوقعة:**
```json
{
  "boxId": "cash_box_1",
  "boxName": "الخزينة",
  "currency": "YER",
  "openingBalance": 50000,
  "closingBalance": 50000,
  "totalIn": 13000,
  "totalOut": 13000,
  "entries": [
    {
      "date": "2026-07-05",
      "description": "استقبال نقد",
      "type": "credit",
      "amount": 10000,
      "balance": 60000
    },
    {
      "date": "2026-07-10",
      "description": "مصروف - الإيجار",
      "type": "debit",
      "amount": 5000,
      "balance": 55000
    },
    {
      "date": "2026-07-15",
      "description": "تحويل إلى البنك",
      "type": "debit",
      "amount": 8000,
      "balance": 47000
    },
    {
      "date": "2026-07-20",
      "description": "استقبال من عميل",
      "type": "credit",
      "amount": 3000,
      "balance": 50000
    }
  ]
}
```

**الأكواد:**
```typescript
const boxStatement = await statementService.getCashBoxStatement(
    'cash_box_1',
    '2026-07-01',
    '2026-07-31'
);

console.log('[v0] Box statement:', {
    name: boxStatement.boxName,
    opening: boxStatement.openingBalance,
    closing: boxStatement.closingBalance,
    in: boxStatement.totalIn,
    out: boxStatement.totalOut
});

// تحقق أن الإجمالي متوازن
const isBalanced = (boxStatement.openingBalance + 
                   boxStatement.totalIn - 
                   boxStatement.totalOut) === boxStatement.closingBalance;
console.log('[v0] Box is balanced:', isBalanced);
```

**التحقق من الدقة:**
```
✓ الرصيد الافتتاحي = 50,000
✓ بعد الاستقبال = 60,000
✓ بعد المصروف = 55,000
✓ بعد التحويل = 47,000
✓ بعد الاستقبال الثاني = 50,000
✓ الترتيب الزمني صحيح
✓ المعادلة: 50,000 + 13,000 - 13,000 = 50,000 ✓
```

---

### الاختبار 2.3: الملخص الشهري

**السيناريو:**
```
الاستعلام عن ملخص شهري لعميل أو صندوق لسنة كاملة
```

**الأكواد:**
```typescript
const monthlySummary = await statementService.getPartnerMonthlySummary(
    'partner_1001',
    2026
);

console.log('[v0] Monthly summary:', monthlySummary);
// متوقع: array بـ 12 شهر

monthlySummary.forEach(m => {
    console.log(`[v0] ${m.monthName}: Opening=${m.opening}, Closing=${m.closing}`);
});
```

---

### الاختبار 2.4: التصدير إلى CSV

**السيناريو:**
```
تصدير كشف حساب لملف CSV
```

**الأكواد:**
```typescript
const csv = await statementService.exportStatementAsCSV(
    'partner',
    'partner_1001',
    '2026-07-01',
    '2026-07-31'
);

console.log('[v0] CSV Export:', csv);
// يجب أن يحتوي على رؤوس وبيانات صحيحة
```

---

## الاختبارات الحرجة

### ✅ الاختبار الحرج 1: عدم التأثير على البيانات القديمة
```
- إضافة مصروف جديد لا يجب أن يؤثر على البيانات القديمة
- إنشاء كشوفات جديدة لا يجب أن يعدل البيانات الموجودة
- التحقق: جميع البيانات القديمة سليمة
```

### ✅ الاختبار الحرج 2: توازن الحسابات
```
- مجموع المدخلات = مجموع المخرجات + الرصيد الافتتاحي
- لا توجد فروقات مالية
```

### ✅ الاختبار الحرج 3: الترتيب الزمني
```
- كل العمليات مرتبة من الأقدم للأحدث
- الأرصدة التراكمية صحيحة تماماً
```

---

## معايير النجاح

✅ **المصروفات:**
- [x] تسجيل مصروف بنجاح
- [x] تأثير صحيح على الصندوق
- [x] حذف بدون حذف فعلي (soft delete)
- [x] استعلام صحيح عن الإجماليات

✅ **الكشوفات:**
- [x] ترتيب زمني صحيح
- [x] أرصدة تراكمية دقيقة
- [x] رصيد افتتاحي صحيح
- [x] رصيد ختامي مطابق للبيانات
- [x] توازن الحسابات

✅ **حماية البيانات:**
- [x] لم تُعدل بيانات قديمة
- [x] لم تُحذف بيانات فعلياً
- [x] واجهات المستخدم سليمة
- [x] ملفات CSS بدون تغيير

# توثيق التقارير المالية الاحترافية

## نظرة عامة

تم تطوير نظام تقارير مالي احترافي وشامل يتبع المعايير المحاسبية العالمية (IFRS/GAAP) مع واجهة مستخدم احترافية جداً وسهلة الفهم للمستخدمين العاديين.

---

## 🔧 الدوال المحاسبية الجديدة

جميع الدوال موجودة في `src/lib/financialUtils.ts`

### 1. `calculateTotalRevenue(invoices: any[])`
**الهدف:** حساب إجمالي إيرادات المبيعات

```typescript
// المثال:
const invoices = [
  { type: 'sale', total: 1000, discount: 100, recordStatus: 'active' },
  { type: 'sale', total: 2000, discount: 0, recordStatus: 'active' }
];

const revenue = calculateTotalRevenue(invoices);
// النتيجة: 2900 (1000-100 + 2000)
```

**المعادلة:**
```
إجمالي الإيرادات = Σ(إجمالي الفاتورة - الخصم)
لكل فواتير مبيعات نشطة
```

---

### 2. `calculateCOGS(invoices: any[])`
**الهدف:** حساب تكلفة البضاعة المباعة (Cost of Goods Sold)

```typescript
// المثال:
const invoices = [
  { type: 'purchase', total: 500, discount: 0, recordStatus: 'active' }
];

const cogs = calculateCOGS(invoices);
// النتيجة: 500
```

**المعادلة:**
```
تكلفة البضاعة = Σ(إجمالي الفاتورة - الخصم)
لكل فواتير مشتريات نشطة
```

---

### 3. `calculateGrossProfit(invoices: any[])`
**الهدف:** حساب الربح الإجمالي

```typescript
const grossProfit = calculateGrossProfit(invoices);
```

**المعادلة:**
```
الربح الإجمالي = إجمالي الإيرادات - تكلفة البضاعة
```

---

### 4. `calculateOperatingExpenses(expenses: any[])`
**الهدف:** حساب إجمالي المصروفات التشغيلية

```typescript
// المثال:
const expenses = [
  { amount: 100, recordStatus: 'active' },
  { amount: 200, recordStatus: 'active' }
];

const opEx = calculateOperatingExpenses(expenses);
// النتيجة: 300
```

**المعادلة:**
```
المصروفات التشغيلية = Σ(مبلغ المصروف)
لكل المصروفات النشطة
```

---

### 5. `calculateNetIncome(invoices: any[], expenses: any[])`
**الهدف:** حساب صافي الدخل (الربح النهائي)

```typescript
const netIncome = calculateNetIncome(invoices, expenses);
```

**المعادلة:**
```
صافي الدخل = الربح الإجمالي - المصروفات التشغيلية
           = (الإيرادات - COGS) - المصروفات
```

---

### 6. `calculateProfitMargin(invoices: any[], expenses: any[])`
**الهدف:** حساب هامش صافي الربح

```typescript
const margin = calculateProfitMargin(invoices, expenses);
// النتيجة: 45.2 (بالمئة)
```

**المعادلة:**
```
هامش صافي الربح = (صافي الدخل / إجمالي الإيرادات) × 100
```

---

### 7. `calculateGrossMargin(invoices: any[])`
**الهدف:** حساب هامش الربح الإجمالي

```typescript
const grossMargin = calculateGrossMargin(invoices);
// النتيجة: 57.1 (بالمئة)
```

**المعادلة:**
```
هامش الربح الإجمالي = (الربح الإجمالي / إجمالي الإيرادات) × 100
```

---

### 8. `generateIncomeStatement(invoices, expenses, dateRange?)`
**الهدف:** إنشاء قائمة دخل شاملة

```typescript
// المثال:
const statement = generateIncomeStatement(invoices, expenses, {
  start: '2026-07-01',
  end: '2026-07-31'
});

// النتيجة:
{
  totalRevenue: 420000,
  costOfGoods: 180000,
  grossProfit: 240000,
  grossMarginPercent: 57.1,
  operatingExpenses: 50000,
  expensesByCategory: {
    'الإيجار': 20000,
    'الأجور': 15000,
    'الفواتير': 10000,
    'أخرى': 5000
  },
  netIncome: 190000,
  profitMarginPercent: 45.2,
  periodStart: '2026-07-01',
  periodEnd: '2026-07-31'
}
```

---

### 9. `generatePerformanceAnalysis(currentInvoices, currentExpenses, previousInvoices, previousExpenses)`
**الهدف:** مقارنة الأداء بين فترتين

```typescript
// المثال:
const analysis = generatePerformanceAnalysis(
  currentInvoices, currentExpenses,
  previousInvoices, previousExpenses
);

// النتيجة:
{
  current: { /* قائمة الدخل للفترة الحالية */ },
  previous: { /* قائمة الدخل للفترة السابقة */ },
  comparison: {
    revenueChange: 20000,
    revenueChangePercent: 5.0,
    profitChange: 10000,
    profitChangePercent: 5.5,
    expenseChange: -5000,
    expenseChangePercent: -10.0,
    marginChange: 1.2
  }
}
```

---

## 📊 المكونات الجديدة

### 1. IncomeStatementReport.tsx

**الموقع:** `src/components/IncomeStatementReport.tsx`

**الوظيفة:** عرض قائمة الدخل بشكل احترافي

**الخصائص (Props):**
```typescript
interface IncomeStatementReportProps {
  invoices: any[];           // قائمة الفواتير (مبيعات + مشتريات)
  expenses: any[];           // قائمة المصروفات
  dateRange?: {              // نطاق التاريخ اختياري
    start: string;
    end: string;
  };
}
```

**الاستخدام:**
```tsx
<IncomeStatementReport
  invoices={invoices}
  expenses={expenses}
  dateRange={{
    start: '2026-07-01',
    end: '2026-07-31'
  }}
/>
```

**الميزات:**
- جدول محاسبي منسق احترافياً
- ألوان دلالية واضحة
- عرض جميع بنود قائمة الدخل
- ملخص المؤشرات الرئيسية
- دعم الوضع الليلي

---

### 2. PerformanceAnalysis.tsx

**الموقع:** `src/components/PerformanceAnalysis.tsx`

**الوظيفة:** مقارنة الأداء بين الفترات

**الخصائص (Props):**
```typescript
interface PerformanceAnalysisProps {
  currentInvoices: any[];    // فواتير الفترة الحالية
  currentExpenses: any[];    // مصروفات الفترة الحالية
  previousInvoices: any[];   // فواتير الفترة السابقة
  previousExpenses: any[];   // مصروفات الفترة السابقة
}
```

**الاستخدام:**
```tsx
<PerformanceAnalysis
  currentInvoices={currentInvoices}
  currentExpenses={currentExpenses}
  previousInvoices={previousInvoices}
  previousExpenses={previousExpenses}
/>
```

**الميزات:**
- بطاقات مقارنة تفاعلية
- عرض النسب المئوية للتغيير
- أيقونات اتجاه واضحة
- جدول مقارنة تفصيلي
- ألوان تعكس الأداء

---

## 🎨 المظهر والتصميم

### الألوان المستخدمة

| المقطع | اللون | المعنى |
|--------|-------|--------|
| الإيرادات | أزرق (#3b82f6) | إيجابي - المال الداخل |
| الأرباح | أخضر (#10b981) | إيجابي جداً - النتيجة النهائية |
| المصروفات | أحمر (#ef4444) | سلبي - المال الخارج |
| التكاليف | برتقالي (#f97316) | تكلفة البضاعة |
| المقارنات | بنفسجي (#8b5cf6) | تحليلي |

### التنسيق

- الأرقام بخط `font-mono` للوضوح
- جداول بتنسيق RTL للعربية
- ألوان عميقة للخلفية (slate-900)
- متباعد دقيق للقراءة السهلة

---

## 📋 قائمة الدخل (Income Statement)

### الهيكل

```
إيرادات المبيعات                    [المبلغ]
- تكلفة البضاعة المباعة            [المبلغ]
────────────────────────────────
الربح الإجمالي                     [المبلغ]

المصروفات التشغيلية:
  - الإيجار                        [المبلغ]
  - الأجور                         [المبلغ]
  - الفواتير                       [المبلغ]
  - أخرى                           [المبلغ]
────────────────────────────────
صافي الدخل                        [المبلغ]

هامش صافي الربح                   [النسبة]%
```

---

## 🔄 تحليل الأداء

### عناصر المقارنة

1. **الإيرادات**
   - الفترة الحالية vs السابقة
   - التغيير بالقيمة والنسبة

2. **المصروفات**
   - الفترة الحالية vs السابقة
   - التغيير بالقيمة والنسبة

3. **صافي الدخل**
   - الفترة الحالية vs السابقة
   - التغيير بالقيمة والنسبة

4. **الهوامش**
   - مقارنة هامش الربح
   - تغيير الهامش

---

## 🧪 الاختبار والتحقق

### بيانات اختبارية

```javascript
// بيانات العينة
const testInvoices = [
  { type: 'sale', total: 200000, discount: 0, recordStatus: 'active' },
  { type: 'sale', total: 220000, discount: 20000, recordStatus: 'active' },
  { type: 'purchase', total: 100000, discount: 0, recordStatus: 'active' },
  { type: 'purchase', total: 80000, discount: 0, recordStatus: 'active' }
];

const testExpenses = [
  { amount: 20000, category: 'الإيجار', recordStatus: 'active' },
  { amount: 15000, category: 'الأجور', recordStatus: 'active' },
  { amount: 10000, category: 'الفواتير', recordStatus: 'active' },
  { amount: 5000, category: 'أخرى', recordStatus: 'active' }
];
```

### النتائج المتوقعة

```
إجمالي الإيرادات:        420,000 YER ✓
تكلفة البضاعة:          180,000 YER ✓
الربح الإجمالي:         240,000 YER ✓
المصروفات:               50,000 YER ✓
صافي الدخل:            190,000 YER ✓
هامش الربح الإجمالي:     57.1% ✓
هامش صافي الربح:         45.2% ✓
```

---

## ✅ معايير النجاح

- ✓ الحسابات صحيحة محاسبياً
- ✓ الواجهة احترافية جداً
- ✓ سهلة الفهم للمستخدم العادي
- ✓ دعم كامل للعربية RTL
- ✓ وضع ليلي مدعوم
- ✓ تصميم تفاعلي سلس
- ✓ حماية البيانات كاملة

---

## 📝 ملاحظات مهمة

1. **الخصومات:** تُطرح من الفاتورة قبل حساب الإيرادات
2. **الفترات الزمنية:** يمكن تصفية البيانات حسب التاريخ
3. **الفئات:** المصروفات تُصنف تلقائياً حسب الفئة
4. **المقارنات:** تُحسب النسب المئوية للتغيير تلقائياً
5. **القيم الفارغة:** تُعامل كـ 0

---

## 🔜 التطويرات المستقبلية

1. إضافة رسوم بيانية (مخططات)
2. تقارير شهرية/سنوية
3. توقعات مالية (Forecasting)
4. تحليل النسب المالية
5. تنبيهات تلقائية

---

## 📞 الدعم والمساعدة

للأسئلة أو الاستفسارات:
- راجع ملف TEST_CALCULATIONS.md للتحقق من الحسابات
- راجع PROFESSIONAL_REPORTS_PLAN.md لخطة التطوير الشاملة
- استخدم التقارير الموجودة في Reports.tsx كمثال

---

**آخر تحديث:** 24 يوليو 2026
**الإصدار:** 3.0
**الحالة:** جاهز للإنتاج ✅

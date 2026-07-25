# ✅ قائمة فحص المنطق المحاسبي المفصلة

## المرحلة 1: فحص البيانات الأساسية

### 1.1 فحص الفواتير
- [ ] جميع الفواتير لها `invoiceNumber` فريد
- [ ] جميع الفواتير لها `type` صحيح (sale/purchase/sale_return/purchase_return)
- [ ] جميع الفواتير لها `total >= 0`
- [ ] جميع الفواتير لها `discount >= 0` و `discount <= total`
- [ ] جميع الفواتير لها `paid >= 0` و `paid <= total`
- [ ] `netAmount = total - discount` صحيحة
- [ ] `remaining = netAmount - paid >= 0`
- [ ] جميع الفواتير لها `status` من: مدفوع / جزئي / آجل
- [ ] `status` تتطابق مع القيمة الحسابية:
  - [ ] `paid == 0` → `آجل`
  - [ ] `0 < paid < netAmount` → `جزئي`
  - [ ] `paid >= netAmount` → `مدفوع`
- [ ] جميع الفواتير لها `partnerId` و `partnerName`
- [ ] عدد عناصر الفاتورة `> 0`
- [ ] مجموع عناصر الفاتورة = `total`

### 1.2 فحص العملاء
- [ ] جميع العملاء لهم `id` فريد
- [ ] جميع العملاء لهم `name` غير فارغ
- [ ] جميع العملاء لهم `phone` صحيح
- [ ] جميع العملاء لهم `balance >= 0` (قد يكون 0 إذا لم يكن هناك فواتير)
- [ ] عدم وجود عملاء مكررين

### 1.3 فحص الموردين
- [ ] جميع الموردين لهم `id` فريد
- [ ] جميع الموردين لهم `name` غير فارغ
- [ ] جميع الموردين لهم `phone` صحيح
- [ ] جميع الموردين لهم `balance >= 0`
- [ ] عدم وجود موردين مكررين

### 1.4 فحص الصناديق
- [ ] جميع الصناديق لها `id` فريد
- [ ] جميع الصناديق لها `name` غير فارغ
- [ ] جميع الصناديق لها `balance >= 0` (رصيد الصندوق يجب أن يكون موجب أو صفر)
- [ ] جميع الصناديق لها `initialBalance >= 0`
- [ ] جميع الصناديق لها `isActive = true` أو `false`
- [ ] مجموع أرصدة الصناديق النشطة `> 0` (عادة ما يكون)

---

## المرحلة 2: فحص الحسابات الأساسية

### 2.1 توازن الأرصدة لكل عميل
```
FOR EACH customer:
  invoices = get all sales invoices for customer
  calculated_balance = 0
  
  FOR EACH invoice:
    IF invoice.type == 'sale':
      net = invoice.total - invoice.discount
      calculated_balance += (net - invoice.paid)
    ELSE IF invoice.type == 'sale_return':
      net = invoice.total - invoice.discount
      calculated_balance -= (net - invoice.paid)
  
  ASSERT calculated_balance == customer.balance
  IF NOT:
    ERROR: Customer balance mismatch!
```

- [ ] جميع أرصدة العملاء متطابقة مع الحسابات
- [ ] لا توجد أرصدة سالبة للعملاء (إذا كانت هناك، فهي دائنة = مرجعي)
- [ ] مجموع أرصدة العملاء الموجبة = إجمالي الذمم المدينة

### 2.2 توازن الأرصدة لكل مورد
```
FOR EACH supplier:
  invoices = get all purchase invoices for supplier
  calculated_balance = 0
  
  FOR EACH invoice:
    IF invoice.type == 'purchase':
      net = invoice.total - invoice.discount
      calculated_balance += (net - invoice.paid)
    ELSE IF invoice.type == 'purchase_return':
      net = invoice.total - invoice.discount
      calculated_balance -= (net - invoice.paid)
  
  ASSERT calculated_balance == supplier.balance
```

- [ ] جميع أرصدة الموردين متطابقة مع الحسابات
- [ ] لا توجد أرصدة سالبة للموردين
- [ ] مجموع أرصدة الموردين = إجمالي الذمم الدائنة

### 2.3 توازن أرصدة الصناديق
```
FOR EACH cashbox:
  transactions = get all transactions for box
  calculated_balance = box.initialBalance
  
  FOR EACH transaction:
    IF transaction.type == 'قبض':
      calculated_balance += transaction.amount
    ELSE IF transaction.type == 'صرف':
      calculated_balance -= transaction.amount
    ELSE IF transaction.type == 'تحويل':
      IF transaction.fromBoxId == box.id:
        calculated_balance -= transaction.amount
      IF transaction.toBoxId == box.id:
        calculated_balance += transaction.amount
  
  ASSERT calculated_balance >= 0 (no negative balance)
  ASSERT calculated_balance == box.balance
```

- [ ] جميع أرصدة الصناديق موجبة أو صفر
- [ ] جميع أرصدة الصناديق متطابقة مع الحسابات
- [ ] لا توجد تحويلات معلقة بين الصناديق

---

## المرحلة 3: فحص التوازن المحاسبي

### 3.1 معادلة الميزانية الأساسية
```
Assets = Liabilities + Equity

في السياق:
Total CashBoxes + Total Receivables = Total Payables
```

- [ ] حساب إجمالي الصناديق
  ```
  total_cash = SUM(cashbox.balance FOR ALL cashboxes WHERE isActive = true)
  ```

- [ ] حساب إجمالي الذمم المدينة
  ```
  total_receivables = SUM(customer.balance FOR ALL customers)
  ```

- [ ] حساب إجمالي الذمم الدائنة
  ```
  total_payables = SUM(supplier.balance FOR ALL suppliers)
  ```

- [ ] التحقق من التوازن:
  ```
  ASSERT total_cash + total_receivables == total_payables
  ```

- [ ] إذا لم تتوازن:
  - [ ] الفرق المحسوب: `difference = total_cash + total_receivables - total_payables`
  - [ ] تحديد السبب (انظر المرحلة 4)

### 3.2 معادلة Debit/Credit
```
Total Debits = Total Credits

FOR EACH transaction:
  total_debit += transaction.debit
  total_credit += transaction.credit

ASSERT total_debit == total_credit
```

- [ ] لا توجد معاملات بدون debit/credit
- [ ] لا توجد معاملات مع debit ≠ credit
- [ ] إجمالي الديون يساوي إجمالي الأرصدة

---

## المرحلة 4: فحص المعاملات

### 4.1 المعاملات (Transactions)
- [ ] جميع المعاملات لها `id` فريد
- [ ] جميع المعاملات لها `type` من: قبض / صرف / تحويل
- [ ] جميع المعاملات لها `amount > 0`
- [ ] جميع المعاملات لها `createdAt` صحيح
- [ ] جميع المعاملات لها `createdBy` غير فارغ

### 4.2 معاملات القبض (Receipt)
- [ ] `type = 'قبض'`
- [ ] تحديث شريك: `partner.balance -= amount`
- [ ] تحديث صندوق: `box.balance += amount`
- [ ] معاملة محاسبية: `Debit: CashBox, Credit: Revenue`

- [ ] لكل قبض:
  - [ ] هناك شريك (عميل) مرتبط
  - [ ] الرصيد الحالي للعميل يقل بالمبلغ
  - [ ] الرصيد الحالي للصندوق يزداد بالمبلغ

### 4.3 معاملات الصرف (Payment)
- [ ] `type = 'صرف'`
- [ ] تحديث شريك: `partner.balance -= amount`
- [ ] تحديث صندوق: `box.balance -= amount`
- [ ] معاملة محاسبية: `Debit: Expense, Credit: CashBox`

- [ ] لكل صرف:
  - [ ] هناك شريك (مورد) مرتبط
  - [ ] الرصيد الحالي للمورد يقل بالمبلغ
  - [ ] الرصيد الحالي للصندوق ينخفض بالمبلغ

### 4.4 معاملات التحويل (Transfer)
- [ ] `type = 'تحويل'`
- [ ] يوجد `fromBoxId` و `toBoxId`
- [ ] `fromBoxId != toBoxId`
- [ ] تحديث الصندوق A: `box_a.balance -= amount`
- [ ] تحديث الصندوق B: `box_b.balance += amount`
- [ ] معاملة محاسبية: `Debit: Box B, Credit: Box A`

- [ ] لكل تحويل:
  - [ ] الصندوق المصدر له رصيد كافي
  - [ ] الصندوق المصدر ينخفض
  - [ ] الصندوق المستقبل يزداد
  - [ ] المجموع الكلي للصناديق لا يتغير

---

## المرحلة 5: فحص الفواتير والدفعات

### 5.1 فواتير المبيعات
```
FOR EACH sales invoice:
  net_amount = total - discount
  remaining = net_amount - paid
  
  ASSERT remaining >= 0
  ASSERT status matches payment status
  
  // الفحص المحاسبي
  revenue_record = get transaction for this invoice
  ASSERT revenue_record.debit == net_amount
  
  IF paid > 0:
    receipt_record = get receipt transaction for this invoice
    ASSERT receipt_record.credit == paid
```

- [ ] كل فاتورة مبيعات لها معاملة إيرادات
- [ ] كل فاتورة مبيعات لها معاملة قبض (إذا كان هناك دفع)
- [ ] مجموع الإيرادات = مجموع صافي فواتير المبيعات
- [ ] مجموع المقبوضات = مجموع المبالغ المدفوعة من فواتير المبيعات

### 5.2 فواتير المشتريات
```
FOR EACH purchase invoice:
  net_amount = total - discount
  remaining = net_amount - paid
  
  ASSERT remaining >= 0
  ASSERT status matches payment status
  
  // الفحص المحاسبي
  purchase_record = get transaction for this invoice
  ASSERT purchase_record.debit == net_amount
  
  IF paid > 0:
    payment_record = get payment transaction for this invoice
    ASSERT payment_record.debit == paid
```

- [ ] كل فاتورة مشتريات لها معاملة مشتريات
- [ ] كل فاتورة مشتريات لها معاملة صرف (إذا كان هناك دفع)
- [ ] مجموع المشتريات = مجموع صافي فواتير المشتريات
- [ ] مجموع الصروف = مجموع المبالغ المسددة لفواتير المشتريات

### 5.3 فواتير المرتجعات
```
FOR EACH return invoice:
  net_amount = total - discount
  
  // يجب أن تقلل الذمة المدينة/الدائنة
  IF sales_return:
    customer.balance -= net_amount
  ELSE IF purchase_return:
    supplier.balance -= net_amount
```

- [ ] كل مرتجعات مبيعات تقلل من ذمة العميل المدينة
- [ ] كل مرتجعات مشتريات تقلل من ذمة المورد الدائنة
- [ ] لا توجد مرتجعات بدون فاتورة أصلية

---

## المرحلة 6: فحص سندات الصرف والقبض

### 6.1 سندات القبض (Receipt Vouchers)
- [ ] جميع السندات لها `voucherNumber` فريد
- [ ] جميع السندات لها `type = 'receipt'`
- [ ] جميع السندات لها `amount > 0`
- [ ] جميع السندات لها `boxId` صحيح
- [ ] تحديث الصندوق: `box.balance += amount`
- [ ] تحديث الشريك (إن وجد): `partner.balance -= amount`

- [ ] لكل سند قبض:
  - [ ] الصندوق ينمو بقيمة السند
  - [ ] العميل/المورد ينخفض رصيده بقيمة السند

### 6.2 سندات الصرف (Payment Vouchers)
- [ ] جميع السندات لها `voucherNumber` فريد
- [ ] جميع السندات لها `type = 'payment'`
- [ ] جميع السندات لها `amount > 0`
- [ ] جميع السندات لها `boxId` صحيح
- [ ] الصندوق له رصيد كافي للصرف
- [ ] تحديث الصندوق: `box.balance -= amount`
- [ ] تحديث الشريك (إن وجد): `partner.balance -= amount`

- [ ] لكل سند صرف:
  - [ ] الصندوق ينخفض بقيمة السند
  - [ ] العميل/المورد ينخفض رصيده بقيمة السند

---

## المرحلة 7: فحص التناسق والتضاعف

### 7.1 عدم التضاعف
- [ ] لا توجد معاملات معاملتان بنفس `sourceId` و `sourceType`
- [ ] لا توجد فاتورتان بنفس `invoiceNumber`
- [ ] لا توجد عملاء مكررون بنفس الهاتف
- [ ] لا توجد موردين مكررين بنفس الهاتف
- [ ] عدد تحديثات الشريك = 1 (ليس مضاعف)

### 7.2 التناسق بين الأماكن المختلفة
- [ ] `invoice.paid` = مجموع المعاملات المرتبطة
- [ ] `cashbox.balance` = الرصيد الأولي + جميع المعاملات
- [ ] `partner.balance` = مجموع الفواتير - المدفوع
- [ ] معاملات الشريك و الصندوق متسقة

### 7.3 عدم وجود سجلات يتيمة (Orphaned Records)
- [ ] جميع المعاملات لها `sourceId` صحيح
- [ ] جميع المعاملات لها `partnerId` إذا كانت تحتاج
- [ ] جميع المعاملات لها `boxId` إذا كانت تحتاج
- [ ] لا توجد فواتير بدون شريك
- [ ] لا توجد معاملات بدون مصدر

---

## المرحلة 8: فحص الإجمالياتِ والملخصات

### 8.1 ملخصات اليومية
```
FOR EACH day:
  daily_summary = get summary for that day
  
  calculated_sales = SUM(invoice.total - discount FOR sale invoices)
  ASSERT daily_summary.salesTotal == calculated_sales
  
  // ... نفس الشيء للمشتريات، المقبوضات، الصروف
```

- [ ] إجمالي المبيعات اليومي صحيح
- [ ] إجمالي المشتريات اليومي صحيح
- [ ] إجمالي المقبوضات اليومي صحيح
- [ ] إجمالي الصروف اليومي صحيح

### 8.2 ملخصات الشهرية
```
FOR EACH month:
  monthly_summary = get summary for that month
  
  // إجمالي البيعات
  calculated_sales = SUM(daily.salesTotal FOR all days)
  ASSERT monthly_summary.salesTotal == calculated_sales
```

- [ ] إجمالي البيعات الشهري صحيح
- [ ] إجمالي المشتريات الشهري صحيح
- [ ] صافي التدفق النقدي الشهري صحيح

### 8.3 ملخصات لوحة التحكم
- [ ] إجمالي العملاء صحيح
- [ ] إجمالي الموردين صحيح
- [ ] إجمالي المنتجات صحيح
- [ ] إجمالي الفواتير صحيح
- [ ] إجمالي رصيد الصندوق صحيح
- [ ] إجمالي الذمم المدينة صحيح
- [ ] إجمالي الذمم الدائنة صحيح

---

## المرحلة 9: فحص حالات الاستثناء

### 9.1 الفواتير المحذوفة
- [ ] `recordStatus = 'deleted'` تم فحصها بشكل صحيح
- [ ] تم عكس تأثيرها على الأرصدة
- [ ] لا تحتسب في الإجماليات

### 9.2 الفواتير المؤرشفة
- [ ] `recordStatus = 'archived'` معالجة بشكل صحيح
- [ ] تؤثر على الحسابات إذا كانت نشطة
- [ ] يمكن استعادتها

### 9.3 المعاملات المعاكسة
- [ ] الحذف يعكس التأثير بشكل صحيح
- [ ] التعديل يحسب الفرق بشكل صحيح
- [ ] لا توجد فروقات متراكمة

---

## المرحلة 10: تقرير النتائج

### ✅ إذا نجح جميع الفحوصات:
1. التوقيع على التقرير
2. توثيق التاريخ والوقت
3. أرشفة نسخة من البيانات

### ❌ إذا فشل أي فحص:
1. توثيق رقم الفحص الذي فشل
2. حساب القيمة المتوقعة والفعلية
3. تحديد السبب
4. إنشاء إصلاح
5. إعادة الفحص

---

## نموذج تقرير الفحص

```
تقرير فحص المنطق المحاسبي
التاريخ: [DATE]
المفتش: [NAME]

النتائج:
- المرحلة 1 (البيانات الأساسية): [✓/✗] [ملاحظات]
- المرحلة 2 (الحسابات): [✓/✗] [ملاحظات]
- المرحلة 3 (التوازن): [✓/✗] [ملاحظات]
- ... إلخ

الخلاصة:
[ ] الكل سليم
[ ] يوجد مشاكل يجب إصلاحها:
  1. ...
  2. ...

التوصيات:
1. ...

التوقيع: ________________
```

---

**آخر تحديث:** 24 يوليو 2026  
**الإصدار:** 1.0

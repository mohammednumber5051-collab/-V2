export enum OperationType {
    CREATE = 'create',
    UPDATE = 'update',
    DELETE = 'delete',
    LIST = 'list',
    GET = 'get',
    WRITE = 'write',
}

export interface AggregationImpact {
    salesTotal?: number;
    purchasesTotal?: number;
    receiptsTotal?: number;
    paymentsTotal?: number;
    expensesTotal?: number;
    profitsTotal?: number;
    receivablesChange?: number;
    payablesChange?: number;
    cashBalanceChange?: number;
    transactionCount?: number;
}

export type EntityType = 'sale' | 'purchase' | 'sale_return' | 'purchase_return';
export type TransactionType = 'قبض' | 'صرف';
export type InvoiceStatus = 'مدفوع' | 'جزئي' | 'آجل';
export type Currency = 'YER' | 'SAR' | 'USD';
export type PaymentType = 'نقدآ' | 'آجل' | 'نقد_آجل' | 'مجاني';

// Enterprise Soft Delete Status Wrapper
export type RecordStatus = 'active' | 'archived' | 'deleted';

// Optical-Specific Categories
export type Category = 
    | 'إطارات نظارات' 
    | 'عدسات طبية' 
    | 'نظارات شمسية' 
    | 'عدسات لاصقة' 
    | 'إكسسوارات' 
    | 'مستلزمات طبية' 
    | 'قطع غيار' 
    | 'مواد تنظيف العدسات'
    | 'إطارات' // backward compatibility
    | 'عدسات' // backward compatibility
    | 'أخرى';

export type RoleLevel = 'SUPER_ADMIN' | 'ADMIN' | 'ACCOUNTANT' | 'CASHIER' | 'EMPLOYEE' | 'VIEWER';

export interface AppUser {
    id?: string;
    username: string; // Internal system username
    name: string; // Full name
    email?: string;
    phone?: string;
    passwordHash?: string; 
    avatar?: string;
    isActive?: boolean;
    role: RoleLevel;
    permissions: string[]; // List of granular permissions or pages
    sessionVersion?: number; // Used to invalidate sessions
    sessionSecret?: string; // Additional integrity check
    assignedBoxId?: string; // Enforced CashBox for this user
    lastLoginAt?: string;
    lastLogoutAt?: string;
    lastActivityAt?: string;
    deviceInfo?: string;
    sessionTimeoutMins?: number;
    recordStatus?: RecordStatus;
    createdBy?: string;
    createdAt: string;
    updatedAt?: string;
}

export interface SecuritySession {
    userId: string;
    userName: string;
    role: RoleLevel;
    sessionVersion: number;
    createdAt: number;
    expiresAt: number;
    lastActivity: number;
    deviceId: string;
}

export interface AuditLog {
    id?: string;
    userId: string;
    userName: string;
    action: 'CREATE' | 'UPDATE' | 'DELETE' | 'LOGIN' | 'LOGOUT' | 'ARCHIVE' | 'RESTORE' | 'APPROVE' | 'EXPORT' | 'SETTINGS_CHANGE';
    entityType: 'Invoice' | 'Product' | 'Customer' | 'Supplier' | 'CashBox' | 'Transaction' | 'User' | 'System';
    entityId?: string;
    description: string;
    oldValue?: any;
    newValue?: any;
    
    // Detailed audit fields
    originalCreatedAt?: string;
    originalCreatedBy?: string;
    cashBoxBalanceBefore?: number;
    cashBoxBalanceAfter?: number;
    
    deviceInfo?: string;
    createdAt: string;
    updatedAt?: string;
}

export interface BackupRecord {
    id?: string;
    fileName: string;
    createdBy: string;
    sizeBytes: number;
    status: 'completed' | 'failed' | 'in_progress';
    createdAt: string;
}

// Optical Characteristics interface
export interface OpticalAttributes {
    // Shared / Frames / Sunglasses
    brand?: string;
    frameType?: string; // Full Rim, Semi-Rim, Rimless, Nylor
    material?: string; // plastic, acetate, metal, titanium, wood
    color?: string;
    size?: string;
    gender?: 'رجالي' | 'نسائي' | 'ولادي/بناتي' | 'للجنسين';
    shape?: string; // Aviator, Round, Square, Rectangle, Cat-eye, etc.
    supplier?: string;
    warrantyPeriod?: string; // e.g. "6 أشهر", "سنة واحدة"
    
    // Lenses
    lensType?: string; // Single Vision, Bifocal, Progressive
    lensMaterial?: string; // Cr39, Polycarbonate, High Index
    coatingType?: string; // Hard coat, Anti-reflective, Blue cut, Photochromic
    lensIndex?: string; // 1.56, 1.61, 1.67, 1.74
    uvProtection?: boolean;
    blueCut?: boolean;
    progressiveSingleVision?: 'Single Vision' | 'Progressive' | 'Bifocal';

    // Contact Lenses & General Expiry
    expiryDate?: string; // YYYY-MM-DD
    contactUsageType?: 'يومي' | 'شهري' | 'سنوي';
}

export interface Product {
    id?: string;
    name: string;
    sku: string;
    category: Category;
    purchasePrice: number;
    salePrice: number;
    stock: number;
    minStock: number;
    opticalAttributes?: OpticalAttributes; // Optional custom attributes
    recordStatus?: RecordStatus;
    updatedAt: string;
}

export interface OpticalCustomerProfileData {
    preferredFrameType?: string;
    preferredBrand?: string;
    customerNotes?: string;
    lastPurchaseDate?: string;
    purchaseFrequency?: string; // active, occasional, etc.
}

export interface Customer {
    id?: string;
    name: string;
    phone: string;
    address: string;
    balance: number;
    opticalProfile?: OpticalCustomerProfileData; // Added for optical-friendly patient notes
    recordStatus?: RecordStatus;
    createdAt?: string;
    updatedAt: string;
}

export interface Supplier {
    id?: string;
    name: string;
    phone: string;
    address: string;
    balance: number;
    recordStatus?: RecordStatus;
    createdAt?: string;
    updatedAt: string;
}

export interface OpticalPrescriptionLens {
    distance?: { sph?: string; cyl?: string; ax?: string };
    near?: { sph?: string; cyl?: string; ax?: string };
}

export interface OpticalPrescription {
    rightEye?: OpticalPrescriptionLens;
    leftEye?: OpticalPrescriptionLens;
    ipd?: string;
    lensType?: string;
    frameType?: string;
}

export interface InvoiceItem {
    productId: string;
    productName: string;
    quantity: number;
    price: number;
    purchasePrice: number; // For COGS calculations
    total: number;
}

export interface Invoice {
    id?: string;
    invoiceNumber?: string;
    type: EntityType;
    partnerId: string;
    partnerName: string;
    items: InvoiceItem[];
    total: number;
    paid: number;
    discount: number;
    status: InvoiceStatus;
    paymentType: PaymentType;
    referenceNumber: string;
    notes: string;
    currency: Currency;
    boxId?: string; // Optional cashBox id
    lifecycleStatus?: 'مسودة' | 'قيد المراجعة' | 'معتمد';
    approvedAt?: string;
    approvedBy?: string;
    dueDate?: string | null;
    attachmentUrl?: string;
    autoCreatePartner?: boolean;
    opticalPrescription?: OpticalPrescription;
    isReturn?: boolean;
    originalInvoiceId?: string;
    originalInvoiceNumber?: string;
    recordStatus?: RecordStatus;
    createdAt: string;
    updatedAt?: string;
}

export interface CashBox {
    id?: string;
    name: string;
    balance: number;
    initialBalance?: number;
    currency: Currency;
    userId: string; // Linked user
    userName: string;
    isActive: boolean;
    recordStatus?: RecordStatus;
    createdAt: string;
}

export type TransactionSourceType = 
    | 'sales_invoice' 
    | 'purchase_invoice' 
    | 'quick_financial_entry' 
    | 'manual_receipt' 
    | 'manual_payment' 
    | 'adjustment' 
    | 'transfer';

export interface Transaction {
    id?: string;
    type: TransactionType | 'تحويل'; // 'قبض' | 'صرف' | 'تحويل'
    sourceType: TransactionSourceType;
    sourceId: string; // The ID of the document (Invoice ID, Quick Entry ID, etc)
    amount: number;
    currency: Currency;
    description: string;
    notes?: string;
    boxId?: string; // Same as cashBoxId
    fromBoxId?: string;
    toBoxId?: string;
    partnerId?: string;
    partnerName?: string;
    debit: number; 
    credit: number;
    costAmount?: number; // Added for profit calculation from transactions (Revenue - Cost)
    recordStatus?: RecordStatus;
    createdBy: string; // User name
    accountantUserId?: string;
    createdAt: string;
    updatedAt?: string;
}

// Warranty entity
export interface Warranty {
    id?: string;
    invoiceId: string;
    customerId: string;
    customerName: string;
    productId: string;
    productName: string;
    startDate: string;
    endDate: string;
    status: 'نشط' | 'منتهي' | 'مستبدل' | 'ملغي';
    caseType?: 'كسر إطار' | 'مشكلة بالعدسة' | 'عيب مصنعي' | 'استبدال' | 'أخرى';
    notes?: string;
    history?: { date: string; action: string; notes?: string }[];
    createdAt: string;
    updatedAt: string;
}

// Repair Job entity
export interface RepairJob {
    id?: string;
    customerId: string;
    customerName: string;
    phone: string;
    repairCase: 'تعديل الإطار' | 'استبدال عدسات' | 'إصلاح كسر الإطار' | 'استبدال برغي' | 'استبدال وسادات الأنف' | 'أخرى';
    cost: number;
    status: 'تم الاستلام' | 'قيد العمل' | 'جاهز' | 'تم التسليم';
    notes?: string;
    createdAt: string;
    updatedAt: string;
}

// Special Order entity
export interface SpecialOrder {
    id?: string;
    customerId: string;
    customerName: string;
    phone: string;
    invoiceId?: string; // if linked to an invoice
    orderDetails: string; // details of the order
    orderType: 'عدسات مفصلة' | 'طلب إطار خاص' | 'نظارة مستوردة' | 'أخرى';
    status: 'تم الطلب' | 'بانتظار المورد' | 'تم الاستلام في المحل' | 'جاهز للعميل' | 'تم التسليم للعميل';
    expectedDeliveryDate: string; // YYYY-MM-DD
    createdAt: string;
    updatedAt: string;
}

export interface FinancialMovement {
    id: string;
    originalId: string;
    source: 'invoice' | 'voucher' | 'quickEntry' | 'transaction';
    recordType: string;
    paymentType: string;
    partnerName: string;
    totalAmount: number;
    discount: number;
    paidAmount: number;
    remainingAmount: number;
    boxName: string;
    boxChanges?: Record<string, number>;
    createdBy: string;
    createdAt: string;
    dateObj: Date;
    originalRecord: any;
}

export type QuickEntryType = 'manual_sale' | 'manual_purchase' | 'receipt' | 'payment' | 'adjustment';

export interface QuickFinancialEntry {
    id?: string;
    entryType: QuickEntryType;
    partnerType: 'customer' | 'supplier' | 'none';
    partnerId?: string;
    partnerName: string;
    partnerPhone?: string;
    amount: number;
    discount: number;
    netAmount: number;
    paidAmount: number;
    remainingAmount: number;
    paymentStatus: InvoiceStatus;
    cashBoxId?: string;
    cashBoxName?: string;
    notes: string;
    currency: Currency;
    referenceNumber: string;
    voucherNumber?: number; // New auto-generated field
    printCount: number;
    opticalPrescription?: OpticalPrescription;
    autoCreatePartner?: boolean;
    createdAt: string;
    updatedAt: string;
    createdBy: string;
    recordStatus?: RecordStatus;
}

// Aggregation Engine Entities
export interface DailyFinancialSummary {
    id: string; // date YYYY-MM-DD
    date: string;
    salesTotal: number;
    purchasesTotal: number;
    receiptsTotal: number;
    paymentsTotal: number;
    expensesTotal: number;
    profitsTotal: number;
    receivablesTotal: number;
    payablesTotal: number;
    transactionCount: number;
    updatedAt: string;
}

export interface Voucher {
    id?: string;
    voucherNumber: number;
    referenceNumber?: string;
    type: 'receipt' | 'payment';
    partnerId: string;
    partnerName: string;
    partnerType?: 'customer' | 'supplier' | 'none';
    amount: number;
    currency: Currency;
    boxId: string;
    boxName: string;
    notes?: string;
    createdBy?: string;
    updatedBy?: string;
    createdAt: string;
    updatedAt: string;
    recordStatus?: RecordStatus;
}

export interface MonthlyFinancialSummary {
    id: string; // month YYYY-MM
    month: string;
    salesTotal: number;
    purchasesTotal: number;
    profitsTotal: number;
    expensesTotal: number;
    netCashFlow: number;
    updatedAt: string;
}

export interface DashboardCache {
    id: string; // 'global'
    totalCustomers: number;
    totalSuppliers: number;
    totalProducts: number;
    totalInvoices: number;
    totalQuickEntries: number;
    totalCashBoxes: number;
    totalCashBalance: number;
    totalReceivables: number;
    totalPayables: number;
    todaySales: number;
    monthSales: number;
    lowStockCount: number;
    repairQueueCount: number;
    specialOrdersReadyCount: number;
    activeWarrantiesCount: number;
    updatedAt: string;
}

// Global System Settings entity (Singleton)
export interface StoreSettings {
    id: string; // 'main_settings'
    // Business Info
    storeNameAr: string;
    storeNameEn?: string;
    logoUrl?: string;
    phone: string;
    whatsapp: string;
    landline?: string;
    email?: string;
    address: string;
    googleMapsLink?: string;
    commercialReg?: string;
    taxNumber?: string;
    
    // Print Header settings
    printLogo: boolean;
    printStoreName: boolean;
    printPhone: boolean;
    printAddress: boolean;
    printWhatsapp: boolean;
    printQR: boolean;
    printFooterText: string;
    
    // Print Design & Config
    defaultPrintSize: 'A4' | 'A3' | 'Thermal 58mm' | 'Thermal 80mm' | 'PDF';
    
    // Layout
    language: 'ar' | 'en' | 'bilingual';
    
    // Theme Prefs
    defaultTheme: 'light' | 'dark' | 'system';
    primaryColor: string;
    accentColor: string;
    
    updatedAt: string;
}

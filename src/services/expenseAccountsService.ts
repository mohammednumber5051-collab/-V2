import { dbService } from "./db";
import { ExpenseAccount } from "../types";

export const DEFAULT_EXPENSE_ACCOUNTS: Omit<ExpenseAccount, 'id'>[] = [
    // 5100: Operating Expenses (مصروفات تشغيلية)
    {
        code: "5100",
        name: "مصروفات تشغيلية",
        parentId: null,
        parentName: undefined,
        type: "parent",
        description: "كافة المصروفات المرتبطة بتشغيل وصيانة ورشة ومعرض البصريات",
        isActive: true,
        recordStatus: "active"
    },
    {
        code: "5101",
        name: "صيانة أجهزة ومعدات ورشة النظارات",
        parentId: "5100",
        parentName: "مصروفات تشغيلية",
        type: "sub",
        description: "مصاريف إعادة معايرة وصيانة أجهزة قص وتلميع العدسات والفحص",
        isActive: true,
        recordStatus: "active"
    },
    {
        code: "5102",
        name: "مستلزمات طبية وبصرية استهلاكية",
        parentId: "5100",
        parentName: "مصروفات تشغيلية",
        type: "sub",
        description: "محلول تعقيم، بوفيه الفحص، زيوت آلات، فوط تنظيف وسوائل",
        isActive: true,
        recordStatus: "active"
    },
    {
        code: "5103",
        name: "شحن ونقل وتخليص بضائع",
        parentId: "5100",
        parentName: "مصروفات تشغيلية",
        type: "sub",
        description: "تكاليف توصيل الإطارات والعدسات من الموردين والشحن السريع",
        isActive: true,
        recordStatus: "active"
    },
    {
        code: "5104",
        name: "عمولات ومصارف بيع وتسليم",
        parentId: "5100",
        parentName: "مصروفات تشغيلية",
        type: "sub",
        description: "عمولات مندوبي التوصيل ومصروفات تحصيل المبيعات",
        isActive: true,
        recordStatus: "active"
    },

    // 5200: Administrative & General Expenses (مصروفات إدارية وعمومية)
    {
        code: "5200",
        name: "مصروفات إدارية وعمومية",
        parentId: null,
        parentName: undefined,
        type: "parent",
        description: "المصروفات الإدارية التشغيلية اليومية والمشتركة",
        isActive: true,
        recordStatus: "active"
    },
    {
        code: "5201",
        name: "إيجار المقر والورشة",
        parentId: "5200",
        parentName: "مصروفات إدارية وعمومية",
        type: "sub",
        description: "الإيجارات الدورية لمركز البصريات أو المستودع",
        isActive: true,
        recordStatus: "active"
    },
    {
        code: "5202",
        name: "كهرباء وماء وطاقة",
        parentId: "5200",
        parentName: "مصروفات إدارية وعمومية",
        type: "sub",
        description: "فواتير الكهرباء، المياه، والمولدات الاحتياطية",
        isActive: true,
        recordStatus: "active"
    },
    {
        code: "5203",
        name: "اتصالات وإنترنت وشبكات",
        parentId: "5200",
        parentName: "مصروفات إدارية وعمومية",
        type: "sub",
        description: "اشتراكات الإنترنت، خطوط الهاتف، والرسائل النصية",
        isActive: true,
        recordStatus: "active"
    },
    {
        code: "5204",
        name: "أدوات ومطبوعات مكتبية ورسائل",
        parentId: "5200",
        parentName: "مصروفات إدارية وعمومية",
        type: "sub",
        description: "أوراق طباعة الفواتير، حافظات النظارات، أدوات كتابية",
        isActive: true,
        recordStatus: "active"
    },
    {
        code: "5205",
        name: "رواتب وأجور حوافز موظفين",
        parentId: "5200",
        parentName: "مصروفات إدارية وعمومية",
        type: "sub",
        description: "رواتب الكادر، الفنيين، والحوافز والمكافآت التشجيعية",
        isActive: true,
        recordStatus: "active"
    },
    {
        code: "5206",
        name: "ضيافة ونظافة وبوفيه",
        parentId: "5200",
        parentName: "مصروفات إدارية وعمومية",
        type: "sub",
        description: "مستلزمات الضيافة للعملاء ومواد النظافة العامة",
        isActive: true,
        recordStatus: "active"
    },

    // 5300: Marketing & Advertising (مصروفات التسويق والدعاية)
    {
        code: "5300",
        name: "مصروفات التسويق والدعاية",
        parentId: null,
        parentName: undefined,
        type: "parent",
        description: "حملات الدعاية والإعلان والترويج لمركز البصريات",
        isActive: true,
        recordStatus: "active"
    },
    {
        code: "5301",
        name: "حملات إعلانية وتواصل الاجتماعي",
        parentId: "5300",
        parentName: "مصروفات التسويق والدعاية",
        type: "sub",
        description: "إعلانات ممولة، ترويج صفحات التواصل، ورسائل العروض",
        isActive: true,
        recordStatus: "active"
    },
    {
        code: "5302",
        name: "هدايا دعاية ولافتات إرشادية",
        parentId: "5300",
        parentName: "مصروفات التسويق والدعاية",
        type: "sub",
        description: "تصاميم اليافطات، أكياس القماش المطبوعة، كروت الخصم",
        isActive: true,
        recordStatus: "active"
    },

    // 5900: Miscellaneous & Contingency Expenses (مصروفات عمومية وطارئة)
    {
        code: "5900",
        name: "مصروفات عمومية وطارئة",
        parentId: null,
        parentName: undefined,
        type: "parent",
        description: "المصروفات النثرية والطارئة والرسوم الرسمية",
        isActive: true,
        recordStatus: "active"
    },
    {
        code: "5901",
        name: "رسوم حكومية وتراخيص تجارية",
        parentId: "5900",
        parentName: "مصروفات عمومية وطارئة",
        type: "sub",
        description: "رسوم السجل التجاري، التراخيص الصحية، واللوحات",
        isActive: true,
        recordStatus: "active"
    },
    {
        code: "5902",
        name: "مصاريف طارئة ونثرية متفرقة",
        parentId: "5900",
        parentName: "مصروفات عمومية وطارئة",
        type: "sub",
        description: "أي مصروفات نثرية غير مصنفة تحت البنود السابقة",
        isActive: true,
        recordStatus: "active"
    }
];

let seedingPromise: Promise<ExpenseAccount[]> | null = null;

export const expenseAccountsService = {
    /**
     * Deduplicates accounts in DB if duplicate codes exist.
     * Keeps the first record for each unique code and marks duplicates as deleted.
     */
    async deduplicateAccounts(accounts: ExpenseAccount[]): Promise<ExpenseAccount[]> {
        const seenCodes = new Set<string>();
        const uniqueAccounts: ExpenseAccount[] = [];
        const duplicatesToDelete: ExpenseAccount[] = [];

        // First pass: identify unique and duplicates
        for (const acc of accounts) {
            if (!acc.code) continue;
            if (seenCodes.has(acc.code)) {
                duplicatesToDelete.push(acc);
            } else {
                seenCodes.add(acc.code);
                uniqueAccounts.push(acc);
            }
        }

        // Clean up duplicates from DB silently
        if (duplicatesToDelete.length > 0) {
            console.log(`[expenseAccountsService] Found ${duplicatesToDelete.length} duplicate expense accounts. Cleaning up...`);
            for (const dup of duplicatesToDelete) {
                if (dup.id) {
                    try {
                        await dbService.update("expense_accounts", dup.id, { recordStatus: 'deleted' });
                    } catch (e) {
                        console.error("Failed to soft-delete duplicate account", dup.id, e);
                    }
                }
            }

            // Fix parentId links for sub accounts to point to retained parent accounts
            const parentMap: Record<string, string> = {};
            uniqueAccounts.filter(a => a.type === 'parent' && a.id).forEach(p => {
                parentMap[p.code] = p.id!;
            });

            for (const sub of uniqueAccounts) {
                if (sub.type === 'sub' && sub.code && sub.id) {
                    const parentCode = sub.code.substring(0, 2) + "00"; // e.g. 5101 -> 5100
                    const correctParentId = parentMap[parentCode];
                    if (correctParentId && sub.parentId !== correctParentId) {
                        sub.parentId = correctParentId;
                        try {
                            await dbService.update("expense_accounts", sub.id, { parentId: correctParentId });
                        } catch (e) {
                            console.error("Failed to update parentId link", e);
                        }
                    }
                }
            }
        }

        return uniqueAccounts;
    },

    /**
     * Seeds default expense accounts into the database if none exist.
     * Guaranteed safe and idempotent.
     */
    async ensureDefaultAccountsExist(): Promise<ExpenseAccount[]> {
        if (seedingPromise) {
            return seedingPromise;
        }

        seedingPromise = (async () => {
            try {
                const existing = await dbService.getAll("expense_accounts");
                const activeAccounts = existing.filter((a: any) => a.recordStatus !== 'deleted') as ExpenseAccount[];
                
                if (activeAccounts.length > 0) {
                    return await this.deduplicateAccounts(activeAccounts);
                }

                console.log("[expenseAccountsService] Seeding initial standard Chart of Expense Accounts...");
                
                // Map parent codes to generated Firestore IDs
                const parentCodeToIdMap: Record<string, string> = {};

                // 1. Add Parent Accounts first
                const parents = DEFAULT_EXPENSE_ACCOUNTS.filter(a => a.type === 'parent');
                for (const parent of parents) {
                    const parentId = await dbService.add("expense_accounts", {
                        ...parent,
                        createdAt: new Date().toISOString()
                    });
                    parentCodeToIdMap[parent.code] = parentId;
                }

                // 2. Add Sub Accounts linked to their parent IDs
                const subs = DEFAULT_EXPENSE_ACCOUNTS.filter(a => a.type === 'sub');
                for (const sub of subs) {
                    const parentCode = sub.parentId; // temporary code holding parent e.g. "5100"
                    const realParentId = parentCode ? parentCodeToIdMap[parentCode] : null;
                    
                    await dbService.add("expense_accounts", {
                        ...sub,
                        parentId: realParentId,
                        createdAt: new Date().toISOString()
                    });
                }

                const freshDocs = await dbService.getAll("expense_accounts");
                const active = freshDocs.filter((a: any) => a.recordStatus !== 'deleted') as ExpenseAccount[];
                return await this.deduplicateAccounts(active);
            } catch (error) {
                console.error("[expenseAccountsService] Error ensuring default expense accounts:", error);
                return [];
            } finally {
                seedingPromise = null;
            }
        })();

        return seedingPromise;
    },

    /**
     * Fetch all active expense accounts
     */
    async getAllAccounts(): Promise<ExpenseAccount[]> {
        try {
            const docs = await dbService.getAll("expense_accounts");
            const active = docs.filter((a: any) => a.recordStatus !== 'deleted') as ExpenseAccount[];
            if (active.length === 0) {
                return await this.ensureDefaultAccountsExist();
            }
            return await this.deduplicateAccounts(active);
        } catch (e) {
            console.error("[expenseAccountsService] Failed to load expense accounts:", e);
            return [];
        }
    }
};

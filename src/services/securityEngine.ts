import { RoleLevel } from "../types";

export interface PermissionSchema {
    [role: string]: string[];
}

const MODULE_PERMISSIONS: PermissionSchema = {
    'SUPER_ADMIN': ['*'],
    'ADMIN': [
        'inventory.read', 'inventory.write',
        'customers.read', 'customers.write',
        'suppliers.read', 'suppliers.write',
        'invoices.read', 'invoices.write',
        'transactions.read', 'transactions.write',
        'reports.view',
        'settings.read', 'settings.write'
    ],
    'ACCOUNTANT': [
        'invoices.read', 'invoices.write',
        'transactions.read', 'transactions.write',
        'reports.view',
        'customers.read',
        'suppliers.read'
    ],
    'CASHIER': [
        'sales.create',
        'receipts.create',
        'inventory.read',
        'customers.read',
        'customers.write'
    ],
    'EMPLOYEE': [
        'repairs.all',
        'special_orders.all',
        'warranties.all'
    ],
    'VIEWER': [
        'dashboard.view',
        'reports.view'
    ]
};

export class SecurityEngine {
    static can(role: RoleLevel | string, action: string): boolean {
        const normalizedRole = (role || "").toString().toUpperCase().replace(/\s+/g, '_');
        if (normalizedRole === 'SUPER_ADMIN') return true;
        
        const permissions = MODULE_PERMISSIONS[normalizedRole] || MODULE_PERMISSIONS[role] || [];
        
        // Simple check
        if (permissions.includes('*')) return true;
        if (permissions.includes(action)) return true;
        
        // Wildcard check e.g. inventory.*
        const parts = action.split('.');
        if (parts.length > 1) {
            const wildcard = `${parts[0]}.*`;
            const allAllowed = `${parts[0]}.all`;
            if (permissions.includes(wildcard) || permissions.includes(allAllowed)) return true;
        }
        
        return false;
    }

    static validateRoleAccess(role: RoleLevel | string, collectionName: string, operation: 'read' | 'write' | 'delete'): boolean {
        const normalizedRole = (role || "").toString().toUpperCase().replace(/\s+/g, '_');
        if (normalizedRole === 'SUPER_ADMIN') return true;

        const map: {[key: string]: string} = {
            'users': 'admin.users',
            'settings': 'admin.settings',
            'auditLogs': 'admin.logs',
            'products': 'inventory',
            'invoices': 'invoices',
            'transactions': 'transactions',
            'customers': 'customers',
            'suppliers': 'suppliers',
            'repairs': 'repairs',
            'special_orders': 'special_orders',
            'warranties': 'warranties'
        };

        const module = map[collectionName];
        if (!module) return true; // generic or unknown

        const action = `${module}.${operation === 'read' ? 'read' : 'write'}`;
        return this.can(role, action);
    }
}

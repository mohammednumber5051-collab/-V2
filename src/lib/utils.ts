import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { AppUser } from "../types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function cleanData(obj: any): any {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(cleanData);
  return Object.fromEntries(
    Object.entries(obj)
      .filter(([_, v]) => v !== undefined)
      .map(([k, v]) => [k, cleanData(v)])
  );
}

export function hasPermission(user: AppUser | null | undefined, permissionId: string): boolean {
  if (!user) {
    // If user structure is not yet loaded in state, allow viewing basic operations by default if logged in
    const localUserStr = typeof window !== 'undefined' ? localStorage.getItem("app_user") : null;
    if (localUserStr) {
      try {
        const parsed = JSON.parse(localUserStr);
        if (parsed) user = parsed;
      } catch (e) {}
    }
  }
  
  if (!user) return false;
  if (user.isActive === false) return false;
  
  let normalizedRole = (user.role || '').toUpperCase().trim();
  
  // Normalize Arabic and alternative roles to standard keys
  if (normalizedRole === "مدير النظام" || normalizedRole === "مدير" || normalizedRole === "MANAGER" || normalizedRole === "ADMIN") {
    normalizedRole = "ADMIN";
  } else if (normalizedRole === "محاسب" || normalizedRole === "محاسب عام" || normalizedRole === "ACCOUNT" || normalizedRole === "ACCOUNTANT") {
    normalizedRole = "ACCOUNTANT";
  } else if (normalizedRole === "كاشير" || normalizedRole === "بائع" || normalizedRole === "CASH" || normalizedRole === "CASHIER") {
    normalizedRole = "CASHIER";
  } else if (normalizedRole === "موظف" || normalizedRole === "EMPLOYEE" || normalizedRole === "ورشة" || normalizedRole === "صيانة") {
    normalizedRole = "EMPLOYEE";
  } else if (normalizedRole === "مراقب" || normalizedRole === "عرض فقط" || normalizedRole === "VIEW" || normalizedRole === "VIEWER") {
    normalizedRole = "VIEWER";
  } else if (
    normalizedRole === "SUPER_ADMIN" || 
    normalizedRole === "SUPER ADMIN" || 
    normalizedRole === "OWNER" || 
    normalizedRole === "مالك" || 
    normalizedRole === "المدير العام" || 
    normalizedRole === "OWNER / GENERAL MANAGER" || 
    normalizedRole === "OWNER / GENERAL MANAGER".toUpperCase() ||
    normalizedRole.includes("SUPER_ADMIN") ||
    normalizedRole.includes("SUPER") ||
    normalizedRole.includes("OWNER")
  ) {
    normalizedRole = "SUPER_ADMIN";
  }
  
  if (normalizedRole === "SUPER_ADMIN" || (user.permissions && (user.permissions.includes('*') || user.permissions.includes('all')))) {
    return true;
  }
  
  // Backward compatibility: map old permission IDs to granular ones
  const isAuthorized = (pid: string) => {
    if (user.permissions.includes(pid)) return true;
    if (pid === 'edit_inventory' && (user.permissions.includes('add_inventory') || user.permissions.includes('delete_inventory'))) return true;
    if (pid === 'transactions' && (user.permissions.includes('add_transaction') || user.permissions.includes('edit_transaction') || user.permissions.includes('delete_transaction'))) return true;
    if (pid === 'vouchers' && (user.permissions.includes('add_vouchers') || user.permissions.includes('edit_vouchers') || user.permissions.includes('delete_vouchers') || user.permissions.includes('add_transaction') || user.permissions.includes('edit_transaction') || user.permissions.includes('delete_transaction') || user.permissions.includes('transactions'))) return true;
    return false;
  };

  // Custom handling for global_edit and global_delete to allow granular admin control
  if (permissionId === 'global_edit' || permissionId === 'global_delete') {
    if (user.permissions && user.permissions.length > 0) {
      return user.permissions.includes(permissionId);
    }
    const defaultEditRoles = ['SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT', 'CASHIER'];
    const defaultDeleteRoles = ['SUPER_ADMIN', 'ADMIN'];
    if (permissionId === 'global_edit') {
      return defaultEditRoles.includes(normalizedRole);
    } else {
      return defaultDeleteRoles.includes(normalizedRole);
    }
  }

  // Check granular permissions with backward compatibility
  if (user.permissions && (isAuthorized(permissionId) || (permissionId === 'global_edit' && user.permissions.includes('edit_invoices')))) {
    return true;
  }
  
  // Specifically check for backward compatibility with global_edit/delete
  if (permissionId === 'edit_invoices' && user.permissions.includes('global_edit')) return true;
  if (permissionId === 'delete_invoices' && user.permissions.includes('global_delete')) return true;
  if (permissionId === 'edit_inventory' && user.permissions.includes('global_edit')) return true;
  if (permissionId === 'delete_inventory' && user.permissions.includes('global_delete')) return true;
  if (permissionId === 'edit_transaction' && user.permissions.includes('global_edit')) return true;
  if (permissionId === 'delete_transaction' && user.permissions.includes('global_delete')) return true;

  // Role defaults mapping
  const rolePermissions: Record<string, string[]> = {
    'SUPER_ADMIN': ['*'],
    'ADMIN': ['dashboard', 'invoices', 'add_invoices', 'inventory', 'edit_inventory', 'reports', 'transactions', 'vouchers', 'cash_boxes', 'partners', 'quick_entry', 'daily_ledger', 'optical_hub', 'users', 'audit_logs', 'settings', 'quick_entries_history'],
    'ACCOUNTANT': ['dashboard', 'invoices', 'add_invoices', 'inventory', 'edit_inventory', 'reports', 'transactions', 'vouchers', 'cash_boxes', 'partners', 'quick_entry', 'daily_ledger', 'optical_hub', 'quick_entries_history'],
    'CASHIER': ['dashboard', 'invoices', 'add_invoices', 'quick_entry', 'daily_ledger', 'optical_hub', 'quick_entries_history'],
    'EMPLOYEE': ['dashboard', 'inventory', 'optical_hub'],
    'VIEWER': ['dashboard']
  };

  const allowedForRole = rolePermissions[normalizedRole] || [];
  return allowedForRole.includes(permissionId);
}


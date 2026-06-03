import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { AppUser } from "../types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
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
  
  const normalizedRole = (user.role || '').toUpperCase().trim();
  
  if (normalizedRole === "SUPER_ADMIN" || (user.permissions && (user.permissions.includes('*') || user.permissions.includes('all')))) {
    return true;
  }
  
  // Custom user permissions override / extension
  if (user.permissions && user.permissions.includes(permissionId)) {
    return true;
  }

  // Role defaults mapping
  const rolePermissions: Record<string, string[]> = {
    'SUPER_ADMIN': ['*'],
    'ADMIN': ['dashboard', 'invoices', 'add_invoices', 'inventory', 'edit_inventory', 'reports', 'transactions', 'partners', 'quick_entry', 'daily_ledger', 'optical_hub', 'users', 'auth_logs', 'store_settings'],
    'ACCOUNTANT': ['dashboard', 'invoices', 'add_invoices', 'inventory', 'edit_inventory', 'reports', 'transactions', 'partners', 'quick_entry', 'daily_ledger', 'optical_hub'],
    'CASHIER': ['dashboard', 'invoices', 'add_invoices', 'quick_entry', 'daily_ledger', 'optical_hub'],
    'EMPLOYEE': ['dashboard', 'inventory', 'optical_hub'],
    'VIEWER': ['dashboard']
  };

  const allowedForRole = rolePermissions[normalizedRole] || [];
  return allowedForRole.includes(permissionId);
}


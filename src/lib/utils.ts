import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { AppUser } from "../types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function hasPermission(user: AppUser | null | undefined, permissionId: string): boolean {
  if (!user || user.isActive === false) return false;
  
  if (user.role === "SUPER_ADMIN" || (user.permissions && (user.permissions.includes('*') || user.permissions.includes('all')))) {
    return true;
  }
  
  // Custom user permissions override / extension
  if (user.permissions && user.permissions.includes(permissionId)) {
    return true;
  }

  // Role defaults mapping
  const rolePermissions: Record<string, string[]> = {
    'ADMIN': ['dashboard', 'invoices', 'inventory', 'reports', 'transactions', 'partners', 'quick_entry', 'daily_ledger', 'optical_hub', 'users', 'auth_logs', 'store_settings'],
    'ACCOUNTANT': ['dashboard', 'invoices', 'inventory', 'reports', 'transactions', 'partners', 'quick_entry', 'daily_ledger', 'optical_hub'],
    'CASHIER': ['dashboard', 'invoices', 'quick_entry', 'daily_ledger', 'optical_hub'],
    'EMPLOYEE': ['dashboard', 'inventory', 'optical_hub'],
    'VIEWER': ['dashboard']
  };

  const allowedForRole = rolePermissions[user.role] || [];
  return allowedForRole.includes(permissionId);
}


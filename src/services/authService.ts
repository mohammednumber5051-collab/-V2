import { dbService } from "./db";
import { AppUser, SecuritySession } from "../types";
import bcrypt from "bcryptjs";

const SESSION_KEY = "optical_auth_session";

export const authService = {
    async initialize() {
        console.log("[AuthService] Initializing. Fetching users...");
        const users = await dbService.getAll("users") as AppUser[];
        console.log(`[AuthService] Found ${users.length} users in database.`);
        
        let hasAdmin = users.some(u => u.username === 'admin');

        if (users.length === 0 || (import.meta.env.DEV && !hasAdmin)) {
            if (import.meta.env.DEV) {
                console.log("[AuthService] DEV Mode: Creating temporary SUPER_ADMIN account with username: admin, password: admin123");
                await this.setupFirstAdmin("مدير النظام (مطور)", "admin", "admin123", "متجر بصريات تجريبي");
                console.log("[AuthService] Bootstrap admin created in DEV mode.");
                return { setupRequired: false };
            }
            return { setupRequired: true };
        }
        return { setupRequired: false };
    },

    async setupFirstAdmin(name: string, username: string, passwordPlain: string, storeName: string) {
        console.log(`[AuthService] Hashing password for new admin setup...`);
        const passwordHash = bcrypt.hashSync(passwordPlain, 10);
        console.log(`[AuthService] Hashing completed.`);
        
        const adminUser: AppUser = {
            name,
            username,
            passwordHash,
            role: 'SUPER_ADMIN',
            permissions: ['*'],
            isActive: true,
            sessionVersion: 1,
            createdAt: new Date().toISOString()
        };
        const newId = await dbService.add("users", adminUser, true);
        adminUser.id = newId;
        console.log(`[AuthService] Admin user saved to DB with ID: ${newId}`);
        
        // Also save generic store settings
        const settings = {
            storeNameAr: storeName,
            language: 'ar',
            defaultTheme: 'light',
            updatedAt: new Date().toISOString()
        };
        await dbService.add("settings", settings, true);
        
        return adminUser;
    },

    async login(username: string, passwordPlain: string): Promise<AppUser | null> {
        console.log(`[AuthService] Attempting login for username: ${username}`);
        const users = await dbService.getAll("users") as AppUser[];
        
        let user = users.find(u => u.username?.toLowerCase() === username.toLowerCase());
        
        if (!user && import.meta.env.DEV && username === "admin") {
            user = await this.setupFirstAdmin("System Administrator", "admin", "admin123", "متجر بصريات تجريبي");
        }

        if (!user) {
            throw new Error("بيانات الدخول غير صحيحة");
        }
        
        if (user.recordStatus === 'deleted' || user.isActive === false) {
            throw new Error("الحساب معطل أو محذوف");
        }
        
        if (!user.passwordHash) {
            throw new Error("بيانات الدخول غير صحيحة");
        }

        const isValid = bcrypt.compareSync(passwordPlain, user.passwordHash);
        if (!isValid) {
            throw new Error("بيانات الدخول غير صحيحة");
        }

        // Hardening session integrity
        const newSessionVersion = (user.sessionVersion || 1) + 1;
        const now = new Date().toISOString();
        
        const updatePayload = {
            sessionVersion: newSessionVersion,
            lastLoginAt: now,
            lastActivityAt: now,
            updatedAt: now
        };
        await dbService.update("users", user.id || "err", updatePayload, true);
        
        const updateDoc = {
            ...user,
            ...updatePayload
        };
        
        // Detailed session object for integrity validation
        const sessionPayload: SecuritySession = {
            userId: user.id || "err",
            userName: user.name,
            role: user.role,
            sessionVersion: newSessionVersion,
            createdAt: Date.now(),
            expiresAt: Date.now() + (user.sessionTimeoutMins || 720) * 60000,
            lastActivity: Date.now(),
            deviceId: this.getDeviceId()
        };
        
        localStorage.setItem(SESSION_KEY, JSON.stringify(sessionPayload));

        try {
            await dbService.logAudit('LOGIN', 'User', user.id || 'SYS', 'تسجيل دخول ناجح (جلسة مؤمنة)');
        } catch (auditErr) {
            console.warn("[AuthService] Audit failed:", auditErr);
        }

        return updateDoc;
    },

    getDeviceId() {
        let id = localStorage.getItem("optical_device_id");
        if (!id) {
            id = Math.random().toString(36).substring(2, 11) + '-' + Date.now();
            localStorage.setItem("optical_device_id", id);
        }
        return id;
    },

    async validateSession(): Promise<AppUser | null> {
        const payloadStr = localStorage.getItem(SESSION_KEY);
        if (!payloadStr) return null;
        
        try {
            const payload: SecuritySession = JSON.parse(payloadStr);
            
            // 1. Check expiration
            if (Date.now() > payload.expiresAt) {
                console.warn("[AuthService] Session expired");
                this.forceLogout();
                return null;
            }

            // 2. Check Device Integrity
            if (payload.deviceId !== this.getDeviceId()) {
                console.warn("[AuthService] Device identity mismatch");
                this.forceLogout();
                return null;
            }

            // 3. Check Database Integrity (Remote Invalidation)
            const users = await dbService.getAll("users") as AppUser[];
            const freshUser = users.find(u => u.id === payload.userId);
            
            if (!freshUser || freshUser.isActive === false || freshUser.recordStatus === 'deleted') {
                this.forceLogout();
                return null;
            }

            if ((freshUser.sessionVersion || 1) !== payload.sessionVersion) {
                console.warn("[AuthService] Session version mismatch (remote sign-out)");
                this.forceLogout();
                return null;
            }

            // Update local activity to prevent idle logout (client side)
            payload.lastActivity = Date.now();
            localStorage.setItem(SESSION_KEY, JSON.stringify(payload));

            return freshUser;
        } catch (e) {
            console.error("[AuthService] Session validation error:", e);
            this.forceLogout();
        }
        return null;
    },

    forceLogout() {
        localStorage.removeItem(SESSION_KEY);
    },

    async logout(userId: string) {
        this.forceLogout();
        try {
            await dbService.update("users", userId, { 
                lastLogoutAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            }, true);
            await dbService.logAudit('LOGOUT', 'User', userId, 'تسجيل خروج');
        } catch (e) {
            console.warn("[AuthService] Logout cleanup failed:", e);
        }
    },

    async hashPassword(plain: string): Promise<string> {
        return bcrypt.hashSync(plain, 10);
    }
};

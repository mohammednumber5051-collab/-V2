/**
 * authService.ts — Authentication & session management.
 *
 * Security fixes applied:
 *  - Removed the hardcoded "1234" password backdoor that allowed any user
 *    named "الصبيحي" or the default admin account to authenticate with
 *    a fixed password regardless of their stored password hash.
 *  - Authentication now requires a valid bcrypt hash match or a stored
 *    plain-text password field (legacy migration path only, no magic fallback).
 */

import { dbService } from "./db";
import { AppUser, SecuritySession } from "../types";
import bcrypt from "bcryptjs";

const SESSION_KEY = "optical_auth_session";

export const authService = {
    async initialize() {
        console.log("[AuthService] Initializing. Fetching users...");
        let users = await dbService.getAll("users") as AppUser[];
        console.log(`[AuthService] Found ${users.length} users in database.`);

        // Cleanup duplicate admins
        try {
            let deletedAny = false;

            const duplicateAdmins = users.filter(
                (u) => u.username?.toLowerCase() === "admin" &&
                    u.id !== "system-admin-default" &&
                    u.recordStatus !== "deleted"
            );
            for (const dup of duplicateAdmins) {
                console.log(`[AuthService] Cleaning up duplicate admin with ID: ${dup.id}`);
                await dbService.delete("users", dup.id!);
                deletedAny = true;
            }

            // Cleanup duplicate default cash boxes
            const cashBoxes = await dbService.getAll("cashBoxes");
            const mainBoxes = cashBoxes.filter(
                (b: any) => b.name?.trim() === "الصندوق الرئيسي" && b.recordStatus !== "deleted"
            );

            if (mainBoxes.length > 1) {
                const mainBox = mainBoxes.find((b: any) => b.id === "main-box") || mainBoxes[0];
                for (const box of mainBoxes) {
                    if ((box as any).id !== (mainBox as any).id) {
                        await dbService.delete("cashBoxes", (box as any).id);
                        deletedAny = true;
                    }
                }
            }

            if (deletedAny) {
                users = await dbService.getAll("users") as AppUser[];
            }
        } catch (cleanupErr) {
            console.error("[AuthService] Duplicate cleanup failed:", cleanupErr);
        }

        const hasAdmin = users.some(
            (u) => u.username?.toLowerCase() === "admin" || u.role === "SUPER_ADMIN"
        );

        if (users.length === 0 || (import.meta.env.DEV && !hasAdmin)) {
            return { setupRequired: true };
        }
        return { setupRequired: false };
    },

    async setupFirstAdmin(name: string, username: string, passwordPlain: string, storeName: string) {
        const passwordHash = bcrypt.hashSync(passwordPlain, 10);

        const adminUser: AppUser = {
            id: "system-admin-default",
            name,
            username,
            passwordHash,
            role: "SUPER_ADMIN",
            permissions: ["*"],
            isActive: true,
            sessionVersion: 1,
            createdAt: new Date().toISOString(),
        };
        const newId = await dbService.add("users", adminUser);
        adminUser.id = newId;

        await dbService.add("settings", {
            id: "main_settings",
            storeNameAr: storeName,
            language: "ar",
            defaultTheme: "light",
            updatedAt: new Date().toISOString(),
        });

        await dbService.add("cashBoxes", {
            id: "main-box",
            name: "الصندوق الرئيسي",
            balance: 0,
            initialBalance: 0,
            currency: "YER",
            recordStatus: "active",
            isActive: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        });

        return adminUser;
    },

    async login(username: string, passwordPlain: string): Promise<AppUser | null> {
        console.log(`[AuthService] Login attempt for: ${username}`);
        const users = await dbService.getAll("users") as AppUser[];

        const cleanInput = username.trim().toLowerCase();
        let user = users.find((u) => {
            const uUsername = u.username?.trim().toLowerCase() || "";
            const uName = u.name?.trim().toLowerCase() || "";
            const uEmail = u.email?.trim().toLowerCase() || "";
            return (
                uUsername === cleanInput ||
                uName === cleanInput ||
                uEmail === cleanInput ||
                uName.replace(/\s+/g, "") === cleanInput.replace(/\s+/g, "")
            );
        });

        // Dev-mode auto-setup when no admin exists yet
        if (!user && import.meta.env.DEV && username === "admin") {
            user = await this.setupFirstAdmin("System Administrator", "admin", "admin123", "متجر بصريات تجريبي");
        }

        if (!user) {
            throw new Error("بيانات الدخول غير صحيحة");
        }

        if (user.recordStatus === "deleted" || user.isActive === false) {
            throw new Error("الحساب معطل أو محذوف");
        }

        let isValid = false;

        // 1. Primary: bcrypt hash comparison
        if (user.passwordHash) {
            try {
                isValid = bcrypt.compareSync(passwordPlain, user.passwordHash);
            } catch (e) {
                console.error("[AuthService] bcrypt compare failed:", e);
            }
        }

        // 2. Legacy fallback: plain-text password field (migration path only)
        if (!isValid && (user as any).password) {
            isValid = passwordPlain === (user as any).password;
        }

        // NOTE: No hardcoded backdoor passwords. If a user is locked out, an
        // administrator must reset the password via the Users management screen.

        if (!isValid) {
            throw new Error("بيانات الدخول غير صحيحة");
        }

        // Auto-heal missing fields on first successful login
        const updatePayload: any = {};
        let needsUpdate = false;

        if (!user.passwordHash) {
            user.passwordHash = bcrypt.hashSync(passwordPlain, 10);
            updatePayload.passwordHash = user.passwordHash;
            needsUpdate = true;
        }
        if (!user.username) {
            user.username = user.id === "system-admin-default"
                ? "admin"
                : (user.name ? user.name.trim().toLowerCase().replace(/\s+/g, "") : `user_${user.id}`);
            updatePayload.username = user.username;
            needsUpdate = true;
        }
        if (user.isActive === undefined) {
            user.isActive = true;
            updatePayload.isActive = true;
            needsUpdate = true;
        }

        const newSessionVersion = (user.sessionVersion || 1) + 1;
        const now = new Date().toISOString();

        updatePayload.sessionVersion = newSessionVersion;
        updatePayload.lastLoginAt = now;
        updatePayload.lastActivityAt = now;
        updatePayload.updatedAt = now;

        await dbService.update("users", user.id || "err", updatePayload);

        const updateDoc = { ...user, ...updatePayload };

        const sessionPayload: SecuritySession = {
            userId: user.id || "err",
            userName: user.name,
            role: user.role,
            sessionVersion: newSessionVersion,
            createdAt: Date.now(),
            expiresAt: Date.now() + (user.sessionTimeoutMins || 720) * 60000,
            lastActivity: Date.now(),
            deviceId: this.getDeviceId(),
        };

        localStorage.setItem(SESSION_KEY, JSON.stringify(sessionPayload));
        localStorage.setItem("app_user", JSON.stringify(updateDoc));

        try {
            await dbService.logAudit("LOGIN", "User", user.id || "SYS", "تسجيل دخول ناجح", null, null, null);
        } catch (auditErr) {
            console.warn("[AuthService] Audit failed:", auditErr);
        }

        return updateDoc;
    },

    getDeviceId(): string {
        let id = localStorage.getItem("optical_device_id");
        if (!id) {
            id = Math.random().toString(36).substring(2, 11) + "-" + Date.now();
            localStorage.setItem("optical_device_id", id);
        }
        return id;
    },

    async validateSession(): Promise<AppUser | null> {
        const payloadStr = localStorage.getItem(SESSION_KEY);
        if (!payloadStr) return null;

        try {
            const payload: SecuritySession = JSON.parse(payloadStr);

            if (Date.now() > payload.expiresAt) {
                console.warn("[AuthService] Session expired");
                this.forceLogout();
                return null;
            }

            if (payload.deviceId !== this.getDeviceId()) {
                console.warn("[AuthService] Device identity mismatch");
                this.forceLogout();
                return null;
            }

            let freshUser: AppUser | undefined;
            try {
                const users = await dbService.getAll("users") as AppUser[];
                freshUser = users.find((u) => u.id === payload.userId);

                if (!freshUser || freshUser.isActive === false || freshUser.recordStatus === "deleted") {
                    this.forceLogout();
                    return null;
                }

                if ((freshUser.sessionVersion || 1) !== payload.sessionVersion) {
                    console.warn("[AuthService] Session version mismatch (remote sign-out)");
                    this.forceLogout();
                    return null;
                }
            } catch (dbErr) {
                console.warn("[AuthService] Remote DB check failed (offline). Using cached session.", dbErr);
                const localUserStr = localStorage.getItem("app_user");
                if (localUserStr) {
                    try {
                        const parsed = JSON.parse(localUserStr);
                        if (parsed?.id === payload.userId) freshUser = parsed;
                    } catch (_) { /* ignore */ }
                }
                if (!freshUser) { this.forceLogout(); return null; }
            }

            payload.lastActivity = Date.now();
            localStorage.setItem(SESSION_KEY, JSON.stringify(payload));
            localStorage.setItem("app_user", JSON.stringify(freshUser));

            return freshUser;
        } catch (e) {
            console.error("[AuthService] Session validation error:", e);
            this.forceLogout();
        }
        return null;
    },

    forceLogout(): void {
        localStorage.removeItem(SESSION_KEY);
        localStorage.removeItem("app_user");
    },

    async logout(userId: string): Promise<void> {
        this.forceLogout();
        try {
            await dbService.update("users", userId, {
                lastLogoutAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            });
            await dbService.logAudit("LOGOUT", "User", userId, "تسجيل خروج", null, null, null);
        } catch (e) {
            console.warn("[AuthService] Logout cleanup failed:", e);
        }
    },

    async hashPassword(plain: string): Promise<string> {
        return bcrypt.hashSync(plain, 10);
    },

    getCurrentUser(): AppUser | null {
        const u = localStorage.getItem("app_user");
        if (!u) return null;
        try { return JSON.parse(u); } catch (_) { return null; }
    },
};

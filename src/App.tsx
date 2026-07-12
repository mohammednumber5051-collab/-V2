import React from "react";
import { useState, useEffect, useRef } from "react";
import { 
  BarChart3, 
  Package, 
  ShoppingCart, 
  Wallet, 
  Menu,
  X,
  Bell,
  Settings,
  Calendar,
  FileText,
  LogOut,
  Users as UsersIcon,
  Plus,
  Zap,
  ListTodo,
  Eye,
  Moon,
  Sun,
  ShieldAlert,
  Sliders,
  Lock,
  Download
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { cn, hasPermission } from "./lib/utils";
import { AppUser } from "./types";
import { dbService } from "./services/db";
import { authService } from "./services/authService";
import { migrationService } from "./services/migration";
import { waitForAuth } from "./firebase";

import { App as CapApp } from '@capacitor/app';
import { Keyboard } from '@capacitor/keyboard';
import { StatusBar, Style } from '@capacitor/status-bar';
import { Capacitor } from '@capacitor/core';
import ErrorBoundary from "./components/ErrorBoundary";
import Dashboard from "./components/Dashboard";
import Inventory from "./components/Inventory";
import InvoicesWrapper from "./components/InvoicesWrapper";
import PartnersWrapper from "./components/PartnersWrapper";
import Transactions from "./components/Transactions";
import Users from "./components/Users";
import Reports from "./components/Reports";
import Login from "./components/Login";
import QuickEntry from "./components/QuickEntry";
import QuickEntriesHistory from "./components/QuickEntriesHistory";
import DailyLedger from "./components/DailyLedger";
import OpticalHub from "./components/OpticalHub";
import EnterpriseSettings from "./components/EnterpriseSettings";
import AuditLogs from "./components/AuditLogs";
import Vouchers from "./components/Vouchers";
import LockScreen from "./components/LockScreen";
import PWAInstallPrompt from "./components/PWAInstallPrompt";

type Page = 'dashboard' | 'invoices' | 'inventory' | 'transactions' | 'vouchers' | 'reports' | 'partners' | 'users' | 'quick_entry' | 'quick_entries_history' | 'daily_ledger' | 'optical_hub' | 'settings' | 'audit_logs';

const bottomNavItems = [
  { id: 'dashboard', label: 'الرئيسية', icon: BarChart3 },
  { id: 'invoices', label: 'الفواتير', icon: ShoppingCart },
  { id: 'transactions', label: 'الخزينة', icon: Wallet },
  { id: 'inventory', label: 'الأصناف', icon: Package },
  { id: 'partners', label: 'العملاء', icon: UsersIcon },
];

const drawerItems = [
  { id: 'vouchers', label: 'سندات القبض والصرف', icon: FileText },
  { id: 'reports', label: 'التقارير المالية', icon: FileText },
  { id: 'optical_hub', label: 'مركز الصيانة', icon: Eye },
  { id: 'quick_entry', label: 'الإدخال المالي السريع', icon: Zap },
  { id: 'quick_entries_history', label: 'سجل الإدخال السريع', icon: FileText },
  { id: 'daily_ledger', label: 'دفتر اليومية', icon: ListTodo },
];

const enterpriseDrawerItems = [
  { id: 'settings', label: 'إعدادات النظام والأمان', icon: Sliders },
  { id: 'audit_logs', label: 'سجل الحركات (Audit)', icon: ShieldAlert },
];

export default function App() {
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  );
}

function AppContent() {
  const [activePage, setActivePage] = useState<Page>('dashboard');
  const [editQuickEntryId, setEditQuickEntryId] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isFabMenuOpen, setIsFabMenuOpen] = useState(false);
  
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isLocked, setIsLocked] = useState(false);

  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    return localStorage.getItem("theme") === "dark" || false;
  });
  
  // Session timeout implementation
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  const resetSessionTimeout = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (!currentUser) return;
    
    // Default 12 hours timeout if not set
    const timeoutMins = currentUser.sessionTimeoutMins || 720;
    timeoutRef.current = setTimeout(() => {
      setIsLocked(true);
    }, timeoutMins * 60 * 1000);
  };

  useEffect(() => {
    const handleActivity = () => {
        if (!isLocked) resetSessionTimeout();
    };
    
    window.addEventListener('mousemove', handleActivity);
    window.addEventListener('keypress', handleActivity);
    window.addEventListener('touchstart', handleActivity);
    
    resetSessionTimeout();
    
    return () => {
      window.removeEventListener('mousemove', handleActivity);
      window.removeEventListener('keypress', handleActivity);
      window.removeEventListener('touchstart', handleActivity);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [currentUser, isLocked]);

  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    // Keyboard Handling for mobile layout stabilization
    if (Capacitor.isNativePlatform()) {
      const showListener = Keyboard.addListener('keyboardWillShow', (info) => {
        setIsKeyboardOpen(true);
        // On some Androids we might need to scroll the active element into view
        setTimeout(() => {
          document.activeElement?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 100);
      });
      const hideListener = Keyboard.addListener('keyboardWillHide', () => {
        setIsKeyboardOpen(false);
      });

      return () => {
        showListener.then(h => h.remove());
        hideListener.then(h => h.remove());
      };
    }
  }, []);

  useEffect(() => {
    // Android Lifecycle & Back Button Handling
    if (Capacitor.isNativePlatform()) {
      StatusBar.setStyle({ style: isDarkMode ? Style.Dark : Style.Light });
      
      const backHandler = CapApp.addListener('backButton', ({ canGoBack }) => {
        if (!canGoBack) {
          CapApp.exitApp();
        } else if (activePage !== 'dashboard') {
          setActivePage('dashboard');
        }
      });

      return () => {
        backHandler.then(h => h.remove());
      };
    }
  }, [isDarkMode, activePage]);

  useEffect(() => {
    document.documentElement.setAttribute('dir', 'rtl');
    document.documentElement.setAttribute('lang', 'ar');
    
    const checkSession = async () => {
      const timeout = setTimeout(() => {
        console.warn("Session init timed out, forcing initialization.");
        setIsInitialized(true);
      }, 5000);

      try {
        // Ensure Firebase Auth is ready (and anonymous login check performed)
        await waitForAuth();
        await authService.initialize();
        
        const _currentUser = await authService.validateSession();
        if (_currentUser) {
           setCurrentUser(_currentUser);
           migrationService.migrateOldInvoices().catch(console.error);
           migrationService.migrateOldQuickEntries().catch(console.error);
           migrationService.recoverZeroedInvoices().catch(console.error);
        }
      } catch (err) {
        console.error("Session init failed", err);
      } finally {
        clearTimeout(timeout);
        setIsInitialized(true);
      }
    };
    checkSession();

    // Clean up local storage cache for previously deleted customers "محمد الصبيحي" and "حسن عبدالله عامر"
    try {
      const collections = ["customers", "invoices", "transactions", "quick_financial_entries"];
      collections.forEach(coll => {
        const raw = localStorage.getItem(`fp_db_${coll}`);
        if (raw) {
          const list = JSON.parse(raw);
          if (Array.isArray(list)) {
            const cleanList = list.filter((item: any) => {
              if (coll === "customers") {
                if (item.name === "محمد الصبيحي" || item.name === "حسن عبدالله عامر" || item.name?.includes("الصبيحي") || item.name?.includes("حسن عبدالله عامر")) {
                  return false;
                }
              }
              if (item.partnerName === "محمد الصبيحي" || item.partnerName === "حسن عبدالله عامر" || item.partnerName?.includes("الصبيحي") || item.partnerName?.includes("حسن عبدالله عامر")) {
                return false;
              }
              return true;
            });
            if (cleanList.length !== list.length) {
              localStorage.setItem(`fp_db_${coll}`, JSON.stringify(cleanList));
              console.log(`Pristine cache: cleaned ${list.length - cleanList.length} items from fp_db_${coll}`);
            }
          }
        }
      });
    } catch (e) {
      console.error("Local storage cache clean-up failed", e);
    }
  }, []);

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("theme", "light");
    }
  }, [isDarkMode]);

  const handleLogout = async (reason?: string) => {
    if (currentUser && currentUser.id) {
        await authService.logout(currentUser.id);
    }
    localStorage.removeItem("app_user");
    setCurrentUser(null);
    setIsLocked(false);
    if (typeof reason === 'string') alert(reason);
  };

  const handleManualLock = () => {
      setIsLocked(true);
      setIsSidebarOpen(false);
  };

  if (!isInitialized) return null;

  if (!currentUser) {
    return <Login onLogin={(user) => {
        setCurrentUser(user);
        localStorage.setItem("app_user", JSON.stringify(user));
        setIsLocked(false);
        resetSessionTimeout();
    }} />;
  }

  const renderPage = () => {
    // Check if user has permission to view this page
    if (!hasPermission(currentUser, activePage)) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-white dark:bg-[#131b2e] rounded-[2.5rem] border border-slate-100 dark:border-slate-800 shadow-lg max-w-lg mx-auto my-12 transition-colors">
          <div className="w-16 h-16 bg-red-100 dark:bg-red-500/10 rounded-full flex items-center justify-center text-red-600 dark:text-red-400 mb-4 shrink-0 shadow-inner">
            <Lock size={28} />
          </div>
          <h2 className="text-xl font-black text-slate-850 dark:text-white mb-2">تأمين الصلاحيات (محمي)</h2>
          <p className="text-sm font-bold text-slate-500 dark:text-slate-400 leading-relaxed mb-6">
            ليست لديك الصلاحية الكافية للدخول إلى صفحة ({currentLabel}). يرجى الطلب من مسؤول النظام تفعيل الصلاحية المطلوبة لك.
          </p>
          <button 
            onClick={() => setActivePage('dashboard')} 
            className="px-6 py-2.5 bg-blue-600 dark:bg-blue-500 text-white font-bold text-xs rounded-xl hover:bg-blue-700 dark:hover:bg-blue-600 transition-colors cursor-pointer shadow-md"
          >
            العودة للوحة التحكم الرئيسية
          </button>
        </div>
      );
    }

    switch (activePage) {
      case 'dashboard': return <Dashboard onNavigate={(page: any) => setActivePage(page)} currentUser={currentUser} />;
      case 'invoices': return <InvoicesWrapper currentUser={currentUser} />;
      case 'inventory': return <Inventory currentUser={currentUser} />;
      case 'transactions': return <Transactions currentUser={currentUser} onNavigate={(p: any) => setActivePage(p as any)} />;
      case 'vouchers': return <Vouchers currentUser={currentUser} />;
      case 'reports': return <Reports />;
      case 'partners': return <PartnersWrapper />;
      case 'users': return <Users currentUser={currentUser} />;
      case 'quick_entry': return <QuickEntry currentUser={currentUser} onNavigate={(p: any, params?: any) => {
        if (p === 'quick_entry' && params?.editId) {
          setEditQuickEntryId(params.editId);
        } else if (p === 'quick_entry') {
          setEditQuickEntryId(null);
        }
        setActivePage(p);
      }} editId={editQuickEntryId} />;
      case 'quick_entries_history': return <QuickEntriesHistory currentUser={currentUser} onNavigate={(p: any, params?: any) => {
        if (p === 'quick_entry' && params?.editId) {
          setEditQuickEntryId(params.editId);
        } else if (p === 'quick_entry') {
          setEditQuickEntryId(null);
        }
        setActivePage(p);
      }} />;
      case 'daily_ledger': return <DailyLedger currentUser={currentUser} />;
      case 'optical_hub': return <OpticalHub />;
      case 'settings': return <EnterpriseSettings />;
      case 'audit_logs': return <AuditLogs />;
      default: return <Dashboard currentUser={currentUser} />;
    }
  };

  const currentLabel = 
    bottomNavItems.find(i => i.id === activePage)?.label || 
    drawerItems.find(i => i.id === activePage)?.label || 
    enterpriseDrawerItems.find(i => i.id === activePage)?.label || 
    (activePage === 'users' ? 'المستخدمين' : 'الرئيسية');

  return (
    <div className="fixed inset-0 w-full h-full bg-slate-950 dark:bg-[#020617] flex items-center justify-center overflow-hidden transition-colors duration-300">
      <div className="w-full h-full max-w-xl bg-slate-50 dark:bg-[#0b0f19] font-sans text-slate-900 dark:text-slate-100 flex flex-col overflow-hidden transition-colors duration-300 sm:shadow-2xl relative sm:border-x sm:border-slate-200/50 dark:sm:border-slate-800/60">
      
      {isLocked && currentUser && (
          <LockScreen 
              user={currentUser} 
              onUnlock={() => { setIsLocked(false); resetSessionTimeout(); }} 
              onLogout={() => handleLogout()} 
          />
      )}

      {/* Side Drawer Overlay */}
      <AnimatePresence>
        {isSidebarOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-950/60 z-[60] backdrop-blur-sm"
              onClick={() => setIsSidebarOpen(false)}
            />
            <motion.aside
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="absolute right-0 top-0 bottom-0 w-72 bg-white dark:bg-[#131b2e] z-[70] shadow-2xl flex flex-col border-l border-slate-100 dark:border-slate-800/80 transition-colors"
            >
              <div className="p-4 bg-slate-900 dark:bg-[#1d293d] flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-600 dark:bg-blue-500 rounded-xl flex items-center justify-center text-white font-black text-xl shadow-lg">
                    ب
                  </div>
                  <div className="flex flex-col">
                    <span className="text-white font-black text-sm leading-tight">نظام البصريات</span>
                    <span className="text-blue-200 text-[10px] font-bold">نسخة الموظفين</span>
                  </div>
                </div>
                <button onClick={() => setIsSidebarOpen(false)} className="text-slate-400 hover:text-white p-2 rounded-full hover:bg-white/5">
                  <X size={22} />
                </button>
              </div>

              <nav className="flex-1 overflow-y-auto p-4 space-y-1.5 custom-scrollbar">
                <div className="text-[10px] font-black text-slate-400 dark:text-slate-500 mb-2 px-3 uppercase tracking-wider">القائمة الإضافية</div>
                {drawerItems.filter(item => hasPermission(currentUser, item.id)).map(item => (
                  <button
                    key={item.id}
                    onClick={() => {
                      setActivePage(item.id as Page);
                      setIsSidebarOpen(false);
                    }}
                    className={cn(
                      "w-full flex items-center gap-4 px-4 py-3 rounded-xl transition-all cursor-pointer font-bold duration-200 text-sm",
                      activePage === item.id 
                        ? "bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 shadow-sm" 
                        : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/40"
                    )}
                  >
                    <item.icon size={18} className={activePage === item.id ? "text-blue-600 dark:text-blue-400" : "text-slate-400 dark:text-slate-500"} />
                    {item.label}
                  </button>
                ))}

                {hasPermission(currentUser, 'users') && (
                  <button
                    onClick={() => {
                      setActivePage('users');
                      setIsSidebarOpen(false);
                    }}
                    className={cn(
                      "w-full flex items-center gap-4 px-4 py-3 rounded-xl transition-all cursor-pointer font-bold duration-200 text-sm",
                      activePage === 'users' 
                        ? "bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 shadow-sm" 
                        : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/40"
                    )}
                  >
                    <UsersIcon size={18} className={activePage === 'users' ? "text-blue-600 dark:text-blue-400" : "text-slate-400 dark:text-slate-500"} />
                    إدارة المستخدمين
                  </button>
                )}

                <div className="mt-6 mb-2">
                  <div className="text-[10px] font-black text-slate-400 dark:text-slate-500 mb-2 px-3 uppercase tracking-wider">الإعدادات والتأمين</div>
                  {enterpriseDrawerItems.filter(item => hasPermission(currentUser, item.id)).map(item => (
                    <button
                      key={item.id}
                      onClick={() => {
                        setActivePage(item.id as Page);
                        setIsSidebarOpen(false);
                      }}
                      className={cn(
                        "w-full flex items-center gap-4 px-4 py-3 rounded-xl transition-all cursor-pointer font-bold duration-200 text-sm",
                        activePage === item.id 
                          ? "bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-400 shadow-sm" 
                          : "text-slate-600 dark:text-slate-400 hover:bg-rose-50/50 dark:hover:bg-slate-800/40"
                      )}
                    >
                      <item.icon size={18} className={activePage === item.id ? "text-rose-600 dark:text-rose-400" : "text-slate-400 dark:text-slate-500"} />
                      {item.label}
                    </button>
                  ))}
                </div>

                <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800/40">
                  <button
                    onClick={() => {
                      window.dispatchEvent(new CustomEvent("show-pwa-install-modal"));
                      setIsSidebarOpen(false);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all cursor-pointer font-black duration-200 text-xs text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-500/10 border border-dashed border-blue-200 dark:border-blue-500/30"
                  >
                    <Download size={16} className="text-blue-600 dark:text-blue-400 animate-pulse" />
                    تثبيت التطبيق على الجهاز 📱💻
                  </button>
                </div>
              </nav>

              <div className="p-4 border-t border-slate-100 dark:border-slate-800/60 bg-slate-50 dark:bg-[#1c2436] transition-colors">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-slate-200 dark:bg-slate-800 flex items-center justify-center font-black text-slate-700 dark:text-slate-300 shrink-0">
                    {currentUser.name.charAt(0)}
                  </div>
                  <div className="flex flex-col overflow-hidden">
                    <span className="text-xs font-black text-slate-800 dark:text-slate-200 truncate">{currentUser.name}</span>
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 font-bold truncate">{currentUser.role}</span>
                  </div>
                </div>
                <button 
                  onClick={() => handleLogout()}
                  className="w-full flex items-center justify-center gap-2 py-2.5 bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400 font-bold rounded-xl hover:bg-red-100 dark:hover:bg-red-900/10 transition-colors text-sm"
                >
                  <LogOut size={16} />
                  تسجيل الخروج
                </button>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Top Header */}
      <header className="min-h-[3.5rem] h-auto pt-[env(safe-area-inset-top,10px)] pb-2 bg-white dark:bg-[#131b2e] border-b border-slate-200 dark:border-slate-850 flex items-center justify-between px-4 shrink-0 z-40 sticky top-0 shadow-sm dark:shadow-none transition-colors duration-300">
        <div className="flex items-center gap-2">
            <button 
              onClick={() => setIsSidebarOpen(true)}
              className="p-2 -mr-1 text-slate-600 dark:text-slate-300 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 active:scale-95 transition-all"
            >
              <Menu size={20} />
            </button>
            <h2 className="text-sm font-black text-slate-800 dark:text-white leading-none">
               {currentLabel}
            </h2>
        </div>
        <div className="flex items-center gap-1">
            {!isOnline && (
              <div className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400 text-[10px] font-black bg-amber-50 dark:bg-amber-500/10 px-2.5 py-1.5 rounded-xl border border-amber-100/50 dark:border-amber-500/20 shadow-sm animate-pulse tracking-wide">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                <span>العمل دون اتصال</span>
              </div>
            )}
            <div className="hidden md:flex items-center gap-2 text-slate-500 dark:text-slate-400 text-xs font-bold bg-slate-50 dark:bg-slate-800/40 px-3 py-1.5 rounded-xl border border-slate-100 dark:border-slate-800">
              <Calendar size={13} className="text-blue-500" />
              {new Date().toLocaleDateString('ar-EG', { weekday: 'long', month: 'short', day: 'numeric' })}
            </div>
            
            {/* Dark Mode Switcher Toggle */}
            <button 
              onClick={() => setIsDarkMode(!isDarkMode)} 
              title={isDarkMode ? "الوضع المضيء" : "الوضع المظلم"}
              className="p-2 text-slate-500 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 active:scale-90 transition-all"
            >
              {isDarkMode ? <Sun size={18} className="text-amber-500" /> : <Moon size={18} />}
            </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto w-full relative bg-slate-50 dark:bg-[#0b0f19] pb-[calc(6.5rem+env(safe-area-inset-bottom,16px))] transition-colors duration-300">
        <div className="p-2.5 md:p-3.5 w-full max-w-5xl mx-auto min-h-full flex flex-col">
          <AnimatePresence mode="wait">
            <motion.div
              key={activePage}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
              className="flex-1 flex flex-col"
            >
              <div className="flex-1 flex flex-col pt-0">
                {renderPage()}
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      {/* Global FAB */}
      <div className="absolute bottom-[calc(5.25rem+env(safe-area-inset-bottom,16px))] left-6 z-50">
        <AnimatePresence>
          {isFabMenuOpen && (
            <>
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-slate-950/40 z-40 backdrop-blur-sm"
                onClick={() => setIsFabMenuOpen(false)}
              />
              <motion.div
                initial={{ opacity: 0, y: 20, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 20, scale: 0.9 }}
                className="absolute bottom-16 left-0 mb-4 bg-white dark:bg-[#131b2e] rounded-2xl shadow-2xl border border-slate-100 dark:border-slate-800 overflow-hidden w-64 z-50 flex flex-col transition-colors"
              >
                <div className="bg-slate-50 dark:bg-[#1c2436] px-4 py-3 border-b border-slate-100 dark:border-slate-800 font-black text-slate-700 dark:text-slate-200 text-xs">
                  إجراءات سريعة
                </div>
                {hasPermission(currentUser, 'quick_entry') && (
                  <button onClick={() => { setActivePage('quick_entry'); setIsFabMenuOpen(false); }} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/40 text-slate-700 dark:text-slate-300 font-bold text-xs border-b border-slate-100 dark:border-slate-800 transition-colors">
                    <div className="bg-blue-100 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 p-1.5 rounded-lg"><Zap size={14} /></div> إدخال فاتورة ورقية سريع
                  </button>
                )}
                {hasPermission(currentUser, 'daily_ledger') && (
                  <button onClick={() => { setActivePage('daily_ledger'); setIsFabMenuOpen(false); }} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/40 text-slate-700 dark:text-slate-300 font-bold text-xs border-b border-slate-100 dark:border-slate-800 transition-colors">
                    <div className="bg-amber-100 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 p-1.5 rounded-lg"><ListTodo size={14} /></div> تسجيل قيد أمانة يومية
                  </button>
                )}
                {hasPermission(currentUser, 'add_invoices') && (
                  <button onClick={() => { setActivePage('invoices'); setIsFabMenuOpen(false); }} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/40 text-slate-700 dark:text-slate-300 font-bold text-xs border-b border-slate-100 dark:border-slate-800 transition-colors">
                    <div className="bg-indigo-100 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 p-1.5 rounded-lg"><FileText size={14} /></div> كتابة فاتورة جديدة
                  </button>
                )}
                {hasPermission(currentUser, 'transactions') && (
                  <button onClick={() => { setActivePage('transactions'); setIsFabMenuOpen(false); }} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/40 text-slate-700 dark:text-slate-300 font-bold text-xs border-b border-slate-100 dark:border-slate-800 transition-colors">
                    <div className="bg-emerald-100 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 p-1.5 rounded-lg"><Wallet size={14} /></div> إنشاء سند قبض/صرف
                  </button>
                )}
                {hasPermission(currentUser, 'transactions') && (
                  <button onClick={() => { setActivePage('transactions'); setIsFabMenuOpen(false); }} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/40 text-slate-700 dark:text-slate-300 font-bold text-xs border-b border-slate-100 dark:border-slate-800 transition-colors">
                    <div className="bg-rose-100 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 p-1.5 rounded-lg"><LogOut size={14} /></div> إضافة منصرف/مصروفات
                  </button>
                )}
                {hasPermission(currentUser, 'partners') && (
                  <button onClick={() => { setActivePage('partners'); setIsFabMenuOpen(false); }} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/40 text-slate-700 dark:text-slate-300 font-bold text-xs transition-colors">
                    <div className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 p-1.5 rounded-lg"><UsersIcon size={14} /></div> إضافة جهة/عميل/مورد
                  </button>
                )}
              </motion.div>
            </>
          )}
        </AnimatePresence>
        
        <button 
          onClick={() => setIsFabMenuOpen(!isFabMenuOpen)}
          className={cn(
            "w-14 h-14 bg-blue-600 dark:bg-blue-500 text-white rounded-2xl flex items-center justify-center hover:bg-blue-700 dark:hover:bg-blue-600 hover:-translate-y-1 transition-all z-50 relative active:scale-95",
            isFabMenuOpen ? "shadow-lg shadow-blue-500/30" : "animate-soft-pulse"
          )}
          id="global_fab"
        >
          <motion.div animate={{ rotate: isFabMenuOpen ? 45 : 0 }}>
            {isFabMenuOpen ? <X size={24} /> : <Plus size={24} />}
          </motion.div>
        </button>
      </div>

      {/* Bottom Navigation */}
      {!isKeyboardOpen && (
        <div className="min-h-[3.5rem] h-auto pb-[calc(env(safe-area-inset-bottom,16px)+12px)] pt-2 bg-white dark:bg-[#131b2e] border-t border-slate-200 dark:border-slate-850 absolute bottom-0 left-0 right-0 z-40 shadow-lg flex items-center justify-around px-1 transition-colors duration-300">
          {bottomNavItems.filter(item => hasPermission(currentUser, item.id)).map(item => (
            <button
              key={item.id}
              onClick={() => setActivePage(item.id as Page)}
              className="flex flex-col items-center justify-center w-full h-12 space-y-0.5 py-1"
            >
              <item.icon size={20} className={cn("transition-colors duration-200", activePage === item.id ? "text-blue-600 dark:text-blue-400 scale-105" : "text-slate-400 dark:text-slate-500")} />
              <span className={cn("text-[9px] font-black transition-colors duration-200", activePage === item.id ? "text-blue-600 dark:text-blue-400" : "text-slate-400 dark:text-slate-500")}>
                {item.label}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Custom PWA Install prompt notification banner */}
      <PWAInstallPrompt />

      </div>
    </div>
  );
}


import React, { useState, useEffect } from "react";
import { 
    Store, 
    Printer, 
    Image, 
    Phone, 
    MapPin, 
    Globe, 
    MessageSquare, 
    Mail, 
    Hash, 
    FileText, 
    Layout, 
    Palette, 
    Save, 
    Check, 
    AlertCircle,
    QrCode,
    Languages,
    Upload
} from "lucide-react";
import { dbService } from "../services/db";
import { StoreSettings } from "../types";
import { cn } from "../lib/utils";
import { motion } from "motion/react";

export default function StoreSettingsForm() {
    const [settings, setSettings] = useState<StoreSettings | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [saveSuccess, setSaveSuccess] = useState(false);
    const [activeTab, setActiveTab] = useState<'business' | 'print' | 'appearance'>('business');

    useEffect(() => {
        const loadSettings = async () => {
            const data = await dbService.getStoreSettings();
            setSettings(data);
        };
        loadSettings();
    }, []);

    const handleSave = async () => {
        if (!settings) return;
        setIsSaving(true);
        try {
            await dbService.updateStoreSettings(settings);
            setSaveSuccess(true);
            setTimeout(() => setSaveSuccess(false), 3000);
        } catch (e) {
            alert("فشل حفظ الإعدادات");
        } finally {
            setIsSaving(false);
        }
    };

    if (!settings) {
        return (
            <div className="flex items-center justify-center py-20">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
        );
    }

    const tabs = [
        { id: 'business', label: 'بيانات المنشأة', icon: Store },
        { id: 'print', label: 'إعدادات الطباعة', icon: Printer },
        { id: 'appearance', label: 'المظهر واللغة', icon: Palette },
    ] as const;

    return (
        <div className="space-y-6">
            {/* Tabs Navigation */}
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800/50 p-1 rounded-2xl w-fit">
                {tabs.map((tab) => {
                    const Icon = tab.icon;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={cn(
                                "flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black transition-all cursor-pointer",
                                activeTab === tab.id
                                    ? "bg-white dark:bg-slate-700 text-primary shadow-sm"
                                    : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                            )}
                        >
                            <Icon size={14} />
                            {tab.label}
                        </button>
                    );
                })}
            </div>

            <div className="grid grid-cols-1 gap-6">
                {activeTab === 'business' && (
                    <motion.div 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="grid grid-cols-1 md:grid-cols-2 gap-4"
                    >
                        {/* Business Info Card */}
                        <div className="bg-white dark:bg-[#131b2e] p-6 rounded-2xl border border-slate-100 dark:border-slate-800 space-y-4">
                            <div className="flex items-center gap-2 mb-2">
                                <div className="p-2 bg-blue-50 dark:bg-blue-500/10 rounded-lg text-blue-600 dark:text-blue-400">
                                    <Store size={18} />
                                </div>
                                <h3 className="font-black text-slate-800 dark:text-white">الهوية التجارية</h3>
                            </div>

                            <div className="space-y-3">
                                <div>
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block mb-1">اسم المتجر (بالعربية)</label>
                                    <input 
                                        type="text" 
                                        className="w-full px-4 py-2 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 text-sm font-bold text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-primary/20"
                                        value={settings.storeNameAr}
                                        onChange={e => setSettings({...settings, storeNameAr: e.target.value})}
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block mb-1">Store Name (English - Optional)</label>
                                    <input 
                                        type="text" 
                                        dir="ltr"
                                        className="w-full px-4 py-2 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 text-sm font-bold text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-primary/20"
                                        value={settings.storeNameEn || ""}
                                        onChange={e => setSettings({...settings, storeNameEn: e.target.value})}
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block mb-1">رابط الشعار (URL) أو رفع صورة</label>
                                    <div className="flex gap-2 items-center">
                                        <input 
                                            type="text" 
                                            className="grow px-4 py-2 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 text-sm font-bold text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-primary/20"
                                            value={settings.logoUrl || ""}
                                            onChange={e => setSettings({...settings, logoUrl: e.target.value})}
                                            placeholder="https://example.com/logo.png"
                                        />
                                        <input 
                                            type="file" 
                                            accept="image/*" 
                                            className="hidden" 
                                            id="logoUpload"
                                            onChange={(e) => {
                                                const file = e.target.files?.[0];
                                                if (file) {
                                                    const reader = new FileReader();
                                                    reader.onloadend = () => setSettings({...settings, logoUrl: reader.result as string});
                                                    reader.readAsDataURL(file);
                                                }
                                            }}
                                        />
                                        <label 
                                            htmlFor="logoUpload"
                                            className="p-2 bg-slate-100 dark:bg-slate-800 rounded-xl hover:bg-slate-200 text-slate-600 dark:text-slate-300 transition-colors cursor-pointer shrink-0 flex items-center justify-center h-full aspect-square"
                                            title="رفع شعار من الجهاز"
                                        >
                                            <Upload size={18} />
                                        </label>
                                    </div>
                                    {settings.logoUrl && (
                                        <div className="mt-3 p-2 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-800 inline-block">
                                            <img src={settings.logoUrl} alt="الشعار" className="h-12 w-auto object-contain max-w-full mix-blend-multiply dark:mix-blend-normal" />
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Contact Info Card */}
                        <div className="bg-white dark:bg-[#131b2e] p-6 rounded-2xl border border-slate-100 dark:border-slate-800 space-y-4">
                            <div className="flex items-center gap-2 mb-2">
                                <div className="p-2 bg-emerald-50 dark:bg-emerald-500/10 rounded-lg text-emerald-600 dark:text-emerald-400">
                                    <Phone size={18} />
                                </div>
                                <h3 className="font-black text-slate-800 dark:text-white">معلومات التواصل</h3>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div className="col-span-1">
                                    <label className="text-[10px] font-black text-slate-400 block mb-1">رقم الهاتف</label>
                                    <input 
                                        type="text" 
                                        className="w-full px-4 py-2 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 text-sm font-bold text-slate-800 dark:text-white"
                                        value={settings.phone}
                                        onChange={e => setSettings({...settings, phone: e.target.value})}
                                    />
                                </div>
                                <div className="col-span-1">
                                    <label className="text-[10px] font-black text-slate-400 block mb-1">واتساب</label>
                                    <input 
                                        type="text" 
                                        className="w-full px-4 py-2 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 text-sm font-bold text-slate-800 dark:text-white"
                                        value={settings.whatsapp}
                                        onChange={e => setSettings({...settings, whatsapp: e.target.value})}
                                    />
                                </div>
                                <div className="col-span-2">
                                    <label className="text-[10px] font-black text-slate-400 block mb-1">العنوان بالتفصيل</label>
                                    <input 
                                        type="text" 
                                        className="w-full px-4 py-2 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 text-sm font-bold text-slate-800 dark:text-white"
                                        value={settings.address}
                                        onChange={e => setSettings({...settings, address: e.target.value})}
                                    />
                                </div>
                                <div className="col-span-2">
                                    <label className="text-[10px] font-black text-slate-400 block mb-1">رابط جوجل ماب</label>
                                    <input 
                                        type="text" 
                                        className="w-full px-4 py-2 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 text-sm font-bold text-slate-800 dark:text-white font-mono text-xs"
                                        value={settings.googleMapsLink || ""}
                                        onChange={e => setSettings({...settings, googleMapsLink: e.target.value})}
                                        placeholder="https://maps.google.com/..."
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Tax & Registration Card */}
                        <div className="bg-white dark:bg-[#131b2e] p-6 rounded-2xl border border-slate-100 dark:border-slate-800 space-y-4 md:col-span-2">
                            <div className="flex items-center gap-2 mb-2">
                                <div className="p-2 bg-slate-50 dark:bg-slate-500/10 rounded-lg text-slate-600 dark:text-slate-400">
                                    <Hash size={18} />
                                </div>
                                <h3 className="font-black text-slate-800 dark:text-white">التراخيص والرقم الضريبي</h3>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div>
                                    <label className="text-[10px] font-black text-slate-400 block mb-1">الرقم الضريبي (إن وجد)</label>
                                    <input 
                                        type="text" 
                                        className="w-full px-4 py-2 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 text-sm font-bold text-slate-800 dark:text-white font-mono"
                                        value={settings.taxNumber || ""}
                                        onChange={e => setSettings({...settings, taxNumber: e.target.value})}
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] font-black text-slate-400 block mb-1">رقم السجل التجاري</label>
                                    <input 
                                        type="text" 
                                        className="w-full px-4 py-2 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 text-sm font-bold text-slate-800 dark:text-white font-mono"
                                        value={settings.commercialReg || ""}
                                        onChange={e => setSettings({...settings, commercialReg: e.target.value})}
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] font-black text-slate-400 block mb-1">البريد الإلكتروني الرسمي</label>
                                    <input 
                                        type="email" 
                                        className="w-full px-4 py-2 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 text-sm font-bold text-slate-800 dark:text-white"
                                        value={settings.email || ""}
                                        onChange={e => setSettings({...settings, email: e.target.value})}
                                    />
                                </div>
                            </div>
                        </div>
                    </motion.div>
                )}

                {activeTab === 'print' && (
                    <motion.div 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="grid grid-cols-1 md:grid-cols-2 gap-4"
                    >
                        {/* Print Header Toggles */}
                        <div className="bg-white dark:bg-[#131b2e] p-6 rounded-2xl border border-slate-100 dark:border-slate-800 space-y-4">
                            <div className="flex items-center gap-2 mb-2">
                                <div className="p-2 bg-indigo-50 dark:bg-indigo-500/10 rounded-lg text-indigo-600 dark:text-indigo-400">
                                    <Layout size={18} />
                                </div>
                                <h3 className="font-black text-slate-800 dark:text-white">محتوى هيدر الفاتورة</h3>
                            </div>

                            <div className="grid grid-cols-1 gap-2">
                                {[
                                    { id: 'printLogo', label: 'عرض الشعار الرئيسي', icon: Image },
                                    { id: 'printStoreName', label: 'عرض اسم المتجر', icon: Store },
                                    { id: 'printPhone', label: 'عرض أرقام الهاتف', icon: Phone },
                                    { id: 'printAddress', label: 'عرض عنوان المركز', icon: MapPin },
                                    { id: 'printWhatsapp', label: 'عرض أيقونة الواتساب', icon: MessageSquare },
                                    { id: 'printQR', label: 'إدراج كود QR (الفاتورة الذكية)', icon: QrCode },
                                ].map((item) => {
                                    const Icon = item.icon;
                                    const key = item.id as keyof StoreSettings;
                                    return (
                                        <button
                                            key={item.id}
                                            onClick={() => setSettings({...settings, [key]: !settings[key]})}
                                            className="flex items-center justify-between p-3 rounded-xl border border-slate-50 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-all cursor-pointer group"
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className={cn(
                                                    "p-1.5 rounded-lg transition-colors",
                                                    settings[key] ? "bg-primary/10 text-primary" : "bg-slate-100 dark:bg-slate-800 text-slate-400"
                                                )}>
                                                    <Icon size={14} />
                                                </div>
                                                <span className="text-xs font-bold text-slate-700 dark:text-slate-300">{item.label}</span>
                                            </div>
                                            <div className={cn(
                                                "w-8 h-4 rounded-full relative transition-colors",
                                                settings[key] ? "bg-primary" : "bg-slate-200 dark:bg-slate-700"
                                            )}>
                                                <div className={cn(
                                                    "absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all",
                                                    settings[key] ? "left-4.5" : "left-0.5"
                                                )} />
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Print Config & Footer */}
                        <div className="bg-white dark:bg-[#131b2e] p-6 rounded-2xl border border-slate-100 dark:border-slate-800 space-y-6">
                            <div className="space-y-4">
                                <div className="flex items-center gap-2 mb-2">
                                    <div className="p-2 bg-orange-50 dark:bg-orange-500/10 rounded-lg text-orange-600 dark:text-orange-400">
                                        <Printer size={18} />
                                    </div>
                                    <h3 className="font-black text-slate-800 dark:text-white">إعدادات الطابعة والفوتر</h3>
                                </div>

                                <div>
                                    <label className="text-[10px] font-black text-slate-400 block mb-1">حجم الطباعة الافتراضي</label>
                                    <select 
                                        className="w-full px-4 py-2 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 text-sm font-bold text-slate-800 dark:text-white outline-none"
                                        value={settings.defaultPrintSize}
                                        onChange={e => setSettings({...settings, defaultPrintSize: e.target.value as any})}
                                    >
                                        <option value="A4">Standard A4</option>
                                        <option value="A3">Wide A3</option>
                                        <option value="Thermal 80mm">Thermal POS (80mm)</option>
                                        <option value="Thermal 58mm">Thermal POS (58mm)</option>
                                        <option value="PDF">Direct PDF Export</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="text-[10px] font-black text-slate-400 block mb-1">رسالة تذييل الفاتورة (Footer Message)</label>
                                    <textarea 
                                        rows={3}
                                        className="w-full px-4 py-2 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 text-sm font-bold text-slate-800 dark:text-white outline-none resize-none"
                                        value={settings.printFooterText}
                                        onChange={e => setSettings({...settings, printFooterText: e.target.value})}
                                        placeholder="مثال: شكراً لزيارتكم..."
                                    />
                                    <p className="text-[9px] text-slate-400 mt-1">تظهر هذه الرسالة في أسفل الفاتورة المطبوعة</p>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                )}

                {activeTab === 'appearance' && (
                    <motion.div 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="grid grid-cols-1 md:grid-cols-2 gap-4"
                    >
                        {/* Theme Card */}
                        <div className="bg-white dark:bg-[#131b2e] p-6 rounded-2xl border border-slate-100 dark:border-slate-800 space-y-4">
                            <div className="flex items-center gap-2 mb-2">
                                <div className="p-2 bg-rose-50 dark:bg-rose-500/10 rounded-lg text-rose-600 dark:text-rose-400">
                                    <Palette size={18} />
                                </div>
                                <h3 className="font-black text-slate-800 dark:text-white">تفضيلات المظهر</h3>
                            </div>

                            <div className="space-y-4">
                                <div>
                                    <label className="text-[10px] font-black text-slate-400 block mb-1">الوضع الافتراضي للنظام</label>
                                    <div className="grid grid-cols-3 gap-2">
                                        {(['light', 'dark', 'system'] as const).map(t => (
                                            <button 
                                                key={t}
                                                onClick={() => setSettings({...settings, defaultTheme: t})}
                                                className={cn(
                                                    "py-3 rounded-xl border text-[10px] font-black transition-all cursor-pointer uppercase",
                                                    settings.defaultTheme === t 
                                                        ? "bg-primary/10 border-primary text-primary" 
                                                        : "border-slate-100 dark:border-slate-800 text-slate-500"
                                                )}
                                            >
                                                {t === 'light' ? 'Light' : t === 'dark' ? 'Dark' : 'System'}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-[10px] font-black text-slate-400 block mb-1">اللون الرئيسي</label>
                                        <div className="flex items-center gap-2">
                                            <input 
                                                type="color" 
                                                className="w-10 h-10 rounded-full border-none cursor-pointer"
                                                value={settings.primaryColor}
                                                onChange={e => setSettings({...settings, primaryColor: e.target.value})}
                                            />
                                            <span className="font-mono text-xs font-bold text-slate-500 uppercase">{settings.primaryColor}</span>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-black text-slate-400 block mb-1">لون التمييز</label>
                                        <div className="flex items-center gap-2">
                                            <input 
                                                type="color" 
                                                className="w-10 h-10 rounded-full border-none cursor-pointer"
                                                value={settings.accentColor}
                                                onChange={e => setSettings({...settings, accentColor: e.target.value})}
                                            />
                                            <span className="font-mono text-xs font-bold text-slate-500 uppercase">{settings.accentColor}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Language Card */}
                        <div className="bg-white dark:bg-[#131b2e] p-6 rounded-2xl border border-slate-100 dark:border-slate-800 space-y-4">
                            <div className="flex items-center gap-2 mb-2">
                                <div className="p-2 bg-indigo-50 dark:bg-indigo-500/10 rounded-lg text-indigo-600 dark:text-indigo-400">
                                    <Languages size={18} />
                                </div>
                                <h3 className="font-black text-slate-800 dark:text-white">اللغة والنظام</h3>
                            </div>

                            <div className="space-y-4">
                                <div>
                                    <label className="text-[10px] font-black text-slate-400 block mb-1">لغة طباعة الفواتير والتقارير</label>
                                    <div className="grid grid-cols-1 gap-2">
                                        {(['ar', 'en', 'bilingual'] as const).map(l => (
                                            <button 
                                                key={l}
                                                onClick={() => setSettings({...settings, language: l})}
                                                className={cn(
                                                    "flex items-center justify-between p-3 rounded-xl border text-xs font-black transition-all cursor-pointer",
                                                    settings.language === l 
                                                        ? "bg-primary/10 border-primary text-primary" 
                                                        : "border-slate-100 dark:border-slate-800 text-slate-500"
                                                )}
                                            >
                                                <span>{l === 'ar' ? 'العربية (Arabic)' : l === 'en' ? 'English' : 'ثنائي اللغة (Bilingual)'}</span>
                                                {settings.language === l && <Check size={14} />}
                                            </button>
                                        ))}
                                    </div>
                                    <p className="text-[9px] text-slate-400 mt-2">ملاحظة: لغة الواجهة الأساسية تظل العربية (RTL First)</p>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                )}
            </div>

            {/* Bottom Bar Settings Action */}
            <div className="flex items-center justify-between pt-4 border-t border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-2">
                    {saveSuccess && (
                        <motion.div 
                            initial={{ opacity: 0, x: -10 }} 
                            animate={{ opacity: 1, x: 0 }} 
                            className="text-emerald-500 text-xs font-black flex items-center gap-1 bg-emerald-50 dark:bg-emerald-500/10 px-3 py-1 rounded-lg"
                        >
                            <Check size={14} /> تم الحفظ بنجاح
                        </motion.div>
                    )}
                </div>
                <button 
                    onClick={handleSave}
                    disabled={isSaving}
                    className="flex items-center gap-2 px-8 py-2.5 bg-primary hover:bg-primary/90 text-white rounded-xl text-xs font-black transition-all disabled:opacity-70 shadow-lg shadow-primary/20 cursor-pointer active:scale-95"
                >
                    <Save size={14} className={isSaving ? "animate-pulse" : ""} />
                    {isSaving ? "جاري الحفظ..." : "حفظ جميع التغييرات"}
                </button>
            </div>
        </div>
    );
}

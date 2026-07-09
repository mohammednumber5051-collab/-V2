import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, Download, Share, Smartphone, Laptop, PlusSquare, Monitor, ExternalLink } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: Array<string>;
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

export default function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showBanner, setShowBanner] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const [isInIframe, setIsInIframe] = useState(false);
  
  // Modals for manual instructions
  const [showIOSInstructions, setShowIOSInstructions] = useState(false);
  const [showDesktopInstructions, setShowDesktopInstructions] = useState(false);
  const [showAndroidInstructions, setShowAndroidInstructions] = useState(false);
  const [showIframeInstructions, setShowIframeInstructions] = useState(false);

  useEffect(() => {
    const handleManualTrigger = () => {
      setShowBanner(true);
      
      const inIframe = window.self !== window.top;
      if (inIframe) {
        setShowIframeInstructions(true);
      } else {
        const userAgent = window.navigator.userAgent;
        const isIOSDevice = /iPad|iPhone|iPod/.test(userAgent) && !(window as any).MSStream;
        const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);
        
        if (isIOSDevice) {
          setShowIOSInstructions(true);
        } else if (deferredPrompt) {
          deferredPrompt.prompt().catch(err => {
            console.warn("Prompt failed:", err);
            if (!isMobileDevice) {
              setShowDesktopInstructions(true);
            } else {
              setShowAndroidInstructions(true);
            }
          });
        } else if (!isMobileDevice) {
          setShowDesktopInstructions(true);
        } else {
          setShowAndroidInstructions(true);
        }
      }
    };

    window.addEventListener("show-pwa-install-modal", handleManualTrigger);
    return () => {
      window.removeEventListener("show-pwa-install-modal", handleManualTrigger);
    };
  }, [deferredPrompt]);

  useEffect(() => {
    // 1. Detect if the app is already running in standalone mode (installed)
    const isStandalone = 
      window.matchMedia('(display-mode: standalone)').matches || 
      (window.navigator as any).standalone === true;

    if (isStandalone) {
      return;
    }

    // 2. Check if the app is rendered in an iFrame
    const inIframe = window.self !== window.top;
    setIsInIframe(inIframe);

    // 3. Check if user dismissed the install banner recently
    const dismissedAt = localStorage.getItem("pwa_install_dismissed_at");
    if (dismissedAt) {
      const lastDismissed = new Date(dismissedAt).getTime();
      const now = new Date().getTime();
      const threeDays = 3 * 24 * 60 * 60 * 1000;
      if (now - lastDismissed < threeDays) {
        return;
      }
    }

    // 4. Detect Device Type (Desktop vs Mobile)
    const userAgent = window.navigator.userAgent;
    const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);
    setIsDesktop(!isMobileDevice);

    // 5. Detect iOS Safari
    const isIOSDevice = /iPad|iPhone|iPod/.test(userAgent) && !(window as any).MSStream;
    const isSafariBrowser = /Safari/.test(userAgent) && !/CriOS|FxiOS|OPiOS|mercury/.test(userAgent);
    
    if (isIOSDevice && isSafariBrowser) {
      setIsIOS(true);
      // Automatically show iOS PWA banner after 4 seconds
      const timer = setTimeout(() => {
        setShowBanner(true);
      }, 4000);
      return () => clearTimeout(timer);
    }

    // 6. Inside iFrame: show banner after 6 seconds explaining how to install
    if (inIframe) {
      const timer = setTimeout(() => {
        setShowBanner(true);
      }, 6000);
      return () => clearTimeout(timer);
    }

    // 7. Standard PWA install prompt handler
    const handleBeforeInstallPrompt = (e: Event) => {
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      // Automatically show install banner after 3 seconds
      setTimeout(() => {
        setShowBanner(true);
      }, 3000);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    // Fallback: If on desktop/android but beforeinstallprompt didn't fire (e.g. because of no interaction yet or browser support)
    // we still show the banner after 8 seconds so the user knows they can install it!
    const fallbackTimer = setTimeout(() => {
      setShowBanner((prev) => {
        return prev ? prev : true;
      });
    }, 8000);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      clearTimeout(fallbackTimer);
    };
  }, []);

  const handleInstallClick = async () => {
    if (isInIframe) {
      setShowIframeInstructions(true);
      return;
    }

    if (isIOS) {
      setShowIOSInstructions(true);
      return;
    }

    if (deferredPrompt) {
      // Show the browser install prompt
      await deferredPrompt.prompt();

      // Wait for the user to respond to the prompt
      const { outcome } = await deferredPrompt.userChoice;
      
      if (outcome === 'accepted') {
        console.log('User accepted the PWA install prompt');
        setShowBanner(false);
      }
      
      // Clear deferred prompt
      setDeferredPrompt(null);
    } else {
      // No prompt available (fallback instructions)
      if (isDesktop) {
        setShowDesktopInstructions(true);
      } else {
        setShowAndroidInstructions(true);
      }
    }
  };

  const handleDismiss = () => {
    localStorage.setItem("pwa_install_dismissed_at", new Date().toISOString());
    setShowBanner(false);
  };

  return (
    <>
      <AnimatePresence>
        {showBanner && (
          <motion.div
            initial={{ opacity: 0, y: 100, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 100, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="fixed bottom-24 left-4 right-4 md:left-auto md:right-4 md:w-[440px] bg-slate-900/95 dark:bg-slate-950/95 backdrop-blur-md text-white p-5 rounded-3xl shadow-2xl border border-slate-800 z-50 flex flex-col gap-4"
            dir="rtl"
            id="pwa-install-banner"
          >
            <div className="flex items-start gap-3.5">
              <div className="w-12 h-12 bg-blue-500/10 border border-blue-500/20 text-blue-400 rounded-2xl flex items-center justify-center shrink-0 shadow-inner">
                {isInIframe ? (
                  <ExternalLink size={24} className="animate-pulse" />
                ) : isDesktop ? (
                  <Laptop size={24} className="animate-pulse" />
                ) : (
                  <Smartphone size={24} className="animate-bounce" />
                )}
              </div>
              <div className="flex-1 space-y-1">
                <h3 className="text-xs font-black tracking-tight text-blue-400">
                  {isInIframe 
                    ? "تثبيت تطبيق عصار للبصريات 💻📱"
                    : isDesktop 
                      ? "تثبيت تطبيق عصار للبصريات للكمبيوتر" 
                      : "تثبيت تطبيق عصار للبصريات على الهاتف"
                  }
                </h3>
                <p className="text-[11px] leading-relaxed font-bold text-slate-300">
                  {isInIframe 
                    ? "لتثبيت التطبيق على جهازك، يرجى فتحه أولاً خارج نافذة المعاينة (في متصفح مستقل)."
                    : isIOS 
                      ? "أضف تطبيق عصار للبصريات إلى شاشتك الرئيسية للوصول السريع والعمل حتى دون اتصال بالإنترنت."
                      : isDesktop
                        ? "ثبّت التطبيق الآن على جهاز الكمبيوتر الخاص بك لتشغيله كبرنامج مستقل مع وصول سريع من سطح المكتب وأداء فائق السرعة."
                        : "احصل على تجربة أسرع وسلسة مع إشعارات المبيعات والوصول السريع من الشاشة الرئيسية مباشرة."
                  }
                </p>
              </div>
              <button 
                onClick={handleDismiss}
                className="p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
                id="pwa-dismiss-btn"
              >
                <X size={16} />
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleInstallClick}
                className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-500 active:scale-95 text-white text-xs font-black rounded-xl shadow-lg shadow-blue-600/20 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                id="pwa-install-btn"
              >
                <Download size={14} />
                {isInIframe ? "طريقة التفعيل والتثبيت" : "تثبيت الآن كتطبيق"}
              </button>
              <button
                onClick={handleDismiss}
                className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-300 hover:text-white text-xs font-bold rounded-xl transition-all cursor-pointer"
                id="pwa-later-btn"
              >
                لاحقاً
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* iFrame Instructions Modal */}
      <AnimatePresence>
        {showIframeInstructions && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" id="iframe-instructions-modal">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setShowIframeInstructions(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white dark:bg-[#131b2e] border border-slate-100 dark:border-slate-800 w-full max-w-sm rounded-[2rem] p-6 shadow-2xl text-right flex flex-col gap-5 text-slate-800 dark:text-slate-100 transition-colors"
              dir="rtl"
            >
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                    <ExternalLink size={16} />
                  </div>
                  <h3 className="text-sm font-black">فتح التطبيق للتثبيت</h3>
                </div>
                <button
                  onClick={() => setShowIframeInstructions(false)}
                  className="p-1.5 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700/80 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl transition-all cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="space-y-4 text-xs font-bold leading-relaxed text-slate-600 dark:text-slate-300">
                <p className="text-red-500 dark:text-red-400 font-extrabold text-sm">⚠️ ميزة التثبيت معطلة داخل نافذة المعاينة حالياً!</p>
                <p>تمنع المتصفحات تثبيت التطبيقات من داخل نوافذ المعاينة المصغرة (iFrame). لتفعيل التثبيت الكامل على جهازك:</p>
                
                <div className="space-y-3">
                  <div className="flex items-start gap-3 bg-slate-50 dark:bg-slate-900/50 p-3 rounded-2xl border border-slate-100 dark:border-slate-800">
                    <span className="w-5 h-5 rounded-lg bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 flex items-center justify-center text-[10px] font-black shrink-0">١</span>
                    <div className="flex-1">
                      اضغط على زر <strong className="text-blue-600 dark:text-blue-400">"فتح في نافذة جديدة" (أيقونة السهم ↗)</strong> الموجودة في أعلى يسار شاشة المعاينة الحالية.
                    </div>
                  </div>

                  <div className="flex items-start gap-3 bg-slate-50 dark:bg-slate-900/50 p-3 rounded-2xl border border-slate-100 dark:border-slate-800">
                    <span className="w-5 h-5 rounded-lg bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 flex items-center justify-center text-[10px] font-black shrink-0">٢</span>
                    <div className="flex-1">
                      سيفتح التطبيق في صفحة مستقلة كاملة تدعم التثبيت بشكل تلقائي.
                    </div>
                  </div>

                  <div className="flex items-start gap-3 bg-slate-50 dark:bg-slate-900/50 p-3 rounded-2xl border border-slate-100 dark:border-slate-800">
                    <span className="w-5 h-5 rounded-lg bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 flex items-center justify-center text-[10px] font-black shrink-0">٣</span>
                    <div className="flex-1">
                      ستظهر لك لافتة التثبيت هناك مباشرة على الهاتف أو الكمبيوتر لتثبيته بنقرة واحدة.
                    </div>
                  </div>
                </div>
              </div>

              <button
                onClick={() => setShowIframeInstructions(false)}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-black text-xs rounded-xl shadow-lg shadow-blue-600/20 transition-all cursor-pointer"
              >
                حسناً، سأفتحه في نافذة جديدة
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* iOS Instructions Modal */}
      <AnimatePresence>
        {showIOSInstructions && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" id="ios-instructions-modal">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setShowIOSInstructions(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white dark:bg-[#131b2e] border border-slate-100 dark:border-slate-800 w-full max-w-sm rounded-[2rem] p-6 shadow-2xl text-right flex flex-col gap-5 text-slate-800 dark:text-slate-100 transition-colors"
              dir="rtl"
            >
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                    <Smartphone size={16} />
                  </div>
                  <h3 className="text-sm font-black">التثبيت على أجهزة iPhone / iPad</h3>
                </div>
                <button
                  onClick={() => setShowIOSInstructions(false)}
                  className="p-1.5 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700/80 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl transition-all cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="space-y-4 text-xs font-bold leading-relaxed text-slate-600 dark:text-slate-300">
                <p>لتثبيت تطبيق عصار للبصريات على هاتفك، يرجى اتباع الخطوات البسيطة التالية:</p>
                
                <div className="space-y-3.5">
                  <div className="flex items-start gap-3 bg-slate-50 dark:bg-slate-900/50 p-3 rounded-2xl border border-slate-100 dark:border-slate-800">
                    <span className="w-5 h-5 rounded-lg bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 flex items-center justify-center text-[10px] font-black shrink-0">١</span>
                    <div className="flex-1">
                      انقر على زر مشاركة المتصفح <strong className="text-blue-600 dark:text-blue-400 inline-flex items-center gap-0.5"><Share size={12} /> (Share)</strong> في أسفل شاشة المتصفح Safari.
                    </div>
                  </div>

                  <div className="flex items-start gap-3 bg-slate-50 dark:bg-slate-900/50 p-3 rounded-2xl border border-slate-100 dark:border-slate-800">
                    <span className="w-5 h-5 rounded-lg bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 flex items-center justify-center text-[10px] font-black shrink-0">٢</span>
                    <div className="flex-1">
                      اسحب قائمة الخيارات لأسفل واختر <strong className="text-blue-600 dark:text-blue-400 inline-flex items-center gap-0.5">إضافة إلى الشاشة الرئيسية <PlusSquare size={12} /> (Add to Home Screen)</strong>.
                    </div>
                  </div>

                  <div className="flex items-start gap-3 bg-slate-50 dark:bg-slate-900/50 p-3 rounded-2xl border border-slate-100 dark:border-slate-800">
                    <span className="w-5 h-5 rounded-lg bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 flex items-center justify-center text-[10px] font-black shrink-0">٣</span>
                    <div className="flex-1">
                      انقر على زر <strong>إضافة (Add)</strong> في الزاوية العلوية اليمنى لإكمال التثبيت.
                    </div>
                  </div>
                </div>
              </div>

              <button
                onClick={() => setShowIOSInstructions(false)}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-black text-xs rounded-xl shadow-lg shadow-blue-600/20 transition-all cursor-pointer"
              >
                حسناً، فهمت ذلك
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Desktop Manual Instructions Modal */}
      <AnimatePresence>
        {showDesktopInstructions && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" id="desktop-instructions-modal">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setShowDesktopInstructions(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white dark:bg-[#131b2e] border border-slate-100 dark:border-slate-800 w-full max-w-sm rounded-[2rem] p-6 shadow-2xl text-right flex flex-col gap-5 text-slate-800 dark:text-slate-100 transition-colors"
              dir="rtl"
            >
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                    <Laptop size={16} />
                  </div>
                  <h3 className="text-sm font-black">التثبيت على جهاز الكمبيوتر</h3>
                </div>
                <button
                  onClick={() => setShowDesktopInstructions(false)}
                  className="p-1.5 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700/80 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl transition-all cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="space-y-4 text-xs font-bold leading-relaxed text-slate-600 dark:text-slate-300">
                <p>يمكنك تشغيل التطبيق كبرنامج مستقل على نظام Windows أو macOS أو Linux بسهولة من خلال المتصفح:</p>
                
                <div className="space-y-3">
                  <div className="flex items-start gap-3 bg-slate-50 dark:bg-slate-900/50 p-3 rounded-2xl border border-slate-100 dark:border-slate-800">
                    <span className="w-5 h-5 rounded-lg bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 flex items-center justify-center text-[10px] font-black shrink-0">١</span>
                    <div className="flex-1">
                      <strong>متصفح Chrome / Edge:</strong> اضغط على أيقونة التثبيت <strong className="text-blue-600 dark:text-blue-400">(شاشة كمبيوتر مع سهم لأسفل)</strong> التي تظهر في شريط العنوان بالأعلى بجانب النجمة والمشاركة.
                    </div>
                  </div>

                  <div className="flex items-start gap-3 bg-slate-50 dark:bg-slate-900/50 p-3 rounded-2xl border border-slate-100 dark:border-slate-800">
                    <span className="w-5 h-5 rounded-lg bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 flex items-center justify-center text-[10px] font-black shrink-0">٢</span>
                    <div className="flex-1">
                      <strong>خيار بديل:</strong> اضغط على القائمة الجانبية للمتصفح <strong className="text-blue-600 dark:text-blue-400">(⋮ أو ⋯)</strong> في الأعلى ثم اختر <strong>"تثبيت تطبيق عصار للبصريات"</strong>.
                    </div>
                  </div>

                  <div className="flex items-start gap-3 bg-slate-50 dark:bg-slate-900/50 p-3 rounded-2xl border border-slate-100 dark:border-slate-800">
                    <span className="w-5 h-5 rounded-lg bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 flex items-center justify-center text-[10px] font-black shrink-0">٣</span>
                    <div className="flex-1">
                      <strong>متصفح Safari على Mac:</strong> انقر على زر <strong>مشاركة (Share)</strong> في شريط الأدوات العلوي، ثم اختر <strong>"إضافة إلى Dock" (Add to Dock)</strong>.
                    </div>
                  </div>
                </div>
              </div>

              <button
                onClick={() => setShowDesktopInstructions(false)}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-black text-xs rounded-xl shadow-lg shadow-blue-600/20 transition-all cursor-pointer"
              >
                فهمت، سأقوم بالتثبيت الآن
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Android Manual Instructions Modal */}
      <AnimatePresence>
        {showAndroidInstructions && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" id="android-instructions-modal">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setShowAndroidInstructions(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white dark:bg-[#131b2e] border border-slate-100 dark:border-slate-800 w-full max-w-sm rounded-[2rem] p-6 shadow-2xl text-right flex flex-col gap-5 text-slate-800 dark:text-slate-100 transition-colors"
              dir="rtl"
            >
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                    <Smartphone size={16} />
                  </div>
                  <h3 className="text-sm font-black">التثبيت على أجهزة Android</h3>
                </div>
                <button
                  onClick={() => setShowAndroidInstructions(false)}
                  className="p-1.5 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700/80 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl transition-all cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="space-y-4 text-xs font-bold leading-relaxed text-slate-600 dark:text-slate-300">
                <p>لتثبيت التطبيق على هاتفك بنظام Android، يرجى تتبع ما يلي:</p>
                
                <div className="space-y-3">
                  <div className="flex items-start gap-3 bg-slate-50 dark:bg-slate-900/50 p-3 rounded-2xl border border-slate-100 dark:border-slate-800">
                    <span className="w-5 h-5 rounded-lg bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 flex items-center justify-center text-[10px] font-black shrink-0">١</span>
                    <div className="flex-1">
                      اضغط على زر الخيارات <strong className="text-blue-600 dark:text-blue-400">(⋮)</strong> في الزاوية العلوية اليمنى أو السفلية لمتصفح Chrome أو Edge.
                    </div>
                  </div>

                  <div className="flex items-start gap-3 bg-slate-50 dark:bg-slate-900/50 p-3 rounded-2xl border border-slate-100 dark:border-slate-800">
                    <span className="w-5 h-5 rounded-lg bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 flex items-center justify-center text-[10px] font-black shrink-0">٢</span>
                    <div className="flex-1">
                      اختر <strong>"تثبيت التطبيق" (Install App)</strong> أو <strong>"إضافة إلى الشاشة الرئيسية" (Add to Home screen)</strong> من القائمة المنسدلة.
                    </div>
                  </div>

                  <div className="flex items-start gap-3 bg-slate-50 dark:bg-slate-900/50 p-3 rounded-2xl border border-slate-100 dark:border-slate-800">
                    <span className="w-5 h-5 rounded-lg bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 flex items-center justify-center text-[10px] font-black shrink-0">٣</span>
                    <div className="flex-1">
                      انقر على <strong>تثبيت</strong> أو <strong>إضافة</strong> لتثبيت التطبيق ليظهر على شاشتك الرئيسية بجانب تطبيقاتك الأخرى.
                    </div>
                  </div>
                </div>
              </div>

              <button
                onClick={() => setShowAndroidInstructions(false)}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-black text-xs rounded-xl shadow-lg shadow-blue-600/20 transition-all cursor-pointer"
              >
                حسناً، فهمت ذلك
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}

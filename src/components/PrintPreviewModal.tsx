import React, { useRef, useState, useEffect } from "react";
import { X, Printer, FileText, ScrollText, Download } from "lucide-react";
import { useReactToPrint } from "react-to-print";
import { motion, AnimatePresence } from "motion/react";
import html2pdf from "html2pdf.js";

interface PrintPreviewModalProps {
    isOpen: boolean;
    onClose: () => void;
    htmlContent: string;
    title: string;
    paperSize?: 'a4' | 'thermal';
    orientation?: 'portrait' | 'landscape';
}

export default function PrintPreviewModal({ isOpen, onClose, htmlContent, title, paperSize = 'a4', orientation = 'portrait' }: PrintPreviewModalProps) {
    const printRef = useRef<HTMLDivElement>(null);
    const [currentPaperSize, setCurrentPaperSize] = useState<'a4' | 'thermal'>(paperSize);

    useEffect(() => {
        if (isOpen) setCurrentPaperSize(paperSize);
    }, [isOpen, paperSize]);

    const handlePrint = useReactToPrint({
        contentRef: printRef,
        documentTitle: title,
        pageStyle: currentPaperSize === 'thermal' 
            ? "@page { size: 80mm auto; margin: 0; } @media print { body { -webkit-print-color-adjust: exact; margin: 0; padding: 1mm 3mm; font-size: 11px; width: 80mm; } .print-container, .report-container, #invoice_wrapper { width: 100% !important; max-width: 100% !important; box-sizing: border-box !important; } }"
            : `@page { size: A4 ${orientation}; margin: 5mm; } @media print { body { -webkit-print-color-adjust: exact; margin: 0; zoom: 0.95; } }`
    });

    const handleExportPDF = () => {
        if (!printRef.current) return;
        const element = printRef.current;
        const isThermal = currentPaperSize === 'thermal';
        const format = isThermal ? [80, 200] as [number, number] : 'a4';

        const opt = {
            margin: isThermal ? 2 : ([6, 6, 6, 6] as [number, number, number, number]),
            filename: `${title.replace(/ /g, '_')}_${Date.now()}.pdf`,
            image: { type: 'jpeg' as const, quality: 0.98 },
            html2canvas: { 
                scale: 2, 
                useCORS: true,
                scrollY: 0,
                scrollX: 0,
                letterRendering: true
            },
            jsPDF: { unit: 'mm', format: format, orientation: isThermal ? 'portrait' : orientation },
            pagebreak: { 
                mode: ['avoid-all', 'css', 'legacy'],
                avoid: ['tr', 'th', 'td', '.summary-card', '.no-break', '.card', '.header-box', '.fin-card', '.info-item', '.cards-row']
            }
        };

        html2pdf().set(opt).from(element).save();
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-[200] flex items-center justify-center p-2 sm:p-4">
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={onClose}
                    className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
                />
                <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 20 }}
                    className="bg-slate-100 dark:bg-slate-900 w-full max-w-4xl h-[95vh] sm:h-[90vh] rounded-[2rem] shadow-2xl overflow-hidden relative z-10 flex flex-col border border-slate-200 dark:border-slate-800"
                >
                    {/* Header */}
                    <div className="p-3 md:p-5 border-b border-slate-200 dark:border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between bg-white dark:bg-slate-950 shrink-0 gap-3">
                        <div className="flex items-center justify-between w-full md:w-auto">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-blue-100 dark:bg-blue-500/10 rounded-2xl flex items-center justify-center text-blue-600 dark:text-blue-400">
                                    <Printer size={20} />
                                </div>
                                <div>
                                    <h3 className="text-sm md:text-base font-black text-slate-900 dark:text-white">معاينة قبل الطباعة</h3>
                                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider line-clamp-1">{title}</p>
                                </div>
                            </div>
                            <button
                                onClick={onClose}
                                className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 bg-slate-50 dark:bg-slate-800 rounded-xl transition-colors"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <div className="flex flex-col sm:flex-row items-center justify-center gap-2 w-full md:w-auto">
                            <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl w-full sm:w-auto justify-center">
                                <button
                                    onClick={() => setCurrentPaperSize('a4')}
                                    className={`flex-1 sm:flex-none flex justify-center items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] md:text-xs font-black transition-all ${currentPaperSize === 'a4' ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300'}`}
                                >
                                    <FileText size={14} /> A4
                                </button>
                                <button
                                    onClick={() => setCurrentPaperSize('thermal')}
                                    className={`flex-1 sm:flex-none flex justify-center items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] md:text-xs font-black transition-all ${currentPaperSize === 'thermal' ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300'}`}
                                >
                                    <ScrollText size={14} /> كاشير 80mm
                                </button>
                            </div>
                            <div className="flex items-center gap-2 w-full sm:w-auto">
                                <button
                                    onClick={handleExportPDF}
                                    className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 bg-emerald-600 text-white px-3 md:px-4 py-2 rounded-xl font-black text-[11px] md:text-xs shadow-lg shadow-emerald-500/20 hover:bg-emerald-700 transition-all active:scale-95"
                                >
                                    <Download size={14} />
                                    حفظ PDF
                                </button>
                                <button
                                    onClick={() => handlePrint()}
                                    className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 bg-blue-600 text-white px-3 md:px-4 py-2 rounded-xl font-black text-[11px] md:text-xs shadow-lg shadow-blue-500/20 hover:bg-blue-700 transition-all active:scale-95"
                                >
                                    <Printer size={14} />
                                    طباعة
                                </button>
                                <button
                                    onClick={onClose}
                                    className="hidden md:flex p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 bg-slate-50 dark:bg-slate-800 rounded-xl transition-colors"
                                >
                                    <X size={20} />
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Preview Area */}
                    <div className="flex-1 overflow-y-auto p-4 md:p-8 bg-slate-200 dark:bg-slate-950/50 custom-scrollbar flex justify-center">
                        <div 
                            ref={printRef}
                            className={`bg-white text-black shadow-lg origin-top transition-all overflow-visible ${
                                currentPaperSize === 'thermal' 
                                    ? 'w-[74mm] p-2.5 text-[11px] print:w-[72mm] print:mx-auto print:p-0 print:shadow-none' 
                                    : orientation === 'landscape'
                                        ? 'w-[297mm] min-h-[210mm] p-6 max-w-full overflow-x-auto'
                                        : 'w-[210mm] min-h-[297mm] p-6'
                            }`}
                            style={{ 
                                direction: 'rtl',
                                fontFamily: "'Cairo', sans-serif"
                            }}
                            dangerouslySetInnerHTML={{ 
                                __html: `
                                    <style>
                                        table { border-collapse: collapse !important; }
                                        tr, th, td { page-break-inside: avoid !important; break-inside: avoid !important; }
                                        thead { display: table-header-group !important; }
                                        tfoot { display: table-footer-group !important; }
                                        .no-break, .summary-card, .header-box, .info-grid, .fin-grid, .card, .cards-row { page-break-inside: avoid !important; break-inside: avoid !important; }
                                    </style>
                                    ${htmlContent}
                                `
                            }}
                        />
                    </div>

                    {/* Footer Warning */}
                    <div className="p-3 bg-amber-50 dark:bg-amber-900/10 border-t border-amber-100 dark:border-amber-900/20 text-center shrink-0">
                        <p className="text-[10px] font-black text-amber-800 dark:text-amber-200">
                            في نافذة الطباعة القادمة، يمكنك اختيار طابعة الكاشير أو حفظ الملف بصيغة PDF.
                        </p>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
}

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-slate-50 dark:bg-slate-950">
          <div className="max-w-md w-full premium-card p-8 text-center space-y-6">
            <div className="flex justify-center">
              <div className="p-4 bg-amber-100 dark:bg-amber-900/30 rounded-full">
                <AlertTriangle className="w-12 h-12 text-amber-600 dark:text-amber-500" />
              </div>
            </div>
            
            <div className="space-y-2">
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white">حدث خطأ غير متوقع</h1>
              <p className="text-slate-600 dark:text-slate-400">
                لقد واجه التطبيق مشكلة تقنية. لقد تم تسجيل الخطأ للمراجعة.
              </p>
            </div>

            <div className="bg-slate-100 dark:bg-slate-900 p-4 rounded-lg text-left overflow-auto max-h-32">
              <code className="text-xs text-red-500 whitespace-pre-wrap">
                {this.state.error?.message}
              </code>
            </div>

            <button
              onClick={() => window.location.reload()}
              className="w-full py-4 bg-primary text-white font-bold rounded-xl flex items-center justify-center gap-2 hover:bg-primary/90 transition-all active:scale-95"
            >
              <RotateCcw className="w-5 h-5" />
              إعادة تحميل التطبيق
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;

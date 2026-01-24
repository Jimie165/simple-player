import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

interface Props {
    children?: ReactNode;
    fallback?: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false,
        error: null
    };

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error('Uncaught error:', error, errorInfo);
    }

    public render() {
        if (this.state.hasError) {
            if (this.props.fallback) {
                return this.props.fallback;
            }

            return (
                <div className="flex h-full w-full flex-col items-center justify-center p-8 text-center text-neutral-600 dark:text-neutral-400">
                    <h2 className="mb-2 text-xl font-semibold text-neutral-900 dark:text-neutral-100">
                        哎呀，出错了
                    </h2>
                    <p className="mb-4 max-w-md text-sm opacity-80">
                        加载此视图时遇到问题。请尝试关闭并重新打开。
                    </p>
                    {this.state.error && (
                        <pre className="mb-4 max-w-lg overflow-auto rounded bg-neutral-100 p-2 text-left text-xs dark:bg-neutral-800">
                            {this.state.error.message}
                        </pre>
                    )}
                </div>
            );
        }

        return this.props.children;
    }
}

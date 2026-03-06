import { Component, ErrorInfo, ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
  fallbackTitle?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    hasError: false
  };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-5 text-red-100">
          <p className="text-xs font-bold uppercase tracking-widest text-red-200/80">Rendering error</p>
          <p className="mt-2 text-sm font-semibold">{this.props.fallbackTitle ?? "Something went wrong."}</p>
          <p className="mt-1 text-xs text-red-200/80">Try refreshing this view or retrying your last action.</p>
        </div>
      );
    }

    return this.props.children;
  }
}

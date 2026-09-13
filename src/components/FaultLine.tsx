/**
 * FaultLine.tsx — the last line of defence.
 *
 * If the UI ever crashes, the operator sees a sealed, in-world notice and a
 * way back — never a stack trace, never a file path, never "Cannot read
 * properties of undefined". Details go to the console for the developer and
 * nowhere else. The screen deliberately says nothing about *what* broke.
 */
import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  broken: boolean;
}

export class FaultLine extends Component<Props, State> {
  state: State = { broken: false };

  static getDerivedStateFromError(): State {
    return { broken: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // For the developer, in the console only. The screen stays silent.
    console.error("[fault] the app crashed:", error?.message ?? error, info?.componentStack ?? "");
  }

  render(): ReactNode {
    if (!this.state.broken) return this.props.children;
    return (
      <div className="fault" role="alert">
        <span className="fault__kanji" aria-hidden="true">
          封
        </span>
        <h1 className="fault__title">The ledger is sealed.</h1>
        <p className="fault__copy">
          Something interrupted the session. Your data is untouched — reload
          and the gate will open again.
        </p>
        <div className="fault__actions">
          <a
            className="btn"
            href="#/"
            onClick={() => {
              try {
                window.location.hash = "#/";
              } catch {
                /* nothing left to do */
              }
              window.location.reload();
            }}
          >
            <span className="btn__slash" />
            back to the gate
          </a>
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => window.location.reload()}
          >
            <span className="btn__slash" />
            reload
          </button>
        </div>
      </div>
    );
  }
}

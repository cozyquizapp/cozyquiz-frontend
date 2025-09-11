import ReactDOM from "react-dom";

export default function ResultFeedbackPortal({ children }) {
  // Rendert einen Fullscreen-Wrapper (.result-feedback) via Portal an document.body
  return ReactDOM.createPortal(
    <div className="result-feedback">{children}</div>,
    document.body
  );
}

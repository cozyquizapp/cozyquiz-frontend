import ReactDOM from "react-dom";

export default function ResultFeedbackPortal({ children }) {
  // Rendert Kinder in ein Portal direkt in <body>, damit z-index/position sicher funktionieren
  return ReactDOM.createPortal(
    <div className="result-feedback">{children}</div>,
    document.body
  );
}

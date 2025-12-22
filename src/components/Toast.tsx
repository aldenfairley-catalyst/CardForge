import React, { useEffect } from "react";

export type ToastMessage = { id: string; message: string; kind?: "info" | "error" };

export function Toast({ message }: { message: ToastMessage }) {
  return (
    <div className={`toast ${message.kind === "error" ? "toastError" : ""}`}>
      <div className="toastMsg">{message.message}</div>
    </div>
  );
}

export function ToastHost({
  messages,
  onExpire,
  durationMs = 4200
}: {
  messages: ToastMessage[];
  onExpire: (id: string) => void;
  durationMs?: number;
}) {
  useEffect(() => {
    const timers = messages.map((msg) => window.setTimeout(() => onExpire(msg.id), durationMs));
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [messages, onExpire, durationMs]);

  if (!messages.length) return null;

  return (
    <div className="toastHost">
      {messages.map((msg) => (
        <Toast key={msg.id} message={msg} />
      ))}
    </div>
  );
}

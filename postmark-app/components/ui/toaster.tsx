"use client";

import { Toaster } from "sonner";

export function AppToaster() {
  return (
    <Toaster
      position="top-right"
      toastOptions={{
        style: {
          background: "rgba(17, 24, 39, 0.92)",
          color: "#e2e8f0",
          border: "1px solid rgba(148, 163, 184, 0.25)",
          backdropFilter: "blur(10px)",
        },
      }}
    />
  );
}











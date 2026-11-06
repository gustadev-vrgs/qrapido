"use client";

/**
 * Prints one receipt without leaving the screen: the receipt page is loaded in a hidden
 * frame and prints itself (?print=1), so only the receipt goes to the printer, never the
 * panel around it. /recibo allows being framed by the app itself (next.config.mjs).
 */
export function printReceipt(receiptUrl: string): void {
  const url = `${receiptUrl}${receiptUrl.includes("?") ? "&" : "?"}print=1`;
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.tabIndex = -1;
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none";
  frame.src = url;
  document.body.appendChild(frame);
  // Long enough for the print dialog; the frame is useless afterwards.
  window.setTimeout(() => frame.remove(), 120_000);
}

// Exportar actas y notas a PDF (ventana de impresión) y Word (.doc HTML).
// Todo en el propio navegador, sin servidores ni servicios externos.

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildDoc(title: string, contentHtml: string): string {
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
<style>
  body { font-family: "Segoe UI", Arial, sans-serif; color: #1f2430; margin: 0; padding: 2cm 1.5cm; line-height: 1.55; }
  h1 { font-size: 20pt; margin: 0 0 4pt; }
  .meta { color: #7a8290; font-size: 9pt; margin-bottom: 18pt; }
  h2 { font-size: 14pt; margin-top: 18pt; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #c9ccd4; padding: 6pt 8pt; font-size: 10pt; text-align: left; }
  th { background: #f1f2f5; }
  blockquote { border-left: 3px solid #c2603a; margin: 8pt 0; padding: 2pt 10pt; color: #55606f; }
  code { font-family: Consolas, monospace; background: #f1f2f5; padding: 1pt 3pt; }
  @page { margin: 2cm; }
</style>
</head>
<body>
<h1>${escapeHtml(title)}</h1>
<div class="meta">Brain2ai · ${new Date().toLocaleString("es-ES")}</div>
${contentHtml}
</body>
</html>`;
}

/** Abre una ventana limpia y lanza el diálogo de impresión (→ Guardar como PDF). */
export function exportPdf(title: string, contentHtml: string): boolean {
  const w = window.open("", "_blank", "width=820,height=920");
  if (!w) return false;
  w.document.open();
  w.document.write(buildDoc(title, contentHtml));
  w.document.close();
  w.focus();
  // Pequeño respiro para que el contenido pinte antes del diálogo.
  setTimeout(() => {
    try {
      w.print();
    } catch {
      /* el usuario cierra antes */
    }
  }, 300);
  return true;
}

/** Descarga un archivo .doc que Word, Google Docs o LibreOffice abren con formato. */
export function exportWordDoc(title: string, contentHtml: string): void {
  const html = buildDoc(title, contentHtml);
  const blob = new Blob(["\ufeff", html], { type: "application/msword;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${title.replace(/[\\/:*?"<>|]+/g, "-") || "documento"}.doc`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

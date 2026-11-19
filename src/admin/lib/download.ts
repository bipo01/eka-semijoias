/** Saves text as a file through a temporary object URL. */
export function downloadText(filename: string, content: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.append(a);
  a.click();
  a.remove();
  // Revoke later: some browsers start the download asynchronously.
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Local date as AAAA-MM-DD for file names. */
export function fileDate(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

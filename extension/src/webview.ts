import { randomBytes } from 'node:crypto';
export function webviewHtml(
  script: string,
  stylesheet: string,
  cspSource: string,
  product: string,
) {
  const nonce = randomBytes(24).toString('base64');
  const escape = (text: string) =>
    text.replace(
      /[&<>"']/g,
      (c) =>
        ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;',
        })[c]!,
    );
  const policy = `default-src 'none'; script-src 'nonce-${nonce}'; style-src ${cspSource} 'unsafe-inline'; img-src ${cspSource} data:; font-src ${cspSource}; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none';`;
  return `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta http-equiv="Content-Security-Policy" content="${escape(policy)}"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${escape(product)}</title><link rel="stylesheet" href="${escape(stylesheet)}"></head><body><div id="root"></div><script nonce="${nonce}" src="${escape(script)}"></script></body></html>`;
}

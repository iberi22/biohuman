const fs = require('fs');
let code = fs.readFileSync('src/lib/healthEncryption.test.ts', 'utf8');
code = code.replace(
  "const b64 = (buf: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=/g, '');",
  "const b64 = (buf: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=/g, '');"
);
fs.writeFileSync('src/lib/healthEncryption.test.ts', code);

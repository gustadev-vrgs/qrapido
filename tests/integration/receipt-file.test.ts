import assert from "node:assert/strict";
import test from "node:test";

import { jpegPdf } from "@/lib/receipt/receipt-file";

// The receipt PDF is written by hand (no library): check what a PDF reader needs.
test("PDF do recibo: estrutura válida com a imagem JPEG e a tabela xref nas posições certas", async () => {
  const fakeJpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9]);
  const blob = jpegPdf(fakeJpeg, 768, 1200);
  assert.equal(blob.type, "application/pdf");
  const text = Buffer.from(await blob.arrayBuffer()).toString("latin1");
  assert.ok(text.startsWith("%PDF-1.4"));
  assert.ok(text.trimEnd().endsWith("%%EOF"));
  assert.match(text, /\/Filter \/DCTDecode \/Length 9 >>/);
  assert.match(text, /\/MediaBox \[0 0 226\.77 354\.33\]/, "80 mm de largura, altura proporcional");
  const xrefAt = Number(text.match(/startxref\n(\d+)/)![1]);
  assert.equal(text.slice(xrefAt, xrefAt + 4), "xref");
  const entries = [...text.slice(xrefAt).matchAll(/(\d{10}) 00000 n /g)].map((match) => Number(match[1]));
  assert.equal(entries.length, 5);
  entries.forEach((offset, index) => assert.equal(text.slice(offset, offset + `${index + 1} 0 obj`.length), `${index + 1} 0 obj`, `objeto ${index + 1} na posição certa`));
  const content = text.match(/5 0 obj\n<< \/Length (\d+) >>\nstream\n([^\n]*)\nendstream/)!;
  assert.equal(Number(content[1]), content[2].length, "tamanho do conteúdo da página");
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeCsvBytes } from './csvDecoder';

test('decodeCsvBytes strips UTF-8 BOM and detects UTF-8 BOM', () => {
  const text = '日付,売上\n2025-10-01,1000\n';
  const utf8 = new TextEncoder().encode(text);
  const bomBytes = new Uint8Array(3 + utf8.length);
  bomBytes.set([0xef, 0xbb, 0xbf], 0);
  bomBytes.set(utf8, 3);

  const decoded = decodeCsvBytes(bomBytes, 'auto');
  assert.equal(decoded.detectedEncoding, 'UTF-8 BOM');
  assert.equal(decoded.text.startsWith('日付,売上'), true);
});

test('decodeCsvBytes rejects empty buffer and header-only CSV', () => {
  assert.throws(() => decodeCsvBytes(new Uint8Array(0), 'auto'), /空です/);
  const headerOnly = new TextEncoder().encode('col1,col2\n');
  assert.throws(() => decodeCsvBytes(headerOnly, 'auto'), /データ行が見つかりません/);
});

test('decodeCsvBytes falls back to Shift_JIS when invalid UTF-8 bytes are detected', () => {
  // "名前,売上\n田中,100\n" in Shift_JIS bytes:
  // 名(0x96 0xBC) 前(0x91 0x4F) , 売(0x94 0x84) 上(0x8F 0xE3) \n 田(0x93 0x63) 中(0x92 0x86) , 100
  const sjisBytes = new Uint8Array([
    0x96, 0xbc, 0x91, 0x4f, 0x2c, 0x94, 0x84, 0x8f, 0xe3, 0x0a,
    0x93, 0x63, 0x92, 0x86, 0x2c, 0x31, 0x30, 0x30,
  ]);
  const decoded = decodeCsvBytes(sjisBytes, 'auto');
  assert.equal(decoded.detectedEncoding, 'Shift_JIS');
  assert.match(decoded.text, /名前,売上/);
  assert.match(decoded.text, /田中,100/);
});

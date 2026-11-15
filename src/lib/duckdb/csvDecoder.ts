import type { CsvEncodingOption, DetectedEncodingLabel } from '@/src/types/analysis';

export interface DecodedCsvPayload {
  text: string;
  detectedEncoding: DetectedEncodingLabel;
}

/**
 * バイト配列から文字コードを自動判定（または指定文字コードでデコード）し、BOMを除去したUTF-8文字列を返す
 */
export function decodeCsvBytes(
  bytes: Uint8Array,
  encodingOption: CsvEncodingOption = 'auto'
): DecodedCsvPayload {
  if (bytes.length === 0) {
    throw new Error('選択されたCSVファイルが空です。データが入力されたCSVファイルを選択してください。');
  }

  const hasUtf8Bom =
    bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;

  let text = '';
  let detectedEncoding: DetectedEncodingLabel = 'UTF-8';

  if (encodingOption === 'shift_jis') {
    const decoder = new TextDecoder('shift_jis', { fatal: false });
    text = decoder.decode(bytes);
    detectedEncoding = 'Shift_JIS';
  } else if (encodingOption === 'utf-8') {
    const decoder = new TextDecoder('utf-8', { fatal: false });
    text = decoder.decode(hasUtf8Bom ? bytes.subarray(3) : bytes);
    detectedEncoding = hasUtf8Bom ? 'UTF-8 BOM' : 'UTF-8';
  } else {
    if (hasUtf8Bom) {
      const decoder = new TextDecoder('utf-8', { fatal: false });
      text = decoder.decode(bytes.subarray(3));
      detectedEncoding = 'UTF-8 BOM';
    } else {
      try {
        const strictUtf8 = new TextDecoder('utf-8', { fatal: true });
        text = strictUtf8.decode(bytes);
        detectedEncoding = 'UTF-8';
      } catch {
        const sjisDecoder = new TextDecoder('shift_jis', { fatal: false });
        text = sjisDecoder.decode(bytes);
        detectedEncoding = 'Shift_JIS';
      }
    }
  }

  if (text.startsWith('\uFEFF')) {
    text = text.slice(1);
  }

  const normalized = text.trim();
  if (!normalized) {
    throw new Error('CSVファイルに有効なテキストが含まれていません。');
  }

  const lines = normalized.split(/\r\n|\n|\r/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) {
    throw new Error(
      'CSVファイルにデータ行が見つかりません。ヘッダー行と1行以上のデータ行を含むCSVファイルを指定してください。'
    );
  }

  return {
    text,
    detectedEncoding,
  };
}

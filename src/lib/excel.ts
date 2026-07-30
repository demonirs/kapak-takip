import writeXlsxFile, {
  type Cell,
  type SheetData,
} from 'write-excel-file/browser';

function toCell(value: unknown): Cell {
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    value instanceof Date
  ) {
    return value;
  }

  return value == null ? '' : String(value);
}

export async function downloadExcel({
  rows,
  widths,
  sheetName,
  fileName,
}: {
  rows: Array<Record<string, unknown>>;
  widths: number[];
  sheetName: string;
  fileName: string;
}) {
  if (rows.length === 0) {
    throw new Error(
      'Excel için aktarılacak kayıt bulunamadı.'
    );
  }

  const headers = Object.keys(rows[0]);

  const sheetData: SheetData = [
    headers.map(header => ({
      value: header,
      type: String,
      fontWeight: 'bold',
      textColor: '#FFFFFF',
      backgroundColor: '#0F172A',
      alignVertical: 'center',
      wrap: true,
    })),

    ...rows.map(row =>
      headers.map(header => toCell(row[header]))
    ),
  ];

  await writeXlsxFile(sheetData, {
    sheet: sheetName,
    stickyRowsCount: 1,
    columns: headers.map((_, index) => ({
      width: widths[index] || 18,
    })),
  }).toFile(fileName);
}

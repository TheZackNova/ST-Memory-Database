import { CHAT_SHEET_GUIDE_SEED_ROWS_FIELD_ACU } from '../../../data/storage/chat-history';
import { allocateStableRowId_ACU, createStableRowIdReservation_ACU } from '../../../shared/stable-row-id-allocator';
import { logWarn_ACU } from '../../../shared/utils';

export interface SheetGuideRowIdNormalizationResult_ACU<T> {
  guideData: T;
  changed: boolean;
  blockers: string[];
}

const ROW_ID_ALIASES = new Set(['id', 'rowid', 'row-id', 'row_id', '行号']);

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function isRowIdAlias(value: unknown): boolean {
  return ROW_ID_ALIASES.has(String(value ?? '').trim().toLowerCase());
}

function label(sheet: any, key: string): string {
  return `Bảng "${String(sheet?.name ?? '') || key}" (${key})`;
}

function normalizeSeedRowWidth_ACU(row: any[], width: number): boolean {
  if (!Array.isArray(row) || width < 0) return false;
  if (row.length === width) return false;
  if (row.length > width) {
    row.length = width;
    return true;
  }
  while (row.length < width) row.push(null);
  return true;
}

export function normalizeSheetGuideRowIds_ACU<T>(guideData: T): SheetGuideRowIdNormalizationResult_ACU<T> {
  if (!guideData || typeof guideData !== 'object' || Array.isArray(guideData)) {
    return { guideData, changed: false, blockers: ['Sheet Guide phải là một đối tượng.'] };
  }
  const candidate: any = clone(guideData);
  const blockers: string[] = [];
  let changed = false;
  for (const [key, sheet] of Object.entries(candidate)) {
    if (!key.startsWith('sheet_')) continue;
    if (!sheet || typeof sheet !== 'object' || Array.isArray(sheet)) {
      blockers.push(`Sheet Guide ${key} không phải đối tượng.`);
      continue;
    }
    const content = (sheet as any).content;
    const header = Array.isArray(content) ? content[0] : null;
    const name = label(sheet, key);
    if (!Array.isArray(header) || header.length === 0) {
      blockers.push(`${name} thiếu tiêu đề hợp lệ, không thể chuẩn hóa row_id.`);
      continue;
    }
    const aliases = header.map(isRowIdAlias);
    const identityIndexes = aliases.map((matched, index) => matched ? index : -1).filter(index => index >= 0);
    if (identityIndexes.some(index => index > 0)) {
      blockers.push(`${name} có cột danh tính nằm ở cột ${identityIndexes[0] + 1}, không thể di chuyển an toàn.`);
      continue;
    }
    // `_seedRows` existed in early guide payloads and remains in older chat
    // snapshots. Preserve its field spelling while normalizing its row shape.
    const seedRowsField = Object.prototype.hasOwnProperty.call(sheet, CHAT_SHEET_GUIDE_SEED_ROWS_FIELD_ACU)
      ? CHAT_SHEET_GUIDE_SEED_ROWS_FIELD_ACU : '_seedRows';
    const seedRows = (sheet as any)[seedRowsField];
    if (seedRows !== undefined && !Array.isArray(seedRows)) {
      blockers.push(`${name} có hàng seed không phải mảng.`);
      continue;
    }
    if (Array.isArray(seedRows) && seedRows.some(row => !Array.isArray(row))) {
      blockers.push(`${name} có hàng seed không phải mảng, không thể chuẩn hóa an toàn.`);
      continue;
    }
    const businessWidth = header.length;
    const rows = Array.isArray(seedRows) ? seedRows : [];
    let trimmedCellCount = 0;
    let convergedRowCount = 0;
    if (header[0] === 'row_id') {
      // Canonical header; converge seed rows to the final header width below.
    } else if (isRowIdAlias(header[0])) {
      header[0] = 'row_id';
      changed = true;
    } else {
      for (const row of rows) {
        const before = row.length;
        if (normalizeSeedRowWidth_ACU(row, businessWidth)) {
          changed = true;
          convergedRowCount += 1;
          if (before > businessWidth) trimmedCellCount += before - businessWidth;
        }
        row.unshift(null);
        changed = true;
      }
      header.unshift('row_id');
      changed = true;
    }
    for (const row of rows) {
      const before = row.length;
      if (normalizeSeedRowWidth_ACU(row, header.length)) {
        changed = true;
        if (before !== header.length) convergedRowCount += 1;
        if (before > header.length) trimmedCellCount += before - header.length;
      }
    }
    if (trimmedCellCount > 0) {
      logWarn_ACU(`[SheetGuide] 超宽种子行已按最终表头收敛：sheetKey=${key}, headerWidth=${header.length}, convergedRows=${convergedRowCount}, removedCells=${trimmedCellCount}`);
    }
    const reserved = createStableRowIdReservation_ACU(rows);
    const seen = new Set<string>();
    for (const row of rows) {
      const id = String(row[0] ?? '').trim();
      if (!id) { row[0] = allocateStableRowId_ACU(reserved); changed = true; }
      else if (seen.has(id)) blockers.push(`${name} có row_id "${id}" bị trùng, không thể tự động ghi lại.`);
      else { if (row[0] !== id) changed = true; row[0] = id; seen.add(id); }
    }
  }
  return { guideData: candidate as T, changed: blockers.length === 0 && changed, blockers };
}

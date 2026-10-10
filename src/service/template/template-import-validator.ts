import { allocateStableSheetKeys_ACU, canonicalizeDisplayName_ACU } from '../../shared/sheet-identity';
import { mapSqlColumnIdentifiers_ACU, toSqlIdentifierBase_ACU } from '../../shared/sql-identifier-mapper';
import { resolveEffectiveDDL } from '../../data/sqlite/schema-mapper';
import { parseDDLChineseName, parseDDLColumnComments } from '../../shared/ddl-utils';
import type { Sheet_ACU } from '../../shared/models/table-data';

export type TemplateImportDiagnosticCode_ACU =
  | 'invalid_sheet_key' | 'duplicate_sheet_key' | 'missing_sheet_uid' | 'sheet_uid_mismatch'
  | 'empty_sheet_name' | 'duplicate_sheet_name' | 'missing_header_row' | 'invalid_header_row'
  | 'empty_header_cell' | 'missing_row_id' | 'misplaced_row_id' | 'duplicate_column_name'
  | 'physical_column_name_collision' | 'table_alias_conflict'
  | 'display_column_translation_ambiguity' | 'display_name_substring_hazard';

export interface TemplateImportDiagnostic_ACU {
  code: TemplateImportDiagnosticCode_ACU;
  sheetKey: string;
  sheetName: string;
  message: string;
  columnIndex?: number;
  conflictsWith?: string | number;
}

export class TemplateImportValidationError_ACU extends Error {
  readonly diagnostics: readonly TemplateImportDiagnostic_ACU[];

  constructor(diagnostics: readonly TemplateImportDiagnostic_ACU[]) {
    super(`Kiểm tra nhập mẫu thất bại: ${diagnostics.map(item => item.message).join('; ')}`);
    this.name = 'TemplateImportValidationError_ACU';
    this.diagnostics = diagnostics;
  }
}

// Stable keys are lowercase, but legacy random identities used mixed-case base36-like suffixes.
const SHEET_KEY_PATTERN_ACU = /^sheet_[A-Za-z0-9]+(?:_[A-Za-z0-9]+)*$/;
const SHEET_LIKE_KEY_PATTERN_ACU = /^sheet_/i;

/**
 * Validates the external ChatSheets wire format without storage, UI, or mutation.
 * A top-level key is the only established sheet identity carrier; therefore a missing
 * key cannot be allocated safely instead of being silently ignored by legacy readers.
 */
export function validateImportedTemplateObject_ACU(template: unknown): TemplateImportDiagnostic_ACU[] {
  if (!template || typeof template !== 'object' || Array.isArray(template)) return [];
  const data = template as Record<string, any>;
  const diagnostics: TemplateImportDiagnostic_ACU[] = [];
  const sheetKeys = Object.keys(data).filter(key => key.startsWith('sheet_'));
  Object.keys(data).filter(key => !key.startsWith('sheet_')).forEach(key => {
    const value = data[key];
    if (!SHEET_LIKE_KEY_PATTERN_ACU.test(key) && !isSheetLikeObject_ACU(value)) return;
    diagnostics.push(issue_ACU('invalid_sheet_key', key, value?.name, `Key "${key}" của bảng "${String(value?.name || key)}" không hợp lệ.`));
  });
  const names = sheetKeys.map(key => data[key]?.name);
  const allocation = allocateStableSheetKeys_ACU(names);

  allocation.diagnostics.forEach(diagnostic => {
    const sheetKey = sheetKeys[diagnostic.index] || '';
    if (diagnostic.code === 'empty_name') {
      diagnostics.push(issue_ACU('empty_sheet_name', sheetKey, names[diagnostic.index], 'Tên bảng không được để trống.'));
    } else if (diagnostic.code === 'duplicate_canonical_name') {
      diagnostics.push(issue_ACU('duplicate_sheet_name', sheetKey, names[diagnostic.index], `Tên bảng trùng với "${String(names[diagnostic.conflictsWithIndex!])}" sau khi chuẩn hóa.`, undefined, diagnostic.conflictsWithIndex));
    }
  });
  validateTableAliases_ACU(data, sheetKeys, diagnostics);

  const seenKeys = new Map<string, string>();
  sheetKeys.forEach(sheetKey => {
    const sheet = data[sheetKey];
    const sheetName = String(sheet?.name ?? '');
    if (!SHEET_KEY_PATTERN_ACU.test(sheetKey)) {
      diagnostics.push(issue_ACU('invalid_sheet_key', sheetKey, sheetName, `Key "${sheetKey}" của bảng "${sheetName || sheetKey}" không hợp lệ.`));
    }
    const canonicalKey = sheetKey.toLowerCase();
    const firstKey = seenKeys.get(canonicalKey);
    if (firstKey) diagnostics.push(issue_ACU('duplicate_sheet_key', sheetKey, sheetName, `Key bảng "${sheetKey}" xung đột với "${firstKey}".`, undefined, firstKey));
    else seenKeys.set(canonicalKey, sheetKey);
    if (!sheet || typeof sheet !== 'object' || Array.isArray(sheet)) return;
    if (typeof sheet.uid !== 'string' || !sheet.uid) {
      diagnostics.push(issue_ACU('missing_sheet_uid', sheetKey, sheetName, `Bảng "${sheetName || sheetKey}" thiếu uid.`));
    } else if (sheet.uid !== sheetKey) {
      diagnostics.push(issue_ACU('sheet_uid_mismatch', sheetKey, sheetName, `uid "${sheet.uid}" của bảng "${sheetName || sheetKey}" phải khớp với key "${sheetKey}".`));
    }
    validateHeaders_ACU(sheetKey, sheetName, sheet.content, diagnostics);
  });
  return diagnostics;
}

/**
 * Finds known hazards in NameMapper.translateSql's legacy broad replacement.
 * These are warnings, not import blockers: they only break specific SQL shapes.
 */
export function detectDisplayNameTranslationHazards_ACU(template: unknown): TemplateImportDiagnostic_ACU[] {
  if (!template || typeof template !== 'object' || Array.isArray(template)) return [];
  const data = template as Record<string, any>;
  const warnings: TemplateImportDiagnostic_ACU[] = [];
  const firstColumnByDisplay = new Map<string, { sheetKey: string; sheetName: string; displayName: string; sqlName: string }>();
  const tableNames: Array<{ sheetKey: string; sheetName: string; displayName: string }> = [];
  const columns: Array<{ sheetKey: string; sheetName: string; displayName: string }> = [];

  for (const sheetKey of Object.keys(data).filter(key => key.startsWith('sheet_'))) {
    const sheet = data[sheetKey];
    if (!sheet || typeof sheet !== 'object' || Array.isArray(sheet) || !Array.isArray(sheet.content)) continue;
    const sheetName = String(sheet.name ?? '');
    try {
      // The detector must model the DDL that NameMapper actually consumes, including
      // fallback schemas, rather than trusting editable sourceData.ddl directly.
      const effectiveDDL = resolveEffectiveDDL(sheet as Sheet_ACU, sheet.uid || sheetKey, sheet.uid || sheetKey).effectiveDDL;
      const tableDisplayName = normalizeTranslationDisplayName_ACU(parseDDLChineseName(effectiveDDL));
      if (tableDisplayName) tableNames.push({ sheetKey, sheetName, displayName: tableDisplayName });
      for (const [sqlName, rawDisplayName] of parseDDLColumnComments(effectiveDDL)) {
        if (sqlName === 'row_id') continue;
        const displayName = normalizeTranslationDisplayName_ACU(rawDisplayName);
        const canonical = canonicalizeDisplayName_ACU(displayName);
        if (!displayName || !canonical) continue;
        columns.push({ sheetKey, sheetName, displayName });
        const first = firstColumnByDisplay.get(canonical);
        if (!first) {
          firstColumnByDisplay.set(canonical, { sheetKey, sheetName, displayName, sqlName });
        } else if (first.sheetKey !== sheetKey && first.sqlName.toLowerCase() !== sqlName.toLowerCase()) {
          warnings.push(issue_ACU(
            'display_column_translation_ambiguity', sheetKey, sheetName,
            `Tên hiển thị cột "${displayName}" được ánh xạ thành "${sqlName}" trong bảng "${sheetName || sheetKey}", nhưng được ánh xạ thành "${first.sqlName}" trong bảng "${first.sheetName || first.sheetKey}"; dịch toàn văn SQL kiểu cũ có thể chọn nhầm cột theo thứ tự tải bảng.`,
            undefined, first.sheetKey,
          ));
        }
      }
    } catch {
      // Structural validation owns malformed templates. A warning detector must not
      // turn its best-effort inspection into a new import failure mode.
    }
  }

  for (const table of tableNames) {
    for (const column of columns) {
      // translateSql applies table substitutions globally before column substitutions,
      // so a table can corrupt a column from its own sheet as well as another one.
      if (!column.displayName.includes(table.displayName)) continue;
      warnings.push(issue_ACU(
        'display_name_substring_hazard', table.sheetKey, table.sheetName,
        `Tên hiển thị bảng "${table.displayName}" là chuỗi con của tên hiển thị cột "${column.displayName}" trong bảng "${column.sheetName || column.sheetKey}"; dịch SQL kiểu cũ sẽ thay tên bảng trước, có thể làm hỏng tên cột.`,
        undefined, column.sheetKey,
      ));
    }
  }
  return warnings;
}

function validateHeaders_ACU(sheetKey: string, sheetName: string, content: unknown, diagnostics: TemplateImportDiagnostic_ACU[]): void {
  if (!Array.isArray(content) || content.length === 0) {
    diagnostics.push(issue_ACU('missing_header_row', sheetKey, sheetName, `Bảng "${sheetName || sheetKey}" thiếu hàng tiêu đề.`));
    return;
  }
  const headers = content[0];
  if (!Array.isArray(headers)) {
    diagnostics.push(issue_ACU('invalid_header_row', sheetKey, sheetName, `Tiêu đề của bảng "${sheetName || sheetKey}" phải là mảng.`));
    return;
  }
  const mapping = mapSqlColumnIdentifiers_ACU(headers);
  mapping.diagnostics.forEach(diagnostic => {
    const messages: Record<string, string> = {
      empty_column_name: `Tên cột ${diagnostic.index + 1} không được để trống.`,
      missing_row_id: 'Cột đầu phải là row_id.',
      misplaced_row_id: `row_id chỉ được nằm ở cột đầu (hiện ở cột ${diagnostic.index + 1}).`,
      duplicate_canonical_column_name: `Cột ${diagnostic.index + 1} và cột ${(diagnostic.conflictsWithIndex ?? 0) + 1} trùng tên sau khi chuẩn hóa.`,
    };
    const code = diagnostic.code === 'empty_column_name' ? 'empty_header_cell'
      : diagnostic.code === 'duplicate_canonical_column_name' ? 'duplicate_column_name' : diagnostic.code;
    diagnostics.push(issue_ACU(code, sheetKey, sheetName, `Bảng "${sheetName || sheetKey}": ${messages[diagnostic.code]}`, diagnostic.index, diagnostic.conflictsWithIndex));
  });
  const firstPhysicalCandidate = new Map<string, number>();
  headers.forEach((header, index) => {
    if (index === 0) return;
    const candidate = toSqlIdentifierBase_ACU(header, index).toLowerCase();
    const firstIndex = firstPhysicalCandidate.get(candidate);
    if (firstIndex === undefined) {
      firstPhysicalCandidate.set(candidate, index);
      return;
    }
    diagnostics.push(issue_ACU(
      'physical_column_name_collision', sheetKey, sheetName,
      `Cột ${index + 1} và cột ${firstIndex + 1} được ánh xạ tới cùng một tên cột vật lý ứng viên "${candidate}".`,
      index, firstIndex,
    ));
  });
}

/**
 * Table aliases are explicit identity claims. A claim colliding with another
 * sheet's display name or alias would make later AI/SQL routing ambiguous, so
 * reject it at the import boundary before any template is persisted.
 */
function validateTableAliases_ACU(data: Record<string, any>, sheetKeys: string[], diagnostics: TemplateImportDiagnostic_ACU[]): void {
  const ownerByIdentity = new Map<string, { sheetKey: string; sheetName: string }>();
  for (const sheetKey of sheetKeys) {
    const sheet = data[sheetKey];
    if (!sheet || typeof sheet !== 'object' || Array.isArray(sheet)) continue;
    const sheetName = String(sheet.name ?? '');
    const rawAliases = sheet.sourceData?.tableAliases;
    const identities = [sheetName, ...(Array.isArray(rawAliases) ? rawAliases : [])];
    const localClaims = new Set<string>();
    for (const identity of identities) {
      const canonical = canonicalizeDisplayName_ACU(identity);
      if (!canonical || localClaims.has(canonical)) continue;
      localClaims.add(canonical);
      const owner = ownerByIdentity.get(canonical);
      if (!owner) {
        ownerByIdentity.set(canonical, { sheetKey, sheetName });
        continue;
      }
      if (owner.sheetKey !== sheetKey) {
        diagnostics.push(issue_ACU(
          'table_alias_conflict', sheetKey, sheetName,
          `Tên hoặc bí danh lịch sử "${String(identity).trim()}" của bảng "${sheetName || sheetKey}" xung đột với bảng "${owner.sheetName || owner.sheetKey}".`,
          undefined, owner.sheetKey,
        ));
      }
    }
  }
}

function issue_ACU(code: TemplateImportDiagnosticCode_ACU, sheetKey: string, sheetName: unknown, message: string, columnIndex?: number, conflictsWith?: string | number): TemplateImportDiagnostic_ACU {
  return { code, sheetKey, sheetName: String(sheetName ?? ''), message, columnIndex, conflictsWith };
}

function normalizeTranslationDisplayName_ACU(value: unknown): string {
  return String(value ?? '').normalize('NFKC').trim();
}

function isSheetLikeObject_ACU(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  // Reject incomplete sheet payloads too: requiring every field here would turn a
  // malformed sheet into silently preserved metadata before the normal sheet checks run.
  const sheetFieldCount = ['uid', 'name', 'content', 'sourceData']
    .filter(key => Object.prototype.hasOwnProperty.call(candidate, key)).length;
  return sheetFieldCount >= 2;
}

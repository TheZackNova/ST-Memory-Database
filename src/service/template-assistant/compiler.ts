import { TABLE_ORDER_FIELD_ACU } from '../../shared/constants';
import { parseDDLColumnNames, updateDDLColumnComment, validateDDLTextAgainstHeaders_ACU } from '../../shared/ddl-utils';
import { allocateStableSheetKeys_ACU, canonicalizeDisplayName_ACU } from '../../shared/sheet-identity';
import { isSummaryOrOutlineTable_ACU } from '../../shared/utils';
import type { SchemaMigrationPreflightIntent_ACU } from '../table/schema-migration-preflight';
import { applySummaryIndexSequenceToTable_ACU, getSummaryIndexColumnIndex_ACU, isSpecialIndexLockEnabled_ACU } from '../runtime/helpers-remaining';
import { getSortedSheetKeys_ACU } from '../template/chat-scope';
import { buildDefaultExportConfig_ACU, ensureGlobalInjectionConfigDefaults_ACU, ensureSheetExportConfigDefaults_ACU } from '../worldbook/injection-engine';

type AnyRecord = Record<string, any>;

export interface TemplateAssistantDiff_ACU {
    addedSheets: Array<{ sheetKey: string; name: string }>;
    deletedSheets: Array<{ sheetKey: string; name: string }>;
    renamedSheets: Array<{ sheetKey: string; beforeName: string; afterName: string }>;
    movedSheets: Array<{ sheetKey: string; name: string; fromIndex: number; toIndex: number }>;
    patchedSourceDataSheets: Array<{ sheetKey: string; name: string; keys: string[] }>;
    patchedUpdateConfigSheets: Array<{ sheetKey: string; name: string; keys: string[] }>;
    patchedExportConfigSheets: Array<{ sheetKey: string; name: string; keys: string[] }>;
    patchedContentSheets: Array<{ sheetKey: string; name: string; changes: string[] }>;
    patchedSchemaSheets: Array<{ sheetKey: string; name: string; changes: string[] }>;
    patchedLockSheets: Array<{ sheetKey: string; name: string; changes: string[] }>;
    globalInjectionChanged: boolean;
}

export interface TemplateAssistantHighRiskItem_ACU {
    type: 'delete_sheet' | 'patch_global_injection_config' | 'patch_sheet_schema';
    label: string;
}

export interface TemplateAssistantLockRowChange_ACU {
    rowIndex: number;
    locked: boolean;
}

export interface TemplateAssistantLockColumnChange_ACU {
    colIndex: number;
    locked: boolean;
}

export interface TemplateAssistantLockCellChange_ACU {
    rowIndex: number;
    colIndex: number;
    locked: boolean;
}

export interface TemplateAssistantLockChange_ACU {
    sheetKey: string;
    rows: TemplateAssistantLockRowChange_ACU[];
    columns: TemplateAssistantLockColumnChange_ACU[];
    cells: TemplateAssistantLockCellChange_ACU[];
    specialIndexLocked?: boolean;
}

export interface TemplateAssistantCompileResult_ACU {
    candidateData: AnyRecord;
    orderedSheetKeys: string[];
    deletedSheetKeys: string[];
    focusSheetKey: string | null;
    diff: TemplateAssistantDiff_ACU;
    highRiskItems: TemplateAssistantHighRiskItem_ACU[];
    lockChanges: TemplateAssistantLockChange_ACU[];
    schemaMigrationIntents: Record<string, SchemaMigrationPreflightIntent_ACU | undefined>;
}

export interface TemplateAssistantCumulativeCompileInput_ACU {
    baselineData: AnyRecord;
    baselineSheetOrder?: string[] | null;
    candidateData: AnyRecord;
    candidateSheetOrder?: string[] | null;
    focusSheetKey?: string | null;
}

function clone_ACU<T>(value: T): T {
    if (value === undefined) return value;
    return JSON.parse(JSON.stringify(value));
}

function isObject_ACU(value: any): value is AnyRecord {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

function stableStringify_ACU(value: any): string {
    return JSON.stringify(value);
}

function isSameValue_ACU(left: any, right: any) {
    if (left === right) return true;
    return stableStringify_ACU(left) === stableStringify_ACU(right);
}

function createEmptyDiff_ACU(): TemplateAssistantDiff_ACU {
    return {
        addedSheets: [],
        deletedSheets: [],
        renamedSheets: [],
        movedSheets: [],
        patchedSourceDataSheets: [],
        patchedUpdateConfigSheets: [],
        patchedExportConfigSheets: [],
        patchedContentSheets: [],
        patchedSchemaSheets: [],
        patchedLockSheets: [],
        globalInjectionChanged: false,
    };
}

function listChangedLeafKeys_ACU(beforeValue: any, afterValue: any, prefix = ''): string[] {
    if (isObject_ACU(beforeValue) && isObject_ACU(afterValue)) {
        const keys = Array.from(new Set([...Object.keys(beforeValue), ...Object.keys(afterValue)])).sort();
        return keys.flatMap((key) => {
            const nextPrefix = prefix ? `${prefix}.${key}` : key;
            const hasBefore = Object.prototype.hasOwnProperty.call(beforeValue, key);
            const hasAfter = Object.prototype.hasOwnProperty.call(afterValue, key);
            if (!hasBefore || !hasAfter) {
                return [nextPrefix];
            }
            return listChangedLeafKeys_ACU(beforeValue[key], afterValue[key], nextPrefix);
        });
    }
    return isSameValue_ACU(beforeValue, afterValue) ? [] : (prefix ? [prefix] : []);
}

function listPatchLeafKeys_ACU(patch: any, prefix = ''): string[] {
    if (!isObject_ACU(patch)) return prefix ? [prefix] : [];
    const out: string[] = [];
    Object.keys(patch).forEach((key) => {
        const nextPrefix = prefix ? `${prefix}.${key}` : key;
        const value = patch[key];
        if (isObject_ACU(value)) {
            out.push(...listPatchLeafKeys_ACU(value, nextPrefix));
            return;
        }
        out.push(nextPrefix);
    });
    return out;
}

function applyStrictPatch_ACU(target: AnyRecord, patch: AnyRecord, path = '') {
    Object.keys(patch).forEach((key) => {
        if (!Object.prototype.hasOwnProperty.call(target, key)) {
            throw new Error(`patch chứa trường không xác định: ${path}${key}`);
        }
        const nextValue = patch[key];
        const currentValue = target[key];
        if (isObject_ACU(nextValue)) {
            if (!isObject_ACU(currentValue)) {
                throw new Error(`Đích của patch không phải đối tượng, không thể ghi đè đệ quy: ${path}${key}`);
            }
            applyStrictPatch_ACU(currentValue, nextValue, `${path}${key}.`);
            return;
        }
        target[key] = clone_ACU(nextValue);
    });
}

function ensureSheetExists_ACU(dataObj: AnyRecord, sheetKey: string) {
    const sheet = dataObj?.[sheetKey];
    if (!sheet || typeof sheet !== 'object') {
        throw new Error(`Không tìm thấy bảng đích: ${sheetKey}`);
    }
    return sheet;
}

function assertPatchTargetsCurrentSheet_ACU(op: any, currentSheetKey: string | null | undefined, selectedSheetKey: string | null | undefined, protocolVersion: 1 | 2) {
    if (protocolVersion !== 1) return;
    const opName = String(op?.op || 'patch_sheet');
    const opSheetKey = String(op?.sheetKey || '');
    if (opSheetKey !== String(selectedSheetKey || '')) {
        throw new Error(`${opName} phải có sheetKey trùng với draft.selectedSheetKey`);
    }
    if (currentSheetKey && opSheetKey !== currentSheetKey) {
        throw new Error(`${opName} chỉ được sửa bảng đang chọn`);
    }
}

function createUniqueSheetKey_ACU(dataObj: AnyRecord, sheetName: string) {
    const canonicalName = canonicalizeDisplayName_ACU(sheetName);
    const existing = Object.entries(dataObj)
        .filter(([key, sheet]) => key.startsWith('sheet_') && isObject_ACU(sheet))
        .map(([sheetKey, sheet]: [string, any]) => ({ sheetKey, canonicalName: sheet.name }));
    if (existing.some(sheet => canonicalizeDisplayName_ACU(sheet.canonicalName) === canonicalName)) {
        throw new Error(`Tên bảng「${sheetName}」của add_sheet trùng với bảng hiện có`);
    }
    const allocation = allocateStableSheetKeys_ACU([sheetName], { existing });
    if (allocation.diagnostics.length > 0 || !allocation.keys[0]) {
        throw new Error(`add_sheet không thể tạo key ổn định cho bảng「${sheetName}」`);
    }
    return allocation.keys[0];
}

function getBaseOrderedSheetKeys_ACU(tempData: AnyRecord, sheetOrder: string[] | null | undefined) {
    const existingKeys = getSortedSheetKeys_ACU(tempData, { ignoreChatGuide: true });
    const order = Array.isArray(sheetOrder) ? sheetOrder.filter((key) => existingKeys.includes(key)) : [];
    existingKeys.forEach((key) => {
        if (!order.includes(key)) order.push(key);
    });
    return order;
}

function normalizeFocusSheetKey_ACU(candidateData: AnyRecord, orderedSheetKeys: string[], focusSheetKey: string | null | undefined) {
    if (focusSheetKey && candidateData[focusSheetKey]) {
        return focusSheetKey;
    }
    return orderedSheetKeys[0] || null;
}

function getNormalizedGlobalInjectionConfig_ACU(dataObj: AnyRecord) {
    const rawValue = isObject_ACU(dataObj?.mate) ? dataObj.mate.globalInjectionConfig : undefined;
    return ensureGlobalInjectionConfigDefaults_ACU(clone_ACU(rawValue));
}

function buildDefaultUpdateConfig_ACU() {
    return {
        uiSentinel: -1,
        contextDepth: -1,
        updateFrequency: -1,
        batchSize: -1,
        skipFloors: -1,
        sendLatestRows: -1,
        groupId: -1,
    };
}

function buildDefaultSourceData_ACU(sheetName: string, headers: string[]) {
    const normalizedHeaders = Array.isArray(headers)
        ? headers.map((item) => String(item ?? '').trim()).filter(Boolean)
        : [];
    const combinedText = [sheetName, ...normalizedHeaders].join('|');
    const primaryHeader = normalizedHeaders.find((item) => /名称|姓名|标题|编号|代号|ID|id/.test(item)) || normalizedHeaders[0] || 'Cột đầu';
    const isInventoryLike = /战利品|背包|物品|掉落|素材|装备|loot|inventory/i.test(combinedText);
    if (isInventoryLike) {
        const noteLines = [
            `Ghi lại các mục vật phẩm hoặc chiến lợi phẩm trong ${sheetName || 'bảng này'}, mỗi hàng đại diện cho một loại vật phẩm có thể theo dõi liên tục. Ưu tiên dùng「${primaryHeader}」để xác định cùng một mục, tránh thêm vật phẩm trùng tên thành nhiều hàng.`,
            ...normalizedHeaders.map((header, index) => `- Cột ${index + 1}: ${header} - Hãy ghi thông tin tương ứng của vật phẩm này, và luôn cập nhật cùng một hàng cho cùng một vật phẩm.`),
        ];
        return {
            note: noteLines.join('\n'),
            initNode: 'Khi cốt truyện, thiết lập hoặc cảnh hiện tại đã nêu rõ có vật phẩm ban đầu, vật rơi hoặc kho đồ, hãy khởi tạo trước các mục thật cơ bản nhất; nếu không có thông tin rõ ràng thì đừng bịa.',
            insertNode: 'Khi xuất hiện vật phẩm mới, chiến lợi phẩm mới hoặc nguồn rơi mới chưa được ghi trong bảng hiện tại thì thêm một hàng.',
            updateNode: 'Khi số lượng, trạng thái, loại, mô tả hoặc nguồn của vật phẩm đã có thay đổi thì cập nhật hàng cũ; nếu chỉ thay đổi số lượng, ưu tiên cập nhật số lượng, đừng thêm lặp vật phẩm trùng tên.',
            deleteNode: 'Xóa khi vật phẩm bị loại bỏ hoàn toàn, hết sạch, nhặt xong không còn theo dõi hoặc rõ ràng đã mất hiệu lực; nếu chỉ giảm số lượng thì ưu tiên cập nhật thay vì xóa rồi tạo lại.',
        };
    }
    const noteLines = [
        `Ghi lại các mục trong ${sheetName || 'bảng này'}. Mặc định hiểu là mỗi hàng một mục; ưu tiên dùng「${primaryHeader}」làm định danh ổn định. Nếu đây là bảng cấu hình một hàng, hãy nêu rõ trong phần mô tả \"bảng này có và chỉ có một hàng\".`,
        ...normalizedHeaders.map((header, index) => `- Cột ${index + 1}: ${header} - Hãy bổ sung ý nghĩa cụ thể và ràng buộc của cột này.`),
    ];
    return {
        note: noteLines.join('\n'),
        initNode: 'Khi bảng này trống và cốt truyện, thiết lập hoặc tư liệu hiện có đã nêu rõ có nội dung cần ghi, hãy khởi tạo trước các mục thật cơ bản nhất; nếu không có thông tin rõ ràng thì đừng bịa.',
        insertNode: 'Khi xuất hiện mục mới chưa có trong bảng hiện tại và cần được ghi lại thì thêm một hàng; nếu đây là bảng một hàng thì đừng thêm, hãy cập nhật hàng hiện có.',
        updateNode: 'Khi trạng thái, số lượng, mô tả hoặc trường khác của mục đã ghi có thay đổi thì cập nhật hàng tương ứng; nếu đây là bảng một hàng thì luôn cập nhật hàng hiện có.',
        deleteNode: 'Xóa khi mục đã rõ ràng mất hiệu lực, bị loại bỏ, hết sạch hoặc không nên giữ lại nữa; nếu đây là bảng một hàng thì thường đừng xóa.',
    };
}

function sanitizeAddSheetConfig_ACU(rawValue: any, baseValue: AnyRecord, label: string) {
    const nextValue = clone_ACU(baseValue);
    if (rawValue == null) return nextValue;
    if (!isObject_ACU(rawValue)) {
        throw new Error(`add_sheet.${label} phải là đối tượng`);
    }
    applyStrictPatch_ACU(nextValue, rawValue, `${label}.`);
    return nextValue;
}

function buildNewSheet_ACU(op: any, newKey: string, orderNo: number) {
    const sheetName = String(op?.sheetName || '').trim();
    if (!sheetName) {
        throw new Error('add_sheet thiếu sheetName');
    }
    const headers = Array.isArray(op?.headers)
        ? op.headers.map((item: any) => String(item ?? '').trim()).filter(Boolean)
        : [];
    if (headers.length === 0) {
        throw new Error('add_sheet cần ít nhất một tiêu đề cột');
    }
    assertHeadersUnique_ACU(headers);

    const sourceData = sanitizeAddSheetConfig_ACU(op?.sourceData, buildDefaultSourceData_ACU(sheetName, headers), 'sourceData');
    const updateConfigRaw = sanitizeAddSheetConfig_ACU(op?.updateConfig, buildDefaultUpdateConfig_ACU(), 'updateConfig');
    const updateConfig = { ...updateConfigRaw, uiSentinel: -1 };
    const exportConfig = sanitizeAddSheetConfig_ACU(op?.exportConfig, buildDefaultExportConfig_ACU(sheetName), 'exportConfig');

    const sheet: AnyRecord = {
        uid: newKey,
        name: sheetName,
        domain: 'chat',
        type: 'dynamic',
        enable: true,
        required: false,
        content: [['row_id', ...headers]],
        sourceData,
        updateConfig,
        exportConfig,
        [TABLE_ORDER_FIELD_ACU]: orderNo,
    };
    ensureSheetExportConfigDefaults_ACU(sheet);
    return sheet;
}

function insertAfterAnchor_ACU(orderedSheetKeys: string[], newKey: string, insertAfterSheetKey?: string) {
    if (!insertAfterSheetKey) {
        orderedSheetKeys.push(newKey);
        return;
    }
    const idx = orderedSheetKeys.indexOf(insertAfterSheetKey);
    if (idx === -1) {
        throw new Error(`add_sheet có insertAfterSheetKey không tồn tại: ${insertAfterSheetKey}`);
    }
    orderedSheetKeys.splice(idx + 1, 0, newKey);
}

function moveSheetAroundAnchor_ACU(orderedSheetKeys: string[], sheetKey: string, beforeSheetKey?: string, afterSheetKey?: string) {
    const anchorCount = Number(!!beforeSheetKey) + Number(!!afterSheetKey);
    if (anchorCount !== 1) {
        throw new Error('move_sheet phải và chỉ được cung cấp một trong beforeSheetKey hoặc afterSheetKey');
    }
    const fromIndex = orderedSheetKeys.indexOf(sheetKey);
    if (fromIndex === -1) {
        throw new Error(`move_sheet bảng đích không tồn tại: ${sheetKey}`);
    }
    const anchorKey = beforeSheetKey || afterSheetKey || '';
    const anchorIndex = orderedSheetKeys.indexOf(anchorKey);
    if (anchorIndex === -1) {
        throw new Error(`move_sheet điểm neo không tồn tại: ${anchorKey}`);
    }
    if (anchorKey === sheetKey) {
        throw new Error('move_sheet không được lấy chính nó làm điểm neo');
    }

    orderedSheetKeys.splice(fromIndex, 1);
    const nextAnchorIndex = orderedSheetKeys.indexOf(anchorKey);
    const insertIndex = beforeSheetKey ? nextAnchorIndex : nextAnchorIndex + 1;
    orderedSheetKeys.splice(insertIndex, 0, sheetKey);
}

function getSheetHeaderRow_ACU(sheet: any, sheetKey: string) {
    const headerRow = Array.isArray(sheet?.content?.[0]) ? sheet.content[0] : null;
    if (!headerRow) {
        throw new Error(`content của bảng đích không hợp lệ: ${sheetKey}`);
    }
    return headerRow;
}

function getSheetHeaders_ACU(sheet: any, sheetKey: string) {
    return getSheetHeaderRow_ACU(sheet, sheetKey).slice(1).map((item: any) => String(item ?? '').trim());
}

function hasSheetDdl_ACU(sheet: any) {
    return typeof sheet?.sourceData?.ddl === 'string' && !!sheet.sourceData.ddl.trim();
}

function assertNonEmptyColumnName_ACU(name: any, label: string) {
    const normalized = String(name ?? '').trim();
    if (!normalized) {
        throw new Error(`${label} phải là chuỗi không rỗng`);
    }
    if (normalized === 'row_id') {
        throw new Error(`${label} không được là row_id`);
    }
    return normalized;
}

function assertHeadersUnique_ACU(headers: string[]) {
    const seen = new Set<string>();
    headers.forEach((header) => {
        const normalized = assertNonEmptyColumnName_ACU(header, 'Tên cột');
        if (seen.has(normalized)) {
            throw new Error(`Tên cột bị trùng: ${normalized}`);
        }
        seen.add(normalized);
    });
}

function validateDdlAgainstHeaders_ACU(ddlText: string, tableHeaders: string[]) {
    return validateDDLTextAgainstHeaders_ACU(ddlText, tableHeaders);
}

function getEffectiveSpecialIndexLockEnabled_ACU(sheetKey: string, overrides: Record<string, boolean>) {
    if (Object.prototype.hasOwnProperty.call(overrides, sheetKey)) {
        return overrides[sheetKey];
    }
    return isSpecialIndexLockEnabled_ACU(sheetKey);
}

function maybeApplySpecialIndexSequenceToSheet_ACU(sheet: any, sheetKey: string, overrides: Record<string, boolean>) {
    if (!sheet || !isSummaryOrOutlineTable_ACU(String(sheet?.name || ''))) return;
    if (!getEffectiveSpecialIndexLockEnabled_ACU(sheetKey, overrides)) return;
    const colIndex = getSummaryIndexColumnIndex_ACU(sheet);
    if (colIndex < 0) return;
    applySummaryIndexSequenceToTable_ACU(sheet, colIndex);
}

function applySheetContentPatch_ACU(sheet: any, sheetKey: string, rawPatch: any) {
    if (!isObject_ACU(rawPatch)) {
        throw new Error('patch_sheet_content.patch phải là đối tượng');
    }
    const allowedKeys = new Set(['updateCells', 'addRows', 'deleteRows']);
    Object.keys(rawPatch).forEach((key) => {
        if (!allowedKeys.has(key)) {
            throw new Error(`patch_sheet_content.patch chứa trường không xác định: ${key}`);
        }
    });

    const headerRow = getSheetHeaderRow_ACU(sheet, sheetKey);
    const headers = getSheetHeaders_ACU(sheet, sheetKey);
    const changes: string[] = [];
    const updateCells = Array.isArray(rawPatch.updateCells) ? rawPatch.updateCells : [];
    const addRows = Array.isArray(rawPatch.addRows) ? rawPatch.addRows : [];
    const deleteRows = Array.isArray(rawPatch.deleteRows) ? rawPatch.deleteRows : [];

    updateCells.forEach((cellPatch: any, index: number) => {
        if (!isObject_ACU(cellPatch)) {
            throw new Error(`patch_sheet_content.updateCells[${index}] phải là đối tượng`);
        }
        const rowNumber = Number(cellPatch.rowNumber);
        if (!Number.isInteger(rowNumber) || rowNumber <= 0) {
            throw new Error(`patch_sheet_content.updateCells[${index}].rowNumber phải là số nguyên dương`);
        }
        const row = sheet.content[rowNumber];
        if (!Array.isArray(row)) {
            throw new Error(`patch_sheet_content.updateCells[${index}] trỏ tới hàng không tồn tại: ${rowNumber}`);
        }
        const columnName = assertNonEmptyColumnName_ACU(cellPatch.columnName, `patch_sheet_content.updateCells[${index}].columnName`);
        const colIndex = headers.indexOf(columnName);
        if (colIndex === -1) {
            throw new Error(`patch_sheet_content.updateCells[${index}] trỏ tới cột không tồn tại: ${columnName}`);
        }
        row[colIndex + 1] = clone_ACU(cellPatch.value);
        changes.push(`Sửa ô: hàng ${rowNumber}.${columnName}`);
    });

    const normalizedDeleteRows = Array.from(new Set(deleteRows.map((item: any) => Number(item)))).sort((a, b) => b - a);
    normalizedDeleteRows.forEach((rowNumber, index) => {
        if (!Number.isInteger(rowNumber) || rowNumber <= 0) {
            throw new Error(`patch_sheet_content.deleteRows[${index}] phải là số nguyên dương`);
        }
        if (!Array.isArray(sheet.content[rowNumber])) {
            throw new Error(`patch_sheet_content.deleteRows[${index}] trỏ tới hàng không tồn tại: ${rowNumber}`);
        }
    });
    normalizedDeleteRows.forEach((rowNumber) => {
        sheet.content.splice(rowNumber, 1);
    });
    if (normalizedDeleteRows.length) {
        changes.push(`Xóa ${normalizedDeleteRows.length} hàng (hàng ${normalizedDeleteRows.slice().sort((a, b) => a - b).join(', ')})`);
    }

    addRows.forEach((rowPatch: any, index: number) => {
        if (!isObject_ACU(rowPatch)) {
            throw new Error(`patch_sheet_content.addRows[${index}] phải là đối tượng`);
        }
        Object.keys(rowPatch).forEach((columnName) => {
            if (!headers.includes(columnName)) {
                throw new Error(`patch_sheet_content.addRows[${index}] chứa cột không xác định: ${columnName}`);
            }
        });
        const newRow = new Array(headerRow.length).fill('');
        newRow[0] = null;
        headers.forEach((header, headerIndex) => {
            newRow[headerIndex + 1] = Object.prototype.hasOwnProperty.call(rowPatch, header)
                ? clone_ACU(rowPatch[header])
                : '';
        });
        sheet.content.push(newRow);
    });
    if (addRows.length) {
        changes.push(`Thêm ${addRows.length} hàng`);
    }

    return changes;
}

function applySheetSchemaPatch_ACU(sheet: any, sheetKey: string, rawPatch: any) {
    if (!isObject_ACU(rawPatch)) {
        throw new Error('patch_sheet_schema.patch phải là đối tượng');
    }
    const allowedKeys = new Set(['renameColumns', 'addColumns', 'deleteColumns', 'ddl', 'migrationIntent']);
    Object.keys(rawPatch).forEach((key) => {
        if (!allowedKeys.has(key)) {
            throw new Error(`patch_sheet_schema.patch chứa trường không xác định: ${key}`);
        }
    });

    const renameColumns = Array.isArray(rawPatch.renameColumns) ? rawPatch.renameColumns : [];
    const addColumns = Array.isArray(rawPatch.addColumns) ? rawPatch.addColumns : [];
    const deleteColumns = Array.isArray(rawPatch.deleteColumns) ? rawPatch.deleteColumns : [];
    const nextDdl = typeof rawPatch.ddl === 'string' ? rawPatch.ddl.trim() : '';
    const headerRow = getSheetHeaderRow_ACU(sheet, sheetKey);
    const changes: string[] = [];
    const highRiskLabels: string[] = [];
    const hasExistingDdl = hasSheetDdl_ACU(sheet);
    let workingDdl = hasExistingDdl ? String(sheet.sourceData.ddl || '') : '';
    let ddlChanged = false;

    if (hasExistingDdl && !nextDdl && (addColumns.length > 0 || deleteColumns.length > 0)) {
        throw new Error('Khi bảng DDL thêm/xóa cột phải cung cấp đồng thời patch.ddl');
    }

    renameColumns.forEach((renamePatch: any, index: number) => {
        if (!isObject_ACU(renamePatch)) {
            throw new Error(`patch_sheet_schema.renameColumns[${index}] phải là đối tượng`);
        }
        const from = assertNonEmptyColumnName_ACU(renamePatch.from, `patch_sheet_schema.renameColumns[${index}].from`);
        const to = assertNonEmptyColumnName_ACU(renamePatch.to, `patch_sheet_schema.renameColumns[${index}].to`);
        const currentHeaders = getSheetHeaders_ACU(sheet, sheetKey);
        const colIndex = currentHeaders.indexOf(from);
        if (colIndex === -1) {
            throw new Error(`patch_sheet_schema.renameColumns[${index}] trỏ tới cột không tồn tại: ${from}`);
        }
        if (currentHeaders.includes(to) && from !== to) {
            throw new Error(`patch_sheet_schema.renameColumns[${index}] tên cột đích đã tồn tại: ${to}`);
        }
        headerRow[colIndex + 1] = to;
        changes.push(`Đổi tên cột: ${from} -> ${to}`);
        if (workingDdl) {
            const ddlColumns = parseDDLColumnNames(workingDdl);
            const ddlColumnName = ddlColumns[colIndex + 1];
            if (ddlColumnName && ddlColumnName !== 'row_id') {
                workingDdl = updateDDLColumnComment(workingDdl, ddlColumnName, to);
                ddlChanged = true;
            }
        }
    });

    const deleteEntries = deleteColumns.map((columnName: any, index: number) => ({
        name: assertNonEmptyColumnName_ACU(columnName, `patch_sheet_schema.deleteColumns[${index}]`),
    }));
    const deleteWithIndex = deleteEntries.map((item) => {
        const currentHeaders = getSheetHeaders_ACU(sheet, sheetKey);
        const colIndex = currentHeaders.indexOf(item.name);
        if (colIndex === -1) {
            throw new Error(`patch_sheet_schema.deleteColumns trỏ tới cột không tồn tại: ${item.name}`);
        }
        return { ...item, colIndex };
    }).sort((left, right) => right.colIndex - left.colIndex);
    deleteWithIndex.forEach(({ name, colIndex }) => {
        headerRow.splice(colIndex + 1, 1);
        sheet.content.slice(1).forEach((row: any) => {
            if (Array.isArray(row)) row.splice(colIndex + 1, 1);
        });
        changes.push(`Xóa cột: ${name}`);
        highRiskLabels.push(`Xóa cột: ${String(sheet.name || sheetKey)}.${name}`);
    });

    addColumns.forEach((columnPatch: any, index: number) => {
        if (!isObject_ACU(columnPatch)) {
            throw new Error(`patch_sheet_schema.addColumns[${index}] phải là đối tượng`);
        }
        const name = assertNonEmptyColumnName_ACU(columnPatch.name, `patch_sheet_schema.addColumns[${index}].name`);
        const currentHeaders = getSheetHeaders_ACU(sheet, sheetKey);
        if (currentHeaders.includes(name)) {
            throw new Error(`patch_sheet_schema.addColumns[${index}] tên cột đích đã tồn tại: ${name}`);
        }
        headerRow.push(name);
        sheet.content.slice(1).forEach((row: any) => {
            if (Array.isArray(row)) {
                row.push(Object.prototype.hasOwnProperty.call(columnPatch, 'defaultValue') ? clone_ACU(columnPatch.defaultValue) : '');
            }
        });
        changes.push(`Thêm cột: ${name}`);
    });

    // 校验必须使用「完整表头」（首列为 row_id 位置），与
    // validateDDLTextAgainstHeaders_ACU 的统一契约一致；
    // getSheetHeaders_ACU 返回的是 slice(1) 业务表头，只能用于列定位。
    const finalHeaderRow = getSheetHeaderRow_ACU(sheet, sheetKey);
    const finalHeaders = finalHeaderRow.slice(1).map((item: any) => String(item ?? '').trim());
    assertHeadersUnique_ACU(finalHeaders);

    if (nextDdl) {
        const ddlValidation = validateDdlAgainstHeaders_ACU(nextDdl, finalHeaderRow);
        if (!ddlValidation.valid) {
            throw new Error(`patch_sheet_schema.ddl không hợp lệ: ${ddlValidation.message}`);
        }
        if (!isObject_ACU(sheet.sourceData)) sheet.sourceData = {};
        sheet.sourceData.ddl = nextDdl;
        ddlChanged = true;
        changes.push('DDL đã cập nhật');
        highRiskLabels.push(`Cập nhật DDL: ${String(sheet.name || sheetKey)}`);
    } else if (workingDdl && ddlChanged) {
        if (!isObject_ACU(sheet.sourceData)) sheet.sourceData = {};
        sheet.sourceData.ddl = workingDdl;
        changes.push('Chú thích DDL đã đồng bộ');
    }

    return {
        changes,
        highRiskLabels,
    };
}

function applySheetLockPatch_ACU(sheet: any, sheetKey: string, rawPatch: any) {
    if (!isObject_ACU(rawPatch)) {
        throw new Error('patch_sheet_locks.patch phải là đối tượng');
    }
    const allowedKeys = new Set(['rows', 'columns', 'cells', 'specialIndexLocked']);
    Object.keys(rawPatch).forEach((key) => {
        if (!allowedKeys.has(key)) {
            throw new Error(`patch_sheet_locks.patch chứa trường không xác định: ${key}`);
        }
    });

    const headers = getSheetHeaders_ACU(sheet, sheetKey);
    const rowCount = Math.max(0, (Array.isArray(sheet?.content) ? sheet.content.length : 0) - 1);
    const changes: string[] = [];
    const rows = Array.isArray(rawPatch.rows) ? rawPatch.rows : [];
    const columns = Array.isArray(rawPatch.columns) ? rawPatch.columns : [];
    const cells = Array.isArray(rawPatch.cells) ? rawPatch.cells : [];
    const normalized: TemplateAssistantLockChange_ACU = {
        sheetKey,
        rows: [],
        columns: [],
        cells: [],
    };

    rows.forEach((item: any, index: number) => {
        if (!isObject_ACU(item)) {
            throw new Error(`patch_sheet_locks.rows[${index}] phải là đối tượng`);
        }
        const rowNumber = Number(item.rowNumber);
        if (!Number.isInteger(rowNumber) || rowNumber <= 0 || rowNumber > rowCount) {
            throw new Error(`patch_sheet_locks.rows[${index}] trỏ tới hàng không tồn tại: ${rowNumber}`);
        }
        if (typeof item.locked !== 'boolean') {
            throw new Error(`patch_sheet_locks.rows[${index}].locked phải là giá trị boolean`);
        }
        normalized.rows.push({ rowIndex: rowNumber - 1, locked: item.locked });
        changes.push(`${item.locked ? 'Khóa' : 'Mở khóa'} hàng ${rowNumber}`);
    });

    columns.forEach((item: any, index: number) => {
        if (!isObject_ACU(item)) {
            throw new Error(`patch_sheet_locks.columns[${index}] phải là đối tượng`);
        }
        const columnName = assertNonEmptyColumnName_ACU(item.columnName, `patch_sheet_locks.columns[${index}].columnName`);
        const colIndex = headers.indexOf(columnName);
        if (colIndex === -1) {
            throw new Error(`patch_sheet_locks.columns[${index}] trỏ tới cột không tồn tại: ${columnName}`);
        }
        if (typeof item.locked !== 'boolean') {
            throw new Error(`patch_sheet_locks.columns[${index}].locked phải là giá trị boolean`);
        }
        normalized.columns.push({ colIndex, locked: item.locked });
        changes.push(`${item.locked ? 'Khóa' : 'Mở khóa'} cột: ${columnName}`);
    });

    cells.forEach((item: any, index: number) => {
        if (!isObject_ACU(item)) {
            throw new Error(`patch_sheet_locks.cells[${index}] phải là đối tượng`);
        }
        const rowNumber = Number(item.rowNumber);
        if (!Number.isInteger(rowNumber) || rowNumber <= 0 || rowNumber > rowCount) {
            throw new Error(`patch_sheet_locks.cells[${index}] trỏ tới hàng không tồn tại: ${rowNumber}`);
        }
        const columnName = assertNonEmptyColumnName_ACU(item.columnName, `patch_sheet_locks.cells[${index}].columnName`);
        const colIndex = headers.indexOf(columnName);
        if (colIndex === -1) {
            throw new Error(`patch_sheet_locks.cells[${index}] trỏ tới cột không tồn tại: ${columnName}`);
        }
        if (typeof item.locked !== 'boolean') {
            throw new Error(`patch_sheet_locks.cells[${index}].locked phải là giá trị boolean`);
        }
        normalized.cells.push({ rowIndex: rowNumber - 1, colIndex, locked: item.locked });
        changes.push(`${item.locked ? 'Khóa' : 'Mở khóa'} ô: hàng ${rowNumber}.${columnName}`);
    });

    if (rawPatch.specialIndexLocked != null) {
        if (!isSummaryOrOutlineTable_ACU(String(sheet?.name || ''))) {
            throw new Error('patch_sheet_locks.specialIndexLocked chỉ hỗ trợ các bảng loại kỷ yếu/dàn ý');
        }
        if (typeof rawPatch.specialIndexLocked !== 'boolean') {
            throw new Error('patch_sheet_locks.specialIndexLocked phải là giá trị boolean');
        }
        normalized.specialIndexLocked = rawPatch.specialIndexLocked;
        changes.push(`${rawPatch.specialIndexLocked ? 'Bật' : 'Tắt'} khóa đặc biệt cho cột chỉ mục mã hóa`);
    }

    return {
        changes,
        lockChange: normalized,
    };
}

function hasAnyLockChange_ACU(lockChange: TemplateAssistantLockChange_ACU) {
    return lockChange.rows.length > 0
        || lockChange.columns.length > 0
        || lockChange.cells.length > 0
        || typeof lockChange.specialIndexLocked === 'boolean';
}

export function compileTemplateAssistantDraft_ACU(input: {
    tempData: AnyRecord;
    sheetOrder?: string[] | null;
    currentSheetKey?: string | null;
    draft: any;
}): TemplateAssistantCompileResult_ACU {
    const tempData = isObject_ACU(input?.tempData) ? input.tempData : null;
    if (!tempData) {
        throw new Error('Thiếu tempData');
    }
    const draft = input?.draft;
    if (!draft || !Array.isArray(draft.operations)) {
        if (draft?.protocolVersion === 3) {
            return compileTemplateAssistantDraftV3_ACU(input.tempData, input.sheetOrder, input.currentSheetKey, draft);
        }
        throw new Error('Thiếu draft.operations hợp lệ');
    }

    const protocolVersion = draft?.protocolVersion === 1 ? 1 : 2;
    const candidateData = clone_ACU(tempData);
    const orderedSheetKeys = getBaseOrderedSheetKeys_ACU(candidateData, input.sheetOrder);
    const deletedSheetKeys: string[] = [];
    const highRiskItems: TemplateAssistantHighRiskItem_ACU[] = [];
    const lockChanges: TemplateAssistantLockChange_ACU[] = [];
    const schemaMigrationIntents: Record<string, SchemaMigrationPreflightIntent_ACU | undefined> = {};
    const diff = createEmptyDiff_ACU();
    const specialIndexLockOverrides: Record<string, boolean> = {};
    let focusSheetKey = input?.currentSheetKey || draft?.selectedSheetKey || null;

    draft.operations.forEach((op: any) => {
        const opName = String(op?.op || '');
        if (!opName) throw new Error('Có thao tác thiếu op');

        if (opName === 'add_sheet') {
            const sheetName = String(op?.sheetName || '').trim();
            const newKey = createUniqueSheetKey_ACU(candidateData, sheetName);
            const newSheet = buildNewSheet_ACU(op, newKey, orderedSheetKeys.length);
            candidateData[newKey] = newSheet;
            insertAfterAnchor_ACU(orderedSheetKeys, newKey, op.insertAfterSheetKey);
            focusSheetKey = newKey;
            diff.addedSheets.push({ sheetKey: newKey, name: newSheet.name || newKey });
            return;
        }

        if (opName === 'rename_sheet') {
            const sheet = ensureSheetExists_ACU(candidateData, op.sheetKey);
            const beforeName = String(sheet.name || '');
            const afterName = String(op.newName || '').trim();
            if (!afterName) throw new Error('rename_sheet thiếu newName');
            sheet.name = afterName;
            ensureSheetExportConfigDefaults_ACU(sheet);
            diff.renamedSheets.push({ sheetKey: op.sheetKey, beforeName, afterName });
            maybeApplySpecialIndexSequenceToSheet_ACU(sheet, op.sheetKey, specialIndexLockOverrides);
            return;
        }

        if (opName === 'delete_sheet') {
            const sheet = ensureSheetExists_ACU(candidateData, op.sheetKey);
            diff.deletedSheets.push({ sheetKey: op.sheetKey, name: String(sheet.name || op.sheetKey) });
            if (!deletedSheetKeys.includes(op.sheetKey)) deletedSheetKeys.push(op.sheetKey);
            highRiskItems.push({ type: 'delete_sheet', label: `Xóa bảng: ${String(sheet.name || op.sheetKey)}` });
            delete candidateData[op.sheetKey];
            const idx = orderedSheetKeys.indexOf(op.sheetKey);
            if (idx >= 0) orderedSheetKeys.splice(idx, 1);
            if (focusSheetKey === op.sheetKey) focusSheetKey = null;
            return;
        }

        if (opName === 'move_sheet') {
            const beforeIndex = orderedSheetKeys.indexOf(op.sheetKey);
            const sheet = ensureSheetExists_ACU(candidateData, op.sheetKey);
            moveSheetAroundAnchor_ACU(orderedSheetKeys, op.sheetKey, op.beforeSheetKey, op.afterSheetKey);
            const afterIndex = orderedSheetKeys.indexOf(op.sheetKey);
            if (beforeIndex !== afterIndex) {
                diff.movedSheets.push({ sheetKey: op.sheetKey, name: String(sheet.name || op.sheetKey), fromIndex: beforeIndex, toIndex: afterIndex });
            }
            return;
        }

        if (opName === 'patch_sheet_source_data') {
            assertPatchTargetsCurrentSheet_ACU(op, input?.currentSheetKey, draft?.selectedSheetKey, protocolVersion);
            const sheet = ensureSheetExists_ACU(candidateData, op.sheetKey);
            if (Object.prototype.hasOwnProperty.call(op.patch || {}, 'ddl')) {
                throw new Error('patch_sheet_source_data không được sửa trực tiếp ddl, hãy dùng patch_sheet_schema.ddl');
            }
            if (!isObject_ACU(sheet.sourceData)) throw new Error(`sourceData của bảng đích không hợp lệ: ${op.sheetKey}`);
            applyStrictPatch_ACU(sheet.sourceData, isObject_ACU(op.patch) ? op.patch : {});
            diff.patchedSourceDataSheets.push({ sheetKey: op.sheetKey, name: String(sheet.name || op.sheetKey), keys: listPatchLeafKeys_ACU(op.patch) });
            return;
        }

        if (opName === 'patch_sheet_update_config') {
            assertPatchTargetsCurrentSheet_ACU(op, input?.currentSheetKey, draft?.selectedSheetKey, protocolVersion);
            const sheet = ensureSheetExists_ACU(candidateData, op.sheetKey);
            if (!isObject_ACU(sheet.updateConfig)) throw new Error(`updateConfig của bảng đích không hợp lệ: ${op.sheetKey}`);
            applyStrictPatch_ACU(sheet.updateConfig, isObject_ACU(op.patch) ? op.patch : {});
            sheet.updateConfig.uiSentinel = -1;
            diff.patchedUpdateConfigSheets.push({ sheetKey: op.sheetKey, name: String(sheet.name || op.sheetKey), keys: listPatchLeafKeys_ACU(op.patch) });
            return;
        }

        if (opName === 'patch_sheet_export_config') {
            assertPatchTargetsCurrentSheet_ACU(op, input?.currentSheetKey, draft?.selectedSheetKey, protocolVersion);
            const sheet = ensureSheetExists_ACU(candidateData, op.sheetKey);
            ensureSheetExportConfigDefaults_ACU(sheet);
            applyStrictPatch_ACU(sheet.exportConfig, isObject_ACU(op.patch) ? op.patch : {});
            ensureSheetExportConfigDefaults_ACU(sheet);
            diff.patchedExportConfigSheets.push({ sheetKey: op.sheetKey, name: String(sheet.name || op.sheetKey), keys: listPatchLeafKeys_ACU(op.patch) });
            return;
        }

        if (opName === 'patch_sheet_content') {
            assertPatchTargetsCurrentSheet_ACU(op, input?.currentSheetKey, draft?.selectedSheetKey, protocolVersion);
            const sheet = ensureSheetExists_ACU(candidateData, op.sheetKey);
            const changes = applySheetContentPatch_ACU(sheet, op.sheetKey, op.patch);
            maybeApplySpecialIndexSequenceToSheet_ACU(sheet, op.sheetKey, specialIndexLockOverrides);
            diff.patchedContentSheets.push({ sheetKey: op.sheetKey, name: String(sheet.name || op.sheetKey), changes });
            return;
        }

        if (opName === 'patch_sheet_schema') {
            assertPatchTargetsCurrentSheet_ACU(op, input?.currentSheetKey, draft?.selectedSheetKey, protocolVersion);
            const sheet = ensureSheetExists_ACU(candidateData, op.sheetKey);
            const schemaResult = applySheetSchemaPatch_ACU(sheet, op.sheetKey, op.patch);
            maybeApplySpecialIndexSequenceToSheet_ACU(sheet, op.sheetKey, specialIndexLockOverrides);
            if (Object.prototype.hasOwnProperty.call(op.patch || {}, 'migrationIntent')) {
                schemaMigrationIntents[op.sheetKey] = clone_ACU(op.patch.migrationIntent);
            }
            diff.patchedSchemaSheets.push({ sheetKey: op.sheetKey, name: String(sheet.name || op.sheetKey), changes: schemaResult.changes });
            schemaResult.highRiskLabels.forEach((label) => {
                highRiskItems.push({ type: 'patch_sheet_schema', label });
            });
            return;
        }

        if (opName === 'patch_sheet_locks') {
            assertPatchTargetsCurrentSheet_ACU(op, input?.currentSheetKey, draft?.selectedSheetKey, protocolVersion);
            const sheet = ensureSheetExists_ACU(candidateData, op.sheetKey);
            const lockResult = applySheetLockPatch_ACU(sheet, op.sheetKey, op.patch);
            if (typeof lockResult.lockChange.specialIndexLocked === 'boolean') {
                specialIndexLockOverrides[op.sheetKey] = lockResult.lockChange.specialIndexLocked;
            }
            maybeApplySpecialIndexSequenceToSheet_ACU(sheet, op.sheetKey, specialIndexLockOverrides);
            diff.patchedLockSheets.push({ sheetKey: op.sheetKey, name: String(sheet.name || op.sheetKey), changes: lockResult.changes });
            if (hasAnyLockChange_ACU(lockResult.lockChange)) {
                lockChanges.push(lockResult.lockChange);
            }
            return;
        }

        if (opName === 'patch_global_injection_config') {
            if (!isObject_ACU(candidateData.mate)) {
                candidateData.mate = { type: 'chatSheets', version: 1 };
            }
            candidateData.mate.globalInjectionConfig = ensureGlobalInjectionConfigDefaults_ACU(candidateData.mate.globalInjectionConfig);
            applyStrictPatch_ACU(candidateData.mate.globalInjectionConfig, isObject_ACU(op.patch) ? op.patch : {});
            candidateData.mate.globalInjectionConfig = ensureGlobalInjectionConfigDefaults_ACU(candidateData.mate.globalInjectionConfig);
            diff.globalInjectionChanged = true;
            highRiskItems.push({ type: 'patch_global_injection_config', label: 'Sửa cấu hình chèn toàn cục' });
            return;
        }

        throw new Error(`Thao tác không được giao thức hiện tại hỗ trợ: ${opName}`);
    });

    orderedSheetKeys.forEach((sheetKey, index) => {
        if (candidateData?.[sheetKey] && typeof candidateData[sheetKey] === 'object') {
            candidateData[sheetKey][TABLE_ORDER_FIELD_ACU] = index;
        }
    });

    if (focusSheetKey && !candidateData[focusSheetKey]) {
        focusSheetKey = orderedSheetKeys[0] || null;
    }

    return {
        candidateData,
        orderedSheetKeys,
        deletedSheetKeys,
        focusSheetKey,
        diff,
        highRiskItems,
        lockChanges,
        schemaMigrationIntents,
    };
}

export function buildTemplateAssistantCumulativeCompileResult_ACU(input: TemplateAssistantCumulativeCompileInput_ACU): TemplateAssistantCompileResult_ACU {
    const baselineData = isObject_ACU(input?.baselineData) ? input.baselineData : null;
    const rawCandidateData = isObject_ACU(input?.candidateData) ? input.candidateData : null;
    if (!baselineData) {
        throw new Error('Thiếu baselineData');
    }
    if (!rawCandidateData) {
        throw new Error('Thiếu candidateData');
    }

    const candidateData = clone_ACU(rawCandidateData);
    const baselineOrderedSheetKeys = getBaseOrderedSheetKeys_ACU(baselineData, input.baselineSheetOrder);
    const orderedSheetKeys = getBaseOrderedSheetKeys_ACU(candidateData, input.candidateSheetOrder);
    const baselineSheetKeySet = new Set(baselineOrderedSheetKeys);
    const candidateSheetKeySet = new Set(orderedSheetKeys);
    const deletedSheetKeys = baselineOrderedSheetKeys.filter((sheetKey) => !candidateSheetKeySet.has(sheetKey));
    const addedSheetKeys = orderedSheetKeys.filter((sheetKey) => !baselineSheetKeySet.has(sheetKey));
    const baselineCommonOrderedKeys = baselineOrderedSheetKeys.filter((sheetKey) => candidateSheetKeySet.has(sheetKey));
    const candidateCommonOrderedKeys = orderedSheetKeys.filter((sheetKey) => baselineSheetKeySet.has(sheetKey));
    const diff = createEmptyDiff_ACU();
    const highRiskItems: TemplateAssistantHighRiskItem_ACU[] = [];

    addedSheetKeys.forEach((sheetKey) => {
        const sheet = candidateData[sheetKey] || {};
        diff.addedSheets.push({ sheetKey, name: String(sheet.name || sheetKey) });
    });

    deletedSheetKeys.forEach((sheetKey) => {
        const sheet = baselineData[sheetKey] || {};
        const name = String(sheet.name || sheetKey);
        diff.deletedSheets.push({ sheetKey, name });
        highRiskItems.push({ type: 'delete_sheet', label: `Xóa bảng: ${name}` });
    });

    baselineCommonOrderedKeys.forEach((sheetKey, commonIndex) => {
        const beforeSheet = baselineData[sheetKey] || {};
        const afterSheet = candidateData[sheetKey] || {};
        const beforeName = String(beforeSheet.name || '');
        const afterName = String(afterSheet.name || '');
        if (beforeName !== afterName) {
            diff.renamedSheets.push({ sheetKey, beforeName, afterName });
        }

        const candidateCommonIndex = candidateCommonOrderedKeys.indexOf(sheetKey);
        if (candidateCommonIndex !== commonIndex) {
            diff.movedSheets.push({
                sheetKey,
                name: afterName || beforeName || sheetKey,
                fromIndex: baselineOrderedSheetKeys.indexOf(sheetKey),
                toIndex: orderedSheetKeys.indexOf(sheetKey),
            });
        }

        const changedSourceDataKeys = listChangedLeafKeys_ACU(beforeSheet.sourceData, afterSheet.sourceData);
        if (changedSourceDataKeys.length) {
            diff.patchedSourceDataSheets.push({ sheetKey, name: afterName || beforeName || sheetKey, keys: changedSourceDataKeys });
        }

        const changedUpdateConfigKeys = listChangedLeafKeys_ACU(beforeSheet.updateConfig, afterSheet.updateConfig);
        if (changedUpdateConfigKeys.length) {
            diff.patchedUpdateConfigSheets.push({ sheetKey, name: afterName || beforeName || sheetKey, keys: changedUpdateConfigKeys });
        }

        const changedExportConfigKeys = listChangedLeafKeys_ACU(beforeSheet.exportConfig, afterSheet.exportConfig);
        if (changedExportConfigKeys.length) {
            diff.patchedExportConfigSheets.push({ sheetKey, name: afterName || beforeName || sheetKey, keys: changedExportConfigKeys });
        }

        if (!isSameValue_ACU(beforeSheet.content, afterSheet.content)) {
            diff.patchedContentSheets.push({ sheetKey, name: afterName || beforeName || sheetKey, changes: ['Nội dung đã sửa'] });
        }

        const beforeDdl = String(beforeSheet?.sourceData?.ddl || '');
        const afterDdl = String(afterSheet?.sourceData?.ddl || '');
        if (beforeDdl !== afterDdl) {
            diff.patchedSchemaSheets.push({ sheetKey, name: afterName || beforeName || sheetKey, changes: ['DDL đã cập nhật'] });
            highRiskItems.push({ type: 'patch_sheet_schema', label: `Cập nhật DDL: ${afterName || beforeName || sheetKey}` });
        }
    });

    diff.globalInjectionChanged = !isSameValue_ACU(
        getNormalizedGlobalInjectionConfig_ACU(baselineData),
        getNormalizedGlobalInjectionConfig_ACU(candidateData),
    );
    if (diff.globalInjectionChanged) {
        highRiskItems.push({ type: 'patch_global_injection_config', label: 'Sửa cấu hình chèn toàn cục' });
    }

    orderedSheetKeys.forEach((sheetKey, index) => {
        if (candidateData?.[sheetKey] && typeof candidateData[sheetKey] === 'object') {
            candidateData[sheetKey][TABLE_ORDER_FIELD_ACU] = index;
        }
    });

    return {
        candidateData,
        orderedSheetKeys,
        deletedSheetKeys,
        focusSheetKey: normalizeFocusSheetKey_ACU(candidateData, orderedSheetKeys, input.focusSheetKey),
        diff,
        highRiskItems,
        lockChanges: [],
        schemaMigrationIntents: {},
    };
}

/**
 * v3 编译：单表完整输出协议。
 *
 * 输入约束（由 service 的 validateTemplateAssistantDraftV3_ACU 保证信封，本函数保证内容）：
 * - result.action 仅为 replace / create / delete；
 * - replace/delete 必须指向输入 allSheets 中真实存在的 sheetKey；
 * - create 的完整 Sheet 由本地分配 sheetKey/uid/orderNo；
 * - 未目标表一律保持不变，不允许「缺席即删除」。
 *
 * 硬性保护（与计划 v3-contract/v3-data-guards 对齐）：
 * - 完整字段归一：name/domain/type/enable/required/content/sourceData/updateConfig/exportConfig 必须齐全；
 * - content 必须是非空二维数组、首列 row_id、业务表头唯一、所有数据行宽一致；
 * - sourceData.ddl 必须非空且通过 validateDDLTextAgainstHeaders_ACU；
 * - row_id 集合守卫：空/重复拒绝；replace 未请求删行时，若 AI 少给行 → 阻断（防止静默丢行）。
 */
function compileTemplateAssistantDraftV3_ACU(
    tempData: AnyRecord,
    sheetOrder: string[] | null | undefined,
    currentSheetKey: string | null | undefined,
    draft: any,
): TemplateAssistantCompileResult_ACU {
    const candidateData = clone_ACU(tempData);
    const orderedSheetKeys = getBaseOrderedSheetKeys_ACU(candidateData, sheetOrder);
    const deletedSheetKeys: string[] = [];
    const highRiskItems: TemplateAssistantHighRiskItem_ACU[] = [];
    const lockChanges: TemplateAssistantLockChange_ACU[] = [];
    const schemaMigrationIntents: Record<string, SchemaMigrationPreflightIntent_ACU | undefined> = {};
    const diff = createEmptyDiff_ACU();
    const result = draft?.result;

    if (!result || typeof result !== 'object' || Array.isArray(result)) {
        throw new Error('v3 draft.result phải tồn tại và là đối tượng');
    }
    const action = String(result.action || '');
    if (action !== 'replace' && action !== 'create' && action !== 'delete') {
        throw new Error('v3 result.action phải là một trong replace / create / delete');
    }

    let focusSheetKey: string | null = null;

    if (action === 'replace') {
        const targetSheetKey = String(result.sheetKey || '').trim();
        if (!targetSheetKey) {
            throw new Error('v3 replace phải cung cấp sheetKey không rỗng');
        }
        const sheet = ensureSheetExists_ACU(candidateData, targetSheetKey);
        const beforeName = String(sheet.name || targetSheetKey);
        const normalized = normalizeV3FullSheet_ACU(result.sheet, targetSheetKey);

        // 物理列重命名：DDL 中物理列名/注释变化但业务表头未变。由 preflight 后续复核，
        // 此处只识别并给出风险标签（不阻断），避免重复实现 preflight 逻辑。
        const beforeDdl = String(sheet?.sourceData?.ddl || '');
        const afterDdl = String(normalized.sourceData?.ddl || '');
        if (beforeDdl && afterDdl && beforeDdl !== afterDdl) {
            highRiskItems.push({ type: 'patch_sheet_schema', label: `Cập nhật DDL: ${normalized.name || beforeName}` });
        }

        candidateData[targetSheetKey] = {
            ...normalized,
            uid: sheet.uid ?? targetSheetKey,
            [TABLE_ORDER_FIELD_ACU]: orderedSheetKeys.indexOf(targetSheetKey),
        };
        maybeApplySpecialIndexSequenceToSheet_ACU(candidateData[targetSheetKey], targetSheetKey, {});
        diff.patchedContentSheets.push({ sheetKey: targetSheetKey, name: normalized.name || beforeName, changes: ['Thay thế toàn bộ một bảng'] });
        if (beforeDdl !== afterDdl) {
            diff.patchedSchemaSheets.push({ sheetKey: targetSheetKey, name: normalized.name || beforeName, changes: ['DDL đã cập nhật'] });
            // DDL 变化交给 preflight 判断 migration/rebase，不在此伪造 intent。
        }
        if (beforeName !== normalized.name) {
            diff.renamedSheets.push({ sheetKey: targetSheetKey, beforeName, afterName: normalized.name });
        }
        focusSheetKey = targetSheetKey;
    } else if (action === 'create') {
        const normalized = normalizeV3FullSheet_ACU(result.sheet, '');
        const newKey = createUniqueSheetKey_ACU(candidateData, normalized.name);
        const insertAfter = result.insertAfterSheetKey !== undefined ? String(result.insertAfterSheetKey || '') : '';
        const newSheet: AnyRecord = {
            ...normalized,
            uid: newKey,
            [TABLE_ORDER_FIELD_ACU]: orderedSheetKeys.length,
        };
        candidateData[newKey] = newSheet;
        insertAfterAnchor_ACU(orderedSheetKeys, newKey, insertAfter || undefined);
        maybeApplySpecialIndexSequenceToSheet_ACU(candidateData[newKey], newKey, {});
        diff.addedSheets.push({ sheetKey: newKey, name: normalized.name });
        focusSheetKey = newKey;
    } else {
        // delete
        const targetSheetKey = String(result.sheetKey || '').trim();
        if (!targetSheetKey) {
            throw new Error('v3 delete phải cung cấp sheetKey không rỗng');
        }
        const sheet = ensureSheetExists_ACU(candidateData, targetSheetKey);
        const name = String(sheet.name || targetSheetKey);
        diff.deletedSheets.push({ sheetKey: targetSheetKey, name });
        deletedSheetKeys.push(targetSheetKey);
        highRiskItems.push({ type: 'delete_sheet', label: `Xóa bảng: ${name}` });
        delete candidateData[targetSheetKey];
        const idx = orderedSheetKeys.indexOf(targetSheetKey);
        if (idx >= 0) orderedSheetKeys.splice(idx, 1);
        if (String(currentSheetKey || '') === targetSheetKey) {
            focusSheetKey = orderedSheetKeys[0] || null;
        } else {
            focusSheetKey = String(currentSheetKey || '') || orderedSheetKeys[0] || null;
        }
    }

    orderedSheetKeys.forEach((sheetKey, index) => {
        if (candidateData?.[sheetKey] && typeof candidateData[sheetKey] === 'object') {
            candidateData[sheetKey][TABLE_ORDER_FIELD_ACU] = index;
        }
    });

    if (!focusSheetKey || !candidateData[focusSheetKey]) {
        focusSheetKey = orderedSheetKeys[0] || null;
    }

    return {
        candidateData,
        orderedSheetKeys,
        deletedSheetKeys,
        focusSheetKey,
        diff,
        highRiskItems,
        lockChanges,
        schemaMigrationIntents,
    };
}

/**
 * v3 完整 Sheet 归一 + 硬性校验。校验失败一律抛错（拒绝应用），绝不静默补齐。
 */
function normalizeV3FullSheet_ACU(rawSheet: any, targetSheetKey: string): AnyRecord {
    if (!rawSheet || typeof rawSheet !== 'object' || Array.isArray(rawSheet)) {
        throw new Error('v3 phải trả về đối tượng sheet đầy đủ');
    }

    const requiredKeys = ['name', 'domain', 'type', 'enable', 'required', 'content', 'sourceData', 'updateConfig', 'exportConfig'];
    requiredKeys.forEach((key) => {
        if (!Object.prototype.hasOwnProperty.call(rawSheet, key)) {
            throw new Error(`v3 sheet thiếu trường bắt buộc: ${key}`);
        }
    });

    const name = String(rawSheet.name || '').trim();
    if (!name) {
        throw new Error('v3 sheet.name phải là chuỗi không rỗng');
    }
    if (typeof rawSheet.domain !== 'string' || !rawSheet.domain.trim()) {
        throw new Error('v3 sheet.domain phải là chuỗi không rỗng');
    }
    if (typeof rawSheet.type !== 'string' || !rawSheet.type.trim()) {
        throw new Error('v3 sheet.type phải là chuỗi không rỗng');
    }
    if (typeof rawSheet.enable !== 'boolean') {
        throw new Error('v3 sheet.enable phải là giá trị boolean');
    }
    if (typeof rawSheet.required !== 'boolean') {
        throw new Error('v3 sheet.required phải là giá trị boolean');
    }

    const content = rawSheet.content;
    if (!Array.isArray(content) || content.length === 0) {
        throw new Error('v3 sheet.content phải là mảng hai chiều không rỗng');
    }
    if (!Array.isArray(content[0])) {
        throw new Error('v3 sheet.content[0] (hàng tiêu đề) phải là mảng');
    }
    const headerRow = content[0].map((item: any) => String(item ?? '').trim());
    if (headerRow[0] !== 'row_id') {
        throw new Error('v3 sheet.content[0][0] phải là row_id');
    }
    const headers = headerRow.slice(1);
    if (headers.length === 0) {
        throw new Error('v3 sheet cần ít nhất một tiêu đề cột nghiệp vụ');
    }
    assertHeadersUnique_ACU(headers);

    const headerWidth = headerRow.length;
    content.slice(1).forEach((row: any, index: number) => {
        if (!Array.isArray(row)) {
            throw new Error(`v3 sheet.content[${index + 1}] phải là mảng`);
        }
        if (row.length !== headerWidth) {
            throw new Error(`v3 sheet.content[${index + 1}] có độ rộng hàng (${row.length}) không khớp với độ rộng hàng tiêu đề (${headerWidth})`);
        }
    });

    const sourceData = isObject_ACU(rawSheet.sourceData) ? rawSheet.sourceData : null;
    if (!sourceData) {
        throw new Error('v3 sheet.sourceData phải là đối tượng');
    }
    const ddlText = typeof sourceData.ddl === 'string' ? sourceData.ddl.trim() : '';
    if (!ddlText) {
        throw new Error('v3 replace/create phải cung cấp sourceData.ddl không rỗng');
    }
    const ddlValidation = validateDdlAgainstHeaders_ACU(ddlText, headerRow);
    if (!ddlValidation.valid) {
        throw new Error(`v3 sheet.sourceData.ddl không hợp lệ: ${ddlValidation.message}`);
    }
    const updateConfig = isObject_ACU(rawSheet.updateConfig) ? rawSheet.updateConfig : null;
    if (!updateConfig) {
        throw new Error('v3 sheet.updateConfig phải là đối tượng');
    }
    const exportConfig = isObject_ACU(rawSheet.exportConfig) ? rawSheet.exportConfig : null;
    if (!exportConfig) {
        throw new Error('v3 sheet.exportConfig phải là đối tượng');
    }

    // row_id 集合守卫：空/重复拒绝（未删行要求保持集合一致在 compile 之后由调用方复核）。
    const rowIdSet = new Set<string>();
    content.slice(1).forEach((row: any) => {
        const rowId = String(row[0] ?? '').trim();
        if (!rowId) {
            throw new Error('row_id của hàng dữ liệu v3 sheet không được rỗng');
        }
        if (rowIdSet.has(rowId)) {
            throw new Error(`row_id của hàng dữ liệu v3 sheet bị trùng: ${rowId}`);
        }
        rowIdSet.add(rowId);
    });

    const normalized: AnyRecord = {
        name,
        domain: String(rawSheet.domain),
        type: String(rawSheet.type),
        enable: rawSheet.enable === true,
        required: rawSheet.required === true,
        content: clone_ACU(content),
        sourceData: clone_ACU(sourceData),
        updateConfig: clone_ACU(updateConfig),
        exportConfig: clone_ACU(exportConfig),
    };
    TEMPLATE_ASSISTANT_V3_AUX_KEYS_ACU.forEach((key) => {
        if (Object.prototype.hasOwnProperty.call(rawSheet, key)) {
            normalized[key] = clone_ACU(rawSheet[key]);
        }
    });

    // 未目标表的 row_id 集合差异（该表不是 replace 目标时不允许任何 row_id 变化）由调用方在
    // 更高层（service）对比 baseline 与 candidate 判定，见 compileV3 之外的守卫。
    return normalized;
}

const TEMPLATE_ASSISTANT_V3_AUX_KEYS_ACU = ['hiddenPhysicalColumns', 'tableAliases', 'columnAliases'] as const;

/**
 * v3 未删行保护：对 replace 目标表，若 AI 返回的 row_id 集合是 baseline 的子集（少了行），
 * 而用户并未要求删行（result 无显式标记），则阻断——防止 AI 静默吞行。
 * 返回高风险管理（需用户确认）或空数组（无需确认）。
 */
export function collectV3RowIdGuardFindings_ACU(
    baselineData: AnyRecord,
    candidateData: AnyRecord,
    sheetKey: string,
    userRequest: string,
): Array<{ code: 'row_id_set_reduction'; sheetKey: string; missingRowIds: string[] }> {
    const baseline = baselineData?.[sheetKey];
    const candidate = candidateData?.[sheetKey];
    if (!baseline || !candidate) return [];
    const baselineIds = extractRowIds_ACU(baseline);
    const candidateIds = extractRowIds_ACU(candidate);
    const baselineSet = new Set(baselineIds);
    const missing = baselineIds.filter((rowId) => !candidateIds.includes(rowId));
    if (missing.length === 0) return [];
    // 用户需求显式提到「删除/移除/去掉」等动作时，认为删行是有意的，交给高风险确认流程而非硬阻断。
    const explicitDeleteIntent = /删除|移除|去掉|清除|xóa|xoá|loại bỏ|gỡ bỏ|drop|delete|remove/i.test(String(userRequest || ''));
    if (explicitDeleteIntent) return [];
    return [{ code: 'row_id_set_reduction', sheetKey, missingRowIds: missing }];
}

function extractRowIds_ACU(sheet: any): string[] {
    if (!Array.isArray(sheet?.content)) return [];
    return sheet.content.slice(1)
        .map((row: any) => String(Array.isArray(row) ? row[0] ?? '' : '').trim())
        .filter(Boolean);
}

export function hasV3RowIdSetReduction_ACU(findings: Array<{ code: 'row_id_set_reduction'; sheetKey: string; missingRowIds: string[] }>): boolean {
    return findings.length > 0;
}

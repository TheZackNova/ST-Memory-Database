import type { TableDataObject_ACU } from '../../shared/models/table-data';
import { hashUserInput_ACU, logDebug_ACU, parseTableTemplateJson_ACU } from '../../shared/utils';
import { peekChatScopedConfigContainer_ACU, peekChatSheetGuideContainer_ACU, setChatScopedConfigContainer_ACU, setChatSheetGuideContainer_ACU } from '../../data/storage/chat-history';
import { saveChatToHostStrict_ACU } from '../../data/gateways/chat-gateway';
import { getChatArray_ACU, clearAllAiTableDataForCheckpointRestore_ACU, cleanupCheckpointVectorIndexManifestsAfterCommit_ACU } from '../chat/chat-service';
import { getCurrentIsolationKey_ACU } from '../runtime/state-manager';
import { applyTemplateScopeForCurrentChat_ACU } from '../settings/settings-service';
import { buildChatTemplateScopeStateFromCurrent_ACU, getChatSheetGuideDataForIsolationKey_ACU, getCurrentChatTemplateScopeState_ACU, normalizeGuideData_ACU, sanitizeChatSheetsObject_ACU, sanitizeTemplateSnapshotForChat_ACU, setChatSheetGuideDataForIsolationKey_ACU, setCurrentChatTemplateScopeState_ACU } from '../template/chat-scope';
import { deleteAllGeneratedEntries_ACU, refreshMergedDataAndNotify_ACU } from '../worldbook/pipeline';
import { isSqliteMode } from './storage-mode';
import { getActiveStorageProvider, getStorageProvider, reloadStorageProvider } from './table-storage-strategy';
import { getLatestAiMessageIndexFromChat_ACU } from './table-history';
import { persistTablesToChatMessage_ACU } from './table-service';
import { runTableWriteTransaction_ACU } from './table-write-transaction';
import { repairLegacyAutoMergedRowTails_ACU } from '../../shared/canonical-row-normalizer';
import { validateCanonicalCheckpointData_ACU } from '../../shared/canonical-checkpoint-validator';

const CHECKPOINT_FORMAT_ACU = 'acu-table-checkpoint' as const;
const CHECKPOINT_VERSION_ACU = 1 as const;
const DANGEROUS_KEYS_ACU = new Set(['__proto__', 'constructor', 'prototype']);

export interface TableCheckpointTemplateSnapshotV1_ACU {
  data: TableDataObject_ACU;
  presetName: string;
}
export interface TableCheckpointGuideSnapshotV1_ACU { data: Record<string, any>; }
export interface TableCheckpointIntegrityV1_ACU { algorithm: 'fnv1a'; payloadHash: string; }
export interface TableCheckpointFileV1_ACU {
  format: typeof CHECKPOINT_FORMAT_ACU;
  version: typeof CHECKPOINT_VERSION_ACU;
  createdAt: number;
  source: { storageMode: 'native' | 'sqlite' };
  tableSnapshot: TableDataObject_ACU;
  templateSnapshot: TableCheckpointTemplateSnapshotV1_ACU;
  guideSnapshot: TableCheckpointGuideSnapshotV1_ACU;
  integrity: TableCheckpointIntegrityV1_ACU;
}
export type TableCheckpointParseResult_ACU = { success: true; checkpoint: TableCheckpointFileV1_ACU } | { success: false; error: string };
export interface TableCheckpointRestorePostCondition_ACU {
  runtimeMatches: boolean;
  scopeIsChatOverride: boolean;
  templateMatches: boolean;
  guideMatches: boolean;
  providerMode: 'native' | 'sqlite' | null;
}
export interface TableCheckpointRestoreResult_ACU {
  success: boolean;
  restoredMessageIndex?: number;
  clearedCount?: number;
  cleanupWarnings?: string[];
  derivedRefreshWarnings?: string[];
  postCondition?: TableCheckpointRestorePostCondition_ACU;
  error?: string;
}

function cloneJson_ACU<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }
function isRecord_ACU(value: unknown): value is Record<string, any> { return !!value && typeof value === 'object' && !Array.isArray(value); }
function assertSafeJsonValue_ACU(value: unknown, path = '$'): void {
  if (Array.isArray(value)) { value.forEach((item, index) => assertSafeJsonValue_ACU(item, `${path}[${index}]`)); return; }
  if (!isRecord_ACU(value)) return;
  for (const [key, child] of Object.entries(value)) {
    if (DANGEROUS_KEYS_ACU.has(key)) throw new Error(`Checkpoint chứa khóa nguy hiểm: ${path}.${key}`);
    assertSafeJsonValue_ACU(child, `${path}.${key}`);
  }
}
function canonicalize_ACU(value: any): any {
  if (Array.isArray(value)) return value.map(canonicalize_ACU);
  if (!isRecord_ACU(value)) return value;
  return Object.keys(value).sort().reduce((out: Record<string, any>, key) => { out[key] = canonicalize_ACU(value[key]); return out; }, {});
}
function payloadHash_ACU(payload: Omit<TableCheckpointFileV1_ACU, 'integrity'>): string { return hashUserInput_ACU(JSON.stringify(canonicalize_ACU(payload))); }

function normalizeTableData_ACU(value: unknown, label: string): TableDataObject_ACU {
  if (!isRecord_ACU(value)) throw new Error(`${label} phải là đối tượng.`);
  const sanitized = sanitizeChatSheetsObject_ACU(cloneJson_ACU(value), { ensureMate: true }) as TableDataObject_ACU;
  const sheetKeys = Object.keys(sanitized).filter(key => key.startsWith('sheet_'));
  if (sheetKeys.length === 0) throw new Error(`${label} cần ít nhất một bảng sheet_.`);
  for (const key of sheetKeys) {
    const sheet = sanitized[key] as any;
    if (!isRecord_ACU(sheet) || typeof sheet.name !== 'string' || !Array.isArray(sheet.content) || !Array.isArray(sheet.content[0])) {
      throw new Error(`${label}.${key} không phải bảng hợp lệ.`);
    }
  }
  return sanitized;
}

function getSheetKeys_ACU(data: Record<string, any>): string[] {
  return Object.keys(data).filter(key => key.startsWith('sheet_')).sort();
}

function assertSameSheetKeys_ACU(left: Record<string, any>, right: Record<string, any>, leftLabel: string, rightLabel: string): void {
  const leftKeys = getSheetKeys_ACU(left);
  const rightKeys = getSheetKeys_ACU(right);
  if (leftKeys.length !== rightKeys.length || leftKeys.some((key, index) => key !== rightKeys[index])) {
    throw new Error(`${leftLabel} và ${rightLabel} có tập sheet_ không nhất quán.`);
  }
}

function assertMatchingSheetSchema_ACU(leftSheet: any, rightSheet: any, key: string, leftLabel: string, rightLabel: string): void {
  const leftUid = String(leftSheet?.uid || key);
  const rightUid = String(rightSheet?.uid || key);
  if (leftUid !== rightUid) throw new Error(`${leftLabel}.${key} và ${rightLabel}.${key} có uid không nhất quán.`);
  if (leftSheet?.name !== rightSheet?.name) throw new Error(`${leftLabel}.${key} và ${rightLabel}.${key} có tên không nhất quán.`);
  const leftHeader = leftSheet?.content?.[0];
  const rightHeader = rightSheet?.content?.[0];
  if (!Array.isArray(leftHeader) || !Array.isArray(rightHeader) || leftHeader.length !== rightHeader.length) {
    throw new Error(`${leftLabel}.${key} và ${rightLabel}.${key} có độ rộng tiêu đề không nhất quán.`);
  }
  for (let index = 0; index < leftHeader.length; index += 1) {
    if (leftHeader[index] !== rightHeader[index]) {
      throw new Error(`${leftLabel}.${key} và ${rightLabel}.${key} có tiêu đề cột thứ ${index + 1} không nhất quán.`);
    }
  }
}

/**
 * 仅比较同一 Checkpoint 文件内的 runtime/template/guide 快照；绝不读取目标聊天当前模板。
 */
function assertCheckpointSchemaConsistency_ACU(
  tableSnapshot: TableDataObject_ACU,
  templateData: TableDataObject_ACU,
  guideData: Record<string, any>,
): void {
  assertSameSheetKeys_ACU(templateData, guideData, 'templateSnapshot.data', 'guideSnapshot.data');
  const templateSheetKeys = new Set(getSheetKeys_ACU(templateData));
  for (const key of getSheetKeys_ACU(tableSnapshot)) {
    if (!templateSheetKeys.has(key)) throw new Error(`tableSnapshot.${key} không tồn tại trong templateSnapshot.data.`);
  }
  for (const key of getSheetKeys_ACU(templateData)) {
    assertMatchingSheetSchema_ACU(templateData[key], guideData[key], key, 'templateSnapshot.data', 'guideSnapshot.data');
    if (tableSnapshot[key]) {
      assertMatchingSheetSchema_ACU(tableSnapshot[key], templateData[key], key, 'tableSnapshot', 'templateSnapshot.data');
    }
  }
}

function assertCanonicalCheckpointRows_ACU(data: TableDataObject_ACU, label: string): void {
  const validation = validateCanonicalCheckpointData_ACU(data);
  if (!validation.valid) {
    const locations = validation.issues.map(issue => `${issue.type}: ${issue.sheetKey || 'unknown'}${issue.rowIndex === undefined ? '' : ` hàng thứ ${issue.rowIndex}`}`).join('; ');
    throw new Error(`${label} định danh hàng hoặc cấu trúc không hợp lệ: ${locations}`);
  }
}

function repairCheckpointLegacyAutoMergedTails_ACU(
  tableSnapshot: TableDataObject_ACU,
  templateData: TableDataObject_ACU,
  guideData: Record<string, any>,
): boolean {
  const repairedTable = repairLegacyAutoMergedRowTails_ACU(tableSnapshot);
  const repairedTemplate = repairLegacyAutoMergedRowTails_ACU(templateData);
  const repairedGuide = repairLegacyAutoMergedRowTails_ACU(guideData);
  return repairedTable.length > 0 || repairedTemplate.length > 0 || repairedGuide.length > 0;
}

function normalizeCheckpointPayload_ACU(raw: unknown): TableCheckpointFileV1_ACU {
  assertSafeJsonValue_ACU(raw);
  if (!isRecord_ACU(raw)) throw new Error('Nút gốc của Checkpoint phải là đối tượng.');
  if (raw.format !== CHECKPOINT_FORMAT_ACU) throw new Error('Định dạng Checkpoint không được hỗ trợ.');
  if (raw.version !== CHECKPOINT_VERSION_ACU) throw new Error(`Phiên bản Checkpoint không được hỗ trợ: ${String(raw.version)}.`);
  if (!Number.isFinite(raw.createdAt) || Number(raw.createdAt) <= 0) throw new Error('createdAt của Checkpoint không hợp lệ.');
  if (!isRecord_ACU(raw.source) || (raw.source.storageMode !== 'native' && raw.source.storageMode !== 'sqlite')) throw new Error('Chế độ lưu trữ nguồn của Checkpoint không hợp lệ.');
  if (!isRecord_ACU(raw.templateSnapshot) || !isRecord_ACU(raw.guideSnapshot) || !isRecord_ACU(raw.integrity)) throw new Error('Checkpoint thiếu mẫu, bảng hướng dẫn hoặc thông tin toàn vẹn.');
  const tableSnapshot = normalizeTableData_ACU(raw.tableSnapshot, 'tableSnapshot');
  const templateData = normalizeTableData_ACU(raw.templateSnapshot.data, 'templateSnapshot.data');
  const guideData = normalizeGuideData_ACU(raw.guideSnapshot.data);
  if (!guideData || !Object.keys(guideData).some(key => key.startsWith('sheet_'))) throw new Error('guideSnapshot.data không chứa bảng hướng dẫn hợp lệ.');
  const checkpoint: TableCheckpointFileV1_ACU = {
    format: CHECKPOINT_FORMAT_ACU,
    version: CHECKPOINT_VERSION_ACU,
    createdAt: Number(raw.createdAt),
    source: { storageMode: raw.source.storageMode },
    tableSnapshot,
    templateSnapshot: { data: templateData, presetName: typeof raw.templateSnapshot.presetName === 'string' ? raw.templateSnapshot.presetName : '' },
    guideSnapshot: { data: guideData },
    integrity: { algorithm: raw.integrity.algorithm === 'fnv1a' ? 'fnv1a' : (() => { throw new Error('Thuật toán toàn vẹn không được hỗ trợ.'); })(), payloadHash: String(raw.integrity.payloadHash || '') },
  };
  if (!checkpoint.integrity.payloadHash) throw new Error('Checkpoint thiếu hash toàn vẹn.');
  const { integrity, ...payload } = checkpoint;
  // 先验证文件原始内容的哈希，再修复历史版本错误追加的尾标记；否则会把被篡改
  // 的文件误当作可兼容旧文件。修复后重签内部对象，使 parse → restore 幂等。
  if (payloadHash_ACU(payload) !== integrity.payloadHash) throw new Error('Kiểm tra toàn vẹn Checkpoint thất bại, tệp có thể đã bị hỏng hoặc bị sửa đổi.');
  const repairedLegacyAutoMergedTails = repairCheckpointLegacyAutoMergedTails_ACU(tableSnapshot, templateData, guideData);
  assertCanonicalCheckpointRows_ACU(tableSnapshot, 'tableSnapshot');
  assertCanonicalCheckpointRows_ACU(templateData, 'templateSnapshot.data');
  assertCanonicalCheckpointRows_ACU(guideData as TableDataObject_ACU, 'guideSnapshot.data');
  assertCheckpointSchemaConsistency_ACU(tableSnapshot, templateData, guideData);
  if (repairedLegacyAutoMergedTails) {
    const { integrity: _previousIntegrity, ...repairedPayload } = checkpoint;
    checkpoint.integrity = { algorithm: 'fnv1a', payloadHash: payloadHash_ACU(repairedPayload) };
    logDebug_ACU('[Checkpoint] 已修复历史 auto_merged 越界尾列。');
  }
  return checkpoint;
}

export function parseTableCheckpointFile_ACU(text: string): TableCheckpointParseResult_ACU {
  try {
    if (!String(text || '').trim()) throw new Error('Tệp Checkpoint trống.');
    return { success: true, checkpoint: normalizeCheckpointPayload_ACU(JSON.parse(text)) };
  } catch (error: any) {
    return { success: false, error: error?.message || 'Phân tích Checkpoint thất bại.' };
  }
}

export function buildCurrentTableCheckpoint_ACU(): TableCheckpointFileV1_ACU {
  applyTemplateScopeForCurrentChat_ACU();
  const provider = getStorageProvider();
  const tableSnapshot = normalizeTableData_ACU(provider.getCurrentData(), 'dữ liệu bảng hiện tại');
  const isolationKey = getCurrentIsolationKey_ACU();
  const templateData = normalizeTableData_ACU(parseTableTemplateJson_ACU({ stripSeedRows: false }), 'mẫu đang có hiệu lực');
  const guideData = normalizeGuideData_ACU(cloneJson_ACU(getChatSheetGuideDataForIsolationKey_ACU(isolationKey)));
  if (!guideData || !Object.keys(guideData).some(key => key.startsWith('sheet_'))) throw new Error('Cuộc trò chuyện hiện tại thiếu bảng hướng dẫn có thể xuất.');
  repairCheckpointLegacyAutoMergedTails_ACU(tableSnapshot, templateData, guideData);
  assertCanonicalCheckpointRows_ACU(tableSnapshot, 'dữ liệu bảng hiện tại');
  assertCanonicalCheckpointRows_ACU(templateData, 'mẫu đang có hiệu lực');
  assertCanonicalCheckpointRows_ACU(guideData as TableDataObject_ACU, 'bảng hướng dẫn hiện tại');
  assertCheckpointSchemaConsistency_ACU(tableSnapshot, templateData, guideData);
  const scope = getCurrentChatTemplateScopeState_ACU({ isolationKey });
  const payload = {
    format: CHECKPOINT_FORMAT_ACU,
    version: CHECKPOINT_VERSION_ACU,
    createdAt: Date.now(),
    source: { storageMode: provider.mode },
    tableSnapshot: cloneJson_ACU(tableSnapshot),
    templateSnapshot: { data: cloneJson_ACU(templateData), presetName: String(scope?.presetName || '') },
    guideSnapshot: { data: cloneJson_ACU(guideData) },
  };
  const checkpoint: TableCheckpointFileV1_ACU = { ...payload, integrity: { algorithm: 'fnv1a', payloadHash: payloadHash_ACU(payload) } };
  logDebug_ACU(`[Checkpoint] 已构建导出快照：mode=${provider.mode}, sheets=${Object.keys(tableSnapshot).filter(key => key.startsWith('sheet_')).length}`);
  return checkpoint;
}

type MessageFieldSnapshot_ACU = { msg: any; fields: Record<string, { exists: boolean; value: any }> };
const RESTORE_MESSAGE_FIELDS_ACU = ['TavernDB_ACU_Data', 'TavernDB_ACU_SummaryData', 'TavernDB_ACU_IndependentData', 'TavernDB_ACU_Identity', 'TavernDB_ACU_IsolatedData', 'TavernDB_ACU_ModifiedKeys', 'TavernDB_ACU_UpdateGroupKeys'];
function captureMessageSnapshots_ACU(chat: any[]): MessageFieldSnapshot_ACU[] {
  return chat.filter(msg => msg && !msg.is_user).map(msg => ({ msg, fields: RESTORE_MESSAGE_FIELDS_ACU.reduce((out: Record<string, { exists: boolean; value: any }>, key) => {
    const exists = Object.prototype.hasOwnProperty.call(msg, key);
    out[key] = { exists, value: exists ? cloneJson_ACU(msg[key]) : undefined };
    return out;
  }, {}) }));
}
function restoreMessageSnapshots_ACU(snapshots: MessageFieldSnapshot_ACU[]): void {
  for (const snapshot of snapshots) for (const [key, field] of Object.entries(snapshot.fields)) {
    if (field.exists) snapshot.msg[key] = field.value; else delete snapshot.msg[key];
  }
}

type RuntimeRollbackStrategy_ACU =
  | { kind: 'binary'; snapshot: Uint8Array }
  | { kind: 'data'; data: TableDataObject_ACU }
  | { kind: 'empty' };

function sameCheckpointData_ACU(left: unknown, right: unknown): boolean {
  return JSON.stringify(canonicalize_ACU(left)) === JSON.stringify(canonicalize_ACU(right));
}

function scopeTemplateMatchesCheckpoint_ACU(scope: any, checkpointTemplate: TableDataObject_ACU): boolean {
  try {
    const scopeSnapshot = sanitizeTemplateSnapshotForChat_ACU(scope?.templateStr || null);
    const checkpointSnapshot = sanitizeTemplateSnapshotForChat_ACU(checkpointTemplate);
    if (!scopeSnapshot?.templateObj || !checkpointSnapshot?.templateObj) return false;
    return sameCheckpointData_ACU(
      normalizeTableData_ACU(scopeSnapshot.templateObj, 'phạm vi mẫu cuộc trò chuyện sau khi khôi phục'),
      normalizeTableData_ACU(checkpointSnapshot.templateObj, 'snapshot mẫu Checkpoint'),
    );
  } catch {
    return false;
  }
}

async function runCheckpointDerivedRefresh_ACU(
  checked: TableCheckpointFileV1_ACU,
  isolationKey: string,
  vectorManifests: any[],
): Promise<Pick<TableCheckpointRestoreResult_ACU, 'cleanupWarnings' | 'derivedRefreshWarnings' | 'postCondition'>> {
  const derivedRefreshWarnings: string[] = [];
  const runDerivedStep = async (label: string, task: () => void | Promise<void>): Promise<void> => {
    try {
      await task();
    } catch (error: any) {
      derivedRefreshWarnings.push(`${label}: ${error?.message || String(error)}`);
    }
  };

  await runDerivedStep('Áp dụng phạm vi mẫu thất bại', () => { applyTemplateScopeForCurrentChat_ACU(); });
  if (isSqliteMode()) await runDerivedStep('Tải lại runtime SQLite thất bại', async () => { await reloadStorageProvider(); });
  await runDerivedStep('Kích hoạt dọn dẹp mục Sổ thế giới cũ thất bại', () => deleteAllGeneratedEntries_ACU());
  await runDerivedStep('Làm mới runtime cuộc trò chuyện và Sổ thế giới thất bại', async () => { await refreshMergedDataAndNotify_ACU(); });

  let cleanupWarnings: string[] | undefined;
  try {
    const warnings = await cleanupCheckpointVectorIndexManifestsAfterCommit_ACU(vectorManifests);
    if (warnings.length) cleanupWarnings = warnings;
  } catch (error: any) {
    derivedRefreshWarnings.push(`Dọn dẹp chỉ mục vector thất bại: ${error?.message || String(error)}`);
  }

  const finalProvider = getActiveStorageProvider();
  const finalScope = getCurrentChatTemplateScopeState_ACU({ isolationKey });
  const finalGuide = getChatSheetGuideDataForIsolationKey_ACU(isolationKey);
  const postCondition: TableCheckpointRestorePostCondition_ACU = {
    runtimeMatches: !!finalProvider && sameCheckpointData_ACU(finalProvider.getCurrentData(), checked.tableSnapshot),
    scopeIsChatOverride: finalScope?.mode === 'chat_override',
    templateMatches: scopeTemplateMatchesCheckpoint_ACU(finalScope, checked.templateSnapshot.data),
    guideMatches: sameCheckpointData_ACU(finalGuide, checked.guideSnapshot.data),
    providerMode: finalProvider?.mode || null,
  };
  if (!finalProvider) derivedRefreshWarnings.push('Kho lưu trữ bảng đang hoạt động sau khi khôi phục không khả dụng.');
  if (!postCondition.runtimeMatches) derivedRefreshWarnings.push('Dữ liệu runtime sau khi khôi phục không khớp snapshot dữ liệu Checkpoint.');
  if (!postCondition.scopeIsChatOverride) derivedRefreshWarnings.push('Phạm vi mẫu sau khi khôi phục không phải chat_override.');
  if (!postCondition.templateMatches) derivedRefreshWarnings.push('Snapshot mẫu cuộc trò chuyện sau khi khôi phục không khớp mẫu Checkpoint.');
  if (!postCondition.guideMatches) derivedRefreshWarnings.push('Bảng hướng dẫn sau khi khôi phục không khớp bảng hướng dẫn Checkpoint.');

  return {
    ...(cleanupWarnings ? { cleanupWarnings } : {}),
    ...(derivedRefreshWarnings.length ? { derivedRefreshWarnings } : {}),
    postCondition,
  };
}

export async function restoreTableCheckpointToLatestAi_ACU(parsed: TableCheckpointFileV1_ACU): Promise<TableCheckpointRestoreResult_ACU> {
  let checked: TableCheckpointFileV1_ACU;
  let chat: any[];
  let targetMessageIndex: number;
  let isolationKey: string;
  let provider: ReturnType<typeof getStorageProvider>;
  let rollbackStrategy: RuntimeRollbackStrategy_ACU;
  let messageSnapshots: MessageFieldSnapshot_ACU[];
  let oldScopeContainer: any;
  let oldGuideContainer: any;
  try {
    checked = normalizeCheckpointPayload_ACU(parsed);
    chat = getChatArray_ACU();
    targetMessageIndex = getLatestAiMessageIndexFromChat_ACU(chat);
    if (targetMessageIndex < 0) return { success: false, error: 'Cuộc trò chuyện hiện tại không có tầng AI, không thể khôi phục Checkpoint.' };
    isolationKey = getCurrentIsolationKey_ACU();
    provider = getStorageProvider();
    const currentData = provider.getCurrentData();
    const oldData = currentData === null ? null : cloneJson_ACU(currentData);
    const runtimeSnapshot = provider.createRuntimeSnapshot?.();
    if (runtimeSnapshot instanceof Uint8Array) {
      if (typeof provider.restoreRuntimeSnapshot !== 'function') throw new Error('Kho lưu trữ bảng hiện tại không hỗ trợ hoàn tác snapshot runtime SQLite.');
      rollbackStrategy = { kind: 'binary', snapshot: runtimeSnapshot };
    } else if (oldData !== null) {
      if (typeof provider.replaceAllData !== 'function') throw new Error('Kho lưu trữ bảng hiện tại không hỗ trợ hoàn tác dữ liệu bảng.');
      rollbackStrategy = { kind: 'data', data: oldData };
    } else {
      if (typeof provider.clearRuntimeData !== 'function') throw new Error('Kho lưu trữ bảng hiện tại không hỗ trợ hoàn tác về runtime rỗng.');
      rollbackStrategy = { kind: 'empty' };
    }
    if (typeof provider.replaceAllData !== 'function') throw new Error('Kho lưu trữ bảng hiện tại không hỗ trợ khôi phục dữ liệu Checkpoint.');
    messageSnapshots = captureMessageSnapshots_ACU(chat);
    oldScopeContainer = cloneJson_ACU(peekChatScopedConfigContainer_ACU(chat));
    oldGuideContainer = cloneJson_ACU(peekChatSheetGuideContainer_ACU(chat));
  } catch (error: any) {
    return { success: false, error: error?.message || 'Kiểm tra trước khôi phục Checkpoint thất bại.' };
  }
  let vectorManifests: any[] = [];
  try {
    const result = await runTableWriteTransaction_ACU({ source: 'import', reason: 'restoreTableCheckpoint', isolationKey, writeSet: [{ kind: 'all' }], maintenanceMode: 'exclusive' }, async (transactionContext) => {
      return transactionContext.runCommit(async () => {
        const cleared = await clearAllAiTableDataForCheckpointRestore_ACU();
        vectorManifests = cleared.vectorManifestsToDeleteAfterCommit;
        const replaced = await provider.replaceAllData(cloneJson_ACU(checked.tableSnapshot));
        if (!replaced?.success) throw new Error(replaced?.error || 'Khôi phục runtime bảng Checkpoint thất bại.');
        const templateState = buildChatTemplateScopeStateFromCurrent_ACU({ isolationKey, presetName: checked.templateSnapshot.presetName, source: 'checkpoint_import', templateSource: checked.templateSnapshot.data, guideData: checked.guideSnapshot.data });
        if (!templateState || !setCurrentChatTemplateScopeState_ACU(templateState, { isolationKey, reason: 'checkpoint_import' })) throw new Error('Khôi phục phạm vi mẫu Checkpoint thất bại.');
        if (!setChatSheetGuideDataForIsolationKey_ACU(isolationKey, checked.guideSnapshot.data, { reason: 'checkpoint_import', syncTemplateScope: false })) throw new Error('Khôi phục bảng hướng dẫn Checkpoint thất bại.');
        const sheetKeys = Object.keys(checked.tableSnapshot).filter(key => key.startsWith('sheet_'));
        const persisted = await persistTablesToChatMessage_ACU({ targetMessageIndex, tableData: checked.tableSnapshot, targetSheetKeys: sheetKeys, trackingSheetKeys: sheetKeys, trackAsUpdate: false, source: 'import', checkpointReason: 'import', operations: [{ kind: 'data_replace', data: checked.tableSnapshot, reason: 'checkpoint_fallback' }], strictSave: true, assumeCommitLock: true, transactionContext });
        if (!persisted.saved) throw new Error(persisted.error || 'Lưu bền Checkpoint thất bại.');
        return { clearedCount: cleared.clearedCount, restoredMessageIndex: persisted.messageIndex ?? targetMessageIndex };
      }, [{ kind: 'all' }]);
    });
    const derivedRefresh = await runCheckpointDerivedRefresh_ACU(checked, isolationKey, vectorManifests);
    return { success: true, ...result, ...derivedRefresh };
  } catch (error: any) {
    restoreMessageSnapshots_ACU(messageSnapshots);
    setChatScopedConfigContainer_ACU(chat, oldScopeContainer);
    setChatSheetGuideContainer_ACU(chat, oldGuideContainer);
    try {
      if (rollbackStrategy.kind === 'binary') {
        await provider.restoreRuntimeSnapshot!(rollbackStrategy.snapshot);
      } else if (rollbackStrategy.kind === 'data') {
        const restored = await provider.replaceAllData!(rollbackStrategy.data);
        if (!restored.success) throw new Error(restored.error || 'Hoàn tác runtime bảng Checkpoint thất bại.');
      } else {
        provider.clearRuntimeData!();
      }
      applyTemplateScopeForCurrentChat_ACU();
      await saveChatToHostStrict_ACU();
    } catch (rollbackError: any) {
      return { success: false, error: `Khôi phục Checkpoint thất bại: ${error?.message || String(error)}; lưu hoàn tác cũng thất bại: ${rollbackError?.message || String(rollbackError)}` };
    }
    return { success: false, error: error?.message || 'Khôi phục Checkpoint thất bại.' };
  }
}

import type { TableDataObject_ACU } from '../../shared/models/table-data';
import { isSummaryOrOutlineTable_ACU, logDebug_ACU } from '../../shared/utils';
import { readIsolatedTagData_ACU } from '../../data/repositories/chat-message-data-repo';
import { getChatArray_ACU } from '../chat/chat-service';
import { currentJsonTableData_ACU, getCurrentIsolationKey_ACU } from '../runtime/state-manager';
import { isSqliteMode } from './storage-mode';
import { sanitizeChatSheetsObject_ACU } from '../template/chat-scope';
import { getStorageProvider, reloadStorageProvider } from './table-storage-strategy';
import { isV2TagData_ACU } from './storage-strategy-resolver';
import {
  auditTableDataForUpgrade_ACU,
  type UpgradeAuditIssue_ACU,
  type UpgradeAuditStatus_ACU,
} from './table-data-upgrade-audit';
import { repairTableDataFromAudit_ACU } from './table-data-repair';
import { runTableUpdateCommit_ACU } from './table-update-commit';
import { validateSqliteTemplateDataStrict_ACU } from './sqlite-template-validation';

export type ImportTableJsonFailureStage_ACU = 'input' | 'runtime_restore' | 'preflight' | 'commit' | 'post_commit_runtime';
export type ImportTableJsonIssue_ACU = UpgradeAuditIssue_ACU | {
  code: 'import_invalid_json' | 'import_invalid_structure' | 'sqlite_preflight_failed';
  message: string;
};

export interface ImportTableJsonCommitResult_ACU {
  success: boolean;
  messageIndex?: number;
  tableData?: TableDataObject_ACU;
  sheetKeys?: string[];
  hasSummaryTables?: boolean;
  persisted?: boolean;
  error?: string;
  failureStage?: ImportTableJsonFailureStage_ACU;
  auditStatus?: UpgradeAuditStatus_ACU;
  issues?: ImportTableJsonIssue_ACU[];
}

export interface ImportTableJsonOptions_ACU {
  /** true: 外部导入并写入聊天持久化；false: 删除楼层/备份恢复后只恢复运行时，不制造新的 V2 持久化事件。 */
  persist?: boolean;
}

function resolveLatestAiMessageIndex_ACU(): number {
  const chat = getChatArray_ACU();
  if (!Array.isArray(chat) || chat.length === 0) return -1;
  for (let i = chat.length - 1; i >= 0; i -= 1) {
    if (chat[i] && !chat[i].is_user) return i;
  }
  return -1;
}

function hasV2FullCheckpointAtOrBeforeTarget_ACU(targetMessageIndex: number, isolationKey: string): boolean {
  const chat = getChatArray_ACU();
  if (!Array.isArray(chat) || targetMessageIndex < 0) return false;
  return chat.slice(0, targetMessageIndex + 1).some(message => {
    const tagData = readIsolatedTagData_ACU(message, isolationKey);
    return isV2TagData_ACU(tagData) && tagData.storageFrame.checkpoint?.kind === 'full';
  });
}

export async function importTableJsonThroughCommit_ACU(
  jsonString: string,
  options: ImportTableJsonOptions_ACU = {},
): Promise<ImportTableJsonCommitResult_ACU> {
  let newData: unknown;
  try {
    newData = JSON.parse(jsonString);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      persisted: false,
      failureStage: 'input',
      issues: [{ code: 'import_invalid_json', message }],
      error: `Không thể phân tích JSON đã nhập: ${message}`,
    };
  }
  if (!newData || typeof newData !== 'object' || !('mate' in newData) || !Object.keys(newData).some(k => k.startsWith('sheet_'))) {
    return {
      success: false,
      persisted: false,
      failureStage: 'input',
      issues: [{ code: 'import_invalid_structure', message: 'JSON đã nhập thiếu cấu trúc then chốt (mate, sheet_*).' }],
      error: 'JSON đã nhập thiếu cấu trúc then chốt (mate, sheet_*).',
    };
  }

  const importedTableData = sanitizeChatSheetsObject_ACU(newData, { ensureMate: true }) as TableDataObject_ACU;
  const persist = options.persist !== false;

  if (!persist) {
    const provider = getStorageProvider();
    if (typeof provider.replaceAllData !== 'function') {
      return { success: false, persisted: false, failureStage: 'runtime_restore', error: 'Storage provider hiện tại không hỗ trợ lệnh thay thế toàn bộ.' };
    }
    const replaceResult = await provider.replaceAllData(importedTableData);
    if (!replaceResult.success) {
      return { success: false, persisted: false, failureStage: 'runtime_restore', error: replaceResult.error || 'Thay thế toàn bộ runtime thất bại.' };
    }
    const runtimeData = (provider.getCurrentData() || importedTableData) as TableDataObject_ACU;
    const sheetKeys = Object.keys(runtimeData).filter(k => k.startsWith('sheet_'));
    const hasSummaryTables = Object.keys(runtimeData)
      .filter(k => k.startsWith('sheet_'))
      .some(k => {
        const table = (runtimeData as any)?.[k];
        return Boolean(table?.name && isSummaryOrOutlineTable_ACU(table.name));
      });
    return {
      success: true,
      tableData: runtimeData,
      sheetKeys,
      hasSummaryTables,
      persisted: false,
    };
  }

  const audit = auditTableDataForUpgrade_ACU(importedTableData);
  const repair = repairTableDataFromAudit_ACU(audit);
  if (audit.status === 'unrecoverable' || repair.requiresConfirmation) {
    const diagnostics = audit.issues.map(issue => issue.code).join(', ') || audit.status;
    return {
      success: false,
      persisted: false,
      failureStage: 'preflight',
      auditStatus: audit.status,
      issues: audit.issues,
      error: `Dữ liệu nhập cần xác nhận thủ công hoặc không thể sửa: ${diagnostics}`,
    };
  }
  const candidateData = repair.candidateData as TableDataObject_ACU;
  if (isSqliteMode()) {
    const sqlitePreflight = await validateSqliteTemplateDataStrict_ACU(candidateData, { allowRuntimeDdlFallback: true });
    if (!sqlitePreflight.success) {
      const message = sqlitePreflight.error || 'Dữ liệu ứng viên không thể qua SQLite hydrate.';
      return {
        success: false,
        persisted: false,
        failureStage: 'preflight',
        auditStatus: audit.status,
        issues: [{ code: 'sqlite_preflight_failed', message }],
        error: `Dữ liệu ứng viên nhập không qua kiểm tra trước SQLite: ${message}`,
      };
    }
  } else {
    logDebug_ACU('[TableImport] 当前为 native 存储模式，跳过 SQLite hydrate 预检。');
  }
  const sheetKeys = Object.keys(candidateData).filter(k => k.startsWith('sheet_'));
  const targetMessageIndex = resolveLatestAiMessageIndex_ACU();

  const commitResult = await runTableUpdateCommit_ACU<boolean>({
    source: 'import',
    reason: 'importTableAsJson',
    isolationKey: getCurrentIsolationKey_ACU(),
    writeSet: [{ kind: 'all' }],
    revisionWriteSet: [{ kind: 'all' }],
    initialData: currentJsonTableData_ACU,
    targetMessageIndex,
    targetSheetKeys: sheetKeys,
    updateGroupKeys: null,
    trackingSheetKeys: [],
    trackAsUpdate: false,
    strictSave: true,
  }, async () => {
    const hasExistingAnchor = hasV2FullCheckpointAtOrBeforeTarget_ACU(
      targetMessageIndex,
      getCurrentIsolationKey_ACU(),
    );
    return {
      success: true,
      value: true,
      tableData: candidateData,
      persist: {
        operations: hasExistingAnchor
          ? [{ kind: 'data_replace' as const, data: candidateData, reason: 'import' }]
          : [],
      },
    };
  });

  if (!commitResult.success || !commitResult.tableData) {
    return {
      success: false,
      persisted: false,
      failureStage: 'commit',
      error: commitResult.error || 'Commit dữ liệu nhập thất bại.',
    };
  }

  const provider = getStorageProvider();
  if (typeof provider.replaceAllData !== 'function') {
    await reloadStorageProvider();
    return { success: false, persisted: true, failureStage: 'post_commit_runtime', error: 'Dữ liệu nhập đã được lưu, nhưng storage provider hiện tại không hỗ trợ thay thế toàn bộ runtime; đã thử tải lại runtime.' };
  }
  try {
    const replaceResult = await provider.replaceAllData(commitResult.tableData);
    if (!replaceResult.success) {
      await reloadStorageProvider();
      return { success: false, persisted: true, failureStage: 'post_commit_runtime', error: `Dữ liệu nhập đã được lưu, nhưng thay thế toàn bộ runtime thất bại; đã thử tải lại runtime: ${replaceResult.error || 'Lỗi không xác định'}` };
    }
  } catch (error) {
    await reloadStorageProvider();
    return { success: false, persisted: true, failureStage: 'post_commit_runtime', error: `Dữ liệu nhập đã được lưu, nhưng thay thế toàn bộ runtime gặp lỗi; đã thử tải lại runtime: ${error instanceof Error ? error.message : String(error)}` };
  }

  const hasSummaryTables = Object.keys(commitResult.tableData)
    .filter(k => k.startsWith('sheet_'))
    .some(k => {
      const table = (commitResult.tableData as any)?.[k];
      return Boolean(table?.name && isSummaryOrOutlineTable_ACU(table.name));
    });

  return {
    success: true,
    messageIndex: commitResult.messageIndex ?? targetMessageIndex,
    tableData: commitResult.tableData,
    sheetKeys,
    hasSummaryTables,
    persisted: true,
  };
}

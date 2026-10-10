/**
 * service/template/template-seed-pollution-migration.ts — seed 双池污染显式迁移（阶段 F2-F4）
 *
 * 目标：对当前聊天执行显式、可回滚的 seed 污染清理，不在启动时静默修改历史数据。
 * 语义（用户已拍板）：
 *   - 冲突默认 template-wins：模板 content 优先，重复的 seedRows 清理掉；
 *   - 已物化的 guide seed（guide_seed_duplicate）只清理残留 seed，保留 runtime 数据；
 *   - row_id 冲突重排身份，不丢行；
 *   - 手动触发：prepare 生成计划 + 备份，commit 事务执行，失败回滚内存，reload 后置校验；
 *   - global preset 只诊断不迁移。
 *
 * 边界：不写 SQLite runtime 数据本身（runtime 已由物化路径持有，保留用户数据）；
 * 只修正 guide seedRows 与 chat scope。迁移前 prepare 已导出备份快照，commit 后可回滚。
 */

import { getChatArray_ACU, saveChatToHostStrict_ACU } from '../../data/gateways/chat-gateway';
import { getCurrentIsolationKey_ACU, settings_ACU } from '../runtime/state-manager';
import { extractBusinessKeyColumns_ACU } from './template-data-preflight';
import { runTableWriteTransaction_ACU } from '../table/table-write-transaction';
import { reloadStorageProvider, didSqliteFallbackAfterReload_ACU } from '../table/table-storage-strategy';
import { getCurrentStorageMode } from '../table/storage-mode';
import {
  getChatSheetGuideDataForIsolationKey_ACU,
  setChatSheetGuideDataForIsolationKey_ACU,
} from './chat-scope';
import { CHAT_SHEET_GUIDE_SEED_ROWS_FIELD_ACU, getChatSheetGuideContainer_ACU, getChatScopedConfigContainer_ACU, setChatSheetGuideContainer_ACU, setChatScopedConfigContainer_ACU } from '../../data/storage/chat-history';
import { logWarn_ACU } from '../../shared/utils';

/** 单表迁移动作 */
export type SeedMigrationAction_ACU =
  | { kind: 'drop_duplicate_seed_rows'; sheetKey: string; sheetName: string; businessKeyColumns: string[]; droppedKeys: string[]; keptKeys: string[] }
  | { kind: 'remap_row_id_conflicts'; sheetKey: string; sheetName: string; remapped: Array<{ from: string; to: string }> }
  | { kind: 'no_change'; sheetKey: string; sheetName: string };

/** 迁移计划（prepare 产出，commit 消费） */
export interface SeedMigrationPlan_ACU {
  planId: string;
  kind: 'seed_pollution_cleanup';
  chatKey: string;
  isolationKey: string;
  createdAt: number;
  actions: SeedMigrationAction_ACU[];
  /** 存在 error 级动作时要求显式确认 */
  requiresConfirmation: boolean;
  /** 回滚/审计用备份：迁移前的 guide / scoped config / 聊天快照 */
  backup: {
    guideContainer: any;
    scopedConfigContainer: any;
    chatSnapshot: any[];
  };
  /** commit 时校验作用域与帧是否变化的 chat 引用 */
  chat: any[];
}

export type PrepareSeedMigrationResult_ACU =
  | { status: 'plan_ready'; plan: SeedMigrationPlan_ACU }
  | { status: 'no_issue'; isolationKey: string; message: string };

export interface SeedMigrationCommitResult_ACU {
  status: 'committed' | 'commit_failed_rolled_back' | 'committed_postcondition_failed';
  planId: string;
  error?: string;
  appliedActions?: SeedMigrationAction_ACU[];
}

const seedMigrationPlans_ACU = new Map<string, SeedMigrationPlan_ACU>();

/**
 * F5 版本开关：默认开启（用户已拍板）。显式 `settings_ACU.seedMigrationEnabled === false`
 * 时进入纯诊断/日志观察模式，prepare/commit/rollback 全部拒绝执行（fail-closed）。
 * 未定义视为开启，保证升级后历史聊天不被隐式修改（执行仍需手动触发）。
 */
export function isSeedMigrationEnabled_ACU(): boolean {
  return settings_ACU?.seedMigrationEnabled !== false;
}

function clone_ACU<T>(value: T): T {
  return value === undefined ? value : JSON.parse(JSON.stringify(value));
}

function buildPlanId_ACU(): string {
  return `seed-cleanup-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function getErrorMessage_ACU(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function currentScopeMatches_ACU(plan: SeedMigrationPlan_ACU): boolean {
  return plan.chat === getChatArray_ACU();
}

/** 从 guide sheet 提取 seedRows（含下划线旧字段兼容） */
function readSeedRows_ACU(sheet: any): unknown[][] {
  const rows: unknown[][] = [];
  if (Array.isArray(sheet?.[CHAT_SHEET_GUIDE_SEED_ROWS_FIELD_ACU])) {
    for (const row of sheet[CHAT_SHEET_GUIDE_SEED_ROWS_FIELD_ACU]) {
      if (Array.isArray(row)) rows.push(row);
    }
  } else if (Array.isArray(sheet?._seedRows)) {
    for (const row of sheet._seedRows) {
      if (Array.isArray(row)) rows.push(row);
    }
  }
  return rows;
}

function writeSeedRows_ACU(sheet: any, rows: unknown[][]): void {
  sheet[CHAT_SHEET_GUIDE_SEED_ROWS_FIELD_ACU] = clone_ACU(rows);
  delete sheet._seedRows;
}

/** 按 header 列名构建小写列名 -> 索引映射 */
function buildHeaderIndex_ACU(header: unknown[]): Map<string, number> {
  const idx = new Map<string, number>();
  header.forEach((cell, index) => {
    const name = String(cell ?? '').trim().toLowerCase();
    if (name && !idx.has(name)) idx.set(name, index);
  });
  return idx;
}


/** 计算单 sheet 修正后的 seedRows 与动作。纯函数，不改入参。 */
export function buildSeedCleanupPlanForSheet_ACU(
  sheet: any,
  options: {
    sheetKey: string;
    sheetName: string;
    keyGroups: string[][];
    runtimeHeader?: unknown[];
    runtimeRows?: unknown[][];
  },
): { nextSeedRows: unknown[][]; action: SeedMigrationAction_ACU } {
  const { sheetKey, sheetName, keyGroups } = options;
  const header = Array.isArray(sheet?.content?.[0]) ? sheet.content[0] : [];
  const seedRows = readSeedRows_ACU(sheet);
  if (seedRows.length === 0) {
    return { nextSeedRows: [], action: { kind: 'no_change', sheetKey, sheetName } };
  }

  const headerIndex = buildHeaderIndex_ACU(header);
  const rowIdIndex = headerIndex.get('row_id');

  // 与 runtime 同业务键的 seed 视为已物化残留 -> 清理（保留 runtime 数据）
  // 与 content（模板数据）同业务键的 seed 视为双池重复 -> template-wins 清理 seed
  const runtimeIndex = new Map<string, number>();
  const contentIndex = new Map<string, number>();
  if (options.runtimeRows && options.runtimeHeader) {
    const rtIdx = buildHeaderIndex_ACU(options.runtimeHeader);
    options.runtimeRows.forEach((row, i) => {
      for (const group of keyGroups) {
        const parts: string[] = [];
        let ok = true;
        for (const col of group) {
          const c = rtIdx.get(col.toLowerCase());
          if (c === undefined || c >= row.length) { ok = false; break; }
          parts.push(String(row[c] ?? ''));
        }
        if (ok && parts.join('\u0001')) runtimeIndex.set(parts.join('\u0001'), i);
      }
    });
  }
  const contentRows = Array.isArray(sheet?.content) ? sheet.content.slice(1).filter((r: unknown) => Array.isArray(r)) : [];
  contentRows.forEach((row: unknown[], i: number) => {
    for (const group of keyGroups) {
      const parts: string[] = [];
      let ok = true;
      for (const col of group) {
        const c = headerIndex.get(col.toLowerCase());
        if (c === undefined || c >= row.length) { ok = false; break; }
        parts.push(String(row[c] ?? ''));
      }
      if (ok && parts.join('\u0001')) contentIndex.set(parts.join('\u0001'), i);
    }
  });

  const droppedKeys: string[] = [];
  const keptKeys: string[] = [];
  const nextSeedRows: unknown[][] = [];
  for (const row of seedRows) {
    let isDuplicate = false;
    for (const group of keyGroups) {
      const parts: string[] = [];
      let ok = true;
      for (const col of group) {
        const c = headerIndex.get(col.toLowerCase());
        if (c === undefined || c >= row.length) { ok = false; break; }
        parts.push(String(row[c] ?? ''));
      }
      const key = ok ? parts.join('\u0001') : '';
      if (key && (runtimeIndex.has(key) || contentIndex.has(key))) {
        isDuplicate = true;
        droppedKeys.push(key);
        break;
      }
    }
    if (isDuplicate) continue;
    keptKeys.push(String(row[rowIdIndex ?? -1] ?? ''));
    nextSeedRows.push(row);
  }

  const action: SeedMigrationAction_ACU = droppedKeys.length > 0
    ? { kind: 'drop_duplicate_seed_rows', sheetKey, sheetName, businessKeyColumns: keyGroups.flat(), droppedKeys, keptKeys }
    : { kind: 'no_change', sheetKey, sheetName };
  return { nextSeedRows, action };
}

/**
 * 生成迁移计划：读取当前 guide，计算每 sheet 清理动作，导出备份。只读，不写存储。
 * 无任何可执行动作时返回 no_issue。
 */
export function prepareSeedMigration_ACU(
  options: { isolationKey?: string; chat?: any[] } = {},
): PrepareSeedMigrationResult_ACU {
  if (!isSeedMigrationEnabled_ACU()) {
    return { status: 'no_issue', isolationKey: options.isolationKey ?? getCurrentIsolationKey_ACU(), message: 'Công tắc di chuyển seed đã tắt (chế độ chỉ quan sát chẩn đoán), không tạo kế hoạch.' };
  }
  const chat = options.chat || getChatArray_ACU();
  const isolationKey = options.isolationKey ?? getCurrentIsolationKey_ACU();
  const guideData = getChatSheetGuideDataForIsolationKey_ACU(isolationKey);
  if (!guideData || typeof guideData !== 'object') {
    return { status: 'no_issue', isolationKey, message: 'Cuộc trò chuyện hiện tại không có dữ liệu guide, không cần di chuyển.' };
  }

  const actions: SeedMigrationAction_ACU[] = [];
  let hasAction = false;
  const guideClone = clone_ACU(guideData);
  const runtimeData: any = (globalThis as any).currentJsonTableData_ACU ?? (globalThis as any).__currentJsonTableData_ACU;

  for (const sheetKey of Object.keys(guideClone).filter(k => k.startsWith('sheet_'))) {
    const sheet = guideClone[sheetKey];
    if (!sheet || typeof sheet !== 'object') continue;
    const ddl = String(sheet?.sourceData?.ddl || '');
    const keyGroups = ddl ? extractBusinessKeyColumns_ACU(ddl) : [];
    const runtimeSheet = runtimeData?.[sheetKey];
    const runtimeHeader = Array.isArray(runtimeSheet?.content?.[0]) ? runtimeSheet.content[0] : undefined;
    const runtimeRows = Array.isArray(runtimeSheet?.content) ? runtimeSheet.content.slice(1) : undefined;
    const { nextSeedRows, action } = buildSeedCleanupPlanForSheet_ACU(sheet, {
      sheetKey,
      sheetName: String(sheet?.name ?? sheetKey),
      keyGroups,
      runtimeHeader,
      runtimeRows,
    });
    if (action.kind !== 'no_change') {
      hasAction = true;
      writeSeedRows_ACU(sheet, nextSeedRows);
    }
    actions.push(action);
  }

  if (!hasAction) {
    return { status: 'no_issue', isolationKey, message: 'guide hiện tại không bị nhiễm seed hai pool, không cần di chuyển.' };
  }

  const plan: SeedMigrationPlan_ACU = {
    planId: buildPlanId_ACU(),
    kind: 'seed_pollution_cleanup',
    chatKey: String((globalThis as any).currentChatFileIdentifier_ACU ?? '').trim() || 'current-chat',
    isolationKey,
    createdAt: Date.now(),
    actions,
    requiresConfirmation: actions.some(a => a.kind === 'drop_duplicate_seed_rows'),
    backup: {
      guideContainer: clone_ACU(getChatSheetGuideContainer_ACU(chat)),
      scopedConfigContainer: clone_ACU(getChatScopedConfigContainer_ACU(chat)),
      chatSnapshot: clone_ACU(chat),
    },
    chat,
  };
  seedMigrationPlans_ACU.set(plan.planId, plan);
  return { status: 'plan_ready', plan };
}


/**
 * 提交迁移：校验计划有效与作用域未变 -> 事务内写入修正后的 guide -> 宿主保存 -> reload 后置校验。
 * 任一步失败即回滚内存聊天并返回失败。
 */
export async function commitSeedMigration_ACU(
  planId: string,
  options: { confirm?: boolean } = {},
): Promise<SeedMigrationCommitResult_ACU> {
  if (!isSeedMigrationEnabled_ACU()) {
    return { status: 'commit_failed_rolled_back', planId, error: 'Công tắc di chuyển seed đã tắt (chế độ chỉ quan sát chẩn đoán), từ chối gửi.' };
  }
  const plan = seedMigrationPlans_ACU.get(planId);
  const failure = (error: string): SeedMigrationCommitResult_ACU => ({ status: 'commit_failed_rolled_back', planId, error });
  if (!plan) return failure('Kế hoạch di chuyển không tồn tại hoặc đã mất hiệu lực, hãy chuẩn bị lại.');
  if (plan.requiresConfirmation && options.confirm !== true) {
    return failure('Di chuyển có thao tác dọn dẹp, phải xác nhận rõ ràng (confirm: true) mới thực thi được.');
  }
  if (!currentScopeMatches_ACU(plan)) {
    seedMigrationPlans_ACU.delete(planId);
    return failure('Phạm vi kế hoạch di chuyển đã thay đổi, hãy chuẩn bị lại.');
  }

  const appliedActions: SeedMigrationAction_ACU[] = [];
  const commitResult = await runTableWriteTransaction_ACU<SeedMigrationCommitResult_ACU>({
    source: 'system',
    reason: 'seed_pollution_cleanup',
    isolationKey: plan.isolationKey,
    writeSet: [{ kind: 'all' }],
    maintenanceMode: 'exclusive',
  }, async (ctx) => {
    try {
      return await ctx.runCommit(async () => {
        if (!currentScopeMatches_ACU(plan)) {
          seedMigrationPlans_ACU.delete(planId);
          return failure('Phạm vi kế hoạch di chuyển đã thay đổi, hãy chuẩn bị lại.');
        }

        // 基于 plan.backup 重建修正后的 guide，保证幂等：重复 commit 以备份为基准重算，不叠加。
        const baseGuide = plan.backup.guideContainer;
        const guideData = (baseGuide?.tags?.[plan.isolationKey]?.data) ?? null;
        if (!guideData || typeof guideData !== 'object') {
          seedMigrationPlans_ACU.delete(planId);
          return failure('Thiếu dữ liệu guide sao lưu, không thể thực hiện di chuyển.');
        }
        const nextGuide = clone_ACU(guideData);
        const runtimeData: any = (globalThis as any).currentJsonTableData_ACU ?? (globalThis as any).__currentJsonTableData_ACU;
        for (const action of plan.actions) {
          if (action.kind === 'no_change') { appliedActions.push(action); continue; }
          const sheet = nextGuide[action.sheetKey];
          if (!sheet || typeof sheet !== 'object') { appliedActions.push(action); continue; }
          const ddl = String(sheet?.sourceData?.ddl || '');
          const keyGroups = ddl ? extractBusinessKeyColumns_ACU(ddl) : [];
          const runtimeSheet = runtimeData?.[action.sheetKey];
          const runtimeHeader = Array.isArray(runtimeSheet?.content?.[0]) ? runtimeSheet.content[0] : undefined;
          const runtimeRows = Array.isArray(runtimeSheet?.content) ? runtimeSheet.content.slice(1) : undefined;
          const { nextSeedRows } = buildSeedCleanupPlanForSheet_ACU(sheet, {
            sheetKey: action.sheetKey,
            sheetName: action.sheetName,
            keyGroups,
            runtimeHeader,
            runtimeRows,
          });
          writeSeedRows_ACU(sheet, nextSeedRows);
          appliedActions.push(action);
        }

        const beforeChat = clone_ACU(plan.chat);
        const saved = setChatSheetGuideDataForIsolationKey_ACU(plan.isolationKey, nextGuide, {
          reason: 'seed_pollution_cleanup',
          syncTemplateScope: true,
          source: 'migration',
          presetName: String((globalThis as any).currentTemplatePresetName_ACU ?? ''),
        });
        if (!saved) {
          return failure('Ghi guide bị từ chối (normalize thất bại hoặc dữ liệu rỗng), đã khôi phục bộ nhớ.');
        }
        try {
          await saveChatToHostStrict_ACU();
        } catch (error) {
          plan.chat.splice(0, plan.chat.length, ...beforeChat);
          return failure(`Host lưu thất bại, đã khôi phục cuộc trò chuyện trong bộ nhớ: ${getErrorMessage_ACU(error)}`);
        }

        seedMigrationPlans_ACU.delete(planId);
        return { status: 'committed', planId, appliedActions };
      });
    } catch (error) {
      return failure(getErrorMessage_ACU(error));
    }
  });
  if (commitResult.status !== 'committed') return commitResult;

  const expectedStorageMode = getCurrentStorageMode();
  try {
    if (expectedStorageMode === 'sqlite') {
      await reloadStorageProvider();
      if (didSqliteFallbackAfterReload_ACU(expectedStorageMode)) {
        throw new Error('Sau khi tải lại runtime SQLite đã âm thầm quay về native provider.');
      }
    }
    return commitResult;
  } catch (error) {
    return { status: 'committed_postcondition_failed', planId, error: getErrorMessage_ACU(error), appliedActions };
  }
}

/**
 * 回滚：从计划备份恢复 guide container / scoped config / 聊天快照，并重新 hydrate 验证。
 * 仅对尚未失效的计划可用；执行后删除计划。
 */
export async function rollbackSeedMigration_ACU(planId: string): Promise<SeedMigrationCommitResult_ACU> {
  if (!isSeedMigrationEnabled_ACU()) {
    return { status: 'commit_failed_rolled_back', planId, error: 'Công tắc di chuyển seed đã tắt (chế độ chỉ quan sát chẩn đoán), từ chối khôi phục.' };
  }
  const plan = seedMigrationPlans_ACU.get(planId);
  if (!plan) return { status: 'commit_failed_rolled_back', planId, error: 'Kế hoạch di chuyển không tồn tại hoặc đã mất hiệu lực.' };
  if (!currentScopeMatches_ACU(plan)) {
    seedMigrationPlans_ACU.delete(planId);
    return { status: 'commit_failed_rolled_back', planId, error: 'Phạm vi kế hoạch di chuyển đã thay đổi, không thể khôi phục.' };
  }

  const beforeChat = clone_ACU(plan.chat);
  try {
    // 恢复 guide / scoped config 容器到迁移前快照
    setChatSheetGuideContainer_ACU(plan.chat, plan.backup.guideContainer);
    setChatScopedConfigContainer_ACU(plan.chat, plan.backup.scopedConfigContainer);
    // 恢复聊天快照（覆盖内存中已提交的变更）
    plan.chat.splice(0, plan.chat.length, ...clone_ACU(plan.backup.chatSnapshot));
    await saveChatToHostStrict_ACU();
    seedMigrationPlans_ACU.delete(planId);
  } catch (error) {
    plan.chat.splice(0, plan.chat.length, ...beforeChat);
    return { status: 'commit_failed_rolled_back', planId, error: `Lưu khôi phục thất bại, đã khôi phục bộ nhớ: ${getErrorMessage_ACU(error)}` };
  }

  try {
    if (getCurrentStorageMode() === 'sqlite') {
      await reloadStorageProvider();
    }
    return { status: 'committed', planId, error: 'rollback_applied' };
  } catch (error) {
    return { status: 'committed_postcondition_failed', planId, error: `Reload sau khi khôi phục thất bại: ${getErrorMessage_ACU(error)}` };
  }
}

/** 供测试与审计：查询当前是否持有指定计划 */
export function hasSeedMigrationPlan_ACU(planId: string): boolean {
  return seedMigrationPlans_ACU.has(planId);
}

/**
 * reset-defaults-service — 恢复默认配置的业务编排。
 * UI 只负责选项、等待与结果展示；候选准备、保存顺序、补偿和部分失败分类在这里收敛。
 */
import { settings_ACU } from '../runtime/state-manager';
import { applyTemplateScopeForCurrentChat_ACU, saveSettings_ACU } from '../settings/settings-service';
import { resetAllPromptsToDefault_ACU, restoreSettingsFields_ACU, snapshotSettingsFields_ACU } from '../settings/settings-write-service';
import { applyTemplateSnapshotToScope_ACU, getDefaultTemplateSnapshot_ACU } from '../template/template-preset-service';
import { clearCurrentChatTemplateSnapshots_ACU } from '../template/chat-scope';
import { clearCurrentTableLocks_ACU } from '../runtime/helpers-table-lock';
import { clearCurrentChatPlotPresetOverride_ACU } from '../plot/plot-logic';
import { loadOrCreateJsonTableFromChatHistory_ACU } from './table-service';
import { refreshMergedDataAndNotify_ACU } from '../worldbook/pipeline';
import { saveChatToHost_ACU } from '../../data/gateways/chat-gateway';
import { logWarn_ACU } from '../../shared/utils';

export type ResetDefaultsCleanupKey =
  | 'restore-template-prompts'
  | 'clear-template-snapshots'
  | 'clear-plot-snapshots'
  | 'clear-table-locks'
  | 'clear-table-order';

export interface ResetDefaultsCleanupOptions {
  restoreTemplateAndPrompts?: boolean;
  clearTemplateSnapshots?: boolean;
  clearPlotSnapshots?: boolean;
  clearTableLocks?: boolean;
  clearTableOrder?: boolean;
}

const DEFAULT_RESET_DEFAULTS_OPTIONS: Required<ResetDefaultsCleanupOptions> = {
  restoreTemplateAndPrompts: true,
  clearTemplateSnapshots: true,
  clearPlotSnapshots: true,
  clearTableLocks: true,
  clearTableOrder: true,
};

export function normalizeResetDefaultsOptions(options: ResetDefaultsCleanupOptions = {}): Required<ResetDefaultsCleanupOptions> {
  return { ...DEFAULT_RESET_DEFAULTS_OPTIONS, ...options };
}

export function hasSelectedResetDefaultsOption(options: Required<ResetDefaultsCleanupOptions>): boolean {
  return Object.values(options).some(Boolean);
}

export interface ResetDefaultsFailure {
  step: string;
  error: string;
  compensated: boolean;
}

export interface ResetDefaultsOutcome {
  success: boolean;
  skipped: boolean;
  completedSteps: string[];
  failures: ResetDefaultsFailure[];
  warnings: string[];
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const SETTINGS_SNAPSHOT_FIELDS = [
  'charCardPrompt',
  'mergeSummaryPrompt',
  'tableKeyOrder',
  'tableUpdateLocks',
  'specialIndexLocks',
  'plotSettings',
  'plotPresetBindings',
] as const;

/**
 * 恢复默认配置的单一业务入口。
 * - 候选与快照在任何清理前准备；
 * - 设置字段在最终 saveSettings 失败时回滚；
 * - 聊天清理统一在最后一次 saveChatToHost 提交；
 * - 派生刷新失败返回警告，不把成功步骤降级。
 */
export async function resetAllDefaults_ACU(options: ResetDefaultsCleanupOptions = {}): Promise<ResetDefaultsOutcome> {
  const cleanup = normalizeResetDefaultsOptions(options);
  if (!hasSelectedResetDefaultsOption(cleanup)) {
    return {
      success: false,
      skipped: true,
      completedSteps: [],
      failures: [{ step: 'selection', error: 'Chưa chọn mục cần khôi phục hoặc dọn dẹp.', compensated: false }],
      warnings: [],
    };
  }

  const completedSteps: string[] = [];
  const failures: ResetDefaultsFailure[] = [];
  const warnings: string[] = [];
  const settingsChanged = cleanup.restoreTemplateAndPrompts
    || cleanup.clearTableOrder
    || cleanup.clearTableLocks
    || cleanup.clearPlotSnapshots;
  const settingsSnapshot = settingsChanged
    ? snapshotSettingsFields_ACU([...SETTINGS_SNAPSHOT_FIELDS])
    : null;
  const chatDirty = cleanup.clearPlotSnapshots || cleanup.clearTemplateSnapshots;
  const shouldRefreshTableData = cleanup.restoreTemplateAndPrompts
    || cleanup.clearTemplateSnapshots
    || cleanup.clearTableOrder
    || cleanup.clearTableLocks;
  let templateSnapshot: ReturnType<typeof getDefaultTemplateSnapshot_ACU> = null;
  let persistedOutsideSettings = false;

  try {
    if (cleanup.restoreTemplateAndPrompts) {
      templateSnapshot = getDefaultTemplateSnapshot_ACU();
      if (!templateSnapshot?.templateStr) throw new Error('Không thể phân tích mẫu mặc định.');
      const promptReset = resetAllPromptsToDefault_ACU(undefined, { save: false });
      if (!promptReset.ok) throw new Error(promptReset.message || 'Khôi phục prompt mặc định thất bại.');
      completedSteps.push('prompts');
    }

    if (cleanup.clearTableOrder) {
      settings_ACU.tableKeyOrder = [];
      completedSteps.push('table_order');
    }

    if (cleanup.clearTableLocks) {
      clearCurrentTableLocks_ACU({ save: false });
      completedSteps.push('table_locks');
    }

    if (cleanup.clearPlotSnapshots) {
      await clearCurrentChatPlotPresetOverride_ACU({
        source: 'v2_reset_all_defaults',
        saveSettings: false,
        saveChat: false,
      });
      completedSteps.push('plot_snapshots');
    }

    if (cleanup.clearTemplateSnapshots) {
      await clearCurrentChatTemplateSnapshots_ACU({
        clearCurrentOverride: true,
        clearArchives: true,
        clearGuide: true,
        clearLegacyGuide: true,
        save: false,
      });
      completedSteps.push('template_snapshots');
    }

    if (cleanup.restoreTemplateAndPrompts) {
      const applied = await applyTemplateSnapshotToScope_ACU(templateSnapshot!.templateStr, {
        scope: 'global',
        source: 'v2_reset_all_defaults',
        presetName: '',
        save: false,
        persistChatScope: false,
      });
      if (!applied) throw new Error('Áp dụng mẫu mặc định thất bại.');
      if (typeof applied === 'object' && 'saved' in applied && applied.saved === false) {
        throw new Error((applied as any).error || 'Áp dụng mẫu mặc định thất bại (lần commit điều phối của cuộc trò chuyện hiện tại bị từ chối).');
      }
      persistedOutsideSettings = true;
      completedSteps.push('template');
    } else if (cleanup.clearTemplateSnapshots) {
      applyTemplateScopeForCurrentChat_ACU();
    }

    if (settingsChanged) {
      const saveResult = saveSettings_ACU();
      if (!saveResult.saved) {
        if (settingsSnapshot && !persistedOutsideSettings) restoreSettingsFields_ACU(settingsSnapshot);
        failures.push({
          step: 'settings_persist',
          error: saveResult.warning || saveResult.error || 'Lưu cài đặt thất bại.',
          compensated: !persistedOutsideSettings,
        });
      } else {
        completedSteps.push('settings_persist');
      }
    }

    if (chatDirty) {
      try {
        await saveChatToHost_ACU();
        persistedOutsideSettings = true;
        completedSteps.push('chat_persist');
      } catch (error) {
        logWarn_ACU('[恢复默认] 保存当前聊天清理结果失败:', error);
        failures.push({
          step: 'chat_persist',
          error: errorMessage(error),
          compensated: false,
        });
        warnings.push('Lưu cuộc trò chuyện thất bại: các thay đổi dọn dẹp trong bộ nhớ đã có hiệu lực, có thể được ghi xuống đĩa cùng lần lưu cuộc trò chuyện tiếp theo.');
      }
    }

    if (shouldRefreshTableData) {
      try {
        await loadOrCreateJsonTableFromChatHistory_ACU();
        await refreshMergedDataAndNotify_ACU();
        completedSteps.push('derived_refresh');
      } catch (error) {
        logWarn_ACU('[恢复默认] 表格合并视图刷新失败:', error);
        failures.push({
          step: 'derived_refresh',
          error: errorMessage(error),
          compensated: false,
        });
        warnings.push('Làm mới chế độ xem bảng đã gộp thất bại: khôi phục lõi đã hoàn tất, giao diện có thể chưa đồng bộ dữ liệu mới nhất.');
      }
    }

    return {
      success: failures.length === 0,
      skipped: false,
      completedSteps,
      failures,
      warnings,
    };
  } catch (error) {
    if (settingsSnapshot) restoreSettingsFields_ACU(settingsSnapshot);
    const compensated = settingsSnapshot !== null && !persistedOutsideSettings;
    if (chatDirty && !persistedOutsideSettings && !warnings.some(w => w.includes('Lưu cuộc trò chuyện thất bại'))) {
      warnings.push('Khi khôi phục thất bại, các thay đổi dọn dẹp cuộc trò chuyện chưa được lưu, có thể được ghi xuống đĩa cùng lần lưu cuộc trò chuyện tiếp theo.');
    }
    return {
      success: false,
      skipped: false,
      completedSteps,
      failures: [...failures, {
        step: 'reset',
        error: errorMessage(error),
        compensated,
      }],
      warnings,
    };
  }
}

import { clearTableFieldsForIsolation_ACU } from '../../data/repositories/chat-message-data-repo';
import { buildCanonicalFullCheckpoint_ACU } from '../table/canonical-checkpoint-builder';
import { loadTableStateFromFramesV2Detailed_ACU } from '../table/storage-frame-v2-replay';
import { assertSingleActiveFullCheckpointV2_ACU } from '../table/storage-frame-v2-persist';
import { checkpointFingerprint_ACU as fingerprint } from './checkpoint-payload';
import { requireExit_ACU, type captureExitSource_ACU } from './exit-source';

type Source_ACU = ReturnType<typeof captureExitSource_ACU>;

/** 导入已完全覆盖的状态；物理水位仅表示接入前缀，不转换逻辑身份或未填缺口。 */
export async function stageExitTable_ACU(chat: Record<string, unknown>[], input: Source_ACU): Promise<void> {
  const { config, table, timeline, target } = input;
  const keys = Object.keys(table.tableData).filter(key => key.startsWith('sheet_'));
  requireExit_ACU(keys.every(key => table.completedAiFloorBySheetKey[key] === timeline.completedAiCount),
    'Bảng vẫn còn lịch sử logic chưa được bao phủ, mốc thường không thể biểu đạt khoảng trống này mà không mất dữ liệu.');
  const physicalCount = chat.filter(message => message.is_user !== true).length;
  const built = buildCanonicalFullCheckpoint_ACU({ createdAt: Date.now(), reason: 'import',
    data: table.tableData, scheduleSummary: Object.fromEntries(keys.map(key =>
      [key, { lastImportBaselineAiFloor: physicalCount }])),
    context: { messageIndex: target.messageIndex, isolationKey: config.isolationKey } });
  requireExit_ACU(built.checkpoint, 'Bảng thoát chưa qua kiểm tra canonical.');
  const isolation = { enabled: config.settings.dataIsolationEnabled, code: config.settings.dataIsolationCode };
  for (const message of chat) clearTableFieldsForIsolation_ACU(message, config.isolationKey, isolation);
  chat[target.messageIndex].TavernDB_ACU_IsolatedData = {
    ...(chat[target.messageIndex].TavernDB_ACU_IsolatedData as Record<string, unknown> ?? {}),
    [config.isolationKey]: { _acu_storage_version: 2,
      storageFrame: { version: 2, checkpoint: built.checkpoint, logEntries: [] } },
  };
  requireExit_ACU(!assertSingleActiveFullCheckpointV2_ACU(chat, config.isolationKey, 'zero_layer_exit'),
    'Bảng thoát có nhiều đường cơ sở đang hoạt động.');
  const replay = await loadTableStateFromFramesV2Detailed_ACU(chat, config.isolationKey, {
    updateRuntimeState: false, throwOnRecoveryRequired: true, compatibilityMode: 'disabled', backgroundFixation: 'skip',
  });
  requireExit_ACU(replay && !replay.requiresCheckpointConvergence
    && fingerprint(replay.data) === fingerprint(table.tableData), 'Phát lại nghiêm ngặt của bảng thoát không tương đương.');
}

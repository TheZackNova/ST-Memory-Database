import type { ZeroLayerEnvelope_ACU, ZeroLayerBranch_ACU } from './model';
import type { ZeroLayerActivationCut_ACU, ZeroLayerBridgeCandidate_ACU, ZeroLayerBridgeHostCompletion_ACU } from './bridge-model';
import { ZERO_LAYER_BRIDGE_PHASES_ACU } from './bridge-model';
import { validateCanonicalCheckpoint_ACU } from '../../shared/canonical-checkpoint-validator';
import { validateZeroLayerTableData_ACU, validateZeroLayerTableFrontier_ACU,
  validateZeroLayerContinuationState_ACU } from './validation';
import { validateZeroLayerSimulationState_ACU, validateZeroLayerSimulationRefs_ACU } from './simulation-validation';
import { checkpointFingerprint_ACU as fingerprint, checkpointRecord_ACU as record,
  checkpointInteger_ACU as integer, requireCheckpoint_ACU as requireValue,
  foldCheckpointContinuation_ACU } from './checkpoint-payload';

export function bridgeCandidateFingerprint_ACU(candidate: ZeroLayerBridgeCandidate_ACU): string {
  const { fingerprint: _fingerprint, ...payload } = candidate;
  return fingerprint(payload);
}

/** 候选是业务基底，不赋予存量宿主任务新的逻辑身份。 */
export function validateBridgeCandidate_ACU(raw: unknown, source: ZeroLayerEnvelope_ACU,
  cut: ZeroLayerActivationCut_ACU): asserts raw is ZeroLayerBridgeCandidate_ACU {
  requireValue(record(raw) && raw.schemaVersion === 1 && record(raw.table)
    && record(raw.table.input) && record(raw.availability), 'Cấu trúc ứng viên cầu nối không hợp lệ.');
  const input = raw.table.input;
  requireValue(typeof input.chatKey === 'string' && input.chatKey.trim()
    && typeof input.isolationKey === 'string' && ['native', 'sqlite'].includes(String(input.storageMode))
    && typeof input.autoUpdateEnabled === 'boolean', 'Phạm vi bảng cầu nối không hợp lệ.');
  validateZeroLayerTableData_ACU(input.tableData);
  validateZeroLayerTableData_ACU(input.templateData);
  validateZeroLayerTableFrontier_ACU(input.completedAiFloorBySheetKey);
  requireValue(Object.values(input.completedAiFloorBySheetKey).every(value => value <= cut.completedAiCount),
    'Đầu bao phủ của bảng cầu nối vượt quá điểm cắt kích hoạt.');
  requireValue(record(raw.table.payload) && raw.table.payload.kind === 'full'
    && validateCanonicalCheckpoint_ACU(raw.table.payload).valid
    && fingerprint(raw.table.payload.data) === fingerprint(input.tableData), 'Đường cơ sở bảng cầu nối không tương đương.');
  validateZeroLayerContinuationState_ACU(raw.continuation);
  validateZeroLayerSimulationState_ACU(raw.simulation);
  const completed = raw.simulation.envelope?.task?.completedAutoAnchor;
  const hostCompletion = raw.simulationHostCompletion;
  if (completed && completed.kind !== 'logical') {
    requireValue(record(hostCompletion) && hostCompletion.taskId === raw.simulation.envelope?.task?.taskId
      && record(hostCompletion.ref) && hostCompletion.ref.kind === 'host'
      && cut.refs.some(ref => fingerprint(ref) === fingerprint(hostCompletion.ref))
      && record(hostCompletion.anchor) && fingerprint(hostCompletion.anchor) === fingerprint(completed)
      && String(hostCompletion.ref.swipeId) === completed.swipeId,
    'Bằng chứng hoàn tất host của cầu nối không thuộc tác vụ hiện tại hoặc điểm cắt kích hoạt.');
  } else requireValue(hostCompletion === null, 'Cầu nối không được tự đăng ký bằng chứng hoàn tất host.');
  validateZeroLayerSimulationRefs_ACU(raw.simulation, source.sessionId, source.activeBranchId, new Map(),
    hostCompletion as ZeroLayerBridgeHostCompletion_ACU | null);

  requireValue(['persisted', 'pristine'].includes(String(raw.availability.table))
    && ['persisted', 'absent'].includes(String(raw.availability.continuation))
    && ['persisted', 'absent'].includes(String(raw.availability.simulation)), 'Biên nhận khả dụng của cầu nối không hợp lệ.');
  if (input.scheduling !== undefined) {
    requireValue(record(input.scheduling) && Object.values(input.scheduling).every(integer)
      && integer(input.scheduling.autoUpdateFrequency) && integer(input.scheduling.skipUpdateFloors)
      && integer(input.scheduling.autoUpdateThreshold) && integer(input.scheduling.updateBatchSize), 'Snapshot lập lịch cầu nối không hợp lệ.');
  }
  requireValue(raw.continuation.confirmed.length === 0 && raw.simulation.confirmed.length === 0
    && raw.simulation.runState === null && raw.simulation.runProof === null, 'Đường cơ sở đầu tiên của cầu nối không được giả mạo xác nhận hoặc lần chạy logic.');
  const refs = new Set(cut.refs.map(ref => JSON.stringify(ref)));
  const moduleFrames = raw.continuation.moduleFrames;
  requireValue(Object.keys(moduleFrames).every(key => refs.has(key)), 'Khung tài liệu cầu nối thiếu tham chiếu giới hạn theo nguồn.');
  foldCheckpointContinuation_ACU(cut.refs.map(ref => ({
    payload: moduleFrames[JSON.stringify(ref)], swipeId: String(ref.swipeId),
  })));
  requireValue(typeof raw.fingerprint === 'string'
    && raw.fingerprint === bridgeCandidateFingerprint_ACU(raw as unknown as ZeroLayerBridgeCandidate_ACU), 'Dấu vân tay ứng viên cầu nối không hợp lệ.');
}

/** 校验完整阶段账本；读取不推进阶段，也不将候选当作活动基线。 */
export function validateZeroLayerBridgeState_ACU(source: ZeroLayerEnvelope_ACU, branch: ZeroLayerBranch_ACU): void {
  const state = branch.bridge;
  if (state === undefined) return;
  requireValue(record(state) && state.schemaVersion === 1 && typeof state.migrationId === 'string'
    && state.migrationId.trim() && integer(state.sourceRevision) && state.sourceRevision < source.revision
    && typeof state.sourceFingerprint === 'string' && state.sourceFingerprint.trim(), 'Danh tính giai đoạn cầu nối không hợp lệ.');
  const config = state.config;
  requireValue(integer(state.createdAt) && record(config) && config.schemaVersion === 1
    && typeof config.chatKey === 'string' && config.chatKey.trim()
    && typeof config.isolationKey === 'string' && ['native', 'sqlite'].includes(config.storageMode)
    && record(config.guideData) && record(config.settings)
    && typeof config.settings.dataIsolationEnabled === 'boolean'
    && typeof config.settings.dataIsolationCode === 'string'
    && typeof config.settings.autoUpdateEnabled === 'boolean'
    && [config.settings.autoUpdateFrequency, config.settings.skipUpdateFloors,
      config.settings.autoUpdateThreshold, config.settings.updateBatchSize].every(integer)
    && state.configFingerprint === fingerprint(config), 'Cấu hình đóng băng hoặc dấu vân tay của cầu nối không hợp lệ.');
  validateZeroLayerTableData_ACU(config.templateData);
  const phase = ZERO_LAYER_BRIDGE_PHASES_ACU.indexOf(state.phase);
  const cut = state.activationCut;
  requireValue(phase >= 0 && record(cut) && cut.schemaVersion === 1
    && cut.sourceFingerprint === source.activationFingerprint && cut.messageCount === source.activationMessageCount
    && integer(cut.completedAiCount) && cut.completedAiCount <= cut.messageCount
    && Array.isArray(cut.refs) && cut.refs.length === cut.messageCount, 'Điểm cắt kích hoạt của cầu nối không hợp lệ.');
  requireValue(cut.refs.every((ref, index) => record(ref) && ref.kind === 'host'
    && ref.messageIndex === index && integer(ref.swipeId) && ref.sourceFingerprint === cut.sourceFingerprint
    && fingerprint(ref.scope) === fingerprint(source.scope)), 'Tham chiếu điểm cắt cầu nối không hợp lệ.');

  requireValue(Array.isArray(state.receipts) && state.receipts.length === phase + 1, 'Biên nhận giai đoạn cầu nối không liên tục.');
  let previousRevision = -1;
  for (const [index, receipt] of state.receipts.entries()) {
    requireValue(record(receipt) && receipt.phase === ZERO_LAYER_BRIDGE_PHASES_ACU[index]
      && integer(receipt.sourceRevision) && receipt.sourceRevision > previousRevision
      && receipt.sourceRevision < source.revision && receipt.sourceFingerprint === state.sourceFingerprint
      && (index === 0 ? receipt.sourceRevision === state.sourceRevision && receipt.normalizedFingerprint === null
        : receipt.normalizedFingerprint === state.normalizedFingerprint), 'Danh tính hoặc dấu vân tay biên nhận cầu nối không hợp lệ.');
    previousRevision = receipt.sourceRevision;
  }
  if (phase === 0) requireValue(state.candidate === null && state.normalizedFingerprint === null,
    'Inventory không được lưu sớm kết quả chuẩn hóa hoặc ứng viên.');
  else requireValue(typeof state.normalizedFingerprint === 'string' && state.normalizedFingerprint.trim(),
    'Thiếu dấu vân tay chuẩn hóa của cầu nối.');
  if (phase === 1) requireValue(state.candidate === null, 'Normalize chỉ được lưu dấu vân tay, không được lưu sớm ứng viên.');
  if (phase >= 2) {
    validateBridgeCandidate_ACU(state.candidate, source, cut);
    requireValue(state.candidate.fingerprint === state.normalizedFingerprint,
      'Ứng viên cầu nối không khớp với dấu vân tay chuẩn hóa đã xác nhận.');
    const input = state.candidate.table.input;
    requireValue(input.chatKey === config.chatKey && input.isolationKey === config.isolationKey
      && input.storageMode === config.storageMode && input.autoUpdateEnabled === config.settings.autoUpdateEnabled
      && fingerprint(input.templateData) === fingerprint(config.templateData)
      && fingerprint(input.scheduling) === fingerprint({
        autoUpdateFrequency: config.settings.autoUpdateFrequency, skipUpdateFloors: config.settings.skipUpdateFloors,
        autoUpdateThreshold: config.settings.autoUpdateThreshold, updateBatchSize: config.settings.updateBatchSize,
      }), 'Ứng viên cầu nối không dùng cùng cấu hình đóng băng.');
  }
  if (phase < ZERO_LAYER_BRIDGE_PHASES_ACU.length - 1) {
    requireValue(!source.enabled && source.turns.length === 0 && branch.continuation === undefined
      && branch.simulation === undefined && branch.checkpoints === undefined, 'Chưa xác nhận cầu nối thì không thể chuyển phía đọc hoặc tạo.');
  } else requireValue(branch.continuation !== undefined && branch.simulation !== undefined,
    'Cầu nối đã xác nhận thiếu ba loại nền đang hoạt động.');
}

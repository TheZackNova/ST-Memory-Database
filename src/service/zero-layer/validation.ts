import {
  ZERO_LAYER_SCHEMA_VERSION_ACU, ZeroLayerError_ACU,
  type ZeroLayerEnvelope_ACU, type ZeroLayerTurn_ACU, type ZeroLayerTurnPhase_ACU,
  type ZeroLayerTableResult_ACU, type ZeroLayerTableCandidate_ACU, type ZeroLayerPlotCandidate_ACU,
} from './model';
import type { TableDataObject_ACU } from '../../shared/models/table-data';
import { getTableDataFingerprint_ACU } from '../table/table-data-upgrade-audit';
import { validateContinuationEnvelope_ACU } from '../continuation/continuation-store';
import { validateAgentConversationFloorRecord_ACU } from '../continuation/agent/agent-conversation-store';
import type { ZeroLayerContinuationState_ACU } from './model';
import { validateZeroLayerSimulationState_ACU, validateZeroLayerSimulationRefs_ACU } from './simulation-validation';
import { validateZeroLayerCheckpointState_ACU } from './checkpoint-validation';
import { validateZeroLayerBridgeState_ACU } from './bridge-validation';
import { capturePublishedMaterials_ACU, validatePublishedMaterials_ACU } from './branch-materials';
import { checkpointPath_ACU, checkpointTurnRef_ACU } from './checkpoint-payload';
import { validateBranchPath_ACU } from './branch-path';
import { validateZeroLayerWorkingFrame_ACU, validateZeroLayerWorkingFrameScope_ACU } from './continuation-working-frame';
import { validateZeroLayerExitManifest_ACU } from './exit-validation';


const PHASES_ACU: readonly ZeroLayerTurnPhase_ACU[] = [
  'prepared', 'dispatching', 'response-durable', 'effects-durable',
  'published', 'cancelled', 'failed', 'delivery-unknown',
];
const EFFECTS_ACU = ['plot', 'table', 'continuation', 'simulation'] as const;

export function requireZeroLayerValue_ACU(condition: unknown, message: string): asserts condition {
  if (!condition) throw new ZeroLayerError_ACU('corrupt-data', message);
}

function record_ACU(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function id_ACU(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
function integer_ACU(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

/** 只校验可序列化业务表，不接受运行时 descriptor 或未知空值。 */
export function validateZeroLayerTableData_ACU(raw: unknown): asserts raw is TableDataObject_ACU {
  requireZeroLayerValue_ACU(record_ACU(raw) && record_ACU(raw.mate), 'Snapshot bảng thiếu mate.');
  for (const [key, sheet] of Object.entries(raw)) {
    if (key === 'mate') continue;
    requireZeroLayerValue_ACU(key.startsWith('sheet_') && record_ACU(sheet)
      && id_ACU(sheet.uid) && id_ACU(sheet.name) && record_ACU(sheet.sourceData)
      && record_ACU(sheet.updateConfig) && record_ACU(sheet.exportConfig)
      && typeof sheet.orderNo === 'number' && Number.isFinite(sheet.orderNo)
      && Array.isArray(sheet.content) && sheet.content.length > 0
      && sheet.content.every(row => Array.isArray(row)
        && row.every(cell => cell === null || typeof cell === 'string')), 'Cấu trúc snapshot bảng không hợp lệ.');
  }
}

export function validateZeroLayerTableFrontier_ACU(raw: unknown): asserts raw is Record<string, number> {
  requireZeroLayerValue_ACU(record_ACU(raw) && Object.entries(raw).every(([key, value]) =>
    key.startsWith('sheet_') && integer_ACU(value)), 'Đầu bao phủ của bảng logic không hợp lệ.');
}

export function validateZeroLayerTableResult_ACU(raw: unknown, floorId: string): asserts raw is ZeroLayerTableResult_ACU {
  requireZeroLayerValue_ACU(record_ACU(raw) && raw.floorId === floorId, 'Danh tính tầng logic của kết quả bảng không hợp lệ.');
  validateZeroLayerTableData_ACU(raw.tableData);
  validateZeroLayerTableFrontier_ACU(raw.completedAiFloorBySheetKey);
  requireZeroLayerValue_ACU(Array.isArray(raw.filledSheetKeys)
    && raw.filledSheetKeys.every(key => typeof key === 'string' && key.startsWith('sheet_'))
    && new Set(raw.filledSheetKeys).size === raw.filledSheetKeys.length, 'Danh sách bảng đã hoàn tất không hợp lệ.');
}

export function validateZeroLayerTableCandidate_ACU(raw: unknown, floorId: string): asserts raw is ZeroLayerTableCandidate_ACU {
  validateZeroLayerTableResult_ACU(raw, floorId);
  const ids = (raw as Partial<ZeroLayerTableCandidate_ACU>).completedBucketIds;
  requireZeroLayerValue_ACU(Array.isArray(ids) && ids.every(id_ACU)
    && new Set(ids).size === ids.length, 'Danh tính nhóm ứng viên bảng không hợp lệ.');
}

export function validateZeroLayerPlotCandidate_ACU(raw: unknown, floorId: string): asserts raw is ZeroLayerPlotCandidate_ACU {
  requireZeroLayerValue_ACU(record_ACU(raw) && raw.floorId === floorId
    && typeof raw.presetName === 'string' && ['generated', 'no-tasks', 'disabled'].includes(String(raw.outcome))
    && (raw.finalMessage === null || typeof raw.finalMessage === 'string')
    && typeof raw.content === 'string' && typeof raw.agentActive === 'boolean'
    && record_ACU(raw.taskContents) && Object.values(raw.taskContents).every(value => typeof value === 'string'),
  'Cấu trúc ứng viên cốt truyện hoặc danh tính tầng logic không hợp lệ.');
  requireZeroLayerValue_ACU(Array.isArray(raw.finalPrompts) && raw.finalPrompts.every(prompt => record_ACU(prompt)
    && ['system', 'user', 'assistant'].includes(String(prompt.role)) && typeof prompt.content === 'string'
    && integer_ACU(prompt.depth)
    && ['before_character_definition', 'after_character_definition', 'at_depth'].includes(String(prompt.position))),
  'Tin nhắn sổ thế giới của nội dung cốt truyện không hợp lệ.');
  requireZeroLayerValue_ACU(Array.isArray(raw.filterEntries) && raw.filterEntries.every(entry => record_ACU(entry)
    && typeof entry.content === 'string' && typeof entry.comment === 'string'), 'Danh mục lọc cốt truyện không hợp lệ.');
  if (raw.outcome === 'generated') {
    requireZeroLayerValue_ACU(typeof raw.finalMessage === 'string' && raw.finalMessage.trim()
      && raw.content.trim(), 'Ứng viên cốt truyện đã tạo thiếu nội dung hợp lệ.');
  } else {
    requireZeroLayerValue_ACU(raw.finalMessage === null && raw.content === ''
      && Object.keys(raw.taskContents).length === 0, 'Tác vụ cốt truyện chưa thực hiện không được mang kết quả tạo.');
  }
  if (raw.outcome === 'disabled') {
    requireZeroLayerValue_ACU(!raw.agentActive && raw.finalPrompts.length === 0
      && raw.filterEntries.length === 0, 'Cốt truyện đã tắt không được mang nội dung chèn của Agent.');
  }
}

/** 确认标记必须与同一载体内的真实正文结算一致，不能只凭逻辑序号认领。 */
export function validateZeroLayerContinuationReceipt_ACU(turn: ZeroLayerTurn_ACU, sessionId: string): void {
  const identity = turn.continuationIdentity;
  requireZeroLayerValue_ACU(identity, 'Xác nhận viết tiếp thiếu danh tính lần thử đầy đủ.');
  const data = { floorId: turn.assistantFloor.floorId, identity };
  const receipt = turn.effectReceipts.find(item => item.kind === 'continuation');
  const stored = turn.assistantFloor.data.continuation;
  requireZeroLayerValue_ACU(receipt && receipt.status === 'durable'
    && receipt.effectId === JSON.stringify([sessionId, turn.turnId, turn.attemptId, 'continuation'])
    && receipt.fingerprint === getTableDataFingerprint_ACU(data), 'Xác nhận viết tiếp thiếu biên nhận lưu bền khớp.');
  requireZeroLayerValue_ACU(record_ACU(stored) && stored.floorId === data.floorId
    && record_ACU(stored.identity) && Object.keys(stored).length === 2
    && Object.keys(stored.identity).length === 7, 'Dữ liệu đính kèm của xác nhận viết tiếp không hợp lệ.');
  const storedIdentity = stored.identity;
  requireZeroLayerValue_ACU((['chatIdentity', 'taskId', 'stageId', 'revision', 'nodeId', 'turnId', 'attemptId'] as const)
    .every(key => storedIdentity[key] === identity[key]), 'Dữ liệu đính kèm của xác nhận viết tiếp không khớp danh tính lần thử đầy đủ.');
}

function validateTurn_ACU(raw: unknown): asserts raw is ZeroLayerTurn_ACU {
  requireZeroLayerValue_ACU(record_ACU(raw), 'Lượt phải là một đối tượng.');
  for (const key of ['turnId', 'branchId', 'attemptId']) {
    requireZeroLayerValue_ACU(id_ACU(raw[key]), `Lượt ${key} không hợp lệ.`);
  }
  requireZeroLayerValue_ACU(raw.parentTurnId === null || id_ACU(raw.parentTurnId), 'Danh tính cha của lượt không hợp lệ.');
  requireZeroLayerValue_ACU(typeof raw.input === 'string' && raw.input.trim(), 'Đầu vào của lượt không hợp lệ.');
  requireZeroLayerValue_ACU(raw.body === null || typeof raw.body === 'string', 'Nội dung chính của lượt không hợp lệ.');
  requireZeroLayerValue_ACU(PHASES_ACU.includes(raw.phase as ZeroLayerTurnPhase_ACU), 'Giai đoạn của lượt không hợp lệ.');
  requireZeroLayerValue_ACU(integer_ACU(raw.createdAt) && integer_ACU(raw.updatedAt)
    && raw.updatedAt >= raw.createdAt, 'Thời gian của lượt không hợp lệ.');
  requireZeroLayerValue_ACU(raw.errorCode === null || id_ACU(raw.errorCode), 'Mã lỗi của lượt không hợp lệ.');
  if (raw.continuationIdentity !== undefined) {
    const identity = raw.continuationIdentity;
    requireZeroLayerValue_ACU(record_ACU(identity) && Object.keys(identity).length === 7
      && ['chatIdentity', 'taskId', 'stageId', 'nodeId', 'turnId', 'attemptId'].every(key => id_ACU(identity[key]))
      && integer_ACU(identity.revision) && identity.revision > 0, 'Danh tính lần thử viết tiếp đầy đủ không hợp lệ.');
  }
  if (raw.tableInput !== undefined) {
    requireZeroLayerValue_ACU(record_ACU(raw.tableInput) && id_ACU(raw.tableInput.chatKey)
      && typeof raw.tableInput.isolationKey === 'string'
      && ['native', 'sqlite'].includes(String(raw.tableInput.storageMode)), 'Danh tính đầu vào bảng của lượt không hợp lệ.');
    validateZeroLayerTableData_ACU(raw.tableInput.tableData);
    validateZeroLayerTableData_ACU(raw.tableInput.templateData);
    validateZeroLayerTableFrontier_ACU(raw.tableInput.completedAiFloorBySheetKey);
    requireZeroLayerValue_ACU(typeof raw.tableInput.autoUpdateEnabled === 'boolean', 'Công tắc tự động điền bảng của lượt không hợp lệ.');
    if (raw.tableInput.scheduling !== undefined) {
      const scheduling = raw.tableInput.scheduling;
      requireZeroLayerValue_ACU(record_ACU(scheduling)
        && integer_ACU(scheduling.autoUpdateFrequency)
        && integer_ACU(scheduling.skipUpdateFloors)
        && integer_ACU(scheduling.autoUpdateThreshold)
        && integer_ACU(scheduling.updateBatchSize)
        && scheduling.updateBatchSize > 0, 'Snapshot lập lịch bảng lưu bền không hợp lệ.');
    }
  }
  for (const [key, role] of [['userFloor', 'user'], ['assistantFloor', 'assistant']] as const) {
    const floor = raw[key];
    requireZeroLayerValue_ACU(record_ACU(floor) && id_ACU(floor.floorId)
      && floor.role === role && record_ACU(floor.data), 'Tầng logic không hợp lệ.');
  }
  requireZeroLayerValue_ACU(Array.isArray(raw.requiredEffects)
    && raw.requiredEffects.every(kind => EFFECTS_ACU.includes(kind))
    && new Set(raw.requiredEffects).size === raw.requiredEffects.length, 'Danh sách quyết toán bắt buộc không hợp lệ.');
  requireZeroLayerValue_ACU(Array.isArray(raw.effectReceipts), 'Biên nhận quyết toán phải là mảng.');

  const receiptKinds = new Set<string>();
  const receiptIds = new Set<string>();
  for (const receipt of raw.effectReceipts) {
    requireZeroLayerValue_ACU(record_ACU(receipt) && id_ACU(receipt.effectId)
      && EFFECTS_ACU.includes(receipt.kind as typeof EFFECTS_ACU[number])
      && (receipt.status === 'durable' || receipt.status === 'skipped-by-config')
      && id_ACU(receipt.fingerprint), 'Biên nhận quyết toán không hợp lệ.');
    requireZeroLayerValue_ACU(!receiptKinds.has(String(receipt.kind)) && !receiptIds.has(receipt.effectId), 'Biên nhận quyết toán bị trùng.');
    receiptKinds.add(String(receipt.kind));
    receiptIds.add(receipt.effectId);
  }
  if (raw.tableCandidate !== undefined) {
    validateZeroLayerTableCandidate_ACU(raw.tableCandidate,
      (raw.assistantFloor as ZeroLayerTurn_ACU['assistantFloor']).floorId);
  }
  if (raw.materialBaseline !== undefined) {
    requireZeroLayerValue_ACU(record_ACU(raw.materialBaseline), 'Cấu trúc nền tài liệu của lượt không hợp lệ.');
    const baseline = raw.materialBaseline;
    if (baseline.continuation !== null) validateZeroLayerContinuationState_ACU(baseline.continuation);
    if (baseline.simulation !== null) validateZeroLayerSimulationState_ACU(baseline.simulation);
  }
  if (raw.plotCandidate !== undefined) {
    validateZeroLayerPlotCandidate_ACU(raw.plotCandidate, (raw.userFloor as ZeroLayerTurn_ACU['userFloor']).floorId);
    requireZeroLayerValue_ACU(raw.effectReceipts.some(receipt => receipt.kind === 'plot'
      && receipt.status === 'durable' && receipt.effectId === `${raw.turnId}:${raw.attemptId}:plot`
      && receipt.fingerprint === getTableDataFingerprint_ACU(raw.plotCandidate)),
    'Ứng viên cốt truyện đã lưu thiếu biên nhận lưu bền của lượt này.');
  }
  const tableResult = (raw.assistantFloor as ZeroLayerTurn_ACU['assistantFloor']).data.table;
  if (tableResult !== undefined) {
    validateZeroLayerTableResult_ACU(tableResult, (raw.assistantFloor as ZeroLayerTurn_ACU['assistantFloor']).floorId);
  }
  if (['response-durable', 'effects-durable', 'published'].includes(String(raw.phase))) {
    requireZeroLayerValue_ACU(typeof raw.body === 'string' && raw.body.trim(), 'Giai đoạn phản hồi đã lưu thiếu nội dung chính đầy đủ.');
  }
  if (raw.phase === 'effects-durable' || raw.phase === 'published') {
    const receipts = raw.effectReceipts;
    requireZeroLayerValue_ACU(raw.requiredEffects.every(kind => receipts.some(
      (receipt: ZeroLayerTurn_ACU['effectReceipts'][number]) => receipt.kind === kind && (receipt.status === 'durable'
        || kind === 'simulation' && receipt.status === 'skipped-by-config'),
    )), 'Quyết toán bắt buộc thiếu biên nhận lưu bền.');
  }
}

/** 独立命名空间中的续写状态；读取不迁移、不以空状态掩盖损坏。 */
export function validateZeroLayerContinuationState_ACU(raw: unknown): asserts raw is ZeroLayerContinuationState_ACU {
  requireZeroLayerValue_ACU(record_ACU(raw) && raw.schemaVersion === 1
    && record_ACU(raw.moduleFrames) && Array.isArray(raw.confirmed), 'Trạng thái viết tiếp Tầng 0 không hợp lệ.');
  if (raw.workingFrame !== undefined) validateZeroLayerWorkingFrame_ACU(raw.workingFrame);
  if (raw.envelope !== null) validateContinuationEnvelope_ACU(raw.envelope);
  requireZeroLayerValue_ACU(validateAgentConversationFloorRecord_ACU(raw.conversation), 'Bản ghi hội thoại viết tiếp Tầng 0 bị hỏng.');
  const turns = new Set<string>();
  const attempts = new Set<string>();
  for (const item of raw.confirmed) {
    requireZeroLayerValue_ACU(record_ACU(item) && id_ACU(item.turnId) && id_ACU(item.attemptId)
      && id_ACU(item.floorId) && id_ACU(item.continuationAttemptId), 'Tham chiếu xác nhận viết tiếp Tầng 0 không hợp lệ.');
    requireZeroLayerValue_ACU(!turns.has(item.turnId) && !attempts.has(item.continuationAttemptId), 'Xác nhận viết tiếp Tầng 0 bị trùng.');
    turns.add(item.turnId);
    attempts.add(item.continuationAttemptId);
  }
}

/** 读取只校验，不修复、补默认值或写回。 */
export function validateZeroLayerEnvelope_ACU(raw: unknown): ZeroLayerEnvelope_ACU {
  requireZeroLayerValue_ACU(record_ACU(raw), 'Bản lưu Tầng 0 phải là một đối tượng.');
  if (raw.schemaVersion !== ZERO_LAYER_SCHEMA_VERSION_ACU) {
    throw new ZeroLayerError_ACU('unsupported-version', 'Phiên bản bản lưu Tầng 0 không được hỗ trợ.');
  }
  for (const key of ['sessionId', 'carrierId', 'activationFingerprint', 'activeBranchId']) {
    requireZeroLayerValue_ACU(id_ACU(raw[key]), `Bản lưu Tầng 0 ${key} không hợp lệ.`);
  }
  requireZeroLayerValue_ACU(record_ACU(raw.scope) && id_ACU(raw.scope.chatId)
    && id_ACU(raw.scope.characterKey), 'Phạm vi cuộc trò chuyện Tầng 0 không hợp lệ.');
  requireZeroLayerValue_ACU(integer_ACU(raw.revision) && integer_ACU(raw.carrierSwipeId)
    && integer_ACU(raw.activationMessageCount) && raw.activationMessageCount > 0, 'Số thứ tự bản lưu Tầng 0 không hợp lệ.');
  requireZeroLayerValue_ACU(typeof raw.seedBody === 'string' && typeof raw.enabled === 'boolean'
    && typeof raw.apiPresetName === 'string', 'Cấu hình hoặc lời mở đầu Tầng 0 không hợp lệ.');
  requireZeroLayerValue_ACU(Array.isArray(raw.branches) && raw.branches.length > 0
    && Array.isArray(raw.turns), 'Danh sách nhánh hoặc lượt Tầng 0 không hợp lệ.');
  const branchIds = new Set<string>();
  for (const branch of raw.branches) {
    requireZeroLayerValue_ACU(record_ACU(branch) && id_ACU(branch.branchId)
      && (branch.headTurnId === null || id_ACU(branch.headTurnId)), 'Danh tính nhánh không hợp lệ.');
    requireZeroLayerValue_ACU(!branchIds.has(branch.branchId), 'Danh tính nhánh bị trùng.');
    if (branch.continuation !== undefined) validateZeroLayerContinuationState_ACU(branch.continuation);
    if (branch.simulation !== undefined) validateZeroLayerSimulationState_ACU(branch.simulation);
    branchIds.add(branch.branchId);
  }
  requireZeroLayerValue_ACU(branchIds.has(String(raw.activeBranchId)), 'Nhánh đang hoạt động không tồn tại.');

  const turns = new Map<string, ZeroLayerTurn_ACU>();
  const floorIds = new Set<string>();
  const attemptIds = new Set<string>();
  const pendingBranches = new Set<string>();
  for (const value of raw.turns) {
    validateTurn_ACU(value);
    requireZeroLayerValue_ACU(branchIds.has(value.branchId), 'Nhánh của lượt không tồn tại.');
    requireZeroLayerValue_ACU(!turns.has(value.turnId) && !attemptIds.has(value.attemptId), 'Danh tính lượt hoặc lần thử bị trùng.');
    if (value.parentTurnId !== null) {
      requireZeroLayerValue_ACU(turns.get(value.parentTurnId)?.phase === 'published', 'Lượt cha phải là lượt đã phát hành trước đó.');
    }
    for (const floor of [value.userFloor, value.assistantFloor]) {
      requireZeroLayerValue_ACU(!floorIds.has(floor.floorId), 'Danh tính tầng logic bị trùng.');
      floorIds.add(floor.floorId);
    }
    if (!['published', 'cancelled', 'failed'].includes(value.phase)) {
      requireZeroLayerValue_ACU(!pendingBranches.has(value.branchId), 'Cùng một nhánh có nhiều lượt chưa quyết toán.');
      pendingBranches.add(value.branchId);
    }
    turns.set(value.turnId, value);
    attemptIds.add(value.attemptId);
  }
  for (const branch of raw.branches) {
    if (branch.headTurnId !== null) {
      requireZeroLayerValue_ACU(turns.get(branch.headTurnId)?.phase === 'published', 'Head của nhánh không trỏ tới lượt đã phát hành.');
    }
    validateBranchPath_ACU(raw as unknown as ZeroLayerEnvelope_ACU, branch);
    validateZeroLayerWorkingFrameScope_ACU(raw as unknown as ZeroLayerEnvelope_ACU, branch);
    const path = checkpointPath_ACU(raw as unknown as ZeroLayerEnvelope_ACU, branch.branchId);
    const reachable = new Set(path.map(turn => turn.turnId));
    if (branch.continuation) {
      for (const ref of branch.continuation.confirmed) {
        const turn = turns.get(ref.turnId);
        requireZeroLayerValue_ACU(turn && turn.attemptId === ref.attemptId
          && (reachable.has(turn.turnId) || turn.branchId === branch.branchId
            && turn.parentTurnId === branch.headTurnId && turn.phase !== 'published')
          && turn.assistantFloor.floorId === ref.floorId
          && turn.continuationIdentity?.attemptId === ref.continuationAttemptId
          && ['response-durable', 'effects-durable', 'published'].includes(turn.phase),
        'Xác nhận viết tiếp phải tham chiếu lượt logic thật đã lưu nội dung chính.');
        validateZeroLayerContinuationReceipt_ACU(turn, String(raw.sessionId));
      }
    }
    if (branch.simulation) validateZeroLayerSimulationRefs_ACU(branch.simulation, String(raw.sessionId), branch.branchId, turns,
      branch.bridge?.phase === 'reconciled' ? branch.bridge.candidate?.simulationHostCompletion : undefined, reachable, branch.headTurnId);
    validateZeroLayerCheckpointState_ACU(raw as unknown as ZeroLayerEnvelope_ACU, branch);
    validateZeroLayerBridgeState_ACU(raw as unknown as ZeroLayerEnvelope_ACU, branch);
  }
  for (const turn of turns.values()) {
    if (turn.publishedMaterials !== undefined) {
      validatePublishedMaterials_ACU(turn.publishedMaterials, raw as unknown as ZeroLayerEnvelope_ACU, turn);
    }
  }
  validateZeroLayerExitManifest_ACU(raw as unknown as ZeroLayerEnvelope_ACU);
  return structuredClone(raw) as unknown as ZeroLayerEnvelope_ACU;
}

const TRANSITIONS_ACU: Readonly<Record<ZeroLayerTurnPhase_ACU, readonly ZeroLayerTurnPhase_ACU[]>> = {
  prepared: ['dispatching', 'cancelled', 'failed'],
  dispatching: ['response-durable', 'cancelled', 'failed', 'delivery-unknown'],
  'response-durable': ['effects-durable'],
  'effects-durable': ['published'],
  published: [], cancelled: [], failed: [],
  'delivery-unknown': ['response-durable', 'cancelled'],
};

/** 纯状态迁移；完整响应落盘后只补结算，不重新发送模型请求。 */
export function transitionZeroLayerTurn_ACU(
  envelope: ZeroLayerEnvelope_ACU,
  turnId: string,
  phase: ZeroLayerTurnPhase_ACU,
  changes: Pick<Partial<ZeroLayerTurn_ACU>, 'body' | 'effectReceipts' | 'errorCode'> = {},
): ZeroLayerEnvelope_ACU {
  const candidate = validateZeroLayerEnvelope_ACU(envelope);
  const turn = candidate.turns.find(item => item.turnId === turnId);
  if (!turn || !TRANSITIONS_ACU[turn.phase].includes(phase)) {
    throw new ZeroLayerError_ACU('invalid-transition', 'Chuyển trạng thái lượt Tầng 0 không hợp lệ.');
  }
  Object.assign(turn, structuredClone(changes), { phase, updatedAt: Math.max(Date.now(), turn.updatedAt) });
  if (phase === 'published') {
    const branch = candidate.branches.find(item => item.branchId === turn.branchId);
    if (!branch || branch.headTurnId !== turn.parentTurnId) {
      throw new ZeroLayerError_ACU('revision-conflict', 'Head của nhánh đã thay đổi khi phát hành.');
    }
    validateZeroLayerWorkingFrameScope_ACU(candidate, branch);
    const continuation = branch.continuation;
    if (continuation?.workingFrame) {
      const key = JSON.stringify(checkpointTurnRef_ACU(candidate, turn));
      requireZeroLayerValue_ACU(!Object.prototype.hasOwnProperty.call(continuation.moduleFrames, key)
        && !Object.prototype.hasOwnProperty.call(branch.checkpoints?.replayFrames ?? {}, key),
      'Phát hành không được ghi đè khung tài liệu hoặc hồ sơ phát lại hiện có.');
      continuation.moduleFrames[key] = structuredClone(continuation.workingFrame.payload);
      delete continuation.workingFrame;
    }
    branch.headTurnId = turn.turnId;
    turn.publishedMaterials = capturePublishedMaterials_ACU(candidate, turn);
  }
  candidate.revision += 1;
  return validateZeroLayerEnvelope_ACU(candidate);
}

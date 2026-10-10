import { ZeroLayerError_ACU, type ZeroLayerSimulationState_ACU, type ZeroLayerSimulationResult_ACU, type ZeroLayerTurn_ACU } from './model';
import { validateWorldSimulationEnvelope_ACU, validateWorldSimulationChronicleArchiveSnapshot_ACU, validateWorldSimulationLogicalRef_ACU } from '../simulation/simulation-store';
import { validateWorldSimulationConversationFloorRecord_ACU } from '../simulation/agent/agent-conversation-store';
import { validateWorldSimulationUserRequirementsSnapshot_ACU } from '../simulation/agent/agent-user-requirements';
import { validateWorldSimulationRunStateRecord_ACU } from '../simulation/agent/agent-run-state-store';
import { validateWorldSimulationRunWriteProof_ACU, rebaseWorldSimulationRunWriteProof_ACU } from '../simulation/simulation-run-write-state';
import { WORLD_SIMULATION_LEDGER_FIELD_MATRIX_ACU, WORLD_SIMULATION_SINGLETON_ID_ACU, type WorldSimulationLedgerFieldSnapshot_ACU, type WorldSimulationLogicalRef_ACU } from '../simulation/model';
import { reconcileLedgerFieldViewWithLedger_ACU } from '../simulation/simulation-ledger-fold';
import { sha256HexSync_ACU } from '../../shared/sha256-sync';
import { validateWorldSimulationLedger_ACU } from '../simulation/simulation-store';
import { buildWorldSimulationProjection_ACU } from '../simulation/simulation-projection';
import { getTableDataFingerprint_ACU } from '../table/table-data-upgrade-audit';
import type { ZeroLayerBridgeHostCompletion_ACU } from './bridge-model';

const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
function requireValue(value: unknown, message: string): asserts value {
  if (!value) throw new ZeroLayerError_ACU('corrupt-data', message);
}
const integer = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const exact = (value: Record<string, unknown>, keys: string[]) => requireValue(
  keys.every(key => Object.prototype.hasOwnProperty.call(value, key)) && Object.keys(value).every(key => keys.includes(key)), 'Trường snapshot mô phỏng không hợp lệ.');

export function validateZeroLayerSimulationFields_ACU(raw: unknown): asserts raw is WorldSimulationLedgerFieldSnapshot_ACU {
  requireValue(record(raw) && record(raw.records), 'Snapshot mục mô phỏng không hợp lệ.');
  exact(raw, ['records']);
  for (const [module, rows] of Object.entries(raw.records)) {
    requireValue(Object.prototype.hasOwnProperty.call(WORLD_SIMULATION_LEDGER_FIELD_MATRIX_ACU, module), 'Mô-đun mục mô phỏng không hợp lệ.');
    const matrix = WORLD_SIMULATION_LEDGER_FIELD_MATRIX_ACU[module as keyof typeof WORLD_SIMULATION_LEDGER_FIELD_MATRIX_ACU];
    requireValue(matrix && record(rows), 'Mô-đun mục mô phỏng không hợp lệ.');
    for (const [id, row] of Object.entries(rows)) {
      requireValue(!['clock', 'player', 'guidance'].includes(module) || id === WORLD_SIMULATION_SINGLETON_ID_ACU, 'Danh tính mục đơn mô phỏng không hợp lệ.');
      requireValue(record(row) && row.module === module && row.id === id && id.trim()
        && ['complete', 'partial', 'legacy_unknown'].includes(String(row.status))
        && record(row.fields) && Array.isArray(row.missingFields) && integer(row.updatedAt), 'Bản ghi mục mô phỏng không hợp lệ.');
      exact(row, ['module', 'id', 'status', 'fields', 'missingFields', 'updatedAt']);
      const fields = row.fields;
      for (const [field, entry] of Object.entries(fields)) {
        requireValue(matrix.fields.includes(field) && record(entry) && integer(entry.revision) && integer(entry.updatedAt), 'Giá trị mục mô phỏng không hợp lệ.');
        exact(entry, ['value', 'revision', 'updatedAt']);
      }
      const missing = row.status === 'partial' ? matrix.required.filter(field => !(field in fields)) : [];
      requireValue(JSON.stringify(missing) === JSON.stringify(row.missingFields), 'Mục thiếu của mô phỏng không khớp với snapshot.');
    }
  }
}

const canonical = (value: unknown): string => Array.isArray(value)
  ? `[${value.map(canonical).join(',')}]`
  : record(value) ? `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
    : JSON.stringify(value);

/** 结构校验与跨载体引用校验分开；后者必须在所有逻辑回合校验完成后调用。 */
export function validateZeroLayerSimulationState_ACU(raw: unknown): asserts raw is ZeroLayerSimulationState_ACU {
  requireValue(record(raw) && raw.schemaVersion === 1 && Array.isArray(raw.confirmed), 'Trạng thái mô phỏng Tầng 0 không hợp lệ.');
  exact(raw, ['schemaVersion', 'envelope', 'fields', 'archive', 'conversation', 'userRequirements', 'runState', 'runProof', 'confirmed']);
  const envelope = raw.envelope === null ? null : validateWorldSimulationEnvelope_ACU(raw.envelope, 'load');
  validateZeroLayerSimulationFields_ACU(raw.fields);
  validateWorldSimulationChronicleArchiveSnapshot_ACU(raw.archive, 'load');
  const conversation = validateWorldSimulationConversationFloorRecord_ACU(raw.conversation);
  validateWorldSimulationUserRequirementsSnapshot_ACU(raw.userRequirements);
  const runState = raw.runState === null ? null : validateWorldSimulationRunStateRecord_ACU(raw.runState);
  const proof = raw.runProof === null ? null : validateWorldSimulationRunWriteProof_ACU(raw.runProof);
  const ids = conversation.segments.flatMap(segment => segment.messages.map(message => message.id));
  requireValue(ids.every((id, index) => id === index + 1), 'Số thứ tự phiên mô phỏng logic không liên tục.');
  requireValue(conversation.segments.every(segment => !segment.compaction
    || segment.compaction.compactedThroughId <= ids.length), 'Tham chiếu nén mô phỏng vượt quá phiên lưu bền.');
  if (!envelope) {
    requireValue(runState === null && proof === null && raw.confirmed.length === 0
      && Object.values(raw.fields.records).every(rows => Object.keys(rows ?? {}).length === 0), 'Trạng thái mô phỏng thiếu phong bì có thẩm quyền.');
  } else {
    const reconciled = structuredClone(raw.fields);
    reconcileLedgerFieldViewWithLedger_ACU(reconciled, envelope.ledger, envelope.updatedAt);
    requireValue(canonical(reconciled) === canonical(raw.fields), 'Mục mô phỏng không khớp với sổ cái có thẩm quyền.');
    if (proof) {
      const view = { ledger: envelope.ledger, fields: raw.fields, archive: raw.archive as ZeroLayerSimulationState_ACU['archive'] };
      rebaseWorldSimulationRunWriteProof_ACU(proof, view, view);
    }
    const run = envelope.task?.activeRun;
    if (runState && run) requireValue(runState.taskId === run.taskId
      && runState.cursorKey === `${run.stageId}#${run.stageRevision}#${run.baseLedgerRevision}`, 'Con trỏ khôi phục mô phỏng không thuộc lần chạy hiện tại.');
    if (proof && run && proof.runId === run.runId) requireValue(proof.taskId === run.taskId
      && proof.stageId === run.stageId && proof.stageRevision === run.stageRevision
      && proof.baseLedgerRevision === run.baseLedgerRevision, 'Bằng chứng mô phỏng không thuộc lần chạy hiện tại.');
  }
  const confirmed = new Set<string>();
  for (const item of raw.confirmed) {
    requireValue(record(item) && integer(item.ledgerRevision), 'Bản ghi xác nhận mô phỏng không hợp lệ.');
    exact(item, ['ref', 'ledgerRevision']);
    const ref = validateWorldSimulationLogicalRef_ACU(item.ref, 'simulation.confirmed.ref', 'load');
    requireValue(!confirmed.has(ref.turnId) && envelope && item.ledgerRevision <= envelope.ledger.revision, 'Xác nhận mô phỏng bị trùng hoặc revision không hợp lệ.');
    confirmed.add(ref.turnId);
  }
}

export function validateZeroLayerSimulationRefs_ACU(
  state: ZeroLayerSimulationState_ACU, sessionId: string, branchId: string,
  turns: ReadonlyMap<string, ZeroLayerTurn_ACU>,
  hostCompletion?: ZeroLayerBridgeHostCompletion_ACU | null,
  reachable?: ReadonlySet<string>,
  headTurnId?: string | null,
): void {
  const assertRef = (ref: WorldSimulationLogicalRef_ACU, digest?: string) => {
    const turn = turns.get(ref.turnId);
    requireValue(ref.sessionId === sessionId && turn && ref.branchId === turn.branchId
      && (reachable ? reachable.has(turn.turnId)
        || turn.branchId === branchId && turn.parentTurnId === headTurnId && turn.phase !== 'published'
        : turn.branchId === branchId) && turn.attemptId === ref.attemptId
      && turn.assistantFloor.floorId === ref.floorId && typeof turn.body === 'string' && turn.body.trim()
      && ['response-durable', 'effects-durable', 'published'].includes(turn.phase), 'Tham chiếu mô phỏng phải ứng với nội dung logic đã lưu của nhánh này.');
    if (digest !== undefined) requireValue(sha256HexSync_ACU(turn.body) === digest, 'Dấu vân tay nội dung mô phỏng không khớp với tham chiếu logic.');
  };
  const envelope = state.envelope;
  const run = envelope?.task?.activeRun;
  if (run) {
    requireValue(run.kind === 'logical', 'Mô phỏng Tầng 0 không được lưu danh tính chạy của host.');
    assertRef(run.logicalRef, run.anchorContentDigest);
  }
  const completed = envelope?.task?.completedAutoAnchor;
  if (completed) {
    if (completed.kind === 'logical') {
      assertRef(completed.logicalRef, completed.contentDigest);
    } else {
      requireValue(hostCompletion && hostCompletion.taskId === envelope?.task?.taskId
        && hostCompletion.ref.kind === 'host'
        && canonical(completed) === canonical(hostCompletion.anchor),
      'Neo hoàn tất của host phải khớp với bằng chứng nguồn cầu nối đã xác nhận của tác vụ này.');
    }
  }
  for (const fix of envelope?.ledger.pendingFixes ?? []) if (fix.anchor) {
    requireValue('logicalRef' in fix.anchor && fix.anchor.logicalRef, 'Mô phỏng Tầng 0 không được lưu neo chờ sửa của host.');
    assertRef(fix.anchor.logicalRef, fix.anchor.contentDigest);
  }
  for (const item of state.confirmed) {
    assertRef(item.ref);
    const turn = turns.get(item.ref.turnId)!;
    validateZeroLayerSimulationReceipt_ACU(turn, sessionId);
    const result = turn.assistantFloor.data.simulation as ZeroLayerSimulationResult_ACU;
    requireValue(result.outcome !== 'skipped-by-config' && result.ledger?.revision === item.ledgerRevision,
      'Xác nhận mô phỏng không khớp với kết quả tầng logic.');
  }
}

export function validateZeroLayerSimulationResult_ACU(raw: unknown): asserts raw is ZeroLayerSimulationResult_ACU {
  requireValue(record(raw) && raw.schemaVersion === 1 && typeof raw.summary === 'string'
    && ['commit', 'no_change', 'skipped-by-config'].includes(String(raw.outcome))
    && (raw.projection === null || typeof raw.projection === 'string'), 'Kết quả mô phỏng logic không hợp lệ.');
  exact(raw, ['schemaVersion', 'ref', 'outcome', 'summary', 'ledger', 'fields', 'archive', 'projection']);
  validateWorldSimulationLogicalRef_ACU(raw.ref, 'simulation.result.ref', 'load');
  validateZeroLayerSimulationFields_ACU(raw.fields);
  validateWorldSimulationChronicleArchiveSnapshot_ACU(raw.archive, 'load');
  if (raw.ledger !== null) {
    const ledger = validateWorldSimulationLedger_ACU(raw.ledger, 'load');
    requireValue(raw.projection === buildWorldSimulationProjection_ACU(ledger), 'Phép chiếu mô phỏng logic không thuộc sổ cái kết quả.');
    const fields = structuredClone(raw.fields);
    reconcileLedgerFieldViewWithLedger_ACU(fields, ledger, 0);
    requireValue(canonical(fields) === canonical(raw.fields), 'Mục kết quả mô phỏng logic không khớp với sổ cái.');
  } else requireValue(raw.outcome === 'skipped-by-config' && raw.projection === null
    && Object.values(raw.fields.records).every(rows => !Object.keys(rows ?? {}).length), 'Kết quả mô phỏng logic thiếu sổ cái.');
}

export function validateZeroLayerSimulationReceipt_ACU(turn: ZeroLayerTurn_ACU, sessionId: string): void {
  const result = turn.assistantFloor.data.simulation;
  validateZeroLayerSimulationResult_ACU(result);
  const ref = result.ref;
  requireValue(ref.sessionId === sessionId && ref.branchId === turn.branchId && ref.turnId === turn.turnId
    && ref.attemptId === turn.attemptId && ref.floorId === turn.assistantFloor.floorId, 'Danh tính logic của biên nhận mô phỏng không khớp.');
  const receipt = turn.effectReceipts.find(item => item.kind === 'simulation');
  requireValue(receipt && receipt.effectId === JSON.stringify([sessionId, turn.branchId, turn.turnId, 'simulation'])
    && receipt.status === (result.outcome === 'skipped-by-config' ? 'skipped-by-config' : 'durable')
    && receipt.fingerprint === getTableDataFingerprint_ACU(result), 'Biên nhận mô phỏng không khớp với kết quả lưu bền.');
}
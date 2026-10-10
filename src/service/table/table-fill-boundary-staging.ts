import { getChatArray_ACU, saveChatToHostStrict_ACU } from '../../data/gateways/chat-gateway';
import { readIsolatedDataContainer_ACU, writeMessageIdentity_ACU } from '../../data/repositories/chat-message-data-repo';
import type { Sheet_ACU, TableDataObject_ACU } from '../../shared/models/table-data';
import { logDebug_ACU, logWarn_ACU } from '../../shared/utils';
import { currentChatFileIdentifier_ACU, getCurrentIsolationKey_ACU, settings_ACU, _set_currentJsonTableData_ACU } from '../runtime/state-manager';
import { createCanonicalSnapshotEnvelope_ACU } from './canonical-snapshot-envelope';
import { buildCanonicalSheetCheckpoint_ACU } from './canonical-checkpoint-builder';
import { getOriginalFullFrameFingerprint_ACU } from './manual-catch-up-provisional-bridge';
import { isSqliteMode } from './storage-mode';
import { loadTableStatesAtBoundariesFromFramesV2Detailed_ACU, type TableReplayResultV2_ACU } from './storage-frame-v2-replay';
import { isV2TagData_ACU } from './storage-strategy-resolver';
import type { TableStorageFrameV2_ACU } from './storage-frame-v2-types';
import { getTableDataFingerprint_ACU } from './table-data-upgrade-audit';
import { getRuntimeLifecycleEpoch_ACU, hydrateStorageProviderFromSnapshot_ACU } from './table-storage-strategy';
import { runTableWriteTransaction_ACU } from './table-write-transaction';

export type TableFillRunKind = 'manual_refill' | 'auto_fill' | 'manual_catch_up';

export type TableFillBoundaryDiagnosticCode_ACU =
  | 'invalid_input'
  | 'multiple_full_checkpoints'
  | 'full_checkpoint_root_mismatch'
  | 'full_checkpoint_fingerprint_mismatch'
  | 'staging_scope_changed'
  | 'staging_target_snapshot_missing'
  | 'selected_sheet_boundary_mismatch'
  | 'non_target_boundary_mismatch'
  | 'non_target_head_mismatch'
  | 'candidate_write_surface_violation'
  | 'candidate_replay_requires_repair'
  | 'boundary_strict_save_failed'
  | 'runtime_publish_failed'
  | 'boundary_replay_mismatch'
  | 'boundary_commit_failed';

export type TableFillBoundaryStagingPhase =
  | 'pre_boundary_staging'
  | 'boundary_committing'
  | 'post_boundary_persisting';

export class TableFillBoundaryPlanError_ACU extends Error {
  constructor(
    readonly code: 'invalid_input' | 'multiple_full_checkpoints',
    message: string,
  ) {
    super(message);
    this.name = 'TableFillBoundaryPlanError_ACU';
  }
}

export interface TableFillBoundaryStagingScope_ACU {
  readonly runKind: TableFillRunKind;
  readonly runId: string;
  readonly chatKey: string;
  readonly isolationKey: string;
  readonly originalFullIndex: number | null;
  readonly rangeStartMessageIndex: number | null;
  readonly rangeEndMessageIndex: number | null;
  readonly targetSheetKeys: readonly string[];
  readonly templateFingerprint: string;
}

export interface TableFillBoundaryStagingPlanInput_ACU {
  runKind: TableFillRunKind;
  runId: string;
  chatKey: string;
  isolationKey: string;
  targetSheetKeys: readonly string[];
  templateFingerprint: string;
  messageIndices: readonly number[];
  fullCheckpointIndices: readonly number[];
}

export interface TableFillBoundaryStagingPlan_ACU {
  readonly scope: TableFillBoundaryStagingScope_ACU;
  preBoundaryIndices: number[];
  postBoundaryIndices: number[];
  requiresStaging: boolean;
  phase: TableFillBoundaryStagingPhase;
  lastStagedTargetMessageIndex: number | null;
  stagedBucketCount: number;
  boundaryCommitted: boolean;
}

/**
 * 目标表 overlay：staging 的唯一权威状态。
 * sheets 只能包含 targetSheetKeys；非目标表、mate 和整库 runtime 不得进入。
 */
export interface TableFillTargetOverlay_ACU {
  readonly targetSheetKeys: readonly string[];
  sheets: Record<string, Sheet_ACU>;
  lastTargetMessageIndex: number | null;
  lastLogicalTarget?: import('../zero-layer/timeline').ZeroLayerFloorRef_ACU & { kind: 'logical' };
  stagedBucketCount: number;
}

/**
 * 共享 stage-only runner 的运行时上下文。
 * overlay 是唯一权威 staging 状态；不再保存整库 stagedWorkingData/lastStagedSnapshot。
 */
export interface TableFillStagingRunContext_ACU {
  readonly runId: string;
  readonly chatKey: string;
  readonly isolationKey: string;
  readonly targetSheetKeys: readonly string[];
  readonly originalFullIndex: number | null;
  readonly originalFullFingerprint: string | null;
  readonly templateFingerprint: string;
  readonly logicalTarget?: import('../zero-layer/timeline').ZeroLayerFloorRef_ACU & { kind: 'logical' };
  readonly storageMode?: 'native' | 'sqlite';
  overlay: TableFillTargetOverlay_ACU;
}

export function createTableFillStagingRunContext_ACU(input: {
  runId: string;
  chatKey: string;
  isolationKey: string;
  targetSheetKeys: readonly string[];
  originalFullIndex: number | null;
  originalFullFingerprint?: string | null;
  templateFingerprint: string;
  logicalTarget?: import('../zero-layer/timeline').ZeroLayerFloorRef_ACU & { kind: 'logical' };
  storageMode?: 'native' | 'sqlite';
}): TableFillStagingRunContext_ACU {
  return {
    runId: input.runId,
    chatKey: input.chatKey,
    isolationKey: input.isolationKey,
    targetSheetKeys: Object.freeze([...input.targetSheetKeys]),
    originalFullIndex: input.originalFullIndex,
    originalFullFingerprint: input.originalFullFingerprint ?? null,
    templateFingerprint: input.templateFingerprint,
    ...(input.logicalTarget ? { logicalTarget: structuredClone(input.logicalTarget) } : {}),
    ...(input.storageMode ? { storageMode: input.storageMode } : {}),
    overlay: createEmptyTargetOverlay_ACU(input.targetSheetKeys),
  };
}

export function createEmptyTargetOverlay_ACU(targetSheetKeys: readonly string[]): TableFillTargetOverlay_ACU {
  return {
    targetSheetKeys: Object.freeze([...targetSheetKeys]),
    sheets: {},
    lastTargetMessageIndex: null,
    stagedBucketCount: 0,
  };
}

export function extractTargetOverlaySheets_ACU(
  data: Record<string, any> | null | undefined,
  targetSheetKeys: readonly string[],
): Record<string, Sheet_ACU> {
  const sheets: Record<string, Sheet_ACU> = {};
  if (!data || typeof data !== 'object') return sheets;
  for (const sheetKey of targetSheetKeys) {
    const sheet = data[sheetKey];
    if (sheet && typeof sheet === 'object' && !Array.isArray(sheet)) {
      sheets[sheetKey] = JSON.parse(JSON.stringify(sheet)) as Sheet_ACU;
    }
  }
  return sheets;
}

/**
 * 纯函数：historicalBase + target overlay → bucket working view。
 * 不写聊天、不写全局 runtime、不碰 provider。
 */
export function assembleBucketWorkingView_ACU(
  historicalBase: Record<string, any> | null | undefined,
  overlay: TableFillTargetOverlay_ACU | null | undefined,
): Record<string, any> {
  const base = historicalBase && typeof historicalBase === 'object'
    ? JSON.parse(JSON.stringify(historicalBase))
    : {};
  if (!overlay) return base;
  for (const sheetKey of overlay.targetSheetKeys) {
    const overlaySheet = overlay.sheets[sheetKey];
    if (overlaySheet && typeof overlaySheet === 'object') {
      base[sheetKey] = JSON.parse(JSON.stringify(overlaySheet));
    }
  }
  return base;
}

export function mergeTargetOverlayFromBucket_ACU(
  overlay: TableFillTargetOverlay_ACU,
  data: Record<string, any> | null | undefined,
  targetMessageIndex: number | null,
  logicalTarget?: import('../zero-layer/timeline').ZeroLayerFloorRef_ACU & { kind: 'logical' },
): TableFillTargetOverlay_ACU {
  return {
    targetSheetKeys: overlay.targetSheetKeys,
    sheets: {
      ...overlay.sheets,
      ...extractTargetOverlaySheets_ACU(data, overlay.targetSheetKeys),
    },
    lastTargetMessageIndex: targetMessageIndex,
    ...(logicalTarget ? { lastLogicalTarget: structuredClone(logicalTarget) } : {}),
    stagedBucketCount: overlay.stagedBucketCount + 1,
  };
}

export function readOriginalFullFrameFingerprint_ACU(
  chat: any[],
  isolationKey: string,
  originalFullIndex: number,
): string | null {
  const message = chat[originalFullIndex];
  if (!message) return null;
  const container = readIsolatedDataContainer_ACU(message);
  const tagData = container?.[isolationKey];
  if (!isV2TagData_ACU(tagData)) return null;
  const frame = (tagData as any).storageFrame as TableStorageFrameV2_ACU | undefined;
  if (!frame || frame.checkpoint?.kind !== 'full') return null;
  return getOriginalFullFrameFingerprint_ACU(frame);
}

function canonicalSheetFingerprint_ACU(sheet: unknown): string {
  return getTableDataFingerprint_ACU(sheet ?? null);
}

function failBoundary_ACU(
  diagnosticCode: TableFillBoundaryDiagnosticCode_ACU,
  error: string,
): { ok: false; error: string; diagnosticCode: TableFillBoundaryDiagnosticCode_ACU } {
  return { ok: false, error, diagnosticCode };
}

function assertCandidateWriteSurface_ACU(
  liveChat: any[],
  candidateChat: any[],
  isolationKey: string,
  originalFullIndex: number,
  targetSheetKeys: readonly string[],
): string | null {
  if (!Array.isArray(liveChat) || !Array.isArray(candidateChat) || liveChat.length !== candidateChat.length) {
    return 'candidate đã thay đổi số lượng tin nhắn';
  }
  const targetSet = new Set(targetSheetKeys);
  const hostReserved = new Set(['TavernDB_ACU_IsolatedData']);
  for (let index = 0; index < liveChat.length; index += 1) {
    const liveMessage = liveChat[index] || {};
    const candidateMessage = candidateChat[index] || {};
    const liveHost: Record<string, unknown> = {};
    const candidateHost: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(liveMessage)) {
      if (!hostReserved.has(key)) liveHost[key] = value;
    }
    for (const [key, value] of Object.entries(candidateMessage)) {
      if (!hostReserved.has(key)) candidateHost[key] = value;
    }
    if (getTableDataFingerprint_ACU(liveHost) !== getTableDataFingerprint_ACU(candidateHost)) {
      return `message[${index}] trường host bị ghi đè`;
    }
    const liveIso = (liveMessage as any).TavernDB_ACU_IsolatedData && typeof (liveMessage as any).TavernDB_ACU_IsolatedData === 'object'
      ? (liveMessage as any).TavernDB_ACU_IsolatedData
      : {};
    const candidateIso = (candidateMessage as any).TavernDB_ACU_IsolatedData && typeof (candidateMessage as any).TavernDB_ACU_IsolatedData === 'object'
      ? (candidateMessage as any).TavernDB_ACU_IsolatedData
      : {};
    const isolationKeys = new Set([...Object.keys(liveIso), ...Object.keys(candidateIso)]);
    for (const key of isolationKeys) {
      if (key !== isolationKey) {
        if (getTableDataFingerprint_ACU(liveIso[key] ?? null) !== getTableDataFingerprint_ACU(candidateIso[key] ?? null)) {
          return `message[${index}] isolationKey không phải đích bị ghi đè`;
        }
        continue;
      }
      if (index !== originalFullIndex) {
        if (getTableDataFingerprint_ACU(liveIso[key] ?? null) !== getTableDataFingerprint_ACU(candidateIso[key] ?? null)) {
          return `message[${index}] isolation đích bị ghi đè ở tầng không phải gốc`;
        }
        continue;
      }
      const liveTag = liveIso[key] && typeof liveIso[key] === 'object' ? liveIso[key] : {};
      const candidateTag = candidateIso[key] && typeof candidateIso[key] === 'object' ? candidateIso[key] : {};
      const liveFrame = (liveTag.storageFrame || {}) as TableStorageFrameV2_ACU;
      const candidateFrame = (candidateTag.storageFrame || {}) as TableStorageFrameV2_ACU;
      const liveTagRest = { ...liveTag, storageFrame: undefined };
      const candidateTagRest = { ...candidateTag, storageFrame: undefined };
      if (getTableDataFingerprint_ACU(liveTagRest) !== getTableDataFingerprint_ACU(candidateTagRest)) {
        return 'Metadata tag host của full checkpoint bị ghi đè';
      }
      if (getTableDataFingerprint_ACU(liveFrame.checkpoint ?? null) !== getTableDataFingerprint_ACU(candidateFrame.checkpoint ?? null)) {
        return 'Thân full checkpoint bị ghi đè';
      }
      if (getTableDataFingerprint_ACU(liveFrame.logEntries ?? []) !== getTableDataFingerprint_ACU(candidateFrame.logEntries ?? [])) {
        return 'logEntries bị ghi đè';
      }
      if (getTableDataFingerprint_ACU(liveFrame.headRevision ?? null) !== getTableDataFingerprint_ACU(candidateFrame.headRevision ?? null)) {
        return 'headRevision bị ghi đè';
      }
      const liveFrameRest: Record<string, unknown> = { ...(liveFrame as any) };
      const candidateFrameRest: Record<string, unknown> = { ...(candidateFrame as any) };
      delete liveFrameRest.perSheetCheckpoints;
      delete candidateFrameRest.perSheetCheckpoints;
      delete liveFrameRest.checkpoint;
      delete candidateFrameRest.checkpoint;
      delete liveFrameRest.logEntries;
      delete candidateFrameRest.logEntries;
      delete liveFrameRest.headRevision;
      delete candidateFrameRest.headRevision;
      if (getTableDataFingerprint_ACU(liveFrameRest) !== getTableDataFingerprint_ACU(candidateFrameRest)) {
        return 'Metadata khác của storageFrame bị ghi đè';
      }
      const livePer = liveFrame.perSheetCheckpoints || {};
      const candidatePer = candidateFrame.perSheetCheckpoints || {};
      const perKeys = new Set([...Object.keys(livePer), ...Object.keys(candidatePer)]);
      for (const sheetKey of perKeys) {
        if (targetSet.has(sheetKey)) continue;
        if (getTableDataFingerprint_ACU((livePer as any)[sheetKey] ?? null) !== getTableDataFingerprint_ACU((candidatePer as any)[sheetKey] ?? null)) {
          return `perSheetCheckpoints[${sheetKey}] không phải đích bị ghi đè`;
        }
      }
    }
  }
  return null;
}

function requireNonEmptyString_ACU(value: unknown, field: string): string {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) {
    throw new TableFillBoundaryPlanError_ACU('invalid_input', `Kế hoạch điền bảng xuyên full checkpoint thiếu ${field} hợp lệ.`);
  }
  return normalized;
}

function normalizeStrictlyIncreasingIndices_ACU(indices: readonly number[], field: string): number[] {
  if (!Array.isArray(indices)) {
    throw new TableFillBoundaryPlanError_ACU('invalid_input', `${field} của kế hoạch điền bảng xuyên full checkpoint phải là mảng chỉ số tin nhắn.`);
  }
  const normalized = [...indices];
  for (let index = 0; index < normalized.length; index += 1) {
    const value = normalized[index];
    if (!Number.isInteger(value) || value < 0 || (index > 0 && value <= normalized[index - 1])) {
      throw new TableFillBoundaryPlanError_ACU('invalid_input', `${field} của kế hoạch điền bảng xuyên full checkpoint phải là các số nguyên không âm tăng chặt.`);
    }
  }
  return normalized;
}

function normalizeTargetSheetKeys_ACU(targetSheetKeys: readonly string[]): string[] {
  if (!Array.isArray(targetSheetKeys)) {
    throw new TableFillBoundaryPlanError_ACU('invalid_input', 'Bảng đích của kế hoạch điền bảng xuyên full checkpoint phải là mảng.');
  }
  const normalized = [...new Set(targetSheetKeys.map(sheetKey => requireNonEmptyString_ACU(sheetKey, 'bảng đích')))].sort();
  if (!normalized.length) {
    throw new TableFillBoundaryPlanError_ACU('invalid_input', 'Kế hoạch điền bảng xuyên full checkpoint cần ít nhất một bảng đích.');
  }
  return normalized;
}

export function planTableFillBoundaryStaging_ACU(input: TableFillBoundaryStagingPlanInput_ACU): TableFillBoundaryStagingPlan_ACU {
  if (!input || typeof input !== 'object') {
    throw new TableFillBoundaryPlanError_ACU('invalid_input', 'Đầu vào kế hoạch điền bảng xuyên full checkpoint không hợp lệ.');
  }
  if (!['manual_refill', 'auto_fill', 'manual_catch_up'].includes(input.runKind)) {
    throw new TableFillBoundaryPlanError_ACU('invalid_input', 'Loại chạy của kế hoạch điền bảng xuyên full checkpoint không hợp lệ.');
  }

  const runId = requireNonEmptyString_ACU(input.runId, 'runId');
  const chatKey = requireNonEmptyString_ACU(input.chatKey, 'chatKey');
  const isolationKey = typeof input.isolationKey === 'string' ? input.isolationKey : '';
  if (typeof input.isolationKey !== 'string') {
    throw new TableFillBoundaryPlanError_ACU('invalid_input', 'isolationKey của kế hoạch điền bảng xuyên full checkpoint phải là chuỗi.');
  }
  const templateFingerprint = requireNonEmptyString_ACU(input.templateFingerprint, 'dấu vân tay mẫu');
  const targetSheetKeys = normalizeTargetSheetKeys_ACU(input.targetSheetKeys);
  const messageIndices = normalizeStrictlyIncreasingIndices_ACU(input.messageIndices, 'chỉ số cần điền');
  const fullCheckpointIndices = normalizeStrictlyIncreasingIndices_ACU(input.fullCheckpointIndices, 'chỉ số full checkpoint');

  if (fullCheckpointIndices.length > 1) {
    throw new TableFillBoundaryPlanError_ACU(
      'multiple_full_checkpoints',
      `Kế hoạch điền bảng xuyên full checkpoint bị từ chối: dưới cùng isolationKey có ${fullCheckpointIndices.length} full checkpoint (${fullCheckpointIndices.join(', ')}).`,
    );
  }

  const originalFullIndex = fullCheckpointIndices[0] ?? null;
  const preBoundaryIndices = originalFullIndex === null ? [] : messageIndices.filter(index => index < originalFullIndex);
  const postBoundaryIndices = originalFullIndex === null ? messageIndices : messageIndices.filter(index => index >= originalFullIndex);
  const requiresStaging = preBoundaryIndices.length > 0;
  const scope: TableFillBoundaryStagingScope_ACU = Object.freeze({
    runKind: input.runKind,
    runId,
    chatKey,
    isolationKey,
    originalFullIndex,
    rangeStartMessageIndex: messageIndices[0] ?? null,
    rangeEndMessageIndex: messageIndices.length > 0 ? messageIndices[messageIndices.length - 1] : null,
    targetSheetKeys: Object.freeze([...targetSheetKeys]),
    templateFingerprint,
  });

  return {
    scope,
    preBoundaryIndices,
    postBoundaryIndices,
    requiresStaging,
    phase: requiresStaging ? 'pre_boundary_staging' : 'post_boundary_persisting',
    lastStagedTargetMessageIndex: null,
    stagedBucketCount: 0,
    boundaryCommitted: false,
  };
}

/**
 * 计划 5.2：统一按边界拆分计划。
 *
 * 跨原 full 边界的原 batch（indices 同时含 < originalFullIndex 与 >= originalFullIndex）
 * 必须拆成两个新 batch，并重新计算 messageIndices / first-last / saveTargetIndex /
 * mergeBaseMaxMessageIndex / batch/progress 序号。
 *
 * 每段返回：
 * - indices：该段实际待填楼层（已滤除不在 messageIndices 内的楼层）；
 * - saveTargetIndex：段内最后实际楼层；
 * - mergeBaseMaxMessageIndex：段内首楼 - 1；若段首为原根，则取 max(首楼-1, originalFullIndex)
 *   以便基底覆盖原根；pre 段段首即 rangeStart 时允许 -1（无边界基底，落模板基线）。
 */
export interface BoundarySegment_ACU {
  readonly indices: readonly number[];
  readonly saveTargetIndex: number;
  readonly mergeBaseMaxMessageIndex: number;
  /** P3: when this segment starts at a schema timeline boundary, record the boundary kind. */
  readonly boundaryKind?: 'sheet_introduction' | 'sheet_rebase' | 'sheet_reveal' | 'sheet_hide';
}

/**
 * P3: schema timeline boundary kind collected from V2 per-sheet checkpoints.
 * These are the structural switch points that a catch-up run must isolate.
 */
export type TableFillSchemaBoundaryKind_ACU =
  | 'sheet_introduction'
  | 'sheet_rebase'
  | 'sheet_reveal'
  | 'sheet_hide';

export interface TableFillSchemaBoundary_ACU {
  readonly index: number;
  readonly kind: TableFillSchemaBoundaryKind_ACU;
}

/**
 * Collects the message indices at which any sheet's schema/visibility timeline
 * becomes active. The result is sorted by index; only one kind is kept per index.
 */
export function collectV2SchemaBoundaryIndices_ACU(
  chat: any[] | null | undefined,
  isolationKey: string,
): TableFillSchemaBoundary_ACU[] {
  if (!Array.isArray(chat) || chat.length === 0) return [];
  const knownKinds = new Set<TableFillSchemaBoundaryKind_ACU>([
    'sheet_introduction',
    'sheet_rebase',
    'sheet_reveal',
    'sheet_hide',
  ]);
  const seen = new Map<number, TableFillSchemaBoundaryKind_ACU>();
  for (let i = 0; i < chat.length; i += 1) {
    const container = readIsolatedDataContainer_ACU(chat[i]);
    const tagData = container?.[isolationKey];
    if (!isV2TagData_ACU(tagData)) continue;
    const frame = (tagData as any).storageFrame as TableStorageFrameV2_ACU | undefined;
    const checkpoints = frame?.perSheetCheckpoints;
    if (!checkpoints || typeof checkpoints !== 'object' || Array.isArray(checkpoints)) continue;
    for (const checkpoint of Object.values(checkpoints) as Array<{
      timeline?: { kind?: string; activateAtMessageIndex?: unknown };
    }>) {
      const timeline = checkpoint?.timeline;
      if (!timeline) continue;
      const kind = timeline.kind;
      if (typeof kind !== 'string' || !knownKinds.has(kind as TableFillSchemaBoundaryKind_ACU)) continue;
      const index = timeline.activateAtMessageIndex;
      if (!Number.isInteger(index) || (index as number) < 0) continue;
      if (!seen.has(index as number)) {
        seen.set(index as number, kind as TableFillSchemaBoundaryKind_ACU);
      }
    }
  }
  return [...seen.entries()]
    .sort(([left], [right]) => left - right)
    .map(([index, kind]) => ({ index, kind }));
}

/**
 * P3: split a message-index batch at both the formal full checkpoint root and any
 * schema timeline boundary. The legacy splitMessageIndicesAtBoundary_ACU is kept
 * for callers that do not yet supply schema boundaries; this function is the
 * boundary-aware variant used by catch-up planning.
 *
 * Each segment returned by a schema boundary starts at that boundary's index and
 * carries the boundary kind, so later staging can freeze the active structure.
 */
export function splitMessageIndicesAtSchemaBoundaries_ACU(
  messageIndices: readonly number[],
  originalFullIndex: number | null,
  schemaBoundaries: readonly TableFillSchemaBoundary_ACU[] = [],
  fullMessageIndexSet: ReadonlySet<number> = new Set(),
): BoundarySegment_ACU[] {
  const normalized = normalizeStrictlyIncreasingIndices_ACU(messageIndices, 'chỉ số cần tách');
  if (!normalized.length) return [];
  const normalizedBoundaries = [...schemaBoundaries]
    .filter(boundary => Number.isInteger(boundary.index) && (boundary.index as number) >= 0)
    .sort((left, right) => left.index - right.index);
  if (originalFullIndex === null && normalizedBoundaries.length === 0) {
    const first = normalized[0];
    const last = normalized[normalized.length - 1];
    return [{
      indices: [...normalized],
      saveTargetIndex: last,
      mergeBaseMaxMessageIndex: first - 1,
    }];
  }

  const cutPoints = [...new Set<number>(
    (originalFullIndex === null ? [] : [originalFullIndex])
      .concat(normalizedBoundaries.map(boundary => boundary.index)),
  )].sort((left, right) => left - right);
  const segments: BoundarySegment_ACU[] = [];
  let cursor = 0;
  for (let cutIndex = 0; cutIndex < cutPoints.length; cutIndex += 1) {
    const cut = cutPoints[cutIndex];
    let segmentIndices: number[] = [];
    while (cursor < normalized.length && normalized[cursor] < cut) {
      segmentIndices.push(normalized[cursor]);
      cursor += 1;
    }
    if (segmentIndices.length > 0) {
      const first = segmentIndices[0];
      const last = segmentIndices[segmentIndices.length - 1];
      segments.push({
        indices: segmentIndices,
        saveTargetIndex: last,
        mergeBaseMaxMessageIndex: first - 1,
      });
    }

    const nextCut = cutIndex + 1 < cutPoints.length ? cutPoints[cutIndex + 1] : Number.POSITIVE_INFINITY;
    segmentIndices = [];
    while (cursor < normalized.length && normalized[cursor] < nextCut) {
      segmentIndices.push(normalized[cursor]);
      cursor += 1;
    }
    if (segmentIndices.length > 0) {
      const first = segmentIndices[0];
      const last = segmentIndices[segmentIndices.length - 1];
      let mergeBaseMax = first - 1;
      if (originalFullIndex !== null && first === originalFullIndex && fullMessageIndexSet.has(originalFullIndex)) {
        mergeBaseMax = Math.max(mergeBaseMax, originalFullIndex);
      }
      const boundaryKind = normalizedBoundaries.find(boundary => boundary.index === cut)?.kind;
      // P3: schema timeline 的生效帧本身就是该段的结构源（introduction/rebase/reveal/hide
      // 均在对应楼层的 afterSeq 后改写 active state）。若填充段从边界帧开始，基底必须回放到
      // 该帧，才能带出当时结构，而不是用边界前的旧结构生成增量。
      if (boundaryKind && first === cut) {
        mergeBaseMax = Math.max(mergeBaseMax, cut);
      }
      const segment: BoundarySegment_ACU = {
        indices: segmentIndices,
        saveTargetIndex: last,
        mergeBaseMaxMessageIndex: mergeBaseMax,
        ...(boundaryKind ? { boundaryKind } : {}),
      };
      segments.push(segment);
    }
  }
  if (cursor < normalized.length) {
    const segmentIndices = normalized.slice(cursor);
    const first = segmentIndices[0];
    const last = segmentIndices[segmentIndices.length - 1];
    segments.push({
      indices: segmentIndices,
      saveTargetIndex: last,
      mergeBaseMaxMessageIndex: first - 1,
    });
  }
  return segments;
}

export function splitMessageIndicesAtBoundary_ACU(
  messageIndices: readonly number[],
  originalFullIndex: number | null,
  fullMessageIndexSet: ReadonlySet<number> = new Set(),
): BoundarySegment_ACU[] {
  const normalized = normalizeStrictlyIncreasingIndices_ACU(messageIndices, 'chỉ số cần tách');
  if (!normalized.length) return [];
  if (originalFullIndex === null) {
    const first = normalized[0];
    const last = normalized[normalized.length - 1];
    return [{
      indices: [...normalized],
      saveTargetIndex: last,
      mergeBaseMaxMessageIndex: first - 1,
    }];
  }

  const segments: BoundarySegment_ACU[] = [];
  const pre = normalized.filter(index => index < originalFullIndex);
  const post = normalized.filter(index => index >= originalFullIndex);
  if (pre.length > 0) {
    segments.push({
      indices: [...pre],
      saveTargetIndex: pre[pre.length - 1],
      mergeBaseMaxMessageIndex: pre[0] - 1,
    });
  }
  if (post.length > 0) {
    const mergeBaseMax = post[0] - 1;
    // 若边界楼层本身在待填集合内且作为正式根，基底必须至少覆盖原根，
    // 防止用边界前空基底覆盖已确认的正式根数据。
    const effectiveMergeBaseMax = fullMessageIndexSet.has(originalFullIndex)
      ? Math.max(mergeBaseMax, originalFullIndex)
      : mergeBaseMax;
    segments.push({
      indices: [...post],
      saveTargetIndex: post[post.length - 1],
      mergeBaseMaxMessageIndex: effectiveMergeBaseMax,
    });
  }
  return segments;
}


export interface TableFillBoundaryCommitSuccess_ACU {
  ok: true;
  boundaryCommitSummary: { selectedSheetKeys: string[]; originalFullCheckpointIndex: number };
  verifiedHeadSnapshot: Record<string, any>;
}

export type TableFillBoundaryCommitResult_ACU =
  | TableFillBoundaryCommitSuccess_ACU
  | { ok: false; error: string; diagnosticCode?: TableFillBoundaryDiagnosticCode_ACU };

/**
 * 跨 full checkpoint 分阶段提交的边界汇合。
 *
 * live/candidate 在同一 cutoff 上比较：
 * - boundary 目标表 == target overlay；非目标表 == liveBoundary
 * - head 非目标表 == liveHead；目标表必须由 candidate 完整 replay 得到，允许原 suffix log 继续生效
 */
export async function commitStagedSheetsAtFullBoundaryAtomic_ACU(
  runId: string,
  options: {
    chatKey?: string;
    isolationKey?: string;
    originalFullIndex: number;
    originalFullFingerprint?: string | null;
    templateFingerprint?: string;
    /** 仅含目标表的 overlay 快照。 */
    stagedSnapshot: Record<string, any>;
    targetSheetKeys: readonly string[];
    signal?: AbortSignal;
  },
): Promise<TableFillBoundaryCommitResult_ACU> {
  const isolationKey = options.isolationKey ?? getCurrentIsolationKey_ACU();
  const chatKey = options.chatKey ?? currentChatFileIdentifier_ACU;
  const targetSheetKeys = [...options.targetSheetKeys];

  return runTableWriteTransaction_ACU({
    source: 'manual_fill',
    reason: 'commitStagedSheetsAtFullBoundaryAtomic',
    isolationKey,
    writeSet: targetSheetKeys.map(sheetKey => ({ kind: 'sheet' as const, sheetKey })),
    maintenanceMode: 'exclusive',
  }, async () => {
    if (options.signal?.aborted) throw new DOMException('Tác vụ điền bảng đã bị hủy.', 'AbortError');
    if (String(currentChatFileIdentifier_ACU || '') !== String(chatKey || '')
      || String(getCurrentIsolationKey_ACU() || '') !== String(isolationKey || '')) {
      return failBoundary_ACU('staging_scope_changed', 'Kiểm tra lại boundary commit thất bại: chatKey hoặc isolationKey đã chuyển.');
    }

    const chat = getChatArray_ACU();
    const fullIndices: number[] = [];
    for (let index = 0; index < chat.length; index += 1) {
      const message = chat[index];
      const container = readIsolatedDataContainer_ACU(message);
      if (!container) continue;
      const tagData = container[isolationKey];
      if (!isV2TagData_ACU(tagData)) continue;
      const frame = (tagData as any).storageFrame as TableStorageFrameV2_ACU | undefined;
      if (frame?.checkpoint?.kind === 'full') fullIndices.push(index);
    }
    if (fullIndices.length !== 1) {
      return failBoundary_ACU(
        'multiple_full_checkpoints',
        `boundary commit bị từ chối: dưới cùng isolationKey có ${fullIndices.length} full checkpoint (${fullIndices.join(', ')}), phải duy nhất.`,
      );
    }
    if (fullIndices[0] !== options.originalFullIndex) {
      return failBoundary_ACU(
        'full_checkpoint_root_mismatch',
        `Gốc full ban đầu của boundary commit không khớp: expected=${options.originalFullIndex}, actual=${fullIndices[0]}; từ chối hợp nhất.`,
      );
    }

    const originalMessage = chat[options.originalFullIndex];
    if (!originalMessage) {
      return failBoundary_ACU('full_checkpoint_root_mismatch', `Tầng full checkpoint ban đầu ${options.originalFullIndex} không tồn tại, không thể hợp nhất.`);
    }
    const originalContainer = readIsolatedDataContainer_ACU(originalMessage) || {};
    if (!isV2TagData_ACU(originalContainer[isolationKey])) {
      return failBoundary_ACU('full_checkpoint_root_mismatch', `Tầng full checkpoint ban đầu ${options.originalFullIndex} thiếu dữ liệu V2.`);
    }
    const liveFrame = (originalContainer[isolationKey] as any).storageFrame as TableStorageFrameV2_ACU;
    if (liveFrame?.checkpoint?.kind !== 'full') {
      return failBoundary_ACU('full_checkpoint_root_mismatch', `frame của tầng full checkpoint ban đầu ${options.originalFullIndex} thiếu gốc full chính thức.`);
    }
    const liveFingerprint = getOriginalFullFrameFingerprint_ACU(liveFrame);
    if (options.originalFullFingerprint && options.originalFullFingerprint !== liveFingerprint) {
      return failBoundary_ACU(
        'full_checkpoint_fingerprint_mismatch',
        `Dấu vân tay gốc full ban đầu của boundary commit không khớp: runId=${runId}, index=${options.originalFullIndex}. `,
      );
    }

    const overlaySheets = extractTargetOverlaySheets_ACU(options.stagedSnapshot, targetSheetKeys);
    for (const sheetKey of targetSheetKeys) {
      if (!overlaySheets[sheetKey]) {
        return failBoundary_ACU('staging_target_snapshot_missing', `boundary commit thiếu snapshot staging của selected sheet: ${sheetKey}. `);
      }
    }

    const headIndex = Math.max(0, chat.length - 1);
    let liveBoundary: TableReplayResultV2_ACU | undefined;
    let liveHead: TableReplayResultV2_ACU | undefined;
    try {
      const liveStates = await loadTableStatesAtBoundariesFromFramesV2Detailed_ACU(
        chat,
        isolationKey,
        [options.originalFullIndex, headIndex],
        { updateRuntimeState: false, compatibilityMode: 'disabled' },
      );
      liveBoundary = liveStates.get(options.originalFullIndex);
      liveHead = liveStates.get(headIndex);
      if (!liveBoundary || liveBoundary.baseKind !== 'full_checkpoint' || !liveBoundary.data) {
        return failBoundary_ACU('boundary_replay_mismatch', `boundary commit live boundary replay chưa thiết lập nền chính thức: boundary=${options.originalFullIndex}. `);
      }
      if (liveBoundary.requiresCheckpointConvergence || liveBoundary.compatibilityRepairs?.length) {
        return failBoundary_ACU('candidate_replay_requires_repair', `boundary commit live boundary replay phụ thuộc sửa chữa tương thích: boundary=${options.originalFullIndex}. `);
      }
      if (!liveHead || liveHead.baseKind !== 'full_checkpoint' || !liveHead.data) {
        return failBoundary_ACU('boundary_replay_mismatch', `boundary commit live head replay chưa thiết lập nền chính thức: boundary=${headIndex}. `);
      }
      if (liveHead.requiresCheckpointConvergence || liveHead.compatibilityRepairs?.length) {
        return failBoundary_ACU('candidate_replay_requires_repair', `boundary commit live head replay phụ thuộc sửa chữa tương thích: boundary=${headIndex}. `);
      }
    } catch (error: any) {
      return failBoundary_ACU('boundary_replay_mismatch', `boundary commit xác minh live replay gặp lỗi: ${error?.message || String(error)}`);
    }

    const originalTagData = JSON.parse(JSON.stringify(originalContainer[isolationKey]));
    const frame = originalTagData.storageFrame as TableStorageFrameV2_ACU;
    const maxSeq = Math.max(0, ...(frame.logEntries || []).map(entry => Number((entry as any).seq) || 0));
    const now = Date.now();
    const perSheetCheckpoints = { ...(frame.perSheetCheckpoints || {}) };
    for (const sheetKey of targetSheetKeys) {
      const sheetCheckpointResult = buildCanonicalSheetCheckpoint_ACU({
        createdAt: now,
        reason: 'manual',
        sheetKey,
        data: overlaySheets[sheetKey],
        event: { filledSheetKeys: [sheetKey], changedSheetKeys: [sheetKey], groupKeys: [] },
        context: { messageIndex: options.originalFullIndex, isolationKey, reason: 'manual' },
      });
      if (!sheetCheckpointResult.checkpoint) {
        return failBoundary_ACU('staging_target_snapshot_missing', `boundary commit không thể dựng rebase của selected sheet: ${sheetKey}: ${sheetCheckpointResult.error}`);
      }
      perSheetCheckpoints[sheetKey] = {
        ...sheetCheckpointResult.checkpoint,
        timeline: {
          kind: 'sheet_rebase',
          activateAtMessageIndex: options.originalFullIndex,
          afterSeq: maxSeq,
        },
      };
    }
    frame.perSheetCheckpoints = perSheetCheckpoints;

    const liveChatClone = JSON.parse(JSON.stringify(chat)) as any[];
    const candidateChat = JSON.parse(JSON.stringify(chat)) as any[];
    const candidateOriginalMessage = candidateChat[options.originalFullIndex];
    if (!candidateOriginalMessage) {
      return failBoundary_ACU('full_checkpoint_root_mismatch', `Cuộc trò chuyện ứng viên thiếu tầng full ban đầu ${options.originalFullIndex}, không thể hợp nhất.`);
    }
    const candidateContainer = readIsolatedDataContainer_ACU(candidateOriginalMessage) || {};
    candidateContainer[isolationKey] = originalTagData;
    candidateOriginalMessage.TavernDB_ACU_IsolatedData = candidateContainer;

    const writeSurfaceError = assertCandidateWriteSurface_ACU(
      liveChatClone,
      candidateChat,
      isolationKey,
      options.originalFullIndex,
      targetSheetKeys,
    );
    if (writeSurfaceError) {
      return failBoundary_ACU('candidate_write_surface_violation', `boundary commit ghi vượt phạm vi cho phép: ${writeSurfaceError}. `);
    }

    let candidateHeadData: Record<string, any> | null = null;
    try {
      const candidateStates = await loadTableStatesAtBoundariesFromFramesV2Detailed_ACU(
        candidateChat,
        isolationKey,
        [options.originalFullIndex, headIndex],
        { updateRuntimeState: false, compatibilityMode: 'disabled' },
      );
      const candidateBoundary = candidateStates.get(options.originalFullIndex);
      const candidateHead = candidateStates.get(headIndex);
      if (!candidateBoundary || candidateBoundary.baseKind !== 'full_checkpoint' || !candidateBoundary.data) {
        return failBoundary_ACU('boundary_replay_mismatch', `boundary commit boundary replay ứng viên chưa thiết lập nền chính thức: boundary=${options.originalFullIndex}. `);
      }
      if (candidateBoundary.requiresCheckpointConvergence || candidateBoundary.compatibilityRepairs?.length) {
        return failBoundary_ACU('candidate_replay_requires_repair', `boundary commit boundary replay ứng viên phụ thuộc sửa chữa tương thích: boundary=${options.originalFullIndex}. `);
      }
      if (!candidateHead || candidateHead.baseKind !== 'full_checkpoint' || !candidateHead.data) {
        return failBoundary_ACU('boundary_replay_mismatch', `boundary commit head replay ứng viên chưa thiết lập nền chính thức: boundary=${headIndex}. `);
      }
      if (candidateHead.requiresCheckpointConvergence || candidateHead.compatibilityRepairs?.length) {
        return failBoundary_ACU('candidate_replay_requires_repair', `boundary commit head replay ứng viên phụ thuộc sửa chữa tương thích: boundary=${headIndex}. `);
      }
      candidateHeadData = candidateHead.data as Record<string, any>;

      const sheetKeys = new Set<string>([
        ...Object.keys(liveBoundary.data || {}),
        ...Object.keys(liveHead.data || {}),
        ...Object.keys(candidateBoundary.data || {}),
        ...Object.keys(candidateHead.data || {}),
        ...targetSheetKeys,
      ].filter(key => key.startsWith('sheet_')));

      for (const sheetKey of sheetKeys) {
        const isTarget = targetSheetKeys.includes(sheetKey);
        if (isTarget) {
          if (canonicalSheetFingerprint_ACU(candidateBoundary.data?.[sheetKey]) !== canonicalSheetFingerprint_ACU(overlaySheets[sheetKey])) {
            logWarn_ACU(`[TableFillBoundaryStaging] selected_sheet_boundary_mismatch: runId=${runId}, cutoff=${options.originalFullIndex}, sheetKey=${sheetKey}, overlay=${canonicalSheetFingerprint_ACU(overlaySheets[sheetKey])}, candidate=${canonicalSheetFingerprint_ACU(candidateBoundary.data?.[sheetKey])}`);
            return failBoundary_ACU('selected_sheet_boundary_mismatch', `Sau boundary commit, phát lại biên của selected sheet không nhất quán: ${sheetKey}. `);
          }
          if (!candidateHead.data?.[sheetKey] || typeof candidateHead.data[sheetKey] !== 'object') {
            return failBoundary_ACU('selected_sheet_boundary_mismatch', `head ứng viên của boundary commit thiếu bảng đích: ${sheetKey}. `);
          }
          continue;
        }
        if (canonicalSheetFingerprint_ACU(candidateBoundary.data?.[sheetKey]) !== canonicalSheetFingerprint_ACU(liveBoundary.data?.[sheetKey])) {
          logWarn_ACU(`[TableFillBoundaryStaging] non_target_boundary_mismatch: runId=${runId}, cutoff=${options.originalFullIndex}, sheetKey=${sheetKey}`);
          return failBoundary_ACU('non_target_boundary_mismatch', `Sau boundary commit, phát lại biên của bảng không phải đích không nhất quán: ${sheetKey}. `);
        }
        if (canonicalSheetFingerprint_ACU(candidateHead.data?.[sheetKey]) !== canonicalSheetFingerprint_ACU(liveHead.data?.[sheetKey])) {
          logWarn_ACU(`[TableFillBoundaryStaging] non_target_head_mismatch: runId=${runId}, cutoff=${headIndex}, sheetKey=${sheetKey}`);
          return failBoundary_ACU('non_target_head_mismatch', `Sau boundary commit, phát lại head của bảng không phải đích không nhất quán: ${sheetKey}. `);
        }
      }
    } catch (error: any) {
      return failBoundary_ACU('boundary_replay_mismatch', `xác minh replay ứng viên của boundary commit gặp lỗi: ${error?.message || String(error)}`);
    }

    if (options.signal?.aborted) throw new DOMException('Tác vụ điền bảng đã bị hủy.', 'AbortError');
    const before = JSON.parse(JSON.stringify(chat));
    try {
      chat.length = 0;
      chat.push(...candidateChat);
      writeMessageIdentity_ACU(candidateOriginalMessage, {
        enabled: settings_ACU.dataIsolationEnabled,
        code: settings_ACU.dataIsolationCode,
      });
      await saveChatToHostStrict_ACU();
    } catch (error: any) {
      chat.length = 0;
      chat.push(...before);
      return failBoundary_ACU('boundary_strict_save_failed', `Lưu nghiêm ngặt boundary commit thất bại: ${error?.message || String(error)}`);
    }
    logDebug_ACU(`[TableFillBoundaryStaging] 已原子汇合：runId=${runId}, originalFull=${options.originalFullIndex}, sheets=${targetSheetKeys.join('、')}。`);
    return {
      ok: true,
      boundaryCommitSummary: {
        selectedSheetKeys: [...targetSheetKeys],
        originalFullCheckpointIndex: options.originalFullIndex,
      },
      verifiedHeadSnapshot: candidateHeadData ? JSON.parse(JSON.stringify(candidateHeadData)) : {},
    };
  });
}

export async function publishVerifiedBoundaryHead_ACU(input: {
  verifiedHeadSnapshot: Record<string, any>;
  chatKey: string;
  isolationKey: string;
}): Promise<{ ok: true } | { ok: false; error: string; diagnosticCode: 'runtime_publish_failed' }> {
  try {
    if (String(currentChatFileIdentifier_ACU || '') !== String(input.chatKey || '')
      || String(getCurrentIsolationKey_ACU() || '') !== String(input.isolationKey || '')) {
      return {
        ok: false,
        error: 'Kiểm tra lại việc phát hành boundary runtime thất bại: chatKey hoặc isolationKey đã chuyển.',
        diagnosticCode: 'runtime_publish_failed',
      };
    }
    const snapshot = JSON.parse(JSON.stringify(input.verifiedHeadSnapshot || {})) as TableDataObject_ACU;
    if (isSqliteMode()) {
      const envelope = createCanonicalSnapshotEnvelope_ACU({
        data: snapshot,
        chatIdentity: String(input.chatKey || ''),
        isolationKey: String(input.isolationKey || ''),
        storageMode: 'sqlite',
        lifecycleEpoch: getRuntimeLifecycleEpoch_ACU(),
        source: 'boundary_commit_head',
      });
      if (!envelope) {
        return { ok: false, error: 'Phát hành boundary runtime thất bại: không thể dựng verified head envelope.', diagnosticCode: 'runtime_publish_failed' };
      }
      const hydrated = await hydrateStorageProviderFromSnapshot_ACU(envelope);
      if (!hydrated.ok) {
        return {
          ok: false,
          error: `Phát hành boundary runtime thất bại: ${hydrated.error || hydrated.failureCode || 'hydrate không thành công'}. Cuộc trò chuyện đã lưu vẫn là nguồn có thẩm quyền, hãy hydrate lại.`,
          diagnosticCode: 'runtime_publish_failed',
        };
      }
    }
    _set_currentJsonTableData_ACU(snapshot);
    return { ok: true };
  } catch (error: any) {
    return {
      ok: false,
      error: `Phát hành boundary runtime gặp lỗi: ${error?.message || String(error)}. Cuộc trò chuyện đã lưu vẫn là nguồn có thẩm quyền, hãy hydrate lại.`,
      diagnosticCode: 'runtime_publish_failed',
    };
  }
}

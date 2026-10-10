import {
  HostChatSaveNotStartedError_ACU, readChatFromHostStrict_ACU, saveChatToHostStrict_ACU,
} from '../../data/gateways/chat-gateway';
import {
  assertZeroLayerCarrier_ACU, captureZeroLayerCarrier_ACU, physicalHistoryFingerprint_ACU,
  physicalHistorySnapshot_ACU, readZeroLayerCarrier_ACU, type ZeroLayerCarrierContext_ACU,
  isolateZeroLayerCarrierCandidate_ACU, readZeroLayerCarrierCandidate_ACU,
} from './carrier-context';
import { ZERO_LAYER_CARRIER_FIELD_ACU, ZeroLayerError_ACU, type ZeroLayerEnvelope_ACU } from './model';
import { notifyZeroLayerChanges_ACU } from './notifications';
import { validateZeroLayerEnvelope_ACU, validateZeroLayerContinuationReceipt_ACU } from './validation';
import type { ContinuationLogicalRef_ACU } from '../continuation/model';
import { getTableDataFingerprint_ACU } from '../table/table-data-upgrade-audit';
import { applyZeroLayerCommand_ACU, mergeZeroLayerEffectReceipt_ACU, type ZeroLayerCommand_ACU } from './store-command';
import { assertBridgeSource_ACU } from './bridge-source';
import { assertBridgeConfig_ACU } from './bridge-config';
import type { ZeroLayerExitSelection_ACU, ZeroLayerExitAssignment_ACU } from './exit-model';
import { buildZeroLayerExitCandidate_ACU } from './exit-candidate';
import { applyExitAssignments_ACU, exitAssignmentsMatch_ACU } from './exit-fields';
import { requireExit_ACU } from './exit-source';
import { pendingZeroLayerPersistence_ACU, type PendingZeroLayerPersistence_ACU } from './persistence-state';

type PendingPersistence_ACU = PendingZeroLayerPersistence_ACU;

/** 单实例链路的串行写口，不承诺宿主 CAS 或跨标签事务。 */
export class ZeroLayerStore_ACU {
  private static tails = new Map<string, Promise<void>>();
  private static unknown = pendingZeroLayerPersistence_ACU;
  private static operationBlocks = new WeakMap<ZeroLayerCarrierContext_ACU['carrier'], Set<symbol>>();

  /** 只阻断新操作，不阻断旧租约收尾和显式存档回读。 */
  blockOperations(): () => void {
    const { carrier } = captureZeroLayerCarrier_ACU();
    const blocks = ZeroLayerStore_ACU.operationBlocks.get(carrier) ?? new Set<symbol>();
    const token = Symbol();
    blocks.add(token);
    ZeroLayerStore_ACU.operationBlocks.set(carrier, blocks);
    return () => {
      blocks.delete(token);
      if (!blocks.size && ZeroLayerStore_ACU.operationBlocks.get(carrier) === blocks) {
        ZeroLayerStore_ACU.operationBlocks.delete(carrier);
      }
    };
  }

  assertCanOperate(): void {
    const { carrier } = captureZeroLayerCarrier_ACU();
    if (ZeroLayerStore_ACU.operationBlocks.get(carrier)?.size) {
      throw new ZeroLayerError_ACU('mode-disabled', 'Việc tắt Tầng 0 chưa được xác nhận, hãy đọc lại bản lưu rõ ràng hoặc tắt lần nữa, cấm khởi động thao tác mới.');
    }
  }

  /** 同步派生读取；保存未知仍必须先恢复，不能把已回滚的内存当权威状态。 */
  readSnapshot(): ZeroLayerEnvelope_ACU | null {
    const context = captureZeroLayerCarrier_ACU();
    if (ZeroLayerStore_ACU.unknown.has(context.key)) {
      throw new ZeroLayerError_ACU('persist-unknown', 'Kết quả lưu Tầng 0 chưa rõ, hãy đọc lại để khôi phục trước.');
    }
    return readZeroLayerCarrier_ACU(context);
  }

  async read(): Promise<ZeroLayerEnvelope_ACU | null> {
    const context = captureZeroLayerCarrier_ACU();
    return this.enqueue(context, async () => {
      if (ZeroLayerStore_ACU.unknown.has(context.key)) {
        throw new ZeroLayerError_ACU('persist-unknown', 'Lần lưu trước chưa được xác nhận, hãy đọc lại để khôi phục trước.');
      }
      const current = readZeroLayerCarrier_ACU(context);
      await this.verifySource(context, current);
      if (!sameEnvelope_ACU(readZeroLayerCarrier_ACU(context), current)) {
        throw new ZeroLayerError_ACU('revision-conflict', 'Bản lưu của vật mang đã thay đổi trong lúc đọc.');
      }
      return current;
    });
  }

  commit(command: ZeroLayerCommand_ACU, expectedRevision: number | null): Promise<ZeroLayerEnvelope_ACU> {
    const context = captureZeroLayerCarrier_ACU();
    const snapshot = structuredClone(command);
    return this.enqueue(context, async () => {
      if (ZeroLayerStore_ACU.unknown.has(context.key)) {
        throw new ZeroLayerError_ACU('persist-unknown', 'Kết quả lưu chưa rõ, cấm thêm hoặc thử gửi lại.');
      }
      const current = readZeroLayerCarrier_ACU(context);
      if (current?.exitManifest) {
        throw new ZeroLayerError_ACU('mode-disabled', 'Journal thoát đã đóng băng lịch sử Tầng 0, hãy dùng khôi phục thoát rõ ràng, không được khởi động lại hoặc sửa bản lưu.');
      }
      if ((current?.revision ?? null) !== expectedRevision) {
        throw new ZeroLayerError_ACU('revision-conflict', 'Revision Tầng 0 đã thay đổi, hãy đọc lại.');
      }
      const fingerprint = await this.verifySource(context, current);
      const candidate = applyZeroLayerCommand_ACU(current, snapshot, context, fingerprint);
      return this.persist(context, current, candidate);
    });
  }

  /** 显式选择原 FloorRef；意图与完整候选均在同一 carrier 写队列内确认。 */
  exitToOrdinary(selection: ZeroLayerExitSelection_ACU, assertLease: () => void = () => {}): Promise<ZeroLayerEnvelope_ACU> {
    assertLease();
    const context = captureZeroLayerCarrier_ACU();
    const selected = structuredClone(selection);
    return this.enqueue(context, async () => {
      if (ZeroLayerStore_ACU.unknown.has(context.key)) {
        throw new ZeroLayerError_ACU('persist-unknown', 'Lưu thoát chưa được xác nhận, hãy đọc lại rõ ràng trước, cấm gửi lặp.');
      }
      const current = readZeroLayerCarrier_ACU(context);
      requireExit_ACU(current, 'Thoát thiếu vật mang Tầng 0 đã lưu.');
      await this.verifySource(context, current);
      const manifest = await buildZeroLayerExitCandidate_ACU(current,
        context.chat as Record<string, unknown>[], selected);
      assertLease();
      assertZeroLayerCarrier_ACU(context);
      assertBridgeConfig_ACU(context.chat, manifest.configFingerprint);
      requireExit_ACU(exitAssignmentsMatch_ACU(context.chat as Record<string, unknown>[], manifest.assignments, 'before'),
        'Trường thường đã thay đổi trong lúc phát lại ứng viên thoát.');
      const prepared = validateZeroLayerEnvelope_ACU({ ...current, revision: current.revision + 1, exitManifest: manifest });
      await this.persist(context, current, prepared);
      assertLease();
      return this.finishExitWithinQueue(context, prepared, assertLease);
    });
  }

  /** 先回读未知结果；只有已保存的意图才可继续，不重发任何模型请求。 */
  async recoverExit(assertLease: () => void = () => {}): Promise<ZeroLayerEnvelope_ACU> {
    assertLease();
    const recovered = await this.recover();
    assertLease();
    requireExit_ACU(recovered?.exitManifest, 'Máy chủ không có ý định thoát nào để tiếp tục.');
    if (recovered.exitManifest.phase === 'committed') return recovered;
    const context = captureZeroLayerCarrier_ACU();
    return this.enqueue(context, async () => {
      if (ZeroLayerStore_ACU.unknown.has(context.key)) {
        throw new ZeroLayerError_ACU('persist-unknown', 'Sau khi đọc lại lại xuất hiện lần lưu chưa rõ, cấm tiến hành thoát.');
      }
      const current = readZeroLayerCarrier_ACU(context);
      requireExit_ACU(sameEnvelope_ACU(current, recovered), 'Vật mang đã thay đổi sau khi đọc lại khi thoát.');
      return this.finishExitWithinQueue(context, recovered, assertLease);
    });
  }

  private async finishExitWithinQueue(context: ZeroLayerCarrierContext_ACU,
    prepared: ZeroLayerEnvelope_ACU, assertLease: () => void): Promise<ZeroLayerEnvelope_ACU> {
    assertLease();
    const journal = prepared.exitManifest;
    requireExit_ACU(journal?.phase === 'prepared' && !prepared.enabled, 'Thoát thiếu ý định prepared đã xác nhận.');
    await this.verifySource(context, prepared);
    assertLease();
    assertBridgeConfig_ACU(context.chat, journal.configFingerprint);
    requireExit_ACU(exitAssignmentsMatch_ACU(context.chat as Record<string, unknown>[], journal.assignments, 'before'),
      'Nguồn thường của ý định thoát đã thay đổi.');
    const candidate = validateZeroLayerEnvelope_ACU({ ...prepared, revision: prepared.revision + 1,
      exitManifest: { ...journal, phase: 'committed' } });
    return this.persist(context, prepared, candidate, { values: journal.assignments, beforeSide: 'before' });
  }

  /** 同一零层写队列内更新分支续写状态；不授予调用者改写正文或其他效果的权限。 */
  updateContinuation(
    sessionId: string, branchId: string,
    mutator: (current: ZeroLayerEnvelope_ACU) => ZeroLayerEnvelope_ACU,
    confirmation?: ContinuationLogicalRef_ACU,
  ): Promise<ZeroLayerEnvelope_ACU> {
    const context = captureZeroLayerCarrier_ACU();
    const ref = confirmation ? structuredClone(confirmation) : undefined;
    return this.enqueue(context, async () => {
      if (ZeroLayerStore_ACU.unknown.has(context.key)) {
        throw new ZeroLayerError_ACU('persist-unknown', 'Kết quả lưu viết tiếp chưa rõ, hãy đọc lại để khôi phục trước.');
      }
      const current = readZeroLayerCarrier_ACU(context);
      if (!current?.enabled || current.sessionId !== sessionId || current.activeBranchId !== branchId) {
        throw new ZeroLayerError_ACU('scope-changed', 'Phiên hoặc nhánh Tầng 0 của viết tiếp đã thay đổi.');
      }
      const checkpoints = current.branches.find(branch => branch.branchId === branchId)!.checkpoints;
      if (checkpoints?.pending || checkpoints?.cleanupPending) {
        throw new ZeroLayerError_ACU('effects-pending', 'Gửi checkpoint chưa kết thúc, cấm sửa nguồn viết tiếp.');
      }
      await this.verifySource(context, current);
      let base = current;
      let alreadyConfirmed = false;
      if (ref) {
        const turn = current.turns.find(item => item.turnId === ref.turnId && item.attemptId === ref.attemptId);
        if (ref.sessionId !== sessionId || ref.branchId !== branchId
          || !turn?.continuationIdentity || turn.branchId !== branchId
          || turn.assistantFloor.floorId !== ref.floorId
          || !['response-durable', 'effects-durable', 'published'].includes(turn.phase)) {
          throw new ZeroLayerError_ACU('revision-conflict', 'Xác nhận gộp thiếu nội dung logic đã lưu của nhánh này.');
        }
        const state = current.branches.find(branch => branch.branchId === branchId)!.continuation;
        alreadyConfirmed = !!state?.confirmed.some(item => item.turnId === ref.turnId);
        if (alreadyConfirmed) {
          validateZeroLayerContinuationReceipt_ACU(turn, sessionId);
        } else {
          const identity = turn.continuationIdentity;
          const pending = state?.envelope?.activeTask?.pendingHostTurn;
          const capturedRef = pending?.capture.logicalRef;
          if (turn.phase !== 'response-durable' || state?.envelope?.activeTask?.status !== 'running'
            || pending?.status !== 'awaiting_generation'
            || identity.chatIdentity !== JSON.stringify(['zero-layer-continuation', context.key, sessionId, branchId])
            || !(['chatIdentity', 'taskId', 'stageId', 'revision', 'nodeId', 'turnId', 'attemptId'] as const)
              .every(key => pending.identity[key] === identity[key])
            || !capturedRef || !(['sessionId', 'branchId', 'turnId', 'attemptId', 'floorId'] as const)
              .every(key => capturedRef[key] === ref[key])
            || turn.effectReceipts.some(item => item.kind === 'continuation')) {
            throw new ZeroLayerError_ACU('revision-conflict', 'Xác nhận gộp không thuộc lượt chờ viết tiếp hiện tại.');
          }
          const result = { floorId: ref.floorId, identity };
          // 仅组合内存候选；游标、通告与回执通过最终的一次 carrier 保存提交。
          base = applyZeroLayerCommand_ACU(current, {
            type: 'record-effect', turnId: turn.turnId, attemptId: turn.attemptId,
            receipt: { effectId: JSON.stringify([sessionId, turn.turnId, turn.attemptId, 'continuation']),
              kind: 'continuation', status: 'durable', fingerprint: getTableDataFingerprint_ACU(result) },
            assistantData: { continuation: result },
          }, context, current.activationFingerprint);
        }
      }
      const candidate = validateZeroLayerEnvelope_ACU(mutator(structuredClone(base)));
      const strip = (value: ZeroLayerEnvelope_ACU) => {
        const copy = structuredClone(value);
        delete copy.branches.find(branch => branch.branchId === branchId)!.continuation;
        return copy;
      };
      if (!sameEnvelope_ACU(strip(base), strip(candidate))) {
        throw new ZeroLayerError_ACU('invalid-transition', 'Cổng ghi viết tiếp chỉ được cập nhật trạng thái viết tiếp của nhánh hiện tại.');
      }
      const beforeFrames = base.branches.find(branch => branch.branchId === branchId)!.continuation?.moduleFrames ?? {};
      const afterFrames = candidate.branches.find(branch => branch.branchId === branchId)!.continuation?.moduleFrames ?? {};
      if (getTableDataFingerprint_ACU(beforeFrames) !== getTableDataFingerprint_ACU(afterFrames)) {
        throw new ZeroLayerError_ACU('invalid-transition', 'Lập kế hoạch viết tiếp chỉ được cập nhật khung làm việc của nhánh, không được ghi đè khung tài liệu đã niêm phong hoặc tiền tố chung.');
      }

      if (ref) {
        const state = candidate.branches.find(branch => branch.branchId === branchId)!.continuation;
        if (!state?.confirmed.some(item => item.turnId === ref.turnId)
          || (!alreadyConfirmed && state.envelope?.activeTask?.pendingHostTurn != null)) {
          throw new ZeroLayerError_ACU('invalid-transition', 'Xác nhận gộp phải đồng thời lưu tham chiếu xác nhận và kết thúc lượt chờ.');
        }
        if (alreadyConfirmed && !sameEnvelope_ACU(current, candidate)) {
          throw new ZeroLayerError_ACU('invalid-transition', 'Xác nhận lặp không được tiến thêm trạng thái viết tiếp.');
        }
        return this.persist(context, current, candidate);
      }
      if (sameEnvelope_ACU(current, candidate)) return current;
      candidate.revision += 1;
      return this.persist(context, current, validateZeroLayerEnvelope_ACU(candidate));
    });
  }

  /** 推演只拥有当前分支的独立状态；沿用严格保存、回读与保存未知门禁。 */
  updateSimulation(
    sessionId: string, branchId: string,
    mutator: (current: ZeroLayerEnvelope_ACU) => ZeroLayerEnvelope_ACU,
    effect?: Extract<ZeroLayerCommand_ACU, { type: 'record-effect' }>
      | ((candidate: ZeroLayerEnvelope_ACU) => Extract<ZeroLayerCommand_ACU, { type: 'record-effect' }> | undefined),
  ): Promise<ZeroLayerEnvelope_ACU> {
    const context = captureZeroLayerCarrier_ACU();
    return this.enqueue(context, async () => {
      if (ZeroLayerStore_ACU.unknown.has(context.key)) {
        throw new ZeroLayerError_ACU('persist-unknown', 'Kết quả lưu mô phỏng chưa rõ, hãy đọc lại để khôi phục trước.');
      }
      const current = readZeroLayerCarrier_ACU(context);
      if (!current?.enabled || current.sessionId !== sessionId || current.activeBranchId !== branchId) {
        throw new ZeroLayerError_ACU('scope-changed', 'Phiên hoặc nhánh Tầng 0 của mô phỏng đã thay đổi.');
      }
      const checkpoints = current.branches.find(branch => branch.branchId === branchId)!.checkpoints;
      if (checkpoints?.pending || checkpoints?.cleanupPending) {
        throw new ZeroLayerError_ACU('effects-pending', 'Gửi checkpoint chưa kết thúc, cấm sửa nguồn mô phỏng.');
      }
      await this.verifySource(context, current);
      const candidate = mutator(structuredClone(current));
      const strip = (value: ZeroLayerEnvelope_ACU) => {
        const copy = structuredClone(value);
        delete copy.branches.find(branch => branch.branchId === branchId)!.simulation;
        return copy;
      };
      if (!sameEnvelope_ACU(strip(current), strip(candidate))) {
        throw new ZeroLayerError_ACU('invalid-transition', 'Cổng ghi mô phỏng chỉ được cập nhật trạng thái mô phỏng của nhánh hiện tại.');
      }
      const receipt = typeof effect === 'function' ? effect(structuredClone(candidate)) : effect;
      if (receipt) {
        if (receipt.receipt.kind !== 'simulation' || receipt.userData !== undefined
          || !receipt.assistantData || Object.keys(receipt.assistantData).some(key => key !== 'simulation')) {
          throw new ZeroLayerError_ACU('invalid-transition', 'Gửi gộp mô phỏng chỉ cho phép biên nhận mô phỏng của lượt này.');
        }
        const repeated = current.turns.find(turn => turn.turnId === receipt.turnId)?.effectReceipts
          .some(item => item.kind === 'simulation');
        if (repeated && !sameEnvelope_ACU(current, candidate)) {
          throw new ZeroLayerError_ACU('invalid-transition', 'Xác nhận mô phỏng lặp không được tiến thêm trạng thái nhánh.');
        }
        const turn = candidate.turns.find(item => item.turnId === receipt.turnId && item.branchId === branchId);
        if (!turn) throw new ZeroLayerError_ACU('revision-conflict', 'Biên nhận mô phỏng không thuộc nhánh hiện tại.');
        const changed = mergeZeroLayerEffectReceipt_ACU(turn, structuredClone(receipt));
        if (!changed && sameEnvelope_ACU(current, candidate)) return current;
        candidate.revision += 1;
        return this.persist(context, current, validateZeroLayerEnvelope_ACU(candidate));
      }
      if (sameEnvelope_ACU(current, candidate)) return current;
      candidate.revision += 1;
      return this.persist(context, current, validateZeroLayerEnvelope_ACU(candidate));
    });
  }

  private async verifySource(context: ZeroLayerCarrierContext_ACU, current: ZeroLayerEnvelope_ACU | null): Promise<string> {
    const source = current?.exitManifest?.phase === 'committed'
      ? physicalHistorySnapshot_ACU(context.chat.slice(0, current.activationMessageCount)) : context.source;
    const fingerprint = await physicalHistoryFingerprint_ACU(source);
    assertZeroLayerCarrier_ACU(context);
    if (current && current.activationFingerprint !== fingerprint) {
      throw new ZeroLayerError_ACU('source-changed', 'Dấu vân tay lịch sử nguồn vật lý lúc bật Tầng 0 đã thay đổi.');
    }
    const bridge = current?.branches.find(branch => branch.branchId === current.activeBranchId)?.bridge;
    if (bridge && bridge.phase !== 'reconciled') {
      assertBridgeSource_ACU(context.chat, bridge.sourceFingerprint);
      assertBridgeConfig_ACU(context.chat, bridge.configFingerprint);
    }
    return fingerprint;
  }

  /** 设置展示专用服务器快照；不替换本地字段、不通知、不解除未知保存。 */
  readPersistedSnapshot(): Promise<ZeroLayerEnvelope_ACU | null> {
    const context = captureZeroLayerCarrier_ACU();
    return this.enqueue(context, async () => {
      const assertKnown = () => {
        if (ZeroLayerStore_ACU.unknown.has(context.key)) {
          throw new ZeroLayerError_ACU('persist-unknown', 'Kết quả lưu chưa rõ, hãy dùng khôi phục rõ ràng; việc đọc trạng thái không gỡ được chốt chặn.');
        }
      };
      assertKnown();
      const beforeRaw = context.carrier[ZERO_LAYER_CARRIER_FIELD_ACU];
      const before = structuredClone(readZeroLayerCarrier_ACU(context));
      const messages = await readChatFromHostStrict_ACU();
      assertZeroLayerCarrier_ACU(context);
      assertKnown();
      if (physicalHistorySnapshot_ACU(messages) !== context.source) {
        throw new ZeroLayerError_ACU('source-changed', 'Lịch sử vật lý trên máy chủ không khớp cuộc trò chuyện hiện tại, không thể hiển thị là tắt mặc định.');
      }
      const persisted = readZeroLayerCarrier_ACU({ ...context, chat: messages,
        carrier: messages[context.carrierIndex] });
      await this.verifySource(context, persisted);
      assertKnown();
      if (context.carrier[ZERO_LAYER_CARRIER_FIELD_ACU] !== beforeRaw
        || !sameEnvelope_ACU(readZeroLayerCarrier_ACU(context), before)) {
        throw new ZeroLayerError_ACU('revision-conflict', 'Vật mang cục bộ đã thay đổi trong lúc đọc trạng thái, hãy đọc lại.');
      }
      return structuredClone(persisted);
    });
  }

  /** 普通生命周期回读服务器权威快照；无权解除未知保存门禁。 */
  readPersisted(): Promise<ZeroLayerEnvelope_ACU | null> {
    return this.loadPersisted(false);
  }

  /** 保存未知后只回读；不重发模型、不盲目回滚服务器。 */
  recover(): Promise<ZeroLayerEnvelope_ACU | null> {
    return this.loadPersisted(true);
  }

  private loadPersisted(resolveUnknown: boolean): Promise<ZeroLayerEnvelope_ACU | null> {
    const context = captureZeroLayerCarrier_ACU();
    return this.enqueue(context, async () => {
      const pending = ZeroLayerStore_ACU.unknown.get(context.key);
      // 检查与回读共用写队列，不能由队列外的先读绕过新出现的未知保存。
      if (pending && !resolveUnknown) {
        throw new ZeroLayerError_ACU('persist-unknown', 'Lần lưu trước chưa được xác nhận, bật/tắt không thể thay thế khôi phục rõ ràng.');
      }
      const beforeRaw = context.carrier[ZERO_LAYER_CARRIER_FIELD_ACU];
      const messages = await readChatFromHostStrict_ACU();
      assertZeroLayerCarrier_ACU(context);
      if (physicalHistorySnapshot_ACU(messages) !== context.source
        || (pending && pending.source !== context.source)) {
        throw new ZeroLayerError_ACU('source-changed', 'Lịch sử vật lý trên máy chủ không khớp vật mang hiện tại, từ chối ghi khôi phục.');
      }
      const carrier = messages[context.carrierIndex];
      const persisted = readZeroLayerCarrier_ACU({ ...context, chat: messages, carrier });
      const persistedBridge = persisted?.branches.find(branch => branch.branchId === persisted.activeBranchId)?.bridge;
      const pendingBridge = pending?.candidate.branches.find(branch => branch.branchId === pending.candidate.activeBranchId)?.bridge;
      const previousBridge = pending?.before?.branches.find(branch => branch.branchId === pending.before!.activeBranchId)?.bridge;
      const recoveringMigration = pendingBridge && (pendingBridge.phase !== 'reconciled'
        || previousBridge?.phase !== 'reconciled' || pending!.candidate.enabled && !pending!.before?.enabled);
      const bridge = recoveringMigration ? pendingBridge : persistedBridge?.phase !== 'reconciled' ? persistedBridge : undefined;
      if (bridge) {
        // 不替换 chat[] 或旧字段；服务器与本地必须各自匹配冻结来源，才能清除未知保存状态。
        assertBridgeSource_ACU(messages, bridge.sourceFingerprint);
        assertBridgeSource_ACU(context.chat, bridge.sourceFingerprint);
        assertBridgeConfig_ACU(messages, bridge.configFingerprint);
        assertBridgeConfig_ACU(context.chat, bridge.configFingerprint);
      }
      await this.verifySource(context, persisted);
      if (context.carrier[ZERO_LAYER_CARRIER_FIELD_ACU] !== beforeRaw) {
        throw new ZeroLayerError_ACU('revision-conflict', 'Bản lưu của vật mang đã thay đổi trong lúc đọc lại.');
      }
      if (pending && !sameEnvelope_ACU(persisted, pending.candidate)
        && !sameEnvelope_ACU(persisted, pending.before)) {
        throw new ZeroLayerError_ACU('revision-conflict', 'Bản lưu trên máy chủ không phải snapshot gốc cũng không phải ứng viên lần này, cần xác nhận thủ công.');
      }
      const journal = pending?.candidate.exitManifest ?? persisted?.exitManifest;
      if (journal) {
        const chat = context.chat as Record<string, unknown>[];
        const localBefore = exitAssignmentsMatch_ACU(chat, journal.assignments, 'before');
        const localAfter = exitAssignmentsMatch_ACU(chat, journal.assignments, 'after');
        if (pending?.assignments) {
          const side = sameEnvelope_ACU(persisted, pending.candidate) ? 'after' : pending.assignments.beforeSide;
          requireExit_ACU(exitAssignmentsMatch_ACU(messages, journal.assignments, side)
            && (localBefore || localAfter), 'Đọc lại sau khi lưu thoát không phải trạng thái cũ đầy đủ hay ứng viên đầy đủ.');
          applyExitAssignments_ACU(chat, journal.assignments, side);
        } else if (persisted?.exitManifest?.phase === 'prepared') {
          requireExit_ACU(exitAssignmentsMatch_ACU(messages, journal.assignments, 'before') && localBefore,
            'Nguồn thường của ý định thoát đã thay đổi.');
        } else if (persisted?.exitManifest?.phase === 'committed') {
          // 已有普通后缀时基线允许沿普通写口演化，不能把旧 assignments 再写回。
          requireExit_ACU(pending ? exitAssignmentsMatch_ACU(messages, journal.assignments, 'after') && localAfter
            : JSON.stringify(messages) === JSON.stringify(context.chat), 'Đọc lại bản lưu thoát không khớp với toàn bộ cuộc trò chuyện hiện tại.');
        } else {
          requireExit_ACU(exitAssignmentsMatch_ACU(messages, journal.assignments, 'before') && localBefore,
            'Ý định thoát chưa được lưu, nhưng nguồn thường đã thay đổi.');
        }
      }
      if (persisted === null) delete context.carrier[ZERO_LAYER_CARRIER_FIELD_ACU];
      else context.carrier[ZERO_LAYER_CARRIER_FIELD_ACU] = structuredClone(persisted);
      if (resolveUnknown) ZeroLayerStore_ACU.unknown.delete(context.key);
      if (persisted) notifyZeroLayerChanges_ACU(null, persisted, 'snapshot');
      return persisted;
    });
  }

  private async persist(
    context: ZeroLayerCarrierContext_ACU,
    before: ZeroLayerEnvelope_ACU | null,
    candidate: ZeroLayerEnvelope_ACU,
    assignments?: PendingPersistence_ACU['assignments'],
  ): Promise<ZeroLayerEnvelope_ACU> {
    assertZeroLayerCarrier_ACU(context);
    const chat = context.chat as Record<string, unknown>[];
    const journal = candidate.exitManifest;
    const verifyExit = (side: 'before' | 'after') => {
      if (!journal) return;
      assertBridgeConfig_ACU(context.chat, journal.configFingerprint);
      requireExit_ACU(exitAssignmentsMatch_ACU(chat, journal.assignments, side), 'Trường lưu thoát không khớp với tập ghi đã đóng băng.');
    };
    verifyExit(assignments?.beforeSide ?? (journal?.phase === 'committed' ? 'after' : 'before'));
    if (!sameEnvelope_ACU(readZeroLayerCarrier_ACU(context), before)) {
      throw new ZeroLayerError_ACU('revision-conflict', 'Bản lưu của vật mang đã thay đổi trước khi lưu.');
    }
    if (sameEnvelope_ACU(before, candidate)) return structuredClone(candidate);
    const bridge = candidate.branches.find(branch => branch.branchId === candidate.activeBranchId)?.bridge;
    const previousBridge = before?.branches.find(branch => branch.branchId === before.activeBranchId)?.bridge;
    // Reconcile 和首次启用的保存窗口同样受保护；正常逻辑工作不重新读取旧基底。
    const verifyBridge = () => {
      if (bridge && (bridge.phase !== 'reconciled' || previousBridge?.phase !== 'reconciled'
        || candidate.enabled && !before?.enabled)) {
        assertBridgeSource_ACU(context.chat, bridge.sourceFingerprint);
        assertBridgeConfig_ACU(context.chat, bridge.configFingerprint);
      }
    };
    verifyBridge();
    const previousRaw = context.carrier[ZERO_LAYER_CARRIER_FIELD_ACU];
    const existed = Object.prototype.hasOwnProperty.call(context.carrier, ZERO_LAYER_CARRIER_FIELD_ACU);
    const releaseCandidate = isolateZeroLayerCarrierCandidate_ACU(context, before);
    context.carrier[ZERO_LAYER_CARRIER_FIELD_ACU] = candidate;
    try {
      if (assignments) applyExitAssignments_ACU(chat, assignments.values, 'after');
      await saveChatToHostStrict_ACU({ verify: true });
      assertZeroLayerCarrier_ACU(context);
      verifyBridge();
      verifyExit(journal?.phase === 'committed' ? 'after' : 'before');
      const confirmed = readZeroLayerCarrierCandidate_ACU(context);
      if (!sameEnvelope_ACU(confirmed, candidate)) {
        throw new ZeroLayerError_ACU('revision-conflict', 'Bản lưu của vật mang đã thay đổi sau khi xác nhận lưu.');
      }
      releaseCandidate();
      notifyZeroLayerChanges_ACU(before, candidate);
      return structuredClone(candidate);
    } catch (error) {
      if (assignments && exitAssignmentsMatch_ACU(chat, assignments.values, 'after')) {
        applyExitAssignments_ACU(chat, assignments.values, assignments.beforeSide);
      }
      if (context.carrier[ZERO_LAYER_CARRIER_FIELD_ACU] === candidate) {
        if (existed) context.carrier[ZERO_LAYER_CARRIER_FIELD_ACU] = previousRaw;
        else delete context.carrier[ZERO_LAYER_CARRIER_FIELD_ACU];
      }
      if (error instanceof HostChatSaveNotStartedError_ACU) {
        throw new ZeroLayerError_ACU('persist-failed', 'Host chưa bắt đầu lưu, trường Tầng 0 đã được khôi phục.');
      }
      ZeroLayerStore_ACU.unknown.set(context.key, {
        before: structuredClone(before), candidate: structuredClone(candidate), source: context.source,
        ...(assignments ? { assignments: structuredClone(assignments) } : {}),
      });
      throw new ZeroLayerError_ACU('persist-unknown', 'Kết quả lưu Tầng 0 chưa được xác nhận; cấm tiếp tục gửi, hãy đọc lại từ máy chủ để khôi phục.');
    } finally {
      releaseCandidate();
    }
  }

  private enqueue<T>(context: ZeroLayerCarrierContext_ACU, operation: () => Promise<T>): Promise<T> {
    const previous = ZeroLayerStore_ACU.tails.get(context.key) ?? Promise.resolve();
    const result = previous.then(() => {
      assertZeroLayerCarrier_ACU(context);
      return operation();
    });
    const settled: Promise<void> = result.then((): void => undefined, (): void => undefined);
    ZeroLayerStore_ACU.tails.set(context.key, settled);
    void settled.then(() => {
      if (ZeroLayerStore_ACU.tails.get(context.key) === settled) ZeroLayerStore_ACU.tails.delete(context.key);
    });
    return result;
  }
}

function sameEnvelope_ACU(left: ZeroLayerEnvelope_ACU | null, right: ZeroLayerEnvelope_ACU | null): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

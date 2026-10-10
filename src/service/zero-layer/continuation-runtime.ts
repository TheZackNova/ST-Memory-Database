import type { ContinuationRuntime_ACU } from '../continuation/continuation-runtime';
import { ContinuationOrchestrator_ACU, type ContinuationPlanningContext_ACU } from '../continuation/continuation-orchestrator';
import { ContinuationOutlinePlanner_ACU } from '../continuation/outline-planner';
import { StageExecutionEngine_ACU, type ContinuationPreparedTurnInstruction_ACU } from '../continuation/stage-execution-engine';
import { ContinuationAgentTurnPlanner_ACU } from '../continuation/agent/agent-main-loop';
import { applyAgentUserRequirementsReplace_ACU } from '../continuation/agent/agent-user-requirements';
import { renderAgentConversationMessages_ACU } from '../continuation/agent/agent-conversation-store';
import type { ContinuationAgentTurnPlanRequest_ACU } from '../continuation/agent/agent-model';
import type { ContinuationSettings_ACU, ContinuationLogicalRef_ACU, TurnAttemptIdentity_ACU } from '../continuation/model';
import type { ContinuationPromptPlaceholder_ACU } from '../continuation/prompt-template';
import { loadZeroLayerRuntimeForPage_ACU } from '../../presentation/bootstrap/zero-layer-bootstrap';
import { ZeroLayerContinuationStore_ACU, emptyZeroLayerContinuation_ACU } from './continuation-store';
import { createZeroLayerContinuationAgentStorage_ACU, clearZeroLayerContinuationModules_ACU } from './continuation-agent-storage';
import { getZeroLayerRuntime_ACU } from './runtime';
import { ZeroLayerError_ACU } from './model';
import { logAgentSession_ACU } from '../continuation/agent/agent-session-log';
import { getContinuationGenerationDebug_ACU, continuationDebugErrorType_ACU, type ContinuationGenerationDebug_ACU } from '../continuation/generation-debug';

type Storage_ACU = NonNullable<ContinuationAgentTurnPlanRequest_ACU['storage']>;
interface Dependencies_ACU {
  allocateId: (prefix: string) => string;
  buildSettings: () => ContinuationSettings_ACU;
  onSettingsReplaced: (settings: ContinuationSettings_ACU) => void;
  createOutlineResolvers: (context: ContinuationPlanningContext_ACU, storage: Storage_ACU) =>
    Partial<Record<ContinuationPromptPlaceholder_ACU, () => string | Promise<string>>>;
}

/** 逻辑正文独占发送链；不登记宿主生成桥，也不持有输入框或物理楼层写权限。 */
export function createZeroLayerContinuationRuntime_ACU(dependencies: Dependencies_ACU): ContinuationRuntime_ACU {
  const store = new ZeroLayerContinuationStore_ACU();
  const zero = getZeroLayerRuntime_ACU();
  const listeners = new Set<() => void>();
  let disposed = false;
  let sending = false;
  let activeDebug: ContinuationGenerationDebug_ACU | undefined;
  let autoContinueTimer: ReturnType<typeof setTimeout> | null = null;
  let autoContinueEpoch = 0;
  const cancelAutoContinue = () => {
    autoContinueEpoch += 1;
    if (autoContinueTimer !== null) clearTimeout(autoContinueTimer);
    autoContinueTimer = null;
  };
  const assertCurrent = () => {
    if (disposed) throw new ZeroLayerError_ACU('scope-changed', 'Runtime viết tiếp Tầng 0 đã mất hiệu lực.');
    store.readSource();
  };
  const notify = () => { for (const listener of listeners) listener(); };
  const storage = (signal?: AbortSignal | null) => {
    assertCurrent();
    return createZeroLayerContinuationAgentStorage_ACU(store, signal);
  };
  const executionEngine = new StageExecutionEngine_ACU({
    readEnvelope: () => store.readPersisted(),
    getChatIdentity: () => { assertCurrent(); return store.getChatIdentity(); },
    allocateId: dependencies.allocateId,
    planner: new ContinuationAgentTurnPlanner_ACU(),
    prepareStorage: async signal => storage(signal),
  });
  const orchestrator = new ContinuationOrchestrator_ACU({
    store,
    logicalHistory: store,
    executionEngine,
    planner: new ContinuationOutlinePlanner_ACU(),
    getChatIdentity: () => { assertCurrent(); return store.getChatIdentity(); },
    assertCanOperate: () => zero.store.assertCanOperate(),
    now: () => Date.now(),
    allocateId: dependencies.allocateId,
    createOutlineResolvers: context => dependencies.createOutlineResolvers(context, storage()),
    createOutlineHistory: () => {
      const adapter = storage();
      return renderAgentConversationMessages_ACU(adapter.readConversation(adapter.readChat()));
    },
    hasLiveHostClaim: identity => sending && identity === store.getChatIdentity(),
    buildFallbackSettings: dependencies.buildSettings,
    onSettingsReplaced: dependencies.onSettingsReplaced,
    appendAgentConversation: appends => store.appendConversation(appends),
    seedAgentUserRequirements: async text => {
      const adapter = storage();
      const chat = adapter.readChat();
      const snapshot = adapter.readModuleSnapshot(chat);
      if (!text.trim() || snapshot.userRequirements.length) return;
      await adapter.writeModuleSnapshot(chat, chat.length - 1,
        applyAgentUserRequirementsReplace_ACU(snapshot, [text.trim()]));
    },
    clearAgentModules: () => clearZeroLayerContinuationModules_ACU(store),
    clearAgentConversation: async () => {
      store.assertCanContinue();
      const changed = store.readState().conversation.segment.length > 0
        || store.readState().conversation.compaction !== undefined;
      if (changed) await store.updateState(state => {
        state.conversation = emptyZeroLayerContinuation_ACU().conversation;
      });
      return changed;
    },
  });
  const unregister = zero.registerContinuationSettlement(async (envelope, turnId, attemptId, signal) => {
    assertCurrent();
    if (signal.aborted) throw new ZeroLayerError_ACU('scope-changed', 'Xác nhận viết tiếp đã bị hủy.');
    const turn = envelope.turns.find(item => item.turnId === turnId && item.attemptId === attemptId);
    if (!turn || envelope.sessionId !== store.sessionId || turn.branchId !== store.branchId) {
      throw new ZeroLayerError_ACU('revision-conflict', 'Nội dung chính viết tiếp không thuộc runtime hiện tại.');
    }
    await orchestrator.confirmLogicalTurn({ sessionId: envelope.sessionId, branchId: turn.branchId,
      turnId, attemptId, floorId: turn.assistantFloor.floorId });
    notify();
  });
  // 确认仍在结算链内；只有提交返回、正文已发布后才安排下一轮。
  const pauseFailure = async (error: unknown, identity: TurnAttemptIdentity_ACU, ref?: ContinuationLogicalRef_ACU) => {
    // 保存状态不确定或会话失效时不尝试再写；原错误与严格回读门禁保持权威。
    if (disposed || (error instanceof ZeroLayerError_ACU
      && ['persist-unknown', 'persist-failed', 'scope-changed', 'source-changed'].includes(error.code))) return;
    assertCurrent();
    await store.pauseTurnFailure(identity, ref);
  };

  const scheduleAutoContinue = () => {
    cancelAutoContinue();
    const state = orchestrator.readAutoContinueState();
    if (disposed || !state.eligible) return;
    const epoch = autoContinueEpoch;
    const taskId = store.readPersisted()?.activeTask?.taskId;
    const headTurnId = store.anchor().logicalAnchor.headTurnId;
    autoContinueTimer = setTimeout(async () => {
      autoContinueTimer = null;
      try {
        if (disposed || sending || epoch !== autoContinueEpoch) return;
        assertCurrent();
        if (store.readPersisted()?.activeTask?.taskId !== taskId
          || store.anchor().logicalAnchor.headTurnId !== headTurnId
          || !orchestrator.readAutoContinueState().eligible) return;
        const continuation = continueTask();
        const continuationEpoch = autoContinueEpoch;
        const result = await continuation;
        if (disposed || continuationEpoch !== autoContinueEpoch) return;
        assertCurrent();
        if (result.preparedTurn) await send(result.preparedTurn);
      } catch {
        if (!disposed) logAgentSession_ACU({ kind: 'run_failed', title: 'Tự động viết tiếp đã tạm dừng',
          detail: 'Nội dung chính logic hoặc phần chuẩn bị viết tiếp chưa hoàn tất, tiến độ đã được giữ lại; hãy kiểm tra trạng thái tác vụ rồi tiếp tục rõ ràng.', ok: false });
      } finally {
        if (!disposed) notify();
      }
    }, state.delaySeconds * 1_000);
  };
  const send = async (prepared: ContinuationPreparedTurnInstruction_ACU): Promise<boolean> => {
    const debug = getContinuationGenerationDebug_ACU(prepared);
    debug.step('logical_entered', { mode: 'logical', chars: prepared.instruction.instruction.length });
    try {
      assertCurrent();
      if (sending) throw new ZeroLayerError_ACU('pending-turn', 'Viết tiếp Tầng 0 đã có nội dung chính đang chạy.');
    } catch (error) {
      debug.finish('failed', { reason: 'pending_snapshot', errorType: continuationDebugErrorType_ACU(error) }, false);
      throw error;
    }
    const frozen = structuredClone(prepared);
    if (frozen.identity.chatIdentity !== store.getChatIdentity()) {
      debug.finish('failed', { reason: 'chat_mismatch' }, false);
      throw new ZeroLayerError_ACU('scope-changed', 'Kết quả lập kế hoạch không thuộc viết tiếp Tầng 0 hiện tại.');
    }
    cancelAutoContinue();
    sending = true;
    let published = false;
    let logicalRef: ContinuationLogicalRef_ACU | undefined;
    activeDebug = debug;
    debug.setScope(() => !disposed && activeDebug === debug && store.getChatIdentity() === frozen.identity.chatIdentity);
    debug.watch(() => sending && !disposed);
    try {
      debug.step('logical_loading');
      await loadZeroLayerRuntimeForPage_ACU();
      assertCurrent();
      debug.step('logical_preparing');
      await zero.submit(frozen.instruction.instruction, ['table'], frozen.identity, async ref => {
        assertCurrent();
        logicalRef = ref;
        await orchestrator.recordLogicalTurn(frozen.identity, ref);
        debug.step('logical_recorded');
        notify();
      });
      assertCurrent();
      published = true;
      debug.finish('logical_published');
      return true;
    } catch (error) {
      debug.finish('failed', { reason: 'exception', errorType: continuationDebugErrorType_ACU(error) }, false);
      await pauseFailure(error, frozen.identity, logicalRef);
      throw error;
    } finally {
      sending = false;
      if (activeDebug === debug) activeDebug = undefined;
      notify();
      if (published) scheduleAutoContinue();
    }
  };

  /** 显式继续先回读持久结果：正文已保存只补结算，未知发送绝不重发。 */
  const continueTask: ContinuationRuntime_ACU['continueTask'] = async () => {
    if (disposed) throw new ZeroLayerError_ACU('scope-changed', 'Runtime viết tiếp Tầng 0 đã mất hiệu lực.');
    if (sending) throw new ZeroLayerError_ACU('pending-turn', 'Viết tiếp Tầng 0 đã có nội dung chính đang chạy.');
    zero.store.assertCanOperate();
    cancelAutoContinue();
    await zero.store.readPersisted();
    assertCurrent();
    let source = store.readSource();
    const checkpoints = source.branches.find(branch => branch.branchId === store.branchId)!.checkpoints;
    if (checkpoints?.pending || checkpoints?.cleanupPending) {
      await zero.recoverCheckpoints();
      assertCurrent();
      source = store.readSource();
    }
    const turn = source.turns.find(item => item.branchId === store.branchId
      && !['published', 'failed', 'cancelled'].includes(item.phase));
    if (!turn) return orchestrator.continueTask();
    if (!turn.continuationIdentity
      || turn.continuationIdentity.taskId !== store.readPersisted()?.activeTask?.taskId) {
      throw new ZeroLayerError_ACU('pending-turn', 'Lượt logic chưa quyết toán không thuộc viết tiếp hiện tại, hãy khôi phục lượt gốc.');
    }
    sending = true;
    const ref = { sessionId: source.sessionId, branchId: turn.branchId, turnId: turn.turnId,
      attemptId: turn.attemptId, floorId: turn.assistantFloor.floorId };
    let published = false;
    try {
      if (['response-durable', 'effects-durable'].includes(turn.phase)) {
        const confirmed = store.readState().confirmed.some(item => item.turnId === turn.turnId);
        if (!confirmed) {
          await orchestrator.recordLogicalTurn(turn.continuationIdentity, ref, true);
        }
        await zero.recoverSettlement(turn.turnId, turn.attemptId);
      } else if (turn.phase === 'prepared' && turn.plotCandidate) {
        await loadZeroLayerRuntimeForPage_ACU();
        assertCurrent();
        await zero.resumePrepared(turn.turnId, turn.attemptId, ref =>
          orchestrator.recordLogicalTurn(turn.continuationIdentity!, ref, true));
      } else {
        throw new ZeroLayerError_ACU('pending-turn', 'Kết quả gửi nội dung chính chưa rõ hoặc chuẩn bị chưa xong; cấm yêu cầu lại mô hình, hãy kiểm tra lượt gốc.');
      }
      assertCurrent();
      await store.clearPublishedTurnFailure(turn.continuationIdentity, ref);
      const envelope = store.readPersisted();
      if (!envelope?.activeTask) throw new ZeroLayerError_ACU('corrupt-data', 'Thiếu tác vụ viết tiếp sau khi khôi phục.');
      published = true;
      return { envelope, task: envelope.activeTask };
    } catch (error) {
      await pauseFailure(error, turn.continuationIdentity, ref);
      throw error;
    } finally {
      sending = false;
      notify();
      if (published) scheduleAutoContinue();
    }
  };

  const unregisterStop = zero.registerContinuationStop(async () => {
    if (disposed) return;
    cancelAutoContinue();
    await orchestrator.interrupt();
    assertCurrent();
    cancelAutoContinue();
  });

  return {
    mode: 'logical', orchestrator, bridge: null,
    continueTask, send,
    retryHostGeneration: async () => {
      throw new ZeroLayerError_ACU('invalid-transition', 'Nội dung chính Tầng 0 không dùng gửi lại vật lý của SillyTavern, hãy khôi phục lượt đã lưu bằng cách tiếp tục.');
    },
    stopGeneration: () => { activeDebug?.finish('stopped', { reason: 'user_stopped' }); cancelAutoContinue(); zero.cancel(); },
    subscribeStateChanges: listener => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    initialize: async () => {
      if (disposed) throw new ZeroLayerError_ACU('scope-changed', 'Runtime viết tiếp Tầng 0 đã mất hiệu lực.');
      zero.store.assertCanOperate();
      await zero.store.readPersisted();
      assertCurrent();
      return store.read();
    },
    read: () => {
      assertCurrent();
      return sending ? store.readPersisted() : store.read();
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      activeDebug?.cancel();
      cancelAutoContinue();
      if (sending) zero.cancel();
      unregister();
      unregisterStop();
      listeners.clear();
    },
  };
}

import { settings_ACU } from '../runtime/state-manager';
import { callAIWithResolvedPreset_ACU, getApiConfigByPreset_ACU, requireResolvedApiPreset_ACU } from '../ai/api-call';
import { runPlotTasksRuntime_ACU } from '../runtime/plot-runtime/plot-task-engine';
import type { PlotRequestContext_ACU } from '../runtime/plot-runtime/plot-request-context';
import type { AgentWorldbookRef_ACU } from '../agent/agent-decision-engine';
import { tryRenderPlotTemplateWithEjs_ACU, renderPlotTaskContentWithIsolatedVariables_ACU } from '../runtime/plot-runtime/plot-tag-utils';
import { createDetachedSqlTableService_ACU } from '../table/table-storage-strategy';
import { compareWorldbookEntriesForPlaceholder_ACU } from '../worldbook/pipeline';
import { ZeroLayerError_ACU, type ZeroLayerTurn_ACU, type ZeroLayerPlotCandidate_ACU } from './model';
import { validateZeroLayerPlotCandidate_ACU } from './validation';

/** 复用任务引擎，只产生请求内候选；不持有物理消息或世界书写权限。 */
export async function prepareZeroLayerPlot_ACU(
  turn: ZeroLayerTurn_ACU, history: readonly Record<string, unknown>[],
  signal: AbortSignal, assertCurrent: () => void,
): Promise<ZeroLayerPlotCandidate_ACU> {
  assertCurrent();
  const plotSettings = structuredClone(settings_ACU.plotSettings);
  const presetName = String(plotSettings?.lastUsedPresetName || '');
  const candidate: ZeroLayerPlotCandidate_ACU = {
    floorId: turn.userFloor.floorId, presetName, outcome: 'disabled',
    finalMessage: null, content: '', taskContents: {}, finalPrompts: [], filterEntries: [], agentActive: false,
  };
  if (!plotSettings?.enabled) return candidate;
  if (!turn.tableInput) throw new ZeroLayerError_ACU('effects-pending', 'Chuẩn bị cốt truyện thiếu snapshot bảng của lượt này.');
  const input = turn.tableInput;
  const streaming = settings_ACU.streamingEnabled === true;
  const defaultPreset = String(settings_ACU.plotApiPreset || '').trim();
  const overrides = structuredClone(settings_ACU.plotTaskApiPresetOverridesById || {});
  const presets = new Map<string, ReturnType<typeof getApiConfigByPreset_ACU>>();
  // 在任何异步操作前冻结渠道；Agent 从世界书取得的名字只能命中这份快照。
  for (const name of new Set<string>(['', ...(settings_ACU.apiPresets || []).map((preset: { name: string }) => preset.name)])) {
    presets.set(name, structuredClone(getApiConfigByPreset_ACU(name)));
  }
  const provider = input.storageMode === 'sqlite' ? createDetachedSqlTableService_ACU() : null;
  try {
    if (provider) {
      const loaded = await provider.loadFromData(structuredClone(input.tableData));
      assertCurrent();
      if (loaded.error || !provider.isReady()) throw new ZeroLayerError_ACU('effects-pending', 'Snapshot SQLite độc lập của cốt truyện chưa sẵn sàng.');
    }
    const tableData = provider?.getCurrentDataStrict_ACU() ?? structuredClone(input.tableData);
    const entries: Record<string, any>[] = [];

    const requestContext: PlotRequestContext_ACU = {
      history: structuredClone(history), tableData, presetName, signal,
      sqlReadContext: provider ? { provider, mapper: provider.createReadNameMapper_ACU(), tableData } : null,
      ejsContext: { chat: structuredClone(history), allTablesJson: structuredClone(tableData), userMessage: turn.input },
      finalPromptEntries: entries, assertCurrent,
      resolveTaskApiPreset: task => String(overrides[String(task.id || '')] || task.taskApiPreset || defaultPreset).trim(),
      async callApi(messages, name) {
        assertCurrent();
        const resolved = presets.get(name);
        if (!resolved) throw new ZeroLayerError_ACU('effects-pending', 'Preset API cốt truyện không nằm trong cấu hình đóng băng của lượt này.');
        requireResolvedApiPreset_ACU(name, resolved);
        if (resolved.apiMode !== 'custom' || !resolved.apiConfig.url || !resolved.apiConfig.model) {
          throw new ZeroLayerError_ACU('effects-pending', 'Cốt truyện Tầng 0 phải cấu hình API độc lập của cơ sở dữ liệu.');
        }
        const response = await callAIWithResolvedPreset_ACU(messages,
          { ...resolved, apiConfig: { ...resolved.apiConfig, useMainApi: false } }, signal, undefined, { streaming });
        assertCurrent();
        if (!response?.trim()) throw new ZeroLayerError_ACU('effects-pending', 'API cốt truyện không trả về văn bản hợp lệ.');
        return response;
      },
    };
    const result = await runPlotTasksRuntime_ACU(plotSettings, turn.input, { requestContext, inputForHash: turn.input });
    assertCurrent();
    if (result.failedResults.length || ('apiRetriesExhausted' in result && result.apiRetriesExhausted)) {
      throw new ZeroLayerError_ACU('effects-pending', 'Các tác vụ cốt truyện chưa hoàn tất hết, yêu cầu nội dung chính chưa được gửi.');
    }
    candidate.outcome = result.successfulResults.length ? 'generated' : 'no-tasks';
    candidate.finalMessage = result.finalMessage;
    candidate.content = 'saveContent' in result ? String(result.saveContent || '') : '';
    for (const task of result.successfulResults) {
      Object.defineProperty(candidate.taskContents, task.taskId, {
        value: task.rawResponse, enumerable: true, writable: true, configurable: true,
      });
    }
    candidate.agentActive = 'agentActive' in result && result.agentActive === true;
    if (candidate.agentActive) {
      const refs = 'finalGenerationGreenlights' in result ? result.finalGenerationGreenlights : [];
      await prepareFinalPrompts_ACU(candidate, entries, refs, requestContext);
    }
    assertCurrent();
    validateZeroLayerPlotCandidate_ACU(candidate, turn.userFloor.floorId);
    return candidate;
  } finally { provider?.dispose(); }
}

async function prepareFinalPrompts_ACU(
  candidate: ZeroLayerPlotCandidate_ACU, entries: Record<string, any>[],
  refs: AgentWorldbookRef_ACU[], context: PlotRequestContext_ACU,
): Promise<void> {
  const keyOf = (entry: { bookName: string; uid: string | number }) => `${entry.bookName}\u0000${entry.uid}`;
  const allowed = new Set(refs.map(keyOf));
  const found = new Set<string>();
  for (const entry of [...entries].sort(compareWorldbookEntriesForPlaceholder_ACU)) {
    context.assertCurrent();
    const content = typeof entry.content === 'string' ? entry.content : '';
    const comment = String(entry.comment || entry.rawComment || entry.name || '');
    candidate.filterEntries.push({ content, comment });
    const key = keyOf(entry as { bookName: string; uid: string | number });
    if (!allowed.has(key) || found.has(key)) continue;
    found.add(key);
    let position: ZeroLayerPlotCandidate_ACU['finalPrompts'][number]['position'];
    let role: ZeroLayerPlotCandidate_ACU['finalPrompts'][number]['role'] = 'system';
    switch (String(entry.position ?? '').toLowerCase()) {
      case 'before_character_definition': case 'before_char': case 'before_character': case '0':
        position = 'before_character_definition'; break;
      case 'after_character_definition': case 'after_char': case 'after_character': case '1':
        position = 'after_character_definition'; break;
      case 'at_depth_as_system': case 'system': case '4':
        position = 'at_depth';
        if (entry.role === 1 || entry.role === 'user') role = 'user';
        else if (entry.role === 2 || entry.role === 'assistant') role = 'assistant';
        else if (entry.role !== undefined && entry.role !== 0 && entry.role !== 'system') {
          throw new ZeroLayerError_ACU('effects-pending', 'Vai trò sổ thế giới của nội dung chính không được hỗ trợ.');
        }
        break;
      default: throw new ZeroLayerError_ACU('effects-pending', 'Vị trí sổ thế giới của nội dung chính không được hỗ trợ, từ chối đoán vị trí chèn.');
    }
    const depth = position === 'at_depth' ? Number(entry.depth) : 0;
    if (!Number.isSafeInteger(depth) || depth < 0) {
      throw new ZeroLayerError_ACU('effects-pending', 'Độ sâu sổ thế giới của nội dung chính không hợp lệ.');
    }
    const rendered = await tryRenderPlotTemplateWithEjs_ACU(content, context);
    context.assertCurrent();
    const text = renderPlotTaskContentWithIsolatedVariables_ACU(rendered, {
      requestContext: context, allTablesJson: context.tableData,
      seedContentForConditional: context.ejsContext.userMessage, lastPlotContent: candidate.content,
    });
    if (text.trim()) candidate.finalPrompts.push({ role, content: text, position, depth });
  }
  if ([...allowed].some(key => !found.has(key))) {
    throw new ZeroLayerError_ACU('effects-pending', 'Mục đèn xanh của nội dung chính không nằm trong danh mục đóng băng của lượt này, từ chối bỏ sót chèn.');
  }
}
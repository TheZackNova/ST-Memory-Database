import { ZeroLayerError_ACU, type ZeroLayerPlotCandidate_ACU } from './model';

type FinalPrompt_ACU = ZeroLayerPlotCandidate_ACU['finalPrompts'][number];

/** 只修改本轮请求；先定位全部锚点，失败时不留下半批注入。 */
export function injectZeroLayerFinalPrompts_ACU(
  messages: Record<string, any>[], prompts: readonly FinalPrompt_ACU[],
): void {
  const insertions = new Map<number, Record<string, unknown>[]>();
  const historyIndices = messages.flatMap((message, index) =>
    message?.injected !== true && ['user', 'assistant'].includes(message?.role) ? [index] : []);
  for (const prompt of prompts) {
    let index: number;
    if (prompt.position === 'at_depth') {
      if (!Number.isSafeInteger(prompt.depth) || prompt.depth < 0 || prompt.depth > historyIndices.length) {
        throw new ZeroLayerError_ACU('effects-pending', 'Độ sâu sổ thế giới của nội dung chính vượt quá lịch sử có thể định vị của lượt này.');
      }
      index = prompt.depth === 0 ? messages.length : historyIndices[historyIndices.length - prompt.depth];
    } else {
      const identifier = prompt.position === 'before_character_definition' ? 'worldInfoBefore' : 'worldInfoAfter';
      const anchors = messages.flatMap((message, at) =>
        [message?.identifier, message?.id, message?.name].includes(identifier) ? [at] : []);
      if (anchors.length !== 1) {
        throw new ZeroLayerError_ACU('effects-pending', 'Sổ thế giới của nội dung chính thiếu neo vị trí thẻ nhân vật duy nhất, từ chối đoán.');
      }
      index = anchors[0] + 1;
    }
    const group = insertions.get(index) ?? [];
    group.push({ role: prompt.role, content: prompt.content, injected: true });
    insertions.set(index, group);
  }
  // 按原始位置倒序写入，同一位置沿用候选中的 order 排序。
  for (const [index, group] of [...insertions].sort(([left], [right]) => right - left)) {
    messages.splice(index, 0, ...group);
  }
}

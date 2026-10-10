import { renderAgentOutlineWindow_ACU, renderAgentStoryTail_ACU, resolveAgentReadToken_ACU, type AgentResolveContext_ACU } from './agent-placeholder-resolver';
import { renderAgentWorldbookTriggeredInjection_ACU } from './agent-worldbook-read';
import type { AgentGateItem_ACU } from './agent-read-gate';

export interface AgentFinalReviewEvidenceInput_ACU {
  resolveContext: AgentResolveContext_ACU;
  candidateInstruction: string;
  currentUserInput: string;
  planningSummary?: string;
}

export interface AgentFinalReviewEvidence_ACU {
  gateItems: AgentGateItem_ACU[];
  hooksLedger: string;
  infoGap: string;
  supplementalMaterials: string;
  worldbookEvidence: string;
  worldbookSeeds: string[];
  fixedReadKeys: string[];
}

function unique_ACU(values: readonly string[]): string[] {
  return [...new Set(values.map(value => value.trim()).filter(Boolean))];
}

export function extractAgentFinalReviewWorldbookSeeds_ACU(text: string): string[] {
  const matches = String(text ?? '').match(/[\p{Script=Han}]{2,12}|[A-Za-z][A-Za-z0-9_-]{2,}/gu) ?? [];
  const candidates: string[] = [];
  for (const match of matches) {
    candidates.push(match);
    if (!/^[\p{Script=Han}]+$/u.test(match)) continue;
    for (let index = 0; index < match.length - 1; index += 1) {
      candidates.push(match.slice(index, index + 2));
    }
  }
  return unique_ACU(candidates).slice(0, 48);
}

export function buildAgentFinalReviewEvidence_ACU(input: AgentFinalReviewEvidenceInput_ACU): AgentFinalReviewEvidence_ACU {
  const { resolveContext: context } = input;
  const outline = renderAgentOutlineWindow_ACU(context);
  const storyArc = resolveAgentReadToken_ACU('$STORY_ARC', context).text;
  const tail = renderAgentStoryTail_ACU(context);
  const constraints = resolveAgentReadToken_ACU('$ACTIVE_CONSTRAINTS', context).text;
  const chronology = resolveAgentReadToken_ACU('$CHRONOLOGY', context).text;
  const hooksLedger = resolveAgentReadToken_ACU('$HOOKS_LEDGER', context).text;
  const infoGap = resolveAgentReadToken_ACU('$INFO_GAP', context).text;
  const seedSource = [context.originInstruction, input.currentUserInput, input.candidateInstruction, outline, tail].join('\n');
  const worldbookSeeds = extractAgentFinalReviewWorldbookSeeds_ACU(seedSource);
  const worldbookEvidence = context.worldbook?.available
    ? renderAgentWorldbookTriggeredInjection_ACU(context.worldbook, seedSource)
    : 'Sổ thế giới hiện không khả dụng; các kết luận liên quan đến nhân vật, năng lực, địa điểm, tổ chức, chủng tộc, quy tắc xã hội hoặc kiến thức thế giới phải đánh dấu là chưa xác minh. Đừng suy đoán hay coi việc đọc thất bại là sổ thế giới rỗng.';
  const supplementalMaterials = [
    `### Đầu vào của người dùng lượt này\n${input.currentUserInput || '(lượt này không có đầu vào bổ sung của người dùng)'}`,
    `### Ràng buộc dài hạn\n${constraints}`,
    `### Sổ niên đại học câu chuyện (sự thật thời gian được quyết toán từ chính văn đã xảy ra; trường thời gian trong dàn ý chỉ là kế hoạch)\n${chronology}`,
    `### Tóm tắt kết quả hoạch định lượt này\n${input.planningSummary || '(chưa cung cấp tóm tắt kết quả hoạch định)'}`,
    `### Hạt giống tra cứu sổ thế giới\n${worldbookSeeds.length ? worldbookSeeds.join(', ') : '(chưa trích được hạt giống tra cứu hợp lệ)'}`,
  ].join('\n\n');
  return {
    hooksLedger,
    infoGap,
    supplementalMaterials,
    worldbookEvidence,
    worldbookSeeds,
    fixedReadKeys: unique_ACU(['$USER_INTENT', '$USER_REQUIREMENTS', '$OUTLINE_WINDOW', '$STORY_ARC', '$STORY_TAIL', '$HOOKS_LEDGER', '$INFO_GAP', '$ACTIVE_CONSTRAINTS', '$CHRONOLOGY']),
    gateItems: [
      { label: 'Yêu cầu ban đầu của người dùng', text: context.originInstruction || '(Người dùng chưa cung cấp yêu cầu ban đầu)' },
      { label: 'Yêu cầu tích lũy của người dùng', text: resolveAgentReadToken_ACU('$USER_REQUIREMENTS', context).text },
      { label: 'Đầu vào của người dùng lượt này', text: input.currentUserInput || '(lượt này không có đầu vào bổ sung của người dùng)' },
      { label: 'Chỉ dẫn viết ứng viên', text: input.candidateInstruction },
      { label: 'Toàn bộ dàn ý giai đoạn hiện tại', text: outline },
      { label: 'Tổng cương câu chuyện', text: storyArc },
      { label: 'Chính văn gần nhất', text: tail },
      { label: 'Sổ phục bút', text: hooksLedger },
      { label: 'Dòng thời gian chênh lệch thông tin', text: infoGap },
      { label: 'Ràng buộc dài hạn, sổ niên đại học câu chuyện, tóm tắt hoạch định, hạt giống tra cứu và danh mục sổ thế giới', text: supplementalMaterials },
      { label: 'Xem trước các mục sổ thế giới khớp ngữ cảnh lượt này', text: worldbookEvidence },
    ],
  };
}

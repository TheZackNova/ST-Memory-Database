/**
 * 工具模式下的决策函数与交付函数。
 * 主 Agent 用 open_round / delegate / finalize / block 做决策，子代理用 submit 交付契约。
 * 参数字段与 JSON 模式的契约对象一致，解析仍交给原有领域解析器，不放宽校验。
 */
import type { AiNativeToolCall_ACU, AiNativeToolDefinition_ACU } from './native-tool';

export type AgentDecisionToolName_ACU = 'open_round' | 'delegate' | 'finalize' | 'block';
export const AGENT_DECISION_TOOL_NAMES_ACU: readonly AgentDecisionToolName_ACU[] = ['open_round', 'delegate', 'finalize', 'block'];
export type ContinuationDecisionToolName_ACU = AgentDecisionToolName_ACU | 'correct_materials' | 'adjust_progress';
export const CONTINUATION_DECISION_TOOL_NAMES_ACU: readonly ContinuationDecisionToolName_ACU[] = [...AGENT_DECISION_TOOL_NAMES_ACU, 'correct_materials', 'adjust_progress'];
export const AGENT_SUBMIT_TOOL_NAME_ACU = 'submit';

const closed_ACU = (properties: Record<string, unknown>, required: readonly string[] = []): Record<string, unknown> => ({
  type: 'object',
  properties,
  required: [...required],
  additionalProperties: false,
});
const text_ACU = (description?: string): Record<string, unknown> => (description ? { type: 'string', description } : { type: 'string' });
const texts_ACU = (description?: string): Record<string, unknown> => ({ type: 'array', items: { type: 'string' }, ...(description ? { description } : {}) });
const freeObject_ACU = (description: string): Record<string, unknown> => ({ type: 'object', description });
const fn_ACU = (name: string, description: string, parameters: Record<string, unknown>): AiNativeToolDefinition_ACU => ({
  type: 'function',
  function: { name, description, parameters },
});

const thought_ACU = text_ACU('Tùy chọn: một hai câu giải thích lý do của quyết định này.');

/** 续写主 Agent 的决策函数；字段与 parseAgentMainAction_ACU 读取的键一一对应。 */
export function continuationDecisionTools_ACU(names: readonly ContinuationDecisionToolName_ACU[] = CONTINUATION_DECISION_TOOL_NAMES_ACU): AiNativeToolDefinition_ACU[] {
  const catalog: Record<ContinuationDecisionToolName_ACU, AiNativeToolDefinition_ACU> = {
    open_round: fn_ACU('open_round', 'Mở lập kế hoạch viết tiếp của lượt này, vào quy trình cố định. Khi nào dùng: lượt này chưa mở và tài liệu đã đủ để xác định trọng tâm của lượt. Sau khi gọi, phản hồi lần này kết thúc, chờ kết quả quy trình. focus bắt buộc, ghi phần cốt lõi cần đẩy tiến trong lượt này; summary có thể viết một câu về tình hình hiện tại; khi cần lên mạng bổ sung tài liệu thì đặt dispatchWebResearcher thành true.', closed_ACU({
      focus: text_ACU('Trọng tâm đẩy tiến của lượt này, không được để trống.'),
      summary: text_ACU(),
      dispatchWebResearcher: { type: 'boolean' },
      thought: thought_ACU,
    }, ['focus'])),
    delegate: fn_ACU('delegate', 'Giao tác vụ cho Agent phụ trong danh mục. Khi nào dùng: cần Agent phụ bổ sung tài liệu, bảo trì sổ cái hoặc đưa ra đề xuất. Sau khi gọi, phản hồi lần này kết thúc, chờ Agent phụ bàn giao. delegations có ít nhất một mục, agentName phải sao chép từ danh mục Agent phụ, prompt ghi rõ cần nó làm gì, reads có thể kèm các địa chỉ nó cần đọc trước.', closed_ACU({
      delegations: {
        type: 'array',
        minItems: 1,
        items: closed_ACU({ agentName: text_ACU(), prompt: text_ACU(), reads: texts_ACU() }, ['agentName', 'prompt']),
      },
      thought: thought_ACU,
    }, ['delegations'])),
    finalize: fn_ACU('finalize', 'Kết thúc lập kế hoạch, bàn giao chỉ thị viết tiếp lần này. Khi nào dùng: tài liệu và kết quả của Agent phụ đã đủ để viết chỉ thị viết tiếp. Sau khi gọi, việc lập kế hoạch kết thúc. instruction bắt buộc, là chỉ thị đầy đủ giao cho phần viết nội dung chính; summary ghi kết luận của lượt này; constraints có thể bổ sung hoặc cho nghỉ hưu các ràng buộc dài hạn.', closed_ACU({
      instruction: text_ACU('Chỉ thị đầy đủ giao cho phần viết nội dung chính, không được để trống.'),
      summary: text_ACU(),
      constraints: closed_ACU({ add: texts_ACU('Ràng buộc dài hạn mới thêm.'), retire: texts_ACU('Nguyên văn ràng buộc dài hạn cần cho nghỉ hưu.') }),
      thought: thought_ACU,
    }, ['instruction'])),
    correct_materials: fn_ACU('correct_materials', 'Phiên chính sửa tài liệu hoặc thực hiện điểm truy ngược do người dùng chỉ định. sql có thể ghi INSERT/UPDATE/DELETE bị giới hạn cho hooks, info_gap, chronology, story_arc, dùng lại kiểm tra từng mục và biên nhận lưu; mục đã có phải chỉ định id và expected_revision hiện tại, không được tự bịa thêm sự kiện. Chỉ khi người dùng yêu cầu rõ ràng bỏ qua lịch sử cũ mới đưa settlementStartIndex (bắt đầu từ tầng AI đó, bao gồm tầng đó) và userMessageId (ID của tin nhắn người dùng thật trong hội thoại), reason bắt buộc. Bản ghi bỏ qua được lưu riêng, không giả làm đã quyết toán; không có sự kiện mới thì không gửi SQL. Gọi riêng, sau đó dựa vào biên nhận để open_round, không gửi lặp các mục đã lưu.', closed_ACU({
      reason: text_ACU('Căn cứ chỉnh sửa hoặc lựa chọn của người dùng, không được để trống.'),
      sql: text_ACU('DML tài liệu bị giới hạn (tùy chọn); không được ghi mốc, yêu cầu người dùng hoặc bảng khác.'),
      settlementStartIndex: { type: 'integer', minimum: 0 },
      userMessageId: { type: 'integer', minimum: 1 },
      thought: thought_ACU,
    }, ['reason'])),
    adjust_progress: fn_ACU('adjust_progress', 'Dựa vào cốt truyện thực tế để chọn giai đoạn hiện tại và lượt kế tiếp, hoặc sửa trạng thái hoàn tất của giai đoạn. stageId và revision sao chép từ danh mục giai đoạn; nextTurnId chọn lượt đã có mà giai đoạn đó sẽ thực hiện tiếp, các lượt lập kế hoạch phía trước được coi là hoàn tất, đồng thời chuyển giai đoạn hiện tại. completeStage=true đánh dấu giai đoạn hoàn tất; false mở lại giai đoạn, nối tiếp từ lượt cuối cùng của nó. nextTurnId và completeStage phải và chỉ được đưa một trong hai, reason ghi rõ căn cứ. Chọn giai đoạn không tự hoàn tất giai đoạn khác, cũng không đẩy mốc quyết toán tài liệu. Sửa tổng cương dùng correct_materials hoặc delegate arc-architect; sửa dàn ý giai đoạn thì delegate outline-architect riêng. Chờ biên nhận committed rồi mới open_round; thử lại nội dung chính không khả dụng.', closed_ACU({
      reason: text_ACU('Căn cứ cốt truyện hoặc yêu cầu của người dùng, không được để trống.'),
      stageId: text_ACU('ID ổn định của giai đoạn đã có.'),
      revision: { type: 'integer', minimum: 1 },
      nextTurnId: text_ACU('ID lượt đã có sẽ thực hiện tiếp; các lượt phía trước được coi là hoàn tất.'),
      completeStage: { type: 'boolean', description: 'true đánh dấu hoàn tất; false mở lại giai đoạn, nối tiếp từ lượt cuối cùng.' },
      thought: thought_ACU,
    }, ['reason', 'stageId', 'revision'])),
    block: fn_ACU('block', 'Dừng lần viết tiếp này khi không thể tiếp tục. Khi nào dùng: tài liệu then chốt bị thiếu hoặc xung đột, không thể viết chỉ thị đáng tin cậy. reason bắt buộc, unresolved liệt kê các vấn đề chưa giải quyết.', closed_ACU({
      reason: text_ACU('Lý do dừng, không được để trống.'),
      unresolved: texts_ACU(),
      thought: thought_ACU,
    }, ['reason'])),
  };
  return names.map(name => catalog[name]);
}

/** 续写子代理 submit 的契约种类：与 KIND_PAYLOAD_KEYS_ACU 的 kind 对齐，终审单列。 */
export type ContinuationSubmitContract_ACU = 'arc' | 'maintain' | 'plan' | 'review' | 'research' | 'compose' | 'finalReview';

const SUBMIT_DESCRIPTION_ACU = 'Bàn giao kết quả lần này; sau khi gọi, tác vụ lần này kết thúc. Khi thiếu tài liệu, hãy gọi công cụ đọc trước, xác nhận đúng rồi mới gọi submit.';

function continuationSubmitParameters_ACU(contract: ContinuationSubmitContract_ACU): Record<string, unknown> {
  switch (contract) {
    case 'maintain':
      return closed_ACU({
        summary: text_ACU('Tóm tắt ngắn về quyết toán lần này và các khoảng trống còn lại.'),
        delta: freeObject_ACU('Tùy chọn: gửi toàn bộ thay đổi bảo trì một lần, dùng hooks / infoGap / chronology / constraintProposals trong phần mô tả định dạng vai trò. Chương trình lo ánh xạ trường, kiểm tra phiên bản và lưu; thành công rồi thì không cần xác nhận lại.'),
      });
    case 'arc':
    case 'research':
      return closed_ACU({
        summary: text_ACU('Tóm tắt ngắn về công việc lần này.'),
        delta: freeObject_ACU('Tùy chọn: phần bổ sung có cấu trúc theo mô tả vai trò của bạn; để ghi tài liệu hãy dùng write_sql.'),
      });
    case 'plan':
      return closed_ACU({
        summary: text_ACU(),
        recommendation: text_ACU('Nội dung đề xuất, không được để trống.'),
        mustPreserve: texts_ACU(),
        risks: texts_ACU(),
      }, ['recommendation']);
    case 'review':
      return closed_ACU({
        verdict: { type: 'string', enum: ['pass', 'revise', 'block'] },
        reason: text_ACU(),
        fixes: texts_ACU(),
      }, ['verdict']);
    case 'compose':
      return closed_ACU({
        instruction: text_ACU('Chỉ thị viết tiếp đầy đủ, không được để trống.'),
        summary: text_ACU(),
        constraints: closed_ACU({ add: texts_ACU(), retire: texts_ACU() }),
      }, ['instruction']);
    case 'finalReview':
      return closed_ACU({
        verdict: { type: 'string', enum: ['pass', 'revise', 'block'] },
        summary: text_ACU(),
        emotionFindings: texts_ACU(),
        worldFindings: texts_ACU(),
        logicFindings: texts_ACU(),
        requiredFixes: texts_ACU(),
        preserve: texts_ACU(),
      }, ['verdict']);
  }
}

export function continuationSubmitTool_ACU(contract: ContinuationSubmitContract_ACU): AiNativeToolDefinition_ACU {
  return fn_ACU(AGENT_SUBMIT_TOOL_NAME_ACU, SUBMIT_DESCRIPTION_ACU, continuationSubmitParameters_ACU(contract));
}

/** 推演导演的决策函数；字段与 parseWorldSimulationMainAction_ACU 的封闭对象一一对应（不收额外键）。 */
export function worldSimulationDecisionTools_ACU(names: readonly AgentDecisionToolName_ACU[] = AGENT_DECISION_TOOL_NAMES_ACU): AiNativeToolDefinition_ACU[] {
  const catalog: Record<AgentDecisionToolName_ACU, AiNativeToolDefinition_ACU> = {
    open_round: fn_ACU('open_round', 'Mở mô phỏng thế giới của lượt này, vào quy trình cố định. Khi nào dùng: lượt này chưa mở và đã xác định được trọng tâm mô phỏng của lượt. Sau khi gọi, phản hồi lần này kết thúc. summary ghi tình hình hiện tại, focus ghi trọng tâm lượt này, dispatchChronicler cho biết có cử người ghi biên niên hay không; skipModules có thể liệt kê các mô-đun sổ cái không cần xử lý trong lượt này.', closed_ACU({
      summary: text_ACU(),
      focus: text_ACU(),
      dispatchChronicler: { type: 'boolean' },
      skipModules: texts_ACU(),
    }, ['summary', 'focus', 'dispatchChronicler'])),
    delegate: fn_ACU('delegate', 'Giao tác vụ cho Agent phụ mô phỏng trong danh mục. Sau khi gọi, phản hồi lần này kết thúc, chờ bàn giao. delegations có ít nhất một mục, agentName phải sao chép từ danh mục Agent phụ, instruction ghi rõ tác vụ, reads có thể kèm các địa chỉ nó cần đọc trước.', closed_ACU({
      delegations: {
        type: 'array',
        minItems: 1,
        items: closed_ACU({ agentName: text_ACU(), instruction: text_ACU(), reads: texts_ACU() }, ['agentName', 'instruction']),
      },
    }, ['delegations'])),
    finalize: fn_ACU('finalize', 'Kết thúc lần mô phỏng này. outcome chọn commit (gửi các thay đổi đã duyệt), no_change (lần này không có thay đổi) hoặc blocked (không thể tiến hành); summary ghi kết luận; evidenceRefs chỉ được điền các tham chiếu đã được cấp trong biên nhận công cụ.', closed_ACU({
      outcome: { type: 'string', enum: ['commit', 'no_change', 'blocked'] },
      summary: text_ACU(),
      evidenceRefs: texts_ACU(),
    }, ['outcome', 'summary'])),
    block: fn_ACU('block', 'Dừng lần mô phỏng này khi không thể tiếp tục. reason ghi nguyên nhân, unresolved liệt kê các vấn đề chưa giải quyết (ít nhất một mục).', closed_ACU({
      reason: text_ACU(),
      unresolved: { type: 'array', items: { type: 'string' }, minItems: 1 },
    }, ['reason', 'unresolved'])),
  };
  return names.map(name => catalog[name]);
}

/** 推演 specialist 的交付函数：字段对齐 parseWorldSimulationSpecialistResult_ACU，按 status 决定必填字段。 */
export function worldSimulationSpecialistSubmitTool_ACU(): AiNativeToolDefinition_ACU {
  return fn_ACU(AGENT_SUBMIT_TOOL_NAME_ACU, `${SUBMIT_DESCRIPTION_ACU} Khi status=candidate hãy đưa agentName, patch, summary, evidenceRefs, uncertainties; khi no_change đưa agentName, summary, evidenceRefs, uncertainties; khi failed đưa agentName, reasonCode, message; khi blocked đưa agentName, unresolved. Không kèm trường khác.`, closed_ACU({
    status: { type: 'string', enum: ['candidate', 'no_change', 'failed', 'blocked'] },
    agentName: text_ACU('Tên Agent phụ của chính bạn.'),
    patch: freeObject_ACU('Bản vá sổ cái ứng viên, cấu trúc theo mô tả vai trò của bạn.'),
    summary: text_ACU(),
    evidenceRefs: texts_ACU('Chỉ được điền các tham chiếu đã được cấp trong biên nhận công cụ.'),
    uncertainties: texts_ACU(),
    reasonCode: text_ACU(),
    message: text_ACU(),
    unresolved: texts_ACU(),
  }, ['status', 'agentName']));
}

/** 一次性推演交付：candidate 只确认已由 write_sql 校验的候选，不重新提交写集。 */
export function worldSimulationOneShotSubmitTool_ACU(): AiNativeToolDefinition_ACU {
  return fn_ACU(AGENT_SUBMIT_TOOL_NAME_ACU, 'Bàn giao kết quả lần này; sau khi gọi, tác vụ lần này kết thúc. candidate chỉ xác nhận ứng viên trong biên nhận write_sql lần trước; không có thay đổi thì dùng no_change, không thể hoàn thành thì dùng failed hoặc blocked. Gọi riêng, không đi cùng read hoặc write_sql trong cùng một phản hồi.', closed_ACU({
    status: { type: 'string', enum: ['candidate', 'no_change', 'failed', 'blocked'] },
    agentName: text_ACU('Tên vai trò hiện tại.'),
    summary: text_ACU(),
    evidenceRefs: texts_ACU(),
    uncertainties: texts_ACU(),
    reasonCode: text_ACU(),
    message: text_ACU(),
    unresolved: texts_ACU(),
  }, ['status', 'agentName']));
}

/** 阶段规划交付；action=plan 由调用边界注入，不交给模型填写。 */
export function worldSimulationPlannerSubmitTool_ACU(): AiNativeToolDefinition_ACU {
  return fn_ACU(AGENT_SUBMIT_TOOL_NAME_ACU, 'Bàn giao kế hoạch giai đoạn đầy đủ lần này; gọi riêng, sau khi gọi tác vụ lần này kết thúc.', closed_ACU({
    summary: text_ACU('Tóm tắt lập kế hoạch giai đoạn, không được để trống.'),
    plan: freeObject_ACU('Kế hoạch giai đoạn đầy đủ, các trường tuân theo giao thức lập kế hoạch hiện tại.'),
  }, ['summary', 'plan']));
}

/** 推演 reviewer 的交付函数：字段对齐 parseWorldSimulationReviewerResult_ACU。 */
export function worldSimulationReviewerSubmitTool_ACU(): AiNativeToolDefinition_ACU {
  return fn_ACU(AGENT_SUBMIT_TOOL_NAME_ACU, SUBMIT_DESCRIPTION_ACU, closed_ACU({
    verdict: { type: 'string', enum: ['accept', 'revise', 'reject'] },
    summary: text_ACU(),
    findings: {
      type: 'array',
      items: closed_ACU({
        severity: { type: 'string', enum: ['blocking', 'major', 'minor'] },
        reasonCode: text_ACU(),
        path: text_ACU(),
        expected: text_ACU(),
        actual: {},
      }, ['severity', 'reasonCode', 'path', 'expected', 'actual']),
    },
    acceptedCandidateIds: texts_ACU(),
  }, ['verdict', 'summary', 'findings', 'acceptedCandidateIds']));
}

export interface NativeToolEntry_ACU {
  call: AiNativeToolCall_ACU;
  payload: Record<string, unknown>;
}

export interface NativeDecisionSplit_ACU {
  /** 唯一的决策或 submit 调用；payload 已由 nativeToolArguments_ACU 注入 action=函数名。 */
  decision: NativeToolEntry_ACU | null;
  /** 读取、搜索、写入等工具调用。 */
  tools: NativeToolEntry_ACU[];
}

/**
 * 把一次回复里的原生调用拆成「决策」和「工具」两类。
 * 决策函数多于一个，或决策与工具混在同一次回复里，都按协议错误抛出，由调用方回灌。
 * @param entries nativeToolArguments_ACU 的结果
 * @param decisionNames 当前角色允许的决策或交付函数名
 */
export function splitNativeDecisionCalls_ACU(entries: readonly NativeToolEntry_ACU[], decisionNames: readonly string[]): NativeDecisionSplit_ACU {
  const decisions = entries.filter(entry => decisionNames.includes(entry.call.name));
  const tools = entries.filter(entry => !decisionNames.includes(entry.call.name));
  if (decisions.length > 1) throw new Error(`Một phản hồi chỉ được gọi một hàm ${decisionNames.join(' / ')}, nhưng thực tế đã gọi ${decisions.map(entry => entry.call.name).join(', ')}`);
  if (decisions.length && tools.length) {
    throw new Error(`${decisions[0].call.name} không được gọi cùng trong một phản hồi với ${tools.map(entry => entry.call.name).join(', ')}; hãy hoàn tất việc gọi công cụ trước, có kết quả rồi mới gọi riêng ${decisions[0].call.name}`);
  }
  return { decision: decisions[0] ?? null, tools };
}

/** submit 的参数去掉注入的 action 后序列化，交给原契约解析器按 JSON 模式同一路径解析。 */
export function submitPayloadText_ACU(payload: Record<string, unknown>): string {
  const { action: _action, ...rest } = payload;
  return JSON.stringify(rest);
}

/** 不含 action 的 submit 参数对象，供直接接收对象的解析器使用。 */
export function submitPayloadObject_ACU(payload: Record<string, unknown>): Record<string, unknown> {
  const { action: _action, ...rest } = payload;
  return rest;
}

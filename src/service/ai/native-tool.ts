import { USER_PREFILL_CONTENT_ACU } from '../../shared/user-prefill.js';
/**
 * 续写与推演共用的原生函数调用。
 * 请求走 /api/backends/chat-completions/generate 时，工具定义放在 body.tools，
 * 回包里的 tool_calls / functionCall 原样收下，结果用 role=tool 回灌。
 */

export interface AiNativeToolCall_ACU {
  id: string;
  name: string;
  arguments: string;
}

export interface AiNativeToolDefinition_ACU {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface AiChatTurn_ACU {
  content: string;
  toolCalls: AiNativeToolCall_ACU[];
}

export interface AiWireMessage_ACU {
  role: string;
  content: string;
  tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>;
  tool_call_id?: string;
}

export interface StoredNativeToolCall_ACU {
  id: string;
  name: string;
  arguments: string;
}

const objectSchema_ACU = (properties: Record<string, unknown>, required: readonly string[]): Record<string, unknown> => ({
  type: 'object',
  properties,
  required: [...required],
  additionalProperties: false,
});

export type AgentNativeToolName_ACU = 'read' | 'search' | 'write_sql' | 'encyclopedia_search' | 'encyclopedia_read' | 'web_search' | 'web_read';

const notesSchema_ACU = { type: 'array', items: { type: 'string' }, description: 'Các sự kiện ngắn gọn cần giữ lại từ lô trang trước. Hãy mang theo khi tiếp tục gọi công cụ; nội dung trang web sẽ không đi vào lịch sử.' };

export function agentNativeTools_ACU(names: readonly AgentNativeToolName_ACU[]): AiNativeToolDefinition_ACU[] {
  const catalog: Record<AgentNativeToolName_ACU, AiNativeToolDefinition_ACU> = {
    read: {
      type: 'function',
      function: {
        name: 'read',
        description: 'Đọc toàn văn một hoặc một loạt tài liệu theo địa chỉ. Khi nào dùng: prompt đã cho sẵn địa chỉ, hoặc bên phải dòng khớp của search có địa chỉ, và cần nội dung chính, hàng bảng, tổng cương, phục bút, mục sổ thế giới hoặc trường sổ cái mô phỏng. Khi ngân sách và ủy quyền cho phép, hãy đặt tất cả địa chỉ đọc độc lập vào mảng reads trong cùng một phản hồi và hoàn tất song song, đừng chia lô rồi chờ; việc đọc kỹ phụ thuộc kết quả search để sang lượt sau. Đừng dùng nó để tìm nội dung chưa biết. Tham số reads là mảng chuỗi không rỗng, một lần có thể trộn nhiều loại địa chỉ, ví dụ ["$STORY_RANGE:3-5","$STORY_ARC:VOL-01"] hoặc ["ledger:current","field:seeds:seed-1:title"]. Toàn văn mục sổ thế giới khớp thường đã được chèn sẵn, đừng read lặp lại $WORLDBOOK:...; địa chỉ phải sao chép từ danh mục hoặc bảng từ vựng của prompt hiện tại.',
        parameters: objectSchema_ACU({
          reads: { type: 'array', items: { type: 'string' }, minItems: 1 },
          requestedFence: {
            type: 'object',
            properties: {
              lower: { oneOf: [{ type: 'string' }, { type: 'integer' }] },
              upper: { oneOf: [{ type: 'string' }, { type: 'integer' }] },
            },
            minProperties: 1,
            additionalProperties: false,
            description: 'Tùy chọn: hàng rào trên/dưới khi đọc; ranh giới không cung cấp sẽ do bộ chuyển đổi địa chỉ hoặc ngữ cảnh runtime phân giải.',
          },
        }, ['reads']),
      },
    },
    search: {
      type: 'function',
      function: {
        name: 'search',
        description: 'Tìm vị trí trong tài liệu theo từ khóa. Khi nào dùng: biết cần tìm gì nhưng chưa có địa chỉ để đọc. Khi ngân sách và ủy quyền cho phép, hãy phát đồng thời trong cùng một phản hồi tất cả search / read độc lập, đừng tách truy vấn độc lập thành nhiều lô rồi chờ; chỉ việc đọc kỹ phụ thuộc kết quả tìm kiếm mới để sau biên nhận. Search trước rồi read theo địa chỉ ở dòng khớp. query bắt buộc, dùng từ khóa ngắn hoặc tên người, đừng dán cả đoạn nội dung. scope là mảng phạm vi, viết tiếp dùng được story, tables, modules, outline, worldbook, mô phỏng dùng được worldbook, encyclopedia, web; bỏ qua nghĩa là toàn bộ phạm vi mà vai trò đó được phép. Tùy chọn isRegex, maxResults (1 đến 50). Ví dụ:{"query":"晶屑","scope":["worldbook"],"maxResults":8}。',
        parameters: objectSchema_ACU({
          query: { type: 'string' },
          scope: { type: 'array', items: { type: 'string' } },
          maxResults: { type: 'integer', minimum: 1, maximum: 50 },
          isRegex: { type: 'boolean' },
        }, ['query']),
      },
    },
    write_sql: {
      type: 'function',
      function: {
        name: 'write_sql',
        description: 'Ghi tài liệu vào bảng mà bạn phụ trách. Khi nào dùng: cần thêm, sửa hoặc xóa một tài liệu đã có, và bảng mà system prompt giao cho bạn cho phép ghi. Không có thay đổi thì đừng gọi. sql là một hoặc nhiều câu INSERT, UPDATE hoặc DELETE ngăn cách bằng dấu chấm phẩy. Cố gắng đặt toàn bộ câu lệnh cần ghi lần này vào cùng một tham số sql của cùng một lần gọi để hoàn tất một lượt, đừng tách thành nhiều lô gọi nhiều lần. Chuỗi dùng dấu nháy đơn, dấu nháy đơn trong nội dung viết thành hai dấu nháy đơn; mảng và đối tượng viết thành JSON bọc trong dấu nháy đơn. Hàng mới có phải đưa rõ expected_revision=0 hay không tùy theo hợp đồng bảng của từng vai trò: mô phỏng dimensions/seeds/actors/rumors phải đưa 0, hàng mới của viết tiếp có thể bỏ qua; WHERE của hàng mảng đã có kèm id và số sửa đổi của mục/mô-đun hiện tại, mô-đun đơn chỉ kèm số sửa đổi sổ cái hiện tại; partial đã lưu chỉ bổ sung các mục chưa lưu theo missingFields, trạng thái không chắc chắn thì read trước. Bảng cụ thể, cột bắt buộc và ví dụ lấy theo mô tả write_sql của vai trò bạn trong system prompt. Ví dụ:INSERT INTO hooks (summary, status, importance, planted_index, planned_payoff) VALUES (\'守门人藏着晶屑\', \'planted\', \'mid\', 3, \'稍后交出\');',
        parameters: objectSchema_ACU({
          sql: { type: 'string' },
          evidenceRefs: { type: 'array', items: { type: 'string' } },
        }, ['sql']),
      },
    },
    encyclopedia_search: {
      type: 'function',
      function: {
        name: 'encyclopedia_search',
        description: 'Tìm mục từ ứng viên trong bách khoa. Khi nào dùng: cần đăng ký thiết lập gốc hoặc công khai nhưng chưa biết tiêu đề chính xác. query dùng "tên nhân vật" hoặc "tên tác phẩm tên nhân vật", đừng dùng cả câu cốt truyện. sources có thể bỏ qua, bỏ qua nghĩa là toàn bộ nguồn đã bật; có thể điền moegirl, wikipedia_zh, wikipedia_en, baidu. Moegirl khớp theo tiền tố tiêu đề, Baidu khớp theo tên mục từ chính xác. Ví dụ:{"query":"守门人","sources":["moegirl","wikipedia_zh"]}。Sau khi tìm thấy hãy gọi encyclopedia_read.',
        parameters: objectSchema_ACU({
          query: { type: 'string' },
          sources: { type: 'array', items: { type: 'string' } },
          notes: notesSchema_ACU,
        }, ['query']),
      },
    },
    encyclopedia_read: {
      type: 'function',
      function: {
        name: 'encyclopedia_read',
        description: 'Đọc kỹ một mục từ bách khoa. Khi nào dùng: encyclopedia_search đã trả về ứng viên và cần nội dung chính mới ghi được vào web_refs. source và title phải sao chép nguyên văn từ ứng viên, đừng sửa tiêu đề. Ví dụ:{"source":"moegirl","title":"守门人"}。Chỉ handle trang được trả về mới dùng được làm web_refs.page_ref.',
        parameters: objectSchema_ACU({
          source: { type: 'string' },
          title: { type: 'string' },
          notes: notesSchema_ACU,
        }, ['source', 'title']),
      },
    },
    web_search: {
      type: 'function',
      function: {
        name: 'web_search',
        description: 'Tìm kiếm web thông dụng. Khi nào dùng: bách khoa không có thực thể này, hoặc chỉ xuất hiện ở chuyên mục, trang thiết lập. query dùng từ khóa ngắn cộng tên tác phẩm. Ví dụ:{"query":"禁区 守门人 设定"}。Xem tiêu đề và tóm tắt trước, rồi gọi web_read cho liên kết đáng tin. Diễn đàn và truyền thông tự do chỉ làm bằng chứng phụ.',
        parameters: objectSchema_ACU({
          query: { type: 'string' },
          notes: notesSchema_ACU,
        }, ['query']),
      },
    },
    web_read: {
      type: 'function',
      function: {
        name: 'web_read',
        description: 'Lấy nội dung chính của một trang web. Khi nào dùng: web_search đã đưa ra url đáng tin và cần nội dung trang mới ghi được vào tài liệu. url phải là địa chỉ đầy đủ trong kết quả, đừng bịa. Ví dụ:{"url":"https://example.com/setting"}。Mạng nội bộ, chính SillyTavern và tên miền trong danh sách đen sẽ bị từ chối. Chỉ handle trang được trả về mới dùng được làm web_refs.page_ref.',
        parameters: objectSchema_ACU({
          url: { type: 'string' },
          notes: notesSchema_ACU,
        }, ['url']),
      },
    },
  };
  return names.map(name => catalog[name]);
}

export function normalizeAgentModelReply_ACU(raw: unknown): AiChatTurn_ACU {
  if (typeof raw === 'string' || raw == null) return { content: String(raw ?? ''), toolCalls: [] };
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    const value = raw as { content?: unknown; toolCalls?: unknown };
    const toolCalls = Array.isArray(value.toolCalls) ? value.toolCalls.flatMap(normalizeStoredToolCall_ACU) : [];
    return { content: typeof value.content === 'string' ? value.content : '', toolCalls };
  }
  return { content: String(raw), toolCalls: [] };
}

export function normalizeStoredToolCall_ACU(raw: unknown): AiNativeToolCall_ACU[] {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return [];
  const value = raw as { id?: unknown; name?: unknown; arguments?: unknown };
  const id = typeof value.id === 'string' ? value.id.trim() : '';
  const name = typeof value.name === 'string' ? value.name.trim() : '';
  if (!id || !name) return [];
  const args = typeof value.arguments === 'string' ? value.arguments : JSON.stringify(value.arguments ?? {});
  return [{ id, name, arguments: args }];
}

/** 原生调用的协议边界：不从 assistant.content 猜工具动作，参数先验证再交领域解析器。 */
export function nativeToolArguments_ACU(calls: readonly AiNativeToolCall_ACU[]): Array<{ call: AiNativeToolCall_ACU; payload: Record<string, unknown> }> {
  const ids = new Set<string>();
  return calls.map(call => {
    if (!call.id.trim() || !call.name.trim() || ids.has(call.id)) throw new Error('ID hoặc tên hàm của lời gọi công cụ gốc không hợp lệ, hoặc ID bị trùng');
    ids.add(call.id);
    const args: unknown = JSON.parse(call.arguments);
    if (!args || typeof args !== 'object' || Array.isArray(args)) throw new Error(`Tham số của công cụ ${call.name} phải là đối tượng JSON`);
    const payload = args as Record<string, unknown>;
    if ('action' in payload) throw new Error(`Tham số của công cụ ${call.name} không được chứa action của giao thức văn bản`);
    return { call, payload: { ...payload, action: call.name } };
  });
}

/** 文本协议里的 read/search/write_sql 也要落成工具记录；混有其它动作时返回空，交给原路径。 */
export function synthesizeProtocolToolCalls_ACU(calls: readonly {
  kind: string;
  reads?: readonly string[];
  requestedFence?: { lower?: string | number; upper?: string | number };
  query?: string;
  scope?: readonly string[];
  isRegex?: boolean;
  maxResults?: number;
  sql?: string;
  evidenceRefs?: readonly string[];
}[]): AiNativeToolCall_ACU[] {
  if (!calls.length || calls.some(call => call.kind !== 'read' && call.kind !== 'search' && call.kind !== 'write_sql')) return [];
  return calls.map((call, index) => ({
    id: `call_${index}_${call.kind}`,
    name: call.kind,
    arguments: JSON.stringify(call.kind === 'read'
      ? { reads: [...(call.reads ?? [])], ...(call.requestedFence !== undefined ? { requestedFence: call.requestedFence } : {}) }
      : call.kind === 'search'
        ? { query: call.query ?? '', ...(call.scope ? { scope: [...call.scope] } : {}), ...(call.maxResults !== undefined ? { maxResults: call.maxResults } : {}), ...(call.isRegex ? { isRegex: true } : {}) }
        : { sql: call.sql ?? '', ...(call.evidenceRefs?.length ? { evidenceRefs: [...call.evidenceRefs] } : {}) }),
  }));
}

export function nativeToolCallsToProtocolJson_ACU(calls: readonly AiNativeToolCall_ACU[]): string {
  return calls.map(call => JSON.stringify(protocolRecord_ACU(call))).join('\n');
}

function protocolRecord_ACU(call: AiNativeToolCall_ACU): Record<string, unknown> {
  const args = parseArguments_ACU(call.arguments);
  if (call.name === 'read') {
    const reads = Array.isArray(args.reads) ? args.reads : (typeof args.address === 'string' ? [args.address] : []);
    return { action: 'read', reads, ...(args.requestedFence !== undefined ? { requestedFence: args.requestedFence } : {}) };
  }
  if (call.name === 'search') {
    return {
      action: 'search',
      query: args.query,
      ...(args.scope !== undefined ? { scope: args.scope } : {}),
      ...(args.maxResults !== undefined ? { maxResults: args.maxResults } : {}),
      ...(args.isRegex !== undefined ? { isRegex: args.isRegex } : {}),
    };
  }
  if (call.name === 'write_sql') {
    return {
      action: 'write_sql',
      sql: args.sql,
      ...(args.evidenceRefs !== undefined ? { evidenceRefs: args.evidenceRefs } : {}),
    };
  }
  if (call.name === 'encyclopedia_search' || call.name === 'encyclopedia_read' || call.name === 'web_search' || call.name === 'web_read') {
    return { action: call.name, ...args };
  }
  throw new Error(`Công cụ không xác định ${call.name}`);
}

function parseArguments_ACU(raw: string): Record<string, unknown> {
  const parsed = JSON.parse(raw || '{}');
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Tham số công cụ phải là đối tượng JSON');
  return parsed as Record<string, unknown>;
}

export function nativeToolExchange_ACU(content: string, calls: readonly AiNativeToolCall_ACU[], results: readonly string[]): AiWireMessage_ACU[] {
  return [
    {
      role: 'assistant',
      content,
      tool_calls: calls.map(call => ({
        id: call.id,
        type: 'function' as const,
        function: { name: call.name, arguments: call.arguments },
      })),
    },
    ...calls.map((call, index) => ({
      role: 'tool',
      tool_call_id: call.id,
      content: results[index] ?? 'Công cụ không trả về kết quả tương ứng',
    })),
  ];
}

export function toOpenAiToolCalls_ACU(calls: readonly StoredNativeToolCall_ACU[]): NonNullable<AiWireMessage_ACU['tool_calls']> {
  return calls.map(call => ({ id: call.id, type: 'function' as const, function: { name: call.name, arguments: call.arguments } }));
}

function isJsonPrefillStub_ACU(content: string): boolean {
  const trimmed = content.trim();
  return trimmed === '{'
    || trimmed.includes('<continue>')
    || trimmed.endsWith('{\n  "thought": "')
    || trimmed.endsWith('{\n  "summary": "')
    || trimmed.endsWith('{\n  "verdict": "')
    || trimmed.endsWith('{\n  "instruction": "');
}

/**
 * 去掉未完成的 JSON 预填充。
 * 它不能只从请求末尾拿掉：一旦后面跟上带 tool_calls 的助手消息，
 * 酒馆会把连续的 assistant 并成前一条，tool_calls 被丢掉，
 * MiniMax 就会报 tool result's tool id not found。
 */
export function dropTerminalJsonPrefill_ACU<T extends { role: string; content: string }>(messages: readonly T[]): T[] {
  return messages.filter(message => !(message.role === 'assistant' && isJsonPrefillStub_ACU(message.content)));
}

/** 原生工具请求的尾部预填充：让模型先写思维链，闭合后再调用函数或输出 JSON。 */
export const NATIVE_TOOL_THINK_PREFILL_ACU = '<think>\n';

function isThinkPrefillStub_ACU(content: string): boolean {
  return content.trim() === '<think>';
}

type ToolAnchorMessage_ACU = {
  role: string;
  content: string;
  tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>;
  tool_call_id?: string;
};

/**
 * 酒馆会把连续的 assistant 并成前一条，后一条的 tool_calls 被丢掉。
 * 先自己并成一条并保留全部编号，再给缺少编号的工具结果补上对应 tool_call，
 * 否则 MiniMax 会报 tool result's tool id not found。
 */
export function anchorNativeToolCalls_ACU<T extends ToolAnchorMessage_ACU>(messages: readonly T[]): T[] {
  const collapsed: T[] = [];
  for (const message of messages) {
    const previous = collapsed[collapsed.length - 1];
    if (previous?.role === 'assistant' && message.role === 'assistant') {
      const toolCalls = [...(previous.tool_calls ?? []), ...(message.tool_calls ?? [])];
      collapsed[collapsed.length - 1] = {
        ...previous,
        content: [previous.content, message.content].filter(part => part?.trim()).join('\n\n'),
        ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
      };
      continue;
    }
    collapsed.push({ ...message });
  }
  let assistant: T | undefined;
  for (const message of collapsed) {
    if (message.role === 'assistant') assistant = message;
    if (message.role !== 'tool' || !message.tool_call_id || !assistant) continue;
    if ((assistant.tool_calls ?? []).some(call => call.id === message.tool_call_id)) continue;
    assistant.tool_calls = [...(assistant.tool_calls ?? []), {
      id: message.tool_call_id,
      type: 'function',
      function: { name: 'read', arguments: '{}' },
    }];
  }
  return collapsed;
}

/** 工具模式保留消息原序、正文及身份；工具声明由请求 options 控制，不注入预填充。 */
export function withNativeToolThinkPrefill_ACU<T extends ToolAnchorMessage_ACU>(messages: readonly T[]): T[] {
  return messages.map(message => ({ ...message }));
}

/**
 * JSON 模式的历史投影：请求体不带 tools 时，消息里不能出现 tool_calls 与 role=tool。
 * 带调用的助手消息改写为文本 JSON 动作，工具回执改写为用户消息；正文与顺序保持不变。
 */
export function projectNativeToolHistoryToText_ACU<T extends ToolAnchorMessage_ACU>(messages: readonly T[]): T[] {
  return messages.map(message => {
    if (message.role === 'assistant' && message.tool_calls?.length) {
      const { tool_calls: calls, ...rest } = message;
      const actions = calls.map(call => {
        let args: Record<string, unknown>;
        try {
          args = parseArguments_ACU(call.function.arguments);
        } catch {
          args = { arguments: call.function.arguments };
        }
        return JSON.stringify({ ...args, action: call.function.name });
      });
      return { ...rest, content: [message.content, ...actions].filter(part => part?.trim()).join('\n') } as T;
    }
    if (message.role === 'tool' || message.tool_call_id !== undefined) {
      const { tool_call_id: _id, ...rest } = message;
      return { ...rest, role: message.role === 'tool' ? 'user' : message.role } as T;
    }
    return message;
  });
}

/** 无工具声明时仅投影历史工具事务；不删除、移动或追加用户配置的预填充。 */
export function withJsonTailPrefill_ACU<T extends ToolAnchorMessage_ACU>(messages: readonly T[]): T[] {
  return projectNativeToolHistoryToText_ACU(messages);
}

/**
 * assistant 之后必须有 user 或 tool 反馈。一个动作可以跟多条 tool 结果。
 * 纯 assistant/user 交替仍然合法。
 */
export function isModelExchangeSequence_ACU(messages: readonly { role: string }[]): boolean {
  if (!messages.length || messages[0]?.role !== 'assistant') return false;
  let feedback = 0;
  for (const message of messages) {
    if (message.role === 'assistant') {
      if (feedback === 0 && message !== messages[0]) return false;
      feedback = 0;
      continue;
    }
    if (message.role !== 'user' && message.role !== 'tool') return false;
    feedback += 1;
  }
  return feedback > 0;
}

interface ChatTurnAccumulator_ACU {
  content: string;
  calls: Map<number, AiNativeToolCall_ACU>;
  usage: unknown;
}

function accumulator_ACU(): ChatTurnAccumulator_ACU {
  return { content: '', calls: new Map(), usage: undefined };
}

function slot_ACU(state: ChatTurnAccumulator_ACU, index: number): AiNativeToolCall_ACU {
  const existing = state.calls.get(index);
  if (existing) return existing;
  const created = { id: '', name: '', arguments: '' };
  state.calls.set(index, created);
  return created;
}

function rememberUsage_ACU(state: ChatTurnAccumulator_ACU, json: Record<string, unknown>): void {
  if (json.usage && typeof json.usage === 'object') state.usage = json.usage;
  if (json.usageMetadata && typeof json.usageMetadata === 'object') state.usage = json.usageMetadata;
}

export function absorbChatCompletionEvent_ACU(state: ChatTurnAccumulator_ACU, json: unknown): void {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return;
  const record = json as Record<string, unknown>;
  rememberUsage_ACU(state, record);
  const choice = Array.isArray(record.choices) ? record.choices[0] as Record<string, unknown> | undefined : undefined;
  const delta = choice?.delta && typeof choice.delta === 'object' ? choice.delta as Record<string, unknown> : undefined;
  const message = choice?.message && typeof choice.message === 'object' ? choice.message as Record<string, unknown> : undefined;
  const packet = delta ?? message;
  if (packet && typeof packet.content === 'string') state.content += packet.content;
  const listed = packet?.tool_calls;
  if (Array.isArray(listed)) {
    listed.forEach((raw, fallback) => absorbOpenAiToolCall_ACU(state, raw, fallback));
  }
  if (record.type === 'content_block_delta' && record.delta && typeof record.delta === 'object') {
    const anthropic = record.delta as Record<string, unknown>;
    const index = typeof record.index === 'number' ? record.index : 0;
    if (anthropic.type === 'text_delta' && typeof anthropic.text === 'string') state.content += anthropic.text;
    if (anthropic.type === 'input_json_delta' && typeof anthropic.partial_json === 'string') slot_ACU(state, index).arguments += anthropic.partial_json;
  }
  if (record.type === 'content_block_start' && record.content_block && typeof record.content_block === 'object') {
    const block = record.content_block as Record<string, unknown>;
    if (block.type === 'tool_use') {
      const index = typeof record.index === 'number' ? record.index : state.calls.size;
      const current = slot_ACU(state, index);
      if (typeof block.id === 'string') current.id = block.id;
      if (typeof block.name === 'string') current.name = block.name;
    }
  }
  const candidates = Array.isArray(record.candidates) ? record.candidates[0] as Record<string, unknown> | undefined : undefined;
  const parts = candidates?.content && typeof candidates.content === 'object'
    ? (candidates.content as Record<string, unknown>).parts : undefined;
  if (Array.isArray(parts)) {
    for (const part of parts) absorbGeminiPart_ACU(state, part);
  }
}

function absorbOpenAiToolCall_ACU(state: ChatTurnAccumulator_ACU, raw: unknown, fallback: number): void {
  if (!raw || typeof raw !== 'object') return;
  const call = raw as Record<string, unknown>;
  const index = typeof call.index === 'number' ? call.index : fallback;
  const current = slot_ACU(state, index);
  if (typeof call.id === 'string' && call.id) current.id = call.id;
  const fn = call.function && typeof call.function === 'object' ? call.function as Record<string, unknown> : undefined;
  if (typeof fn?.name === 'string' && fn.name) current.name = current.name ? current.name : fn.name;
  if (typeof fn?.arguments === 'string') current.arguments += fn.arguments;
  else if (fn?.arguments && typeof fn.arguments === 'object') current.arguments = JSON.stringify(fn.arguments);
}

function absorbGeminiPart_ACU(state: ChatTurnAccumulator_ACU, raw: unknown): void {
  if (!raw || typeof raw !== 'object') return;
  const part = raw as Record<string, unknown>;
  if (typeof part.text === 'string' && part.thought !== true) state.content += part.text;
  const call = part.functionCall;
  if (!call || typeof call !== 'object') return;
  const fn = call as Record<string, unknown>;
  const name = typeof fn.name === 'string' ? fn.name.slice(fn.name.lastIndexOf(':') + 1) : '';
  const index = state.calls.size;
  const current = name ? slot_ACU(state, index) : (state.calls.get(state.calls.size - 1) ?? slot_ACU(state, index));
  if (name) current.name = name;
  if (typeof fn.id === 'string' && fn.id) current.id = fn.id;
  if (typeof fn.args === 'string') current.arguments += fn.args;
  else if (fn.args && typeof fn.args === 'object') current.arguments = JSON.stringify(fn.args);
}

function finishChatTurn_ACU(state: ChatTurnAccumulator_ACU): AiChatTurn_ACU {
  const toolCalls = [...state.calls.entries()]
    .sort((left, right) => left[0] - right[0])
    .map(([, call], index) => ({
      id: call.id || `call_${index}`,
      name: call.name,
      arguments: call.arguments || '{}',
    }))
    .filter(call => call.name);
  return { content: state.content, toolCalls };
}

export function chatTurnFromJson_ACU(data: unknown): { turn: AiChatTurn_ACU; usage: unknown } {
  const state = accumulator_ACU();
  absorbChatCompletionEvent_ACU(state, data);
  if (typeof data === 'string') state.content = data;
  else if (data && typeof data === 'object' && typeof (data as { content?: unknown }).content === 'string' && !state.content) {
    state.content = (data as { content: string }).content;
  }
  return { turn: finishChatTurn_ACU(state), usage: state.usage };
}

export async function readFetchChatTurn_ACU(response: { headers?: { get(name: string): string | null }; json: () => Promise<unknown>; body?: { getReader(): ReadableStreamDefaultReader<Uint8Array> } }, streaming: boolean, signal?: AbortSignal | null, requireComplete = false, onTextPreview?: (body: string) => void): Promise<{ turn: AiChatTurn_ACU; usage: unknown }> {
  const contentType = response.headers?.get('content-type') ?? '';
  if ((!streaming || requireComplete && contentType.includes('application/json')) && !contentType.includes('text/event-stream')) {
    const json = await response.json();
    if (signal?.aborted) throw new Error('Request aborted');
    if (requireComplete) {
      if (!isCompleteChatResponse_ACU(json)) throw new Error('Phản hồi nội dung chính thiếu trạng thái kết thúc đầy đủ, nội dung chính chưa được xác nhận.');
      const record = json as Record<string, any>;
      if (Array.isArray(record.content)) {
        return chatTurnFromJson_ACU({ content: record.content.filter((part: any) => part?.type === 'text').map((part: any) => part.text).join(''), usage: record.usage });
      }
    }
    return chatTurnFromJson_ACU(json);
  }
  if (requireComplete && !response.body) throw new Error('Luồng nội dung chính thiếu phần thân phản hồi, nội dung chính chưa được xác nhận.');
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  const state = accumulator_ACU();
  let buffer = '';
  let completed = false;
  let lastPreview = '';
  const preview = (): void => {
    if (!onTextPreview || signal?.aborted || state.content === lastPreview) return;
    lastPreview = state.content;
    try { onTextPreview(state.content); }
    catch { /* 展示回调不改变响应解析及完整终态校验。 */ }
  };
  const consume = (line: string): void => {
    if (!line.startsWith('data:')) return;
    const data = line.slice(5).trim();
    if (!data) return;
    if (data === '[DONE]') { completed = true; return; }
    let json: unknown;
    try { json = JSON.parse(data); }
    catch {
      if (requireComplete) throw new Error('Luồng nội dung chính chứa JSON không hợp lệ, nội dung chính chưa được xác nhận.');
      return;
    }
    if (requireComplete && isCompleteChatResponse_ACU(json)) completed = true;
    absorbChatCompletionEvent_ACU(state, json);
  };
  try {
    while (true) {
      if (signal?.aborted) throw new Error('Request aborted');
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (requireComplete) consume(line);
        else {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6);
          if (data === '[DONE]') continue;
          try { absorbChatCompletionEvent_ACU(state, JSON.parse(data)); } catch { /* 保留普通调用的容错语义。 */ }
        }
      }
      preview();
    }
    if (requireComplete) {
      buffer += decoder.decode();
      if (buffer.trim()) consume(buffer);
      preview();
      if (signal?.aborted) throw new Error('Request aborted');
      if (!completed) throw new Error('Luồng nội dung chính kết thúc trước trạng thái kết thúc đầy đủ, nội dung chính chưa được xác nhận.');
    }
  } finally {
    reader.releaseLock();
  }
  return { turn: finishChatTurn_ACU(state), usage: state.usage };
}

/** 仅用于零层完整正文确认；未知终态不推测为成功。 */
function isCompleteChatResponse_ACU(json: unknown): boolean {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return false;
  const record = json as Record<string, any>;
  if (record.error || record.type === 'error') throw new Error('Phản hồi nội dung chính chứa lỗi từ upstream, nội dung chính chưa được xác nhận.');
  const choice = Array.isArray(record.choices) ? record.choices[0] : undefined;
  const candidate = Array.isArray(record.candidates) ? record.candidates[0] : undefined;
  const reason = choice?.finish_reason ?? record.stop_reason ?? record.delta?.stop_reason ?? candidate?.finishReason;
  if (reason !== undefined && reason !== null && !['stop', 'end_turn', 'stop_sequence', 'STOP'].includes(reason)) {
    throw new Error('Phản hồi nội dung chính chưa hoàn tất bình thường, nội dung chính chưa được xác nhận.');
  }
  if (choice?.message?.tool_calls?.length || choice?.delta?.tool_calls?.length
    || record.content_block?.type === 'tool_use' || record.content?.some?.((part: any) => part?.type === 'tool_use')
    || candidate?.content?.parts?.some?.((part: any) => part?.functionCall)) {
    throw new Error('Phản hồi nội dung chính chứa lời gọi công cụ chưa thực thi, nội dung chính chưa được xác nhận.');
  }
  return record.type === 'message_stop' || ['stop', 'end_turn', 'stop_sequence', 'STOP'].includes(reason);
}

import { describe, expect, it } from 'vitest';
import { worldSimulationDirectorRuntimeProtocolInstructionZhLegacy_ACU } from '../../../../src/service/simulation/agent/agent-defaults';
import { worldSimulationOneShotProtocolLegacyZh_ACU } from '../../../../src/service/simulation/agent/agent-format-protocol-legacy';
import { adaptWorldSimulationPromptSegmentsToToolMode_ACU, buildWorldSimulationAgentPromptsForMode_ACU } from '../../../../src/service/simulation/agent/agent-prompt-mode';
import { AGENT_FORMAT_ANSWER_MARKER_ACU } from '../../../../src/shared/agent-prompt-qa';

const segment = (content: string) => ({ role: 'assistant', content, enabled: true, deletable: true, pinned: true });

describe('prompt mặc định tiếng Trung đã lưu vẫn theo công tắc gọi công cụ', () => {
  it('world-director: đoạn định dạng tiếng Trung nguyên bản được chuyển sang biến thể tools và quay lại json, giữ tiếng Trung', () => {
    const stored = segment(AGENT_FORMAT_ANSWER_MARKER_ACU + worldSimulationDirectorRuntimeProtocolInstructionZhLegacy_ACU());
    const [tools] = adaptWorldSimulationPromptSegmentsToToolMode_ACU('world-director', [stored], 'tools');
    expect(tools.content).toContain('调阅调用 read / search；决策单独调用 open_round / delegate / finalize / block');
    const [json] = adaptWorldSimulationPromptSegmentsToToolMode_ACU('world-director', [tools], 'json');
    expect(json.content).toContain('仅输出一个主动作 JSON：read、search、open_round、delegate、finalize 或 block');
  });

  it('role giao nộp một lần: bản tiếng Trung cũ được chuyển theo công tắc, chỉnh sửa của người dùng ở phần khác được giữ', () => {
    const modules = ['clock', 'dimensions', 'seeds'] as const;
    const stored = segment(`${AGENT_FORMAT_ANSWER_MARKER_ACU}${worldSimulationOneShotProtocolLegacyZh_ACU('undercurrent-analyst', modules, 'json')}\n用户补充`);
    const [tools] = adaptWorldSimulationPromptSegmentsToToolMode_ACU('undercurrent-analyst', [stored], 'tools');
    expect(tools.content).toContain(worldSimulationOneShotProtocolLegacyZh_ACU('undercurrent-analyst', modules, 'tools'));
    expect(tools.content.endsWith('用户补充')).toBe(true);
  });

  it('prompt mặc định hiện hành bằng tiếng Việt vẫn theo công tắc', () => {
    const tools = buildWorldSimulationAgentPromptsForMode_ACU('tools')['world-director'].find(item => item.content.startsWith(AGENT_FORMAT_ANSWER_MARKER_ACU))!;
    const json = buildWorldSimulationAgentPromptsForMode_ACU('json')['world-director'].find(item => item.content.startsWith(AGENT_FORMAT_ANSWER_MARKER_ACU))!;
    expect(tools.content).toContain('quyết định gọi riêng một trong open_round / delegate / finalize / block');
    expect(json.content).toContain('Chỉ xuất một JSON hành động chính');
    expect(adaptWorldSimulationPromptSegmentsToToolMode_ACU('world-director', [json], 'tools')[0].content).toBe(tools.content);
  });
});

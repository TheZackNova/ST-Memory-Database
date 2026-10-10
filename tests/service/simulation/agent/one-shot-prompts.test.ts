import { describe, expect, it } from 'vitest';
import { buildDefaultWorldSimulationAgentPrompts_ACU, buildV21WorldSimulationAgentPrompt_ACU, buildV22WorldSimulationAgentPrompt_ACU, buildV23WorldSimulationAgentPrompt_ACU, buildV24WorldSimulationAgentPrompt_ACU, buildV25WorldSimulationAgentPrompt_ACU, buildV26WorldSimulationAgentPrompt_ACU, buildV27WorldSimulationAgentPrompt_ACU, WORLD_SIMULATION_PROMPT_VERSION_ACU, WORLD_SIMULATION_PROMPT_VERSION_V21_ACU, WORLD_SIMULATION_PROMPT_VERSION_V22_ACU, WORLD_SIMULATION_PROMPT_VERSION_V23_ACU, WORLD_SIMULATION_PROMPT_VERSION_V24_ACU, WORLD_SIMULATION_PROMPT_VERSION_V25_ACU, WORLD_SIMULATION_PROMPT_VERSION_V26_ACU, WORLD_SIMULATION_PROMPT_VERSION_V27_ACU, WORLD_SIMULATION_PROMPT_VERSION_V35_ACU } from '../../../../src/service/simulation/agent/agent-defaults';
import { oneShotBootstrapNotice_ACU, worldSimulationOneShotProtocol_ACU } from '../../../../src/service/simulation/agent/agent-subagent-runtime';
import { validateWorldSimulationPromptSegments_ACU } from '../../../../src/service/simulation/agent/prompt-template';
import { buildDefaultWorldSimulationEnvelope_ACU } from '../../../../src/service/simulation/defaults';
import { stripWritingAnnotations_ACU } from '../../../../src/service/simulation/simulation-projection';
import { validateWorldSimulationEnvelope_ACU } from '../../../../src/service/simulation/simulation-store';
import { isAgentHistorySlot_ACU, isAgentSnapshotSlot_ACU } from '../../../../src/shared/agent-prompt-layout';
import { USER_PREFILL_CONTENT_ACU } from '../../../../src/shared/user-prefill';

const roles = ['undercurrent-analyst', 'dramatis-keeper', 'guidance-composer'] as const;
/** 手写版把运行逻辑拆进多组问答，推演细则不集中在单个段，断言按整份提示词检查。 */
const fullBody = (segments: readonly { content: string }[]): string => segments.map(item => item.content).join('\n');

describe('一次性资料角色默认提示词', () => {
  it('三个角色的 seam 均合法，变更通过 write_sql 交待验证候选', () => {
    const prompts = buildDefaultWorldSimulationAgentPrompts_ACU();
    for (const role of roles) {
      expect(() => validateWorldSimulationPromptSegments_ACU(prompts[role], role)).not.toThrow();
      const body = prompts[role].map(item => item.content).join('\n');
      expect(body).toContain('Tập ghi tôi nộp chỉ là ứng viên chờ xác minh');
      expect(body).not.toContain('timekeeper');
      expect(body).not.toContain('chronicler');
      expect(body).not.toContain('【输出协议】');
      expect(body).not.toContain('最终只交协议 JSON');
      // 运行逻辑以问答自述承载：每张负责的表都要得出写或不写的结论，交付前逐项核对。
      expect(body).toContain('đưa ra kết luận ghi hay không ghi');
      expect(body).toContain('Trước khi nộp đối chiếu từng mục:');
      expect(body).toContain('cùng một lần write_sql');
    }
    const guidanceBody = prompts['guidance-composer'].map(item => item.content).join('\n');
    expect(guidanceBody).toContain('chronicle_overview');
    expect(guidanceBody).toContain('không được ghi summary hay related_ids vào chronicle_overview');
    expect(guidanceBody).toContain('cũng không được bịa ID giả như rumors:1');
    const protocol = worldSimulationOneShotProtocol_ACU('guidance-composer', ['chronicle', 'rumors', 'guidance']);
    expect(protocol).toContain('hãy gọi write_sql trước');
    expect(protocol).toContain('ở lần trả lời kế tiếp hãy gọi submit riêng');
    expect(protocol).toContain('Phản hồi rỗng và dòng trạng thái trần đều không phải là bản nộp');
    expect(protocol).not.toContain('"status":"candidate"');
    expect(protocol).toContain('chronicle_overview=(fingerprint, day, one_line, archive_ref)');
    expect(protocol).toContain('ID giả như rumors:1');
    expect(protocol).not.toContain('"reads":["ledger:current"]');
    expect(protocol).toContain('ledger:current không phải địa chỉ mà vai trò thông thường được đọc');
    expect(protocol).toContain('Bản nộp không kèm sql hay patch');
    expect(protocol).toContain('【Danh sách cột được phép ghi】');
    expect(protocol).toContain('guidance(signals, excluded_facts, evidence_refs)');
    const clockProtocol = worldSimulationOneShotProtocol_ACU('undercurrent-analyst', ['clock', 'dimensions', 'seeds']);
    expect(clockProtocol).toContain('clock(days, story_time, slot, evidence_refs)');
    expect(clockProtocol).not.toMatch(/clock\([^)]*\bday\b/);
    expect(clockProtocol).not.toMatch(/dimensions\([^)]*visibility/);
  });

  it('SQL 写法纪律落到具体语句，无变化不被说成失败', () => {
    const prompts = buildDefaultWorldSimulationAgentPrompts_ACU();
    const workflow = (role: typeof roles[number]) => fullBody(prompts[role]);
    for (const role of roles) {
      expect(workflow(role)).toContain('【Danh sách cột được phép ghi】');
      expect(workflow(role)).toContain('INSERT hàng mới không ghi revision hay expected_revision');
      expect(workflow(role)).not.toContain('其余行各用自身 revision');
    }
    expect(workflow('undercurrent-analyst')).toContain('clock.days là lượng đẩy tiến của lượt này, không phải ngày tuyệt đối');
    expect(workflow('dramatis-keeper')).toContain('singleton player ghi WHERE expected_revision = số sửa đổi singleton do runtime đưa');
    expect(workflow('dramatis-keeper')).toContain('đó là không đổi chứ không phải thất bại');
  });

  it('各角色自述里写明证据判断与反例', () => {
    const prompts = buildDefaultWorldSimulationAgentPrompts_ACU();
    const workflow = (role: typeof roles[number]) => fullBody(prompts[role]);
    expect(workflow('undercurrent-analyst')).toContain('không có đẩy tiến rõ ràng thì không ghi clock');
    expect(workflow('dramatis-keeper')).toContain('Không trả lời được thì không ghi, thà để họ tiếp tục phán đoán sai');
    expect(workflow('guidance-composer')).toContain('phong thanh hay kỷ yếu mới tạo trong ứng viên này không được làm nguồn');
    for (const role of roles) {
      expect(workflow(role)).toContain('expected_revision');
      expect(workflow(role)).toContain('ó thể xảy ra" tuyệt đối không được viết thành "đã xảy ra"');
    }
  });

  it('三个角色分别覆盖所有职责并在交付前逐项核对，冻结的 v24/v26/v27 正文不被改写', () => {
    const prompts = buildDefaultWorldSimulationAgentPrompts_ACU();
    const checks = {
      'undercurrent-analyst': ['clock (trình tự thời gian)', 'dimensions (thang đo cục diện)', 'seeds (phục bút)', 'Trình tự thời gian và thang đo cục diện mỗi thứ suy diễn thế nào?', 'Phục bút tồn kho đẩy tiến thế nào, đến hạn quyết toán ra sao?', 'Thời hạn:', 'Khi nào gieo phục bút mới?', 'Cuối cùng đối chiếu chéo:'],
      'dramatis-keeper': ['actors (danh bạ nhân vật) và player (hoàn cảnh người chơi)', 'phong thanh đi kèm cái chết của nhân vật', 'Bước hai, người chơi:', 'Bước ba, điểm danh lập hồ sơ:', 'Bước bốn, cập nhật nhân vật đã có hồ sơ:', 'Bước năm, nhận thức và sống chết:'],
      'guidance-composer': ['chronicle (kỷ yếu hậu trường, gồm cả lưu trữ theo cặp)', 'rumors (phong thanh)', 'guidance (tín hiệu ngoài màn)', 'Kỷ yếu hậu trường viết thế nào?', 'lưu trữ theo cặp', 'Bước ba, phong thanh:', 'Chọn đề tài trước hết xem hướng ống kính', 'Tín hiệu cũ dọn dẹp thế nào?'],
    } as const;
    for (const role of roles) {
      const workflow = fullBody(prompts[role]);
      for (const check of checks[role]) expect(workflow).toContain(check);
      expect(workflow).toContain('cùng một lần write_sql');
      const old = buildV24WorldSimulationAgentPrompt_ACU(role);
      expect(old.find(segment => segment.content.includes('【推演步骤】'))!.content).not.toContain('【职责清单】');
      const v26 = buildV26WorldSimulationAgentPrompt_ACU(role).find(segment => segment.content.includes('【推演步骤】'))!.content;
      expect(v26).not.toContain('【首轮建账】');
      // v27 仍是集中在 WORKFLOW 段的旧结构，当前默认已改为问答组。
      const v27 = buildV27WorldSimulationAgentPrompt_ACU(role);
      expect(v27.find(segment => segment.content.includes('【推演步骤】'))!.content).toContain('【首轮建账】');
      expect(fullBody(v27)).not.toBe(workflow);
    }
  });

  it('各角色写明首轮建账，去掉新建条数硬上限，且只用格林推演自己的术语', () => {
    const prompts = buildDefaultWorldSimulationAgentPrompts_ACU();
    const bootstrap = {
      'undercurrent-analyst': 'Lượt đầu sổ cái rỗng thì dựng sổ thế nào?',
      'dramatis-keeper': 'Lượt đầu sổ cái rỗng thì lập thế nào?',
      'guidance-composer': 'Lượt đầu khi sổ cái vừa dựng xong thì viết ra sao?',
    } as const;
    for (const role of roles) {
      const body = fullBody(prompts[role]);
      expect(body).toContain(bootstrap[role]);
      expect(body).toContain('hệ thống mô phỏng thế giới');
      expect(body).not.toMatch(/暗流|种子|行动者|编年|传闻|投影|世界推演/);
      expect(body).not.toContain('本轮最多新建 3 条');
      expect(body).not.toContain('本轮最多新增 3 人');
      expect(body).toContain('INSERT hàng mới không ghi revision hay expected_revision');
    }
    const dramatis = fullBody(prompts['dramatis-keeper']);
    expect(dramatis).toContain('mọi nhân vật có tên trong neo đều lập hồ sơ');
    expect(dramatis).toContain('chỉ cần không phải người qua đường dùng một lần, thì lượt này lập hồ sơ');
    const undercurrent = fullBody(prompts['undercurrent-analyst']);
    expect(undercurrent).toContain('gieo 3-6 phục bút');
    expect(undercurrent).toContain('chắt lọc 2-5 thang đo cục diện');
  });

  it('结构：单条 system 身份，运行逻辑由多组 user 提问与 assistant 自述承载', () => {
    const prompts = buildDefaultWorldSimulationAgentPrompts_ACU();
    for (const role of roles) {
      const segments = prompts[role];
      expect(() => validateWorldSimulationPromptSegments_ACU(segments, role)).not.toThrow();
      // 快照卡之外只有开头一条 system 身份，不承载推演细则。
      const systems = segments.filter(item => item.role === 'system' && !isAgentSnapshotSlot_ACU(item));
      expect(systems).toHaveLength(1);
      expect(segments[0]).toBe(systems[0]);
      expect(segments.filter(isAgentSnapshotSlot_ACU)).toHaveLength(1);
      expect(segments.filter(isAgentHistorySlot_ACU)).toHaveLength(1);
      expect(segments.findIndex(isAgentSnapshotSlot_ACU)).toBeLessThan(segments.findIndex(isAgentHistorySlot_ACU));
      expect(segments.at(-1)).toMatchObject({ role: 'user', content: USER_PREFILL_CONTENT_ACU, enabled: true, deletable: false, pinned: true });
      expect(systems[0].content).not.toContain('đưa ra kết luận ghi hay không ghi');
      // 至少 3 组问答，且每个 assistant 自述都紧跟在一个 user 提问之后。
      const pairs = segments.filter((item, index) => item.role === 'assistant' && segments[index - 1]?.role === 'user');
      expect(pairs.length).toBeGreaterThanOrEqual(3);
      expect(segments.filter(item => item.role === 'assistant').length).toBe(pairs.length);
      expect(pairs.some(item => item.content.includes('đưa ra kết luận ghi hay không ghi'))).toBe(true);
    }
    const dramatis = fullBody(prompts['dramatis-keeper']);
    // 行为拆成短期/长期并各带预计持续时间，只有显式 done/abandoned 才归档经历；认知为与当前剧情相关的覆盖式快照。
    expect(dramatis).toContain('current_action');
    expect(dramatis).toContain('long_term_action');
    expect(dramatis).toContain('thời gian dự kiến kéo dài');
    expect(dramatis).toContain('Chỉ khi ghi rõ done hoặc abandoned');
    expect(dramatis).toContain('known_facts là ảnh chụp hiện tại ghi đè');
    expect(dramatis).not.toContain('保留仍成立的旧认知');
    expect(dramatis).toContain('Độc giả biết, sổ cái ghi, đều không có nghĩa là nhân vật này biết');
    expect(fullBody(prompts['undercurrent-analyst'])).toContain('Làm sao đảm bảo mô phỏng đi theo chính văn');
  });

  it('运行时对空账本与空模块给出首轮建账标记，非空时不打扰', () => {
    const empty = { clock: { day: 1 }, dimensions: [], seeds: [], actors: [], rumors: [], chronicle: [] } as any;
    expect(oneShotBootstrapNotice_ACU(0, ['clock', 'dimensions', 'seeds'], empty)[0]).toContain('【Dựng sổ cái đợt đầu】Sổ cái chưa được lập');
    expect(oneShotBootstrapNotice_ACU(0, ['clock', 'dimensions', 'seeds'], empty)[0]).toContain('dimensions, seeds');
    expect(oneShotBootstrapNotice_ACU(3, ['actors', 'player', 'rumors'], empty)[0]).toContain('【Module rỗng】actors, rumors mà bạn phụ trách hiện đang rỗng');
    const filled = { ...empty, actors: [{ id: 'a' }], rumors: [{ id: 'r' }] };
    expect(oneShotBootstrapNotice_ACU(3, ['actors', 'player', 'rumors'], filled)).toEqual([]);
  });

  it.each([
    [WORLD_SIMULATION_PROMPT_VERSION_V21_ACU, buildV21WorldSimulationAgentPrompt_ACU],
    [WORLD_SIMULATION_PROMPT_VERSION_V22_ACU, buildV22WorldSimulationAgentPrompt_ACU],
    [WORLD_SIMULATION_PROMPT_VERSION_V23_ACU, buildV23WorldSimulationAgentPrompt_ACU],
    [WORLD_SIMULATION_PROMPT_VERSION_V24_ACU, buildV24WorldSimulationAgentPrompt_ACU],
    [WORLD_SIMULATION_PROMPT_VERSION_V25_ACU, buildV25WorldSimulationAgentPrompt_ACU],
    [WORLD_SIMULATION_PROMPT_VERSION_V26_ACU, buildV26WorldSimulationAgentPrompt_ACU],
    [WORLD_SIMULATION_PROMPT_VERSION_V27_ACU, buildV27WorldSimulationAgentPrompt_ACU],
  ] as const)('%s 存量提示词读出时整组重置为当前默认，用户改写与追加段一并重置', (version, buildPrevious) => {
    const envelope = buildDefaultWorldSimulationEnvelope_ACU() as any;
    envelope.settings.promptForceDefaultVersion = version;
    for (const role of roles) envelope.settings.agentPrompts[role] = buildPrevious(role);
    envelope.settings.agentPrompts['dramatis-keeper'][4].content += '\n用户补充：严格核实人物渠道';
    envelope.settings.agentPrompts['guidance-composer'].push({ role: 'user', content: '用户追加说明', enabled: true, deletable: true, pinned: false });

    const loaded = validateWorldSimulationEnvelope_ACU(envelope);

    expect(loaded.settings.promptForceDefaultVersion).toBe(WORLD_SIMULATION_PROMPT_VERSION_ACU);
    expect(loaded.settings.agentPrompts).toEqual(buildDefaultWorldSimulationAgentPrompts_ACU());
  });

  it('非时钟角色按本轮时间跨度约束推演，批次二直接采用批次一维护的 clock', () => {
    const prompts = buildDefaultWorldSimulationAgentPrompts_ACU();
    const workflow = (role: typeof roles[number]) => fullBody(prompts[role]);
    expect(workflow('dramatis-keeper')).toContain('đều không được vượt quá khoảng thời gian của lượt này');
    expect(workflow('dramatis-keeper')).toContain('tôi không ghi clock');
    expect(workflow('guidance-composer')).toContain('không cộng thêm số ngày trôi qua');
    expect(workflow('undercurrent-analyst')).toContain('chỉ tính phần đẩy tiến xảy ra rõ ràng trong neo');
  });

  it('锚点仅为提示词剥离写作注释，原始文本保持不变', () => {
    const anchor = '正文甲<!-- segment_plan: 内部写作笔记 -->\n\n\n正文乙';
    expect(stripWritingAnnotations_ACU(anchor)).toBe('正文甲\n\n正文乙');
    expect(anchor).toContain('segment_plan');
  });

  it('旧版本信封里的旧角色键与自定义旧协议提示词读出时整组归一到当前默认', () => {
    const defaults = buildDefaultWorldSimulationAgentPrompts_ACU();
    const envelope = buildDefaultWorldSimulationEnvelope_ACU() as any;
    envelope.settings.promptForceDefaultVersion = WORLD_SIMULATION_PROMPT_VERSION_V35_ACU;
    envelope.settings.agentPrompts['undercurrent-analyst'][0].content += '\n旧版自定义逐栏 write_sql';
    envelope.settings.agentPrompts.timekeeper = structuredClone(defaults['undercurrent-analyst']);
    envelope.settings.agentPrompts.chronicler = structuredClone(defaults['guidance-composer']);

    const loaded = validateWorldSimulationEnvelope_ACU(envelope);

    expect(Object.keys(loaded.settings.agentPrompts)).not.toContain('timekeeper');
    expect(Object.keys(loaded.settings.agentPrompts)).not.toContain('chronicler');
    expect(loaded.settings.agentPrompts['undercurrent-analyst']).toEqual(defaults['undercurrent-analyst']);
  });
});

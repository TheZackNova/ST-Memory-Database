import { describe, expect, it } from 'vitest';

import { AGENT_RUNTIME_SNAPSHOT_TEMPLATE_ACU } from '../../../../src/service/continuation/agent/agent-defaults';
import {
  buildEmptyAgentWorldbookSnapshot_ACU,
  renderAgentWorldbookBrowseCatalog_ACU,
  renderAgentWorldbookCatalog_ACU,
  renderAgentWorldbookEntries_ACU,
  renderAgentWorldbookHitBodies_ACU,
  renderAgentWorldbookHits_ACU,
  renderAgentWorldbookTriggeredInjection_ACU,
  selectTriggeredWorldbookEntries_ACU,
  type AgentWorldbookSnapshot_ACU,
} from '../../../../src/service/continuation/agent/agent-worldbook-read';

function snapshot_ACU(): AgentWorldbookSnapshot_ACU {
  return {
    available: true,
    entries: [
      { bookName: '设定集', uid: '7', title: '晶屑设定', keys: ['晶屑', '禁区'], constant: false, content: '黑色晶屑是禁区核心的碎片。', tokens: 18 },
      { bookName: '设定集', uid: '9', title: '守门人', keys: [], constant: true, content: '守门人世代驻守铁门。', tokens: 12 },
    ],
  };
}

describe('运行时快照资料边界', () => {
  it('不再单独注入表格目录；世界书仍通过命中条目和读取地址访问', () => {
    expect(AGENT_RUNTIME_SNAPSHOT_TEMPLATE_ACU).not.toContain('$TABLE_CATALOG');
    expect(AGENT_RUNTIME_SNAPSHOT_TEMPLATE_ACU).toContain('$WORLDBOOK_HITS');
    expect(AGENT_RUNTIME_SNAPSHOT_TEMPLATE_ACU).toContain('$AGENT_READ_CATALOG');
  });
});

describe('世界书目录渲染', () => {
  it('每条一行：标题、关键词、10 字摘要、token 估算与精读地址', () => {
    const catalog = renderAgentWorldbookCatalog_ACU(snapshot_ACU());
    expect(catalog).toContain('晶屑设定｜từ khóa: 晶屑, 禁区');
    expect(catalog).toContain('守门人｜từ khóa: (không có)');
    expect(catalog).toContain('tóm tắt: 黑色晶屑是禁区核心的');
    expect(catalog).toContain('khoảng 18 token');
    expect(catalog).toContain('$WORLDBOOK:设定集:7');
    expect(catalog).toContain('$WORLDBOOK:设定集:9');
    // 目录只有标题与元信息，不注入条目全文。
    expect(catalog).not.toContain('黑色晶屑是禁区核心的碎片。');
  });

  it('读取失败与空快照分别如实标注，不混为一谈', () => {
    expect(renderAgentWorldbookCatalog_ACU(buildEmptyAgentWorldbookSnapshot_ACU(false))).toContain('danh mục không khả dụng');
    expect(renderAgentWorldbookCatalog_ACU(buildEmptyAgentWorldbookSnapshot_ACU(true))).toContain('Hiện không có mục sổ thế giới nào đang bật');
  });
});

it('共享命中说明不向普通角色承诺 search，总纲目录仍保留检索例外', () => {
  const injection = renderAgentWorldbookTriggeredInjection_ACU(snapshot_ACU(), '晶屑');
  expect(injection).toContain('黑色晶屑是禁区核心的碎片。');
  expect(injection).toContain('danh mục tư liệu và công cụ mà vai trò hiện tại được cấp quyền');
  expect(injection).not.toContain('dùng search');
  expect(renderAgentWorldbookBrowseCatalog_ACU(snapshot_ACU())).toContain('dùng search');
});

describe('世界书命中提示', () => {
  it('常开条目始终命中，关键词条目按扫描文本包含匹配命中', () => {
    const hits = renderAgentWorldbookHits_ACU(snapshot_ACU(), '主角捡起一枚晶屑端详。');
    expect(hits).toContain('晶屑设定 (khớp từ khóa｜khoảng 18 token)');
    expect(hits).toContain('守门人 (luôn bật｜khoảng 12 token)');
    expect(hits).toContain('$WORLDBOOK:设定集:7');
  });

  it('无关键词命中时只列常开条目；全无命中与不可用分别如实说明', () => {
    const onlyConstant = renderAgentWorldbookHits_ACU(snapshot_ACU(), '与设定无关的日常对话。');
    expect(onlyConstant).toContain('守门人 (luôn bật');
    expect(onlyConstant).not.toContain('晶屑设定');

    const noConstant: AgentWorldbookSnapshot_ACU = {
      available: true,
      entries: [{ bookName: '设定集', uid: '7', title: '晶屑设定', keys: ['晶屑'], constant: false, content: 'x', tokens: 1 }],
    };
    expect(renderAgentWorldbookHits_ACU(noConstant, '无关文本')).toContain('không khớp từ khóa của mục sổ thế giới nào');
    expect(renderAgentWorldbookHits_ACU(buildEmptyAgentWorldbookSnapshot_ACU(false), '晶屑')).toContain('không thể đưa ra gợi ý khớp');
  });
});

describe('世界书迭代触发', () => {
  it('常量正文可以继续触发关键词条目，排除递归的条目只看最初扫描文本', () => {
    const entries = [
      { bookName: '设定集', uid: '1', title: '常开', keys: [], constant: true, preventRecursion: false, content: '禁区入口有守门人。', tokens: 8 },
      { bookName: '设定集', uid: '2', title: '守门人', keys: ['守门人'], constant: false, content: '守门人佩戴晶屑。', tokens: 8 },
      { bookName: '设定集', uid: '3', title: '晶屑', keys: ['晶屑'], constant: false, content: '晶屑不能带离。', tokens: 6 },
      { bookName: '设定集', uid: '4', title: '只看原文', keys: ['晶屑'], constant: false, excludeRecursion: true, content: '这条不该被常量正文带出。', tokens: 6 },
    ];
    const triggered = selectTriggeredWorldbookEntries_ACU(entries, '今天只是进城。');
    expect(triggered.map(entry => entry.uid)).toEqual(['1', '2', '3']);
    const bodies = renderAgentWorldbookHitBodies_ACU({ available: true, entries }, '今天只是进城。');
    expect(bodies).toContain('守门人佩戴晶屑。');
    expect(bodies).toContain('晶屑不能带离。');
    expect(bodies).not.toContain('这条不该被常量正文带出。');
  });
});

describe('世界书条目精读', () => {
  it('按书名 + uid 返回全文，未知 uid 如实列出', () => {
    const text = renderAgentWorldbookEntries_ACU(snapshot_ACU(), '设定集', ['7', '99']);
    expect(text).toContain('黑色晶屑是禁区核心的碎片。');
    expect(text).toContain('Các uid sau không tồn tại trong các mục đang bật của "设定集": 99');
  });

  it('未知书名、地址不完整与读取失败都回灌可修正的错误文本', () => {
    expect(renderAgentWorldbookEntries_ACU(snapshot_ACU(), '不存在的书', ['7'])).toContain('không có sổ thế giới "不存在的书"');
    expect(renderAgentWorldbookEntries_ACU(snapshot_ACU(), '', [])).toContain('không đầy đủ');
    expect(renderAgentWorldbookEntries_ACU(buildEmptyAgentWorldbookSnapshot_ACU(false), '设定集', ['7'])).toContain('Đọc sổ thế giới lượt này thất bại');
  });
});

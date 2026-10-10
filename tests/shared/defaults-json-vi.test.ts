/**
 * tests/shared/defaults-json-vi.test.ts
 * 默认提示词越南语化：标签与表名/列名标识符不再残留中文，旧默认仍可识别
 */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_BUILTIN_PLOT_PRESETS_ACU,
  DEFAULT_CHAR_CARD_PROMPT_ACU,
  DEFAULT_CHAR_CARD_PROMPT_SQL_ACU,
  DEFAULT_CONTENT_OPTIMIZATION_PROMPT_GROUP_ACU,
  DEFAULT_MERGE_SUMMARY_PROMPT_ACU,
  DEFAULT_MERGE_SUMMARY_PROMPT_SQL_ACU,
  DEFAULT_PLOT_PROMPT_GROUP_ACU,
  DEFAULT_PLOT_SETTINGS_ACU,
  TABLE_FILL_MAIN_PROMPT_HISTORY_ACU,
} from '../../src/shared/defaults-json.js';
import {
  localizeDefaultText_ACU,
  localizeDefaultTextKeepingZhIdentifiers_ACU,
} from '../../src/shared/defaults-json-vi.js';

const HAN_ACU = /[一-鿿]/;

function collectHanLines(value: unknown, path: string, out: string[]): void {
  if (typeof value === 'string') {
    value.split('\n').filter(line => HAN_ACU.test(line)).forEach(line => out.push(`${path}: ${line}`));
  } else if (Array.isArray(value)) {
    value.forEach((item, index) => collectHanLines(item, `${path}[${index}]`, out));
  } else if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) collectHanLines(item, `${path}.${key}`, out);
  }
}

describe('默认提示词越南语化', () => {
  it('填表、剧情推进、正文优化与合并纪要的默认提示词不含中文标签或中文表名/列名', () => {
    const remaining: string[] = [];
    collectHanLines(DEFAULT_CHAR_CARD_PROMPT_ACU, 'charCard', remaining);
    collectHanLines(DEFAULT_CHAR_CARD_PROMPT_SQL_ACU, 'charCardSql', remaining);
    collectHanLines(DEFAULT_PLOT_PROMPT_GROUP_ACU, 'plotGroup', remaining);
    collectHanLines(DEFAULT_PLOT_SETTINGS_ACU, 'plotSettings', remaining);
    collectHanLines(DEFAULT_CONTENT_OPTIMIZATION_PROMPT_GROUP_ACU, 'optimization', remaining);
    collectHanLines(DEFAULT_MERGE_SUMMARY_PROMPT_ACU, 'mergeSummary', remaining);
    collectHanLines(DEFAULT_MERGE_SUMMARY_PROMPT_SQL_ACU, 'mergeSummarySql', remaining);
    expect(remaining).toEqual([]);
  });

  it('内置时间召回预设只保留预设名为中文：它是预设引用使用的身份', () => {
    const remaining: string[] = [];
    collectHanLines(DEFAULT_BUILTIN_PLOT_PRESETS_ACU, 'builtin', remaining);
    expect(remaining).toEqual(['builtin[0].name: 时间召回']);
    expect(DEFAULT_BUILTIN_PLOT_PRESETS_ACU[0].plotTasks[0].name).toBe('Tác vụ mặc định');
  });

  it('标签成对替换为越南语', () => {
    const fillPrompt = DEFAULT_CHAR_CARD_PROMPT_ACU.map((segment: any) => segment.content).join('\n');
    expect(fillPrompt).toContain('<Dữ liệu bảng hiện tại>');
    expect(fillPrompt).toContain('</Dữ liệu bảng hiện tại>');
    expect(fillPrompt).toContain('<Dữ liệu chính văn>');
    expect(fillPrompt).toContain('- <Bối cảnh thiết lập>:');
    const plotPrompt = DEFAULT_PLOT_PROMPT_GROUP_ACU.map((segment: any) => segment.content).join('\n');
    expect(plotPrompt).toContain('<Dàn ý tổng kết>');
    expect(plotPrompt).toContain('</Dàn ý tổng kết>');
    expect(plotPrompt).toContain('<Ngữ cảnh trước đó>');
  });

  it('localizeDefaultText_ACU 先整行替换再替换标识符，长标识符优先于它包含的短标识符', () => {
    expect(localizeDefaultText_ACU('<已发生的事件概览>\n$1\n</已发生的事件概览>'))
      .toBe('<Tổng quan sự kiện đã xảy ra>\n$1\n</Tổng quan sự kiện đã xảy ra>');
    expect(localizeDefaultText_ACU('total_AM_in_概览')).toBe('total_AM_in_Tổng quan');
    expect(localizeDefaultText_ACU('纪要表 / 纪要批次')).toBe('Bảng kỷ yếu / Lô kỷ yếu');
    expect(localizeDefaultTextKeepingZhIdentifiers_ACU('<背景设定>')).toBe('<背景设定>');
    expect(localizeDefaultText_ACU('')).toBe('');
  });

  it('填表主段历史依次保留：现行越南语默认、首轮越南语化默认（中文标签）、中文旧默认', () => {
    for (const history of [TABLE_FILL_MAIN_PROMPT_HISTORY_ACU.native, TABLE_FILL_MAIN_PROMPT_HISTORY_ACU.sql]) {
      const generation = history.length / 3;
      expect(Number.isInteger(generation)).toBe(true);
      expect(new Set(history).size).toBe(history.length);
      for (let index = 0; index < generation; index += 1) {
        const [current, firstPass, zh] = [history[index], history[generation + index], history[2 * generation + index]];
        expect(current).toBe(localizeDefaultText_ACU(zh));
        expect(firstPass).toBe(localizeDefaultTextKeepingZhIdentifiers_ACU(zh));
        expect(HAN_ACU.test(current)).toBe(false);
        expect(firstPass).toContain('<当前表格数据>');
      }
    }
  });
});

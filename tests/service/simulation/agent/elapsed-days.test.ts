/**
 * tests/service/simulation/agent/elapsed-days.test.ts
 * 世界推演锚点的整日跨度推断：中文与越南语
 */
import { describe, expect, it } from 'vitest';
import { inferWorldSimulationElapsedDays_ACU } from '../../../../src/service/simulation/agent/agent-subagent-runtime';

describe('inferWorldSimulationElapsedDays_ACU', () => {
  it.each([
    ['一行人经过三天抵达王城。', 3],
    ['历时 12 天的围城结束了。', 12],
    ['他连续两日没有合眼。', 2],
    ['过了一夜，雨停了。', 1],
    ['昨天的约定，今天就要兑现。', 1],
    ['他想起三年前的那个雨夜。', 0],
    ['', 0],
  ])('中文锚点「%s」→ %i 天', (anchor, expected) => {
    expect(inferWorldSimulationElapsedDays_ACU(anchor)).toBe(expected);
  });

  it.each([
    ['Cả đoàn trải qua ba ngày mới tới vương thành.', 3],
    ['Cuộc vây thành kéo dài 12 ngày đã kết thúc.', 12],
    ['Họ mất hai ngày để vượt đèo.', 2],
    ['Ba ngày trôi qua, vẫn không có tin tức.', 3],
    ['5 ngày đêm đã trôi qua kể từ trận chiến.', 5],
    ['Anh ta liên tục 4 ngày không chợp mắt.', 4],
    ['Mưa suốt  năm\nngày không dứt.', 5],
    ['Qua một đêm, mưa đã tạnh.', 1],
    ['Sau một ngày một đêm, họ tới nơi.', 1],
    ['Lời hẹn hôm qua, hôm nay phải thực hiện.', 1],
    ['TRẢI QUA MƯỜI NGÀY lênh đênh trên biển.', 10],
  ])('越南语锚点「%s」→ %i 天', (anchor, expected) => {
    expect(inferWorldSimulationElapsedDays_ACU(anchor)).toBe(expected);
  });

  it.each([
    ['Anh nhớ lại đêm mưa ba năm trước.'],
    ['Hôm nay trời đẹp.'],
    ['Hôm qua trời mưa.'],
    ['Ba ngày nữa sẽ tới lễ hội.'],
    ['Cô ấy đếm từng ngày trôi qua.'],
    ['Thanh kiếm giá ba trăm ngày công.'],
    ['Họ sẽ ở lại trong ba ngày tới.'],
  ])('越南语锚点没有可机械确认的整日跨度时返回 0：「%s」', anchor => {
    expect(inferWorldSimulationElapsedDays_ACU(anchor)).toBe(0);
  });
});

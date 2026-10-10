import { ZERO_LAYER_HISTORY_DEFAULT_LIMIT_ACU, ZERO_LAYER_HISTORY_MAX_LIMIT_ACU,
  type ZeroLayerHistoryQuery_ACU } from './history-model';
import { ZeroLayerHistoryReadError_ACU } from './history-errors';

/** 公开查询只接受版本、分页和回合身份；不能指定聊天、分支或私有读取模式。 */
export function validateZeroLayerHistoryQuery_ACU(raw: unknown, snapshotOnly = false): ZeroLayerHistoryQuery_ACU {
  const fail = (message: string): never => { throw new ZeroLayerHistoryReadError_ACU('invalid-query', message); };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail('Truy vấn lịch sử phải là một đối tượng.');
  const query = raw as Record<string, unknown>;
  const allowed = snapshotOnly ? ['version'] : ['version', 'snapshotToken', 'cursor', 'direction', 'limit', 'turnId'];
  if (Object.keys(query).some(key => !allowed.includes(key))) fail('Truy vấn chứa trường chưa được cấp phép.');
  if (query.version !== 1) throw new ZeroLayerHistoryReadError_ACU('unsupported-version', 'Giao diện lịch sử chỉ đọc chỉ hỗ trợ phiên bản 1.');
  for (const key of ['snapshotToken', 'cursor', 'turnId']) {
    if (query[key] !== undefined && (typeof query[key] !== 'string' || !(query[key] as string).trim())) {
      fail(`${key} phải là chuỗi không rỗng.`);
    }
  }
  if (query.direction !== undefined && query.direction !== 'older' && query.direction !== 'newer') fail('Hướng phân trang không hợp lệ.');
  if (query.limit !== undefined && (!Number.isInteger(query.limit) || Number(query.limit) < 1
    || Number(query.limit) > ZERO_LAYER_HISTORY_MAX_LIMIT_ACU)) fail('Số lượng phân trang phải là số nguyên từ 1 đến 100.');
  if (query.turnId !== undefined && (query.cursor !== undefined || query.direction !== undefined || query.limit !== undefined)) {
    fail('Chi tiết lượt không được kết hợp với tham số phân trang.');
  }
  return { ...query, version: 1, ...(snapshotOnly || query.turnId ? {} : {
    limit: query.limit ?? ZERO_LAYER_HISTORY_DEFAULT_LIMIT_ACU,
  }) } as ZeroLayerHistoryQuery_ACU;
}

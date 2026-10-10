/**
 * 外观设置的通用字段描述：校验补丁、合并覆盖项、读出生效值与字段说明。
 *
 * 存储里只保存用户改过的项（覆盖项），生效值 = 缺省值叠加覆盖项。
 * 补丁语义：对象逐层合并，数组整体替换，null 表示该项恢复缺省。
 * 读取已存数据时无效项按缺省处理并列入 issues，不改写存储。
 */

export type AppearanceField_ACU =
  | { kind: 'number'; label: string; default: number; min: number; max: number; integer?: boolean; zeroAllowed?: boolean }
  | { kind: 'boolean'; label: string; default: boolean }
  | { kind: 'enum'; label: string; default: string; values: readonly string[] }
  | { kind: 'enumList'; label: string; default: readonly string[]; values: readonly string[]; minItems: number }
  | { kind: 'color'; label: string; default: string }
  | { kind: 'text'; label: string; default: string; maxLength: number; allowEmpty?: boolean; pattern?: RegExp; patternHint?: string }
  | { kind: 'image'; label: string; maxLength: number }
  | { kind: 'textList'; label: string; maxItems: number; maxLength: number }
  | { kind: 'group'; label: string; fields: AppearanceSchema_ACU };

export type AppearanceSchema_ACU = { readonly [key: string]: AppearanceField_ACU };

type LeafField_ACU = Exclude<AppearanceField_ACU, { kind: 'group' }>;

export type AppearanceOverrides_ACU = Record<string, unknown>;

export interface AppearanceReadResult_ACU {
  overrides: AppearanceOverrides_ACU;
  issues: string[];
}

export interface AppearanceFieldInfo_ACU {
  path: string;
  label: string;
  type: LeafField_ACU['kind'];
  default: unknown;
  min?: number;
  max?: number;
  integer?: boolean;
  zeroAllowed?: boolean;
  values?: string[];
  maxItems?: number;
  maxLength?: number;
}

const isPlainObject_ACU = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const fieldOf_ACU = (schema: AppearanceSchema_ACU, key: string): AppearanceField_ACU | undefined =>
  Object.prototype.hasOwnProperty.call(schema, key) ? schema[key] : undefined;

const HEX_COLOR_RE_ACU = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const FUNCTION_COLOR_RE_ACU = /^(?:rgba?|hsla?)\(\s*(?:[-+]?(?:\d+(?:\.\d+)?|\.\d+)(?:%|deg|rad|grad|turn)?\s*[,/]?\s*){3,4}\)$/i;
const NAMED_COLOR_RE_ACU = /^[a-z]{3,30}$/i;
const DATA_IMAGE_RE_ACU = /^data:image\/(?:png|jpeg|jpg|gif|webp|avif|apng|bmp|svg\+xml)(?:;[\w.+-]+=[\w.+-]+)*(?:;base64)?,./i;
const URL_SCHEME_RE_ACU = /^([a-z][a-z\d+.-]*):/i;
const CONTROL_CHAR_RE_ACU = /[\u0000-\u001f\u007f]/;

/** 只收十六进制、rgb()/hsl() 与颜色名，挡住 url()、分号等能改写其它样式的写法；浏览器里再交给 CSS.supports 复核。 */
export function isCssColor_ACU(value: string): boolean {
  if (!HEX_COLOR_RE_ACU.test(value) && !FUNCTION_COLOR_RE_ACU.test(value) && !NAMED_COLOR_RE_ACU.test(value)) return false;
  const css = (globalThis as { CSS?: { supports?: (property: string, value: string) => boolean } }).CSS;
  if (typeof css?.supports !== 'function') return true;
  try {
    return css.supports('color', value);
  } catch {
    return true;
  }
}

/** 图片地址只收 http(s) 链接、站内相对路径与 data:image；javascript:、blob:、file: 等一律拒绝。 */
export function isAllowedImageUrl_ACU(value: string): boolean {
  if (CONTROL_CHAR_RE_ACU.test(value)) return false;
  const scheme = URL_SCHEME_RE_ACU.exec(value)?.[1]?.toLowerCase();
  if (!scheme) return true;
  if (scheme === 'http' || scheme === 'https') return true;
  return scheme === 'data' && DATA_IMAGE_RE_ACU.test(value);
}

function numberRangeText_ACU(field: Extract<AppearanceField_ACU, { kind: 'number' }>): string {
  return `${field.zeroAllowed ? '0 hoặc ' : ''}${field.integer ? 'số nguyên ' : ''}${field.min}~${field.max}`;
}

/** 校验单个叶子值，返回可保存的规整值；不合法时抛出带字段路径的错误。 */
export function validateAppearanceValue_ACU(field: AppearanceField_ACU, value: unknown, path: string): unknown {
  switch (field.kind) {
    case 'number': {
      const valid = typeof value === 'number' && Number.isFinite(value)
        && ((field.zeroAllowed && value === 0)
          || (value >= field.min && value <= field.max && (!field.integer || Number.isInteger(value))));
      if (!valid) throw new RangeError(`${path}: phải là ${numberRangeText_ACU(field)}`);
      return value;
    }
    case 'boolean':
      if (typeof value !== 'boolean') throw new TypeError(`${path}: phải là true hoặc false`);
      return value;
    case 'enum':
      if (typeof value !== 'string' || !field.values.includes(value)) {
        throw new RangeError(`${path}: có thể chọn ${field.values.join(' / ')}`);
      }
      return value;
    case 'enumList': {
      const valid = Array.isArray(value)
        && value.length >= field.minItems
        && value.length <= field.values.length
        && value.every(item => typeof item === 'string' && field.values.includes(item))
        && new Set(value).size === value.length;
      if (!valid) {
        throw new RangeError(`${path}: phải chọn ${field.minItems}~${field.values.length} mục không trùng lặp trong ${field.values.join(' / ')}`);
      }
      return [...(value as string[])];
    }
    case 'color': {
      const color = typeof value === 'string' ? value.trim() : '';
      if (!color || !isCssColor_ACU(color)) {
        throw new TypeError(`${path}: định dạng màu không đúng, hỗ trợ #rgb / #rrggbb / #rrggbbaa, rgb()/rgba(), hsl()/hsla() và tên màu`);
      }
      return color;
    }
    case 'text': {
      if (typeof value !== 'string') throw new TypeError(`${path}: phải là chuỗi`);
      const text = value.trim();
      if (!text && !field.allowEmpty) throw new RangeError(`${path}: không được để trống`);
      if (text.length > field.maxLength) throw new RangeError(`${path}: không được vượt quá ${field.maxLength} ký tự`);
      if (text && field.pattern && !field.pattern.test(text)) {
        throw new TypeError(`${path}: ${field.patternHint || 'chứa ký tự không được hỗ trợ'}`);
      }
      return text;
    }
    case 'image': {
      const url = typeof value === 'string' ? value.trim() : '';
      if (!url) throw new TypeError(`${path}: phải là địa chỉ ảnh; muốn khôi phục ảnh có sẵn hãy truyền null`);
      if (url.length > field.maxLength) {
        throw new RangeError(`${path}: dữ liệu ảnh ${url.length} ký tự, vượt quá giới hạn ${field.maxLength}; ảnh lớn hãy dùng liên kết ảnh`);
      }
      if (!isAllowedImageUrl_ACU(url)) throw new TypeError(`${path}: chỉ hỗ trợ liên kết http(s), đường dẫn tương đối nội bộ hoặc ảnh data:image/…`);
      return url;
    }
    case 'textList': {
      if (!Array.isArray(value)) throw new TypeError(`${path}: phải là mảng chuỗi`);
      if (value.length > field.maxItems) throw new RangeError(`${path}: tối đa ${field.maxItems} mục`);
      return value.map((item, index) => {
        const text = typeof item === 'string' ? item.trim() : '';
        if (!text) throw new TypeError(`${path}[${index}]: phải là chuỗi không rỗng`);
        if (text.length > field.maxLength) throw new RangeError(`${path}[${index}]: không được vượt quá ${field.maxLength} ký tự`);
        return text;
      });
    }
    case 'group':
      throw new TypeError(`${path}: là một nhóm, phải truyền đối tượng bản vá`);
  }
}

/** 校验补丁：未知键、类型或范围不对都抛错；null 表示该项恢复缺省，undefined 忽略。返回规整后的补丁。 */
export function validateAppearancePatch_ACU(schema: AppearanceSchema_ACU, patch: unknown, path: string): AppearanceOverrides_ACU {
  if (!isPlainObject_ACU(patch)) throw new TypeError(`${path}: bản vá phải là đối tượng`);
  const clean: AppearanceOverrides_ACU = {};
  for (const [key, value] of Object.entries(patch)) {
    const field = fieldOf_ACU(schema, key);
    const fieldPath = `${path}.${key}`;
    if (!field) throw new RangeError(`${fieldPath}: mục cài đặt không được hỗ trợ; có thể dùng: ${Object.keys(schema).join(', ')}`);
    if (value === undefined) continue;
    if (value === null) clean[key] = null;
    else if (field.kind === 'group') clean[key] = validateAppearancePatch_ACU(field.fields, value, fieldPath);
    else clean[key] = validateAppearanceValue_ACU(field, value, fieldPath);
  }
  return clean;
}

/** 把已校验的补丁并入覆盖项：对象逐层合并，数组整体替换，null 删除该项。返回新对象，不改入参。 */
export function applyAppearancePatch_ACU(
  schema: AppearanceSchema_ACU,
  overrides: AppearanceOverrides_ACU,
  patch: AppearanceOverrides_ACU,
): AppearanceOverrides_ACU {
  const next: AppearanceOverrides_ACU = { ...overrides };
  for (const [key, value] of Object.entries(patch)) {
    const field = fieldOf_ACU(schema, key);
    if (!field) continue;
    if (value === null) {
      delete next[key];
    } else if (field.kind === 'group') {
      const current = isPlainObject_ACU(next[key]) ? next[key] as AppearanceOverrides_ACU : {};
      const merged = applyAppearancePatch_ACU(field.fields, current, value as AppearanceOverrides_ACU);
      if (Object.keys(merged).length) next[key] = merged;
      else delete next[key];
    } else {
      next[key] = value;
    }
  }
  return next;
}

/** 读取已存覆盖项：逐项校验，无效项丢弃并记入 issues；不改写传入的存储对象。 */
export function readAppearanceOverrides_ACU(schema: AppearanceSchema_ACU, stored: unknown, path: string): AppearanceReadResult_ACU {
  const issues: string[] = [];
  const walk = (fields: AppearanceSchema_ACU, value: unknown, at: string): AppearanceOverrides_ACU => {
    if (!isPlainObject_ACU(value)) {
      issues.push(`${at}: dữ liệu đã lưu không phải đối tượng, xử lý theo mặc định`);
      return {};
    }
    const out: AppearanceOverrides_ACU = {};
    for (const [key, raw] of Object.entries(value)) {
      const field = fieldOf_ACU(fields, key);
      const fieldPath = `${at}.${key}`;
      if (!field) {
        issues.push(`${fieldPath}: mục cài đặt không nhận ra, đã bỏ qua`);
      } else if (field.kind === 'group') {
        const nested = walk(field.fields, raw, fieldPath);
        if (Object.keys(nested).length) out[key] = nested;
      } else {
        try {
          out[key] = validateAppearanceValue_ACU(field, raw, fieldPath);
        } catch (error) {
          issues.push(`${error instanceof Error ? error.message : String(error)} (xử lý theo mặc định)`);
        }
      }
    }
    return out;
  };
  const overrides = stored === undefined || stored === null ? {} : walk(schema, stored, path);
  return { overrides, issues };
}

function defaultValue_ACU(field: LeafField_ACU): unknown {
  switch (field.kind) {
    case 'image':
      return null;
    case 'textList':
      return [];
    case 'enumList':
      return [...field.default];
    default:
      return field.default;
  }
}

/** 缺省值叠加覆盖项，得到每一项都齐全的生效值（数组为新副本）。 */
export function resolveAppearance_ACU(schema: AppearanceSchema_ACU, overrides: AppearanceOverrides_ACU): AppearanceOverrides_ACU {
  const out: AppearanceOverrides_ACU = {};
  for (const [key, field] of Object.entries(schema)) {
    const value = overrides[key];
    if (field.kind === 'group') out[key] = resolveAppearance_ACU(field.fields, isPlainObject_ACU(value) ? value : {});
    else if (value === undefined) out[key] = defaultValue_ACU(field);
    else out[key] = Array.isArray(value) ? [...value] : value;
  }
  return out;
}

/** 删掉指定路径（如 'images'、'images.idle'）的覆盖项；keys 不传时全部恢复缺省。返回新对象，路径不存在时抛错。 */
export function resetAppearanceOverrides_ACU(
  schema: AppearanceSchema_ACU,
  overrides: AppearanceOverrides_ACU,
  keys: unknown,
  path: string,
): AppearanceOverrides_ACU {
  if (keys === undefined || keys === null) return {};
  const list = typeof keys === 'string' ? [keys] : keys;
  if (!Array.isArray(list) || list.some(key => typeof key !== 'string' || !key)) {
    throw new TypeError(`${path}: mục cần khôi phục phải là chuỗi hoặc mảng chuỗi, ví dụ 'images' hoặc 'images.idle'`);
  }
  const remove = (fields: AppearanceSchema_ACU, current: AppearanceOverrides_ACU, segments: string[], at: string): AppearanceOverrides_ACU => {
    const [head, ...rest] = segments;
    const field = fieldOf_ACU(fields, head);
    const fieldPath = `${at}.${head}`;
    if (!field) throw new RangeError(`${fieldPath}: mục cài đặt không được hỗ trợ; có thể dùng: ${Object.keys(fields).join(', ')}`);
    const next = { ...current };
    if (!rest.length) {
      delete next[head];
      return next;
    }
    if (field.kind !== 'group') throw new RangeError(`${fieldPath}: không phải nhóm, không thể chỉ định sâu hơn`);
    const nested = remove(field.fields, isPlainObject_ACU(current[head]) ? current[head] as AppearanceOverrides_ACU : {}, rest, fieldPath);
    if (Object.keys(nested).length) next[head] = nested;
    else delete next[head];
    return next;
  };
  return (list as string[]).reduce((current, key) => remove(schema, current, key.split('.'), path), overrides);
}

/** 列出全部叶子字段的路径、说明、类型、缺省值与取值范围。 */
export function describeAppearance_ACU(schema: AppearanceSchema_ACU, prefix = ''): AppearanceFieldInfo_ACU[] {
  const list: AppearanceFieldInfo_ACU[] = [];
  for (const [key, field] of Object.entries(schema)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (field.kind === 'group') {
      list.push(...describeAppearance_ACU(field.fields, path));
      continue;
    }
    const info: AppearanceFieldInfo_ACU = { path, label: field.label, type: field.kind, default: defaultValue_ACU(field) };
    if (field.kind === 'number') {
      info.min = field.min;
      info.max = field.max;
      if (field.integer) info.integer = true;
      if (field.zeroAllowed) info.zeroAllowed = true;
    } else if (field.kind === 'enum' || field.kind === 'enumList') {
      info.values = [...field.values];
    } else if (field.kind === 'textList') {
      info.maxItems = field.maxItems;
      info.maxLength = field.maxLength;
    } else if (field.kind === 'text' || field.kind === 'image') {
      info.maxLength = field.maxLength;
    }
    list.push(info);
  }
  return list;
}

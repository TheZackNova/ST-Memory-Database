/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, ref } from 'vue';
import UserRequirementsEditor from '../../../src/presentation-v2/components/UserRequirementsEditor.vue';

const mounted: Array<() => void> = [];
afterEach(() => { for (const unmount of mounted.splice(0)) unmount(); });

function mountEditor(initial: string[] = ['原有要求']) {
  const items = ref([...initial]);
  const dirty = ref(false);
  const saving = ref(false);
  const error = ref('');
  const save = vi.fn();
  const discard = vi.fn(() => { items.value = [...initial]; dirty.value = false; });
  const host = document.createElement('div');
  document.body.appendChild(host);
  const app = createApp({
    setup: () => () => h(UserRequirementsEditor, {
      items: items.value, dirty: dirty.value, saving: saving.value,
      error: error.value, editorId: 'test',
      'onUpdate:items': (value: string[]) => { items.value = value; dirty.value = true; },
      onSave: save, onDiscard: discard,
    }),
  });
  app.mount(host);
  mounted.push(() => { app.unmount(); host.remove(); });
  const button = (label: string) => Array.from(host.querySelectorAll('button')).find(node => node.textContent?.includes(label))!;
  return { host, items, dirty, saving, error, save, discard, button };
}

describe('用户要求逐条编辑', () => {
  it('每个标签与输入框关联，可新增、输入、删除、放弃和提交数组', async () => {
    const view = mountEditor();
    expect(view.host.querySelector('label')?.htmlFor).toBe('acu-requirement-test-0');
    expect(view.host.querySelector('textarea')?.id).toBe('acu-requirement-test-0');
    expect(view.button('Lưu yêu cầu người dùng').disabled).toBe(true);
    view.button('Thêm thẻ').click();
    await nextTick();
    const inputs = view.host.querySelectorAll('textarea');
    expect(inputs).toHaveLength(2);
    inputs[1]!.value = '第二条';
    inputs[1]!.dispatchEvent(new Event('input', { bubbles: true }));
    await nextTick();
    expect(view.items.value).toEqual(['原有要求', '第二条']);
    expect(view.button('Lưu yêu cầu người dùng').disabled).toBe(false);
    view.button('Lưu yêu cầu người dùng').click();
    expect(view.save).toHaveBeenCalledOnce();
    view.host.querySelectorAll('button')[0]!.click();
    await nextTick();
    expect(view.items.value).toEqual(['第二条']);
    view.button('Bỏ thay đổi').click();
    await nextTick();
    expect(view.discard).toHaveBeenCalledOnce();
    expect(view.items.value).toEqual(['原有要求']);
    expect(view.button('Lưu yêu cầu người dùng').disabled).toBe(true);
  });

  it('保存期间禁用输入与操作，错误可见，解除保存状态后保留草稿以重试', async () => {
    const view = mountEditor(['尚未保存']);
    view.button('Thêm thẻ').click();
    await nextTick();
    view.saving.value = true;
    view.error.value = '保存失败，修改已保留。';
    await nextTick();
    expect(Array.from(view.host.querySelectorAll('textarea')).every(input => input.disabled)).toBe(true);
    expect(view.button('Thêm thẻ').disabled).toBe(true);
    expect(view.button('Xóa thẻ').disabled).toBe(true);
    expect(view.host.querySelector<HTMLButtonElement>('.acu-requirements-editor__actions button:last-child')?.disabled).toBe(true);
    expect(view.host.querySelector('[role="alert"]')?.textContent).toContain('保存失败');
    view.saving.value = false;
    await nextTick();
    expect(view.items.value).toEqual(['尚未保存', '']);
    expect(view.button('Lưu yêu cầu người dùng').disabled).toBe(false);
  });
});

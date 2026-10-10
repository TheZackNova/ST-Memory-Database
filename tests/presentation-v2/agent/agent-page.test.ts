/**
 * @vitest-environment jsdom
 */
import { createPinia } from 'pinia';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, defineComponent } from 'vue';

const harness = vi.hoisted(() => ({
  setScope: vi.fn(async () => true),
  toggleScopeBook: vi.fn(async () => true),
  refreshControl: vi.fn(async () => undefined),
  loadEntries: vi.fn(async () => ['AgentBook']),
  refreshWorldbooks: vi.fn(async () => undefined),
}));

vi.mock('../../../src/presentation-v2/composables/usePlotWorldbookAgentControl', async () => {
  const { ref } = await import('vue');
  return {
    usePlotWorldbookAgentControl: () => ({
      worldbookScope: ref({ source: 'character', manualSelection: [] }),
      refresh: harness.refreshControl,
      setWorldbookScope: harness.setScope,
      toggleWorldbookScopeBook: harness.toggleScopeBook,
      skillifySelected: vi.fn(async () => false),
      syncAgentWorldbookTakeoverAfterSkillChange: vi.fn(async () => true),
    }),
  };
});
vi.mock('../../../src/presentation-v2/composables/useAgentWorldbookEntries', async () => {
  const { ref } = await import('vue');
  return {
    useAgentWorldbookEntries: () => ({
      groups: ref([]), status: ref('success'), error: ref(''),
      loadEntries: harness.loadEntries, toggleSkillifyEntry: vi.fn(), toggleGroupExpanded: vi.fn(),
      selectAllForSkillify: vi.fn(), deselectAllForSkillify: vi.fn(), getSelectedSkillifyEntries: () => [],
      saveEntrySkillMeta: vi.fn(), deleteEntrySkillMeta: vi.fn(),
    }),
  };
});
vi.mock('../../../src/presentation-v2/composables/useWorldbookSelector', async () => {
  const { ref } = await import('vue');
  return { useWorldbookSelector: () => ({
    names: ref(['AgentBook']), charPrimary: ref('CharBook'), status: ref('success'), error: ref(''), refresh: harness.refreshWorldbooks,
  }) };
});
vi.mock('../../../src/presentation-v2/composables/useChatChangedListener', async () => {
  const { ref } = await import('vue');
  return { useChatChangedTick: () => ref(0) };
});
vi.mock('../../../src/presentation-v2/components/WorldbookAgentControlBar.vue', () => ({
  default: defineComponent({
    props: { agentControl: { type: Object, required: true } },
    template: '<div />',
  }),
}));
afterEach(() => {
  document.body.innerHTML = '';
  vi.clearAllMocks();
});

describe('AgentPage', () => {
  it('显示独立 Agent Skill 操作，并将范围切换写入 Agent control', async () => {
    const Page = (await import('../../../src/presentation-v2/pages/AgentPage.vue')).default;
    const el = document.createElement('div');
    document.body.appendChild(el);
    const app = createApp(Page);
    app.use(createPinia());
    app.mount(el);
    await Promise.resolve();

    expect(el.textContent).toContain('Sổ thế giới của Agent');
    // 格林推演有独立的「格林推演」功能页；Agent 世界书页不再嵌入其工作区，右列保留空占位。
    expect(el.textContent).not.toContain('格林推演');
    expect(el.querySelector('.acu-panel-grid > [aria-hidden="true"]')).not.toBeNull();
    expect(el.textContent).toContain('Chọn tất cả Skill');
    const toolbarButtons = Array.from(el.querySelectorAll<HTMLButtonElement>('.acu-v2-wb-entry-toolbar .acu-btn'))
      .map(button => button.textContent?.trim());
    expect(toolbarButtons).not.toContain('Chọn tất cả');
    expect(toolbarButtons).not.toContain('Bỏ chọn tất cả');
    expect(toolbarButtons).toContain('Bỏ chọn tất cả Skill');

    const manual = Array.from(el.querySelectorAll<HTMLButtonElement>('.acu-segmented__item'))
      .find(button => button.textContent?.trim() === 'Chọn thủ công');
    manual!.click();
    await Promise.resolve();
    expect(harness.setScope).toHaveBeenCalledWith('manual');

    app.unmount();
  });
});

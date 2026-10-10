<template>
  <nav :class="['acu-v2-sidebar', `acu-v2-sidebar--${variant}`]" aria-label="Điều hướng trang cấp một">
    <div class="acu-v2-sidebar__brand">
      <img
        class="acu-v2-sidebar__brand-mark"
        :src="brandImages[uiMode.tier]"
        :data-tier="uiMode.tier"
        alt=""
        aria-hidden="true"
        draggable="false"
      />
      <span class="acu-v2-sidebar__brand-copy">
        <button
          type="button"
          class="acu-v2-sidebar__brand-title"
          :aria-label="`${productDisplayName}(bấm liên tục năm lần để mở cài đặt cấp tính năng)`"
          @click="onBrandTitleClick"
        >{{ productDisplayName }}</button>
        <span class="acu-v2-sidebar__brand-tag">{{ uiMode.modeLabel }}</span>
      </span>
    </div>

    <template v-for="group in router.groups" :key="group.id">
      <div
        v-if="(router.visiblePagesByGroup[group.id] || []).length"
        class="acu-v2-sidebar__group"
      >
        <div class="acu-v2-sidebar__group-title">{{ group.title }}</div>
        <button
          v-for="page in router.visiblePagesByGroup[group.id]"
          :key="page.id"
          type="button"
          :class="[
            'acu-v2-sidebar__item',
            page.id === router.activePageId ? 'acu-v2-sidebar__item--active' : '',
          ]"
          :aria-current="page.id === router.activePageId ? 'page' : undefined"
          :data-page-id="page.id"
          @click="setActivePage(page.id)"
        >
          {{ page.title }}
        </button>
      </div>
    </template>
  </nav>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue';
import lightBrandImage from '../assets/brand-modes/light.png';
import mediumBrandImage from '../assets/brand-modes/medium.png';
import highBrandImage from '../assets/brand-modes/high.png';
import { ACU_PRODUCT_DISPLAY_NAME_ACU } from '../../shared/product-brand';
import { acuClearTimeout, acuSetTimeout, type AcuTimerHandle } from '../bootstrap/host-env';
import { useDialogStore } from '../stores/dialog-store';
import { useRouterStore } from '../stores/router-store';
import {
  ACU_UI_TIER_LABELS,
  useUiModeStore,
  type AcuUiTier,
} from '../stores/ui-mode-store';

withDefaults(defineProps<{
  variant?: 'desktop' | 'drawer';
}>(), {
  variant: 'desktop',
});

const emit = defineEmits<{
  (event: 'navigate'): void;
}>();

const router = useRouterStore();
const uiMode = useUiModeStore();
const dialogStore = useDialogStore();
const productDisplayName = ACU_PRODUCT_DISPLAY_NAME_ACU;
// 左上角奶龙头像随功能档位切换。
const brandImages: Record<AcuUiTier, string> = {
  low: lightBrandImage,
  medium: mediumBrandImage,
  high: highBrandImage,
};
const brandClickCount = ref(0);
let brandClickTimer: AcuTimerHandle | undefined;

const HIGH_TIER_PHRASE = 'Bật tính năng nâng cao';
const TIER_ORDER: readonly AcuUiTier[] = ['low', 'medium', 'high'];

const tierDescriptions: Record<AcuUiTier, string> = {
  low: 'Hiển thị bàn làm việc điền bảng, chế độ điền bảng, đẩy cốt truyện, API, quản lý dữ liệu và nhật ký chạy trong công cụ nâng cao. Trang đẩy cốt truyện hiển thị cấu hình hoặc giải thích theo chế độ điền bảng hiện tại.',
  medium: 'Ngoài chế độ nhẹ, hiển thị thêm Agent, viết tiếp thông minh và nhập từ bên ngoài.',
  high: 'Ngoài chế độ nâng cao, hiển thị thêm Mô phỏng thế giới, thay thế nội dung, bảng điều khiển SQL và tùy chọn nhà phát triển.',
};

function resetBrandClickSequence(): void {
  brandClickCount.value = 0;
  if (brandClickTimer !== undefined) {
    acuClearTimeout(brandClickTimer);
    brandClickTimer = undefined;
  }
}

function onBrandTitleClick(): void {
  brandClickCount.value += 1;
  if (brandClickTimer !== undefined) acuClearTimeout(brandClickTimer);
  brandClickTimer = acuSetTimeout(resetBrandClickSequence, 2000);
  if (brandClickCount.value < 5) return;
  resetBrandClickSequence();
  void openTierDialog();
}

async function openTierDialog(): Promise<void> {
  const currentTier = uiMode.tier;
  const selected = await dialogStore.choose<AcuUiTier>({
    title: 'Cài đặt cấp tính năng',
    badge: { label: `Hiện tại: ${ACU_UI_TIER_LABELS[currentTier]}`, variant: 'accent' },
    message: [
      ...TIER_ORDER.map((tier) => `${ACU_UI_TIER_LABELS[tier]}：${tierDescriptions[tier]}`),
      '',
      'Nếu bạn chỉ cần chức năng ghi nhớ thì chế độ nhẹ là đủ, hoàn toàn không cần bật các tính năng của chế độ nâng cao hay cao cấp, cũng không cần cấu hình chúng.',
      'Cấp tính năng chỉ ảnh hưởng hiển thị giao diện, không thay đổi chế độ điền bảng hay các tham số đã lưu.',
    ].join('\n'),
    actions: TIER_ORDER.map((tier) => ({
      value: tier,
      label: ACU_UI_TIER_LABELS[tier],
      variant: tier === currentTier ? 'default' : tier === 'high' ? 'danger' : 'primary',
    })),
  });
  if (!selected || selected === currentTier) return;

  // 只有切到高级模式需要倒计时与口令确认；轻量 / 进阶之间直接生效。
  if (selected === 'high') {
    const confirmed = await dialogStore.confirm({
      title: 'Chuẩn bị bật chế độ nâng cao',
      message: 'Chế độ cao cấp sẽ hiển thị các lối vào như bảng điều khiển SQL và tùy chọn nhà phát triển. Việc hiển thị này không tự động thực hiện thao tác nguy hiểm.',
      confirmLabel: 'Tiếp tục',
      confirmVariant: 'danger',
      confirmCountdownSeconds: 2,
    });
    if (!confirmed) return;
    const phrase = await dialogStore.prompt({
      title: 'Xác nhận bật chế độ nâng cao',
      message: `Vui lòng nhập “${HIGH_TIER_PHRASE}” để hoàn tất mở khóa.`,
      label: 'Cụm xác nhận',
      placeholder: HIGH_TIER_PHRASE,
      confirmLabel: 'Mở khóa chế độ nâng cao',
      confirmVariant: 'danger',
    });
    if (phrase !== HIGH_TIER_PHRASE) return;
  }

  uiMode.setTier(selected);
  router.ensureActiveVisible();
  emit('navigate');
}

onBeforeUnmount(resetBrandClickSequence);

function setActivePage(pageId: string): void {
  router.setActivePage(pageId);
  emit('navigate');
}

</script>

<style scoped>
.acu-v2-sidebar {
  min-width: 0;
  min-height: 0;
  background: var(--acu-sidebar-bg);
  padding: var(--acu-space-6, 24px) var(--acu-space-3, 12px) var(--acu-panel-padding, 16px);
  overflow-y: auto;
}

.acu-v2-sidebar--desktop {
  width: var(--acu-sidebar-width, 220px);
  flex: 0 0 var(--acu-sidebar-width, 220px);
  border-right: 1px solid var(--acu-border-2);
}

.acu-v2-sidebar--drawer {
  width: 100%;
  flex: 1 1 auto;
}

.acu-v2-sidebar__brand {
  display: flex;
  align-items: center;
  gap: var(--acu-space-250, 10px);
  padding: var(--acu-space-1, 4px) var(--acu-space-1, 4px) var(--acu-space-5, 20px);
  margin-bottom: var(--acu-page-gap, 14px);
}

.acu-v2-sidebar__brand-mark {
  width: 34px;
  height: 34px;
  flex: 0 0 34px;
  display: block;
  /* 方形展示完整奶龙，透明底 PNG 与侧栏底色自然融合，仅保留小微圆角。 */
  border-radius: var(--acu-radius-sm, 6px);
  object-fit: contain;
  object-position: center;
  user-select: none;
}

.acu-v2-sidebar__brand-copy {
  min-width: 0;
  display: block;
}

.acu-v2-sidebar__brand-title {
  appearance: none;
  display: block;
  width: 100%;
  padding: 0;
  border: 0;
  background: transparent;
  text-align: left;
  font-size: var(--acu-font-size-panel-title, 15px);
  line-height: 1.25;
  font-weight: 700;
  color: var(--acu-text-1);
  cursor: pointer;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.acu-v2-sidebar__brand-title:hover,
.acu-v2-sidebar__brand-title:focus-visible {
  color: var(--acu-accent);
}

.acu-v2-sidebar__brand-tag {
  display: block;
  margin-top: var(--acu-space-075, 3px);
  font-size: var(--acu-font-size-caption, 11px);
  color: var(--acu-text-3);
}

.acu-v2-sidebar__group {
  margin-bottom: var(--acu-panel-gap, 12px);
}

.acu-v2-sidebar__group-title {
  padding: var(--acu-space-175, 7px) var(--acu-space-3, 12px) var(--acu-space-150, 6px);
  font-size: var(--acu-font-size-caption, 11px);
  font-weight: 600;
  letter-spacing: 0.06em;
  color: var(--acu-text-3);
  text-transform: uppercase;
}

.acu-v2-sidebar__item {
  display: block;
  width: 100%;
  padding: var(--acu-space-250, 10px) var(--acu-space-3, 12px);
  border: 0;
  background: transparent;
  text-align: left;
  font-size: var(--acu-font-size-body-lg, 13px);
  color: var(--acu-text-2);
  cursor: pointer;
  border-radius: var(--acu-radius-sm);
  transition: background 0.15s ease, color 0.15s ease, box-shadow 0.15s ease;
}

.acu-v2-sidebar__item:not(.acu-v2-sidebar__item--active):hover {
  background: var(--acu-hover-overlay);
  color: var(--acu-text-1);
}

.acu-v2-sidebar__item--active {
  background: var(--acu-accent);
  color: var(--acu-on-accent);
  font-weight: 600;
}
</style>

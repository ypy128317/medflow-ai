<script setup>
import { computed } from 'vue'
const props = defineProps({ status: { type: String, default: '' } })
const LABELS = {
  awaiting_approval: '待审批',
  running: '执行中',
  completed: '已完成',
  rejected: '已驳回',
  failed: '失败',
}
const label = computed(() => LABELS[props.status] || props.status || '—')

const tone = computed(() => {
  const s = props.status
  if (['已完成', '执行成功', '已转预约', '运行中', '启用', '正常', '低', 'completed'].includes(s)) return 'success'
  if (['已取消', '已驳回', '执行失败', '停用', '维护中', '紧急', '高', '失败', 'rejected', 'failed'].includes(s)) return 'danger'
  if (['已签到', '处理中', '待审批', '待处理', '预警', '中', '优先', 'awaiting_approval'].includes(s)) return 'warning'
  if (['待确认', '已预约', '待分配', '待清洁', 'running'].includes(s)) return 'info'
  return 'muted'
})
</script>

<template><span :class="['badge', tone]">{{ label }}</span></template>

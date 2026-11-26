<script setup>
import Icon from './Icon.vue'
defineProps({ text: { type: String, default: '暂无数据' }, icon: { type: String, default: 'box' } })
</script>

<template>
  <div class="empty-state"><Icon :name="icon" :size="30" /><p>{{ text }}</p></div>
</template>

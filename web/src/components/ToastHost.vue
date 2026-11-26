<script setup>
import { useUiStore } from '../stores/ui'
import Icon from './Icon.vue'
const ui = useUiStore()
</script>

<template>
  <div class="toast-host">
    <transition-group name="toast">
      <div v-for="t in ui.toasts" :key="t.id" :class="['toast', t.type]">
        <Icon :name="t.type === 'error' ? 'alert' : t.type === 'info' ? 'bell' : 'approval'" :size="16" />
        <span>{{ t.message }}</span>
        <button class="toast-close" @click="ui.dismiss(t.id)"><Icon name="close" :size="13" /></button>
      </div>
    </transition-group>
  </div>
</template>

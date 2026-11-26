<script setup>
import Icon from './Icon.vue'
const props = defineProps({
  title: { type: String, default: '' },
  subtitle: { type: String, default: '' },
  width: { type: String, default: '620px' },
})
const emit = defineEmits(['close'])
</script>

<template>
  <teleport to="body">
    <div class="modal-mask" @mousedown.self="emit('close')">
      <div class="modal" :style="{ width }">
        <header class="modal-head">
          <div>
            <h3>{{ title }}</h3>
            <p v-if="subtitle">{{ subtitle }}</p>
          </div>
          <button class="icon-btn" @click="emit('close')"><Icon name="close" :size="17" /></button>
        </header>
        <div class="modal-body"><slot /></div>
        <footer v-if="$slots.footer" class="modal-foot"><slot name="footer" /></footer>
      </div>
    </div>
  </teleport>
</template>

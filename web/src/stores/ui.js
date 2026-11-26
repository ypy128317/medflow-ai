import { defineStore } from 'pinia'

let seq = 0

export const useUiStore = defineStore('ui', {
  state: () => ({ toasts: [] }),
  actions: {
    notify(message, type = 'success', duration = 3200) {
      const id = ++seq
      this.toasts.push({ id, message, type })
      window.setTimeout(() => this.dismiss(id), duration)
    },
    dismiss(id) {
      this.toasts = this.toasts.filter((t) => t.id !== id)
    },
  },
})

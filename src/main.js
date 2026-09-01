import { createApp } from 'vue'
import App from './App.vue'

// Bundled locally (fonts included) so the board works with no network at all.
import 'katex/dist/katex.min.css'
import './style.css'

createApp(App).mount('#app')

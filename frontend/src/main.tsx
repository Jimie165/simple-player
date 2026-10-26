import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@/index.css'
import App from '@/App'
import { installReactDevelopmentTimings } from '@/utils/reactDevelopmentTimings'

if (import.meta.env.DEV) {
  const dispose = installReactDevelopmentTimings()
  import.meta.hot?.dispose(dispose)
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

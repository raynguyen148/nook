import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from '@/App'
import '@/styles/index.css'
import '@/styles/themes.css'

const mount = document.getElementById('root')
if (!mount) throw new Error('Nook root element is missing.')
createRoot(mount).render(<StrictMode><App /></StrictMode>)

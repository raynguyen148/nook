import type { ThemeMode } from '@/features/theme/ThemeProvider'

export function ThemeIcon({ theme, className = 'size-4' }: { theme: ThemeMode; className?: string }) {
  switch (theme) {
    case 'coffee':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M17 8h1a4 4 0 1 1 0 8h-1" />
          <path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z" />
          <line x1="6" y1="2" x2="6" y2="4" />
          <line x1="10" y1="2" x2="10" y2="4" />
          <line x1="14" y1="2" x2="14" y2="4" />
        </svg>
      )
    case 'forest':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M19.5 4.5C12.7 4.5 6 8.1 6 15.2c0 2.2 1.2 4.3 3.4 4.3 6.1 0 9.1-6.8 10.1-15Z" />
          <path d="M4.5 20c3.4-4.1 7.4-6.7 12-8.2" />
        </svg>
      )
    case 'midnight':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M19.8 15.2A8.7 8.7 0 0 1 8.8 4.2 8.7 8.7 0 1 0 19.8 15.2Z" />
          <path d="m17.8 4.1.4.8.8.4-.8.4-.4.8-.4-.8-.8-.4.8-.4Z" />
        </svg>
      )
    case 'dark':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M20.4 15.1A8.7 8.7 0 0 1 8.9 3.6 8.7 8.7 0 1 0 20.4 15.1Z" />
        </svg>
      )
    case 'auto':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3.2" y="3.7" width="17.6" height="12.8" rx="2.2" />
          <path d="M8.2 20.3h7.6M12 16.5v3.8" />
          <circle cx="12" cy="10.1" r="3.2" />
          <path d="M12 6.9a3.2 3.2 0 0 1 0 6.4Z" fill="currentColor" stroke="none" />
        </svg>
      )
    case 'retro':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3.5" y="3.5" width="15" height="15" rx="2.5" />
          <path d="M7 18.5v2h13.5v-14h-2" />
          <circle cx="8" cy="8" r="0.9" fill="currentColor" stroke="none" />
          <circle cx="12" cy="8" r="0.9" fill="currentColor" stroke="none" />
          <circle cx="8" cy="12" r="0.9" fill="currentColor" stroke="none" />
          <circle cx="12" cy="12" r="0.9" fill="currentColor" stroke="none" />
          <path d="M7 15h8" />
        </svg>
      )
    case 'light':
    default:
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
          <circle cx="12" cy="12" r="3.4" />
          <path d="M12 2.8v2M12 19.2v2M21.2 12h-2M4.8 12h-2M18.5 5.5l-1.4 1.4M6.9 17.1l-1.4 1.4M18.5 18.5l-1.4-1.4M6.9 6.9 5.5 5.5" />
        </svg>
      )
  }
}

export function SettingsIcon({ className = 'size-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

export function BackupIcon({ className = 'size-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3v12M7.5 10.5 12 15l4.5-4.5M4.5 19.5h15" />
    </svg>
  )
}

export function CompactLayoutIcon({ className = 'size-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4.5 6.75h15M4.5 12h15M4.5 17.25h15" />
    </svg>
  )
}

export function ComfortableLayoutIcon({ className = 'size-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3.75" y="4" width="7" height="16" rx="1.6" />
      <rect x="13.25" y="4" width="7" height="16" rx="1.6" />
    </svg>
  )
}

export function GridLayoutIcon({ className = 'size-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4" y="4" width="6.25" height="6.25" rx="1.35" />
      <rect x="13.75" y="4" width="6.25" height="6.25" rx="1.35" />
      <rect x="4" y="13.75" width="6.25" height="6.25" rx="1.35" />
      <rect x="13.75" y="13.75" width="6.25" height="6.25" rx="1.35" />
    </svg>
  )
}

export function PinIcon({ className = 'size-4', filled = false }: { className?: string; filled?: boolean }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8.2 4.25h7.6l-1.15 5.1 3.1 3.1v1.1H6.25v-1.1l3.1-3.1-1.15-5.1Z" />
      <path d="M12 13.55v6.2" />
    </svg>
  )
}

export function CheckIcon({ className = 'size-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

export function EditModeIcon({ className = 'size-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m5.1 18.9 1-4.1L16.5 4.4a2.05 2.05 0 0 1 2.9 2.9L9 17.8l-3.9 1.1Z" />
      <path d="m14.8 6.1 3.1 3.1" />
    </svg>
  )
}

export function SplitModeIcon({ className = 'size-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3.25" y="3.25" width="17.5" height="17.5" rx="2.25" />
      <path d="M12 3.75v16.5" />
    </svg>
  )
}

export function PreviewModeIcon({ className = 'size-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

export function SideNoteIcon({ className = 'size-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="3.5" />
      <rect x="13.5" y="6" width="4.5" height="12" rx="1.5" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function TaskFormatIcon({ className = 'size-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3.5" y="3.5" width="17" height="17" rx="2" />
      <path d="m8 12 2.5 2.5 5.5-6" />
    </svg>
  )
}

export function TableFormatIcon({ className = 'size-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18M3 15h18M12 3v18" />
    </svg>
  )
}

export function AlertFormatIcon({ className = 'size-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
      <path d="M12 9v4M12 17h.01" />
    </svg>
  )
}

export function FootnoteFormatIcon({ className = 'size-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 4h9l5 5v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" />
      <path d="M14 4v5h5" />
      <path d="M10 13.5 11.5 12.3V18" />
      <path d="M10 18h3" />
    </svg>
  )
}



/// <reference types="vite/client" />

import type { SailorApi } from '@shared/contracts'

declare global {
  interface Window {
    sailor: SailorApi
  }
}

export {}


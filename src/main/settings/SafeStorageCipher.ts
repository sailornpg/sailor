import { safeStorage } from 'electron'
import type { CredentialCipher } from './SettingsService.js'

export const safeStorageCipher: CredentialCipher = {
  encrypt(value) {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('Secure credential storage is unavailable on this system.')
    }
    return safeStorage.encryptString(value).toString('base64')
  },
  decrypt(value) {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('Secure credential storage is unavailable on this system.')
    }
    return safeStorage.decryptString(Buffer.from(value, 'base64'))
  },
}

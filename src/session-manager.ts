import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { SessionMapping, WecomConfig } from './types.js'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const DATA_DIR = join(__dirname, '..', 'data')
const MAPPING_FILE = join(DATA_DIR, 'session_mappings.json')

export class SessionManager {
  private mappings: Map<string, SessionMapping> = new Map()
  private config: WecomConfig
  private cleanupTimer?: ReturnType<typeof setInterval>

  constructor(config: WecomConfig) {
    this.config = config
  }

  async init(): Promise<void> {
    await mkdir(DATA_DIR, { recursive: true })
    await this.load()
    this.startCleanup()
  }

  async destroy(): Promise<void> {
    if (this.cleanupTimer) clearInterval(this.cleanupTimer)
    await this.save()
  }

  private async load(): Promise<void> {
    try {
      const raw = await readFile(MAPPING_FILE, 'utf-8')
      const data: SessionMapping[] = JSON.parse(raw)

      // Fix stale isProcessing — if true on load, previous run crashed
      let dirty = false
      for (const m of data) {
        if (m.isProcessing) {
          console.log(`[Session] Fixing stale isProcessing for ${m.chatId}`)
          m.isProcessing = false
          dirty = true
        }
      }
      if (dirty) {
        await writeFile(MAPPING_FILE, JSON.stringify(data, null, 2), 'utf-8')
      }

      this.mappings = new Map(data.map(m => [m.chatId, m]))
    } catch {
      this.mappings = new Map()
    }
  }

  async save(): Promise<void> {
    const data = Array.from(this.mappings.values())
    await writeFile(MAPPING_FILE, JSON.stringify(data, null, 2), 'utf-8')
  }

  getSession(chatId: string): SessionMapping | undefined {
    return this.mappings.get(chatId)
  }

  async createSession(chatId: string, sessionId: string): Promise<SessionMapping> {
    const mapping: SessionMapping = {
      chatId,
      sessionId,
      lastActiveTime: new Date().toISOString(),
      isProcessing: false,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCostUsd: 0,
    }
    this.mappings.set(chatId, mapping)
    await this.save()
    return mapping
  }

  async updateSession(chatId: string, updates: Partial<SessionMapping>): Promise<void> {
    const existing = this.mappings.get(chatId)
    if (!existing) {
      // Auto-create mapping if it doesn't exist (upsert)
      const mapping: SessionMapping = {
        chatId,
        sessionId: updates.sessionId ?? '',
        lastActiveTime: updates.lastActiveTime ?? new Date().toISOString(),
        isProcessing: updates.isProcessing ?? false,
        totalInputTokens: updates.totalInputTokens ?? 0,
        totalOutputTokens: updates.totalOutputTokens ?? 0,
        totalCostUsd: updates.totalCostUsd ?? 0,
      }
      this.mappings.set(chatId, mapping)
    } else {
      const updated: SessionMapping = {
        ...existing,
        ...updates,
        chatId: existing.chatId,
      }
      this.mappings.set(chatId, updated)
    }
    await this.save()
  }

  async resetSession(chatId: string): Promise<void> {
    this.mappings.delete(chatId)
    await this.save()
  }

  setProcessing(chatId: string, isProcessing: boolean): void {
    const existing = this.mappings.get(chatId)
    if (!existing) {
      const mapping: SessionMapping = {
        chatId,
        sessionId: '',
        lastActiveTime: new Date().toISOString(),
        isProcessing,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalCostUsd: 0,
      }
      this.mappings.set(chatId, mapping)
    } else {
      this.mappings.set(chatId, { ...existing, isProcessing })
    }
  }

  isProcessing(chatId: string): boolean {
    return this.mappings.get(chatId)?.isProcessing ?? false
  }

  private startCleanup(): void {
    const timeoutMs = this.config.sessionTimeoutMin * 60 * 1000
    this.cleanupTimer = setInterval(() => {
      let dirty = false
      const now = Date.now()
      for (const [chatId, mapping] of this.mappings) {
        const lastActive = new Date(mapping.lastActiveTime).getTime()
        if (now - lastActive > timeoutMs && !mapping.isProcessing) {
          this.mappings.delete(chatId)
          dirty = true
        }
      }
      if (dirty) {
        this.save().catch((err) =>
          console.error('[Session] Cleanup save failed:', err)
        )
      }
    }, 60_000)
  }
}

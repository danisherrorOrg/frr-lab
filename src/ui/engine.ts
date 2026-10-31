import { createEngineClient, type EngineClient } from '../worker/client'

// One engine worker for the whole page. Requests are answered in order.
let client: EngineClient | undefined
export const engine = (): EngineClient => (client ??= createEngineClient())

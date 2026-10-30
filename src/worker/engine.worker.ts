// Runs the engine off the main thread so big coverage runs don't freeze the page
// (docs/03-architecture.md §1, §7). All logic is in protocol.ts.
import { handleRequest, type EngineRequest, type EngineResponse } from './protocol'

// The app's TS config uses the DOM lib, not the WebWorker lib, so type the
// worker scope by hand: just the two members used here.
const scope = self as unknown as {
  onmessage: ((ev: MessageEvent<EngineRequest>) => void) | null
  postMessage: (msg: EngineResponse) => void
}

scope.onmessage = (ev) => handleRequest(ev.data, (res) => scope.postMessage(res))

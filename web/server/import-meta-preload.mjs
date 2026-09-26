import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

// Nitro's generated chunks evaluate before the Node entry module on Windows.
// Seed the runtime URL early so fileURLToPath always receives an absolute file URL.
globalThis._importMeta_ = {
  url: pathToFileURL(resolve(process.cwd(), '.output/server/index.mjs')).href,
  env: process.env,
}

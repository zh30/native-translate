import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const localesDir = path.join(root, '_locales')
const locales = fs.readdirSync(localesDir).filter((name) => {
  return fs.existsSync(path.join(localesDir, name, 'messages.json'))
})

if (!locales.includes('en')) {
  console.error('Missing _locales/en/messages.json')
  process.exit(1)
}

const en = JSON.parse(fs.readFileSync(path.join(localesDir, 'en', 'messages.json'), 'utf8'))
const required = Object.keys(en).filter((key) => key.startsWith('ai_') || key.startsWith('cmd_'))
if (required.length === 0) {
  console.error('No ai_* or cmd_* keys in English locale')
  process.exit(1)
}

let failed = false
for (const locale of locales) {
  const data = JSON.parse(fs.readFileSync(path.join(localesDir, locale, 'messages.json'), 'utf8'))
  const missing = required.filter((key) => !data[key]?.message)
  if (missing.length) {
    failed = true
    console.error(`${locale} missing ${missing.length} keys: ${missing.slice(0, 8).join(', ')}`)
  }
}

if (failed) process.exit(1)
console.log(`locales ok: ${locales.length} locales, ${required.length} ai/cmd keys`)

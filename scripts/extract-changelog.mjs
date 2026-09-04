import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const DEFAULT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/**
 * @param {unknown} tag
 * @returns {string}
 */
export function parseVersionFromTag(tag) {
  const value = String(tag ?? '').trim()
  const match = value.match(/^v(\d+\.\d+\.\d+)$/)
  if (!match) {
    throw new Error(`Tag must be vX.Y.Z (received ${JSON.stringify(tag)})`)
  }
  return match[1]
}

/**
 * @param {string} value
 * @returns {string}
 */
function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * @param {string} markdown
 * @param {string} version
 * @returns {{ body: string, date: string | null, heading: string }}
 */
export function extractChangelogSection(markdown, version) {
  if (typeof markdown !== 'string' || markdown.length === 0) {
    throw new Error('CHANGELOG markdown is required')
  }
  const heading = new RegExp(`^## \\[${escapeRegExp(version)}\\](?:\\s+-\\s+(\\S.*))?\\s*$`, 'm')
  const match = heading.exec(markdown)
  if (!match) {
    throw new Error(`CHANGELOG.md has no "## [${version}]" section`)
  }
  const start = match.index + match[0].length
  const rest = markdown.slice(start)
  const nextHeading = /^## /m.exec(rest)
  const body = (nextHeading ? rest.slice(0, nextHeading.index) : rest).trim()
  if (!body) {
    throw new Error(`CHANGELOG.md section [${version}] is empty`)
  }
  return {
    body,
    date: match[1]?.trim() ?? null,
    heading: match[0].trim(),
  }
}

/**
 * @param {string} filePath
 * @returns {string}
 */
export function readJsonVersion(filePath) {
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'))
  const version = data?.version
  if (typeof version !== 'string' || !/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error(`${path.basename(filePath)} is missing a semver "version"`)
  }
  return version
}

/**
 * @param {{
 *   tag: string
 *   packageVersion: string
 *   manifestVersion: string
 *   changelog: string
 * }} input
 * @returns {{ version: string, notes: string, date: string | null }}
 */
export function verifyReleaseVersions(input) {
  const version = parseVersionFromTag(input.tag)
  if (input.packageVersion !== version) {
    throw new Error(`package.json version ${input.packageVersion} does not match tag v${version}`)
  }
  if (input.manifestVersion !== version) {
    throw new Error(
      `src/manifest.json version ${input.manifestVersion} does not match tag v${version}`,
    )
  }
  const section = extractChangelogSection(input.changelog, version)
  return { version, notes: section.body, date: section.date }
}

/**
 * @param {{
 *   version: string
 *   notes: string
 *   date?: string | null
 *   repository?: string | null
 * }} input
 * @returns {string}
 */
export function formatGitHubReleaseBody(input) {
  const lines = [`## Native Translate ${input.version}`, '']
  if (input.date) {
    lines.push(`_Released ${input.date}._`, '')
  }
  lines.push(input.notes, '', '---', '')
  lines.push(
    `This GitHub Release was published from tag \`v${input.version}\`. The Chrome Web Store package is attached as \`Native-translate.zip\`.`,
  )
  if (input.repository) {
    lines.push('')
    lines.push(
      `- Changelog: https://github.com/${input.repository}/blob/v${input.version}/CHANGELOG.md`,
    )
    lines.push(`- Source: https://github.com/${input.repository}/tree/v${input.version}`)
  }
  return `${lines.join('\n')}\n`
}

/**
 * @param {string[]} argv
 * @param {NodeJS.ProcessEnv} [env]
 */
export function parseCliArgs(argv, env = process.env) {
  /** @type {{
   *   tag: string | undefined
   *   changelog: string
   *   packageJson: string
   *   manifest: string
   *   out: string | null
   *   repository: string
   *   root: string
   *   help: boolean
   * }} */
  const options = {
    tag: env.GITHUB_REF_NAME,
    changelog: 'CHANGELOG.md',
    packageJson: 'package.json',
    manifest: 'src/manifest.json',
    out: null,
    repository: env.GITHUB_REPOSITORY ?? 'zh30/native-translate',
    root: DEFAULT_ROOT,
    help: false,
  }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    const next = argv[i + 1]
    const take = () => {
      if (next === undefined || next.startsWith('--')) {
        throw new Error(`${arg} requires a value`)
      }
      i += 1
      return next
    }
    if (arg === '--tag') options.tag = take()
    else if (arg === '--changelog') options.changelog = take()
    else if (arg === '--package') options.packageJson = take()
    else if (arg === '--manifest') options.manifest = take()
    else if (arg === '--out') options.out = take()
    else if (arg === '--repo') options.repository = take()
    else if (arg === '--root') options.root = path.resolve(take())
    else if (arg === '--help' || arg === '-h') {
      options.help = true
    } else {
      throw new Error(`Unknown argument: ${arg}`)
    }
  }

  return options
}

/**
 * @param {ReturnType<typeof parseCliArgs>} options
 */
export function prepareGitHubRelease(options) {
  const root = options.root
  const packagePath = path.resolve(root, options.packageJson)
  const manifestPath = path.resolve(root, options.manifest)
  const changelogPath = path.resolve(root, options.changelog)
  const packageVersion = readJsonVersion(packagePath)
  const manifestVersion = readJsonVersion(manifestPath)
  const changelog = fs.readFileSync(changelogPath, 'utf8')
  const tag = options.tag ?? `v${packageVersion}`
  const verified = verifyReleaseVersions({
    tag,
    packageVersion,
    manifestVersion,
    changelog,
  })
  const body = formatGitHubReleaseBody({
    version: verified.version,
    notes: verified.notes,
    date: verified.date,
    repository: options.repository,
  })
  return { version: verified.version, tag: `v${verified.version}`, body }
}

const HELP = `Extract Keep a Changelog notes for a GitHub Release.

Usage:
  node scripts/extract-changelog.mjs --tag vX.Y.Z --out release-notes.md

If --tag is omitted, package.json's version is used. The tag, package.json,
and src/manifest.json must all match, and CHANGELOG.md must contain that
version's section.
`

/**
 * @param {string[]} argv
 * @param {{ stdout?: { write: (chunk: string) => void }, env?: NodeJS.ProcessEnv }} [io]
 * @returns {number}
 */
export function runCli(argv, io = {}) {
  const stdout = io.stdout ?? process.stdout
  const env = io.env ?? process.env
  const options = parseCliArgs(argv, env)
  if (options.help) {
    stdout.write(HELP)
    return 0
  }
  const prepared = prepareGitHubRelease(options)
  if (options.out) {
    const outPath = path.resolve(options.out)
    fs.mkdirSync(path.dirname(outPath), { recursive: true })
    fs.writeFileSync(outPath, prepared.body)
    stdout.write(
      `Prepared GitHub Release notes for ${prepared.tag} (${prepared.body.length} bytes)\n`,
    )
  } else {
    stdout.write(prepared.body)
  }
  if (env.GITHUB_OUTPUT) {
    fs.appendFileSync(
      env.GITHUB_OUTPUT,
      `version=${prepared.version}\ntag=${prepared.tag}\nnotes_path=${options.out ?? ''}\n`,
    )
  }
  return 0
}

const isDirectRun =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isDirectRun) {
  try {
    process.exitCode = runCli(process.argv.slice(2))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    process.stderr.write(`${message}\n`)
    process.exitCode = 1
  }
}

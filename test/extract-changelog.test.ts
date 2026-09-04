import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import {
  extractChangelogSection,
  formatGitHubReleaseBody,
  parseVersionFromTag,
  prepareGitHubRelease,
  runCli,
  verifyReleaseVersions,
} from '../scripts/extract-changelog.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const scriptPath = path.join(repoRoot, 'scripts/extract-changelog.mjs')
const tempDirs: string[] = []

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) rmSync(dir, { recursive: true, force: true })
  }
})

function fixtureDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'nt-changelog-'))
  tempDirs.push(dir)
  mkdirSync(path.join(dir, 'src'))
  return dir
}

function writeReleaseTree(
  dir: string,
  input: { version: string; changelog: string; packageVersion?: string; manifestVersion?: string },
): void {
  writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({ version: input.packageVersion ?? input.version }),
  )
  writeFileSync(
    path.join(dir, 'src/manifest.json'),
    JSON.stringify({ version: input.manifestVersion ?? input.version }),
  )
  writeFileSync(path.join(dir, 'CHANGELOG.md'), input.changelog)
}

const SAMPLE = `# Changelog

## [Unreleased]

- pending

## [3.2.1] - 2026-09-04

### Added

- Alt+Shift+T full-page shortcut

### Fixed

- chat stream CJK clobber

## [3.1.1] - 2026-08-15

- welcome UI
`

describe('parseVersionFromTag', () => {
  it('strips the v prefix from a semver tag', () => {
    expect(parseVersionFromTag('v3.2.1')).toBe('3.2.1')
  })

  it('rejects tags that are not vX.Y.Z', () => {
    expect(() => parseVersionFromTag('3.2.1')).toThrow(/vX\.Y\.Z/)
    expect(() => parseVersionFromTag('v3.2')).toThrow(/vX\.Y\.Z/)
    expect(() => parseVersionFromTag('v3.2.1-beta')).toThrow(/vX\.Y\.Z/)
    expect(() => parseVersionFromTag('')).toThrow(/vX\.Y\.Z/)
  })
})

describe('extractChangelogSection', () => {
  it('returns only the tagged version body, including every subsection', () => {
    const section = extractChangelogSection(SAMPLE, '3.2.1')
    expect(section.date).toBe('2026-09-04')
    expect(section.body).toContain('Alt+Shift+T full-page shortcut')
    expect(section.body).toContain('chat stream CJK clobber')
    expect(section.body).not.toContain('pending')
    expect(section.body).not.toContain('welcome UI')
    expect(section.body).not.toContain('## [3.1.1]')
  })

  it('fails when the version heading is missing or the section is empty', () => {
    expect(() => extractChangelogSection(SAMPLE, '9.9.9')).toThrow(/no "## \[9\.9\.9\]" section/)
    expect(() =>
      extractChangelogSection(
        '# Changelog\n\n## [1.0.0] - 2020-01-01\n\n## [0.1.0]\n\n- first\n',
        '1.0.0',
      ),
    ).toThrow(/empty/)
  })
})

describe('verifyReleaseVersions', () => {
  it('requires tag, package.json, and manifest to agree before using the changelog', () => {
    expect(() =>
      verifyReleaseVersions({
        tag: 'v3.2.1',
        packageVersion: '3.2.0',
        manifestVersion: '3.2.1',
        changelog: SAMPLE,
      }),
    ).toThrow(/package\.json version 3\.2\.0/)
    expect(() =>
      verifyReleaseVersions({
        tag: 'v3.2.1',
        packageVersion: '3.2.1',
        manifestVersion: '3.1.1',
        changelog: SAMPLE,
      }),
    ).toThrow(/manifest\.json version 3\.1\.1/)
  })

  it('returns the curated notes for a matching triple', () => {
    const result = verifyReleaseVersions({
      tag: 'v3.2.1',
      packageVersion: '3.2.1',
      manifestVersion: '3.2.1',
      changelog: SAMPLE,
    })
    expect(result.version).toBe('3.2.1')
    expect(result.notes).toContain('Alt+Shift+T')
  })
})

describe('formatGitHubReleaseBody', () => {
  it('wraps the changelog section in a titled GitHub Release document', () => {
    const body = formatGitHubReleaseBody({
      version: '3.2.1',
      notes: '### Added\n\n- shortcut',
      date: '2026-09-04',
      repository: 'zh30/native-translate',
    })
    expect(body.startsWith('## Native Translate 3.2.1\n')).toBe(true)
    expect(body).toContain('_Released 2026-09-04._')
    expect(body).toContain('### Added')
    expect(body).toContain('- shortcut')
    expect(body).toContain('Native-translate.zip')
    expect(body).toContain('https://github.com/zh30/native-translate/blob/v3.2.1/CHANGELOG.md')
  })
})

describe('prepareGitHubRelease', () => {
  it('reads the real repo changelog for the current package version', () => {
    const packageVersion = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8'))
      .version as string
    const prepared = prepareGitHubRelease({
      tag: `v${packageVersion}`,
      changelog: 'CHANGELOG.md',
      packageJson: 'package.json',
      manifest: 'src/manifest.json',
      out: null,
      repository: 'zh30/native-translate',
      root: repoRoot,
      help: false,
    })
    expect(prepared.version).toBe(packageVersion)
    expect(prepared.body).toContain(`## Native Translate ${packageVersion}`)
    expect(prepared.body).toContain('Alt+Shift+T')
    expect(prepared.body).toContain('Content-script')
    expect(prepared.body).toContain('Learning mode')
    expect(prepared.body).toContain('openPopup')
    expect(prepared.body).toContain('promptStreaming')
    expect(prepared.body).toContain('Official website')
    expect(prepared.body).toContain('Vitest 5')
    expect(prepared.body).toContain('Keep a Changelog')
  })
})

describe('extract-changelog CLI', () => {
  it('writes release notes through the node entry point for a matching fixture tree', () => {
    const dir = fixtureDir()
    writeReleaseTree(dir, { version: '3.2.1', changelog: SAMPLE })
    const out = path.join(dir, 'release-notes.md')
    const stdout = execFileSync(
      process.execPath,
      [
        scriptPath,
        '--root',
        dir,
        '--tag',
        'v3.2.1',
        '--out',
        out,
        '--repo',
        'zh30/native-translate',
      ],
      { encoding: 'utf8' },
    )
    expect(stdout).toContain('Prepared GitHub Release notes for v3.2.1')
    const notes = readFileSync(out, 'utf8')
    expect(notes).toContain('## Native Translate 3.2.1')
    expect(notes).toContain('Alt+Shift+T full-page shortcut')
    expect(notes).not.toContain('welcome UI')
  })

  it('exits non-zero when the changelog does not cover the tagged version', () => {
    const dir = fixtureDir()
    writeReleaseTree(dir, {
      version: '3.2.1',
      changelog: '# Changelog\n\n## [3.1.1] - 2026-08-15\n\n- older\n',
    })
    try {
      execFileSync(process.execPath, [scriptPath, '--root', dir, '--tag', 'v3.2.1'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      throw new Error('expected the changelog CLI to fail')
    } catch (error) {
      expect(error).toBeInstanceOf(Error)
      expect((error as { stderr?: string }).stderr).toMatch(/no "## \[3\.2\.1\]" section/)
    }
  })

  it('prints GitHub Release notes for the real repo changelog via the node entry point', () => {
    const stdout = execFileSync(process.execPath, [scriptPath, '--tag', 'v3.2.1'], {
      cwd: repoRoot,
      encoding: 'utf8',
    })
    expect(stdout).toContain('## Native Translate 3.2.1')
    expect(stdout).toContain('Alt+Shift+T')
    expect(stdout).toContain('promptStreaming')
    expect(stdout).not.toContain('## [Unreleased]')
  })

  it('writes version to GITHUB_OUTPUT when the Actions env var is set', () => {
    const dir = fixtureDir()
    writeReleaseTree(dir, { version: '3.2.1', changelog: SAMPLE })
    const outputFile = path.join(dir, 'github-output')
    writeFileSync(outputFile, '')
    const chunks: string[] = []
    const code = runCli(['--root', dir, '--tag', 'v3.2.1', '--out', path.join(dir, 'notes.md')], {
      stdout: { write: (chunk: string) => chunks.push(chunk) },
      env: { ...process.env, GITHUB_OUTPUT: outputFile },
    })
    expect(code).toBe(0)
    expect(readFileSync(outputFile, 'utf8')).toContain('version=3.2.1\n')
    expect(chunks.join('')).toContain('Prepared GitHub Release notes for v3.2.1')
  })
})

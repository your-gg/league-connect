#!/usr/bin/env node
/**
 * Usage: npm run release -- v1.0.0
 *        npm run release -- 1.0.0
 *
 * Checks package.json "version" matches, then creates & pushes git tag v<version>.
 */
import { readFileSync } from 'fs'
import { execSync } from 'child_process'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

function run(cmd) {
  execSync(cmd, { cwd: root, stdio: 'inherit' })
}

function gitOk(cmd) {
  try {
    execSync(cmd, { cwd: root, stdio: 'pipe' })
    return true
  } catch {
    return false
  }
}

function gitOut(cmd) {
  try {
    return execSync(cmd, { cwd: root, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim()
  } catch {
    return ''
  }
}

const raw = process.argv[2]
if (!raw) {
  console.error('usage: npm run release -- <version>\n  example: npm run release -- v1.0.0')
  process.exit(1)
}

const ver = raw.startsWith('v') ? raw.slice(1) : raw
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))

if (pkg.version !== ver) {
  console.error(
    `error: package.json version is "${pkg.version}" but you passed "${raw}".\n       Edit package.json first so "version" is "${ver}".`
  )
  process.exit(1)
}

const tag = `v${ver}`

if (gitOk(`git rev-parse "${tag}"`)) {
  console.error(`error: tag ${tag} already exists locally`)
  process.exit(1)
}

const remote = gitOut(`git ls-remote origin "refs/tags/${tag}"`)
if (remote.length > 0) {
  console.error(`error: tag ${tag} already exists on origin`)
  process.exit(1)
}

console.log(`Tagging ${tag} (package.json version: ${pkg.version})...`)
run(`git tag "${tag}"`)
run(`git push origin "${tag}"`)
console.log(`Pushed ${tag} — CI should publish to GitHub Packages.`)

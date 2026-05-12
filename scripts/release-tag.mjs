#!/usr/bin/env node
/**
 * Usage: npm run release -- v1.0.0
 *        npm run release -- 1.0.0
 *
 * 사전 조건:
 *   - package.json 버전을 릴리즈 버전으로 미리 올리고 PR 머지까지 완료
 *   - master 브랜치에서 실행
 *
 * 스크립트 동작:
 *   - 각종 유효성 검사 후 git tag 생성 및 push → CI publish 트리거
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

// npm으로만 실행 가능 (yarn 차단)
const userAgent = process.env.npm_config_user_agent ?? ''
if (!userAgent.startsWith('npm')) {
  console.error('error: use "npm run release" instead of yarn/pnpm')
  process.exit(1)
}

const ver = raw.replace(/^v/, '')
const tag = `v${ver}`
const pkgPath = join(root, 'package.json')
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))

// 1. semver 유효성 체크 (pre-release 포함: 1.0.0-beta.1)
const semverRe = /^\d+\.\d+\.\d+(-[a-zA-Z0-9.-]+)?$/
if (!semverRe.test(ver)) {
  console.error(`error: "${ver}" is not a valid semver (expected format: 1.2.3 or 1.2.3-beta.1)`)
  process.exit(1)
}

// 2. master 브랜치에서만 릴리즈 가능
const currentBranch = gitOut('git rev-parse --abbrev-ref HEAD')
if (currentBranch !== 'master') {
  console.error(`error: releases must be made from master branch (current: ${currentBranch})`)
  process.exit(1)
}

// 3. origin/master 동기화 체크
console.log('Fetching origin...')
run('git fetch origin')
const localRef = gitOut('git rev-parse HEAD')
const remoteRef = gitOut('git rev-parse origin/master')
if (localRef !== remoteRef) {
  const behind = gitOut('git rev-list --count HEAD..origin/master')
  const ahead = gitOut('git rev-list --count origin/master..HEAD')
  console.error(
    `error: local master is out of sync with origin/master (ahead: ${ahead}, behind: ${behind})\n` +
    `       run "git pull" to sync before releasing.`
  )
  process.exit(1)
}

// 4. 커밋되지 않은 변경사항 체크
const dirty = gitOut('git status --porcelain')
if (dirty.length > 0) {
  console.error('error: working tree has uncommitted changes. commit or stash them first.\n' + dirty)
  process.exit(1)
}

// 5. package.json 버전 일치 체크
if (pkg.version !== ver) {
  console.error(
    `error: package.json version (${pkg.version}) does not match release version (${ver})\n` +
    `       bump the version in package.json, commit, and merge via PR before releasing.`
  )
  process.exit(1)
}

// 6. 태그 중복 체크
if (gitOk(`git rev-parse "${tag}"`)) {
  console.error(`error: tag ${tag} already exists locally`)
  process.exit(1)
}

const remote = gitOut(`git ls-remote origin "refs/tags/${tag}"`)
if (remote.length > 0) {
  console.error(`error: tag ${tag} already exists on origin`)
  process.exit(1)
}

// 7. npm registry 중복 체크
const published = gitOut(`npm view ${pkg.name}@${ver} version 2>/dev/null`)
if (published === ver) {
  console.error(`error: version ${ver} is already published to npm registry`)
  process.exit(1)
}

console.log(`Tagging ${tag}...`)
run(`git tag "${tag}"`)

try {
  run(`git push origin "${tag}"`)
} catch (e) {
  console.error(`error: push failed. rolling back local tag ${tag}...`)
  run(`git tag -d "${tag}"`)
  process.exit(1)
}

console.log(`Pushed ${tag} — CI should publish to GitHub Packages.`)

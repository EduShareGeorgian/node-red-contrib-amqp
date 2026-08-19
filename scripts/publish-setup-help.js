#!/usr/bin/env node
'use strict'

const { execSync } = require('node:child_process')

function run(command) {
  try {
    return execSync(command, {
      stdio: ['ignore', 'pipe', 'pipe'],
      encoding: 'utf8',
    }).trim()
  } catch (error) {
    return null
  }
}

function printHeader() {
  console.log('NPM publish preflight (bypass-2FA token)')
  console.log('-----------------------------------------')
}

function printChecklist() {
  console.log('\nChecklist:')
  console.log('1. Ensure you are authenticated: npm whoami --registry https://registry.npmjs.org')
  console.log('2. Ensure at least one token has bypass_2fa=true: npm token list --json')
  console.log('3. If no bypass token exists, create one in npmjs.com:')
  console.log('   Account Settings -> Access Tokens -> Generate New Token (Granular)')
  console.log('   Enable package publish permissions and bypass 2FA for publish.')
  console.log('4. Update ~/.npmrc with the new token for registry.npmjs.org')
  console.log('5. Verify and publish: npm whoami && npm publish --access public')
}

function tokenLabel(token, index) {
  if (token && typeof token.name === 'string' && token.name.trim()) {
    return token.name.trim()
  }

  return `token-${index + 1}`
}

function isRevoked(token) {
  return Boolean(token && token.revoked)
}

function describeTokenStatus(tokens) {
  const summary = {
    active: [],
    bypass: [],
    nonBypass: [],
    revoked: [],
    unknown: [],
  }

  tokens.forEach((token, index) => {
    const label = tokenLabel(token, index)

    if (!token || typeof token !== 'object') {
      summary.unknown.push(label)
      return
    }

    if (isRevoked(token)) {
      summary.revoked.push(label)
      return
    }

    summary.active.push(label)
    if (token.bypass_2fa === true) {
      summary.bypass.push(label)
    } else if (token.bypass_2fa === false) {
      summary.nonBypass.push(label)
    } else {
      summary.unknown.push(label)
    }
  })

  return summary
}

function printTokenDiagnostics(summary) {
  console.log(`Token count (active): ${summary.active.length}`)
  console.log(`Bypass-2FA tokens: ${summary.bypass.length}`)
  console.log(`Revoked tokens: ${summary.revoked.length}`)
  console.log(`Active tokens without bypass_2fa: ${summary.nonBypass.length}`)

  if (summary.revoked.length > 0) {
    console.log(`Revoked token names: ${summary.revoked.join(', ')}`)
  }

  if (summary.nonBypass.length > 0) {
    console.log(
      `Active tokens with bypass_2fa=false: ${summary.nonBypass.join(', ')}`,
    )
  }

  if (summary.unknown.length > 0) {
    console.log(
      `Tokens with unknown bypass_2fa status: ${summary.unknown.join(', ')}`,
    )
  }
}

function main() {
  printHeader()

  const whoami = run('npm whoami --registry https://registry.npmjs.org')
  if (whoami) {
    console.log(`Authenticated user: ${whoami}`)
  } else {
    console.log('Authenticated user: NOT AUTHENTICATED')
  }

  const tokenJson = run('npm token list --json')
  if (!tokenJson) {
    console.log('Token inspection: unable to read token list')
    printChecklist()
    process.exit(1)
  }

  let tokens = []
  try {
    tokens = JSON.parse(tokenJson)
  } catch (error) {
    console.log('Token inspection: npm token output is not valid JSON')
    printChecklist()
    process.exit(1)
  }

  const tokenSummary = describeTokenStatus(tokens)
  printTokenDiagnostics(tokenSummary)

  if (tokenSummary.bypass.length > 0) {
    console.log('Status: OK to publish without OTP (assuming scope permissions are correct).')
    process.exit(0)
  }

  if (tokenSummary.revoked.length > 0) {
    console.log('Status: Token list contains revoked tokens; none are usable for this check.')
  } else if (tokenSummary.nonBypass.length > 0) {
    console.log('Status: Active tokens do not have bypass_2fa=true. Publish may fail with E403/2FA policy error.')
  } else {
    console.log('Status: No usable bypass-2FA token found. Publish may fail with E403/2FA policy error.')
  }

  printChecklist()
  process.exit(2)
}

main()

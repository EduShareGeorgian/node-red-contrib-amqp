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

  const activeTokens = tokens.filter(token => !token.revoked)
  const bypassTokens = activeTokens.filter(token => token.bypass_2fa === true)

  console.log(`Token count (active): ${activeTokens.length}`)
  console.log(`Bypass-2FA tokens: ${bypassTokens.length}`)

  if (bypassTokens.length > 0) {
    console.log('Status: OK to publish without OTP (assuming scope permissions are correct).')
    process.exit(0)
  }

  console.log('Status: No bypass-2FA token found. Publish may fail with E403/2FA policy error.')
  printChecklist()
  process.exit(2)
}

main()

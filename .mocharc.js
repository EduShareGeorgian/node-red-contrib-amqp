'use strict'

module.exports = {
  require: ['ts-node/register', 'source-map-support/register'],
  extensions: ['ts'],
  diff: true,
  ui: 'bdd',
  spec: 'test/**/*.spec.ts',
}

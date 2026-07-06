/* eslint-disable @typescript-eslint/no-explicit-any */
import * as sinon from 'sinon'

export function createMockRED() {
  const nodes = new Map<string, any>()
  const nodeTypes = new Map<string, any>()

  return {
    nodes: {
      createNode: sinon.stub().callsFake(function (node: any, config: any) {
        // This context is the node instance
        Object.assign(this, {
          id: config.id,
          type: config.type,
          name: config.name || '',
          status: sinon.stub(),
          send: sinon.stub(),
          error: sinon.stub(),
          warn: sinon.stub(),
          on: sinon.stub(),
          once: sinon.stub(),
          removeListener: sinon.stub(),
        })
        nodes.set(config.id, this)
      }),
      registerType: sinon.stub().callsFake((type: string, constructor: any) => {
        nodeTypes.set(type, constructor)
      }),
      getNode: sinon.stub().callsFake((id: string) => {
        return nodes.get(id)
      }),
    },
    util: {
      evaluateNodeProperty: sinon.stub().returns('evaluated'),
      evaluateJSONataExpression: sinon.stub().callsFake(
        (expr: any, msg: any, callback: Function) => {
          callback(null, 'jsonata-result')
        },
      ),
      prepareJSONataExpression: sinon.stub().returns({}),
    },
    events: {
      once: sinon.stub(),
    },
    settings: {},
  }
}

export function getRegisteredNode(RED: any, type: string) {
  // Access through the internal map or require the node module directly
  return require(`../build/src/nodes/${type}.js`)
}

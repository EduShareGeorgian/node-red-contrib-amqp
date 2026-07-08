/* eslint-disable @typescript-eslint/ban-ts-comment */
import { expect } from 'chai'
import * as sinon from 'sinon'

describe('amqp-broker Node', () => {
  afterEach(function () {
    sinon.restore()
  })

  it('registers broker type with credential schema', () => {
    const createNodeStub = sinon.stub()
    let registrationArgs: any[] = []

    const RED = {
      nodes: {
        createNode: createNodeStub,
        registerType: sinon.stub().callsFake((...args: any[]) => {
          registrationArgs = args
        }),
      },
    }

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const amqpBroker = require('../../src/nodes/amqp-broker')
    amqpBroker(RED as any)

    expect(registrationArgs[0], 'node type should be registered as amqp-broker').to.equal(
      'amqp-broker',
    )
    expect(registrationArgs[2], 'registration options should include credentials').to.deep.equal(
      {
        credentials: {
          username: { type: 'text' },
          password: { type: 'password' },
        },
      },
    )
  })

  it('assigns broker configuration fields onto node instance', () => {
    const createNodeStub = sinon.stub()
    let brokerConstructor: any

    const RED = {
      nodes: {
        createNode: createNodeStub,
        registerType: sinon.stub().callsFake((_name: string, ctor: any) => {
          brokerConstructor = ctor
        }),
      },
    }

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const amqpBroker = require('../../src/nodes/amqp-broker')
    amqpBroker(RED as any)

    const node: any = {}
    const config = {
      name: 'broker-name',
      host: 'localhost',
      port: 5672,
      tls: true,
      vhost: 'test-vhost',
      credsFromSettings: true,
    }

    brokerConstructor.call(node, config)

    expect(createNodeStub.calledOnce, 'createNode should initialize broker node instance').to
      .be.true
    expect(node.name, 'broker name should be copied').to.equal(config.name)
    expect(node.host, 'broker host should be copied').to.equal(config.host)
    expect(node.port, 'broker port should be copied').to.equal(config.port)
    expect(node.tls, 'broker tls flag should be copied').to.equal(config.tls)
    expect(node.vhost, 'broker vhost should be copied').to.equal(config.vhost)
    expect(
      node.credsFromSettings,
      'broker credsFromSettings should be copied',
    ).to.equal(config.credsFromSettings)
  })
})

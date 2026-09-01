import { expect } from 'chai'
import * as sinon from 'sinon'

/**
 * Spec technique
 *
 * The setup helper loads the CommonJS node module with a small fake Node-RED
 * runtime. registerType captures the node constructor, getNode returns fixed
 * management, source, and destination config nodes, and constructor.call
 * creates an instance using a fake runtime node.
 *
 * The fake node's on method captures the registered input listener. Each spec
 * invokes that listener directly with stubbed send and done callbacks, while a
 * Sinon stub replaces global fetch so no RabbitMQ server or network connection
 * is required.
 *
 * Assertions inspect the HTTP URL and RequestInit passed to fetch, parse the
 * generated shovel definition, and verify the emitted message or error callback.
 * This exercises the node's public input behavior while keeping the test focused
 * and deterministic.
 */
describe('amqp-dynamic-shovel Node', () => {
  afterEach(() => sinon.restore())

  function setup(
    destinationType: 'exchange' | 'queue' | 'original' = 'exchange',
    destinationRoutingKey = 'retry.#',
  ) {
    let constructor: any
    let input: any
    const send = sinon.stub()
    const done = sinon.stub()
    const brokers = {
      management: { host: 'manager', vhost: '/', credentials: {} },
      source: {
        host: 'source',
        port: 5672,
        vhost: 'source-vhost',
        tls: false,
        credsFromSettings: false,
        credentials: { username: 'src', password: 'src-pass' },
      },
      destination: {
        host: 'destination',
        port: 5671,
        vhost: 'destination/vhost',
        tls: true,
        credsFromSettings: false,
        credentials: { username: 'dest', password: 'dest-pass' },
      },
    }
    const RED = {
      settings: {},
      nodes: {
        createNode: sinon.stub(),
        getNode: sinon.stub().callsFake(id => brokers[id]),
        registerType: sinon.stub().callsFake((_type, registered) => {
          constructor = registered
        }),
      },
      util: {},
    }
    const node = {
      credentials: {
        managementUsername: 'admin',
        managementPassword: 'secret',
      },
      on: sinon.stub().callsFake((_event, handler) => {
        input = handler
      }),
    }
    require('../../src/nodes/amqp-dynamic-shovel')(RED as any)
    constructor.call(node, {
      managementBroker: 'management',
      managementPort: 15672,
      managementTls: false,
      shovelVhost: '/',
      shovelName: 'move errors',
      sourceBroker: 'source',
      sourceQueue: 'errors',
      sourcePredeclared: true,
      prefetch: 25,
      destinationBroker: 'destination',
      destinationType,
      destinationName:
        destinationType === 'queue'
          ? 'retry'
          : destinationType === 'exchange'
            ? 'recovery'
            : '',
      destinationRoutingKey,
      destinationPredeclared: true,
      ackMode: 'on-confirm',
      reconnectDelay: 5,
      deleteAfter: 'queue-length',
      addForwardHeaders: true,
    })
    return { input, send, done }
  }

  it('creates a cross-vhost queue-to-exchange shovel without exposing credentials', async () => {
    const fetchStub = sinon
      .stub(globalThis, 'fetch')
      .resolves(new Response('', { status: 201 }))
    const { input, send, done } = setup('exchange')

    await input({ action: 'create' }, send, done)

    expect(fetchStub.firstCall.args[0]).to.equal(
      'http://manager:15672/api/parameters/shovel/%2F/move%20errors',
    )
    const request = fetchStub.firstCall.args[1] as RequestInit
    const body = JSON.parse(String(request.body))
    expect(body.value['src-uri']).to.equal(
      'amqp://src:src-pass@source:5672/source-vhost',
    )
    expect(body.value['dest-uri']).to.equal(
      'amqps://dest:dest-pass@destination:5671/destination%2Fvhost',
    )
    expect(body.value['dest-exchange']).to.equal('recovery')
    expect(body.value).not.to.have.property('dest-queue')
    expect(send.firstCall.args[0].shovel).to.deep.equal({
      action: 'create',
      name: 'move errors',
      vhost: '/',
    })
    expect(JSON.stringify(send.firstCall.args[0])).not.to.contain('src-pass')
    expect(done.calledOnceWithExactly()).to.be.true
  })

  it('creates a queue destination without exchange fields', async () => {
    sinon.stub(globalThis, 'fetch').resolves(new Response('', { status: 201 }))
    const { input, done } = setup('queue')

    await input({}, sinon.stub(), done)

    const request = (globalThis.fetch as sinon.SinonStub).firstCall
      .args[1] as RequestInit
    const value = JSON.parse(String(request.body)).value
    expect(value['dest-queue']).to.equal('retry')
    expect(value['dest-predeclared']).to.equal(true)
    expect(value).not.to.have.property('dest-exchange')
  })

  it('preserves the source routing key for an exchange without an override', async () => {
    sinon.stub(globalThis, 'fetch').resolves(new Response('', { status: 201 }))
    const { input, done } = setup('exchange', '')

    await input({}, sinon.stub(), done)

    const request = (globalThis.fetch as sinon.SinonStub).firstCall
      .args[1] as RequestInit
    const value = JSON.parse(String(request.body)).value
    expect(value['dest-exchange']).to.equal('recovery')
    expect(value).not.to.have.property('dest-exchange-key')
    expect(value).not.to.have.property('dest-queue')
  })

  it('preserves the original exchange and routing key when requested', async () => {
    sinon.stub(globalThis, 'fetch').resolves(new Response('', { status: 201 }))
    const { input, done } = setup('original')

    await input({}, sinon.stub(), done)

    const request = (globalThis.fetch as sinon.SinonStub).firstCall
      .args[1] as RequestInit
    const value = JSON.parse(String(request.body)).value
    expect(value).not.to.have.property('dest-queue')
    expect(value).not.to.have.property('dest-exchange')
    expect(value).not.to.have.property('dest-exchange-key')
    expect(done.calledOnceWithExactly()).to.be.true
  })

  it('uses the shovel status endpoint', async () => {
    const fetchStub = sinon
      .stub(globalThis, 'fetch')
      .resolves(new Response('{"state":"running"}', { status: 200 }))
    const { input, send, done } = setup()

    await input({ action: 'status' }, send, done)

    expect(fetchStub.firstCall.args[0]).to.equal(
      'http://manager:15672/api/shovels/vhost/%2F/move%20errors',
    )
    expect(fetchStub.firstCall.args[1]?.method).to.equal('GET')
    expect(send.firstCall.args[0].payload).to.deep.equal({ state: 'running' })
  })

  it('reports unsuccessful management responses through done', async () => {
    sinon
      .stub(globalThis, 'fetch')
      .resolves(
        new Response('forbidden', { status: 403, statusText: 'Forbidden' }),
      )
    const { input, done } = setup()

    await input({ action: 'delete' }, sinon.stub(), done)

    expect(done.calledOnce).to.be.true
    expect(done.firstCall.args[0].message).to.contain('403 Forbidden')
  })
})

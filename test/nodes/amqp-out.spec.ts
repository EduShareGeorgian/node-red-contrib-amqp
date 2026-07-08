/* eslint-disable @typescript-eslint/ban-ts-comment */
import { expect } from 'chai'
import * as sinon from 'sinon'
import Amqp from '../../src/Amqp'

describe('amqp-out Node', () => {
  afterEach(function () {
    sinon.restore()
  })

  it('reconnects when the connection closes without an error payload', async () => {
    const clock = sinon.useFakeTimers({ shouldClearNativeTimers: true })
    const connectionHandlers = {}
    const channelHandlers = {}
    const connectionClose = sinon.stub().resolves()
    const connectionRemoveAllListeners = sinon.stub()
    const channelClose = sinon.stub().resolves()
    const channelRemoveAllListeners = sinon.stub()

    const connection = {
      on: sinon.stub().callsFake((event, handler) => {
        connectionHandlers[event] = handler
      }),
      removeAllListeners: connectionRemoveAllListeners,
      channel: { status: 'open' },
      close: connectionClose,
    }
    const channel = {
      on: sinon.stub().callsFake((event, handler) => {
        channelHandlers[event] = handler
      }),
      close: channelClose,
      removeAllListeners: channelRemoveAllListeners,
    }

    const connectStub = sinon.stub(Amqp.prototype, 'connect').resolves(connection as any)
    const initializeStub = sinon.stub(Amqp.prototype, 'initialize').resolves(channel as any)

    let registeredNode
    const node = {
      status: sinon.stub(),
      on: sinon.stub(),
      log: sinon.stub(),
      error: sinon.stub(),
    }
    const RED = {
      events: { once: sinon.stub() },
      nodes: {
        createNode: sinon.stub(),
        registerType: sinon.stub().callsFake((_type, constructor) => {
          registeredNode = constructor
        }),
      },
      util: {
        evaluateNodeProperty: sinon.stub(),
        evaluateJSONataExpression: sinon.stub(),
        prepareJSONataExpression: sinon.stub(),
      },
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const amqpOut = require('../../src/nodes/amqp-out')
      amqpOut(RED as any)
      
      registeredNode.call(node, {
        id: 'n1',
        broker: 'b1',
        exchangeName: 'test',
        exchangeType: 'topic',
        durable: false,
        queueName: '',
        queueExclusive: true,
        queueAutoDelete: true,
      })

      await connectStub.firstCall.returnValue
      await Promise.resolve()

      expect(connectStub.calledOnce, 'initial connect should run once').to.be.true
      expect(
        connectionHandlers['close'],
        'connection close handler should be registered',
      ).to.be.a('function')

      await connectionHandlers['close']()
      await clock.tickAsync(2000)

      expect(
        channelRemoveAllListeners.calledOnce,
        'channel listeners should be removed during reconnect cleanup',
      ).to.be.true
      expect(channelClose.calledOnce, 'channel close should run during cleanup').to.be
        .true
      expect(
        connectionRemoveAllListeners.calledOnce,
        'connection listeners should be removed during reconnect cleanup',
      ).to.be.true
      expect(
        connectionClose.calledOnce,
        'connection close should run during reconnect cleanup',
      ).to.be.true
      expect(connectStub.calledTwice, 'reconnect should create a second connection').to
        .be.true
    } finally {
      clock.restore()
    }
  })

  it('schedules only one reconnect when close fires repeatedly before timer runs', async () => {
    const clock = sinon.useFakeTimers({ shouldClearNativeTimers: true })
    const connectionHandlers: Record<string, (...args: any[]) => Promise<void> | void> = {}

    const connection = {
      on: sinon.stub().callsFake((event, handler) => {
        connectionHandlers[event] = handler
      }),
      removeAllListeners: sinon.stub(),
      close: sinon.stub().resolves(),
    }
    const channel = {
      on: sinon.stub(),
      close: sinon.stub().resolves(),
      removeAllListeners: sinon.stub(),
    }

    const connectStub = sinon.stub(Amqp.prototype, 'connect').resolves(connection as any)
    const initializeStub = sinon.stub(Amqp.prototype, 'initialize').resolves(channel as any)

    let registeredNode: any
    const node = {
      id: 'n-out-2',
      status: sinon.stub(),
      on: sinon.stub(),
      log: sinon.stub(),
      error: sinon.stub(),
    }
    const RED = {
      events: { once: sinon.stub() },
      nodes: {
        createNode: sinon.stub(),
        registerType: sinon.stub().callsFake((_type, constructor) => {
          registeredNode = constructor
        }),
      },
      util: {
        evaluateNodeProperty: sinon.stub(),
        evaluateJSONataExpression: sinon.stub(),
        prepareJSONataExpression: sinon.stub(),
      },
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const amqpOut = require('../../src/nodes/amqp-out')
      amqpOut(RED as any)

      registeredNode.call(node, {
        id: 'n-out-2',
        broker: 'b1',
        exchangeName: 'test',
        exchangeType: 'topic',
        durable: false,
        queueName: '',
        queueExclusive: true,
        queueAutoDelete: true,
      })

      await connectStub.firstCall.returnValue
      await Promise.resolve()

      await connectionHandlers.close()
      await connectionHandlers.close()
      await connectionHandlers.close()
      await clock.tickAsync(2000)

      expect(
        connectStub.calledTwice,
        'duplicate close events should collapse into a single reconnect attempt',
      ).to.be.true
    } finally {
      clock.restore()
    }
  })

  it('does not reconnect on connection error when reconnectOnError is false', async () => {
    const clock = sinon.useFakeTimers({ shouldClearNativeTimers: true })
    const connectionHandlers: Record<string, (...args: any[]) => Promise<void> | void> = {}

    const connection = {
      on: sinon.stub().callsFake((event, handler) => {
        connectionHandlers[event] = handler
      }),
      removeAllListeners: sinon.stub(),
      close: sinon.stub().resolves(),
    }
    const channel = {
      on: sinon.stub(),
      close: sinon.stub().resolves(),
      removeAllListeners: sinon.stub(),
    }

    const connectStub = sinon.stub(Amqp.prototype, 'connect').resolves(connection as any)
    const initializeStub = sinon.stub(Amqp.prototype, 'initialize').resolves(channel as any)

    let registeredNode: any
    const node = {
      id: 'n-out-3',
      status: sinon.stub(),
      on: sinon.stub(),
      log: sinon.stub(),
      error: sinon.stub(),
    }
    const RED = {
      events: { once: sinon.stub() },
      nodes: {
        createNode: sinon.stub(),
        registerType: sinon.stub().callsFake((_type, constructor) => {
          registeredNode = constructor
        }),
      },
      util: {
        evaluateNodeProperty: sinon.stub(),
        evaluateJSONataExpression: sinon.stub(),
        prepareJSONataExpression: sinon.stub(),
      },
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const amqpOut = require('../../src/nodes/amqp-out')
      amqpOut(RED as any)

      registeredNode.call(node, {
        id: 'n-out-3',
        broker: 'b1',
        reconnectOnError: false,
        exchangeName: 'test',
        exchangeType: 'topic',
        durable: false,
        queueName: '',
        queueExclusive: true,
        queueAutoDelete: true,
      })

      await connectStub.firstCall.returnValue
      await Promise.resolve()

      await connectionHandlers.error(new Error('boom'))
      await clock.tickAsync(2100)

      expect(
        connectStub.calledOnce,
        'connection error should not reconnect when reconnectOnError=false',
      ).to.be.true
      expect(node.error.calledOnce, 'node.error should still report connection error').to
        .be.true
    } finally {
      clock.restore()
    }
  })

  it('handles msg routing key type and publishes raw payload when doNotStringifyPayload is true', async () => {
    const onHandlers: Record<string, (...args: any[]) => Promise<void> | void> = {}
    const setRoutingKeyStub = sinon.stub(Amqp.prototype, 'setRoutingKey')
    const publishStub = sinon.stub(Amqp.prototype, 'publish').resolves()
    sinon.stub(Amqp.prototype, 'connect').resolves(null as any)

    let registeredNode: any
    const node = {
      id: 'n-out-msg-routing',
      status: sinon.stub(),
      on: sinon.stub().callsFake((event, handler) => {
        onHandlers[event] = handler
      }),
      log: sinon.stub(),
      error: sinon.stub(),
    }
    const RED = {
      events: { once: sinon.stub() },
      nodes: {
        createNode: sinon.stub(),
        registerType: sinon.stub().callsFake((_type, constructor) => {
          registeredNode = constructor
        }),
      },
      util: {
        evaluateNodeProperty: sinon.stub().returns('rk.msg'),
        evaluateJSONataExpression: sinon.stub(),
        prepareJSONataExpression: sinon.stub(),
      },
    }

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const amqpOut = require('../../src/nodes/amqp-out')
    amqpOut(RED as any)

    registeredNode.call(node, {
      id: 'n-out-msg-routing',
      broker: 'b1',
      exchangeName: 'test',
      exchangeType: 'topic',
      exchangeRoutingKey: 'payload.key',
      exchangeRoutingKeyType: 'msg',
      amqpProperties: '{"headers":{"doNotStringifyPayload":true}}',
      queueName: '',
      queueExclusive: true,
      queueAutoDelete: true,
    })

    expect(onHandlers.input, 'input handler should be registered').to.be.a('function')

    const done = sinon.stub()
    const msg = {
      payload: { hello: 'world' },
      properties: { appId: 'test-app' },
    }
    await onHandlers.input(msg, null, done)

    expect(
      setRoutingKeyStub.calledWith('rk.msg'),
      'msg routing type should evaluate and set routing key',
    ).to.be.true
    expect(
      publishStub.calledWith(msg.payload, sinon.match.any),
      'publish should receive raw payload when doNotStringifyPayload is true',
    ).to.be.true
    expect(done.calledOnce, 'done callback should be called on successful publish').to.be
      .true
  })

  it('handles jsonata routing key and stringifies payload when doNotStringifyPayload is absent', async () => {
    const onHandlers: Record<string, (...args: any[]) => Promise<void> | void> = {}
    const setRoutingKeyStub = sinon.stub(Amqp.prototype, 'setRoutingKey')
    const publishStub = sinon.stub(Amqp.prototype, 'publish').resolves()
    sinon.stub(Amqp.prototype, 'connect').resolves(null as any)

    let registeredNode: any
    const node = {
      id: 'n-out-jsonata-routing',
      status: sinon.stub(),
      on: sinon.stub().callsFake((event, handler) => {
        onHandlers[event] = handler
      }),
      log: sinon.stub(),
      error: sinon.stub(),
    }
    const RED = {
      events: { once: sinon.stub() },
      nodes: {
        createNode: sinon.stub(),
        registerType: sinon.stub().callsFake((_type, constructor) => {
          registeredNode = constructor
        }),
      },
      util: {
        evaluateNodeProperty: sinon.stub(),
        prepareJSONataExpression: sinon.stub().returns('prepared-jsonata'),
        evaluateJSONataExpression: sinon.stub().callsFake((_expr, _msg, cb) => {
          cb(null, 'rk.jsonata')
        }),
      },
    }

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const amqpOut = require('../../src/nodes/amqp-out')
    amqpOut(RED as any)

    registeredNode.call(node, {
      id: 'n-out-jsonata-routing',
      broker: 'b1',
      exchangeName: 'test',
      exchangeType: 'topic',
      exchangeRoutingKey: '$.route',
      exchangeRoutingKeyType: 'jsonata',
      amqpProperties: 'not-json',
      queueName: '',
      queueExclusive: true,
      queueAutoDelete: true,
    })

    const done = sinon.stub()
    const msg = {
      payload: { count: 2 },
      properties: { appId: 'jsonata-app' },
    }
    await onHandlers.input(msg, null, done)

    expect(
      setRoutingKeyStub.calledWith('rk.jsonata'),
      'jsonata routing should resolve and set routing key',
    ).to.be.true
    expect(
      publishStub.calledWith(JSON.stringify(msg.payload), msg.properties),
      'publish should stringify payload when doNotStringifyPayload is not set',
    ).to.be.true
    expect(done.calledOnce, 'done callback should be called for jsonata success path').to
      .be.true
  })

  it('routes publish failures to done callback when done is provided', async () => {
    const onHandlers: Record<string, (...args: any[]) => Promise<void> | void> = {}
    const publishError = new Error('publish failed')
    sinon.stub(Amqp.prototype, 'publish').rejects(publishError)
    sinon.stub(Amqp.prototype, 'connect').resolves(null as any)

    let registeredNode: any
    const node = {
      id: 'n-out-input-error-done',
      status: sinon.stub(),
      on: sinon.stub().callsFake((event, handler) => {
        onHandlers[event] = handler
      }),
      log: sinon.stub(),
      error: sinon.stub(),
    }
    const RED = {
      events: { once: sinon.stub() },
      nodes: {
        createNode: sinon.stub(),
        registerType: sinon.stub().callsFake((_type, constructor) => {
          registeredNode = constructor
        }),
      },
      util: {
        evaluateNodeProperty: sinon.stub(),
        evaluateJSONataExpression: sinon.stub(),
        prepareJSONataExpression: sinon.stub(),
      },
    }

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const amqpOut = require('../../src/nodes/amqp-out')
    amqpOut(RED as any)

    registeredNode.call(node, {
      id: 'n-out-input-error-done',
      broker: 'b1',
      exchangeName: 'test',
      exchangeType: 'topic',
      exchangeRoutingKey: 'rk',
      exchangeRoutingKeyType: 'str',
      amqpProperties: '{}',
      queueName: '',
      queueExclusive: true,
      queueAutoDelete: true,
    })

    const done = sinon.stub()
    const msg = { payload: 'payload', routingKey: 'from.msg' }
    await onHandlers.input(msg, null, done)

    expect(done.calledOnce, 'done should be called once on input error').to.be.true
    expect(done.calledWith(publishError), 'done should receive publish error').to.be.true
    expect(node.error.called, 'node.error should not be called when done is provided').to
      .be.false
  })

  it('runs close handler cleanup and calls done', async () => {
    const onHandlers: Record<string, (...args: any[]) => Promise<void> | void> = {}
    const connectionClose = sinon.stub().resolves()
    const channelClose = sinon.stub().resolves()
    const amqpClose = sinon.stub(Amqp.prototype, 'close').resolves()

    const connection = {
      on: sinon.stub(),
      removeAllListeners: sinon.stub(),
      close: connectionClose,
    }
    const channel = {
      on: sinon.stub(),
      removeAllListeners: sinon.stub(),
      close: channelClose,
    }

    const connectStub = sinon.stub(Amqp.prototype, 'connect').resolves(connection as any)
    const initializeStub = sinon.stub(Amqp.prototype, 'initialize').resolves(channel as any)

    let registeredNode: any
    const node = {
      id: 'n-out-close-cleanup',
      status: sinon.stub(),
      on: sinon.stub().callsFake((event, handler) => {
        onHandlers[event] = handler
      }),
      log: sinon.stub(),
      error: sinon.stub(),
    }
    const RED = {
      events: { once: sinon.stub() },
      nodes: {
        createNode: sinon.stub(),
        registerType: sinon.stub().callsFake((_type, constructor) => {
          registeredNode = constructor
        }),
      },
      util: {
        evaluateNodeProperty: sinon.stub(),
        evaluateJSONataExpression: sinon.stub(),
        prepareJSONataExpression: sinon.stub(),
      },
    }

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const amqpOut = require('../../src/nodes/amqp-out')
    amqpOut(RED as any)

    registeredNode.call(node, {
      id: 'n-out-close-cleanup',
      broker: 'b1',
      exchangeName: 'test',
      exchangeType: 'topic',
      exchangeRoutingKey: 'rk',
      exchangeRoutingKeyType: 'str',
      amqpProperties: '{}',
      queueName: '',
      queueExclusive: true,
      queueAutoDelete: true,
    })

    await connectStub.firstCall.returnValue
    await initializeStub.firstCall.returnValue
    await Promise.resolve()

    const done = sinon.stub()
    await onHandlers.close(done)

    expect(channel.close.calledOnce, 'close handler should close channel').to.be.true
    expect(connection.close.calledOnce, 'close handler should close connection').to.be.true
    expect(amqpClose.calledOnce, 'close handler should invoke amqp.close').to.be.true
    expect(done.calledOnce, 'close handler should invoke done callback').to.be.true
  })

  it('clears reconnect timer when flows:stopped is emitted', async () => {
    const clock = sinon.useFakeTimers({ shouldClearNativeTimers: true })
    const connectionHandlers: Record<string, (...args: any[]) => Promise<void> | void> = {}
    let flowsStoppedHandler: (() => void) | undefined

    const connection = {
      on: sinon.stub().callsFake((event, handler) => {
        connectionHandlers[event] = handler
      }),
      removeAllListeners: sinon.stub(),
      close: sinon.stub().resolves(),
    }
    const channel = {
      on: sinon.stub(),
      removeAllListeners: sinon.stub(),
      close: sinon.stub().resolves(),
    }

    const connectStub = sinon.stub(Amqp.prototype, 'connect').resolves(connection as any)
    sinon.stub(Amqp.prototype, 'initialize').resolves(channel as any)

    let registeredNode: any
    const node = {
      id: 'n-out-flows-stopped',
      status: sinon.stub(),
      on: sinon.stub(),
      log: sinon.stub(),
      error: sinon.stub(),
    }
    const RED = {
      events: {
        once: sinon.stub().callsFake((_event, handler) => {
          flowsStoppedHandler = handler
        }),
      },
      nodes: {
        createNode: sinon.stub(),
        registerType: sinon.stub().callsFake((_type, constructor) => {
          registeredNode = constructor
        }),
      },
      util: {
        evaluateNodeProperty: sinon.stub(),
        evaluateJSONataExpression: sinon.stub(),
        prepareJSONataExpression: sinon.stub(),
      },
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const amqpOut = require('../../src/nodes/amqp-out')
      amqpOut(RED as any)

      registeredNode.call(node, {
        id: 'n-out-flows-stopped',
        broker: 'b1',
        reconnectOnError: true,
        exchangeName: 'test',
        exchangeType: 'topic',
        exchangeRoutingKey: 'rk',
        exchangeRoutingKeyType: 'str',
        amqpProperties: '{}',
      })

      await connectStub.firstCall.returnValue
      await Promise.resolve()
      await connectionHandlers.close()

      expect(flowsStoppedHandler, 'flows:stopped handler should be registered').to.be.a(
        'function',
      )
      flowsStoppedHandler && flowsStoppedHandler()

      await clock.tickAsync(2500)
      expect(
        connectStub.calledOnce,
        'flows:stopped should clear pending reconnect timer',
      ).to.be.true
    } finally {
      clock.restore()
    }
  })

  it('calls done with jsonata evaluation error', async () => {
    const onHandlers: Record<string, (...args: any[]) => Promise<void> | void> = {}
    sinon.stub(Amqp.prototype, 'connect').resolves(null as any)
    const publishStub = sinon.stub(Amqp.prototype, 'publish').resolves()

    let registeredNode: any
    const node = {
      id: 'n-out-jsonata-error',
      status: sinon.stub(),
      on: sinon.stub().callsFake((event, handler) => {
        onHandlers[event] = handler
      }),
      log: sinon.stub(),
      error: sinon.stub(),
    }
    const RED = {
      events: { once: sinon.stub() },
      nodes: {
        createNode: sinon.stub(),
        registerType: sinon.stub().callsFake((_type, constructor) => {
          registeredNode = constructor
        }),
      },
      util: {
        evaluateNodeProperty: sinon.stub(),
        prepareJSONataExpression: sinon.stub().returns('prepared-jsonata'),
        evaluateJSONataExpression: sinon.stub().callsFake((_expr, _msg, cb) => {
          cb(new Error('jsonata failed'))
        }),
      },
    }

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const amqpOut = require('../../src/nodes/amqp-out')
    amqpOut(RED as any)

    registeredNode.call(node, {
      id: 'n-out-jsonata-error',
      broker: 'b1',
      exchangeName: 'test',
      exchangeType: 'topic',
      exchangeRoutingKey: '$.route',
      exchangeRoutingKeyType: 'jsonata',
      amqpProperties: '{}',
    })

    const done = sinon.stub()
    await onHandlers.input({ payload: { a: 1 } }, null, done)

    expect(done.calledOnce, 'done should be called when jsonata evaluation fails').to.be
      .true
    expect(done.firstCall.args[0], 'done should receive jsonata error').to.be.instanceOf(
      Error,
    )
    expect(publishStub.called, 'publish should not run when jsonata fails').to.be.false
  })

  it('routes input errors to node.error when done is not provided', async () => {
    const onHandlers: Record<string, (...args: any[]) => Promise<void> | void> = {}
    sinon.stub(Amqp.prototype, 'connect').resolves(null as any)
    sinon.stub(Amqp.prototype, 'publish').rejects(new Error('publish failed without done'))

    let registeredNode: any
    const node = {
      id: 'n-out-input-error-no-done',
      status: sinon.stub(),
      on: sinon.stub().callsFake((event, handler) => {
        onHandlers[event] = handler
      }),
      log: sinon.stub(),
      error: sinon.stub(),
    }
    const RED = {
      events: { once: sinon.stub() },
      nodes: {
        createNode: sinon.stub(),
        registerType: sinon.stub().callsFake((_type, constructor) => {
          registeredNode = constructor
        }),
      },
      util: {
        evaluateNodeProperty: sinon.stub(),
        evaluateJSONataExpression: sinon.stub(),
        prepareJSONataExpression: sinon.stub(),
      },
    }

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const amqpOut = require('../../src/nodes/amqp-out')
    amqpOut(RED as any)

    const msg = { payload: 'payload', routingKey: 'from.msg' }
    registeredNode.call(node, {
      id: 'n-out-input-error-no-done',
      broker: 'b1',
      exchangeName: 'test',
      exchangeType: 'topic',
      exchangeRoutingKey: 'rk',
      exchangeRoutingKeyType: 'str',
      amqpProperties: '{}',
    })

    await onHandlers.input(msg, null)

    expect(node.error.calledOnce, 'node.error should handle input errors when done is absent').to
      .be.true
    expect(node.error.firstCall.args[1], 'node.error should receive original input message').to
      .equal(msg)
  })

  it('reconnects on channel close and channel error when reconnectOnError is true', async () => {
    const clock = sinon.useFakeTimers({ shouldClearNativeTimers: true })
    const channelHandlers: Record<string, (...args: any[]) => Promise<void> | void> = {}

    const connection = {
      on: sinon.stub(),
      removeAllListeners: sinon.stub(),
      close: sinon.stub().resolves(),
    }
    const channel = {
      on: sinon.stub().callsFake((event, handler) => {
        channelHandlers[event] = handler
      }),
      removeAllListeners: sinon.stub(),
      close: sinon.stub().resolves(),
    }

    const connectStub = sinon.stub(Amqp.prototype, 'connect').resolves(connection as any)
    const initializeStub = sinon.stub(Amqp.prototype, 'initialize').resolves(channel as any)

    let registeredNode: any
    const node = {
      id: 'n-out-channel-events',
      status: sinon.stub(),
      on: sinon.stub(),
      log: sinon.stub(),
      error: sinon.stub(),
    }
    const RED = {
      events: { once: sinon.stub() },
      nodes: {
        createNode: sinon.stub(),
        registerType: sinon.stub().callsFake((_type, constructor) => {
          registeredNode = constructor
        }),
      },
      util: {
        evaluateNodeProperty: sinon.stub(),
        evaluateJSONataExpression: sinon.stub(),
        prepareJSONataExpression: sinon.stub(),
      },
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const amqpOut = require('../../src/nodes/amqp-out')
      amqpOut(RED as any)

      registeredNode.call(node, {
        id: 'n-out-channel-events',
        broker: 'b1',
        reconnectOnError: true,
        exchangeName: 'test',
        exchangeType: 'topic',
        exchangeRoutingKey: 'rk',
        exchangeRoutingKeyType: 'str',
        amqpProperties: '{}',
      })

      await connectStub.firstCall.returnValue
      await initializeStub.firstCall.returnValue
      await Promise.resolve()

      await channelHandlers.close()
      await clock.tickAsync(2000)
      await channelHandlers.error(new Error('channel boom'))
      await clock.tickAsync(2000)

      expect(connectStub.callCount >= 3, 'channel close/error should both trigger reconnect').to
        .be.true
      expect(node.error.calledOnce, 'channel error should be logged once').to.be.true
    } finally {
      clock.restore()
    }
  })

  it('retries reconnect when reconnect attempt fails during timer callback', async () => {
    const clock = sinon.useFakeTimers({ shouldClearNativeTimers: true })
    const connectionHandlers: Record<string, (...args: any[]) => Promise<void> | void> = {}

    const firstConnection = {
      on: sinon.stub().callsFake((event, handler) => {
        connectionHandlers[event] = handler
      }),
      removeAllListeners: sinon.stub(),
      close: sinon.stub().resolves(),
    }
    const secondConnection = {
      on: sinon.stub(),
      removeAllListeners: sinon.stub(),
      close: sinon.stub().resolves(),
    }
    const channel = {
      on: sinon.stub(),
      removeAllListeners: sinon.stub(),
      close: sinon.stub().resolves(),
    }

    const connectStub = sinon
      .stub(Amqp.prototype, 'connect')
      .onFirstCall()
      .resolves(firstConnection as any)
      .onSecondCall()
      .rejects(new Error('retry failed'))
      .onThirdCall()
      .resolves(secondConnection as any)
    const initializeStub = sinon.stub(Amqp.prototype, 'initialize').resolves(channel as any)

    let registeredNode: any
    const node = {
      id: 'n-out-retry-failure',
      status: sinon.stub(),
      on: sinon.stub(),
      log: sinon.stub(),
      error: sinon.stub(),
    }
    const RED = {
      events: { once: sinon.stub() },
      nodes: {
        createNode: sinon.stub(),
        registerType: sinon.stub().callsFake((_type, constructor) => {
          registeredNode = constructor
        }),
      },
      util: {
        evaluateNodeProperty: sinon.stub(),
        evaluateJSONataExpression: sinon.stub(),
        prepareJSONataExpression: sinon.stub(),
      },
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const amqpOut = require('../../src/nodes/amqp-out')
      amqpOut(RED as any)

      registeredNode.call(node, {
        id: 'n-out-retry-failure',
        broker: 'b1',
        reconnectOnError: true,
        exchangeName: 'test',
        exchangeType: 'topic',
        exchangeRoutingKey: 'rk',
        exchangeRoutingKeyType: 'str',
        amqpProperties: '{}',
      })

      await connectStub.firstCall.returnValue
      await initializeStub.firstCall.returnValue
      await Promise.resolve()

      await connectionHandlers.close()
      await clock.tickAsync(4500)

      expect(connectStub.callCount >= 3, 'failed retry should schedule another reconnect').to.be
        .true
    } finally {
      clock.restore()
    }
  })

  it('handles invalid login and generic connect failures with expected status', async () => {
    const invalidLoginError = Object.assign(new Error('invalid login'), {
      code: 'ENOTFOUND',
    })
    const genericError = new Error('generic out connect failure')

    const connectStub = sinon
      .stub(Amqp.prototype, 'connect')
      .onFirstCall()
      .rejects(invalidLoginError)
      .onSecondCall()
      .rejects(genericError)

    let registeredNode: any
    const node = {
      id: 'n-out-connect-errors',
      status: sinon.stub(),
      on: sinon.stub(),
      log: sinon.stub(),
      error: sinon.stub(),
    }
    const RED = {
      events: { once: sinon.stub() },
      nodes: {
        createNode: sinon.stub(),
        registerType: sinon.stub().callsFake((_type, constructor) => {
          registeredNode = constructor
        }),
      },
      util: {
        evaluateNodeProperty: sinon.stub(),
        evaluateJSONataExpression: sinon.stub(),
        prepareJSONataExpression: sinon.stub(),
      },
    }

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const amqpOut = require('../../src/nodes/amqp-out')
    amqpOut(RED as any)

    registeredNode.call(node, {
      id: 'n-out-connect-errors-1',
      broker: 'b1',
      reconnectOnError: false,
      exchangeName: 'test',
      exchangeType: 'topic',
      exchangeRoutingKey: 'rk',
      exchangeRoutingKeyType: 'str',
      amqpProperties: '{}',
    })
    await Promise.resolve()

    registeredNode.call(node, {
      id: 'n-out-connect-errors-2',
      broker: 'b1',
      reconnectOnError: false,
      exchangeName: 'test',
      exchangeType: 'topic',
      exchangeRoutingKey: 'rk',
      exchangeRoutingKeyType: 'str',
      amqpProperties: '{}',
    })
    await Promise.resolve()

    expect(connectStub.calledTwice, 'both out-node instances should attempt connect').to.be
      .true
    expect(
      node.status.calledWithMatch({ text: 'Unable to connect' }),
      'invalid login should set Invalid status',
    ).to.be.true
    expect(
      node.status.calledWithMatch({ text: 'Error' }),
      'generic connect failure should set Error status',
    ).to.be.true
    expect(node.error.calledTwice, 'both connect failures should be reported').to.be.true
  })

  it('warns and skips AMQP initialization when broker is unresolved placeholder', () => {
    const connectStub = sinon.stub(Amqp.prototype, 'connect').resolves({} as any)

    let registeredNode: any
    const node = {
      id: 'n-out-missing-broker',
      status: sinon.stub(),
      on: sinon.stub(),
      log: sinon.stub(),
      warn: sinon.stub(),
      error: sinon.stub(),
    }
    const RED = {
      events: { once: sinon.stub() },
      nodes: {
        createNode: sinon.stub(),
        registerType: sinon.stub().callsFake((_type, constructor) => {
          registeredNode = constructor
        }),
      },
      util: {
        evaluateNodeProperty: sinon.stub(),
        evaluateJSONataExpression: sinon.stub(),
        prepareJSONataExpression: sinon.stub(),
      },
    }

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const amqpOut = require('../../src/nodes/amqp-out')
    amqpOut(RED as any)

    registeredNode.call(node, {
      id: 'n-out-missing-broker',
      broker: '${amqpOutBroker}',
      exchangeName: 'test',
      exchangeType: 'topic',
      exchangeRoutingKey: 'rk',
      exchangeRoutingKeyType: 'str',
      amqpProperties: '{}',
    })

    expect(
      connectStub.called,
      'connect should not run when broker config is unresolved placeholder',
    ).to.be.false
    expect(node.warn.calledOnce, 'node should warn about unresolved broker').to.be.true
    expect(
      node.status.calledWithMatch({ text: 'No broker' }),
      'node should expose No broker status when placeholder is unresolved',
    ).to.be.true
  })

  it('resolves broker placeholder via env and initializes AMQP', async () => {
    const connectStub = sinon.stub(Amqp.prototype, 'connect').resolves({} as any)
    const initializeStub = sinon.stub(Amqp.prototype, 'initialize').resolves({
      on: sinon.stub(),
    } as any)

    let registeredNode: any
    const node = {
      id: 'n-out-env-resolved-broker',
      status: sinon.stub(),
      on: sinon.stub(),
      log: sinon.stub(),
      warn: sinon.stub(),
      error: sinon.stub(),
    }
    const RED = {
      events: { once: sinon.stub() },
      nodes: {
        createNode: sinon.stub(),
        registerType: sinon.stub().callsFake((_type, constructor) => {
          registeredNode = constructor
        }),
      },
      util: {
        evaluateEnvProperty: sinon.stub().callsFake((value: string) => {
          if (value === '${amqpOutBroker}') {
            return 'resolved-broker-id'
          }
          return value
        }),
        evaluateNodeProperty: sinon.stub(),
        evaluateJSONataExpression: sinon.stub(),
        prepareJSONataExpression: sinon.stub(),
      },
    }

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const amqpOut = require('../../src/nodes/amqp-out')
    amqpOut(RED as any)

    registeredNode.call(node, {
      id: 'n-out-env-resolved-broker',
      broker: '${amqpOutBroker}',
      exchangeName: 'test',
      exchangeType: 'topic',
      exchangeRoutingKey: 'rk',
      exchangeRoutingKeyType: 'str',
      amqpProperties: '{}',
    })

    await connectStub.firstCall.returnValue
    await initializeStub.firstCall.returnValue
    await Promise.resolve()

    expect(connectStub.calledOnce, 'connect should run when placeholder resolves').to.be
      .true
    expect(node.warn.called, 'node should not warn when broker resolves').to.be.false
  })

  it('logs and reschedules when retry initialize throws during timer callback', async () => {
    const clock = sinon.useFakeTimers({ shouldClearNativeTimers: true })
    const connectionHandlers: Record<string, (...args: any[]) => Promise<void> | void> = {}

    const connection = {
      on: sinon.stub().callsFake((event, handler) => {
        connectionHandlers[event] = handler
      }),
      removeAllListeners: sinon.stub(),
      close: sinon.stub().resolves(),
    }
    const channel = {
      on: sinon.stub(),
      removeAllListeners: sinon.stub(),
      close: sinon.stub().resolves(),
    }

    const connectStub = sinon.stub(Amqp.prototype, 'connect').resolves(connection as any)
    sinon.stub(Amqp.prototype, 'initialize').resolves(channel as any)

    let initializeLogCount = 0
    let registeredNode: any
    const node = {
      id: 'n-out-retry-throw',
      status: sinon.stub(),
      on: sinon.stub(),
      log: sinon.stub().callsFake((message: string) => {
        if (message.includes('AMQP state: initializing out node')) {
          initializeLogCount += 1
          if (initializeLogCount > 1) {
            throw new Error('forced initialize throw')
          }
        }
      }),
      error: sinon.stub(),
    }
    const RED = {
      events: { once: sinon.stub() },
      nodes: {
        createNode: sinon.stub(),
        registerType: sinon.stub().callsFake((_type, constructor) => {
          registeredNode = constructor
        }),
      },
      util: {
        evaluateNodeProperty: sinon.stub(),
        evaluateJSONataExpression: sinon.stub(),
        prepareJSONataExpression: sinon.stub(),
      },
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const amqpOut = require('../../src/nodes/amqp-out')
      amqpOut(RED as any)

      registeredNode.call(node, {
        id: 'n-out-retry-throw',
        broker: 'b1',
        reconnectOnError: true,
        exchangeName: 'test',
        exchangeType: 'topic',
        exchangeRoutingKey: 'rk',
        exchangeRoutingKeyType: 'str',
        amqpProperties: '{}',
      })

      await connectStub.firstCall.returnValue
      await Promise.resolve()

      await connectionHandlers.close()
      await clock.tickAsync(2000)

      expect(
        node.log.calledWithMatch('reconnect retry failed, scheduling another retry'),
        'retry callback should log failure when initialize throws',
      ).to.be.true
    } finally {
      clock.restore()
    }
  })

})

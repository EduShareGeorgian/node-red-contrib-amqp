/* eslint-disable @typescript-eslint/ban-ts-comment */
import { expect } from 'chai'
import * as sinon from 'sinon'
import Amqp from '../../src/Amqp'

describe('amqp-in Node', () => {
  afterEach(function () {
    sinon.restore()
  })

  it('warns and skips AMQP initialization when queue name is blank', () => {
    const connectStub = sinon.stub(Amqp.prototype, 'connect').resolves({} as any)

    let registeredNode: any
    const node = {
      id: 'n-in-1',
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
    const amqpIn = require('../../src/nodes/amqp-in')
    amqpIn(RED as any)

    registeredNode.call(node, {
      id: 'n-in-1',
      broker: 'b1',
      queueName: '   ',
      reconnectOnError: true,
      exchangeName: 'test',
      exchangeType: 'topic',
      exchangeRoutingKey: '#',
      queueExclusive: true,
      queueAutoDelete: true,
    })

    expect(
      connectStub.called,
      'connect should not be called when queue name is blank',
    ).to.be.false
    expect(node.warn.calledOnce, 'node should warn about missing queue name').to.be
      .true
    expect(
      node.status.calledWithMatch({ text: 'No queue name' }),
      'node status should show missing queue name',
    ).to.be.true
  })

  it('warns and skips AMQP initialization when broker is unresolved placeholder', () => {
    const connectStub = sinon.stub(Amqp.prototype, 'connect').resolves({} as any)

    let registeredNode: any
    const node = {
      id: 'n-in-missing-broker',
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
    const amqpIn = require('../../src/nodes/amqp-in')
    amqpIn(RED as any)

    registeredNode.call(node, {
      id: 'n-in-missing-broker',
      broker: '${amqpOutBroker}',
      queueName: 'input-queue',
      reconnectOnError: true,
      exchangeName: 'test',
      exchangeType: 'topic',
      exchangeRoutingKey: '#',
      queueExclusive: true,
      queueAutoDelete: true,
    })

    expect(connectStub.called, 'connect should not run when broker is unresolved').to.be
      .false
    expect(node.warn.calledOnce, 'node should warn for unresolved broker').to.be.true
    expect(
      node.status.calledWithMatch({ text: 'No broker' }),
      'status should indicate missing broker config',
    ).to.be.true
  })

  it('resolves broker placeholder via env and initializes AMQP', async () => {
    const connectStub = sinon.stub(Amqp.prototype, 'connect').resolves({
      on: sinon.stub(),
    } as any)
    const initializeStub = sinon.stub(Amqp.prototype, 'initialize').resolves({
      on: sinon.stub(),
    } as any)
    const consumeStub = sinon.stub(Amqp.prototype, 'consume').resolves()

    let registeredNode: any
    const node = {
      id: 'n-in-env-resolved-broker',
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
    const amqpIn = require('../../src/nodes/amqp-in')
    amqpIn(RED as any)

    registeredNode.call(node, {
      id: 'n-in-env-resolved-broker',
      broker: '${amqpOutBroker}',
      queueName: 'input-queue',
      reconnectOnError: true,
      exchangeName: 'test',
      exchangeType: 'topic',
      exchangeRoutingKey: '#',
      queueExclusive: true,
      queueAutoDelete: true,
    })

    await connectStub.firstCall.returnValue
    await initializeStub.firstCall.returnValue
    await consumeStub.firstCall.returnValue
    await Promise.resolve()

    expect(connectStub.calledOnce, 'connect should run when placeholder resolves').to.be
      .true
    expect(node.warn.called, 'node should not warn when broker resolves').to.be.false
  })

  it('reconnects and re-consumes when connection closes', async () => {
    const clock = sinon.useFakeTimers({ shouldClearNativeTimers: true })
    const connectionHandlers: Record<string, (...args: any[]) => Promise<void> | void> = {}
    const channelHandlers: Record<string, (...args: any[]) => Promise<void> | void> = {}

    const connection = {
      on: sinon.stub().callsFake((event, handler) => {
        connectionHandlers[event] = handler
      }),
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
    const consumeStub = sinon.stub(Amqp.prototype, 'consume').resolves()

    let registeredNode: any
    const node = {
      id: 'n-in-2',
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

    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const amqpIn = require('../../src/nodes/amqp-in')
      amqpIn(RED as any)

      registeredNode.call(node, {
        id: 'n-in-2',
        broker: 'b1',
        queueName: 'input-queue',
        reconnectOnError: true,
        exchangeName: 'test',
        exchangeType: 'topic',
        exchangeRoutingKey: '#',
        queueExclusive: true,
        queueAutoDelete: true,
      })

      await connectStub.firstCall.returnValue
      await initializeStub.firstCall.returnValue
      await consumeStub.firstCall.returnValue
      await Promise.resolve()

      expect(connectStub.calledOnce, 'initial connect should run once').to.be.true
      expect(initializeStub.calledOnce, 'initial channel initialize should run').to.be
        .true
      expect(consumeStub.calledOnce, 'initial consume should run once').to.be.true
      expect(connectionHandlers.close, 'connection close handler should be registered').to.be.a(
        'function',
      )

      await connectionHandlers.close()
      await clock.tickAsync(2000)

      expect(connectStub.calledTwice, 'reconnect should create a second connection').to.be.true
      expect(
        consumeStub.calledTwice,
        'reconnect should invoke consume again for the new channel',
      ).to.be.true
    } finally {
      clock.restore()
    }
  })

  it('processes reconnectCall input and invokes done callback', async () => {
    const clock = sinon.useFakeTimers({ shouldClearNativeTimers: true })
    const onHandlers: Record<string, (...args: any[]) => Promise<void> | void> = {}
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
    const initializeStub = sinon.stub(Amqp.prototype, 'initialize').resolves(channel as any)
    const consumeStub = sinon.stub(Amqp.prototype, 'consume').resolves()

    let registeredNode: any
    let flowsStoppedHandler: (() => void) | undefined
    const node = {
      id: 'n-in-reconnect-input',
      status: sinon.stub(),
      on: sinon.stub().callsFake((event, handler) => {
        onHandlers[event] = handler
      }),
      log: sinon.stub(),
      warn: sinon.stub(),
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
      const amqpIn = require('../../src/nodes/amqp-in')
      amqpIn(RED as any)

      registeredNode.call(node, {
        id: 'n-in-reconnect-input',
        broker: 'b1',
        queueName: 'input-queue',
        reconnectOnError: true,
        exchangeName: 'test',
        exchangeType: 'topic',
        exchangeRoutingKey: '#',
        queueExclusive: true,
        queueAutoDelete: true,
      })

      const done = sinon.stub()
      await onHandlers.input({ payload: { reconnectCall: true } }, null, done)
      await clock.tickAsync(2000)

      expect(done.calledOnce, 'done should be called after reconnect input processing').to
        .be.true
      expect(connectStub.calledTwice, 'reconnectCall input should trigger reconnect').to.be
        .true

      expect(flowsStoppedHandler, 'flows:stopped handler should be registered').to.be.a(
        'function',
      )
      flowsStoppedHandler && flowsStoppedHandler()
    } finally {
      clock.restore()
    }
  })

  it('runs close handler cleanup and done callback', async () => {
    const onHandlers: Record<string, (...args: any[]) => Promise<void> | void> = {}
    const connection = {
      on: sinon.stub(),
      removeAllListeners: sinon.stub(),
      close: sinon.stub().resolves(),
    }
    const channel = {
      on: sinon.stub(),
      removeAllListeners: sinon.stub(),
      close: sinon.stub().resolves(),
    }

    const connectStub = sinon.stub(Amqp.prototype, 'connect').resolves(connection as any)
    const initializeStub = sinon.stub(Amqp.prototype, 'initialize').resolves(channel as any)
    sinon.stub(Amqp.prototype, 'consume').resolves()
    const amqpCloseStub = sinon.stub(Amqp.prototype, 'close').resolves()

    let registeredNode: any
    const node = {
      id: 'n-in-close-cleanup',
      status: sinon.stub(),
      on: sinon.stub().callsFake((event, handler) => {
        onHandlers[event] = handler
      }),
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
    const amqpIn = require('../../src/nodes/amqp-in')
    amqpIn(RED as any)

    registeredNode.call(node, {
      id: 'n-in-close-cleanup',
      broker: 'b1',
      queueName: 'input-queue',
      reconnectOnError: true,
      exchangeName: 'test',
      exchangeType: 'topic',
      exchangeRoutingKey: '#',
      queueExclusive: true,
      queueAutoDelete: true,
    })

    await connectStub.firstCall.returnValue
    await initializeStub.firstCall.returnValue
    await Promise.resolve()

    const done = sinon.stub()
    await onHandlers.close(done)

    expect(channel.removeAllListeners.calledOnce, 'channel listeners should be removed').to
      .be.true
    expect(connection.removeAllListeners.calledOnce, 'connection listeners should be removed').to
      .be.true
    expect(channel.close.calledOnce, 'channel should be closed during cleanup').to.be.true
    expect(connection.close.calledOnce, 'connection should be closed during cleanup').to.be
      .true
    expect(amqpCloseStub.calledOnce, 'amqp.close should be called during cleanup').to.be
      .true
    expect(done.calledOnce, 'close handler should invoke done callback').to.be.true
  })

  it('reports invalid login and generic connect errors with expected status', async () => {
    const invalidLoginError = Object.assign(new Error('invalid login'), {
      code: 'ENOTFOUND',
    })
    const genericError = new Error('generic connection failure')

    const connectStub = sinon
      .stub(Amqp.prototype, 'connect')
      .onFirstCall()
      .rejects(invalidLoginError)
      .onSecondCall()
      .rejects(genericError)
    sinon.stub(Amqp.prototype, 'initialize').resolves({ on: sinon.stub() } as any)
    sinon.stub(Amqp.prototype, 'consume').resolves()

    let registeredNode: any
    const node = {
      id: 'n-in-connect-error',
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
    const amqpIn = require('../../src/nodes/amqp-in')
    amqpIn(RED as any)

    registeredNode.call(node, {
      id: 'n-in-connect-error-1',
      broker: 'b1',
      queueName: 'input-queue',
      reconnectOnError: false,
      exchangeName: 'test',
      exchangeType: 'topic',
      exchangeRoutingKey: '#',
      queueExclusive: true,
      queueAutoDelete: true,
    })
    await Promise.resolve()

    registeredNode.call(node, {
      id: 'n-in-connect-error-2',
      broker: 'b1',
      queueName: 'input-queue',
      reconnectOnError: false,
      exchangeName: 'test',
      exchangeType: 'topic',
      exchangeRoutingKey: '#',
      queueExclusive: true,
      queueAutoDelete: true,
    })
    await Promise.resolve()

    expect(connectStub.calledTwice, 'both node instances should attempt connect').to.be.true
    expect(
      node.status.calledWithMatch({ text: 'Unable to connect' }),
      'invalid login error should set invalid status',
    ).to.be.true
    expect(
      node.status.calledWithMatch({ text: 'Error' }),
      'generic connect failure should set error status',
    ).to.be.true
    expect(node.error.calledTwice, 'both connect failures should be reported').to.be.true
  })

  it('suppresses duplicate reconnect requests while one is pending', async () => {
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
    const initializeStub = sinon.stub(Amqp.prototype, 'initialize').resolves(channel as any)
    sinon.stub(Amqp.prototype, 'consume').resolves()

    let registeredNode: any
    const node = {
      id: 'n-in-duplicate-reconnect',
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

    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const amqpIn = require('../../src/nodes/amqp-in')
      amqpIn(RED as any)

      registeredNode.call(node, {
        id: 'n-in-duplicate-reconnect',
        broker: 'b1',
        queueName: 'input-queue',
        reconnectOnError: true,
        exchangeName: 'test',
        exchangeType: 'topic',
        exchangeRoutingKey: '#',
        queueExclusive: true,
        queueAutoDelete: true,
      })

      await connectStub.firstCall.returnValue
      await initializeStub.firstCall.returnValue
      await Promise.resolve()

      await connectionHandlers.close()
      await connectionHandlers.close()
      await clock.tickAsync(2000)

      expect(
        connectStub.calledTwice,
        'duplicate close events should collapse into a single reconnect attempt',
      ).to.be.true
      expect(
        node.log.calledWithMatch('reconnect already pending'),
        'node should log duplicate reconnect suppression',
      ).to.be.true
    } finally {
      clock.restore()
    }
  })

  it('reconnects on connection/channel errors and closes when reconnectOnError is true', async () => {
    const clock = sinon.useFakeTimers({ shouldClearNativeTimers: true })
    const connectionHandlers: Record<string, (...args: any[]) => Promise<void> | void> = {}
    const channelHandlers: Record<string, (...args: any[]) => Promise<void> | void> = {}

    const connection = {
      on: sinon.stub().callsFake((event, handler) => {
        connectionHandlers[event] = handler
      }),
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
    sinon.stub(Amqp.prototype, 'consume').resolves()

    let registeredNode: any
    const node = {
      id: 'n-in-error-events',
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

    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const amqpIn = require('../../src/nodes/amqp-in')
      amqpIn(RED as any)

      registeredNode.call(node, {
        id: 'n-in-error-events',
        broker: 'b1',
        queueName: 'input-queue',
        reconnectOnError: true,
        exchangeName: 'test',
        exchangeType: 'topic',
        exchangeRoutingKey: '#',
        queueExclusive: true,
        queueAutoDelete: true,
      })

      await connectStub.firstCall.returnValue
      await initializeStub.firstCall.returnValue
      await Promise.resolve()

      await connectionHandlers.error(new Error('connection error'))
      await clock.tickAsync(2000)
      await channelHandlers.close()
      await clock.tickAsync(2000)
      await channelHandlers.error(new Error('channel error'))
      await clock.tickAsync(2000)

      expect(
        connectStub.callCount >= 4,
        'connection error, channel close and channel error should each schedule reconnect',
      ).to.be.true
      expect(node.error.callCount >= 2, 'connection/channel errors should be reported').to.be
        .true
    } finally {
      clock.restore()
    }
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
    const initializeStub = sinon.stub(Amqp.prototype, 'initialize').resolves(channel as any)
    const consumeStub = sinon.stub(Amqp.prototype, 'consume').resolves()

    let initializeLogCount = 0
    let registeredNode: any
    const node = {
      id: 'n-in-retry-throw',
      status: sinon.stub(),
      on: sinon.stub(),
      log: sinon.stub().callsFake((message: string) => {
        if (message.includes('AMQP state: initializing input node')) {
          initializeLogCount += 1
          if (initializeLogCount > 1) {
            throw new Error('forced initialize throw')
          }
        }
      }),
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

    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const amqpIn = require('../../src/nodes/amqp-in')
      amqpIn(RED as any)

      registeredNode.call(node, {
        id: 'n-in-retry-throw',
        broker: 'b1',
        queueName: 'input-queue',
        reconnectOnError: true,
        exchangeName: 'test',
        exchangeType: 'topic',
        exchangeRoutingKey: '#',
        queueExclusive: true,
        queueAutoDelete: true,
      })

      await connectStub.firstCall.returnValue
      await initializeStub.firstCall.returnValue
      await consumeStub.firstCall.returnValue
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

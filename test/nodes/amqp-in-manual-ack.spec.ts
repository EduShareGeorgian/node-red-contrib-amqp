/* eslint-disable @typescript-eslint/ban-ts-comment */
import { expect } from 'chai'
import * as sinon from 'sinon'
import Amqp from '../../src/Amqp'

describe('amqp-in-manual-ack Node', () => {
  afterEach(function () {
    sinon.restore()
  })

  it('suppresses reconnect after manual close ack mode', async () => {
    const clock = sinon.useFakeTimers({ shouldClearNativeTimers: true })
    const connectionHandlers: Record<string, (...args: any[]) => Promise<void> | void> = {}
    const onHandlers: Record<string, (...args: any[]) => Promise<void> | void> = {}

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
    sinon.stub(Amqp.prototype, 'close').resolves()

    let registeredNode: any
    const node = {
      id: 'n-manual-1',
      type: 'amqp-in-manual-ack',
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

    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const amqpInManualAck = require('../../src/nodes/amqp-in-manual-ack')
      amqpInManualAck(RED as any)

      registeredNode.call(node, {
        id: 'n-manual-1',
        broker: 'b1',
        queueName: 'manual-ack-queue',
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

      expect(onHandlers.input, 'input handler should be registered').to.be.a('function')
      await onHandlers.input({ manualAck: { ackMode: 'Close' } }, null, () => {})

      expect(connectionHandlers.close, 'connection close handler should be registered').to.be.a(
        'function',
      )
      await connectionHandlers.close()
      await clock.tickAsync(2000)

      expect(
        connectStub.calledOnce,
        'manual close should prevent reconnect attempts on subsequent connection close',
      ).to.be.true
    } finally {
      clock.restore()
    }
  })

  it('reconnects when reconnectCall input is received and node is not closed', async () => {
    const clock = sinon.useFakeTimers({ shouldClearNativeTimers: true })
    const connectionHandlers: Record<string, (...args: any[]) => Promise<void> | void> = {}
    const onHandlers: Record<string, (...args: any[]) => Promise<void> | void> = {}

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
    sinon.stub(Amqp.prototype, 'close').resolves()

    let registeredNode: any
    const node = {
      id: 'n-manual-2',
      type: 'amqp-in-manual-ack',
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

    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const amqpInManualAck = require('../../src/nodes/amqp-in-manual-ack')
      amqpInManualAck(RED as any)

      registeredNode.call(node, {
        id: 'n-manual-2',
        broker: 'b1',
        queueName: 'manual-ack-queue',
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

      expect(onHandlers.input, 'input handler should be registered').to.be.a('function')
      await onHandlers.input({ payload: { reconnectCall: true } }, null, () => {})
      await clock.tickAsync(2000)

      expect(connectStub.calledTwice, 'reconnectCall input should trigger reconnect').to
        .be.true
    } finally {
      clock.restore()
    }
  })

  it('warns and skips initialization when queue name is blank', () => {
    const connectStub = sinon.stub(Amqp.prototype, 'connect').resolves({} as any)

    let registeredNode: any
    const node = {
      id: 'n-manual-missing-queue',
      type: 'amqp-in-manual-ack',
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
    const amqpInManualAck = require('../../src/nodes/amqp-in-manual-ack')
    amqpInManualAck(RED as any)

    registeredNode.call(node, {
      id: 'n-manual-missing-queue',
      broker: 'b1',
      queueName: '   ',
      reconnectOnError: true,
      exchangeName: 'test',
      exchangeType: 'topic',
      exchangeRoutingKey: '#',
      queueExclusive: true,
      queueAutoDelete: true,
    })

    expect(connectStub.called, 'connect should not run when queue is blank').to.be.false
    expect(node.warn.calledOnce, 'node should warn about missing queue').to.be.true
  })

  it('warns and skips initialization when broker is unresolved placeholder', () => {
    const connectStub = sinon.stub(Amqp.prototype, 'connect').resolves({} as any)

    let registeredNode: any
    const node = {
      id: 'n-manual-missing-broker',
      type: 'amqp-in-manual-ack',
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
    const amqpInManualAck = require('../../src/nodes/amqp-in-manual-ack')
    amqpInManualAck(RED as any)

    registeredNode.call(node, {
      id: 'n-manual-missing-broker',
      broker: '${amqpOutBroker}',
      queueName: 'manual-ack-queue',
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
      id: 'n-manual-env-resolved-broker',
      type: 'amqp-in-manual-ack',
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
    const amqpInManualAck = require('../../src/nodes/amqp-in-manual-ack')
    amqpInManualAck(RED as any)

    registeredNode.call(node, {
      id: 'n-manual-env-resolved-broker',
      broker: '${amqpOutBroker}',
      queueName: 'manual-ack-queue',
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

  it('reports ack errors via node.error and still completes input handling', async () => {
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
    const consumeStub = sinon.stub(Amqp.prototype, 'consume').resolves()
    sinon.stub(Amqp.prototype, 'ack').throws(new Error('ack failed'))

    let registeredNode: any
    const node = {
      id: 'n-manual-ack-error',
      type: 'amqp-in-manual-ack',
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
    const amqpInManualAck = require('../../src/nodes/amqp-in-manual-ack')
    amqpInManualAck(RED as any)

    registeredNode.call(node, {
      id: 'n-manual-ack-error',
      broker: 'b1',
      queueName: 'manual-ack-queue',
      reconnectOnError: false,
      exchangeName: 'test',
      exchangeType: 'topic',
      exchangeRoutingKey: '#',
      queueExclusive: true,
      queueAutoDelete: true,
    })

    const done = sinon.stub()
    await onHandlers.input({ manualAck: { ackMode: 'Ack' }, payload: {} }, null, done)

    expect(node.error.calledOnce, 'ack failure should be reported through node.error').to.be
      .true
    expect(done.calledOnce, 'done should still be called by processReconnect').to.be.true
  })

  it('sets Closed status when handleAck requests close and status was not already Closed', async () => {
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

    sinon.stub(Amqp.prototype, 'connect').resolves(connection as any)
    sinon.stub(Amqp.prototype, 'initialize').resolves(channel as any)
    sinon.stub(Amqp.prototype, 'consume').resolves()

    let registeredNode: any
    const node = {
      id: 'n-manual-close-transition',
      type: 'amqp-in-manual-ack',
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
    const amqpInManualAck = require('../../src/nodes/amqp-in-manual-ack')
    amqpInManualAck(RED as any)

    registeredNode.call(node, {
      id: 'n-manual-close-transition',
      broker: 'b1',
      queueName: 'manual-ack-queue',
      reconnectOnError: false,
      exchangeName: 'test',
      exchangeType: 'topic',
      exchangeRoutingKey: '#',
      queueExclusive: true,
      queueAutoDelete: true,
    })

    await Promise.resolve()

    let manualAckAccess = 0
    const msg: any = { payload: {} }
    Object.defineProperty(msg, 'manualAck', {
      get() {
        manualAckAccess += 1
        return manualAckAccess === 1 ? undefined : { ackMode: 'Close' }
      },
      enumerable: true,
      configurable: true,
    })

    await onHandlers.input(msg, null, () => {})

    expect(
      node.status.calledWithMatch({ text: 'Closed' }),
      'closeRequested=true should transition status to Closed when not already closed',
    ).to.be.true
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
    const consumeStub = sinon.stub(Amqp.prototype, 'consume').resolves()
    const amqpCloseStub = sinon.stub(Amqp.prototype, 'close').resolves()

    let registeredNode: any
    const node = {
      id: 'n-manual-close-cleanup',
      type: 'amqp-in-manual-ack',
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
    const amqpInManualAck = require('../../src/nodes/amqp-in-manual-ack')
    amqpInManualAck(RED as any)

    registeredNode.call(node, {
      id: 'n-manual-close-cleanup',
      broker: 'b1',
      queueName: 'manual-ack-queue',
      reconnectOnError: false,
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

    const done = sinon.stub()
    await onHandlers.close(done)

    expect(channel.removeAllListeners.calledOnce, 'channel listeners should be removed').to
      .be.true
    expect(connection.removeAllListeners.calledOnce, 'connection listeners should be removed').to
      .be.true
    expect(channel.close.calledOnce, 'channel should be closed').to.be.true
    expect(connection.close.calledOnce, 'connection should be closed').to.be.true
    expect(amqpCloseStub.calledOnce, 'amqp.close should be called').to.be.true
    expect(done.calledOnce, 'close done callback should be invoked').to.be.true
  })

  it('handles invalid login and generic connect failures with expected status', async () => {
    const invalidLoginError = Object.assign(new Error('invalid login'), {
      code: 'ENOTFOUND',
    })
    const genericError = new Error('generic manual-ack connect failure')

    const connectStub = sinon
      .stub(Amqp.prototype, 'connect')
      .onFirstCall()
      .rejects(invalidLoginError)
      .onSecondCall()
      .rejects(genericError)

    let registeredNode: any
    const node = {
      id: 'n-manual-connect-errors',
      type: 'amqp-in-manual-ack',
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
    const amqpInManualAck = require('../../src/nodes/amqp-in-manual-ack')
    amqpInManualAck(RED as any)

    registeredNode.call(node, {
      id: 'n-manual-connect-errors-1',
      broker: 'b1',
      queueName: 'manual-ack-queue',
      reconnectOnError: false,
      exchangeName: 'test',
      exchangeType: 'topic',
      exchangeRoutingKey: '#',
      queueExclusive: true,
      queueAutoDelete: true,
    })
    await Promise.resolve()

    registeredNode.call(node, {
      id: 'n-manual-connect-errors-2',
      broker: 'b1',
      queueName: 'manual-ack-queue',
      reconnectOnError: false,
      exchangeName: 'test',
      exchangeType: 'topic',
      exchangeRoutingKey: '#',
      queueExclusive: true,
      queueAutoDelete: true,
    })
    await Promise.resolve()

    expect(connectStub.calledTwice, 'both instances should attempt connect').to.be.true
    expect(
      node.status.calledWithMatch({ text: 'Unable to connect' }),
      'invalid login should set Invalid status',
    ).to.be.true
    expect(
      node.status.calledWithMatch({ text: 'Error' }),
      'generic failure should set Error status',
    ).to.be.true
    expect(node.error.calledTwice, 'both connect failures should be reported').to.be.true
  })

  it('skips reconnect when node is Closed and flows:stopped clears timer', async () => {
    const clock = sinon.useFakeTimers({ shouldClearNativeTimers: true })
    const onHandlers: Record<string, (...args: any[]) => Promise<void> | void> = {}
    let flowsStoppedHandler: (() => void) | undefined

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
    const consumeStub = sinon.stub(Amqp.prototype, 'consume').resolves()
    sinon.stub(Amqp.prototype, 'close').resolves()

    let registeredNode: any
    const node = {
      id: 'n-manual-closed-reconnect-skip',
      type: 'amqp-in-manual-ack',
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
      const amqpInManualAck = require('../../src/nodes/amqp-in-manual-ack')
      amqpInManualAck(RED as any)

      registeredNode.call(node, {
        id: 'n-manual-closed-reconnect-skip',
        broker: 'b1',
        queueName: 'manual-ack-queue',
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

      await onHandlers.input({ manualAck: { ackMode: 'Close' } }, null, () => {})
      await onHandlers.input({ payload: { reconnectCall: true } }, null, () => {})

      expect(connectStub.calledOnce, 'reconnect should be skipped while node is Closed').to.be
        .true
      expect(
        node.log.calledWithMatch('reconnect skipped because node is Closed'),
        'manual-ack node should log reconnect skip when closed',
      ).to.be.true

      expect(flowsStoppedHandler, 'flows:stopped handler should be registered').to.be.a(
        'function',
      )
      flowsStoppedHandler && flowsStoppedHandler()
      await clock.tickAsync(2500)
      expect(connectStub.calledOnce, 'flows:stopped should prevent pending reconnect').to.be
        .true
    } finally {
      clock.restore()
    }
  })

  it('skips scheduled retry initialize when node becomes Closed before timer fires', async () => {
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
    sinon.stub(Amqp.prototype, 'close').resolves()

    let registeredNode: any
    const node = {
      id: 'n-manual-scheduled-skip',
      type: 'amqp-in-manual-ack',
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

    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const amqpInManualAck = require('../../src/nodes/amqp-in-manual-ack')
      amqpInManualAck(RED as any)

      registeredNode.call(node, {
        id: 'n-manual-scheduled-skip',
        broker: 'b1',
        queueName: 'manual-ack-queue',
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

      let manualAckAccess = 0
      const msg: any = { payload: {} }
      Object.defineProperty(msg, 'manualAck', {
        get() {
          manualAckAccess += 1
          return manualAckAccess === 1 ? undefined : { ackMode: 'Close' }
        },
        enumerable: true,
        configurable: true,
      })

      await onHandlers.input(msg, null, () => {})
      await clock.tickAsync(2100)

      expect(
        connectStub.calledOnce,
        'scheduled retry should not reconnect after node is transitioned to Closed',
      ).to.be.true
      expect(
        node.log.calledWithMatch('initialize skipped because node is Closed'),
        'scheduled retry should log initialize skip when status is Closed',
      ).to.be.true
    } finally {
      clock.restore()
    }
  })

  it('reconnects on connection/channel events when not closed and reconnectOnError is true', async () => {
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
    sinon.stub(Amqp.prototype, 'close').resolves()

    let registeredNode: any
    const node = {
      id: 'n-manual-event-reconnect',
      type: 'amqp-in-manual-ack',
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
      const amqpInManualAck = require('../../src/nodes/amqp-in-manual-ack')
      amqpInManualAck(RED as any)

      registeredNode.call(node, {
        id: 'n-manual-event-reconnect',
        broker: 'b1',
        queueName: 'manual-ack-queue',
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
      await connectionHandlers.error(new Error('conn err'))
      await clock.tickAsync(2000)
      await channelHandlers.close()
      await clock.tickAsync(2000)
      await channelHandlers.error(new Error('ch err'))
      await clock.tickAsync(2000)

      expect(connectStub.callCount >= 5, 'connection/channel events should trigger reconnect').to
        .be.true
      expect(node.error.callCount >= 2, 'connection and channel errors should be reported').to
        .be.true
    } finally {
      clock.restore()
    }
  })

  it('skips reconnect on channel close after node is manually closed', async () => {
    const clock = sinon.useFakeTimers({ shouldClearNativeTimers: true })
    const connectionHandlers: Record<string, (...args: any[]) => Promise<void> | void> = {}
    const channelHandlers: Record<string, (...args: any[]) => Promise<void> | void> = {}
    const onHandlers: Record<string, (...args: any[]) => Promise<void> | void> = {}

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
    sinon.stub(Amqp.prototype, 'close').resolves()

    let registeredNode: any
    const node = {
      id: 'n-manual-channel-close-skip',
      type: 'amqp-in-manual-ack',
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

    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const amqpInManualAck = require('../../src/nodes/amqp-in-manual-ack')
      amqpInManualAck(RED as any)

      registeredNode.call(node, {
        id: 'n-manual-channel-close-skip',
        broker: 'b1',
        queueName: 'manual-ack-queue',
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

      await onHandlers.input({ manualAck: { ackMode: 'Close' } }, null, () => {})
      await channelHandlers.close()
      await clock.tickAsync(2100)

      expect(
        connectStub.calledOnce,
        'channel close should not reconnect when node status is Closed',
      ).to.be.true
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
    sinon.stub(Amqp.prototype, 'close').resolves()

    let initializeLogCount = 0
    let registeredNode: any
    const node = {
      id: 'n-manual-retry-throw',
      type: 'amqp-in-manual-ack',
      status: sinon.stub(),
      on: sinon.stub(),
      log: sinon.stub().callsFake((message: string) => {
        if (message.includes('AMQP state: initializing manual-ack node')) {
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
      const amqpInManualAck = require('../../src/nodes/amqp-in-manual-ack')
      amqpInManualAck(RED as any)

      registeredNode.call(node, {
        id: 'n-manual-retry-throw',
        broker: 'b1',
        queueName: 'manual-ack-queue',
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

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
    sinon.stub(Amqp.prototype, 'initialize').resolves(channel as any)

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

      expect(connectStub.calledOnce).to.be.true
      expect(connectionHandlers['close']).to.be.a('function')

      await connectionHandlers['close']()
      await clock.tickAsync(2000)

      expect(channelRemoveAllListeners.calledOnce).to.be.true
      expect(channelClose.calledOnce).to.be.true
      expect(connectionRemoveAllListeners.calledOnce).to.be.true
      expect(connectionClose.calledOnce).to.be.true
      expect(connectStub.calledTwice).to.be.true
    } finally {
      clock.restore()
    }
  })

})

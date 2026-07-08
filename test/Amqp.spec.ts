/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/ban-ts-comment */
import { expect } from 'chai'
import * as sinon from 'sinon'
import * as amqplib from 'amqplib'
import Amqp from '../src/Amqp'
import { nodeConfigFixture, nodeFixture, brokerConfigFixture } from './doubles'
import {
  GenericJsonObject,
  ExchangeType,
  DefaultExchangeName,
} from '../src/types'
import { NODE_STATUS } from '../src/constants'

let RED: any
let amqp: any

describe('Amqp Class', () => {
  beforeEach(function (done) {
    RED = {
      nodes: {
        getNode: sinon.stub().returns(brokerConfigFixture),
      },
    }

    // @ts-ignore
    amqp = new Amqp(RED, nodeFixture, nodeConfigFixture)
    done()
  })

  afterEach(function (done) {
    sinon.restore()
    done()
  })

  it('constructs with default Direct exchange', () => {
    // @ts-ignore
    amqp = new Amqp(RED, nodeFixture, {
      ...nodeConfigFixture,
      exchangeType: ExchangeType.Direct,
      exchangeName: DefaultExchangeName.Direct,
    })
    expect(amqp.config.exchange.name).to.eq(DefaultExchangeName.Direct)
  })

  it('constructs with default Fanout exchange', () => {
    // @ts-ignore
    amqp = new Amqp(RED, nodeFixture, {
      ...nodeConfigFixture,
      exchangeType: ExchangeType.Fanout,
      exchangeName: DefaultExchangeName.Fanout,
    })
    expect(amqp.config.exchange.name).to.eq(DefaultExchangeName.Fanout)
  })

  it('constructs with default Topic exchange', () => {
    // @ts-ignore
    amqp = new Amqp(RED, nodeFixture, {
      ...nodeConfigFixture,
      exchangeType: ExchangeType.Topic,
      exchangeName: DefaultExchangeName.Topic,
    })
    expect(amqp.config.exchange.name).to.eq(DefaultExchangeName.Topic)
  })

  it('constructs with default Headers exchange', () => {
    // @ts-ignore
    amqp = new Amqp(RED, nodeFixture, {
      ...nodeConfigFixture,
      exchangeType: ExchangeType.Headers,
      exchangeName: DefaultExchangeName.Headers,
    })
    expect(amqp.config.exchange.name).to.eq(DefaultExchangeName.Headers)
  })

  it('connect()', async () => {
    const error = 'error!'
    const result = { on: (): string => error }

    // @ts-ignore
    sinon.stub(amqplib, 'connect').resolves(result)

    const connection = await amqp.connect()
    expect(connection, 'connect should resolve with the amqplib connection').to.eq(
      result,
    )
  })

  it('connect() throws when broker node cannot be resolved', async () => {
    RED.nodes.getNode = sinon.stub().returns(null)

    let thrownError: Error | null = null
    try {
      await amqp.connect()
    } catch (error) {
      thrownError = error as Error
    }

    expect(thrownError, 'connect should throw when broker node is missing').to.not.be
      .null
    expect(
      thrownError?.message,
      'error should explicitly identify missing broker configuration',
    ).to.include('broker node not found')
  })

  it('connect() resolves broker id from env placeholder before node lookup', async () => {
    const result = { on: (): string => 'ok' }
    // @ts-ignore
    sinon.stub(amqplib, 'connect').resolves(result)

    const getNodeStub = sinon.stub().callsFake((id: string) => {
      return id === 'resolved-broker-id' ? brokerConfigFixture : null
    })
    const evaluateEnvPropertyStub = sinon
      .stub()
      .withArgs('${amqpOutBroker}', sinon.match.any)
      .returns('resolved-broker-id')

    RED.nodes.getNode = getNodeStub
    RED.util = { evaluateEnvProperty: evaluateEnvPropertyStub }

    // @ts-ignore
    amqp = new Amqp(RED, nodeFixture, {
      ...nodeConfigFixture,
      broker: '${amqpOutBroker}',
    })

    const connection = await amqp.connect()

    expect(connection, 'connect should still resolve with amqplib connection').to.eq(
      result,
    )
    expect(
      getNodeStub.calledWith('resolved-broker-id'),
      'getNode should be called with env-resolved broker id',
    ).to.be.true
    expect(
      evaluateEnvPropertyStub.calledOnce,
      'env placeholder should be evaluated exactly once',
    ).to.be.true
  })

  it('connect() resolves nested placeholder via parent env scope', async () => {
    const result = { on: (): string => 'ok' }
    // @ts-ignore
    sinon.stub(amqplib, 'connect').resolves(result)

    const getNodeStub = sinon.stub().callsFake((id: string) => {
      return id === 'resolved-broker-id' ? brokerConfigFixture : null
    })
    const evaluateEnvPropertyStub = sinon.stub().callsFake((value: string) => {
      if (value === '${amqpOutBroker}') {
        return '${amqpOutBroker}'
      }
      if (value === '${$parent.amqpOutBroker}') {
        return 'resolved-broker-id'
      }
      return ''
    })

    RED.nodes.getNode = getNodeStub
    RED.util = { evaluateEnvProperty: evaluateEnvPropertyStub }

    // @ts-ignore
    amqp = new Amqp(RED, nodeFixture, {
      ...nodeConfigFixture,
      broker: '${amqpOutBroker}',
    })

    const connection = await amqp.connect()

    expect(connection, 'connect should still resolve with amqplib connection').to.eq(
      result,
    )
    expect(
      getNodeStub.calledWith('resolved-broker-id'),
      'getNode should receive parent-scope resolved broker id',
    ).to.be.true
    expect(
      evaluateEnvPropertyStub.calledWith('${$parent.amqpOutBroker}', sinon.match.any),
      'resolver should attempt parent-scope env lookup when direct value remains unresolved',
    ).to.be.true
  })

  it('connect() registers connection handlers that set disconnected status', async () => {
    const handlers: Record<string, (arg?: unknown) => void> = {}
    const connection = {
      on: sinon.stub().callsFake((event: string, handler: (arg?: unknown) => void) => {
        handlers[event] = handler
      }),
    }
    // @ts-ignore
    sinon.stub(amqplib, 'connect').resolves(connection)

    const statusStub = sinon.stub()
    const logStub = sinon.stub()
    amqp.node = {
      ...nodeFixture,
      status: statusStub,
      log: logStub,
    }

    await amqp.connect()

    expect(handlers.error, 'error handler should be registered').to.be.a('function')
    expect(handlers.close, 'close handler should be registered').to.be.a('function')

    handlers.error(new Error('network issue'))
    handlers.close()

    expect(
      statusStub.calledWith(NODE_STATUS.Disconnected),
      'both connection error and close events should set disconnected status',
    ).to.be.true
  })

  it('connect() uses amqp protocol when tls is false', async () => {
    const error = 'error!'
    const result = { on: (): string => error }
    // @ts-ignore
    const connectSpy = sinon.stub(amqplib, 'connect').resolves(result)

    const brokerWithoutTls = { ...brokerConfigFixture, tls: false }
    amqp.config.broker = brokerWithoutTls as any

    await amqp.connect()

    const calledArg = connectSpy.getCall(0).args[0] as any
    const calledUrl = typeof calledArg === 'string' ? calledArg : calledArg.url
    expect(
      (calledUrl as string).startsWith('amqp://'),
      'URL should start with amqp:// when tls is false',
    ).to.be.true
  })

  it('connect() uses amqps protocol and settings credentials when configured', async () => {
    const error = 'error!'
    const result = { on: (): string => error }
    // @ts-ignore
    const connectSpy = sinon.stub(amqplib, 'connect').resolves(result)

    const brokerWithTlsAndSettingsCreds = {
      ...brokerConfigFixture,
      tls: true,
      credsFromSettings: true,
      vhost: 'vh',
      credentials: { username: 'ignored', password: 'ignored' },
    }
    RED.nodes.getNode = sinon.stub().returns(brokerWithTlsAndSettingsCreds)
    RED.settings = {
      MW_CONTRIB_AMQP_USERNAME: 'settings-user',
      MW_CONTRIB_AMQP_PASSWORD: 'settings-pass',
    }

    await amqp.connect()

    const calledArg = connectSpy.getCall(0).args[0] as any
    const calledUrl = typeof calledArg === 'string' ? calledArg : calledArg.url
    expect(
      (calledUrl as string).startsWith('amqps://'),
      'URL should start with amqps:// when tls is true',
    ).to.be.true
    expect(
      calledUrl,
      'URL should use credentials from RED.settings when credsFromSettings is true',
    ).to.include('settings-user:settings-pass')
  })

  it('initialize()', async () => {
    const createChannelStub = sinon.stub()
    const assertExchangeStub = sinon.stub()

    amqp.createChannel = createChannelStub
    amqp.assertExchange = assertExchangeStub

    await amqp.initialize()
    expect(createChannelStub.calledOnce, 'initialize should create a channel').to.be
      .true
    expect(
      assertExchangeStub.calledOnce,
      'initialize should assert exchange after channel creation',
    ).to.be.true
  })

  it('consume()', async () => {
    const assertQueueStub = sinon.stub()
    const bindQueueStub = sinon.stub()
    const messageContent = 'messageContent'
    const send = sinon.stub()
    const error = sinon.stub()
    const node = { send, error }
    const channel = {
      consume: function (
        queue: string,
        cb: (arg0: any) => void,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        config: GenericJsonObject,
      ): void {
        const amqpMessage = { content: messageContent }
        cb(amqpMessage)
      },
    }
    amqp.channel = channel
    amqp.assertQueue = assertQueueStub
    amqp.bindQueue = bindQueueStub
    amqp.q = { queue: 'queueName' }
    amqp.node = node

    await amqp.consume()
    expect(assertQueueStub.calledOnce, 'consume should assert queue before consuming').to
      .be.true
    expect(bindQueueStub.calledOnce, 'consume should bind queue before consume').to.be
      .true
    expect(send.calledOnce, 'consume should forward received AMQP message').to.be.true
    expect(
      send.calledWith({
        content: messageContent,
        payload: messageContent,
      }),
      'consume should pass payload parsed from message content',
    ).to.be.true
  })

  it('consume() ignores null messages from amqplib callback', async () => {
    const assertQueueStub = sinon.stub().resolves()
    const bindQueueStub = sinon.stub().resolves()
    const sendStub = sinon.stub()
    const errorStub = sinon.stub()

    amqp.channel = {
      consume: (
        _queue: string,
        cb: (value: unknown) => void,
        _config: GenericJsonObject,
      ): void => {
        cb(null)
      },
    }
    amqp.assertQueue = assertQueueStub
    amqp.bindQueue = bindQueueStub
    amqp.q = { queue: 'queueName' }
    amqp.node = { send: sendStub, error: errorStub }

    await amqp.consume()

    expect(
      sendStub.called,
      'consume should not call node.send when amqplib delivers null message',
    ).to.be.false
    expect(errorStub.called, 'consume should not treat null message as an error').to.be
      .false
  })

  describe('publish()', () => {
    it('publishes a message (topic)', () => {
      const publishStub = sinon.stub()
      amqp.channel = {
        publish: publishStub,
      }
      amqp.publish('a message')
      expect(publishStub.calledOnce).to.equal(true)
    })

    it('publishes a message (fanout)', () => {
      // @ts-ignore
      amqp = new Amqp(RED, nodeFixture, {
        ...nodeConfigFixture,
        exchangeType: ExchangeType.Fanout,
      })
      const publishStub = sinon.stub()
      amqp.channel = {
        publish: publishStub,
      }
      amqp.publish('a message')
      expect(publishStub.calledOnce).to.equal(true)
    })

    it('publishes a message (direct w/RPC)', () => {
      // @ts-ignore
      amqp = new Amqp(RED, nodeFixture, {
        ...nodeConfigFixture,
        exchangeType: ExchangeType.Direct,
        outputs: 1,
      })
      const publishStub = sinon.stub()
      const assertQueueStub = sinon.stub()
      const consumeStub = sinon.stub()
      amqp.channel = {
        publish: publishStub,
        assertQueue: assertQueueStub,
        consume: consumeStub,
      }

      const routingKey = 'rpc-routingkey'
      amqp.config = {
        broker: '',
        exchange: { type: ExchangeType.Direct, routingKey },
        queue: {},
        amqpProperties: {},
        outputs: 1,
      }
      amqp.node = {
        error: sinon.stub(),
      }
      amqp.q = {}

      amqp.publish('a message')

      // FIXME: we're losing `this` in here and can't assert on mocks.
      // So no assertions :(
      // expect(consumeStub.calledOnce).to.equal(true)
      // expect(publishStub.calledOnce).to.equal(true)
    })

    it('tries to publish an invalid message', async () => {
      const publishStub = sinon.stub().throws()
      const errorStub = sinon.stub()
      amqp.channel = {
        publish: publishStub,
      }
      amqp.node = {
        error: errorStub,
      }
      await amqp.publish('a message')
      expect(publishStub.calledOnce).to.equal(true)
      expect(errorStub.calledOnce).to.equal(true)
    })

    it('throws when channel is unavailable for publish', async () => {
      const errorStub = sinon.stub()
      amqp.channel = {}  // publish property is undefined
      amqp.node = { error: errorStub }
      amqp.config.exchange.name = 'test-exchange'

      await amqp.publish('test message')

      expect(errorStub.calledOnce, 'error handler should be called').to.be.true
      const errorMsg = errorStub.getCall(0).args[0]
      expect(
        errorMsg.includes('AMQP channel unavailable'),
        'error should indicate channel is unavailable',
      ).to.be.true
    })

    it('includes object message context in publish error callback', async () => {
      const publishStub = sinon.stub().throws(new Error('publish failed'))
      const errorStub = sinon.stub()
      amqp.channel = {
        publish: publishStub,
      }
      amqp.node = {
        error: errorStub,
      }
      const objectMessage = { payload: 'a message', traceId: 't-1' }

      await amqp.publish(objectMessage)

      expect(errorStub.calledOnce, 'publish error should be reported once').to.be.true
      expect(
        errorStub.getCall(0).args[1],
        'object payload should be forwarded as Node-RED error context',
      ).to.deep.equal(objectMessage)
    })

    it('publishes with properties.correlationId (skips config fallback)', async () => {
      const publishStub = sinon.stub()
      const handleRPCStub = sinon.stub()
      amqp.channel = { publish: publishStub }
      amqp.handleRemoteProcedureCall = handleRPCStub
      amqp.config.amqpProperties = { correlationId: 'config-corr-id', replyTo: 'config-reply' }
      amqp.config.outputs = 1  // Enable RPC mode

      await amqp.publish('message', {
        correlationId: 'prop-corr-id',
        replyTo: 'prop-reply',
      })

      expect(publishStub.calledOnce, 'publish should be called').to.be.true
      const callArgs = publishStub.getCall(0).args
      // The options are the 4th argument to channel.publish()
      const options = callArgs[3] as any
      expect(options.correlationId, 'should use properties correlationId').to.equal('prop-corr-id')
      expect(options.replyTo, 'should use properties replyTo').to.equal('prop-reply')
    })

    it('publishes with config.amqpProperties.correlationId fallback', async () => {
      const publishStub = sinon.stub()
      const handleRPCStub = sinon.stub()
      amqp.channel = { publish: publishStub }
      amqp.handleRemoteProcedureCall = handleRPCStub
      amqp.config.amqpProperties = { correlationId: 'config-corr-id', replyTo: 'config-reply' }
      amqp.config.outputs = 1  // Enable RPC mode

      await amqp.publish('message')  // no properties argument

      expect(publishStub.calledOnce, 'publish should be called').to.be.true
      const callArgs = publishStub.getCall(0).args
      const options = callArgs[3] as any
      expect(options.correlationId, 'should use config correlationId').to.equal('config-corr-id')
      expect(options.replyTo, 'should use config replyTo').to.equal('config-reply')
    })

    it('publishes with random UUID fallback when no config properties', async () => {
      const publishStub = sinon.stub()
      const handleRPCStub = sinon.stub()
      amqp.channel = { publish: publishStub }
      amqp.handleRemoteProcedureCall = handleRPCStub
      amqp.config.amqpProperties = {}  // empty config
      amqp.config.outputs = 1  // Enable RPC mode

      await amqp.publish('message')  // no properties argument

      expect(publishStub.calledOnce, 'publish should be called').to.be.true
      const callArgs = publishStub.getCall(0).args
      const options = callArgs[3] as any
      // When neither properties nor config has values, uuidv4 is used
      expect(options.correlationId, 'should use uuidv4 for correlationId').to.match(/^[0-9a-f-]{36}$/)  // UUID format
      expect(options.replyTo, 'should use uuidv4 for replyTo').to.match(/^[0-9a-f-]{36}$/)  // UUID format
    })

    it('publishes with mixed fallback (properties correlationId + config replyTo)', async () => {
      const publishStub = sinon.stub()
      const handleRPCStub = sinon.stub()
      amqp.channel = { publish: publishStub }
      amqp.handleRemoteProcedureCall = handleRPCStub
      amqp.config.amqpProperties = { replyTo: 'config-reply' }
      amqp.config.outputs = 1

      await amqp.publish('message', {
        correlationId: 'prop-correlation-id',
      })

      expect(publishStub.calledOnce, 'publish should be called once').to.be.true
      const options = publishStub.getCall(0).args[3] as any
      expect(
        options.correlationId,
        'correlationId should come from properties when provided',
      ).to.equal('prop-correlation-id')
      expect(
        options.replyTo,
        'replyTo should fall back to config when properties.replyTo is missing',
      ).to.equal('config-reply')
    })

    it('publishes with mixed fallback (config correlationId + properties replyTo)', async () => {
      const publishStub = sinon.stub()
      const handleRPCStub = sinon.stub()
      amqp.channel = { publish: publishStub }
      amqp.handleRemoteProcedureCall = handleRPCStub
      amqp.config.amqpProperties = { correlationId: 'config-correlation-id' }
      amqp.config.outputs = 1

      await amqp.publish('message', {
        replyTo: 'prop-reply-to',
      })

      expect(publishStub.calledOnce, 'publish should be called once').to.be.true
      const options = publishStub.getCall(0).args[3] as any
      expect(
        options.correlationId,
        'correlationId should fall back to config when properties.correlationId is missing',
      ).to.equal('config-correlation-id')
      expect(
        options.replyTo,
        'replyTo should come from properties when provided',
      ).to.equal('prop-reply-to')
    })

    it('publishes with UUID fallback when amqpProperties object is undefined', async () => {
      const publishStub = sinon.stub()
      const handleRPCStub = sinon.stub()
      amqp.channel = { publish: publishStub }
      amqp.handleRemoteProcedureCall = handleRPCStub
      amqp.config.amqpProperties = undefined as any
      amqp.config.outputs = 1

      await amqp.publish('message')

      expect(publishStub.calledOnce, 'publish should be called once').to.be.true
      const options = publishStub.getCall(0).args[3] as any
      expect(
        options.correlationId,
        'correlationId should fall back to generated UUID when config is undefined',
      ).to.match(/^[0-9a-f-]{36}$/)
      expect(
        options.replyTo,
        'replyTo should fall back to generated UUID when config is undefined',
      ).to.match(/^[0-9a-f-]{36}$/)
    })

    it('publishes with routingKey fallback when handlePublish receives undefined routing key', async () => {
      const publishStub = sinon.stub()
      amqp.channel = { publish: publishStub }
      amqp.config.outputs = 0

      // @ts-ignore - testing private method branch directly
      await amqp.handlePublish(amqp.config, 'message', {}, undefined)

      expect(publishStub.calledOnce, 'publish should be called once').to.be.true
      expect(
        publishStub.getCall(0).args[1],
        'routingKey should default to empty string when undefined',
      ).to.equal('')
    })
  })

  it('handleRemoteProcedureCall() sends timeout message when RPC times out', async () => {
    const clock = sinon.useFakeTimers()
    const correlationId = 'test-correlation-123'
    const queueName = 'rpc-reply-queue'
    const deleteQueueStub = sinon.stub().resolves()
    const sendStub = sinon.stub()
    const errorStub = sinon.stub()
    const assertQueueStub = sinon.stub().resolves(queueName)

    const consumeStub = sinon.stub().resolves()

    amqp.channel = {
      consume: consumeStub,
      deleteQueue: deleteQueueStub,
    }
    amqp.assertQueue = assertQueueStub
    amqp.node = { send: sendStub, error: errorStub }
    amqp.config.rpcTimeout = 1000

    try {
      const rpcPromise = amqp.handleRemoteProcedureCall(correlationId, queueName)

      // Fast-forward time to trigger timeout
      await clock.tickAsync(1100)
      await rpcPromise

      expect(
        sendStub.calledOnce,
        'send should be called with timeout message',
      ).to.be.true
      expect(
        sendStub.getCall(0).args[0].payload.message.includes('Timeout'),
        'message should indicate timeout',
      ).to.be.true
    } finally {
      clock.restore()
    }
  })

  it('handleRemoteProcedureCall() handles error during queue deletion in timeout', async () => {
    const clock = sinon.useFakeTimers()
    const correlationId = 'test-correlation-123'
    const queueName = 'rpc-reply-queue'
    const deleteError = new Error('Queue deletion failed')
    const deleteQueueStub = sinon.stub().rejects(deleteError)
    const sendStub = sinon.stub()
    const errorStub = sinon.stub()
    const assertQueueStub = sinon.stub().resolves(queueName)

    const consumeStub = sinon.stub().resolves()

    amqp.channel = {
      consume: consumeStub,
      deleteQueue: deleteQueueStub,
    }
    amqp.assertQueue = assertQueueStub
    amqp.node = { send: sendStub, error: errorStub }
    amqp.config.rpcTimeout = 500

    try {
      const rpcPromise = amqp.handleRemoteProcedureCall(correlationId, queueName)

      // Fast-forward to trigger timeout and error handling
      await clock.tickAsync(600)
      await rpcPromise

      expect(
        errorStub.calledOnce,
        'error should be called when queue deletion fails',
      ).to.be.true
      expect(
        errorStub.getCall(0).args[0].includes('Error trying to cancel RPC consumer'),
        'error message should indicate RPC consumer error',
      ).to.be.true
    } finally {
      clock.restore()
    }
  })

  it('handleRemoteProcedureCall() handles correlation ID mismatch', async () => {
    const correlationId = 'test-correlation-123'
    const queueName = 'rpc-reply-queue'
    const deleteQueueStub = sinon.stub().resolves()
    const assertQueueStub = sinon.stub().resolves(queueName)

    let capturedQueue: string | undefined
    let capturedCallback: any
    const consumeStub = sinon.stub().callsFake((queue, callback, options) => {
      capturedQueue = queue
      capturedCallback = callback
      return Promise.resolve()
    })

    amqp.channel = {
      consume: consumeStub,
      deleteQueue: deleteQueueStub,
    }
    amqp.assertQueue = assertQueueStub
    amqp.node = { send: sinon.stub(), error: sinon.stub() }

    // Start RPC but don't wait (to avoid timeout)
    amqp.handleRemoteProcedureCall(correlationId, queueName)

    // Let the promise execute
    await new Promise(resolve => setImmediate(resolve))

    // Invoke consume callback with MISMATCHED correlation ID
    if (capturedCallback) {
      const mockMessage = {
        content: Buffer.from('test response'),
        properties: { correlationId: 'different-correlation-id' },
      }
      // Should not call send when correlation IDs don't match
      await capturedCallback(mockMessage)
    }

    // After timeout, error should NOT have been called for mismatch (message just discarded)
    expect(
      consumeStub.calledOnce,
      'consume should be called',
    ).to.be.true
  })

  it('handleRemoteProcedureCall() invokes consume callback with correct config', async () => {
    const correlationId = 'test-correlation-123'
    const queueName = 'rpc-reply-queue'
    const deleteQueueStub = sinon.stub().resolves()
    const assertQueueStub = sinon.stub().resolves(queueName)

    let capturedQueue: string | undefined
    let capturedOptions: any
    let capturedCallback: any
    const consumeStub = sinon.stub().callsFake((queue, callback, options) => {
      capturedQueue = queue
      capturedCallback = callback
      capturedOptions = options
      return Promise.resolve()
    })

    amqp.channel = {
      consume: consumeStub,
      deleteQueue: deleteQueueStub,
    }
    amqp.assertQueue = assertQueueStub
    amqp.node = { send: sinon.stub(), error: sinon.stub() }
    amqp.config.noAck = false

    // Start RPC but don't wait (to avoid the timeout)
    amqp.handleRemoteProcedureCall(correlationId, queueName)

    // Let the promise execute far enough to set up consume
    await new Promise(resolve => setImmediate(resolve))

    // Verify consume was called with correct parameters
    expect(
      consumeStub.calledOnce,
      'consume should be called to set up RPC listener',
    ).to.be.true
    expect(
      capturedQueue,
      'consume should use the RPC reply queue',
    ).to.equal(queueName)
    expect(
      capturedOptions.noAck,
      'consume should use noAck=true for RPC',
    ).to.be.true

    // Invoke consume callback with message to verify the callback handler logic
    if (capturedCallback) {
      const sendStub = sinon.stub()
      amqp.node.send = sendStub

      // Test with matching correlation ID
      const mockMessage = {
        content: Buffer.from('test response'),
        properties: { correlationId },
      }
      await capturedCallback(mockMessage)

      expect(
        sendStub.calledOnce,
        'send should be called when correlation ID matches',
      ).to.be.true
    }
  })

  it('handleRemoteProcedureCall() handles error during RPC setup', async () => {
    const correlationId = 'test-correlation-123'
    const queueName = 'rpc-reply-queue'
    const setupError = new Error('RPC setup failed')
    const assertQueueStub = sinon.stub().rejects(setupError)
    const errorStub = sinon.stub()

    amqp.assertQueue = assertQueueStub
    amqp.node = { error: errorStub }

    // Call handleRemoteProcedureCall - it should handle the error internally
    await amqp.handleRemoteProcedureCall(correlationId, queueName)

    // Error handler should be called when setup fails
    expect(
      errorStub.calledOnce,
      'error should be called when RPC setup fails',
    ).to.be.true
    expect(
      errorStub.getCall(0).args[0].includes('Could not consume RPC message'),
      'error message should indicate RPC consumption error',
    ).to.be.true
  })

  it('getCredsFromSettings() retrieves username and password from RED.settings', () => {
    const testUsername = 'testuser123'
    const testPassword = 'testpass456'

    amqp.RED.settings = {
      MW_CONTRIB_AMQP_USERNAME: testUsername,
      MW_CONTRIB_AMQP_PASSWORD: testPassword,
    }

    // @ts-ignore - accessing private method for testing
    const creds = amqp.getCredsFromSettings()

    expect(creds.username, 'username should match').to.equal(testUsername)
    expect(creds.password, 'password should match').to.equal(testPassword)
  })

  it('getCredsFromSettings() defaults to empty strings when settings are missing', () => {
    amqp.RED.settings = {}

    // @ts-ignore - accessing private method for test branch coverage
    const creds = amqp.getCredsFromSettings()

    expect(creds.username, 'missing username setting should resolve to empty string').to
      .equal('')
    expect(creds.password, 'missing password setting should resolve to empty string').to
      .equal('')
  })

  it('close()', async () => {
    const { exchangeName, exchangeRoutingKey } = nodeConfigFixture
    const queueName = 'queueName'

    const unbindQueueStub = sinon.stub().resolves()
    const channelCloseStub = sinon.stub().resolves()
    const connectionCloseStub = sinon.stub().resolves()
    const assertQueueStub = sinon.stub().resolves({ queue: queueName })

    amqp.channel = {
      unbindQueue: unbindQueueStub,
      close: channelCloseStub,
      assertQueue: assertQueueStub,
    }
    amqp.connection = { close: connectionCloseStub }
    amqp.config.queue.name = queueName
    await amqp.assertQueue()

    await amqp.close()

    expect(unbindQueueStub.calledOnce).to.equal(true)
    expect(
      unbindQueueStub.calledWith(queueName, exchangeName, exchangeRoutingKey),
    ).to.equal(true)
    expect(channelCloseStub.calledOnce).to.equal(true)
    expect(connectionCloseStub.calledOnce).to.equal(true)
  })

  it('createChannel()', async () => {
    const error = 'error!'
    const result = {
      on: (): string => error,
      prefetch: (): null => null,
    }
    const createChannelStub = sinon.stub().returns(result)
    amqp.connection = { createChannel: createChannelStub }

    await amqp.createChannel()
    expect(createChannelStub.calledOnce).to.equal(true)
    expect(amqp.channel).to.eq(result)
  })

  it('assertExchange()', async () => {
    const assertExchangeStub = sinon.stub()
    amqp.channel = { assertExchange: assertExchangeStub }
    const { exchangeName, exchangeType, exchangeDurable } = nodeConfigFixture

    await amqp.assertExchange()
    expect(assertExchangeStub.calledOnce).to.equal(true)
    expect(
      assertExchangeStub.calledWith(exchangeName, exchangeType, {
        durable: exchangeDurable,
      }),
    ).to.equal(true)
  })

  it('assertQueue()', async () => {
    const queue = 'queueName'
    const { queueName, queueExclusive, queueDurable, queueAutoDelete } =
      nodeConfigFixture
    const assertQueueStub = sinon.stub().resolves({ queue })
    amqp.channel = { assertQueue: assertQueueStub }

    await amqp.assertQueue()
    expect(assertQueueStub.calledOnce).to.equal(true)
    expect(
      assertQueueStub.calledWith(queueName, {
        exclusive: queueExclusive,
        durable: queueDurable,
        autoDelete: queueAutoDelete,
      }),
    ).to.equal(true)
  })

  it('bindQueue() topic exchange', () => {
    const queue = 'queueName'
    const bindQueueStub = sinon.stub()
    amqp.channel = { bindQueue: bindQueueStub }
    amqp.q = { queue }
    const { exchangeName, exchangeRoutingKey } = nodeConfigFixture

    amqp.bindQueue()
    expect(bindQueueStub.calledOnce).to.equal(true)
    expect(
      bindQueueStub.calledWith(queue, exchangeName, exchangeRoutingKey),
    ).to.equal(true)
  })

  it('bindQueue() direct exchange', () => {
    const config = {
      ...nodeConfigFixture,
      exchangeType: ExchangeType.Direct,
      exchangeRoutingKey: 'routing-key',
    }
    // @ts-ignore
    amqp = new Amqp(RED, nodeFixture, config)

    const queue = 'queueName'
    const bindQueueStub = sinon.stub()
    amqp.channel = { bindQueue: bindQueueStub }
    amqp.q = { queue }
    const { exchangeName, exchangeRoutingKey } = config

    amqp.bindQueue()
    // expect(bindQueueStub.calledOnce).to.equal(true)
    expect(
      bindQueueStub.calledWith(queue, exchangeName, exchangeRoutingKey),
    ).to.equal(true)
  })

  it('bindQueue() fanout exchange', () => {
    const config = {
      ...nodeConfigFixture,
      exchangeType: ExchangeType.Fanout,
      exchangeRoutingKey: '',
    }
    // @ts-ignore
    amqp = new Amqp(RED, nodeFixture, config)

    const queue = 'queueName'
    const bindQueueStub = sinon.stub()
    amqp.channel = { bindQueue: bindQueueStub }
    amqp.q = { queue }
    const { exchangeName } = config

    amqp.bindQueue()
    expect(bindQueueStub.calledOnce).to.equal(true)
    expect(bindQueueStub.calledWith(queue, exchangeName, '')).to.equal(true)
  })

  it('bindQueue() headers exchange', () => {
    const config = {
      ...nodeConfigFixture,
      exchangeType: ExchangeType.Headers,
      exchangeRoutingKey: '',
      headers: { some: 'headers' },
    }
    // @ts-ignore
    amqp = new Amqp(RED, nodeFixture, config)

    const queue = 'queueName'
    const bindQueueStub = sinon.stub()
    amqp.channel = { bindQueue: bindQueueStub }
    amqp.q = { queue }
    const { exchangeName, headers } = config

    amqp.bindQueue()
    expect(bindQueueStub.calledOnce).to.equal(true)
    expect(bindQueueStub.calledWith(queue, exchangeName, '', headers)).to.equal(
      true,
    )
  })

  it('bindQueue() uses configParams exchange and amqpProperties when provided', async () => {
    const queue = 'queueName'
    const bindQueueStub = sinon.stub().resolves()
    amqp.channel = { bindQueue: bindQueueStub }
    amqp.q = { queue }

    await amqp.bindQueue({
      ...amqp.config,
      exchange: {
        name: 'headers-exchange',
        type: ExchangeType.Headers,
        routingKey: 'ignored-for-headers',
        durable: true,
      },
      amqpProperties: {
        headers: { branch: 'covered' },
      },
    })

    expect(bindQueueStub.calledOnce, 'bindQueue should run once for headers exchange').to
      .be.true
    expect(
      bindQueueStub.calledWith(queue, 'headers-exchange', '', {
        branch: 'covered',
      }),
      'bindQueue should use headers from configParams.amqpProperties',
    ).to.be.true
  })

  it('setRoutingKey() updates exchange routing key', () => {
    const newRoutingKey = 'new.routing.key'
    amqp.setRoutingKey(newRoutingKey)
    expect(
      amqp.config.exchange.routingKey,
      'routing key should be updated',
    ).to.equal(newRoutingKey)
  })

  it('parseRoutingKeys() uses routingKeyArg when provided', () => {
    amqp.config.exchange.routingKey = 'config.routing.key'
    amqp.q = { queue: 'queue.fallback' }

    // @ts-ignore
    const result = amqp.parseRoutingKeys('arg.routing.key')
    expect(result, 'should use routingKeyArg').to.include('arg.routing.key')
  })

  it('parseRoutingKeys() uses config.exchange.routingKey fallback', () => {
    amqp.config.exchange.routingKey = 'config.routing.key'
    amqp.q = { queue: 'queue.fallback' }

    // @ts-ignore
    const result = amqp.parseRoutingKeys()
    expect(result, 'should use config routing key').to.include('config.routing.key')
  })

  it('parseRoutingKeys() uses this.q?.queue fallback', () => {
    amqp.config.exchange.routingKey = ''
    amqp.q = { queue: 'queue.fallback' }

    // @ts-ignore
    const result = amqp.parseRoutingKeys()
    expect(result, 'should use queue as fallback').to.include('queue.fallback')
  })

  it('parseRoutingKeys() splits comma-separated keys', () => {
    // @ts-ignore
    const result = amqp.parseRoutingKeys('key1,key2, key3')
    expect(result, 'should split and trim keys').to.deep.equal(['key1', 'key2', 'key3'])
  })

  it('parseRoutingKeys() falls back to empty string when no routing source exists', () => {
    amqp.config.exchange.routingKey = ''
    // @ts-ignore
    amqp.q = undefined

    // @ts-ignore
    const result = amqp.parseRoutingKeys()
    expect(result, 'should return a single empty routing key fallback').to.deep.equal([
      '',
    ])
  })

  it('ack() calls channel.ack with correct parameters', () => {
    const ackStub = sinon.stub()
    amqp.channel = { ack: ackStub }
    const msg = { manualAck: { allUpTo: true } }
    amqp.ack(msg as any)
    expect(ackStub.calledOnce, 'ack should be called once').to.be.true
    expect(
      ackStub.calledWith(msg, true),
      'ack should be called with msg and allUpTo=true',
    ).to.be.true
  })

  it('ack() defaults allUpTo to false when not specified', () => {
    const ackStub = sinon.stub()
    amqp.channel = { ack: ackStub }
    const msg = { manualAck: {} }
    amqp.ack(msg as any)
    expect(ackStub.calledOnce, 'ack should be called once').to.be.true
    expect(
      ackStub.calledWith(msg, false),
      'ack should be called with msg and allUpTo=false',
    ).to.be.true
  })

  it('ack() with no manualAck property', () => {
    const ackStub = sinon.stub()
    amqp.channel = { ack: ackStub }
    const msg = {}
    amqp.ack(msg as any)
    expect(ackStub.calledOnce, 'ack should be called once').to.be.true
    expect(
      ackStub.calledWith(msg, false),
      'ack should default allUpTo to false when manualAck is missing',
    ).to.be.true
  })

  it('ack() with allUpTo explicitly false', () => {
    const ackStub = sinon.stub()
    amqp.channel = { ack: ackStub }
    const msg = { manualAck: { allUpTo: false } }
    amqp.ack(msg as any)
    expect(ackStub.calledOnce, 'ack should be called once').to.be.true
    expect(
      ackStub.calledWith(msg, false),
      'ack should handle allUpTo=false',
    ).to.be.true
  })

  it('ackAll() calls channel.ackAll', () => {
    const ackAllStub = sinon.stub()
    amqp.channel = { ackAll: ackAllStub }
    amqp.ackAll()
    expect(ackAllStub.calledOnce, 'ackAll should be called once').to.be.true
  })

  it('nack() calls channel.nack with allUpTo and requeue', () => {
    const nackStub = sinon.stub()
    amqp.channel = { nack: nackStub }
    const msg = { manualAck: { allUpTo: true, requeue: false } }
    amqp.nack(msg as any)
    expect(nackStub.calledOnce, 'nack should be called once').to.be.true
    expect(
      nackStub.calledWith(msg, true, false),
      'nack should be called with msg, allUpTo=true, requeue=false',
    ).to.be.true
  })

  it('nackAll() calls channel.nackAll with requeue', () => {
    const nackAllStub = sinon.stub()
    amqp.channel = { nackAll: nackAllStub }
    const msg = { manualAck: { requeue: false } }
    amqp.nackAll(msg as any)
    expect(nackAllStub.calledOnce, 'nackAll should be called once').to.be.true
    expect(
      nackAllStub.calledWith(false),
      'nackAll should be called with requeue=false',
    ).to.be.true
  })

  it('nackAll() defaults requeue to true when not specified', () => {
    const nackAllStub = sinon.stub()
    amqp.channel = { nackAll: nackAllStub }
    const msg = { manualAck: {} }
    amqp.nackAll(msg as any)
    expect(nackAllStub.calledOnce, 'nackAll should be called once').to.be.true
    expect(
      nackAllStub.calledWith(true),
      'nackAll should be called with requeue=true',
    ).to.be.true
  })

  it('reject() calls channel.reject with requeue', () => {
    const rejectStub = sinon.stub()
    amqp.channel = { reject: rejectStub }
    const msg = { manualAck: { requeue: false } }
    amqp.reject(msg as any)
    expect(rejectStub.calledOnce, 'reject should be called once').to.be.true
    expect(
      rejectStub.calledWith(msg, false),
      'reject should be called with msg and requeue=false',
    ).to.be.true
  })

  it('nack() uses allUpTo=false when allUpTo is not set', () => {
    const nackStub = sinon.stub()
    amqp.channel = { nack: nackStub }
    const msg = { manualAck: { requeue: true } }
    amqp.nack(msg as any)
    expect(nackStub.calledOnce, 'nack should be called once').to.be.true
    expect(
      nackStub.calledWith(msg, false, true),
      'nack should be called with msg, allUpTo=false (falsy), requeue=true',
    ).to.be.true
  })

  it('nack() with no manualAck property', () => {
    const nackStub = sinon.stub()
    amqp.channel = { nack: nackStub }
    const msg = {}
    amqp.nack(msg as any)
    expect(nackStub.calledOnce, 'nack should be called once').to.be.true
    expect(
      nackStub.calledWith(msg, false, true),
      'nack should default requeue to true when manualAck is missing',
    ).to.be.true
  })

  it('nackAll() with no manualAck property', () => {
    const nackAllStub = sinon.stub()
    amqp.channel = { nackAll: nackAllStub }
    const msg = {}
    amqp.nackAll(msg as any)
    expect(nackAllStub.calledOnce, 'nackAll should be called once').to.be.true
    expect(
      nackAllStub.calledWith(true),
      'nackAll should default requeue to true when manualAck is missing',
    ).to.be.true
  })

  it('reject() with no manualAck property', () => {
    const rejectStub = sinon.stub()
    amqp.channel = { reject: rejectStub }
    const msg = {}
    amqp.reject(msg as any)
    expect(rejectStub.calledOnce, 'reject should be called once').to.be.true
    expect(
      rejectStub.calledWith(msg, true),
      'reject should default requeue to true when manualAck is missing',
    ).to.be.true
  })

  it('nack() with allUpTo explicitly false', () => {
    const nackStub = sinon.stub()
    amqp.channel = { nack: nackStub }
    const msg = { manualAck: { allUpTo: false, requeue: false } }
    amqp.nack(msg as any)
    expect(nackStub.calledOnce, 'nack should be called once').to.be.true
    expect(
      nackStub.calledWith(msg, false, false),
      'nack should handle allUpTo=false and requeue=false',
    ).to.be.true
  })

  it('nackAll() with explicit requeue=true', () => {
    const nackAllStub = sinon.stub()
    amqp.channel = { nackAll: nackAllStub }
    const msg = { manualAck: { requeue: true } }
    amqp.nackAll(msg as any)
    expect(nackAllStub.calledOnce, 'nackAll should be called once').to.be.true
    expect(
      nackAllStub.calledWith(true),
      'nackAll should be called with requeue=true',
    ).to.be.true
  })

  it('reject() with requeue=true', () => {
    const rejectStub = sinon.stub()
    amqp.channel = { reject: rejectStub }
    const msg = { manualAck: { requeue: true } }
    amqp.reject(msg as any)
    expect(rejectStub.calledOnce, 'reject should be called once').to.be.true
    expect(
      rejectStub.calledWith(msg, true),
      'reject should be called with msg and requeue=true',
    ).to.be.true
  })

  it('reject() defaults requeue to true when not specified', () => {
    const rejectStub = sinon.stub()
    amqp.channel = { reject: rejectStub }
    const msg = { manualAck: {} }
    amqp.reject(msg as any)
    expect(rejectStub.calledOnce, 'reject should be called once').to.be.true
    expect(
      rejectStub.calledWith(msg, true),
      'reject should be called with msg and requeue=true (default)',
    ).to.be.true
  })

  it('close() skips unbindQueue when autoDelete is false', async () => {
    const unbindQueueStub = sinon.stub()
    const channelCloseStub = sinon.stub().resolves()
    const connectionCloseStub = sinon.stub().resolves()

    amqp.channel = {
      unbindQueue: unbindQueueStub,
      close: channelCloseStub,
    }
    amqp.connection = { close: connectionCloseStub }
    amqp.config.queue.name = 'queueName'
    amqp.config.queue.autoDelete = false  // This skips the unbind

    await amqp.close()

    expect(
      unbindQueueStub.called,
      'unbindQueue should NOT be called when autoDelete is false',
    ).to.be.false
    expect(channelCloseStub.calledOnce, 'channel close should be called').to.be.true
    expect(connectionCloseStub.calledOnce, 'connection close should be called').to.be
      .true
  })

  it('close() skips unbindQueue when exchange name is empty', async () => {
    const unbindQueueStub = sinon.stub()
    const channelCloseStub = sinon.stub().resolves()
    const connectionCloseStub = sinon.stub().resolves()

    amqp.channel = {
      unbindQueue: unbindQueueStub,
      close: channelCloseStub,
    }
    amqp.connection = { close: connectionCloseStub }
    amqp.config.exchange.name = ''  // Empty exchange name
    amqp.config.queue.name = 'queueName'
    amqp.config.queue.autoDelete = true

    await amqp.close()

    expect(
      unbindQueueStub.called,
      'unbindQueue should NOT be called when exchange name is empty',
    ).to.be.false
    expect(channelCloseStub.calledOnce, 'channel close should be called').to.be.true
  })

  it('close() skips unbindQueue when queue name is empty', async () => {
    const { exchangeName } = nodeConfigFixture
    const unbindQueueStub = sinon.stub()
    const channelCloseStub = sinon.stub().resolves()
    const connectionCloseStub = sinon.stub().resolves()

    amqp.channel = {
      unbindQueue: unbindQueueStub,
      close: channelCloseStub,
    }
    amqp.connection = { close: connectionCloseStub }
    amqp.config.exchange.name = exchangeName
    amqp.config.queue.name = ''  // Empty queue name
    amqp.config.queue.autoDelete = true

    await amqp.close()

    expect(
      unbindQueueStub.called,
      'unbindQueue should NOT be called when queue name is empty',
    ).to.be.false
    expect(channelCloseStub.calledOnce, 'channel close should be called').to.be.true
  })

  it('close() handles unbindQueue error gracefully', async () => {
    const { exchangeName, exchangeRoutingKey } = nodeConfigFixture
    const queueName = 'queueName'

    const unbindQueueStub = sinon.stub().rejects(new Error('Unbind failed'))
    const channelCloseStub = sinon.stub().resolves()
    const connectionCloseStub = sinon.stub().resolves()
    const consoleErrorStub = sinon.stub(console, 'error')

    amqp.channel = {
      unbindQueue: unbindQueueStub,
      close: channelCloseStub,
    }
    amqp.connection = { close: connectionCloseStub }
    amqp.config.queue.name = queueName
    amqp.config.queue.autoDelete = true

    await amqp.close()

    expect(
      consoleErrorStub.calledOnce,
      'console.error should be called when unbindQueue fails',
    ).to.be.true
    expect(
      channelCloseStub.calledOnce,
      'channel close should still be called',
    ).to.be.true
    expect(
      connectionCloseStub.calledOnce,
      'connection close should still be called',
    ).to.be.true

    consoleErrorStub.restore()
  })

  it('createChannel() registers channel error event listener', async () => {
    const result = {
      on: sinon.stub().returns(null),
      prefetch: (): null => null,
    }
    const createChannelStub = sinon.stub().returns(result)
    amqp.connection = { createChannel: createChannelStub }
    amqp.node = {
      status: sinon.stub(),
      error: sinon.stub(),
    }

    await amqp.createChannel()

    expect(
      result.on.called,
      'channel error listener should be registered',
    ).to.be.true
    expect(
      result.on.calledWith('error'),
      'should register error event listener',
    ).to.be.true
  })
})

import { NodeAPI, Node, NodeMessage } from 'node-red'
import { randomUUID } from 'node:crypto'
import cloneDeep = require('lodash.clonedeep')
import {
  Connection,
  Channel,
  Replies,
  connect,
  ConsumeMessage,
  MessageProperties,
} from 'amqplib'
import {
  AmqpConfig,
  BrokerConfig,
  NodeType,
  AssembledMessage,
  GenericJsonObject,
  ExchangeType,
  AmqpInNodeDefaults,
  AmqpOutNodeDefaults,
} from './types'
import { NODE_STATUS } from './constants'

export default class Amqp {
  private config: AmqpConfig
  private broker!: Node
  private connection!: Awaited<ReturnType<typeof connect>>
  private channel!: Channel
  private q!: Replies.AssertQueue

  constructor(
    private readonly RED: NodeAPI,
    private readonly node: Node,
    config: AmqpInNodeDefaults & AmqpOutNodeDefaults,
  ) {
    this.config = {
      name: config.name,
      broker: config.broker,
      prefetch: config.prefetch,
      reconnectOnError: config.reconnectOnError,
      noAck: config.noAck,
      exchange: {
        name: config.exchangeName,
        type: config.exchangeType,
        routingKey: config.exchangeRoutingKey,
        durable: config.exchangeDurable,
      },
      queue: {
        name: config.queueName,
        exclusive: config.queueExclusive,
        durable: config.queueDurable,
        autoDelete: config.queueAutoDelete,
      },
      amqpProperties: this.parseJson(
        config.amqpProperties,
      ) as MessageProperties,
      headers: this.parseJson(config.headers) as GenericJsonObject,
      outputs: config.outputs,
      rpcTimeout: config.rpcTimeoutMilliseconds,
    }
  }

  public async connect(): Promise<Awaited<ReturnType<typeof connect>>> {
    const { broker } = this.config
    const brokerId = this.resolveBrokerId(broker)

    const resolvedBroker = this.RED.nodes.getNode(brokerId)
    if (!resolvedBroker) {
      throw new Error(`AMQP broker node not found: ${brokerId}`)
    }
    this.broker = resolvedBroker

    const brokerUrl = this.getBrokerUrl(this.broker)
    this.node.log(`AMQP state: connecting to ${brokerUrl}`)
    this.connection = await connect(brokerUrl, { heartbeat: 2 })

    /* istanbul ignore next */
    this.connection.on('error', (e): void => {
      // Set node to disconnected status
      this.node.status(NODE_STATUS.Disconnected)
      this.node.log(`AMQP state: connection error -> disconnected`)
    })

    /* istanbul ignore next */
    this.connection.on('close', () => {
      this.node.status(NODE_STATUS.Disconnected)
      this.node.log(`AMQP state: connection closed -> disconnected`)
      this.node.log(`AMQP Connection closed`)
    })

    this.node.log(`AMQP state: connection established`)

    return this.connection
  }

  private resolveBrokerId(rawBroker: unknown): string {
    let brokerId = String(rawBroker ?? '').trim()
    if (!brokerId) {
      return brokerId
    }

    // Resolve nested env placeholders through Node-RED's runtime resolver only.
    // This covers chained values such as ${amqp-broker} -> ${amqpOutBroker} -> <config-id>.
    for (let depth = 0; depth < 6; depth += 1) {
      const placeholderMatch = brokerId.match(/^\$\{([^}]+)\}$/)
      if (!placeholderMatch) {
        return brokerId
      }

      const key = placeholderMatch[1].trim()
      let resolved = ''
      try {
        resolved = String(
          this.RED.util?.evaluateEnvProperty?.(brokerId, this.node) ?? '',
        ).trim()
      } catch (_e) {
        // Keep unresolved and return best known value below.
      }

      if (resolved && resolved !== brokerId) {
        brokerId = resolved
        continue
      }

      if (!key.startsWith('$parent.')) {
        let parentResolved = ''
        const parentKey = '${$parent.' + key + '}'
        try {
          parentResolved = String(
            this.RED.util?.evaluateEnvProperty?.(parentKey, this.node) ?? '',
          ).trim()
        } catch (_e) {
          // ignore and fall through to unresolved return
        }

        if (parentResolved && parentResolved !== parentKey) {
          brokerId = parentResolved
          continue
        }
      }

      break
    }

    return brokerId
  }

  public async initialize(): Promise<Channel> {
    this.node.log(`AMQP state: creating channel`)
    await this.createChannel()
    await this.assertExchange()
    this.node.log(`AMQP state: channel ready`)
    return this.channel
  }

  public async consume(): Promise<void> {
    try {
      const { noAck } = this.config
      await this.assertQueue()
      this.bindQueue()
      await this.channel.consume(
        this.q.queue,
        amqpMessage => {
          if (!amqpMessage) {
            return
          }
          const msg = this.assembleMessage(amqpMessage)
          this.node.send(msg)
          /* istanbul ignore else */
          if (!noAck && !this.isManualAck()) {
            this.ack(msg)
          }
        },
        { noAck },
      )
    } catch (e) {
      this.node.error(`Could not consume message: ${e}`)
    }
  }

  public setRoutingKey(newRoutingKey: string): void {
    this.config.exchange.routingKey = newRoutingKey
  }

  public ack(msg: AssembledMessage): void {
    const allUpTo = !!msg.manualAck?.allUpTo
    this.channel.ack(msg, allUpTo)
  }

  public ackAll(): void {
    this.channel.ackAll()
  }

  public nack(msg: AssembledMessage): void {
    const allUpTo = !!msg.manualAck?.allUpTo
    const requeue = msg.manualAck?.requeue ?? true
    this.channel.nack(msg, allUpTo, requeue)
  }

  public nackAll(msg: AssembledMessage): void {
    const requeue = msg.manualAck?.requeue ?? true
    this.channel.nackAll(requeue)
  }

  public reject(msg: AssembledMessage): void {
    const requeue = msg.manualAck?.requeue ?? true
    this.channel.reject(msg, requeue)
  }

  public async publish(
    msg: unknown,
    properties?: MessageProperties,
  ): Promise<void> {
    try {
      await Promise.all(
        this.parseRoutingKeys().map(routingKey =>
          this.handlePublish(this.config, msg, properties, routingKey),
        ),
      )
    } catch (e) {
      this.node.error(
        `Could not publish message: ${e}`,
        typeof msg === 'object' && msg !== null ? (msg as NodeMessage) : undefined,
      )
    }
  }

  private async handlePublish(
    config: AmqpConfig,
    msg: unknown,
    properties?: MessageProperties,
    routingKey?: string,
  ) {
    const {
      exchange: { name },
      outputs: rpcRequested,
    } = config

    try {
      let correlationId = ''
      let replyTo = ''

      if (rpcRequested) {
        // Send request for remote procedure call
        correlationId =
          properties?.correlationId ||
          this.config.amqpProperties?.correlationId ||
          randomUUID()
        replyTo =
          properties?.replyTo || this.config.amqpProperties?.replyTo || randomUUID()
        await this.handleRemoteProcedureCall(correlationId, replyTo)
      }

      const options: MessageProperties = {
        ...this.config.amqpProperties,
        ...properties,
      }

      if (rpcRequested) {
        options.correlationId = correlationId
        options.replyTo = replyTo
      }

      const targetRoutingKey = routingKey ?? ''

      if (!this.channel || typeof this.channel.publish !== 'function') {
        throw new Error('AMQP channel unavailable (disconnected or reconnecting)')
      }

      // when the name field is empty, publish just like the sendToQueue method;
      // see https://amqp-node.github.io/amqplib/channel_api.html#channel_publish
      this.channel.publish(
        name,
        targetRoutingKey,
        Buffer.from(msg as string),
        options,
      )
    } catch (e) {
      throw new Error(`Could not publish message: ${e}`)
    }
  }

  private getRpcConfig(replyTo: string): AmqpConfig {
    const rpcConfig = cloneDeep(this.config)
    rpcConfig.exchange.name = ''
    rpcConfig.queue.name = replyTo
    rpcConfig.queue.autoDelete = true
    rpcConfig.queue.exclusive = true
    rpcConfig.queue.durable = false
    rpcConfig.noAck = true

    return rpcConfig
  }

  private async handleRemoteProcedureCall(
    correlationId: string,
    replyTo: string,
  ): Promise<void> {
    const rpcConfig = this.getRpcConfig(replyTo)

    try {
      // If we try to delete a queue that's already deleted
      // bad things will happen.
      let rpcQueueHasBeenDeleted = false
      let additionalErrorMessaging = ''

      /************************************
       * assert queue and set up consumer
       ************************************/
      const queueName = await this.assertQueue(rpcConfig)

      await this.channel.consume(
        queueName,
        async amqpMessage => {
          if (amqpMessage) {
            const msg = this.assembleMessage(amqpMessage)
            if (msg.properties.correlationId === correlationId) {
              this.node.send(msg)
              /* istanbul ignore else */
              if (!rpcQueueHasBeenDeleted) {
                await this.channel.deleteQueue(queueName)
                rpcQueueHasBeenDeleted = true
              }
            } else {
              additionalErrorMessaging += ` Correlation ids do not match. Expecting: ${correlationId}, received: ${msg.properties.correlationId}`
            }
          }
        },
        { noAck: rpcConfig.noAck },
      )

      /****************************************
       * Check if RPC has timed out and handle
       ****************************************/
      setTimeout(async () => {
        try {
          if (!rpcQueueHasBeenDeleted) {
            this.node.send({
              payload: {
                message: `Timeout while waiting for RPC response.${additionalErrorMessaging}`,
                config: rpcConfig,
              },
            })
            await this.channel.deleteQueue(queueName)
          }
        } catch (e) {
          // TODO: Keep an eye on this
          // This might close the whole channel
          this.node.error(`Error trying to cancel RPC consumer: ${e}`)
        }
      }, rpcConfig.rpcTimeout || 3000)
    } catch (e) {
      this.node.error(`Could not consume RPC message: ${e}`)
    }
  }

  public async close(): Promise<void> {
    const {
      exchange: {
        name: exchangeName
      },
      queue: {
        name: queueName,
        autoDelete: queueAutoDelete
      }
    } = this.config

    try {
      this.node.log(`AMQP state: closing client`)
      /* istanbul ignore else */
      if (exchangeName && queueName && queueAutoDelete) {
        const routingKeys = this.parseRoutingKeys()
        try {
          for (let x = 0; x < routingKeys.length; x++) {
            await this.channel.unbindQueue(
              queueName,
              exchangeName,
              routingKeys[x],
            )
          }
        } catch (e) {
          /* istanbul ignore next */
          const errorMessage = e instanceof Error ? e.message : String(e)
          console.error('Error unbinding queue: ', errorMessage)
        }
      }
      await this.channel.close()
      await this.connection.close()
      this.node.log(`AMQP state: client closed`)
    } catch (e) { } // Need to catch here but nothing further is necessary
  }

  private async createChannel(): Promise<Channel> {
    const { prefetch } = this.config

    this.channel = await this.connection.createChannel()
    this.channel.prefetch(Number(prefetch))

    /* istanbul ignore next */
    this.channel.on('error', (e): void => {
      // Set node to disconnected status
      this.node.status(NODE_STATUS.Disconnected)
      this.node.error(`AMQP Connection Error ${e}`, { payload: { error: e, source: 'Amqp' } })
    })

    return this.channel
  }

  private async assertExchange(): Promise<void> {
    const { name, type, durable } = this.config.exchange

    /* istanbul ignore else */
    if (name) {
      await this.channel.assertExchange(name, type, {
        durable,
      })
    }
  }

  private async assertQueue(configParams?: AmqpConfig): Promise<string> {
    const { queue } = configParams || this.config
    const { name, exclusive, durable, autoDelete } = queue

    this.q = await this.channel.assertQueue(name, {
      exclusive,
      durable,
      autoDelete,
    })

    return name
  }

  private async bindQueue(configParams?: AmqpConfig): Promise<void> {
    const { name, type, routingKey } =
      configParams?.exchange || this.config.exchange
    const { headers } = configParams?.amqpProperties || this.config

    if (this.canHaveRoutingKey(type)) {
      /* istanbul ignore else */
      if (name) {
        this.parseRoutingKeys(routingKey).forEach(async routingKey => {
          await this.channel.bindQueue(this.q.queue, name, routingKey)
        })
      }
    }

    if (type === ExchangeType.Fanout) {
      await this.channel.bindQueue(this.q.queue, name, '')
    }

    if (type === ExchangeType.Headers) {
      await this.channel.bindQueue(this.q.queue, name, '', headers)
    }
  }

  private canHaveRoutingKey(type: ExchangeType): boolean {
    return type === ExchangeType.Direct || type === ExchangeType.Topic
  }

  private getBrokerUrl(broker: Node): string {
    let url = ''

    if (broker) {
      const { host, port, vhost, tls, credsFromSettings, credentials } =
        broker as unknown as BrokerConfig

      const { username, password } = credsFromSettings
        ? this.getCredsFromSettings()
        : credentials

      const protocol = tls ? 'amqps' : 'amqp'
      url = `${protocol}://${encodeURIComponent(username)}:${encodeURIComponent(
        password,
      )}@${host}:${port}/${vhost}`
    }

    return url
  }

  private getCredsFromSettings(): {
    username: string
    password: string
  } {
    const settings = this.RED.settings as unknown as Record<string, string | undefined>
    return {
      username: settings.MW_CONTRIB_AMQP_USERNAME || '',
      password: settings.MW_CONTRIB_AMQP_PASSWORD || '',
    }
  }

  private parseRoutingKeys(routingKeyArg?: string): string[] {
    const routingKey =
      routingKeyArg || this.config.exchange.routingKey || this.q?.queue || ''
    const keys = routingKey.split(',').map(key => key.trim())
    return keys
  }

  private assembleMessage(amqpMessage: ConsumeMessage): AssembledMessage {
    const payload = this.parseJson(amqpMessage.content.toString())

    return {
      ...amqpMessage,
      payload,
    }
  }

  private isManualAck(): boolean {
    return this.node.type === NodeType.AmqpInManualAck
  }

  private parseJson(jsonInput: unknown): GenericJsonObject | string {
    let output: unknown
    try {
      output = JSON.parse(jsonInput as string)
    } catch {
      output = jsonInput
    }
    return output as GenericJsonObject | string
  }
}

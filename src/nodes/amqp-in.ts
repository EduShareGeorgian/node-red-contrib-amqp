import { NodeRedApp, EditorNodeProperties } from 'node-red'
import { NODE_STATUS } from '../constants'
import { AmqpInNodeDefaults, AmqpOutNodeDefaults, ErrorType, NodeType, ErrorLocationEnum } from '../types'
import Amqp from '../Amqp'
import { processReconnect } from '../common/amqp-utils'

module.exports = function (RED: NodeRedApp): void {
  function AmqpIn(config: EditorNodeProperties): void {
    let reconnectTimeout: NodeJS.Timeout
    let reconnect = null;
    let connection = null;
    let channel = null;

    RED.events.once('flows:stopped', () => {
      clearTimeout(reconnectTimeout)
    })

    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    RED.nodes.createNode(this, config)
    this.status(NODE_STATUS.Disconnected)

    const configAmqp: AmqpInNodeDefaults & AmqpOutNodeDefaults = config;

    // Enhancement: If no queue name, do not setup AMQP
    if (!configAmqp.queueName || String(configAmqp.queueName).trim() === '') {
      this.status({ fill: 'red', shape: 'ring', text: 'No queue name' });
      this.warn('AMQP not initialized: queue name is missing in configuration.');
      return;
    }

    const amqp = new Amqp(RED, this, configAmqp)

    const reconnectOnError = configAmqp.reconnectOnError;

    const inputListener = async (msg, _, done) => {
      // Then handle reconnect if needed.
      await processReconnect(msg, reconnect, done)
    }

    // receive input reconnectCall
    this.on('input', inputListener)
    // When the node is re-deployed
    this.on('close', async (done: () => void): Promise<void> => {
      await amqp.close()
      done && done()
    })
    

    async function initializeNode(nodeIns) {
      reconnect = async () => {
        try{
        // check the channel and clear all the event listener
        if (channel && channel.removeAllListeners) {
          channel.removeAllListeners()
          if(connection.channel.status === 'open') {
            connection.close();
          }
          channel = null;
        }

        // check the connection and clear all the event listener
        if (connection && connection.removeAllListeners) {
          connection.removeAllListeners()
          if(connection.channel.status === 'open') {
            connection.close();
          }
          connection = null;
        }
      }
      catch(e){}
        // always clear timer before set it;
        clearTimeout(reconnectTimeout);
        reconnectTimeout = setTimeout(() => {
          try {
            initializeNode(nodeIns)
          } catch (e) {
            reconnect()
          }
        }, 2000)
      }

      try {
        connection = await amqp.connect()

        // istanbul ignore else
        if (connection) {
          channel = await amqp.initialize()
          await amqp.consume()

          // When the connection goes down
          connection.on('close', async e => {
            e && (await reconnect())
          })

          // When the connection goes down
          connection.on('error', async e => {
            reconnectOnError && (await reconnect())
            nodeIns.error(`Connection error ${e}`, { payload: { error: e, location: ErrorLocationEnum.ConnectionErrorEvent } })
          })

          // When the channel goes down
          channel.on('close', async () => {
            await reconnect()
          })

          // When the channel goes down
          channel.on('error', async (e) => {
            reconnectOnError && (await reconnect())
            nodeIns.error(`Channel error ${e}`, { payload: { error: e, location: ErrorLocationEnum.ChannelErrorEvent } })
          })

          nodeIns.status(NODE_STATUS.Connected)
        }
      } catch (e) {
        reconnectOnError && (await reconnect())
        if (e.code === ErrorType.InvalidLogin) {
          nodeIns.status(NODE_STATUS.Invalid)
          nodeIns.error(`AmqpIn() Could not connect to broker ${e}`, { payload: { error: e, location: ErrorLocationEnum.ConnectError } })
        } else {
          nodeIns.status(NODE_STATUS.Error)
          nodeIns.error(`AmqpIn() ${e}`, { payload: { error: e, source: 'ConnectionError' } })
        }
      }
    }

    // call
    initializeNode(this);
  }
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  RED.nodes.registerType(NodeType.AmqpIn, AmqpIn)
}

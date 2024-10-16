import { NodeRedApp, EditorNodeProperties } from 'node-red'
import { NODE_STATUS } from '../constants'
import { AmqpInNodeDefaults, AmqpOutNodeDefaults, ErrorLocationEnum, ErrorType, NodeType } from '../types'
import Amqp from '../Amqp'
import { MessageProperties } from 'amqplib'

module.exports = function (RED: NodeRedApp): void {
  function AmqpOut(
    config: EditorNodeProperties & {
      exchangeRoutingKey: string
      exchangeRoutingKeyType: string
      amqpProperties: string
    },
  ): void {
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

    const amqp = new Amqp(RED, this, configAmqp)

    const reconnectOnError = configAmqp.reconnectOnError;


    // handle input event;
    const inputListener = async (msg, _, done) => {
      const { payload, routingKey, properties: msgProperties } = msg
      const {
        exchangeRoutingKey,
        exchangeRoutingKeyType,
        amqpProperties,
      } = config

      // message properties override config properties
      let properties: MessageProperties
      try {
        properties = {
          ...JSON.parse(amqpProperties),
          ...msgProperties,
        }
      } catch (e) {
        properties = msgProperties
      }

      switch (exchangeRoutingKeyType) {
        case 'msg':
        case 'flow':
        case 'global':
          amqp.setRoutingKey(
            RED.util.evaluateNodeProperty(
              exchangeRoutingKey,
              exchangeRoutingKeyType,
              this,
              msg,
            ),
          )
          break
        case 'jsonata':         
            function evaluateJSONataasPromise(exchangeRoutingKey: any, msg: any, amqp: any): Promise<void> {
              return new Promise((resolve, reject) => {
                RED.util.evaluateJSONataExpression(
                  RED.util.prepareJSONataExpression(exchangeRoutingKey, this),
                  msg,
                  function (er, val) {
                    if (er) {
                      reject(er);
                    } else {
                      amqp.setRoutingKey(val);
                      resolve();
                    }
                  }
                );
              });
            }
            await evaluateJSONataasPromise(exchangeRoutingKey, msg, amqp);        
          break
        case 'str':
        default:
          if (routingKey) {
            // if incoming payload contains a routingKey value
            // override our string value with it.

            // Superfluous (and possibly confusing) at this point
            // but keeping it to retain backwards compatibility
            amqp.setRoutingKey(routingKey)
          }
          break
      }

      if (!!properties?.headers?.doNotStringifyPayload) {
        amqp.publish(payload, properties)
      } else {
        amqp.publish(JSON.stringify(payload), properties)
      }

      done && done()
    }

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
      catch(e){
      }
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
        const connection = await amqp.connect()

        // istanbul ignore else
        if (connection) {
          channel = await amqp.initialize()

          // When the server goes down
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

          // When the channel error occur
          channel.on('error', async e => {
            reconnectOnError && (await reconnect())
            nodeIns.error(`Channel error ${e}`, { payload: { error: e, location: ErrorLocationEnum.ChannelErrorEvent } })
          })
          
          nodeIns.status(NODE_STATUS.Connected)
        }
      } catch (e) {
        reconnectOnError && (await reconnect())
        if (e.code === ErrorType.InvalidLogin) {
          nodeIns.status(NODE_STATUS.Invalid)
          nodeIns.error(`AmqpOut() Could not connect to broker ${e}`, { payload: { error: e, location: ErrorLocationEnum.ConnectError } })
        } else {
          nodeIns.status(NODE_STATUS.Error)
          nodeIns.error(`AmqpOut() ${e}`, { payload: { error: e, location: ErrorLocationEnum.ConnectError } })
        }
      }
    }

    // call
    initializeNode(this);
  }
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  RED.nodes.registerType(NodeType.AmqpOut, AmqpOut)
}

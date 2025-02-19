export async function handleAck(msg: any, amqp: any) {
	// If manualAck instructions are given, perform the corresponding action. Otherwise, do a default ack.
	if (msg.manualAck) {
		const ackMode = msg.manualAck.ackMode;
		switch (ackMode) {
			case 'AckAll':
				amqp.ackAll();
				break;
			case 'Nack':
				amqp.nack(msg);
				break;
			case 'NackAll':
				amqp.nackAll(msg);
				break;
			case 'Reject':
				amqp.reject(msg);
			case 'Close':
				await amqp.close();
				return;
			case 'Ack':
			default:
				amqp.ack(msg);
				break;
		}
	} else {
		amqp.ack(msg);
	}
}

export async function processReconnect(msg: any, reconnect: any, done: Function) {
    // Call reconnect if the message payload has reconnectCall set.
    if (msg.payload && msg.payload.reconnectCall && typeof reconnect === 'function') {
        await reconnect();
    }
    done && done();
}

/**
 * @fileOverview Basic reading of RF tags. This is the main starting point.
 *
 * This file was created at Openovate Labs.
 *
 * @author Billie Dee R. Ang <billieang24@gmail.com>
 * @author Jeriel Mari E. Lopez <jerielmari@gmail.com>
 */


'use strict';

// ====================
// Includes
// ====================

var messageC = require('./LLRPMessagesConstants.js');
var parameterC = require('./LLRPParametersConstants.js');
var LLRPMessage = require('./LLRPMessages.js');
var decode = require('./decode.js');

var net = require('net');
var EventEmitter = require('events').EventEmitter;

var llrpMain = function (config) {

	// ====================
	// Variables
	// ====================

	var ipaddress = config.ipaddress || '192.168.0.30';
	var port = config.port || 5084;
	var log = config.log || false;

	var socket = new net.Socket();
	var self = this;
	var client = null;

	//Defined message buffers. Brute force, I know I know.
	var bSetReaderConfig = new Buffer('040300000010000000000000e2000580', 'hex');
	var bEnableEventsAndReport = new Buffer('04400000000a00000000', 'hex');
	var bAddRoSpec = new Buffer('04140000005d0000000000b1005300000001000000b2001200b300050000b60009000000000000b700180001000000b8000901000003e800ba000700010100ed001f01000000ee000bffc0015c0005c003ff000d000067ba0000008e01', 'hex');
	var bEnableRoSpec = new Buffer('04180000000e0000000000000001', 'hex');
	var bStartRoSpec = new Buffer('04160000000e0000000000000001', 'hex');
	var bKeepaliveAck = new Buffer('04480000000a00000000', 'hex');
	var bStopRoSpec = new Buffer(makeMessage(23, 0, [{ value: 1, bits: 32 }]), 'hex')
	var bCloseConnection = new Buffer(makeMessage(14, 0), 'hex');
	var bImpinjEnableExtensions = new Buffer(makeMessage(1023, 0, [
		{ value: 25882, bits: 32 },
		{ value: 21, bits: 8 },
		{ value: 0, bits: 32 }
	]), 'hex');

	// ====================
	// Public Methods
	// ====================

	this.disconnect = function () {
		writeMessage(client, bStopRoSpec);
		writeMessage(client, bCloseConnection);
	}

	this.connect = function () {
		// timeout after 60 seconds.
		socket.setTimeout(60000, function () {
			if (log) {
				console.log('Connection timeout');
			}
			process.nextTick(function () {
				self.emit('timeout', new Error('Connection timeout'));
			});
		});

		// connect with reader
		client = socket.connect(port, ipaddress, function () {
			if (log) {
				console.log('Connected to: ' + ipaddress + ':' + port);
			}
		});

		// whenever reader sends data.
		client.on('data', function (data) {
			process.nextTick(function () {
				//check if there is data.
				if (data === undefined) {
					if (log) {
						console.log('Undefined data returned by the rfid.');
					}
				}

				//decoded message(s), passable to LLRPMessage class.
				var messagesKeyValue = decode.message(data);

				//loop through the message.
				for (var index in messagesKeyValue) {
					//possible we have more than 1 message in a reply.
					var message = new LLRPMessage(messagesKeyValue[index]);
					if (log) {
						console.log('Receiving: ' + message.getTypeName());
					}

					//Check message type and send appropriate response.
					//This send-receive is the most basic form to read a tag in llrp.
					const messageType = message.getType();
					switch (messageType) {
						case messageC.RO_ACCESS_REPORT:
							handleROAccessReport(message);
							break;
						case messageC.KEEPALIVE:
							//send KEEPALIVE_ACK
							writeMessage(client, bKeepaliveAck);
							break;
						case messageC.ERROR_MESSAGE:
							break;
						default:
							break;
					}
					handleMessage(message);
					self.emit(messageType, message);
				}
			});
		});

		//the reader or client has ended the connection.
		client.on('end', function () {
			//the session has ended
			if (log) {
				console.log('client disconnected');
			}
			process.nextTick(function () {
				self.emit('disconnect', new Error('Client disconnected.'));
			});
		});

		//cannot connect to the reader other than a timeout.
		client.on('error', function (err) {
			//error on the connection
			if (log) {
				console.log(err);
			}
			process.nextTick(function () {
				self.emit('error', err);
			});
		});
	};

	/**
	 * Use this message to send LLRP messages
	 * 
	 * SET_READER_CONFIG only supports ResetToFactoryDefaults
	 * 
	 * @param {string} message LLRP Messages Ex. START_ROSPEC, ENABLE_ROSPEC
	 * @param {Object | Object[]} data Optional extra data for the messages. Can be an array or one object
	 * @return {Promise} returns the response message
	 * 
	 */
	this.sendMessage = function (message, data = null) {
		const promise = new Promise((resolve, reject) => {
			let response = 0;
			let messageBuffer = undefined;
			switch (messageC[message]) {
				case messageC.ADD_ROSPEC:
					break;
				case messageC.DELETE_ROSPEC:
					if (data.ROSpecID !== undefined) {
						messageBuffer = Buffer.from(makeMessage(21, 0, [{ value: data.ROSpecID, bits: 32 }] ), 'hex');
						response = messageC.DELETE_ROSPEC_RESPONSE;
					}
					break;
				case messageC.START_ROSPEC:
					if (data.ROSpecID !== undefined) {
						messageBuffer = Buffer.from(makeMessage(22, 0, [{ value: data.ROSpecID, bits: 32 }] ), 'hex');
						response = messageC.START_ROSPEC_RESPONSE;
					}
					break;
				case messageC.STOP_ROSPEC:
					if (data.ROSpecID !== undefined) {
						messageBuffer = Buffer.from(makeMessage(23, 0, [{ value: data.ROSpecID, bits: 32 }] ), 'hex');
						response = messageC.STOP_ROSPEC_RESPONSE;
					}
					break;
				case messageC.ENABLE_ROSPEC:
					if (data.ROSpecID !== undefined) {
						messageBuffer = Buffer.from(makeMessage(24, 0, [{ value: data.ROSpecID, bits: 32 }] ), 'hex');
						response = messageC.ENABLE_ROSPEC_RESPONSE;
					}
					break;
				case messageC.DISABLE_ROSPEC:
					if (data.ROSpecID !== undefined) {
						messageBuffer = Buffer.from(makeMessage(25, 0, [{ value: data.ROSpecID, bits: 32 }] ), 'hex');
						response = messageC.DISABLE_ROSPEC_RESPONSE;
					}
					break;
				case messageC.SET_READER_CONFIG:
					if (data.ResetToFactoryDefaults !== undefined) {
						messageBuffer = Buffer.from(makeMessage(3, 0, [{ value: parseInt(data.ResetToFactoryDefaults), bits: 1 }, { value: 0, bits: 7 }] ), 'hex');
						response = messageC.SET_READER_CONFIG_RESPONSE;
					}
					break;
				case message.CUSTOM_MESSAGE:
					if (data !== null) {
						messageBuffer = Buffer.from(makeMessage(1023, 0, data), 'hex');
						response = messageC.CUSTOM_MESSAGE_RESPONSE;
					}
					break;
				default:
					break;
			}

			if (response === 0) {
				return;
			}

			writeMessage(client, messageBuffer);

			self.on(response, (message) => {
				resolve(message)
			});
		});

		return promise;
	}

	// ====================
	// Helper Methods
	// ====================

	/**
	 * Helper function to make binary encodings
	 * 
	 * @example <caption>Example of usage</caption>
	 * const hex = makeMessage(21, 0, [{ value: 1, bits: 32 }])
	 * 
	 * @param {int} messageType Messagetype
	 * @param {int} messageId Messageid. Can be anything ex. 0
	 * @param {Object[]} [messageData] Optional Array of object in the form of ex. {value: 1, bits: 32}
	 * @param {int} messageData[].value Data value
	 * @param {int} messageData[].bits Data size for the value
 	 * @returns {string} Returns a hex string of the binary encoding
	 */
	function makeMessage(messageType, messageId, messageData = null) {
		const rsvd = "000";
		const ver = "001";

		const type = messageType.toString(2).padStart(10, "0");
		const id = messageId.toString(2).padStart(32, "0");

		let data = '';

		if (messageData !== null) {
			for (let i = 0; i < messageData.length; i++) {
				const tmpData = messageData[i].value.toString(2).padStart(messageData[i].bits, '0');
				data = data + tmpData;
			}
		}

		let length = (rsvd.length + ver.length + type.length + id.length + data.length + 32) / 8;
		length = length.toString(2).padStart(32, "0");

		const message = BigInt('0b' + rsvd + ver + type + length + id + data).toString(16);

		return '0' + message;
	}

	function handleMessage(message) {
		var parametersKeyValue = decode.parameter(message.getParameter());
		if (log) {
			console.log(parametersKeyValue);
		}
	}

	function handleReaderNotification(message) {
		var parametersKeyValue = decode.parameter(message.getParameter());

		parametersKeyValue.forEach(function (decodedParameters) {
			if (decodedParameters.type === parameterC.ReaderEventNotificationData) {
				var subParameters = mapSubParameters(decodedParameters);
				console.log(subParameters);
			}
		});
	}

	function handleROAccessReport(message) {
		process.nextTick(function () {
			//read Parameters
			//this contains the TagReportData
			var parametersKeyValue = decode.parameter(message.getParameter());
			if (parametersKeyValue) {
				parametersKeyValue.forEach(function (decodedParameters) {
					//read TagReportData Parameter only.
					if (decodedParameters.type === parameterC.TagReportData) {

						var subParameters = mapSubParameters(decodedParameters);

						var tag = {
							tagID: null,
							tagSeenCount: 0
						};

						if (typeof subParameters[parameterC.EPC96] !== 'undefined') {
							tag.tagID = subParameters[parameterC.EPC96].toString('hex');
						}

						if (typeof subParameters[parameterC.TagSeenCount] !== 'undefined') {
							tag.tagSeenCount = subParameters[parameterC.TagSeenCount].readUInt16BE(0);
						}

						if (log) {
							//console.log('ID: ' + tag.tagID + '\tRead count: ' + tag.tagSeenCount);
						}

						if (tag.tagID) {
							process.nextTick(function () {
								self.emit('didSeeTag', tag);
							});
						}
					}
				});
			}
		});
	}

	/**
	 * Send message to rfid and write logs.
	 *
	 * @param  {[type]} client  rfid connection.
	 * @param  {Buffer} buffer  to write.
	 */
	function writeMessage(client, buffer) {
		process.nextTick(function () {
			if (log) {
				console.log('Sending ' + getMessageName(buffer));
			}
			client.write(buffer);
		});
	}

	/**
	 * Gets the name of the message using the encoded Buffer.
	 *
	 * @param  {Buffer} data
	 * @return {string} name of the message
	 */
	function getMessageName(data) {
		//get the message code
		//get the name from the constants.
		return messageC[getMessage(data)];
	}

	/**
	 * Gets the message type using the encoded Buffer.
	 *
	 * @param  {Buffer} data
	 * @return {int} corresponding message type code.
	 */
	function getMessage(data) {
		//message type resides on the first 2 bits of the first octet
		//and 8 bits of the second octet.
		return (data[0] & 3) << 8 | data[1];
	}

	/**
	 * Sends a START_ROSPEC message if it has not been sent.
	 *
	 * @return {Int} returns the length written or false if there was an error writing.
	 */
	function sendStartROSpec() {
		//START_ROSPEC has not been sent.
		if (!isStartROSpecSent) {
			isStartROSpecSent = true; //change state of flag.
			writeMessage(client, bStartRoSpec); //send START_ROSPEC
		}
	}

	/**
	 * Simple helper function to map key value pairs using the typeName and value.
	 * Probably should be built in with LLRPParameter class.
	 *
	 * @param  {Object} decodedParameters  object returned from decode.parameter.
	 * @return {Object}  the key value pair.
	 */
	function mapSubParameters(decodedParameters) {
		//create an object that will hold a key value pair.
		var properties = {};
		var subP = decodedParameters.subParameters;
		for (var tag in subP) {
			//where key is the Parameter type.
			//and value is the Parameter value as Buffer object.
			properties[subP[tag].type] = subP[tag].value;
		}

		return properties;
	}
};

llrpMain.prototype = new EventEmitter();

module.exports = llrpMain;
'use strict';

var llrp = require('./index.js');

var reader = new llrp({
	ipaddress: '192.168.52.172',
	log: true
});

reader.on('timeout', function () {
	console.log('timeout');
});

reader.on('disconnect', function () {
	console.log('disconnect');
});

reader.on('error', function (error) {
	console.log('error: ' + JSON.stringify(error));
});

reader.on('didSeeTag', function (tag) {
	//console.log('TAG: ' + tag.tagID);
});

process.on("SIGINT", async () => {
    reader.disconnect();
});

async function main() {
	reader.connect();
	await reader.sendMessage("DELETE_ROSPEC", { ROSpecID: 0 });
	await reader.sendMessage("SET_READER_CONFIG", { ResetToFactoryDefaults: 1 });
	await reader.sendMessage("ENABLE_ROSPEC", { ROSpecID: 0 });
	await reader.sendMessage("START_ROSPEC", { ROSpecID: 0 });
	await reader.sendMessage("STOP_ROSPEC", { ROSpecID: 0 });
	console.log("END");
}

main();
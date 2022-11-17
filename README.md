llrp-nodejs
==========

Nodejs module to read RFID tags by connecting to a RFID reader through LLRP protocol.

## Status

This fork changes how the module works and adds some extra functionality.

### Authors

Billie Dee R. Ang

Jeriel Mari E. Lopez

### Installation

<del> npm install llrp </del>

### Config

You can provide a config object with the following values:

ipaddress - IP of the RFID reader (default 192.168.0.30) 

port - port of the RFID reader (default 5084)

### Example

```

var llrp = require('llrp');

var reader = new llrp({
	ipaddress: '192.168.0.143'
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
	console.log('TAG: ' + tag.tagID);
});

async function main() {
	reader.connect();
	await reader.sendMessage("DELETE_ROSPEC", { ROSpecID: 0 });
	await reader.sendMessage("SET_READER_CONFIG", { ResetToFactoryDefaults: 1 });
}

```

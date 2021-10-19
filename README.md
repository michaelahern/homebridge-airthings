# homebridge-airthings

[![npm](https://badgen.net/npm/v/homebridge-airthings)](https://www.npmjs.com/package/homebridge-airthings)
[![npm](https://badgen.net/npm/dt/homebridge-airthings)](https://www.npmjs.com/package/homebridge-airthings)
[![Donate](https://badgen.net/badge/Donate/PayPal/green)](https://paypal.me/michaeljahern)

A [Homebridge](https://homebridge.io) plugin for
[Airthings](https://www.airthings.com) air quality monitors via the 
[Airthings Consumer API](https://developer.airthings.com/consumer-api-docs/).

This plugin has been tested with an [Airthings View Plus](https://www.airthings.com/view-plus) acting as a SmartLink Hub with an [Airthings Wave Mini](https://www.airthings.com/wave-mini). It may work with other devices supporting Airthings SmartLink, such as an [Airthings Wave Plus](https://www.airthings.com/wave-plus-archived), with an [Airthings Hub](https://www.airthings.com/hub), but these have not yet been tested. Feedback and testing welcome!

## Homebridge Configuration

Example accessory config in the Homebridge config.json:

```json
"accessories": [
  {
    "accessory": "Airthings",
    "name": "Living Room Airthings View Plus",
    "clientId": "00000000-0000-0000-0000-000000000000",
    "clientSecret": "11111111-1111-1111-1111-111111111111",
    "serialNumber": "2961234567"
  }
]
```

### Configuration Details

Field           	| Description
------------------|------------
**accessory**   	| (required) Must be "Airthings"
**name**					| (required) Name for the device in HomeKit
**clientId**			| (required) API Client ID generated in the [Airthings Dashboard](https://dashboard.airthings.com)
**clientSecret**	| (required) API Client Secret generated in the [Airthings Dashboard](https://dashboard.airthings.com)
**serialNumber**	| (required) Serial number of the device

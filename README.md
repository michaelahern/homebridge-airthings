# homebridge-airthings

[![npm](https://badgen.net/npm/v/homebridge-airthings)](https://www.npmjs.com/package/homebridge-airthings)
[![npm](https://badgen.net/npm/dt/homebridge-airthings)](https://www.npmjs.com/package/homebridge-airthings)
[![License](https://badgen.net/github/license/michaelahern/homebridge-airthings)](LICENSE)
[![Build](https://github.com/michaelahern/homebridge-airthings/actions/workflows/build.yml/badge.svg)](https://github.com/michaelahern/homebridge-airthings/actions/workflows/build.yml)
[![Donate](https://badgen.net/badge/Donate/PayPal/green)](https://paypal.me/michaeljahern)


A [Homebridge](https://homebridge.io) plugin for
[Airthings](https://www.airthings.com) air quality monitors via the 
[Airthings Consumer API](https://developer.airthings.com/consumer-api-docs/).

## Supported Devices

 * [Airthings View Plus](https://www.airthings.com/view-plus)
 * [Airthings Wave Plus](https://www.airthings.com/wave-plus)
 * [Airthings Wave Radon](https://www.airthings.com/wave-radon)
 * [Airthings Wave Mini](https://www.airthings.com/wave-mini)

Note: Airthings Wave devices require an Airthings SmartLink Hub ([Hub](https://www.airthings.com/hub) or [View Plus](https://www.airthings.com/view-plus)) to continuously push measurement data to the Airthings cloud.

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

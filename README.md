# Homebridge Airthings

[![verified-by-homebridge](https://badgen.net/badge/homebridge/verified/purple)](https://github.com/homebridge/homebridge/wiki/Verified-Plugins)
[![npm](https://badgen.net/npm/v/homebridge-airthings)](https://www.npmjs.com/package/homebridge-airthings)
[![npm](https://badgen.net/npm/dt/homebridge-airthings)](https://www.npmjs.com/package/homebridge-airthings)
[![License](https://badgen.net/github/license/michaelahern/homebridge-airthings)](LICENSE)
[![Build](https://github.com/michaelahern/homebridge-airthings/actions/workflows/build.yml/badge.svg)](https://github.com/michaelahern/homebridge-airthings/actions/workflows/build.yml)
[![Donate](https://badgen.net/badge/Donate/PayPal/green)](https://paypal.me/michaeljahern)

A [Homebridge](https://homebridge.io) plugin for
[Airthings](https://www.airthings.com) air quality monitors via the 
[Airthings Consumer API](https://developer.airthings.com/consumer-api-docs/).

## Requirements

 * [Homebridge](https://homebridge.io/)
 * One or more supported [Airthings](https://www.airthings.com/) air quality monitors
 * At least one Airthings SmartLink Hub ([Hub](https://www.airthings.com/hub), [View Plus](https://www.airthings.com/view-plus), [View Pollution](https://www.airthings.com/view-pollution), [View Radon](https://www.airthings.com/view-radon))

### Supported Devices

| Airthings Device                                                     | Serial Number |
| -------------------------------------------------------------------- | ------------- |
| [Airthings View Plus](https://www.airthings.com/view-plus)           | 2960xxxxxx    |
| [Airthings View Pollution](https://www.airthings.com/view-pollution) | 2980xxxxxx    |
| [Airthings View Radon](https://www.airthings.com/view-radon)         | 2989xxxxxx    |
| [Airthings Wave Plus](https://www.airthings.com/wave-plus)           | 2930xxxxxx    |
| [Airthings Wave Radon](https://www.airthings.com/wave-radon)         | 2950xxxxxx    |
| [Airthings Wave Mini](https://www.airthings.com/wave-mini)           | 2920xxxxxx    |

Note: Airthings Wave devices require an Airthings SmartLink Hub ([Hub](https://www.airthings.com/hub) or [View Series](https://www.airthings.com/for-home) device) to continuously push measurement data to the Airthings Cloud.

## Configuration

Example accessory config in the Homebridge config.json:

```json
"accessories": [
  {
    "accessory": "Airthings",
    "name": "Living Room Airthings View Plus",
    "clientId": "00000000-0000-0000-0000-000000000000",
    "clientSecret": "11111111-1111-1111-1111-111111111111",
    "serialNumber": "2960123456"
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

### How to request an Airthings API Client ID & Secret

1. Login to the [Airthings Dashboard](https://dashboard.airthings.com)
2. Navigate to *Integrations*, then *Request API Client*
3. Create a new API Client with the following configuration:
    * Name: Homebridge
    * Resource Scope: read:device:current_values
    * Access Type: confidential
    * Flow Type: Client Credentials (machine-to-machine)
    * Enable: On